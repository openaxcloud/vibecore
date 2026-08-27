import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { readSessionToken } from '~/lib/enterprise-api.server';
import { buildRedirectHeaders } from '~/lib/git-proxy-redirect';
import { webApiErrorResponse } from '~/lib/i18n/catalogs/web-api-routes';

/*
 * Same-origin CORS origin for the git proxy. The IDE's isomorphic-git client
 * calls `/api/git-proxy/...` on its own origin, so the only legitimate CORS
 * origin is the request's own origin. Returning `*` (the previous behaviour)
 * made this an open cross-origin proxy that any site could drive to relay a
 * caller's git Authorization/PAT. Echo the request Origin only when it equals
 * the deployment origin; otherwise omit the header so a cross-origin page gets
 * no usable response.
 */
function sameOriginCors(request: Request): string | undefined {
  const origin = request.headers.get('origin');

  if (!origin) {
    return undefined;
  }

  try {
    return origin === new URL(request.url).origin ? origin : undefined;
  } catch {
    return undefined;
  }
}

// Allowed headers to forward to the target server
const ALLOW_HEADERS = [
  'accept-encoding',
  'accept-language',
  'accept',
  'access-control-allow-origin',
  'authorization',
  'cache-control',
  'connection',
  'content-length',
  'content-type',
  'dnt',
  'pragma',
  'range',
  'referer',
  'user-agent',
  'x-authorization',
  'x-http-method-override',
  'x-requested-with',
];

// Headers to expose from the target server's response
const EXPOSE_HEADERS = [
  'accept-ranges',
  'age',
  'cache-control',
  'content-length',
  'content-language',
  'content-type',
  'date',
  'etag',
  'expires',
  'last-modified',
  'pragma',
  'server',
  'transfer-encoding',
  'vary',
  'x-github-request-id',
  'x-redirected-url',
];

type StreamingRequestInit = RequestInit & { duplex?: 'half' };

/*
 * SSRF guard. This proxy forwards to https://<domain>/... and relays the caller's
 * Authorization header (a git PAT/Basic credential). Without a target check it is
 * an open proxy + credential relay: an attacker could target cloud metadata
 * (169.254.169.254), in-cluster services, or RFC1918 hosts and exfiltrate creds.
 * Allow only https public hosts (self-hosted public git still works); reject
 * loopback/private/link-local/internal names. Hostname-based — DNS-rebinding is
 * out of scope for this layer.
 */
function isSafeProxyTarget(rawUrl: string): boolean {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') {
    return false;
  }

  const rawHost = url.hostname.toLowerCase();

  /*
   * Strip IPv6 brackets, fold IPv4-mapped IPv6, and expand integer IP literals
   * (decimal/hex/octal) so a `[::ffff:169.254.169.254]` or `https://2130706433/`
   * can't slip past the dotted-quad/prefix checks below.
   */
  const host = canonicalizeProxyHost(rawHost);

  /*
   * ULA fc00::/7 and link-local fe80::/10, but only as IPv6 literals. This must
   * match hextets followed by ':' so public hostnames like fcbarcelona.com,
   * fdic.gov and fe80.example.com are not blocked.
   */
  const isPrivateIpv6Literal = /^f[cd][0-9a-f]{0,2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);

  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^0\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
    isPrivateIpv6Literal
  ) {
    return false;
  }

  return true;
}

function canonicalizeProxyHost(rawHost: string): string {
  /*
   * Strip brackets AND a trailing dot — `169.254.169.254.` / `foo.internal.` are
   * FQDN forms that resolve identically but evaded the blocklist (SSRF bypass).
   */
  const host = rawHost.replace(/^\[/, '').replace(/\]$/, '').replace(/\.+$/, '');

  const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);

  if (mapped) {
    return mapped[1];
  }

  /*
   * IPv4-mapped IPv6 in HEX-COMPRESSED form (::ffff:7f00:1). The WHATWG URL parser
   * normalizes [::ffff:127.0.0.1] to this hex form, which the dotted regex above
   * misses — decode the two hextets back to dotted-quad so the blocklist applies.
   */
  const hexMapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);

  if (hexMapped) {
    const value = (parseInt(hexMapped[1], 16) << 16) | parseInt(hexMapped[2], 16);
    return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join('.');
  }

  /*
   * IPv6 transition forms that embed an IPv4 the parser doesn't fold: NAT64
   * (64:ff9b::a9fe:a9fe) and 6to4 (2002:a9fe:a9fe::), both → 169.254.169.254.
   * Decode the two embedded hextets to dotted-quad so the blocklist applies.
   */
  const transition =
    host.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/) || host.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})/);

  if (transition) {
    const value = (parseInt(transition[1], 16) << 16) | parseInt(transition[2], 16);
    return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join('.');
  }

  let asInt: number | undefined;

  if (/^\d+$/.test(host)) {
    asInt = Number.parseInt(host, 10);
  } else if (/^0x[0-9a-f]+$/.test(host)) {
    asInt = Number.parseInt(host, 16);
  } else if (/^0[0-7]+$/.test(host)) {
    asInt = Number.parseInt(host, 8);
  }

  if (asInt !== undefined && Number.isFinite(asInt) && asInt >= 0 && asInt <= 0xffffffff) {
    return [(asInt >>> 24) & 0xff, (asInt >>> 16) & 0xff, (asInt >>> 8) & 0xff, asInt & 0xff].join('.');
  }

  return host;
}

// Header names whose values are credentials and must never be written to logs.
const SENSITIVE_HEADER_NAMES = new Set(['authorization', 'x-authorization', 'cookie', 'set-cookie']);

/*
 * Build a plain object of header entries with credential values masked, so the
 * user's PAT / Basic-auth (sent on every authenticated git operation) and any
 * cookies are not leaked verbatim into server logs.
 */
function redactSensitiveHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [name, value] of headers.entries()) {
    result[name] = SENSITIVE_HEADER_NAMES.has(name.toLowerCase()) ? '***redacted***' : value;
  }

  return result;
}

// Handle all HTTP methods
export async function action({ request, params }: ActionFunctionArgs) {
  return handleProxyRequest(request, params['*']);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  return handleProxyRequest(request, params['*']);
}

async function handleProxyRequest(request: Request, path: string | undefined) {
  try {
    if (!path) {
      return webApiErrorResponse(request, 'GIT_PROXY_URL_INVALID', 400);
    }

    // Handle CORS preflight request (carries no session cookie — gate is below)
    if (request.method === 'OPTIONS') {
      const preflightHeaders: Record<string, string> = {
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': ALLOW_HEADERS.join(', '),
        'Access-Control-Expose-Headers': EXPOSE_HEADERS.join(', '),
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      };

      const preflightOrigin = sameOriginCors(request);

      if (preflightOrigin) {
        preflightHeaders['Access-Control-Allow-Origin'] = preflightOrigin;
      }

      return new Response(null, { status: 200, headers: preflightHeaders });
    }

    /*
     * Require an authenticated session. This proxy forwards to arbitrary public
     * https git hosts AND relays the caller's Authorization header (a git PAT /
     * Basic credential). Left unauthenticated it is a bandwidth-abuse vector and
     * an anonymous credential relay. The IDE always calls it same-origin, so the
     * session cookie is present.
     */
    if (!readSessionToken(request)) {
      return webApiErrorResponse(request, 'GIT_PROXY_UNAUTHORIZED', 401);
    }

    // Extract domain and remaining path
    const parts = path.match(/([^\/]+)\/?(.*)/);

    if (!parts) {
      return webApiErrorResponse(request, 'GIT_PROXY_PATH_INVALID', 400);
    }

    const domain = parts[1];
    const remainingPath = parts[2] || '';

    // Reconstruct the target URL with query parameters
    const url = new URL(request.url);
    const targetURL = `https://${domain}/${remainingPath}${url.search}`;

    // SSRF / credential-relay guard: reject internal/private/loopback targets.
    if (!isSafeProxyTarget(targetURL)) {
      return webApiErrorResponse(request, 'GIT_PROXY_TARGET_FORBIDDEN', 403);
    }

    console.log('Target URL:', targetURL);

    // Filter and prepare headers
    const headers = new Headers();

    // Only forward allowed headers
    for (const header of ALLOW_HEADERS) {
      if (request.headers.has(header)) {
        headers.set(header, request.headers.get(header)!);
      }
    }

    // Set the host header
    headers.set('Host', domain);

    // Set Git user agent if not already present
    if (!headers.has('user-agent') || !headers.get('user-agent')?.startsWith('git/')) {
      headers.set('User-Agent', 'git/@isomorphic-git/cors-proxy');
    }

    console.log('Request headers:', redactSensitiveHeaders(headers));

    // Prepare fetch options
    const fetchOptions: StreamingRequestInit = {
      method: request.method,
      headers,

      /*
       * Manual redirect handling — NOT 'follow'. With 'follow', fetch would
       * transparently chase a 3xx to an internal host (169.254.169.254, RFC1918,
       * in-cluster) while still carrying the user's git credential, defeating the
       * isSafeProxyTarget() guard that only checked the initial target. Re-validate
       * every redirect hop (mirrors api.web-search.ts's safeFetch loop).
       */
      redirect: 'manual',
    };

    // Add body for non-GET/HEAD requests
    if (!['GET', 'HEAD'].includes(request.method)) {
      fetchOptions.body = request.body;
      fetchOptions.duplex = 'half';
    }

    // Forward the request to the target URL (bounded so a hung upstream can't pin the pod)
    fetchOptions.signal = AbortSignal.timeout(30000);

    let response = await fetch(targetURL, fetchOptions);

    /*
     * Follow redirects manually, re-validating each destination against the SSRF
     * guard so a public host can't bounce us into the metadata/internal network.
     */
    let redirectsLeft = 5;

    const initialOrigin = (() => {
      try {
        return new URL(targetURL).origin;
      } catch {
        return null;
      }
    })();

    while (response.status >= 300 && response.status < 400 && response.headers.has('location') && redirectsLeft > 0) {
      redirectsLeft -= 1;

      const nextUrl = new URL(response.headers.get('location')!, response.url || targetURL).toString();

      if (!isSafeProxyTarget(nextUrl)) {
        await response.body?.cancel().catch(() => undefined);
        return webApiErrorResponse(request, 'GIT_PROXY_REDIRECT_FORBIDDEN', 403);
      }

      await response.body?.cancel().catch(() => undefined);

      /*
       * Build the per-hop header set. This drops the caller's git credential
       * (Authorization/Basic PAT) when the redirect leaves the original origin —
       * even a redirect to a public host is a third party that must never receive
       * the user's token — AND re-points the explicit Host header at the new
       * target so undici doesn't send a stale Host naming the previous domain.
       */
      const redirectHeaders = buildRedirectHeaders(headers, nextUrl, initialOrigin);

      /*
       * Redirects are followed as GET without the original body (matches fetch's
       * default redirect handling for cross-origin/credentialed hops).
       */
      response = await fetch(nextUrl, {
        method: 'GET',
        headers: redirectHeaders,
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
      });
    }

    console.log('Response status:', response.status);

    // Create response headers
    const responseHeaders = new Headers();

    // Add CORS headers — same-origin only (never `*`), no Allow-Credentials.
    const responseOrigin = sameOriginCors(request);

    if (responseOrigin) {
      responseHeaders.set('Access-Control-Allow-Origin', responseOrigin);
    }

    responseHeaders.set('Vary', 'Origin');
    responseHeaders.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', ALLOW_HEADERS.join(', '));
    responseHeaders.set('Access-Control-Expose-Headers', EXPOSE_HEADERS.join(', '));

    // Copy exposed headers from the target response
    for (const header of EXPOSE_HEADERS) {
      // Skip content-length as we'll use the original response's content-length
      if (header === 'content-length') {
        continue;
      }

      if (response.headers.has(header)) {
        responseHeaders.set(header, response.headers.get(header)!);
      }
    }

    // If the response was redirected, add the x-redirected-url header
    if (response.redirected) {
      responseHeaders.set('x-redirected-url', response.url);
    }

    console.log('Response headers:', redactSensitiveHeaders(responseHeaders));

    // Return the response with the target's body stream piped directly
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return webApiErrorResponse(request, 'GIT_PROXY_FAILED', 502);
  }
}
