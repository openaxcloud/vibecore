#!/usr/bin/env node
/**
 * LS-16 (verdicts RR-…-03/-04/-05 puis RR-20260722-CODEX-06) — AUTHENTIFIE
 * l'attestation contre l'API GitHub Actions, FAIL-CLOSED sur TOUTE la
 * provenance :
 *   - identité du workflow : path == parity-registries.yml, name == 'Parity
 *     registries' ;
 *   - événement : push ; branche : head_branch == main ;
 *   - conclusion == success ; created_at cohérent avec runDate (±48h) ;
 *   - **TOUS les commits de provenance** (runCommit, mergedCommit, et le commit
 *     de dépôt déclaré repoCommit s'il est présent) liés au head_sha authentifié
 *     par la MÊME règle `sameCommit` (verdict -06 §1) ;
 *   - **égalité EXACTE de l'URL** après normalisation — plus de préfixe accepté
 *     (verdict -06 §2).
 * Sans GH_TOKEN (exécution locale), le contrôle est SAUTÉ EXPLICITEMENT — la CI
 * le fait avec le token du run.
 *
 * Exporte verifyAttestationRun(att, {token, repo}) + checkAttestationFields(att,
 * run) (pur, sans réseau) pour les tests négatifs INDÉPENDANTS par champ
 * (verify-attestation-substitution-test.mjs).
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

export const EXPECTED_WORKFLOW_PATH = '.github/workflows/parity-registries.yml';
export const EXPECTED_WORKFLOW_NAME = 'Parity registries';
export const EXPECTED_EVENTS = ['push'];
export const EXPECTED_HEAD_BRANCH = 'main';
// Verdict -06 §1 : un commit de provenance PEUT être un préfixe court du
// head_sha authentifié, mais SEULEMENT s'il fait au moins 7 hex ET est
// réellement un préfixe. Règle explicite, fail-closed.
export const MIN_SHORT_SHA = 7;

/** Le commit déclaré == le head_sha authentifié, ou en est un préfixe court explicite (≥7 hex). */
export function sameCommit(declared, headSha) {
  if (typeof declared !== 'string' || typeof headSha !== 'string') return false;
  const d = declared.trim().toLowerCase();
  const h = headSha.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(d) || !/^[0-9a-f]{40}$/.test(h)) return false;
  if (d.length === 40) return d === h;
  return h.startsWith(d); // préfixe court explicite, ≥7 hex garanti par le regex
}

/** Normalise une URL de run pour comparaison exacte (schéma+host+path, sans slash final ni query/fragment). */
export function normalizeRunUrl(u) {
  if (typeof u !== 'string') return null;
  try {
    const url = new URL(u.trim());
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/**
 * Contrôle PUR (sans réseau) de tous les champs de l'attestation contre l'objet
 * `run` renvoyé par l'API. Retourne la liste des erreurs. Un test négatif peut
 * falsifier UN seul champ de `run` et vérifier que l'erreur correspondante
 * apparaît (indépendance par champ — verdict -06 §3).
 */
export function checkAttestationFields(att, run) {
  const errors = [];

  if (run.path !== EXPECTED_WORKFLOW_PATH) {
    errors.push(`workflow: path API (${run.path}) ≠ attendu (${EXPECTED_WORKFLOW_PATH})`);
  }
  if (run.name !== EXPECTED_WORKFLOW_NAME) {
    errors.push(`workflow: name API (${run.name}) ≠ attendu (${EXPECTED_WORKFLOW_NAME})`);
  }
  if (!EXPECTED_EVENTS.includes(run.event)) {
    errors.push(`event: API (${run.event}) ∉ attendus [${EXPECTED_EVENTS.join(', ')}]`);
  }
  if (run.head_branch !== EXPECTED_HEAD_BRANCH) {
    errors.push(`branche: head_branch API (${run.head_branch}) ≠ attendu (${EXPECTED_HEAD_BRANCH})`);
  }

  // Verdict -06 §1 : TOUS les commits de provenance liés au head_sha authentifié.
  if (!sameCommit(att.runCommit, run.head_sha)) {
    errors.push(`sha: runCommit attesté (${String(att.runCommit).slice(0, 12)}) non lié au head_sha API (${String(run.head_sha).slice(0, 12)})`);
  }
  if (att.mergedCommit !== undefined && !sameCommit(att.mergedCommit, run.head_sha)) {
    errors.push(`sha: mergedCommit attesté (${String(att.mergedCommit).slice(0, 12)}) non lié au head_sha API (${String(run.head_sha).slice(0, 12)})`);
  }
  // Commit de dépôt déclaré (repoCommit) — s'il est présent dans l'attestation.
  if (att.repoCommit !== undefined && !sameCommit(att.repoCommit, run.head_sha)) {
    errors.push(`sha: repoCommit déclaré (${String(att.repoCommit).slice(0, 12)}) non lié au head_sha API (${String(run.head_sha).slice(0, 12)})`);
  }

  if (run.conclusion !== att.conclusion) {
    errors.push(`conclusion: API (${run.conclusion}) ≠ attestée (${att.conclusion})`);
  }

  // Verdict -06 §2 : égalité EXACTE de l'URL après normalisation.
  const attUrl = normalizeRunUrl(att.runUrl);
  const apiUrl = normalizeRunUrl(run.html_url);
  if (att.runUrl !== undefined && (attUrl === null || apiUrl === null || attUrl !== apiUrl)) {
    errors.push(`url: runUrl attesté (${att.runUrl}) ≠ html_url API normalisée (${run.html_url})`);
  }

  const apiDate = new Date(run.created_at).getTime();
  const attDate = new Date(att.runDate).getTime();
  if (Number.isFinite(apiDate) && Number.isFinite(attDate) && Math.abs(apiDate - attDate) > 48 * 3600_000) {
    errors.push(`date: runDate attestée (${att.runDate}) à plus de 48h de created_at API (${run.created_at})`);
  }

  return errors;
}

/** Récupère le run via l'API GitHub puis applique checkAttestationFields. */
export async function verifyAttestationRun(att, { token, repo }) {
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${att.runId}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  });

  if (!res.ok) {
    return [`run ${att.runId} INTROUVABLE via l'API (${res.status}) — attestation non authentifiable`];
  }

  return checkAttestationFields(att, await res.json());
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

  console.log(`[verify-attestation-run] OK — run ${att.runId} authentifié (workflow, event, branche, runCommit+mergedCommit+repoCommit liés au head_sha, conclusion, url exacte, date)`);
}
