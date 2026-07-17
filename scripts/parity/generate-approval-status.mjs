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

/**
 * The end-to-end vertical that MUST be green for approval (audit v4 H, cond. 4):
 * créer → modifier → exécuter → preview → publier → observer → rollback. Each
 * stage is green only if at least one PROVEN e2e proof (with evidence) is tagged
 * for it via `vertical: <stage>` in E2E_PROOFS.yaml.
 */
const APPROVAL_VERTICAL = ['create', 'modify', 'execute', 'preview', 'publish', 'observe', 'rollback'];

/** Registries that must exist and carry a schemaVersion (audit v4 H, cond. 2). */
const REQUIRED_REGISTRIES = [
  'P0_REGISTRY.yaml',
  'DECISION_REGISTRY.yaml',
  'UNKNOWN_REGISTRY.yaml',
  'PUBLIC_BASELINE_REPLIT_2026.yaml',
  'SURFACE_REGISTRY.yaml',
  'E2E_PROOFS.yaml',
  'OBSERVATION_REGISTRY.yaml',
  'SOURCE_REGISTRY.yaml',
  'P0_EXPECTED.yaml',
];

/** Services a surface may legitimately reference (orphan check, cond. 3). */
const KNOWN_SERVICE_IDS = ['web', 'api', 'worker', 'runtime', 'admin'];

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

/**
 * Triage SLA: a critical collected event (a baseline claim or observation) may
 * not sit `PENDING`/untriaged longer than this. The 2026-07-10 changelog cannot
 * coexist with a green registry status.
 */
const TRIAGE_SLA_DAYS = 5;

/** UNKNOWN whose resolution is a hard registry-conformance gate. */
const COLLECTOR_CI_UNKNOWN_ID = 'UNK-COLLECTOR-CI-RENDER';

export function computeApprovalStatus(now = '2026-07-16T00:00:00Z') {
  const p0 = yaml('P0_REGISTRY.yaml');
  const decisions = yaml('DECISION_REGISTRY.yaml');
  const unknowns = yaml('UNKNOWN_REGISTRY.yaml');
  const baseline = yaml('PUBLIC_BASELINE_REPLIT_2026.yaml');
  const surfaces = yaml('SURFACE_REGISTRY.yaml');
  const e2e = yaml('E2E_PROOFS.yaml');

  const observations = existsSync(join(parityRoot, 'OBSERVATION_REGISTRY.yaml'))
    ? yaml('OBSERVATION_REGISTRY.yaml')
    : { observations: [] };
  const p0Expected = existsSync(join(parityRoot, 'P0_EXPECTED.yaml'))
    ? yaml('P0_EXPECTED.yaml')
    : { expectedCount: 0, knownExpectedIds: [] };

  const nowMs = Date.parse(now);

  /*
   * P0 rollup: a P0 is only CLOSED with commit+reviewer+proof; PROVEN has
   * evidence but no human reviewer yet; OPEN otherwise.
   */
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

  const proofById = new Map((e2e.proofs ?? []).map((p) => [p.proofId, p]));
  const isProven = (proof) => proof?.status === 'PROVEN' && proof?.evidenceId;

  // Source freshness against the SLA.
  const staleSources = (baseline.claims ?? [])
    .map((c) => ({ claimId: c.claimId, lastVerified: c.lastVerified }))
    .filter((c) => {
      const t = Date.parse(c.lastVerified);
      return Number.isFinite(t) && (nowMs - t) / 86_400_000 > SOURCE_FRESHNESS_SLA_DAYS;
    })
    .map((c) => c.claimId);

  /*
   * Surfaces: a surface referencing e2e proofs is DONE only if each referenced
   * proof is PROVEN and has an evidenceId.
   */
  const surfaceRollup = (surfaces.surfaces ?? []).map((s) => {
    const refs = s.e2eProofIds ?? [];
    const proven = refs.filter((id) => isProven(proofById.get(id)));

    return {
      surfaceId: s.surfaceId,
      proofsReferenced: refs.length,
      proofsProven: proven.length,
      done: refs.length > 0 && proven.length === refs.length,
    };
  });

  /* ===== The exact 6-condition approval algorithm (audit v4 H) ===== */

  // (1) No P0 OPEN or BLOCKED.
  const openP0 = p0Rollup.filter((p) => p.derived === 'OPEN');
  const blockedP0 = (p0.p0s ?? []).filter((p) => p.status === 'BLOCKED').map((p) => p.p0Id);

  const cond1 = {
    id: 1,
    description: 'no P0 OPEN or BLOCKED',
    passed: openP0.length === 0 && blockedP0.length === 0,
    reasons: [
      ...openP0.map((p) => `${p.p0Id} is OPEN (no reviewer yet)`),
      ...blockedP0.map((id) => `${id} is BLOCKED`),
    ],
  };

  // (2) Every required registry exists and carries a schemaVersion.
  const missingFiles = [];
  const noSchemaVersion = [];

  for (const name of REQUIRED_REGISTRIES) {
    const path = join(parityRoot, name);

    if (!existsSync(path)) {
      missingFiles.push(name);
      continue;
    }

    try {
      const doc = YAML.parse(readFileSync(path, 'utf8'));

      if (doc?.schemaVersion === undefined) {
        noSchemaVersion.push(name);
      }
    } catch (error) {
      noSchemaVersion.push(`${name} (parse error: ${error.message})`);
    }
  }

  const cond2 = {
    id: 2,
    description: 'all required registries exist and validate schemaVersion',
    passed: missingFiles.length === 0 && noSchemaVersion.length === 0,
    reasons: [
      ...missingFiles.map((f) => `missing file: ${f}`),
      ...noSchemaVersion.map((f) => `no schemaVersion: ${f}`),
    ],
  };

  /*
   * (3) No orphan reference: e2eProofId → E2E_PROOFS; PROVEN proof evidenceId →
   *     on disk; surface serviceId → known services.
   */
  const orphans = [];

  for (const s of surfaces.surfaces ?? []) {
    for (const id of s.e2eProofIds ?? []) {
      if (!proofById.has(id)) {
        orphans.push(`${s.surfaceId} → unknown e2eProofId ${id}`);
      }
    }

    for (const svc of s.serviceIds ?? []) {
      if (!KNOWN_SERVICE_IDS.includes(svc)) {
        orphans.push(`${s.surfaceId} → unknown serviceId ${svc}`);
      }
    }
  }

  for (const proof of e2e.proofs ?? []) {
    if (proof.status === 'PROVEN' && proof.evidenceId && !existsSync(join(repoRoot, proof.evidenceId))) {
      orphans.push(`${proof.proofId} → evidenceId path missing on disk (${proof.evidenceId})`);
    }
  }

  const cond3 = {
    id: 3,
    description: 'no orphan claimId / surfaceId / serviceId / evidenceId reference',
    passed: orphans.length === 0,
    reasons: orphans,
  };

  // (4) The end-to-end vertical is green (each stage has a PROVEN proof).
  const verticalStages = APPROVAL_VERTICAL.map((stage) => {
    const proofs = (e2e.proofs ?? []).filter(
      (p) => isProven(p) && (p.vertical === stage || (Array.isArray(p.vertical) && p.vertical.includes(stage))),
    );
    return { stage, green: proofs.length > 0, proofIds: proofs.map((p) => p.proofId) };
  });

  const missingStages = verticalStages.filter((v) => !v.green).map((v) => v.stage);

  const cond4 = {
    id: 4,
    description: 'vertical créer→modifier→exécuter→preview→publier→observer→rollback is green',
    passed: missingStages.length === 0,
    reasons: missingStages.map((s) => `stage "${s}" has no PROVEN e2e proof (tag a proof with vertical: ${s})`),
    stages: verticalStages,
  };

  // (5) Critical sources within the freshness SLA.
  const cond5 = {
    id: 5,
    description: `critical sources within the ${SOURCE_FRESHNESS_SLA_DAYS}-day freshness SLA`,
    passed: staleSources.length === 0,
    reasons: staleSources.map((c) => `${c} past the ${SOURCE_FRESHNESS_SLA_DAYS}-day SLA`),
  };

  // (6) No expired decision; no P0-linked unknown without owner + concrete targetDate.
  const expiredDecisions = (decisions.decisions ?? [])
    .filter((d) => {
      const t = Date.parse(d.expiration ?? '');
      return Number.isFinite(t) && t < nowMs && d.status === 'OPEN';
    })
    .map((d) => d.decisionId);

  const p0Unknowns = (unknowns.unknowns ?? []).filter((u) => u.p0Id || u.blocksP0);

  const p0UnknownGaps = p0Unknowns
    .filter((u) => !u.owner || u.owner === 'UNKNOWN' || !u.targetDate || u.targetDate === 'UNKNOWN')
    .map((u) => `${u.unknownId} (P0-linked) lacks owner or targetDate`);
  const cond6 = {
    id: 6,
    description: 'no expired decision; no P0-linked unknown without owner + targetDate',
    passed: expiredDecisions.length === 0 && p0UnknownGaps.length === 0,
    reasons: [...expiredDecisions.map((d) => `decision ${d} is OPEN past its expiration`), ...p0UnknownGaps],
  };

  /* ===== NEW registry-conformance gates (hardening, 2026-07-17) ===== */

  /*
   * (7) The P0_REGISTRY must contain the EXACT expected set of P0 IDs (the 15
   *     from the external audit). A missing id — or a count mismatch — blocks.
   */
  const registeredP0Ids = new Set((p0.p0s ?? []).map((p) => p.p0Id));
  const missingExpectedP0 = (p0Expected.knownExpectedIds ?? []).filter((id) => !registeredP0Ids.has(id));
  const p0CountOk = registeredP0Ids.size === (p0Expected.expectedCount ?? -1);

  const cond7 = {
    id: 7,
    description: `P0_REGISTRY covers the exact expected set (${p0Expected.expectedCount} P0)`,
    passed: missingExpectedP0.length === 0 && p0CountOk,
    reasons: [
      ...missingExpectedP0.map((id) => `expected P0 ${id} missing from P0_REGISTRY`),
      ...(p0CountOk
        ? []
        : [
            `P0 count ${registeredP0Ids.size} ≠ expected ${p0Expected.expectedCount} (${(p0Expected.expectedCount ?? 0) - registeredP0Ids.size} not yet enumerated)`,
          ]),
    ],
  };

  /*
   * (8) No `targetDate: UNKNOWN` (or missing) on any P0 or UNKNOWN entry — an
   *     open item without a real ISO date is not a plan.
   */
  const isBadDate = (d) => !d || d === 'UNKNOWN' || Number.isNaN(Date.parse(d));

  const p0BadDates = (p0.p0s ?? [])
    .filter((p) => isBadDate(p.targetDate))
    .map((p) => `${p.p0Id}: targetDate=${p.targetDate ?? 'missing'}`);
  const unkBadDates = (unknowns.unknowns ?? [])
    .filter((u) => isBadDate(u.targetDate))
    .map((u) => `${u.unknownId}: targetDate=${u.targetDate ?? 'missing'}`);

  const cond8 = {
    id: 8,
    description: 'no targetDate: UNKNOWN/missing on any P0 or UNKNOWN entry (ISO date required)',
    passed: p0BadDates.length === 0 && unkBadDates.length === 0,
    reasons: [...p0BadDates, ...unkBadDates],
  };

  /*
   * (9) Triage SLA: no critical collected event stays PENDING beyond the SLA.
   *     Scans baseline claims + observations carrying a triageState.
   */
  const triageOverdue = [];

  const triageAge = (evt) => {
    const t = Date.parse(evt.firstSeen ?? evt.eventDate ?? evt.observedAt ?? '');
    return Number.isFinite(t) ? (nowMs - t) / 86_400_000 : Infinity;
  };

  for (const c of baseline.claims ?? []) {
    if (c.triageState && c.triageState !== 'DONE' && c.triageState !== 'TRIAGED' && triageAge(c) > TRIAGE_SLA_DAYS) {
      triageOverdue.push(
        `${c.claimId} triageState=${c.triageState} for ${Math.round(triageAge(c))}d (SLA ${TRIAGE_SLA_DAYS}d)`,
      );
    }
  }

  for (const o of observations.observations ?? []) {
    if (o.triageState && o.triageState !== 'DONE' && o.triageState !== 'TRIAGED' && triageAge(o) > TRIAGE_SLA_DAYS) {
      triageOverdue.push(`${o.observationId ?? o.id} triageState=${o.triageState} overdue`);
    }
  }

  const cond9 = {
    id: 9,
    description: `no critical event PENDING beyond the ${TRIAGE_SLA_DAYS}-day triage SLA`,
    passed: triageOverdue.length === 0,
    reasons: triageOverdue,
  };

  // (10) The JS collector must be proven in CI (UNK-COLLECTOR-CI-RENDER resolved).
  const collectorUnknownOpen = (unknowns.unknowns ?? []).some((u) => u.unknownId === COLLECTOR_CI_UNKNOWN_ID);

  const cond10 = {
    id: 10,
    description: `JS collector proven in CI (${COLLECTOR_CI_UNKNOWN_ID} resolved)`,
    passed: !collectorUnknownOpen,
    reasons: collectorUnknownOpen ? [`${COLLECTOR_CI_UNKNOWN_ID} still open in UNKNOWN_REGISTRY`] : [],
  };

  /* ===== 4-stage readiness model (2026-07-17) ===== */
  /*
   * Named precisely: registryConformanceReady is a REGISTRY-HYGIENE gate, NOT a
   * product-approval signal. Stages are cumulative.
   */
  const allP0Closed = p0Rollup.length > 0 && p0Rollup.every((p) => p.derived === 'CLOSED');

  /*
   * Stages 1 and 2 are INDEPENDENT gates (the core product flow can be E2E-green
   * while the registry paperwork is not, and vice-versa). Stages 3 and 4 are
   * HIGHER maturity bars that explicitly REQUIRE the lower stages as conditions.
   */
  const registryConformance = {
    ready: [cond2, cond3, cond6, cond7, cond8, cond9, cond10].every((c) => c.passed),
    conditions: [cond2, cond3, cond6, cond7, cond8, cond9, cond10],
  };
  const coreVertical = {
    ready: [cond1, cond4].every((c) => c.passed),
    conditions: [cond1, cond4],
  };

  const gate = (id, description, passed, reason) => ({ id, description, passed, reasons: passed ? [] : [reason] });

  const publicBetaConds = [
    gate(13, 'registryConformanceReady', registryConformance.ready, 'registry conformance not met'),
    gate(14, 'coreVerticalReady', coreVertical.ready, 'core vertical not green'),
    cond5,
    gate(
      11,
      'all P0 CLOSED (commit+reviewer+proof)',
      allP0Closed,
      'not every P0 is CLOSED (PROVEN without a human reviewer does not count)',
    ),
  ];

  const publicBeta = { ready: publicBetaConds.every((c) => c.passed), conditions: publicBetaConds };

  const noOpenUnknown = (unknowns.unknowns ?? []).length === 0;

  const parityBaselineConds = [
    gate(15, 'publicBetaReady', publicBeta.ready, 'public beta not ready'),
    gate(16, 'no open UNKNOWN remains', noOpenUnknown, `${(unknowns.unknowns ?? []).length} UNKNOWN still open`),
  ];

  const parityBaseline = { ready: parityBaselineConds.every((c) => c.passed), conditions: parityBaselineConds };

  const stages = { registryConformance, coreVertical, publicBeta, parityBaseline };

  const readiness = {
    registryConformanceReady: registryConformance.ready,
    coreVerticalReady: coreVertical.ready,
    publicBetaReady: publicBeta.ready,
    parityBaselineReady: parityBaseline.ready,
  };

  const conditions = [cond1, cond2, cond3, cond4, cond5, cond6, cond7, cond8, cond9, cond10];

  const blocking = conditions
    .filter((c) => !c.passed)
    .map((c) => `condition ${c.id} (${c.description}) FAILED: ${c.reasons.join('; ')}`);

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
    unknowns: { total: (unknowns.unknowns ?? []).length, p0Linked: p0Unknowns.length },
    claims: { total: (baseline.claims ?? []).length, stale: staleSources.length },
    surfaces: { total: surfaceRollup.length, done: surfaceRollup.filter((s) => s.done).length },
    e2e: { total: (e2e.proofs ?? []).length, proven: (e2e.proofs ?? []).filter((p) => p.status === 'PROVEN').length },
  };

  return {
    schemaVersion: 3,
    generatedFrom: [...REQUIRED_REGISTRIES, 'P0_EXPECTED.yaml'],
    note: 'COMPUTED by scripts/parity/generate-approval-status.mjs — never edit by hand. The validator fails the build on drift.',
    algorithm:
      '4-stage cumulative readiness: registryConformance → coreVertical → publicBeta → parityBaseline. registryConformanceReady is a REGISTRY-HYGIENE gate, NOT a product-approval signal.',
    readiness,
    stages,
    blocking,
    conditions,
    counts,
    p0: p0Rollup,
    surfaces: surfaceRollup,
    staleSources,
  };
}

/*
 * Only run the CLI when executed directly — importing this module (e.g. from the
 * validator's drift check) must have NO side effect.
 */
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const outPath = join(parityRoot, 'APPROVAL_STATUS.json');
  const computed = JSON.stringify(computeApprovalStatus(), null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';

    if (current !== computed) {
      console.error(
        '[approval-status] STALE — APPROVAL_STATUS.json differs from the computed value. Run the generator.',
      );
      process.exit(1);
    }

    console.log('[approval-status] up to date');
  } else {
    writeFileSync(outPath, computed);
    console.log(`[approval-status] wrote ${outPath}`);
  }
}
