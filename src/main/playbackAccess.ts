import type { Session } from 'electron';
import type { Go2RtcBridge } from './go2rtcBridge.js';
import type { SnapshotServer } from './snapshotServer.js';

// Authentication stays in main, including WebSocket handshake headers. The
// renderer is allowed only the player assets and image routes, never admin API.
export function installPlaybackAccess(
  session: Session,
  bridge: Go2RtcBridge,
  snapshots: SnapshotServer,
  ownsWebContents: (id: number) => boolean,
  stopping: () => boolean,
): void {
  session.webRequest.onBeforeSendHeaders(
    { urls: ['http://127.0.0.1/*', 'ws://127.0.0.1/*'] },
    (details, callback) => {
      const url = new URL(details.url);
      const isBridge = url.port === '1984';
      const isSnapshot = snapshots.ownsUrl(details.url);
      if (!isBridge && !isSnapshot) { callback({}); return; }
      const authorization = details.webContentsId !== undefined && ownsWebContents(details.webContentsId) && !stopping()
        ? (isBridge ? bridge.playbackAuthorization(details.url, details.method) : snapshots.playbackAuthorization(details.url, details.method))
        : undefined;
      callback(authorization ? { requestHeaders: { ...details.requestHeaders, Authorization: authorization } } : { cancel: true });
    },
  );
}
