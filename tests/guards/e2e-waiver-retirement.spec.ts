import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('enforces the no-waiver gate contracts with the actual Node CLI', () => {
  const result = spawnSync(process.execPath, ['--test', join(__dirname, 'e2e-waiver-retirement-contracts.mjs')], {
    encoding: 'utf8',
    timeout: 30_000,
  });

  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
