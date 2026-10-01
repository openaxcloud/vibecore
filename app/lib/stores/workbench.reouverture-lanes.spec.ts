/**
 * @vitest-environment jsdom
 *
 * BUG-QA0929-REOUVERTURE-REJOUE, PAR LES SOUS-AGENTS.
 *
 * Mesuré en production le 2026-10-01 à 12:52 : à la réouverture d'un projet,
 * la page a renvoyé des propositions de sous-agents (`…::lane:devops-0:2`) et
 * importé des fichiers, alors que leur message était relu. Les écritures
 * historiques d'un message relu ne doivent JAMAIS être rejouées — elles
 * décrivent le passé, et l'utilisateur a pu modifier ces fichiers depuis.
 *
 * Harnais repris de workbench.reprise-de-session.spec.ts (vrai WorkbenchStore).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';

const { runtimeAdapterMock, runtimeFiles, editeurs, propositionsEnBase } = vi.hoisted(() => {
  const propositionsEnBase: unknown[] = [];
  const editeurs: Array<{ updateFile: (filePath: string, value: string) => void }> = [];
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
    propositionsEnBase,
    editeurs,
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

vi.mock('~/lib/persistence/agentPatchProposalSync', () => ({
  deleteAgentPatchProposalRemote: vi.fn(async () => undefined),
  fetchOpenAgentPatchProposals: vi.fn(async () => propositionsEnBase),
  isTerminalAgentPatchStatus: (status: string) => ['accepted', 'rejected', 'reverted'].includes(status),
  putAgentPatchProposal: vi.fn(async () => undefined),
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
        runtimeFiles.set(filePath.replace(/^\/home\/project\//, ''), content);
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
      constructor() {
        editeurs.push(this as unknown as { updateFile: (filePath: string, value: string) => void });
      }

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

const ORIGINAL = 'export default function App() {\n  return <h1>Version de l’utilisateur</h1>;\n}\n';
const ANCIENNE = 'export default function App() {\n  return <h1>Ancienne version de l’agent</h1>;\n}\n';

async function rouvrir() {
  runtimeFiles.set('src/App.tsx', ORIGINAL);

  const store = new WorkbenchStore();
  await store.loadRuntimeFiles();
  store.setAgentPatchReviewRequired(true);
  store.configureProject('projet-1');

  /* Le fil relu depuis le serveur, comme `applyTranscript` dans Chat.client. */
  store.markHydratedMessages(['aimsg_a1']);

  return store;
}

function ecrire(store: WorkbenchStore, messageId: string) {
  const artifactId = `${messageId}-artefact`;

  store.addArtifact({
    id: artifactId,
    artifactId,
    messageId,
    title: 'App',
    type: 'bundled',
  } satisfies ArtifactCallbackData);

  const action: ActionCallbackData = {
    artifactId,
    messageId,
    actionId: '0',
    action: { type: 'file', filePath: 'src/App.tsx', content: ANCIENNE },
  };

  store.addAction(action);
  store.runAction(action);

  return `${artifactId}:0`;
}

describe('à la réouverture, les sous-agents d’un message relu ne réécrivent rien', () => {
  beforeEach(() => {
    runtimeFiles.clear();
    propositionsEnBase.length = 0;
  });

  it('une écriture de SOUS-AGENT d’un message relu ne crée ni proposition ni écriture', async () => {
    const store = await rouvrir();
    const id = ecrire(store, 'aimsg_a1::lane:devops');

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(store.agentPatchProposals.get()[id]).toBeUndefined();
    expect(runtimeFiles.get('src/App.tsx')).toBe(ORIGINAL);
  });

  it('TÉMOIN POSITIF — un sous-agent d’un message produit dans cette page propose bien son écriture', async () => {
    const store = await rouvrir();
    const id = ecrire(store, 'm-en-direct::lane:devops');

    await vi.waitFor(() => expect(store.agentPatchProposals.get()[id]?.status).toBe('pending'));
  });
});
