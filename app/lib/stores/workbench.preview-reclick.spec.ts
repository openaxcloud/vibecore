/**
 * @vitest-environment jsdom
 *
 * BUG-IDE-PANEL-RECLICK-REPROVISION-001 — re-clicking / re-activating a panel
 * whose preview is ALREADY SERVING must be a strict no-op at the store level.
 *
 * Live repro (24/08, desktop prod): re-clicking the active Webview tab issued a
 * redundant startPreviewServer() which ran #ensureWorkspaceProvisioned FIRST —
 * a stale stopped/error workspaceStatus then reprovisioned the LIVE pod, the
 * IDE flipped to the "Webview startup" overlay, the file tree collapsed from
 * 12 to 1 file and the healthy preview command was killed ("Command stream
 * closed before completion / exited with code 1").
 *
 * The fix evaluates the reattach fast-path BEFORE any recovery: a non-forced
 * start against a genuinely-ready port with installed dependencies reattaches
 * and returns — no reprovision, no install, no teardown, no file reload.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('./files', async () => {
  const { map } = await import('nanostores');

  return {
    FilesStore: class {
      files = map({});
      filesCount = 0;

      setRuntime = vi.fn();

      async reloadFromRuntime() {
        const nodes = await runtimeAdapterMock.listFiles('.');
        const nextFiles: Record<string, { type: 'file'; content: string; isBinary: boolean }> = {};

        for (const node of nodes) {
          nextFiles[`/home/project/${node.path.replace(/^\/+/, '')}`] = {
            type: 'file',
            content: node.content ?? '',
            isBinary: node.encoding === 'binary',
          };
        }

        this.filesCount = Object.keys(nextFiles).length;
        this.files.set(nextFiles);
      }

      getFile(filePath: string) {
        return this.files.get()[filePath];
      }

      isFileLocked() {
        return { locked: false as const };
      }

      async saveFile(filePath: string, content: string) {
        this.files.setKey(filePath, { type: 'file', content, isBinary: false });
      }

      getFileModifications() {
        return {};
      }

      getModifiedFiles() {
        return [];
      }

      resetFileModifications = vi.fn();
    },
  };
});

vi.mock('./editor', async () => {
  const { atom, map } = await import('nanostores');

  return {
    EditorStore: class {
      currentDocument = atom(undefined);
      selectedFile = atom(undefined);
      documents = map({});

      setDocuments = vi.fn();

      setSelectedFile(filePath: string | undefined) {
        this.selectedFile.set(filePath);
      }

      updateFile(filePath: string, value: string) {
        this.documents.setKey(filePath, { filePath, value, isBinary: false });
      }

      updateScrollPosition = vi.fn();
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

const RUNNING_PREVIEW = {
  port: 5173,
  ready: true,
  serving: true,
  baseUrl: 'https://preview-5173.example.test',
};

function seedInstalledViteProject() {
  runtimeFiles.set(
    'package.json',
    JSON.stringify({
      name: 'app',
      type: 'module',
      scripts: { dev: 'vite --host 0.0.0.0' },
      dependencies: { react: '^18.3.1' },
      devDependencies: { vite: '^5.1.4' },
    }),
  );

  /*
   * The installed-dependencies probe lists node_modules; the harness lister
   * answers with every seeded entry's basename, so these two entries make the
   * probe report react + vite as installed.
   */
  runtimeFiles.set('react', '');
  runtimeFiles.set('vite', '');
}

function staleStoppedStatus() {
  return {
    id: 'ws-1',
    runtimeMode: 'remote-kubernetes' as const,
    status: 'stopped' as const,
    workdir: '/home/project',
    createdAt: '',
    updatedAt: '',
  };
}

describe('startPreviewServer — re-click / redundant start against a serving preview', () => {
  beforeEach(() => {
    runtimeFiles.clear();
    runtimeAdapterMock.listFiles.mockClear();
    runtimeAdapterMock.listProcesses.mockClear();
    runtimeAdapterMock.killProcess.mockClear();
    runtimeAdapterMock.startWorkspace.mockClear();
    runtimeAdapterMock.streamCommand.mockReset();
    runtimeAdapterMock.streamCommand.mockImplementation(async function* () {
      yield { type: 'exit' as const, exitCode: 0 };
    });
  });

  it('is a strict no-op: no reprovision, no teardown, no relaunch, no file-tree reload (the live repro)', async () => {
    seedInstalledViteProject();

    const store = new WorkbenchStore();
    await store.loadRuntimeFiles('.');

    // Stale status says the pod is gone — but the preview is demonstrably serving.
    store.workspaceStatus.set(staleStoppedStatus());
    store.previews.set([RUNNING_PREVIEW]);

    const filesBefore = store.files.get();
    const listFilesCallsBeforeStart = runtimeAdapterMock.listFiles.mock.calls.length;

    await store.startPreviewServer();

    // 1. No workspace reprovision (the live bug replaced the LIVE pod).
    expect(runtimeAdapterMock.startWorkspace).not.toHaveBeenCalled();

    // 2. The healthy preview command is not torn down or replaced.
    expect(runtimeAdapterMock.killProcess).not.toHaveBeenCalled();
    expect(runtimeAdapterMock.streamCommand).not.toHaveBeenCalled();

    // 3. The IDE file tree is untouched (live repro: 12 files -> 1 file).
    expect(store.files.get()).toEqual(filesBefore);

    /*
     * 4. No full tree resync either: the only listFiles traffic allowed is the
     * node_modules probe of the reattach decision (never a '.' reload).
     */
    const reloadCalls = runtimeAdapterMock.listFiles.mock.calls
      .slice(listFilesCallsBeforeStart)
      .filter(([directory]) => directory === '.' || directory === undefined);
    expect(reloadCalls).toEqual([]);

    // 5. The store reports the adopted, still-running server.
    expect(store.previewServerState.get().status).toBe('running');

    // 6. The stale status was NOT "healed" by a reprovision — it stays as-is.
    expect(store.workspaceStatus.get()?.status).toBe('stopped');
  });

  it('still reprovisions a stopped workspace when NOTHING is serving (recovery path preserved)', async () => {
    seedInstalledViteProject();

    const store = new WorkbenchStore();
    await store.loadRuntimeFiles('.');
    store.workspaceStatus.set(staleStoppedStatus());
    store.previews.set([]);

    await store.startPreviewServer();

    expect(runtimeAdapterMock.startWorkspace).toHaveBeenCalled();
    expect(store.workspaceStatus.get()?.status).toBe('running');
  });

  it('a forced restart (Run button) punches through the fast-path and relaunches for real', async () => {
    seedInstalledViteProject();

    const store = new WorkbenchStore();
    await store.loadRuntimeFiles('.');
    store.workspaceStatus.set(staleStoppedStatus());
    store.previews.set([RUNNING_PREVIEW]);

    await store.startPreviewServer({ forceRestart: true });

    // The explicit restart DID reach the teardown+relaunch machinery.
    expect(runtimeAdapterMock.startWorkspace).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(runtimeAdapterMock.streamCommand).toHaveBeenCalled();
    });
  });
});
