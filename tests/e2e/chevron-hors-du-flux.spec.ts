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

/**
 * Le déclencheur du menu ne doit occuper AUCUNE place dans le flux.
 *
 * Il remplace le crayon et la barre d'actions, dont le retrait devait rendre de
 * la place. Mesuré en production le 2026-09-05 : il calculait
 * `position: relative` et occupait 28 px dans chaque message **alors qu'il est
 * invisible** — il rendait les deux tiers du gain.
 *
 * LA CAUSE, et c'est la troisième fois qu'elle frappe : la règle d'infobulle
 *
 *   :where(…) :where(button,…)[data-vc-tooltip]:not([data-vc-radix-tooltip=true])
 *
 * est à (0,2,0), parce que `:not()` compte la spécificité de son argument. Une
 * classe simple est à (0,1,0) et perd. C'est la même règle qui avait battu la
 * pastille de descente.
 *
 * CE TEST MESURE LE CALCULÉ, PAS LA SOURCE. Ni le SCSS ni la feuille servie ne
 * montrent le défaut : les deux règles y figurent, correctement écrites. Seul
 * `getComputedStyle` dit laquelle gagne. Un test qui lit le fichier aurait été
 * vert pendant que la production perdait 28 px par message.
 */
test("le declencheur du menu n'occupe aucune place dans le flux", async ({ page }) => {
  const stylesheet = await readCompiledIdeStyles();
  await page.setViewportSize({ width: 390, height: 664 });
  await page.setContent(`
    <html><head><style>${stylesheet}</style></head>
    <body style="margin: 0">
      <div class="bolt-project-ide-shell bolt-responsive-ide bolt-responsive-ide-mobile">
        <div class="bolt-chat-message-row bolt-chat-message-row-assistant">
          <div class="bolt-assistant-message">
            <button class="bolt-message-menu-trigger" data-vc-tooltip="Message actions"
                    aria-label="Message actions" aria-haspopup="menu"><span>⋯</span></button>
            <div class="MarkdownContent"><p id="texte">Une reponse de l'agent.</p></div>
          </div>
        </div>
      </div>
    </body></html>
  `);

  const mesure = await page.evaluate(() => {
    const bouton = document.querySelector<HTMLElement>('.bolt-message-menu-trigger')!;
    const style = getComputedStyle(bouton);

    return {
      position: style.position,
      opacite: style.opacity,

      /*
       * La preuve qui compte : la ligne fait-elle la même hauteur avec et sans
       * le bouton ? Un élément hors du flux ne change rien à son parent.
       */
      hauteurAvec: Math.round(document.querySelector('.bolt-chat-message-row')!.getBoundingClientRect().height),
    };
  });

  expect(mesure.position, 'le declencheur est dans le flux : il pousse le texte').toBe('absolute');
  expect(mesure.opacite, 'le declencheur doit etre invisible au repos').toBe('0');

  const sansBouton = await page.evaluate(() => {
    document.querySelector('.bolt-message-menu-trigger')!.remove();
    return Math.round(document.querySelector('.bolt-chat-message-row')!.getBoundingClientRect().height);
  });

  expect(
    mesure.hauteurAvec,
    `la ligne perd ${mesure.hauteurAvec - sansBouton}px quand on retire le declencheur : il occupe donc de la place`,
  ).toBe(sansBouton);
});
