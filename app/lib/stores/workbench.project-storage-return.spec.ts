/** @vitest-environment jsdom */

import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import { prefetchInitialProjectArchive } from '~/lib/ide/initial-project-archive';

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

  it('reads independent entries concurrently with a bounded working set and preserves archive order', async () => {
    const { store } = setup();
    const started: number[] = [];
    const releases: Array<() => void> = [];

    let active = 0;
    let peak = 0;

    const entries = Array.from({ length: 9 }, (_, index) => {
      const gate = new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      return {
        name: `file-${index}.txt`,
        dir: false,
        async: vi.fn(async () => {
          started.push(index);
          peak = Math.max(peak, ++active);
          await gate;
          active--;

          return new TextEncoder().encode(`document ${index}`);
        }),
      };
    });
    vi.spyOn(JSZip, 'loadAsync').mockResolvedValue({
      files: Object.fromEntries(entries.map((entry) => [entry.name, entry])),
    } as unknown as JSZip);
    stubArchive(async () => new Response(JSON.stringify({ archive: { base64: 'controlled archive' } })));

    const pending = store.loadProjectStorageFiles();

    try {
      await vi.waitFor(() => expect(started).toHaveLength(4));
      expect(store.files.get()).toEqual({});

      for (const index of [3, 2, 1, 0]) {
        releases[index]();
      }
      await vi.waitFor(() => expect(started).toHaveLength(8));

      for (const index of [7, 6, 5, 4]) {
        releases[index]();
      }
      await vi.waitFor(() => expect(started).toHaveLength(9));
      releases[8]();
      expect(await pending).toBe(true);
      expect(peak).toBe(4);

      const files = Object.entries(store.files.get()).filter(([, file]) => file?.type === 'file');
      expect(files.map(([name]) => name)).toEqual(entries.map((entry) => `/home/project/${entry.name}`));

      for (let index = 0; index < entries.length; index++) {
        expect(files[index][1]).toMatchObject({ content: `document ${index}`, isBinary: false });
      }
    } finally {
      releases.forEach((release) => release());
      await pending;
    }
  });

  it('keeps binary bytes and Unicode text from a real archive while skipping directories', async () => {
    const { store } = setup();
    const zip = new JSZip();
    const binary = new Uint8Array([0, 255, 137, 80, 0, 42]);
    zip.folder('empty');
    zip.file('image.bin', binary);
    zip.file('unicode.txt', 'été 日本語 🧪');
    stubArchive(
      async () => new Response(JSON.stringify({ archive: { base64: await zip.generateAsync({ type: 'base64' }) } })),
    );
    expect(await store.loadProjectStorageFiles()).toBe(true);
    expect(store.files.get()['/home/project/image.bin']).toMatchObject({
      content: Buffer.from(binary).toString('base64'),
      isBinary: true,
    });
    expect(store.files.get()['/home/project/unicode.txt']).toMatchObject({ content: 'été 日本語 🧪', isBinary: false });
  });

  it('leaves the existing documents intact when one archive entry cannot be decoded', async () => {
    const { store } = setup();
    stubArchive(() => archive('last complete archive'));
    await store.loadProjectStorageFiles();

    const before = store.files.get();

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = vi.fn(async (index: number) => {
      if (index === 0) {
        throw new Error('corrupt entry');
      }

      await gate;

      return new TextEncoder().encode('partial result');
    });
    const entries = Array.from({ length: 9 }, (_, index) => ({
      name: `file-${index}.txt`,
      dir: false,
      async: () => read(index),
    }));
    vi.spyOn(JSZip, 'loadAsync').mockResolvedValue({
      files: Object.fromEntries(entries.map((entry) => [entry.name, entry])),
    } as unknown as JSZip);

    try {
      await expect(store.loadProjectStorageFiles()).rejects.toThrow('corrupt entry');
      expect(read).toHaveBeenCalledTimes(4);
    } finally {
      release();
    }
    await Promise.resolve();
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(4);
    expect(store.files.get()).toBe(before);
    expect(store.currentDocument.get()?.value).toBe('last complete archive');
  });

  it('protects writes made after early transport starts and still fetches fresh data on a later reload', async () => {
    const { store, projectId } = setup();

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const downloads = stubArchive(async () => {
      await gate;
      return archive('older remote content');
    });
    void prefetchInitialProjectArchive(projectId);
    expect(await store.createFile(path, 'newer local content')).toBe(true);

    const pending = store.loadProjectStorageFiles();
    release();
    expect(await pending).toBe(true);
    expect(downloads).toHaveBeenCalledOnce();
    expect(store.files.get()[path]).toMatchObject({ content: 'newer local content' });

    downloads.mockResolvedValueOnce(await archive('new remote update'));
    expect(await store.loadProjectStorageFiles()).toBe(true);
    expect(downloads).toHaveBeenCalledTimes(2);
    expect(store.files.get()[path]).toMatchObject({ content: 'new remote update' });
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

  it('hydrates both store instances sharing a project and binding during concurrent requests', async () => {
    const { store: first, projectId } = setup();
    const second = new WorkbenchStore();
    second.configureProject(projectId);

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubArchive(async () => {
      await gate;
      return archive('shared project archive');
    });

    const requests = [first.loadProjectStorageFiles(), second.loadProjectStorageFiles()];
    release();
    expect(await Promise.all(requests)).toEqual([true, true]);

    for (const store of [first, second]) {
      expect(store.files.get()[path]).toMatchObject({ content: 'shared project archive' });
      expect(store.currentDocument.get()?.value).toBe('shared project archive');
      expect(store.filesHydrated.get()).toBe(true);
    }
  });

  it.each(['created during request', ''])(
    'preserves a file created through the public API during archive hydration: %j',
    async (content) => {
      const { store } = setup();

      let release!: () => void;

      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      stubArchive(async () => {
        await gate;
        return archive('existing archive file');
      });

      const pending = store.loadProjectStorageFiles();
      const createdPath = '/home/project/created.txt';
      expect(await store.createFile(createdPath, content)).toBe(true);

      // The current createFile contract writes a space for an empty text input.
      const writtenContent = content === '' ? ' ' : content;
      expect(runtimeFiles.get('created.txt')).toBe(writtenContent);
      expect(store.files.get()[createdPath]).toMatchObject({ content: writtenContent });
      release();
      expect(await pending).toBe(true);
      expect(store.files.get()[createdPath]).toMatchObject({ content: writtenContent });
      expect(store.files.get()[path]).toMatchObject({ content: 'existing archive file' });
      store.setSelectedFile(createdPath);
      expect(store.currentDocument.get()?.value).toBe(writtenContent);
    },
  );

  it.each([false, true])(
    'respects a public deletion during a delayed archive, with recreation=%s',
    async (recreate) => {
      const { store } = setup();
      stubArchive(() => archive('old archived content'));
      await store.loadProjectStorageFiles();

      // Establish a runtime file through the same public path used by the IDE.
      expect(await store.createFile(path, 'old archived content')).toBe(true);

      let release!: () => void;

      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      stubArchive(async () => {
        await gate;
        return archive('old archived content');
      });

      const pending = store.loadProjectStorageFiles();
      expect(await store.deleteFile(path)).toBe(true);
      expect(runtimeFiles.has('audit.txt')).toBe(false);
      expect(store.files.get()[path]).toBeUndefined();

      if (recreate) {
        expect(await store.createFile(path, 'recreated content')).toBe(true);
        expect(runtimeFiles.get('audit.txt')).toBe('recreated content');
      }

      release();
      await pending;

      if (recreate) {
        expect(store.files.get()[path]).toMatchObject({ content: 'recreated content' });
        expect(store.currentDocument.get()?.value).toBe('recreated content');
      } else {
        expect(store.files.get()[path]).toBeUndefined();
        expect(store.currentDocument.get()).toBeUndefined();
      }
    },
  );

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

  it('updates an inactive pane document without editing the globally selected file', async () => {
    const { store } = setup();
    const otherPath = '/home/project/other.txt';
    stubArchive(async () => {
      const zip = new JSZip();
      zip.file('audit.txt', 'saved audit');
      zip.file('other.txt', 'saved other');

      return new Response(JSON.stringify({ archive: { base64: await zip.generateAsync({ type: 'base64' }) } }));
    });
    await store.loadProjectStorageFiles();
    store.setSelectedFile(otherPath);
    store.setDocumentContent(path, 'audit draft');
    expect(store.currentDocument.get()?.value).toBe('saved other');
    expect(store.documents.get()[path]?.value).toBe('audit draft');
    expect([...store.unsavedFiles.get()]).toEqual([path]);
    store.setDocumentContent(path, 'saved audit');
    expect(store.unsavedFiles.get().size).toBe(0);
    expect(store.selectedFile.get()).toBe(otherPath);
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
  it.each(['new saved content', ''])(
    'preserves a concurrent successful save over a delayed archive: %j',
    async (content) => {
      const { store, projectId } = setup();
      stubArchive(() => archive('old persisted content'));
      await store.loadProjectStorageFiles();
      store.configureProject(undefined);
      store.configureRuntime({ ...runtimeAdapterMock } as never);
      store.configureProject(projectId);
      runtimeFiles.set(path, 'old persisted content');
      await store.loadRuntimeFiles();

      let release!: () => void;

      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      stubArchive(async () => {
        await gate;
        return archive('old persisted content');
      });

      store.setSelectedFile(path);
      store.setCurrentDocumentContent('saved before request');
      await store.saveCurrentDocument();

      const pending = store.loadProjectStorageFiles();
      store.setCurrentDocumentContent(content);
      await store.saveCurrentDocument();
      expect(store.unsavedFiles.get().has(path)).toBe(false);
      expect(store.files.get()[path]).toMatchObject({ content });
      release();
      await pending;
      expect(store.files.get()[path]).toMatchObject({ content });
      expect(store.currentDocument.get()?.value).toBe(content);
    },
  );

  it.each(['new before request', ''])(
    'adopts a later external archive after a successful local save: %j',
    async (content) => {
      const { store, projectId } = setup();
      stubArchive(() => archive('old persisted content'));
      await store.loadProjectStorageFiles();
      store.configureProject(undefined);
      store.configureRuntime({ ...runtimeAdapterMock } as never);
      store.configureProject(projectId);
      runtimeFiles.set(path, 'old persisted content');
      await store.loadRuntimeFiles();
      store.setSelectedFile(path);
      store.setCurrentDocumentContent(content);
      await store.saveCurrentDocument();
      expect(store.unsavedFiles.get().has(path)).toBe(false);
      expect(runtimeFiles.get('audit.txt')).toBe(content);
      stubArchive(() => archive('later external content'));
      await store.loadProjectStorageFiles();
      expect(store.currentDocument.get()?.value).toBe('later external content');
      expect(store.files.get()[path]).toMatchObject({ content: 'later external content' });
    },
  );

  it('hydrates a contentless listing rather than treating it as a saved empty file', async () => {
    const { store } = setup();
    runtimeAdapterMock.listFiles.mockResolvedValueOnce([
      { type: 'file', name: 'audit.txt', path, content: undefined, encoding: 'utf8' },
    ] as never);
    await store.loadRuntimeFiles();
    stubArchive(() => archive('archive content'));
    await store.loadProjectStorageFiles();
    expect(store.currentDocument.get()?.value).toBe('archive content');
  });

  it('uses a fresh flight after a runtime rebind and rejects the old archive', async () => {
    const { store } = setup();

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const downloads = stubArchive(() => archive('new runtime archive'));
    downloads.mockImplementationOnce(async () => {
      await gate;
      return archive('old runtime archive');
    });

    const old = store.loadProjectStorageFiles();
    store.configureRuntime({ ...runtimeAdapterMock } as never);
    expect(await store.loadProjectStorageFiles()).toBe(true);
    expect(downloads).toHaveBeenCalledTimes(2);
    release();
    expect(await old).toBe(false);
    expect(store.currentDocument.get()?.value).toBe('new runtime archive');
  });

  it('does not resurrect a saved file deleted while an archive was delayed', async () => {
    const { store } = setup();
    stubArchive(() => archive());
    await store.loadProjectStorageFiles();
    store.setSelectedFile(path);
    store.setCurrentDocumentContent('saved then deleted');
    await store.saveCurrentDocument();

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubArchive(async () => {
      await gate;
      return archive();
    });

    const pending = store.loadProjectStorageFiles();
    store.setDeletedPaths([path]);
    release();
    await pending;
    expect(store.files.get()[path]).toBeUndefined();
  });

  it('measures the pre-existing loss of a draft when the provider resets documents on rebind', async () => {
    const { store, projectId } = setup();
    stubArchive(() => archive('saved document'));
    await store.loadProjectStorageFiles();
    store.setSelectedFile(path);
    store.setCurrentDocumentContent('unsaved draft');
    store.configureProject(undefined);
    store.configureRuntime({ ...runtimeAdapterMock } as never);
    store.configureProject(projectId);
    store.setSelectedFile(undefined);
    store.setDocuments(store.files.get());
    expect(store.currentDocument.get()).toBeUndefined();

    // The prior document has already been discarded before archive hydration.
    expect(store.files.get()).toEqual({});
  });

  it.each(['archive-first', 'transcript-first'])(
    'does not replay old conversation content over the saved archive: %s',
    async (order) => {
      const { store, projectId } = setup();
      stubArchive(() => archive('NEW saved document'));
      await store.loadProjectStorageFiles();
      store.configureProject(undefined);
      store.configureRuntime({ ...runtimeAdapterMock } as never);
      store.configureProject(projectId);

      const replay = async () => {
        const artifact = {
          id: 'old-artifact',
          artifactId: 'old-artifact',
          messageId: 'old-message',
          title: 'Old transcript',
          type: 'bundled',
        };
        store.markHydratedMessages(['old-message']);
        store.addArtifact(artifact);

        const action = {
          artifactId: 'old-artifact',
          messageId: 'old-message',
          actionId: 'old-file',
          action: { type: 'file' as const, filePath: 'audit.txt', content: 'OLD conversation document' },
        };
        store.addAction(action);
        store.runAction(action);
        store.updateArtifact(artifact, { closed: true });
        await new Promise<void>((resolve) => store.addToExecutionQueue(async () => resolve()));
      };

      if (order === 'archive-first') {
        await store.loadProjectStorageFiles();
        await replay();
      } else {
        await replay();
        await store.loadProjectStorageFiles();
      }

      store.setSelectedFile(path);
      expect(store.files.get()[path]).toMatchObject({ content: 'NEW saved document' });
      expect(store.currentDocument.get()?.value).toBe('NEW saved document');
      expect(runtimeAdapterMock.writeFile).not.toHaveBeenCalled();
      expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/files/import/zip'))).toHaveLength(0);
    },
  );
  it('does not carry saved-path protection into another project', async () => {
    const { store } = setup();
    stubArchive(() => archive('project A'));
    await store.loadProjectStorageFiles();
    store.setSelectedFile(path);
    store.setCurrentDocumentContent('saved A');
    await store.saveCurrentDocument();
    store.configureProject('project-B-with-same-path');
    stubArchive(() => archive('project B'));
    await store.loadProjectStorageFiles();
    expect(store.files.get()[path]).toMatchObject({ content: 'project B' });
    expect(store.currentDocument.get()?.value).toBe('project B');
  });
  it('preserves an optimistically saved draft when a runtime listing starts during the pending write', async () => {
    const { store } = setup();
    runtimeFiles.set('audit.txt', 'old disk');
    stubArchive(() => archive('old disk'));
    await store.loadProjectStorageFiles();
    store.setSelectedFile(path);
    store.setCurrentDocumentContent('new draft');

    let release!: () => void;
    let started!: () => void;

    const writeStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(runtimeAdapterMock, 'writeFile').mockImplementationOnce(async (filePath, content) => {
      started();
      await gate;
      runtimeFiles.set(filePath, content);
    });

    const pendingSave = store.saveFile(path);
    await writeStarted;
    expect(store.files.get()[path]).toMatchObject({ content: 'new draft' });

    // Listing starts after optimistic publication, while the actual write is still pending.
    await store.loadRuntimeFiles();
    expect.soft(store.files.get()[path]).toMatchObject({ content: 'new draft' });
    expect(store.currentDocument.get()).toMatchObject({ value: 'new draft' });
    expect(store.unsavedFiles.get().has(path)).toBe(true);
    release();
    await expect(pendingSave).resolves.toBe('new draft');
    expect(runtimeFiles.get('audit.txt')).toBe('new draft');
    expect(store.unsavedFiles.get().has(path)).toBe(false);
    expect.soft(store.files.get()[path]).toMatchObject({ content: 'new draft' });

    // A later ordinary document reconciliation must agree with the successful save.
    store.setDocuments(store.files.get());
    expect(store.currentDocument.get()).toMatchObject({ value: 'new draft' });
  });
});
