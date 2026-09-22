import type { WebContents } from 'electron';
import type { PlaybackSample } from '../shared/types.js';

type Audio = { muted: boolean; volume: number; revision: number };
const audioSettings = new WeakMap<WebContents, Audio>();

export function isPlayerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return !url.username && !url.password && url.origin === 'http://127.0.0.1:1984' && url.pathname === '/stream.html' &&
      /^fjoscam_[a-zA-Z0-9_-]+$/.test(url.searchParams.get('src') ?? '');
  } catch { return false; }
}

// Runs inside the local, cross-origin player. Keep this function self-contained:
// its compiled source is injected, never any camera address or error text.
export function probePlayer(audio: Audio): PlaybackSample {
  type Monitor = { video: HTMLVideoElement | null; callback?: number; frames: number; last: number | null; audio: Audio };
  const owner = window as unknown as { __fjoscamPlayerHealth?: Monitor };
  const monitor = owner.__fjoscamPlayerHealth ??= { video: null, frames: 0, last: null, audio };
  if (audio.revision >= monitor.audio.revision) monitor.audio = audio;
  const video = document.querySelector('video');
  if (monitor.video !== video) {
    if (monitor.callback !== undefined) monitor.video?.cancelVideoFrameCallback(monitor.callback);
    monitor.video = video;
    monitor.frames = 0;
    monitor.last = null;
    monitor.callback = undefined;
  }
  if (video) {
    video.muted = monitor.audio.muted;
    video.volume = monitor.audio.volume;
    // One outstanding callback per player. Sampling requests another callback
    // at most once per second, rather than running JS at the full frame rate.
    if (monitor.callback === undefined && typeof video.requestVideoFrameCallback === 'function') {
      monitor.callback = video.requestVideoFrameCallback(() => {
        if (monitor.video !== video) return;
        monitor.frames += 1;
        monitor.last = performance.now();
        monitor.callback = undefined;
      });
    }
  }
  return { source: 'player', ready: !!video, frames: monitor.frames,
    frameAgeMs: monitor.last === null ? null : Math.max(0, performance.now() - monitor.last),
    ended: video?.ended ?? false, mediaError: !!video?.error };
}

function script(audio: Audio): string { return `(${probePlayer.toString()})(${JSON.stringify(audio)})`; }
const defaultAudio: Audio = { muted: true, volume: 0.6, revision: 0 };

export async function readPlayerHealth(contents: WebContents, pageUrl: string): Promise<PlaybackSample> {
  if (!isPlayerUrl(pageUrl)) throw new Error('Invalid playback target.');
  const frame = contents.mainFrame.framesInSubtree.find((candidate) => candidate.url === pageUrl);
  const empty: PlaybackSample = { source: 'player', ready: false, frames: 0, frameAgeMs: null, ended: false, mediaError: false };
  if (!frame) return empty;
  try {
    const raw = await frame.executeJavaScript(script(audioSettings.get(contents) ?? defaultAudio));
    const result = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    // Allowlist the result; do not forward strings or objects from the player.
    return { source: 'player', ready: result?.ready === true,
      frames: typeof result.frames === 'number' && Number.isSafeInteger(result.frames) && result.frames >= 0 ? result.frames : 0,
      frameAgeMs: typeof result?.frameAgeMs === 'number' && Number.isFinite(result.frameAgeMs) && result.frameAgeMs >= 0 ? result.frameAgeMs : null,
      ended: result?.ended === true, mediaError: result?.mediaError === true };
  } catch { return { ...empty, mediaError: true }; }
}

export async function setPlayerAudio(contents: WebContents, muted: boolean, volume: number): Promise<void> {
  const settings = { muted: !!muted || volume === 0, volume: Math.max(0, Math.min(1, Number(volume) || 0)),
    revision: (audioSettings.get(contents)?.revision ?? 0) + 1 };
  audioSettings.set(contents, settings);
  contents.setAudioMuted(settings.muted || settings.volume === 0);
  await Promise.allSettled(contents.mainFrame.framesInSubtree.filter((frame) => isPlayerUrl(frame.url))
    .map((frame) => frame.executeJavaScript(script(settings))));
}
