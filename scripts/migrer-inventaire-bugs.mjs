/**
 * BUG_INVENTORY_LIVE.md — un fichier par entrée.
 *
 * POURQUOI. Le fichier vaut 1 172 lignes pour 311 entrées, et il est le point
 * de contention le plus chaud du dépôt : au 2026-09-15, HUIT propositions
 * ouvertes le modifient en même temps. Chaque fusion y produit un conflit, et
 * chaque conflit est une occasion de perdre des entrées en silence — c'est
 * exactement ce que la règle 24 a déjà attrapé quatre fois.
 *
 * CE SCRIPT NE SUPPRIME RIEN. Il LIT l'inventaire et ÉCRIT un fichier par
 * entrée sous `docs/bugs/`. La suppression de la source est une décision
 * séparée, à prendre quand les huit propositions auront atterri — la faire
 * avant les ferait toutes conflicter sans recours.
 *
 *   node scripts/migrer-inventaire-bugs.mjs            écrit les fichiers
 *   node scripts/migrer-inventaire-bugs.mjs --verifier  ne rien écrire, compter
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SOURCE = 'BUG_INVENTORY_LIVE.md';
export const DOSSIER = join('docs', 'bugs');

/*
 * La cellule d'identifiant porte parfois PLUS que l'identifiant :
 * « BUG-AGENT-CONV-003 (doublon) », « BUG-WS-ID-SPLIT / BUG-IDE-001 ».
 * Exiger un `|` juste après le code faisait manquer ces deux entrées — et
 * les manquer en silence, ce qui est exactement ce qu'une migration ne doit
 * jamais faire. On lit donc la cellule entière et on en extrait le PREMIER
 * code ; le reste est conservé comme annotation.
 */
const LIGNE_ENTREE = /^\|\s*(BUG-[A-Z0-9-]+)([^|]*)\|/;

/**
 * Une entrée est une LIGNE DE TABLEAU : au moins deux barres verticales.
 *
 * La ligne 66 de l'inventaire commence par `| BUG-AGENT-` puis bascule en
 * CITATION (`>`) : c'est un résidu d'édition dans un bloc de prose, pas une
 * entrée tronquée. La compter comme entrée illisible faisait refuser la
 * migration pour une ligne qui n'en est pas une ; la réparer à la main aurait
 * supposé deviner l'intention d'une autre session. L'outil distingue donc les
 * deux, et laisse le registre intact.
 */
function estUneLigneDeTableau(ligne) {
  return (ligne.match(/\|/gu) ?? []).length >= 2;
}

/**
 * Le nombre de lignes d'inventaire ATTENDUES — référence indépendante du
 * lecteur, avec laquelle on vérifie qu'aucune entrée n'a été perdue en chemin.
 *
 * C'est ici que la distinction tableau/citation compte vraiment : sans elle,
 * la ligne 66 (`| BUG-AGENT->` suivi de prose citée) était comptée comme
 * attendue mais jamais lue, et la migration se refusait pour une entrée qui
 * n'existe pas.
 */
export function lignesDInventaire(markdown) {
  return markdown.split('\n').filter((ligne) => /^\|\s*BUG-/u.test(ligne) && estUneLigneDeTableau(ligne)).length;
}
const SEPARATEUR = /^\|\s*-{2,}/;
const ENTETE = /^\|\s*ID\s*\|/;

/** Découpe une ligne de tableau en cellules, sans perdre les vides. */
function cellules(ligne) {
  const brut = ligne.replace(/^\|/, '').replace(/\|\s*$/, '');

  return brut.split('|').map((c) => c.trim());
}

/**
 * Chaque entrée, avec la SECTION qui la portait — sans elle, une entrée sortie
 * du tableau perd le contexte qui lui donnait son sens (le lot, la date).
 */
export function lireLesEntrees(markdown) {
  const entrees = [];
  let section = '';
  let colonnes = [];

  for (const ligne of markdown.split('\n')) {
    if (ligne.startsWith('## ')) {
      section = ligne.slice(3).trim();
      continue;
    }

    if (ENTETE.test(ligne)) {
      colonnes = cellules(ligne);
      continue;
    }

    if (SEPARATEUR.test(ligne)) {
      continue;
    }

    const trouve = estUneLigneDeTableau(ligne) ? LIGNE_ENTREE.exec(ligne) : null;

    if (!trouve) {
      continue;
    }

    const valeurs = cellules(ligne);
    const champs = {};

    for (const [index, nom] of colonnes.entries()) {
      champs[nom || `col${index}`] = valeurs[index] ?? '';
    }

    entrees.push({ id: trouve[1], annotation: trouve[2].trim(), section, champs, ligne });
  }

  return entrees;
}

/**
 * Le nom de fichier de chaque entrée, DÉSAMBIGUÏSÉ par suffixe quand un
 * identifiant est porté par plusieurs entrées.
 *
 * POURQUOI PAS UNE RENUMÉROTATION. C'était mon premier réflexe, par analogie
 * avec l'entrée 39 renumérotée en 40 sur #474. La mesure l'a démenti : les 14
 * identifiants concernés sont TOUS cités hors de l'inventaire — de 1 à 7
 * fichiers et de 3 à 16 commits chacun. `BUG-IDE-001` apparaît dans 6 fichiers
 * et 16 commits. Renuméroter casserait ces références et la trace historique
 * avec ; le précédent de l'entrée 39 ne valait que parce qu'elle n'était citée
 * nulle part.
 *
 * L'identifiant reste donc INTACT dans le frontmatter et dans le corps. Seul
 * le nom de fichier porte un suffixe `-b`, `-c`… dans l'ordre d'apparition.
 */
export function nomsDeFichier(entrees) {
  const vus = new Map();

  return entrees.map((entree) => {
    const rang = (vus.get(entree.id) ?? 0) + 1;
    vus.set(entree.id, rang);

    const suffixe = rang === 1 ? '' : `-${String.fromCharCode(96 + rang)}`;

    return `${entree.id}${suffixe}.md`;
  });
}

/** Le fichier d'une entrée — le contenu d'origine est conservé tel quel. */
export function fichierDeLEntree(entree) {
  const lignes = [
    '---',
    `id: ${entree.id}`,
    entree.section ? `section: ${JSON.stringify(entree.section)}` : null,
    entree.annotation ? `annotation: ${JSON.stringify(entree.annotation)}` : null,
    '---',
    '',
  ].filter((l) => l !== null);

  for (const [nom, valeur] of Object.entries(entree.champs)) {
    if (nom === 'ID' || !valeur) {
      continue;
    }

    lignes.push(`## ${nom}`, '', valeur, '');
  }

  return `${lignes.join('\n')}\n`;
}

function principal() {
  const verifier = process.argv.includes('--verifier');
  const markdown = readFileSync(SOURCE, 'utf8');
  const entrees = lireLesEntrees(markdown);
  const ids = entrees.map((e) => e.id);
  const doublons = ids.filter((id, i) => ids.indexOf(id) !== i);

  /*
   * Référence INDÉPENDANTE du lecteur : toute ligne de tableau qui commence
   * par un code de bug. Compter avec le motif du lecteur reviendrait à
   * comparer l'instrument à lui-même — un contrôle qui ne peut pas échouer.
   */
  const attendues = lignesDInventaire(markdown);

  console.log(`  entrées lues        : ${entrees.length}`);
  console.log(`  lignes d'inventaire : ${attendues}`);
  console.log(`  doublons            : ${doublons.length ? doublons.join(', ') : 'aucun'}`);

  if (entrees.length !== attendues) {
    console.error(`::error::${attendues - entrees.length} ligne(s) d'inventaire illisible(s) — migration refusée.`);

    const lues = new Set(entrees.map((e) => e.ligne));

    for (const [index, ligne] of markdown.split('\n').entries()) {
      if (/^\|\s*BUG-/u.test(ligne) && !lues.has(ligne)) {
        console.error(`::error::ligne ${index + 1} : ${ligne.slice(0, 120)}`);
      }
    }

    process.exit(1);
  }

  if (doublons.length > 0) {
    const uniques = [...new Set(doublons)];
    console.log(`  identifiants portés par plusieurs entrées : ${uniques.length} — désambiguïsés par SUFFIXE`);

    for (const id of uniques) {
      console.log(`    ${id} — ${ids.filter((autre) => autre === id).length} fois`);
    }
  }

  if (verifier) {
    console.log('  --verifier : rien écrit.');
    return;
  }

  mkdirSync(DOSSIER, { recursive: true });

  const noms = nomsDeFichier(entrees);

  for (const [index, entree] of entrees.entries()) {
    writeFileSync(join(DOSSIER, noms[index]), fichierDeLEntree(entree));
  }

  console.log(`  ${entrees.length} fichiers écrits dans ${DOSSIER}/`);
}

if (process.argv[1]?.endsWith('migrer-inventaire-bugs.mjs')) {
  principal();
}
