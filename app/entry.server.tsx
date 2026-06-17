import { renderToReadableStream } from 'react-dom/server';
import type { AppLoadContext, EntryContext } from 'react-router';
import { ServerRouter } from 'react-router';
import { isPublicMarketingPath } from '~/lib/stores/theme';

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

export function applyDocumentCacheHeaders(request: Request, responseHeaders: Headers) {
  const pathname = new URL(request.url).pathname;

  if (isPublicMarketingPath(pathname)) {
    responseHeaders.set('Cache-Control', 'no-store');
  }
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
   * The <!DOCTYPE html> is prepended here; the rest of the document
   * (<html>/<head>/<body>) is rendered by the root route's `Layout` export,
   * which replaced the former remix-island head/body split.
   */
  await waitForServerRenderReady(readable.allReady);

  const reader = readable.getReader();

  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(new TextEncoder().encode('<!DOCTYPE html>')));

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              controller.close();

              return;
            }

            controller.enqueue(value);
            read();
          })
          .catch((error) => {
            controller.error(error);
            reader.cancel();
          });
      }
      read();
    },

    cancel() {
      reader.cancel();
    },
  });

  responseHeaders.set('Content-Type', 'text/html');
  applyDocumentIsolationHeaders(responseHeaders);
  applyDocumentCacheHeaders(request, responseHeaders);

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
