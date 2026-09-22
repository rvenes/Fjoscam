import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FjoscamApi } from '../preload/preload';
import type { AppState, CameraDiscoveryReport, CameraProfile, IrLightsInfo, UpdateStatus, WhiteLedState, ZoomFocusState } from '../shared/types';

vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: vi.fn() }) }));
import App from './App';
import { normalizeCapabilities } from '../main/reolinkCapabilities';

const cameras = ['A', 'B'].map((id) => ({ id, name: `Camera ${id}`, kind: 'reolink' as const,
  host: '192.0.2.1', protocol: 'http' as const, httpPort: 80, rtspPort: 554, username: 'test',
  channel: 0, streamChannel: 0, lowLatency: false }));
let sendPtz: ReturnType<typeof vi.fn>;
beforeEach(() => {
  sendPtz = vi.fn(async () => undefined);
  let state: AppState = { cameras, activeCameraId: 'A' };
  const api = {
    getState: async () => state, getVersion: async () => 'test',
    getFullscreen: async () => false, setFullscreen: vi.fn(async () => undefined), onFullscreenChanged: () => () => {},
    onOpenPanel: () => () => {}, onCameraEditMode: () => () => {}, onUpdateStatus: () => () => {}, onOpenAbout: () => () => {},
    getProfile: async () => profile, getIrLights: async () => undefined, getWhiteLed: async () => undefined, getStreamInfo: async () => ({}),
    getZoomFocus: async () => ({}), getPresets: async () => [], getMjpegUrl: async () => '',
    getWebRtcStream: async () => ({ pageUrl: 'http://127.0.0.1/stream.html' }), setStreamAudio: async () => undefined,
    releaseStream: vi.fn(async () => undefined),
    getPlaybackHealth: async () => ({ source: 'player', ready: true, frames: 0, frameAgeMs: null, ended: false, mediaError: false }),
    setActiveCamera: async (id: string) => { state = { ...state, activeCameraId: id }; return state; },
    sendPtz,
  } as unknown as FjoscamApi;
  Object.defineProperty(window, 'fjoscam', { configurable: true, value: api });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const profile: CameraProfile = { device: { model: 'Synthetic camera', firmware: 'new-firmware' }, channels: [],
  capabilities: { ptz: true, presets: true, zoomFocus: true, irLights: true, whiteLed: true, siren: false, motion: false, ai: false } };

describe('camera view ownership', () => {
  it('shows installation preparation and removes the install action while it runs', async () => {
    let emit!: (status: UpdateStatus) => void;
    window.fjoscam.onUpdateStatus = (callback) => { emit = callback; return () => {}; };
    const view = render(<App />); await view.findByTitle('Camera A WebRTC live view');
    act(() => emit({ state: 'installing', currentVersion: '1.0.7', version: '1.0.8' }));
    expect(view.getByText('Klargjer versjon 1.0.8 for installasjon. Avsluttar kameratilkoplingane...')).toBeInTheDocument();
    expect(view.queryByRole('button', { name: 'Installer og start på nytt' })).toBeNull();
  });
  it('keeps a newer available event when an earlier check IPC reply fails', async () => {
    let emit!: (status: UpdateStatus) => void;
    window.fjoscam.onUpdateStatus = (callback) => { emit = callback; return () => {}; };
    const response = deferred<UpdateStatus>();
    window.fjoscam.checkForUpdates = () => response.promise;
    const view = render(<App />); await view.findByTitle('Camera A WebRTC live view');
    act(() => emit({ state: 'not-available', currentVersion: '1.0.7' }));
    fireEvent.click(view.getByRole('button', { name: 'Sjekk igjen' }));
    act(() => emit({ state: 'available', currentVersion: '1.0.7', version: '1.0.8' }));
    await act(async () => response.reject(new Error('synthetic old failure')));
    expect(view.getByRole('button', { name: 'Last ned' })).toBeInTheDocument();
    expect(view.queryByText('Could not check for updates. Try again.')).toBeNull();
  });
  it('keeps a downloaded event instead of overwriting it with a late downloading response', async () => {
    let emit!: (status: UpdateStatus) => void;
    window.fjoscam.onUpdateStatus = (callback) => { emit = callback; return () => {}; };
    const response = deferred<UpdateStatus>();
    window.fjoscam.downloadUpdate = () => response.promise;
    const view = render(<App />);
    await view.findByTitle('Camera A WebRTC live view');
    act(() => emit({ state: 'available', currentVersion: '1.0.7', version: '1.0.8' }));
    fireEvent.click(view.getByRole('button', { name: 'Last ned' }));
    act(() => emit({ state: 'downloaded', currentVersion: '1.0.7', version: '1.0.8' }));
    await act(async () => response.resolve({ state: 'downloading', currentVersion: '1.0.7', version: '1.0.8' }));
    expect(view.getByRole('button', { name: 'Installer og start på nytt' })).toBeInTheDocument();
  });
  it('shows a fixed error if update download IPC rejects', async () => {
    let emit!: (status: UpdateStatus) => void;
    window.fjoscam.onUpdateStatus = (callback) => { emit = callback; return () => {}; };
    window.fjoscam.downloadUpdate = vi.fn().mockRejectedValue(new Error('synthetic-private-error'));
    const view = render(<App />); await view.findByTitle('Camera A WebRTC live view');
    act(() => emit({ state: 'available', currentVersion: '1.0.7', version: '1.0.8' }));
    fireEvent.click(view.getByRole('button', { name: 'Last ned' }));
    expect(await view.findByText('Could not download the update. Try again.')).toBeInTheDocument();
    expect(view.queryByText(/synthetic-private-error/)).toBeNull();
  });
  it('shows a retryable error if starting the installer rejects', async () => {
    let emit!: (status: UpdateStatus) => void;
    window.fjoscam.onUpdateStatus = (callback) => { emit = callback; return () => {}; };
    window.fjoscam.quitAndInstallUpdate = vi.fn().mockRejectedValue(new Error('synthetic-installer-error'));
    const view = render(<App />); await view.findByTitle('Camera A WebRTC live view');
    act(() => emit({ state: 'downloaded', currentVersion: '1.0.7', version: '1.0.8' }));
    fireEvent.click(view.getByRole('button', { name: 'Installer og start på nytt' }));
    expect(await view.findByText('Could not start the update installer. Try again.')).toBeInTheDocument();
  });
  it('keeps a recovery warning visible while camera status updates', async () => {
    window.fjoscam.getState = async () => ({ cameras, activeCameraId: 'A', configurationNotice: 'recovered-from-backup' });
    window.fjoscam.setActiveCamera = async (id) => ({ cameras, activeCameraId: id, configurationNotice: 'recovered-from-backup' });
    const view = render(<App />);
    expect(await view.findByRole('alert')).toHaveTextContent('Camera settings recovered from backup.');
    fireEvent.click(view.getByRole('button', { name: /Camera B/ }));
    await waitFor(() => expect(view.getByTitle('Camera B WebRTC live view')).toBeInTheDocument());
    expect(view.getByRole('alert')).toHaveTextContent('Recent changes may be missing.');
  });
  it('does not warn about backup recovery for an ordinary start', async () => {
    const view = render(<App />);
    await waitFor(() => expect(view.getByTitle('Camera A WebRTC live view')).toBeInTheDocument());
    expect(view.queryByText('Camera settings recovered from backup.')).toBeNull();
  });
  it('lets a failed discovery retry without claiming that no eligible network exists', async () => {
    window.fjoscam.discoverCameras = vi.fn().mockRejectedValueOnce(new Error('Synthetic search failure')).mockResolvedValue({ cameras: [], networks: [] });
    const view = render(<App />);
    fireEvent.click(await view.findByRole('button', { name: 'Add camera' }));
    await view.findByText('Synthetic search failure');
    expect(view.queryByText('Search coverage and limits')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Search again' }));
    await view.findByText('No cameras found. You can still add one manually.');
    expect(view.getByText('Search coverage and limits')).toBeInTheDocument();
    expect(window.fjoscam.discoverCameras).toHaveBeenCalledTimes(2);
  });
  it('reports limited discovery coverage and clears typed credentials when selecting a new candidate', async () => {
    window.fjoscam.discoverCameras = vi.fn(async (): Promise<CameraDiscoveryReport> => ({
      cameras: [{ id: 'scan-10.1.1.2', host: '10.1.1.2', name: 'Candidate device', xaddrs: [], scopes: [], ports: { rtsp: 554 }, source: 'subnet-scan' }],
      networks: [{ name: 'Ethernet', address: '10.1.1.1', subnet: '10.1.0.0/16', scanSubnet: '10.1.1.0/24', hostCount: 253, limitation: 'large-subnet' }],
    }));
    const view = render(<App />);
    await view.findByRole('button', { name: 'Add camera' });
    fireEvent.click(view.getByRole('button', { name: 'Add camera' }));
    const candidate = await view.findByRole('button', { name: /Candidate device/ });
    expect(view.getByText(/only the local \/24 was checked/)).toBeInTheDocument();
    const password = view.getByLabelText(/Password/);
    fireEvent.change(password, { target: { value: 'synthetic-other-camera-password' } });
    fireEvent.click(candidate);
    expect(password).toHaveValue('');
    expect(view.getByLabelText('IP / host')).toHaveValue('10.1.1.2');
  });
  it('ignores a discovery response owned by a closed settings dialog', async () => {
    const old = deferred<CameraDiscoveryReport>();
    window.fjoscam.discoverCameras = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValue({ cameras: [], networks: [] });
    const view = render(<App />);
    fireEvent.click(await view.findByRole('button', { name: 'Add camera' }));
    fireEvent.click(view.getByRole('button', { name: 'Close camera settings' }));
    fireEvent.click(view.getByRole('button', { name: 'Add camera' }));
    await view.findByText('No cameras found. You can still add one manually.');
    await act(async () => old.resolve({ cameras: [{ id: 'old', host: '10.0.0.2', name: 'Old candidate', xaddrs: [], scopes: [], ports: {}, source: 'subnet-scan' }], networks: [] }));
    expect(view.queryByRole('button', { name: /Old candidate/ })).toBeNull();
    expect(view.getByRole('button', { name: 'Search again' })).toBeEnabled();
  });
  it('stops a held move and blocks camera/fullscreen shortcuts while settings own focus', async () => {
    window.fjoscam.discoverCameras = vi.fn(async () => ({ cameras: [], networks: [] }));
    const switchCamera = vi.spyOn(window.fjoscam, 'setActiveCamera');
    const view = render(<App />);
    await waitFor(() => expect(view.getByTitle('Camera A WebRTC live view')).toBeInTheDocument());
    fireEvent.keyDown(window, { code: 'ArrowLeft' });
    await waitFor(() => expect(sendPtz).toHaveBeenCalledWith('A', { kind: 'move', direction: 'Left', speed: 30 }));
    const opener = view.getByRole('button', { name: 'Add camera' }); opener.focus(); fireEvent.click(opener);
    await waitFor(() => expect(sendPtz).toHaveBeenCalledWith('A', { kind: 'stop' }));
    const dialog = view.getByRole('dialog', { name: 'Add camera' });
    const count = sendPtz.mock.calls.length;
    for (const code of ['ArrowRight', 'KeyW', 'Digit1', 'NumpadMultiply', 'PageUp', 'Enter', 'F11']) fireEvent.keyDown(window, { code });
    expect(sendPtz).toHaveBeenCalledTimes(count); expect(switchCamera).not.toHaveBeenCalled();
    expect(window.fjoscam.setFullscreen).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    expect(view.queryByRole('dialog', { name: 'Add camera' })).toBeNull(); expect(opener).toHaveFocus();
    fireEvent.keyDown(window, { code: 'ArrowRight' });
    await waitFor(() => expect(sendPtz).toHaveBeenCalledWith('A', { kind: 'move', direction: 'Right', speed: 30 }));
  });
  it('follows native fullscreen events and preserves keyboard requests without optimistic state', async () => {
    let emit!: (enabled: boolean) => void;
    window.fjoscam.onFullscreenChanged = (callback) => { emit = callback; return () => {}; };
    const view = render(<App />);
    await waitFor(() => expect(view.getByTitle('Camera A WebRTC live view')).toBeInTheDocument());
    fireEvent.keyDown(window, { code: 'Enter' });
    expect(window.fjoscam.setFullscreen).toHaveBeenLastCalledWith(true);
    expect(view.container.querySelector('main')).not.toHaveClass('viewer-fullscreen');
    act(() => emit(true)); expect(view.container.querySelector('main')).toHaveClass('viewer-fullscreen');
    fireEvent.keyDown(window, { code: 'Escape' });
    expect(window.fjoscam.setFullscreen).toHaveBeenLastCalledWith(false);
    act(() => emit(false)); expect(view.container.querySelector('main')).not.toHaveClass('viewer-fullscreen');
    vi.mocked(window.fjoscam.setFullscreen).mockRejectedValueOnce(new Error('synthetic-failure'));
    fireEvent.keyDown(window, { code: 'F11' });
    await waitFor(() => expect(view.getByText('Could not change fullscreen mode. Try the View menu.')).toBeInTheDocument());
    expect(view.container.querySelector('main')).not.toHaveClass('viewer-fullscreen');
  });
  it('releases before camera switch/disconnect and ignores a late old stream without releasing the new owner', async () => {
    const old = deferred<Awaited<ReturnType<FjoscamApi['getWebRtcStream']>>>();
    const events: string[] = [];
    window.fjoscam.releaseStream = vi.fn(async (id) => { events.push(`release:${id}`); });
    vi.spyOn(window.fjoscam, 'getWebRtcStream').mockImplementation(async (id) => {
      events.push(`open:${id}`);
      if (events.length === 1) return old.promise;
      return { mode: 'webrtc', streamName: id, pageUrl: `http://127.0.0.1/stream.html?src=${id}`, scriptUrl: '', wsUrl: '' };
    });
    const view = render(<App />);
    await waitFor(() => expect(events).toEqual(['open:A']));
    fireEvent.click(view.getByRole('button', { name: /Camera B/ }));
    await waitFor(() => expect(events).toEqual(['open:A', 'release:A', 'open:B']));
    fireEvent.click(view.getByRole('button', { name: /Camera A/ }));
    await waitFor(() => expect(events).toEqual(['open:A', 'release:A', 'open:B', 'release:B', 'open:A']));
    await act(async () => old.resolve({ mode: 'webrtc', streamName: 'old', pageUrl: 'http://127.0.0.1/stream.html?src=old', scriptUrl: '', wsUrl: '' }));
    expect(events).toHaveLength(5);
    expect(view.getByTitle('Camera A WebRTC live view').getAttribute('src')).toContain('src=A');
    fireEvent.click(view.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(events.at(-1)).toBe('release:A'));
    view.unmount(); expect(events).toHaveLength(6);
  });
  it('reloads only the player after bridge recovery, preserving stream quality and retry budget', async () => {
    vi.useFakeTimers();
    const playback = vi.spyOn(window.fjoscam, 'getWebRtcStream');
    vi.spyOn(window.fjoscam, 'getPlaybackHealth').mockResolvedValue({ source: 'player', ready: false, frames: 0,
      frameAgeMs: null, ended: false, mediaError: false, bridge: { state: 'recovering', generation: 1, attempts: 1 } });
    const view = render(<App />);
    await act(async () => vi.advanceTimersByTimeAsync(50));
    expect(view.getByRole('status', { name: 'Playback status' })).toHaveTextContent('Restoring local video service');
    const initial = view.getByTitle('Camera A WebRTC live view'); const source = initial.getAttribute('src');
    vi.mocked(window.fjoscam.getPlaybackHealth).mockResolvedValue({ source: 'player', ready: false, frames: 0,
      frameAgeMs: null, ended: false, mediaError: false, bridge: { state: 'running', generation: 2, attempts: 1 } });
    await act(async () => vi.advanceTimersByTimeAsync(1100));
    const reloaded = view.getByTitle('Camera A WebRTC live view');
    expect(reloaded).not.toBe(initial); expect(reloaded.getAttribute('src')).not.toBe(source);
    expect(reloaded.getAttribute('src')).toContain('q=high'); expect(playback).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(view.getByTitle('Camera A WebRTC live view')).toBe(reloaded);
  });
  it('rejects an old profile after A -> B -> A, without launching its light reads', async () => {
    const old = deferred<CameraProfile>();
    const profiles = vi.spyOn(window.fjoscam, 'getProfile').mockImplementationOnce(() => old.promise).mockResolvedValue(profile);
    window.fjoscam.getIrLights = vi.fn(async (): Promise<IrLightsInfo> => ({ mode: 'auto', options: ['auto', 'off'] }));
    const lights = vi.spyOn(window.fjoscam, 'getWhiteLed');
    const view = render(<App />);
    await waitFor(() => expect(profiles).toHaveBeenCalledTimes(1));
    fireEvent.click(view.getByRole('button', { name: /Camera B/ }));
    await waitFor(() => expect(profiles).toHaveBeenCalledTimes(2));
    await view.findByRole('button', { name: /Controls/ });
    fireEvent.click(view.getByRole('button', { name: /Camera A/ }));
    await waitFor(() => expect(profiles).toHaveBeenCalledTimes(3));
    fireEvent.click(await view.findByRole('button', { name: /Controls/ }));
    await act(async () => old.resolve({ ...profile, device: { firmware: 'obsolete-firmware' } }));
    expect(view.queryByText('FW obsolete-firmware')).toBeNull();
    expect(view.getByText('FW new-firmware')).toBeInTheDocument();
    expect(lights).toHaveBeenCalledTimes(2);
  });

  it('does not apply old IR or spotlight values to the next camera', async () => {
    const ir = deferred<IrLightsInfo>();
    const led = deferred<WhiteLedState>();
    vi.spyOn(window.fjoscam, 'getProfile').mockResolvedValue(profile);
    window.fjoscam.getIrLights = vi.fn().mockImplementationOnce(() => ir.promise).mockResolvedValue({ mode: 'off', options: ['auto', 'off'] });
    vi.spyOn(window.fjoscam, 'getWhiteLed').mockImplementationOnce(() => led.promise).mockResolvedValue({ enabled: false, mode: 0, supportsModes: true });
    const view = render(<App />);
    await waitFor(() => expect(window.fjoscam.getIrLights).toHaveBeenCalledTimes(1));
    fireEvent.click(view.getByRole('button', { name: /Camera B/ }));
    await waitFor(() => expect(window.fjoscam.getIrLights).toHaveBeenCalledTimes(2));
    fireEvent.click(view.getByRole('button', { name: /Controls/ }));
    await act(async () => { ir.resolve({ mode: 'auto', options: ['auto', 'off'] }); led.resolve({ enabled: true, mode: 1, supportsModes: true }); });
    expect(view.getByLabelText('IR')).toHaveValue('off');
    expect(view.getByRole('button', { name: 'Off' })).toHaveClass('selected');
  });

  it.each(['switch', 'disconnect'] as const)('ignores an obsolete stream failure after %s', async (action) => {
    const old = deferred<Awaited<ReturnType<FjoscamApi['getWebRtcStream']>>>();
    const playback = vi.spyOn(window.fjoscam, 'getWebRtcStream').mockImplementationOnce(() => old.promise);
    const view = render(<App />);
    await waitFor(() => expect(playback).toHaveBeenCalledTimes(1));
    fireEvent.click(view.getByRole('button', { name: action === 'switch' ? /Camera B/ : 'Disconnect' }));
    if (action === 'switch') await waitFor(() => expect(playback).toHaveBeenCalledTimes(2));
    await act(async () => old.reject(new Error('obsolete stream failure')));
    expect(view.queryByText('obsolete stream failure')).toBeNull();
    if (action === 'disconnect') expect(view.queryByTitle('Camera A WebRTC live view')).toBeNull();
  });

  it('handles a rejected profile request without taking down playback', async () => {
    const request = deferred<CameraProfile>();
    vi.spyOn(window.fjoscam, 'getProfile').mockImplementation(() => request.promise);
    const view = render(<App />);
    await waitFor(() => expect(view.getByTitle('Camera A WebRTC live view')).toBeInTheDocument());
    await act(async () => request.reject(new Error('profile unavailable')));
    expect(view.getByText('profile unavailable')).toBeInTheDocument();
    expect(view.getByTitle('Camera A WebRTC live view')).toBeInTheDocument();
  });

  it('serializes rapid quality changes and starts only the final stream once', async () => {
    const low = deferred<AppState>();
    window.fjoscam.setStreamQuality = vi.fn().mockImplementationOnce(() => low.promise)
      .mockResolvedValue({ cameras, activeCameraId: 'A' });
    const playback = vi.spyOn(window.fjoscam, 'getWebRtcStream');
    const view = render(<App />);
    await waitFor(() => expect(playback).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'Low' }));
      fireEvent.click(view.getByRole('button', { name: 'High' }));
    });
    expect(window.fjoscam.setStreamQuality).toHaveBeenCalledTimes(1);
    await act(async () => low.resolve({ cameras: cameras.map((camera) => ({ ...camera, lowLatency: true })), activeCameraId: 'A' }));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(window.fjoscam.setStreamQuality).toHaveBeenCalledTimes(2);
    expect(view.getByRole('button', { name: 'High' })).toHaveClass('selected');
    expect(playback).toHaveBeenCalledTimes(2);
    expect(view.getByTitle('Camera A WebRTC live view').getAttribute('src')).toContain('q=high');
    fireEvent.click(view.getByRole('button', { name: 'Disconnect' }));
    expect(view.getByRole('status', { name: 'Playback status' })).toHaveTextContent('Disconnected');
  });

  it('starts playback exactly once on reconnect', async () => {
    const playback = vi.spyOn(window.fjoscam, 'getWebRtcStream');
    const view = render(<App />);
    await waitFor(() => expect(playback).toHaveBeenCalledTimes(1));
    fireEvent.click(view.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(view.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(playback).toHaveBeenCalledTimes(2));
  });

  it('starts the selected lens once and keeps automatic tele zoom on its camera', async () => {
    const state: AppState = { cameras: [{ ...cameras[0], name: 'TrackMix', lensMode: 'dual' }, cameras[1]], activeCameraId: 'A' };
    vi.spyOn(window.fjoscam, 'getState').mockResolvedValue(state);
    window.fjoscam.setStreamChannel = vi.fn(async () => ({ ...state, cameras: state.cameras.map((camera) => camera.id === 'A' ? { ...camera, streamChannel: 1 } : camera) }));
    window.fjoscam.setZoomPosition = vi.fn(async () => ({ zoom: 34 }));
    const playback = vi.spyOn(window.fjoscam, 'getWebRtcStream');
    const view = render(<App />);
    await waitFor(() => expect(playback).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'Zoom' })));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(playback).toHaveBeenCalledTimes(2);
    expect(window.fjoscam.setZoomPosition).toHaveBeenCalledExactlyOnceWith('A', Number.MAX_SAFE_INTEGER);
    expect(view.getByTitle('TrackMix WebRTC live view').getAttribute('src')).toContain('lens=1');
  });

  it('recovers the previous view after a failed save and accepts later edits', async () => {
    const rejected = deferred<AppState>();
    window.fjoscam.setStreamQuality = vi.fn().mockImplementationOnce(() => rejected.promise)
      .mockResolvedValue({ cameras: cameras.map((camera) => ({ ...camera, lowLatency: true })), activeCameraId: 'A' });
    const playback = vi.spyOn(window.fjoscam, 'getWebRtcStream');
    const view = render(<App />);
    await waitFor(() => expect(playback).toHaveBeenCalledTimes(1));
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'Low' })));
    await act(async () => rejected.reject(new Error('synthetic write failure')));
    expect(view.getByRole('button', { name: 'High' })).toHaveClass('selected');
    expect(view.getByText('synthetic write failure')).toBeInTheDocument();
    expect(view.getByTitle('Camera A WebRTC live view')).toBeInTheDocument();
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'Low' })));
    expect(view.getByRole('button', { name: 'Low' })).toHaveClass('selected');
    expect(view.queryByText('synthetic write failure')).toBeNull();
    expect(playback).toHaveBeenCalledTimes(3);
  });

  it('discards a late test result and its automatic name save after a camera switch', async () => {
    const pending = deferred<Awaited<ReturnType<FjoscamApi['testCamera']>>>();
    window.fjoscam.testCamera = vi.fn(() => pending.promise);
    window.fjoscam.saveCamera = vi.fn();
    const view = render(<App />);
    await waitFor(() => expect(view.getByTitle('Camera A WebRTC live view')).toBeInTheDocument());
    fireEvent.click(view.getByRole('button', { name: /PTZ/ }));
    fireEvent.click(view.getByTitle('Refresh presets'));
    await act(async () => fireEvent.click(view.getByRole('button', { name: /Camera B/ })));
    await act(async () => pending.resolve({ ok: true, message: 'obsolete test result', cameraName: 'Old name', presets: [{ id: 1, name: 'Old preset' }] }));
    expect(view.queryByText('obsolete test result')).toBeNull();
    expect(view.queryByText('Old preset')).toBeNull();
    expect(window.fjoscam.saveCamera).not.toHaveBeenCalled();
    expect(view.getByRole('heading', { name: 'Camera B' })).toBeInTheDocument();
  });

  it('keeps a new camera light state when an old light command completes', async () => {
    const pending = deferred<void>();
    window.fjoscam.setWhiteLed = vi.fn(() => pending.promise);
    vi.spyOn(window.fjoscam, 'getProfile').mockResolvedValue(profile);
    window.fjoscam.getIrLights = vi.fn(async (): Promise<IrLightsInfo> => ({ mode: 'off', options: ['off'] }));
    vi.spyOn(window.fjoscam, 'getWhiteLed').mockResolvedValue({ enabled: false, mode: 0, supportsModes: true });
    const view = render(<App />);
    await waitFor(() => expect(view.getByRole('button', { name: /Controls/ })).toBeInTheDocument());
    fireEvent.click(view.getByRole('button', { name: /Controls/ }));
    fireEvent.click(view.getByRole('button', { name: 'Auto' }));
    await act(async () => fireEvent.click(view.getByRole('button', { name: /Camera B/ })));
    await act(async () => pending.resolve());
    expect(view.getByRole('button', { name: 'Off' })).toHaveClass('selected');
    expect(view.queryByText('Spotlight auto (motion at night)')).toBeNull();
    expect(window.fjoscam.setWhiteLed).toHaveBeenCalledExactlyOnceWith('A', { mode: 1 });
  });

  it('drops old profile and debounced zoom after editing the same camera ID', async () => {
    const old = deferred<CameraProfile>();
    const profiles = vi.spyOn(window.fjoscam, 'getProfile').mockImplementationOnce(() => old.promise).mockResolvedValue(profile);
    window.fjoscam.getIrLights = vi.fn(async (): Promise<IrLightsInfo> => ({ mode: 'off', options: ['off'] }));
    window.fjoscam.setZoomPosition = vi.fn();
    window.fjoscam.discoverCameras = vi.fn(async () => ({ cameras: [], networks: [] }));
    window.fjoscam.saveCamera = vi.fn(async () => ({ cameras: [{ ...cameras[0], host: '192.0.2.99' }], activeCameraId: 'A' }));
    const view = render(<App />);
    await waitFor(() => expect(profiles).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    fireEvent.keyDown(window, { code: 'NumpadMultiply' });
    fireEvent.click(view.getByTitle('Add camera'));
    fireEvent.click(view.getByText('Edit active'));
    fireEvent.change(view.getByLabelText('IP / host'), { target: { value: '192.0.2.99' } });
    await act(async () => fireEvent.click(view.getByText('Save camera')));
    await act(async () => old.resolve({ ...profile, device: { model: 'Obsolete camera' } }));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(profiles).toHaveBeenCalledTimes(2);
    expect(view.queryByText('Obsolete camera')).toBeNull();
    expect(window.fjoscam.setZoomPosition).not.toHaveBeenCalled();
  });

  it('ignores an in-flight zoom result after A -> B -> A', async () => {
    const old = deferred<ZoomFocusState>();
    window.fjoscam.setZoomPosition = vi.fn(() => old.promise);
    vi.spyOn(window.fjoscam, 'getZoomFocus').mockResolvedValue({ zoom: 4, zoomRange: { min: 0, max: 34 } });
    const view = render(<App />);
    await waitFor(() => expect(view.getByTitle('Camera A WebRTC live view')).toBeInTheDocument());
    fireEvent.click(view.getByRole('button', { name: /PTZ/ }));
    vi.useFakeTimers();
    fireEvent.keyDown(window, { code: 'NumpadMultiply' });
    await act(async () => vi.advanceTimersByTimeAsync(210));
    expect(window.fjoscam.setZoomPosition).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.click(view.getByRole('button', { name: /Camera B/ })));
    await act(async () => fireEvent.click(view.getByRole('button', { name: /Camera A/ })));
    await act(async () => old.resolve({ zoom: 30 }));
    expect(view.getByRole('slider', { name: /Optical zoom/ })).toHaveValue('4');
    expect(window.fjoscam.setZoomPosition).not.toHaveBeenCalledWith('B', expect.anything());
  });

  it('does not overlap zoom polls and cancels a queued command on unmount', async () => {
    vi.useFakeTimers();
    const pending = deferred<ZoomFocusState>();
    const zoom = vi.spyOn(window.fjoscam, 'getZoomFocus').mockImplementation(() => pending.promise);
    window.fjoscam.setZoomPosition = vi.fn();
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<App />); });
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(zoom).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { code: 'NumpadMultiply' });
    view.unmount();
    await act(async () => { pending.resolve({ zoom: 30 }); await vi.advanceTimersByTimeAsync(4000); });
    expect(window.fjoscam.setZoomPosition).not.toHaveBeenCalled();
    expect(zoom).toHaveBeenCalledTimes(1);
  });
});

describe('truthful playback status', () => {
  it('starts High video while stream metadata is still pending and ignores it after switching camera', async () => {
    const metadata = deferred<Awaited<ReturnType<FjoscamApi['getStreamInfo']>>>();
    const info = vi.spyOn(window.fjoscam, 'getStreamInfo').mockReturnValueOnce(metadata.promise).mockResolvedValue({});
    const playback = vi.spyOn(window.fjoscam, 'getWebRtcStream');
    const view = render(<App />);
    await waitFor(() => expect(view.getByTitle('Camera A WebRTC live view')).toBeInTheDocument());
    expect(info).toHaveBeenCalledWith('A');
    expect(playback).toHaveBeenCalledTimes(1);
    expect(view.getByRole('button', { name: 'High' })).toHaveClass('selected');
    await act(async () => fireEvent.click(view.getByRole('button', { name: /Camera B/ })));
    await act(async () => metadata.resolve({ high: { quality: 'high', resolution: 'OBSOLETE', width: 1, height: 1, fps: 1, bitrateKbps: 1 } }));
    expect(view.queryByText(/OBSOLETE/)).toBeNull();
    expect(view.getByTitle('Camera B WebRTC live view')).toBeInTheDocument();
  });

  it('pauses polling on Disconnect and hidden documents, then resumes without applying hidden results', async () => {
    vi.useFakeTimers();
    const old = deferred<ZoomFocusState>();
    const zoom = vi.spyOn(window.fjoscam, 'getZoomFocus').mockReturnValueOnce(old.promise).mockResolvedValue({ zoom: 4 });
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<App />); });
    expect(zoom).toHaveBeenCalledTimes(1);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    try {
      await act(async () => document.dispatchEvent(new Event('visibilitychange')));
      await act(async () => { old.resolve({ zoom: 30 }); await vi.advanceTimersByTimeAsync(60000); });
      expect(zoom).toHaveBeenCalledTimes(1);
      hidden.mockReturnValue(false);
      await act(async () => document.dispatchEvent(new Event('visibilitychange')));
      expect(zoom).toHaveBeenCalledTimes(2);
      fireEvent.click(view.getByRole('button', { name: /PTZ/ }));
      expect(view.getByRole('slider', { name: /Optical zoom/ })).toHaveValue('4');
      await act(async () => fireEvent.click(view.getByRole('button', { name: 'Disconnect' })));
      await act(async () => vi.advanceTimersByTimeAsync(60000));
      expect(zoom).toHaveBeenCalledTimes(2);
      await act(async () => fireEvent.click(view.getByRole('button', { name: 'Connect' })));
      expect(zoom).toHaveBeenCalledTimes(3);
    } finally { hidden.mockRestore(); }
  });

  it('backs off failed or empty zoom reads and restores normal polling after recovery', async () => {
    vi.useFakeTimers();
    const zoom = vi.spyOn(window.fjoscam, 'getZoomFocus').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({}).mockResolvedValue({ zoom: 7 });
    await act(async () => { render(<App />); });
    expect(zoom).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(5999));
    expect(zoom).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(zoom).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(11999));
    expect(zoom).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(zoom).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(zoom).toHaveBeenCalledTimes(4);
  });

  it('coalesces pending spotlight changes and cancels unsent edits when changing camera', async () => {
    vi.spyOn(window.fjoscam, 'getWhiteLed').mockResolvedValue({ enabled: false, mode: 0, brightness: 10, supportsModes: true, supportsBrightness: true });
    const first = deferred<void>();
    window.fjoscam.setWhiteLed = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const view = render(<App />);
    await waitFor(() => expect(window.fjoscam.getWhiteLed).toHaveBeenCalled());
    fireEvent.click(view.getByRole('button', { name: /Controls/ }));
    const brightness = view.getByRole('slider', { name: /Light/ });
    vi.useFakeTimers();
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'Auto' })));
    fireEvent.change(brightness, { target: { value: '20' } });
    fireEvent.change(brightness, { target: { value: '80' } });
    fireEvent.click(view.getByRole('button', { name: 'Off' }));
    expect(window.fjoscam.setWhiteLed).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve());
    expect(window.fjoscam.setWhiteLed).toHaveBeenLastCalledWith('A', { brightness: 80, mode: 0 });
    expect(window.fjoscam.setWhiteLed).toHaveBeenCalledTimes(2);
    fireEvent.change(brightness, { target: { value: '90' } });
    await act(async () => fireEvent.click(view.getByRole('button', { name: /Camera B/ })));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(window.fjoscam.setWhiteLed).toHaveBeenCalledTimes(2);
  });

  it('does not report live on iframe load and keeps API success separate from video', async () => {
    window.fjoscam.testCamera = vi.fn(async () => ({ ok: true, scope: 'api' as const, message: 'Camera API connected' }));
    const view = render(<App />);
    await waitFor(() => expect(view.getByTitle('Camera A WebRTC live view')).toBeInTheDocument());
    fireEvent.load(view.getByTitle('Camera A WebRTC live view'));
    expect(view.getByRole('status', { name: 'Playback status' })).not.toHaveTextContent('Video playing');
    fireEvent.click(view.getByRole('button', { name: /PTZ/ }));
    fireEvent.click(view.getByTitle('Refresh presets'));
    await waitFor(() => expect(view.getByText('Camera API connected')).toBeInTheDocument());
    expect(view.getByRole('status', { name: 'Playback status' })).toHaveTextContent('waiting for video');
  });

  it('reports frame stall and lets Reconnect start the same High stream once', async () => {
    const read = vi.spyOn(window.fjoscam, 'getPlaybackHealth').mockResolvedValue({ source: 'player', ready: true, frames: 10, frameAgeMs: 20, ended: false, mediaError: false });
    const playback = vi.spyOn(window.fjoscam, 'getWebRtcStream');
    const view = render(<App />);
    await waitFor(() => expect(view.getByRole('status', { name: 'Playback status' })).toHaveTextContent('Video playing'));
    read.mockResolvedValue({ source: 'player', ready: true, frames: 10, frameAgeMs: 12000, ended: false, mediaError: false });
    // Re-enter the effect with a new generation rather than waiting for a real interval.
    fireEvent.click(view.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() => expect(playback).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.getByRole('status', { name: 'Playback status' })).toHaveTextContent('No new video frame'));
    expect(view.getByRole('button', { name: 'High' })).toHaveClass('selected');
    expect(view.getByTitle('Camera A WebRTC live view').getAttribute('src')).toContain('q=high');
  });
});

describe('reported camera capabilities', () => {
  it.each(['unsupported', 'read-only', 'unknown'] as const)('blocks buttons, keyboard commands and background zoom for %s capabilities', async (kind) => {
    const flag = kind === 'unsupported' ? { ver: 0, permit: 7 } : kind === 'read-only' ? { ver: 2, permit: 4 } : undefined;
    vi.spyOn(window.fjoscam, 'getProfile').mockResolvedValue({ ...profile, capabilities: normalizeCapabilities({ ptzType: flag, ptzCtrl: flag, ptzPreset: flag, ledControl: flag, floodLight: flag, alarmAudio: flag }, 0) });
    const zoom = vi.spyOn(window.fjoscam, 'getZoomFocus');
    const presets = vi.spyOn(window.fjoscam, 'getPresets');
    const light = vi.spyOn(window.fjoscam, 'getWhiteLed');
    window.fjoscam.setZoomPosition = vi.fn();
    const view = render(<App />);
    await waitFor(() => expect(view.getByRole('button', { name: /Controls/ })).toBeInTheDocument());
    fireEvent.click(view.getByRole('button', { name: /PTZ/ }));
    fireEvent.click(view.getByRole('button', { name: /Controls/ }));
    expect(view.getByTitle('Left')).toBeDisabled();
    expect(view.getByTitle('Zoom in (hold)')).toBeDisabled();
    expect(view.getByTitle('Focus far')).toBeDisabled();
    expect(view.getByTitle('Save current PTZ preset')).toBeDisabled();
    expect(view.queryByText('Play siren')).toBeNull();
    if (kind === 'read-only') expect(view.getByText(/read-only or no permission/)).toBeInTheDocument();
    if (kind === 'unknown') expect(view.getByText(/could not be confirmed/)).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'ArrowLeft' });
    fireEvent.keyDown(window, { code: 'NumpadMultiply' });
    fireEvent.keyDown(window, { code: 'Digit1' });
    expect(sendPtz).not.toHaveBeenCalled();
    expect(window.fjoscam.setZoomPosition).not.toHaveBeenCalled();
    expect(zoom).not.toHaveBeenCalled(); expect(presets).not.toHaveBeenCalled(); expect(light).not.toHaveBeenCalled();
  });

  it('does not carry polling permission across a switch to an unsupported camera', async () => {
    vi.spyOn(window.fjoscam, 'getProfile').mockResolvedValueOnce(profile).mockResolvedValue({ ...profile, capabilities: normalizeCapabilities({ ptzType: { ver: 0, permit: 7 } }, 0) });
    const zoom = vi.spyOn(window.fjoscam, 'getZoomFocus');
    const view = render(<App />);
    await waitFor(() => expect(zoom).toHaveBeenCalledWith('A'));
    await act(async () => fireEvent.click(view.getByRole('button', { name: /Camera B/ })));
    expect(zoom).not.toHaveBeenCalledWith('B');
    fireEvent.keyDown(window, { code: 'ArrowLeft' });
    expect(sendPtz).not.toHaveBeenCalled();
  });

  it('recovers missing capability data with refresh while retaining the safety Stop', async () => {
    vi.spyOn(window.fjoscam, 'getProfile').mockResolvedValueOnce(undefined).mockResolvedValue(profile);
    window.fjoscam.testCamera = vi.fn(async () => ({ ok: true, message: 'Connected' }));
    const view = render(<App />);
    await waitFor(() => expect(view.getByTitle('Camera A WebRTC live view')).toBeInTheDocument());
    fireEvent.click(view.getByRole('button', { name: /PTZ/ }));
    expect(view.getByTitle('Left')).toBeDisabled();
    fireEvent.click(view.getByTitle('Stop'));
    await waitFor(() => expect(sendPtz).toHaveBeenCalledWith('A', { kind: 'stop' }));
    fireEvent.click(view.getByTitle('Refresh presets'));
    await waitFor(() => expect(view.getByTitle('Left')).toBeEnabled());
    fireEvent.keyDown(window, { code: 'ArrowLeft' });
    await waitFor(() => expect(sendPtz).toHaveBeenCalledWith('A', expect.objectContaining({ kind: 'move' })));
  });

  it('cancels a debounced zoom command when refreshed permissions remove zoom', async () => {
    const denied = { ...profile, capabilities: normalizeCapabilities({ ptzType: { ver: 2, permit: 4 }, ptzCtrl: { ver: 2, permit: 4 } }, 0) };
    vi.spyOn(window.fjoscam, 'getProfile').mockResolvedValueOnce(profile).mockResolvedValue(denied);
    window.fjoscam.testCamera = vi.fn(async () => ({ ok: true, message: 'Connected' }));
    window.fjoscam.setZoomPosition = vi.fn();
    const view = render(<App />);
    await waitFor(() => expect(view.getByRole('button', { name: /Controls/ })).toBeInTheDocument());
    fireEvent.click(view.getByRole('button', { name: /PTZ/ }));
    vi.useFakeTimers();
    fireEvent.keyDown(window, { code: 'NumpadMultiply' });
    await act(async () => fireEvent.click(view.getByTitle('Refresh presets')));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(window.fjoscam.setZoomPosition).not.toHaveBeenCalled();
    expect(view.getByTitle('Zoom in (hold)')).toBeDisabled();
  });

  it('keeps Panasonic movement and presets but hides all generic-stream controls', async () => {
    const state: AppState = { cameras: [{ ...cameras[0], kind: 'panasonic' }, { ...cameras[1], kind: 'generic' }], activeCameraId: 'A' };
    vi.spyOn(window.fjoscam, 'getState').mockResolvedValue(state);
    vi.spyOn(window.fjoscam, 'setActiveCamera').mockResolvedValue({ ...state, activeCameraId: 'B' });
    const profiles = vi.spyOn(window.fjoscam, 'getProfile');
    const view = render(<App />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Preset 1' })).toBeInTheDocument());
    fireEvent.click(view.getByRole('button', { name: /PTZ/ }));
    expect(view.getByTitle('Left')).toBeEnabled();
    expect(view.getByTitle('Save current PTZ preset')).toBeDisabled();
    fireEvent.keyDown(window, { code: 'Digit1' });
    await waitFor(() => expect(sendPtz).toHaveBeenCalledWith('A', { kind: 'preset', presetId: 1 }));
    await act(async () => fireEvent.click(view.getByRole('button', { name: /Camera B/ })));
    expect(view.queryByRole('button', { name: /PTZ/ })).toBeNull();
    expect(view.queryByText('Preset 1')).toBeNull();
    expect(profiles).not.toHaveBeenCalled();
  });

  it('saves an explicit dual-lens override instead of inferring it from a name', async () => {
    window.fjoscam.discoverCameras = vi.fn(async () => ({ cameras: [], networks: [] }));
    window.fjoscam.saveCamera = vi.fn(async (input) => ({ cameras: [{ ...cameras[0], ...input }], activeCameraId: 'A' }));
    const view = render(<App />);
    await waitFor(() => expect(view.getByRole('button', { name: /Controls/ })).toBeInTheDocument());
    expect(view.queryByRole('button', { name: 'Wide' })).toBeNull();
    fireEvent.click(view.getByTitle('Add camera')); fireEvent.click(view.getByText('Edit active'));
    fireEvent.change(view.getByLabelText('Lens controls'), { target: { value: 'dual' } });
    fireEvent.click(view.getByText('Save camera'));
    await waitFor(() => expect(view.getByRole('button', { name: 'Wide' })).toBeInTheDocument());
    expect(window.fjoscam.saveCamera).toHaveBeenCalledWith(expect.objectContaining({ lensMode: 'dual' }), 'A');
  });
});

describe('held PTZ controls', () => {
  it('stops the originating camera on blur and after a camera switch', async () => {
    const view = render(<App />);
    await waitFor(() => expect(view.getByRole('button', { name: /Controls/ })).toBeInTheDocument());
    fireEvent.keyDown(window, { code: 'ArrowLeft' });
    await waitFor(() => expect(sendPtz).toHaveBeenCalledWith('A', expect.objectContaining({ kind: 'move' })));
    fireEvent.blur(window);
    await waitFor(() => expect(sendPtz).toHaveBeenCalledWith('A', { kind: 'stop' }));
    sendPtz.mockClear();
    fireEvent.keyDown(window, { code: 'ArrowLeft' });
    fireEvent.keyDown(window, { code: 'PageDown' });
    await waitFor(() => expect(sendPtz).toHaveBeenCalledWith('A', { kind: 'stop' }));
    fireEvent.keyUp(window, { code: 'ArrowLeft' });
    expect(sendPtz).not.toHaveBeenCalledWith('B', { kind: 'stop' });
  });

  it('releases held movement even when keyup is delivered to an input', async () => {
    const view = render(<App />);
    await waitFor(() => expect(view.getByRole('button', { name: /Controls/ })).toBeInTheDocument());
    fireEvent.keyDown(window, { code: 'ArrowLeft' });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyUp(input, { code: 'ArrowLeft' });
    await waitFor(() => expect(sendPtz).toHaveBeenCalledWith('A', { kind: 'stop' }));
    input.remove();
  });
});

describe('saved generic stream settings', () => {
  it('keeps saved addresses out of the form and reloads playback after replacing one', async () => {
    const generic = { ...cameras[0], kind: 'generic' as const, hasStreamUrl: true };
    const state: AppState = { cameras: [generic], activeCameraId: generic.id };
    vi.spyOn(window.fjoscam, 'getState').mockResolvedValue(state);
    window.fjoscam.discoverCameras = vi.fn(async () => ({ cameras: [], networks: [] }));
    window.fjoscam.saveCamera = vi.fn(async () => state);
    const playback = vi.spyOn(window.fjoscam, 'getWebRtcStream');
    const view = render(<App />);
    await waitFor(() => expect(playback).toHaveBeenCalledTimes(1));
    fireEvent.click(view.getByTitle('Add camera'));
    fireEvent.click(view.getByText('Edit active'));
    const field = view.getByPlaceholderText('Leave blank to keep saved URL') as HTMLInputElement;
    expect(field.value).toBe('');
    expect(field.type).toBe('password');
    fireEvent.click(view.getByText('Save camera'));
    await waitFor(() => expect(window.fjoscam.saveCamera).toHaveBeenCalledWith(expect.objectContaining({ streamUrl: '', password: '' }), 'A'));
    await waitFor(() => expect(playback).toHaveBeenCalledTimes(2));
    fireEvent.click(view.getByTitle('Add camera'));
    fireEvent.click(view.getByText('Edit active'));
    const replacement = 'rtsps://user:synthetic-replacement@192.0.2.3/private-path';
    fireEvent.change(view.getByPlaceholderText('Leave blank to keep saved URL'), { target: { value: replacement } });
    fireEvent.click(view.getByText('Save camera'));
    await waitFor(() => expect(window.fjoscam.saveCamera).toHaveBeenLastCalledWith(expect.objectContaining({ streamUrl: replacement, host: '192.0.2.3' }), 'A'));
    await waitFor(() => expect(playback).toHaveBeenCalledTimes(3));
  });

  it('clears an unsaved replacement when settings are cancelled', async () => {
    window.fjoscam.discoverCameras = vi.fn(async () => ({ cameras: [], networks: [] }));
    const view = render(<App />);
    await waitFor(() => expect(view.getAllByText('Camera A').length).toBeGreaterThan(0));
    fireEvent.click(view.getByTitle('Add camera'));
    fireEvent.change(view.getByLabelText('Camera type'), { target: { value: 'generic' } });
    fireEvent.change(view.getByPlaceholderText('rtsp:// or rtsps:// address'), { target: { value: 'rtsp://test:synthetic-unsaved@192.0.2.1/token' } });
    fireEvent.click(view.getByRole('button', { name: 'Close camera settings' }));
    fireEvent.click(view.getByTitle('Add camera'));
    fireEvent.change(view.getByLabelText('Camera type'), { target: { value: 'generic' } });
    expect((view.getByPlaceholderText('rtsp:// or rtsps:// address') as HTMLInputElement).value).toBe('');
  });
});

describe('HTTPS trust in camera settings', () => {
  const httpsTrust = { origin: 'https://192.0.2.1', fingerprint256: Array(32).fill('AB').join(':') };
  function setup() {
    const state: AppState = { cameras: [{ ...cameras[0], protocol: 'https', httpPort: 443, httpsTrust }], activeCameraId: 'A' };
    vi.spyOn(window.fjoscam, 'getState').mockResolvedValue(state);
    window.fjoscam.discoverCameras = vi.fn(async () => ({ cameras: [], networks: [] }));
    window.fjoscam.saveCamera = vi.fn(async () => state);
    return render(<App />);
  }

  it('clears the certificate exception when editing the camera address', async () => {
    const view = setup();
    await waitFor(() => expect(view.getAllByText('Camera A').length).toBeGreaterThan(0));
    fireEvent.click(view.getByTitle('Add camera'));
    fireEvent.click(view.getByText('Edit active'));
    expect(view.getByText(httpsTrust.fingerprint256)).toBeInTheDocument();
    fireEvent.change(view.getByLabelText('IP / host'), { target: { value: '192.0.2.2' } });
    expect(view.queryByText(httpsTrust.fingerprint256)).toBeNull();
    fireEvent.click(view.getByText('Save camera'));
    await waitFor(() => expect(window.fjoscam.saveCamera).toHaveBeenCalledWith(expect.objectContaining({ host: '192.0.2.2', httpsTrust: undefined }), 'A'));
  });

  it('does not restore a removed certificate exception after a slow name lookup', async () => {
    let release!: (name: string) => void;
    window.fjoscam.getDeviceName = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const view = setup();
    await waitFor(() => expect(view.getAllByText('Camera A').length).toBeGreaterThan(0));
    fireEvent.click(view.getByTitle('Add camera'));
    fireEvent.click(view.getByText('Edit active'));
    fireEvent.click(view.getByText('Fetch'));
    fireEvent.click(view.getByText('Remove certificate exception'));
    release('Name from earlier settings');
    await waitFor(() => expect(view.getByText('Save camera')).toBeEnabled());
    expect(view.queryByText(httpsTrust.fingerprint256)).toBeNull();
    fireEvent.click(view.getByText('Save camera'));
    await waitFor(() => expect(window.fjoscam.saveCamera).toHaveBeenCalledWith(expect.objectContaining({ httpsTrust: undefined }), 'A'));
  });
});

describe('explicit ONVIF compatibility setting', () => {
  it('requires an opt-in even for an existing HTTPS camera and saves its port', async () => {
    const state: AppState = { cameras: [{ ...cameras[0], protocol: 'https', httpPort: 443 }], activeCameraId: 'A' };
    vi.spyOn(window.fjoscam, 'getState').mockResolvedValue(state);
    window.fjoscam.discoverCameras = vi.fn(async () => ({ cameras: [], networks: [] }));
    window.fjoscam.saveCamera = vi.fn(async () => state);
    const view = render(<App />);
    await waitFor(() => expect(view.getAllByText('Camera A').length).toBeGreaterThan(0));
    fireEvent.click(view.getByTitle('Add camera')); fireEvent.click(view.getByText('Edit active'));
    const toggle = view.getByRole('checkbox', { name: 'Allow unencrypted ONVIF PTZ fallback' });
    expect(toggle).not.toBeChecked();
    expect(view.queryByLabelText('ONVIF HTTP port')).toBeNull();
    fireEvent.click(toggle);
    fireEvent.change(view.getByLabelText('ONVIF HTTP port'), { target: { value: '8888' } });
    fireEvent.click(view.getByText('Save camera'));
    await waitFor(() => expect(window.fjoscam.saveCamera).toHaveBeenCalledWith(expect.objectContaining({ allowInsecureOnvif: true, onvifPort: 8888 }), 'A'));
  });

  it('clears HTTP fallback permission when changing the target host or camera type', async () => {
    const state: AppState = { cameras: [{ ...cameras[0], allowInsecureOnvif: true, onvifPort: 8000 }], activeCameraId: 'A' };
    vi.spyOn(window.fjoscam, 'getState').mockResolvedValue(state);
    window.fjoscam.discoverCameras = vi.fn(async () => ({ cameras: [], networks: [] }));
    const view = render(<App />);
    await waitFor(() => expect(view.getAllByText('Camera A').length).toBeGreaterThan(0));
    fireEvent.click(view.getByTitle('Add camera')); fireEvent.click(view.getByText('Edit active'));
    expect(view.getByRole('checkbox', { name: 'Allow unencrypted ONVIF PTZ fallback' })).toBeChecked();
    fireEvent.change(view.getByLabelText('IP / host'), { target: { value: '192.0.2.2' } });
    expect(view.getByRole('checkbox', { name: 'Allow unencrypted ONVIF PTZ fallback' })).not.toBeChecked();
    fireEvent.click(view.getByRole('checkbox', { name: 'Allow unencrypted ONVIF PTZ fallback' }));
    fireEvent.change(view.getByLabelText('Camera type'), { target: { value: 'generic' } });
    expect(view.queryByRole('checkbox', { name: 'Allow unencrypted ONVIF PTZ fallback' })).toBeNull();
    fireEvent.change(view.getByLabelText('Camera type'), { target: { value: 'reolink' } });
    expect(view.getByRole('checkbox', { name: 'Allow unencrypted ONVIF PTZ fallback' })).not.toBeChecked();
  });
});
