import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CameraStore } from './store.js';
import { ReolinkClient } from './reolinkClient.js';
import { SnapshotServer } from './snapshotServer.js';
import { Go2RtcBridge } from './go2rtcBridge.js';
import type { CameraInput, CameraWithSecret, PtzCommand } from '../shared/types.js';

const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const store = new CameraStore();
const reolink = new ReolinkClient();
const snapshots = new SnapshotServer(store, reolink);
const go2rtc = new Go2RtcBridge(store);
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
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

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

  ipcMain.handle('camera:save', async (_event, input: CameraInput, id?: string) => {
    if (id) cameraCache.delete(id);
    const state = await store.saveCamera(input, id);
    return state;
  });
  ipcMain.handle('camera:remove', async (_event, id: string) => {
    cameraCache.delete(id);
    return store.removeCamera(id);
  });
  ipcMain.handle('camera:set-active', (_event, id: string) => store.setActiveCamera(id));
  ipcMain.handle('camera:set-stream-channel', (_event, id: string, channel: number) => store.setStreamChannel(id, channel));
  ipcMain.handle('camera:set-stream-quality', (_event, id: string, lowLatency: boolean) => store.setStreamQuality(id, lowLatency));

  ipcMain.handle('camera:test', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    return reolink.testConnection(camera);
  });

  ipcMain.handle('camera:get-presets', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    return reolink.getPresets(camera).catch(() => []);
  });

  ipcMain.handle('camera:get-stream-info', async (_event, id: string) => {
    const camera = await getCachedCamera(id);
    return reolink.getStreamInfo(camera).catch(() => ({}));
  });

  ipcMain.handle('camera:get-device-name', async (_event, input: CameraInput) =>
    reolink.getCameraName({ id: 'preview', ...input }),
  );

  ipcMain.handle('camera:ptz', async (_event, id: string, command: PtzCommand) => {
    const camera = await getCachedCamera(id);
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
