/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hasValidWebSessionMock = vi.hoisted(() => vi.fn());

vi.mock('~/lib/.server/require-session', () => ({
  hasValidWebSession: (...args: unknown[]) => hasValidWebSessionMock(...args),
}));

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <div data-testid="public-shell">{children}</div>,
  LinkButton: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { loader as notFoundLoader, meta as notFoundMeta, NotFoundView } from './$';
import { loader as accountInactivityLoader, meta as accountInactivityMeta } from './account-inactivity';
import { loader as careersLoader, meta as careersMeta } from './careers';
import { loader as contactSalesLoader, meta as contactSalesMeta } from './contact-sales';
import { loader as docsLoader, meta as docsMeta } from './docs';
import { loader as dpaLoader, meta as dpaMeta } from './dpa';
import { loader as helpCenterLoader, meta as helpCenterMeta } from './help-center';
import { loader as languagesLoader, meta as languagesMeta } from './languages';
import { loader as reportAbuseLoader, meta as reportAbuseMeta } from './report-abuse';
import { loader as studentDpaLoader, meta as studentDpaMeta } from './student-dpa';
import { loader as subprocessorsLoader, meta as subprocessorsMeta } from './subprocessors';
import { loader as templatesLoader, meta as templatesMeta, toPublicTemplate } from './templates';
import { getPublicRouteSeoCopy, publicRouteSeoEn, publicRouteSeoFr } from '~/lib/i18n/catalogs/public-route-seo';
import { createI18nInstance } from '~/lib/i18n/runtime';
import type { EcodeTemplate } from '~/lib/marketing/ecode-template-catalog.server';

type RouteMeta = (args: never) => ReturnType<typeof careersMeta>;
type RouteLoader = (args: never) => unknown;

const ROUTES = [
  {
    path: '/missing-page',
    meta: notFoundMeta,
    loader: notFoundLoader,
    en: 'Page not found · E-Code',
    fr: 'Page introuvable · E-Code',
  },
  {
    path: '/careers',
    meta: careersMeta,
    loader: careersLoader,
    en: 'Careers — E-Code',
    fr: 'Carrières — E-Code',
  },
  {
    path: '/contact-sales',
    meta: contactSalesMeta,
    loader: contactSalesLoader,
    en: 'Contact Sales — E-Code',
    fr: 'Contacter l’équipe commerciale — E-Code',
  },
  {
    path: '/docs',
    meta: docsMeta,
    loader: docsLoader,
    en: 'Documentation — E-Code',
    fr: 'Documentation — E-Code',
  },
  {
    path: '/templates',
    meta: templatesMeta,
    loader: templatesLoader,
    en: 'Templates — E-Code',
    fr: 'Modèles — E-Code',
  },
  {
    path: '/account-inactivity',
    meta: accountInactivityMeta,
    loader: accountInactivityLoader,
    en: 'Account Inactivity Policy — E-Code',
    fr: 'Politique d’inactivité du compte — E-Code',
  },
  {
    path: '/dpa',
    meta: dpaMeta,
    loader: dpaLoader,
    en: 'Data Processing Agreement — E-Code',
    fr: 'Accord de traitement des données — E-Code',
  },
  {
    path: '/help-center',
    meta: helpCenterMeta,
    loader: helpCenterLoader,
    en: 'Help Center — E-Code',
    fr: 'Centre d’aide — E-Code',
  },
  {
    path: '/languages',
    meta: languagesMeta,
    loader: languagesLoader,
    en: 'Languages — E-Code',
    fr: 'Langages — E-Code',
  },
  {
    path: '/report-abuse',
    meta: reportAbuseMeta,
    loader: reportAbuseLoader,
    en: 'Report Abuse — E-Code',
    fr: 'Signaler un abus — E-Code',
  },
  {
    path: '/student-dpa',
    meta: studentDpaMeta,
    loader: studentDpaLoader,
    en: 'Student Data Processing Agreement — E-Code',
    fr: 'Accord de traitement des données des élèves — E-Code',
  },
  {
    path: '/subprocessors',
    meta: subprocessorsMeta,
    loader: subprocessorsLoader,
    en: 'Subprocessors — E-Code',
    fr: 'Sous-traitants — E-Code',
  },
] as const;

const ROUTE_FILES = [
  'app/routes/$.tsx',
  'app/routes/careers.tsx',
  'app/routes/contact-sales.tsx',
  'app/routes/docs.tsx',
  'app/routes/templates.tsx',
  'app/routes/account-inactivity.tsx',
  'app/routes/dpa.tsx',
  'app/routes/help-center.tsx',
  'app/routes/languages.tsx',
  'app/routes/report-abuse.tsx',
  'app/routes/student-dpa.tsx',
  'app/routes/subprocessors.tsx',
] as const;

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

function responseStatus(result: unknown): number | undefined {
  if (result && typeof result === 'object' && 'init' in result) {
    return (result as { init?: { status?: number } }).init?.status;
  }

  return result instanceof Response ? result.status : undefined;
}

function metaTags(routeMeta: unknown, language: 'en' | 'fr', pathname: string) {
  return (routeMeta as RouteMeta)({
    data: { language },
    location: { pathname },
    matches: [],
  } as never);
}

function renderNotFound(language: 'en' | 'fr', status = 404) {
  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <MemoryRouter>
        <NotFoundView status={status} />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

afterEach(() => {
  cleanup();
  hasValidWebSessionMock.mockReset();
});

describe('public route locale and SEO contracts', () => {
  it('keeps the dedicated route catalog structurally complete with English fallback', () => {
    expect(Object.keys(publicRouteSeoFr)).toEqual(Object.keys(publicRouteSeoEn));
    expect(getPublicRouteSeoCopy('fr-FR')['publicRouteSeo.templates.title']).toBe('Modèles — E-Code');
    expect(getPublicRouteSeoCopy('de-DE')['publicRouteSeo.templates.title']).toBe('Templates — E-Code');
  });

  it('emits complete localized metadata, canonical URLs, and EN/FR/x-default alternates', () => {
    for (const route of ROUTES) {
      for (const [language, title] of [
        ['en', route.en],
        ['fr', route.fr],
      ] as const) {
        const tags = metaTags(route.meta, language, route.path);
        const canonical = `https://e-code.ai${route.path}`;

        expect(tags, `${route.path} ${language}`).toContainEqual({ title });
        expect(tags).toContainEqual({ property: 'og:title', content: title });
        expect(tags).toContainEqual({ property: 'og:url', content: canonical });
        expect(tags).toContainEqual({ property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' });
        expect(tags).toContainEqual({ name: 'twitter:title', content: title });
        expect(tags).toContainEqual({ tagName: 'link', rel: 'canonical', href: canonical });
        expect(tags).toContainEqual({
          tagName: 'link',
          rel: 'alternate',
          hrefLang: 'en',
          href: `${canonical}?lang=en`,
        });
        expect(tags).toContainEqual({
          tagName: 'link',
          rel: 'alternate',
          hrefLang: 'fr',
          href: `${canonical}?lang=fr`,
        });
        expect(tags).toContainEqual({
          tagName: 'link',
          rel: 'alternate',
          hrefLang: 'x-default',
          href: canonical,
        });
        expect(tags).toContainEqual(expect.objectContaining({ property: 'og:image:alt' }));
        expect(tags).toContainEqual(expect.objectContaining({ name: 'twitter:image:alt' }));
      }
    }
  });

  it('detects French on first visit and persists locale response headers on every synchronous route', () => {
    const synchronousRoutes = ROUTES.filter((route) => route.path !== '/templates');

    for (const route of synchronousRoutes) {
      const result = (route.loader as RouteLoader)({
        request: new Request(`https://e-code.ai${route.path}`, {
          headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7' },
        }),
      } as never);

      const data = dataOf<{ language: string }>(result);
      const headers = headersOf(result);

      expect(data.language, route.path).toBe('fr');
      expect(headers.get('Content-Language'), route.path).toBe('fr');
      expect(headers.get('Vary'), route.path).toBe('Cookie, Accept-Language');
      expect(headers.get('Set-Cookie'), route.path).toContain('vibecore-auto-lang=fr');
    }
  });

  it('keeps the manual language cookie authoritative over browser detection', () => {
    const result = careersLoader({
      request: new Request('https://e-code.ai/careers', {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: 'vibecore-lang=fr',
        },
      }),
    } as never);

    expect(dataOf<{ language: string }>(result).language).toBe('fr');
    expect(headersOf(result).get('Set-Cookie')).toBeNull();
  });

  it('returns a real localized 404 response without exposing the requested path as an error message', () => {
    const result = notFoundLoader({
      request: new Request('https://e-code.ai/wp-login.php/private-probe', {
        headers: { 'Accept-Language': 'fr' },
      }),
    } as never);

    expect(responseStatus(result)).toBe(404);
    expect(dataOf<{ language: string; status: number }>(result)).toEqual({ language: 'fr', status: 404 });
    expect(JSON.stringify(dataOf(result))).not.toContain('private-probe');
  });

  it('renders localized 404 and unexpected-error recovery actions in both languages', () => {
    renderNotFound('fr');

    expect(screen.getByRole('heading', { name: 'Cette page est introuvable' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Accéder au tableau de bord' }).getAttribute('href')).toBe('/dashboard');
    expect(screen.queryByText('This page could not be found')).toBeNull();

    cleanup();
    renderNotFound('en', 500);

    expect(screen.getByText('Error 500')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Visit the help center' }).getAttribute('href')).toBe('/help-center');
  });

  it('loads the public template catalog in French and maps difficulty to localized UI keys', async () => {
    hasValidWebSessionMock.mockResolvedValue(false);

    const result = await templatesLoader({
      request: new Request('https://e-code.ai/templates', {
        headers: { 'Accept-Language': 'fr-FR,fr;q=0.9' },
      }),
    } as never);
    const data = dataOf<{
      language: string;
      categories: Array<{ name: string }>;
      templates: Array<{ description: string; difficulty: string }>;
    }>(result);

    expect(data.language).toBe('fr');
    expect(headersOf(result).get('Content-Language')).toBe('fr');
    expect(data.templates.some((template) => template.description.includes('Modèle SaaS de production'))).toBe(true);
    expect(data.templates.map((template) => template.description).join(' ')).not.toContain('Production SaaS starter');
    expect(data.templates.every((template) => ['easy', 'medium', 'hard'].includes(template.difficulty))).toBe(true);

    const mapped = toPublicTemplate({ difficulty: 'advanced' } as EcodeTemplate);
    expect(mapped.difficulty).toBe('hard');
  });

  it('has zero direct scanner findings in every assigned route', async () => {
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');

    for (const sourcePath of ROUTE_FILES) {
      const result = scanSource(readFileSync(sourcePath, 'utf8'), sourcePath);

      expect(result.parseErrors, sourcePath).toEqual([]);
      expect(result.findings, sourcePath).toEqual([]);
    }
  });
});
