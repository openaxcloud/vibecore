import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_MARGIN,
  computeCreditCostCents,
  estimateCheckpointCostCents,
  evaluateCreditGate,
  paygAlertThresholdCrossed,
  planCreditConfig,
  sumLedgerCents,
  toCreditPlanKey,
  HIGH_POWER_ESTIMATE_MULTIPLIER,
  EXTENDED_THINKING_ESTIMATE_MULTIPLIER,
  ORG_BUDGET_INCREMENT_CENTS,
  isValidOrgBudgetCents,
  roundOrgBudgetToIncrementCents,
  premiumAgentModesEligible,
  gatePremiumAgentModes,
} from './credits.js';

describe('computeCreditCostCents', () => {
  it('applies the default margin and rounds up', () => {
    // 100¢ provider cost + 30% margin = 130¢
    expect(computeCreditCostCents({ rawProviderCents: 100 })).toBe(130);
  });

  it('adds compute cost without margin', () => {
    expect(computeCreditCostCents({ rawProviderCents: 100, computeCents: 50 })).toBe(180);
  });

  it('respects a custom margin', () => {
    expect(computeCreditCostCents({ rawProviderCents: 200, margin: 0.5 })).toBe(300);
  });

  it('never charges below the raw provider cost even at zero margin', () => {
    expect(computeCreditCostCents({ rawProviderCents: 17, margin: 0 })).toBe(17);
  });

  it('clamps non-finite / negative inputs to zero', () => {
    expect(computeCreditCostCents({ rawProviderCents: Number.NaN })).toBe(0);
    expect(computeCreditCostCents({ rawProviderCents: -50 })).toBe(0);
    expect(computeCreditCostCents({ rawProviderCents: 100, computeCents: -10 })).toBe(130);
  });

  it('uses DEFAULT_AI_MARGIN when margin is non-finite', () => {
    expect(computeCreditCostCents({ rawProviderCents: 100, margin: Number.NaN })).toBe(
      Math.ceil(100 * (1 + DEFAULT_AI_MARGIN)),
    );
  });
});

describe('estimateCheckpointCostCents', () => {
  it('inflates by the high-power multiplier', () => {
    const base = estimateCheckpointCostCents({ baseProviderCents: 100 });
    const high = estimateCheckpointCostCents({ baseProviderCents: 100, highPowerModel: true });
    expect(high).toBe(computeCreditCostCents({ rawProviderCents: 100 * HIGH_POWER_ESTIMATE_MULTIPLIER }));
    expect(high).toBeGreaterThan(base);
  });

  it('adds high-power and extended-thinking surcharges (not compounding)', () => {
    const both = estimateCheckpointCostCents({
      baseProviderCents: 100,
      highPowerModel: true,
      extendedThinking: true,
    });
    // Additive: surcharges sum (high-power +3, extended-thinking +1.5 → +4.5),
    // not the old 4 × 2.5 = 10× product.
    const surcharge = HIGH_POWER_ESTIMATE_MULTIPLIER - 1 + (EXTENDED_THINKING_ESTIMATE_MULTIPLIER - 1);
    const expectedProvider = 100 * (1 + surcharge);
    expect(both).toBe(computeCreditCostCents({ rawProviderCents: expectedProvider }));
    const compounded = 100 * HIGH_POWER_ESTIMATE_MULTIPLIER * EXTENDED_THINKING_ESTIMATE_MULTIPLIER;
    expect(both).toBeLessThan(computeCreditCostCents({ rawProviderCents: compounded }));
  });
});

describe('toCreditPlanKey', () => {
  it('passes through target keys', () => {
    expect(toCreditPlanKey('core')).toBe('core');
    expect(toCreditPlanKey('pro')).toBe('pro');
  });

  it('maps legacy keys to the migration target', () => {
    expect(toCreditPlanKey('free')).toBe('starter');
    expect(toCreditPlanKey('team')).toBe('pro');
  });

  it('defaults unknown/undefined to starter', () => {
    expect(toCreditPlanKey(undefined)).toBe('starter');
    expect(toCreditPlanKey('mystery')).toBe('starter');
  });
});

describe('planCreditConfig', () => {
  it('grants Starter daily and Core/Pro monthly', () => {
    expect(planCreditConfig.starter.dailyCreditCents).toBeGreaterThan(0);
    expect(planCreditConfig.starter.monthlyCreditCents).toBe(0);
    expect(planCreditConfig.starter.rollover).toBe(false);
    expect(planCreditConfig.core.monthlyCreditCents).toBe(2500);
    expect(planCreditConfig.pro.monthlyCreditCents).toBe(10_000);
  });

  // Replit publishes no precise Starter $ figure (official wording: "Free daily
  // Agent credits", daily reset, no rollover); Core=$25/mo is the only anchor.
  // 25¢/day is our documented official-closest default — lock it so any change
  // is deliberate (see the provenance note on planCreditConfig).
  it('pins the documented Starter daily credit amount (25 cents/day)', () => {
    expect(planCreditConfig.starter.dailyCreditCents).toBe(25);
  });
});

describe('sumLedgerCents', () => {
  it('sums signed deltas', () => {
    expect(sumLedgerCents([{ deltaCents: 2500 }, { deltaCents: -130 }, { deltaCents: -70 }])).toBe(2300);
  });

  it('ignores non-finite deltas', () => {
    expect(sumLedgerCents([{ deltaCents: 100 }, { deltaCents: Number.NaN }])).toBe(100);
  });
});

describe('evaluateCreditGate', () => {
  it('allows when balance covers the estimate', () => {
    expect(evaluateCreditGate({ balanceCents: 500, estimatedCents: 130 })).toEqual({
      ok: true,
      mode: 'credits',
    });
  });

  it('blocks when balance is short and PAYG is disabled', () => {
    expect(evaluateCreditGate({ balanceCents: 50, estimatedCents: 130 })).toEqual({
      ok: false,
      mode: 'blocked',
      reason: 'insufficient_credits',
    });
  });

  it('allows PAYG overage under the cap', () => {
    expect(
      evaluateCreditGate({ balanceCents: 0, estimatedCents: 130, budgetCapCents: 1000, paygSpentCents: 100 }),
    ).toEqual({ ok: true, mode: 'payg' });
  });

  it('blocks PAYG once the cap would be exceeded', () => {
    expect(
      evaluateCreditGate({ balanceCents: 0, estimatedCents: 500, budgetCapCents: 1000, paygSpentCents: 800 }),
    ).toEqual({ ok: false, mode: 'blocked', reason: 'budget_cap_reached' });
  });

  it('charges PAYG only for the portion not covered by remaining balance', () => {
    // balance 100, estimate 130 → overage 30; cap 1000, spent 980 → 980+30=1010 > cap → blocked
    expect(
      evaluateCreditGate({ balanceCents: 100, estimatedCents: 130, budgetCapCents: 1000, paygSpentCents: 980 }),
    ).toEqual({ ok: false, mode: 'blocked', reason: 'budget_cap_reached' });
  });

  it('blocks a member at their per-user cap even when the org has credits', () => {
    // Org has ample balance, but the member's own cap (100) is reached (spent 80 + est 30 = 110 > 100).
    expect(
      evaluateCreditGate({ balanceCents: 100_000, estimatedCents: 30, userLimitCents: 100, userSpentCents: 80 }),
    ).toEqual({ ok: false, mode: 'blocked', reason: 'user_limit_reached' });
  });

  it('allows a member under their per-user cap (falls through to the org gate)', () => {
    expect(
      evaluateCreditGate({ balanceCents: 100_000, estimatedCents: 30, userLimitCents: 100, userSpentCents: 50 }),
    ).toEqual({ ok: true, mode: 'credits' });
  });

  it('ignores the per-user cap when no member override is set (null)', () => {
    expect(
      evaluateCreditGate({ balanceCents: 500, estimatedCents: 130, userLimitCents: null, userSpentCents: 9999 }),
    ).toEqual({ ok: true, mode: 'credits' });
  });
});

describe('paygAlertThresholdCrossed', () => {
  it('returns the highest crossed threshold', () => {
    expect(paygAlertThresholdCrossed(850, 1000)).toBe(0.8);
    expect(paygAlertThresholdCrossed(1000, 1000)).toBe(1.0);
    expect(paygAlertThresholdCrossed(500, 1000)).toBe(0.5);
  });

  it('returns null below 50% or for invalid caps', () => {
    expect(paygAlertThresholdCrossed(100, 1000)).toBeNull();
    expect(paygAlertThresholdCrossed(100, 0)).toBeNull();
  });
});

describe('org budget $500 increments', () => {
  it('accepts only non-negative multiples of $500', () => {
    expect(ORG_BUDGET_INCREMENT_CENTS).toBe(50_000);
    expect(isValidOrgBudgetCents(0)).toBe(true);
    expect(isValidOrgBudgetCents(50_000)).toBe(true);
    expect(isValidOrgBudgetCents(150_000)).toBe(true);
    expect(isValidOrgBudgetCents(50_100)).toBe(false);
    expect(isValidOrgBudgetCents(-50_000)).toBe(false);
    expect(isValidOrgBudgetCents(Number.NaN)).toBe(false);
  });

  it('rounds a requested cap up to the next $500 increment', () => {
    expect(roundOrgBudgetToIncrementCents(0)).toBe(0);
    expect(roundOrgBudgetToIncrementCents(1)).toBe(50_000);
    expect(roundOrgBudgetToIncrementCents(50_000)).toBe(50_000);
    expect(roundOrgBudgetToIncrementCents(50_100)).toBe(100_000);
    expect(roundOrgBudgetToIncrementCents(-5)).toBe(0);
    expect(roundOrgBudgetToIncrementCents(Number.NaN)).toBe(0);
  });
});

describe('premiumAgentModesEligible (Turbo / high-power gating)', () => {
  it('blocks the free tier', () => {
    expect(premiumAgentModesEligible('free')).toBe(false);
    expect(premiumAgentModesEligible('starter')).toBe(false);
    expect(premiumAgentModesEligible('STARTER')).toBe(false);
  });

  it('allows all paid tiers (core / pro / team / enterprise)', () => {
    for (const key of ['core', 'pro', 'team', 'enterprise']) {
      expect(premiumAgentModesEligible(key)).toBe(true);
    }
  });

  it('fails closed for unknown / undefined plans', () => {
    expect(premiumAgentModesEligible(undefined)).toBe(false);
    expect(premiumAgentModesEligible(null)).toBe(false);
    expect(premiumAgentModesEligible('')).toBe(false);
    expect(premiumAgentModesEligible('some-future-plan')).toBe(false);
  });
});

describe('gatePremiumAgentModes', () => {
  it('strips turbo + high-power for an ineligible (free) plan and flags it', () => {
    const result = gatePremiumAgentModes(
      { turboMode: true, highPowerModel: true, extendedThinking: true, buildTier: 'power' },
      'free',
    );
    expect(result.gated).toBe(true);
    expect(result.modes.turboMode).toBe(false);
    expect(result.modes.highPowerModel).toBe(false);
    // Extended thinking + build tier are NOT gated.
    expect(result.modes.extendedThinking).toBe(true);
    expect(result.modes.buildTier).toBe('power');
  });

  it('passes modes through untouched for an eligible plan', () => {
    const modes = { turboMode: true, highPowerModel: true };
    const result = gatePremiumAgentModes(modes, 'pro');
    expect(result.gated).toBe(false);
    expect(result.modes).toBe(modes);
  });

  it('reports gated=false when an ineligible plan did not request premium modes', () => {
    const result = gatePremiumAgentModes({ turboMode: false, highPowerModel: false }, 'free');
    expect(result.gated).toBe(false);
    expect(result.modes.turboMode).toBe(false);
  });
});
