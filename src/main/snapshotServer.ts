import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { logToFile } from './logging.js';
import type { CameraStore } from './store.js';
import type { ReolinkClient } from './reolinkClient.js';
import { openPanasonicStream } from './panasonicClient.js';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { isReolinkCamera } from '../shared/cameraControls.js';
import type { CameraWithSecret, ConnectionStatus, PlaybackSample } from '../shared/types.js';

export class SnapshotServer {
  private server: Server | null = null;
  private port: number | null = null;
  private readonly authorization = `Bearer ${randomBytes(32).toString('hex')}`;
  private readonly health = new Map<string, { frames: number; last: number | null; ended: boolean }>();
  private readonly activeResponses = new Map<string, Set<() => void>>();

  constructor(private readonly store: CameraStore, private readonly reolink: ReolinkClient) {}

  async start(): Promise<number> {
    if (this.port) return this.port;

    this.server = createServer(async (request, response) => {
      let closed = false;
      const abort = new AbortController();
      let cameraId: string | undefined;
      let sample: { frames: number; last: number | null; ended: boolean } | undefined;
      const close = () => {
        if (closed) return;
        closed = true;
        if (sample) sample.ended = true;
        abort.abort();
        response.destroy();
        if (cameraId !== undefined) {
          const active = this.activeResponses.get(cameraId);
          active?.delete(close);
          if (active?.size === 0) this.activeResponses.delete(cameraId);
        }
      };
      response.on('close', close);
      request.on('error', () => response.destroy());
      response.on('error', () => {
        void logSnapshot('Snapshot response failed.');
      });
      try {
        if (request.headers.authorization !== this.authorization) {
          response.writeHead(401).end();
          return;
        }
        if (request.method !== 'GET') { response.writeHead(405).end(); return; }
        const snapshotMatch = request.url?.match(/^\/snapshot\/([^/?]+)(?:\?.*)?$/);
        const mjpegMatch = request.url?.match(/^\/mjpeg\/([^/?]+)(?:\?.*)?$/);
        const match = snapshotMatch ?? mjpegMatch;
        if (!match) {
          response.writeHead(404).end();
          return;
        }

        cameraId = decodeURIComponent(match[1]);
        const active = this.activeResponses.get(cameraId) ?? new Set<() => void>();
        active.add(close);
        this.activeResponses.set(cameraId, active);
        const camera = await this.store.getCameraWithSecret(cameraId);
        if (closed) return;
        if (!isReolinkCamera(camera) && !(mjpegMatch && camera.kind === 'panasonic')) {
          response.writeHead(400).end('This playback type is not supported by the camera.');
          return;
        }
        if (mjpegMatch) {
          sample = { frames: 0, last: null, ended: false };
          this.health.set(request.url!, sample);
          while (this.health.size > 64) this.health.delete(this.health.keys().next().value!);
          const frameSent = () => { sample!.frames += 1; sample!.last = Date.now(); };
          if (camera.kind === 'panasonic') {
            const upstream = await openPanasonicStream(camera, abort.signal);
            if (closed) { upstream.destroy(); return; }
            response.once('close', () => upstream.destroy());
            const upstreamContentType = Array.isArray(upstream.headers['content-type'])
              ? upstream.headers['content-type'][0]
              : upstream.headers['content-type'];
            response.writeHead(200, {
              'content-type': 'multipart/x-mixed-replace; boundary=fjoscam-panasonic',
              'cache-control': 'no-store, no-cache, must-revalidate',
              pragma: 'no-cache',
              connection: 'close',
            });
            void logSnapshot(`panasonic mjpeg proxy ${camera.host} content-type=${upstreamContentType ?? 'missing'}`);
            pipePanasonicMjpeg(upstream, response, upstreamContentType, frameSent);
            return;
          }

          response.writeHead(200, {
            'content-type': 'multipart/x-mixed-replace; boundary=fjoscam',
            'cache-control': 'no-store, no-cache, must-revalidate',
            connection: 'close',
          });

          while (!closed) {
            try {
              const frame = await this.reolink.getSnapshot(camera, abort.signal);
              if (closed) break;
              validateSnapshotFrame(frame);
              if (!writeMjpegFrame(response, 'fjoscam', frame.bytes, frame.contentType)) await waitForDrain(response);
              if (!closed) frameSent();
            } catch {
              if (closed) break;
              await sleep(500, abort.signal);
            }
            await sleep(180, abort.signal);
          }
          response.end();
          return;
        }

        const cameraResponse = await this.reolink.getSnapshot(camera, abort.signal);
        if (closed) return;
        validateSnapshotFrame(cameraResponse);

        response.writeHead(200, {
          'content-type': cameraResponse.contentType,
          'cache-control': 'no-store',
        });
        response.end(cameraResponse.bytes);
      } catch {
        if (closed) return;
        void logSnapshot('Snapshot request failed.');
        try {
          if (response.destroyed) return;
          if (!response.headersSent) {
            response.writeHead(500);
            response.end('Snapshot request failed.');
          } else if (response.writable) {
            response.end();
          }
        } catch {
          response.destroy();
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(0, '127.0.0.1', () => resolve());
    });

    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Could not start snapshot server.');
    this.port = address.port;
    return this.port;
  }

  getSnapshotUrl(cameraId: string): string {
    if (!this.port) throw new Error('Snapshot server is not running.');
    return `http://127.0.0.1:${this.port}/snapshot/${encodeURIComponent(cameraId)}`;
  }

  ownsUrl(value: string): boolean {
    const url = new URL(value);
    return this.port !== null && url.origin === `http://127.0.0.1:${this.port}`;
  }

  playbackAuthorization(value: string, method: string): string | undefined {
    if (this.ownsUrl(value) && method === 'GET' && /^\/(snapshot|mjpeg)\/[^/]+$/.test(new URL(value).pathname)) return this.authorization;
  }

  getMjpegUrl(cameraId: string): string {
    if (!this.port) throw new Error('Snapshot server is not running.');
    return `http://127.0.0.1:${this.port}/mjpeg/${encodeURIComponent(cameraId)}`;
  }

  getPlaybackHealth(value: string): PlaybackSample {
    const url = new URL(value);
    if (!this.playbackAuthorization(value, 'GET') || !url.pathname.startsWith('/mjpeg/')) throw new Error('Invalid playback target.');
    const sample = this.health.get(url.pathname + url.search);
    return { source: 'mjpeg', ready: !!sample, frames: sample?.frames ?? 0,
      frameAgeMs: sample?.last == null ? null : Math.max(0, Date.now() - sample.last),
      ended: sample?.ended ?? false, mediaError: false };
  }

  async testPanasonic(camera: CameraWithSecret): Promise<ConnectionStatus> {
    try {
      const upstream = await openPanasonicStream(camera);
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const sink = new Writable({ write(_chunk, _encoding, done) { done(); } });
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true; clearTimeout(timer); upstream.destroy(); sink.destroy();
          if (ok) resolve(); else reject(new Error('No MJPEG frame received.'));
        };
        const timer = setTimeout(() => finish(false), 7000);
        upstream.once('end', () => finish(false));
        upstream.once('error', () => finish(false));
        upstream.once('close', () => finish(false));
        pipePanasonicMjpeg(upstream, sink, undefined, () => finish(true));
      });
      return { ok: true, scope: 'mjpeg', message: 'MJPEG test: JPEG frame received' };
    } catch { return { ok: false, scope: 'mjpeg', message: 'MJPEG test failed. Check camera, credentials and MJPEG path.' }; }
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.port = null;
    this.health.clear();
    this.releaseAll();
    if (!server) return;

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }

  invalidateCamera(id: string): void {
    for (const close of this.activeResponses.get(id) ?? []) close();
  }

  releaseAll(): void {
    for (const id of this.activeResponses.keys()) this.invalidateCamera(id);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return delay(ms, undefined, { signal }).catch(() => undefined);
}

async function logSnapshot(message: string): Promise<void> {
  await logToFile('snapshot-server.log', message);
}

export function pipePanasonicMjpeg(upstream: NodeJS.ReadableStream & { destroy(): void }, response: NodeJS.WritableStream & { destroyed?: boolean }, contentType?: string, onFrame?: () => void): void {
  const outputBoundary = 'fjoscam-panasonic';
  let buffer = Buffer.alloc(0);
  let frames = 0;
  let blocked = false;

  upstream.on('data', (chunk: Buffer) => {
    if (response.destroyed) { upstream.destroy(); return; }
    // A corrupt/truncated JPEG must not accumulate for the life of the stream.
    if (buffer.length + chunk.length > 16 * 1024 * 1024) {
      upstream.destroy();
      response.end();
      return;
    }
    buffer = Buffer.concat([buffer, chunk]);
    while (!response.destroyed) {
      const frameStart = findJpegStart(buffer);
      if (frameStart < 0) {
        if (buffer.length > 1024 * 1024) buffer = buffer.subarray(buffer.length - 2);
        return;
      }
      if (frameStart > 0) buffer = buffer.subarray(frameStart);

      const frameEnd = findJpegEnd(buffer, 2);
      if (frameEnd < 0) return;

      const frame = buffer.subarray(0, frameEnd);
      // Drop frames while the downstream is blocked instead of retaining an
      // unbounded queue or stopping reads from a legacy camera indefinitely.
      if (blocked) { buffer = buffer.subarray(frameEnd); continue; }
      blocked = !writeMjpegFrame(response, outputBoundary, frame);
      frames += 1;
      onFrame?.();
      if (frames === 1) void logSnapshot(`panasonic first frame proxied (${frame.length} bytes, ${contentType ?? 'no content-type'})`);
      buffer = buffer.subarray(frameEnd);
    }
  });

  upstream.on('end', () => {
    if (!response.destroyed) response.end();
  });
  upstream.on('error', () => {
    void logSnapshot('Panasonic upstream failed.');
    if (!response.destroyed) response.end();
  });
  response.on('drain', () => { blocked = false; });
  response.once('close', () => upstream.destroy());
}

export function validateSnapshotFrame(frame: { bytes: Buffer; contentType: string }): void {
  const type = frame.contentType.split(';')[0].trim().toLowerCase();
  const bytes = frame.bytes;
  const jpeg = type === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  const png = type === 'image/png' && bytes.length >= 20 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]));
  if (!jpeg && !png) throw new Error('Camera did not return a complete image envelope.');
}

function writeMjpegFrame(response: NodeJS.WritableStream, boundary: string, frame: Buffer, contentType = 'image/jpeg'): boolean {
  return response.write(Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: ${contentType}\r\ncontent-length: ${frame.length}\r\n\r\n`), frame, Buffer.from('\r\n'),
  ]));
}

function waitForDrain(response: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      response.removeListener('drain', done);
      response.removeListener('close', done);
      resolve();
    };
    response.once('drain', done);
    response.once('close', done);
  });
}

function findJpegStart(buffer: Buffer): number {
  for (let index = 0; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 0xff && buffer[index + 1] === 0xd8) return index;
  }
  return -1;
}

function findJpegEnd(buffer: Buffer, start: number): number {
  for (let index = start; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 0xff && buffer[index + 1] === 0xd9) return index + 2;
  }
  return -1;
}
