import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('checks native compression cleanup with real HTTP clients and zlib streams', () => {
  const script = fileURLToPath(new URL('./compression-close-security.checks.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
});
