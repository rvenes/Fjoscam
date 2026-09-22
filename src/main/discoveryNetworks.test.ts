// @vitest-environment node
import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { discoveryScanPlan } from './discoveryNetworks.js';

const nic = (address: string, netmask: string): NetworkInterfaceInfo => ({ address, netmask, family: 'IPv4', internal: false, mac: '', cidr: null });

describe('bounded discovery scan plan', () => {
  it('honours a /25 and excludes network, broadcast and every own interface address', () => {
    const plan = discoveryScanPlan({ Ethernet: [nic('192.168.1.129', '255.255.255.128')], WiFi: [nic('192.168.1.130', '255.255.255.128')] });
    expect(plan.hosts).toHaveLength(124);
    expect(plan.hosts[0]).toBe('192.168.1.131'); expect(plan.hosts.at(-1)).toBe('192.168.1.254');
    expect(plan.networks[0]).toMatchObject({ subnet: '192.168.1.128/25', scanSubnet: '192.168.1.128/25', hostCount: 124 });
    expect(new Set(plan.hosts).size).toBe(plan.hosts.length);
  });
  it('covers both halves of /23 instead of assuming /24', () => {
    const plan = discoveryScanPlan({ Ethernet: [nic('10.1.3.20', '255.255.254.0')] });
    expect(plan.hosts).toHaveLength(509);
    expect(plan.hosts).toContain('10.1.2.255'); expect(plan.hosts).toContain('10.1.3.0');
    expect(plan.hosts).not.toContain('10.1.2.0'); expect(plan.hosts).not.toContain('10.1.3.255');
  });
  it('limits large networks to a reported local /24', () => {
    const plan = discoveryScanPlan({ Ethernet: [nic('172.16.37.9', '255.255.0.0')] });
    expect(plan.hosts).toHaveLength(253);
    expect(plan.networks[0]).toMatchObject({ subnet: '172.16.0.0/16', scanSubnet: '172.16.37.0/24', limitation: 'large-subnet' });
  });
  it('caps unique hosts across many interfaces and reports truncation', () => {
    const plan = discoveryScanPlan({ Ethernet: Array.from({ length: 12 }, (_, i) => nic(`10.1.${i}.1`, '255.255.255.0')) });
    expect(plan.hosts).toHaveLength(2048);
    expect(plan.networks.at(-1)).toMatchObject({ hostCount: 0, limitation: 'host-budget' });
  });
  it('skips invalid masks, point-to-point, loopback, public IPv4 and IPv6', () => {
    const plan = discoveryScanPlan({ Ethernet: [nic('10.0.0.1', '255.0.255.0'), nic('10.0.1.1', '255.255.255.254'),
      nic('10.0.2.1', '255.255.255.255'), nic('192.0.2.1', '255.255.255.0'),
      { ...nic('10.0.3.1', '255.255.255.0'), internal: true },
      { ...nic('fe80::1', 'ffff::'), family: 'IPv6', scopeid: 0 }] });
    expect(plan.hosts).toEqual([]);
    expect(plan.networks.map((item) => item.limitation)).toEqual(['invalid-netmask', 'point-to-point', 'point-to-point']);
  });
});
