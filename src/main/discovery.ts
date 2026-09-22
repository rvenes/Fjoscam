import { randomUUID } from 'node:crypto';
import dgram from 'node:dgram';
import net from 'node:net';
import { networkInterfaces } from 'node:os';
import type { CameraDiscoveryReport, CameraDiscoveryResult } from '../shared/types.js';
import { discoveryScanPlan } from './discoveryNetworks.js';
import { child, children, ONVIF, parseSoapEnvelope } from './onvifXml.js';

const DISCOVERY_ADDRESS = '239.255.255.250';
const DISCOVERY_PORT = 3702;
const PROBE_TIMEOUT_MS = 3200;
const CONNECT_TIMEOUT_MS = 420;
const SCAN_PORTS = [80, 443, 554, 8000, 9000] as const;
const DISCOVERY_NS = 'http://schemas.xmlsoap.org/ws/2005/04/discovery';
const ADDRESSING_NS = 'http://schemas.xmlsoap.org/ws/2004/08/addressing';

let pendingDiscovery: Promise<CameraDiscoveryReport> | undefined;
export function discoverCameras(): Promise<CameraDiscoveryReport> {
  if (pendingDiscovery) return pendingDiscovery;
  const plan = discoveryScanPlan(networkInterfaces());
  pendingDiscovery = Promise.all([wsDiscovery(), subnetScan(plan.hosts)])
    .then(([multicast, scanned]) => ({ cameras: dedupeResults([...multicast, ...scanned]), networks: plan.networks }))
    .finally(() => { pendingDiscovery = undefined; });
  return pendingDiscovery;
}

export async function wsDiscovery(): Promise<CameraDiscoveryResult[]> {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const responses: Buffer[] = [];
  const probeId = `uuid:${randomUUID()}`;
  const probe = Buffer.from(discoveryProbe(probeId), 'utf8');

  return new Promise((resolve) => {
    let finished = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let totalBytes = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      // Keep the error listener until close; queued socket errors are harmless.
      try { socket.close(); } catch { /* Bind may have failed before opening. */ }
      resolve(responses.flatMap((buffer) => parseProbeMatches(buffer.toString('utf8'), probeId)));
    };

    socket.on('message', (message) => {
      if (finished || responses.length >= 512 || totalBytes + message.length > 4 * 1024 * 1024) return;
      totalBytes += message.length;
      responses.push(message);
    });
    socket.on('error', finish);
    timers.push(setTimeout(finish, PROBE_TIMEOUT_MS));
    try {
      socket.bind(() => {
        if (finished) return;
        try {
          socket.setMulticastTTL(2);
          socket.setBroadcast(true);
          for (let index = 0; index < 3; index += 1) {
            timers.push(setTimeout(() => {
              if (finished) return;
              try { socket.send(probe, DISCOVERY_PORT, DISCOVERY_ADDRESS, (error) => { if (error) finish(); }); }
              catch { finish(); }
            }, index * 350));
          }
        } catch { finish(); }
      });
    } catch { finish(); }
  });
}

export function parseProbeMatches(xml: string, probeId?: string): CameraDiscoveryResult[] {
  try {
    const root = parseSoapEnvelope(xml);
    const header = child(root, ONVIF.soap, 'Header');
    if (probeId && (!header || child(header, ADDRESSING_NS, 'RelatesTo')?.textContent?.trim() !== probeId)) return [];
    const body = child(root, ONVIF.soap, 'Body');
    if (!body || Array.from(body.childNodes).filter((node) => node.nodeType === 1).length !== 1) return [];
    const matches = child(body, DISCOVERY_NS, 'ProbeMatches');
    if (!matches) return [];
    return children(matches, DISCOVERY_NS, 'ProbeMatch').flatMap((block) => {
      try { return parseProbeMatch(block); } catch { return []; }
    });
  } catch { return []; } // Malformed network input is neither logged nor reflected.
}

function parseProbeMatch(block: Parameters<typeof child>[0]): CameraDiscoveryResult[] {
    const xaddrs = (child(block, DISCOVERY_NS, 'XAddrs')?.textContent ?? '')
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const scopes = (child(block, DISCOVERY_NS, 'Scopes')?.textContent ?? '')
      .split(/\s+/)
      .map((value) => { try { return decodeURIComponent(value.trim()); } catch { return ''; } })
      .filter((value) => value.startsWith('onvif://') && value.length <= 512);
    const urls = xaddrs.flatMap((value) => safeUrl(value));
    const name = scopeValue(scopes, 'name') ?? scopeValue(scopes, 'hardware');
    const model = scopeValue(scopes, 'hardware') ?? scopeValue(scopes, 'model');
    const manufacturer = scopes.find((scope) => /reolink/i.test(scope)) ? 'Reolink' : scopeValue(scopes, 'manufacturer');
    return [...new Set(urls.map((url) => url.hostname))].map((host) => ({
      id: `ws-${host}`,
      host,
      name,
      manufacturer,
      model,
      xaddrs: urls.filter((url) => url.hostname === host).map((url) => url.href),
      scopes,
      ports: portsFromUrls(urls.filter((url) => url.hostname === host)),
      source: 'ws-discovery' as const,
    }));
}

async function subnetScan(hosts: string[]): Promise<CameraDiscoveryResult[]> {
  const results: CameraDiscoveryResult[] = [];
  const concurrency = 48;
  let index = 0;

  async function worker(): Promise<void> {
    while (index < hosts.length) {
      const host = hosts[index];
      index += 1;
      const openPorts = await probeHost(host);
      if (openPorts.length === 0) continue;
      results.push({
        id: `scan-${host}`,
        host,
        name: `Camera ${host}`,
        xaddrs: [],
        scopes: [],
        ports: {
          http: openPorts.includes(80) ? 80 : undefined,
          https: openPorts.includes(443) ? 443 : undefined,
          rtsp: openPorts.includes(554) ? 554 : undefined,
          onvif: openPorts.includes(8000) ? 8000 : undefined,
          reolink: openPorts.includes(9000) ? 9000 : undefined,
        },
        source: 'subnet-scan',
      });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function probeHost(host: string): Promise<number[]> {
  const checks = await Promise.all(SCAN_PORTS.map(async (port) => ((await isPortOpen(host, port)) ? port : undefined)));
  const open = checks.filter((port): port is (typeof SCAN_PORTS)[number] => typeof port === 'number');
  return open.includes(554) || open.includes(8000) || open.includes(9000) ? open : [];
}

function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    let socket: net.Socket;
    let finished = false;
    const done = (open: boolean) => {
      if (finished) return;
      finished = true;
      socket?.destroy();
      resolve(open);
    };
    try {
      socket = net.createConnection({ host, port });
      socket.on('error', () => done(false)); // Keep until close: a queued error must not escape.
      socket.on('connect', () => done(true));
      socket.on('timeout', () => done(false));
      socket.setTimeout(CONNECT_TIMEOUT_MS);
    } catch { done(false); }
  });
}

function dedupeResults(results: CameraDiscoveryResult[]): CameraDiscoveryResult[] {
  const byHost = new Map<string, CameraDiscoveryResult>();
  for (const result of results) {
    const existing = byHost.get(result.host);
    byHost.set(result.host, existing ? mergeResult(existing, result) : result);
  }
  return [...byHost.values()].sort((a, b) => ipSortKey(a.host).localeCompare(ipSortKey(b.host)));
}

function mergeResult(a: CameraDiscoveryResult, b: CameraDiscoveryResult): CameraDiscoveryResult {
  return {
    ...a,
    name: a.name ?? b.name,
    manufacturer: a.manufacturer ?? b.manufacturer,
    model: a.model ?? b.model,
    xaddrs: [...new Set([...a.xaddrs, ...b.xaddrs])],
    scopes: [...new Set([...a.scopes, ...b.scopes])],
    ports: { ...b.ports, ...a.ports },
    source: a.source === 'ws-discovery' ? a.source : b.source,
  };
}

function portsFromUrls(urls: URL[]): CameraDiscoveryResult['ports'] {
  // XAddrs describes SOAP device services, not the vendor's HTTP/CGI API.
  // Only plain ONVIF HTTP is currently supported by the opt-in PTZ fallback.
  const http = urls.find((url) => url.protocol === 'http:');
  return http ? { onvif: Number(http.port || 80) } : {};
}

function safeUrl(value: string): URL[] {
  try {
    if (value.length > 2048) return [];
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) return [];
    return [url];
  } catch {
    return [];
  }
}

function scopeValue(scopes: string[], key: string): string | undefined {
  const scope = scopes.find((value) => value.toLowerCase().includes(`/${key.toLowerCase()}/`));
  const value = scope?.split('/').pop()?.replaceAll('_', ' ').trim();
  return value || undefined;
}

function ipSortKey(host: string): string {
  const parts = host.split('.').map((part) => Number(part).toString().padStart(3, '0'));
  return parts.length === 4 && parts.every((part) => /^\d{3}$/.test(part)) ? parts.join('.') : host;
}

function discoveryProbe(id: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
  xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
  xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>${id}</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;
}
