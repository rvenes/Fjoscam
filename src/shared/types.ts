export type CameraId = string;

// An explicit exception for one certificate at one HTTPS origin.
export type CertificateTrust = { origin: string; fingerprint256: string };
export type HttpsTrust = CertificateTrust;
export type CertificateInfo = HttpsTrust & {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
};
export type HttpsTarget = Pick<CameraConfig, 'host' | 'protocol' | 'httpPort'>;

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
  lensMode?: 'auto' | 'single' | 'dual';
  mjpegPath?: string;
  ptzPath?: string;
  hasStreamUrl?: boolean;
  httpsTrust?: HttpsTrust;
  rtspsTrust?: CertificateTrust;
  allowInsecureOnvif?: boolean;
  onvifPort?: number;
};

export type CameraSecret = {
  password: string;
  streamUrl?: string;
};

export type CameraInput = Omit<CameraConfig, 'id' | 'hasStreamUrl'> & CameraSecret;

export type DiscoveryNetwork = {
  name: string;
  address: string;
  subnet: string;
  scanSubnet?: string;
  hostCount: number;
  limitation?: 'large-subnet' | 'host-budget' | 'invalid-netmask' | 'point-to-point';
};

export type CameraDiscoveryReport = {
  cameras: CameraDiscoveryResult[];
  networks: DiscoveryNetwork[];
};

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

export type CapabilityStatus = 'available' | 'unsupported' | 'denied' | 'read-only' | 'unknown';
export type CameraCapability = 'ptz' | 'presets' | 'zoomFocus' | 'focus' | 'irLights' | 'whiteLed' | 'siren' | 'motion' | 'ai';
export type CameraCapabilities = {
  ptz: boolean;
  presets: boolean;
  zoomFocus: boolean;
  irLights: boolean;
  whiteLed: boolean;
  siren: boolean;
  motion: boolean;
  ai: boolean;
  focus?: boolean;
  presetWrite?: boolean;
  fourDirections?: boolean;
  status?: Partial<Record<CameraCapability, CapabilityStatus>>;
};

// Existing IPC name/mode retained for compatibility. The local go2rtc player
// can select WebRTC or MSE internally; this is its connection descriptor.
export type WebRtcStream = {
  mode: 'webrtc';
  streamName: string;
  scriptUrl: string;
  pageUrl: string;
  wsUrl: string;
};

export type CameraProfile = {
  device?: CameraDeviceInfo;
  channels: CameraChannelStatus[];
  capabilities: CameraCapabilities;
};

export type ZoomRange = {
  min: number;
  max: number;
};

// Position range varies per model (e.g. 0-34 on E1 Zoom, 1000-6000 on TrackMix),
// so the camera-reported range must be used when available.
export type ZoomFocusState = {
  zoom?: number;
  focus?: number;
  zoomRange?: ZoomRange;
  focusRange?: ZoomRange;
};

export type IrLightMode = 'auto' | 'on' | 'off';

// `options` comes from the camera's own capability range; e.g. TrackMix only
// supports Auto and Off.
export type IrLightsInfo = {
  mode?: IrLightMode;
  options: IrLightMode[];
};

// White LED behaviour is controlled by `mode` (0 = off, 1 = auto at night on
// detection, 3 = schedule). The `state` field is read-only status on several
// firmwares and cannot be used to switch the light.
export type WhiteLedState = {
  enabled: boolean;
  brightness?: number;
  mode?: number;
  supportsModes?: boolean;
  supportsBrightness?: boolean;
};

export type SirenConfig = {
  enabled?: boolean;
  duration?: number;
};

export type AppState = {
  cameras: CameraConfig[];
  activeCameraId: CameraId | null;
  configurationNotice?: 'recovered-from-backup';
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
  scope?: 'api' | 'mjpeg' | 'unverified';
  message: string;
  presets?: Preset[];
  cameraName?: string;
  streams?: {
    high?: StreamInfo;
    low?: StreamInfo;
  };
  profile?: CameraProfile;
};

export type BridgeHealth = {
  state: 'running' | 'recovering' | 'failed' | 'stopped';
  generation: number;
  attempts: number;
  retryInMs?: number;
  reason?: 'process-exited' | 'port-in-use' | 'permission-denied' | 'launch-failed' | 'restart-failed' | 'stream-invalidated';
};

export type PlaybackSample = {
  source: 'player' | 'mjpeg';
  ready: boolean;
  frames: number;
  frameAgeMs: number | null;
  ended: boolean;
  mediaError: boolean;
  bridge?: BridgeHealth;
};

export type CameraWithSecret = CameraConfig & CameraSecret;

export type UpdateStatus =
  | { state: 'idle'; currentVersion: string }
  | { state: 'checking'; currentVersion: string }
  | { state: 'available'; currentVersion: string; version: string; releaseDate?: string; releaseName?: string }
  | { state: 'not-available'; currentVersion: string }
  | { state: 'downloading'; currentVersion: string; version?: string; percent?: number; transferred?: number; total?: number }
  | { state: 'downloaded'; currentVersion: string; version: string }
  | { state: 'installing'; currentVersion: string; version: string }
  | { state: 'error'; currentVersion: string; message: string };
