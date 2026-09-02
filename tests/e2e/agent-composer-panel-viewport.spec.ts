import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Les panneaux de la zone de saisie tiennent dans ce que l'utilisateur VOIT.
 *
 * Avi photographie sur son iPhone trois panneaux — menu ⋯, sélecteur de mode,
 * détail « Avancé » — tranchés en haut et passant sous la barre de Safari, avec
 * un grand vide en dessous.
 *
 * La cause n'est pas une encoche : `env(safe-area-inset-bottom)` vaut 0 tant que
 * la barre du navigateur est affichée. La barre d'outils de Safari, comme le
 * clavier, recouvre le bas de la fenêtre de MISE EN PAGE ; seule la fenêtre
 * VISUELLE le décrit. Le produit publie cet écart dans
 * `--vc-mobile-visual-viewport-bottom` (voir visual-viewport-bottom.ts).
 *
 * ⚠️ Playwright n'émule PAS le chrome du navigateur : la fenêtre visuelle y est
 * toujours égale à la fenêtre de mise en page, donc la variable vaut 0 et une
 * mesure « telle quelle » ne distingue pas le correctif de son absence — c'est
 * vérifié, les chiffres étaient identiques. Ce test injecte donc le recouvrement
 * lui-même et vérifie ce que Playwright PEUT prouver : que la mise en page le
 * consomme. Le calcul de la valeur, lui, est tenu par le test unitaire
 * app/components/chat/visual-viewport-bottom.spec.ts.
 *
 * La certification finale reste l'appareil d'Avi.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

/**
 * Deux recouvrements réels. Mesuré sans correctif : les trois panneaux passaient
 * 212 px sous la barre dans le cas « clavier ».
 */
const RECOUVREMENTS = [
  { label: 'barre d’outils Safari', pixels: 87 },
  { label: 'clavier ouvert', pixels: 300 },
] as const;

const PANNEAUX = [
  { label: 'menu d’outils', bouton: /Plus d.options|More options/i, selecteur: '.bolt-chatbox-tools-menu' },
  { label: 'sélecteur de mode', bouton: /^(Agent|Assistant)$/, selecteur: '.bolt-chatbox-mode-menu' },
  { label: 'détail de coût', bouton: /Mode de l.agent|Agent mode/i, selecteur: '.bolt-agent-power-popover' },
] as const;

async function createProjectSession(request: APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastBody = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const registration = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `agent-panneaux-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Agent panneaux',
        organizationName: `Agent panneaux ${suffix}-${attempt}`,
      },
    });

    lastBody = await registration.text();

    if (registration.ok()) {
      const auth = JSON.parse(lastBody) as { token: string; organization: { id: string } };

      const project = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: { authorization: `Bearer ${auth.token}` },
        data: { name: 'Agent panneaux' },
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

/**
 * Referme ce qui traîne, au mieux et SANS assertion.
 *
 * La fermeture n'est pas le sujet de ce fichier : la géométrie l'est. Une
 * première version refermait APRÈS la mesure et affirmait `toBeHidden` — si la
 * fermeture ratait, le test rougissait sur elle et la mesure n'était jamais
 * jugée. Mesuré : sans le correctif, la contre-épreuve échouait par dépassement
 * de délai sur la fermeture au lieu d'échouer sur « passe sous le clavier ».
 * On repart donc d'un état propre AVANT chaque ouverture.
 */
async function refermerCeQuiTraine(page: Page, declencheur: Locator, panneau: Locator) {
  const gestes = [
    () => page.keyboard.press('Escape'),
    () => declencheur.tap(),
    () => page.locator('.bolt-project-chatbox textarea').first().click({ force: true }),
  ];

  for (let essai = 0; essai < 6; essai += 1) {
    if (!(await panneau.isVisible().catch(() => false))) {
      return;
    }

    await gestes[essai % gestes.length]().catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function ouvrirEtMesurer(page: Page, bouton: RegExp, selecteur: string) {
  const declencheur = page.getByRole('button', { name: bouton }).first();
  await expect(declencheur, `déclencheur introuvable pour ${selecteur}`).toBeVisible({ timeout: 60_000 });

  const panneau = page.locator(selecteur);

  /*
   * Ouvrir PUIS mesurer, en réessayant : certaines surfaces se referment toutes
   * seules juste après l'ouverture (re-rendu du composeur). Mesuré 1 passage sur
   * ~15 : `elementHandle` expirait parce que le panneau avait disparu entre
   * l'assertion de visibilité et la mesure. On réessaie l'ouverture ; les
   * assertions de géométrie, elles, ne changent pas.
   */
  for (let essai = 0; essai < 3; essai += 1) {
    await refermerCeQuiTraine(page, declencheur, panneau);
    await declencheur.tap();
    await expect(panneau, `le panneau ${selecteur} ne s’ouvre pas`).toBeVisible({ timeout: 10_000 });

    const poignee = await panneau
      .first()
      .elementHandle({ timeout: 5_000 })
      .catch(() => null);

    if (poignee) {
      return poignee.evaluate((element) => {
        const boite = element.getBoundingClientRect();

        return {
          haut: Math.round(boite.top),
          bas: Math.round(boite.bottom),
          debordeSansDefilement:
            element.scrollHeight > boite.height + 2 &&
            !['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
        };
      });
    }
  }

  throw new Error(`le panneau ${selecteur} se referme tout seul avant d’être mesuré`);
}

test.describe('panneaux de la zone de saisie sous le chrome du navigateur', () => {
  // Une session par fichier : une par test faisait passer la suite à 21 minutes.
  test.describe.configure({ mode: 'serial' });

  /*
   * Le tactile est une option de CONTEXTE, pas de fenêtre.
   *
   * Ce fichier ouvre les panneaux avec `tap()`, parce que c'est le geste d'Avi.
   * Le projet `webkit-iphone` l'autorise en héritant de `devices['iPhone 15 Pro']`,
   * mais le projet `chromium` reprend le même fichier sans tactile, et `tap()` y
   * échoue de façon déterministe : « The page does not support tap. » — 3 essais,
   * 3 échecs.
   *
   * Le dépôt porte déjà le motif : le projet `tablet` (playwright.config.ts) et
   * `ide-touch-targets.spec.ts` posent `hasTouch: true` sur le contexte.
   */
  test.use({ hasTouch: true });

  let session: { token: string; projectId: string };

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    session = await createProjectSession(request);
    await request.dispose();
  });

  for (const recouvrement of RECOUVREMENTS) {
    test(`aucun panneau n’est coupé — ${recouvrement.label} (${recouvrement.pixels} px)`, async ({ page }) => {
      /*
       * Trois panneaux ouverts et mesurés sur un serveur de dev : mesuré à 39 s
       * pour un seul test. Au délai par défaut de 30 s, la page était démontée
       * PENDANT l'assertion et l'échec disait « page has been closed » au lieu
       * de nommer le défaut. On allonge le délai ; on n'allège pas la mesure.
       */
      test.setTimeout(180_000);

      // Langue figée : les libellés des trois déclencheurs existent en FR et en EN.
      await page.context().addCookies([
        { name: 'vc_session', value: session.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' },
        { name: 'vibecore-auto-lang', value: 'fr', url: appBaseUrl, sameSite: 'Lax' },
      ]);
      await page.goto(`/projects/${session.projectId}/ide`, { waitUntil: 'domcontentloaded' });

      const hauteurFenetre = page.viewportSize()!.height;
      const basVisible = hauteurFenetre - recouvrement.pixels;

      await expect(page.locator('.bolt-project-chatbox textarea')).toBeVisible({ timeout: 60_000 });

      /*
       * Attendre l'HYDRATATION, pas seulement le champ.
       *
       * Le champ est rendu côté serveur ; les déclencheurs de la barre d'outils
       * ne sortent que du rendu client. Mesuré : 1 passage sur 6 échouait sur
       * « element(s) not found » pour un déclencheur, pas pour un panneau —
       * la spec ouvrait les surfaces avant que leurs boutons existent.
       * `agent-mode-advanced` sert déjà de signal d'hydratation dans
       * agent-composer-compact.spec.ts.
       */
      await expect(page.getByTestId('agent-mode-advanced')).toBeVisible({ timeout: 60_000 });

      /*
       * Le recouvrement est posé par FEUILLE DE STYLE, en `!important`, pas en
       * style en ligne. L'effet de fenêtre visuelle du produit écrit en ligne et
       * SANS priorité, et il se déclenche à chaque défilement ou
       * redimensionnement — donc pendant l'ouverture d'un panneau. Mesuré : posé
       * en ligne, il était remis à 0 avant la mesure et le panneau retombait à
       * 571 px. Une déclaration `!important` de feuille de style l'emporte.
       */
      await page.addStyleTag({
        content: `:root { --vc-mobile-visual-viewport-bottom: ${recouvrement.pixels}px !important; }`,
      });

      for (const panneau of PANNEAUX) {
        const mesure = await ouvrirEtMesurer(page, panneau.bouton, panneau.selecteur);

        expect(mesure.haut, `${panneau.label} : coupé en haut`).toBeGreaterThanOrEqual(0);
        expect(mesure.bas, `${panneau.label} : passe sous ${recouvrement.label}`).toBeLessThanOrEqual(basVisible);
        expect(mesure.debordeSansDefilement, `${panneau.label} : contenu tronqué sans défilement`).toBe(false);
      }
    });
  }
});
