import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CHEMINS_PAR_TIER, SERVICES_PAR_TIER, commitConnu, estAncetre } from './tiers-a-jour.mjs';

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

/*
 * UN SHA INCONNU NE DOIT JAMAIS SE LIRE COMME « EN RETARD ».
 *
 * `git merge-base --is-ancestor` sort en 1 pour « pas un ancêtre » et en 128
 * pour « commit inconnu ». Les deux lèvent, donc les deux rendent `false` :
 * entourer l'appel d'un `try/catch` en espérant y attraper le second est du
 * code mort — c'était le cas de ma première version, et un tag servi absent du
 * dépôt local produisait un « en retard » FAUX. Exactement le verdict que ce
 * script existe pour ne jamais rendre.
 *
 * Ces trois cas sont couplés dans les deux sens (règle 6) : le témoin prouve
 * que la mesure mesure quelque chose, le défaut prouve que l'ancienne approche
 * ne marchait pas, et la garde prouve que la nouvelle marche.
 */
describe('un commit servi inconnu localement est refusé, pas interprété', () => {
  it('TÉMOIN — sur un vrai couple de commits, la comparaison répond juste', () => {
    expect(estAncetre('HEAD~1', 'HEAD'), 'la mesure ne mesure rien').toBe(true);
    expect(estAncetre('HEAD', 'HEAD~1')).toBe(false);
  });

  it('LE DÉFAUT — `estAncetre` ne peut PAS signaler un SHA inconnu : elle rend false, comme « pas un ancêtre »', () => {
    let jete = false;

    try {
      expect(estAncetre('HEAD', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBe(false);
    } catch (error) {
      jete = error?.matcherResult ? false : true;
    }

    expect(jete, 'si elle jetait, le try/catch de la première version aurait suffi').toBe(false);
  });

  it('LA GARDE — `commitConnu` distingue les deux cas', () => {
    expect(commitConnu('HEAD'), 'HEAD doit être connu, sinon la garde ne mesure rien').toBe(true);
    expect(commitConnu('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBe(false);
  });

  it('et le script vérifie le SHA servi AVANT de le comparer', () => {
    const source = readFileSync(join(__dirname, 'tiers-a-jour.mjs'), 'utf8');
    const posGarde = source.indexOf('if (!commitConnu(servi))');
    const posCompare = source.indexOf('const aJour = estAncetre(attendu, servi)');

    expect(posGarde, '`commitConnu(servi)` introuvable dans le corps du script').toBeGreaterThan(-1);
    expect(posCompare, 'la comparaison introuvable : la garde ne mesure rien').toBeGreaterThan(-1);
    expect(posGarde, 'la vérification doit précéder la comparaison').toBeLessThan(posCompare);
  });
});
