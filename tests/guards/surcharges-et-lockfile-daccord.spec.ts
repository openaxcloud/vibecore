import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * UNE SURCHARGE MONTÉE DANS `package.json` SANS RÉGÉNÉRER LE LOCKFILE N'EXISTE
 * PAS. La construction tourne en `--frozen-lockfile` : c'est le lockfile qui
 * décide ce qui entre dans l'image, pas le manifeste qu'on lit.
 *
 * Mesuré le 2026-10-10. `fast-jwt` 6.2.4 portait CVE-2026-107722 (CRITIQUE), et
 * la porte de vulnérabilité refusait **les huit images**. Quatre déploiements
 * d'affilée ont échoué, et la production est restée trente-quatre heures sur un
 * commit en retard de six propositions.
 *
 * Le piège est qu'un correctif de ce type se RELIT comme fait : la ligne est
 * là, dans `pnpm.overrides`. Ce garde compare les deux sources et rougit dès
 * qu'elles divergent — c'est-à-dire dès qu'un `pnpm install` a été oublié.
 */

const RACINE = process.cwd();

/** Les surcharges telles que le LOCKFILE les a enregistrées. */
function surchargesDuLockfile(lock: string): Record<string, string> {
  const lignes = lock.split('\n');
  const debut = lignes.findIndex((l) => l === 'overrides:');

  if (debut === -1) {
    return {};
  }

  const trouvees: Record<string, string> = {};

  for (const ligne of lignes.slice(debut + 1)) {
    /* un bloc YAML de premier niveau s'arrête à la première ligne non indentée */
    if (!/^\s/u.test(ligne) && ligne.trim() !== '') {
      break;
    }

    const paire = /^ {2}(?:'([^']+)'|([^\s:][^:]*)):\s*(.+?)\s*$/u.exec(ligne);

    if (paire) {
      trouvees[(paire[1] ?? paire[2])!] = paire[3]!.replace(/^'(.*)'$/u, '$1');
    }
  }

  return trouvees;
}

describe('les surcharges pnpm et le lockfile disent la même chose', () => {
  const manifeste = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')) as {
    pnpm?: { overrides?: Record<string, string> };
  };
  const attendues = manifeste.pnpm?.overrides ?? {};
  const lock = readFileSync(join(RACINE, 'pnpm-lock.yaml'), 'utf8');
  const enregistrees = surchargesDuLockfile(lock);

  it('TÉMOIN — les deux sources sont lues et non vides, sinon ce garde ne mesure rien', () => {
    expect(Object.keys(attendues).length, 'aucune surcharge dans package.json : lecture cassée ?').toBeGreaterThan(10);
    expect(Object.keys(enregistrees).length, 'aucune surcharge lue dans le lockfile : le format a changé ?').toBeGreaterThan(
      10,
    );
  });

  it('chaque surcharge du manifeste est enregistrée À L’IDENTIQUE dans le lockfile', () => {
    const ecarts: string[] = [];

    for (const [paquet, attendu] of Object.entries(attendues)) {
      const enregistre = enregistrees[paquet];

      if (enregistre === undefined) {
        ecarts.push(`${paquet} : absent du lockfile (attendu ${attendu})`);
      } else if (enregistre !== attendu) {
        ecarts.push(`${paquet} : manifeste ${attendu} ≠ lockfile ${enregistre}`);
      }
    }

    expect(
      ecarts,
      'une surcharge montée sans `pnpm install` ne change RIEN à ce qui est construit — ' +
        'c’est ce qui a tenu la production trente-quatre heures en arrière le 2026-10-10',
    ).toEqual([]);
  });

  it('CONTRÔLE POSITIF — le lecteur de lockfile retrouve bien une surcharge connue', () => {
    /*
     * Sans ce cas, un lecteur cassé rendrait un dictionnaire vide, les deux
     * tests ci-dessus passeraient au vert, et le garde ne protègerait de rien.
     */
    const connue = Object.keys(attendues)[0]!;
    expect(enregistrees[connue], `le lockfile devrait porter la surcharge « ${connue} »`).toBeDefined();
  });
});
