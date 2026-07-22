import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

/**
 * Regression guard for the api vitest discovery glob.
 *
 * The config's `include` glob must cover the whole `src` tree, not just
 * `src/tests/**`. Several regression specs (e.g. the Supabase
 * externalAccountId stability guard) live next to the source they test
 * under `src/integrations/**`. If the glob narrows back to `src/tests/**`,
 * those specs silently stop running in CI and the fixes they guard can
 * regress without any test failure.
 *
 * This spec drives the real vitest collector (`vitest list`) against the
 * actual config and asserts the out-of-tree spec is collected.
 */
describe('vitest.config.ts discovery glob', () => {
  const serviceRoot = resolve(__dirname, '..', '..');
  const vitestBin = resolve(serviceRoot, '..', '..', 'node_modules', '.bin', 'vitest');

  // Spec that lives OUTSIDE src/tests/ and must still be collected.
  const outOfTreeSpec = 'src/integrations/providers/supabase.account-stability.spec.ts';

  it('collects spec files outside src/tests/', async () => {
    expect(existsSync(resolve(serviceRoot, outOfTreeSpec))).toBe(true);

    // ASYNC exec, jamais execFileSync : la collecte `vitest list` dure ~60 s en
    // CI chargée et un exec SYNCHRONE bloque l'event-loop du worker pendant ce
    // temps — le worker ne répond plus au RPC du pool (`onTaskUpdate`) et
    // vitest sort en « Unhandled Error: Timeout calling onTaskUpdate » avec
    // TOUTE la suite verte (flake chronique observé sur les PR #34/#40).
    const { stdout } = await execFileAsync(vitestBin, ['list', '--config', 'vitest.config.ts'], {
      cwd: serviceRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });

    expect(stdout).toContain('supabase.account-stability.spec.ts');
  }, 180_000);
});
