import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * L'inventaire des bugs est passé d'un tableau monolithique à un fichier par
 * entrée dans `docs/bugs/`. `BUG_INVENTORY_LIVE.md` survit comme INDEX, parce
 * que dix-neuf fichiers le citent en prose.
 *
 * Un index à côté de sa source, c'est deux registres qui finissent par se
 * contredire — et c'est précisément le défaut que la migration devait clore.
 * Cette garde les recoud.
 *
 * Elle ne rejoue PAS le migrateur : elle lit le DOSSIER et l'INDEX, et les
 * compare l'un à l'autre. Une garde qui régénère sa propre référence épingle
 * sa copie, pas le dépôt.
 */

const RACINE = new URL('..', import.meta.url).pathname;
const DOSSIER = join(RACINE, 'docs', 'bugs');
const INDEX = join(RACINE, 'BUG_INVENTORY_LIVE.md');

const LIGNE = /^- \[([^\]]+)\]\(docs\/bugs\/([^)]+)\)/u;

function entreesDeLIndex() {
  return readFileSync(INDEX, 'utf8')
    .split('\n')
    .map((ligne) => LIGNE.exec(ligne))
    .filter((trouve) => trouve !== null)
    .map((trouve) => ({ id: trouve[1], fichier: trouve[2] }));
}

function fichiersDuDossier() {
  return readdirSync(DOSSIER)
    .filter((nom) => nom.endsWith('.md'))
    .sort();
}

/*
 * Le frontmatter porte `id:` et, pour les entrées qui en avaient une, une
 * `annotation:`. Chercher `id:` collé au `---` de fermeture manquait les 62
 * fichiers annotés — la garde a trouvé ça toute seule, ce qui est exactement
 * ce qu'on lui demande. On lit donc le BLOC, pas une forme supposée.
 */
function idDuFichier(nom) {
  const bloc = /^---\n([\s\S]*?)\n---/u.exec(readFileSync(join(DOSSIER, nom), 'utf8'));

  return bloc ? /^id: (.+)$/mu.exec(bloc[1])?.[1] : undefined;
}

describe("l'index de l'inventaire ne diverge pas de docs/bugs/", () => {
  it('chaque fichier du dossier a exactement une ligne dans l’index', () => {
    const index = entreesDeLIndex();
    const cites = index.map((entree) => entree.fichier);

    expect(fichiersDuDossier().length).toBeGreaterThan(100);
    expect(fichiersDuDossier().filter((nom) => !cites.includes(nom)), 'fichiers absents de l’index').toEqual([]);

    const enDouble = cites.filter((nom, rang) => cites.indexOf(nom) !== rang);
    expect(enDouble, 'fichiers cités plusieurs fois').toEqual([]);
  });

  it('chaque ligne de l’index pointe vers un fichier qui existe', () => {
    const presents = new Set(fichiersDuDossier());

    expect(
      entreesDeLIndex().filter((entree) => !presents.has(entree.fichier)),
      'lignes pointant dans le vide',
    ).toEqual([]);
  });

  it('l’identifiant de l’index est celui du frontmatter du fichier', () => {
    const desaccords = entreesDeLIndex()
      .filter((entree) => idDuFichier(entree.fichier) !== entree.id)
      .map((entree) => `${entree.fichier}: index=${entree.id} frontmatter=${idDuFichier(entree.fichier)}`);

    expect(desaccords, 'identifiants en désaccord').toEqual([]);
  });

  it('le compte annoncé en tête d’index est le compte réel', () => {
    const annonce = /^(\d+) entrées\.$/mu.exec(readFileSync(INDEX, 'utf8'));

    expect(annonce, "l'index n'annonce aucun compte").toBeTruthy();
    expect(Number(annonce[1])).toBe(fichiersDuDossier().length);
  });
});
