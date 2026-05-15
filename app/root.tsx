/* eslint-disable import/order */
import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useFetchers, useNavigation } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { installEditorPwaServiceWorker } from '@vibecore/editor';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';
import { useEffect, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { cssTransition, ToastContainer } from 'react-toastify';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import { createHead } from 'remix-island';
import { ClientOnly } from 'remix-utils/client-only';

import 'virtual:uno.css';

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

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('bolt_theme');

    if (!theme) {
      theme = 'dark';
    }

    const root = document.querySelector('html');

    root?.setAttribute('data-theme', theme);
    root?.classList.toggle('dark', theme === 'dark');
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0f172a" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="VibeCore" />
    <Meta />
    <Links />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    const root = document.querySelector('html');

    root?.setAttribute('data-theme', theme);
    root?.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    installEditorPwaServiceWorker();
  }, []);

  return (
    <>
      <ClientOnly>{() => <DndProvider backend={HTML5Backend}>{children}</DndProvider>}</ClientOnly>
      <ClientOnly>{() => <GlobalRouteLoader />}</ClientOnly>
      <ClientOnly>{() => <AppToastContainer />}</ClientOnly>
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

function AppToastContainer() {
  return (
    <ToastContainer
      closeButton={({ closeToast }) => {
        return (
          <button className="Toastify__close-button" onClick={closeToast}>
            <div className="i-ph:x text-lg" />
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
import { themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';

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
      <Outlet />
    </Layout>
  );
}
