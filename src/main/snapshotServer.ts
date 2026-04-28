import { createServer, type Server } from 'node:http';
import { appendFile } from 'node:fs/promises';
import { app } from 'electron';
import { join } from 'node:path';
import type { CameraStore } from './store.js';
import type { ReolinkClient } from './reolinkClient.js';
import { openPanasonicStream } from './panasonicClient.js';

export class SnapshotServer {
  private server: Server | null = null;
  private port: number | null = null;

  constructor(private readonly store: CameraStore, private readonly reolink: ReolinkClient) {}

  async start(): Promise<number> {
    if (this.port) return this.port;

    this.server = createServer(async (request, response) => {
      try {
        const snapshotMatch = request.url?.match(/^\/snapshot\/([^/?]+)/);
        const mjpegMatch = request.url?.match(/^\/mjpeg\/([^/?]+)/);
        const match = snapshotMatch ?? mjpegMatch;
        if (!match) {
          response.writeHead(404).end();
          return;
        }

        void logSnapshot(`request ${request.url ?? 'unknown'}`);
        const camera = await this.store.getCameraWithSecret(decodeURIComponent(match[1]));
        if (mjpegMatch) {
          if (camera.kind === 'panasonic') {
            const upstream = await openPanasonicStream(camera);
            const upstreamContentType = Array.isArray(upstream.headers['content-type'])
              ? upstream.headers['content-type'][0]
              : upstream.headers['content-type'];
            response.writeHead(200, {
              'content-type': 'multipart/x-mixed-replace; boundary=fjoscam-panasonic',
              'cache-control': 'no-store, no-cache, must-revalidate',
              pragma: 'no-cache',
              connection: 'close',
              'access-control-allow-origin': '*',
            });
            void logSnapshot(`panasonic mjpeg proxy ${camera.host} content-type=${upstreamContentType ?? 'missing'}`);
            pipePanasonicMjpeg(upstream, response, upstreamContentType);
            request.on('close', () => upstream.destroy());
            return;
          }

          response.writeHead(200, {
            'content-type': 'multipart/x-mixed-replace; boundary=fjoscam',
            'cache-control': 'no-store, no-cache, must-revalidate',
            connection: 'close',
            'access-control-allow-origin': '*',
          });

          let closed = false;
          request.on('close', () => {
            closed = true;
          });

          while (!closed) {
            try {
              const frame = await this.reolink.getSnapshot(camera);
              response.write(`--fjoscam\r\ncontent-type: ${frame.contentType}\r\ncontent-length: ${frame.bytes.length}\r\n\r\n`);
              response.write(frame.bytes);
              response.write('\r\n');
            } catch {
              await sleep(500);
            }
            await sleep(180);
          }
          response.end();
          return;
        }

        const cameraResponse = await this.reolink.getSnapshot(camera);

        response.writeHead(200, {
          'content-type': cameraResponse.contentType,
          'cache-control': 'no-store',
          'access-control-allow-origin': '*',
        });
        response.end(cameraResponse.bytes);
      } catch (error) {
        void logSnapshot(`request failed ${request.url ?? 'unknown'}: ${error instanceof Error ? error.message : String(error)}`);
        response.writeHead(500).end(error instanceof Error ? error.message : 'Snapshot error');
      }
    });

    await new Promise<void>((resolve) => {
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

  getMjpegUrl(cameraId: string): string {
    if (!this.port) throw new Error('Snapshot server is not running.');
    return `http://127.0.0.1:${this.port}/mjpeg/${encodeURIComponent(cameraId)}`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.port = null;
    if (!server) return;

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logSnapshot(message: string): Promise<void> {
  await appendFile(join(app.getPath('userData'), 'snapshot-server.log'), `${new Date().toISOString()} ${message}\n`, 'utf8').catch(() => undefined);
}

function pipePanasonicMjpeg(upstream: NodeJS.ReadableStream, response: NodeJS.WritableStream & { destroyed?: boolean }, contentType?: string): void {
  const outputBoundary = 'fjoscam-panasonic';
  let buffer = Buffer.alloc(0);
  let frames = 0;

  upstream.on('data', (chunk: Buffer) => {
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
      writeMjpegFrame(response, outputBoundary, frame);
      frames += 1;
      if (frames === 1) void logSnapshot(`panasonic first frame proxied (${frame.length} bytes, ${contentType ?? 'no content-type'})`);
      buffer = buffer.subarray(frameEnd);
    }
  });

  upstream.on('end', () => {
    if (!response.destroyed) response.end();
  });
  upstream.on('error', (error) => {
    void logSnapshot(`panasonic upstream error: ${error instanceof Error ? error.message : String(error)}`);
    if (!response.destroyed) response.end();
  });
}

function writeMjpegFrame(response: NodeJS.WritableStream, boundary: string, frame: Buffer): void {
  response.write(`--${boundary}\r\ncontent-type: image/jpeg\r\ncontent-length: ${frame.length}\r\n\r\n`);
  response.write(frame);
  response.write('\r\n');
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
