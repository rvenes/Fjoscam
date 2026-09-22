// Builds isolated native verification packages; never publishes or overwrites
// dist releases. Run after npm test and npm run build.
const { cp, mkdir, mkdtemp, readFile, writeFile } = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { delimiter, dirname, join, resolve } = require('node:path');
const assert = require('node:assert/strict');

function run(executable, args, cwd, timeout = 180000) {
  return new Promise((resolveRun, reject) => {
    const env = { ...process.env };
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
    env[pathKey] = `${dirname(process.execPath)}${delimiter}${env[pathKey] || ''}`;
    const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (data) => { output += data; process.stdout.write(data); });
    child.stderr.on('data', (data) => { output += data; process.stderr.write(data); });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Isolated package check timed out.')); }, timeout);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); code === 0 ? resolveRun(output) : reject(new Error(`Isolated check exited ${code}.`)); });
  });
}

(async () => {
  assert(['win32', 'darwin'].includes(process.platform), 'This runner verifies native Windows/macOS packages only.');
  const mac = process.platform === 'darwin';
  const root = resolve(__dirname, '..');
  await mkdir(join(root, 'out'), { recursive: true });
  const staging = await mkdtemp(join(root, 'out', 'dependency-check-'));
  console.log(`Isolated package workspace: ${staging}`);
  for (const path of ['package.json', 'package-lock.json', 'src', 'index.html', 'tsconfig.json',
    'tsconfig.electron.json', 'vite.config.ts', 'vendor', 'scripts']) {
    await cp(join(root, path), join(staging, path), { recursive: true });
  }
  const hash = (data) => createHash('sha256').update(data).digest('hex');
  const lockHash = hash(await readFile(join(staging, 'package-lock.json')));
  // npm_execpath is supplied by npm run; allow a direct node invocation too.
  const npmCli = process.env.npm_execpath || join(dirname(process.execPath), mac ? '../lib/node_modules/npm/bin/npm-cli.js' : 'node_modules/npm/bin/npm-cli.js');
  await run(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], staging);
  assert.equal(hash(await readFile(join(staging, 'package-lock.json'))), lockHash, 'npm ci changed the lockfile.');
  await run(process.execPath, [npmCli, 'run', 'build'], staging);
  const npmVersion = (await run(process.execPath, [npmCli, '--version'], staging)).trim();
  const packageInfo = JSON.parse(await readFile(join(staging, 'package.json'), 'utf8'));
  const config = {
    ...packageInfo.build,
    directories: { ...packageInfo.build.directories, output: join(staging, 'artifacts') },
    // Windows reuses its verified runtime. Mac builder obtains the matching
    // Electron distribution per target; an arm64 runtime cannot stand in for x64.
    ...(mac ? {} : { electronDist: join(root, 'node_modules/electron/dist') }),
    files: [...packageInfo.build.files, 'scripts/smoke*.cjs',
      'scripts/verifyVendor.cjs', 'scripts/readGoBuildInfo.cjs', 'scripts/verifyGoNotices.cjs', 'scripts/verifyMacSignature.cjs'],
    extraMetadata: { main: 'scripts/smokePackagedDependencies.cjs' },
  };
  const configPath = join(staging, 'smoke-builder.json');
  await writeFile(configPath, JSON.stringify(config, null, 2));
  await run(process.execPath, [join(staging, 'node_modules/electron-builder/out/cli/cli.js'), '--projectDir', staging,
    ...(mac ? ['--mac', '--x64', '--arm64'] : ['--win', '--x64']), '--dir', '--publish', 'never', '--config', configPath], root, 600000);
  const packages = mac ? [
    { arch: 'arm64', executable: join(staging, 'artifacts/mac-arm64/Fjoscam.app/Contents/MacOS/Fjoscam') },
    { arch: 'x64', executable: join(staging, 'artifacts/mac/Fjoscam.app/Contents/MacOS/Fjoscam') },
  ] : [{ arch: 'x64', executable: join(staging, 'artifacts/win-unpacked/Fjoscam.exe') }];
  const results = [];
  for (const { arch, executable } of packages) {
    for (const mode of ['app', 'tls', 'playback']) {
      const output = await run(executable, [`--dependency-smoke=${mode}`], staging, 45000);
      assert(output.includes('"result":"PASS"'), `No PASS result for ${arch}/${mode}.`);
      results.push(mac ? `${arch}/${mode}` : mode);
    }
  }
  const report = { result: 'PASS', staging, lockSha256: lockHash, node: process.version, npm: npmVersion,
    builtFromSource: true, platform: process.platform, architectures: packages.map((item) => item.arch), modes: results,
    note: 'Verification bootstrap only; not a distributable release or an installer/update-install test.' };
  await writeFile(join(staging, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
