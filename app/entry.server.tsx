import type { AppLoadContext } from '@remix-run/cloudflare';
import { RemixServer } from '@remix-run/react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { renderHeadToString } from 'remix-island';
import { Head } from './root';
import { themeStore } from '~/lib/stores/theme';

export const SERVER_RENDER_READY_TIMEOUT_MS = 4_000;

export function applyDocumentIsolationHeaders(responseHeaders: Headers) {
  responseHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');
  responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
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
  remixContext: any,
  _loadContext: AppLoadContext,
) {
  const head = renderHeadToString({
    request,
    remixContext: { ...remixContext, serverHandoffStream: undefined },
    Head,
  });

  const readable = await renderToReadableStream(<RemixServer context={remixContext} url={request.url} />, {
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
   */
  await waitForServerRenderReady(readable.allReady);

  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new Uint8Array(
          new TextEncoder().encode(
            `<!DOCTYPE html><html lang="en" data-theme="${themeStore.value}"><head>${head}</head><body><div id="root" class="w-full h-full">`,
          ),
        ),
      );

      const reader = readable.getReader();

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              controller.enqueue(new Uint8Array(new TextEncoder().encode('</div></body></html>')));
              controller.close();

              return;
            }

            controller.enqueue(value);
            read();
          })
          .catch((error) => {
            controller.error(error);
            readable.cancel();
          });
      }
      read();
    },

    cancel() {
      readable.cancel();
    },
  });

  responseHeaders.set('Content-Type', 'text/html');
  applyDocumentIsolationHeaders(responseHeaders);

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
