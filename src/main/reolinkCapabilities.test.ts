// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { normalizeCapabilities } from './reolinkCapabilities.js';
import { ReolinkClient } from './reolinkClient.js';
import type { CameraWithSecret } from '../shared/types.js';
const flag = (ver: number, permit = 7) => ({ ver, permit });
const supported = { ptzType: flag(2), ptzCtrl: flag(2), ptzPreset: flag(1), ledControl: flag(1), floodLight: flag(2), alarmAudio: flag(1) };

describe('Reolink capability parsing', () => {
  it('uses the configured control channel, not a root flag or the first NVR channel', () => {
    const result = normalizeCapabilities({ ...supported, abilityChn: [{ ...supported }, { ptzType: flag(3), ptzCtrl: flag(0), ptzPreset: flag(0), floodLight: flag(0) }] }, 1);
    expect(result).toMatchObject({ ptz: true, zoomFocus: false, focus: false, presets: false, whiteLed: false, siren: false });
    expect(result.status?.siren).toBe('unknown');
    expect(normalizeCapabilities({ ...supported, abilityChn: [supported] }, 4).ptz).toBe(false);
  });
  it('accepts flat legacy, indexed maps and explicitly tagged channel shapes', () => {
    expect(normalizeCapabilities(supported, 0)).toMatchObject({ ptz: true, zoomFocus: true, focus: true, presets: true, irLights: true, whiteLed: true, siren: true });
    expect(normalizeCapabilities({ abilityChn: { 3: supported } }, 3).ptz).toBe(true);
    expect(normalizeCapabilities({ abilityChn: [{ channel: 5, ...supported }, { channel: 2, ptzType: flag(0) }] }, 5).ptz).toBe(true);
    expect(normalizeCapabilities({ abilityChn: [{ channel: 5, ...supported }] }, 0).ptz).toBe(false);
  });
  it('keeps unsupported, denied, read-only and unknown distinct', () => {
    const result = normalizeCapabilities({ ptzType: flag(0, 7), ptzPreset: flag(1, 0), floodLight: flag(1, 4), ledControl: { ver: 1 }, alarmAudio: { ver: 'garbage', permit: 7 } }, 0);
    expect(result.status).toMatchObject({ ptz: 'unsupported', presets: 'denied', whiteLed: 'read-only', irLights: 'unknown', siren: 'unknown' });
    expect(result).toMatchObject({ ptz: false, presets: false, whiteLed: false, irLights: false, siren: false });
  });
  it('uses direction permission and treats direction version zero as eight directions', () => {
    expect(normalizeCapabilities({ ptzType: flag(3, 0), ptzDirection: flag(0, 1) }, 0)).toMatchObject({ ptz: true, fourDirections: false });
    expect(normalizeCapabilities({ ptzType: flag(3, 7), ptzDirection: flag(0, 0) }, 0)).toMatchObject({ ptz: false, status: { ptz: 'denied' } });
  });
  it('does not infer PTZ, spotlight or siren from unrelated fields', () => {
    const result = normalizeCapabilities({ ptzPatrol: flag(1), powerLed: flag(1), indicatorLight: flag(1), ispDayNight: flag(1), alarmHddFull: flag(1), alarmMd: flag(1), aiTrack: flag(1) }, 0);
    expect(result).toMatchObject({ ptz: false, presets: false, zoomFocus: false, whiteLed: false, irLights: false, siren: false, motion: true, ai: false });
  });
  it.each([3, 6, 7])('does not offer zoom/focus on PT-only type %s', (type) => {
    expect(normalizeCapabilities({ ...supported, ptzType: flag(type) }, 0)).toMatchObject({ ptz: true, zoomFocus: false, focus: false });
  });
  it('preserves camera-side digital zoom on TrackMix without inventing focus', () => {
    expect(normalizeCapabilities({ ptzType: flag(3), ptzCtrl: flag(0), supportDigitalZoom: flag(1) }, 0)).toMatchObject({ ptz: true, zoomFocus: true, focus: false });
  });
  it('allows a fixed AF lens to zoom without pan/tilt and separates preset writes', () => {
    expect(normalizeCapabilities({ ptzType: flag(1), ptzCtrl: flag(1), ptzPreset: flag(1, 1), ptzDirection: flag(1) }, 0))
      .toMatchObject({ ptz: false, zoomFocus: true, focus: false, presets: true, presetWrite: false, fourDirections: true });
  });
  it.each([null, [], 'bad', { abilityChn: null }, { ptzType: { ver: true, permit: -1 } }, { ptzType: { ver: '1abc', permit: 7 } }])('does not enable controls on malformed data %j', (input) => {
    expect(normalizeCapabilities(input, 0)).toMatchObject({ ptz: false, zoomFocus: false, irLights: false, siren: false });
  });
  it('parses numeric strings without treating nonzero permission as support', () => {
    expect(normalizeCapabilities({ ptzType: { ver: '2', permit: '1' }, ptzCtrl: { ver: '0', permit: '7' } }, 0)).toMatchObject({ ptz: true, zoomFocus: false });
  });
  it('passes the camera control channel through getProfile, independent of view channel', async () => {
    const client = new ReolinkClient();
    vi.spyOn(client, 'getAbility').mockResolvedValue({ abilityChn: [supported, { ptzType: flag(0) }] });
    vi.spyOn(client, 'getDeviceInfo').mockResolvedValue({ model: 'Synthetic NVR' });
    vi.spyOn(client, 'getChannelStatus').mockResolvedValue([]);
    const profile = await client.getProfile({ channel: 1, streamChannel: 0 } as CameraWithSecret, 'synthetic');
    expect(profile.capabilities.ptz).toBe(false);
  });
  it('does not turn a successful fixed-camera login into a failure because presets are unsupported', async () => {
    const client = new ReolinkClient();
    vi.spyOn(client, 'getToken').mockResolvedValue('synthetic');
    vi.spyOn(client, 'getProfile').mockResolvedValue({ channels: [], capabilities: normalizeCapabilities({ ptzType: flag(0), ptzPreset: flag(0) }, 0) });
    const presets = vi.spyOn(client, 'getPresets').mockRejectedValue(new Error('Unsupported'));
    vi.spyOn(client, 'getCameraName').mockResolvedValue('Fixed camera');
    vi.spyOn(client, 'getStreamInfo').mockResolvedValue({});
    expect((await client.testConnection({} as CameraWithSecret)).ok).toBe(true);
    expect(presets).not.toHaveBeenCalled();
  });
});
