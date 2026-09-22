// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeHealth, CameraWithSecret, PtzCommand } from '../shared/types.js';

const state = vi.hoisted(() => ({
  appEvents: new Map<string, (...args: any[]) => void>(),
  powerEvents: new Map<string, () => void>(),
  saveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined as string | undefined })),
  writeReport: vi.fn(async () => undefined),
  handlers: new Map<string, (...args: any[]) => any>(),
  windows: [] as any[],
  primary: true,
  showError: vi.fn(), loadWindow: vi.fn(async () => undefined),
  install: vi.fn(),
  installWith: undefined as undefined | ((launch: () => void) => Promise<void>),
  quit: vi.fn(), snapshotStart: vi.fn(async () => 1234), snapshotStop: vi.fn(async () => undefined),
  invalidateSnapshot: vi.fn(), releaseSnapshots: vi.fn(),
  bridgeStop: vi.fn(async () => undefined), invalidateStream: vi.fn(), logoutAll: vi.fn(async () => undefined),
  observePlayback: vi.fn<() => BridgeHealth>(),
  releaseStreams: vi.fn(async () => undefined),
  getState: vi.fn(async () => ({ cameras: [], activeCameraId: null })),
  getCamera: vi.fn<() => Promise<CameraWithSecret>>(),
  saveCamera: vi.fn(async () => ({ cameras: [], activeCameraId: null })),
  setStreamChannel: vi.fn(async () => ({ cameras: [], activeCameraId: null })),
  setStreamQuality: vi.fn(async () => ({ cameras: [], activeCameraId: null })),
  getPresets: vi.fn(async (_camera: CameraWithSecret) => []),
  sendPtz: vi.fn(async (_camera: CameraWithSecret, _command: PtzCommand) => {}),
  removeCamera: vi.fn(async () => ({ cameras: [], activeCameraId: null })),
  inspectStream: vi.fn(async (_url: string) => ({ origin: 'rtsps://192.0.2.1:554', fingerprint256: Array(32).fill('AB').join(':') })),
  testReolink: vi.fn(async () => ({ ok: true, scope: 'api', message: 'Camera API connected' })),
  testPanasonic: vi.fn(async () => ({ ok: true, scope: 'mjpeg', message: 'MJPEG test: JPEG frame received' })),
  getCameraName: vi.fn(async (_camera: CameraWithSecret) => 'Synthetic name'),
  readLight: vi.fn(async () => undefined), playSiren: vi.fn(async () => undefined),
  getZoomFocus: vi.fn(async (_camera: CameraWithSecret) => ({ zoom: 4 })),
  setWhiteLed: vi.fn(async (_camera: CameraWithSecret, _options: { mode?: number; brightness?: number }) => {}),
}));
vi.mock('electron', () => ({
  app: {
    requestSingleInstanceLock: () => state.primary, quit: state.quit, getVersion: () => 'test-version',
    isPackaged: false, isReady: () => true, whenReady: () => Promise.resolve(),
    on: (name: string, fn: (...args: any[]) => void) => state.appEvents.set(name, fn),
  },
  BrowserWindow: class extends EventEmitter {
    static getAllWindows() { return state.windows; }
    static fromWebContents(sender: unknown) { return state.windows.find((window) => window.webContents === sender); }
    isFullScreen = vi.fn(() => false);
    setFullScreen = vi.fn();
    webContents = Object.assign(new EventEmitter(), {
      id: state.windows.length + 1, mainFrame: { url: 'http://127.0.0.1:5173/' }, setWindowOpenHandler: vi.fn(), send: vi.fn(),
    });
    constructor() { super(); state.windows.push(this); }
    loadURL = state.loadWindow;
  },
  Menu: { buildFromTemplate: () => [], setApplicationMenu: vi.fn() },
  ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => state.handlers.set(name, fn) },
  powerMonitor: { on: (name: string, fn: () => void) => state.powerEvents.set(name, fn) },
  session: { defaultSession: { webRequest: { onBeforeSendHeaders: vi.fn() } } },
  shell: {},
  dialog: { showErrorBox: state.showError, showSaveDialog: state.saveDialog },
}));
vi.mock('node:fs/promises', () => ({ writeFile: state.writeReport }));
vi.mock('./store.js', () => ({ CameraStore: class { getState = state.getState; getCameraWithSecret = state.getCamera; saveCamera = state.saveCamera; removeCamera = state.removeCamera; setStreamChannel = state.setStreamChannel; setStreamQuality = state.setStreamQuality; } }));
vi.mock('./snapshotServer.js', () => ({ SnapshotServer: class { start = state.snapshotStart; stop = state.snapshotStop; testPanasonic = state.testPanasonic; invalidateCamera = state.invalidateSnapshot; releaseAll = state.releaseSnapshots; } }));
vi.mock('./go2rtcBridge.js', () => ({ Go2RtcBridge: class { stop = state.bridgeStop; invalidateCamera = state.invalidateStream; observePlayback = state.observePlayback; releaseAll = state.releaseStreams; } }));
vi.mock('./reolinkClient.js', () => ({ ReolinkClient: class { logoutAll = state.logoutAll; getPresets = state.getPresets; sendPtz = state.sendPtz; updateCameraConfiguration = vi.fn(); testConnection = state.testReolink; getCameraName = state.getCameraName; getZoomFocus = state.getZoomFocus; setWhiteLed = state.setWhiteLed; getIrLights = state.readLight; getWhiteLed = state.readLight; getSirenConfig = state.readLight; playSiren = state.playSiren; } }));
vi.mock('./updater.js', () => ({ AppUpdater: class {
  constructor(installWith: (launch: () => void) => Promise<void>) { state.installWith = installWith; }
  quitAndInstall() { return state.installWith!(state.install); }
} }));
vi.mock('./panasonicClient.js', () => ({ PanasonicClient: class {} }));
vi.mock('./logging.js', () => ({ logToFile: async () => undefined }));
vi.mock('./cameraTls.js', () => ({ inspectCameraCertificate: vi.fn(), inspectStreamCertificate: state.inspectStream }));

const originalPlatform = process.platform;
const validCamera: CameraWithSecret = { id: 'camera', kind: 'reolink', name: 'Synthetic', host: '192.0.2.1',
  protocol: 'https', httpPort: 443, rtspPort: 554, username: 'synthetic', password: 'synthetic',
  channel: 0, streamChannel: 0, lowLatency: false };
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.appEvents.clear(); state.powerEvents.clear(); state.handlers.clear(); state.windows.length = 0; state.primary = true;
});
afterEach(() => { Object.defineProperty(process, 'platform', { value: originalPlatform }); });

describe('application service lifetime', () => {
  it('does not write diagnostics when the save dialog is cancelled', async () => {
    state.saveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('app:export-diagnostics')).toBe(true));
    const sender = state.windows[0].webContents;
    expect(await state.handlers.get('app:export-diagnostics')!({ sender, senderFrame: sender.mainFrame })).toBe(false);
    expect(state.writeReport).not.toHaveBeenCalled();
  });
  it('saves diagnostics only to the user-selected file and hides filesystem errors', async () => {
    state.saveDialog.mockResolvedValue({ canceled: false, filePath: 'selected-report.json' });
    state.getState.mockResolvedValueOnce({ cameras: [], activeCameraId: null });
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('app:export-diagnostics')).toBe(true));
    const sender = state.windows[0].webContents; const event = { sender, senderFrame: sender.mainFrame };
    expect(await state.handlers.get('app:export-diagnostics')!(event)).toBe(true);
    expect(state.writeReport).toHaveBeenCalledWith('selected-report.json', expect.stringContaining('Settings and main-process runtime only'), { encoding: 'utf8', mode: 0o600 });
    state.writeReport.mockRejectedValueOnce(new Error('EACCES private-directory'));
    await expect(state.handlers.get('app:export-diagnostics')!(event)).rejects.toThrow(/^Could not save the diagnostic report\. Try another folder\.$/);
  });
  it('ignores an old resume that completes after another suspend', async () => {
    let finishMove!: () => void;
    state.getCamera.mockResolvedValue(validCamera);
    state.sendPtz.mockImplementationOnce(() => new Promise((resolve) => { finishMove = resolve; }));
    await import('./main.js');
    await vi.waitFor(() => expect(state.powerEvents.has('resume')).toBe(true));
    const sender = state.windows[0].webContents; const event = { sender, senderFrame: sender.mainFrame };
    const move = state.handlers.get('camera:ptz')!(event, 'camera', { kind: 'move', direction: 'Left', speed: 10 });
    await vi.waitFor(() => expect(state.sendPtz).toHaveBeenCalledOnce());
    state.powerEvents.get('resume')!(); state.powerEvents.get('suspend')!();
    finishMove(); await move;
    await vi.waitFor(() => expect(state.sendPtz.mock.calls.some((call) => call[1].kind === 'stop')).toBe(true));
    expect(sender.send).not.toHaveBeenCalledWith('app:power-state', 'resume');
    expect(() => state.handlers.get('camera:ptz')!(event, 'camera', { kind: 'move', direction: 'Right', speed: 10 })).toThrow('movement is paused');
  });
  it('attempts Stop before resume notification and blocks new movement during sleep', async () => {
    let finishMove!: () => void;
    state.getCamera.mockResolvedValue(validCamera);
    state.sendPtz.mockImplementationOnce(() => new Promise((resolve) => { finishMove = resolve; }));
    await import('./main.js');
    await vi.waitFor(() => expect(state.powerEvents.has('resume')).toBe(true));
    const sender = state.windows[0].webContents; const event = { sender, senderFrame: sender.mainFrame };
    const move = state.handlers.get('camera:ptz')!(event, 'camera', { kind: 'move', direction: 'Left', speed: 10 });
    await vi.waitFor(() => expect(state.sendPtz).toHaveBeenCalledOnce());
    state.powerEvents.get('suspend')!();
    expect(() => state.handlers.get('camera:ptz')!(event, 'camera', { kind: 'move', direction: 'Right', speed: 10 })).toThrow('movement is paused');
    expect(() => state.handlers.get('camera:set-zoom-position')!(event, 'camera', 5)).toThrow('movement is paused');
    state.powerEvents.get('resume')!();
    expect(sender.send).not.toHaveBeenCalledWith('app:power-state', 'resume');
    finishMove(); await move;
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('app:power-state', 'resume'));
    expect(state.sendPtz.mock.calls.slice(1).every((call) => call[1].kind === 'stop')).toBe(true);
  });
  it('drains accepted camera operations before installing and rejects new work during preparation', async () => {
    let finishRead!: () => void;
    state.getCamera.mockResolvedValue(validCamera);
    state.getPresets.mockImplementationOnce(() => new Promise((resolve) => { finishRead = () => resolve([]); }));
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:get-presets')).toBe(true));
    const sender = state.windows[0].webContents; const event = { sender, senderFrame: sender.mainFrame };
    const read = state.handlers.get('camera:get-presets')!(event, 'camera');
    await vi.waitFor(() => expect(state.getPresets).toHaveBeenCalledOnce());
    const install = state.handlers.get('app:quit-and-install-update')!(event);
    expect(() => state.handlers.get('camera:get-presets')!(event, 'camera')).toThrow('update is being prepared');
    expect(state.install).not.toHaveBeenCalled();
    finishRead(); await read; await install;
    expect(state.install).toHaveBeenCalledOnce();
    expect(state.releaseStreams.mock.invocationCallOrder[0]).toBeLessThan(state.install.mock.invocationCallOrder[0]);
    expect(state.releaseSnapshots.mock.invocationCallOrder[0]).toBeLessThan(state.install.mock.invocationCallOrder[0]);
    expect(state.logoutAll.mock.invocationCallOrder[0]).toBeLessThan(state.install.mock.invocationCallOrder[0]);
    expect(state.snapshotStop).not.toHaveBeenCalled(); // Reversible until the actual app quit.
  });
  it('blocks installation when bridge release fails, while leaving IPC usable for retry', async () => {
    state.releaseStreams.mockRejectedValueOnce(new Error('Synthetic child did not exit'));
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('app:quit-and-install-update')).toBe(true));
    const sender = state.windows[0].webContents; const event = { sender, senderFrame: sender.mainFrame };
    await expect(state.handlers.get('app:quit-and-install-update')!(event)).rejects.toThrow('Synthetic child');
    expect(state.install).not.toHaveBeenCalled();
    await expect(state.handlers.get('app:get-state')!(event)).resolves.toEqual({ cameras: [], activeCameraId: null });
    await state.handlers.get('app:quit-and-install-update')!(event);
    expect(state.install).toHaveBeenCalledOnce();
  });
  it('reports a service startup failure once and drains services without exposing raw errors', async () => {
    state.snapshotStart.mockRejectedValueOnce(new Error('synthetic-secret-in-internal-error'));
    await import('./main.js');
    await vi.waitFor(() => expect(state.quit).toHaveBeenCalledTimes(1));
    expect(state.showError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(state.showError.mock.calls)).not.toContain('synthetic-secret');
    expect(state.snapshotStop).toHaveBeenCalledTimes(1);
    expect(state.bridgeStop).toHaveBeenCalledTimes(1);
    expect(state.windows).toHaveLength(0);
    state.appEvents.get('second-instance')!();
    expect(state.windows).toHaveLength(0);
  });
  it('drains services if the application window cannot load', async () => {
    state.loadWindow.mockRejectedValueOnce(new Error('synthetic load failure'));
    await import('./main.js');
    await vi.waitFor(() => expect(state.quit).toHaveBeenCalledTimes(1));
    expect(state.showError).toHaveBeenCalledTimes(1);
    expect(state.snapshotStop).toHaveBeenCalledTimes(1);
    expect(state.bridgeStop).toHaveBeenCalledTimes(1);
  });
  it('still closes safely when the native startup error dialog fails', async () => {
    state.snapshotStart.mockRejectedValueOnce(new Error('synthetic service failure'));
    state.showError.mockImplementationOnce(() => { throw new Error('synthetic dialog failure'); });
    await import('./main.js');
    await vi.waitFor(() => expect(state.quit).toHaveBeenCalledTimes(1));
    expect(state.snapshotStop).toHaveBeenCalledTimes(1);
    expect(state.bridgeStop).toHaveBeenCalledTimes(1);
  });
  it('handles a window load failure when macOS reactivates the app', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    await import('./main.js');
    await vi.waitFor(() => expect(state.appEvents.has('activate')).toBe(true));
    state.windows.length = 0;
    state.loadWindow.mockRejectedValueOnce(new Error('synthetic reactivation failure'));
    state.appEvents.get('activate')!();
    await vi.waitFor(() => expect(state.quit).toHaveBeenCalledTimes(1));
    expect(state.showError).toHaveBeenCalledTimes(1);
    expect(state.snapshotStop).toHaveBeenCalledTimes(1);
  });
  it.each(['panasonic', 'generic'] as const)('never routes %s light/siren calls to the Reolink adapter', async (kind) => {
    state.getCamera.mockResolvedValue({ ...validCamera, kind });
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:play-siren')).toBe(true));
    const sender = state.windows[0].webContents; const event = { sender, senderFrame: sender.mainFrame };
    for (const channel of ['camera:get-ir-lights', 'camera:get-white-led', 'camera:get-siren-config']) {
      await expect(state.handlers.get(channel)!(event, 'camera')).resolves.toBeUndefined();
    }
    await expect(state.handlers.get('camera:play-siren')!(event, 'camera')).rejects.toThrow('does not support');
    await expect(state.handlers.get('camera:set-white-led')!(event, 'camera', { mode: 1 })).rejects.toThrow('does not support');
    expect(state.readLight).not.toHaveBeenCalled(); expect(state.playSiren).not.toHaveBeenCalled(); expect(state.setWhiteLed).not.toHaveBeenCalled();
  });
  it.each([
    ['camera:save', [validCamera, 'camera']], ['camera:remove', ['camera']],
    ['camera:set-stream-channel', ['camera', 1]], ['camera:set-stream-quality', ['camera', true]],
  ])('closes old snapshot streams after %s commits its state', async (channel, args) => {
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has(channel as string)).toBe(true));
    const sender = state.windows[0].webContents; const event = { sender, senderFrame: sender.mainFrame };
    await state.handlers.get(channel as string)!(event, ...(args as unknown[]));
    expect(state.invalidateSnapshot).toHaveBeenCalledWith('camera');
  });
  it('routes absolute zoom through the PTZ queue and returns its final reading', async () => {
    state.getCamera.mockResolvedValue(validCamera); state.getZoomFocus.mockResolvedValue({ zoom: 4 });
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:set-zoom-position')).toBe(true));
    const sender = state.windows[0].webContents; const event = { sender, senderFrame: sender.mainFrame };
    await expect(state.handlers.get('camera:set-zoom-position')!(event, 'camera', 4)).resolves.toEqual({ zoom: 4 });
    expect(state.sendPtz).toHaveBeenCalledWith(validCamera, { kind: 'zoomPosition', position: 4 }, expect.any(Function));
  });
  it('cancels absolute zoom when Stop arrives during a slow camera lookup', async () => {
    let release!: (camera: CameraWithSecret) => void;
    state.getCamera.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue(validCamera);
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:set-zoom-position')).toBe(true));
    const sender = state.windows[0].webContents; const event = { sender, senderFrame: sender.mainFrame };
    const zoom = state.handlers.get('camera:set-zoom-position')!(event, 'camera', 4);
    await vi.waitFor(() => expect(state.getCamera).toHaveBeenCalledOnce());
    const stop = state.handlers.get('camera:ptz')!(event, 'camera', { kind: 'stop' });
    release(validCamera); await Promise.all([zoom, stop]);
    expect(state.sendPtz).toHaveBeenCalledOnce();
    expect(state.sendPtz).toHaveBeenCalledWith(validCamera, { kind: 'stop' }, expect.any(Function));
  });
  it('publishes native fullscreen events and reads the owning window state', async () => {
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('app:get-fullscreen')).toBe(true));
    const window = state.windows[0]; const sender = window.webContents; const event = { sender, senderFrame: sender.mainFrame };
    window.isFullScreen.mockReturnValue(true);
    expect(state.handlers.get('app:get-fullscreen')!(event)).toBe(true);
    state.handlers.get('app:set-fullscreen')!(event, false);
    expect(window.setFullScreen).toHaveBeenCalledWith(false);
    window.emit('enter-full-screen'); window.emit('leave-full-screen');
    expect(sender.send.mock.calls).toContainEqual(['app:fullscreen-changed', true]);
    expect(sender.send.mock.calls).toContainEqual(['app:fullscreen-changed', false]);
  });
  it('releases streams on explicit IPC, renderer crash and window destruction', async () => {
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:release-stream')).toBe(true));
    const window = state.windows[0]; const sender = window.webContents;
    await state.handlers.get('camera:release-stream')!({ sender, senderFrame: sender.mainFrame }, 'camera');
    expect(state.invalidateStream).toHaveBeenCalledWith('camera');
    sender.emit('render-process-gone'); window.emit('closed');
    expect(state.releaseStreams).toHaveBeenCalledTimes(2);
    expect(state.releaseSnapshots).toHaveBeenCalledTimes(2);
  });
  it('reports bridge recovery separately and probes frames only after the stream is restored', async () => {
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('stream:get-health')).toBe(true));
    const sender = state.windows[0].webContents;
    const pageUrl = 'http://127.0.0.1:1984/stream.html?src=fjoscam_camera';
    const executeJavaScript = vi.fn(async () => ({ ready: true, frames: 3, frameAgeMs: 10, ended: false, mediaError: false }));
    sender.mainFrame.framesInSubtree = [{ url: pageUrl, executeJavaScript }];
    const read = () => state.handlers.get('stream:get-health')!({ sender, senderFrame: sender.mainFrame }, pageUrl);
    state.observePlayback.mockReturnValue({ state: 'recovering', generation: 1, attempts: 1 });
    await expect(read()).resolves.toMatchObject({ frames: 0, mediaError: false, bridge: { state: 'recovering' } });
    expect(executeJavaScript).not.toHaveBeenCalled();
    state.observePlayback.mockReturnValue({ state: 'running', generation: 2, attempts: 1 });
    await expect(read()).resolves.toMatchObject({ frames: 3, bridge: { state: 'running', generation: 2 } });
    expect(executeJavaScript).toHaveBeenCalledOnce();
  });
  it('shares concurrent zoom reads and propagates offline errors so polling can back off', async () => {
    state.getCamera.mockResolvedValue(validCamera);
    let reject!: (error: Error) => void;
    state.getZoomFocus.mockImplementationOnce(() => new Promise((_ok, fail) => { reject = fail; })).mockResolvedValue({ zoom: 4 });
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:get-zoom-focus')).toBe(true));
    const sender = state.windows[0].webContents;
    const event = { sender, senderFrame: sender.mainFrame };
    const read = () => state.handlers.get('camera:get-zoom-focus')!(event, 'camera');
    const first = read(), second = read();
    const results = Promise.allSettled([first, second]);
    await vi.waitFor(() => expect(state.getZoomFocus).toHaveBeenCalledOnce());
    reject(new Error('Synthetic offline'));
    expect((await results).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    await expect(read()).resolves.toEqual({ zoom: 4 });
    expect(state.getZoomFocus).toHaveBeenCalledTimes(2);
  });

  it('does not reuse an in-flight zoom read after configuration invalidation', async () => {
    state.getCamera.mockResolvedValue(validCamera);
    let release!: (value: { zoom: number }) => void;
    state.getZoomFocus.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue({ zoom: 8 });
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:get-zoom-focus')).toBe(true));
    const sender = state.windows[0].webContents;
    const event = { sender, senderFrame: sender.mainFrame };
    const read = () => state.handlers.get('camera:get-zoom-focus')!(event, 'camera');
    const old = read();
    await vi.waitFor(() => expect(state.getZoomFocus).toHaveBeenCalledOnce());
    await state.handlers.get('camera:save')!(event, validCamera, 'camera');
    await expect(read()).resolves.toEqual({ zoom: 8 });
    release({ zoom: 1 }); await old;
    expect(state.getZoomFocus).toHaveBeenCalledTimes(2);
  });

  it('serializes spotlight writes across view owners and continues after an earlier failure', async () => {
    state.getCamera.mockResolvedValue(validCamera);
    let reject!: (error: Error) => void;
    state.setWhiteLed.mockImplementationOnce(() => new Promise((_ok, fail) => { reject = fail; })).mockResolvedValue();
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:set-white-led')).toBe(true));
    const sender = state.windows[0].webContents;
    const event = { sender, senderFrame: sender.mainFrame };
    const write = (mode: number) => state.handlers.get('camera:set-white-led')!(event, 'camera', { mode });
    const first = write(1), second = write(0);
    const results = Promise.allSettled([first, second]);
    await vi.waitFor(() => expect(state.setWhiteLed).toHaveBeenCalledOnce());
    reject(new Error('Synthetic failed write'));
    expect((await results).map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
    expect(state.setWhiteLed).toHaveBeenLastCalledWith(validCamera, { mode: 0 });
  });

  it('rejects queued old light settings after saving a camera', async () => {
    state.getCamera.mockResolvedValue(validCamera);
    let release!: () => void;
    state.setWhiteLed.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue();
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:set-white-led')).toBe(true));
    const sender = state.windows[0].webContents;
    const event = { sender, senderFrame: sender.mainFrame };
    const first = state.handlers.get('camera:set-white-led')!(event, 'camera', { mode: 1 });
    const queued = state.handlers.get('camera:set-white-led')!(event, 'camera', { mode: 0 });
    const rejected = expect(queued).rejects.toThrow('settings changed');
    await vi.waitFor(() => expect(state.setWhiteLed).toHaveBeenCalledOnce());
    await state.handlers.get('camera:save')!(event, validCamera, 'camera');
    release(); await first; await rejected;
    expect(state.setWhiteLed).toHaveBeenCalledOnce();
  });

  it('rejects malformed IPC before storage, camera lookup or PTZ side effects', async () => {
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:ptz')).toBe(true));
    const sender = state.windows[0].webContents;
    const event = { sender, senderFrame: sender.mainFrame };
    for (const [channel, args] of [
      ['camera:ptz', ['camera', { kind: 'move', direction: 'exec:synthetic-secret', speed: 10 }]],
      ['camera:save', [{ ...validCamera, password: { secret: 'synthetic-secret' } }, 'camera']],
      ['camera:set-stream-channel', ['camera', Infinity]],
      ['camera:get-device-name', [{ ...validCamera, host: 'user:pass@other.invalid' }]],
      ['camera:set-white-led', ['camera', { brightness: NaN }]],
      ['camera:delete-preset', ['camera', '1']],
    ] as Array<[string, unknown[]]>) {
      expect(() => state.handlers.get(channel)!(event, ...args)).toThrow(/^Invalid IPC arguments\.$/);
    }
    expect(state.getCamera).not.toHaveBeenCalled();
    expect(state.saveCamera).not.toHaveBeenCalled();
    expect(state.setStreamChannel).not.toHaveBeenCalled();
    expect(state.sendPtz).not.toHaveBeenCalled();
    expect(state.getCameraName).not.toHaveBeenCalled();
  });

  it('uses a fixed preview identity and normalized host after validating name-fetch input', async () => {
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:get-device-name')).toBe(true));
    const sender = state.windows[0].webContents;
    await state.handlers.get('camera:get-device-name')!({ sender, senderFrame: sender.mainFrame },
      { ...validCamera, id: 'spoofed', name: '', host: 'https://camera.local/live' });
    expect(state.getCameraName).toHaveBeenCalledWith(expect.objectContaining({ id: 'preview', host: 'camera.local' }));
  });

  it('does not authorize an unowned webContents even at the expected app URL', async () => {
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('app:get-state')).toBe(true));
    const sender = { mainFrame: { url: 'http://127.0.0.1:5173/' } };
    expect(() => state.handlers.get('app:get-state')!({ sender, senderFrame: sender.mainFrame })).toThrow('not allowed');
    expect(state.getState).not.toHaveBeenCalled();
  });

  it.each(['generic', 'panasonic', 'reolink'])('routes the %s camera test without inventing video success', async (kind) => {
    state.getCamera.mockResolvedValue({ id: 'camera', kind } as CameraWithSecret);
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:test')).toBe(true));
    const sender = state.windows[0].webContents;
    const result = await state.handlers.get('camera:test')!({ sender, senderFrame: sender.mainFrame }, 'camera');
    expect(result.scope).toBe(kind === 'generic' ? 'unverified' : kind === 'panasonic' ? 'mjpeg' : 'api');
    expect(state.testReolink).toHaveBeenCalledTimes(kind === 'reolink' ? 1 : 0);
    expect(state.testPanasonic).toHaveBeenCalledTimes(kind === 'panasonic' ? 1 : 0);
    if (kind === 'generic') expect(result.ok).toBe(false);
  });
  it('resolves saved stream inspection in main and returns only certificate metadata', async () => {
    const streamUrl = 'rtsps://test:synthetic-password@192.0.2.1/private-token';
    state.getCamera.mockResolvedValue({ id: 'camera', kind: 'generic', streamUrl } as CameraWithSecret);
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:inspect-stream-certificate')).toBe(true));
    const sender = state.windows[0].webContents;
    const handler = state.handlers.get('camera:inspect-stream-certificate')!;
    const event = { sender, senderFrame: sender.mainFrame };
    const result = await handler(event, '', 'camera');
    expect(state.inspectStream).toHaveBeenCalledWith(streamUrl);
    expect(result).not.toHaveProperty('streamUrl');
    expect(JSON.stringify(result)).not.toMatch(/synthetic-password|private-token/);
    state.getCamera.mockClear(); state.inspectStream.mockClear();
    await handler(event, 'rtsps://other.invalid/new-stream', 'camera');
    expect(state.getCamera).not.toHaveBeenCalled();
    expect(state.inspectStream).toHaveBeenCalledWith('rtsps://other.invalid/new-stream');
  });

  it('rejects missing or non-generic saved targets before certificate inspection', async () => {
    state.getCamera.mockResolvedValue({ id: 'camera', kind: 'reolink' } as CameraWithSecret);
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:inspect-stream-certificate')).toBe(true));
    const sender = state.windows[0].webContents;
    const handler = state.handlers.get('camera:inspect-stream-certificate')!;
    const event = { sender, senderFrame: sender.mainFrame };
    await expect(handler(event, '')).rejects.toThrow('Enter an RTSPS');
    await expect(handler(event, '', 'camera')).rejects.toThrow('no saved generic stream');
    expect(state.inspectStream).not.toHaveBeenCalled();
  });

  it('retains services when the last macOS window closes and reopens on activate', async () => {
    // Simulation only: this is not a packaged Mac smoke test.
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    await import('./main.js');
    await vi.waitFor(() => expect(state.appEvents.has('activate')).toBe(true));
    state.windows.length = 0;
    state.appEvents.get('window-all-closed')!();
    expect(state.snapshotStop).not.toHaveBeenCalled();
    expect(state.bridgeStop).not.toHaveBeenCalled();
    state.appEvents.get('activate')!();
    expect(state.windows).toHaveLength(1);
    expect(state.snapshotStart).toHaveBeenCalledTimes(1);
    const preventDefault = vi.fn();
    state.appEvents.get('before-quit')!({ preventDefault });
    state.appEvents.get('before-quit')!({ preventDefault });
    await vi.waitFor(() => expect(state.snapshotStop).toHaveBeenCalledTimes(1));
    expect(state.bridgeStop).toHaveBeenCalledTimes(1);
  });

  it('rejects iframe and foreign-origin IPC but accepts the app main frame', async () => {
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('app:get-state')).toBe(true));
    const sender = state.windows[0].webContents;
    const handler = state.handlers.get('app:get-state')!;
    await expect(handler({ sender, senderFrame: sender.mainFrame })).resolves.toEqual({ cameras: [], activeCameraId: null });
    expect(() => handler({ sender, senderFrame: { url: 'http://127.0.0.1:1984/stream.html' } })).toThrow('not allowed');
    sender.mainFrame.url = 'https://example.invalid/';
    expect(() => handler({ sender, senderFrame: sender.mainFrame })).toThrow('not allowed');
  });

  it('does not start services in a second app instance', async () => {
    state.primary = false;
    await import('./main.js');
    expect(state.quit).toHaveBeenCalled();
    expect(state.snapshotStart).not.toHaveBeenCalled();
    expect(state.windows).toHaveLength(0);
  });

  it('does not repopulate the cache with old certificate trust when a read finishes after save', async () => {
    const old = { ...validCamera, httpsTrust: { origin: 'https://192.0.2.1', fingerprint256: Array(32).fill('AB').join(':') } };
    const updated = { ...old, httpsTrust: undefined };
    let release!: (value: CameraWithSecret) => void;
    state.getCamera.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue(updated);
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has('camera:get-presets')).toBe(true));
    const sender = state.windows[0].webContents;
    const event = { sender, senderFrame: sender.mainFrame };
    const pending = state.handlers.get('camera:get-presets')!(event, 'camera');
    await state.handlers.get('camera:save')!(event, updated, 'camera');
    release(old);
    await pending;
    expect(state.getPresets).toHaveBeenCalledWith(updated);
    expect(state.getPresets).not.toHaveBeenCalledWith(old);
  });

  it.each(['camera:save', 'camera:remove'])('stops the old camera before %s updates its settings', async (channel) => {
    const old = { ...validCamera, allowInsecureOnvif: true };
    state.getCamera.mockResolvedValue(old);
    let release!: () => void;
    state.sendPtz.mockImplementation(async (_camera, command) => { if (command.kind === 'stop') await new Promise<void>((resolve) => { release = resolve; }); });
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has(channel)).toBe(true));
    const sender = state.windows[0].webContents;
    const event = { sender, senderFrame: sender.mainFrame };
    await state.handlers.get('camera:ptz')!(event, 'camera', { kind: 'move', direction: 'Left', speed: 10 });
    const mutation = channel === 'camera:save'
      ? state.handlers.get(channel)!(event, { ...old, allowInsecureOnvif: false }, 'camera')
      : state.handlers.get(channel)!(event, 'camera');
    await vi.waitFor(() => expect(state.sendPtz).toHaveBeenCalledWith(old, { kind: 'stop' }, expect.any(Function)));
    expect(state.saveCamera).not.toHaveBeenCalled(); expect(state.removeCamera).not.toHaveBeenCalled();
    release(); await mutation;
    expect(state.invalidateStream).toHaveBeenCalledWith('camera');
    expect(channel === 'camera:save' ? state.saveCamera : state.removeCamera).toHaveBeenCalledOnce();
  });

  it.each(['camera:set-stream-channel', 'camera:set-stream-quality'])('invalidates cached and in-flight settings after %s', async (channel) => {
    const old = { id: 'camera', kind: 'reolink', streamChannel: 0, lowLatency: false } as CameraWithSecret;
    const updated = { ...old, streamChannel: 1, lowLatency: true };
    state.getCamera.mockResolvedValue(old);
    await import('./main.js');
    await vi.waitFor(() => expect(state.handlers.has(channel)).toBe(true));
    const sender = state.windows[0].webContents;
    const event = { sender, senderFrame: sender.mainFrame };
    const read = () => state.handlers.get('camera:get-presets')!(event, 'camera');
    const change = () => state.handlers.get(channel)!(event, 'camera', channel.endsWith('channel') ? 1 : true);
    await read(); // Populate the cache before changing the stream setting.
    state.getCamera.mockResolvedValue(updated);
    await change(); await read();
    expect(state.getPresets).toHaveBeenLastCalledWith(updated);
    await change(); // Clear the cache, then deliberately hold the next old read.
    let release!: (value: CameraWithSecret) => void;
    state.getCamera.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const pending = read();
    await change();
    release(old); await pending;
    expect(state.getPresets).toHaveBeenLastCalledWith(updated);
  });
});
