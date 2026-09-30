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

describe('le budget du job tient dans ses propres bornes', () => {
  /*
   * Mesuré le 2026-09-30 : préparation ~13 min + suite plafonnée par
   * `globalTimeout` + canari plafonné = 88 min pour un job plafonné à 90. Deux
   * minutes de marge dans le PIRE cas autorisé par nos propres bornes — et un
   * job tué par le coureur n'écrit aucun rapport.
   *
   * Ce cas interdit que les bornes redeviennent incohérentes : quelqu'un qui
   * remonte `globalTimeout` sans toucher au plafond du job le fait rougir.
   */
  const PREPARATION_MIN = 13;
  const MARGE_MINIMALE_MIN = 10;

  it('préparation + suite + canari laissent une marge réelle sous le plafond', () => {
    const config = readFileSync(join(__dirname, '..', '..', 'playwright.config.ts'), 'utf8');
    const m = /globalTimeout:\s*(\d+)\s*\*\s*60_000/u.exec(config);

    expect(m, '`globalTimeout` introuvable : la garde ne mesure rien').not.toBeNull();

    const suite = Number(m![1]);
    const minutesCanari = canari?.['timeout-minutes'] ?? 0;
    const plafond = jobDuCanari?.['timeout-minutes'] ?? 0;
    const marge = plafond - (PREPARATION_MIN + suite + minutesCanari);

    expect(
      marge,
      `pire cas : ${PREPARATION_MIN} (préparation) + ${suite} (suite) + ${canari} (canari) = ` +
        `${PREPARATION_MIN + suite + minutesCanari} min pour un plafond de ${plafond}. ` +
        `Marge ${marge} min, minimum exigé ${MARGE_MINIMALE_MIN}. Un job tué n'écrit aucun rapport.`,
    ).toBeGreaterThanOrEqual(MARGE_MINIMALE_MIN);
  });
});
