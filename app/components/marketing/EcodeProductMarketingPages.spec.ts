import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ecodeCampaignMarketingPages,
  ecodePricingPlans,
  ecodeProductMarketingPages,
} from './EcodeProductMarketingPages';

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

  it('keeps monthly pricing aligned with backend billing checkout amounts', () => {
    const billingSource = readFileSync(join(process.cwd(), 'packages/billing/src/index.ts'), 'utf8');

    const backendMonthlyCents = Object.fromEntries(
      ecodePricingPlans.map((plan) => [plan.key, extractMonthlyCents(billingSource, plan.key)]),
    );

    expect(Object.fromEntries(ecodePricingPlans.map((plan) => [plan.key, plan.monthlyCents]))).toEqual(
      backendMonthlyCents,
    );
  });
});

function extractMonthlyCents(source: string, key: string) {
  const match = new RegExp(`key: '${key}',[\\s\\S]*?monthlyCents: ([\\d_]+)`).exec(source);

  if (!match) {
    throw new Error(`Missing billing plan ${key}`);
  }

  return Number(match[1].replaceAll('_', ''));
}
