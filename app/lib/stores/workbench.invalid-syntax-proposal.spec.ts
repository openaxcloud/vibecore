/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

      setObservationEnabled = vi.fn();
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

function artifactData(): ArtifactCallbackData {
  return {
    id: 'artifact-1',
    artifactId: 'artifact-1',
    messageId: 'assistant-1',
    title: 'Generated app',
    type: 'bundled',
  };
}

function fileAction(actionId: string, content: string, filePath = 'src/config.ts'): ActionCallbackData {
  return {
    artifactId: 'artifact-1',
    messageId: 'assistant-1',
    actionId,
    action: {
      type: 'file',
      filePath,
      content,
    },
  };
}

const stores: WorkbenchStore[] = [];
beforeEach(() => {
  runtimeFiles.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ proposals: [] }), { status: 200 })),
  );
});
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.flushWorkspaceLogs();
  }
  vi.unstubAllGlobals();
});

describe('real proposal validation rejects malformed source without overwriting the original', () => {
  it('retains the malformed JSX proposal and original through rejected acceptance', async () => {
    const original = 'export default function App() { return <div>Original</div>; }';
    const proposed = 'export default function App() { return <div>{errors.message && {errors.message}}</div>; }';
    runtimeFiles.set('src/App.tsx', original);

    const store = new WorkbenchStore();
    stores.push(store);
    await store.loadRuntimeFiles('.');
    store.setAgentPatchReviewRequired(true);
    store.addArtifact(artifactData());

    const action = fileAction('invalid-file', proposed, 'src/App.tsx');
    store.addAction(action);
    await store._runAction(action, true);
    await store._runAction(action, false);

    const id = 'artifact-1:invalid-file';
    expect(store.agentPatchProposals.get()[id]).toMatchObject({ originalContent: original, proposedContent: proposed });
    runtimeAdapterMock.writeFile.mockClear();
    runtimeAdapterMock.createFile.mockClear();
    expect(await store.acceptAgentPatchProposal(id)).not.toBe('accepted');
    expect(store.agentPatchProposals.get()[id]).toMatchObject({
      status: 'failed',
      originalContent: original,
      proposedContent: proposed,
    });
    expect(runtimeFiles.get('src/App.tsx')).toBe(original);
    expect(runtimeAdapterMock.writeFile).not.toHaveBeenCalled();
    expect(runtimeAdapterMock.createFile).not.toHaveBeenCalled();
  });
});
