import { describe, expect, it } from 'vitest';

import {
  AGENT_ROUTING_LINE_KEYS,
  BUILTIN_AGENT_ROUTING_CARD,
  DEFAULT_AGENT_MODE,
  availableAgentModes,
  computeAgentCallBilling,
  lineMargins,
  lineUserPrice,
  localizeAgentRoutingCardLabels,
  negativeMarginLineKeys,
  routingLine,
  switchAvailableForPlan,
  validateAgentRoutingCard,
} from './agent-routing.js';

describe('BUILTIN_AGENT_ROUTING_CARD', () => {
  it('is version 3, sourced 2026-08-20, with all six lines', () => {
    expect(BUILTIN_AGENT_ROUTING_CARD.version).toBe(3);
    expect(BUILTIN_AGENT_ROUTING_CARD.sourceDate).toBe('2026-08-20');
    expect(BUILTIN_AGENT_ROUTING_CARD.lines.map((l) => l.key).sort()).toEqual([...AGENT_ROUTING_LINE_KEYS].sort());
  });

  it("matches Avi's target config: Opus 5 is the principal generation model, turbo=gpt-5.6 ×2", () => {
    const economy = routingLine(BUILTIN_AGENT_ROUTING_CARD, 'economy')!;
    expect(economy.model).toBe('claude-opus-5');
    expect(economy.multiplier).toBe(1);

    // Opus 5 is the principal model: the DEFAULT mode and both escalation lines.
    expect(routingLine(BUILTIN_AGENT_ROUTING_CARD, 'power')!.model).toBe('claude-opus-5');

    const highEffort = routingLine(BUILTIN_AGENT_ROUTING_CARD, 'high-effort')!;
    expect(highEffort.model).toBe('claude-opus-5');
    expect(highEffort.multiplier).toBe(2);

    const turbo = routingLine(BUILTIN_AGENT_ROUTING_CARD, 'turbo')!;
    expect(turbo.provider).toBe('openai');
    expect(turbo.model).toBe('gpt-5.6-sol');
    expect(turbo.multiplier).toBe(2);
  });

  it('defaults to economy and validates clean with no negative margin anywhere', () => {
    expect(DEFAULT_AGENT_MODE).toBe('economy');
    expect(validateAgentRoutingCard(BUILTIN_AGENT_ROUTING_CARD)).toEqual([]);
    expect(negativeMarginLineKeys(BUILTIN_AGENT_ROUTING_CARD)).toEqual([]);
  });

  it('classifier is never billed to the user but its cost stays visible', () => {
    const classifier = routingLine(BUILTIN_AGENT_ROUTING_CARD, 'classifier')!;
    expect(classifier.billedToUser).toBe(false);
    expect(classifier.costInCentsPerM).toBeGreaterThan(0);
    expect(lineUserPrice(BUILTIN_AGENT_ROUTING_CARD, classifier)).toEqual({ inCentsPerM: 0, outCentsPerM: 0 });
  });
});

describe('lineMargins', () => {
  it('computes economy margin as (650-500)/650 ≈ 23% on input', () => {
    const economy = routingLine(BUILTIN_AGENT_ROUTING_CARD, 'economy')!;
    const margins = lineMargins(BUILTIN_AGENT_ROUTING_CARD, economy);
    expect(margins.inputMargin).toBeCloseTo((650 - 500) / 650, 5);
    expect(margins.outputMargin).toBeCloseTo((3250 - 2500) / 3250, 5);
    expect(margins.negative).toBe(false);
  });

  it('flags a negative margin when the price no longer covers the cost', () => {
    const card = structuredClone(BUILTIN_AGENT_ROUTING_CARD);
    const economy = card.lines.find((l) => l.key === 'economy')!;
    economy.costInCentsPerM = 10_000;

    expect(lineMargins(card, economy).negative).toBe(true);
    expect(negativeMarginLineKeys(card)).toEqual(['economy']);
  });

  it('never flags the unbilled classifier as negative margin', () => {
    const card = structuredClone(BUILTIN_AGENT_ROUTING_CARD);
    const classifier = card.lines.find((l) => l.key === 'classifier')!;
    classifier.costInCentsPerM = 999_999;

    expect(lineMargins(card, classifier).negative).toBe(false);
    expect(negativeMarginLineKeys(card)).toEqual([]);
  });
});

describe('computeAgentCallBilling', () => {
  it('bills economy at base price and keeps cost fractional', () => {
    const billing = computeAgentCallBilling(BUILTIN_AGENT_ROUTING_CARD, 'economy', 100_000, 10_000)!;

    // cost = (100k*500 + 10k*2500)/1M = 75 cents; credit = ceil((100k*650 + 10k*3250)/1M) = ceil(97.5) = 98
    expect(billing.costCents).toBeCloseTo(75, 5);
    expect(billing.creditCents).toBe(98);
    expect(billing.marginCents).toBeCloseTo(23, 5);
    expect(billing.billedToUser).toBe(true);
    expect(billing.routingCardVersion).toBe(3);
  });

  it('bills power/high-effort at 2x economy for the same tokens', () => {
    const economy = computeAgentCallBilling(BUILTIN_AGENT_ROUTING_CARD, 'economy', 50_000, 50_000)!;
    const power = computeAgentCallBilling(BUILTIN_AGENT_ROUTING_CARD, 'power', 50_000, 50_000)!;
    expect(power.creditCents).toBe(economy.creditCents * 2);
  });

  it('floors any billed token-consuming call at 1 cent, and bills 0 for 0 tokens', () => {
    expect(computeAgentCallBilling(BUILTIN_AGENT_ROUTING_CARD, 'lite', 10, 10)!.creditCents).toBe(1);
    expect(computeAgentCallBilling(BUILTIN_AGENT_ROUTING_CARD, 'lite', 0, 0)!.creditCents).toBe(0);
  });

  it('charges nothing for the classifier: its cost is a negative margin we absorb', () => {
    const billing = computeAgentCallBilling(BUILTIN_AGENT_ROUTING_CARD, 'classifier', 2_000, 100)!;
    expect(billing.creditCents).toBe(0);
    expect(billing.costCents).toBeGreaterThan(0);
    expect(billing.marginCents).toBeLessThan(0);
  });

  it('returns undefined for an unknown line', () => {
    expect(computeAgentCallBilling(BUILTIN_AGENT_ROUTING_CARD, 'nope' as never, 1, 1)).toBeUndefined();
  });
});

describe('availability by plan', () => {
  it('gives free plan the three modes but not the switches', () => {
    const modes = availableAgentModes(BUILTIN_AGENT_ROUTING_CARD, 'free');
    expect(modes.every((m) => m.available)).toBe(true);
    expect(switchAvailableForPlan(BUILTIN_AGENT_ROUTING_CARD, 'high-effort', 'free')).toBe(false);
    expect(switchAvailableForPlan(BUILTIN_AGENT_ROUTING_CARD, 'turbo', 'free')).toBe(false);
  });

  it('refuses a mode removed from a plan with reason "plan"', () => {
    const card = structuredClone(BUILTIN_AGENT_ROUTING_CARD);
    card.lines.find((l) => l.key === 'power')!.availablePlans = ['enterprise'];

    const modes = availableAgentModes(card, 'free');
    const power = modes.find((m) => m.mode === 'power')!;
    expect(power.available).toBe(false);
    expect(power.reason).toBe('plan');
  });

  it('exposes no provider or model id in the client-safe shape', () => {
    for (const mode of availableAgentModes(BUILTIN_AGENT_ROUTING_CARD, 'pro')) {
      expect(JSON.stringify(mode)).not.toMatch(/claude|gpt|anthropic|openai/i);
    }
  });
});

describe('validateAgentRoutingCard', () => {
  it('rejects a card missing a line', () => {
    const card = structuredClone(BUILTIN_AGENT_ROUTING_CARD);
    card.lines = card.lines.filter((l) => l.key !== 'turbo');
    expect(validateAgentRoutingCard(card).some((e) => e.line === 'turbo')).toBe(true);
  });

  it('rejects economy deactivated or re-multiplied (it is the default mode)', () => {
    const card = structuredClone(BUILTIN_AGENT_ROUTING_CARD);
    card.lines.find((l) => l.key === 'economy')!.multiplier = 2;
    expect(validateAgentRoutingCard(card).some((e) => e.line === 'economy')).toBe(true);
  });

  it('rejects negative prices and empty models', () => {
    const card = structuredClone(BUILTIN_AGENT_ROUTING_CARD);
    card.lines.find((l) => l.key === 'lite')!.model = ' ';
    card.lines.find((l) => l.key === 'power')!.costInCentsPerM = -1;

    const errors = validateAgentRoutingCard(card);
    expect(errors.some((e) => e.line === 'lite')).toBe(true);
    expect(errors.some((e) => e.line === 'power')).toBe(true);
  });

  it('rejects provider costs that cannot be represented exactly in millicents', () => {
    const invalid = structuredClone(BUILTIN_AGENT_ROUTING_CARD);
    invalid.lines.find((line) => line.key === 'classifier')!.costInCentsPerM = 0.3333;
    expect(validateAgentRoutingCard(invalid).some((error) => error.line === 'classifier')).toBe(true);

    const valid = structuredClone(BUILTIN_AGENT_ROUTING_CARD);
    valid.lines.find((line) => line.key === 'classifier')!.costInCentsPerM = 0.333;
    expect(validateAgentRoutingCard(valid)).toEqual([]);

    const unsafe = structuredClone(BUILTIN_AGENT_ROUTING_CARD);
    unsafe.lines.find((line) => line.key === 'classifier')!.costInCentsPerM = Number.MAX_SAFE_INTEGER;
    expect(validateAgentRoutingCard(unsafe).some((error) => error.line === 'classifier')).toBe(true);
  });

  it('localizes French validation copy without translating schema identifiers', () => {
    const card = structuredClone(BUILTIN_AGENT_ROUTING_CARD);
    card.lines = card.lines.filter((line) => line.key !== 'turbo');

    expect(validateAgentRoutingCard(card, 'fr')).toContainEqual({
      line: 'turbo',
      message: 'ligne de routage manquante « turbo »',
    });
  });
});

describe('localizeAgentRoutingCardLabels', () => {
  it('translates visible labels and preserves routing identifiers and prices', () => {
    const localized = localizeAgentRoutingCardLabels(BUILTIN_AGENT_ROUTING_CARD, 'fr');
    const economy = routingLine(localized, 'economy')!;

    expect(economy.label).toBe('Économie');
    expect(economy.key).toBe('economy');
    expect(economy.provider).toBe('anthropic');
    expect(economy.model).toBe('claude-opus-5');
    expect(economy.costInCentsPerM).toBe(500);
    expect(BUILTIN_AGENT_ROUTING_CARD.lines.find((line) => line.key === 'economy')?.label).toBe('Economy');
  });
});
