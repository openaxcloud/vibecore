import { parse, type ParserPlugin } from '@babel/parser';

export interface GeneratedFile {
  path: string;
  content: string;
}

export class MissingImportError extends Error {
  readonly filePath: string;
  readonly importSpecifier: string;

  constructor(filePath: string, importSpecifier: string) {
    super(`Missing import in ${filePath}: '${importSpecifier}' does not resolve to a generated or existing file.`);
    this.name = 'MissingImportError';
    this.filePath = filePath;
    this.importSpecifier = importSpecifier;
  }
}

export class GeneratedFileJsonError extends Error {
  readonly filePath: string;

  constructor(filePath: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : 'Invalid JSON.';
    super(`Invalid JSON in ${filePath}: ${message}`);
    this.name = 'GeneratedFileJsonError';
    this.filePath = filePath;
  }
}

const SOURCE_FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const JSON_FILE_EXTENSIONS = new Set(['.json']);

const RESOLVABLE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
];

function normalizeGeneratedPath(filePath: string) {
  return filePath
    .replaceAll('\\', '/')
    .replace(/^\/?(?:home\/project|workspace)\//, '')
    .replace(/^\/+/, '');
}

function dirname(filePath: string) {
  const normalized = normalizeGeneratedPath(filePath);
  const lastSlash = normalized.lastIndexOf('/');

  return lastSlash === -1 ? '' : normalized.slice(0, lastSlash);
}

function normalizeSegments(filePath: string) {
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

function extensionOf(filePath: string) {
  const basename = filePath.split('/').pop() ?? '';
  const dotIndex = basename.lastIndexOf('.');

  return dotIndex === -1 ? '' : basename.slice(dotIndex);
}

function isSourceFile(filePath: string) {
  return SOURCE_FILE_EXTENSIONS.has(extensionOf(filePath));
}

/*
 * Pick `@babel/parser` plugins by file extension. Enabling `jsx` on a plain
 * `.ts` file makes the parser treat `<MyType>value` (legacy TS type assertion)
 * or a generic like `<T>(x: T) => x` as the opening of a JSX tag, which then
 * fails with "Unexpected token, expected ';'". The `typescript` plugin is the
 * mirror image — never apply it to plain `.js`/`.jsx`/`.mjs`/`.cjs`.
 */
function pluginsForExtension(filePath: string): ParserPlugin[] {
  const extension = extensionOf(filePath).toLowerCase();
  const plugins: ParserPlugin[] = ['importAttributes'];

  if (extension === '.ts' || extension === '.tsx') {
    plugins.push('typescript');
  }

  if (extension === '.tsx' || extension === '.jsx' || extension === '.js' || extension === '.mjs') {
    plugins.push('jsx');
  }

  return plugins;
}

function isJsonFile(filePath: string) {
  return JSON_FILE_EXTENSIONS.has(extensionOf(filePath));
}

function isRelativeOrRootImport(specifier: string) {
  return specifier.startsWith('.') || specifier.startsWith('/');
}

function resolveImportCandidates(specifier: string, importerPath: string) {
  const basePath = specifier.startsWith('/')
    ? normalizeGeneratedPath(specifier)
    : normalizeSegments([dirname(importerPath), specifier].filter(Boolean).join('/'));

  const candidates = new Set<string>();

  for (const extension of RESOLVABLE_EXTENSIONS) {
    candidates.add(`${basePath}${extension}`);
  }

  for (const extension of RESOLVABLE_EXTENSIONS.filter(Boolean)) {
    candidates.add(`${basePath}/index${extension}`);
  }

  return [...candidates];
}

export function resolveImport(specifier: string, importerPath: string, allFiles: Map<string, string>) {
  if (!isRelativeOrRootImport(specifier)) {
    return undefined;
  }

  for (const candidate of resolveImportCandidates(specifier, importerPath)) {
    if (allFiles.has(normalizeGeneratedPath(candidate))) {
      return normalizeGeneratedPath(candidate);
    }
  }

  return undefined;
}

export async function validateImports(file: GeneratedFile, allFiles: Map<string, string>) {
  const normalizedPath = normalizeGeneratedPath(file.path);

  if (!isSourceFile(normalizedPath)) {
    return;
  }

  let ast: ReturnType<typeof parse>;

  try {
    ast = parse(file.content, {
      sourceType: 'module',
      plugins: pluginsForExtension(normalizedPath),
    });
  } catch (error) {
    /*
     * Replit / Cursor parity: never block an agent apply on a parser hiccup.
     * `@babel/parser` lags TC39 + TS feature flags (stage-3 proposals, new
     * decorators, `using`, …), so a perfectly valid file can fail here. We
     * still want to flag missing imports — but only when we can actually
     * parse the file. If we can't, the TypeScript LSP and the preview build
     * surface real syntax errors as diagnostics, which the agent reads on
     * the next iteration. Logging keeps the signal for debugging.
     */
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[agent post-validate] Skipping import check for ${normalizedPath}: ${message}`);

    return;
  }

  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') {
      continue;
    }

    const specifier = node.source.value;

    if (typeof specifier !== 'string' || !isRelativeOrRootImport(specifier)) {
      continue;
    }

    if (!resolveImport(specifier, normalizedPath, allFiles)) {
      throw new MissingImportError(normalizedPath, specifier);
    }
  }
}

export async function validateGeneratedFile(file: GeneratedFile, allFiles: Map<string, string>) {
  const normalizedPath = normalizeGeneratedPath(file.path);

  if (isJsonFile(normalizedPath)) {
    try {
      JSON.parse(file.content);
    } catch (error) {
      throw new GeneratedFileJsonError(normalizedPath, error);
    }

    return;
  }

  await validateImports(file, allFiles);
}

export async function validateGeneratedFiles(files: GeneratedFile[], existingFiles = new Map<string, string>()) {
  const allFiles = new Map<string, string>();

  for (const [filePath, content] of existingFiles.entries()) {
    allFiles.set(normalizeGeneratedPath(filePath), content);
  }

  for (const file of files) {
    allFiles.set(normalizeGeneratedPath(file.path), file.content);
  }

  await Promise.all(files.map((file) => validateGeneratedFile(file, allFiles)));
}
