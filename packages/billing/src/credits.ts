/**
 * Credit-wallet + effort-based metering primitives (Replit parity).
 *
 * Pure, dependency-free functions so they can be unit-tested in isolation and
 * reused by both `services/api` (settlement) and the agent UI (cost preview).
 * No DB, no Stripe — those live in the store / gateway layers. See
 * docs/REPLIT_PARITY_SPEC.md §5–§7.
 *
 * Money is always integer **USD cents**. A "credit" == 1 USD cent so balances,
 * grants and charges share one unit and never drift through float conversion.
 */

/** Target plan keys for the Replit-parity model. */
export type CreditPlanKey = 'starter' | 'core' | 'pro' | 'enterprise';

/**
 * Default platform margin applied on top of the raw provider token cost so the
 * credits charged to a user always cover Avi's real AI spend. Overridable via
 * the `AI_MARGIN` env var at the call site (parsed by the caller, passed in).
 */
export const DEFAULT_AI_MARGIN = 0.3;

/**
 * Pre-flight estimate multipliers for the per-request power controls. These
 * only inflate the *reservation* estimate (so we don't let a request start that
 * we can't pay for); the final charge is always reconciled from real usage.
 */
export const HIGH_POWER_ESTIMATE_MULTIPLIER = 4;
export const EXTENDED_THINKING_ESTIMATE_MULTIPLIER = 2.5;

export interface PlanCreditConfig {
  /** Monthly credit grant in cents (0 for Starter, which grants daily instead). */
  monthlyCreditCents: number;
  /** Daily credit grant in cents (Starter free tier; 0 for paid plans). */
  dailyCreditCents: number;
  /** Whether unused credits roll over to the next period (false = Starter). */
  rollover: boolean;
}

/**
 * Included-credit configuration per plan. Enterprise defaults to 0 and is
 * expected to be overridden per-contract via a QuotaOverride-style grant.
 *
 * Replit parity (sources, verified 2026-06-17):
 *  - https://replit.com/pricing and https://docs.replit.com/billing/plans/starter-plan:
 *    the Starter (free) plan grants **"Free daily Agent credits"** that **reset
 *    daily** (no rollover), up to a monthly cap. Replit does NOT publish a
 *    precise dollar figure for the Starter daily/monthly credit amount.
 *  - The only published dollar anchor is **Core = "$25 of monthly credits"**
 *    (modelled below as `core.monthlyCreditCents = 2500`), and Pro = $100/mo.
 * So Starter mirrors the *model* exactly — `dailyCreditCents` + `rollover:false`
 * (daily reset, no carryover) — and we set the amount to **25¢/day** (≈ $7.50/mo
 * of daily credits, "enough to experiment but you hit limits quickly", which is
 * how Replit describes the free tier). This is the official-closest value; if
 * Replit later publishes an exact Starter figure, change ONLY this number.
 */
export const planCreditConfig: Record<CreditPlanKey, PlanCreditConfig> = {
  starter: { monthlyCreditCents: 0, dailyCreditCents: 25, rollover: false },
  core: { monthlyCreditCents: 2500, dailyCreditCents: 0, rollover: true },
  pro: { monthlyCreditCents: 10_000, dailyCreditCents: 0, rollover: true },
  enterprise: { monthlyCreditCents: 0, dailyCreditCents: 0, rollover: true },
};

/**
 * Normalize a plan key in the **new** (post-cutover) world. Target keys pass
 * through; the unambiguously-legacy keys `free`/`team` (which have no new-world
 * meaning) are folded to their target. NOTE: `pro` resolves to the NEW pro
 * ($100) here — a legacy `pro` ($29) row must go through `migrateLegacyPlanKey`
 * during the one-time backfill, not this function.
 */
export function toCreditPlanKey(key: string | undefined): CreditPlanKey {
  switch (key) {
    case 'starter':
    case 'core':
    case 'pro':
    case 'enterprise':
      return key;
    case 'free':
      return 'starter';
    case 'team':
      return 'pro';
    default:
      return 'starter';
  }
}

/**
 * One-time legacy → Replit-parity migration mapping, used by the P7 backfill
 * that renames existing subscriptions. Distinct from `toCreditPlanKey` because
 * the legacy `pro` ($29) maps to the new `core` ($25), whereas in the new world
 * `pro` means $100. See docs/REPLIT_PARITY_SPEC.md §2.A.
 */
export function migrateLegacyPlanKey(legacyKey: string | undefined): CreditPlanKey {
  switch (legacyKey) {
    case 'free':
      return 'starter';
    case 'pro':
      return 'core';
    case 'team':
      return 'pro';
    case 'enterprise':
      return 'enterprise';
    // Already a new-world key (or unknown) → normalize.
    default:
      return toCreditPlanKey(legacyKey);
  }
}

/**
 * Whether an org's plan may use the **premium agent modes** — Turbo and the
 * high-power model — which Replit reserves for paid plans (the free/Starter tier
 * cannot use them). Extended-thinking / High-Effort is NOT gated here (it's
 * available on all plans).
 *
 * This key-only compatibility helper is intentionally fail-closed. Authoritative
 * server paths must use `resolvePlanEntitlements`, which disambiguates legacy
 * `pro@2900` from credit-catalog `pro@10000` using the persisted monthly price.
 */
export function premiumAgentModesEligible(planKey: string | undefined | null): boolean {
  const key = (planKey ?? '').trim().toLowerCase();
  return key === 'core' || key === 'pro' || key === 'team' || key === 'enterprise';
}

/**
 * Apply {@link premiumAgentModesEligible} to a per-request power-controls object:
 * when the plan is ineligible, strip `turboMode` + `highPowerModel` (leaving the
 * build tier + extended-thinking untouched) and report whether anything was
 * stripped so the caller can surface an upsell. Pure; never throws.
 */
export function gatePremiumAgentModes<
  T extends { turboMode?: boolean; highPowerModel?: boolean },
>(modes: T, planKey: string | undefined | null): { modes: T; gated: boolean } {
  if (premiumAgentModesEligible(planKey)) {
    return { modes, gated: false };
  }

  const gated = Boolean(modes.turboMode || modes.highPowerModel);
  return { modes: { ...modes, turboMode: false, highPowerModel: false }, gated };
}

export interface CreditCostInput {
  /** Real provider token cost in cents (from computeAiCostCents). */
  rawProviderCents: number;
  /** Compute attributed to this request (runtime minutes etc.) in cents. */
  computeCents?: number;
  /** Margin fraction (e.g. 0.3 = +30%). Defaults to DEFAULT_AI_MARGIN. */
  margin?: number;
}

/**
 * Final credit charge for a settled checkpoint. Margin applies only to the
 * provider token cost (compute is already a real cost, billed through).
 * Always rounds up to the next cent and is guaranteed >= raw provider cost.
 */
export function computeCreditCostCents(input: CreditCostInput): number {
  const raw = Number.isFinite(input.rawProviderCents) ? Math.max(0, input.rawProviderCents) : 0;
  const compute = Number.isFinite(input.computeCents) ? Math.max(0, input.computeCents as number) : 0;
  const margin = Number.isFinite(input.margin) ? Math.max(0, input.margin as number) : DEFAULT_AI_MARGIN;
  const credits = Math.ceil(raw * (1 + margin) + compute);
  // Never charge below the real provider cost, even with a 0 / sub-unit margin.
  return Math.max(credits, raw);
}

/** Replit Agent build tiers: Lite (cheap, targeted) → Economy → Power (thorough). */
export type AgentBuildTier = 'lite' | 'economy' | 'power';

/** Per-tier effort estimate multipliers (reservation only; reconciled on settle). */
export const BUILD_TIER_ESTIMATE_MULTIPLIER: Record<AgentBuildTier, number> = {
  lite: 0.4,
  economy: 1,
  power: 1.8,
};

/** Turbo mode (Pro): ~2.5× faster, up to ~6× cost — reserve at the ceiling. */
export const TURBO_ESTIMATE_MULTIPLIER = 6;

export interface EstimateInput {
  /** Estimated provider token cost in cents for this request. */
  baseProviderCents: number;
  computeCents?: number;
  margin?: number;
  highPowerModel?: boolean;
  extendedThinking?: boolean;
  buildTier?: AgentBuildTier;
  turboMode?: boolean;
}

/**
 * Sum of the active power-control surcharges (each `multiplier − 1`). Additive,
 * so combining boosts adds their deltas instead of compounding. A single boost
 * yields exactly its documented Replit multiple once `1 + surcharge` is applied.
 */
export function powerBoostSurcharge(
  input: Pick<EstimateInput, 'highPowerModel' | 'extendedThinking' | 'turboMode'>,
): number {
  let surcharge = 0;
  if (input.highPowerModel) {
    surcharge += HIGH_POWER_ESTIMATE_MULTIPLIER - 1;
  }
  if (input.extendedThinking) {
    surcharge += EXTENDED_THINKING_ESTIMATE_MULTIPLIER - 1;
  }
  if (input.turboMode) {
    surcharge += TURBO_ESTIMATE_MULTIPLIER - 1;
  }
  return surcharge;
}

/**
 * Pre-flight reservation estimate. Applies the power-control surcharges so we
 * reserve enough credit before streaming. Intentionally conservative (estimate
 * high, reconcile down on settle).
 */
export function estimateCheckpointCostCents(input: EstimateInput): number {
  let provider = Number.isFinite(input.baseProviderCents) ? Math.max(0, input.baseProviderCents) : 0;
  // Neutral baseline when the caller doesn't specify a tier (economy = ×1); the
  // request normally passes the actual selected tier. Build tier is the effort
  // axis (how much work the checkpoint does) and genuinely scales token/compute,
  // so it multiplies the base.
  provider *= BUILD_TIER_ESTIMATE_MULTIPLIER[input.buildTier ?? 'economy'] ?? 1;
  /*
   * Power-control boosts are ADDITIVE surcharges, not compounding multipliers.
   * Replit's effort-based model does not aggregate per-control costs into one
   * stacked product (spec §2.A: "Per-role costs are NOT aggregated"): enabling
   * High power + Extended thinking + Turbo together must not multiply to ~108×
   * (the old `×4 × 2.5 × 6` bug surfaced ~$27/message). Each control alone still
   * reproduces its documented Replit multiple — `1 + (mult − 1)` collapses to
   * `mult` for a single boost — while several boosts sum their surcharges.
   */
  provider *= 1 + powerBoostSurcharge(input);
  return computeCreditCostCents({
    rawProviderCents: provider,
    computeCents: input.computeCents,
    margin: input.margin,
  });
}

// --- Credit packs (Replit: 6-month expiry, earliest-first, no post-expiry rollover) ---

/** Credit-pack validity from purchase. Replit: 6 months. */
export const CREDIT_PACK_VALIDITY_DAYS = 182;

/** Number of months unused monthly credits roll over, by plan (Pro: 1). */
export function creditRolloverMonths(planKey: string | undefined): number {
  return toCreditPlanKey(planKey) === 'pro' ? 1 : 0;
}

export interface CreditPackLike {
  id: string;
  remainingCents: number;
  expiresAt: string | Date;
}

export interface PackConsumptionPlan {
  packDebits: Array<{ packId: string; cents: number }>;
  /** Amount left to draw from the wallet balance after packs are exhausted. */
  remainingFromBalance: number;
}

/**
 * Allocate a debit across non-expired credit packs earliest-expiry-first, then
 * the wallet balance. Pure: the caller persists the resulting debits. Expired or
 * empty packs are skipped (their credits do not roll over).
 */
export function planPackConsumption(input: {
  amountCents: number;
  packs: ReadonlyArray<CreditPackLike>;
  nowMs: number;
}): PackConsumptionPlan {
  let remaining = Number.isFinite(input.amountCents) ? Math.max(0, input.amountCents) : 0;
  const usable = input.packs
    .filter((pack) => pack.remainingCents > 0 && new Date(pack.expiresAt).getTime() > input.nowMs)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  const packDebits: Array<{ packId: string; cents: number }> = [];
  for (const pack of usable) {
    if (remaining <= 0) {
      break;
    }
    const take = Math.min(pack.remainingCents, remaining);
    packDebits.push({ packId: pack.id, cents: take });
    remaining -= take;
  }
  return { packDebits, remainingFromBalance: remaining };
}

/**
 * Service Shutdown vs Usage Limit gate. Replit exposes two independent caps:
 * `budgetCapCents` (Usage Limit — block new usage-based spend) and
 * `serviceShutdownCents` (suspend running services). Returns which, if any, is
 * breached by the projected pay-as-you-go spend.
 */
export function evaluateSpendLimits(input: {
  paygSpentCents: number;
  budgetCapCents?: number | null;
  serviceShutdownCents?: number | null;
}): { usageLimitReached: boolean; serviceShutdownReached: boolean } {
  const spent = Number.isFinite(input.paygSpentCents) ? Math.max(0, input.paygSpentCents) : 0;
  return {
    usageLimitReached: input.budgetCapCents != null && spent >= input.budgetCapCents,
    serviceShutdownReached: input.serviceShutdownCents != null && spent >= input.serviceShutdownCents,
  };
}

/** Sum an append-only ledger to a materialized balance. */
export function sumLedgerCents(entries: ReadonlyArray<{ deltaCents: number }>): number {
  return entries.reduce((acc, e) => acc + (Number.isFinite(e.deltaCents) ? e.deltaCents : 0), 0);
}

export interface CreditGateInput {
  balanceCents: number;
  estimatedCents: number;
  /** Pay-as-you-go cap in cents (null/undefined = PAYG disabled). */
  budgetCapCents?: number | null;
  /** PAYG spend already incurred this period, in cents. */
  paygSpentCents?: number;
  /**
   * Replit-parity per-user (Enterprise) cap on this member's usage-based spend
   * this period. null/undefined = no per-member override (org default applies).
   * Takes precedence over the org budget cap — a member is blocked once their own
   * spend + this request would exceed their limit, even if the org has headroom.
   */
  userLimitCents?: number | null;
  /** This member's usage-based spend already incurred this period, in cents. */
  userSpentCents?: number;
}

export type CreditGateDecision =
  | { ok: true; mode: 'credits' }
  | { ok: true; mode: 'payg' }
  | { ok: false; mode: 'blocked'; reason: 'insufficient_credits' | 'budget_cap_reached' | 'user_limit_reached' };

/**
 * Decide whether a request may proceed: covered by wallet balance, by
 * pay-as-you-go overage under the budget cap, or blocked. Fails closed only
 * when there is genuinely no balance and no PAYG headroom.
 */
export function evaluateCreditGate(input: CreditGateInput): CreditGateDecision {
  const balance = Number.isFinite(input.balanceCents) ? input.balanceCents : 0;
  const estimate = Number.isFinite(input.estimatedCents) ? Math.max(0, input.estimatedCents) : 0;

  /*
   * Per-user (Enterprise) cap is a hard ceiling on the member, checked FIRST so
   * it overrides the org budget: a member who has reached their personal limit is
   * blocked even when the org still has credits / PAYG headroom. No per-member
   * override (null) → fall through to the org-level gate below.
   */
  if (input.userLimitCents != null) {
    const userSpent = Number.isFinite(input.userSpentCents) ? Math.max(0, input.userSpentCents as number) : 0;
    if (userSpent + estimate > input.userLimitCents) {
      return { ok: false, mode: 'blocked', reason: 'user_limit_reached' };
    }
  }

  if (balance >= estimate) {
    return { ok: true, mode: 'credits' };
  }

  // PAYG disabled → block once balance can't cover the estimate.
  if (input.budgetCapCents == null) {
    return { ok: false, mode: 'blocked', reason: 'insufficient_credits' };
  }

  const paygSpent = Number.isFinite(input.paygSpentCents) ? Math.max(0, input.paygSpentCents as number) : 0;
  // The portion not covered by remaining balance is charged as overage.
  const overage = estimate - Math.max(0, balance);
  if (paygSpent + overage <= input.budgetCapCents) {
    return { ok: true, mode: 'payg' };
  }

  return { ok: false, mode: 'blocked', reason: 'budget_cap_reached' };
}

/**
 * Replit sets organization usage budgets in **$500 increments**. A budget cap
 * must be a non-negative multiple of this many cents.
 */
export const ORG_BUDGET_INCREMENT_CENTS = 50_000;

/** True if `cents` is a valid org budget cap (≥ 0 and a multiple of $500). */
export function isValidOrgBudgetCents(cents: number): boolean {
  return Number.isFinite(cents) && cents >= 0 && cents % ORG_BUDGET_INCREMENT_CENTS === 0;
}

/**
 * Snap a requested budget cap UP to the next valid $500 increment (Replit
 * parity), so a user asking for $501 lands on $1000 rather than being silently
 * truncated below what they intended. Non-finite/negative inputs clamp to 0.
 */
export function roundOrgBudgetToIncrementCents(cents: number): number {
  if (!Number.isFinite(cents) || cents <= 0) {
    return 0;
  }
  return Math.ceil(cents / ORG_BUDGET_INCREMENT_CENTS) * ORG_BUDGET_INCREMENT_CENTS;
}

/** Alert thresholds (fractions of the budget cap) for PAYG spend notifications. */
export const PAYG_ALERT_THRESHOLDS = [0.5, 0.8, 1.0] as const;

/** Highest alert threshold crossed by the given spend, or null if below 50%. */
export function paygAlertThresholdCrossed(paygSpentCents: number, budgetCapCents: number): number | null {
  if (!Number.isFinite(budgetCapCents) || budgetCapCents <= 0) {
    return null;
  }
  const spent = Number.isFinite(paygSpentCents) ? Math.max(0, paygSpentCents) : 0;
  const ratio = spent / budgetCapCents;
  let crossed: number | null = null;
  for (const threshold of PAYG_ALERT_THRESHOLDS) {
    if (ratio >= threshold) {
      crossed = threshold;
    }
  }
  return crossed;
}
