/*
 * Helpers for the manual redirect loop in `app/routes/api.git-proxy.$.ts`.
 *
 * The outbound header set is built once with an explicit `Host` header naming
 * the *initial* target domain. When the proxy follows a 3xx manually it reuses
 * that header set for the redirect hop, but a copied explicit `Host` is a
 * problem: Node's undici honours an explicitly-set `Host` over the one it would
 * otherwise derive from the request URL, so a cross-host redirect would send the
 * NEW host a request whose `Host` still names the ORIGINAL domain. We must also
 * strip the caller's git credential when the redirect leaves the original
 * origin so a third-party host never receives the user's PAT/Basic token.
 */
export function buildRedirectHeaders(baseHeaders: Headers, nextUrl: string, initialOrigin: string | null): Headers {
  const redirectHeaders = new Headers(baseHeaders);

  let nextOrigin: string | null = null;
  let nextHost: string | null = null;

  try {
    const parsed = new URL(nextUrl);
    nextOrigin = parsed.origin;
    nextHost = parsed.host;
  } catch {
    nextOrigin = null;
    nextHost = null;
  }

  if (!initialOrigin || nextOrigin !== initialOrigin) {
    // Cross-origin hop: drop the caller's git credential.
    redirectHeaders.delete('authorization');
    redirectHeaders.delete('x-authorization');
  }

  /*
   * Re-point (or drop) the explicit Host header for the new target. If the hop
   * lands on a different host than the carried-over Host names, leaving the old
   * value would make undici send the wrong Host. Setting it to the new host (or
   * deleting it so undici derives it from the URL) keeps the request honest.
   */
  if (nextHost) {
    redirectHeaders.set('Host', nextHost);
  } else {
    redirectHeaders.delete('host');
  }

  return redirectHeaders;
}
