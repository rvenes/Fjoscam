import { describe, expect, it } from 'vitest';
import { allowsPtz, cameraControls, supportsSecondaryLens } from './cameraControls';
import type { CameraConfig, CameraProfile } from './types';
const camera = { kind: 'reolink', channel: 0, streamChannel: 0, name: 'TrackMix dual' } as CameraConfig;
const profile: CameraProfile = { channels: [], device: { model: 'Reolink TrackMix PoE' }, capabilities: { ptz: true, presets: true, zoomFocus: false, focus: false, irLights: false, whiteLed: false, siren: false, motion: false, ai: false, fourDirections: true, presetWrite: false } };
describe('camera control policy', () => {
  it('does not identify a lens from a name or NVR stream channel', () => {
    expect(supportsSecondaryLens(camera)).toBe(false);
    expect(supportsSecondaryLens({ ...camera, streamChannel: 5 })).toBe(false);
    expect(supportsSecondaryLens(camera, profile)).toBe(true);
    expect(supportsSecondaryLens({ ...camera, channel: 5 }, profile)).toBe(false);
  });
  it('respects explicit lens selection without enabling controls on generic streams', () => {
    expect(supportsSecondaryLens({ ...camera, lensMode: 'single' }, profile)).toBe(false);
    expect(supportsSecondaryLens({ ...camera, lensMode: 'dual' })).toBe(true);
    expect(supportsSecondaryLens({ ...camera, kind: 'generic', lensMode: 'dual' }, profile)).toBe(false);
  });
  it('guards all PTZ entry points and retains Stop when support is unknown', () => {
    const controls = cameraControls(camera, profile);
    expect(allowsPtz({ kind: 'move', direction: 'LeftUp', speed: 20 }, controls)).toBe(false);
    expect(allowsPtz({ kind: 'move', direction: 'Left', speed: 20 }, controls)).toBe(true);
    expect(allowsPtz({ kind: 'zoom', direction: 'in', speed: 20 }, controls)).toBe(false);
    expect(allowsPtz({ kind: 'focus', direction: 'far', speed: 20 }, controls)).toBe(false);
    expect(controls.presetWrite).toBe(false);
    expect(allowsPtz({ kind: 'stop' }, cameraControls(camera))).toBe(true);
    expect(cameraControls({ ...camera, kind: 'generic' }, profile)).toMatchObject({ move: false, zoom: false, presets: false, ir: false, light: false });
  });
  it('preserves legacy Panasonic controls without Reolink light or preset writes', () => {
    expect(cameraControls({ ...camera, kind: 'panasonic' })).toMatchObject({ move: true, zoom: true, focus: true, presets: true, presetWrite: false, ir: false, light: false, siren: false });
  });
});
