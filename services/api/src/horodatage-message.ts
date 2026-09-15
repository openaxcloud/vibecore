/*
 * HORODATAGE MONOTONE des messages de conversation.
 *
 * `AiMessage.createdAt` est un `timestamp(3)` : la milliseconde. Deux messages
 * créés dans la même milliseconde — la question et la réponse d'un tour, ou les
 * six messages d'une transcription synchronisée en rafale — portent le même
 * `createdAt`, et `ORDER BY createdAt` ne dit plus rien de leur ordre : SQL
 * rend les ex æquo dans l'ordre que le plan choisit (parcours d'index ou tri
 * instable), donc la réponse peut précéder la question au rechargement.
 *
 * Mesuré en local, API et Postgres sur la même machine : 3 transcriptions sur
 * 20 comportaient au moins deux messages à la même milliseconde. En CI, sur des
 * runners plus rapides, l'E2E de densité rougissait un run sur deux avec des
 * lignes user/assistant permutées — sans changement de code.
 *
 * Ici, chaque message reçoit un instant STRICTEMENT supérieur au précédent émis
 * par ce processus : la milliseconde courante, ou la précédente + 1 quand elles
 * se confondent. Une rafale de N messages avance l'horloge de N ms au plus.
 */
let dernierInstant = 0;

export function horodatageMessageMonotone(maintenant: () => number = Date.now): Date {
  dernierInstant = Math.max(maintenant(), dernierInstant + 1);

  return new Date(dernierInstant);
}

/** Pour les tests : repart d'une horloge vierge. */
export function reinitialiserHorodatageMessage(): void {
  dernierInstant = 0;
}
