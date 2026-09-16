/*
 * Décision : ce créneau de quota « espace de travail actif » doit-il être rendu ?
 *
 * Le quota compte les enregistrements PENDING / STARTING / RUNNING. Un espace
 * de travail qui n'a jamais fini de démarrer restait donc compté pour toujours.
 * Sur une offre gratuite (limite : 1) cela rend morte la création de TOUT autre
 * projet — mesuré sur l'environnement d'audit : `ws-4cd306324217d298` est resté
 * PENDING dix minutes, et chaque projet créé ensuite recevait
 * `429 QUOTA_EXCEEDED` au démarrage de son runtime, avec pour seul symptôme
 * visible un IDE sans aperçu et sans message.
 *
 * La règle est volontairement asymétrique : on ne libère JAMAIS un RUNNING. Un
 * pod qui sert réellement ne peut pas être invalidé par une borne de temps ;
 * seul un démarrage qui n'aboutit pas peut l'être.
 */

/** Statut renvoyé par le workspace-manager, tel quel. */
export type ManagerWorkspaceState = { status?: string; updatedAt?: string };

export type SlotDecision = 'free' | 'keep';

export function decideWorkspaceSlot(
  etat: ManagerWorkspaceState | undefined,
  options: { now: number; deadlineMs: number },
): SlotDecision {
  /*
   * Statut absent = information manquante, pas information négative. On garde le
   * créneau : se tromper ici reviendrait à déclarer mort un espace de travail
   * bien vivant et à laisser l'organisation dépasser sa limite réelle.
   */
  if (!etat?.status) {
    return 'keep';
  }

  const statut = String(etat.status).toUpperCase();

  if (!['RUNNING', 'STARTING', 'PENDING'].includes(statut)) {
    return 'free';
  }

  if (statut === 'RUNNING') {
    return 'keep';
  }

  const misAJour = Date.parse(String(etat.updatedAt ?? ''));

  if (!Number.isFinite(misAJour)) {
    return 'keep';
  }

  return options.now - misAJour > options.deadlineMs ? 'free' : 'keep';
}
