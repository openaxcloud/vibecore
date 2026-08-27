/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMarketingExactUsageLimitsCopy,
  marketingExactUsageLimitsEn,
  marketingExactUsageLimitsFr,
} from './marketing-exact-usage-limits';
import UsageLimitsPage, { loader, meta } from '~/routes/usage-limits';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

type RenderedUsageLimitsPage = {
  title: string;
  description: string;
  primaryAction?: readonly [string, string];
  secondaryAction?: readonly [string, string];
  highlights: readonly string[];
  sections: readonly {
    id: string;
    title: string;
    body: string;
    items: readonly string[];
  }[];
};

vi.mock('~/components/marketing/EcodeMarketingPages', () => ({
  MarketingStaticPage: ({ page }: { page: RenderedUsageLimitsPage }) => (
    <main>
      <h1>{page.title}</h1>
      <p>{page.description}</p>
      <a href={page.primaryAction?.[1]}>{page.primaryAction?.[0]}</a>
      <a href={page.secondaryAction?.[1]}>{page.secondaryAction?.[0]}</a>
      {page.highlights.map((highlight) => (
        <span key={highlight}>{highlight}</span>
      ))}
      {page.sections.map((section) => (
        <section key={section.id} aria-label={section.title}>
          <p>{section.body}</p>
          {section.items.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </section>
      ))}
    </main>
  ),
}));

function leafPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }

  return [path.join('.')];
}

describe('exact usage limits marketing catalog and route', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(cleanup);

  it('keeps complete EN/FR parity, stable section identifiers, and English fallback', () => {
    expect(leafPaths(marketingExactUsageLimitsFr)).toEqual(leafPaths(marketingExactUsageLimitsEn));
    expect(marketingExactUsageLimitsFr.exactUsageLimits.page.sections.map(({ id }) => id)).toEqual([
      'metering',
      'plans',
      'credits',
      'limits',
      'fair-use',
    ]);
    expect(getMarketingExactUsageLimitsCopy('de').exactUsageLimits.page.title).toBe('Usage quotas and limits');
  });

  it('renders all French content while preserving routes, plan names, and technical units', () => {
    language = 'fr';
    render(<UsageLimitsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Quotas et limites d’utilisation' })).toBeTruthy();
    expect(screen.getAllByRole('region')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Comparer les offres' }).getAttribute('href')).toBe('/pricing');
    expect(screen.getByRole('link', { name: 'Consulter votre utilisation' }).getAttribute('href')).toBe('/usage');
    expect(document.body.textContent).toContain('Starter, Core, Pro, Enterprise');
    expect(document.body.textContent).toContain('Gio-mois');
    expect(document.body.textContent).not.toContain('What we meter');
    expect(document.body.textContent).not.toContain('Fair use');
  });

  it('detects French for the first request and emits localized SEO with canonical hreflang', () => {
    const data = loader({
      request: new Request('https://e-code.ai/usage-limits', {
        headers: { 'Accept-Language': 'fr-FR, en;q=0.8' },
      }),
      params: {},
      context: {},
    } as Parameters<typeof loader>[0]);

    const descriptors = meta({ data } as Parameters<typeof meta>[0]);

    expect(data.language).toBe('fr');
    expect(descriptors).toContainEqual({ title: 'Quotas et limites d’utilisation — E-Code' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/usage-limits',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/usage-limits?lang=fr',
    });
  });
});
