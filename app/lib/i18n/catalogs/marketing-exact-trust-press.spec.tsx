import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactTrustPressCopy,
  marketingExactTrustPressEn,
  marketingExactTrustPressFr,
} from './marketing-exact-trust-press';

import Accessibility from '~/components/marketing/ecode-exact/pages/Accessibility';
import Press from '~/components/marketing/ecode-exact/pages/Press';
import Security from '~/components/marketing/ecode-exact/pages/Security';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { loader as rootLoader } from '~/root';
import { loader as accessibilityLoader, meta as accessibilityMeta } from '~/routes/accessibility';
import { loader as pressLoader, meta as pressMeta } from '~/routes/press';
import { loader as securityLoader, meta as securityMeta } from '~/routes/security';

function leafPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }

  return [path.join('.')];
}

function stringPairs(
  english: unknown,
  french: unknown,
  path: string[] = [],
): { path: string; english: string; french: string }[] {
  if (Array.isArray(english) && Array.isArray(french)) {
    return english.flatMap((item, index) => stringPairs(item, french[index], [...path, String(index)]));
  }

  if (english && french && typeof english === 'object' && typeof french === 'object') {
    return Object.entries(english).flatMap(([key, item]) =>
      stringPairs(item, (french as Record<string, unknown>)[key], [...path, key]),
    );
  }

  return typeof english === 'string' && typeof french === 'string' ? [{ path: path.join('.'), english, french }] : [];
}

function visibleTextPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u');
}

function dataOf<T>(result: unknown): T {
  return result && typeof result === 'object' && 'data' in result ? (result as { data: T }).data : (result as T);
}

function renderInFrench(node: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: ['/'] });
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    return renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );
  } finally {
    consoleError.mockRestore();
  }
}

describe('exact press, security and accessibility marketing catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactTrustPressFr)).toEqual(leafPaths(marketingExactTrustPressEn));
  });

  it('falls back to English for unsupported locales', () => {
    const fallback = getMarketingExactTrustPressCopy('de-DE');

    expect(fallback.exactPress.hero.title).toBe('Press & Media');
    expect(fallback.exactSecurity.hero.title).toBe('Enterprise-Grade Security');
    expect(fallback.exactAccessibility.hero.title).toBe('Accessibility at E-Code');
  });

  it('renders the complete Press page in French', () => {
    const markup = renderInFrench(<Press />);

    expect(markup).toContain('Presse et médias');
    expect(markup).toContain('Captures du produit');
    expect(markup).toContain('Angles éditoriaux');
    expect(markup).toContain('Informations sur la plateforme');
    expect(markup).not.toContain('Press &amp; Media');
    expect(markup).not.toContain('Product Screenshots');
    expect(markup).not.toContain('Story Angles');
  });

  it('renders the complete Security page in French', () => {
    const markup = renderInFrench(<Security />);

    expect(markup).toContain('Sécurité de niveau entreprise');
    expect(markup).toContain('Fonctionnalités de sécurité');
    expect(markup).toContain('Conformité et certifications');
    expect(markup).toContain('Protection des données');
    expect(markup).not.toContain('Enterprise-Grade Security');
    expect(markup).not.toContain('Security Features');
    expect(markup).not.toContain('Your Data, Your Control');
  });

  it('renders the complete Accessibility page in French', () => {
    const markup = renderInFrench(<Accessibility />);

    expect(markup).toContain('L’accessibilité chez E-Code');
    expect(markup).toContain('Notre engagement');
    expect(markup).toContain('Technologies d’assistance prises en charge');
    expect(markup).toContain('Navigation au clavier');
    expect(markup).not.toContain('Accessibility at E-Code');
    expect(markup).not.toContain('Our Commitment');
    expect(markup).not.toContain('Keyboard Navigation');
  });

  it('renders every localized catalog leaf and no replaced English leaf', () => {
    const pages = [
      [marketingExactTrustPressEn.exactPress, marketingExactTrustPressFr.exactPress, renderInFrench(<Press />)],
      [
        marketingExactTrustPressEn.exactSecurity,
        marketingExactTrustPressFr.exactSecurity,
        renderInFrench(<Security />),
      ],
      [
        marketingExactTrustPressEn.exactAccessibility,
        marketingExactTrustPressFr.exactAccessibility,
        renderInFrench(<Accessibility />),
      ],
    ] as const;

    for (const [english, french, markup] of pages) {
      const visiblePairs = stringPairs(english, french).filter(
        (pair) => !pair.path.startsWith('seo.') && !pair.path.endsWith('.id'),
      );

      for (const pair of visiblePairs) {
        expect(markup, `missing French catalog leaf at ${pair.path}`).toContain(
          renderToStaticMarkup(<>{pair.french}</>),
        );

        if (pair.english !== pair.french) {
          expect(markup, `residual English catalog leaf at ${pair.path}`).not.toMatch(
            visibleTextPattern(renderToStaticMarkup(<>{pair.english}</>)),
          );
        }
      }
    }
  });

  it('preserves brands, standards, email addresses and technical terms', () => {
    const press = renderInFrench(<Press />);
    const security = renderInFrench(<Security />);
    const accessibility = renderInFrench(<Accessibility />);

    expect(press).toContain('press@e-code.ai');
    expect(press).toContain('React');
    expect(press).toContain('TypeScript');
    expect(press).toContain('Git');
    expect(press).toContain('commit');
    expect(security).toContain('SOC 2 Type II');
    expect(security).toContain('ISO 27001');
    expect(security).toContain('PCI DSS');
    expect(accessibility).toContain('WCAG 2.1');
    expect(accessibility).toContain('VoiceOver');
    expect(accessibility).toContain('TalkBack');
    expect(accessibility).toContain('accessibility@e-code.ai');
  });

  it('keeps localized CTAs and long copy responsive with stable links and semantic theme tokens', () => {
    const componentSources = [
      '../../../components/marketing/ecode-exact/pages/Press.tsx',
      '../../../components/marketing/ecode-exact/pages/Security.tsx',
      '../../../components/marketing/ecode-exact/pages/Accessibility.tsx',
    ].map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

    const source = componentSources.join('\n');

    expect(source).toContain('whitespace-normal');
    expect(source).toContain('min-w-0');
    expect(source).toContain('h-full');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('border-border');
    expect(source).toContain('bg-background');
    expect(source).toContain('href="/signup"');
    expect(source).toContain('href="/dashboard"');
    expect(source).not.toContain('useMarketingNavigate');
    expect(source).not.toContain('border-white/10');
    expect(source).not.toContain('bg-black/40');
  });

  it.each([
    [
      pressLoader,
      pressMeta,
      'https://e-code.ai/press',
      marketingExactTrustPressFr.exactPress.seo.title,
      marketingExactTrustPressFr.exactPress.seo.description,
      marketingExactTrustPressFr.exactPress.seo.imageAlt,
    ],
    [
      securityLoader,
      securityMeta,
      'https://e-code.ai/security',
      marketingExactTrustPressFr.exactSecurity.seo.title,
      marketingExactTrustPressFr.exactSecurity.seo.description,
      marketingExactTrustPressFr.exactSecurity.seo.imageAlt,
    ],
    [
      accessibilityLoader,
      accessibilityMeta,
      'https://e-code.ai/accessibility',
      marketingExactTrustPressFr.exactAccessibility.seo.title,
      marketingExactTrustPressFr.exactAccessibility.seo.description,
      marketingExactTrustPressFr.exactAccessibility.seo.imageAlt,
    ],
  ])('serves localized route metadata', (loader, meta, url, title, description, imageAlt) => {
    const data = loader({ request: new Request(`${url}?lang=fr`) } as never);
    const tags = meta({ data } as never);

    expect(data.language).toBe('fr');
    expect(tags).toEqual(expect.arrayContaining([{ title }]));
    expect(tags).toEqual(expect.arrayContaining([{ name: 'description', content: description }]));
    expect(tags).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'og:title', content: title })]));
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'og:description', content: description })]),
    );
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'twitter:description', content: description })]),
    );
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'twitter:image:alt', content: imageAlt })]),
    );
  });

  it.each(['/press', '/security', '/accessibility'])('inherits canonical and en/fr alternates for %s', (path) => {
    const result = rootLoader({
      request: new Request(`https://e-code.ai${path}?lang=fr`),
      params: {},
      context: {},
    });

    const data = dataOf<{ seo: { canonical: string; english: string; french: string } }>(result);

    expect(data.seo).toEqual({
      canonical: `https://e-code.ai${path}`,
      english: `https://e-code.ai${path}`,
      french: `https://e-code.ai${path}?lang=fr`,
    });
  });

  it('leaves no hard-coded visible source copy in the three pages or routes', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const files = [
      '../../../components/marketing/ecode-exact/pages/Press.tsx',
      '../../../components/marketing/ecode-exact/pages/Security.tsx',
      '../../../components/marketing/ecode-exact/pages/Accessibility.tsx',
      '../../../routes/press.tsx',
      '../../../routes/security.tsx',
      '../../../routes/accessibility.tsx',
    ];

    for (const relativePath of files) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      const result = scanSource(source, relativePath);

      expect(result.parseErrors, relativePath).toEqual([]);
      expect(result.findings, relativePath).toEqual([]);
    }
  });
});
