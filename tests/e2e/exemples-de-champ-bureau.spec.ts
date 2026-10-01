import { expect, test, type Page } from '@playwright/test';

/**
 * UIB-07 — les exemples de champ (placeholder) de la zone utilisateur se
 * distinguent d'une vraie valeur, sur BUREAU, en clair et en sombre.
 *
 * Mesuré le 2026-09-30, page Déploiements d'un projet, 1440 : « app.example.com »
 * à 7,6:1 sur le fond clair, presque la force d'une vraie valeur — on croyait
 * le champ déjà rempli.
 *
 * Critère : l'exemple reste lisible (≥ 4,5:1, WCAG AA) ET nettement en retrait
 * (≤ 6:1 ; une vraie valeur est vers 17:1). Mesuré sur le rendu, pseudo-élément
 * `::placeholder` compris. Vraie API, vrai compte, vrai projet.
 */

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

async function compteEtProjet(page: Page, theme: 'light' | 'dark') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${API_BASE_URL}/auth/register`, {
    data: {
      email: `exemples-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Ada Exemples',
      organizationName: `Exemples ${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();

  const auth = (await registration.json()) as { token: string; organization: { id: string } };

  const creation = await page.request.post(`${API_BASE_URL}/orgs/${auth.organization.id}/projects`, {
    data: { name: 'Projet exemples' },
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
  test(`bureau 1440 — ${theme} : les exemples de champ sont en retrait d'une vraie valeur`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const projectId = await compteEtProjet(page, theme);
    await page.goto(`/projects/${projectId}/deployments`, { waitUntil: 'domcontentloaded' });

    const champs = page.locator('main input[name="customDomain"], main textarea[name="envVars"]');
    await expect(champs.first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const mesures = await champs.evaluateAll((elements) => {
      const rgb = (value: string) => {
        const parts = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];

        return [parts[0], parts[1], parts[2]];
      };
      const luminance = ([r, g, b]: number[]) => {
        const lin = (c: number) => {
          const v = c / 255;

          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };

        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const ratio = (a: number[], b: number[]) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);

        return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      };
      const fond = (element: Element) => {
        let node: Element | null = element;

        while (node) {
          const color = getComputedStyle(node).backgroundColor;
          const alpha = Number(color.match(/[\d.]+/g)?.[3] ?? 1);

          if (!/transparent/.test(color) && alpha > 0.9) {
            return rgb(color);
          }

          node = node.parentElement;
        }

        return [255, 255, 255];
      };

      return elements.map((element) => {
        const bg = fond(element);

        return {
          champ: element.getAttribute('name'),
          exemple: ratio(rgb(getComputedStyle(element, '::placeholder').color), bg),
          valeur: ratio(rgb(getComputedStyle(element).color), bg),
        };
      });
    });

    expect(mesures).toHaveLength(2);

    for (const mesure of mesures) {
      expect.soft(mesure.exemple, `${mesure.champ} : exemple lisible`).toBeGreaterThanOrEqual(4.5);
      expect.soft(mesure.exemple, `${mesure.champ} : exemple en retrait`).toBeLessThanOrEqual(6);
      expect.soft(mesure.valeur, `${mesure.champ} : vraie valeur bien plus forte`).toBeGreaterThan(mesure.exemple * 2);
    }
  });
}
