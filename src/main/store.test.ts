// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraInput } from '../shared/types.js';

const faults = vi.hoisted(() => ({ renameBlocked: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: async (...args: Parameters<typeof actual.rename>) => {
    if (faults.renameBlocked) throw Object.assign(new Error('Synthetic busy file'), { code: 'EBUSY' });
    return actual.rename(...args);
  } };
});

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
    faults.renameBlocked = false;
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

  it.each(['active', 'channel', 'quality', 'order'])('preserves the historical backup for an unchanged %s request', async (kind) => {
    await store.saveCamera(cameraInput('A'));
    const before = await store.saveCamera(cameraInput('B'));
    const main = await readFile(join(dir, 'cameras.json'), 'utf8');
    const backup = await readFile(join(dir, 'cameras.json.bak'), 'utf8');
    const first = before.cameras[0];
    const after = kind === 'active' ? await store.setActiveCamera(before.activeCameraId!)
      : kind === 'channel' ? await store.setStreamChannel(first.id, first.streamChannel!)
        : kind === 'quality' ? await store.setStreamQuality(first.id, first.lowLatency)
          : await store.reorderCameras(before.cameras.map((camera) => camera.id));
    expect(after).toEqual(before);
    expect(await readFile(join(dir, 'cameras.json'), 'utf8')).toBe(main);
    expect(await readFile(join(dir, 'cameras.json.bak'), 'utf8')).toBe(backup);
  });

  it('repairs a corrupt main file even when selecting the camera already active in the backup', async () => {
    const first = await store.saveCamera(cameraInput('A'));
    await store.saveCamera(cameraInput('B'));
    const backup = await readFile(join(dir, 'cameras.json.bak'), 'utf8');
    await writeFile(join(dir, 'cameras.json'), 'synthetic corruption');
    const recovered = await store.setActiveCamera(first.activeCameraId!);
    expect(recovered.configurationNotice).toBe('recovered-from-backup');
    expect(JSON.parse(await readFile(join(dir, 'cameras.json'), 'utf8')).cameras).toHaveLength(1);
    expect(await readFile(join(dir, 'cameras.json.bak'), 'utf8')).toBe(backup);
    expect((await new CameraStore(dir).getState()).configurationNotice).toBeUndefined();
  });

  it('recovers from a corrupt main file via the backup', async () => {
    await store.saveCamera(cameraInput('A'));
    await store.saveCamera(cameraInput('B'));
    await writeFile(join(dir, 'cameras.json'), '{"cameras": [truncated', 'utf8');

    const state = await store.getState();
    expect(state.cameras).toHaveLength(1);
    expect(state.cameras[0].name).toBe('A');
    expect(state.configurationNotice).toBe('recovered-from-backup');
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
    expect(state.configurationNotice).toBe('recovered-from-backup');
    expect(JSON.parse(await readFile(join(dir, 'cameras.json'), 'utf8'))).not.toHaveProperty('configurationNotice');
    expect((await new CameraStore(dir).getState()).configurationNotice).toBeUndefined();
  });

  it('recovers when the main file is missing but a backup exists', async () => {
    await store.saveCamera(cameraInput('A'));
    await store.saveCamera(cameraInput('B'));
    await rm(join(dir, 'cameras.json'));

    const state = await store.getState();
    expect(state.cameras.map((camera) => camera.name)).toEqual(['A']);
    expect(state.configurationNotice).toBe('recovered-from-backup');
  });

  it('does not report recovery for a new or healthy configuration', async () => {
    expect((await store.getState()).configurationNotice).toBeUndefined();
    await store.saveCamera(cameraInput('A'));
    expect((await store.getState()).configurationNotice).toBeUndefined();
  });

  it('preserves corrupt files and refuses mutations instead of silently resetting', async () => {
    await writeFile(join(dir, 'cameras.json'), 'garbage', 'utf8');
    await writeFile(join(dir, 'cameras.json.bak'), 'more garbage', 'utf8');

    await expect(store.getState()).rejects.toThrow('could not be read');
    await expect(store.saveCamera(cameraInput('New'))).rejects.toThrow('could not be read');
    expect(await readFile(join(dir, 'cameras.json'), 'utf8')).toBe('garbage');
    expect(await readFile(join(dir, 'cameras.json.bak'), 'utf8')).toBe('more garbage');
  });

  it('round-trips lens overrides and arbitrary NVR view channels, rejecting invalid lens values', async () => {
    const state = await store.saveCamera({ ...cameraInput('NVR camera'), lensMode: 'single', channel: 5, streamChannel: 5 });
    const id = state.cameras[0].id;
    expect((await new CameraStore(dir).getState()).cameras[0]).toMatchObject({ lensMode: 'single', channel: 5, streamChannel: 5 });
    await store.saveCamera({ ...cameraInput('Dual'), lensMode: 'dual', password: '' }, id);
    expect((await new CameraStore(dir).getState()).cameras[0].lensMode).toBe('dual');
    await expect(store.saveCamera({ ...cameraInput('Bad'), lensMode: 'bad' as 'auto' }, id)).rejects.toThrow('lens');
    expect((await new CameraStore(dir).getState()).cameras[0].lensMode).toBe('dual');
  });

  it('defaults to no ONVIF permission and persists explicit opt-in, port and revocation', async () => {
    const input = cameraInput('ONVIF');
    const id = (await store.saveCamera(input)).cameras[0].id;
    expect((await store.getState()).cameras[0].allowInsecureOnvif).toBe(false);
    await store.saveCamera({ ...input, password: '', allowInsecureOnvif: true, onvifPort: 8888 }, id);
    const reopened = new CameraStore(dir);
    expect((await reopened.getCameraWithSecret(id))).toMatchObject({ allowInsecureOnvif: true, onvifPort: 8888, password: 'secret' });
    await reopened.saveCamera({ ...input, password: '', allowInsecureOnvif: false, onvifPort: 8888 }, id);
    expect((await reopened.getCameraWithSecret(id)).allowInsecureOnvif).toBe(false);
  });

  it('does not grant ONVIF for legacy config and rejects malformed permission or port', async () => {
    const input = cameraInput('Legacy');
    const id = (await store.saveCamera(input)).cameras[0].id;
    const raw = JSON.parse(await readFile(join(dir, 'cameras.json'), 'utf8'));
    delete raw.cameras[0].allowInsecureOnvif; delete raw.cameras[0].onvifPort;
    await writeFile(join(dir, 'cameras.json'), JSON.stringify(raw));
    expect((await store.getCameraWithSecret(id)).allowInsecureOnvif).not.toBe(true);
    const before = await readFile(join(dir, 'cameras.json'), 'utf8');
    for (const change of [{ onvifPort: 0 }, { onvifPort: 65536 }, { onvifPort: 1.5 },
      { allowInsecureOnvif: 'true' as unknown as boolean }, { kind: 'generic' as const, allowInsecureOnvif: true, streamUrl: 'rtsp://192.0.2.1/live' }]) {
      await expect(store.saveCamera({ ...input, ...change }, id)).rejects.toThrow('ONVIF');
    }
    expect(await readFile(join(dir, 'cameras.json'), 'utf8')).toBe(before);
  });

  it('persists and removes certificate trust without replacing the password', async () => {
    const input = { ...cameraInput('TLS'), protocol: 'https' as const, httpPort: 443,
      httpsTrust: { origin: 'https://192.168.1.30', fingerprint256: Array(32).fill('AB').join(':') } };
    const state = await store.saveCamera(input);
    const id = state.cameras[0].id;
    const reloaded = new CameraStore(dir);
    expect((await reloaded.getCameraWithSecret(id)).httpsTrust).toEqual(input.httpsTrust);
    expect((await reloaded.getState()).cameras[0].httpsTrust).toEqual(input.httpsTrust);
    await reloaded.saveCamera({ ...input, password: '', httpsTrust: undefined }, id);
    const camera = await reloaded.getCameraWithSecret(id);
    expect(camera.httpsTrust).toBeUndefined();
    expect(camera.password).toBe('secret');
  });

  it('rejects malformed, relocated or generic HTTPS trust without replacing valid data', async () => {
    const input = { ...cameraInput('TLS'), protocol: 'https' as const, httpPort: 443,
      httpsTrust: { origin: 'https://192.168.1.30', fingerprint256: Array(32).fill('AB').join(':') } };
    const id = (await store.saveCamera(input)).cameras[0].id;
    const before = await readFile(join(dir, 'cameras.json'), 'utf8');
    for (const change of [{ host: '192.168.1.31' }, { httpPort: 8443 }, { protocol: 'http' as const },
      { httpsTrust: { ...input.httpsTrust, fingerprint256: 'invalid' } },
      { kind: 'generic' as const, streamUrl: 'rtsp://192.0.2.1/live' }]) {
      await expect(store.saveCamera({ ...input, ...change }, id)).rejects.toThrow(/trust/);
    }
    expect(await readFile(join(dir, 'cameras.json'), 'utf8')).toBe(before);
  });

  it('rejects duplicate reorder IDs without losing a camera', async () => {
    await store.saveCamera(cameraInput('A'));
    const before = await store.saveCamera(cameraInput('B'));
    const id = before.cameras[0].id;
    await expect(store.reorderCameras([id, id])).rejects.toThrow('order');
    expect(await store.getState()).toEqual(before);
    const ids = before.cameras.map((camera) => camera.id).reverse();
    expect((await store.reorderCameras(ids)).cameras.map((camera) => camera.id)).toEqual(ids);
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

  it('keeps both original files intact when atomic replacement stays busy', async () => {
    await store.saveCamera(cameraInput('A'));
    await store.saveCamera(cameraInput('B'));
    const mainBefore = await readFile(join(dir, 'cameras.json'), 'utf8');
    const backupBefore = await readFile(join(dir, 'cameras.json.bak'), 'utf8');
    faults.renameBlocked = true;
    await expect(store.saveCamera(cameraInput('C'))).rejects.toThrow('busy');
    expect(await readFile(join(dir, 'cameras.json'), 'utf8')).toBe(mainBefore);
    expect(await readFile(join(dir, 'cameras.json.bak'), 'utf8')).toBe(backupBefore);
    expect((await readdir(dir)).some((file) => file.endsWith('.tmp'))).toBe(false);
  });

  it('rejects malformed camera records instead of returning invalid renderer state', async () => {
    await writeFile(join(dir, 'cameras.json'), JSON.stringify({ cameras: [null], secrets: {} }));
    await expect(store.getState()).rejects.toThrow('could not be read');
  });
});
