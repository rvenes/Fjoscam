const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { lstat, readFile, writeFile } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { readGoBuildInfo } = require('./readGoBuildInfo.cjs');
const { verifyGoNotices } = require('./verifyGoNotices.cjs');

const targets = new Map([
  ['win64/go2rtc.exe', ['win32', 'x64']],
  ['mac-amd64/go2rtc', ['darwin', 'x64']],
  ['mac-arm64/go2rtc', ['darwin', 'arm64']],
]);

function vendorTarget(platform, arch) {
  const path = [...targets].find(([, target]) => target[0] === platform && target[1] === arch)?.[0];
  if (!path) throw new Error(`Unsupported go2rtc package target: ${platform}/${arch}`);
  return path;
}

async function verifyVendorBinaries(root = resolve(__dirname, '../vendor/go2rtc'), selectedPath) {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
      !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) || !/^\d+\.\d+\.\d+$/.test(manifest.goVersion) ||
      !Array.isArray(manifest.binaries) || manifest.binaries.length !== targets.size) {
    throw new Error('Invalid go2rtc manifest.');
  }
  const seen = new Set();
  const verified = [];
  const builds = [];
  for (const binary of manifest.binaries) {
    const target = targets.get(binary.path);
    if (!target || seen.has(binary.path) || binary.platform !== target[0] || binary.arch !== target[1] ||
        !Number.isSafeInteger(binary.bytes) || binary.bytes <= 0 || binary.bytes > 64 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/.test(binary.sha256) || !/^[a-f0-9]{64}$/.test(binary.archiveSha256) ||
        !/^go2rtc_[a-z0-9_]+\.zip$/.test(binary.archive) ||
        binary.url !== `https://github.com/AlexxIT/go2rtc/releases/download/v${manifest.version}/${binary.archive}`) {
      throw new Error('Invalid go2rtc binary manifest entry.');
    }
    seen.add(binary.path);
    if (selectedPath && binary.path !== selectedPath) continue;
    const path = join(root, binary.path);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== binary.bytes) throw new Error(`go2rtc size/type mismatch: ${binary.path}`);
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(path)) digest.update(chunk);
    if (digest.digest('hex') !== binary.sha256) throw new Error(`go2rtc SHA-256 mismatch: ${binary.path}`);
    const build = readGoBuildInfo(await readFile(path));
    if (build.modulePath !== 'github.com/AlexxIT/go2rtc' || build.version !== `v${manifest.version}` ||
        build.goVersion !== `go${manifest.goVersion}` || build.settings['vcs.revision'] !== manifest.sourceCommit ||
        build.settings['vcs.modified'] !== 'false' || build.settings.CGO_ENABLED !== '0' ||
        build.settings.GOOS !== (binary.platform === 'win32' ? 'windows' : 'darwin') ||
        build.settings.GOARCH !== (binary.arch === 'x64' ? 'amd64' : 'arm64')) {
      throw new Error(`go2rtc build information mismatch: ${binary.path}`);
    }
    builds.push(build);
    verified.push(binary.path);
  }
  const license = await readFile(join(root, 'LICENSE'), 'utf8');
  if (!license.includes('Copyright (c) 2022 Alexey Khit') || !license.includes('Permission is hereby granted')) throw new Error('Missing go2rtc license notice.');
  return { version: manifest.version, verified, builds };
}

async function verifyVendor(root = resolve(__dirname, '../vendor/go2rtc')) {
  const { version, verified, builds } = await verifyVendorBinaries(root);
  return { version, verified, ...await verifyGoNotices(root, builds) };
}

// Source checks always require all three inputs. Package checks retain the
// complete source manifest but require exactly one supported platform directory.
async function verifyPackagedVendor(root, platform, arch) {
  const selectedPath = vendorTarget(platform, arch);
  for (const path of targets.keys()) {
    if (path === selectedPath) continue;
    try {
      await lstat(join(root, path.split('/')[0]));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`Unexpected go2rtc platform in package: ${path}`);
  }
  const { version, verified, builds } = await verifyVendorBinaries(root, selectedPath);
  return { version, verified, ...await verifyGoNotices(root, builds) };
}

module.exports = { verifyVendor, verifyPackagedVendor, vendorTarget };
if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === '--export-build-info') {
    // Maintenance-only export: never overwrite a previous collection. This
    // deliberately checks binaries before an upgraded inventory exists.
    const result = await verifyVendorBinaries();
    await writeFile(resolve(args[1]), JSON.stringify(result.builds, null, 2) + '\n', { flag: 'wx' });
    console.log('Exported hash-verified Go build information. Run the full gate after notice collection.');
  } else {
    if (args.length) throw new Error('Usage: verifyVendor.cjs [--export-build-info NEW_FILE]');
    const result = await verifyVendor();
    console.log(`Verified go2rtc ${result.version}: ${result.verified.join(', ')}; ${result.modules} Go modules, ${result.notices} notices`);
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
