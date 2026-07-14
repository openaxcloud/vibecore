/* eslint-disable import/order */
import { useStore } from '@nanostores/react';
import EcodeBootMark from './components/brand/EcodeBootMark';
import type { LinksFunction, MetaFunction } from 'react-router';
import {
  isRouteErrorResponse,
  Links,
  Link,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigation,
  useRouteError,
} from 'react-router';
import { LinkButton, PublicShell, shouldShowUserAreaNavigationSkeleton } from './components/dashboard/SaaSLayout';
import {
  ANNOUNCEMENT_DISMISSED_ATTRIBUTE,
  ANNOUNCEMENT_DISMISSED_STORAGE_KEY,
} from './components/marketing/ecode-exact/announcement';
import {
  LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_AUTO_COLLAPSE_MEDIA_QUERY,
  SIDEBAR_COLLAPSED_ATTRIBUTE,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from './components/dashboard/sidebar-collapse';
import { ImpersonationBanner } from './components/dashboard/ImpersonationBanner';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { installEditorPwaServiceWorker } from '@vibecore/editor';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';
import { useEffect, useRef, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { I18nextProvider } from 'react-i18next';
import { cssTransition, ToastContainer } from 'react-toastify';

import { getI18nInstance } from './lib/i18n/runtime';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import { ClientOnly } from 'remix-utils/client-only';

import 'virtual:uno.css';

import { AppErrorBoundary } from './components/ui/PanelBoundary';
import { GlobalTooltip } from './components/ui/GlobalTooltip';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

/** Fallback metadata for routes that do not publish a more specific title. */
export const meta: MetaFunction = () => [{ title: 'E-Code — AI application development platform' }];

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },
  { rel: 'manifest', href: '/manifest.webmanifest' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    /*
     * E-Code design system fonts for the whole app: IBM Plex Sans (interface)
     * + IBM Plex Mono (editor / terminal / code blocks). Replaces the legacy
     * Inter + JetBrains Mono load so the IDE mono matches the e-code theme
     * (see packages/ecode-theme + --vc-font-code in app/styles/index.scss).
     */
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
  },
];

const inlineThemeCode = stripIndents`
  window.addEventListener('ecode:hydrated', function () {
    setTutorialKitTheme();
    markDismissedAnnouncement();
    markSidebarCollapsed();
  }, { once: true });

  /*
   * User-area sidebar (dashboard AppShell): reflect the persisted
   * collapsed/expanded choice on <html> immediately after hydration. Mirrors the precedence in
   * useSidebarController (explicit choice, else auto-collapse on narrow
   * viewports). Kept in sync with app/components/dashboard/sidebar-collapse.ts.
   */
  function markSidebarCollapsed() {
    try {
      var stored = localStorage.getItem('${SIDEBAR_COLLAPSED_STORAGE_KEY}');

      if (stored !== 'true' && stored !== 'false') {
        stored = localStorage.getItem('${LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEY}');
      }

      var collapsed;

      if (stored === 'true' || stored === 'false') {
        collapsed = stored === 'true';
      } else {
        collapsed = !!(window.matchMedia && window.matchMedia('${SIDEBAR_AUTO_COLLAPSE_MEDIA_QUERY}').matches);
      }

      document.documentElement.setAttribute('${SIDEBAR_COLLAPSED_ATTRIBUTE}', String(collapsed));
    } catch (e) {
      // Storage blocked — the sidebar just renders with the default state.
    }
  }

  /*
   * Marketing announcement bar: if this campaign was already dismissed, flag
   * <html> before first paint so the CSS rule hides the bar with no flash.
   * Kept in sync with app/components/marketing/ecode-exact/announcement.ts.
   */
  function markDismissedAnnouncement() {
    try {
      if (localStorage.getItem('${ANNOUNCEMENT_DISMISSED_STORAGE_KEY}') === '1') {
        document.documentElement.setAttribute('${ANNOUNCEMENT_DISMISSED_ATTRIBUTE}', 'true');
      }
    } catch (e) {
      // Storage blocked — the bar just shows.
    }
  }

  function isEcodePublicMarketingPath(pathname) {
    const exactPaths = new Set([
      '/',
      '/about',
      '/acceptable-use',
      '/accessibility',
      '/ai',
      '/ai-agent',
      '/ai-agent/studio',
      '/ai-documentation',
      '/ai-docs',
      '/blog',
      '/bounties',
      '/careers',
      '/case-studies',
      '/changelog',
      '/collaboration',
      '/commercial-agreement',
      '/community',
      '/contact',
      '/contact-sales',
      '/customers',
      '/demo',
      '/deployments',
      '/desktop',
      '/docs',
      '/dpa',
      '/editor/new',
      '/enterprise',
      '/explore',
      '/features',
      '/forum',
      '/help',
      '/help-center',
      '/ide/new',
      '/languages',
      '/legal',
      '/marketing/bounties',
      '/marketing/deployments',
      '/marketing/teams',
      '/marketplace',
      '/marketplace/templates',
      '/mcp',
      '/mobile',
      '/newsletter',
      '/newsletter-confirmed',
      '/partners',
      '/polyglot',
      '/press',
      '/pricing',
      '/privacy',
      '/product',
      '/report-abuse',
      '/runtime-test',
      '/search',
      '/security',
      '/status',
      '/student-dpa',
      '/subprocessors',
      '/team',
      '/templates',
      '/terms',
      '/theme-validation',
      '/tutorials',
    ]);
    const prefixes = [
      '/advanced/',
      '/blog/',
      '/case-studies/',
      '/community/',
      '/compare/',
      '/editor/',
      '/ide/',
      '/marketplace/',
      '/mobile-workspace/',
      '/newsletter/',
      '/solutions/',
      '/templates/',
      '/u/',
    ];

    return exactPaths.has(pathname) || prefixes.some((prefix) => pathname.startsWith(prefix));
  }

  function readPersistedTheme() {
    /*
     * Safari Private Browsing / storage-partitioned / cookies-blocked contexts
     * throw a SecurityError synchronously on localStorage access. This runs in an
     * inline <head> script before hydration, so an uncaught throw would abort the
     * rest of setTutorialKitTheme() (theme reconciliation, public-marketing chrome,
     * theme-color meta). Swallow it and fall back to the default.
     */
    try {
      return localStorage.getItem('bolt_theme');
    } catch (e) {
      return null;
    }
  }

  /*
   * Read the cross-domain theme cookie (Domain=.e-code.ai). This is the shared
   * source of truth that lets a light/dark choice made on the marketing site
   * (e-code.ai) carry over to the app + IDE (app.e-code.ai) — localStorage is
   * partitioned per origin and cannot. Kept in sync with readThemeCookie() in
   * app/lib/stores/theme-cookie.ts.
   */
  function readThemeCookie() {
    try {
      var cookies = document.cookie ? document.cookie.split(';') : [];

      for (var i = 0; i < cookies.length; i++) {
        var pair = cookies[i];
        var eq = pair.indexOf('=');

        if (eq === -1) {
          continue;
        }

        if (pair.slice(0, eq).trim() === 'ecode_theme') {
          return decodeURIComponent(pair.slice(eq + 1).trim());
        }
      }
    } catch (e) {
      return null;
    }

    return null;
  }

  function prefersDarkScheme() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) {
      return false;
    }
  }

  function setTutorialKitTheme() {
    const publicMarketingRoute = isEcodePublicMarketingPath(window.location.pathname);

    /*
     * Unified precedence (must mirror resolveInitialTheme in
     * app/lib/stores/theme.ts): read the stored PREFERENCE (light|dark|system)
     * from the shared cookie, else per-origin localStorage; an explicit
     * light/dark applies as-is, system (or nothing stored) follows the OS
     * prefers-color-scheme. Marketing routes no longer force light — the shared
     * preference governs every surface so the theme stays the same across
     * e-code.ai, app.e-code.ai and the IDE.
     */
    function asPreference(value) {
      return value === 'light' || value === 'dark' || value === 'system' ? value : null;
    }

    const preference = asPreference(readThemeCookie()) || asPreference(readPersistedTheme());

    let theme;

    if (preference === 'light' || preference === 'dark') {
      theme = preference;
    } else {
      // system preference (or nothing stored) follows the OS.
      theme = prefersDarkScheme() ? 'dark' : 'light';
    }

    const root = document.querySelector('html');
    const firstApplication = !root?.hasAttribute('data-ecode-theme-ready');

    root?.setAttribute('data-theme', theme);
    root?.classList.toggle('dark', theme === 'dark');
    root?.classList.toggle('light', theme === 'light');
    root && (root.style.colorScheme = theme);
    if (publicMarketingRoute) {
      root?.setAttribute('data-ecode-public-chrome', 'homepage');
      root && (root.style.fontSize = '16px');
    }
    refreshChromeMeta('theme-color', theme === 'dark' ? '#0a0f1c' : '#f6f8fb');
    refreshChromeMeta('apple-mobile-web-app-status-bar-style', theme === 'dark' ? 'black-translucent' : 'default');

    if (firstApplication && root) {
      root.setAttribute('data-ecode-theme-ready', 'true');

      try {
        performance.mark('ecode-theme-applied');
      } catch (e) {
        // Performance marks are optional; the DOM marker remains authoritative.
      }
    }
  }

  /*
   * iOS Safari only tints the address bar / bottom toolbar when the theme-color
   * meta node is (re)parsed, so we remove + re-insert it instead of mutating
   * content in place. Keep this in sync with applyThemeToDocument in
   * app/lib/stores/theme.ts.
   */
  function refreshChromeMeta(name, content) {
    var head = document.head;

    if (!head) {
      return;
    }

    /*
     * Update the EXISTING server-rendered meta IN PLACE — do NOT remove +
     * re-append. The handler runs immediately after React hydrates; retaining
     * theme-color / status-bar metas and appending fresh ones moves them to the
     * end of <head>, so the pre-hydration meta order no longer matches the
     * server HTML and React aborts hydration with a mismatch (#418/#423) on every
     * page, re-rendering the whole document client-side. Mutating content in
     * place keeps the head order identical. (The RUNTIME theme toggle in
     * app/lib/stores/theme.ts still re-inserts the node for iOS chrome re-tint,
     * which is safe because it runs after hydration.)
     */
    var existing = head.querySelector('meta[name="' + name + '"]');

    if (existing) {
      existing.setAttribute('content', content);

      return;
    }

    var meta = document.createElement('meta');
    meta.setAttribute('name', name);
    meta.setAttribute('content', content);
    head.appendChild(meta);
  }

  // Resolve the persisted/system preference while the parser is still in
  // <head>, before the SSR splash can paint. The hydration event reapplies the
  // same value after React commits and handles the remaining document state.
  setTutorialKitTheme();
`;

/*
 * React Router 7 root Layout: renders the entire HTML document. This replaces
 * the former remix-island `createHead` + the hand-rolled <!DOCTYPE>/<head>/
 * <body> wrapper that entry.server.tsx streamed around <RemixServer />. RR7
 * renders <ServerRouter /> / <HydratedRouter /> *as* the children of this
 * Layout, so the document shell lives here in one place.
 *
 * data-theme is seeded to "dark" as a deterministic SSR fallback. The inline
 * script immediately reconciles the shared cookie/local preference/system
 * scheme before first paint; suppressHydrationWarning covers those intentional
 * root/meta attribute changes. App emits its event after React commits to
 * reapply the same theme and initialize the remaining persisted document state.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* content is intentionally adjusted client-side by the inline theme boot script
            (light vs dark), so suppress the benign hydration attribute warning. */}
        <meta name="theme-color" content="#0a0f1c" suppressHydrationWarning />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" suppressHydrationWarning />
        <meta name="apple-mobile-web-app-title" content="E-Code" />
        {/* Apply the persisted/system theme before the SSR splash can paint. */}
        <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
        <Meta />
        <Links />
      </head>
      <body className="h-full w-full">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/*
 * Body chrome shared by the app root and the root ErrorBoundary: i18n + DnD
 * providers, the global route loader, and the toast container. Was the old
 * remix-island body `Layout`; renamed to AppShell so the RR7 document `Layout`
 * export above can own the <html> shell.
 */
function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const showIdeBootFallback = /^\/projects\/[^/]+\/ide(?:\/|$)/.test(location.pathname);
  const editorServiceWorkerInstalled = useRef(false);

  /*
   * Manage the editor PWA service worker across SPA navigations. This must
   * re-evaluate on every route change (not just first mount): if the entry
   * path is a public marketing route the effect clears SW state and returns,
   * but the user can then client-side navigate into an authenticated app route
   * (e.g. /dashboard, /projects/:id/ide). With an empty dependency array the
   * editor SW would never be installed for the rest of that session. Depend on
   * location.pathname (like reconcileMarketingChrome) and (re)install whenever
   * we land on a non-marketing route, guarding against duplicate registration.
   */
  useEffect(() => {
    if (isPublicMarketingPath(location.pathname)) {
      clearMarketingPageServiceWorkerState();

      // Unregistered above; allow a fresh install when re-entering the app.
      editorServiceWorkerInstalled.current = false;

      return;
    }

    if (editorServiceWorkerInstalled.current) {
      return;
    }

    editorServiceWorkerInstalled.current = true;
    installEditorPwaServiceWorker();
  }, [location.pathname]);

  return (
    <>
      <ClientOnly fallback={<AppBootFallback ide={showIdeBootFallback} />}>
        {() => (
          <I18nextProvider i18n={getI18nInstance()}>
            <DndProvider backend={HTML5Backend}>{children}</DndProvider>
          </I18nextProvider>
        )}
      </ClientOnly>
      <ClientOnly>{() => <GlobalRouteLoader />}</ClientOnly>
      <ClientOnly>{() => <AppToastContainer />}</ClientOnly>
      <ClientOnly>{() => <GlobalTooltip />}</ClientOnly>
    </>
  );
}

function AppBootFallback({ ide }: { ide: boolean }) {
  if (!ide) {
    return (
      <main
        className="ecode-app-boot-splash"
        data-ecode-boot-splash=""
        aria-label="Loading E-Code"
        aria-live="polite"
        role="status"
      >
        <span className="ecode-app-boot-content">
          <span className="ecode-app-boot-logo" aria-hidden="true">
            <span className="ecode-app-boot-halo" />
            <EcodeBootMark theme="auto" width={56} height={56} />
          </span>
          <span className="ecode-app-boot-label">Loading E-Code</span>
        </span>
      </main>
    );
  }

  return (
    <main
      className="ecode-ide-boot-fallback"
      data-ecode-ide-boot-splash=""
      aria-label="Loading E-Code IDE"
      aria-live="polite"
      role="status"
    >
      <div className="ecode-ide-boot-topbar">
        <span />
        <span />
        <span />
      </div>
      <div className="ecode-ide-boot-body">
        <aside>
          <span />
          <span />
          <span />
        </aside>
        <section>
          <div />
          <div />
          <div />
        </section>
        <aside>
          <span />
          <span />
          <span />
        </aside>
      </div>
      <span className="ecode-ide-boot-brand">
        <EcodeBootMark theme="auto" width={32} height={32} />
        <span>Loading E-Code IDE</span>
      </span>
    </main>
  );
}

function AppToastContainer() {
  const theme = useStore(themeStore);

  return (
    <ToastContainer
      closeButton={({ closeToast }) => {
        return (
          <button
            type="button"
            className="Toastify__close-button"
            aria-label="Dismiss notification"
            onClick={closeToast}
          >
            <div className="i-ph:x text-lg" aria-hidden="true" />
          </button>
        );
      }}
      icon={({ type, isLoading }) => {
        if (isLoading) {
          return <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-textSecondary text-2xl" />;
        }

        switch (type) {
          case 'success': {
            return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
          }
          case 'error': {
            return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
          }
          case 'info': {
            return <div className="i-ph:info text-2xl" style={{ color: 'var(--status-info-text)' }} />;
          }
          case 'warning': {
            return <div className="i-ph:warning text-2xl" style={{ color: 'var(--status-warning-text)' }} />;
          }
        }

        return undefined;
      }}
      position="top-right"
      pauseOnFocusLoss
      transition={toastAnimation}
      autoClose={4000}
      limit={3}
      stacked
      newestOnTop={false}
      theme={theme}
    />
  );
}

function GlobalRouteLoader() {
  const navigation = useNavigation();
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  /*
   * Background fetchers and route revalidations must not blank an already
   * rendered page. User-area route transitions also own a local skeleton, so
   * only the slim progress bar remains visible for those navigations.
   */

  const loading = navigation.state !== 'idle';

  const localUserAreaSkeletonVisible = shouldShowUserAreaNavigationSkeleton({
    currentPathname: location.pathname,
    targetPathname: navigation.location?.pathname,
    navigationState: navigation.state,
  });

  const fullScreenVisible = visible && !localUserAreaSkeletonVisible;

  useEffect(() => {
    if (!loading) {
      setVisible(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setVisible(true), 120);

    return () => window.clearTimeout(timer);
  }, [loading]);

  return (
    <>
      {/* Slim top accent bar — instant feedback for fast navigations. */}
      <div
        className="bolt-route-loader"
        data-visible={visible}
        role="status"
        aria-live="polite"
        aria-label="Loading page"
      >
        <span className="bolt-route-loader-bar" />
      </div>

      {/*
       * Branded full-screen splash for slower loads — shows the E-Code logo on a
       * themed surface instead of a blank/stale page. Gated by the same 120ms
       * delay so quick client navigations never flash it.
       */}
      <div
        className={`pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-bolt-elements-background-depth-1 transition-opacity duration-200 ${
          fullScreenVisible ? 'opacity-100' : 'opacity-0'
        }`}
        data-testid="branded-route-loader"
        aria-hidden={!fullScreenVisible}
      >
        <div className="flex flex-col items-center gap-5">
          <span className="relative inline-flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#F26207]/20" />
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#F26207]" />
            <EcodeBootMark theme="auto" width={44} height={44} />
          </span>
          <span className="text-sm font-medium text-bolt-elements-textSecondary">Loading E-Code…</span>
        </div>
      </div>
    </>
  );
}

import { logStore } from './lib/stores/logs';
import { reconcileMarketingChrome } from './lib/stores/marketing-chrome';
import { applyThemeToDocument, initSystemThemeSync, isPublicMarketingPath, themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';

function clearMarketingPageServiceWorkerState() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => undefined);

  if ('caches' in window) {
    window.caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
      .catch(() => undefined);
  }
}

export default function App() {
  const theme = useStore(themeStore);
  const location = useLocation();

  useEffect(() => {
    window.dispatchEvent(new Event('ecode:hydrated'));
  }, []);

  /*
   * Keep the live <html data-theme> attribute in sync with the theme store.
   * (Was an effect on the old body Layout; the RR7 document Layout can't read
   * the store without forcing a hydration mismatch, so it lives here.)
   */
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  /*
   * While the preference is `system`, track the OS colour-scheme live so the app
   * flips the moment the user changes their OS theme (Replit-parity). No-op for
   * explicit light/dark. Mounted once for the whole app.
   */
  useEffect(() => initSystemThemeSync(), []);

  /*
   * Re-apply (or clear) the marketing-only document chrome on every SPA
   * navigation. The inline boot script in <Layout> sets data-ecode-public-chrome
   * + font-size:16px once at first paint when the entry path is a marketing
   * route, but never re-runs on client-side navigation. Without this, navigating
   * from a marketing page into an app route (e.g. /dashboard, /projects/:id/ide)
   * leaves the html element stuck at 16px with the homepage chrome attribute,
   * breaking the IDE's 13px root type scale. See app/lib/stores/marketing-chrome.ts.
   */
  useEffect(() => {
    reconcileMarketingChrome(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    logStore.logSystem('Application initialized', {
      theme,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });

    // Initialize debug logging with improved error handling
    import('./utils/debugLogger')
      .then(({ debugLogger }) => {
        /*
         * The debug logger initializes itself and starts disabled by default
         * It will only start capturing when enableDebugMode() is called
         */
        const status = debugLogger.getStatus();
        logStore.logSystem('Debug logging ready', {
          initialized: status.initialized,
          capturing: status.capturing,
          enabled: status.enabled,
        });
      })
      .catch((error) => {
        logStore.logError('Failed to initialize debug logging', error);
      });
  }, []);

  return (
    <AppShell>
      {/*
       * Mounted once at the app root so the impersonation indicator persists
       * across every authenticated route (IDE, chat, project, dashboard). It
       * self-checks via its own fetcher and renders nothing for normal
       * sessions, so it's safe to render unconditionally here.
       */}
      <ImpersonationBanner />
      <AppErrorBoundary title="E-Code" boundaryId="app-root">
        <Outlet />
      </AppErrorBoundary>
    </AppShell>
  );
}

/*
 * Root-level Remix ErrorBoundary. Without this, an error thrown in any route
 * loader/action that has no closer ErrorBoundary (151 of 153 routes) fell
 * through to Remix's built-in unstyled "Application Error" page. This renders a
 * branded fallback instead. Wrapped in <Layout> to match the default <App>
 * tree so it gets the same chrome (theme, scripts, toaster).
 */
function RootErrorView({ status }: { status: number }) {
  const isNotFound = status === 404;

  /*
   * This boundary catches errors (incl. 404 Responses) thrown by the 151 routes
   * without their own ErrorBoundary — e.g. a not-found project at
   * /@org/<missing-slug>. Remix v2 doesn't run route `meta` on a thrown Response
   * and React 18 won't hoist a <title>, so the document title would stay at the
   * remix-island shell default ("Loading..."). Set it client-side here so the
   * tab reads correctly instead of looking stuck-loading. Mirrors routes/$.tsx.
   */
  useEffect(() => {
    document.title = isNotFound ? 'Page not found · E-Code' : `Error ${status} · E-Code`;
  }, [isNotFound, status]);

  return (
    <PublicShell>
      <section
        className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center"
        role="main"
        aria-labelledby="root-error-heading"
      >
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-bolt-elements-textTertiary">
          {isNotFound ? '404' : `Error ${status}`}
        </span>
        <h1 id="root-error-heading" className="text-3xl font-semibold text-bolt-elements-textPrimary">
          {isNotFound ? 'This page could not be found' : 'Something went wrong'}
        </h1>
        <p className="max-w-md text-sm leading-6 text-bolt-elements-textSecondary">
          {isNotFound
            ? 'The page you are looking for may have been moved, renamed, or never existed.'
            : 'An unexpected error interrupted this page. Try again, or head back to a known place.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LinkButton to="/">Back to homepage</LinkButton>
          <LinkButton to="/dashboard" variant="outline">
            Go to dashboard
          </LinkButton>
        </div>
        <Link to="/help-center" className="text-xs text-bolt-elements-textTertiary underline-offset-4 hover:underline">
          Visit the help center
        </Link>
      </section>
    </PublicShell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;

  /*
   * RR7 renders this ErrorBoundary *inside* the exported document `Layout`,
   * so wrap only in the body chrome (AppShell), not the <html> shell, to avoid
   * a nested <html>.
   */
  return (
    <AppShell>
      <RootErrorView status={status} />
    </AppShell>
  );
}
