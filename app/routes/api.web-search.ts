import { lookup } from 'node:dns/promises';
import { data as json } from 'react-router';
import type { ActionFunctionArgs } from 'react-router';
import {
  formatApiRuntimeRoutesCopy,
  getApiRuntimeRoutesCopy,
  type ApiRuntimeRoutesKey,
} from '~/lib/i18n/catalogs/api-runtime-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { collectCappedBody } from '~/lib/web-search-body';
import { isAllowedUrl, isPrivateIp } from '~/utils/url';

const MAX_CONTENT_LENGTH = 8000;
const MAX_REDIRECTS = 5;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
type WebFetchErrorCode =
  | 'FETCH_FAILED'
  | 'HOST_UNRESOLVED'
  | 'INTERNAL_ADDRESS'
  | 'PAGE_TOO_LARGE'
  | 'TIMEOUT'
  | 'TOO_MANY_REDIRECTS'
  | 'URL_NOT_ALLOWED';

const WEB_FETCH_ERROR_KEYS: Readonly<Record<WebFetchErrorCode, ApiRuntimeRoutesKey>> = {
  FETCH_FAILED: 'apiRuntime.web.fetchFailed',
  HOST_UNRESOLVED: 'apiRuntime.web.hostUnresolved',
  INTERNAL_ADDRESS: 'apiRuntime.web.internalAddress',
  PAGE_TOO_LARGE: 'apiRuntime.web.pageTooLarge',
  TIMEOUT: 'apiRuntime.web.timeout',
  TOO_MANY_REDIRECTS: 'apiRuntime.web.tooManyRedirects',
  URL_NOT_ALLOWED: 'apiRuntime.web.urlNotAllowed',
};

async function assertHostAllowed(rawUrl: string): Promise<{ ok: true } | { ok: false; code: WebFetchErrorCode }> {
  if (!isAllowedUrl(rawUrl)) {
    return { ok: false, code: 'URL_NOT_ALLOWED' };
  }

  const hostname = new URL(rawUrl).hostname;

  try {
    const records = await lookup(hostname, { all: true });

    if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
      return { ok: false, code: 'INTERNAL_ADDRESS' };
    }
  } catch {
    return { ok: false, code: 'HOST_UNRESOLVED' };
  }

  return { ok: true };
}

const MAX_FETCH_BYTES = 5 * 1024 * 1024;

type SafeFetchResult =
  | { ok: true; status: number; statusText: string; contentType: string; html: string }
  | { ok: false; status: number; code: WebFetchErrorCode };

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
  acceptLanguage: string,
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
        callback(Object.assign(new Error(), { code: 'SSRF_BLOCKED' }));
        return;
      }

      callback(null, list[0].address, list[0].family);
    });
  };

  return new Promise((resolve, reject) => {
    const requestImpl = new URL(targetUrl).protocol === 'https:' ? httpsRequest : httpRequest;

    const req = requestImpl(
      targetUrl,
      {
        method: 'GET',
        headers: { ...FETCH_HEADERS, 'Accept-Language': acceptLanguage },
        lookup: validatingLookup as never,
        timeout: 10_000,
      },
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

    req.on('timeout', () => req.destroy(Object.assign(new Error(), { name: 'TimeoutError' })));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch following redirects manually so every hop's destination is re-validated
 * against the SSRF allow-list (scheme/host) AND connect-time-validated (resolved
 * IP), closing both the open-redirect and DNS-rebinding windows.
 */
async function safeFetch(initialUrl: string, acceptLanguage: string): Promise<SafeFetchResult> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const guard = await assertHostAllowed(currentUrl);

    if (!guard.ok) {
      return { ok: false, status: 400, code: guard.code };
    }

    let result;

    try {
      result = await httpGetOnce(currentUrl, acceptLanguage);
    } catch (error) {
      if ((error as { code?: string })?.code === 'SSRF_BLOCKED') {
        return { ok: false, status: 400, code: 'INTERNAL_ADDRESS' };
      }

      if ((error as Error)?.name === 'TimeoutError') {
        return { ok: false, status: 504, code: 'TIMEOUT' };
      }

      console.error('Web URL fetch transport error:', error);

      return { ok: false, status: 502, code: 'FETCH_FAILED' };
    }

    if (result.kind === 'too-large') {
      return { ok: false, status: 413, code: 'PAGE_TOO_LARGE' };
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

  return { ok: false, status: 502, code: 'TOO_MANY_REDIRECTS' };
}

export async function action({ request }: ActionFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const copy = getApiRuntimeRoutesCopy(localeResolution.language);

  const localizedJson = (data: unknown, init?: Parameters<typeof json>[1]) => {
    const responseInit = typeof init === 'number' ? { status: init } : init;

    return json(data, {
      ...responseInit,
      headers: localeResponseHeaders(request, localeResolution),
    });
  };

  if (request.method !== 'POST') {
    return localizedJson(
      { error: copy['apiRuntime.generic.methodNotAllowed'], code: 'METHOD_NOT_ALLOWED' },
      { status: 405 },
    );
  }

  try {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return localizedJson({ error: copy['apiRuntime.generic.invalidJson'], code: 'INVALID_JSON' }, { status: 400 });
    }

    const { url } = (payload ?? {}) as { url?: string };

    if (!url || typeof url !== 'string') {
      return localizedJson({ error: copy['apiRuntime.web.urlRequired'], code: 'URL_REQUIRED' }, { status: 400 });
    }

    const acceptLanguage = localeResolution.language === 'fr' ? 'fr-FR,fr;q=0.9,en;q=0.5' : 'en-US,en;q=0.9';
    const fetched = await safeFetch(url, acceptLanguage);

    if (!fetched.ok) {
      return localizedJson(
        { error: copy[WEB_FETCH_ERROR_KEYS[fetched.code]], code: fetched.code },
        { status: fetched.status },
      );
    }

    if (fetched.status < 200 || fetched.status >= 300) {
      return localizedJson(
        {
          error: formatApiRuntimeRoutesCopy(copy['apiRuntime.web.httpFailure'], { status: fetched.status }),
          code: 'UPSTREAM_HTTP_ERROR',
        },
        { status: 502 },
      );
    }

    if (!fetched.contentType.includes('text/html') && !fetched.contentType.includes('text/plain')) {
      return localizedJson(
        { error: copy['apiRuntime.web.unsupportedContent'], code: 'UNSUPPORTED_CONTENT_TYPE' },
        { status: 400 },
      );
    }

    const html = fetched.html;

    const title = extractTitle(html);
    const description = extractMetaDescription(html);
    const content = extractTextContent(html);

    return localizedJson({
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
      return localizedJson({ error: copy['apiRuntime.web.timeout'], code: 'TIMEOUT' }, { status: 504 });
    }

    console.error('Web search error:', error);

    return localizedJson({ error: copy['apiRuntime.web.fetchFailed'], code: 'FETCH_FAILED' }, { status: 500 });
  }
}
