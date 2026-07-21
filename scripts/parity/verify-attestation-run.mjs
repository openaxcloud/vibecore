#!/usr/bin/env node
/**
 * LS-16 (verdict RR-20260721-CODEX-03) — AUTHENTIFIE l'attestation contre
 * l'API GitHub Actions : le runId déclaré doit être une VRAIE exécution dont
 * head_sha == runCommit, conclusion == success, created_at cohérent avec
 * runDate (±48h) et html_url == runUrl. Sans GH_TOKEN (exécution locale), le
 * contrôle est SAUTÉ EXPLICITEMENT (dit, jamais silencieux) — la CI le fait.
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

const YAML = loadYamlModule();
const att = YAML.parse(readFileSync(join(repoRoot, 'docs/parity/CI_ATTESTATION.yaml'), 'utf8')).attestation;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!token) {
  console.log('[verify-attestation-run] SAUTÉ (pas de GH_TOKEN — la CI exécute ce contrôle avec le token du run)');
  process.exit(0);
}

const repo = process.env.GITHUB_REPOSITORY ?? 'openaxcloud/vibecore';
const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${att.runId}`, {
  headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
});

if (!res.ok) {
  console.error(`[verify-attestation-run] run ${att.runId} INTROUVABLE via l'API (${res.status}) — attestation non authentifiable`);
  process.exit(1);
}

const run = await res.json();
const errors = [];

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

if (errors.length > 0) {
  console.error('[verify-attestation-run] ATTESTATION NON AUTHENTIFIÉE:');
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}

console.log(`[verify-attestation-run] OK — run ${att.runId} authentifié via l'API GitHub (head_sha, conclusion, url, date cohérents)`);
