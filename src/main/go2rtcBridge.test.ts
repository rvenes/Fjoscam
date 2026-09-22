// @vitest-environment node
import { EventEmitter, once } from 'node:events';
import { createHash, X509Certificate } from 'node:crypto';
import { createServer as createTlsServer } from 'node:tls';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraStore } from './store.js';
import { tlsFixture } from '../test/tlsFixture.js';

const paths = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: {
  getPath: () => paths.userData,
  getAppPath: () => process.cwd(),
} }));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});
import { Go2RtcBridge } from './go2rtcBridge.js';

const store = { getCameraWithSecret: async () => ({
  id: 'synthetic', kind: 'generic', streamUrl: 'rtsp://test:synthetic-password@127.0.0.1:9/test?enableSrtp',
}) } as unknown as CameraStore;

// This suite uses only the bundled binary and a deliberately closed loopback
// camera port. It never opens saved app data or a real camera. Keep temporary
// synthetic config for diagnosis; no existing files/processes are removed.
describe.skipIf(process.platform !== 'win32' && process.platform !== 'darwin')('bundled go2rtc safety', () => {
  let bridge: Go2RtcBridge;
  beforeEach(async () => {
    vi.mocked(spawn).mockReset().mockImplementation((await vi.importActual<typeof import('node:child_process')>('node:child_process')).spawn);
    paths.userData = await mkdtemp(join(tmpdir(), 'fjoscam-bridge-test-'));
    Object.defineProperty(process, 'resourcesPath', { value: process.cwd(), configurable: true });
    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', () => reject(new Error('Port 1984 is occupied; close Fjoscam before running bridge integration tests.')));
      probe.listen(1984, '127.0.0.1', () => probe.close(() => resolve()));
    });
    bridge = new Go2RtcBridge(store);
  });
  afterEach(async () => { await bridge?.stop(); vi.restoreAllMocks(); });

  it('rejects Panasonic playback before starting go2rtc or registering Reolink RTSP', async () => {
    bridge = new Go2RtcBridge({ getCameraWithSecret: async () => ({ id: 'panasonic', kind: 'panasonic' }) } as unknown as CameraStore);
    await expect(bridge.getStream('panasonic')).rejects.toThrow('use MJPEG');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('starts once, registers only in memory and protects local endpoints', async () => {
    const [first, second] = await Promise.all([bridge.getStream('synthetic'), bridge.getStream('synthetic')]);
    expect(first).toEqual(second);
    expect(spawn).toHaveBeenCalledTimes(1);
    const config = await readFile(join(paths.userData, 'go2rtc/go2rtc.yaml'), 'utf8');
    expect(config).not.toContain('synthetic-password');
    expect(config).not.toContain('rtsp://');
    expect(config).toContain('  listen: ""');
    expect(config).toContain('${FJOSCAM_BRIDGE_PASSWORD}');

    expect((await fetch('http://127.0.0.1:1984/api/streams')).status).toBe(401);
    expect((await fetch('http://127.0.0.1:1984/api/config')).status).toBe(401);
    const authorization = bridge.playbackAuthorization(first.pageUrl, 'GET')!;
    expect(authorization).toMatch(/^Basic /);
    const headers = { authorization };
    expect((await fetch(first.pageUrl, { headers })).status).toBe(200);
    for (const path of ['/video-stream.js', '/video-rtc.js']) {
      expect((await fetch(`http://127.0.0.1:1984${path}`, { headers })).status).toBe(200);
    }
    expect((await fetch('http://127.0.0.1:1984/api/config', { headers })).status).toBe(404);
    const registered = await (await fetch('http://127.0.0.1:1984/api/streams', { headers })).json();
    expect(registered).toHaveProperty('fjoscam_synthetic');
    expect(bridge.playbackAuthorization('http://127.0.0.1:1984/api/streams', 'GET')).toBeUndefined();
    expect(bridge.playbackAuthorization('http://example.invalid:1984/stream.html', 'GET')).toBeUndefined();
    expect(bridge.playbackAuthorization(first.pageUrl, 'POST')).toBeUndefined();
    const child = vi.mocked(spawn).mock.results[0].value as ChildProcess;
    await bridge.stop();
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    await expect(bridge.getStream('synthetic')).rejects.toThrow('stopping');
  }, 15000);

  it('handles spawn failure without an unhandled process error', async () => {
    vi.mocked(spawn).mockImplementationOnce(() => {
      const child = Object.assign(new EventEmitter(), { pid: undefined, exitCode: null, signalCode: null });
      queueMicrotask(() => child.emit('error', new Error('Synthetic spawn failure')));
      return child as ChildProcess;
    });
    await expect(bridge.getStream('synthetic')).rejects.toThrow('launch');
  });

  it('does not spawn after shutdown overtakes filesystem startup', async () => {
    const pending = bridge.getStream('synthetic');
    const rejected = expect(pending).rejects.toThrow('stopping');
    await bridge.stop();
    await rejected;
    expect(spawn).not.toHaveBeenCalled();
  });

  it('uses verified TLS for actual go2rtc RTSP/Digest and blocks a changed peer after preflight', async () => {
    const [first, second] = await Promise.all([tlsFixture(), tlsFixture()]);
    const sockets = new Set<Socket>();
    const requests: { method: string; uri: string; authenticated: boolean }[] = [];
    const md5 = (value: string) => createHash('md5').update(value).digest('hex');
    const server = createTlsServer(first, (socket) => {
      socket.on('error', () => {});
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        while (buffer.includes('\r\n\r\n')) {
          const end = buffer.indexOf('\r\n\r\n');
          const lines = buffer.slice(0, end).split('\r\n'); buffer = buffer.slice(end + 4);
          const [method, uri] = lines[0].split(' ');
          const headers = Object.fromEntries(lines.slice(1).map((line) => { const i = line.indexOf(':'); return [line.slice(0, i).toLowerCase(), line.slice(i + 1).trim()]; }));
          const auth = Object.fromEntries([...String(headers.authorization || '').matchAll(/(\w+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
          const authenticated = auth.uri === uri && auth.username === 'test' && auth.response === md5(`${md5('test:synthetic:synthetic-password')}:nonce:${md5(`${method}:${uri}`)}`);
          requests.push({ method, uri, authenticated });
          const reply = (status: string, extra = '', body = '') => socket.write(`RTSP/1.0 ${status}\r\nCSeq: ${headers.cseq}\r\n${extra}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
          if (!authenticated) { reply('401 Unauthorized', 'WWW-Authenticate: Digest realm="synthetic", nonce="nonce"\r\n'); continue; }
          if (method === 'DESCRIBE') {
            const sdp = ['v=0', 'o=- 0 0 IN IP4 127.0.0.1', 's=Synthetic camera', 'c=IN IP4 127.0.0.1', 't=0 0',
              'm=video 0 RTP/AVP 96', 'a=rtpmap:96 H264/90000', 'a=control:track1',
              'm=audio 0 RTP/AVP 0', 'a=rtpmap:0 PCMU/8000', 'a=control:track2', ''].join('\r\n');
            reply('200 OK', 'Content-Type: application/sdp\r\n', sdp);
          } else if (method === 'SETUP') reply('200 OK', `Session: synthetic-session\r\nTransport: ${headers.transport}\r\n`);
          else reply('200 OK', 'Public: OPTIONS, DESCRIBE, SETUP, PLAY, TEARDOWN\r\n');
        }
      });
    });
    server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    server.on('tlsClientError', () => {});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const endpoint = `rtsps://127.0.0.1:${(server.address() as { port: number }).port}`;
    const camera = { id: 'synthetic', kind: 'generic', streamUrl: endpoint.replace('://', '://test:synthetic-password@') + '/test?enableSrtp#transport=tcp',
      rtspsTrust: { origin: endpoint, fingerprint256: new X509Certificate(first.cert).fingerprint256 } };
    bridge = new Go2RtcBridge({ getCameraWithSecret: async () => camera } as unknown as CameraStore);
    try {
      const stream = await bridge.getStream('synthetic');
      expect(JSON.stringify(stream)).not.toMatch(/synthetic-password|transport=|rtsps:/);
      const headers = { authorization: bridge.playbackAuthorization(stream.pageUrl, 'GET')! };
      const probe = () => fetch('http://127.0.0.1:1984/api/streams?src=fjoscam_synthetic&video=all&audio=all', { headers, signal: AbortSignal.timeout(8000) });
      // The preflight has succeeded. A different certificate on the actual
      // playback connection must still fail, even with supplied #transport=tcp.
      server.setSecureContext(second);
      const changed = await probe(); await changed.arrayBuffer();
      expect(changed.status).toBe(500); expect(requests).toHaveLength(0);
      server.setSecureContext(first);
      const good = await probe(); const info = await good.json();
      expect(good.status).toBe(200);
      expect(JSON.stringify(info)).toContain('H264'); expect(JSON.stringify(info)).toContain('PCMU');
      expect(requests.some((request) => request.method === 'DESCRIBE' && request.authenticated && request.uri === endpoint + '/test')).toBe(true);
      expect(requests.filter((request) => request.method === 'SETUP' && request.authenticated)).toHaveLength(2);
      expect(requests.every((request) => !/synthetic-password|enableSrtp|transport=/.test(request.uri))).toBe(true);
      await bridge.invalidateCamera('synthetic');
      await vi.waitFor(() => expect(sockets.size).toBe(0));
      const count = requests.length;
      await expect(probe()).rejects.toThrow();
      expect(requests).toHaveLength(count);
      // An explicitly updated pin gets a fresh transport and restores playback.
      server.setSecureContext(second); camera.rtspsTrust.fingerprint256 = new X509Certificate(second.cert).fingerprint256;
      await bridge.getStream('synthetic');
      const restored = await probe(); await restored.arrayBuffer(); expect(restored.status).toBe(200);
      const config = await readFile(join(paths.userData, 'go2rtc/go2rtc.yaml'), 'utf8');
      expect(config).not.toMatch(/synthetic-password|rtsps:|#transport/);
    } finally {
      await bridge.stop(); for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 25000);

  it('does not register stale camera data when save overtakes its read', async () => {
    let release!: () => void;
    const getCamera = vi.fn(async () => { await new Promise<void>((resolve) => { release = resolve; }); return store.getCameraWithSecret('synthetic'); });
    bridge = new Go2RtcBridge({ getCameraWithSecret: getCamera } as unknown as CameraStore);
    const pending = bridge.getStream('synthetic'); const rejected = expect(pending).rejects.toThrow('settings changed');
    await vi.waitFor(() => expect(getCamera).toHaveBeenCalled());
    const invalidated = bridge.invalidateCamera('synthetic'); release(); await rejected; await invalidated;
  });

  it('restores a registered active stream after child exit and shares concurrent recovery probes', async () => {
    const stream = await bridge.getStream('synthetic');
    const first = bridge.observePlayback(stream.pageUrl);
    expect(first.state).toBe('running');
    const child = vi.mocked(spawn).mock.results[0].value as ChildProcess;
    const closed = once(child, 'close'); child.kill(); await closed;
    const now = Date.now; vi.spyOn(Date, 'now').mockImplementation(() => now() + 2000);
    for (let i = 0; i < 50; i++) expect(bridge.observePlayback(stream.pageUrl).state).toBe('recovering');
    await vi.waitFor(() => expect(bridge.observePlayback(stream.pageUrl).state).toBe('running'), { timeout: 8000 });
    const restored = bridge.observePlayback(stream.pageUrl);
    expect(restored.generation).toBe(first.generation + 1); expect(restored.attempts).toBe(1);
    expect(spawn).toHaveBeenCalledTimes(2);
    const headers = { authorization: bridge.playbackAuthorization(stream.pageUrl, 'GET')! };
    const streams = await (await fetch('http://127.0.0.1:1984/api/streams', { headers })).json();
    expect(streams).toHaveProperty('fjoscam_synthetic');
    expect(JSON.stringify(restored)).not.toMatch(/password|rtsp|127\.0\.0\.1/);
    const config = await readFile(join(paths.userData, 'go2rtc/go2rtc.yaml'), 'utf8');
    expect(config).not.toContain('synthetic-password');
  }, 15000);

  it('bounds repeated restart failures, then allows an explicit reconnect', async () => {
    const stream = await bridge.getStream('synthetic');
    const child = vi.mocked(spawn).mock.results[0].value as ChildProcess;
    const closed = once(child, 'close'); child.kill(); await closed;
    const now = Date.now; let offset = 0; vi.spyOn(Date, 'now').mockImplementation(() => now() + offset);
    for (let i = 0; i < 5; i++) vi.mocked(spawn).mockImplementationOnce(() => {
      const failed = Object.assign(new EventEmitter(), { pid: undefined, exitCode: null, signalCode: null });
      queueMicrotask(() => failed.emit('error', new Error('Synthetic launch failure')));
      return failed as ChildProcess;
    });
    for (let attempt = 1; attempt <= 5; attempt++) {
      offset += 31_000;
      await vi.waitFor(() => { bridge.observePlayback(stream.pageUrl); expect(spawn).toHaveBeenCalledTimes(attempt + 1); }, { timeout: 4000 });
      await vi.waitFor(() => {
        const status = bridge.observePlayback(stream.pageUrl);
        expect(status.state === 'failed' || (status.retryInMs ?? 0) > 0).toBe(true);
      });
    }
    await vi.waitFor(() => expect(bridge.observePlayback(stream.pageUrl).state).toBe('failed'));
    offset += 600_000;
    expect(bridge.observePlayback(stream.pageUrl)).toMatchObject({ state: 'failed', attempts: 5, reason: 'launch-failed' });
    expect(spawn).toHaveBeenCalledTimes(6);
    await bridge.getStream('synthetic');
    expect(bridge.observePlayback(stream.pageUrl)).toMatchObject({ state: 'running', attempts: 0 });
    expect(spawn).toHaveBeenCalledTimes(7);
  }, 20000);

  it('never restarts an unknown, invalidated or stopped stream', async () => {
    expect(bridge.observePlayback('http://127.0.0.1:1984/stream.html?src=fjoscam_unknown').state).toBe('failed');
    expect(spawn).not.toHaveBeenCalled();
    const stream = await bridge.getStream('synthetic');
    await bridge.invalidateCamera('synthetic');
    expect(bridge.observePlayback(stream.pageUrl)).toMatchObject({ state: 'failed', reason: 'stream-invalidated' });
    const child = vi.mocked(spawn).mock.results[0].value as ChildProcess;
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    const now = Date.now; vi.spyOn(Date, 'now').mockImplementation(() => now() + 60_000);
    expect(bridge.observePlayback(stream.pageUrl).state).toBe('failed');
    await bridge.stop();
    expect(bridge.observePlayback(stream.pageUrl).state).toBe('stopped');
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('releases old sources before reopening, without stopping unrelated camera recovery', async () => {
    const first = await bridge.getStream('synthetic');
    const other = await bridge.getStream('another');
    const child = vi.mocked(spawn).mock.results[0].value as ChildProcess;
    const release = bridge.invalidateCamera('synthetic');
    const reopened = bridge.getStream('synthetic'); // Must wait behind termination.
    await release; expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    const stream = await reopened;
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(bridge.observePlayback(stream.pageUrl).state).toBe('running');
    await vi.waitFor(() => expect(bridge.observePlayback(other.pageUrl).state).toBe('running'));
    expect(spawn).toHaveBeenCalledTimes(2);
    const headers = { authorization: bridge.playbackAuthorization(first.pageUrl, 'GET')! };
    await bridge.invalidateCamera('synthetic');
    await vi.waitFor(() => expect(bridge.observePlayback(other.pageUrl).state).toBe('running'));
    const registered = await (await fetch('http://127.0.0.1:1984/api/streams', { headers })).json();
    expect(registered).not.toHaveProperty('fjoscam_synthetic'); expect(registered).toHaveProperty('fjoscam_another');
  }, 15000);

  it('never revives a process when shutdown overtakes release and reopen', async () => {
    await bridge.getStream('synthetic');
    const release = bridge.invalidateCamera('synthetic');
    const reopened = bridge.getStream('synthetic'); const rejected = expect(reopened).rejects.toThrow('stopping');
    await Promise.all([release, bridge.stop(), rejected]);
    expect(spawn).toHaveBeenCalledTimes(1); expect(bridge.isRunning()).toBe(false);
  });
});
