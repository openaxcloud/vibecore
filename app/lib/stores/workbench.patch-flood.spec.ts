/**
 * @vitest-environment jsdom
 *
 * BUG-SELFREPAIR-RUNAWAY-LOOP-001 — integration coverage on the REAL
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

function startAction(actionId = 'start-1'): ActionCallbackData {
  return {
    artifactId: 'artifact-1',
    messageId: 'assistant-1',
    actionId,
    action: {
      type: 'start',
      content: 'npm run dev',
    },
  };
}

function actionStatus(store: WorkbenchStore, actionId: string) {
  return store.artifacts.get()['artifact-1']?.runner.actions.get()[actionId]?.status;
}

function pendingProposals(store: WorkbenchStore) {
  return Object.values(store.agentPatchProposals.get()).filter((proposal) => proposal.status === 'pending');
}

describe('WorkbenchStore agent-patch flood guard (BUG-SELFREPAIR-RUNAWAY-LOOP-001)', () => {
  beforeEach(() => {
    runtimeFiles.clear();
    runtimeAdapterMock.writeFile.mockClear();
    runtimeAdapterMock.streamCommand.mockReset();
    runtimeAdapterMock.streamCommand.mockImplementation(async function* () {
      yield { type: 'exit' as const, exitCode: 0 };
    });
  });

  it('collapses 90 re-emitted identical file actions into ONE proposal and ONE "AI patch accepted"', async () => {
    const content = "export const greeting = 'Hello';\n";
    const store = new WorkbenchStore();

    store.setAgentPatchReviewRequired(true);
    store.addArtifact(artifactData());

    // The live storm: the generator re-emits the SAME bytes under fresh actionIds.
    for (let attempt = 0; attempt < 90; attempt++) {
      const action = fileAction(`file-${attempt}`, content);
      store.addAction(action);
      store.runAction(action);
    }

    await vi.waitFor(() => {
      expect(actionStatus(store, 'file-89')).toBe('complete');
    });

    // Before the guard: 90 proposals, 90 silent accepts. Now: exactly one.
    expect(Object.keys(store.agentPatchProposals.get())).toEqual(['artifact-1:file-0']);

    const result = await store.acceptAgentPatchProposal('artifact-1:file-0');
    expect(result).toBe('accepted');

    store.flushWorkspaceLogs();

    const logs = store.workspaceLogs.get();
    const acceptedLogs = logs.filter((line) => line.includes('AI patch accepted: src/config.ts'));
    expect(acceptedLogs).toHaveLength(1);
    expect(logs.some((line) => line.includes('skipped: identical to the content already applied'))).toBe(true);
  });

  it('bounds a non-converging distinct-content loop and escalates instead of looping', async () => {
    const store = new WorkbenchStore();

    store.setAgentPatchReviewRequired(true);
    store.addArtifact(artifactData());

    for (let attempt = 0; attempt < 8; attempt++) {
      const action = fileAction(`file-${attempt}`, `export const attempt = ${attempt};\n`);
      store.addAction(action);
      store.runAction(action);
    }

    await vi.waitFor(() => {
      expect(actionStatus(store, 'file-7')).toBe('complete');
    });

    const proposals = Object.values(store.agentPatchProposals.get());

    // Only the per-file limit's worth of proposals was ever admitted…
    expect(proposals).toHaveLength(6);

    // …and hitting the bound failed the open queue and escalated with a clear alert.
    expect(pendingProposals(store)).toHaveLength(0);
    expect(proposals.every((proposal) => proposal.status === 'failed')).toBe(true);
    expect(store.actionAlert.get()?.title).toBe('Automatic AI repair paused');

    store.flushWorkspaceLogs();
    expect(store.workspaceLogs.get().some((line) => line.includes('AI auto-repair paused for src/config.ts'))).toBe(
      true,
    );
  });

  it('runs the deferred start command once the review queue drains (accept path)', async () => {
    const store = new WorkbenchStore();
    const startSpy = vi.spyOn(store, 'startPreviewServer').mockResolvedValue('npm run dev');

    store.setAgentPatchReviewRequired(true);
    store.addArtifact(artifactData());

    const file = fileAction('file-1', "export const greeting = 'Hello';\n");
    store.addAction(file);
    store.runAction(file);

    await vi.waitFor(() => {
      expect(store.agentPatchProposals.get()['artifact-1:file-1']?.status).toBe('pending');
    });

    const start = startAction();
    store.addAction(start);
    store.runAction(start);

    await vi.waitFor(() => {
      expect(actionStatus(store, 'start-1')).toBe('complete');
    });

    // The start was skipped ("Done") while the review queue was open — not launched.
    expect(startSpy).not.toHaveBeenCalled();

    const result = await store.acceptAgentPatchProposal('artifact-1:file-1');
    expect(result).toBe('accepted');

    // Queue drained → the tracked dev-server launcher fires exactly once.
    expect(startSpy).toHaveBeenCalledTimes(1);

    store.flushWorkspaceLogs();
    expect(store.workspaceLogs.get().some((line) => line.includes('launching the start command'))).toBe(true);
  });

  it('runs the deferred start when the flood halt drains the queue (nothing left to accept)', async () => {
    const store = new WorkbenchStore();
    const startSpy = vi.spyOn(store, 'startPreviewServer').mockResolvedValue('npm run dev');

    store.setAgentPatchReviewRequired(true);
    store.addArtifact(artifactData());

    const first = fileAction('file-0', 'export const attempt = 0;\n');
    store.addAction(first);
    store.runAction(first);

    await vi.waitFor(() => {
      expect(store.agentPatchProposals.get()['artifact-1:file-0']?.status).toBe('pending');
    });

    const start = startAction();
    store.addAction(start);
    store.runAction(start);

    await vi.waitFor(() => {
      expect(actionStatus(store, 'start-1')).toBe('complete');
    });

    expect(startSpy).not.toHaveBeenCalled();

    // The runaway loop keeps re-patching the same file until the bound halts it.
    for (let attempt = 1; attempt < 9; attempt++) {
      const action = fileAction(`file-${attempt}`, `export const attempt = ${attempt};\n`);
      store.addAction(action);
      store.runAction(action);
    }

    await vi.waitFor(() => {
      expect(actionStatus(store, 'file-8')).toBe('complete');
    });

    // Halt reached → open proposals failed → the deferred start is released.
    expect(pendingProposals(store)).toHaveLength(0);
    expect(startSpy).toHaveBeenCalledTimes(1);
  });
});
