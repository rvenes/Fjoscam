// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  packaged: true, windows: [] as any[], listeners: new Map<string, (value?: any) => void>(),
  check: vi.fn(), download: vi.fn(), install: vi.fn(),
  updater: { autoDownload: true, autoInstallOnAppQuit: true },
}));
vi.mock('electron', () => ({
  app: { get isPackaged() { return fixture.packaged; }, getVersion: () => '1.0.7' },
  BrowserWindow: { getAllWindows: () => fixture.windows },
}));
vi.mock('electron-updater', () => ({ autoUpdater: Object.assign(fixture.updater, {
  on: (name: string, callback: (value?: any) => void) => fixture.listeners.set(name, callback),
  checkForUpdates: fixture.check, downloadUpdate: fixture.download, quitAndInstall: fixture.install,
}) }));
import { AppUpdater } from './updater.js';

beforeEach(() => {
  vi.resetAllMocks(); fixture.packaged = true; fixture.listeners.clear(); fixture.windows = [];
  fixture.check.mockResolvedValue(null); fixture.download.mockResolvedValue([]);
});
function viewer() {
  const send = vi.fn(); fixture.windows.push({ webContents: { isDestroyed: () => false, send } }); return send;
}

describe('explicit updater operations and status', () => {
  it('disables automatic downloads/installs and does nothing until requested', () => {
    new AppUpdater();
    expect(fixture.updater.autoDownload).toBe(false);
    expect(fixture.updater.autoInstallOnAppQuit).toBe(false);
    expect(fixture.check).not.toHaveBeenCalled(); expect(fixture.download).not.toHaveBeenCalled(); expect(fixture.install).not.toHaveBeenCalled();
  });
  it('does not check or download in an unpackaged app', () => {
    fixture.packaged = false; const updater = new AppUpdater();
    expect(updater.checkForUpdates().state).toBe('error'); expect(updater.downloadUpdate().state).toBe('error');
    expect(fixture.check).not.toHaveBeenCalled(); expect(fixture.download).not.toHaveBeenCalled();
  });
  it('reports availability, progress and completion without starting an installation', async () => {
    const send = viewer(); const updater = new AppUpdater();
    expect(updater.checkForUpdates().state).toBe('checking');
    fixture.listeners.get('update-available')!({ version: '1.0.8', releaseName: 'Synthetic release' });
    expect(send).toHaveBeenLastCalledWith('app:update-status', expect.objectContaining({ state: 'available', version: '1.0.8' }));
    expect(updater.downloadUpdate()).toMatchObject({ state: 'downloading', version: '1.0.8' });
    fixture.listeners.get('download-progress')!({ percent: 50, transferred: 10, total: 20 });
    expect(send).toHaveBeenLastCalledWith('app:update-status', expect.objectContaining({ state: 'downloading', percent: 50, transferred: 10, total: 20 }));
    fixture.listeners.get('update-downloaded')!({ version: '1.0.8' });
    expect(send).toHaveBeenLastCalledWith('app:update-status', { state: 'downloaded', currentVersion: '1.0.7', version: '1.0.8' });
    expect(fixture.install).not.toHaveBeenCalled();
    await updater.quitAndInstall(); expect(fixture.install).toHaveBeenCalledExactlyOnceWith(false, true);
  });
  it('requires a downloaded update before attempting preparation', async () => {
    const prepare = vi.fn(); const updater = new AppUpdater(prepare);
    await expect(updater.quitAndInstall()).rejects.toThrow('No downloaded update');
    expect(prepare).not.toHaveBeenCalled(); expect(fixture.install).not.toHaveBeenCalled();
  });
  it('waits for preparation and shares overlapping installation requests', async () => {
    let finish!: () => void;
    const barrier = new Promise<void>((resolve) => { finish = resolve; });
    const prepare = vi.fn(async (launch: () => void) => { await barrier; launch(); });
    const updater = new AppUpdater(prepare);
    fixture.listeners.get('update-downloaded')!({ version: '1.0.8' });
    const first = updater.quitAndInstall(); const second = updater.quitAndInstall();
    expect(first).toBe(second);
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    expect(fixture.install).not.toHaveBeenCalled();
    finish(); await first;
    await updater.quitAndInstall(); expect(fixture.install).toHaveBeenCalledOnce();
  });
  it('does not install after failed preparation and permits a later explicit retry', async () => {
    const prepare = vi.fn(async (launch: () => void) => { launch(); }).mockRejectedValueOnce(new Error('synthetic failed drain'));
    const updater = new AppUpdater(prepare);
    fixture.listeners.get('update-downloaded')!({ version: '1.0.8' });
    await expect(updater.quitAndInstall()).rejects.toThrow('Could not prepare');
    expect(fixture.install).not.toHaveBeenCalled();
    await updater.quitAndInstall(); expect(fixture.install).toHaveBeenCalledOnce();
  });
  it('permits retry when the installer reports an error event without throwing', async () => {
    const updater = new AppUpdater();
    fixture.listeners.get('update-downloaded')!({ version: '1.0.8' });
    fixture.install.mockImplementationOnce(() => fixture.listeners.get('error')!(new Error('synthetic install failure')));
    await updater.quitAndInstall();
    await updater.quitAndInstall();
    expect(fixture.install).toHaveBeenCalledTimes(2);
  });
  it.each(['check', 'download'] as const)('contains rejected %s errors without forwarding raw response data', async (operation) => {
    fixture[operation].mockRejectedValueOnce(new Error('synthetic-unlabelled-secret rtsp://user:password@host/path'));
    const send = viewer(); const updater = new AppUpdater();
    if (operation === 'check') updater.checkForUpdates(); else updater.downloadUpdate();
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('app:update-status', expect.objectContaining({ state: 'error' })));
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/synthetic-|password|rtsp:/);
  });
  it('contains synchronous updater failures', () => {
    fixture.check.mockImplementationOnce(() => { throw new Error('synthetic'); });
    expect(new AppUpdater().checkForUpdates().state).toBe('error');
  });
  it('keeps delivering events when another window is closing', () => {
    const closedSend = vi.fn();
    fixture.windows.push({ webContents: { isDestroyed: () => true, send: closedSend } },
      { webContents: { isDestroyed: () => false, send: () => { throw new Error('Synthetic closed frame'); } } });
    const send = viewer(); new AppUpdater();
    expect(() => fixture.listeners.get('error')!(new Error('synthetic-secret'))).not.toThrow();
    expect(closedSend).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('app:update-status', expect.objectContaining({ state: 'error' }));
  });
  it('bounds malformed progress values before IPC', () => {
    const send = viewer(); new AppUpdater();
    fixture.listeners.get('download-progress')!({ percent: 150, transferred: NaN, total: -1 });
    expect(send).toHaveBeenLastCalledWith('app:update-status', expect.objectContaining({ percent: 100, transferred: undefined, total: undefined }));
  });
});
