import { createHash } from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { detectServerRuntime, isDetectionError } from './server-runtime-detect.js';
import type { ApiStore, ProjectImportJobRecord, ProjectImportSource as StoredProjectImportSource } from './store.js';

/** Public connector ids. `previous-agent-export` deliberately differs from the database enum. */
export const PROJECT_IMPORT_HUB_SOURCES = [
  'github',
  'bitbucket',
  'vercel',
  'figma',
  'claude',
  'bolt',
  'lovable',
  'base44',
  'zip',
  'spreadsheet',
  'previous-agent-export',
  'empty',
] as const;

export type ProjectImportHubSource = (typeof PROJECT_IMPORT_HUB_SOURCES)[number];
export type ProjectImportHubPermission = 'projects:read' | 'projects:write';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_INSPECTED_FILES = 5_000;
const MAX_INSPECTED_FILE_CONTENT_BYTES = 2 * 1024 * 1024;
const MAX_INSPECTED_CONTENT_BYTES = 20 * 1024 * 1024;
const MAX_GENERATED_CONFIG_BYTES = 256 * 1024;
const AGENT_CREDITS_DISCLOSURE =
  'This import uses Agent generation or analysis and consumes Agent credits. Review the preflight before creating the project.';

const publicSourceSchema = z.enum(PROJECT_IMPORT_HUB_SOURCES);
const organizationParamsSchema = z.object({ orgId: z.string().trim().min(1).max(128) }).strict();
const jobParamsSchema = z
  .object({ orgId: z.string().trim().min(1).max(128), importJobId: z.string().trim().min(1).max(128) })
  .strict();
const listQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
const preflightEnvelopeSchema = z.object({ source: publicSourceSchema, input: z.unknown() }).strict();
const createEnvelopeSchema = z.object({ input: z.unknown() }).strict();

const projectNameSchema = z.string().trim().min(1).max(120).optional();
const projectSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must contain lowercase letters, numbers, and hyphens')
  .optional();
const branchSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      !value.startsWith('-') &&
      !value.endsWith('.') &&
      !value.endsWith('/') &&
      !value.includes('..') &&
      !value.includes('@{') &&
      !/[\x00-\x20~^:?*[\\]/.test(value),
    'branch is not a safe Git ref',
  )
  .optional();

function hasSensitiveUrlParameters(url: URL): boolean {
  return [...url.searchParams.keys()].some((key) =>
    /token|secret|password|api[-_]?key|signature|authorization/i.test(key),
  );
}

function parseHttpsUrl(rawValue: string, label: string): URL {
  let url: URL;

  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    hasSensitiveUrlParameters(url)
  ) {
    throw new Error(
      `${label} must be an HTTPS URL without credentials, fragments, custom ports, or secret query parameters`,
    );
  }

  return url;
}

function normalizeRepositoryPath(url: URL, label: string): { owner: string; repository: string } {
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length !== 2) {
    throw new Error(`${label} must identify exactly one owner and repository`);
  }

  const [owner, rawRepository] = segments;
  const repository = rawRepository!.replace(/\.git$/i, '');
  const segmentPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/;

  if (!owner || !repository || !segmentPattern.test(owner) || !segmentPattern.test(repository)) {
    throw new Error(`${label} contains an invalid owner or repository name`);
  }

  return { owner, repository };
}

/**
 * Normalizes both github.com/owner/repo and Replit's express import URL
 * replit.com/github.com/owner/repo. The normalized value contains no credentials.
 */
export function normalizeGithubRepositoryUrl(rawValue: string): string {
  const url = parseHttpsUrl(rawValue, 'repositoryUrl');

  if (url.hostname.toLowerCase() === 'replit.com') {
    const segments = url.pathname.split('/').filter(Boolean);

    if (segments.length !== 3 || segments[0]?.toLowerCase() !== 'github.com') {
      throw new Error('Replit express imports must use replit.com/github.com/owner/repo');
    }

    url.hostname = 'github.com';
    url.pathname = `/${segments[1]}/${segments[2]}`;
  }

  if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) {
    throw new Error('repositoryUrl must use github.com or the Replit GitHub express import URL');
  }

  const { owner, repository } = normalizeRepositoryPath(url, 'repositoryUrl');
  return `https://github.com/${owner}/${repository}`;
}

function normalizeBitbucketRepositoryUrl(rawValue: string): string {
  const url = parseHttpsUrl(rawValue, 'repositoryUrl');

  if (!['bitbucket.org', 'www.bitbucket.org'].includes(url.hostname.toLowerCase())) {
    throw new Error('repositoryUrl must use bitbucket.org');
  }

  const { owner, repository } = normalizeRepositoryPath(url, 'repositoryUrl');
  return `https://bitbucket.org/${owner}/${repository}`;
}

function normalizeProviderUrl(input: {
  rawValue: string;
  label: string;
  allowedHosts?: readonly string[];
  allowedHostSuffixes?: readonly string[];
  pathPattern?: RegExp;
}): string {
  const url = parseHttpsUrl(input.rawValue, input.label);
  const hostname = url.hostname.toLowerCase();
  const exact = input.allowedHosts?.some((host) => hostname === host || hostname === `www.${host}`) ?? false;
  const suffix = input.allowedHostSuffixes?.some((host) => hostname === host || hostname.endsWith(`.${host}`)) ?? false;

  if (!exact && !suffix) {
    throw new Error(`${input.label} is not hosted by the selected import provider`);
  }

  if (input.pathPattern && !input.pathPattern.test(url.pathname)) {
    throw new Error(`${input.label} does not identify an importable provider resource`);
  }

  return url.toString();
}

function urlSchema(transform: (value: string) => string) {
  return z
    .string()
    .trim()
    .min(1)
    .max(2_048)
    .transform((value, context) => {
      try {
        return transform(value);
      } catch (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : 'Invalid provider URL',
        });
        return z.NEVER;
      }
    });
}

const githubInputSchema = z
  .object({
    repositoryUrl: urlSchema(normalizeGithubRepositoryUrl),
    branch: branchSchema,
    name: projectNameSchema,
    slug: projectSlugSchema,
  })
  .strict();

const bitbucketInputSchema = z
  .object({
    repositoryUrl: urlSchema(normalizeBitbucketRepositoryUrl),
    branch: branchSchema,
    name: projectNameSchema,
    slug: projectSlugSchema,
  })
  .strict();

const providerUrlSchemas = {
  vercel: z
    .object({
      sourceUrl: urlSchema((rawValue) =>
        normalizeProviderUrl({
          rawValue,
          label: 'sourceUrl',
          allowedHosts: ['vercel.com'],
          allowedHostSuffixes: ['vercel.app'],
          pathPattern: /\/.+/,
        }),
      ),
      name: projectNameSchema,
      slug: projectSlugSchema,
    })
    .strict(),
  figma: z
    .object({
      sourceUrl: urlSchema((rawValue) =>
        normalizeProviderUrl({
          rawValue,
          label: 'sourceUrl',
          allowedHosts: ['figma.com'],
          pathPattern: /^\/(?:design|file|board|proto)\/[^/]+/,
        }),
      ),
      name: projectNameSchema,
      slug: projectSlugSchema,
    })
    .strict(),
  claude: z
    .object({
      sourceUrl: urlSchema((rawValue) =>
        normalizeProviderUrl({ rawValue, label: 'sourceUrl', allowedHosts: ['claude.ai'], pathPattern: /\/.+/ }),
      ),
      name: projectNameSchema,
      slug: projectSlugSchema,
    })
    .strict(),
  bolt: z
    .object({
      sourceUrl: urlSchema((rawValue) =>
        normalizeProviderUrl({ rawValue, label: 'sourceUrl', allowedHosts: ['bolt.new'], pathPattern: /\/.+/ }),
      ),
      name: projectNameSchema,
      slug: projectSlugSchema,
    })
    .strict(),
  lovable: z
    .object({
      sourceUrl: urlSchema((rawValue) =>
        normalizeProviderUrl({
          rawValue,
          label: 'sourceUrl',
          allowedHostSuffixes: ['lovable.dev', 'lovable.app'],
          pathPattern: /\/.+/,
        }),
      ),
      name: projectNameSchema,
      slug: projectSlugSchema,
    })
    .strict(),
  base44: z
    .object({
      sourceUrl: urlSchema((rawValue) =>
        normalizeProviderUrl({
          rawValue,
          label: 'sourceUrl',
          allowedHostSuffixes: ['base44.com'],
          pathPattern: /\/.+/,
        }),
      ),
      name: projectNameSchema,
      slug: projectSlugSchema,
    })
    .strict(),
} as const;

function canonicalBase64(value: string): boolean {
  if (
    !value ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    return false;
  }

  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value;
}

const uploadedFileSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine(
        (value) =>
          value === path.posix.basename(value) &&
          value === path.win32.basename(value) &&
          !value.startsWith('.') &&
          !/[\x00-\x1f\x7f]/.test(value),
        'fileName must be a safe base name',
      ),
    contentBase64: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 + 4)
      .refine(canonicalBase64, 'invalid base64 payload'),
    sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
    sha256: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-f0-9]{64}$/),
    mediaType: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .superRefine((file, context) => {
    const bytes = Buffer.from(file.contentBase64, 'base64');

    if (bytes.byteLength !== file.sizeBytes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sizeBytes'],
        message: 'sizeBytes does not match the decoded payload',
      });
    }

    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sha256'],
        message: 'sha256 does not match the decoded payload',
      });
    }
  });

function uploadInputSchema(input: { extensions: readonly string[]; mediaTypes: readonly string[] }) {
  return z
    .object({ file: uploadedFileSchema, name: projectNameSchema, slug: projectSlugSchema })
    .strict()
    .superRefine((value, context) => {
      const lowerName = value.file.fileName.toLowerCase();
      const decoded = Buffer.from(value.file.contentBase64, 'base64');

      if (!input.extensions.some((extension) => lowerName.endsWith(extension))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['file', 'fileName'],
          message: `fileName must end in ${input.extensions.join(' or ')}`,
        });
      }

      if (value.file.mediaType && !input.mediaTypes.includes(value.file.mediaType.toLowerCase())) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['file', 'mediaType'],
          message: 'mediaType does not match the selected import source',
        });
      }

      if (
        (lowerName.endsWith('.zip') || lowerName.endsWith('.xlsx')) &&
        !(
          decoded.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
          decoded.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06])) ||
          decoded.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x07, 0x08]))
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['file', 'contentBase64'],
          message: 'file content does not have a ZIP/XLSX signature',
        });
      }

      if (lowerName.endsWith('.json')) {
        try {
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['file', 'contentBase64'],
            message: 'JSON export must contain valid UTF-8 JSON',
          });
        }
      }

      if (lowerName.endsWith('.csv')) {
        try {
          const csv = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
          if (!csv.trim() || csv.includes('\0')) throw new Error('invalid csv');
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['file', 'contentBase64'],
            message: 'CSV import must contain non-empty UTF-8 text',
          });
        }
      }
    });
}

const zipInputSchema = uploadInputSchema({
  extensions: ['.zip'],
  mediaTypes: ['application/zip', 'application/x-zip-compressed'],
});
const previousAgentInputSchema = uploadInputSchema({
  extensions: ['.zip', '.json'],
  mediaTypes: ['application/zip', 'application/x-zip-compressed', 'application/json'],
});
const spreadsheetFileInputSchema = uploadInputSchema({
  extensions: ['.xlsx', '.csv'],
  mediaTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/csv'],
});
const googleSheetsInputSchema = z
  .object({
    kind: z.literal('google-sheets'),
    sourceUrl: urlSchema((rawValue) =>
      normalizeProviderUrl({
        rawValue,
        label: 'sourceUrl',
        allowedHosts: ['docs.google.com'],
        pathPattern: /^\/spreadsheets\/d\/[A-Za-z0-9_-]+/,
      }),
    ),
    name: projectNameSchema,
    slug: projectSlugSchema,
  })
  .strict();
const spreadsheetInputSchema = z.union([
  googleSheetsInputSchema,
  spreadsheetFileInputSchema.transform((value) => ({ ...value, kind: 'file' as const })),
]);
const emptyInputSchema = z.object({ name: z.string().trim().min(1).max(120), slug: projectSlugSchema }).strict();

const sourceInputSchemas: Record<ProjectImportHubSource, z.ZodTypeAny> = {
  github: githubInputSchema,
  bitbucket: bitbucketInputSchema,
  vercel: providerUrlSchemas.vercel,
  figma: providerUrlSchemas.figma,
  claude: providerUrlSchemas.claude,
  bolt: providerUrlSchemas.bolt,
  lovable: providerUrlSchemas.lovable,
  base44: providerUrlSchemas.base44,
  zip: zipInputSchema,
  spreadsheet: spreadsheetInputSchema,
  'previous-agent-export': previousAgentInputSchema,
  empty: emptyInputSchema,
};

export type ProjectImportHubInput = Record<string, unknown>;

export interface ProjectImportHubRequest {
  source: ProjectImportHubSource;
  input: ProjectImportHubInput;
}

export interface ProjectImportInspectionFile {
  path: string;
  /** Text content is transient and is never written to ProjectImportJob. */
  content?: string;
  sizeBytes?: number;
}

export interface ProjectImportInspectionResult {
  files: readonly ProjectImportInspectionFile[];
  validation?: Record<string, unknown>;
  preview?: Record<string, unknown>;
  generatedConfig?: Array<{ path: string; content: string }>;
}

export interface ProjectImportMaterializationPolicy {
  copySecretValues: false;
  copyDatabaseData: false;
  allowSpreadsheetSeedData: boolean;
  useAgent: boolean;
  scaffold: boolean;
}

export interface ProjectImportMaterializationResult {
  projectId: string;
  metadata: Record<string, unknown>;
}

export interface ProjectImportHubPrincipal {
  userId: string;
}

export interface ProjectImportHubOptions {
  store: Pick<
    ApiStore,
    | 'withSerializedMutation'
    | 'createProjectImportJob'
    | 'getProjectImportJob'
    | 'getProjectImportJobByIdempotency'
    | 'updateProjectImportJob'
    | 'listProjectImportJobs'
  >;
  authenticate(request: FastifyRequest): Promise<ProjectImportHubPrincipal | null>;
  authorizeOrganization(input: {
    request: FastifyRequest;
    userId: string;
    organizationId: string;
    permission: ProjectImportHubPermission;
  }): Promise<boolean>;
  inspectSource(input: {
    request: FastifyRequest;
    organizationId: string;
    userId: string;
    source: ProjectImportHubSource;
    input: ProjectImportHubInput;
  }): Promise<ProjectImportInspectionResult>;
  /**
   * Must be idempotent on `materializationKey`. It owns real project/workspace
   * creation; this module owns validation, state transitions, and replay safety.
   */
  materializeImport(input: {
    request: FastifyRequest;
    organizationId: string;
    userId: string;
    source: ProjectImportHubSource;
    input: ProjectImportHubInput;
    job: ProjectImportJobRecord;
    materializationKey: string;
    policy: ProjectImportMaterializationPolicy;
  }): Promise<ProjectImportMaterializationResult>;
}

export class ProjectImportHubError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly recoverable: boolean;
  readonly details?: unknown;

  constructor(message: string, statusCode: number, code: string, recoverable = false, details?: unknown) {
    super(message);
    this.name = 'ProjectImportHubError';
    this.statusCode = statusCode;
    this.code = code;
    this.recoverable = recoverable;
    this.details = details;
  }
}

function parseInput<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new ProjectImportHubError(
      'Invalid project import request',
      400,
      'PROJECT_IMPORT_VALIDATION_FAILED',
      false,
      parsed.error.flatten(),
    );
  }

  return parsed.data as z.output<TSchema>;
}

export function parseProjectImportHubInput(source: ProjectImportHubSource, input: unknown): ProjectImportHubInput {
  return parseInput(sourceInputSchemas[source], input) as ProjectImportHubInput;
}

function storedSource(source: ProjectImportHubSource): StoredProjectImportSource {
  return source === 'previous-agent-export' ? 'previous-agent' : source;
}

function publicSource(source: StoredProjectImportSource): ProjectImportHubSource {
  return source === 'previous-agent' ? 'previous-agent-export' : source;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    if (
      typeof record.contentBase64 === 'string' &&
      typeof record.sha256 === 'string' &&
      typeof record.sizeBytes === 'number'
    ) {
      return Object.fromEntries(
        Object.keys(record)
          .filter((key) => key !== 'contentBase64')
          .sort()
          .map((key) => [key, canonicalize(record[key])]),
      );
    }

    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }

  return value;
}

export function hashProjectImportHubRequest(request: ProjectImportHubRequest): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(request)))
    .digest('hex');
}

function sourceReference(request: ProjectImportHubRequest): string | undefined {
  const input = request.input;

  if (typeof input.repositoryUrl === 'string') return input.repositoryUrl;
  if (typeof input.sourceUrl === 'string') return input.sourceUrl;
  if (
    input.file &&
    typeof input.file === 'object' &&
    typeof (input.file as Record<string, unknown>).fileName === 'string'
  ) {
    return `upload:${String((input.file as Record<string, unknown>).fileName)}`;
  }
  return undefined;
}

function sourceLabel(request: ProjectImportHubRequest): string | undefined {
  const input = request.input;
  if (typeof input.name === 'string') return input.name;

  const reference = sourceReference(request);
  if (!reference) return request.source === 'empty' ? String(input.name ?? 'Empty project') : undefined;

  if (reference.startsWith('upload:')) return reference.slice('upload:'.length);

  try {
    return new URL(reference).pathname
      .split('/')
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.git$/i, '');
  } catch {
    return undefined;
  }
}

function parseIdempotencyKey(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (
    !candidate ||
    candidate.trim() !== candidate ||
    candidate.length < 8 ||
    candidate.length > 128 ||
    !/^[\x21-\x7e]+$/.test(candidate)
  ) {
    throw new ProjectImportHubError(
      'Idempotency-Key must contain 8 to 128 visible ASCII characters',
      400,
      'PROJECT_IMPORT_IDEMPOTENCY_KEY_REQUIRED',
    );
  }

  return candidate;
}

function normalizeInspectionPath(rawPath: string): string {
  const slashPath = rawPath.replaceAll('\\', '/');

  if (!slashPath || slashPath.includes('\0') || slashPath.startsWith('/') || /^[a-z]:\//i.test(slashPath)) {
    throw new ProjectImportHubError(
      'Import inspection returned an unsafe file path',
      422,
      'PROJECT_IMPORT_UNSAFE_PATH',
    );
  }

  const normalized = path.posix.normalize(slashPath).replace(/^\.\//, '');

  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new ProjectImportHubError(
      'Import inspection returned an unsafe file path',
      422,
      'PROJECT_IMPORT_UNSAFE_PATH',
    );
  }

  return normalized;
}

function secretPath(filePath: string): boolean {
  const segments = filePath.toLowerCase().split('/');
  const basename = segments.at(-1) ?? '';

  return (
    (basename.startsWith('.env') && !['.env.example', '.env.sample', '.env.template'].includes(basename)) ||
    ['credentials.json', 'secrets.json', 'service-account.json', '.npmrc', '.pypirc'].includes(basename) ||
    /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(basename) ||
    segments.includes('.git')
  );
}

function databaseDataPath(filePath: string): boolean {
  const segments = filePath.toLowerCase().split('/');
  const basename = segments.at(-1) ?? '';

  return (
    /\.(?:sqlite|sqlite3|db|sql|dump|bak)$/i.test(basename) ||
    ['database-data', 'pgdata', 'mysql-data'].some((segment) => segments.includes(segment))
  );
}

const BUILTIN_ENV_NAMES = new Set(['NODE_ENV', 'PORT', 'HOST', 'CI', 'PWD', 'HOME']);

function collectSecretNames(content: string, filePath: string, names: Set<string>) {
  const basename = filePath.toLowerCase().split('/').at(-1) ?? '';

  if (basename === '.env' || basename.startsWith('.env.')) {
    for (const match of content.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)) names.add(match[1]!);
  }

  const patterns = [
    /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\bimport\.meta\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\bDeno\.env\.get\(\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\)/g,
    /\b(?:env|requiredEnv|getEnv)\(\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\)/g,
    /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*=/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) names.add(match[1]!);
  }
}

function redactRuntimeSecretAssignments(content: string, names: Set<string>): string {
  return content.replace(
    /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/g,
    (_match, name: string) => {
      names.add(name);
      return `${name}=\${${name}}`;
    },
  );
}

function packageJsonForRuntime(content: string, names: Set<string>): string {
  try {
    const parsed = JSON.parse(content) as { scripts?: Record<string, unknown> };

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.scripts) {
      for (const [key, value] of Object.entries(parsed.scripts)) {
        if (typeof value === 'string') parsed.scripts[key] = redactRuntimeSecretAssignments(value, names);
      }
    }

    return JSON.stringify(parsed);
  } catch {
    return content;
  }
}

function assertNoCredentialMaterial(value: string, label: string): void {
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value) ||
    /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/.test(
      value,
    ) ||
    /\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*\s*=\s*(?!\$\{|\$[A-Z]|<|""|''|null\b)[^\s,;]+/i.test(
      value,
    )
  ) {
    throw new ProjectImportHubError(`${label} contained credential material`, 500, 'PROJECT_IMPORT_UNSAFE_HOOK_OUTPUT');
  }
}

function safeJsonRecord(value: unknown, label: string): Record<string, unknown> {
  const sensitiveKey = /secret|token|password|api.?key|credential|authorization|cookie/i;
  let entries = 0;

  const visit = (candidate: unknown, depth: number): unknown => {
    entries += 1;
    if (entries > 1_000 || depth > 6) {
      throw new ProjectImportHubError(`${label} is too large`, 500, 'PROJECT_IMPORT_INVALID_HOOK_OUTPUT');
    }

    if (candidate === null || typeof candidate === 'boolean' || typeof candidate === 'number') return candidate;
    if (typeof candidate === 'string') {
      if (candidate.length > 4_096) {
        throw new ProjectImportHubError(
          `${label} contains an oversized string`,
          500,
          'PROJECT_IMPORT_INVALID_HOOK_OUTPUT',
        );
      }
      assertNoCredentialMaterial(candidate, label);

      try {
        const url = new URL(candidate);
        if (url.username || url.password || hasSensitiveUrlParameters(url)) {
          throw new ProjectImportHubError(
            `${label} contained a URL credential`,
            500,
            'PROJECT_IMPORT_UNSAFE_HOOK_OUTPUT',
          );
        }
      } catch (error) {
        if (error instanceof ProjectImportHubError) throw error;
        // Ordinary non-URL metadata is valid.
      }
      return candidate;
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > 200) {
        throw new ProjectImportHubError(
          `${label} contains an oversized array`,
          500,
          'PROJECT_IMPORT_INVALID_HOOK_OUTPUT',
        );
      }
      return candidate.map((item) => visit(item, depth + 1));
    }
    if (!candidate || typeof candidate !== 'object' || Object.getPrototypeOf(candidate) !== Object.prototype) {
      throw new ProjectImportHubError(
        `${label} must contain JSON data only`,
        500,
        'PROJECT_IMPORT_INVALID_HOOK_OUTPUT',
      );
    }

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(candidate as Record<string, unknown>)) {
      if (sensitiveKey.test(key)) {
        throw new ProjectImportHubError(
          `${label} contained a sensitive field`,
          500,
          'PROJECT_IMPORT_UNSAFE_HOOK_OUTPUT',
        );
      }
      output[key] = visit(child, depth + 1);
    }
    return output;
  };

  const sanitized = visit(value ?? {}, 0);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    throw new ProjectImportHubError(`${label} must be an object`, 500, 'PROJECT_IMPORT_INVALID_HOOK_OUTPUT');
  }
  return sanitized as Record<string, unknown>;
}

function sanitizeGeneratedConfig(
  config: ProjectImportInspectionResult['generatedConfig'],
): Array<{ path: string; content: string }> {
  if (!config) return [];
  if (config.length > 32) {
    throw new ProjectImportHubError(
      'Generated import configuration has too many files',
      500,
      'PROJECT_IMPORT_INVALID_HOOK_OUTPUT',
    );
  }

  const seen = new Set<string>();
  let totalBytes = 0;

  return config.map((file) => {
    const filePath = normalizeInspectionPath(file.path);
    if (seen.has(filePath) || secretPath(filePath) || databaseDataPath(filePath)) {
      throw new ProjectImportHubError(
        'Generated import configuration contains an unsafe path',
        500,
        'PROJECT_IMPORT_UNSAFE_HOOK_OUTPUT',
      );
    }
    seen.add(filePath);
    totalBytes += Buffer.byteLength(file.content, 'utf8');
    if (totalBytes > MAX_GENERATED_CONFIG_BYTES) {
      throw new ProjectImportHubError(
        'Generated import configuration is too large',
        500,
        'PROJECT_IMPORT_INVALID_HOOK_OUTPUT',
      );
    }
    assertNoCredentialMaterial(file.content, 'Generated import configuration');
    return { path: filePath, content: file.content };
  });
}

interface InspectionAnalysis {
  validation: Record<string, unknown>;
  runtimeDetection: Record<string, unknown>;
  missingSecretNames: string[];
  generatedConfig: Array<{ path: string; content: string }>;
  preview: Record<string, unknown>;
  usesAgent: boolean;
}

/*
 * Repository/archive/export imports preserve code directly. Design and hosted
 * app migrations require Agent reconstruction/analysis and therefore disclose
 * credit use before the user can create anything.
 */
const agentRequiredSources = new Set<ProjectImportHubSource>([
  'figma',
  'claude',
  'bolt',
  'lovable',
  'base44',
  'spreadsheet',
]);

function analyzeInspection(source: ProjectImportHubSource, result: ProjectImportInspectionResult): InspectionAnalysis {
  if (!Array.isArray(result.files)) {
    throw new ProjectImportHubError(
      'Source inspector did not return a file list',
      500,
      'PROJECT_IMPORT_INVALID_HOOK_OUTPUT',
    );
  }
  if (result.files.length > MAX_INSPECTED_FILES) {
    throw new ProjectImportHubError('Import contains too many files', 422, 'PROJECT_IMPORT_TOO_MANY_FILES');
  }

  const files: Array<{ path: string; content?: string; sizeBytes: number }> = [];
  const seenPaths = new Set<string>();
  const excludedSecretPaths: string[] = [];
  const excludedDatabasePaths: string[] = [];
  const missingSecretNames = new Set<string>();
  let contentBytes = 0;

  for (const inputFile of result.files) {
    if (!inputFile || typeof inputFile.path !== 'string') {
      throw new ProjectImportHubError(
        'Source inspector returned an invalid file',
        500,
        'PROJECT_IMPORT_INVALID_HOOK_OUTPUT',
      );
    }
    const filePath = normalizeInspectionPath(inputFile.path);
    if (seenPaths.has(filePath)) {
      throw new ProjectImportHubError(
        'Source inspector returned duplicate file paths',
        422,
        'PROJECT_IMPORT_DUPLICATE_PATH',
      );
    }
    seenPaths.add(filePath);
    const content = inputFile.content;
    if (content !== undefined && typeof content !== 'string') {
      throw new ProjectImportHubError(
        'Inspected text file content must be a string',
        500,
        'PROJECT_IMPORT_INVALID_HOOK_OUTPUT',
      );
    }
    const measuredBytes = content === undefined ? (inputFile.sizeBytes ?? 0) : Buffer.byteLength(content, 'utf8');
    if (
      !Number.isSafeInteger(measuredBytes) ||
      measuredBytes < 0 ||
      (content !== undefined && measuredBytes > MAX_INSPECTED_FILE_CONTENT_BYTES)
    ) {
      throw new ProjectImportHubError(
        'Inspected file metadata is invalid or too large',
        422,
        'PROJECT_IMPORT_FILE_TOO_LARGE',
      );
    }
    if (content !== undefined) {
      contentBytes += measuredBytes;
      if (contentBytes > MAX_INSPECTED_CONTENT_BYTES) {
        throw new ProjectImportHubError(
          'Inspected text content is too large',
          422,
          'PROJECT_IMPORT_INSPECTION_TOO_LARGE',
        );
      }
    }

    if (secretPath(filePath)) {
      excludedSecretPaths.push(filePath);
      if (content) collectSecretNames(content, filePath, missingSecretNames);
      continue;
    }
    if (databaseDataPath(filePath)) {
      excludedDatabasePaths.push(filePath);
      continue;
    }
    if (content) collectSecretNames(content, filePath, missingSecretNames);
    files.push({ path: filePath, ...(content === undefined ? {} : { content }), sizeBytes: measuredBytes });
  }

  const unsupportedRuntime = files.find((file) =>
    /(?:^|\/)(?:requirements\.txt|pyproject\.toml|pipfile|go\.mod|cargo\.toml)$|\.(?:py|go|rs)$/i.test(file.path),
  );
  if (unsupportedRuntime) {
    throw new ProjectImportHubError(
      `The detected runtime is not available for import (${unsupportedRuntime.path})`,
      422,
      'PROJECT_IMPORT_RUNTIME_NOT_SUPPORTED',
      false,
    );
  }

  const packageFile = files.find((file) => file.path === 'package.json');
  const topLevelFiles = files.filter((file) => !file.path.includes('/')).map((file) => file.path);
  const usesAgent = source !== 'empty' && agentRequiredSources.has(source);
  let runtimeDetection: Record<string, unknown>;
  let generatedConfig: Array<{ path: string; content: string }> = [];

  if (source === 'empty') {
    runtimeDetection = { runtime: 'empty', framework: null, packageManager: null, status: 'ready' };
  } else if (packageFile?.content) {
    const detection = detectServerRuntime({
      packageJson: packageJsonForRuntime(packageFile.content, missingSecretNames),
      topLevelFiles,
    });

    if (isDetectionError(detection)) {
      if (detection.code === 'STATIC_ONLY') {
        runtimeDetection = {
          runtime: 'static',
          framework: 'vite',
          packageManager: topLevelFiles.includes('pnpm-lock.yaml')
            ? 'pnpm'
            : topLevelFiles.includes('yarn.lock')
              ? 'yarn'
              : topLevelFiles.includes('bun.lockb')
                ? 'bun'
                : 'npm',
          status: 'ready',
          reason: detection.error,
        };
      } else {
        runtimeDetection = {
          runtime: 'javascript',
          framework: 'unknown',
          status: 'needs-config',
          reason: detection.error,
        };
      }
    } else {
      runtimeDetection = { runtime: 'node', status: 'ready', ...detection };
    }
  } else if (files.some((file) => /(?:^|\/)index\.html$/i.test(file.path))) {
    runtimeDetection = { runtime: 'static', framework: 'html', packageManager: null, status: 'ready' };
  } else if (usesAgent) {
    runtimeDetection = {
      runtime: 'agent-generated',
      framework: null,
      packageManager: null,
      status: 'generated-on-create',
    };
  } else {
    throw new ProjectImportHubError(
      'No supported JavaScript, TypeScript, or static runtime could be detected',
      422,
      'PROJECT_IMPORT_RUNTIME_NOT_DETECTED',
      true,
    );
  }

  if (source !== 'empty') {
    generatedConfig = [
      {
        path: '.vibecore/runtime.json',
        content: `${JSON.stringify({ schemaVersion: 1, ...runtimeDetection }, null, 2)}\n`,
      },
    ];
  }
  const hookConfig = sanitizeGeneratedConfig(result.generatedConfig);
  for (const file of hookConfig) {
    const index = generatedConfig.findIndex((candidate) => candidate.path === file.path);
    if (index >= 0) generatedConfig[index] = file;
    else generatedConfig.push(file);
  }

  for (const name of BUILTIN_ENV_NAMES) missingSecretNames.delete(name);
  const validation = {
    status: 'valid',
    checks: [
      'provider-source-validated',
      'runtime-detected',
      'secret-values-excluded',
      'database-data-excluded',
      'configuration-generated',
    ],
    fileCount: files.length,
    excludedSecretPaths: excludedSecretPaths.sort(),
    excludedDatabasePaths: excludedDatabasePaths.sort(),
    provider: safeJsonRecord(result.validation ?? {}, 'Source validation metadata'),
    recoveryPhase: 'preflight',
  };
  const defaultPreview =
    source === 'empty'
      ? { kind: 'empty-project', fileCount: 0, message: 'No framework or scaffold will be created.' }
      : {
          kind: usesAgent ? 'agent-plan' : 'file-manifest',
          fileCount: files.length,
          entrypoints: files
            .map((file) => file.path)
            .filter((filePath) => /(?:^|\/)(?:index\.html|package\.json|src\/main\.[cm]?[jt]sx?)$/i.test(filePath))
            .slice(0, 10),
        };

  return {
    validation,
    runtimeDetection,
    missingSecretNames: [...missingSecretNames].sort(),
    generatedConfig,
    preview: {
      ...defaultPreview,
      ...safeJsonRecord(result.preview ?? {}, 'Source preview metadata'),
    },
    usesAgent,
  };
}

function emptyInspection(): InspectionAnalysis {
  return analyzeInspection('empty', { files: [] });
}

function publicJob(job: ProjectImportJobRecord) {
  return {
    id: job.id,
    organizationId: job.organizationId,
    createdByUserId: job.userId,
    source: publicSource(job.source),
    status: job.status,
    sourceReference: job.sourceReference,
    sourceLabel: job.sourceLabel,
    stage: job.stage,
    progress: job.progress,
    validation: job.validation,
    runtimeDetection: job.runtimeDetection,
    missingSecretNames: job.missingSecretNames,
    generatedConfig: job.generatedConfig,
    preview: job.preview,
    usesAgent: job.usesAgent,
    creditsDisclosure: job.creditsDisclosure,
    projectId: job.destinationProjectId,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    recoverable: job.recoverable,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

async function requirePrincipal(
  request: FastifyRequest,
  options: ProjectImportHubOptions,
): Promise<ProjectImportHubPrincipal> {
  const principal = await options.authenticate(request);
  if (!principal) {
    throw new ProjectImportHubError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
  }
  return principal;
}

async function requireOrganizationPermission(input: {
  request: FastifyRequest;
  options: ProjectImportHubOptions;
  principal: ProjectImportHubPrincipal;
  organizationId: string;
  permission: ProjectImportHubPermission;
}) {
  const allowed = await input.options.authorizeOrganization({
    request: input.request,
    userId: input.principal.userId,
    organizationId: input.organizationId,
    permission: input.permission,
  });
  if (!allowed) {
    throw new ProjectImportHubError('Project import not found', 404, 'PROJECT_IMPORT_NOT_FOUND');
  }
}

function requireOwnedJob(
  job: ProjectImportJobRecord | undefined,
  organizationId: string,
  userId?: string,
): ProjectImportJobRecord {
  if (!job || job.organizationId !== organizationId || (userId && job.userId !== userId)) {
    throw new ProjectImportHubError('Project import not found', 404, 'PROJECT_IMPORT_NOT_FOUND');
  }
  return job;
}

function safeHookError(error: unknown, phase: 'validation' | 'creation'): ProjectImportHubError {
  if (error instanceof ProjectImportHubError) return error;
  return new ProjectImportHubError(
    phase === 'validation' ? 'Unable to inspect the import source' : 'Unable to create the imported project',
    502,
    phase === 'validation' ? 'PROJECT_IMPORT_INSPECTION_FAILED' : 'PROJECT_IMPORT_MATERIALIZATION_FAILED',
    true,
  );
}

function sendRouteError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  const candidate = error as {
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
    details?: unknown;
    recoverable?: unknown;
  };
  const statusCode =
    typeof candidate?.statusCode === 'number' && candidate.statusCode >= 400 && candidate.statusCode <= 599
      ? candidate.statusCode
      : 500;
  const code = typeof candidate?.code === 'string' ? candidate.code : 'PROJECT_IMPORT_INTERNAL_ERROR';
  const message =
    statusCode < 500 && typeof candidate?.message === 'string'
      ? candidate.message
      : 'Unable to process project import request';

  if (statusCode >= 500) request.log.error({ err: error }, 'Project import hub route failed');
  return reply.code(statusCode).send({
    error: message,
    code,
    recoverable: candidate?.recoverable === true,
    ...(candidate?.details === undefined ? {} : { details: candidate.details }),
  });
}

async function runRoute(request: FastifyRequest, reply: FastifyReply, operation: () => Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    return sendRouteError(request, reply, error);
  }
}

async function persistInspectionFailure(input: {
  options: ProjectImportHubOptions;
  job: ProjectImportJobRecord;
  error: ProjectImportHubError;
}) {
  return input.options.store.updateProjectImportJob({
    importJobId: input.job.id,
    organizationId: input.job.organizationId,
    status: 'FAILED',
    stage: 'validation.failed',
    progress: Math.min(input.job.progress, 40),
    validation: { phase: 'preflight', status: 'failed', recoveryPhase: 'preflight' },
    errorCode: input.error.code,
    errorMessage: input.error.message,
    recoverable: input.error.recoverable,
    failedAt: new Date().toISOString(),
  });
}

async function inspectJob(input: {
  request: FastifyRequest;
  options: ProjectImportHubOptions;
  principal: ProjectImportHubPrincipal;
  job: ProjectImportJobRecord;
  requestPayload: ProjectImportHubRequest;
}): Promise<
  { ok: true; job: ProjectImportJobRecord } | { ok: false; job: ProjectImportJobRecord; error: ProjectImportHubError }
> {
  const validating = await input.options.store.updateProjectImportJob({
    importJobId: input.job.id,
    organizationId: input.job.organizationId,
    status: 'VALIDATING',
    stage: 'validation.inspecting',
    progress: 20,
    errorCode: null,
    errorMessage: null,
    recoverable: false,
    failedAt: null,
  });

  try {
    const inspected =
      input.requestPayload.source === 'empty'
        ? emptyInspection()
        : analyzeInspection(
            input.requestPayload.source,
            await input.options.inspectSource({
              request: input.request,
              organizationId: input.job.organizationId,
              userId: input.principal.userId,
              source: input.requestPayload.source,
              input: input.requestPayload.input,
            }),
          );
    const ready = await input.options.store.updateProjectImportJob({
      importJobId: validating.id,
      organizationId: validating.organizationId,
      status: 'READY',
      stage: 'ready',
      progress: 45,
      validation: inspected.validation,
      runtimeDetection: inspected.runtimeDetection,
      missingSecretNames: inspected.missingSecretNames,
      generatedConfig: inspected.generatedConfig,
      preview: inspected.preview,
      errorCode: null,
      errorMessage: null,
      recoverable: false,
      failedAt: null,
    });

    /* usesAgent/creditsDisclosure are immutable store fields set from source defaults at job creation. */
    if (ready.usesAgent !== inspected.usesAgent) {
      throw new ProjectImportHubError(
        'Source inspector changed Agent usage after the job was created',
        500,
        'PROJECT_IMPORT_AGENT_DISCLOSURE_MISMATCH',
      );
    }
    return { ok: true, job: ready };
  } catch (error) {
    const safe = safeHookError(error, 'validation');
    input.request.log.warn(
      { importJobId: input.job.id, code: safe.code, recoverable: safe.recoverable },
      'Project import preflight failed',
    );
    return {
      ok: false,
      job: await persistInspectionFailure({ options: input.options, job: validating, error: safe }),
      error: safe,
    };
  }
}

function sendJobFailure(reply: FastifyReply, result: { job: ProjectImportJobRecord; error: ProjectImportHubError }) {
  return reply.code(result.error.statusCode).send({
    error: result.error.message,
    code: result.error.code,
    recoverable: result.error.recoverable,
    job: publicJob(result.job),
  });
}

/** Registers the two-phase, tenant-scoped Import Hub API. */
export async function registerProjectImportHubRoutes(
  app: FastifyInstance,
  options: ProjectImportHubOptions,
): Promise<void> {
  app.get('/organizations/:orgId/project-imports', async (request, reply) =>
    runRoute(request, reply, async () => {
      const { orgId } = parseInput(organizationParamsSchema, request.params);
      const { limit } = parseInput(listQuerySchema, request.query);
      const principal = await requirePrincipal(request, options);
      await requireOrganizationPermission({
        request,
        options,
        principal,
        organizationId: orgId,
        permission: 'projects:read',
      });
      return reply.send({ jobs: (await options.store.listProjectImportJobs(orgId, limit)).map(publicJob) });
    }),
  );

  app.get('/organizations/:orgId/project-imports/:importJobId', async (request, reply) =>
    runRoute(request, reply, async () => {
      const { orgId, importJobId } = parseInput(jobParamsSchema, request.params);
      const principal = await requirePrincipal(request, options);
      await requireOrganizationPermission({
        request,
        options,
        principal,
        organizationId: orgId,
        permission: 'projects:read',
      });
      const job = requireOwnedJob(
        await options.store.getProjectImportJob({ importJobId, organizationId: orgId }),
        orgId,
      );
      return reply.send({ job: publicJob(job) });
    }),
  );

  app.post('/organizations/:orgId/project-imports/preflight', async (request, reply) =>
    runRoute(request, reply, async () => {
      const { orgId } = parseInput(organizationParamsSchema, request.params);
      const principal = await requirePrincipal(request, options);
      await requireOrganizationPermission({
        request,
        options,
        principal,
        organizationId: orgId,
        permission: 'projects:write',
      });
      const envelope = parseInput(preflightEnvelopeSchema, request.body);
      const normalized: ProjectImportHubRequest = {
        source: envelope.source,
        input: parseProjectImportHubInput(envelope.source, envelope.input),
      };
      const idempotencyKey = parseIdempotencyKey(request.headers['idempotency-key']);
      const requestHash = hashProjectImportHubRequest(normalized);

      return options.store.withSerializedMutation(`project-import-preflight:${orgId}:${idempotencyKey}`, async () => {
        const existing = await options.store.getProjectImportJobByIdempotency({
          organizationId: orgId,
          idempotencyKey,
        });
        if (existing) {
          if (
            existing.userId !== principal.userId ||
            existing.source !== storedSource(normalized.source) ||
            existing.requestHash !== requestHash
          ) {
            throw new ProjectImportHubError(
              'Idempotency-Key was already used for a different import',
              409,
              'IDEMPOTENCY_KEY_REUSED',
            );
          }
          if (existing.status !== 'VALIDATING') {
            reply.header('Idempotency-Replayed', 'true');
            return reply.code(200).send({ job: publicJob(existing) });
          }
        }

        const initialUsesAgent = normalized.source !== 'empty' && agentRequiredSources.has(normalized.source);
        const job =
          existing ??
          (await options.store.createProjectImportJob({
            organizationId: orgId,
            userId: principal.userId,
            source: storedSource(normalized.source),
            idempotencyKey,
            requestHash,
            sourceReference: sourceReference(normalized),
            sourceLabel: sourceLabel(normalized),
            stage: 'validation.queued',
            progress: 5,
            validation: { phase: 'preflight', status: 'queued', recoveryPhase: 'preflight' },
            usesAgent: initialUsesAgent,
            creditsDisclosure: initialUsesAgent ? AGENT_CREDITS_DISCLOSURE : undefined,
          }));
        const result = await inspectJob({ request, options, principal, job, requestPayload: normalized });
        if (!result.ok) return sendJobFailure(reply, result);
        return reply.code(existing ? 200 : 201).send({ job: publicJob(result.job) });
      });
    }),
  );

  app.post('/organizations/:orgId/project-imports/:importJobId/create', async (request, reply) =>
    runRoute(request, reply, async () => {
      const { orgId, importJobId } = parseInput(jobParamsSchema, request.params);
      const { input: rawInput } = parseInput(createEnvelopeSchema, request.body);
      const principal = await requirePrincipal(request, options);
      await requireOrganizationPermission({
        request,
        options,
        principal,
        organizationId: orgId,
        permission: 'projects:write',
      });

      return options.store.withSerializedMutation(`project-import-create:${orgId}:${importJobId}`, async () => {
        let job = requireOwnedJob(
          await options.store.getProjectImportJob({ importJobId, organizationId: orgId }),
          orgId,
          principal.userId,
        );
        const source = publicSource(job.source);
        const normalized: ProjectImportHubRequest = { source, input: parseProjectImportHubInput(source, rawInput) };
        if (hashProjectImportHubRequest(normalized) !== job.requestHash) {
          throw new ProjectImportHubError(
            'Import payload changed after preflight; run a new preflight',
            409,
            'PROJECT_IMPORT_PREFLIGHT_HASH_MISMATCH',
          );
        }
        if (job.status === 'COMPLETE' && job.destinationProjectId) {
          reply.header('Idempotency-Replayed', 'true');
          return reply.code(200).send({ job: publicJob(job), projectId: job.destinationProjectId });
        }
        if (job.status !== 'READY') {
          throw new ProjectImportHubError(
            job.status === 'FAILED'
              ? 'Retry the recoverable preflight before creating the project'
              : 'Import preflight is not ready',
            409,
            'PROJECT_IMPORT_NOT_READY',
            job.recoverable,
          );
        }

        job = await options.store.updateProjectImportJob({
          importJobId: job.id,
          organizationId: orgId,
          status: 'CREATING',
          stage: 'creation.materializing',
          progress: 60,
          errorCode: null,
          errorMessage: null,
          failedAt: null,
          recoverable: false,
        });

        try {
          const materialized = await options.materializeImport({
            request,
            organizationId: orgId,
            userId: principal.userId,
            source,
            input: normalized.input,
            job,
            materializationKey: `project-import:${job.id}`,
            policy: {
              copySecretValues: false,
              copyDatabaseData: false,
              allowSpreadsheetSeedData: source === 'spreadsheet',
              useAgent: job.usesAgent,
              scaffold: source !== 'empty',
            },
          });
          if (!materialized.projectId || materialized.projectId.length > 128) {
            throw new ProjectImportHubError(
              'Import materializer returned an invalid project id',
              500,
              'PROJECT_IMPORT_INVALID_HOOK_OUTPUT',
            );
          }
          const metadata = safeJsonRecord(materialized.metadata, 'Import materialization metadata');
          const complete = await options.store.updateProjectImportJob({
            importJobId: job.id,
            organizationId: orgId,
            status: 'COMPLETE',
            stage: 'complete',
            progress: 100,
            destinationProjectId: materialized.projectId,
            preview: { ...job.preview, materialization: metadata },
            errorCode: null,
            errorMessage: null,
            recoverable: false,
            completedAt: new Date().toISOString(),
            failedAt: null,
          });
          return reply.code(201).send({ job: publicJob(complete), projectId: materialized.projectId, metadata });
        } catch (error) {
          const safe = safeHookError(error, 'creation');
          request.log.error(
            { importJobId: job.id, code: safe.code, recoverable: safe.recoverable },
            'Project import materialization failed',
          );
          const failed = await options.store.updateProjectImportJob({
            importJobId: job.id,
            organizationId: orgId,
            status: 'FAILED',
            stage: 'creation.failed',
            progress: 60,
            validation: { ...job.validation, recoveryPhase: 'preflight' },
            errorCode: safe.code,
            errorMessage: safe.message,
            recoverable: safe.recoverable,
            failedAt: new Date().toISOString(),
          });
          return sendJobFailure(reply, { job: failed, error: safe });
        }
      });
    }),
  );

  app.post('/organizations/:orgId/project-imports/:importJobId/retry', async (request, reply) =>
    runRoute(request, reply, async () => {
      const { orgId, importJobId } = parseInput(jobParamsSchema, request.params);
      const { input: rawInput } = parseInput(createEnvelopeSchema, request.body);
      const principal = await requirePrincipal(request, options);
      await requireOrganizationPermission({
        request,
        options,
        principal,
        organizationId: orgId,
        permission: 'projects:write',
      });

      return options.store.withSerializedMutation(`project-import-retry:${orgId}:${importJobId}`, async () => {
        const job = requireOwnedJob(
          await options.store.getProjectImportJob({ importJobId, organizationId: orgId }),
          orgId,
          principal.userId,
        );
        if (job.status !== 'FAILED' || !job.recoverable) {
          throw new ProjectImportHubError(
            'Only a recoverable failed import can be retried',
            409,
            'PROJECT_IMPORT_NOT_RETRYABLE',
          );
        }
        const source = publicSource(job.source);
        const normalized: ProjectImportHubRequest = { source, input: parseProjectImportHubInput(source, rawInput) };
        if (hashProjectImportHubRequest(normalized) !== job.requestHash) {
          throw new ProjectImportHubError(
            'Import payload changed after preflight; start a new import',
            409,
            'PROJECT_IMPORT_PREFLIGHT_HASH_MISMATCH',
          );
        }

        const result = await inspectJob({ request, options, principal, job, requestPayload: normalized });
        if (!result.ok) return sendJobFailure(reply, result);
        return reply.send({ job: publicJob(result.job) });
      });
    }),
  );
}
