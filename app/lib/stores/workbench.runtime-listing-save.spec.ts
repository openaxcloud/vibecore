/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ proposals: [] }))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

    const refreshing = store.loadRuntimeFiles();
    store.setCurrentDocumentContent(saved);
    expect(store.unsavedFiles.get().has(path)).toBe(true);
    await store.saveCurrentDocument();
    expect(runtimeFiles.get('audit.txt')).toBe(saved);
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
});
