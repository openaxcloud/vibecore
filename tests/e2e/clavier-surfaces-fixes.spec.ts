import { expect, test, type Page } from '@playwright/test';
import { compileAsync } from 'sass-embedded';

/**
 * Clavier levé : les surfaces FIXES de l'IDE mobile s'arrêtent au bas VISIBLE.
 *
 * Mesuré le 2026-09-30 sur Safari iOS 26 (simulateur, 390 pt, banc XCUITest,
 * relevé posé dans l'IDE) : clavier levé, la fenêtre de mise en page RESTE à
 * 699 px quand la vue tombe à 362. Le conteneur des panneaux service
 * (`.bolt-workbench-mobile-service`, `position: fixed; bottom: 0`) gardait donc
 * 48–699 : « Nom du projet » (Paramètres, y 446–484) restait sous la barre
 * ∧ ∨ ✓ — pour le navigateur il était visible dans sa zone, rien ne le ramenait.
 *
 * POURQUOI UN TEST DE RENDU ET NON UN E2E SUR L'IDE : Chromium ne sait pas
 * reproduire cet état. Réduire sa fenêtre réduit AUSSI la fenêtre de mise en
 * page ; `bottom: 0` suit, et l'e2e passe avec ou sans correctif. On reproduit
 * donc l'état d'iOS tel que mesuré — fenêtre de mise en page 699, recouvrement
 * du clavier `--vc-mobile-visual-viewport-bottom: 337px` (la valeur que BaseChat
 * pose) — sur la VRAIE feuille compilée.
 */

let feuille: string | undefined;

async function lireFeuille() {
  feuille ??= (await compileAsync('app/styles/index.scss', { style: 'expanded' })).css;
  return feuille;
}

async function monter(page: Page, clavier: boolean) {
  await page.setViewportSize({ width: 390, height: 699 });
  await page.setContent(`
    <html ${clavier ? "data-vc-clavier='ouvert'" : ''} style="--vc-mobile-visual-viewport-bottom: ${clavier ? 337 : 0}px">
    <head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${await lireFeuille()}</style></head>
    <body style="margin: 0">
      <div class="bolt-responsive-ide bolt-responsive-ide-mobile">
        <div id="service" class="bolt-workbench-mobile bolt-workbench-mobile-service fixed left-0 z-0 w-full"></div>
        <!-- La classe utilitaire \`fixed\` (UnoCSS) ne vit pas dans index.scss : on la pose en ligne. -->
        <div id="autre" class="bolt-workbench-mobile fixed" style="position: fixed"></div>
      </div>
    </body></html>
  `);

  return page.evaluate(() =>
    Object.fromEntries(
      ['service', 'autre'].map((id) => [id, Math.round(document.getElementById(id)!.getBoundingClientRect().bottom)]),
    ),
  );
}

test('au repos, les surfaces fixes descendent sous 362 — sinon la mesure clavier levé ne dirait rien', async ({
  page,
}) => {
  const bas = await monter(page, false);

  expect(bas.service).toBeGreaterThan(362);
  expect(bas.autre).toBeGreaterThan(362);
});

test('clavier levé (iOS : mise en page 699, clavier 337), les surfaces fixes s’arrêtent au bas visible (362)', async ({
  page,
}) => {
  const bas = await monter(page, true);

  expect(bas.service, 'le panneau service passe sous le clavier').toBe(362);
  expect(bas.autre, 'la surface mobile passe sous le clavier').toBe(362);
});
