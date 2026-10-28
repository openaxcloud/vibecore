/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesStore } from './files';
import { WorkbenchStore } from './workbench';

const { runtimeAdapterMock, runtimeFiles } = vi.hoisted(() => {
  const runtimeFiles = new Map<string, string>();

  const fileNodes = () =>
    [...runtimeFiles.entries()].map(([filePath, content]) => ({
      type: 'file' as const,
      name: filePath.split('/').pop() ?? filePath,
      path: filePath,
      content,
      encoding: 'utf8' as const,
    }));

  return {
    runtimeFiles,
    runtimeAdapterMock: {
      watchFiles: vi.fn(async () => () => undefined),
      watchPorts: vi.fn(async () => () => undefined),
      workdir: '/home/project',
      mode: 'webcontainer',
      listFiles: vi.fn(async () => fileNodes()),
      readFile: vi.fn(async (filePath: string) => ({
        content: runtimeFiles.get(filePath) ?? '',
        encoding: 'utf8' as const,
      })),
      writeFile: vi.fn(async (filePath: string, content: string) => {
        runtimeFiles.set(filePath, content);
      }),
      createFile: vi.fn(async (filePath: string, content: string) => {
        runtimeFiles.set(filePath, content);
      }),
      createDirectory: vi.fn(async () => undefined),
      listProcesses: vi.fn(async () => []),
      killProcess: vi.fn(async () => undefined),
      streamCommand: vi.fn(async function* () {
        yield { type: 'exit' as const, exitCode: 0 };
      }),
      runCommand: vi.fn(async () => ({ exitCode: 0, output: '' })),
      deleteFile: vi.fn(async (filePath: string) => {
        runtimeFiles.delete(filePath);
      }),
      startWorkspace: vi.fn(async () => ({
        id: 'ws-2',
        runtimeMode: 'remote-kubernetes' as const,
        status: 'running' as const,
        watchFiles: vi.fn(async () => () => undefined),
        watchPorts: vi.fn(async () => () => undefined),
        workdir: '/home/project',
        createdAt: '',
        updatedAt: '',
      })),
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

      setObservationEnabled = vi.fn();
      setRuntime = vi.fn();
      refreshPorts = vi.fn(async () => undefined);
    },
  };
});

vi.mock('./terminal', async () => {
  const { atom } = await import('nanostores');

  return {
    TerminalStore: class {
      showTerminal = atom(true);
      boltTerminal = {
        ready: vi.fn(async () => undefined),
        terminal: {},
        process: {},
        executeCommand: vi.fn(async () => ({ exitCode: 0, output: '' })),
      };

      setRuntime = vi.fn();

      toggleTerminal = vi.fn();
    },
  };
});

const path = '/home/project/audit.txt';

describe('runtime listing against a newer successful save', () => {
  beforeEach(() => {
    localStorage.clear();
    runtimeFiles.clear();
    vi.clearAllMocks();
    runtimeAdapterMock.writeFile.mockImplementation(async (filePath, content) => {
      runtimeFiles.set(filePath, content);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ proposals: [] }))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('preserves the draft when an optimistic save echo precedes a rejected write', async () => {
    const store = new WorkbenchStore();
    runtimeFiles.set('audit.txt', 'ORIGINAL');
    await store.loadRuntimeFiles();
    store.setCurrentDocumentContent('DRAFT');

    let rejectWrite!: (error: Error) => void;
    runtimeAdapterMock.writeFile.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectWrite = reject;
        }),
    );

    const saving = store.saveFile(path);
    const rejected = expect(saving).rejects.toThrow('WRITE_FAILED');
    await vi.waitFor(() => expect(rejectWrite).toBeDefined());

    // A repeated editor change during the optimistic filesystem echo is not a persisted receipt.
    store.setCurrentDocumentContent('DRAFT');
    expect.soft(store.unsavedFiles.get().has(path)).toBe(true);
    rejectWrite(new Error('WRITE_FAILED'));
    await rejected;
    store.setDocuments(store.files.get());
    store.setSelectedFile(path);
    await Promise.resolve();
    expect(store.currentDocument.get()?.value).toBe('DRAFT');
    expect(store.unsavedFiles.get().has(path)).toBe(true);
    store.setCurrentDocumentContent('ORIGINAL');
    expect(store.unsavedFiles.get().has(path)).toBe(false);
    store.setCurrentDocumentContent('RETRY');
    await store.saveFile(path);
    expect(store.unsavedFiles.get().has(path)).toBe(false);
    expect(runtimeFiles.get('audit.txt')).toBe('RETRY');
  });

  it('does not mark a newer edit clean when an older save finishes', async () => {
    const store = new WorkbenchStore();
    runtimeFiles.set('audit.txt', 'ORIGINAL');
    await store.loadRuntimeFiles();
    store.setCurrentDocumentContent('FIRST');

    let finishWrite!: () => void;
    runtimeAdapterMock.writeFile.mockImplementationOnce(async (filePath, content) => {
      await new Promise<void>((resolve) => {
        finishWrite = resolve;
      });
      runtimeFiles.set(filePath, content);
    });

    const saving = store.saveFile(path);
    await vi.waitFor(() => expect(finishWrite).toBeDefined());
    store.setCurrentDocumentContent('SECOND');
    finishWrite();
    await saving;
    expect.soft(store.unsavedFiles.get().has(path)).toBe(true);
    store.setDocuments(store.files.get());
    expect(store.currentDocument.get()?.value).toBe('SECOND');
  });

  it('keeps the draft protected while another queued save is outstanding', async () => {
    const store = new WorkbenchStore();
    runtimeFiles.set('audit.txt', 'ORIGINAL');
    await store.loadRuntimeFiles();

    const finish: Array<() => void> = [];
    runtimeAdapterMock.writeFile.mockImplementation(async (filePath, content) => {
      await new Promise<void>((resolve) => {
        finish.push(resolve);
      });
      runtimeFiles.set(filePath, content);
    });
    store.setCurrentDocumentContent('A');

    const savingA = store.saveFile(path);
    await vi.waitFor(() => expect(finish).toHaveLength(1));
    store.setCurrentDocumentContent('B');

    const savingB = store.saveFile(path);
    store.setCurrentDocumentContent('A');
    finish[0]();
    await savingA;
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    expect.soft(store.unsavedFiles.get().has(path)).toBe(true);
    store.setDocuments(store.files.get());
    expect.soft(store.currentDocument.get()?.value).toBe('A');
    finish[1]();
    await savingB;
    expect(store.unsavedFiles.get().has(path)).toBe(true);
    expect(store.currentDocument.get()?.value).toBe('A');
    runtimeAdapterMock.writeFile.mockImplementation(async (filePath, content) => {
      runtimeFiles.set(filePath, content);
    });
    await store.saveFile(path);
    expect(store.unsavedFiles.get().has(path)).toBe(false);
    expect(runtimeFiles.get('audit.txt')).toBe('A');
  });

  it('does not carry a pending receipt into another project at the same path', async () => {
    const store = new WorkbenchStore();
    store.configureProject('project-a');
    runtimeFiles.set('audit.txt', 'ORIGINAL');
    await store.loadRuntimeFiles();
    store.setCurrentDocumentContent('PROJECT-A-DRAFT');

    let finishWrite!: () => void;
    runtimeAdapterMock.writeFile.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finishWrite = resolve;
      });
    });

    const saving = store.saveFile(path);
    const settled = saving.catch(() => undefined);
    await vi.waitFor(() => expect(finishWrite).toBeDefined());
    store.configureProject('project-b');
    runtimeFiles.set('audit.txt', 'PROJECT-B');
    await store.loadRuntimeFiles();
    store.setSelectedFile(path);
    store.setCurrentDocumentContent('PROJECT-B');
    expect(store.unsavedFiles.get().has(path)).toBe(false);
    finishWrite();
    await settled;
    expect(store.currentDocument.get()?.value).toBe('PROJECT-B');
    expect(store.unsavedFiles.get().has(path)).toBe(false);
  });

  it('keeps the remote project write destination across adapter reattachment and separates projects', () => {
    const store = new WorkbenchStore();
    const setRuntime = vi.spyOn(FilesStore.prototype, 'setRuntime');
    const first = { ...runtimeAdapterMock, mode: 'remote-kubernetes' as const };
    const reattached = { ...first };

    store.configureRuntime(first as never, 'project-a');
    expect(setRuntime).toHaveBeenLastCalledWith(first, 'remote-project:project-a');
    store.configureRuntime(reattached as never, 'project-a');
    expect(setRuntime).toHaveBeenLastCalledWith(reattached, 'remote-project:project-a');

    // Even if an injected adapter is reused, a changed project must rebind.
    store.configureRuntime(reattached as never, 'project-b');
    expect(setRuntime).toHaveBeenLastCalledWith(reattached, 'remote-project:project-b');
    store.configureRuntime(first as never, 'project-a');
    expect(setRuntime).toHaveBeenLastCalledWith(first, 'remote-project:project-a');
    expect(setRuntime).toHaveBeenCalledTimes(4);
  });

  it('preserves destination identity through provider runtime and project handoffs', () => {
    const store = new WorkbenchStore();
    const setRuntime = vi.spyOn(FilesStore.prototype, 'setRuntime');
    const remote = { ...runtimeAdapterMock, mode: 'remote-kubernetes' as const };

    for (const projectId of ['project-a', 'project-b', 'project-a']) {
      const adapter = { ...remote };
      store.configureRuntime(adapter as never, projectId);
      store.configureProject(projectId);
      expect.soft(setRuntime).toHaveBeenLastCalledWith(adapter, `remote-project:${projectId}`);
    }

    // A project-only reset must also retain the logical destination.
    store.configureProject('project-c');
    expect(setRuntime).toHaveBeenLastCalledWith(expect.anything(), 'remote-project:project-c');
  });

  it('keeps shared local and unknown destinations conservative', () => {
    const store = new WorkbenchStore();
    const setRuntime = vi.spyOn(FilesStore.prototype, 'setRuntime');
    const local = { ...runtimeAdapterMock };

    store.configureRuntime(local as never, 'project-a');
    expect(setRuntime).toHaveBeenLastCalledWith(local, undefined);
    store.configureRuntime({ ...local } as never, 'project-b');
    expect(setRuntime).toHaveBeenLastCalledWith(expect.anything(), undefined);
    store.configureRuntime({ ...local, mode: 'remote-kubernetes' } as never);
    expect(setRuntime).toHaveBeenLastCalledWith(expect.anything(), undefined);
  });

  it.each(['UNSAVED-A-UNIQUE', ''])('keeps a successful save %j over an older in-flight listing', async (saved) => {
    const store = new WorkbenchStore();
    runtimeFiles.set('audit.txt', 'PERSISTENCE-ORIGINAL');
    await store.loadRuntimeFiles();
    store.setSelectedFile(path);
    expect(store.currentDocument.get()?.value).toBe('PERSISTENCE-ORIGINAL');

    let release!: () => void;

    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const snapshot = await runtimeAdapterMock.listFiles();
    runtimeAdapterMock.listFiles.mockImplementationOnce(async () => {
      await held;
      return snapshot;
    });

    const filesBeforeListing = store.files.get();
    const entryBeforeListing = filesBeforeListing[path];
    const refreshing = store.loadRuntimeFiles();
    store.setCurrentDocumentContent(saved);
    expect(store.unsavedFiles.get().has(path)).toBe(true);
    await store.saveCurrentDocument();
    expect(runtimeFiles.get('audit.txt')).toBe(saved);

    // Real nanostores writes replace both map and entry; the held snapshot stays intact.
    expect(store.files.get()).not.toBe(filesBeforeListing);
    expect(store.files.get()[path]).not.toBe(entryBeforeListing);
    expect(filesBeforeListing[path]).toBe(entryBeforeListing);
    expect(entryBeforeListing).toMatchObject({ content: 'PERSISTENCE-ORIGINAL' });
    expect(store.unsavedFiles.get().has(path)).toBe(false);
    release();
    await refreshing;
    expect.soft(store.files.get()[path]).toMatchObject({ content: saved });
    expect.soft(store.currentDocument.get()?.value).toBe(saved);
    expect(store.filesCount).toBe(1);
    runtimeFiles.set('audit.txt', 'LATER-EXTERNAL-UPDATE');
    await store.loadRuntimeFiles();
    expect(store.currentDocument.get()?.value).toBe('LATER-EXTERNAL-UPDATE');
  });

  it('keeps a concurrent creation absent from the listing and maintains file count', async () => {
    const store = new WorkbenchStore();
    runtimeFiles.set('audit.txt', 'ORIGINAL');
    await store.loadRuntimeFiles();

    let release!: () => void;

    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const snapshot = await runtimeAdapterMock.listFiles();
    runtimeAdapterMock.listFiles.mockImplementationOnce(async () => {
      await held;
      return snapshot;
    });

    const refreshing = store.loadRuntimeFiles();
    await store.createFile('/home/project/new.txt', 'CREATED');
    release();
    await refreshing;
    expect(store.files.get()['/home/project/new.txt']).toMatchObject({ content: 'CREATED' });
    expect(store.filesCount).toBe(2);
  });

  it.each([false, true])('does not resurrect a concurrent deletion (folder: %s)', async (folder) => {
    const store = new WorkbenchStore();
    const deletedPath = folder ? '/home/project/nested/audit.txt' : path;
    runtimeFiles.set(folder ? 'nested/audit.txt' : 'audit.txt', 'ORIGINAL');
    await store.loadRuntimeFiles();

    let release!: () => void;

    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const snapshot = await runtimeAdapterMock.listFiles();
    runtimeAdapterMock.listFiles.mockImplementationOnce(async () => {
      await held;
      return snapshot;
    });

    const refreshing = store.loadRuntimeFiles();

    if (folder) {
      await store.deleteFolder('/home/project/nested');
    } else {
      await store.deleteFile(path);
    }

    release();
    await refreshing;
    expect(store.files.get()[deletedPath]).toBeUndefined();
    expect(store.filesCount).toBe(0);
  });

  it('ignores a listing from a runtime replaced during the request', async () => {
    const store = new WorkbenchStore();
    runtimeFiles.set('audit.txt', 'OLD-RUNTIME');
    await store.loadRuntimeFiles();

    let release!: () => void;

    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const snapshot = await runtimeAdapterMock.listFiles();
    runtimeAdapterMock.listFiles.mockImplementationOnce(async () => {
      await held;
      return snapshot;
    });

    const refreshing = store.loadRuntimeFiles();
    store.configureRuntime({ ...runtimeAdapterMock } as never);
    runtimeFiles.set('audit.txt', 'NEW-RUNTIME');
    await store.loadRuntimeFiles();
    release();
    await refreshing;
    expect(store.files.get()[path]).toMatchObject({ content: 'NEW-RUNTIME' });
    expect(store.currentDocument.get()?.value).toBe('NEW-RUNTIME');
    expect(store.filesCount).toBe(1);
  });

  it('keeps a failed save rejected and dirty while the old listing completes', async () => {
    const store = new WorkbenchStore();
    runtimeFiles.set('audit.txt', 'ORIGINAL');
    await store.loadRuntimeFiles();
    store.setSelectedFile(path);

    let release!: () => void;

    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const snapshot = await runtimeAdapterMock.listFiles();
    runtimeAdapterMock.listFiles.mockImplementationOnce(async () => {
      await held;
      return snapshot;
    });

    const refreshing = store.loadRuntimeFiles();
    store.setCurrentDocumentContent('UNSAVED-DRAFT');
    runtimeAdapterMock.writeFile.mockRejectedValueOnce(new Error('write refused'));
    await expect(store.saveCurrentDocument()).rejects.toThrow('write refused');
    expect(runtimeFiles.get('audit.txt')).toBe('ORIGINAL');
    expect(store.unsavedFiles.get().has(path)).toBe(true);
    release();
    await refreshing;
    expect(store.files.get()[path]).toMatchObject({ content: 'ORIGINAL' });
    expect(store.currentDocument.get()?.value).toBe('UNSAVED-DRAFT');
    expect(store.unsavedFiles.get().has(path)).toBe(true);
  });

  it('does not carry project A files into B when A listing finishes late', async () => {
    const store = new WorkbenchStore();
    store.configureProject('listing-project-a');
    runtimeFiles.set('audit.txt', 'PROJECT-A');
    runtimeFiles.set('only-a.txt', 'ONLY-A');
    await store.loadRuntimeFiles();

    let release!: () => void;

    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const snapshot = await runtimeAdapterMock.listFiles();
    runtimeAdapterMock.listFiles.mockImplementationOnce(async () => {
      await held;
      return snapshot;
    });

    const refreshingA = store.loadRuntimeFiles();
    store.configureProject(undefined);
    store.configureRuntime({ ...runtimeAdapterMock } as never);
    store.configureProject('listing-project-b');
    runtimeFiles.clear();
    runtimeFiles.set('audit.txt', 'PROJECT-B');
    runtimeFiles.set('only-b.txt', 'ONLY-B');
    await store.loadRuntimeFiles();
    release();
    await refreshingA;
    expect(store.files.get()[path]).toMatchObject({ content: 'PROJECT-B' });
    expect(store.files.get()['/home/project/only-a.txt']).toBeUndefined();
    expect(store.files.get()['/home/project/only-b.txt']).toMatchObject({ content: 'ONLY-B' });
    expect(store.currentDocument.get()?.value).toBe('PROJECT-B');
    expect(store.filesCount).toBe(2);
  });
});
