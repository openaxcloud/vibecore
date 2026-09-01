import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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

async function ouvrirEtMesurer(page: Page, bouton: RegExp, selecteur: string) {
  const declencheur = page.getByRole('button', { name: bouton }).first();
  await expect(declencheur).toBeVisible({ timeout: 60_000 });
  await declencheur.tap();

  const panneau = page.locator(selecteur);
  await expect(panneau).toBeVisible({ timeout: 10_000 });

  const mesure = await panneau.evaluate((element) => {
    const boite = element.getBoundingClientRect();

    return {
      haut: Math.round(boite.top),
      bas: Math.round(boite.bottom),
      debordeSansDefilement:
        element.scrollHeight > boite.height + 2 && !['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
    };
  });

  /*
   * Refermer : aucune des trois surfaces ne répond au même geste. Mesuré —
   * l'appui extérieur seul laissait le panneau ouvert et faisait échouer la
   * mesure SUIVANTE, pas celle-ci. On essaie donc les trois gestes dans l'ordre.
   */
  await page.mouse.click(Math.round(page.viewportSize()!.width / 2), 120).catch(() => {});

  if (await panneau.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => {});
  }

  if (await panneau.isVisible().catch(() => false)) {
    await declencheur.tap().catch(() => {});
  }

  await expect(panneau).toBeHidden({ timeout: 10_000 });

  return mesure;
}

test.describe('panneaux de la zone de saisie sous le chrome du navigateur', () => {
  // Une session par fichier : une par test faisait passer la suite à 21 minutes.
  test.describe.configure({ mode: 'serial' });

  let session: { token: string; projectId: string };

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    session = await createProjectSession(request);
    await request.dispose();
  });

  for (const recouvrement of RECOUVREMENTS) {
    test(`aucun panneau n’est coupé — ${recouvrement.label} (${recouvrement.pixels} px)`, async ({ page }) => {
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
