/**
 * Cible de portail des feuilles du composeur sur téléphone.
 *
 * Les menus « Agent / Assistant » et « Léger / Économique / Puissance » se
 * rendent DANS le composeur, puis une règle mobile les pose en `position:
 * fixed` pour en faire des feuilles au-dessus de la barre du bas. Or, entre
 * le composeur et l'écran, plusieurs ancêtres bornent un élément fixé : la
 * colonne du panneau porte `container-type: inline-size` (confinement de
 * mise en page, donc bloc conteneur des descendants fixés), le composeur est
 * collant avec son propre contexte d'empilement, le fil défile avec
 * `overflow`. Chromium replace la feuille où on l'attend ; sur l'iPhone
 * d'Avi, elle restait derrière le composeur — « quand on ouvre le menu on
 * voit rien » (06/09, 17:57), la capture montrant « Turbo … Coût estimé »
 * grisés sous le fil.
 *
 * Le remède est de rendre la feuille HORS de cette chaîne, à la racine du
 * gabarit mobile : même écran, mêmes règles (`.bolt-responsive-ide-mobile`
 * reste un ancêtre), mais plus aucun ancêtre qui la borne. Sur bureau, les
 * menus restent ancrés à leur déclencheur : pas de portail.
 */

export const SELECTEUR_RACINE_MOBILE = '.bolt-responsive-ide-mobile';

export function cibleFeuilleMobile(racine: ParentNode | null | undefined): HTMLElement | null {
  if (!racine || typeof racine.querySelector !== 'function') {
    return null;
  }

  return racine.querySelector<HTMLElement>(SELECTEUR_RACINE_MOBILE);
}
