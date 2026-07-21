#!/usr/bin/env node
/**
 * LS-16 (verdict RR-20260721-CODEX-04) — TEST NÉGATIF DE SUBSTITUTION.
 *
 * Attaque simulée : prendre un run VERT et RÉEL d'un AUTRE workflow du même
 * dépôt (donc runId/head_sha/url/date/conclusion tous authentiques côté API)
 * et le présenter comme attestation « Parity registries ». Avant le verdict
 * -04, verify-attestation-run.mjs l'acceptait (il ne vérifiait ni le workflow
 * ni l'événement). Ce test échoue le build si la substitution N'EST PAS
 * détectée. Sans GH_TOKEN : SAUTÉ explicitement (dit, jamais silencieux).
 */
import { verifyAttestationRun, EXPECTED_WORKFLOW_PATH } from './verify-attestation-run.mjs';

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!token) {
  console.log('[substitution-test] SAUTÉ (pas de GH_TOKEN — la CI exécute ce test avec le token du run)');
  process.exit(0);
}

const repo = process.env.GITHUB_REPOSITORY ?? 'openaxcloud/vibecore';
const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };

// Trouver un run VERT d'un workflow ÉTRANGER (≠ parity-registries.yml).
const list = await fetch(`https://api.github.com/repos/${repo}/actions/runs?status=success&per_page=50`, { headers });

if (!list.ok) {
  console.error(`[substitution-test] impossible de lister les runs (${list.status})`);
  process.exit(1);
}

const runs = (await list.json()).workflow_runs ?? [];
const foreign = runs.find((r) => r.path !== EXPECTED_WORKFLOW_PATH);

if (!foreign) {
  console.error('[substitution-test] aucun run vert de workflow étranger trouvé dans les 50 derniers — test non concluant');
  process.exit(1);
}

// Attestation forgée : toutes les valeurs sont AUTHENTIQUES (copiées du run
// étranger) — seule l'identité du workflow est fausse. C'est exactement la
// substitution décrite par le relecteur.
const forged = {
  runId: foreign.id,
  runCommit: foreign.head_sha,
  runUrl: foreign.html_url,
  runDate: foreign.created_at,
  conclusion: foreign.conclusion,
};

const errors = await verifyAttestationRun(forged, { token, repo });
const detected = errors.some((e) => e.includes('substitution') || e.includes('workflow') || e.includes('event'));

if (!detected) {
  console.error(`[substitution-test] ÉCHEC — le run étranger ${foreign.id} (${foreign.name}, ${foreign.path}) a été ACCEPTÉ comme attestation Parity registries`);
  console.error('  erreurs retournées: ' + JSON.stringify(errors));
  process.exit(1);
}

console.log(`[substitution-test] OK — substitution du run étranger ${foreign.id} (${foreign.name}, event=${foreign.event}) REJETÉE :`);
for (const e of errors) console.log('  ✗ (attendu) ' + e);
