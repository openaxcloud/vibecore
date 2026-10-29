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

import { Search } from './Search';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderSearch(language: 'en' | 'fr' = 'fr') {
  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <Search />
    </I18nextProvider>,
  );
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

type Match = { path: string; lineNumber: number; line: string; startColumn: number; endColumn: number };

function deferred() {
  let resolve!: (value: Match[]) => void;
  let reject!: (reason: Error) => void;

  const promise = new Promise<Match[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });

  return { promise, resolve, reject };
}

function result(name: string): Match[] {
  return [{ path: `src/${name}.tsx`, lineNumber: 1, line: name, startColumn: 0, endColumn: name.length }];
}

async function typeQuery(value: string) {
  fireEvent.change(screen.getByLabelText('Rechercher dans les fichiers'), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

async function finish(task: ReturnType<typeof deferred>, matches: Match[]) {
  await act(async () => {
    task.resolve(matches);
    await vi.advanceTimersByTimeAsync(350);
  });
}

describe('Search request lifetime', () => {
  it('keeps the newest results when an older request finishes last', async () => {
    vi.useFakeTimers();

    const older = deferred();
    const newer = deferred();
    runtimeMocks.searchFiles.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    renderSearch();
    await typeQuery('older');
    await typeQuery('newer');
    await finish(newer, result('Newer'));
    await finish(older, result('Older'));
    expect(screen.getByText('Newer.tsx')).toBeTruthy();
    expect(screen.queryByText('Older.tsx')).toBeNull();
  });

  it('does not resurrect results after the query is cleared', async () => {
    vi.useFakeTimers();

    const task = deferred();
    runtimeMocks.searchFiles.mockReturnValue(task.promise);
    renderSearch();
    await typeQuery('old');
    await typeQuery('');
    await finish(task, result('Old'));
    expect(screen.queryByText('Old.tsx')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tout remplacer' }).hasAttribute('disabled')).toBe(true);
  });

  it('disables replacement immediately while a changed query is still debouncing', async () => {
    vi.useFakeTimers();

    const task = deferred();
    runtimeMocks.searchFiles.mockReturnValue(task.promise);
    renderSearch();
    await typeQuery('old');
    await finish(task, result('Old'));
    expect(screen.getByRole('button', { name: 'Tout remplacer' }).hasAttribute('disabled')).toBe(false);
    fireEvent.change(screen.getByLabelText('Rechercher dans les fichiers'), { target: { value: 'new' } });
    expect(screen.getByRole('button', { name: 'Tout remplacer' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByText('Old.tsx')).toBeNull();
  });

  it('ignores an old rejection but still shows the current search failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const old = deferred();
    const current = deferred();
    const failing = deferred();
    runtimeMocks.searchFiles
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise)
      .mockReturnValueOnce(failing.promise);
    renderSearch();
    await typeQuery('old');
    await typeQuery('current');
    await finish(current, result('Current'));
    await act(async () => {
      old.reject(new Error('old failure'));
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(screen.queryByText(/La recherche a échoué/u)).toBeNull();
    expect(screen.getByText('Current.tsx')).toBeTruthy();
    await typeQuery('failing');
    await act(async () => {
      failing.reject(new Error('current failure'));
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(screen.getByText(/La recherche a échoué/u)).toBeTruthy();
  });

  it('invalidates old results when search options change without changing the query', async () => {
    vi.useFakeTimers();

    const older = deferred();
    const newer = deferred();
    runtimeMocks.searchFiles.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    renderSearch();
    await typeQuery('value');
    fireEvent.click(screen.getByRole('button', { name: 'Activer ou désactiver la recherche sensible à la casse' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await finish(newer, result('CaseSensitive'));
    await finish(older, result('OldCase'));
    expect(runtimeMocks.searchFiles.mock.calls[1][1].caseSensitive).toBe(true);
    expect(screen.getByText('CaseSensitive.tsx')).toBeTruthy();
    expect(screen.queryByText('OldCase.tsx')).toBeNull();
  });

  it('never starts a queued search after the panel unmounts', async () => {
    vi.useFakeTimers();
    runtimeMocks.searchFiles.mockResolvedValue([]);

    const view = renderSearch();
    fireEvent.change(screen.getByLabelText('Rechercher dans les fichiers'), { target: { value: 'pending' } });
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(runtimeMocks.searchFiles).not.toHaveBeenCalled();
  });
});
