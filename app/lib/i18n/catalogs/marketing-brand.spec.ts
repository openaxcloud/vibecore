import { describe, expect, it } from 'vitest';

import { getMarketingBrandCopy, marketingBrandEn, marketingBrandFr } from './marketing-brand';

describe('marketing brand copy', () => {
  it('keeps catalog parity and returns professional French copy', () => {
    expect(Object.keys(marketingBrandFr).sort()).toEqual(Object.keys(marketingBrandEn).sort());
    expect(getMarketingBrandCopy('fr-FR')['marketingBrand.tagline']).toBe('Créez rapidement des logiciels avec l’IA');
  });
});
