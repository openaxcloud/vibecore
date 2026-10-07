/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import {
  clearFileSaveConflict,
  describeFileSaveConflict,
  fileSaveConflictHunks,
  fileSaveConflictStore,
  openFileSaveConflict,
} from './file-save-conflict';
import { FilesStore, isRemoteFileConflictError, RemoteFileConflictError } from './files';

function makeRemoteRuntime() {
  const disk = new Map<string, string>();

  return {
    runtime: {
      workdir: '/home/project',
      mode: 'remote-kubernetes' as const,
      hasWorkspaceId: () => true,
      listFiles: vi.fn(async () => []),
      readFile: vi.fn(async (path: string) => ({ content: disk.get(path) ?? '', encoding: 'utf8' as const })),
      createFile: vi.fn(async (path: string, content: string) => {
        disk.set(path, content);
      }),
      writeFile: vi.fn(async (path: string, content: string) => {
        disk.set(path, content);
      }),
      watchFiles: vi.fn(async () => () => {}),
      watchPorts: vi.fn(async () => () => {}),
    } as unknown as ConstructorParameters<typeof FilesStore>[0],
    disk,
  };
}

const PATH = '/home/project/README.md';
const KEY = 'README.md';

describe('RemoteFileConflictError', () => {
  it('carries all three versions so the UI can offer a real choice', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);

    await store.createFile(PATH, '# baseline\n');

    // Something else rewrites the file after the editor loaded it.
    disk.set(KEY, '# rewritten by the agent\n');

    const error = await store.saveFile(PATH, '# my unsaved edit\n').catch((e: unknown) => e);

    expect(isRemoteFileConflictError(error)).toBe(true);

    const conflict = error as RemoteFileConflictError;
    expect(conflict.filePath).toBe(PATH);
    expect(conflict.remoteContent).toBe('# rewritten by the agent\n');
    expect(conflict.localContent).toBe('# my unsaved edit\n');
    expect(conflict.baselineContent).toBe('# baseline\n');

    /*
     * The message text is load-bearing: existing call sites and specs match on
     * it. Keep it byte-identical to the pre-typed-error string.
     */
    expect(conflict.message).toBe(`Remote file changed since it was loaded: ${PATH}`);
  });

  it('never writes to disk when the conflict is raised — the edit is not lost', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);

    await store.createFile(PATH, 'baseline');
    disk.set(KEY, 'remote wins the race');

    await expect(store.saveFile(PATH, 'my precious edit')).rejects.toThrow(/Remote file changed/);

    // Disk untouched, so "Reload" still has a real remote version to offer.
    expect(disk.get(KEY)).toBe('remote wins the race');
  });
});

describe('FilesStore.saveFile — onRemoteConflict: overwrite', () => {
  it('writes the local buffer verbatim over the remote version', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);

    await store.createFile(PATH, 'baseline');
    disk.set(KEY, 'remote version');

    await expect(store.saveFile(PATH, 'local version', { onRemoteConflict: 'overwrite' })).resolves.toBeUndefined();

    expect(disk.get(KEY)).toBe('local version');
    expect(store.files.get()[PATH]).toMatchObject({ content: 'local version' });
  });

  it('re-baselines so an immediate second save does not re-trigger the guard', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);

    await store.createFile(PATH, 'baseline');
    disk.set(KEY, 'remote version');

    await store.saveFile(PATH, 'local version', { onRemoteConflict: 'overwrite' });

    // Plain save of the same buffer must now succeed without a conflict.
    await expect(store.saveFile(PATH, 'local version 2')).resolves.toBeUndefined();
    expect(disk.get(KEY)).toBe('local version 2');
  });
});

describe('FilesStore.adoptRemoteContent', () => {
  it('re-baselines to the on-disk version without writing back to the runtime', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);

    await store.createFile(PATH, 'baseline');

    const writeCallsBefore = (runtime as unknown as { writeFile: { mock: { calls: unknown[] } } }).writeFile.mock.calls
      .length;

    store.adoptRemoteContent(PATH, 'the remote version');

    expect(store.files.get()[PATH]).toMatchObject({ content: 'the remote version' });

    // Disk already holds it — re-writing would be a pointless round-trip.
    expect((runtime as unknown as { writeFile: { mock: { calls: unknown[] } } }).writeFile.mock.calls.length).toBe(
      writeCallsBefore,
    );
    expect(disk.get(KEY)).toBe('baseline');
  });

  it('preserves the binary and lock flags rather than silently relabelling the file', async () => {
    const { runtime } = makeRemoteRuntime();
    const store = new FilesStore(runtime);

    store.files.setKey(PATH, {
      type: 'file',
      content: 'baseline',
      isBinary: true,
      isLocked: true,
      lockedByFolder: '/home/project',
    });

    store.adoptRemoteContent(PATH, 'fresh');

    expect(store.files.get()[PATH]).toMatchObject({
      content: 'fresh',
      isBinary: true,
      isLocked: true,
      lockedByFolder: '/home/project',
    });
  });
});

describe('file-save-conflict store', () => {
  const conflict = {
    filePath: PATH,
    remoteContent: 'line one\nline two\n',
    localContent: 'line one\nline two changed\nline three\n',
    baselineContent: 'line one\n',
    detectedAt: 0,
  };

  it('holds the pending conflict and clears it', () => {
    openFileSaveConflict(conflict);
    expect(fileSaveConflictStore.get()).toMatchObject({ filePath: PATH });

    clearFileSaveConflict(PATH);
    expect(fileSaveConflictStore.get()).toBeNull();
  });

  it('does not let a stale resolution dismiss a newer conflict', () => {
    openFileSaveConflict(conflict);

    // A late "resolved" for a different file must leave this one showing.
    clearFileSaveConflict('/home/project/other.ts');
    expect(fileSaveConflictStore.get()).toMatchObject({ filePath: PATH });

    clearFileSaveConflict();
    expect(fileSaveConflictStore.get()).toBeNull();
  });

  it('summarizes what "Keep mine" would change on disk', () => {
    const summary = describeFileSaveConflict(conflict);

    expect(summary.fileName).toBe('README.md');
    expect(summary.identical).toBe(false);
    expect(summary.additions).toBeGreaterThan(0);
    expect(summary.deletions).toBeGreaterThan(0);
  });

  it('flags a byte-identical conflict so the UI can resolve it without asking', () => {
    const summary = describeFileSaveConflict({
      ...conflict,
      remoteContent: 'same\n',
      localContent: 'same\n',
    });

    expect(summary.identical).toBe(true);
    expect(summary.additions).toBe(0);
    expect(summary.deletions).toBe(0);
  });

  it('produces reviewable hunks for the diff view', () => {
    const hunks = fileSaveConflictHunks(conflict);

    expect(hunks.length).toBeGreaterThan(0);
    expect(hunks.flatMap((hunk) => hunk.lines).some((line) => line.type === 'add')).toBe(true);
  });
});
