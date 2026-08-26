import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesStore, isFileSaveConflictError } from './files';
import { setUserLanguagePreference } from '~/lib/i18n/language';

function makeRemoteRuntime() {
  const disk = new Map<string, string>();

  let readFailure: Error | undefined;
  let writeFailure: Error | undefined;

  const runtime = {
    workdir: '/home/project',
    mode: 'remote-kubernetes' as const,
    readFile: vi.fn(async (filePath: string) => {
      if (readFailure) {
        throw readFailure;
      }

      return { content: disk.get(filePath) ?? '', encoding: 'utf8' as const };
    }),
    createFile: vi.fn(async (filePath: string, content: string) => {
      disk.set(filePath, content);
    }),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      if (writeFailure) {
        throw writeFailure;
      }

      disk.set(filePath, content);
    }),
    writeFileIfUnchanged: vi.fn(async (filePath: string, content: string, expectedContent: string) => {
      if (writeFailure) {
        throw writeFailure;
      }

      if (disk.get(filePath) !== expectedContent) {
        throw Object.assign(new Error('conditional write rejected'), {
          code: 'FILE_CONTENT_CHANGED',
          status: 409,
        });
      }

      disk.set(filePath, content);
    }),
    watchFiles: vi.fn(async () => () => undefined),
  } as unknown as RuntimeAdapter;

  return {
    runtime,
    disk,
    failRead(error?: Error) {
      readFailure = error;
    },
    failWrite(error?: Error) {
      writeFailure = error;
    },
  };
}

describe('FilesStore — non-destructive save integrity', () => {
  beforeEach(() => {
    setUserLanguagePreference('en');
  });

  it('saves normally when the remote baseline is unchanged', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);
    const filePath = '/home/project/src/App.tsx';

    await store.createFile(filePath, 'original');
    await expect(store.saveFile(filePath, 'local edit')).resolves.toBeUndefined();

    expect(disk.get('src/App.tsx')).toBe('local edit');
    expect(store.files.get()[filePath]).toMatchObject({ content: 'local edit' });
  });

  it('returns both versions in a structured conflict and never overwrites the remote file', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);
    const filePath = '/home/project/src/App.tsx';

    await store.createFile(filePath, 'original');
    disk.set('src/App.tsx', 'remote edit');

    const error = await store.saveFile(filePath, 'local edit').catch((reason: unknown) => reason);

    expect(isFileSaveConflictError(error)).toBe(true);

    if (!isFileSaveConflictError(error)) {
      throw error;
    }

    expect(error).toMatchObject({
      code: 'FILE_SAVE_CONFLICT',
      filePath,
      localContent: 'local edit',
      remoteContent: 'remote edit',
    });
    expect(disk.get('src/App.tsx')).toBe('remote edit');
    expect(store.files.get()[filePath]).toMatchObject({ content: 'original' });
  });

  it('retries with CAS semantics after the user reviewed the remote version', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);
    const filePath = '/home/project/src/App.tsx';

    await store.createFile(filePath, 'original');
    disk.set('src/App.tsx', 'reviewed remote edit');

    await expect(store.saveFile(filePath, 'my recovered edit')).rejects.toMatchObject({
      code: 'FILE_SAVE_CONFLICT',
    });
    await expect(
      store.saveFile(filePath, 'my recovered edit', { expectedRemoteContent: 'reviewed remote edit' }),
    ).resolves.toBeUndefined();

    expect(disk.get('src/App.tsx')).toBe('my recovered edit');
  });

  it('refuses the retry when a newer remote edit arrived after review', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);
    const filePath = '/home/project/src/App.tsx';

    await store.createFile(filePath, 'original');
    disk.set('src/App.tsx', 'reviewed remote edit');
    await expect(store.saveFile(filePath, 'my recovered edit')).rejects.toMatchObject({
      code: 'FILE_SAVE_CONFLICT',
    });

    disk.set('src/App.tsx', 'newer remote edit');

    const error = await store
      .saveFile(filePath, 'my recovered edit', { expectedRemoteContent: 'reviewed remote edit' })
      .catch((reason: unknown) => reason);

    expect(isFileSaveConflictError(error)).toBe(true);
    expect(isFileSaveConflictError(error) && error.remoteContent).toBe('newer remote edit');
    expect(disk.get('src/App.tsx')).toBe('newer remote edit');
  });

  it('adopts a reviewed workspace revision only while it is still authoritative', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);
    const filePath = '/home/project/src/App.tsx';

    await store.createFile(filePath, 'original');
    disk.set('src/App.tsx', 'reviewed remote edit');

    await expect(store.acceptRemoteFile(filePath, 'reviewed remote edit', 'my local edit')).resolves.toBeUndefined();
    expect(store.files.get()[filePath]).toMatchObject({ content: 'reviewed remote edit' });

    disk.set('src/App.tsx', 'newer remote edit');
    await expect(store.acceptRemoteFile(filePath, 'reviewed remote edit', 'my newer local edit')).rejects.toMatchObject(
      {
        code: 'FILE_SAVE_CONFLICT',
        localContent: 'my newer local edit',
        remoteContent: 'newer remote edit',
      },
    );
    expect(store.files.get()[filePath]).toMatchObject({ content: 'reviewed remote edit' });
  });

  it('fails closed when the authoritative remote read is unavailable', async () => {
    const remote = makeRemoteRuntime();
    const store = new FilesStore(remote.runtime);
    const filePath = '/home/project/src/App.tsx';

    await store.createFile(filePath, 'original');
    remote.failRead(new Error('workspace read unavailable'));

    await expect(store.saveFile(filePath, 'local edit')).rejects.toThrow('workspace read unavailable');
    expect(
      (remote.runtime as RuntimeAdapter & { writeFileIfUnchanged: ReturnType<typeof vi.fn> }).writeFileIfUnchanged,
    ).not.toHaveBeenCalled();
    expect(remote.disk.get('src/App.tsx')).toBe('original');
    expect(store.files.get()[filePath]).toMatchObject({ content: 'original' });
  });

  it('keeps the baseline intact after a write error so a later retry can succeed', async () => {
    const remote = makeRemoteRuntime();
    const store = new FilesStore(remote.runtime);
    const filePath = '/home/project/src/App.tsx';

    await store.createFile(filePath, 'original');
    remote.failWrite(new Error('temporary write failure'));

    await expect(store.saveFile(filePath, 'local edit')).rejects.toThrow('temporary write failure');
    expect(remote.disk.get('src/App.tsx')).toBe('original');
    expect(store.files.get()[filePath]).toMatchObject({ content: 'original' });

    remote.failWrite();
    await expect(store.saveFile(filePath, 'local edit')).resolves.toBeUndefined();
    expect(remote.disk.get('src/App.tsx')).toBe('local edit');
  });

  it('rejects a reviewed revision even when the watcher already refreshed the store baseline', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);
    const filePath = '/home/project/src/App.tsx';

    await store.createFile(filePath, 'original');
    disk.set('src/App.tsx', 'reviewed remote');
    await expect(store.saveFile(filePath, 'local edit')).rejects.toMatchObject({ code: 'FILE_SAVE_CONFLICT' });

    /* Model a watcher refresh that adopted R2 as the FilesStore baseline. */
    store.files.setKey(filePath, { type: 'file', content: 'new remote', isBinary: false });
    disk.set('src/App.tsx', 'new remote');

    await expect(
      store.saveFile(filePath, 'local edit', { expectedRemoteContent: 'reviewed remote' }),
    ).rejects.toMatchObject({ code: 'FILE_SAVE_CONFLICT', remoteContent: 'new remote' });
    expect(disk.get('src/App.tsx')).toBe('new remote');
  });

  it('does not expose either file revision as enumerable error/log metadata', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);
    const filePath = '/home/project/src/secrets.ts';

    await store.createFile(filePath, 'baseline');
    disk.set('src/secrets.ts', 'remote-secret-value');

    const error = await store.saveFile(filePath, 'local-secret-value').catch((reason: unknown) => reason);

    expect(isFileSaveConflictError(error)).toBe(true);
    expect(Object.keys(error as object)).not.toContain('localContent');
    expect(Object.keys(error as object)).not.toContain('remoteContent');
    expect(JSON.stringify(error)).not.toContain('secret-value');
  });
});
