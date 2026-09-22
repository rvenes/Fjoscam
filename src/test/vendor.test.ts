// @vitest-environment node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cp, mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const { verifyVendor, verifyPackagedVendor } = createRequire(import.meta.url)('../../scripts/verifyVendor.cjs') as {
  verifyVendor: (root: string) => Promise<{ version: string; verified: string[] }>;
  verifyPackagedVendor: (root: string, platform: string, arch: string) => Promise<{ verified: string[] }>;
};
type PackContext = { arch: number; electronPlatformName: string; appOutDir: string;
  packager: { projectDir: string; getResourcesDir: (out: string) => string } };
const packageVendor = createRequire(import.meta.url)('../../scripts/packageVendor.cjs') as (context: PackContext) => Promise<void>;
const { Arch } = createRequire(import.meta.url)('electron-builder') as { Arch: Record<string, number> };
const { readGoBuildInfo } = createRequire(import.meta.url)('../../scripts/readGoBuildInfo.cjs') as {
  readGoBuildInfo: (bytes: Buffer) => { dependencies: unknown[]; settings: Record<string, string> };
};
type Notice = { sourcePath?: string; sourceUrl?: string; file: string; sha256: string; modules?: string[] };
type Inventory = { schemaVersion: number; goVersion: string; go2rtcVersion: string;
  modules: Array<{ path: string; version: string; sum: string; notices: Notice[] }>;
  toolchainNotices: Notice[]; supplementalNotices: Notice[] };
let inventory: Inventory;
let root: string;
let manifest: { version: string; goVersion: string; schemaVersion: number; sourceCommit: string; binaries: Array<{
  path: string; platform: string; arch: string; bytes: number; sha256: string; archive: string; archiveSha256: string; url: string;
}> };
const save = () => writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
const saveInventory = () => writeFile(join(root, 'modules.json'), JSON.stringify(inventory));

function buildInfo(body: string, goVersion = 'go1.25.6') {
  const encoded = (value: Buffer) => {
    let length = value.length;
    const prefix = [];
    do { prefix.push((length & 127) | (length > 127 ? 128 : 0)); length = Math.floor(length / 128); } while (length);
    return Buffer.concat([Buffer.from(prefix), value]);
  };
  const header = Buffer.alloc(32);
  Buffer.from('\xff Go buildinf:', 'latin1').copy(header); header[14] = 8; header[15] = 2;
  return Buffer.concat([header, encoded(Buffer.from(goVersion)), encoded(Buffer.concat([Buffer.alloc(16), Buffer.from(body), Buffer.alloc(16)]))]);
}
function fixture(binary: { platform: string; arch: string }, extra = '') {
  const body = `path\tgithub.com/AlexxIT/go2rtc\nmod\tgithub.com/AlexxIT/go2rtc\tv${manifest.version}\t\n` +
    inventory.modules.map((module) => `dep\t${module.path}\t${module.version}\t${module.sum}\n`).join('') +
    `build\tGOOS=${binary.platform === 'win32' ? 'windows' : 'darwin'}\nbuild\tGOARCH=${binary.arch === 'x64' ? 'amd64' : 'arm64'}\n` +
    `build\tCGO_ENABLED=0\nbuild\tvcs.revision=${manifest.sourceCommit}\nbuild\tvcs.modified=false\n` + extra;
  return buildInfo(body, `go${manifest.goVersion}`);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'fjoscam-vendor-test-'));
  manifest = JSON.parse(await readFile('vendor/go2rtc/manifest.json', 'utf8'));
  inventory = JSON.parse(await readFile('vendor/go2rtc/modules.json', 'utf8'));
  for (const binary of manifest.binaries) {
    const bytes = fixture(binary);
    binary.bytes = bytes.length; binary.sha256 = createHash('sha256').update(bytes).digest('hex');
    const path = join(root, binary.path); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
  }
  await writeFile(join(root, 'LICENSE'), await readFile('vendor/go2rtc/LICENSE'));
  await cp('vendor/go2rtc/notices', join(root, 'notices'), { recursive: true });
  await cp('vendor/go2rtc/THIRD-PARTY-NOTICES.md', join(root, 'THIRD-PARTY-NOTICES.md'));
  await saveInventory();
  await save();
});

describe('offline vendor integrity gate', () => {
  it('accepts the complete declared platform matrix', async () => {
    await expect(verifyVendor(root)).resolves.toMatchObject({ version: '1.9.14', verified: manifest.binaries.map((binary) => binary.path) });
  });
  it('rejects changed bytes even when file size is unchanged', async () => {
    await writeFile(join(root, manifest.binaries[0].path), Buffer.alloc(manifest.binaries[0].bytes, 0));
    await expect(verifyVendor(root)).rejects.toThrow('SHA-256 mismatch');
  });
  it('rejects missing/duplicate targets and paths outside the allowed platform matrix', async () => {
    const binaries = structuredClone(manifest.binaries);
    manifest.binaries.pop(); await save(); await expect(verifyVendor(root)).rejects.toThrow('manifest');
    manifest.binaries = [binaries[0], binaries[0], binaries[2]]; await save(); await expect(verifyVendor(root)).rejects.toThrow('manifest');
    manifest.binaries = binaries; manifest.binaries[0].path = '../outside'; await save(); await expect(verifyVendor(root)).rejects.toThrow('manifest');
  });
  it('rejects a missing license notice', async () => {
    await writeFile(join(root, 'LICENSE'), '');
    await expect(verifyVendor(root)).rejects.toThrow('license notice');
  });
  it('rejects an architecture mismatch even after updating the binary hash', async () => {
    const binary = manifest.binaries[0];
    const bytes = fixture({ ...binary, arch: 'arm64' });
    binary.bytes = bytes.length; binary.sha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(root, binary.path), bytes); await save();
    await expect(verifyVendor(root)).rejects.toThrow('build information mismatch');
  });
  it.each(['version', 'sum', 'goVersion', 'go2rtcVersion', 'missing module'])('rejects stale inventory: %s', async (field) => {
    if (field === 'version') inventory.modules[0].version = 'v99.0.0';
    else if (field === 'sum') inventory.modules[0].sum = 'h1:' + Buffer.alloc(32).toString('base64');
    else if (field === 'missing module') inventory.modules.pop();
    else if (field === 'goVersion') inventory.goVersion = 'go1.99.0';
    else inventory.go2rtcVersion = 'v99.0.0';
    await saveInventory();
    await expect(verifyVendor(root)).rejects.toThrow(/notice (entry|inventory)/);
  });
  it('rejects duplicate modules', async () => {
    inventory.modules.push(inventory.modules[0]); await saveInventory();
    await expect(verifyVendor(root)).rejects.toThrow('module notice entry');
  });
  it.each(['Paho', 'toolchain', 'Apache'])('requires complete special notices: %s', async (kind) => {
    if (kind === 'Paho') inventory.modules[0].notices = inventory.modules[0].notices.filter((notice) => notice.sourcePath !== 'edl-v10');
    else if (kind === 'toolchain') inventory.toolchainNotices.pop();
    else inventory.supplementalNotices = [];
    await saveInventory();
    await expect(verifyVendor(root)).rejects.toThrow(/Missing .* (notices|license text)/);
  });
  it('detects changed original notice bytes', async () => {
    await writeFile(join(root, inventory.modules[1].notices[0].file), 'changed license');
    await expect(verifyVendor(root)).rejects.toThrow('Go notice SHA-256 mismatch');
  });
  it('rejects an absent notice file', async () => {
    inventory.modules[1].notices[0].file = 'notices/missing.txt'; await saveInventory();
    await expect(verifyVendor(root)).rejects.toThrow('ENOENT');
  });
  it.each(['../outside.txt', 'notices/../../outside.txt', 'C:/outside.txt', 'notices\\outside.txt'])('rejects notice path traversal: %s', async (path) => {
    inventory.modules[0].notices[0].file = path; await saveInventory();
    await expect(verifyVendor(root)).rejects.toThrow('notice file entry');
  });
  it('rejects duplicate notice files and incomplete readable indexes', async () => {
    const original = inventory.modules[1].notices[0].file;
    inventory.modules[1].notices[0].file = inventory.modules[0].notices[0].file; await saveInventory();
    await expect(verifyVendor(root)).rejects.toThrow('notice file entry');
    inventory.modules[1].notices[0].file = original; await saveInventory();
    await writeFile(join(root, 'THIRD-PARTY-NOTICES.md'), 'incomplete');
    await expect(verifyVendor(root)).rejects.toThrow('Incomplete Go notice index');
  });
});

describe('Go build information reader', () => {
  it('reads inline metadata without executing the binary', () => {
    const result = readGoBuildInfo(fixture(manifest.binaries[0]));
    expect(result.dependencies).toHaveLength(34);
    expect(result.settings.GOOS).toBe('windows');
  });
  it.each(['truncated', 'unsupported', 'unaligned', 'missing magic', 'unbounded length'])('rejects %s binary metadata', (kind) => {
    let bytes = fixture(manifest.binaries[0]);
    if (kind === 'truncated') bytes = bytes.subarray(0, -1);
    else if (kind === 'unsupported') bytes[15] = 0;
    else if (kind === 'unaligned') bytes = Buffer.concat([Buffer.alloc(1), bytes]);
    else if (kind === 'missing magic') bytes.fill(0, 0, 14);
    else bytes.fill(255, 32, 37);
    expect(() => readGoBuildInfo(bytes)).toThrow(/Go build information/);
  });
  it.each(['=>\texample.com/replacement\tv1.0.0\n', 'build\n', 'build\tGOOS=darwin\n',
    'mod\texample.com/duplicate\tv1.0.0\n', 'dep\texample.com/bad\tv1.0.0\tbad-checksum\n'])('rejects unsupported or ambiguous module metadata: %s', (line) => {
    expect(() => readGoBuildInfo(fixture(manifest.binaries[0], line))).toThrow(/Go (module|build|main module|dependency)/);
  });
});

describe('platform-specific vendor packaging before signing', () => {
  async function prepare(platform = 'win32', arch = 'x64') {
    const base = await mkdtemp(join(tmpdir(), 'fjoscam-package-test-'));
    const projectDir = join(base, 'project');
    await cp(root, join(projectDir, 'vendor/go2rtc'), { recursive: true });
    const context: PackContext = { arch: Arch[arch], electronPlatformName: platform, appOutDir: join(base, `output-${platform}-${arch}`),
      packager: { projectDir, getResourcesDir: (out) => platform === 'darwin' ? join(out, 'Fjoscam.app/Contents/Resources') : join(out, 'resources') } };
    const destination = join(context.packager.getResourcesDir(context.appOutDir), 'app.asar.unpacked/vendor/go2rtc');
    await mkdir(destination, { recursive: true });
    for (const file of ['LICENSE', 'manifest.json', 'modules.json', 'THIRD-PARTY-NOTICES.md', 'notices']) {
      await cp(join(root, file), join(destination, file), { recursive: true });
    }
    return { context, destination };
  }
  it.each([['win32', 'x64', 'win64/go2rtc.exe'], ['darwin', 'x64', 'mac-amd64/go2rtc'],
    ['darwin', 'arm64', 'mac-arm64/go2rtc']])('packages only %s/%s, preserving source inputs and notices', async (platform, arch, binary) => {
    const { context, destination } = await prepare(platform, arch);
    await packageVendor(context);
    await expect(verifyPackagedVendor(destination, platform, arch)).resolves.toMatchObject({ verified: [binary] });
    expect(await readFile(join(destination, binary))).toEqual(await readFile(join(root, binary)));
    expect(await readdir(destination)).toEqual(expect.arrayContaining(['LICENSE', 'modules.json', 'manifest.json', 'notices']));
    await expect(verifyVendor(join(context.packager.projectDir, 'vendor/go2rtc'))).resolves.toMatchObject({ verified: manifest.binaries.map((item) => item.path) });
  });
  it.each([['win32', 'arm64'], ['win32', 'ia32'], ['darwin', 'universal'], ['linux', 'x64']])('rejects unsupported %s/%s without copying anything', async (platform, arch) => {
    const { context, destination } = await prepare(platform, arch);
    const before = await readdir(destination);
    await expect(packageVendor(context)).rejects.toThrow('Unsupported go2rtc package target');
    expect(await readdir(destination)).toEqual(before);
  });
  it('does not overwrite an existing binary when an output is reused or filtering fails', async () => {
    const { context, destination } = await prepare();
    await mkdir(join(destination, 'win64'));
    await writeFile(join(destination, 'win64/go2rtc.exe'), 'existing output');
    await expect(packageVendor(context)).rejects.toThrow('EEXIST');
    expect(await readFile(join(destination, 'win64/go2rtc.exe'), 'utf8')).toBe('existing output');
  });
  it('rejects an extra platform directory and missing selected binary in package checks', async () => {
    const { context, destination } = await prepare();
    await expect(verifyPackagedVendor(destination, 'win32', 'x64')).rejects.toThrow('ENOENT');
    await mkdir(join(destination, 'mac-arm64'));
    await expect(packageVendor(context)).rejects.toThrow('Unexpected go2rtc platform in package');
  });
  it('fails before copying if a repository binary has changed', async () => {
    const { context, destination } = await prepare();
    await writeFile(join(context.packager.projectDir, 'vendor/go2rtc/mac-amd64/go2rtc'), 'changed input');
    await expect(packageVendor(context)).rejects.toThrow('size/type mismatch');
    expect(await readdir(destination)).not.toContain('win64');
  });
  it('rejects a destination outside the package and the project directory itself', async () => {
    const { context } = await prepare();
    const getResourcesDir = context.packager.getResourcesDir;
    context.packager.getResourcesDir = () => join(context.packager.projectDir, 'resources');
    await expect(packageVendor(context)).rejects.toThrow('Unsafe go2rtc package output');
    context.packager.getResourcesDir = getResourcesDir; context.appOutDir = context.packager.projectDir;
    await expect(packageVendor(context)).rejects.toThrow('Unsafe go2rtc package output');
  });
  it('rejects directory links before writing through them', async () => {
    const { context, destination } = await prepare();
    const linkedOutput = join(dirname(context.appOutDir), 'linked-output');
    // Junctions work without elevated symlink permission on Windows.
    await symlink(context.appOutDir, linkedOutput, process.platform === 'win32' ? 'junction' : 'dir');
    context.appOutDir = linkedOutput;
    await expect(packageVendor(context)).rejects.toThrow('directory type');
    expect(await readdir(destination)).not.toContain('win64');
  });
});
