import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraTlsSettings } from './CameraTlsSettings';
import type { CertificateInfo } from '../shared/types';

const target = { host: '192.0.2.1', protocol: 'https' as const, httpPort: 443 };
const certificate: CertificateInfo = { origin: 'https://192.0.2.1', fingerprint256: Array(32).fill('AB').join(':'),
  subject: 'Synthetic camera', issuer: 'Synthetic issuer', validFrom: 'Jan 1 2026', validTo: 'Jan 1 2027' };
beforeEach(() => Object.defineProperty(window, 'fjoscam', { configurable: true, value: { inspectCertificate: vi.fn(async () => certificate), inspectStreamCertificate: vi.fn(async () => ({ ...certificate, origin: 'rtsps://192.0.2.1:7441' })) } }));
afterEach(cleanup);

describe('explicit HTTPS certificate trust', () => {
  it('sends only the target to inspection and requires independent fingerprint confirmation', async () => {
    const onChange = vi.fn();
    const view = render(<CameraTlsSettings target={{ ...target, password: 'never-send' } as typeof target} onChange={onChange} />);
    fireEvent.click(view.getByText('Inspect HTTPS certificate'));
    await waitFor(() => expect(view.getByText('Use this certificate')).toBeDisabled());
    expect(window.fjoscam.inspectCertificate).toHaveBeenCalledWith(target);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.click(view.getByText('Use this certificate'));
    expect(onChange).toHaveBeenCalledWith({ origin: certificate.origin, fingerprint256: certificate.fingerprint256 });
  });

  it('discards a delayed inspection after the address changes', async () => {
    let resolve!: (value: CertificateInfo) => void;
    vi.mocked(window.fjoscam.inspectCertificate).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const onChange = vi.fn();
    const view = render(<CameraTlsSettings target={target} onChange={onChange} />);
    fireEvent.click(view.getByText('Inspect HTTPS certificate'));
    view.rerender(<CameraTlsSettings target={{ ...target, host: '192.0.2.2' }} onChange={onChange} />);
    resolve(certificate);
    await waitFor(() => expect(view.getByText('Inspect HTTPS certificate')).toBeEnabled());
    expect(view.queryByText('Use this certificate')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('allows removing an existing exception and never trusts on inspection failure', async () => {
    const onChange = vi.fn();
    vi.mocked(window.fjoscam.inspectCertificate).mockRejectedValue(new Error('Synthetic unavailable camera'));
    const view = render(<CameraTlsSettings target={target} trust={certificate} onChange={onChange} />);
    fireEvent.click(view.getByText('Inspect HTTPS certificate'));
    await waitFor(() => expect(view.getByRole('alert')).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(view.getByText('Remove certificate exception'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe('explicit RTSPS certificate trust', () => {
  it('inspects a saved stream by ID and requires deliberate confirmation', async () => {
    const onChange = vi.fn();
    const view = render(<CameraTlsSettings stream={{ url: '', cameraId: 'camera' }} onChange={onChange} />);
    fireEvent.click(view.getByText('Inspect RTSPS certificate'));
    await waitFor(() => expect(view.getByText('Use this certificate')).toBeDisabled());
    expect(window.fjoscam.inspectStreamCertificate).toHaveBeenCalledWith('', 'camera');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('checkbox')); fireEvent.click(view.getByText('Use this certificate'));
    expect(onChange).toHaveBeenCalledWith({ origin: 'rtsps://192.0.2.1:7441', fingerprint256: certificate.fingerprint256 });
  });

  it('discards delayed inspection when a new stream URL is entered', async () => {
    let resolve!: (value: CertificateInfo) => void;
    vi.mocked(window.fjoscam.inspectStreamCertificate).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const onChange = vi.fn();
    const view = render(<CameraTlsSettings stream={{ url: '', cameraId: 'camera' }} onChange={onChange} />);
    fireEvent.click(view.getByText('Inspect RTSPS certificate'));
    view.rerender(<CameraTlsSettings stream={{ url: 'rtsps://other.invalid/stream', cameraId: 'camera' }} onChange={onChange} />);
    resolve({ ...certificate, origin: 'rtsps://192.0.2.1:7441' });
    await waitFor(() => expect(view.getByText('Inspect RTSPS certificate')).toBeEnabled());
    expect(view.queryByText('Use this certificate')).toBeNull(); expect(onChange).not.toHaveBeenCalled();
  });
});
