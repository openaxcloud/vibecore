/*
 * BUG-CREATE-005 — « l'import GitHub échoue au bout de 3 minutes sur un message
 * générique » : « Impossible d'importer le dépôt. Réessayez. »
 *
 * MESURÉ : la route `POST /orgs/:orgId/projects/import/github` appelait
 * `gitProvider.importRepository(...)` SANS `try`. Tout échec de clone — dépôt
 * privé, hôte injoignable, délai de 120 s dépassé — remontait donc en 500
 * générique, et l'interface rendait le même message dans tous les cas.
 *
 * L'utilisateur ne pouvait pas savoir s'il devait corriger l'URL, s'authentifier,
 * ou simplement réessayer. « Réessayez » sur un dépôt privé est un conseil faux.
 *
 * ⚠️ CE QUI NE DOIT JAMAIS SORTIR D'ICI : le `stderr` de `git`. Un clone porte
 * l'URL du dépôt, et une URL de clone porte parfois un jeton
 * (`https://x-access-token:<jeton>@github.com/...`). Ce module rend un CODE et
 * rien d'autre — jamais le message brut (règle 12).
 */

/** Ce qu'on peut dire d'un échec de clone sans rien faire fuir. */
export interface EchecDImport {
  statusCode: number;

  /** Code d'état stable, lu par l'interface pour choisir sa phrase. */
  code: 'IMPORT_REPOSITORY_UNREACHABLE' | 'IMPORT_CLONE_TIMEOUT' | 'IMPORT_UPSTREAM_UNREACHABLE' | 'IMPORT_FAILED';
}

/*
 * Les signatures viennent des messages de `git` lui-même. Elles sont comparées
 * en minuscules pour ne pas dépendre de la casse d'une version.
 */
const DEPOT_INTROUVABLE = [
  'repository not found',
  'could not read username',
  'authentication failed',
  'remote: not found',
  'permission denied',
  'access denied',

  /*
   * Un dépôt privé rend un code HTTP, pas une phrase : `git` l'enveloppe alors
   * dans « unable to access … : The requested URL returned error: 403 ». Sans
   * ces trois signatures, cette phrase tombait dans AMONT_INJOIGNABLE plus bas
   * (« unable to access ») et un problème d'AUTORISATION se serait annoncé
   * comme une panne d'hébergeur — le conseil exactement inverse.
   */
  'returned error: 401',
  'returned error: 403',
  'returned error: 404',
];

const AMONT_INJOIGNABLE = [
  'could not resolve host',
  'failed to connect',
  'unable to access',
  'connection timed out',
  'network is unreachable',
];

/**
 * Classe un échec de clone en statut HTTP + code stable.
 *
 * Un délai dépassé est reconnu par les marqueurs que `child_process` pose
 * lui-même (`killed`, `signal: 'SIGTERM'`, `code: 'ETIMEDOUT'`) et non par le
 * texte : c'est le seul signal fiable, `git` ne disant rien de particulier quand
 * on le tue.
 *
 * FORMES MESURÉES (règle 11) — `promisify(execFile)`, node de ce conteneur,
 * script `mesure-execfile.mjs`, le 2026-09-10 :
 *   • délai dépassé  → `{ killed: true, signal: 'SIGTERM', code: null }` ;
 *   • hôte injoignable → `{ killed: false, signal: null, code: 128,
 *     stderr: "fatal: unable to access '…': CONNECT tunnel failed…" }`.
 * `code` vaut donc un NOMBRE sur un échec de `git` : la comparaison à la chaîne
 * `'ETIMEDOUT'` ci-dessous ne peut pas le happer par accident.
 */
export function classerEchecDImport(erreur: unknown): EchecDImport {
  const objet = (erreur ?? {}) as { killed?: unknown; signal?: unknown; code?: unknown; stderr?: unknown; message?: unknown };

  if (objet.killed === true || objet.signal === 'SIGTERM' || objet.code === 'ETIMEDOUT') {
    return { statusCode: 504, code: 'IMPORT_CLONE_TIMEOUT' };
  }

  const texte = `${typeof objet.stderr === 'string' ? objet.stderr : ''} ${
    typeof objet.message === 'string' ? objet.message : ''
  }`.toLowerCase();

  if (DEPOT_INTROUVABLE.some((signature) => texte.includes(signature))) {
    return { statusCode: 404, code: 'IMPORT_REPOSITORY_UNREACHABLE' };
  }

  if (AMONT_INJOIGNABLE.some((signature) => texte.includes(signature))) {
    return { statusCode: 502, code: 'IMPORT_UPSTREAM_UNREACHABLE' };
  }

  /*
   * Rien de reconnu : on garde le 500 d'avant plutôt que d'inventer une cause.
   * Un code faux est pire qu'un code générique — il envoie chercher au mauvais
   * endroit.
   */
  return { statusCode: 500, code: 'IMPORT_FAILED' };
}
