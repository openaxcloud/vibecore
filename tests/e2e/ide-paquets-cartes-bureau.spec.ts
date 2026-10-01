import { expect, test, type Page } from '@playwright/test';

/**
 * UIB-14 — panneau Paquets de l'IDE sur bureau : les descriptions des cartes
 * ne sont pas coupées.
 *
 * Mesuré le 2026-10-01 à 1440 : « Stockage du projet et fichiers de paquet… »
 * coupé à 148 px sur 326, « Exécuteur de commandes de l'espace de tr… » à 148
 * sur 213, alors que la carte avait toute la hauteur nécessaire.
 *
 * Vraie API, vrai compte, vrai projet. Clair et sombre.
 */

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

/** Nom long (~33 caractères) et UNIQUE : deux organisations du même nom font échouer l'inscription (UIB-10). */
const nomEspace = () => `Organisation démo ${Math.random().toString(36).slice(2, 8)}`;

async function compteEtProjet(page: Page, theme: 'light' | 'dark', nom: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const data = {
    email: `fil-ariane-${suffix}@local.test`,
    password: 'Password123!',
    name: 'Ada Ariane',
    organizationName: nom,
  };

  let registration = await page.request.post(`${API_BASE_URL}/auth/register`, { data });

  // Limite de débit de l'inscription : on attend et on réessaie, une seule fois.
  if (registration.status() === 429) {
    await page.waitForTimeout(8_000);
    registration = await page.request.post(`${API_BASE_URL}/auth/register`, { data });
  }

  expect(registration.ok(), await registration.text()).toBeTruthy();

  const auth = (await registration.json()) as { token: string; organization: { id: string } };

  const creation = await page.request.post(`${API_BASE_URL}/orgs/${auth.organization.id}/projects`, {
    data: { name: 'Projet fil' },
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
  test(`bureau 1440 — ${theme} : les descriptions des cartes Paquets ne sont pas coupées`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const projectId = await compteEtProjet(page, theme, nomEspace());
    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    const rail = page.locator('.bolt-project-ide-rail');
    await expect(rail).toBeVisible({ timeout: 90_000 });
    await rail.locator('[aria-label="Paquets"], [aria-label="Packages"]').first().click();

    const descriptions = page.locator('.bolt-project-package-stat-grid small');
    await expect(descriptions.first()).toBeVisible({ timeout: 30_000 });

    const coupees = await descriptions.evaluateAll((elements) =>
      elements
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => `«${element.textContent?.trim()}» ${element.clientWidth}/${element.scrollWidth}`),
    );

    expect(coupees, 'descriptions coupées').toEqual([]);
  });
}
