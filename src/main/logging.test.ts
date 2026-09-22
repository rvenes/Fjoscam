// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeDiagnosticMessage } from './diagnostics.js';
const fs = vi.hoisted(() => ({ append: vi.fn(), stat: vi.fn(), rename: vi.fn(), unlink: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => 'H:/synthetic-log-test' } }));
vi.mock('node:fs/promises', () => ({ appendFile: fs.append, stat: fs.stat, rename: fs.rename, unlink: fs.unlink }));
import { logToFile } from './logging.js';

beforeEach(() => {
  vi.resetAllMocks(); fs.append.mockResolvedValue(undefined); fs.stat.mockResolvedValue({ size: 0 });
  fs.unlink.mockResolvedValue(undefined); fs.rename.mockResolvedValue(undefined);
});
describe('safe bounded diagnostic logging', () => {
  it.each([
    'Failed rtsp://user:synthetic-secret@camera/private-path?token=synthetic-token',
    'rtsps://camera/synthetic-secret',
    'https://camera/image?password=synthetic-secret',
    'http:\\/\\/camera/synthetic-secret',
    'rtsp%3A%2F%2Fcamera%2Fsynthetic-secret',
    '{"password":"synthetic-secret with spaces","userName":"synthetic-user"}',
    '{"access_token":"synthetic-secret","refreshToken":"synthetic-other"}',
    'Authorization: Basic synthetic-secret',
    'Authorization: Bearer synthetic-secret',
    'Cookie: session=synthetic-secret; other=synthetic-other',
    '<wsse:Password Type="digest">synthetic-secret</wsse:Password>',
    'password=synthetic-secret with spaces',
    'token=synthetic-secret&username=synthetic-user',
    'src=synthetic-secret',
    '{"password":"synthetic-secret without closing quote',
  ])('redacts credentials and whole URLs: %s', (message) => {
    const result = sanitizeDiagnosticMessage(message);
    expect(result).not.toMatch(/synthetic-|private-path/);
    expect(result).toMatch(/redacted/);
  });

  it('retains safe status diagnostics, bounds size and flattens control characters', () => {
    expect(sanitizeDiagnosticMessage('Camera HTTP 401; rspCode -6; process exited')).toBe('Camera HTTP 401; rspCode -6; process exited');
    expect(sanitizeDiagnosticMessage('start\r\nforged\x00line')).toBe('start  forged line');
    expect(sanitizeDiagnosticMessage('x'.repeat(100_000)).length).toBeLessThanOrEqual(2048);
  });

  it('sanitizes at the write boundary even when callers supply unsanitized text', async () => {
    await logToFile('synthetic.log', 'Request rtsp://camera/synthetic-secret password=synthetic-other');
    const written = String(fs.append.mock.calls[0][1]);
    expect(written).not.toContain('synthetic-');
    expect(written).toContain('[redacted]');
    await logToFile('../escape.log', 'test');
    expect(fs.append).toHaveBeenCalledOnce();
  });

  it('bounds the write queue when disk writes stall, then resumes normal logging', async () => {
    let release!: () => void;
    fs.append.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const writes = Array.from({ length: 1000 }, (_, index) => logToFile('queue.log', `safe line ${index}`));
    await vi.waitFor(() => expect(fs.append).toHaveBeenCalledOnce());
    release();
    await Promise.all(writes);
    expect(fs.append).toHaveBeenCalledTimes(128);
    await logToFile('queue.log', 'resumed');
    expect(fs.append).toHaveBeenCalledTimes(129);
  });

  it('does not reject callers when the disk write fails', async () => {
    fs.append.mockRejectedValueOnce(new Error('Synthetic disk failure'));
    await expect(logToFile('failure.log', 'safe line')).resolves.toBeUndefined();
    await expect(logToFile('failure.log', 'next line')).resolves.toBeUndefined();
    expect(fs.append).toHaveBeenCalledTimes(2);
  });

  it('stops appending at the size limit while rotation is blocked, then resumes', async () => {
    fs.stat.mockResolvedValue({ size: 5 * 1024 * 1024 });
    fs.rename.mockRejectedValueOnce(Object.assign(new Error('Synthetic locked log'), { code: 'EPERM' }));
    await expect(logToFile('rotation-locked.log', 'safe line')).resolves.toBeUndefined();
    expect(fs.append).not.toHaveBeenCalled();
    fs.rename.mockResolvedValueOnce(undefined);
    await logToFile('rotation-locked.log', 'resumed');
    expect(fs.rename).toHaveBeenCalledTimes(2);
    expect(fs.append).toHaveBeenCalledOnce();
    expect(fs.append.mock.calls[0][1]).toContain('resumed');
  });

  it('can append after the oversized file disappears during a failed rotation', async () => {
    fs.stat.mockResolvedValueOnce({ size: 5 * 1024 * 1024 }).mockResolvedValueOnce({ size: 0 });
    fs.rename.mockRejectedValueOnce(Object.assign(new Error('Synthetic disappeared log'), { code: 'ENOENT' }));
    await logToFile('rotation-missing.log', 'next line');
    expect(fs.append).toHaveBeenCalledOnce();
  });

  it('does not assume zero size when stat fails with a permissions error', async () => {
    fs.stat.mockRejectedValue(Object.assign(new Error('Synthetic denied stat'), { code: 'EACCES' }));
    await expect(logToFile('unknown-size.log', 'safe line')).resolves.toBeUndefined();
    expect(fs.append).not.toHaveBeenCalled();
  });

  it('rechecks size after a failed append that may have written partially', async () => {
    await logToFile('partial-append.log', 'first');
    fs.append.mockRejectedValueOnce(new Error('Synthetic partial write'));
    await logToFile('partial-append.log', 'second');
    fs.stat.mockResolvedValue({ size: 5 * 1024 * 1024 });
    fs.rename.mockRejectedValueOnce(new Error('Synthetic locked rotation'));
    await logToFile('partial-append.log', 'third');
    expect(fs.append).toHaveBeenCalledTimes(2);
    expect(fs.rename).toHaveBeenCalledOnce();
  });
});
