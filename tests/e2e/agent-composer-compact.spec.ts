import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * La zone de saisie de l'agent tient en UN bloc.
 *
 * Au repos elle empilait cinq rangées — segmenté Léger/Économique/Puissance,
 * bouton « Avancé », ligne de coût, bouton « Planifier », le champ, puis la
 * rangée trombone/micro/Agent/⋯ — soit 249 px en 390 pour un champ vide, près
 * d'un tiers du panneau, et 312 px en desktop.
 *
 * Ce fichier mesure la GÉOMÉTRIE RENDUE, pas le balisage : c'est la seule chose
 * qui dise si l'utilisateur voit une rangée ou deux. Les hauteurs sont en
 * pixels — la base rem du produit vaut 12 px en desktop et 14 px sous 1024 px,
 * donc toute valeur en rem serait déformée.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

/** Plafond au repos par format. Mesuré avant correctif : 249 / 198 / 312. */
const VIEWPORTS = [
  { label: 'mobile 390', width: 390, height: 844, maxComposerPx: 170 },
  { label: 'tablette 768', width: 768, height: 1024, maxComposerPx: 170 },
  { label: 'desktop 1440', width: 1440, height: 900, maxComposerPx: 210 },
] as const;

/** TEXTAREA_MAX_HEIGHT du panneau Agent (Chat.client). */
const FIELD_MAX_PX = 140;

async function createProjectSession(request: APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastBody = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const registration = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `agent-composer-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Agent composer compact',
        organizationName: `Agent composer compact ${suffix}-${attempt}`,
      },
    });

    lastBody = await registration.text();

    if (registration.ok()) {
      const auth = JSON.parse(lastBody) as { token: string; organization: { id: string } };

      const project = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: { authorization: `Bearer ${auth.token}` },
        data: { name: 'Agent composer compact' },
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

async function measureComposer(page: Page) {
  return page.evaluate(() => {
    const composer = document.querySelector('.bolt-project-agent-composer');
    const field = document.querySelector('.bolt-project-chatbox textarea');
    const bar = document.querySelector('.bolt-chatbox-toolbar');

    if (!composer || !field || !bar) {
      return null;
    }

    /*
     * Le nombre de rangées se lit sur les CENTRES verticaux, pas sur les bords :
     * les étiquettes font 44 px et le fin trait séparateur 16 px, donc leurs
     * bords hauts diffèrent de 14 px alors qu'ils sont sur la même ligne.
     */
    const centres = [...bar.children]
      .flatMap((group) => [...group.children])
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map((box) => box.top + box.height / 2)
      .sort((a, b) => a - b);

    let rows = centres.length ? 1 : 0;

    for (let i = 1; i < centres.length; i += 1) {
      if (centres[i] - centres[i - 1] > 8) {
        rows += 1;
      }
    }

    return {
      composerHeight: Math.round(composer.getBoundingClientRect().height),
      fieldHeight: Math.round(field.getBoundingClientRect().height),
      barHeight: Math.round(bar.getBoundingClientRect().height),
      controlCount: centres.length,
      rows,
    };
  });
}

for (const viewport of VIEWPORTS) {
  test(`la zone de saisie tient en une rangée — ${viewport.label}`, async ({ page, request }) => {
    /*
     * `/auth/register` est limité à ~10 par minute et par IP : la préparation du
     * fixture peut donc attendre plusieurs paliers de repli avant d'obtenir une
     * session. Le délai par défaut de 30 s de la configuration ne le couvre pas,
     * et c'est la cause n°1 des faux rouges de cette suite.
     */
    test.setTimeout(120_000);

    const { token, projectId } = await createProjectSession(request);

    await page
      .context()
      .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    const field = page.locator('.bolt-project-chatbox textarea');
    await expect(field).toBeVisible({ timeout: 60_000 });

    /*
     * Le champ apparaît AVANT l'hydratation ; l'auto-agrandissement, lui, est un
     * effet React. Une frappe envoyée trop tôt ne déclenchait donc aucun
     * redimensionnement et le test tombait sur un défaut de minutage, pas sur le
     * produit. L'étiquette de puissance ne sort que du rendu client : elle sert
     * de signal d'hydratation.
     */
    await expect(page.getByTestId('agent-mode-advanced')).toBeVisible({ timeout: 60_000 });

    const atRest = await measureComposer(page);

    /*
     * Témoin positif : sans lui, un sélecteur périmé rendrait la mesure vide et
     * chaque assertion suivante passerait sur du néant.
     */
    expect(atRest, 'composer non mesuré').not.toBeNull();
    expect(atRest!.controlCount, 'aucune commande mesurée dans la rangée').toBeGreaterThanOrEqual(4);

    expect(atRest!.rows, `rangées de commandes en ${viewport.label}`).toBe(1);
    expect(
      atRest!.composerHeight,
      `hauteur du composer au repos en ${viewport.label} : ${atRest!.composerHeight}px`,
    ).toBeLessThanOrEqual(viewport.maxComposerPx);

    /*
     * Les sélecteurs repliés ne doivent PAS reparaître dans la rangée : ni le
     * segmenté des modes, ni le coût, ni « Planifier ».
     */
    await expect(page.locator('.bolt-chatbox-toolbar [data-testid="agent-mode-segmented"]')).toHaveCount(0);
    await expect(page.locator('.bolt-chatbox-toolbar .bolt-chatbox-plan-toggle')).toHaveCount(0);

    // Le champ grandit à la frappe, jusqu'à son maximum, et pas au-delà.
    const saisie = Array.from({ length: 40 }, (_, index) => `ligne ${index}`).join('\n');

    await field.click();

    /*
     * Une frappe envoyée pendant que la page finit de s'hydrater est PERDUE : le
     * champ est contrôlé par React, qui réécrit sa valeur au premier rendu et
     * efface ce qui avait été tapé. Mesuré sur un serveur froid : `value.length`
     * reste à 0 pendant plus de cinq secondes. C'est un défaut du composer, sans
     * rapport avec la géométrie que ce fichier vérifie ; on retape donc jusqu'à
     * ce que la valeur tienne, plutôt que de mesurer un champ resté vide.
     */
    await expect
      .poll(
        async () => {
          await field.fill(saisie);
          return (await field.inputValue()).length;
        },
        { message: 'la saisie n’atteint pas le champ', timeout: 20_000 },
      )
      .toBeGreaterThan(0);

    /*
     * L'agrandissement est un effet React déclenché par la mise à jour d'état,
     * pas un style synchrone : on attend la CONDITION, pas une durée. Si le champ
     * ne grandit jamais, l'attente expire et le test échoue.
     */
    await expect
      .poll(async () => (await measureComposer(page))!.fieldHeight, {
        message: 'le champ ne grandit pas à la frappe',
        timeout: 10_000,
      })
      .toBeGreaterThan(atRest!.fieldHeight);

    const grown = await measureComposer(page);

    expect(grown!.fieldHeight, 'le champ dépasse son maximum').toBeLessThanOrEqual(FIELD_MAX_PX + 2);
  });
}
