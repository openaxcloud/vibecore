/**
 * Reconcile default-import / named-export mismatches in generated projects.
 *
 * A recurring generation defect leaves the app blank at runtime: the Vite entry
 * imports a component as a DEFAULT export while the component file only exports
 * it as a NAMED export, e.g.
 *
 *     // src/main.tsx
 *     import App from './App';        // expects a default export
 *     // src/App.tsx
 *     export function App() { ... }   // …but only a named export exists
 *
 * The browser then throws
 *     SyntaxError: The requested module '/src/App.tsx' does not provide an
 *     export named 'default'
 * and nothing mounts.
 *
 * This module is a pure, dependency-free fixer: given the entry file content and
 * the contents of the sibling modules it default-imports, it returns the minimal
 * set of file rewrites that make the two consistent — by appending
 * `export default <Name>;` to a module that already exports `<Name>` as a named
 * binding. It NEVER invents a component and only touches a file when a matching
 * named export exists, so a genuinely missing export still fails loudly (and is
 * left to self-repair / the review queue).
 */

/** A default import parsed out of the entry: `import <localName> from '<spec>'`. */
export interface DefaultImport {
  localName: string;

  /** The raw module specifier, e.g. `./App` or `./components`. */
  spec: string;
}

const DEFAULT_IMPORT_RE = /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s*['"](\.[^'"]+)['"]/g;

/**
 * Parse `import Foo from './Bar'` default imports of RELATIVE modules from the
 * entry. Ignores type-only imports, namespace imports, and bare/package imports
 * (only relative specifiers starting with '.' can resolve to a sibling we own).
 */
export function parseDefaultImports(entryContent: string): DefaultImport[] {
  const out: DefaultImport[] = [];
  const seen = new Set<string>();

  for (const match of entryContent.matchAll(DEFAULT_IMPORT_RE)) {
    // Skip `import type Foo from …` — those are erased and never need a runtime export.
    const preceding = entryContent.slice(Math.max(0, match.index - 5), match.index + 'import '.length);

    if (/import\s+type\s/.test(preceding)) {
      continue;
    }

    const localName = match[1];
    const spec = match[2];
    const key = `${localName}:${spec}`;

    if (!seen.has(key)) {
      seen.add(key);
      out.push({ localName, spec });
    }
  }

  return out;
}

/** True when the module already exposes a default export (any of the forms). */
export function hasDefaultExport(content: string): boolean {
  // `export default …`, `export { X as default }`, `export { default } from …`.
  return /(^|\n)\s*export\s+default\b/.test(content) || /export\s*\{[^}]*\bas\s+default\b[^}]*\}/.test(content);
}

/**
 * True when `name` is a LOCAL binding that is exported — i.e. usable as the
 * operand of a synthesized `export default <name>`. Matches
 * `export const/let/var/function/class Name`, or an `export { … }` clause where
 * `Name` is the LOCAL side (`export { Name }` / `export { Name as X }`).
 *
 * Deliberately returns false for `export { A as Name }`: that exports the NAME
 * `Name` but the local binding is `A`, so `export default Name` would be a
 * reference error. Such (rare) cases are left untouched rather than mis-fixed.
 */
export function hasNamedExport(content: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (new RegExp(`export\\s+(?:async\\s+)?(?:const|let|var|function\\*?|class)\\s+${escaped}\\b`).test(content)) {
    return true;
  }

  // `export { Foo, Name as Bar }` — match Name as a clause member (optionally aliased).
  for (const clause of content.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of clause[1].split(',')) {
      const local = part
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();

      if (local === name) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Candidate sibling paths a relative `spec` (from `entryPath`) can resolve to,
 * in resolution priority order (extensionless file, then extensions, then an
 * index barrel). Returned paths are normalized POSIX and relative to the project
 * root, matching the keys callers use for the file map.
 */
export function resolveSiblingCandidates(entryPath: string, spec: string): string[] {
  const dir = entryPath.includes('/') ? entryPath.slice(0, entryPath.lastIndexOf('/')) : '';
  const joined = normalizePosix(`${dir}/${spec}`);
  const exts = ['tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs'];

  const out: string[] = [joined];

  for (const ext of exts) {
    out.push(`${joined}.${ext}`);
  }

  for (const ext of exts) {
    out.push(`${joined}/index.${ext}`);
  }

  return out;
}

function normalizePosix(p: string): string {
  const parts: string[] = [];

  for (const segment of p.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }

    if (segment === '..') {
      parts.pop();
      continue;
    }

    parts.push(segment);
  }

  return parts.join('/');
}

/** Append a canonical default export for `name` to `content`. */
export function appendDefaultExport(content: string, name: string): string {
  const trimmed = content.replace(/\s+$/, '');

  return `${trimmed}\n\nexport default ${name};\n`;
}

/**
 * Given the entry file and the current project file map, return the minimal set
 * of `{ path -> newContent }` rewrites that fix default-import/named-export
 * mismatches. Only rewrites a target that (a) is default-imported by the entry,
 * (b) has NO default export, and (c) DOES have a matching named export.
 *
 * Pure: no IO, no mutation of the input map.
 */
export function reconcileEntryDefaultExports(
  entryPath: string,
  entryContent: string,
  files: Record<string, string>,
): Record<string, string> {
  const fixups: Record<string, string> = {};

  for (const { localName, spec } of parseDefaultImports(entryContent)) {
    for (const candidate of resolveSiblingCandidates(entryPath, spec)) {
      const target = files[candidate];

      if (target === undefined) {
        continue;
      }

      /*
       * Resolved the module. Only fix it if the default export is missing but a
       * matching named export exists; otherwise leave it untouched.
       */
      if (!hasDefaultExport(target) && hasNamedExport(target, localName)) {
        fixups[candidate] = appendDefaultExport(target, localName);
      }

      break; // first existing candidate is the resolved module; stop probing.
    }
  }

  return fixups;
}

/*
 * ---------------------------------------------------------------------------
 * Orchestration: apply the reconcile against a live workspace after a file
 * write. Kept here (not in action-runner) so it is unit-testable with a fake
 * runtime and never drags the action-runner internals into a test.
 * -------------------------------------------------------------------------
 */

/** The known Vite entry filenames, in resolution order. */
export const ENTRY_CANDIDATES = [
  'src/main.tsx',
  'src/main.jsx',
  'src/main.ts',
  'src/main.js',
  'src/index.tsx',
  'src/index.jsx',
  'main.tsx',
  'main.jsx',
];

/** Minimal runtime surface the reconcile needs — a subset of RuntimeAdapter. */
export interface ReconcileRuntime {
  readFile(relativePath: string): Promise<string | null | undefined>;
  writeFile(relativePath: string, content: string): Promise<void>;
}

function isReconcilableSource(relativePath: string): boolean {
  return /\.(tsx|jsx|ts|js|mjs|cjs)$/.test(relativePath) && !/\.d\.ts$/.test(relativePath);
}

async function safeRead(runtime: ReconcileRuntime, relativePath: string): Promise<string | undefined> {
  try {
    const content = await runtime.readFile(relativePath);

    return typeof content === 'string' ? content : undefined;
  } catch {
    return undefined;
  }
}

/**
 * After `writtenPath` is written, reconcile default-import/named-export
 * mismatches on the Vite entry ↔ its imported components. Robust to write order:
 * it triggers whether the entry OR a component was the file just written, and it
 * is idempotent (appending a default export it already added is a no-op because
 * `hasDefaultExport` then short-circuits). Best-effort: any IO failure is
 * swallowed so it never blocks or breaks the generation write path.
 *
 * Returns the list of paths it rewrote (for logging/tests).
 */
export async function applyEntryExportReconcile(runtime: ReconcileRuntime, writtenPath: string): Promise<string[]> {
  if (!isReconcilableSource(writtenPath)) {
    return [];
  }

  /*
   * Resolve the entry: the written file if it is itself an entry, else the first
   * existing standard entry.
   */
  let entryPath: string | undefined = ENTRY_CANDIDATES.includes(writtenPath) ? writtenPath : undefined;

  if (!entryPath) {
    for (const candidate of ENTRY_CANDIDATES) {
      if ((await safeRead(runtime, candidate)) !== undefined) {
        entryPath = candidate;
        break;
      }
    }
  }

  if (!entryPath) {
    return [];
  }

  const entryContent = await safeRead(runtime, entryPath);

  if (entryContent === undefined) {
    return [];
  }

  /*
   * Gather the current content of every default-imported sibling the entry
   * references, then run the pure reconcile over that small file map.
   */
  const files: Record<string, string> = {};

  for (const { spec } of parseDefaultImports(entryContent)) {
    for (const candidate of resolveSiblingCandidates(entryPath, spec)) {
      const content = await safeRead(runtime, candidate);

      if (content !== undefined) {
        files[candidate] = content;
        break;
      }
    }
  }

  const fixups = reconcileEntryDefaultExports(entryPath, entryContent, files);
  const written: string[] = [];

  for (const [path, content] of Object.entries(fixups)) {
    try {
      await runtime.writeFile(path, content);
      written.push(path);
    } catch {
      // Best-effort — a failed fixup write must not break the generation.
    }
  }

  return written;
}
