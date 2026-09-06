/**
 * @vitest-environment jsdom
 *
 * BUG-CREATE-011, moitié « lecture » : à l'ouverture d'un fichier, l'éditeur
 * doit relire la version du RUNTIME au lieu de servir le tampon local venu de
 * `ide-state`. Avec une garde qui prime sur tout : une frappe NON ENREGISTRÉE
 * n'est jamais écrasée — c'est le travail de l'utilisateur.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';

const { runtimeAdapterMock, distantMock } = vi.hoisted(() => {
  const distantMock = new Map<string, string>();

  return {
    distantMock,
    runtimeAdapterMock: {
      workdir: '/home/project',
      mode: 'test',
      listFiles: vi.fn(async () => []),
      readFile: vi.fn(async () => ({ content: '', encoding: 'utf8' as const })),
      writeFile: vi.fn(async () => undefined),
      createFile: vi.fn(async () => undefined),
      createDirectory: vi.fn(async () => undefined),
      listProcesses: vi.fn(async () => []),
      killProcess: vi.fn(async () => undefined),
      streamCommand: vi.fn(async function* () {
        yield { type: 'exit' as const, exitCode: 0 };
      }),
      runCommand: vi.fn(async () => ({ exitCode: 0, output: '' })),
      deleteFile: vi.fn(async () => undefined),
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
      getFile(filePath: string) {
        return this.files.get()[filePath];
      }
      isFileLocked() {
        return { locked: false as const };
      }
      getFileModifications() {
        return {};
      }
      getModifiedFiles() {
        return [];
      }
      resetFileModifications = vi.fn();
      adoptRemoteContent = vi.fn(async (filePath: string) => {
        const distant = distantMock.get(filePath);

        if (distant === undefined) {
          return 'illisible' as const;
        }

        const courant = this.files.get()[filePath] as { type: string; content: string } | undefined;

        if (!courant || courant.content === distant) {
          return 'inchange' as const;
        }

        this.files.setKey(filePath, { ...courant, content: distant });

        return 'adopte' as const;
      });
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
      setSelectedFile = vi.fn();
      updateFile = vi.fn();
      updateScrollPosition = vi.fn();
    },
  };
});

vi.mock('./terminal', async () => {
  const { atom } = await import('nanostores');

  return {
    TerminalStore: class {
      showTerminal = atom(true);
      boltTerminal = { ready: vi.fn(async () => undefined), terminal: {}, process: {} };
      setRuntime = vi.fn();
      toggleTerminal = vi.fn();
    },
  };
});

vi.mock('~/lib/persistence/agentPatchProposalSync', () => ({
  deleteAgentPatchProposalRemote: vi.fn(async () => undefined),
  fetchOpenAgentPatchProposals: vi.fn(async () => []),
  isTerminalAgentPatchStatus: () => false,
  putAgentPatchProposal: vi.fn(async () => undefined),
}));

describe('WorkbenchStore.setSelectedFile — relire le runtime à l’ouverture', () => {
  beforeEach(() => {
    distantMock.clear();
  });

  const CHEMIN = '/home/project/README.md';

  it('adopte la version du runtime quand le tampon local est périmé', async () => {
    const store = new WorkbenchStore();
    store.files.set({ [CHEMIN]: { type: 'file', content: '# QA', isBinary: false } });
    distantMock.set(CHEMIN, '# QA\nMARQUEUR-B');

    store.setSelectedFile(CHEMIN);
    await vi.waitFor(() => expect(store.files.get()[CHEMIN]).toMatchObject({ content: '# QA\nMARQUEUR-B' }));
  });

  it('n’écrase JAMAIS une frappe non enregistrée', async () => {
    const store = new WorkbenchStore();
    store.files.set({ [CHEMIN]: { type: 'file', content: 'ma frappe en cours', isBinary: false } });
    store.unsavedFiles.set(new Set([CHEMIN]));
    distantMock.set(CHEMIN, 'version du serveur');

    store.setSelectedFile(CHEMIN);
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(store.files.get()[CHEMIN]).toMatchObject({ content: 'ma frappe en cours' });
  });

  it('laisse le tampon intact quand le runtime est illisible', async () => {
    const store = new WorkbenchStore();
    store.files.set({ [CHEMIN]: { type: 'file', content: 'ce que j’avais', isBinary: false } });

    // Rien dans `distantMock` : la lecture échoue.
    store.setSelectedFile(CHEMIN);
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(store.files.get()[CHEMIN]).toMatchObject({ content: 'ce que j’avais' });
  });
});
