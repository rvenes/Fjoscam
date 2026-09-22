type Result = { current: () => boolean; success: () => void; error: (error: unknown) => void };

// One write in flight and one merged pending patch. Timers belong to this
// camera view; closing it drops unsent work without claiming to cancel HTTP.
export function coalescedWriter<T extends object>(write: (patch: T) => Promise<void>) {
  type Job = { patch: T; result: Result; revision: number };
  let pending: Job | undefined;
  const queued = (): Job | undefined => pending;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let revision = 0;
  async function drain() {
    if (running || timer || !pending) return;
    const job = pending;
    pending = undefined;
    if (!job.result.current()) return;
    running = true;
    try {
      await write(job.patch);
      if (job.revision === revision && job.result.current()) job.result.success();
    } catch (error) {
      // If a newer explicit edit is waiting, carry forward the unacknowledged
      // fields too. Do not automatically retry a failed final write.
      const next = queued(); // Another push may have arrived across await.
      if (next) next.patch = { ...job.patch, ...next.patch };
      else if (job.revision === revision && job.result.current()) job.result.error(error);
    } finally {
      running = false;
      void drain();
    }
  }
  return {
    push(patch: T, result: Result, delay = 0) {
      pending = { patch: { ...pending?.patch, ...patch }, result, revision: ++revision };
      clearTimeout(timer);
      timer = undefined;
      if (delay) timer = setTimeout(() => { timer = undefined; void drain(); }, delay);
      else void drain();
    },
    busy() { return running || pending !== undefined; },
    cancel() { revision++; pending = undefined; clearTimeout(timer); timer = undefined; },
  };
}
