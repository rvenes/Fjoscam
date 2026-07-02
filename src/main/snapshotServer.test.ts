import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
  },
}));

import { SnapshotServer } from './snapshotServer.js';
import type { CameraStore } from './store.js';
import type { ReolinkClient } from './reolinkClient.js';

type FetchResult = { statusCode: number; headers: Record<string, string | string[] | undefined>; body: Buffer };

function fetchUrl(url: string): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () =>
        resolve({ statusCode: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }),
      );
    });
    request.on('error', reject);
  });
}

describe('SnapshotServer', () => {
  let server: SnapshotServer | null = null;

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it('serves a snapshot without a CORS header', async () => {
    const store = {
      getCameraWithSecret: async () => ({ id: 'cam1', kind: 'reolink' }),
    } as unknown as CameraStore;
    const reolink = {
      getSnapshot: async () => ({ bytes: Buffer.from('jpeg-bytes'), contentType: 'image/jpeg' }),
    } as unknown as ReolinkClient;

    server = new SnapshotServer(store, reolink);
    await server.start();

    const result = await fetchUrl(server.getSnapshotUrl('cam1'));
    expect(result.statusCode).toBe(200);
    expect(result.body.toString('utf8')).toBe('jpeg-bytes');
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers 500 when the camera lookup fails, without crashing the server', async () => {
    const store = {
      getCameraWithSecret: async () => {
        throw new Error('Camera not found.');
      },
    } as unknown as CameraStore;
    const reolink = {} as unknown as ReolinkClient;

    server = new SnapshotServer(store, reolink);
    await server.start();

    const failed = await fetchUrl(server.getSnapshotUrl('missing'));
    expect(failed.statusCode).toBe(500);

    // The server must still answer new requests after a failure.
    const second = await fetchUrl(server.getSnapshotUrl('missing'));
    expect(second.statusCode).toBe(500);
  });

  it('answers 404 for unknown paths', async () => {
    const store = {} as unknown as CameraStore;
    const reolink = {} as unknown as ReolinkClient;

    server = new SnapshotServer(store, reolink);
    const port = await server.start();

    const result = await fetchUrl(`http://127.0.0.1:${port}/nope`);
    expect(result.statusCode).toBe(404);
  });
});
