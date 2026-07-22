#!/usr/bin/env node
/**
 * LS-16 (verdicts RR-20260721-CODEX-04 puis RR-20260722-CODEX-05) —
 * TEST NÉGATIF DE SUBSTITUTION, DÉTERMINISTE.
 *
 * Attaque simulée : présenter comme attestation « Parity registries » un run
 * VERT et RÉEL d'un autre workflow. Verdict -05 : la version précédente
 * cherchait un run étranger dans les 50 derniers runs de l'API — preuve
 * dépendante de l'historique, non déterministe. Cette version rejoue la
 * substitution sur une FIXTURE FIGÉE (capture API réelle du run 29812663423,
 * « Preview Deployment », event=pull_request, head_branch=ops/dr-proven,
 * commitée dans scripts/parity/fixtures/) injectée par stub fetch : aucune
 * dépendance réseau ni historique — même résultat à chaque exécution.
 *
 * Une sonde LIVE optionnelle (si GH_TOKEN) rejoue en plus la substitution
 * contre l'API réelle quand un run étranger existe ; son ABSENCE n'est jamais
 * bloquante (verdict -05 : « sans rendre l'absence de candidat bloquante »).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAttestationRun, EXPECTED_WORKFLOW_PATH } from './verify-attestation-run.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = process.env.GITHUB_REPOSITORY ?? 'openaxcloud/vibecore';

function forgedFromRun(run) {
  // Attestation forgée : toutes les valeurs sont AUTHENTIQUES (copiées du run
  // étranger) — seule l'identité du workflow attesté est fausse.
  return {
    runId: run.id,
    runCommit: run.head_sha,
    runUrl: run.html_url,
    runDate: run.created_at,
    conclusion: run.conclusion,
  };
}

function assertRejected(errors, label, run) {
  const detected = errors.some((e) => e.includes('substitution') || e.includes('workflow') || e.includes('event') || e.includes('head_branch'));

  if (!detected) {
    console.error(`[substitution-test] ÉCHEC (${label}) — le run étranger ${run.id} (${run.name}, ${run.path}) a été ACCEPTÉ comme attestation Parity registries`);
    console.error('  erreurs retournées: ' + JSON.stringify(errors));
    process.exit(1);
  }

  console.log(`[substitution-test] OK (${label}) — substitution du run étranger ${run.id} (${run.name}, event=${run.event}, branch=${run.head_branch}) REJETÉE :`);
  for (const e of errors) console.log('  ✗ (attendu) ' + e);
}

/* ---- 1. Cas DÉTERMINISTE : fixture figée + fetch stubbé ------------------ */
const fixture = JSON.parse(readFileSync(join(here, 'fixtures', 'foreign-run-29812663423.json'), 'utf8'));
const stubFetch = async () => ({ ok: true, json: async () => fixture });

const origFetch = globalThis.fetch;
globalThis.fetch = stubFetch;
const fixtureErrors = await verifyAttestationRun(forgedFromRun(fixture), { token: 'stub-token-unused', repo });
globalThis.fetch = origFetch;

assertRejected(fixtureErrors, 'fixture figée, déterministe', fixture);

// Contre-contrôle du stub : la même fixture avec l'identité de workflow
// CORRECTE mais une autre branche doit être rejetée UNIQUEMENT sur la branche
// (prouve que le rejet ci-dessus ne vient pas d'un stub cassé).
const branchOnly = { ...fixture, path: EXPECTED_WORKFLOW_PATH, name: 'Parity registries', event: 'push' };
globalThis.fetch = async () => ({ ok: true, json: async () => branchOnly });
const branchErrors = await verifyAttestationRun(forgedFromRun(branchOnly), { token: 'stub-token-unused', repo });
globalThis.fetch = origFetch;

if (!branchErrors.some((e) => e.includes('head_branch'))) {
  console.error('[substitution-test] ÉCHEC — un run push du bon workflow depuis une AUTRE branche (ops/dr-proven) n\'a pas été rejeté sur head_branch');
  console.error('  erreurs retournées: ' + JSON.stringify(branchErrors));
  process.exit(1);
}
console.log('[substitution-test] OK (head_branch) — run du bon workflow mais branche ops/dr-proven REJETÉ sur head_branch (RR-05 §1)');

/* ---- 2. Sonde LIVE best-effort (jamais bloquante sur absence) ------------ */
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!token) {
  console.log('[substitution-test] sonde live SAUTÉE (pas de GH_TOKEN) — le cas déterministe ci-dessus fait foi');
} else {
  try {
    const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };
    const list = await fetch(`https://api.github.com/repos/${repo}/actions/runs?status=success&per_page=50`, { headers });
    const runs = list.ok ? (await list.json()).workflow_runs ?? [] : [];
    const foreign = runs.find((r) => r.path !== EXPECTED_WORKFLOW_PATH);

    if (!foreign) {
      console.log('[substitution-test] sonde live : aucun run étranger dans la fenêtre — NON BLOQUANT (RR-05), le cas déterministe fait foi');
    } else {
      const liveErrors = await verifyAttestationRun(forgedFromRun(foreign), { token, repo });
      assertRejected(liveErrors, 'sonde live', foreign);
    }
  } catch (err) {
    console.log(`[substitution-test] sonde live en erreur (${err?.message}) — NON BLOQUANT, le cas déterministe fait foi`);
  }
}
