import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const destination = dirname(fileURLToPath(import.meta.url));
const root = resolve(destination, '../../..');
const temporary = mkdtempSync(join(tmpdir(), 'e2e-gate-reports-'));

const scenarios = {
  completed: `const { test, expect } = require('@playwright/test');
test('executed success', () => expect(2 + 2).toBe(4));
test.skip('explicit platform exclusion', () => {});
test('conditional platform exclusion', () => test.skip(true, 'Fixture explicit exclusion'));
test('expected failure', () => { test.fail(); expect(false).toBe(true); });
test('success on retry', ({}, info) => expect(info.retry).toBe(1));
`,
  serial: `const { test, expect } = require('@playwright/test');
test.describe.serial('serial dependency', () => {
  test('fails before dependent test', () => expect(false).toBe(true));
  test('not executed after dependency failure', () => expect(true).toBe(true));
});
`,
  timeout: `const { test } = require('@playwright/test');
test('unfinished operation at global deadline', async () => { await new Promise(() => {}); });
test('not reached before global deadline', () => {});
`,
  teardown: `const { test, expect } = require('@playwright/test');
test('success before teardown error', () => expect(true).toBe(true));
`,
};

try {
  symlinkSync(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');

  for (const [name, source] of Object.entries(scenarios)) {
    const directory = join(temporary, name);
    mkdirSync(directory);
    writeFileSync(join(directory, 'sample.spec.cjs'), source);
    writeFileSync(
      join(directory, 'teardown.cjs'),
      `module.exports = () => { throw new Error('Fixture global teardown failed'); };\n`,
    );
    writeFileSync(
      join(directory, 'playwright.config.cjs'),
      `module.exports = {
testDir: __dirname, testMatch: 'sample.spec.cjs', workers: 1, retries: ${name === 'completed' ? 1 : 0},
globalTimeout: ${name === 'timeout' ? 1500 : 0},
${name === 'teardown' ? "globalTeardown: require.resolve('./teardown.cjs')," : ''}
reporter: 'json', outputDir: './output',
};\n`,
    );

    const run = spawnSync(
      process.execPath,
      [
        join(root, 'node_modules/@playwright/test/cli.js'),
        'test',
        '--config',
        join(directory, 'playwright.config.cjs'),
      ],
      {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, FORCE_COLOR: '0' },
      },
    );

    if (run.error) {
      throw run.error;
    }

    assert.equal(run.status, name === 'completed' ? 0 : 1, `Unexpected exit for ${name}`);

    const report = JSON.parse(run.stdout);

    if (name === 'timeout') {
      assert(report.errors.some((error) => error.message.includes('test suite to run')));
      assert(report.errors.some((error) => error.message.includes('teardown for test suite')));
    }

    // Redact only the generated temporary root; report outcomes are unchanged.
    writeFileSync(
      join(destination, `${name}.json`),
      JSON.stringify(report, null, 2).split(temporary).join('<fixture-root>') + '\n',
    );
    writeFileSync(join(destination, `${name}.source.txt`), source);
    console.log(`${name}: actual Playwright exit ${run.status}`);
  }
  console.log(
    `Playwright ${JSON.parse(readFileSync(join(root, 'node_modules/@playwright/test/package.json'), 'utf8')).version}`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
