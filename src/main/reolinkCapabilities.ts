import type { CameraCapabilities, CapabilityStatus } from '../shared/types.js';

type Entry = { ver: number; permit?: number };
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
function integer(value: unknown): number | undefined {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

// Reolink HTTP API V7 pp.47-52: permit bits 1=operate, 2=write, 4=read.
// A nonzero permit never proves support. ptzType/ptzCtrl versions are enums.
export function normalizeCapabilities(input: unknown, channel: number): CameraCapabilities {
  const root = record(input) ?? {};
  let fields = root;
  if (Object.hasOwn(root, 'abilityChn')) {
    const channels = root.abilityChn;
    if (Array.isArray(channels)) {
      const tagged = channels.some((item) => Object.hasOwn(record(item) ?? {}, 'channel'));
      fields = record(tagged ? channels.find((item) => integer(record(item)?.channel) === channel) : channels[channel]) ?? {};
    } else fields = record(record(channels)?.[String(channel)]) ?? {};
    // Do not inherit NVR-wide or other channels' control permissions.
  }
  function entry(...keys: string[]): Entry | undefined {
    for (const key of keys) {
      if (!Object.hasOwn(fields, key)) continue;
      const raw = record(fields[key]);
      const ver = integer(raw?.ver);
      return ver === undefined ? undefined : { ver, permit: integer(raw?.permit) };
    }
    return undefined;
  }
  function status(value: Entry | undefined, mask: number, versions?: number[]): CapabilityStatus {
    if (!value) return 'unknown';
    if (value.ver === 0) return 'unsupported';
    if (versions && !versions.includes(value.ver)) return value.ver > Math.max(...versions) ? 'unknown' : 'unsupported';
    if (value.permit === undefined) return 'unknown';
    if (value.permit & mask) return 'available';
    return value.permit & 4 ? 'read-only' : 'denied';
  }
  const type = entry('ptzType');
  const ctrl = entry('ptzCtrl');
  const direction = entry('ptzDirection');
  // Direction version 0 means eight directions, not lack of PTZ support.
  // Use its operation permission when present; ptzType describes the mechanism.
  const movement = type ? { ...type, permit: Object.hasOwn(fields, 'ptzDirection') ? direction?.permit : type.permit } : undefined;
  const preset = entry('ptzPreset');
  // PT-only types must not acquire optical zoom/focus from a generic PTZ flag.
  const zoom = entry('supportDigitalZoom')?.ver ? entry('supportDigitalZoom') : ctrl;
  const ptOnly = type && [0, 3, 4, 6, 7].includes(type.ver);
  const digitalZoom = entry('supportDigitalZoom');
  const states = {
    ptz: status(movement, 1, [2, 3, 5, 6, 7]),
    presets: status(preset, 1 | 2),
    zoomFocus: ptOnly && !digitalZoom?.ver ? 'unsupported' as const : status(zoom, 1 | 2, digitalZoom?.ver ? undefined : [1, 2]),
    focus: ptOnly ? 'unsupported' as const : status(ctrl, 1 | 2, [2]),
    irLights: status(entry('ledControl', 'irLights'), 2),
    whiteLed: status(entry('floodLight', 'supportFLswitch', 'whiteLed'), 2),
    siren: status(entry('alarmAudio', 'supportAudioAlarm'), 1 | 2),
    motion: status(entry('alarmMd', 'supportMd'), 4),
    ai: status(entry('supportAi'), 4),
  };
  return {
    ptz: states.ptz === 'available', presets: states.presets === 'available',
    zoomFocus: states.zoomFocus === 'available', focus: states.focus === 'available',
    irLights: states.irLights === 'available', whiteLed: states.whiteLed === 'available',
    siren: states.siren === 'available', motion: states.motion === 'available', ai: states.ai === 'available',
    presetWrite: status(preset, 2) === 'available',
    fourDirections: direction?.ver === 1,
    status: states,
  };
}
