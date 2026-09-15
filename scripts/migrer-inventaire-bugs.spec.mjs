import { describe, expect, it } from 'vitest';

import { fichierDeLEntree, lignesDInventaire, lireLesEntrees, nomsDeFichier } from './migrer-inventaire-bugs.mjs';

/**
 * Ce que la migration doit tenir AVANT de toucher au registre.
 *
 * L'enjeu n'est pas le format de sortie, c'est la PERTE. `BUG_INVENTORY_LIVE.md`
 * est le point de contention le plus chaud du dépôt, et la règle 24 y a déjà
 * attrapé quatre pertes silencieuses. Un migrateur qui laisse tomber une entrée
 * en chemin fait la même chose, en une seule fois et pour toutes.
 *
 * Le jeu d'essai contient exprès les deux formes qui ont fait échouer ma
 * première version : une cellule d'identifiant annotée et un identifiant
 * composé.
 */
const INVENTAIRE = `# BUG INVENTORY LIVE

## 2026-08-12 — Lot Avi

| ID | Bug | 📤 Dispatché | 💻 Codé | ✅ Testé live | Preuve |
|---|---|:---:|:---:|:---:|---|
| BUG-A-001 | **Un premier défaut.** | ☑ 01/09 | ☑ 02/09 | ☐ | mesuré |
| BUG-B-002 (doublon) | **Un deuxième, annoté.** | ☑ | ☐ | ☐ | — |

## 2026-09-01 — Autre lot

| ID | Bug | 📤 Dispatché | 💻 Codé | ✅ Testé live | Preuve |
|---|---|:---:|:---:|:---:|---|
| BUG-C-003 / BUG-D-004 | **Un identifiant composé.** | ☐ | ☐ | ☐ | — |
`;

describe('le migrateur du registre de bugs', () => {
  const entrees = lireLesEntrees(INVENTAIRE);

  it('mesure bien quelque chose : le jeu d’essai porte trois entrées', () => {
    expect(entrees).toHaveLength(3);
  });

  it('ne laisse tomber AUCUNE forme d’identifiant, annotée ou composée', () => {
    expect(entrees.map((e) => e.id)).toEqual(['BUG-A-001', 'BUG-B-002', 'BUG-C-003']);
    expect(entrees[1].annotation).toBe('(doublon)');
    expect(entrees[2].annotation).toBe('/ BUG-D-004');
  });

  it('conserve la SECTION — sans elle une entrée perd le lot qui lui donnait son sens', () => {
    expect(entrees[0].section).toBe('2026-08-12 — Lot Avi');
    expect(entrees[2].section).toBe('2026-09-01 — Autre lot');
  });

  it('conserve chaque colonne non vide dans le fichier produit', () => {
    const fichier = fichierDeLEntree(entrees[0]);

    expect(fichier).toContain('id: BUG-A-001');
    expect(fichier).toContain('Un premier défaut.');
    expect(fichier).toContain('☑ 01/09');
    expect(fichier).toContain('☑ 02/09');
    expect(fichier).toContain('mesuré');
  });

  it('CONTRE-ÉPREUVE — une entrée retirée de la source se voit dans le décompte', () => {
    const ampute = INVENTAIRE.replace('| BUG-B-002 (doublon) | **Un deuxième, annoté.** | ☑ | ☐ | ☐ | — |\n', '');

    expect(lireLesEntrees(ampute)).toHaveLength(2);
    expect(lireLesEntrees(ampute).map((e) => e.id)).not.toContain('BUG-B-002');
  });

  it('ne prend PAS une citation pour une entrée', () => {
    /*
     * Ligne 66 du registre réel : `| BUG-AGENT-> **Les dix conversations…**`,
     * suivie de lignes `>`. C'est un résidu d'édition dans un bloc de prose,
     * pas une entrée tronquée — une seule barre verticale. La compter faisait
     * refuser la migration pour une ligne qui n'en est pas une.
     */
    const avecCitation = `${INVENTAIRE}| BUG-E-> **une citation, pas une ligne de tableau**\n`;

    // Lue comme entrée : non. ATTENDUE comme entrée : non plus — c'est là que
    // se jouait le refus de migration, et c'est donc là qu'il faut le tenir.
    expect(lireLesEntrees(avecCitation)).toHaveLength(3);
    expect(lignesDInventaire(avecCitation)).toBe(3);
    expect(lignesDInventaire(INVENTAIRE)).toBe(lireLesEntrees(INVENTAIRE).length);
  });

  it('désambiguïse les identifiants répétés par SUFFIXE, sans toucher à l’identifiant', () => {
    /*
     * Les 14 identifiants répétés du registre sont TOUS cités hors de
     * l'inventaire — de 1 à 7 fichiers et de 3 à 16 commits chacun.
     * Renuméroter casserait ces références : seul le nom de fichier change.
     */
    const repete = INVENTAIRE.replace(
      '| BUG-C-003 / BUG-D-004 | **Un identifiant composé.** | ☐ | ☐ | ☐ | — |',
      '| BUG-A-001 | **Le même identifiant, une autre entrée.** | ☐ | ☐ | ☐ | — |',
    );

    const entrees = lireLesEntrees(repete);
    const noms = nomsDeFichier(entrees);

    expect(noms).toEqual(['BUG-A-001.md', 'BUG-B-002.md', 'BUG-A-001-b.md']);

    // L'identifiant reste INTACT dans le fichier produit — c'est tout l'enjeu.
    expect(fichierDeLEntree(entrees[2])).toContain('id: BUG-A-001');
    expect(new Set(noms).size).toBe(noms.length);
  });
});
