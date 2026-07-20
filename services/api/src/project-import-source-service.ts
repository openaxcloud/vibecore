import { createHash } from 'node:crypto';
import path from 'node:path';
import { DOMParser, type Document, type Element, type Node } from '@xmldom/xmldom';
import {
  parseProjectImportHubInput,
  ProjectImportHubError,
  type ProjectImportHubInput,
  type ProjectImportHubSource,
  type ProjectImportInspectionResult,
  type ProjectImportMaterializationPolicy,
} from './project-import-hub.js';
import { filesFromZipBase64, type FileEncoding, type GitProvider, type ProjectFile } from './project-storage.js';

const MAX_SOURCE_FILES = 5_000;
const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;
const MAX_SOURCE_BYTES = 200 * 1024 * 1024;
const MAX_HTTP_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_TABULAR_ROWS = 50_000;
const MAX_TABULAR_COLUMNS = 200;
const MAX_TABULAR_CELLS = 1_000_000;
const NETWORK_TIMEOUT_MS = 20_000;

const hostedAgentSources = new Set<ProjectImportHubSource>(['figma', 'claude', 'bolt', 'lovable', 'base44']);

export interface ProjectImportSourceFile {
  path: string;
  content: string;
  encoding: FileEncoding;
}

export interface ProjectImportDatasetColumn {
  key: string;
  label: string;
  type: 'string' | 'integer' | 'number' | 'boolean' | 'datetime';
}

export interface ProjectImportDataset {
  name: string;
  columns: ProjectImportDatasetColumn[];
  rows: Array<Record<string, string | number | boolean | null>>;
}

export interface ProjectImportSourceMetadata {
  source: ProjectImportHubSource;
  contentHash: string;
  fileCount: number;
  byteLength: number;
  removedPaths: string[];
  redactedValueCount: number;
  defaultBranch?: string;
  datasets?: Array<{
    name: string;
    rowCount: number;
    columnCount: number;
    columnTypes: ProjectImportDatasetColumn['type'][];
  }>;
}

export interface ProjectImportSourceInspection extends ProjectImportInspectionResult {
  metadata: ProjectImportSourceMetadata;
  agentPrompt?: string;
}

export interface ProjectImportSourceMaterialization {
  files: ProjectImportSourceFile[];
  generatedConfig: Array<{ path: string; content: string }>;
  preview: Record<string, unknown>;
  metadata: ProjectImportSourceMetadata;
  agentPrompt?: string;
}

export interface ProjectImportSourceContext {
  organizationId: string;
  userId: string;
  source: ProjectImportHubSource;
  input: ProjectImportHubInput;
}

export interface VercelConnection {
  accessToken: string;
  teamId?: string;
}

export interface VercelResolvedSource {
  files: Array<Omit<ProjectImportSourceFile, 'encoding'> & { encoding?: FileEncoding }>;
  defaultBranch?: string;
  repositoryUrl?: string;
}

export interface ProjectImportSourceServiceOptions {
  gitProvider: Pick<GitProvider, 'importRepository'>;
  fetchImpl?: typeof fetch;
  resolveVercelConnection?: (input: {
    organizationId: string;
    userId: string;
    sourceUrl: string;
  }) => Promise<VercelConnection | null>;
  /**
   * Optional private-project adapter. It receives the server-side Vercel token
   * and must return source files without embedding that token in paths/URLs.
   */
  resolveVercelSource?: (input: {
    organizationId: string;
    userId: string;
    sourceUrl: string;
    connection: VercelConnection;
  }) => Promise<VercelResolvedSource>;
  resolveGoogleSheetsAccess?: (input: {
    organizationId: string;
    userId: string;
    sourceUrl: string;
  }) => Promise<{ accessToken: string } | null>;
  validateHostedSource?: (input: {
    organizationId: string;
    userId: string;
    source: 'figma' | 'claude' | 'bolt' | 'lovable' | 'base44';
    sourceUrl: string;
  }) => Promise<{
    accessible: boolean;
    label?: string;
    /** SHA-256 of the provider response or authenticated export metadata. */
    contentHash?: string;
  }>;
}

export class ProjectImportSourceError extends ProjectImportHubError {
  constructor(message: string, statusCode: number, code: string, recoverable = false, details?: unknown) {
    super(message, statusCode, code, recoverable, details);
    this.name = 'ProjectImportSourceError';
  }
}

interface LoadedSource {
  files: ProjectImportSourceFile[];
  source: ProjectImportHubSource;
  hashSeed?: string;
  defaultBranch?: string;
  agentPrompt?: string;
  preview?: Record<string, unknown>;
  datasets?: ProjectImportDataset[];
}

interface SanitizedSource {
  files: ProjectImportSourceFile[];
  removedPaths: string[];
  redactedValueCount: number;
  byteLength: number;
}

function stringField(input: ProjectImportHubInput, key: string): string {
  const value = input[key];

  if (typeof value !== 'string' || !value) {
    throw new ProjectImportSourceError(`Missing ${key}`, 400, 'PROJECT_IMPORT_SOURCE_INPUT_INVALID');
  }

  return value;
}

function optionalStringField(input: ProjectImportHubInput, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value ? value : undefined;
}

function uploadField(input: ProjectImportHubInput) {
  const file = input.file;

  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    throw new ProjectImportSourceError('Missing import file', 400, 'PROJECT_IMPORT_SOURCE_INPUT_INVALID');
  }

  const record = file as Record<string, unknown>;
  if (typeof record.fileName !== 'string' || typeof record.contentBase64 !== 'string') {
    throw new ProjectImportSourceError('Invalid import file', 400, 'PROJECT_IMPORT_SOURCE_INPUT_INVALID');
  }

  return { fileName: record.fileName, contentBase64: record.contentBase64 };
}

function throwArchiveReadError(error: unknown): never {
  const candidate = error as { statusCode?: unknown };

  if (candidate?.statusCode === 413) {
    throw new ProjectImportSourceError(
      'Archive exceeds the safe decompressed size or file-count limits',
      413,
      'PROJECT_IMPORT_ARCHIVE_TOO_LARGE',
    );
  }

  throw new ProjectImportSourceError('Archive could not be read safely', 422, 'PROJECT_IMPORT_ARCHIVE_INVALID');
}

function normalizeSourcePath(rawPath: string): string {
  const slashPath = rawPath.replaceAll('\\', '/');

  if (!slashPath || slashPath.includes('\0') || slashPath.startsWith('/') || /^[a-z]:\//i.test(slashPath)) {
    throw new ProjectImportSourceError('Source contains an unsafe path', 422, 'PROJECT_IMPORT_SOURCE_UNSAFE_PATH');
  }

  const normalized = path.posix.normalize(slashPath).replace(/^\.\//, '');

  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new ProjectImportSourceError('Source contains an unsafe path', 422, 'PROJECT_IMPORT_SOURCE_UNSAFE_PATH');
  }

  return normalized;
}

function decodedBytes(file: ProjectImportSourceFile): Buffer {
  if (file.encoding === 'base64') {
    const bytes = Buffer.from(file.content, 'base64');

    if (bytes.toString('base64') !== file.content) {
      throw new ProjectImportSourceError(
        `Source contains invalid binary data at ${file.path}`,
        422,
        'PROJECT_IMPORT_SOURCE_INVALID_BINARY',
      );
    }

    return bytes;
  }

  return Buffer.from(file.content, 'utf8');
}

function decodeTextFile(bytes: Buffer): string | undefined {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    let controlCharacters = 0;

    for (const character of text) {
      const code = character.charCodeAt(0);
      if (code === 0) return undefined;
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) controlCharacters += 1;
    }

    return controlCharacters <= Math.max(2, Math.floor(text.length * 0.01)) ? text : undefined;
  } catch {
    return undefined;
  }
}

function projectFileToSource(file: ProjectFile): ProjectImportSourceFile {
  return { path: file.path, content: file.content, encoding: file.encoding ?? 'utf8' };
}

function assertProviderCredentialAbsent(
  files: ReadonlyArray<Omit<ProjectImportSourceFile, 'encoding'> & { encoding?: FileEncoding }>,
  credential: string,
): void {
  for (const file of files) {
    const bytes = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
    if (bytes.includes(Buffer.from(credential, 'utf8'))) {
      throw new ProjectImportSourceError(
        'Provider adapter returned credential material in source files',
        500,
        'PROJECT_IMPORT_PROVIDER_OUTPUT_UNSAFE',
      );
    }
  }
}

function stripArchiveWrapper(files: ProjectImportSourceFile[]): ProjectImportSourceFile[] {
  if (files.length === 0 || files.some((file) => !file.path.includes('/'))) return files;

  const firstSegments = new Set(files.map((file) => file.path.split('/')[0]));
  if (firstSegments.size !== 1) return files;

  const prefix = [...firstSegments][0]!;
  const markerPattern = /^(?:package\.json|index\.html|vite\.config\.[cm]?[jt]s|src\/)/i;
  if (!files.some((file) => markerPattern.test(file.path.slice(prefix.length + 1)))) return files;

  return files.map((file) => ({ ...file, path: file.path.slice(prefix.length + 1) }));
}

function excludedTreePath(filePath: string): boolean {
  const segments = filePath.toLowerCase().split('/');
  return segments.some((segment) =>
    ['.git', 'node_modules', '.next', '.nuxt', '.svelte-kit', 'dist', 'build', 'coverage'].includes(segment),
  );
}

function secretFilePath(filePath: string): boolean {
  const segments = filePath.toLowerCase().split('/');
  const basename = segments.at(-1) ?? '';

  if (basename.startsWith('.env') && !['.env.example', '.env.sample', '.env.template'].includes(basename)) return true;

  return (
    ['.npmrc', '.yarnrc', '.pypirc', 'credentials.json', 'secrets.json', 'service-account.json'].includes(basename) ||
    /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(basename)
  );
}

function databaseDataFilePath(filePath: string, content?: string): boolean {
  const segments = filePath.toLowerCase().split('/');
  const basename = segments.at(-1) ?? '';

  if (/\.(?:sqlite|sqlite3|db|dump|bak)$/i.test(basename)) return true;
  if (['database-data', 'pgdata', 'mysql-data'].some((segment) => segments.includes(segment))) return true;
  if (/^(?:database|db)[-_]?(?:dump|export)|^(?:dump|backup)[-_.]/i.test(basename)) return true;

  if (basename.endsWith('.sql')) {
    const isMigration = segments.some((segment) => segment === 'migrations' || segment === 'migration');
    const containsRows = content
      ? /\b(?:INSERT\s+INTO|COPY\s+.+\s+FROM\s+STDIN|LOAD\s+DATA|REPLACE\s+INTO)\b/i.test(content)
      : true;
    return !isMigration || containsRows;
  }

  return false;
}

function placeholderValue(value: string): boolean {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '');
  return (
    !normalized ||
    normalized === 'null' ||
    normalized.startsWith('${') ||
    normalized.startsWith('$') ||
    normalized.startsWith('<') ||
    /^(?:your[-_]|example|changeme|replace[-_])/i.test(normalized)
  );
}

function redactTextContent(content: string, filePath: string): { content: string; count: number } {
  let redacted = content;
  let count = 0;
  const basename = filePath.toLowerCase().split('/').at(-1) ?? '';

  const replace = (pattern: RegExp, replacement: string | ((...args: string[]) => string)) => {
    redacted = redacted.replace(pattern, (...args: unknown[]) => {
      count += 1;
      return typeof replacement === 'string' ? replacement : replacement(...(args.slice(0, -2) as string[]));
    });
  };

  if (['.env.example', '.env.sample', '.env.template'].includes(basename)) {
    redacted = redacted.replace(
      /^(\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*)([^\r\n]*)$/gm,
      (match, prefix: string, key: string, value: string) => {
        if (placeholderValue(value)) return match;
        count += 1;
        return `${prefix}\${${key}}`;
      },
    );
  }

  if (basename === 'package.json') {
    try {
      const manifest = JSON.parse(redacted) as { scripts?: Record<string, unknown> };

      if (manifest && typeof manifest === 'object' && !Array.isArray(manifest) && manifest.scripts) {
        for (const [name, command] of Object.entries(manifest.scripts)) {
          if (typeof command !== 'string') continue;
          manifest.scripts[name] = command.replace(
            /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)=([^\s]+)/g,
            (match, key: string, value: string) => {
              if (placeholderValue(value)) return match;
              count += 1;
              return `${key}=\${${key}}`;
            },
          );
        }
        redacted = JSON.stringify(manifest, null, 2);
      }
    } catch {
      // Invalid package.json is left intact for runtime detection to report.
    }
  }

  replace(
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    '<redacted-private-key>',
  );
  replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '<redacted-api-key>');
  replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '<redacted-github-token>');
  replace(/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, '<redacted-slack-token>');
  replace(/\bAKIA[0-9A-Z]{16}\b/g, '<redacted-aws-access-key>');
  replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"`]+/gi, '<redacted-database-url>');
  replace(
    /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)(\s*=\s*)(["'])([^"']*)\3/g,
    (match: string, key: string, separator: string, quote: string, value: string) =>
      placeholderValue(value) ? match : `${key}${separator}${quote}<redacted>${quote}`,
  );
  replace(
    /^(\s*(?:export\s+)?)([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)(\s*=\s*)(?!\$\{|\$[A-Z]|<|example|changeme)([^\r\n]+)$/gm,
    (_match: string, prefix: string, key: string, separator: string) => `${prefix}${key}${separator}\${${key}}`,
  );
  replace(
    /(["'](?:api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|private[-_]?key)["']\s*:\s*)(["'])(?!\$\{|<|example|changeme)([^"']+)\2/gi,
    (_match: string, prefix: string, quote: string) => `${prefix}${quote}<redacted>${quote}`,
  );
  replace(/(Authorization\s*:\s*Bearer\s+)[A-Za-z0-9._~+/-]{12,}/gi, '$1<redacted>');

  return { content: redacted, count };
}

function sanitizeSourceFiles(inputFiles: readonly ProjectImportSourceFile[]): SanitizedSource {
  if (inputFiles.length > MAX_SOURCE_FILES) {
    throw new ProjectImportSourceError('Source contains too many files', 413, 'PROJECT_IMPORT_SOURCE_TOO_MANY_FILES');
  }

  const normalized = stripArchiveWrapper(
    inputFiles.map((file) => ({
      path: normalizeSourcePath(file.path),
      content: file.content,
      encoding: file.encoding ?? 'utf8',
    })),
  );
  const files: ProjectImportSourceFile[] = [];
  const removedPaths: string[] = [];
  const seenPaths = new Set<string>();
  let byteLength = 0;
  let redactedValueCount = 0;

  for (const candidate of normalized) {
    const filePath = normalizeSourcePath(candidate.path);

    if (seenPaths.has(filePath)) {
      throw new ProjectImportSourceError(
        `Source contains duplicate path ${filePath}`,
        422,
        'PROJECT_IMPORT_SOURCE_DUPLICATE_PATH',
      );
    }
    seenPaths.add(filePath);

    if (excludedTreePath(filePath) || secretFilePath(filePath)) {
      removedPaths.push(filePath);
      continue;
    }

    const originalBytes = decodedBytes(candidate);
    if (originalBytes.byteLength > MAX_SOURCE_FILE_BYTES) {
      throw new ProjectImportSourceError(
        `Source file is too large: ${filePath}`,
        413,
        'PROJECT_IMPORT_SOURCE_FILE_TOO_LARGE',
      );
    }

    const textContent = candidate.encoding === 'utf8' ? candidate.content : decodeTextFile(originalBytes);

    if (databaseDataFilePath(filePath, textContent)) {
      removedPaths.push(filePath);
      continue;
    }

    let file = candidate;
    if (textContent !== undefined) {
      const cleaned = redactTextContent(textContent, filePath);
      redactedValueCount += cleaned.count;
      file = {
        ...candidate,
        content:
          candidate.encoding === 'base64' ? Buffer.from(cleaned.content, 'utf8').toString('base64') : cleaned.content,
      };
    }

    const safeBytes = decodedBytes(file);
    byteLength += safeBytes.byteLength;
    if (byteLength > MAX_SOURCE_BYTES) {
      throw new ProjectImportSourceError('Source is too large', 413, 'PROJECT_IMPORT_SOURCE_TOO_LARGE');
    }
    files.push({ path: filePath, content: file.content, encoding: file.encoding });
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  removedPaths.sort();
  return { files, removedPaths, redactedValueCount, byteLength };
}

function contentHash(files: readonly ProjectImportSourceFile[], hashSeed?: string): string {
  const hash = createHash('sha256');
  hash.update('vibecore-project-import-source-v1\0');
  if (hashSeed) hash.update(hashSeed).update('\0');

  for (const file of files) {
    hash.update(file.path).update('\0').update(file.encoding).update('\0').update(file.content).update('\0');
  }

  return hash.digest('hex');
}

function generatedImportConfig(source: ProjectImportHubSource, hash: string, agentRequired: boolean) {
  if (source === 'empty') return [];

  return [
    {
      path: '.vibecore/import.json',
      content: `${JSON.stringify(
        {
          schemaVersion: 1,
          source,
          sourceContentHash: hash,
          agentRequired,
          copySecretValues: false,
          copyDatabaseData: false,
        },
        null,
        2,
      )}\n`,
    },
  ];
}

function inspectionFiles(files: readonly ProjectImportSourceFile[]) {
  return files.map((file) => {
    const sizeBytes = decodedBytes(file).byteLength;

    /*
     * Runtime detection only needs small text manifests. Large source files and
     * spreadsheet seed rows stay transient inside this service and are represented
     * by metadata during preflight, so the Hub never carries the payload forward.
     */
    if (file.encoding !== 'utf8' || sizeBytes > 1024 * 1024 || file.path.startsWith('.vibecore/import-data/')) {
      return { path: file.path, sizeBytes };
    }

    return { path: file.path, content: file.content, sizeBytes };
  });
}

function entrypoints(files: readonly ProjectImportSourceFile[]) {
  return files
    .map((file) => file.path)
    .filter((filePath) =>
      /^(?:package\.json|index\.html|src\/main\.[cm]?[jt]sx?|src\/index\.[cm]?[jt]sx?|server\.[cm]?[jt]s)$/i.test(
        filePath,
      ),
    )
    .slice(0, 10);
}

function datasetMetadata(datasets: readonly ProjectImportDataset[] | undefined) {
  return datasets?.map((dataset) => ({
    name: dataset.name,
    rowCount: dataset.rows.length,
    columnCount: dataset.columns.length,
    columnTypes: dataset.columns.map((column) => column.type),
  }));
}

function spreadsheetAgentPrompt(datasets: readonly ProjectImportDataset[], dataPaths: readonly string[]): string {
  const summaries = datasets.map(
    (dataset, index) =>
      `- ${dataset.name}: ${dataset.rows.length} rows, ${dataset.columns.length} columns; sanitized seed file ${dataPaths[index]}`,
  );

  return [
    'Build a production-grade full-stack TypeScript application from the attached spreadsheet datasets.',
    'Use the platform current supported JavaScript/TypeScript runtime and latest stable compatible packages.',
    'Create a normalized database schema, migrations, validation, and an idempotent seed step from the provided JSON seed files.',
    'Never copy source database dumps or secret values. Declare required secret names and wait for the project owner to provide them.',
    'Add loading, empty, error, responsive mobile/tablet/desktop states, tests, a working preview, and publish configuration.',
    ...summaries,
  ].join('\n');
}

function hostedAgentPrompt(source: ProjectImportHubSource, sourceUrl: string): string {
  const sourceInstruction =
    source === 'figma'
      ? 'Recreate the design faithfully as a responsive, accessible application.'
      : 'Import and continue the shared application while preserving its visible behavior and information architecture.';

  return [
    `${sourceInstruction} Authorized ${source} source: ${sourceUrl}`,
    'Use only the platform current supported JavaScript/TypeScript runtime and latest stable compatible packages.',
    'Do not import source secrets, credentials, database rows, private storage objects, or provider session data.',
    'Infer missing secret names without values, create isolated data resources, and produce a working preview and publish configuration.',
    'Treat screenshots only as prompt/Canvas attachments, never as an import provider.',
  ].join('\n');
}

function safeHostedLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const normalized = label.trim();

  if (
    !normalized ||
    normalized.length > 160 ||
    /[\x00-\x1f\x7f]/.test(normalized) ||
    /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/.test(normalized)
  ) {
    throw new ProjectImportSourceError(
      'Hosted source validator returned unsafe metadata',
      500,
      'PROJECT_IMPORT_HOSTED_VALIDATION_INVALID',
    );
  }

  return normalized;
}

function safeDatasetName(rawName: string, index: number): string {
  const normalized = rawName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || `sheet-${index + 1}`;
}

function uniqueColumnKey(label: string, index: number, used: Set<string>): string {
  const base =
    label
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || `column_${index + 1}`;
  const safeBase = ['__proto__', 'prototype', 'constructor'].includes(base) ? `field_${base}` : base;
  let key = safeBase;

  for (let suffix = 2; used.has(key); suffix += 1) key = `${safeBase}_${suffix}`;
  used.add(key);
  return key;
}

function inferColumnType(values: readonly string[]): ProjectImportDatasetColumn['type'] {
  const present = values.map((value) => value.trim()).filter(Boolean);
  if (present.length === 0) return 'string';
  if (present.every((value) => /^(?:true|false)$/i.test(value))) return 'boolean';
  if (present.every((value) => /^-?(?:0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)))) {
    return 'integer';
  }
  if (
    present.every(
      (value) => /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) && Number.isFinite(Number(value)),
    )
  ) {
    return 'number';
  }
  if (
    present.every(
      (value) =>
        /^\d{4}-\d{2}-\d{2}(?:[T ][0-2]\d:[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value) &&
        !Number.isNaN(Date.parse(value)),
    )
  ) {
    return 'datetime';
  }
  return 'string';
}

function typedCell(value: string, type: ProjectImportDatasetColumn['type']): string | number | boolean | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (type === 'boolean') return trimmed.toLowerCase() === 'true';
  if (type === 'integer' || type === 'number') return Number(trimmed);
  return trimmed;
}

function matrixToDataset(name: string, matrix: string[][]): ProjectImportDataset {
  const nonEmptyRows = matrix.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (nonEmptyRows.length === 0) {
    throw new ProjectImportSourceError('Spreadsheet contains no rows', 422, 'PROJECT_IMPORT_SPREADSHEET_EMPTY');
  }

  const width = Math.max(...nonEmptyRows.map((row) => row.length));
  if (width > MAX_TABULAR_COLUMNS || (nonEmptyRows.length - 1) * width > MAX_TABULAR_CELLS) {
    throw new ProjectImportSourceError('Spreadsheet is too large', 413, 'PROJECT_IMPORT_SPREADSHEET_TOO_LARGE');
  }
  if (nonEmptyRows.length - 1 > MAX_TABULAR_ROWS) {
    throw new ProjectImportSourceError(
      'Spreadsheet contains too many rows',
      413,
      'PROJECT_IMPORT_SPREADSHEET_TOO_LARGE',
    );
  }

  const header = nonEmptyRows[0]!;
  const dataRows = nonEmptyRows.slice(1);
  const used = new Set<string>();
  const columns: ProjectImportDatasetColumn[] = Array.from({ length: width }, (_, index) => {
    const label = header[index]?.trim() || `Column ${index + 1}`;
    const values = dataRows.map((row) => row[index] ?? '');
    return { key: uniqueColumnKey(label, index, used), label, type: inferColumnType(values) };
  });
  const rows = dataRows.map((row) => {
    const record: Record<string, string | number | boolean | null> = Object.create(null) as Record<
      string,
      string | number | boolean | null
    >;
    columns.forEach((column, index) => {
      record[column.key] = typedCell(row[index] ?? '', column.type);
    });
    return record;
  });

  return { name, columns, rows };
}

/** RFC-4180 compatible parser with bounded rows/cells. */
export function parseCsvDataset(csv: string, name = 'Sheet 1'): ProjectImportDataset {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!;

    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell === '') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length > MAX_TABULAR_ROWS + 1) {
        throw new ProjectImportSourceError('CSV contains too many rows', 413, 'PROJECT_IMPORT_SPREADSHEET_TOO_LARGE');
      }
    } else {
      cell += character;
    }
  }

  if (quoted) throw new ProjectImportSourceError('CSV contains an unclosed quote', 422, 'PROJECT_IMPORT_CSV_INVALID');
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return matrixToDataset(name, rows);
}

function parseXml(xml: string, label: string): Document {
  if (/<!DOCTYPE/i.test(xml)) {
    throw new ProjectImportSourceError(`Invalid XLSX ${label}`, 422, 'PROJECT_IMPORT_XLSX_INVALID');
  }

  try {
    return new DOMParser({
      onError(level, message) {
        if (level !== 'warning') throw new Error(message);
      },
    }).parseFromString(xml, 'application/xml');
  } catch {
    throw new ProjectImportSourceError(`Invalid XLSX ${label}`, 422, 'PROJECT_IMPORT_XLSX_INVALID');
  }
}

function descendants(root: Node, localName: string): Element[] {
  const output: Element[] = [];

  const visit = (node: Node) => {
    if (node.localName === localName && 'getAttribute' in node) output.push(node as Element);
    for (let index = 0; index < node.childNodes.length; index += 1) visit(node.childNodes.item(index)!);
  };
  visit(root);
  return output;
}

function firstDescendant(root: Node, localName: string): Element | undefined {
  return descendants(root, localName)[0];
}

function columnIndexFromCellReference(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return 0;
  let result = 0;
  for (const character of letters) result = result * 26 + character.charCodeAt(0) - 64;
  return Math.max(0, result - 1);
}

function xlsxTextFiles(entries: Awaited<ReturnType<typeof filesFromZipBase64>>) {
  return new Map(
    entries
      .filter((file) => file.encoding === 'utf8')
      .map((file) => [normalizeSourcePath(file.path), file.content] as const),
  );
}

/** Parses every worksheet in an XLSX archive without executing formulas/macros. */
export async function parseXlsxDatasets(base64: string): Promise<ProjectImportDataset[]> {
  const entries = await filesFromZipBase64(base64).catch((error) => throwArchiveReadError(error));
  const textFiles = xlsxTextFiles(entries);
  const workbookXml = textFiles.get('xl/workbook.xml');
  const relationshipsXml = textFiles.get('xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relationshipsXml) {
    throw new ProjectImportSourceError('XLSX workbook metadata is missing', 422, 'PROJECT_IMPORT_XLSX_INVALID');
  }

  const sharedStringsXml = textFiles.get('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsXml
    ? descendants(parseXml(sharedStringsXml, 'shared strings'), 'si').map((item) =>
        descendants(item, 't')
          .map((text) => text.textContent ?? '')
          .join(''),
      )
    : [];
  const relationships = new Map(
    descendants(parseXml(relationshipsXml, 'relationships'), 'Relationship').map((relationship) => [
      relationship.getAttribute('Id') ?? '',
      relationship.getAttribute('Target') ?? '',
    ]),
  );
  const sheets = descendants(parseXml(workbookXml, 'workbook'), 'sheet');
  const datasets: ProjectImportDataset[] = [];

  for (const [sheetIndex, sheet] of sheets.entries()) {
    const relationshipId = sheet.getAttribute('r:id') ?? sheet.getAttributeNS(null, 'id') ?? '';
    const rawTarget = relationships.get(relationshipId);
    if (!rawTarget) continue;
    const target = normalizeSourcePath(
      rawTarget.startsWith('/') ? rawTarget.slice(1) : rawTarget.startsWith('xl/') ? rawTarget : `xl/${rawTarget}`,
    );
    const worksheetXml = textFiles.get(target);
    if (!worksheetXml) continue;

    const matrix: string[][] = [];
    for (const rowElement of descendants(parseXml(worksheetXml, `worksheet ${sheetIndex + 1}`), 'row')) {
      const rowIndex = Math.max(0, Number(rowElement.getAttribute('r') ?? matrix.length + 1) - 1);
      const row: string[] = matrix[rowIndex] ?? [];

      for (const cellElement of descendants(rowElement, 'c')) {
        const columnIndex = columnIndexFromCellReference(cellElement.getAttribute('r') ?? 'A1');
        if (columnIndex >= MAX_TABULAR_COLUMNS) {
          throw new ProjectImportSourceError(
            'XLSX contains too many columns',
            413,
            'PROJECT_IMPORT_SPREADSHEET_TOO_LARGE',
          );
        }
        const type = cellElement.getAttribute('t');
        const raw = firstDescendant(cellElement, type === 'inlineStr' ? 't' : 'v')?.textContent ?? '';
        row[columnIndex] =
          type === 's' ? (sharedStrings[Number(raw)] ?? '') : type === 'b' ? (raw === '1' ? 'true' : 'false') : raw;
      }
      matrix[rowIndex] = row;
      if (matrix.length > MAX_TABULAR_ROWS + 1) {
        throw new ProjectImportSourceError('XLSX contains too many rows', 413, 'PROJECT_IMPORT_SPREADSHEET_TOO_LARGE');
      }
    }

    datasets.push(matrixToDataset(sheet.getAttribute('name') ?? `Sheet ${sheetIndex + 1}`, matrix));
  }

  if (datasets.length === 0) {
    throw new ProjectImportSourceError('XLSX contains no readable worksheet', 422, 'PROJECT_IMPORT_SPREADSHEET_EMPTY');
  }
  return datasets;
}

function datasetsAsSourceFiles(datasets: readonly ProjectImportDataset[]) {
  const used = new Set<string>();

  return datasets.map((dataset, index) => {
    let name = safeDatasetName(dataset.name, index);
    for (let suffix = 2; used.has(name); suffix += 1) name = `${safeDatasetName(dataset.name, index)}-${suffix}`;
    used.add(name);
    return {
      path: `.vibecore/import-data/${name}.json`,
      content: `${JSON.stringify({ schemaVersion: 1, ...dataset }, null, 2)}\n`,
      encoding: 'utf8' as const,
    };
  });
}

function previousAgentJsonFiles(base64: string): Promise<ProjectImportSourceFile[]> | ProjectImportSourceFile[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(base64, 'base64')));
  } catch {
    throw new ProjectImportSourceError(
      'Previous Agent export JSON is invalid',
      422,
      'PROJECT_IMPORT_AGENT_EXPORT_INVALID',
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ProjectImportSourceError(
      'Previous Agent export must be an object',
      422,
      'PROJECT_IMPORT_AGENT_EXPORT_INVALID',
    );
  }
  const record = parsed as Record<string, unknown>;
  const archive = record.archive;
  if (archive && typeof archive === 'object' && typeof (archive as Record<string, unknown>).base64 === 'string') {
    return filesFromZipBase64(String((archive as Record<string, unknown>).base64))
      .then((files) => files.map((file) => ({ ...file })))
      .catch((error) => throwArchiveReadError(error));
  }

  const candidates = [
    record.files,
    record.project && typeof record.project === 'object'
      ? (record.project as Record<string, unknown>).files
      : undefined,
    record.snapshot && typeof record.snapshot === 'object'
      ? (record.snapshot as Record<string, unknown>).files
      : undefined,
  ];
  const rawFiles = candidates.find(Array.isArray) as unknown[] | undefined;
  if (!rawFiles) {
    throw new ProjectImportSourceError(
      'Previous Agent export does not contain files or an archive',
      422,
      'PROJECT_IMPORT_AGENT_EXPORT_INVALID',
    );
  }

  return rawFiles.map((rawFile) => {
    if (!rawFile || typeof rawFile !== 'object' || Array.isArray(rawFile)) {
      throw new ProjectImportSourceError(
        'Previous Agent export contains an invalid file',
        422,
        'PROJECT_IMPORT_AGENT_EXPORT_INVALID',
      );
    }
    const file = rawFile as Record<string, unknown>;
    if (typeof file.path !== 'string' || typeof file.content !== 'string') {
      throw new ProjectImportSourceError(
        'Previous Agent export contains an invalid file',
        422,
        'PROJECT_IMPORT_AGENT_EXPORT_INVALID',
      );
    }
    if (file.encoding !== undefined && file.encoding !== 'utf8' && file.encoding !== 'base64') {
      throw new ProjectImportSourceError(
        'Previous Agent export contains an invalid encoding',
        422,
        'PROJECT_IMPORT_AGENT_EXPORT_INVALID',
      );
    }
    return { path: file.path, content: file.content, encoding: (file.encoding ?? 'utf8') as FileEncoding };
  });
}

async function readLimitedResponse(response: Response, maxBytes = MAX_HTTP_RESPONSE_BYTES): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) {
    throw new ProjectImportSourceError(
      'Provider response is too large',
      413,
      'PROJECT_IMPORT_PROVIDER_RESPONSE_TOO_LARGE',
    );
  }

  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ProjectImportSourceError(
        'Provider response is too large',
        413,
        'PROJECT_IMPORT_PROVIDER_RESPONSE_TOO_LARGE',
      );
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

function vercelProjectReference(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const segments = url.pathname.split('/').filter(Boolean);

  if (!['vercel.com', 'www.vercel.com'].includes(url.hostname.toLowerCase()) || segments.length < 2) {
    throw new ProjectImportSourceError(
      'A Vercel dashboard project URL is required for API import',
      422,
      'PROJECT_IMPORT_VERCEL_PROJECT_URL_REQUIRED',
      true,
    );
  }
  return { teamSlug: segments[0]!, projectName: segments[1]! };
}

function defaultPreview(source: ProjectImportHubSource, sanitized: SanitizedSource, hash: string) {
  return {
    kind: source === 'empty' ? 'empty-project' : 'source-manifest',
    source,
    contentHash: hash,
    fileCount: sanitized.files.length,
    entrypoints: entrypoints(sanitized.files),
  };
}

export class ProjectImportSourceService {
  readonly #options: ProjectImportSourceServiceOptions;

  constructor(options: ProjectImportSourceServiceOptions) {
    this.#options = options;
  }

  async #importGit(repositoryUrl: string, branch?: string): Promise<LoadedSource> {
    try {
      const imported = await this.#options.gitProvider.importRepository({ repositoryUrl, branch });
      return {
        source: repositoryUrl.includes('bitbucket.org') ? 'bitbucket' : 'github',
        files: imported.files.map(projectFileToSource),
        defaultBranch: imported.defaultBranch,
      };
    } catch {
      throw new ProjectImportSourceError(
        'The repository could not be cloned. Check access and branch, then retry.',
        502,
        'PROJECT_IMPORT_REPOSITORY_UNAVAILABLE',
        true,
      );
    }
  }

  async #loadVercel(context: ProjectImportSourceContext, input: ProjectImportHubInput): Promise<LoadedSource> {
    const sourceUrl = stringField(input, 'sourceUrl');
    const connection = await this.#options.resolveVercelConnection?.({
      organizationId: context.organizationId,
      userId: context.userId,
      sourceUrl,
    });

    if (!connection?.accessToken) {
      throw new ProjectImportSourceError(
        'Connect Vercel before importing this project.',
        409,
        'PROJECT_IMPORT_VERCEL_CONNECTION_REQUIRED',
        true,
      );
    }

    if (this.#options.resolveVercelSource) {
      try {
        const resolved = await this.#options.resolveVercelSource({
          organizationId: context.organizationId,
          userId: context.userId,
          sourceUrl,
          connection,
        });
        assertProviderCredentialAbsent(resolved.files, connection.accessToken);
        return {
          source: 'vercel',
          files: resolved.files.map((file) => ({ ...file, encoding: file.encoding ?? 'utf8' })),
          defaultBranch: resolved.defaultBranch,
        };
      } catch (error) {
        if (error instanceof ProjectImportSourceError) throw error;
        throw new ProjectImportSourceError(
          'Vercel source export is temporarily unavailable.',
          502,
          'PROJECT_IMPORT_VERCEL_SOURCE_UNAVAILABLE',
          true,
        );
      }
    }

    const reference = vercelProjectReference(sourceUrl);
    const apiUrl = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(reference.projectName)}`);
    if (connection.teamId) apiUrl.searchParams.set('teamId', connection.teamId);
    const fetchImpl = this.#options.fetchImpl ?? fetch;
    let response: Response;

    try {
      response = await fetchImpl(apiUrl, {
        headers: { authorization: `Bearer ${connection.accessToken}`, accept: 'application/json' },
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      });
    } catch {
      throw new ProjectImportSourceError(
        'Vercel API is temporarily unavailable.',
        502,
        'PROJECT_IMPORT_VERCEL_API_UNAVAILABLE',
        true,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProjectImportSourceError(
        'Reconnect Vercel and verify project access.',
        409,
        'PROJECT_IMPORT_VERCEL_RECONNECT_REQUIRED',
        true,
      );
    }
    if (!response.ok) {
      throw new ProjectImportSourceError(
        response.status >= 500 || response.status === 429
          ? 'Vercel API is temporarily unavailable.'
          : 'Vercel project was not found.',
        response.status >= 500 || response.status === 429 ? 502 : 404,
        response.status >= 500 || response.status === 429
          ? 'PROJECT_IMPORT_VERCEL_API_UNAVAILABLE'
          : 'PROJECT_IMPORT_VERCEL_PROJECT_NOT_FOUND',
        response.status >= 500 || response.status === 429,
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse((await readLimitedResponse(response)).toString('utf8')) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ProjectImportSourceError) throw error;
      throw new ProjectImportSourceError(
        'Vercel returned an invalid project response.',
        502,
        'PROJECT_IMPORT_VERCEL_RESPONSE_INVALID',
        true,
      );
    }

    const link = payload.link;
    if (!link || typeof link !== 'object' || Array.isArray(link)) {
      throw new ProjectImportSourceError(
        'This Vercel project has no importable linked repository. Export its source and retry.',
        409,
        'PROJECT_IMPORT_VERCEL_SOURCE_EXPORT_REQUIRED',
        true,
      );
    }
    const linked = link as Record<string, unknown>;
    const provider = String(linked.type ?? '').toLowerCase();
    const owner = typeof linked.org === 'string' ? linked.org : typeof linked.owner === 'string' ? linked.owner : '';
    const repository = typeof linked.repo === 'string' ? linked.repo : '';
    const branch = typeof linked.productionBranch === 'string' ? linked.productionBranch : undefined;

    if (!owner || !repository || !['github', 'bitbucket'].includes(provider)) {
      throw new ProjectImportSourceError(
        'The linked Vercel repository provider is not importable. Export source or connect a supported repository.',
        409,
        'PROJECT_IMPORT_VERCEL_REPOSITORY_UNSUPPORTED',
        true,
      );
    }
    const repositoryUrl =
      provider === 'github'
        ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`
        : `https://bitbucket.org/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
    const imported = await this.#importGit(repositoryUrl, branch);
    return { ...imported, source: 'vercel' };
  }

  async #loadGoogleSheet(context: ProjectImportSourceContext, sourceUrl: string): Promise<ProjectImportDataset[]> {
    const source = new URL(sourceUrl);
    const sheetId = source.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1];
    if (!sheetId) {
      throw new ProjectImportSourceError(
        'Google Sheets URL is invalid',
        422,
        'PROJECT_IMPORT_GOOGLE_SHEETS_URL_INVALID',
      );
    }
    const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/export`);
    exportUrl.searchParams.set('format', 'csv');
    exportUrl.searchParams.set('gid', source.searchParams.get('gid') ?? '0');
    const access = await this.#options.resolveGoogleSheetsAccess?.({
      organizationId: context.organizationId,
      userId: context.userId,
      sourceUrl,
    });
    const fetchImpl = this.#options.fetchImpl ?? fetch;
    let response: Response;

    try {
      response = await fetchImpl(exportUrl, {
        headers: {
          accept: 'text/csv',
          ...(access?.accessToken ? { authorization: `Bearer ${access.accessToken}` } : {}),
        },
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      });
    } catch {
      throw new ProjectImportSourceError(
        'Google Sheets is temporarily unavailable.',
        502,
        'PROJECT_IMPORT_GOOGLE_SHEETS_UNAVAILABLE',
        true,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProjectImportSourceError(
        'Grant access to this Google Sheet, then retry.',
        409,
        'PROJECT_IMPORT_GOOGLE_SHEETS_ACCESS_REQUIRED',
        true,
      );
    }
    if (!response.ok) {
      throw new ProjectImportSourceError(
        response.status >= 500 || response.status === 429
          ? 'Google Sheets is temporarily unavailable.'
          : 'Google Sheet was not found.',
        response.status >= 500 || response.status === 429 ? 502 : 404,
        response.status >= 500 || response.status === 429
          ? 'PROJECT_IMPORT_GOOGLE_SHEETS_UNAVAILABLE'
          : 'PROJECT_IMPORT_GOOGLE_SHEETS_NOT_FOUND',
        response.status >= 500 || response.status === 429,
      );
    }
    const csvBytes = await readLimitedResponse(response);
    if (access?.accessToken && csvBytes.includes(Buffer.from(access.accessToken, 'utf8'))) {
      throw new ProjectImportSourceError(
        'Google Sheets returned credential material in its response',
        502,
        'PROJECT_IMPORT_PROVIDER_OUTPUT_UNSAFE',
        true,
      );
    }
    const csv = new TextDecoder('utf-8', { fatal: true }).decode(csvBytes);
    if (/^\s*<!doctype html|^\s*<html/i.test(csv)) {
      throw new ProjectImportSourceError(
        'Grant access to this Google Sheet, then retry.',
        409,
        'PROJECT_IMPORT_GOOGLE_SHEETS_ACCESS_REQUIRED',
        true,
      );
    }
    return [parseCsvDataset(csv, 'Google Sheet')];
  }

  async #loadSpreadsheet(context: ProjectImportSourceContext, input: ProjectImportHubInput): Promise<LoadedSource> {
    let datasets: ProjectImportDataset[];

    if (input.kind === 'google-sheets') {
      datasets = await this.#loadGoogleSheet(context, stringField(input, 'sourceUrl'));
    } else {
      const upload = uploadField(input);
      if (upload.fileName.toLowerCase().endsWith('.xlsx')) {
        datasets = await parseXlsxDatasets(upload.contentBase64);
      } else {
        let csv: string;
        try {
          csv = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(upload.contentBase64, 'base64'));
        } catch {
          throw new ProjectImportSourceError('CSV must contain UTF-8 text', 422, 'PROJECT_IMPORT_CSV_INVALID');
        }
        datasets = [parseCsvDataset(csv, upload.fileName.replace(/\.csv$/i, '') || 'Sheet 1')];
      }
    }

    const files = datasetsAsSourceFiles(datasets);
    return {
      source: 'spreadsheet',
      files,
      datasets,
      agentPrompt: spreadsheetAgentPrompt(
        datasets,
        files.map((file) => file.path),
      ),
      preview: {
        kind: 'spreadsheet-schema',
        datasetCount: datasets.length,
        rowCount: datasets.reduce((total, dataset) => total + dataset.rows.length, 0),
        columnCount: datasets.reduce((total, dataset) => total + dataset.columns.length, 0),
      },
    };
  }

  async #loadHostedAgent(context: ProjectImportSourceContext, input: ProjectImportHubInput): Promise<LoadedSource> {
    const source = context.source as 'figma' | 'claude' | 'bolt' | 'lovable' | 'base44';
    const sourceUrl = stringField(input, 'sourceUrl');
    if (!this.#options.validateHostedSource) {
      throw new ProjectImportSourceError(
        `The ${source} connector is not configured. Connect the provider, then retry.`,
        503,
        'PROJECT_IMPORT_HOSTED_CONNECTOR_UNAVAILABLE',
        true,
      );
    }

    const validated = await this.#options.validateHostedSource({
      organizationId: context.organizationId,
      userId: context.userId,
      source,
      sourceUrl,
    });

    if (!validated.accessible) {
      throw new ProjectImportSourceError(
        `The ${source} source is not accessible. Share it or reconnect the provider, then retry.`,
        409,
        'PROJECT_IMPORT_HOSTED_SOURCE_ACCESS_REQUIRED',
        true,
      );
    }
    if (!validated.contentHash || !/^[a-f0-9]{64}$/i.test(validated.contentHash)) {
      throw new ProjectImportSourceError(
        `The ${source} connector did not return verifiable source evidence. Reconnect the provider, then retry.`,
        502,
        'PROJECT_IMPORT_HOSTED_EVIDENCE_INVALID',
        true,
      );
    }
    const label = safeHostedLabel(validated?.label);
    return {
      source,
      files: [],
      hashSeed: `hosted-agent:${source}:${sourceUrl}:${validated.contentHash.toLowerCase()}`,
      agentPrompt: hostedAgentPrompt(source, sourceUrl),
      preview: {
        kind: 'agent-plan',
        provider: source,
        sourceUrl,
        accessible: true,
        sourceEvidenceHash: validated.contentHash.toLowerCase(),
        ...(label ? { label } : {}),
      },
    };
  }

  async #load(context: ProjectImportSourceContext): Promise<LoadedSource> {
    const normalizedInput = parseProjectImportHubInput(context.source, context.input);

    if (context.source === 'github' || context.source === 'bitbucket') {
      const loaded = await this.#importGit(
        stringField(normalizedInput, 'repositoryUrl'),
        optionalStringField(normalizedInput, 'branch'),
      );
      return { ...loaded, source: context.source };
    }
    if (context.source === 'vercel') return this.#loadVercel(context, normalizedInput);
    if (hostedAgentSources.has(context.source)) return this.#loadHostedAgent(context, normalizedInput);
    if (context.source === 'spreadsheet') return this.#loadSpreadsheet(context, normalizedInput);
    if (context.source === 'empty') {
      return { source: 'empty', files: [], hashSeed: `empty:${stringField(normalizedInput, 'name')}` };
    }

    const upload = uploadField(normalizedInput);
    if (context.source === 'zip' || upload.fileName.toLowerCase().endsWith('.zip')) {
      try {
        const files = await filesFromZipBase64(upload.contentBase64);
        return { source: context.source, files: files.map((file) => ({ ...file })) };
      } catch (error) {
        if (error instanceof ProjectImportSourceError) throw error;
        throwArchiveReadError(error);
      }
    }
    return { source: context.source, files: await previousAgentJsonFiles(upload.contentBase64) };
  }

  async #prepare(context: ProjectImportSourceContext) {
    const loaded = await this.#load(context);
    const sanitized = sanitizeSourceFiles(loaded.files);
    const hash = contentHash(sanitized.files, loaded.hashSeed);
    const metadata: ProjectImportSourceMetadata = {
      source: context.source,
      contentHash: hash,
      fileCount: sanitized.files.length,
      byteLength: sanitized.byteLength,
      removedPaths: sanitized.removedPaths,
      redactedValueCount: sanitized.redactedValueCount,
      ...(loaded.defaultBranch ? { defaultBranch: loaded.defaultBranch } : {}),
      ...(loaded.datasets ? { datasets: datasetMetadata(loaded.datasets) } : {}),
    };
    const agentRequired = hostedAgentSources.has(context.source) || context.source === 'spreadsheet';
    const generatedConfig = generatedImportConfig(context.source, hash, agentRequired);
    const preview = {
      ...defaultPreview(context.source, sanitized, hash),
      ...(loaded.preview ?? {}),
    };

    return { loaded, sanitized, metadata, generatedConfig, preview };
  }

  readonly inspectSource = async (context: ProjectImportSourceContext): Promise<ProjectImportSourceInspection> => {
    const prepared = await this.#prepare(context);
    return {
      files: inspectionFiles(prepared.sanitized.files),
      generatedConfig: prepared.generatedConfig,
      preview: prepared.preview,
      validation: {
        contentHash: prepared.metadata.contentHash,
        fileCount: prepared.metadata.fileCount,
        byteLength: prepared.metadata.byteLength,
        removedPaths: prepared.metadata.removedPaths,
        redactedValueCount: prepared.metadata.redactedValueCount,
        ...(prepared.metadata.defaultBranch ? { defaultBranch: prepared.metadata.defaultBranch } : {}),
        ...(prepared.metadata.datasets ? { datasets: prepared.metadata.datasets } : {}),
      },
      metadata: prepared.metadata,
      ...(prepared.loaded.agentPrompt ? { agentPrompt: prepared.loaded.agentPrompt } : {}),
    };
  };

  readonly materializeSource = async (
    context: ProjectImportSourceContext & {
      expectedContentHash?: string;
      policy: ProjectImportMaterializationPolicy;
    },
  ): Promise<ProjectImportSourceMaterialization> => {
    if (context.policy.copySecretValues !== false || context.policy.copyDatabaseData !== false) {
      throw new ProjectImportSourceError(
        'Import policy must exclude source secrets and database data',
        500,
        'PROJECT_IMPORT_UNSAFE_MATERIALIZATION_POLICY',
      );
    }
    if (context.source === 'spreadsheet' && !context.policy.allowSpreadsheetSeedData) {
      throw new ProjectImportSourceError(
        'Spreadsheet seed data was not authorized',
        409,
        'PROJECT_IMPORT_SPREADSHEET_SEED_NOT_AUTHORIZED',
      );
    }
    if (context.source === 'empty' && (context.policy.scaffold || context.policy.useAgent)) {
      throw new ProjectImportSourceError(
        'Empty projects cannot enable Agent or scaffolding',
        500,
        'PROJECT_IMPORT_EMPTY_POLICY_INVALID',
      );
    }
    if ((hostedAgentSources.has(context.source) || context.source === 'spreadsheet') && !context.policy.useAgent) {
      throw new ProjectImportSourceError(
        'This import source requires an Agent materialization plan',
        409,
        'PROJECT_IMPORT_AGENT_REQUIRED',
      );
    }

    const prepared = await this.#prepare(context);
    if (context.expectedContentHash && context.expectedContentHash !== prepared.metadata.contentHash) {
      throw new ProjectImportSourceError(
        'The import source changed after preflight. Validate it again before creating the project.',
        409,
        'PROJECT_IMPORT_SOURCE_CHANGED',
        true,
      );
    }
    return {
      files: prepared.sanitized.files,
      generatedConfig: prepared.generatedConfig,
      preview: prepared.preview,
      metadata: prepared.metadata,
      ...(prepared.loaded.agentPrompt ? { agentPrompt: prepared.loaded.agentPrompt } : {}),
    };
  };
}

export function createProjectImportSourceService(options: ProjectImportSourceServiceOptions) {
  return new ProjectImportSourceService(options);
}
