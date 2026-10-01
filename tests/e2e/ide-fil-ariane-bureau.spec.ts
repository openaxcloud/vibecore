import { expect, test, type Page } from '@playwright/test';

/**
 * UIB-08 — dans l'IDE sur grand bureau, le nom de l'espace de travail du fil
 * d'Ariane n'est pas coupé quand la barre a la place.
 *
 * Mesuré le 2026-09-30 à 1440 : « Parcours UI bureau's Organization » coupé à
 * 53 px sur 194 (« Parcou… »), plusieurs centaines de pixels libres à côté.
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

for (const viewport of [
  { label: 'bureau 1440', width: 1440, height: 900 },
  { label: 'bureau 1600', width: 1600, height: 900 },
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${viewport.label} — ${theme} : le nom de l'espace n'est pas coupé dans le fil d'Ariane`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const nom = nomEspace();
      const projectId = await compteEtProjet(page, theme, nom);
      await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

      const valeur = page.locator('.bolt-project-breadcrumb-workspace .bolt-project-breadcrumb-value');
      await expect(valeur).toHaveText(nom, { timeout: 90_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const mesure = await valeur.evaluate((element) => ({
        visible: element.clientWidth,
        necessaire: element.scrollWidth,
      }));

      expect(mesure.necessaire, `nom coupé à ${mesure.visible} px sur ${mesure.necessaire}`).toBeLessThanOrEqual(
        mesure.visible + 1,
      );
    });
  }
}
