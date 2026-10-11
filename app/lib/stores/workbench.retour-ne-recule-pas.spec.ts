/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import type { ArtifactCallbackData } from '~/lib/runtime/message-parser';

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

/*
 * BUG-QA1001-RETOUR-PERD-LES-MODIFICATIONS — mesuré le 2026-10-01 sur le chemin
 * d'écriture de la production (vrai workspace-manager, vrai Kubernetes, `main`
 * 81a4e8c5d) : 10 réouvertures sur 10, la copie SERVEUR du projet repassait à la
 * version de l'agent, dans les 5 s, par `POST …/files/import/zip` avec
 * `replaceExisting: true`. L'écran restait juste ; c'est quand l'espace était
 * recréé (ramassage : 30 min puis 24 h) que le travail de l'utilisateur
 * disparaissait.
 *
 * Un artefact REJOUÉ à la réouverture n'écrit rien — ses actions sont sautées.
 * Il n'a donc rien de neuf à enregistrer, et un enregistrement destructif à sa
 * fermeture ne peut que faire reculer la copie serveur.
 */
describe('réouverture — un artefact rejoué ne remplace pas la copie serveur du projet', () => {
  const imports: string[] = [];

  beforeEach(() => {
    runtimeFiles.clear();
    imports.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/files/import/zip')) {
          imports.push(String(url));
        }

        return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );
    runtimeFiles.set('src/App.tsx', 'export default function App() { return <h1>Agent</h1>; }\n');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /*
   * Le projet est relié AVANT que le fil soit marqué, comme dans l'application :
   * `configureProject` oublie les messages rechargés du projet précédent.
   */
  function nouveauMagasin() {
    const store = new WorkbenchStore();

    store.configureProject('projet-1');

    return store;
  }

  async function fermerUnArtefact(store: WorkbenchStore, messageId: string) {
    const artefact = artifactData(messageId);

    store.addArtifact(artefact);
    await store.loadRuntimeFiles('.');
    store.updateArtifact(artefact, { closed: true });

    // La file d'exécution est vide quand le journal annonce la fin de la fermeture.
    await vi.waitFor(() => {
      expect(runtimeAdapterMock.listFiles).toHaveBeenCalled();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  it('message relu depuis le serveur à la réouverture : AUCUN import destructif vers la copie serveur', async () => {
    const store = nouveauMagasin();

    store.markHydratedMessages(['assistant-1']);
    await fermerUnArtefact(store, 'assistant-1');

    // Mesuré AVANT correctif : 1 import `replaceExisting` par artefact rejoué.
    expect(imports).toEqual([]);
  });

  it('message du cache local (même appareil) : même règle', async () => {
    const store = nouveauMagasin();

    store.setReloadedMessages(['assistant-1']);
    await fermerUnArtefact(store, 'assistant-1');

    expect(imports).toEqual([]);
  });

  it('contre-épreuve — un artefact NEUF est toujours enregistré : l’app tout juste générée n’est pas perdue', async () => {
    const store = nouveauMagasin();

    store.markHydratedMessages(['assistant-ancien']);
    await fermerUnArtefact(store, 'assistant-neuf');

    expect(imports).toEqual(['/api/projects/projet-1/files/import/zip']);
  });

  it('contre-épreuve — un message RATTRAPÉ après une coupure est enregistré : ses fichiers interrompus viennent d’être écrits', async () => {
    const store = nouveauMagasin();

    store.markHydratedMessages(['assistant-1']);
    store.autoriserLaReprise('assistant-1');
    await fermerUnArtefact(store, 'assistant-1');

    expect(imports).toEqual(['/api/projects/projet-1/files/import/zip']);
  });
});
