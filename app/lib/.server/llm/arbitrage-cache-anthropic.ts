/*
 * QUI DÉCIDE DE CE QUI EST FACTURÉ : LES MÉTADONNÉES, OU LE FIL.
 *
 * Deux sources rapportent les jetons de cache Anthropic, et une seule doit
 * compter :
 *
 *  - LES MÉTADONNÉES du SDK (`providerMetadata` → `accumulateCacheUsage`) ;
 *  - LE FIL, relevé par notre lecteur SSE et accumulé hors bande
 *    (`anthropic-cache-als`), parce que `@ai-sdk/anthropic@0.0.39` ne rapportait
 *    RIEN — mesuré le 2026-09-10 : `cache_read_input_tokens` = 0 occurrence dans
 *    son bundle, `providerMetadata` = 0.
 *
 * CE QUI CHANGE AVEC `1.2.12`, ET POURQUOI CE FICHIER EXISTE. La même mesure sur
 * `1.2.12` rend `cache_read_input_tokens` = 4, `cacheReadInputTokens` = 2,
 * `providerMetadata` = 16 : le SDK rapporte désormais, et `accumulateCacheUsage`
 * connaît déjà ces deux noms de champs.
 *
 * Les deux sources vont donc parler en même temps. L'arbitrage était déjà JUSTE —
 * il AFFECTE au lieu d'additionner, et seulement si les métadonnées se sont tues
 * — mais il n'était tenu par AUCUN test, alors qu'il décide de ce qui apparaît
 * sur la facture d'un client. C'est la seule raison de l'extraire : le rendre
 * épinglable.
 *
 * ⚠️ Ne PAS retirer le relevé du fil « puisque le SDK rapporte maintenant ». Il
 * reste le repli quand les métadonnées sont muettes — un fournisseur compatible
 * OpenAI, une réponse sans métadonnées, une version en arrière. Le retirer
 * casserait ce qu'il protège, et rien ne l'annonce.
 */

export type TotauxDeCache = Readonly<{ cachedPromptTokens: number; cacheWriteTokens: number }>;

export type ReleveDuFil = Readonly<{ read: number; write: number }> | undefined;

/**
 * Rend les totaux à facturer.
 *
 * Règle unique : **les métadonnées gagnent dès qu'elles ont parlé.** Le relevé du
 * fil ne sert que si elles se sont tues sur les DEUX compteurs, et il remplace —
 * il n'ajoute jamais.
 */
export function arbitrerCacheAnthropic(metadonnees: TotauxDeCache, fil: ReleveDuFil): TotauxDeCache {
  const metadonneesOntParle = metadonnees.cachedPromptTokens !== 0 || metadonnees.cacheWriteTokens !== 0;

  if (metadonneesOntParle) {
    return metadonnees;
  }

  if (!fil || (fil.read === 0 && fil.write === 0)) {
    return metadonnees;
  }

  return { cachedPromptTokens: fil.read, cacheWriteTokens: fil.write };
}
