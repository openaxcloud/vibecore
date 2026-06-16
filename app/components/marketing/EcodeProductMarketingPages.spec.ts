import { describe, expect, it } from 'vitest';

import {
  ecodeCampaignMarketingPages,
  ecodePricingPlans,
  ecodeProductMarketingPages,
} from './EcodeProductMarketingPages';

/*
 * Replit-parity pricing (USD cents), the single source of truth mirrored by the
 * backend credit plan catalog (packages/billing creditPlanCatalog) and the
 * marketing cards. Keep in sync if the catalog changes.
 */
const REPLIT_PARITY_PRICING: Record<string, { monthlyCents: number; annualMonthlyCents: number }> = {
  free: { monthlyCents: 0, annualMonthlyCents: 0 },
  core: { monthlyCents: 2500, annualMonthlyCents: 2000 },
  pro: { monthlyCents: 10000, annualMonthlyCents: 9500 },
  enterprise: { monthlyCents: 0, annualMonthlyCents: 0 },
};

describe('E-Code product marketing pages', () => {
  it('maps the copied E-Code product pages to their public routes', () => {
    expect(Object.keys(ecodeProductMarketingPages)).toEqual([
      'ai-agent',
      'ide',
      'multiplayer',
      'mobile-app',
      'teams',
      'deployments',
      'pricing',
      'bounties',
      'ai-platform',
    ]);

    expect(ecodeProductMarketingPages['ai-agent'].route).toBe('/ai-agent');
    expect(ecodeProductMarketingPages.ide.route).toBe('/features');
    expect(ecodeProductMarketingPages.multiplayer.route).toBe('/features#multiplayer');
    expect(ecodeProductMarketingPages['mobile-app'].route).toBe('/mobile');
    expect(ecodeProductMarketingPages['ai-platform'].route).toBe('/ai');
    expect(ecodeCampaignMarketingPages.deployments.route).toBe('/marketing/deployments');
    expect(ecodeCampaignMarketingPages.bounties.route).toBe('/marketing/bounties');
    expect(ecodeCampaignMarketingPages.teams.route).toBe('/marketing/teams');
  });

  it('keeps marketing pricing aligned with the Replit-parity model', () => {
    for (const plan of ecodePricingPlans) {
      const expected = REPLIT_PARITY_PRICING[plan.key];
      expect(expected, `unexpected plan key ${plan.key}`).toBeDefined();
      expect(plan.monthlyCents).toBe(expected.monthlyCents);
      expect(plan.annualMonthlyCents).toBe(expected.annualMonthlyCents);
    }
  });
});
