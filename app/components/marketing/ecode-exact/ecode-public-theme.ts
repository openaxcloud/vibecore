import type { Theme } from '~/lib/stores/theme';

/**
 * The marketing ("public chrome") pages default to the light theme, matching the
 * Replit-style landing design. However, a visitor who explicitly toggles to dark
 * on a marketing page persists that choice (localStorage[kTheme] === 'dark').
 *
 * Without this guard the public shell remounts on every SPA navigation and
 * unconditionally re-forces light, visibly reverting the visitor's dark choice
 * on each route change. This helper decides the theme the public chrome should
 * apply on mount: keep the visitor's persisted dark choice, otherwise default to
 * light.
 */
export function resolvePublicChromeTheme(persistedTheme: string | null | undefined): Theme {
  return persistedTheme === 'dark' ? 'dark' : 'light';
}

/**
 * Whether the visitor has explicitly opted into dark mode on a public marketing
 * page. Used so the shell mount does NOT reset the manual-change flag (which
 * would otherwise re-enable the light override on the next navigation).
 */
export function publicChromeUserChoseDark(persistedTheme: string | null | undefined): boolean {
  return persistedTheme === 'dark';
}
