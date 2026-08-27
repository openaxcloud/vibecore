/* eslint-disable import/order */
import { useStore } from '@nanostores/react';
import EcodeBootMark from './components/brand/EcodeBootMark';
import type { LinksFunction, MetaFunction } from 'react-router';
import {
  data,
  isRouteErrorResponse,
  Links,
  Link,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useMatches,
  useNavigation,
  useRouteError,
  UNSAFE_DataRouterStateContext,
  UNSAFE_FrameworkContext,
  type HeadersFunction,
  type LoaderFunctionArgs,
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

/*
 * Sous-chemin volontaire (module feuille SANS dependance) et non le barrel
 * `@vibecore/editor` : le barrel importe tout `@codemirror/*` en VALEUR, ce
 * qui faisait entrer les chunks editeur dans le graphe de la route racine —
 * donc de TOUTES les pages, marketing comprises. Voir BUG-PERF-LOAD.
 */
import { installEditorPwaServiceWorker } from '@vibecore/editor/install-pwa-sw';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { cssTransition, ToastContainer } from 'react-toastify';

import { shouldShowGlobalRouteSplash } from './lib/global-route-splash';
import { createI18nInstance } from './lib/i18n/runtime';
import { resolveLeafDocumentSeoOwnership, type RouteMetaModule } from './lib/i18n/document-seo';
import { AUTO_LANGUAGE_COOKIE } from './lib/i18n/language';
import { localeResponseHeaders, resolveRequestLocale } from './lib/i18n/request-locale';
import { translateServerMessage } from './lib/i18n/server';
import { DEFAULT_OG_IMAGE } from './utils/social-meta';

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

export function loader({ request }: LoaderFunctionArgs) {
  const locale = resolveRequestLocale(request);
  const canonical = new URL(request.url);

  /*
   * TLS termine sur l'ingress : le serveur d'application reçoit du HTTP en
   * clair, donc `request.url` porte le schéma `http:`. Sans cette correction,
   * chaque page émettait `<link rel="canonical" href="http://e-code.ai/">` et
   * un `og:url` en http — un canonical qui désigne une AUTRE origine que celle
   * réellement servie, ce que les moteurs traitent comme du contenu dupliqué.
   * On fait donc confiance à `X-Forwarded-Proto` (posé par l'ingress) et on ne
   * retient que le premier maillon de la chaîne.
   */
  const forwardedProto = (request.headers.get('x-forwarded-proto') ?? '').split(',')[0].trim().toLowerCase();

  if (forwardedProto === 'https' || forwardedProto === 'http') {
    canonical.protocol = `${forwardedProto}:`;
  }

  /*
   * The canonical URL is the stable English document, never a stateful query
   * variant. Besides avoiding duplicate crawl space, clearing the complete
   * query string prevents OAuth codes, invitation tokens and search input from
   * being reflected into canonical/hreflang/Open Graph markup.
   */
  canonical.search = '';

  const privateCapabilityRoute = /^\/(?:share|projects\/share)\/[^/]+\/?$/u.test(canonical.pathname);
  const sensitiveCallbackRoute = /^\/integrations\/oauth\/[^/]+\/callback\/?$/u.test(canonical.pathname);
  const suppressRootSeo = privateCapabilityRoute || sensitiveCallbackRoute;

  const frenchAlternate = new URL(canonical);
  frenchAlternate.searchParams.set('lang', 'fr');

  return data(
    {
      language: locale.language,
      localeSource: locale.source,
      privateCapabilityRoute,
      suppressRootSeo,
      seo: suppressRootSeo
        ? null
        : {
            canonical: canonical.toString(),
            english: canonical.toString(),
            french: frenchAlternate.toString(),
          },
    },
    { headers: localeResponseHeaders(request, locale) },
  );
}

export const headers: HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

/** Fallback metadata for routes that do not publish more specific metadata. */
export const meta: MetaFunction<typeof loader> = ({ data: loaderData, error }) => {
  if (loaderData?.suppressRootSeo) {
    return [];
  }

  const language = loaderData?.language ?? 'en';
  const french = language === 'fr';
  const errorStatus = error ? (isRouteErrorResponse(error) ? error.status : 500) : undefined;

  const title = errorStatus
    ? `${translateServerMessage(language, errorStatus === 404 ? 'root.notFoundTitle' : 'root.errorTitle')} · E-Code`
    : translateServerMessage(language, 'root.metaTitle');
  const description = errorStatus
    ? translateServerMessage(language, errorStatus === 404 ? 'root.notFoundBody' : 'root.errorBody')
    : translateServerMessage(language, 'root.metaDescription');

  return [
    { title },
    { name: 'description', content: description },
    ...(errorStatus ? [{ name: 'robots', content: 'noindex,follow' }] : []),
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    ...(loaderData?.seo?.canonical ? [{ property: 'og:url', content: loaderData.seo.canonical }] : []),
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { property: 'og:image', content: DEFAULT_OG_IMAGE },
    { property: 'og:image:alt', content: title },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: DEFAULT_OG_IMAGE },
    { name: 'twitter:image:alt', content: title },
  ];
};

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },
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
 * Accept-Language is normally the first-visit signal and produces an SSR-localized
 * document. Privacy relays and embedded browsers can strip that header, though.
 * Only for the root loader's `default` resolution, detect navigator.language in
 * <head>, persist the binary FR/EN automatic choice, and reload once for French
 * so React hydrates against a matching SSR tree. A readable cookie is required
 * before reloading, which prevents loops when cookies are blocked.
 */
const inlineNavigatorLocaleCode = stripIndents`
  (function () {
    try {
      var primary = String(window.navigator.language || '').trim().toLowerCase().split(/[-_]/)[0];
      var detected = primary === 'fr' ? 'fr' : 'en';
      var secure = window.location.protocol === 'https:' ? '; Secure' : '';
      var hostname = window.location.hostname.toLowerCase();
      var domain = hostname === 'e-code.ai' || hostname.endsWith('.e-code.ai') ? '; Domain=.e-code.ai' : '';

      document.cookie = '${AUTO_LANGUAGE_COOKIE}=' + detected + '; Path=/; Max-Age=31536000; SameSite=Lax' + domain + secure;

      if (detected !== 'fr') {
        return;
      }

      var persisted = document.cookie.split(';').some(function (segment) {
        return segment.trim() === '${AUTO_LANGUAGE_COOKIE}=fr';
      });

      if (persisted) {
        window.location.reload();
      }
    } catch (error) {
      // Browser detection is best-effort; the stable English fallback remains usable.
    }
  })();
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
  const matches = useMatches();
  const location = useLocation();
  const frameworkContext = useContext(UNSAFE_FrameworkContext);
  const dataRouterState = useContext(UNSAFE_DataRouterStateContext);
  const language = resolveDocumentLanguage(matches);

  const navigatorLocaleFallback = matches.some((match) => {
    const matchData = match.data;

    return Boolean(
      matchData &&
        typeof matchData === 'object' &&
        'localeSource' in matchData &&
        (matchData as { localeSource?: unknown }).localeSource === 'default',
    );
  });

  const seo = resolveDocumentSeo(matches);

  const seoOwnership = frameworkContext
    ? resolveLeafDocumentSeoOwnership({
        matches,
        routeModules: frameworkContext.routeModules as Readonly<Record<string, RouteMetaModule>>,
        location,
        errors: dataRouterState?.errors,
      })
    : { linkKeys: new Set(), metaKeys: new Set(), title: undefined, description: undefined };

  const leafSeoLinkKeys = seoOwnership.linkKeys;
  const leafSeoMetaKeys = seoOwnership.metaKeys;
  const fallbackSeoTitle = seoOwnership.title ?? translateServerMessage(language, 'root.metaTitle');
  const fallbackSeoDescription = seoOwnership.description ?? translateServerMessage(language, 'root.metaDescription');

  const openGraphLocale =
    language === 'fr' ? 'fr_FR' : language === 'es' ? 'es_ES' : language === 'ar' ? 'ar_SA' : 'en_US';

  const alternateOpenGraphLocale = language === 'en' ? 'fr_FR' : 'en_US';

  return (
    <html lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'} data-theme="dark" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {navigatorLocaleFallback ? <script dangerouslySetInnerHTML={{ __html: inlineNavigatorLocaleCode }} /> : null}
        {/* content is intentionally adjusted client-side by the inline theme boot script
            (light vs dark), so suppress the benign hydration attribute warning. */}
        <meta name="theme-color" content="#0a0f1c" suppressHydrationWarning />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" suppressHydrationWarning />
        <meta name="apple-mobile-web-app-title" content="E-Code" />
        <link rel="manifest" href={language === 'fr' ? '/manifest.fr.webmanifest' : '/manifest.webmanifest'} />
        {seo && !leafSeoLinkKeys.has('canonical') ? <link rel="canonical" href={seo.canonical} /> : null}
        {seo && !leafSeoLinkKeys.has('alternate:en') ? <link rel="alternate" hrefLang="en" href={seo.english} /> : null}
        {seo && !leafSeoLinkKeys.has('alternate:fr') ? <link rel="alternate" hrefLang="fr" href={seo.french} /> : null}
        {seo && !leafSeoLinkKeys.has('alternate:x-default') ? (
          <link rel="alternate" hrefLang="x-default" href={seo.english} />
        ) : null}
        {seo && !leafSeoMetaKeys.has('title') ? <title>{fallbackSeoTitle}</title> : null}
        {seo && !leafSeoMetaKeys.has('name:description') ? (
          <meta name="description" content={fallbackSeoDescription} />
        ) : null}
        {seo && !leafSeoMetaKeys.has('property:og:type') ? <meta property="og:type" content="website" /> : null}
        {seo && !leafSeoMetaKeys.has('property:og:site_name') ? (
          <meta property="og:site_name" content="E-Code" />
        ) : null}
        {seo && !leafSeoMetaKeys.has('property:og:url') ? <meta property="og:url" content={seo.canonical} /> : null}
        {seo && !leafSeoMetaKeys.has('property:og:title') ? (
          <meta property="og:title" content={fallbackSeoTitle} />
        ) : null}
        {seo && !leafSeoMetaKeys.has('property:og:description') ? (
          <meta property="og:description" content={fallbackSeoDescription} />
        ) : null}
        {seo && !leafSeoMetaKeys.has('property:og:locale') ? (
          <meta property="og:locale" content={openGraphLocale} />
        ) : null}
        {seo && !leafSeoMetaKeys.has(`property:og:locale:alternate:${alternateOpenGraphLocale.toLowerCase()}`) ? (
          <meta property="og:locale:alternate" content={alternateOpenGraphLocale} />
        ) : null}
        {seo && !leafSeoMetaKeys.has('property:og:image') ? (
          <meta property="og:image" content={DEFAULT_OG_IMAGE} />
        ) : null}
        {seo && !leafSeoMetaKeys.has('property:og:image:alt') ? (
          <meta property="og:image:alt" content={fallbackSeoTitle} />
        ) : null}
        {seo && !leafSeoMetaKeys.has('name:twitter:card') ? (
          <meta name="twitter:card" content="summary_large_image" />
        ) : null}
        {seo && !leafSeoMetaKeys.has('name:twitter:title') ? (
          <meta name="twitter:title" content={fallbackSeoTitle} />
        ) : null}
        {seo && !leafSeoMetaKeys.has('name:twitter:description') ? (
          <meta name="twitter:description" content={fallbackSeoDescription} />
        ) : null}
        {seo && !leafSeoMetaKeys.has('name:twitter:image') ? (
          <meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
        ) : null}
        {seo && !leafSeoMetaKeys.has('name:twitter:image:alt') ? (
          <meta name="twitter:image:alt" content={fallbackSeoTitle} />
        ) : null}
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
  const matches = useMatches();
  const language = resolveDocumentLanguage(matches);
  const i18n = useMemo(() => createI18nInstance(language), [language]);
  const showIdeBootFallback = /^\/projects\/[^/]+\/ide(?:\/|$)/.test(location.pathname);

  const serverRendersRoute = matches.some((match) => {
    const handle = match.handle;

    return Boolean(
      handle && typeof handle === 'object' && 'serverRenderedMarketing' in handle && handle.serverRenderedMarketing,
    );
  });

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
    <I18nextProvider i18n={i18n}>
      {serverRendersRoute ? (
        <>
          <ClientOnly fallback={<AppBootFallback ide={false} overlay />}>{() => null}</ClientOnly>
          {children}
        </>
      ) : (
        <ClientOnly fallback={<AppBootFallback ide={showIdeBootFallback} />}>
          {() => <DndProvider backend={HTML5Backend}>{children}</DndProvider>}
        </ClientOnly>
      )}
      <ClientOnly>{() => <GlobalRouteLoader />}</ClientOnly>
      <ClientOnly>{() => <AppToastContainer />}</ClientOnly>
      <ClientOnly>{() => <GlobalTooltip />}</ClientOnly>
    </I18nextProvider>
  );
}

function resolveDocumentLanguage(matches: ReturnType<typeof useMatches>): 'en' | 'fr' | 'es' | 'ar' {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const data = matches[index]?.data;

    if (!data || typeof data !== 'object' || !('language' in data)) {
      continue;
    }

    const language = (data as { language?: unknown }).language;

    if (language === 'en' || language === 'fr' || language === 'es' || language === 'ar') {
      return language;
    }
  }

  return 'en';
}

function resolveDocumentSeo(
  matches: ReturnType<typeof useMatches>,
): { canonical: string; english: string; french: string } | undefined {
  const suppressDocumentSeo = matches.some((match) => {
    const handle = match.handle;

    return Boolean(
      handle && typeof handle === 'object' && 'suppressDocumentSeo' in handle && handle.suppressDocumentSeo,
    );
  });

  if (suppressDocumentSeo) {
    return undefined;
  }

  for (const match of matches) {
    const data = match.data;

    if (!data || typeof data !== 'object' || !('seo' in data)) {
      continue;
    }

    const seo = (data as { seo?: unknown }).seo;

    if (
      seo &&
      typeof seo === 'object' &&
      'canonical' in seo &&
      'english' in seo &&
      'french' in seo &&
      typeof seo.canonical === 'string' &&
      typeof seo.english === 'string' &&
      typeof seo.french === 'string'
    ) {
      return { canonical: seo.canonical, english: seo.english, french: seo.french };
    }
  }

  return undefined;
}

function AppBootFallback({ ide, overlay = false }: { ide: boolean; overlay?: boolean }) {
  const { t } = useTranslation();

  if (!ide) {
    return (
      <main
        className={`ecode-app-boot-splash${overlay ? ' ecode-app-boot-splash--overlay' : ''}`}
        data-ecode-boot-splash=""
        aria-label={t('root.loadingEcode')}
        aria-live="polite"
        role="status"
      >
        <span className="ecode-app-boot-content">
          <span className="ecode-app-boot-logo" aria-hidden="true">
            <span className="ecode-app-boot-halo" />
            <EcodeBootMark theme="auto" width={56} height={56} />
          </span>
          <span className="ecode-app-boot-label">{t('root.loadingEcode')}</span>
        </span>
      </main>
    );
  }

  return (
    <main
      className="ecode-ide-boot-fallback"
      data-ecode-ide-boot-splash=""
      aria-label={t('root.loadingIde')}
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
        <span>{t('root.loadingIde')}</span>
      </span>
    </main>
  );
}

function AppToastContainer() {
  const theme = useStore(themeStore);
  const { t } = useTranslation();

  return (
    <ToastContainer
      closeButton={({ closeToast }) => {
        return (
          <button
            type="button"
            className="Toastify__close-button"
            aria-label={t('root.dismissNotification')}
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
  const { t } = useTranslation();

  /*
   * Background fetchers and route revalidations must not blank an already
   * rendered page. User-area route transitions also own a local skeleton, so
   * only the slim progress bar remains visible for those navigations.
   *
   * BUG-IDE-PANEL-SPLASH — idem pour les navigations « même pathname, seul le
   * search change » (bascule de panneau IDE via `?panel=`) : le splash plein
   * écran recouvrait l'IDE déjà rendu et donnait l'impression d'un reload.
   */

  const loading = navigation.state !== 'idle';

  const localUserAreaSkeletonVisible = shouldShowUserAreaNavigationSkeleton({
    currentPathname: location.pathname,
    targetPathname: navigation.location?.pathname,
    navigationState: navigation.state,
  });

  const splashAllowed = shouldShowGlobalRouteSplash({
    navigationState: navigation.state,
    currentPathname: location.pathname,
    targetPathname: navigation.location?.pathname,
    localSkeletonVisible: localUserAreaSkeletonVisible,
  });

  const fullScreenVisible = visible && splashAllowed;

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
        aria-label={t('root.loadingPage')}
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
          <span className="text-sm font-medium text-bolt-elements-textSecondary">{t('root.loadingEcode')}…</span>
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
  const language = resolveDocumentLanguage(useMatches());

  useEffect(() => {
    document.documentElement.setAttribute('data-ecode-hydrated', 'true');
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
      {isPublicMarketingPath(location.pathname) ? null : <ImpersonationBanner />}
      <AppErrorBoundary title={translateServerMessage(language, 'auth.shell.brandName')} boundaryId="app-root">
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
  const { t, i18n } = useTranslation();

  /*
   * This boundary catches errors (incl. 404 Responses) thrown by the 151 routes
   * without their own ErrorBoundary — e.g. a not-found project at
   * /@org/<missing-slug>. Remix v2 doesn't run route `meta` on a thrown Response
   * and React 18 won't hoist a <title>, so the document title would stay at the
   * remix-island shell default ("Loading..."). Set it client-side here so the
   * tab reads correctly instead of looking stuck-loading. Mirrors routes/$.tsx.
   */
  useEffect(() => {
    document.title = isNotFound
      ? `${t('root.notFoundTitle')} · E-Code`
      : `${t('root.errorLabel', { status })} · E-Code`;
  }, [i18n.resolvedLanguage, isNotFound, status, t]);

  return (
    <PublicShell>
      <section
        className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-24 text-center"
        role="main"
        aria-labelledby="root-error-heading"
      >
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-bolt-elements-textTertiary">
          {isNotFound ? '404' : t('root.errorLabel', { status })}
        </span>
        <h1 id="root-error-heading" className="text-3xl font-semibold text-bolt-elements-textPrimary">
          {isNotFound ? t('root.notFoundTitle') : t('root.errorTitle')}
        </h1>
        <p className="max-w-md text-sm leading-6 text-bolt-elements-textSecondary">
          {isNotFound ? t('root.notFoundBody') : t('root.errorBody')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LinkButton to="/">{t('root.backHome')}</LinkButton>
          <LinkButton to="/dashboard" variant="outline">
            {t('root.goDashboard')}
          </LinkButton>
        </div>
        <Link to="/help-center" className="text-xs text-bolt-elements-textTertiary underline-offset-4 hover:underline">
          {t('root.visitHelp')}
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
