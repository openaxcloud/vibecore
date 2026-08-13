import { describe, expect, it } from 'vitest';

import {
  REMIX_STATE_ORDER,
  REMIX_STORAGE_POLICIES,
  RemixInvariantError,
  assertRemixTransition,
  detachCredentials,
  luhnValid,
  maskPiiInFiles,
  scanClonedFilesForSecrets,
  scanFilesForPii,
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

describe('SOURCE_SANITIZED — PII masking (I-RMX-3, P0-V3-05)', () => {
  it('sits between CREDENTIALS_DETACHED and CLONING in the normative order', () => {
    const detachedIdx = REMIX_STATE_ORDER.indexOf('CREDENTIALS_DETACHED');
    expect(REMIX_STATE_ORDER[detachedIdx + 1]).toBe('SOURCE_SANITIZED');
    expect(REMIX_STATE_ORDER[detachedIdx + 2]).toBe('CLONING');
    expect(() => assertRemixTransition('CREDENTIALS_DETACHED', 'SOURCE_SANITIZED')).not.toThrow();
    expect(() => assertRemixTransition('SOURCE_SANITIZED', 'CLONING')).not.toThrow();
    // Skipping sanitization is an illegal transition, like any skipped step.
    expect(() => assertRemixTransition('CREDENTIALS_DETACHED', 'CLONING')).toThrow(RemixInvariantError);
  });

  it('masks a real email but keeps RFC 2606 fixture addresses', () => {
    const { files, masked } = maskPiiInFiles([
      { path: 'seed.csv', content: 'jane.doe@acme-corp.fr\nsupport@example.com\nbot@sub.example.org\n' },
    ]);

    expect(files[0].content).toContain('[PII:email masked on remix]');
    expect(files[0].content).not.toContain('jane.doe@acme-corp.fr');
    expect(files[0].content).toContain('support@example.com');
    expect(files[0].content).toContain('bot@sub.example.org');
    expect(masked).toEqual([{ path: 'seed.csv', kind: 'email', line: 1 }]);
  });

  it('masks international phone numbers but never bare digit runs (ids, ports)', () => {
    const { files, masked } = maskPiiInFiles([
      { path: 'contacts.txt', content: 'call +33 6 12 34 56 78\nport 5432 id 1720000000000\n' },
    ]);

    expect(files[0].content).toContain('[PII:phone masked on remix]');
    expect(files[0].content).toContain('port 5432 id 1720000000000');
    expect(masked.map((m) => m.kind)).toEqual(['phone']);
  });

  it('masks Luhn-valid card numbers only (the check is the guard against false positives)', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);

    const { files, masked } = maskPiiInFiles([
      { path: 'cards.txt', content: 'ok 4242 4242 4242 4242\nnot-a-card 4242 4242 4242 4241\n' },
    ]);

    expect(files[0].content).toContain('[PII:card masked on remix]');
    expect(files[0].content).toContain('4242 4242 4242 4241'); // fails Luhn — untouched
    expect(masked.map((m) => m.kind)).toEqual(['card']);
  });

  it('masks IBANs and leaves binary files alone', () => {
    const { files, masked } = maskPiiInFiles([
      { path: 'pay.txt', content: 'FR76 3000 6000 0112 3456 7890 189\n' },
      { path: 'img.png', content: 'FR76 3000 6000 0112 3456 7890 189', encoding: 'base64' },
    ]);

    expect(files[0].content).toContain('[PII:iban masked on remix]');
    expect(files[1].content).toContain('FR76'); // binary blob — not text-maskable
    expect(masked).toHaveLength(1);
  });

  it('masked output re-scans CLEAN — findings carry kind + location, never the value', () => {
    const dirty = [
      { path: 'seed.csv', content: 'jane@acme-corp.fr,+33612345678,4242424242424242\n' },
    ];
    const { files, masked } = maskPiiInFiles(dirty);

    expect(masked.length).toBeGreaterThanOrEqual(3);
    expect(scanFilesForPii(files)).toEqual([]); // the proof state
    expect(JSON.stringify(masked)).not.toContain('jane@acme-corp.fr');
    expect(JSON.stringify(masked)).not.toContain('4242');
  });
});
