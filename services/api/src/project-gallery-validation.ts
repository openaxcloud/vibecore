import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

const MAX_GALLERY_FILES = 512;
const MAX_GALLERY_FILE_BYTES = 2 * 1024 * 1024;
const MAX_GALLERY_TOTAL_BYTES = 10 * 1024 * 1024;

const taxonomyPattern = /^[a-z0-9][a-z0-9+._-]*$/;
const slugPattern = /^[a-z0-9][a-z0-9-]*$/;
const environmentNamePattern = /^[A-Z_][A-Z0-9_]*$/;
const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export const galleryArtifactTypeSchema = z.enum([
  'BUSINESS_APP',
  'BOOKING',
  'CRM',
  'DASHBOARD',
  'ECOMMERCE',
  'GAME',
  'INTERNAL_TOOL',
  'LANDING_PAGE',
  'PRODUCTIVITY',
  'SOCIAL',
  'OTHER',
]);

export const galleryVisibilitySchema = z.enum(['PUBLIC', 'UNLISTED']);
export const gallerySortSchema = z.enum(['FEATURED', 'MOST_REMIXED', 'RECENT', 'NAME']).default('FEATURED');
export const galleryReportReasonSchema = z.enum([
  'COPYRIGHT',
  'DECEPTIVE',
  'HARMFUL',
  'INAPPROPRIATE',
  'MALWARE',
  'PRIVACY',
  'SPAM',
  'OTHER',
]);

const taxonomyArraySchema = z
  .array(z.string().trim().toLowerCase().min(1).max(40).regex(taxonomyPattern))
  .min(1)
  .max(20)
  .transform((values) => [...new Set(values)]);

const optionalTaxonomyArraySchema = z
  .array(z.string().trim().toLowerCase().min(1).max(40).regex(taxonomyPattern))
  .max(20)
  .transform((values) => [...new Set(values)]);

const httpsUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .url()
  .refine((value) => new URL(value).protocol === 'https:', { message: 'URL must use HTTPS' });

const commandSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/[\0\r\n]/.test(value), { message: 'Command cannot contain control characters' });

export const galleryRuntimeConfigurationSchema = z
  .object({
    packageManager: z.enum(['npm', 'pnpm', 'yarn', 'bun']),
    installCommand: commandSchema,
    devCommand: commandSchema,
    buildCommand: commandSchema.optional(),
    startCommand: commandSchema.optional(),
    previewPort: z.number().int().min(1_024).max(65_535),
    requiredSecretNames: z
      .array(z.string().trim().min(1).max(128).regex(environmentNamePattern))
      .max(100)
      .transform((values) => [...new Set(values)].sort()),
  })
  .strict();

export const galleryDataRequirementSchema = z
  .object({
    key: z.string().trim().toLowerCase().min(1).max(64).regex(taxonomyPattern),
    kind: z.enum(['POSTGRES', 'OBJECT_STORAGE', 'REDIS']),
    required: z.boolean().default(true),
  })
  .strict();

export const galleryAppCreateSchema = z
  .object({
    sourceProjectId: z.string().trim().min(1).max(128),
    slug: z.string().trim().toLowerCase().min(1).max(100).regex(slugPattern).optional(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(2_000),
    artifactType: galleryArtifactTypeSchema,
    category: z.string().trim().toLowerCase().min(1).max(40).regex(taxonomyPattern),
    technologies: taxonomyArraySchema,
    tags: optionalTaxonomyArraySchema.default([]),
    thumbnailUrl: httpsUrlSchema,
    visibility: galleryVisibilitySchema.default('PUBLIC'),
    allowRemix: z.boolean().default(true),
  })
  .strict();

export const galleryAppUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(2_000).optional(),
    artifactType: galleryArtifactTypeSchema.optional(),
    category: z.string().trim().toLowerCase().min(1).max(40).regex(taxonomyPattern).optional(),
    technologies: taxonomyArraySchema.optional(),
    tags: optionalTaxonomyArraySchema.optional(),
    thumbnailUrl: httpsUrlSchema.optional(),
    visibility: galleryVisibilitySchema.optional(),
    allowRemix: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'patch must include at least one field' });

export const galleryListQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().toLowerCase().min(1).max(40).regex(taxonomyPattern).optional(),
    artifactType: galleryArtifactTypeSchema.optional(),
    technology: z.string().trim().toLowerCase().min(1).max(40).regex(taxonomyPattern).optional(),
    featured: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    sort: gallerySortSchema,
    cursor: z.string().trim().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(24),
  })
  .strict();

export const galleryTenantListQuerySchema = z
  .object({
    status: z.enum(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED']).optional(),
    cursor: z.string().trim().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const galleryRemixSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().toLowerCase().min(1).max(100).regex(slugPattern).optional(),
  })
  .strict();

export const galleryReportSchema = z
  .object({
    reason: galleryReportReasonSchema,
    details: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reason === 'OTHER' && !value.details) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['details'], message: 'details are required for OTHER' });
    }
  });

export const galleryModerationSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT', 'ARCHIVE', 'FEATURE', 'UNFEATURE']),
    reason: z.string().trim().min(1).max(1_000).optional(),
    functionalPreviewConfirmed: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (['REJECT', 'ARCHIVE'].includes(value.action) && !value.reason) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'reason is required' });
    }

    if (value.action !== 'APPROVE' && value.functionalPreviewConfirmed !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['functionalPreviewConfirmed'],
        message: 'functionalPreviewConfirmed is only valid for APPROVE',
      });
    }
  });

export const galleryReportResolutionSchema = z
  .object({
    resolution: z.enum(['DISMISSED', 'ACTIONED']),
    note: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const galleryModerationListQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const galleryReportListQuerySchema = z
  .object({
    status: z.enum(['OPEN', 'DISMISSED', 'ACTIONED']).default('OPEN'),
    cursor: z.string().trim().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const organizationParamsSchema = z.object({ orgId: z.string().trim().min(1).max(128) }).strict();
export const galleryAppParamsSchema = z.object({ appId: z.string().trim().min(1).max(128) }).strict();
export const gallerySlugParamsSchema = z
  .object({ slug: z.string().trim().toLowerCase().min(1).max(100).regex(slugPattern) })
  .strict();
export const tenantGalleryAppParamsSchema = z
  .object({ orgId: z.string().trim().min(1).max(128), appId: z.string().trim().min(1).max(128) })
  .strict();
export const galleryReportParamsSchema = z.object({ reportId: z.string().trim().min(1).max(128) }).strict();
export const emptyBodySchema = z.object({}).strict();

export type GalleryArtifactType = z.infer<typeof galleryArtifactTypeSchema>;
export type GalleryVisibility = z.infer<typeof galleryVisibilitySchema>;
export type GalleryRuntimeConfiguration = z.infer<typeof galleryRuntimeConfigurationSchema>;
export type GalleryDataRequirement = z.infer<typeof galleryDataRequirementSchema>;
export type GalleryAppCreateInput = z.infer<typeof galleryAppCreateSchema>;
export type GalleryAppUpdateInput = z.infer<typeof galleryAppUpdateSchema>;

export interface GallerySnapshotFile {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
}

export interface GallerySourceSnapshot {
  files: GallerySnapshotFile[];
  runtime: GalleryRuntimeConfiguration;
  dataRequirements: GalleryDataRequirement[];
}

export interface PreparedGallerySnapshot extends GallerySourceSnapshot {
  contentHash: string;
  byteLength: number;
  removedPaths: string[];
  redactedValueCount: number;
  validationChecks: string[];
}

export class ProjectGalleryValidationError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = 'ProjectGalleryValidationError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function parseGalleryInput<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ProjectGalleryValidationError(
      'Invalid Gallery request',
      400,
      'GALLERY_VALIDATION_FAILED',
      result.error.flatten(),
    );
  }

  return result.data as z.output<TSchema>;
}

export function parseGalleryIdempotencyKey(value: unknown): string {
  const result = z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(idempotencyKeyPattern)
    .safeParse(Array.isArray(value) ? value[0] : value);

  if (!result.success) {
    throw new ProjectGalleryValidationError(
      'A valid Idempotency-Key header is required',
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  }

  return result.data;
}

const lockfileBasenames = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']);

const runtimeDataBasenames = new Set([
  'database.sqlite',
  'database.sqlite3',
  'data.db',
  'data.sqlite',
  'data.sqlite3',
  'dump.rdb',
]);

function isGeneratedLockfile(filePath: string): boolean {
  return lockfileBasenames.has(filePath.toLowerCase().split('/').at(-1) ?? '');
}

function isRuntimeDataFile(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  const basename = lowerPath.split('/').at(-1) ?? '';

  if (runtimeDataBasenames.has(basename) || /\.(?:db|sqlite|sqlite3)(?:-(?:shm|wal))?$/.test(basename)) {
    return true;
  }

  return (
    lowerPath.startsWith('.vibecore/data/') ||
    lowerPath.startsWith('.vibecore/storage/') ||
    lowerPath.startsWith('uploads/') ||
    lowerPath.includes('/uploads/')
  );
}

function validateJavascriptTypescriptOnly(files: readonly GallerySnapshotFile[]): void {
  const unsupportedFile = files.find((file) => {
    const lowerPath = file.path.toLowerCase();
    const basename = lowerPath.split('/').at(-1) ?? '';

    return (
      ['requirements.txt', 'pyproject.toml', 'pipfile', 'go.mod', 'cargo.toml'].includes(basename) ||
      /\.(?:py|go|rs)$/.test(lowerPath)
    );
  });

  if (unsupportedFile) {
    throw new ProjectGalleryValidationError(
      `Only JavaScript/TypeScript Gallery apps are currently supported; found ${unsupportedFile.path}`,
      422,
      'GALLERY_RUNTIME_NOT_SUPPORTED',
    );
  }

  if (!files.some((file) => /\.(?:[cm]?[jt]sx?|html)$/i.test(file.path))) {
    throw new ProjectGalleryValidationError(
      'A Gallery app must include JavaScript, TypeScript, JSX, TSX, or HTML source',
      422,
      'GALLERY_ENTRYPOINT_REQUIRED',
    );
  }
}

interface SanitizedGalleryFiles {
  files: GallerySnapshotFile[];
  removedPaths: string[];
  redactedValueCount: number;
}

function isSecretOrGeneratedPath(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  const segments = lowerPath.split('/');
  const basename = segments.at(-1) ?? lowerPath;

  if (segments.some((segment) => ['.git', 'node_modules', '.next', '.nuxt', '.svelte-kit'].includes(segment))) {
    return true;
  }

  if (basename.startsWith('.env') && !['.env.example', '.env.sample', '.env.template'].includes(basename)) {
    return true;
  }

  return (
    ['.npmrc', '.yarnrc', '.pypirc', 'credentials.json', 'secrets.json', 'service-account.json'].includes(basename) ||
    /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(basename)
  );
}

function normalizeGalleryPath(rawPath: string): string {
  const slashPath = rawPath.replaceAll('\\', '/');

  if (!slashPath || slashPath.includes('\0') || slashPath.startsWith('/') || /^[a-z]:\//i.test(slashPath)) {
    throw new ProjectGalleryValidationError(`Unsafe Gallery file path: ${rawPath}`, 422, 'GALLERY_UNSAFE_PATH');
  }

  const normalized = path.posix.normalize(slashPath).replace(/^\.\//, '');

  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new ProjectGalleryValidationError(`Unsafe Gallery file path: ${rawPath}`, 422, 'GALLERY_UNSAFE_PATH');
  }

  return normalized;
}

function redactGallerySecrets(content: string): { content: string; count: number } {
  let count = 0;
  let redacted = content;

  const replace = (pattern: RegExp, replacement: string | ((captures: readonly unknown[]) => string)) => {
    redacted = redacted.replace(pattern, (_match: string, ...captures: unknown[]) => {
      count += 1;
      return typeof replacement === 'string' ? replacement : replacement(captures);
    });
  };

  replace(
    /^(\s*(?:export\s+)?[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|ACCESS_KEY|DATABASE_URL|REDIS_URL|MONGODB_URI|CONNECTION_STRING)[A-Z0-9_]*\s*=\s*)(?!\$\{|\{\{|<|your[-_]|example|changeme)([^\r\n]+)$/gim,
    (captures) => `${String(captures[0] ?? '')}<redacted>`,
  );
  replace(
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    '<redacted-private-key>',
  );
  replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '<redacted-api-key>');
  replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '<redacted-github-token>');
  replace(/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, '<redacted-slack-token>');
  replace(/\bAKIA[0-9A-Z]{16}\b/g, '<redacted-aws-access-key>');
  replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"`]+/gi, '<redacted-database-url>');
  replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi, 'Bearer <redacted-token>');
  replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '<redacted-jwt>');
  replace(
    /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)(\s*=\s*)(["'])(?!\$\{|<|example|changeme)([^"']+)\3/g,
    (captures) =>
      String(captures[0] ?? '') +
      String(captures[1] ?? '') +
      String(captures[2] ?? '') +
      '<redacted>' +
      String(captures[2] ?? ''),
  );
  replace(
    /(["'](?:api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|private[-_]?key)["']\s*:\s*)(["'])(?!\$\{|<|example|changeme)([^"']+)\2/gi,
    (captures) => String(captures[0] ?? '') + String(captures[1] ?? '') + '<redacted>' + String(captures[1] ?? ''),
  );

  return { content: redacted, count };
}

function decodeGalleryBytes(file: GallerySnapshotFile, normalizedPath: string): Buffer {
  if (file.encoding !== 'base64') return Buffer.from(file.content, 'utf8');
  const bytes = Buffer.from(file.content, 'base64');

  if (bytes.toString('base64') !== file.content) {
    throw new ProjectGalleryValidationError(
      `Gallery file contains invalid binary data: ${normalizedPath}`,
      422,
      'GALLERY_INVALID_BINARY',
    );
  }

  return bytes;
}

function decodeGalleryText(bytes: Buffer): string | undefined {
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

function sanitizeFiles(files: readonly GallerySnapshotFile[]): SanitizedGalleryFiles {
  if (files.length > MAX_GALLERY_FILES) {
    throw new ProjectGalleryValidationError(
      `Gallery snapshots are limited to ${MAX_GALLERY_FILES} files`,
      422,
      'GALLERY_TOO_MANY_FILES',
    );
  }

  const sanitized: GallerySnapshotFile[] = [];
  const removedPaths: string[] = [];
  const seenPaths = new Set<string>();

  let totalBytes = 0;
  let redactedValueCount = 0;

  for (const file of files) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      typeof file.content !== 'string' ||
      (file.encoding !== undefined && file.encoding !== 'utf8' && file.encoding !== 'base64')
    ) {
      throw new ProjectGalleryValidationError(
        'Every Gallery file must contain a string path and content',
        422,
        'GALLERY_INVALID_FILE',
      );
    }

    const normalizedPath = normalizeGalleryPath(file.path);

    if (seenPaths.has(normalizedPath)) {
      throw new ProjectGalleryValidationError(
        `Duplicate Gallery file path: ${normalizedPath}`,
        422,
        'GALLERY_DUPLICATE_PATH',
      );
    }

    seenPaths.add(normalizedPath);

    if (
      isSecretOrGeneratedPath(normalizedPath) ||
      isGeneratedLockfile(normalizedPath) ||
      isRuntimeDataFile(normalizedPath)
    ) {
      removedPaths.push(normalizedPath);
      continue;
    }

    const sourceBuffer = decodeGalleryBytes(file, normalizedPath);
    const sourceBytes = sourceBuffer.byteLength;

    if (sourceBytes > MAX_GALLERY_FILE_BYTES) {
      throw new ProjectGalleryValidationError(
        `Gallery file exceeds the ${MAX_GALLERY_FILE_BYTES} byte limit: ${normalizedPath}`,
        422,
        'GALLERY_FILE_TOO_LARGE',
      );
    }

    const decodedText = file.encoding === 'base64' ? decodeGalleryText(sourceBuffer) : file.content;
    const cleaned = decodedText === undefined ? { content: file.content, count: 0 } : redactGallerySecrets(decodedText);
    const safeContent =
      file.encoding === 'base64' && decodedText !== undefined
        ? Buffer.from(cleaned.content, 'utf8').toString('base64')
        : cleaned.content;
    totalBytes +=
      file.encoding === 'base64'
        ? Buffer.from(safeContent, 'base64').byteLength
        : Buffer.byteLength(safeContent, 'utf8');
    redactedValueCount += cleaned.count;

    if (totalBytes > MAX_GALLERY_TOTAL_BYTES) {
      throw new ProjectGalleryValidationError(
        `Gallery snapshot exceeds the ${MAX_GALLERY_TOTAL_BYTES} byte limit`,
        422,
        'GALLERY_SNAPSHOT_TOO_LARGE',
      );
    }

    sanitized.push({
      path: normalizedPath,
      content: safeContent,
      ...(file.encoding === 'base64' ? { encoding: 'base64' as const } : {}),
    });
  }

  sanitized.sort((left, right) => left.path.localeCompare(right.path));
  removedPaths.sort();

  if (sanitized.length === 0) {
    throw new ProjectGalleryValidationError('Gallery snapshot has no publishable files', 422, 'GALLERY_EMPTY_SNAPSHOT');
  }

  return { files: sanitized, removedPaths, redactedValueCount };
}

/**
 * Produces the immutable source artifact used for publication and remix.
 *
 * Runtime databases, object-storage contents, creator secrets and generated
 * dependency locks are intentionally absent. Remix provisions fresh resources
 * and regenerates locks from the copied manifests.
 */
export function prepareGallerySnapshot(input: GallerySourceSnapshot): PreparedGallerySnapshot {
  const runtime = parseGalleryInput(galleryRuntimeConfigurationSchema, input.runtime);
  const dataRequirements = parseGalleryInput(z.array(galleryDataRequirementSchema).max(20), input.dataRequirements);
  const sanitized = sanitizeFiles(input.files);
  const files = sanitized.files.filter((file) => !isGeneratedLockfile(file.path) && !isRuntimeDataFile(file.path));

  const isolatedPaths = sanitized.files
    .filter((file) => isGeneratedLockfile(file.path) || isRuntimeDataFile(file.path))
    .map((file) => file.path)
    .sort();

  validateJavascriptTypescriptOnly(files);

  const canonical = JSON.stringify({ files, runtime, dataRequirements });

  return {
    files,
    runtime,
    dataRequirements,
    contentHash: createHash('sha256').update(canonical).digest('hex'),
    byteLength: files.reduce(
      (total, file) =>
        total +
        (file.encoding === 'base64'
          ? Buffer.from(file.content, 'base64').byteLength
          : Buffer.byteLength(file.content, 'utf8')),
      0,
    ),
    removedPaths: [...new Set([...sanitized.removedPaths, ...isolatedPaths])].sort(),
    redactedValueCount: sanitized.redactedValueCount,
    validationChecks: [
      'safe-paths',
      'javascript-typescript-only',
      'secret-values-redacted',
      'secret-files-excluded',
      'runtime-data-excluded',
      'dependency-locks-regenerated',
    ],
  };
}

export function hashGalleryRequest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
