/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Heavy / network-y collaborators are stubbed so the test can focus on the
 * input-reset behaviour of the change handler. The validation logic itself
 * (shouldIncludeFile, MAX_FILES) uses the REAL implementation.
 */
vi.mock('~/utils/folderImport', () => ({
  createChatFromFolder: vi.fn(async () => []),
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
  },
}));

vi.mock('~/lib/stores/logs', () => ({
  logStore: {
    logError: vi.fn(),
    logWarning: vi.fn(),
    logSystem: vi.fn(),
  },
}));

const isBinaryFileMock = vi.fn(async () => false);
vi.mock('~/utils/fileUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/fileUtils')>();

  return {
    ...actual,
    isBinaryFile: (...args: unknown[]) => isBinaryFileMock(...args),
  };
});

import { ImportFolderButton } from './ImportFolderButton';

/**
 * Build a File that carries a webkitRelativePath, which is what the directory
 * `<input>` exposes for each selected file. jsdom's File doesn't set this, so
 * we define it explicitly.
 */
function makeFile(relativePath: string, contents = 'console.log(1)\n'): File {
  const name = relativePath.split('/').pop() || relativePath;
  const file = new File([contents], name, { type: 'text/plain' });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });

  return file;
}

/**
 * Set the input's `.files` to a real-ish FileList so the change handler reads
 * the selection exactly as it would in the browser.
 */
function setInputFiles(input: HTMLInputElement, files: File[]) {
  const fileList = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    ...files.reduce<Record<number, File>>((acc, f, i) => {
      acc[i] = f;

      return acc;
    }, {}),
    *[Symbol.iterator]() {
      yield* files;
    },
  } as unknown as FileList;

  Object.defineProperty(input, 'files', { value: fileList, configurable: true });
}

describe('<ImportFolderButton /> handleFileChange input reset', () => {
  beforeEach(() => {
    isBinaryFileMock.mockClear();
    isBinaryFileMock.mockImplementation(async () => false);
  });

  afterEach(() => {
    cleanup();
  });

  function renderInput() {
    const { container } = render(<ImportFolderButton />);
    const input = container.querySelector('#folder-import') as HTMLInputElement;
    expect(input).toBeTruthy();

    /*
     * jsdom doesn't derive `<input type="file">.value` from `.files`, so reading
     * `.value` alone can't distinguish "handler reset it" from "it was never set".
     * Track explicit assignments so each test can assert the handler actually
     * cleared the input (the regression: early returns that never reset it).
     */
    const valueAssignments: string[] = [];

    let backing = '';
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => backing,
      set: (v: string) => {
        backing = v;
        valueAssignments.push(v);
      },
    });

    return { input, valueAssignments };
  }

  it('clears the input value when the folder has no valid files (early return)', async () => {
    const { input, valueAssignments } = renderInput();

    // A folder containing only an excluded file -> filteredFiles.length === 0.
    setInputFiles(input, [makeFile('proj/node_modules/lodash/index.js')]);
    fireEvent.change(input);

    // Reset happens synchronously at the top of the handler, before the early return.
    await waitFor(() => {
      expect(valueAssignments).toContain('');
    });
    expect(input.value).toBe('');
  });

  it('clears the input value when there are too many files (early return)', async () => {
    const { input, valueAssignments } = renderInput();

    const tooMany = Array.from({ length: 1001 }, (_, i) => makeFile(`proj/src/file${i}.ts`));
    setInputFiles(input, tooMany);
    fireEvent.change(input);

    await waitFor(() => {
      expect(valueAssignments).toContain('');
    });
    expect(input.value).toBe('');
  });

  it('clears the input value when no text files are found (early return inside try)', async () => {
    const { input, valueAssignments } = renderInput();

    // Valid (included) files, but everything reports as binary -> textFiles.length === 0.
    isBinaryFileMock.mockImplementation(async () => true);
    setInputFiles(input, [makeFile('proj/src/app.ts')]);
    fireEvent.change(input);

    await waitFor(() => {
      expect(valueAssignments).toContain('');
    });
    expect(input.value).toBe('');
  });

  it('clears the input value on the happy path', async () => {
    const { input, valueAssignments } = renderInput();

    setInputFiles(input, [makeFile('proj/src/app.ts')]);
    fireEvent.change(input);

    await waitFor(() => {
      expect(valueAssignments).toContain('');
    });
    expect(input.value).toBe('');
  });
});
