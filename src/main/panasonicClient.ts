import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { CameraWithSecret, Preset, PtzCommand, PtzDirection } from '../shared/types.js';

export class PanasonicClient {
  getPresets(): Preset[] {
    return Array.from({ length: 10 }, (_item, index) => ({
      id: index + 1,
      name: `Preset ${index + 1}`,
    }));
  }

  async sendPtz(camera: CameraWithSecret, command: PtzCommand): Promise<void> {
    const direction = panasonicDirection(command);
    if (!direction) return;
    const url = this.controlUrl(camera);
    url.searchParams.set('Direction', direction);
    if (command.kind === 'preset') {
      url.searchParams.set('Data', String(command.presetId));
      url.searchParams.set('Type', 'Preset');
    }
    if (command.kind === 'focus') {
      url.searchParams.set('Dist', '1');
    }
    await requestPanasonic(url, camera);
  }

  streamUrl(camera: CameraWithSecret): URL {
    const path = camera.mjpegPath || '/nphMotionJpeg?Resolution=640x480&Quality=Standard';
    return new URL(path, `${camera.protocol}://${camera.host}:${camera.httpPort}`);
  }

  private controlUrl(camera: CameraWithSecret): URL {
    const path = camera.ptzPath || '/nphControlCamera';
    const url = new URL(path, `${camera.protocol}://${camera.host}:${camera.httpPort}`);
    url.searchParams.set('Resolution', '640x480');
    url.searchParams.set('Quality', 'Standard');
    url.searchParams.set('RPeriod', '0');
    url.searchParams.set('Size', 'STD');
    url.searchParams.set('PresetOperation', 'Move');
    url.searchParams.set('Language', '0');
    return url;
  }
}

export function openPanasonicStream(camera: CameraWithSecret): Promise<IncomingMessage> {
  const client = new PanasonicClient();
  return requestPanasonicStream(client.streamUrl(camera), camera);
}

async function requestPanasonic(url: URL, camera: CameraWithSecret): Promise<void> {
  const response = await requestPanasonicStream(url, camera);
  response.resume();
  await new Promise<void>((resolve, reject) => {
    response.on('end', resolve);
    response.on('error', reject);
  });
}

function requestPanasonicStream(url: URL, camera: CameraWithSecret): Promise<IncomingMessage> {
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const auth = Buffer.from(`${camera.username}:${camera.password}`, 'utf8').toString('base64');
  return new Promise((resolve, reject) => {
    const request = transport(
      url,
      {
        method: 'GET',
        headers: { authorization: `Basic ${auth}` },
        insecureHTTPParser: true,
        rejectUnauthorized: false,
      },
      (response) => {
        if ((response.statusCode ?? 500) >= 400) {
          response.resume();
          reject(new Error(`Panasonic HTTP ${response.statusCode}`));
          return;
        }
        resolve(response);
      },
    );
    request.on('error', reject);
    request.setTimeout(7000, () => request.destroy(new Error('Panasonic request timed out.')));
    request.end();
  });
}

function panasonicDirection(command: PtzCommand): string | undefined {
  switch (command.kind) {
    case 'move':
      return panasonicMove(command.direction);
    case 'zoom':
      return command.direction === 'in' ? 'ZoomTele' : 'ZoomWide';
    case 'focus':
      return command.direction === 'near' ? 'FocusNear' : 'FocusFar';
    case 'preset':
      return 'Preset';
    case 'stop':
    case 'zoomLevel':
      return undefined;
  }
}

function panasonicMove(direction: PtzDirection): string {
  switch (direction) {
    case 'Up':
    case 'LeftUp':
    case 'RightUp':
      return 'TiltUp';
    case 'Down':
    case 'LeftDown':
    case 'RightDown':
      return 'TiltDown';
    case 'Left':
      return 'PanLeft';
    case 'Right':
      return 'PanRight';
  }
}
