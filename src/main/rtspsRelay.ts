import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { isIP, type Socket } from 'node:net';
import { connect, type TLSSocket } from 'node:tls';
import { createWebSocketStream, WebSocket, WebSocketServer } from 'ws';
import type { CertificateTrust } from '../shared/types.js';
import { isRtspsTrust, rtspsEndpoint } from '../shared/validation.js';

type Route = { token: string; key: string; endpoint: string; trust?: CertificateTrust; connections: Set<() => void> };

// Resolves only after checking the actual socket; no RTSP byte can be written
// during a permissive handshake. Abort also tears down an established socket.
export function connectRtsps(endpoint: string, trust?: CertificateTrust, signal?: AbortSignal): Promise<TLSSocket> {
  if (rtspsEndpoint(endpoint) !== endpoint || (trust && (!isRtspsTrust(trust) || trust.origin !== endpoint))) {
    return Promise.reject(new Error('RTSPS certificate trust does not match the stream endpoint.'));
  }
  const url = new URL(endpoint);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: Number(url.port), servername: isIP(host) ? undefined : host,
      rejectUnauthorized: !trust });
    const abort = () => socket.destroy(new Error('RTSPS connection cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => socket.destroy(new Error('TLS timeout')), 5000);
    socket.on('error', () => {
      clearTimeout(timer);
      reject(new Error('RTSPS connection failed. Check the stream address and certificate in camera settings.'));
    });
    socket.once('close', () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new Error('RTSPS connection closed before verification.')); });
    socket.once('secureConnect', () => {
      clearTimeout(timer);
      if (trust && socket.getPeerCertificate().fingerprint256 !== trust.fingerprint256) {
        reject(new Error('RTSPS certificate changed. Verify it in camera settings before trusting it.'));
        socket.destroy(); return;
      }
      socket.disableRenegotiation();
      resolve(socket);
    });
    if (signal?.aborted) abort();
  });
}

export class RtspsRelay {
  private server?: Server;
  private port?: number;
  private starting?: Promise<void>;
  private closed = false;
  private readonly routes = new Map<string, Route>();
  private readonly tokens = new Map<string, Route>();
  private readonly sockets = new Set<Socket>();
  private active = 0;
  private readonly ws = new WebSocketServer({ noServer: true, clientTracking: false, perMessageDeflate: false, maxPayload: 1024 * 1024 });

  async register(id: string, source: string, trust?: CertificateTrust): Promise<string> {
    const endpoint = rtspsEndpoint(source);
    if (trust && (!isRtspsTrust(trust) || trust.origin !== endpoint)) throw new Error('RTSPS certificate trust does not match the stream endpoint.');
    await this.start();
    if (this.closed) throw new Error('RTSPS relay is stopping.');
    const key = createHash('sha256').update(JSON.stringify([source, trust])).digest('hex');
    let route = this.routes.get(id);
    if (route?.key !== key) {
      this.revoke(id);
      route = { key, endpoint, trust: trust ? { ...trust } : undefined, token: randomBytes(32).toString('hex'), connections: new Set() };
      this.routes.set(id, route); this.tokens.set(route.token, route);
    }
    return `ws://127.0.0.1:${this.port}/${route!.token}`;
  }

  revoke(id: string): void {
    const route = this.routes.get(id);
    if (!route) return;
    this.routes.delete(id); this.tokens.delete(route.token);
    for (const close of [...route.connections]) close();
  }

  async stop(): Promise<void> {
    this.closed = true;
    for (const id of this.routes.keys()) this.revoke(id);
    await this.starting?.catch(() => undefined);
    for (const socket of this.sockets) socket.destroy();
    const server = this.server; this.server = undefined; this.port = undefined;
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    this.ws.close();
  }

  private start(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('RTSPS relay is stopping.'));
    if (this.starting) return this.starting;
    if (this.port) return Promise.resolve();
    this.starting = new Promise<void>((resolve, reject) => {
      const server = this.server = createServer((_req, res) => res.writeHead(404).end());
      server.maxConnections = 64;
      server.headersTimeout = 5000;
      server.requestTimeout = 5000;
      server.on('connection', (socket) => {
        this.sockets.add(socket); socket.once('close', () => this.sockets.delete(socket));
        socket.setTimeout(5000, () => socket.destroy());
      });
      server.on('error', () => reject(new Error('Could not start the local RTSPS relay.')));
      server.on('upgrade', (req, socket, head) => {
        const route = this.tokens.get((req.url || '').slice(1));
        if (this.closed || !route || req.method !== 'GET' || req.headers.origin !== undefined ||
            req.headers.host !== `127.0.0.1:${this.port}` || this.active >= 32 || route.connections.size >= 4) {
          socket.destroy(); return;
        }
        (socket as Socket).setTimeout(0);
        this.ws.handleUpgrade(req, socket, head, (ws) => this.attach(route, ws));
      });
      server.listen(0, '127.0.0.1', () => {
        this.port = (server.address() as { port: number }).port;
        resolve();
      });
    }).finally(() => { this.starting = undefined; });
    return this.starting;
  }

  private attach(route: Route, ws: WebSocket): void {
    const abort = new AbortController();
    const stream = createWebSocketStream(ws, { highWaterMark: 64 * 1024 });
    let upstream: TLSSocket | undefined;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      this.active -= 1; route.connections.delete(close);
      abort.abort(); upstream?.destroy(); stream.destroy(); ws.terminate();
    };
    this.active += 1; route.connections.add(close);
    stream.on('error', close); stream.on('close', close);
    ws.on('error', close); ws.on('close', close);
    // Run before createWebSocketStream's message listener can push text into
    // an already-connected upstream socket.
    ws.prependListener('message', (_data, binary) => { if (!binary) close(); });
    void connectRtsps(route.endpoint, route.trust, abort.signal).then((socket) => {
      upstream = socket;
      if (closed) { socket.destroy(); return; }
      socket.on('error', close); socket.on('close', close);
      stream.pipe(socket).pipe(stream);
    }, close);
  }
}
