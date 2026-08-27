/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DiffView } from './DiffView';
import {
  diffViewEn,
  diffViewFr,
  formatDiffViewCopy,
  formatDiffViewStatLabel,
  getDiffViewCopy,
} from '~/lib/i18n/catalogs/diff-view';
import type { FileHistory } from '~/types/actions';

const harness = vi.hoisted(() => ({
  language: 'en',
  filesStore: Symbol('files'),
  selectedFileStore: Symbol('selectedFile'),
  currentDocumentStore: Symbol('currentDocument'),
  unsavedFilesStore: Symbol('unsavedFiles'),
  themeStore: Symbol('theme'),
  state: {
    files: {} as Record<string, unknown>,
    selectedFile: undefined as string | undefined,
    currentDocument: undefined as { value: string; isBinary: boolean; filePath: string } | undefined,
    unsavedFiles: new Set<string>(),
    theme: 'dark',
  },
  setCurrentDocumentContent: vi.fn(),
  saveCurrentDocument: vi.fn(),
  getHighlighter: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: harness.language, resolvedLanguage: harness.language },
  }),
}));

vi.mock('@nanostores/react', () => ({
  useStore: (store: symbol) => {
    if (store === harness.filesStore) {
      return harness.state.files;
    }

    if (store === harness.selectedFileStore) {
      return harness.state.selectedFile;
    }

    if (store === harness.currentDocumentStore) {
      return harness.state.currentDocument;
    }

    if (store === harness.unsavedFilesStore) {
      return harness.state.unsavedFiles;
    }

    if (store === harness.themeStore) {
      return harness.state.theme;
    }

    throw new Error('Unexpected store in DiffView test');
  },
}));

vi.mock('~/lib/stores/theme', () => ({ themeStore: harness.themeStore }));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    files: harness.filesStore,
    selectedFile: harness.selectedFileStore,
    currentDocument: harness.currentDocumentStore,
    unsavedFiles: harness.unsavedFilesStore,
    setCurrentDocumentContent: harness.setCurrentDocumentContent,
    saveCurrentDocument: harness.saveCurrentDocument,
  },
}));

vi.mock('shiki', () => ({ getHighlighter: harness.getHighlighter }));

vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
    cancelLabel,
    isLoading,
    onConfirm,
    onClose,
  }: {
    isOpen: boolean;
    title: string;
    description: ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    isLoading: boolean;
    onConfirm: () => void;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <div>{description}</div>
        <button type="button" disabled={isLoading} onClick={onClose}>
          {cancelLabel}
        </button>
        <button type="button" disabled={isLoading} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

const FILE_PATH = '/workspace/src/customer-profile-with-a-very-long-name.ts';
const ORIGINAL_CONTENT = 'const customer = "before";\n';
const CURRENT_CONTENT = 'const customer = "<img src=x onerror=alert(1)>";\n';
const LAST_MODIFIED = Date.UTC(2026, 5, 16, 12, 34);

const highlightedCode = {
  codeToHtml: vi.fn((value: string) => {
    const escaped = value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

    return `<pre><code>${escaped}</code></pre>`;
  }),
};

function setSelectedFile({
  current = CURRENT_CONTENT,
  original = ORIGINAL_CONTENT,
}: { current?: string; original?: string } = {}) {
  harness.state.files = {
    [FILE_PATH]: {
      type: 'file',
      content: original,
      isBinary: false,
    },
  };
  harness.state.selectedFile = FILE_PATH;
  harness.state.currentDocument = {
    value: current,
    isBinary: false,
    filePath: FILE_PATH,
  };
}

function historyFor(current = CURRENT_CONTENT, original = ORIGINAL_CONTENT): Record<string, FileHistory> {
  return {
    [FILE_PATH]: {
      originalContent: original,
      lastModified: LAST_MODIFIED,
      changes: [],
      versions: [{ timestamp: LAST_MODIFIED, content: current }],
      changeSource: 'auto-save' as const,
    },
  };
}

function renderDiff(fileHistory: Record<string, FileHistory> = historyFor()) {
  const setFileHistory = vi.fn();
  const view = render(<DiffView fileHistory={fileHistory} setFileHistory={setFileHistory} />);

  return { ...view, setFileHistory };
}

describe('DiffView i18n and recovery states', () => {
  beforeEach(() => {
    harness.language = 'fr';
    harness.state.files = {};
    harness.state.selectedFile = undefined;
    harness.state.currentDocument = undefined;
    harness.state.unsavedFiles = new Set<string>();
    harness.state.theme = 'dark';
    harness.setCurrentDocumentContent.mockReset();
    harness.saveCurrentDocument.mockReset();
    harness.getHighlighter.mockReset();
    highlightedCode.codeToHtml.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps flat EN/FR parity, English fallback, interpolation, and plural rules', () => {
    expect(Object.keys(diffViewFr).sort()).toEqual(Object.keys(diffViewEn).sort());
    expect(getDiffViewCopy('fr-CA')['diffView.empty.title']).toBe('Sélectionnez un fichier');
    expect(getDiffViewCopy('de-DE')['diffView.empty.title']).toBe('Select a file');
    expect(
      formatDiffViewCopy(diffViewFr['diffView.revert.description'], {
        fileName: FILE_PATH,
      }),
    ).toContain(FILE_PATH);
    expect(formatDiffViewStatLabel('additions', 1, 'fr')).toBe('1 ajout');
    expect(formatDiffViewStatLabel('additions', 2, 'fr')).toBe('2 ajouts');
    expect(formatDiffViewStatLabel('deletions', 1, 'en')).toBe('1 deletion');
    expect(formatDiffViewStatLabel('deletions', 2, 'en')).toBe('2 deletions');
  });

  it('renders a clear localized empty state without initializing the highlighter', () => {
    renderDiff({});

    expect(screen.getByTestId('diff-view-empty')).toBeTruthy();
    expect(screen.getByText('Sélectionnez un fichier')).toBeTruthy();
    expect(screen.getByText('Choisissez un fichier dans l’explorateur pour comparer ses modifications.')).toBeTruthy();
    expect(harness.getHighlighter).not.toHaveBeenCalled();
  });

  it('times out safely, retries, preserves code and paths, and supports fullscreen in French', async () => {
    vi.useFakeTimers();
    setSelectedFile();
    harness.getHighlighter.mockReturnValueOnce(new Promise(() => undefined));
    harness.getHighlighter.mockResolvedValueOnce(highlightedCode);

    renderDiff();

    expect(screen.getByTestId('diff-view-loading')).toBeTruthy();
    expect(screen.getByText('Préparation de la comparaison…')).toBeTruthy();
    expect(screen.getByText('Chargement de la coloration syntaxique.')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    const safeError = screen.getByTestId('diff-view-highlighter-error');
    expect(safeError.textContent).toContain('Impossible de charger la comparaison');
    expect(safeError.textContent).toContain('Le contenu de votre fichier n’a pas été modifié.');
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull();

    await act(async () => {
      fireEvent.click(within(safeError).getByRole('button', { name: 'Réessayer' }));
      await Promise.resolve();
    });

    expect(screen.queryByTestId('diff-view-highlighter-error')).toBeNull();
    expect(screen.getByText('Modifié')).toBeTruthy();
    expect(screen.getByText(FILE_PATH)).toBeTruthy();
    expect(screen.getByLabelText('1 ajout')).toBeTruthy();
    expect(screen.getByLabelText('1 suppression')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Modified');

    fireEvent.click(screen.getByRole('button', { name: 'Passer en plein écran' }));
    expect(screen.getByRole('dialog', { name: `Comparaison de ${FILE_PATH} en plein écran` })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quitter le plein écran' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la comparaison en plein écran' }));
    expect(screen.queryByRole('dialog', { name: `Comparaison de ${FILE_PATH} en plein écran` })).toBeNull();
  });

  it('renders the identical state in light theme without changing file content', async () => {
    harness.state.theme = 'light';
    setSelectedFile({ current: ORIGINAL_CONTENT });

    renderDiff(historyFor(ORIGINAL_CONTENT));

    expect(await screen.findByText('Fichiers identiques')).toBeTruthy();
    expect(screen.getByText('Les deux versions correspondent exactement.')).toBeTruthy();
    expect(screen.getByText('Contenu actuel')).toBeTruthy();
    expect(document.body.textContent).toContain('const customer = "before";');
    expect(screen.getByText('Aucune modification')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rétablir le fichier' })).toBeNull();
    expect(highlightedCode.codeToHtml).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ theme: 'github-light' }),
    );
  });

  it('renders the localized binary-file warning', async () => {
    setSelectedFile({ current: `${ORIGINAL_CONTENT}\u0000` });

    renderDiff(historyFor(`${ORIGINAL_CONTENT}\u0000`));

    expect(await screen.findByText('Fichier binaire détecté')).toBeTruthy();
    expect(screen.getByText('La comparaison n’est pas disponible pour les fichiers binaires.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Binary file detected');
  });

  it('keeps the revert dialog open on failure, masks the raw error, and allows retry', async () => {
    setSelectedFile();

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    let rejectSave: ((reason: Error) => void) | undefined;
    harness.saveCurrentDocument.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectSave = reject;
      }),
    );
    harness.saveCurrentDocument.mockResolvedValueOnce(undefined);

    const { setFileHistory } = renderDiff();

    expect(await screen.findByText('Modifié')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rétablir le fichier' }));

    const dialog = screen.getByRole('dialog', { name: 'Rétablir le fichier ?' });
    expect(dialog.textContent).toContain('customer-profile-with-a-very-long-name.ts');
    expect(dialog.textContent).toContain('Vous ne pourrez pas l’annuler depuis cette vue.');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Rétablir le fichier' }));
    expect(within(dialog).getByRole('button', { name: 'Rétablissement…' }).hasAttribute('disabled')).toBe(true);

    await act(async () => {
      rejectSave?.(new Error('SECRET_DATABASE_PASSWORD=do-not-render'));
      await Promise.resolve();
    });

    expect(within(dialog).getByRole('alert').textContent).toBe(
      'Impossible de rétablir le fichier. Vérifiez votre connexion, puis réessayez.',
    );
    expect(document.body.textContent).not.toContain('SECRET_DATABASE_PASSWORD');
    expect(harness.setCurrentDocumentContent).toHaveBeenNthCalledWith(1, ORIGINAL_CONTENT);
    expect(harness.setCurrentDocumentContent).toHaveBeenNthCalledWith(2, CURRENT_CONTENT);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Rétablir le fichier' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Rétablir le fichier ?' })).toBeNull();
    });
    expect(setFileHistory).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
  });

  it('has zero scanner findings and explicit responsive, theme, and accessibility safeguards', async () => {
    const sourcePaths = ['app/components/workbench/DiffView.tsx', 'app/components/workbench/diff-modified-time.ts'];
    const { scanSource } = await import('../../../scripts/i18n/source-scanner.mjs');

    for (const sourcePath of sourcePaths) {
      const source = readFileSync(sourcePath, 'utf8');
      const result = scanSource(source, sourcePath);

      expect(result.parseErrors).toEqual([]);
      expect(result.findings).toEqual([]);
    }

    const source = readFileSync(sourcePaths[0], 'utf8');

    expect(source).toContain('min-w-0');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('bg-bolt-elements-background-depth-1');
    expect(source).toContain('bg-bolt-elements-background-depth-2');
    expect(source).toContain('text-bolt-elements-textPrimary');
    expect(source).toContain('border-bolt-elements-borderColor');
    expect(source).toContain('dark:bg-green-500/20');
    expect(source).toContain('dark:bg-red-500/20');
    expect(source).toContain('min-h-11');
    expect(source).toContain('min-w-11');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('motion-reduce:transition-none');
    expect(source).toContain('motion-safe:animate-spin');
    expect(source).toContain('aria-live');
    expect(source).toContain('aria-busy');
    expect(source).toContain('aria-modal');
    expect(source).toContain('aria-hidden');
    expect(source).not.toContain('truncate');
    expect(source).not.toContain('line-clamp');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(source).not.toContain('style={{');
    expect(source).not.toContain('fetch(');
  });
});
