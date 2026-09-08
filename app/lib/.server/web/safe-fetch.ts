/**
 * SSRF-guarded HTTP(S) GET shared by the manual 🌐 widget (`/api/web-search`)
 * and the agent's automatic web reference (`web-reference.ts`).
 *
 * Extracted verbatim from `app/routes/api.web-search.ts` so both callers keep
 * ONE guard: scheme/host allow-list before every hop, connect-time DNS
 * re-validation (rebinding), manual redirect following with re-validation,
 * byte cap, timeout. `node:*` modules are imported DYNAMICALLY — a static
 * top-level import makes the vite client build fail ("externalized for browser
 * compatibility"), whereas a runtime import is left alone in the SSR bundle.
 */
import { collectCappedBody } from '~/lib/web-search-body';
import { isAllowedUrl, isPrivateIp } from '~/utils/url';

export const MAX_FETCH_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
export const FETCH_TIMEOUT_MS = 10_000;

export const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/css;q=0.8,*/*;q=0.7',
};

export type WebFetchErrorCode =
  | 'FETCH_FAILED'
  | 'HOST_UNRESOLVED'
  | 'INTERNAL_ADDRESS'
  | 'PAGE_TOO_LARGE'
  | 'TIMEOUT'
  | 'TOO_MANY_REDIRECTS'
  | 'URL_NOT_ALLOWED';

export type SafeFetchResult =
  | { ok: true; url: string; status: number; statusText: string; contentType: string; html: string }
  | { ok: false; status: number; code: WebFetchErrorCode };

export type SafeFetch = (url: string, acceptLanguage: string) => Promise<SafeFetchResult>;

/**
 * Reject a URL whose host resolves to an internal address. The string-level
 * `isAllowedUrl` only inspects the hostname literal; this resolves DNS so a
 * public hostname that maps to a private/link-local/loopback IP (DNS rebinding,
 * or a redirect into the metadata server) is blocked.
 */
export async function assertHostAllowed(
  rawUrl: string,
): Promise<{ ok: true } | { ok: false; code: WebFetchErrorCode }> {
  if (!isAllowedUrl(rawUrl)) {
    return { ok: false, code: 'URL_NOT_ALLOWED' };
  }

  const hostname = new URL(rawUrl).hostname;

  try {
    const { lookup } = await import('node:dns/promises');
    const records = await lookup(hostname, { all: true });

    if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
      return { ok: false, code: 'INTERNAL_ADDRESS' };
    }
  } catch {
    return { ok: false, code: 'HOST_UNRESOLVED' };
  }

  return { ok: true };
}

/**
 * One HTTP(S) GET with connect-time DNS validation. The custom `lookup`
 * re-validates EVERY resolved address at the moment of connection, so a
 * public→private DNS rebind (attacker domain, TTL=0) between the pre-fetch
 * assertHostAllowed() check and the actual connect can't reach an internal host
 * — closing the TOCTOU that global fetch (no per-connection lookup hook) left
 * open.
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
        timeout: FETCH_TIMEOUT_MS,
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
 * IP), closing both the open-redirect and DNS-rebinding windows. `url` in the
 * success branch is the FINAL url after redirects.
 */
export async function safeFetch(initialUrl: string, acceptLanguage: string): Promise<SafeFetchResult> {
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
      url: currentUrl,
      status: result.status,
      statusText: result.statusText,
      contentType: result.contentType,
      html: result.html,
    };
  }

  return { ok: false, status: 502, code: 'TOO_MANY_REDIRECTS' };
}

/** Accept-Language header matching the user's UI language. */
export function acceptLanguageFor(language: string | null | undefined): string {
  return language === 'fr' ? 'fr-FR,fr;q=0.9,en;q=0.5' : 'en-US,en;q=0.9';
}
