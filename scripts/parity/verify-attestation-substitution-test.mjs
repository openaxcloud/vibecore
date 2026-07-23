#!/usr/bin/env node
/**
 * LS-16 (verdicts RR-…-04/-05 puis RR-20260722-CODEX-06) — TESTS NÉGATIFS
 * DÉTERMINISTES et INDÉPENDANTS PAR CHAMP.
 *
 * Verdict -06 §3 : le test étranger cumulait plusieurs différences ; il ne
 * démontrait pas indépendamment que CHAQUE garde casse quand elle est la seule
 * valeur falsifiée. Ici, à partir d'une fixture GOLDEN authentique (run réel
 * 29802136737 — Parity registries / push / main / success), on :
 *   1. vérifie le contrôle POSITIF (golden → 0 erreur) ;
 *   2. falsifie UN SEUL champ à la fois et exige que l'erreur DU BON PRÉFIXE
 *      apparaisse (workflow, event, branche, sha, conclusion, url, date) ;
 *   3. falsifie mergedCommit puis repoCommit dans l'ATTESTATION seule → erreur
 *      sha (verdict -06 §1) ;
 *   4. garde le cas cumulatif « run étranger » (fixture Preview Deployment) ;
 *   5. sonde live best-effort non bloquante (verdict -05).
 * Aucune dépendance réseau ni historique dans les cas 1-4 → déterministe.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkAttestationFields, verifyAttestationRun, sameCommit, normalizeRunUrl,
  EXPECTED_WORKFLOW_PATH,
} from './verify-attestation-run.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = process.env.GITHUB_REPOSITORY ?? 'openaxcloud/vibecore';
const golden = JSON.parse(readFileSync(join(here, 'fixtures', 'golden-run-29802136737.json'), 'utf8'));

// Attestation authentique correspondant au run golden (tous champs liés).
const goldenAtt = {
  runId: golden.id,
  runCommit: golden.head_sha,
  mergedCommit: golden.head_sha,
  repoCommit: golden.head_sha.slice(0, 8), // préfixe court explicite (doit passer)
  runUrl: golden.html_url,
  runDate: golden.created_at,
  conclusion: golden.conclusion,
};

let failed = false;
function must(cond, label) {
  if (!cond) { console.error(`  ✗ ÉCHEC: ${label}`); failed = true; }
  else console.log(`  ✓ ${label}`);
}

/* ---- 1. Contrôle POSITIF : golden authentique → 0 erreur --------------- */
console.log('[substitution-test] 1. contrôle positif (golden authentique)');
must(checkAttestationFields(goldenAtt, golden).length === 0,
  'golden + attestation cohérente → 0 erreur');

/* ---- 2. Un champ de RUN falsifié seul → erreur du bon préfixe ---------- */
console.log('[substitution-test] 2. falsification indépendante par champ (run)');
const perField = [
  ['path', '.github/workflows/preview.yaml', 'workflow'],
  ['name', 'Preview Deployment', 'workflow'],
  ['event', 'pull_request', 'event'],
  ['head_branch', 'feature/x', 'branche'],
  ['head_sha', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'sha'],
  ['conclusion', 'failure', 'conclusion'],
  ['html_url', 'https://github.com/openaxcloud/vibecore/actions/runs/99999999999', 'url'],
  ['created_at', '2020-01-01T00:00:00Z', 'date'],
];
for (const [field, badValue, prefix] of perField) {
  const tampered = { ...golden, [field]: badValue };
  const errs = checkAttestationFields(goldenAtt, tampered);
  const hit = errs.some((e) => e.startsWith(prefix + ':'));
  must(hit, `champ ${field} falsifié seul → erreur "${prefix}:" levée (${errs.length} erreur(s))`);
}

/* ---- 2b. Cas URL suffixée (verdict -06 §2 : plus de préfixe accepté) --- */
const suffixed = { ...golden, html_url: golden.html_url + '/attempts/2' };
must(checkAttestationFields(goldenAtt, suffixed).some((e) => e.startsWith('url:')),
  'url suffixée (…/attempts/2) → REJETÉE (égalité exacte, plus de préfixe)');

/* ---- 3. mergedCommit / repoCommit falsifiés dans l'ATTESTATION --------- */
console.log('[substitution-test] 3. commits de provenance liés au head_sha (verdict -06 §1)');
must(checkAttestationFields({ ...goldenAtt, mergedCommit: 'a'.repeat(40) }, golden).some((e) => e.startsWith('sha:') && e.includes('mergedCommit')),
  'mergedCommit ≠ head_sha → erreur sha');
must(checkAttestationFields({ ...goldenAtt, repoCommit: 'deadbeef' }, golden).some((e) => e.startsWith('sha:') && e.includes('repoCommit')),
  'repoCommit (préfixe) ≠ head_sha → erreur sha');
// préfixe court VALIDE accepté ; préfixe < 7 hex refusé
must(sameCommit(golden.head_sha.slice(0, 10), golden.head_sha), 'préfixe court 10 hex valide → accepté');
must(!sameCommit(golden.head_sha.slice(0, 6), golden.head_sha), 'préfixe 6 hex (<7) → refusé (règle explicite)');
must(normalizeRunUrl('https://github.com/x/y/actions/runs/1/') === 'https://github.com/x/y/actions/runs/1', 'normalizeRunUrl retire le slash final');

/* ---- 4. Cas cumulatif : run étranger complet -------------------------- */
console.log('[substitution-test] 4. run étranger complet (fixture Preview Deployment)');
const foreign = JSON.parse(readFileSync(join(here, 'fixtures', 'foreign-run-29812663423.json'), 'utf8'));
const foreignAtt = { runId: foreign.id, runCommit: foreign.head_sha, mergedCommit: foreign.head_sha, runUrl: foreign.html_url, runDate: foreign.created_at, conclusion: foreign.conclusion };
must(checkAttestationFields(foreignAtt, foreign).some((e) => e.startsWith('workflow:')),
  `run étranger ${foreign.id} (${foreign.name}) → REJETÉ sur l'identité workflow`);

if (failed) {
  console.error('[substitution-test] ÉCHEC — au moins une garde ne casse pas comme attendu');
  process.exit(1);
}
console.log('[substitution-test] OK — toutes les gardes cassent indépendamment (déterministe)');

/* ---- 5. Sonde LIVE best-effort (non bloquante) ------------------------ */
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.log('[substitution-test] sonde live SAUTÉE (pas de GH_TOKEN) — les cas déterministes font foi');
} else {
  try {
    const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };
    const list = await fetch(`https://api.github.com/repos/${repo}/actions/runs?status=success&per_page=50`, { headers });
    const runs = list.ok ? (await list.json()).workflow_runs ?? [] : [];
    const f = runs.find((r) => r.path !== EXPECTED_WORKFLOW_PATH);
    if (!f) {
      console.log('[substitution-test] sonde live : aucun run étranger dans la fenêtre — NON BLOQUANT');
    } else {
      const errs = await verifyAttestationRun({ runId: f.id, runCommit: f.head_sha, runUrl: f.html_url, runDate: f.created_at, conclusion: f.conclusion }, { token, repo });
      if (!errs.some((e) => e.startsWith('workflow:') || e.startsWith('event:') || e.startsWith('branche:'))) {
        console.error(`[substitution-test] ÉCHEC sonde live — run étranger ${f.id} accepté`);
        process.exit(1);
      }
      console.log(`[substitution-test] sonde live OK — run étranger ${f.id} (${f.name}) rejeté`);
    }
  } catch (err) {
    console.log(`[substitution-test] sonde live en erreur (${err?.message}) — NON BLOQUANT`);
  }
}
