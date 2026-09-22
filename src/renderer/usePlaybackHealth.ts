import { useLayoutEffect, useRef, useState } from 'react';
import type { PlaybackSample } from '../shared/types';

export type PlaybackHealth = { state: 'waiting' | 'live' | 'stalled' | 'error'; text: string };
export function playbackHealth(sample: PlaybackSample, elapsedMs: number): PlaybackHealth {
  const bridge = sample.bridge;
  if (bridge && bridge.state !== 'running') {
    const reason = bridge.reason === 'port-in-use' ? 'Local video port is already in use.'
      : bridge.reason === 'permission-denied' ? 'Local video service was denied access.'
        : bridge.reason === 'stream-invalidated' ? 'Stream settings changed.' : 'Local video service stopped.';
    if (bridge.state === 'recovering') return { state: 'waiting', text: bridge.retryInMs
      ? `Restoring local video service · retry in ${Math.ceil(bridge.retryInMs / 1000)}s`
      : `Restoring local video service · attempt ${Math.max(1, bridge.attempts)}/5` };
    return { state: 'error', text: `${reason} Reconnect to retry.` };
  }
  if (sample.mediaError || sample.ended) return { state: 'error', text: 'Playback interrupted. Reconnect to retry.' };
  if (sample.frames > 0 && sample.frameAgeMs !== null) {
    if (sample.frameAgeMs < 10000) return { state: 'live', text: sample.source === 'mjpeg' ? 'MJPEG frames arriving' : 'Video playing' };
    return { state: 'stalled', text: `No new ${sample.source === 'mjpeg' ? 'MJPEG' : 'video'} frame for ${Math.floor(sample.frameAgeMs / 1000)}s. Reconnect to retry.` };
  }
  return elapsedMs >= 15000
    ? { state: 'stalled', text: 'No video frames received. Check camera, credentials and codec, or reconnect.' }
    : { state: 'waiting', text: sample.ready ? 'Player ready · waiting for video' : 'Waiting for player' };
}

export function usePlaybackHealth(url: string, enabled: boolean, onRecovered?: () => void) {
  const [result, setResult] = useState<{ url: string; health: PlaybackHealth }>();
  const recovered = useRef(onRecovered);
  useLayoutEffect(() => { recovered.current = onRecovered; });
  useLayoutEffect(() => {
    if (!url || !enabled) return;
    let closed = false;
    let pending = false;
    let requested = 0;
    const started = Date.now();
    let generation: number | undefined;
    let recovering = false;
    const poll = async () => {
      if (closed) return;
      if (pending) {
        if (Date.now() - requested >= 5000) setResult({ url, health: { state: 'error', text: 'Playback status is not responding. Reconnect to retry.' } });
        return;
      }
      pending = true;
      requested = Date.now();
      try {
        const sample = await window.fjoscam.getPlaybackHealth(url);
        if (!closed) {
          const bridge = sample.bridge;
          if (bridge) {
            if (bridge.state === 'running' && (recovering || (generation !== undefined && generation !== bridge.generation))) {
              recovering = false;
              generation = bridge.generation;
              recovered.current?.(); // Reload just the player; do not reset the retry budget.
            } else if (bridge.state === 'recovering') recovering = true;
            generation = bridge.generation;
          }
          setResult({ url, health: playbackHealth(sample, Date.now() - started) });
        }
      } catch {
        if (!closed) setResult({ url, health: { state: 'error', text: 'Playback status unavailable. Reconnect to retry.' } });
      } finally { pending = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => { closed = true; window.clearInterval(timer); };
  }, [url, enabled]);
  return enabled && url && result?.url === url ? result.health : { state: 'waiting', text: enabled ? 'Preparing playback' : 'Disconnected' } as PlaybackHealth;
}
