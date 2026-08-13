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
import { billingEnabled } from '@vibecore/billing';
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
  input: {
    organizationId: string;
    estimatedCents: number;
    paygSpentCents?: number;
    nowMs: number;
    /** Acting member — resolves their per-user (Enterprise) spend cap, if any. */
    userId?: string;
    /** Billing-period start (ms) used to sum the member's spend so far. */
    periodStartMs?: number;
  },
): Promise<CreditGateDecision> {
  const wallet = await store.ensureCreditWallet(input.organizationId);
  const available = await availableCreditsCents(store, input.organizationId, input.nowMs);

  // Per-user (Enterprise) override: a member's own cap beats the org budget.
  let userLimitCents: number | null = null;
  let userSpentCents = 0;

  if (input.userId) {
    const limit = await store.getUserSpendLimit(input.organizationId, input.userId).catch(() => undefined);

    if (limit) {
      userLimitCents = limit.limitCents;
      userSpentCents = await store
        .sumUserSpendSince(input.organizationId, input.userId, input.periodStartMs ?? 0)
        .catch(() => 0);
    }
  }

  return evaluateCreditGate({
    balanceCents: available,
    estimatedCents: input.estimatedCents,
    budgetCapCents: wallet.budgetCapCents ?? null,
    paygSpentCents: input.paygSpentCents ?? 0,
    userLimitCents,
    userSpentCents,
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
  /*
   * KILL-SWITCH FACTURATION — aucun débit en mode gratuit.
   *
   * Gardé ICI, dans la fonction de débit elle-même, et pas chez ses appelants :
   * `debitCredits` est le chemin comptable UNIQUE (règlement de checkpoint,
   * métrage calcul/stockage/base/déploiement). Un no-op au centre ne peut pas
   * être contourné par un appelant qu'on aurait oublié, ni par celui qu'on
   * ajoutera.
   *
   * Le no-op rend un débit NUL plutôt que de lever : ces appels vivent sur des
   * chemins d'usage normaux (déployer, faire tourner un espace de travail), et
   * une exception y transformerait le kill-switch en panne de plateforme.
   */
  if (!billingEnabled()) {
    return { fromPacks: 0, fromBalance: 0 };
  }

  const amount = Number.isFinite(input.amountCents) ? Math.max(0, Math.ceil(input.amountCents)) : 0;

  if (amount <= 0) {
    return { fromPacks: 0, fromBalance: 0 };
  }

  const packs = await store.listCreditPacks(input.organizationId, { activeOnly: true });
  const plan = planPackConsumption({ amountCents: amount, packs, nowMs: input.nowMs });

  /*
   * decrementCreditPack is race-clamped (prisma-store.ts): when a concurrent
   * settlement already drew the same pack below the planned `cents`, it consumes
   * only whatever remained (clamp-to-0) rather than the planned amount. So the
   * PLANNED plan.packDebits.cents can over-report what the packs actually covered.
   * Reconcile against the REAL decrement (pre-minus-post remainingCents) and treat
   * any clamped shortfall exactly like an uncovered remainder: it must overflow
   * into the wallet balance / PAYG, never be silently lost. This is the pack-side
   * analogue of the wallet-balance overdraw handling below.
   *
   * `before` is re-read from the store immediately before each decrement (not from
   * the planning snapshot) so a sibling settlement that drained the pack in between
   * is reflected; the per-iteration re-read keeps `pre - post` honest under races.
   */
  let fromPacks = 0;
  let packShortfall = 0;

  for (const debit of plan.packDebits) {
    const current = await store.listCreditPacks(input.organizationId, { activeOnly: true });
    const before = Math.max(0, current.find((p) => p.id === debit.packId)?.remainingCents ?? 0);
    const updated = await store.decrementCreditPack({ id: debit.packId, cents: debit.cents });
    const actual = Math.max(0, before - Math.max(0, updated.remainingCents));

    fromPacks += actual;
    packShortfall += Math.max(0, debit.cents - actual);
  }

  // Whatever the packs could not actually cover overflows into the balance draw.
  const remainingFromBalance = plan.remainingFromBalance + packShortfall;

  let fromBalance = 0;

  if (remainingFromBalance > 0) {
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
    const drawFromBalance = Math.min(remainingFromBalance, balanceCents);

    if (drawFromBalance > 0) {
      /*
       * The balance read above is a STALE snapshot — recordCreditEntry applies an
       * UNCONDITIONAL atomic `increment: deltaCents` with no `balanceCents >= draw`
       * guard. Two settlements for the same org racing here both read balance=N and
       * both draw up to N, driving the wallet to roughly -N (over-spend). Since the
       * debit cannot be made conditional at the store layer from here, use the
       * post-mutation balance the entry RETURNS to detect any over-draw and
       * immediately record a compensating reversal that clamps the wallet back to
       * exactly 0. Net effect: the wallet never settles negative, and the part that
       * could not actually be covered by the balance (overdraw) is excluded from
       * fromBalance so it correctly overflows into PAYG (billed via Stripe) instead
       * of being silently lost. Mirrors decrementCreditPack's clamp-to-0 invariant.
       */
      const { balanceCents: postBalance } = await store.recordCreditEntry({
        organizationId: input.organizationId,
        deltaCents: -drawFromBalance,
        kind: 'CONSUMPTION',
        reason: input.reason,
        checkpointId: input.checkpointId,
      });

      const overdraw = postBalance < 0 ? -postBalance : 0;

      if (overdraw > 0) {
        await store.recordCreditEntry({
          organizationId: input.organizationId,
          deltaCents: overdraw,
          kind: 'CONSUMPTION',
          reason: `${input.reason} (overdraw reversal)`,
          checkpointId: input.checkpointId,
        });
      }

      fromBalance = Math.max(0, drawFromBalance - overdraw);
    }
  }

  return { fromPacks, fromBalance };
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

/**
 * Minimal Stripe surface needed to report PAYG metered usage (keeps this
 * module decoupled from the concrete StripeBillingClient + easy to unit-test).
 */
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

    /*
     * Round PAYG charges UP (was Math.round, asymmetric) so fractional cents are
     * never lost to the platform; pairs with the metered-usage ceil in billing.
     */
    quantity: Math.ceil(input.paygChargeCents),
    idempotencyKey: `checkpoint:${input.checkpointId}`,
  });

  return { reported: true };
}

/**
 * Report a USAGE-metering overage (compute / object storage / database storage /
 * deployment beyond included credits) to the org's Stripe metered subscription
 * item — the usage-based analogue of {@link reportCheckpointPaygUsage}. Bills to
 * `STRIPE_PAYG_USAGE_PRICE_ID`, falling back to `STRIPE_PAYG_AI_PRICE_ID` so a
 * single metered item can capture all overage if desired.
 *
 * FULLY SHADOW-SAFE: a no-op unless `BILLING_CREDITS_ENABLED==='true'`, a price
 * is configured, a Stripe client is supplied, there is a real overage, and the
 * org has the metered subscription item. Idempotent via the caller's `reference`.
 */
export async function reportUsagePaygUsage(
  store: ApiStore,
  stripe: PaygStripeClient | undefined,
  input: { organizationId: string; reference: string; paygChargeCents: number },
): Promise<{ reported: boolean; reason?: string }> {
  if (process.env.BILLING_CREDITS_ENABLED !== 'true') {
    return { reported: false, reason: 'shadow' };
  }

  if (!stripe) {
    return { reported: false, reason: 'no_stripe_client' };
  }

  const priceId = process.env.STRIPE_PAYG_USAGE_PRICE_ID ?? process.env.STRIPE_PAYG_AI_PRICE_ID;

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
    quantity: Math.ceil(input.paygChargeCents),
    idempotencyKey: `usage:${input.reference}`,
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
