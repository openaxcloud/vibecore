/**
 * Canonical, first-party E-Code destinations for the account dropdown.
 *
 * These previously pointed at the upstream `stackblitz-labs/bolt.diy` project,
 * which both leaked the upstream codename on a public surface and routed real
 * users' bug reports / help requests to an unrelated project. They now resolve
 * to E-Code's own in-app pages.
 */
export const ACCOUNT_MENU_LINKS = {
  /** Where "Report Bug" sends the user. */
  reportBug: '/contact',

  /** Where "Help & Documentation" sends the user. */
  helpDocs: '/docs',
} as const;

export type AccountMenuLinkKey = keyof typeof ACCOUNT_MENU_LINKS;

/**
 * Resolve an account-menu link to an absolute URL for `window.open`.
 *
 * Relative ("/contact") links are resolved against the current origin so they
 * stay on E-Code; absolute links are returned unchanged. Falls back to the raw
 * link when there is no DOM origin available (e.g. server / tests).
 */
export function resolveAccountMenuLink(link: string, origin?: string): string {
  if (/^https?:\/\//i.test(link)) {
    return link;
  }

  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);

  if (!base) {
    return link;
  }

  try {
    return new URL(link, base).toString();
  } catch {
    return link;
  }
}
