/**
 * Validation SYNTAXIQUE de tous les scripts shell embarqués dans les workflows.
 *
 * POURQUOI. Le 2026-08-31, un déploiement a échoué en exit 127 :
 * `explain_current: command not found` — une fonction bash appelée AVANT sa
 * définition dans `deploy-main.yml`. Le défaut était présent depuis le 28/08 à
 * 12:53 (`4fc8db382`), soit **trois jours**, et n'a bloqué qu'un seul
 * déploiement : la ligne fautive n'est atteinte que dans la branche « provenance
 * inconnue », une conjonction rare.
 *
 * Le problème n'était donc pas l'ampleur mais la LATENCE. Un défaut qui attend
 * une conjonction rare pour se manifester est une bombe à retardement : il
 * choisit son moment, et ce sera le pire.
 *
 * Ce script rend la classe entière détectable au commit plutôt qu'au
 * déploiement. Il ne remplace pas les tests : il attrape ce qu'aucun test ne
 * couvre, parce que ces scripts ne s'exécutent qu'en production.
 *
 * Deux contrôles :
 *   1. `bash -n` — syntaxe. Attrape les blocs non fermés, les quotes bancales.
 *   2. fonction utilisée avant définition — ce que `bash -n` NE voit PAS, parce
 *      que c'est valide syntaxiquement et ne casse qu'à l'exécution.
 *
 * Le second contrôle existe précisément parce que le premier n'aurait pas
 * attrapé le défaut du 31/08. Vérifié : `bash -n` sur le script fautif ne
 * signale rien.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DOSSIER = '.github/workflows';
const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

if (fichiers.length === 0) {
  console.error(`AUCUN workflow lu dans ${DOSSIER} — la validation ne mesure rien.`);
  process.exit(1);
}

/** Extrait les blocs `run: |` d'un YAML, sans dépendance externe. */
function blocsRun(source) {
  const lignes = source.split('\n');
  const blocs = [];

  for (let i = 0; i < lignes.length; i += 1) {
    const m = lignes[i].match(/^(\s*)(?:-\s+)?run:\s*[|>][-+]?\s*$/);

    if (!m) {
      continue;
    }

    const indentBloc = m[1].length;
    const corps = [];

    for (let j = i + 1; j < lignes.length; j += 1) {
      const ligne = lignes[j];

      if (ligne.trim() === '') {
        corps.push('');
        continue;
      }

      const indent = ligne.length - ligne.trimStart().length;

      if (indent <= indentBloc) {
        break;
      }

      corps.push(ligne);
    }

    if (corps.length > 0) {
      const base = Math.min(...corps.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
      blocs.push({ ligne: i + 1, script: corps.map((l) => l.slice(base)).join('\n') });
    }
  }

  return blocs;
}

/** Fonctions bash appelées avant leur définition — invisible pour `bash -n`. */
function appelsAvantDefinition(script) {
  const lignes = script.split('\n');
  const definies = new Map();
  const fautes = [];

  for (const [index, ligne] of lignes.entries()) {
    const def = ligne.match(/^\s*([a-zA-Z_]\w*)\s*\(\)\s*\{/);

    if (def && !definies.has(def[1])) {
      definies.set(def[1], index);
    }
  }

  for (const [nom, ligneDef] of definies) {
    for (const [index, ligne] of lignes.entries()) {
      if (index >= ligneDef) {
        break;
      }

      const nu = ligne.replace(/#.*$/, '');

      if (new RegExp(`(^|[;&|(\\s])${nom}(\\s|$|;|&|\\))`).test(nu) && !nu.includes(`${nom}()`)) {
        fautes.push(`${nom} appelée ligne ${index + 1}, définie ligne ${ligneDef + 1}`);
        break;
      }
    }
  }

  return fautes;
}

const temp = mkdtempSync(join(tmpdir(), 'wf-'));
let blocsVus = 0;
const problemes = [];

for (const fichier of fichiers) {
  const source = readFileSync(join(DOSSIER, fichier), 'utf8');

  for (const bloc of blocsRun(source)) {
    blocsVus += 1;

    const chemin = join(temp, `b${blocsVus}.sh`);
    writeFileSync(chemin, bloc.script);

    try {
      execFileSync('bash', ['-n', chemin], { stdio: 'pipe' });
    } catch (erreur) {
      problemes.push(`${fichier}:${bloc.ligne} — syntaxe : ${String(erreur.stderr ?? erreur).slice(0, 200)}`);
    }

    for (const faute of appelsAvantDefinition(bloc.script)) {
      problemes.push(`${fichier}:${bloc.ligne} — ${faute}`);
    }
  }
}

console.log(`${fichiers.length} workflow(s), ${blocsVus} bloc(s) de script validé(s).`);

if (blocsVus < 10) {
  console.error(`Seulement ${blocsVus} blocs trouvés : l'extraction est probablement cassée, la validation ne mesure rien.`);
  process.exit(1);
}

if (problemes.length > 0) {
  console.error(`\n${problemes.length} problème(s) :`);
  for (const p of problemes) {
    console.error(`  ${p}`);
  }
  process.exit(1);
}

console.log('Aucun problème.');
