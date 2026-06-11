import type { LoaderFunctionArgs } from '@remix-run/cloudflare';

import { ecodeStaticHtml } from './ecode-static-html';

const AUTH_ROUTES_KEPT_IN_VIBECORE = new Set([
  '/login',
  '/register',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
]);

const AUTH_NAVIGATION_GUARD = String.raw`
<script>
(() => {
  const vibecoreAuthRoutes = new Set(['/login', '/register', '/signup', '/forgot-password', '/reset-password', '/verify-email']);

  function vibecoreAuthUrl(value) {
    if (!value) return null;

    let url;
    try {
      url = new URL(value, window.location.origin);
    } catch {
      return null;
    }

    if (url.origin !== window.location.origin || !vibecoreAuthRoutes.has(url.pathname)) {
      return null;
    }

    return url.pathname + url.search + url.hash;
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      const anchor = target && typeof target.closest === 'function' ? target.closest('a[href]') : null;
      const destination = anchor ? vibecoreAuthUrl(anchor.getAttribute('href')) : null;

      if (!destination) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(destination);
    },
    true,
  );

  const nativePushState = window.history.pushState;
  const nativeReplaceState = window.history.replaceState;

  window.history.pushState = function patchedPushState(state, title, url) {
    const destination = vibecoreAuthUrl(url);

    if (destination) {
      window.location.assign(destination);
      return;
    }

    return nativePushState.apply(this, arguments);
  };

  window.history.replaceState = function patchedReplaceState(state, title, url) {
    const destination = vibecoreAuthUrl(url);

    if (destination) {
      window.location.replace(destination);
      return;
    }

    return nativeReplaceState.apply(this, arguments);
  };
})();
</script>`;

const ECODE_MARKETING_SHELL_HTML = ecodeStaticHtml
  .replace('<body', '<body data-ecode-static-shell="true"')
  .replace('</head>', `${AUTH_NAVIGATION_GUARD}</head>`);

export function ecodeMarketingShellLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  if (AUTH_ROUTES_KEPT_IN_VIBECORE.has(url.pathname)) {
    throw new Response('Not Found', { status: 404 });
  }

  return new Response(ECODE_MARKETING_SHELL_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Vibecore-Marketing-Shell': 'ecode-static',
    },
  });
}
