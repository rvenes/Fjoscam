import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { app } from 'electron';
import { join } from 'node:path';
import { logToFile } from './logging.js';
import type { CameraStore } from './store.js';
import { buildRtspUrl } from './reolinkClient.js';
import type { BridgeHealth, CameraWithSecret, WebRtcStream } from '../shared/types.js';
import { rtspsEndpoint } from '../shared/validation.js';
import { connectRtsps, RtspsRelay } from './rtspsRelay.js';
import { bridgeDiagnostics } from './bridgeDiagnostics.js';
import { isPlayerUrl } from './playerHealth.js';

const API_PORT = 1984;
const WEBRTC_PORT = 8555;

export class Go2RtcBridge {
  private process: ChildProcess | null = null;
  private started = false;
  private starting: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;
  private recycling: Promise<void> | null = null;
  private closed = false;
  private generation = 0;
  private readySince = 0;
  private recoveryAttempts = 0;
  private recoveryRevision = 0;
  private nextRecovery = 0;
  private recovering: Promise<void> | null = null;
  private lastFailure: BridgeHealth['reason'];
  private readonly registered = new Map<string, { id: string; generation: number }>();
  private readonly relay = new RtspsRelay();
  private readonly revisions = new Map<string, number>();
  private readonly pending = new Map<string, Promise<WebRtcStream>>();
  private readonly probes = new Map<string, AbortController>();
  private readonly password = randomBytes(32).toString('hex');
  private readonly authorization = `Basic ${Buffer.from(`fjoscam:${this.password}`).toString('base64')}`;

  constructor(private readonly store: CameraStore) {}

  isRunning(): boolean { return this.started && this.process !== null; }

  getStream(cameraId: string): Promise<WebRtcStream> {
    // Explicit user operations reset the automatic crash-recovery budget.
    this.resetRecovery();
    return this.queueStream(cameraId);
  }

  private resetRecovery(): void {
    this.recoveryRevision += 1;
    this.recoveryAttempts = 0;
    this.nextRecovery = 0;
  }

  private queueStream(cameraId: string): Promise<WebRtcStream> {
    const revision = this.revisions.get(cameraId) ?? 0;
    const previous = this.pending.get(cameraId);
    const next = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() => this.registerStream(cameraId, revision));
    this.pending.set(cameraId, next);
    const cleanup = () => { if (this.pending.get(cameraId) === next) this.pending.delete(cameraId); };
    void next.then(cleanup, cleanup);
    return next;
  }

  invalidateCamera(cameraId: string): Promise<void> {
    const hadStream = this.registered.has(safeStreamName(cameraId)) || this.pending.has(cameraId) || this.probes.has(cameraId);
    this.revisions.set(cameraId, (this.revisions.get(cameraId) ?? 0) + 1);
    this.probes.get(cameraId)?.abort();
    this.relay.revoke(cameraId);
    this.registered.delete(safeStreamName(cameraId));
    return hadStream ? this.recycle() : Promise.resolve();
  }

  releaseAll(): Promise<void> {
    const ids = new Set([...this.pending.keys(), ...this.probes.keys(), ...[...this.registered.values()].map((entry) => entry.id)]);
    if (!ids.size) return this.recycle();
    const work = [...ids].map((id) => this.invalidateCamera(id));
    return Promise.all(work).then(() => undefined);
  }

  private recycle(): Promise<void> {
    if (this.closed) return this.stopping ?? Promise.resolve();
    if (this.recycling) return this.recycling;
    this.resetRecovery();
    this.started = false;
    this.recycling = Promise.resolve().then(async () => {
      // Do not wait on stream requests: new ones wait for this barrier. A
      // start already in filesystem/readiness work observes recycling below.
      await this.starting?.catch(() => undefined);
      const child = this.process;
      if (child) await terminateChild(child);
      if (this.process === child) this.process = null;
      this.started = false;
    }).finally(() => { this.recycling = null; });
    return this.recycling;
  }

  observePlayback(pageUrl: string): BridgeHealth {
    const status = (state: BridgeHealth['state'], reason = this.lastFailure): BridgeHealth =>
      ({ state, generation: this.generation, attempts: this.recoveryAttempts,
        retryInMs: state === 'recovering' && !this.recovering ? Math.max(0, this.nextRecovery - Date.now()) : 0,
        ...(reason ? { reason } : {}) });
    if (this.closed) return status('stopped');
    const known = isPlayerUrl(pageUrl) ? this.registered.get(new URL(pageUrl).searchParams.get('src')!) : undefined;
    if (!known) return status('failed', 'stream-invalidated');
    if (this.isRunning() && known.generation === this.generation) {
      // A short-lived successful restart must not replenish a crash loop.
      if (Date.now() - this.readySince >= 60_000) this.recoveryAttempts = 0;
      return status('running', undefined);
    }
    if (this.recovering || this.starting) return status('recovering');
    if (this.recoveryAttempts >= 5) return status('failed');
    if (Date.now() < this.nextRecovery) return status('recovering');
    this.recoveryAttempts += 1;
    const recoveryRevision = this.recoveryRevision;
    // Health polling from an active view drives recovery. No timer can wake a
    // disconnected/closed application, and no unknown stream triggers login.
    this.recovering = this.queueStream(known.id).then(() => undefined, () => {
      this.lastFailure ??= 'restart-failed';
    }).finally(() => {
      if (recoveryRevision === this.recoveryRevision) this.nextRecovery = Date.now() + Math.min(30_000, 1000 * 2 ** this.recoveryAttempts);
      this.recovering = null;
    });
    return status('recovering');
  }

  private async registerStream(cameraId: string, revision: number): Promise<WebRtcStream> {
    const checkCurrent = () => {
      if (this.closed) throw new Error('go2rtc bridge is stopping.');
      if ((this.revisions.get(cameraId) ?? 0) !== revision) throw new Error('Camera settings changed. Open the stream again.');
    };
    checkCurrent();
    await logBridge(`get stream camera=${cameraId}`);
    const camera = await this.store.getCameraWithSecret(cameraId);
    checkCurrent();
    if (camera.kind === 'panasonic') throw new Error('Panasonic cameras use MJPEG playback.');
    await this.start();
    checkCurrent();
    const child = this.process;
    const streamName = safeStreamName(cameraId);
    let source = streamSource(camera);
    if (source.startsWith('rtsps:')) {
      const abort = new AbortController();
      this.probes.set(cameraId, abort);
      try {
        // Give the UI a useful initial error. The relay independently checks
        // every actual connection, including reconnects after this probe.
        const socket = await connectRtsps(rtspsEndpoint(source), camera.rtspsTrust, abort.signal);
        socket.destroy();
        checkCurrent();
        const transport = await this.relay.register(cameraId, source, camera.rtspsTrust);
        try { checkCurrent(); } catch (error) { this.relay.revoke(cameraId); throw error; }
        source += `#transport=${transport}`;
      } finally { this.probes.delete(cameraId); }
    } else this.relay.revoke(cameraId);
    const url = new URL(`http://127.0.0.1:${API_PORT}/api/streams`);
    url.searchParams.set('name', streamName);
    url.searchParams.set('src', source);
    // PATCH registers in memory; PUT persists decrypted credentials in YAML.
    await requestText(url, 'PATCH', this.authorization);
    checkCurrent();
    if (!this.started || this.process !== child) throw new Error('go2rtc exited while registering the stream.');
    this.registered.set(streamName, { id: cameraId, generation: this.generation });
    await logBridge(`stream registered name=${streamName}`);
    return {
      mode: 'webrtc',
      streamName,
      scriptUrl: `http://127.0.0.1:${API_PORT}/video-stream.js`,
      pageUrl: streamPageUrl(streamName, camera.kind === 'generic'),
      wsUrl: `http://127.0.0.1:${API_PORT}/api/ws?src=${encodeURIComponent(streamName)}`,
    };
  }

  // Only the main process injects this header for the player's limited surface.
  // Never return the API credential through IPC or put it in a page URL.
  playbackAuthorization(value: string, method: string): string | undefined {
    const url = new URL(value);
    if (!['http:', 'ws:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== String(API_PORT) || method !== 'GET') return;
    if (['/stream.html', '/video-stream.js', '/video-rtc.js'].includes(url.pathname)) return this.authorization;
    if (url.pathname === '/api/ws' && /^fjoscam_[a-zA-Z0-9_-]+$/.test(url.searchParams.get('src') ?? '')) return this.authorization;
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.closed = true;
    this.started = false;
    this.registered.clear();
    this.stopping = (async () => {
      for (const probe of this.probes.values()) probe.abort();
      await this.relay.stop();
      await Promise.allSettled(this.pending.values());
      // A start awaiting filesystem I/O observes closed before spawning.
      await this.starting?.catch(() => undefined);
      await this.recycling?.catch(() => undefined);
      const child = this.process;
      if (child) await terminateChild(child);
      if (this.process === child) this.process = null;
    })();
    return this.stopping;
  }

  private start(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('go2rtc bridge is stopping.'));
    if (this.recycling) return this.recycling.then(() => this.start());
    if (this.starting) return this.starting;
    if (this.started && this.process) return Promise.resolve();
    this.starting = this.startProcess().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async startProcess(): Promise<void> {
    try {
      const executable = resolveGo2RtcPath();
      if (!executable) throw new Error('go2rtc binary was not found.');

      const configPath = await writeConfig();
      await logBridge(`start executable=${executable} config=${configPath}`);
      if (this.closed || this.recycling) throw new Error('go2rtc bridge is stopping or releasing a stream.');
      this.process = spawn(executable, ['-config', configPath], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FJOSCAM_BRIDGE_PASSWORD: this.password },
      });
      const child = this.process;
      let failure: Error | undefined;
      const report = (reason: NonNullable<BridgeHealth['reason']>) => {
        if (this.process !== child || this.lastFailure === reason) return;
        this.lastFailure = reason;
        void logBridge(`go2rtc diagnostic=${reason}`);
      };
      child.stdout?.on('data', bridgeDiagnostics(report));
      child.stderr?.on('data', bridgeDiagnostics(report));
      child.stdout?.on('error', () => {});
      child.stderr?.on('error', () => {});
      child.on('error', () => { failure = new Error('Could not launch go2rtc.'); report('launch-failed'); });
      child.on('close', (code, signal) => {
        failure ??= new Error('go2rtc exited before it was ready.');
        void logBridge(`go2rtc process closed code=${Number.isInteger(code) ? code : 'none'} signal=${signal && /^SIG[A-Z]+$/.test(signal) ? signal : 'none'}`);
        if (this.process === child) {
          if (!this.closed && !this.recycling) {
            this.lastFailure ??= 'process-exited';
            this.nextRecovery = Math.max(this.nextRecovery, Date.now() + 1000);
          }
          this.started = false;
          this.process = null;
        }
      });
      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        if (this.closed || this.recycling) throw new Error('go2rtc bridge is stopping or releasing a stream.');
        if (failure) throw failure;
        if (await isReady(this.authorization)) {
          if (this.closed || this.recycling) throw new Error('go2rtc bridge is stopping or releasing a stream.');
          if (failure || this.process !== child) throw failure ?? new Error('go2rtc exited.');
          this.started = true;
          this.generation += 1;
          this.readySince = Date.now();
          this.lastFailure = undefined;
          return;
        }
        await sleep(150);
      }
      throw new Error('go2rtc bridge did not start. The local port may be in use.');
    } catch (error) {
      const child = this.process;
      if (child) await terminateChild(child);
      if (this.process === child) this.process = null;
      this.started = false;
      throw error;
    }
  }
}

function streamSource(camera: CameraWithSecret): string {
  if (camera.kind === 'generic') {
    if (!camera.streamUrl) throw new Error('Generic camera is missing stream URL.');
    return normalizeGenericStreamUrl(camera.streamUrl);
  }
  return buildRtspUrl(camera);
}

function normalizeGenericStreamUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (!['rtsp:', 'rtsps:'].includes(url.protocol)) throw new Error();
    if (url.searchParams.has('enableSrtp')) url.searchParams.delete('enableSrtp');
    // A fragment is go2rtc configuration, not part of the camera URI. Never
    // allow supplied #transport options to bypass verified RTSPS transport.
    url.hash = '';
    return url.toString();
  } catch {
    throw new Error('Generic streams require a valid RTSP or RTSPS URL.');
  }
}

async function writeConfig(): Promise<string> {
  const dir = join(app.getPath('userData'), 'go2rtc');
  await mkdir(dir, { recursive: true });
  const configPath = join(dir, 'go2rtc.yaml');
  await writeFile(
    configPath,
    [
      'api:',
      `  listen: "127.0.0.1:${API_PORT}"`,
      '  username: fjoscam',
      '  password: "${FJOSCAM_BRIDGE_PASSWORD}"',
      '  local_auth: true',
      '  allow_paths: ["/", "/api/streams", "/api/ws"]',
      'rtsp:',
      '  listen: ""',
      'webrtc:',
      `  listen: "127.0.0.1:${WEBRTC_PORT}"`,
      'streams:',
      '',
    ].join('\n'),
    'utf8',
  );
  return configPath;
}

async function isReady(authorization: string): Promise<boolean> {
  try {
    // A pre-existing unauthenticated go2rtc on this fixed port is not ours.
    await requestText(new URL(`http://127.0.0.1:${API_PORT}/api/streams`), 'GET', '', 500, 401);
    await requestText(new URL(`http://127.0.0.1:${API_PORT}/api/streams`), 'GET', authorization, 500);
    return true;
  } catch {
    return false;
  }
}

function requestText(url: URL, method: 'GET' | 'PATCH', authorization: string, timeoutMs = 5000, expectedStatus = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve('');
    };
    const request = httpRequest(url, { method, headers: { authorization } }, (response) => {
      response.on('error', () => finish(new Error('go2rtc response failed.')));
      response.on('aborted', () => finish(new Error('go2rtc response was interrupted.')));
      response.on('end', () => {
        const code = response.statusCode ?? 500;
        finish(code === expectedStatus ? undefined : new Error(`go2rtc HTTP ${code}`));
      });
      response.resume();
    });
    const timer = setTimeout(() => request.destroy(new Error('go2rtc request timed out.')), timeoutMs);
    request.on('error', (error) => finish(error));
    request.end();
  });
}

function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const forceTimer = setTimeout(() => child.kill('SIGKILL'), 1000);
    const deadline = setTimeout(() => {
      cleanup();
      reject(new Error('go2rtc did not exit after termination.'));
    }, 4000);
    const cleanup = () => {
      clearTimeout(forceTimer);
      clearTimeout(deadline);
      child.removeListener('close', onClose);
    };
    const onClose = () => { cleanup(); resolve(); };
    child.once('close', onClose);
    child.kill('SIGTERM');
  });
}

function resolveGo2RtcPath(): string | undefined {
  const executable = process.platform === 'win32' ? 'go2rtc.exe' : 'go2rtc';
  const platformDir = process.platform === 'win32' ? 'win64' : process.platform === 'darwin' ? (process.arch === 'arm64' ? 'mac-arm64' : 'mac-amd64') : 'linux-amd64';
  const candidates = [
    join(process.resourcesPath, 'app.asar.unpacked', 'vendor', 'go2rtc', platformDir, executable),
    join(process.resourcesPath, 'vendor', 'go2rtc', platformDir, executable),
    join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'vendor', 'go2rtc', platformDir, executable),
    join(app.getAppPath(), 'vendor', 'go2rtc', platformDir, executable),
    join(process.cwd(), 'vendor', 'go2rtc', platformDir, executable),
  ];
  return candidates.find((candidate) => !candidate.includes('app.asar\\') && !candidate.includes('app.asar/') && existsSync(candidate));
}

function safeStreamName(value: string): string {
  return `fjoscam_${value.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function streamPageUrl(streamName: string, forceWebRtc: boolean): string {
  const url = new URL(`http://127.0.0.1:${API_PORT}/stream.html`);
  url.searchParams.set('src', streamName);
  if (forceWebRtc) url.searchParams.set('mode', 'webrtc');
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logBridge(message: string): Promise<void> {
  if (!message) return;
  await logToFile('go2rtc-bridge.log', message);
}
