/**
 * @vitest-environment node
 */
import type { FileNode } from '@vibecore/runtime-contract';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { reseedWorkspacePreservingOnFailure } from './workspace-reattach';
import {
  archiveFilePaths,
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
 * scénario : l'ancien nettoyage (repli `full`) reproduit la casse, le
 * nettoyage sélectif ne supprime plus rien.
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

  it('rend undefined sur une archive illisible (repli wipe historique)', async () => {
    await expect(archiveFilePaths(new Uint8Array([1, 2, 3, 4]))).resolves.toBeUndefined();
  });

  it('rend undefined sur une archive sans aucun fichier — jamais « converger vers vide »', async () => {
    await expect(archiveFilePaths(await zipOf({}))).resolves.toBeUndefined();
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

  it('supprime d’un bloc un répertoire que l’archive ne couvre plus', async () => {
    const listing: Record<string, FileNode[]> = {
      '.': [...LIVE_POD_LISTING['.'], { path: 'legacy', name: 'legacy', type: 'directory' }],
      src: LIVE_POD_LISTING.src,
      legacy: [{ path: 'legacy/old.js', name: 'old.js', type: 'file' }],
    };

    const plan = planReseedDeletions(await collectPodTree(fakeRuntime(listing)), archive);

    expect(plan).toEqual(['legacy']);
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

  it('repli historique (archive illisible => paths undefined) : reproduit la casse mesurée — 6 DELETE dont package-lock.json', async () => {
    const runtime = fakeRuntime();

    const outcome = await clearProjectTreeForReseed(runtime, undefined);

    expect(outcome.mode).toBe('full');
    expect(runtime.deleted).toHaveLength(6);
    expect(runtime.deleted).toContain('package-lock.json');
  });

  it('parcours du pod en échec : repli sur le wipe historique, jamais un plan partiel', async () => {
    const runtime = fakeRuntime({
      '.': [
        { path: 'a.txt', name: 'a.txt', type: 'file' },
        { path: 'broken', name: 'broken', type: 'directory' },
      ],

      // aucun listing pour `broken` => collectPodTree jette => repli full.
    });

    const outcome = await clearProjectTreeForReseed(runtime, new Set(['a.txt']));

    expect(outcome.mode).toBe('full');
    expect(runtime.deleted).toEqual(['a.txt', 'broken']);
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
