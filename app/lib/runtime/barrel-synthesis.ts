/**
 * Barrel-index synthesis for generated projects.
 *
 * A common generation failure: the model writes `import { CityInput } from
 * './components'` (a BARREL import of a directory) but never creates
 * `src/components/index.ts`, so Vite can't resolve the directory and the app
 * renders blank. This scans the generated files for directory imports that lack
 * an index and synthesizes one that re-exports the directory's direct modules —
 * both named (`export *`) and default-as-named (`export { default as X }`) so it
 * works whether each module uses named or default exports.
 *
 * Pure + dependency-free (regex import extraction) so it is unit-testable and
 * safe to run in the preview-repair pass over the full file set.
 */

export interface SynthesizedBarrel {
  path: string;
  content: string;
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

function normalizePath(filePath: string): string {
  return filePath
    .replaceAll('\\', '/')
    .replace(/^\/?(?:home\/project|workspace)\//, '')
    .replace(/^\.?\/+/, '');
}

function collapseSegments(filePath: string): string {
  const segments: string[] = [];

  for (const segment of filePath.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return segments.join('/');
}

function dirOf(filePath: string): string {
  const normalized = normalizePath(filePath);
  const slash = normalized.lastIndexOf('/');

  return slash === -1 ? '' : normalized.slice(0, slash);
}

function extensionOf(filePath: string): string {
  const base = filePath.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');

  return dot === -1 ? '' : base.slice(dot).toLowerCase();
}

function baseNameWithoutExt(filePath: string): string {
  const base = filePath.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');

  return dot === -1 ? base : base.slice(0, dot);
}

function isSourceFile(filePath: string): boolean {
  const ext = extensionOf(filePath);

  return (SOURCE_EXTENSIONS as readonly string[]).includes(ext) && !filePath.endsWith('.d.ts');
}

function isIndexFile(filePath: string): boolean {
  return /(^|\/)index\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath);
}

function isTestFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath);
}

/*
 * Extract relative import/re-export specifiers from a source file. Covers
 * `import … from '…'`, `export … from '…'`, side-effect `import '…'` and dynamic
 * `import('…')`. Only relative specifiers ('.'-prefixed) matter for barrels.
 */
function relativeSpecifiers(content: string): string[] {
  const specifiers = new Set<string>();

  const patterns = [
    /\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const specifier = match[1];

      if (specifier.startsWith('.')) {
        specifiers.add(specifier);
      }
    }
  }

  return [...specifiers];
}

/**
 * Given the full generated file map (path → content), return the barrel
 * `index.ts` files that should be created so every directory import resolves.
 * Never overwrites an existing index; only emits a barrel for a directory that
 * has at least one direct source module.
 */
export function synthesizeMissingBarrels(filesInput: Record<string, string>): SynthesizedBarrel[] {
  const files = new Map<string, string>();

  for (const [rawPath, content] of Object.entries(filesInput)) {
    files.set(normalizePath(rawPath), content);
  }

  const existingPaths = new Set(files.keys());

  const hasFileAt = (base: string): boolean =>
    SOURCE_EXTENSIONS.some((ext) => existingPaths.has(`${base}${ext}`)) ||
    SOURCE_EXTENSIONS.some((ext) => existingPaths.has(`${base}/index${ext}`));

  // Directories that are imported as a barrel but have no index file.
  const directoriesNeedingBarrel = new Set<string>();

  for (const [importerPath, content] of files) {
    if (!isSourceFile(importerPath) || typeof content !== 'string') {
      continue;
    }

    for (const specifier of relativeSpecifiers(content)) {
      const resolved = collapseSegments([dirOf(importerPath), specifier].filter(Boolean).join('/'));

      if (!resolved || hasFileAt(resolved)) {
        // Resolves to a concrete file or an existing index — nothing to do.
        continue;
      }

      directoriesNeedingBarrel.add(resolved);
    }
  }

  const barrels: SynthesizedBarrel[] = [];

  for (const directory of [...directoriesNeedingBarrel].sort()) {
    const prefix = `${directory}/`;
    const modules: string[] = [];

    for (const filePath of existingPaths) {
      if (!filePath.startsWith(prefix)) {
        continue;
      }

      const rest = filePath.slice(prefix.length);

      // Direct children only (a barrel re-exports its own directory's modules).
      if (rest.includes('/') || !isSourceFile(filePath) || isIndexFile(filePath) || isTestFile(filePath)) {
        continue;
      }

      modules.push(baseNameWithoutExt(filePath));
    }

    if (!modules.length) {
      continue;
    }

    const dirName = directory.split('/').pop() ?? directory;
    const lines: string[] = [`// Auto-generated barrel so a directory import of ./${dirName} resolves.`];

    for (const moduleName of [...new Set(modules)].sort()) {
      lines.push(`export * from './${moduleName}';`);

      const source = files.get(`${prefix}${moduleName}.ts`) ?? findModuleSource(files, prefix, moduleName);

      if (source && /\bexport\s+default\b/.test(source)) {
        lines.push(`export { default as ${moduleName} } from './${moduleName}';`);
      }
    }

    barrels.push({ path: `${directory}/index.ts`, content: `${lines.join('\n')}\n` });
  }

  return barrels;
}

function findModuleSource(files: Map<string, string>, prefix: string, moduleName: string): string | undefined {
  for (const ext of SOURCE_EXTENSIONS) {
    const source = files.get(`${prefix}${moduleName}${ext}`);

    if (source !== undefined) {
      return source;
    }
  }

  return undefined;
}
