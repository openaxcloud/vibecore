import { expect, test, type Page } from '@playwright/test';

/**
 * UIB-12 — dans l'IDE sur bureau, l'onglet ACTIF reste visible dans la bande.
 *
 * Mesuré le 2026-10-01 à 1440 : après l'ouverture de Rechercher, Git, Paquets
 * puis Variables secrètes depuis la barre d'outils, l'onglet actif sortait de
 * la bande (bord droit à 1205 puis 1375 px, bande finissant à 1076) ; la bande
 * restait défilée à 0. On ouvrait un panneau sans voir son onglet.
 *
 * Vraie API, vrai compte, vrai projet. Clair et sombre.
 */

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

test.use({ locale: 'fr-FR' });

async function compteEtProjet(page: Page, theme: 'light' | 'dark') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const data = {
    email: `onglet-actif-${suffix}@local.test`,
    password: 'Password123!',
    name: 'Ada Onglets',
    organizationName: `Onglets ${suffix}`,
  };

  let registration = await page.request.post(`${API_BASE_URL}/auth/register`, { data });

  if (registration.status() === 429) {
    await page.waitForTimeout(8_000);
    registration = await page.request.post(`${API_BASE_URL}/auth/register`, { data });
  }

  expect(registration.ok(), await registration.text()).toBeTruthy();

  const auth = (await registration.json()) as { token: string; organization: { id: string } };

  const creation = await page.request.post(`${API_BASE_URL}/orgs/${auth.organization.id}/projects`, {
    data: { name: 'Projet onglets' },
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

for (const theme of ['light', 'dark'] as const) {
  test(`bureau 1440 — ${theme} : l'onglet actif reste dans la bande`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const projectId = await compteEtProjet(page, theme);
    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    const rail = page.locator('.bolt-project-ide-rail');
    await expect(rail).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    for (const outil of ['Rechercher', 'Git', 'Paquets', 'Variables secrètes']) {
      await rail.locator(`[aria-label="${outil}"]`).first().click();

      // L'onglet actif est entièrement visible dans la bande (la bande défile en douceur : on attend).
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const strip = document.querySelector('.bolt-project-tabs');
              const actif = strip?.querySelector('[role="tab"][aria-selected="true"]');

              if (!strip || !actif) {
                return 'absent';
              }

              const s = strip.getBoundingClientRect();
              const a = actif.getBoundingClientRect();

              return a.left >= s.left - 1 && a.right <= s.right + 1
                ? 'visible'
                : `hors bande (${Math.round(a.right)} > ${Math.round(s.right)}, défilé ${strip.scrollLeft}/${strip.scrollWidth - strip.clientWidth})`;
            }),
          { timeout: 10_000, message: `onglet actif après « ${outil} »` },
        )
        .toBe('visible');
    }
  });
}
