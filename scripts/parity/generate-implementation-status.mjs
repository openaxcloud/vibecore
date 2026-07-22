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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGitFileset, resolveCodeRefs } from './resolve-code-refs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const parityRoot = join(repoRoot, 'docs', 'parity');
const OUT = 'IMPLEMENTATION_STATUS.yaml';

/**
 * The EXACT canonical surface universe (P0-B-01): the 159 IDE candidates
 * P001–P159. The overlay covers this set 1:1 — no id may silently appear or
 * vanish. Consumed by generate + validate as the lock (like EXPECTED_P0_IDS).
 */
export const EXPECTED_SURFACE_IDS = Array.from({ length: 159 }, (_, i) => `P${String(i + 1).padStart(3, '0')}`);

/** builtStates that ASSERT working code — every codeRef must resolve to it. */
const BUILT_STATES = new Set(['CODED', 'INTEGRATED', 'PROVEN']);

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

  // The canonical enumeration lock: the fact set must be EXACTLY P001–P159.
  const factIds = (facts.items ?? []).map((f) => f.itemId);
  const factIdSet = new Set(factIds);

  for (const id of EXPECTED_SURFACE_IDS) {
    if (!factIdSet.has(id)) {
      problems.push(
        `surface ${id} MANQUANTE des faits — l'univers canonique ne peut pas rétrécir en silence (P0-B-01)`,
      );
    }
  }

  for (const id of factIds) {
    if (!EXPECTED_SURFACE_IDS.includes(id)) {
      problems.push(`item ${id} HORS univers canonique P001–P159 — id inventé refusé (P0-B-01)`);
    }
  }

  // git-tracked truth: a codeRef resolves ONLY if the tree actually tracks it.
  const gitset = loadGitFileset(repoRoot);

  const items = (facts.items ?? []).map((f) => {
    const status = deriveStatus(f, problems);
    counts[status] += 1;

    const { resolved, unresolved } = resolveCodeRefs(f.codeRefs, gitset);
    missingCodeRefTotal += unresolved.length;

    /*
     * The overlay's core honesty rule (P0-B-01): a builtState that ASSERTS
     * working code (CODED/INTEGRATED/PROVEN) must have EVERY code reference
     * resolve to a tracked file — a "built" surface citing a phantom path is
     * an unjustified builtState and fails the build. PARTIAL is allowed
     * unresolved refs (they are the gap it names), but must resolve at least
     * ONE (the part that IS built). NOT_STARTED carries no built claim.
     */
    if (BUILT_STATES.has(status)) {
      if (unresolved.length > 0) {
        problems.push(
          `${f.itemId}: builtState ${status} mais codeRef(s) non résolue(s) vers du code suivi par git: ${unresolved.join(', ')} (P0-B-01)`,
        );
      }

      if (resolved.length === 0) {
        problems.push(`${f.itemId}: builtState ${status} sans AUCUN codeRef résolvable — état non justifié (P0-B-01)`);
      }
    }

    if (status === 'PARTIAL' && resolved.length === 0) {
      problems.push(
        `${f.itemId}: PARTIAL sans aucun codeRef résolvable — un partiel doit montrer la partie construite (P0-B-01)`,
      );
    }

    return {
      ...f,
      status,
      resolvedCodeRefs: resolved,
      ...(unresolved.length ? { missingCodeRefs: unresolved } : {}),
    };
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
