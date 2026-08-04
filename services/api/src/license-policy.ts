/*
 * SPDX license policy for Gallery remix (P0-V3-05, réserve #7).
 *
 * Avant ce module, `licenseId` était une chaîne libre : le système prouvait
 * « une licence a été déclarée et acceptée », PAS « cette licence autorise la
 * dérivation ». Un curateur pouvait publier `licenseId: "PROPRIETARY — NO
 * DERIVATIVES"` avec `remixAllowed: true` et tous les gates passaient.
 *
 * Ici la règle est FAIL-CLOSED et explicite : un identifiant n'autorise le
 * remix QUE s'il figure dans l'allowlist ci-dessous. Tout le reste — y compris
 * un SPDX valide mais non listé, un `LicenseRef-*`, une faute de frappe ou du
 * texte libre — est refusé. On ne devine jamais l'intention d'une licence.
 */

/**
 * Licences dont le texte accorde explicitement le droit de produire et de
 * distribuer des ŒUVRES DÉRIVÉES — ce que fait un remix.
 *
 * Deux familles :
 *  - permissives (dérivation libre, attribution le plus souvent) ;
 *  - copyleft (dérivation autorisée, mais la dérivée hérite d'obligations —
 *    c'est un problème de conformité pour le remixeur, pas une interdiction
 *    de remixer ; on autorise donc, la licence est affichée avant acceptation).
 */
const DERIVATIVE_ALLOWED_SPDX = [
  // ── permissives ──────────────────────────────────────────────────────────
  '0BSD',
  'Apache-2.0',
  'Artistic-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSD-3-Clause-Clear',
  'BSL-1.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MS-PL',
  'PostgreSQL',
  'Unlicense',
  'Zlib',

  // ── copyleft (dérivation autorisée, obligations héritées) ────────────────
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'CDDL-1.0',
  'EPL-2.0',
  'EUPL-1.2',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'MPL-2.0',

  // ── Creative Commons autorisant les dérivées ─────────────────────────────
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC-BY-SA-3.0',
  'CC-BY-SA-4.0',
] as const;

export type DerivativeAllowedLicenseId = (typeof DERIVATIVE_ALLOWED_SPDX)[number];

/**
 * Index de normalisation : SPDX est sensible à la casse en théorie, mais les
 * curateurs saisissent « mit », « Apache 2.0 », « GPL-3.0 ». On accepte une
 * forme normalisée et on renvoie l'identifiant CANONIQUE — c'est lui qui est
 * persisté, jamais la saisie brute.
 */
const CANONICAL_BY_NORMALISED = new Map<string, DerivativeAllowedLicenseId>();

function normalise(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
}

for (const id of DERIVATIVE_ALLOWED_SPDX) {
  CANONICAL_BY_NORMALISED.set(normalise(id), id);
}

/*
 * Alias tolérés vers un identifiant canonique. Strictement limité aux formes
 * ambiguës courantes ; on n'invente JAMAIS une version (« GPL-3.0 » seul est
 * ambigu entre -only et -or-later : la FSF recommande -or-later, mais deviner
 * l'intention juridique de l'auteur est exactement ce qu'on refuse de faire).
 */
const EXPLICIT_ALIASES: Record<string, DerivativeAllowedLicenseId> = {
  'apache-2': 'Apache-2.0',
  'apache-license-2.0': 'Apache-2.0',
  'bsd-2': 'BSD-2-Clause',
  'bsd-3': 'BSD-3-Clause',
  cc0: 'CC0-1.0',
  'mpl-2': 'MPL-2.0',
  'the-unlicense': 'Unlicense',
};

for (const [alias, canonical] of Object.entries(EXPLICIT_ALIASES)) {
  CANONICAL_BY_NORMALISED.set(alias, canonical);
}

/**
 * Formes explicitement NON dérivables qu'on veut nommer dans le message
 * d'erreur (meilleur diagnostic qu'un « inconnu » générique). La liste n'a
 * AUCUN rôle d'autorisation : le refus vient de l'absence dans l'allowlist.
 *
 * Note produit assumée : les variantes NonCommercial (`-NC-`) sont refusées.
 * Elles autorisent bien la dérivation, mais E-Code est une plateforme
 * commerciale — un remix y serait un usage commercial. C'est un choix, pas une
 * lecture du texte de licence.
 */
const KNOWN_NON_DERIVATIVE = [
  'all-rights-reserved',
  'proprietary',
  'cc-by-nd-4.0',
  'cc-by-nd-3.0',
  'cc-by-nc-nd-4.0',
  'cc-by-nc-nd-3.0',
  'cc-by-nc-4.0',
  'cc-by-nc-sa-4.0',
  'no-license',
  'none',
];

export interface LicenseDecision {
  /** true UNIQUEMENT si l'identifiant figure dans l'allowlist. */
  allowed: boolean;

  /** Identifiant SPDX canonique à persister (présent seulement si allowed). */
  canonicalId?: DerivativeAllowedLicenseId;

  /** Raison machine du refus — pour le code d'erreur et l'audit. */
  reason?: 'NOT_DERIVATIVE' | 'UNKNOWN_LICENSE';
}

/**
 * Décide si une licence déclarée autorise réellement le remix.
 *
 * FAIL-CLOSED : tout ce qui n'est pas dans l'allowlist est refusé, qu'il
 * s'agisse d'une licence propriétaire, d'un SPDX valide non listé, d'un
 * `LicenseRef-*` ou d'une chaîne vide.
 */
export function evaluateLicenseForRemix(rawLicenseId: string | null | undefined): LicenseDecision {
  if (!rawLicenseId || !rawLicenseId.trim()) {
    return { allowed: false, reason: 'UNKNOWN_LICENSE' };
  }

  const key = normalise(rawLicenseId);
  const canonicalId = CANONICAL_BY_NORMALISED.get(key);

  if (canonicalId) {
    return { allowed: true, canonicalId };
  }

  return {
    allowed: false,
    reason: KNOWN_NON_DERIVATIVE.includes(key) ? 'NOT_DERIVATIVE' : 'UNKNOWN_LICENSE',
  };
}

/** Liste triée des identifiants acceptés — surfacée dans les messages d'erreur et l'UI. */
export function listDerivativeAllowedLicenseIds(): readonly string[] {
  return [...DERIVATIVE_ALLOWED_SPDX];
}
