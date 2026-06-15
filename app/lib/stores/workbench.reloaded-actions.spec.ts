/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';

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
      readFile: vi.fn(async (filePath: string) => runtimeFiles.get(filePath) ?? ''),
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
    },
  };
});

vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  runtimeAdapter: runtimeAdapterMock,
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

function actionStatus(store: WorkbenchStore, actionId: string) {
  return store.artifacts.get()['artifact-1']?.runner.actions.get()[actionId]?.status;
}

describe('WorkbenchStore reloaded and review-first actions', () => {
  beforeEach(() => {
    runtimeFiles.clear();
    runtimeAdapterMock.listFiles.mockClear();
    runtimeAdapterMock.readFile.mockClear();
    runtimeAdapterMock.writeFile.mockClear();
    runtimeAdapterMock.createFile.mockClear();
    runtimeAdapterMock.createDirectory.mockClear();
    runtimeAdapterMock.listProcesses.mockClear();
    runtimeAdapterMock.killProcess.mockClear();
    runtimeAdapterMock.streamCommand.mockClear();
    runtimeAdapterMock.runCommand.mockClear();
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
