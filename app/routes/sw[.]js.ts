import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { pwaServiceWorkerScript } from '~/lib/pwa-service-worker.server';

export function loader(_args: LoaderFunctionArgs) {
  return new Response(pwaServiceWorkerScript, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Service-Worker-Allowed': '/',
    },
  });
}
