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

const synchro = vi.hoisted(() => ({
  envois: [] as Array<{ id: string; status: string; longueur: number }>,
  suppressions: [] as string[],
}));

vi.mock('~/lib/persistence/agentPatchProposalSync', () => ({
  isTerminalAgentPatchStatus: (status: string) => ['accepted', 'rejected', 'reverted'].includes(status),
  fetchOpenAgentPatchProposals: vi.fn(async () => []),
  putAgentPatchProposal: vi.fn(
    async (_projet: string, proposition: { id: string; status: string; proposedContent: string }) => {
      synchro.envois.push({
        id: proposition.id,
        status: proposition.status,
        longueur: proposition.proposedContent.length,
      });
    },
  ),
  deleteAgentPatchProposalRemote: vi.fn(async (_projet: string, id: string) => {
    synchro.suppressions.push(id);
  }),
}));

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

const ORIGINAL =
  '<!doctype html>\n<html lang="en">\n  <head><title>Vite</title></head>\n  <body><div id="root"></div></body>\n</html>\n';

const COMPLET =
  '<!doctype html>\n<html lang="en">\n  <head><title>Bonjour Avi</title></head>\n  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * LE FLOT D'ENVOIS PENDANT LE FLUX.
 *
 * Mesuré en production le 2026-10-01 dans les journaux nginx : 2 304 et 2 027
 * `PUT /agent-patch-proposals` pendant deux premiers projets de cinq minutes —
 * chaque morceau du flux renvoyait au serveur la proposition ENTIÈRE (contenu
 * d'origine, contenu proposé, différences). Une proposition en cours
 * d'écriture n'a rien à persister : elle n'est ni finie ni applicable (#659).
 */
describe('une proposition en cours d’écriture n’est pas envoyée au serveur', () => {
  beforeEach(() => {
    runtimeFiles.clear();
    synchro.envois.length = 0;
    synchro.suppressions.length = 0;
  });

  it('aucun envoi pendant le flux ; la version finale est envoyée, une fois', async () => {
    runtimeFiles.set('index.html', ORIGINAL);

    const store = new WorkbenchStore();
    store.configureProject('projet-1');
    await store.loadRuntimeFiles();
    store.setAgentPatchReviewRequired(true);
    store.addArtifact(artifactData());
    store.addAction(fileAction('a1', '', 'index.html'));

    for (const fin of [32, 70, 110, 150]) {
      store.runAction(fileAction('a1', COMPLET.slice(0, fin), 'index.html'), true);
      await pause(150);
    }

    expect(synchro.envois).toEqual([]);

    store.runAction(fileAction('a1', COMPLET, 'index.html'));
    await vi.waitFor(() => expect(actionStatus(store, 'a1')).toBe('complete'));
    await pause(100);

    expect(synchro.envois).toEqual([{ id: 'artifact-1:a1', status: 'pending', longueur: COMPLET.length }]);
  });
});
