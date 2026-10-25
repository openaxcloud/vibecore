import { expect, test, type Page } from '@playwright/test';

/**
 * UIB-09 — page Déploiements d'un projet JAMAIS publié : pas de « Republier ».
 *
 * Mesuré le 2026-09-30 sur la copie locale, 1440, clair et sombre : « Republier »
 * s'affichait en bouton principal (seulement grisé) au-dessus de « Pas encore
 * publié » — un client à son premier déploiement lit qu'il y a déjà quelque
 * chose à republier.
 *
 * Le parcours canonique doit proposer « Publier », sans « Republier »,
 * sur bureau, tablette et mobile avant la première publication.
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
    { name: 'vibecore-lang', value: 'fr', url: APP_BASE_URL, sameSite: 'Lax' },
  ]);

  return ((await creation.json()) as { project: { id: string } }).project.id;
}

async function verifierPremierePublication(page: Page, projectId: string, theme: 'light' | 'dark') {
  await page.goto(`/projects/${projectId}/deployments`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=deployments$`));

  const host = page.locator('.bolt-project-deploy-tool');
  await expect(host).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(host.getByText('Rien n’a encore été publié.', { exact: true }).first()).toBeVisible();
  await expect(host.getByRole('button', { name: 'Publier', exact: true })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Publier', exact: true })).toBeEnabled();
  await expect(host.getByRole('button', { name: 'Republier', exact: true })).toHaveCount(0);
}

for (const theme of ['light', 'dark'] as const) {
  test(`bureau 1440 — ${theme} : projet jamais publié, pas de « Republier »`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const projectId = await compteEtProjet(page, theme);
    await verifierPremierePublication(page, projectId, theme);
  });
}

for (const width of [768, 390]) {
  test(`écran ${width} : première publication, « Publier » sans « Republier »`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 1024 });

    const projectId = await compteEtProjet(page, 'light');
    await verifierPremierePublication(page, projectId, 'light');
  });
}
