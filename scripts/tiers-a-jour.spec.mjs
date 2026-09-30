import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CHEMINS_PAR_TIER, SERVICES_PAR_TIER } from './tiers-a-jour.mjs';

/**
 * LA CARTE RECOPIÉE NE DOIT PAS DÉRIVER DE L'ORIGINALE.
 *
 * `tiers-a-jour.mjs` recopie la carte tier → chemins de `Detect changed tiers`
 * dans `deploy-main.yml`. Une carte recopiée qui dérive en silence est PIRE que
 * pas de carte : elle rendrait un verdict rassurant sur un périmètre qui n'est
 * plus celui du déploiement.
 *
 * Ce garde ne compare pas les fichiers ligne à ligne — le workflow écrit ses
 * chemins dans des expressions `grep -E`. Il vérifie que CHAQUE chemin déclaré
 * ici apparaît bien dans le workflow, ce qui attrape le cas qui compte : un
 * tier dont le déclencheur a changé sans que la surveillance suive.
 */

const RACINE = join(__dirname, '..');
const WORKFLOW = readFileSync(join(RACINE, '.github/workflows/deploy-main.yml'), 'utf8');

describe('la carte des tiers reste alignée sur le déploiement', () => {
  it('la sonde lit bien le workflow — sinon les cas suivants ne mesurent rien', () => {
    expect(WORKFLOW.length).toBeGreaterThan(5000);
    expect(WORKFLOW, 'témoin positif').toContain('Tiers to build');
  });

  /*
   * ⚠️ Première version fausse, corrigée : je cherchais chaque chemin
   * LITTÉRALEMENT dans le workflow. Or il écrit des alternations —
   * `services/(api|workspace-manager|…)/` — donc `services/api/` n'y figure
   * jamais tel quel, et le garde rougissait sur une carte pourtant juste.
   *
   * La bonne question n'est pas « ce texte apparaît-il » mais « ce chemin
   * DÉCLENCHERAIT-IL ce tier ». On extrait donc le motif du workflow et on lui
   * soumet chaque chemin, exactement comme le déploiement le fait.
   */
  const MOTIFS = [...WORKFLOW.matchAll(/grep -Eq '\^\(([^']+)\)'[^\n]*?(\w+)=true/gu)].map((m) => ({
    motif: new RegExp(`^(${m[1]})`, 'u'),
    variable: m[2].toLowerCase(),
  }));

  it('les motifs du workflow sont bien extraits — sinon rien n’est mesuré', () => {
    expect(MOTIFS.length, 'aucun motif `grep -Eq` trouvé dans deploy-main.yml').toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(CHEMINS_PAR_TIER))('chaque chemin du tier « %s » déclencherait bien ce tier', (tier, chemins) => {
    for (const chemin of chemins) {
      const declenche = MOTIFS.some((m) => m.motif.test(chemin));

      expect(
        declenche,
        `le chemin « ${chemin} » déclaré pour le tier ${tier} ne correspond à AUCUN motif de ` +
          'deploy-main.yml : la surveillance et le déploiement ne parlent plus du même périmètre',
      ).toBe(true);
    }
  });

  it('chaque tier déclare les services Helm qu’il porte', () => {
    for (const tier of Object.keys(CHEMINS_PAR_TIER)) {
      expect(SERVICES_PAR_TIER, `le tier ${tier} n'a pas d'entrée de services`).toHaveProperty(tier);
    }
  });

  it('CONTRE-ÉPREUVE — un chemin inventé n’est PAS dans le workflow', () => {
    expect(/chemin-qui-n-existe-pas\//u.test(WORKFLOW)).toBe(false);
  });
});
