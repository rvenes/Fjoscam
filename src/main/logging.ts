import { appendFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const approximateSizes = new Map<string, number>();
const pendingWrites = new Map<string, Promise<void>>();

// Appends a timestamped line to a log file under userData, rotating the file
// to `<name>.1` when it grows past MAX_LOG_BYTES. Never throws: logging must
// not be able to break the app.
export async function logToFile(fileName: string, message: string): Promise<void> {
  const path = join(app.getPath('userData'), fileName);
  const line = `${new Date().toISOString()} ${message}\n`;
  const previous = pendingWrites.get(path) ?? Promise.resolve();
  const next = previous.then(() => appendLogLine(path, line), () => appendLogLine(path, line));
  pendingWrites.set(path, next);
  await next.finally(() => {
    if (pendingWrites.get(path) === next) pendingWrites.delete(path);
  });
}

async function appendLogLine(path: string, line: string): Promise<void> {
  try {
    const incomingBytes = Buffer.byteLength(line, 'utf8');
    let size = approximateSizes.get(path);
    if (size === undefined) size = await stat(path).then((info) => info.size).catch(() => 0);

    if (size + incomingBytes > MAX_LOG_BYTES) {
      try {
        await unlink(`${path}.1`).catch(() => undefined);
        await rename(path, `${path}.1`);
        size = 0;
      } catch {
        size = await stat(path).then((info) => info.size).catch(() => 0);
      }
    }

    await appendFile(path, line, 'utf8');
    approximateSizes.set(path, size + incomingBytes);
  } catch {
    // Ignore logging failures.
  }
}
