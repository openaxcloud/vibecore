import { atom } from 'nanostores';
import { logStore } from './logs';
import { readThemeCookie, writeThemeCookie } from './theme-cookie';

export type Theme = 'dark' | 'light';

export const kTheme = 'bolt_theme';

const PUBLIC_MARKETING_PATHS = new Set([
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

const PUBLIC_MARKETING_PREFIXES = [
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

export function isPublicMarketingPath(pathname: string) {
  return (
    PUBLIC_MARKETING_PATHS.has(pathname) || PUBLIC_MARKETING_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function themeIsDark() {
  return themeStore.get() === 'dark';
}

/*
 * Default to light (matches Replit's IDE). Users who toggle persist their choice
 * in localStorage, which takes precedence over this default.
 */
export const DEFAULT_THEME: Theme = 'light';

export const themeStore = atom<Theme>(initStore());

function isTheme(value: string | null | undefined): value is Theme {
  return value === 'dark' || value === 'light';
}

/**
 * Resolve the active theme from the available signals, in priority order. This
 * is the SINGLE SOURCE OF TRUTH shared by every E-Code surface — keep it in sync
 * with the pre-hydration boot script in app/root.tsx (which inlines the same
 * precedence as a plain string because it cannot import this module).
 *
 *   1. Shared cross-domain cookie (`ecode_theme`, Domain=.e-code.ai) — set on
 *      the marketing site AND the app/IDE so a choice on one carries to the other.
 *   2. Per-origin localStorage (`bolt_theme`) — backward-compatible fallback for
 *      visitors who toggled before the cookie existed.
 *   3. The server-seeded `data-theme` attribute already on <html>.
 *   4. The OS-level `prefers-color-scheme` media query.
 *   5. DEFAULT_THEME (light).
 *
 * Marketing routes no longer force light: the shared preference governs every
 * surface, so picking dark on e-code.ai keeps the app + IDE dark too.
 */
export function resolveInitialTheme(opts: {
  cookie?: string | null;
  stored?: string | null;
  attribute?: string | null;
  prefersDark?: boolean;
}): Theme {
  if (isTheme(opts.cookie)) {
    return opts.cookie;
  }

  if (isTheme(opts.stored)) {
    return opts.stored;
  }

  if (isTheme(opts.attribute)) {
    return opts.attribute;
  }

  if (opts.prefersDark) {
    return 'dark';
  }

  return DEFAULT_THEME;
}

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function initStore(): Theme {
  if (!import.meta.env.SSR) {
    try {
      const cookieTheme = readThemeCookie();
      const persistedTheme = localStorage.getItem(kTheme);
      const root = document.querySelector('html');
      const themeAttribute = root?.getAttribute('data-theme');

      const resolved = resolveInitialTheme({
        cookie: cookieTheme,
        stored: persistedTheme,
        attribute: themeAttribute,
        prefersDark: prefersDark(),
      });

      /*
       * Migrate forward: if the choice came from per-origin localStorage (or the
       * OS preference) but the shared cookie was absent, write it now so the
       * preference propagates to the other E-Code subdomains without requiring
       * the visitor to re-toggle.
       */
      if (!isTheme(cookieTheme)) {
        writeThemeCookie(resolved);
      }

      return resolved;
    } catch {
      return DEFAULT_THEME;
    }
  }

  return DEFAULT_THEME;
}

/*
 * Re-point a <meta> tag to a fresh value. We REMOVE and RE-INSERT the element
 * rather than calling setAttribute('content', …) because iOS Safari only tints
 * the address bar / bottom toolbar from <meta name="theme-color"> when the node
 * is (re)parsed — a plain content mutation is silently ignored, so toggling the
 * theme at runtime (e.g. the Settings → Theme dropdown, which never reloads the
 * document) left the browser chrome stuck on the value present at first paint.
 * Replacing the node forces Safari to re-read it and repaint the chrome.
 */
function refreshChromeMeta(name: string, content: string) {
  const head = document.head;

  if (!head) {
    return;
  }

  head.querySelectorAll(`meta[name="${name}"]`).forEach((node) => node.remove());

  const meta = document.createElement('meta');
  meta.setAttribute('name', name);
  meta.setAttribute('content', content);
  head.appendChild(meta);
}

export function applyThemeToDocument(theme: Theme) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  root.setAttribute('data-theme', theme);
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;

  refreshChromeMeta('theme-color', theme === 'dark' ? '#0a0f1c' : '#f6f8fb');
  refreshChromeMeta('apple-mobile-web-app-status-bar-style', theme === 'dark' ? 'black-translucent' : 'default');
}

/**
 * Persist the chosen theme to localStorage (both the standalone key and the
 * user-profile blob). Returns true on success, false if persistence failed.
 *
 * Persistence is best-effort: localStorage can throw (Safari Private Browsing
 * blocks writes, or a QuotaExceededError). We must never let that abort the
 * caller before the DOM has been updated, otherwise the store/DOM desync and
 * the UI stays on the old theme. See toggleTheme().
 */
export function persistTheme(theme: Theme): boolean {
  let ok = true;

  try {
    localStorage.setItem(kTheme, theme);
  } catch (error) {
    ok = false;
    console.error('Error persisting theme to localStorage:', error);
  }

  /*
   * Mirror the choice into the cross-domain cookie (Domain=.e-code.ai) so it
   * follows the user from the marketing site to the app/IDE and back. Best-effort
   * and self-guarding — never throws (see theme-cookie.ts).
   */
  writeThemeCookie(theme);

  // Update user profile if it exists
  try {
    const userProfile = localStorage.getItem('bolt_user_profile');

    if (userProfile) {
      const profile = JSON.parse(userProfile);
      profile.theme = theme;
      localStorage.setItem('bolt_user_profile', JSON.stringify(profile));
    }
  } catch (error) {
    ok = false;
    console.error('Error updating user profile theme:', error);
  }

  return ok;
}

export function toggleTheme() {
  const currentTheme = themeStore.get();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  // Update the theme store
  themeStore.set(newTheme);

  /*
   * Update the HTML theme hooks used by both CSS variables and Tailwind dark
   * variants BEFORE persisting. localStorage writes can throw (Safari Private
   * Browsing / QuotaExceededError); doing the DOM update first guarantees the
   * UI actually changes even when persistence fails.
   */
  applyThemeToDocument(newTheme);

  // Persist (best-effort — never throws past here).
  persistTheme(newTheme);

  logStore.logSystem(`Theme changed to ${newTheme} mode`);
}
