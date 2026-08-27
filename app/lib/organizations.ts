import { getOrganizationAccessCopy } from '~/lib/i18n/catalogs/organization-access';

/**
 * Pure helpers for the Organizations dashboard page.
 *
 * The web tier has no active-org / org-switch mechanism: `apiRequest`
 * (enterprise-api.server) authenticates with the session bearer token only and
 * sends no `x-org-id` / active-org context, and there is no switch endpoint. So
 * this page lists the organizations the user belongs to; it does not (and must
 * not claim to) change which one is active. Keep the copy here honest so the UI
 * never promises a function the backend can't deliver.
 */
export type Organization = { id: string; name?: string; slug?: string };

export type OrganizationRow = { title: string; detail: string };

/** Display label for an organization, preferring name → slug → id. */
export function organizationLabel(organization: Organization): string {
  return organization.name ?? organization.slug ?? organization.id;
}

/**
 * Build the informational rows shown for a user's organizations. When the user
 * has none, returns a single empty-state row prompting them to create one.
 */
export function buildOrganizationRows(organizations: Organization[], language?: string | null): OrganizationRow[] {
  const copy = getOrganizationAccessCopy(language);

  if (organizations.length === 0) {
    return [
      {
        title: copy['organizationAccess.switcher.emptyTitle'],
        detail: copy['organizationAccess.switcher.emptyDetail'],
      },
    ];
  }

  return organizations.map((organization) => ({
    title: organizationLabel(organization),
    detail: copy['organizationAccess.switcher.loadedDetail'],
  }));
}
