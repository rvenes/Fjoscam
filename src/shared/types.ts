export type CameraId = string;

export type CameraConfig = {
  id: CameraId;
  name: string;
  host: string;
  protocol: 'http' | 'https';
  httpPort: number;
  rtspPort: number;
  username: string;
  channel: number;
  streamChannel: number;
  lowLatency: boolean;
};

export type CameraSecret = {
  password: string;
};

export type CameraInput = Omit<CameraConfig, 'id'> & CameraSecret;

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
};

export type CameraWithSecret = CameraConfig & CameraSecret;
