// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PtzController } from './ptzController.js';

afterEach(() => vi.useRealTimers());
describe('PTZ ordering and safety', () => {
  it('cancels queued movement and delivers stop after the in-flight move', async () => {
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const calls: string[] = [];
    const controller = new PtzController(async (id, command, current) => {
      calls.push(`${id}:${command.kind}`);
      if (command.kind === 'move') {
        started();
        await gate;
        if (current()) calls.push('late-fallback');
      }
    });
    const move = controller.send('A', { kind: 'move', direction: 'Left', speed: 10 });
    await startedPromise;
    const queued = controller.send('A', { kind: 'move', direction: 'Right', speed: 10 });
    const stop = controller.send('A', { kind: 'stop' });
    release();
    await Promise.all([move, queued, stop]);
    expect(calls).toEqual(['A:move', 'A:stop']);
    await controller.shutdown();
  });

  it('stops the original camera and allows another camera to work independently', async () => {
    const delivered = vi.fn(async (_id: string) => undefined);
    const controller = new PtzController(delivered);
    await controller.send('A', { kind: 'move', direction: 'Left', speed: 10 });
    await controller.send('B', { kind: 'preset', presetId: 1 });
    await controller.stopAll();
    expect(delivered.mock.calls.map((call) => call[0])).toEqual(['A', 'B', 'A', 'B']);
    await controller.shutdown();
  });

  it('sends stop after movement fails and bounds an orphaned held movement', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const controller = new PtzController(async (_id, command) => {
      calls.push(command.kind);
      if (command.kind === 'move') throw new Error('Synthetic timeout');
    });
    await expect(controller.send('A', { kind: 'move', direction: 'Left', speed: 1 })).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toEqual(['move', 'stop']);
    await controller.shutdown();
    await expect(controller.send('A', { kind: 'move', direction: 'Left', speed: 1 })).rejects.toThrow('shutting down');
  });

  it('stops with old settings before a mutation and rejects moves until the mutation completes', async () => {
    let releaseMove!: () => void;
    let moveStarted!: () => void;
    const started = new Promise<void>((resolve) => { moveStarted = resolve; });
    const gate = new Promise<void>((resolve) => { releaseMove = resolve; });
    let releaseSave!: () => void;
    const saving = new Promise<void>((resolve) => { releaseSave = resolve; });
    let host = 'old'; const calls: string[] = [];
    const controller = new PtzController(async (_id, command, current) => {
      calls.push(`${host}:${command.kind}`);
      if (command.kind === 'move') { moveStarted(); await gate; if (current()) calls.push('late-fallback'); }
    });
    const movement = controller.send('A', { kind: 'move', direction: 'Left', speed: 10 });
    await started;
    const mutation = controller.withCameraPaused('A', async () => { calls.push('save'); host = 'new'; await saving; return 'saved'; });
    await expect(controller.send('A', { kind: 'move', direction: 'Right', speed: 10 })).rejects.toThrow('being updated');
    expect(calls).toEqual(['old:move']);
    releaseMove(); await movement;
    await vi.waitFor(() => expect(calls).toEqual(['old:move', 'old:stop', 'save']));
    await controller.send('A', { kind: 'stop' }); // A late keyup cannot send Stop to the new host.
    expect(calls).toHaveLength(3);
    await expect(controller.withCameraPaused('A', async () => 'overlap')).rejects.toThrow('already');
    releaseSave(); await expect(mutation).resolves.toBe('saved');
    await controller.shutdown();
  });

  it('allows repairing an offline camera and resumes controls after a failed save', async () => {
    const controller = new PtzController(async (_id, command) => { if (command.kind === 'stop') throw new Error('offline'); });
    await controller.send('A', { kind: 'move', direction: 'Left', speed: 10 });
    await expect(controller.withCameraPaused('A', async () => { throw new Error('save failed'); })).rejects.toThrow('save failed');
    await expect(controller.send('A', { kind: 'preset', presetId: 1 })).resolves.toBeUndefined();
    await controller.shutdown();
  });
});
