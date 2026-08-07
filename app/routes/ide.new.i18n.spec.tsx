/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <div data-testid="public-shell">{children}</div>,
}));

import IdeNewPage, { buildIdeNewPage, loader, meta } from './ide.new';
import {
  getIdeNewRouteCopy,
  ideNewRouteEn,
  ideNewRouteFr,
  resolveIdeNewRouteLanguage,
} from '~/lib/i18n/catalogs/ide-new-route';
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

function loaderArgs(url: string, headers?: HeadersInit): Parameters<typeof loader>[0] {
  return { request: new Request(url, { headers }) } as Parameters<typeof loader>[0];
}

describe('new IDE route catalog', () => {
  it('keeps complete EN/FR key parity and falls back to English', () => {
    expect(Object.keys(ideNewRouteFr).sort()).toEqual(Object.keys(ideNewRouteEn).sort());
    expect(resolveIdeNewRouteLanguage('fr-CA')).toBe('fr');
    expect(resolveIdeNewRouteLanguage('es')).toBe('en');
    expect(getIdeNewRouteCopy('de')['ideNew.page.title']).toBe('Create a new IDE project');
  });

  it('preserves brands and technical routes while localizing every visible field', () => {
    const page = buildIdeNewPage('fr');

    expect(page.title).toBe('Créer un nouveau projet dans l’IDE');
    expect(page.description).toContain('E-Code');
    expect(page.description).toContain('/ide/new');
    expect(page.primaryAction).toEqual(['Créer un projet', '/projects/new']);
    expect(page.secondaryAction).toEqual(['Parcourir les modèles', '/templates']);
    expect(page.sections[1]?.items[0]).toBe('/projects/new');
    expect(JSON.stringify(page)).not.toMatch(
      /Create a new IDE project|Browse templates|Project creation|Authenticated workspace/u,
    );
  });
});

describe('new IDE localized route', () => {
  it('renders French and switches the complete route copy to English immediately', async () => {
    const i18n = createI18nInstance('fr');

    const view = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <IdeNewPage />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Créer un nouveau projet dans l’IDE' })).toBeTruthy();
    expect(screen.getByText('Configuration de l’environnement d’exécution')).toBeTruthy();
    expect(screen.getByText('Créer à partir d’un prompt ou d’un modèle')).toBeTruthy();

    const frenchPrimaryActions = screen.getAllByRole('link', { name: 'Créer un projet' });
    expect(frenchPrimaryActions.length).toBeGreaterThan(0);
    expect(frenchPrimaryActions[0]?.getAttribute('href')).toBe('/projects/new');
    expect(frenchPrimaryActions[0]?.className).toContain('min-h-[44px]');

    const frenchSecondaryActions = screen.getAllByRole('link', { name: 'Parcourir les modèles' });
    expect(frenchSecondaryActions.length).toBeGreaterThan(0);
    expect(frenchSecondaryActions[0]?.getAttribute('href')).toBe('/templates');
    expect(document.body.textContent).not.toMatch(/Create a new IDE project|Browse templates|Runtime setup/u);

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <IdeNewPage />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Create a new IDE project' })).toBeTruthy();
    expect(screen.getByText('Runtime setup')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Browse templates' })[0]?.getAttribute('href')).toBe('/templates');
    expect(document.body.textContent).not.toMatch(/Créer un nouveau projet|Parcourir les modèles/u);
  });
});

describe('new IDE locale loader and SEO', () => {
  it('detects French on first visit and emits locale response headers', () => {
    const result = loader(
      loaderArgs('https://e-code.ai/ide/new', {
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      }),
    ) as unknown as { data: { language: string }; init: { headers: HeadersInit } };

    const headers = new Headers(result.init.headers);

    expect(readData<{ language: string }>(result).language).toBe('fr');
    expect(headers.get('Content-Language')).toBe('fr');
    expect(headers.get('Vary')).toBe('Cookie, Accept-Language');
    expect(headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
  });

  it('keeps a manual English choice authoritative over browser French', () => {
    const result = loader(
      loaderArgs('https://e-code.ai/ide/new', {
        Cookie: 'vibecore-lang=en; vibecore-auto-lang=fr',
        'Accept-Language': 'fr-FR',
      }),
    ) as unknown as { data: { language: string }; init: { headers: HeadersInit } };

    expect(readData<{ language: string }>(result).language).toBe('en');
    expect(new Headers(result.init.headers).get('Set-Cookie')).toBeNull();
  });

  it('emits localized French SEO with English canonical and stable hreflang links', () => {
    const descriptors = meta({
      data: { language: 'fr' },
      matches: [],
    } as unknown as Parameters<typeof meta>[0]);

    expect(descriptors).toContainEqual({ title: 'Créer un nouveau projet dans l’IDE — E-Code' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({
      name: 'twitter:title',
      content: 'Créer un nouveau projet dans l’IDE — E-Code',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/ide/new',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: 'https://e-code.ai/ide/new?lang=en',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/ide/new?lang=fr',
    });
    expect(JSON.stringify(descriptors)).not.toContain('Create a new E-Code project');

    const englishFallback = meta({ data: undefined, matches: [] } as unknown as Parameters<typeof meta>[0]);
    expect(englishFallback).toContainEqual({ title: 'Create a new IDE project — E-Code' });
  });
});

describe('new IDE source guards', () => {
  it('has zero targeted hardcoded-copy findings and uses the responsive marketing primitives', async () => {
    const routeFile = 'app/routes/ide.new.tsx';
    const routeSource = readFileSync(routeFile, 'utf8');
    const sharedSource = readFileSync('app/components/marketing/EcodeMarketingPages.tsx', 'utf8');
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(routeSource, routeFile);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(routeSource).toContain('localeResponseHeaders');
    expect(routeSource).toContain("hrefLang: 'fr'");
    expect(routeSource).toContain('useTranslation');
    expect(sharedSource).toContain('min-h-[44px]');
    expect(sharedSource).toContain('container-responsive');
    expect(sharedSource).toContain('sm:flex-row');
  });
});
