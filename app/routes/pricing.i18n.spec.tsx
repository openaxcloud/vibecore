import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loader, meta } from './pricing';
import {
  getMarketingPricingRouteCopy,
  marketingPricingRouteEn,
  marketingPricingRouteFr,
} from '~/lib/i18n/catalogs/marketing-pricing-route';

function dataOf<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

function headersOf(result: unknown): Headers {
  if (result && typeof result === 'object' && 'init' in result) {
    return new Headers((result as { init?: { headers?: HeadersInit } }).init?.headers);
  }

  return result instanceof Response ? result.headers : new Headers();
}

function pricingMeta(language: 'en' | 'fr') {
  return meta({
    data: { language },
    location: { pathname: '/pricing' },
    matches: [],
  } as never);
}

describe('localized Pricing route', () => {
  it('keeps the French route catalog complete and falls back to English', () => {
    expect(Object.keys(marketingPricingRouteFr)).toEqual(Object.keys(marketingPricingRouteEn));
    expect(getMarketingPricingRouteCopy('fr-CA')['marketingPricing.seo.title']).toBe('Tarifs — E-Code');
    expect(getMarketingPricingRouteCopy('de-DE')['marketingPricing.seo.title']).toBe('Pricing — E-Code');
  });

  it('detects French on first visit and emits locale persistence headers', () => {
    const result = loader({
      request: new Request('https://e-code.ai/pricing', {
        headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7' },
      }),
    } as never);

    expect(dataOf<{ language: string }>(result).language).toBe('fr');
    expect(headersOf(result).get('Content-Language')).toBe('fr');
    expect(headersOf(result).get('Vary')).toBe('Cookie, Accept-Language');
    expect(headersOf(result).get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
  });

  it('keeps a manual French cookie authoritative over the browser language', () => {
    const result = loader({
      request: new Request('https://e-code.ai/pricing', {
        headers: { 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'vibecore-lang=fr' },
      }),
    } as never);

    expect(dataOf<{ language: string }>(result).language).toBe('fr');
    expect(headersOf(result).get('Set-Cookie')).toBeNull();
  });

  it('emits complete localized SEO, Open Graph, Twitter, canonical and hreflang metadata', () => {
    for (const [language, title, locale] of [
      ['en', 'Pricing — E-Code', 'en_US'],
      ['fr', 'Tarifs — E-Code', 'fr_FR'],
    ] as const) {
      const tags = pricingMeta(language);

      expect(tags).toContainEqual({ title });
      expect(tags).toContainEqual({ property: 'og:title', content: title });
      expect(tags).toContainEqual({ property: 'og:url', content: 'https://e-code.ai/pricing' });
      expect(tags).toContainEqual({ property: 'og:locale', content: locale });
      expect(tags).toContainEqual({ name: 'twitter:title', content: title });
      expect(tags).toContainEqual({ tagName: 'link', rel: 'canonical', href: 'https://e-code.ai/pricing' });
      expect(tags).toContainEqual({
        tagName: 'link',
        rel: 'alternate',
        hrefLang: 'en',
        href: 'https://e-code.ai/pricing?lang=en',
      });
      expect(tags).toContainEqual({
        tagName: 'link',
        rel: 'alternate',
        hrefLang: 'fr',
        href: 'https://e-code.ai/pricing?lang=fr',
      });
      expect(tags).toContainEqual({
        tagName: 'link',
        rel: 'alternate',
        hrefLang: 'x-default',
        href: 'https://e-code.ai/pricing',
      });
      expect(tags).toContainEqual(expect.objectContaining({ property: 'og:image:alt' }));
      expect(tags).toContainEqual(expect.objectContaining({ name: 'twitter:image:alt' }));
    }
  });

  it('uses the non-frozen localized page and keeps every modified rendering source scan-clean', async () => {
    const routeSource = readFileSync(resolve('app/routes/pricing.tsx'), 'utf8');
    const pageSource = readFileSync(resolve('app/components/marketing/EcodeProductMarketingPages.tsx'), 'utf8');

    const exactRegistrySource = readFileSync(
      resolve('app/components/marketing/EcodeExactProductMarketingPages.tsx'),
      'utf8',
    );

    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');

    expect(routeSource).toContain("from '~/components/marketing/EcodeProductMarketingPages'");
    expect(routeSource).not.toContain('EcodeExactProductMarketingPages');
    expect(exactRegistrySource).not.toContain("from './ecode-exact/pages/Pricing'");
    expect(exactRegistrySource).not.toContain('function EcodePricingPage');

    for (const [file, source] of [
      ['app/routes/pricing.tsx', routeSource],
      ['app/components/marketing/EcodeProductMarketingPages.tsx', pageSource],
    ] as const) {
      const result = scanSource(source, file);

      expect(result.parseErrors, file).toEqual([]);
      expect(result.findings, file).toEqual([]);
    }
  });
});
