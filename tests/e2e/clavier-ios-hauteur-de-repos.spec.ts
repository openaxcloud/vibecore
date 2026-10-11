import { expect, test, type APIRequestContext } from '@playwright/test';
import { PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS } from '~/lib/persistence/projectIdeMemory';

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

/*
 * Une mesure de référence ne se prend que sur une mise en page STABLE : deux
 * lectures identiques à 300 ms d'intervalle. Au premier chargement, le projet
 * arrive pendant que l'on mesure ; une hauteur lue sur un état transitoire est
 * exactement la famille de défauts que ces tests gardent (01/10).
 */
async function stable(locator: import('@playwright/test').Locator) {
  let precedent = '';

  await expect
    .poll(
      async () => {
        const r = await locator.boundingBox();
        const courant = r ? `${Math.round(r.y)}:${Math.round(r.height)}` : 'absent';
        const tient = courant !== 'absent' && courant === precedent;
        precedent = courant;

        return tient;
      },
      { intervals: [300], timeout: 30_000, message: 'la mise en page ne se stabilise pas' },
    )
    .toBe(true);
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

  await stable(composeur);

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

      return (
        [
          `attr=${document.documentElement.getAttribute('data-vc-clavier') ?? 'absent'}`,
          `socle=${getComputedStyle(document.querySelector('.bolt-mobile-replit-nav') ?? document.body).display}`,
          `ide-mobile=${Boolean(document.querySelector('.bolt-responsive-ide-mobile'))}`,
        ].join(' ') +
        ' ' +
        [
          '.bolt-mobile-agent-start-state',
          '.bolt-project-agent-scroll',
          '.bolt-project-agent-composer',
          '.bolt-project-agent-panel',
        ]
          .map(d)
          .join(' ')
      );
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
  await stable(champ);

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

/*
 * Le chemin de l'utilisateur pressé (01/10) : à l'ouverture à froid, l'IDE montre
 * d'abord une COQUILLE (`PendingComposerShell`, un `BaseChat` déjà utilisable),
 * puis la remplace par le vrai chat quand la mémoire du projet arrive — React
 * démonte et remonte BaseChat. Toucher la zone de saisie dans cet intervalle,
 * c'est lever le clavier AVANT la bascule.
 *
 * Avant #664, la hauteur de repos était locale à l'effet de BaseChat : remonté
 * clavier levé, il la réapprenait à 362 et ne voyait plus jamais le clavier —
 * zone de saisie sous le clavier. En CI, le test ci-dessus tombait dans ce cas
 * au hasard de la vitesse de la machine (18 premiers essais rouges sur 25, même
 * mise en page à chaque fois) ; en local jamais (12/12 vert sans le correctif).
 * Ce test PROVOQUE la condition au lieu de l'attendre : la mémoire du projet
 * est retenue jusqu'à ce que le clavier soit levé.
 */
test('clavier levé PENDANT le chargement : la bascule coquille → vrai chat garde le clavier vu', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token, projectId } = await createProjectSession(request);

  /*
   * La retenue se fait DANS LA PAGE, pas au réseau. Le client abandonne `ide-state`
   * au bout de PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS puis bascule sur la mémoire
   * locale : retenue au réseau, ce délai la levait tout seul. Mesuré en CI le 05/10
   * (`bf5929bd4`) : « coquille déjà remplacée avant le clavier levé », 3 essais sur
   * 3. Ici la promesse ignore le signal d'abandon : seul `relacher` la libère.
   */
  await page.addInitScript(() => {
    const fenetre = window as unknown as { __vcRetenues: number; __vcRelacher: () => void };
    const vrai = window.fetch.bind(window);

    let liberer: () => void = () => undefined;

    const retenue = new Promise<void>((resolve) => {
      liberer = resolve;
    });

    fenetre.__vcRetenues = 0;
    fenetre.__vcRelacher = () => liberer();

    window.fetch = (entree: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
      const methode = (init?.method ?? (entree instanceof Request ? entree.method : 'GET')).toUpperCase();

      if (!url.includes('/ide-state') || methode !== 'GET') {
        return vrai(entree, init);
      }

      fenetre.__vcRetenues += 1;

      const sansSignal: RequestInit = { ...init };
      delete sansSignal.signal;

      return retenue.then(() => vrai(entree, sansSignal));
    };
  });

  const retenues = () => page.evaluate(() => (window as unknown as { __vcRetenues: number }).__vcRetenues);
  const relacher = () => page.evaluate(() => (window as unknown as { __vcRelacher: () => void }).__vcRelacher());

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${projectId}/ide?panel=agent`, { waitUntil: 'domcontentloaded' });

  const composeur = page.locator('.bolt-project-agent-composer').first();
  const champ = composeur.locator('textarea').first();
  await expect(champ).toBeVisible({ timeout: 60_000 });
  await expect.poll(retenues, { message: 'la mémoire du projet n’a pas été demandée' }).toBeGreaterThan(0);

  /*
   * Au-delà du délai d'abandon du client : c'est ce qui se produit sur une machine
   * lente, et ce qui ne doit plus rien libérer.
   */
  await page.waitForTimeout(PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS + 1_000);
  await champ.focus();
  await page.setViewportSize({ width: 390, height: 362 });
  await expect(page.locator('html'), 'clavier non vu dans la coquille').toHaveAttribute('data-vc-clavier', 'ouvert');

  /*
   * Le champ est saisi APRÈS le clavier levé, quelle que soit la coquille qui
   * l'affiche. Il y en a deux avant le vrai chat : celle de la route, remplacée
   * dès que le code de `Chat` est chargé (sans rapport avec `ide-state`), puis
   * celle de `Chat`, que la retenue tient. Parier sur la première faisait rougir
   * ce test sur sa précondition (06/10, 3 essais sur 5). La mémoire du projet
   * étant retenue, le vrai chat ne peut pas être monté : ce champ sera remplacé
   * au moins une fois, clavier levé — la condition du défaut.
   */
  const champDeLaCoquille = await champ.elementHandle();

  await relacher();

  await expect
    .poll(() => champDeLaCoquille!.evaluate((n) => n.isConnected), {
      timeout: 30_000,
      message: 'la coquille n’a jamais été remplacée par le vrai chat',
    })
    .toBe(false);

  await expect(
    page.locator('html'),
    'clavier perdu à la bascule : `data-vc-clavier` retiré (hauteur de repos réapprise clavier levé)',
  ).toHaveAttribute('data-vc-clavier', 'ouvert');
  await stable(composeur);

  const cadre = (await composeur.boundingBox())!;
  expect(
    Math.round(cadre.y + cadre.height),
    'la zone de saisie passe sous le clavier après la bascule',
  ).toBeLessThanOrEqual(362);
});
