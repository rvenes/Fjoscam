// @vitest-environment node
import { createServer, type Server } from 'node:https';
import { createServer as createTcpServer, type Server as TcpServer } from 'node:net';
import type { Duplex } from 'node:stream';
import type { RequestListener } from 'node:http';
import { X509Certificate } from 'node:crypto';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { tlsFixture } from '../test/tlsFixture.js';
import { inspectCameraCertificate } from './cameraTls.js';
import { requestJson, requestBinary, requestText } from './request.js';
import { openPanasonicStream, PanasonicClient } from './panasonicClient.js';
import type { CameraWithSecret } from '../shared/types.js';

let certA: Awaited<ReturnType<typeof tlsFixture>>;
let certB: Awaited<ReturnType<typeof tlsFixture>>;
const servers: Array<Server | TcpServer> = [];
const sockets = new Set<Duplex>();
const originalCAs = getCACertificates('default');
beforeAll(async () => { certA = await tlsFixture(); certB = await tlsFixture('DNS:localhost'); }, 30000);
afterEach(async () => {
  setDefaultCACertificates(originalCAs);
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function serve(handler: RequestListener, identity = certA) {
  const server = createServer(identity, handler);
  servers.push(server);
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = new URL(`https://127.0.0.1:${(server.address() as { port: number }).port}/`);
  const trust = { origin: url.origin, fingerprint256: new X509Certificate(identity.cert).fingerprint256 };
  const target = { protocol: 'https' as const, host: url.hostname, httpPort: Number(url.port) };
  return { server, url, trust, target };
}

function camera(target: { host: string; protocol: 'https'; httpPort: number }): CameraWithSecret {
  return { id: 'test', kind: 'panasonic', name: 'Synthetic', ...target, rtspPort: 554, username: 'synthetic-user', password: 'synthetic-password', channel: 0, streamChannel: 0, lowLatency: false };
}

describe('camera HTTPS identity and credential boundary', () => {
  it('rejects untrusted JSON, snapshot, SOAP and Panasonic requests without sending credentials', async () => {
    let requests = 0;
    const { url, target } = await serve((_req, res) => { requests += 1; res.end('{}'); });
    await expect(requestJson(url, { password: 'synthetic-password' })).rejects.toThrow('certificate');
    await expect(requestBinary(url)).rejects.toThrow('certificate');
    await expect(requestText(url, '<password>synthetic</password>')).rejects.toThrow('certificate');
    await expect(openPanasonicStream(camera(target))).rejects.toThrow('certificate');
    expect(requests).toBe(0);
  });

  it('uses normal CA and hostname verification when there is no exception', async () => {
    setDefaultCACertificates([...originalCAs, certA.cert.toString(), certB.cert.toString()]);
    const good = await serve((_req, res) => res.end('{}'));
    await expect(requestJson(good.url, {})).resolves.toEqual({});
    let requests = 0;
    const wrongName = await serve((_req, res) => { requests += 1; res.end('{}'); }, certB);
    await expect(requestJson(wrongName.url, {})).rejects.toThrow('certificate');
    expect(requests).toBe(0);
  });

  it('inspects the peer certificate without making an HTTP request or trusting it', async () => {
    let requests = 0;
    const { url, target, trust } = await serve((_req, res) => { requests += 1; res.end('{}'); });
    await expect(inspectCameraCertificate(target)).resolves.toMatchObject(trust);
    await expect(requestJson(url, { password: 'synthetic' })).rejects.toThrow('certificate');
    expect(requests).toBe(0);
  });

  it('sends JSON only after matching the actual peer and rejects changed or revoked trust', async () => {
    const received: string[] = [];
    const { url, trust, server } = await serve((req, res) => {
      let body = ''; req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => { received.push(body); res.end('{}'); });
    });
    await expect(requestJson(url, { password: 'synthetic' }, 2, trust)).resolves.toEqual({});
    await expect(requestJson(url, { password: 'must-not-send' })).rejects.toThrow('certificate');
    server.setSecureContext(certB);
    await expect(requestJson(url, { password: 'must-not-send' }, 2, trust)).rejects.toThrow('certificate');
    expect(received).toEqual([JSON.stringify({ password: 'synthetic' })]);
  });

  it('keeps exceptions on their exact origin across redirects and rejects downgrades', async () => {
    let requests = 0;
    const other = await serve((_req, res) => { requests += 1; res.end('{}'); });
    const source = await serve((_req, res) => res.writeHead(307, { location: other.url.href }).end());
    await expect(requestJson(source.url, {}, 2, source.trust)).rejects.toThrow('blocked');
    await expect(requestJson(other.url, {}, 2, source.trust)).rejects.toThrow('certificate');
    expect(requests).toBe(0);
    setDefaultCACertificates([...originalCAs, certA.cert.toString()]);
    await expect(requestJson(source.url, {})).rejects.toThrow('blocked');
    expect(requests).toBe(0);
    const downgrade = await serve((_req, res) => res.writeHead(307, { location: 'http://127.0.0.1/' }).end());
    await expect(requestJson(downgrade.url, {}, 2, downgrade.trust)).rejects.toThrow('blocked');
  });

  it('allows same-origin HTTPS redirects with the same certificate', async () => {
    const { url, trust } = await serve((req, res) => {
      if (req.url === '/') res.writeHead(307, { location: '/api' }).end();
      else { req.resume(); req.on('end', () => res.end('{}')); }
    });
    await expect(requestJson(url, {}, 2, trust)).resolves.toEqual({});
  });

  it('verifies Panasonic Basic-auth streams, rejects certificate changes and foreign paths', async () => {
    const auth: string[] = [];
    const { target, trust, server } = await serve((req, res) => { auth.push(req.headers.authorization || ''); res.end('image'); });
    const input = { ...camera(target), httpsTrust: trust };
    const response = await openPanasonicStream(input);
    const chunks: Buffer[] = []; for await (const chunk of response) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('image');
    expect(auth).toEqual([`Basic ${Buffer.from('synthetic-user:synthetic-password').toString('base64')}`]);
    server.setSecureContext(certB);
    await expect(openPanasonicStream(input)).rejects.toThrow('certificate');
    expect(() => openPanasonicStream({ ...input, mjpegPath: 'https://elsewhere.invalid/image' })).toThrow('configured camera');
    await expect(new PanasonicClient().sendPtz({ ...input, ptzPath: '//elsewhere.invalid/control' }, { kind: 'preset', presetId: 1 })).rejects.toThrow('configured camera');
    expect(auth).toHaveLength(1);
  });

  it('closes a stalled TLS handshake within the request deadline', async () => {
    let closed = false;
    const server = createTcpServer((socket) => { sockets.add(socket); socket.on('data', () => {}); socket.on('close', () => { closed = true; sockets.delete(socket); }); });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = new URL(`https://127.0.0.1:${(server.address() as { port: number }).port}/`);
    const trust = { origin: url.origin, fingerprint256: new X509Certificate(certA.cert).fingerprint256 };
    await expect(requestJson(url, { password: 'must-not-send' }, 2, trust)).rejects.toThrow('timed out');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(closed).toBe(true);
  }, 9000);
});
