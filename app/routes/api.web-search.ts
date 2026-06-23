import { lookup } from 'node:dns/promises';
import { data as json } from 'react-router';
import type { ActionFunctionArgs } from 'react-router';
import { collectCappedBody } from '~/lib/web-search-body';
import { isAllowedUrl, isPrivateIp } from '~/utils/url';

const MAX_CONTENT_LENGTH = 8000;
const MAX_REDIRECTS = 5;

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

const MAX_FETCH_BYTES = 5 * 1024 * 1024;

type SafeFetchResult =
  | { ok: true; status: number; statusText: string; contentType: string; html: string }
  | { ok: false; status: number; error: string };

/**
 * One HTTP(S) GET with connect-time DNS validation. node:* modules are imported
 * DYNAMICALLY inside this server-only function — a static top-level `node:dns` /
 * `node:http` import makes the vite client build fail ("externalized for browser
 * compatibility"), whereas a runtime import is left alone in the SSR bundle and
 * tree-shaken from the client one.
 *
 * The custom `lookup` re-validates EVERY resolved address at the moment of
 * connection, so a public→private DNS rebind (attacker domain, TTL=0) between the
 * pre-fetch assertHostAllowed() check and the actual connect can't reach an
 * internal host — closing the TOCTOU that global fetch (no per-connection lookup
 * hook) left open.
 */
async function httpGetOnce(
  targetUrl: string,
): Promise<
  | { kind: 'redirect'; location: string }
  | { kind: 'body'; status: number; statusText: string; contentType: string; html: string }
  | { kind: 'too-large' }
> {
  const [{ lookup: dnsLookup }, { request: httpRequest }, { request: httpsRequest }] = await Promise.all([
    import('node:dns'),
    import('node:http'),
    import('node:https'),
  ]);

  const validatingLookup = (
    hostname: string,
    _options: unknown,
    callback: (err: NodeJS.ErrnoException | null, address?: string, family?: number) => void,
  ): void => {
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
  };

  return new Promise((resolve, reject) => {
    const requestImpl = new URL(targetUrl).protocol === 'https:' ? httpsRequest : httpRequest;

    const req = requestImpl(
      targetUrl,
      { method: 'GET', headers: FETCH_HEADERS, lookup: validatingLookup as never, timeout: 10_000 },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;

        if (status >= 300 && status < 400 && typeof location === 'string' && location) {
          res.resume();
          resolve({ kind: 'redirect', location });

          return;
        }

        const declaredLength = Number(res.headers['content-length'] ?? '');

        if (Number.isFinite(declaredLength) && declaredLength > MAX_FETCH_BYTES) {
          res.destroy();
          resolve({ kind: 'too-large' });

          return;
        }

        collectCappedBody(res, MAX_FETCH_BYTES).then((collected) => {
          if (collected.kind === 'too-large') {
            resolve({ kind: 'too-large' });

            return;
          }

          resolve({
            kind: 'body',
            status,
            statusText: res.statusMessage ?? '',
            contentType: (res.headers['content-type'] as string | undefined) ?? '',
            html: collected.buffer.toString('utf8'),
          });
        }, reject);
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
 * IP), closing both the open-redirect and DNS-rebinding windows.
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
