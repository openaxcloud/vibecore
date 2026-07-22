#!/usr/bin/env node
/**
 * LS-16 (verdicts RR-20260721-CODEX-03 puis -04) — AUTHENTIFIE l'attestation
 * contre l'API GitHub Actions : le runId déclaré doit être une VRAIE exécution
 * dont head_sha == runCommit, conclusion == success, created_at cohérent avec
 * runDate (±48h), html_url == runUrl, ET (verdict -04) dont l'IDENTITÉ DE
 * WORKFLOW (path parity-registries.yml) et l'ÉVÉNEMENT (push) correspondent —
 * sinon un run vert de n'importe quel autre workflow au même SHA pourrait être
 * substitué. Sans GH_TOKEN (exécution locale), le contrôle est SAUTÉ
 * EXPLICITEMENT (dit, jamais silencieux) — la CI le fait.
 *
 * Exporte verifyAttestationRun(att, {token, repo}) pour le test négatif de
 * substitution (verify-attestation-substitution-test.mjs).
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const require = createRequire(join(process.env.PARITY_DEPS ?? '/tmp/parity-deps', 'noop.js'));

function loadYamlModule() {
  try {
    return require('yaml');
  } catch {
    return createRequire(join(repoRoot, 'noop.js'))('yaml');
  }
}

// Identité attendue du workflow attesté (verdict -04) : le job roll-attestation
// vit dans CE fichier et ne roule QUE sur l'événement push (merge sur main).
export const EXPECTED_WORKFLOW_PATH = '.github/workflows/parity-registries.yml';
export const EXPECTED_WORKFLOW_NAME = 'Parity registries';
export const EXPECTED_EVENTS = ['push'];
// Verdict RR-05 : un run push du même workflow depuis une AUTRE branche ne
// vaut pas attestation de main.
export const EXPECTED_HEAD_BRANCH = 'main';

/** Vérifie une attestation contre l'API GitHub. Retourne la liste des erreurs. */
export async function verifyAttestationRun(att, { token, repo }) {
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${att.runId}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  });

  if (!res.ok) {
    return [`run ${att.runId} INTROUVABLE via l'API (${res.status}) — attestation non authentifiable`];
  }

  const run = await res.json();
  const errors = [];

  // Verdict -04 : identité du workflow — un run vert d'un AUTRE workflow au
  // même SHA n'est PAS une attestation Parity registries.
  if (run.path !== EXPECTED_WORKFLOW_PATH) {
    errors.push(`workflow path API (${run.path}) ≠ attendu (${EXPECTED_WORKFLOW_PATH}) — substitution de run étranger`);
  }

  if (run.name !== EXPECTED_WORKFLOW_NAME) {
    errors.push(`workflow name API (${run.name}) ≠ attendu (${EXPECTED_WORKFLOW_NAME})`);
  }

  // Verdict -04 : événement — l'attestation n'est roulée QUE post-merge (push).
  if (!EXPECTED_EVENTS.includes(run.event)) {
    errors.push(`event API (${run.event}) ∉ attendus [${EXPECTED_EVENTS.join(', ')}] — l'attestation ne roule que sur push`);
  }

  // Verdict RR-05 : la branche du run doit être main.
  if (run.head_branch !== EXPECTED_HEAD_BRANCH) {
    errors.push(`head_branch API (${run.head_branch}) ≠ attendu (${EXPECTED_HEAD_BRANCH}) — run d'une autre branche substitué`);
  }

  if (run.head_sha !== att.runCommit) {
    errors.push(`head_sha API (${String(run.head_sha).slice(0, 12)}) ≠ runCommit attesté (${String(att.runCommit).slice(0, 12)})`);
  }

  if (run.conclusion !== att.conclusion) {
    errors.push(`conclusion API (${run.conclusion}) ≠ attestée (${att.conclusion})`);
  }

  if (att.runUrl && run.html_url && !String(att.runUrl).startsWith(run.html_url)) {
    errors.push(`runUrl attesté (${att.runUrl}) ≠ html_url API (${run.html_url})`);
  }

  const apiDate = new Date(run.created_at).getTime();
  const attDate = new Date(att.runDate).getTime();

  if (Number.isFinite(apiDate) && Number.isFinite(attDate) && Math.abs(apiDate - attDate) > 48 * 3600_000) {
    errors.push(`runDate attestée (${att.runDate}) à plus de 48h de created_at API (${run.created_at})`);
  }

  return errors;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const YAML = loadYamlModule();
  const att = YAML.parse(readFileSync(join(repoRoot, 'docs/parity/CI_ATTESTATION.yaml'), 'utf8')).attestation;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  if (!token) {
    console.log('[verify-attestation-run] SAUTÉ (pas de GH_TOKEN — la CI exécute ce contrôle avec le token du run)');
    process.exit(0);
  }

  const repo = process.env.GITHUB_REPOSITORY ?? 'openaxcloud/vibecore';
  const errors = await verifyAttestationRun(att, { token, repo });

  if (errors.length > 0) {
    console.error('[verify-attestation-run] ATTESTATION NON AUTHENTIFIÉE:');
    for (const e of errors) console.error('  ✗ ' + e);
    process.exit(1);
  }

  console.log(`[verify-attestation-run] OK — run ${att.runId} authentifié via l'API GitHub (workflow, event, head_sha, conclusion, url, date cohérents)`);
}
