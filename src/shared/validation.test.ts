import { describe, expect, it } from 'vitest';
import { cameraHttpOrigin, cameraPathUrl, normalizeHost, validateCameraInput, rtspsEndpoint, isRtspsTrust } from './validation.js';
import type { CameraInput } from './types.js';

const validInput: CameraInput = {
  name: 'Midtgarde 823A',
  host: '192.168.1.30',
  protocol: 'http',
  httpPort: 80,
  rtspPort: 554,
  username: 'admin',
  password: 'secret',
  channel: 0,
  streamChannel: 0,
  lowLatency: true,
};

describe('validateCameraInput', () => {
  it('accepts a normal Reolink LAN camera config', () => {
    expect(validateCameraInput(validInput)).toEqual([]);
  });

  it('rejects missing required fields and invalid ports', () => {
    const errors = validateCameraInput({ ...validInput, name: '', host: '', httpPort: 0, rtspPort: 70000 });
    expect(errors).toContain('Camera name is required.');
    expect(errors).toContain('IP or host is required.');
    expect(errors).toContain('HTTP port must be between 1 and 65535.');
    expect(errors).toContain('RTSP port must be between 1 and 65535.');
  });

  it('allows an empty password when editing an existing camera', () => {
    expect(validateCameraInput({ ...validInput, password: '' }, { requirePassword: false })).toEqual([]);
  });

  it('rejects Panasonic paths and camera hosts that could leak credentials', () => {
    const camera = { ...validInput, kind: 'panasonic' as const, mjpegPath: '/image', ptzPath: '/control' };
    expect(validateCameraInput(camera)).toEqual([]);
    for (const path of ['//other.invalid/image', 'https://other.invalid/image', 'file:///image', 'http://user:pass@192.168.1.30/image', '\\\\other.invalid\\image']) {
      expect(validateCameraInput({ ...camera, mjpegPath: path })).toContain('Camera address or path is invalid. Paths must stay on the configured camera.');
    }
    expect(() => cameraHttpOrigin({ ...validInput, host: 'camera@other.invalid' })).toThrow();
    expect(cameraPathUrl(camera, '/image?Quality=Standard').href).toBe('http://192.168.1.30/image?Quality=Standard');
    expect(cameraHttpOrigin({ host: '[::1]', protocol: 'https', httpPort: 443 })).toBe('https://[::1]');
  });
});

describe('normalizeHost', () => {
  it('strips protocol and path from user-entered host', () => {
    expect(normalizeHost('http://192.168.1.30/live')).toBe('192.168.1.30');
  });
});

describe('RTSPS certificate boundaries', () => {
  it('canonicalizes endpoints without credentials or stream tokens', () => {
    expect(rtspsEndpoint('rtsps://user:pass@CAMERA.local/private?token=secret#transport=tcp')).toBe('rtsps://camera.local:554');
    expect(rtspsEndpoint('rtsps://user:pass@[::1]:7441/stream')).toBe('rtsps://[::1]:7441');
    for (const value of ['rtsp://camera', 'rtsps://camera:0', 'rtsps://cam%65ra/']) expect(() => rtspsEndpoint(value)).toThrow();
  });

  it('requires canonical, endpoint-bound trust with a SHA256 fingerprint', () => {
    const rtspsTrust = { origin: 'rtsps://camera:554', fingerprint256: Array(32).fill('AB').join(':') };
    const input = { ...validInput, kind: 'generic' as const, streamUrl: 'rtsps://camera/stream', rtspsTrust };
    expect(validateCameraInput(input)).toEqual([]);
    for (const origin of ['rtsps://camera', 'rtsps://camera:554/', 'rtsps://user:pass@camera:554', 'rtsps://camera:554?token=secret']) {
      expect(isRtspsTrust({ ...rtspsTrust, origin })).toBe(false);
    }
    expect(validateCameraInput({ ...input, streamUrl: 'rtsps://camera:7441/stream' }).length).toBeGreaterThan(0);
    expect(validateCameraInput({ ...input, kind: 'reolink' }).length).toBeGreaterThan(0);
  });
});
