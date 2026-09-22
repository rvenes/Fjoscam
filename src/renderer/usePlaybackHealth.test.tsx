import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { playbackHealth, usePlaybackHealth } from './usePlaybackHealth';
import type { PlaybackSample } from '../shared/types';
const empty: PlaybackSample = { source: 'player', ready: true, frames: 0, frameAgeMs: null, ended: false, mediaError: false };
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('playback health state', () => {
  it('reports bridge recovery and failures separately from camera frames', () => {
    expect(playbackHealth({ ...empty, bridge: { state: 'recovering', generation: 1, attempts: 2 } }, 60000)).toEqual({ state: 'waiting', text: 'Restoring local video service · attempt 2/5' });
    expect(playbackHealth({ ...empty, bridge: { state: 'failed', generation: 1, attempts: 5, reason: 'port-in-use' } }, 0).text).toContain('port is already in use');
    expect(playbackHealth({ ...empty, bridge: { state: 'running', generation: 2, attempts: 1 } }, 0).state).toBe('waiting');
  });

  it('reloads once after recovery and ignores a delayed recovery from an old view', async () => {
    vi.useFakeTimers(); const onRecovered = vi.fn();
    const recovering: PlaybackSample = { ...empty, bridge: { state: 'recovering', generation: 1, attempts: 1 } };
    const running: PlaybackSample = { ...empty, bridge: { state: 'running', generation: 2, attempts: 1 } };
    const read = vi.fn().mockResolvedValueOnce(recovering).mockResolvedValue(running);
    Object.defineProperty(window, 'fjoscam', { configurable: true, value: { getPlaybackHealth: read } });
    const view = renderHook(({ url }) => usePlaybackHealth(url, true, onRecovered), { initialProps: { url: 'A' } });
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(onRecovered).toHaveBeenCalledOnce();
    let release!: (sample: PlaybackSample) => void;
    read.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    view.rerender({ url: 'B' });
    await act(async () => release({ ...running, bridge: { state: 'running', generation: 3, attempts: 2 } }));
    expect(onRecovered).toHaveBeenCalledOnce();
  });
  it('requires frames, distinguishes timeout/stall, and recovers on fresh frames', () => {
    expect(playbackHealth(empty, 100).state).toBe('waiting');
    expect(playbackHealth(empty, 15000).state).toBe('stalled');
    expect(playbackHealth({ ...empty, frames: 1, frameAgeMs: 500 }, 20000).state).toBe('live');
    expect(playbackHealth({ ...empty, frames: 1, frameAgeMs: 11000 }, 20000).state).toBe('stalled');
    expect(playbackHealth({ ...empty, frames: 2, frameAgeMs: 0 }, 21000).state).toBe('live');
    expect(playbackHealth({ ...empty, ended: true }, 100).state).toBe('error');
    expect(playbackHealth({ ...empty, source: 'mjpeg', frames: 2, frameAgeMs: 0 }, 100).text).toBe('MJPEG frames arriving');
  });
  it('bounds concurrent observations, shows an unresponsive probe, and ignores old-camera results', async () => {
    vi.useFakeTimers();
    let release!: (value: PlaybackSample) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<PlaybackSample>((resolve) => { release = resolve; })).mockResolvedValue(empty);
    Object.defineProperty(window, 'fjoscam', { configurable: true, value: { getPlaybackHealth: read } });
    const view = renderHook(({ url, enabled }) => usePlaybackHealth(url, enabled), { initialProps: { url: 'A', enabled: true } });
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(read).toHaveBeenCalledTimes(1);
    expect(view.result.current.text).toContain('not responding');
    await act(async () => view.rerender({ url: 'B', enabled: true }));
    await act(async () => release({ ...empty, frames: 9, frameAgeMs: 0 }));
    expect(view.result.current.state).toBe('waiting');
    view.rerender({ url: 'B', enabled: false });
    const count = read.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(read).toHaveBeenCalledTimes(count);
    expect(view.result.current.text).toBe('Disconnected');
  });
});
