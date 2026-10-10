#!/usr/bin/env node
/**
 * CETTE PROPOSITION DÉCLENCHERA-T-ELLE UN DÉPLOIEMENT ?
 *
 * La question à poser AVANT de fusionner, et personne ne pouvait y répondre
 * sans lire `paths-ignore` à l'œil.
 *
 * Pourquoi elle compte : `paths-ignore` ne saute le déploiement que si TOUS les
 * fichiers touchés correspondent. Une proposition dont c'est le cas avance
 * quand même `main`, donc elle ÉCARTE le déploiement en attente du code
 * fusionné juste avant, puis saute le sien. Plus aucun déploiement ne porte ce
 * code, et rien n'alerte — ni rouge, ni run annulé. Mesuré le 2026-09-30.
 *
 * Ce script répond donc à « peut-elle passer en deuxième position ? ». Un
 * `NE DÉPLOIE PAS` veut dire : seulement en dernier, ou quand rien n'attend.
 *
 * Usage : node scripts/declenche-un-deploiement.mjs <fichier>...
 *         gh pr view <n> --json files -q '.files[].path' | xargs node scripts/…
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * ⚠️ LE JETON N'EST PAS UNE COQUETTERIE — c'est le correctif d'un faux résultat.
 *
 * Traduire `**` en `.*` PUIS `*` en `[^/]*` fait réattaquer par la seconde
 * substitution le `.*` que la première vient d'insérer : `tests/**` devenait
 * `tests/.[^/]*`, qui ne matche PAS `tests/e2e/x.ts`. J'ai rendu un résultat
 * faux avec cette version le 2026-09-30, et seuls les contrôles de
 * l'instrument (voir le spec) l'ont attrapé.
 */
const JETON = '\u0000';

export function versRegex(motif) {
  const corps = motif
    .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replace(/\*\*\//gu, `${JETON}S`)
    .replace(/\*\*/gu, `${JETON}D`)
    .replace(/\*/gu, `${JETON}U`)
    .split(`${JETON}S`)
    .join('(?:.*/)?')
    .split(`${JETON}D`)
    .join('.*')
    .split(`${JETON}U`)
    .join('[^/]*');

  return new RegExp(`^${corps}$`, 'u');
}

/** Les motifs sont LUS dans le workflow, jamais recopiés : une copie dérive. */
export function motifsIgnores(
  cheminWorkflow = resolve(racine, '.github/workflows/deploy-main.yml'),
) {
  const workflow = parse(readFileSync(cheminWorkflow, 'utf8'));

  /* `on:` est interprété par YAML 1.1 comme le booléen `true`. */
  const declencheurs = workflow.on ?? workflow[true];
  const motifs = declencheurs?.push?.['paths-ignore'];

  if (!Array.isArray(motifs) || motifs.length === 0) {
    throw new Error(
      "`push.paths-ignore` introuvable dans deploy-main.yml : sans lui, ce script rendrait « déploie » pour tout, " +
        'ce qui est le verdict le PLUS permissif. Il refuse plutôt que de rassurer.',
    );
  }

  return motifs;
}

export function fichiersQuiDeclenchent(fichiers, motifs = motifsIgnores()) {
  const regex = motifs.map(versRegex);

  return fichiers.filter((fichier) => !regex.some((r) => r.test(fichier)));
}

function principal() {
  const fichiers = process.argv.slice(2).filter(Boolean);

  if (fichiers.length === 0) {
    console.error("usage: node scripts/declenche-un-deploiement.mjs <fichier>...\n  (aucun fichier n'a été donné)");
    process.exit(64);
  }

  const restants = fichiersQuiDeclenchent(fichiers);

  if (restants.length === 0) {
    console.log(
      `⚠️  NE DÉPLOIE PAS — les ${fichiers.length} fichier(s) tombent tous sous paths-ignore.\n` +
        "    À fusionner EN DERNIER, ou quand aucun déploiement n'attend : sinon elle écarte\n" +
        '    le déploiement du code fusionné avant elle, et saute le sien.',
    );
    process.exit(1);
  }

  console.log(
    `✔ DÉPLOIE — ${restants.length} fichier(s) sur ${fichiers.length} hors paths-ignore :\n` +
      restants.map((f) => `    ${f}`).join('\n'),
  );
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal();
}
