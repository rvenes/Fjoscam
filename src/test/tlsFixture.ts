import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

// Generate disposable test credentials locally. No private keys are checked in.
// OpenSSL is available in Git for Windows and on the supported macOS CI hosts.
export async function tlsFixture(altNames = 'DNS:localhost,IP:127.0.0.1'): Promise<{ key: Buffer; cert: Buffer }> {
  const dir = await mkdtemp(join(tmpdir(), 'fjoscam-test-certificate-'));
  try {
    // A config file also works with macOS LibreSSL versions without -addext.
    const config = join(dir, 'openssl.cnf');
    await writeFile(config, `[req]\ndistinguished_name=test_name\n[test_name]\nCN=Fjoscam synthetic test\n[test_ext]\nsubjectAltName=${altNames}\nbasicConstraints=critical,CA:TRUE\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n`);
    const openssl = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'openssl.exe') : 'openssl';
    await promisify(execFile)(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=Fjoscam synthetic test', '-config', config, '-extensions', 'test_ext',
      '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { windowsHide: true, timeout: 15000 });
    return { key: await readFile(join(dir, 'key.pem')), cert: await readFile(join(dir, 'cert.pem')) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
