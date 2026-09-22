import { useLayoutEffect, useState } from 'react';

export function useWindowFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false);
  useLayoutEffect(() => {
    let closed = false;
    let observedEvent = false;
    const unsubscribe = window.fjoscam.onFullscreenChanged((enabled) => {
      if (closed) return;
      observedEvent = true;
      setFullscreen(enabled);
    });
    void window.fjoscam.getFullscreen().then((enabled) => {
      if (!closed && !observedEvent) setFullscreen(enabled);
    }).catch(() => { /* Later native events can still restore the state. */ });
    return () => { closed = true; unsubscribe(); };
  }, []);
  return fullscreen;
}
