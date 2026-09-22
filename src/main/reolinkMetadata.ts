import type { CameraChannelStatus, CameraDeviceInfo, Preset, StreamInfo } from '../shared/types.js';

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

function text(value: unknown, max = 512): string | undefined {
  if (typeof value !== 'string' || value.length > max) return undefined;
  return value.trim() || undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) return undefined;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 && result <= Number.MAX_SAFE_INTEGER ? result : undefined;
}

function integer(value: unknown, min: number, max: number): number | undefined {
  const result = number(value);
  return result !== undefined && Number.isSafeInteger(result) && result >= min && result <= max ? result : undefined;
}

export function parsePresets(value: unknown): Preset[] {
  const presets = new Map<number, Preset>();
  if (!Array.isArray(value)) return [];
  for (const raw of value) {
    const item = record(raw);
    if (!item || item.enable === 0 || item.enable === '0' || item.enable === false) continue;
    // Match the IDs supported by the existing preset IPC/control contract.
    const id = integer(item.id, 1, 64);
    if (id === undefined || presets.has(id)) continue;
    presets.set(id, { id, name: text(item.name) ?? `Preset ${id}` });
  }
  return [...presets.values()].sort((a, b) => a.id - b.id);
}

export function parseDeviceInfo(value: unknown): CameraDeviceInfo {
  const item = record(value);
  return {
    name: text(item?.name), model: text(item?.model),
    uid: text(item?.uid) ?? text(item?.serial),
    firmware: text(item?.version), hardware: text(item?.hardVer),
  };
}

export function parseChannelStatus(value: unknown): CameraChannelStatus[] {
  const channels = new Map<number, CameraChannelStatus>();
  if (!Array.isArray(value)) return [];
  for (const raw of value) {
    const item = record(raw);
    const channel = integer(item?.channel, 0, 65535);
    if (!item || channel === undefined || channels.has(channel)) continue;
    channels.set(channel, { channel, online: item.online === true || item.online === 1 || item.online === '1', name: text(item.name) });
  }
  return [...channels.values()];
}

export function parseStreamInfo(quality: 'high' | 'low', value: unknown): StreamInfo | undefined {
  const item = record(value);
  if (!item) return undefined;
  const size = text(item.size, 64);
  const dimensions = size?.match(/^(\d+)\*(\d+)$/);
  const width = integer(item.width, 1, Number.MAX_SAFE_INTEGER) ?? integer(dimensions?.[1], 1, Number.MAX_SAFE_INTEGER) ?? 0;
  const height = integer(item.height, 1, Number.MAX_SAFE_INTEGER) ?? integer(dimensions?.[2], 1, Number.MAX_SAFE_INTEGER) ?? 0;
  return {
    quality, width, height, resolution: width && height ? `${width}*${height}` : 'unknown',
    fps: number(item.frameRate) ?? 0, bitrateKbps: number(item.bitRate) ?? 0,
    codec: text(item.vType, 64),
  };
}
