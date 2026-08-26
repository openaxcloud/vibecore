import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  IMPORT_HUB_PROVIDERS,
  IMPORT_PROVIDERS_EXECUTED,
  ImportInvariantError,
  applyConsentedRedactions,
  assertImportTransition,
  assertScanBranch,
  findingKey,
  redactSecretLine,
  redactValue,
  scanBranchTarget,
  scanStagedFilesForSecrets,
  unresolvedFindings,
} from './import-pipeline.js';

/** Assert a thunk throws an ImportInvariantError with the given code. */
function expectInvariant(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error(`expected ImportInvariantError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ImportInvariantError);
    expect((error as ImportInvariantError).code).toBe(code);
  }
}

/*
 * A secret-SHAPED fixture that trips the generic env-secret detector but is NOT
 * a real provider token pattern (so it never trips GitHub push protection).
 */
const IMPORTED_SECRET = 'Zx9Q7wE3rT5yU8iO1pA6sD2fG4hJ0kL0mN';

describe('import state machine — aligned on the contract (P0-EX-04)', () => {
  it('accepts the CLEAN happy path: SCANNING → READY_TO_COMMIT → COMMITTING → COMMITTED', () => {
    const path = [
      ['RECEIVED', 'STAGING_ISOLATED'],
      ['STAGING_ISOLATED', 'SCANNING'],
      ['SCANNING', 'READY_TO_COMMIT'],
      ['READY_TO_COMMIT', 'COMMITTING'],
      ['COMMITTING', 'COMMITTED'],
    ] as const;

    for (const [from, to] of path) {
      expect(() => assertImportTransition(from, to)).not.toThrow();
    }
  });

  it('accepts the QUARANTINE path with the RESCANNING step before READY_TO_COMMIT', () => {
    const path = [
      ['SCANNING', 'QUARANTINED'],
      ['QUARANTINED', 'AWAITING_USER_ACTION'],
      ['AWAITING_USER_ACTION', 'RESCANNING'],
      ['RESCANNING', 'READY_TO_COMMIT'],
      ['READY_TO_COMMIT', 'COMMITTING'],
      ['COMMITTING', 'COMMITTED'],
    ] as const;

    for (const [from, to] of path) {
      expect(() => assertImportTransition(from, to)).not.toThrow();
    }
  });

  it('RESCANNING may loop back to QUARANTINED when findings are still unresolved', () => {
    expect(() => assertImportTransition('RESCANNING', 'QUARANTINED')).not.toThrow();
  });

  // Negative test (1): the old SCANNING→COMMITTING shortcut is REMOVED.
  it('REJECTS the old shortcut SCANNING → COMMITTING (IMPORT_COMMIT_NOT_READY)', () => {
    expectInvariant(() => assertImportTransition('SCANNING', 'COMMITTING'), 'IMPORT_COMMIT_NOT_READY');
  });

  it('REJECTS COMMITTING from any state other than READY_TO_COMMIT', () => {
    for (const from of ['STAGING_ISOLATED', 'AWAITING_USER_ACTION', 'QUARANTINED', 'RESCANNING'] as const) {
      expectInvariant(() => assertImportTransition(from, 'COMMITTING'), 'IMPORT_COMMIT_NOT_READY');
    }
  });

  // Negative test (2): a clean payload must not be forced through quarantine.
  it('REJECTS forcing a CLEAN payload into QUARANTINED (IMPORT_CLEAN_FORCED_QUARANTINE)', () => {
    expectInvariant(() => assertScanBranch('QUARANTINED', false), 'IMPORT_CLEAN_FORCED_QUARANTINE');
    expect(scanBranchTarget(false)).toBe('READY_TO_COMMIT');
  });

  // Negative test (3): a payload with blocking findings must not skip to READY.
  it('REJECTS skipping to READY_TO_COMMIT with blocking findings (IMPORT_FINDINGS_SKIP_QUARANTINE)', () => {
    expectInvariant(() => assertScanBranch('READY_TO_COMMIT', true), 'IMPORT_FINDINGS_SKIP_QUARANTINE');
    expect(scanBranchTarget(true)).toBe('QUARANTINED');
  });

  it('assertScanBranch accepts the correct branches', () => {
    expect(() => assertScanBranch('READY_TO_COMMIT', false)).not.toThrow();
    expect(() => assertScanBranch('QUARANTINED', true)).not.toThrow();
  });

  it('allows cleanup (ROLLING_BACK / CLEANUP_PENDING / CANCELLED / EXPIRED / FAILED) from ANY non-terminal state', () => {
    for (const from of [
      'RECEIVED',
      'STAGING_ISOLATED',
      'SCANNING',
      'QUARANTINED',
      'AWAITING_USER_ACTION',
      'RESCANNING',
      'READY_TO_COMMIT',
      'COMMITTING',
      'CLEANUP_PENDING',
    ] as const) {
      for (const to of ['ROLLING_BACK', 'CLEANUP_PENDING', 'CANCELLED', 'EXPIRED', 'FAILED'] as const) {
        expect(() => assertImportTransition(from, to)).not.toThrow();
      }
    }
  });

  it('refuses to leave a terminal state (incl. the new FAILED terminal)', () => {
    for (const from of ['COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED'] as const) {
      expectInvariant(() => assertImportTransition(from, 'SCANNING'), 'IMPORT_TERMINAL_STATE');
    }
  });
});

describe('scanStagedFilesForSecrets — read-only detection, redacted findings', () => {
  it('finds an env secret and a private-key block, presenting redacted previews', () => {
    const findings = scanStagedFilesForSecrets([
      { path: 'src/index.js', content: 'console.log("ok")\n' },
      { path: '.env', content: `PORT=3000\nAPI_SECRET=${IMPORTED_SECRET}\n` },
      { path: 'id_rsa', content: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n' },
    ]);

    const env = findings.find((f) => f.kind === 'env-secret');
    const key = findings.find((f) => f.kind === 'private-key');
    expect(env).toMatchObject({ path: '.env', line: 2 });
    expect(key).toMatchObject({ path: 'id_rsa', line: 1 });

    // No finding — anywhere — carries the raw secret value.
    expect(JSON.stringify(findings)).not.toContain(IMPORTED_SECRET);
  });

  it('detects provider token SHAPES without hardcoding a real secret', () => {
    // Built at runtime so this source file carries no literal credential.
    const fakeStripe = ['sk', 'live', 'A'.repeat(20)].join('_');
    const findings = scanStagedFilesForSecrets([{ path: 'cfg.ts', content: `const k = "${fakeStripe}";\n` }]);
    expect(findings.some((f) => f.kind === 'provider-token')).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(fakeStripe);
  });

  it('does NOT flag ordinary code (no false positive on a normal repo)', () => {
    const findings = scanStagedFilesForSecrets([
      { path: 'README.md', content: '# My app\nRun `npm start`.\n' },
      { path: 'package.json', content: '{\n  "name": "app",\n  "version": "1.0.0"\n}\n' },
    ]);
    expect(findings).toEqual([]);
  });

  it('never mutates the input (I-IMP-1: scanning is read-only)', () => {
    const files = [{ path: '.env', content: `API_SECRET=${IMPORTED_SECRET}\n` }];
    const before = JSON.stringify(files);
    scanStagedFilesForSecrets(files);
    expect(JSON.stringify(files)).toBe(before);
  });
});

describe('consent gate — no silent deletion (I-IMP-1)', () => {
  const files = [{ path: '.env', content: `PORT=3000\nAPI_SECRET=${IMPORTED_SECRET}\nDEBUG=true\n` }];
  const findings = scanStagedFilesForSecrets(files);

  it('BLOCKS commit while any finding is unresolved (no consent)', () => {
    expect(unresolvedFindings(findings, {}).length).toBeGreaterThan(0);
  });

  it("keeps content byte-for-byte on a 'keep' decision (user owns the call)", () => {
    const key = findingKey(findings[0]);
    const { files: out, redacted } = applyConsentedRedactions(files, findings, { [key]: 'keep' });
    expect(redacted).toEqual([]);
    expect(out[0].content).toBe(files[0].content); // unchanged
    // Hash proves no silent rewrite happened.
    expect(sha(out[0].content)).toBe(sha(files[0].content));
  });

  it("redacts ONLY on an explicit 'redact' decision, keeping the key as a reference", () => {
    const key = findingKey(findings[0]);
    const { files: out, redacted } = applyConsentedRedactions(files, findings, { [key]: 'redact' });
    expect(redacted).toHaveLength(1);
    expect(out[0].content).not.toContain(IMPORTED_SECRET); // value gone
    expect(out[0].content).toContain('API_SECRET='); // reference kept
    expect(out[0].content).toContain('DEBUG=true'); // untouched line kept
    expect(unresolvedFindings(scanStagedFilesForSecrets(out), { [key]: 'redact' })).toEqual([]);
  });
});

describe('redaction helpers', () => {
  it('redacts a value to head…tail and an env line to KEY=head…tail', () => {
    expect(redactValue(IMPORTED_SECRET)).not.toContain(IMPORTED_SECRET.slice(4, -3));
    expect(redactSecretLine(`API_SECRET=${IMPORTED_SECRET}`)).toMatch(/^API_SECRET=Zx9Q…/);
    expect(redactSecretLine(`API_SECRET=${IMPORTED_SECRET}`)).not.toContain(IMPORTED_SECRET);
  });
});

describe('import hub inventory (CONFIRMED — 12 entries)', () => {
  it('lists exactly the 12 hub tiles (Empty included; GitLab/Screenshot excluded)', () => {
    expect(IMPORT_HUB_PROVIDERS).toHaveLength(12);
    expect(IMPORT_HUB_PROVIDERS).toContain('empty');
    expect(IMPORT_HUB_PROVIDERS).not.toContain('gitlab');
    expect(IMPORT_HUB_PROVIDERS).not.toContain('screenshot');
  });

  it('marks the credential-backed providers as executing real import paths', () => {
    for (const p of IMPORT_PROVIDERS_EXECUTED) {
      expect(IMPORT_HUB_PROVIDERS).toContain(p);
    }

    expect(IMPORT_PROVIDERS_EXECUTED).toEqual(expect.arrayContaining(['vercel', 'figma', 'claude']));
  });
});

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
