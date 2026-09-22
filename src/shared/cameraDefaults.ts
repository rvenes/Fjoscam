import type { Preset } from './types.js';

export function panasonicPresets(): Preset[] {
  return Array.from({ length: 10 }, (_item, index) => ({ id: index + 1, name: `Preset ${index + 1}` }));
}
