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
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative } from 'node:path';
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
];

/** Services a surface may legitimately reference (orphan check, cond. 3). */
const KNOWN_SERVICE_IDS = ['web', 'api', 'worker', 'runtime', 'admin'];

/*
 * Évaluation v5 (2026-07-17): la CI compare l'ensemble EXACT des P0 attendus à
 * l'ensemble présent dans P0_REGISTRY — l'absence d'un ID bloque. Les 15 P0 du
 * dernier audit externe (Audit_complet_PLAN_PARITE_REPLIT_v3_2026) + les 4 P0
 * de l'audit v4.
 */
export const EXPECTED_P0_IDS = [
  'P0-V4-1', 'P0-V4-2', 'P0-V4-3', 'P0-V4-4',
  'P0-V3-01', 'P0-V3-02', 'P0-V3-03', 'P0-V3-04', 'P0-V3-05',
  'P0-V3-06', 'P0-V3-07', 'P0-V3-08', 'P0-V3-09', 'P0-V3-10',
  'P0-V3-11', 'P0-V3-12', 'P0-V3-13', 'P0-V3-14', 'P0-V3-15',
];

/** Contract files whose presence defines the architectureContracted level. */
const CONTRACT_FILES = [
  'DOMAIN_MODEL.md',
  'AUTH_ACCESS_CONTRACT.md',
  'GALLERY_COMMUNITY_CONTRACT.md',
  'RELEASE_PUBLISH_CONTRACT.md',
  'PROJECT_FACTORY_CONTRACT.md',
  'IAM_POLICY_BASELINE.md',
  'EDGE_CONTRACT.md',
  'WORKSPACE_STORAGE_CONTRACT.md',
  'CHECKPOINT_CONTRACT.md',
  'IMPORT_REMIX_CONTRACT.md',
  'AGENT_TOOL_BROKER_CONTRACT.md',
  'DATABASE_CONTRACT.md',
  'APP_STORAGE_CONTRACT.md',
  'EVIDENCE_ARTIFACT_CONTRACT.md',
  'REGRESSION_RUN_CONTRACT.md',
  'BILLING_LEDGER_CONTRACT.md',
  'RUNTIME_NIX_CONTRACT.md',
  'OPERATIONS_DR.md',
  'SECURITY_PRIVACY_COMPLIANCE.md',
];

/*
 * Gates bêta (évaluation v5 §6, décisions D1–D6): tant que ces UNKNOWNs
 * existent dans UNKNOWN_REGISTRY, betaReady est faux. Un contrat n'est pas une
 * capacité — ces IDs tracent précisément les capacités manquantes.
 */
const BETA_GATE_UNKNOWN_IDS = [
  'UNK-GIT-RECONCILE-DONE',
  'UNK-ROLLBACK-FLAG-APPLIED',
  'UNK-NIX-MULTIZONE-IMPL',
  'UNK-AR-LIVE-PROMOTION',
  'UNK-CLOUDTENANT-IMPL',
  'UNK-BILLING-MINIMAL-IMPL',
];

/** Mapping sourceType → classe de SLA de triage (OBSERVATION_REGISTRY.triageSla). */
const TRIAGE_SLA_CLASS = {
  security: 'security',
  'trust-safety': 'trust-safety',
  legal: 'legal',
  changelog: 'product',
  'product-route': 'product',
  blog: 'product',
  status: 'product',
  pricing: 'product',
  docs: 'docs',
};

/** Business days (Mon–Fri) between two dates, exclusive of the start day. */
function businessDaysBetween(fromMs, toMs) {
  let days = 0;
  const d = new Date(fromMs);

  while (d.getTime() < toMs) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();

    if (dow !== 0 && dow !== 6) {
      days += 1;
    }
  }

  return days;
}

/**
 * Deterministic sha256 over an evidence path (file or directory): hash of every
 * file's relative path + content, sorted. "Preuves avec artefacts présents ET
 * hashes" — a proof whose evidence changes silently changes the status file.
 */
function hashEvidencePath(repoRoot, relPath) {
  const abs = join(repoRoot, relPath);

  if (!existsSync(abs)) {
    return { fileCount: 0, sha256: null };
  }

  const files = [];

  (function walk(p) {
    const st = statSync(p);

    if (st.isDirectory()) {
      for (const name of readdirSync(p).sort()) {
        walk(join(p, name));
      }
    } else if (st.isFile()) {
      files.push(p);
    }
  })(abs);

  files.sort();
  const h = createHash('sha256');

  for (const f of files) {
    h.update(relative(repoRoot, f));
    h.update('\0');
    h.update(readFileSync(f));
    h.update('\0');
  }

  return { fileCount: files.length, sha256: files.length > 0 ? h.digest('hex') : null };
}

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

export function computeApprovalStatus(now = '2026-07-17T12:00:00Z') {
  const p0 = yaml('P0_REGISTRY.yaml');
  const decisions = yaml('DECISION_REGISTRY.yaml');
  const unknowns = yaml('UNKNOWN_REGISTRY.yaml');
  const baseline = yaml('PUBLIC_BASELINE_REPLIT_2026.yaml');
  const surfaces = yaml('SURFACE_REGISTRY.yaml');
  const e2e = yaml('E2E_PROOFS.yaml');
  const observations = yaml('OBSERVATION_REGISTRY.yaml');

  const nowMs = Date.parse(now);

  /*
   * P0 rollup: a P0 is only CLOSED with commit+reviewer+proof; PROVEN has
   * evidence but no human reviewer yet; OPEN otherwise. Le statut DÉCLARÉ est
   * un PLANCHER: un P0 déclaré OPEN reste OPEN même s'il porte des preuves
   * partielles — la preuve d'une partie n'est pas la preuve du tout.
   */
  const p0Rollup = (p0.p0s ?? []).map((item) => {
    const hasProof = Boolean(item.commit && item.proof && item.evidenceId);
    const reviewed = Boolean(item.reviewer && item.reviewer !== 'UNKNOWN');

    let derived = 'OPEN';

    if (item.status !== 'OPEN' && item.status !== 'BLOCKED') {
      if (hasProof && reviewed) {
        derived = 'CLOSED';
      } else if (hasProof) {
        derived = 'PROVEN';
      }
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
      ...openP0.map((p) => `${p.p0Id} is OPEN`),
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

  /*
   * Preuves: artefacts PRÉSENTS et HASHÉS (évaluation v5). Un evidenceId qui
   * pointe un chemin absent OU un dossier vide est un orphelin.
   */
  const evidence = [];

  for (const proof of e2e.proofs ?? []) {
    if (proof.status !== 'PROVEN' || !proof.evidenceId) {
      continue;
    }

    const { fileCount, sha256 } = hashEvidencePath(repoRoot, proof.evidenceId);

    if (fileCount === 0) {
      orphans.push(`${proof.proofId} → evidenceId path missing or empty on disk (${proof.evidenceId})`);
    } else {
      evidence.push({ proofId: proof.proofId, evidenceId: proof.evidenceId, fileCount, evidenceSha256: sha256 });
    }
  }

  const cond3 = {
    id: 3,
    description: 'no orphan claimId / surfaceId / serviceId / evidenceId reference',
    passed: orphans.length === 0,
    reasons: orphans,
  };

  /*
   * (4) The end-to-end vertical is green (each stage has a PROVEN proof).
   * Une preuve API n'est PAS une preuve UI: le client de la preuve
   * (fixtures.client) est exposé par étage, et les étages sans preuve UI sont
   * listés dans uiGaps — jamais confondus avec un étage prouvé à l'écran.
   */
  const verticalStages = APPROVAL_VERTICAL.map((stage) => {
    const proofs = (e2e.proofs ?? []).filter(
      (p) => isProven(p) && (p.vertical === stage || (Array.isArray(p.vertical) && p.vertical.includes(stage))),
    );
    const clients = [...new Set(proofs.map((p) => String(p.fixtures?.client ?? 'UNKNOWN')))];
    const uiProven = clients.some((c) => c.startsWith('web'));

    return { stage, green: proofs.length > 0, proofIds: proofs.map((p) => p.proofId), clients, uiProven };
  });

  const uiGaps = verticalStages.filter((v) => v.green && !v.uiProven).map((v) => v.stage);

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

  const conditions = [cond1, cond2, cond3, cond4, cond5, cond6];

  /* ===== Niveaux nommés (évaluation v5 — remplace le booléen approvalReady,
     qui était un faux positif de couverture) ===== */

  // Complétude du registre P0: l'ensemble EXACT des IDs attendus doit être présent.
  const presentP0Ids = new Set((p0.p0s ?? []).map((i) => i.p0Id));
  const missingP0Ids = EXPECTED_P0_IDS.filter((id) => !presentP0Ids.has(id));

  // targetDate: UNKNOWN interdit (P0 / UNKNOWN / DECISION), sauf ACCEPTED_RISK justifié.
  const forbiddenTargetDates = [];

  for (const [label, entries, idKey] of [
    ['P0_REGISTRY', p0.p0s ?? [], 'p0Id'],
    ['UNKNOWN_REGISTRY', unknowns.unknowns ?? [], 'unknownId'],
    ['DECISION_REGISTRY', decisions.decisions ?? [], 'decisionId'],
  ]) {
    for (const entry of entries) {
      const acceptedRisk =
        entry.state === 'ACCEPTED_RISK' && entry.owner && entry.expiration && entry.reviewCondition;

      if ((entry.targetDate === 'UNKNOWN' || entry.targetDate === undefined) && !acceptedRisk) {
        forbiddenTargetDates.push(`${label}: ${entry[idKey]} has targetDate UNKNOWN/absent without ACCEPTED_RISK`);
      }
    }
  }

  // Triage: aucun événement critique PENDING au-delà de son SLA (jours ouvrés).
  const triageSla = observations.triageSla ?? {};
  const triageBreaches = (observations.observations ?? [])
    .filter((o) => o.triageState === 'PENDING')
    .filter((o) => {
      const slaDays = triageSla[TRIAGE_SLA_CLASS[o.sourceType] ?? 'product'];
      const detected = Date.parse(o.detectionDate);

      return (
        Number.isFinite(detected) && typeof slaDays === 'number' && businessDaysBetween(detected, nowMs) > slaDays
      );
    })
    .map((o) => `${o.observationId} PENDING past its triage SLA`);

  const pendingClaims = (baseline.claims ?? []).filter((c) => c.triageState === 'PENDING').map((c) => c.claimId);

  const planPath = join(parityRoot, 'PLAN_PARITE_REPLIT.md');
  const planText = existsSync(planPath) ? readFileSync(planPath, 'utf8') : '';
  const planOk = /schemaVersion:\s*\d+/.test(planText) && /measuredRepoCommit:\s*[0-9a-f]{7,40}/.test(planText);

  const gateUnknownsPresent = BETA_GATE_UNKNOWN_IDS.filter((id) =>
    (unknowns.unknowns ?? []).some((u) => u.unknownId === id),
  );

  const openDecisions = (decisions.decisions ?? []).filter((d) => d.status === 'OPEN').map((d) => d.decisionId);
  const notClosedP0 = p0Rollup.filter((x) => x.derived !== 'CLOSED').map((x) => x.p0Id);
  const missingContracts = CONTRACT_FILES.filter((f) => !existsSync(join(parityRoot, f)));
  const surfacesNotDone = surfaceRollup.filter((s) => !s.done).map((s) => s.surfaceId);

  const lvlDocument = {
    name: 'documentReady',
    passed: cond2.passed && planOk,
    reasons: [...cond2.reasons, ...(planOk ? [] : ['PLAN_PARITE_REPLIT.md missing or lacks schemaVersion/measuredRepoCommit'])],
  };
  const lvlRegistry = {
    name: 'registryComplete',
    passed:
      missingP0Ids.length === 0 && forbiddenTargetDates.length === 0 && cond3.passed && triageBreaches.length === 0,
    reasons: [
      ...missingP0Ids.map((id) => `expected P0 missing from P0_REGISTRY: ${id}`),
      ...forbiddenTargetDates,
      ...cond3.reasons,
      ...triageBreaches,
    ],
  };
  const lvlContracts = {
    name: 'architectureContracted',
    passed: missingContracts.length === 0,
    reasons: missingContracts.map((f) => `contract file missing: ${f}`),
  };
  const lvlImplementation = {
    name: 'implementationReady',
    passed: cond1.passed,
    reasons: cond1.reasons,
  };
  const lvlVertical = {
    name: 'verticalReady',
    passed: cond4.passed,
    reasons: cond4.reasons,
  };
  const lvlBeta = {
    name: 'betaReady',
    passed:
      lvlRegistry.passed && lvlVertical.passed && cond5.passed && cond6.passed && gateUnknownsPresent.length === 0,
    reasons: [
      ...(lvlRegistry.passed ? [] : ['registryComplete not passed']),
      ...(lvlVertical.passed ? [] : ['verticalReady not passed']),
      ...cond5.reasons,
      ...cond6.reasons,
      ...gateUnknownsPresent.map((id) => `beta gate capability still unknown: ${id}`),
    ],
  };
  const lvlPublic = {
    name: 'publicLaunchReady',
    passed: lvlBeta.passed && notClosedP0.length === 0 && openDecisions.length === 0 && pendingClaims.length === 0,
    reasons: [
      ...(lvlBeta.passed ? [] : ['betaReady not passed']),
      ...notClosedP0.map((id) => `${id} not CLOSED (needs a real reviewer)`),
      ...openDecisions.map((id) => `decision ${id} still OPEN`),
      ...pendingClaims.map((id) => `claim ${id} triage PENDING`),
    ],
  };
  const lvlParity = {
    name: 'parityBaselineReady',
    passed: surfacesNotDone.length === 0 && cond5.passed && pendingClaims.length === 0 && triageBreaches.length === 0,
    reasons: [
      ...surfacesNotDone.map((id) => `surface ${id} not done`),
      ...cond5.reasons,
      ...pendingClaims.map((id) => `claim ${id} triage PENDING`),
      ...triageBreaches,
    ],
  };

  const levels = [lvlDocument, lvlRegistry, lvlContracts, lvlImplementation, lvlVertical, lvlBeta, lvlPublic, lvlParity];

  // Le niveau approuvé = le plus haut niveau CONTIGU atteint (échelle stricte).
  let approvedLevel = null;

  for (const level of levels) {
    if (!level.passed) {
      break;
    }

    approvedLevel = level.name;
  }

  const blocking = levels
    .filter((l) => !l.passed)
    .map((l) => `level ${l.name} FAILED: ${l.reasons.join('; ')}`);

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
    generatedFrom: [...REQUIRED_REGISTRIES, 'PLAN_PARITE_REPLIT.md'],
    note: 'COMPUTED by scripts/parity/generate-approval-status.mjs — never edit by hand. The validator fails the build on drift.',
    algorithm:
      'NAMED LEVELS (évaluation v5, 2026-07-17): no global approvalReady boolean — APPROVED is only admissible with the exact level named. approved.level = highest CONTIGUOUS passed level in levels[]. The 6 audit-v4 conditions remain as sub-signals.',
    levels,
    approved: { level: approvedLevel },
    blocking,
    conditions,
    counts,
    p0: p0Rollup,
    surfaces: surfaceRollup,
    evidence,
    uiGaps,
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
