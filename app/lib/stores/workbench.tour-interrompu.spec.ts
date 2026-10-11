/**
 * @vitest-environment jsdom
 *
 * LE TOUR INTERROMPU, ONGLET FERMÉ : SES FICHIERS N'ÉTAIENT JAMAIS ÉCRITS.
 *
 * Mesuré en production le 2026-10-01 à 12:48 (projets cmupj5bfb…, cmupj5r9b…,
 * deux essais sur deux) : la connexion tombe, l'utilisateur ferme l'onglet, le
 * serveur va au bout (25 459 et 22 221 caractères, 13 fichiers). À la
 * réouverture, le message relu est — à raison — protégé contre le rejeu
 * (BUG-QA0929) : personne n'écrit ses fichiers. Le projet reste à moitié
 * construit, `App.tsx` d'origine à côté de composants que rien n'utilise.
 *
 * Le navigateur qui a vu le tour partir et pas finir le sait (marque locale
 * `tour-en-cours`). Pour CE message seulement : ses fichiers deviennent des
 * propositions EN REVUE — jamais appliquées en silence, l'utilisateur a pu
 * travailler ailleurs entre-temps — et ses commandes ne sont pas relancées.
 *
 * Harnais repris de workbench.reprise-de-session.spec.ts (vrai WorkbenchStore).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { shouldAutoApplyPatch } from '~/utils/agent-auto-apply';

const { runtimeAdapterMock, runtimeFiles, editeurs, propositionsEnBase, commandesDuTerminal } = vi.hoisted(() => {
  const commandesDuTerminal = { appels: [] as string[] };
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
    commandesDuTerminal,
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
        executeCommand: vi.fn(async (_id: string, commande: string) => {
          commandesDuTerminal.appels.push(commande);

          return { exitCode: 0, output: '' };
        }),
      };

      setRuntime = vi.fn();

      toggleTerminal = vi.fn();
    },
  };
});

const ORIGINAL = 'export default function App() {\n  return <h1>Vite</h1>;\n}\n';
const DE_L_AGENT = 'export default function App() {\n  return <h1>Mes tâches</h1>;\n}\n';

async function rouvrir() {
  runtimeFiles.set('src/App.tsx', ORIGINAL);
  runtimeFiles.set('src/main.tsx', 'import App from "./App";\n');

  const store = new WorkbenchStore();
  await store.loadRuntimeFiles();
  store.setAgentPatchReviewRequired(true);
  store.configureProject('projet-1');
  store.markHydratedMessages(['aimsg_u1', 'aimsg_a1']);

  return store;
}

function action(store: WorkbenchStore, messageId: string, actionId: string, a: ActionCallbackData['action']) {
  const artifactId = `${messageId}-artefact`;

  store.addArtifact({
    id: artifactId,
    artifactId,
    messageId,
    title: 'App',
    type: 'bundled',
  } satisfies ArtifactCallbackData);

  const data: ActionCallbackData = { artifactId, messageId, actionId, action: a };

  store.addAction(data);
  store.runAction(data);

  return `${artifactId}:${actionId}`;
}

const attendre = () => new Promise((resolve) => setTimeout(resolve, 200));

describe('à la réouverture, le tour que CE navigateur n’a pas vu finir', () => {
  beforeEach(() => {
    runtimeFiles.clear();
    propositionsEnBase.length = 0;
    runtimeAdapterMock.streamCommand.mockClear();
    runtimeAdapterMock.runCommand.mockClear();
    commandesDuTerminal.appels.length = 0;
  });

  it('LE CONSTAT : sans reprise, un message relu n’écrit rien — le projet reste à moitié construit', async () => {
    const store = await rouvrir();
    const id = action(store, 'aimsg_a1', '0', { type: 'file', filePath: 'src/App.tsx', content: DE_L_AGENT });
    await attendre();

    expect(store.agentPatchProposals.get()[id]).toBeUndefined();
    expect(runtimeFiles.get('src/App.tsx')).toBe(ORIGINAL);
  });

  it('repris : ses fichiers arrivent EN REVUE, jamais appliqués en silence', async () => {
    const store = await rouvrir();
    store.reprendreLeTourInterrompu('aimsg_a1');

    const id = action(store, 'aimsg_a1', '0', { type: 'file', filePath: 'src/App.tsx', content: DE_L_AGENT });
    await vi.waitFor(() => expect(store.agentPatchProposals.get()[id]?.status).toBe('pending'));

    const proposition = store.agentPatchProposals.get()[id];
    expect(shouldAutoApplyPatch({ ...proposition, autoApplyEnabled: true })).toBe(false);
    expect(runtimeFiles.get('src/App.tsx')).toBe(ORIGINAL);

    await expect(store.acceptAgentPatchProposal(id)).resolves.toBe('accepted');
    expect(runtimeFiles.get('src/App.tsx')).toBe(DE_L_AGENT);
  });

  it('repris : ses sous-agents aussi', async () => {
    const store = await rouvrir();
    store.reprendreLeTourInterrompu('aimsg_a1');

    const id = action(store, 'aimsg_a1::lane:frontend', '0', {
      type: 'file',
      filePath: 'src/App.tsx',
      content: DE_L_AGENT,
    });
    await vi.waitFor(() => expect(store.agentPatchProposals.get()[id]?.status).toBe('pending'));
  });

  it('repris : un fichier déjà identique ne produit aucune proposition', async () => {
    const store = await rouvrir();
    store.reprendreLeTourInterrompu('aimsg_a1');

    const id = action(store, 'aimsg_a1', '0', { type: 'file', filePath: 'src/App.tsx', content: ORIGINAL });
    await attendre();

    expect(store.agentPatchProposals.get()[id]).toBeUndefined();
  });

  it('repris : ses commandes ne sont pas relancées', async () => {
    const store = await rouvrir();
    store.reprendreLeTourInterrompu('aimsg_a1');

    action(store, 'aimsg_a1', '1', { type: 'shell', content: 'npx prisma db seed' });
    await attendre();

    expect(commandesDuTerminal.appels).toEqual([]);
  });

  it('TÉMOIN POSITIF DE L’INSTRUMENT — une commande d’un message produit dans la page passe bien par ce terminal', async () => {
    const store = await rouvrir();

    action(store, 'm-en-direct', '1', { type: 'shell', content: 'npm run build' });
    await vi.waitFor(() => expect(commandesDuTerminal.appels).toContain('npm run build'));
  });

  it('repris, même quand l’écriture directe est en vigueur (pas de revue demandée) : EN REVUE quand même', async () => {
    const store = await rouvrir();
    store.setAgentPatchReviewRequired(false);
    store.reprendreLeTourInterrompu('aimsg_a1');

    const id = action(store, 'aimsg_a1', '0', { type: 'file', filePath: 'src/App.tsx', content: DE_L_AGENT });
    await vi.waitFor(() => expect(store.agentPatchProposals.get()[id]?.status).toBe('pending'));

    expect(runtimeFiles.get('src/App.tsx')).toBe(ORIGINAL);
  });

  it('un AUTRE message relu reste protégé', async () => {
    const store = await rouvrir();
    store.reprendreLeTourInterrompu('aimsg_a1');

    const id = action(store, 'aimsg_u1', '0', { type: 'file', filePath: 'src/App.tsx', content: DE_L_AGENT });
    await attendre();

    expect(store.agentPatchProposals.get()[id]).toBeUndefined();
  });
});
