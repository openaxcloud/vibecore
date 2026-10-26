import { describe, expect, it } from 'vitest';
import { packageDiagnosticCommand, packageDiagnosticSucceeded } from './package-diagnostics';

// Synthetic reports matching the official formats linked in docs/reprise/package-manager-contracts-2026-10-25.md.
const finding = { id: 42, title: 'Synthetic advisory', severity: 'high', vulnerable_versions: '<2' };
const vulnerabilities = { info: 0, low: 0, moderate: 0, high: 1, critical: 0 };
const pnpmAudit = { advisories: { '42': finding }, metadata: { vulnerabilities } };
const pnpmOutdated = { fixture: { wanted: '1', latest: '2', isDeprecated: false, dependencyType: 'dependencies' } };
const yarnAudit = { type: 'auditSummary', data: { vulnerabilities } };

const yarnBerry = {
  value: 'fixture',
  children: {
    ID: 42,
    Issue: 'Synthetic advisory',
    Severity: 'high',
    'Vulnerable Versions': '<2',
    'Tree Versions': ['1.0.0'],
    Dependents: [],
  },
};
const yarnOutdated = {
  type: 'table',
  data: {
    head: ['Package', 'Current', 'Wanted', 'Latest', 'Package Type', 'URL'],
    body: [['fixture', '1', '1', '2', 'dependencies', 'https://example.invalid']],
  },
};

for (const [manager, intent, exitCode, report] of [
  ['pnpm', 'audit', 1, pnpmAudit],
  ['pnpm', 'outdated', 1, pnpmOutdated],
  ['yarn', 'audit', 8, yarnAudit],
  ['yarn', 'audit', 1, yarnBerry],
  ['yarn', 'outdated', 1, yarnOutdated],
  ['bun', 'audit', 1, { fixture: [finding] }],
] as const) {
  describe(`${manager} ${intent} recognized report`, () => {
    it('recognizes findings without changing the raw code', () => {
      const run = { exitCode, output: JSON.stringify(report) };
      expect(packageDiagnosticSucceeded(manager, intent, run)).toBe(true);
      expect(run.exitCode).toBe(exitCode);
    });
    it('rejects the same report with an operational exit code', () => {
      expect(packageDiagnosticSucceeded(manager, intent, { exitCode: 127, output: JSON.stringify(report) })).toBe(
        false,
      );
    });

    for (const output of ['', '{}', '{', '{"error":"registry unavailable"}', 'registry unavailable']) {
      it(`rejects unusable report ${JSON.stringify(output)}`, () => {
        expect(packageDiagnosticSucceeded(manager, intent, { exitCode, output })).toBe(false);
      });
    }
  });
}

it('requires the Classic summary severity mask to agree with the process code', () => {
  expect(packageDiagnosticSucceeded('yarn', 'audit', { exitCode: 1, output: JSON.stringify(yarnAudit) })).toBe(false);
  expect(
    packageDiagnosticSucceeded('yarn', 'audit', {
      exitCode: 24,
      output: JSON.stringify({ type: 'auditSummary', data: { vulnerabilities: { ...vulnerabilities, critical: 1 } } }),
    }),
  ).toBe(true);
});
it('refuses a Yarn error even if a summary preceded it', () => {
  expect(
    packageDiagnosticSucceeded('yarn', 'audit', {
      exitCode: 8,
      output: `${JSON.stringify(yarnAudit)}\n{"type":"error","data":"network"}`,
    }),
  ).toBe(false);
});
it('rejects malformed advisory objects', () => {
  expect(packageDiagnosticSucceeded('bun', 'audit', { exitCode: 1, output: '{"fixture":[{}]}' })).toBe(false);
  expect(
    packageDiagnosticSucceeded('pnpm', 'audit', {
      exitCode: 1,
      output: JSON.stringify({ ...pnpmAudit, advisories: { x: {} } }),
    }),
  ).toBe(false);
});
it('supports missing latest in pnpm outdated reports', () => {
  expect(
    packageDiagnosticSucceeded('pnpm', 'outdated', {
      exitCode: 1,
      output: JSON.stringify({ fixture: { wanted: '1', isDeprecated: false, dependencyType: 'dependencies' } }),
    }),
  ).toBe(true);
});
it('asks Bun for machine-readable audit output but does not invent an outdated contract', () => {
  expect(packageDiagnosticCommand('bun', 'audit')).toBe('bun audit --json');
  expect(packageDiagnosticCommand('bun', 'outdated')).toBe('bun outdated');
  expect(packageDiagnosticSucceeded('bun', 'outdated', { exitCode: 1, output: JSON.stringify(pnpmOutdated) })).toBe(
    false,
  );
});

it('rejects incomplete or invalid Classic severity counts', () => {
  for (const counts of [{ high: 1 }, { ...vulnerabilities, low: -1 }, { ...vulnerabilities, low: '0' }]) {
    expect(
      packageDiagnosticSucceeded('yarn', 'audit', {
        exitCode: 8,
        output: JSON.stringify({ type: 'auditSummary', data: { vulnerabilities: counts } }),
      }),
    ).toBe(false);
  }
});
it('does not accept nested provider errors as advisories', () => {
  expect(
    packageDiagnosticSucceeded('bun', 'audit', {
      exitCode: 1,
      output: JSON.stringify({ fixture: [{ ...finding, error: 'upstream failed' }] }),
    }),
  ).toBe(false);
});
it('fails closed on a mixed Berry warning/tree stream and appended stderr', () => {
  for (const extra of ['{"type":"warning","data":"partial response"}', 'network failure']) {
    expect(
      packageDiagnosticSucceeded('yarn', 'audit', { exitCode: 1, output: `${JSON.stringify(yarnBerry)}\n${extra}` }),
    ).toBe(false);
  }
});

it('accepts Bun safe groups alongside findings and advisories without an optional id', () => {
  const { id: _id, ...withoutId } = finding;
  expect(
    packageDiagnosticSucceeded('bun', 'audit', {
      exitCode: 1,
      output: JSON.stringify({ safe: [], fixture: [withoutId] }),
    }),
  ).toBe(true);
  expect(packageDiagnosticSucceeded('bun', 'audit', { exitCode: 1, output: '{"safe":[]}' })).toBe(false);
  expect(
    packageDiagnosticSucceeded('bun', 'audit', {
      exitCode: 1,
      output: JSON.stringify({ fixture: [{ ...finding, id: {} }] }),
    }),
  ).toBe(false);
});
it('accepts the optional ID omission in a Berry tree but rejects malformed IDs', () => {
  const { ID: _id, ...withoutId } = yarnBerry.children;
  expect(
    packageDiagnosticSucceeded('yarn', 'audit', {
      exitCode: 1,
      output: JSON.stringify({ ...yarnBerry, children: withoutId }),
    }),
  ).toBe(true);
  expect(
    packageDiagnosticSucceeded('yarn', 'audit', {
      exitCode: 1,
      output: JSON.stringify({ ...yarnBerry, children: { ...withoutId, ID: {} } }),
    }),
  ).toBe(false);
});

it('validates any Classic advisory row rather than trusting the final summary alone', () => {
  const row = { type: 'auditAdvisory', data: { advisory: finding, resolution: { id: 42, path: 'fixture' } } };
  expect(
    packageDiagnosticSucceeded('yarn', 'audit', {
      exitCode: 8,
      output: `${JSON.stringify(row)}\n${JSON.stringify(yarnAudit)}`,
    }),
  ).toBe(true);

  for (const data of [
    { advisory: {}, resolution: { id: 42, path: 'fixture' } },
    { advisory: finding, resolution: {} },
  ]) {
    expect(
      packageDiagnosticSucceeded('yarn', 'audit', {
        exitCode: 8,
        output: `${JSON.stringify({ type: 'auditAdvisory', data })}\n${JSON.stringify(yarnAudit)}`,
      }),
    ).toBe(false);
  }
});
