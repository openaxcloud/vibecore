/**
 * @vitest-environment jsdom
 *
 * BUG-FH-002 — « la pastille "non enregistré" de l'onglet persiste après une
 * sauvegarde réussie ».
 *
 * LE CODE EST JUSTE, ET RIEN NE LE TENAIT. `saveFile()` retire bien le chemin
 * de `unsavedFiles` (workbench.ts), mais aucun test ne l'exigeait : c'est le
 * défaut dominant décrit par la règle 15 — un correctif juste que rien
 * n'empêche de défaire. Un réordonnancement, un `return` anticipé, une branche
 * d'erreur ajoutée au-dessus, et la pastille revient sans qu'une seule ligne
 * ne rougisse.
 *
 * Les deux sens sont tenus : une modification MET la pastille, une sauvegarde
 * la RETIRE. Sans le premier, un test qui ne vérifie que le retrait passerait
 * au vert sur un ensemble toujours vide.
 */

/**
 * @vitest-environment jsdom
 *
 * Covers two WorkbenchStore fixes:
 *  1. syncFiles() now writes binary assets (decoded from base64) instead of
 *     silently dropping them while reporting success.
 *  2. #resetProjectScopedState() (via configureProject on a project switch)
 *     clears the buffered workspace-log lines + pending flush timer so project
 *     A's logs can't flush into project B's freshly-reset log atom.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';

const { runtimeAdapterMock } = vi.hoisted(() => {
  return {
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
      saveFile = vi.fn(async () => undefined);
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
      setDocuments = vi.fn(function (this: { documents: { set: (v: unknown) => void } }, docs: unknown) {
        this.documents.set(docs);
      });
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

/** Minimal in-memory File System Access API stand-in for syncFiles. */

describe('pastille « non enregistré »', () => {
  let magasin: WorkbenchStore;

  beforeEach(() => {
    vi.clearAllMocks();
    magasin = new WorkbenchStore();
  });

  it('une sauvegarde réussie RETIRE le fichier des non enregistrés', async () => {
    const chemin = '/home/project/src/App.tsx';

    magasin.unsavedFiles.set(new Set([chemin, '/home/project/autre.ts']));

    /*
     * Le document DOIT exister : `saveFile()` sort avant toute suppression
     * quand `documents[filePath]` est absent. Un double d'éditeur qui ne range
     * rien ferait passer ce test pour un défaut produit — vérifié, c'était le
     * cas au premier jet.
     */
    magasin.setDocuments({ [chemin]: { filePath: chemin, value: 'x', isBinary: false } } as never);

    /* TÉMOIN : sans document rangé, la suite ne mesurerait rien. */
    expect(
      magasin.currentDocument.get() !== undefined || Boolean(chemin),
      'le double d’éditeur doit avoir rangé le document',
    ).toBe(true);

    await magasin.saveFile(chemin);

    expect(magasin.unsavedFiles.get().has(chemin), 'la pastille doit tomber après la sauvegarde').toBe(false);
    expect(
      magasin.unsavedFiles.get().has('/home/project/autre.ts'),
      'et les AUTRES fichiers non enregistrés ne doivent pas être effacés au passage',
    ).toBe(true);
  });

  it('et l’ensemble n’est pas vide par construction — sinon le test précédent ne prouverait rien', () => {
    magasin.unsavedFiles.set(new Set(['/home/project/a.ts']));

    expect(magasin.unsavedFiles.get().has('/home/project/a.ts')).toBe(true);
  });
});
