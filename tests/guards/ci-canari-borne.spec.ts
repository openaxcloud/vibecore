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

  /*
   * CE CAS A ÉTÉ REMPLACÉ, PAS SUPPRIMÉ — 2026-10-01.
   *
   * Il exigeait que le job du canari garde, canari déduit, le budget historique
   * de la suite requise. Ce calcul n'avait de sens que tant que les deux
   * PARTAGEAIENT un job : il mesurait « reste-t-il assez de budget à la suite
   * après le canari ».
   *
   * Le canari vit maintenant dans son propre job (`canari-ios`), qui n'est dans
   * le `needs` de personne. La question n'est donc plus « combien lui reste-t-il »
   * mais « le contrôle requis l'attend-il encore », et c'est une garantie
   * STRUCTURELLE, pas arithmétique. Le cas ci-dessous la pose, et il est plus
   * fort que celui qu'il remplace : aucun réglage de durée ne peut le satisfaire
   * par accident.
   *
   * Mesuré avant le découpage, sur la tranche 1 de l'E2E de `1fb51f092a` :
   * 15 min 12 s de canari sur une tranche de 57 min 30 s, elle-même sur le
   * chemin critique de la porte de release — donc de chaque mise en production.
   */
  it('LA GARANTIE QUI REMPLACE LE CALCUL — le job du canari n’est dans le `needs` de PERSONNE', () => {
    const nomDuJobCanari = Object.entries(workflow.jobs).find(
      ([, job]) => (job.steps ?? []).some((etape) => etape.id === 'canari_ios'),
    )?.[0];

    expect(nomDuJobCanari, 'job du canari introuvable : la garde ne mesure rien').toBeDefined();

    for (const [nom, job] of Object.entries(workflow.jobs)) {
      const dependances = ([] as string[]).concat((job as { needs?: string | string[] }).needs ?? []);

      expect(
        dependances,
        `le job « ${nom} » attend « ${nomDuJobCanari} » : un canari non bloquant redeviendrait ` +
          'du temps sur le chemin critique, ce que le découpage existe pour supprimer.',
      ).not.toContain(nomDuJobCanari);
    }
  });

  it('LA GARANTIE, désormais structurelle : la porte n’est PAS dans le job du canari', () => {
    expect(
      jobDuVerdict,
      'si la porte revient dans le job du canari, un canari lent peut de nouveau faire annuler le verdict',
    ).not.toBe(jobDuCanari);
  });

  it('LA PRÉPARATION EST PARTAGÉE, PAS DUPLIQUÉE — c’était la condition du découpage', () => {
    /*
     * Sortir le canari dans son propre job demande la même préparation : dépôt,
     * Node, pnpm, navigateurs, postgres/redis, base, API, web, admin. Deux
     * copies de 93 lignes divergeraient au premier changement, et c'est
     * exactement pour cette raison que la dette était restée ouverte au lieu
     * d'être « réglée » par un copier-coller
     * (docs/bugs/DETTE-CI-ACTION-COMPOSITE-001.md).
     *
     * Ce cas interdit la régression la plus tentante : réinstaller la pile en
     * ligne dans l'un des deux jobs. Il rougit si un job monte la pile sans
     * passer par l'action commune.
     */
    const ACTION = './.github/actions/preparer-pile-e2e';
    const jobsConcernes = Object.entries(workflow.jobs).filter(([nom]) => nom === 'e2e' || nom === 'canari-ios');

    expect(jobsConcernes.map(([n]) => n).sort(), 'les deux jobs attendus sont introuvables').toEqual([
      'canari-ios',
      'e2e',
    ]);

    for (const [nom, job] of jobsConcernes) {
      const etapes = job.steps ?? [];

      expect(
        etapes.some((e) => (e as { uses?: string }).uses === ACTION),
        `le job « ${nom} » ne passe pas par l'action commune ${ACTION}`,
      ).toBe(true);

      const montePileEnLigne = etapes.some(
        (e) => typeof e.run === 'string' && e.run.includes('docker compose') && e.run.includes('up -d'),
      );

      expect(
        montePileEnLigne,
        `le job « ${nom} » remonte la pile en ligne : la préparation est de nouveau dupliquée, ` +
          'et les deux copies vont diverger.',
      ).toBe(false);
    }
  });

  it('et le job qui rend le verdict ne contient aucun canari', () => {
    const canaris = (jobDuVerdict?.steps ?? []).filter((etape) => etape.id === 'canari_ios');

    expect(canaris, 'un canari dans le job du verdict remettrait les deux dans le même budget').toHaveLength(0);
  });
});
