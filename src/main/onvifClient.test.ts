// @vitest-environment node
import { createServer, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnvifClient } from './onvifClient.js';
import type { CameraWithSecret } from '../shared/types.js';

const servers: Server[] = [];
const clients: OnvifClient[] = [];
function newClient() { const client = new OnvifClient(); clients.push(client); return client; }
const camera: CameraWithSecret = { id: 'synthetic', kind: 'reolink', name: 'Test', host: '127.0.0.1', protocol: 'https',
  httpPort: 443, rtspPort: 554, username: 'synthetic-user', password: 'synthetic-secret', channel: 0, streamChannel: 0,
  lowLatency: false, allowInsecureOnvif: true };
const move = { kind: 'move', direction: 'Left', speed: 10 } as const;
const profiles = '<trt:GetProfilesResponse><trt:Profiles token="video-only"></trt:Profiles><trt:Profiles token="ptz-profile"><tt:PTZConfiguration/></trt:Profiles></trt:GetProfilesResponse>';
function soap(body: string) { return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema" xmlns:tds="http://www.onvif.org/ver10/device/wsdl"><s:Body>${body}</s:Body></s:Envelope>`; }
function capabilities(origin: string, media = '/custom/media', ptz = '/custom/ptz') {
  return soap(`<tds:GetCapabilitiesResponse><tds:Capabilities><tt:Media><tt:XAddr>${origin}${media}</tt:XAddr></tt:Media><tt:PTZ><tt:XAddr>${origin}${ptz}</tt:XAddr></tt:PTZ></tds:Capabilities></tds:GetCapabilitiesResponse>`);
}

async function serve(handler?: (body: string, response: ServerResponse) => void, discovery = false) {
  const requests: Array<{ path: string; body: string }> = [];
  const server = createServer((req, res) => {
    let body = ''; req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ path: req.url!, body });
      if (!discovery && body.includes('<tds:GetCapabilities>')) { res.writeHead(404).end(); return; }
      if (handler) handler(body, res);
      else res.end(soap(body.includes('<trt:GetProfiles') ? profiles : body.includes('<tptz:Stop>') ? '<tptz:StopResponse/>' : '<tptz:ContinuousMoveResponse/>'));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { requests, onvifPort: (server.address() as { port: number }).port };
}
afterEach(async () => {
  for (const client of clients.splice(0)) client.updateCameraConfiguration(camera.id);
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); })));
});

describe('explicit ONVIF HTTP boundary', () => {
  it('requires an explicit boolean opt-in on a Reolink camera before any request', async () => {
    const endpoint = await serve();
    for (const settings of [{ allowInsecureOnvif: undefined }, { allowInsecureOnvif: false },
      { allowInsecureOnvif: 'true' as unknown as boolean }, { kind: 'generic' as const }, { kind: 'panasonic' as const }]) {
      await expect(newClient().sendPtz({ ...camera, onvifPort: endpoint.onvifPort, ...settings }, move)).rejects.toThrow('disabled');
    }
    expect(endpoint.requests).toHaveLength(0);
  });

  it('uses the configured port and PTZ profile, preserves WS-Security and sends a bounded movement plus Stop', async () => {
    const endpoint = await serve();
    const client = newClient();
    const input = { ...camera, onvifPort: endpoint.onvifPort };
    await client.sendPtz(input, move);
    await client.sendPtz(input, { kind: 'stop' });
    expect(endpoint.requests.map((req) => req.path)).toEqual(['/onvif/device_service', '/onvif/media_service', '/onvif/ptz_service', '/onvif/ptz_service']);
    const motion = endpoint.requests[2].body;
    expect(motion).toContain('<tptz:ProfileToken>ptz-profile</tptz:ProfileToken>');
    expect(motion).toContain('<tptz:Timeout>PT1S</tptz:Timeout>');
    expect(motion).toContain('#PasswordDigest');
    expect(motion).not.toContain(camera.password);
    expect(endpoint.requests[3].body).toContain('<tptz:PanTilt>true</tptz:PanTilt>');
    expect(endpoint.requests[3].body).toContain('<tptz:Zoom>true</tptz:Zoom>');
  });

  it('never forwards authentication in a redirect', async () => {
    const other = await serve();
    const endpoint = await serve((_body, res) => res.writeHead(307, { location: `http://127.0.0.1:${other.onvifPort}/onvif/media_service` }).end());
    await expect(newClient().sendPtz({ ...camera, onvifPort: endpoint.onvifPort }, move)).rejects.toThrow('redirect');
    expect(other.requests).toHaveLength(0);
  });

  it('rejects SOAP faults, malformed responses and video-only profiles without reflecting response contents', async () => {
    for (const [response, error] of [
      [soap('<s:Fault><s:Reason>private-upstream-detail</s:Reason></s:Fault>'), 'SOAP fault'],
      ['private-upstream-detail', 'unexpected response'],
      [soap('<trt:GetProfilesResponse><trt:Profiles token="video-only"/></trt:GetProfilesResponse>'), 'PTZ profile'],
    ]) {
      const endpoint = await serve((_body, res) => res.end(response));
      const result = newClient().sendPtz({ ...camera, onvifPort: endpoint.onvifPort }, move);
      await expect(result).rejects.toThrow(error);
      await expect(result).rejects.not.toThrow('private-upstream-detail');
      expect(endpoint.requests).toHaveLength(2);
    }
  });

  it('discards delayed profiles after permission is revoked', async () => {
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const endpoint = await serve((_body, res) => { release = () => res.end(soap(profiles)); started(); });
    const input = { ...camera, onvifPort: endpoint.onvifPort };
    const client = newClient();
    const pending = client.sendPtz(input, move);
    await ready;
    client.updateCameraConfiguration(camera.id, { ...input, allowInsecureOnvif: false });
    release();
    await pending;
    await expect(client.sendPtz(input, move)).rejects.toThrow('settings changed');
    expect(endpoint.requests).toHaveLength(2);
  });

  it('does not reuse profile tokens after endpoint or credential changes', async () => {
    const first = await serve(); const second = await serve();
    const client = newClient();
    await client.sendPtz({ ...camera, onvifPort: first.onvifPort }, move);
    await client.sendPtz({ ...camera, onvifPort: second.onvifPort }, move);
    await client.sendPtz({ ...camera, onvifPort: second.onvifPort, password: 'synthetic-replacement' }, move);
    expect(first.requests).toHaveLength(3);
    expect(second.requests.filter((req) => req.path === '/onvif/media_service')).toHaveLength(2);
  });

  it('invalidates the profile after a rejected command instead of reporting success', async () => {
    let rejectMove = true;
    const endpoint = await serve((body, res) => {
      if (body.includes('GetProfiles')) res.end(soap(profiles));
      else if (rejectMove) res.end(soap('<s:Fault><s:Reason>synthetic</s:Reason></s:Fault>'));
      else res.end(soap('<tptz:ContinuousMoveResponse/>'));
    });
    const client = newClient(); const input = { ...camera, onvifPort: endpoint.onvifPort };
    await expect(client.sendPtz(input, move)).rejects.toThrow('SOAP fault');
    rejectMove = false;
    await client.sendPtz(input, move);
    expect(endpoint.requests.filter((req) => req.path === '/onvif/media_service')).toHaveLength(2);
  });

  it('stops uncertain movement using its original profile without rediscovery', async () => {
    const endpoint = await serve((body, res) => {
      if (body.includes('GetProfiles')) res.end(soap(profiles));
      else if (body.includes('<tptz:Stop>')) res.end(soap('<tptz:StopResponse/>'));
      else res.destroy(); // The move reached the camera, but its reply was lost.
    });
    const client = newClient(); const input = { ...camera, onvifPort: endpoint.onvifPort };
    await expect(client.sendPtz(input, move)).rejects.toThrow();
    await client.sendPtz(input, { kind: 'stop' });
    expect(endpoint.requests).toHaveLength(4);
    expect(endpoint.requests[3].body).toContain('<tptz:Stop>');
    expect(endpoint.requests[3].body).toContain('<tptz:ProfileToken>ptz-profile</tptz:ProfileToken>');
  });

  it('discovers custom addresses, caches them, and keeps the original Stop address after expiry and failed motion', async () => {
    const endpoint = await serve((body, res) => {
      if (body.includes('GetCapabilities')) res.end(capabilities(`http://127.0.0.1:${endpoint.onvifPort}`));
      else if (body.includes('GetProfiles')) res.end(soap(profiles));
      else if (body.includes('<tptz:Stop>')) res.end(soap('<tptz:StopResponse/>'));
      else res.destroy();
    }, true);
    const client = newClient(); const input = { ...camera, onvifPort: endpoint.onvifPort };
    await expect(client.sendPtz(input, move)).rejects.toThrow();
    const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 6 * 60_000);
    try { await client.sendPtz(input, { kind: 'stop' }); } finally { clock.mockRestore(); }
    expect(endpoint.requests.map((request) => request.path)).toEqual(['/onvif/device_service', '/custom/media', '/custom/ptz', '/custom/ptz']);
  });

  it('blocks foreign or credential-bearing discovery addresses before sending a profile request', async () => {
    const other = await serve();
    for (const origin of [`http://127.0.0.1:${other.onvifPort}`, 'http://synthetic-user:synthetic-secret@127.0.0.1:1', 'https://127.0.0.1:1']) {
      const endpoint = await serve((_body, res) => res.end(capabilities(origin)), true);
      const pending = newClient().sendPtz({ ...camera, onvifPort: endpoint.onvifPort }, move);
      await expect(pending).rejects.toThrow('blocked');
      await expect(pending).rejects.not.toThrow('synthetic-secret');
      expect(endpoint.requests).toHaveLength(1);
    }
    expect(other.requests).toHaveLength(0);
  });

  it('does not use legacy paths after authentication, malformed discovery or an ordinary SOAP fault', async () => {
    for (const status of [401, 403, 500, 200]) {
      const endpoint = await serve((_body, res) => res.writeHead(status).end(status === 200 ? soap('<s:Fault/>') : 'private-detail'), true);
      await expect(newClient().sendPtz({ ...camera, onvifPort: endpoint.onvifPort }, move)).rejects.toThrow();
      expect(endpoint.requests).toHaveLength(1);
    }
  });

  it('uses legacy paths only for a qualified ActionNotSupported SOAP fault', async () => {
    const endpoint = await serve((body, res) => {
      if (body.includes('GetCapabilities')) res.end(soap('<s:Fault><s:Code><s:Subcode><s:Value xmlns:ter="http://www.onvif.org/ver10/error">ter:ActionNotSupported</s:Value></s:Subcode></s:Code></s:Fault>'));
      else res.end(soap(body.includes('GetProfiles') ? profiles : '<tptz:ContinuousMoveResponse/>'));
    }, true);
    await newClient().sendPtz({ ...camera, onvifPort: endpoint.onvifPort }, move);
    expect(endpoint.requests.map((request) => request.path)).toEqual(['/onvif/device_service', '/onvif/media_service', '/onvif/ptz_service']);
  });

  it('shares simultaneous discovery, reuses it until expiry, and refreshes after expiry', async () => {
    const endpoint = await serve(); const input = { ...camera, onvifPort: endpoint.onvifPort }; const client = newClient();
    await Promise.all([client.sendPtz(input, move), client.sendPtz(input, move)]);
    await client.sendPtz(input, move);
    expect(endpoint.requests.filter((request) => request.body.includes('GetProfiles'))).toHaveLength(1);
    const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 6 * 60_000);
    try { await client.sendPtz(input, move); } finally { clock.mockRestore(); }
    expect(endpoint.requests.filter((request) => request.body.includes('GetProfiles'))).toHaveLength(2);
  });

  it('does not continue discovery after configuration changes during GetCapabilities', async () => {
    let release!: () => void; let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const endpoint = await serve((_body, res) => { release = () => res.end(capabilities(`http://127.0.0.1:${endpoint.onvifPort}`)); started(); }, true);
    const client = newClient(); const input = { ...camera, onvifPort: endpoint.onvifPort };
    const pending = client.sendPtz(input, move); await ready;
    client.updateCameraConfiguration(input.id, { ...input, allowInsecureOnvif: false }); release();
    await expect(pending).rejects.toThrow('settings changed');
    expect(endpoint.requests).toHaveLength(1);
  });

  it('waits for an in-flight renewal before Stop and never renews after release', async () => {
    let moves = 0; let release!: () => void; let started!: () => void;
    const renewing = new Promise<void>((resolve) => { started = resolve; });
    const endpoint = await serve((body, res) => {
      if (body.includes('GetProfiles')) res.end(soap(profiles));
      else if (body.includes('<tptz:Stop>')) res.end(soap('<tptz:StopResponse/>'));
      else if (++moves === 2) { release = () => res.end(soap('<tptz:ContinuousMoveResponse/>')); started(); }
      else res.end(soap('<tptz:ContinuousMoveResponse/>'));
    });
    const client = newClient(); const input = { ...camera, onvifPort: endpoint.onvifPort }; let current = true;
    await client.sendPtz(input, move, () => current); await renewing;
    current = false; const stop = client.sendPtz(input, { kind: 'stop' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(endpoint.requests.some((request) => request.body.includes('<tptz:Stop>'))).toBe(false);
    release(); await stop;
    const count = endpoint.requests.length;
    await new Promise((resolve) => setTimeout(resolve, 650));
    expect(endpoint.requests).toHaveLength(count);
    expect(endpoint.requests.at(-1)?.body).toContain('<tptz:Stop>'); expect(moves).toBe(2);
  });
});
