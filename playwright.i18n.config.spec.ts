import { readFileSync } from 'node:fs';

import { parse } from 'yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Régression : le shard `Playwright mobile-390` de l'audit i18n mourait par
 * timeout de job, systématiquement, sur toutes les branches — et sans jamais
 * livrer d'artefact, donc sans jamais dire pourquoi.
 *
 * Le mécanisme n'était pas un manque de capacité : les trois autres viewports
 * bouclent le même audit (282 JSON, 564 captures) en 7 à 11 minutes. C'était
 * une multiplication :
 *
 *   30 min de budget par test  x  (1 essai + 2 reprises CI)  =  90 min
 *
 * soit exactement le `timeout-minutes` du job. Dès qu'un test dépassait son
 * budget une fois, la cascade de reprises garantissait la mort du job, et le
 * timeout de JOB tue le runner avant les étapes `if: always()` qui uploadent la
 * preuve et les logs. La panne effaçait donc son propre diagnostic.
 *
 * Deux garde-fous, testés ici :
 *   - l'audit ne reprend pas (il collecte une preuve, il ne teste pas un flake) ;
 *   - le plafond de l'ÉTAPE d'audit reste strictement sous celui du job, pour
 *     que les étapes de diagnostic et d'upload tournent toujours.
 */

const WORKFLOW = '.github/workflows/i18n-live-audit.yml';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadConfig(ci: boolean) {
  vi.resetModules();
  vi.stubEnv('CI', ci ? 'true' : '');

  const mod = await import('./playwright.i18n.config.ts');

  return mod.default as { retries?: number; workers?: number };
}

interface WorkflowShape {
  jobs: Record<
    string,
    {
      'timeout-minutes'?: number;
      steps: { name?: string; 'timeout-minutes'?: number; if?: string }[];
    }
  >;
}

function loadWorkflow(): WorkflowShape {
  return parse(readFileSync(WORKFLOW, 'utf8')) as WorkflowShape;
}

describe("configuration de l'audit i18n live", () => {
  it("ne reprend jamais un audit, même en CI, là où la suite E2E ordinaire reprend deux fois", async () => {
    await expect(loadConfig(true)).resolves.toMatchObject({ retries: 0 });
    await expect(loadConfig(false)).resolves.toMatchObject({ retries: 0 });

    // Le contraste est le cœur du correctif : la config de base, elle, reprend.
    vi.resetModules();
    vi.stubEnv('CI', 'true');

    const base = (await import('./playwright.config.ts')).default as { retries?: number };

    expect(base.retries).toBe(2);
  });

  it("garde le budget d'une exécution complète sous le plafond du job", () => {
    const job = loadWorkflow().jobs['live-audit'];
    const jobTimeout = job['timeout-minutes'];
    const auditStep = job.steps.find((step) => step.name === 'Run exhaustive EN/FR live audit');

    expect(jobTimeout).toBeTypeOf('number');
    expect(auditStep).toBeDefined();

    const stepTimeout = auditStep!['timeout-minutes'];

    // Sans plafond d'étape, un dépassement tue le job et emporte les artefacts.
    expect(stepTimeout).toBeTypeOf('number');
    expect(stepTimeout!).toBeLessThan(jobTimeout!);
  });

  it("laisse tourner la collecte de preuve et de logs après un audit en échec", () => {
    const job = loadWorkflow().jobs['live-audit'];
    const survivors = ['Verify complete proof set', 'Collect local stack diagnostics', 'Upload i18n audit proof'];

    for (const name of survivors) {
      const step = job.steps.find((candidate) => candidate.name === name);

      expect(step, `étape « ${name} » présente`).toBeDefined();
      expect(step!.if, `étape « ${name} » exécutée même après échec`).toBe('always()');
    }
  });
});
