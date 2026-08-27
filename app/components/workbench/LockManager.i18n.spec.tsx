/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  filesGet: vi.fn(),
  unlockFile: vi.fn(),
  unlockFolder: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    files: { get: mocks.filesGet },
    unlockFile: mocks.unlockFile,
    unlockFolder: mocks.unlockFolder,
  },
}));

vi.mock('~/components/ui/use-toast', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { LockManager } from './LockManager';
import { formatLockManagerPlural, getLockManagerCopy } from '~/lib/i18n/catalogs/lock-manager';
import { createI18nInstance } from '~/lib/i18n/runtime';

function withLocale(language: 'en' | 'fr', node: ReactNode) {
  return <I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>;
}

beforeEach(() => {
  mocks.filesGet.mockReturnValue({
    '/home/project/src/customer.ts': { type: 'file', isLocked: true },
    '/home/project/assets': { type: 'folder', isLocked: true },
    '/home/project/src/open.ts': { type: 'file', isLocked: false },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LockManager i18n', () => {
  it('renders filters, counts, selection, and unlock actions in French', async () => {
    const { container } = render(withLocale('fr', <LockManager />));

    const search = screen.getByRole('textbox', { name: 'Rechercher dans les éléments verrouillés' });
    expect(search.getAttribute('placeholder')).toBe('Rechercher…');
    expect(search.className).toContain('h-11');

    const filter = screen.getByRole('combobox', { name: 'Filtrer les éléments verrouillés par type' });
    expect(screen.getByRole('option', { name: 'Tous' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Fichiers' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Dossiers' })).toBeTruthy();

    expect(await screen.findByText('src/customer.ts')).toBeTruthy();
    expect(screen.getByText('assets')).toBeTruthy();
    expect(screen.queryByText('src/open.ts')).toBeNull();
    expect(screen.getByText('2 éléments • 0 sélectionné')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Déverrouiller src/customer.ts' }).className).toContain('min-h-11');

    fireEvent.click(screen.getByRole('checkbox', { name: 'src/customer.ts' }));

    const unlockSelected = screen.getByRole('button', { name: 'Tout déverrouiller' });
    expect(unlockSelected.getAttribute('title')).toBe('Déverrouiller tous les éléments sélectionnés');
    expect(unlockSelected.className).toContain('whitespace-normal');
    fireEvent.click(unlockSelected);

    expect(mocks.unlockFile).toHaveBeenCalledWith('/home/project/src/customer.ts');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('1 élément sélectionné déverrouillé.');
    expect(screen.queryByText('src/customer.ts')).toBeNull();
    expect(screen.getByText('1 élément • 0 sélectionné')).toBeTruthy();

    fireEvent.change(filter, { target: { value: 'folders' } });
    expect(screen.getByText('assets')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('min-w-0');
  });

  it('renders the French empty state without a disabled bulk action', async () => {
    mocks.filesGet.mockReturnValue({});
    render(withLocale('fr', <LockManager />));

    expect(await screen.findByText('Aucun élément verrouillé trouvé')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Sélectionner tous les éléments' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.queryByRole('button', { name: 'Tout déverrouiller' })).toBeNull();
  });

  it('keeps English fallback and locale-aware plurals', () => {
    const french = getLockManagerCopy('fr');

    expect(getLockManagerCopy('de-DE')['lockManager.unlockSelected']).toBe('Unlock all');
    expect(
      formatLockManagerPlural('fr', 2, {
        one: french['lockManager.count.items_one'],
        other: french['lockManager.count.items_other'],
      }),
    ).toBe('2 éléments');
  });
});
