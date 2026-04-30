import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { app } from 'electron';
import { join } from 'node:path';
import type { CameraStore } from './store.js';
import { buildRtspUrl } from './reolinkClient.js';
import type { CameraWithSecret } from '../shared/types.js';

const API_PORT = 1984;
const WEBRTC_PORT = 8555;

export type WebRtcStream = {
  mode: 'webrtc';
  streamName: string;
  scriptUrl: string;
  pageUrl: string;
  wsUrl: string;
};

export class Go2RtcBridge {
  private process: ChildProcess | null = null;
  private started = false;

  constructor(private readonly store: CameraStore) {}

  async getStream(cameraId: string): Promise<WebRtcStream> {
    await logBridge(`get stream camera=${cameraId}`);
    await this.start();
    const camera = await this.store.getCameraWithSecret(cameraId);
    const streamName = safeStreamName(cameraId);
    void putStream(streamName, streamSource(camera)).catch((error) => logBridge(`put stream warning: ${error instanceof Error ? error.message : String(error)}`));
    await sleep(250);
    await logBridge(`stream registration requested name=${streamName}`);
    return {
      mode: 'webrtc',
      streamName,
      scriptUrl: `http://127.0.0.1:${API_PORT}/video-stream.js`,
      pageUrl: streamPageUrl(streamName, camera.kind === 'generic'),
      wsUrl: `http://127.0.0.1:${API_PORT}/api/ws?src=${encodeURIComponent(streamName)}`,
    };
  }

  stop(): void {
    this.started = false;
    const child = this.process;
    this.process = null;
    if (!child || child.killed) return;
    child.stderr?.removeAllListeners();
    child.removeAllListeners();
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, 1000).unref();
  }

  private async start(): Promise<void> {
    if (this.started && (await isReady())) return;

    if (!this.process || this.process.killed) {
      const executable = resolveGo2RtcPath();
      if (!executable) throw new Error('go2rtc binary was not found.');

      const configPath = await writeConfig();
      await logBridge(`start executable=${executable} config=${configPath}`);
      this.process = spawn(executable, ['-config', configPath], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      const child = this.process;
      child.on('close', () => {
        void logBridge('go2rtc process closed');
        this.started = false;
        if (this.process === child) this.process = null;
      });
      child.unref();
    }

    await waitUntilReady();
    this.started = true;
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
    if (url.searchParams.has('enableSrtp')) url.searchParams.delete('enableSrtp');
    return url.toString();
  } catch {
    return value.trim().replace(/[?&]enableSrtp(?:=[^&]*)?/i, '');
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
      'webrtc:',
      `  listen: "127.0.0.1:${WEBRTC_PORT}"`,
      'streams:',
      '',
    ].join('\n'),
    'utf8',
  );
  return configPath;
}

async function putStream(name: string, src: string): Promise<void> {
  const url = new URL(`http://127.0.0.1:${API_PORT}/api/streams`);
  url.searchParams.set('name', name);
  url.searchParams.set('src', src);
  await requestText(url, 'PUT');
}

async function waitUntilReady(): Promise<void> {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (await isReady()) return;
    await sleep(150);
  }
  throw new Error('go2rtc bridge did not start.');
}

async function isReady(): Promise<boolean> {
  try {
    await requestText(new URL(`http://127.0.0.1:${API_PORT}/api/streams`), 'GET');
    return true;
  } catch {
    return false;
  }
}

function requestText(url: URL, method: 'GET' | 'PUT'): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method, timeout: 5000 }, (response) => {
      if (method === 'PUT') {
        response.resume();
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`go2rtc HTTP ${response.statusCode}`));
          return;
        }
        resolve('');
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`go2rtc HTTP ${response.statusCode}: ${body.slice(0, 160)}`));
          return;
        }
        resolve(body);
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('go2rtc request timed out.')));
    request.end();
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
  await appendFile(join(app.getPath('userData'), 'go2rtc-bridge.log'), `${new Date().toISOString()} ${message}\n`, 'utf8').catch(() => undefined);
}
