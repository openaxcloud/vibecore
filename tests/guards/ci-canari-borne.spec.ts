import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/*
 * UN CANARI NON BLOQUANT NE DOIT JAMAIS FAIRE ANNULER LE CONTRÔLE REQUIS.
 *
 * Mesuré le 2026-09-28/29 : 4 des 12 derniers passages de « Production E2E »
 * se sont terminés `cancelled` à ~75 min — dont #594, dont la porte E2E avait
 * pourtant rendu « gate passes » à 13:09. Le canari WebKit (non bloquant,
 * `continue-on-error`) tourne dans le MÊME job que la suite requise, sans
 * plafond propre : quand la suite Chromium prend 60 min, il consomme le reste
 * du budget, le job atteint `timeout-minutes: 75`, et tout le contrôle requis
 * « Playwright local stack » est annulé. Une PR reste alors bloquée sans rouge
 * à lire — le piège qui a déjà coûté cinq jours.
 *
 * Garde sur la STRUCTURE du workflow (règle 5), pas sur ses commentaires.
 */
type Etape = { name?: string; id?: string; run?: string; 'timeout-minutes'?: number; 'continue-on-error'?: boolean };
type Job = { 'timeout-minutes'?: number; steps?: Etape[] };

const workflow = parse(readFileSync(join(__dirname, '..', '..', '.github/workflows/e2e.yml'), 'utf8')) as {
  jobs: Record<string, Job>;
};

const jobDuCanari = Object.values(workflow.jobs).find((job) =>
  (job.steps ?? []).some((etape) => etape.id === 'canari_ios'),
);

const etapes = jobDuCanari?.steps ?? [];
const canari = etapes.find((etape) => etape.id === 'canari_ios');
const indexPorte = etapes.findIndex((etape) => (etape.run ?? '').includes('scripts/e2e-gate.mjs'));

/** Budget dont disposait le job AVANT l'ajout du canari : mesuré suffisant pour la suite requise. */
const BUDGET_HISTORIQUE_MIN = 75;

describe('le canari iOS est borné et ne peut plus faire annuler le contrôle requis', () => {
  it('TÉMOIN — le canari et la porte E2E sont bien trouvés dans le même job', () => {
    expect(canari, 'étape canari_ios introuvable : la garde ne mesure rien').toBeDefined();
    expect(indexPorte, 'porte e2e-gate introuvable dans le job du canari').toBeGreaterThanOrEqual(0);
  });

  it('le canari reste non bloquant', () => {
    expect(canari?.['continue-on-error']).toBe(true);
  });

  it('LE DÉFAUT — le canari a son PROPRE plafond', () => {
    expect(canari?.['timeout-minutes'], 'sans plafond, le canari consomme le budget du job').toBeGreaterThan(0);
    expect(canari?.['timeout-minutes']).toBeLessThanOrEqual(20);
  });

  it('le job garde, hors canari, au moins le budget historique de la suite requise', () => {
    const job = jobDuCanari?.['timeout-minutes'] ?? 0;
    expect(job - (canari?.['timeout-minutes'] ?? job)).toBeGreaterThanOrEqual(BUDGET_HISTORIQUE_MIN);
  });

  it('la porte rend son verdict AVANT le canari', () => {
    expect(indexPorte).toBeLessThan(etapes.indexOf(canari as Etape));
  });
});
