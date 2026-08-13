/**
 * Secure project remix pipeline (DOMAIN_MODEL §1).
 *
 * NORMATIVE state machine — the order is a SECURITY property, not a convenience:
 *
 *   SNAPSHOT_PINNED → CREDENTIALS_DETACHED → SOURCE_SANITIZED → CLONING
 *     → DB_FORKING → STORAGE_POLICY_APPLIED → SCANNING → INDEXING → COMPLETED
 *
 * Hard invariants:
 *  - I-RMX-1: a secret VALUE never enters the clone artifact. Secrets are
 *    references (keys only). `CREDENTIALS_DETACHED` records the source's secret
 *    KEYS; the clone is seeded with empty-valued references, never the values.
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
  | 'SNAPSHOT_PINNED'
  | 'CREDENTIALS_DETACHED'
  | 'SOURCE_SANITIZED'
  | 'CLONING'
  | 'DB_FORKING'
  | 'STORAGE_POLICY_APPLIED'
  | 'SCANNING'
  | 'INDEXING'
  | 'COMPLETED'
  | 'FAILED';

/** The normative forward order. FAILED is reachable from any non-terminal state. */
export const REMIX_STATE_ORDER: RemixState[] = [
  'SNAPSHOT_PINNED',
  'CREDENTIALS_DETACHED',
  'SOURCE_SANITIZED',
  'CLONING',
  'DB_FORKING',
  'STORAGE_POLICY_APPLIED',
  'SCANNING',
  'INDEXING',
  'COMPLETED',
];

/**
 * Version of the remix consent text a remixer accepts (license terms + PII
 * handling disclosure). Bump when the consent WORDING changes — every RemixJob
 * records the version that was actually accepted, never "latest".
 */
export const REMIX_CONSENT_VERSION = '2026-07-20.1';

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
  if (to === 'FAILED') {
    return; // any non-terminal state may fail
  }

  if (from === 'COMPLETED' || from === 'FAILED') {
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

/* ------------------------------------------------------------------------- *
 * SOURCE_SANITIZED (I-RMX-3, P0-V3-05) — PII masking before cloning.
 * ------------------------------------------------------------------------- */

export type PiiKind = 'email' | 'phone' | 'iban' | 'card';

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

/** IBAN: 2 letters + 2 check digits + 11-30 alphanumerics (word-bounded). */
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}[A-Z0-9]{0,3}\b/g;

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

const PII_MATCHERS: Array<{ kind: PiiKind; re: RegExp; accept?: (match: string) => boolean }> = [
  { kind: 'email', re: EMAIL_RE, accept: (m) => !PII_EXEMPT_EMAIL_DOMAIN.test(m) },
  { kind: 'phone', re: PHONE_RE },
  { kind: 'iban', re: IBAN_RE },
  { kind: 'card', re: CARD_RE, accept: luhnValid },
];

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
export function maskPiiInFiles(files: RemixFile[]): { files: RemixFile[]; masked: PiiFinding[] } {
  const masked: PiiFinding[] = [];

  const cleaned = files.map((file) => {
    if (file.encoding && file.encoding !== 'utf-8' && file.encoding !== 'utf8') {
      return file; // binary blob — nothing maskable as text
    }

    const lines = file.content.split('\n');
    let touched = false;

    const rewritten = lines.map((line, index) => {
      let out = line;

      for (const matcher of PII_MATCHERS) {
        out = out.replace(matcher.re, (match) => {
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

  return { files: cleaned, masked };
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

    for (let i = 0; i < lines.length; i++) {
      for (const matcher of PII_MATCHERS) {
        for (const match of lines[i].match(matcher.re) ?? []) {
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
