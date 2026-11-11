import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('distinguishes Playwright declarations from member test calls without losing required coverage', () => {
  const result = spawnSync(process.execPath, ['--test', join(__dirname, 'e2e-spec-discovery-contracts.mjs')], {
    encoding: 'utf8',
    timeout: 30_000,
  });

  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
