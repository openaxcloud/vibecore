/**
 * @vitest-environment jsdom
 *
 * CONFLIT UTILISATEUR / AGENT — ce que l'utilisateur enregistre fait foi.
 *
 * Mesuré en production le 2026-10-01 (`conflit.mjs`, trois essais sur trois) :
 * l'utilisateur ajoute une ligne à `src/App.tsx` et l'enregistre PENDANT que
 * l'agent écrit ce fichier ; à la fin du tour, l'espace de travail ET la copie
 * enregistrée portent la version de l'agent, sans la ligne de l'utilisateur, et
 * rien ne le lui dit. Cause : à l'acceptation, `reconcileRemoteWrite` donne la
 * victoire à l'agent pour tout fichier non JSON.
 *
 * Décision d'Avi : l'agent relit le fichier avant d'écrire ; s'il a changé
 * depuis sa lecture, il refait sa modification sur la version à jour, ou la
 * présente en revue — jamais d'écrasement silencieux.
 *
 * Harnais repris de workbench.modification-en-flux.spec.ts (vrai WorkbenchStore).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { autoApplyAttemptKey, shouldAutoApplyPatch } from '~/utils/agent-auto-apply';

const { runtimeAdapterMock, runtimeFiles, editeurs } = vi.hoisted(() => {
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

const BASE = [
  'export default function App() {',
  '  return (',
  '    <main>',
  '      <h1>Compteur</h1>',
  '    </main>',
  '  );',
  '}',
  '',
].join('\n');

const AVEC_BOUTON = BASE.replace(
  '      <h1>Compteur</h1>\n',
  '      <h1>Compteur</h1>\n      <button>Remise à zéro</button>\n',
);

const MARQUEUR = '// MARQUEUR-UTILISATEUR\n';

function actionFichier(content: string, actionId = 'a1'): ActionCallbackData {
  return {
    artifactId: 'artifact-1',
    messageId: 'assistant-1',
    actionId,
    action: { type: 'file', filePath: 'src/App.tsx', content },
  };
}

/* Ce que fait l'application automatique de BaseChat, avec SA règle (importée, pas recopiée). */
function piloteDApplicationAutomatique(store: WorkbenchStore) {
  const tentees = new Map<string, string>();

  let chaine: Promise<unknown> = Promise.resolve();

  const desabonner = store.agentPatchProposals.subscribe(() => {
    for (const proposition of Object.values(store.agentPatchProposals.get())) {
      const cle = autoApplyAttemptKey(proposition);

      if (tentees.get(proposition.id) === cle) {
        continue;
      }

      if (
        !shouldAutoApplyPatch({
          autoApplyEnabled: true,
          status: proposition.status,
          enFlux: proposition.enFlux,
          tronquee: proposition.tronquee,
          conflit: proposition.conflit,
        })
      ) {
        continue;
      }

      tentees.set(proposition.id, cle);
      chaine = chaine.then(() => store.acceptAgentPatchProposal(proposition.id));
    }
  });

  return { attendre: () => chaine, desabonner };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function laisserFinir(pilote: { attendre: () => Promise<unknown> }) {
  for (let i = 0; i < 3; i++) {
    await pause(150);
    await pilote.attendre();
  }
}

async function preparer() {
  runtimeFiles.set('src/App.tsx', BASE);
  editeurs.length = 0;

  const store = new WorkbenchStore();
  await store.loadRuntimeFiles();
  store.setAgentPatchReviewRequired(true);
  store.addArtifact({
    id: 'artifact-1',
    artifactId: 'artifact-1',
    messageId: 'assistant-1',
    title: 'Generated app',
    type: 'bundled',
  } satisfies ArtifactCallbackData);

  return { store, pilote: piloteDApplicationAutomatique(store) };
}

/* L'utilisateur tape dans l'éditeur, puis clique « Enregistrer ». */
async function enregistrementUtilisateur(store: WorkbenchStore, contenu: string) {
  editeurs.at(-1)?.updateFile(CHEMIN, contenu);
  await store.saveFile(CHEMIN);
}

/* L'agent écrit `src/App.tsx` : deux morceaux en flux, puis la vraie fermeture. */
async function agentEcrit(
  store: WorkbenchStore,
  pilote: { attendre: () => Promise<unknown> },
  contenu: string,
  pendant?: () => Promise<void>,
  actionId = 'a1',
) {
  store.addAction(actionFichier('', actionId));
  store.runAction(actionFichier(contenu.slice(0, 40), actionId), true);
  await pause(100);

  if (pendant) {
    await pendant();
  }

  store.runAction(actionFichier(contenu.slice(0, 90), actionId), true);
  await pause(100);
  store.runAction(actionFichier(contenu, actionId));
  await laisserFinir(pilote);
}

describe('ce que l’utilisateur enregistre fait foi', () => {
  beforeEach(() => {
    runtimeFiles.clear();
  });

  it('l’utilisateur enregistre PENDANT que l’agent écrit : sa ligne ET le bouton de l’agent survivent (cas mesuré en production)', async () => {
    const { store, pilote } = await preparer();

    store.noterLaLectureDeLAgent();
    await agentEcrit(store, pilote, AVEC_BOUTON, () => enregistrementUtilisateur(store, `${BASE}${MARQUEUR}`));
    pilote.desabonner();

    expect(runtimeFiles.get('src/App.tsx')).toBe(`${AVEC_BOUTON}${MARQUEUR}`);
    expect(store.agentPatchProposals.get()['artifact-1:a1']?.status).toBe('accepted');
  });

  it('l’utilisateur enregistre APRÈS l’envoi mais AVANT le premier morceau : l’agent, qui ne l’a pas lu, ne l’efface pas', async () => {
    const { store, pilote } = await preparer();

    store.noterLaLectureDeLAgent();
    await enregistrementUtilisateur(store, `${BASE}${MARQUEUR}`);
    await agentEcrit(store, pilote, AVEC_BOUTON);
    pilote.desabonner();

    expect(runtimeFiles.get('src/App.tsx')).toBe(`${AVEC_BOUTON}${MARQUEUR}`);
  });

  it('les deux modifications ne se combinent pas : la version de l’utilisateur reste, la proposition attend en revue, l’utilisateur est prévenu', async () => {
    const { store, pilote } = await preparer();
    const versionUtilisateur = BASE.replace('Compteur', 'Mon compteur à moi');

    store.noterLaLectureDeLAgent();
    await agentEcrit(store, pilote, AVEC_BOUTON.replace('Compteur', 'Compteur de l’agent'), () =>
      enregistrementUtilisateur(store, versionUtilisateur),
    );
    pilote.desabonner();

    expect(runtimeFiles.get('src/App.tsx')).toBe(versionUtilisateur);
    expect(store.agentPatchProposals.get()['artifact-1:a1']).toMatchObject({ status: 'pending', conflit: true });
    expect(store.actionAlert.get()?.description).toContain('src/App.tsx');
  });

  it('accepter ensuite la proposition en conflit, c’est le choix de l’utilisateur : elle s’applique', async () => {
    const { store, pilote } = await preparer();
    const versionAgent = AVEC_BOUTON.replace('Compteur', 'Compteur de l’agent');

    store.noterLaLectureDeLAgent();
    await agentEcrit(store, pilote, versionAgent, () =>
      enregistrementUtilisateur(store, BASE.replace('Compteur', 'Mon compteur à moi')),
    );
    pilote.desabonner();

    await expect(store.acceptAgentPatchProposal('artifact-1:a1')).resolves.toBe('accepted');
    expect(runtimeFiles.get('src/App.tsx')).toBe(versionAgent);
  });

  it('l’utilisateur avait enregistré AVANT l’envoi : l’agent l’a lu, sa version s’applique telle quelle', async () => {
    const { store, pilote } = await preparer();
    const lu = `${BASE}${MARQUEUR}`;

    await enregistrementUtilisateur(store, lu);
    store.noterLaLectureDeLAgent();
    await agentEcrit(store, pilote, `${AVEC_BOUTON}${MARQUEUR}`);
    pilote.desabonner();

    expect(runtimeFiles.get('src/App.tsx')).toBe(`${AVEC_BOUTON}${MARQUEUR}`);
  });

  it('deux écritures de L’AGENT sur le même fichier ouvert : la seconde s’applique — l’agent ne se prend pas pour l’utilisateur', async () => {
    const { store, pilote } = await preparer();

    /* Le fichier est ouvert dans l'éditeur, sans modification : l'acceptation passe par `saveFile`. */
    editeurs.at(-1)?.updateFile(CHEMIN, BASE);
    store.noterLaLectureDeLAgent();
    await agentEcrit(store, pilote, BASE.replace('Compteur', 'Premier'));
    await agentEcrit(store, pilote, BASE.replace('Compteur', 'Second'), undefined, 'a2');
    pilote.desabonner();

    expect(runtimeFiles.get('src/App.tsx')).toBe(BASE.replace('Compteur', 'Second'));
    expect(store.agentPatchProposals.get()['artifact-1:a2']?.status).toBe('accepted');
  });
});
