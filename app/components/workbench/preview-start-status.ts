/*
 * Statut affiché quand on lance l'aperçu.
 *
 * `workbenchStore.startPreviewServer()` rend DEUX sortes de chaînes : le
 * libellé de la commande lancée (« pnpm dev ») — à envelopper dans
 * « Démarrage de {label}… » — ou une phrase de statut déjà complète quand
 * rien n'est lancé (« Démarrage de l’aperçu », « Serveur d’aperçu
 * reconnecté », « Aperçu HTML statique »). Envelopper une phrase donnait
 * « Démarrage de Démarrage de l’aperçu… » — capture iPhone d'Avi, 05/09
 * 23:05 (BUG-PREVIEW-COPY-001).
 *
 * Le magasin enregistre la commande lancée dans `previewServerState.command` :
 * c'est le seul critère fiable pour distinguer les deux.
 */
export function previewStartStatus(
  label: string,
  runningCommand: string | undefined,
  wrapCommand: (label: string) => string,
): string {
  return runningCommand !== undefined && label === runningCommand ? wrapCommand(label) : label;
}
