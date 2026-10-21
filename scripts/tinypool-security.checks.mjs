import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);

if (process.argv[2] === '--probe') {
  const { default: Tinypool } = await import(pathToFileURL(process.argv[3]).href);
  const scenario = process.argv[4];
  const directory = mkdtempSync(join(tmpdir(), 'vibecore-tinypool-'));
  const worker = join(directory, 'worker.mjs');
  const alternate = join(directory, 'alternate.mjs');
  writeFileSync(
    worker,
    'export default (value) => ({value: value * 2, inherited: globalThis.__tinypoolProbe === true});\n',
  );
  writeFileSync(alternate, 'export default () => ({value: -1, inherited: true});\n');

  let pool;

  try {
    if (scenario === 'worker-options') {
      Object.prototype.execArgv = ['--import', 'data:text/javascript,globalThis.__tinypoolProbe=true'];
    }

    pool = new Tinypool({ filename: worker, minThreads: 1, maxThreads: 1 });
    delete Object.prototype.execArgv;

    if (scenario === 'run-options') {
      Object.prototype.filename = alternate;
    }

    const task = pool.run(21, {});
    delete Object.prototype.filename;

    const observed = await task;
    process.stdout.write(`${JSON.stringify({ scenario, observed })}\n`);
    assert.deepEqual(observed, { value: 42, inherited: false });
  } finally {
    delete Object.prototype.execArgv;
    delete Object.prototype.filename;
    await pool?.destroy();
    rmSync(directory, { recursive: true, force: true });
  }
} else {
  const require = createRequire(import.meta.url);
  const entry = process.argv[2] || createRequire(require.resolve('vitest/package.json')).resolve('tinypool');

  for (const scenario of ['worker-options', 'run-options']) {
    test(`real Tinypool ignores polluted prototype: ${scenario}`, () => {
      const result = spawnSync(process.execPath, [self, '--probe', entry, scenario], { encoding: 'utf8' });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.deepEqual(JSON.parse(result.stdout).observed, { value: 42, inherited: false });
    });
  }
}
