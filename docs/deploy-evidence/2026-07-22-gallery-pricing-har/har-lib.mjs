// P0-LS-13 — fonctions PURES fail-closed, partagées par capture-har.mjs et verify-har.mjs
// (testées négativement dans verify-har.mjs).

// Liaison cookie : VRAI seulement si les DEUX empreintes existent (non nulles) ET sont égales.
// L'égalité de deux valeurs absentes ne prouve RIEN → false.
export function sameValueCarried(valueHashSet, valueHashSent) {
  if (valueHashSet == null || valueHashSent == null) return false;
  if (typeof valueHashSet !== 'string' || typeof valueHashSent !== 'string') return false;
  if (valueHashSet.length === 0 || valueHashSent.length === 0) return false;
  return valueHashSet === valueHashSent;
}

// Normalisation d'URL pour comparaison EXACTE (host + pathname sans slash final ; sans query/hash).
export function normalizeUrl(u) {
  const url = new URL(u);
  let path = url.pathname.replace(/\/+$/, '');
  if (path === '') path = '/';
  return `${url.protocol}//${url.host}${path}`;
}

// Garde de navigation fail-closed : lève sur statut ≠ 200 ou URL finale inattendue.
export function assertOkNav({ key, status, finalUrl, expectedUrl }) {
  if (status !== 200) throw new Error(`[${key}] statut HTTP ${status} ≠ 200 — navigation refusée (fail-closed)`);
  const got = normalizeUrl(finalUrl), want = normalizeUrl(expectedUrl);
  if (got !== want) throw new Error(`[${key}] URL finale inattendue: ${got} ≠ ${want} (fail-closed)`);
  return true;
}
