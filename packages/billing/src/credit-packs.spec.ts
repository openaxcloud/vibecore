import { describe, expect, it } from 'vitest';
import {
  BUILD_TIER_ESTIMATE_MULTIPLIER,
  TURBO_ESTIMATE_MULTIPLIER,
  computeCreditCostCents,
  creditRolloverMonths,
  estimateCheckpointCostCents,
  evaluateSpendLimits,
  planPackConsumption,
} from './credits.js';

describe('power-tier estimates', () => {
  it('scales by build tier (lite < economy < power)', () => {
    const lite = estimateCheckpointCostCents({ baseProviderCents: 100, buildTier: 'lite' });
    const economy = estimateCheckpointCostCents({ baseProviderCents: 100, buildTier: 'economy' });
    const power = estimateCheckpointCostCents({ baseProviderCents: 100, buildTier: 'power' });
    expect(lite).toBeLessThan(economy);
    expect(economy).toBeLessThan(power);
    expect(economy).toBe(computeCreditCostCents({ rawProviderCents: 100 }));
  });

  it('applies turbo at the reservation ceiling', () => {
    const base = estimateCheckpointCostCents({ baseProviderCents: 100, buildTier: 'economy' });
    const turbo = estimateCheckpointCostCents({ baseProviderCents: 100, buildTier: 'economy', turboMode: true });
    expect(turbo).toBe(computeCreditCostCents({ rawProviderCents: 100 * TURBO_ESTIMATE_MULTIPLIER }));
    expect(turbo).toBeGreaterThan(base);
  });

  it('stacks tier × high-power × extended-thinking × turbo', () => {
    const stacked = estimateCheckpointCostCents({
      baseProviderCents: 10,
      buildTier: 'power',
      highPowerModel: true,
      extendedThinking: true,
      turboMode: true,
    });
    const expected =
      10 * BUILD_TIER_ESTIMATE_MULTIPLIER.power * 4 * 2.5 * TURBO_ESTIMATE_MULTIPLIER;
    expect(stacked).toBe(computeCreditCostCents({ rawProviderCents: expected }));
  });
});

describe('creditRolloverMonths', () => {
  it('is 1 for Pro, 0 otherwise', () => {
    expect(creditRolloverMonths('pro')).toBe(1);
    expect(creditRolloverMonths('team')).toBe(1); // legacy team → pro
    expect(creditRolloverMonths('core')).toBe(0);
    expect(creditRolloverMonths('starter')).toBe(0);
  });
});

describe('planPackConsumption', () => {
  const now = 1_000_000;
  const future = (ms: number) => new Date(now + ms).toISOString();

  it('draws from earliest-expiring pack first, then balance', () => {
    const plan = planPackConsumption({
      amountCents: 500,
      nowMs: now,
      packs: [
        { id: 'late', remainingCents: 1000, expiresAt: future(200) },
        { id: 'early', remainingCents: 300, expiresAt: future(100) },
      ],
    });
    // 300 from 'early' (expires first), 200 from 'late', 0 from balance.
    expect(plan.packDebits).toEqual([
      { packId: 'early', cents: 300 },
      { packId: 'late', cents: 200 },
    ]);
    expect(plan.remainingFromBalance).toBe(0);
  });

  it('skips expired and empty packs and leaves remainder for balance', () => {
    const plan = planPackConsumption({
      amountCents: 400,
      nowMs: now,
      packs: [
        { id: 'expired', remainingCents: 1000, expiresAt: future(-10) },
        { id: 'empty', remainingCents: 0, expiresAt: future(100) },
        { id: 'small', remainingCents: 150, expiresAt: future(50) },
      ],
    });
    expect(plan.packDebits).toEqual([{ packId: 'small', cents: 150 }]);
    expect(plan.remainingFromBalance).toBe(250);
  });
});

describe('evaluateSpendLimits', () => {
  it('flags usage limit and service shutdown independently', () => {
    expect(evaluateSpendLimits({ paygSpentCents: 600, budgetCapCents: 500, serviceShutdownCents: 1000 })).toEqual({
      usageLimitReached: true,
      serviceShutdownReached: false,
    });
    expect(evaluateSpendLimits({ paygSpentCents: 1200, budgetCapCents: 500, serviceShutdownCents: 1000 })).toEqual({
      usageLimitReached: true,
      serviceShutdownReached: true,
    });
    expect(evaluateSpendLimits({ paygSpentCents: 100 })).toEqual({
      usageLimitReached: false,
      serviceShutdownReached: false,
    });
  });
});
