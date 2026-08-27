import type { EntitlementPlanKey } from './starter-entitlements.js';

/**
 * Server-authoritative plan entitlements.
 *
 * This contract is deliberately separate from pricing-page copy. A deployment
 * pins {@link PLAN_ENTITLEMENTS_VERSION} so a later catalog edit cannot silently
 * change the policy of an already-created release.
 */
export const PLAN_ENTITLEMENTS_VERSION = '2026-08-27.1' as const;

export type PublishRegionEntitlement = 'single' | 'all' | 'custom';

export type EnterpriseCapability =
  | 'single-tenant'
  | 'static-outbound-ip'
  | 'vpc-peering'
  | 'data-warehouse'
  | 'security-center';

export interface PlanIdentity {
  /** Persisted plan key. `pro` is ambiguous until its price is checked. */
  key: string | null | undefined;
  /** Persisted monthly price in integer USD cents. */
  monthlyCents: number | null | undefined;
}

export interface PlanEntitlements {
  version: typeof PLAN_ENTITLEMENTS_VERSION;
  plan: EntitlementPlanKey;
  /** Distinct active read-only viewers across the organization; null = unlimited. */
  viewers: number | null;
  /** Maximum fan-out for one Agent request. */
  parallelAgents: number;
  badgeRemovable: boolean;
  publishRegions: PublishRegionEntitlement;
  /** Whether org administrators may configure canonical per-user spend caps. */
  perUserSpendLimits: boolean;
  /** Monthly included deployment egress in MiB; null means no published allowance. */
  includedEgressMib: number | null;
  enterpriseCapabilities: readonly EnterpriseCapability[];
}

/**
 * Prices are part of the identity while legacy and credit catalogs coexist.
 * In particular, `pro@2900` is legacy Core and `pro@10000` is the new Pro.
 * Any key/price mismatch is an unknown plan and therefore resolves to Starter.
 */
const PLAN_IDENTITIES: ReadonlyArray<{
  key: string;
  monthlyCents: number;
  plan: EntitlementPlanKey;
}> = [
  { key: 'free', monthlyCents: 0, plan: 'starter' },
  { key: 'starter', monthlyCents: 0, plan: 'starter' },
  { key: 'pro', monthlyCents: 2_900, plan: 'core' },
  { key: 'core', monthlyCents: 2_500, plan: 'core' },
  { key: 'team', monthlyCents: 9_900, plan: 'pro' },
  { key: 'pro', monthlyCents: 10_000, plan: 'pro' },
  { key: 'enterprise', monthlyCents: 0, plan: 'enterprise' },
];

const ALL_ENTERPRISE_CAPABILITIES: readonly EnterpriseCapability[] = [
  'single-tenant',
  'static-outbound-ip',
  'vpc-peering',
  'data-warehouse',
  'security-center',
];

const DEFINITIONS: Readonly<Record<EntitlementPlanKey, PlanEntitlements>> = {
  starter: {
    version: PLAN_ENTITLEMENTS_VERSION,
    plan: 'starter',
    viewers: 0,
    parallelAgents: 1,
    badgeRemovable: false,
    publishRegions: 'single',
    perUserSpendLimits: false,
    includedEgressMib: 10 * 1_024,
    enterpriseCapabilities: [],
  },
  core: {
    version: PLAN_ENTITLEMENTS_VERSION,
    plan: 'core',
    viewers: 0,
    parallelAgents: 2,
    badgeRemovable: true,
    publishRegions: 'all',
    perUserSpendLimits: false,
    includedEgressMib: 100 * 1_024,
    enterpriseCapabilities: [],
  },
  pro: {
    version: PLAN_ENTITLEMENTS_VERSION,
    plan: 'pro',
    viewers: 50,
    parallelAgents: 10,
    badgeRemovable: true,
    publishRegions: 'all',
    perUserSpendLimits: false,
    // No contractual Pro allowance is published. Do not invent one.
    includedEgressMib: null,
    enterpriseCapabilities: [],
  },
  enterprise: {
    version: PLAN_ENTITLEMENTS_VERSION,
    plan: 'enterprise',
    viewers: null,
    // Conservative contract default. An explicit operator override may lower it.
    parallelAgents: 10,
    badgeRemovable: true,
    publishRegions: 'custom',
    perUserSpendLimits: true,
    // Contract-specific; absence means no included allowance, never an implicit cap.
    includedEgressMib: null,
    enterpriseCapabilities: ALL_ENTERPRISE_CAPABILITIES,
  },
};

export const MAX_SUPPORTED_PARALLEL_AGENTS = 10;

function normalizedPlanKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function validMonthlyCents(value: number | null | undefined): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Resolve a persisted key+price without ever escalating an unknown identity. */
export function resolvePlanEntitlementKey(identity: PlanIdentity): EntitlementPlanKey {
  const key = normalizedPlanKey(identity.key);
  if (!validMonthlyCents(identity.monthlyCents)) {
    return 'starter';
  }
  return (
    PLAN_IDENTITIES.find(
      (candidate) => candidate.key === key && candidate.monthlyCents === identity.monthlyCents,
    )?.plan ?? 'starter'
  );
}

export interface EntitlementOverrides {
  /** Enterprise-only, explicitly configured by an operator. */
  enterpriseParallelAgents?: number | null;
}

/** Return an immutable-value snapshot suitable for API responses and release metadata. */
export function resolvePlanEntitlements(
  identity: PlanIdentity,
  overrides: EntitlementOverrides = {},
): PlanEntitlements {
  const plan = resolvePlanEntitlementKey(identity);
  const definition = DEFINITIONS[plan];
  let parallelAgents = definition.parallelAgents;

  if (
    plan === 'enterprise' &&
    Number.isSafeInteger(overrides.enterpriseParallelAgents) &&
    (overrides.enterpriseParallelAgents as number) >= 1 &&
    (overrides.enterpriseParallelAgents as number) <= MAX_SUPPORTED_PARALLEL_AGENTS
  ) {
    parallelAgents = overrides.enterpriseParallelAgents as number;
  }

  return {
    ...definition,
    parallelAgents,
    enterpriseCapabilities: [...definition.enterpriseCapabilities],
  };
}

/** Strict fallback for lookup failures and deployments created before pinning existed. */
export function starterPlanEntitlements(): PlanEntitlements {
  return resolvePlanEntitlements({ key: 'starter', monthlyCents: 0 });
}

export interface EgressAllowanceSplit {
  observedMib: number;
  includedMib: number;
  billableMib: number;
}

/**
 * Split a newly observed egress quantity against already-observed monthly usage.
 * Inputs are integer MiB so concurrent claims never drift through floating point.
 */
export function splitEgressAllowance(input: {
  previouslyObservedMib: number;
  newlyObservedMib: number;
  includedEgressMib: number | null;
}): EgressAllowanceSplit {
  const previouslyObservedMib = Number.isSafeInteger(input.previouslyObservedMib)
    ? Math.max(0, input.previouslyObservedMib)
    : 0;
  const observedMib = Number.isSafeInteger(input.newlyObservedMib)
    ? Math.max(0, input.newlyObservedMib)
    : 0;
  const allowance = input.includedEgressMib;

  if (allowance === null || !Number.isSafeInteger(allowance) || allowance < 0) {
    return { observedMib, includedMib: 0, billableMib: observedMib };
  }

  const remainingIncludedMib = Math.max(0, allowance - previouslyObservedMib);
  const includedMib = Math.min(observedMib, remainingIncludedMib);
  return {
    observedMib,
    includedMib,
    billableMib: observedMib - includedMib,
  };
}
