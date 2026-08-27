/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { FilesStore, shouldPreserveHydratedTree } from './files';

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
    readFile: vi.fn(async () => ({ content: '', encoding: 'utf8' as const })),
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

/*
 * BUG-IDE-PANEL-RECLICK-REPROVISION-001 — a listing taken while the pod is
 * waking/being reprovisioned can be PARTIAL (agent answers before the reseed).
 * Observed live: the IDE tree collapsed from 12 files to 1. A partial listing
 * must never replace the hydrated tree.
 */
describe('FilesStore.reloadFromRuntime — partial-listing protection (waking pod)', () => {
  const twelveFiles = Array.from({ length: 12 }, (_, index) => ({
    path: `src/file-${index}.ts`,
    content: `export const value${index} = ${index};`,
    isBinary: false,
  }));

  it('keeps the hydrated 12-file tree when a waking pod lists only 1 file (the live repro)', async () => {
    const store = new FilesStore(makeRuntime([{ type: 'file', name: 'index.html', path: 'index.html' }]));

    store.replaceWithProjectStorageFiles(twelveFiles);
    expect(store.filesCount).toBe(12);

    const treeBefore = store.files.get();

    await store.reloadFromRuntime('.');

    expect(store.filesCount).toBe(12);
    expect(store.files.get()).toEqual(treeBefore);
  });

  it('adopts the runtime listing again once the pod serves the full tree (self-healing)', async () => {
    const fullNodes = twelveFiles.map((file) => ({
      type: 'file' as const,
      name: file.path.split('/').pop() ?? file.path,
      path: file.path,
    }));

    const store = new FilesStore(makeRuntime(fullNodes));

    store.replaceWithProjectStorageFiles(twelveFiles);
    await store.reloadFromRuntime('.');

    expect(store.filesCount).toBe(12);
    expect(store.files.get()['/home/project/src/file-3.ts']).toMatchObject({ content: 'export const value3 = 3;' });
  });

  it('shouldPreserveHydratedTree: preserves only a drastic collapse of a hydrated tree', () => {
    // The live repro: 12 -> 1.
    expect(shouldPreserveHydratedTree(12, 1)).toBe(true);
    expect(shouldPreserveHydratedTree(12, 0)).toBe(true);
    expect(shouldPreserveHydratedTree(12, 3)).toBe(true);

    // Genuine bulk change / normal reload: adopt.
    expect(shouldPreserveHydratedTree(12, 12)).toBe(false);
    expect(shouldPreserveHydratedTree(12, 8)).toBe(false);
    expect(shouldPreserveHydratedTree(12, 20)).toBe(false);

    // Small trees carry no signal: always adopt.
    expect(shouldPreserveHydratedTree(3, 1)).toBe(false);
    expect(shouldPreserveHydratedTree(0, 1)).toBe(false);
    expect(shouldPreserveHydratedTree(1, 0)).toBe(false);
  });
});
