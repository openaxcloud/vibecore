import { describe, expect, it } from 'vitest';

import { loader, meta } from './solutions._index';
import { solutionPages } from '~/components/marketing/EcodeMarketingPages';
import {
  getMarketingSolutionsRouteCopy,
  marketingSolutionsRouteEn,
  marketingSolutionsRouteFr,
} from '~/lib/i18n/catalogs/marketing-solutions-route';
import { createI18nInstance } from '~/lib/i18n/runtime';

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

function solutionsMeta(language: 'en' | 'fr') {
  return meta({ data: { language }, location: { pathname: '/solutions' }, matches: [] } as never) as Array<
    Record<string, string>
  >;
}

function tagContent(tags: Array<Record<string, string>>, key: 'property' | 'name', id: string) {
  return tags.find((tag) => tag[key] === id)?.content;
}

describe('localized Solutions index route', () => {
  it('keeps the French route catalog complete and falls back to English', () => {
    expect(Object.keys(marketingSolutionsRouteFr)).toEqual(Object.keys(marketingSolutionsRouteEn));
    expect(getMarketingSolutionsRouteCopy('fr-CA')['marketingSolutions.index.title']).toBe('Solutions E-Code');
    expect(getMarketingSolutionsRouteCopy('de-DE')['marketingSolutions.index.title']).toBe('E-Code Solutions');
  });

  /*
   * The catalog must be spread into the i18next resources, otherwise the copy
   * exists in the module but never reaches a component through `t()`.
   */
  it('registers both catalogs in the i18next runtime', () => {
    for (const [language, expected] of [
      ['en', 'E-Code Solutions'],
      ['fr', 'Solutions E-Code'],
    ] as const) {
      expect(createI18nInstance(language).t('marketingSolutions.index.title')).toBe(expected);
    }
  });

  it('localizes every Solutions card through t() without changing offer names', () => {
    const english = createI18nInstance('en');
    const french = createI18nInstance('fr');

    for (const slug of Object.keys(solutionPages)) {
      const titleKey = `marketingSolutions.cards.${slug}.title`;
      const descriptionKey = `marketingSolutions.cards.${slug}.description`;

      expect(french.t(titleKey)).toBe(english.t(titleKey));
      expect(french.t(descriptionKey)).not.toBe(english.t(descriptionKey));
      expect(french.t(descriptionKey)).not.toBe(descriptionKey);
    }
  });

  it('resolves French from Accept-Language and emits locale headers', () => {
    const result = loader({
      request: new Request('https://e-code.ai/solutions', { headers: { 'Accept-Language': 'fr-FR,fr;q=0.9' } }),
    } as never);

    expect(dataOf<{ language: string }>(result).language).toBe('fr');
    expect(headersOf(result).get('Content-Language')).toBe('fr');
  });

  it('emits localized SEO metadata with a stable canonical', () => {
    const fr = solutionsMeta('fr');
    const en = solutionsMeta('en');

    expect(fr[0].title).toBe('Solutions — E-Code');
    expect(tagContent(fr, 'property', 'og:locale')).toBe('fr_FR');
    expect(tagContent(fr, 'property', 'og:locale:alternate')).toBe('en_US');
    expect(tagContent(en, 'property', 'og:locale')).toBe('en_US');

    // The canonical must not drift with the language — same URL, two renderings.
    expect(tagContent(fr, 'property', 'og:url')).toBe(tagContent(en, 'property', 'og:url'));
    expect(tagContent(fr, 'property', 'og:url')).toBe('https://e-code.ai/solutions');

    const frDescription = fr.find((tag) => tag.name === 'description')?.content ?? '';
    expect(frDescription).toContain('Découvrez les solutions E-Code');
    expect(frDescription).not.toBe(en.find((tag) => tag.name === 'description')?.content);
  });
});
