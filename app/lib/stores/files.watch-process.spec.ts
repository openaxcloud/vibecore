/**
 * @vitest-environment jsdom
 */

import type { FileChange } from '@vibecore/runtime-contract';
import { describe, expect, it, vi } from 'vitest';
import { FilesStore } from './files';

const WORK_DIR = '/home/project';

interface RuntimeOverrides {
  readFile?: (path: string) => Promise<{ content: string; encoding?: 'utf8' | 'base64' }>;
}

/*
 * Build a remote-kubernetes FilesStore and capture the watch onChange callback so a
 * test can drive #processFileChange exactly as the production API poller does (which
 * emits create/delete with NO content and NO type discriminator).
 */
async function makeStore(overrides: RuntimeOverrides = {}) {
  let emit!: (change: FileChange) => void;

  const runtime = {
    workdir: WORK_DIR,
    mode: 'remote-kubernetes' as const,
    hasWorkspaceId: () => true,
    listFiles: vi.fn(async () => []),
    readFile: vi.fn(overrides.readFile ?? (async () => ({ content: '', encoding: 'utf8' as const }))),
    watchFiles: vi.fn(async (_paths: string[], onChange: (change: FileChange) => void) => {
      emit = onChange;

      return () => {};
    }),
    watchPorts: vi.fn(async () => () => {}),
  } as unknown as ConstructorParameters<typeof FilesStore>[0];

  const store = new FilesStore(runtime);

  // Let the constructor's async #init() attach the watch and capture onChange.
  await vi.waitFor(() => expect(emit).toBeTypeOf('function'));

  return { store, emit, runtime };
}

describe('FilesStore #processFileChange — remote content-less watch events', () => {
  it('BUG1: a content-less create of a real FILE becomes an openable file, not a phantom folder', async () => {
    const { store, emit } = await makeStore({
      readFile: async () => ({ content: 'export const x = 1;', encoding: 'utf8' }),
    });

    emit({ path: 'src/new.ts', type: 'create', timestamp: '' });

    await vi.waitFor(() => {
      expect(store.files.get()[`${WORK_DIR}/src/new.ts`]).toEqual({
        type: 'file',
        content: 'export const x = 1;',
        isBinary: false,
      });
    });
    expect(store.filesCount).toBe(1);
  });

  it('BUG1: a content-less create of a real DIRECTORY (read fails) is registered as a folder', async () => {
    const { store, emit } = await makeStore({
      readFile: async () => {
        throw new Error('EISDIR: illegal operation on a directory');
      },
    });

    emit({ path: 'src/components', type: 'create', timestamp: '' });

    await vi.waitFor(() => {
      expect(store.files.get()[`${WORK_DIR}/src/components`]).toEqual({ type: 'folder' });
    });
    expect(store.filesCount).toBe(0);
  });

  it('BUG2: recreating a previously-deleted path via content-less create clears it from #deletedPaths', async () => {
    const { store, emit } = await makeStore({
      readFile: async () => ({ content: 'regenerated', encoding: 'utf8' }),
    });

    // User deleted the path earlier in the session.
    store.setDeletedPaths([`${WORK_DIR}/dist/bundle.js`]);
    expect(store.getDeletedPaths()).toContain(`${WORK_DIR}/dist/bundle.js`);

    // A build regenerates it; remote watch emits a content-less create.
    emit({ path: 'dist/bundle.js', type: 'create', timestamp: '' });

    await vi.waitFor(() => {
      expect(store.files.get()[`${WORK_DIR}/dist/bundle.js`]).toMatchObject({ type: 'file', content: 'regenerated' });
    });
    expect(store.getDeletedPaths()).not.toContain(`${WORK_DIR}/dist/bundle.js`);
  });

  it("BUG3: the initial '.' refresh signal does not inject a phantom file at WORK_DIR root", async () => {
    const { store, emit } = await makeStore();

    emit({ path: '.', type: 'update', timestamp: '' });

    expect(store.files.get()[WORK_DIR]).toBeUndefined();
    expect(store.filesCount).toBe(0);
  });
});
