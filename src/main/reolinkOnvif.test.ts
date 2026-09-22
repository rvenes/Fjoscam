// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReolinkClient } from './reolinkClient.js';
import { OnvifClient } from './onvifClient.js';
import type { CameraWithSecret } from '../shared/types.js';

const camera: CameraWithSecret = { id: 'test', kind: 'reolink', name: 'Test', host: '192.0.2.1', protocol: 'https',
  httpPort: 443, rtspPort: 554, username: 'synthetic', password: 'synthetic', channel: 0, streamChannel: 0, lowLatency: false };
const move = { kind: 'move', direction: 'Left', speed: 10 } as const;
const refused = () => Object.assign(new Error('Synthetic offline API'), { code: 'ECONNREFUSED' });
afterEach(() => vi.restoreAllMocks());

describe('Reolink ONVIF fallback policy and Stop routing', () => {
  it('requires opt-in when the HTTPS API is unavailable', async () => {
    const client = new ReolinkClient();
    vi.spyOn(client, 'getToken').mockRejectedValue(refused());
    const onvif = vi.spyOn(OnvifClient.prototype, 'sendPtz').mockResolvedValue();
    await expect(client.sendPtz(camera, move)).rejects.toThrow('fallback is disabled');
    expect(onvif).not.toHaveBeenCalled();
    await client.sendPtz({ ...camera, allowInsecureOnvif: true }, move);
    expect(onvif).toHaveBeenCalledOnce();
  });

  it('never falls back on certificate rejection even with ONVIF enabled', async () => {
    const client = new ReolinkClient();
    vi.spyOn(client, 'getToken').mockRejectedValue(Object.assign(new Error('Certificate rejected'), { code: 'FJOSCAM_TLS_CERTIFICATE' }));
    const onvif = vi.spyOn(OnvifClient.prototype, 'sendPtz').mockResolvedValue();
    await expect(client.sendPtz({ ...camera, allowInsecureOnvif: true }, move)).rejects.toThrow('Certificate rejected');
    expect(onvif).not.toHaveBeenCalled();
  });

  it('sends Stop through ONVIF without a new API login after an uncertain ONVIF move', async () => {
    const client = new ReolinkClient();
    const login = vi.spyOn(client, 'getToken').mockRejectedValue(refused());
    const onvif = vi.spyOn(OnvifClient.prototype, 'sendPtz').mockRejectedValueOnce(new Error('Synthetic movement response timed out')).mockResolvedValue();
    const input = { ...camera, allowInsecureOnvif: true };
    await expect(client.sendPtz(input, move)).rejects.toThrow('timed out');
    await client.sendPtz(input, { kind: 'stop' });
    expect(login).toHaveBeenCalledOnce();
    expect(onvif).toHaveBeenLastCalledWith(input, { kind: 'stop' }, expect.any(Function));
  });

  it('does not fall back when permission was revoked during the API request', async () => {
    let reject!: (error: Error) => void;
    const client = new ReolinkClient();
    vi.spyOn(client, 'getToken').mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    const onvif = vi.spyOn(OnvifClient.prototype, 'sendPtz').mockResolvedValue();
    const pending = client.sendPtz({ ...camera, allowInsecureOnvif: true }, move);
    const result = expect(pending).rejects.toThrow('configuration changed');
    client.updateCameraConfiguration(camera.id, { ...camera, allowInsecureOnvif: false });
    reject(refused());
    await result;
    expect(onvif).not.toHaveBeenCalled();
  });
});
