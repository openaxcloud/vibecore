/**
 * @vitest-environment jsdom
 *
 * Harnais repris de workbench.patch-flood.spec.ts (BUG-SELFREPAIR-RUNAWAY-LOOP-001) — integration coverage on the REAL
 * WorkbenchStore pipeline for the runaway auto-repair loop observed live
 * (24/08, prod): re-emitted file actions (fresh actionIds, identical bytes)
 * each became a new pending proposal, the silent auto-apply accepted every
 * one ("AI patch accepted" ×90 for one CSS file), and the `start` action was
 * skipped-as-"Done" behind the never-draining review queue, so `npm run dev`
 * never ran and the preview stayed unreachable.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { autoApplyAttemptKey, shouldAutoApplyPatch } from '~/utils/agent-auto-apply';

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

function actionStatus(store: WorkbenchStore, actionId: string) {
  return store.artifacts.get()['artifact-1']?.runner.actions.get()[actionId]?.status;
}

/*
 * UNE MODIFICATION DE FICHIER EXISTANT N'ARRIVE QU'EN PARTIE.
 *
 * Mesuré en production le 2026-10-01, trois fois sur trois, mode Agent (revue
 * des modifications + application automatique) : « Change le titre en Bonjour
 * Avi » laisse dans l'espace de travail un `index.html` réduit à ses premières
 * lignes ; deux fois `src/App.tsx` réduit à `import {`. La version complète de
 * l'agent n'arrive jamais ; le bandeau annonce « fichiers appliqués ».
 *
 * Le pilote ci-dessous fait ce que fait l'application automatique de BaseChat :
 * à chaque changement des propositions, il accepte toute proposition `pending`.
 */
/*
 * Le pilote fait ce que fait l'application automatique de BaseChat, avec SA
 * règle (`shouldAutoApplyPatch`, importée — pas recopiée) : à chaque changement
 * des propositions, il accepte celles que la règle déclare applicables.
 */
function piloteDApplicationAutomatique(store: WorkbenchStore) {
  const tentees = new Map<string, string>();

  let chaine: Promise<unknown> = Promise.resolve();

  const tenter = () => {
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
        })
      ) {
        continue;
      }

      tentees.set(proposition.id, cle);
      chaine = chaine.then(() => store.acceptAgentPatchProposal(proposition.id));
    }
  };

  const desabonner = store.agentPatchProposals.subscribe(tenter);

  return { attendre: () => chaine, desabonner };
}

const ORIGINAL =
  '<!doctype html>\n<html lang="en">\n  <head><title>Vite</title></head>\n  <body><div id="root"></div></body>\n</html>\n';

const COMPLET =
  '<!doctype html>\n<html lang="en">\n  <head><title>Bonjour Avi</title></head>\n  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function preparer() {
  runtimeFiles.set('index.html', ORIGINAL);

  const store = new WorkbenchStore();
  await store.loadRuntimeFiles();
  store.setAgentPatchReviewRequired(true);
  store.addArtifact(artifactData());

  const pilote = piloteDApplicationAutomatique(store);
  store.addAction(fileAction('a1', '', 'index.html'));

  return { store, pilote };
}

/* Le flux : trois morceaux, chacun le contenu reçu jusque-là, laissés le temps d'être appliqués. */
async function streamer(store: WorkbenchStore, pilote: { attendre: () => Promise<unknown> }, jusqua: number) {
  for (const fin of [32, 70, jusqua]) {
    store.runAction(fileAction('a1', COMPLET.slice(0, fin), 'index.html'), true);
    await pause(150);
    await pilote.attendre();
  }
}

async function laisserFinir(pilote: { attendre: () => Promise<unknown> }) {
  for (let i = 0; i < 3; i++) {
    await pause(200);
    await pilote.attendre();
  }
}

describe('une modification de fichier existant arrive EN ENTIER', () => {
  beforeEach(() => {
    runtimeFiles.clear();
    runtimeAdapterMock.writeFile.mockClear();
  });

  it('pendant le flux, rien n’est appliqué : la proposition n’est pas finie', async () => {
    const { store, pilote } = await preparer();
    await streamer(store, pilote, 110);

    expect(store.agentPatchProposals.get()['artifact-1:a1']).toMatchObject({ status: 'pending', enFlux: true });
    expect(runtimeFiles.get('index.html')).toBe(ORIGINAL);
    expect(actionStatus(store, 'a1')).not.toBe('complete');
    pilote.desabonner();
  });

  it('après la VRAIE fermeture, l’espace de travail porte la version COMPLÈTE', async () => {
    const { store, pilote } = await preparer();
    await streamer(store, pilote, 110);

    store.runAction(fileAction('a1', COMPLET, 'index.html'));
    await vi.waitFor(() => expect(actionStatus(store, 'a1')).toBe('complete'));
    await laisserFinir(pilote);
    pilote.desabonner();

    expect((runtimeFiles.get('index.html') ?? '').trim()).toBe(COMPLET.trim());
    expect(store.agentPatchProposals.get()['artifact-1:a1']?.status).toBe('accepted');
  });

  it('une écriture INTERROMPUE n’applique pas le fragment, reste visible, et le rattrapage la complète', async () => {
    const { store, pilote } = await preparer();
    await streamer(store, pilote, 110);

    /* La connexion tombe : le filet de fin de flux referme l'action avec ce qu'il a reçu. */
    store.runAction({ ...fileAction('a1', COMPLET.slice(0, 110), 'index.html'), fermetureDeSecours: true });
    await laisserFinir(pilote);

    expect(runtimeFiles.get('index.html')).toBe(ORIGINAL);
    expect(store.agentPatchProposals.get()['artifact-1:a1']).toMatchObject({ status: 'pending', tronquee: true });

    /* Le rattrapage rejoue la réponse complète : la vraie fermeture arrive. */
    store.autoriserLaReprise('assistant-1');
    store.runAction(fileAction('a1', COMPLET, 'index.html'));
    await laisserFinir(pilote);
    pilote.desabonner();

    expect((runtimeFiles.get('index.html') ?? '').trim()).toBe(COMPLET.trim());
  });
});
