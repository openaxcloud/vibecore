import { describe, expect, it } from 'vitest';

import {
  ecodeCampaignMarketingPages,
  ecodePricingPlans,
  ecodeProductMarketingPages,
  selectAiAgentTabContent,
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

describe('selectAiAgentTabContent', () => {
  it('shows capabilities and use cases on the overview tab', () => {
    expect(selectAiAgentTabContent('overview')).toEqual({
      showCapabilities: true,
      showUseCases: true,
      showComparison: false,
    });
  });

  it('shows only capabilities on the capabilities tab', () => {
    expect(selectAiAgentTabContent('capabilities')).toEqual({
      showCapabilities: true,
      showUseCases: false,
      showComparison: false,
    });
  });

  it('shows only use cases on the examples tab', () => {
    expect(selectAiAgentTabContent('examples')).toEqual({
      showCapabilities: false,
      showUseCases: true,
      showComparison: false,
    });
  });

  it('shows only the comparison on the comparison tab', () => {
    expect(selectAiAgentTabContent('comparison')).toEqual({
      showCapabilities: false,
      showUseCases: false,
      showComparison: true,
    });
  });

  it('produces a distinct content selection for every tab so the control is never a no-op', () => {
    const tabs = ['overview', 'capabilities', 'examples', 'comparison'] as const;
    const serialized = tabs.map((tab) => JSON.stringify(selectAiAgentTabContent(tab)));
    expect(new Set(serialized).size).toBe(tabs.length);
  });
});
