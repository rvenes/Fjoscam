import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { AppState, CameraInput, CameraProfile, ConnectionStatus, IrLightMode, Preset, PtzCommand, SirenConfig, StreamInfo, WhiteLedState } from '../shared/types.js';

type WebRtcStream = {
  mode: 'webrtc';
  streamName: string;
  scriptUrl: string;
  pageUrl: string;
  wsUrl: string;
};

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke('app:get-state'),
  saveCamera: (input: CameraInput, id?: string): Promise<AppState> => ipcRenderer.invoke('camera:save', input, id),
  removeCamera: (id: string): Promise<AppState> => ipcRenderer.invoke('camera:remove', id),
  reorderCameras: (ids: string[]): Promise<AppState> => ipcRenderer.invoke('camera:reorder', ids),
  setActiveCamera: (id: string): Promise<AppState> => ipcRenderer.invoke('camera:set-active', id),
  setStreamChannel: (id: string, channel: number): Promise<AppState> => ipcRenderer.invoke('camera:set-stream-channel', id, channel),
  setStreamQuality: (id: string, lowLatency: boolean): Promise<AppState> => ipcRenderer.invoke('camera:set-stream-quality', id, lowLatency),
  testCamera: (id: string): Promise<ConnectionStatus> => ipcRenderer.invoke('camera:test', id),
  getPresets: (id: string): Promise<Preset[]> => ipcRenderer.invoke('camera:get-presets', id),
  getStreamInfo: (id: string): Promise<{ high?: StreamInfo; low?: StreamInfo }> => ipcRenderer.invoke('camera:get-stream-info', id),
  getProfile: (id: string): Promise<CameraProfile | undefined> => ipcRenderer.invoke('camera:get-profile', id),
  getIrLights: (id: string): Promise<IrLightMode | undefined> => ipcRenderer.invoke('camera:get-ir-lights', id),
  setIrLights: (id: string, mode: IrLightMode): Promise<void> => ipcRenderer.invoke('camera:set-ir-lights', id, mode),
  getWhiteLed: (id: string): Promise<WhiteLedState | undefined> => ipcRenderer.invoke('camera:get-white-led', id),
  setWhiteLed: (id: string, enabled: boolean, brightness?: number): Promise<void> =>
    ipcRenderer.invoke('camera:set-white-led', id, enabled, brightness),
  getSirenConfig: (id: string): Promise<SirenConfig | undefined> => ipcRenderer.invoke('camera:get-siren-config', id),
  playSiren: (id: string): Promise<void> => ipcRenderer.invoke('camera:play-siren', id),
  getDeviceName: (input: CameraInput): Promise<string | undefined> => ipcRenderer.invoke('camera:get-device-name', input),
  sendPtz: (id: string, command: PtzCommand): Promise<void> => ipcRenderer.invoke('camera:ptz', id, command),
  getSnapshotUrl: (id: string): Promise<string> => ipcRenderer.invoke('camera:get-snapshot-url', id),
  getMjpegUrl: (id: string): Promise<string> => ipcRenderer.invoke('camera:get-mjpeg-url', id),
  getWebRtcStream: (id: string): Promise<WebRtcStream> => ipcRenderer.invoke('camera:get-webrtc-stream', id),
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
};

contextBridge.exposeInMainWorld('fjoscam', api);

export type FjoscamApi = typeof api;
