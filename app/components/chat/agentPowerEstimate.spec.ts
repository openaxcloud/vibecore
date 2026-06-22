import { describe, expect, it } from 'vitest';
import type { AgentPowerControlsValue } from './AgentPowerControls';
import { DEFAULT_AI_MARGIN, POWER_ESTIMATE, estimateAgentPowerCents } from './agentPowerEstimate';

const BASE: AgentPowerControlsValue = {
  highPowerModel: false,
  extendedThinking: false,
  turboMode: false,
  buildTier: 'economy',
};

/**
 * Re-implements the server's `computeCreditCostCents` (packages/billing) so the
 * test asserts the client preview matches what the server reserves/charges,
 * rather than re-deriving the same arithmetic the implementation uses.
 */
function serverCredits(rawProviderCents: number): number {
  return Math.ceil(rawProviderCents * (1 + DEFAULT_AI_MARGIN));
}

describe('estimateAgentPowerCents', () => {
  it('keeps DEFAULT_AI_MARGIN in sync with the server (0.3)', () => {
    expect(DEFAULT_AI_MARGIN).toBe(0.3);
  });

  it('applies the 30% AI margin the server reserves (economy baseline)', () => {
    // 25 cents raw → ceil(25 * 1.3) = 33, not the un-margined 25.
    expect(estimateAgentPowerCents(BASE)).toBe(serverCredits(POWER_ESTIMATE.baselineCents));
    expect(estimateAgentPowerCents(BASE)).toBe(33);
  });

  it('scales the base by the build tier before the margin', () => {
    const power = estimateAgentPowerCents({ ...BASE, buildTier: 'power' });
    expect(power).toBe(serverCredits(POWER_ESTIMATE.baselineCents * POWER_ESTIMATE.buildTier.power));

    const lite = estimateAgentPowerCents({ ...BASE, buildTier: 'lite' });
    expect(lite).toBe(serverCredits(POWER_ESTIMATE.baselineCents * POWER_ESTIMATE.buildTier.lite));
  });

  it('treats each power boost as an additive surcharge (single boost = its multiple)', () => {
    const highPower = estimateAgentPowerCents({ ...BASE, highPowerModel: true });
    expect(highPower).toBe(serverCredits(POWER_ESTIMATE.baselineCents * POWER_ESTIMATE.highPower));

    const turbo = estimateAgentPowerCents({ ...BASE, turboMode: true });
    expect(turbo).toBe(serverCredits(POWER_ESTIMATE.baselineCents * POWER_ESTIMATE.turbo));
  });

  it('sums surcharges (additive) instead of compounding them', () => {
    const stackedSurcharge =
      POWER_ESTIMATE.highPower - 1 + (POWER_ESTIMATE.extendedThinking - 1) + (POWER_ESTIMATE.turbo - 1);

    const expectedRaw = POWER_ESTIMATE.baselineCents * (1 + stackedSurcharge);

    const stacked = estimateAgentPowerCents({
      ...BASE,
      highPowerModel: true,
      extendedThinking: true,
      turboMode: true,
    });

    expect(stacked).toBe(serverCredits(expectedRaw));

    // Far below the old compounding ×4 × 2.5 × 6 product.
    const compounded =
      POWER_ESTIMATE.baselineCents * POWER_ESTIMATE.highPower * POWER_ESTIMATE.extendedThinking * POWER_ESTIMATE.turbo;
    expect(stacked).toBeLessThan(serverCredits(compounded));
  });

  it('rounds up (ceil), never under-charging the preview', () => {
    // power tier (×1.8) → 45 raw → ceil(45 * 1.3) = ceil(58.5) = 59.
    expect(estimateAgentPowerCents({ ...BASE, buildTier: 'power' })).toBe(59);
  });
});
