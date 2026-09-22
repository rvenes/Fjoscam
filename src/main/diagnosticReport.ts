import type { AppState } from '../shared/types.js';

type RuntimeInfo = { version: string; platform: string; arch: string; electron: string; node: string;
  uptimeSeconds: number; mainMemoryBytes: number };

// Construct an allowlist of fields; never redact a copy of camera data or logs.
// Even public camera fields (names, endpoints, usernames, IDs) stay local.
export function diagnosticReport(state: AppState, runtime: RuntimeInfo) {
  return {
    format: 1,
    generatedAt: new Date().toISOString(),
    application: { version: runtime.version, platform: runtime.platform, arch: runtime.arch,
      electron: runtime.electron, node: runtime.node, uptimeSeconds: runtime.uptimeSeconds,
      mainMemoryBytes: runtime.mainMemoryBytes },
    configurationRecovered: state.configurationNotice === 'recovered-from-backup',
    cameras: state.cameras.map((camera, index) => ({
      number: index + 1,
      active: camera.id === state.activeCameraId,
      kind: camera.kind === 'panasonic' ? 'panasonic' : camera.kind === 'generic' ? 'generic' : 'reolink',
      controlTransport: camera.kind === 'generic' ? 'none' : camera.protocol === 'https' ? 'https' : 'http',
      quality: camera.lowLatency ? 'low' : 'high',
      savedStream: camera.hasStreamUrl === true,
      httpsCertificateException: !!camera.httpsTrust,
      rtspsCertificateException: !!camera.rtspsTrust,
      onvifFallback: camera.allowInsecureOnvif === true,
    })),
    scope: 'Settings and main-process runtime only. No connectivity test, camera addresses/names/IDs, usernames, credentials, certificate contents, images or logs. Memory does not include renderer or video-service processes.',
  };
}
