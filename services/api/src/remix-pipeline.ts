/**
 * Secure project remix pipeline (DOMAIN_MODEL §1).
 *
 * NORMATIVE state machine — the order is a SECURITY property, not a convenience:
 *
 *   PENDING → SNAPSHOT_PINNED → CREDENTIALS_DETACHED → SOURCE_SANITIZED
 *     → CLONING → SCANNING → STORAGE_PINNED → STORAGE_POLICY_APPLIED
 *     → DATABASE_PINNED → DB_FORKING → INDEXING → COMPLETED
 *
 * Hard invariants:
 *  - I-RMX-1: a secret VALUE never enters either the immutable source pin or
 *    the clone artifact. Secrets are references (keys only).
 *    `CREDENTIALS_DETACHED` records the source's secret KEYS; the pin and clone
 *    retain only empty-valued references, never the values.
 *  - I-RMX-2: `CREDENTIALS_DETACHED` is a hard precondition of `CLONING`. The
 *    reverse order is a design defect and is rejected here (advance() throws).
 *  - I-RMX-6 (SCANNING): the cloned artifact is scanned for any MATERIALIZED
 *    source secret value (e.g. a `.env` committed into the workspace files). A
 *    hit fails the remix — the scan must actively look for the secret and find
 *    nothing.
 *  - I-RMX-3 (SOURCE_SANITIZED, P0-V3-05): PII in the source files is MASKED
 *    before cloning, unless the source author gave an explicit, versioned
 *    consent to share it. Findings record {path, kind, line} — never the value.
 *    License + consent are versioned: the remix job pins the license text
 *    sha256 and the consent-text version the remixer accepted.
 *
 * This module is PURE (no DB, no I/O) so the security core is unit-testable in
 * isolation. The endpoint (`app.ts`) drives it against the real store.
 */

export type RemixState =
  | 'PENDING'
  | 'SNAPSHOT_PINNED'
  | 'CREDENTIALS_DETACHED'
  | 'SOURCE_SANITIZED'
  | 'CLONING'
  | 'STORAGE_PINNED'
  | 'STORAGE_POLICY_APPLIED'
  | 'SCANNING'
  | 'DATABASE_PINNED'
  | 'DB_FORKING'
  | 'INDEXING'
  | 'COMPLETED'
  | 'CLEANUP_PENDING'
  | 'FAILED';

/** The normative forward order. FAILED is reachable from any non-terminal state. */
export const REMIX_STATE_ORDER: RemixState[] = [
  'PENDING',
  'SNAPSHOT_PINNED',
  'CREDENTIALS_DETACHED',
  'SOURCE_SANITIZED',
  'CLONING',
  'SCANNING',
  'STORAGE_PINNED',
  'STORAGE_POLICY_APPLIED',
  'DATABASE_PINNED',
  'DB_FORKING',
  'INDEXING',
  'COMPLETED',
];

/**
 * Version of the remix consent text a remixer accepts (license terms + PII
 * handling disclosure). Bump when the consent WORDING changes — every RemixJob
 * records the version that was actually accepted, never "latest".
 */
export const REMIX_CONSENT_VERSION = '2026-07-20.1';

/** Versioned disclosure for a live, read-only object-storage share. */
export const REMIX_STORAGE_CONSENT_VERSION = '2026-08-26.1';

/** App-storage handling at remix time. Bucket is per-project (`vc-<projid>`). */
export type RemixStoragePolicy = 'DETACH' | 'CLONE' | 'SHARE_WITH_CONSENT';

export const REMIX_STORAGE_POLICIES: RemixStoragePolicy[] = ['DETACH', 'CLONE', 'SHARE_WITH_CONSENT'];

export class RemixInvariantError extends Error {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'RemixInvariantError';
  }
}

/**
 * Validate a single forward transition. Enforces the normative order and the
 * CREDENTIALS_DETACHED-before-CLONING invariant explicitly (I-RMX-2). Throws
 * {@link RemixInvariantError} on an illegal transition.
 */
export function assertRemixTransition(from: RemixState, to: RemixState): void {
  if (to === 'CLEANUP_PENDING' && from !== 'COMPLETED' && from !== 'FAILED') {
    return;
  }

  if (to === 'FAILED') {
    return; // any non-terminal state may fail
  }

  if (from === 'COMPLETED' || from === 'FAILED' || from === 'CLEANUP_PENDING') {
    throw new RemixInvariantError(`Cannot transition out of terminal state ${from}`, 'REMIX_TERMINAL_STATE');
  }

  const fromIndex = REMIX_STATE_ORDER.indexOf(from);
  const toIndex = REMIX_STATE_ORDER.indexOf(to);

  if (fromIndex < 0 || toIndex < 0) {
    throw new RemixInvariantError(`Unknown remix state ${from}→${to}`, 'REMIX_UNKNOWN_STATE');
  }

  if (toIndex !== fromIndex + 1) {
    // The security-critical case gets its own explicit, loud error.
    if (to === 'CLONING' && from !== 'CREDENTIALS_DETACHED') {
      throw new RemixInvariantError(
        'CLONING requires CREDENTIALS_DETACHED first — cloning with credentials attached is a design defect.',
        'REMIX_CLONE_BEFORE_DETACH',
      );
    }

    throw new RemixInvariantError(
      `Illegal remix transition ${from}→${to} (must be sequential)`,
      'REMIX_BAD_TRANSITION',
    );
  }
}

export interface DetachedCredentials {
  /** Secret keys carried as REFERENCES only (from ProjectSecret). Values excluded. */
  secretKeys: string[];

  /** Env-var keys carried as references (from ProjectEnvVar, whose value is plaintext). */
  envVarKeys: string[];
}

/**
 * CREDENTIALS_DETACHED: reduce the source's secrets + env-vars to their KEYS.
 * The returned object is safe to persist onto the remix job and to seed onto the
 * clone — it contains no value, encrypted or plaintext.
 */
export function detachCredentials(
  sourceSecrets: Array<{ key: string }>,
  sourceEnvVars: Array<{ key: string }>,
): DetachedCredentials {
  const secretKeys = [...new Set(sourceSecrets.map((s) => s.key))].sort();
  const envVarKeys = [...new Set(sourceEnvVars.map((v) => v.key))].sort();

  return { secretKeys, envVarKeys };
}

export interface RemixFile {
  path: string;
  content: string;
  encoding?: string;
}

export interface SecretScanFinding {
  path: string;

  /** The secret KEY whose value was found materialized (never the value itself). */
  secretKey: string;

  /** 1-indexed line where the value appears. */
  line: number;
}

/**
 * SCANNING: look for any MATERIALIZED source secret value inside the cloned
 * files. This is the invariant's teeth — the scan actively searches for each
 * secret value and reports every hit. Findings never contain the value (only
 * the key + location), so the scan result itself can be persisted/logged
 * safely.
 *
 * Values shorter than `minValueLength` are ignored to avoid matching trivial
 * strings (e.g. a one-char secret) everywhere; real secrets are long.
 */
export function scanClonedFilesForSecrets(
  files: RemixFile[],
  secretValues: Array<{ key: string; value: string }>,
  minValueLength = 6,
): SecretScanFinding[] {
  const findings: SecretScanFinding[] = [];

  const candidates = secretValues.filter((s) => typeof s.value === 'string' && s.value.length >= minValueLength);

  if (candidates.length === 0) {
    return findings;
  }

  for (const file of files) {
    /*
     * Skip binary (base64) blobs — a secret value wouldn't survive base64 as a
     * literal substring, and scanning encoded bytes yields false negatives anyway.
     */
    if (file.encoding && file.encoding !== 'utf-8' && file.encoding !== 'utf8') {
      continue;
    }

    const lines = file.content.split('\n');

    for (const candidate of candidates) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(candidate.value)) {
          findings.push({ path: file.path, secretKey: candidate.key, line: i + 1 });
        }
      }
    }
  }

  return findings;
}

/**
 * Strip lines that materialize a source secret value from the cloned files, so
 * the CLONE artifact is scrubbed even when the source workspace committed a
 * `.env`. Returns the cleaned files plus what was removed. The endpoint uses
 * this during CLONING; SCANNING then re-verifies nothing slipped through.
 */
export function scrubSecretsFromFiles(
  files: RemixFile[],
  secretValues: Array<{ key: string; value: string }>,
  minValueLength = 6,
): { files: RemixFile[]; removed: SecretScanFinding[] } {
  const candidates = secretValues.filter((s) => typeof s.value === 'string' && s.value.length >= minValueLength);
  const removed: SecretScanFinding[] = [];

  if (candidates.length === 0) {
    return { files, removed };
  }

  const cleaned = files.map((file) => {
    if (file.encoding && file.encoding !== 'utf-8' && file.encoding !== 'utf8') {
      return file;
    }

    const lines = file.content.split('\n');
    const kept: string[] = [];

    lines.forEach((rawLine, index) => {
      const hit = candidates.find((candidate) => rawLine.includes(candidate.value));

      if (hit) {
        removed.push({ path: file.path, secretKey: hit.key, line: index + 1 });

        /*
         * Replace the materialized value line with a reference placeholder so
         * the file still parses (e.g. an .env keeps its KEY=) but carries no value.
         */
        const eqMatch = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*[:=]).*/.exec(rawLine);
        kept.push(eqMatch ? `${eqMatch[1]} # detached on remix (reference only)` : '# secret value removed on remix');
      } else {
        kept.push(rawLine);
      }
    });

    return { ...file, content: kept.join('\n') };
  });

  return { files: cleaned, removed };
}

/**
 * Blank assignments for every credential KEY even when its source value cannot
 * be decrypted or is too short for safe substring scanning. This closes the
 * structural `.env`/JSON/YAML path while value scanning still catches secrets
 * materialized elsewhere in source code.
 */
export function scrubCredentialAssignments(
  files: RemixFile[],
  credentialKeys: readonly string[],
): { files: RemixFile[]; removed: SecretScanFinding[] } {
  const keys = [...new Set(credentialKeys)].filter(Boolean);
  const removed: SecretScanFinding[] = [];

  if (keys.length === 0) return { files, removed };

  const escaped = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const dotenv = new RegExp(`^(\\s*(?:export\\s+)?(${escaped})\\s*=).*$`, 'u');
  const yaml = new RegExp(`^(\\s*(${escaped})\\s*:\\s*).*$`, 'u');
  const json = new RegExp(`^(\\s*"(${escaped})"\\s*:\\s*)"[^"]*"(\\s*,?\\s*)$`, 'u');

  return {
    files: files.map((file) => {
      if (file.encoding && file.encoding !== 'utf-8' && file.encoding !== 'utf8') return file;

      const lines = file.content.split('\n').map((line, index) => {
        const jsonMatch = json.exec(line);
        if (jsonMatch) {
          removed.push({ path: file.path, secretKey: jsonMatch[2], line: index + 1 });
          return `${jsonMatch[1]}""${jsonMatch[3]}`;
        }

        const dotenvMatch = dotenv.exec(line);
        if (dotenvMatch) {
          removed.push({ path: file.path, secretKey: dotenvMatch[2], line: index + 1 });
          return `${dotenvMatch[1]} # detached on remix (reference only)`;
        }

        const yamlMatch = yaml.exec(line);
        if (!yamlMatch) return line;
        removed.push({ path: file.path, secretKey: yamlMatch[2], line: index + 1 });
        return `${yamlMatch[1]}"" # detached on remix (reference only)`;
      });

      return { ...file, content: lines.join('\n') };
    }),
    removed,
  };
}

/*
 * ------------------------------------------------------------------------- *
 * SOURCE_SANITIZED (I-RMX-3, P0-V3-05) — PII masking before cloning.
 * -------------------------------------------------------------------------
 */

export type PiiKind = 'email' | 'phone' | 'iban' | 'card' | 'name';

export interface PiiFinding {
  path: string;

  /** What kind of PII was found — never the value itself. */
  kind: PiiKind;

  /** 1-indexed line of the masked span. */
  line: number;
}

/**
 * RFC 2606 / documentation domains — addresses on these are fixtures, not a
 * person's data. Masking them would mangle test suites and READMEs for zero
 * privacy gain.
 */
const PII_EXEMPT_EMAIL_DOMAIN = /@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|example|invalid|test|localhost)$/i;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * International-format phone numbers only (+ then 8-15 digits, separators
 * allowed). Bare digit runs are deliberately NOT matched — ids, timestamps and
 * ports would drown the signal in false positives.
 */
const PHONE_RE = /\+\d(?:[\s().-]?\d){7,14}/g;

/*
 * ------------------------------------------------------------------------- *
 * IBAN — détection par LONGUEUR NATIONALE, pas par regex
 *
 * Un IBAN n'a PAS de forme auto-délimitante : c'est une suite d'alphanumériques
 * dont seule la LONGUEUR, fixée par le pays, dit où elle s'arrête. Deux
 * tentatives par regex ont échoué en production :
 *
 *   v1  /(?:\s?[A-Z0-9]{4}){2,7}[A-Z0-9]{0,3}/
 *       → « FR76 … 7890 189 » : le groupe terminal de 3 caractères SURVIVAIT
 *         (fragment de PII laissé en clair).
 *   v2  /(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?/
 *       → « ES91 … 1332 EUR » : ES fait 24 caractères, atteints pile après
 *         « 1332 » ; le groupe optionnel avalait alors « EUR ».
 *         CORRUPTION des données voisines (devise, colonne suivante).
 *
 * Aucun quantificateur générique ne peut trancher : il faut lire le code pays,
 * appliquer la longueur du registre, et masquer EXACTEMENT cette plage.
 * -------------------------------------------------------------------------
 */

/**
 * Longueurs IBAN par pays — registre **ISO 13616-1 / Swift IBAN Registry**.
 *
 * Provenance : table figée le **2026-08-04** à partir du registre IBAN publié
 * par Swift en tant qu'autorité d'enregistrement ISO 13616. Chaque entrée est
 * la longueur TOTALE de l'IBAN (code pays + clé de contrôle + BBAN).
 *
 * Cette table est VERSIONNÉE volontairement : un pays qui rejoint le registre
 * ou change de longueur doit faire l'objet d'une mise à jour explicite et
 * datée. Un code pays absent de la table n'est JAMAIS masqué (fail-open assumé
 * et déclaré : mieux vaut ne pas masquer que corrompre du texte voisin).
 */
export const IBAN_REGISTRY_PROVENANCE = 'ISO 13616-1 / Swift IBAN Registry — table figée le 2026-08-04';

export const IBAN_LENGTH_BY_COUNTRY: Readonly<Record<string, number>> = Object.freeze({
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BI: 27,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DJ: 27,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FK: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HN: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  LY: 25,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MN: 20,
  MR: 27,
  MT: 31,
  MU: 30,
  NI: 28,
  NL: 18,
  NO: 15,
  OM: 23,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  RU: 33,
  SA: 24,
  SC: 31,
  SD: 18,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  SO: 23,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
  YE: 30,
});

/**
 * Séparateurs tolérés À L'INTÉRIEUR d'un IBAN : uniquement des espaces, y
 * compris insécables. Le trait d'union est volontairement EXCLU — il sépare
 * bien plus souvent deux champs voisins qu'il ne groupe un IBAN, et le
 * consommer rejouerait exactement le bug « EUR ».
 */
const IBAN_INNER_SEPARATOR = /[ \t\u00A0\u202F\u2007\u2009\u2060]/;

const ALNUM = /[A-Za-z0-9]/;

/**
 * Checksum ISO 7064 MOD-97-10 : déplace les 4 premiers caractères à la fin,
 * convertit les lettres (A=10 … Z=35) puis exige un reste de 1.
 *
 * ⚠️ ARBITRAGE 2026-08-05 : ce contrôle N'EST PLUS une condition de masquage.
 * Il ne sert QU'À qualifier la confiance (métrique `checksum_valid`). Un IBAN
 * mal saisi reste une donnée bancaire : on le masque quand même.
 */
export function ibanChecksumValid(compact: string): boolean {
  const s = compact.toUpperCase();

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{7,30}$/.test(s)) {
    return false;
  }

  let remainder = 0;

  for (const ch of `${s.slice(4)}${s.slice(0, 4)}`) {
    const digits = ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);

    for (const d of digits) {
      remainder = (remainder * 10 + Number(d)) % 97;
    }
  }

  return remainder === 1;
}

/*
 * ------------------------------------------------------------------------- *
 * DÉFINITION NORMATIVE — « candidat plausible » (R4)
 *
 * R4 ne signale un code pays inconnu que si le jeton rencontré ressemble
 * VRAIMENT à un IBAN. Sans ce filtre, chaque `ab12` d'un fichier source
 * incrémenterait la métrique et la rendrait inexploitable. Un jeton est un
 * candidat plausible si et seulement si les 4 conditions suivantes tiennent :
 *
 *  C1. STRUCTURE — exactement 2 lettres ASCII puis 2 chiffres ASCII
 *      (`/[A-Za-z]{2}[0-9]{2}/`), puis un corps alphanumérique ASCII. La casse
 *      est libre ; le code pays est normalisé en majuscules.
 *
 *  C2. NORMALISATION — on retire les SÉPARATEURS INTERNES pour mesurer :
 *      espace, tabulation, insécable U+00A0, insécable étroite U+202F, espace
 *      numérique U+2007, espace fine U+2009, gluon U+2060. Un séparateur n'est
 *      franchi QUE s'il est suivi d'un alphanumérique : il n'est jamais
 *      consommé en fin de jeton. Le trait d'union est EXCLU — il sépare deux
 *      champs voisins bien plus souvent qu'il ne groupe un IBAN, et le
 *      consommer rejouerait le bug « EUR ».
 *
 *  C3. LONGUEUR — la longueur normalisée est comprise entre 15 et 34 inclus,
 *      bornes du registre ISO 13616 tous pays confondus.
 *
 *  C4. DÉLIMITATION — le caractère qui PRÉCÈDE le début n'est pas
 *      alphanumérique, et celui qui SUIT la fin ne l'est pas non plus. Un
 *      jeton plus long qu'un IBAN n'est donc jamais un candidat.
 *
 * Cette définition est le contrat de stabilité de R4 : la modifier change ce
 * que mesure `unknown_country_code`. Voir docs/REMIX_PII_IBAN_POLICY.md.
 * -------------------------------------------------------------------------
 */

/** Bornes plausibles d'un IBAN, tous pays confondus (ISO 13616 : 15 → 34). */
const IBAN_MIN_LENGTH = 15;
const IBAN_MAX_LENGTH = 34;

/**
 * Ce que le masquage a OBSERVÉ — remonté au bord (`remix-pii-metrics.ts`)
 * plutôt que compté ici, pour garder ce module pur et testable.
 */
export interface PiiMaskingObservations {
  /** IBAN masqués dont le checksum MOD-97 est valide. */
  ibanMaskedChecksumValid: number;

  /** IBAN masqués MALGRÉ un checksum invalide (R1 : on masque quand même). */
  ibanMaskedChecksumInvalid: number;

  /**
   * Candidats hors registre rencontrés (R4) — non masqués, à signaler. UNE
   * ENTRÉE PAR OCCURRENCE : la métrique compte tout, le log est borné en aval.
   */
  ibanUnknownCandidates: UnknownIbanCandidate[];
}

/** Une occurrence d'IBAN : bornes dans le texte ORIGINAL + qualification. */
export interface IbanSpan {
  start: number;
  end: number;
  countryCode: string;

  /** Qualité seulement — n'a AUCUN effet sur la décision de masquer. */
  checksumValid: boolean;
}

/**
 * Un candidat qui RESSEMBLE à un IBAN mais dont le pays est hors registre.
 *
 * Ne porte JAMAIS la valeur : seulement le code pays, la longueur normalisée
 * et un spécimen TRONQUÉ — de quoi diagnostiquer, rien pour reconstituer.
 */
export interface UnknownIbanCandidate {
  /** Code pays ISO 3166 alpha-2, normalisé en majuscules. */
  countryCode: string;

  /** Longueur du candidat APRÈS normalisation (séparateurs retirés). */
  normalizedLength: number;

  /**
   * CATÉGORIE DE DÉCISION — pourquoi ce candidat n'a pas été masqué.
   *
   * Ce type ne porte AUCUN fragment de la valeur, pas même tronqué : ni le
   * corps, ni la clé de contrôle, ni un préfixe. Seuls le code pays (qui EST
   * l'information à diagnostiquer), la longueur et la catégorie sortent d'ici.
   * Un spécimen tronqué avait été envisagé puis RETIRÉ : la clé de contrôle
   * est dérivée du numéro de compte, et rien n'oblige à la journaliser pour
   * savoir qu'un pays manque au registre.
   */
  decision: 'UNKNOWN_COUNTRY_CODE';
}

export interface IbanScan {
  spans: IbanSpan[];

  /**
   * Candidats plausibles dont le pays est absent du registre. NON masqués — et
   * signalés, pour que la table soit mise à jour plutôt que la fuite passe
   * inaperçue. UNE ENTRÉE PAR OCCURRENCE (pas de déduplication) : la métrique
   * doit compter chaque candidat, c'est le LOG qui est borné en aval.
   */
  unknownCandidates: UnknownIbanCandidate[];
}

/*
 * ------------------------------------------------------------------------- *
 * POLITIQUE DE MASQUAGE IBAN — arbitrage Avi du 2026-08-05
 *
 *  R1. Pays CONNU + longueur nationale EXACTE  → MASQUER TOUJOURS,
 *      que le checksum MOD-97 soit valide ou non (priorité confidentialité :
 *      un IBAN mal tapé reste une donnée bancaire sensible).
 *  R2. Le checksum n'est JAMAIS une condition. Il ne sert qu'à qualifier la
 *      confiance (métrique `checksum_valid`) et ne laisse jamais réapparaître
 *      le numéro.
 *  R3. Pays CONNU + longueur INCORRECTE (trop court ou trop long) → NE PAS
 *      masquer : ce n'est pas un IBAN de ce pays.
 *  R4. Pays ABSENT de la table → NE PAS masquer, mais LOGUER + incrémenter
 *      `unknown_country_code`, pour qu'un nouveau pays devienne visible.
 *  R5. NE JAMAIS dépasser la longueur officielle : aucun texte voisin (EUR,
 *      USD, ponctuation, espaces) ne doit être absorbé.
 * -------------------------------------------------------------------------
 */
export function scanIbans(line: string): IbanScan {
  const spans: IbanSpan[] = [];
  const unknownCandidates: UnknownIbanCandidate[] = [];
  const candidate = /[A-Za-z]{2}[0-9]{2}/g;

  let match: RegExpExecArray | null;

  while ((match = candidate.exec(line)) !== null) {
    const start = match.index;

    // Borne GAUCHE : refuser un départ au milieu d'un jeton alphanumérique.
    if (start > 0 && ALNUM.test(line[start - 1])) {
      continue;
    }

    const countryCode = line.slice(start, start + 2).toUpperCase();
    const expected = IBAN_LENGTH_BY_COUNTRY[countryCode];

    if (expected === undefined) {
      /*
       * R4 — signaler UNIQUEMENT ce qui ressemble vraiment à un IBAN, sinon
       * la métrique se noierait sous les « ab12 » de n'importe quel code.
       */
      const probe = consumeIban(line, start, IBAN_MAX_LENGTH);

      /*
       * C3 + C4 de la DÉFINITION NORMATIVE ci-dessus. AUCUNE déduplication :
       * chaque occurrence doit compter dans la métrique — c'est le LOG qui est
       * borné, en aval (voir shouldLogUnknownIbanCountry).
       */
      if (
        probe.taken >= IBAN_MIN_LENGTH &&
        probe.taken <= IBAN_MAX_LENGTH &&
        (probe.end >= line.length || !ALNUM.test(line[probe.end]))
      ) {
        unknownCandidates.push({
          countryCode,
          normalizedLength: probe.taken,
          decision: 'UNKNOWN_COUNTRY_CODE',
        });
      }

      continue;
    }

    const run = consumeIban(line, start, expected);

    // R3 — trop COURT pour ce pays.
    if (run.taken !== expected || run.end < 0) {
      continue;
    }

    // R3 — trop LONG : le jeton continue au-delà de la longueur nationale.
    if (run.end < line.length && ALNUM.test(line[run.end])) {
      continue;
    }

    // R1 + R2 — on masque ; le checksum ne fait que qualifier.
    spans.push({
      start,
      end: run.end,
      countryCode,
      checksumValid: ibanChecksumValid(run.compact),
    });

    candidate.lastIndex = run.end;
  }

  return { spans, unknownCandidates };
}

/**
 * Consomme au plus `limit` alphanumériques depuis `start`, en franchissant les
 * espaces INTERNES (y compris insécables) mais jamais un séparateur terminal.
 * `end` est l'index de fin dans le texte ORIGINAL (R5 : la plage rendue ne
 * déborde jamais sur le voisinage).
 */
function consumeIban(line: string, start: number, limit: number): { taken: number; end: number; compact: string } {
  let cursor = start;
  let taken = 0;
  let compact = '';
  let end = -1;

  while (cursor < line.length && taken < limit) {
    const ch = line[cursor];

    if (ALNUM.test(ch)) {
      compact += ch;
      taken += 1;
      cursor += 1;
      end = cursor;

      continue;
    }

    if (!IBAN_INNER_SEPARATOR.test(ch)) {
      break;
    }

    let peek = cursor;

    while (peek < line.length && IBAN_INNER_SEPARATOR.test(line[peek])) {
      peek += 1;
    }

    if (peek >= line.length || !ALNUM.test(line[peek])) {
      break;
    }

    cursor = peek;
  }

  return { taken, end, compact };
}

/** Candidate payment-card numbers: 13-19 digits, optional space/dash groups. */
const CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/g;

/** Luhn check — keeps CARD_RE from eating ordinary long numbers. */
export function luhnValid(digits: string): boolean {
  const clean = digits.replace(/[ -]/g, '');

  if (clean.length < 13 || clean.length > 19) {
    return false;
  }

  let sum = 0;

  for (let i = 0; i < clean.length; i++) {
    let d = clean.charCodeAt(clean.length - 1 - i) - 48;

    if (i % 2 === 1) {
      d *= 2;

      if (d > 9) {
        d -= 9;
      }
    }

    sum += d;
  }

  return sum % 10 === 0;
}

/** Plages d'IBAN d'une ligne (voir {@link scanIbans} pour la politique). */
export function ibanSpans(line: string): IbanSpan[] {
  return scanIbans(line).spans;
}

interface PiiMatcher {
  kind: PiiKind;

  /** Détection par motif — suffisant quand la forme est auto-délimitante. */
  re?: RegExp;

  accept?: (match: string) => boolean;

  /**
   * Détection par PLAGES — pour les formes dont un regex ne peut pas décider
   * la fin (IBAN : longueur portée par le code pays, cf. IBAN_LENGTH_BY_COUNTRY).
   */
  spans?: (line: string) => Array<{ start: number; end: number }>;
}

const PII_MATCHERS: PiiMatcher[] = [
  { kind: 'email', re: EMAIL_RE, accept: (m) => !PII_EXEMPT_EMAIL_DOMAIN.test(m) },
  { kind: 'phone', re: PHONE_RE },
  { kind: 'iban', spans: ibanSpans },
  { kind: 'card', re: CARD_RE, accept: luhnValid },
];

/*
 * ------------------------------------------------------------------------- *
 * NOMS DE PERSONNES (P0-V3-05, réserve #2)
 *
 * Un nom n'a pas de forme lexicale distinctive : « Jane Doe » et « Meridian
 * Supply » sont indiscernables hors contexte. Un regex « deux mots capitalisés »
 * massacrerait tout code source. On masque donc UNIQUEMENT sur signal
 * STRUCTUREL, jamais sur de la prose :
 *
 *  1. clé explicitement personnelle (firstName, lastName, nom, prenom…) dans
 *     du JSON/YAML/TS/env — la clé porte à elle seule l'intention ;
 *  2. colonne CSV/TSV nommée `name`/`nom` — MAIS seulement si le fichier
 *     contient aussi une colonne personnelle (email, phone, iban, ssn,
 *     birthdate, address). `name,email,phone` = fiche de personne ;
 *     `name,price,stock` = catalogue produit, laissé intact.
 *
 * Biais assumé : sur signal structurel on masque même une raison sociale
 * (« name: Acme Corp » dans un fichier de contacts). Sur-masquer une entreprise
 * coûte infiniment moins cher que laisser fuiter le nom d'une personne.
 * -------------------------------------------------------------------------
 */

/**
 * Clés dont le nom SEUL suffit à établir qu'on tient l'identité d'une personne.
 * `displayName` en est volontairement EXCLU : c'est massivement un libellé
 * d'interface (« Dashboard », « Paramètres »), pas une identité.
 */
const PERSON_NAME_KEY =
  /^(?:full[_-]?name|first[_-]?name|last[_-]?name|given[_-]?name|family[_-]?name|middle[_-]?name|sur[_-]?name|contact[_-]?name|customer[_-]?name|owner[_-]?name|patient[_-]?name|employee[_-]?name|holder[_-]?name|beneficiary|nom|pr[eé]nom|nom[_-]?complet|nom[_-]?de[_-]?famille)$/i;

/** Colonnes qui, présentes à côté d'un `name`, prouvent qu'on lit des personnes. */
const PERSON_CONTEXT_COLUMN =
  /^(?:e[_-]?mail|mail|courriel|phone|tel|telephone|t[eé]l[eé]phone|mobile|iban|bic|ssn|nir|social[_-]?security|birth[_-]?date|date[_-]?of[_-]?birth|dob|address|adresse|postal[_-]?code|city|ville)$/i;

/** `name` / `nom` nu : personnel seulement si une colonne de contexte l'accompagne. */
const BARE_NAME_KEY = /^(?:name|nom|nome|nombre)$/i;

/**
 * Une valeur « qui ressemble à un nom » : un ou plusieurs mots, le premier
 * commençant par une majuscule, uniquement lettres unicode + apostrophes +
 * traits d'union + espaces.
 *
 * « Jane » ✓ (sous une clé `firstName`, un mot unique EST un nom) ·
 * « Jane Doe » ✓ · « Jean-Pierre Dupont » ✓ · « O'Brien » ✓
 * « meridian-storefront » ✗ (minuscule) · « admin » ✗ · « {{first}} » ✗ ·
 * « user_1 » ✗ · « 42 » ✗ · « » ✗.
 */
const PERSON_NAME_VALUE = /^\p{Lu}[\p{L}'’-]*(?:[ ]\p{Lu}?[\p{L}'’-]+)*$/u;

/** `key: "value"` / `key = value` / `"key": "value"` — JSON, YAML, TS, env. */
const KEY_VALUE_LINE = /^(\s*["'`]?)([\w.$-]+)(["'`]?\s*[:=]\s*)(["'`])([^"'`]*)(["'`])/;

function splitCsvRow(row: string, sep: string): string[] {
  return row.split(sep).map((cell) => cell.trim());
}

/** Indices des colonnes CSV à masquer (personnelles), ou [] si le fichier n'est pas des fiches. */
function personNameColumns(headerCells: string[]): number[] {
  const stripped = headerCells.map((c) => c.replace(/^["']|["']$/g, ''));
  const hasPersonContext = stripped.some((c) => PERSON_CONTEXT_COLUMN.test(c));

  return stripped.reduce<number[]>((acc, cell, index) => {
    if (PERSON_NAME_KEY.test(cell) || (hasPersonContext && BARE_NAME_KEY.test(cell))) {
      acc.push(index);
    }

    return acc;
  }, []);
}

const NAME_MASK = '[PII:name masked on remix]';

/**
 * Cœur PARTAGÉ par le masquage et le re-scan : renvoie les lignes réécrites et
 * les emplacements touchés. Masquer et vérifier empruntent le MÊME chemin, donc
 * ils ne peuvent pas diverger.
 */
function rewritePersonNames(path: string, lines: string[]): { lines: string[]; findings: PiiFinding[] } {
  const findings: PiiFinding[] = [];
  const out = [...lines];

  const isCsv = /\.(?:csv|tsv)$/i.test(path);
  const sep = /\.tsv$/i.test(path) ? '\t' : ',';

  let csvColumns: number[] = [];

  if (isCsv) {
    const headerIndex = out.findIndex((l) => l.trim().length > 0);

    if (headerIndex >= 0) {
      csvColumns = personNameColumns(splitCsvRow(out[headerIndex], sep));

      for (let i = headerIndex + 1; i < out.length && csvColumns.length > 0; i++) {
        if (!out[i].trim()) {
          continue;
        }

        const cells = splitCsvRow(out[i], sep);

        let touched = false;

        for (const col of csvColumns) {
          if (cells[col] && cells[col] !== NAME_MASK) {
            cells[col] = NAME_MASK;
            touched = true;
          }
        }

        if (touched) {
          out[i] = cells.join(sep);
          findings.push({ path, kind: 'name', line: i + 1 });
        }
      }
    }

    return { lines: out, findings };
  }

  for (let i = 0; i < out.length; i++) {
    const match = KEY_VALUE_LINE.exec(out[i]);

    if (!match) {
      continue;
    }

    const [, openQuote, key, middle, valueOpen, value, valueClose] = match;

    if (!PERSON_NAME_KEY.test(key) || !PERSON_NAME_VALUE.test(value)) {
      continue;
    }

    out[i] = out[i].replace(
      `${openQuote}${key}${middle}${valueOpen}${value}${valueClose}`,
      `${openQuote}${key}${middle}${valueOpen}${NAME_MASK}${valueClose}`,
    );
    findings.push({ path, kind: 'name', line: i + 1 });
  }

  return { lines: out, findings };
}

/**
 * SOURCE_SANITIZED: mask PII spans out of the source files BEFORE cloning.
 * Deterministic pattern-based pass (emails, intl phone numbers, IBANs,
 * Luhn-valid card numbers). Each masked span becomes `[PII:<kind> masked on
 * remix]` so the file stays readable and the mask is self-explanatory.
 * Findings carry {path, kind, line} — the matched VALUE is never persisted.
 *
 * When the source author gave an explicit versioned consent
 * (`piiConsentVersion` on the listing), the caller SKIPS this pass and records
 * the consent version on the job instead — "PII masquées OU consentement
 * explicite" (plan §8.2), never silently unmasked.
 */
export function maskPiiInFiles(files: RemixFile[]): {
  files: RemixFile[];
  masked: PiiFinding[];
  observations: PiiMaskingObservations;
} {
  const masked: PiiFinding[] = [];

  const observations: PiiMaskingObservations = {
    ibanMaskedChecksumValid: 0,
    ibanMaskedChecksumInvalid: 0,
    ibanUnknownCandidates: [],
  };

  const cleaned = files.map((file) => {
    if (file.encoding && file.encoding !== 'utf-8' && file.encoding !== 'utf8') {
      return file; // binary blob — nothing maskable as text
    }

    /*
     * Pré-passe NOMS (signal structurel, cf. rewritePersonNames) : elle tourne
     * AVANT les matchers lexicaux pour que `name,email,phone` voie encore ses
     * colonnes email/phone intactes au moment de les masquer à leur tour.
     */
    const named = rewritePersonNames(file.path, file.content.split('\n'));
    const lines = named.lines;

    let touched = named.findings.length > 0;

    masked.push(...named.findings);

    const rewritten = lines.map((line, index) => {
      let out = line;

      for (const matcher of PII_MATCHERS) {
        if (matcher.kind === 'iban') {
          const scan = scanIbans(out);

          observations.ibanUnknownCandidates.push(...scan.unknownCandidates);

          /*
           * Réécriture À REBOURS : masquer de la fin vers le début garde les
           * index des plages restantes valides.
           */
          for (const span of [...scan.spans].reverse()) {
            out = `${out.slice(0, span.start)}[PII:iban masked on remix]${out.slice(span.end)}`;
            masked.push({ path: file.path, kind: 'iban', line: index + 1 });
            touched = true;

            // R2 : le checksum QUALIFIE le masquage, il ne le conditionne pas.
            if (span.checksumValid) {
              observations.ibanMaskedChecksumValid += 1;
            } else {
              observations.ibanMaskedChecksumInvalid += 1;
            }
          }

          continue;
        }

        if (matcher.spans) {
          for (const span of [...matcher.spans(out)].reverse()) {
            out = `${out.slice(0, span.start)}[PII:${matcher.kind} masked on remix]${out.slice(span.end)}`;
            masked.push({ path: file.path, kind: matcher.kind, line: index + 1 });
            touched = true;
          }

          continue;
        }

        out = out.replace(matcher.re!, (match) => {
          if (matcher.accept && !matcher.accept(match)) {
            return match;
          }

          masked.push({ path: file.path, kind: matcher.kind, line: index + 1 });
          touched = true;

          return `[PII:${matcher.kind} masked on remix]`;
        });
      }

      return out;
    });

    return touched ? { ...file, content: rewritten.join('\n') } : file;
  });

  return { files: cleaned, masked, observations };
}

/**
 * Verification twin of {@link maskPiiInFiles}: scan WITHOUT rewriting. Used to
 * re-check the sanitized output (must come back empty when masking ran) and in
 * tests as the invariant's teeth.
 */
export function scanFilesForPii(files: RemixFile[]): PiiFinding[] {
  const findings: PiiFinding[] = [];

  for (const file of files) {
    if (file.encoding && file.encoding !== 'utf-8' && file.encoding !== 'utf8') {
      continue;
    }

    const lines = file.content.split('\n');

    /*
     * Même chemin que le masquage : ce que rewritePersonNames RÉÉCRIRAIT est
     * exactement ce que le scan REMONTE, donc un nom non masqué est détecté.
     */
    findings.push(...rewritePersonNames(file.path, lines).findings);

    for (let i = 0; i < lines.length; i++) {
      for (const matcher of PII_MATCHERS) {
        if (matcher.spans) {
          const hits = matcher.spans(lines[i]).length;

          for (let n = 0; n < hits; n += 1) {
            findings.push({ path: file.path, kind: matcher.kind, line: i + 1 });
          }

          continue;
        }

        for (const match of lines[i].match(matcher.re!) ?? []) {
          if (matcher.accept && !matcher.accept(match)) {
            continue;
          }

          findings.push({ path: file.path, kind: matcher.kind, line: i + 1 });
        }
      }
    }
  }

  return findings;
}

/**
 * License capture at remix time (versioned, immutable on the job). The remixer
 * accepts THIS text — its sha256 pins the version so later curation edits
 * never rewrite what was agreed.
 */
export interface RemixLicenseSnapshot {
  /** Declared license id (e.g. SPDX "MIT"), or null when the author declared none. */
  licenseId: string | null;

  /** sha256 of the license text accepted, or null when no text was declared. */
  licenseTextSha256: string | null;

  /** Listing the license was captured from (provenance). */
  sourceListingId: string;

  /** ISO timestamp of capture. */
  capturedAt: string;
}
