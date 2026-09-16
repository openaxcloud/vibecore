import { describe, expect, it } from 'vitest';

import {
  fichierDeLEntree,
  indexDeLInventaire,
  lignesDInventaire,
  lireLesEntrees,
  nomsDeFichier,
  residusNonTabulaires,
  entreeDuFichier,
  sectionDesResidus,
} from './migrer-inventaire-bugs.mjs';

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

/*
 * Le compteur de référence a rendu 315 quand la migration en écrivait 314. Une
 * ligne commençait comme une entrée (`| BUG-AGENT-`) sans en être une : un
 * identifiant tronqué collé à un bloc de citation. L'écart d'une unité se lit
 * comme un arrondi si rien ne le nomme.
 */
describe('une ligne qui ressemble à une entrée sans en être une', () => {
  const MALFORMEE = [
    '| ID | Bug |',
    '| --- | --- |',
    '| BUG-VRAI-001 | une vraie entrée |',
    '| BUG-TRONQUE-> **une décision collée au tableau**',
    '> sa première ligne de citation',
    '> sa seconde ligne de citation',
    '',
    'du texte qui ne la suit plus',
  ].join('\n');

  it("n'est pas lue comme une entrée", () => {
    expect(lireLesEntrees(MALFORMEE).map((entree) => entree.id)).toEqual(['BUG-VRAI-001']);
  });

  it('est reportée mot pour mot, avec son bloc de citation et rien de plus', () => {
    const residus = residusNonTabulaires(MALFORMEE);

    expect(residus).toHaveLength(1);
    expect(residus[0].ligne).toBe(4);
    expect(residus[0].texte).toBe(
      ['| BUG-TRONQUE-> **une décision collée au tableau**', '> sa première ligne de citation', '> sa seconde ligne de citation'].join(
        '\n',
      ),
    );
    expect(residus[0].texte).not.toContain('du texte qui ne la suit plus');
  });

  it("atterrit dans l'index, sinon la migration la perdrait", () => {
    const entrees = lireLesEntrees(MALFORMEE);
    const index = indexDeLInventaire(entrees, nomsDeFichier(entrees), residusNonTabulaires(MALFORMEE));

    expect(index).toContain('| BUG-TRONQUE-> **une décision collée au tableau**');
    expect(index).toContain('> sa seconde ligne de citation');
  });

  it("une entrée bien formée n'est JAMAIS prise pour un résidu", () => {
    expect(residusNonTabulaires('| ID | Bug |\n| --- | --- |\n| BUG-VRAI-001 | une vraie entrée |')).toEqual([]);
  });
});

/*
 * L'index se régénère depuis `docs/bugs/`. Il faut donc que ce qu'un fichier
 * PORTE suffise à reconstruire sa ligne — sinon la régénération appauvrit le
 * registre à chaque passage.
 *
 * Trouvé en comparant l'index régénéré à celui de la migration : cinq entrées
 * perdaient leur résumé, parce que leur colonne ne s'appelait pas « Bug » mais
 * « Bug (mots d'Avi) ». Une comparaison qui ne rend RIEN n'aurait rien dit.
 */
describe("un fichier d'entrée se relit sans rien perdre", () => {
  const ALLER = (champs) =>
    entreeDuFichier(
      fichierDeLEntree({ id: 'BUG-X-001', section: 'Lot du 16/09', annotation: '', champs: { ID: 'BUG-X-001', ...champs } }),
    );

  it("retrouve l'identifiant et la section", () => {
    const relu = ALLER({ Bug: '**le défaut**' });

    expect(relu.id).toBe('BUG-X-001');
    expect(relu.section).toBe('Lot du 16/09');
  });

  it("retrouve le texte quelle que soit la colonne qui le portait", () => {
    expect(ALLER({ Bug: '**par la colonne Bug**' }).champs.Bug).toBe('**par la colonne Bug**');
    expect(ALLER({ "Bug (mots d'Avi)": '**par les mots d Avi**' }).champs["Bug (mots d'Avi)"]).toBe('**par les mots d Avi**');
    expect(ALLER({ Constat: '**par un constat**' }).champs.Constat).toBe('**par un constat**');
  });

  it("la section des résidus se retrouve dans un index, et vaut vide s'il n'y en a pas", () => {
    const entrees = [{ id: 'BUG-X-001', section: '', champs: { Bug: '**x**' }, ligne: '' }];
    const avec = indexDeLInventaire(entrees, ['BUG-X-001.md'], [{ ligne: 66, texte: '| BUG-TRONQUE-> **gardé**' }]);

    expect(sectionDesResidus(avec)).toContain('| BUG-TRONQUE-> **gardé**');
    expect(sectionDesResidus(indexDeLInventaire(entrees, ['BUG-X-001.md']))).toBe('');
  });
});
