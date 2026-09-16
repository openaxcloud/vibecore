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
 * The pre-existing suite could not catch this: its `EditorStore` mock
 * implements `updateFile` as `documents.setKey(...)`, i.e. it DOES create the
 * document, so the guard closed in tests and only ever misbehaved in
 * production. The mock below is deliberately faithful to the real no-op.
 *
 * Measured live before the fix (env d'audit, 2026-08-15): 150 writes for 9
 * files — 55 of them for `src/lib/stats.ts` alone.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';

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

vi.mock('./editor', async () => {
  const { atom, map } = await import('nanostores');

  return {
    EditorStore: class {
      currentDocument = atom(undefined);
      selectedFile = atom(undefined);
      documents = map({});

      setDocuments = vi.fn();
      updateScrollPosition = vi.fn();

      setSelectedFile(filePath: string | undefined) {
        this.selectedFile.set(filePath);
      }

      /*
       * FAITHFUL to app/lib/stores/editor.ts: a no-op when the document does
       * not exist. Replacing this with `documents.setKey(...)` makes the test
       * pass against the buggy code, which is exactly how the defect survived.
       */
      updateFile(filePath: string, value: string) {
        const existing = this.documents.get()[filePath];

        if (!existing) {
          return;
        }

        this.documents.setKey(filePath, { filePath, value, isBinary: false });
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

  it('materializes a streamed file in the runtime once, not once per chunk', async () => {
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

    // The runtime write is dispatched through the execution queue, so let it land.
    await vi.waitFor(() => {
      expect(streamedWrites().length).toBeGreaterThan(0);
    });

    expect(streamedWrites()).toHaveLength(1);
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
