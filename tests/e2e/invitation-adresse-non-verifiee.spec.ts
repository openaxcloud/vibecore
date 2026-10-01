import { expect, test } from '@playwright/test';

/*
 * BUG-QA0930-INVITATION-MESSAGE-TROMPEUR — mesuré le 2026-10-01 en local, vraie
 * API : le collègue invité qui vient de créer son compte clique « Accepter
 * l'invitation » et lit « Les invitations sont temporairement indisponibles.
 * Réessayez dans quelques instants. » La vraie réponse de l'API est HTTP 403
 * EMAIL_NOT_VERIFIED : son adresse n'est pas encore vérifiée. Il réessaie sans
 * fin et ne rejoint jamais l'équipe qui l'a invité.
 *
 * Parcours réel : comptes créés par l'API, invitation par l'API (le jeton est
 * rendu hors production), puis la page d'acceptation dans le navigateur.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

test('le collègue dont l’adresse n’est pas vérifiée apprend quoi faire — pas « réessayez »', async ({
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

  const { token: jetonProprio, organization } = (await proprio.json()) as {
    token: string;
    organization: { id: string };
  };

  const collegue = `collegue-${suffixe}@local.test`;

  const invitation = await request.post(`${apiBaseUrl}/orgs/${organization.id}/invitations`, {
    headers: { authorization: `Bearer ${jetonProprio}` },
    data: { email: collegue, roleKey: 'member' },
  });

  expect(invitation.ok(), await invitation.text()).toBe(true);

  const { token: jetonInvitation } = (await invitation.json()) as { token: string };

  // Témoin : sans ce jeton (rendu hors production seulement), le test ne mesurerait rien.
  expect(jetonInvitation, 'jeton d’invitation rendu par l’API de test').toBeTruthy();

  const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
    data: { email: collegue, password: 'Password123!', name: 'Collègue', organizationName: `Perso ${suffixe}` },
  });

  expect(inscription.ok(), await inscription.text()).toBe(true);

  const { token: jetonCollegue } = (await inscription.json()) as { token: string };

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: jetonCollegue, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

  await page.goto(`/invitations/accept?token=${encodeURIComponent(jetonInvitation)}&lang=fr`);
  await page.getByRole('button', { name: /Accepter l.invitation/i }).click();

  // Le message dit la vraie cause et ce qu'il faut faire…
  await expect(page.getByText(/vérifi\w*.{0,12}votre adresse e-mail/i).first()).toBeVisible({ timeout: 20_000 });

  // … et jamais « temporairement indisponibles, réessayez » : réessayer ne changera rien.
  await expect(page.getByText(/temporairement indisponibles/i)).toHaveCount(0);
});

test('accepter depuis un AUTRE compte que l’adresse invitée : le message le dit — pas « réessayez »', async ({
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

  const { token: jetonProprio, organization } = (await proprio.json()) as {
    token: string;
    organization: { id: string };
  };

  const invitation = await request.post(`${apiBaseUrl}/orgs/${organization.id}/invitations`, {
    headers: { authorization: `Bearer ${jetonProprio}` },
    data: { email: `invite-${suffixe}@local.test`, roleKey: 'member' },
  });

  const { token: jetonInvitation } = (await invitation.json()) as { token: string };

  expect(jetonInvitation, 'jeton d’invitation rendu par l’API de test').toBeTruthy();

  // Connecté avec une AUTRE adresse que celle invitée.
  const autre = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `autre-${suffixe}@local.test`,
      password: 'Password123!',
      name: 'Autre',
      organizationName: `X ${suffixe}`,
    },
  });

  const { token: jetonAutre } = (await autre.json()) as { token: string };

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: jetonAutre, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);

  await page.goto(`/invitations/accept?token=${encodeURIComponent(jetonInvitation)}&lang=fr`);
  await page.getByRole('button', { name: /Accepter l.invitation/i }).click();

  await expect(page.getByText(/envoyée à une autre adresse/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/temporairement indisponibles/i)).toHaveCount(0);
});
