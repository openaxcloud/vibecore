/*
 * Pure navigation helpers for the dashboard route.
 *
 * Extracted so the SPA-vs-full-reload decision for the import-option cards is
 * unit-testable: internal targets must render through react-router <Link> (no
 * document reload), only genuinely external/protocol URLs may fall back to a
 * raw <a href>.
 */

import { userAreaEn, type UserAreaTranslationKey } from '~/lib/i18n/catalogs/user-area';

/**
 * A target is "external" — and therefore needs a real <a href> rather than a
 * client-side <Link> — when it points off-app: an absolute URL with a scheme
 * (http:, https:, mailto:, tel:, etc.) or a protocol-relative `//host` URL.
 *
 * Everything else (a path like `/import-github`, a relative path, or a bare
 * fragment) is an in-app route that must navigate via <Link>.
 */
export function isExternalDashboardLink(to: string): boolean {
  if (typeof to !== 'string') {
    return false;
  }

  const target = to.trim();

  if (target.startsWith('//')) {
    return true;
  }

  /* Scheme-prefixed URL, e.g. https://, mailto:, tel: — RFC 3986 scheme. */
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

/**
 * True when the target should navigate client-side via react-router <Link>.
 * The inverse of {@link isExternalDashboardLink}; expressed positively because
 * that is how the render path reads.
 */
export function shouldUseSpaNavigation(to: string): boolean {
  return !isExternalDashboardLink(to);
}

export type DashboardHeaderActions = {
  primary: { label: string; to: string };
  secondary?: { label: string; to: string };
};

/** Keep the most useful next action first, based on whether work already exists. */
export function resolveDashboardHeaderActions(
  projects: ReadonlyArray<unknown>,
  translate: (key: UserAreaTranslationKey) => string = (key) => userAreaEn[key],
): DashboardHeaderActions {
  if (projects.length > 0) {
    return {
      primary: { label: translate('dashboard.newProject'), to: '/projects/new' },
    };
  }

  return {
    primary: { label: translate('dashboard.startAgent'), to: '/projects/new' },
    secondary: { label: translate('dashboard.browseTemplates'), to: '/dashboard/templates' },
  };
}
