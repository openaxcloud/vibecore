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
 * Si l'archive est illisible ou le parcours du pod échoue, on retombe sur le
 * comportement historique (wipe complet) : le repli est l'ancien code, jamais
 * un état nouveau.
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
 * Rend `undefined` quand l'archive est illisible OU ne contient aucun fichier :
 * dans les deux cas l'appelant retombe sur le wipe historique plutôt que de
 * « converger » vers un ensemble vide (ce qui équivaudrait à tout supprimer sur
 * la foi d'une archive corrompue).
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

    return paths.size > 0 ? paths : undefined;
  } catch {
    return undefined;
  }
}

export interface PodTreeNode {
  path: string;
  type: 'file' | 'directory';
  children?: PodTreeNode[];
}

/** Bornes du parcours : au-delà, on préfère le repli historique à un plan partiel. */
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
 *   - répertoire sans AUCUN fichier d'archive -> supprimé d'un bloc ;
 *   - répertoire partiellement couvert        -> on descend, suppression fine ;
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

      const name = relative.split('/').pop() ?? relative;

      if (RESEED_PRESERVED_NAMES.has(name)) {
        continue;
      }

      if (node.type === 'file') {
        if (!archivePaths.has(relative)) {
          deletions.push(node.path);
        }

        continue;
      }

      const prefix = `${relative}/`;

      let archiveHasFileUnder = false;

      for (const archivePath of archivePaths) {
        if (archivePath.startsWith(prefix)) {
          archiveHasFileUnder = true;
          break;
        }
      }

      if (archiveHasFileUnder) {
        visit(node.children ?? []);
      } else {
        deletions.push(node.path);
      }
    }
  };

  visit(tree);

  return deletions;
}

export interface ReseedClearOutcome {
  mode: 'selective' | 'full';
  deleted: number;
}

/**
 * Étape `clearTree` du reseed (voir `reseedWorkspacePreservingOnFailure`).
 *
 * Sélective quand les chemins de l'archive sont connus ; repli sur le wipe
 * historique quand ils ne le sont pas ou quand le parcours du pod échoue. Les
 * erreurs de SUPPRESSION, elles, se propagent à l'appelant dans les deux modes
 * — exactement comme avant — pour qu'un pod à moitié nettoyé soit journalisé,
 * jamais silencieux.
 */
export async function clearProjectTreeForReseed(
  runtime: Pick<RuntimeAdapter, 'listFiles' | 'deleteFile'>,
  archivePaths: ReadonlySet<string> | undefined,
): Promise<ReseedClearOutcome> {
  if (archivePaths !== undefined && archivePaths.size > 0) {
    let plan: string[] | undefined;

    try {
      plan = planReseedDeletions(await collectPodTree(runtime), archivePaths);
    } catch (error) {
      console.error('Selective reseed clear failed; falling back to the historical full clear:', error);
    }

    if (plan !== undefined) {
      for (const path of plan) {
        await runtime.deleteFile(path);
      }

      return { mode: 'selective', deleted: plan.length };
    }
  }

  // Comportement historique : wipe du premier niveau (le serveur supprime récursivement).
  const nodes = await runtime.listFiles('.').catch(() => [] as FileNode[]);

  for (const node of nodes) {
    await runtime.deleteFile(node.path);
  }

  return { mode: 'full', deleted: nodes.length };
}
