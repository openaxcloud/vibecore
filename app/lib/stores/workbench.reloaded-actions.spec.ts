/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';

const { runtimeAdapterMock, runtimeFiles, lockedFiles } = vi.hoisted(() => {
  const runtimeFiles = new Map<string, string>();
  const lockedFiles = new Set<string>();

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
    lockedFiles,
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
        id: 'ws-1',
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

      isFileLocked(filePath: string) {
        return lockedFiles.has(filePath) ? { locked: true as const } : { locked: false as const };
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

function artifactData(messageId = 'assistant-1'): ArtifactCallbackData {
  return {
    id: 'artifact-1',
    artifactId: 'artifact-1',
    messageId,
    title: 'Generated app',
    type: 'bundled',
  };
}

function fileAction(messageId = 'assistant-1'): ActionCallbackData {
  return {
    artifactId: 'artifact-1',
    messageId,
    actionId: 'file-1',
    action: {
      type: 'file',
      filePath: 'src/App.tsx',
      content: 'export default function App() { return <h1>Production Preview Verified</h1>; }\n',
    },
  };
}

function shellAction(messageId = 'assistant-1'): ActionCallbackData {
  return {
    artifactId: 'artifact-1',
    messageId,
    actionId: 'shell-1',
    action: {
      type: 'shell',
      content: 'npm install',
    },
  };
}

function diffAction(
  filePath: string,
  content: string,
  actionId = 'diff-1',
  messageId = 'assistant-1',
): ActionCallbackData {
  return {
    artifactId: 'artifact-1',
    messageId,
    actionId,
    action: {
      type: 'diff',
      filePath,
      content,
    },
  };
}

function actionStatus(store: WorkbenchStore, actionId: string) {
  return store.artifacts.get()['artifact-1']?.runner.actions.get()[actionId]?.status;
}

describe('WorkbenchStore reloaded and review-first actions', () => {
  beforeEach(() => {
    runtimeFiles.clear();
    lockedFiles.clear();
    runtimeAdapterMock.listFiles.mockClear();
    runtimeAdapterMock.readFile.mockClear();
    runtimeAdapterMock.writeFile.mockClear();
    runtimeAdapterMock.createFile.mockClear();
    runtimeAdapterMock.createDirectory.mockClear();
    runtimeAdapterMock.listProcesses.mockClear();
    runtimeAdapterMock.killProcess.mockClear();
    runtimeAdapterMock.runCommand.mockClear();
    runtimeAdapterMock.deleteFile.mockClear();
    runtimeAdapterMock.startWorkspace.mockClear();

    /*
     * Reset (not just clear) streamCommand so a per-test mockImplementation does
     * not leak into the next test — several tests below install their own
     * streaming behaviour, and the default must be restored between them.
     */
    runtimeAdapterMock.streamCommand.mockReset();
    runtimeAdapterMock.streamCommand.mockImplementation(async function* () {
      yield { type: 'exit' as const, exitCode: 0 };
    });
  });

  it('marks reloaded message actions complete without replaying them', async () => {
    const store = new WorkbenchStore();
    const artifact = artifactData();
    const command = shellAction();

    store.setReloadedMessages(['assistant-1']);
    store.addArtifact(artifact);
    store.addAction(command);
    store.runAction(command);

    await vi.waitFor(() => {
      expect(actionStatus(store, 'shell-1')).toBe('complete');
    });

    expect(store.agentPatchProposals.get()).toEqual({});
  });

  it('queues review-first file actions and skips follow-up commands until review is handled', async () => {
    const store = new WorkbenchStore();
    const artifact = artifactData();
    const file = fileAction();
    const command = shellAction();

    store.setAgentPatchReviewRequired(true);
    store.addArtifact(artifact);
    store.addAction(file);
    store.runAction(file);
    store.addAction(command);
    store.runAction(command);

    await vi.waitFor(() => {
      expect(actionStatus(store, 'file-1')).toBe('complete');
      expect(actionStatus(store, 'shell-1')).toBe('complete');
    });

    expect(store.agentPatchProposals.get()['artifact-1:file-1']).toMatchObject({
      actionId: 'file-1',
      status: 'pending',
      relativePath: 'src/App.tsx',
    });
    expect(store.workspaceLogs.get()).toContain(
      'AI command skipped until reviewed file changes are accepted or rejected.',
    );
  });

  it('does not overwrite a locked file when an agent patch proposal is accepted', async () => {
    runtimeFiles.set('src/App.tsx', 'export default function App() { return <h1>Protected</h1>; }\n');
    lockedFiles.add('/home/project/src/App.tsx');

    const store = new WorkbenchStore();
    const artifact = artifactData();
    const file = fileAction();

    store.setAgentPatchReviewRequired(true);
    store.addArtifact(artifact);
    store.addAction(file);
    store.runAction(file);

    await vi.waitFor(() => {
      expect(store.agentPatchProposals.get()['artifact-1:file-1']?.status).toBe('pending');
    });

    runtimeAdapterMock.writeFile.mockClear();
    runtimeAdapterMock.createFile.mockClear();

    const result = await store.acceptAgentPatchProposal('artifact-1:file-1');

    expect(result).toBe('ignored');
    expect(store.agentPatchProposals.get()['artifact-1:file-1']).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('locked'),
    });

    /* The protected on-disk content must be untouched, and no write attempted. */
    expect(runtimeFiles.get('src/App.tsx')).toBe('export default function App() { return <h1>Protected</h1>; }\n');
    expect(runtimeAdapterMock.writeFile).not.toHaveBeenCalled();
    expect(runtimeAdapterMock.createFile).not.toHaveBeenCalled();
    expect(store.actionAlert.get()?.title).toBe('File locked');
  });

  it('does not persist a truncated package.json after the file runner rejects it', async () => {
    runtimeFiles.set('package.json', '{"name":"last-valid"}');

    const store = new WorkbenchStore();
    const artifact = artifactData();

    const truncatedAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'assistant-1',
      actionId: 'package-json',
      action: {
        type: 'file',
        filePath: 'package.json',
        content: '{ "name": "stream-valid", "scripts": { "dev": "vite"',
      },
    };

    store.addArtifact(artifact);
    store.addAction(truncatedAction);
    store.runAction(truncatedAction);

    await vi.waitFor(() => {
      expect(actionStatus(store, 'package-json')).toBe('failed');
    });

    expect(runtimeFiles.get('package.json')).toBe('{"name":"last-valid"}');
    expect(store.workspaceLogs.get()).toEqual(
      expect.arrayContaining([expect.stringContaining('AI file write blocked: package.json')]),
    );
  });

  it('repairs a malformed package.json before validating files on artifact close', async () => {
    runtimeFiles.set('package.json', '{ "scripts": { "dev": "vite" ');
    runtimeFiles.set('index.html', '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
    runtimeFiles.set(
      'src/main.tsx',
      [
        "import { createRoot } from 'react-dom/client';",
        "import App from './App';",
        'createRoot(document.getElementById("root")!).render(<App />);',
        '',
      ].join('\n'),
    );
    runtimeFiles.set('src/App.tsx', 'export default function App() { return <main>Preview repaired</main>; }\n');

    const store = new WorkbenchStore();
    const artifact = artifactData();

    store.addArtifact(artifact);
    await store.loadRuntimeFiles('.');
    store.updateArtifact(artifact, { closed: true });

    await vi.waitFor(() => {
      expect(runtimeAdapterMock.writeFile).toHaveBeenCalledWith(
        'package.json',
        expect.stringContaining('"dev": "vite"'),
      );
    });

    expect(JSON.parse(runtimeFiles.get('package.json') ?? '{}')).toMatchObject({
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: expect.objectContaining({
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        vite: '^5.4.19',
      }),
    });
    expect(store.workspaceLogs.get()).not.toEqual(
      expect.arrayContaining([expect.stringContaining('Preview restart blocked after artifact-1')]),
    );
  });

  it('forces devDependencies in the auto-install so the dev server binary is present', async () => {
    runtimeFiles.set(
      'package.json',
      JSON.stringify({
        name: 'task-dashboard',
        private: true,
        type: 'module',
        scripts: { dev: 'vite --host 0.0.0.0' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
        devDependencies: { vite: '^5.1.4', '@vitejs/plugin-react': '^4.2.1' },
      }),
    );
    runtimeFiles.set('index.html', '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');

    const store = new WorkbenchStore();
    await store.loadRuntimeFiles('.');
    await store.reinstallDependencies();

    const installCall = runtimeAdapterMock.streamCommand.mock.calls
      .map((call) => call[0] as { command?: string; args?: string[] })
      .find((req) => req.command === 'npm' && (req.args ?? []).includes('install'));

    expect(installCall).toBeDefined();

    /*
     * Workspace pods run NODE_ENV=production, which makes npm omit devDependencies
     * by default — but the dev server (vite) lives there. --include=dev guarantees
     * it is installed, otherwise `npm run dev` dies with exit 127 and a blank preview.
     */
    expect(installCall?.args).toContain('--include=dev');
  });

  it('retries a transiently-failed install before launching the preview', async () => {
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

    const store = new WorkbenchStore();
    await store.loadRuntimeFiles('.');

    let installAttempts = 0;
    runtimeAdapterMock.streamCommand.mockImplementation(async function* (request: { args?: string[] }) {
      const isInstall = (request.args ?? []).includes('install');

      if (isInstall) {
        installAttempts += 1;

        if (installAttempts === 1) {
          /* First install drops mid-stream: the adapter's synthetic error. */
          yield { type: 'error', error: { message: 'Command stream closed before completion' } };

          return;
        }
      }

      yield { type: 'exit', exitCode: 0 };
    });

    await store.reinstallDependencies();

    /* The first retry backs off ~1s, so allow headroom over the default 1s wait. */
    await vi.waitFor(
      () => {
        expect(installAttempts).toBeGreaterThanOrEqual(2);
      },
      { timeout: 5000 },
    );

    store.flushWorkspaceLogs();
    expect(store.workspaceLogs.get()).toEqual(expect.arrayContaining([expect.stringContaining('failed transiently')]));

    /* The preview must NOT be left in error after a successful retry. */
    expect(store.previewServerState.get().status).not.toBe('error');
  });

  it('does not retry a deterministic install failure and surfaces an error state', async () => {
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

    const store = new WorkbenchStore();
    await store.loadRuntimeFiles('.');

    let installAttempts = 0;
    runtimeAdapterMock.streamCommand.mockImplementation(async function* (request: { args?: string[] }) {
      if ((request.args ?? []).includes('install')) {
        installAttempts += 1;
        yield { type: 'stderr', data: 'npm error 404 Not Found - GET https://registry/no-such-pkg' };
        yield { type: 'exit', exitCode: 1 };

        return;
      }

      yield { type: 'exit', exitCode: 0 };
    });

    await store.reinstallDependencies();

    await vi.waitFor(() => {
      expect(store.previewServerState.get().status).toBe('error');
    });

    /* A real 404 install error must fail fast — exactly one attempt, no retry. */
    expect(installAttempts).toBe(1);
  });

  it('surfaces an honest error (not "running"/"idle") when the dev server dies with exit 127', async () => {
    /*
     * A dev server that dies (e.g. `vite: command not found` against an empty
     * node_modules) must NOT be reported as running. This is the P0 lie: workspace
     * RUNNING + 0 processes + 502, yet the status claimed "Running on Port 5173".
     */
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

    const store = new WorkbenchStore();
    await store.loadRuntimeFiles('.');

    runtimeAdapterMock.streamCommand.mockImplementation(async function* (request: { args?: string[] }) {
      const args = request.args ?? [];

      if (args.includes('install')) {
        yield { type: 'exit', exitCode: 0 };
        return;
      }

      // The dev-server binary is missing → `npm run dev` exits 127.
      yield { type: 'stderr', data: 'sh: vite: command not found' };
      yield { type: 'exit', exitCode: 127 };
    });

    await store.startPreviewServer();

    await vi.waitFor(() => {
      const state = store.previewServerState.get();
      expect(state.status).toBe('error');
      expect(String(state.error ?? '')).toContain('127');
    });
  });

  it('reprovisions a stopped workspace before starting the preview', async () => {
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

    const store = new WorkbenchStore();
    await store.loadRuntimeFiles('.');
    store.workspaceStatus.set({
      id: 'ws-1',
      runtimeMode: 'remote-kubernetes',
      status: 'stopped',
      workdir: '/home/project',
      createdAt: '',
      updatedAt: '',
    });

    await store.startPreviewServer();

    expect(runtimeAdapterMock.startWorkspace).toHaveBeenCalled();
    expect(store.workspaceStatus.get()?.status).toBe('running');
  });

  it('does not reprovision a healthy workspace', async () => {
    const store = new WorkbenchStore();
    await store.loadRuntimeFiles('.');
    store.workspaceStatus.set({
      id: 'ws-1',
      runtimeMode: 'remote-kubernetes',
      status: 'running',
      workdir: '/home/project',
      createdAt: '',
      updatedAt: '',
    });

    await store.startPreviewServer();

    expect(runtimeAdapterMock.startWorkspace).not.toHaveBeenCalled();
  });

  it('builds an agent-patch proposal from the APPLIED full content for a diff action in review mode', async () => {
    const original = ["export const greeting = 'Hello';", "export const name = 'App';", ''].join('\n');
    const applied = ["export const greeting = 'Goodbye';", "export const name = 'App';", ''].join('\n');
    runtimeFiles.set('src/config.ts', original);

    const store = new WorkbenchStore();
    const artifact = artifactData();

    store.setAgentPatchReviewRequired(true);
    store.addArtifact(artifact);
    await store.loadRuntimeFiles('.');

    const diff = diffAction(
      'src/config.ts',
      [
        '<<<<<<< SEARCH',
        "export const greeting = 'Hello';",
        '=======',
        "export const greeting = 'Goodbye';",
        '>>>>>>> REPLACE',
      ].join('\n'),
    );

    store.addAction(diff);
    store.runAction(diff);

    await vi.waitFor(() => {
      expect(store.agentPatchProposals.get()['artifact-1:diff-1']?.status).toBe('pending');
    });

    const proposal = store.agentPatchProposals.get()['artifact-1:diff-1'];

    // The proposal is built from the applied FULL content — NOT the raw blocks.
    expect(proposal?.proposedContent).toBe(applied);
    expect(proposal?.originalContent).toBe(original);
    expect(proposal?.proposedContent).not.toContain('<<<<<<< SEARCH');
    expect(proposal?.relativePath).toBe('src/config.ts');

    // Nothing was written yet — a review proposal is not an on-disk write.
    expect(runtimeFiles.get('src/config.ts')).toBe(original);
  });

  it('writes the full applied file when a diff-derived proposal is accepted', async () => {
    const original = ["export const greeting = 'Hello';", "export const name = 'App';", ''].join('\n');
    const applied = ["export const greeting = 'Goodbye';", "export const name = 'App';", ''].join('\n');
    runtimeFiles.set('src/config.ts', original);

    const store = new WorkbenchStore();
    const artifact = artifactData();

    store.setAgentPatchReviewRequired(true);
    store.addArtifact(artifact);
    await store.loadRuntimeFiles('.');

    const diff = diffAction(
      'src/config.ts',
      [
        '<<<<<<< SEARCH',
        "export const greeting = 'Hello';",
        '=======',
        "export const greeting = 'Goodbye';",
        '>>>>>>> REPLACE',
      ].join('\n'),
    );

    store.addAction(diff);
    store.runAction(diff);

    await vi.waitFor(() => {
      expect(store.agentPatchProposals.get()['artifact-1:diff-1']?.status).toBe('pending');
    });

    const result = await store.acceptAgentPatchProposal('artifact-1:diff-1');

    expect(result).toBe('accepted');
    expect(runtimeFiles.get('src/config.ts')).toBe(applied);
  });

  it('auto-applies a diff (review off) by writing the full applied content', async () => {
    // Double-quoted so the file pipeline's prettier pass is a byte no-op on the applied content.
    const original = ['export const greeting = "Hello";', 'export const name = "App";', ''].join('\n');
    const applied = ['export const greeting = "Goodbye";', 'export const name = "App";', ''].join('\n');
    runtimeFiles.set('src/config.ts', original);

    const store = new WorkbenchStore();
    const artifact = artifactData();

    store.addArtifact(artifact);
    await store.loadRuntimeFiles('.');

    const diff = diffAction(
      'src/config.ts',
      [
        '<<<<<<< SEARCH',
        'export const greeting = "Hello";',
        '=======',
        'export const greeting = "Goodbye";',
        '>>>>>>> REPLACE',
      ].join('\n'),
    );

    store.addAction(diff);
    store.runAction(diff);

    await vi.waitFor(() => {
      expect(actionStatus(store, 'diff-1')).toBe('complete');
    });

    // The full applied file landed on disk (not the raw blocks, and the untouched line survives).
    const written = runtimeFiles.get('src/config.ts') ?? '';
    expect(written).toBe(applied);
    expect(written).not.toContain('<<<<<<< SEARCH');
    expect(store.agentPatchProposals.get()).toEqual({});
  });

  it('fail-safe: a non-anchoring diff (review off) writes nothing and surfaces an alert', async () => {
    const original = ["export const greeting = 'Hello';", ''].join('\n');
    runtimeFiles.set('src/config.ts', original);

    const store = new WorkbenchStore();
    const artifact = artifactData();

    store.addArtifact(artifact);
    await store.loadRuntimeFiles('.');

    runtimeAdapterMock.writeFile.mockClear();

    const diff = diffAction(
      'src/config.ts',
      [
        '<<<<<<< SEARCH',
        "export const greeting = 'NOT PRESENT';",
        '=======',
        "export const greeting = 'X';",
        '>>>>>>> REPLACE',
      ].join('\n'),
    );

    store.addAction(diff);
    store.runAction(diff);

    await vi.waitFor(() => {
      expect(store.actionAlert.get()?.title).toBe('Diff could not be applied');
    });

    // STRICT fail-safe: the base file is byte-unchanged and no write was attempted.
    expect(runtimeFiles.get('src/config.ts')).toBe(original);
    expect(runtimeAdapterMock.writeFile).not.toHaveBeenCalledWith('src/config.ts', expect.anything());
    expect(store.workspaceLogs.get()).toEqual(expect.arrayContaining([expect.stringContaining('AI diff not applied')]));
  });

  it('clears the in-flight start guard on stop so the dev server can be relaunched', async () => {
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

    const store = new WorkbenchStore();
    await store.loadRuntimeFiles('.');

    /*
     * Keep the streamed command in-flight so the start promise stays set, the way a
     * live dev server keeps running (the finally that would clear it never fires).
     * Before the fix, stopPreviewServer left that promise stale and the next start
     * short-circuited — stranding the dev server on "starting".
     */
    let release: () => void = () => {};
    runtimeAdapterMock.streamCommand.mockImplementation(async function* () {
      yield { type: 'stdout', data: 'Local: http://localhost:5173/' };
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      yield { type: 'exit', exitCode: 0 };
    });

    void store.startPreviewServer();
    await vi.waitFor(() => expect(store.isPreviewServerStarting()).toBe(true));

    await store.stopPreviewServer();
    expect(store.isPreviewServerStarting()).toBe(false);

    release();
  });
});

/*
 * Le changement d'ADAPTATEUR de runtime ne vide pas les artefacts déjà rendus.
 *
 * Mesuré sur le portail E2E de production (commit fafed25) : la liste
 * « Créer package.json … Terminé » d'un fil rechargé comptait 7 lignes, puis 0
 * moins d'une seconde après, sans qu'aucun message ne change. Le fournisseur de
 * runtime reconstruit son adaptateur quand l'identifiant d'espace de travail
 * devient connu, et `configureRuntime` faisait `artifacts.set({})`. Les builds
 * de développement le masquaient : `useMessageParser` y refait un reset + une
 * analyse complète à chaque appel, ce que la production ne fait jamais.
 */
describe('WorkbenchStore — un nouveau runtime relie les artefacts, il ne les efface pas', () => {
  it('garde les artefacts déjà rendus et exécute la suite sur le nouvel adaptateur', async () => {
    const store = new WorkbenchStore();
    const artifact = artifactData();
    const first = fileAction();

    store.addArtifact(artifact);
    store.addAction(first);
    store.runAction(first);

    await vi.waitFor(() => {
      expect(actionStatus(store, 'file-1')).toBe('complete');
    });

    const nouveau = {
      ...runtimeAdapterMock,
      writeFile: vi.fn(async () => undefined),
      createFile: vi.fn(async () => undefined),
    };

    store.configureRuntime(nouveau as unknown as typeof runtimeAdapterMock);

    // L'artefact et son action déjà jouée sont toujours là.
    expect(store.artifacts.get()['artifact-1']).toBeDefined();
    expect(store.artifactIdList).toEqual(['artifact-1']);
    expect(actionStatus(store, 'file-1')).toBe('complete');

    // La prochaine action passe par le NOUVEL adaptateur, pas par l'ancien.
    const ancienEcritures =
      runtimeAdapterMock.writeFile.mock.calls.length + runtimeAdapterMock.createFile.mock.calls.length;
    const second: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'assistant-1',
      actionId: 'file-2',
      action: { type: 'file', filePath: 'src/next.ts', content: 'export const next = true;\n' },
    };

    store.addAction(second);
    store.runAction(second);

    await vi.waitFor(() => {
      expect(actionStatus(store, 'file-2')).toBe('complete');
    });

    expect(nouveau.writeFile.mock.calls.length + nouveau.createFile.mock.calls.length).toBeGreaterThan(0);
    expect(runtimeAdapterMock.writeFile.mock.calls.length + runtimeAdapterMock.createFile.mock.calls.length).toBe(
      ancienEcritures,
    );
  });

  it('efface les artefacts quand c’est le PROJET qui change', () => {
    const store = new WorkbenchStore();

    store.configureProject('project-a');
    store.addArtifact(artifactData());
    expect(store.artifacts.get()['artifact-1']).toBeDefined();

    store.configureProject('project-b');

    expect(store.artifacts.get()).toEqual({});
    expect(store.artifactIdList).toEqual([]);
  });
});
