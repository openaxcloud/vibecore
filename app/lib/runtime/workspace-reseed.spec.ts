/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { FileNode } from '@vibecore/runtime-contract';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { reseedWorkspacePreservingOnFailure } from './workspace-reattach';
import {
  archiveFilePaths,
  reseedProjectTree,
  ReseedPreflightError,
  clearProjectTreeForReseed,
  collectPodTree,
  normalizeReseedPath,
  planReseedDeletions,
} from './workspace-reseed';

/*
 * BUG-CREATE-010 — trace réelle du 17/08 (mobile 390, nouvel appareil) :
 * la réouverture émettait un DELETE par entrée (`README.md`, `index.html`,
 * `package-lock.json`, `package.json`, `src`, `vite.config.ts`) puis un
 * import ; l'arbre clignotait 9 → 8 → 9 et `package-lock.json` (absent du
 * stockage canonique) était détruit. Ces tests rejouent EXACTEMENT ce
 * scénario : le nettoyage sélectif conserve les fichiers couverts, et un
 * préflight incomplet interdit toute suppression/import.
 */

async function zipOf(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();

  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }

  return zip.generateAsync({ type: 'uint8array' });
}

/** Le pod de la trace live : 6 entrées de premier niveau, dont un lockfile local. */
const LIVE_POD_LISTING: Record<string, FileNode[]> = {
  '.': [
    { path: 'README.md', name: 'README.md', type: 'file' },
    { path: 'index.html', name: 'index.html', type: 'file' },
    { path: 'package-lock.json', name: 'package-lock.json', type: 'file' },
    { path: 'package.json', name: 'package.json', type: 'file' },
    { path: 'src', name: 'src', type: 'directory' },
    { path: 'vite.config.ts', name: 'vite.config.ts', type: 'file' },
  ],
  src: [
    { path: 'src/App.tsx', name: 'App.tsx', type: 'file' },
    { path: 'src/main.tsx', name: 'main.tsx', type: 'file' },
  ],
};

/** L'archive canonique du même projet : tout SAUF package-lock.json. */
const LIVE_ARCHIVE_FILES = {
  'README.md': '# readme',
  'index.html': '<html></html>',
  'package.json': '{}',
  'src/App.tsx': 'export default function App() { return null; }',
  'src/main.tsx': 'render();',
  'vite.config.ts': 'export default {};',
};

function fakeRuntime(listing: Record<string, FileNode[]> = LIVE_POD_LISTING) {
  const deleted: string[] = [];
  const imported: string[] = [];

  return {
    deleted,
    imported,
    listFiles: async (path = '.') => {
      const nodes = listing[normalizeReseedPath(path) || '.'];

      if (!nodes) {
        throw new Error(`no listing for ${path}`);
      }

      return nodes;
    },
    deleteFile: async (path: string) => {
      deleted.push(path);
    },
  };
}

describe('normalizeReseedPath', () => {
  it('rend les chemins runtime et zip comparables', () => {
    expect(normalizeReseedPath('./src/App.tsx')).toBe('src/App.tsx');
    expect(normalizeReseedPath('/src/App.tsx')).toBe('src/App.tsx');
    expect(normalizeReseedPath('src/')).toBe('src');
    expect(normalizeReseedPath('src\\App.tsx')).toBe('src/App.tsx');
  });
});

describe('archiveFilePaths', () => {
  it('liste les fichiers (pas les répertoires) de l’archive canonique', async () => {
    const paths = await archiveFilePaths(await zipOf(LIVE_ARCHIVE_FILES));

    expect(paths).toBeDefined();
    expect([...(paths ?? [])].sort()).toEqual(Object.keys(LIVE_ARCHIVE_FILES).sort());
  });

  it('rend undefined sur une archive illisible (aucune permission de mutation)', async () => {
    await expect(archiveFilePaths(new Uint8Array([1, 2, 3, 4]))).resolves.toBeUndefined();
  });

  it('distingue une archive valide vide d’une archive illisible', async () => {
    await expect(archiveFilePaths(await zipOf({}))).resolves.toEqual(new Set());
  });
});

describe('planReseedDeletions — convergence, pas destruction', () => {
  const archive = new Set(Object.keys(LIVE_ARCHIVE_FILES));

  it('scénario live du 17/08 : plus AUCUNE suppression (avant : 6 DELETE)', async () => {
    const tree = await collectPodTree(fakeRuntime());

    expect(planReseedDeletions(tree, archive)).toEqual([]);
  });

  it('préserve package-lock.json même absent de l’archive canonique', async () => {
    const tree = await collectPodTree(fakeRuntime());
    const plan = planReseedDeletions(tree, archive);

    expect(plan).not.toContain('package-lock.json');
  });

  it('supprime un fichier que le stockage canonique ne connaît plus (renommage)', async () => {
    const listing: Record<string, FileNode[]> = {
      '.': [...LIVE_POD_LISTING['.']],
      src: [...LIVE_POD_LISTING.src, { path: 'src/Old.tsx', name: 'Old.tsx', type: 'file' }],
    };

    const plan = planReseedDeletions(await collectPodTree(fakeRuntime(listing)), archive);

    expect(plan).toEqual(['src/Old.tsx']);
  });

  it('supprime les feuilles obsolètes sans supprimer leur répertoire parent', async () => {
    const listing: Record<string, FileNode[]> = {
      '.': [...LIVE_POD_LISTING['.'], { path: 'legacy', name: 'legacy', type: 'directory' }],
      src: LIVE_POD_LISTING.src,
      legacy: [{ path: 'legacy/old.js', name: 'old.js', type: 'file' }],
    };

    const plan = planReseedDeletions(await collectPodTree(fakeRuntime(listing)), archive);

    expect(plan).toEqual(['legacy/old.js']);
  });

  it('ne touche jamais node_modules ni .git, à aucune profondeur', () => {
    const plan = planReseedDeletions(
      [
        { path: 'node_modules', type: 'directory', children: [] },
        { path: '.git', type: 'directory', children: [] },
        {
          path: 'packages',
          type: 'directory',
          children: [
            { path: 'packages/app/pnpm-lock.yaml', type: 'file' },
            { path: 'packages/app/node_modules', type: 'directory', children: [] },
          ],
        },
      ],
      new Set(['packages/app/index.ts']),
    );

    expect(plan).toEqual([]);
  });
});

describe('clearProjectTreeForReseed', () => {
  it('mode sélectif : zéro DELETE sur le scénario live, lockfile intact', async () => {
    const runtime = fakeRuntime();

    const outcome = await clearProjectTreeForReseed(runtime, new Set(Object.keys(LIVE_ARCHIVE_FILES)));

    expect(outcome).toEqual({ mode: 'selective', deleted: 0 });
    expect(runtime.deleted).toEqual([]);
  });

  it('refuse les chemins inconnus avant toute suppression', async () => {
    const runtime = fakeRuntime();

    await expect(clearProjectTreeForReseed(runtime, undefined)).rejects.toThrow('archive paths');
    expect(runtime.deleted).toEqual([]);
  });

  it('parcours du pod en échec : aucune suppression sur un plan partiel', async () => {
    const runtime = fakeRuntime({
      '.': [
        { path: 'a.txt', name: 'a.txt', type: 'file' },
        { path: 'broken', name: 'broken', type: 'directory' },
      ],

      // Aucun listing pour broken: le parcours doit échouer avant toute mutation.
    });

    await expect(clearProjectTreeForReseed(runtime, new Set(['a.txt']))).rejects.toThrow('incomplete runtime tree');
    expect(runtime.deleted).toEqual([]);
  });
});

describe('reseed complet (fetch -> clear sélectif -> import), câblage du provider', () => {
  it('rejoue la réouverture nouvel appareil : les fichiers canoniques ne sont jamais supprimés, package-lock.json survit', async () => {
    const runtime = fakeRuntime();
    const archive = await zipOf(LIVE_ARCHIVE_FILES);

    let canonicalArchivePaths: ReadonlySet<string> | undefined;

    await reseedWorkspacePreservingOnFailure({
      fetchArchive: async () => {
        canonicalArchivePaths = await archiveFilePaths(archive);
        return archive;
      },
      clearTree: async () => {
        await clearProjectTreeForReseed(runtime, canonicalArchivePaths);
      },
      applyArchive: async () => {
        runtime.imported.push('.');
      },
    });

    expect(runtime.deleted).toEqual([]); // avant correctif : 6 DELETE, arbre 9 -> 8 -> 9
    expect(runtime.imported).toEqual(['.']); // l’import écrase les fichiers en place
  });

  it('un export en échec ne supprime toujours RIEN (garantie fetch-first conservée)', async () => {
    const runtime = fakeRuntime();

    await expect(
      reseedWorkspacePreservingOnFailure({
        fetchArchive: async () => {
          throw new Error('export 502');
        },
        clearTree: async () => {
          await clearProjectTreeForReseed(runtime, undefined);
        },
        applyArchive: async () => undefined,
      }),
    ).rejects.toThrow('export 502');

    expect(runtime.deleted).toEqual([]);
  });
});

describe('reseed preflight preservation', () => {
  it.each(['invalid', 'empty', 'incomplete'] as const)('blocks import and preserves the tree: %s', async (kind) => {
    const runtime = fakeRuntime(kind === 'incomplete' ? { '.': LIVE_POD_LISTING['.'] } : undefined);

    const archive =
      kind === 'invalid' ? new Uint8Array([1, 2, 3]) : await zipOf(kind === 'empty' ? {} : LIVE_ARCHIVE_FILES);

    let paths: ReadonlySet<string> | undefined;

    await expect(
      reseedWorkspacePreservingOnFailure({
        fetchArchive: async () => {
          paths = await archiveFilePaths(archive);
          return archive;
        },
        clearTree: async () => {
          await clearProjectTreeForReseed(runtime, paths);
        },
        applyArchive: async () => {
          runtime.imported.push('.');
        },
      }),
    ).rejects.toThrow();
    expect(runtime.deleted).toEqual([]);
    expect(runtime.imported).toEqual([]);
  });

  it('accepts a genuinely empty project without deletion', async () => {
    const runtime = fakeRuntime({ '.': [] });
    const paths = await archiveFilePaths(await zipOf({}));
    expect(await clearProjectTreeForReseed(runtime, paths)).toEqual({ mode: 'empty', deleted: 0 });
    expect(runtime.deleted).toEqual([]);
  });

  it('refuses an over-budget tree before deletion or import', async () => {
    const runtime = fakeRuntime({
      '.': Array.from({ length: 5001 }, (_, index) => ({
        path: `file-${index}`,
        name: `file-${index}`,
        type: 'file' as const,
      })),
    });

    await expect(
      reseedWorkspacePreservingOnFailure({
        fetchArchive: async () => zipOf({ 'keep.txt': 'keep' }),
        clearTree: async () => {
          await clearProjectTreeForReseed(runtime, new Set(['keep.txt']));
        },
        applyArchive: async () => {
          runtime.imported.push('.');
        },
      }),
    ).rejects.toThrow('incomplete runtime tree');
    expect(runtime.deleted).toEqual([]);
    expect(runtime.imported).toEqual([]);
  });

  it.each(['invalid', 'empty-nonempty', 'incomplete', 'fetch'] as const)(
    'shared provider flow preserves preview and files on preflight refusal: %s',
    async (kind) => {
      const runtime = fakeRuntime(kind === 'incomplete' ? { '.': LIVE_POD_LISTING['.'] } : undefined);
      const events: string[] = [];
      await expect(
        reseedProjectTree({
          runtime,
          fetchArchive: async () => {
            if (kind === 'fetch') {
              throw new Error('fetch failed');
            }

            return kind === 'invalid'
              ? new Uint8Array([1, 2])
              : zipOf(kind === 'empty-nonempty' ? {} : LIVE_ARCHIVE_FILES);
          },
          beforeMutation: async () => {
            events.push('stop-preview');
          },
          applyArchive: async () => {
            events.push('import-and-synced-log');
          },
        }),
      ).rejects.toBeInstanceOf(ReseedPreflightError);
      expect(events).toEqual([]);
      expect(runtime.deleted).toEqual([]);
    },
  );

  it('empty-on-empty is a no-op without preview stop, import or synced log', async () => {
    const events: string[] = [];

    const result = await reseedProjectTree({
      runtime: fakeRuntime({ '.': [] }),
      fetchArchive: () => zipOf({}),
      beforeMutation: async () => {
        events.push('stop-preview');
      },
      applyArchive: async () => {
        events.push('import-and-synced-log');
      },
    });
    expect(result).toEqual({ mode: 'empty', deleted: 0 });
    expect(events).toEqual([]);
  });

  it('plans all reads before stopping preview and then deleting/importing', async () => {
    const events: string[] = [];
    await reseedProjectTree({
      runtime: {
        listFiles: async () => {
          events.push('list');
          return [{ path: 'old', name: 'old', type: 'file' }];
        },
        deleteFile: async () => {
          events.push('delete');
        },
      },
      fetchArchive: async () => {
        events.push('fetch');
        return zipOf({ 'new.txt': 'content' });
      },
      beforeMutation: async () => {
        events.push('stop-preview');
      },
      applyArchive: async () => {
        events.push('import');
      },
    });
    expect(events).toEqual(['fetch', 'list', 'stop-preview', 'delete', 'import']);
  });

  it.each(['delete', 'import'] as const)('does not classify %s failures as preflight refusals', async (step) => {
    const failure = new Error('write failed');
    const events: string[] = [];
    await expect(
      reseedProjectTree({
        runtime: {
          listFiles: async () => [{ path: 'old', name: 'old', type: 'file' }],
          deleteFile: async () => {
            if (step === 'delete') {
              throw failure;
            }
          },
        },
        fetchArchive: () => zipOf({ 'new.txt': 'content' }),
        beforeMutation: async () => {
          events.push('stop-preview');
        },
        applyArchive: async () => {
          events.push('import');
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(failure).not.toBeInstanceOf(ReseedPreflightError);
    expect(events).toEqual(step === 'delete' ? ['stop-preview'] : ['stop-preview', 'import']);
  });

  it('provider uses the shared flow and excludes only preflight refusals from teardown', () => {
    const source = readFileSync(new URL('./ProjectWorkspaceProvider.tsx', import.meta.url), 'utf8');
    expect(source).toContain('await reseedProjectTree({');
    expect(source).toContain('!(error instanceof ReseedPreflightError) && !isTransientRuntimeError(error)');
    expect(source).toContain('workbenchStore.workspaceError.set(message)');
  });
  it.each(['before-stop', 'during-stop', 'empty'] as const)(
    'obsolete scope stops without mutations: %s',
    async (phase) => {
      let current = true;

      const expired = new Error('obsolete');
      const events: string[] = [];
      const runtime = fakeRuntime(phase === 'empty' ? { '.': [] } : undefined);
      await expect(
        reseedProjectTree({
          runtime,
          fetchArchive: async () => {
            if (phase !== 'during-stop') {
              current = false;
            }

            return zipOf(phase === 'empty' ? {} : LIVE_ARCHIVE_FILES);
          },
          assertCurrent: () => {
            if (!current) {
              throw expired;
            }
          },
          beforeMutation: async () => {
            events.push('stop-A');
            current = false;
          },
          applyArchive: async () => {
            events.push('import');
          },
        }),
      ).rejects.toBe(expired);
      expect(runtime.deleted).toEqual([]);
      expect(events).toEqual(phase === 'during-stop' ? ['stop-A'] : []);
    },
  );
});

describe('orphan directory preservation', () => {
  it('preserves nested lockfiles even when no archive entry covers their parent', () => {
    const plan = planReseedDeletions(
      [
        {
          path: 'old',
          type: 'directory',
          children: [
            { path: 'old/package-lock.json', type: 'file' },
            { path: 'old/pnpm-lock.yaml', type: 'file' },
            { path: 'old/yarn.lock', type: 'file' },
            { path: 'old/bun.lockb', type: 'file' },
            { path: 'old/stale.ts', type: 'file' },
          ],
        },
      ],
      new Set(['keep.txt']),
    );
    expect(plan).toEqual(['old/stale.ts']);
  });

  it('preserves an apparently empty directory whose protected descendants may be hidden', () => {
    expect(planReseedDeletions([{ path: 'old', type: 'directory', children: [] }], new Set(['keep.txt']))).toEqual([]);
  });

  it.each(['old', 'old/node_modules', 'old/.git'])(
    'refuses an archive file replacing directory %s before any mutation',
    async (path) => {
      const runtime = fakeRuntime({
        '.': [
          { path: 'obsolete.txt', name: 'obsolete.txt', type: 'file' },
          { path, name: path.split('/').pop()!, type: 'directory', children: [] },
        ],
      });

      const events: string[] = [];
      await expect(
        reseedProjectTree({
          runtime,
          fetchArchive: () => zipOf({ [path]: 'new file' }),
          beforeMutation: async () => {
            events.push('stop');
          },
          applyArchive: async () => {
            events.push('import');
          },
        }),
      ).rejects.toBeInstanceOf(ReseedPreflightError);
      expect(runtime.deleted).toEqual([]);
      expect(events).toEqual([]);
    },
  );

  it('allows replacing an ordinary file by a directory through selective leaf deletion', () => {
    expect(planReseedDeletions([{ path: 'old', type: 'file' }], new Set(['old/new.txt']))).toEqual(['old']);
  });

  it('refuses replacing a preserved lockfile with an archive directory', () => {
    expect(() =>
      planReseedDeletions([{ path: 'package-lock.json', type: 'file' }], new Set(['package-lock.json/new.txt'])),
    ).toThrow(ReseedPreflightError);
  });

  it('preserves hidden installation and VCS bytes on a real disposable filesystem', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibecore-reseed-orphan-'));

    const before = {
      'old/package-lock.json': 'lock-before',
      'old/node_modules/sentinel': 'dependencies-before',
      'old/.git/sentinel': 'git-before',
      'old/deep/yarn.lock': 'nested-lock-before',
      'old/stale.ts': 'obsolete',
      'keep.txt': 'before',
    };

    const deleted: string[] = [];
    const events: string[] = [];

    try {
      for (const [path, bytes] of Object.entries(before)) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), bytes);
      }

      const runtime = {
        listFiles: async (path = '.'): Promise<FileNode[]> => {
          const entries = await readdir(join(root, path), { withFileTypes: true });
          return entries
            .filter((entry) => !['node_modules', '.git'].includes(entry.name))
            .map((entry) => ({
              name: entry.name,
              path: path === '.' ? entry.name : `${path}/${entry.name}`,
              type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
            }));
        },
        deleteFile: async (path: string) => {
          deleted.push(path);
          await rm(join(root, path), { recursive: true, force: true });
        },
      };
      const outcome = await reseedProjectTree({
        runtime,
        fetchArchive: () => zipOf({ 'keep.txt': 'after' }),
        beforeMutation: async () => {
          events.push('stop');
        },
        applyArchive: async (archive) => {
          events.push('import');

          const zip = await JSZip.loadAsync(archive);

          for (const entry of Object.values(zip.files)) {
            if (entry.dir) {
              continue;
            }

            await mkdir(dirname(join(root, entry.name)), { recursive: true });
            await writeFile(join(root, entry.name), await entry.async('nodebuffer'));
          }
        },
      });
      expect(outcome).toEqual({ mode: 'selective', deleted: 1 });
      expect(deleted).toEqual(['old/stale.ts']);
      expect(events).toEqual(['stop', 'import']);

      for (const path of [
        'old/package-lock.json',
        'old/node_modules/sentinel',
        'old/.git/sentinel',
        'old/deep/yarn.lock',
      ] as const) {
        expect(await readFile(join(root, path), 'utf8')).toBe(before[path]);
      }
      await expect(readFile(join(root, 'old/stale.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(join(root, 'keep.txt'), 'utf8')).toBe('after');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
