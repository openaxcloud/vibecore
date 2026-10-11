import { expect, test, type APIRequestContext } from '@playwright/test';
import { PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS } from '~/lib/persistence/projectIdeMemory';

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

/*
 * Le MODE choisi pendant le chargement survit aussi (01/10). Mesuré à 390, mémoire
 * du projet retenue : « Assistant » choisi dans la coquille redevenait « Agent »
 * à la bascule, 3 fois sur 3 — et le message suivant partait en mode Agent, qui
 * modifie le projet. On vérifie l'affichage ET le `chatMode` réellement envoyé.
 */
test('le mode choisi pendant le chargement survit à la bascule — mobile 390', async ({ page, request }) => {
  test.setTimeout(120_000);

  const { token, projectId } = await createProjectSession(request);

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.setViewportSize({ width: 390, height: 844 });

  /*
   * La bascule n'a lieu qu'une fois le choix fait : la mémoire du projet est
   * retenue DANS la page jusque-là. Retenue au réseau, elle se levait toute seule :
   * le client abandonne `ide-state` au bout de PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS
   * et bascule (mesuré en CI le 05/10 sur le test voisin du clavier). Ici la
   * promesse ignore le signal d'abandon : seul `relacher` la libère.
   */
  await page.addInitScript(() => {
    const fenetre = window as unknown as { __vcRelacher: () => void };
    const vrai = window.fetch.bind(window);

    let liberer: () => void = () => undefined;

    const retenue = new Promise<void>((resolve) => {
      liberer = resolve;
    });

    fenetre.__vcRelacher = () => liberer();

    window.fetch = (entree: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
      const methode = (init?.method ?? (entree instanceof Request ? entree.method : 'GET')).toUpperCase();

      if (!url.includes('/ide-state') || methode !== 'GET') {
        return vrai(entree, init);
      }

      const sansSignal: RequestInit = { ...init };
      delete sansSignal.signal;

      return retenue.then(() => vrai(entree, sansSignal));
    };
  });

  const relacher = () => page.evaluate(() => (window as unknown as { __vcRelacher: () => void }).__vcRelacher());

  const envoyes: Array<{ chatMode?: string }> = [];

  await page.route('**/api/chat', async (route) => {
    envoyes.push((route.request().postDataJSON() ?? {}) as { chatMode?: string });
    await route.abort();
  });

  await page.goto(`/projects/${projectId}/ide?panel=agent`, { waitUntil: 'domcontentloaded' });

  const declencheur = page.locator('.bolt-chatbox-mode-trigger').first();
  await expect(declencheur).toBeVisible({ timeout: 60_000 });
  await expect(declencheur, 'mode par défaut').toContainText('Agent');

  /*
   * Au-delà du délai d'abandon du client : la retenue doit tenir, et la coquille de
   * la ROUTE (remplacée dès que le code de `Chat` est chargé, sans rapport avec
   * `ide-state`) est alors passée — le choix se fait dans la coquille de `Chat`.
   */
  await page.waitForTimeout(PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS + 1_000);

  await declencheur.click();
  await page.locator('.bolt-chatbox-mode-menu button').filter({ hasText: 'Assistant' }).first().click();
  await expect(declencheur, 'le choix est pris dans la coquille').toContainText('Assistant');

  // Témoin posé APRÈS le choix : ce nœud précis doit disparaître, sinon la bascule n'a pas eu lieu.
  await declencheur.evaluate((element) => element.setAttribute('data-temoin-coquille', 'oui'));

  await relacher();

  await expect(
    page.locator('[data-temoin-coquille="oui"]'),
    'la coquille est toujours en place : la bascule n’a pas eu lieu, le test ne prouve rien',
  ).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(1000);

  await expect(declencheur, 'mode perdu à la bascule : « Assistant » est redevenu « Agent »').toContainText(
    'Assistant',
  );

  const champ = page.locator('.bolt-project-agent-composer textarea').first();
  await champ.click();
  await champ.fill('Que fait ce projet ?');
  await page.keyboard.press('Enter');

  await expect
    .poll(() => envoyes.length, { message: 'aucune requête de chat envoyée', timeout: 15_000 })
    .toBeGreaterThan(0);
  expect(envoyes[0].chatMode, 'la requête part en mode Agent alors que l’écran affiche Assistant').toBe('discuss');
});
