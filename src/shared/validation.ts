import type { CameraInput, CertificateTrust, HttpsTarget, HttpsTrust } from './types.js';

export function isCameraInputShape(value: unknown): value is CameraInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const strings: Record<string, number> = { name: 256, host: 2048, username: 256, password: 4096 };
  const optionalStrings: Record<string, number> = { streamUrl: 8192, mjpegPath: 4096, ptzPath: 4096 };
  return Object.entries(strings).every(([key, limit]) => typeof input[key] === 'string' && input[key].length <= limit) &&
    Object.entries(optionalStrings).every(([key, limit]) => input[key] === undefined || (typeof input[key] === 'string' && input[key].length <= limit)) &&
    ['httpPort', 'rtspPort', 'channel', 'streamChannel'].every((key) => typeof input[key] === 'number') &&
    typeof input.lowLatency === 'boolean' && ['http', 'https'].includes(input.protocol as string) &&
    (input.kind === undefined || ['reolink', 'panasonic', 'generic'].includes(input.kind as string));
}

export function validateCameraInput(input: unknown, options: { requirePassword?: boolean; requireStreamUrl?: boolean } = { requirePassword: true }): string[] {
  if (!isCameraInputShape(input)) return ['Invalid camera settings. Check field types and lengths.'];
  const errors: string[] = [];
  if (input.lensMode !== undefined && !['auto', 'single', 'dual'].includes(input.lensMode)) errors.push('Invalid lens selection.');
  if (input.rtspsTrust !== undefined) {
    try {
      if (input.kind !== 'generic' || !isRtspsTrust(input.rtspsTrust) ||
          (input.streamUrl?.trim() && rtspsEndpoint(input.streamUrl) !== input.rtspsTrust.origin)) throw new Error();
    } catch { errors.push('RTSPS certificate trust does not match this stream. Inspect the certificate again.'); }
  }
  if (!input.name.trim()) errors.push('Camera name is required.');
  if (!input.host.trim()) errors.push('IP or host is required.');
  if (input.kind !== 'generic' && !input.username.trim()) errors.push('Username is required.');
  if (input.kind !== 'generic' && options.requirePassword !== false && !input.password) errors.push('Password is required.');
  if (input.kind === 'generic' && options.requireStreamUrl !== false && !input.streamUrl?.trim()) errors.push('Stream URL is required.');
  if (input.kind === 'generic' && input.streamUrl?.trim()) {
    try {
      const url = new URL(input.streamUrl.trim());
      if (!['rtsp:', 'rtsps:'].includes(url.protocol) || !url.hostname) throw new Error();
    } catch { errors.push('Stream URL must use RTSP or RTSPS.'); }
  }
  if (!isPort(input.httpPort)) errors.push('HTTP port must be between 1 and 65535.');
  if (!isPort(input.rtspPort)) errors.push('RTSP port must be between 1 and 65535.');
  if (input.allowInsecureOnvif !== undefined && typeof input.allowInsecureOnvif !== 'boolean') errors.push('ONVIF fallback must be explicitly enabled or disabled.');
  if (input.onvifPort !== undefined && !isPort(input.onvifPort)) errors.push('ONVIF port must be between 1 and 65535.');
  if (input.allowInsecureOnvif === true && input.kind !== undefined && input.kind !== 'reolink') errors.push('ONVIF fallback is only available for Reolink cameras.');
  if (input.kind !== 'generic') {
    try {
      const origin = cameraHttpOrigin(input);
      if (input.httpsTrust !== undefined && (!isHttpsTrust(input.httpsTrust) || input.protocol !== 'https' || input.httpsTrust.origin !== origin)) {
        errors.push('HTTPS certificate trust does not match this camera address. Inspect the certificate again.');
      }
      if (input.kind === 'panasonic') {
        for (const path of [input.mjpegPath, input.ptzPath]) cameraPathUrl(input, path || '/');
      }
    } catch { errors.push('Camera address or path is invalid. Paths must stay on the configured camera.'); }
  } else if (input.httpsTrust !== undefined) errors.push('HTTPS certificate trust is not used for generic streams.');
  if (input.kind === 'panasonic' && !input.mjpegPath?.trim()) errors.push('MJPEG path is required.');
  if (input.kind === 'panasonic' && !input.ptzPath?.trim()) errors.push('PTZ path is required.');
  if (input.channel < 0 || input.channel > 65535 || !Number.isSafeInteger(input.channel)) errors.push('Channel must be an integer from 0 to 65535.');
  if (input.streamChannel < 0 || input.streamChannel > 65535 || !Number.isSafeInteger(input.streamChannel)) errors.push('View channel must be an integer from 0 to 65535.');
  return errors;
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

export function normalizeHost(host: string): string {
  return host.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
}

export function cameraHttpOrigin(target: HttpsTarget): string {
  if (!target || !['http', 'https'].includes(target.protocol) || !isPort(target.httpPort) || typeof target.host !== 'string') throw new Error('Invalid camera address.');
  const host = normalizeHost(target.host);
  if (!host || /[@?#\s\\]/.test(host)) throw new Error('Invalid camera host.');
  const url = new URL(`${target.protocol}://${host}:${target.httpPort}`);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid camera address.');
  return url.origin;
}

export function cameraPathUrl(target: HttpsTarget, path: string): URL {
  const origin = cameraHttpOrigin(target);
  const url = new URL(path, origin);
  if (url.origin !== origin || url.username || url.password || url.hash) throw new Error('Camera path must stay on the configured camera.');
  return url;
}

export function isHttpsTrust(value: unknown): value is HttpsTrust {
  if (!value || typeof value !== 'object') return false;
  const pin = value as HttpsTrust;
  if (typeof pin.origin !== 'string' || typeof pin.fingerprint256 !== 'string' || !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(pin.fingerprint256)) return false;
  try { const url = new URL(pin.origin); return url.protocol === 'https:' && url.origin === pin.origin; }
  catch { return false; }
}

// WHATWG URL.origin is null for RTSPS. Always include its effective port and
// never copy userinfo, path, query or fragments into public certificate data.
export function rtspsEndpoint(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'rtsps:' || !url.hostname || /[%\\\s]/.test(url.hostname)) throw new Error();
    const port = Number(url.port || 554);
    if (!isPort(port)) throw new Error();
    return `rtsps://${url.hostname.toLowerCase()}:${port}`;
  } catch { throw new Error('Certificate inspection requires a valid RTSPS stream address.'); }
}

export function isRtspsTrust(value: unknown): value is CertificateTrust {
  if (!value || typeof value !== 'object') return false;
  const pin = value as CertificateTrust;
  try {
    return typeof pin.origin === 'string' && rtspsEndpoint(pin.origin) === pin.origin &&
      typeof pin.fingerprint256 === 'string' && /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(pin.fingerprint256);
  } catch { return false; }
}
