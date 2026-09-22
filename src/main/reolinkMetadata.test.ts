// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { parseChannelStatus, parseDeviceInfo, parsePresets, parseStreamInfo } from './reolinkMetadata.js';
import { ReolinkClient } from './reolinkClient.js';
import { requestJson } from './request.js';
import type { CameraWithSecret } from '../shared/types.js';
vi.mock('./request.js', () => ({ requestJson: vi.fn(), requestBinary: vi.fn() }));

describe('camera metadata boundary', () => {
  it.each([null, true, 42, 'unexpected', {}, [null]])('tolerates malformed payloads %j', (value) => {
    expect(parsePresets(value)).toEqual([]);
    expect(parseChannelStatus(value)).toEqual([]);
    expect(parseDeviceInfo(value).name).toBeUndefined();
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      expect(parseStreamInfo('high', value)).toEqual({ quality: 'high', resolution: 'unknown', width: 0, height: 0, fps: 0, bitrateKbps: 0, codec: undefined });
    } else expect(parseStreamInfo('high', value)).toBeUndefined();
  });

  it('keeps usable presets without unsafe targets, duplicate IDs or object names', () => {
    expect(parsePresets([
      null, { id: true }, { id: 'bad' }, { id: 0 }, { id: 65 }, { id: 1.5 },
      { id: 1, enable: '0' }, { id: 2, enable: false },
      { id: '4', name: ' Barn ' }, { id: 4, name: 'Duplicate' },
      { id: 3, name: { malformed: true } }, { id: 64, name: '' },
    ])).toEqual([{ id: 3, name: 'Preset 3' }, { id: 4, name: 'Barn' }, { id: 64, name: 'Preset 64' }]);
  });

  it('keeps independent device fields and the legacy serial alias', () => {
    expect(parseDeviceInfo({ name: {}, model: ' Model ', uid: false, serial: ' serial ', version: ' v1 ', hardVer: [] }))
      .toEqual({ name: undefined, model: 'Model', uid: 'serial', firmware: 'v1', hardware: undefined });
    expect(parseDeviceInfo({ name: 'x'.repeat(513), model: 'valid' }).name).toBeUndefined();
  });

  it('does not invent channel zero for a missing/invalid channel', () => {
    expect(parseChannelStatus([
      null, {}, { channel: false }, { channel: -1 }, { channel: 0.5 }, { channel: 65536 },
      { channel: 0, name: ' Wide ', online: 1 }, { channel: '1', name: {}, online: '1' },
      { channel: 0, online: false }, { channel: 2, online: 'false' },
    ])).toEqual([
      { channel: 0, name: 'Wide', online: true },
      { channel: 1, name: undefined, online: true },
      { channel: 2, name: undefined, online: false },
    ]);
  });

  it('preserves explicit stream dimensions, numeric strings and fractional frame rates', () => {
    expect(parseStreamInfo('high', { size: '3840*2160', width: '2560', height: 1440, frameRate: '29.97', bitRate: 8192, vType: ' h265 ' }))
      .toEqual({ quality: 'high', resolution: '2560*1440', width: 2560, height: 1440, fps: 29.97, bitrateKbps: 8192, codec: 'h265' });
    expect(parseStreamInfo('low', { size: '640*360' })).toMatchObject({ quality: 'low', width: 640, height: 360, resolution: '640*360' });
  });

  it('rejects unsafe stream fields without returning non-finite numbers or objects', () => {
    expect(parseStreamInfo('high', { size: {}, width: true, height: -1, frameRate: 'Infinity', bitRate: [], vType: {} }))
      .toEqual({ quality: 'high', resolution: 'unknown', width: 0, height: 0, fps: 0, bitrateKbps: 0, codec: undefined });
    expect(parseStreamInfo('high', { size: 'malformed', width: Infinity, height: 1.5, frameRate: NaN, bitRate: -1 }))
      .toMatchObject({ resolution: 'unknown', width: 0, height: 0, fps: 0, bitrateKbps: 0 });
  });

  it('normalizes actual adapter reads before returning camera data to callers', async () => {
    const responses: Record<string, unknown> = {
      GetPtzPreset: { PtzPreset: [null, { id: 2, name: {} }] },
      GetDevInfo: { DevInfo: { name: {}, model: 'Synthetic model' } },
      GetChannelStatus: { ChannelStatus: [null, { channel: 0, name: {}, online: 1 }] },
      GetEnc: { Enc: { mainStream: { size: {}, vType: [] }, subStream: { size: '640*360' } } },
    };
    vi.mocked(requestJson).mockImplementation(async (_url, body) => [{ code: 0, value: responses[(body as Array<{ cmd: string }>)[0].cmd] }]);
    const client = new ReolinkClient();
    const camera = { id: 'synthetic', host: '192.0.2.1', protocol: 'http', httpPort: 80, channel: 0 } as CameraWithSecret;
    await expect(client.getPresets(camera, 'synthetic')).resolves.toEqual([{ id: 2, name: 'Preset 2' }]);
    await expect(client.getDeviceInfo(camera, 'synthetic')).resolves.toMatchObject({ model: 'Synthetic model', name: undefined });
    await expect(client.getChannelStatus(camera, 'synthetic')).resolves.toEqual([{ channel: 0, name: undefined, online: true }]);
    await expect(client.getStreamInfo(camera, 'synthetic')).resolves.toMatchObject({ high: { resolution: 'unknown', codec: undefined }, low: { resolution: '640*360' } });
  });
});
