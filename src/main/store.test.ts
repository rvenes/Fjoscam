import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraInput } from '../shared/types.js';

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (buffer: Buffer) => buffer.toString('utf8'),
  },
}));

import { CameraStore } from './store.js';

function cameraInput(name: string): CameraInput {
  return {
    kind: 'reolink',
    name,
    host: '192.168.1.30',
    protocol: 'http',
    httpPort: 80,
    rtspPort: 554,
    username: 'admin',
    password: 'secret',
    channel: 0,
    streamChannel: 0,
    lowLatency: false,
  };
}

describe('CameraStore persistence', () => {
  let dir: string;
  let store: CameraStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fjoscam-store-'));
    store = new CameraStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('saves a camera and reads it back from disk', async () => {
    const state = await store.saveCamera(cameraInput('Barn'));
    expect(state.cameras).toHaveLength(1);
    expect(state.activeCameraId).toBe(state.cameras[0].id);

    const persisted = JSON.parse(await readFile(join(dir, 'cameras.json'), 'utf8'));
    expect(persisted.cameras[0].name).toBe('Barn');

    const withSecret = await store.getCameraWithSecret(state.cameras[0].id);
    expect(withSecret.password).toBe('secret');
  });

  it('leaves no temp files behind after writes', async () => {
    await store.saveCamera(cameraInput('A'));
    await store.saveCamera(cameraInput('B'));
    const files = await readdir(dir);
    expect(files.filter((file) => file.endsWith('.tmp'))).toHaveLength(0);
  });

  it('keeps a backup with the previous valid version', async () => {
    await store.saveCamera(cameraInput('A'));
    await store.saveCamera(cameraInput('B'));

    const backup = JSON.parse(await readFile(join(dir, 'cameras.json.bak'), 'utf8'));
    expect(backup.cameras).toHaveLength(1);
    expect(backup.cameras[0].name).toBe('A');
  });

  it('recovers from a corrupt main file via the backup', async () => {
    await store.saveCamera(cameraInput('A'));
    await store.saveCamera(cameraInput('B'));
    await writeFile(join(dir, 'cameras.json'), '{"cameras": [truncated', 'utf8');

    const state = await store.getState();
    expect(state.cameras).toHaveLength(1);
    expect(state.cameras[0].name).toBe('A');
  });

  it('does not overwrite a valid backup with a corrupt main file', async () => {
    await store.saveCamera(cameraInput('A'));
    await store.saveCamera(cameraInput('B'));
    await writeFile(join(dir, 'cameras.json'), 'not json at all', 'utf8');

    // Next write recovers from backup and must not clobber it with garbage.
    await store.saveCamera(cameraInput('C'));

    const backup = JSON.parse(await readFile(join(dir, 'cameras.json.bak'), 'utf8'));
    expect(backup.cameras.map((camera: { name: string }) => camera.name)).toEqual(['A']);

    const state = await store.getState();
    expect(state.cameras.map((camera) => camera.name)).toEqual(['A', 'C']);
  });

  it('recovers when the main file is missing but a backup exists', async () => {
    await store.saveCamera(cameraInput('A'));
    await store.saveCamera(cameraInput('B'));
    await rm(join(dir, 'cameras.json'));

    const state = await store.getState();
    expect(state.cameras.map((camera) => camera.name)).toEqual(['A']);
  });

  it('falls back to empty state when both files are corrupt', async () => {
    await writeFile(join(dir, 'cameras.json'), 'garbage', 'utf8');
    await writeFile(join(dir, 'cameras.json.bak'), 'more garbage', 'utf8');

    const state = await store.getState();
    expect(state.cameras).toHaveLength(0);
    expect(state.activeCameraId).toBeNull();
  });

  it('does not lose updates when mutations run concurrently', async () => {
    await Promise.all([
      store.saveCamera(cameraInput('A')),
      store.saveCamera(cameraInput('B')),
      store.saveCamera(cameraInput('C')),
    ]);

    const state = await store.getState();
    expect(state.cameras.map((camera) => camera.name).sort()).toEqual(['A', 'B', 'C']);
  });
});
