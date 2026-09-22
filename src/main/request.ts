import { Agent as HttpAgent, request as httpRequest } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { request as httpsRequest } from 'node:https';
import type { RequestOptions } from 'node:https';
import type { HttpsTrust } from '../shared/types.js';
import { cameraTlsError, pinnedAgent } from './cameraTls.js';
import { CameraHttpError } from './cameraErrors.js';

const httpAgent = new HttpAgent({ keepAlive: true, maxSockets: 16 });
const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 16 });

export async function requestJson<T>(url: URL, body: unknown, redirects = 2, httpsTrust?: HttpsTrust): Promise<T> {
  const bytes = await requestBuffer(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify(body)),
      timeoutMs: 6000,
      httpsTrust,
    },
    redirects,
  );
  const text = bytes.toString('utf8');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Camera returned a non-JSON response.');
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

export async function requestBinary(url: URL, redirects = 2, httpsTrust?: HttpsTrust, signal?: AbortSignal): Promise<{ bytes: Buffer; contentType: string }> {
  return requestBuffer(url, { method: 'GET', timeoutMs: 6000, httpsTrust, signal }, redirects, true);
}

type LocalRequestOptions = {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: Buffer;
  timeoutMs: number;
  deadline?: number;
  httpsTrust?: HttpsTrust;
  signal?: AbortSignal;
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
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported camera protocol.');
  if (options.signal?.aborted) throw new Error('Camera request was cancelled.');
  const deadline = options.deadline ?? Date.now() + options.timeoutMs;
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Camera request timed out.');

  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const ownedAgent = pinnedAgent(url, options.httpsTrust);
  const requestOptions: RequestOptions = {
    method: options.method,
    agent: ownedAgent ?? (url.protocol === 'https:' ? httpsAgent : httpAgent),
    headers: {
      ...options.headers,
      ...(options.body ? { 'content-length': String(options.body.length) } : {}),
    },
    rejectUnauthorized: true,
    signal: options.signal,
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, value?: Buffer | { bytes: Buffer; contentType: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value!);
    };
    const request = transport(url, requestOptions, (response) => {
      let redirecting = false;
      response.on('error', () => { if (!redirecting) finish(new Error('Camera response failed.')); });
      response.on('aborted', () => { if (!redirecting) finish(new Error('Camera response was interrupted.')); });
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        try {
          if (!location || redirects <= 0) throw new Error('Camera redirect limit reached.');
          const nextUrl = new URL(location, url);
          if (!['http:', 'https:'].includes(nextUrl.protocol) || nextUrl.hostname !== url.hostname ||
              (url.protocol === 'https:' && nextUrl.origin !== url.origin) || nextUrl.username || nextUrl.password) {
            throw new Error('Camera redirect to another HTTPS origin, host or insecure protocol was blocked.');
          }
          if (nextUrl.pathname === '/' && !nextUrl.search && url.pathname !== '/') {
            nextUrl.pathname = url.pathname;
            nextUrl.search = url.search;
          }
          // Do not consume an unlimited redirect body or cache a new trust origin.
          redirecting = true;
          response.destroy();
          clearTimeout(timer);
          void requestBuffer(nextUrl, { ...options, deadline }, redirects - 1, includeContentType as true)
            .then((value) => finish(undefined, value), (error: Error) => finish(error));
        } catch (error) {
          finish(error as Error);
          response.destroy();
        }
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      const maxBytes = includeContentType ? 16 * 1024 * 1024 : 4 * 1024 * 1024;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          finish(new Error('Camera response exceeded the size limit.'));
          response.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
          finish(new CameraHttpError(response.statusCode ?? 500));
          return;
        }
        if (includeContentType) {
          finish(undefined, { bytes, contentType: response.headers['content-type'] ?? 'application/octet-stream' });
        } else {
          finish(undefined, bytes);
        }
      });
    });

    const timer = setTimeout(() => {
      finish(new Error('Camera request timed out.'));
      request.destroy();
      ownedAgent?.destroy();
    }, remaining);
    request.on('close', () => ownedAgent?.destroy());
    request.on('error', (error) => finish(options.signal?.aborted ? new Error('Camera request was cancelled.') : cameraTlsError(error)));
    if (options.body) request.write(options.body);
    request.end();
  });
}
