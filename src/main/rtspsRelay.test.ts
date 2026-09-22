// @vitest-environment node
import { X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { createServer as createTcpServer, type Socket } from 'node:net';
import { createServer, getCACertificates, setDefaultCACertificates, type Server } from 'node:tls';
import { WebSocket, type ClientOptions } from 'ws';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { tlsFixture } from '../test/tlsFixture.js';
import { inspectStreamCertificate } from './cameraTls.js';
import { connectRtsps, RtspsRelay } from './rtspsRelay.js';

describe('verified RTSPS transport', () => {
  let first: Awaited<ReturnType<typeof tlsFixture>>;
  let second: typeof first;
  let server: Server;
  let endpoint: string;
  let relay: RtspsRelay;
  let bytes: number;
  const sockets = new Set<Socket>();
  const clients = new Set<WebSocket>();
  const roots = getCACertificates('default');
  beforeAll(async () => { [first, second] = await Promise.all([tlsFixture(), tlsFixture('DNS:wrong.invalid')]); });
  beforeEach(async () => {
    bytes = 0;
    relay = new RtspsRelay();
    server = createServer(first, (socket) => {
      socket.on('error', () => {});
      socket.on('data', (data) => { bytes += data.length; socket.write(data); });
    });
    server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    server.on('tlsClientError', () => {});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    endpoint = `rtsps://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    setDefaultCACertificates(roots);
    for (const client of clients) client.terminate(); clients.clear();
    await relay.stop();
    for (const socket of sockets) socket.destroy(); sockets.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const pin = () => ({ origin: endpoint, fingerprint256: new X509Certificate(first.cert).fingerprint256 });
  async function client(url: string, options?: ClientOptions) {
    const ws = new WebSocket(url, options); clients.add(ws); ws.on('error', () => {});
    await once(ws, 'open'); return ws;
  }
  function closed(ws: WebSocket) { return new Promise<void>((resolve) => ws.once('close', () => resolve())); }

  it('inspects without sending RTSP data or returning credentials/path/query', async () => {
    const info = await inspectStreamCertificate(endpoint.replace('://', '://test:synthetic-secret@') + '/private-path?token=private-token');
    expect(info).toMatchObject(pin());
    expect(JSON.stringify(info)).not.toMatch(/synthetic-secret|private-path|private-token/);
    expect(bytes).toBe(0);
  });

  it('rejects an untrusted issuer by default before writing any RTSP bytes', async () => {
    const url = await relay.register('camera', endpoint);
    const ws = await client(url); const done = closed(ws);
    ws.send(Buffer.from('OPTIONS rtsp://test RTSP/1.0\r\n\r\n'));
    await done; expect(bytes).toBe(0);
  });

  it('verifies CA and hostname even when connecting to an IP address', async () => {
    setDefaultCACertificates([...roots, first.cert.toString(), second.cert.toString()]);
    const socket = await connectRtsps(endpoint); socket.destroy();
    server.setSecureContext(second);
    await expect(connectRtsps(endpoint)).rejects.toThrow('RTSPS certificate was not trusted.');
    expect(bytes).toBe(0);
  });

  it('pipes binary data in both directions and verifies again on reconnect', async () => {
    const url = await relay.register('camera', endpoint, pin());
    const ws = await client(url);
    // Several frames exercise stream backpressure without requiring camera codecs.
    const payload = Buffer.alloc(256 * 1024, 0x24);
    let received = Buffer.alloc(0);
    ws.on('message', (data, binary) => { expect(binary).toBe(true); received = Buffer.concat([received, data as Buffer]); });
    for (let i = 0; i < 4; i++) ws.send(payload);
    await vi.waitFor(() => expect(received.length).toBe(4 * payload.length));
    expect(received.equals(Buffer.alloc(4 * payload.length, 0x24))).toBe(true);
    const done = closed(ws); ws.terminate(); await done;
    server.setSecureContext(second); bytes = 0;
    const changed = await client(url); const changedClosed = closed(changed);
    changed.send(Buffer.from('never-send-credentials')); await changedClosed;
    expect(bytes).toBe(0);
    const nextPin = { origin: endpoint, fingerprint256: new X509Certificate(second.cert).fingerprint256 };
    const nextUrl = await relay.register('camera', endpoint, nextPin);
    expect(nextUrl).not.toBe(url);
    const next = await client(nextUrl); const echoed = once(next, 'message');
    next.send(Buffer.from('explicitly-retrusted')); expect((await echoed)[0].toString()).toBe('explicitly-retrusted');
  });

  it('revokes existing sockets and tokens immediately on settings change', async () => {
    const url = await relay.register('camera', endpoint, pin());
    const ws = await client(url); const echoed = once(ws, 'message');
    ws.send(Buffer.from('test')); await echoed;
    const done = closed(ws); relay.revoke('camera'); await done;
    await expect(client(url)).rejects.toThrow();
    await vi.waitFor(() => expect(sockets.size).toBe(0));
    expect(await relay.register('camera', endpoint, pin())).not.toBe(url);
  });

  it('rejects browser Origins, wrong Host and unknown route tokens', async () => {
    const url = await relay.register('camera', endpoint, pin());
    await expect(client(url, { origin: 'https://example.invalid' })).rejects.toThrow();
    await expect(client(url, { headers: { Host: 'example.invalid' } })).rejects.toThrow();
    await expect(client(url + 'wrong')).rejects.toThrow();
    expect(sockets.size).toBe(0);
  });

  it.each([false, true])('closes disallowed %s frames without passing them upstream', async (oversize) => {
    const url = await relay.register('camera', endpoint, pin());
    const ws = await client(url);
    const ready = once(ws, 'message'); ws.send(Buffer.from('ready')); await ready; bytes = 0;
    const done = closed(ws);
    ws.send(oversize ? Buffer.alloc(1024 * 1024 + 1) : 'text-is-not-RTSP-transport');
    await done; expect(bytes).toBe(0);
  });

  it('limits simultaneous connections per route', async () => {
    const url = await relay.register('camera', endpoint, pin());
    for (let i = 0; i < 4; i++) await client(url);
    await expect(client(url)).rejects.toThrow();
  });

  it('aborts stalled handshakes and closes them during shutdown', async () => {
    const stalled = createTcpServer(); const accepted = new Set<Socket>();
    stalled.on('connection', (socket) => { accepted.add(socket); socket.on('close', () => accepted.delete(socket)); socket.resume(); });
    stalled.listen(0, '127.0.0.1'); await once(stalled, 'listening');
    try {
      const target = `rtsps://127.0.0.1:${(stalled.address() as { port: number }).port}`;
      const abort = new AbortController(); const pending = connectRtsps(target, undefined, abort.signal);
      const rejected = expect(pending).rejects.toThrow('RTSPS'); abort.abort(); await rejected;
      const url = await relay.register('stalled', target);
      const ws = await client(url); const done = closed(ws);
      await relay.stop(); await done;
      await vi.waitFor(() => expect(accepted.size).toBe(0));
      await expect(relay.register('stalled', target)).rejects.toThrow('stopping');
    } finally { for (const socket of accepted) socket.destroy(); await new Promise<void>((resolve) => stalled.close(() => resolve())); }
  });

  it('times out a camera that accepts TCP but never completes TLS', async () => {
    const stalled = createTcpServer((socket) => { sockets.add(socket); socket.resume(); });
    stalled.listen(0, '127.0.0.1'); await once(stalled, 'listening');
    try {
      const start = Date.now();
      await expect(connectRtsps(`rtsps://127.0.0.1:${(stalled.address() as { port: number }).port}`)).rejects.toThrow('RTSPS');
      expect(Date.now() - start).toBeLessThan(6500);
    } finally { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => stalled.close(() => resolve())); }
  }, 8000);
});
