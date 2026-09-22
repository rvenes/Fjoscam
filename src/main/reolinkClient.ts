import type {
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
import { isReolinkCamera } from '../shared/cameraControls.js';
import { requestBinary, requestJson } from './request.js';
import type { CameraConfig } from '../shared/types.js';
import { OnvifClient } from './onvifClient.js';
import { normalizeCapabilities } from './reolinkCapabilities.js';
import { parseChannelStatus, parseDeviceInfo, parsePresets, parseStreamInfo } from './reolinkMetadata.js';
import { isCameraAuthenticationError, isCameraLoginRejection, ReolinkApiError } from './cameraErrors.js';

type ReolinkEnvelope<T = unknown> = Array<{
  cmd: string;
  code: number;
  value?: T;
  range?: T;
  initial?: T;
  error?: { detail?: string; rspCode?: number };
}>;

type DevInfoResponse = { DevInfo?: unknown };

type AbilityResponse = {
  Ability?: Record<string, unknown>;
};

type ChannelStatusResponse = { ChannelStatus?: unknown };

type EncResponse = {
  Enc?: {
    mainStream?: unknown;
    subStream?: unknown;
  };
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
  private readonly currentConfigurations = new Map<string, string | null>();
  private readonly sessions = new Map<string, { token: string; expiresAt: number; camera: CameraWithSecret }>();
  private readonly pendingLogins = new Map<string, { cameraId: string; promise: Promise<string> }>();
  private readonly sessionScopes = new Map<string, object>();
  private readonly configurationRevisions = new Map<string, number>();
  private readonly loginFailures = new Map<string, { key: string; retryAt: number; error: Error }>();
  private readonly apiOverrides = new Map<string, { key: string; endpoint: Pick<CameraWithSecret, 'protocol' | 'httpPort'> }>();
  private readonly zoomRanges = new Map<string, { key: string; range: ZoomRange; expires: number }>();
  private readonly onvif = new OnvifClient();
  private readonly onvifMovement = new Set<string>();

  // Do not send Logout with the old trust policy after a save/removal. Retire
  // those tokens locally; the camera expires them. Also reject delayed work
  // carrying the previous endpoint or certificate exception.
  updateCameraConfiguration(id: string, camera?: CameraConfig): void {
    this.currentConfigurations.set(id, camera ? endpointConfigKey(camera) : null);
    this.configurationRevisions.set(id, (this.configurationRevisions.get(id) ?? 0) + 1);
    this.sessionScopes.delete(id);
    this.loginFailures.delete(id);
    for (const [key, pending] of this.pendingLogins) {
      if (pending.cameraId === id) this.pendingLogins.delete(key);
    }
    for (const [key, session] of this.sessions) {
      if (session.camera.id === id) this.sessions.delete(key);
    }
    this.apiOverrides.delete(id);
    this.zoomRanges.delete(id);
    this.onvif.updateCameraConfiguration(id, camera);
    this.onvifMovement.delete(id);
  }

  private assertCurrentConfiguration(camera: CameraConfig): void {
    if (!isReolinkCamera(camera)) throw new Error('This camera does not support Reolink API controls.');
    if (this.currentConfigurations.has(camera.id) && this.currentConfigurations.get(camera.id) !== endpointConfigKey(camera)) {
      throw new Error('Camera configuration changed. Retry using the saved settings.');
    }
  }

  async testConnection(camera: CameraWithSecret): Promise<ConnectionStatus> {
    try {
      const token = await this.getToken(camera);
      const profile = await this.getProfile(camera, token).catch(() => undefined);
      const profileName = (profile?.device?.name || profile?.device?.model)?.trim() || undefined;
      const [presets, cameraName, streams] = await Promise.all([
        profile?.capabilities.presets ? this.getPresets(camera, token).catch(() => []) : Promise.resolve([]),
        profileName ? Promise.resolve(profileName) : this.getCameraName(camera, token).catch(() => undefined),
        this.getStreamInfo(camera, token).catch(() => undefined),
      ]);
      return {
        ok: true,
        scope: 'api',
        message: 'Camera API connected',
        presets,
        cameraName,
        streams,
        profile,
      };
    } catch (error) {
      return {
        ok: false,
        scope: 'api',
        message: error instanceof Error ? error.message : 'Unknown connection error',
      };
    }
  }

  async getPresets(camera: CameraWithSecret, token?: string): Promise<Preset[]> {
    const sessionToken = token ?? (await this.getToken(camera));
    const response = await this.postWithTokenRetry<{ PtzPreset?: unknown }>(
      camera,
      [{ cmd: 'GetPtzPreset', action: 0, param: { channel: camera.channel } }],
      sessionToken,
    );
    return parsePresets(response[0]?.value?.PtzPreset);
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
      capabilities: normalizeCapabilities(ability, camera.channel),
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
    return parseDeviceInfo(response[0]?.value?.DevInfo);
  }

  async getChannelStatus(camera: CameraWithSecret, token?: string): Promise<CameraChannelStatus[]> {
    const sessionToken = token ?? (await this.getToken(camera));
    const response = await this.postWithTokenRetry<ChannelStatusResponse>(
      camera,
      [{ cmd: 'GetChannelStatus', action: 0, param: {} }],
      sessionToken,
    );
    return parseChannelStatus(response[0]?.value?.ChannelStatus);
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
      high: parseStreamInfo('high', enc?.mainStream),
      low: parseStreamInfo('low', enc?.subStream),
    };
  }

  async sendPtz(camera: CameraWithSecret, command: PtzCommand, current: () => boolean = () => true): Promise<void> {
    this.assertCurrentConfiguration(camera);
    // An API success does not establish that an ONVIF movement was stopped.
    // Remember even an uncertain move (e.g. response timed out) for safety.
    if (command.kind === 'stop' && this.onvifMovement.has(camera.id)) {
      await this.onvif.sendPtz(camera, command, current);
      this.onvifMovement.delete(camera.id);
      return;
    }
    if (command.kind === 'zoomLevel') {
      const active = this.operationCurrent(camera, current);
      const range = await this.getZoomRange(camera, active);
      if (!active()) return;
      await this.startZoomFocus(camera, 'ZoomPos', zoomLevelPosition(command.level, range), active);
      return;
    }
    if (command.kind === 'zoomPosition') {
      await this.setZoomPosition(camera, command.position, current);
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
      if (!current()) return;
      await this.postWithTokenRetry(camera, [{ cmd: 'PtzCtrl', action: 0, param }], token, current);
    } catch (error) {
      if (!current()) return;
      if (!shouldFallbackToOnvif(error)) throw error;
      this.assertCurrentConfiguration(camera);
      if (camera.allowInsecureOnvif !== true) {
        throw new Error('Reolink PTZ failed. Unencrypted ONVIF fallback is disabled; enable it in camera settings only on a trusted local network.');
      }
      if (['move', 'zoom', 'preset'].includes(command.kind)) this.onvifMovement.add(camera.id);
      await this.onvif.sendPtz(camera, command, current);
    }
  }

  private operationCurrent(camera: CameraWithSecret, current: () => boolean): () => boolean {
    const revision = this.configurationRevisions.get(camera.id) ?? 0;
    const scope = this.sessionScope(camera.id);
    return () => current() && (this.configurationRevisions.get(camera.id) ?? 0) === revision && this.sessionScopes.get(camera.id) === scope;
  }

  async getZoomFocus(camera: CameraWithSecret, current: () => boolean = () => true): Promise<ZoomFocusState> {
    const active = this.operationCurrent(camera, current);
    const token = await this.getToken(camera);
    const response = await this.postWithTokenRetry<ZoomFocusResponse>(
      camera,
      [{ cmd: 'GetZoomFocus', action: 1, param: { channel: camera.channel } }],
      token,
      active,
    ).catch(() =>
      this.postWithTokenRetry<ZoomFocusResponse>(
        camera,
        [{ cmd: 'GetZoomFocus', action: 0, param: { channel: camera.channel } }],
        token,
        active,
      ),
    );
    if (!active()) throw new Error('Camera command was cancelled.');
    const state = parseZoomFocus(response[0]);
    if (state.zoomRange) {
      this.zoomRanges.delete(camera.id);
      this.zoomRanges.set(camera.id, { key: zoomRangeKey(camera), range: { ...state.zoomRange }, expires: Date.now() + 5 * 60_000 });
      while (this.zoomRanges.size > 128) this.zoomRanges.delete(this.zoomRanges.keys().next().value!);
    }
    return state;
  }

  // Moves the optical zoom to an absolute position (clamped to the camera's own
  // range) and waits for the motor to settle so the caller gets the real end position.
  async setZoomPosition(camera: CameraWithSecret, position: number, current: () => boolean = () => true): Promise<ZoomFocusState> {
    const active = this.operationCurrent(camera, current);
    const range = await this.getZoomRange(camera, active);
    const target = clampZoomPosition(position, range);
    await this.startZoomFocus(camera, 'ZoomPos', target, active);
    return this.waitForZoomToSettle(camera, target, active);
  }

  private async getZoomRange(camera: CameraWithSecret, current: () => boolean): Promise<ZoomRange> {
    this.assertCurrentConfiguration(camera);
    if (!current()) throw new Error('Camera command was cancelled.');
    const cached = this.zoomRanges.get(camera.id);
    if (cached?.key === zoomRangeKey(camera) && cached.expires > Date.now()) return cached.range;
    this.zoomRanges.delete(camera.id);
    const state = await this.getZoomFocus(camera, current).catch(() => undefined);
    this.assertCurrentConfiguration(camera);
    if (!current()) throw new Error('Camera command was cancelled.');
    return state?.zoomRange ?? DEFAULT_ZOOM_RANGE;
  }

  private async waitForZoomToSettle(camera: CameraWithSecret, target: number, current: () => boolean): Promise<ZoomFocusState> {
    let last: ZoomFocusState = {};
    let previous: number | undefined;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      await sleep(300);
      if (!current()) throw new Error('Camera command was cancelled.');
      last = await this.getZoomFocus(camera, current).catch(() => ({}));
      if (!current()) throw new Error('Camera command was cancelled.');
      if (last.zoom === target) return last;
      // Some models stop short of the requested position; treat two identical
      // readings as settled.
      if (typeof last.zoom === 'number' && last.zoom === previous) return last;
      previous = last.zoom;
    }
    return last;
  }

  async getSnapshot(camera: CameraWithSecret, signal?: AbortSignal): Promise<{ bytes: Buffer; contentType: string }> {
    if (signal?.aborted) throw new Error('Camera snapshot was cancelled.');
    const scope = this.sessionScope(camera.id);
    const token = await this.getToken(camera);
    return this.withTokenRetry(camera, token, async (sessionToken) => {
      this.assertCurrentConfiguration(camera);
      const url = this.apiUrl(camera, 'Snap', sessionToken);
      url.searchParams.set('channel', String(camera.streamChannel ?? camera.channel));
      url.searchParams.set('rs', String(Date.now()));
      const frame = await requestBinary(url, 2, camera.httpsTrust, signal);
      // Some firmware returns a JSON error with HTTP 200 and text/html (or
      // even image/jpeg). Sniff small JSON envelopes, never scan image text.
      if (frame.bytes.length <= 64 * 1024 && /^\s*\[/.test(frame.bytes.subarray(0, 64).toString('utf8'))) {
        let payload: unknown;
        try { payload = JSON.parse(frame.bytes.toString('utf8')); }
        catch { throw new Error('Camera returned an invalid snapshot response.'); }
        assertApiResponse(payload);
        throw new Error('Camera returned an API response instead of a snapshot.');
      }
      return frame;
    }, () => !signal?.aborted && this.sessionScopes.get(camera.id) === scope);
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
    this.sessionScopes.clear();
    this.zoomRanges.clear();
    await Promise.allSettled(
      sessions.map((session) =>
        this.post(session.camera, [{ cmd: 'Logout', action: 0, param: {} }], session.token).catch(() => undefined),
      ),
    );
  }

  async logoutExcept(cameraId: string): Promise<void> {
    for (const id of this.sessionScopes.keys()) {
      if (id !== cameraId) this.sessionScopes.delete(id);
    }
    for (const [key, pending] of this.pendingLogins) {
      if (pending.cameraId !== cameraId) this.pendingLogins.delete(key);
    }
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
    this.assertCurrentConfiguration(camera);
    this.sessionScope(camera.id);
    const configurationRevision = this.configurationRevisions.get(camera.id);
    const key = sessionKey(camera);
    const cached = this.sessions.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const failure = this.loginFailures.get(camera.id);
    if (failure?.key === key && failure.retryAt > Date.now()) throw failure.error;
    this.loginFailures.delete(camera.id);

    const pending = this.pendingLogins.get(key);
    if (pending) return pending.promise;

    const login: Promise<string> = this.login(camera)
      .then(async ({ token, expiresAt }) => {
        this.assertCurrentConfiguration(camera);
        if (this.configurationRevisions.get(camera.id) !== configurationRevision) {
          throw new Error('Camera configuration changed. Retry using the saved settings.');
        }
        if (this.pendingLogins.get(key)?.promise !== login) {
          await this.post(camera, [{ cmd: 'Logout', action: 0, param: {} }], token).catch(() => undefined);
          throw new Error('Camera login was cancelled.');
        }
        this.sessions.set(key, { token, expiresAt, camera });
        return token;
      })
      .catch((error: unknown) => {
        // Bound repeated bad-password/locked-login attempts from MJPEG polling.
        if (this.pendingLogins.get(key)?.promise === login && isCameraLoginRejection(error) && error instanceof Error) {
          this.loginFailures.set(camera.id, { key, retryAt: Date.now() + 30_000, error });
        }
        throw error;
      })
      .finally(() => {
        if (this.pendingLogins.get(key)?.promise === login) this.pendingLogins.delete(key);
      });

    this.pendingLogins.set(key, { cameraId: camera.id, promise: login });
    return login;
  }

  private async login(camera: CameraWithSecret): Promise<{ token: string; expiresAt: number }> {
    const startedAt = Date.now();
    const response = await this.post<{ Token?: { name?: string; leaseTime?: unknown } }>(camera, [
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
    if (typeof token !== 'string' || !token.trim()) throw new Error('Camera login succeeded but no token was returned.');
    const lease = response[0]?.value?.Token?.leaseTime;
    // Older firmware may omit leaseTime. Preserve the previous fallback then;
    // otherwise expire conservatively before the camera's reported deadline.
    const lifetime = typeof lease === 'number' && Number.isFinite(lease) && lease > 0
      ? Math.min(lease * 1000, 24 * 60 * 60 * 1000) : 25 * 60 * 1000;
    return { token, expiresAt: startedAt + lifetime - Math.min(30_000, lifetime * 0.1) };
  }

  private async postWithTokenRetry<T>(
    camera: CameraWithSecret,
    body: Array<{ cmd: string; action?: number; param?: unknown }>,
    token: string,
    current: () => boolean = () => true,
  ): Promise<ReolinkEnvelope<T>> {
    return this.withTokenRetry(camera, token, (sessionToken) => this.post<T>(camera, body, sessionToken, current), current);
  }

  private sessionScope(id: string): object {
    let scope = this.sessionScopes.get(id);
    if (!scope) { scope = {}; this.sessionScopes.set(id, scope); }
    return scope;
  }

  private async withTokenRetry<T>(
    camera: CameraWithSecret,
    token: string,
    request: (token: string) => Promise<T>,
    current: () => boolean = () => true,
  ): Promise<T> {
    const scope = this.sessionScope(camera.id);
    const assertCurrent = () => {
      this.assertCurrentConfiguration(camera);
      if (!current() || this.sessionScopes.get(camera.id) !== scope) throw new Error('Camera command was cancelled.');
    };
    const invalidate = (failedToken: string) => {
      const key = sessionKey(camera);
      if (this.sessions.get(key)?.token === failedToken) this.sessions.delete(key);
    };
    assertCurrent();
    try {
      const result = await request(token);
      assertCurrent();
      return result;
    } catch (error) {
      assertCurrent();
      if (!isCameraAuthenticationError(error)) throw error;
      // A delayed rejection of an old token must not evict a newer session.
      invalidate(token);
      const refreshedToken = await this.getToken(camera);
      assertCurrent();
      try {
        const result = await request(refreshedToken);
        assertCurrent();
        return result;
      } catch (retryError) {
        assertCurrent();
        if (isCameraAuthenticationError(retryError)) {
          const key = sessionKey(camera);
          if (this.sessions.get(key)?.token === refreshedToken && retryError instanceof Error) {
            this.loginFailures.set(camera.id, { key, retryAt: Date.now() + 30_000, error: retryError });
          }
          invalidate(refreshedToken);
        }
        throw retryError;
      }
    }
  }

  private async post<T>(
    camera: CameraWithSecret,
    body: Array<{ cmd: string; action?: number; param?: unknown }>,
    token?: string,
    current: () => boolean = () => true,
  ): Promise<ReolinkEnvelope<T>> {
    this.assertCurrentConfiguration(camera);
    if (!current()) throw new Error('Camera command was cancelled.');
    const url = this.apiUrl(camera, body[0]?.cmd ?? '', token);
    const payload = await this.requestApi<ReolinkEnvelope<T>>(camera, url, body, current);
    assertApiResponse(payload);
    return payload;
  }

  private async startZoomFocus(camera: CameraWithSecret, op: 'ZoomPos' | 'FocusPos', pos: number, current: () => boolean): Promise<void> {
    const active = this.operationCurrent(camera, current);
    if (!active()) throw new Error('Camera command was cancelled.');
    const token = await this.getToken(camera);
    try {
      await this.postWithTokenRetry(
        camera,
        [{ cmd: 'StartZoomFocus', action: 0, param: { ZoomFocus: { channel: camera.channel, op, pos } } }],
        token,
        active,
      );
    } catch (error) {
      if (isAbilityError(error)) {
        throw new Error('Kameraet krev admin-brukar for direkte zoom/fokus-nivå.');
      }
      throw error;
    }
  }

  private apiUrl(camera: CameraWithSecret, command: string, token?: string): URL {
    const cached = this.apiOverrides.get(camera.id);
    const endpoint = cached?.key === endpointConfigKey(camera) ? cached.endpoint : camera;
    const url = new URL(`${endpoint.protocol}://${camera.host}:${endpoint.httpPort}/cgi-bin/api.cgi`);
    url.searchParams.set('cmd', command);
    if (token) url.searchParams.set('token', token);
    return url;
  }

  private async requestApi<T>(camera: CameraWithSecret, url: URL, body: unknown, current: () => boolean = () => true): Promise<T> {
    try {
      return await requestJson<T>(url, body, 2, camera.httpsTrust);
    } catch (error) {
      if (!isRetryableEndpointError(error)) throw error;

      let lastError = error;
      for (const endpoint of apiFallbacks(camera)) {
        this.assertCurrentConfiguration(camera);
        if (!current()) throw new Error('Camera command was cancelled.');
        if (`${endpoint.protocol}:${endpoint.httpPort}` === endpointKeyFromUrl(url)) continue;

        this.apiOverrides.set(camera.id, { key: endpointConfigKey(camera), endpoint });
        const fallbackUrl = this.apiUrl(camera, url.searchParams.get('cmd') ?? '', url.searchParams.get('token') ?? undefined);
        try {
          return await requestJson<T>(fallbackUrl, body, 2, camera.httpsTrust);
        } catch (fallbackError) {
          lastError = fallbackError;
          if (!isRetryableEndpointError(fallbackError)) break;
        }
      }

      if (this.apiOverrides.get(camera.id)?.key === endpointConfigKey(camera)) this.apiOverrides.delete(camera.id);
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
  return typeof pos === 'number' && Number.isSafeInteger(pos) && pos >= 0 ? pos : undefined;
}

function parseRange(pos?: number | { min?: number; max?: number }): ZoomRange | undefined {
  if (!pos || typeof pos !== 'object') return undefined;
  const { min, max } = pos;
  if (typeof min !== 'number' || typeof max !== 'number' || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || max <= min) return undefined;
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
  return `${endpointConfigKey(camera)}:${camera.username}`;
}

function endpointConfigKey(camera: CameraConfig): string {
  return JSON.stringify([camera.id, camera.protocol, camera.host, camera.httpPort, camera.httpsTrust?.origin, camera.httpsTrust?.fingerprint256,
    camera.allowInsecureOnvif === true, camera.onvifPort ?? 8000]);
}

function apiFallbacks(camera: CameraWithSecret): Array<Pick<CameraWithSecret, 'protocol' | 'httpPort'>> {
  const candidates: Array<Pick<CameraWithSecret, 'protocol' | 'httpPort'>> = [
    { protocol: 'https', httpPort: 443 },
    { protocol: 'http', httpPort: 80 },
  ];
  return candidates.filter((candidate, index, all) =>
    !(camera.protocol === 'https' && candidate.protocol === 'http') &&
    all.findIndex((item) => item.protocol === candidate.protocol && item.httpPort === candidate.httpPort) === index &&
    !(candidate.protocol === camera.protocol && candidate.httpPort === camera.httpPort),
  );
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
  if (isCameraLoginRejection(error) || isAbilityError(error)) return false;
  return (
    isRetryableEndpointError(error) ||
    (error instanceof Error && /timed out|ECONNRESET|ECONNREFUSED|Camera HTTP 40[134]|Camera HTTP 50|set config failed|Reolink API rejected request/i.test(error.message))
  );
}

function isAbilityError(error: unknown): boolean {
  return error instanceof ReolinkApiError && error.abilityDenied;
}

function zoomRangeKey(camera: CameraWithSecret): string {
  return JSON.stringify([endpointConfigKey(camera), camera.channel]);
}

function assertApiResponse(payload: unknown): asserts payload is ReolinkEnvelope {
  if (!Array.isArray(payload) || payload.length === 0) throw new Error('Camera returned an invalid API response.');
  for (const item of payload) {
    if (!item || typeof item !== 'object' || typeof item.code !== 'number') {
      throw new Error('Camera returned an invalid API response.');
    }
    // The vendor guide also shows error envelopes with top-level code: 0.
    if (item.code !== 0 || item.error) throw new ReolinkApiError(item.error?.rspCode, item.error?.detail);
  }
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
  return { mode, options: options.length > 0 ? [...new Set(options)] : ['auto', 'on', 'off'] };
}

export function normalizeWhiteLed(value?: WhiteLedResponse['WhiteLed']): WhiteLedState {
  const brightness = [value?.bright, value?.brightness, value?.Bright]
    .find((candidate) => typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 && candidate <= 100);
  const rawMode = typeof value?.mode === 'number' ? value.mode
    : typeof value?.mode === 'string' && /^\d+$/.test(value.mode) ? Number(value.mode) : undefined;
  const mode = rawMode !== undefined && Number.isSafeInteger(rawMode) && rawMode >= 0 ? rawMode : undefined;
  return {
    // `mode` is the actual configuration; `state` is only a status field on
    // several firmwares. mode 0 = off, 1 = auto at night, 3 = schedule.
    enabled: mode !== undefined
      ? mode !== 0
      : value?.state === 1 || value?.state === 'On' || value?.state === 'on',
    brightness,
    mode,
    supportsModes: mode !== undefined,
    supportsBrightness: brightness !== undefined,
  };
}

function normalizeIrMode(value: unknown): IrLightMode | undefined {
  const normalized = typeof value === 'string' ? value.toLowerCase() : undefined;
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
