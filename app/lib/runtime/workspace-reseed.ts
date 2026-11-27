/*
 * BUG-CREATE-010 — rouvrir un projet sur un NOUVEL appareil effaçait puis
 * reconstruisait tout l'espace de travail.
 *
 * La décision reattach-vs-reseed (`shouldReattachWarmWorkspace`) repose sur un
 * marqueur de seed DURABLE mais LOCAL AU NAVIGATEUR (localStorage). Un appareil
 * qui n'a jamais ouvert le projet n'a pas de marqueur : la réouverture part
 * donc en reseed. Mesuré en réel (17/08, mobile 390) : `DELETE` de CHAQUE
 * fichier (`README.md`, `index.html`, `package-lock.json`, `package.json`,
 * `src`, `vite.config.ts`) puis `POST /import` — l'arbre clignote 9 → 8 → 9,
 * `package-lock.json` est détruit (il n'existe pas dans le stockage canonique),
 * et aucun aperçu n'apparaît en 68 s.
 *
 * Changer la DÉCISION (adopter le pod sans marqueur) est un lot sensible qui a
 * déjà produit trois boucles auto-entretenues (voir BUG-RUNTIME-DIVERGENCE) et
 * exige une preuve live multi-appareils. Ce module traite l'autre moitié du
 * défaut, prouvable en tests : quand un reseed a lieu, il ne DÉTRUIT plus rien
 * d'utile — il fait CONVERGER l'arbre du pod vers l'archive canonique :
 *
 *   - un fichier présent dans l'archive n'est JAMAIS supprimé (l'import
 *     l'écrase en place — plus de fenêtre où l'arbre est vide) ;
 *   - seuls les fichiers absents de l'archive sont supprimés (parité avec
 *     l'ancien wipe : pas de fichier fantôme après un renommage) ;
 *   - les artefacts d'installation (`package-lock.json`, `pnpm-lock.yaml`,
 *     `yarn.lock`, `bun.lockb`) et `node_modules`/`.git` sont préservés — le
 *     stockage canonique ne les porte pas, les supprimer ne « synchronise »
 *     rien, cela détruit le travail de `npm install`.
 *
 * Une archive illisible ou un parcours incomplet bloque le reseed avant toute
 * mutation. Une archive vide ne peut confirmer qu’un workspace déjà vide.
 * Un échec pendant les suppressions/import valides reste non atomique.
 */
import type { FileNode, RuntimeAdapter } from '@vibecore/runtime-contract';
import JSZip from 'jszip';

/**
 * Noms préservés lors d'un reseed, à toute profondeur. Ce sont des artefacts
 * d'installation/VCS que le stockage canonique ne représente pas : les
 * supprimer ne fait converger vers rien, cela détruit un état local coûteux.
 * (`node_modules`/`.git` sont déjà exclus du listing runtime — la présence ici
 * est une ceinture, pas le mécanisme principal.)
 */
export const RESEED_PRESERVED_NAMES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
]);

/** Normalise un chemin runtime/zip en chemin relatif comparable (`src/App.tsx`). */
export function normalizeReseedPath(path: string): string {
  let normalized = path.replace(/\\/g, '/');

  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  return normalized.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Liste les chemins de FICHIERS d'une archive zip canonique.
 *
 * Rend `undefined` si le ZIP est illisible.
 * Un ensemble vide désigne une archive valide sans fichiers, pas une permission
 * de supprimer le contenu du workspace.
 */
export async function archiveFilePaths(archive: Uint8Array): Promise<ReadonlySet<string> | undefined> {
  try {
    const zip = await JSZip.loadAsync(archive);
    const paths = new Set<string>();

    zip.forEach((relativePath, entry) => {
      if (entry.dir) {
        return;
      }

      const normalized = normalizeReseedPath(relativePath);

      if (normalized) {
        paths.add(normalized);
      }
    });

    return paths;
  } catch {
    return undefined;
  }
}

export interface PodTreeNode {
  path: string;
  type: 'file' | 'directory';
  children?: PodTreeNode[];
}

/** Bornes du parcours : au-delà, on refuse toute mutation sur un plan partiel. */
const POD_TREE_MAX_DEPTH = 12;
const POD_TREE_MAX_ENTRIES = 5000;

/**
 * Parcourt l'arbre du pod (réutilise `children` quand le runtime le fournit,
 * sinon liste chaque répertoire). Jette si les bornes sont dépassées — le
 * plan serait alors partiel, et supprimer sur un plan partiel est exactement
 * le genre de « remède » destructeur que ce module remplace.
 */
export async function collectPodTree(runtime: Pick<RuntimeAdapter, 'listFiles'>, path = '.'): Promise<PodTreeNode[]> {
  const budget = { remaining: POD_TREE_MAX_ENTRIES };

  const walk = async (nodes: FileNode[], depth: number): Promise<PodTreeNode[]> => {
    if (depth > POD_TREE_MAX_DEPTH) {
      throw new Error('workspace-reseed: pod tree deeper than the walk budget');
    }

    const out: PodTreeNode[] = [];

    for (const node of nodes) {
      if (--budget.remaining < 0) {
        throw new Error('workspace-reseed: pod tree larger than the walk budget');
      }

      if (node.type === 'directory') {
        const children = node.children !== undefined ? node.children : await runtime.listFiles(node.path);

        out.push({ path: node.path, type: 'directory', children: await walk(children, depth + 1) });
      } else {
        out.push({ path: node.path, type: 'file' });
      }
    }

    return out;
  };

  return walk(await runtime.listFiles(path), 0);
}

/**
 * Plan de suppressions pour faire converger le pod vers l'archive canonique.
 * Pur et donc testable : ne supprime rien lui-même.
 *
 *   - fichier du pod présent dans l'archive  -> conservé (l'import l'écrase) ;
 *   - fichier du pod absent de l'archive     -> supprimé (parité avec le wipe) ;
 *   - répertoire, même sans fichier d'archive -> conservé, suppression des feuilles ;
 *   - conflit répertoire vers fichier         -> refus avant toute mutation ;
 *   - noms préservés (`RESEED_PRESERVED_NAMES`) -> jamais supprimés.
 */
export function planReseedDeletions(tree: readonly PodTreeNode[], archivePaths: ReadonlySet<string>): string[] {
  const deletions: string[] = [];

  const visit = (nodes: readonly PodTreeNode[]) => {
    for (const node of nodes) {
      const relative = normalizeReseedPath(node.path);

      if (!relative) {
        continue;
      }

      /*
       * Listings omit node_modules/.git. Even an apparently empty directory may
       * contain protected descendants, so never issue a recursive parent delete.
       * A file at the same archive path cannot be imported without removing that
       * directory: refuse the complete plan before preview stop or any mutation.
       */
      if (node.type === 'directory' && archivePaths.has(relative)) {
        throw new ReseedPreflightError('workspace-reseed: archive file conflicts with a runtime directory');
      }

      const preserved = relative.split('/').some((name) => RESEED_PRESERVED_NAMES.has(name));

      if (preserved) {
        if (node.type === 'file' && [...archivePaths].some((path) => path.startsWith(`${relative}/`))) {
          throw new ReseedPreflightError('workspace-reseed: archive directory conflicts with a preserved file');
        }

        continue;
      }

      if (node.type === 'file') {
        if (!archivePaths.has(relative)) {
          deletions.push(node.path);
        }

        continue;
      }

      visit(node.children ?? []);
    }
  };

  visit(tree);

  return deletions;
}

export interface ReseedClearOutcome {
  mode: 'selective' | 'empty';
  deleted: number;
}

/** A refusal before mutations; preserve the running workspace and preview. */
export class ReseedPreflightError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ReseedPreflightError';
  }
}

async function prepareReseedPlan(
  runtime: Pick<RuntimeAdapter, 'listFiles'>,
  archivePaths: ReadonlySet<string> | undefined,
): Promise<{ mode: ReseedClearOutcome['mode']; deletions: string[] }> {
  if (archivePaths === undefined) {
    throw new ReseedPreflightError('workspace-reseed: archive paths could not be validated');
  }

  let tree: PodTreeNode[];

  try {
    tree = await collectPodTree(runtime);
  } catch (cause) {
    throw new ReseedPreflightError('workspace-reseed: incomplete runtime tree', cause);
  }

  if (archivePaths.size === 0) {
    if (tree.length > 0) {
      throw new ReseedPreflightError('workspace-reseed: empty archive cannot replace an existing tree');
    }

    return { mode: 'empty', deletions: [] };
  }

  return { mode: 'selective', deletions: planReseedDeletions(tree, archivePaths) };
}

/** Complete the read-only plan before any deletion; never fall back to a wipe. */
export async function clearProjectTreeForReseed(
  runtime: Pick<RuntimeAdapter, 'listFiles' | 'deleteFile'>,
  archivePaths: ReadonlySet<string> | undefined,
): Promise<ReseedClearOutcome> {
  const plan = await prepareReseedPlan(runtime, archivePaths);

  for (const path of plan.deletions) {
    await runtime.deleteFile(path);
  }

  return { mode: plan.mode, deleted: plan.deletions.length };
}

/**
 * Shared provider flow: read-only preflight, then preview stop and mutations.
 * ZIP paths are inspected without eager decompression; CRC/import integrity is
 * not proven. Valid imports and concurrent writers are not made atomic here.
 */
export async function reseedProjectTree(steps: {
  runtime: Pick<RuntimeAdapter, 'listFiles' | 'deleteFile'>;
  fetchArchive: () => Promise<Uint8Array>;
  beforeMutation: () => Promise<void>;
  assertCurrent?: () => void;
  applyArchive: (archive: Uint8Array) => Promise<void>;
}): Promise<ReseedClearOutcome> {
  let archive: Uint8Array;
  let plan: Awaited<ReturnType<typeof prepareReseedPlan>>;

  try {
    archive = await steps.fetchArchive();
    plan = await prepareReseedPlan(steps.runtime, await archiveFilePaths(archive));
  } catch (cause) {
    if (cause instanceof ReseedPreflightError) {
      throw cause;
    }

    throw new ReseedPreflightError('workspace-reseed: archive preflight failed', cause);
  }

  steps.assertCurrent?.();

  if (plan.mode === 'empty') {
    return { mode: 'empty', deleted: 0 };
  }

  await steps.beforeMutation();
  steps.assertCurrent?.();

  for (const path of plan.deletions) {
    steps.assertCurrent?.();
    await steps.runtime.deleteFile(path);
  }

  steps.assertCurrent?.();
  await steps.applyArchive(archive);
  steps.assertCurrent?.();

  return { mode: plan.mode, deleted: plan.deletions.length };
}
