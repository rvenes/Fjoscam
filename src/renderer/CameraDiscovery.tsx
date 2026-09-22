import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { CameraDiscoveryReport, CameraDiscoveryResult } from '../shared/types';

type SearchState = { phase: 'searching' } | { phase: 'ready'; report: CameraDiscoveryReport } | { phase: 'error'; message: string };

export function CameraDiscovery({ existingHosts, onSelect }: {
  existingHosts: ReadonlySet<string>;
  onSelect: (camera: CameraDiscoveryResult) => void;
}) {
  const [search, setSearch] = useState<SearchState>({ phase: 'searching' });
  const revision = useRef(0);
  const discoveryBusy = search.phase === 'searching';
  const discoveredCameras = search.phase === 'ready' ? search.report.cameras : [];
  const discoveryNetworks = search.phase === 'ready' ? search.report.networks : [];
  const count = discoveredCameras.length;
  const discoveryMessage = search.phase === 'error' ? search.message : discoveryBusy ? 'Searching local network...' : count > 0
    ? `Found ${count} possible camera${count === 1 ? '' : 's'}. Verify the device before entering credentials.`
    : 'No cameras found. You can still add one manually.';

  useEffect(() => {
    void scanForCameras();
    return () => { revision.current += 1; };
  }, []);

  async function scanForCameras() {
    const owner = ++revision.current;
    setSearch({ phase: 'searching' });
    try {
      const report = await window.fjoscam.discoverCameras();
      if (owner === revision.current) setSearch({ phase: 'ready', report });
    } catch (error) {
      if (owner === revision.current) setSearch({ phase: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <section className="discovery-panel">
      <div className="discovery-heading">
        <div>
          <strong>Possible cameras</strong>
          <span>{discoveryMessage || 'Search for ONVIF and RTSP cameras on this network.'}</span>
        </div>
        <button type="button" onClick={() => void scanForCameras()} disabled={discoveryBusy}>
          {discoveryBusy ? 'Searching...' : 'Search again'}
        </button>
      </div>
      {search.phase === 'ready' && (
        <details className="discovery-diagnostics">
          <summary>Search coverage and limits</summary>
          <p>ONVIF multicast uses the system-selected network. Port checks cover the private IPv4 networks below, even when ONVIF finds devices. Open ports do not verify the camera brand.</p>
          {discoveryNetworks.length === 0 ? <p>No eligible private IPv4 network found. Check your connection or enter the camera address manually.</p> : (
            <ul>{discoveryNetworks.map((network, index) => <li key={`${network.name}-${network.address}-${index}`}>
              {network.name} ({network.address}): {network.subnet}; {network.hostCount} addresses checked{network.scanSubnet ? ` in ${network.scanSubnet}` : ''}.
              {network.limitation === 'large-subnet' && ' Large network: only the local /24 was checked.'}
              {network.limitation === 'host-budget' && ' Search limited to 2048 unique addresses in total.'}
              {network.limitation === 'invalid-netmask' && ' Skipped: invalid network mask.'}
              {network.limitation === 'point-to-point' && ' Skipped: /31 and /32 networks require a manual address.'}
            </li>)}</ul>
          )}
          <p>Other VLANs, public IPv4 and IPv6 are not port-scanned. Enter those addresses manually. A changed IP never updates a saved camera automatically.</p>
        </details>
      )}
      {discoveredCameras.length > 0 && (
        <div className="discovery-list">
          {discoveredCameras.map((camera) => {
            const alreadyAdded = existingHosts.has(camera.host);
            return (
              <button type="button" key={camera.id} className={`discovery-item ${alreadyAdded ? 'already-added' : ''}`} onClick={() => onSelect(camera)}>
                <span className="discovery-main">
                  {alreadyAdded && <CheckCircle2 className="discovery-check" size={18} aria-label="Already added" />}
                  <span>
                    <strong>{discoveryDisplayName(camera)}</strong>
                    <small>{camera.host} · {camera.source === 'ws-discovery' ? 'ONVIF discovery' : 'Port scan'}</small>
                  </span>
                </span>
                <small>{discoveryPorts(camera)}</small>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function discoveryDisplayName(camera: CameraDiscoveryResult): string {
  return camera.name || [camera.manufacturer, camera.model].filter(Boolean).join(' ') || `Camera ${camera.host}`;
}

function discoveryPorts(camera: CameraDiscoveryResult): string {
  const parts = [
    camera.ports.http ? `HTTP ${camera.ports.http}` : '',
    camera.ports.https ? `HTTPS ${camera.ports.https}` : '',
    camera.ports.rtsp ? `RTSP ${camera.ports.rtsp}` : '',
    camera.ports.onvif ? `ONVIF ${camera.ports.onvif}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

