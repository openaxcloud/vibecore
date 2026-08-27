/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./DatabaseRollbackPanel', () => ({ DatabaseRollbackPanel: () => null }));

import { DatabaseSettings } from './DatabaseSettings';
import { formatDatabaseSettingsBytes, getDatabaseStudioCopy } from '~/lib/i18n/catalogs/database-studio';
import { createI18nInstance } from '~/lib/i18n/runtime';

function withLocale(language: 'en' | 'fr', node: ReactNode) {
  return <I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>;
}

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DatabaseSettings i18n', () => {
  it('renders every control, storage value, and accessibility label in French', () => {
    render(
      withLocale(
        'fr',
        <DatabaseSettings
          name="Customer Production Database"
          active
          connectionString="postgres://customer:secret@db.example/customer"
          storageUsedBytes={512 * 1024 * 1024}
          storageQuotaBytes={2 * 1024 * 1024 * 1024}
          connectionDetails={[
            { label: 'DATABASE_URL', value: 'postgres://customer:secret@db.example/customer' },
            { label: 'REGION', value: 'eu-west-1' },
          ]}
          onRemove={vi.fn()}
        />,
      ),
    );

    expect(screen.getByText('Customer Production Database')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Chaîne de connexion')).toBeTruthy();
    expect(screen.getByText('DATABASE_URL')).toBeTruthy();
    expect(screen.queryByText('Connection string')).toBeNull();

    const reveal = screen.getByRole('button', { name: 'Afficher la chaîne de connexion' });
    expect(reveal.getAttribute('title')).toBe('Afficher');
    fireEvent.click(reveal);
    expect(screen.getByText('postgres://customer:secret@db.example/customer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Masquer la chaîne de connexion' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copier la chaîne de connexion' })).toBeTruthy();

    expect(screen.getByText(/512[\s\u00a0]Mo sur 2,00[\s\u00a0]Go/u)).toBeTruthy();

    const progress = screen.getByRole('progressbar', { name: /Stockage utilisé\s*:\s*25\s*%/u });
    expect(progress.getAttribute('aria-valuenow')).toBe('25');

    const advanced = screen.getByRole('button', { name: 'Paramètres avancés' });
    expect(advanced.className).toContain('whitespace-normal');
    fireEvent.click(advanced);
    expect(screen.getByText('Détails de connexion — 2 URL')).toBeTruthy();
    expect(screen.getByText('REGION')).toBeTruthy();

    const remove = screen.getByRole('button', { name: 'Supprimer la base de données' });
    expect(remove.className).toContain('sm:w-fit');
    expect(remove.className).toContain('whitespace-normal');
  });

  it('formats bytes for each locale and retains English as the fallback', () => {
    expect(formatDatabaseSettingsBytes(1.5 * 1024 * 1024, 'fr')).toBe('1,50 Mo');
    expect(formatDatabaseSettingsBytes(1.5 * 1024 * 1024, 'en')).toBe('1.50MB');
    expect(formatDatabaseSettingsBytes(12 * 1024 * 1024 * 1024, 'en')).toBe('12.00GB');
    expect(formatDatabaseSettingsBytes(undefined, 'fr')).toBeNull();
    expect(getDatabaseStudioCopy('de-DE')['databaseSettings.storage']).toBe('Storage');
  });

  it('localizes the unavailable-storage state without inventing usage', () => {
    render(withLocale('fr', <DatabaseSettings name="Customer Database" />));

    expect(
      screen.getByText('L’utilisation du stockage apparaîtra dès que la base de données la transmettra.'),
    ).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
