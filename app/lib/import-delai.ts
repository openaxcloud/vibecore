/*
 * BUG-CREATE-005 — « l'import GitHub échoue au bout de 3 minutes sur un message
 * générique » : « Impossible d'importer le dépôt. Réessayez. »
 *
 * LE CHEMIN RÉEL, MESURÉ (règle 1). J'ai d'abord corrigé le classement des
 * échecs de `git clone` côté serveur — utile, mais ce n'était PAS le chemin que
 * l'utilisateur empruntait. Le voici, bout à bout :
 *
 *   1. `apiRequest` (`app/lib/enterprise-api.server.ts`) pose
 *      `signal: fetchInit.signal ?? AbortSignal.timeout(30_000)` ;
 *   2. les deux routes d'import ne passaient AUCUN signal — elles héritaient
 *      donc des 30 secondes ;
 *   3. le serveur, lui, laisse `git clone` tourner jusqu'à **120 secondes**
 *      (`services/api/src/project-storage.ts`, `timeout: 120_000`).
 *
 * Le client raccrochait donc AVANT que le serveur ait fini, sur tout dépôt qui
 * demande plus de trente secondes — c'est-à-dire la plupart. Et comme un abandon
 * de `fetch` ne rend pas une `Response` mais une `DOMException`, aucune des
 * branches `isApiResponse(...)` ne l'attrapait : l'exécution tombait sur la
 * branche par défaut, `actionError('importFailed', 500)`. Ce qui produit
 * EXACTEMENT le symptôme relevé à l'inventaire : `500` sur
 * `/import-github.data`, `errorCode: importFailed`, « Réessayez. »
 *
 * FORME MESURÉE de l'abandon (règle 11) — node de ce conteneur, le 2026-09-10,
 * `fetch` vers un serveur qui ne répond jamais, `AbortSignal.timeout(200)` :
 *   `DOMException { name: 'TimeoutError', code: 23 }`, et
 *   `erreur instanceof Response === false`.
 */

/**
 * Budget client d'une requête d'import.
 *
 * 170 s, choisi entre deux bornes mesurées et non l'inverse :
 *   • plancher — les 120 s de `git clone` côté serveur, plus l'écriture des
 *     fichiers et la création du projet ;
 *   • plafond — `proxy-read-timeout: 180` sur l'ingress
 *     (`infra/helm/platform/values-prod.yaml`). Au-delà, c'est nginx qui coupe
 *     et un budget plus grand ne servirait à rien.
 */
export const IMPORT_REQUEST_TIMEOUT_MS = 170_000;

/**
 * Reconnaît un abandon côté CLIENT (le budget ci-dessus, ou une annulation).
 *
 * À ne pas confondre avec un 504 rendu par le serveur : celui-là arrive comme
 * une `Response` et se lit par son statut. Ici il n'y a pas de réponse du tout —
 * c'est nous qui avons raccroché.
 */
export function estAbandonDeRequete(erreur: unknown): boolean {
  if (erreur instanceof Response) {
    return false;
  }

  const nom = (erreur as { name?: unknown } | null | undefined)?.name;

  return nom === 'TimeoutError' || nom === 'AbortError';
}
