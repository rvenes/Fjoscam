import { BrowserWindow, app } from 'electron';
import { autoUpdater, type ProgressInfo } from 'electron-updater';
import type { UpdateStatus } from '../shared/types.js';

export class AppUpdater {
  private lastAvailableVersion: string | undefined;

  constructor() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => this.broadcast({ state: 'checking', currentVersion: app.getVersion() }));
    autoUpdater.on('update-available', (info) => {
      this.lastAvailableVersion = info.version;
      this.broadcast({
        state: 'available',
        currentVersion: app.getVersion(),
        version: info.version,
        releaseDate: info.releaseDate,
        releaseName: info.releaseName ?? undefined,
      });
    });
    autoUpdater.on('update-not-available', () => this.broadcast({ state: 'not-available', currentVersion: app.getVersion() }));
    autoUpdater.on('download-progress', (progress) => this.broadcast(downloadStatus(progress, this.lastAvailableVersion)));
    autoUpdater.on('update-downloaded', (info) => {
      this.lastAvailableVersion = info.version;
      this.broadcast({ state: 'downloaded', currentVersion: app.getVersion(), version: info.version });
    });
    autoUpdater.on('error', (error) =>
      this.broadcast({ state: 'error', currentVersion: app.getVersion(), message: error.message || 'Update check failed.' }),
    );
  }

  getVersion(): string {
    return app.getVersion();
  }

  checkForUpdates(): UpdateStatus {
    if (!app.isPackaged) {
      return { state: 'error', currentVersion: app.getVersion(), message: 'Auto-update can only be tested from a packaged app.' };
    }
    void autoUpdater.checkForUpdates().catch((error: Error) => {
      this.broadcast({ state: 'error', currentVersion: app.getVersion(), message: error.message });
    });
    return { state: 'checking', currentVersion: app.getVersion() };
  }

  downloadUpdate(): UpdateStatus {
    if (!app.isPackaged) {
      return { state: 'error', currentVersion: app.getVersion(), message: 'Auto-update can only be tested from a packaged app.' };
    }
    void autoUpdater.downloadUpdate().catch((error: Error) => {
      this.broadcast({ state: 'error', currentVersion: app.getVersion(), message: error.message });
    });
    return { state: 'downloading', currentVersion: app.getVersion(), version: this.lastAvailableVersion };
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall(false, true);
  }

  private broadcast(status: UpdateStatus): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('app:update-status', status);
    }
  }
}

function downloadStatus(progress: ProgressInfo, version?: string): UpdateStatus {
  return {
    state: 'downloading',
    currentVersion: app.getVersion(),
    version,
    percent: progress.percent,
    transferred: progress.transferred,
    total: progress.total,
  };
}
