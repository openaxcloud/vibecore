import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { checkOutboundUrl, isBlockedOutboundAddress, type OutboundUrlPolicy } from './index.js';

/** The same DNS result is checked and used by the socket, with no second lookup. */
export async function resolveOutboundDestination(rawUrl: string, policy: OutboundUrlPolicy) {
  let addresses: string[] = [];

  const rejection = await checkOutboundUrl(rawUrl, {
    ...policy,
    resolveHost: async (hostname) => {
      if (policy.resolveHost) {
        addresses = await policy.resolveHost(hostname);
      } else {
        const { lookup } = await import('node:dns/promises');
        addresses = (await lookup(hostname, { all: true })).map((record) => record.address);
      }

      return addresses;
    },
  });

  if (rejection) {
    return { rejection } as const;
  }

  const url = new URL(rawUrl);

  if (!addresses.length || addresses.some((address) => !isIP(address) || isBlockedOutboundAddress(address))) {
    return { rejection: 'BLOCKED_ADDRESS' } as const;
  }

  return { url, addresses: [...new Set(addresses)] } as const;
}

export interface OutboundHttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
}

/** Native HTTP(S), original Host/TLS identity, approved DNS only, no redirects or proxy fallback. */
export async function fetchOutbound(rawUrl: string, policy: OutboundUrlPolicy, options: OutboundHttpOptions = {}) {
  const destination = await resolveOutboundDestination(rawUrl, policy);

  if ('rejection' in destination) {
    throw Object.assign(new Error('Outbound destination refused'), { code: destination.rejection });
  }

  const { url, addresses } = destination;

  if (url.username || url.password) {
    throw Object.assign(new Error('Outbound credentials in URL are unsupported'), { code: 'INVALID_URL' });
  }

  const records = addresses.map((address) => ({ address, family: isIP(address) }));

  const lookup: LookupFunction = (hostname, lookupOptions, callback) => {
    if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
      callback(Object.assign(new Error('Unexpected outbound hostname'), { code: 'HOST_NOT_ALLOWED' }), '', 0);

      return;
    }

    if (lookupOptions.all) {
      callback(null, records);

      return;
    }

    const record = records.find((item) => !lookupOptions.family || item.family === lookupOptions.family);

    if (!record) {
      callback(Object.assign(new Error('No approved address family'), { code: 'BLOCKED_ADDRESS' }), '', 0);

      return;
    }

    callback(null, record.address, record.family);
  };

  return new Promise<Response>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: options.method ?? 'GET',
        headers: { ...options.headers, host: url.host },
        lookup,
        agent: false,
        signal: options.signal,
      },
      (response) => {
        const chunks: Buffer[] = [];

        let bytes = 0;
        response.on('error', reject);
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;

          if (bytes > (options.maxBytes ?? 20 * 1024 * 1024)) {
            response.destroy(
              Object.assign(new Error('Outbound response exceeds limit'), { code: 'RESPONSE_TOO_LARGE' }),
            );

            return;
          }

          chunks.push(chunk);
        });
        response.on('end', () => {
          const headers = new Headers();

          for (let index = 0; index < response.rawHeaders.length; index += 2) {
            headers.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
          }

          const status = response.statusCode ?? 502;
          const noBody = options.method === 'HEAD' || [204, 205, 304].includes(status);
          resolve(new Response(noBody ? null : Buffer.concat(chunks), { status, headers }));
        });
      },
    );

    const timeout = setTimeout(
      () =>
        request.destroy(
          Object.assign(new Error('Outbound request timed out'), {
            code: 'OUTBOUND_TIMEOUT',
          }),
        ),
      options.timeoutMs ?? 5000,
    );
    request.once('close', () => clearTimeout(timeout));
    request.once('error', reject);
    request.end(options.body);
  });
}
