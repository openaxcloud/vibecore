/**
 * Effort-based checkpoint orchestration (Replit parity).
 *
 * One checkpoint per Agent request: open before work, gate against available
 * credits, then settle exactly once with the real effort cost — consuming
 * purchased credit packs earliest-expiry-first, then the monthly wallet balance.
 * Pay-as-you-go overage (when enabled) is charged beyond the balance up to the
 * Usage Limit. See docs/REPLIT_PARITY_SPEC.md §5–§7.
 *
 * Kept as standalone functions over `ApiStore` so they're unit-testable with the
 * in-memory store and reusable from the chat route, agent-run settle, and the
 * compute/storage metering paths.
 */
import {
  computeCreditCostCents,
  creditRolloverMonths,
  estimateCheckpointCostCents,
  evaluateCreditGate,
  planCreditConfig,
  planPackConsumption,
  toCreditPlanKey,
  type AgentBuildTier,
  type CreditGateDecision,
} from '@vibecore/billing';
import type { AgentCheckpointRecord, ApiStore } from './store.js';

export interface CheckpointPowerControls {
  highPowerModel?: boolean;
  extendedThinking?: boolean;
  buildTier?: AgentBuildTier;
  turboMode?: boolean;
}

/** Open a PENDING checkpoint for an Agent request. */
export async function openCheckpoint(
  store: ApiStore,
  input: {
    organizationId: string;
    userId?: string;
    projectId?: string;
    conversationId?: string;
    runId?: string;
  } & CheckpointPowerControls,
): Promise<AgentCheckpointRecord> {
  return store.createAgentCheckpoint(input);
}

/** Total spendable credits = wallet balance + active (non-expired) pack remainder. */
export async function availableCreditsCents(store: ApiStore, organizationId: string, nowMs: number): Promise<number> {
  const wallet = await store.ensureCreditWallet(organizationId);
  const packs = await store.listCreditPacks(organizationId, { activeOnly: true });
  const packTotal = packs
    .filter((p) => new Date(p.expiresAt).getTime() > nowMs)
    .reduce((acc, p) => acc + Math.max(0, p.remainingCents), 0);
  return wallet.balanceCents + packTotal;
}

/**
 * Pre-flight gate: may this request proceed? Covered by credits, by PAYG overage
 * under the Usage Limit, or blocked. Pure decision — does not reserve.
 */
export async function gateCheckpoint(
  store: ApiStore,
  input: { organizationId: string; estimatedCents: number; paygSpentCents?: number; nowMs: number },
): Promise<CreditGateDecision> {
  const wallet = await store.ensureCreditWallet(input.organizationId);
  const available = await availableCreditsCents(store, input.organizationId, input.nowMs);
  return evaluateCreditGate({
    balanceCents: available,
    estimatedCents: input.estimatedCents,
    budgetCapCents: wallet.budgetCapCents ?? null,
    paygSpentCents: input.paygSpentCents ?? 0,
  });
}

/**
 * Service-shutdown gate (Replit-parity "Service shutdown limit"). When an org has
 * a `serviceShutdownCents` cap configured AND its credits are exhausted, ALL
 * billable services — not just AI — are suspended until the budget is raised or
 * the cycle resets. Used to gate workspace start + deploy in addition to the AI
 * checkpoint gate.
 *
 * SHADOW-safe: inert unless `BILLING_CREDITS_ENABLED === 'true'` (so SHADOW /
 * default never blocks). The precise `paygSpent >= serviceShutdownCents`
 * threshold becomes exact once PAYG metered spend is tracked (reportUsage); until
 * then the trigger is "credits exhausted with a shutdown limit set", which is the
 * real out-of-budget moment.
 */
export async function checkServiceShutdown(
  store: ApiStore,
  input: { organizationId: string; nowMs: number },
): Promise<{ shutdown: boolean; reason?: string }> {
  if (process.env.BILLING_CREDITS_ENABLED !== 'true') {
    return { shutdown: false };
  }

  const wallet = await store.ensureCreditWallet(input.organizationId);

  if (wallet.serviceShutdownCents == null) {
    return { shutdown: false };
  }

  const available = await availableCreditsCents(store, input.organizationId, input.nowMs);

  if (available > 0) {
    return { shutdown: false };
  }

  return { shutdown: true, reason: 'service_shutdown_limit_reached' };
}

export interface DebitResult {
  fromPacks: number;
  fromBalance: number;
}

/**
 * Debit a credit amount, consuming active credit packs earliest-expiry-first
 * then the wallet balance. Shared by checkpoint settle and compute/storage/DB/
 * deployment metering so all credit consumption uses one accounting path.
 */
export async function debitCredits(
  store: ApiStore,
  input: { organizationId: string; amountCents: number; reason: string; checkpointId?: string; nowMs: number },
): Promise<DebitResult> {
  const amount = Number.isFinite(input.amountCents) ? Math.max(0, Math.ceil(input.amountCents)) : 0;
  if (amount <= 0) {
    return { fromPacks: 0, fromBalance: 0 };
  }

  const packs = await store.listCreditPacks(input.organizationId, { activeOnly: true });
  const plan = planPackConsumption({ amountCents: amount, packs, nowMs: input.nowMs });

  for (const debit of plan.packDebits) {
    await store.decrementCreditPack({ id: debit.packId, cents: debit.cents });
  }

  let fromBalance = 0;
  if (plan.remainingFromBalance > 0) {
    /*
     * Cap the wallet draw at the REAL balance: the uncovered remainder must overflow
     * into pay-as-you-go (billed via Stripe), not silently drive the wallet negative.
     * Previously the entire non-pack amount was recorded as a balance debit, so the
     * settle path's paygChargeCents (creditCents - fromPacks - fromBalance) was
     * ~always 0 — PAYG usage was never reported to Stripe and budget-cap / spend
     * alerts (which read sumPaygSpendSince) stayed permanently dead.
     */
    const wallet = await store.getCreditWallet(input.organizationId);
    const balanceCents = Math.max(0, wallet?.balanceCents ?? 0);
    const drawFromBalance = Math.min(plan.remainingFromBalance, balanceCents);

    if (drawFromBalance > 0) {
      await store.recordCreditEntry({
        organizationId: input.organizationId,
        deltaCents: -drawFromBalance,
        kind: 'CONSUMPTION',
        reason: input.reason,
        checkpointId: input.checkpointId,
      });
      fromBalance = drawFromBalance;
    }
  }

  return { fromPacks: plan.packDebits.reduce((acc, d) => acc + d.cents, 0), fromBalance };
}

export interface SettleResult {
  creditCents: number;
  fromPacks: number;
  fromBalance: number;
  shadow: boolean;
}

/**
 * Settle a checkpoint exactly once. Computes the margin-covered credit cost from
 * real effort, records it on the checkpoint, and (unless `shadow`) debits packs
 * earliest-first then the wallet balance. In shadow mode nothing is debited —
 * used to validate cost accuracy before charging real users.
 */
export async function settleCheckpoint(
  store: ApiStore,
  input: {
    checkpointId: string;
    organizationId: string;
    inputTokens?: number;
    outputTokens?: number;
    wallMs?: number;
    rawProviderCents: number;
    computeCents?: number;
    margin?: number;
    status?: 'COMPLETED' | 'FAILED';
    shadow?: boolean;
    nowMs: number;
  },
): Promise<SettleResult> {
  const creditCents = computeCreditCostCents({
    rawProviderCents: input.rawProviderCents,
    computeCents: input.computeCents,
    margin: input.margin,
  });

  await store.completeAgentCheckpoint({
    id: input.checkpointId,
    status: input.status ?? 'COMPLETED',
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    wallMs: input.wallMs,
    computeCents: input.computeCents,
    rawProviderCents: input.rawProviderCents,
    creditCents,
  });

  if (input.shadow) {
    return { creditCents, fromPacks: 0, fromBalance: 0, shadow: true };
  }

  const { fromPacks, fromBalance } = await debitCredits(store, {
    organizationId: input.organizationId,
    amountCents: creditCents,
    reason: 'agent checkpoint',
    checkpointId: input.checkpointId,
    nowMs: input.nowMs,
  });

  return { creditCents, fromPacks, fromBalance, shadow: false };
}

/** Minimal Stripe surface needed to report PAYG metered usage (keeps this
 * module decoupled from the concrete StripeBillingClient + easy to unit-test). */
export interface PaygStripeClient {
  getSubscription(
    subscriptionId: string,
  ): Promise<{ items?: { data?: Array<{ id: string; price?: { id?: string } }> } } | undefined>;
  reportUsage(input: { subscriptionItemId: string; quantity: number; idempotencyKey?: string }): Promise<unknown>;
}

/**
 * Report a checkpoint's PAYG overage (the part of the cost not covered by packs
 * or wallet balance) to the org's Stripe metered subscription item. Replit-parity
 * pay-as-you-go draw-down.
 *
 * FULLY SHADOW-SAFE — it is a no-op (returns `{reported:false, reason}`) unless
 * ALL of: `BILLING_CREDITS_ENABLED==='true'`, a `STRIPE_PAYG_AI_PRICE_ID` is set,
 * a Stripe client is provided, there is a real overage, the org has a Stripe
 * subscription, and that subscription has the metered item. So it is wired and
 * unit-testable today, and activates only at the Stripe go-live. Idempotent via
 * the checkpoint id (safe on retries).
 */
export async function reportCheckpointPaygUsage(
  store: ApiStore,
  stripe: PaygStripeClient | undefined,
  input: { organizationId: string; checkpointId: string; paygChargeCents: number },
): Promise<{ reported: boolean; reason?: string }> {
  if (process.env.BILLING_CREDITS_ENABLED !== 'true') {
    return { reported: false, reason: 'shadow' };
  }

  if (!stripe) {
    return { reported: false, reason: 'no_stripe_client' };
  }

  const priceId = process.env.STRIPE_PAYG_AI_PRICE_ID;

  if (!priceId) {
    return { reported: false, reason: 'no_payg_price' };
  }

  if (!(input.paygChargeCents > 0)) {
    return { reported: false, reason: 'no_overage' };
  }

  const subscription = await store.getSubscription(input.organizationId);

  if (!subscription?.externalId) {
    return { reported: false, reason: 'no_subscription' };
  }

  const stripeSub = await stripe.getSubscription(subscription.externalId);
  const item = stripeSub?.items?.data?.find((entry) => entry.price?.id === priceId);

  if (!item) {
    return { reported: false, reason: 'no_metered_item' };
  }

  await stripe.reportUsage({
    subscriptionItemId: item.id,
    // Round PAYG charges UP (was Math.round, asymmetric) so fractional cents are
    // never lost to the platform; pairs with the metered-usage ceil in billing.
    quantity: Math.ceil(input.paygChargeCents),
    idempotencyKey: `checkpoint:${input.checkpointId}`,
  });

  return { reported: true };
}

/** Convenience: estimate the reservation cost for the agent UI cost preview. */
export function estimateRequestCents(
  input: {
    baseProviderCents: number;
    computeCents?: number;
    margin?: number;
  } & CheckpointPowerControls,
): number {
  return estimateCheckpointCostCents(input);
}

export interface GrantResult {
  granted: number;
  expired: number;
  period: 'monthly' | 'daily';
}

/**
 * Apply a plan's recurring credit grant. Starter grants its daily amount (call
 * daily); Core/Pro grant their monthly amount (call at period rollover).
 *
 * Rollover policy (Replit): non-rollover plans (Starter daily, Core monthly)
 * expire the prior unused balance before granting; Pro rolls over one extra
 * period, so the balance is capped at one period's worth before the new grant.
 */
export async function applyPlanGrant(
  store: ApiStore,
  input: { organizationId: string; planKey: string | undefined; nowMs: number },
): Promise<GrantResult> {
  const creditPlan = toCreditPlanKey(input.planKey);
  const config = planCreditConfig[creditPlan];
  const period: 'monthly' | 'daily' = config.monthlyCreditCents > 0 ? 'monthly' : 'daily';
  const grantCents = period === 'monthly' ? config.monthlyCreditCents : config.dailyCreditCents;

  if (grantCents <= 0) {
    return { granted: 0, expired: 0, period };
  }

  const wallet = await store.ensureCreditWallet(input.organizationId);
  let expired = 0;

  if (config.rollover) {
    // Pro: keep at most one period of unused balance before topping up.
    const rolloverCap = config.monthlyCreditCents * creditRolloverMonths(input.planKey);
    if (wallet.balanceCents > rolloverCap) {
      expired = wallet.balanceCents - rolloverCap;
      await store.recordCreditEntry({
        organizationId: input.organizationId,
        deltaCents: -expired,
        kind: 'EXPIRY',
        reason: 'rollover cap exceeded',
      });
    }
  } else if (wallet.balanceCents > 0) {
    // Non-rollover: prior unused grant expires.
    expired = wallet.balanceCents;
    await store.recordCreditEntry({
      organizationId: input.organizationId,
      deltaCents: -expired,
      kind: 'EXPIRY',
      reason: 'prior grant expired (no rollover)',
    });
  }

  await store.recordCreditEntry({
    organizationId: input.organizationId,
    deltaCents: grantCents,
    kind: 'GRANT',
    reason: `${creditPlan} ${period} grant`,
  });

  return { granted: grantCents, expired, period };
}
