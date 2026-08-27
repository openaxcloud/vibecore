/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  searchFiles: vi.fn(),
  readFile: vi.fn(),
  workdir: '/workspace',
}));
const workbenchMocks = vi.hoisted(() => ({
  files: {
    '/workspace/src/App.tsx': {
      type: 'file',
      content: 'const greeting = "Hello";',
      isBinary: false,
    },
  } as Record<string, unknown>,
  setSelectedFile: vi.fn(),
  setCurrentDocumentScrollPosition: vi.fn(),
  saveAllFiles: vi.fn(),
  writeFileContent: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@nanostores/react', () => ({ useStore: () => new Set<string>() }));
vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  useRuntimeAdapter: () => runtimeMocks,
}));
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    unsavedFiles: { get: () => new Set<string>() },
    files: { get: () => workbenchMocks.files },
    setSelectedFile: workbenchMocks.setSelectedFile,
    setCurrentDocumentScrollPosition: workbenchMocks.setCurrentDocumentScrollPosition,
    saveAllFiles: workbenchMocks.saveAllFiles,
    writeFileContent: workbenchMocks.writeFileContent,
    isFileLocked: () => ({ locked: false }),
  },
}));
vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
    onConfirm,
  }: {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) =>
    isOpen ? (
      <section role="dialog" aria-label={title}>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </section>
    ) : null,
}));
vi.mock('react-toastify', () => ({ toast: toastMocks }));
vi.mock('~/utils/constants', () => ({ WORK_DIR: '/workspace' }));
vi.mock('~/utils/debounce', () => ({ debounce: <Args extends unknown[]>(fn: (...args: Args) => unknown) => fn }));

import { Search } from './Search';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderSearch(language: 'en' | 'fr' = 'fr') {
  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <Search />
    </I18nextProvider>,
  );
}

async function settleSearch() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  act(() => vi.advanceTimersByTime(350));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  runtimeMocks.searchFiles.mockReset();
  runtimeMocks.readFile.mockReset();
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
  workbenchMocks.setSelectedFile.mockReset();
  workbenchMocks.setCurrentDocumentScrollPosition.mockReset();
  workbenchMocks.saveAllFiles.mockReset();
  workbenchMocks.writeFileContent.mockReset();
});

describe('workbench Search i18n', () => {
  it('renders search and replace controls in French', () => {
    renderSearch();

    expect(screen.getByLabelText('Rechercher dans les fichiers')).toBeTruthy();
    expect(screen.getByLabelText('Remplacer par')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activer ou désactiver la recherche sensible à la casse' })).toBeTruthy();
    expect(screen.getByTitle('Respecter la casse')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Activer ou désactiver la recherche par expression régulière' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tout remplacer' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByPlaceholderText('Search files')).toBeNull();
  });

  it('localizes results and the replace confirmation while preserving file data', async () => {
    vi.useFakeTimers();
    runtimeMocks.searchFiles.mockResolvedValue([
      {
        path: 'src/App.tsx',
        lineNumber: 7,
        line: 'const greeting = "Hello";',
        startColumn: 6,
        endColumn: 14,
      },
    ]);
    renderSearch();

    fireEvent.change(screen.getByLabelText('Rechercher dans les fichiers'), {
      target: { value: 'greeting' },
    });
    await settleSearch();

    expect(screen.getByText('App.tsx')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Résultat dans src/App.tsx, ligne 7' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Remplacer par'), { target: { value: 'message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tout remplacer' }));

    expect(screen.getByRole('dialog', { name: 'Remplacer toutes les correspondances ?' })).toBeTruthy();
    expect(screen.getByText(/Remplacer 1 correspondance dans 1 fichier/u)).toBeTruthy();
  });

  it('never exposes a raw runtime search error in French', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    runtimeMocks.searchFiles.mockRejectedValue(new Error('Raw backend English runtime detail'));
    renderSearch();

    fireEvent.change(screen.getByLabelText('Rechercher dans les fichiers'), {
      target: { value: 'needle' },
    });
    await settleSearch();

    expect(screen.getByText(/La recherche a échoué/u)).toBeTruthy();
    expect(screen.queryByText(/Raw backend English runtime detail/u)).toBeNull();
  });
});
