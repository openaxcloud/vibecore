import { describe, expect, it } from 'vitest';
import {
  PLAN_ENTITLEMENTS_VERSION,
  resolvePlanEntitlementKey,
  resolvePlanEntitlements,
  splitEgressAllowance,
  starterPlanEntitlements,
} from './plan-entitlements.js';

describe('server-authoritative plan entitlements', () => {
  it('disambiguates legacy and credit-catalog pro by persisted price', () => {
    expect(resolvePlanEntitlementKey({ key: 'pro', monthlyCents: 2_900 })).toBe('core');
    expect(resolvePlanEntitlementKey({ key: 'pro', monthlyCents: 10_000 })).toBe('pro');
  });

  it('never escalates missing, unknown, or inconsistent identities', () => {
    for (const identity of [
      { key: undefined, monthlyCents: undefined },
      { key: 'future', monthlyCents: 99_999 },
      { key: 'pro', monthlyCents: 9_999 },
      { key: 'team', monthlyCents: 10_000 },
      { key: 'enterprise', monthlyCents: 1 },
      { key: 'core', monthlyCents: null },
    ]) {
      expect(resolvePlanEntitlements(identity)).toEqual(starterPlanEntitlements());
    }
  });

  it('pins viewer limits at 0 / 0 / 50 / unlimited', () => {
    expect(resolvePlanEntitlements({ key: 'free', monthlyCents: 0 }).viewers).toBe(0);
    expect(resolvePlanEntitlements({ key: 'core', monthlyCents: 2_500 }).viewers).toBe(0);
    expect(resolvePlanEntitlements({ key: 'pro', monthlyCents: 10_000 }).viewers).toBe(50);
    expect(resolvePlanEntitlements({ key: 'enterprise', monthlyCents: 0 }).viewers).toBeNull();
  });

  it('pins Agent fan-out at 1 / 2 / 10 and requires a valid Enterprise override', () => {
    expect(resolvePlanEntitlements({ key: 'starter', monthlyCents: 0 }).parallelAgents).toBe(1);
    expect(resolvePlanEntitlements({ key: 'core', monthlyCents: 2_500 }).parallelAgents).toBe(2);
    expect(resolvePlanEntitlements({ key: 'pro', monthlyCents: 10_000 }).parallelAgents).toBe(10);
    expect(resolvePlanEntitlements({ key: 'enterprise', monthlyCents: 0 }).parallelAgents).toBe(10);
    expect(
      resolvePlanEntitlements(
        { key: 'enterprise', monthlyCents: 0 },
        { enterpriseParallelAgents: 7 },
      ).parallelAgents,
    ).toBe(7);
    expect(
      resolvePlanEntitlements(
        { key: 'enterprise', monthlyCents: 0 },
        { enterpriseParallelAgents: 50 },
      ).parallelAgents,
    ).toBe(10);
  });

  it('enforces badge, publication-region, egress, and version policy', () => {
    const starter = resolvePlanEntitlements({ key: 'free', monthlyCents: 0 });
    const core = resolvePlanEntitlements({ key: 'pro', monthlyCents: 2_900 });
    const pro = resolvePlanEntitlements({ key: 'team', monthlyCents: 9_900 });
    const enterprise = resolvePlanEntitlements({ key: 'enterprise', monthlyCents: 0 });

    expect(starter).toMatchObject({
      version: PLAN_ENTITLEMENTS_VERSION,
      badgeRemovable: false,
      publishRegions: 'single',
      perUserSpendLimits: false,
      includedEgressMib: 10 * 1_024,
    });
    expect(core).toMatchObject({
      badgeRemovable: true,
      publishRegions: 'all',
      includedEgressMib: 100 * 1_024,
    });
    expect(pro.includedEgressMib).toBeNull();
    expect(enterprise).toMatchObject({
      publishRegions: 'custom',
      includedEgressMib: null,
      perUserSpendLimits: true,
    });
  });
});

describe('splitEgressAllowance', () => {
  it('splits a claim crossing the included boundary', () => {
    expect(
      splitEgressAllowance({
        previouslyObservedMib: 9 * 1_024,
        newlyObservedMib: 2 * 1_024,
        includedEgressMib: 10 * 1_024,
      }),
    ).toEqual({ observedMib: 2_048, includedMib: 1_024, billableMib: 1_024 });
  });

  it('does not invent an allowance for Pro or Enterprise', () => {
    expect(
      splitEgressAllowance({
        previouslyObservedMib: 50_000,
        newlyObservedMib: 123,
        includedEgressMib: null,
      }),
    ).toEqual({ observedMib: 123, includedMib: 0, billableMib: 123 });
  });
});
