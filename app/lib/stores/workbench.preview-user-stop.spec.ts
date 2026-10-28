/** @vitest-environment jsdom */
import { spawn } from 'node:child_process';
import { get } from 'node:http';
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
      /*
       * `setSelectedFile` interroge le contenu distant depuis #349. Une
       * doublure qui ne l'expose pas fait rejeter une promesse hors de tout
       * test — 44 « unhandled rejection » qui ne pointent aucune assertion.
       * Ici, rien à adopter : la doublure n'a pas de runtime.
       */
      adoptRemoteContent = vi.fn(async () => 'inchange' as const);
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

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

const stopFlag = (store: WorkbenchStore) =>
  (store as WorkbenchStore & { previewStoppedByUser?: { get(): boolean } }).previewStoppedByUser?.get();

const userRun = (store: WorkbenchStore) =>
  store.startPreviewServer({ intent: 'user' } as Parameters<WorkbenchStore['startPreviewServer']>[0]);

const stores: WorkbenchStore[] = [];

async function readyStore() {
  const store = new WorkbenchStore();
  stores.push(store);
  await store.loadRuntimeFiles('.');

  return store;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ proposals: [] }), { status: 200 })),
  );
  runtimeFiles.clear();
  seedInstalledViteProject();
  vi.clearAllMocks();
  runtimeAdapterMock.readFile.mockReset();
  runtimeAdapterMock.streamCommand.mockReset();
  runtimeAdapterMock.readFile.mockImplementation(async (path) => ({
    content: runtimeFiles.get(path) ?? '',
    encoding: 'utf8' as const,
  }));
  runtimeAdapterMock.listProcesses.mockResolvedValue([]);
  runtimeAdapterMock.killProcess.mockResolvedValue(undefined);
  runtimeAdapterMock.streamCommand.mockImplementation(async function* () {
    yield { type: 'exit' as const, exitCode: 0 };
  });
});
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.flushWorkspaceLogs();
  }
  vi.unstubAllGlobals();
});

describe('durable user preview Stop', () => {
  it('does not relaunch after user Stop until an explicit user Run releases the stop', async () => {
    const store = await readyStore();
    await store.stopPreviewServer({ raison: 'utilisateur' });
    await store.startPreviewServer();
    expect(runtimeAdapterMock.streamCommand).not.toHaveBeenCalled();
    expect(stopFlag(store)).toBe(true);
    await userRun(store);
    await vi.waitFor(() => expect(runtimeAdapterMock.streamCommand).toHaveBeenCalled());
    expect(stopFlag(store)).toBe(false);
  });

  it('Stop while runtime manifest detection is pending prevents any later launch', async () => {
    const store = await readyStore();
    const pending = deferred<Awaited<ReturnType<typeof runtimeAdapterMock.listFiles>>>();
    const nodes = await runtimeAdapterMock.listFiles();
    runtimeAdapterMock.listFiles.mockClear();
    runtimeAdapterMock.listFiles.mockImplementationOnce(() => pending.promise);

    const start = store.startPreviewServer();
    await vi.waitFor(() => expect(runtimeAdapterMock.listFiles).toHaveBeenCalled());
    await store.stopPreviewServer({ raison: 'utilisateur' });
    pending.resolve(nodes);
    await start;
    await Promise.resolve();
    expect(runtimeAdapterMock.streamCommand).not.toHaveBeenCalled();
    expect(stopFlag(store)).toBe(true);
  });

  it('Stop during a pending dependency install prevents the dev command from following it', async () => {
    const store = await readyStore();
    const install = deferred<void>();
    runtimeAdapterMock.streamCommand.mockImplementationOnce(async function* () {
      await install.promise;
      yield { type: 'exit' as const, exitCode: 0 };
    });

    const start = store.startPreviewServer({ forceInstall: true });
    await vi.waitFor(() => expect(runtimeAdapterMock.streamCommand).toHaveBeenCalledTimes(1));
    await store.stopPreviewServer({ raison: 'utilisateur' });
    install.resolve();
    await start;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(runtimeAdapterMock.streamCommand).toHaveBeenCalledTimes(1);
    expect(stopFlag(store)).toBe(true);
  });

  it('a newer Stop wins over user Run and a late failed stream completion', async () => {
    const store = await readyStore();
    const exit = deferred<void>();
    runtimeAdapterMock.streamCommand.mockImplementationOnce(async function* () {
      await exit.promise;
      yield { type: 'exit' as const, exitCode: 1 };
    });
    await userRun(store);
    await vi.waitFor(() => expect(runtimeAdapterMock.streamCommand).toHaveBeenCalledTimes(1));
    await store.stopPreviewServer({ raison: 'utilisateur' });
    exit.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.previewServerState.get().status).toBe('idle');
    expect(stopFlag(store)).toBe(true);
    await store.startPreviewServer();
    expect(runtimeAdapterMock.streamCommand).toHaveBeenCalledTimes(1);
  });

  it('isolates project A and B and preserves A Stop through an undefined binding', async () => {
    const store = await readyStore();
    store.configureProject('project-A');
    await store.stopPreviewServer({ raison: 'utilisateur' });
    store.configureProject(undefined);
    store.configureProject('project-A');
    expect(stopFlag(store)).toBe(true);
    store.configureProject('project-B');
    expect(stopFlag(store)).toBe(false);
    store.configureProject('project-A');
    expect(stopFlag(store)).toBe(true);
    await store.startPreviewServer();
    expect(runtimeAdapterMock.streamCommand).not.toHaveBeenCalled();
  });

  it('allows automatic recovery after a crash without user Stop', async () => {
    const store = await readyStore();
    store.previewServerState.set({ status: 'error', error: 'fixture crashed' });
    await store.startPreviewServer();
    await vi.waitFor(() => expect(runtimeAdapterMock.streamCommand).toHaveBeenCalled());
    expect(stopFlag(store)).toBe(false);
  });

  it('does not claim a confirmed idle state when the runtime refuses the kill', async () => {
    const store = await readyStore();
    runtimeAdapterMock.listProcesses.mockResolvedValue([
      { id: 'dev', command: 'npm run dev', status: 'running' },
    ] as never);
    runtimeAdapterMock.killProcess.mockRejectedValue(new Error('PROCESS_STOP_TIMEOUT'));
    await store.stopPreviewServer({ raison: 'utilisateur' }).catch(() => undefined);
    expect(store.previewServerState.get().status).not.toBe('idle');
    expect(stopFlag(store)).toBe(true);
    await store.startPreviewServer();
    expect(runtimeAdapterMock.streamCommand).not.toHaveBeenCalled();
  });
  it('an old failed stream cannot overwrite a newer explicit user Run', async () => {
    const store = await readyStore();
    const oldExit = deferred<void>();
    const newExit = deferred<void>();
    runtimeAdapterMock.streamCommand
      .mockImplementationOnce(async function* () {
        await oldExit.promise;
        yield { type: 'exit' as const, exitCode: 1 };
      })
      .mockImplementationOnce(async function* () {
        await newExit.promise;
        yield { type: 'exit' as const, exitCode: 0 };
      });
    await userRun(store);
    await vi.waitFor(() => expect(runtimeAdapterMock.streamCommand).toHaveBeenCalledTimes(1));
    await store.stopPreviewServer({ raison: 'utilisateur' });
    await userRun(store);
    await vi.waitFor(() => expect(runtimeAdapterMock.streamCommand).toHaveBeenCalledTimes(2));

    const newState = store.previewServerState.get();

    try {
      oldExit.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(store.previewServerState.get()).toEqual(newState);
      expect(stopFlag(store)).toBe(false);
    } finally {
      newExit.resolve();
    }
  });
  it('starts project B without waiting for project A pending Stop', async () => {
    const store = await readyStore();
    store.configureProject('project-A');

    const oldProcesses = deferred<Awaited<ReturnType<typeof runtimeAdapterMock.listProcesses>>>();
    runtimeAdapterMock.listProcesses.mockImplementationOnce(() => oldProcesses.promise);

    const stoppingA = store.stopPreviewServer({ raison: 'utilisateur' });
    await vi.waitFor(() => expect(runtimeAdapterMock.listProcesses).toHaveBeenCalledTimes(1));
    store.configureProject('project-B');

    const startB = store.startPreviewServer();

    try {
      await vi.waitFor(() => expect(runtimeAdapterMock.streamCommand).toHaveBeenCalled(), { timeout: 500 });
      expect(stopFlag(store)).toBe(false);
    } finally {
      oldProcesses.resolve([]);
      await stoppingA;
      await startB;
    }
  });

  it('restores Stop in a new store for the same project and explicit user Run removes its persisted key', async () => {
    const first = await readyStore();
    first.configureProject('project-persisted');
    await first.stopPreviewServer({ raison: 'utilisateur' });
    expect(sessionStorage.getItem('vibecore.preview-stopped:project-persisted')).toBe('1');

    const reloaded = await readyStore();
    reloaded.configureProject('project-persisted');
    expect(stopFlag(reloaded)).toBe(true);
    await reloaded.startPreviewServer();
    expect(runtimeAdapterMock.streamCommand).not.toHaveBeenCalled();
    await userRun(reloaded);
    await vi.waitFor(() => expect(runtimeAdapterMock.streamCommand).toHaveBeenCalled());
    expect(stopFlag(reloaded)).toBe(false);
    expect(sessionStorage.getItem('vibecore.preview-stopped:project-persisted')).toBeNull();
  });

  it('Stop during install retry backoff suppresses the next attempt', async () => {
    const store = await readyStore();
    runtimeAdapterMock.streamCommand.mockImplementationOnce(async function* () {
      yield { type: 'stderr' as const, data: 'Command stream closed before completion' };
      yield { type: 'exit' as const, exitCode: 1 };
    });
    await store.startPreviewServer({ forceInstall: true });
    await vi.waitFor(() => expect(store.workspaceLogs.get().some((line) => line.includes('2/3'))).toBe(true));
    expect(runtimeAdapterMock.streamCommand).toHaveBeenCalledTimes(1);
    await store.stopPreviewServer({ raison: 'utilisateur' });
    await new Promise((resolve) => setTimeout(resolve, 1150));
    expect(runtimeAdapterMock.streamCommand).toHaveBeenCalledTimes(1);
    expect(stopFlag(store)).toBe(true);
    expect(store.previewServerState.get().status).toBe('idle');
  });

  it('automatic restart and reinstall cannot clear Stop through force flags', async () => {
    const store = await readyStore();
    await store.stopPreviewServer({ raison: 'utilisateur' });
    await store.restartPreviewServer();
    await store.reinstallDependencies();
    await store.startPreviewServer({ forceRestart: true, forceInstall: true });
    expect(runtimeAdapterMock.streamCommand).not.toHaveBeenCalled();
    expect(runtimeAdapterMock.startWorkspace).not.toHaveBeenCalled();
    expect(stopFlag(store)).toBe(true);
  });
  it('user Run waits for pending Stop to discover and kill the old process before relaunching', async () => {
    const store = await readyStore();
    const pendingProcesses = deferred<Awaited<ReturnType<typeof runtimeAdapterMock.listProcesses>>>();
    runtimeAdapterMock.listProcesses.mockImplementationOnce(() => pendingProcesses.promise);

    const stopping = store.stopPreviewServer({ raison: 'utilisateur' });
    await vi.waitFor(() => expect(runtimeAdapterMock.listProcesses).toHaveBeenCalledTimes(1));

    const starting = userRun(store);
    await Promise.resolve();
    expect(runtimeAdapterMock.streamCommand).not.toHaveBeenCalled();
    pendingProcesses.resolve([{ id: 'old-dev', command: 'npm run dev', status: 'running' }] as never);
    expect(await stopping).toBe(1);
    await starting;
    await vi.waitFor(() => expect(runtimeAdapterMock.streamCommand).toHaveBeenCalledTimes(1));
    expect(runtimeAdapterMock.killProcess).toHaveBeenCalledWith('old-dev');
    expect(runtimeAdapterMock.killProcess.mock.invocationCallOrder[0]).toBeLessThan(
      runtimeAdapterMock.streamCommand.mock.invocationCallOrder[0],
    );
    expect(stopFlag(store)).toBe(false);
  });
  it('orchestrates user Stop and explicit Run against a real local HTTP child process', async () => {
    // Only process execution and HTTP are real; project files, probes and the remote adapter remain fixtures.
    const store = await readyStore();

    const children: Array<{
      child: ReturnType<typeof spawn>;
      port: number;
      exited: boolean;
      exit: Promise<number | null>;
      error?: Error;
    }> = [];
    const response = (port: number) =>
      new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
        const request = get({ hostname: '127.0.0.1', port, path: '/', agent: false }, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            body += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode, body }));
          res.on('error', reject);
        });
        request.setTimeout(500, () => request.destroy(new Error('Local HTTP probe timed out')));
        request.on('error', reject);
      });
    const terminate = async (entry: (typeof children)[number]) => {
      if (!entry.exited && entry.child.pid) {
        process.kill(-entry.child.pid, 'SIGKILL');
      }

      await entry.exit;
    };
    runtimeAdapterMock.streamCommand.mockImplementation(async function* () {
      const child = spawn(
        process.execPath,
        [
          '-e',
          `
        const http = require('node:http');
        const server = http.createServer((req, res) => res.end('pid:' + process.pid));
        server.listen(0, '127.0.0.1', () => process.stdout.write('PORT:' + server.address().port + '\\n'));
      `,
        ],
        { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const entry: (typeof children)[number] = {
        child,
        port: 0,
        exited: false,
        exit: new Promise((resolve) =>
          child.once('close', (code) => {
            entry.exited = true;
            resolve(code);
          }),
        ),
      };
      children.push(entry);
      child.once('error', (error) => {
        entry.error = error;
      });

      let output = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString();

        const match = /PORT:(\d+)/.exec(output);

        if (match) {
          entry.port = Number(match[1]);
        }
      });

      const code = await entry.exit;
      yield { type: 'exit' as const, exitCode: code ?? 1 };
    });
    runtimeAdapterMock.listProcesses.mockImplementation(
      async () =>
        children
          .filter((entry) => !entry.exited)
          .map((entry) => ({ id: String(entry.child.pid), command: 'npm run dev', status: 'running' })) as never,
    );
    runtimeAdapterMock.killProcess.mockImplementation((async (id: string) => {
      const entry = children.find((candidate) => String(candidate.child.pid) === id);

      if (!entry) {
        throw new Error('Unknown local child');
      }

      await terminate(entry);
    }) as never);

    try {
      await userRun(store);
      await vi.waitFor(() => {
        expect(children).toHaveLength(1);
        expect(children[0].error).toBeUndefined();
        expect(children[0].port).toBeGreaterThan(0);
      });

      const first = children[0];
      expect(await response(first.port)).toEqual({ status: 200, body: `pid:${first.child.pid}` });
      expect(await store.stopPreviewServer({ raison: 'utilisateur' })).toBe(1);
      expect(first.exited).toBe(true);
      await expect(response(first.port)).rejects.toMatchObject({ code: 'ECONNREFUSED' });

      for (let attempt = 0; attempt < 3; attempt++) {
        await store.startPreviewServer();
        await store.restartPreviewServer();
        await store.reinstallDependencies();
      }
      expect(children).toHaveLength(1);
      expect(runtimeAdapterMock.streamCommand).toHaveBeenCalledTimes(1);
      expect(stopFlag(store)).toBe(true);
      await userRun(store);
      await vi.waitFor(() => {
        expect(children).toHaveLength(2);
        expect(children[1].error).toBeUndefined();
        expect(children[1].port).toBeGreaterThan(0);
      });
      expect(children[1].child.pid).not.toBe(first.child.pid);
      expect(await response(children[1].port)).toEqual({ status: 200, body: `pid:${children[1].child.pid}` });
      expect(stopFlag(store)).toBe(false);
    } finally {
      await Promise.all(children.map(terminate));
    }
  });
});
