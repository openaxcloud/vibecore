/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { toast } from 'react-toastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatDataSettingsOperationError,
  formatSearchDataSettingsDateTime,
  formatSearchDataSettingsNumber,
  formatSearchDataSettingsPercent,
  formatSearchDataSettingsPlural,
  getDataSettingsCopy,
  getSearchCopy,
  interpolateSearchDataSettingsCopy,
  searchDataSettingsEn,
  searchDataSettingsFr,
} from './search-data-settings';

import { DataTab } from '~/components/@settings/tabs/data/DataTab';
import { DataVisualization } from '~/components/@settings/tabs/data/DataVisualization';
import { SelectionDialog } from '~/components/ui/Dialog';
import { createI18nInstance } from '~/lib/i18n/runtime';
import SearchRoute, { loader as searchLoader } from '~/routes/search';

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('~/lib/persistence/db', () => ({
  openDatabase: vi.fn(async () => {
    throw new Error('QuotaExceededError: browser storage unavailable');
  }),
}));

vi.mock('~/lib/persistence/chats', () => ({
  getAllChats: vi.fn(async () => []),
}));

vi.mock('~/lib/hooks/useDataOperations', () => ({
  useDataOperations: () => ({
    isExporting: false,
    isImporting: false,
    isResetting: false,
    isDownloadingTemplate: false,
    handleExportSettings: vi.fn(),
    handleExportSelectedSettings: vi.fn(),
    handleExportAllChats: vi.fn(async () => undefined),
    handleExportSelectedChats: vi.fn(),
    handleImportSettings: vi.fn(async () => undefined),
    handleImportChats: vi.fn(async () => undefined),
    handleResetSettings: vi.fn(async () => undefined),
    handleResetChats: vi.fn(async () => undefined),
    handleDownloadTemplate: vi.fn(),
    handleImportAPIKeys: vi.fn(async () => undefined),
  }),
}));

vi.mock('~/lib/hooks/useIndexedDB', () => ({
  useIndexedDB: () => ({ db: undefined }),
}));

function flattenStrings(value: unknown, path = ''): Map<string, string> {
  const entries = new Map<string, string>();

  if (typeof value === 'string') {
    entries.set(path, value);
    return entries;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      for (const [key, text] of flattenStrings(item, `${path}.${index}`)) {
        entries.set(key, text);
      }
    });

    return entries;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      for (const [childKey, text] of flattenStrings(item, path ? `${path}.${key}` : key)) {
        entries.set(childKey, text);
      }
    }
  }

  return entries;
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

function frenchProvider(children: ReactNode): ReactNode {
  return <I18nextProvider i18n={createI18nInstance('fr')}>{children}</I18nextProvider>;
}

afterEach(() => {
  cleanup();
});

describe('search and data-settings EN/FR catalog', () => {
  it('keeps every catalog path and interpolation token in exact parity', () => {
    const english = flattenStrings(searchDataSettingsEn);
    const french = flattenStrings(searchDataSettingsFr);

    expect(english.size).toBe(303);
    expect([...french.keys()].sort()).toEqual([...english.keys()].sort());

    for (const [key, englishValue] of english) {
      expect(interpolationTokens(french.get(key) ?? ''), key).toEqual(interpolationTokens(englishValue));
    }
  });

  it('uses the reviewed French terminology in visible search copy', () => {
    const forbiddenFrenchSearchTerms =
      /\b(?:backends?|front-?ends?|full-stack|marketplace|responsives?|streamings?|stacks?|starters?|workflows?)\b/iu;
    const residuals = [...flattenStrings(searchDataSettingsFr)].filter(([, value]) =>
      forbiddenFrenchSearchTerms.test(value),
    );

    expect(residuals).toEqual([]);
  });

  it('falls back to English and resolves professional French copy', () => {
    expect(getSearchCopy('de-DE').ui.title).toBe('Search E-Code');
    expect(getDataSettingsCopy(undefined).settings.sectionTitle).toBe('Settings');
    expect(getSearchCopy('fr-CA').appPages.billing.title).toBe('Facturation');
    expect(getDataSettingsCopy('fr-FR').visualization.averageMessages).toBe('Moyenne de messages par conversation');
  });

  it('interpolates, pluralizes and formats French values', () => {
    const copy = getDataSettingsCopy('fr');

    expect(interpolateSearchDataSettingsCopy(copy.chats.fallbackLabel, { id: 'abc123' })).toBe('Conversation abc123');
    expect(
      formatSearchDataSettingsPlural('fr', 2, {
        one: copy.chats.messages_one,
        other: copy.chats.messages_other,
      }),
    ).toBe('2 messages');
    expect(formatSearchDataSettingsNumber(12_345.6, 'fr')).toBe('12 345,6');
    expect(formatSearchDataSettingsPercent(25, 'fr')).toBe('25 %');
    expect(formatSearchDataSettingsDateTime('2026-01-02T15:04:00.000Z', 'fr')).toContain('2026');
  });

  it('never exposes raw technical error details in French', () => {
    const rawError = new Error('QuotaExceededError: browser storage unavailable');

    const frenchMessage = formatDataSettingsOperationError(
      'fr',
      getDataSettingsCopy('fr').operations.errors.importChats,
      rawError,
    );
    const englishMessage = formatDataSettingsOperationError(
      'en',
      getDataSettingsCopy('en').operations.errors.importChats,
      rawError,
    );

    expect(frenchMessage).toBe('Impossible d’importer les conversations');
    expect(frenchMessage).not.toContain('QuotaExceededError');
    expect(englishMessage).toContain('QuotaExceededError');
  });

  it('emits French guard toasts from the real data-operations hook', async () => {
    const { useDataOperations } = await vi.importActual<typeof import('~/lib/hooks/useDataOperations')>(
      '~/lib/hooks/useDataOperations',
    );

    const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => 'toast-id');
    const { result } = renderHook(() => useDataOperations({ language: 'fr' }));

    await act(async () => {
      await result.current.handleExportAllChats();
    });

    expect(errorToast).toHaveBeenCalledWith(
      'Base de données indisponible',
      expect.objectContaining({ position: 'bottom-right' }),
    );
    errorToast.mockRestore();
  });

  it('renders localized French search results with stable group identifiers', () => {
    const request = new Request('http://test/search?q=facturation', {
      headers: { 'Accept-Language': 'fr-FR' },
    });

    const loaderData = searchLoader({ request, params: {}, context: {} });

    const router = createMemoryRouter([{ id: 'search', path: '/search', element: <SearchRoute /> }], {
      initialEntries: ['/search?q=facturation'],
      hydrationData: { loaderData: { search: loaderData } },
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const html = renderToStaticMarkup(frenchProvider(<RouterProvider router={router} />));

      expect(html).toContain('Rechercher sur E-Code');
      expect(html).toContain('Facturation');
      expect(html).toContain('data-testid="search-group-pages"');
      expect(html).toContain('data-testid="search-group-help"');
      expect(html).not.toContain('Search app pages');
      expect(html).not.toContain('Workspace home');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('renders the French visualization empty state', () => {
    const html = renderToStaticMarkup(frenchProvider(<DataVisualization chats={[]} />));

    expect(html).toContain('Aucune donnée disponible');
    expect(html).toContain('statistiques d’utilisation');
    expect(html).not.toContain('No Data Available');
  });

  it('renders the complete French selection-dialog chrome', () => {
    render(
      frenchProvider(
        <SelectionDialog
          title="Sélectionner les paramètres à exporter"
          items={[{ id: 'core', label: 'Paramètres principaux', description: 'Profil et préférences' }]}
          isOpen
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          confirmLabel="Exporter la sélection"
        />,
      ),
    );

    const body = document.body.textContent ?? '';

    expect(body).toContain('Sélectionnez les éléments à inclure');
    expect(body).toContain('Tout sélectionner');
    expect(body).toContain('Annuler');
    expect(body).not.toContain('Select the items');
    expect(body).not.toContain('Select All');
  });

  it('renders a generic French database failure without leaking the raw browser error', async () => {
    render(frenchProvider(<DataTab />));

    const alert = await waitFor(() => screen.getByRole('alert'));
    const text = alert.textContent ?? '';

    expect(text).toContain('Impossible d’ouvrir la base de données de l’historique');
    expect(text).not.toContain('QuotaExceededError');
    expect(text).not.toContain('browser storage unavailable');
  });
});
