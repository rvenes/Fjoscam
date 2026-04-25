import { Agent as HttpAgent, request as httpRequest } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { request as httpsRequest } from 'node:https';
import type { RequestOptions } from 'node:https';

const httpAgent = new HttpAgent({ keepAlive: true, maxSockets: 16 });
const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 16, rejectUnauthorized: false });
const redirectOrigins = new Map<string, string>();

export async function requestJson<T>(url: URL, body: unknown, redirects = 2): Promise<T> {
  const bytes = await requestBuffer(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify(body)),
      timeoutMs: 6000,
    },
    redirects,
  );
  const text = bytes.toString('utf8');
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Camera returned non-JSON response: ${text.slice(0, 80)}`, { cause: error });
  }
}

export async function requestText(url: URL, body: string, contentType = 'application/soap+xml; charset=utf-8', redirects = 2): Promise<string> {
  const bytes = await requestBuffer(
    url,
    {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: Buffer.from(body, 'utf8'),
      timeoutMs: 6000,
    },
    redirects,
  );
  return bytes.toString('utf8');
}

export async function requestBinary(url: URL, redirects = 2): Promise<{ bytes: Buffer; contentType: string }> {
  return requestBuffer(url, { method: 'GET', timeoutMs: 6000 }, redirects, true);
}

type LocalRequestOptions = {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: Buffer;
  timeoutMs: number;
};

async function requestBuffer(
  url: URL,
  options: LocalRequestOptions,
  redirects: number,
  includeContentType?: false,
): Promise<Buffer>;
async function requestBuffer(
  url: URL,
  options: LocalRequestOptions,
  redirects: number,
  includeContentType: true,
): Promise<{ bytes: Buffer; contentType: string }>;
async function requestBuffer(
  url: URL,
  options: LocalRequestOptions,
  redirects: number,
  includeContentType = false,
): Promise<Buffer | { bytes: Buffer; contentType: string }> {
  const cachedRedirect = redirectOrigins.get(originKey(url));
  if (cachedRedirect) {
    const redirected = new URL(cachedRedirect);
    redirected.pathname = url.pathname;
    redirected.search = url.search;
    url = redirected;
  }

  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const requestOptions: RequestOptions = {
    method: options.method,
    agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
    headers: {
      ...options.headers,
      ...(options.body ? { 'content-length': String(options.body.length) } : {}),
    },
    rejectUnauthorized: false,
  };

  return new Promise((resolve, reject) => {
    const request = transport(url, requestOptions, (response) => {
      const location = response.headers.location;
      if ([301, 302, 307, 308].includes(response.statusCode ?? 0) && location && redirects > 0) {
        response.resume();
        const nextUrl = new URL(location, url);
        if (nextUrl.pathname === '/' && !nextUrl.search && url.pathname !== '/') {
          nextUrl.pathname = url.pathname;
          nextUrl.search = url.search;
        }
        if (originKey(nextUrl) !== originKey(url)) {
          redirectOrigins.set(originKey(url), `${nextUrl.protocol}//${nextUrl.host}`);
        }
        void requestBuffer(nextUrl, options, redirects - 1, includeContentType as true).then(resolve).catch(reject);
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`Camera HTTP ${response.statusCode}: ${bytes.toString('utf8').slice(0, 160)}`));
          return;
        }
        if (includeContentType) {
          resolve({ bytes, contentType: response.headers['content-type'] ?? 'application/octet-stream' });
        } else {
          resolve(bytes);
        }
      });
    });

    request.on('error', reject);
    request.setTimeout(options.timeoutMs, () => request.destroy(new Error('Camera request timed out.')));
    if (options.body) request.write(options.body);
    request.end();
  });
}

function originKey(url: URL): string {
  return `${url.protocol}//${url.host}`;
}
