import { useEffect, useRef, useState } from 'react';
import type { CertificateInfo, HttpsTarget, HttpsTrust } from '../shared/types';

export function CameraTlsSettings({ target, stream, trust, onChange, highlighted = false }: ({
  target: HttpsTarget; stream?: undefined;
} | {
  target?: undefined; stream: { url: string; cameraId?: string };
}) & {
  trust?: HttpsTrust;
  highlighted?: boolean;
  onChange: (trust?: HttpsTrust) => void;
}) {
  const protocol = stream ? 'RTSPS' : 'HTTPS';
  const [certificate, setCertificate] = useState<CertificateInfo>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const generation = useRef(0);
  const inspectButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (highlighted) {
      inspectButton.current?.scrollIntoView?.({ block: 'center' });
      inspectButton.current?.focus();
    }
  }, [highlighted]);
  useEffect(() => {
    generation.current += 1;
    setCertificate(undefined); setConfirmed(false); setError(''); setBusy(false);
    return () => { generation.current += 1; };
  }, [target?.host, target?.protocol, target?.httpPort, stream?.url, stream?.cameraId]);

  async function inspect() {
    const current = ++generation.current;
    setBusy(true); setError(''); setCertificate(undefined); setConfirmed(false);
    try {
      const result = stream
        ? await window.fjoscam.inspectStreamCertificate(stream.url, stream.cameraId)
        : await window.fjoscam.inspectCertificate({ host: target.host, protocol: target.protocol, httpPort: target.httpPort });
      if (current === generation.current) setCertificate(result);
    } catch {
      if (current === generation.current) setError(`Could not inspect the ${protocol} certificate. Check the camera address, port and availability.${stream ? ' Plain RTSP has no TLS certificate.' : ''}`);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  return <section className="camera-tls" aria-label={`${protocol} certificate`}>
    <strong>{protocol} certificate</strong>
    <p>{trust ? 'This camera uses an explicitly trusted certificate:' : 'Certificates are verified automatically. For a self-signed certificate, inspect and verify it before adding an exception.'}</p>
    {trust && <>
      <p>{trust.origin}<br /><code>{trust.fingerprint256}</code></p>
      <button type="button" onClick={() => { onChange(undefined); setConfirmed(false); }}>Remove certificate exception</button>
    </>}
    <button ref={inspectButton} type="button" disabled={busy || (stream ? !stream.url.trim() && !stream.cameraId : !target.host.trim())} onClick={() => void inspect()}>{busy ? 'Inspecting certificate...' : `Inspect ${protocol} certificate`}</button>
    {certificate && <div>
      <p><strong>{certificate.origin}</strong><br />Issued to: {certificate.subject || '(not specified)'}<br />Issuer: {certificate.issuer || '(not specified)'}<br />Valid: {certificate.validFrom} – {certificate.validTo}</p>
      <p>SHA-256 fingerprint<br /><code>{certificate.fingerprint256}</code></p>
      <p>Compare this fingerprint with the certificate obtained directly from the camera or your administrator. This exception replaces the normal issuer, hostname and expiry checks for this exact certificate and address. A changed certificate will be blocked.</p>
      <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I have independently verified this fingerprint.</label>
      <button type="button" disabled={!confirmed} onClick={() => { onChange({ origin: certificate.origin, fingerprint256: certificate.fingerprint256 }); setCertificate(undefined); setConfirmed(false); }}>Use this certificate</button>
    </div>}
    {error && <p role="alert">{error}</p>}
    <small>Changes take effect when you save the camera. {stream ? 'This setting applies to RTSPS video and audio, including reconnects. Plain RTSP is unencrypted and has no certificate.' : 'This setting covers HTTPS controls and snapshots; video transport is configured separately.'}</small>
  </section>;
}
