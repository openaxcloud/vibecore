/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMarketingExactAcceptableUseCopy,
  marketingExactAcceptableUseEn,
  marketingExactAcceptableUseFr,
} from './marketing-exact-acceptable-use';
import AcceptableUsePage, { loader, meta } from '~/routes/acceptable-use';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

type RenderedPage = {
  title: string;
  description: string;
  primaryAction?: readonly [string, string];
  secondaryAction?: readonly [string, string];
  highlights: readonly string[];
  sections: readonly { title: string; body: string; items: readonly string[] }[];
};

vi.mock('~/components/marketing/EcodeMarketingPages', () => ({
  MarketingStaticPage: ({ page }: { page: RenderedPage }) => (
    <main>
      <h1>{page.title}</h1>
      <p>{page.description}</p>
      <a href={page.primaryAction?.[1]}>{page.primaryAction?.[0]}</a>
      <a href={page.secondaryAction?.[1]}>{page.secondaryAction?.[0]}</a>
      {page.highlights.map((highlight) => (
        <span key={highlight}>{highlight}</span>
      ))}
      {page.sections.map((section) => (
        <section key={section.title} aria-label={section.title}>
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

describe('acceptable-use localization', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(cleanup);

  it('keeps complete EN/FR parity and English fallback', () => {
    expect(leafPaths(marketingExactAcceptableUseFr)).toEqual(leafPaths(marketingExactAcceptableUseEn));
    expect(getMarketingExactAcceptableUseCopy('de').exactAcceptableUse.page.title).toBe('Acceptable use policy');
  });

  it('renders the complete French policy while preserving routes and E-Code', () => {
    language = 'fr';
    render(<AcceptableUsePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Politique d’utilisation acceptable' })).toBeTruthy();
    expect(screen.getAllByRole('region')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Signaler un abus' }).getAttribute('href')).toBe('/report-abuse');
    expect(screen.getByRole('link', { name: 'Consulter la sécurité' }).getAttribute('href')).toBe('/security');
    expect(document.body.textContent).toContain('20 applications publiées simultanément');
    expect(document.body.textContent).toContain('E-Code');
    expect(document.body.textContent).not.toContain('Workspace safety');
    expect(document.body.textContent).not.toContain('Abuse response');
  });

  it('detects French and emits localized canonical SEO and hreflang', () => {
    const data = loader({
      request: new Request('https://e-code.ai/acceptable-use', {
        headers: { 'Accept-Language': 'fr-FR, en;q=0.8' },
      }),
      params: {},
      context: {},
    } as Parameters<typeof loader>[0]);

    const descriptors = meta({ data } as Parameters<typeof meta>[0]);

    expect(data.language).toBe('fr');
    expect(descriptors).toContainEqual({ title: 'Politique d’utilisation acceptable — E-Code' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/acceptable-use',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/acceptable-use?lang=fr',
    });
  });
});
