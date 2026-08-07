/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TemplatesLanguagesRoute, {
  ErrorBoundary,
  getTemplateLanguageDisplayName,
  loader,
  meta,
} from './templates_.languages';
import {
  formatTemplatesLanguagesRouteCount,
  formatTemplatesLanguagesRouteNumber,
  formatTemplatesLanguagesRouteSummary,
  getTemplatesLanguagesRouteCopy,
  getTemplatesLanguagesRouteSafeError,
  templatesLanguagesRouteEn,
  templatesLanguagesRouteFr,
} from '~/lib/i18n/catalogs/templates-languages-route';

const testState = vi.hoisted(() => ({
  catalog: vi.fn(),
  language: 'fr' as 'en' | 'fr',
  loaderData: {
    language: 'en' as 'en' | 'fr',
    loadState: 'ready' as 'ready' | 'error',
    languages: [] as Array<{ name: string; count: number }>,
    total: 0,
  },
  revalidate: vi.fn(),
  revalidatorState: 'idle' as 'idle' | 'loading',
}));

vi.mock('~/lib/marketing/ecode-template-catalog.server', () => ({
  getEcodeTemplateCatalog: testState.catalog,
}));

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => <div data-testid="public-shell">{children}</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: testState.language, resolvedLanguage: testState.language },
  }),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useLoaderData: () => testState.loaderData,
    useRevalidator: () => ({ state: testState.revalidatorState, revalidate: testState.revalidate }),
  };
});

beforeEach(() => {
  testState.catalog.mockReset();
  testState.catalog.mockReturnValue([]);
  testState.language = 'fr';
  testState.loaderData = {
    language: 'en',
    loadState: 'ready',
    languages: [],
    total: 0,
  };
  testState.revalidate.mockReset();
  testState.revalidatorState = 'idle';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderRoute(language: 'en' | 'fr' = 'fr') {
  testState.language = language;

  return render(
    <MemoryRouter>
      <TemplatesLanguagesRoute />
    </MemoryRouter>,
  );
}

function loaderArgs(url: string, headers?: HeadersInit): Parameters<typeof loader>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url, { headers }),
  } as Parameters<typeof loader>[0];
}

describe('templates languages catalog', () => {
  it('keeps complete EN/FR key parity and an English catalog fallback', () => {
    expect(Object.keys(templatesLanguagesRouteFr).sort()).toEqual(Object.keys(templatesLanguagesRouteEn).sort());

    expect(getTemplatesLanguagesRouteCopy('es')['templatesLanguages.hero.title']).toBe('Browse templates by language');
  });

  it('formats French numbers and all template/language plural combinations', () => {
    const frenchNumber = new Intl.NumberFormat('fr-FR').format(12_345);

    expect(formatTemplatesLanguagesRouteNumber(12_345, 'fr')).toBe(frenchNumber);
    expect(formatTemplatesLanguagesRouteCount(1, 'fr')).toBe('1 modèle');
    expect(formatTemplatesLanguagesRouteCount(2, 'fr')).toBe('2 modèles');
    expect(formatTemplatesLanguagesRouteSummary(1, 1, 'fr')).toContain('1 modèle de démarrage');
    expect(formatTemplatesLanguagesRouteSummary(1, 2, 'fr')).toContain('dans 2 langages');
    expect(formatTemplatesLanguagesRouteSummary(2, 1, 'fr')).toContain('2 modèles de démarrage');
    expect(formatTemplatesLanguagesRouteSummary(2, 2, 'fr')).toContain('dans 2 langages');
  });

  it('always returns locale-reviewed safe copy instead of raw exception details', () => {
    const rawError = 'SQL connection refused: password=secret';

    expect(getTemplatesLanguagesRouteSafeError('fr', new Error(rawError))).toBe(
      'Le catalogue de modèles est temporairement indisponible. Vérifiez votre connexion, puis réessayez.',
    );
    expect(getTemplatesLanguagesRouteSafeError('fr', new Error(rawError))).not.toContain(rawError);
  });
});

describe('templates languages localized route', () => {
  it('renders complete French chrome while preserving language names and technical URLs', () => {
    testState.loaderData = {
      language: 'fr',
      loadState: 'ready',
      total: 12_346,
      languages: [
        { name: 'TypeScript', count: 12_344 },
        { name: 'Ruby', count: 1 },
        { name: 'Other', count: 1 },
      ],
    };

    renderRoute('fr');

    expect(screen.getByRole('heading', { level: 1, name: 'Parcourir les modèles par langage' })).toBeTruthy();
    expect(screen.getByText(/12[\s\u202f\u00a0]346 modèles de démarrage prêts pour la production/)).toBeTruthy();

    const list = screen.getByRole('list', { name: 'Nombre de modèles par langage de programmation' });
    expect(within(list).getByText('TypeScript')).toBeTruthy();
    expect(within(list).getByText('Ruby')).toBeTruthy();
    expect(within(list).getByText('Autre')).toBeTruthy();
    expect(within(list).queryByText('Other')).toBeNull();
    expect(within(list).getAllByLabelText('1 modèle')).toHaveLength(2);
    expect(within(list).queryByRole('link')).toBeNull();

    const cta = screen.getByRole('link', { name: 'Voir tous les modèles' });
    expect(cta.getAttribute('href')).toBe('/templates');
    expect(cta.className).toContain('min-h-11');
    expect(document.body.textContent).not.toMatch(
      /Browse templates by language|View all templates|Template count by programming language|Try again/,
    );
  });

  it('updates all route chrome immediately when the active locale switches FR to EN', async () => {
    testState.loaderData = {
      language: 'fr',
      loadState: 'ready',
      total: 1,
      languages: [{ name: 'Other', count: 1 }],
    };

    const view = renderRoute('fr');

    expect(screen.getByText('Autre')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voir tous les modèles' })).toBeTruthy();

    testState.language = 'en';
    view.rerender(
      <MemoryRouter>
        <TemplatesLanguagesRoute />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Browse templates by language' })).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View all templates' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Parcourir les modèles|Voir tous les modèles|Autre/);
  });

  it('renders localized loading, empty, and recoverable error states', () => {
    testState.revalidatorState = 'loading';

    const loading = renderRoute('fr');
    expect(screen.getByRole('status').textContent).toContain('Chargement des langages des modèles…');
    expect(screen.queryByRole('link', { name: 'Voir tous les modèles' })).toBeNull();
    loading.unmount();

    testState.revalidatorState = 'idle';
    renderRoute('fr');
    expect(screen.getByRole('heading', { name: 'Aucun langage de modèle disponible' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voir tous les modèles' })).toBeTruthy();
    cleanup();

    testState.loaderData = {
      language: 'fr',
      loadState: 'error',
      languages: [],
      total: 0,
    };
    renderRoute('fr');

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Impossible de charger les langages des modèles')).toBeTruthy();

    const retry = within(alert).getByRole('button', { name: 'Réessayer' });
    expect(retry.className).toContain('min-h-11');
    fireEvent.click(retry);
    expect(testState.revalidate).toHaveBeenCalledTimes(1);
  });

  it('renders a localized route error boundary without exception details', () => {
    testState.language = 'fr';
    render(<ErrorBoundary />);

    expect(screen.getByRole('alert').textContent).toContain('Impossible de charger les langages des modèles');
    expect(screen.getByRole('button', { name: 'Recharger la page' }).className).toContain('min-h-11');
  });
});

describe('templates languages loader and SEO', () => {
  it('detects French on first visit, returns sorted counts, and emits locale headers', () => {
    testState.catalog.mockReturnValue([
      { language: 'Go' },
      { language: 'Python' },
      { language: 'Python' },
      { language: '' },
    ]);

    const result = loader(
      loaderArgs('https://e-code.ai/templates/languages', {
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      }),
    ) as unknown as {
      data: {
        language: string;
        loadState: string;
        languages: Array<{ name: string; count: number }>;
        total: number;
      };
      init: { headers: HeadersInit };
    };

    const headers = new Headers(result.init.headers);

    expect(testState.catalog).toHaveBeenCalledWith('fr');
    expect(result.data).toEqual({
      language: 'fr',
      loadState: 'ready',
      languages: [
        { name: 'Python', count: 2 },
        { name: 'Go', count: 1 },
        { name: 'Other', count: 1 },
      ],
      total: 4,
    });
    expect(headers.get('Content-Language')).toBe('fr');
    expect(headers.get('Vary')).toBe('Cookie, Accept-Language');
    expect(headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
  });

  it('keeps manual choice authoritative and falls back to English for unsupported route locales', () => {
    const defaultEnglish = loader(loaderArgs('https://e-code.ai/templates/languages')) as unknown as {
      data: { language: string };
      init: { headers: HeadersInit };
    };
    const manual = loader(
      loaderArgs('https://e-code.ai/templates/languages', {
        Cookie: 'vibecore-lang=en; vibecore-auto-lang=fr',
        'Accept-Language': 'fr-FR',
      }),
    ) as unknown as { data: { language: string }; init: { headers: HeadersInit } };
    const unsupported = loader(loaderArgs('https://e-code.ai/templates/languages?lang=es')) as unknown as {
      data: { language: string };
      init: { headers: HeadersInit };
    };

    expect(defaultEnglish.data.language).toBe('en');
    expect(new Headers(defaultEnglish.init.headers).get('Content-Language')).toBe('en');
    expect(new Headers(defaultEnglish.init.headers).get('Set-Cookie')).toBeNull();
    expect(manual.data.language).toBe('en');
    expect(new Headers(manual.init.headers).get('Content-Language')).toBe('en');
    expect(new Headers(manual.init.headers).get('Set-Cookie')).toBeNull();
    expect(unsupported.data.language).toBe('en');
    expect(new Headers(unsupported.init.headers).get('Content-Language')).toBe('en');
    expect(new Headers(unsupported.init.headers).get('Set-Cookie')).toContain('vibecore-lang=en');
  });

  it('masks catalog failures in both payload and server logs', () => {
    const rawError = 'Database URL postgres://user:secret@example.test/catalog';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    testState.catalog.mockImplementation(() => {
      throw new Error(rawError);
    });

    const result = loader(loaderArgs('https://e-code.ai/templates/languages?lang=fr')) as unknown as {
      data: { language: string; loadState: string; languages: unknown[]; total: number };
      init: { headers: HeadersInit; status: number };
    };

    expect(result.init.status).toBe(502);
    expect(result.data).toEqual({ language: 'fr', loadState: 'error', languages: [], total: 0 });
    expect(JSON.stringify(result.data)).not.toContain(rawError);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(rawError);
  });

  it('emits localized French SEO, canonical English URL, and stable EN/FR hreflang', () => {
    const descriptors = meta({
      data: { language: 'fr', loadState: 'ready', languages: [], total: 0 },
    } as Parameters<typeof meta>[0]);

    expect(descriptors).toContainEqual({ title: 'Modèles par langage — E-Code' });
    expect(descriptors).toContainEqual(
      expect.objectContaining({ name: 'description', content: expect.stringContaining('Parcourez les modèles') }),
    );
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual(
      expect.objectContaining({ property: 'og:image:alt', content: expect.stringContaining('Modèles de démarrage') }),
    );
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/templates/languages',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: 'https://e-code.ai/templates/languages?lang=en',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/templates/languages?lang=fr',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'x-default',
      href: 'https://e-code.ai/templates/languages',
    });
    expect(JSON.stringify(descriptors)).not.toContain('Browse E-Code starter templates');

    const englishFallback = meta({ data: undefined } as Parameters<typeof meta>[0]);
    expect(englishFallback).toContainEqual({ title: 'Templates by language — E-Code' });
  });
});

describe('templates languages source guards', () => {
  it('keeps technical language names untouched and only localizes the catalog fallback category', () => {
    expect(getTemplateLanguageDisplayName('TypeScript', 'fr')).toBe('TypeScript');
    expect(getTemplateLanguageDisplayName('Ruby', 'fr')).toBe('Ruby');
    expect(getTemplateLanguageDisplayName('Other', 'fr')).toBe('Autre');
  });

  it('has zero targeted hardcoded-copy scanner findings and resilient responsive primitives', async () => {
    const file = 'app/routes/templates_.languages.tsx';
    const source = readFileSync(file, 'utf8');
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('min-h-11');
    expect(source).toContain('min-[360px]:grid-cols-2');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('useRevalidator');
    expect(source).toContain('localeResponseHeaders');
    expect(source).toContain("hrefLang: 'fr'");
    expect(source).not.toContain('error.message');
  });
});
