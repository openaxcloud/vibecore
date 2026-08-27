/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fetcherState = vi.hoisted(() => ({
  call: 0,
  load: {
    state: 'idle',
    data: undefined as unknown,
    load: vi.fn(),
  },
  restore: {
    state: 'idle',
    data: undefined as unknown,
    submit: vi.fn(),
  },
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useFetcher: () => {
      const fetcher = fetcherState.call % 2 === 0 ? fetcherState.load : fetcherState.restore;
      fetcherState.call += 1;

      return fetcher;
    },
  };
});

vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
    cancelLabel,
  }: {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
  }) =>
    isOpen ? (
      <section aria-label={title}>
        <p>{description}</p>
        <button type="button">{confirmLabel}</button>
        <button type="button">{cancelLabel}</button>
      </section>
    ) : null,
}));

import { DatabaseRollbackPanel } from './DatabaseRollbackPanel';
import { formatDatabaseBytes, formatDatabaseRetention } from '~/lib/i18n/catalogs/database-rollback';
import { createI18nInstance } from '~/lib/i18n/runtime';

function enabledPanelData() {
  return {
    ok: true,
    enabled: true,
    entitlement: { allowed: true, retentionDays: 14 },
    instance: {
      id: 'database-1',
      status: 'RUNNING',
      engine: 'postgresql',
      sizeBytes: 1.5 * 1024 * 1024,
      retentionDays: 14,
      pitrEnabled: true,
    },
    snapshots: [
      {
        id: 'snapshot-1',
        kind: 'manual',
        label: 'Nightly production',
        sizeBytes: 1024,
        createdAt: '2026-08-04T12:00:00.000Z',
      },
    ],
    restores: [
      {
        id: 'restore-1',
        status: 'PENDING',
        createdAt: '2026-08-04T12:30:00.000Z',
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  fetcherState.call = 0;
  fetcherState.load.state = 'idle';
  fetcherState.load.data = undefined;
  fetcherState.restore.state = 'idle';
  fetcherState.restore.data = undefined;
  fetcherState.load.load.mockReset();
  fetcherState.restore.submit.mockReset();
});

describe('DatabaseRollbackPanel i18n', () => {
  it('switches database controls, statuses and formatted sizes live while preserving user labels', async () => {
    fetcherState.load.data = enabledPanelData();
    fetcherState.restore.data = { ok: false, error: 'Private database executor diagnostic.' };

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <DatabaseRollbackPanel projectId="project-1" />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Base de données' })).toBeTruthy();
    expect(screen.getByText(/jusqu’à 14 jours/u)).toBeTruthy();
    expect(document.body.textContent).toContain('En cours d’exécution · 1,5 Mio');
    expect(screen.getByRole('button', { name: 'Créer un instantané' })).toBeTruthy();
    expect(document.body.textContent).toContain('Nightly production · 1 Kio');
    expect(screen.getByText('En attente')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).not.toContain('Private database executor');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { name: 'Database' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create snapshot' })).toBeTruthy();
    expect(document.body.textContent).toContain('Running · 1.5 MiB');
    expect(document.body.textContent).toContain('Nightly production · 1 KiB');
  });

  it('renders an explicit localized skeleton while the entitlement loads', () => {
    fetcherState.load.state = 'loading';

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <DatabaseRollbackPanel projectId="project-1" />
      </I18nextProvider>,
    );

    expect(
      screen.getByRole('status', { name: 'Chargement des contrôles de restauration de la base de données' }),
    ).toBeTruthy();
  });

  it('opens a localized destructive confirmation for a selected restore time', () => {
    fetcherState.load.data = enabledPanelData();

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <DatabaseRollbackPanel projectId="project-1" />
      </I18nextProvider>,
    );

    fireEvent.change(screen.getByLabelText('Restaurer à un instant précis'), {
      target: { value: '2026-08-04T10:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }));

    expect(screen.getByRole('region', { name: 'Restaurer la base de données ?' })).toBeTruthy();
    expect(screen.getByText(/cette opération est irréversible/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  it('formats retention plurals and binary sizes with French Intl rules', () => {
    expect(formatDatabaseRetention(1, 'fr')).toContain('1 jour');
    expect(formatDatabaseRetention(2, 'fr')).toContain('2 jours');
    expect(formatDatabaseBytes(1.5 * 1024 * 1024, 'fr')).toBe('1,5 Mio');
    expect(formatDatabaseBytes(0, 'fr')).toBe('0 o');
  });
});
