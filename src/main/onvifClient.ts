import { randomBytes, createHash } from 'node:crypto';
import type { CameraWithSecret, PtzCommand, PtzDirection } from '../shared/types.js';
import { requestText } from './request.js';

type OnvifProfile = {
  token: string;
  hasPtz: boolean;
};

export class OnvifClient {
  private readonly profiles = new Map<string, string>();

  async sendPtz(camera: CameraWithSecret, command: PtzCommand): Promise<void> {
    const token = await this.getProfileToken(camera);

    if (command.kind === 'stop') {
      await this.soap(camera, 'ptz_service', `
        <tptz:Stop>
          <tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>
          <tptz:PanTilt>true</tptz:PanTilt>
          <tptz:Zoom>true</tptz:Zoom>
        </tptz:Stop>
      `);
      return;
    }

    if (command.kind === 'preset') {
      await this.soap(camera, 'ptz_service', `
        <tptz:GotoPreset>
          <tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>
          <tptz:PresetToken>${escapeXml(String(command.presetId))}</tptz:PresetToken>
        </tptz:GotoPreset>
      `);
      return;
    }

    if (command.kind === 'zoomLevel') {
      await this.moveZoomFor(token, camera, -1, 2600);
      const zoomInMs = zoomLevelDuration(command.level);
      if (zoomInMs > 0) await this.moveZoomFor(token, camera, 1, zoomInMs);
      return;
    }

    const velocity = commandToVelocity(command);
    if (!velocity) return;

    await this.soap(camera, 'ptz_service', `
      <tptz:ContinuousMove>
        <tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>
        <tptz:Velocity>
          <tt:PanTilt x="${velocity.x}" y="${velocity.y}" />
          <tt:Zoom x="${velocity.zoom}" />
        </tptz:Velocity>
        <tptz:Timeout>PT1S</tptz:Timeout>
      </tptz:ContinuousMove>
    `);
  }

  private async getProfileToken(camera: CameraWithSecret): Promise<string> {
    const cached = this.profiles.get(camera.id);
    if (cached) return cached;

    const response = await this.soap(camera, 'media_service', '<trt:GetProfiles/>');
    const profiles = parseProfiles(response);
    const token = profiles.find((profile) => profile.hasPtz)?.token ?? profiles[0]?.token;
    if (!token) throw new Error('ONVIF did not return a PTZ profile token.');
    this.profiles.set(camera.id, token);
    return token;
  }

  private async soap(camera: CameraWithSecret, service: 'media_service' | 'ptz_service', body: string): Promise<string> {
    const url = new URL(`http://${camera.host}:8000/onvif/${service}`);
    return requestText(url, envelope(camera, body));
  }

  private async moveZoomFor(token: string, camera: CameraWithSecret, direction: -1 | 1, durationMs: number): Promise<void> {
    await this.soap(camera, 'ptz_service', `
      <tptz:ContinuousMove>
        <tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>
        <tptz:Velocity>
          <tt:Zoom x="${direction}" />
        </tptz:Velocity>
        <tptz:Timeout>PT${Math.max(1, Math.ceil(durationMs / 1000))}S</tptz:Timeout>
      </tptz:ContinuousMove>
    `);
    await sleep(durationMs);
    await this.soap(camera, 'ptz_service', `
      <tptz:Stop>
        <tptz:ProfileToken>${escapeXml(token)}</tptz:ProfileToken>
        <tptz:Zoom>true</tptz:Zoom>
      </tptz:Stop>
    `);
    await sleep(120);
  }
}

function envelope(camera: CameraWithSecret, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
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

function parseProfiles(xml: string): OnvifProfile[] {
  const profileMatches = [...xml.matchAll(/<[^/>]*Profiles\b([^>]*)>([\s\S]*?)<\/[^>]*Profiles>/g)];
  return profileMatches
    .map((match) => ({
      token: /token="([^"]+)"/.exec(match[1])?.[1] ?? '',
      hasPtz: /PTZConfiguration/i.test(match[2]),
    }))
    .filter((profile) => profile.token);
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
