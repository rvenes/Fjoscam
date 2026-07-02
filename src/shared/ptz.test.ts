import { describe, expect, it } from 'vitest';
import { clickToPtzCommand, commandToReolinkOp, presetForKey, presetIdFromKey, zoomNudgeStep } from './ptz.js';

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

describe('presetIdFromKey', () => {
  it('maps digit keys 1-9 to preset ids 1-9 and 0 to 10', () => {
    expect(presetIdFromKey('Digit1')).toBe(1);
    expect(presetIdFromKey('Digit9')).toBe(9);
    expect(presetIdFromKey('Digit0')).toBe(10);
  });

  it('ignores other keys', () => {
    expect(presetIdFromKey('KeyA')).toBeNull();
    expect(presetIdFromKey('Numpad1')).toBeNull();
  });
});

describe('presetForKey', () => {
  const presets = [
    { id: 1, name: 'Gate' },
    { id: 3, name: 'Feed rack' },
    { id: 10, name: 'Pen 10' },
  ];

  it('looks up presets by id, not by list position', () => {
    // Preset 2 is missing: key 3 must still recall preset id 3.
    expect(presetForKey('Digit3', presets)?.name).toBe('Feed rack');
    expect(presetForKey('Digit2', presets)).toBeUndefined();
  });

  it('recalls preset id 10 with the 0 key', () => {
    expect(presetForKey('Digit0', presets)?.name).toBe('Pen 10');
  });
});

describe('zoomNudgeStep', () => {
  it('scales the step to the camera range', () => {
    expect(zoomNudgeStep({ min: 0, max: 34 })).toBe(5);
    expect(zoomNudgeStep({ min: 1000, max: 6000 })).toBe(750);
  });

  it('never returns less than one step', () => {
    expect(zoomNudgeStep({ min: 0, max: 2 })).toBe(1);
  });
});
