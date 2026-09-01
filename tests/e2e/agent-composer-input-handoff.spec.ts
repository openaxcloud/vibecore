import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * La frappe faite pendant le chargement de l'historique ne doit pas disparaître.
 *
 * `Chat` rend un `BaseChat` nu tant que `ready` est faux, puis `ChatImpl` — deux
 * types de composants à la MÊME position, donc React démonte tout et remonte.
 * Mesuré à 390 sur un serveur froid : le champ apparaît, la bascule survient
 * ~1 s plus tard, et une frappe au clavier envoyée dans cet intervalle est
 * perdue en silence (le nœud lui-même est remplacé).
 *
 * En mode projet, `ready` attend `GET /api/projects/:id/ide-state`. On retarde
 * donc cette réponse : la fenêtre de perte devient déterministe au lieu de
 * dépendre de la chaleur du serveur.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const FRAPPE = 'Ajoute une page de contact avec un formulaire validé';

async function createProjectSession(request: APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastBody = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const registration = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `composer-handoff-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Composer handoff',
        organizationName: `Composer handoff ${suffix}-${attempt}`,
      },
    });

    lastBody = await registration.text();

    if (registration.ok()) {
      const auth = JSON.parse(lastBody) as { token: string; organization: { id: string } };

      const project = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: { authorization: `Bearer ${auth.token}` },
        data: { name: 'Composer handoff' },
      });

      expect(project.ok(), await project.text()).toBeTruthy();

      return { token: auth.token, projectId: (await project.json()).project.id as string };
    }

    // /auth/register est limité par IP ; on patiente plutôt que de rougir la suite.
    if (registration.status() === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 11_000));
      continue;
    }

    break;
  }

  throw new Error(`Impossible d'ouvrir une session de test : ${lastBody}`);
}

for (const viewport of [
  { label: 'mobile 390', width: 390, height: 844 },
  { label: 'desktop 1440', width: 1440, height: 900 },
]) {
  test(`la frappe pendant le chargement survit — ${viewport.label}`, async ({ page, request }) => {
    /*
     * `/auth/register` est limité à ~10 par minute et par IP : la préparation du
     * fixture peut attendre plusieurs paliers de repli.
     */
    test.setTimeout(120_000);

    const { token, projectId } = await createProjectSession(request);

    await page
      .context()
      .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    // Fenêtre de bascule rendue déterministe : `ready` attend cette réponse.
    let ideStateServed = false;
    await page.route('**/api/projects/*/ide-state', async (route) => {
      if (route.request().method() === 'GET') {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        ideStateServed = true;
      }

      await route.continue();
    });

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    const field = page.locator('.bolt-project-chatbox textarea');
    await expect(field).toBeVisible({ timeout: 60_000 });

    /*
     * On MARQUE le champ dans lequel on tape. C'est le témoin : si ce nœud
     * précis est toujours là à la fin, la bascule n'a pas eu lieu et le test
     * n'aurait rien prouvé — il aurait été vert sur une fenêtre jamais ouverte,
     * exactement le défaut de méthode qu'on traque.
     */
    await field.evaluate((element) => element.setAttribute('data-temoin-coquille', 'oui'));

    await field.click();
    await field.pressSequentially(FRAPPE, { delay: 8 });

    // La bascule : la coquille est remplacée par le vrai composant.
    await expect.poll(() => ideStateServed, { message: 'la bascule n’a jamais eu lieu', timeout: 30_000 }).toBe(true);
    await page.waitForTimeout(1500);

    await expect(
      page.locator('[data-temoin-coquille="oui"]'),
      'le champ de la coquille est toujours en place : le remontage n’a pas eu lieu, le test ne prouve rien',
    ).toHaveCount(0);

    const conserve = await page.locator('.bolt-project-chatbox textarea').inputValue();

    expect(conserve, `frappe conservée en ${viewport.label}`).toBe(FRAPPE);
  });
}
