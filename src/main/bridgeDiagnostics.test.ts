// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { bridgeDiagnostics } from './bridgeDiagnostics.js';

describe('allowlisted child diagnostics', () => {
  it('emits only fixed categories even when a log line contains arbitrary secrets', () => {
    const report = vi.fn(); const consume = bridgeDiagnostics(report);
    consume(Buffer.from('synthetic-password rtsp://user:secret@camera/private-token bind: address already '));
    consume(Buffer.from('in use\nprivate-data: permission denied\nunknown synthetic-secret error\n'));
    expect(report.mock.calls).toEqual([['port-in-use'], ['permission-denied']]);
  });
  it('discards overlong lines and resumes at a line boundary', () => {
    const report = vi.fn(); const consume = bridgeDiagnostics(report);
    for (let i = 0; i < 100; i++) consume(Buffer.alloc(1000, 'x'));
    consume(Buffer.from('permission denied\naccess is denied\n'));
    expect(report.mock.calls).toEqual([['permission-denied']]);
  });
});
