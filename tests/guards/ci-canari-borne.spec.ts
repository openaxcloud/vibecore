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

/*
 * MISE À JOUR DU 2026-09-30 — LA PROTECTION A CHANGÉ DE FORME, ET ELLE EST
 * PLUS FORTE.
 *
 * Ce garde exigeait que la porte rende son verdict AVANT le canari, dans le
 * même job : c'était le seul moyen de protéger le verdict quand les deux
 * partageaient un budget. Depuis la découpe en tranches, la porte vit dans un
 * job SÉPARÉ (`verdict`, celui qui porte le nom requis) et le canari dans une
 * tranche. Le canari ne peut donc plus, structurellement, consommer le budget
 * du contrôle requis ni le faire annuler.
 *
 * On n'assouplit pas le garde, on le rebrase sur la garantie plus forte : la
 * porte doit être AILLEURS que dans le job du canari, et le job qui rend le
 * verdict ne doit contenir aucun canari.
 */
const jobDuVerdict = Object.values(workflow.jobs).find((job) =>
  (job.steps ?? []).some((etape) => (etape.run ?? '').includes('scripts/e2e-gate.mjs')),
);

/** Budget dont disposait le job AVANT l'ajout du canari : mesuré suffisant pour la suite requise. */
const BUDGET_HISTORIQUE_MIN = 75;

describe('le canari iOS est borné et ne peut plus faire annuler le contrôle requis', () => {
  it('TÉMOIN — le canari et la porte sont tous deux trouvés', () => {
    expect(canari, 'étape canari_ios introuvable : la garde ne mesure rien').toBeDefined();
    expect(jobDuVerdict, 'aucun job n’exécute e2e-gate : la garde ne mesure rien').toBeDefined();
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

  it('LA GARANTIE, désormais structurelle : la porte n’est PAS dans le job du canari', () => {
    expect(
      jobDuVerdict,
      'si la porte revient dans le job du canari, un canari lent peut de nouveau faire annuler le verdict',
    ).not.toBe(jobDuCanari);
  });

  it('et le job qui rend le verdict ne contient aucun canari', () => {
    const canaris = (jobDuVerdict?.steps ?? []).filter((etape) => etape.id === 'canari_ios');

    expect(canaris, 'un canari dans le job du verdict remettrait les deux dans le même budget').toHaveLength(0);
  });
});
