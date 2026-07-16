import { describe, expect, it } from 'vitest';

import {
  REMIX_STATE_ORDER,
  REMIX_STORAGE_POLICIES,
  RemixInvariantError,
  assertRemixTransition,
  detachCredentials,
  scanClonedFilesForSecrets,
  scrubSecretsFromFiles,
} from './remix-pipeline.js';

describe('remix state machine', () => {
  it('accepts the full normative forward path', () => {
    for (let i = 0; i < REMIX_STATE_ORDER.length - 1; i++) {
      expect(() => assertRemixTransition(REMIX_STATE_ORDER[i], REMIX_STATE_ORDER[i + 1])).not.toThrow();
    }
  });

  it('REJECTS cloning before credentials are detached (I-RMX-2, security)', () => {
    expect(() => assertRemixTransition('SNAPSHOT_PINNED', 'CLONING')).toThrowError(RemixInvariantError);

    try {
      assertRemixTransition('SNAPSHOT_PINNED', 'CLONING');
    } catch (error) {
      expect((error as RemixInvariantError).code).toBe('REMIX_CLONE_BEFORE_DETACH');
    }
  });

  it('rejects skipping a step and going backwards', () => {
    expect(() => assertRemixTransition('CREDENTIALS_DETACHED', 'SCANNING')).toThrowError(/sequential/);
    expect(() => assertRemixTransition('CLONING', 'CREDENTIALS_DETACHED')).toThrowError(RemixInvariantError);
  });

  it('allows FAILED from any non-terminal state but not out of a terminal state', () => {
    expect(() => assertRemixTransition('CLONING', 'FAILED')).not.toThrow();
    expect(() => assertRemixTransition('COMPLETED', 'FAILED')).not.toThrow(); // terminal→FAILED is a no-op-safe early return
    expect(() => assertRemixTransition('COMPLETED', 'INDEXING')).toThrowError(/terminal/);
  });
});

describe('detachCredentials — references only, never values', () => {
  it('reduces secrets and env-vars to sorted, de-duplicated KEYS', () => {
    const detached = detachCredentials(
      [{ key: 'STRIPE_KEY' }, { key: 'DATABASE_URL' }, { key: 'STRIPE_KEY' }],
      [{ key: 'PUBLIC_FLAG' }, { key: 'DATABASE_URL' }],
    );

    expect(detached.secretKeys).toEqual(['DATABASE_URL', 'STRIPE_KEY']);
    expect(detached.envVarKeys).toEqual(['DATABASE_URL', 'PUBLIC_FLAG']);

    // The shape carries no `value`/`valueEncrypted` field at all.
    expect(JSON.stringify(detached)).not.toMatch(/value/i);
  });
});

describe('scanClonedFilesForSecrets — the invariant teeth', () => {
  const secretValue = 'FIXTURE-fake-value-9f8e7d6c5b4a3210';

  it('FINDS a materialized secret value committed into a cloned .env', () => {
    const findings = scanClonedFilesForSecrets(
      [
        { path: 'src/app.ts', content: 'const x = 1;\n' },
        { path: '.env', content: `PORT=3000\nSTRIPE_KEY=${secretValue}\n` },
      ],
      [{ key: 'STRIPE_KEY', value: secretValue }],
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: '.env', secretKey: 'STRIPE_KEY', line: 2 });

    // The finding never carries the value itself.
    expect(JSON.stringify(findings)).not.toContain(secretValue);
  });

  it('returns NO findings when the artifact is clean (the proof state)', () => {
    const findings = scanClonedFilesForSecrets(
      [{ path: '.env', content: 'STRIPE_KEY= # detached on remix (reference only)\n' }],
      [{ key: 'STRIPE_KEY', value: secretValue }],
    );
    expect(findings).toEqual([]);
  });

  it('ignores trivially short values and binary files', () => {
    expect(scanClonedFilesForSecrets([{ path: 'a', content: 'ab' }], [{ key: 'K', value: 'ab' }])).toEqual([]);
    expect(
      scanClonedFilesForSecrets(
        [{ path: 'img', content: secretValue, encoding: 'base64' }],
        [{ key: 'K', value: secretValue }],
      ),
    ).toEqual([]);
  });
});

describe('scrubSecretsFromFiles — CLONING strips materialized values', () => {
  const secretValue = 'FIXTURE-fake-token-0011223344556677';

  it('removes the value line, keeps the key as a reference, and re-scan is clean', () => {
    const { files, removed } = scrubSecretsFromFiles(
      [{ path: '.env', content: `API_TOKEN=${secretValue}\nDEBUG=true\n` }],
      [{ key: 'API_TOKEN', value: secretValue }],
    );

    expect(removed).toHaveLength(1);
    expect(files[0].content).toContain('API_TOKEN='); // reference preserved
    expect(files[0].content).not.toContain(secretValue); // value gone
    expect(files[0].content).toContain('DEBUG=true'); // untouched line kept

    // The scrubbed artifact passes the scan — the whole point.
    expect(scanClonedFilesForSecrets(files, [{ key: 'API_TOKEN', value: secretValue }])).toEqual([]);
  });

  it('is a no-op when there are no materialized values', () => {
    const input = [{ path: 'x', content: 'nothing secret here' }];
    const { files, removed } = scrubSecretsFromFiles(input, [{ key: 'K', value: 'unusedLongValue123' }]);
    expect(removed).toEqual([]);
    expect(files).toEqual(input);
  });
});

describe('storage policies', () => {
  it('exposes exactly DETACH / CLONE / SHARE_WITH_CONSENT', () => {
    expect(REMIX_STORAGE_POLICIES).toEqual(['DETACH', 'CLONE', 'SHARE_WITH_CONSENT']);
  });
});
