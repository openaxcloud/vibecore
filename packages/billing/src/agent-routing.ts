/**
 * Versioned Agent Routing Card — the single priced document mapping agent
 * MODES (Lite / Economy / Power) and switches (High effort / Turbo) plus the
 * harness classifier to concrete provider models, with the platform's cost
 * (coût de revient) and the user price side by side.
 *
 * Follows the RateCard pattern (rate-card.ts): the BUILT-IN card below is
 * version 1 and doubles as the DB seed; the api serves the ACTIVE card from
 * the DB (falling back to this built-in), and every logged agent call stamps
 * the card version it was priced with. Changing a model or a price is a NEW
 * card version (a config change, never a deployment), with
 * effectiveFrom/effectiveTo/sourceDate preserved for the full history.
 *
 * Pricing model: the card carries ONE base user price (the Economy ×1 price,
 * cents per 1M tokens in/out). Each line bills base × multiplier — so the
 * multiplier shown in the UI IS the multiplier billed, one number, no
 * marketing ranges. Margin is computed live against the line's provider cost
 * and a negative margin must block (or require explicit confirmation) at
 * save time.
 *
 * Cost-of-revenue sources (sourceDate 2026-07-16):
 * - Anthropic (Claude API reference, re-checked 2026-08-20): opus-5 $5/$25,
 *   fable-5 $10/$50, opus-4-8 $5/$25, haiku-4-5 $1/$5 per 1M in/out.
 * - OpenAI (GPT-5.6 family GA 2026-07-09): gpt-5.6-sol $5/$30 per 1M.
 */
import { agentRoutingLabel, agentRoutingValidationMessage, type AgentRoutingLocale } from './agent-routing-i18n.js';

export type AgentMode = 'lite' | 'economy' | 'power';

export type AgentRoutingLineKey = AgentMode | 'high-effort' | 'turbo' | 'classifier';

export const AGENT_MODES: AgentMode[] = ['lite', 'economy', 'power'];

export const AGENT_ROUTING_LINE_KEYS: AgentRoutingLineKey[] = [
  'lite',
  'economy',
  'power',
  'high-effort',
  'turbo',
  'classifier',
];

export interface AgentRoutingLine {
  key: AgentRoutingLineKey;

  /** Human label for the admin table only — NEVER shown to end users. */
  label: string;
  provider: string;

  /** Concrete provider model id — NEVER shown to end users. */
  model: string;

  /** Coût de revient, cents per 1,000,000 input tokens. */
  costInCentsPerM: number;

  /** Coût de revient, cents per 1,000,000 output tokens. */
  costOutCentsPerM: number;

  /**
   * Billing multiplier vs the card's base (Economy) user price. The number
   * shown in the UI is the number billed.
   */
  multiplier: number;

  /**
   * false for the harness classifier: its cost is our operating expense,
   * visible in the admin table but never charged to the user.
   */
  billedToUser: boolean;

  /** Plan keys allowed to use this line. Empty array = nobody (line off). */
  availablePlans: string[];
  active: boolean;
}

export interface AgentRoutingCard {
  /** Monotonic version — any change is a NEW version. */
  version: number;

  /** ISO datetime this version became the active config. */
  effectiveFrom: string;

  /** ISO datetime this version stopped being active (unset while active). */
  effectiveTo?: string;

  /** Date the cost-of-revenue figures were sourced from provider pricing. */
  sourceDate: string;
  currency: 'usd';

  /** User price of the Economy (×1) line, cents per 1M input tokens. */
  baseUserInCentsPerM: number;

  /** User price of the Economy (×1) line, cents per 1M output tokens. */
  baseUserOutCentsPerM: number;
  lines: AgentRoutingLine[];
}

export const DEFAULT_AGENT_MODE: AgentMode = 'economy';

const ALL_PLANS = ['free', 'starter', 'core', 'pro', 'team', 'enterprise'];
const PAID_PLANS = ['core', 'pro', 'team', 'enterprise'];

/**
 * Version 3 — Claude Opus 5 becomes the platform's principal generation model
 * (2026-08-20). Economy (the DEFAULT mode, every plan), Power and High effort
 * all route to `claude-opus-5`; only Lite (Haiku 4.5) and Turbo (OpenAI) differ.
 * Base user price = Economy cost × 1.3 (the platform's standing 30% AI margin),
 * so ×1/×2 multipliers keep every line's margin positive — see lineMargins().
 *
 * Margins IMPROVE versus v2: Power / High effort keep their ×2 multiplier while
 * their cost of revenue halves ($10/$50 on Fable 5 → $5/$25 on Opus 5).
 *
 * ⚠️ Product note for the next card revision: Power and High effort now bill ×2
 * for the SAME model Economy bills ×1. The tier ladder no longer differentiates
 * by model — Opus 5's `effort` ladder (high → xhigh) is the natural
 * differentiator, but this card has no effort field. Either re-point Power at
 * `claude-fable-5` (still the higher-capability tier) or add an effort column;
 * both are config decisions, not code.
 *
 * NOTE: this built-in is the SEED for a fresh install and the read fallback.
 * `seedAgentRoutingCard` is one-shot (it returns early when any card row
 * exists), so on an installation that already has a card — production does —
 * shipping this file does NOT change routing. A new version must be PUBLISHED
 * as a card row. That is by design: a model change is config, never a deploy.
 */
export const BUILTIN_AGENT_ROUTING_CARD: AgentRoutingCard = {
  version: 3,
  effectiveFrom: '2026-08-20T00:00:00.000Z',
  sourceDate: '2026-08-20',
  currency: 'usd',
  baseUserInCentsPerM: 650,
  baseUserOutCentsPerM: 3250,
  lines: [
    {
      key: 'lite',
      label: agentRoutingLabel('lite'),
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      costInCentsPerM: 100,
      costOutCentsPerM: 500,
      multiplier: 0.5,
      billedToUser: true,
      availablePlans: ALL_PLANS,
      active: true,
    },
    {
      key: 'economy',
      label: agentRoutingLabel('economy'),
      provider: 'anthropic',
      model: 'claude-opus-5',
      costInCentsPerM: 500,
      costOutCentsPerM: 2500,
      multiplier: 1,
      billedToUser: true,
      availablePlans: ALL_PLANS,
      active: true,
    },
    {
      key: 'power',
      label: agentRoutingLabel('power'),
      provider: 'anthropic',
      model: 'claude-opus-5',
      costInCentsPerM: 500,
      costOutCentsPerM: 2500,
      multiplier: 2,
      billedToUser: true,
      availablePlans: ALL_PLANS,
      active: true,
    },
    {
      key: 'high-effort',
      label: agentRoutingLabel('high-effort'),
      provider: 'anthropic',
      model: 'claude-opus-5',
      costInCentsPerM: 500,
      costOutCentsPerM: 2500,
      multiplier: 2,
      billedToUser: true,
      availablePlans: PAID_PLANS,
      active: true,
    },
    {
      key: 'turbo',
      label: agentRoutingLabel('turbo'),
      provider: 'openai',
      model: 'gpt-5.6-sol',
      costInCentsPerM: 500,
      costOutCentsPerM: 3000,
      multiplier: 2,
      billedToUser: true,
      availablePlans: PAID_PLANS,
      active: true,
    },
    {
      key: 'classifier',
      label: agentRoutingLabel('classifier'),
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      costInCentsPerM: 100,
      costOutCentsPerM: 500,
      multiplier: 0,
      billedToUser: false,
      availablePlans: ALL_PLANS,
      active: true,
    },
  ],
};

export function routingLine(card: AgentRoutingCard, key: AgentRoutingLineKey): AgentRoutingLine | undefined {
  return card.lines.find((line) => line.key === key);
}

export interface AgentLineUserPrice {
  inCentsPerM: number;
  outCentsPerM: number;
}

/** User price of a line: card base × line multiplier (0 when not billed). */
export function lineUserPrice(card: AgentRoutingCard, line: AgentRoutingLine): AgentLineUserPrice {
  if (!line.billedToUser) {
    return { inCentsPerM: 0, outCentsPerM: 0 };
  }

  return {
    inCentsPerM: card.baseUserInCentsPerM * line.multiplier,
    outCentsPerM: card.baseUserOutCentsPerM * line.multiplier,
  };
}

export interface AgentLineMargins {
  /** (price - cost) / price per 1M input tokens; null when price is 0. */
  inputMargin: number | null;

  /** (price - cost) / price per 1M output tokens; null when price is 0. */
  outputMargin: number | null;
  negative: boolean;
}

/** Live margin of a line. A non-billed line (classifier) is pure cost, never "negative margin". */
export function lineMargins(card: AgentRoutingCard, line: AgentRoutingLine): AgentLineMargins {
  if (!line.billedToUser) {
    return { inputMargin: null, outputMargin: null, negative: false };
  }

  const price = lineUserPrice(card, line);
  const inputMargin = price.inCentsPerM > 0 ? (price.inCentsPerM - line.costInCentsPerM) / price.inCentsPerM : null;

  const outputMargin =
    price.outCentsPerM > 0 ? (price.outCentsPerM - line.costOutCentsPerM) / price.outCentsPerM : null;

  const negative =
    (inputMargin !== null && inputMargin < 0) ||
    (outputMargin !== null && outputMargin < 0) ||
    price.inCentsPerM < 0 ||
    price.outCentsPerM < 0;

  return { inputMargin, outputMargin, negative };
}

/** Keys of active billed lines whose margin is negative — the save-blocking alert. */
export function negativeMarginLineKeys(card: AgentRoutingCard): AgentRoutingLineKey[] {
  return card.lines.filter((line) => line.active && lineMargins(card, line).negative).map((line) => line.key);
}

export interface AgentCallBilling {
  /** Coût de revient of the call, fractional cents (never rounded up). */
  costCents: number;

  /** Credits charged to the user, whole cents (ceil), 0 for non-billed lines. */
  creditCents: number;

  /** creditCents - costCents, fractional cents (negative = we lost money). */
  marginCents: number;
  routingCardVersion: number;
  billedToUser: boolean;
}

/**
 * Price ONE call through a routing line. Cost is exact (fractional cents);
 * credits round UP to a whole cent like the rest of the billing stack, with
 * a 1¢ floor on any billed call that consumed tokens (running a model is
 * never free, mirroring machineComputeUnits' never-0 rule).
 */
export function computeAgentCallBilling(
  card: AgentRoutingCard,
  lineKey: AgentRoutingLineKey,
  tokensIn: number,
  tokensOut: number,
): AgentCallBilling | undefined {
  const line = routingLine(card, lineKey);

  if (!line) {
    return undefined;
  }

  const safeIn = Number.isFinite(tokensIn) ? Math.max(0, tokensIn) : 0;
  const safeOut = Number.isFinite(tokensOut) ? Math.max(0, tokensOut) : 0;

  const costCents = (safeIn * line.costInCentsPerM + safeOut * line.costOutCentsPerM) / 1_000_000;

  if (!line.billedToUser) {
    return {
      costCents,
      creditCents: 0,
      marginCents: -costCents,
      routingCardVersion: card.version,
      billedToUser: false,
    };
  }

  const price = lineUserPrice(card, line);
  const rawCredit = (safeIn * price.inCentsPerM + safeOut * price.outCentsPerM) / 1_000_000;
  const creditCents = safeIn + safeOut > 0 ? Math.max(1, Math.ceil(rawCredit)) : 0;

  return {
    costCents,
    creditCents,
    marginCents: creditCents - costCents,
    routingCardVersion: card.version,
    billedToUser: true,
  };
}

export interface AgentModeAvailability {
  mode: AgentMode;
  available: boolean;
  reason?: 'plan' | 'inactive';
  multiplier: number;
}

/**
 * The modes a plan may use, with billing multipliers — and NOTHING else. This
 * shape is safe to hand to the client: no provider, no model id, ever.
 */
export function availableAgentModes(card: AgentRoutingCard, planKey: string): AgentModeAvailability[] {
  return AGENT_MODES.map((mode) => {
    const line = routingLine(card, mode);

    if (!line || !line.active) {
      return { mode, available: false, reason: 'inactive' as const, multiplier: 0 };
    }

    if (!line.availablePlans.includes(planKey)) {
      return { mode, available: false, reason: 'plan' as const, multiplier: line.multiplier };
    }

    return { mode, available: true, multiplier: line.multiplier };
  });
}

/** Whether a switch line (high-effort / turbo) is usable on a plan. */
export function switchAvailableForPlan(card: AgentRoutingCard, key: 'high-effort' | 'turbo', planKey: string): boolean {
  const line = routingLine(card, key);
  return Boolean(line && line.active && line.availablePlans.includes(planKey));
}

export interface AgentRoutingValidationError {
  line?: AgentRoutingLineKey;
  message: string;
}

/** Clone only visible labels; provider/model identifiers and pricing remain unchanged. */
export function localizeAgentRoutingCardLabels(
  card: AgentRoutingCard,
  locale: AgentRoutingLocale = 'en',
): AgentRoutingCard {
  return {
    ...card,
    lines: card.lines.map((line) => ({ ...line, label: agentRoutingLabel(line.key, locale) })),
  };
}

/** Structural validation for an admin-submitted card (before the margin gate). */
export function validateAgentRoutingCard(
  card: AgentRoutingCard,
  locale: AgentRoutingLocale = 'en',
): AgentRoutingValidationError[] {
  const errors: AgentRoutingValidationError[] = [];

  if (!Number.isFinite(card.baseUserInCentsPerM) || card.baseUserInCentsPerM < 0) {
    errors.push({ message: agentRoutingValidationMessage('baseInput', locale) });
  }

  if (!Number.isFinite(card.baseUserOutCentsPerM) || card.baseUserOutCentsPerM < 0) {
    errors.push({ message: agentRoutingValidationMessage('baseOutput', locale) });
  }

  const seen = new Set<string>();

  for (const key of AGENT_ROUTING_LINE_KEYS) {
    const line = routingLine(card, key);

    if (!line) {
      errors.push({ line: key, message: agentRoutingValidationMessage('missingLine', locale, { line: key }) });
      continue;
    }

    if (seen.has(key)) {
      errors.push({ line: key, message: agentRoutingValidationMessage('duplicateLine', locale, { line: key }) });
    }

    seen.add(key);

    if (!line.provider.trim() || !line.model.trim()) {
      errors.push({ line: key, message: agentRoutingValidationMessage('providerModelRequired', locale) });
    }

    if (!Number.isFinite(line.costInCentsPerM) || line.costInCentsPerM < 0) {
      errors.push({ line: key, message: agentRoutingValidationMessage('inputCost', locale) });
    }

    if (!Number.isFinite(line.costOutCentsPerM) || line.costOutCentsPerM < 0) {
      errors.push({ line: key, message: agentRoutingValidationMessage('outputCost', locale) });
    }

    if (!Number.isFinite(line.multiplier) || line.multiplier < 0) {
      errors.push({ line: key, message: agentRoutingValidationMessage('multiplier', locale) });
    }
  }

  for (const line of card.lines) {
    if (!AGENT_ROUTING_LINE_KEYS.includes(line.key)) {
      errors.push({
        line: line.key,
        message: agentRoutingValidationMessage('unknownLine', locale, { line: line.key }),
      });
    }
  }

  const economy = routingLine(card, 'economy');

  if (economy && (!economy.active || economy.multiplier !== 1)) {
    errors.push({ line: 'economy', message: agentRoutingValidationMessage('economyInvariant', locale) });
  }

  return errors;
}
