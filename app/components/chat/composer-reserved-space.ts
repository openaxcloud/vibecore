/**
 * Espace que le transcript doit réserver en bas, pour que défiler jusqu'au
 * dernier message ne le laisse pas passer sous le chrome permanent.
 *
 * Le chrome permanent, c'est DEUX choses et pas une : la boîte de saisie **et**
 * la barre de navigation du bas. La version précédente valait
 * `Math.round(hauteurComposer) + 16` — un padding fixe de 16 px qui n'incluait
 * pas la barre. Dès que celle-ci dépasse 16 px (elle fait 72 px, mesuré le
 * 2026-09-01), le dernier message passait dessous.
 *
 * La hauteur de la barre est MESURÉE et non supposée : elle dépend de
 * `--mobile-nav-height` mais aussi de la zone de sécurité du téléphone
 * (`env(safe-area-inset-bottom)`), qu'aucune constante ne peut deviner.
 */
export function computeComposerReservedSpace(composerHeight: number, navHeight: number): number {
  return Math.round(Math.max(0, composerHeight) + Math.max(0, navHeight));
}

/**
 * Réécrire la réserve à chaque frame ferait re-sauter le transcript pendant le
 * streaming — le « saut » qu'on cherche justement à supprimer. On ne réécrit
 * donc qu'au-delà d'un écart significatif.
 */
export function shouldRewriteReservedSpace(precedent: number, courant: number): boolean {
  return Math.abs(courant - precedent) >= 6;
}
