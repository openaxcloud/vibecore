import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactCaseStudiesCollaborationCopy,
  marketingExactCaseStudiesCollaborationEn,
  marketingExactCaseStudiesCollaborationFr,
} from './marketing-exact-case-studies-collaboration';

import CaseStudies from '~/components/marketing/ecode-exact/pages/CaseStudies';
import Collaboration from '~/components/marketing/ecode-exact/pages/Collaboration';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { loader as rootLoader } from '~/root';
import { loader as caseStudiesLoader, meta as caseStudiesMeta } from '~/routes/case-studies';
import { loader as collaborationLoader, meta as collaborationMeta } from '~/routes/collaboration';

function leafPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }

  return [path.join('.')];
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

describe('exact case studies and collaboration marketing catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactCaseStudiesCollaborationFr)).toEqual(
      leafPaths(marketingExactCaseStudiesCollaborationEn),
    );
  });

  it('falls back to English for unsupported locales', () => {
    const fallback = getMarketingExactCaseStudiesCollaborationCopy('de-DE');

    expect(fallback.exactCaseStudies.hero.title).toBe('From a prompt to a deployed app');
    expect(fallback.exactCollaboration.hero.title).toBe('Build together, in real time');
  });

  it('renders the complete Case Studies page in French', () => {
    const markup = renderInFrench(<CaseStudies />);

    expect(markup).toContain('Du prompt à l’application déployée');
    expect(markup).toContain('Le cycle de création, de bout en bout');
    expect(markup).toContain('Espaces de travail reproductibles');
    expect(markup).toContain('Écrivez votre propre réussite');
    expect(markup).not.toContain('From a prompt to a deployed app');
    expect(markup).not.toContain('The build loop, end to end');
    expect(markup).not.toContain('Open dashboard');
  });

  it('renders the complete Collaboration page in French', () => {
    const markup = renderInFrench(<Collaboration />);

    expect(markup).toContain('Créez ensemble, en temps réel');
    expect(markup).toContain('Fonctionnalités de collaboration');
    expect(markup).toContain('Sachez toujours qui est présent');
    expect(markup).toContain('Créer un espace de travail partagé');
    expect(markup).not.toContain('Build together, in real time');
    expect(markup).not.toContain('Collaboration Features');
    expect(markup).not.toContain('Create a Shared Workspace');
  });

  it('preserves brands, URLs and accepted technical terminology', () => {
    const caseStudies = renderInFrench(<CaseStudies />);

    expect(caseStudies).toContain('GitHub');
    expect(caseStudies).toContain('GitLab');
    expect(caseStudies).toContain('MCP');
    expect(caseStudies).toContain('Model Context Protocol');
    expect(caseStudies).toContain('commit');
    expect(caseStudies).toContain('/ecode-static/assets/product/ide-deploy.png');
  });

  it('uses stable links and responsive CTA widths instead of a JavaScript redirect', () => {
    const collaboration = renderInFrench(<Collaboration />);

    const caseStudiesSource = readFileSync(
      new URL('../../../components/marketing/ecode-exact/pages/CaseStudies.tsx', import.meta.url),
      'utf8',
    );
    const collaborationSource = readFileSync(
      new URL('../../../components/marketing/ecode-exact/pages/Collaboration.tsx', import.meta.url),
      'utf8',
    );

    expect(collaboration).toContain('href="/register"');
    expect(collaborationSource).not.toContain('window.location.href');
    expect(caseStudiesSource).toContain('w-full sm:w-auto');
    expect(collaborationSource).toContain('w-full max-w-sm sm:w-auto');
  });

  it.each([
    [caseStudiesLoader, caseStudiesMeta, 'https://e-code.ai/case-studies', 'Cas d’usage — E-Code'],
    [collaborationLoader, collaborationMeta, 'https://e-code.ai/collaboration', 'Collaboration — E-Code'],
  ])('serves localized route metadata', (loader, meta, url, title) => {
    const data = loader({ request: new Request(`${url}?lang=fr`) } as never);
    const tags = meta({ data } as never);

    expect(data.language).toBe('fr');
    expect(tags).toEqual(expect.arrayContaining([{ title }]));
    expect(tags).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'og:title', content: title })]));
    expect(tags).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'twitter:description' })]));
    expect(tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'twitter:image:alt', content: expect.stringContaining('E-Code') }),
      ]),
    );
  });

  it.each(['/case-studies', '/collaboration'])('inherits canonical and en/fr alternates for %s', (path) => {
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

  it('leaves no hard-coded visible source copy in the two pages or routes', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const files = [
      '../../../components/marketing/ecode-exact/pages/CaseStudies.tsx',
      '../../../components/marketing/ecode-exact/pages/Collaboration.tsx',
      '../../../routes/case-studies.tsx',
      '../../../routes/collaboration.tsx',
    ];

    for (const relativePath of files) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      const result = scanSource(source, relativePath);

      expect(result.parseErrors, relativePath).toEqual([]);
      expect(result.findings, relativePath).toEqual([]);
    }
  });
});
