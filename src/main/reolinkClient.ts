import type {
  CameraCapabilities,
  CameraChannelStatus,
  CameraDeviceInfo,
  CameraProfile,
  CameraWithSecret,
  ConnectionStatus,
  IrLightMode,
  IrLightsInfo,
  Preset,
  PtzCommand,
  SirenConfig,
  StreamInfo,
  WhiteLedState,
  ZoomFocusState,
  ZoomRange,
} from '../shared/types.js';
import { commandToReolinkOp } from '../shared/ptz.js';
import { requestBinary, requestJson } from './request.js';
import { OnvifClient } from './onvifClient.js';

type ReolinkEnvelope<T = unknown> = Array<{
  cmd: string;
  code: number;
  value?: T;
  range?: T;
  initial?: T;
  error?: { detail?: string; rspCode?: number };
}>;

type DevInfoResponse = {
  DevInfo?: {
    name?: string;
    model?: string;
    serial?: string;
    uid?: string;
    version?: string;
    hardVer?: string;
  };
};

type AbilityResponse = {
  Ability?: Record<string, unknown>;
};

type ChannelStatusResponse = {
  ChannelStatus?: Array<{
    channel?: number;
    name?: string;
    online?: number | boolean;
  }>;
};

type EncResponse = {
  Enc?: {
    mainStream?: RawStreamInfo;
    subStream?: RawStreamInfo;
  };
};

type RawStreamInfo = {
  bitRate?: number;
  frameRate?: number;
  height?: number;
  size?: string;
  vType?: string;
  width?: number;
};

// `value.pos` is a number; `range.pos` is a { min, max } object (action: 1).
type ZoomFocusResponse = {
  ZoomFocus?: {
    channel?: number;
    focus?: { pos?: number | { min?: number; max?: number } };
    zoom?: { pos?: number | { min?: number; max?: number } };
  };
};

// `value.state` is a string; `range.state` lists the supported values.
type IrLightsResponse = {
  IrLights?: {
    state?: string | string[];
    mode?: string;
  };
};

type WhiteLedResponse = {
  WhiteLed?: {
    state?: number | string;
    bright?: number;
    brightness?: number;
    Bright?: number;
    mode?: number | string;
  };
};

type AudioAlarmResponse = {
  AudioAlarm?: SirenConfig;
};

export class ReolinkClient {
  private readonly sessions = new Map<string, { token: string; expiresAt: number; camera: CameraWithSecret }>();
  private readonly pendingLogins = new Map<string, Promise<string>>();
  private readonly apiOverrides = new Map<string, Pick<CameraWithSecret, 'protocol' | 'httpPort'>>();
  private readonly zoomRanges = new Map<string, ZoomRange>();
  private readonly onvif = new OnvifClient();

  async testConnection(camera: CameraWithSecret): Promise<ConnectionStatus> {
    try {
      const token = await this.getToken(camera);
      const [presets, cameraName, streams] = await Promise.all([
        this.getPresets(camera, token),
        this.getCameraName(camera, token).catch(() => undefined),
        this.getStreamInfo(camera, token).catch(() => undefined),
      ]);
      const profile = await this.getProfile(camera, token).catch(() => undefined);
      return {
        ok: true,
        message: 'Connected',
        presets,
        streamUrl: buildRtspUrl(camera),
        cameraName,
        streams,
        profile,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown connection error',
      };
    }
  }

  async getPresets(camera: CameraWithSecret, token?: string): Promise<Preset[]> {
    const sessionToken = token ?? (await this.getToken(camera));
    const response = await this.postWithTokenRetry<{ PtzPreset?: Array<{ id: number; name: string; enable?: number }> }>(
      camera,
      [{ cmd: 'GetPtzPreset', action: 0, param: { channel: camera.channel } }],
      sessionToken,
    );
    const rawPresets = response[0]?.value?.PtzPreset ?? [];
    return rawPresets
      .filter((preset) => preset.enable !== 0)
      .map((preset) => ({ id: Number(preset.id), name: preset.name || `Preset ${preset.id}` }))
      .sort((a, b) => a.id - b.id);
  }

  async savePreset(camera: CameraWithSecret, presetId: number, name: string): Promise<Preset[]> {
    const token = await this.getToken(camera);
    const id = clampPresetId(presetId);
    await this.postWithTokenRetry(
      camera,
      [{
        cmd: 'SetPtzPreset',
        action: 0,
        param: {
          PtzPreset: {
            channel: camera.channel,
            enable: 1,
            id,
            name: sanitizePresetName(name),
          },
        },
      }],
      token,
    );
    return this.getPresets(camera, token);
  }

  async deletePreset(camera: CameraWithSecret, presetId: number): Promise<Preset[]> {
    const token = await this.getToken(camera);
    const id = clampPresetId(presetId);
    await this.postWithTokenRetry(
      camera,
      [{
        cmd: 'SetPtzPreset',
        action: 0,
        param: {
          PtzPreset: {
            channel: camera.channel,
            enable: 0,
            id,
            name: '',
          },
        },
      }],
      token,
    );
    return this.getPresets(camera, token);
  }


  async getCameraName(camera: CameraWithSecret, token?: string): Promise<string | undefined> {
    const info = await this.getDeviceInfo(camera, token);
    return (info.name || info.model)?.trim() || undefined;
  }

  async getProfile(camera: CameraWithSecret, token?: string): Promise<CameraProfile> {
    const sessionToken = token ?? (await this.getToken(camera));
    const [ability, device, channels] = await Promise.all([
      this.getAbility(camera, sessionToken).catch(() => ({})),
      this.getDeviceInfo(camera, sessionToken).catch(() => ({})),
      this.getChannelStatus(camera, sessionToken).catch(() => []),
    ]);
    return {
      device,
      channels,
      capabilities: normalizeCapabilities(ability),
    };
  }

  async getAbility(camera: CameraWithSecret, token?: string): Promise<Record<string, unknown>> {
    const sessionToken = token ?? (await this.getToken(camera));
    const response = await this.postWithTokenRetry<AbilityResponse>(
      camera,
      [{ cmd: 'GetAbility', action: 0, param: { User: { userName: camera.username } } }],
      sessionToken,
    );
    return response[0]?.value?.Ability ?? {};
  }

  async getDeviceInfo(camera: CameraWithSecret, token?: string): Promise<CameraDeviceInfo> {
    const sessionToken = token ?? (await this.getToken(camera));
    const response = await this.postWithTokenRetry<DevInfoResponse>(
      camera,
      [{ cmd: 'GetDevInfo', action: 0, param: {} }],
      sessionToken,
    );
    const info = response[0]?.value?.DevInfo;
    return {
      name: info?.name?.trim(),
      model: info?.model?.trim(),
      uid: (info?.uid || info?.serial)?.trim(),
      firmware: info?.version?.trim(),
      hardware: info?.hardVer?.trim(),
    };
  }

  async getChannelStatus(camera: CameraWithSecret, token?: string): Promise<CameraChannelStatus[]> {
    const sessionToken = token ?? (await this.getToken(camera));
    const response = await this.postWithTokenRetry<ChannelStatusResponse>(
      camera,
      [{ cmd: 'GetChannelStatus', action: 0, param: {} }],
      sessionToken,
    );
    return (response[0]?.value?.ChannelStatus ?? []).map((channel) => ({
      channel: Number(channel.channel ?? 0),
      online: channel.online === true || channel.online === 1,
      name: channel.name?.trim(),
    }));
  }

  async getStreamInfo(camera: CameraWithSecret, token?: string): Promise<{ high?: StreamInfo; low?: StreamInfo }> {
    const sessionToken = token ?? (await this.getToken(camera));
    const response = await this.postWithTokenRetry<EncResponse>(
      camera,
      [{ cmd: 'GetEnc', action: 0, param: { channel: camera.channel } }],
      sessionToken,
    );
    const enc = response[0]?.value?.Enc;
    return {
      high: normalizeStreamInfo('high', enc?.mainStream),
      low: normalizeStreamInfo('low', enc?.subStream),
    };
  }

  async sendPtz(camera: CameraWithSecret, command: PtzCommand): Promise<void> {
    if (command.kind === 'zoomLevel') {
      const range = await this.getZoomRange(camera);
      await this.startZoomFocus(camera, 'ZoomPos', zoomLevelPosition(command.level, range));
      return;
    }
    if (command.kind === 'zoomPosition') {
      const range = await this.getZoomRange(camera);
      await this.startZoomFocus(camera, 'ZoomPos', clampZoomPosition(command.position, range));
      return;
    }

    const op = commandToReolinkOp(command);
    const param: Record<string, unknown> = { channel: camera.channel, op };

    if (command.kind === 'move' || command.kind === 'zoom' || command.kind === 'focus') {
      param.speed = clampSpeed(command.speed);
    }

    if (command.kind === 'preset') {
      param.id = command.presetId;
    }

    try {
      const token = await this.getToken(camera);
      await this.postWithTokenRetry(camera, [{ cmd: 'PtzCtrl', action: 0, param }], token);
    } catch (error) {
      if (!shouldFallbackToOnvif(error)) throw error;
      await this.onvif.sendPtz(camera, command);
    }
  }

  async getZoomFocus(camera: CameraWithSecret): Promise<ZoomFocusState> {
    const token = await this.getToken(camera);
    const response = await this.postWithTokenRetry<ZoomFocusResponse>(
      camera,
      [{ cmd: 'GetZoomFocus', action: 1, param: { channel: camera.channel } }],
      token,
    ).catch(() =>
      this.postWithTokenRetry<ZoomFocusResponse>(
        camera,
        [{ cmd: 'GetZoomFocus', action: 0, param: { channel: camera.channel } }],
        token,
      ),
    );
    const state = parseZoomFocus(response[0]);
    if (state.zoomRange) this.zoomRanges.set(camera.id, state.zoomRange);
    return state;
  }

  // Moves the optical zoom to an absolute position (clamped to the camera's own
  // range) and waits for the motor to settle so the caller gets the real end position.
  async setZoomPosition(camera: CameraWithSecret, position: number): Promise<ZoomFocusState> {
    const range = await this.getZoomRange(camera);
    const target = clampZoomPosition(position, range);
    await this.startZoomFocus(camera, 'ZoomPos', target);
    return this.waitForZoomToSettle(camera, target);
  }

  private async getZoomRange(camera: CameraWithSecret): Promise<ZoomRange> {
    const cached = this.zoomRanges.get(camera.id);
    if (cached) return cached;
    const state = await this.getZoomFocus(camera).catch(() => undefined);
    return state?.zoomRange ?? DEFAULT_ZOOM_RANGE;
  }

  private async waitForZoomToSettle(camera: CameraWithSecret, target: number): Promise<ZoomFocusState> {
    let last: ZoomFocusState = {};
    let previous: number | undefined;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      await sleep(300);
      last = await this.getZoomFocus(camera).catch(() => ({}));
      if (last.zoom === target) return last;
      // Some models stop short of the requested position; treat two identical
      // readings as settled.
      if (typeof last.zoom === 'number' && last.zoom === previous) return last;
      previous = last.zoom;
    }
    return last;
  }

  async getSnapshot(camera: CameraWithSecret): Promise<{ bytes: Buffer; contentType: string }> {
    const token = await this.getToken(camera);
    const url = this.apiUrl(camera, 'Snap', token);
    url.searchParams.set('channel', String(camera.streamChannel ?? camera.channel));
    url.searchParams.set('rs', String(Date.now()));
    return requestBinary(url);
  }

  async getIrLights(camera: CameraWithSecret): Promise<IrLightsInfo | undefined> {
    const token = await this.getToken(camera);
    const response = await this.postWithTokenRetry<IrLightsResponse>(
      camera,
      [{ cmd: 'GetIrLights', action: 1, param: { channel: camera.channel } }],
      token,
    );
    return parseIrLights(response[0]);
  }

  async setIrLights(camera: CameraWithSecret, mode: IrLightMode): Promise<void> {
    const token = await this.getToken(camera);
    // The control field is `state`; a `mode` field is accepted but silently
    // ignored (verified against TrackMix WiFi firmware v3.0.0.4255).
    await this.postWithTokenRetry(
      camera,
      [{ cmd: 'SetIrLights', action: 0, param: { IrLights: { channel: camera.channel, state: reolinkIrMode(mode) } } }],
      token,
    );
  }

  async getWhiteLed(camera: CameraWithSecret): Promise<WhiteLedState> {
    const token = await this.getToken(camera);
    const response = await this.postWithTokenRetry<WhiteLedResponse>(
      camera,
      [{ cmd: 'GetWhiteLed', action: 0, param: { channel: camera.channel } }],
      token,
    );
    return normalizeWhiteLed(response[0]?.value?.WhiteLed);
  }

  async setWhiteLed(camera: CameraWithSecret, options: { mode?: number; enabled?: boolean; brightness?: number }): Promise<void> {
    const token = await this.getToken(camera);
    const whiteLed: Record<string, unknown> = { channel: camera.channel };
    if (options.mode !== undefined) {
      whiteLed.mode = options.mode;
      whiteLed.state = options.mode === 0 ? 0 : 1;
    } else if (options.enabled !== undefined) {
      whiteLed.state = options.enabled ? 1 : 0;
    }
    if (options.brightness !== undefined) whiteLed.bright = clampBrightness(options.brightness);
    try {
      await this.postWithTokenRetry(
        camera,
        [{ cmd: 'SetWhiteLed', action: 0, param: { WhiteLed: whiteLed } }],
        token,
      );
    } catch (error) {
      if (isAbilityError(error)) {
        throw new Error('Kameraet nektar lysstyring for denne brukaren. Bruk ein admin-brukar for White LED/spotlight.');
      }
      throw error;
    }
  }

  async getSirenConfig(camera: CameraWithSecret): Promise<SirenConfig> {
    const token = await this.getToken(camera);
    const response = await this.postWithTokenRetry<AudioAlarmResponse>(
      camera,
      [{ cmd: 'GetAudioAlarm', action: 0, param: { channel: camera.channel } }],
      token,
    );
    return response[0]?.value?.AudioAlarm ?? {};
  }

  async playSiren(camera: CameraWithSecret): Promise<void> {
    const token = await this.getToken(camera);
    await this.postWithTokenRetry(camera, [{ cmd: 'AudioAlarmPlay', action: 0, param: { channel: camera.channel } }], token);
  }

  async logoutAll(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    this.pendingLogins.clear();
    await Promise.allSettled(
      sessions.map((session) =>
        this.post(session.camera, [{ cmd: 'Logout', action: 0, param: {} }], session.token).catch(() => undefined),
      ),
    );
  }

  async logoutExcept(cameraId: string): Promise<void> {
    const sessions = [...this.sessions.entries()].filter(([, session]) => session.camera.id !== cameraId);
    for (const [key] of sessions) {
      this.sessions.delete(key);
      this.pendingLogins.delete(key);
    }
    await Promise.allSettled(
      sessions.map(([, session]) =>
        this.post(session.camera, [{ cmd: 'Logout', action: 0, param: {} }], session.token).catch(() => undefined),
      ),
    );
  }

  async getToken(camera: CameraWithSecret): Promise<string> {
    const key = sessionKey(camera);
    const cached = this.sessions.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const pending = this.pendingLogins.get(key);
    if (pending) return pending;

    const login = this.login(camera)
      .then((token) => {
        this.sessions.set(key, { token, expiresAt: Date.now() + 25 * 60 * 1000, camera });
        return token;
      })
      .finally(() => {
        this.pendingLogins.delete(key);
      });

    this.pendingLogins.set(key, login);
    return login;
  }

  private async login(camera: CameraWithSecret): Promise<string> {
    const response = await this.post<{ Token?: { name?: string } }>(camera, [
      {
        cmd: 'Login',
        action: 0,
        param: {
          User: {
            userName: camera.username,
            password: camera.password,
          },
        },
      },
    ]);
    const token = response[0]?.value?.Token?.name;
    if (!token) throw new Error('Camera login succeeded but no token was returned.');
    return token;
  }

  private async postWithTokenRetry<T>(
    camera: CameraWithSecret,
    body: Array<{ cmd: string; action?: number; param?: unknown }>,
    token: string,
  ): Promise<ReolinkEnvelope<T>> {
    try {
      return await this.post<T>(camera, body, token);
    } catch (error) {
      this.sessions.delete(sessionKey(camera));
      if (error instanceof Error && /please login first|invalid|session/i.test(error.message)) {
        return this.post<T>(camera, body, await this.getToken(camera));
      }
      throw error;
    }
  }

  private async post<T>(
    camera: CameraWithSecret,
    body: Array<{ cmd: string; action?: number; param?: unknown }>,
    token?: string,
  ): Promise<ReolinkEnvelope<T>> {
    const url = this.apiUrl(camera, body[0]?.cmd ?? '', token);
    const payload = await this.requestApi<ReolinkEnvelope<T>>(camera, url, body);
    const first = payload[0];
    if (!first || first.code !== 0) {
      const detail = first?.error?.detail ?? first?.cmd ?? 'unknown command';
      throw new Error(`Reolink API rejected request: ${detail}`);
    }
    return payload;
  }

  private async startZoomFocus(camera: CameraWithSecret, op: 'ZoomPos' | 'FocusPos', pos: number): Promise<void> {
    const token = await this.getToken(camera);
    try {
      await this.postWithTokenRetry(
        camera,
        [{ cmd: 'StartZoomFocus', action: 0, param: { ZoomFocus: { channel: camera.channel, op, pos } } }],
        token,
      );
    } catch (error) {
      if (error instanceof Error && /ability error|rspCode.*-26/i.test(error.message)) {
        throw new Error('Kameraet krev admin-brukar for direkte zoom/fokus-nivå.');
      }
      throw error;
    }
  }

  private apiUrl(camera: CameraWithSecret, command: string, token?: string): URL {
    const endpoint = this.apiOverrides.get(camera.id) ?? camera;
    const url = new URL(`${endpoint.protocol}://${camera.host}:${endpoint.httpPort}/cgi-bin/api.cgi`);
    url.searchParams.set('cmd', command);
    if (token) url.searchParams.set('token', token);
    return url;
  }

  private async requestApi<T>(camera: CameraWithSecret, url: URL, body: unknown): Promise<T> {
    try {
      return await requestJson<T>(url, body);
    } catch (error) {
      if (!isRetryableEndpointError(error)) throw error;

      let lastError = error;
      for (const endpoint of apiFallbacks(camera)) {
        if (`${endpoint.protocol}:${endpoint.httpPort}` === endpointKeyFromUrl(url)) continue;

        this.apiOverrides.set(camera.id, endpoint);
        const fallbackUrl = this.apiUrl(camera, url.searchParams.get('cmd') ?? '', url.searchParams.get('token') ?? undefined);
        try {
          return await requestJson<T>(fallbackUrl, body);
        } catch (fallbackError) {
          lastError = fallbackError;
          if (!isRetryableEndpointError(fallbackError)) break;
        }
      }

      this.apiOverrides.delete(camera.id);
      throw lastError;
    }
  }
}

export function buildRtspUrl(camera: CameraWithSecret): string {
  const user = encodeURIComponent(camera.username);
  const password = encodeURIComponent(camera.password);
  const stream = camera.lowLatency ? 'sub' : 'main';
  return `rtsp://${user}:${password}@${camera.host}:${camera.rtspPort}/h264Preview_${String((camera.streamChannel ?? camera.channel) + 1).padStart(2, '0')}_${stream}`;
}

function clampSpeed(speed: number): number {
  return Math.max(1, Math.min(64, Math.round(speed)));
}

function clampBrightness(brightness: number): number {
  return Math.max(0, Math.min(100, Math.round(brightness)));
}

// Legacy fallback for cameras that do not report a zoom range via GetZoomFocus action:1.
export const DEFAULT_ZOOM_RANGE: ZoomRange = { min: 0, max: 34 };

export function parseZoomFocus(item?: {
  value?: ZoomFocusResponse;
  range?: ZoomFocusResponse;
}): ZoomFocusState {
  const value = item?.value?.ZoomFocus;
  const range = item?.range?.ZoomFocus;
  return {
    zoom: positionNumber(value?.zoom?.pos),
    focus: positionNumber(value?.focus?.pos),
    zoomRange: parseRange(range?.zoom?.pos),
    focusRange: parseRange(range?.focus?.pos),
  };
}

function positionNumber(pos?: number | { min?: number; max?: number }): number | undefined {
  return typeof pos === 'number' && Number.isFinite(pos) ? pos : undefined;
}

function parseRange(pos?: number | { min?: number; max?: number }): ZoomRange | undefined {
  if (!pos || typeof pos !== 'object') return undefined;
  const { min, max } = pos;
  if (typeof min !== 'number' || typeof max !== 'number' || max <= min) return undefined;
  return { min, max };
}

function zoomLevelPosition(level: 1 | 2 | 3 | 4, range: ZoomRange): number {
  return Math.round(range.min + ((level - 1) / 3) * (range.max - range.min));
}

export function clampZoomPosition(position: number, range: ZoomRange = DEFAULT_ZOOM_RANGE): number {
  return Math.max(range.min, Math.min(range.max, Math.round(position)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampPresetId(id: number): number {
  return Math.max(1, Math.min(64, Math.round(id)));
}

function sanitizePresetName(name: string): string {
  const value = name.trim();
  return (value || 'Preset').slice(0, 31);
}

function sessionKey(camera: CameraWithSecret): string {
  return `${camera.protocol}://${camera.host}:${camera.httpPort}:${camera.username}`;
}

function apiFallbacks(camera: CameraWithSecret): Array<Pick<CameraWithSecret, 'protocol' | 'httpPort'>> {
  const candidates: Array<Pick<CameraWithSecret, 'protocol' | 'httpPort'>> = [
    { protocol: 'https', httpPort: 443 },
    { protocol: 'http', httpPort: 80 },
  ];
  return candidates.filter((candidate, index, all) =>
    all.findIndex((item) => item.protocol === candidate.protocol && item.httpPort === candidate.httpPort) === index &&
    !(candidate.protocol === camera.protocol && candidate.httpPort === camera.httpPort),
  );
}

function isConnectionRefused(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as Error & { code?: unknown }).code === 'ECONNREFUSED';
}

function isRetryableEndpointError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = 'code' in error ? (error as Error & { code?: unknown }).code : undefined;
  return (
    code === 'ECONNREFUSED' ||
    code === 'EPROTO' ||
    code === 'ECONNRESET' ||
    /WRONG_VERSION_NUMBER|non-JSON response|Bad Request|socket hang up|timed out/i.test(error.message)
  );
}

function endpointKeyFromUrl(url: URL): string {
  const protocol = url.protocol.replace(':', '') as 'http' | 'https';
  const port = Number(url.port || (protocol === 'https' ? 443 : 80));
  return `${protocol}:${port}`;
}

function shouldFallbackToOnvif(error: unknown): boolean {
  return (
    isRetryableEndpointError(error) ||
    (error instanceof Error && /timed out|ECONNRESET|ECONNREFUSED|Camera HTTP 40[134]|Camera HTTP 50|set config failed|Reolink API rejected request/i.test(error.message))
  );
}

function isAbilityError(error: unknown): boolean {
  return error instanceof Error && /ability error|rspCode.*-26/i.test(error.message);
}

function normalizeStreamInfo(quality: 'high' | 'low', stream?: RawStreamInfo): StreamInfo | undefined {
  if (!stream) return undefined;
  const width = Number(stream.width ?? stream.size?.split('*')[0] ?? 0);
  const height = Number(stream.height ?? stream.size?.split('*')[1] ?? 0);
  return {
    quality,
    resolution: stream.size ?? (width && height ? `${width}*${height}` : 'unknown'),
    width,
    height,
    fps: Number(stream.frameRate ?? 0),
    bitrateKbps: Number(stream.bitRate ?? 0),
    codec: stream.vType,
  };
}

function normalizeCapabilities(ability: Record<string, unknown>): CameraCapabilities {
  const has = (...needles: string[]) => {
    const keys = Object.keys(ability);
    return needles.some((needle) => keys.some((key) => key.toLowerCase().includes(needle.toLowerCase()) && abilityFlag(ability[key])));
  };
  return {
    ptz: has('ptz'),
    presets: has('preset', 'ptz'),
    zoomFocus: has('zoom', 'focus', 'ptz'),
    irLights: has('ir'),
    whiteLed: has('whiteled', 'white', 'led', 'light'),
    siren: has('audioalarm', 'siren', 'alarm'),
    motion: has('md', 'motion'),
    ai: has('ai'),
  };
}

function abilityFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return value !== '0' && value.toLowerCase() !== 'false';
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(abilityFlag);
  }
  return false;
}

export function parseIrLights(item?: { value?: IrLightsResponse; range?: IrLightsResponse }): IrLightsInfo | undefined {
  const raw = item?.value?.IrLights?.state ?? item?.value?.IrLights?.mode;
  const mode = normalizeIrMode(typeof raw === 'string' ? raw : undefined);
  const rawOptions = item?.range?.IrLights?.state;
  const options = Array.isArray(rawOptions)
    ? rawOptions
        .map((option) => normalizeIrMode(option))
        .filter((option): option is IrLightMode => option !== undefined)
    : [];
  if (mode === undefined && options.length === 0) return undefined;
  return { mode, options: options.length > 0 ? options : ['auto', 'on', 'off'] };
}

export function normalizeWhiteLed(value?: WhiteLedResponse['WhiteLed']): WhiteLedState {
  const brightness = value?.bright ?? value?.brightness ?? value?.Bright;
  const mode = typeof value?.mode === 'number' ? value.mode : typeof value?.mode === 'string' ? Number(value.mode) : undefined;
  return {
    // `mode` is the actual configuration; `state` is only a status field on
    // several firmwares. mode 0 = off, 1 = auto at night, 3 = schedule.
    enabled: mode !== undefined && Number.isFinite(mode)
      ? mode !== 0
      : value?.state === 1 || value?.state === 'On' || value?.state === 'on',
    brightness,
    mode: mode !== undefined && Number.isFinite(mode) ? mode : undefined,
    supportsModes: mode !== undefined && Number.isFinite(mode),
    supportsBrightness: typeof brightness === 'number',
  };
}

function normalizeIrMode(value?: string): IrLightMode | undefined {
  const normalized = value?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes('auto')) return 'auto';
  if (normalized.includes('off') || normalized === '0') return 'off';
  if (normalized.includes('on') || normalized === '1') return 'on';
  return undefined;
}

function reolinkIrMode(mode: IrLightMode): string {
  switch (mode) {
    case 'auto':
      return 'Auto';
    case 'on':
      return 'On';
    case 'off':
      return 'Off';
  }
}
