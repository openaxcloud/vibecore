import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const root = join(__dirname, '../..');
const fixture = (name: string) => JSON.parse(readFileSync(join(root, `tests/fixtures/e2e-gate/${name}.json`), 'utf8'));

function allSpecs(suites: any[]): any[] {
  return suites.flatMap((suite) => [...(suite.specs ?? []), ...allSpecs(suite.suites ?? [])]);
}

function only(name: string, title: string) {
  const report = fixture(name);
  const spec = allSpecs(report.suites).find((entry) => entry.title === title);
  expect(spec).toBeDefined();

  return { ...report, errors: [], suites: [{ title: 'sample.spec.cjs', file: 'sample.spec.cjs', specs: [spec] }] };
}

function gate(reports: unknown[], waived: { test: string; unstable?: boolean }[] = []) {
  const directory = mkdtempSync(join(tmpdir(), 'gate-completeness-'));

  try {
    mkdirSync(join(directory, 'scripts'));
    mkdirSync(join(directory, 'tests/e2e'), { recursive: true });
    copyFileSync(join(root, 'scripts/e2e-gate.mjs'), join(directory, 'scripts/e2e-gate.mjs'));
    writeFileSync(
      join(directory, 'tests/e2e/e2e-waivers.json'),
      JSON.stringify({
        expires: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
        waived,
      }),
    );

    const paths = reports.map((report, index) => {
      const path = join(directory, `${index}.json`);
      writeFileSync(path, JSON.stringify(report));

      return path;
    });
    const result = spawnSync(process.execPath, [join(directory, 'scripts/e2e-gate.mjs'), ...paths], {
      encoding: 'utf8',
      env: { ...process.env, E2E_SPEC: 'sample.spec.cjs', E2E_EXPECTED_REPORTS: String(paths.length) },
    });

    if (result.error) {
      throw result.error;
    }

    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

it('rejects an actual global teardown error even when every test passed', () => {
  const result = gate([fixture('teardown')]);
  expect(result.status).toBe(1);
  expect(result.output).toContain('global report errors');
  expect(result.output).toContain('Fixture global teardown failed');
});

it('rejects actual suite and teardown global deadlines', () => {
  const result = gate([fixture('timeout')]);
  expect(result.status).toBe(1);
  expect(result.output).toContain('global report errors');
  expect(result.output).toContain('test suite to run');
  expect(result.output).toContain('teardown for test suite');
});

it.each([
  ['serial', 'not executed after dependency failure'],
  ['timeout', 'not reached before global deadline'],
])('rejects unexecuted expected-pass case from %s independently of other errors', (name, title) => {
  const report = only(name, title);
  const result = gate([report]);
  expect(result.status).toBe(1);
  expect(result.output).toContain('incomplete test execution');
  expect(result.output).toContain(title);
});

it('cannot waive missing execution or erase it with a later passing report', () => {
  const title = 'not reached before global deadline';
  const report = only('timeout', title);
  const passing = only('completed', 'executed success');
  passing.suites[0].specs[0].title = title;

  const result = gate([report, passing], [{ test: `sample.spec.cjs › ${title}`, unstable: true }]);
  expect(result.status).toBe(1);
  expect(result.output).toContain('incomplete test execution');
});

it('accepts actual explicit skips, expected failures and a retry success', () => {
  const result = gate([fixture('completed')]);
  expect(result.status).toBe(0);
  expect(result.output).toContain('flaky (passed on retry): 1');
});

it('preserves an explicit waiver for an executed failure and reports matched counts', () => {
  const report = only('serial', 'fails before dependent test');

  const result = gate(
    [report],
    [
      { test: 'sample.spec.cjs › fails before dependent test', unstable: true },
      { test: 'sample.spec.cjs › absent policy entry', unstable: true },
    ],
  );
  expect(result.status).toBe(0);
  expect(result.output).toContain('waiver policy entries: 2');
  expect(result.output).toContain('waived failures      : 1');
});

it('does not treat a spec with no reported test variants as executed', () => {
  const report = only('completed', 'executed success');
  report.suites[0].specs[0].tests = [];

  const result = gate([report]);
  expect(result.status).toBe(1);
  expect(result.output).toContain('incomplete test execution');
});

it('rejects an interrupted attempt even without a global error', () => {
  // Deliberate negative variation of a real report, not an observed CI result.
  const report = only('completed', 'executed success');
  report.suites[0].specs[0].tests[0].results[0].status = 'interrupted';

  const result = gate([report]);
  expect(result.status).toBe(1);
  expect(result.output).toContain('incomplete test execution');
  expect(result.output).toContain('last=interrupted');
});
