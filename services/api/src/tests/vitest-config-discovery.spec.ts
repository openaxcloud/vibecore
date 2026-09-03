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

    /*
     * Budget mesure le 2026-09-03 sur la meme machine, `vitest list` seul :
     *
     *   machine au repos ............  47 s,  78 s
     *   charge moderee ..............  116 s, 126 s, 146 s
     *   avec un build concurrent ....  181 s, 185 s   <- ROUGE a 180 s
     *
     * Le budget de 180 s tombait exactement dans la dispersion de la collecte,
     * qui parcourt les 297 fichiers de specs du service. Resultat : un rouge qui
     * ne dit rien du glob et tout de la charge de la machine — observe 3 fois en
     * une journee, chaque fois vert au re-run.
     *
     * L'ASSERTION n'est pas touchee : c'est toujours `stdout` qui doit contenir
     * le spec hors `src/tests/`. Seule l'horloge change. 600 s laisse de la marge
     * sans rien masquer — une collecte qui atteindrait 10 minutes serait une
     * vraie regression, et echouerait toujours.
     */
  }, 600_000);
});
