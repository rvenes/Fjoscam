import { randomUUID } from 'node:crypto';
import dgram from 'node:dgram';
import net from 'node:net';
import { networkInterfaces } from 'node:os';
import type { CameraDiscoveryResult } from '../shared/types.js';

const DISCOVERY_ADDRESS = '239.255.255.250';
const DISCOVERY_PORT = 3702;
const PROBE_TIMEOUT_MS = 3200;
const CONNECT_TIMEOUT_MS = 420;
const SCAN_PORTS = [80, 443, 554, 8000, 9000] as const;

export async function discoverCameras(): Promise<CameraDiscoveryResult[]> {
  const matches = dedupeResults(await wsDiscovery());
  if (matches.length > 0) return matches;
  return dedupeResults(await subnetScan());
}

async function wsDiscovery(): Promise<CameraDiscoveryResult[]> {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const responses: Buffer[] = [];
  const probe = Buffer.from(discoveryProbe(randomUUID()), 'utf8');

  return new Promise((resolve) => {
    const finish = () => {
      socket.removeAllListeners();
      socket.close();
      resolve(responses.flatMap((buffer) => parseProbeMatches(buffer.toString('utf8'))));
    };

    socket.on('message', (message) => responses.push(message));
    socket.on('error', finish);
    socket.bind(() => {
      socket.setMulticastTTL(2);
      socket.setBroadcast(true);
      for (let index = 0; index < 3; index += 1) {
        setTimeout(() => socket.send(probe, DISCOVERY_PORT, DISCOVERY_ADDRESS), index * 350).unref();
      }
      setTimeout(finish, PROBE_TIMEOUT_MS).unref();
    });
  });
}

function parseProbeMatches(xml: string): CameraDiscoveryResult[] {
  const blocks = [...xml.matchAll(/<[^>]*(?:ProbeMatch|ProbeMatches)\b[^>]*>([\s\S]*?)<\/[^>]*(?:ProbeMatch|ProbeMatches)>/gi)];
  const candidates = blocks.length > 0 ? blocks.map((match) => match[1]) : [xml];
  return candidates.flatMap((block) => {
    const xaddrs = textContent(block, 'XAddrs')
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const scopes = textContent(block, 'Scopes')
      .split(/\s+/)
      .map((value) => decodeURIComponent(value.trim()))
      .filter(Boolean);
    const urls = xaddrs.flatMap((value) => safeUrl(value));
    const host = urls[0]?.hostname;
    if (!host) return [];

    const ports = portsFromUrls(urls);
    const name = scopeValue(scopes, 'name') ?? scopeValue(scopes, 'hardware');
    const model = scopeValue(scopes, 'hardware') ?? scopeValue(scopes, 'model');
    const manufacturer = scopes.find((scope) => /reolink/i.test(scope)) ? 'Reolink' : scopeValue(scopes, 'manufacturer');
    return [{
      id: `ws-${host}`,
      host,
      name,
      manufacturer,
      model,
      xaddrs,
      scopes,
      ports: { ...ports, onvif: ports.onvif ?? 8000 },
      source: 'ws-discovery' as const,
    }];
  });
}

async function subnetScan(): Promise<CameraDiscoveryResult[]> {
  const hosts = scanHosts();
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
    const socket = net.createConnection({ host, port });
    const done = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

function scanHosts(): string[] {
  const prefixes = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal || !isPrivateIPv4(address.address)) continue;
      const parts = address.address.split('.');
      prefixes.add(parts.slice(0, 3).join('.'));
    }
  }
  return [...prefixes].flatMap((prefix) => Array.from({ length: 254 }, (_item, index) => `${prefix}.${index + 1}`));
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
  const ports: CameraDiscoveryResult['ports'] = {};
  for (const url of urls) {
    const protocol = url.protocol.replace(':', '');
    const port = Number(url.port || (protocol === 'https' ? 443 : 80));
    if (/onvif/i.test(url.pathname)) ports.onvif = port;
    if (protocol === 'http') ports.http = port;
    if (protocol === 'https') ports.https = port;
  }
  return ports;
}

function safeUrl(value: string): URL[] {
  try {
    return [new URL(value)];
  } catch {
    return [];
  }
}

function textContent(xml: string, localName: string): string {
  const match = new RegExp(`<[^>]*${localName}\\b[^>]*>([\\s\\S]*?)<\\/[^>]*${localName}>`, 'i').exec(xml);
  return unescapeXml(match?.[1]?.trim() ?? '');
}

function scopeValue(scopes: string[], key: string): string | undefined {
  const scope = scopes.find((value) => value.toLowerCase().includes(`/${key.toLowerCase()}/`));
  const value = scope?.split('/').pop()?.replaceAll('_', ' ').trim();
  return value || undefined;
}

function isPrivateIPv4(address: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
}

function ipSortKey(host: string): string {
  const parts = host.split('.').map((part) => Number(part).toString().padStart(3, '0'));
  return parts.length === 4 && parts.every((part) => /^\d{3}$/.test(part)) ? parts.join('.') : host;
}

function unescapeXml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function discoveryProbe(id: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
  xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
  xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:${id}</w:MessageID>
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
