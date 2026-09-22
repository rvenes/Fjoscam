// @vitest-environment node
import { createServer, type Server, type RequestListener } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { openPanasonicStream } from './panasonicClient.js';
import { requestBinary, requestJson } from './request.js';
import { CameraHttpError } from './cameraErrors.js';
import { ReolinkClient } from './reolinkClient.js';
import type { CameraWithSecret } from '../shared/types.js';

const servers: Server[] = [];
async function serve(handler: RequestListener): Promise<URL> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  return new URL(`http://127.0.0.1:${address.port}/`);
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  })));
});

describe('bounded camera transport', () => {
  it.each(['headers', 'body', 'redirect'])('aborts an in-flight binary request during %s and closes its socket', async (phase) => {
    let started!: () => void; const ready = new Promise<void>((resolve) => { started = resolve; });
    let ended!: () => void; const closed = new Promise<void>((resolve) => { ended = resolve; });
    const url = await serve((req, res) => {
      if (phase === 'redirect' && req.url === '/') { res.writeHead(302, { location: '/final' }).end(); return; }
      res.on('close', ended);
      if (phase === 'body') res.writeHead(200, { 'content-type': 'image/jpeg' }).write(Buffer.from([0xff, 0xd8]));
      started();
    });
    const abort = new AbortController();
    const reading = requestBinary(url, 2, undefined, abort.signal);
    const rejected = expect(reading).rejects.toThrow(/cancelled|interrupted|failed/);
    await ready; abort.abort(new Error('synthetic-sensitive-reason')); await rejected; await closed;
  });
  it('does not open an already-cancelled request or reflect the abort reason', async () => {
    let calls = 0;
    const url = await serve((_req, res) => { calls++; res.end(); });
    const abort = new AbortController(); abort.abort(new Error('synthetic-sensitive-reason'));
    await expect(requestBinary(url, 2, undefined, abort.signal)).rejects.toThrow(/^Camera request was cancelled\.$/);
    expect(calls).toBe(0);
  });
  it('aborts a pending Panasonic stream before response headers and closes the socket', async () => {
    let started!: () => void; const ready = new Promise<void>((resolve) => { started = resolve; });
    let ended!: () => void; const closed = new Promise<void>((resolve) => { ended = resolve; });
    const url = await serve((_req, res) => { res.on('close', ended); started(); });
    const abort = new AbortController();
    const camera: CameraWithSecret = { id: 'local', kind: 'panasonic', name: 'Synthetic', host: '127.0.0.1', protocol: 'http',
      httpPort: Number(url.port), rtspPort: 554, username: 'synthetic', password: 'synthetic', channel: 0, streamChannel: 0, lowLatency: false };
    const stream = openPanasonicStream(camera, abort.signal); const rejected = expect(stream).rejects.toThrow('cancelled');
    await ready; abort.abort(); await rejected; await closed;
  });
  it.each(['http401', 'json200'])('recovers a real loopback snapshot exchange after %s expiry', async (kind) => {
    let logins = 0;
    const tokens: Array<string | null> = [];
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const url = await serve((req, res) => {
      const query = new URL(req.url!, 'http://127.0.0.1').searchParams;
      req.resume();
      req.on('end', () => {
        if (query.get('cmd') === 'Login') {
          logins++;
          res.end(JSON.stringify([{ code: 0, value: { Token: { name: `synthetic-${logins}`, leaseTime: 3600 } } }]));
          return;
        }
        tokens.push(query.get('token'));
        if (tokens.length === 1) {
          res.writeHead(kind === 'http401' ? 401 : 200, { 'content-type': 'text/html' });
          res.end(JSON.stringify([{ code: 1, error: { rspCode: -6, detail: 'please login first' } }]));
        } else res.writeHead(200, { 'content-type': 'image/jpeg' }).end(jpeg);
      });
    });
    const camera: CameraWithSecret = { id: 'loopback', name: 'Synthetic', host: '127.0.0.1',
      protocol: 'http', httpPort: Number(url.port), rtspPort: 554, username: 'synthetic', password: 'synthetic',
      channel: 0, streamChannel: 0, lowLatency: false };
    await expect(new ReolinkClient().getSnapshot(camera)).resolves.toEqual({ bytes: jpeg, contentType: 'image/jpeg' });
    expect(logins).toBe(2);
    expect(tokens).toEqual(['synthetic-1', 'synthetic-2']);
  });

  it('preserves structured HTTP status without response text for JSON and binary requests', async () => {
    const url = await serve((_req, res) => res.writeHead(401).end('synthetic-password'));
    for (const request of [() => requestJson(url, {}), () => requestBinary(url)]) {
      const error = await request().catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(CameraHttpError);
      expect(error).toMatchObject({ status: 401, message: 'Camera HTTP 401' });
      expect(JSON.stringify(error)).not.toContain('synthetic-password');
      expect(error).not.toHaveProperty('cause');
    }
  });

  it('rejects a truncated response promptly', async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { 'content-length': 100 });
      res.write('{');
      setTimeout(() => res.destroy(), 10);
    });
    await expect(requestJson(url, {})).rejects.toThrow(/interrupted|failed/);
  });

  it('stops a continually trickling response at the total deadline', async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200);
      const interval = setInterval(() => res.write(' '), 30);
      res.on('close', () => clearInterval(interval));
    });
    const start = Date.now();
    await expect(requestJson(url, {})).rejects.toThrow('timed out');
    expect(Date.now() - start).toBeLessThan(7500);
  }, 9000);

  it('rejects oversized JSON and does not reflect camera errors or malformed JSON', async () => {
    const huge = await serve((_req, res) => res.end(Buffer.alloc(4 * 1024 * 1024 + 1, 32)));
    await expect(requestJson(huge, {})).rejects.toThrow('size limit');
    const bad = await serve((_req, res) => res.writeHead(500).end('synthetic-password'));
    await expect(requestJson(bad, {})).rejects.toThrow(/^Camera HTTP 500$/);
    const malformed = await serve((_req, res) => res.end('synthetic-password'));
    await expect(requestJson(malformed, {})).rejects.toThrow(/^Camera returned a non-JSON response\.$/);
  });

  it('follows a same-host redirect and preserves the body', async () => {
    const url = await serve((req, res) => {
      if (req.url === '/') { res.writeHead(307, { location: '/login' }).end(); return; }
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => res.end(Buffer.concat(chunks)));
    });
    await expect(requestJson(url, { command: 'test' })).resolves.toEqual({ command: 'test' });
  });

  it('blocks cross-host credential redirects before contacting the target', async () => {
    let contacted = false;
    const target = await serve((_req, res) => { contacted = true; res.end('{}'); });
    target.hostname = 'localhost';
    const url = await serve((_req, res) => res.writeHead(307, { location: target.href }).end());
    await expect(requestJson(url, { password: 'synthetic-password' })).rejects.toThrow('blocked');
    expect(contacted).toBe(false);
  });
});
