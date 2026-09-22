// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ReolinkClient } from './reolinkClient.js';
import type { CameraWithSecret } from '../shared/types.js';
import { requestJson } from './request.js';
vi.mock('./request.js', () => ({ requestJson: vi.fn(), requestBinary: vi.fn() }));

const camera: CameraWithSecret = { id: 'test', name: 'Test', host: '192.0.2.1', protocol: 'https',
  httpPort: 8443, rtspPort: 554, username: 'test', password: 'synthetic-password', channel: 0,
  streamChannel: 0, lowLatency: false };

describe('connection-test IPC result', () => {
  it.each([
    { name: ' Camera name ', model: 'Model', expected: 'Camera name' },
    { name: '', model: ' Model name ', expected: 'Model name' },
  ])('reads device information once when the profile contains $expected', async ({ name, model, expected }) => {
    const commands: string[] = [];
    vi.mocked(requestJson).mockImplementation(async (_url, body) => {
      const command = (body as Array<{ cmd: string }>)[0].cmd;
      commands.push(command);
      if (command === 'Login') return [{ code: 0, value: { Token: { name: 'synthetic-token' } } }];
      if (command === 'GetDevInfo') return [{ code: 0, value: { DevInfo: { name, model } } }];
      return [{ code: 0, value: {} }];
    });
    const result = await new ReolinkClient().testConnection(camera);
    expect(result.ok).toBe(true);
    expect(result.cameraName).toBe(expected);
    expect(commands.filter((command) => command === 'GetDevInfo')).toHaveLength(1);
    expect(commands).toContain('GetEnc');
  });

  it('retains the name retry when the profile device request fails', async () => {
    let deviceRequests = 0;
    vi.mocked(requestJson).mockImplementation(async (_url, body) => {
      const command = (body as Array<{ cmd: string }>)[0].cmd;
      if (command === 'Login') return [{ code: 0, value: { Token: { name: 'synthetic-token' } } }];
      if (command === 'GetDevInfo') {
        if (++deviceRequests === 1) throw new Error('Synthetic network failure');
        return [{ code: 0, value: { DevInfo: { name: 'Recovered name' } } }];
      }
      return [{ code: 0, value: {} }];
    });
    const result = await new ReolinkClient().testConnection(camera);
    expect(result.ok).toBe(true);
    expect(result.cameraName).toBe('Recovered name');
    expect(deviceRequests).toBe(2);
  });

  it('does not expose a credential-bearing RTSP URL', async () => {
    const client = new ReolinkClient();
    vi.spyOn(client, 'getToken').mockResolvedValue('synthetic-token');
    vi.spyOn(client, 'getPresets').mockResolvedValue([]);
    vi.spyOn(client, 'getCameraName').mockResolvedValue('Test');
    vi.spyOn(client, 'getStreamInfo').mockResolvedValue({});
    vi.spyOn(client, 'getProfile').mockRejectedValue(new Error('Unsupported'));
    const result = await client.testConnection({ password: 'synthetic-password' } as CameraWithSecret);
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty('streamUrl');
    expect(JSON.stringify(result)).not.toContain('synthetic-password');
    expect(JSON.stringify(result)).not.toContain('synthetic-token');
  });

  it('does not restore a session when login finishes after logout', async () => {
    let release!: (value: unknown) => void;
    const firstLogin = new Promise((resolve) => { release = resolve; });
    let logins = 0;
    const commands: string[] = [];
    vi.mocked(requestJson).mockImplementation(async (_url, body) => {
      const command = (body as Array<{ cmd: string }>)[0].cmd;
      commands.push(command);
      if (command === 'Login') {
        logins++;
        if (logins === 1) return firstLogin;
        return [{ code: 0, value: { Token: { name: 'new-synthetic-token' } } }];
      }
      return [{ code: 0 }];
    });
    const client = new ReolinkClient();
    const pending = client.getToken(camera);
    const rejected = expect(pending).rejects.toThrow('cancelled');
    await client.logoutAll();
    release([{ code: 0, value: { Token: { name: 'old-synthetic-token' } } }]);
    await rejected;
    expect(commands).toEqual(['Login', 'Logout']);
    await expect(client.getToken(camera)).resolves.toBe('new-synthetic-token');
    expect(logins).toBe(2);
  });

  it('never downgrades a configured HTTPS login to HTTP', async () => {
    const protocols: string[] = [];
    vi.mocked(requestJson).mockImplementation(async (url) => {
      protocols.push(url.protocol);
      throw Object.assign(new Error('Synthetic refused connection'), { code: 'ECONNREFUSED' });
    });
    await expect(new ReolinkClient().getToken(camera)).rejects.toThrow('refused');
    expect(protocols).toEqual(['https:', 'https:']);
  });

  it('does not reuse HTTP fallback or a token after changing HTTPS trust or protocol', async () => {
    const urls: string[] = [];
    vi.mocked(requestJson).mockImplementation(async (url) => {
      urls.push(url.origin);
      if (url.port === '8080' || (url.protocol === 'https:' && url.port !== '8443')) {
        throw Object.assign(new Error('Synthetic refused connection'), { code: 'ECONNREFUSED' });
      }
      return [{ code: 0, value: { Token: { name: `synthetic-${urls.length}` } } }];
    });
    const client = new ReolinkClient();
    await client.getToken({ ...camera, protocol: 'http', httpPort: 8080 });
    expect(urls).toEqual(['http://192.0.2.1:8080', 'https://192.0.2.1', 'http://192.0.2.1']);
    urls.length = 0;
    await client.getToken(camera);
    const trust = { origin: 'https://192.0.2.1:8443', fingerprint256: Array(32).fill('AB').join(':') };
    await client.getToken({ ...camera, httpsTrust: trust });
    expect(urls).toEqual(['https://192.0.2.1:8443', 'https://192.0.2.1:8443']);
    expect(vi.mocked(requestJson).mock.lastCall?.[3]).toEqual(trust);
  });

  it('does not retry a rejected HTTPS certificate on another endpoint', async () => {
    vi.mocked(requestJson).mockClear();
    vi.mocked(requestJson).mockRejectedValue(Object.assign(new Error('Certificate rejected'), { code: 'FJOSCAM_TLS_CERTIFICATE' }));
    await expect(new ReolinkClient().getToken(camera)).rejects.toThrow('Certificate rejected');
    expect(requestJson).toHaveBeenCalledTimes(1);
  });

  it('retires old tokens without a Logout using removed certificate trust', async () => {
    vi.mocked(requestJson).mockClear();
    vi.mocked(requestJson).mockResolvedValue([{ code: 0, value: { Token: { name: 'synthetic' } } }]);
    const trusted = { ...camera, httpsTrust: { origin: 'https://192.0.2.1:8443', fingerprint256: Array(32).fill('AB').join(':') } };
    const client = new ReolinkClient();
    await client.getToken(trusted);
    client.updateCameraConfiguration(camera.id, camera);
    await client.logoutAll();
    await expect(client.getToken(trusted)).rejects.toThrow('configuration changed');
    expect(requestJson).toHaveBeenCalledTimes(1);
    await client.getToken(camera);
    expect(requestJson).toHaveBeenCalledTimes(2);
    expect(vi.mocked(requestJson).mock.lastCall?.[3]).toBeUndefined();
  });

  it('discards a pending old login after certificate trust is removed', async () => {
    vi.mocked(requestJson).mockClear();
    let release!: (value: unknown) => void;
    vi.mocked(requestJson).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const trusted = { ...camera, httpsTrust: { origin: 'https://192.0.2.1:8443', fingerprint256: Array(32).fill('AB').join(':') } };
    const client = new ReolinkClient();
    const pending = client.getToken(trusted);
    const rejected = expect(pending).rejects.toThrow('configuration changed');
    client.updateCameraConfiguration(camera.id, camera);
    release([{ code: 0, value: { Token: { name: 'synthetic' } } }]);
    await rejected;
    await client.logoutAll();
    expect(requestJson).toHaveBeenCalledTimes(1);
  });
});
