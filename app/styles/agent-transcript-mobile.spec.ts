import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * BUG-AGENT-UI-001 — le transcript de l'agent réservait deux fois la place du
 * composeur, sur mobile.
 *
 * Le composeur est `position: sticky` : il reste DANS le flux et occupe déjà sa
 * hauteur en tant que frère du conteneur défilant, dans la même colonne flex.
 * Lui réserver en plus sa hauteur au bas du transcript comptait l'espace deux
 * fois — et comme le transcript se recale en bas à chaque nouveau morceau
 * pendant un stream, l'utilisateur regardait surtout du vide réservé.
 *
 * Mesuré en réel (mobile 390, env de test, projet généré) :
 *
 *   avant : padding-bottom 288px → dernier texte à y = 181 px dans une fenêtre
 *           de lecture de 400 px (plus de la moitié en vide)
 *   après : padding-bottom 12px  → dernier texte à y = 468 px
 *
 * Ce test lit la feuille : c'est une règle de mise en page, il n'y a rien à
 * appeler. Il fige l'invariant « la réserve du composeur ne se cumule pas avec
 * sa hauteur réelle », pour qu'un retour de `--vc-agent-composer-reserved-space`
 * dans ce `padding-bottom` soit rattrapé au commit.
 */

const FEUILLE = new URL('./index.scss', import.meta.url).pathname;

function bloc(source: string, selecteur: string): string {
  const debut = source.indexOf(selecteur);

  expect(debut, `sélecteur introuvable : ${selecteur}`).toBeGreaterThan(-1);

  const ouvrante = source.indexOf('{', debut);
  const fermante = source.indexOf('}', ouvrante);

  return source.slice(ouvrante + 1, fermante);
}

describe('transcript de l’agent en mobile', () => {
  const source = readFileSync(FEUILLE, 'utf8');
  const regle = bloc(source, '.bolt-responsive-ide-mobile .bolt-project-agent-transcript');

  it('ne réserve pas la hauteur du composeur dans son padding-bottom', () => {
    expect(regle).toContain('padding-bottom');
    expect(regle).not.toContain('--vc-agent-composer-reserved-space');
  });

  it('garde une respiration sous le dernier message, sans la surdimensionner', () => {
    const valeur = /padding-bottom:\s*([0-9]+)px/.exec(regle)?.[1];

    expect(valeur, 'padding-bottom doit rester une valeur fixe en px').toBeDefined();
    expect(Number(valeur)).toBeGreaterThan(0);
    expect(Number(valeur)).toBeLessThanOrEqual(24);
  });

  it('laisse `scroll-padding-bottom` faire l’ancrage du défilement', () => {
    /*
     * Distinction volontaire : `scroll-padding-bottom` ne décale que la cible
     * du défilement, il n'ajoute pas de boîte vide dans la mise en page. Le
     * retirer ferait coller le dernier message au composeur quand on saute en
     * bas ; c'est bien le `padding-bottom` qui devait partir, pas lui.
     */
    const scroll = bloc(source, '.bolt-responsive-ide-mobile .bolt-project-agent-scroll');

    expect(scroll).toContain('scroll-padding-bottom');
  });
});
