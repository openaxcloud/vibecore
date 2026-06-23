import { describe, expect, it } from 'vitest';
import { ecodePaymentPlans } from './ecode-public-api-data.server';

describe('ecodePaymentPlans', () => {
  it('does not leak the "Replit" competitor codename in any plan feature copy', () => {
    for (const plan of ecodePaymentPlans) {
      for (const feature of plan.features) {
        expect(feature).not.toMatch(/replit/i);
      }
    }
  });

  it('keeps the renamed E-Code-branded feature strings', () => {
    const allFeatures = ecodePaymentPlans.flatMap((plan) => plan.features);

    expect(allFeatures).toContain('AI Agent trial included');
    expect(allFeatures).toContain('Full AI Agent access');
    expect(allFeatures).toContain('Everything included with E-Code Core');
  });
});
