/**
 * User-area sidebar collapsed-state persistence (SaaSLayout / AppShell).
 *
 * Persistence is SSR/private-mode safe (same pattern as announcement.ts). The
 * root inline boot script mirrors this read before first paint and sets
 * SIDEBAR_COLLAPSED_ATTRIBUTE on <html>, so a collapsed sidebar never flashes
 * expanded (and vice versa) while React hydrates — the attribute-keyed CSS in
 * app/styles/index.scss renders the shell in the persisted geometry until
 * useSidebarController seeds its state.
 */
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ecode:sidebar-collapsed';

/** Pre-rebrand key — still read as a fallback so existing users keep their choice. */
export const LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEY = 'vibecore:app-sidebar-collapsed';

export const SIDEBAR_COLLAPSED_ATTRIBUTE = 'data-ecode-sidebar-collapsed';

/**
 * Below this width the sidebar auto-collapses when the user has no explicit
 * stored choice. Shared by the boot script and useSidebarController so the
 * pre-hydration paint matches the hydrated state.
 */
export const SIDEBAR_AUTO_COLLAPSE_MEDIA_QUERY = '(max-width: 1279.98px)';

/** Explicit stored choice, or null when the user never toggled the sidebar. */
export function readStoredSidebarCollapsed(): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored =
      window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEY);

    if (stored === 'true' || stored === 'false') {
      return stored === 'true';
    }
  } catch {
    // Storage blocked (Safari private mode) — fall through to "no choice".
  }

  return null;
}

export function persistSidebarCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Storage blocked — the choice lives in React state for this page only.
  }
}

/**
 * Keep the boot-script attribute on <html> aligned with the live React state
 * so the attribute-keyed CSS never fights the component's own classes.
 */
export function reflectSidebarCollapsedOnRoot(collapsed: boolean) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute(SIDEBAR_COLLAPSED_ATTRIBUTE, String(collapsed));
}
