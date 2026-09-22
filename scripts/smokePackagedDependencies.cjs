// Verification-only main entry, included only by checkPackagedDependencies.cjs.
// The production package main and application code are not modified.
const { app, BrowserWindow, safeStorage } = require('electron');
const { mkdtempSync, readFileSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { createServer } = require('node:http');
const childProcess = require('node:child_process');
const assert = require('node:assert/strict');

assert(app.isPackaged, 'Expected a packaged Electron runtime.');
const mode = process.argv.find((arg) => arg.startsWith('--dependency-smoke='))?.split('=')[1];
let spawnedBridge = false;
const ownedChildren = new Set();
process.on('exit', () => { for (const child of ownedChildren) child.kill(); });
const spawn = childProcess.spawn;
childProcess.spawn = function (executable, ...args) {
  const isBridge = /(?:^|[\\/])go2rtc(?:\.exe)?$/.test(String(executable));
  if (isBridge) {
    assert(String(executable).startsWith(join(process.resourcesPath, 'app.asar.unpacked', 'vendor', 'go2rtc')), 'go2rtc did not load from the package.');
    spawnedBridge = true;
  }
  const child = spawn.call(this, executable, ...args);
  if (isBridge) { ownedChildren.add(child); child.once('close', () => ownedChildren.delete(child)); }
  return child;
};
if (mode === 'tls') require('./smokeCameraTls.cjs');
else if (mode === 'playback') require('./smokeLocalPlayback.cjs');
else if (mode === 'app') {
  app.setPath('userData', mkdtempSync(join(tmpdir(), 'fjoscam-packaged-dependency-smoke-')));
  let server;
  let window;
  const timeout = setTimeout(() => { console.error('Packaged app check timed out.'); app.exit(1); }, 30000);
  (async () => {
    await app.whenReady();
    assert(safeStorage.isEncryptionAvailable());
    const vendorPath = join(process.resourcesPath, 'app.asar.unpacked/vendor/go2rtc');
    const vendorManifest = JSON.parse(readFileSync(join(vendorPath, 'manifest.json'), 'utf8'));
    assert.equal(vendorManifest.version, '1.9.14');
    assert(readFileSync(join(vendorPath, 'LICENSE'), 'utf8').includes('Copyright (c) 2022 Alexey Khit'));
    const { vendorTarget, verifyPackagedVendor } = require('./verifyVendor.cjs');
    const binary = vendorTarget(process.platform, process.arch);
    let vendorCheck;
    if (process.platform === 'darwin') {
      // Signing changes Mach-O bytes. First require the repository's actual
      // native signature/identity gate; never pretend source SHA matches a signed file.
      await require('./verifyMacSignature.cjs')({ electronPlatformName: 'darwin',
        appOutDir: resolve(process.resourcesPath, '../../..'), packager: { appInfo: { productFilename: 'Fjoscam' } } });
      const directories = readdirSync(vendorPath, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => item.name).sort();
      assert.deepEqual(directories, [binary.split('/')[0], 'notices'].sort());
      const build = require('./readGoBuildInfo.cjs').readGoBuildInfo(readFileSync(join(vendorPath, binary)));
      assert.equal(build.settings.GOARCH, process.arch === 'x64' ? 'amd64' : 'arm64');
      assert.equal(build.settings.GOOS, 'darwin');
      assert.equal(build.settings['vcs.revision'], vendorManifest.sourceCommit);
      assert.equal(build.version, `v${vendorManifest.version}`);
      vendorCheck = await require('./verifyGoNotices.cjs').verifyGoNotices(vendorPath, [build]);
    } else {
      vendorCheck = await verifyPackagedVendor(vendorPath, process.platform, process.arch);
      assert.deepEqual(vendorCheck.verified, [binary]);
    }
    assert.equal(vendorCheck.modules, 34);
    assert(vendorCheck.notices >= 34);
    const { CameraStore } = require('../dist-electron/main/store.js');
    const store = new CameraStore();
    const streamUrl = 'rtsp://test:synthetic-password@127.0.0.1:9/private-token?enableSrtp';
    const state = await store.saveCamera({ kind: 'generic', name: 'Packaged synthetic camera', host: '127.0.0.1',
      protocol: 'http', httpPort: 80, rtspPort: 554, username: '', password: '', channel: 0,
      streamChannel: 0, lowLatency: false, streamUrl });
    const id = state.cameras[0].id;
    const loaded = new Promise((resolveLoaded, reject) => app.once('browser-window-created', (_event, win) => {
      window = win; win.hide();
      win.webContents.once('did-finish-load', resolveLoaded);
      win.webContents.once('did-fail-load', (_event, code) => reject(new Error(`Packaged renderer failed: ${code}`)));
    }));
    // Run the actual production main, preload and bundled React renderer.
    require('../dist-electron/main/main.js');
    await loaded;
    const result = await window.webContents.executeJavaScript(`(async () => ({
      state: await window.fjoscam.getState(), version: await window.fjoscam.getVersion(),
      stream: await window.fjoscam.getWebRtcStream(${JSON.stringify(id)}),
      text: document.body.textContent, isolated: typeof window.require === 'undefined'
    }))()`);
    assert.equal(result.version, require('../package.json').version);
    assert.equal(result.state.cameras[0].hasStreamUrl, true);
    assert(!JSON.stringify(result.state).includes('synthetic-password'));
    assert(!JSON.stringify(result.state).includes('private-token'));
    assert(result.isolated); assert(result.text.includes('Fjoscam')); assert(spawnedBridge);
    const { autoUpdater } = require('electron-updater');
    let feedRequests = 0;
    let invalid = false;
    const feedName = process.platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml';
    const dummyArtifact = process.platform === 'darwin' ? 'never-download-mac.zip' : 'never-download.exe';
    server = createServer((req, res) => {
      feedRequests += 1;
      if (!req.url.startsWith(`/${feedName}`)) { res.writeHead(404).end(); return; }
      res.end(invalid ? 'version: [invalid' : `version: ${app.getVersion()}\nfiles:\n  - url: ${dummyArtifact}\n    sha512: ${Buffer.alloc(64).toString('base64')}\n    size: 1\n`);
    });
    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    autoUpdater.logger = null;
    autoUpdater.setFeedURL({ provider: 'generic', url: `http://127.0.0.1:${server.address().port}/` });
    assert.equal(autoUpdater.autoDownload, false); assert.equal(autoUpdater.autoInstallOnAppQuit, false);
    const update = await autoUpdater.checkForUpdates();
    assert.equal(update.isUpdateAvailable, false);
    assert.equal(update.updateInfo.version, app.getVersion());
    invalid = true;
    await assert.rejects(autoUpdater.checkForUpdates(), /parse|YAML|end|flow/i);
    assert.equal(feedRequests, 2, 'Unexpected download or extra feed request.');
    // Exercise production IPC and real child release, with an entirely fake
    // installer. Never invoke the original quitAndInstall in this test.
    await assert.rejects(window.webContents.executeJavaScript('window.fjoscam.quitAndInstallUpdate()'), /No downloaded update/);
    let installCalls = 0;
    autoUpdater.quitAndInstall = () => {
      assert.equal(ownedChildren.size, 0, 'Installer was invoked before the owned bridge exited.');
      installCalls += 1;
    };
    autoUpdater.emit('update-downloaded', { version: '99.0.0-smoke' });
    await window.webContents.executeJavaScript('window.fjoscam.quitAndInstallUpdate()');
    assert.equal(installCalls, 1, 'Explicit synthetic installer was not invoked exactly once.');
    autoUpdater.emit('error', new Error('Synthetic installer refused to start.'));
    const recovered = await window.webContents.executeJavaScript(`(async () => ({
      state: await window.fjoscam.getState(), stream: await window.fjoscam.getWebRtcStream(${JSON.stringify(id)})
    }))()`);
    assert.equal(recovered.state.cameras.length, 1);
    assert(recovered.stream.pageUrl && ownedChildren.size === 1, 'App could not reopen playback after installer failure.');
    // A --dir build does not generate app-update.yml, and builder strips the
    // build field from packaged package.json. Feed generation belongs to the
    // separate installer/release checks; this test covers the updater runtime.
    console.log(JSON.stringify({ result: 'PASS', electron: process.versions.electron, platform: process.platform, arch: process.arch, checks: [
      'packaged production main/preload/renderer', 'isolated OS-encrypted user data', 'go2rtc from asar.unpacked',
      'only matching platform go2rtc packaged, with Go inventory and notice hashes',
      'updater local generic feed', 'malformed YAML rejected', 'no automatic download/install',
      'synthetic installer waits for owned child exit', 'reconnect after installer failure',
    ] }));
    await new Promise((resolveClose) => server.close(resolveClose));
    clearTimeout(timeout); app.quit();
  })().catch(async (error) => {
    console.error(error.message); clearTimeout(timeout);
    server?.close(); window?.destroy(); app.exit(1);
  });
} else { console.error('Unknown verification mode.'); app.exit(1); }
