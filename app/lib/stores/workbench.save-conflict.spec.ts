/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fileSaveConflictStore } from './file-save-conflict';

const { runtimeAdapterMock, disk } = vi.hoisted(() => {
  const disk = new Map<string, string>();

  return {
    disk,
    runtimeAdapterMock: {
      workdir: '/home/project',

      // The conflict guard only runs in remote-kubernetes mode.
      mode: 'remote-kubernetes' as const,
      hasWorkspaceId: () => true,
      listFiles: vi.fn(async () => []),
      readFile: vi.fn(async (path: string) => ({ content: disk.get(path) ?? '', encoding: 'utf8' as const })),
      writeFile: vi.fn(async (path: string, content: string) => {
        disk.set(path, content);
      }),
      createFile: vi.fn(async (path: string, content: string) => {
        disk.set(path, content);
      }),
      createDirectory: vi.fn(async () => undefined),
      deleteFile: vi.fn(async (path: string) => {
        disk.delete(path);
      }),
      listProcesses: vi.fn(async () => []),
      killProcess: vi.fn(async () => undefined),
      runCommand: vi.fn(async () => ({ exitCode: 0, output: '' })),
      streamCommand: vi.fn(async function* () {
        yield { type: 'exit' as const, exitCode: 0 };
      }),
      watchFiles: vi.fn(async () => () => {}),
      watchPorts: vi.fn(async () => () => {}),
    },
  };
});

vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  runtimeAdapter: runtimeAdapterMock,
  getRuntimeAdapter: () => runtimeAdapterMock,
}));

vi.mock('./previews', async () => {
  const { atom } = await import('nanostores');

  return {
    PreviewsStore: class {
      previews = atom([]);
      setRuntime = vi.fn();
      refreshPorts = vi.fn(async () => undefined);
    },
  };
});

vi.mock('./fileHistory', () => ({
  fileHistoryStore: { capture: vi.fn(async () => undefined) },
}));

const PATH = '/home/project/README.md';
const KEY = 'README.md';

/**
 * Build a workbench whose runtime "disk" already holds `baseline`, then seed the
 * file map + open document exactly as loading a file in the editor does — so the
 * save path has a real baseline to race against.
 */
async function makeStore(baseline: string) {
  const workbenchModule = await import('./workbench');
  const store = new workbenchModule.WorkbenchStore();

  disk.clear();
  disk.set(KEY, baseline);

  store.files.setKey(PATH, { type: 'file', content: baseline, isBinary: false });
  store.setDocuments(store.files.get());
  store.setSelectedFile(PATH);

  return store;
}

describe('WorkbenchStore.saveFileWithConflictPrompt', () => {
  beforeEach(() => {
    fileSaveConflictStore.set(null);
    disk.clear();
    vi.clearAllMocks();
  });

  it('opens the conflict dialog instead of rejecting, and leaves the edit unsaved', async () => {
    const store = await makeStore('# baseline\n');

    store.setCurrentDocumentContent('# my unsaved edit\n');

    // Something rewrites the file on disk after the editor loaded it.
    disk.set(KEY, '# rewritten by the agent\n');

    await expect(store.saveFileWithConflictPrompt(PATH)).resolves.toBe('conflict');

    const conflict = fileSaveConflictStore.get();
    expect(conflict).toMatchObject({
      filePath: PATH,
      remoteContent: '# rewritten by the agent\n',
      localContent: '# my unsaved edit\n',
      baselineContent: '# baseline\n',
    });

    // Nothing was written, and the edit is still in the editor buffer.
    expect(disk.get(KEY)).toBe('# rewritten by the agent\n');
    expect(store.currentDocument.get()?.value).toBe('# my unsaved edit\n');
    expect(store.unsavedFiles.get().has(PATH)).toBe(true);
  });

  it('resolves silently when the remote landed on exactly the same text', async () => {
    const store = await makeStore('# baseline\n');

    store.setCurrentDocumentContent('# same text\n');

    // Remote raced us but produced byte-identical content — nothing to decide.
    disk.set(KEY, '# same text\n');

    await expect(store.saveFileWithConflictPrompt(PATH)).resolves.toBe('saved');
    expect(fileSaveConflictStore.get()).toBeNull();
    expect(store.unsavedFiles.get().has(PATH)).toBe(false);
  });

  it('"Keep my version" writes the buffer over the remote and clears the conflict', async () => {
    const store = await makeStore('# baseline\n');

    store.setCurrentDocumentContent('# mine wins\n');
    disk.set(KEY, '# remote\n');

    await store.saveFileWithConflictPrompt(PATH);
    expect(fileSaveConflictStore.get()).not.toBeNull();

    await store.resolveFileConflictWithLocal(PATH);

    expect(disk.get(KEY)).toBe('# mine wins\n');
    expect(fileSaveConflictStore.get()).toBeNull();
    expect(store.unsavedFiles.get().has(PATH)).toBe(false);
  });

  it('"Reload from disk" adopts the remote version without writing back', async () => {
    const store = await makeStore('# baseline\n');

    store.setCurrentDocumentContent('# discarded\n');
    disk.set(KEY, '# remote wins\n');

    await store.saveFileWithConflictPrompt(PATH);

    const writesBefore = runtimeAdapterMock.writeFile.mock.calls.length;
    await store.resolveFileConflictWithRemote(PATH, '# remote wins\n');

    expect(store.currentDocument.get()?.value).toBe('# remote wins\n');
    expect(store.unsavedFiles.get().has(PATH)).toBe(false);
    expect(fileSaveConflictStore.get()).toBeNull();

    // Disk already holds it — adopting must not round-trip a write.
    expect(runtimeAdapterMock.writeFile.mock.calls.length).toBe(writesBefore);
    expect(disk.get(KEY)).toBe('# remote wins\n');
  });

  it('still rejects on a non-conflict save failure so real errors are reported', async () => {
    const store = await makeStore('# baseline\n');

    store.setCurrentDocumentContent('# edit\n');

    runtimeAdapterMock.writeFile.mockRejectedValueOnce(new Error('runtime exploded'));

    await expect(store.saveFileWithConflictPrompt(PATH)).rejects.toThrow('runtime exploded');
    expect(fileSaveConflictStore.get()).toBeNull();
  });
});
