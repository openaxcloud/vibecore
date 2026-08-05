/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileHistoryPanel } from './FileHistoryPanel';
import {
  fileHistoryEn,
  fileHistoryFr,
  formatFileHistoryTimestamp,
  getFileHistoryCopy,
} from '~/lib/i18n/catalogs/file-history';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { fileHistoryStore } from '~/lib/stores/fileHistory';

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: { restoreFileVersion: vi.fn(() => Promise.resolve(undefined)) },
}));

const filePath = '/home/project/customer-file.ts';

function withLocale(language: 'en' | 'fr', node: ReactNode) {
  return <I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>;
}

async function seed(projectId: string, contents: string[]) {
  fileHistoryStore.configure(projectId);

  for (const [index, content] of contents.entries()) {
    await fileHistoryStore.capture(filePath, content, index === 0 ? 'initial' : 'save');
  }
}

afterEach(() => {
  cleanup();
  fileHistoryStore.configure(undefined);
});

describe('FileHistoryPanel i18n', () => {
  it('renders navigation, metadata, and long actions in French while preserving file content', async () => {
    await seed('project-file-history-fr', ['const customer = 1;', 'const customer = 2;']);

    const onClose = vi.fn();

    const { container } = render(
      withLocale('fr', <FileHistoryPanel filePath={filePath} currentContent="const customer = 2;" onClose={onClose} />),
    );

    expect(await screen.findByRole('dialog', { name: 'Historique du fichier customer-file.ts' })).toBeTruthy();
    expect(screen.getByText('Historique — customer-file.ts')).toBeTruthy();
    expect(screen.getByText('Indépendant de Git · versions ajoutées chronologiquement')).toBeTruthy();
    expect(screen.getByText('Version 2 / 2')).toBeTruthy();
    expect(screen.getByText('Enregistrée')).toBeTruthy();
    expect(screen.getByText('Dernière version')).toBeTruthy();
    expect(screen.getByText('const customer = 2;')).toBeTruthy();

    expect(screen.getByRole('button', { name: 'Fermer l’historique du fichier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Version précédente' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Version suivante' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lire l’historique des versions' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Vitesse de lecture' })).toBeTruthy();

    const slider = screen.getByRole('slider', { name: 'Version du fichier' });
    expect(slider.getAttribute('aria-valuetext')).toBe('Version 2 sur 2');

    const compare = screen.getByRole('button', { name: 'Comparer à la dernière version' });
    const restore = screen.getByRole('button', { name: 'Restaurer cette version' });
    expect(compare.className).toContain('whitespace-normal');
    expect(restore.className).toContain('sm:ml-auto');
    expect(container.firstElementChild?.className).toContain('overflow-x-hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Version précédente' }));
    expect(await screen.findByText('Version 1 / 2')).toBeTruthy();
    fireEvent.click(compare);
    expect(await screen.findByTestId('file-history-diff')).toBeTruthy();
  });

  it('masks the technical store error behind localized recoverable copy', async () => {
    fileHistoryStore.configure(undefined);
    render(
      withLocale('fr', <FileHistoryPanel filePath={filePath} currentContent="customer content" onClose={vi.fn()} />),
    );

    expect(await screen.findByText('Impossible de charger l’historique du fichier.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();

    const rawError = fileHistoryStore.error.get();

    if (rawError) {
      expect(document.body.textContent).not.toContain(rawError);
    }
  });

  it('keeps catalog parity, English fallback, and locale-aware dates', () => {
    expect(Object.keys(fileHistoryFr).sort()).toEqual(Object.keys(fileHistoryEn).sort());
    expect(getFileHistoryCopy('de-DE')['fileHistory.retry']).toBe('Retry');
    expect(formatFileHistoryTimestamp(Date.UTC(2026, 7, 4, 12, 34), 'fr')).toMatch(/août/u);
    expect(formatFileHistoryTimestamp(Number.NaN, 'fr')).toBeNull();
  });
});
