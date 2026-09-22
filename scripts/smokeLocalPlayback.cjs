// Run after npm run build: node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs
// Isolated, hidden Electron smoke test. Uses only synthetic loopback sources.
const { app, BrowserWindow, session, safeStorage, ipcMain } = require('electron');
const { mkdtemp, writeFile, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createServer } = require('node:net');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { once } = require('node:events');
const ownedChildren = new Set();
const originalSpawn = childProcess.spawn;
childProcess.spawn = function (executable, ...args) {
  const child = originalSpawn.call(this, executable, ...args);
  if (/(?:^|[\\/])go2rtc(?:\.exe)?$/.test(String(executable))) {
    ownedChildren.add(child); child.once('close', () => ownedChildren.delete(child));
  }
  return child;
};
process.on('exit', () => { for (const child of ownedChildren) child.kill(); });

app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
let bridge;
let snapshots;
let window;
const deadline = setTimeout(async () => {
  console.error('Local playback smoke test timed out.');
  window?.destroy();
  await Promise.allSettled([bridge?.stop(), snapshots?.stop()]);
  app.exit(1);
}, 25000);

(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fjoscam-electron-smoke-'));
  app.setPath('userData', dir);
  await app.whenReady();
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', () => reject(new Error('Port 1984 is occupied. Close Fjoscam before this test.')));
    probe.listen(1984, '127.0.0.1', () => probe.close(resolve));
  });
  const { Go2RtcBridge } = require('../dist-electron/main/go2rtcBridge.js');
  const { SnapshotServer } = require('../dist-electron/main/snapshotServer.js');
  const { installPlaybackAccess } = require('../dist-electron/main/playbackAccess.js');
  const { CameraStore } = require('../dist-electron/main/store.js');
  assert(safeStorage.isEncryptionAvailable(), 'OS encryption is unavailable.');
  const streamUrl = 'rtsp://synthetic:synthetic-pass@127.0.0.1:9/credential-token?enableSrtp';
  const fixture = { id: 'synthetic', kind: 'generic', name: 'Synthetic camera', host: '127.0.0.1',
    protocol: 'http', httpPort: 80, rtspPort: 554, username: '', channel: 0, streamChannel: 0,
    lowLatency: false, streamUrl };
  await writeFile(join(dir, 'cameras.json'), JSON.stringify({ cameras: [fixture], activeCameraId: fixture.id, secrets: {} }));
  await writeFile(join(dir, 'cameras.json.bak'), JSON.stringify({ cameras: [{ ...fixture, name: 'Previous name' }], activeCameraId: fixture.id, secrets: {} }));
  const store = new CameraStore(dir);
  const state = await store.getState();
  assert.equal(state.cameras[0].hasStreamUrl, true);
  assert(!Object.hasOwn(state.cameras[0], 'streamUrl'), 'Renderer state contains a saved URL.');
  for (const name of ['cameras.json', 'cameras.json.bak']) {
    const raw = await readFile(join(dir, name), 'utf8');
    assert(!raw.includes('credential-token') && !raw.includes('synthetic-pass'), 'Unprotected URL in migrated file.');
    const encrypted = JSON.parse(raw).encryptedStreamUrls.synthetic;
    assert.equal(JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64'))).streamUrl, streamUrl);
  }
  assert.equal(JSON.parse(await readFile(join(dir, 'cameras.json.bak'), 'utf8')).cameras[0].name, 'Previous name');
  await store.saveCamera({ ...fixture, name: 'Renamed', password: '', streamUrl: '' }, fixture.id);
  assert.equal((await store.getCameraWithSecret(fixture.id)).streamUrl, streamUrl);
  const snapshotState = await store.saveCamera({ ...fixture, kind: 'reolink', name: 'Synthetic snapshot',
    username: 'synthetic', password: 'synthetic-password', streamUrl: undefined });
  const snapshotCamera = snapshotState.cameras.find((camera) => camera.kind === 'reolink');
  assert(snapshotCamera, 'Missing Reolink snapshot fixture.');
  bridge = new Go2RtcBridge(store);
  snapshots = new SnapshotServer(store, { getSnapshot: async () => ({
    contentType: 'image/png',
    bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ9kAAAAASUVORK5CYII=', 'base64'),
  }) });
  await snapshots.start();
  const stream = await bridge.getStream('synthetic');
  const headers = { authorization: bridge.playbackAuthorization(stream.pageUrl, 'GET') };
  let registered = await (await fetch('http://127.0.0.1:1984/api/streams', { headers })).text();
  assert(registered.includes('credential-token') && !registered.includes('enableSrtp'), 'Stored URL did not reach playback with UniFi normalization.');
  const replacementUrl = streamUrl.replace('credential-token', 'replacement-token');
  await store.saveCamera({ ...fixture, password: '', streamUrl: replacementUrl }, fixture.id);
  await bridge.getStream(fixture.id);
  registered = await (await fetch('http://127.0.0.1:1984/api/streams', { headers })).text();
  assert(registered.includes('replacement-token') && !registered.includes('credential-token'), 'Bridge kept the old URL after replacement.');
  assert(!(await readFile(join(dir, 'go2rtc/go2rtc.yaml'), 'utf8')).includes('replacement-token'), 'Bridge persisted the replacement URL.');
  window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false,
    preload: join(__dirname, '../dist-electron/preload/preload.js'), backgroundThrottling: false } });
  // Empty synthetic state lets the actual built React app load without touching
  // private app data or connecting to a camera.
  ipcMain.handle('app:get-state', () => ({ cameras: [], activeCameraId: null, configurationNotice: 'recovered-from-backup' }));
  ipcMain.handle('app:get-version', () => 'synthetic-smoke');
  ipcMain.handle('app:get-fullscreen', () => window.isFullScreen());
  ipcMain.handle('camera:discover', () => ({ cameras: [], networks: [] }));
  ipcMain.handle('stream:set-audio', () => undefined);
  const browserSession = session.defaultSession;
  installPlaybackAccess(browserSession, bridge, snapshots, (id) => id === window.webContents.id, () => false);
  browserSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    callback({ cancel: ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) && url.hostname !== '127.0.0.1' });
  });
  const responses = [];
  browserSession.webRequest.onResponseStarted((details) => {
    const url = new URL(details.url);
    if (url.hostname === '127.0.0.1') responses.push({ path: url.pathname, status: details.statusCode });
  });
  const page = join(dir, 'playback-smoke.html');
  const { rendererContentSecurityPolicy } = require('../dist-electron/shared/contentSecurityPolicy.js');
  const csp = rendererContentSecurityPolicy();
  await writeFile(page, `<html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body><iframe src="${stream.pageUrl}"></iframe><img src="${snapshots.getSnapshotUrl(snapshotCamera.id)}" /></body></html>`);
  await window.loadFile(page);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (responses.some((item) => item.path === '/api/ws' && item.status === 101)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const path of ['/stream.html', '/video-stream.js', '/video-rtc.js', `/snapshot/${snapshotCamera.id}`]) {
    assert(responses.some((item) => item.path === path && item.status === 200), `Player resource did not load: ${path}`);
  }
  assert(responses.some((item) => item.path === '/api/ws' && item.status === 101), 'Authenticated WebSocket did not upgrade.');
  assert(await window.webContents.executeJavaScript('document.querySelector("img").naturalWidth > 0'), 'Snapshot image did not decode.');
  const denied = await window.webContents.executeJavaScript(`fetch('http://127.0.0.1:1984/api/streams').then(() => false, () => true)`);
  assert(denied, 'Renderer could reach bridge admin API.');
  assert.equal((await fetch('http://127.0.0.1:1984/api/streams')).status, 401);
  const { readPlayerHealth, setPlayerAudio } = require('../dist-electron/main/playerHealth.js');
  const frame = window.webContents.mainFrame.framesInSubtree.find((item) => item.url === stream.pageUrl);
  assert(frame, 'Local player frame is missing.');
  assert.equal((await readPlayerHealth(window.webContents, stream.pageUrl)).frames, 0, 'Offline source reported video frames.');
  // Exercise real composited frames in the existing cross-origin local player.
  // The fixture is canvas-generated and never connects to a camera.
  await frame.executeJavaScript(`(async () => {
    document.body.replaceChildren();
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const video = document.createElement('video'); video.muted = true; video.autoplay = true;
    document.body.append(canvas, video);
    video.srcObject = canvas.captureStream(10);
    let tick = 0;
    window.fixtureTimer = setInterval(() => {
      const context = canvas.getContext('2d'); context.fillStyle = ++tick % 2 ? 'red' : 'blue'; context.fillRect(0, 0, 64, 64);
    }, 100);
    await video.play();
  })()`, true);
  let observed;
  for (let attempt = 0; attempt < 50; attempt++) {
    observed = await readPlayerHealth(window.webContents, stream.pageUrl);
    if (observed.frames > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(observed.frames > 0 && observed.frameAgeMs < 2000, 'Real video frames were not observed.');
  await setPlayerAudio(window.webContents, false, 0.8);
  await setPlayerAudio(window.webContents, true, 0.2);
  assert.deepEqual(await frame.executeJavaScript('({muted:document.querySelector("video").muted,volume:document.querySelector("video").volume})'), { muted: true, volume: 0.2 });
  await frame.executeJavaScript('clearInterval(window.fixtureTimer); document.querySelector("video").pause()');
  await new Promise((resolve) => setTimeout(resolve, 300));
  const firstAge = (await readPlayerHealth(window.webContents, stream.pageUrl)).frameAgeMs;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert((await readPlayerHealth(window.webContents, stream.pageUrl)).frameAgeMs > firstAge, 'Stopped video did not age.');
  const generation = bridge.observePlayback(stream.pageUrl).generation;
  const ownedChild = [...ownedChildren][0]; assert(ownedChild, 'Missing owned bridge process.');
  const closed = once(ownedChild, 'close'); ownedChild.kill(); await closed;
  let restored;
  for (let attempt = 0; attempt < 80; attempt++) {
    restored = bridge.observePlayback(stream.pageUrl);
    if (restored.state === 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(restored.state, 'running', 'Owned bridge was not recovered.');
  assert.equal(restored.generation, generation + 1);
  assert.equal(restored.attempts, 1);
  const restoredStreams = await (await fetch('http://127.0.0.1:1984/api/streams', { headers })).json();
  assert(Object.hasOwn(restoredStreams, stream.streamName), 'Recovered bridge lost the registered stream.');
  const upgrades = responses.filter((item) => item.path === '/api/ws' && item.status === 101).length;
  await window.loadFile(page);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (responses.filter((item) => item.path === '/api/ws' && item.status === 101).length > upgrades) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(responses.filter((item) => item.path === '/api/ws' && item.status === 101).length > upgrades, 'Reloaded player did not authenticate after bridge recovery.');
  await bridge.invalidateCamera(fixture.id);
  assert.equal(bridge.isRunning(), false, 'Release kept the credential-bearing child alive.');
  assert.equal(bridge.observePlayback(stream.pageUrl).state, 'failed', 'Released player could trigger recovery.');
  const reopened = await bridge.getStream(fixture.id);
  assert.equal(reopened.pageUrl, stream.pageUrl, 'Release changed the configured playback mode.');
  assert.equal(bridge.observePlayback(reopened.pageUrl).state, 'running');
  await window.loadFile(join(__dirname, '../dist-renderer/index.html'));
  let appLoaded = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    appLoaded = await window.webContents.executeJavaScript(`document.querySelector('#root')?.textContent.includes('Add a camera to begin')`);
    if (appLoaded) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(appLoaded, 'Built React app did not load with sandbox/preload and CSP.');
  let noticeReady = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    noticeReady = await window.webContents.executeJavaScript(`!!document.querySelector('.configuration-notice[role="alert"]')`);
    if (noticeReady) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(noticeReady, 'Backup recovery notice did not arrive with the state.');
  assert(await window.webContents.executeJavaScript(`(() => {
    const notice = document.querySelector('.configuration-notice[role="alert"]');
    const box = notice?.getBoundingClientRect();
    return notice?.textContent.includes('Recent changes may be missing') && box.height > 0 && box.bottom < innerHeight && notice.scrollHeight <= notice.clientHeight;
  })()`), 'Backup recovery notice is missing or clipped.');
  if (process.argv.includes('--capture-recovery')) {
    await writeFile(join(__dirname, '../out/recovery-notice-smoke.png'), (await window.webContents.capturePage()).toPNG());
  }
  await window.webContents.executeJavaScript(`document.querySelector('button[title="Add camera"]').focus(); document.querySelector('button[title="Add camera"]').click()`);
  let modalReady = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    modalReady = await window.webContents.executeJavaScript(`!!document.querySelector('[role="dialog"][aria-modal="true"]')`);
    if (modalReady) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(modalReady, 'Camera settings did not open as a modal dialog.');
  const focusResult = await window.webContents.executeJavaScript(`(() => {
    const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
    const first = modal.querySelector('button');
    const buttons = [...modal.querySelectorAll('button')].filter(button => !button.disabled);
    const last = buttons.at(-1);
    document.querySelector('button[title="Add camera"]').focus();
    const trapped = modal.contains(document.activeElement);
    last.focus(); last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    const wrapped = document.activeElement === first;
    const inert = document.querySelector('.sidebar').inert;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return { trapped, wrapped, inert };
  })()`);
  assert.deepEqual(focusResult, { trapped: true, wrapped: true, inert: true }, 'Modal focus/inert checks failed in Chromium.');
  for (let attempt = 0; attempt < 20; attempt++) {
    modalReady = await window.webContents.executeJavaScript(`!!document.querySelector('[role="dialog"][aria-modal="true"]')`);
    if (!modalReady) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(modalReady, false, 'Escape did not close the modal.');
  assert(await window.webContents.executeJavaScript(`document.activeElement === document.querySelector('button[title="Add camera"]') && !document.querySelector('.sidebar').inert`), 'Modal did not restore focus and background access.');
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('meta[http-equiv="Content-Security-Policy"]').content`), csp);
  await window.webContents.executeJavaScript(`
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.effectiveDirective));
    const inline = document.createElement('script'); inline.textContent = 'window.cspInlineExecuted = true'; document.head.append(inline);
    const remote = document.createElement('script'); remote.src = 'https://192.0.2.1/synthetic.js'; document.head.append(remote);
    void fetch('https://192.0.2.1/synthetic').catch(() => undefined);
  `);
  let policyResult;
  for (let attempt = 0; attempt < 20; attempt++) {
    policyResult = await window.webContents.executeJavaScript('({inline: window.cspInlineExecuted === true, violations: window.cspViolations})');
    if (policyResult.violations.length >= 3) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(policyResult.inline, false, 'Production CSP allowed an inline script.');
  assert(policyResult.violations.filter(value => value === 'script-src-elem').length >= 2, 'Inline/external scripts were not blocked by CSP.');
  assert(policyResult.violations.includes('connect-src'), 'External fetch was not blocked by CSP.');
  if (process.argv.includes('--dev-renderer')) {
    await window.loadURL('http://127.0.0.1:5173/');
    let devLoaded = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      devLoaded = await window.webContents.executeJavaScript(`document.querySelector('#root')?.textContent.includes('Add a camera to begin')`);
      if (devLoaded) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(devLoaded, 'Vite React app did not load with development CSP.');
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('meta[http-equiv="Content-Security-Policy"]').content`), rendererContentSecurityPolicy(true));
  }
  console.log(JSON.stringify({ result: 'PASS', checks: ['Chromium modal focus, inert, Tab, Escape and focus return', 'stream release and explicit reopen', 'owned child crash and bounded recovery', 'authenticated player reload after recovery', 'OS-encrypted URL migration and backup', 'blank edit preserves URL', 'secret-free renderer state', 'URL replacement and UniFi normalization', 'iframe modules under CSP', 'authenticated WebSocket', 'snapshot image', 'renderer admin blocked', 'unauthenticated API blocked', 'offline is not live', 'real video frame observation', 'frame age after pause', 'latest mute and volume', 'built React app with sandbox/preload/CSP', 'inline and external scripts blocked', 'external fetch blocked', ...(process.argv.includes('--dev-renderer') ? ['Vite React app with development CSP'] : [])] }));
})().catch((error) => {
  // Errors from assertions contain no real camera data in this isolated test.
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  window?.destroy();
  await Promise.allSettled([bridge?.stop(), snapshots?.stop()]);
  clearTimeout(deadline);
  app.exit(process.exitCode || 0);
});
