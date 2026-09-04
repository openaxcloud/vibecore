import { describe, expect, it, vi } from 'vitest';
import {
  FILE_HISTORY_MAX_TEXT_BYTES,
  FileHistoryError,
  captureFileDeletion,
  captureFileVersion,
  deleteTextFileWithHistory,
  getFileHistoryVersion,
  listFileHistory,
  recordFileHistoryWatchContinuity,
  renameTextFileWithHistory,
  restoreFileVersion,
  writeTextFileWithHistory,
} from './file-history.js';
import { TestApiStore } from './tests/test-api-store.js';

const scope = {
  projectId: 'project_1',
  workspaceKey: 'workspace_1',
  workspaceId: 'workspace_1',
};

async function countPath(store: TestApiStore, path: string) {
  const latest = await store.getLatestFileVersion(scope.projectId, scope.workspaceKey, path);

  return latest ? store.countFileVersions(scope.projectId, scope.workspaceKey, latest.lineageId) : 0;
}

describe('File History service', () => {
  it('deduplicates identical captures and replays an operation idempotently', async () => {
    const store = new TestApiStore();
    const first = await captureFileVersion(store, {
      ...scope,
      path: '/src/App.tsx',
      content: 'export default 1;\n',
      source: 'editor',
      operationId: 'save-1',
    });
    const replay = await captureFileVersion(store, {
      ...scope,
      path: 'src/App.tsx',
      content: 'export default 1;\n',
      source: 'editor',
      operationId: 'save-1',
    });
    const sameBody = await captureFileVersion(store, {
      ...scope,
      path: 'src/App.tsx',
      content: 'export default 1;\n',
      source: 'editor',
      operationId: 'save-2',
    });

    expect(first.created).toBe(true);
    expect(replay.version.id).toBe(first.version.id);
    expect(sameBody.version.id).toBe(first.version.id);
    expect(await countPath(store, 'src/App.tsx')).toBe(1);
    expect(store.fileHistoryBlobs.size).toBe(1);
  });

  it('keeps a first-page latest id inside the returned list when an append races the reads', async () => {
    const store = new TestApiStore();
    const first = await captureFileVersion(store, {
      ...scope,
      path: 'src/App.tsx',
      content: 'before race\n',
      source: 'editor',
      operationId: 'race-before',
    });
    const originalList = store.listFileVersions.bind(store);
    let racedVersionId: string | undefined;

    vi.spyOn(store, 'listFileVersions').mockImplementationOnce(async (input) => {
      const rows = await originalList(input);
      const raced = await captureFileVersion(store, {
        ...scope,
        path: 'src/App.tsx',
        content: 'appended during list\n',
        source: 'agent',
        operationId: 'race-after',
      });
      racedVersionId = raced.version.id;
      return rows;
    });

    const page = await listFileHistory(store, { ...scope, path: 'src/App.tsx' });

    expect(page.versions.map((version) => version.id)).toEqual([first.version.id]);
    expect(page.latestVersionId).toBe(first.version.id);
    expect(page.versions.some((version) => version.id === page.latestVersionId)).toBe(true);
    expect(racedVersionId).toBeDefined();
    expect((await store.getLatestFileVersion(scope.projectId, scope.workspaceKey, 'src/App.tsx'))?.id).toBe(
      racedVersionId,
    );
  });

  it('rejects reuse of an operationId for different content', async () => {
    const store = new TestApiStore();
    await captureFileVersion(store, {
      ...scope,
      path: 'src/App.tsx',
      content: 'one',
      source: 'editor',
      operationId: 'same-operation',
    });

    await expect(
      captureFileVersion(store, {
        ...scope,
        path: 'src/App.tsx',
        content: 'two',
        source: 'editor',
        operationId: 'same-operation',
      }),
    ).rejects.toMatchObject({ code: 'FILE_HISTORY_IDEMPOTENCY_CONFLICT', statusCode: 409 });
  });

  it('captures the real baseline and new body around a central runtime write', async () => {
    const store = new TestApiStore();
    let disk = 'before\n';

    const result = await writeTextFileWithHistory(store, {
      ...scope,
      path: 'src/App.tsx',
      content: 'after\n',
      source: 'editor',
      operationId: 'runtime-save-1',
      readCurrent: async () => ({ content: disk, encoding: 'utf8' }),
      writeCurrent: async () => {
        disk = 'after\n';
      },
    });

    expect(disk).toBe('after\n');
    expect(result.baselineCreated).toBe(true);
    const history = await listFileHistory(store, { ...scope, path: 'src/App.tsx' });
    expect(history.total).toBe(2);
    expect(history.versions.map((version) => version.operation)).toEqual(['write', 'create']);
    expect(history.versions.every((version) => !Object.hasOwn(version, 'contentBase64'))).toBe(true);
  });

  it('never blocks a real runtime write when text exceeds the history limit', async () => {
    const store = new TestApiStore();
    const oversized = 'x'.repeat(FILE_HISTORY_MAX_TEXT_BYTES + 1);
    const writeCurrent = vi.fn(async () => undefined);

    await expect(
      writeTextFileWithHistory(store, {
        ...scope,
        path: 'large.txt',
        content: oversized,
        source: 'editor',
        operationId: 'runtime-large-write',
        readCurrent: async () => undefined,
        writeCurrent,
      }),
    ).resolves.toEqual({ baselineCreated: false, historySkipped: true });

    expect(writeCurrent).toHaveBeenCalledOnce();
    expect((await listFileHistory(store, { ...scope, path: 'large.txt' })).total).toBe(0);
  });

  it('restores non-destructively, appends even when content is old, and is idempotent', async () => {
    const store = new TestApiStore();
    const old = await captureFileVersion(store, {
      ...scope,
      path: 'src/App.tsx',
      content: 'old\n',
      source: 'editor',
      operationId: 'save-old',
    });
    const latest = await captureFileVersion(store, {
      ...scope,
      path: 'src/App.tsx',
      content: 'new\n',
      source: 'editor',
      operationId: 'save-new',
      expectedLatestVersionId: old.version.id,
    });
    const writeFile = vi.fn(async () => undefined);
    const restored = await restoreFileVersion(store, {
      ...scope,
      versionId: old.version.id,
      expectedLatestVersionId: latest.version.id,
      operationId: 'restore-old-once',
      actorUserId: 'user_1',
      writeFile,
    });
    const replay = await restoreFileVersion(store, {
      ...scope,
      versionId: old.version.id,
      expectedLatestVersionId: latest.version.id,
      operationId: 'restore-old-once',
      actorUserId: 'user_1',
      writeFile,
    });

    expect(restored.created).toBe(true);
    expect(restored.version.id).toBe(replay.version.id);
    expect(restored.version.restoredFromVersionId).toBe(old.version.id);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith({ path: 'src/App.tsx', content: 'old\n', encoding: 'utf8' });
    expect(await countPath(store, 'src/App.tsx')).toBe(3);
    expect((await getFileHistoryVersion(store, { ...scope, versionId: old.version.id })).content).toBe('old\n');
  });

  it('requires an exact latest version for restore and preserves history on conflict', async () => {
    const store = new TestApiStore();
    const first = await captureFileVersion(store, {
      ...scope,
      path: 'src/App.tsx',
      content: 'one',
      source: 'editor',
      operationId: 'save-one',
    });
    await captureFileVersion(store, {
      ...scope,
      path: 'src/App.tsx',
      content: 'two',
      source: 'editor',
      operationId: 'save-two',
      expectedLatestVersionId: first.version.id,
    });
    const writeFile = vi.fn(async () => undefined);

    await expect(
      restoreFileVersion(store, {
        ...scope,
        versionId: first.version.id,
        expectedLatestVersionId: first.version.id,
        operationId: 'stale-restore',
        writeFile,
      }),
    ).rejects.toMatchObject({ code: 'FILE_HISTORY_CONFLICT', statusCode: 409 });
    expect(writeFile).not.toHaveBeenCalled();
    expect(await countPath(store, 'src/App.tsx')).toBe(2);
  });

  it('paginates metadata with an opaque monotonic cursor', async () => {
    const store = new TestApiStore();
    let latestId: string | undefined;
    const versionIds: string[] = [];

    for (let index = 0; index < 4; index += 1) {
      const captured = await captureFileVersion(store, {
        ...scope,
        path: 'notes.txt',
        content: `version ${index}`,
        source: 'editor',
        operationId: `page-${index}`,
        expectedLatestVersionId: latestId,
      });
      latestId = captured.version.id;
      versionIds.push(captured.version.id);
    }

    const first = await listFileHistory(store, { ...scope, path: 'notes.txt', limit: 2 });
    const second = await listFileHistory(store, {
      ...scope,
      path: 'notes.txt',
      limit: 2,
      cursor: first.nextCursor,
    });

    expect(first.total).toBe(4);
    expect(first.nextCursor).toBeTruthy();
    expect(first.versions.map((version) => version.id)).toEqual([versionIds[3], versionIds[2]]);
    expect(second.versions.map((version) => version.id)).toEqual([versionIds[1], versionIds[0]]);
    expect(first.versions.map((version) => version.sequence)).toEqual(['4', '3']);
    expect(second.versions.map((version) => version.sequence)).toEqual(['2', '1']);
    expect(second.nextCursor).toBeUndefined();
  });

  it('records deletion as an immutable tombstone and accepts watcher delete replay safely', async () => {
    const store = new TestApiStore();
    let disk: string | undefined = 'before delete\n';
    const original = await captureFileVersion(store, {
      ...scope,
      path: 'src/deleted.ts',
      content: disk,
      source: 'editor',
      operationId: 'delete-seed',
      operation: 'create',
    });

    const deleted = await deleteTextFileWithHistory(store, {
      ...scope,
      path: 'src/deleted.ts',
      source: 'editor',
      operationId: 'delete-file-once',
      readCurrent: async () => (disk === undefined ? undefined : { content: disk, encoding: 'utf8' }),
      deleteCurrent: async () => {
        disk = undefined;
      },
    });
    const watcherEcho = await captureFileDeletion(store, {
      ...scope,
      path: 'src/deleted.ts',
      source: 'external',
      operationId: 'watch-delete-echo',
    });
    const history = await listFileHistory(store, { ...scope, path: 'src/deleted.ts' });

    expect(disk).toBeUndefined();
    expect(deleted.version).toMatchObject({ operation: 'delete', tombstone: true });
    expect(watcherEcho.created).toBe(false);
    expect(history.total).toBe(2);
    expect(history.versions.map((version) => version.id)).toEqual([deleted.version?.id, original.version.id]);
    expect(history.versions.map((version) => version.tombstone)).toEqual([true, false]);
  });

  it('finishes a tombstone retry when the filesystem delete already succeeded', async () => {
    const store = new TestApiStore();
    await captureFileVersion(store, {
      ...scope,
      path: 'src/retry-delete.ts',
      content: 'last committed body\n',
      source: 'editor',
      operationId: 'retry-delete-seed',
    });
    const deleteCurrent = vi.fn(async () => {
      throw new Error('A second physical delete must not run');
    });

    const result = await deleteTextFileWithHistory(store, {
      ...scope,
      path: 'src/retry-delete.ts',
      source: 'editor',
      operationId: 'retry-delete-after-disk-success',
      readCurrent: async () => undefined,
      deleteCurrent,
    });

    expect(deleteCurrent).not.toHaveBeenCalled();
    expect(result.version).toMatchObject({ operation: 'delete', tombstone: true });
    expect(await countPath(store, 'src/retry-delete.ts')).toBe(2);
  });

  it('keeps one lineage across rename and restores an old revision at the current path', async () => {
    const store = new TestApiStore();
    const disk = new Map([['src/before.ts', 'old body\n']]);
    const original = await captureFileVersion(store, {
      ...scope,
      path: 'src/before.ts',
      content: 'old body\n',
      source: 'editor',
      operationId: 'rename-seed',
      operation: 'create',
    });
    const renamed = await renameTextFileWithHistory(store, {
      ...scope,
      fromPath: 'src/before.ts',
      toPath: 'src/after.ts',
      source: 'editor',
      operationId: 'rename-once',
      readSource: async () => ({ content: disk.get('src/before.ts')!, encoding: 'utf8' }),
      readDestination: async () => undefined,
      renameCurrent: async () => {
        disk.set('src/after.ts', disk.get('src/before.ts')!);
        disk.delete('src/before.ts');
      },
    });
    const history = await listFileHistory(store, { ...scope, path: 'src/after.ts' });
    const writeFile = vi.fn(async ({ path, content }: { path: string; content: string }) => {
      disk.set(path, content);
    });

    await restoreFileVersion(store, {
      ...scope,
      versionId: original.version.id,
      expectedLatestVersionId: renamed.version!.id,
      operationId: 'restore-after-rename',
      writeFile,
    });

    expect(history.total).toBe(2);
    expect(history.versions[0]).toMatchObject({
      operation: 'rename',
      path: 'src/after.ts',
      renamedFromPath: 'src/before.ts',
    });
    expect(history.versions[1]).toMatchObject({ id: original.version.id, path: 'src/before.ts' });
    expect(writeFile).toHaveBeenCalledWith({ path: 'src/after.ts', content: 'old body\n', encoding: 'utf8' });
  });

  it('persists watcher restart/truncation continuity and exposes it with the timeline', async () => {
    const store = new TestApiStore();
    await captureFileVersion(store, {
      ...scope,
      path: 'src/continuity.ts',
      content: 'current',
      source: 'external',
      operationId: 'continuity-seed',
    });
    await recordFileHistoryWatchContinuity(store, { ...scope, sessionId: 'watch-session-1', lastSequence: 4 });
    await recordFileHistoryWatchContinuity(store, {
      ...scope,
      sessionId: 'watch-session-2',
      droppedEvents: 3,
      snapshotTruncated: true,
      lastSequence: 8,
      reconciledAt: '2026-07-15T10:00:00.000Z',
    });

    const history = await listFileHistory(store, { ...scope, path: 'src/continuity.ts' });

    expect(history.continuity).toMatchObject({
      complete: false,
      droppedEvents: 3,
      snapshotTruncated: true,
      reconciledAt: '2026-07-15T10:00:00.000Z',
    });
    expect(history.continuity.reasons).toEqual(['journal_truncated', 'snapshot_truncated', 'watcher_restart']);
  });

  it('scopes version detail to a workspace and enforces text/path/size limits', async () => {
    const store = new TestApiStore();
    const captured = await captureFileVersion(store, {
      ...scope,
      path: 'src/App.tsx',
      content: 'safe',
      source: 'editor',
      operationId: 'scoped',
    });

    await expect(
      getFileHistoryVersion(store, {
        projectId: scope.projectId,
        workspaceKey: 'other-workspace',
        versionId: captured.version.id,
      }),
    ).rejects.toMatchObject({ code: 'FILE_HISTORY_VERSION_NOT_FOUND' });
    await expect(
      captureFileVersion(store, {
        ...scope,
        path: '../secret.txt',
        content: 'nope',
        source: 'editor',
        operationId: 'bad-path',
      }),
    ).rejects.toMatchObject({ code: 'FILE_HISTORY_PATH_INVALID' });
    await expect(
      captureFileVersion(store, {
        ...scope,
        path: 'large.txt',
        content: 'x'.repeat(FILE_HISTORY_MAX_TEXT_BYTES + 1),
        source: 'editor',
        operationId: 'too-large',
      }),
    ).rejects.toBeInstanceOf(FileHistoryError);
  });
});
