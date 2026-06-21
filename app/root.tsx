/* eslint-disable import/order */
import { useStore } from '@nanostores/react';
import type { LinksFunction } from 'react-router';
import {
  isRouteErrorResponse,
  Links,
  Link,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useFetchers,
  useLocation,
  useNavigation,
  useRouteError,
} from 'react-router';
import { LinkButton, PublicShell } from './components/dashboard/SaaSLayout';
import { ImpersonationBanner } from './components/dashboard/ImpersonationBanner';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { installEditorPwaServiceWorker } from '@vibecore/editor';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';
import { useEffect, useState } from 'react';
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

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

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
  setTutorialKitTheme();

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

  function setTutorialKitTheme() {
    const publicMarketingRoute = isEcodePublicMarketingPath(window.location.pathname);
    let theme = publicMarketingRoute ? 'light' : localStorage.getItem('bolt_theme');

    if (theme !== 'dark' && theme !== 'light') {
      // Default to light (matches Replit); a persisted bolt_theme overrides this.
      theme = 'light';
    }

    const root = document.querySelector('html');

    root?.setAttribute('data-theme', theme);
    root?.classList.toggle('dark', theme === 'dark');
    root && (root.style.colorScheme = theme);
    if (publicMarketingRoute) {
      root?.setAttribute('data-ecode-public-chrome', 'homepage');
      root && (root.style.fontSize = '16px');
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a0f1c' : '#f6f8fb');
    document
      .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      ?.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default');
  }
`;

/*
 * React Router 7 root Layout: renders the entire HTML document. This replaces
 * the former remix-island `createHead` + the hand-rolled <!DOCTYPE>/<head>/
 * <body> wrapper that entry.server.tsx streamed around <RemixServer />. RR7
 * renders <ServerRouter /> / <HydratedRouter /> *as* the children of this
 * Layout, so the document shell lives here in one place.
 *
 * data-theme is seeded to "dark" (the app default) on the server; the inline
 * theme script below runs before hydration and reconciles it with
 * localStorage / the public-marketing override, exactly as before.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0a0f1c" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="E-Code" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
      </head>
      <body>
        <div id="root" className="w-full h-full">
          {children}
        </div>
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

  useEffect(() => {
    if (isPublicMarketingPath(window.location.pathname)) {
      clearMarketingPageServiceWorkerState();
      return;
    }

    installEditorPwaServiceWorker();
  }, []);

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
    </>
  );
}

function AppBootFallback({ ide }: { ide: boolean }) {
  if (!ide) {
    return (
      <main className="bolt-app-boot-fallback" aria-label="Loading E-Code" role="status">
        <div className="bolt-app-boot-mark" aria-hidden />
        <span>Loading E-Code</span>
      </main>
    );
  }

  return (
    <main className="bolt-ide-boot-fallback" aria-label="Loading project IDE" role="status">
      <div className="bolt-ide-boot-topbar">
        <span />
        <span />
        <span />
      </div>
      <div className="bolt-ide-boot-body">
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
      <span className="bolt-ide-boot-label">Loading project IDE</span>
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
      icon={({ type }) => {
        switch (type) {
          case 'success': {
            return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
          }
          case 'error': {
            return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
          }
        }

        return undefined;
      }}
      position="top-right"
      pauseOnFocusLoss
      transition={toastAnimation}
      autoClose={4000}
      limit={5}
      newestOnTop={false}
      theme={theme}
    />
  );
}

function GlobalRouteLoader() {
  const navigation = useNavigation();
  const fetchers = useFetchers();
  const [visible, setVisible] = useState(false);

  const loading =
    navigation.state !== 'idle' ||
    fetchers.some((fetcher) => fetcher.state === 'loading' || fetcher.state === 'submitting');

  useEffect(() => {
    if (!loading) {
      setVisible(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setVisible(true), 120);

    return () => window.clearTimeout(timer);
  }, [loading]);

  return (
    <div
      className="bolt-route-loader"
      data-visible={visible}
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <span className="bolt-route-loader-bar" />
      <span className="bolt-route-loader-pill">
        <span className="i-svg-spinners:90-ring-with-bg" aria-hidden />
        <span>Loading</span>
      </span>
    </div>
  );
}

import { logStore } from './lib/stores/logs';
import { applyThemeToDocument, isPublicMarketingPath, themeStore } from './lib/stores/theme';
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

  /*
   * Keep the live <html data-theme> attribute in sync with the theme store.
   * (Was an effect on the old body Layout; the RR7 document Layout can't read
   * the store without forcing a hydration mismatch, so it lives here.)
   */
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

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
