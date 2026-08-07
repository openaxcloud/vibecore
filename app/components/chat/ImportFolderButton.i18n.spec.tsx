/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Message } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportFolderButton } from './ImportFolderButton';
import {
  formatImportFolderButtonCopy,
  formatImportFolderButtonNumber,
  formatImportFolderButtonPlural,
  getImportFolderButtonCopy,
  getImportFolderButtonSafeError,
  importFolderButtonEn,
  importFolderButtonFr,
} from '~/lib/i18n/catalogs/import-folder-button';
import { MAX_FILES } from '~/utils/fileUtils';

const harness = vi.hoisted(() => ({
  language: 'fr',
  createChatFromFolder: vi.fn(),
  isBinaryFile: vi.fn(),
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(() => 'folder-import-toast'),
    dismiss: vi.fn(),
  },
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSystem: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: harness.language, resolvedLanguage: harness.language },
  }),
}));

vi.mock('react-toastify', () => ({ toast: harness.toast }));

vi.mock('~/lib/stores/logs', () => ({
  logStore: {
    logError: harness.logError,
    logWarning: harness.logWarning,
    logSystem: harness.logSystem,
  },
}));

vi.mock('~/utils/folderImport', () => ({
  createChatFromFolder: harness.createChatFromFolder,
}));

vi.mock('~/utils/fileUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/fileUtils')>();

  return {
    ...actual,
    isBinaryFile: (...args: unknown[]) => harness.isBinaryFile(...args),
  };
});

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

function makeFile(relativePath: string, contents = 'const customerName = "Ari";\n'): File {
  const name = relativePath.split('/').pop() || relativePath;
  const file = new File([contents], name, { type: 'text/plain' });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });

  return file;
}

function setInputFiles(input: HTMLInputElement, files: File[]) {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    ...files.reduce<Record<number, File>>((result, file, index) => {
      result[index] = file;

      return result;
    }, {}),
    *[Symbol.iterator]() {
      yield* files;
    },
  } as unknown as FileList;

  Object.defineProperty(input, 'files', { value: fileList, configurable: true });
}

function getFolderInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  expect(input).toBeInstanceOf(HTMLInputElement);

  return input as HTMLInputElement;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe('ImportFolderButton i18n surface', () => {
  beforeEach(() => {
    harness.language = 'fr';
    harness.createChatFromFolder.mockReset();
    harness.createChatFromFolder.mockResolvedValue([]);
    harness.isBinaryFile.mockReset();
    harness.isBinaryFile.mockResolvedValue(false);
    harness.toast.error.mockReset();
    harness.toast.info.mockReset();
    harness.toast.success.mockReset();
    harness.toast.loading.mockReset();
    harness.toast.loading.mockReturnValue('folder-import-toast');
    harness.toast.dismiss.mockReset();
    harness.logError.mockReset();
    harness.logWarning.mockReset();
    harness.logSystem.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps flat EN/FR parity, interpolation parity, English fallback, numbers and plurals', () => {
    expect(Object.keys(importFolderButtonFr)).toEqual(Object.keys(importFolderButtonEn));

    for (const key of Object.keys(importFolderButtonEn) as (keyof typeof importFolderButtonEn)[]) {
      expect(importFolderButtonEn[key].trim().length, key).toBeGreaterThan(0);
      expect(importFolderButtonFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(importFolderButtonFr[key]), key).toEqual(
        interpolationTokens(importFolderButtonEn[key]),
      );
    }

    expect(getImportFolderButtonCopy('fr-CA')['importFolderButton.trigger']).toBe('Importer un dossier');
    expect(getImportFolderButtonCopy('de-DE')['importFolderButton.trigger']).toBe('Import folder');
    expect(
      formatImportFolderButtonCopy(importFolderButtonFr['importFolderButton.loadingNamed'], {
        folderName: 'Workspace Alpha',
      }),
    ).toBe('Importation de Workspace Alpha…');
    expect(formatImportFolderButtonNumber(12_345, 'fr')).toMatch(/^12[\s\u202f]345$/u);
    expect(
      formatImportFolderButtonPlural('fr', 1, {
        one: importFolderButtonFr['importFolderButton.binarySkipped_one'],
        other: importFolderButtonFr['importFolderButton.binarySkipped_other'],
      }),
    ).toBe('1 fichier binaire a été ignoré.');
    expect(
      formatImportFolderButtonPlural('fr', 1_200, {
        one: importFolderButtonFr['importFolderButton.binarySkipped_one'],
        other: importFolderButtonFr['importFolderButton.binarySkipped_other'],
      }),
    ).toMatch(/^1[\s\u202f]200 fichiers binaires ont été ignorés\.$/u);
    expect(getImportFolderButtonSafeError('fr', new Error('SECRET_API_TOKEN=never-render'))).toBe(
      'Impossible d’importer le dossier. Vérifiez l’accès à ses fichiers, puis réessayez.',
    );
  });

  it('switches visible and accessible copy from French to English without remounting', () => {
    const importChat = vi.fn(async () => undefined);
    const view = render(<ImportFolderButton importChat={importChat} />);

    const frenchButton = screen.getByRole('button', { name: 'Importer un dossier' });
    const input = getFolderInput(view.container);
    expect(frenchButton.getAttribute('title')).toBe('Importer un dossier');
    expect(input.getAttribute('aria-label')).toBe('Choisir un dossier à importer');
    expect(frenchButton.getAttribute('aria-controls')).toBe(input.id);

    harness.language = 'en';
    view.rerender(<ImportFolderButton importChat={importChat} />);

    expect(screen.getByRole('button', { name: 'Import folder' }).getAttribute('title')).toBe('Import folder');
    expect(input.getAttribute('aria-label')).toBe('Choose a folder to import');
  });

  it('exposes an explicit async state and recovers after completion', async () => {
    const pendingImport = deferred<void>();
    const importChat = vi.fn(() => pendingImport.promise);
    const { container } = render(<ImportFolderButton importChat={importChat} />);
    const input = getFolderInput(container);
    setInputFiles(input, [makeFile('Dossier Client/src/app.ts')]);

    fireEvent.change(input);

    const loadingButton = await screen.findByRole('button', { name: 'Importation du dossier…' });
    expect(loadingButton.hasAttribute('disabled')).toBe(true);
    expect(loadingButton.getAttribute('aria-busy')).toBe('true');
    expect(harness.toast.loading).toHaveBeenCalledWith('Importation de Dossier Client…');

    await act(async () => {
      pendingImport.resolve(undefined);
      await pendingImport.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Importer un dossier' }).hasAttribute('disabled')).toBe(false);
    });
    expect(harness.toast.dismiss).toHaveBeenCalledWith('folder-import-toast');
  });

  it('preserves folder names, file objects, paths and generated user content exactly', async () => {
    const source = makeFile('Dossier Client English/src/customer profile.ts', 'User supplied English content');
    const image = makeFile('Dossier Client English/public/avatar.png', 'binary bytes');

    const generatedMessages = [
      { id: 'system-1', role: 'system', content: 'Generated system context' },
      { id: 'user-1', role: 'user', content: 'User supplied English content' },
    ] as Message[];
    harness.isBinaryFile.mockImplementation(async (file: File) => file === image);
    harness.createChatFromFolder.mockResolvedValue(generatedMessages);

    const importChat = vi.fn(async () => undefined);
    const { container } = render(<ImportFolderButton importChat={importChat} />);
    setInputFiles(getFolderInput(container), [source, image]);

    fireEvent.change(getFolderInput(container));

    await waitFor(() => {
      expect(importChat).toHaveBeenCalledOnce();
    });
    expect(harness.createChatFromFolder).toHaveBeenCalledWith(
      [source],
      ['public/avatar.png'],
      'Dossier Client English',
      'fr',
    );
    expect(importChat).toHaveBeenCalledWith('Dossier Client English', generatedMessages);
    expect(harness.toast.info).toHaveBeenCalledWith('1 fichier binaire a été ignoré.');
    expect(harness.toast.success).toHaveBeenCalledWith('Le dossier Dossier Client English a bien été importé.');
  });

  it('uses natural generic progress and success copy when the browser omits the folder path', async () => {
    const looseFile = new File(['User content'], 'loose-file.ts', { type: 'text/plain' });
    const importChat = vi.fn(async () => undefined);
    const { container } = render(<ImportFolderButton importChat={importChat} />);
    setInputFiles(getFolderInput(container), [looseFile]);

    fireEvent.change(getFolderInput(container));

    await waitFor(() => {
      expect(importChat).toHaveBeenCalledOnce();
    });
    expect(harness.toast.loading).toHaveBeenCalledWith('Importation du dossier…');
    expect(harness.toast.success).toHaveBeenCalledWith('Le dossier a bien été importé.');
    expect(importChat).toHaveBeenCalledWith('dossier sélectionné', []);
    expect(JSON.stringify(harness.toast.loading.mock.calls)).not.toContain('dossier sélectionné…');
    expect(JSON.stringify(harness.toast.success.mock.calls)).not.toContain('dossier dossier');
  });

  it('masks raw handler errors in French and restores the control for retry', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const importChat = vi.fn().mockRejectedValueOnce(new Error('HTTP 500 SECRET_API_TOKEN=private'));
    const { container } = render(<ImportFolderButton importChat={importChat} />);
    setInputFiles(getFolderInput(container), [makeFile('Projet/src/app.ts')]);

    fireEvent.change(getFolderInput(container));

    await waitFor(() => {
      expect(harness.toast.error).toHaveBeenCalledWith(
        'Impossible d’importer le dossier. Vérifiez l’accès à ses fichiers, puis réessayez.',
      );
    });
    expect(harness.toast.error).not.toHaveBeenCalledWith(expect.stringContaining('SECRET_API_TOKEN'));
    expect(document.body.textContent).not.toContain('SECRET_API_TOKEN');
    expect(harness.logError).toHaveBeenCalledWith(
      'Impossible d’importer le dossier. Vérifiez l’accès à ses fichiers, puis réessayez.',
      undefined,
      { folderName: 'Projet' },
    );
    expect(JSON.stringify(harness.logError.mock.calls)).not.toContain('SECRET_API_TOKEN');
    expect(screen.getByRole('button', { name: 'Importer un dossier' }).hasAttribute('disabled')).toBe(false);
    expect(harness.toast.dismiss).toHaveBeenCalledWith('folder-import-toast');
    expect(consoleError).toHaveBeenCalled();
  });

  it('localizes validation failures and never starts an invalid import', async () => {
    const importChat = vi.fn(async () => undefined);
    const { container } = render(<ImportFolderButton importChat={importChat} />);
    const input = getFolderInput(container);

    setInputFiles(input, [makeFile('Projet/node_modules/lodash/index.js')]);
    fireEvent.change(input);
    expect(harness.toast.error).toHaveBeenLastCalledWith(
      'Aucun fichier importable n’a été trouvé dans le dossier sélectionné.',
    );

    harness.isBinaryFile.mockResolvedValue(true);
    setInputFiles(input, [makeFile('Projet/src/archive.dat')]);
    fireEvent.change(input);
    await waitFor(() => {
      expect(harness.toast.error).toHaveBeenLastCalledWith(
        'Le dossier sélectionné ne contient aucun fichier texte importable.',
      );
    });

    harness.isBinaryFile.mockResolvedValue(false);

    const tooManyFiles = Array.from({ length: MAX_FILES + 1 }, (_, index) => makeFile(`Projet/src/file-${index}.ts`));
    setInputFiles(input, tooManyFiles);
    fireEvent.change(input);
    expect(harness.toast.error).toHaveBeenLastCalledWith(
      expect.stringMatching(/Ce dossier contient 1[\s\u202f]001 fichiers.*moins de 1[\s\u202f]000 fichiers\./u),
    );
    expect(importChat).not.toHaveBeenCalled();
  });

  it('keeps the unavailable control focusable with an accessible localized explanation', () => {
    const { container } = render(<ImportFolderButton />);
    const button = screen.getByRole('button', { name: 'Importer un dossier' });
    const input = getFolderInput(container);

    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(input.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('title')).toBe('L’importation de dossiers est momentanément indisponible.');
    expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'L’importation de dossiers est momentanément indisponible.',
    );
    fireEvent.click(button);
    expect(harness.toast.error).toHaveBeenCalledWith('L’importation de dossiers est momentanément indisponible.');
  });

  it('opens its own uniquely identified folder input', () => {
    const importChat = vi.fn(async () => undefined);
    const first = render(<ImportFolderButton importChat={importChat} />);
    const second = render(<ImportFolderButton importChat={importChat} />);
    const firstInput = getFolderInput(first.container);
    const secondInput = getFolderInput(second.container);
    const firstClick = vi.spyOn(firstInput, 'click').mockImplementation(() => undefined);
    const secondClick = vi.spyOn(secondInput, 'click').mockImplementation(() => undefined);

    expect(firstInput.id).not.toBe(secondInput.id);
    fireEvent.click(within(first.container).getByRole('button', { name: 'Importer un dossier' }));
    expect(firstClick).toHaveBeenCalledOnce();
    expect(secondClick).not.toHaveBeenCalled();
  });

  it('has zero scanner findings and explicit responsive, theme and accessibility safeguards', async () => {
    const sourcePath = 'app/components/chat/ImportFolderButton.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('min-h-11');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('!whitespace-normal');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('border-bolt-elements-borderColor');
    expect(source).toContain('bg-bolt-elements-background-depth-1');
    expect(source).toContain('text-bolt-elements-textPrimary');
    expect(source).toContain('motion-reduce:transition-none');
    expect(source).toContain('motion-reduce:animate-none');
    expect(source).toContain('aria-live');
    expect(source).toContain('aria-busy');
    expect(source).toContain('aria-disabled');
    expect(source).not.toContain('document.getElementById');
    expect(source).not.toContain('error.message');
    expect(source).not.toMatch(/\bany\b/u);
    expect(source).not.toContain('truncate');
    expect(source).not.toContain('line-clamp');
  });
});
