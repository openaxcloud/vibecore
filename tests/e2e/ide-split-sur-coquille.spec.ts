import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * BUG-IDE-SPLIT-EFFACE-001 — un partage de panneau fait PENDANT le chargement
 * disparaissait ~2,5 s plus tard, sans un appel réseau.
 *
 * Mesuré le 16/09 sur build instrumenté (CPU ×20 + 4 boucles) : `BaseChat`
 * est monté TROIS fois au démarrage — coquille `ClientOnly`, coquille
 * `Suspense` pendant le chargement différé de `Chat.client`, puis le vrai
 * composant. Un geste fait sur une coquille est jeté avec elle : la remise à
 * « 1 feuille » est le REMONTAGE, pas une restauration.
 *
 * `Chat` garde aussi sa propre coquille tant que `ready` est faux, c'est-à-dire
 * tant que `GET …/ide-state` n'a pas répondu. On retarde cette réponse : la
 * fenêtre de perte devient déterministe au lieu de dépendre de la charge.
 */
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

async function ouvrirUneSession(request: APIRequestContext) {
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let dernierCorps = '';

  for (let essai = 0; essai < 4; essai += 1) {
    const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `split-coquille-${suffixe}-${essai}@local.test`,
        password: 'Password123!',
        name: 'Split coquille',
        organizationName: `Split coquille ${suffixe}-${essai}`,
      },
    });
    dernierCorps = await inscription.text();

    if (inscription.ok()) {
      const auth = JSON.parse(dernierCorps) as { token: string; organization: { id: string } };

      const projet = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: { authorization: `Bearer ${auth.token}` },
        data: { name: 'Split coquille' },
      });
      expect(projet.ok(), await projet.text()).toBeTruthy();

      return { token: auth.token, projectId: (await projet.json()).project.id as string };
    }

    if (inscription.status() === 429 && essai < 3) {
      await new Promise((resoudre) => setTimeout(resoudre, 11_000));
      continue;
    }

    break;
  }

  throw new Error(`Impossible d'ouvrir une session de test : ${dernierCorps}`);
}

test('un partage fait sur la coquille de chargement survit au montage du vrai composant — desktop 1440', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token, projectId } = await ouvrirUneSession(request);
  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.setViewportSize({ width: 1440, height: 900 });

  /* Fenêtre de bascule rendue déterministe : `ready` attend cette réponse. */
  let ideStateServi = false;
  await page.route('**/api/projects/*/ide-state', async (route) => {
    if (route.request().method() === 'GET') {
      await new Promise((resoudre) => setTimeout(resoudre, 6_000));
      ideStateServi = true;
    }

    await route.continue();
  });

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

  const feuille = page.locator('.bolt-project-pane-leaf').first();
  await expect(feuille).toBeVisible({ timeout: 60_000 });

  /*
   * On MARQUE la feuille de la coquille. Témoin : si ce nœud précis est encore là
   * à la fin, la bascule n'a pas eu lieu et le test n'aurait rien prouvé.
   */
  await feuille.evaluate((element) => element.setAttribute('data-temoin-coquille', 'oui'));

  await feuille.click({ position: { x: 30, y: 8 } }).catch(() => {});
  await feuille.locator('[data-testid="tab-options"]').first().click();
  await page
    .locator('.bolt-project-tab-actions-menu')
    .getByRole('menuitem', { name: 'Split active right', exact: true })
    .click();
  await expect.poll(() => page.locator('.bolt-project-pane-leaf').count()).toBeGreaterThanOrEqual(2);

  /* La bascule : la coquille est remplacée par le vrai composant. */
  await expect.poll(() => ideStateServi, { message: 'la bascule n’a jamais eu lieu', timeout: 30_000 }).toBe(true);
  await expect(
    page.locator('[data-temoin-coquille="oui"]'),
    'la feuille de la coquille est toujours en place : le remontage n’a pas eu lieu, le test ne prouve rien',
  ).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(2_000);

  expect(
    await page.locator('.bolt-project-pane-leaf').count(),
    'le partage survit au remontage',
  ).toBeGreaterThanOrEqual(2);
});
