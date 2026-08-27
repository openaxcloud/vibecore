import { describe, expect, it } from 'vitest';

import {
  machineSizeHourlyDollars,
  parseReservedVmSubmission,
  type DeployRateCard,
} from './projects.$projectId.deployments';

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
  reservedVm: {
    enabled: false,
    reasonCode: 'PAID_PLAN_REQUIRED',
    paidPlanEligible: false,
    termsVersion: 'reserved-vm-2026-08',
    tiers: [
      { id: 'shared-0.5', label: 'Shared 0.5', vcpu: 0.5, memoryGb: 2, monthlyPriceCents: 2_000 },
      { id: 'dedicated-1', label: 'Dedicated 1', vcpu: 1, memoryGb: 4, monthlyPriceCents: 4_000 },
      { id: 'dedicated-2', label: 'Dedicated 2', vcpu: 2, memoryGb: 8, monthlyPriceCents: 8_000 },
      { id: 'dedicated-4', label: 'Dedicated 4', vcpu: 4, memoryGb: 16, monthlyPriceCents: 16_000 },
    ],
  },
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

describe('parseReservedVmSubmission', () => {
  it('accepts explicit consent tied to one exact tier, terms revision and monthly price', () => {
    expect(
      parseReservedVmSubmission({
        reservedVmConfirmation: 'on',
        reservedVmTier: 'dedicated-2',
        reservedVmTermsVersion: 'reserved-vm-2026-08',
        reservedVmMonthlyPriceCents: '8000',
      }),
    ).toEqual({
      ok: true,
      value: {
        tier: 'dedicated-2',
        termsVersion: 'reserved-vm-2026-08',
        monthlyPriceCents: 8_000,
      },
    });
  });

  it('fails closed without consent or when tier, terms, or price are tampered', () => {
    expect(
      parseReservedVmSubmission({
        reservedVmTier: 'shared-0.5',
        reservedVmTermsVersion: 'reserved-vm-2026-08',
        reservedVmMonthlyPriceCents: '2000',
      }),
    ).toEqual({ ok: false, reason: 'confirmation' });

    for (const fields of [
      { reservedVmTier: 'unknown', reservedVmTermsVersion: 'reserved-vm-2026-08', reservedVmMonthlyPriceCents: '2000' },
      { reservedVmTier: 'shared-0.5', reservedVmTermsVersion: '', reservedVmMonthlyPriceCents: '2000' },
      {
        reservedVmTier: 'shared-0.5',
        reservedVmTermsVersion: 'reserved-vm-2026-08',
        reservedVmMonthlyPriceCents: '4000',
      },
      {
        reservedVmTier: 'shared-0.5',
        reservedVmTermsVersion: 'reserved-vm-2026-08',
        reservedVmMonthlyPriceCents: 'NaN',
      },
    ]) {
      expect(parseReservedVmSubmission({ reservedVmConfirmation: 'on', ...fields })).toEqual({
        ok: false,
        reason: 'pricing',
      });
    }
  });
});
