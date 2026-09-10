/*
 * UNE ANNONCE N'EST PAS UNE LIVRAISON.
 *
 * Mesuré le 2026-09-10 sur les trois applications vides du 09-09 (14:27, 14:29,
 * 14:33). Leurs transcrits ne sont PAS tronqués : ils se terminent sur une
 * phrase complète, et cette phrase ANNONCE l'artefact qui ne viendra jamais.
 *
 *   « Prêt à générer l'artefact ! »
 *   « Je passe maintenant à la phase d'implémentation complète. »
 *   « Voici la base du projet parfaitement intégrée, prête pour développement. »
 *
 * 4 174, 4 379 et 4 587 caractères, zéro `<boltAction type="file">`, aucune
 * balise `</boltArtifact>`. Le tour s'est terminé sur `finishReason: 'stop'`
 * entre le préambule et l'implémentation.
 *
 * ET LA CONTINUATION NE LE RATTRAPE PAS : elle ne se déclenche que sur
 * `finishReason === 'length'`. Un tour qui s'arrête de lui-même après avoir
 * annoncé son artefact est donc compté comme une RÉUSSITE. Le serveur le
 * remarque — `warnIfNoFilesGenerated` écrit une annotation — mais il n'en tire
 * aucune conséquence, et son commentaire accuse le modèle (« model likely too
 * weak »).
 *
 * CETTE ACCUSATION EST FAUSSE, ET C'EST MESURÉ. Le même `gpt-4.1`, appelé depuis
 * le même pod de production avec la même consigne système (`getFineTunedPrompt`,
 * 27 076 caractères) et une consigne de construction de 817 caractères, écrit
 * 20 fichiers. Passé par la plateforme, il en écrit 15. Le modèle sait faire ;
 * ce qui manque, c'est de lui redonner la main quand il s'arrête trop tôt.
 */

/*
 * ⚠️ UNE RELANCE NUE NE SUFFIT PAS — MESURÉ, PAS SUPPOSÉ.
 *
 * Rejoué le 2026-09-10 sur le PRÉAMBULE RÉEL du cas fautif (4 174 caractères,
 * relu en base), avec la consigne d'Avi (6 230 caractères) et la consigne
 * système de production, appelé depuis le pod de production :
 *
 *   relance nue (`CONTINUE_PROMPT`) ....... 2 870 car., ZÉRO fichier, pas
 *                                           d'artefact — le modèle réécrit un
 *                                           préambule (« Je poursuis la
 *                                           génération… ») et s'arrête ENCORE ;
 *   relance explicite (ci-dessous) ........ 27 921 car., 13 fichiers, artefact.
 *
 * « Continue where you left off » ne dit pas au modèle que ce qu'il a laissé
 * était une ANNONCE : il annonce donc de nouveau. Brancher la continuation
 * existante sur ce cas aurait été le correctif qui a l'air juste et ne change
 * rien — un second tour facturé pour un second préambule.
 */
export const RELANCE_ARTEFACT_MANQUANT = [
  "Tu as annoncé l'artefact sans l'écrire. Passe MAINTENANT à l'implémentation :",
  'émets le <boltArtifact> avec toutes les actions <boltAction type="file"> nécessaires',
  "au démarrage de l'application. Aucun préambule, aucune explication — l'artefact seul.",
].join(' ');

export type FinDeTour = Readonly<{
  /** Raison de fin rendue par le fournisseur. */
  finishReason: string;

  /** Le tour DEMANDAIT des fichiers. */
  modeConstruction: boolean;

  /** Au moins une action de fichier a été émise pendant le tour. */
  fichierEmis: boolean;

  /** Continuations déjà consommées par ce tour. */
  segmentsConsommes: number;

  /** Plafond dur, partagé avec la continuation `length`. */
  segmentsMax: number;
}>;

export type SuiteDuTour =
  | Readonly<{ action: 'terminer' }>
  | Readonly<{ action: 'continuer'; cause: 'longueur' | 'annonce-sans-artefact'; relance: string }>
  | Readonly<{ action: 'terminer-en-echec'; cause: 'annonce-sans-artefact-plafond' }>;

/**
 * Décide de la suite d'un tour.
 *
 * Deux causes de continuation, et elles ne se confondent pas :
 *  - `longueur` : le fournisseur a été coupé net, comportement déjà géré ;
 *  - `annonce-sans-artefact` : il s'est arrêté DE LUI-MÊME sans livrer.
 *
 * Au plafond, on termine EN ÉCHEC plutôt qu'en silence : une application vide
 * présentée comme une réussite est précisément le défaut à supprimer.
 */
export function suiteDuTour(fin: FinDeTour, relanceLongueur: string): SuiteDuTour {
  if (fin.finishReason === 'length') {
    return fin.segmentsConsommes >= fin.segmentsMax
      ? { action: 'terminer' }
      : { action: 'continuer', cause: 'longueur', relance: relanceLongueur };
  }

  if (!fin.modeConstruction || fin.fichierEmis) {
    return { action: 'terminer' };
  }

  /*
   * `stop` en mode construction sans un seul fichier. On redonne la main —
   * c'est exactement ce que l'utilisateur ferait en écrivant « continue ».
   */
  if (fin.segmentsConsommes >= fin.segmentsMax) {
    return { action: 'terminer-en-echec', cause: 'annonce-sans-artefact-plafond' };
  }

  return { action: 'continuer', cause: 'annonce-sans-artefact', relance: RELANCE_ARTEFACT_MANQUANT };
}
