import { expect, test, type Page } from '@playwright/test';

/**
 * UIB-09 — page Déploiements d'un projet JAMAIS publié : pas de « Republier ».
 *
 * Mesuré le 2026-09-30 sur la copie locale, 1440, clair et sombre : « Republier »
 * s'affichait en bouton principal (seulement grisé) au-dessus de « Pas encore
 * publié » — un client à son premier déploiement lit qu'il y a déjà quelque
 * chose à republier.
 *
 * Bureau seulement : sous 1024 px l'affichage est gelé, le bouton y reste.
 * Ancré sur le NOM du bouton, qui existe avant et après le correctif.
 */

test.use({ locale: 'fr-FR' });

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

async function compteEtProjet(page: Page, theme: 'light' | 'dark') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${API_BASE_URL}/auth/register`, {
    data: {
      email: `republier-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Ada Republier',
      organizationName: `Republier ${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();

  const auth = (await registration.json()) as { token: string; organization: { id: string } };

  const creation = await page.request.post(`${API_BASE_URL}/orgs/${auth.organization.id}/projects`, {
    data: { name: 'Projet jamais publié' },
    headers: { authorization: `Bearer ${auth.token}` },
  });
  expect(creation.ok(), await creation.text()).toBeTruthy();

  await page.context().addCookies([
    { name: 'vc_session', value: auth.token, url: APP_BASE_URL, httpOnly: true, sameSite: 'Lax' },
    { name: 'ecode_theme', value: theme, url: APP_BASE_URL, sameSite: 'Lax' },
  ]);

  return ((await creation.json()) as { project: { id: string } }).project.id;
}

for (const theme of ['light', 'dark'] as const) {
  test(`bureau 1440 — ${theme} : projet jamais publié, pas de « Republier »`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const projectId = await compteEtProjet(page, theme);
    await page.goto(`/projects/${projectId}/deployments`, { waitUntil: 'domcontentloaded' });

    // La page est chargée : l'état vide « Pas encore publié » est là.
    await expect(page.getByText('Pas encore publié')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    await expect(page.locator('main').getByRole('button', { name: 'Republier' })).toBeHidden();
  });
}

test('tablette 768 : inchangé, le bouton reste (affichage gelé sous 1024 px)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 768, height: 1024 });

  const projectId = await compteEtProjet(page, 'light');
  await page.goto(`/projects/${projectId}/deployments`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Pas encore publié')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('main').getByRole('button', { name: 'Republier' })).toBeVisible();
});
