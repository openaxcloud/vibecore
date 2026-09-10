import type { CibleDeReparation, DemandeDeReparation } from './PublicationReplit';

/*
 * BUG-PUBLISH-REPARER-CIBLE-001 — « Réparer dans une nouvelle tâche » ouvrait
 * la conversation COURANTE, exactement comme « Réparer dans la conversation ».
 *
 * Le menu passait bien sa cible ; l'hôte n'avait qu'un paramètre et la laissait
 * tomber sans un mot (bivariance des paramètres — voir `PublicationReplit`).
 * Les deux entrées du menu étaient donc, à l'exécution, le MÊME bouton.
 *
 * Ce module tient les deux décisions que le monolithe prenait en ligne, pour
 * qu'un test puisse les EXÉCUTER plutôt que les relire (règle 15) :
 *   - ce qu'on met dans l'événement `vibecore:agent-task` ;
 *   - ce qu'on fait en le recevant.
 */

export const TACHE_DE_REPARATION = 'fix-publication';

export interface DetailDeTacheDeReparation {
  kind: typeof TACHE_DE_REPARATION;
  prompt: string;
  cible: CibleDeReparation;
}

/** Ce que le panneau Déploiements dépose dans l'événement, cible comprise. */
export function detailDeTacheDeReparation(demande: DemandeDeReparation): DetailDeTacheDeReparation {
  return {
    kind: TACHE_DE_REPARATION,
    prompt: demande.invite,
    cible: demande.cible,
  };
}

export type GesteDeLancement = 'composeur' | 'fil-neuf' | 'envoyer';

/**
 * Ce que l'hôte fait d'une invite reçue.
 *
 * `composeur` — on dépose l'invite sans l'envoyer : soit l'envoi n'existe pas
 * (le composant sert aussi hors IDE), soit un tour est DÉJÀ en vol et le
 * doubler produirait deux générations concurrentes sur le même fil.
 *
 * `fil-neuf` — on archive la conversation courante et on envoie dans le fil
 * vidé. C'est la seule branche qui distingue « nouvelle tâche » de « dans la
 * conversation » ; sans elle les deux entrées du menu sont identiques.
 *
 * `envoyer` — on envoie dans le fil courant.
 */
export function gesteDeLancementDeLAgent(entree: {
  cible?: string | null;
  peutEnvoyer: boolean;
  tourEnCours: boolean;
  peutOuvrirUnFilNeuf: boolean;
}): GesteDeLancement {
  if (!entree.peutEnvoyer || entree.tourEnCours) {
    return 'composeur';
  }

  if (entree.cible === 'tache' && entree.peutOuvrirUnFilNeuf) {
    return 'fil-neuf';
  }

  return 'envoyer';
}
