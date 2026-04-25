import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, CameraInput, ConnectionStatus, Preset, PtzCommand, StreamInfo } from '../shared/types.js';

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
  setActiveCamera: (id: string): Promise<AppState> => ipcRenderer.invoke('camera:set-active', id),
  setStreamChannel: (id: string, channel: number): Promise<AppState> => ipcRenderer.invoke('camera:set-stream-channel', id, channel),
  setStreamQuality: (id: string, lowLatency: boolean): Promise<AppState> => ipcRenderer.invoke('camera:set-stream-quality', id, lowLatency),
  testCamera: (id: string): Promise<ConnectionStatus> => ipcRenderer.invoke('camera:test', id),
  getPresets: (id: string): Promise<Preset[]> => ipcRenderer.invoke('camera:get-presets', id),
  getStreamInfo: (id: string): Promise<{ high?: StreamInfo; low?: StreamInfo }> => ipcRenderer.invoke('camera:get-stream-info', id),
  getDeviceName: (input: CameraInput): Promise<string | undefined> => ipcRenderer.invoke('camera:get-device-name', input),
  sendPtz: (id: string, command: PtzCommand): Promise<void> => ipcRenderer.invoke('camera:ptz', id, command),
  getSnapshotUrl: (id: string): Promise<string> => ipcRenderer.invoke('camera:get-snapshot-url', id),
  getMjpegUrl: (id: string): Promise<string> => ipcRenderer.invoke('camera:get-mjpeg-url', id),
  getWebRtcStream: (id: string): Promise<WebRtcStream> => ipcRenderer.invoke('camera:get-webrtc-stream', id),
};

contextBridge.exposeInMainWorld('fjoscam', api);

export type FjoscamApi = typeof api;
