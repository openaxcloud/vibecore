import type { PreviewInfo } from './previews';
import type { ActionAlert } from '~/types/actions';

/*
 * BUG-UX-PREVIEW-ERROR-STICKY — la carte « Erreur d'aperçu / Une erreur est
 * survenue pendant l'exécution de l'aperçu » restait affichée même après que
 * l'aperçu s'était réparé et rendait l'app : `actionAlert` n'était effacé QUE
 * par le clic « Fermer » (workbench.clearAlert), jamais par la guérison.
 *
 * La règle est volontairement un FRONT (unhealthy → healthy), pas un niveau :
 *  - une alerte `source: 'preview'` posée pendant que l'aperçu était cassé est
 *    retirée au moment précis où un port sert à nouveau (l'app est revenue) ;
 *  - une alerte posée alors que l'aperçu est DÉJÀ sain (fichier verrouillé,
 *    diff refusé — elles partagent `source: 'preview'`) n'est PAS balayée,
 *    puisqu'aucun front sain ne se produit : on ne cache jamais une erreur
 *    encore d'actualité.
 */

/** Un aperçu est sain quand au moins un port forwardé répond (`ready`). */
export function isPreviewHealthy(previews: readonly PreviewInfo[]): boolean {
  return previews.some((preview) => preview.ready === true);
}

/** Vrai uniquement sur le front malade → sain, et seulement pour une alerte d'aperçu. */
export function shouldAutoDismissPreviewAlert({
  wasHealthy,
  isHealthy,
  alert,
}: {
  wasHealthy: boolean;
  isHealthy: boolean;
  alert: ActionAlert | undefined;
}): boolean {
  return !wasHealthy && isHealthy && alert?.source === 'preview';
}
