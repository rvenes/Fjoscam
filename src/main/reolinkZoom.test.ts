// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReolinkClient } from './reolinkClient.js';
import { requestJson } from './request.js';
import { CameraHttpError } from './cameraErrors.js';
import type { CameraWithSecret } from '../shared/types.js';

vi.mock('./request.js', () => ({ requestJson: vi.fn(), requestBinary: vi.fn() }));
const camera: CameraWithSecret = { id: 'zoom', kind: 'reolink', name: 'Synthetic', host: '192.0.2.1', protocol: 'https',
  httpPort: 443, rtspPort: 554, username: 'synthetic', password: 'synthetic', channel: 0, streamChannel: 0, lowLatency: false };
const level = { kind: 'zoomLevel', level: 4 } as const;
let bounds: { min: number; max: number };
let position: number;
function state() { return [{ code: 0, value: { ZoomFocus: { zoom: { pos: position } } }, range: { ZoomFocus: { zoom: { pos: { ...bounds } } } } }]; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve };
}
function calls(command: string) { return vi.mocked(requestJson).mock.calls.filter(([url]) => url.searchParams.get('cmd') === command); }
function lastTarget() {
  const body = calls('StartZoomFocus').at(-1)![1] as Array<{ param: { ZoomFocus: { pos: number; channel: number } } }>;
  return body[0].param.ZoomFocus;
}
beforeEach(() => {
  vi.resetAllMocks(); bounds = { min: 0, max: 34 }; position = 12;
  vi.mocked(requestJson).mockImplementation(async (url, body) => {
    if (url.searchParams.get('cmd') === 'Login') return [{ code: 0, value: { Token: { name: 'synthetic-token', leaseTime: 3600 } } }] as never;
    if (url.searchParams.get('cmd') === 'GetZoomFocus') return state() as never;
    if (url.searchParams.get('cmd') === 'StartZoomFocus') position = (body as Array<{ param: { ZoomFocus: { pos: number } } }>)[0].param.ZoomFocus.pos;
    return [{ code: 0, value: {} }] as never;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Reolink zoom ownership and cache', () => {
  it('uses a fresh range after a channel change or an edit, instead of the old camera ID range', async () => {
    const client = new ReolinkClient(); await client.getZoomFocus(camera);
    bounds = { min: 1000, max: 6000 };
    await client.sendPtz({ ...camera, channel: 2 }, level);
    expect(lastTarget()).toMatchObject({ pos: 6000, channel: 2 });
    bounds = { min: 0, max: 20 };
    client.updateCameraConfiguration(camera.id, camera);
    await client.sendPtz(camera, level);
    expect(lastTarget().pos).toBe(20);
    expect(calls('GetZoomFocus')).toHaveLength(3);
    client.updateCameraConfiguration(camera.id);
    await expect(client.sendPtz(camera, level)).rejects.toThrow('configuration changed');
    expect(calls('StartZoomFocus')).toHaveLength(2);
  });
  it('expires zoom ranges after five minutes and does not expose a mutable cache object', async () => {
    vi.useFakeTimers(); const client = new ReolinkClient();
    const read = await client.getZoomFocus(camera); read.zoomRange!.max = 9999;
    await client.sendPtz(camera, level); expect(lastTarget().pos).toBe(34);
    bounds = { min: 0, max: 50 };
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await client.sendPtz(camera, level); expect(lastTarget().pos).toBe(50);
    expect(calls('GetZoomFocus')).toHaveLength(2);
  });
  it('bounds cache entries and refetches the evicted oldest camera', async () => {
    const client = new ReolinkClient();
    for (let index = 0; index < 129; index++) await client.getZoomFocus({ ...camera, id: `camera-${index}` });
    bounds = { min: 0, max: 70 };
    await client.sendPtz({ ...camera, id: 'camera-0' }, level);
    expect(calls('GetZoomFocus')).toHaveLength(130); expect(lastTarget().pos).toBe(70);
  });
  it('rejects a late old response after editing and never repopulates the cleared range', async () => {
    const client = new ReolinkClient(); const delayed = deferred<unknown>();
    vi.mocked(requestJson).mockResolvedValueOnce([{ code: 0, value: { Token: { name: 'synthetic-token' } } }]);
    vi.mocked(requestJson).mockImplementationOnce(() => delayed.promise as Promise<never>);
    const reading = client.getZoomFocus(camera); const rejected = expect(reading).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(calls('GetZoomFocus')).toHaveLength(1));
    client.updateCameraConfiguration(camera.id, camera);
    delayed.resolve(state()); await rejected;
    bounds = { min: 0, max: 80 };
    await client.sendPtz(camera, level); expect(lastTarget().pos).toBe(80);
    expect(calls('GetZoomFocus')).toHaveLength(2); // No stale action:0 fallback.
  });
  it('does not send absolute zoom after cancellation during a slow login', async () => {
    const client = new ReolinkClient(); await client.getZoomFocus(camera);
    const token = deferred<string>(); let active = true;
    const getToken = vi.spyOn(client, 'getToken').mockImplementationOnce(() => token.promise);
    const moving = client.sendPtz(camera, level, () => active); const rejected = expect(moving).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(getToken).toHaveBeenCalledOnce());
    active = false; token.resolve('synthetic-token'); await rejected;
    expect(calls('StartZoomFocus')).toHaveLength(0);
  });
  it('does not retry a zoom after cancellation during token renewal', async () => {
    const client = new ReolinkClient(); await client.getZoomFocus(camera);
    const token = deferred<unknown>(); let active = true;
    vi.mocked(requestJson).mockRejectedValueOnce(new CameraHttpError(401)).mockImplementationOnce(() => token.promise as Promise<never>);
    const moving = client.sendPtz(camera, level, () => active); const rejected = expect(moving).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(calls('Login')).toHaveLength(2));
    active = false; token.resolve([{ code: 0, value: { Token: { name: 'renewed-token' } } }]); await rejected;
    expect(calls('StartZoomFocus')).toHaveLength(1);
  });
  it('stops settle polling promptly when the queued move is cancelled', async () => {
    vi.useFakeTimers(); const client = new ReolinkClient(); let active = true;
    const moving = client.sendPtz(camera, { kind: 'zoomPosition', position: 20 }, () => active);
    const rejected = expect(moving).rejects.toThrow('cancelled');
    await vi.advanceTimersByTimeAsync(0); expect(calls('StartZoomFocus')).toHaveLength(1);
    active = false; await vi.advanceTimersByTimeAsync(300); await rejected;
    expect(calls('GetZoomFocus')).toHaveLength(1);
  });
  it('preserves successful absolute zoom settling and the returned position', async () => {
    vi.useFakeTimers(); const client = new ReolinkClient();
    const moving = client.setZoomPosition(camera, 100);
    await vi.advanceTimersByTimeAsync(300);
    await expect(moving).resolves.toMatchObject({ zoom: 34 }); expect(lastTarget().pos).toBe(34);
  });
});
