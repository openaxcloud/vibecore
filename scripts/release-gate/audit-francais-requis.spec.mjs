import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync(new URL('../../.github/workflows/i18n-live-audit.yml', import.meta.url), 'utf8'));

describe('audit français requis sans bloquer les documents', () => {
  it('émet toujours le contrôle requis et garde les quatre crawls', () => {
    expect(Object.keys(workflow.on)).toContain('pull_request');
    expect(workflow.on.pull_request?.['paths-ignore']).toBeUndefined();
    expect(workflow.jobs['live-audit'].needs).toBe('pertinence');
    expect(workflow.jobs['live-audit'].if).toBe("needs.pertinence.outputs.auditer == 'true'");
    expect(workflow.jobs['live-audit'].strategy.matrix.project).toHaveLength(4);
    expect(workflow.jobs.verdict.name).toBe('Audit français — verdict');
    expect(workflow.jobs.verdict.needs).toEqual(['pertinence', 'live-audit']);
    expect(workflow.jobs.verdict.if).toBe('always()');
  });

  for (const [name, pertinence, auditer, crawls, success] of [
    ['quatre crawls verts', 'success', 'true', 'success', true],
    ['crawl rouge', 'success', 'true', 'failure', false],
    ['crawl annulé', 'success', 'true', 'cancelled', false],
    ['documentation', 'success', 'false', 'skipped', true],
    ['tri annulé', 'cancelled', 'false', 'skipped', false],
    ['tri illisible', 'success', '', 'success', false],
  ]) {
    it(name, () => {
      let passed = true;

      try {
        execFileSync('bash', ['-e', '-c', workflow.jobs.verdict.steps[0].run], {
          env: { ...process.env, PERTINENCE: pertinence, AUDITER: auditer, CRAWLS: crawls },
          stdio: 'pipe',
        });
      } catch {
        passed = false;
      }

      expect(passed).toBe(success);
    });
  }
});
