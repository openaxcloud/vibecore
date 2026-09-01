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
