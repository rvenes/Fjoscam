import { describe, expect, it } from 'vitest';
import { buildRtspUrl, clampZoomPosition, normalizeWhiteLed, parseIrLights, parseZoomFocus } from './reolinkClient.js';
import type { CameraWithSecret } from '../shared/types.js';

describe('buildRtspUrl', () => {
  it('builds a low-latency substream URL for channel 0', () => {
    const camera: CameraWithSecret = {
      id: '1',
      name: 'Barn',
      host: '192.168.1.30',
      protocol: 'http',
      httpPort: 80,
      rtspPort: 554,
      username: 'admin',
      password: 'p@ss word',
      channel: 0,
      streamChannel: 0,
      lowLatency: true,
    };

    expect(buildRtspUrl(camera)).toBe('rtsp://admin:p%40ss%20word@192.168.1.30:554/h264Preview_01_sub');
  });
});

describe('parseZoomFocus', () => {
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('ignores unsafe motor position %s', (pos) => {
    expect(parseZoomFocus({ value: { ZoomFocus: { zoom: { pos }, focus: { pos } } } }))
      .toMatchObject({ zoom: undefined, focus: undefined });
  });
  it.each([{ min: NaN, max: 34 }, { min: 0, max: Infinity }, { min: -1, max: 34 }, { min: 0.5, max: 34 }])('rejects unsafe motor ranges %j', (pos) => {
    expect(parseZoomFocus({ range: { ZoomFocus: { zoom: { pos } } } }).zoomRange).toBeUndefined();
  });
  it('parses position and range from a TrackMix GetZoomFocus action:1 response', () => {
    // Shape captured from a real Reolink TrackMix WiFi (zoom range 1000-6000).
    const item = {
      value: { ZoomFocus: { channel: 0, focus: { pos: 51 }, zoom: { pos: 1000 } } },
      range: {
        ZoomFocus: {
          channel: 0,
          focus: { pos: { max: 100, min: 1 } },
          zoom: { pos: { max: 6000, min: 1000 } },
        },
      },
    };

    expect(parseZoomFocus(item)).toEqual({
      zoom: 1000,
      focus: 51,
      zoomRange: { min: 1000, max: 6000 },
      focusRange: { min: 1, max: 100 },
    });
  });

  it('handles responses without a range block', () => {
    const item = { value: { ZoomFocus: { channel: 0, zoom: { pos: 12 } } } };
    expect(parseZoomFocus(item)).toEqual({ zoom: 12, focus: undefined, zoomRange: undefined, focusRange: undefined });
  });

  it('ignores invalid ranges', () => {
    const item = {
      value: { ZoomFocus: { zoom: { pos: 5 } } },
      range: { ZoomFocus: { zoom: { pos: { min: 10, max: 10 } } } },
    };
    expect(parseZoomFocus(item).zoomRange).toBeUndefined();
  });
});

describe('parseIrLights', () => {
  it('preserves valid choices when the camera mixes malformed elements into its range', () => {
    const raw: unknown = { value: { IrLights: { state: 'Auto' } }, range: { IrLights: { state: [null, {}, true, 1, 'Off', 'Auto', 'Off'] } } };
    expect(parseIrLights(raw as Parameters<typeof parseIrLights>[0])).toEqual({ mode: 'auto', options: ['off', 'auto'] });
  });
  it('does not invent status from an entirely malformed range/value', () => {
    const raw: unknown = { value: { IrLights: { state: {} } }, range: { IrLights: { state: [null, {}, true] } } };
    expect(parseIrLights(raw as Parameters<typeof parseIrLights>[0])).toBeUndefined();
  });
  it('reads the mode from state and the supported options from the range block', () => {
    // Shape captured from a real Reolink TrackMix WiFi: no "On" option.
    const item = {
      value: { IrLights: { state: 'Auto' } },
      range: { IrLights: { state: ['Auto', 'Off'] } },
    };
    expect(parseIrLights(item)).toEqual({ mode: 'auto', options: ['auto', 'off'] });
  });

  it('falls back to all options when the camera does not report a range', () => {
    const item = { value: { IrLights: { state: 'Off' } } };
    expect(parseIrLights(item)).toEqual({ mode: 'off', options: ['auto', 'on', 'off'] });
  });

  it('returns undefined when the response has no usable data', () => {
    expect(parseIrLights({})).toBeUndefined();
  });
});

describe('normalizeWhiteLed', () => {
  it.each([null, {}, [], true, -1, 101, NaN, Infinity, '50'])('does not expose invalid brightness %j', (bright) => {
    const raw: unknown = { bright, mode: 3 };
    expect(normalizeWhiteLed(raw as Parameters<typeof normalizeWhiteLed>[0]))
      .toMatchObject({ brightness: undefined, supportsBrightness: false, mode: 3, enabled: true });
  });
  it.each(['', ' ', '-1', -1, 1.5, NaN, Infinity, {}, null])('uses state when mode is malformed: %j', (mode) => {
    const raw: unknown = { mode, state: 1 };
    expect(normalizeWhiteLed(raw as Parameters<typeof normalizeWhiteLed>[0]))
      .toMatchObject({ enabled: true, mode: undefined, supportsModes: false });
  });
  it('keeps numeric mode strings and uses the next valid brightness alias', () => {
    expect(normalizeWhiteLed({ mode: '3', bright: NaN, brightness: 50, Bright: 60 }))
      .toMatchObject({ mode: 3, enabled: true, brightness: 50, supportsBrightness: true, supportsModes: true });
    expect(normalizeWhiteLed({ mode: '0', Bright: 0 }))
      .toMatchObject({ enabled: false, brightness: 0, supportsBrightness: true });
  });
  it('treats mode as the source of truth, not the read-only state field', () => {
    // Captured from TrackMix: schedule mode active although state says 0.
    const value = { bright: 0, channel: 0, mode: 3, state: 0 };
    const result = normalizeWhiteLed(value);
    expect(result.enabled).toBe(true);
    expect(result.mode).toBe(3);
  });

  it('reports mode 0 as disabled even when state claims lit', () => {
    const result = normalizeWhiteLed({ bright: 60, mode: 0, state: 1 });
    expect(result.enabled).toBe(false);
    expect(result.brightness).toBe(60);
    expect(result.supportsBrightness).toBe(true);
  });

  it('falls back to the state field for cameras without a mode', () => {
    expect(normalizeWhiteLed({ state: 1, bright: 40 })).toMatchObject({ enabled: true, supportsModes: false });
    expect(normalizeWhiteLed({ state: 0 })).toMatchObject({ enabled: false, supportsModes: false });
  });
});

describe('clampZoomPosition', () => {
  it('clamps against the camera-reported range', () => {
    const range = { min: 1000, max: 6000 };
    expect(clampZoomPosition(Number.MAX_SAFE_INTEGER, range)).toBe(6000);
    expect(clampZoomPosition(34, range)).toBe(1000);
    expect(clampZoomPosition(2500.4, range)).toBe(2500);
  });

  it('falls back to the legacy 0-34 range', () => {
    expect(clampZoomPosition(50)).toBe(34);
    expect(clampZoomPosition(-3)).toBe(0);
  });
});
