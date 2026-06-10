import { lookup as dnsLookup } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { isAllowedUrl, isPrivateIp } from '~/utils/url';

const MAX_CONTENT_LENGTH = 8000;
const MAX_REDIRECTS = 5;
const MAX_FETCH_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/*
 * Connect-time DNS validation. The pre-fetch assertHostAllowed() check resolves
 * + validates the host, but global fetch re-resolves DNS independently right
 * before connecting — so a public→private rebind (attacker domain, TTL=0) could
 * slip an internal IP past the pre-check. By using node:http(s) with a custom
 * `lookup` that re-validates EVERY resolved address at the moment of connection,
 * the socket can only ever connect to a public IP — closing the TOCTOU window.
 */
export function validatingLookup(
  hostname: string,
  options: unknown,
  callback: (err: NodeJS.ErrnoException | null, address?: string, family?: number) => void,
): void {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) {
      callback(err);
      return;
    }

    const list = Array.isArray(addresses) ? addresses : [];

    if (list.length === 0 || list.some((entry) => isPrivateIp(entry.address))) {
      callback(Object.assign(new Error('Resolved to a disallowed (internal) address'), { code: 'SSRF_BLOCKED' }));
      return;
    }

    callback(null, list[0].address, list[0].family);
  });
}

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : '';
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i);

  if (match) {
    return match[1].trim();
  }

  // Try reverse attribute order
  const altMatch = html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);

  return altMatch ? altMatch[1].trim() : '';
}

function extractTextContent(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reject a URL whose host resolves to an internal address. The string-level
 * `isAllowedUrl` only inspects the hostname literal; this resolves DNS so a
 * public hostname that maps to a private/link-local/loopback IP (DNS rebinding,
 * or a redirect into the metadata server) is blocked.
 */
async function assertHostAllowed(rawUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAllowedUrl(rawUrl)) {
    return { ok: false, error: 'URL is not allowed. Only public HTTP/HTTPS URLs are accepted.' };
  }

  const hostname = new URL(rawUrl).hostname;

  try {
    const records = await lookup(hostname, { all: true });

    if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
      return { ok: false, error: 'URL resolves to a disallowed (internal) address.' };
    }
  } catch {
    return { ok: false, error: 'Could not resolve the URL host.' };
  }

  return { ok: true };
}

type SafeFetchResult =
  | { ok: true; status: number; statusText: string; contentType: string; html: string }
  | { ok: false; status: number; error: string };

/**
 * One HTTP(S) GET via node:http(s) with the connect-time-validating lookup, a
 * hard timeout, and a streamed body cap. Returns either a redirect Location or
 * the (capped) body. Built on node modules so we can pin DNS validation to the
 * actual socket connection — global fetch offers no per-connection lookup hook.
 */
function httpGetOnce(
  targetUrl: string,
): Promise<
  | { kind: 'redirect'; location: string }
  | { kind: 'body'; status: number; statusText: string; contentType: string; html: string }
  | { kind: 'too-large' }
> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const requestImpl = parsed.protocol === 'https:' ? httpsRequest : httpRequest;

    const req = requestImpl(
      targetUrl,
      { method: 'GET', headers: FETCH_HEADERS, lookup: validatingLookup as never, timeout: FETCH_TIMEOUT_MS },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;

        if (status >= 300 && status < 400 && typeof location === 'string' && location) {
          res.resume(); // drain so the socket is freed
          resolve({ kind: 'redirect', location });

          return;
        }

        const declaredLength = Number(res.headers['content-length'] ?? '');

        if (Number.isFinite(declaredLength) && declaredLength > MAX_FETCH_BYTES) {
          res.destroy();
          resolve({ kind: 'too-large' });

          return;
        }

        const chunks: Buffer[] = [];

        let total = 0;

        res.on('data', (chunk: Buffer) => {
          total += chunk.length;

          if (total > MAX_FETCH_BYTES) {
            res.destroy();

            return;
          }

          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            kind: 'body',
            status,
            statusText: res.statusMessage ?? '',
            contentType: (res.headers['content-type'] as string | undefined) ?? '',
            html: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        res.on('error', reject);
      },
    );

    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch following redirects manually so every hop's destination is re-validated
 * against the SSRF allow-list (scheme/host) AND connect-time-validated (resolved
 * IP), closing both the open-redirect and the DNS-rebinding TOCTOU windows.
 */
async function safeFetch(initialUrl: string): Promise<SafeFetchResult> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const guard = await assertHostAllowed(currentUrl);

    if (!guard.ok) {
      return { ok: false, status: 400, error: guard.error };
    }

    let result;

    try {
      result = await httpGetOnce(currentUrl);
    } catch (error) {
      if ((error as { code?: string })?.code === 'SSRF_BLOCKED') {
        return { ok: false, status: 400, error: 'URL resolves to a disallowed (internal) address.' };
      }

      if ((error as Error)?.name === 'TimeoutError') {
        return { ok: false, status: 504, error: 'Request timed out after 10 seconds' };
      }

      return { ok: false, status: 502, error: (error as Error)?.message ?? 'Failed to fetch URL' };
    }

    if (result.kind === 'too-large') {
      return { ok: false, status: 413, error: 'Page too large' };
    }

    if (result.kind === 'redirect') {
      currentUrl = new URL(result.location, currentUrl).toString();
      continue;
    }

    return {
      ok: true,
      status: result.status,
      statusText: result.statusText,
      contentType: result.contentType,
      html: result.html,
    };
  }

  return { ok: false, status: 502, error: 'Too many redirects' };
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { url } = (await request.json()) as { url?: string };

    if (!url || typeof url !== 'string') {
      return json({ error: 'URL is required' }, { status: 400 });
    }

    const fetched = await safeFetch(url);

    if (!fetched.ok) {
      return json({ error: fetched.error }, { status: fetched.status });
    }

    if (fetched.status < 200 || fetched.status >= 300) {
      return json({ error: `Failed to fetch URL: ${fetched.status} ${fetched.statusText}` }, { status: 502 });
    }

    if (!fetched.contentType.includes('text/html') && !fetched.contentType.includes('text/plain')) {
      return json({ error: 'URL must point to an HTML or text page' }, { status: 400 });
    }

    const html = fetched.html;

    const title = extractTitle(html);
    const description = extractMetaDescription(html);
    const content = extractTextContent(html);

    return json({
      success: true,
      data: {
        title,
        description,
        content: content.length > MAX_CONTENT_LENGTH ? content.slice(0, MAX_CONTENT_LENGTH) + '...' : content,
        sourceUrl: url,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return json({ error: 'Request timed out after 10 seconds' }, { status: 504 });
    }

    console.error('Web search error:', error);

    return json({ error: error instanceof Error ? error.message : 'Failed to fetch URL' }, { status: 500 });
  }
}
