import { describe, expect, it } from 'vitest';
import { certificateProblem, errorMessage } from './cameraFeedback';

describe('camera feedback across Electron IPC', () => {
  it('recognizes certificate rejection after Electron wraps an error', () => {
    const error = new Error("Error invoking remote method 'camera:ptz': Error: Camera HTTPS certificate was not trusted. Inspect it in camera settings; verify the fingerprint before trusting it.");
    expect(certificateProblem(error)).toBe('HTTPS');
    expect(errorMessage(error)).toMatch(/^Camera HTTPS certificate/);
    expect(certificateProblem(new Error('RTSPS certificate changed. Verify it in camera settings before trusting it.'))).toBe('RTSPS');
  });
  it('does not classify timeout, login or arbitrary network failures as certificate failures', () => {
    for (const message of ['Camera request timed out.', 'Camera HTTP 401', 'RTSPS connection failed. Check the stream address and certificate in camera settings.']) {
      expect(certificateProblem(message)).toBeUndefined();
      expect(errorMessage(new Error(message))).toBe(message);
    }
  });
});
