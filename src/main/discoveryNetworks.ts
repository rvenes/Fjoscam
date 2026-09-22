import net from 'node:net';
import type { NetworkInterfaceInfo } from 'node:os';
import type { DiscoveryNetwork } from '../shared/types.js';

const MAX_HOSTS = 2048;
const MAX_SUBNET_ADDRESSES = 1024;

export function isPrivateIPv4(address: string): boolean {
  return net.isIPv4(address) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
}

const integer = (address: string) => address.split('.').reduce((value, byte) => value * 256 + Number(byte), 0);
const ipv4 = (value: number) => [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');

export function discoveryScanPlan(interfaces: Record<string, NetworkInterfaceInfo[] | undefined>): {
  hosts: string[]; networks: DiscoveryNetwork[];
} {
  const addresses = Object.entries(interfaces).flatMap(([name, items]) => (items ?? []).map((item) => ({ name, ...item })));
  const ownAddresses = new Set(addresses.map((item) => item.address));
  const hosts = new Set<string>();
  const networks: DiscoveryNetwork[] = [];
  for (const item of addresses) {
    if (item.family !== 'IPv4' || item.internal || !isPrivateIPv4(item.address)) continue;
    const bits = net.isIPv4(item.netmask) ? integer(item.netmask).toString(2).padStart(32, '0') : '';
    const prefix = bits.indexOf('0') < 0 ? 32 : bits.indexOf('0');
    const summary: DiscoveryNetwork = { name: item.name, address: item.address, subnet: `${item.address}/${item.netmask}`, hostCount: 0 };
    networks.push(summary);
    if (!/^1*0*$/.test(bits) || bits.length !== 32) { summary.limitation = 'invalid-netmask'; continue; }
    const network = (integer(item.address) & integer(item.netmask)) >>> 0;
    summary.subnet = `${ipv4(network)}/${prefix}`;
    if (prefix >= 31) { summary.limitation = 'point-to-point'; continue; }
    const limited = 2 ** (32 - prefix) > MAX_SUBNET_ADDRESSES;
    const scanPrefix = limited ? 24 : prefix;
    const scanNetwork = limited ? (integer(item.address) & 0xffffff00) >>> 0 : network;
    summary.scanSubnet = `${ipv4(scanNetwork)}/${scanPrefix}`;
    if (limited) summary.limitation = 'large-subnet';
    const end = scanNetwork + 2 ** (32 - scanPrefix) - 1;
    for (let candidate = scanNetwork + 1; candidate < end; candidate += 1) {
      const host = ipv4(candidate);
      if (ownAddresses.has(host) || !isPrivateIPv4(host)) continue;
      if (!hosts.has(host) && hosts.size >= MAX_HOSTS) { summary.limitation = 'host-budget'; continue; }
      hosts.add(host);
      summary.hostCount += 1;
    }
  }
  return { hosts: [...hosts], networks };
}
