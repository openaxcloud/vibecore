import { describe, expect, it } from 'vitest';

import {
  buildFinalPersistedManifestPackagePolicyProof,
  buildRuntimeRecoveryRecord,
  buildSolutionRuntimeRecoveryProofManifest,
  createRuntimeRecoveryProofTracker,
  FINAL_PERSISTED_MANIFEST_SCOPE,
  RuntimeRecoveryProofError,
  validateFinalPersistedManifestPackagePolicyProof,
  validateRuntimeRecoveryRecord,
  validateSolutionRuntimeRecoveryProofManifest,
} from './solution-runtime-recovery-proof.js';

const validPackageJson = JSON.stringify({
  name: 'peopleops-proof',
  version: '1.0.0',
  private: true,
  type: 'module',
  scripts: {
    dev: 'vite --host 0.0.0.0',
    typecheck: 'tsc --noEmit',
    build: 'tsc --noEmit && vite build',
    preview: 'vite preview --host 0.0.0.0',
  },
  dependencies: { react: '18.3.1', 'react-dom': '18.3.1' },
  devDependencies: {
    '@types/react': '18.3.23',
    '@types/react-dom': '18.3.7',
    typescript: '5.9.3',
    vite: '5.4.21',
  },
  overrides: { esbuild: '0.21.5' },
  allowScripts: { 'esbuild@0.21.5': true },
});

const finalPackageInput = {
  packageJsonSource: validPackageJson,
  projectFilesRevision: 'project-files-revision-42',
} as const;

describe('Solution runtime recovery proof', () => {
  it('represents no recovery only as a canonical zero-event record', () => {
    const record = buildRuntimeRecoveryRecord([]);

    expect(record).toEqual({
      attemptCount: 0,
      commandCount: 0,
      commands: [],
      counts: { auto: 0, 'reinstall-ui': 0, terminal: 0 },
      events: [],
      mode: 'none',
      reasons: [],
    });
    expect(validateRuntimeRecoveryRecord(record)).toEqual({ valid: true });
  });

  it('tracks ordered auto, UI reinstall, and terminal recoveries with exact aggregate provenance', () => {
    const record = buildRuntimeRecoveryRecord([
      {
        source: 'auto',
        reason: 'Initial Preview boot did not expose port 5173',
        commands: [],
      },
      {
        source: 'reinstall-ui',
        reason: 'Native Webview remained detached after Run',
        commands: [],
      },
      {
        source: 'terminal',
        reason: 'Official runtime proxy remained unreachable',
        commands: [
          'npm install --include=dev --prefer-offline --no-audit --no-fund',
          'node_modules/.bin/vite --version',
          'npm run dev -- --host 0.0.0.0',
        ],
      },
    ]);

    expect(record.mode).toBe('terminal');
    expect(record.attemptCount).toBe(3);
    expect(record.commandCount).toBe(3);
    expect(record.counts).toEqual({ auto: 1, 'reinstall-ui': 1, terminal: 1 });
    expect(record.events.map(({ sequence, source }) => ({ sequence, source }))).toEqual([
      { sequence: 1, source: 'auto' },
      { sequence: 2, source: 'reinstall-ui' },
      { sequence: 3, source: 'terminal' },
    ]);
    expect(record.commands).toEqual([
      {
        count: 1,
        sources: ['terminal'],
        value: 'npm install --include=dev --prefer-offline --no-audit --no-fund',
      },
      { count: 1, sources: ['terminal'], value: 'node_modules/.bin/vite --version' },
      { count: 1, sources: ['terminal'], value: 'npm run dev -- --host 0.0.0.0' },
    ]);
    expect(record.reasons).toEqual([
      { count: 1, sources: ['auto'], value: 'Initial Preview boot did not expose port 5173' },
      { count: 1, sources: ['reinstall-ui'], value: 'Native Webview remained detached after Run' },
      { count: 1, sources: ['terminal'], value: 'Official runtime proxy remained unreachable' },
    ]);
    expect(validateRuntimeRecoveryRecord(record)).toEqual({ valid: true });
    expect(
      validateRuntimeRecoveryRecord({
        mode: record.mode,
        reasons: record.reasons,
        events: record.events,
        counts: record.counts,
        commands: record.commands,
        commandCount: record.commandCount,
        attemptCount: record.attemptCount,
      }),
    ).toEqual({ valid: true });
  });

  it('preserves UI and automatic recovery attempts without inventing hidden shell commands', () => {
    const record = buildRuntimeRecoveryRecord([
      { source: 'auto', reason: 'Preview was explicitly started', commands: [] },
      { source: 'reinstall-ui', reason: 'Dependency reinstall was explicitly requested', commands: [] },
    ]);

    expect(record.commandCount).toBe(0);
    expect(record.commands).toEqual([]);
    expect(record.events.map(({ commands }) => commands)).toEqual([[], []]);
    expect(validateRuntimeRecoveryRecord(record)).toEqual({ valid: true });
  });

  it('keeps tracker snapshots immutable and isolated from caller arrays', () => {
    const commands = ['npm run dev'];
    const tracker = createRuntimeRecoveryProofTracker();
    const first = tracker.record({ source: 'auto', reason: 'Preview initially stopped', commands });

    commands.push('npm install');

    expect(first.events[0].commands).toEqual(['npm run dev']);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.events)).toBe(true);
    expect(Object.isFrozen(first.events[0].commands)).toBe(true);
    expect(tracker.snapshot()).toEqual(first);

    const second = tracker.record({
      source: 'terminal',
      reason: 'Runtime remained unavailable',
      commands: ['npm run dev -- --host 0.0.0.0'],
    });

    expect(first.attemptCount).toBe(1);
    expect(second.attemptCount).toBe(2);
    expect(tracker.snapshot()).toEqual(second);
  });

  it.each([
    ['none is never a recordable source', { source: 'none', reason: 'No recovery', commands: ['npm run dev'] }],
    ['reason is empty', { source: 'auto', reason: '', commands: ['npm run dev'] }],
    ['terminal commands are empty', { source: 'terminal', reason: 'Preview stopped', commands: [] }],
    ['command is multiline', { source: 'terminal', reason: 'Preview stopped', commands: ['npm install\nnpm run dev'] }],
    [
      'unknown fields are present',
      { source: 'auto', reason: 'Preview stopped', commands: ['npm run dev'], inferred: true },
    ],
  ])('rejects a recovery event when %s', (_label, event) => {
    expect(() => buildRuntimeRecoveryRecord([event as never])).toThrow(RuntimeRecoveryProofError);
  });

  it('rejects forged counts, escalation mode, sequence, and aggregates', () => {
    const record = buildRuntimeRecoveryRecord([
      { source: 'auto', reason: 'Preview stopped', commands: ['npm run dev'] },
    ]);

    for (const forged of [
      { ...record, attemptCount: 2 },
      { ...record, mode: 'terminal' },
      { ...record, counts: { ...record.counts, auto: 2 } },
      { ...record, events: [{ ...record.events[0], sequence: 2 }] },
      { ...record, commands: [{ ...record.commands[0], count: 2 }] },
    ]) {
      expect(validateRuntimeRecoveryRecord(forged)).toMatchObject({ valid: false });
    }
  });

  it('validates and fingerprints only the final persisted closed package manifest', () => {
    const proof = buildFinalPersistedManifestPackagePolicyProof(finalPackageInput);

    expect(proof).toMatchObject({
      packageJsonBytes: Buffer.byteLength(validPackageJson, 'utf8'),
      packagePath: 'package.json',
      projectFilesRevision: 'project-files-revision-42',
      scope: FINAL_PERSISTED_MANIFEST_SCOPE,
      verified: true,
    });
    expect(proof.packageJsonSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(validateFinalPersistedManifestPackagePolicyProof(proof, finalPackageInput)).toEqual({ valid: true });
    expect(
      validateFinalPersistedManifestPackagePolicyProof(proof, {
        ...finalPackageInput,
        packageJsonSource: `${validPackageJson}\n`,
      }),
    ).toMatchObject({ valid: false });
  });

  it('refuses an invalid package policy or an imprecise project revision', () => {
    expect(() =>
      buildFinalPersistedManifestPackagePolicyProof({
        packageJsonSource: JSON.stringify({ name: 'unsafe' }),
        projectFilesRevision: 'revision-1',
      }),
    ).toThrow(/closed package policy/u);

    expect(() =>
      buildFinalPersistedManifestPackagePolicyProof({
        packageJsonSource: validPackageJson,
        projectFilesRevision: ' revision-1 ',
      }),
    ).toThrow(/leading or trailing whitespace/u);
  });

  it('builds a strict manifest whose package policy claims final state rather than shell chronology', () => {
    const packagePolicy = buildFinalPersistedManifestPackagePolicyProof(finalPackageInput);
    const tracker = createRuntimeRecoveryProofTracker();

    tracker.record({
      source: 'reinstall-ui',
      reason: 'Dependency recovery was explicitly requested',
      commands: [],
    });

    const manifest = tracker.manifest(packagePolicy);

    expect(manifest).toEqual(
      buildSolutionRuntimeRecoveryProofManifest({ packagePolicy, runtimeRecovery: tracker.snapshot() }),
    );
    expect(manifest.packagePolicy.scope).toBe('final-persisted-manifest');
    expect(manifest.runtimeRecovery.mode).toBe('reinstall-ui');
    expect(manifest.schemaVersion).toBe(2);
    expect(validateSolutionRuntimeRecoveryProofManifest(manifest, finalPackageInput)).toEqual({ valid: true });
    expect(Object.isFrozen(manifest)).toBe(true);
  });

  it('rejects unknown manifest fields and a forged final package fingerprint', () => {
    const packagePolicy = buildFinalPersistedManifestPackagePolicyProof(finalPackageInput);
    const runtimeRecovery = buildRuntimeRecoveryRecord([]);
    const manifest = buildSolutionRuntimeRecoveryProofManifest({ packagePolicy, runtimeRecovery });

    expect(validateSolutionRuntimeRecoveryProofManifest({ ...manifest, chronologicalShellProof: true })).toMatchObject({
      valid: false,
    });
    expect(
      validateSolutionRuntimeRecoveryProofManifest(
        {
          ...manifest,
          packagePolicy: { ...manifest.packagePolicy, packageJsonSha256: '0'.repeat(64) },
        },
        finalPackageInput,
      ),
    ).toMatchObject({ valid: false });
  });
});
