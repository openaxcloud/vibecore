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
import {
  formatLockManagerPlural,
  getLockManagerCopy,
  lockManagerEn,
  lockManagerFr,
} from '~/lib/i18n/catalogs/lock-manager';
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

/**
 * VERROUS-01 — deux contrôles voisins ne doivent pas porter le MÊME mot.
 *
 * Constaté en production le 2026-09-08 (WebKit, iPhone 13, 390 px, thèmes clair
 * et sombre) : le panneau Verrous affiche « Tous » DEUX FOIS, l'un sous l'autre.
 * Ce ne sont pas deux rendus de la même chaîne mais deux contrôles distincts —
 * l'option sélectionnée du filtre par type (`lockManager.filter.all`) et le
 * libellé de la case « tout sélectionner » (`lockManager.selectAll.label`) —
 * auxquels le catalogue donnait le même mot dans les deux langues.
 *
 * Sur un panneau vide la case est `disabled` et se réduit à un mince filet, ce
 * qui fait lire le second « Tous » comme un résidu orphelin.
 *
 * Même classe que BUG-I18N-008 (« Aucun dépôt distant connecté » affiché deux
 * fois dans le panneau Git, depuis deux catalogues au texte identique).
 */
describe('VERROUS-01 — le filtre et la case « tout sélectionner » ne se confondent pas', () => {
  it.each([
    ['en', lockManagerEn],
    ['fr', lockManagerFr],
  ])('%s : les deux libellés visibles diffèrent', (_langue, copy) => {
    /* Témoin : sans lui, une clé renommée rendrait `undefined !== undefined` et le test passerait à vide. */
    expect(copy['lockManager.filter.all'], 'libellé du filtre présent').toBeTruthy();
    expect(copy['lockManager.selectAll.label'], 'libellé de la case présent').toBeTruthy();

    expect(
      copy['lockManager.selectAll.label'],
      'la case « tout sélectionner » reprend le mot du filtre — les deux se lisent comme un doublon',
    ).not.toBe(copy['lockManager.filter.all']);
  });
});
