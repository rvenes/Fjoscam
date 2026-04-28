import type { CameraInput } from './types.js';

export function validateCameraInput(input: CameraInput, options: { requirePassword?: boolean } = { requirePassword: true }): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push('Camera name is required.');
  if (!input.host.trim()) errors.push('IP or host is required.');
  if (input.kind !== 'generic' && !input.username.trim()) errors.push('Username is required.');
  if (input.kind !== 'generic' && options.requirePassword !== false && !input.password) errors.push('Password is required.');
  if (input.kind === 'generic' && !input.streamUrl?.trim()) errors.push('Stream URL is required.');
  if (!isPort(input.httpPort)) errors.push('HTTP port must be between 1 and 65535.');
  if (!isPort(input.rtspPort)) errors.push('RTSP port must be between 1 and 65535.');
  if (input.kind === 'panasonic' && !input.mjpegPath?.trim()) errors.push('MJPEG path is required.');
  if (input.kind === 'panasonic' && !input.ptzPath?.trim()) errors.push('PTZ path is required.');
  if (input.channel < 0 || !Number.isInteger(input.channel)) errors.push('Channel must be zero or higher.');
  if (input.streamChannel < 0 || !Number.isInteger(input.streamChannel)) errors.push('View channel must be zero or higher.');
  return errors;
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

export function normalizeHost(host: string): string {
  return host.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
}
