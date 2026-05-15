/**
 * Topological ordering for multi-file patch application (Phase 0 #3).
 *
 * Bulk file-action apply currently runs in source order, which means a
 * module that imports a freshly-created sibling sees an
 * `Error: Cannot find module …` before the sibling lands. The order
 * doesn't matter once everything is written — but during the apply
 * window the runtime can transiently fail.
 *
 * `topologicallySortFileActions` builds an import-graph from a regex
 * scan (full TS resolution would be over-engineering for the leaves-
 * first ordering goal) and returns the actions in dependency order:
 * files with no internal imports first, files that import them next,
 * and so on. Cycles fall back to source order — better one transient
 * failure than infinite recursion.
 *
 * This module is pure and node-testable; the workbenchStore call site
 * passes in its current set of file actions.
 */

export interface TopologicalFileAction {
  /** Absolute or relative path; used as the graph key. */
  filePath: string;

  /** Raw file content the regex scanner inspects for imports. */
  content: string;
}

export interface TopologicallySortResult<T extends TopologicalFileAction> {
  /** Actions in apply order. */
  ordered: T[];

  /**
   * True when the original input was kept verbatim because the graph
   * has a cycle. Callers can log this and fall back to retries.
   */
  cyclic: boolean;

  /**
   * Filenames involved in any detected cycle, for diagnostics.
   */
  cycleParticipants: string[];
}

const IMPORT_PATTERNS: readonly RegExp[] = [
  // `import x from './path'` / `import { x } from "./path"`
  /^\s*import\s+(?:[^;'"`]*?\s+from\s+)?['"]([^'"]+)['"]\s*;?/gm,

  // `import('./path')`
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,

  // `export … from './path'`
  /^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]\s*;?/gm,

  // `require('./path')`
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Extract the unresolved import specifiers from a file's source. We
 * intentionally don't resolve `node_modules` or absolute paths — only
 * the relative siblings that we care about for graph edges.
 */
export function extractRelativeImports(source: string): string[] {
  const seen = new Set<string>();

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      const spec = match[1];

      if (!spec) {
        continue;
      }

      if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) {
        seen.add(spec);
      }
    }
  }

  return Array.from(seen);
}

function normaliseKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function dirname(path: string): string {
  const normalised = normaliseKey(path);
  const idx = normalised.lastIndexOf('/');

  return idx === -1 ? '' : normalised.slice(0, idx);
}

function joinPath(base: string, rel: string): string {
  if (rel.startsWith('/')) {
    return normaliseKey(rel.slice(1));
  }

  const parts = (base ? base.split('/').filter(Boolean) : []).concat(rel.split('/').filter(Boolean));
  const stack: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      stack.pop();
    } else if (part !== '.' && part !== '') {
      stack.push(part);
    }
  }

  return stack.join('/');
}

const IMPLICIT_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const IMPLICIT_INDEX = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs', 'index.cjs'];

function resolveImport(fromFile: string, importSpec: string, known: Set<string>): string | undefined {
  const baseDir = dirname(fromFile);
  const candidateBase = joinPath(baseDir, importSpec);

  for (const ext of IMPLICIT_EXTENSIONS) {
    const candidate = candidateBase + ext;

    if (known.has(candidate)) {
      return candidate;
    }
  }

  for (const indexFile of IMPLICIT_INDEX) {
    const candidate = `${candidateBase}/${indexFile}`;

    if (known.has(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Topologically sort the input actions so that imported siblings land
 * before importing modules. Returns the original order plus a cycle
 * flag when the import graph isn't a DAG.
 */
export function topologicallySortFileActions<T extends TopologicalFileAction>(
  actions: readonly T[],
): TopologicallySortResult<T> {
  if (actions.length < 2) {
    return { ordered: [...actions], cyclic: false, cycleParticipants: [] };
  }

  const known = new Set<string>();
  const byPath = new Map<string, T>();

  for (const action of actions) {
    const key = normaliseKey(action.filePath);
    known.add(key);
    byPath.set(key, action);
  }

  /*
   * Build an adjacency list: edge `from → to` means `from` depends on
   * `to` (i.e. `to` must land first). Edges that point outside the
   * `known` set (third-party imports, node_modules) are ignored.
   */
  const edges = new Map<string, Set<string>>();

  for (const action of actions) {
    const key = normaliseKey(action.filePath);
    const deps = new Set<string>();
    edges.set(key, deps);

    for (const spec of extractRelativeImports(action.content)) {
      const resolved = resolveImport(key, spec, known);

      if (resolved && resolved !== key) {
        deps.add(resolved);
      }
    }
  }

  /*
   * Kahn's algorithm: peel off nodes with no remaining dependencies in
   * stable input order; whenever we can't peel anything, the rest
   * forms a cycle.
   */
  const remainingDeps = new Map<string, Set<string>>();
  const reverseEdges = new Map<string, Set<string>>();

  for (const [from, deps] of edges) {
    remainingDeps.set(from, new Set(deps));

    for (const to of deps) {
      let reverse = reverseEdges.get(to);

      if (!reverse) {
        reverse = new Set();
        reverseEdges.set(to, reverse);
      }

      reverse.add(from);
    }
  }

  const ordered: T[] = [];
  const ready: string[] = [];

  for (const action of actions) {
    const key = normaliseKey(action.filePath);

    if ((remainingDeps.get(key)?.size ?? 0) === 0) {
      ready.push(key);
    }
  }

  while (ready.length > 0) {
    const key = ready.shift()!;
    const action = byPath.get(key);

    if (action) {
      ordered.push(action);
    }

    for (const dependent of reverseEdges.get(key) ?? []) {
      const deps = remainingDeps.get(dependent);

      if (!deps) {
        continue;
      }

      deps.delete(key);

      if (deps.size === 0) {
        ready.push(dependent);
      }
    }
  }

  if (ordered.length === actions.length) {
    return { ordered, cyclic: false, cycleParticipants: [] };
  }

  /*
   * Cycle detected — collect participants for diagnostics and fall
   * back to the original input order so the writer at least tries
   * every file once.
   */
  const cycleParticipants: string[] = [];

  for (const [key, deps] of remainingDeps) {
    if (deps.size > 0) {
      cycleParticipants.push(key);
    }
  }

  return { ordered: [...actions], cyclic: true, cycleParticipants };
}
