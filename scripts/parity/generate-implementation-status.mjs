#!/usr/bin/env node
/**
 * IMPLEMENTATION_STATUS.yaml — GÉNÉRATEUR (P0-EX-02).
 *
 * Le statut d'implémentation n'est PLUS écrit à la main : il est DÉRIVÉ de
 * IMPLEMENTATION_FACTS.yaml (les faits par item — codeRefs, evidenceIds,
 * mergedToMain, partialReason, adjacentOnly) par des RÈGLES machine :
 *
 *   1. evidenceIds non vide ET chaque chemin existe sur disque  → PROVEN
 *      (un chemin d'évidence manquant = ERREUR fatale, pas un downgrade
 *      silencieux — les faits doivent rester vrais).
 *   2. adjacentOnly: true (les codeRefs sont du contexte, pas l'item) → NOT_STARTED
 *   3. mergedToMain ET codeRefs non vide                        → CODED
 *   4. codeRefs non vide (pas mergé / incomplet)                → PARTIAL
 *      (partialReason OBLIGATOIRE — erreur fatale s'il manque : un PARTIAL
 *      sans raison est un jugement caché, pas un fait).
 *   5. sinon                                                    → NOT_STARTED
 *
 * L'existence de chaque codeRef est vérifiée à HEAD ; un chemin disparu est
 * REPORTÉ (missingCodeRefs par item + compteur global) — visible, jamais tu.
 * Provenance (generatedAt / generatedFromCommit / mergedCommit) dérivée de
 * CI_ATTESTATION.yaml, comme DOCUMENT_MANIFEST (P0-LS-16) — déterministe,
 * recalculée à chaque merge, sans horloge locale.
 *
 * Usage :
 *   node scripts/parity/generate-implementation-status.mjs           # écrit
 *   node scripts/parity/generate-implementation-status.mjs --check   # exit 1 si dérive
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const parityRoot = join(repoRoot, 'docs', 'parity');
const OUT = 'IMPLEMENTATION_STATUS.yaml';

const require = createRequire(join(process.env.PARITY_DEPS ?? '/tmp/parity-deps', 'noop.js'));

function loadYamlModule() {
  try {
    return require('yaml');
  } catch {
    return createRequire(join(repoRoot, 'noop.js'))('yaml');
  }
}

const YAML = loadYamlModule();

function deriveStatus(item, problems) {
  const evidence = (item.evidenceIds ?? []).filter(Boolean);

  if (evidence.length > 0) {
    for (const ev of evidence) {
      if (!existsSync(join(repoRoot, ev))) {
        problems.push(`${item.itemId}: evidenceId absent du disque: ${ev}`);
      }
    }

    return 'PROVEN';
  }

  const codeRefs = String(item.codeRefs ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  if (item.adjacentOnly === true) {
    return 'NOT_STARTED';
  }

  if (codeRefs.length > 0 && item.mergedToMain === true) {
    return 'CODED';
  }

  if (codeRefs.length > 0) {
    if (!String(item.partialReason ?? '').trim()) {
      problems.push(`${item.itemId}: PARTIAL dérivé sans partialReason — un jugement caché n'est pas un fait`);
    }

    return 'PARTIAL';
  }

  return 'NOT_STARTED';
}

export function computeImplementationStatus() {
  const facts = YAML.parse(readFileSync(join(parityRoot, 'IMPLEMENTATION_FACTS.yaml'), 'utf8'));
  const att = readFileSync(join(parityRoot, 'CI_ATTESTATION.yaml'), 'utf8');
  const mergedCommit = att.match(/mergedCommit:\s*"?([0-9a-f]+)"?/)?.[1] ?? 'UNKNOWN';
  const mergedToMainAt = att.match(/mergedToMainAt:\s*"([^"]+)"/)?.[1] ?? 'UNKNOWN';

  const problems = [];
  const counts = { PROVEN: 0, CODED: 0, PARTIAL: 0, NOT_STARTED: 0 };
  let missingCodeRefTotal = 0;

  const items = (facts.items ?? []).map((f) => {
    const status = deriveStatus(f, problems);
    counts[status] += 1;

    const codeRefs = String(f.codeRefs ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    const missingCodeRefs = codeRefs.filter((p) => !existsSync(join(repoRoot, p)));
    missingCodeRefTotal += missingCodeRefs.length;

    return { ...f, status, ...(missingCodeRefs.length ? { missingCodeRefs } : {}) };
  });

  if (problems.length > 0) {
    throw new Error(`[implementation-status] faits invalides:\n  - ${problems.join('\n  - ')}`);
  }

  const doc = {
    schemaVersion: 2,
    generatedAt: mergedToMainAt,
    generatedFromCommit: mergedCommit,
    mergedCommit,
    factsSource: 'docs/parity/IMPLEMENTATION_FACTS.yaml',
    generator: 'scripts/parity/generate-implementation-status.mjs',
    derivationRules:
      'PROVEN=evidence sur disque; NOT_STARTED si adjacentOnly; CODED=mergedToMain+codeRefs; PARTIAL=codeRefs+partialReason obligatoire; sinon NOT_STARTED',
    counts,
    missingCodeRefTotal,
    items,
  };

  const header = [
    '# IMPLEMENTATION_STATUS — GÉNÉRÉ par scripts/parity/generate-implementation-status.mjs',
    '# (P0-EX-02). Ne JAMAIS éditer à la main — dérivé de IMPLEMENTATION_FACTS.yaml',
    '# par les règles §23 ; drift-check en CI (P0-EX-10). Pour changer un état :',
    '# changer le FAIT (codeRefs / evidenceIds / mergedToMain / partialReason /',
    '# adjacentOnly) dans IMPLEMENTATION_FACTS.yaml, puis régénérer.',
    '',
  ].join('\n');

  return header + YAML.stringify(doc);
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const outPath = join(parityRoot, OUT);
  const computed = computeImplementationStatus();

  if (process.argv.includes('--check')) {
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';

    if (current !== computed) {
      console.error('[implementation-status] STALE — régénérer (un fait a changé sans mise à jour du statut).');
      process.exit(1);
    }

    console.log('[implementation-status] up to date');
  } else {
    writeFileSync(outPath, computed);
    console.log(`[implementation-status] wrote ${outPath} (${computed.split('\n').length} lines)`);
  }
}
