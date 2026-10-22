/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/*
 * BUG-IDE-007 — « Actualiser les fichiers » ne réparait pas l'arbre.
 *
 * Mesuré le 15/08 : Bibliothèque « 9 fichiers » → « 10 » après le clic, Git
 * « 20 », stockage du projet 20. Le bouton relisait le pod tel quel ; c'est le
 * runtime distant qui sait réconcilier stockage → pod, à condition qu'on le lui
 * demande. Le magasin doit donc TRANSMETTRE la demande de réparation, et les
 * deux gestes de l'utilisateur doivent la porter.
 */
describe('FilesStore.reloadFromRuntime — un rafraîchissement demandé répare, une relecture automatique non', () => {
  it('transmet `reparer` au runtime quand on le lui demande', async () => {
    const runtime = makeRuntime([{ type: 'file', name: 'App.tsx', path: 'src/App.tsx' }]);
    const store = new FilesStore(runtime);

    await store.reloadFromRuntime('.', { reparer: true });

    expect(runtime.listFiles).toHaveBeenCalledWith('.', { reparer: true });
  });

  it('ne réclame PAS de réparation pour une relecture automatique — 55 relectures par session, mesuré', async () => {
    const runtime = makeRuntime([{ type: 'file', name: 'App.tsx', path: 'src/App.tsx' }]);
    const store = new FilesStore(runtime);

    await store.reloadFromRuntime('.');

    expect(runtime.listFiles).toHaveBeenCalledWith('.', undefined);
  });

  it('les deux gestes de l’utilisateur — « Actualiser les fichiers » et la reconnexion — demandent la réparation', () => {
    const baseChat = readFileSync(join(process.cwd(), 'app/components/chat/BaseChat.tsx'), 'utf8');
    const fileTree = readFileSync(join(process.cwd(), 'app/components/workbench/FileTree.tsx'), 'utf8');

    expect(baseChat).toContain("onClick={() => void workbenchStore.loadRuntimeFiles('.', { reparer: true })}");
    expect(fileTree).toContain("workbenchStore.loadRuntimeFiles('.', { reparer: true }).catch(");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });

  return { promise, resolve, reject };
}

describe('reload overlapping runtime writes', () => {
  const path = '/home/project/audit.txt';
  const nodes = (content: string) => [{ type: 'file' as const, name: 'audit.txt', path: 'audit.txt', content }];

  const setup = () => {
    const runtime = makeRuntime(nodes('old disk'));
    Object.assign(runtime, { mode: 'test', writeFile: vi.fn(async () => undefined) });

    const store = new FilesStore(runtime);
    store.files.set({ [path]: { type: 'file', content: 'old disk', isBinary: false } });

    return { runtime, store };
  };

  it.each(['pending', 'completed', 'failed'] as const)(
    'preserves the correct save state when listing resolves with save %s',
    async (state) => {
      const { runtime, store } = setup();
      const write = deferred<void>();
      const started = deferred<void>();
      const listing = deferred<ReturnType<typeof nodes>>();
      vi.mocked(runtime.writeFile).mockImplementationOnce(() => {
        started.resolve();
        return write.promise;
      });
      vi.mocked(runtime.listFiles).mockImplementationOnce(() => listing.promise);

      try {
        const save = store.saveFile(path, 'draft');
        const failure = state === 'failed' ? expect(save).rejects.toThrow('write rejected') : undefined;
        await started.promise;

        const reload = store.reloadFromRuntime();

        if (state === 'completed') {
          write.resolve();
          await save;
        }

        if (state === 'failed') {
          write.reject(new Error('write rejected'));
          await failure;
        }

        listing.resolve(nodes('old disk'));
        await reload;
        expect(store.files.get()[path]).toMatchObject({ content: state === 'failed' ? 'old disk' : 'draft' });

        if (state === 'pending') {
          write.resolve();
          await save;
        }

        vi.mocked(runtime.listFiles).mockResolvedValueOnce(nodes('later external write'));
        await store.reloadFromRuntime();
        expect(store.files.get()[path]).toMatchObject({ content: 'later external write' });
      } finally {
        store.dispose();
      }
    },
  );

  it('preserves a mutation made after the listing started', async () => {
    const { runtime, store } = setup();
    const listing = deferred<ReturnType<typeof nodes>>();
    vi.mocked(runtime.listFiles).mockImplementationOnce(() => listing.promise);

    try {
      const reload = store.reloadFromRuntime();
      await store.saveFile(path, 'newer save');
      listing.resolve(nodes('old disk'));
      await reload;
      expect(store.files.get()[path]).toMatchObject({ content: 'newer save' });
    } finally {
      store.dispose();
    }
  });

  it.each(['same adapter', 'new adapter'] as const)(
    'does not apply a listing across a %s scope reset',
    async (kind) => {
      const { runtime, store } = setup();
      const listing = deferred<ReturnType<typeof nodes>>();
      vi.mocked(runtime.listFiles).mockImplementationOnce(() => listing.promise);

      try {
        const reload = store.reloadFromRuntime();
        store.setRuntime(kind === 'same adapter' ? runtime : makeRuntime(nodes('project B')));
        store.files.set({ [path]: { type: 'file', content: 'project B', isBinary: false } });
        listing.resolve(nodes('project A'));
        await reload;
        expect(store.files.get()[path]).toMatchObject({ content: 'project B' });
      } finally {
        store.dispose();
      }
    },
  );

  it('preserves the second optimistic save while the first queue entry completes', async () => {
    const { runtime, store } = setup();
    const first = deferred<void>();
    const second = deferred<void>();
    const startedFirst = deferred<void>();
    const startedSecond = deferred<void>();
    vi.mocked(runtime.writeFile)
      .mockImplementationOnce(() => {
        startedFirst.resolve();
        return first.promise;
      })
      .mockImplementationOnce(() => {
        startedSecond.resolve();
        return second.promise;
      });

    try {
      const saveOne = store.saveFile(path, 'first');
      await startedFirst.promise;

      const saveTwo = store.saveFile(path, 'second');
      first.resolve();
      await saveOne;
      await startedSecond.promise;
      await store.reloadFromRuntime();
      expect(store.files.get()[path]).toMatchObject({ content: 'second' });
      second.resolve();
      await saveTwo;
      expect(store.files.get()[path]).toMatchObject({ content: 'second' });
    } finally {
      store.dispose();
    }
  });
  it('does not let an old pending save shield the new scope from its own runtime listing', async () => {
    const { runtime, store } = setup();
    const write = deferred<void>();
    const started = deferred<void>();
    vi.mocked(runtime.writeFile).mockImplementationOnce(() => {
      started.resolve();
      return write.promise;
    });

    try {
      const save = store.saveFile(path, 'A draft');
      const rejected = expect(save).rejects.toMatchObject({ code: 'FILE_SAVE_SCOPE_CHANGED' });
      await started.promise;
      store.setRuntime(runtime, 'project-B');
      store.files.set({ [path]: { type: 'file', content: 'B cached', isBinary: false } });
      vi.mocked(runtime.listFiles).mockResolvedValueOnce(nodes('B fresh disk'));
      await store.reloadFromRuntime();
      expect(store.files.get()[path]).toMatchObject({ content: 'B fresh disk' });
      write.resolve();
      await rejected;
      expect(store.files.get()[path]).toMatchObject({ content: 'B fresh disk' });
    } finally {
      store.dispose();
    }
  });
  it('starts a new-scope save without waiting for the old scope write at the same path', async () => {
    const { runtime, store } = setup();
    const oldWrite = deferred<void>();
    const oldStarted = deferred<void>();
    vi.mocked(runtime.writeFile).mockImplementationOnce(() => {
      oldStarted.resolve();
      return oldWrite.promise;
    });

    const nextRuntime = makeRuntime(nodes('B disk'));
    const nextWrite = deferred<void>();
    Object.assign(nextRuntime, { mode: 'test', writeFile: vi.fn(() => nextWrite.promise) });

    try {
      const saveA = store.saveFile(path, 'A draft');
      const rejectedA = expect(saveA).rejects.toMatchObject({ code: 'FILE_SAVE_SCOPE_CHANGED' });
      await oldStarted.promise;
      store.setRuntime(nextRuntime, 'project-B');
      store.files.set({ [path]: { type: 'file', content: 'B disk', isBinary: false } });

      const saveB = store.saveFile(path, 'B draft');

      // Drain the already-scheduled promise jobs, without releasing A or adding a timer.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect.soft(nextRuntime.writeFile).toHaveBeenCalledWith('audit.txt', 'B draft');
      oldWrite.resolve();
      await rejectedA;
      await Promise.resolve();
      await store.reloadFromRuntime();

      // A's finally must not delete the queue entry protecting B's pending write.
      expect(store.files.get()[path]).toMatchObject({ content: 'B draft' });
      nextWrite.resolve();
      await expect(saveB).resolves.toBe('B draft');
    } finally {
      store.dispose();
    }
  });
  it('does not let an old adapter overwrite a later successful save to the same destination', async () => {
    let disk = 'initial disk';

    const firstRuntime = makeRuntime(nodes(disk));
    const oldWrite = deferred<void>();
    const oldStarted = deferred<void>();
    Object.assign(firstRuntime, {
      mode: 'test',
      writeFile: vi.fn(async (_path: string, content: string) => {
        oldStarted.resolve();
        await oldWrite.promise;
        disk = content;
      }),
    });

    const secondRuntime = makeRuntime(nodes(disk));
    Object.assign(secondRuntime, {
      mode: 'test',
      writeFile: vi.fn(async (_path: string, content: string) => {
        disk = content;
      }),
      listFiles: vi.fn(async () => nodes(disk)),
    });

    const store = new FilesStore(firstRuntime);
    store.files.set({ [path]: { type: 'file', content: disk, isBinary: false } });

    try {
      const saveA = store.saveFile(path, 'EARLIER SAVE');
      const rejectedA = expect(saveA).rejects.toMatchObject({ code: 'FILE_SAVE_SCOPE_CHANGED' });
      await oldStarted.promise;
      store.setRuntime(secondRuntime);
      store.files.set({ [path]: { type: 'file', content: disk, isBinary: false } });

      const saveB = store.saveFile(path, 'LATER SUCCESSFUL SAVE');
      await Promise.resolve();
      await Promise.resolve();
      expect(secondRuntime.writeFile).not.toHaveBeenCalled();
      oldWrite.resolve();
      await rejectedA;
      await expect(saveB).resolves.toBe('LATER SUCCESSFUL SAVE');
      expect(disk).toBe('LATER SUCCESSFUL SAVE');
      await store.reloadFromRuntime();
      expect(store.files.get()[path]).toMatchObject({ content: 'LATER SUCCESSFUL SAVE' });
    } finally {
      store.dispose();
    }
  });
  it('retains destination A queue through A to B to A while destination B writes independently', async () => {
    let diskA = 'A disk';
    let diskB = 'B disk';

    const first = deferred<void>();
    const started = deferred<void>();
    const runtimeA = makeRuntime(nodes(diskA));
    Object.assign(runtimeA, {
      mode: 'test',
      writeFile: vi.fn(async (_path: string, content: string) => {
        started.resolve();
        await first.promise;
        diskA = content;
      }),
    });

    const runtimeB = makeRuntime(nodes(diskB));
    Object.assign(runtimeB, {
      mode: 'test',
      writeFile: vi.fn(async (_path: string, content: string) => {
        diskB = content;
      }),
    });

    const runtimeAAgain = makeRuntime(nodes(diskA));
    Object.assign(runtimeAAgain, {
      mode: 'test',
      writeFile: vi.fn(async (_path: string, content: string) => {
        diskA = content;
      }),
    });

    const store = new FilesStore(runtimeA, 'destination-A');
    store.files.set({ [path]: { type: 'file', content: diskA, isBinary: false } });

    try {
      const oldA = store.saveFile(path, 'A earlier');
      const rejected = expect(oldA).rejects.toMatchObject({ code: 'FILE_SAVE_SCOPE_CHANGED' });
      await started.promise;
      store.setRuntime(runtimeB, 'destination-B');
      store.files.set({ [path]: { type: 'file', content: diskB, isBinary: false } });
      await expect(store.saveFile(path, 'B saved independently')).resolves.toBe('B saved independently');
      expect(diskB).toBe('B saved independently');
      expect(diskA).toBe('A disk');
      store.setRuntime(runtimeAAgain, 'destination-A');
      store.files.set({ [path]: { type: 'file', content: 'A current', isBinary: false } });

      const laterA = store.saveFile(path, 'A final');
      await Promise.resolve();
      await Promise.resolve();
      expect(runtimeAAgain.writeFile).not.toHaveBeenCalled();
      await store.reloadFromRuntime();
      expect(store.files.get()[path]).toMatchObject({ content: 'A current' });
      first.resolve();
      await rejected;
      await expect(laterA).resolves.toBe('A final');
      expect(diskA).toBe('A final');
      expect(store.files.get()[path]).toMatchObject({ content: 'A final' });
    } finally {
      store.dispose();
    }
  });
  it('rejects a remote save after the preceding same-destination write changed the disk baseline', async () => {
    let disk = 'initial remote disk';

    const first = deferred<void>();
    const started = deferred<void>();
    const runtimeA = makeRuntime(nodes(disk));
    Object.assign(runtimeA, {
      readFile: vi.fn(async () => ({ content: disk, encoding: 'utf8' as const })),
      writeFile: vi.fn(async (_path: string, content: string) => {
        started.resolve();
        await first.promise;
        disk = content;
      }),
    });

    const runtimeRebound = makeRuntime(nodes(disk));
    Object.assign(runtimeRebound, {
      readFile: vi.fn(async () => ({ content: disk, encoding: 'utf8' as const })),
      writeFile: vi.fn(async (_path: string, content: string) => {
        disk = content;
      }),
    });

    const store = new FilesStore(runtimeA, 'remote-project-A');
    store.files.set({ [path]: { type: 'file', content: disk, isBinary: false } });

    try {
      const earlier = store.saveFile(path, 'earlier remote write');
      const rejectedEarlier = expect(earlier).rejects.toMatchObject({ code: 'FILE_SAVE_SCOPE_CHANGED' });
      await started.promise;
      store.setRuntime(runtimeRebound, 'remote-project-A');
      store.files.set({ [path]: { type: 'file', content: disk, isBinary: false } });

      const later = store.saveFile(path, 'later remote draft');
      const conflict = expect(later).rejects.toMatchObject({ code: 'REMOTE_FILE_CHANGED', filePath: path });
      await Promise.resolve();
      await Promise.resolve();
      expect(runtimeRebound.readFile).not.toHaveBeenCalled();
      expect(runtimeRebound.writeFile).not.toHaveBeenCalled();
      first.resolve();
      await rejectedEarlier;
      await conflict;
      expect(runtimeRebound.readFile).toHaveBeenCalledWith('audit.txt');
      expect(runtimeRebound.writeFile).not.toHaveBeenCalled();
      expect(disk).toBe('earlier remote write');
    } finally {
      store.dispose();
    }
  });
});
