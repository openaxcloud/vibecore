import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  IMPORT_HUB_PROVIDERS,
  IMPORT_PROVIDERS_EXECUTED,
  ImportInvariantError,
  applyConsentedRedactions,
  assertImportTransition,
  findingKey,
  redactSecretLine,
  redactValue,
  scanStagedFilesForSecrets,
  unresolvedFindings,
} from './import-pipeline.js';

/*
 * A secret-SHAPED fixture that trips the generic env-secret detector but is NOT
 * a real provider token pattern (so it never trips GitHub push protection).
 */
const IMPORTED_SECRET = 'Zx9Q7wE3rT5yU8iO1pA6sD2fG4hJ0kL0mN';

describe('import state machine', () => {
  it('accepts the happy path with quarantine + consent', () => {
    const path = [
      ['RECEIVED', 'STAGING_ISOLATED'],
      ['STAGING_ISOLATED', 'SCANNING'],
      ['SCANNING', 'QUARANTINED'],
      ['QUARANTINED', 'AWAITING_USER_ACTION'],
      ['AWAITING_USER_ACTION', 'COMMITTING'],
      ['COMMITTING', 'COMMITTED'],
    ] as const;

    for (const [from, to] of path) {
      expect(() => assertImportTransition(from, to)).not.toThrow();
    }
  });

  it('accepts the clean path (no findings) SCANNING → COMMITTING', () => {
    expect(() => assertImportTransition('SCANNING', 'COMMITTING')).not.toThrow();
  });

  it('REJECTS committing without a clean scan or consent (I-IMP-1)', () => {
    try {
      assertImportTransition('STAGING_ISOLATED', 'COMMITTING');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ImportInvariantError);
      expect((error as ImportInvariantError).code).toBe('IMPORT_COMMIT_WITHOUT_CONSENT');
    }
  });

  it('allows cleanup (ROLLING_BACK / CANCELLED / EXPIRED) from ANY non-terminal state', () => {
    for (const from of [
      'RECEIVED',
      'STAGING_ISOLATED',
      'SCANNING',
      'QUARANTINED',
      'AWAITING_USER_ACTION',
      'COMMITTING',
    ] as const) {
      expect(() => assertImportTransition(from, 'ROLLING_BACK')).not.toThrow();
      expect(() => assertImportTransition(from, 'CANCELLED')).not.toThrow();
      expect(() => assertImportTransition(from, 'EXPIRED')).not.toThrow();
    }
  });

  it('refuses to leave a terminal state', () => {
    for (const from of ['COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED'] as const) {
      expect(() => assertImportTransition(from, 'SCANNING')).toThrowError(/terminal/);
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

  it('marks which providers actually execute today vs modeled-only', () => {
    for (const p of IMPORT_PROVIDERS_EXECUTED) {
      expect(IMPORT_HUB_PROVIDERS).toContain(p);
    }

    // e.g. figma / lovable are modeled but not executed yet.
    expect(IMPORT_PROVIDERS_EXECUTED).not.toContain('figma');
  });
});

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
