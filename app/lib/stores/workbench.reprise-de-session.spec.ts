/**
 * @vitest-environment jsdom
 *
 * UNE PROPOSITION RELUE DE LA BASE À LA RÉOUVERTURE N'EST PAS UNE PROPOSITION À APPLIQUER EN SILENCE.
 *
 * Mesuré en production le 2026-10-01 (projet cmupi39un…, tour coupé à 12:19,
 * onglet laissé) : la base garde, pour ce projet, une proposition figée en
 * `applying` avec le message « Impossible d'appliquer » — aucune page ne
 * l'applique, et `acceptAgentPatchProposal` ignore `applying` : coincée pour
 * toujours — et une proposition `pending` de 336 caractères pour un fichier
 * absent de la réponse finale. La synchronisation est « au mieux » : après une
 * coupure il n'y a pas de « prochaine modification » pour la rattraper.
 *
 * À la réouverture, ces lignes reviennent SANS ce qui les qualifiait dans la
 * page qui les a créées (`enFlux`, `tronquee`, `conflit` ne sont pas en base) :
 * l'application automatique appliquait un fragment, ou réécrasait la version
 * que l'utilisateur avait gardée lors d'un conflit.
 *
 * Harnais repris de workbench.conflit-utilisateur.spec.ts (vrai WorkbenchStore).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { shouldAutoApplyPatch } from '~/utils/agent-auto-apply';
import { buildReviewableDiffHunks } from '~/utils/diff';

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

const CHEMIN = '/home/project/src/App.tsx';
const ORIGINAL = 'export default function App() {\n  return <h1>Bonjour</h1>;\n}\n';
const FRAGMENT = 'export default function App() {\n  return <h1>Au rev';

function propositionEnBase(statut: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'artifact-1:a1',
    artifactId: 'artifact-1',
    messageId: 'assistant-1',
    actionId: 'a1',
    filePath: CHEMIN,
    relativePath: 'src/App.tsx',
    originalContent: ORIGINAL,
    status: statut,
    createdAt: '2026-10-01T12:19:00.000Z',
    updatedAt: '2026-10-01T12:19:10.000Z',
    ...extra,
    proposedContent: (extra.proposedContent as string | undefined) ?? FRAGMENT,
    hunks: buildReviewableDiffHunks('src/App.tsx', ORIGINAL, (extra.proposedContent as string | undefined) ?? FRAGMENT),
  };
}

async function rouvrir() {
  runtimeFiles.set('src/App.tsx', ORIGINAL);

  const store = new WorkbenchStore();
  await store.loadRuntimeFiles();
  store.setAgentPatchReviewRequired(true);
  store.configureProject('projet-1');
  await vi.waitFor(() => expect(Object.keys(store.agentPatchProposals.get())).toHaveLength(1));

  return store;
}

/* Ce que fait l'application automatique de BaseChat, avec SA règle (importée, pas recopiée), sur la proposition entière. */
function laReglePermettraitDAppliquer(store: WorkbenchStore) {
  const proposition = store.agentPatchProposals.get()['artifact-1:a1'];

  return shouldAutoApplyPatch({ ...proposition, autoApplyEnabled: true });
}

describe('à la réouverture, ce que la base a gardé d’un tour interrompu', () => {
  beforeEach(() => {
    runtimeFiles.clear();
    propositionsEnBase.length = 0;
  });

  it('une proposition `pending` relue n’est PAS appliquée automatiquement : elle attend la revue', async () => {
    propositionsEnBase.push(propositionEnBase('pending'));

    const store = await rouvrir();

    expect(laReglePermettraitDAppliquer(store)).toBe(false);
    expect(store.agentPatchProposals.get()['artifact-1:a1']?.status).toBe('pending');
    expect(runtimeFiles.get('src/App.tsx')).toBe(ORIGINAL);
  });

  it('une proposition figée en `applying` redevient acceptable : aucune page ne l’applique', async () => {
    propositionsEnBase.push(propositionEnBase('applying', { error: 'Impossible d’appliquer le patch de l’IA.' }));

    const store = await rouvrir();

    expect(store.agentPatchProposals.get()['artifact-1:a1']?.status).toBe('pending');
    expect(laReglePermettraitDAppliquer(store)).toBe(false);
  });

  it('l’utilisateur qui l’accepte en revue l’applique — c’est son choix', async () => {
    const complet = 'export default function App() {\n  return <h1>Au revoir</h1>;\n}\n';
    propositionsEnBase.push(propositionEnBase('applying', { proposedContent: complet }));

    const store = await rouvrir();

    await expect(store.acceptAgentPatchProposal('artifact-1:a1')).resolves.toBe('accepted');
    expect(runtimeFiles.get('src/App.tsx')).toBe(complet);
  });

  it('une proposition créée DANS cette page, fermée, reste applicable automatiquement', async () => {
    runtimeFiles.set('src/App.tsx', ORIGINAL);

    const store = new WorkbenchStore();
    await store.loadRuntimeFiles();
    store.setAgentPatchReviewRequired(true);
    store.configureProject('projet-1');
    store.addArtifact({
      id: 'artifact-1',
      artifactId: 'artifact-1',
      messageId: 'assistant-1',
      title: 'Generated app',
      type: 'bundled',
    } satisfies ArtifactCallbackData);

    const action = (content: string): ActionCallbackData => ({
      artifactId: 'artifact-1',
      messageId: 'assistant-1',
      actionId: 'a1',
      action: { type: 'file', filePath: 'src/App.tsx', content },
    });

    store.addAction(action(''));
    store.runAction(action(ORIGINAL.replace('Bonjour', 'Salut')));
    await vi.waitFor(() => expect(store.agentPatchProposals.get()['artifact-1:a1']?.status).toBe('pending'));

    expect(laReglePermettraitDAppliquer(store)).toBe(true);
  });
});
