import type { CameraWithSecret, ConnectionStatus, Preset, PtzCommand, StreamInfo } from '../shared/types.js';
import { commandToReolinkOp } from '../shared/ptz.js';
import { requestBinary, requestJson } from './request.js';
import { OnvifClient } from './onvifClient.js';

type ReolinkEnvelope<T = unknown> = Array<{
  cmd: string;
  code: number;
  value?: T;
  error?: { detail?: string; rspCode?: number };
}>;

type DevInfoResponse = {
  DevInfo?: {
    name?: string;
    model?: string;
  };
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

type ZoomFocusResponse = {
  ZoomFocus?: {
    channel?: number;
    focus?: { pos?: number };
    zoom?: { pos?: number };
  };
};

export class ReolinkClient {
  private readonly sessions = new Map<string, { token: string; expiresAt: number; camera: CameraWithSecret }>();
  private readonly pendingLogins = new Map<string, Promise<string>>();
  private readonly apiOverrides = new Map<string, Pick<CameraWithSecret, 'protocol' | 'httpPort'>>();
  private readonly onvif = new OnvifClient();

  async testConnection(camera: CameraWithSecret): Promise<ConnectionStatus> {
    try {
      const token = await this.getToken(camera);
      const [presets, cameraName, streams] = await Promise.all([
        this.getPresets(camera, token),
        this.getCameraName(camera, token).catch(() => undefined),
        this.getStreamInfo(camera, token).catch(() => undefined),
      ]);
      return {
        ok: true,
        message: 'Connected',
        presets,
        streamUrl: buildRtspUrl(camera),
        cameraName,
        streams,
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

  async getCameraName(camera: CameraWithSecret, token?: string): Promise<string | undefined> {
    const sessionToken = token ?? (await this.getToken(camera));
    const response = await this.postWithTokenRetry<DevInfoResponse>(
      camera,
      [{ cmd: 'GetDevInfo', action: 0, param: {} }],
      sessionToken,
    );
    const info = response[0]?.value?.DevInfo;
    return (info?.name || info?.model)?.trim() || undefined;
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
      await this.startZoomFocus(camera, 'ZoomPos', zoomLevelPosition(command.level));
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

  async getZoomFocus(camera: CameraWithSecret): Promise<{ zoom?: number; focus?: number }> {
    const token = await this.getToken(camera);
    const response = await this.postWithTokenRetry<ZoomFocusResponse>(
      camera,
      [{ cmd: 'GetZoomFocus', action: 0, param: { channel: camera.channel } }],
      token,
    );
    const value = response[0]?.value?.ZoomFocus;
    return {
      zoom: value?.zoom?.pos,
      focus: value?.focus?.pos,
    };
  }

  async getSnapshot(camera: CameraWithSecret): Promise<{ bytes: Buffer; contentType: string }> {
    const token = await this.getToken(camera);
    const url = this.apiUrl(camera, 'Snap', token);
    url.searchParams.set('channel', String(camera.streamChannel ?? camera.channel));
    url.searchParams.set('rs', String(Date.now()));
    return requestBinary(url);
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

function zoomLevelPosition(level: 1 | 2 | 3 | 4): number {
  switch (level) {
    case 1:
      return 0;
    case 2:
      return 11;
    case 3:
      return 23;
    case 4:
      return 34;
  }
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
