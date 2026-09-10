/**
 * Multi-tenant anti-abuse guardrails (P0-A2-14, "Cloud Run multi-tenant incomplet").
 *
 * The refusal on this point was precise: the named multi-tenant contracts and
 * thresholds did not exist. This module defines them, pure and IO-free so every
 * threshold is unit-testable:
 *
 *   - `ReputationTier`          — trust level a tenant has earned.
 *   - `ReputationTierPolicy`    — the caps, burst limits, isolation folder and
 *                                 billing account that each tier maps to.
 *   - `BillingAccountBinding`   — the required link between a tenant and a
 *                                 billing account before it may consume.
 *   - `AbuseThresholds`         — named multi-tenant creation-rate ceilings.
 *   - `evaluateTenantAdmission` — the single decision function the API calls.
 *
 * Two VERIFIED public claims anchor the numbers (docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml):
 *   - GCP-14: folders separating first-party code from untrusted tenant code are
 *     MANDATORY, and a DIFFERENT billing account per reputation tier is the
 *     documented abuse control.
 *   - GCP-15: Cloud Run allows 1000 services / 1000 jobs / 1000 worker pools per
 *     project per region — this is what sizes the sharding, see capacity-policy.ts.
 *
 * Deliberately NO new database table: the tier is DERIVED from state the platform
 * already persists (email verification, BillingCustomer, subscription status,
 * moderation strikes, AbuseEvent history). Reusing the existing truth keeps the
 * contract honest — there is no second copy of "is this tenant trustworthy" to
 * drift out of sync.
 */

import type { AbuseSignal } from '@vibecore/security';

/**
 * Trust level a tenant has earned. Ordered least → most trusted; the numeric rank
 * is what comparisons use, so inserting a tier later does not silently reorder.
 */
export type ReputationTier = 'UNTRUSTED' | 'BASIC' | 'VERIFIED' | 'TRUSTED' | 'FIRST_PARTY';

export const REPUTATION_TIER_RANK: Readonly<Record<ReputationTier, number>> = Object.freeze({
  UNTRUSTED: 0,
  BASIC: 1,
  VERIFIED: 2,
  TRUSTED: 3,
  FIRST_PARTY: 4,
});

/**
 * GCP-14 mandates separating first-party code from untrusted tenant code into
 * different folders. This is the folder class a tier's workloads land in.
 */
export type IsolationFolder = 'first-party' | 'untrusted';

/** Actions that consume real, billable multi-tenant capacity. */
export type GuardedAction = 'project.create' | 'deployment.create' | 'workspace.start';

export const GUARDED_ACTIONS: readonly GuardedAction[] = Object.freeze([
  'project.create',
  'deployment.create',
  'workspace.start',
]);

/**
 * Per-tier ceilings. These are ANTI-ABUSE ceilings, not plan entitlements: the
 * billing plan quota (`assertQuota`, packages/billing) still applies on top, and
 * the EFFECTIVE limit is the lower of the two. A paid plan does not buy a way
 * around the untrusted-tier burst limit, and a generous tier does not grant
 * capacity the plan did not sell.
 */
export interface ReputationTierPolicy {
  tier: ReputationTier;

  /** GCP-14: which isolation folder this tier's workloads run in. */
  isolationFolder: IsolationFolder;

  /**
   * GCP-14: a DIFFERENT billing account per reputation tier, so abuse on the
   * untrusted tier cannot bill against the trusted tier's account.
   */
  billingAccountKey: string;

  /**
   * Actions this tier may NOT perform without a usable billing account binding.
   *
   * Deliberately per-action, not a single boolean: requiring a card before a
   * tenant can create its first project would kill try-before-you-buy, while
   * letting an unbound tenant PUBLISH to the public internet is the exact abuse
   * vector this point exists to close. So trying is free; shipping needs a
   * billing account behind it.
   */
  bindingRequiredFor: readonly GuardedAction[];

  /** Lifetime project ceiling for the tier (anti-abuse, not the plan quota). */
  maxProjects: number;

  /** Concurrent running workspaces the tier may hold. */
  maxConcurrentWorkspaces: number;

  /** Rolling-window creation ceilings — the burst wall. */
  projectCreatesPerHour: number;
  deploymentCreatesPerHour: number;
  workspaceStartsPerHour: number;
}

/** Sentinel for "no anti-abuse ceiling at this tier" (first-party only). */
export const UNLIMITED_TIER_CAP = 1_000_000;

/**
 * The named thresholds. An untrusted (unverified, unbound) tenant gets a small
 * allowance so the product is still try-before-you-buy, then hits a wall; every
 * step up requires the tenant to have proven something real.
 */
export const REPUTATION_TIER_POLICIES: Readonly<Record<ReputationTier, ReputationTierPolicy>> = Object.freeze({
  UNTRUSTED: Object.freeze({
    tier: 'UNTRUSTED',
    isolationFolder: 'untrusted',
    billingAccountKey: 'billing-untrusted',
    // Nothing to gate on a binding here: deployment is flatly denied below.
    bindingRequiredFor: Object.freeze([]),
    maxProjects: 2,
    maxConcurrentWorkspaces: 1,
    projectCreatesPerHour: 2,
    // An unverified account may NOT publish to the public internet, at any price.
    // Throwaway-account phishing deploys are the primary abuse vector here.
    deploymentCreatesPerHour: 0,
    workspaceStartsPerHour: 5,
  }),
  BASIC: Object.freeze({
    tier: 'BASIC',
    isolationFolder: 'untrusted',
    billingAccountKey: 'billing-untrusted',
    // Verified email, but no billing account yet: build freely, bind to publish.
    bindingRequiredFor: Object.freeze(['deployment.create' as GuardedAction]),
    maxProjects: 10,
    maxConcurrentWorkspaces: 2,
    projectCreatesPerHour: 10,
    deploymentCreatesPerHour: 2,
    workspaceStartsPerHour: 20,
  }),
  VERIFIED: Object.freeze({
    tier: 'VERIFIED',
    isolationFolder: 'untrusted',
    billingAccountKey: 'billing-verified',
    bindingRequiredFor: Object.freeze([]),
    maxProjects: 100,
    maxConcurrentWorkspaces: 10,
    projectCreatesPerHour: 30,
    deploymentCreatesPerHour: 20,
    workspaceStartsPerHour: 60,
  }),
  TRUSTED: Object.freeze({
    tier: 'TRUSTED',
    isolationFolder: 'untrusted',
    billingAccountKey: 'billing-trusted',
    bindingRequiredFor: Object.freeze([]),
    maxProjects: 1000,
    maxConcurrentWorkspaces: 50,
    projectCreatesPerHour: 100,
    deploymentCreatesPerHour: 100,
    workspaceStartsPerHour: 200,
  }),
  FIRST_PARTY: Object.freeze({
    tier: 'FIRST_PARTY',
    isolationFolder: 'first-party',
    billingAccountKey: 'billing-first-party',
    bindingRequiredFor: Object.freeze([]),
    maxProjects: UNLIMITED_TIER_CAP,
    maxConcurrentWorkspaces: UNLIMITED_TIER_CAP,
    projectCreatesPerHour: UNLIMITED_TIER_CAP,
    deploymentCreatesPerHour: UNLIMITED_TIER_CAP,
    workspaceStartsPerHour: UNLIMITED_TIER_CAP,
  }),
});

export function policyForTier(tier: ReputationTier): ReputationTierPolicy {
  return REPUTATION_TIER_POLICIES[tier] ?? REPUTATION_TIER_POLICIES.UNTRUSTED;
}

/* -------------------------------------------------------------------------- */
/* BillingAccountBinding                                                       */
/* -------------------------------------------------------------------------- */

/**
 * State of the tenant → billing account link.
 *  - UNBOUND:    no billing customer exists yet.
 *  - BOUND:      a billing customer exists and is in good standing.
 *  - DELINQUENT: bound, but payment failed — treated as NOT usable for new spend.
 *  - REVOKED:    binding withdrawn (chargeback, fraud, manual action).
 */
export type BillingAccountBindingState = 'UNBOUND' | 'BOUND' | 'DELINQUENT' | 'REVOKED';

export interface BillingAccountBinding {
  organizationId: string;
  state: BillingAccountBindingState;

  /** Payment provider ('stripe') — from the existing BillingCustomer row. */
  provider?: string;

  /** Provider-side customer id — from the existing BillingCustomer row. */
  externalId?: string;

  /** GCP-14: which billing account this tenant's spend lands on. */
  billingAccountKey: string;

  boundAt?: Date;
}

/** Only a BOUND binding may fund new consumption. */
export function isBindingUsable(binding: BillingAccountBinding | undefined): boolean {
  return binding?.state === 'BOUND';
}

/**
 * Build the binding from the platform's EXISTING billing-customer record.
 * `null`/`undefined` customer → UNBOUND. No new persistence.
 */
export function resolveBillingAccountBinding(input: {
  organizationId: string;
  tier: ReputationTier;
  customer?: { provider?: string; externalId?: string; createdAt?: Date } | null;
  delinquent?: boolean;
  revoked?: boolean;
}): BillingAccountBinding {
  const billingAccountKey = policyForTier(input.tier).billingAccountKey;

  if (input.revoked) {
    return { organizationId: input.organizationId, state: 'REVOKED', billingAccountKey };
  }

  if (!input.customer?.externalId) {
    return { organizationId: input.organizationId, state: 'UNBOUND', billingAccountKey };
  }

  return {
    organizationId: input.organizationId,
    state: input.delinquent ? 'DELINQUENT' : 'BOUND',
    provider: input.customer.provider,
    externalId: input.customer.externalId,
    billingAccountKey,
    boundAt: input.customer.createdAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Reputation derivation                                                       */
/* -------------------------------------------------------------------------- */

export interface ReputationSignals {
  /** Platform-owned tenant (demo, gallery, internal). Wins over everything. */
  firstParty?: boolean;

  emailVerified?: boolean;

  /** A usable billing account binding exists. */
  billingAccountBound?: boolean;

  /** A subscription in an active/trialing state. */
  subscriptionActive?: boolean;

  accountAgeDays?: number;

  /** Active moderation strikes (services/api/src/strike-system.ts). */
  activeStrikes?: number;

  /** AbuseEvent rows of severity high/critical in the recent window. */
  recentSevereAbuseEvents?: number;
}

/**
 * Paid + this old ⇒ eligible for TRUSTED.
 *
 * Note there is deliberately NO age gate below TRUSTED. Gating BASIC on account
 * age would cap every legitimate day-one signup at the UNTRUSTED ceiling of 2
 * projects, which breaks onboarding for real users while barely inconveniencing
 * an attacker (who just waits a day). The wall that actually stops abuse is the
 * billing-account binding on publish, not the calendar.
 */
export const MIN_ACCOUNT_AGE_DAYS_FOR_TRUSTED = 30;

/**
 * Derive the tier from signals the platform already stores. Ordered, deterministic,
 * and DEMOTION WINS: a strike or a severe abuse event drops a tenant to UNTRUSTED
 * no matter how much it pays. That ordering is the whole point — otherwise the
 * cheapest way past the guardrails is a credit card.
 */
export function deriveReputationTier(signals: ReputationSignals): ReputationTier {
  if (signals.firstParty) {
    return 'FIRST_PARTY';
  }

  if ((signals.activeStrikes ?? 0) > 0 || (signals.recentSevereAbuseEvents ?? 0) > 0) {
    return 'UNTRUSTED';
  }

  if (!signals.emailVerified) {
    return 'UNTRUSTED';
  }

  const ageDays = signals.accountAgeDays ?? 0;

  if (!signals.billingAccountBound) {
    return 'BASIC';
  }

  if (signals.subscriptionActive && ageDays >= MIN_ACCOUNT_AGE_DAYS_FOR_TRUSTED) {
    return 'TRUSTED';
  }

  return 'VERIFIED';
}

/* -------------------------------------------------------------------------- */
/* Admission decision                                                          */
/* -------------------------------------------------------------------------- */

export type TenantAdmissionCode =
  | 'BILLING_ACCOUNT_REQUIRED'
  | 'BILLING_ACCOUNT_DELINQUENT'
  | 'BILLING_ACCOUNT_REVOKED'
  | 'TENANT_CAP_EXCEEDED'
  | 'TENANT_BURST_EXCEEDED';

export interface TenantAdmissionDecision {
  allowed: boolean;
  tier: ReputationTier;
  policy: ReputationTierPolicy;

  /** Machine-readable refusal code; absent when allowed. */
  code?: TenantAdmissionCode;

  /** HTTP status the API should answer with; absent when allowed. */
  statusCode?: number;

  reason?: string;

  /** Populated when the refusal is also an abuse signal worth recording. */
  abuseSignal?: AbuseSignal;
}

export interface TenantAdmissionInput {
  action: GuardedAction;
  tier: ReputationTier;
  binding: BillingAccountBinding;

  /** Current totals for the tenant. */
  usage: {
    projects?: number;
    concurrentWorkspaces?: number;
  };

  /** Creations inside the trailing hour, per action. */
  recentCreates?: Partial<Record<GuardedAction, number>>;

  /** Escape hatch for support: an explicit, audited override of the burst wall. */
  overrideActive?: boolean;
}

const CAP_FOR_ACTION: Record<GuardedAction, (p: ReputationTierPolicy) => number> = {
  'project.create': (p) => p.maxProjects,
  'deployment.create': () => UNLIMITED_TIER_CAP, // deployments are burst-limited, not lifetime-capped
  'workspace.start': (p) => p.maxConcurrentWorkspaces,
};

const BURST_FOR_ACTION: Record<GuardedAction, (p: ReputationTierPolicy) => number> = {
  'project.create': (p) => p.projectCreatesPerHour,
  'deployment.create': (p) => p.deploymentCreatesPerHour,
  'workspace.start': (p) => p.workspaceStartsPerHour,
};

const USAGE_FOR_ACTION: Record<GuardedAction, (u: TenantAdmissionInput['usage']) => number> = {
  'project.create': (u) => u.projects ?? 0,
  'deployment.create': () => 0,
  'workspace.start': (u) => u.concurrentWorkspaces ?? 0,
};

const BURST_ABUSE_TYPE: Partial<Record<GuardedAction, AbuseSignal['type']>> = {
  'project.create': 'project_creation_spike',
  'deployment.create': 'deployment_creation_spike',
  'workspace.start': 'workspace_creation_spike',
};

/**
 * The single decision the API asks before letting a tenant consume capacity.
 *
 * Fail-CLOSED by construction: every branch that cannot prove the tenant is
 * entitled returns `allowed: false`. Callers decide whether to enforce or merely
 * observe the decision (see TENANT_GUARDRAILS_ENABLED in app.ts) — this function
 * never softens its own verdict.
 */
export function evaluateTenantAdmission(input: TenantAdmissionInput): TenantAdmissionDecision {
  const policy = policyForTier(input.tier);
  const base = { tier: input.tier, policy };

  // 1. Billing account binding — a revoked binding is terminal, override or not.
  if (input.binding.state === 'REVOKED') {
    return {
      ...base,
      allowed: false,
      code: 'BILLING_ACCOUNT_REVOKED',
      statusCode: 403,
      reason: 'billing account binding revoked',
    };
  }

  if (input.binding.state === 'DELINQUENT') {
    return {
      ...base,
      allowed: false,
      code: 'BILLING_ACCOUNT_DELINQUENT',
      statusCode: 402,
      reason: 'billing account is delinquent; settle the outstanding balance to resume',
    };
  }

  if (policy.bindingRequiredFor.includes(input.action) && !isBindingUsable(input.binding)) {
    return {
      ...base,
      allowed: false,
      code: 'BILLING_ACCOUNT_REQUIRED',
      statusCode: 402,
      reason: `tier ${input.tier} requires a bound billing account before consuming ${input.action}`,
    };
  }

  // 2. Lifetime / concurrency ceiling for the tier.
  const cap = CAP_FOR_ACTION[input.action](policy);
  const used = USAGE_FOR_ACTION[input.action](input.usage);

  if (used + 1 > cap) {
    return {
      ...base,
      allowed: false,
      code: 'TENANT_CAP_EXCEEDED',
      statusCode: 429,
      reason: `tier ${input.tier} allows at most ${cap} for ${input.action} (currently ${used})`,
    };
  }

  // 3. Burst wall. An explicit, audited override may lift THIS wall only —
  //    it can never lift the binding checks above.
  const burstCap = BURST_FOR_ACTION[input.action](policy);
  const recent = input.recentCreates?.[input.action] ?? 0;

  if (!input.overrideActive && recent + 1 > burstCap) {
    const abuseType = BURST_ABUSE_TYPE[input.action];

    return {
      ...base,
      allowed: false,
      code: 'TENANT_BURST_EXCEEDED',
      statusCode: 429,
      reason: `tier ${input.tier} allows at most ${burstCap} ${input.action} per hour (${recent} in the last hour)`,
      abuseSignal: abuseType
        ? {
            type: abuseType,
            severity: 'high',
            action: 'throttle',
            reason: `${input.action} burst above tier ${input.tier} ceiling (${recent}/${burstCap} per hour)`,
          }
        : undefined,
    };
  }

  return { ...base, allowed: true };
}

/**
 * Throwing wrapper matching the house error shape (`statusCode` + `code` on an
 * Error, same as packages/billing `assertQuota`), so route handlers can call it
 * next to `ensureQuota` without a second error convention.
 */
export function assertTenantAdmission(input: TenantAdmissionInput): TenantAdmissionDecision {
  const decision = evaluateTenantAdmission(input);

  if (!decision.allowed) {
    throw Object.assign(new Error(decision.reason ?? 'tenant admission refused'), {
      statusCode: decision.statusCode ?? 429,
      code: decision.code,
      tier: decision.tier,
      action: input.action,
    });
  }

  return decision;
}
