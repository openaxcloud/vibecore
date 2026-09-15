import { expect, test } from '@playwright/test';
import { compileAsync } from 'sass-embedded';

let compiledIdeStyles: string | undefined;

async function readCompiledIdeStyles() {
  if (!compiledIdeStyles) {
    const result = await compileAsync('app/styles/index.scss', { style: 'expanded' });
    compiledIdeStyles = result.css;
  }

  return compiledIdeStyles;
}

/*
 * BUG-SECURITY-FONT-001 — Avi, point 5 : « pour la tab sécurité est-ce que
 * c'est la même taille de police que ce qu'on a fait partout ? »
 *
 * PREMIER TOUR : le `h3` du résumé passait de 12 à 22 px. Réel, mais partiel.
 * SECOND TOUR, mesuré en Chromium sur la feuille compilée, à 390 px :
 *
 *     h3 « Scanner de sécurité » ........ 22px  ✔
 *     h4 « Comparaison de scans » ....... 12px  ✖
 *     <p> juste sous ce h4 .............. 14px
 *
 * Un titre PLUS PETIT que le texte qu'il coiffe. La cause est la remise à plat
 * de la coque — `:where(h3, h4, h5, h6)` en (0,2,0) `!important` — dont
 * l'exception n'avait été ouverte que pour le `h3` du RÉSUMÉ.
 *
 * POURQUOI CE TEST-CI ET PAS L'ANCIEN. `security-taille-police.spec.ts` lit la
 * feuille EN TEXTE par expression régulière : il resterait vert si une règle
 * postérieure écrasait la valeur, et il ne dit rien du `h4`. Celui-ci mesure ce
 * qui est RENDU, dans un navigateur, sur la vraie cascade.
 *
 * L'INVARIANT N'EST PAS UNE VALEUR FIGÉE. Figer « 16 px » ferait rougir le test
 * au premier changement de charte, et on le mettrait à jour sans réfléchir. Ce
 * qui doit tenir, c'est qu'aucun titre ne passe SOUS le texte qu'il coiffe.
 */
test.describe('onglet Sécurité — un titre n’est jamais plus petit que son texte', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('les titrailles du panneau dominent leur corps de texte', async ({ page }) => {
    const stylesheet = await readCompiledIdeStyles();

    await page.setContent(`
      <html>
        <head><style>${stylesheet}</style></head>
        <body>
          <div class="bolt-project-ide-shell">
            <div class="bolt-responsive-ide bolt-responsive-ide-mobile">
              <div class="bolt-project-service-panel">
                <section class="bolt-project-security-summary">
                  <h3 data-mesure="h3">Scanner de sécurité</h3>
                </section>
                <section class="bolt-project-security-tool">
                  <h4 data-mesure="h4">Comparaison de scans</h4>
                  <p data-mesure="p">Comparez deux analyses pour voir ce qui a changé.</p>
                  <h5 data-mesure="h5">Détail par sévérité</h5>
                </section>
                <div class="bolt-secrets">
                  <h2 class="bolt-secrets-title" data-mesure="secrets">Secrets</h2>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);

    const tailles = await page.evaluate(() => {
      const lu: Record<string, number> = {};

      for (const el of Array.from(document.querySelectorAll('[data-mesure]'))) {
        lu[(el as HTMLElement).dataset.mesure!] = parseFloat(getComputedStyle(el).fontSize);
      }

      return lu;
    });

    /*
     * Garde anti-mesure-vide (règles 14 / 14 bis) : un DOM qui ne monte pas
     * rendrait un objet vide, et toutes les comparaisons ci-dessous passeraient
     * sur `undefined`. Un vert sur rien n'est pas un vert.
     */
    expect(Object.keys(tailles).length, `mesures relevées : ${JSON.stringify(tailles)}`).toBeGreaterThanOrEqual(5);

    for (const cle of ['h3', 'h4', 'h5', 'p', 'secrets']) {
      expect(tailles[cle], `${cle} doit avoir une taille mesurable`).toBeGreaterThan(0);
    }

    // LE DÉFAUT RAPPORTÉ : un titre sous son propre texte.
    expect(tailles.h4, `h4=${tailles.h4} contre p=${tailles.p}`).toBeGreaterThanOrEqual(tailles.p);
    expect(tailles.h5, `h5=${tailles.h5} contre p=${tailles.p}`).toBeGreaterThanOrEqual(tailles.p);

    // La hiérarchie tient : le titre principal domine les sous-titres.
    expect(tailles.h3).toBeGreaterThanOrEqual(tailles.h4);

    // Et Sécurité ne peut plus diverger de Secrets sans rougir (le premier tour).
    expect(tailles.h3).toBe(tailles.secrets);
  });
});
