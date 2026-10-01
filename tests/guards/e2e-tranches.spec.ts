import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * LE NOM DU CONTRÔLE REQUIS EST UN CONTRAT AVEC GITHUB, PAS UN LIBELLÉ.
 *
 * La protection de branche exige trois contextes, dont « Playwright local
 * stack ». Un contrôle requis qui ne se présente jamais n'est pas ignoré : il
 * reste EN ATTENTE, pour toujours. Découper la suite en quatre jobs sans
 * conserver ce nom exact aurait donc bloqué toutes les propositions du dépôt,
 * sans message d'erreur et sans rien de rouge à regarder.
 *
 * Ce garde tient le contrat : un seul job porte ce nom, c'est lui qui rend le
 * verdict, et il exige ses quatre rapports.
 */

const RACINE = join(__dirname, '..', '..');
const WORKFLOW = parse(readFileSync(join(RACINE, '.github/workflows/e2e.yml'), 'utf8')) as {
  jobs: Record<string, { name?: string; needs?: unknown; if?: unknown; steps?: { name?: string; env?: Record<string, string>; run?: string }[] }>;
};

const NOM_REQUIS = 'Playwright local stack';

describe('la découpe en tranches ne casse pas la protection de branche', () => {
  it('LE DÉNOMINATEUR DE `--shard` EST DÉRIVÉ DE LA MATRICE, JAMAIS RÉÉCRIT', () => {
    /*
     * Trou trouvé par contre-épreuve le 2026-10-01, en portant la découpe de deux
     * à quatre tranches : laisser `--shard=N/2` avec une matrice de quatre
     * laissait les SOIXANTE-DIX gardes au vert.
     *
     * La première version de ce cas comparait le nombre écrit au nombre de
     * tranches. C'était un pansement : elle tolérait encore que le chiffre soit
     * écrit DEUX FOIS, donc qu'il puisse diverger entre deux éditions. La bonne
     * forme est de ne pas l'écrire du tout — `strategy.job-total` est le nombre
     * de tranches que GitHub a réellement lancées.
     *
     * Ce cas interdit donc le dénominateur littéral, dans les deux sens : trop
     * petit, des tranches lancent un numéro que Playwright refuse ; trop grand,
     * une part de la suite n'est jouée par PERSONNE et la porte voit des
     * rapports pleins sans pouvoir le voir.
     */
    const brut = readFileSync(join(__dirname, '..', '..', '.github/workflows/e2e.yml'), 'utf8');
    const decoupes = [...brut.matchAll(/--shard=\$\{\{ matrix\.shard \}\}\/([^"]+)"/gu)].map((m) => m[1]);

    expect(decoupes.length, '`--shard=${{ matrix.shard }}/…` introuvable : la garde ne mesure rien').toBeGreaterThan(0);

    for (const d of decoupes) {
      expect(
        d,
        `le dénominateur de \`--shard\` vaut « ${d} » : il est écrit en dur. Il doit être ` +
          '`${{ strategy.job-total }}`, sinon il peut diverger du nombre de tranches — et un ' +
          "dénominateur qui diverge perd une part de la suite SANS que rien ne rougisse.",
      ).toBe('${{ strategy.job-total }}');
    }
  });

  it('la sonde lit bien le workflow — sinon les cas suivants ne mesurent rien', () => {
    expect(Object.keys(WORKFLOW.jobs).length).toBeGreaterThan(1);
  });

  it(`EXACTEMENT un job porte « ${NOM_REQUIS} »`, () => {
    const porteurs = Object.entries(WORKFLOW.jobs).filter(([, j]) => j.name === NOM_REQUIS);

    expect(
      porteurs.map(([cle]) => cle),
      `la protection de branche attend « ${NOM_REQUIS} » : zéro porteur bloque toutes les ` +
        'propositions pour toujours, deux rendent le verdict ambigu',
    ).toHaveLength(1);
  });

  it('ce porteur est bien celui qui rend le verdict, pas une tranche', () => {
    const [, job] = Object.entries(WORKFLOW.jobs).find(([, j]) => j.name === NOM_REQUIS)!;
    const porte = (job.steps ?? []).find((e) => (e.run ?? '').includes('e2e-gate.mjs'));

    expect(porte, 'le job qui porte le nom requis doit exécuter la porte').toBeTruthy();
    expect(job.needs, 'il doit attendre les tranches').toBeTruthy();
  });

  it('il EXIGE ses quatre rapports — sinon un vert sur trois quarts des specs', () => {
    const [, job] = Object.entries(WORKFLOW.jobs).find(([, j]) => j.name === NOM_REQUIS)!;
    const porte = (job.steps ?? []).find((e) => (e.run ?? '').includes('e2e-gate.mjs'))!;
    const tranches = (WORKFLOW.jobs.e2e as { strategy?: { matrix?: { shard?: number[] } } }).strategy?.matrix?.shard ?? [];

    expect(porte.env?.E2E_EXPECTED_REPORTS).toBe(String(tranches.length));
  });

  it('le verdict tombe MÊME si une tranche échoue — c’est le cas qui compte', () => {
    const [, job] = Object.entries(WORKFLOW.jobs).find(([, j]) => j.name === NOM_REQUIS)!;

    expect(String(job.if), "sans `always()`, une tranche perdue laisse le contrôle sans conclusion").toContain(
      'always()',
    );
  });

  it('aucune tranche ne rend de verdict toute seule', () => {
    const tranche = WORKFLOW.jobs.e2e;
    const porte = (tranche.steps ?? []).find((e) => (e.run ?? '').includes('e2e-gate.mjs'));

    expect(porte, 'une tranche ne voit qu’un quart des specs : elle ne peut pas conclure').toBeUndefined();
  });
});
