/*
 * Garde-fou de délai pour les appels au stockage objet.
 *
 * Le client GCS réessaie sans plafond utile : quand le bucket est injoignable,
 * l'appel ne rend jamais la main. Mesuré sur l'environnement d'audit, une
 * lecture de vignette tenait la requête jusqu'à ce que le loader Remix
 * abandonne au bout de 30 s (502) — et pendant tout ce temps la carte de projet
 * affichait un rectangle vide, puisque l'`<img>` ne se charge pas mais n'échoue
 * pas non plus : son état de repli « Aucun aperçu » n'apparaissait jamais.
 *
 * Ce module ne sert QUE les lectures décoratives, celles dont l'absence est un
 * état d'affichage acceptable. Les écritures (upload, suppression) doivent
 * garder leur comportement d'origine : les tronquer transformerait une lenteur
 * en perte de données silencieuse.
 */

/** Délai au-delà duquel une vignette est considérée comme indisponible. */
export const THUMBNAIL_LOOKUP_DEADLINE_MS = 5_000;

export class StorageDeadlineError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Object storage call exceeded ${timeoutMs}ms`);
    this.name = 'StorageDeadlineError';
  }
}

/**
 * Rend le résultat de `promise`, ou lève `StorageDeadlineError` au bout de
 * `timeoutMs`. La promesse d'origine continue sa vie : on ne peut pas annuler
 * l'appel GCS, on cesse seulement de l'attendre. Son rejet éventuel est absorbé
 * pour ne pas produire de rejet non géré une fois le délai écoulé.
 */
export async function withStorageDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let minuterie: ReturnType<typeof setTimeout> | undefined;

  const echeance = new Promise<never>((_resolve, reject) => {
    minuterie = setTimeout(() => reject(new StorageDeadlineError(timeoutMs)), timeoutMs);
  });

  promise.catch(() => {
    /* absorbé : le rejet est déjà remonté par `Promise.race` si l'appel a gagné */
  });

  try {
    return await Promise.race([promise, echeance]);
  } finally {
    clearTimeout(minuterie);
  }
}
