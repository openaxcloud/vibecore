import { PLAN_ENTITLEMENTS_VERSION } from '@vibecore/billing';
import { describe, expect, it } from 'vitest';

import {
  buildServerRollbackPromotionEvidence,
  buildServerRollbackRuntimeSpec,
  DeterministicRollbackError,
  parseServerRollbackRuntimeSpec,
  rollbackManifestDigest,
  rollbackPlanEntitlementsDigest,
  validateServerRollbackManifestPins,
  type RollbackManifestKeyring,
} from './deterministic-rollback.js';

const ORG = 'org_deterministic';
const PROJECT = 'project_deterministic';
const ARTIFACT_REF = 'europe-west9-docker.pkg.dev/tenant/repo/p-project';
const ARTIFACT_DIGEST = `sha256:${'a'.repeat(64)}`;
const PROJECT_DIGEST = `sha256:${'b'.repeat(64)}`;
const PLAN_ENTITLEMENTS = {
  version: PLAN_ENTITLEMENTS_VERSION,
  plan: 'pro' as const,
  badgeRequired: false,
  publishRegion: 'platform-default',
  publishRegions: 'all' as const,
};
const KEYRING: RollbackManifestKeyring = {
  currentId: 'test-v1',
  keys: new Map([['test-v1', 'test-manifest-encryption-key-that-is-long-enough']]),
};

function promotion() {
  return {
    promotionId: 'promo-deterministic-release',
    sourceRepo: ARTIFACT_REF,
    sourceDigest: ARTIFACT_DIGEST,
    targetRepo: ARTIFACT_REF,
    targetTenant: ORG,
    retentionTag: `active-promo-${'d'.repeat(32)}`,
    attachments: ['signature', 'sbom', 'provenance'].map((type, index) => ({
      type,
      digest: `sha256:${String(index + 1).repeat(64)}`,
      subjectDigest: ARTIFACT_DIGEST,
      relinked: true,
    })),
    binaryAuthorizationResult: 'PASSED',
    binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
    binaryAuthorizationPolicyEtag: 'policy-etag-0001',
    binaryAuthorizationEvaluatedImage: `${ARTIFACT_REF}@${ARTIFACT_DIGEST}`,
    binaryAuthorizationEvaluatedAt: '2026-08-27T00:00:00.000Z',
    state: 'PROMOTION_COMMITTED',
    preparedAt: '2026-08-27T00:00:00.000Z',
    committedAt: '2026-08-27T00:00:01.000Z',
  };
}

function runtime(database: { mode: 'none' } | { mode: 'exact-ledger'; ledgerDigest: string } = { mode: 'none' }) {
  return buildServerRollbackRuntimeSpec({
    organizationId: ORG,
    projectId: PROJECT,
    environment: 'production',
    projectManifestDigest: PROJECT_DIGEST,
    planEntitlements: PLAN_ENTITLEMENTS,
    accessPolicyVersion: 4,
    machine: {
      key: 'dedicated-1',
      rateCardVersion: 17,
      cpuMillicores: 1_000,
      memoryMb: 4_096,
    },
    port: 4_321,
    healthPath: '/ready',
    envOverrides: { FEATURE_MODE: 'pinned', PORT_SHADOW: 'not-the-port' },
    database,
    keyring: KEYRING,
  });
}

function evidence() {
  return buildServerRollbackPromotionEvidence({
    organizationId: ORG,
    projectId: PROJECT,
    artifactRef: ARTIFACT_REF,
    artifactDigest: ARTIFACT_DIGEST,
    promotion: promotion(),
  });
}

describe('deterministic server rollback manifests', () => {
  it('round-trips exact runtime pins and encrypted overrides', () => {
    const built = runtime({ mode: 'exact-ledger', ledgerDigest: `sha256:${'e'.repeat(64)}` });
    const parsed = parseServerRollbackRuntimeSpec(built, KEYRING);

    expect(parsed.envOverrides).toEqual({ FEATURE_MODE: 'pinned', PORT_SHADOW: 'not-the-port' });
    expect(parsed.spec.machine).toEqual({
      key: 'dedicated-1',
      rateCardVersion: 17,
      cpuMillicores: 1_000,
      memoryMb: 4_096,
    });
    expect(JSON.stringify(built)).not.toContain('pinned');
    expect(built.port).toBe(4_321);
    expect(built.healthPath).toBe('/ready');
  });

  it.each([
    ['unknown schema', (value: any) => ({ ...value, schemaVersion: 2 })],
    ['runtime field', (value: any) => ({ ...value, port: 9_999 })],
    ['runtime hash', (value: any) => ({ ...value, hash: `sha256:${'0'.repeat(64)}` })],
    [
      'encrypted environment',
      (value: any) => ({
        ...value,
        envOverrides: { ...value.envOverrides, ciphertext: `${value.envOverrides.ciphertext}x` },
      }),
    ],
  ])('fails closed for a tampered %s', (_label, mutate) => {
    expect(() => parseServerRollbackRuntimeSpec(mutate(runtime()), KEYRING)).toThrow(DeterministicRollbackError);
  });

  it('rejects a missing historical envelope key without substituting current values', () => {
    expect(() =>
      parseServerRollbackRuntimeSpec(runtime(), {
        currentId: 'next',
        keys: new Map([['next', 'a-different-current-key-that-is-long-enough']]),
      }),
    ).toThrowError(expect.objectContaining({ code: 'ROLLBACK_RUNTIME_SPEC_KEY_UNAVAILABLE' }));
  });

  it('binds tenant, project, plan, policy and artifact pins', () => {
    const valid = validateServerRollbackManifestPins({
      runtimeSpec: runtime(),
      promotionEvidence: evidence(),
      organizationId: ORG,
      projectId: PROJECT,
      environment: 'production',
      projectManifestDigest: PROJECT_DIGEST,
      planEntitlements: PLAN_ENTITLEMENTS,
      accessPolicyVersion: 4,
      artifactRef: ARTIFACT_REF,
      artifactDigest: ARTIFACT_DIGEST,
      keyring: KEYRING,
    });

    expect(valid.promotionEvidence.hash).toBe(
      rollbackManifestDigest({
        schemaVersion: valid.promotionEvidence.schemaVersion,
        organizationId: valid.promotionEvidence.organizationId,
        projectId: valid.promotionEvidence.projectId,
        artifactRef: valid.promotionEvidence.artifactRef,
        artifactDigest: valid.promotionEvidence.artifactDigest,
        promotion: valid.promotionEvidence.promotion,
      }),
    );

    expect(() =>
      validateServerRollbackManifestPins({
        runtimeSpec: runtime(),
        promotionEvidence: evidence(),
        organizationId: 'org_other',
        projectId: PROJECT,
        environment: 'production',
        projectManifestDigest: PROJECT_DIGEST,
        planEntitlements: PLAN_ENTITLEMENTS,
        accessPolicyVersion: 4,
        artifactRef: ARTIFACT_REF,
        artifactDigest: ARTIFACT_DIGEST,
        keyring: KEYRING,
      }),
    ).toThrowError(expect.objectContaining({ code: 'ROLLBACK_MANIFEST_PIN_MISMATCH' }));
  });

  it.each([
    ['version', { ...PLAN_ENTITLEMENTS, version: PLAN_ENTITLEMENTS_VERSION + 1 }],
    ['plan', { ...PLAN_ENTITLEMENTS, plan: 'core' }],
    ['badgeRequired', { ...PLAN_ENTITLEMENTS, badgeRequired: true }],
    ['publishRegion', { ...PLAN_ENTITLEMENTS, publishRegion: 'eu' }],
    ['publishRegions', { ...PLAN_ENTITLEMENTS, publishRegions: 'single' }],
  ])('binds every outer entitlement pin field: %s', (_field, mutated) => {
    expect(rollbackPlanEntitlementsDigest(mutated as any)).not.toBe(rollbackPlanEntitlementsDigest(PLAN_ENTITLEMENTS));
    expect(() =>
      validateServerRollbackManifestPins({
        runtimeSpec: runtime(),
        promotionEvidence: evidence(),
        organizationId: ORG,
        projectId: PROJECT,
        environment: 'production',
        projectManifestDigest: PROJECT_DIGEST,
        planEntitlements: mutated as any,
        accessPolicyVersion: 4,
        artifactRef: ARTIFACT_REF,
        artifactDigest: ARTIFACT_DIGEST,
        keyring: KEYRING,
      }),
    ).toThrowError(expect.objectContaining({ code: 'ROLLBACK_MANIFEST_PIN_MISMATCH' }));
  });

  it('fails closed for PINNED policy until pinned secret versions exist', () => {
    const current = runtime();
    const { hash: _hash, ...body } = current;
    const pinnedBody = { ...body, secretPolicy: 'PINNED' as const };
    const pinned = { ...pinnedBody, hash: rollbackManifestDigest(pinnedBody) };

    expect(parseServerRollbackRuntimeSpec(pinned, KEYRING).spec.secretPolicy).toBe('PINNED');
    expect(() =>
      validateServerRollbackManifestPins({
        runtimeSpec: pinned,
        promotionEvidence: evidence(),
        organizationId: ORG,
        projectId: PROJECT,
        environment: 'production',
        projectManifestDigest: PROJECT_DIGEST,
        planEntitlements: PLAN_ENTITLEMENTS,
        accessPolicyVersion: 4,
        artifactRef: ARTIFACT_REF,
        artifactDigest: ARTIFACT_DIGEST,
        keyring: KEYRING,
      }),
    ).toThrowError(expect.objectContaining({ code: 'ROLLBACK_SECRET_POLICY_UNSATISFIABLE' }));
  });
});
