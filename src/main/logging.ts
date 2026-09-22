import { appendFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { sanitizeDiagnosticMessage } from './diagnostics.js';

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const approximateSizes = new Map<string, number>();
const pendingWrites = new Map<string, Promise<void>>();
const pendingCounts = new Map<string, number>();
const MAX_PENDING_LINES = 128;

// Appends a timestamped line to a log file under userData, rotating the file
// to `<name>.1` when it grows past MAX_LOG_BYTES. Never throws: logging must
// not be able to break the app.
export async function logToFile(fileName: string, message: string): Promise<void> {
  if (!/^[a-z][a-z0-9-]{0,63}\.log$/i.test(fileName)) return;
  let path: string;
  try { path = join(app.getPath('userData'), fileName); } catch { return; }
  const count = pendingCounts.get(path) ?? 0;
  if (count >= MAX_PENDING_LINES) return;
  pendingCounts.set(path, count + 1);
  const line = `${new Date().toISOString()} ${sanitizeDiagnosticMessage(message)}\n`;
  const previous = pendingWrites.get(path) ?? Promise.resolve();
  const next = previous.then(() => appendLogLine(path, line), () => appendLogLine(path, line));
  pendingWrites.set(path, next);
  await next.finally(() => {
    if (pendingWrites.get(path) === next) pendingWrites.delete(path);
    const remaining = (pendingCounts.get(path) ?? 1) - 1;
    if (remaining > 0) pendingCounts.set(path, remaining); else pendingCounts.delete(path);
  });
}

async function appendLogLine(path: string, line: string): Promise<void> {
  try {
    const incomingBytes = Buffer.byteLength(line, 'utf8');
    let size = approximateSizes.get(path);
    if (size === undefined) size = await logSize(path);

    if (size + incomingBytes > MAX_LOG_BYTES) {
      try {
        await unlink(`${path}.1`).catch(() => undefined);
        await rename(path, `${path}.1`);
        size = 0;
      } catch {
        size = await logSize(path);
        // A locked rename must not turn bounded logging into unlimited append.
        // Leave the cache untouched so the next line can retry rotation.
        if (size + incomingBytes > MAX_LOG_BYTES) return;
      }
    }

    await appendFile(path, line, 'utf8');
    approximateSizes.set(path, size + incomingBytes);
  } catch {
    // A failed append may have written part of its input. Recheck disk size.
    approximateSizes.delete(path);
  }
}

async function logSize(path: string): Promise<number> {
  try { return (await stat(path)).size; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error; // Unknown size must not bypass the log size limit.
  }
}
