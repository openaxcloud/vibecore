/**
 * UNE ÉCRITURE NE DOIT JAMAIS RACCOURCIR UN MESSAGE DÉJÀ PERSISTÉ.
 *
 * Mesuré en production le 2026-09-08 sur `cmtt810ag00040nah6wkh8z1x` :
 *
 *   22:08:32 → 22:12:48   60 synchronisations `PUT /transcript`, toutes les 2-5 s
 *   22:12:48.869          DERNIÈRE — 84 s avant la fin du flux
 *   22:13:35              le client écrit encore des fichiers
 *   22:14:12              fin du flux, finishReason=stop, 83 703 caractères produits
 *   → en base : 37 611 caractères, soit 45 %
 *
 * La transcription est persistée PROGRESSIVEMENT pendant le flux, en `upsert`
 * sur un identifiant stable : la base garde donc le dernier instantané reçu.
 * Quand la synchronisation s'arrête avant la fin, le message reste tronqué.
 *
 * Ce module ne corrige pas cette perte — il empêche qu'elle s'AGGRAVE.
 *
 * Mesuré le même jour à 22:44:49 : en rouvrant le projet, le client a chargé la
 * version tronquée depuis le serveur et l'a RÉÉCRITE telle quelle. La moitié
 * perdue devient alors irrécupérable, et un utilisateur qui rouvre son projet
 * pour comprendre ce qui s'est passé détruit ce qu'il en restait.
 *
 * LA RÈGLE EST UN PRÉFIXE, PAS UNE LONGUEUR.
 *
 * Refuser toute écriture plus courte casserait une régénération : une réponse
 * refaite peut légitimement être plus brève. Mais un instantané périmé du MÊME
 * message est toujours un PRÉFIXE de ce qui est déjà stocké — c'est la
 * signature exacte du défaut, et elle ne peut pas confondre les deux cas.
 */

export interface DecisionEcriture {
  ecrire: boolean;

  /** Renseigné quand l'écriture est refusée, pour le journal. */
  raison?: 'instantane-perime';
  perdus?: number;
}

export function decisionEcritureMessage(existant: string | null | undefined, entrant: string): DecisionEcriture {
  if (!existant) {
    return { ecrire: true };
  }

  const plusCourt = entrant.length < existant.length;

  if (plusCourt && existant.startsWith(entrant)) {
    return { ecrire: false, raison: 'instantane-perime', perdus: existant.length - entrant.length };
  }

  return { ecrire: true };
}
