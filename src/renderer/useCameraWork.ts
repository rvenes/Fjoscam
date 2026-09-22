import { useLayoutEffect, useMemo } from 'react';

// Each committed view owns its work. A -> B -> A creates a new owner, even
// when the camera ID is reused. Lanes also reject older reads within one view.
export function useCameraWork(key: string) {
  const work = useMemo(() => {
    let active = true;
    let generation = 0;
    const lanes = new Map<string, number>();
    return {
      activate() { active = true; },
      invalidate() { generation += 1; lanes.clear(); },
      close() { active = false; generation += 1; lanes.clear(); },
      capture(lane?: string) {
        const revision = generation;
        const sequence = lane ? (lanes.get(lane) ?? 0) + 1 : 0;
        if (lane) lanes.set(lane, sequence);
        return () => active && generation === revision && (!lane || lanes.get(lane) === sequence);
      },
    };
  }, [key]);
  useLayoutEffect(() => { work.activate(); return () => work.close(); }, [work]);
  return work;
}
