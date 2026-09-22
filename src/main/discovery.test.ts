// @vitest-environment node
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createSocket: vi.fn(), networkInterfaces: vi.fn(() => ({})) }));
vi.mock('node:dgram', () => ({ default: { createSocket: mocks.createSocket } }));
vi.mock('node:os', () => ({ networkInterfaces: mocks.networkInterfaces }));
import { discoverCameras, parseProbeMatches, wsDiscovery } from './discovery.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const match = (body: string) => `<d:ProbeMatch>${body}</d:ProbeMatch>`;
function soap(body: string, relatesTo = 'uuid:synthetic-probe') {
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
    xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing">
    <s:Header><w:RelatesTo>${relatesTo}</w:RelatesTo></s:Header><s:Body><d:ProbeMatches>${body}</d:ProbeMatches></s:Body></s:Envelope>`;
}

function mockUdp() {
  const socket = Object.assign(new EventEmitter(), {
    bind: vi.fn((callback: () => void) => callback()), setMulticastTTL: vi.fn(), setBroadcast: vi.fn(),
    send: vi.fn(), close: vi.fn(),
  });
  mocks.createSocket.mockReturnValue(socket);
  return socket;
}

describe('discovery failures', () => {
  it('combines multicast and port candidates, shares simultaneous requests and closes probes without credentials', async () => {
    vi.useFakeTimers();
    mocks.networkInterfaces.mockReturnValue({ Ethernet: [{ address: '10.1.1.1', netmask: '255.255.255.248', family: 'IPv4', internal: false, mac: '', cidr: null }] });
    const udp = mockUdp();
    const sockets: Array<ReturnType<typeof tcp>> = [];
    function tcp() { return Object.assign(new EventEmitter(), { destroy: vi.fn(), setTimeout: vi.fn(), write: vi.fn() }); }
    const connect = vi.spyOn(net, 'createConnection').mockImplementation(((options: { host: string; port: number }) => {
      const socket = tcp(); sockets.push(socket);
      setTimeout(() => socket.emit(options.host === '10.1.1.3' && options.port === 554 ? 'connect' : 'timeout'), 1);
      return socket;
    }) as unknown as typeof net.createConnection);
    const first = discoverCameras();
    expect(discoverCameras()).toBe(first);
    await vi.advanceTimersByTimeAsync(0);
    const probeId = /<w:MessageID>([^<]+)<\/w:MessageID>/.exec(String(udp.send.mock.calls[0][0]))![1];
    udp.emit('message', Buffer.from(soap(match('<d:XAddrs>http://10.1.1.2:8000/onvif/device_service</d:XAddrs>'), probeId)));
    await vi.runAllTimersAsync();
    const report = await first;
    expect(report.cameras.map((item) => [item.host, item.source])).toEqual([['10.1.1.2', 'ws-discovery'], ['10.1.1.3', 'subnet-scan']]);
    expect(report.networks[0]).toMatchObject({ subnet: '10.1.1.0/29', hostCount: 5 });
    expect(connect).toHaveBeenCalledTimes(25);
    for (const socket of sockets) {
      expect(socket.destroy).toHaveBeenCalledOnce(); expect(socket.write).not.toHaveBeenCalled();
      expect(() => socket.emit('error', new Error('queued socket error'))).not.toThrow();
      expect(socket.destroy).toHaveBeenCalledOnce();
    }
    const again = discoverCameras(); expect(again).not.toBe(first);
    await vi.runAllTimersAsync(); await again;
  });
  it('treats synchronous socket construction errors as closed ports', async () => {
    vi.useFakeTimers(); mockUdp();
    mocks.networkInterfaces.mockReturnValue({ Ethernet: [{ address: '10.1.1.1', netmask: '255.255.255.252', family: 'IPv4', internal: false, mac: '', cidr: null }] });
    vi.spyOn(net, 'createConnection').mockImplementation(() => { throw new Error('synthetic setup error'); });
    const result = discoverCameras(); await vi.runAllTimersAsync();
    expect((await result).cameras).toEqual([]);
  });
  it('ignores malformed percent escapes while retaining a valid camera', () => {
    const matches = parseProbeMatches(soap(match('<d:XAddrs>http://192.0.2.10/onvif/device_service</d:XAddrs><d:Scopes>onvif://x/name/%ZZ onvif://x/hardware/Test_Camera</d:Scopes>')));
    expect(matches).toHaveLength(1);
    expect(matches[0].model).toBe('Test Camera');
  });

  it('closes once and cancels pending sends after a socket error', async () => {
    vi.useFakeTimers();
    const socket = Object.assign(new EventEmitter(), {
      bind: vi.fn((callback: () => void) => callback()),
      setMulticastTTL: vi.fn(), setBroadcast: vi.fn(), send: vi.fn(), close: vi.fn(),
    });
    mocks.createSocket.mockReturnValue(socket);
    const discovery = wsDiscovery();
    socket.emit('error', new Error('Synthetic socket error'));
    socket.emit('error', new Error('Queued error'));
    await vi.runAllTimersAsync();
    await expect(discovery).resolves.toEqual([]);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(socket.send).not.toHaveBeenCalled();
  });
});

describe('WS-Discovery XML boundary', () => {
  it('keeps every match and alternative host without mistaking the ONVIF service for a CGI API', () => {
    const results = parseProbeMatches(soap(match('<d:XAddrs>http://192.0.2.1:8000/service http://192.0.2.2:8000/service</d:XAddrs>') +
      match('<d:XAddrs>https://192.0.2.3:8443/service</d:XAddrs><d:Scopes>onvif://x/name/Barn_&#67;amera</d:Scopes>')));
    expect(results.map((item) => item.host)).toEqual(['192.0.2.1', '192.0.2.2', '192.0.2.3']);
    expect(results.map((item) => item.ports)).toEqual([{ onvif: 8000 }, { onvif: 8000 }, {}]);
    expect(results[2].name).toBe('Barn Camera');
    expect(results[0].xaddrs).toEqual(['http://192.0.2.1:8000/service']);
  });
  it('matches namespace URIs instead of prefixes and ignores comments/foreign fields', () => {
    const xml = soap(match('<!--<d:XAddrs>http://192.0.2.99</d:XAddrs>--><x:XAddrs xmlns:x="urn:other">http://192.0.2.98</x:XAddrs><d:XAddrs>http://192.0.2.1/service</d:XAddrs>'));
    expect(parseProbeMatches(xml.replaceAll('d:', 'discovery:').replace('xmlns:d=', 'xmlns:discovery='))[0].host).toBe('192.0.2.1');
    expect(parseProbeMatches(xml.replaceAll('http://schemas.xmlsoap.org/ws/2005/04/discovery', 'urn:wrong'))).toEqual([]);
  });
  it('correlates replies to this probe and rejects duplicate or missing correlation headers', () => {
    const xml = soap(match('<d:XAddrs>http://192.0.2.1/service</d:XAddrs>'));
    expect(parseProbeMatches(xml, 'uuid:synthetic-probe')).toHaveLength(1);
    expect(parseProbeMatches(xml, 'uuid:other-probe')).toEqual([]);
    expect(parseProbeMatches(xml.replace(/<s:Header>[\s\S]*?<\/s:Header>/, ''), 'uuid:synthetic-probe')).toEqual([]);
    expect(parseProbeMatches(xml.replace('</s:Header>', '<w:RelatesTo>uuid:synthetic-probe</w:RelatesTo></s:Header>'), 'uuid:synthetic-probe')).toEqual([]);
  });
  it('rejects malformed XML, DTD/entity declarations and oversized input without raw errors', () => {
    const xml = soap(match('<d:XAddrs>http://192.0.2.1/service</d:XAddrs>'));
    for (const malformed of [xml.slice(0, -8), `<!DOCTYPE test [<!ENTITY leak SYSTEM "file:///synthetic">]>${xml}`,
      `<XAddrs>http://192.0.2.1/service</XAddrs>`, xml + ' '.repeat(512 * 1024)]) {
      expect(parseProbeMatches(malformed)).toEqual([]);
    }
  });
  it('rejects credential URLs, query/fragment and non-HTTP protocols while preserving valid entries', () => {
    const results = parseProbeMatches(soap(match('<d:XAddrs>http://synthetic:secret@192.0.2.9/service http://192.0.2.9/service?token=synthetic http://192.0.2.9/service#secret rtsp://192.0.2.9/live file:///synthetic http://192.0.2.1/service</d:XAddrs>')));
    expect(results).toHaveLength(1); expect(results[0].xaddrs).toEqual(['http://192.0.2.1/service']);
    expect(JSON.stringify(results)).not.toContain('synthetic');
  });
  it('drops ambiguous fields in one match without losing another valid match', () => {
    const results = parseProbeMatches(soap(match('<d:XAddrs>http://192.0.2.9</d:XAddrs><d:XAddrs>http://192.0.2.8</d:XAddrs>') +
      match('<d:XAddrs>http://192.0.2.1</d:XAddrs>')));
    expect(results.map((item) => item.host)).toEqual(['192.0.2.1']);
  });
});
