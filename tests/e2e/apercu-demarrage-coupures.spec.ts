import { expect, test } from '@playwright/test';


/*
 * BUG-PREVIEW-CUTOFF-001 — point 8 : les ÉTATS de l'onglet Aperçu qu'on ne peut pas atteindre
 * localement (pas d'espace de travail réel) : l'écran de démarrage.
 *
 * On ne simule pas la mise en page : on charge la VRAIE feuille de styles de
 * l'application et on lui donne la structure exacte que rend le composant.
 * C'est le moteur qui mesure, avec les mêmes règles qu'en production. Ce
 * qu'on ne mesure PAS ainsi, c'est la logique d'affichage — seulement la
 * géométrie, ce qui est précisément la question posée.
 */
const FORMATS = [
  { nom: 'telephone', largeur: 390, hauteur: 844 },
  { nom: 'tablette', largeur: 834, hauteur: 1112 },
  { nom: 'web', largeur: 1280, hauteur: 900 },
];

const ETAPES = [
  { id: 'boot', label: 'Préparation de l’espace de travail' },
  { id: 'install', label: 'Installation des dépendances' },
  { id: 'build', label: 'Construction du projet' },
  { id: 'serve', label: 'Démarrage du serveur de développement' },
];

for (const format of FORMATS) {
  test(`écran de démarrage de l'Aperçu — rien de coupé en ${format.nom}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: format.largeur, height: format.hauteur });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const rapport = await page.evaluate(
      ({ largeur, etapes }) => {
        const hote = document.createElement('div');
        hote.id = 'sonde-splash';
        hote.style.cssText = `position:fixed;inset:0;width:${largeur}px;`;

        /*
         * ⚠️ L'ASCENDANCE COMPTE, et l'oublier m'a fait sur-déclarer le défaut.
         *
         * Une première version injectait l'écran dans un `<body>` nu. Or il
         * existe déjà un correctif MOBILE, `.bolt-responsive-ide-mobile
         * .bolt-preview-splash-steps strong`, sous `@media (max-width: 1199px)`
         * — il n'avait donc aucune chance de s'appliquer, et la mesure
         * annonçait des coupures sur téléphone et tablette qui n'existaient
         * pas. La coque de l'IDE est reproduite ici : au-dessus de 1199 px la
         * règle mobile est inerte, et c'est là que la troncature était RÉELLE.
         */
        hote.innerHTML = `
          <div class="bolt-project-ide-shell"><div class="bolt-responsive-ide-mobile">
          <div class="bolt-preview-splash" role="status">
            <div class="bolt-preview-splash-shell">
              <div class="bolt-preview-splash-chrome"><span></span><span></span><span></span><div></div></div>
              <div class="bolt-preview-splash-slide">
                <h3>Votre application se prépare</h3>
                <p>Nous installons les dépendances et démarrons le serveur de développement.</p>
              </div>
              <div class="bolt-preview-splash-task">
                <span class="i-ph:circle-notch"></span>
                <span><strong>${etapes[1].label}</strong><small>Installation de 1 248 paquets — cela peut prendre une minute</small></span>
                <button type="button">Voir les journaux</button>
              </div>
              <div class="bolt-preview-splash-progress" role="progressbar"><span style="width:42%"></span></div>
              <div class="bolt-preview-splash-steps">
                ${etapes
                  .map(
                    (e, i) =>
                      `<div data-state="${i === 1 ? 'active' : i < 1 ? 'complete' : 'pending'}"><span>${i + 1}</span><strong>${e.label}</strong></div>`,
                  )
                  .join('')}
              </div>
              <div class="bolt-preview-splash-footer">
                <div class="bolt-preview-splash-dots"><button></button><button></button><button></button></div>
                <p>Préparation de « Chrome mobile »</p>
              </div>
              <pre class="bolt-preview-splash-log">npm warn deprecated une-dependance-au-nom-tres-long@1.2.3: remplacee par une-autre-dependance-au-nom-encore-plus-long</pre>
            </div>
          </div></div></div>`;

        document.body.appendChild(hote);

        const debordements: Array<Record<string, unknown>> = [];

        for (const el of Array.from(hote.querySelectorAll<HTMLElement>('*'))) {
          const r = el.getBoundingClientRect();

          if (r.width === 0 && r.height === 0) {
            continue;
          }

          const style = getComputedStyle(el);
          const coupe = el.scrollWidth - el.clientWidth > 2 && style.overflowX === 'hidden';
          const dehors = r.right > largeur + 2 || r.left < -2;

          if (coupe || dehors) {
            debordements.push({
              balise: el.tagName.toLowerCase(),
              classe: el.className.toString().slice(0, 50),
              gauche: Math.round(r.left),
              droite: Math.round(r.right),
              scrollW: el.scrollWidth,
              clientW: el.clientWidth,
              overflowX: style.overflowX,
              texte: (el.textContent ?? '').trim().slice(0, 35),
            });
          }
        }

        const resultat = {
          styleCharge: getComputedStyle(hote.querySelector('.bolt-preview-splash-shell')!).display !== 'inline',
          nb: debordements.length,
          debordements: debordements.slice(0, 10),
        };

        hote.remove();

        return resultat;
      },
      { largeur: format.largeur, etapes: ETAPES },
    );

    /*
     * Garde-fou de la mesure (règle 4) : sans la feuille de styles, TOUT tient
     * dans la largeur et le test passerait en ne mesurant rien.
     */
    expect(rapport.styleCharge, 'la feuille de styles doit être chargée, sinon la mesure ne mesure rien').toBe(true);

    expect(
      rapport.nb,
      `éléments coupés ou hors écran en ${format.nom} : ${JSON.stringify(rapport.debordements)}`,
    ).toBe(0);
  });
}
