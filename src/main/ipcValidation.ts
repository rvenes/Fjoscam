import { cameraHttpOrigin, isCameraInputShape, validateCameraInput } from '../shared/validation.js';

type Check = (value: unknown) => boolean;
const text = (max: number): Check => (value) => typeof value === 'string' && value.length <= max;
const id: Check = (value) => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value);
const bool: Check = (value) => typeof value === 'boolean';
const number = (min: number, max: number, integer = false): Check => (value) => typeof value === 'number' &&
  Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isSafeInteger(value));
const oneOf = (...values: unknown[]): Check => (value) => values.includes(value);
const optional = (check: Check): Check => (value) => value === undefined || check(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const channel = number(0, 65535, true);
const position = number(0, Number.MAX_SAFE_INTEGER);
const speed = number(1, 64, true);
const preset = number(1, 64, true);

function ptz(value: unknown): boolean {
  if (!record(value)) return false;
  switch (value.kind) {
    case 'stop': return Object.keys(value).length === 1;
    case 'move': return oneOf('Up', 'Down', 'Left', 'Right', 'LeftUp', 'RightUp', 'LeftDown', 'RightDown')(value.direction) && speed(value.speed);
    case 'zoom': return oneOf('in', 'out')(value.direction) && speed(value.speed);
    case 'focus': return oneOf('near', 'far')(value.direction) && speed(value.speed);
    case 'zoomLevel': return oneOf(1, 2, 3, 4)(value.level);
    case 'zoomPosition': return position(value.position);
    case 'preset': return preset(value.presetId);
    default: return false;
  }
}

function cameraInput(value: unknown): boolean {
  return validateCameraInput(value, { requirePassword: false, requireStreamUrl: false }).length === 0;
}

function previewInput(value: unknown): boolean {
  // Fetch name is usable before a name is entered. It still needs validated
  // Reolink connection settings and an explicitly supplied password.
  return isCameraInputShape(value) && (value.kind === undefined || value.kind === 'reolink') &&
    validateCameraInput({ ...value, name: value.name.trim() || 'Preview' }).length === 0;
}

function certificateTarget(value: unknown): boolean {
  if (!record(value) || !text(2048)(value.host) || value.protocol !== 'https') return false;
  cameraHttpOrigin(value as Parameters<typeof cameraHttpOrigin>[0]);
  return true;
}

function whiteLed(value: unknown): boolean {
  return record(value) && Object.keys(value).length > 0 && Object.keys(value).every((key) => ['mode', 'enabled', 'brightness'].includes(key)) &&
    optional(number(0, 16, true))(value.mode) && optional(bool)(value.enabled) && optional(number(0, 100))(value.brightness) &&
    Object.values(value).some((entry) => entry !== undefined);
}

// Every exposed channel must opt in. Validation happens before storage,
// adapter calls, cache changes or PTZ queue/watchdog mutation.
const contracts: Record<string, Check[]> = {
  'app:get-state': [], 'app:get-version': [], 'app:get-fullscreen': [], 'app:check-for-updates': [],
  'app:download-update': [], 'app:quit-and-install-update': [], 'app:set-fullscreen': [bool],
  'camera:save': [cameraInput, optional(id)],
  'camera:remove': [id],
  'camera:reorder': [(value) => Array.isArray(value) && value.length <= 10000 && value.every(id) && new Set(value).size === value.length],
  'camera:set-active': [id], 'camera:set-stream-channel': [id, channel], 'camera:set-stream-quality': [id, bool],
  'camera:discover': [], 'camera:inspect-certificate': [certificateTarget],
  'camera:inspect-stream-certificate': [text(8192), optional(id)],
  'camera:test': [id], 'camera:get-presets': [id], 'camera:get-stream-info': [id], 'camera:get-profile': [id],
  'camera:get-ir-lights': [id], 'camera:set-ir-lights': [id, oneOf('auto', 'on', 'off')],
  'camera:get-white-led': [id], 'camera:set-white-led': [id, whiteLed],
  'camera:get-siren-config': [id], 'camera:play-siren': [id], 'camera:get-device-name': [previewInput],
  'camera:ptz': [id, ptz], 'camera:get-zoom-focus': [id], 'camera:set-zoom-position': [id, position],
  'camera:save-preset': [id, preset, text(31)], 'camera:delete-preset': [id, preset],
  'camera:get-snapshot-url': [id], 'camera:get-mjpeg-url': [id], 'camera:get-webrtc-stream': [id],
  'camera:release-stream': [id],
  'stream:get-health': [text(4096)], 'stream:set-audio': [bool, number(0, 1)],
};

export function validateIpcArguments(channelName: string, args: unknown[]): void {
  try {
    const checks = contracts[channelName];
    if (checks && args.length <= checks.length && checks.every((check, index) => check(args[index]))) return;
  } catch { /* Malformed input must never be reflected in an error. */ }
  throw new Error('Invalid IPC arguments.');
}
