import { randomBytes, createHash } from 'node:crypto';
import type { CameraConfig, CameraWithSecret, PtzCommand, PtzDirection } from '../shared/types.js';
import { cameraHttpOrigin } from '../shared/validation.js';
import { requestText } from './request.js';
import { CameraHttpError } from './cameraErrors.js';
import { child, ONVIF, OnvifFault, parseSoap, selectPtzProfile, unexpected } from './onvifXml.js';
import type { Element } from '@xmldom/xmldom';
import { MotionRenewal } from './motionRenewal.js';

type PtzTarget = { key: string; token: string; url: URL; expires: number };

export class OnvifClient {
  private readonly profiles = new Map<string, PtzTarget>();
  private readonly pendingProfiles = new Map<string, { key: string; promise: Promise<PtzTarget> }>();
  private readonly movementProfiles = new Map<string, PtzTarget>();
  private readonly configurations = new Map<string, string | null>();
  private readonly revisions = new Map<string, number>();
  private readonly renewal = new MotionRenewal();

  updateCameraConfiguration(id: string, camera?: CameraConfig): void {
    void this.renewal.cancel(id);
    this.configurations.set(id, camera ? configurationKey(camera) : null);
    this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
    this.profiles.delete(id);
    this.pendingProfiles.delete(id);
    this.movementProfiles.delete(id);
  }

  private assertAllowed(camera: CameraConfig): void {
    if ((camera.kind !== undefined && camera.kind !== 'reolink') || camera.allowInsecureOnvif !== true) {
      throw new Error('Unencrypted ONVIF fallback is disabled. Enable it in camera settings only on a trusted local network.');
    }
    if (this.configurations.has(camera.id) && this.configurations.get(camera.id) !== configurationKey(camera)) {
      throw new Error('Camera ONVIF settings changed. Retry using the saved settings.');
    }
  }

  async sendPtz(camera: CameraWithSecret, command: PtzCommand, current: () => boolean = () => true): Promise<void> {
    this.assertAllowed(camera);
    if (!['stop', 'preset', 'move', 'zoom', 'zoomLevel'].includes(command.kind)) throw new Error('ONVIF does not support this PTZ command.');
    const revision = this.revisions.get(camera.id) ?? 0;
    const active = () => current() && revision === (this.revisions.get(camera.id) ?? 0);
    if (!active()) return;
    // Serialize Stop/new motion after an in-flight lease renewal. Cancellation
    // takes effect immediately, before waiting for that network response.
    await this.renewal.cancel(camera.id);
    if (!active()) return;
    const key = profileKey(camera);
    const moving = command.kind === 'stop' ? this.movementProfiles.get(camera.id) : undefined;
    // Keep the exact token used for uncertain motion, even if its response
    // failed. Stop must not depend on a new profile discovery succeeding.
    const target = moving?.key === key ? moving : await this.getTarget(camera, revision);
    const { token } = target;
    if (!active()) return;

    if (command.kind === 'stop') {
      await this.soap(camera, target.url, ONVIF.ptz, 'Stop', `
        <tptz:Stop>
          <tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>
          <tptz:PanTilt>true</tptz:PanTilt>
          <tptz:Zoom>true</tptz:Zoom>
        </tptz:Stop>
      `);
      this.movementProfiles.delete(camera.id);
      return;
    }

    this.movementProfiles.set(camera.id, target);

    if (command.kind === 'preset') {
      await this.soap(camera, target.url, ONVIF.ptz, 'GotoPreset', `
        <tptz:GotoPreset>
          <tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>
          <tptz:PresetToken>${escapeXml(String(command.presetId))}</tptz:PresetToken>
        </tptz:GotoPreset>
      `);
      return;
    }

    if (command.kind === 'zoomLevel') {
      await this.moveZoomFor(target, camera, -1, 2600, active);
      const zoomInMs = zoomLevelDuration(command.level);
      if (zoomInMs > 0 && active()) await this.moveZoomFor(target, camera, 1, zoomInMs, active);
      return;
    }

    const velocity = commandToVelocity(command);
    if (!velocity) return;

    const body = `
      <tptz:ContinuousMove>
        <tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>
        <tptz:Velocity>
          <tt:PanTilt x="${velocity.x}" y="${velocity.y}" />
          <tt:Zoom x="${velocity.zoom}" />
        </tptz:Velocity>
        <tptz:Timeout>PT1S</tptz:Timeout>
      </tptz:ContinuousMove>
    `;
    const renew = async () => { await this.soap(camera, target.url, ONVIF.ptz, 'ContinuousMove', body); };
    await renew();
    if (active()) this.renewal.start(camera.id, active, renew);
  }

  private async getTarget(camera: CameraWithSecret, revision: number): Promise<PtzTarget> {
    const key = profileKey(camera);
    const cached = this.profiles.get(camera.id);
    if (cached?.key === key && cached.expires > Date.now()) return cached;
    const pending = this.pendingProfiles.get(camera.id);
    if (pending?.key === key) return pending.promise;
    const entry = { key, promise: this.discover(camera, revision, key) };
    this.pendingProfiles.set(camera.id, entry);
    try { return await entry.promise; }
    finally { if (this.pendingProfiles.get(camera.id) === entry) this.pendingProfiles.delete(camera.id); }
  }

  private async discover(camera: CameraWithSecret, revision: number, key: string): Promise<PtzTarget> {
    const origin = cameraHttpOrigin({ host: camera.host, protocol: 'http', httpPort: camera.onvifPort ?? 8000 });
    let media = new URL('/onvif/media_service', origin);
    let ptz = new URL('/onvif/ptz_service', origin);
    try {
      const response = await this.soap(camera, new URL('/onvif/device_service', origin), ONVIF.device, 'GetCapabilities',
        '<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>');
      const capabilities = child(response, ONVIF.device, 'Capabilities');
      if (!capabilities) throw unexpected();
      media = serviceAddress(capabilities, 'Media', origin);
      ptz = serviceAddress(capabilities, 'PTZ', origin);
    } catch (error) {
      // Only a positively unsupported device operation permits legacy paths.
      // Never mask authentication, transport, invalid XML or unsafe addresses.
      if (!((error instanceof CameraHttpError && [404, 405, 501].includes(error.status)) ||
        (error instanceof OnvifFault && error.unsupported))) throw error;
    }
    // No extra authenticated request after a settings change during discovery.
    if (revision !== (this.revisions.get(camera.id) ?? 0)) throw new Error('Camera ONVIF settings changed. Retry using the saved settings.');
    const response = await this.soap(camera, media, ONVIF.media, 'GetProfiles', '<trt:GetProfiles/>');
    const target = { key, token: selectPtzProfile(response, camera.channel), url: ptz, expires: Date.now() + 5 * 60_000 };
    if (revision === (this.revisions.get(camera.id) ?? 0) && this.pendingProfiles.get(camera.id)?.key === key) this.profiles.set(camera.id, target);
    return target;
  }

  private async soap(camera: CameraWithSecret, url: URL, namespace: string, command: string, body: string): Promise<Element> {
    this.assertAllowed(camera);
    const revision = this.revisions.get(camera.id) ?? 0;
    try {
      // Never forward WS-Security credentials through redirects to other ports
      // or protocols. Every discovered URL has the configured origin.
      const response = await requestText(url, envelope(camera, body), `application/soap+xml; charset=utf-8; action="${namespace}/${command}"`, 0);
      return parseSoap(response, namespace, command);
    } catch (error) {
      if (revision === (this.revisions.get(camera.id) ?? 0) && this.profiles.get(camera.id)?.key === profileKey(camera)) this.profiles.delete(camera.id);
      throw error;
    }
  }

  private async moveZoomFor(target: PtzTarget, camera: CameraWithSecret, direction: -1 | 1, durationMs: number, current: () => boolean): Promise<void> {
    if (!current()) return;
    const { token } = target;
    await this.soap(camera, target.url, ONVIF.ptz, 'ContinuousMove', `
      <tptz:ContinuousMove>
        <tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>
        <tptz:Velocity>
          <tt:Zoom x="${direction}" />
        </tptz:Velocity>
        <tptz:Timeout>PT${Math.max(1, Math.ceil(durationMs / 1000))}S</tptz:Timeout>
      </tptz:ContinuousMove>
    `);
    await sleep(durationMs);
    await this.soap(camera, target.url, ONVIF.ptz, 'Stop', `
      <tptz:Stop>
        <tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>
        <tptz:Zoom>true</tptz:Zoom>
      </tptz:Stop>
    `);
    await sleep(120);
  }
}

function configurationKey(camera: CameraConfig): string {
  return JSON.stringify([camera.kind ?? 'reolink', camera.host, camera.onvifPort ?? 8000, camera.username, camera.channel, camera.allowInsecureOnvif === true]);
}

function profileKey(camera: CameraWithSecret): string {
  return `${configurationKey(camera)}:${createHash('sha256').update(camera.password).digest('hex')}`;
}

function envelope(camera: CameraWithSecret, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
  xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
  xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Header>${securityHeader(camera)}</s:Header>
  <s:Body>${body}</s:Body>
</s:Envelope>`;
}

function securityHeader(camera: CameraWithSecret): string {
  const nonce = randomBytes(16);
  const created = new Date().toISOString();
  const digest = createHash('sha1')
    .update(Buffer.concat([nonce, Buffer.from(created, 'utf8'), Buffer.from(camera.password, 'utf8')]))
    .digest('base64');

  return `
    <wsse:Security
      s:mustUnderstand="1"
      xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
      xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${escapeXml(camera.username)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
        <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString('base64')}</wsse:Nonce>
        <wsu:Created>${created}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>`;
}

function serviceAddress(capabilities: Element, name: 'Media' | 'PTZ', origin: string): URL {
  const service = child(capabilities, ONVIF.schema, name);
  const address = service && child(service, ONVIF.schema, 'XAddr')?.textContent?.trim();
  if (!address) throw new Error('ONVIF camera did not report the required Media/PTZ service.');
  let url: URL;
  try { url = new URL(address); } catch { throw unexpected(); }
  if (url.origin !== new URL(origin).origin || url.username || url.password || url.hash) {
    throw new Error('ONVIF service address outside the configured HTTP origin was blocked.');
  }
  return url;
}

function commandToVelocity(command: PtzCommand): { x: string; y: string; zoom: string } | null {
  if (command.kind === 'move') {
    const amount = scaleSpeed(command.speed);
    const vector = directionVector(command.direction);
    return {
      x: formatVelocity(vector.x * amount),
      y: formatVelocity(vector.y * amount),
      zoom: '0',
    };
  }

  if (command.kind === 'zoom') {
    return {
      x: '0',
      y: '0',
      zoom: formatVelocity((command.direction === 'in' ? 1 : -1) * scaleSpeed(command.speed)),
    };
  }

  return null;
}

function directionVector(direction: PtzDirection): { x: number; y: number } {
  switch (direction) {
    case 'Up':
      return { x: 0, y: 1 };
    case 'Down':
      return { x: 0, y: -1 };
    case 'Left':
      return { x: -1, y: 0 };
    case 'Right':
      return { x: 1, y: 0 };
    case 'LeftUp':
      return { x: -0.7, y: 0.7 };
    case 'RightUp':
      return { x: 0.7, y: 0.7 };
    case 'LeftDown':
      return { x: -0.7, y: -0.7 };
    case 'RightDown':
      return { x: 0.7, y: -0.7 };
  }
}

function scaleSpeed(speed: number): number {
  return Math.max(0.08, Math.min(1, speed / 64));
}

function zoomLevelDuration(level: 1 | 2 | 3 | 4): number {
  switch (level) {
    case 1:
      return 0;
    case 2:
      return 850;
    case 3:
      return 1700;
    case 4:
      return 2700;
  }
}

function formatVelocity(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
