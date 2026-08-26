/**
 * Secure project import pipeline (DOMAIN_MODEL §2, plan §9.2, IMPORT_REMIX_CONTRACT).
 *
 * NORMATIVE state machine (P0-EX-04 — aligned on the contract, no longer the old
 * linear SCANNING→COMMITTING shortcut):
 *
 *   RECEIVED → STAGING_ISOLATED → SCANNING
 *      ├─ clean ─────────────────→ READY_TO_COMMIT
 *      └─ blocking findings ────→ QUARANTINED → AWAITING_USER_ACTION → RESCANNING → READY_TO_COMMIT
 *   READY_TO_COMMIT → COMMITTING → COMMITTED
 *   side states (from any non-terminal): ROLLING_BACK · CLEANUP_PENDING · EXPIRED · CANCELLED · FAILED
 *
 * The atomic COMMIT departs ONLY from READY_TO_COMMIT. A clean payload does NOT
 * pass through quarantine; a payload with blocking findings CANNOT reach
 * READY_TO_COMMIT without going AWAITING_USER_ACTION → RESCANNING (explicit
 * consent). RESCANNING re-checks the (consented) staged copy: resolved → READY,
 * still-blocking → back to QUARANTINED.
 *
 * Two NON-NEGOTIABLE invariants:
 *  - I-IMP-1 (no silent deletion): scanning NEVER modifies content. Findings are
 *    PRESENTED and BLOCKING; the imported content is redacted ONLY with explicit
 *    per-finding consent. "Detected and stripped before write" is forbidden —
 *    editing the user's code without consent is data loss.
 *  - I-IMP-2 (disposable staging, no target mount): the import touches the target
 *    workspace ONLY at the final atomic COMMIT — or not at all (cleanup). Staging
 *    is disposable and separate from any target project.
 *
 * This module is PURE (no DB, no I/O). The scanner detects secret-SHAPED content
 * without any prior knowledge of values (an imported repo's secrets are unknown),
 * and every finding carries a REDACTED preview only — never the raw value.
 */

export type ImportState =
  | 'RECEIVED'
  | 'STAGING_ISOLATED'
  | 'SCANNING'
  | 'QUARANTINED'
  | 'AWAITING_USER_ACTION'
  | 'RESCANNING'
  | 'READY_TO_COMMIT'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'ROLLING_BACK'
  | 'CLEANUP_PENDING'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'FAILED';

/** Terminal states — no transition leaves them. */
export const IMPORT_TERMINAL_STATES: ImportState[] = ['COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED'];

/**
 * Legal forward (happy / quarantine) transitions. The contract machine:
 *  - SCANNING branches to READY_TO_COMMIT (clean) OR QUARANTINED (blocking findings)
 *    — NEVER straight to COMMITTING (the old shortcut, removed by P0-EX-04).
 *  - the quarantine path goes QUARANTINED → AWAITING_USER_ACTION → RESCANNING,
 *    and RESCANNING resolves to READY_TO_COMMIT (consent applied) or loops back to
 *    QUARANTINED (findings still unresolved).
 *  - COMMITTING departs ONLY from READY_TO_COMMIT.
 * Cleanup targets are handled separately (reachable from any non-terminal).
 */
const IMPORT_FORWARD: Record<ImportState, ImportState[]> = {
  RECEIVED: ['STAGING_ISOLATED'],
  STAGING_ISOLATED: ['SCANNING'],
  SCANNING: ['READY_TO_COMMIT', 'QUARANTINED'],
  QUARANTINED: ['AWAITING_USER_ACTION'],
  AWAITING_USER_ACTION: ['RESCANNING'],
  RESCANNING: ['READY_TO_COMMIT', 'QUARANTINED'],
  READY_TO_COMMIT: ['COMMITTING'],
  COMMITTING: ['COMMITTED'],
  COMMITTED: [],
  ROLLING_BACK: [],
  // CLEANUP_PENDING is a durable recovery marker. A target may exist only after a
  // claimed commit; cleanup must verify physical + database deletion before moving
  // to a terminal state.
  CLEANUP_PENDING: ['ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED'],
  EXPIRED: [],
  CANCELLED: [],
  FAILED: [],
};

/**
 * Cleanup states — reachable from ANY non-terminal state (the sad path must
 * always be reachable). CLEANUP_PENDING is the recoverable marker; the rest are
 * terminal states reached only after target cleanup is verified.
 */
const CLEANUP_STATES: ImportState[] = ['ROLLING_BACK', 'CLEANUP_PENDING', 'EXPIRED', 'CANCELLED', 'FAILED'];

export class ImportInvariantError extends Error {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ImportInvariantError';
  }
}

/**
 * Validate a single transition. A cleanup transition (→ ROLLING_BACK /
 * CLEANUP_PENDING / EXPIRED / CANCELLED / FAILED) is legal from any non-terminal
 * state — cleanup must always be reachable, on the sad path as much as the happy
 * path. Throws on illegal moves.
 */
export function assertImportTransition(from: ImportState, to: ImportState): void {
  if (IMPORT_TERMINAL_STATES.includes(from)) {
    throw new ImportInvariantError(`Cannot transition out of terminal state ${from}`, 'IMPORT_TERMINAL_STATE');
  }

  if (CLEANUP_STATES.includes(to)) {
    return; // cleanup is always reachable from a non-terminal state
  }

  if (!IMPORT_FORWARD[from].includes(to)) {
    // The security-critical case gets its own loud error: the atomic commit may
    // ONLY depart from READY_TO_COMMIT (never the old SCANNING→COMMITTING shortcut,
    // never a findings state that skipped AWAITING_USER_ACTION→RESCANNING).
    if (to === 'COMMITTING' && from !== 'READY_TO_COMMIT') {
      throw new ImportInvariantError(
        `COMMITTING may only depart from READY_TO_COMMIT (was ${from}). Resolve findings via AWAITING_USER_ACTION → RESCANNING first.`,
        'IMPORT_COMMIT_NOT_READY',
      );
    }

    throw new ImportInvariantError(`Illegal import transition ${from}→${to}`, 'IMPORT_BAD_TRANSITION');
  }
}

/**
 * Guard the SCANNING (and RESCANNING) branch so a CLEAN payload never lands in
 * quarantine and a payload WITH blocking findings never shortcuts to
 * READY_TO_COMMIT. This is the "un import propre ne passe pas artificiellement
 * par la quarantaine" invariant, enforced in the pure layer so the endpoint
 * cannot get it wrong.
 */
export function assertScanBranch(to: 'READY_TO_COMMIT' | 'QUARANTINED', hasBlockingFindings: boolean): void {
  if (to === 'QUARANTINED' && !hasBlockingFindings) {
    throw new ImportInvariantError(
      'A clean import must not be forced through QUARANTINED — SCANNING branches to READY_TO_COMMIT when there is no blocking finding.',
      'IMPORT_CLEAN_FORCED_QUARANTINE',
    );
  }

  if (to === 'READY_TO_COMMIT' && hasBlockingFindings) {
    throw new ImportInvariantError(
      'An import with blocking findings must not skip to READY_TO_COMMIT — it must go QUARANTINED → AWAITING_USER_ACTION → RESCANNING first.',
      'IMPORT_FINDINGS_SKIP_QUARANTINE',
    );
  }
}

/** The scan outcome for a given finding set: where SCANNING/RESCANNING branches to. */
export function scanBranchTarget(hasBlockingFindings: boolean): 'READY_TO_COMMIT' | 'QUARANTINED' {
  return hasBlockingFindings ? 'QUARANTINED' : 'READY_TO_COMMIT';
}

/*
 * ---- The 12 Import-hub entries (CONFIRMED) ---------------------------------
 * GitLab is supported by the Git flow but is NOT a hub tile; Screenshot is a
 * reference for Agent/Canvas, not an import provider; Empty IS a hub entry.
 */
export type ImportProvider =
  | 'github'
  | 'bitbucket'
  | 'vercel'
  | 'figma'
  | 'claude'
  | 'bolt'
  | 'lovable'
  | 'base44'
  | 'zip'
  | 'spreadsheet'
  | 'previous-agent-export'
  | 'empty';

export const IMPORT_HUB_PROVIDERS: ImportProvider[] = [
  'github',
  'bitbucket',
  'vercel',
  'figma',
  'claude',
  'bolt',
  'lovable',
  'base44',
  'zip',
  'spreadsheet',
  'previous-agent-export',
  'empty',
];

/** Providers with a real executing import path today vs modeled-only (🟡). */
export const IMPORT_PROVIDERS_EXECUTED: ImportProvider[] = [
  'github',
  'bitbucket',
  'vercel',
  'figma',
  'claude',
  'zip',
  'empty',
];

export interface ImportFile {
  path: string;
  content: string;
  encoding?: string;
}

export type SecretFindingKind = 'env-secret' | 'private-key' | 'provider-token' | 'high-entropy';

export interface ImportSecretFinding {
  path: string;
  line: number;
  kind: SecretFindingKind;

  /** REDACTED preview — never the raw value. e.g. "API_SECRET=Zx9Q…0kL". */
  preview: string;
}

/** Keys that make an env assignment secret-shaped. */
const SECRET_KEY_RE = /(secret|token|passwo?rd|passwd|pwd|api[_-]?key|access[_-]?key|private[_-]?key)/i;

/**
 * Provider token SHAPES — regexes, not literal secrets. Matching a shape flags a
 * finding; the value itself is never stored. (Kept generic so this file itself
 * carries no credential and never trips push-protection.)
 */
const PROVIDER_TOKEN_RES: Array<{ kind: SecretFindingKind; re: RegExp }> = [
  { kind: 'provider-token', re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { kind: 'provider-token', re: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { kind: 'provider-token', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'provider-token', re: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
];

const PRIVATE_KEY_RE = /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/;

/** Redact a secret value to head…tail so previews/logs never leak it. */
export function redactValue(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 8) {
    return '****';
  }

  return `${trimmed.slice(0, 4)}…${trimmed.slice(-3)}`;
}

/** Redact a whole line: keep an env KEY, redact its value; else mask the line. */
export function redactSecretLine(line: string): string {
  const env = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*[:=])\s*(.+?)\s*$/.exec(line);

  if (env) {
    return `${env[1]}${redactValue(env[2])}`;
  }

  return '[redacted secret]';
}

/**
 * SCANNING — detect secret-SHAPED content in the STAGED files. PURE and
 * READ-ONLY: it never mutates a file (I-IMP-1). Findings carry a redacted
 * preview only. Detection is value-agnostic (an imported repo's secrets are
 * unknown): env-secret assignments, private-key blocks, provider token shapes,
 * and long high-entropy tokens.
 */
export function scanStagedFilesForSecrets(files: ImportFile[]): ImportSecretFinding[] {
  const findings: ImportSecretFinding[] = [];

  for (const file of files) {
    if (file.encoding && file.encoding !== 'utf-8' && file.encoding !== 'utf8') {
      continue;
    }

    const lines = file.content.split('\n');

    lines.forEach((line, index) => {
      const lineNo = index + 1;

      if (PRIVATE_KEY_RE.test(line)) {
        findings.push({ path: file.path, line: lineNo, kind: 'private-key', preview: '[BEGIN PRIVATE KEY]' });
        return;
      }

      for (const { kind, re } of PROVIDER_TOKEN_RES) {
        const match = re.exec(line);

        if (match) {
          findings.push({ path: file.path, line: lineNo, kind, preview: redactValue(match[0]) });
          return;
        }
      }

      const env = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*['"]?([^'"\s#]{6,})['"]?/.exec(line);

      if (env && SECRET_KEY_RE.test(env[1])) {
        findings.push({
          path: file.path,
          line: lineNo,
          kind: 'env-secret',
          preview: `${env[1].trim()}=${redactValue(env[2])}`,
        });
        return;
      }

      // High-entropy standalone token (32+ base64/hex chars) not already caught.
      const token = /(^|[\s:="'`(])([A-Za-z0-9+/_-]{32,})($|[\s"'`)])/.exec(line);

      if (token && looksHighEntropy(token[2])) {
        findings.push({ path: file.path, line: lineNo, kind: 'high-entropy', preview: redactValue(token[2]) });
      }
    });
  }

  return findings;
}

/** Shannon-ish check: a long token with mixed classes is likely a secret. */
function looksHighEntropy(token: string): boolean {
  if (token.length < 32) {
    return false;
  }

  const hasLower = /[a-z]/.test(token);
  const hasUpper = /[A-Z]/.test(token);
  const hasDigit = /[0-9]/.test(token);
  const classes = [hasLower, hasUpper, hasDigit].filter(Boolean).length;
  const unique = new Set(token).size;

  // Reject obvious non-secrets: a single repeated char, or a lowercase-only word.
  return classes >= 2 && unique >= 12;
}

export interface ConsentDecision {
  /** Per-finding consent, keyed by `${path}:${line}`. 'redact' | 'keep'. */
  [findingKey: string]: 'redact' | 'keep';
}

export function findingKey(finding: ImportSecretFinding): string {
  return `${finding.path}:${finding.line}`;
}

/**
 * Gate: may the import proceed to COMMITTING? Returns the blocked findings — an
 * import with unresolved findings (no explicit per-finding consent) is BLOCKED.
 * This is what enforces I-IMP-1: nothing is written or redacted until every
 * finding has an explicit 'keep' or 'redact' decision.
 */
export function unresolvedFindings(findings: ImportSecretFinding[], consent: ConsentDecision): ImportSecretFinding[] {
  return findings.filter((f) => consent[findingKey(f)] === undefined);
}

/**
 * Apply consented redactions to the STAGED files — the ONLY place content is
 * mutated, and only for findings the user explicitly chose to 'redact'. A 'keep'
 * decision leaves the line byte-for-byte intact (the user owns that call).
 * Returns the new files + which lines were redacted. Never runs without consent.
 */
export function applyConsentedRedactions(
  files: ImportFile[],
  findings: ImportSecretFinding[],
  consent: ConsentDecision,
): { files: ImportFile[]; redacted: ImportSecretFinding[] } {
  const toRedact = findings.filter((f) => consent[findingKey(f)] === 'redact');
  const redacted: ImportSecretFinding[] = [];

  if (toRedact.length === 0) {
    return { files, redacted };
  }

  const byPath = new Map<string, Set<number>>();

  for (const finding of toRedact) {
    const set = byPath.get(finding.path) ?? new Set<number>();
    set.add(finding.line);
    byPath.set(finding.path, set);
  }

  const out = files.map((file) => {
    const lineSet = byPath.get(file.path);

    if (!lineSet) {
      return file;
    }

    const lines = file.content.split('\n').map((line, index) => {
      if (lineSet.has(index + 1)) {
        redacted.push({ path: file.path, line: index + 1, kind: 'env-secret', preview: redactSecretLine(line) });
        return redactSecretLine(line);
      }

      return line;
    });

    return { ...file, content: lines.join('\n') };
  });

  return { files: out, redacted };
}
