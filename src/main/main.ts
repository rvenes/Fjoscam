import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CameraStore } from './store.js';
import { ReolinkClient } from './reolinkClient.js';
import { SnapshotServer } from './snapshotServer.js';
import { Go2RtcBridge } from './go2rtcBridge.js';
import { AppUpdater } from './updater.js';
import { discoverCameras } from './discovery.js';
import { PanasonicClient } from './panasonicClient.js';
import type { CameraInput, CameraWithSecret, PtzCommand } from '../shared/types.js';

const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const store = new CameraStore();
const reolink = new ReolinkClient();
const snapshots = new SnapshotServer(store, reolink);
const go2rtc = new Go2RtcBridge(store);
const updater = new AppUpdater();
const panasonic = new PanasonicClient();
const cameraCache = new Map<string, CameraWithSecret>();
let isShuttingDown = false;

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
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      webviewTag: true,
    },
  });

  window.webContents.on('console-message', (event) => {
    const details = event as unknown as { level?: string | number; message?: string };
    void appendFile(
      join(app.getPath('userData'), 'renderer.log'),
      `${new Date().toISOString()} [${details.level ?? 'info'}] ${details.message ?? ''}\n`,
      'utf8',
    ).catch(() => undefined);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) await window.loadURL('http://127.0.0.1:5173');
  else await window.loadFile(join(__dirname, '../../dist/index.html'));
}

app.whenReady().then(async () => {
  await snapshots.start();
  registerIpc();
  createMenu();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

function createMenu(): void {
  const openRendererPanel = (panel: 'settings' | 'tips'): void => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    window?.webContents.send('app:open-panel', panel);
  };
  const setCameraEditMode = (enabled: boolean): void => {
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
        { label: 'Edit Camera List', click: () => setCameraEditMode(true) },
        { label: 'Exit Camera Edit Mode', click: () => setCameraEditMode(false) },
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
        { label: 'Check for updates', click: () => updater.checkForUpdates() },
        { type: 'separator' },
        { label: 'Tips', accelerator: 'F1', click: () => openRendererPanel('tips') },
        { label: 'About Fjoscam', click: openAbout },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('before-quit', (event) => {
  if (isShuttingDown) return;
  event.preventDefault();
  void shutdown().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  void shutdown().finally(() => {
    if (process.platform !== 'darwin') app.quit();
  });
});

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  go2rtc.stop();
  await Promise.allSettled([snapshots.stop(), reolink.logoutAll()]);
}

function registerIpc(): void {
  ipcMain.handle('app:get-state', () => store.getState());
  ipcMain.handle('app:get-version', () => updater.getVersion());
  ipcMain.handle('app:check-for-updates', () => updater.checkForUpdates());
  ipcMain.handle('app:download-update', () => updater.downloadUpdate());
  ipcMain.handle('app:quit-and-install-update', () => updater.quitAndInstall());
  ipcMain.handle('app:set-fullscreen', (event, enabled: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setFullScreen(enabled);
  });

  ipcMain.handle('camera:save', async (_event, input: CameraInput, id?: string) => {
    if (id) cameraCache.delete(id);
    const state = await store.saveCamera(input, id);
    return state;
  });
  ipcMain.handle('camera:remove', async (_event, id: string) => {
    cameraCache.delete(id);
    return store.removeCamera(id);
  });
  ipcMain.handle('camera:reorder', (_event, ids: string[]) => store.reorderCameras(ids));
  ipcMain.handle('camera:set-active', async (_event, id: string) => {
    const state = await store.setActiveCamera(id);
    void reolink.logoutExcept(id);
    return state;
  });
  ipcMain.handle('camera:set-stream-channel', (_event, id: string, channel: number) => store.setStreamChannel(id, channel));
  ipcMain.handle('camera:set-stream-quality', (_event, id: string, lowLatency: boolean) => store.setStreamQuality(id, lowLatency));
  ipcMain.handle('camera:discover', () => discoverCameras());

  ipcMain.handle('camera:test', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (camera.kind === 'generic') return { ok: true, message: 'Generic stream saved' };
    return reolink.testConnection(camera);
  });

  ipcMain.handle('camera:get-presets', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (camera.kind === 'generic') return [];
    if (camera.kind === 'panasonic') return panasonic.getPresets();
    return reolink.getPresets(camera).catch(() => []);
  });

  ipcMain.handle('camera:get-stream-info', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (camera.kind === 'generic') return {};
    if (camera.kind === 'panasonic') return {};
    return reolink.getStreamInfo(camera).catch(() => ({}));
  });

  ipcMain.handle('camera:get-profile', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (camera.kind === 'generic') return undefined;
    if (camera.kind === 'panasonic') return undefined;
    return reolink.getProfile(camera).catch(() => undefined);
  });

  ipcMain.handle('camera:get-ir-lights', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (camera.kind === 'generic') return undefined;
    return reolink.getIrLights(camera).catch(() => undefined);
  });

  ipcMain.handle('camera:set-ir-lights', async (_event, id: string, mode: 'auto' | 'on' | 'off') => {
    const camera = await getCachedCamera(id);
    await reolink.setIrLights(camera, mode);
  });

  ipcMain.handle('camera:get-white-led', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (camera.kind === 'generic') return undefined;
    return reolink.getWhiteLed(camera).catch(() => undefined);
  });

  ipcMain.handle('camera:set-white-led', async (_event, id: string, enabled: boolean, brightness?: number) => {
    const camera = await getCachedCamera(id);
    await reolink.setWhiteLed(camera, enabled, brightness);
  });

  ipcMain.handle('camera:get-siren-config', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    if (camera.kind === 'generic') return undefined;
    return reolink.getSirenConfig(camera).catch(() => undefined);
  });

  ipcMain.handle('camera:play-siren', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    await reolink.playSiren(camera);
  });

  ipcMain.handle('camera:get-device-name', async (_event, input: CameraInput) =>
    reolink.getCameraName({ id: 'preview', ...input }),
  );

  ipcMain.handle('camera:ptz', async (_event, id: string, command: PtzCommand) => {
    const camera = await getCachedCamera(id);
    if (camera.kind === 'generic') return;
    if (camera.kind === 'panasonic') {
      await panasonic.sendPtz(camera, command);
      return;
    }
    await reolink.sendPtz(camera, command);
  });

  ipcMain.handle('camera:get-snapshot-url', (_event, id: string) => snapshots.getSnapshotUrl(id));
  ipcMain.handle('camera:get-mjpeg-url', (_event, id: string) => snapshots.getMjpegUrl(id));
  ipcMain.handle('camera:get-webrtc-stream', (_event, id: string) => go2rtc.getStream(id));
}

async function getCachedCamera(id: string): Promise<CameraWithSecret> {
  const cached = cameraCache.get(id);
  if (cached) return cached;
  const camera = await store.getCameraWithSecret(id);
  cameraCache.set(id, camera);
  return camera;
}
