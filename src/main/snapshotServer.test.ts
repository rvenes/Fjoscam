import { get } from 'node:http';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
  },
}));

import { pipePanasonicMjpeg, SnapshotServer, validateSnapshotFrame } from './snapshotServer.js';
import type { CameraStore } from './store.js';
import type { ReolinkClient } from './reolinkClient.js';
import { openPanasonicStream } from './panasonicClient.js';
vi.mock('./panasonicClient.js', () => ({ openPanasonicStream: vi.fn() }));

type FetchResult = { statusCode: number; headers: Record<string, string | string[] | undefined>; body: Buffer };

function fetchUrl(url: string, authorization?: string): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: authorization ? { authorization } : {} }, (response) => {
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
  beforeEach(() => { vi.mocked(openPanasonicStream).mockReset(); });
  let server: SnapshotServer | null = null;
  const fetchAuthorized = (url: string) => fetchUrl(url, server!.playbackAuthorization(url, 'GET'));

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it.each([['generic', 'snapshot'], ['generic', 'mjpeg'], ['panasonic', 'snapshot']] as const)('rejects %s %s before camera login or stream transport', async (kind, playback) => {
    const getSnapshot = vi.fn();
    server = new SnapshotServer({ getCameraWithSecret: async () => ({ id: 'cam1', kind }) } as unknown as CameraStore, { getSnapshot } as unknown as ReolinkClient);
    await server.start();
    const url = playback === 'mjpeg' ? server.getMjpegUrl('cam1') : server.getSnapshotUrl('cam1');
    expect((await fetchAuthorized(url)).statusCode).toBe(400);
    expect(getSnapshot).not.toHaveBeenCalled(); expect(openPanasonicStream).not.toHaveBeenCalled();
  });

  it('invalidates a pending camera lookup before it can open an upstream with old settings', async () => {
    let release!: (value: unknown) => void;
    const getCamera = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const getSnapshot = vi.fn();
    server = new SnapshotServer({ getCameraWithSecret: getCamera } as unknown as CameraStore, { getSnapshot } as unknown as ReolinkClient);
    await server.start();
    const url = server.getSnapshotUrl('cam1');
    const request = get(url, { headers: { authorization: server.playbackAuthorization(url, 'GET')! } });
    request.on('error', () => undefined);
    const closed = new Promise<void>((resolve) => request.on('close', resolve));
    await vi.waitFor(() => expect(getCamera).toHaveBeenCalledOnce());
    server.invalidateCamera('cam1'); await closed;
    release({ id: 'cam1', kind: 'reolink' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(getSnapshot).not.toHaveBeenCalled();
  });

  it('aborts a pending snapshot when its viewer disconnects without starting another polling iteration', async () => {
    let signal!: AbortSignal;
    const getSnapshot = vi.fn((_camera, abort: AbortSignal) => {
      signal = abort;
      return new Promise((_resolve, reject) => abort.addEventListener('abort', () => reject(new Error('Synthetic abort')), { once: true }));
    });
    server = new SnapshotServer({ getCameraWithSecret: async () => ({ id: 'cam1', kind: 'reolink' }) } as unknown as CameraStore, { getSnapshot } as unknown as ReolinkClient);
    await server.start();
    const url = server.getMjpegUrl('cam1');
    const request = get(url, { headers: { authorization: server.playbackAuthorization(url, 'GET')! } }); request.on('error', () => undefined);
    await vi.waitFor(() => expect(getSnapshot).toHaveBeenCalledOnce());
    request.destroy(); await vi.waitFor(() => expect(signal.aborted).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(getSnapshot).toHaveBeenCalledOnce();
  });

  it('closes only the invalidated Panasonic camera and retains the other viewer until releaseAll', async () => {
    const upstreams = new Map<string, PassThrough>(); const signals = new Map<string, AbortSignal>();
    vi.mocked(openPanasonicStream).mockImplementation(async (camera, signal) => {
      const upstream = Object.assign(new PassThrough(), { headers: {} });
      upstreams.set(camera.id, upstream); signals.set(camera.id, signal!);
      return upstream as unknown as Awaited<ReturnType<typeof openPanasonicStream>>;
    });
    server = new SnapshotServer({ getCameraWithSecret: async (id: string) => ({ id, kind: 'panasonic' }) } as unknown as CameraStore, {} as ReolinkClient);
    await server.start();
    for (const id of ['A', 'B']) {
      const url = server.getMjpegUrl(id);
      const request = get(url, { headers: { authorization: server.playbackAuthorization(url, 'GET')! } }, (response) => { response.on('error', () => undefined); response.resume(); });
      request.on('error', () => undefined);
    }
    await vi.waitFor(() => expect(upstreams.size).toBe(2));
    server.invalidateCamera('A');
    expect(signals.get('A')!.aborted).toBe(true);
    await vi.waitFor(() => expect(upstreams.get('A')!.destroyed).toBe(true));
    expect(signals.get('B')!.aborted).toBe(false); expect(upstreams.get('B')!.destroyed).toBe(false);
    expect(server.getPlaybackHealth(server.getMjpegUrl('A')).ended).toBe(true);
    server.releaseAll();
    expect(signals.get('B')!.aborted).toBe(true);
    await vi.waitFor(() => expect(upstreams.get('B')!.destroyed).toBe(true));
  });

  it('serves a snapshot without a CORS header', async () => {
    const store = {
      getCameraWithSecret: async () => ({ id: 'cam1', kind: 'reolink' }),
    } as unknown as CameraStore;
    const reolink = {
      getSnapshot: async () => ({ bytes: Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]), contentType: 'image/jpeg' }),
    } as unknown as ReolinkClient;

    server = new SnapshotServer(store, reolink);
    await server.start();

    const url = server.getSnapshotUrl('cam1');
    expect((await fetchUrl(url)).statusCode).toBe(401);
    const result = await fetchAuthorized(url);
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual(Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]));
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

    const failed = await fetchAuthorized(server.getSnapshotUrl('missing'));
    expect(failed.statusCode).toBe(500);

    // The server must still answer new requests after a failure.
    const second = await fetchAuthorized(server.getSnapshotUrl('missing'));
    expect(second.statusCode).toBe(500);
  });

  it('answers 404 for unknown paths', async () => {
    const store = {} as unknown as CameraStore;
    const reolink = {} as unknown as ReolinkClient;

    server = new SnapshotServer(store, reolink);
    const port = await server.start();

    const auth = server.playbackAuthorization(server.getSnapshotUrl('cam1'), 'GET');
    const result = await fetchUrl(`http://127.0.0.1:${port}/nope`, auth);
    expect(result.statusCode).toBe(404);
  });

  it('rejects text or truncated data advertised as an image before counting a frame', () => {
    expect(() => validateSnapshotFrame({ bytes: Buffer.from('login required'), contentType: 'image/jpeg' })).toThrow('image');
    expect(() => validateSnapshotFrame({ bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), contentType: 'image/png' })).toThrow('image');
    expect(() => validateSnapshotFrame({ bytes: Buffer.from([0xff, 0xd8, 1]), contentType: 'image/jpeg' })).toThrow('image');
    expect(() => validateSnapshotFrame({ bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), contentType: 'application/json' })).toThrow('image');
    expect(() => validateSnapshotFrame({ bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), contentType: 'image/jpeg; charset=binary' })).not.toThrow();
  });

  it('does not serve a login response as a successful snapshot', async () => {
    server = new SnapshotServer({ getCameraWithSecret: async () => ({ id: 'cam1' }) } as unknown as CameraStore,
      { getSnapshot: async () => ({ bytes: Buffer.from('login required'), contentType: 'image/jpeg' }) } as unknown as ReolinkClient);
    await server.start();
    expect((await fetchAuthorized(server.getSnapshotUrl('cam1'))).statusCode).toBe(500);
  });

  it('ends a malformed legacy stream without an unbounded JPEG buffer', () => {
    const upstream = new PassThrough();
    const output = new PassThrough();
    output.resume();
    pipePanasonicMjpeg(upstream, output);
    upstream.write(Buffer.from([0xff, 0xd8]));
    upstream.write(Buffer.alloc(16 * 1024 * 1024));
    expect(upstream.destroyed).toBe(true);
    expect(output.writableEnded).toBe(true);
  });

  it('retains legacy JPEG marker parsing across multipart chunks', async () => {
    const upstream = new PassThrough();
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (chunk) => chunks.push(chunk));
    pipePanasonicMjpeg(upstream, output);
    upstream.write(Buffer.from('nonstandard camera header\r\n'));
    upstream.write(Buffer.from([0xff]));
    upstream.write(Buffer.from([0xd8, 1, 2, 0xff]));
    upstream.end(Buffer.from([0xd9]));
    await new Promise<void>((resolve) => output.on('end', resolve));
    expect(Buffer.concat(chunks).includes(Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]))).toBe(true);
    expect(Buffer.concat(chunks).toString()).toContain('content-length: 6');
  });

  it('tests Panasonic using the first legacy JPEG and closes the upstream afterwards', async () => {
    const upstream = Object.assign(new PassThrough(), { headers: {} });
    vi.mocked(openPanasonicStream).mockResolvedValueOnce(upstream as unknown as Awaited<ReturnType<typeof openPanasonicStream>>);
    server = new SnapshotServer({} as CameraStore, {} as ReolinkClient);
    const result = server.testPanasonic({ kind: 'panasonic' } as never);
    await Promise.resolve();
    upstream.write(Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]));
    expect(await result).toMatchObject({ ok: true, scope: 'mjpeg' });
    expect(upstream.destroyed).toBe(true);
  });

  it('fails a Panasonic test when the stream ends without JPEG data', async () => {
    const upstream = Object.assign(new PassThrough(), { headers: {} });
    vi.mocked(openPanasonicStream).mockResolvedValueOnce(upstream as unknown as Awaited<ReturnType<typeof openPanasonicStream>>);
    server = new SnapshotServer({} as CameraStore, {} as ReolinkClient);
    const result = server.testPanasonic({ kind: 'panasonic' } as never);
    await Promise.resolve(); upstream.end('not an image');
    expect(await result).toMatchObject({ ok: false, scope: 'mjpeg' });
    expect(upstream.destroyed).toBe(true);
  });

  it('reports per-request MJPEG frame age and a closed upstream', async () => {
    const upstream = Object.assign(new PassThrough(), { headers: {} });
    vi.mocked(openPanasonicStream).mockResolvedValueOnce(upstream as unknown as Awaited<ReturnType<typeof openPanasonicStream>>);
    server = new SnapshotServer({ getCameraWithSecret: async () => ({ kind: 'panasonic' }) } as unknown as CameraStore, {} as ReolinkClient);
    await server.start();
    const url = server.getMjpegUrl('cam1') + '?r=3';
    const fetching = fetchAuthorized(url);
    await vi.waitFor(() => expect(server!.getPlaybackHealth(url).ready).toBe(true));
    upstream.write(Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]));
    await vi.waitFor(() => expect(server!.getPlaybackHealth(url).frames).toBe(1));
    expect(server.getPlaybackHealth(url)).toMatchObject({ ended: false, frameAgeMs: expect.any(Number) });
    expect(server.getPlaybackHealth(url.replace('r=3', 'r=4')).frames).toBe(0);
    upstream.end(); await fetching;
    expect(server.getPlaybackHealth(url).ended).toBe(true);
  });

  it('destroys a late upstream when the browser disconnected during stream setup', async () => {
    let release!: (value: Awaited<ReturnType<typeof openPanasonicStream>>) => void;
    const opening = new Promise<Awaited<ReturnType<typeof openPanasonicStream>>>((resolve) => { release = resolve; });
    vi.mocked(openPanasonicStream).mockReturnValueOnce(opening);
    const store = { getCameraWithSecret: async () => ({ id: 'cam1', kind: 'panasonic' }) } as unknown as CameraStore;
    server = new SnapshotServer(store, {} as ReolinkClient);
    await server.start();
    const url = server.getMjpegUrl('cam1');
    const request = get(url, { headers: { authorization: server.playbackAuthorization(url, 'GET')! } });
    request.on('error', () => undefined);
    await vi.waitFor(() => expect(openPanasonicStream).toHaveBeenCalled());
    request.destroy();
    // close() drains accepted connections and proves the response closed before
    // the pending camera connection is allowed to finish.
    await server.stop();
    expect(vi.mocked(openPanasonicStream).mock.calls.at(-1)![1]!.aborted).toBe(true);
    const upstream = Object.assign(new PassThrough(), { headers: { 'content-type': 'multipart/x-mixed-replace' } });
    release(upstream as unknown as Awaited<ReturnType<typeof openPanasonicStream>>);
    await vi.waitFor(() => expect(upstream.destroyed).toBe(true));
  });
});
