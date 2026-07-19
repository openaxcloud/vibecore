#!/usr/bin/env node
/**
 * Contrôle de complétude du backlog (audit de couverture 2026-07-19).
 *
 * CERTIFICATION CALCULABLE : « tous les points trouvés dans les 29 anciens
 * fichiers sont DANS le plan, et ce contrôle casse si un seul disparaît. »
 *
 * Le plan canonique porte une section « Backlog complet » avec UNE ligne par
 * point (ID, description, statut, owner, date, suivi). Ce script :
 *  1. extrait chaque ligne du backlog du plan ;
 *  2. vérifie le COMPTE EXACT et le SHA-256 de la liste triée des IDs contre
 *     les constantes ci-dessous — retirer/renommer UN SEUL point casse le
 *     build (même philosophie que EXPECTED_P0_IDS) ;
 *  3. vérifie le schéma de chaque ligne : statut ∈ {NON FAIT, DÉJÀ FAIT,
 *     PÉRIMÉ} ; DÉJÀ FAIT/PÉRIMÉ exigent « (preuve : … ) » dans la
 *     description — on ne déclare rien fait sans référence ;
 *  4. vérifie que chaque référence « suivi par » (P0-*, P1-COV-*, BD-*, PR-*,
 *     UNK-*, DEC-*, SRF-*) existe réellement dans les registres — aucun
 *     pointeur orphelin.
 *
 * Mettre à jour EXPECTED_* est un acte de revue explicite (le diff le montre),
 * jamais un effet de bord. `--print-expected` recalcule les constantes.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Constantes de certification — toute dérive = build cassé. */
export const EXPECTED_BACKLOG_COUNT = 336;
export const EXPECTED_BACKLOG_SHA256 = '121218ffdf512d539f0e6cbe31f698077b5f6a5de494894b2649694a55cec8b3';

const require = createRequire(import.meta.url);

function loadYamlModule() {
  try {
    return require('yaml');
  } catch {
    return createRequire(join(process.env.PARITY_DEPS ?? '/tmp/parity-deps', 'noop.js'))('yaml');
  }
}

const YAML = loadYamlModule();
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const parityRoot = join(repoRoot, 'docs', 'parity');

const ID_RE = /^(GLC-L\d+|RB-L\d+|CM-\d+[a-z]?|DH-\w+|BD-\d+|ACT-\d+|RPD-\d+|OUT-[A-Z]+-\d+)$/;
const STATUTS = ['NON FAIT', 'DÉJÀ FAIT', 'PÉRIMÉ'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TRACE_ID_RE = /\b(P0-V\d-\d+|P1-COV-\d+|BD-\d+|PR-[A-Z]+-\d+|UNK-[A-Z0-9-]+|DEC-[A-Z0-9-]+|SRF-[A-Z0-9-]+)\b/g;

export function checkPlanCompleteness() {
  const errors = [];
  const planPath = join(parityRoot, 'PLAN_PARITE_REPLIT.md');
  const plan = readFileSync(planPath, 'utf8');

  /* Registres pour la résolution des références « suivi par ». */
  const knownIds = new Set();

  const p0 = YAML.parse(readFileSync(join(parityRoot, 'P0_REGISTRY.yaml'), 'utf8'));

  for (const item of p0.p0s ?? []) {
    knownIds.add(item.p0Id);
  }

  for (const item of p0.p1s ?? []) {
    knownIds.add(item.p1Id);
  }

  for (const [file, listKey, idKey] of [
    ['BOLT_DEBT_REGISTRY.yaml', 'items', 'id'],
    ['PRODUCTION_READINESS_REGISTRY.yaml', 'items', 'id'],
    ['UNKNOWN_REGISTRY.yaml', 'unknowns', 'unknownId'],
    ['DECISION_REGISTRY.yaml', 'decisions', 'decisionId'],
    ['SURFACE_REGISTRY.yaml', 'surfaces', 'surfaceId'],
  ]) {
    const doc = YAML.parse(readFileSync(join(parityRoot, file), 'utf8'));

    for (const entry of doc[listKey] ?? []) {
      knownIds.add(entry[idKey]);
    }
  }

  /* Extraction des lignes du backlog (section « Backlog complet »). */
  const rows = [];

  for (const line of plan.split('\n')) {
    if (!line.startsWith('| ')) {
      continue;
    }

    const cells = line.split('|').map((c) => c.trim());
    // ['', id, description, statut, owner, date, suivi, '']
    if (cells.length !== 8 || !ID_RE.test(cells[1])) {
      continue;
    }

    rows.push({ id: cells[1], description: cells[2], statut: cells[3], owner: cells[4], date: cells[5], suivi: cells[6] });
  }

  const ids = rows.map((r) => r.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);

  for (const d of new Set(dupes)) {
    errors.push(`backlog: ID en double "${d}"`);
  }

  /* 2. Compte exact + hash — un point qui disparaît casse le build. */
  const sha = createHash('sha256').update([...ids].sort().join('\n')).digest('hex');

  if (ids.length !== EXPECTED_BACKLOG_COUNT) {
    errors.push(`backlog: ${ids.length} points trouvés dans le plan, ${EXPECTED_BACKLOG_COUNT} attendus — le backlog ne peut pas rétrécir (ni gonfler) silencieusement`);
  }

  if (sha !== EXPECTED_BACKLOG_SHA256) {
    errors.push(`backlog: SHA-256 de la liste des IDs (${sha.slice(0, 16)}…) ≠ attendu — un point a été retiré, renommé ou ajouté sans mise à jour explicite des constantes`);
  }

  /* 3. Schéma de chaque ligne. */
  for (const row of rows) {
    if (!STATUTS.includes(row.statut)) {
      errors.push(`${row.id}: statut "${row.statut}" invalide (NON FAIT | DÉJÀ FAIT | PÉRIMÉ)`);
    }

    if ((row.statut === 'DÉJÀ FAIT' || row.statut === 'PÉRIMÉ') && !row.description.includes('(preuve')) {
      errors.push(`${row.id}: statut ${row.statut} sans « (preuve : …) » dans la description — rien n'est fait/périmé sans référence`);
    }

    if (!row.owner) {
      errors.push(`${row.id}: owner manquant`);
    }

    if (!ISO_DATE.test(row.date)) {
      errors.push(`${row.id}: date "${row.date}" non ISO`);
    }

    if (!row.suivi || row.suivi === 'A-MAPPER') {
      errors.push(`${row.id}: colonne « suivi par » vide ou A-MAPPER`);
    }

    /* 4. Références « suivi par » résolues. */
    for (const m of row.suivi.matchAll(TRACE_ID_RE)) {
      if (!knownIds.has(m[1])) {
        errors.push(`${row.id}: référence orpheline "${m[1]}" — absente des registres`);
      }
    }
  }

  const counts = {
    total: rows.length,
    nonFait: rows.filter((r) => r.statut === 'NON FAIT').length,
    dejaFait: rows.filter((r) => r.statut === 'DÉJÀ FAIT').length,
    perime: rows.filter((r) => r.statut === 'PÉRIMÉ').length,
  };

  return { errors, counts, ids, sha };
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const { errors, counts, ids, sha } = checkPlanCompleteness();

  if (process.argv.includes('--print-expected')) {
    console.log(`EXPECTED_BACKLOG_COUNT = ${ids.length}`);
    console.log(`EXPECTED_BACKLOG_SHA256 = '${sha}'`);
    process.exit(0);
  }

  console.log(
    `[check-plan-completeness] ${counts.total} points dans le plan — NON FAIT: ${counts.nonFait}, DÉJÀ FAIT: ${counts.dejaFait}, PÉRIMÉ: ${counts.perime}`,
  );

  if (errors.length > 0) {
    console.error(`[check-plan-completeness] ${errors.length} violation(s):`);

    for (const e of errors) {
      console.error(`  ✗ ${e}`);
    }

    process.exit(1);
  }

  console.log('[check-plan-completeness] CERTIFIÉ : chaque point de l’audit est dans le plan, aucun ne peut disparaître sans casser le build');
}
