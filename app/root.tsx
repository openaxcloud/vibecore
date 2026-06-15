/* eslint-disable import/order */
import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
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
} from '@remix-run/react';
import { LinkButton, PublicShell } from './components/dashboard/SaaSLayout';
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
import { createHead } from 'remix-island';
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
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..700&family=JetBrains+Mono:wght@400..700&display=swap',
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
      theme = 'dark';
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

export const Head = createHead(() => (
  <>
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
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);
  const location = useLocation();
  const showIdeBootFallback = /^\/projects\/[^/]+\/ide(?:\/|$)/.test(location.pathname);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

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
      <ScrollRestoration />
      <Scripts />
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
    <Layout>
      <AppErrorBoundary title="E-Code" boundaryId="app-root">
        <Outlet />
      </AppErrorBoundary>
    </Layout>
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

  return (
    <Layout>
      <RootErrorView status={status} />
    </Layout>
  );
}
