import { isPublicMarketingPath } from './theme';

/*
 * The inline boot script in app/root.tsx applies marketing-only document chrome
 * on first paint when the entry path is a public marketing route:
 *   - <html data-ecode-public-chrome="homepage">
 *   - <html style="font-size: 16px"> (marketing root type scale)
 *
 * That script runs ONCE at document load and is never re-evaluated on a
 * client-side (SPA) navigation. applyThemeToDocument() only touches
 * data-theme / colorScheme / theme meta, so when the user navigates from a
 * marketing page into an app route (e.g. /dashboard, /projects/:id/ide) without
 * a full reload, the html element keeps the 16px font-size and the homepage
 * chrome attribute — corrupting the IDE's intended 13px root type scale.
 *
 * reconcileMarketingChrome() re-applies (or clears) that chrome for the current
 * pathname so SPA navigations stay consistent with the boot-time behaviour.
 * Kept deliberately small and dependency-free so it can run from a route-change
 * effect on every navigation.
 */
export function reconcileMarketingChrome(pathname: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  if (!root) {
    return;
  }

  if (isPublicMarketingPath(pathname)) {
    root.setAttribute('data-ecode-public-chrome', 'homepage');
    root.style.fontSize = '16px';

    return;
  }

  // App route: undo the marketing-only chrome the boot script may have set.
  root.removeAttribute('data-ecode-public-chrome');
  root.style.fontSize = '';
}
