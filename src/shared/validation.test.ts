import { describe, expect, it } from 'vitest';
import { normalizeHost, validateCameraInput } from './validation.js';
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
});

describe('normalizeHost', () => {
  it('strips protocol and path from user-entered host', () => {
    expect(normalizeHost('http://192.168.1.30/live')).toBe('192.168.1.30');
  });
});
