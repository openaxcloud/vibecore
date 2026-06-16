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

  const packs = await store.listCreditPacks(input.organizationId, { activeOnly: true });
  const plan = planPackConsumption({ amountCents: creditCents, packs, nowMs: input.nowMs });

  for (const debit of plan.packDebits) {
    await store.decrementCreditPack({ id: debit.packId, cents: debit.cents });
  }

  let fromBalance = 0;
  if (plan.remainingFromBalance > 0) {
    await store.recordCreditEntry({
      organizationId: input.organizationId,
      deltaCents: -plan.remainingFromBalance,
      kind: 'CONSUMPTION',
      reason: 'agent checkpoint',
      checkpointId: input.checkpointId,
    });
    fromBalance = plan.remainingFromBalance;
  }

  const fromPacks = plan.packDebits.reduce((acc, d) => acc + d.cents, 0);
  return { creditCents, fromPacks, fromBalance, shadow: false };
}

/** Convenience: estimate the reservation cost for the agent UI cost preview. */
export function estimateRequestCents(input: {
  baseProviderCents: number;
  computeCents?: number;
  margin?: number;
} & CheckpointPowerControls): number {
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
