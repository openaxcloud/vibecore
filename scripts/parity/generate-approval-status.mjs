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
  // Audit de couverture 2026-07-19 — ces registres tracent ce que le plan
  // n'absorbe pas ; leur disparition casse le build (cond. 2).
  'BOLT_DEBT_REGISTRY.yaml',
  'PRODUCTION_READINESS_REGISTRY.yaml',
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
  // Audit de réanalyse (LIVRAISON 2, 2026-07-20) — 16 P0.
  'P0-A2-01', 'P0-A2-02', 'P0-A2-03', 'P0-A2-04', 'P0-A2-05', 'P0-A2-06',
  'P0-A2-07', 'P0-A2-08', 'P0-A2-09', 'P0-A2-10', 'P0-A2-11', 'P0-A2-12',
  'P0-A2-13', 'P0-A2-14', 'P0-A2-15', 'P0-A2-16',
  // Corrections livescan (expert, relayées owner 20/07) — 18 P0-LS.
  'P0-LS-01', 'P0-LS-02', 'P0-LS-03', 'P0-LS-04', 'P0-LS-05', 'P0-LS-06',
  'P0-LS-07', 'P0-LS-08', 'P0-LS-09', 'P0-LS-10', 'P0-LS-11', 'P0-LS-12',
  'P0-LS-13', 'P0-LS-14', 'P0-LS-15', 'P0-LS-16', 'P0-LS-17', 'P0-LS-18',
  // Exigences propriétaire hors-scan (overlay code, scan authentifié).
  'P0-B-01', 'P0-B-02',
];

/*
 * Audit de couverture 2026-07-19 (COVERAGE_GAP_AUDIT_2026-07-17.md) : les IDs
 * qui tracent les ~300 points manquants des anciens plans. MÊME MÉCANISME que
 * les P0 — la CI compare l'ensemble EXACT attendu à l'ensemble présent ; un ID
 * qui disparaît d'un registre casse le build. Retirer un ID de CES listes est
 * un acte de revue explicite, jamais un effet de bord.
 */
export const EXPECTED_P1_IDS = [
  'P1-COV-01', 'P1-COV-02', 'P1-COV-03', 'P1-COV-04',
  'P1-COV-05', 'P1-COV-06', 'P1-COV-07', 'P1-COV-08',

  // Les 18 P1 de l'audit externe v3 (16/07) — enfin individuels (P0-A2-05).
  'P1-V3-01', 'P1-V3-02', 'P1-V3-03', 'P1-V3-04', 'P1-V3-05', 'P1-V3-06',
  'P1-V3-07', 'P1-V3-08', 'P1-V3-09', 'P1-V3-10', 'P1-V3-11', 'P1-V3-12',
  'P1-V3-13', 'P1-V3-14', 'P1-V3-15', 'P1-V3-16', 'P1-V3-17', 'P1-V3-18',
  // Les 14 P1 de l'audit de réanalyse (20/07).
  'P1-A2-01', 'P1-A2-02', 'P1-A2-03', 'P1-A2-04', 'P1-A2-05', 'P1-A2-06',
  'P1-A2-07', 'P1-A2-08', 'P1-A2-09', 'P1-A2-10', 'P1-A2-11', 'P1-A2-12',
  'P1-A2-13', 'P1-A2-14',
];

export const EXPECTED_BOLT_DEBT_IDS = [
  'BD-01', 'BD-02', 'BD-03', 'BD-04', 'BD-05', 'BD-06', 'BD-07',
  'BD-08', 'BD-09', 'BD-10', 'BD-11', 'BD-12', 'BD-13', 'BD-14',
  'BD-15', 'BD-16', 'BD-17', 'BD-18', 'BD-19', 'BD-20', 'BD-21',
  'BD-22', 'BD-23', 'BD-24', 'BD-25', 'BD-26', 'BD-27', 'BD-28', 'BD-29',
];

export const EXPECTED_PROD_READINESS_IDS = [
  'PR-RUN-01',
  'PR-ISO-01', 'PR-ISO-02', 'PR-ISO-03', 'PR-ISO-04',
  'PR-INFRA-01',
  'PR-CFG-01', 'PR-CFG-02', 'PR-CFG-03',
  'PR-STRIPE-01', 'PR-STRIPE-02', 'PR-QUOTA-01',
  'PR-DR-01', 'PR-DR-02', 'PR-DR-03',
  'PR-LOAD-01', 'PR-LOAD-02', 'PR-LOAD-03', 'PR-LOAD-04', 'PR-LOAD-05',
  'PR-SCALE-01',
  'PR-SEC-01', 'PR-SEC-02', 'PR-SEC-03', 'PR-SEC-04', 'PR-SEC-05',
  'PR-OPS-01', 'PR-OPS-02',
  'PR-PROD-01', 'PR-PROD-02', 'PR-PROD-03', 'PR-PROD-04',
  'PR-MOB-01', 'PR-MOB-02', 'PR-MOB-03', 'PR-MOB-04', 'PR-MOB-05',
  'PR-DESK-01',
  'PR-LEGAL-01', 'PR-LEGAL-02',
  'PR-RR7-01',
  'PR-QA-01', 'PR-QA-02',
  'PR-MISC-01', 'PR-MISC-02', 'PR-MISC-03', 'PR-MISC-04', 'PR-MISC-05', 'PR-MISC-06', 'PR-MISC-07',
];

/*
 * Univers des surfaces (P0-A2-02) : l'inventaire IDE antérieur — 159 surfaces
 * P001–P159 + 56 services S01–S56. Ensemble EXACT ; un ID absent casse le
 * build. parityBaselineReady exige EN PLUS que chaque entrée soit ÉVALUÉE
 * (availability ≠ UNKNOWN, justifiée).
 */
// 159 (inventaire IDE). Les deltas du live scan sont des OBSERVATIONS
// (OBS-DELTA-20260720-*) à classifier vers des registres séparés (P0-LS-01),
// PAS des surfaces additionnées.
export const EXPECTED_SURFACE_UNIVERSE_IDS = Array.from({ length: 159 }, (_, i) => `P${String(i + 1).padStart(3, '0')}`);
export const EXPECTED_OBS_DELTA_IDS = Array.from({ length: 15 }, (_, i) => `OBS-DELTA-20260720-${String(i + 1).padStart(2, '0')}`);
/** Registres séparés (P0-LS-01) : présence + schemaVersion exigées. */
export const SEPARATE_REGISTRY_FILES = [
  'ARTIFACT_KIND_REGISTRY.yaml', 'COMPONENT_KIND_REGISTRY.yaml',
  'CREATION_INTENT_REGISTRY.yaml', 'GENERATED_ASSET_KIND_REGISTRY.yaml',
  'CAPABILITY_REGISTRY.yaml', 'DEPLOYMENT_TYPE_REGISTRY.yaml',
  'IMPORT_PROVIDER_REGISTRY.yaml', 'CONNECTOR_REGISTRY.yaml',
  'OFFERING_ENTITLEMENT_REGISTRY.yaml', 'EXTERNAL_ECOSYSTEM_REGISTRY.yaml',
  'SERVICE_REGISTRY.yaml', 'P1_REGISTRY.yaml', 'ROUTE_OBSERVATION_REGISTRY.yaml',
];
export const EXPECTED_SERVICE_UNIVERSE_IDS = Array.from({ length: 56 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`);

/** Niveaux nommés v2 (audit de réanalyse 2026-07-20) — ordre strict de l'échelle. */
export const LEVEL_ORDER = [
  'documentReconciled',
  'sourceBaselineReady',
  'registryUniverseReady',
  'contractsPresent',
  'contractsValidated',
  'implementationReady',
  'verticalBackendReady',
  'verticalUserJourneyReady',
  'betaReady',
  'publicLaunchReady',
  'parityBaselineReady',
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
const { checkPlanCompleteness } = await import('./check-plan-completeness.mjs');

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const parityRoot = join(repoRoot, 'docs', 'parity');

function yaml(name) {
  return YAML.parse(readFileSync(join(parityRoot, name), 'utf8'));
}

/** Freshness SLA for a public source (days since lastVerified). */
const SOURCE_FRESHNESS_SLA_DAYS = 30;

export function computeApprovalStatus(now = '2026-07-20T12:30:00Z') {
  const p0 = yaml('P0_REGISTRY.yaml');
  const decisions = yaml('DECISION_REGISTRY.yaml');
  const unknowns = yaml('UNKNOWN_REGISTRY.yaml');
  const baseline = yaml('PUBLIC_BASELINE_REPLIT_2026.yaml');
  const surfaces = yaml('SURFACE_REGISTRY.yaml');
  const e2e = yaml('E2E_PROOFS.yaml');
  const observations = yaml('OBSERVATION_REGISTRY.yaml');
  const boltDebt = yaml('BOLT_DEBT_REGISTRY.yaml');
  const prodReadiness = yaml('PRODUCTION_READINESS_REGISTRY.yaml');

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

  /*
   * Complétude des registres de couverture (audit 2026-07-19) : même règle —
   * un ID attendu absent casse registryComplete (et le validateur casse le
   * build). Les statuts, eux, restent honnêtes : NON_FAIT tant qu'aucune
   * preuve n'existe.
   */
  const p1reg = yaml('P1_REGISTRY.yaml');
  const presentP1Ids = new Set((p1reg.p1s ?? []).map((i) => i.p1Id));
  const missingP1Ids = EXPECTED_P1_IDS.filter((id) => !presentP1Ids.has(id));
  const presentBoltDebtIds = new Set((boltDebt.items ?? []).map((i) => i.id));
  const missingBoltDebtIds = EXPECTED_BOLT_DEBT_IDS.filter((id) => !presentBoltDebtIds.has(id));
  const presentProdReadinessIds = new Set((prodReadiness.items ?? []).map((i) => i.id));
  const missingProdReadinessIds = EXPECTED_PROD_READINESS_IDS.filter((id) => !presentProdReadinessIds.has(id));

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
  const planOk = /schemaVersion:\s*\d+/.test(planText) && /planVersion:\s*[0-9.\-]+/.test(planText);

  /*
   * unanchoredClaims (P0-A2-15 / P1-A2-06) : toute étiquette de claim citée
   * par le plan ([RPL-xx], [GCP-xx], [NIX-xx]) et ABSENTE du baseline est un
   * claim UNVERIFIED utilisé dans un document normatif. sourceBaselineReady
   * échoue tant qu'il en reste.
   */
  const anchoredClaimIds = new Set((baseline.claims ?? []).map((c) => c.claimId));
  const citedClaimIds = [...new Set([...planText.matchAll(/\[((?:RPL|GCP|NIX)-[0-9A-Za-z…\-]+)\]/g)].map((m) => m[1]))]
    .filter((id) => !id.includes('…'));
  /*
   * Claims hérités utilisés par les contrats/registres (UNK-CLAIMS-ANCHORING):
   * tant qu'ils ne sont pas ancrés URL+snapshot+hash dans le baseline, ils
   * comptent comme UNVERIFIED — même si le plan adopté ne les cite plus entre
   * crochets (le déficit d'ancrage ne disparaît pas avec la reformulation).
   */
  const LEGACY_CLAIM_IDS = [
    'RPL-01', 'RPL-02', 'RPL-03', 'RPL-04', 'RPL-05', 'RPL-06', 'RPL-09',
    'RPL-10', 'RPL-13', 'RPL-14', 'RPL-16', 'GCP-01', 'GCP-02', 'GCP-03',
    'GCP-04', 'GCP-06', 'GCP-07', 'GCP-08', 'GCP-09', 'GCP-10', 'NIX-01',
  ];
  const unanchoredClaims = [...new Set([...citedClaimIds, ...LEGACY_CLAIM_IDS])]
    .filter((id) => !anchoredClaimIds.has(id))
    .sort();

  /* Backlog : source unique = LEGACY_FINDING_REGISTRY (le plan n'affiche qu'un résumé). */
  const backlogCounts = checkPlanCompleteness().counts;
  const workItems = yaml('WORK_ITEM_REGISTRY.yaml');
  const canonicalWorkItemCount = (workItems.workItems ?? []).length;

  /* Univers des surfaces (P0-A2-02) : présence exacte + évaluation. */
  const universe = surfaces.surfaceUniverse ?? [];
  const presentUniverseIds = new Set(universe.map((s) => s.surfaceId));
  const missingUniverseIds = EXPECTED_SURFACE_UNIVERSE_IDS.filter((id) => !presentUniverseIds.has(id));
  const serviceUniverse = yaml('SERVICE_REGISTRY.yaml').serviceUniverse ?? [];
  const presentServiceIds2 = new Set(serviceUniverse.map((s) => s.serviceId));
  const missingServiceUniverseIds = EXPECTED_SERVICE_UNIVERSE_IDS.filter((id) => !presentServiceIds2.has(id));
  const unevaluatedSurfaces = universe.filter((s) => !['SUPPORTED', 'UNSUPPORTED', 'NOT_APPLICABLE'].includes(s.availability));

  /* Cross-check findings ↔ work items canoniques. */
  const legacy = yaml('LEGACY_FINDING_REGISTRY.yaml');
  const workItemIds = new Set((workItems.workItems ?? []).map((w) => w.workItemId));
  const obsIds = new Set((observations.observations ?? []).map((o) => o.observationId));
  const missingObsDelta = EXPECTED_OBS_DELTA_IDS.filter((id) => !obsIds.has(id));
  // §6.3 (expert) : registryUniverseReady reste ROUGE tant que les deltas ne
  // sont pas CLASSIFIÉS et l'univers dédupliqué — pas seulement présents.
  const unclassifiedDeltas = (observations.observations ?? [])
    .filter((o) => String(o.observationId).startsWith('OBS-DELTA-') && o.triageState === 'PENDING')
    .map((o) => `${o.observationId} not classified (triage PENDING)`);
  const missingSeparateRegistries = SEPARATE_REGISTRY_FILES.filter((f) => !existsSync(join(parityRoot, f)));
  const orphanFindings = (legacy.findings ?? [])
    .filter((f) => !workItemIds.has(f.canonicalWorkItemId))
    .map((f) => `${f.sourceFindingId} → canonicalWorkItemId ${f.canonicalWorkItemId} missing`);

  /*
   * contractsValidated (P0-A2-07 / P1-A2-12) : le contenu, pas la présence.
   * Un contrat est validé s'il porte un reviewer humain réel, au moins 3
   * sections, et aucun placeholder. Aujourd'hui aucun contrat n'a de reviewer
   * → le niveau ÉCHOUE, honnêtement.
   */
  const contractValidationFailures = [];

  for (const f of CONTRACT_FILES) {
    const cp = join(parityRoot, f);

    if (!existsSync(cp)) {
      continue; // contractsPresent le signale déjà
    }

    const ct = readFileSync(cp, 'utf8');
    const reviewerMatch = ct.match(/reviewer:\s*(\S+)/);

    if (!reviewerMatch || reviewerMatch[1] === 'UNKNOWN') {
      contractValidationFailures.push(`${f}: no real reviewer`);
    } else if ((ct.match(/^#{2,3} /gm) ?? []).length < 3) {
      contractValidationFailures.push(`${f}: fewer than 3 sections`);
    } else if (/\bTODO\b|\bPLACEHOLDER\b/.test(ct)) {
      contractValidationFailures.push(`${f}: contains TODO/PLACEHOLDER`);
    }
  }

  const gateUnknownsPresent = BETA_GATE_UNKNOWN_IDS.filter((id) =>
    (unknowns.unknowns ?? []).some((u) => u.unknownId === id),
  );

  const openDecisions = (decisions.decisions ?? []).filter((d) => d.status === 'OPEN').map((d) => d.decisionId);
  const notClosedP0 = p0Rollup.filter((x) => x.derived !== 'CLOSED').map((x) => x.p0Id);
  const missingContracts = CONTRACT_FILES.filter((f) => !existsSync(join(parityRoot, f)));
  const surfacesNotDone = surfaceRollup.filter((s) => !s.done).map((s) => s.surfaceId);

  /* ===== L'échelle à 11 niveaux (audit de réanalyse 2026-07-20) ===== */

  const lvlDocumentCanonicalized = {
    name: 'documentReconciled',
    passed: cond2.passed && planOk,
    reasons: [
      ...cond2.reasons,
      ...(planOk ? [] : ['PLAN_PARITE_REPLIT.md missing or lacks schemaVersion/planVersion']),
    ],
  };
  const lvlSourceBaseline = {
    name: 'sourceBaselineReady',
    passed: unanchoredClaims.length === 0 && cond5.passed && triageBreaches.length === 0,
    reasons: [
      ...unanchoredClaims.map((id) => `claim ${id} cited by the plan but not anchored (UNVERIFIED)`),
      ...cond5.reasons,
      ...triageBreaches,
    ],
  };
  const lvlRegistryUniverse = {
    name: 'registryUniverseReady',
    passed:
      missingP0Ids.length === 0 &&
      missingP1Ids.length === 0 &&
      missingBoltDebtIds.length === 0 &&
      missingProdReadinessIds.length === 0 &&
      missingUniverseIds.length === 0 &&
      missingServiceUniverseIds.length === 0 &&
      missingObsDelta.length === 0 &&
      unclassifiedDeltas.length === 0 &&
      missingSeparateRegistries.length === 0 &&
      orphanFindings.length === 0 &&
      forbiddenTargetDates.length === 0 &&
      cond3.passed,
    reasons: [
      ...missingP0Ids.map((id) => `expected P0 missing: ${id}`),
      ...missingP1Ids.map((id) => `expected P1 missing: ${id}`),
      ...missingBoltDebtIds.map((id) => `expected BOLT_DEBT missing: ${id}`),
      ...missingProdReadinessIds.map((id) => `expected PROD_READINESS missing: ${id}`),
      ...missingUniverseIds.map((id) => `expected surface universe id missing: ${id}`),
      ...missingServiceUniverseIds.map((id) => `expected service universe id missing: ${id}`),
      ...missingObsDelta.map((id) => `expected OBS-DELTA missing: ${id}`),
      ...unclassifiedDeltas,
      ...missingSeparateRegistries.map((f) => `separate registry missing: ${f}`),
      ...orphanFindings,
      ...forbiddenTargetDates,
      ...cond3.reasons,
    ],
  };
  const lvlContractsPresent = {
    name: 'contractsPresent',
    passed: missingContracts.length === 0,
    reasons: missingContracts.map((f) => `contract file missing: ${f}`),
  };
  const lvlContractsValidated = {
    name: 'contractsValidated',
    passed: contractValidationFailures.length === 0,
    reasons: contractValidationFailures,
  };
  const lvlImplementation = {
    name: 'implementationReady',
    passed: cond1.passed,
    reasons: cond1.reasons,
  };
  const lvlVerticalBackend = {
    name: 'verticalBackendReady',
    passed: cond4.passed,
    reasons: cond4.reasons,
  };
  const lvlVerticalUserJourney = {
    name: 'verticalUserJourneyReady',
    passed: cond4.passed && uiGaps.length === 0,
    reasons: [
      ...(cond4.passed ? [] : ['verticalBackendReady not passed']),
      ...uiGaps.map((s) => `stage "${s}" has no UI proof (une preuve API n'est pas une preuve UI)`),
    ],
  };
  const lvlBeta = {
    name: 'betaReady',
    passed:
      lvlRegistryUniverse.passed &&
      lvlVerticalBackend.passed &&
      cond5.passed &&
      cond6.passed &&
      gateUnknownsPresent.length === 0,
    reasons: [
      ...(lvlRegistryUniverse.passed ? [] : ['registryUniverseReady not passed']),
      ...(lvlVerticalBackend.passed ? [] : ['verticalBackendReady not passed']),
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
    passed:
      surfacesNotDone.length === 0 &&
      unevaluatedSurfaces.length === 0 &&
      cond5.passed &&
      pendingClaims.length === 0 &&
      triageBreaches.length === 0,
    reasons: [
      ...surfacesNotDone.map((id) => `surface ${id} not done`),
      ...(unevaluatedSurfaces.length > 0
        ? [`${unevaluatedSurfaces.length} surface universe entries not evaluated (availability UNKNOWN)`]
        : []),
      ...cond5.reasons,
      ...pendingClaims.map((id) => `claim ${id} triage PENDING`),
      ...triageBreaches,
    ],
  };

  const levels = [
    lvlDocumentCanonicalized,
    lvlSourceBaseline,
    lvlRegistryUniverse,
    lvlContractsPresent,
    lvlContractsValidated,
    lvlImplementation,
    lvlVerticalBackend,
    lvlVerticalUserJourney,
    lvlBeta,
    lvlPublic,
    lvlParity,
  ];

  // highestPassedLevel = le plus haut niveau CONTIGU atteint (échelle stricte).
  let highestPassedLevel = null;

  for (const level of levels) {
    if (!level.passed) {
      break;
    }

    highestPassedLevel = level.name;
  }

  /*
   * P0-A2-16 : « approved » est RÉSERVÉ à une approbation de périmètre
   * explicite, avec approbateur stocké (docs/parity/APPROVALS.yaml). Sans
   * enregistrement d'approbation, overallStatus = NOT_APPROVED — toujours.
   */
  const approvalsPath = join(parityRoot, 'APPROVALS.yaml');
  const approvals = existsSync(approvalsPath) ? (YAML.parse(readFileSync(approvalsPath, 'utf8'))?.approvals ?? []) : [];
  const validApprovals = approvals.filter((a) => a.scope && a.approver && a.approver !== 'UNKNOWN' && a.date);
  const overallStatus = validApprovals.length > 0 ? 'SCOPE_APPROVED' : 'NOT_APPROVED';

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
    // Audit de couverture 2026-07-19 — comptes honnêtes : NON_FAIT domine.
    p1: {
      total: (p1reg.p1s ?? []).length,
      open: (p1reg.p1s ?? []).filter((i) => i.status === 'OPEN').length,
    },
    boltDebt: {
      total: (boltDebt.items ?? []).length,
      nonFait: (boltDebt.items ?? []).filter((i) => i.status === 'NON_FAIT').length,
      faitProuve: (boltDebt.items ?? []).filter((i) => i.status === 'FAIT_PROUVE').length,
    },
    prodReadiness: {
      total: (prodReadiness.items ?? []).length,
      nonFait: (prodReadiness.items ?? []).filter((i) => i.status === 'NON_FAIT').length,
      faitProuve: (prodReadiness.items ?? []).filter((i) => i.status === 'FAIT_PROUVE').length,
    },
    backlog: backlogCounts,
    canonicalWorkItems: canonicalWorkItemCount,
    unanchoredClaims: unanchoredClaims.length,
  };

  return {
    schemaVersion: 4,
    generatedFrom: [...REQUIRED_REGISTRIES, 'PLAN_PARITE_REPLIT.md', 'WORK_ITEM_REGISTRY.yaml', 'LEGACY_FINDING_REGISTRY.yaml'],
    note: 'COMPUTED by scripts/parity/generate-approval-status.mjs — never edit by hand. The validator fails the build on drift.',
    algorithm:
      "ÉCHELLE 11 NIVEAUX (audit de réanalyse 2026-07-20): overallStatus=NOT_APPROVED sauf approbation de périmètre explicite (APPROVALS.yaml, approbateur stocké). highestPassedLevel = plus haut niveau CONTIGU. Ni approvalReady ni approved.level n'existent (interdits). Les 6 conditions audit-v4 restent des sous-signaux.",
    overallStatus,
    highestPassedLevel,
    generatedAt: now,
    levels,
    blocking,
    conditions,
    counts,
    unanchoredClaims,
    p0: p0Rollup,
    surfaces: surfaceRollup,
    surfaceUniverse: {
      expected: EXPECTED_SURFACE_UNIVERSE_IDS.length,
      present: universe.length,
      evaluated: universe.length - unevaluatedSurfaces.length,
      services: serviceUniverse.length,
      // Overlay code réel + bolt (exigence Avi B / P0-LS-17) : rien n'est
      // « fait » sans refs code ; composant présent non câblé = PARTIEL.
      builtStates: {
        dejaConstruit: universe.filter((s) => s.builtState === 'DEJA_CONSTRUIT').length,
        partiel: universe.filter((s) => s.builtState === 'PARTIEL').length,
        nonFait: universe.filter((s) => s.builtState === 'NON_FAIT').length,
        nonCroise: universe.filter((s) => !s.builtState).length,
      },
    },
    workItems: { sourceFindingCount: backlogCounts.total, canonicalWorkItemCount },
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
