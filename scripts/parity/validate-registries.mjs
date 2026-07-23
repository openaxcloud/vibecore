#!/usr/bin/env node
/**
 * P0-02 — validator for the docs/parity/ registries.
 *
 * FAILS (exit 1) when any registry violates its contract:
 * - every registry (yaml/json/md) carries schemaVersion + repoCommit;
 * - every entry carries its required fields with sane values (enums, hashes);
 * - JSON schemas under docs/parity/schemas/ parse and carry x-schemaVersion;
 * - baseline snapshot manifests are structurally sound (sha256 for every OK
 *   source, linkCount recorded as a snapshot property).
 *
 * Honesty rule: `UNKNOWN` is a VALID value everywhere a field allows it —
 * the validator enforces structure, never invents data.
 * EXCEPTION (évaluation v5, 2026-07-17): `targetDate: UNKNOWN` est INTERDIT
 * dans P0/UNKNOWN/DECISION — date ISO réelle, ou `state: ACCEPTED_RISK`
 * justifié (owner + expiration + reviewCondition). Une échéance inconnue
 * n'est pas une donnée, c'est une échappatoire.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/*
 * `yaml` resolves from the workspace root locally; in CI (pnpm workspace —
 * plain `npm install` at the root fails on workspace: protocols) it is
 * installed into an isolated dir passed via PARITY_DEPS.
 */
function loadYamlModule() {
  try {
    return require('yaml');
  } catch {
    const depsDir = process.env.PARITY_DEPS ?? '/tmp/parity-deps';

    return createRequire(join(depsDir, 'noop.js'))('yaml');
  }
}

const YAML = loadYamlModule();

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const parityRoot = join(repoRoot, 'docs', 'parity');

const errors = [];
const checked = [];

function fail(file, message) {
  errors.push(`${file}: ${message}`);
}

function loadYaml(path) {
  return YAML.parse(readFileSync(path, 'utf8'));
}

function requireFields(file, entry, fields, label) {
  for (const field of fields) {
    if (entry?.[field] === undefined || entry?.[field] === null || entry?.[field] === '') {
      fail(file, `${label}: missing required field "${field}"`);
    }
  }
}

function checkHeader(file, doc) {
  if (doc?.schemaVersion === undefined) {
    fail(file, 'missing schemaVersion');
  }

  if (typeof doc?.repoCommit !== 'string' || !/^[0-9a-f]{7,40}$/.test(doc.repoCommit)) {
    fail(file, 'missing/invalid repoCommit');
  }
}

/* ---- 1. PUBLIC_BASELINE ---------------------------------------------- */
{
  const file = 'PUBLIC_BASELINE_REPLIT_2026.yaml';
  const doc = loadYaml(join(parityRoot, file));
  checkHeader(file, doc);

  const CLAIM_STATUS = ['VERIFIED', 'CONFIRMED', 'INTERNAL_AUDIT', 'UNVERIFIED', 'STALE'];

  for (const claim of doc.claims ?? []) {
    requireFields(
      file,
      claim,
      [
        'claimId',
        'statement',
        'sourceId',
        'observedAt',
        'firstSeen',
        'lastVerified',
        'plan',
        'rollout',
        'region',
        'client',
        'status',
      ],
      claim?.claimId ?? 'claim',
    );

    if (claim.status && !CLAIM_STATUS.includes(claim.status)) {
      fail(file, `${claim.claimId}: invalid status "${claim.status}"`);
    }
  }

  if (!Array.isArray(doc.claims) || doc.claims.length === 0) {
    fail(file, 'claims must be a non-empty array');
  }

  checked.push(`${file} (${doc.claims?.length ?? 0} claims)`);

  /* ---- 2. SOURCE_REGISTRY (cross-checked with baseline) --------------- */
  const srcFile = 'SOURCE_REGISTRY.yaml';
  const sources = loadYaml(join(parityRoot, srcFile));
  checkHeader(srcFile, sources);

  const sourceIds = new Set();

  for (const source of sources.sources ?? []) {
    requireFields(
      srcFile,
      source,
      ['sourceId', 'url', 'title', 'publishedAt', 'accessedAt', 'contentHash', 'snapshot'],
      source?.sourceId ?? 'source',
    );

    if (source.contentHash && !/^sha256:[a-f0-9]{64}$/.test(source.contentHash)) {
      fail(srcFile, `${source.sourceId}: contentHash must be sha256:<64 hex>`);
    }

    if (source.snapshot && source.snapshot !== 'UNKNOWN' && !existsSync(join(repoRoot, source.snapshot))) {
      fail(srcFile, `${source.sourceId}: snapshot file missing (${source.snapshot})`);
    }

    sourceIds.add(source.sourceId);
  }

  checked.push(`${srcFile} (${sources.sources?.length ?? 0} sources, snapshots on disk)`);

  // every claim's sourceId must resolve
  for (const claim of doc.claims ?? []) {
    if (claim.sourceId && !sourceIds.has(claim.sourceId)) {
      fail(file, `${claim.claimId}: sourceId "${claim.sourceId}" not in SOURCE_REGISTRY`);
    }
  }
}

/* ---- 3. SURFACE_REGISTRY ---------------------------------------------- */
{
  const file = 'SURFACE_REGISTRY.yaml';
  const doc = loadYaml(join(parityRoot, file));
  checkHeader(file, doc);

  const SURFACE_AVAILABILITY = ['SUPPORTED', 'UNSUPPORTED', 'NOT_APPLICABLE', 'ROLLOUT', 'UNKNOWN'];

  for (const surface of doc.surfaces ?? []) {
    // schemaVersion 2 (audit v4 G): the full SurfaceRegistryEntry envelope.
    requireFields(
      file,
      surface,
      [
        'surfaceId',
        'route',
        'clientKind',
        'clientVersion',
        'plan',
        'entitlement',
        'region',
        'rolloutCohort',
        'availability',
        'permissions',
        'serverAuthz',
        'states',
        'errors',
        'recovery',
        'serviceIds',
        'events',
        'responsiveContract',
        'accessibilityContract',
        'locale',
        'rtl',
        'timezoneBehavior',
        'performanceBudget',
        'e2eProofIds',
        'observedAt',
      ],
      surface?.surfaceId ?? 'surface',
    );

    if (surface?.availability && !SURFACE_AVAILABILITY.includes(surface.availability)) {
      fail(
        file,
        `${surface?.surfaceId}: availability "${surface.availability}" not in {${SURFACE_AVAILABILITY.join('|')}}`,
      );
    }

    for (const dim of ['web', 'tablet', 'mobile']) {
      const v = surface?.responsiveContract?.[dim];

      if (v !== true && v !== false && v !== 'UNKNOWN') {
        fail(
          file,
          `${surface?.surfaceId}: responsiveContract.${dim} must be true|false|UNKNOWN, got ${JSON.stringify(v)}`,
        );
      }
    }
  }

  checked.push(`${file} (${doc.surfaces?.length ?? 0} surfaces, schemaVersion ${doc.schemaVersion})`);
}

/* ---- 4. E2E_PROOFS ----------------------------------------------------- */
{
  const file = 'E2E_PROOFS.yaml';
  const doc = loadYaml(join(parityRoot, file));
  checkHeader(file, doc);

  const PROOF_STATUS = ['PROVEN', 'PENDING', 'FAILED'];

  for (const proof of doc.proofs ?? []) {
    requireFields(
      file,
      proof,
      ['proofId', 'title', 'fixtures', 'steps', 'expected', 'evidenceId', 'status'],
      proof?.proofId ?? 'proof',
    );
    requireFields(file, proof.fixtures ?? {}, ['account', 'plan', 'region', 'client'], `${proof?.proofId}.fixtures`);

    if (proof.status && !PROOF_STATUS.includes(proof.status)) {
      fail(file, `${proof.proofId}: invalid status "${proof.status}"`);
    }

    // A PROVEN proof must point at evidence that actually exists in-repo.
    if (proof.status === 'PROVEN' && proof.evidenceId && !existsSync(join(repoRoot, proof.evidenceId))) {
      fail(file, `${proof.proofId}: status PROVEN but evidence missing (${proof.evidenceId})`);
    }
  }

  checked.push(`${file} (${doc.proofs?.length ?? 0} proofs, evidence paths verified for PROVEN)`);
}

/* ---- 5. RATE_CARD.json ------------------------------------------------- */
{
  const file = 'RATE_CARD.json';
  const doc = JSON.parse(readFileSync(join(parityRoot, file), 'utf8'));
  checkHeader(file, doc);

  if (!doc.deployCompute?.version || !Array.isArray(doc.deployCompute?.machineSizes)) {
    fail(file, 'deployCompute must carry version + machineSizes');
  }

  const lineKeys = (doc.agentRouting?.lines ?? []).map((line) => line.key).sort();
  const expected = ['classifier', 'economy', 'high-effort', 'lite', 'power', 'turbo'];

  if (JSON.stringify(lineKeys) !== JSON.stringify(expected)) {
    fail(file, `agentRouting.lines keys ${JSON.stringify(lineKeys)} != ${JSON.stringify(expected)}`);
  }

  checked.push(`${file} (deployCompute v${doc.deployCompute?.version}, agentRouting v${doc.agentRouting?.version})`);
}

/* ---- 6. Markdown registries carry the header --------------------------- */
{
  const mdFiles = [
    'DOMAIN_MODEL.md',
    'BILLING_LEDGER_CONTRACT.md',
    'RUNTIME_NIX_CONTRACT.md',
    'OPERATIONS_DR.md',
    'SECURITY_PRIVACY_COMPLIANCE.md',
    'PARITY_STATUS.md',
    'CHANGELOG_AUDIT.md',
    'SERVICE_CONTRACTS/README.md',

    // audit v4 I — the 14 missing contract files (17 groups, not 12).
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
    'DEPLOYMENT_TYPES_CONTRACT.md',
    'IDENTITY_COLLABORATION_CONTRACT.md',
  ];

  for (const relative of mdFiles) {
    const path = join(parityRoot, relative);

    if (!existsSync(path)) {
      fail(relative, 'file missing');
      continue;
    }

    const text = readFileSync(path, 'utf8');

    if (!/schemaVersion:\s*\d+/.test(text)) {
      fail(relative, 'missing schemaVersion');
    }

    if (!/repoCommit:\s*[0-9a-f]{7,40}/.test(text)) {
      fail(relative, 'missing repoCommit');
    }
  }

  checked.push(`${mdFiles.length} markdown registries (header check)`);
}

/* ---- 7. JSON schemas parse and carry x-schemaVersion ------------------- */
{
  const schemaDirs = [join(parityRoot, 'schemas'), join(parityRoot, 'schemas', 'domain')];

  let count = 0;

  for (const dir of schemaDirs) {
    if (!existsSync(dir)) {
      continue;
    }

    for (const name of readdirSync(dir)) {
      const path = join(dir, name);

      if (!statSync(path).isFile() || !name.endsWith('.schema.json')) {
        continue;
      }

      count += 1;

      try {
        const schema = JSON.parse(readFileSync(path, 'utf8'));

        if (schema['x-schemaVersion'] === undefined || !schema['x-repoCommit']) {
          fail(`schemas/${name}`, 'missing x-schemaVersion / x-repoCommit');
        }
      } catch (error) {
        fail(`schemas/${name}`, `invalid JSON: ${error.message}`);
      }
    }
  }

  if (count === 0) {
    fail('schemas/', 'no JSON schemas found');
  }

  checked.push(`${count} JSON schemas`);
}

/* ---- 8. Baseline snapshots --------------------------------------------- */
{
  const snapshotsRoot = join(parityRoot, 'baseline', 'snapshots');

  if (!existsSync(snapshotsRoot)) {
    fail('baseline/snapshots', 'missing — run scripts/parity/collect-baseline.mjs');
  } else {
    const days = readdirSync(snapshotsRoot).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name));

    if (days.length === 0) {
      fail('baseline/snapshots', 'no dated snapshot present');
    }

    for (const day of days) {
      const manifestPath = join(snapshotsRoot, day, 'manifest.json');

      if (!existsSync(manifestPath)) {
        fail(`baseline/snapshots/${day}`, 'missing manifest.json');
        continue;
      }

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

      if (manifest.cadence !== 'daily') {
        fail(`baseline/snapshots/${day}`, 'cadence must be "daily" (Friday-keyed automation is forbidden)');
      }

      for (const [id, source] of Object.entries(manifest.sources ?? {})) {
        if (source.status === 'OK') {
          if (!/^[a-f0-9]{64}$/.test(source.sha256 ?? '')) {
            fail(`baseline/snapshots/${day}`, `${id}: missing/invalid sha256`);
          }

          if (typeof source.linkCount !== 'number') {
            fail(`baseline/snapshots/${day}`, `${id}: linkCount must be recorded in the snapshot`);
          }

          if (!existsSync(join(snapshotsRoot, day, source.file ?? ''))) {
            fail(`baseline/snapshots/${day}`, `${id}: payload file missing`);
          }
        }
      }
    }

    checked.push(`baseline snapshots (${days.length} day(s), hashes + payloads verified)`);
  }
}

/* ---- 9. P0 / DECISION / UNKNOWN registries + cross-refs (audit v4) ------ */
{
  const p0 = loadYaml(join(parityRoot, 'P0_REGISTRY.yaml'));
  const decisions = loadYaml(join(parityRoot, 'DECISION_REGISTRY.yaml'));
  // Reçus de revue immuables (règle maîtresse 20/07) — requis pour tout CLOSED.
  const reviewReceipts = existsSync(join(parityRoot, 'REVIEW_RECEIPT_REGISTRY.yaml'))
    ? loadYaml(join(parityRoot, 'REVIEW_RECEIPT_REGISTRY.yaml'))
    : { receipts: [] };
  const unknowns = loadYaml(join(parityRoot, 'UNKNOWN_REGISTRY.yaml'));
  checkHeader('P0_REGISTRY.yaml', p0);
  checkHeader('DECISION_REGISTRY.yaml', decisions);
  checkHeader('UNKNOWN_REGISTRY.yaml', unknowns);

  /*
   * targetDate: UNKNOWN interdit (évaluation v5) — date ISO, ou ACCEPTED_RISK
   * justifié avec owner + expiration + reviewCondition.
   */
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function checkTargetDate(file, entry, id) {
    const acceptedRisk =
      entry.state === 'ACCEPTED_RISK' && entry.owner && entry.expiration && entry.reviewCondition;

    if (acceptedRisk) {
      return;
    }

    if (typeof entry.targetDate !== 'string' || !ISO_DATE.test(entry.targetDate)) {
      fail(
        file,
        `${id}: targetDate "${entry.targetDate}" forbidden — real ISO date required (or state: ACCEPTED_RISK with owner + expiration + reviewCondition)`,
      );
    }
  }

  /*
   * Complétude (évaluation v5): l'ensemble EXACT des P0 attendus (les 15 du
   * dernier audit + les 4 de l'audit v4) doit être présent — un ID absent
   * casse le build.
   */
  const { EXPECTED_P0_IDS, EXPECTED_P1_IDS, EXPECTED_BOLT_DEBT_IDS, EXPECTED_PROD_READINESS_IDS } = await import(
    join(here, 'generate-approval-status.mjs')
  );
  const presentP0Ids = new Set((p0.p0s ?? []).map((i) => i.p0Id));

  for (const id of EXPECTED_P0_IDS) {
    if (!presentP0Ids.has(id)) {
      fail('P0_REGISTRY.yaml', `expected P0 "${id}" is MISSING — the registry cannot silently shrink`);
    }
  }

  /*
   * P1 de l'audit de couverture (2026-07-19) : même règle de complétude que
   * les P0 — l'ensemble EXACT des IDs attendus doit être présent.
   */
  const p1docForSet = loadYaml(join(parityRoot, 'P1_REGISTRY.yaml'));
  const presentP1Ids = new Set((p1docForSet.p1s ?? []).map((i) => i.p1Id));

  for (const id of EXPECTED_P1_IDS) {
    if (!presentP1Ids.has(id)) {
      fail('P0_REGISTRY.yaml', `expected P1 "${id}" is MISSING from P1_REGISTRY — the registry cannot silently shrink`);
    }
  }

  const p1doc = loadYaml(join(parityRoot, 'P1_REGISTRY.yaml'));

  for (const item of p1doc.p1s ?? []) {
    requireFields(
      'P0_REGISTRY.yaml',
      item,
      ['p1Id', 'title', 'source', 'priority', 'owner', 'status', 'nextAction', 'conditionDeCloture'],
      item?.p1Id ?? 'p1',
    );
    checkTargetDate('P0_REGISTRY.yaml', item, item?.p1Id ?? 'p1');
  }

  for (const item of p0.p0s ?? []) {
    requireFields(
      'P0_REGISTRY.yaml',
      item,
      ['p0Id', 'title', 'priority', 'owner', 'status', 'nextAction'],
      item?.p0Id ?? 'p0',
    );
    checkTargetDate('P0_REGISTRY.yaml', item, item?.p0Id ?? 'p0');

    // CI RULE: no P0 CLOSED without commit + reviewer + proof.
    if (item.status === 'CLOSED' && (!item.commit || !item.reviewer || item.reviewer === 'UNKNOWN' || !item.proof)) {
      fail('P0_REGISTRY.yaml', `${item.p0Id}: CLOSED requires commit + a real reviewer + proof`);
    }

    /*
     * RÈGLE MAÎTRESSE (directive 20/07) : CLOSED exige un ReviewReceipt
     * COMPLET qui ACCEPTE ce point. PROVEN_REVIEW_PENDING = preuve posée,
     * re-signature du relecteur attendue — exige la référence du reçu (points
     * signés d'un reçu incomplet) OU un remediationTrack (points remédiés
     * re-soumis).
     */
    if (item.status === 'CLOSED') {
      const receipt = (reviewReceipts.receipts ?? []).find((r) => r.reviewReceiptId === item.reviewReceiptId);

      if (!receipt) {
        fail('P0_REGISTRY.yaml', `${item.p0Id}: CLOSED sans reviewReceiptId valide (règle maîtresse)`);
      } else if (receipt.completeness !== 'COMPLETE') {
        fail('P0_REGISTRY.yaml', `${item.p0Id}: CLOSED sur un reçu ${receipt.completeness} — interdit tant que responseHash/version modèle manquent`);
      } else if (!(receipt.decisions?.accepted ?? []).includes(item.p0Id)) {
        fail('P0_REGISTRY.yaml', `${item.p0Id}: CLOSED mais absent des accepted du reçu ${item.reviewReceiptId}`);
      }
    }

    if (item.status === 'PROVEN_REVIEW_PENDING' && !item.reviewReceiptId && !item.remediationTrack) {
      fail('P0_REGISTRY.yaml', `${item.p0Id}: PROVEN_REVIEW_PENDING exige reviewReceiptId ou remediationTrack`);
    }

    // A PROVEN/CLOSED P0's evidenceId must point at something that exists in-repo.
    if ((item.status === 'PROVEN' || item.status === 'CLOSED') && item.evidenceId && item.evidenceId !== 'UNKNOWN') {
      if (!existsSync(join(repoRoot, item.evidenceId))) {
        fail('P0_REGISTRY.yaml', `${item.p0Id}: evidenceId missing on disk (${item.evidenceId})`);
      }
    }
  }

  for (const decision of decisions.decisions ?? []) {
    requireFields(
      'DECISION_REGISTRY.yaml',
      decision,
      ['decisionId', 'title', 'rationale', 'owner', 'priority', 'status', 'nextAction'],
      decision?.decisionId ?? 'decision',
    );
    checkTargetDate('DECISION_REGISTRY.yaml', decision, decision?.decisionId ?? 'decision');
  }

  for (const unknown of unknowns.unknowns ?? []) {
    requireFields(
      'UNKNOWN_REGISTRY.yaml',
      unknown,
      ['unknownId', 'question', 'owner', 'priority', 'nextAction', 'targetDate', 'expiration'],
      unknown?.unknownId ?? 'unknown',
    );
    checkTargetDate('UNKNOWN_REGISTRY.yaml', unknown, unknown?.unknownId ?? 'unknown');
  }

  checked.push(
    `P0/DECISION/UNKNOWN registries (${(p0.p0s ?? []).length}/${(decisions.decisions ?? []).length}/${(unknowns.unknowns ?? []).length}, P1: ${(p1docForSet.p1s ?? []).length})`,
  );

  /*
   * ---- 9c. Registres de couverture (audit 2026-07-19) --------------------
   * BOLT_DEBT_REGISTRY + PRODUCTION_READINESS_REGISTRY : mêmes règles —
   * ensemble EXACT d'IDs attendus, statuts honnêtes (FAIT_PROUVE exige un
   * evidenceId présent sur disque), targetDate ISO réelle.
   */
  const COVERAGE_STATUSES = ['NON_FAIT', 'EN_COURS', 'FAIT_PROUVE'];

  for (const [file, expectedIds] of [
    ['BOLT_DEBT_REGISTRY.yaml', EXPECTED_BOLT_DEBT_IDS],
    ['PRODUCTION_READINESS_REGISTRY.yaml', EXPECTED_PROD_READINESS_IDS],
  ]) {
    const doc = loadYaml(join(parityRoot, file));
    checkHeader(file, doc);

    const presentIds = new Set((doc.items ?? []).map((i) => i.id));

    for (const id of expectedIds) {
      if (!presentIds.has(id)) {
        fail(file, `expected item "${id}" is MISSING — the registry cannot silently shrink`);
      }
    }

    for (const item of doc.items ?? []) {
      requireFields(
        file,
        item,
        ['id', 'title', 'source', 'priority', 'owner', 'status', 'nextAction', 'conditionDeCloture'],
        item?.id ?? 'item',
      );
      checkTargetDate(file, item, item?.id ?? 'item');

      if (item.status && !COVERAGE_STATUSES.includes(item.status)) {
        fail(file, `${item.id}: status "${item.status}" not in {${COVERAGE_STATUSES.join('|')}}`);
      }

      // Honnêteté : FAIT_PROUVE sans preuve sur disque est interdit.
      if (item.status === 'FAIT_PROUVE' && (!item.evidenceId || !existsSync(join(repoRoot, item.evidenceId)))) {
        fail(file, `${item.id}: FAIT_PROUVE requires an evidenceId present on disk`);
      }
    }

    checked.push(`${file} (${(doc.items ?? []).length} items, expected set complete)`);
  }
}

/* ---- 9b. OBSERVATION_REGISTRY (audit v4 A) ----------------------------- */
{
  const file = 'OBSERVATION_REGISTRY.yaml';
  const doc = loadYaml(join(parityRoot, file));
  checkHeader(file, doc);

  if (!doc.triageSla || typeof doc.triageSla !== 'object') {
    fail(file, 'missing triageSla (SLA de triage par criticité)');
  }

  const TRIAGE = ['PENDING', 'TRIAGED', 'ACCEPTED', 'REJECTED', 'DUPLICATE'];

  for (const obs of doc.observations ?? []) {
    requireFields(
      file,
      obs,
      ['observationId', 'sourceType', 'observedAt', 'detectionDate', 'triageState'],
      obs?.observationId ?? 'obs',
    );

    if (obs.triageState && !TRIAGE.includes(obs.triageState)) {
      fail(file, `${obs.observationId}: invalid triageState "${obs.triageState}"`);
    }

    // blindnessGapDays must be consistent with eventDate→detectionDate when both are dates.
    if (obs.eventDate && obs.eventDate !== 'UNKNOWN' && obs.detectionDate && typeof obs.blindnessGapDays === 'number') {
      const gap = Math.round((Date.parse(obs.detectionDate) - Date.parse(obs.eventDate)) / 86_400_000);

      if (Number.isFinite(gap) && Math.abs(gap - obs.blindnessGapDays) > 1) {
        fail(
          file,
          `${obs.observationId}: blindnessGapDays=${obs.blindnessGapDays} inconsistent with eventDate→detectionDate (${gap})`,
        );
      }
    }
  }

  checked.push(`OBSERVATION_REGISTRY (${(doc.observations ?? []).length} observations, triage SLA present)`);
}

/* ---- 10. Surfaces DONE must carry evidenceId (audit v4) ---------------- */
{
  const surfaces = loadYaml(join(parityRoot, 'SURFACE_REGISTRY.yaml'));
  const e2e = loadYaml(join(parityRoot, 'E2E_PROOFS.yaml'));
  const proofById = new Map((e2e.proofs ?? []).map((p) => [p.proofId, p]));

  for (const surface of surfaces.surfaces ?? []) {
    for (const proofId of surface.e2eProofIds ?? []) {
      // Cross-ref: no orphan proof id.
      if (!proofById.has(proofId)) {
        fail('SURFACE_REGISTRY.yaml', `${surface.surfaceId}: e2eProofId "${proofId}" not found in E2E_PROOFS.yaml`);
        continue;
      }

      // A surface that claims a PROVEN proof requires that proof to have evidence.
      const proof = proofById.get(proofId);

      if (proof.status === 'PROVEN' && !proof.evidenceId) {
        fail('SURFACE_REGISTRY.yaml', `${surface.surfaceId}: proof ${proofId} is PROVEN but has no evidenceId`);
      }
    }
  }

  checked.push('surfaces ↔ e2e cross-refs (no orphan proof id; PROVEN needs evidence)');
}

/* ---- 11. APPROVAL_STATUS.json is COMPUTED, not hand-written ------------ */
{
  const genPath = join(here, 'generate-approval-status.mjs');

  if (!existsSync(genPath)) {
    fail('APPROVAL_STATUS', 'generator script missing');
  } else {
    const { computeApprovalStatus } = await import(genPath);
    const computed = JSON.stringify(computeApprovalStatus(), null, 2) + '\n';
    const statusPath = join(parityRoot, 'APPROVAL_STATUS.json');
    const current = existsSync(statusPath) ? readFileSync(statusPath, 'utf8') : '';

    if (current !== computed) {
      fail(
        'APPROVAL_STATUS.json',
        'DRIFT — the committed file differs from the computed value. Status must never be hand-written; run generate-approval-status.mjs.',
      );
    } else {
      /*
       * Consistency of the NAMED-LEVELS algorithm (évaluation v5): the global
       * approvalReady boolean is FORBIDDEN (faux positif de couverture);
       * approved.level must be the highest CONTIGUOUS passed level.
       */
      const status = JSON.parse(computed);
      const conds = status.conditions ?? [];

      if (conds.length !== 6) {
        fail('APPROVAL_STATUS.json', `expected exactly 6 approval conditions, got ${conds.length}`);
      }

      if ('approvalReady' in status) {
        fail(
          'APPROVAL_STATUS.json',
          'the "approvalReady" boolean is FORBIDDEN — un statut global booléen est un faux positif de couverture',
        );
      }

      if ('approved' in status) {
        fail(
          'APPROVAL_STATUS.json',
          'the "approved" key is FORBIDDEN (P0-A2-16) — « approved » est réservé à APPROVALS.yaml (périmètre + approbateur stockés); le statut porte overallStatus + highestPassedLevel',
        );
      }

      if (status.overallStatus !== 'NOT_APPROVED' && status.overallStatus !== 'SCOPE_APPROVED') {
        fail('APPROVAL_STATUS.json', `overallStatus "${status.overallStatus}" invalide`);
      }

      const { LEVEL_ORDER } = await import(genPath);
      const levels = status.levels ?? [];

      if (levels.map((l) => l.name).join(',') !== LEVEL_ORDER.join(',')) {
        fail('APPROVAL_STATUS.json', `levels[] must be exactly [${LEVEL_ORDER.join(', ')}] in order`);
      }

      let expectedHighest = null;

      for (const level of levels) {
        if (!level.passed) {
          break;
        }

        expectedHighest = level.name;
      }

      if ((status.highestPassedLevel ?? null) !== expectedHighest) {
        fail(
          'APPROVAL_STATUS.json',
          `highestPassedLevel (${status.highestPassedLevel}) ≠ highest contiguous passed level (${expectedHighest})`,
        );
      }

      checked.push(
        `APPROVAL_STATUS.json is up to date (computed; 11 levels consistent, overallStatus=${status.overallStatus}, highestPassedLevel=${status.highestPassedLevel ?? 'null'})`,
      );
    }
  }
}

/* ---- 12. Complétude du backlog dans le PLAN (audit 2026-07-19) --------- */
{
  const { checkPlanCompleteness } = await import(join(here, 'check-plan-completeness.mjs'));
  const { errors: backlogErrors, counts } = checkPlanCompleteness();

  for (const e of backlogErrors) {
    fail('PLAN_PARITE_REPLIT.md (backlog)', e);
  }

  checked.push(
    `plan backlog completeness (${counts.total} points — NON FAIT: ${counts.nonFait}, DÉJÀ FAIT: ${counts.dejaFait}, PÉRIMÉ: ${counts.perime})`,
  );
}

/* ---- 12. DOCUMENT_MANIFEST is COMPUTED (P0-A2-01) ---------------------- */
{
  const genPath = join(here, 'generate-document-manifest.mjs');

  if (!existsSync(genPath)) {
    fail('DOCUMENT_MANIFEST', 'generator script missing');
  } else {
    const { computeDocumentManifest } = await import(genPath);
    const computed = computeDocumentManifest();
    const outPath = join(parityRoot, 'DOCUMENT_MANIFEST.yaml');
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';

    if (current !== computed) {
      fail('DOCUMENT_MANIFEST.yaml', 'DRIFT — régénérer (un fichier compagnon a changé sans mise à jour du manifeste)');
    } else {
      checked.push('DOCUMENT_MANIFEST.yaml is up to date (computed; every companion file hashed)');
    }
  }
}

/* ---- 12ter. SUPERSESSION_REGISTRY — couverture 100% + comptes DÉRIVÉS --- */
{
  const sup = loadYaml(join(parityRoot, 'SUPERSESSION_REGISTRY.yaml'));
  const surfacesDoc = loadYaml(join(parityRoot, 'SURFACE_REGISTRY.yaml'));
  const cu = surfacesDoc.canonicalUniverse ?? {};
  const supIds = new Set((sup.surfaceSupersessions ?? []).map((s) => s.legacySurfaceId));

  // chaque alias du registre des surfaces DOIT être couvert par la supersession
  for (const a of cu.aliases ?? []) {
    if (!supIds.has(a.declaredId)) {
      fail('SUPERSESSION_REGISTRY.yaml', `alias hérité non couvert: ${a.declaredId}`);
    }
  }

  // chaque supersession MERGED doit pointer une destination canonique existante
  const RELATIONS = ['MERGED', 'RENAMED', 'SPLIT', 'RETIRED'];

  for (const s of sup.surfaceSupersessions ?? []) {
    requireFields('SUPERSESSION_REGISTRY.yaml', s,
      ['legacySurfaceId', 'canonicalSurfaceId', 'relation', 'justification', 'source', 'evidence', 'date', 'commit'],
      s?.legacySurfaceId ?? 'supersession');

    if (!RELATIONS.includes(s.relation)) {
      fail('SUPERSESSION_REGISTRY.yaml', `${s.legacySurfaceId}: relation "${s.relation}" invalide`);
    }
  }

  // le 164 et le 122 DÉRIVENT des tables — vérifié par re-calcul
  const additional = (cu.additionalCanonical ?? []).length;
  const derivedSurfaces = 159 + additional;

  if (cu.canonicalSurfaceCount !== derivedSurfaces) {
    fail('SUPERSESSION_REGISTRY.yaml', `canonicalSurfaceCount ${cu.canonicalSurfaceCount} ≠ dérivé ${derivedSurfaces} (159 + ${additional})`);
  }

  const wiDoc = loadYaml(join(parityRoot, 'WORK_ITEM_REGISTRY.yaml'));
  const merges = (sup.workItemSupersessions ?? []).filter((w) => w.relation === 'MERGED').length;
  const splits = (sup.workItemSupersessions ?? []).filter((w) => w.relation === 'SPLIT').length;
  const derivedWi = 99 - merges + splits * 24; // 24 = items créés par l'éclatement WI-0033

  if (wiDoc.canonicalWorkItemCount !== derivedWi) {
    fail('SUPERSESSION_REGISTRY.yaml', `canonicalWorkItemCount ${wiDoc.canonicalWorkItemCount} ≠ dérivé ${derivedWi} (99 − ${merges} + ${splits}×24)`);
  }

  checked.push(`SUPERSESSION_REGISTRY (couverture aliases 100%, 164 et 122 dérivés des tables)`);
}

/* ---- 12quinquies. PRICE_OBSERVATION — complétude PAR OBSERVATION (LS-13) - */
{
  const po = loadYaml(join(parityRoot, 'PRICE_OBSERVATION_REGISTRY.yaml'));

  for (const [i, o] of (po.observations ?? []).entries()) {
    const label = `${o.planId ?? '?'}#${i}`;
    const hasHash = Boolean(o.screenshotHash || o.textHash);
    const geoKnown = o.countryOrGeo && !String(o.countryOrGeo).startsWith('UNKNOWN');
    const localeKnown = o.locale && o.locale !== 'UNKNOWN';
    const cohortKnown = o.cookieCohort && o.cookieCohort !== 'UNKNOWN';
    const complete = hasHash && geoKnown && localeKnown && cohortKnown && o.artifactPath;

    if (!complete && o.nonReplayable !== true && o.contextIncomplete !== true) {
      fail('PRICE_OBSERVATION_REGISTRY.yaml', `${label}: observation incomplète (geo/locale/cohorte/hash/artifactPath) sans justification déclarée (LS-13)`);
    }

    if (o.contextIncomplete === true && !o.contextIncompleteReason) {
      fail('PRICE_OBSERVATION_REGISTRY.yaml', `${label}: contextIncomplete sans raison`);
    }

    if (o.nonReplayable === true && !o.nonReplayableReason) {
      fail('PRICE_OBSERVATION_REGISTRY.yaml', `${label}: nonReplayable sans raison`);
    }

    if (o.artifactPath && !existsSync(join(repoRoot, o.artifactPath))) {
      fail('PRICE_OBSERVATION_REGISTRY.yaml', `${label}: artifactPath absent du disque (${o.artifactPath})`);
    }
  }

  checked.push('PRICE_OBSERVATION (complétude par observation ou nonReplayable justifié — LS-13)');
}

/* ---- 12sexies. CI_ATTESTATION — commits RÉELS du repo (anti-fictif, LS-16) */
{
  const { execSync } = await import('node:child_process');
  const att = loadYaml(join(parityRoot, 'CI_ATTESTATION.yaml'));
  const a = att.attestation ?? {};

  let shallow = false;

  try {
    shallow = execSync('git rev-parse --is-shallow-repository', { cwd: repoRoot }).toString().trim() === 'true';
  } catch {
    shallow = true; // pas un repo git utilisable → ne pas prétendre vérifier
  }

  for (const field of shallow ? [] : ['runCommit', 'mergedCommit']) {
    const sha = a[field];

    if (sha && /^[0-9a-f]{7,40}$/.test(String(sha))) {
      try {
        execSync(`git cat-file -e ${sha}^{commit}`, { cwd: repoRoot, stdio: 'ignore' });
      } catch {
        fail('CI_ATTESTATION.yaml', `${field} ${String(sha).slice(0, 12)} n'existe pas dans l'historique git — une attestation fictive est refusée (LS-16)`);
      }
    }
  }

  checked.push(shallow
    ? 'CI_ATTESTATION anti-fictif SAUTÉ (clone shallow — le job CI validate tourne en fetch-depth 0 où le contrôle est réel)'
    : 'CI_ATTESTATION commits vérifiés dans l\'historique git (anti-fictif — LS-16)');
}

/* ---- 12quater. CONTRACT_REGISTRY — 14 contrats UN PAR UN (C5) ----------- */
{
  const cr = loadYaml(join(parityRoot, 'CONTRACT_REGISTRY.yaml'));
  const reviewReceiptsForContracts = existsSync(join(parityRoot, 'REVIEW_RECEIPT_REGISTRY.yaml')) ? loadYaml(join(parityRoot, 'REVIEW_RECEIPT_REGISTRY.yaml')) : { receipts: [] };
  const entries = cr.contracts ?? [];

  if (entries.length !== 14) {
    fail('CONTRACT_REGISTRY.yaml', `${entries.length} contrats ≠ 14 (§2.3)`);
  }

  const HSTATES = ['HARDENED_PENDING_REVIEW', 'TO_HARDEN', 'BLOCKED_ON_CHANTIER'];

  for (const c of entries) {
    requireFields('CONTRACT_REGISTRY.yaml', c,
      ['contractId', 'file', 'contractVersion', 'refusalReasonV1', 'hardeningStatus', 'expectedReviewer', 'signatureResult'],
      c?.contractId ?? 'contract');

    if (!HSTATES.includes(c.hardeningStatus)) {
      fail('CONTRACT_REGISTRY.yaml', `${c.contractId}: hardeningStatus "${c.hardeningStatus}" invalide`);
    }

    if (c.hardeningStatus === 'BLOCKED_ON_CHANTIER' && !c.blockedBy) {
      fail('CONTRACT_REGISTRY.yaml', `${c.contractId}: BLOCKED_ON_CHANTIER sans blockedBy — un blocage sans cause n'est pas honnête`);
    }

    const cp = join(parityRoot, c.file);

    if (!existsSync(cp)) {
      fail('CONTRACT_REGISTRY.yaml', `${c.contractId}: fichier absent (${c.file})`);
    } else if (c.hardeningStatus === 'HARDENED_PENDING_REVIEW') {
      const ct = readFileSync(cp, 'utf8');

      const hasId = ct.includes(`contractId: ${c.contractId}`) || ct.includes(`"x-contractId": "${c.contractId}"`);
      // Le fichier doit porter LA MÊME version que le registre (v2, v3, …) —
      // l'ancien littéral « 2 » refusait toute remédiation ultérieure.
      const declaredVersion = String(c.contractVersion);
      const hasVersion =
        new RegExp(`contractVersion:\\s*${declaredVersion}\\b`).test(ct) ||
        new RegExp(`"x-contractVersion":\\s*${declaredVersion}\\b`).test(ct);

      if (!hasId || !hasVersion) {
        fail('CONTRACT_REGISTRY.yaml', `${c.contractId}: durci déclaré mais le fichier ne porte pas contractId + contractVersion ${declaredVersion}`);
      }
    }

    // RÈGLE MAÎTRESSE : SIGNED exige un reçu de revue COMPLET.
    if (c.signatureResult === 'SIGNED') {
      const receipt = (reviewReceiptsForContracts.receipts ?? []).find((r) => r.reviewReceiptId === c.reviewReceiptId);

      if (!receipt || receipt.completeness !== 'COMPLETE') {
        fail('CONTRACT_REGISTRY.yaml', `${c.contractId}: SIGNED sans reçu COMPLET`);
      }
    }
  }

  checked.push(`CONTRACT_REGISTRY (14 contrats individuels, ${entries.filter((c) => c.hardeningStatus === 'HARDENED_PENDING_REVIEW').length} durcis, ${entries.filter((c) => c.hardeningStatus === 'BLOCKED_ON_CHANTIER').length} bloqués motivés)`);
}

/* ---- 12bis. COUNTER_RECONCILIATION est CALCULÉ (directive 20/07) ------- */
{
  const genPath = join(here, 'generate-counter-reconciliation.mjs');

  if (existsSync(genPath)) {
    const { computeCounterReconciliation } = await import(genPath);
    const computed = computeCounterReconciliation();
    const outPath = join(parityRoot, 'COUNTER_RECONCILIATION_20260720.md');
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';

    if (current !== computed) {
      fail('COUNTER_RECONCILIATION_20260720.md', 'DRIFT — compteur édité à la main ou registre changé sans régénération');
    } else {
      checked.push('COUNTER_RECONCILIATION_20260720.md is up to date (computed)');
    }
  }
}

/* ---- 13. Nouveaux registres (audit de réanalyse) ----------------------- */
{
  for (const f of ['LEGACY_FINDING_REGISTRY.yaml', 'WORK_ITEM_REGISTRY.yaml', 'TRACEABILITY_MATRIX.yaml', 'OWNER_ROLES.yaml',
    // Registres séparés (P0-LS-01) — présence + schemaVersion, cassants.
    'ARTIFACT_KIND_REGISTRY.yaml', 'COMPONENT_KIND_REGISTRY.yaml', 'CREATION_INTENT_REGISTRY.yaml',
    'GENERATED_ASSET_KIND_REGISTRY.yaml', 'CAPABILITY_REGISTRY.yaml', 'DEPLOYMENT_TYPE_REGISTRY.yaml',
    'IMPORT_PROVIDER_REGISTRY.yaml', 'CONNECTOR_REGISTRY.yaml', 'OFFERING_ENTITLEMENT_REGISTRY.yaml',
    'EXTERNAL_ECOSYSTEM_REGISTRY.yaml', 'CI_ATTESTATION.yaml',
    'SERVICE_REGISTRY.yaml', 'P1_REGISTRY.yaml', 'ROUTE_OBSERVATION_REGISTRY.yaml',
    'LEGACY_SOURCE_COVERAGE.yaml', 'PRICE_OBSERVATION_REGISTRY.yaml', 'IMPLEMENTATION_STATUS.yaml']) {
    const p = join(parityRoot, f);

    if (!existsSync(p)) {
      fail(f, 'file missing');
      continue;
    }

    const doc = loadYaml(p);

    if (doc?.schemaVersion === undefined) {
      fail(f, 'missing schemaVersion');
    }
  }

  const legacy = loadYaml(join(parityRoot, 'LEGACY_FINDING_REGISTRY.yaml'));
  const work = loadYaml(join(parityRoot, 'WORK_ITEM_REGISTRY.yaml'));

  if ((legacy.findings ?? []).length !== legacy.sourceFindingCount) {
    fail('LEGACY_FINDING_REGISTRY.yaml', `sourceFindingCount (${legacy.sourceFindingCount}) ≠ findings réels (${(legacy.findings ?? []).length})`);
  }

  if ((work.workItems ?? []).length !== work.canonicalWorkItemCount) {
    fail('WORK_ITEM_REGISTRY.yaml', `canonicalWorkItemCount (${work.canonicalWorkItemCount}) ≠ items réels (${(work.workItems ?? []).length})`);
  }

  {
    const ak = loadYaml(join(parityRoot, 'ARTIFACT_KIND_REGISTRY.yaml'));
    const kinds = (ak.kinds ?? []).map((k) => k.kind).sort().join(',');
    const expected = ['ANIMATION_VIDEO', 'DATA_VISUALIZATION', 'DESIGN', 'EXPERIENCE_3D', 'MOBILE_APP', 'SLIDE_DECK', 'WEB_APP'].join(',');

    if (kinds !== expected) {
      fail('ARTIFACT_KIND_REGISTRY.yaml', `kinds [${kinds}] ≠ taxonomie exacte P0-LS-02 [${expected}] — SERVICE/JOB/STATIC_SITE/DOCUMENT/SPREADSHEET interdits ici`);
    }

    const ip = loadYaml(join(parityRoot, 'IMPORT_PROVIDER_REGISTRY.yaml'));

    if ((ip.providers ?? []).length !== 12) {
      fail('IMPORT_PROVIDER_REGISTRY.yaml', `${(ip.providers ?? []).length} providers ≠ 12 (RPL-24)`);
    }

    if ((ip.providers ?? []).some((x) => x.provider === 'GITLAB')) {
      fail('IMPORT_PROVIDER_REGISTRY.yaml', 'GITLAB ne doit pas être une tuile (P0-LS-05) — capacité git plus large = UNK-LS-GITLAB-GIT');
    }

    // P0-LS-04 : GitLab exige une entrée STRUCTURÉE hors tuiles (pas une note d'en-tête).
    const gitlabCap = (ip.nonTileCapabilities ?? []).find((x) => x.capability === 'GITLAB');

    if (!gitlabCap) {
      fail('IMPORT_PROVIDER_REGISTRY.yaml', 'entrée structurée GITLAB manquante dans nonTileCapabilities (P0-LS-04)');
    } else {
      for (const k of ['kind', 'hubTileVisible', 'capabilityStatus', 'evidence', 'unknowns']) {
        if (gitlabCap[k] === undefined) {
          fail('IMPORT_PROVIDER_REGISTRY.yaml', `nonTileCapabilities GITLAB: champ ${k} manquant (P0-LS-04)`);
        }
      }
    }
  }

  checked.push(`LEGACY/WORK_ITEM/TRACEABILITY/OWNER_ROLES présents (${(legacy.findings ?? []).length} constats → ${(work.workItems ?? []).length} work items canoniques)`);
}

/* ---- 14. PARITY_STATUS est GÉNÉRÉE + attestation CI réelle (réconciliation A2) ---- */
{
  const genPath = join(here, 'generate-parity-status.mjs');

  if (!existsSync(genPath)) {
    fail('PARITY_STATUS', 'generator script missing — la vue ne peut pas être « générée » sans générateur');
  } else {
    const { computeParityStatus } = await import(genPath);
    const computed = computeParityStatus();
    const outPath = join(parityRoot, 'PARITY_STATUS.md');
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';

    if (current !== computed) {
      fail('PARITY_STATUS.md', 'DRIFT — vue éditée à la main ou non régénérée (éditer PARITY_STATUS_NOTES.md puis régénérer)');
    } else {
      checked.push('PARITY_STATUS.md is up to date (computed from registries + NOTES)');
    }
  }

  const attPath = join(parityRoot, 'CI_ATTESTATION.yaml');

  if (!existsSync(attPath)) {
    fail('CI_ATTESTATION.yaml', 'missing — une attestation CI réelle (runId + date + commit) est requise (P0-A2-13)');
  } else {
    const att = loadYaml(attPath)?.attestation ?? {};

    if (!/^\d{8,}$/.test(String(att.runId ?? ''))) {
      fail('CI_ATTESTATION.yaml', 'runId manquant/invalide');
    }

    if (!/^[0-9a-f]{7,40}$/.test(String(att.runCommit ?? ''))) {
      fail('CI_ATTESTATION.yaml', 'runCommit manquant/invalide');
    }

    if (Number.isNaN(Date.parse(att.runDate ?? ''))) {
      fail('CI_ATTESTATION.yaml', 'runDate manquante/invalide');
    }

    if (att.conclusion !== 'success') {
      fail('CI_ATTESTATION.yaml', `attestation non verte (conclusion=${att.conclusion})`);
    }

    checked.push(`CI_ATTESTATION (run ${att.runId} @ ${String(att.runCommit).slice(0, 8)}, ${att.runDate}, ${att.conclusion})`);
  }
}

/* ---- 15. IMPLEMENTATION_STATUS — règles §23 (CODED=mergé, PROVEN=preuves) ---- */
{
  // P0-EX-02 : le statut est GÉNÉRÉ depuis IMPLEMENTATION_FACTS.yaml — toute
  // édition à la main du statut (ou fait changé sans régénération) = DRIFT.
  const genPath = join(here, 'generate-implementation-status.mjs');

  if (!existsSync(genPath)) {
    fail('IMPLEMENTATION_STATUS', 'generator script missing (P0-EX-02)');
  } else {
    try {
      const { computeImplementationStatus } = await import(genPath);
      const computed = computeImplementationStatus();
      const current = readFileSync(join(parityRoot, 'IMPLEMENTATION_STATUS.yaml'), 'utf8');

      if (current !== computed) {
        fail('IMPLEMENTATION_STATUS.yaml', 'DRIFT — régénérer (statut édité à la main ou fait changé sans régénération, P0-EX-02)');
      } else {
        checked.push('IMPLEMENTATION_STATUS.yaml is up to date (computed from IMPLEMENTATION_FACTS — P0-EX-02)');
      }
    } catch (error) {
      fail('IMPLEMENTATION_STATUS.yaml', `génération impossible: ${error.message}`);
    }
  }

  const impl = loadYaml(join(parityRoot, 'IMPLEMENTATION_STATUS.yaml'));
  const items = impl.items ?? [];
  const STATUSES = ['NOT_STARTED', 'PARTIAL', 'CODED', 'INTEGRATED', 'PROVEN', 'BLOCKED', 'NOT_APPLICABLE'];

  if (items.length !== 159) {
    fail('IMPLEMENTATION_STATUS.yaml', `${items.length} items ≠ 159 (univers des candidats surfaces)`);
  }

  for (const it of items) {
    if (!STATUSES.includes(it.status)) {
      fail('IMPLEMENTATION_STATUS.yaml', `${it.itemId}: status "${it.status}" invalide`);
    }

    if ((it.status === 'CODED' || it.status === 'PROVEN') && it.mergedToMain !== true) {
      fail('IMPLEMENTATION_STATUS.yaml', `${it.itemId}: ${it.status} exige mergedToMain=true (§23)`);
    }

    if (it.status === 'PROVEN') {
      const evs = it.evidenceIds ?? [];

      if (evs.length === 0) {
        fail('IMPLEMENTATION_STATUS.yaml', `${it.itemId}: PROVEN sans evidenceIds (§23)`);
      }

      for (const ev of evs) {
        if (!existsSync(join(repoRoot, ev))) {
          fail('IMPLEMENTATION_STATUS.yaml', `${it.itemId}: evidence absente du disque (${ev})`);
        }
      }
    }
  }

  checked.push(`IMPLEMENTATION_STATUS (${items.length} items — règles §23 CODED/PROVEN vérifiées)`);
}

/* ---- report ------------------------------------------------------------ */
for (const line of checked) {
  console.log(`[validate-registries] OK ${line}`);
}

if (errors.length > 0) {
  console.error(`\n[validate-registries] ${errors.length} violation(s):`);

  for (const error of errors) {
    console.error(`  ✗ ${error}`);
  }

  process.exit(1);
}

console.log('[validate-registries] all registries valid');
