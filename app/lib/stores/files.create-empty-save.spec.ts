/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { FilesStore } from './files';

/*
 * Reproduces the production bug: in remote-kubernetes mode createFile() substitutes
 * a single space (' ') for empty content when calling runtime.createFile (the remote
 * runtime cannot persist a zero-byte file), so the on-disk content diverged from the
 * in-memory map, which used to store the original empty string ''. The first
 * legitimate save of that freshly-created empty file then tripped #saveFileImpl's
 * optimistic-concurrency check (remoteContent ' ' !== oldContent '') and falsely
 * threw "Remote file changed since it was loaded".
 *
 * This fake runtime models the real packages/runtime-remote behaviour: a backing
 * "disk" map that createFile/writeFile populate verbatim and readFile reads back.
 */
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

describe('FilesStore.createFile — empty file first-save (remote-kubernetes)', () => {
  it('does NOT falsely reject the first save of a freshly-created empty file', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);

    const path = '/home/project/src/empty.ts';

    // Create an empty file — runtime persists the ' ' placeholder.
    await expect(store.createFile(path, '')).resolves.toBe(true);
    expect(disk.get('src/empty.ts')).toBe(' ');

    /*
     * In-memory baseline must MATCH what was written to disk, so the optimistic
     * concurrency check in #saveFileImpl sees no divergence.
     */
    expect(store.files.get()[path]).toMatchObject({ type: 'file', content: ' ' });

    // The first real edit/save must succeed (previously threw "Remote file changed").
    await expect(store.saveFile(path, 'export const x = 1;\n')).resolves.toBeUndefined();
    expect(disk.get('src/empty.ts')).toBe('export const x = 1;\n');
    expect(store.files.get()[path]).toMatchObject({ content: 'export const x = 1;\n' });
  });

  it('still surfaces a genuine concurrent remote change as a conflict', async () => {
    const { runtime, disk } = makeRemoteRuntime();
    const store = new FilesStore(runtime);

    const path = '/home/project/src/file.ts';

    await store.createFile(path, 'original');
    expect(disk.get('src/file.ts')).toBe('original');

    // Simulate an out-of-band remote edit after the file was loaded.
    disk.set('src/file.ts', 'changed by someone else');

    await expect(store.saveFile(path, 'my edit')).rejects.toThrow(/Remote file changed/);
  });
});
