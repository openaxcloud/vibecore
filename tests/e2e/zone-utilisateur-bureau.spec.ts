import { expect, test, type Page } from '@playwright/test';

/**
 * Zone utilisateur sur BUREAU — deux défauts mesurés le 2026-09-30 sur la copie
 * locale (compte créé par l'interface, projet créé depuis un modèle), clair et
 * sombre, 1440×900.
 *
 * UIB-03 — la barre latérale affichait « Utilisateur connecté » au lieu du nom
 *          du client : elle lisait le profil LOCAL hérité de bolt.diy (vide pour
 *          un compte neuf), pas le compte authentifié.
 * UIB-04 — page Déploiements d'un projet : 12 onglets pour 922 px, 7 visibles ;
 *          l'onglet de la page courante (« Déploiements ») était caché, sans
 *          aucun signe qu'il en restait.
 *
 * Vraie API, vrai compte, vrai projet — aucun appel simulé. Bureau seulement :
 * sous 1024 px l'affichage est gelé sur la référence d'Avi.
 */

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

const VIEWPORTS = [
  { label: 'bureau 1440', width: 1440, height: 900 },
  { label: 'bureau 1280', width: 1280, height: 800 },
] as const;

const THEMES = ['light', 'dark'] as const;

const NOM_DU_CLIENT = 'Ada Revue Bureau';

async function waitForApiHealth(page: Page) {
  const deadline = Date.now() + 60_000;

  let lastError = "l'API n'a pas répondu à temps";

  while (Date.now() < deadline) {
    try {
      const response = await page.request.get(`${API_BASE_URL}/health`, { timeout: 2_000 });

      if (response.ok()) {
        return;
      }

      lastError = `API /health → ${response.status()}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await page.waitForTimeout(500);
  }

  throw new Error(lastError);
}

async function compteEtProjet(page: Page, theme: 'light' | 'dark') {
  await waitForApiHealth(page);

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${API_BASE_URL}/auth/register`, {
    data: {
      email: `zone-utilisateur-bureau-${suffix}@local.test`,
      password: 'Password123!',
      name: NOM_DU_CLIENT,
      organizationName: `Revue bureau ${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();

  const auth = (await registration.json()) as { token: string; organization: { id: string } };

  const creation = await page.request.post(`${API_BASE_URL}/orgs/${auth.organization.id}/projects`, {
    data: { name: 'Projet revue bureau' },
    headers: { authorization: `Bearer ${auth.token}` },
  });
  expect(creation.ok(), await creation.text()).toBeTruthy();

  const { project } = (await creation.json()) as { project: { id: string } };

  await page.context().addCookies([
    { name: 'vc_session', value: auth.token, url: APP_BASE_URL, httpOnly: true, sameSite: 'Lax' },
    { name: 'ecode_theme', value: theme, url: APP_BASE_URL, sameSite: 'Lax' },
  ]);

  return project.id;
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`${viewport.label} — ${theme} : nom du client et onglet courant visibles`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const projectId = await compteEtProjet(page, theme);
      await page.goto(`/projects/${projectId}/deployments`, { waitUntil: 'domcontentloaded' });

      /*
       * Ancré sur la navigation elle-même (son nom accessible), qui existe AVANT
       * et APRÈS le correctif — pas sur un repère que seul le correctif ajoute.
       * La bande visible est le parent qui la découpe.
       */
      const navigation = page.getByRole('navigation', { name: /Navigation du projet|Project navigation/ });
      await expect(navigation).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      // UIB-04 — chaque onglet est entièrement dans la bande visible, l'onglet courant compris.
      const onglets = await navigation.evaluate((nav) => {
        const strip = nav.parentElement ?? nav;
        const box = strip.getBoundingClientRect();

        return Array.from(nav.querySelectorAll('a')).map((link) => {
          const r = link.getBoundingClientRect();

          return {
            libelle: (link.textContent ?? '').trim(),
            courant: link.getAttribute('aria-current') === 'page',
            dedans: r.left >= box.left - 1 && r.right <= box.right + 1 && r.width > 0,
          };
        });
      });

      expect.soft(onglets.length, 'onglets du projet').toBeGreaterThanOrEqual(10);
      expect
        .soft(
          onglets.filter((o) => !o.dedans).map((o) => o.libelle),
          'onglets hors de la bande visible',
        )
        .toEqual([]);
      expect.soft(onglets.find((o) => o.courant)?.libelle, 'onglet courant').toBeTruthy();

      // UIB-03 — le pied de la barre latérale porte le nom du compte authentifié.
      const menuDuCompte = page.locator('aside').getByRole('button', { name: /Menu du compte|Account menu/ });
      await expect(menuDuCompte).toContainText(NOM_DU_CLIENT, { timeout: 30_000 });
    });
  }
}
