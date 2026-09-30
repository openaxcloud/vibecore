import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * LA SUITE E2E DOIT TOUJOURS RENDRE UN VERDICT.
 *
 * Mesuré le 2026-09-30 : le contrôle requis de #597 a tourné 91 minutes puis
 * s'est terminé en `cancelled`, sans rapport et sans une ligne de conclusion.
 * Le coureur GitHub l'avait tué au plafond du job ; Playwright, sans borne
 * globale, n'avait rien écrit.
 *
 * Ce garde COUPLE les deux plafonds : celui de Playwright doit rester
 * strictement sous celui du job, parce que seul Playwright sait rendre un
 * rapport en s'arrêtant. Inverser les deux, c'est revenir au silence.
 */

const RACINE = join(__dirname, '..');
const CONFIG = readFileSync(join(RACINE, 'playwright.config.ts'), 'utf8');
const WORKFLOW = readFileSync(join(RACINE, '.github/workflows/e2e.yml'), 'utf8');

function minutesDuJob(): number {
  const m = /timeout-minutes:\s*(\d+)/u.exec(WORKFLOW);
  expect(m, 'aucun `timeout-minutes` dans e2e.yml : le garde ne mesure rien').not.toBeNull();

  return Number(m![1]);
}

function minutesDePlaywright(): number {
  const m = /globalTimeout:\s*(\d+)\s*\*\s*60_000/u.exec(CONFIG);
  expect(m, '`globalTimeout` absent de playwright.config.ts').not.toBeNull();

  return Number(m![1]);
}

describe('le plafond de temps de la suite E2E', () => {
  it('la sonde lit bien les deux fichiers — sinon les cas suivants ne mesurent rien', () => {
    expect(CONFIG.length).toBeGreaterThan(500);
    expect(WORKFLOW.length).toBeGreaterThan(500);

    /* Témoin positif : une clé dont on SAIT qu'elle est là. */
    expect(CONFIG).toContain('testDir');
    expect(WORKFLOW).toContain('timeout-minutes');
  });

  it('Playwright porte une borne globale', () => {
    expect(minutesDePlaywright()).toBeGreaterThan(0);
  });

  it('cette borne est STRICTEMENT sous le plafond du job — c’est tout l’intérêt', () => {
    const playwright = minutesDePlaywright();
    const job = minutesDuJob();

    expect(
      playwright,
      `Playwright s'arrête à ${playwright} min, le coureur tue le job à ${job} min. ` +
        "Playwright doit s'arrêter le PREMIER : lui seul rend un rapport en s'arrêtant.",
    ).toBeLessThan(job);
  });

  it('la suite s’arrête après une rafale d’échecs plutôt que d’épuiser son temps', () => {
    expect(CONFIG).toMatch(/maxFailures:\s*process\.env\.CI\s*\?\s*\d+\s*:\s*0/u);
  });

  it('on peut prouver un correctif par SON scénario, sans jouer la suite entière', () => {
    /*
     * Sans cette entrée, la seule façon de re-tester un correctif était de
     * relancer les quatre-vingt-dix minutes — ce qui, quand la suite expire, ne
     * fait que racheter le même silence. Le défaut par défaut ne change pas :
     * entrée vide = `tests/e2e`, comme avant.
     */
    expect(WORKFLOW, "l'entrée `spec` doit exister pour cibler un scénario").toMatch(/inputs:\s*\n\s*spec:/u);
    expect(WORKFLOW, 'le chemin ciblé doit être passé à Playwright').toContain('CIBLE="${{ inputs.spec }}"');
    expect(WORKFLOW, 'entrée vide = suite complète, sinon on change le comportement par défaut').toContain(
      'CIBLE="tests/e2e"',
    );
  });
});
