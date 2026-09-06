/**
 * Recouvrement bas du navigateur — la grandeur qu'`env(safe-area-inset-bottom)`
 * ne donne pas.
 *
 * Sur iOS, la barre d'outils de Safari recouvre le bas de la fenêtre de MISE EN
 * PAGE. Un panneau en `position: fixed` ancré à
 * `bottom: calc(nav + env(safe-area-inset-bottom))` se place donc SOUS elle, et
 * `env(safe-area-inset-bottom)` vaut 0 tant que la barre est affichée : ce n'est
 * pas une encoche, c'est du chrome de navigateur.
 *
 * La seule grandeur qui le décrit est l'écart entre la fenêtre de mise en page
 * et la fenêtre VISUELLE.
 */
export function recouvrementBasDuNavigateur(
  hauteurMiseEnPage: number,
  vue: { height: number; offsetTop: number } | undefined,
): number {
  if (!vue) {
    return 0;
  }

  return Math.max(0, hauteurMiseEnPage - vue.height - vue.offsetTop);
}

/*
 * Le clavier logiciel est la seule chose qui reprenne PLUS de 150 px au bas
 * de la fenêtre : la barre d'outils de Safari en prend 44 à 84. Captures
 * iPhone d'Avi, 06/09 11:04 : clavier levé, le composeur restait posé 90 px
 * au-dessus de lui — il réservait la place du socle, passé SOUS le clavier —
 * et sur l'état de départ le socle flottait au-dessus du clavier pendant que
 * le composeur était hors de vue. Quand le clavier est là, le socle n'y est
 * plus : le composeur se colle au clavier.
 */
export const SEUIL_CLAVIER_PX = 150;

export function clavierProbablementOuvert(recouvrementBas: number): boolean {
  return recouvrementBas >= SEUIL_CLAVIER_PX;
}
