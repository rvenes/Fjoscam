import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWindowFullscreen } from './useWindowFullscreen';

afterEach(cleanup);
describe('native fullscreen ownership', () => {
  it('ignores delayed initial state after a native event and unsubscribes on unmount', async () => {
    let emit!: (enabled: boolean) => void; let resolve!: (enabled: boolean) => void;
    const unsubscribe = vi.fn();
    Object.defineProperty(window, 'fjoscam', { configurable: true, value: {
      onFullscreenChanged: (callback: typeof emit) => { emit = callback; return unsubscribe; },
      getFullscreen: () => new Promise<boolean>((done) => { resolve = done; }),
    } });
    const view = renderHook(useWindowFullscreen);
    act(() => emit(true)); expect(view.result.current).toBe(true);
    await act(async () => resolve(false)); expect(view.result.current).toBe(true);
    act(() => emit(false)); expect(view.result.current).toBe(false);
    view.unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('initializes a reloaded renderer from the native fullscreen state', async () => {
    Object.defineProperty(window, 'fjoscam', { configurable: true, value: {
      onFullscreenChanged: () => () => {}, getFullscreen: async () => true,
    } });
    const view = renderHook(useWindowFullscreen);
    await act(async () => {}); expect(view.result.current).toBe(true);
  });
});
