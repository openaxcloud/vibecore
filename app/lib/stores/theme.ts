import { atom } from 'nanostores';
import { logStore } from './logs';

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

function initStore() {
  if (!import.meta.env.SSR) {
    try {
      const persistedTheme = localStorage.getItem(kTheme);
      const root = document.querySelector('html');
      const themeAttribute = root?.getAttribute('data-theme');
      const publicChrome = root?.getAttribute('data-ecode-public-chrome') === 'homepage';
      const publicMarketingRoute = typeof window !== 'undefined' && isPublicMarketingPath(window.location.pathname);

      if (publicChrome || publicMarketingRoute) {
        return 'light';
      }

      return isTheme(persistedTheme) ? persistedTheme : isTheme(themeAttribute) ? themeAttribute : DEFAULT_THEME;
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
