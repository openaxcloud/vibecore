import { atom } from 'nanostores';
import { logStore } from './logs';

export type Theme = 'dark' | 'light';

export const kTheme = 'bolt_theme';

const PUBLIC_MARKETING_PATHS = new Set([
  '/',
  '/about',
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
  '/demo',
  '/deployments',
  '/desktop',
  '/docs',
  '/dpa',
  '/features',
  '/forum',
  '/help-center',
  '/languages',
  '/legal',
  '/marketing/bounties',
  '/marketing/deployments',
  '/marketing/teams',
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
  '/blog/',
  '/case-studies/',
  '/compare/',
  '/newsletter/',
  '/solutions/',
  '/templates/',
];

export function isPublicMarketingPath(pathname: string) {
  return (
    PUBLIC_MARKETING_PATHS.has(pathname) || PUBLIC_MARKETING_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function themeIsDark() {
  return themeStore.get() === 'dark';
}

export const DEFAULT_THEME = 'dark';

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

export function applyThemeToDocument(theme: Theme) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  root.setAttribute('data-theme', theme);
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a0f1c' : '#f6f8fb');
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default');
}

export function toggleTheme() {
  const currentTheme = themeStore.get();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  // Update the theme store
  themeStore.set(newTheme);

  // Update localStorage
  localStorage.setItem(kTheme, newTheme);

  // Update the HTML theme hooks used by both CSS variables and Tailwind dark variants.
  applyThemeToDocument(newTheme);

  // Update user profile if it exists
  try {
    const userProfile = localStorage.getItem('bolt_user_profile');

    if (userProfile) {
      const profile = JSON.parse(userProfile);
      profile.theme = newTheme;
      localStorage.setItem('bolt_user_profile', JSON.stringify(profile));
    }
  } catch (error) {
    console.error('Error updating user profile theme:', error);
  }

  logStore.logSystem(`Theme changed to ${newTheme} mode`);
}
