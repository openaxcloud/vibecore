import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pass = {
  suites: [{
    title: 'required.spec.ts',
    file: 'required.spec.ts',
    specs: [{
      title: 'required case',
      file: 'required.spec.ts',
      tests: [{ status: 'expected', expectedStatus: 'passed', results: [{ status: 'passed' }] }],
    }],
  }],
};

function gate(source) {
  const directory = mkdtempSync(join(tmpdir(), 'e2e-spec-discovery-'));

  try {
    mkdirSync(join(directory, 'scripts'));
    mkdirSync(join(directory, 'tests/e2e'), { recursive: true });
    copyFileSync(join(root, 'scripts/e2e-gate.mjs'), join(directory, 'scripts/e2e-gate.mjs'));
    writeFileSync(join(directory, 'tests/e2e/required.spec.ts'), "test('required case', () => {});");
    writeFileSync(join(directory, 'tests/e2e/preview-runtime.spec.ts'), source);
    // Also works against the pre-retirement scanner for the negative control.
    writeFileSync(join(directory, 'tests/e2e/e2e-waivers.json'), JSON.stringify({
      expires: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
      waived: [],
    }));
    const paths = Array.from({ length: 4 }, (_, index) => {
      const path = join(directory, `${index}.json`);
      writeFileSync(path, JSON.stringify(pass));

      return path;
    });
    const result = spawnSync(process.execPath, [join(directory, 'scripts/e2e-gate.mjs'), ...paths], {
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, E2E_EXPECTED_REPORTS: '4', E2E_SPEC: '' },
    });
    assert.ifError(result.error);

    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('RegExp.test in a runtime-only test is not a second Playwright declaration', () => {
  const result = gate("test('runtime', { tag: '@runtime' }, () => { /url/.test('url'); });");
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /fichiers de specs attendus : 1/);
});

test('ordinary object.test calls do not create expected spec coverage', () => {
  const result = gate("import { helper } from './helper'; helper.test('not a Playwright declaration');");
  assert.equal(result.status, 0, result.output);
});

test('the actual runtime-only preview source stays outside the production non-runtime scope', () => {
  const result = gate(readFileSync(join(root, 'tests/e2e/preview-runtime.spec.ts'), 'utf8'));
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /fichiers de specs attendus : 1/);
});

test('a genuine untagged test is still required even beside RegExp.test', () => {
  const result = gate("test('must run', () => { /url/.test('url'); });");
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /preview-runtime\.spec\.ts/);
  assert.match(result.output, /joués par AUCUNE tranche/);
});

test('a mixed runtime/non-runtime file is still required', () => {
  const result = gate("test('runtime', { tag: '@runtime' }, () => { /url/.test('url'); });\ntest('must run', () => {});");
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /preview-runtime\.spec\.ts/);
});

test('test.describe declarations keep their existing coverage semantics', () => {
  const result = gate("test.describe('required group', () => { test('must run', () => {}); });");
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /preview-runtime\.spec\.ts/);
});
