import { expect, type APIRequestContext } from '@playwright/test';

/*
 * Une équipe créée par `/auth/register` est au forfait gratuit : UNE place, celle
 * du propriétaire. Depuis BUG-QA0930-INVITATION-SANS-PLACE, l'API refuse donc
 * d'y créer une invitation. Les tests qui portent sur l'ACCEPTATION ont besoin
 * d'une équipe qui a des places : on les ouvre comme le ferait le support, par
 * une dérogation de quota posée par un administrateur de la plateforme.
 *
 * Même administrateur de banc que gallery-remix-license.spec.ts : il doit figurer
 * dans PLATFORM_ADMIN_EMAILS de la pile testée (ADMIN_MFA_REQUIRED=false en CI).
 */
const ADMIN_EMAIL = 'e2e-platform-admin@local.test';
const ADMIN_PASSWORD = 'Password123!';

async function sessionAdministrateur(request: APIRequestContext, apiBaseUrl: string) {
  const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: 'E2E Platform Admin', organizationName: 'E2E Admin' },
  });

  let token: string;

  if (inscription.ok()) {
    const corps = (await inscription.json()) as { token: string; verificationToken?: string };

    // Le statut d'administrateur ne s'applique qu'une fois l'adresse prouvée.
    if (corps.verificationToken) {
      const verification = await request.post(`${apiBaseUrl}/auth/verify-email`, {
        data: { token: corps.verificationToken },
      });

      expect(verification.ok(), await verification.text()).toBe(true);
    }

    token = corps.token;
  } else {
    const connexion = await request.post(`${apiBaseUrl}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    expect(connexion.ok(), await connexion.text()).toBe(true);
    token = ((await connexion.json()) as { token: string }).token;
  }

  const reauth = await request.post(`${apiBaseUrl}/auth/reauth`, {
    headers: { authorization: `Bearer ${token}` },
    data: { password: ADMIN_PASSWORD },
  });

  expect(reauth.ok(), await reauth.text()).toBe(true);

  return token;
}

export async function ouvrirDesPlaces(
  request: APIRequestContext,
  apiBaseUrl: string,
  organizationId: string,
  places: number,
) {
  const token = await sessionAdministrateur(request, apiBaseUrl);

  const derogation = await request.post(`${apiBaseUrl}/admin/orgs/${organizationId}/quota-overrides`, {
    headers: { authorization: `Bearer ${token}` },
    data: { key: 'team.members', limit: places, reason: 'banc E2E : équipe avec des places libres' },
  });

  expect(derogation.ok(), await derogation.text()).toBe(true);
}
