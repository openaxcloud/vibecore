/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { FilesStore } from './files';

/*
 * Reproduces the production "blank editor" bug: in remote mode listFiles() returns
 * the tree WITHOUT content (the API /files route + agent /files/tree strip it), so a
 * reloadFromRuntime() that hard-replaced the map blanked every file's content. The
 * fix preserves content already hydrated (from project storage) when the tree omits it.
 */
function makeRuntime(nodes: Array<{ type: 'file' | 'directory'; name: string; path: string; content?: string }>) {
  return {
    workdir: '/home/project',
    mode: 'remote-kubernetes' as const,
    hasWorkspaceId: () => true,
    listFiles: vi.fn(async () => nodes),
    readFile: vi.fn(async () => ''),
    watchFiles: vi.fn(async () => () => {}),
    watchPorts: vi.fn(async () => () => {}),
  } as unknown as ConstructorParameters<typeof FilesStore>[0];
}

describe('FilesStore.reloadFromRuntime — content preservation (remote tree-only reload)', () => {
  it('PRESERVES content already hydrated from project storage when the runtime tree omits content', async () => {
    // Real remote listFiles: tree only, no content.
    const store = new FilesStore(makeRuntime([{ type: 'file', name: 'App.tsx', path: 'src/App.tsx' }]));

    // Simulate ProjectWorkspaceProvider.loadProjectStorageFiles() hydrating real content first.
    store.files.set({
      '/home/project/src/App.tsx': { type: 'file', content: 'export default function App() {}', isBinary: false },
    });

    await store.reloadFromRuntime('.');

    const file = store.files.get()['/home/project/src/App.tsx'];
    expect(file).toEqual({ type: 'file', content: 'export default function App() {}', isBinary: false });
  });

  it('uses the runtime content when the tree DOES provide it (local/webcontainer)', async () => {
    const store = new FilesStore(
      makeRuntime([{ type: 'file', name: 'App.tsx', path: 'src/App.tsx', content: 'fresh from runtime' }]),
    );
    store.files.set({
      '/home/project/src/App.tsx': { type: 'file', content: 'stale', isBinary: false },
    });

    await store.reloadFromRuntime('.');

    expect(
      store.files.get()['/home/project/src/App.tsx']?.type === 'file' && store.files.get()['/home/project/src/App.tsx'],
    ).toMatchObject({ content: 'fresh from runtime' });
  });

  it('falls back to empty content for a brand-new tree file with nothing hydrated', async () => {
    const store = new FilesStore(makeRuntime([{ type: 'file', name: 'new.ts', path: 'src/new.ts' }]));

    await store.reloadFromRuntime('.');

    expect(store.files.get()['/home/project/src/new.ts']).toEqual({ type: 'file', content: '', isBinary: false });
  });
});
