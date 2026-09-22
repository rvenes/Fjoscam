// Run after npm run build: node node_modules/electron/cli.js scripts/smokeCameraTls.cjs
// Main-process TLS and safeStorage checks using generated, disposable credentials.
const { app, safeStorage } = require('electron');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createServer } = require('node:https');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const assert = require('node:assert/strict');

let dir;
let server;
let relay;
const sockets = new Set();
const deadline = setTimeout(() => { console.error('Camera TLS smoke test timed out.'); app.exit(1); }, 25000);
(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fjoscam-tls-smoke-'));
  app.setPath('userData', dir);
  await app.whenReady();
  assert(safeStorage.isEncryptionAvailable(), 'OS encryption is unavailable.');
  const openssl = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'openssl.exe') : 'openssl';
  await promisify(execFile)(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=Fjoscam synthetic smoke', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { windowsHide: true, timeout: 15000 });
  let requests = 0;
  server = createServer({ key: await readFile(join(dir, 'key.pem')), cert: await readFile(join(dir, 'cert.pem')) }, (req, res) => {
    requests += 1; req.resume(); req.on('end', () => res.end('{}'));
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const target = { host: '127.0.0.1', protocol: 'https', httpPort: server.address().port };
  const url = new URL(`https://127.0.0.1:${target.httpPort}/`);
  const { requestJson } = require('../dist-electron/main/request.js');
  const { inspectCameraCertificate, inspectStreamCertificate } = require('../dist-electron/main/cameraTls.js');
  const { CameraStore } = require('../dist-electron/main/store.js');
  await assert.rejects(requestJson(url, { password: 'synthetic' }), /certificate/);
  const cert = await inspectCameraCertificate(target);
  assert.equal(requests, 0, 'Inspection or rejected TLS sent application data.');
  const httpsTrust = { origin: cert.origin, fingerprint256: cert.fingerprint256 };
  const store = new CameraStore(dir);
  const input = { ...target, name: 'Synthetic camera', kind: 'reolink', rtspPort: 554, username: 'synthetic',
    password: 'synthetic', channel: 0, streamChannel: 0, lowLatency: false, httpsTrust };
  const id = (await store.saveCamera(input)).cameras[0].id;
  const saved = await new CameraStore(dir).getCameraWithSecret(id);
  assert.deepEqual(saved.httpsTrust, httpsTrust);
  assert.deepEqual(await requestJson(url, { password: saved.password }, 2, saved.httpsTrust), {});
  const changedTrust = { ...httpsTrust, fingerprint256: Array(32).fill('00').join(':') };
  await assert.rejects(requestJson(url, { password: 'must-not-send' }, 2, changedTrust), /certificate/);
  await store.saveCamera({ ...input, password: '', httpsTrust: undefined }, id);
  const revoked = await store.getCameraWithSecret(id);
  await assert.rejects(requestJson(url, { password: revoked.password }, 2, revoked.httpsTrust), /certificate/);
  assert.equal(requests, 1, 'Credentials escaped the verified connection.');
  // The transport carries bytes unchanged. Reuse the synthetic TLS endpoint
  // with an HTTP payload here; RTSP/Digest is tested against bundled go2rtc.
  const { RtspsRelay, connectRtsps } = require('../dist-electron/main/rtspsRelay.js');
  const endpoint = `rtsps://127.0.0.1:${target.httpPort}`;
  const streamUrl = endpoint.replace('://', '://test:synthetic-stream-password@') + '/private-stream?token=synthetic-token';
  const streamCert = await inspectStreamCertificate(streamUrl);
  assert.equal(streamCert.origin, endpoint);
  await assert.rejects(connectRtsps(endpoint), /certificate/);
  const rtspsTrust = { origin: endpoint, fingerprint256: streamCert.fingerprint256 };
  const generic = { ...input, kind: 'generic', httpsTrust: undefined, password: '', streamUrl, rtspsTrust };
  const genericId = (await store.saveCamera(generic)).cameras.find((camera) => camera.kind === 'generic').id;
  const savedGeneric = await new CameraStore(dir).getCameraWithSecret(genericId);
  assert.equal(savedGeneric.streamUrl, streamUrl);
  assert.deepEqual(savedGeneric.rtspsTrust, rtspsTrust);
  assert(!(await readFile(join(dir, 'cameras.json'), 'utf8')).includes('synthetic-stream-password'));
  assert(!JSON.stringify(await store.getState()).includes('synthetic-token'));
  relay = new RtspsRelay();
  const transport = await relay.register(genericId, savedGeneric.streamUrl, savedGeneric.rtspsTrust);
  const ws = new WebSocket(transport); ws.on('error', () => {});
  await once(ws, 'open');
  const reply = once(ws, 'message');
  ws.send(Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n'));
  assert.match((await reply)[0].toString(), /HTTP\/1.1 200/);
  const closed = once(ws, 'close'); relay.revoke(genericId); await closed;
  assert.equal(requests, 2);
  console.log(JSON.stringify({ result: 'PASS', checks: ['untrusted HTTPS rejected', 'credential-free inspection', 'OS-encrypted camera save', 'persisted certificate pin', 'verified actual TLS connection', 'wrong pin rejected', 'removed exception rejected', 'RTSPS issuer checked on IP endpoint', 'RTSPS pin and encrypted URL persisted', 'RTSPS WebSocket transport in Electron', 'RTSPS revoke closes connection'] }));
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  await relay?.stop();
  for (const socket of sockets) socket.destroy();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  clearTimeout(deadline);
  // Only our mkdtemp-created directory contains these disposable test files.
  // Electron may keep cache files open on Windows; preserve them if removal fails.
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  app.exit(process.exitCode || 0);
});
