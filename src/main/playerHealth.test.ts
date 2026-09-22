import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { isPlayerUrl, probePlayer, readPlayerHealth, setPlayerAudio } from './playerHealth';

const url = 'http://127.0.0.1:1984/stream.html?src=fjoscam_A&r=1';
afterEach(() => { document.body.replaceChildren(); delete (window as unknown as Record<string, unknown>).__fjoscamPlayerHealth; });
function videoFixture() {
  const video = document.createElement('video');
  let callback!: VideoFrameRequestCallback;
  video.requestVideoFrameCallback = vi.fn((next) => { callback = next; return 1; });
  video.cancelVideoFrameCallback = vi.fn();
  document.body.append(video);
  return { video, frame: () => callback(performance.now(), {} as VideoFrameCallbackMetadata) };
}
describe('local player observation', () => {
  it('does not equate a video element or page load with a rendered frame', () => {
    const { video, frame } = videoFixture();
    const audio = { muted: true, volume: 0.6, revision: 1 };
    expect(probePlayer(audio)).toMatchObject({ ready: true, frames: 0, frameAgeMs: null });
    probePlayer(audio);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    frame();
    expect(probePlayer(audio)).toMatchObject({ frames: 1, frameAgeMs: expect.any(Number) });
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
  });
  it('retains the newest mute and volume if an old observation executes late', () => {
    const { video } = videoFixture();
    probePlayer({ muted: false, volume: 0.9, revision: 3 });
    probePlayer({ muted: true, volume: 0.2, revision: 4 });
    probePlayer({ muted: false, volume: 0.9, revision: 3 });
    expect(video.muted).toBe(true); expect(video.volume).toBe(0.2);
  });
  it('resets frame evidence and cancels the old callback when a player replaces its video', () => {
    const old = videoFixture();
    const audio = { muted: true, volume: 0.6, revision: 1 };
    probePlayer(audio); old.frame(); probePlayer(audio);
    old.video.remove(); const next = videoFixture();
    expect(probePlayer(audio).frames).toBe(0);
    expect(old.video.cancelVideoFrameCallback).toHaveBeenCalled();
    old.frame(); // Late callback belonging to the detached video must not count.
    expect(probePlayer(audio).frames).toBe(0);
    next.frame(); expect(probePlayer(audio).frames).toBe(1);
  });
  it('selects the exact current frame and returns only allowlisted data', async () => {
    const stale = { url: url.replace('r=1', 'r=0'), executeJavaScript: vi.fn() };
    const active = { url, executeJavaScript: vi.fn(async () => ({ ready: true, frames: 3, frameAgeMs: 42, cameraPassword: 'synthetic', error: 'private URL' })) };
    const contents = { mainFrame: { framesInSubtree: [stale, active] } } as unknown as WebContents;
    expect(await readPlayerHealth(contents, url)).toEqual({ source: 'player', ready: true, frames: 3, frameAgeMs: 42, ended: false, mediaError: false });
    expect(stale.executeJavaScript).not.toHaveBeenCalled();
    active.executeJavaScript.mockRejectedValueOnce(new Error('synthetic credential-bearing URL'));
    expect(await readPlayerHealth(contents, url)).toMatchObject({ mediaError: true, frames: 0 });
  });
  it('rejects external and admin targets and applies audio only to player frames', async () => {
    for (const target of ['https://camera.example/stream.html?src=fjoscam_A', 'http://127.0.0.1:1984/api/streams', 'http://user:pass@127.0.0.1:1984/stream.html?src=fjoscam_A']) expect(isPlayerUrl(target)).toBe(false);
    const active = { url, executeJavaScript: vi.fn(async () => ({})) };
    const unrelated = { url: 'https://example.com', executeJavaScript: vi.fn() };
    const contents = { mainFrame: { framesInSubtree: [active, unrelated] }, setAudioMuted: vi.fn() } as unknown as WebContents;
    await setPlayerAudio(contents, false, 2);
    expect(active.executeJavaScript).toHaveBeenCalledOnce();
    expect(unrelated.executeJavaScript).not.toHaveBeenCalled();
    await expect(readPlayerHealth(contents, unrelated.url)).rejects.toThrow('Invalid playback target');
  });
});
