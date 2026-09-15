import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * BUG-IDE-PANEL-RESOLUTION-001 — preuve LIVE du contrat de résolution.
 *
 * Constaté en prod avant correctif : `?panel=agent` affichait le panneau
 * Extensions, l'en-tête « Agent » coiffait le contenu « Déploiements », et à
 * froid `?panel=studio` tombait sur Vue d'ensemble, `?panel=debugger` sur Git.
 *
 * Ce test parcourt une clé canonique, deux alias et une clé inconnue, et exige
 * pour chacune que l'URL affichée ET la surface rendue désignent le même
 * panneau. Chaque cas laisse une capture dans `test-results/ide-panel-routing/`.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

type AuthPayload = { token: string; organization: { id: string } };

type RoutingCase = {
  requested: string;
  canonical: string | null;
  surface: 'agent' | 'service' | 'preview';
  why: string;
};

const ROUTING_CASES: RoutingCase[] = [
  { requested: 'agent', canonical: 'agent', surface: 'agent', why: 'clé canonique jadis absente de la liste blanche' },
  { requested: 'chat', canonical: 'agent', surface: 'agent', why: 'alias historique du panneau Agent' },
  { requested: 'studio', canonical: 'studio', surface: 'service', why: 'tombait sur Vue d’ensemble à froid' },
  { requested: 'debugger', canonical: 'debugger', surface: 'service', why: 'tombait sur Git à froid' },
  { requested: 'web', canonical: 'preview', surface: 'preview', why: 'clé déclarée mais jamais dispatchée' },
];

const UNKNOWN_CASE = 'definitely-not-a-panel';

async function waitForRateLimitReset(responseText: string, fallbackMs = 10_000) {
  const seconds = Number(responseText.match(/retry in (\d+) seconds/i)?.[1]);
  const waitMs = Number.isFinite(seconds) ? (seconds + 1) * 1000 : fallbackMs;

  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function authenticate(request: APIRequestContext): Promise<AuthPayload> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let responseText = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `ide-panel-routing-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'IDE Panel Routing E2E',
        organizationName: `IDE Panel Routing E2E ${suffix}-${attempt}`,
      },
    });

    responseText = await response.text();

    if (response.ok()) {
      return JSON.parse(responseText) as AuthPayload;
    }

    if (response.status() === 429 && attempt < 3) {
      await waitForRateLimitReset(responseText);
      continue;
    }

    expect(response.ok(), responseText).toBeTruthy();
  }

  throw new Error(responseText || 'Unable to authenticate IDE panel routing user');
}

async function createProject(request: APIRequestContext, auth: AuthPayload) {
  const response = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE panel routing project' },
  });

  expect(response.ok(), await response.text()).toBeTruthy();

  return (await response.json()).project.id as string;
}

function panelSearchParam(page: Page) {
  return new URL(page.url()).searchParams.get('panel');
}

test('les clés d’URL de panneau résolvent vers la même surface que l’en-tête, alias et clé inconnue compris', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'contrat desktop');
  test.setTimeout(240_000);

  const auth = await authenticate(request);
  const projectId = await createProject(request, auth);

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: auth.token,
      url: appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  /*
   * Mise en route : la toute première navigation paie la compilation des routes
   * du serveur de dev et peut dépasser le délai d'un cas. On l'absorbe ici pour
   * que les assertions mesurent le routage, pas le démarrage.
   */
  await test.step('mise en route de l’IDE', async () => {
    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-project-agent-shell').first()).toBeVisible({ timeout: 120_000 });
  });

  for (const routingCase of ROUTING_CASES) {
    await test.step(`?panel=${routingCase.requested} → ${routingCase.canonical} (${routingCase.why})`, async () => {
      await page.goto(`/projects/${projectId}/ide?panel=${routingCase.requested}`, { waitUntil: 'domcontentloaded' });

      if (routingCase.surface === 'service') {
        await expect(
          page.locator(`[data-testid="ide-service-panel"][data-panel="${routingCase.canonical}"]`).first(),
        ).toBeVisible({ timeout: 60_000 });
      } else if (routingCase.surface === 'agent') {
        await expect(page.locator('.bolt-project-agent-shell').first()).toBeVisible({ timeout: 60_000 });
      } else {
        await expect(page.locator('.bolt-project-webview-tool, iframe').first()).toBeVisible({ timeout: 60_000 });
      }

      /*
       * L'URL doit porter la clé CANONIQUE : un alias est réécrit, jamais laissé
       * tel quel — sinon le lien partagé et l'état affiché divergent à nouveau.
       */
      await expect.poll(() => panelSearchParam(page), { timeout: 30_000 }).toBe(routingCase.canonical);

      // Aucun panneau de service étranger ne doit être rendu à la place du panneau demandé.
      if (routingCase.surface !== 'service') {
        await expect(page.locator('[data-testid="ide-service-panel"]')).toHaveCount(0);
      }

      await page.screenshot({
        path: testInfo.outputPath(`ide-panel-routing-${routingCase.requested}.png`),
      });
    });
  }

  await test.step(`?panel=${UNKNOWN_CASE} → traité explicitement, jamais replié sur deployments`, async () => {
    await page.goto(`/projects/${projectId}/ide?panel=${UNKNOWN_CASE}`, { waitUntil: 'domcontentloaded' });

    // Le paramètre inconnu est retiré de l'URL au lieu d'ouvrir un panneau que personne n'a demandé.
    await expect.poll(() => panelSearchParam(page), { timeout: 30_000 }).toBeNull();

    await expect(page.locator('[data-testid="ide-service-panel"][data-panel="deployments"]')).toHaveCount(0);

    await page.screenshot({ path: testInfo.outputPath('ide-panel-routing-unknown.png') });
  });
});
