type Renewal = { timer?: ReturnType<typeof setTimeout>; pending: Promise<void>; cancelled: boolean };

// Short camera-side leases are renewed only after acknowledgement. Losing the
// network therefore stops renewal instead of queueing delayed physical moves.
export class MotionRenewal {
  private readonly entries = new Map<string, Renewal>();

  cancel(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return Promise.resolve();
    entry.cancelled = true;
    clearTimeout(entry.timer);
    // Keep the pending operation reachable until it settles so repeated Stop
    // calls cannot bypass an already-sent renewal.
    return entry.pending.finally(() => { if (this.entries.get(id) === entry) this.entries.delete(id); });
  }

  start(id: string, current: () => boolean, renew: () => Promise<void>): void {
    const previous = this.entries.get(id);
    if (previous) { previous.cancelled = true; clearTimeout(previous.timer); }
    const deadline = Date.now() + 29_000;
    const entry: Renewal = { pending: Promise.resolve(), cancelled: false };
    this.entries.set(id, entry);
    const finish = () => { if (this.entries.get(id) === entry) this.entries.delete(id); };
    const schedule = () => {
      if (entry.cancelled || !current() || Date.now() >= deadline) { finish(); return; }
      entry.timer = setTimeout(() => {
        if (entry.cancelled || !current() || Date.now() >= deadline) { finish(); return; }
        entry.pending = Promise.resolve().then(() => {
          if (!entry.cancelled && current() && Date.now() < deadline) return renew();
        }).then(schedule, () => {
          // The camera's PT1S lease remains the safety bound. An explicit Stop
          // can still use the original target after any uncertain result.
          finish();
        });
      }, 500);
      entry.timer.unref();
    };
    if (previous) entry.pending = previous.pending.then(schedule);
    else schedule();
  }
}
