import { PLAN_ENTITLEMENTS_VERSION } from '@vibecore/billing';

import {
  buildServerRollbackPromotionEvidence,
  buildServerRollbackRuntimeSpec,
  rollbackManifestKeyring,
  type ServerRollbackDatabasePin,
  type ServerRollbackRuntimeIdentity,
} from '../deterministic-rollback.js';
import type { ReleasePlanEntitlementsPin } from '../store.js';

export const DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS: ReleasePlanEntitlementsPin = {
  version: PLAN_ENTITLEMENTS_VERSION,
  plan: 'pro',
  badgeRequired: false,
  publishRegion: 'platform-default',
  publishRegions: 'all',
};

export function committedPromotionFixture(input: {
  organizationId: string;
  artifactRef: string;
  artifactDigest: string;
  promotionId?: string;
}) {
  return {
    promotionId: input.promotionId ?? 'promotion-fixture',
    sourceRepo: input.artifactRef,
    sourceDigest: input.artifactDigest,
    targetRepo: input.artifactRef,
    targetTenant: input.organizationId,
    retentionTag: `active-promo-${'a'.repeat(32)}`,
    attachments: ['signature', 'sbom', 'provenance'].map((type, index) => ({
      type,
      digest: `sha256:${String(index + 1).repeat(64)}`,
      subjectDigest: input.artifactDigest,
      relinked: true,
    })),
    binaryAuthorizationResult: 'PASSED',
    binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
    binaryAuthorizationPolicyEtag: 'policy-etag-0001',
    binaryAuthorizationEvaluatedImage: `${input.artifactRef}@${input.artifactDigest}`,
    binaryAuthorizationEvaluatedAt: '2026-08-26T00:00:00.500Z',
    state: 'PROMOTION_COMMITTED',
    preparedAt: '2026-08-26T00:00:00.000Z',
    committedAt: '2026-08-26T00:00:01.000Z',
  };
}

export function deterministicServerReleaseFixture(input: {
  organizationId: string;
  projectId: string;
  environment?: 'preview' | 'staging' | 'production';
  projectManifestDigest: string;
  accessPolicyVersion: number;
  artifactRef: string;
  artifactDigest: string;
  machineKey?: string;
  rateCardVersion?: number;
  cpuMillicores?: number;
  memoryMb?: number;
  port?: number;
  healthPath?: string;
  envOverrides?: Record<string, string>;
  database?: ServerRollbackDatabasePin;
  promotionId?: string;
  planEntitlements?: ReleasePlanEntitlementsPin;
  runtimeIdentity?: ServerRollbackRuntimeIdentity;
}) {
  const promotion = committedPromotionFixture(input);
  const planEntitlements = input.planEntitlements ?? DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS;
  const runtimeSpec = buildServerRollbackRuntimeSpec({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environment: input.environment ?? 'preview',
    projectManifestDigest: input.projectManifestDigest,
    planEntitlements,
    accessPolicyVersion: input.accessPolicyVersion,
    machine: {
      key: input.machineKey ?? 'shared-0.5',
      rateCardVersion: input.rateCardVersion ?? 1,
      cpuMillicores: input.cpuMillicores ?? 500,
      memoryMb: input.memoryMb ?? 2_048,
    },
    port: input.port ?? 3_000,
    healthPath: input.healthPath ?? '/health',
    envOverrides: input.envOverrides ?? {},
    database: input.database ?? { mode: 'none' },
    ...(input.runtimeIdentity ?? { runtimeClass: 'autoscale' }),
    keyring: rollbackManifestKeyring(),
  });
  const promotionEvidence = buildServerRollbackPromotionEvidence({
    organizationId: input.organizationId,
    projectId: input.projectId,
    artifactRef: input.artifactRef,
    artifactDigest: input.artifactDigest,
    promotion,
  });

  return { promotion, runtimeSpec, promotionEvidence, planEntitlements };
}
