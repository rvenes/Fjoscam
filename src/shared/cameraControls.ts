import type { CameraConfig, CameraProfile, PtzCommand } from './types.js';

export function isReolinkCamera(camera: Pick<CameraConfig, 'kind'>): boolean {
  return camera.kind === undefined || camera.kind === 'reolink';
}

export function cameraControls(camera: CameraConfig | null, profile?: CameraProfile) {
  const panasonic = camera?.kind === 'panasonic';
  const reolink = !!camera && isReolinkCamera(camera);
  const capabilities = reolink ? profile?.capabilities : undefined;
  return {
    move: panasonic || capabilities?.ptz === true,
    zoom: panasonic || capabilities?.zoomFocus === true,
    focus: panasonic || (capabilities?.focus ?? capabilities?.zoomFocus) === true,
    presets: panasonic || capabilities?.presets === true,
    presetWrite: reolink && (capabilities?.presetWrite ?? capabilities?.presets) === true,
    ir: capabilities?.irLights === true,
    light: capabilities?.whiteLed === true,
    siren: capabilities?.siren === true,
    fourDirections: capabilities?.fourDirections === true,
  };
}

export function allowsPtz(command: PtzCommand, controls: ReturnType<typeof cameraControls>): boolean {
  switch (command.kind) {
    case 'stop': return true; // Never gate a safety Stop on a late capability read.
    case 'move': return controls.move && (!controls.fourDirections || ['Up', 'Down', 'Left', 'Right'].includes(command.direction));
    case 'zoom': case 'zoomLevel': case 'zoomPosition': return controls.zoom;
    case 'focus': return controls.focus;
    case 'preset': return controls.presets;
  }
}

export function supportsSecondaryLens(camera: CameraConfig, profile?: CameraProfile): boolean {
  if (!isReolinkCamera(camera)) return false;
  if (camera.lensMode === 'single') return false;
  if (camera.lensMode === 'dual') return true;
  // Device-level NVR metadata and arbitrary view channel numbers are not lens detection.
  return camera.channel === 0 && /^Reolink\s+TrackMix\b|^TrackMix\b/i.test(profile?.device?.model ?? '');
}
