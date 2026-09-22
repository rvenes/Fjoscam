// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraWithSecret } from '../shared/types.js';
import { ReolinkClient } from './reolinkClient.js';
import { requestBinary, requestJson } from './request.js';
import { CameraHttpError, ReolinkApiError } from './cameraErrors.js';
import { OnvifClient } from './onvifClient.js';

vi.mock('./request.js', () => ({ requestJson: vi.fn(), requestBinary: vi.fn() }));
const camera: CameraWithSecret = { id: 'auth-test', name: 'Synthetic', host: '192.0.2.1', protocol: 'https',
  httpPort: 443, rtspPort: 554, username: 'synthetic', password: 'synthetic-password',
  channel: 0, streamChannel: 1, lowLatency: false };
const jpeg = { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), contentType: 'image/jpeg' };
const login = (name: string, leaseTime: unknown = 3600) => [{ code: 0, value: { Token: { name, leaseTime } } }];
const rejected = (rspCode: number, detail = 'synthetic-sensitive-detail') => [{ code: 1, error: { rspCode, detail } }];
const binaryError = (rspCode: number, contentType = 'text/html') => ({
  bytes: Buffer.from(JSON.stringify(rejected(rspCode))), contentType,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requestJson).mockResolvedValue(login('old-token'));
  vi.mocked(requestBinary).mockResolvedValue(jpeg);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('bounded Reolink authentication recovery', () => {
  it.each(['panasonic', 'generic'] as const)('rejects %s at the adapter boundary before login or camera control', async (kind) => {
    const client = new ReolinkClient(); const other = { ...camera, kind };
    await expect(client.getToken(other)).rejects.toThrow('does not support');
    await expect(client.playSiren(other)).rejects.toThrow('does not support');
    await expect(client.getSnapshot(other)).rejects.toThrow('does not support');
    expect(requestJson).not.toHaveBeenCalled(); expect(requestBinary).not.toHaveBeenCalled();
  });
  it('does not start a snapshot after its caller aborts during shared login', async () => {
    const delayed = deferred<unknown>(); const abort = new AbortController();
    vi.mocked(requestJson).mockImplementationOnce(() => delayed.promise as Promise<never>);
    const reading = new ReolinkClient().getSnapshot(camera, abort.signal);
    const rejected = expect(reading).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(requestJson).toHaveBeenCalledOnce());
    abort.abort(); delayed.resolve(login('late-token')); await rejected;
    expect(requestBinary).not.toHaveBeenCalled();
  });
  it.each(['text/html', 'application/json', 'image/jpeg'])('recovers Snap JSON token expiry with MIME %s', async (contentType) => {
    vi.mocked(requestJson).mockResolvedValueOnce(login('old-token')).mockResolvedValueOnce(login('new-token'));
    vi.mocked(requestBinary).mockResolvedValueOnce(binaryError(-6, contentType)).mockResolvedValueOnce(jpeg);
    await expect(new ReolinkClient().getSnapshot(camera)).resolves.toEqual(jpeg);
    expect(requestJson).toHaveBeenCalledTimes(2);
    const urls = vi.mocked(requestBinary).mock.calls.map(([url]) => url);
    expect(urls.map((url) => url.searchParams.get('token'))).toEqual(['old-token', 'new-token']);
    expect(urls.every((url) => url.searchParams.get('channel') === '1' && url.protocol === 'https:')).toBe(true);
  });

  it('recovers an HTTP 401 but does not retry HTTP 403', async () => {
    const client = new ReolinkClient();
    vi.mocked(requestJson).mockResolvedValueOnce(login('old-token')).mockResolvedValueOnce(login('new-token'));
    vi.mocked(requestBinary).mockRejectedValueOnce(new CameraHttpError(401)).mockResolvedValueOnce(jpeg);
    await expect(client.getSnapshot(camera)).resolves.toEqual(jpeg);
    vi.mocked(requestBinary).mockRejectedValueOnce(new CameraHttpError(403));
    await expect(client.getSnapshot(camera)).rejects.toMatchObject({ status: 403 });
    await expect(client.getToken(camera)).resolves.toBe('new-token');
    expect(requestJson).toHaveBeenCalledTimes(2);
    expect(requestBinary).toHaveBeenCalledTimes(3);
  });

  it('retries only once and backs off if the replacement token is also rejected', async () => {
    vi.useFakeTimers();
    vi.mocked(requestJson).mockResolvedValueOnce(login('old-token')).mockResolvedValue(login('new-token'));
    vi.mocked(requestBinary).mockResolvedValue(binaryError(-21));
    const client = new ReolinkClient();
    await expect(client.getSnapshot(camera)).rejects.toMatchObject({ rspCode: -21 });
    await expect(client.getSnapshot(camera)).rejects.toMatchObject({ rspCode: -21 });
    expect(requestJson).toHaveBeenCalledTimes(2);
    expect(requestBinary).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_001);
    vi.mocked(requestBinary).mockResolvedValue(jpeg);
    await expect(client.getSnapshot(camera)).resolves.toEqual(jpeg);
    expect(requestJson).toHaveBeenCalledTimes(3);
  });

  it.each([-4, -26, -27, -49])('does not relogin or expose camera detail for rspCode %s', async (code) => {
    const client = new ReolinkClient();
    await client.getToken(camera);
    vi.mocked(requestJson).mockResolvedValue(rejected(code, 'invalid session synthetic-password token=synthetic-token'));
    await expect(client.getPresets(camera)).rejects.toMatchObject({ rspCode: code });
    await expect(client.getPresets(camera)).rejects.not.toThrow('synthetic-');
    await expect(client.getToken(camera)).resolves.toBe('old-token');
    expect(vi.mocked(requestJson).mock.calls.filter(([, body]) => (body as Array<{ cmd: string }>)[0].cmd === 'Login')).toHaveLength(1);
  });

  it('retains the token after a network failure', async () => {
    const client = new ReolinkClient();
    vi.mocked(requestBinary).mockRejectedValue(new Error('Synthetic transport failure'));
    await expect(client.getSnapshot(camera)).rejects.toThrow('transport failure');
    await expect(client.getToken(camera)).resolves.toBe('old-token');
    expect(requestJson).toHaveBeenCalledOnce();
  });

  it('shares one refresh between concurrent Snap and JSON calls, including a late old-token rejection', async () => {
    const client = new ReolinkClient();
    await client.getToken(camera);
    const oldSnap = deferred<typeof jpeg>();
    const freshLogin = deferred<unknown>();
    vi.mocked(requestBinary).mockImplementationOnce(() => oldSnap.promise).mockResolvedValue(jpeg);
    vi.mocked(requestJson).mockImplementation(async (_url, body) => {
      if ((body as Array<{ cmd: string }>)[0].cmd === 'Login') return freshLogin.promise;
      return _url.searchParams.get('token') === 'old-token' ? rejected(-6) : [{ code: 0, value: { PtzPreset: [] } }];
    });
    const snap = client.getSnapshot(camera);
    const presets = client.getPresets(camera);
    const secondPresets = client.getPresets(camera);
    await vi.waitFor(() => expect(vi.mocked(requestJson).mock.calls.filter(([, body]) => (body as Array<{ cmd: string }>)[0].cmd === 'Login')).toHaveLength(2));
    freshLogin.resolve(login('new-token'));
    await expect(Promise.all([presets, secondPresets])).resolves.toEqual([[], []]);
    oldSnap.resolve(binaryError(-6));
    await expect(snap).resolves.toEqual(jpeg);
    await expect(client.getToken(camera)).resolves.toBe('new-token');
    expect(vi.mocked(requestJson).mock.calls.filter(([, body]) => (body as Array<{ cmd: string }>)[0].cmd === 'Login')).toHaveLength(2);
  });

  it.each(['all', 'other'] as const)('does not restore a session after logout %s during Snap', async (mode) => {
    const client = new ReolinkClient();
    await client.getToken(camera);
    const frame = deferred<typeof jpeg>();
    vi.mocked(requestBinary).mockReturnValue(frame.promise);
    const snap = client.getSnapshot(camera);
    const result = expect(snap).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(requestBinary).toHaveBeenCalledOnce());
    if (mode === 'all') await client.logoutAll(); else await client.logoutExcept('other');
    frame.resolve(binaryError(-6));
    await result;
    expect(vi.mocked(requestJson).mock.calls.filter(([, body]) => (body as Array<{ cmd: string }>)[0].cmd === 'Login')).toHaveLength(1);
  });

  it('cancels a pending login on camera switching and retains the selected camera login', async () => {
    const pending = deferred<unknown>();
    vi.mocked(requestJson).mockReturnValueOnce(pending.promise).mockResolvedValue(login('selected-token'));
    const client = new ReolinkClient();
    const first = client.getToken(camera);
    const rejectedFirst = expect(first).rejects.toThrow('cancelled');
    await client.getToken({ ...camera, id: 'selected' });
    await client.logoutExcept('selected');
    pending.resolve(login('discard-token'));
    await rejectedFirst;
    await expect(client.getToken({ ...camera, id: 'selected' })).resolves.toBe('selected-token');
    expect(vi.mocked(requestJson).mock.calls.map(([, body]) => (body as Array<{ cmd: string }>)[0].cmd)).toEqual(['Login', 'Login', 'Logout']);
  });

  it('discards a pending login after a password save with the same endpoint', async () => {
    const pending = deferred<unknown>();
    vi.mocked(requestJson).mockReturnValueOnce(pending.promise).mockResolvedValue(login('new-token'));
    const client = new ReolinkClient();
    const first = client.getToken(camera);
    const result = expect(first).rejects.toThrow('configuration changed');
    client.updateCameraConfiguration(camera.id, camera);
    await expect(client.getToken({ ...camera, password: 'synthetic-replacement' })).resolves.toBe('new-token');
    pending.resolve(login('old-token'));
    await result;
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('does not replay PTZ or invoke ONVIF after Stop invalidates a refresh', async () => {
    const client = new ReolinkClient();
    const input = { ...camera, allowInsecureOnvif: true };
    await client.getToken(input);
    const pending = deferred<unknown>();
    vi.mocked(requestJson).mockResolvedValueOnce(rejected(-6)).mockReturnValueOnce(pending.promise);
    const onvif = vi.spyOn(OnvifClient.prototype, 'sendPtz').mockResolvedValue();
    let current = true;
    const move = client.sendPtz(input, { kind: 'move', direction: 'Left', speed: 10 }, () => current);
    await vi.waitFor(() => expect(requestJson).toHaveBeenCalledTimes(3));
    current = false;
    pending.resolve(login('unused-token'));
    await move;
    expect(onvif).not.toHaveBeenCalled();
    expect(vi.mocked(requestJson).mock.calls.filter(([, body]) => (body as Array<{ cmd: string }>)[0].cmd === 'PtzCtrl')).toHaveLength(1);
  });

  it('does not try ONVIF to bypass an API ability/access denial', async () => {
    vi.mocked(requestJson).mockResolvedValueOnce(login('token')).mockResolvedValue(rejected(-26));
    const onvif = vi.spyOn(OnvifClient.prototype, 'sendPtz').mockResolvedValue();
    await expect(new ReolinkClient().sendPtz({ ...camera, allowInsecureOnvif: true }, { kind: 'move', direction: 'Left', speed: 10 }))
      .rejects.toMatchObject({ rspCode: -26 });
    expect(onvif).not.toHaveBeenCalled();
  });

  it('uses the reported lease with a margin instead of assuming 25 minutes', async () => {
    vi.useFakeTimers();
    vi.mocked(requestJson).mockResolvedValueOnce(login('short-token', 10)).mockResolvedValueOnce(login('new-token'));
    const client = new ReolinkClient();
    await client.getToken(camera);
    await vi.advanceTimersByTimeAsync(8000);
    await expect(client.getToken(camera)).resolves.toBe('short-token');
    await vi.advanceTimersByTimeAsync(1001);
    await expect(client.getToken(camera)).resolves.toBe('new-token');
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('backs off bad credentials until the delay expires or settings are saved', async () => {
    vi.useFakeTimers();
    const client = new ReolinkClient();
    vi.mocked(requestJson).mockResolvedValue(rejected(-502));
    await expect(client.getSnapshot(camera)).rejects.toMatchObject({ rspCode: -502 });
    await expect(client.getSnapshot(camera)).rejects.toMatchObject({ rspCode: -502 });
    expect(requestJson).toHaveBeenCalledOnce();
    expect(requestBinary).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_001);
    await expect(client.getSnapshot(camera)).rejects.toMatchObject({ rspCode: -502 });
    expect(requestJson).toHaveBeenCalledTimes(2);
    client.updateCameraConfiguration(camera.id, camera);
    vi.mocked(requestJson).mockResolvedValue(login('fixed-token'));
    await expect(client.getSnapshot(camera)).resolves.toEqual(jpeg);
  });

  it.each([null, {}, [], [null], [{ code: '0' }]])('rejects malformed API envelopes without leaking their content: %j', async (payload) => {
    vi.mocked(requestJson).mockResolvedValue(payload);
    await expect(new ReolinkClient().getToken(camera)).rejects.toThrow('invalid API response');
    expect(requestJson).toHaveBeenCalledOnce();
  });

  it('checks error envelopes even with code zero and supports exact legacy login-required detail', async () => {
    const client = new ReolinkClient();
    await client.getToken(camera);
    vi.mocked(requestJson).mockResolvedValueOnce([{ code: 0, error: { detail: 'please login first' } }])
      .mockResolvedValueOnce(login('refreshed-token')).mockResolvedValueOnce([{ code: 0, value: { PtzPreset: [] } }]);
    await expect(client.getPresets(camera)).resolves.toEqual([]);
    expect(requestJson).toHaveBeenCalledTimes(4);
    expect(new ReolinkApiError(-4, 'please login first').authenticationRequired).toBe(false);
  });
});
