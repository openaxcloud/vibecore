import type { LoaderFunctionArgs } from 'react-router';

import { ecodeStaticHtml } from './ecode-static-html';

const AUTH_ROUTES_KEPT_IN_VIBECORE = new Set([
  '/login',
  '/register',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
]);

const STATIC_MOBILE_MENU_SCROLL_FIX = String.raw`
<style id="vibecore-ecode-mobile-menu-scroll-fix">
@media (max-width: 1023px) {
  [role='dialog'][data-state][class*='slide-in-from-right'] {
    display: flex !important;
    flex-direction: column !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    overflow: hidden !important;
  }

  [role='dialog'][data-state][class*='slide-in-from-right'] > .sticky,
  [role='dialog'][data-state][class*='slide-in-from-right'] > .border-b {
    flex-shrink: 0 !important;
  }

  [role='dialog'][data-state][class*='slide-in-from-right'] > [dir='ltr'].relative.overflow-hidden {
    flex: 1 1 0% !important;
    min-height: 0 !important;
    height: auto !important;
  }

  [role='dialog'][data-state][class*='slide-in-from-right'] [data-radix-scroll-area-viewport] {
    height: 100% !important;
    max-height: 100% !important;
  }

  [role='dialog'][data-state][class*='slide-in-from-right'] [data-radix-scroll-area-viewport] .p-4.space-y-1 {
    padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px)) !important;
  }
}

@media (max-width: 639px) {
  [data-ecode-static-shell] .flex.gap-4.justify-center {
    flex-wrap: wrap !important;
  }

  [data-ecode-static-shell] .flex.gap-4.justify-center > a,
  [data-ecode-static-shell] .flex.gap-4.justify-center > button {
    min-width: 0 !important;
    max-width: 100% !important;
  }

  [data-ecode-static-shell] .flex.gap-4.justify-center > a > button,
  [data-ecode-static-shell] .flex.gap-4.justify-center > button {
    width: 100% !important;
    white-space: normal !important;
  }

  [data-ecode-static-shell] .grid > * {
    min-width: 0 !important;
    max-width: 100% !important;
  }

  [data-ecode-static-shell] h1,
  [data-ecode-static-shell] h2,
  [data-ecode-static-shell] h3,
  [data-ecode-static-shell] p,
  [data-ecode-static-shell] li {
    overflow-wrap: anywhere !important;
  }
}
</style>`;

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
  .replace('</head>', `${STATIC_MOBILE_MENU_SCROLL_FIX}${AUTH_NAVIGATION_GUARD}</head>`);

export function ecodeMarketingShellLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  if (AUTH_ROUTES_KEPT_IN_VIBECORE.has(url.pathname)) {
    throw new Response('Not Found', { status: 404 });
  }

  return new Response(ECODE_MARKETING_SHELL_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-E-Code-Marketing-Shell': 'ecode-static',
    },
  });
}
