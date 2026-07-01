import { atom } from 'nanostores';
import { logStore } from './logs';
import { readThemeCookie, writeThemeCookie } from './theme-cookie';

export type Theme = 'dark' | 'light';

/**
 * What the user actually *chooses* (Replit-parity Appearance control). `system`
 * follows the OS `prefers-color-scheme` live. The applied theme (`themeStore`,
 * always `light | dark`) is derived from this. The preference — not the resolved
 * value — is what we persist to the cookie + localStorage.
 */
export type ThemePreference = Theme | 'system';

export const THEME_PREFERENCES: ThemePreference[] = ['light', 'dark', 'system'];

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

/**
 * The user's chosen preference (`light | dark | system`). `themeStore` above is
 * the *resolved* value applied to the DOM; this is what the Appearance control
 * binds to and what we persist. Initialised from the same shared cookie /
 * localStorage so it round-trips across every E-Code surface.
 */
export const themePreferenceStore = atom<ThemePreference>(initPreference());

function initPreference(): ThemePreference {
  if (import.meta.env.SSR) {
    return 'system';
  }

  try {
    return resolveThemePreference({ cookie: readThemeCookie(), stored: localStorage.getItem(kTheme) });
  } catch {
    return 'system';
  }
}

function isTheme(value: string | null | undefined): value is Theme {
  return value === 'dark' || value === 'light';
}

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

/**
 * Resolve the stored *preference* (`light | dark | system`) from the shared
 * cookie / per-origin localStorage. Defaults to `system` when nothing is stored,
 * which matches the existing "follow the OS when there's no explicit choice"
 * behaviour — so it does not change what an unconfigured visitor already sees.
 */
export function resolveThemePreference(opts: { cookie?: string | null; stored?: string | null }): ThemePreference {
  if (isThemePreference(opts.cookie)) {
    return opts.cookie;
  }

  if (isThemePreference(opts.stored)) {
    return opts.stored;
  }

  return 'system';
}

/** Collapse a preference to the concrete theme that gets applied to the DOM. */
export function resolveAppliedTheme(preference: ThemePreference, prefersDarkScheme: boolean): Theme {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }

  return prefersDarkScheme ? 'dark' : 'light';
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
  const preference = isThemePreference(opts.cookie) ? opts.cookie : isThemePreference(opts.stored) ? opts.stored : null;

  // An explicit preference (including `system`) wins over the seeded attribute.
  if (preference) {
    return resolveAppliedTheme(preference, Boolean(opts.prefersDark));
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
       * Migrate an EXPLICIT preference (light/dark/system) from per-origin
       * localStorage into the shared cookie so it propagates to the other E-Code
       * subdomains without a re-toggle. Crucially we do NOT synthesise a cookie
       * from the OS for an unconfigured visitor — that would freeze a `system`
       * user to whatever their OS happened to be at first load. No stored
       * preference ⇒ leave the cookie unset so `system` keeps following the OS.
       */
      if (!isThemePreference(cookieTheme) && isThemePreference(persistedTheme)) {
        writeThemeCookie(persistedTheme);
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
export function persistTheme(theme: ThemePreference): boolean {
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

/**
 * Apply and persist an explicit user preference (`light | dark | system`). This
 * is the single entry point behind the Appearance control and the quick toggle.
 * When `system`, the applied theme tracks the OS; `initSystemThemeSync()` keeps
 * it live as the OS flips.
 */
export function setThemePreference(preference: ThemePreference) {
  const applied = resolveAppliedTheme(preference, prefersDark());

  themePreferenceStore.set(preference);
  themeStore.set(applied);

  /*
   * Update the DOM BEFORE persisting. localStorage writes can throw (Safari
   * Private Browsing / QuotaExceededError); doing the DOM update first guarantees
   * the UI actually changes even when persistence fails.
   */
  applyThemeToDocument(applied);

  // Persist the PREFERENCE (not the resolved value) so `system` round-trips.
  persistTheme(preference);

  logStore.logSystem(`Theme preference set to ${preference} (applied ${applied})`);
}

export function toggleTheme() {
  // The quick sun/moon toggle picks an explicit light/dark (leaving `system`).
  setThemePreference(themeStore.get() === 'dark' ? 'light' : 'dark');
}

/**
 * Keep the applied theme in sync with the OS while the preference is `system`.
 * Call once on the client (root App effect); returns a cleanup fn. No-op on the
 * server / where matchMedia is unavailable.
 */
export function initSystemThemeSync(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }

  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const handler = () => {
    if (themePreferenceStore.get() !== 'system') {
      return;
    }

    const applied: Theme = media.matches ? 'dark' : 'light';
    themeStore.set(applied);
    applyThemeToDocument(applied);
  };

  // Safari < 14 only supports the deprecated addListener signature.
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handler);

    return () => media.removeEventListener('change', handler);
  }

  media.addListener(handler);

  return () => media.removeListener(handler);
}
