/**
 * @vitest-environment jsdom
 *
 * BUG-AGENT-001 — the streaming sampler wrote the WHOLE file to the runtime on
 * every 100ms tick, then the backlog it created was cancelled at stream end and
 * the files were never written at all.
 *
 * The guard that was supposed to make the streaming write happen once is
 * `if (!doc)` in `#processFileAction`: write the file when the editor has no
 * document for it yet. It never closed, because the REAL
 * `EditorStore.updateFile` (app/lib/stores/editor.ts) returns early when the
 * document is missing and never creates it:
 *
 *     updateFile(filePath, newContent) {
 *       const documentState = documents[filePath];
 *       if (!documentState) { return; }      // <-- no document is ever created
 *
 * The original editor mock created missing documents and hid this defect.
 * This suite now uses the real EditorStore. Streaming remains visible there,
 * while only a validated closing action may persist source to the runtime.
 *
 * Measured live before the fix (env d'audit, 2026-08-15): 150 writes for 9
 * files — 55 of them for `src/lib/stats.ts` alone.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import { cheminsEcritsParLesLanes } from '~/lib/runtime/agent-lane-writes';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { shouldAutoApplyPatch } from '~/utils/agent-auto-apply';

const { runtimeAdapterMock, runtimeFiles } = vi.hoisted(() => {
  const runtimeFiles = new Map<string, string>();

  return {
    runtimeFiles,
    runtimeAdapterMock: {
      workdir: '/home/project',
      mode: 'test',
      listFiles: vi.fn(async () => []),
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
      setObservationEnabled = vi.fn();
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
      resetFileModifications = vi.fn();

      async reloadFromRuntime() {
        // The tree refresh is irrelevant here; keep it inert and cheap.
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

function chunkAction(content: string): ActionCallbackData {
  return {
    artifactId: 'artifact-1',
    messageId: 'assistant-1',
    actionId: 'file-1',
    action: { type: 'file', filePath: 'src/main.tsx', content },
  };
}

describe('BUG-AGENT-001 — streaming writes must not amplify per sampler tick', () => {
  beforeEach(() => {
    runtimeFiles.clear();
    runtimeAdapterMock.writeFile.mockClear();
    runtimeAdapterMock.createFile.mockClear();
    runtimeAdapterMock.readFile.mockClear();
  });

  it('updates the real editor across streamed chunks without persisting partial source', async () => {
    const store = new WorkbenchStore();
    const artifact = artifactData();

    store.addArtifact(artifact);

    /*
     * `runAction(data, true)` goes through `actionStreamSampler`, a sampler on
     * ACTION_STREAM_SAMPLE_INTERVAL_MS (100ms). Ticks emitted inside one window
     * are coalesced, so they MUST be spaced wider than the interval — otherwise
     * the sampler hides the amplification and the test passes against the bug.
     */
    let buffer = '';

    for (let tick = 0; tick < 8; tick++) {
      buffer += `line ${tick}\n`;

      const data = chunkAction(buffer);

      if (tick === 0) {
        store.addAction(data);
      }

      await store.runAction(data, true);
      await new Promise((resolve) => setTimeout(resolve, 130));
    }

    /*
     * Count every way the file can be materialized in the runtime — a first
     * emission lands via `createFile`, later ones via `writeFile` — so the
     * assertion cannot be satisfied by the amplification merely changing verb.
     */
    const streamedWrites = () =>
      [...runtimeAdapterMock.createFile.mock.calls, ...runtimeAdapterMock.writeFile.mock.calls].filter(([filePath]) =>
        String(filePath).endsWith('src/main.tsx'),
      );

    await vi.waitFor(() => {
      expect(store.currentDocument.get()?.value).toBe(buffer);
    });

    expect(streamedWrites()).toHaveLength(0);
  });

  it.each(['dirty', 'locked'])('preserves a %s editor buffer while staging', async (conflict) => {
    const store = new WorkbenchStore();
    const fullPath = '/home/project/src/main.tsx';
    store.setDocuments({ [fullPath]: { type: 'file', content: 'user edits', isBinary: false } });
    store.addArtifact(artifactData());

    const data = chunkAction('partial generated source');
    store.addAction(data);

    if (conflict === 'dirty') {
      store.unsavedFiles.set(new Set([fullPath]));
    } else {
      vi.spyOn(store, 'isFileLocked').mockReturnValue({ locked: true });
    }

    await vi.waitFor(() => {
      expect(store.artifacts.get()['artifact-1'].runner.actions.get()['file-1']).toBeDefined();
    });
    await store._runAction(data, true);
    expect(store.currentDocument.get()?.value).toBe('user edits');
    expect(runtimeAdapterMock.writeFile).not.toHaveBeenCalled();
    expect(runtimeAdapterMock.createFile).not.toHaveBeenCalled();
  });

  it.each(['dirty', 'locked'])('preserves a %s buffer created while runner staging is pending', async (conflict) => {
    const store = new WorkbenchStore();
    const fullPath = '/home/project/src/main.tsx';
    store.addArtifact(artifactData());

    const data = chunkAction('partial generated source');
    store.addAction(data);
    await vi.waitFor(() => expect(store.artifacts.get()['artifact-1'].runner.actions.get()['file-1']).toBeDefined());

    const runner = store.artifacts.get()['artifact-1'].runner;

    let release!: () => void;

    const deferred = new Promise<void>((resolve) => {
      release = resolve;
    });

    const run = vi.spyOn(runner, 'runAction').mockImplementationOnce(() => deferred);
    const pending = store._runAction(data, true);
    await vi.waitFor(() => expect(run).toHaveBeenCalled());
    store.setDocuments({ [fullPath]: { type: 'file', content: 'concurrent user edits', isBinary: false } });

    if (conflict === 'dirty') {
      store.unsavedFiles.set(new Set([fullPath]));
    } else {
      vi.spyOn(store, 'isFileLocked').mockReturnValue({ locked: true });
    }

    release();
    await pending;
    expect(store.currentDocument.get()?.value).toBe('concurrent user edits');
    expect(store.actionAlert.get()?.type).toBe('warning');
    expect(runtimeAdapterMock.writeFile).not.toHaveBeenCalled();
    expect(runtimeAdapterMock.createFile).not.toHaveBeenCalled();
  });

  it('keeps streaming visible but never revives a stopped action through a queued fragment', async () => {
    const store = new WorkbenchStore();
    store.addArtifact(artifactData());

    const data = chunkAction('first partial source');
    store.addAction(data);
    await vi.waitFor(() => {
      expect(store.artifacts.get()['artifact-1'].runner.actions.get()['file-1']).toBeDefined();
    });
    await store._runAction(data, true);

    const runner = store.artifacts.get()['artifact-1'].runner;
    expect(runner.actions.get()['file-1'].status).toBe('running');
    expect(store.currentDocument.get()?.value).toBe('first partial source');
    runner.abortAll();
    await store._runAction(chunkAction('late partial source'), true);
    expect(runner.actions.get()['file-1'].status).toBe('aborted');
    expect(store.currentDocument.get()?.value).toBe('first partial source');
    expect(runtimeAdapterMock.writeFile).not.toHaveBeenCalled();
    expect(runtimeAdapterMock.createFile).not.toHaveBeenCalled();
  });

  it('keeps syntactically valid emergency CSS off disk until its real close is reviewed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'emergency-css-'));
    const original = '.healthy { color: green; }';
    const partial = '.partial { color: red; }';
    await mkdir(join(directory, 'src'));
    await writeFile(join(directory, 'src/styles.css'), original);

    const writeImpl = runtimeAdapterMock.writeFile.getMockImplementation();
    const readImpl = runtimeAdapterMock.readFile.getMockImplementation();
    runtimeAdapterMock.writeFile.mockImplementation(async (path, content) => {
      await writeFile(join(directory, path), content);
    });
    runtimeAdapterMock.readFile.mockImplementation(async (path) => ({
      content: await readFile(join(directory, path), 'utf8'),
      encoding: 'utf8' as const,
    }));

    try {
      const store = new WorkbenchStore();
      store.setAgentPatchReviewRequired(false);
      store.addArtifact(artifactData());

      const data = {
        ...chunkAction(partial),
        action: { type: 'file' as const, filePath: 'src/styles.css', content: partial },
        fermetureDeSecours: true,
      };
      store.files.setKey('/home/project/src/styles.css', { type: 'file', content: original, isBinary: false });
      store.addAction(data);
      await vi.waitFor(() => expect(store.artifacts.get()['artifact-1'].runner.actions.get()['file-1']).toBeDefined());
      await store._runAction(data, false);
      expect(await readFile(join(directory, 'src/styles.css'), 'utf8')).toBe(original);
      expect(runtimeAdapterMock.writeFile).not.toHaveBeenCalled();
      expect(store.agentPatchProposals.get()['artifact-1:file-1']).toMatchObject({
        status: 'pending',
        tronquee: true,
        proposedContent: partial,
      });
      expect(
        shouldAutoApplyPatch({ ...store.agentPatchProposals.get()['artifact-1:file-1'], autoApplyEnabled: true }),
      ).toBe(false);
      expect(store.artifacts.get()['artifact-1'].runner.actions.get()['file-1'].executed).toBeFalsy();
      await store._runAction({ ...data, fermetureDeSecours: false }, false);
      expect(store.agentPatchProposals.get()['artifact-1:file-1']).toMatchObject({
        status: 'pending',
        tronquee: false,
        proposedContent: partial,
      });
      expect(
        shouldAutoApplyPatch({ ...store.agentPatchProposals.get()['artifact-1:file-1'], autoApplyEnabled: true }),
      ).toBe(true);
      expect(await readFile(join(directory, 'src/styles.css'), 'utf8')).toBe(original);
    } finally {
      runtimeAdapterMock.writeFile.mockImplementation(writeImpl!);
      runtimeAdapterMock.readFile.mockImplementation(readImpl!);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('hydrates historical file completion without reading, writing or confirming disk content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'historical-css-'));
    const original = '.healthy { color: green; }';
    await mkdir(join(directory, 'src'));
    await writeFile(join(directory, 'src/styles.css'), original);

    const writeImpl = runtimeAdapterMock.writeFile.getMockImplementation();
    const readImpl = runtimeAdapterMock.readFile.getMockImplementation();
    runtimeAdapterMock.writeFile.mockImplementation(async (path, content) => {
      await writeFile(join(directory, path), content);
    });
    runtimeAdapterMock.readFile.mockImplementation(async (path) => ({
      content: await readFile(join(directory, path), 'utf8'),
      encoding: 'utf8' as const,
    }));

    try {
      const store = new WorkbenchStore();
      const messageId = 'historical-without-execution';
      store.setReloadedMessages([messageId]);
      store.addArtifact({ ...artifactData(), messageId });

      const data = {
        ...chunkAction('.historical { color: red; }'),
        messageId,
        action: { type: 'file' as const, filePath: 'src/styles.css', content: '.historical { color: red; }' },
      };
      store.addAction(data);
      await vi.waitFor(() => expect(store.artifacts.get()['artifact-1'].runner.actions.get()['file-1']).toBeDefined());
      await store._runAction(data, false);
      expect(store.artifacts.get()['artifact-1'].runner.actions.get()['file-1'].status).toBe('complete');
      expect(runtimeAdapterMock.readFile).not.toHaveBeenCalled();
      expect(runtimeAdapterMock.writeFile).not.toHaveBeenCalled();
      expect(runtimeAdapterMock.createFile).not.toHaveBeenCalled();
      expect(await readFile(join(directory, 'src/styles.css'), 'utf8')).toBe(original);
      expect(store.artifacts.get()['artifact-1'].runner.consumeConfirmedFileWrite('file-1')).toBeUndefined();
      expect(cheminsEcritsParLesLanes(messageId)).toBeUndefined();
    } finally {
      runtimeAdapterMock.writeFile.mockImplementation(writeImpl!);
      runtimeAdapterMock.readFile.mockImplementation(readImpl!);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('still writes the authoritative content when the action closes', async () => {
    const store = new WorkbenchStore();
    const artifact = artifactData();
    const finalContent = 'createRoot(document.getElementById("root")!).render(<App />);\n';

    store.addArtifact(artifact);

    const opening = chunkAction('createRoot(');
    store.addAction(opening);
    await store.runAction(opening, true);

    await store.runAction(chunkAction(finalContent));

    await vi.waitFor(() => {
      expect(runtimeFiles.get('src/main.tsx')).toBe(finalContent);
    });
  });
});
