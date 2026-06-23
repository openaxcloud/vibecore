import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

  it('collects spec files outside src/tests/', () => {
    expect(existsSync(resolve(serviceRoot, outOfTreeSpec))).toBe(true);

    const output = execFileSync(vitestBin, ['list', '--config', 'vitest.config.ts'], {
      cwd: serviceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(output).toContain('supabase.account-stability.spec.ts');
  });
});
