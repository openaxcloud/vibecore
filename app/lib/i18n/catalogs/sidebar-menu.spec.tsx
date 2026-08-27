import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatSidebarMenuDate,
  formatSidebarMenuPlural,
  formatSidebarMenuTime,
  getSidebarMenuCopy,
  interpolateSidebarMenuCopy,
  resolveSidebarMenuLanguage,
  sidebarMenuEn,
  sidebarMenuFr,
  sidebarMenuRuntimeCatalog,
} from './sidebar-menu';
import { HistoryItem } from '~/components/sidebar/HistoryItem';
import { binDates, dateCategory } from '~/components/sidebar/date-binning';
import { createI18nInstance } from '~/lib/i18n/runtime';
import type { ChatHistoryItem } from '~/lib/persistence';

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

function renderInFrench(node: ReactNode, path = '/chat/public-id') {
  const router = createMemoryRouter([{ path: '/chat/:id', element: node }], { initialEntries: [path] });
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

const chatItem: ChatHistoryItem = {
  id: 'internal-id',
  urlId: 'public-id',
  description: 'My API build',
  messages: [],
  timestamp: '2026-08-05T10:00:00.000Z',
};

describe('sidebar menu catalog and visible surface', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(sidebarMenuFr)).toEqual(leafPaths(sidebarMenuEn));
  });

  it('provides flat, parity-safe resources for the central i18next runtime', () => {
    expect(Object.keys(sidebarMenuRuntimeCatalog.fr)).toEqual(Object.keys(sidebarMenuRuntimeCatalog.en));
    expect(sidebarMenuRuntimeCatalog.en['sidebarMenu.history.startNewChat']).toBe('Start new chat');
    expect(sidebarMenuRuntimeCatalog.fr['sidebarMenu.history.startNewChat']).toBe('Nouvelle discussion');
    expect(Object.values(sidebarMenuRuntimeCatalog.en).every((value) => typeof value === 'string')).toBe(true);
    expect(Object.values(sidebarMenuRuntimeCatalog.fr).every((value) => typeof value === 'string')).toBe(true);
  });

  it('provides professional French for every platform-owned string', () => {
    for (const pair of stringPairs(sidebarMenuEn, sidebarMenuFr)) {
      expect(pair.french, pair.path).not.toBe(pair.english);
    }
  });

  it('falls back to English without displaying raw catalog keys', () => {
    expect(resolveSidebarMenuLanguage('de-DE')).toBe('en');
    expect(getSidebarMenuCopy('de-DE').sidebarMenu.history.startNewChat).toBe('Start new chat');
    expect(JSON.stringify(getSidebarMenuCopy('de-DE'))).not.toContain('sidebarMenu.history.');
  });

  it('handles interpolation, French plurals and localized numbers while preserving user content', () => {
    const copy = sidebarMenuFr.sidebarMenu;

    expect(interpolateSidebarMenuCopy(copy.aria.userAvatar, { name: 'My API build' })).toBe(
      'Photo de profil de My API build',
    );
    expect(formatSidebarMenuPlural('fr', 1, copy.history.selectedCount)).toBe('1 discussion sélectionnée');
    expect(formatSidebarMenuPlural('fr', 1_200, copy.history.selectedCount)).toMatch(
      /^1[\s\u202f]200 discussions sélectionnées$/u,
    );
    expect(formatSidebarMenuPlural('fr', 2, copy.dialogs.bulkLead)).toBe(
      'Vous êtes sur le point de supprimer 2 discussions :',
    );
  });

  it('formats the live clock and history bins with French locale rules', () => {
    const current = new Date('2026-08-05T12:00:00.000Z');

    expect(formatSidebarMenuDate(current, 'fr')).toContain('août 2026');
    expect(formatSidebarMenuTime(current, 'fr')).toMatch(/\d{2}:\d{2}/u);
    expect(dateCategory(current, 'fr')).toBe('Aujourd’hui');
    expect(dateCategory(new Date('2026-08-04T12:00:00.000Z'), 'fr')).toBe('Hier');
    expect(dateCategory(new Date('2026-07-15T12:00:00.000Z'), 'fr')).toBe('30 derniers jours');
    expect(dateCategory(new Date('2026-06-01T12:00:00.000Z'), 'fr')).toMatch(/juin/u);
    expect(dateCategory(new Date('2025-01-15T12:00:00.000Z'), 'fr')).toMatch(/janv.*2025/u);
    expect(dateCategory(new Date('invalid'), 'fr')).toBe('Date inconnue');
  });

  it('groups localized date bins without changing chat IDs or user-authored descriptions', () => {
    const yesterday = { ...chatItem, timestamp: '2026-08-04T10:00:00.000Z' };
    const bins = binDates([chatItem, yesterday], 'fr');

    expect(bins.map((bin) => bin.category)).toEqual(['Aujourd’hui', 'Hier']);
    expect(bins.flatMap((bin) => bin.items).map((item) => item.id)).toEqual(['internal-id', 'internal-id']);
    expect(bins.flatMap((bin) => bin.items).map((item) => item.description)).toEqual(['My API build', 'My API build']);
  });

  it('renders nested history actions in French and leaves the user chat name unchanged', () => {
    const markup = renderInFrench(
      <HistoryItem
        item={chatItem}
        exportChat={() => undefined}
        onDelete={() => undefined}
        onDuplicate={() => undefined}
      />,
    );

    expect(markup).toContain('My API build');
    expect(markup).toContain('title="Exporter"');
    expect(markup).toContain('title="Dupliquer"');
    expect(markup).toContain('title="Renommer"');
    expect(markup).toContain('title="Supprimer"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="/chat/public-id"');
    expect(markup).not.toContain('title="Export"');
    expect(markup).not.toContain('title="Duplicate"');
    expect(markup).not.toContain('title="Rename"');
    expect(markup).not.toContain('title="Delete"');
  });

  it('renders a localized selection label without translating user content', () => {
    const markup = renderInFrench(
      <HistoryItem
        item={chatItem}
        exportChat={() => undefined}
        selectionMode
        isSelected
        onToggleSelection={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Sélectionner My API build"');
    expect(markup).toContain('My API build');
  });

  it('keeps loading, recovery, responsive and theme-safe states explicit in the menu source', () => {
    const menuSource = readFileSync(new URL('../../../components/sidebar/Menu.client.tsx', import.meta.url), 'utf8');
    const historySource = readFileSync(new URL('../../../components/sidebar/HistoryItem.tsx', import.meta.url), 'utf8');

    expect(menuSource).toContain("type HistoryLoadState = 'idle' | 'loading' | 'ready' | 'error'");
    expect(menuSource).toContain("aria-busy={historyLoadState === 'loading'}");
    expect(menuSource).toContain('role="status"');
    expect(menuSource).toContain('role="alert"');
    expect(menuSource).toContain('copy.history.retry');
    expect(menuSource).toContain('animate-pulse');
    expect(menuSource).toContain('h-dvh max-h-dvh overflow-hidden');
    expect(menuSource).toContain("maxWidth: '90vw'");
    expect(menuSource).toContain('min-h-11');
    expect(menuSource).toContain('min-w-0');
    expect(menuSource).toContain('flex-wrap');
    expect(menuSource).toContain('lg:hidden');
    expect(menuSource).toContain('vc-focus-ring');
    expect(menuSource).toContain('bg-bolt-elements-background-depth-1');
    expect(menuSource).toContain('text-bolt-elements-textPrimary');
    expect(menuSource).toContain('var(--status-error-bg)');
    expect(historySource).toContain("coarsePointer ? 'h-11 w-11' : 'h-7 w-7'");
  });

  it('masks raw errors, preserves routes and leaves zero scanner findings in every rendered source', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const files = [
      '../../../components/sidebar/Menu.client.tsx',
      '../../../components/sidebar/HistoryItem.tsx',
      '../../../components/sidebar/date-binning.ts',
      '../../../lib/hooks/useEditChatDescription.ts',
    ];

    for (const relativePath of files) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      const result = scanSource(source, relativePath);

      expect(result.parseErrors, relativePath).toEqual([]);
      expect(result.findings, relativePath).toEqual([]);
      expect(source, relativePath).not.toContain('toast.error(error.message)');
      expect(source, relativePath).not.toContain("toast.error('Failed to update chat description: '");
    }

    const menuSource = readFileSync(new URL('../../../components/sidebar/Menu.client.tsx', import.meta.url), 'utf8');
    const historySource = readFileSync(new URL('../../../components/sidebar/HistoryItem.tsx', import.meta.url), 'utf8');

    expect(menuSource).toContain('href="/"');
    expect(menuSource).toContain('ACCOUNT_MENU_LINKS.helpDocs');
    expect(historySource).toContain('href={`/chat/${item.urlId}`}');
    expect(historySource).toContain('{currentDescription}');
  });
});
