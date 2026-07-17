import { describe, expect, it } from 'vitest';

import { machineSizeHourlyDollars, type DeployRateCard } from './projects.$projectId.deployments';

const card: DeployRateCard = {
  version: 1,
  currency: 'usd',
  compute: { unitCents: 320 / 1_000_000, requestCents: 120 / 1_000_000 },
  planKey: 'free',
  defaultMachineSize: 'shared-0.5',
  machineSizes: [
    {
      key: 'shared-0.5',
      label: '0.5 vCPU · 2 GiB',
      vcpu: 0.5,
      ramGb: 2,
      computeUnitsPerSecond: 13,
      available: true,
    },
    {
      key: 'dedicated-8',
      label: '8 vCPU · 32 GiB',
      vcpu: 8,
      ramGb: 32,
      computeUnitsPerSecond: 208,
      available: false,
      reason: 'plan',
    },
  ],
};

describe('machineSizeHourlyDollars', () => {
  it('prices an active hour from the card (units/s × 3600 × unit price)', () => {
    // 13 u/s × 3600 = 46800 units/h × $3.20/M ≈ 15¢/h.
    expect(machineSizeHourlyDollars(card, card.machineSizes[0])).toBe('$0.150');

    // 208 u/s × 3600 = 748800 units/h × $3.20/M ≈ $2.40/h.
    expect(machineSizeHourlyDollars(card, card.machineSizes[1])).toBe('$2.40');
  });

  it('never renders a $0.000 price for a real size (billing is never zero)', () => {
    for (const size of card.machineSizes) {
      expect(machineSizeHourlyDollars(card, size)).not.toBe('$0.000');
    }
  });
});
