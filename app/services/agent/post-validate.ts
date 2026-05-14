import { parse } from '@babel/parser';

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

export class GeneratedFileParseError extends Error {
  readonly filePath: string;

  constructor(filePath: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : 'Unable to parse generated file.';
    super(`Unable to validate imports in ${filePath}: ${message}`);
    this.name = 'GeneratedFileParseError';
    this.filePath = filePath;
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
      plugins: ['typescript', 'jsx', 'importAttributes'],
    });
  } catch (error) {
    throw new GeneratedFileParseError(normalizedPath, error);
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
