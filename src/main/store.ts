import { app, safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  private readonly filePath = join(app.getPath('userData'), 'cameras.json');

  async getState(): Promise<AppState> {
    const data = await this.readData();
    return { cameras: data.cameras, activeCameraId: data.activeCameraId };
  }

  async saveCamera(input: CameraInput, existingId?: string): Promise<AppState> {
    const errors = validateCameraInput(input, { requirePassword: !existingId });
    if (errors.length > 0) throw new Error(errors.join(' '));

    const data = await this.readData();
    const id = existingId ?? randomUUID();
    const camera: CameraConfig = {
      id,
      name: input.name.trim(),
      host: normalizeHost(input.host),
      protocol: input.protocol,
      httpPort: Number(input.httpPort),
      rtspPort: Number(input.rtspPort),
      username: input.username.trim(),
      channel: Number(input.channel),
      streamChannel: Number(input.streamChannel ?? input.channel),
      lowLatency: Boolean(input.lowLatency),
    };

    const index = data.cameras.findIndex((item) => item.id === id);
    if (index >= 0) data.cameras[index] = camera;
    else data.cameras.push(camera);

    if (input.password) {
      data.secrets[id] = encryptSecret({ password: input.password });
    } else if (!data.secrets[id]) {
      throw new Error('Camera password is missing.');
    }
    data.activeCameraId = data.activeCameraId ?? id;
    await this.writeData(data);
    return this.getState();
  }

  async removeCamera(id: string): Promise<AppState> {
    const data = await this.readData();
    data.cameras = data.cameras.filter((camera) => camera.id !== id);
    delete data.secrets[id];
    if (data.activeCameraId === id) data.activeCameraId = data.cameras[0]?.id ?? null;
    await this.writeData(data);
    return this.getState();
  }

  async reorderCameras(ids: string[]): Promise<AppState> {
    const data = await this.readData();
    const camerasById = new Map(data.cameras.map((camera) => [camera.id, camera]));
    if (ids.length !== data.cameras.length || ids.some((id) => !camerasById.has(id))) {
      throw new Error('Camera order does not match saved cameras.');
    }
    data.cameras = ids.map((id) => camerasById.get(id)!);
    await this.writeData(data);
    return this.getState();
  }

  async setActiveCamera(id: string): Promise<AppState> {
    const data = await this.readData();
    if (!data.cameras.some((camera) => camera.id === id)) throw new Error('Camera not found.');
    data.activeCameraId = id;
    await this.writeData(data);
    return this.getState();
  }

  async setStreamChannel(id: string, streamChannel: number): Promise<AppState> {
    const data = await this.readData();
    const camera = data.cameras.find((item) => item.id === id);
    if (!camera) throw new Error('Camera not found.');
    camera.streamChannel = streamChannel;
    await this.writeData(data);
    return this.getState();
  }

  async setStreamQuality(id: string, lowLatency: boolean): Promise<AppState> {
    const data = await this.readData();
    const camera = data.cameras.find((item) => item.id === id);
    if (!camera) throw new Error('Camera not found.');
    camera.lowLatency = lowLatency;
    await this.writeData(data);
    return this.getState();
  }

  async getCameraWithSecret(id: string): Promise<CameraWithSecret> {
    const data = await this.readData();
    const camera = data.cameras.find((item) => item.id === id);
    if (!camera) throw new Error('Camera not found.');
    const encrypted = data.secrets[id];
    if (!encrypted) throw new Error('Camera password is missing.');
    return { ...camera, ...decryptSecret(encrypted) };
  }

  private async readData(): Promise<PersistedData> {
    try {
      const contents = await readFile(this.filePath, 'utf8');
      const data = { ...defaultData, ...JSON.parse(contents) } as PersistedData;
      data.cameras = data.cameras.map((camera) => ({
        ...camera,
        streamChannel: camera.streamChannel ?? camera.channel ?? 0,
      }));
      return data;
    } catch {
      return { ...defaultData };
    }
  }

  private async writeData(data: PersistedData): Promise<void> {
    await mkdir(app.getPath('userData'), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }
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
