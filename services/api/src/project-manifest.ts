import { createHash } from 'node:crypto';
import { z } from 'zod';
import { appPublicEnglish } from './app-public-copy.js';
import { parseCron } from './scheduled-tasks-cron.js';

export const PROJECT_MANIFEST_SCHEMA_VERSION = 1 as const;
export const PROJECT_MANIFEST_MAX_ARTIFACTS = 7;
export const PROJECT_MANIFEST_MAX_BYTES = 64 * 1024;
export const PROJECT_MANIFEST_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const PROJECT_MANIFEST_ISSUES = {
  scheduleRequired: 'schedule-required',
  scheduleNotAllowed: 'schedule-not-allowed',
  duplicateArtifactId: 'duplicate-artifact-id',
  duplicateSourceRoot: 'duplicate-source-root',
  duplicateComponentId: 'duplicate-component-id',
  mobileArtifactLimit: 'mobile-artifact-limit',
  duplicateBindingId: 'duplicate-binding-id',
  duplicateComponentReference: 'duplicate-component-reference',
  unknownComponentReference: 'unknown-component-reference',
  duplicateScope: 'duplicate-scope',
} as const;

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);

const projectReference = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u);

const relativePath = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => {
    if (value === '.') {
      return true;
    }

    if (value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:/u.test(value)) {
      return false;
    }

    return value.split('/').every((segment) => Boolean(segment) && segment !== '.' && segment !== '..');
  }, 'relative-path');

const command = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !value.includes('\0'), 'command');

export const projectManifestArtifactKinds = [
  'WEB_APP',
  'MOBILE_APP',
  'DATA_VISUALIZATION',
  'SLIDE_DECK',
  'ANIMATION_VIDEO',
  'DESIGN',
  'EXPERIENCE_3D',
] as const;

export const projectManifestComponentKinds = [
  'WEB_FRONTEND',
  'API',
  'SERVICE',
  'WORKER',
  'JOB',
  'SHARED_PACKAGE',
  'STATIC_SITE_COMPONENT',
] as const;

export const projectManifestDeploymentTypes = ['AUTOSCALE', 'STATIC', 'RESERVED_VM', 'SCHEDULED'] as const;

const componentSchema = z
  .object({
    componentId: identifier,
    kind: z.enum(projectManifestComponentKinds),
  })
  .strict();

const previewConfigSchema = z
  .object({
    command: command.optional(),
    port: z.number().int().min(1).max(65_535).optional(),
    healthPath: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^\/(?!\/)/u)
      .optional(),
  })
  .strict();

const publishConfigSchema = z
  .object({
    deploymentType: z.enum(projectManifestDeploymentTypes),
    buildCommand: command.optional(),
    outputDirectory: relativePath.optional(),
    runCommand: command.optional(),
    schedule: z
      .string()
      .trim()
      .min(9)
      .max(120)
      .refine((value) => parseCron(value).valid, 'invalid-schedule')
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.deploymentType === 'SCHEDULED' && !value.schedule) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schedule'],
        message: PROJECT_MANIFEST_ISSUES.scheduleRequired,
      });
    }

    if (value.deploymentType !== 'SCHEDULED' && value.schedule) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schedule'],
        message: PROJECT_MANIFEST_ISSUES.scheduleNotAllowed,
      });
    }
  });

const artifactSchema = z
  .object({
    artifactId: identifier,
    kind: z.enum(projectManifestArtifactKinds),
    sourceRoot: relativePath,
    components: z.array(componentSchema).max(64).optional(),
    previewConfig: previewConfigSchema.optional(),
    publishConfig: publishConfigSchema.optional(),
  })
  .strict();

const backendBindingSchema = z
  .object({
    bindingId: identifier,
    componentIds: z.array(identifier).min(1).max(64),
  })
  .strict();

const dataBindingSchema = z
  .object({
    bindingId: identifier,
    resourceRef: projectReference,
    access: z.enum(['READ_ONLY', 'READ_WRITE']),
    componentIds: z.array(identifier).min(1).max(64),
  })
  .strict();

const storageBindingSchema = z
  .object({
    bindingId: identifier,
    resourceRef: projectReference,
    access: z.enum(['READ_ONLY', 'READ_WRITE']),
    componentIds: z.array(identifier).min(1).max(64),
  })
  .strict();

const deploymentScopeSchema = z
  .string()
  .trim()
  .min(3)
  .max(128)
  .regex(/^[a-z][a-z0-9._-]*:[a-z0-9*][a-z0-9*._/-]*$/u);

export const projectManifestSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_MANIFEST_SCHEMA_VERSION),
    manifestVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    projectId: identifier,
    artifacts: z.array(artifactSchema).min(1).max(PROJECT_MANIFEST_MAX_ARTIFACTS),
    sharedBackendBinding: backendBindingSchema.optional(),
    sharedDataBindings: z.array(dataBindingSchema).max(64).optional(),
    sharedStorageBindings: z.array(storageBindingSchema).max(64).optional(),
    scopes: z.array(deploymentScopeSchema).max(128).optional(),
    entitlementsRef: projectReference.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const artifactIds = new Set<string>();
    const sourceRoots = new Set<string>();
    const componentIds = new Set<string>();

    let mobileArtifacts = 0;

    manifest.artifacts.forEach((artifact, artifactIndex) => {
      if (artifactIds.has(artifact.artifactId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['artifacts', artifactIndex, 'artifactId'],
          message: PROJECT_MANIFEST_ISSUES.duplicateArtifactId,
        });
      }

      artifactIds.add(artifact.artifactId);

      if (sourceRoots.has(artifact.sourceRoot)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['artifacts', artifactIndex, 'sourceRoot'],
          message: PROJECT_MANIFEST_ISSUES.duplicateSourceRoot,
        });
      }

      sourceRoots.add(artifact.sourceRoot);

      if (artifact.kind === 'MOBILE_APP') {
        mobileArtifacts += 1;
      }

      artifact.components?.forEach((component, componentIndex) => {
        if (componentIds.has(component.componentId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['artifacts', artifactIndex, 'components', componentIndex, 'componentId'],
            message: PROJECT_MANIFEST_ISSUES.duplicateComponentId,
          });
        }

        componentIds.add(component.componentId);
      });
    });

    if (mobileArtifacts > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['artifacts'],
        message: PROJECT_MANIFEST_ISSUES.mobileArtifactLimit,
      });
    }

    const bindingIds = new Set<string>();

    const bindings = [
      ...(manifest.sharedBackendBinding ? [manifest.sharedBackendBinding] : []),
      ...(manifest.sharedDataBindings ?? []),
      ...(manifest.sharedStorageBindings ?? []),
    ];

    for (const [bindingIndex, binding] of bindings.entries()) {
      if (bindingIds.has(binding.bindingId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bindings', bindingIndex, 'bindingId'],
          message: PROJECT_MANIFEST_ISSUES.duplicateBindingId,
        });
      }

      bindingIds.add(binding.bindingId);

      const referenced = new Set<string>();
      binding.componentIds.forEach((componentId, componentIndex) => {
        if (referenced.has(componentId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['bindings', bindingIndex, 'componentIds', componentIndex],
            message: PROJECT_MANIFEST_ISSUES.duplicateComponentReference,
          });
        } else if (!componentIds.has(componentId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['bindings', bindingIndex, 'componentIds', componentIndex],
            message: PROJECT_MANIFEST_ISSUES.unknownComponentReference,
          });
        }

        referenced.add(componentId);
      });
    }

    const scopes = manifest.scopes ?? [];

    if (new Set(scopes).size !== scopes.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scopes'],
        message: PROJECT_MANIFEST_ISSUES.duplicateScope,
      });
    }
  });

export type ProjectManifest = z.infer<typeof projectManifestSchema>;

export type ProjectManifestIssue = Readonly<{
  path: string;
  code: string;
}>;

export class ProjectManifestError extends Error {
  readonly issues: readonly ProjectManifestIssue[];
  readonly code: string;
  readonly statusCode: number;
  readonly publicMessage: string;

  constructor(input: {
    code: string;
    statusCode: number;
    publicMessage: string;
    issues?: readonly ProjectManifestIssue[];
  }) {
    super(input.publicMessage);
    this.name = 'ProjectManifestError';
    this.code = input.code;
    this.statusCode = input.statusCode;
    this.publicMessage = input.publicMessage;
    this.issues = input.issues ?? [];
  }
}

function serializedSize(input: unknown): number {
  try {
    const serialized = JSON.stringify(input);
    return typeof serialized === 'string' ? Buffer.byteLength(serialized, 'utf8') : 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function issueCode(issue: z.ZodIssue): string {
  return issue.code === z.ZodIssueCode.custom ? issue.message : issue.code;
}

function validationError(error: z.ZodError): ProjectManifestError {
  return new ProjectManifestError({
    code: 'PROJECT_MANIFEST_INVALID',
    statusCode: 400,
    publicMessage: appPublicEnglish('PROJECT_MANIFEST_INVALID'),
    issues: error.issues.slice(0, 50).map((issue) => ({
      path: issue.path.join('.'),
      code: issueCode(issue),
    })),
  });
}

export function parseProjectManifest(input: unknown): ProjectManifest {
  if (serializedSize(input) > PROJECT_MANIFEST_MAX_BYTES) {
    throw new ProjectManifestError({
      code: 'PROJECT_MANIFEST_TOO_LARGE',
      statusCode: 413,
      publicMessage: appPublicEnglish('PROJECT_MANIFEST_TOO_LARGE'),
    });
  }

  if (input && typeof input === 'object' && !Array.isArray(input) && 'schemaVersion' in input) {
    const schemaVersion = (input as Record<string, unknown>).schemaVersion;

    if (schemaVersion !== PROJECT_MANIFEST_SCHEMA_VERSION) {
      throw new ProjectManifestError({
        code: 'PROJECT_MANIFEST_SCHEMA_UNSUPPORTED',
        statusCode: 422,
        publicMessage: appPublicEnglish('PROJECT_MANIFEST_SCHEMA_UNSUPPORTED', {
          version: typeof schemaVersion === 'number' && Number.isSafeInteger(schemaVersion) ? schemaVersion : '?',
        }),
      });
    }
  }

  const parsed = projectManifestSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError(parsed.error);
  }

  return parsed.data;
}

function sortBy<T>(values: readonly T[] | undefined, selector: (value: T) => string): T[] | undefined {
  return values
    ? [...values].sort((left, right) => {
        const leftKey = selector(left);
        const rightKey = selector(right);

        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      })
    : undefined;
}

/**
 * Canonical ordering makes the digest independent of JSON key insertion order and
 * of relation-set ordering. Commands and paths are not rewritten: their bytes are
 * semantically meaningful and validation already removed unsafe variants.
 */
export function canonicalizeProjectManifest(input: unknown): ProjectManifest {
  const manifest = parseProjectManifest(input);

  return {
    schemaVersion: manifest.schemaVersion,
    manifestVersion: manifest.manifestVersion,
    projectId: manifest.projectId,
    artifacts: sortBy(manifest.artifacts, (artifact) => artifact.artifactId)!.map((artifact) => ({
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      sourceRoot: artifact.sourceRoot,
      ...(artifact.components ? { components: sortBy(artifact.components, (component) => component.componentId) } : {}),
      ...(artifact.previewConfig ? { previewConfig: artifact.previewConfig } : {}),
      ...(artifact.publishConfig ? { publishConfig: artifact.publishConfig } : {}),
    })),
    ...(manifest.sharedBackendBinding
      ? {
          sharedBackendBinding: {
            ...manifest.sharedBackendBinding,
            componentIds: [...manifest.sharedBackendBinding.componentIds].sort(),
          },
        }
      : {}),
    ...(manifest.sharedDataBindings
      ? {
          sharedDataBindings: sortBy(manifest.sharedDataBindings, (binding) => binding.bindingId)!.map((binding) => ({
            ...binding,
            componentIds: [...binding.componentIds].sort(),
          })),
        }
      : {}),
    ...(manifest.sharedStorageBindings
      ? {
          sharedStorageBindings: sortBy(manifest.sharedStorageBindings, (binding) => binding.bindingId)!.map(
            (binding) => ({ ...binding, componentIds: [...binding.componentIds].sort() }),
          ),
        }
      : {}),
    ...(manifest.scopes ? { scopes: [...manifest.scopes].sort() } : {}),
    ...(manifest.entitlementsRef ? { entitlementsRef: manifest.entitlementsRef } : {}),
  };
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, stableJsonValue(child)]),
    );
  }

  return value;
}

export function serializeProjectManifest(input: unknown): string {
  return `${JSON.stringify(stableJsonValue(canonicalizeProjectManifest(input)))}\n`;
}

export function projectManifestDigest(input: unknown): string {
  return `sha256:${createHash('sha256').update(serializeProjectManifest(input), 'utf8').digest('hex')}`;
}

export function createDefaultProjectManifest(projectId: string): ProjectManifest {
  return canonicalizeProjectManifest({
    schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
    manifestVersion: 1,
    projectId,
    artifacts: [
      {
        artifactId: 'app',
        kind: 'WEB_APP',
        sourceRoot: '.',
        components: [],
      },
    ],
    scopes: [],
  });
}

export type ProjectManifestCloneMode = 'COPY' | 'DETACH_EXTERNALS';

/**
 * Rebind a validated source manifest to a fresh project/version. Secure remix
 * flows detach tenant-bound resource references; a regular same-tenant
 * duplicate preserves them. Scopes remain declarations of what the cloned code
 * needs, never credentials or an authorization grant.
 */
export function projectManifestForClone(
  input: unknown,
  targetProjectId: string,
  mode: ProjectManifestCloneMode = 'COPY',
): ProjectManifest {
  const source = canonicalizeProjectManifest(input);

  const clone = {
    ...source,
    projectId: targetProjectId,
    manifestVersion: 1,
  };

  if (mode === 'DETACH_EXTERNALS') {
    delete clone.sharedBackendBinding;
    delete clone.sharedDataBindings;
    delete clone.sharedStorageBindings;
    delete clone.entitlementsRef;
  }

  return canonicalizeProjectManifest(clone);
}

export function verifyStoredProjectManifestRevision(
  record: {
    projectId: string;
    schemaVersion: number;
    manifestVersion: number;
    digest: string;
    manifest: unknown;
  },
  expectedProjectId: string,
): ProjectManifest {
  try {
    const manifest = canonicalizeProjectManifest(record.manifest);

    const valid =
      record.projectId === expectedProjectId &&
      manifest.projectId === expectedProjectId &&
      record.schemaVersion === manifest.schemaVersion &&
      record.manifestVersion === manifest.manifestVersion &&
      PROJECT_MANIFEST_DIGEST_PATTERN.test(record.digest) &&
      projectManifestDigest(manifest) === record.digest;

    if (valid) {
      return manifest;
    }
  } catch {
    // Collapse stored validation detail into the integrity-safe public error below.
  }

  throw new ProjectManifestError({
    code: 'PROJECT_MANIFEST_CORRUPTED',
    statusCode: 500,
    publicMessage: appPublicEnglish('PROJECT_MANIFEST_CORRUPTED'),
  });
}

export type ProjectManifestSnapshotPin = {
  schemaVersion: number;
  manifestVersion: number;
  digest: string;
  manifest: ProjectManifest;
};

/**
 * Embed a self-verifying manifest revision in an immutable ProjectSnapshot.
 * Keeping the canonical document (not only its digest) lets a later remix
 * reproduce the exact topology even if the live source advances meanwhile.
 */
export function projectManifestSnapshotPin(
  record: {
    projectId: string;
    schemaVersion: number;
    manifestVersion: number;
    digest: string;
    manifest: unknown;
  },
  expectedProjectId: string,
): ProjectManifestSnapshotPin {
  const manifest = verifyStoredProjectManifestRevision(record, expectedProjectId);
  return {
    schemaVersion: manifest.schemaVersion,
    manifestVersion: manifest.manifestVersion,
    digest: record.digest,
    manifest,
  };
}

/** Fail closed for legacy/corrupt snapshots: never substitute the live latest. */
export function readProjectManifestSnapshotPin(
  snapshotManifest: unknown,
  expectedProjectId: string,
): ProjectManifestSnapshotPin {
  if (!snapshotManifest || typeof snapshotManifest !== 'object' || Array.isArray(snapshotManifest)) {
    throw new ProjectManifestError({
      code: 'PROJECT_MANIFEST_SNAPSHOT_UNPINNED',
      statusCode: 409,
      publicMessage: appPublicEnglish('PROJECT_MANIFEST_SNAPSHOT_UNPINNED'),
    });
  }

  const pin = (snapshotManifest as Record<string, unknown>).projectManifest;
  if (!pin || typeof pin !== 'object' || Array.isArray(pin)) {
    throw new ProjectManifestError({
      code: 'PROJECT_MANIFEST_SNAPSHOT_UNPINNED',
      statusCode: 409,
      publicMessage: appPublicEnglish('PROJECT_MANIFEST_SNAPSHOT_UNPINNED'),
    });
  }

  try {
    const record = pin as Record<string, unknown>;
    const manifest = verifyStoredProjectManifestRevision(
      {
        projectId: expectedProjectId,
        schemaVersion: record.schemaVersion as number,
        manifestVersion: record.manifestVersion as number,
        digest: record.digest as string,
        manifest: record.manifest,
      },
      expectedProjectId,
    );
    return {
      schemaVersion: manifest.schemaVersion,
      manifestVersion: manifest.manifestVersion,
      digest: record.digest as string,
      manifest,
    };
  } catch (error) {
    if (error instanceof ProjectManifestError && error.code === 'PROJECT_MANIFEST_SNAPSHOT_UNPINNED') throw error;
    throw new ProjectManifestError({
      code: 'PROJECT_MANIFEST_SNAPSHOT_CORRUPTED',
      statusCode: 409,
      publicMessage: appPublicEnglish('PROJECT_MANIFEST_SNAPSHOT_CORRUPTED'),
    });
  }
}
