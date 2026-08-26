/** @vitest-environment jsdom */

import type { FileChange, RuntimeAdapter } from '@vibecore/runtime-contract';
import { describe, expect, it, vi } from 'vitest';
import { FilesStore } from './files';

type TypedFileChange = FileChange & { entryType?: 'file' | 'directory' };

describe('FilesStore — typed directory watch events', () => {
  it('registers a directory without probing it through the file-read endpoint', async () => {
    let emitChange: ((change: TypedFileChange) => void) | undefined;

    const runtime = {
      mode: 'remote-kubernetes' as const,
      workdir: '/home/project',
      capabilities: [],
      hasWorkspaceId: () => true,
      watchFiles: vi.fn(async (_paths: string[], onChange: (change: TypedFileChange) => void) => {
        emitChange = onChange;

        return () => undefined;
      }),
      readFile: vi.fn(async () => {
        throw new Error('directories are not readable as files');
      }),
    } as unknown as RuntimeAdapter;

    const store = new FilesStore(runtime);

    await vi.waitFor(() => expect(runtime.watchFiles).toHaveBeenCalledTimes(1));
    emitChange?.({ path: 'src', type: 'create', entryType: 'directory' });

    expect(runtime.readFile).not.toHaveBeenCalled();
    expect(store.files.get()['/home/project/src']).toEqual({ type: 'folder' });
    store.dispose();
  });
});
