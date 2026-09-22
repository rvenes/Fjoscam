import { app, safeStorage } from 'electron';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppState, CameraConfig, CameraInput, CameraSecret, CameraWithSecret } from '../shared/types.js';
import { cameraHttpOrigin, isHttpsTrust, isRtspsTrust, rtspsEndpoint, normalizeHost, validateCameraInput } from '../shared/validation.js';

type StoredCamera = CameraConfig & { streamUrl?: string }; // Read compatibility only; never write plaintext URLs.
type PersistedData = {
  activeCameraId: string | null;
  cameras: StoredCamera[];
  secrets: Record<string, string>;
  encryptedStreamUrls: Record<string, string>;
};

const defaultData: PersistedData = {
  activeCameraId: null,
  cameras: [],
  secrets: {},
  encryptedStreamUrls: {},
};

export class CameraStore {
  private readonly filePath: string;
  private readonly backupPath: string;
  private pendingWrite: Promise<unknown> = Promise.resolve();
  private recoveredFromBackup = false;
  private loadedFromBackup = false;

  constructor(baseDir: string = app.getPath('userData')) {
    this.filePath = join(baseDir, 'cameras.json');
    this.backupPath = join(baseDir, 'cameras.json.bak');
  }

  getState(): Promise<AppState> {
    return this.runExclusive(async () => this.stateOf(await this.readData()));
  }

  saveCamera(input: CameraInput, existingId?: string): Promise<AppState> {
    return this.runExclusive(async () => {
      const data = await this.readData();
      const previous = existingId ? data.cameras.find((camera) => camera.id === existingId) : undefined;
      if (existingId && !previous) throw new Error('Camera not found.');
      const keepStreamUrl = previous?.kind === 'generic' && Boolean(data.encryptedStreamUrls[previous.id]);
      const errors = validateCameraInput(input, {
        requirePassword: !previous || previous.kind === 'generic',
        requireStreamUrl: !keepStreamUrl,
      });
      if (errors.length > 0) throw new Error(errors.join(' '));
      if (input.rtspsTrust) {
        const streamUrl = input.streamUrl?.trim() || (previous && data.encryptedStreamUrls[previous.id]
          ? decryptSecret(data.encryptedStreamUrls[previous.id]).streamUrl : undefined);
        if (!streamUrl || rtspsEndpoint(streamUrl) !== input.rtspsTrust.origin) throw new Error('RTSPS certificate trust does not match the saved stream.');
      }

      const id = existingId ?? randomUUID();
      const camera: CameraConfig = {
        id,
        kind: input.kind ?? 'reolink',
        name: input.name.trim(),
        host: input.kind === 'generic'
          ? (input.streamUrl?.trim() ? new URL(input.streamUrl.trim()).hostname : previous!.host)
          : normalizeHost(input.host),
        protocol: input.protocol,
        httpPort: Number(input.httpPort),
        rtspPort: Number(input.rtspPort),
        username: input.username.trim(),
        channel: Number(input.channel),
        streamChannel: Number(input.streamChannel ?? input.channel),
        lowLatency: Boolean(input.lowLatency),
        lensMode: (input.kind ?? 'reolink') === 'reolink' ? input.lensMode ?? 'auto' : undefined,
        mjpegPath: input.mjpegPath?.trim() || undefined,
        ptzPath: input.ptzPath?.trim() || undefined,
        httpsTrust: input.httpsTrust ? { origin: input.httpsTrust.origin, fingerprint256: input.httpsTrust.fingerprint256 } : undefined,
        rtspsTrust: input.rtspsTrust ? { origin: input.rtspsTrust.origin, fingerprint256: input.rtspsTrust.fingerprint256 } : undefined,
        allowInsecureOnvif: (input.kind ?? 'reolink') === 'reolink' && input.allowInsecureOnvif === true,
        onvifPort: (input.kind ?? 'reolink') === 'reolink' ? input.onvifPort ?? 8000 : undefined,
      };

      const index = data.cameras.findIndex((item) => item.id === id);
      if (index >= 0) data.cameras[index] = camera;
      else data.cameras.push(camera);

      if (camera.kind === 'generic') {
        if (input.streamUrl?.trim()) data.encryptedStreamUrls[id] = encryptSecret({ password: '', streamUrl: input.streamUrl.trim() });
        if (!data.encryptedStreamUrls[id]) throw new Error('Stream URL is required.');
        // Generic streams authenticate through the URL; password input from a
        // previous camera type must not silently become this stream's password.
        delete data.secrets[id];
      } else if (input.password) {
        data.secrets[id] = encryptSecret({ password: input.password });
      } else if (!data.secrets[id]) {
        throw new Error('Camera password is missing.');
      }
      if (camera.kind !== 'generic') delete data.encryptedStreamUrls[id];
      data.activeCameraId = data.activeCameraId ?? id;
      await this.writeData(data);
      return this.stateOf(data);
    });
  }

  removeCamera(id: string): Promise<AppState> {
    return this.runExclusive(async () => {
      const data = await this.readData();
      data.cameras = data.cameras.filter((camera) => camera.id !== id);
      delete data.secrets[id];
      delete data.encryptedStreamUrls[id];
      if (data.activeCameraId === id) data.activeCameraId = data.cameras[0]?.id ?? null;
      await this.writeData(data);
      return this.stateOf(data);
    });
  }

  reorderCameras(ids: string[]): Promise<AppState> {
    return this.runExclusive(async () => {
      const data = await this.readData();
      const camerasById = new Map(data.cameras.map((camera) => [camera.id, camera]));
      if (!Array.isArray(ids) || ids.length !== data.cameras.length || new Set(ids).size !== ids.length || ids.some((id) => !camerasById.has(id))) {
        throw new Error('Camera order does not match saved cameras.');
      }
      if (!this.loadedFromBackup && ids.every((id, index) => data.cameras[index].id === id)) return this.stateOf(data);
      data.cameras = ids.map((id) => camerasById.get(id)!);
      await this.writeData(data);
      return this.stateOf(data);
    });
  }

  setActiveCamera(id: string): Promise<AppState> {
    return this.runExclusive(async () => {
      const data = await this.readData();
      if (!data.cameras.some((camera) => camera.id === id)) throw new Error('Camera not found.');
      if (!this.loadedFromBackup && data.activeCameraId === id) return this.stateOf(data);
      data.activeCameraId = id;
      await this.writeData(data);
      return this.stateOf(data);
    });
  }

  setStreamChannel(id: string, streamChannel: number): Promise<AppState> {
    return this.runExclusive(async () => {
      const data = await this.readData();
      const camera = data.cameras.find((item) => item.id === id);
      if (!camera) throw new Error('Camera not found.');
      if (!this.loadedFromBackup && camera.streamChannel === streamChannel) return this.stateOf(data);
      camera.streamChannel = streamChannel;
      await this.writeData(data);
      return this.stateOf(data);
    });
  }

  setStreamQuality(id: string, lowLatency: boolean): Promise<AppState> {
    return this.runExclusive(async () => {
      const data = await this.readData();
      const camera = data.cameras.find((item) => item.id === id);
      if (!camera) throw new Error('Camera not found.');
      if (!this.loadedFromBackup && camera.lowLatency === lowLatency) return this.stateOf(data);
      camera.lowLatency = lowLatency;
      await this.writeData(data);
      return this.stateOf(data);
    });
  }

  getCameraWithSecret(id: string): Promise<CameraWithSecret> {
    return this.runExclusive(async () => {
      const data = await this.readData();
      const camera = data.cameras.find((item) => item.id === id);
      if (!camera) throw new Error('Camera not found.');
      if (camera.kind === 'generic') {
        const encrypted = data.encryptedStreamUrls[id];
        const streamUrl = encrypted ? decryptSecret(encrypted).streamUrl : undefined;
        if (!streamUrl) throw new Error('Saved stream URL is unavailable. Enter it again in camera settings.');
        return { ...camera, password: '', streamUrl };
      }
      const encrypted = data.secrets[id];
      if (!encrypted) throw new Error('Camera password is missing.');
      return { ...camera, ...decryptSecret(encrypted) };
    });
  }

  private stateOf(data: PersistedData): AppState {
    return {
      cameras: data.cameras.map(({ streamUrl: _secret, ...camera }) => ({
        ...camera, hasStreamUrl: camera.kind === 'generic' && Boolean(data.encryptedStreamUrls[camera.id]),
      })),
      activeCameraId: data.activeCameraId,
      ...(this.recoveredFromBackup ? { configurationNotice: 'recovered-from-backup' as const } : {}),
    };
  }

  // Serializes read-modify-write cycles so concurrent IPC calls cannot lose updates.
  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.pendingWrite.then(task, task);
    this.pendingWrite = next.catch(() => undefined);
    return next;
  }

  private async readData(): Promise<PersistedData> {
    this.loadedFromBackup = false;
    const main = await readPersistedFile(this.filePath);
    const backup = await readPersistedFile(this.backupPath);
    // Prepare and round-trip verify ALL encryption before replacing either file.
    // Backup keeps its own historical content, not a copy of today's camera list.
    const mainChanged = main ? protectStreamUrls(main) : false;
    const backupChanged = backup ? protectStreamUrls(backup) : false;
    if (backupChanged) await writeAtomicData(this.backupPath, backup!);
    if (mainChanged) {
      if (!backup && !await fileExists(this.backupPath)) await writeAtomicData(this.backupPath, main!);
      await writeAtomicData(this.filePath, main!);
    }
    if (main) return migrateData(main);
    if (backup) {
      // Keep this notice for the session: an ordinary camera selection may
      // write a valid main file before the user has seen the recovery warning.
      this.recoveredFromBackup = true;
      this.loadedFromBackup = true;
      return migrateData(backup);
    }
    // Only a genuinely new installation may start empty. Never overwrite
    // unreadable/corrupt user data with a seemingly successful empty config.
    if (await fileExists(this.filePath) || await fileExists(this.backupPath)) {
      throw new Error('Camera configuration and backup could not be read. Preserve both files and restore a valid backup.');
    }
    return { ...defaultData, cameras: [], secrets: {}, encryptedStreamUrls: {} };
  }

  private async writeData(data: PersistedData): Promise<void> {
    await writeAtomicData(this.filePath, data, () => this.backupCurrentFile());
  }

  // Only a valid main file may overwrite the backup, so a corrupt main file
  // never destroys the last known-good copy.
  private async backupCurrentFile(): Promise<void> {
    const current = await readPersistedFile(this.filePath);
    if (!current) return;
    // Never copy a legacy URL into a new plaintext backup, even if a config was
    // restored externally after this operation's initial read.
    protectStreamUrls(current);
    try {
      await writeAtomicData(this.backupPath, current);
    } catch {
      // Preserve the existing backup if its atomic replacement is unavailable.
    }
  }
}

async function readPersistedFile(path: string): Promise<PersistedData | undefined> {
  try {
    const contents = await readFile(path, 'utf8');
    const parsed = JSON.parse(contents) as Partial<PersistedData>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cameras)) return undefined;
    if (parsed.cameras.some((camera) => !isStoredCamera(camera))) return undefined;
    const ids = new Set(parsed.cameras.map((camera) => camera.id));
    if (ids.size !== parsed.cameras.length) return undefined;
    if (parsed.activeCameraId != null && (typeof parsed.activeCameraId !== 'string' || !ids.has(parsed.activeCameraId))) return undefined;
    if (parsed.secrets !== undefined && (!parsed.secrets || typeof parsed.secrets !== 'object' || Array.isArray(parsed.secrets) ||
        Object.values(parsed.secrets).some((secret) => typeof secret !== 'string'))) return undefined;
    if (parsed.encryptedStreamUrls !== undefined && (!parsed.encryptedStreamUrls || typeof parsed.encryptedStreamUrls !== 'object' || Array.isArray(parsed.encryptedStreamUrls) ||
        Object.values(parsed.encryptedStreamUrls).some((secret) => typeof secret !== 'string'))) return undefined;
    return { ...defaultData, ...parsed, secrets: { ...parsed.secrets }, encryptedStreamUrls: { ...parsed.encryptedStreamUrls } } as PersistedData;
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error('Camera configuration is not accessible. No changes were saved.', { cause: error });
  }
}

function migrateData(data: PersistedData): PersistedData {
  data.cameras = data.cameras.map((camera) => ({
    ...camera,
    kind: camera.kind ?? 'reolink',
    streamChannel: camera.streamChannel ?? camera.channel ?? 0,
    mjpegPath: camera.kind === 'panasonic' ? camera.mjpegPath ?? '/nphMotionJpeg?Resolution=640x480&Quality=Standard' : camera.mjpegPath,
    ptzPath: camera.kind === 'panasonic' ? camera.ptzPath ?? '/nphControlCamera' : camera.ptzPath,
  }));
  return data;
}

// fs.rename replaces the destination atomically on both Windows and macOS, but
// Windows can fail transiently (EPERM/EBUSY) when antivirus or a reader holds
// the file. Retry briefly, then fail without truncating the destination.
async function replaceFile(from: string, to: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY' && code !== 'EEXIST') throw error;
      await sleep(50 * (attempt + 1));
    }
  }
  throw lastError;
}

function isStoredCamera(value: unknown): value is StoredCamera {
  if (!value || typeof value !== 'object') return false;
  const camera = value as StoredCamera;
  if (camera.lensMode !== undefined && !['auto', 'single', 'dual'].includes(camera.lensMode)) return false;
  if (camera.rtspsTrust !== undefined && (camera.kind !== 'generic' || !isRtspsTrust(camera.rtspsTrust))) return false;
  if (camera.allowInsecureOnvif !== undefined && typeof camera.allowInsecureOnvif !== 'boolean') return false;
  if (camera.allowInsecureOnvif === true && camera.kind !== undefined && camera.kind !== 'reolink') return false;
  if (camera.onvifPort !== undefined && (!Number.isInteger(camera.onvifPort) || camera.onvifPort < 1 || camera.onvifPort > 65535)) return false;
  if (camera.httpsTrust !== undefined) {
    try {
      if (camera.kind === 'generic' || !isHttpsTrust(camera.httpsTrust) || camera.protocol !== 'https' || camera.httpsTrust.origin !== cameraHttpOrigin(camera)) return false;
    } catch { return false; }
  }
  return typeof camera.id === 'string' && camera.id.length > 0 &&
    [camera.name, camera.host, camera.username].every((field) => typeof field === 'string') &&
    (camera.kind === undefined || ['reolink', 'panasonic', 'generic'].includes(camera.kind)) &&
    ['http', 'https'].includes(camera.protocol) &&
    [camera.httpPort, camera.rtspPort].every((port) => Number.isInteger(port) && port > 0 && port <= 65535) &&
    Number.isInteger(camera.channel) && camera.channel >= 0 &&
    (camera.streamChannel === undefined || (Number.isInteger(camera.streamChannel) && camera.streamChannel >= 0)) &&
    [camera.streamUrl, camera.mjpegPath, camera.ptzPath].every((field) => field === undefined || typeof field === 'string');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new Error('Camera configuration is not accessible. No changes were saved.', { cause: error });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encryptSecret(secret: CameraSecret): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS credential encryption is not available on this machine.');
  }
  try {
    const plaintext = JSON.stringify(secret);
    const encrypted = safeStorage.encryptString(plaintext);
    if (safeStorage.decryptString(encrypted) !== plaintext) throw new Error();
    return encrypted.toString('base64');
  } catch {
    throw new Error('OS credential encryption failed. Camera data was not saved.');
  }
}

function decryptSecret(value: string): CameraSecret {
  try {
    const secret = JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64'))) as CameraSecret;
    if (!secret || typeof secret.password !== 'string' || (secret.streamUrl !== undefined && typeof secret.streamUrl !== 'string')) throw new Error();
    return secret;
  } catch {
    throw new Error('Saved camera credentials could not be decrypted on this OS account. Enter them again in camera settings.');
  }
}

function protectStreamUrls(data: PersistedData): boolean {
  let changed = false;
  for (const camera of data.cameras) {
    if (camera.streamUrl === undefined) continue;
    if (camera.streamUrl) data.encryptedStreamUrls[camera.id] = encryptSecret({ password: '', streamUrl: camera.streamUrl });
    delete camera.streamUrl;
    changed = true;
  }
  return changed;
}

async function writeAtomicData(path: string, data: PersistedData, beforeReplace?: () => Promise<void>): Promise<void> {
  if (data.cameras.some((camera) => camera.streamUrl !== undefined)) throw new Error('Refusing to persist an unprotected stream URL.');
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tempPath = `${path}.${randomUUID()}.tmp`;
  try {
    const handle = await open(tempPath, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(data, null, 2), 'utf8');
      await handle.sync();
    } finally { await handle.close(); }
    if (!await readPersistedFile(tempPath)) throw new Error('Camera configuration validation failed.');
    await beforeReplace?.();
    await replaceFile(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
