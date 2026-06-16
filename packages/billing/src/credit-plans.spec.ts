import { describe, expect, it } from 'vitest';
import { creditPlanByKey, creditPlanCatalog, findCreditPlan } from './index.js';
import { migrateLegacyPlanKey, planCreditConfig } from './credits.js';

describe('creditPlanCatalog', () => {
  it('has exactly the four Replit-parity tiers', () => {
    expect(creditPlanCatalog.map((p) => p.key)).toEqual(['starter', 'core', 'pro', 'enterprise']);
  });

  it('prices Core $25/mo ($20 effective annual) and Pro $100/mo ($95 effective annual)', () => {
    const core = findCreditPlan('core')!;
    expect(core.monthlyCents).toBe(2500);
    expect(core.annualCents).toBe(24_000);
    expect(core.annualMonthlyCents).toBe(2000);

    const pro = findCreditPlan('pro')!;
    expect(pro.monthlyCents).toBe(10_000);
    expect(pro.annualCents).toBe(114_000);
    expect(pro.annualMonthlyCents).toBe(9500);
  });

  it('annual effective monthly is cheaper than monthly for paid plans', () => {
    for (const plan of creditPlanCatalog) {
      if (plan.monthlyCents > 0) {
        expect(plan.annualMonthlyCents).toBeLessThan(plan.monthlyCents);
        expect(plan.annualCents).toBe(plan.annualMonthlyCents * 12);
      }
    }
  });

  it('included credits match the plan dollar value (Replit identical pricing)', () => {
    expect(findCreditPlan('core')!.includedCreditCents).toBe(findCreditPlan('core')!.monthlyCents);
    expect(findCreditPlan('pro')!.includedCreditCents).toBe(findCreditPlan('pro')!.monthlyCents);
  });

  it('credit grants stay consistent with planCreditConfig', () => {
    expect(findCreditPlan('starter')!.dailyCreditCents).toBe(planCreditConfig.starter.dailyCreditCents);
    expect(findCreditPlan('core')!.includedCreditCents).toBe(planCreditConfig.core.monthlyCreditCents);
    expect(findCreditPlan('pro')!.includedCreditCents).toBe(planCreditConfig.pro.monthlyCreditCents);
  });

  it('encodes the per-tier entitlements from the mandate', () => {
    const starter = findCreditPlan('starter')!;
    expect(starter.parallelAgents).toBe(1);
    expect(starter.publishRegions).toBe('single');
    expect(starter.badgeRemovable).toBe(false);

    const core = findCreditPlan('core')!;
    expect(core.collaborators).toBe(5);
    expect(core.parallelAgents).toBe(2);
    expect(core.badgeRemovable).toBe(true);
    expect(core.publishRegions).toBe('all');

    const pro = findCreditPlan('pro')!;
    expect(pro.collaborators).toBe(15);
    expect(pro.viewers).toBe(50);
    expect(pro.parallelAgents).toBe(10);
    expect(pro.dbRollbackDays).toBe(28);
    expect(pro.topModels).toBe(true);
  });
});

describe('creditPlanByKey (new-world normalization)', () => {
  it('resolves new-world keys directly (pro = $100 Pro)', () => {
    expect(creditPlanByKey('pro').key).toBe('pro');
    expect(creditPlanByKey('pro').monthlyCents).toBe(10_000);
    expect(creditPlanByKey('core').key).toBe('core');
  });

  it('folds unambiguously-legacy keys (free→starter, team→pro)', () => {
    expect(creditPlanByKey('free').key).toBe('starter');
    expect(creditPlanByKey('team').key).toBe('pro');
  });

  it('defaults unknown keys to starter', () => {
    expect(creditPlanByKey(undefined).key).toBe('starter');
    expect(creditPlanByKey('mystery').key).toBe('starter');
  });
});

describe('migrateLegacyPlanKey (one-time backfill)', () => {
  it('renames legacy tiers to their Replit-parity target', () => {
    expect(migrateLegacyPlanKey('free')).toBe('starter');
    expect(migrateLegacyPlanKey('pro')).toBe('core'); // legacy $29 pro → new $25 core
    expect(migrateLegacyPlanKey('team')).toBe('pro'); // legacy $99 team → new $100 pro
    expect(migrateLegacyPlanKey('enterprise')).toBe('enterprise');
  });
});
