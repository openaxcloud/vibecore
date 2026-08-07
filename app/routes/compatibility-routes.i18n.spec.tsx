/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <div data-testid="public-shell">{children}</div>,
}));

import IdeProjectCompatibilityPage, {
  buildIdeProjectCompatibilityPage,
  ideCompatibilityCanonicalUrl,
  loader as ideLoader,
  meta as ideMeta,
} from './ide.$id';
import MobileWorkspacePage, {
  buildMobileWorkspacePage,
  loader as mobileLoader,
  meta as mobileMeta,
  mobileWorkspaceCanonicalUrl,
} from './mobile-workspace.$projectId';
import {
  compatibilityRoutesEn,
  compatibilityRoutesFr,
  formatCompatibilityRouteCopy,
  getCompatibilityRoutesCopy,
  resolveCompatibilityRouteLanguage,
} from '~/lib/i18n/catalogs/compatibility-routes';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function readData<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

function loaderArgs(url: string, headers?: HeadersInit): Parameters<typeof mobileLoader>[0] {
  return { request: new Request(url, { headers }), params: {}, context: {} } as Parameters<typeof mobileLoader>[0];
}

describe('compatibility route catalog', () => {
  it('keeps complete EN/FR key parity and falls back safely to English', () => {
    expect(Object.keys(compatibilityRoutesFr).sort()).toEqual(Object.keys(compatibilityRoutesEn).sort());
    expect(resolveCompatibilityRouteLanguage('fr-CA')).toBe('fr');
    expect(resolveCompatibilityRouteLanguage('es')).toBe('en');
    expect(getCompatibilityRoutesCopy('de')['mobileWorkspace.page.title']).toBe('Mobile workspace');
  });

  it('interpolates the project ID without translating or dropping it', () => {
    const template = getCompatibilityRoutesCopy('fr')['ideCompatibility.page.title'];

    expect(formatCompatibilityRouteCopy(template, { projectId: 'client-alpha-42' })).toBe(
      'Ouvrir le projet client-alpha-42 dans l’IDE',
    );
    expect(formatCompatibilityRouteCopy('{unknown}', {})).toBe('{unknown}');
  });

  it('builds French page definitions while preserving brands, IDs, and encoded technical URLs', () => {
    const projectId = 'client alpha/42';
    const mobilePage = buildMobileWorkspacePage(projectId, 'fr');
    const idePage = buildIdeProjectCompatibilityPage(projectId, 'fr');

    expect(mobilePage.title).toBe('Espace de travail mobile');
    expect(mobilePage.description).toContain('E-Code');
    expect(mobilePage.primaryAction).toEqual([
      'Ouvrir l’IDE du projet',
      '/projects/client%20alpha%2F42/ide?panel=agent',
    ]);
    expect(idePage.title).toBe('Ouvrir le projet client alpha/42 dans l’IDE');
    expect(idePage.primaryAction).toEqual(['Ouvrir l’IDE canonique', '/projects/client%20alpha%2F42/ide']);
    expect(idePage.sections[0]?.items[0]).toBe('/projects/client%20alpha%2F42/ide');
    expect(JSON.stringify({ mobilePage, idePage })).not.toMatch(
      /Mobile workspace|Open canonical IDE|Compatibility behavior|Production boundary/u,
    );
  });
});

describe('localized compatibility route rendering', () => {
  it('switches the complete mobile workspace copy from French to English immediately', async () => {
    const i18n = createI18nInstance('fr');

    const view = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/mobile-workspace/client-42']}>
          <Routes>
            <Route path="/mobile-workspace/:projectId" element={<MobileWorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Espace de travail mobile' })).toBeTruthy();
    expect(screen.getByText('Poursuivre sur mobile')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Ouvrir l’IDE du projet' })[0]?.getAttribute('href')).toBe(
      '/projects/client-42/ide?panel=agent',
    );
    expect(document.body.textContent).not.toMatch(/Mobile workspace|Continue on mobile|Secure project access/u);

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/mobile-workspace/client-42']}>
          <Routes>
            <Route path="/mobile-workspace/:projectId" element={<MobileWorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Mobile workspace' })).toBeTruthy();
    expect(screen.getByText('Continue on mobile')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Espace de travail mobile|Poursuivre sur mobile/u);
  });

  it('switches the IDE compatibility copy while keeping the project ID unchanged', async () => {
    const i18n = createI18nInstance('fr');

    const view = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/ide/client-42']}>
          <Routes>
            <Route path="/ide/:id" element={<IdeProjectCompatibilityPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Ouvrir le projet client-42 dans l’IDE' })).toBeTruthy();
    expect(screen.getByText('Fonctionnement de la compatibilité')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Ouvrir l’IDE canonique' })[0]?.getAttribute('href')).toBe(
      '/projects/client-42/ide',
    );

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/ide/client-42']}>
          <Routes>
            <Route path="/ide/:id" element={<IdeProjectCompatibilityPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Open IDE project client-42' })).toBeTruthy();
    expect(screen.getByText('Compatibility behavior')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Ouvrir le projet|Fonctionnement de la compatibilité/u);
  });
});

describe('compatibility route locale loaders and SEO', () => {
  it('detects French on first mobile visit and persists the automatic locale', () => {
    const result = mobileLoader(
      loaderArgs('https://e-code.ai/mobile-workspace/client-42', {
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      }),
    ) as unknown as { data: { language: string }; init: { headers: HeadersInit } };

    const headers = new Headers(result.init.headers);

    expect(readData<{ language: string }>(result).language).toBe('fr');
    expect(headers.get('Content-Language')).toBe('fr');
    expect(headers.get('Vary')).toBe('Cookie, Accept-Language');
    expect(headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
  });

  it('keeps a manual English choice authoritative on the IDE route', () => {
    const result = ideLoader(
      loaderArgs('https://e-code.ai/ide/client-42', {
        Cookie: 'vibecore-lang=en; vibecore-auto-lang=fr',
        'Accept-Language': 'fr-FR',
      }),
    ) as unknown as { data: { language: string }; init: { headers: HeadersInit } };

    expect(readData<{ language: string }>(result).language).toBe('en');
    expect(new Headers(result.init.headers).get('Content-Language')).toBe('en');
    expect(new Headers(result.init.headers).get('Set-Cookie')).toBeNull();
  });

  it('emits localized mobile SEO with an English canonical and stable hreflang links', () => {
    const projectId = 'client alpha/42';
    const canonicalUrl = mobileWorkspaceCanonicalUrl(projectId);

    const descriptors = mobileMeta({
      data: { language: 'fr' },
      matches: [],
      params: { projectId },
    } as unknown as Parameters<typeof mobileMeta>[0]);

    expect(descriptors).toContainEqual({ title: 'Espace de travail mobile — E-Code' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({ name: 'twitter:title', content: 'Espace de travail mobile — E-Code' });
    expect(descriptors).toContainEqual({ tagName: 'link', rel: 'canonical', href: canonicalUrl });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: `${canonicalUrl}?lang=en`,
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: `${canonicalUrl}?lang=fr`,
    });
  });

  it('localizes dynamic IDE metadata without changing the project ID or canonical path', () => {
    const projectId = 'client-alpha-42';
    const canonicalUrl = ideCompatibilityCanonicalUrl(projectId);

    const descriptors = ideMeta({
      data: { language: 'fr' },
      matches: [],
      params: { id: projectId },
    } as unknown as Parameters<typeof ideMeta>[0]);

    expect(descriptors).toContainEqual({ title: 'Projet client-alpha-42 dans l’IDE — E-Code' });
    expect(descriptors).toContainEqual({
      name: 'description',
      content:
        'Ouvrez le projet client-alpha-42 dans l’IDE E-Code depuis la route de compatibilité, puis poursuivez dans l’espace de travail canonique du projet.',
    });
    expect(descriptors).toContainEqual({ tagName: 'link', rel: 'canonical', href: canonicalUrl });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: `${canonicalUrl}?lang=en`,
    });
    expect(descriptors).toContainEqual({ property: 'og:locale:alternate', content: 'en_US' });

    const englishFallback = ideMeta({
      data: undefined,
      matches: [],
      params: { id: projectId },
    } as unknown as Parameters<typeof ideMeta>[0]);
    expect(englishFallback).toContainEqual({ title: 'IDE project client-alpha-42 — E-Code' });
  });
});

describe('compatibility route source guards', () => {
  it('has zero targeted hardcoded-copy findings and retains responsive, accessible shared primitives', async () => {
    const routeFiles = ['app/routes/mobile-workspace.$projectId.tsx', 'app/routes/ide.$id.tsx'];
    const sharedSource = readFileSync('app/components/marketing/EcodeMarketingPages.tsx', 'utf8');
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');

    for (const routeFile of routeFiles) {
      const routeSource = readFileSync(routeFile, 'utf8');
      const result = scanSource(routeSource, routeFile);

      expect(result.parseErrors).toEqual([]);
      expect(result.findings).toEqual([]);
      expect(routeSource).toContain('localeResponseHeaders');
      expect(routeSource).toContain("hrefLang: 'fr'");
      expect(routeSource).toContain('useTranslation');
    }

    expect(sharedSource).toContain('min-h-[44px]');
    expect(sharedSource).toContain('container-responsive');
    expect(sharedSource).toContain('sm:flex-row');
  });
});
