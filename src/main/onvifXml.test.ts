// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ONVIF, parseSoap, selectPtzProfile } from './onvifXml.js';

const wrap = (body: string) => `<s:Envelope xmlns:s="${ONVIF.soap}" xmlns:m="${ONVIF.media}" xmlns:t="${ONVIF.schema}"><s:Body>${body}</s:Body></s:Envelope>`;
const profile = (token: string, source = 'source', node = 'node') => `<m:Profiles token='${token}'><t:VideoSourceConfiguration><t:SourceToken>${source}</t:SourceToken></t:VideoSourceConfiguration><t:PTZConfiguration><t:NodeToken>${node}</t:NodeToken></t:PTZConfiguration></m:Profiles>`;
const parseProfiles = (body: string) => parseSoap(wrap(`<m:GetProfilesResponse>${body}</m:GetProfilesResponse>`), ONVIF.media, 'GetProfiles');

describe('bounded namespace-aware ONVIF XML', () => {
  it('accepts alternate/default namespaces, quotes and decoded token entities', () => {
    const xml = `<Envelope xmlns="${ONVIF.soap}"><Body><GetProfilesResponse xmlns="${ONVIF.media}"><Profiles token='camera&amp;&quot;one'><PTZConfiguration xmlns="${ONVIF.schema}"/></Profiles></GetProfilesResponse></Body></Envelope>`;
    expect(selectPtzProfile(parseSoap(xml, ONVIF.media, 'GetProfiles'), 0)).toBe('camera&"one');
  });

  it.each([
    'private-upstream-detail',
    wrap('<m:GetProfilesResponse>'),
    wrap('<m:GetProfilesResponse token=unquoted/>'),
    wrap('<m:GetProfilesResponse>&unknown;</m:GetProfilesResponse>'),
    wrap('<m:GetProfilesResponse/><m:GetProfilesResponse/>'),
    wrap('<fake:GetProfilesResponse xmlns:fake="urn:wrong"/>'),
    wrap('<!-- <m:GetProfilesResponse/> -->'),
    wrap('<s:Header><m:GetProfilesResponse/></s:Header>'),
    wrap('<m:GetProfilesResponse/>').replace('</s:Envelope>', '<s:Body><m:GetProfilesResponse/></s:Body></s:Envelope>'),
    wrap('<m:GetProfilesResponse/>').replace(ONVIF.soap, 'urn:wrong'),
    wrap('<undeclared:GetProfilesResponse/>'),
    `<!DOCTYPE s:Envelope [<!ENTITY secret SYSTEM "file:///synthetic">]>${wrap('<m:GetProfilesResponse>&secret;</m:GetProfilesResponse>')}`,
    wrap(`<m:GetProfilesResponse>${'<m:n>'.repeat(70)}${'</m:n>'.repeat(70)}</m:GetProfilesResponse>`),
    wrap(`<m:GetProfilesResponse>${'<m:n/>'.repeat(10001)}</m:GetProfilesResponse>`),
    wrap(`<m:GetProfilesResponse>${'x'.repeat(512 * 1024)}</m:GetProfilesResponse>`),
  ])('rejects malformed or unsafe input without raw diagnostics (%#)', (xml) => {
    const log = vi.spyOn(console, 'error');
    try {
      expect(() => parseSoap(xml, ONVIF.media, 'GetProfiles')).toThrow('ONVIF camera returned an unexpected response.');
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it('ignores fake PTZ markers in comments and unrelated namespaces', () => {
    for (const marker of ['<!-- <t:PTZConfiguration/> -->', '<x:PTZConfiguration xmlns:x="urn:wrong"/>']) {
      expect(() => selectPtzProfile(parseProfiles(`<m:Profiles token="video">${marker}</m:Profiles>`), 0)).toThrow('PTZ profile');
    }
  });

  it('allows different encodings of one reported video source and PTZ node', () => {
    expect(selectPtzProfile(parseProfiles(profile('high') + profile('low')), 0)).toBe('high');
  });

  it('rejects nonzero channels, different sources/nodes and ambiguous metadata', () => {
    expect(() => selectPtzProfile(parseProfiles(profile('first')), 1)).toThrow('ambiguous');
    for (const other of [profile('second', 'another'), profile('second', 'source', 'another'),
      '<m:Profiles token="second"><t:PTZConfiguration/></m:Profiles>',
      '<m:Profiles token="video"><t:VideoSourceConfiguration><t:SourceToken>another</t:SourceToken></t:VideoSourceConfiguration></m:Profiles>']) {
      expect(() => selectPtzProfile(parseProfiles(profile('first') + other), 0)).toThrow('ambiguous');
    }
  });
});
