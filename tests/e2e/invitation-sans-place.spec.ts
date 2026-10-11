import { expect, test } from '@playwright/test';
import { ouvrirDesPlaces } from './places-equipe';

/*
 * BUG-QA0930-INVITATION-SANS-PLACE — mesuré le 2026-10-01 en local, vraie API :
 * le propriétaire d'une équipe au forfait gratuit invite un collègue depuis la
 * page « Équipe » → « Invitation envoyée ». Le forfait n'a qu'une place, déjà la
 * sienne : le collègue s'inscrit, vérifie son adresse, accepte… et lit « Trop de
 * tentatives ont été effectuées. Patientez un instant, puis réessayez. » Il ne
 * rejoindra jamais l'équipe.
 *
 * Parcours réel : compte créé par l'API (forfait gratuit), puis la page Équipe
 * dans le navigateur, comme le propriétaire.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

test('équipe gratuite : le propriétaire apprend tout de suite que son forfait n’a plus de place — aucune invitation impossible n’est envoyée', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  const suffixe = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const proprio = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `proprio-${suffixe}@local.test`,
      password: 'Password123!',
      name: 'Proprio',
      organizationName: `Atelier ${suffixe}`,
    },
  });

  expect(proprio.ok(), await proprio.text()).toBe(true);

  const { token, organization } = (await proprio.json()) as { token: string; organization: { id: string } };

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

  await page.goto('/organization-members?lang=fr');
  await page.getByLabel(/Inviter par e-mail/i).fill(`collegue-${suffixe}@local.test`);
  await page.getByRole('button', { name: /Envoyer l.invitation/i }).click();

  await expect(page.getByText(/plus de place libre/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Invitation envoyée/i)).toHaveCount(0);

  // Rien n'est parti : aucune invitation en attente que personne ne pourrait accepter.
  const liste = await request.get(`${apiBaseUrl}/orgs/${organization.id}/invitations`, {
    headers: { authorization: `Bearer ${token}` },
  });

  expect(liste.ok(), await liste.text()).toBe(true);
  expect(((await liste.json()) as { invitations: unknown[] }).invitations).toHaveLength(0);
});

test('invitation partie quand il restait une place, place reprise depuis : le collègue lit que l’équipe n’a plus de place — pas « trop de tentatives »', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  const suffixe = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const proprio = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `proprio-${suffixe}@local.test`,
      password: 'Password123!',
      name: 'Proprio',
      organizationName: `Atelier ${suffixe}`,
    },
  });

  expect(proprio.ok(), await proprio.text()).toBe(true);

  const { token, organization } = (await proprio.json()) as { token: string; organization: { id: string } };

  await ouvrirDesPlaces(request, apiBaseUrl, organization.id, 2);

  const collegue = `collegue-${suffixe}@local.test`;

  const invitation = await request.post(`${apiBaseUrl}/orgs/${organization.id}/invitations`, {
    headers: { authorization: `Bearer ${token}` },
    data: { email: collegue, roleKey: 'member' },
  });

  expect(invitation.ok(), await invitation.text()).toBe(true);

  const { token: jetonInvitation } = (await invitation.json()) as { token: string };

  expect(jetonInvitation, 'jeton d’invitation rendu par l’API de test').toBeTruthy();

  // La place est reprise (changement de forfait, autre membre ajouté…) avant que le collègue n'accepte.
  await ouvrirDesPlaces(request, apiBaseUrl, organization.id, 1);

  const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
    data: { email: collegue, password: 'Password123!', name: 'Collègue', organizationName: `Perso ${suffixe}` },
  });

  expect(inscription.ok(), await inscription.text()).toBe(true);

  const { token: jetonCollegue, verificationToken } = (await inscription.json()) as {
    token: string;
    verificationToken?: string;
  };

  expect(verificationToken, 'jeton de vérification rendu par l’API de test').toBeTruthy();

  const verification = await request.post(`${apiBaseUrl}/auth/verify-email`, { data: { token: verificationToken } });

  expect(verification.ok(), await verification.text()).toBe(true);

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: jetonCollegue, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

  await page.goto(`/invitations/accept?token=${encodeURIComponent(jetonInvitation)}&lang=fr`);
  await page.getByRole('button', { name: /Accepter l.invitation/i }).click();

  /*
   * Mesuré AVANT correctif : « Trop de tentatives ont été effectuées. Patientez
   * un instant, puis réessayez. » — réessayer ne libère aucune place.
   */
  await expect(page.getByText(/n.a plus de place libre/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Trop de tentatives/i)).toHaveCount(0);
});
