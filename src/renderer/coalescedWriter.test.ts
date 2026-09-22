import { afterEach, describe, expect, it, vi } from 'vitest';
import { coalescedWriter } from './coalescedWriter';
const result = () => ({ current: () => true, success: vi.fn(), error: vi.fn() });
afterEach(() => vi.useRealTimers());

describe('bounded camera setting writes', () => {
  it('debounces a slider burst and sends its final value', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async (_patch: { brightness?: number }) => {});
    const queue = coalescedWriter(write);
    for (let brightness = 1; brightness <= 100; brightness++) queue.push({ brightness }, result(), 150);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(write).toHaveBeenCalledExactlyOnceWith({ brightness: 100 });
  });

  it('serializes mixed mode/brightness edits and acknowledges only the final intent', async () => {
    let release!: () => void;
    const write = vi.fn<(_: { mode?: number; brightness?: number }) => Promise<void>>()
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue();
    const queue = coalescedWriter(write);
    const first = result(), last = result();
    queue.push({ mode: 1 }, first);
    queue.push({ brightness: 20 }, result());
    queue.push({ mode: 0 }, result());
    queue.push({ brightness: 80 }, last);
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => expect(last.success).toHaveBeenCalledOnce());
    expect(write.mock.calls).toEqual([[{ mode: 1 }], [{ brightness: 80, mode: 0 }]]);
    expect(first.success).not.toHaveBeenCalled();
  });

  it('carries unacknowledged fields into a newer explicit edit but never loops on a final failure', async () => {
    let reject!: (error: Error) => void;
    const write = vi.fn<(_: { mode?: number; brightness?: number }) => Promise<void>>()
      .mockImplementationOnce(() => new Promise((_ok, fail) => { reject = fail; })).mockRejectedValue(new Error('offline'));
    const queue = coalescedWriter(write);
    const final = result();
    queue.push({ mode: 3 }, result());
    queue.push({ brightness: 90 }, final);
    reject(new Error('offline'));
    await vi.waitFor(() => expect(final.error).toHaveBeenCalledOnce());
    expect(write).toHaveBeenLastCalledWith({ mode: 3, brightness: 90 });
    expect(write).toHaveBeenCalledTimes(2);
    expect(queue.busy()).toBe(false);
  });

  it('cancels unsent edits and suppresses old completions on camera switch', async () => {
    let release!: () => void;
    const write = vi.fn<(_: { mode: number }) => Promise<void>>()
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const queue = coalescedWriter(write);
    const first = result(), last = result();
    queue.push({ mode: 1 }, first);
    queue.push({ mode: 0 }, last, 150);
    queue.cancel(); release();
    await vi.waitFor(() => expect(queue.busy()).toBe(false));
    expect(write).toHaveBeenCalledOnce();
    expect(first.success).not.toHaveBeenCalled();
    expect(last.success).not.toHaveBeenCalled();
  });
});
