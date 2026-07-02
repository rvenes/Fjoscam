import { app, safeStorage } from 'electron';
import { copyFile, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppState, CameraConfig, CameraInput, CameraSecret, CameraWithSecret } from '../shared/types.js';
import { normalizeHost, validateCameraInput } from '../shared/validation.js';

type PersistedData = {
  activeCameraId: string | null;
  cameras: CameraConfig[];
  secrets: Record<string, string>;
};

const defaultData: PersistedData = {
  activeCameraId: null,
  cameras: [],
  secrets: {},
};

export class CameraStore {
  private readonly filePath: string;
  private readonly backupPath: string;
  private pendingWrite: Promise<unknown> = Promise.resolve();

  constructor(baseDir: string = app.getPath('userData')) {
    this.filePath = join(baseDir, 'cameras.json');
    this.backupPath = join(baseDir, 'cameras.json.bak');
  }

  async getState(): Promise<AppState> {
    const data = await this.readData();
    return { cameras: data.cameras, activeCameraId: data.activeCameraId };
  }

  saveCamera(input: CameraInput, existingId?: string): Promise<AppState> {
    return this.runExclusive(async () => {
      const errors = validateCameraInput(input, { requirePassword: !existingId });
      if (errors.length > 0) throw new Error(errors.join(' '));

      const data = await this.readData();
      const id = existingId ?? randomUUID();
      const camera: CameraConfig = {
        id,
        kind: input.kind ?? 'reolink',
        name: input.name.trim(),
        host: normalizeHost(input.host),
        protocol: input.protocol,
        httpPort: Number(input.httpPort),
        rtspPort: Number(input.rtspPort),
        username: input.username.trim(),
        channel: Number(input.channel),
        streamChannel: Number(input.streamChannel ?? input.channel),
        lowLatency: Boolean(input.lowLatency),
        mjpegPath: input.mjpegPath?.trim() || undefined,
        ptzPath: input.ptzPath?.trim() || undefined,
        streamUrl: input.streamUrl?.trim() || undefined,
      };

      const index = data.cameras.findIndex((item) => item.id === id);
      if (index >= 0) data.cameras[index] = camera;
      else data.cameras.push(camera);

      if (input.password) {
        data.secrets[id] = encryptSecret({ password: input.password });
      } else if (camera.kind === 'generic') {
        delete data.secrets[id];
      } else if (!data.secrets[id]) {
        throw new Error('Camera password is missing.');
      }
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
      if (data.activeCameraId === id) data.activeCameraId = data.cameras[0]?.id ?? null;
      await this.writeData(data);
      return this.stateOf(data);
    });
  }

  reorderCameras(ids: string[]): Promise<AppState> {
    return this.runExclusive(async () => {
      const data = await this.readData();
      const camerasById = new Map(data.cameras.map((camera) => [camera.id, camera]));
      if (ids.length !== data.cameras.length || ids.some((id) => !camerasById.has(id))) {
        throw new Error('Camera order does not match saved cameras.');
      }
      data.cameras = ids.map((id) => camerasById.get(id)!);
      await this.writeData(data);
      return this.stateOf(data);
    });
  }

  setActiveCamera(id: string): Promise<AppState> {
    return this.runExclusive(async () => {
      const data = await this.readData();
      if (!data.cameras.some((camera) => camera.id === id)) throw new Error('Camera not found.');
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
      camera.lowLatency = lowLatency;
      await this.writeData(data);
      return this.stateOf(data);
    });
  }

  async getCameraWithSecret(id: string): Promise<CameraWithSecret> {
    const data = await this.readData();
    const camera = data.cameras.find((item) => item.id === id);
    if (!camera) throw new Error('Camera not found.');
    const encrypted = data.secrets[id];
    if (!encrypted && camera.kind === 'generic') return { ...camera, password: '' };
    if (!encrypted) throw new Error('Camera password is missing.');
    return { ...camera, ...decryptSecret(encrypted) };
  }

  private stateOf(data: PersistedData): AppState {
    return { cameras: data.cameras, activeCameraId: data.activeCameraId };
  }

  // Serializes read-modify-write cycles so concurrent IPC calls cannot lose updates.
  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.pendingWrite.then(task, task);
    this.pendingWrite = next.catch(() => undefined);
    return next;
  }

  private async readData(): Promise<PersistedData> {
    const main = await readPersistedFile(this.filePath);
    if (main) return migrateData(main);
    const backup = await readPersistedFile(this.backupPath);
    if (backup) return migrateData(backup);
    return { ...defaultData, cameras: [], secrets: {} };
  }

  private async writeData(data: PersistedData): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    const tempPath = join(dir, `cameras.json.${randomUUID()}.tmp`);
    try {
      const handle = await open(tempPath, 'w');
      try {
        await handle.writeFile(JSON.stringify(data, null, 2), 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Re-read what actually landed on disk before it may replace the main file.
      JSON.parse(await readFile(tempPath, 'utf8'));
      await this.backupCurrentFile();
      await replaceFile(tempPath, this.filePath);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }

  // Only a valid main file may overwrite the backup, so a corrupt main file
  // never destroys the last known-good copy.
  private async backupCurrentFile(): Promise<void> {
    const current = await readPersistedFile(this.filePath);
    if (!current) return;
    const backupTempPath = join(dirname(this.backupPath), `cameras.json.bak.${randomUUID()}.tmp`);
    try {
      await copyFile(this.filePath, backupTempPath);
      const handle = await open(backupTempPath, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      if (!await readPersistedFile(backupTempPath)) throw new Error('Camera backup validation failed.');
      await replaceFile(backupTempPath, this.backupPath);
    } catch {
      await unlink(backupTempPath).catch(() => undefined);
    }
  }
}

async function readPersistedFile(path: string): Promise<PersistedData | undefined> {
  try {
    const contents = await readFile(path, 'utf8');
    const parsed = JSON.parse(contents) as Partial<PersistedData>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cameras)) return undefined;
    return { ...defaultData, ...parsed } as PersistedData;
  } catch {
    return undefined;
  }
}

function migrateData(data: PersistedData): PersistedData {
  data.cameras = data.cameras.map((camera) => ({
    ...camera,
    kind: camera.kind ?? 'reolink',
    streamChannel: camera.streamChannel ?? camera.channel ?? 0,
    mjpegPath: camera.kind === 'panasonic' ? camera.mjpegPath ?? '/nphMotionJpeg?Resolution=640x480&Quality=Standard' : camera.mjpegPath,
    ptzPath: camera.kind === 'panasonic' ? camera.ptzPath ?? '/nphControlCamera' : camera.ptzPath,
    streamUrl: camera.streamUrl,
  }));
  return data;
}

// fs.rename replaces the destination atomically on both Windows and macOS, but
// Windows can fail transiently (EPERM/EBUSY) when antivirus or a reader holds
// the file. Retry briefly, then fall back to copy + unlink as a last resort.
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
  try {
    await copyFile(from, to);
    await unlink(from).catch(() => undefined);
  } catch {
    throw lastError;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encryptSecret(secret: CameraSecret): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS credential encryption is not available on this machine.');
  }
  return safeStorage.encryptString(JSON.stringify(secret)).toString('base64');
}

function decryptSecret(value: string): CameraSecret {
  const buffer = Buffer.from(value, 'base64');
  return JSON.parse(safeStorage.decryptString(buffer)) as CameraSecret;
}
