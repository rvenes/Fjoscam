import { DOMParser, type Element, type Node } from '@xmldom/xmldom';

export const ONVIF = {
  soap: 'http://www.w3.org/2003/05/soap-envelope',
  device: 'http://www.onvif.org/ver10/device/wsdl',
  media: 'http://www.onvif.org/ver10/media/wsdl',
  ptz: 'http://www.onvif.org/ver20/ptz/wsdl',
  schema: 'http://www.onvif.org/ver10/schema',
  error: 'http://www.onvif.org/ver10/error',
} as const;

export class OnvifFault extends Error {
  constructor(readonly unsupported: boolean) { super('ONVIF camera rejected the request (SOAP fault).'); }
}

export function children(node: Node, namespace: string, name: string): Element[] {
  return Array.from(node.childNodes).filter((child): child is Element =>
    child.nodeType === 1 && (child as Element).namespaceURI === namespace && (child as Element).localName === name);
}

export function child(node: Node, namespace: string, name: string): Element | undefined {
  const matches = children(node, namespace, name);
  if (matches.length > 1) throw unexpected();
  return matches[0];
}

export function unexpected(): Error { return new Error('ONVIF camera returned an unexpected response.'); }

export function parseSoapEnvelope(xml: string): Element {
  // No DTD/entity declarations, recovery of broken XML, or raw parser diagnostics.
  // Network input is already bounded; use a tighter bound before building a DOM.
  if (Buffer.byteLength(xml, 'utf8') > 512 * 1024 || /<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) throw unexpected();
  let root: Element;
  try {
    const document = new DOMParser({ onError: () => { throw unexpected(); } }).parseFromString(xml, 'application/xml');
    if (!document.documentElement || document.doctype) throw unexpected();
    root = document.documentElement;
    const pending: Array<{ node: Node; depth: number }> = [{ node: root, depth: 0 }];
    let count = 0;
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (++count > 10000 || depth > 64) throw unexpected();
      for (const nested of Array.from(node.childNodes)) pending.push({ node: nested, depth: depth + 1 });
    }
  } catch { throw unexpected(); }
  if (root.namespaceURI !== ONVIF.soap || root.localName !== 'Envelope') throw unexpected();
  return root;
}

export function parseSoap(xml: string, namespace: string, command: string): Element {
  const root = parseSoapEnvelope(xml);
  const body = child(root, ONVIF.soap, 'Body');
  if (!body) throw unexpected();
  const elements = Array.from(body.childNodes).filter((node) => node.nodeType === 1) as Element[];
  if (elements.length !== 1) throw unexpected();
  const response = elements[0];
  if (response.namespaceURI === ONVIF.soap && response.localName === 'Fault') {
    const code = child(response, ONVIF.soap, 'Code');
    const subcode = code && child(code, ONVIF.soap, 'Subcode');
    const value = subcode && child(subcode, ONVIF.soap, 'Value');
    const [prefix, local] = (value?.textContent?.trim() ?? '').split(':');
    throw new OnvifFault(local === 'ActionNotSupported' && value?.lookupNamespaceURI(prefix) === ONVIF.error);
  }
  if (response.namespaceURI !== namespace || response.localName !== `${command}Response`) throw unexpected();
  return response;
}

export function selectPtzProfile(response: Element, channel: number): string {
  const sourceTokens = new Set<string>();
  const profiles = children(response, ONVIF.media, 'Profiles').flatMap((profile) => {
    const video = child(profile, ONVIF.schema, 'VideoSourceConfiguration');
    const source = video && child(video, ONVIF.schema, 'SourceToken')?.textContent?.trim();
    if (source) sourceTokens.add(source);
    const ptz = child(profile, ONVIF.schema, 'PTZConfiguration');
    const token = profile.getAttribute('token');
    if (!ptz || !token || token.length > 256) return [];
    const node = child(ptz, ONVIF.schema, 'NodeToken')?.textContent?.trim();
    return [{ token, source, node }];
  });
  if (!profiles.length) throw new Error('ONVIF did not return a PTZ profile token.');
  const first = profiles[0];
  // ONVIF tokens are opaque. A Reolink channel number is not an ONVIF index.
  // Multiple encodings of the same source/node are safe; different/unknown
  // sources need an explicit mapping before we can send physical commands.
  if (channel !== 0 || sourceTokens.size > 1 || (profiles.length > 1 && (!first.source || !first.node ||
    profiles.some((profile) => profile.source !== first.source || profile.node !== first.node)))) {
    throw new Error('ONVIF PTZ channel mapping is ambiguous. Use Reolink API controls or a direct single-camera connection.');
  }
  return first.token;
}
