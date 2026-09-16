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
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/**
 * Cet outil est à SENS UNIQUE, et c'est un piège qu'il faut fermer lui-même.
 *
 * Il lit `BUG_INVENTORY_LIVE.md` comme SOURCE, puis le réécrit en INDEX. Le
 * relancer une seconde fois lirait donc un fichier sans aucune ligne de
 * tableau : zéro entrée, et `docs/bugs/` réécrit à vide. La destruction
 * complète du registre, sans un seul message d'erreur.
 *
 * On refuse donc de tourner dès que la source ne porte plus de tableau. Une
 * fois migré, l'index se régénère depuis le DOSSIER — `--index` — jamais
 * depuis lui-même.
 */
function refusSiDejaMigre(markdown) {
  if (lignesDInventaire(markdown) > 0) {
    return false;
  }

  console.error(`  ${SOURCE} ne porte plus aucune ligne de tableau : l'inventaire est déjà migré.`);
  console.error(`  Rien n'a été écrit. Pour régénérer l'index depuis ${DOSSIER}/ : --index`);

  return true;
}

/** Le titre de section conservé dans le frontmatter, et le texte de la colonne « Bug ». */
export function entreeDuFichier(contenu) {
  const bloc = /^---\n([\s\S]*?)\n---/u.exec(contenu);
  const enTete = bloc ? bloc[1] : '';
  const section = /^section: (.+)$/mu.exec(enTete);
  /*
   * Les titres de section d'un fichier sont les COLONNES d'origine, et elles
   * ne portent pas toutes le même nom : « Bug », « Bug (mots d'Avi) »,
   * « Constat ». Ne lire que « Bug » rendait un résumé vide pour 5 entrées —
   * écart trouvé en comparant l'index régénéré à celui de la migration.
   */
  const champs = {};

  for (const titre of ['Bug', "Bug (mots d'Avi)", 'Constat']) {
    const motif = new RegExp(`^## ${titre.replace(/[()]/gu, '\\$&')}\\n\\n([\\s\\S]*?)(?=\\n## |$)`, 'mu');
    const corps = motif.exec(contenu);

    if (corps) {
      champs[titre] = corps[1].trim();
    }
  }

  return {
    id: /^id: (.+)$/mu.exec(enTete)?.[1],
    section: section ? JSON.parse(section[1]) : '',
    champs,
    ligne: '',
  };
}

/**
 * Les résidus ne viennent d'aucun fichier : ils n'existent que dans l'index.
 * Les régénérer sans les reporter les perdrait — le contraire de ce pour quoi
 * ils ont été écrits.
 */
export function sectionDesResidus(index) {
  const debut = index.indexOf('## Résidus non tabulaires');

  return debut === -1 ? '' : index.slice(debut).replace(/\s+$/u, '');
}

/** Reconstruit l'index à partir du DOSSIER, seule source après la migration. */
function regenererLIndex() {
  const indexActuel = readFileSync(SOURCE, 'utf8');

  /*
   * L'ordre de l'index est celui de l'inventaire d'origine : un ordre de
   * lecture, pas un ordre alphabétique. Le retrier casserait la lisibilité
   * sans rien apporter. On le relit donc dans l'index, et un fichier que
   * l'index ne cite pas encore va à la fin — visible, pas noyé.
   */
  const ordre = [...indexActuel.matchAll(/^- \[[^\]]+\]\(docs\/bugs\/([^)]+)\)/gmu)].map((t) => t[1]);
  const rang = (nom) => (ordre.indexOf(nom) === -1 ? ordre.length : ordre.indexOf(nom));

  const fichiers = readdirSync(DOSSIER)
    .filter((nom) => nom.endsWith('.md'))
    .sort((a, b) => rang(a) - rang(b) || a.localeCompare(b));

  const entrees = fichiers.map((nom) => entreeDuFichier(readFileSync(join(DOSSIER, nom), 'utf8')));
  const residus = sectionDesResidus(indexActuel);
  const corps = indexDeLInventaire(entrees, fichiers).replace(/\n## Résidus non tabulaires[\s\S]*$/u, '\n');

  writeFileSync(SOURCE, residus ? `${corps}\n${residus}\n` : corps);
  console.log(`  index régénéré depuis ${DOSSIER}/ : ${fichiers.length} entrées.`);
}

/**
 * Le nom de fichier d'une entrée AJOUTÉE, en tenant compte de ce que le dossier
 * contient déjà.
 *
 * `nomsDeFichier` désambiguïse à l'intérieur d'un lot ; ici le lot arrive APRÈS
 * 314 fichiers. Réutiliser `nomsDeFichier` tel quel écraserait `BUG-IDE-001.md`
 * au lieu de créer `BUG-IDE-001-c.md`.
 */
export function nomLibre(id, occupes) {
  for (let rang = 1; rang < 27; rang += 1) {
    const nom = rang === 1 ? `${id}.md` : `${id}-${String.fromCharCode(96 + rang)}.md`;

    if (!occupes.has(nom)) {
      return nom;
    }
  }

  throw new Error(`plus de suffixe libre pour ${id}`);
}

/**
 * Ajoute au registre MIGRÉ les entrées d'un fragment de tableau.
 *
 * Pourquoi ce mode existe : neuf propositions ouvertes ajoutent des lignes à
 * `BUG_INVENTORY_LIVE.md` pendant que la migration le remplace par un index.
 * Huit d'entre elles sont de PURES additions. Sans ce mode, chacune doit
 * recopier ses lignes à la main dans un fichier par entrée — neuf fois le même
 * geste, neuf occasions de perdre une ligne. Avec, la résolution du conflit
 * tient en une commande.
 */
function ajouterDesEntrees(chemin) {
  const fragment = readFileSync(chemin, 'utf8');
  const entrees = lireLesEntrees(fragment);
  const attendues = lignesDInventaire(fragment);

  console.log(`  entrées lues        : ${entrees.length}`);
  console.log(`  lignes du fragment  : ${attendues}`);

  if (entrees.length !== attendues) {
    console.error(`  ${attendues - entrees.length} ligne(s) NON lue(s) — rien écrit.`);
    process.exitCode = 1;

    return;
  }

  if (entrees.length === 0) {
    console.error('  aucune entrée dans ce fragment — rien écrit.');
    process.exitCode = 1;

    return;
  }

  /*
   * Un fragment SANS sa ligne d'en-tête se lit quand même : les identifiants
   * sortent, mais aucune colonne n'a de nom, donc `champs` est vide et le
   * fichier écrit ne porte que son frontmatter. Trouvé en essayant le mode sur
   * les deux lignes réelles de #379 : `BUG-IDE-014.md` faisait trois lignes,
   * dont zéro de contenu. Un outil qui écrit un fichier vide est pire que
   * celui qui s'arrête : il a l'air d'avoir travaillé.
   *
   * On regarde le CONTENU des colonnes, pas leur présence. Première version :
   * je comptais les clés de `champs`. Une ligne `| BUG-CASSE | ` porte bien la
   * clé `Bug` — vide — et passait la garde. C'est le troisième cas de la spec
   * qui l'a trouvé.
   */
  const vides = entrees.filter((entree) =>
    Object.entries(entree.champs).every(([nom, valeur]) => nom === 'ID' || !valeur.trim()),
  );

  if (vides.length > 0) {
    console.error(`  ${vides.length} entrée(s) sans aucun contenu : ${vides.map((e) => e.id).join(', ')}`);
    console.error("  Fragment sans ligne d'en-tête, ou ligne vide. Rien écrit.");
    process.exitCode = 1;

    return;
  }

  mkdirSync(DOSSIER, { recursive: true });

  const occupes = new Set(readdirSync(DOSSIER).filter((nom) => nom.endsWith('.md')));

  for (const entree of entrees) {
    const nom = nomLibre(entree.id, occupes);
    occupes.add(nom);
    writeFileSync(join(DOSSIER, nom), fichierDeLEntree(entree));
    console.log(`    + ${nom}`);
  }

  regenererLIndex();
}

function principal() {
  const verifier = process.argv.includes('--verifier');

  if (process.argv.includes('--index')) {
    regenererLIndex();

    return;
  }

  const rangAjout = process.argv.indexOf('--ajouter');

  if (rangAjout !== -1) {
    const chemin = process.argv[rangAjout + 1];

    if (!chemin) {
      console.error('  --ajouter attend un chemin de fragment markdown.');
      process.exitCode = 1;

      return;
    }

    ajouterDesEntrees(chemin);

    return;
  }

  const markdown = readFileSync(SOURCE, 'utf8');

  if (refusSiDejaMigre(markdown)) {
    process.exitCode = 1;

    return;
  }

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

  writeFileSync(SOURCE, indexDeLInventaire(entrees, noms, residusNonTabulaires(markdown)));

  console.log(`  ${entrees.length} fichiers écrits dans ${DOSSIER}/`);
  console.log(`  ${SOURCE} réécrit en index (${entrees.length} lignes).`);
}

/**
 * Ce qui RESSEMBLE à une entrée sans en être une — et qu'une migration
 * silencieuse perdrait.
 *
 * Mesuré sur l'inventaire du 2026-09-16 : UNE ligne, la 66. Un identifiant
 * tronqué (`| BUG-AGENT-`) collé à un bloc de citation, donc une seule barre
 * verticale : `lireLesEntrees` l'écarte à raison, ce n'est pas une ligne de
 * tableau. Mais c'est du CONTENU — une décision d'Avi sur dix conversations à
 * réponses vides. Le compteur de référence l'avait vu (315 contre 314) ; sans
 * ce report, l'écart se serait lu comme un arrondi.
 *
 * On reporte la ligne et le bloc de citation qui la suit, mot pour mot.
 */
export function residusNonTabulaires(markdown) {
  const lignes = markdown.split('\n');
  const blocs = [];

  for (const [rang, ligne] of lignes.entries()) {
    if (!/^\|\s*BUG-/u.test(ligne) || estUneLigneDeTableau(ligne)) {
      continue;
    }

    const bloc = [ligne];

    for (let suivant = rang + 1; suivant < lignes.length && /^>/u.test(lignes[suivant]); suivant += 1) {
      bloc.push(lignes[suivant]);
    }

    blocs.push({ ligne: rang + 1, texte: bloc.join('\n') });
  }

  return blocs;
}

/**
 * L'inventaire redevient un INDEX : une ligne par entrée, vers son fichier.
 *
 * Pourquoi le fichier survit au lieu d'être supprimé. Dix-neuf fichiers le
 * citent en prose — « voir BUG-SOL-001 dans BUG_INVENTORY_LIVE.md », des
 * registres de parité, des commentaires de code. Supprimer le chemin casse
 * chacune de ces références sans rien apporter : ce qui devait disparaître,
 * c'est le CONTENU dupliqué, pas le point d'entrée.
 *
 * L'index est DÉRIVÉ, jamais édité à la main : `index-a-jour.spec.mjs` le
 * recalcule et rougit à la moindre dérive. Deux registres qui se contredisent
 * sont pires qu'un seul mal rangé.
 */
export function indexDeLInventaire(entrees, noms, residus = []) {
  const lignes = [
    '# Inventaire des bugs — index',
    '',
    "Une entrée = un fichier dans `docs/bugs/`. Ce fichier est un index DÉRIVÉ :",
    "il se régénère avec `node scripts/migrer-inventaire-bugs.mjs`, et",
    '`scripts/index-a-jour.spec.mjs` rougit s’il diverge du dossier.',
    '',
    `${entrees.length} entrées.`,
  ];

  let sectionCourante = null;

  for (const [index, entree] of entrees.entries()) {
    if (entree.section !== sectionCourante) {
      sectionCourante = entree.section;
      lignes.push('', `## ${sectionCourante || 'Sans section'}`, '');
    }

    lignes.push(`- [${entree.id}](${DOSSIER.replace(/\\/gu, '/')}/${noms[index]})${resumeDeLEntree(entree)}`);
  }

  if (residus.length > 0) {
    lignes.push('', '## Résidus non tabulaires — reportés mot pour mot', '');
    lignes.push(
      `${residus.length} bloc(s) commençaient comme une entrée sans être une ligne de tableau.`,
      "Ils sont conservés ici tels quels : une migration ne perd pas de contenu en silence.",
    );

    for (const residu of residus) {
      lignes.push('', `<!-- inventaire d'origine, ligne ${residu.ligne} -->`, residu.texte);
    }
  }

  return `${lignes.join('\n')}\n`;
}

/** La première phrase en gras de la colonne « Bug » — ce qui la nomme. */
function resumeDeLEntree(entree) {
  const texte = entree.champs.Bug ?? entree.champs["Bug (mots d'Avi)"] ?? entree.champs.Constat ?? '';
  const gras = /\*\*([^*]{3,160})\*\*/u.exec(texte);
  const brut = (gras ? gras[1] : texte)
    .replace(/\*\*/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

  return brut ? ` — ${brut.slice(0, 160)}` : '';
}

if (process.argv[1]?.endsWith('migrer-inventaire-bugs.mjs')) {
  principal();
}
