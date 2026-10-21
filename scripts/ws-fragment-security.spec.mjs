import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('enforces fragment limits with real WebSocket peers', () => {
  const script = fileURLToPath(new URL('./ws-fragment-security.checks.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
});
