import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * Directive design — barre de la Webview en mobile (390) et tablette (768).
 *
 * La barre alignait une quinzaine de commandes de mise au point (retour,
 * suivant, rafraîchir, sélection, capture, sélecteur d'appareil, bascule
 * d'appareil, QR, rotation, cadre, inspecteur, outils de développement, `</>`,
 * plein écran, journaux, options de fenêtre). Elles repassaient sur deux ou
 * trois lignes et mangeaient la hauteur de l'aperçu lui-même.
 *
 * Contrat retenu : sous le bureau, UNE seule ligne — l'adresse et « Ouvrir dans
 * le navigateur ». Le bureau (≥ 1024px) garde la barre complète.
 *
 * Et la ligne d'état de l'agent n'appartient qu'à la surface agent : `sticky`,
 * elle survivait au changement de panneau et venait barrer la Webview.
 */

const FEUILLE = 'app/styles/index.scss';
const PREVIEW = 'app/components/workbench/Preview.tsx';

function blocCompact(styles: string): string {
  const debut = styles.indexOf('@media (max-width: 1023px)');

  expect(debut, 'le bloc compact doit exister').toBeGreaterThan(-1);

  return styles.slice(debut, styles.indexOf('\n}\n', debut));
}

describe('barre de la Webview — mobile et tablette', () => {
  const styles = readFileSync(FEUILLE, 'utf8');
  const preview = readFileSync(PREVIEW, 'utf8');

  it('marque les deux groupes d’outils pour pouvoir les masquer', () => {
    /*
     * Deux groupes : celui de gauche (navigation, capture) et celui de droite
     * (appareils, inspecteur, journaux). Sans classe commune, il aurait fallu
     * masquer les commandes une par une — et en oublier une au prochain ajout.
     */
    expect(preview.match(/bolt-preview-toolbar-tools/gu) ?? []).toHaveLength(2);
  });

  it('sort le bouton « Ouvrir dans le navigateur » du masquage', () => {
    expect(preview).toContain('bolt-preview-open-external');

    const bloc = blocCompact(styles);

    expect(bloc).toContain('.bolt-preview-toolbar-tools > *:not(.bolt-preview-open-external)');
    expect(bloc).toMatch(/:not\(\.bolt-preview-open-external\)\s*\{\s*display:\s*none/u);
  });

  it('retire aussi « copier l’URL », qui vit dans la pilule d’adresse', () => {
    /*
     * Mesuré dans un navigateur sur la feuille compilée : sans cette règle il
     * restait le troisième contrôle de la ligne, le masquage des groupes ne
     * l'atteignant pas. Sur un téléphone il fait doublon avec « Ouvrir dans le
     * navigateur », qui emmène l'adresse avec lui.
     */
    expect(preview).toContain('bolt-preview-copy-url');
    expect(blocCompact(styles)).toMatch(/\.bolt-preview-copy-url\s*\{\s*display:\s*none/u);
  });

  it('tient sur une seule ligne — et impose le mode de disposition', () => {
    const bloc = blocCompact(styles);
    const regle = bloc.match(/\.bolt-project-webview-toolbar \{([^}]*)\}/u)?.[1] ?? '';

    /*
     * Cette assertion ne vérifiait QUE `flex-wrap: nowrap`. Elle est restée
     * verte pendant que la barre s'affichait sur deux lignes en production
     * (mesuré à 390 px : adresse y=102, bouton y=161, barre de 116 px) — parce
     * que la barre est en `display: grid`, où `flex-wrap` n'a aucun effet. Une
     * règle présente n'est pas une règle qui s'applique : on vérifie donc aussi
     * le mode de disposition, sans quoi le même défaut repasserait.
     */
    expect(regle).toMatch(/display:\s*flex/u);
    expect(regle).toMatch(/flex-wrap:\s*nowrap/u);
  });

  it('pose DEUX colonnes là où la disposition est réellement décidée', () => {
    /*
     * Le bloc ci-dessus ne suffit pas : une règle de spécificité supérieure
     * impose `display: grid !important` à la barre en mobile, et elle gagne.
     * Vérifier le seul bloc compact laissait donc passer une barre sur deux
     * lignes — mesuré en production, deux fois. On vérifie ici la règle qui
     * DÉCIDE : deux colonnes, sinon la grille réempile.
     */
    /*
     * Ce sélecteur apparaît DEUX fois. Seule compte celle qui porte
     * `display: grid !important` — c'est elle qui décide, et c'est elle que le
     * premier correctif avait manquée.
     */
    const SELECTEUR = '.bolt-responsive-ide-mobile .bolt-workbench-mobile .bolt-project-webview-toolbar {';
    let bloc = '';

    for (let i = styles.indexOf(SELECTEUR); i !== -1; i = styles.indexOf(SELECTEUR, i + 1)) {
      const candidat = styles.slice(i, styles.indexOf('\n  }\n', i));

      if (/display:\s*grid\s*!important/u.test(candidat)) {
        bloc = candidat;
        break;
      }
    }

    expect(bloc, 'la règle qui impose la grille doit exister').toBeTruthy();

    expect(bloc).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/u);
  });

  it('laisse l’adresse absorber la largeur sans pousser le bouton dehors', () => {
    const bloc = blocCompact(styles);

    expect(bloc).toMatch(/\.bolt-preview-addressbar\s*\{[^}]*min-width:\s*0/u);
    expect(bloc).toMatch(/\.bolt-preview-open-external\s*\{[^}]*flex:\s*0\s+0\s+auto/u);
  });

  it('ne touche pas au bureau — la barre complète y reste', () => {
    /*
     * Le masquage est enfermé dans `max-width: 1023px`. Une règle qui fuirait
     * hors de ce bloc retirerait les outils de développement du bureau, ce que
     * la directive exclut explicitement.
     */
    const horsBloc = styles.replace(blocCompact(styles), '');

    expect(horsBloc).not.toContain('.bolt-preview-toolbar-tools > *:not(.bolt-preview-open-external)');
  });

  it('la ligne d’état de l’agent ne déborde plus sur les autres panneaux', () => {
    expect(styles).toContain(".bolt-responsive-ide-mobile:not([data-mobile-panel='chat']) .bolt-agent-statusline");
  });
});
