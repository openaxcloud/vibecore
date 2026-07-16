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
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

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
    requireFields(file, claim, ['claimId', 'statement', 'sourceId', 'observedAt', 'firstSeen', 'lastVerified', 'plan', 'rollout', 'region', 'client', 'status'], claim?.claimId ?? 'claim');

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
    requireFields(srcFile, source, ['sourceId', 'url', 'title', 'publishedAt', 'accessedAt', 'contentHash', 'snapshot'], source?.sourceId ?? 'source');

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

  for (const surface of doc.surfaces ?? []) {
    requireFields(file, surface, ['surfaceId', 'route', 'client', 'plan', 'permissions', 'states', 'serviceIds', 'events', 'responsive', 'e2eProofIds'], surface?.surfaceId ?? 'surface');

    if (!('featureFlag' in (surface ?? {}))) {
      fail(file, `${surface?.surfaceId}: featureFlag key required (null allowed)`);
    }
  }

  checked.push(`${file} (${doc.surfaces?.length ?? 0} surfaces)`);
}

/* ---- 4. E2E_PROOFS ----------------------------------------------------- */
{
  const file = 'E2E_PROOFS.yaml';
  const doc = loadYaml(join(parityRoot, file));
  checkHeader(file, doc);

  const PROOF_STATUS = ['PROVEN', 'PENDING', 'FAILED'];

  for (const proof of doc.proofs ?? []) {
    requireFields(file, proof, ['proofId', 'title', 'fixtures', 'steps', 'expected', 'evidenceId', 'status'], proof?.proofId ?? 'proof');
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
  const unknowns = loadYaml(join(parityRoot, 'UNKNOWN_REGISTRY.yaml'));
  checkHeader('P0_REGISTRY.yaml', p0);
  checkHeader('DECISION_REGISTRY.yaml', decisions);
  checkHeader('UNKNOWN_REGISTRY.yaml', unknowns);

  for (const item of p0.p0s ?? []) {
    requireFields('P0_REGISTRY.yaml', item, ['p0Id', 'title', 'priority', 'owner', 'status', 'nextAction'], item?.p0Id ?? 'p0');

    // CI RULE: no P0 CLOSED without commit + reviewer + proof.
    if (item.status === 'CLOSED' && (!item.commit || !item.reviewer || item.reviewer === 'UNKNOWN' || !item.proof)) {
      fail('P0_REGISTRY.yaml', `${item.p0Id}: CLOSED requires commit + a real reviewer + proof`);
    }

    // A PROVEN/CLOSED P0's evidenceId must point at something that exists in-repo.
    if ((item.status === 'PROVEN' || item.status === 'CLOSED') && item.evidenceId && item.evidenceId !== 'UNKNOWN') {
      if (!existsSync(join(repoRoot, item.evidenceId))) {
        fail('P0_REGISTRY.yaml', `${item.p0Id}: evidenceId missing on disk (${item.evidenceId})`);
      }
    }
  }

  for (const decision of decisions.decisions ?? []) {
    requireFields('DECISION_REGISTRY.yaml', decision, ['decisionId', 'title', 'rationale', 'owner', 'priority', 'status', 'nextAction'], decision?.decisionId ?? 'decision');
  }

  for (const unknown of unknowns.unknowns ?? []) {
    requireFields('UNKNOWN_REGISTRY.yaml', unknown, ['unknownId', 'question', 'owner', 'priority', 'nextAction', 'targetDate', 'expiration'], unknown?.unknownId ?? 'unknown');
  }

  checked.push(`P0/DECISION/UNKNOWN registries (${(p0.p0s ?? []).length}/${(decisions.decisions ?? []).length}/${(unknowns.unknowns ?? []).length})`);
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
    requireFields(file, obs, ['observationId', 'sourceType', 'observedAt', 'detectionDate', 'triageState'], obs?.observationId ?? 'obs');

    if (obs.triageState && !TRIAGE.includes(obs.triageState)) {
      fail(file, `${obs.observationId}: invalid triageState "${obs.triageState}"`);
    }

    // blindnessGapDays must be consistent with eventDate→detectionDate when both are dates.
    if (obs.eventDate && obs.eventDate !== 'UNKNOWN' && obs.detectionDate && typeof obs.blindnessGapDays === 'number') {
      const gap = Math.round((Date.parse(obs.detectionDate) - Date.parse(obs.eventDate)) / 86_400_000);
      if (Number.isFinite(gap) && Math.abs(gap - obs.blindnessGapDays) > 1) {
        fail(file, `${obs.observationId}: blindnessGapDays=${obs.blindnessGapDays} inconsistent with eventDate→detectionDate (${gap})`);
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
      fail('APPROVAL_STATUS.json', 'DRIFT — the committed file differs from the computed value. Status must never be hand-written; run generate-approval-status.mjs.');
    } else {
      checked.push('APPROVAL_STATUS.json is up to date (computed, not hand-written)');
    }
  }
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
