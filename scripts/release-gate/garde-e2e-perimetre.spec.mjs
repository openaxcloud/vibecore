import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const FLUX = parse(readFileSync(new URL('../../.github/workflows/e2e.yml', import.meta.url), 'utf8'));

/**
 * Un contrôle qui s'exécute là où il n'a rien à vérifier n'est pas neutre :
 * il coûte à ceux qui en ont besoin.
 *
 * Mesuré le 2026-09-05 sur les 60 derniers runs E2E : **30 portaient sur des
 * commits ne touchant QUE de la documentation**. Chacun occupait les runners
 * environ une heure, et cette saturation faisait échouer les vraies PR —
 * `agent-message-density.spec.ts` rougissait 3 fois sur 3 sous 24 exécutions
 * concurrentes, et passait sur le même arbre une fois la file vide.
 */
describe('la suite navigateur ne tourne pas pour un changement documentaire', () => {
  // DISCRIMINANT — sans le job de périmètre, rien ne conditionne les étapes.
  it('un job de périmètre décide, et le job e2e en dépend', () => {
    expect(Object.keys(FLUX.jobs)).toContain('perimetre');
    expect(FLUX.jobs.e2e.needs).toBe('perimetre');
  });

  // DISCRIMINANT — le nom du check ne doit pas changer.
  it('garde le nom du check requis par la protection de branche', () => {
    expect(FLUX.jobs.verdict.name).toBe('Playwright local stack');
    expect(FLUX.jobs.verdict.needs).toEqual(['perimetre', 'e2e']);
    expect(FLUX.jobs.verdict.if).toBe('always()');
  });

  // DISCRIMINANT — chaque étape coûteuse doit être conditionnée.
  it('les deux jobs coûteux sont conditionnés par le périmètre', () => {
    for (const name of ['e2e', 'canari-ios']) {
      expect(FLUX.jobs[name].needs).toBe('perimetre');
      expect(FLUX.jobs[name].if).toContain("needs.perimetre.outputs.code == 'true'");
    }

    const verdict = FLUX.jobs.verdict.steps;
    expect(verdict[0].run).toContain('périmètre non mesuré');
    expect(verdict[0].run).toContain('périmètre illisible');
    expect(verdict.slice(1).every((step) => step.if === "needs.perimetre.outputs.code == 'true'")).toBe(true);
  });

  /**
   * GARDE ASSUMÉE — passe des deux côtés à dessein. Elle protège contre le troc
   * inverse : un filtre trop zélé qui sauterait la suite sur du code non testé,
   * bien pire que le gaspillage qu'il évite.
   */
  it('exécute par défaut : hors pull request, ou au moindre doute', () => {
    const script = FLUX.jobs.perimetre.steps.find((s) => s.id === 'detecte').run;

    expect(script).toContain("!= 'pull_request'");
    expect(script).toContain('base ou tete illisible');
    expect(script).toContain('aucun fichier detecte');

    // Chacun de ces chemins de doute doit ÉCRIRE code=true, jamais false.
    for (const bloc of script.split('exit 0').slice(0, 3)) {
      expect(bloc).toContain('code=true');
    }
  });
});

describe('la décision de périmètre s’exécute dans un vrai dépôt', () => {
  const cases = [
    ['document', 'docs/guide.md', 'pull_request', false],
    ['code', 'app/client.ts', 'pull_request', true],
    ['workflow', '.github/workflows/e2e.yml', 'pull_request', true],
    ['aucun fichier', null, 'pull_request', true],
    ['lancement manuel', 'docs/guide.md', 'workflow_dispatch', true],
  ];

  for (const [name, path, event, expected] of cases) {
    it(name, () => {
      const cwd = mkdtempSync(join(tmpdir(), 'perimetre-e2e-'));
      const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

      try {
        git('init', '-q');
        git('config', 'user.name', 'Sonde');
        git('config', 'user.email', 'sonde@example.invalid');
        git('commit', '--allow-empty', '-qm', 'base');

        const base = git('rev-parse', 'HEAD');

        if (path) {
          git('commit', '--allow-empty', '-qm', 'changement');

          const blob = git('hash-object', '-w', '--stdin');
          git('update-index', '--add', '--cacheinfo', '100644', blob, path);
          git('commit', '-qm', 'fichier');
        }

        const head = git('rev-parse', 'HEAD');
        const output = join(cwd, 'output');
        writeFileSync(output, '');

        const script = FLUX.jobs.perimetre.steps
          .find((step) => step.id === 'detecte')
          .run.replaceAll('${{ github.event_name }}', event)
          .replaceAll('${{ github.event.pull_request.base.sha }}', base)
          .replaceAll('${{ github.event.pull_request.head.sha }}', head);
        execFileSync('bash', ['-c', script], { cwd, env: { ...process.env, GITHUB_OUTPUT: output } });
        expect(readFileSync(output, 'utf8')).toContain(`code=${expected}`);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});
