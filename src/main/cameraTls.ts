import { Agent, type RequestOptions } from 'node:https';
import { isIP } from 'node:net';
import { connect, type TLSSocket } from 'node:tls';
import type { Duplex } from 'node:stream';
import type { CertificateInfo, HttpsTarget, HttpsTrust } from '../shared/types.js';
import { cameraHttpOrigin, isHttpsTrust, rtspsEndpoint } from '../shared/validation.js';

const handshakeTimeoutMs = 6000;

function tlsOptions(origin: string) {
  const url = new URL(origin);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  return { host, port: Number(url.port || 443), servername: isIP(host) ? undefined : host };
}

function certificateError(): Error {
  return Object.assign(new Error('Camera HTTPS certificate was not trusted. Inspect it in camera settings; verify the fingerprint before trusting it.'), { code: 'FJOSCAM_TLS_CERTIFICATE' });
}

export function cameraTlsError(error: Error): Error {
  const code = (error as NodeJS.ErrnoException).code || '';
  return /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/.test(code) ? certificateError() : error;
}

// This probe sends only a TLS handshake: no HTTP, camera password or token.
// Seeing a certificate is not proof of identity; the user must verify it separately.
export function inspectCameraCertificate(target: HttpsTarget): Promise<CertificateInfo> {
  const origin = cameraHttpOrigin(target);
  if (target.protocol !== 'https') throw new Error('Certificate inspection requires HTTPS.');
  return inspectTlsCertificate(origin);
}

export function inspectStreamCertificate(streamUrl: string): Promise<CertificateInfo> {
  return inspectTlsCertificate(rtspsEndpoint(streamUrl));
}

function inspectTlsCertificate(origin: string): Promise<CertificateInfo> {
  return new Promise((resolve, reject) => {
    const socket = connect({ ...tlsOptions(origin), rejectUnauthorized: false });
    const timer = setTimeout(() => socket.destroy(new Error('Camera certificate inspection timed out.')), handshakeTimeoutMs);
    socket.once('error', () => reject(new Error('Could not inspect the camera TLS certificate. Check its address, port and availability.')));
    socket.once('close', () => { clearTimeout(timer); reject(new Error('Camera closed the certificate inspection connection.')); });
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert.fingerprint256) reject(certificateError());
      else resolve({ origin, fingerprint256: cert.fingerprint256, subject: String(cert.subject?.CN || '').slice(0, 256),
        issuer: String(cert.issuer?.CN || '').slice(0, 256), validFrom: cert.valid_from, validTo: cert.valid_to });
      socket.destroy();
    });
  });
}

// A pinned connection is not exposed to HTTP until its actual peer is checked.
// checkServerIdentity alone is insufficient when rejectUnauthorized is false.
// A request owns this agent; no pooled connection or TLS session can cross pins.
export class PinnedHttpsAgent extends Agent {
  private readonly pending = new Set<TLSSocket>();
  constructor(private readonly trust: HttpsTrust) {
    super({ keepAlive: false, maxCachedSessions: 0 });
    if (!isHttpsTrust(trust)) throw certificateError();
  }

  override createConnection(_options: RequestOptions, callback?: (err: Error | null, stream: Duplex) => void): undefined {
    const socket = connect({ ...tlsOptions(this.trust.origin), rejectUnauthorized: false });
    this.pending.add(socket);
    let finished = false;
    const timer = setTimeout(() => socket.destroy(new Error('Camera TLS handshake timed out.')), handshakeTimeoutMs);
    const finish = (error: Error | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      this.pending.delete(socket);
      if (error) socket.destroy();
      callback?.(error, socket);
    };
    socket.on('error', (error) => finish(cameraTlsError(error)));
    socket.once('close', () => finish(new Error('Camera closed the TLS connection.')));
    socket.once('secureConnect', () => {
      socket.disableRenegotiation();
      finish(socket.getPeerCertificate().fingerprint256 === this.trust.fingerprint256 ? null : certificateError());
    });
    return undefined;
  }

  override destroy(): void {
    for (const socket of this.pending) socket.destroy(new Error('Camera request closed.'));
    super.destroy();
  }
}

export function pinnedAgent(url: URL, trust?: HttpsTrust): PinnedHttpsAgent | undefined {
  if (!trust) return undefined;
  // Never carry an exception across a redirect, protocol or port change.
  if (!isHttpsTrust(trust) || url.protocol !== 'https:' || url.origin !== trust.origin) throw certificateError();
  return new PinnedHttpsAgent(trust);
}
