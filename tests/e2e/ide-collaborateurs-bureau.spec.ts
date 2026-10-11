import { expect, test, type Page } from '@playwright/test';

/**
 * UIB-15 — panneau Collaborateurs de l'IDE sur bureau : aucun champ ne déborde
 * de sa carte.
 *
 * Mesuré le 2026-10-01 à 1440 : dans « Partage et programmation en binôme », le
 * sélecteur « Commentaires sur l'IA » et le bouton « Activer l'IA partagée »
 * finissaient à 1161 px pour une carte qui finit à 1133 (28 px de débord).
 *
 * Vraie API, vrai compte, vrai projet. Clair et sombre. En anglais, les libellés
 * plus courts ne débordaient pas : le test est en français.
 */

// Débord mesuré en français (libellés plus longs) : le test se met dans la langue du client.
test.use({ locale: 'fr-FR' });

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
  test(`bureau 1440 — ${theme} : aucun champ du panneau Collaborateurs ne déborde de sa carte`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const projectId = await compteEtProjet(page, theme, nomEspace());
    // Le chemin du client : l'IDE, puis « Inviter » dans la barre du haut.
    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-project-ide-rail')).toBeVisible({ timeout: 90_000 });
    await page.getByRole('link', { name: /Inviter des collaborateurs|Invite collaborators/ }).click();

    const cartes = page.locator('.bolt-project-collaboration-card');
    await expect(cartes.first()).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const debords = await cartes.evaluateAll((elements) =>
      elements.flatMap((carte) => {
        const c = carte.getBoundingClientRect();

        return Array.from(carte.querySelectorAll('select, input, textarea, button'))
          .filter((champ) => {
            const r = champ.getBoundingClientRect();

            return r.width > 0 && (r.right > c.right + 1 || r.left < c.left - 1);
          })
          .map(
            (champ) => `${champ.tagName} ${Math.round(champ.getBoundingClientRect().right)} > ${Math.round(c.right)}`,
          );
      }),
    );

    expect(debords, 'champs qui débordent de leur carte').toEqual([]);
  });
}
