/**
 * Pure helpers for the Electron main process that keep cookie persistence cheap.
 *
 * `protocol.handle('http')` previously called `storeCookies(cookies)` on *every*
 * server-build request. electron-store's `set()` synchronously JSON-encrypts and
 * rewrites the whole config file per call, so a single page load (N navigations,
 * M cookies) produced N*M full-file disk writes + safeStorage encryptions.
 *
 * These helpers let the request handler persist only the cookies that actually
 * changed since the last write, so steady-state navigation does zero disk I/O.
 * Kept pure (no electron imports) so they're unit-testable in isolation.
 */

export interface SyncableCookie {
  name: string;
  value: string;
}

/**
 * Build the origin-scoped filter used when fetching cookies to forward to the
 * app's own (auth-bearing) Remix server.
 *
 * The BrowserWindow runs in the default (unpartitioned) session, which is shared
 * with in-app previews and AI-generated user apps. Fetching cookies with an empty
 * filter (`{}`) returns *every* cookie in that session, so cookies set by those
 * other origins leaked into requests to our own server and onto disk. Passing a
 * `url` filter makes Electron apply standard cookie matching (domain/path/secure)
 * and only return cookies that legitimately belong to the request origin.
 *
 * `requestUrl` is the incoming request URL; we only build a filter from it once
 * the caller has confirmed it targets the app's own server port, so its origin is
 * the app origin.
 */
export function appOriginCookieFilter(requestUrl: string): { url: string } {
  return { url: new URL(requestUrl).origin };
}

/**
 * Build a stable signature for a single cookie. Only name+value participate in
 * the request `Cookie` header we forward, so a value change is the only thing
 * worth re-persisting for.
 */
function cookieSignature(cookie: SyncableCookie): string {
  return `${cookie.name}=${cookie.value}`;
}

/**
 * Snapshot of the last-persisted cookies, keyed by name.
 */
export type CookieSnapshot = Map<string, string>;

export function createCookieSnapshot(): CookieSnapshot {
  return new Map();
}

/**
 * Given the current cookies and a snapshot of what was last persisted, return
 * only the cookies whose value is new or changed. An empty array means the store
 * is already up to date and no disk write is needed.
 *
 * Note: this intentionally does NOT track deletions — the existing persistence
 * layer never removed `cookie:*` rows, so behaviour there is unchanged; we only
 * suppress redundant re-writes.
 */
export function diffCookies<T extends SyncableCookie>(cookies: readonly T[], snapshot: CookieSnapshot): T[] {
  const changed: T[] = [];

  for (const cookie of cookies) {
    if (snapshot.get(cookie.name) !== cookieSignature(cookie)) {
      changed.push(cookie);
    }
  }

  return changed;
}

/**
 * Record the cookies just persisted into the snapshot so subsequent diffs are
 * accurate. Call this only after the write succeeds.
 */
export function recordCookies(cookies: readonly SyncableCookie[], snapshot: CookieSnapshot): void {
  for (const cookie of cookies) {
    snapshot.set(cookie.name, cookieSignature(cookie));
  }
}
