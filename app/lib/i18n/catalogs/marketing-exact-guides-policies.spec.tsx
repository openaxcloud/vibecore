import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  formatGuidesPoliciesInteger,
  formatPolicySectionHeading,
  formatTutorialDuration,
  getMarketingExactGuidesPoliciesCopy,
  marketingExactGuidesPoliciesEn,
  marketingExactGuidesPoliciesFr,
} from './marketing-exact-guides-policies';

import DataDeletion from '~/components/marketing/ecode-exact/pages/DataDeletion';
import Enforcement from '~/components/marketing/ecode-exact/pages/Enforcement';
import Tutorials, { tutorialHref } from '~/components/marketing/ecode-exact/pages/Tutorials';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { loader as rootLoader } from '~/root';
import { loader as dataDeletionLoader, meta as dataDeletionMeta } from '~/routes/data-deletion';
import { loader as enforcementLoader, meta as enforcementMeta } from '~/routes/enforcement';
import { loader as tutorialsLoader, meta as tutorialsMeta } from '~/routes/tutorials';

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

describe('exact guides and policies marketing catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactGuidesPoliciesFr)).toEqual(leafPaths(marketingExactGuidesPoliciesEn));
  });

  it('falls back to English for unsupported locales', () => {
    const fallback = getMarketingExactGuidesPoliciesCopy('de-DE');

    expect(fallback.exactDataDeletion.title).toBe('Deleting Your Data');
    expect(fallback.exactEnforcement.title).toBe('Enforcement Policy');
    expect(fallback.exactTutorials.hero.title).toBe('Tutorials');
  });

  it('formats policy numbers, step numbers and tutorial durations with Intl', () => {
    expect(formatGuidesPoliciesInteger(3, 'fr')).toBe('3');
    expect(formatPolicySectionHeading(2, 'Suppression de votre compte', 'fr')).toBe('2. Suppression de votre compte');
    expect(formatTutorialDuration(15, 'en')).toBe('15 min');
    expect(formatTutorialDuration(15, 'fr')).toBe('15 min');
  });

  it('renders the complete data-deletion policy in French', () => {
    const markup = renderInFrench(<DataDeletion />);

    expect(markup).toContain('Suppression de vos données');
    expect(markup).toContain('septembre 2025');
    expect(markup).toContain('1. Suppression d’un projet');
    expect(markup).toContain('Paramètres → Compte → Facturation');
    expect(markup).toContain('La suppression est <strong>irréversible</strong>');
    expect(markup).not.toContain('Deleting Your Data');
    expect(markup).not.toContain('Deleting a single project');
    expect(markup).not.toContain('September 2025');
  });

  it('renders the complete enforcement policy in French', () => {
    const markup = renderInFrench(<Enforcement />);

    expect(markup).toContain('Politique d’application des règles');
    expect(markup).toContain('1. Mesures d’application');
    expect(markup).toContain('Restriction des fonctions communautaires');
    expect(markup).toContain('3. Recours');
    expect(markup).toContain('procédure DMCA');
    expect(markup).not.toContain('Enforcement Policy');
    expect(markup).not.toContain('Enforcement actions');
    expect(markup).not.toContain('Reporting violations');
  });

  it('renders the complete Tutorials page in French', () => {
    const markup = renderInFrench(<Tutorials />);

    expect(markup).toContain('Tutoriels');
    expect(markup).toContain('Parcourir les tutoriels');
    expect(markup).toContain('Créer une application complète avec l’agent IA');
    expect(markup).toContain('15 min');
    expect(markup).toContain('Parcours d’apprentissage');
    expect(markup).toContain('Livrer en équipe');
    expect(markup).not.toContain('Browse Tutorials');
    expect(markup).not.toContain('Learning Paths');
    expect(markup).not.toContain('Ready to start building?');
  });

  it('renders every localized page leaf and no substantive replaced English leaf', () => {
    const pages = [
      [
        marketingExactGuidesPoliciesEn.exactDataDeletion,
        marketingExactGuidesPoliciesFr.exactDataDeletion,
        renderInFrench(<DataDeletion />),
      ],
      [
        marketingExactGuidesPoliciesEn.exactEnforcement,
        marketingExactGuidesPoliciesFr.exactEnforcement,
        renderInFrench(<Enforcement />),
      ],
      [
        marketingExactGuidesPoliciesEn.exactTutorials,
        marketingExactGuidesPoliciesFr.exactTutorials,
        renderInFrench(<Tutorials />),
      ],
    ] as const;

    for (const [english, french, markup] of pages) {
      const visiblePairs = stringPairs(english, french).filter(
        (pair) =>
          !pair.path.startsWith('seo.') &&
          !pair.path.endsWith('.id') &&
          !pair.path.endsWith('.kind') &&
          !pair.path.endsWith('.link') &&
          !pair.path.endsWith('.level'),
      );

      for (const pair of visiblePairs) {
        expect(markup, `missing French catalog leaf at ${pair.path}`).toContain(
          renderToStaticMarkup(<>{pair.french}</>),
        );

        if (pair.english !== pair.french && pair.english.length >= 4 && /\p{L}/u.test(pair.english)) {
          expect(markup, `residual English catalog leaf at ${pair.path}`).not.toMatch(
            visibleTextPattern(renderToStaticMarkup(<>{pair.english}</>)),
          );
        }
      }
    }
  });

  it('preserves brands, technical terms, email links and stable documentation anchors', () => {
    const deletion = renderInFrench(<DataDeletion />);
    const enforcement = renderInFrench(<Enforcement />);
    const tutorials = renderInFrench(<Tutorials />);

    expect(deletion).toContain('mailto:privacy@e-code.ai');
    expect(enforcement).toContain('mailto:appeals@e-code.ai');
    expect(enforcement).toContain('mailto:abuse@e-code.ai');
    expect(enforcement).toContain('CSAM');
    expect(enforcement).toContain('DMCA');
    expect(tutorials).toContain('Postgres');
    expect(tutorials).toContain('GitHub');
    expect(tutorials).toContain('commits');
    expect(tutorials).toContain('pull requests');
    expect(tutorials).toContain('/docs#build-a-full-stack-app-with-the-ai-agent');
    expect(tutorials).toContain('/docs#ship-as-a-team');
    expect(tutorialHref('Git workflows & GitHub sync')).toBe('/docs#git-workflows-and-github-sync');
  });

  it('keeps long French copy responsive with semantic light/dark tokens and visible focus', () => {
    const componentSources = [
      '../../../components/marketing/ecode-exact/pages/DataDeletion.tsx',
      '../../../components/marketing/ecode-exact/pages/Enforcement.tsx',
      '../../../components/marketing/ecode-exact/pages/LocalizedPolicyArticle.tsx',
      '../../../components/marketing/ecode-exact/pages/Tutorials.tsx',
    ].map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

    const source = componentSources.join('\n');

    expect(source).toContain('text-responsive-2xl');
    expect(source).toContain('dark:prose-invert');
    expect(source).toContain('break-words');
    expect(source).toContain('min-w-0');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('border-border');
    expect(source).toContain('bg-surface-solid');
    expect(source).toContain('focus-visible:ring');
    expect(source).not.toContain('#F26207');
    expect(source).not.toContain('rgba(');
    expect(source).not.toContain('border-white/');
    expect(source).not.toContain('bg-black');
  });

  it.each([
    [
      dataDeletionLoader,
      dataDeletionMeta,
      'https://e-code.ai/data-deletion',
      marketingExactGuidesPoliciesFr.exactDataDeletion.seo,
    ],
    [
      enforcementLoader,
      enforcementMeta,
      'https://e-code.ai/enforcement',
      marketingExactGuidesPoliciesFr.exactEnforcement.seo,
    ],
    [tutorialsLoader, tutorialsMeta, 'https://e-code.ai/tutorials', marketingExactGuidesPoliciesFr.exactTutorials.seo],
  ])('serves localized route metadata', (loader, meta, url, seo) => {
    const data = loader({ request: new Request(`${url}?lang=fr`) } as never);
    const tags = meta({ data } as never);

    expect(data.language).toBe('fr');
    expect(tags).toEqual(expect.arrayContaining([{ title: seo.title }]));
    expect(tags).toEqual(expect.arrayContaining([{ name: 'description', content: seo.description }]));
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'og:title', content: seo.title })]),
    );
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'og:description', content: seo.description })]),
    );
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'twitter:description', content: seo.description })]),
    );
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'twitter:image:alt', content: seo.imageAlt })]),
    );
  });

  it.each(['/data-deletion', '/enforcement', '/tutorials'])(
    'inherits canonical and en/fr alternates for %s',
    (path) => {
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
    },
  );

  it('leaves no hard-coded visible source copy in the pages, shared renderer or routes', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const files = [
      '../../../components/marketing/ecode-exact/pages/DataDeletion.tsx',
      '../../../components/marketing/ecode-exact/pages/Enforcement.tsx',
      '../../../components/marketing/ecode-exact/pages/LocalizedPolicyArticle.tsx',
      '../../../components/marketing/ecode-exact/pages/Tutorials.tsx',
      '../../../routes/data-deletion.tsx',
      '../../../routes/enforcement.tsx',
      '../../../routes/tutorials.tsx',
    ];

    for (const relativePath of files) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      const result = scanSource(source, relativePath);

      expect(result.parseErrors, relativePath).toEqual([]);
      expect(result.findings, relativePath).toEqual([]);
    }
  });
});
