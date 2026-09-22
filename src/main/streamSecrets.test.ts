// @vitest-environment node
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeStorage } from 'electron';
import type { CameraInput } from '../shared/types.js';

const faults = vi.hoisted(() => ({ available: true, corrupt: false, encryptions: 0, failAt: 0, blockMainRename: false }));
vi.mock('electron', async () => {
  // Encryption-shaped fixture, not a claim to test the real OS keystore.
  const { createCipheriv, createDecipheriv, randomBytes } = await import('node:crypto');
  const key = randomBytes(32);
  return { app: { getPath: () => tmpdir() }, safeStorage: {
    isEncryptionAvailable: () => faults.available,
    encryptString: (text: string) => {
      if (++faults.encryptions === faults.failAt) throw new Error(`Synthetic encryption error: ${text}`);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const bytes = Buffer.concat([cipher.update(text), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    },
    decryptString: (bytes: Buffer) => {
      if (faults.corrupt) throw new Error('Synthetic wrong OS key');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString();
    },
  } };
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: async (...args: Parameters<typeof actual.rename>) => {
    if (faults.blockMainRename && String(args[1]).endsWith('cameras.json')) {
      throw Object.assign(new Error('Synthetic locked main file'), { code: 'EBUSY' });
    }
    return actual.rename(...args);
  } };
});
import { CameraStore } from './store.js';

const urlA = 'rtsps://test:synthetic-pass@192.0.2.1:7441/synthetic-path-token?enableSrtp&token=synthetic-query';
const urlB = 'rtsp://test:other-synthetic-pass@192.0.2.2:554/other-token';
function input(streamUrl = urlA): CameraInput {
  return { kind: 'generic', name: 'Test stream', host: '192.0.2.1', protocol: 'http', httpPort: 80,
    rtspPort: 554, username: '', password: '', channel: 0, streamChannel: 0, lowLatency: false, streamUrl };
}
function legacy(id: string, url: string) {
  const { password: _password, ...camera } = input(url);
  return { activeCameraId: id, cameras: [{ ...camera, id }], secrets: {} };
}
function storedUrl(data: { encryptedStreamUrls: Record<string, string> }, id: string): string {
  return JSON.parse(safeStorage.decryptString(Buffer.from(data.encryptedStreamUrls[id], 'base64'))).streamUrl;
}

describe('encrypted generic stream URLs', () => {
  let dir: string;
  let store: CameraStore;
  const mainPath = () => join(dir, 'cameras.json');
  const backupPath = () => join(dir, 'cameras.json.bak');
  beforeEach(async () => {
    Object.assign(faults, { available: true, corrupt: false, encryptions: 0, failAt: 0, blockMainRename: false });
    dir = await mkdtemp(join(tmpdir(), 'fjoscam-stream-secrets-'));
    store = new CameraStore(dir);
  });
  afterEach(async () => {
    if (dirname(resolve(dir)) !== resolve(tmpdir()) || !basename(dir).startsWith('fjoscam-stream-secrets-')) throw new Error('Unexpected test cleanup path');
    await rm(dir, { recursive: true, force: true });
  });

  it('returns only the saved flag, while main can decrypt the full URL', async () => {
    const state = await store.saveCamera(input());
    const id = state.cameras[0].id;
    expect(state.cameras[0]).toMatchObject({ hasStreamUrl: true, host: '192.0.2.1' });
    expect(state.cameras[0]).not.toHaveProperty('streamUrl');
    expect(JSON.stringify(await store.getState())).not.toContain('synthetic');
    const raw = await readFile(mainPath(), 'utf8');
    expect(raw).not.toContain('synthetic');
    expect(JSON.parse(raw).cameras[0]).not.toHaveProperty('streamUrl');
    expect(storedUrl(JSON.parse(raw), id)).toBe(urlA);
    expect((await store.getCameraWithSecret(id)).streamUrl).toBe(urlA);
  });

  it('stores and removes endpoint-bound RTSPS trust without exposing the saved URL', async () => {
    const rtspsTrust = { origin: 'rtsps://192.0.2.1:7441', fingerprint256: Array(32).fill('AB').join(':') };
    const { cameras: [camera] } = await store.saveCamera(input());
    const state = await store.saveCamera({ ...input(''), rtspsTrust }, camera.id);
    expect(state.cameras[0].rtspsTrust).toEqual(rtspsTrust);
    expect(state.cameras[0]).not.toHaveProperty('streamUrl');
    const reopened = new CameraStore(dir);
    expect((await reopened.getState()).cameras[0].rtspsTrust).toEqual(rtspsTrust);
    expect((await reopened.getCameraWithSecret(camera.id)).streamUrl).toBe(urlA);
    await expect(store.saveCamera({ ...input(''), rtspsTrust: { ...rtspsTrust, origin: 'rtsps://192.0.2.2:7441' } }, camera.id)).rejects.toThrow('saved stream');
    await expect(store.saveCamera({ ...input(urlB), rtspsTrust }, camera.id)).rejects.toThrow('RTSPS');
    await store.saveCamera(input(''), camera.id);
    expect((await store.getState()).cameras[0].rtspsTrust).toBeUndefined();
    expect((await store.getCameraWithSecret(camera.id)).streamUrl).toBe(urlA);
  });

  it('preserves the encrypted address on blank edit and backs up the previous address on replacement', async () => {
    const { cameras: [camera] } = await store.saveCamera(input());
    await store.saveCamera({ ...input(''), name: 'Renamed', host: 'unrelated.invalid' }, camera.id);
    expect((await store.getState()).cameras[0]).toMatchObject({ name: 'Renamed', host: '192.0.2.1' });
    expect((await store.getCameraWithSecret(camera.id)).streamUrl).toBe(urlA);
    await store.saveCamera(input(urlB), camera.id);
    expect((await store.getState()).cameras[0].host).toBe('192.0.2.2');
    expect(storedUrl(JSON.parse(await readFile(mainPath(), 'utf8')), camera.id)).toBe(urlB);
    expect(storedUrl(JSON.parse(await readFile(backupPath(), 'utf8')), camera.id)).toBe(urlA);
  });

  it('migrates main and backup without changing their different camera histories', async () => {
    await writeFile(mainPath(), JSON.stringify(legacy('current', urlA)));
    await writeFile(backupPath(), JSON.stringify(legacy('previous', urlB)));
    const [state, secret] = await Promise.all([store.getState(), store.getCameraWithSecret('current')]);
    expect(state.activeCameraId).toBe('current');
    expect(secret.streamUrl).toBe(urlA);
    const main = JSON.parse(await readFile(mainPath(), 'utf8'));
    const backup = JSON.parse(await readFile(backupPath(), 'utf8'));
    expect(storedUrl(main, 'current')).toBe(urlA);
    expect(storedUrl(backup, 'previous')).toBe(urlB);
    expect(backup.activeCameraId).toBe('previous');
    expect(backup.cameras.map((camera: { id: string }) => camera.id)).toEqual(['previous']);
    expect(JSON.stringify(main.cameras)).not.toContain('synthetic');
    expect(JSON.stringify(backup.cameras)).not.toContain('synthetic');
    const bytes = await readFile(mainPath(), 'utf8');
    await store.getState();
    expect(await readFile(mainPath(), 'utf8')).toBe(bytes);
  });

  it('creates an encrypted recovery copy if no backup exists during migration', async () => {
    await writeFile(mainPath(), JSON.stringify(legacy('current', urlA)));
    await store.getState();
    expect(storedUrl(JSON.parse(await readFile(backupPath(), 'utf8')), 'current')).toBe(urlA);
  });

  it('migrates a legacy backup even when main is already encrypted', async () => {
    const state = await store.saveCamera(input());
    await writeFile(backupPath(), JSON.stringify(legacy('previous', urlB)));
    const mainBefore = await readFile(mainPath(), 'utf8');
    expect((await store.getState()).activeCameraId).toBe(state.activeCameraId);
    expect(await readFile(mainPath(), 'utf8')).toBe(mainBefore);
    expect(storedUrl(JSON.parse(await readFile(backupPath(), 'utf8')), 'previous')).toBe(urlB);
  });

  it('leaves corrupt backup bytes untouched during migration of a valid main', async () => {
    await writeFile(mainPath(), JSON.stringify(legacy('current', urlA)));
    await writeFile(backupPath(), 'corrupt historical bytes');
    expect((await store.getCameraWithSecret('current')).streamUrl).toBe(urlA);
    expect(await readFile(backupPath(), 'utf8')).toBe('corrupt historical bytes');
  });

  it('does not create files or leak an address when encryption is unavailable for a new save', async () => {
    faults.available = false;
    await expect(store.saveCamera(input())).rejects.toThrow('not available');
    expect(await readdir(dir)).toEqual([]);
  });

  it('recovers from legacy backup and leaves the corrupt main bytes intact', async () => {
    await writeFile(mainPath(), 'corrupt original');
    await writeFile(backupPath(), JSON.stringify(legacy('previous', urlB)));
    expect((await store.getCameraWithSecret('previous')).streamUrl).toBe(urlB);
    expect(await readFile(mainPath(), 'utf8')).toBe('corrupt original');
    expect(storedUrl(JSON.parse(await readFile(backupPath(), 'utf8')), 'previous')).toBe(urlB);
  });

  it('does not write any migration when OS encryption is unavailable or preparation fails', async () => {
    const main = JSON.stringify(legacy('current', urlA));
    const backup = JSON.stringify(legacy('previous', urlB));
    await writeFile(mainPath(), main); await writeFile(backupPath(), backup);
    faults.available = false;
    await expect(store.getState()).rejects.toThrow('not available');
    faults.available = true; faults.failAt = 2;
    await expect(store.getState()).rejects.toThrow(/^OS credential encryption failed\./);
    expect(await readFile(mainPath(), 'utf8')).toBe(main);
    expect(await readFile(backupPath(), 'utf8')).toBe(backup);
    expect((await readdir(dir)).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  it('requires a verified encryption round trip before replacing legacy data', async () => {
    const main = JSON.stringify(legacy('current', urlA));
    await writeFile(mainPath(), main);
    faults.corrupt = true;
    await expect(store.getState()).rejects.toThrow('encryption failed');
    expect(await readFile(mainPath(), 'utf8')).toBe(main);
    expect(await readdir(dir)).toEqual(['cameras.json']);
  });

  it('can resume after backup migration succeeds but the main replacement fails', async () => {
    const main = JSON.stringify(legacy('current', urlA));
    await writeFile(mainPath(), main);
    await writeFile(backupPath(), JSON.stringify(legacy('previous', urlB)));
    faults.blockMainRename = true;
    await expect(store.getState()).rejects.toThrow('locked');
    expect(await readFile(mainPath(), 'utf8')).toBe(main);
    expect(storedUrl(JSON.parse(await readFile(backupPath(), 'utf8')), 'previous')).toBe(urlB);
    faults.blockMainRename = false;
    expect((await store.getCameraWithSecret('current')).streamUrl).toBe(urlA);
    expect(await readFile(mainPath(), 'utf8')).not.toContain('synthetic');
  });

  it('fails closed on a different OS key but permits explicit replacement of the URL', async () => {
    const { cameras: [camera] } = await store.saveCamera(input());
    faults.corrupt = true;
    expect((await store.getState()).cameras[0].hasStreamUrl).toBe(true);
    await expect(store.getCameraWithSecret(camera.id)).rejects.toThrow('could not be decrypted');
    faults.corrupt = false;
    await store.saveCamera(input(urlB), camera.id);
    expect((await store.getCameraWithSecret(camera.id)).streamUrl).toBe(urlB);
  });

  it('requires explicit secrets for a new camera or camera-kind conversion', async () => {
    await expect(store.saveCamera(input(''))).rejects.toThrow('Stream URL is required');
    const { cameras: [camera] } = await store.saveCamera(input());
    await expect(store.saveCamera({ ...input(''), kind: 'reolink', username: 'test' }, camera.id)).rejects.toThrow('Password is required');
    await store.saveCamera({ ...input(''), kind: 'reolink', username: 'test', password: 'synthetic-new-password' }, camera.id);
    expect((await store.getState()).cameras[0].hasStreamUrl).toBe(false);
    expect(JSON.parse(await readFile(mainPath(), 'utf8')).encryptedStreamUrls).toEqual({});
    await expect(store.saveCamera(input(''), camera.id)).rejects.toThrow('Stream URL is required');
  });

  it('serializes migration and edits without losing another camera', async () => {
    await writeFile(mainPath(), JSON.stringify(legacy('current', urlA)));
    await Promise.all([store.getState(), store.saveCamera(input(urlB)), store.setActiveCamera('current')]);
    const state = await store.getState();
    expect(state.cameras).toHaveLength(2);
    expect(state.activeCameraId).toBe('current');
    expect((await store.getCameraWithSecret('current')).streamUrl).toBe(urlA);
    await store.removeCamera('current');
    expect(JSON.parse(await readFile(mainPath(), 'utf8')).encryptedStreamUrls).not.toHaveProperty('current');
  });
});
