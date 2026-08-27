import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  getMarketingFigureCopy,
  getMarketingPageCopy,
  getMarketingUiCopy,
  marketingAuxiliaryPageCopyEn,
  marketingAuxiliaryPageCopyFr,
  marketingFrIdentityTerms,
  marketingPageCopyEn,
  marketingPageCopyFr,
  resolveMarketingLanguage,
} from './marketing';
import { makeMarketingMeta, marketingPages } from '~/components/marketing/EcodeMarketingPages';

function assertMatchingShape(en: unknown, fr: unknown, path = 'catalog'): void {
  if (typeof en === 'string') {
    expect(fr, path).toEqual(expect.any(String));
    expect((fr as string).trim().length, path).toBeGreaterThan(0);

    return;
  }

  if (Array.isArray(en)) {
    expect(Array.isArray(fr), path).toBe(true);
    expect((fr as unknown[]).length, path).toBe(en.length);
    en.forEach((value, index) => assertMatchingShape(value, (fr as unknown[])[index], `${path}[${index}]`));

    return;
  }

  expect(fr, path).toBeTypeOf('object');
  expect(Object.keys(fr as object).sort(), path).toEqual(Object.keys(en as object).sort());

  for (const [key, value] of Object.entries(en as Record<string, unknown>)) {
    assertMatchingShape(value, (fr as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

function collectIdentityTerms(en: unknown, fr: unknown, terms: Set<string>): void {
  if (typeof en === 'string' && typeof fr === 'string') {
    if (en === fr) {
      terms.add(en);
    }

    return;
  }

  if (Array.isArray(en) && Array.isArray(fr)) {
    en.forEach((value, index) => collectIdentityTerms(value, fr[index], terms));
    return;
  }

  if (en && fr && typeof en === 'object' && typeof fr === 'object') {
    for (const [key, value] of Object.entries(en)) {
      collectIdentityTerms(value, (fr as Record<string, unknown>)[key], terms);
    }
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }

  return [];
}

describe('marketing EN/FR catalogs', () => {
  it('keeps complete key and nested-content parity for all 35 catalog-backed pages', () => {
    expect(Object.keys(marketingPageCopyEn)).toHaveLength(35);
    expect(Object.keys(marketingPageCopyFr)).toEqual(Object.keys(marketingPageCopyEn));
    assertMatchingShape(marketingPageCopyEn, marketingPageCopyFr);
  });

  it('keeps comparison, campaign and newsletter copy complete in both languages', () => {
    expect(Object.keys(marketingAuxiliaryPageCopyFr)).toEqual(Object.keys(marketingAuxiliaryPageCopyEn));
    expect(Object.keys(marketingAuxiliaryPageCopyEn)).toHaveLength(12);
    assertMatchingShape(marketingAuxiliaryPageCopyEn, marketingAuxiliaryPageCopyFr, 'auxiliaryCatalog');
  });

  it('documents every term intentionally identical in French', () => {
    const identityTerms = new Set<string>();
    collectIdentityTerms(marketingPageCopyEn, marketingPageCopyFr, identityTerms);

    expect([...identityTerms].sort()).toEqual([...marketingFrIdentityTerms].sort());
  });

  it('enforces the reviewed French glossary across visible marketing copy', () => {
    const frenchCopy = [...collectStrings(marketingPageCopyFr), ...collectStrings(marketingAuxiliaryPageCopyFr)];

    const residualEnglishTerminology =
      /\b(?:backpressure|preview|logs?|marketplace|snapshots?|packages?|builds?|workspace|workflows?|runtime|rollbacks?|responsive|streaming|stack|starter|typecheck|full-stack|tenants|tokens?|tags?|design system|backend|frontend|fork|feature flags?|QA)\b/iu;

    for (const copy of frenchCopy) {
      expect(copy, copy).not.toMatch(residualEnglishTerminology);
    }
  });

  it('resolves French variants and falls back safely to English', () => {
    expect(resolveMarketingLanguage('fr-CA')).toBe('fr');
    expect(resolveMarketingLanguage('de-DE')).toBe('en');
    expect(getMarketingPageCopy('product', 'fr')?.title).toBe('Produit E-Code');
    expect(getMarketingPageCopy('github-codespaces', 'fr')?.title).toBe('E-Code face à GitHub Codespaces');
    expect(getMarketingPageCopy('newsletter', 'fr')?.title).toBe('Newsletter E-Code');
    expect(getMarketingPageCopy('product', 'es')?.title).toBe('E-Code Product');
    expect(getMarketingPageCopy('missing', 'fr')).toBeNull();
    expect(getMarketingUiCopy('fr').viewPage).toBe('Voir la page');
    expect(getMarketingFigureCopy('mobile', 'fr')?.alt).toContain('Interface mobile E-Code');
  });

  it('localizes title, description and social metadata from the root locale', () => {
    const meta = makeMarketingMeta(marketingPages.product);

    const descriptors = meta({
      data: undefined,
      matches: [{ id: 'root', data: { language: 'fr' } }],
    } as never);

    expect(descriptors).toEqual(
      expect.arrayContaining([
        { title: 'Produit E-Code - E-Code' },
        {
          name: 'description',
          content: expect.stringContaining('Découvrez le produit E-Code'),
        },
        { property: 'og:title', content: 'Produit E-Code - E-Code' },
      ]),
    );
  });

  it('keeps routed copy outside the component instead of reintroducing hard-coded page strings', () => {
    const source = readFileSync(
      new URL('../../../components/marketing/EcodeMarketingPages.tsx', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain("title: 'E-Code Product'");
    expect(source).not.toContain('The full E-Code product surface');
    expect(source).not.toContain('Build, run and ship with E-Code');
    expect(source).toContain('getMarketingPageCopy(page.slug, language)');
  });
});
