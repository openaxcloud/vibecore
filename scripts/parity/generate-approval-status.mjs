#!/usr/bin/env node
/**
 * Generate docs/parity/APPROVAL_STATUS.json — the SINGLE source of approval
 * truth, COMPUTED from the registries, never hand-written (audit v4).
 *
 * A status a human or agent types is contestable. A status derived by this
 * deterministic function from P0_REGISTRY / DECISION_REGISTRY / UNKNOWN_REGISTRY
 * / PUBLIC_BASELINE / SURFACE_REGISTRY / E2E_PROOFS is not: re-run it and you get
 * the same bytes. The validator re-runs it and FAILS the build if the committed
 * file drifts from the computed one — so the status can never be edited by hand.
 *
 * Usage:
 *   node scripts/parity/generate-approval-status.mjs           # write the file
 *   node scripts/parity/generate-approval-status.mjs --check   # exit 1 if stale
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function yaml(name) {
  return YAML.parse(readFileSync(join(parityRoot, name), 'utf8'));
}

/** Freshness SLA for a public source (days since lastVerified). */
const SOURCE_FRESHNESS_SLA_DAYS = 30;

export function computeApprovalStatus(now = '2026-07-16T00:00:00Z') {
  const p0 = yaml('P0_REGISTRY.yaml');
  const decisions = yaml('DECISION_REGISTRY.yaml');
  const unknowns = yaml('UNKNOWN_REGISTRY.yaml');
  const baseline = yaml('PUBLIC_BASELINE_REPLIT_2026.yaml');
  const surfaces = yaml('SURFACE_REGISTRY.yaml');
  const e2e = yaml('E2E_PROOFS.yaml');

  const nowMs = Date.parse(now);

  // P0 rollup: a P0 is only CLOSED with commit+reviewer+proof; PROVEN has
  // evidence but no human reviewer yet; OPEN otherwise.
  const p0Rollup = (p0.p0s ?? []).map((item) => {
    const hasProof = Boolean(item.commit && item.proof && item.evidenceId);
    const reviewed = Boolean(item.reviewer && item.reviewer !== 'UNKNOWN');
    let derived = 'OPEN';
    if (hasProof && reviewed) {
      derived = 'CLOSED';
    } else if (hasProof) {
      derived = 'PROVEN';
    }
    return { p0Id: item.p0Id, priority: item.priority, declared: item.status, derived, hasProof, reviewed };
  });

  // Source freshness against the SLA.
  const staleSources = (baseline.claims ?? [])
    .map((c) => ({ claimId: c.claimId, lastVerified: c.lastVerified }))
    .filter((c) => {
      const t = Date.parse(c.lastVerified);
      return Number.isFinite(t) && (nowMs - t) / 86_400_000 > SOURCE_FRESHNESS_SLA_DAYS;
    })
    .map((c) => c.claimId);

  // Surfaces: a surface referencing e2e proofs is DONE only if each referenced
  // proof is PROVEN and has an evidenceId.
  const proofById = new Map((e2e.proofs ?? []).map((p) => [p.proofId, p]));
  const surfaceRollup = (surfaces.surfaces ?? []).map((s) => {
    const refs = s.e2eProofIds ?? [];
    const proven = refs.filter((id) => proofById.get(id)?.status === 'PROVEN' && proofById.get(id)?.evidenceId);
    return { surfaceId: s.surfaceId, proofsReferenced: refs.length, proofsProven: proven.length, done: refs.length > 0 && proven.length === refs.length };
  });

  const counts = {
    p0: {
      total: p0Rollup.length,
      closed: p0Rollup.filter((p) => p.derived === 'CLOSED').length,
      proven: p0Rollup.filter((p) => p.derived === 'PROVEN').length,
      open: p0Rollup.filter((p) => p.derived === 'OPEN').length,
    },
    decisions: {
      total: (decisions.decisions ?? []).length,
      open: (decisions.decisions ?? []).filter((d) => d.status === 'OPEN').length,
    },
    unknowns: { total: (unknowns.unknowns ?? []).length },
    claims: { total: (baseline.claims ?? []).length, stale: staleSources.length },
    surfaces: { total: surfaceRollup.length, done: surfaceRollup.filter((s) => s.done).length },
    e2e: { total: (e2e.proofs ?? []).length, proven: (e2e.proofs ?? []).filter((p) => p.status === 'PROVEN').length },
  };

  const blocking = [];
  if (counts.p0.open > 0) {
    blocking.push(`${counts.p0.open} P0 still OPEN`);
  }
  if (staleSources.length > 0) {
    blocking.push(`${staleSources.length} source(s) past the ${SOURCE_FRESHNESS_SLA_DAYS}-day freshness SLA: ${staleSources.join(', ')}`);
  }

  return {
    schemaVersion: 1,
    generatedFrom: [
      'P0_REGISTRY.yaml',
      'DECISION_REGISTRY.yaml',
      'UNKNOWN_REGISTRY.yaml',
      'PUBLIC_BASELINE_REPLIT_2026.yaml',
      'SURFACE_REGISTRY.yaml',
      'E2E_PROOFS.yaml',
    ],
    note: 'COMPUTED by scripts/parity/generate-approval-status.mjs — never edit by hand. The validator fails the build on drift.',
    approvalReady: blocking.length === 0,
    blocking,
    counts,
    p0: p0Rollup,
    surfaces: surfaceRollup,
    staleSources,
  };
}

// Only run the CLI when executed directly — importing this module (e.g. from the
// validator's drift check) must have NO side effect.
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const outPath = join(parityRoot, 'APPROVAL_STATUS.json');
  const computed = JSON.stringify(computeApprovalStatus(), null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
    if (current !== computed) {
      console.error('[approval-status] STALE — APPROVAL_STATUS.json differs from the computed value. Run the generator.');
      process.exit(1);
    }
    console.log('[approval-status] up to date');
  } else {
    writeFileSync(outPath, computed);
    console.log(`[approval-status] wrote ${outPath}`);
  }
}
