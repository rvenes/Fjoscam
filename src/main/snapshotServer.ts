import { createServer, type Server } from 'node:http';
import type { CameraStore } from './store.js';
import type { ReolinkClient } from './reolinkClient.js';

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

        const camera = await this.store.getCameraWithSecret(decodeURIComponent(match[1]));
        if (mjpegMatch) {
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
