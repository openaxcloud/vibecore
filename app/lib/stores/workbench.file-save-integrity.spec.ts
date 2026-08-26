/**
 * @vitest-environment jsdom
 */

import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileHistoryStore } from './fileHistory';
import { WorkbenchStore } from './workbench';

const { disk, runtime, writeFailure } = vi.hoisted(() => {
  const disk = new Map<string, string>();
  const writeFailure = { current: undefined as Error | undefined };

  const runtime = {
    workdir: '/home/project',
    mode: 'remote-kubernetes' as const,
    hasWorkspaceId: () => false,
    listFiles: vi.fn(async () =>
      [...disk.entries()].map(([filePath, content]) => ({
        type: 'file' as const,
        name: filePath.split('/').pop() ?? filePath,
        path: filePath,
        content,
        encoding: 'utf8' as const,
      })),
    ),
    readFile: vi.fn(async (filePath: string) => ({
      content: disk.get(filePath) ?? '',
      encoding: 'utf8' as const,
    })),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      if (writeFailure.current) {
        throw writeFailure.current;
      }

      disk.set(filePath, content);
    }),
    writeFileIfUnchanged: vi.fn(async (filePath: string, content: string, expectedContent: string) => {
      if (writeFailure.current) {
        throw writeFailure.current;
      }

      if (disk.get(filePath) !== expectedContent) {
        throw Object.assign(new Error('conditional write rejected'), {
          code: 'FILE_CONTENT_CHANGED',
          status: 409,
        });
      }

      disk.set(filePath, content);
    }),
    createFile: vi.fn(async (filePath: string, content: string) => {
      disk.set(filePath, content);
    }),
    watchFiles: vi.fn(async () => () => undefined),
    watchPorts: vi.fn(async () => () => undefined),
    listPorts: vi.fn(async () => []),
    listProcesses: vi.fn(async () => []),
    killProcess: vi.fn(async () => undefined),
  } as unknown as RuntimeAdapter;

  return { disk, runtime, writeFailure };
});

vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  runtimeAdapter: runtime,
  getRuntimeAdapter: () => runtime,
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

vi.mock('./terminal', async () => {
  const { atom } = await import('nanostores');

  return {
    TerminalStore: class {
      showTerminal = atom(false);
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

const FILE_PATH = '/home/project/src/App.tsx';

async function openStore(projectId: string) {
  disk.set('src/App.tsx', 'original');

  const store = new WorkbenchStore();
  store.configureProject(projectId);
  await store.loadRuntimeFiles();
  store.setSelectedFile(FILE_PATH);

  return store;
}

describe('WorkbenchStore — recovery-safe file saves', () => {
  beforeEach(() => {
    disk.clear();
    writeFailure.current = undefined;
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ proposals: [] }), { status: 200 })),
    );
    vi.spyOn(fileHistoryStore, 'captureDurably').mockImplementation(async (filePath, content, source) =>
      fileHistoryStore.capture(filePath, content, source),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the editor buffer dirty and persists both sides when a conflict occurs', async () => {
    const store = await openStore('save-conflict-project');
    store.setCurrentDocumentContent('my local edit');
    disk.set('src/App.tsx', 'someone else edited remotely');

    await expect(store.saveCurrentDocument()).rejects.toMatchObject({ code: 'FILE_SAVE_CONFLICT' });

    expect(store.currentDocument.get()?.value).toBe('my local edit');
    expect(store.unsavedFiles.get()).toContain(FILE_PATH);
    expect(store.fileSaveIssues.get()[FILE_PATH]).toMatchObject({
      kind: 'conflict',
      localContent: 'my local edit',
      remoteContent: 'someone else edited remotely',
    });
    expect(disk.get('src/App.tsx')).toBe('someone else edited remotely');

    const history = fileHistoryStore.getVersions(FILE_PATH);
    expect(history.slice(-2).map(({ source, content }) => ({ source, content }))).toEqual([
      { source: 'external', content: 'someone else edited remotely' },
      { source: 'conflict', content: 'my local edit' },
    ]);
  });

  it('keeps the reviewed local buffer only when the remote revision is still current', async () => {
    const store = await openStore('save-keep-local-project');
    store.setCurrentDocumentContent('my local edit');
    disk.set('src/App.tsx', 'reviewed remote edit');
    await expect(store.saveCurrentDocument()).rejects.toMatchObject({ code: 'FILE_SAVE_CONFLICT' });

    store.setCurrentDocumentContent('my latest local edit');
    await expect(store.resolveFileSaveConflict(FILE_PATH, 'keep-local')).resolves.toBeUndefined();

    expect(disk.get('src/App.tsx')).toBe('my latest local edit');
    expect(store.currentDocument.get()?.value).toBe('my latest local edit');
    expect(store.unsavedFiles.get()).not.toContain(FILE_PATH);
    expect(store.fileSaveIssues.get()[FILE_PATH]).toBeUndefined();
  });

  it('keeps journaling keystrokes entered after a conflict blocks autosave', async () => {
    const store = await openStore('save-conflict-latest-draft-project');
    store.setCurrentDocumentContent('draft at conflict');
    disk.set('src/App.tsx', 'workspace edit');
    await expect(store.saveCurrentDocument()).rejects.toMatchObject({ code: 'FILE_SAVE_CONFLICT' });

    store.setCurrentDocumentContent('newest keystrokes after conflict');

    await vi.waitFor(() => {
      expect(fileHistoryStore.getVersions(FILE_PATH).at(-1)).toMatchObject({
        source: 'conflict',
        content: 'newest keystrokes after conflict',
      });
    });
    expect(store.unsavedFiles.get()).toContain(FILE_PATH);
    expect(store.fileSaveIssues.get()[FILE_PATH]).toMatchObject({
      kind: 'conflict',
      localContent: 'newest keystrokes after conflict',
    });
  });

  it('raises a fresh conflict instead of clobbering a newer remote revision', async () => {
    const store = await openStore('save-cas-project');
    store.setCurrentDocumentContent('my local edit');
    disk.set('src/App.tsx', 'reviewed remote edit');
    await expect(store.saveCurrentDocument()).rejects.toMatchObject({ code: 'FILE_SAVE_CONFLICT' });

    disk.set('src/App.tsx', 'newer remote edit');
    await expect(store.resolveFileSaveConflict(FILE_PATH, 'keep-local')).rejects.toMatchObject({
      code: 'FILE_SAVE_CONFLICT',
    });

    expect(disk.get('src/App.tsx')).toBe('newer remote edit');
    expect(store.currentDocument.get()?.value).toBe('my local edit');
    expect(store.unsavedFiles.get()).toContain(FILE_PATH);
    expect(store.fileSaveIssues.get()[FILE_PATH]).toMatchObject({
      kind: 'conflict',
      remoteContent: 'newer remote edit',
      localContent: 'my local edit',
    });
  });

  it('adopts the workspace version without losing the locally recovered history copy', async () => {
    const store = await openStore('save-use-remote-project');
    store.setCurrentDocumentContent('my local edit');
    disk.set('src/App.tsx', 'workspace edit');
    await expect(store.saveCurrentDocument()).rejects.toMatchObject({ code: 'FILE_SAVE_CONFLICT' });

    store.setCurrentDocumentContent('my newest local edit');
    await store.resolveFileSaveConflict(FILE_PATH, 'use-remote');

    expect(store.currentDocument.get()?.value).toBe('workspace edit');
    expect(store.files.get()[FILE_PATH]).toMatchObject({ content: 'workspace edit' });
    expect(store.unsavedFiles.get()).not.toContain(FILE_PATH);
    expect(store.fileSaveIssues.get()[FILE_PATH]).toBeUndefined();
    expect(fileHistoryStore.getVersions(FILE_PATH).at(-1)).toMatchObject({
      source: 'conflict',
      content: 'my newest local edit',
    });
  });

  it('does not clear the dirty marker when the workspace version changed again before adoption', async () => {
    const store = await openStore('save-use-stale-remote-project');
    store.setCurrentDocumentContent('my local edit');
    disk.set('src/App.tsx', 'reviewed workspace edit');
    await expect(store.saveCurrentDocument()).rejects.toMatchObject({ code: 'FILE_SAVE_CONFLICT' });

    store.setCurrentDocumentContent('my latest local edit');
    disk.set('src/App.tsx', 'newer workspace edit');

    await expect(store.resolveFileSaveConflict(FILE_PATH, 'use-remote')).rejects.toMatchObject({
      code: 'FILE_SAVE_CONFLICT',
      remoteContent: 'newer workspace edit',
    });

    expect(store.currentDocument.get()?.value).toBe('my latest local edit');
    expect(store.unsavedFiles.get()).toContain(FILE_PATH);
    expect(store.fileSaveIssues.get()[FILE_PATH]).toMatchObject({
      kind: 'conflict',
      localContent: 'my latest local edit',
      remoteContent: 'newer workspace edit',
    });
    expect(disk.get('src/App.tsx')).toBe('newer workspace edit');
  });

  it('refuses to replace the buffer until its recovery copy is durably committed', async () => {
    const store = await openStore('save-durable-recovery-project');
    store.setCurrentDocumentContent('irreplaceable local edit');
    disk.set('src/App.tsx', 'workspace edit');
    await expect(store.saveCurrentDocument()).rejects.toMatchObject({ code: 'FILE_SAVE_CONFLICT' });
    vi.mocked(fileHistoryStore.captureDurably).mockRejectedValueOnce(new Error('FILE_HISTORY_PERSISTENCE_UNAVAILABLE'));

    await expect(store.resolveFileSaveConflict(FILE_PATH, 'use-remote')).rejects.toThrow(
      'FILE_HISTORY_PERSISTENCE_UNAVAILABLE',
    );
    expect(store.currentDocument.get()?.value).toBe('irreplaceable local edit');
    expect(store.unsavedFiles.get()).toContain(FILE_PATH);
    expect(store.fileSaveIssues.get()[FILE_PATH]).toBeDefined();
  });

  it('never overwrites keystrokes entered while a workspace-version resolution is pending', async () => {
    const store = await openStore('save-use-remote-inflight-project');
    store.setCurrentDocumentContent('local before action');
    disk.set('src/App.tsx', 'workspace edit');
    await expect(store.saveCurrentDocument()).rejects.toMatchObject({ code: 'FILE_SAVE_CONFLICT' });

    let releaseCapture!: () => void;
    vi.mocked(fileHistoryStore.captureDurably).mockImplementationOnce(async (filePath, content, source) => {
      await new Promise<void>((resolve) => {
        releaseCapture = resolve;
      });

      return fileHistoryStore.capture(filePath, content, source);
    });

    const resolving = store.resolveFileSaveConflict(FILE_PATH, 'use-remote');
    await vi.waitFor(() => expect(releaseCapture).toBeTypeOf('function'));
    store.setCurrentDocumentContent('typed during resolution');
    releaseCapture();

    await expect(resolving).rejects.toThrow('FILE_SAVE_BUFFER_CHANGED_DURING_RESOLUTION');
    expect(store.currentDocument.get()?.value).toBe('typed during resolution');
    expect(store.unsavedFiles.get()).toContain(FILE_PATH);
    expect(store.fileSaveIssues.get()[FILE_PATH]).toMatchObject({
      kind: 'conflict',
      localContent: 'typed during resolution',
    });
  });

  it('surfaces a retryable write error while preserving the buffer and clears it after retry succeeds', async () => {
    const store = await openStore('save-retry-project');
    store.setCurrentDocumentContent('my local edit');
    writeFailure.current = new Error('temporary write failure');

    await expect(store.saveCurrentDocument()).rejects.toThrow('temporary write failure');
    expect(store.currentDocument.get()?.value).toBe('my local edit');
    expect(store.unsavedFiles.get()).toContain(FILE_PATH);
    expect(store.fileSaveIssues.get()[FILE_PATH]).toMatchObject({ kind: 'error', localContent: 'my local edit' });
    expect(fileHistoryStore.getVersions(FILE_PATH).at(-1)).toMatchObject({
      source: 'recovery',
      content: 'my local edit',
    });

    writeFailure.current = undefined;
    await expect(store.retryFileSave(FILE_PATH)).resolves.toBeUndefined();
    expect(disk.get('src/App.tsx')).toBe('my local edit');
    expect(store.unsavedFiles.get()).not.toContain(FILE_PATH);
    expect(store.fileSaveIssues.get()[FILE_PATH]).toBeUndefined();
  });

  it('clears the dirty dot after a confirmed 204-equivalent save', async () => {
    const store = await openStore('save-dirty-dot-project');
    store.setCurrentDocumentContent('saved content');
    expect(store.unsavedFiles.get()).toContain(FILE_PATH);

    await store.saveCurrentDocument();

    expect(disk.get('src/App.tsx')).toBe('saved content');
    expect(store.unsavedFiles.get()).not.toContain(FILE_PATH);
  });

  it('keeps newer keystrokes dirty when they arrive while a save is in flight', async () => {
    const store = await openStore('save-inflight-edit-project');
    store.setCurrentDocumentContent('snapshot sent');

    let releaseWrite!: () => void;

    const writeBlocked = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const conditionalWrite = (runtime as RuntimeAdapter & { writeFileIfUnchanged: ReturnType<typeof vi.fn> })
      .writeFileIfUnchanged;
    conditionalWrite.mockImplementationOnce(async (filePath: string, content: string, expectedContent: string) => {
      await writeBlocked;

      if (disk.get(filePath) !== expectedContent) {
        throw Object.assign(new Error('conditional write rejected'), { code: 'FILE_CONTENT_CHANGED', status: 409 });
      }

      disk.set(filePath, content);
    });

    const saving = store.saveCurrentDocument();
    await vi.waitFor(() => expect(conditionalWrite).toHaveBeenCalled());
    store.setCurrentDocumentContent('typed while saving');
    releaseWrite();
    await saving;

    expect(disk.get('src/App.tsx')).toBe('snapshot sent');
    expect(store.currentDocument.get()?.value).toBe('typed while saving');
    expect(store.unsavedFiles.get()).toContain(FILE_PATH);

    await store.saveCurrentDocument();
    expect(disk.get('src/App.tsx')).toBe('typed while saving');
    expect(store.unsavedFiles.get()).not.toContain(FILE_PATH);
  });

  it('save-all continues after one conflict and leaves only that file actionable', async () => {
    const store = await openStore('save-all-conflict-project');
    const otherPath = '/home/project/src/Other.tsx';
    await store.createFile(otherPath, 'other original');
    store.setDocuments(store.files.get());

    store.setSelectedFile(FILE_PATH);
    store.setCurrentDocumentContent('first local');
    store.setSelectedFile(otherPath);
    store.setCurrentDocumentContent('second local');
    disk.set('src/App.tsx', 'first remote');

    await expect(store.saveAllFiles()).resolves.toEqual({ saved: 1, failed: 1 });

    expect(disk.get('src/App.tsx')).toBe('first remote');
    expect(disk.get('src/Other.tsx')).toBe('second local');
    expect(store.unsavedFiles.get()).toEqual(new Set([FILE_PATH]));
    expect(store.fileSaveIssues.get()[FILE_PATH]).toMatchObject({ kind: 'conflict' });
    expect(store.fileSaveIssues.get()[otherPath]).toBeUndefined();
  });
});
