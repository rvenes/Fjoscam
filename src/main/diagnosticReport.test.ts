// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { diagnosticReport } from './diagnosticReport.js';
import type { AppState } from '../shared/types.js';

describe('diagnostic report privacy', () => {
  it('exports only explicit categories even when a record contains extra private fields', () => {
    const state = { activeCameraId: 'private-id', configurationNotice: 'recovered-from-backup', cameras: [{
      id: 'private-id', name: 'private-name', host: 'private-host', username: 'private-user', password: 'private-password',
      streamUrl: 'rtsps://private-url', encryptedPassword: 'private-encrypted-value', kind: 'generic', protocol: 'https',
      hasStreamUrl: true, lowLatency: false, httpsTrust: { origin: 'private-origin', fingerprint256: 'private-fingerprint' },
      rtspsTrust: { origin: 'private-origin', fingerprint256: 'private-fingerprint' }, allowInsecureOnvif: false,
      futurePrivateField: 'private-future',
    }] } as unknown as AppState;
    const report = diagnosticReport(state, { version: '1.0.9', platform: 'darwin', arch: 'arm64', electron: 'test', node: 'test', uptimeSeconds: 5, mainMemoryBytes: 1234 });
    expect(JSON.stringify(report)).not.toContain('private-');
    expect(report.configurationRecovered).toBe(true);
    expect(report.cameras).toEqual([{ number: 1, active: true, kind: 'generic', controlTransport: 'none', quality: 'high',
      savedStream: true, httpsCertificateException: true, rtspsCertificateException: true, onvifFallback: false }]);
  });
  it('supports no cameras and keeps memory scope explicit', () => {
    const report = diagnosticReport({ cameras: [], activeCameraId: null }, { version: '1.0.9', platform: 'win32', arch: 'x64', electron: 'test', node: 'test', uptimeSeconds: 0, mainMemoryBytes: 1 });
    expect(report.cameras).toEqual([]);
    expect(report.scope).toContain('Memory does not include renderer');
  });
});
