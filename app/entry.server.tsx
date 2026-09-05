/*
 * `renderToReadableStream` (web streams) ships in the browser/edge build. The
 * bare `react-dom/server` entry resolves to the CJS Node build
 * (renderToPipeableStream only) under @react-router/serve and crashes at boot,
 * so import the browser build explicitly. Node 18+ has web streams, so it runs
 * on Node. Types are shimmed in app/types/react-dom-server-browser.d.ts.
 */
import { renderToReadableStream } from 'react-dom/server.browser';
import type { AppLoadContext, EntryContext } from 'react-router';
import { ServerRouter } from 'react-router';

export const SERVER_RENDER_READY_TIMEOUT_MS = 4_000;

export function applyDocumentIsolationHeaders(responseHeaders: Headers) {
  responseHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');
  responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

  /*
   * Baseline document hardening that is safe alongside the WebContainer
   * isolation headers above. nosniff stops content-type sniffing on the HTML
   * document; the referrer policy keeps full URLs (which can carry project
   * slugs or tokens in the path) from leaking to cross-origin destinations
   * while still sending the origin.
   */
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  /*
   * Anti-clickjacking. frame-ancestors / X-Frame-Options govern who may embed
   * THIS document as a parent — they do NOT affect the preview/WebContainer
   * iframes the IDE itself renders as children (those are governed by frame-src).
   * The app never needs to be embedded by a third party, so forbid it.
   */
  responseHeaders.set('X-Frame-Options', 'SAMEORIGIN');
  responseHeaders.set('Content-Security-Policy', "frame-ancestors 'self'");

  /*
   * Low-risk defense-in-depth. Permissions-Policy mirrors the API's allowlist
   * (already proven safe there). HSTS is set on the primary document host (where
   * the session cookie lives) only in production, and must read
   * globalThis.process.env — Vite shims bare `process.env` to {} during SSR.
   * NOTE: a document `script-src` CSP is intentionally NOT set here; the IDE
   * needs wasm-unsafe-eval + blob workers and that requires a separately tested
   * policy to avoid breaking the editor/preview/terminal.
   */
  responseHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  if (globalThis.process?.env?.NODE_ENV === 'production') {
    responseHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}

/*
 * `no-store` on EVERY document, not just the marketing ones.
 *
 * This used to read `if (isPublicMarketingPath(pathname))`, added by
 * 339b86c9d to stop a stale service worker from preserving old community
 * pages. That intent was narrow and correct, but the resulting condition was
 * backwards from a security standpoint: it protected the pages that carry NO
 * session and left every authenticated document bare.
 *
 * Measured on production 2026-09-05:
 *
 *   GET https://app.e-code.ai/login
 *   HTTP/2 200
 *   content-type: text/html; charset=utf-8
 *   set-cookie: vc_upstream=...; Max-Age=3600; Path=/; Secure; HttpOnly
 *   (no cache-control at all)
 *
 * A document that answers 200, renders HTML and hands out a session cookie,
 * while saying nothing about its own cacheability. `vary: Cookie` is present
 * but it is not a substitute: it makes a compliant shared cache key on the
 * cookie, it does not forbid storage, and it does nothing about a request that
 * arrives WITHOUT a cookie -- which is exactly what a first visitor sends. Any
 * intermediary that stored that response could hand the first visitor's
 * `set-cookie` to the next one.
 *
 * Every document this app serves is SSR'd per request and can carry
 * per-user state, so there is no document for which storage is safe. The
 * marketing pages already received `no-store`, so making it unconditional
 * removes a hole without changing any existing behaviour.
 *
 * Deliberately NOT keyed on "does this response set a cookie" or on a list of
 * authenticated paths: both are conditions someone can get wrong later, and
 * getting them wrong is silent. An unconditional header cannot be misapplied.
 */
export function applyDocumentCacheHeaders(_request: Request, responseHeaders: Headers) {
  responseHeaders.set('Cache-Control', 'no-store');
}

export async function waitForServerRenderReady(allReady: Promise<unknown>, timeoutMs = SERVER_RENDER_READY_TIMEOUT_MS) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<'timeout'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  const result = await Promise.race([allReady.then(() => 'ready' as const), timeout]);

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (result === 'timeout') {
    allReady.catch((error: unknown) => {
      console.error('SSR allReady failed after timeout', error);
    });
  }

  return result;
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const readable = await renderToReadableStream(<ServerRouter context={routerContext} url={request.url} />, {
    signal: request.signal,
    onError(error: unknown) {
      console.error(error);
      responseStatusCode = 500;
    },
  });

  /*
   * Prefer the complete SSR payload, but never let one unresolved Suspense
   * boundary hold the whole document hostage. The client can hydrate the
   * boot fallback while the route bundle finishes loading.
   *
   * React's `renderToReadableStream` already prepends `<!DOCTYPE html>` because
   * the root route's `Layout` export renders the whole <html> document (it
   * replaced the former remix-island head/body split). We therefore stream the
   * readable straight through — prepending our own DOCTYPE here would emit a
   * second, duplicate token.
   */
  await waitForServerRenderReady(readable.allReady);

  responseHeaders.set('Content-Type', 'text/html');
  applyDocumentIsolationHeaders(responseHeaders);
  applyDocumentCacheHeaders(request, responseHeaders);

  return new Response(readable, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
