import { expect, test } from '@playwright/test';
import { compileAsync } from 'sass-embedded';

/**
 * Panneau Publier sur téléphone : la barre collante « Publier » descend jusqu'à
 * la barre du bas — aucune bande de contenu ne passe entre les deux.
 *
 * Mesuré en prod le 30/09 à 390 : le défileur du panneau de service va de 48 à
 * 844 (sous la barre du bas, 772→844) avec un bas intérieur de 88 px
 * (`--mobile-nav-height` + `--vc-mobile-panel-gutter`). La barre collante se
 * calait sur ce bas intérieur (bord à 756) : entre 756 et 772, « Historique des
 * publications » défilait à découvert.
 *
 * CE TEST MESURE LE RENDU : vraie feuille compilée, balisage de la prod ; seules
 * les propriétés venant de classes utilitaires (absentes d'index.scss) sont
 * posées en ligne.
 */
let feuille: string | undefined;

test('Publier (390) : la barre collante touche la barre du bas, sans bande à découvert', async ({ page }) => {
  feuille ??= (await compileAsync('app/styles/index.scss', { style: 'expanded' })).css;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${feuille}</style></head>
    <body style="margin:0">
      <div class="bolt-project-ide-shell bolt-responsive-ide bolt-responsive-ide-mobile">
        <div class="bolt-workbench-mobile bolt-workbench-mobile-service fixed" style="position:fixed;inset:48px 0 0 0">
          <div class="bolt-project-service-panel" style="display:flex;flex-direction:column;height:100%">
            <div class="min-h-0 flex-1 overflow-auto p-4 pb-20" id="defileur" style="flex:1;overflow:auto">
              <div class="bolt-publication">
                ${Array.from({ length: 14 }, (_, i) => `<p style="height:80px;margin:0">bloc ${i}</p>`).join('')}
                <div class="bolt-publication-pied"><button class="bolt-publication-republier">Publier</button></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body></html>
  `);
  await page.evaluate(() => {
    const d = document.getElementById('defileur')!;
    d.scrollTop = (d.scrollHeight - d.clientHeight) / 2;
  });

  const m = await page.evaluate(() => {
    const d = document.getElementById('defileur')!;
    const pied = document.querySelector('.bolt-publication-pied')!.getBoundingClientRect();

    // Le haut de la barre du bas, tel que la prod le mesure : 844 − 72 = 772.
    const hauteurBarre = parseFloat(
      getComputedStyle(document.querySelector('.bolt-workbench-mobile')!).getPropertyValue('--mobile-nav-height'),
    );

    return {
      defile: d.scrollHeight > d.clientHeight && d.scrollTop > 0,
      piedBas: Math.round(pied.bottom),
      barreHaut: Math.round(innerHeight - hauteurBarre),
      hauteurBarre,
    };
  });

  // Contrôle positif : sans défilement, le collant ne serait pas en jeu.
  expect(m.defile, 'le contenu doit défiler — sinon ce test ne mesure rien').toBe(true);
  expect(m.hauteurBarre, '--mobile-nav-height introuvable — la référence serait fausse').toBeGreaterThan(40);
  expect(
    m.barreHaut - m.piedBas,
    `bande à découvert de ${m.barreHaut - m.piedBas}px entre la barre « Publier » (bas ${m.piedBas}) et la barre du bas (${m.barreHaut})`,
  ).toBeLessThanOrEqual(1);
});
