import { app, BrowserWindow, Menu, dialog, ipcMain, powerMonitor, session, shell } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { logToFile } from './logging.js';
import { CameraStore } from './store.js';
import { ReolinkClient } from './reolinkClient.js';
import { SnapshotServer } from './snapshotServer.js';
import { Go2RtcBridge } from './go2rtcBridge.js';
import { AppUpdater } from './updater.js';
import { discoverCameras } from './discovery.js';
import { PanasonicClient } from './panasonicClient.js';
import { PtzController } from './ptzController.js';
import { installPlaybackAccess } from './playbackAccess.js';
import { isPlayerUrl, readPlayerHealth, setPlayerAudio } from './playerHealth.js';
import { inspectCameraCertificate, inspectStreamCertificate } from './cameraTls.js';
import { validateIpcArguments } from './ipcValidation.js';
import { normalizeHost } from '../shared/validation.js';
import { isReolinkCamera } from '../shared/cameraControls.js';
import { diagnosticReport } from './diagnosticReport.js';
import type { CameraInput, CameraWithSecret, HttpsTarget, PtzCommand } from '../shared/types.js';

const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const store = new CameraStore();
const reolink = new ReolinkClient();
const snapshots = new SnapshotServer(store, reolink);
const go2rtc = new Go2RtcBridge(store);
const updater = new AppUpdater(withUpdateInstallation);
const panasonic = new PanasonicClient();
const cameraCache = new Map<string, CameraWithSecret>();
const cameraReads = new Map<string, Promise<unknown>>();
const cameraWrites = new Map<string, Promise<void>>();
let cameraCacheRevision = 0;
const ptz = new PtzController(async (id, command, current) => {
  const camera = await getCachedCamera(id);
  if (!current() || camera.kind === 'generic') return;
  if (command.kind === 'zoomPosition' && camera.kind === 'panasonic') return;
  if (camera.kind === 'panasonic') await panasonic.sendPtz(camera, command);
  else await reolink.sendPtz(camera, command, current);
});
const allowedExternalHosts = new Set(['github.com', 'www.github.com', 'paypal.com', 'www.paypal.com', 'venes.org', 'www.venes.org']);
let isShuttingDown = false;
let shutdownPromise: Promise<void> | null = null;
let shutdownComplete = false;
let startupFailed = false;
let isPreparingUpdate = false;
let systemSuspended = false;
let powerRevision = 0;
const cameraOperations = new Set<Promise<unknown>>();
let cameraEditMode = false;
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) app.quit();
app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  } else if (!isShuttingDown && app.isReady()) {
    void createWindow().catch(handleStartupFailure);
  }
});

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    title: 'Fjoscam',
    backgroundColor: '#111313',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  window.webContents.on('console-message', (event) => {
    const details = event as unknown as { level?: string | number; message?: string };
    void logToFile('renderer.log', `[${details.level ?? 'info'}] ${details.message ?? ''}`);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.on('blur', () => { void ptz.stopAll(); });
  window.on('enter-full-screen', () => window.webContents.send('app:fullscreen-changed', true));
  window.on('leave-full-screen', () => window.webContents.send('app:fullscreen-changed', false));
  window.on('close', () => { void ptz.stopAll(); });
  window.on('closed', () => {
    snapshots.releaseAll();
    void go2rtc.releaseAll().catch(() => logToFile('go2rtc-bridge.log', 'Could not release closed viewer streams.'));
  });
  window.webContents.on('render-process-gone', () => {
    void ptz.stopAll();
    snapshots.releaseAll();
    void go2rtc.releaseAll().catch(() => logToFile('go2rtc-bridge.log', 'Could not release crashed viewer streams.'));
  });
  window.webContents.on('will-navigate', (event) => { event.preventDefault(); void ptz.stopAll(); });

  if (isDev) await window.loadURL('http://127.0.0.1:5173');
  else await window.loadFile(join(__dirname, '../../dist-renderer/index.html'));
}

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return;
  await snapshots.start();
  installPlaybackAccess(session.defaultSession, go2rtc, snapshots,
    (id) => BrowserWindow.getAllWindows().some((window) => window.webContents.id === id), () => isShuttingDown || isPreparingUpdate);
  registerIpc();
  createMenu();
  await createWindow();

  powerMonitor.on('suspend', () => {
    if (isShuttingDown || isPreparingUpdate) return;
    systemSuspended = true;
    powerRevision += 1;
    void ptz.stopAll();
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('app:power-state', 'suspend');
  });
  powerMonitor.on('resume', () => {
    if (isShuttingDown || isPreparingUpdate) return;
    const revision = ++powerRevision;
    systemSuspended = true;
    // Stop old held movement before reopening playback. Never replay movement.
    void ptz.stopAll().then(() => {
      if (revision !== powerRevision) return;
      systemSuspended = false;
      if (isShuttingDown || isPreparingUpdate) return;
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('app:power-state', 'resume');
    });
  });

  app.on('activate', () => {
    if (!isShuttingDown && BrowserWindow.getAllWindows().length === 0) void createWindow().catch(handleStartupFailure);
  });
}).catch(handleStartupFailure);

async function handleStartupFailure(): Promise<void> {
  if (startupFailed || isShuttingDown) return;
  startupFailed = true;
  isShuttingDown = true;
  void logToFile('main.log', 'Application service or window startup failed.');
  try {
    dialog.showErrorBox('Fjoscam could not start',
      'The local video service or application window could not be opened. Fjoscam will close. Try restarting the app. If the problem continues, check the installation and local security software.');
  } catch {
    void logToFile('main.log', 'Could not display the startup error dialog.');
  } finally {
    await shutdown().catch(() => undefined);
    shutdownComplete = true;
    app.quit();
  }
}

function createMenu(): void {
  const openRendererPanel = (panel: 'settings' | 'tips'): void => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    window?.webContents.send('app:open-panel', panel);
  };
  const setCameraEditMode = (enabled: boolean): void => {
    cameraEditMode = enabled;
    createMenu();
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    window?.webContents.send('app:camera-edit-mode', enabled);
  };
  const openAbout = (): void => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    window?.webContents.send('app:open-about', updater.getVersion());
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => openRendererPanel('settings') },
        { type: 'separator' },
        {
          label: cameraEditMode ? 'Exit camera edit mode' : 'Edit camera mode',
          click: () => setCameraEditMode(!cameraEditMode),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Check for updates', click: () => { if (!isPreparingUpdate) updater.checkForUpdates(); } },
        { type: 'separator' },
        { label: 'Tips', accelerator: 'F1', click: () => openRendererPanel('tips') },
        { label: 'About Fjoscam', click: openAbout },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('before-quit', (event) => {
  if (!isPrimaryInstance || shutdownComplete) return;
  event.preventDefault();
  void shutdown().finally(() => { shutdownComplete = true; app.quit(); });
});

app.on('window-all-closed', () => {
  // macOS keeps the app alive: its services must remain usable on activate.
  if (process.platform !== 'darwin') app.quit();
});

function shutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  isShuttingDown = true;
  shutdownPromise = (async () => {
    await ptz.shutdown();
    await Promise.allSettled([go2rtc.stop(), snapshots.stop(), reolink.logoutAll()]);
  })();
  return shutdownPromise;
}

async function withUpdateInstallation(launch: () => void): Promise<void> {
  if (isPreparingUpdate || isShuttingDown) throw new Error('Application is already closing or preparing an update.');
  isPreparingUpdate = true;
  try {
    // Stop now to invalidate queued movement, then let already accepted camera
    // and store operations finish before releasing the resources they may open.
    await ptz.stopAll();
    await Promise.allSettled([...cameraOperations]);
    await ptz.stopAll();
    snapshots.releaseAll();
    await go2rtc.releaseAll(); // A child that refuses to exit blocks installation.
    await reolink.logoutAll();
    if (isShuttingDown) throw new Error('Application is shutting down.');
    launch();
  } finally { isPreparingUpdate = false; }
}

function handleIpc(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, (event, ...args) => {
    const expected = isDev ? 'http://127.0.0.1:5173/' : pathToFileURL(join(__dirname, '../../dist-renderer/index.html')).href;
    const frame = event.senderFrame;
    if (isShuttingDown || !BrowserWindow.getAllWindows().some((window) => window.webContents === event.sender) ||
        !frame || frame !== event.sender.mainFrame || frame.url.split('#')[0] !== expected) {
      throw new Error('IPC request is not allowed from this frame.');
    }
    validateIpcArguments(channel, args);
    if (isPreparingUpdate && channel !== 'app:quit-and-install-update') throw new Error('An update is being prepared. Try again when it finishes.');
    if (systemSuspended && (channel === 'camera:set-zoom-position' ||
        (channel === 'camera:ptz' && (args[1] as PtzCommand).kind !== 'stop'))) throw new Error('Camera movement is paused while the computer resumes.');
    const result = listener(event, ...args);
    if ((channel.startsWith('camera:') || channel === 'app:get-state') && result && typeof result.then === 'function') {
      const operation = Promise.resolve(result);
      cameraOperations.add(operation);
      const complete = () => { cameraOperations.delete(operation); };
      void operation.then(complete, complete);
      return operation;
    }
    return result;
  });
}

function registerIpc(): void {
  handleIpc('app:get-state', () => store.getState());
  handleIpc('app:get-version', () => updater.getVersion());
  handleIpc('app:export-diagnostics', async () => {
    const result = await dialog.showSaveDialog({ title: 'Save Fjoscam diagnostic report',
      defaultPath: `Fjoscam-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON diagnostic report', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    const state = await store.getState();
    const report = diagnosticReport(state, { version: app.getVersion(), platform: process.platform, arch: process.arch,
      electron: process.versions.electron, node: process.versions.node, uptimeSeconds: Math.floor(process.uptime()),
      mainMemoryBytes: process.memoryUsage().rss });
    try { await writeFile(result.filePath, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 }); }
    catch { throw new Error('Could not save the diagnostic report. Try another folder.'); }
    return true;
  });
  handleIpc('app:check-for-updates', () => updater.checkForUpdates());
  handleIpc('app:download-update', () => updater.downloadUpdate());
  handleIpc('app:quit-and-install-update', () => updater.quitAndInstall());
  handleIpc('app:get-fullscreen', (event) => BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false);
  handleIpc('app:set-fullscreen', (event, enabled: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setFullScreen(enabled);
  });

  handleIpc('camera:save', async (_event, input: CameraInput, id?: string) => {
    const save = async () => {
      invalidateCameraCache();
      try {
        const state = await store.saveCamera(input, id);
        if (id) snapshots.invalidateCamera(id);
        if (id) reolink.updateCameraConfiguration(id, state.cameras.find((camera) => camera.id === id));
        if (id) await go2rtc.invalidateCamera(id);
        return state;
      }
      finally { invalidateCameraCache(); }
    };
    return id ? ptz.withCameraPaused(id, save) : save();
  });
  handleIpc('camera:remove', async (_event, id: string) => {
    return ptz.withCameraPaused(id, async () => {
      invalidateCameraCache();
      try {
        const state = await store.removeCamera(id);
        snapshots.invalidateCamera(id);
        reolink.updateCameraConfiguration(id);
        await go2rtc.invalidateCamera(id);
        return state;
      }
      finally { invalidateCameraCache(); }
    });
  });
  handleIpc('camera:reorder', (_event, ids: string[]) => store.reorderCameras(ids));
  handleIpc('camera:set-active', async (_event, id: string) => {
    await ptz.stopAll();
    const state = await store.setActiveCamera(id);
    void reolink.logoutExcept(id);
    return state;
  });
  handleIpc('camera:set-stream-channel', async (_event, id: string, channel: number) => {
    try { const state = await store.setStreamChannel(id, channel); snapshots.invalidateCamera(id); await go2rtc.invalidateCamera(id); return state; }
    finally { invalidateCameraCache(); }
  });
  handleIpc('camera:set-stream-quality', async (_event, id: string, lowLatency: boolean) => {
    try { const state = await store.setStreamQuality(id, lowLatency); snapshots.invalidateCamera(id); await go2rtc.invalidateCamera(id); return state; }
    finally { invalidateCameraCache(); }
  });
  handleIpc('camera:discover', () => discoverCameras());
  handleIpc('camera:inspect-certificate', (_event, target: HttpsTarget) => inspectCameraCertificate(target));
  handleIpc('camera:inspect-stream-certificate', async (_event, streamUrl: string, id?: string) => {
    if (typeof streamUrl !== 'string') throw new Error('Invalid stream address.');
    if (streamUrl.trim()) return inspectStreamCertificate(streamUrl);
    if (!id || typeof id !== 'string') throw new Error('Enter an RTSPS stream address first.');
    const camera = await store.getCameraWithSecret(id);
    if (camera.kind !== 'generic' || !camera.streamUrl) throw new Error('This camera has no saved generic stream.');
    return inspectStreamCertificate(camera.streamUrl);
  });

  handleIpc('camera:test', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (camera.kind === 'generic') return { ok: false, scope: 'unverified', message: 'No camera API for generic streams. Check the video status instead.' };
    if (camera.kind === 'panasonic') return snapshots.testPanasonic(camera);
    return reolink.testConnection(camera);
  });

  handleIpc('camera:get-presets', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (camera.kind === 'generic') return [];
    if (camera.kind === 'panasonic') return panasonic.getPresets();
    return reolink.getPresets(camera).catch(() => []);
  });

  handleIpc('camera:get-stream-info', async (_event, id: string) => {
    return shareCameraRead(id, 'stream-info', async () => {
      const camera = await getCachedCamera(id);
      if (!isReolinkCamera(camera)) return {};
      return reolink.getStreamInfo(camera).catch(() => ({}));
    });
  });

  handleIpc('camera:get-profile', async (_event, id: string) => {
    return shareCameraRead(id, 'profile', async () => {
      const camera = await getCachedCamera(id);
      if (!isReolinkCamera(camera)) return undefined;
      return reolink.getProfile(camera).catch(() => undefined);
    });
  });

  handleIpc('camera:get-ir-lights', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (!isReolinkCamera(camera)) return undefined;
    return reolink.getIrLights(camera).catch(() => undefined);
  });

  handleIpc('camera:set-ir-lights', async (_event, id: string, mode: 'auto' | 'on' | 'off') => {
    await serializeCameraWrite(id, 'ir', (camera) => reolink.setIrLights(camera, mode));
  });

  handleIpc('camera:get-white-led', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (!isReolinkCamera(camera)) return undefined;
    return reolink.getWhiteLed(camera).catch(() => undefined);
  });

  handleIpc('camera:set-white-led', async (_event, id: string, options: { mode?: number; enabled?: boolean; brightness?: number }) => {
    await serializeCameraWrite(id, 'white-led', (camera) => reolink.setWhiteLed(camera, options));
  });

  handleIpc('camera:get-siren-config', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (!isReolinkCamera(camera)) return undefined;
    return reolink.getSirenConfig(camera).catch(() => undefined);
  });

  handleIpc('camera:play-siren', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (!isReolinkCamera(camera)) throw new Error('This camera does not support Reolink siren controls.');
    await reolink.playSiren(camera);
  });

  handleIpc('camera:get-device-name', async (_event, input: CameraInput) =>
    reolink.getCameraName({ ...input, host: normalizeHost(input.host), id: 'preview' }),
  );

  handleIpc('camera:ptz', (_event, id: string, command: PtzCommand) => ptz.send(id, command));

  handleIpc('camera:get-zoom-focus', async (_event, id: string) => {
    return shareCameraRead(id, 'zoom', async () => {
      const camera = await getCachedCamera(id);
      if (!isReolinkCamera(camera)) return {};
      return reolink.getZoomFocus(camera);
    });
  });

  handleIpc('camera:set-zoom-position', async (_event, id: string, position: number) => {
    // Enqueue before any asynchronous camera lookup, so an immediate Stop or
    // settings change can invalidate this request while that lookup is pending.
    await ptz.send(id, { kind: 'zoomPosition', position });
    const camera = await getCachedCamera(id);
    if (!isReolinkCamera(camera)) return {};
    return reolink.getZoomFocus(camera);
  });

  handleIpc('camera:save-preset', async (_event, id: string, presetId: number, name: string) => {
    const camera = await getCachedCamera(id);
    if (!isReolinkCamera(camera)) return [];
    return reolink.savePreset(camera, presetId, name);
  });

  handleIpc('camera:delete-preset', async (_event, id: string, presetId: number) => {
    const camera = await getCachedCamera(id);
    if (!isReolinkCamera(camera)) return [];
    return reolink.deletePreset(camera, presetId);
  });

  handleIpc('camera:get-snapshot-url', (_event, id: string) => snapshots.getSnapshotUrl(id));
  handleIpc('camera:get-mjpeg-url', (_event, id: string) => snapshots.getMjpegUrl(id));
  handleIpc('camera:get-webrtc-stream', (_event, id: string) => go2rtc.getStream(id));
  handleIpc('camera:release-stream', (_event, id: string) => go2rtc.invalidateCamera(id));
  handleIpc('stream:get-health', async (event, pageUrl: string) => {
    if (typeof pageUrl !== 'string' || pageUrl.length > 4096) throw new Error('Invalid playback target.');
    if (isPlayerUrl(pageUrl)) {
      const bridge = go2rtc.observePlayback(pageUrl);
      if (bridge.state !== 'running') return { source: 'player', ready: false, frames: 0, frameAgeMs: null, ended: false, mediaError: false, bridge };
      return { ...await readPlayerHealth(event.sender, pageUrl), bridge };
    }
    return snapshots.getPlaybackHealth(pageUrl);
  });
  handleIpc('stream:set-audio', async (event, muted: boolean, volume: number) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    await setPlayerAudio(window.webContents, muted, volume);
  });
}

async function getCachedCamera(id: string): Promise<CameraWithSecret> {
  const cached = cameraCache.get(id);
  if (cached) return cached;
  const revision = cameraCacheRevision;
  const camera = await store.getCameraWithSecret(id);
  if (revision !== cameraCacheRevision) return getCachedCamera(id);
  cameraCache.set(id, camera);
  return camera;
}

function invalidateCameraCache(): void {
  cameraCacheRevision += 1;
  cameraCache.clear();
  cameraReads.clear();
}

function shareCameraRead<T>(id: string, operation: string, read: () => Promise<T>): Promise<T> {
  const key = JSON.stringify([cameraCacheRevision, id, operation]);
  const existing = cameraReads.get(key);
  if (existing) return existing as Promise<T>;
  const pending = read().finally(() => { if (cameraReads.get(key) === pending) cameraReads.delete(key); });
  cameraReads.set(key, pending);
  return pending;
}

function serializeCameraWrite(id: string, operation: string, write: (camera: CameraWithSecret) => Promise<void>): Promise<void> {
  const key = JSON.stringify([id, operation]);
  const revision = cameraCacheRevision;
  const previous = cameraWrites.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(async () => {
    if (isShuttingDown) throw new Error('Camera controls are shutting down.');
    const camera = await getCachedCamera(id);
    if (isShuttingDown || revision !== cameraCacheRevision) throw new Error('Camera settings changed. Retry the light setting.');
    if (!isReolinkCamera(camera)) throw new Error('This camera does not support Reolink light controls.');
    await write(camera);
  }).finally(() => { if (cameraWrites.get(key) === pending) cameraWrites.delete(key); });
  cameraWrites.set(key, pending);
  return pending;
}

function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && allowedExternalHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
