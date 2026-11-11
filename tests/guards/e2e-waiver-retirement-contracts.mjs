import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = (name) => JSON.parse(readFileSync(join(root, `tests/fixtures/e2e-gate/${name}.json`), 'utf8'));
const allSpecs = (suites) => suites.flatMap((suite) => [...(suite.specs ?? []), ...allSpecs(suite.suites ?? [])]);

function only(name, title) {
  const report = fixture(name);
  const spec = allSpecs(report.suites).find((entry) => entry.title === title);
  assert.ok(spec);

  return { ...report, errors: [], suites: [{ title: 'sample.spec.cjs', file: 'sample.spec.cjs', specs: [spec] }] };
}

function gate(reports, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'e2e-no-waivers-'));

  try {
    mkdirSync(join(directory, 'scripts'));
    mkdirSync(join(directory, 'tests/e2e'), { recursive: true });
    copyFileSync(join(root, 'scripts/e2e-gate.mjs'), join(directory, 'scripts/e2e-gate.mjs'));

    if (options.legacyPolicy) {
      writeFileSync(join(directory, 'tests/e2e/e2e-waivers.json'), JSON.stringify(options.legacyPolicy));
    }

    for (const [file, source] of Object.entries(options.specs ?? {})) {
      writeFileSync(join(directory, 'tests/e2e', file), source);
    }

    const paths = reports.map((report, index) => {
      const path = join(directory, `${index}.json`);

      if (report !== undefined) {
        writeFileSync(path, typeof report === 'string' ? report : JSON.stringify(report));
      }

      return path;
    });
    const result = spawnSync(process.execPath, [join(directory, 'scripts/e2e-gate.mjs'), ...paths], {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        E2E_SPEC: options.spec ?? 'sample.spec.cjs',
        E2E_EXPECTED_REPORTS: options.expectedReports ?? String(paths.length),
      },
    });
    assert.ifError(result.error);

    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function rejects(result, message) {
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, message);
}

test('four complete actual Playwright reports pass without a policy file', () => {
  const result = gate(Array.from({ length: 4 }, () => fixture('completed')), { expectedReports: '4' });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /no failure waivers/);
  assert.match(result.output, /flaky \(passed on retry\): 1/);
});

test('a legacy policy cannot waive an executed unexpected failure', () => {
  const report = only('serial', 'fails before dependent test');
  const result = gate([report], {
    legacyPolicy: {
      expires: '2026-11-04',
      waived: [{ test: 'sample.spec.cjs › fails before dependent test', unstable: true }],
    },
  });
  rejects(result, /failing tests that are NOT waived/);
  assert.match(result.output, /sample\.spec\.cjs › fails before dependent test/);
  assert.doesNotMatch(result.output, /waiver expired/);
});

test('an expired legacy policy does not obstruct a complete passing result', () => {
  const result = gate([fixture('completed')], { legacyPolicy: { expires: '2026-11-04', waived: [] } });
  assert.equal(result.status, 0, result.output);
});

test('a failure cannot be overwritten by later passing reports for the same test', () => {
  const failure = only('serial', 'fails before dependent test');
  const pass = only('completed', 'executed success');
  pass.suites[0].specs[0].title = failure.suites[0].specs[0].title;
  rejects(gate([failure, pass, pass, pass], { expectedReports: '4' }), /failing tests that are NOT waived/);
});

test('no reports and missing expected shards fail closed', () => {
  rejects(gate([]), /usage:/);
  rejects(gate([fixture('completed'), fixture('completed'), fixture('completed')], { expectedReports: '4' }), /expected 4 shard report\(s\), received 3/);
});

for (const expectedReports of ['0', '-1', '4.5', 'garbage']) {
  test(`invalid expected report count ${expectedReports} fails closed`, () => {
    rejects(gate([fixture('completed')], { expectedReports }), /must be a positive integer/);
  });
}

test('an absent report file fails closed', () => {
  rejects(gate([undefined]), /could not read Playwright report/);
});

test('malformed JSON fails closed', () => {
  rejects(gate(['{ malformed']), /could not read Playwright report/);
});

for (const report of [{}, { suites: [] }]) {
  test(`a report without test suites fails closed: ${JSON.stringify(report)}`, () => {
    rejects(gate([report]), /AUCUN test/);
  });
}

test('one empty shard cannot be replaced by the other three complete reports', () => {
  rejects(gate([fixture('completed'), { suites: [] }, fixture('completed'), fixture('completed')]), /AUCUN test/);
});

test('a genuinely missing non-runtime spec keeps the full-suite gate red', () => {
  rejects(gate([fixture('completed')], { spec: '', specs: { 'missing.spec.ts': "test('must run', () => {});" } }), /missing\.spec\.ts/);
});

test('zero expected full-suite specs is not a vacuous pass', () => {
  rejects(gate([fixture('completed')], { spec: '' }), /aucun fichier de spec attendu/);
});

for (const name of ['teardown', 'timeout']) {
  test(`actual ${name} global errors remain blocking`, () => {
    rejects(gate([fixture(name)]), /global report errors/);
  });
}

for (const [name, title] of [['serial', 'not executed after dependency failure'], ['timeout', 'not reached before global deadline']]) {
  test(`involuntary missing execution from ${name} remains blocking`, () => {
    rejects(gate([only(name, title)]), /incomplete test execution/);
  });
}

test('no test variants, no attempts and interrupted attempts remain blocking', () => {
  for (const mutate of [
    (spec) => { spec.tests = []; },
    (spec) => { spec.tests[0].results = []; },
    (spec) => { spec.tests[0].results[0].status = 'interrupted'; },
  ]) {
    const report = only('completed', 'executed success');
    mutate(report.suites[0].specs[0]);
    rejects(gate([report]), /incomplete test execution/);
  }
});

test('a later success cannot erase an earlier incomplete execution', () => {
  const missing = only('timeout', 'not reached before global deadline');
  const pass = only('completed', 'executed success');
  pass.suites[0].specs[0].title = missing.suites[0].specs[0].title;
  rejects(gate([missing, pass]), /incomplete test execution/);
});
