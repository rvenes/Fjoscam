import { describe, expect, it } from 'vitest';
import { clickToPtzCommand, commandToReolinkOp } from './ptz.js';

describe('commandToReolinkOp', () => {
  it('maps zoom and preset commands to Reolink PTZ operations', () => {
    expect(commandToReolinkOp({ kind: 'zoom', direction: 'in', speed: 30 })).toBe('ZoomInc');
    expect(commandToReolinkOp({ kind: 'zoom', direction: 'out', speed: 30 })).toBe('ZoomDec');
    expect(commandToReolinkOp({ kind: 'preset', presetId: 3 })).toBe('ToPos');
  });
});

describe('clickToPtzCommand', () => {
  it('returns null in the center dead zone', () => {
    expect(clickToPtzCommand(0.5, 0.5, 25)).toBeNull();
  });

  it('maps picture corners to diagonal PTZ commands', () => {
    expect(clickToPtzCommand(0.1, 0.1, 25)).toEqual({ kind: 'move', direction: 'LeftUp', speed: 25 });
    expect(clickToPtzCommand(0.9, 0.9, 25)).toEqual({ kind: 'move', direction: 'RightDown', speed: 25 });
  });
});
