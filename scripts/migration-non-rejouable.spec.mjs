import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { lireLesEntrees } from './migrer-inventaire-bugs.mjs';

/*
 * LE DÉFAUT QUE CETTE GARDE ARRÊTE.
 *
 * `migrer-inventaire-bugs.mjs` lit `BUG_INVENTORY_LIVE.md` comme SOURCE, puis
 * le réécrit en INDEX. Au second passage il lirait donc un fichier sans aucune
 * ligne de tableau : zéro entrée, et `docs/bugs/` réécrit à vide. La
 * destruction complète du registre de bugs, sans un seul message d'erreur, par
 * une commande qu'on relance parce qu'on ne se souvient plus si elle a tourné.
 *
 * Ce test ne vérifie pas une fonction : il lance le VRAI script, deux fois, sur
 * un registre jetable. C'est le chemin qu'un humain emprunterait.
 */

const SCRIPT = new URL('./migrer-inventaire-bugs.mjs', import.meta.url).pathname;

/*
 * On exécute LA COPIE posée dans le dossier jetable, jamais le script du dépôt.
 * Première version de ce test : `lancer()` appelait le script du dépôt avec
 * simplement `cwd` sur le dossier jetable. La contre-épreuve désarmait donc une
 * copie que personne n'exécutait, et le test « sans la garde » rendait le
 * message de la garde. Un instrument qui mesure un autre objet que celui qu'on
 * croit.
 */
const copieDuScript = () => join(racine, 'scripts', 'migrer-inventaire-bugs.mjs');

const INVENTAIRE = [
  '# Inventaire',
  '',
  '## Lot du 16/09',
  '',
  '| ID | Bug | Preuve |',
  '| --- | --- | --- |',
  '| BUG-UN-001 | **le premier défaut** | preuve un |',
  '| BUG-DEUX-002 | **le second défaut** | preuve deux |',
  '| BUG-UN-001 | **le premier défaut, deuxième entrée** | preuve trois |',
  '',
].join('\n');

let racine;

function lancer(...args) {
  try {
    return { code: 0, sortie: execFileSync('node', [copieDuScript(), ...args], { cwd: racine, encoding: 'utf8' }) };
  } catch (erreur) {
    return { code: erreur.status, sortie: `${erreur.stdout ?? ''}${erreur.stderr ?? ''}` };
  }
}

const fichiers = () => readdirSync(join(racine, 'docs', 'bugs')).sort();
const index = () => readFileSync(join(racine, 'BUG_INVENTORY_LIVE.md'), 'utf8');

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'migration-registre-'));
  mkdirSync(join(racine, 'scripts'), { recursive: true });
  cpSync(SCRIPT, join(racine, 'scripts', 'migrer-inventaire-bugs.mjs'));
  writeFileSync(join(racine, 'BUG_INVENTORY_LIVE.md'), INVENTAIRE);
});

afterEach(() => {
  rmSync(racine, { recursive: true, force: true });
});

describe('relancer la migration ne vide pas le registre', () => {
  it('le premier passage écrit un fichier par entrée', () => {
    const premier = lancer();

    expect(premier.code).toBe(0);
    expect(fichiers()).toEqual(['BUG-DEUX-002.md', 'BUG-UN-001-b.md', 'BUG-UN-001.md']);
  });

  it('LE DANGER EST RÉEL : l’index produit ne porte plus AUCUNE entrée lisible', () => {
    lancer();

    /*
     * C'est exactement ce que le second passage relirait. Sans la garde, il
     * écrirait ces zéro entrées par-dessus les trois fichiers.
     */
    expect(lireLesEntrees(index())).toEqual([]);
  });

  it('le second passage REFUSE, et ne touche à rien', () => {
    lancer();

    const avantFichiers = fichiers();
    const avantIndex = index();

    const second = lancer();

    expect(second.code).toBe(1);
    expect(second.sortie).toContain('déjà migré');
    expect(fichiers()).toEqual(avantFichiers);
    expect(index()).toBe(avantIndex);
  });

  it('`--index` régénère sans rien perdre, et reste stable', () => {
    lancer();

    const apresMigration = index();
    const regenere = lancer('--index');

    expect(regenere.code).toBe(0);
    expect(index()).toBe(apresMigration);
    expect(fichiers()).toEqual(['BUG-DEUX-002.md', 'BUG-UN-001-b.md', 'BUG-UN-001.md']);
  });

  it('SANS la garde, le second passage VIDE le dossier — c’est elle qui l’arrête', () => {
    lancer();

    expect(fichiers()).toHaveLength(3);

    /*
     * Contre-épreuve. On désarme le seul verrou — le refus quand la source ne
     * porte plus de tableau — et on relance. Si le dossier survivait quand même,
     * c'est que la garde ne protégeait rien et que le vert d'au-dessus serait
     * un vert de décor.
     */
    const desarme = readFileSync(copieDuScript(), 'utf8').replace(
      '  if (refusSiDejaMigre(markdown)) {',
      '  if (false && refusSiDejaMigre(markdown)) {',
    );

    expect(desarme, 'le verrou n’a pas été trouvé — ce test ne mesure plus rien').not.toBe(
      readFileSync(copieDuScript(), 'utf8'),
    );
    writeFileSync(copieDuScript(), desarme);

    const second = lancer();

    /*
     * Le dégât exact, mesuré et pas supposé : le second passage réussit
     * (code 0), NE SUPPRIME PAS les fichiers — il n'en écrit simplement aucun —
     * et réécrit l'index avec ZÉRO entrée. Le registre garde son contenu et
     * perd son point d'entrée, en annonçant « 0 entrées » d'un ton parfaitement
     * serein.
     */
    expect(second.code).toBe(0);
    expect(second.sortie).toContain('0 fichiers écrits');
    expect(fichiers()).toHaveLength(3);
    expect(index()).not.toContain('- [BUG-UN-001]');
    expect(index()).toContain('0 entrées.');
  });
});

/*
 * LE MODE QUI DÉSAMORCE LES NEUF CONFLITS.
 *
 * Neuf propositions ouvertes ajoutent des lignes à `BUG_INVENTORY_LIVE.md`
 * pendant que la migration le remplace par un index. Huit sont de PURES
 * additions. `--ajouter` prend leurs lignes et en fait des fichiers d'entrée :
 * la résolution du conflit tient en une commande au lieu de neuf recopies à la
 * main — neuf occasions de perdre une ligne.
 */
describe('--ajouter reprend des lignes de tableau dans un registre déjà migré', () => {
  const FRAGMENT = [
    '| ID | Bug | Preuve |',
    '| --- | --- | --- |',
    '| BUG-TROIS-003 | **un défaut tout neuf** | preuve neuve |',
    '| BUG-UN-001 | **un TROISIÈME homonyme** | preuve homonyme |',
    '',
  ].join('\n');

  const ecrireFragment = () => {
    const chemin = join(racine, 'fragment.md');
    writeFileSync(chemin, FRAGMENT);

    return chemin;
  };

  it('ajoute les fichiers et désambiguïse contre CE QUI EXISTE DÉJÀ', () => {
    lancer();

    const ajout = lancer('--ajouter', ecrireFragment());

    expect(ajout.code).toBe(0);
    // BUG-UN-001.md et -b.md existent déjà : l'homonyme doit prendre -c, pas écraser.
    expect(fichiers()).toEqual(['BUG-DEUX-002.md', 'BUG-TROIS-003.md', 'BUG-UN-001-b.md', 'BUG-UN-001-c.md', 'BUG-UN-001.md']);
    expect(readFileSync(join(racine, 'docs', 'bugs', 'BUG-UN-001-c.md'), 'utf8')).toContain('un TROISIÈME homonyme');
    expect(index()).toContain('5 entrées.');
  });

  it("REFUSE un fragment sans sa ligne d'en-tête, au lieu d'écrire des fichiers vides", () => {
    lancer();

    const chemin = join(racine, 'sans-entete.md');
    writeFileSync(chemin, '| BUG-TROIS-003 | **un défaut tout neuf** | preuve neuve |\n');

    const avant = fichiers();
    const ajout = lancer('--ajouter', chemin);

    expect(ajout.code).toBe(1);
    expect(ajout.sortie).toContain('sans aucun contenu');
    expect(fichiers()).toEqual(avant);
  });

  it('refuse un fragment dont une ligne n’a pas été lue', () => {
    lancer();

    const chemin = join(racine, 'partiel.md');
    // La seconde ligne porte un identifiant tronqué : comptée, non lue.
    writeFileSync(chemin, ['| ID | Bug |', '| --- | --- |', '| BUG-TROIS-003 | **lisible** |', '| BUG-CASSE | ', ''].join('\n'));

    const avant = fichiers();
    const ajout = lancer('--ajouter', chemin);

    expect(ajout.code).toBe(1);
    expect(fichiers()).toEqual(avant);
  });
});
