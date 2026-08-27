import { createHash } from 'node:crypto';

import {
  PLAN_ENTITLEMENTS_VERSION,
  MAX_SUPPORTED_PARALLEL_AGENTS,
  resolvePlanEntitlements,
  splitEgressAllowance,
  starterPlanEntitlements,
  type EnterpriseCapability,
  type PlanEntitlements,
} from '@vibecore/billing';
import type {
  ApiStore,
  FeatureFlagRecord,
  ProjectCollaboratorRecord,
  ProjectRecord,
  ReleasePlanEntitlementsPin,
} from './store.js';
import { parseReleasePlanEntitlementsPin } from './store.js';

const ENTITLED_SUBSCRIPTION_STATUSES = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE']);

export const PARALLEL_AGENTS_OVERRIDE_KEY = 'entitlement.parallelAgents' as const;
export const CUSTOM_PUBLISH_REGION_FLAG_PREFIX = 'entitlement.publishRegion.' as const;
export const ENTERPRISE_CAPABILITY_FLAG_PREFIX = 'entitlement.enterprise.' as const;

export const ENTERPRISE_CAPABILITIES: readonly EnterpriseCapability[] = [
  'single-tenant',
  'static-outbound-ip',
  'vpc-peering',
  'data-warehouse',
  'security-center',
];

export interface ResolvedOrganizationEntitlements extends PlanEntitlements {
  /** Explicit org-scoped operator grants only; global flags never provision a tenant. */
  provisionedEnterpriseCapabilities: readonly EnterpriseCapability[];
  /** Explicit org-scoped region slugs for custom Enterprise contracts. */
  customPublishRegions: readonly string[];
  /** Persisted subscription boundary; never derived from a Stripe annual price. */
  currentPeriodStart?: string;
}

function isFullyEnabled(flag: FeatureFlagRecord): boolean {
  return flag.enabled && (flag.rolloutPercent === undefined || flag.rolloutPercent === 100);
}

function normalizeRegion(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized) ? normalized : null;
}

function explicitCapabilityFlags(flags: readonly FeatureFlagRecord[]): EnterpriseCapability[] {
  const enabled = new Set(flags.filter(isFullyEnabled).map((flag) => flag.key));
  return ENTERPRISE_CAPABILITIES.filter((capability) =>
    enabled.has(`${ENTERPRISE_CAPABILITY_FLAG_PREFIX}${capability}`),
  );
}

function explicitCustomRegions(flags: readonly FeatureFlagRecord[]): string[] {
  return [...new Set(
    flags
      .filter(isFullyEnabled)
      .filter((flag) => flag.key.startsWith(CUSTOM_PUBLISH_REGION_FLAG_PREFIX))
      .map((flag) => normalizeRegion(flag.key.slice(CUSTOM_PUBLISH_REGION_FLAG_PREFIX.length)))
      .filter((region): region is string => region !== null),
  )].sort();
}

/**
 * Resolve one org from persisted subscription+plan rows. Lookup errors are not
 * caught: mutation routes must answer 503 rather than accidentally grant access.
 * Unknown or inconsistent rows resolve to Starter by contract.
 */
export async function resolveOrganizationEntitlements(
  store: ApiStore,
  organizationId: string,
): Promise<ResolvedOrganizationEntitlements> {
  const subscription = await store.getSubscription(organizationId);

  if (!subscription || !ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return {
      ...starterPlanEntitlements(),
      provisionedEnterpriseCapabilities: [],
      customPublishRegions: [],
      currentPeriodStart: undefined,
    };
  }

  const base = resolvePlanEntitlements({
    key: subscription.planKey,
    monthlyCents: subscription.planMonthlyCents,
  });

  if (base.plan !== 'enterprise') {
    return {
      ...base,
      provisionedEnterpriseCapabilities: [],
      customPublishRegions: [],
      currentPeriodStart: subscription.currentPeriodStart,
    };
  }

  // getQuotaOverride uses database NOW() in the Prisma store, so expiry cannot
  // differ between API pods. Invalid or unsupported values retain the safe 10.
  const [parallelOverride, scopedFlags] = await Promise.all([
    store.getQuotaOverride(organizationId, PARALLEL_AGENTS_OVERRIDE_KEY),
    store.listFeatureFlags(organizationId),
  ]);
  const parallelAgents =
    parallelOverride &&
    Number.isSafeInteger(parallelOverride.limit) &&
    parallelOverride.limit >= 1 &&
    parallelOverride.limit <= MAX_SUPPORTED_PARALLEL_AGENTS
      ? parallelOverride.limit
      : undefined;
  const resolved = resolvePlanEntitlements(
    { key: subscription.planKey, monthlyCents: subscription.planMonthlyCents },
    { enterpriseParallelAgents: parallelAgents },
  );

  return {
    ...resolved,
    provisionedEnterpriseCapabilities: explicitCapabilityFlags(scopedFlags),
    customPublishRegions: explicitCustomRegions(scopedFlags),
    currentPeriodStart: subscription.currentPeriodStart,
  };
}

export function isEnterpriseCapabilityProvisioned(
  entitlements: ResolvedOrganizationEntitlements,
  capability: EnterpriseCapability,
): boolean {
  return (
    entitlements.plan === 'enterprise' &&
    entitlements.enterpriseCapabilities.includes(capability) &&
    entitlements.provisionedEnterpriseCapabilities.includes(capability)
  );
}

export function isReadOnlyProjectRole(roleKey: string): boolean {
  return roleKey === 'viewer' || roleKey === 'guest';
}

export type ReadOnlyViewerMutationResult<T> =
  | {
      allowed: true;
      value: T;
    }
  | {
      allowed: false;
      limit: number;
      activeViewers: number;
      requestedViewers: number;
      entitlements: ResolvedOrganizationEntitlements;
    };

/**
 * Serialize every mutation that can expand a tenant's effective read-only
 * project audience. The caller supplies the exact users the mutation would
 * expose, resolved while the org advisory lock is held. For a full group
 * replacement, exclude that group's existing edge and pass the replacement
 * members so removals and additions are evaluated as one post-state.
 */
export async function mutateReadOnlyViewerAccessWithEntitlements<T>(input: {
  store: ApiStore;
  organizationId: string;
  /** `null` means the mutation does not currently touch a read-only grant edge. */
  prospectiveUserIds:
    | readonly string[]
    | (() => Promise<readonly string[] | null>);
  excludeGroupId?: string;
  mutation: () => Promise<T>;
}): Promise<ReadOnlyViewerMutationResult<T>> {
  return input.store.withSerializedMutation(`plan-viewers:${input.organizationId}`, async () => {
    const prospectiveUserIds =
      typeof input.prospectiveUserIds === 'function'
        ? await input.prospectiveUserIds()
        : input.prospectiveUserIds;

    if (prospectiveUserIds === null) {
      return { allowed: true, value: await input.mutation() };
    }

    const entitlements = await resolveOrganizationEntitlements(input.store, input.organizationId);

    if (entitlements.viewers !== null) {
      const [currentViewerUserIds, baselineViewerUserIds] = input.excludeGroupId
        ? await Promise.all([
            input.store.listActiveOrganizationViewerUserIds(input.organizationId),
            input.store.listActiveOrganizationViewerUserIds(input.organizationId, {
              excludeGroupId: input.excludeGroupId,
            }),
          ])
        : await input.store
            .listActiveOrganizationViewerUserIds(input.organizationId)
            .then((userIds) => [userIds, userIds] as const);
      const postMutationUserIds = new Set(baselineViewerUserIds);
      prospectiveUserIds.forEach((userId) => postMutationUserIds.add(userId));

      // A downgrade can leave a tenant temporarily above its new limit. Permit
      // removals/no-ops, but never let any mutation expand that audience.
      if (
        postMutationUserIds.size > entitlements.viewers &&
        postMutationUserIds.size > currentViewerUserIds.length
      ) {
        return {
          allowed: false,
          limit: entitlements.viewers,
          activeViewers: currentViewerUserIds.length,
          requestedViewers: postMutationUserIds.size,
          entitlements,
        };
      }
    }

    const value = await input.mutation();
    return { allowed: true, value };
  });
}

export type ViewerEntitlementResult =
  | {
      allowed: true;
      collaborator: ProjectCollaboratorRecord;
    }
  | {
      allowed: false;
      limit: number;
      activeViewers: number;
      entitlements: ResolvedOrganizationEntitlements;
    };

/**
 * Atomically count distinct viewers and upsert the requested project grant.
 * The shared lock is a Postgres advisory xact lock in production, so separate
 * API pods cannot both claim the last slot.
 */
export async function addProjectCollaboratorWithEntitlements(input: {
  store: ApiStore;
  project: ProjectRecord;
  userId: string;
  roleKey: string;
  expiresAt?: Date | null;
}): Promise<ViewerEntitlementResult> {
  const claim = await mutateReadOnlyViewerAccessWithEntitlements({
    store: input.store,
    organizationId: input.project.organizationId,
    prospectiveUserIds: isReadOnlyProjectRole(input.roleKey) ? [input.userId] : [],
    mutation: () =>
      input.store.addProjectCollaborator({
        projectId: input.project.id,
        userId: input.userId,
        roleKey: input.roleKey,
        expiresAt: input.expiresAt,
      }),
  });

  return claim.allowed
    ? { allowed: true, collaborator: claim.value }
    : {
        allowed: false,
        limit: claim.limit,
        activeViewers: claim.activeViewers,
        entitlements: claim.entitlements,
      };
}

export type ViewerLinkEntitlementResult =
  | { allowed: true; entitlements: ResolvedOrganizationEntitlements }
  | {
      allowed: false;
      limit: number;
      activeViewers: number;
      entitlements: ResolvedOrganizationEntitlements;
    };

/** Reject viewer links that cannot currently be redeemed; redemption reclaims atomically. */
export async function checkViewerLinkEntitlement(input: {
  store: ApiStore;
  organizationId: string;
}): Promise<ViewerLinkEntitlementResult> {
  return input.store.withSerializedMutation(`plan-viewers:${input.organizationId}`, async () => {
    const entitlements = await resolveOrganizationEntitlements(input.store, input.organizationId);
    if (entitlements.viewers === null) {
      return { allowed: true, entitlements };
    }
    const activeViewerUserIds = await input.store.listActiveOrganizationViewerUserIds(input.organizationId);
    if (activeViewerUserIds.length >= entitlements.viewers) {
      return {
        allowed: false,
        limit: entitlements.viewers,
        activeViewers: activeViewerUserIds.length,
        entitlements,
      };
    }
    return { allowed: true, entitlements };
  });
}

export const PLAN_EGRESS_USAGE_TYPE = 'deployment.egressMib' as const;

export type DeploymentPlanEntitlementsPin = ReleasePlanEntitlementsPin;

function normalizedRegions(regions: readonly string[]): string[] {
  return [...new Set(regions.map(normalizeRegion).filter((region): region is string => region !== null))].sort();
}

/**
 * Resolve the immutable policy attached to a newly-created deployment. The
 * caller must pass only regions its real provider adapter can deploy to.
 */
export function resolveDeploymentPlanEntitlementsPin(input: {
  entitlements: ResolvedOrganizationEntitlements;
  providerSupportedRegions: readonly string[];
  requestedRegion?: string;
  removeBrandingBadge?: boolean;
}): DeploymentPlanEntitlementsPin {
  const supported = normalizedRegions(input.providerSupportedRegions);
  if (supported.length === 0) {
    throw Object.assign(new Error(), { code: 'PUBLISH_REGION_OPERATOR_REQUIRED' });
  }

  if (input.removeBrandingBadge && !input.entitlements.badgeRemovable) {
    throw Object.assign(new Error(), { code: 'PUBLISH_BADGE_REQUIRED' });
  }

  const requested = input.requestedRegion ? normalizeRegion(input.requestedRegion) : supported[0];
  if (!requested || !supported.includes(requested)) {
    throw Object.assign(new Error(), { code: 'PUBLISH_REGION_UNAVAILABLE' });
  }

  if (input.entitlements.publishRegions === 'single' && requested !== supported[0]) {
    throw Object.assign(new Error(), { code: 'PUBLISH_REGION_PLAN_RESTRICTED' });
  }

  if (
    input.entitlements.publishRegions === 'custom' &&
    !input.entitlements.customPublishRegions.includes(requested)
  ) {
    throw Object.assign(new Error(), { code: 'PUBLISH_REGION_OPERATOR_REQUIRED' });
  }

  return {
    version: PLAN_ENTITLEMENTS_VERSION,
    plan: input.entitlements.plan,
    badgeRequired: !(input.removeBrandingBadge ?? false),
    publishRegion: requested,
    publishRegions: input.entitlements.publishRegions,
  };
}

/** Read only this contract version; unknown/corrupt metadata never escalates. */
export function readDeploymentPlanEntitlementsPin(metadata: unknown): DeploymentPlanEntitlementsPin | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const pin = (metadata as { planEntitlements?: unknown }).planEntitlements;
  if (!pin || typeof pin !== 'object' || Array.isArray(pin)) {
    return null;
  }
  return parseReleasePlanEntitlementsPin(pin) ?? null;
}

export interface PlanEgressClaim {
  reference: string;
  deploymentKind: 'autoscale' | 'scheduled' | 'static' | 'reserved-vm';
  requestHash: string;
  periodStart: string;
  observedMib: number;
  includedMib: number;
  billableMib: number;
  billableEgressGib: number;
  entitlementsVersion: string;
  plan: PlanEntitlements['plan'];
  deduplicated: boolean;
}

function metadataEgressClaim(event: { metadata?: unknown }): PlanEgressClaim | null {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const candidate = metadata as Partial<PlanEgressClaim>;
  const { observedMib, includedMib, billableMib } = candidate;
  if (
    typeof candidate.reference !== 'string' ||
    !['autoscale', 'scheduled', 'static', 'reserved-vm'].includes(candidate.deploymentKind ?? '') ||
    typeof candidate.requestHash !== 'string' ||
    typeof candidate.periodStart !== 'string' ||
    typeof observedMib !== 'number' ||
    !Number.isSafeInteger(observedMib) ||
    typeof includedMib !== 'number' ||
    !Number.isSafeInteger(includedMib) ||
    typeof billableMib !== 'number' ||
    !Number.isSafeInteger(billableMib) ||
    typeof candidate.entitlementsVersion !== 'string' ||
    !['starter', 'core', 'pro', 'enterprise'].includes(candidate.plan ?? '')
  ) {
    return null;
  }
  return {
    reference: candidate.reference,
    deploymentKind: candidate.deploymentKind as PlanEgressClaim['deploymentKind'],
    requestHash: candidate.requestHash,
    periodStart: candidate.periodStart,
    observedMib,
    includedMib,
    billableMib,
    billableEgressGib: billableMib / 1_024,
    entitlementsVersion: candidate.entitlementsVersion,
    plan: candidate.plan as PlanEntitlements['plan'],
    deduplicated: true,
  };
}

/**
 * Atomically claim observed deployment egress against the monthly plan
 * allowance. PostgreSQL clock_timestamp() defines the month, and the advisory
 * lock serializes the sum+append across API clients and pods.
 */
export async function claimPlanEgressAllowance(input: {
  store: ApiStore;
  organizationId: string;
  egressGib: number;
  reference: string;
  deploymentKind: PlanEgressClaim['deploymentKind'];
}): Promise<PlanEgressClaim> {
  const reference = input.reference.trim();
  if (!reference || !Number.isFinite(input.egressGib) || input.egressGib < 0) {
    throw Object.assign(new Error(), { code: 'PLAN_EGRESS_CLAIM_INVALID' });
  }
  const newlyObservedMib = Math.ceil(input.egressGib * 1_024);
  if (!Number.isSafeInteger(newlyObservedMib)) {
    throw Object.assign(new Error(), { code: 'PLAN_EGRESS_CLAIM_INVALID' });
  }

  return input.store.withSerializedMutation(`plan-egress:${input.organizationId}`, async () => {
    const clock = await input.store.getDatabaseClock();
    const periodStart = new Date(clock.monthStart);
    if (Number.isNaN(periodStart.getTime())) {
      throw Object.assign(new Error(), { code: 'DATABASE_TIME_UNAVAILABLE' });
    }

    const existing = await input.store.findUsageEventByReference({
      organizationId: input.organizationId,
      type: PLAN_EGRESS_USAGE_TYPE,
      reference,
      since: periodStart,
    });
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          organizationId: input.organizationId,
          reference,
          deploymentKind: input.deploymentKind,
          observedMib: newlyObservedMib,
          periodStart: periodStart.toISOString(),
        }),
      )
      .digest('hex');
    if (existing) {
      const claim = metadataEgressClaim(existing);
      if (!claim) {
        throw Object.assign(new Error(), { code: 'PLAN_EGRESS_CLAIM_CORRUPT' });
      }
      if (claim.requestHash !== requestHash) {
        throw Object.assign(new Error(), { code: 'PLAN_EGRESS_IDEMPOTENCY_CONFLICT', statusCode: 409 });
      }
      return claim;
    }

    const entitlements = await resolveOrganizationEntitlements(input.store, input.organizationId);

    const previouslyObservedMib = await input.store.sumUsage(
      input.organizationId,
      PLAN_EGRESS_USAGE_TYPE,
      periodStart,
    );
    const split = splitEgressAllowance({
      previouslyObservedMib,
      newlyObservedMib,
      includedEgressMib: entitlements.includedEgressMib,
    });
    const claim: PlanEgressClaim = {
      reference,
      deploymentKind: input.deploymentKind,
      requestHash,
      periodStart: periodStart.toISOString(),
      ...split,
      billableEgressGib: split.billableMib / 1_024,
      entitlementsVersion: entitlements.version,
      plan: entitlements.plan,
      deduplicated: false,
    };
    await input.store.recordUsageEvent({
      organizationId: input.organizationId,
      type: PLAN_EGRESS_USAGE_TYPE,
      quantity: split.observedMib,
      metadata: claim,
    });
    return claim;
  });
}
