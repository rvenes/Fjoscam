// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateIpcArguments } from './ipcValidation.js';
import { validateCameraInput } from '../shared/validation.js';

const input = { name: 'Synthetic', host: 'camera.local', protocol: 'https', httpPort: 443, rtspPort: 554,
  username: 'synthetic', password: '', channel: 0, streamChannel: 1, lowLatency: false };

describe('IPC runtime boundary', () => {
  it.each([
    ['camera:ptz', ['camera', { kind: 'move', direction: 'exec:bad', speed: 10 }]],
    ['camera:ptz', ['camera', { kind: 'zoom', direction: 'in', speed: NaN }]],
    ['camera:ptz', ['camera', { kind: 'move', direction: 'Left', speed: 0 }]],
    ['camera:ptz', ['camera', null]],
    ['camera:ptz', ['camera', { kind: 'zoomLevel', level: 5 }]],
    ['camera:ptz', ['camera', { kind: 'focus', direction: 'in', speed: 10 }]],
    ['camera:set-stream-channel', ['camera', -1]],
    ['camera:set-stream-channel', ['camera', '1']],
    ['camera:set-stream-channel', ['camera', Infinity]],
    ['camera:set-stream-quality', ['camera', 'false']],
    ['camera:set-zoom-position', ['camera', NaN]],
    ['camera:save-preset', ['camera', 65, 'synthetic']],
    ['camera:save-preset', ['camera', 1, 'x'.repeat(32)]],
    ['camera:delete-preset', ['camera', 0]],
    ['camera:set-ir-lights', ['camera', 'invalid']],
    ['camera:set-white-led', ['camera', {}]],
    ['camera:set-white-led', ['camera', { brightness: NaN }]],
    ['camera:set-white-led', ['camera', { brightness: 101 }]],
    ['camera:set-white-led', ['camera', { enabled: 'false' }]],
    ['camera:reorder', [['camera', 'camera']]],
    ['camera:remove', [null]],
    ['camera:release-stream', [null]],
    ['camera:remove', ['a\nb']],
    ['stream:set-audio', [false, Infinity]],
    ['stream:set-audio', [false, 2]],
    ['app:set-fullscreen', ['true']],
    ['camera:save', [{ ...input, host: 'user:pass@other.invalid' }]],
    ['camera:save', [{ ...input, kind: 'other' }]],
    ['camera:save', [null]],
    ['camera:save', [{ ...input, password: { secret: 'synthetic-secret' } }]],
    ['camera:get-device-name', [{ ...input, password: 'synthetic', kind: 'generic' }]],
    ['camera:inspect-certificate', [{ host: 'user:pass@other.invalid', protocol: 'https', httpPort: 443 }]],
    ['camera:inspect-stream-certificate', ['x'.repeat(8193)]],
    ['app:get-state', ['unexpected']],
    ['unregistered', []],
  ])('rejects malformed %s arguments without reflecting them', (channel, args) => {
    expect(() => validateIpcArguments(channel as string, args as unknown[])).toThrow(/^Invalid IPC arguments\.$/);
  });

  it('keeps valid legacy settings, blank edits, IPv6 and all PTZ command kinds', () => {
    for (const host of ['camera.local', '[2001:db8::1]', 'http://192.0.2.1/live']) {
      expect(() => validateIpcArguments('camera:save', [{ ...input, host }, 'camera'])).not.toThrow();
    }
    expect(() => validateIpcArguments('camera:save', [{ ...input, kind: 'generic', streamUrl: '', username: '' }, 'camera'])).not.toThrow();
    expect(() => validateIpcArguments('camera:save', [{ ...input, kind: 'panasonic', mjpegPath: '/nphMotionJpeg?Resolution=640x480', ptzPath: '/nphControlCamera' }])).not.toThrow();
    for (const command of [{ kind: 'stop' }, { kind: 'move', direction: 'RightDown', speed: 64 }, { kind: 'zoom', direction: 'in', speed: 1 },
      { kind: 'focus', direction: 'near', speed: 10 }, { kind: 'zoomLevel', level: 4 }, { kind: 'zoomPosition', position: 6000 }, { kind: 'preset', presetId: 64 }]) {
      expect(() => validateIpcArguments('camera:ptz', ['camera', command])).not.toThrow();
    }
    expect(() => validateIpcArguments('camera:get-device-name', [{ ...input, name: '', password: 'synthetic' }])).not.toThrow();
    expect(() => validateIpcArguments('stream:set-audio', [true, 0])).not.toThrow();
    expect(() => validateIpcArguments('camera:set-white-led', ['camera', { mode: 3, brightness: 50 }])).not.toThrow();
  });

  it('handles malformed camera form types without TypeErrors or echoing sensitive values', () => {
    for (const value of [undefined, null, [], 'synthetic-secret', { ...input, name: null }, { ...input, host: 42 },
      { ...input, username: {} }, { ...input, mjpegPath: [] }, { ...input, password: 'x'.repeat(4097) }]) {
      const errors = validateCameraInput(value);
      expect(errors).toEqual(['Invalid camera settings. Check field types and lengths.']);
    }
  });

  it('has a contract for every registered and exposed IPC channel', async () => {
    const main = await readFile('src/main/main.ts', 'utf8');
    const preload = await readFile('src/preload/preload.ts', 'utf8');
    const contracts = await readFile('src/main/ipcValidation.ts', 'utf8');
    const registered = [...main.matchAll(/handleIpc\('([^']+)'/g)].map((match) => match[1]);
    const exposed = [...preload.matchAll(/ipcRenderer.invoke\('([^']+)'/g)].map((match) => match[1]);
    expect(new Set(registered)).toEqual(new Set(exposed));
    for (const channel of registered) expect(contracts).toContain(`'${channel}':`);
  });
});
