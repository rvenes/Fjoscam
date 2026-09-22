import type { PtzCommand } from '../shared/types.js';

type Entry = { generation: number; pending: Promise<void>; watchdog?: ReturnType<typeof setTimeout> };

// One command chain per camera: a stop is always delivered after an in-flight
// move, while queued stale moves and their adapter fallbacks are cancelled.
export class PtzController {
  private readonly entries = new Map<string, Entry>();
  private closed = false;
  private readonly paused = new Map<string, { stop: Promise<void> }>();

  constructor(private readonly deliver: (id: string, command: PtzCommand, current: () => boolean) => Promise<void>) {}

  send(id: string, command: PtzCommand): Promise<void> {
    const pause = this.paused.get(id);
    if (pause) return command.kind === 'stop' ? pause.stop : Promise.reject(new Error('Camera settings are being updated. Retry PTZ after saving.'));
    return this.enqueue(id, command);
  }

  // Block new moves, drain/cancel old work and attempt Stop using the OLD
  // camera settings before saving/revoking them. An offline camera must still
  // be editable; failure to acknowledge Stop cannot guarantee physical rest.
  async withCameraPaused<T>(id: string, change: () => Promise<T>): Promise<T> {
    if (this.paused.has(id)) throw new Error('Camera settings are already being updated.');
    const pause = { stop: Promise.resolve() };
    this.paused.set(id, pause);
    try {
      if (this.entries.has(id)) pause.stop = this.enqueue(id, { kind: 'stop' }).catch(() => undefined);
      await pause.stop;
      return await change();
    } finally { this.paused.delete(id); }
  }

  private enqueue(id: string, command: PtzCommand): Promise<void> {
    if (this.closed && command.kind !== 'stop') return Promise.reject(new Error('PTZ is shutting down.'));
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { generation: 0, pending: Promise.resolve() };
      this.entries.set(id, entry);
    }
    const state = entry;
    const generation = ++state.generation;
    clearTimeout(state.watchdog);
    state.watchdog = undefined;
    const current = () => command.kind === 'stop' || (!this.closed && generation === state.generation);
    const pending = state.pending.catch(() => undefined).then(async () => {
      if (!current()) return;
      if (['move', 'zoom', 'focus'].includes(command.kind)) {
        // Last-resort bound if the renderer crashes or loses its release event.
        state.watchdog = setTimeout(() => { void this.send(id, { kind: 'stop' }).catch(() => undefined); }, 30_000);
        state.watchdog.unref();
      }
      await this.deliver(id, command, current);
    });
    state.pending = pending.finally(() => {
      if (command.kind === 'stop' && generation === state.generation && this.entries.get(id) === state) this.entries.delete(id);
    });
    return state.pending;
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled([...this.entries.keys()].map((id) => this.send(id, { kind: 'stop' })));
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    await this.stopAll();
  }
}
