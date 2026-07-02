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
