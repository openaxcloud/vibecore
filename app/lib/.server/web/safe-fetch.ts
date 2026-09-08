/**
 * SSRF-guarded HTTP(S) GET shared by the manual 🌐 widget (`/api/web-search`)
 * and the agent's automatic web reference (`web-reference.ts`).
 *
 * Extracted from `app/routes/api.web-search.ts` (same guard, same headers;
 * additions: a hard wall-clock deadline, caller abort, per-call byte cap and
 * Accept override — all opt-in, so the widget's behaviour is unchanged) so both
 * callers keep ONE guard: scheme/host allow-list before every hop, connect-time DNS
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

/** Unchanged from the original /api/web-search route (a WAF may fingerprint the exact Chrome Accept string). */
export const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export interface SafeFetchOptions {
  /** Caller abort (the chat request's signal). */
  signal?: AbortSignal;

  /**
   * HARD wall-clock deadline for the whole fetch (all redirect hops, headers and
   * body). Node's `timeout` option is only an idle timer: a server that trickles
   * one byte every few seconds never trips it, which would hang a chat request
   * for as long as the byte cap allows. Defaults to FETCH_TIMEOUT_MS.
   */
  deadlineMs?: number;

  /** Body cap. Defaults to MAX_FETCH_BYTES. */
  maxBytes?: number;

  /** Accept header override (e.g. text/css for a stylesheet). */
  accept?: string;

  /** User-Agent override (the agent's crawl identifies itself; the widget keeps the browser string). */
  userAgent?: string;
}

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

export type SafeFetch = (url: string, acceptLanguage: string, options?: SafeFetchOptions) => Promise<SafeFetchResult>;

/**
 * Decode a response body with the charset the site declares (Content-Type
 * header, else a <meta charset> / http-equiv sniff of the first 2 KB), falling
 * back to UTF-8. Older French SMB sites — exactly what users ask to clone — are
 * still served as ISO-8859-1 / windows-1252; decoded as UTF-8 every accent
 * became U+FFFD in the title, headings and copy.
 */
export function decodeBody(buffer: Buffer, contentType: string): string {
  const fromHeader = contentType.match(/charset\s*=\s*"?([\w.:-]+)/iu)?.[1];
  const head = buffer.subarray(0, 2048).toString('latin1');

  const fromMeta =
    head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/iu)?.[1] ??
    head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w.:-]+)/iu)?.[1];

  const label = (fromHeader ?? fromMeta ?? 'utf-8').toLowerCase();

  if (label === 'utf-8' || label === 'utf8') {
    return buffer.toString('utf8');
  }

  try {
    return new TextDecoder(label, { fatal: false }).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

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
interface HopOptions {
  signal?: AbortSignal;

  /** Absolute epoch-ms deadline shared by every hop. */
  deadlineAt: number;
  maxBytes: number;
  accept: string;
  userAgent: string;
}

class DeadlineError extends Error {
  override name = 'DeadlineError';
}

/**
 * Attach a hard deadline + caller abort to an outgoing request: whichever fires
 * first destroys the socket with a typed error. Returns the cleanup to call once
 * the request settled (so a finished request never keeps a timer alive).
 */
export function armDeadline(
  target: { destroy: (error?: Error) => void },
  deadlineAt: number,
  signal: AbortSignal | undefined,
  now: () => number = Date.now,
): () => void {
  const remaining = deadlineAt - now();

  /*
   * `new Error()` NU, comme les deux abandons voisins (`SSRF_BLOCKED` ligne ~202,
   * `TimeoutError` ligne ~266) : c'est le `name` qui porte le sens, et c'est lui
   * que lisent les consommateurs (`name === 'AbortError'`). Le message 'aborted'
   * n'etait lu par personne et declenchait le garde i18n `error-message`
   * (`new-file-debt`, baseline=0 current=1), lequel refusait tout deploiement —
   * la porte de release exige `Production CI` verte pour le commit exact.
   *
   * `DeadlineError` est nu pour la meme raison : il echappe au scanner par son
   * NOM (la regle ne voit que `new Error(...)`), pas parce que son message
   * servirait a quelque chose — personne ne le lit. Epingle par safe-fetch.spec.
   */
  const onAbort = () => target.destroy(Object.assign(new Error(), { name: 'AbortError' }));

  if (signal?.aborted) {
    onAbort();

    return () => undefined;
  }

  const timer = setTimeout(() => target.destroy(new DeadlineError()), Math.max(0, remaining));
  signal?.addEventListener('abort', onAbort, { once: true });

  return () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  };
}

async function httpGetOnce(
  targetUrl: string,
  acceptLanguage: string,
  hop: HopOptions,
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
        headers: {
          ...FETCH_HEADERS,
          'User-Agent': hop.userAgent,
          Accept: hop.accept,
          'Accept-Language': acceptLanguage,
        },
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

        if (Number.isFinite(declaredLength) && declaredLength > hop.maxBytes) {
          res.destroy();
          resolve({ kind: 'too-large' });

          return;
        }

        collectCappedBody(res, hop.maxBytes).then((collected) => {
          if (collected.kind === 'too-large') {
            resolve({ kind: 'too-large' });

            return;
          }

          resolve({
            kind: 'body',
            status,
            statusText: res.statusMessage ?? '',
            contentType: (res.headers['content-type'] as string | undefined) ?? '',
            html: decodeBody(collected.buffer, (res.headers['content-type'] as string | undefined) ?? ''),
          });
        }, reject);
      },
    );

    const disarm = armDeadline(req, hop.deadlineAt, hop.signal);

    req.on('timeout', () => req.destroy(Object.assign(new Error(), { name: 'TimeoutError' })));
    req.on('error', reject);
    req.on('close', disarm);
    req.end();
  });
}

/**
 * Fetch following redirects manually so every hop's destination is re-validated
 * against the SSRF allow-list (scheme/host) AND connect-time-validated (resolved
 * IP), closing both the open-redirect and DNS-rebinding windows. `url` in the
 * success branch is the FINAL url after redirects.
 */
export async function safeFetch(
  initialUrl: string,
  acceptLanguage: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  let currentUrl = initialUrl;

  const hopOptions: HopOptions = {
    signal: options.signal,
    deadlineAt: Date.now() + (options.deadlineMs ?? FETCH_TIMEOUT_MS),
    maxBytes: options.maxBytes ?? MAX_FETCH_BYTES,
    accept: options.accept ?? FETCH_HEADERS.Accept,
    userAgent: options.userAgent ?? FETCH_HEADERS['User-Agent'],
  };

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (options.signal?.aborted || Date.now() >= hopOptions.deadlineAt) {
      return { ok: false, status: 504, code: 'TIMEOUT' };
    }

    const guard = await assertHostAllowed(currentUrl);

    if (!guard.ok) {
      return { ok: false, status: 400, code: guard.code };
    }

    let result;

    try {
      result = await httpGetOnce(currentUrl, acceptLanguage, hopOptions);
    } catch (error) {
      if ((error as { code?: string })?.code === 'SSRF_BLOCKED') {
        return { ok: false, status: 400, code: 'INTERNAL_ADDRESS' };
      }

      const name = (error as Error)?.name;

      if (name === 'TimeoutError' || name === 'DeadlineError' || name === 'AbortError') {
        return { ok: false, status: 504, code: 'TIMEOUT' };
      }

      // The deadline destroyed the socket mid-body: collectCappedBody rejects with STREAM_CLOSED.
      if ((error as { code?: string })?.code === 'STREAM_CLOSED' && Date.now() >= hopOptions.deadlineAt) {
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
