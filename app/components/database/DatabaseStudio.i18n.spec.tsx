/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/ui/Popover', () => ({
  default: ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => (
    <div>
      {trigger}
      {children}
    </div>
  ),
}));

vi.mock('@radix-ui/react-popover', () => ({
  Close: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { QueryHistoryControl } from './QueryHistoryControl';
import {
  formatDatabaseStudioCopy,
  formatDatabaseStudioNumber,
  getDatabaseStudioCopy,
} from '~/lib/i18n/catalogs/database-studio';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderHistory(language: 'en' | 'fr', entries: string[] = []) {
  const onClear = vi.fn();
  const onPick = vi.fn();
  const onRemove = vi.fn();

  render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <QueryHistoryControl entries={entries} onClear={onClear} onPick={onPick} onRemove={onRemove} />
    </I18nextProvider>,
  );

  return { onClear, onPick, onRemove };
}

describe('Database Studio i18n', () => {
  afterEach(cleanup);

  it('falls back to English and formats French values without leaking raw keys', () => {
    expect(getDatabaseStudioCopy('de')['databaseStudio.run']).toBe('Run');
    expect(formatDatabaseStudioNumber(12_345.6, 'fr')).toBe('12 345,6');
    expect(
      formatDatabaseStudioCopy(getDatabaseStudioCopy('fr')['databaseStudio.destructive.connection'], {
        connection: 'DATABASE_URL',
      }),
    ).toBe('Connexion : DATABASE_URL');
  });

  it('renders the empty history state in French', () => {
    renderHistory('fr');

    expect(screen.getByRole('button', { name: 'Historique' })).toBeTruthy();
    expect(screen.getByText('Aucune requête pour le moment — les exécutions réussies apparaîtront ici.')).toBeTruthy();
    expect(screen.queryByText('No queries yet — successful runs will appear here.')).toBeNull();
  });

  it('localizes controls while preserving user SQL and callbacks', () => {
    const statement = 'SELECT display_name FROM users;';
    const { onClear, onPick, onRemove } = renderHistory('fr', [statement]);

    expect(screen.getByRole('button', { name: 'Historique (1)' })).toBeTruthy();
    expect(screen.getByText(statement)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: `Retirer de l’historique : ${statement}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Tout effacer' }));
    fireEvent.click(screen.getByRole('button', { name: statement }));

    expect(onRemove).toHaveBeenCalledWith(statement);
    expect(onClear).toHaveBeenCalledOnce();
    expect(onPick).toHaveBeenCalledWith(statement);
  });
});
