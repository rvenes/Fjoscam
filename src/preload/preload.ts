import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type {
  AppState,
  CameraDiscoveryReport,
  CameraInput,
  CertificateInfo,
  HttpsTarget,
  CameraProfile,
  ConnectionStatus,
  IrLightMode,
  IrLightsInfo,
  Preset,
  PtzCommand,
  SirenConfig,
  StreamInfo,
  UpdateStatus,
  WhiteLedState,
  ZoomFocusState,
  PlaybackSample,
  WebRtcStream,
} from '../shared/types.js';

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke('app:get-state'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  exportDiagnostics: (): Promise<boolean> => ipcRenderer.invoke('app:export-diagnostics'),
  onPowerState: (callback: (state: 'suspend' | 'resume') => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: unknown) => { if (state === 'suspend' || state === 'resume') callback(state); };
    ipcRenderer.on('app:power-state', listener);
    return () => ipcRenderer.removeListener('app:power-state', listener);
  },
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('app:check-for-updates'),
  downloadUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke('app:download-update'),
  quitAndInstallUpdate: (): Promise<void> => ipcRenderer.invoke('app:quit-and-install-update'),
  setFullscreen: (enabled: boolean): Promise<void> => ipcRenderer.invoke('app:set-fullscreen', enabled),
  getFullscreen: (): Promise<boolean> => ipcRenderer.invoke('app:get-fullscreen'),
  onFullscreenChanged: (callback: (enabled: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, enabled: unknown) => { if (typeof enabled === 'boolean') callback(enabled); };
    ipcRenderer.on('app:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('app:fullscreen-changed', listener);
  },
  saveCamera: (input: CameraInput, id?: string): Promise<AppState> => ipcRenderer.invoke('camera:save', input, id),
  removeCamera: (id: string): Promise<AppState> => ipcRenderer.invoke('camera:remove', id),
  reorderCameras: (ids: string[]): Promise<AppState> => ipcRenderer.invoke('camera:reorder', ids),
  setActiveCamera: (id: string): Promise<AppState> => ipcRenderer.invoke('camera:set-active', id),
  setStreamChannel: (id: string, channel: number): Promise<AppState> => ipcRenderer.invoke('camera:set-stream-channel', id, channel),
  setStreamQuality: (id: string, lowLatency: boolean): Promise<AppState> => ipcRenderer.invoke('camera:set-stream-quality', id, lowLatency),
  discoverCameras: (): Promise<CameraDiscoveryReport> => ipcRenderer.invoke('camera:discover'),
  inspectCertificate: (target: HttpsTarget): Promise<CertificateInfo> => ipcRenderer.invoke('camera:inspect-certificate', target),
  inspectStreamCertificate: (streamUrl: string, id?: string): Promise<CertificateInfo> => ipcRenderer.invoke('camera:inspect-stream-certificate', streamUrl, id),
  testCamera: (id: string): Promise<ConnectionStatus> => ipcRenderer.invoke('camera:test', id),
  getPresets: (id: string): Promise<Preset[]> => ipcRenderer.invoke('camera:get-presets', id),
  getStreamInfo: (id: string): Promise<{ high?: StreamInfo; low?: StreamInfo }> => ipcRenderer.invoke('camera:get-stream-info', id),
  getProfile: (id: string): Promise<CameraProfile | undefined> => ipcRenderer.invoke('camera:get-profile', id),
  getIrLights: (id: string): Promise<IrLightsInfo | undefined> => ipcRenderer.invoke('camera:get-ir-lights', id),
  setIrLights: (id: string, mode: IrLightMode): Promise<void> => ipcRenderer.invoke('camera:set-ir-lights', id, mode),
  getWhiteLed: (id: string): Promise<WhiteLedState | undefined> => ipcRenderer.invoke('camera:get-white-led', id),
  setWhiteLed: (id: string, options: { mode?: number; enabled?: boolean; brightness?: number }): Promise<void> =>
    ipcRenderer.invoke('camera:set-white-led', id, options),
  getSirenConfig: (id: string): Promise<SirenConfig | undefined> => ipcRenderer.invoke('camera:get-siren-config', id),
  playSiren: (id: string): Promise<void> => ipcRenderer.invoke('camera:play-siren', id),
  getDeviceName: (input: CameraInput): Promise<string | undefined> => ipcRenderer.invoke('camera:get-device-name', input),
  sendPtz: (id: string, command: PtzCommand): Promise<void> => ipcRenderer.invoke('camera:ptz', id, command),
  getZoomFocus: (id: string): Promise<ZoomFocusState> => ipcRenderer.invoke('camera:get-zoom-focus', id),
  setZoomPosition: (id: string, position: number): Promise<ZoomFocusState> => ipcRenderer.invoke('camera:set-zoom-position', id, position),
  savePreset: (id: string, presetId: number, name: string): Promise<Preset[]> => ipcRenderer.invoke('camera:save-preset', id, presetId, name),
  deletePreset: (id: string, presetId: number): Promise<Preset[]> => ipcRenderer.invoke('camera:delete-preset', id, presetId),
  getSnapshotUrl: (id: string): Promise<string> => ipcRenderer.invoke('camera:get-snapshot-url', id),
  getMjpegUrl: (id: string): Promise<string> => ipcRenderer.invoke('camera:get-mjpeg-url', id),
  getWebRtcStream: (id: string): Promise<WebRtcStream> => ipcRenderer.invoke('camera:get-webrtc-stream', id),
  releaseStream: (id: string): Promise<void> => ipcRenderer.invoke('camera:release-stream', id),
  setStreamAudio: (muted: boolean, volume: number): Promise<void> => ipcRenderer.invoke('stream:set-audio', muted, volume),
  getPlaybackHealth: (pageUrl: string): Promise<PlaybackSample> => ipcRenderer.invoke('stream:get-health', pageUrl),
  onOpenPanel: (callback: (panel: 'settings' | 'tips') => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, panel: 'settings' | 'tips') => callback(panel);
    ipcRenderer.on('app:open-panel', listener);
    return () => ipcRenderer.removeListener('app:open-panel', listener);
  },
  onCameraEditMode: (callback: (enabled: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, enabled: boolean) => callback(enabled);
    ipcRenderer.on('app:camera-edit-mode', listener);
    return () => ipcRenderer.removeListener('app:camera-edit-mode', listener);
  },
  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on('app:update-status', listener);
    return () => ipcRenderer.removeListener('app:update-status', listener);
  },
  onOpenAbout: (callback: (version: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, version: string) => callback(version);
    ipcRenderer.on('app:open-about', listener);
    return () => ipcRenderer.removeListener('app:open-about', listener);
  },
};

contextBridge.exposeInMainWorld('fjoscam', api);

export type FjoscamApi = typeof api;
