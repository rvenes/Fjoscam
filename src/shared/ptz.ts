import type { Preset, PtzCommand } from './types.js';

export function commandToReolinkOp(command: PtzCommand): string {
  switch (command.kind) {
    case 'move':
      return command.direction;
    case 'stop':
      return 'Stop';
    case 'zoom':
      return command.direction === 'in' ? 'ZoomInc' : 'ZoomDec';
    case 'zoomLevel':
    case 'zoomPosition':
      return 'ZoomPos';
    case 'focus':
      return command.direction === 'near' ? 'FocusDec' : 'FocusInc';
    case 'preset':
      return 'ToPos';
    default:
      return assertNever(command);
  }
}

export function clickToPtzCommand(xRatio: number, yRatio: number, speed: number): PtzCommand | null {
  const x = clamp(xRatio);
  const y = clamp(yRatio);
  const deadZone = 0.18;
  const dx = x - 0.5;
  const dy = y - 0.5;

  if (Math.abs(dx) < deadZone && Math.abs(dy) < deadZone) return null;

  if (Math.abs(dx) < deadZone) {
    return { kind: 'move', direction: dy < 0 ? 'Up' : 'Down', speed };
  }

  if (Math.abs(dy) < deadZone) {
    return { kind: 'move', direction: dx < 0 ? 'Left' : 'Right', speed };
  }

  if (dx < 0 && dy < 0) return { kind: 'move', direction: 'LeftUp', speed };
  if (dx > 0 && dy < 0) return { kind: 'move', direction: 'RightUp', speed };
  if (dx < 0 && dy > 0) return { kind: 'move', direction: 'LeftDown', speed };
  return { kind: 'move', direction: 'RightDown', speed };
}

// One keyboard/step nudge moves the optical zoom ~15% of the camera's range,
// so the feel is the same whether the range is 0-34 or 1000-6000.
export function zoomNudgeStep(range: { min: number; max: number }): number {
  return Math.max(1, Math.round((range.max - range.min) * 0.15));
}

// Key 1-9 maps to preset id 1-9, key 0 to preset id 10.
export function presetIdFromKey(code: string): number | null {
  if (/^Digit[1-9]$/.test(code)) return Number(code.slice(5));
  if (code === 'Digit0') return 10;
  return null;
}

export function presetForKey(code: string, presets: Preset[]): Preset | undefined {
  const id = presetIdFromKey(code);
  if (id === null) return undefined;
  return presets.find((preset) => preset.id === id);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function assertNever(value: never): never {
  throw new Error(`Unsupported PTZ command: ${JSON.stringify(value)}`);
}
