import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Clavier levé sur Safari iOS 26 : la barre d'onglets doit être couverte, et la
 * zone de saisie collée au bas de la zone visible.
 *
 * Mesuré le 2026-09-30 sur Safari iOS 26 (simulateur, 390 pt, XCUITest) dans
 * l'IDE, sur l'état de départ d'un projet neuf :
 *   - au repos innerHeight 699, vue 699 ;
 *   - clavier levé innerHeight **362**, vue 362 : Safari rétrécit AUSSI la
 *     fenêtre de mise en page. La détection (« mise en page − vue ») valait 0 :
 *     `data-vc-clavier` jamais posé, socle d'onglets affiché au bas de la
 *     fenêtre rétrécie (y 347–391), zone de saisie repoussée à y 61–109 ;
 *   - une fois le clavier vu, l'état de départ (287 px, hauteur minimale = son
 *     contenu) ne cédait rien : le composeur (117 px) débordait de 90 px sous
 *     le bas visible, derrière la pastille d'adresse de Safari.
 *
 * Réduire la fenêtre de Chromium de 844 à 362 px de haut reproduit EXACTEMENT
 * ce que fait Safari iOS 26 : `innerHeight` et la vue rétrécissent ensemble. Ce
 * test parcourt donc le vrai chemin — mesure JS de BaseChat, attribut, feuille
 * de style — sur le vrai IDE. La preuve sur le moteur iOS est tenue à part par
 * le banc XCUITest (`tests/ios-sim/`, ClavierSafariTests.test2), qui ne tourne
 * pas en CI.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

async function createProjectSession(request: APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastBody = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const registration = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `clavier-repos-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Clavier hauteur de repos',
        organizationName: `Clavier repos ${suffix}-${attempt}`,
      },
    });

    lastBody = await registration.text();

    if (registration.ok()) {
      const auth = JSON.parse(lastBody) as { token: string; organization: { id: string } };

      const project = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: { authorization: `Bearer ${auth.token}` },
        data: { name: 'Clavier hauteur de repos' },
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

test('clavier levé (fenêtre de mise en page rétrécie, comme iOS 26) : socle couvert, zone de saisie visible', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token, projectId } = await createProjectSession(request);

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${projectId}/ide?panel=agent`, { waitUntil: 'domcontentloaded' });

  const composeur = page.locator('.bolt-project-agent-composer').first();
  const socle = page.locator('.bolt-mobile-replit-nav');
  await expect(composeur).toBeVisible({ timeout: 60_000 });

  // Contrôle positif : au repos, le socle est là et le clavier n'est pas vu.
  await expect(socle).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-vc-clavier', 'ouvert');

  // Précondition de la mesure : l'état de départ (le cas mesuré sur iOS) est affiché.
  await expect(page.locator('.bolt-mobile-agent-start-state')).toBeVisible();

  // « Clavier levé » à la manière d'iOS 26 : innerHeight ET vue tombent à 362.
  await page.setViewportSize({ width: 390, height: 362 });

  await expect(page.locator('html'), 'le clavier n’est pas vu : `data-vc-clavier` absent').toHaveAttribute(
    'data-vc-clavier',
    'ouvert',
  );
  await expect(socle, 'le socle d’onglets flotte au-dessus du clavier au lieu d’être couvert').toBeHidden();

  /*
   * En cas d'échec, le message dit l'état RÉEL de la mise en page (le 30/09, un
   * premier essai en CI a rendu 454 sans trace exploitable — la valeur exacte du
   * cas « règle absente » — puis est passé au second).
   */
  const etat = () =>
    page.evaluate(() => {
      const d = (sel: string) => {
        const e = document.querySelector(sel);

        if (!e) {
          return `${sel}=absent`;
        }

        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);

        return `${sel}=[${Math.round(r.top)}-${Math.round(r.bottom)} fs=${cs.flexShrink} fb=${cs.flexBasis} h=${cs.height} minh=${cs.minHeight} parent=${e.parentElement?.className.toString().split(/\s+/).slice(0, 2).join('.')} rang=${e.parentElement ? [...e.parentElement.children].indexOf(e) : -1}]`;
      };

      return [
        '.bolt-mobile-agent-start-state',
        '.bolt-project-agent-scroll',
        '.bolt-project-agent-composer',
        '.bolt-project-agent-panel',
      ]
        .map(d)
        .join(' ');
    });

  let bas = Number.NaN;

  for (let essai = 0; essai < 25; essai += 1) {
    const r = await composeur.boundingBox();
    bas = r ? Math.round(r.y + r.height) : Number.NaN;

    if (bas <= 362) {
      break;
    }

    await page.waitForTimeout(200);
  }

  expect(bas, `la zone de saisie déborde sous le bas visible (362) — ${await etat()}`).toBeLessThanOrEqual(362);

  const cadre = (await composeur.boundingBox())!;
  expect(cadre.y, 'la zone de saisie est repoussée hors du haut de l’écran').toBeGreaterThanOrEqual(0);
  expect(cadre.height, 'la zone de saisie a été écrasée').toBeGreaterThan(80);

  // Clavier refermé : tout revient.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('html')).not.toHaveAttribute('data-vc-clavier', 'ouvert');
  await expect(socle).toBeVisible();
});

/*
 * Mesuré le 2026-09-30 sur Safari iOS 26 (banc XCUITest) : une fois le clavier
 * vu, la page n'est plus décalée par Safari — voulu pour le composeur — mais
 * « Nom du projet » (Paramètres, y 446–484) restait SOUS la barre ∧ ∨ ✓ et la
 * pastille d'adresse (bas visible 409). Le champ actif doit être ramené dans sa
 * zone de défilement.
 */
test('clavier levé sur un champ bas (Paramètres) : le champ actif reste visible', async ({ page, request }) => {
  test.setTimeout(120_000);

  const { token, projectId } = await createProjectSession(request);

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${projectId}/ide?panel=settings`, { waitUntil: 'domcontentloaded' });

  // Par son nom de champ, pas par son libellé : Chromium tourne en anglais (« Project name »).
  const champ = page.locator('.bolt-responsive-ide-mobile input[name="name"]').first();
  await expect(champ).toBeVisible({ timeout: 60_000 });

  // Précondition : au repos, le champ est plus bas que le futur bas visible — sinon le test ne mesure rien.
  const avant = (await champ.boundingBox())!;
  expect(avant.y + avant.height, 'le champ est déjà au-dessus de 362 : la mesure serait vide').toBeGreaterThan(362);

  await champ.focus();
  await page.setViewportSize({ width: 390, height: 362 });
  await expect(page.locator('html')).toHaveAttribute('data-vc-clavier', 'ouvert');

  let bas = Number.NaN;
  let haut = Number.NaN;

  for (let essai = 0; essai < 25; essai += 1) {
    const r = await champ.boundingBox();
    haut = r ? r.y : Number.NaN;
    bas = r ? r.y + r.height : Number.NaN;

    if (bas <= 362 && haut >= 0) {
      break;
    }

    await page.waitForTimeout(200);
  }

  expect(bas, 'le champ actif reste sous le bas visible (362)').toBeLessThanOrEqual(362);
  expect(haut, 'le champ actif est sorti par le haut').toBeGreaterThanOrEqual(0);
});
