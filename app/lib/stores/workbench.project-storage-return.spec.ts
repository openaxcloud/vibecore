/** @vitest-environment jsdom */

import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';

const { runtimeAdapterMock } = vi.hoisted(() => {
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
      mode: 'test',
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

let projectSequence = 0;

const path = '/home/project/audit.txt';

async function archive(content = 'saved document') {
  const zip = new JSZip();
  zip.file('audit.txt', content);

  return new Response(JSON.stringify({ archive: { base64: await zip.generateAsync({ type: 'base64' }) } }));
}

function setup() {
  const store = new WorkbenchStore();
  const projectId = `selection-restore-${++projectSequence}`;
  store.configureProject(projectId);

  return { store, projectId };
}

function stubArchive(load: () => Promise<Response>) {
  const downloads = vi.fn(load);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.endsWith('/export/zip') ? downloads() : Promise.resolve(new Response(JSON.stringify({ proposals: [] }))),
    ),
  );

  return downloads;
}

describe('project storage hydration after returning to the IDE', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ proposals: [] }))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rehydrates after a runtime rebind before the former 30-second cooldown expires', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);

    const { store, projectId } = setup();
    const downloads = stubArchive(() => archive());
    expect(await store.loadProjectStorageFiles()).toBe(true);
    expect(store.currentDocument.get()?.value).toBe('saved document');

    store.configureProject(undefined);
    store.configureRuntime({ ...runtimeAdapterMock } as never);
    store.configureProject(projectId);
    store.setSelectedFile(undefined);
    store.setDocuments(store.files.get());
    expect(store.files.get()).toEqual({});
    expect(store.currentDocument.get()).toBeUndefined();
    expect(store.filesHydrated.get()).toBe(false);

    expect(await store.loadProjectStorageFiles()).toBe(true);
    expect(downloads).toHaveBeenCalledTimes(2);
    expect(store.files.get()[path]?.type).toBe('file');
    expect(store.currentDocument.get()?.value).toBe('saved document');
    expect(store.filesHydrated.get()).toBe(true);
  });

  it('still downloads one archive for concurrent callers', async () => {
    const { store } = setup();

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const downloads = stubArchive(async () => {
      await gate;
      return archive();
    });

    const first = store.loadProjectStorageFiles();
    const second = store.loadProjectStorageFiles();
    expect(downloads).toHaveBeenCalledTimes(1);
    release();
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(store.currentDocument.get()?.value).toBe('saved document');
  });

  it('retries an empty archive and an HTTP failure without caching either result', async () => {
    const { store } = setup();
    const downloads = stubArchive(() => archive());
    downloads.mockResolvedValueOnce(new Response(JSON.stringify({ archive: {} })));
    expect(await store.loadProjectStorageFiles()).toBe(false);
    downloads.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(store.loadProjectStorageFiles()).rejects.toMatchObject({ status: 503 });
    expect(await store.loadProjectStorageFiles()).toBe(true);
    expect(downloads).toHaveBeenCalledTimes(3);
    expect(store.currentDocument.get()?.value).toBe('saved document');
  });

  it('does not hydrate project B with the late archive from project A', async () => {
    const { store } = setup();

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubArchive(async () => {
      await gate;
      return archive('project A');
    });

    const pending = store.loadProjectStorageFiles();
    store.configureProject('different-project');
    release();
    expect(await pending).toBe(false);
    expect(store.files.get()).toEqual({});
    expect(store.filesHydrated.get()).toBe(false);
  });

  it('preserves a dirty editor document when a subsequent archive is older', async () => {
    const { store } = setup();
    const downloads = stubArchive(() => archive('old persisted content'));
    await store.loadProjectStorageFiles();
    store.setSelectedFile(path);
    store.setCurrentDocumentContent('my unsaved draft');
    expect(store.unsavedFiles.get().has(path)).toBe(true);
    await store.loadProjectStorageFiles();
    expect(downloads).toHaveBeenCalledTimes(2);
    expect(store.currentDocument.get()?.value).toBe('my unsaved draft');
    expect(store.unsavedFiles.get().has(path)).toBe(true);
  });
});
