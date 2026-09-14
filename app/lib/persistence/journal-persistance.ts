/**
 * LE JOURNAL QUI NOMMERA LE COUPABLE.
 *
 * Mesuré en production les 07 et 08/09/2026 : sur onze projets, les caractères
 * persistés sont sans commune mesure avec les jetons de sortie facturés. Le pire
 * cas — `creez-une-pwa-de-fitness` — a **185 343 jetons de sortie** au registre
 * de coûts et **762 caractères** en base : aucun ratio caractère/jeton
 * n'explique ça, il en manque plus de 99 %.
 *
 * La transcription est persistée pendant le flux par `drainPendingSaves` :
 *
 *     await storeMessageHistory(snapshot);        // écriture LOCALE, attendue
 *     void syncProjectAiTranscript(snapshot, …);  // écriture DURABLE, non attendue
 *
 * Deux hypothèses produisent EXACTEMENT le même profil observable, et rien dans
 * les journaux actuels ne les sépare :
 *
 *   1. la première ne se résout jamais — la boucle ne repart pas, le verrou de
 *      passage unique reste fermé, plus aucune synchronisation n'a lieu ;
 *   2. la seconde est en `void` — personne n'attend son résultat, personne
 *      n'apprend son rejet.
 *
 * Une troisième reste ouverte depuis que j'ai corrigé une inférence trop rapide :
 * le parseur consomme bien le flux (il écrit les fichiers), mais cela ne prouve
 * PAS que `message.content` s'accumule. Si la longueur transportée plafonne
 * pendant que le flux continue, la perte est à l'ASSEMBLAGE, pas à l'écriture.
 *
 * Ce journal tranche les trois en nommant, à chaque tour : le RANG de l'appel,
 * la CIBLE, la LONGUEUR transportée, et l'issue — entrée, sortie, rejet — avec
 * sa durée. Une entrée sans sortie est un blocage ; un rejet est un échec
 * silencieux ; une longueur qui plafonne est un défaut d'assemblage.
 *
 * Épinglé par `app/lib/persistence/journal-persistance.spec.ts` — une preuve live vaut pour le jour
 * où elle a été prise ; un test vaut pour tous les jours suivants.
 */

export type CiblePersistance = 'local' | 'serveur';
export type EtapePersistance = 'entree' | 'sortie' | 'rejet';

export interface TourDePersistance {
  rang: number;
  cible: CiblePersistance;
  etape: EtapePersistance;

  /** Somme des caractères de contenu du fil transporté à ce tour. */
  caracteres: number;
  messages: number;
  dureeMs?: number;
  erreur?: string;
}

/** Somme des contenus — c'est CE nombre qui doit croître avec le flux. */
export function caracteresDuFil(messages: ReadonlyArray<{ content?: string | null }>): number {
  return messages.reduce((total, message) => total + (message.content?.length ?? 0), 0);
}

/**
 * Une ligne JSON par tour. Le préfixe `persistance.tour` est le motif à filtrer
 * dans les journaux du pod web ; il ne doit pas changer sans mettre à jour la
 * consigne d'analyse.
 */
export function evenementPersistance(tour: TourDePersistance): string {
  return JSON.stringify({ event: 'persistance.tour', ...tour });
}
