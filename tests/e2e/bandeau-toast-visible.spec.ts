import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { compileAsync } from 'sass-embedded';

/**
 * Le bandeau « 1 fichier appliqué » — et tout toast de l'IDE — doit être PEINT.
 *
 * Mesuré en production le 2026-09-28 sur `d4a6f1df28`, pendant de vraies
 * générations, à 390 px (Chromium ET WebKit profil iPhone) comme à 1440 px :
 * le toast est dans le DOM, opaque, à y=60, et `elementFromPoint` au centre de
 * son rectangle rend… l'iframe de l'aperçu. Il est invisible, et « Tout
 * annuler » inatteignable.
 *
 * LA CAUSE tient en deux lignes éloignées l'une de l'autre :
 *   - `<ToastContainer stacked>` (root.tsx) : en mode empilé, react-toastify
 *     place chaque toast en `position: absolute` (`.Toastify__toast--stacked`).
 *     Le conteneur n'a plus aucun enfant dans le flux : il mesure 0 px de haut.
 *   - `index.scss` lui impose `overflow-y: auto` pour faire défiler une pile
 *     trop haute. Un conteneur de défilement de 0 px rogne TOUT ce qu'il
 *     positionne — le toast entier est hors de sa boîte.
 *
 * Contre-épreuve en production : forcer `overflow: visible` sur le conteneur
 * fait réapparaître le bandeau, à l'endroit exact qu'Avi a capturé.
 *
 * CE TEST MESURE LE RENDU, PAS LA SOURCE. Il compile le vrai `index.scss`, y
 * ajoute la vraie feuille de react-toastify, et demande au moteur ce qu'il
 * peint au centre du toast. Lire le SCSS n'aurait rien dit : chaque règle y est
 * correctement écrite, c'est leur rencontre qui efface le toast.
 */

let feuilles: string | undefined;

async function lireFeuilles() {
  if (!feuilles) {
    const ide = (await compileAsync('app/styles/index.scss', { style: 'expanded' })).css;

    const toastify = readFileSync(
      createRequire(import.meta.url).resolve('react-toastify/dist/ReactToastify.css'),
      'utf8',
    );

    /*
     * L'ordre de la production, relevé dans `document.styleSheets` : la feuille
     * de la bibliothèque, celle de l'IDE, puis UNE SECONDE COPIE de la
     * bibliothèque que react-toastify 11 injecte en ligne à l'exécution. C'est
     * elle qui gagne les égalités de spécificité — sa règle mobile
     * `left: env(safe-area-inset-left)` bat le `left: auto` de l'IDE, d'où le
     * toast collé au bord gauche mesuré en production (x=0..358).
     */
    feuilles = `${toastify}\n${ide}\n${toastify}`;
  }

  return feuilles;
}

/*
 * Le DOM que react-toastify 11 produit en mode `stacked`, relevé en production :
 * conteneur `data-stacked="true"`, toast `.Toastify__toast--stacked` avec ses
 * variables `--y` / `--s`, et le contenu rendu DIRECTEMENT dans le toast — la
 * version 11 n'enveloppe plus rien dans `.Toastify__toast-body` (la classe ne
 * survit que dans la feuille). Une enveloppe inventée ici hériterait du
 * `line-clamp` de toast.scss et rognerait les boutons sous WebKit : un rouge sur
 * un DOM que la production ne produit pas.
 *
 * Sous la pile, un chrome d'IDE opaque qui couvre tout l'écran : si le toast
 * est rogné, c'est lui que le moteur rendra.
 */
async function monter(page: Page, largeur: number, hauteur: number) {
  await page.setViewportSize({ width: largeur, height: hauteur });
  await page.setContent(`
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${await lireFeuilles()}</style></head>
    <body class="h-full w-full" style="margin: 0">
      <div class="bolt-project-ide-shell">
        <div id="chrome" style="position: fixed; inset: 0; z-index: 50; background: #fff"></div>
        <footer class="bolt-project-statusbar"></footer>
      </div>
      <section class="Toastify" aria-label="Notifications">
        <div class="Toastify__toast-container Toastify__toast-container--top-right" data-stacked="true">
          <div class="Toastify__toast Toastify__toast-theme--light Toastify__toast--success Toastify__toast--stacked"
               data-pos="top" data-collapsed="false" style="--y: 0px; --s: 1; --g: 0">
            <div class="Toastify__toast-icon"></div>
            <div class="bolt-agent-applied-toast">
              <div class="bolt-agent-applied-toast-head"><strong>1 fichier appliqué</strong>
                <span>Les patchs de l'agent ont bien été appliqués.</span></div>
              <details><summary>Afficher les détails</summary><ul><li>hello.txt</li></ul></details>
              <div class="bolt-agent-applied-toast-actions">
                <button type="button" id="annuler">Tout annuler</button>
                <button type="button">Tout fermer</button>
              </div>
            </div>
            <button type="button" class="Toastify__close-button" aria-label="Fermer"></button>
          </div>
        </div>
      </section>
    </body></html>
  `);

  return page.evaluate(() => {
    const toast = document.querySelector<HTMLElement>('.Toastify__toast')!;
    const r = toast.getBoundingClientRect();
    const peint = (x: number, y: number) => !!document.elementFromPoint(x, y)?.closest('.Toastify__toast');
    const annuler = document.getElementById('annuler')!.getBoundingClientRect();

    return {
      rect: {
        haut: Math.round(r.top),
        bas: Math.round(r.bottom),
        gauche: Math.round(r.left),
        droite: Math.round(r.right),
      },
      centrePeint: peint(r.left + r.width / 2, r.top + r.height / 2),
      annulerPeint: peint(annuler.left + annuler.width / 2, annuler.top + annuler.height / 2),
      hauteurConteneur: Math.round(
        document.querySelector('.Toastify__toast-container')!.getBoundingClientRect().height,
      ),
    };
  });
}

for (const [nom, largeur, hauteur] of [
  ['téléphone 390', 390, 844],
  ['bureau 1440', 1440, 900],
] as const) {
  test(`le bandeau des fichiers appliqués est peint — ${nom}`, async ({ page }) => {
    const m = await monter(page, largeur, hauteur);

    // Contrôle positif : la mesure a bien porté sur un toast réel, non vide.
    expect(m.rect.bas - m.rect.haut, 'le toast de test a une hauteur nulle : la mesure ne mesure rien').toBeGreaterThan(
      60,
    );

    expect(
      m.centrePeint,
      `le toast (${JSON.stringify(m.rect)}) est dans le DOM mais le moteur peint autre chose à son centre — ` +
        `conteneur de ${m.hauteurConteneur}px qui le rogne`,
    ).toBe(true);
    expect(m.annulerPeint, '« Tout annuler » doit être atteignable').toBe(true);

    if (largeur < 768) {
      /*
       * BUG-TOAST-ENTETE-001 (#589) — sur téléphone, la bande 0..96 est le
       * chrome du panneau (en-tête + barre d'adresse de la Webview, mesurés en
       * production). Le bandeau s'ouvrait à y=60, dessus ; et collé au bord
       * gauche (x=0) parce que la copie en ligne de react-toastify gagne `left`.
       */
      expect(
        m.rect.haut,
        `le bandeau (${JSON.stringify(m.rect)}) recouvre le chrome du panneau (0..96)`,
      ).toBeGreaterThanOrEqual(96);
      expect(m.rect.gauche, 'le bandeau est collé au bord gauche').toBeGreaterThanOrEqual(8);
      expect(m.rect.droite, 'le bandeau déborde à droite').toBeLessThanOrEqual(largeur - 8);
    }
  });
}
