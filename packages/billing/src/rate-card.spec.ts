import { describe, expect, it } from 'vitest';

import {
  BUILTIN_RATE_CARD,
  DEFAULT_DEPLOY_MACHINE_SIZE,
  DEPLOY_MACHINE_SIZES,
  availableMachineSizes,
  machineComputeUnits,
  machineSizeFromCard,
} from './rate-card.js';

describe('rate card machine sizes', () => {
  it('offers the full Replit ladder 0.25 → 8 vCPU with RAM = 4×vCPU', () => {
    const sizes = BUILTIN_RATE_CARD.machineSizes;

    expect(sizes.map((s) => s.vcpu)).toEqual([0.25, 0.5, 1, 2, 4, 8]);

    for (const size of sizes) {
      expect(size.ramGb).toBe(size.vcpu * 4);
      expect(size.cpuMillicores).toBe(Math.round(size.vcpu * 1000));
      expect(size.ramMb).toBe(size.ramGb * 1024);
    }
  });

  it('pre-computes units/second with the Replit formula (18/CPU-s + 2/GiB-s)', () => {
    // 1 vCPU · 4 GiB → 18 + 8 = 26 units per active second.
    expect(DEPLOY_MACHINE_SIZES['dedicated-1'].computeUnitsPerSecond).toBe(26);

    // 0.25 vCPU · 1 GiB → 4.5 + 2 = 6.5.
    expect(DEPLOY_MACHINE_SIZES['shared-0.25'].computeUnitsPerSecond).toBe(6.5);
  });

  it('degrades unknown/absent size keys to the default instead of throwing', () => {
    expect(machineSizeFromCard(BUILTIN_RATE_CARD, 'no-such-size').key).toBe(DEFAULT_DEPLOY_MACHINE_SIZE);
    expect(machineSizeFromCard(BUILTIN_RATE_CARD, undefined).key).toBe(DEFAULT_DEPLOY_MACHINE_SIZE);
    expect(machineSizeFromCard(BUILTIN_RATE_CARD, 'dedicated-8').key).toBe('dedicated-8');
  });
});

describe('machineComputeUnits', () => {
  it('never bills 0 for a non-empty active window', () => {
    const smallest = DEPLOY_MACHINE_SIZES['shared-0.25'];

    // Sub-second wake-and-die window still bills at least 1 unit.
    expect(machineComputeUnits(smallest, 0.01)).toBe(1);
    expect(machineComputeUnits(smallest, 0)).toBe(0);
  });

  it('bills the formula for real windows', () => {
    // dedicated-2 (2 vCPU · 8 GiB) = 36 + 16 = 52 u/s → 300s = 15600 units.
    expect(machineComputeUnits(DEPLOY_MACHINE_SIZES['dedicated-2'], 300)).toBe(15_600);
  });

  it('treats NaN/negative durations as empty windows', () => {
    expect(machineComputeUnits(DEPLOY_MACHINE_SIZES['dedicated-1'], Number.NaN)).toBe(0);
    expect(machineComputeUnits(DEPLOY_MACHINE_SIZES['dedicated-1'], -5)).toBe(0);
  });
});

describe('availableMachineSizes', () => {
  it('blocks 8 vCPU on the free plan (plan gate)', () => {
    const sizes = availableMachineSizes(BUILTIN_RATE_CARD, 'free', 8);
    const large = sizes.find((s) => s.key === 'dedicated-8');

    expect(large?.available).toBe(false);
    expect(large?.reason).toBe('plan');
  });

  it('marks sizes above the scheduling ceiling unavailable for capacity', () => {
    const sizes = availableMachineSizes(BUILTIN_RATE_CARD, 'pro', 2);

    expect(sizes.find((s) => s.key === 'dedicated-2')?.available).toBe(true);
    expect(sizes.find((s) => s.key === 'dedicated-4')).toMatchObject({ available: false, reason: 'capacity' });
    expect(sizes.find((s) => s.key === 'dedicated-8')).toMatchObject({ available: false, reason: 'capacity' });
  });

  it('unknown plan keys fall back to the free ceiling', () => {
    const sizes = availableMachineSizes(BUILTIN_RATE_CARD, 'mystery-plan', 8);

    expect(sizes.find((s) => s.key === 'dedicated-8')).toMatchObject({ available: false, reason: 'plan' });
    expect(sizes.find((s) => s.key === 'dedicated-4')?.available).toBe(true);
  });
});
