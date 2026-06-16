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

export interface EstimateInput {
  /** Estimated provider token cost in cents for this request. */
  baseProviderCents: number;
  computeCents?: number;
  margin?: number;
  highPowerModel?: boolean;
  extendedThinking?: boolean;
}

/**
 * Pre-flight reservation estimate. Applies the power-control multipliers so we
 * reserve enough credit before streaming. Intentionally conservative (estimate
 * high, reconcile down on settle).
 */
export function estimateCheckpointCostCents(input: EstimateInput): number {
  let provider = Number.isFinite(input.baseProviderCents) ? Math.max(0, input.baseProviderCents) : 0;
  if (input.highPowerModel) {
    provider *= HIGH_POWER_ESTIMATE_MULTIPLIER;
  }
  if (input.extendedThinking) {
    provider *= EXTENDED_THINKING_ESTIMATE_MULTIPLIER;
  }
  return computeCreditCostCents({
    rawProviderCents: provider,
    computeCents: input.computeCents,
    margin: input.margin,
  });
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
}

export type CreditGateDecision =
  | { ok: true; mode: 'credits' }
  | { ok: true; mode: 'payg' }
  | { ok: false; mode: 'blocked'; reason: 'insufficient_credits' | 'budget_cap_reached' };

/**
 * Decide whether a request may proceed: covered by wallet balance, by
 * pay-as-you-go overage under the budget cap, or blocked. Fails closed only
 * when there is genuinely no balance and no PAYG headroom.
 */
export function evaluateCreditGate(input: CreditGateInput): CreditGateDecision {
  const balance = Number.isFinite(input.balanceCents) ? input.balanceCents : 0;
  const estimate = Number.isFinite(input.estimatedCents) ? Math.max(0, input.estimatedCents) : 0;

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

/** Alert thresholds (fractions of the budget cap) for PAYG spend notifications. */
export const PAYG_ALERT_THRESHOLDS = [0.5, 0.8, 1.0] as const;

/** Highest alert threshold crossed by the given spend, or null if below 50%. */
export function paygAlertThresholdCrossed(paygSpentCents: number, budgetCapCents: number): number | null {
  if (!Number.isFinite(budgetCapCents) || budgetCapCents <= 0) {
    return null;
  }
  const ratio = Math.max(0, paygSpentCents) / budgetCapCents;
  let crossed: number | null = null;
  for (const threshold of PAYG_ALERT_THRESHOLDS) {
    if (ratio >= threshold) {
      crossed = threshold;
    }
  }
  return crossed;
}
