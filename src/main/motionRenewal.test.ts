// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionRenewal } from './motionRenewal.js';

afterEach(() => vi.useRealTimers());

describe('bounded ONVIF motion renewal', () => {
  it('renews an active hold and cancels immediately on release', async () => {
    vi.useFakeTimers(); const renewal = new MotionRenewal(); const send = vi.fn(async () => undefined);
    renewal.start('A', () => true, send);
    await vi.advanceTimersByTimeAsync(1600); expect(send).toHaveBeenCalledTimes(3);
    await renewal.cancel('A'); await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
  });

  it('never overlaps renewals and makes every Stop wait for the in-flight request', async () => {
    vi.useFakeTimers(); const renewal = new MotionRenewal(); let release!: () => void;
    const send = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    renewal.start('A', () => true, send); await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(1);
    const stopped = vi.fn(); const a = renewal.cancel('A').then(stopped); const b = renewal.cancel('A').then(stopped);
    await vi.advanceTimersByTimeAsync(10_000); expect(stopped).not.toHaveBeenCalled();
    release(); await Promise.all([a, b]); expect(stopped).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000); expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not retry after a network failure', async () => {
    vi.useFakeTimers(); const renewal = new MotionRenewal(); const send = vi.fn(async () => { throw new Error('offline'); });
    renewal.start('A', () => true, send); await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1); await expect(renewal.cancel('A')).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops when the controller generation changes or the independent deadline expires', async () => {
    vi.useFakeTimers(); const renewal = new MotionRenewal(); let current = true;
    const a = vi.fn(async () => undefined); const b = vi.fn(async () => undefined);
    renewal.start('A', () => current, a); renewal.start('B', () => true, b);
    await vi.advanceTimersByTimeAsync(500); current = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(57); expect(vi.getTimerCount()).toBe(0);
  });
});
