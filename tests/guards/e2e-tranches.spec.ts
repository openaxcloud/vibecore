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
  it('LE DÉNOMINATEUR DE `--shard` ÉGALE LE NOMBRE DE TRANCHES', () => {
    /*
     * Trou trouvé par la contre-épreuve du 2026-10-01, en portant la découpe de
     * deux à quatre tranches : laisser `--shard=N/2` avec une matrice de quatre
     * laissait TOUS les gardes au vert.
     *
     * Ce que ça produit : les tranches 3 et 4 lancent `--shard=3/2` et
     * `--shard=4/2`, que Playwright refuse — et la porte, qui exige quatre
     * rapports portant chacun des tests, échouerait loin de la cause. Pire si le
     * dénominateur est plus GRAND que la matrice : une partie des specs ne serait
     * jouée par personne, et la porte verrait quatre rapports pleins sans voir
     * qu'il manque un quart de la suite.
     *
     * C'est le défaut le plus coûteux de cette famille : une couverture amputée
     * qui se présente comme un succès.
     */
    const tranches = (WORKFLOW.jobs.e2e as { strategy?: { matrix?: { shard?: number[] } } }).strategy?.matrix?.shard ?? [];

    expect(tranches.length, 'matrice de tranches introuvable : la garde ne mesure rien').toBeGreaterThan(0);

    const brut = readFileSync(join(__dirname, '..', '..', '.github/workflows/e2e.yml'), 'utf8');
    const denominateurs = [...brut.matchAll(/--shard=\$\{\{ matrix\.shard \}\}\/(\d+)/gu)].map((x) => Number(x[1]));

    expect(denominateurs.length, '`--shard=${{ matrix.shard }}/N` introuvable').toBeGreaterThan(0);

    for (const d of denominateurs) {
      expect(
        d,
        `\`--shard=…/${d}\` alors que la matrice compte ${tranches.length} tranches. ` +
          'Trop petit : des tranches lancent un numéro que Playwright refuse. Trop grand : une part ' +
          'de la suite n’est jouée par personne, et la porte ne peut pas le voir.',
      ).toBe(tranches.length);
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
