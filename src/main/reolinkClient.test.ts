import { describe, expect, it } from 'vitest';
import { buildRtspUrl } from './reolinkClient.js';
import type { CameraWithSecret } from '../shared/types.js';

describe('buildRtspUrl', () => {
  it('builds a low-latency substream URL for channel 0', () => {
    const camera: CameraWithSecret = {
      id: '1',
      name: 'Barn',
      host: '192.168.1.30',
      protocol: 'http',
      httpPort: 80,
      rtspPort: 554,
      username: 'admin',
      password: 'p@ss word',
      channel: 0,
      streamChannel: 0,
      lowLatency: true,
    };

    expect(buildRtspUrl(camera)).toBe('rtsp://admin:p%40ss%20word@192.168.1.30:554/h264Preview_01_sub');
  });
});
