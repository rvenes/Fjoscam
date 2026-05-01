export type CameraId = string;

export type CameraConfig = {
  id: CameraId;
  kind?: 'reolink' | 'panasonic' | 'generic';
  name: string;
  host: string;
  protocol: 'http' | 'https';
  httpPort: number;
  rtspPort: number;
  username: string;
  channel: number;
  streamChannel: number;
  lowLatency: boolean;
  mjpegPath?: string;
  ptzPath?: string;
  streamUrl?: string;
};

export type CameraSecret = {
  password: string;
};

export type CameraInput = Omit<CameraConfig, 'id'> & CameraSecret;

export type CameraDiscoveryResult = {
  id: string;
  host: string;
  name?: string;
  manufacturer?: string;
  model?: string;
  xaddrs: string[];
  scopes: string[];
  ports: {
    http?: number;
    https?: number;
    rtsp?: number;
    onvif?: number;
    reolink?: number;
  };
  source: 'ws-discovery' | 'subnet-scan';
};

export type Preset = {
  id: number;
  name: string;
};

export type StreamInfo = {
  quality: 'high' | 'low';
  resolution: string;
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
  codec?: string;
};

export type CameraDeviceInfo = {
  name?: string;
  model?: string;
  uid?: string;
  firmware?: string;
  hardware?: string;
};

export type CameraChannelStatus = {
  channel: number;
  online: boolean;
  name?: string;
};

export type CameraCapabilities = {
  ptz: boolean;
  presets: boolean;
  zoomFocus: boolean;
  irLights: boolean;
  whiteLed: boolean;
  siren: boolean;
  motion: boolean;
  ai: boolean;
};

export type CameraProfile = {
  device?: CameraDeviceInfo;
  channels: CameraChannelStatus[];
  capabilities: CameraCapabilities;
};

export type IrLightMode = 'auto' | 'on' | 'off';

export type WhiteLedState = {
  enabled: boolean;
  brightness?: number;
  mode?: string;
  supportsBrightness?: boolean;
};

export type SirenConfig = {
  enabled?: boolean;
  duration?: number;
};

export type AppState = {
  cameras: CameraConfig[];
  activeCameraId: CameraId | null;
};

export type PtzDirection =
  | 'Up'
  | 'Down'
  | 'Left'
  | 'Right'
  | 'LeftUp'
  | 'RightUp'
  | 'LeftDown'
  | 'RightDown';

export type PtzCommand =
  | { kind: 'move'; direction: PtzDirection; speed: number }
  | { kind: 'stop' }
  | { kind: 'zoom'; direction: 'in' | 'out'; speed: number }
  | { kind: 'zoomLevel'; level: 1 | 2 | 3 | 4 }
  | { kind: 'zoomPosition'; position: number }
  | { kind: 'focus'; direction: 'near' | 'far'; speed: number }
  | { kind: 'preset'; presetId: number };

export type ConnectionStatus = {
  ok: boolean;
  message: string;
  presets?: Preset[];
  streamUrl?: string;
  cameraName?: string;
  streams?: {
    high?: StreamInfo;
    low?: StreamInfo;
  };
  profile?: CameraProfile;
};

export type CameraWithSecret = CameraConfig & CameraSecret;

export type UpdateStatus =
  | { state: 'idle'; currentVersion: string }
  | { state: 'checking'; currentVersion: string }
  | { state: 'available'; currentVersion: string; version: string; releaseDate?: string; releaseName?: string }
  | { state: 'not-available'; currentVersion: string }
  | { state: 'downloading'; currentVersion: string; version?: string; percent?: number; transferred?: number; total?: number }
  | { state: 'downloaded'; currentVersion: string; version: string }
  | { state: 'error'; currentVersion: string; message: string };
