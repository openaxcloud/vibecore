import { describe, expect, it } from 'vitest';
import { action as invitationAction } from './organization-invitations';
import { action as organizationRolesAction } from './organization-roles';
import { action as simpleRolesAction } from './roles-and-permissions';
import {
  formatOrganizationAccessCopy,
  formatOrganizationAccessDateTime,
  getOrganizationAccessCopy,
} from '~/lib/i18n/catalogs/organization-access';
import { getBuiltinRoleLabels, getPermissionCatalog, permissionLabel } from '~/lib/rbac-catalog';

function frenchRequest(path: string, entries: Record<string, string>) {
  const form = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    form.set(key, value);
  }

  return new Request(`https://app.test${path}`, {
    method: 'POST',
    headers: { 'Accept-Language': 'fr-FR,fr;q=0.9' },
    body: form,
  });
}

describe('organization access i18n', () => {
  it('localizes permission groups, descriptions, roles, interpolation, and dates', () => {
    const copy = getOrganizationAccessCopy('fr');
    const catalog = getPermissionCatalog('fr');

    expect(catalog[0].group).toBe('Organisation');
    expect(permissionLabel('billing:manage', 'fr')).toBe('Gérer la facturation');
    expect(getBuiltinRoleLabels('fr').owner).toBe('Propriétaire');
    expect(
      formatOrganizationAccessCopy(copy['organizationAccess.invitations.sent'], { email: 'avi@example.com' }),
    ).toBe('Invitation envoyée à avi@example.com.');
    expect(formatOrganizationAccessDateTime('2026-08-04T12:30:00Z', 'fr')).toMatch(/2026/);
  });

  it('falls back to English for unsupported locales and unknown permission identifiers', () => {
    expect(getOrganizationAccessCopy('de')['organizationAccess.roles.create']).toBe('Create role');
    expect(permissionLabel('custom:release', 'fr')).toBe('Autorisation inconnue');
    expect(permissionLabel('custom:release', 'en')).toBe('Unknown permission');
  });

  it('returns French validation errors from every organization-access action', async () => {
    const organizationRolesResponse = (await organizationRolesAction({
      request: frenchRequest('/organization-roles', { orgId: 'org-1' }),
      params: {},
      context: {},
    } as never)) as { data: { error?: string } };
    const simpleRolesResponse = (await simpleRolesAction({
      request: frenchRequest('/roles-and-permissions', {}),
      params: {},
      context: {},
    } as never)) as { data: { error?: string } };
    const invitationResponse = (await invitationAction({
      request: frenchRequest('/organization-invitations', { orgId: 'org-1' }),
      params: {},
      context: {},
    } as never)) as { data: { error?: string } };

    expect(organizationRolesResponse.data).toMatchObject({
      error: 'Saisissez un nom pour le rôle.',
    });
    expect(simpleRolesResponse.data).toMatchObject({
      error: 'Votre organisation est indisponible. Rechargez la page, puis réessayez.',
    });
    expect(invitationResponse.data).toMatchObject({
      error: 'Une adresse e-mail est requise.',
    });
  });
});
