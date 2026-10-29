import { routingLine, type AgentRoutingCard } from './agent-routing.js';
import { CATALOGUE_INTEGRE } from './catalogue-integre.js';

/** Persistent ledger discriminator, not display copy or a billable amount. */
export const EXPLICIT_RUN_USAGE_LEDGER_REASON = 'chat.completion.explicit-standard-estimate';

export const EXPLICIT_RUN_PROVIDER_INPUT_CENTS = 55;
export const EXPLICIT_RUN_PROVIDER_OUTPUT_CENTS = 198;

export interface ExplicitRunPermit {
  kind: 'bounded-explicit-v1';
  runId: string;
  projectId: string;
  provider: 'openai';
  model: 'gpt-5.6-luna';
  serviceTier: 'default';
  routingVersion: number;
  lineKey: 'lite';
  multiplier: number;
  maxCalls: number;
  maxInputTokens: 64000;
  maxBillableInputTokens: 1050000;
  maxOutputTokens: 8192;
  reservedBudgetMicros: number;
  budgetLimitMicros: 20000000;
  accounting: {
    providerInputCentsPerMillion: 20;
    providerOutputCentsPerMillion: 120;
    platformInputCentsPerMillion: number;
    platformOutputCentsPerMillion: number;
  };
  pricing: {
    providerInputCentsPerMillion: typeof EXPLICIT_RUN_PROVIDER_INPUT_CENTS;
    providerOutputCentsPerMillion: typeof EXPLICIT_RUN_PROVIDER_OUTPUT_CENTS;
    platformInputCentsPerMillion: number;
    platformOutputCentsPerMillion: number;
  };
}

export type ExplicitRunErrorCode =
  | 'EXPLICIT_RUN_UNAVAILABLE'
  | 'EXPLICIT_RUN_UNKNOWN_PRICE'
  | 'EXPLICIT_RUN_BUDGET_EXCEEDED';

/** Machine-only failure: HTTP boundaries supply localized public copy. */
export class ExplicitRunError extends Error {
  constructor(readonly code: ExplicitRunErrorCode) {
    super();
    this.name = 'ExplicitRunError';
  }
}

export function buildExplicitRunPermit(input: {
  runId: string;
  projectId: string;
  planKey: string;
  card: AgentRoutingCard;
}): ExplicitRunPermit {
  const { card } = input;
  const line = routingLine(card, 'lite');

  const model = CATALOGUE_INTEGRE.find((entry) => entry.mode === 'lite')?.modeles.find(
    (entry) => entry.provider === 'openai' && entry.model === 'gpt-5.6-luna' && !entry.serviceTier,
  );

  if (!line?.active || !line.availablePlans.includes(input.planKey) || !line.billedToUser || !model) {
    throw new ExplicitRunError('EXPLICIT_RUN_UNAVAILABLE');
  }

  const platformInputCentsPerMillion = card.baseUserInCentsPerM * line.multiplier * 2;
  const platformOutputCentsPerMillion = card.baseUserOutCentsPerM * line.multiplier * 1.5;

  if (
    card.currency !== 'usd' ||
    !Number.isSafeInteger(card.version) ||
    card.version <= 0 ||
    ![line.multiplier, platformInputCentsPerMillion, platformOutputCentsPerMillion].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    model.costInCentsPerM !== 20 ||
    model.costOutCentsPerM !== 120
  ) {
    throw new ExplicitRunError('EXPLICIT_RUN_UNKNOWN_PRICE');
  }

  /*
   * The wire byte bound is not a certified tokenizer bound. Reserve the full
   * documented context, long-context premiums, and worst-case cache writes.
   * Platform premiums are deliberately conservative too. No refund on uncertainty.
   */
  const perCallMicros = (inputPrice: number, outputPrice: number) =>
    Math.ceil((1050000 * inputPrice + 8192 * outputPrice) / 1000000) * 10000;
  const perCallBudgetMicros =
    perCallMicros(EXPLICIT_RUN_PROVIDER_INPUT_CENTS, EXPLICIT_RUN_PROVIDER_OUTPUT_CENTS) +
    perCallMicros(platformInputCentsPerMillion, platformOutputCentsPerMillion);

  const maxCalls = Math.min(8, Math.floor(20000000 / perCallBudgetMicros));
  const reservedBudgetMicros = maxCalls * perCallBudgetMicros;

  if (!Number.isSafeInteger(reservedBudgetMicros) || reservedBudgetMicros <= 0 || reservedBudgetMicros > 20000000) {
    throw new ExplicitRunError('EXPLICIT_RUN_BUDGET_EXCEEDED');
  }

  return {
    kind: 'bounded-explicit-v1',
    runId: input.runId,
    projectId: input.projectId,
    provider: 'openai',
    model: 'gpt-5.6-luna',
    serviceTier: 'default',
    routingVersion: card.version,
    lineKey: 'lite',
    multiplier: line.multiplier,
    maxCalls,
    maxInputTokens: 64000,
    maxBillableInputTokens: 1050000,
    maxOutputTokens: 8192,
    reservedBudgetMicros,
    budgetLimitMicros: 20000000,
    accounting: {
      providerInputCentsPerMillion: 20,
      providerOutputCentsPerMillion: 120,
      platformInputCentsPerMillion: card.baseUserInCentsPerM * line.multiplier,
      platformOutputCentsPerMillion: card.baseUserOutCentsPerM * line.multiplier,
    },
    pricing: {
      providerInputCentsPerMillion: EXPLICIT_RUN_PROVIDER_INPUT_CENTS,
      providerOutputCentsPerMillion: EXPLICIT_RUN_PROVIDER_OUTPUT_CENTS,
      platformInputCentsPerMillion,
      platformOutputCentsPerMillion,
    },
  };
}

export interface ExplicitRunBudgetState {
  version: 1;
  reservedMicros: number;
  runIds: string[];
  permits: ExplicitRunPermit[];
}
export type ExplicitRunReservation =
  | { ok: true; state: ExplicitRunBudgetState }
  | { ok: false; code: 'EXPLICIT_RUN_REPLAY' | 'EXPLICIT_RUN_BUDGET_EXCEEDED' | 'EXPLICIT_RUN_BUDGET_INVALID' };

/** Pure transition shared by the transactional store and isolated test store. */
export function reserveExplicitRunBudget(existing: unknown, permit: ExplicitRunPermit): ExplicitRunReservation {
  const state: ExplicitRunBudgetState =
    existing === undefined
      ? { version: 1, reservedMicros: 0, runIds: [], permits: [] }
      : (existing as ExplicitRunBudgetState);

  if (
    !state ||
    state.version !== 1 ||
    !Number.isSafeInteger(state.reservedMicros) ||
    state.reservedMicros < 0 ||
    !Array.isArray(state.permits) ||
    !Array.isArray(state.runIds) ||
    state.runIds.some((id) => typeof id !== 'string') ||
    !Number.isSafeInteger(permit.reservedBudgetMicros) ||
    permit.reservedBudgetMicros <= 0 ||
    permit.budgetLimitMicros !== 20000000
  ) {
    return { ok: false, code: 'EXPLICIT_RUN_BUDGET_INVALID' };
  }

  if (state.runIds.includes(permit.runId)) {
    return { ok: false, code: 'EXPLICIT_RUN_REPLAY' };
  }

  const reservedMicros = state.reservedMicros + permit.reservedBudgetMicros;

  if (!Number.isSafeInteger(reservedMicros) || reservedMicros > permit.budgetLimitMicros) {
    return { ok: false, code: 'EXPLICIT_RUN_BUDGET_EXCEEDED' };
  }

  return {
    ok: true,
    state: { version: 1, reservedMicros, runIds: [...state.runIds, permit.runId], permits: [...state.permits, permit] },
  };
}

/** Reservations only: this is neither historical spend nor the total recipe budget. */
export interface ExplicitRunBudgetSummary {
  scope: 'explicit-runs-only';
  currency: 'USD';
  limitMicros: 20000000;
  reservedMicros: number;
  remainingMicros: number;
  runCount: number;
  historicalCostsIncluded: false;
  totalRecipeRemainingMicros: null;
}

/** Reject inconsistent persisted ledgers instead of presenting a fictitious balance. */
export function summarizeExplicitRunBudget(existing: unknown, projectId: string): ExplicitRunBudgetSummary | undefined {
  const state = existing === undefined ? { version: 1, reservedMicros: 0, runIds: [], permits: [] } : existing;

  if (!state || typeof state !== 'object') {
    return undefined;
  }

  const ledger = state as ExplicitRunBudgetState;

  if (
    ledger.version !== 1 ||
    !Number.isSafeInteger(ledger.reservedMicros) ||
    ledger.reservedMicros < 0 ||
    ledger.reservedMicros > 20000000 ||
    !Array.isArray(ledger.runIds) ||
    !Array.isArray(ledger.permits) ||
    ledger.runIds.length !== ledger.permits.length ||
    ledger.runIds.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(ledger.runIds).size !== ledger.runIds.length
  ) {
    return undefined;
  }

  const seen = new Set<string>();

  let sum = 0;

  for (const permit of ledger.permits) {
    if (
      !permit ||
      typeof permit !== 'object' ||
      permit.kind !== 'bounded-explicit-v1' ||
      permit.projectId !== projectId ||
      typeof permit.runId !== 'string' ||
      !ledger.runIds.includes(permit.runId) ||
      seen.has(permit.runId) ||
      permit.provider !== 'openai' ||
      permit.model !== 'gpt-5.6-luna' ||
      permit.serviceTier !== 'default' ||
      permit.lineKey !== 'lite' ||
      !Number.isSafeInteger(permit.routingVersion) ||
      permit.routingVersion <= 0 ||
      !Number.isFinite(permit.multiplier) ||
      permit.multiplier <= 0 ||
      !Number.isSafeInteger(permit.maxCalls) ||
      permit.maxCalls < 1 ||
      permit.maxCalls > 8 ||
      permit.maxInputTokens !== 64000 ||
      permit.maxBillableInputTokens !== 1050000 ||
      permit.maxOutputTokens !== 8192 ||
      permit.budgetLimitMicros !== 20000000 ||
      !Number.isSafeInteger(permit.reservedBudgetMicros) ||
      permit.reservedBudgetMicros <= 0 ||
      permit.reservedBudgetMicros > 20000000 ||
      permit.accounting?.providerInputCentsPerMillion !== 20 ||
      permit.accounting?.providerOutputCentsPerMillion !== 120 ||
      permit.pricing?.providerInputCentsPerMillion !== EXPLICIT_RUN_PROVIDER_INPUT_CENTS ||
      permit.pricing?.providerOutputCentsPerMillion !== EXPLICIT_RUN_PROVIDER_OUTPUT_CENTS ||
      ![
        permit.accounting?.platformInputCentsPerMillion,
        permit.accounting?.platformOutputCentsPerMillion,
        permit.pricing?.platformInputCentsPerMillion,
        permit.pricing?.platformOutputCentsPerMillion,
      ].every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)
    ) {
      return undefined;
    }

    const perCallMicros = (inputPrice: number, outputPrice: number) =>
      Math.ceil((permit.maxBillableInputTokens * inputPrice + permit.maxOutputTokens * outputPrice) / 1000000) * 10000;
    const expectedReservation =
      permit.maxCalls *
      (perCallMicros(permit.pricing.providerInputCentsPerMillion, permit.pricing.providerOutputCentsPerMillion) +
        perCallMicros(permit.pricing.platformInputCentsPerMillion, permit.pricing.platformOutputCentsPerMillion));

    if (expectedReservation !== permit.reservedBudgetMicros) {
      return undefined;
    }

    seen.add(permit.runId);
    sum += permit.reservedBudgetMicros;
  }

  if (!Number.isSafeInteger(sum) || sum !== ledger.reservedMicros) {
    return undefined;
  }

  return {
    scope: 'explicit-runs-only',
    currency: 'USD',
    limitMicros: 20000000,
    reservedMicros: sum,
    remainingMicros: 20000000 - sum,
    runCount: seen.size,
    historicalCostsIncluded: false,
    totalRecipeRemainingMicros: null,
  };
}
