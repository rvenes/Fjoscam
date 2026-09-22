import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { CameraWithSecret, Preset, PtzCommand, PtzDirection } from '../shared/types.js';
import { cameraPathUrl } from '../shared/validation.js';
import { cameraTlsError, pinnedAgent } from './cameraTls.js';
import { panasonicPresets } from '../shared/cameraDefaults.js';

export class PanasonicClient {
  getPresets(): Preset[] {
    return panasonicPresets();
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
    return cameraPathUrl(camera, path);
  }

  private controlUrl(camera: CameraWithSecret): URL {
    const path = camera.ptzPath || '/nphControlCamera';
    const url = cameraPathUrl(camera, path);
    url.searchParams.set('Resolution', '640x480');
    url.searchParams.set('Quality', 'Standard');
    url.searchParams.set('RPeriod', '0');
    url.searchParams.set('Size', 'STD');
    url.searchParams.set('PresetOperation', 'Move');
    url.searchParams.set('Language', '0');
    return url;
  }
}

export function openPanasonicStream(camera: CameraWithSecret, signal?: AbortSignal): Promise<IncomingMessage> {
  const client = new PanasonicClient();
  return requestPanasonicStream(client.streamUrl(camera), camera, signal);
}

async function requestPanasonic(url: URL, camera: CameraWithSecret): Promise<void> {
  const response = await requestPanasonicStream(url, camera);
  response.resume();
  await new Promise<void>((resolve, reject) => {
    response.on('end', resolve);
    response.on('error', reject);
  });
}

function requestPanasonicStream(url: URL, camera: CameraWithSecret, signal?: AbortSignal): Promise<IncomingMessage> {
  if (signal?.aborted) return Promise.reject(new Error('Camera stream was cancelled.'));
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const auth = Buffer.from(`${camera.username}:${camera.password}`, 'utf8').toString('base64');
  const ownedAgent = pinnedAgent(url, camera.httpsTrust);
  return new Promise((resolve, reject) => {
    const request = transport(
      url,
      {
        method: 'GET',
        headers: { authorization: `Basic ${auth}` },
        insecureHTTPParser: true,
        rejectUnauthorized: true,
        agent: ownedAgent,
        signal,
      },
      (response) => {
        clearTimeout(deadline);
        if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
          response.destroy();
          reject(new Error(`Panasonic HTTP ${response.statusCode}`));
          return;
        }
        resolve(response);
      },
    );
    const deadline = setTimeout(() => {
      request.destroy(new Error('Panasonic connection timed out.'));
      ownedAgent?.destroy();
    }, 7000);
    request.on('close', () => { clearTimeout(deadline); ownedAgent?.destroy(); });
    request.on('error', (error) => reject(signal?.aborted ? new Error('Camera stream was cancelled.') : cameraTlsError(error)));
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
