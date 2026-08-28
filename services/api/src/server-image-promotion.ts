import { z } from 'zod';

import { promoteArtifact, type PromotionResult, type RegistryAdapter, type RegistryRef } from './artifact-promotion.js';
import {
  ArtifactRegistryError,
  ArtifactRegistryOciAdapter,
  assertSha256Digest,
  parseArtifactRegistryImageRepository,
  parseArtifactRegistryRepositoryBase,
  type ArtifactRegistryRepositoryBase,
} from './artifact-registry-adapter.js';
import {
  BinaryAuthorizationClient,
  validateBinaryAuthorizationPolicy,
  type BinaryAuthorizationPolicy,
} from './binary-authorization-client.js';
import { releaseMayBeCut, type PromotionManifest } from './lifecycle-state-machines.js';

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{3,127}$/u;
export const SERVER_IMAGE_RELEASE_AUDIT_ACTION = 'deployment.server_image_release_committed';

const tenantSchema = z
  .object({
    targetRepository: z.string().min(1).max(512),
    binaryAuthorizationPolicy: z.string().min(1).max(512),
    binaryAuthorizationPolicyEtag: z.string().regex(/^[A-Za-z0-9+/_=-]{8,256}$/u),
    namespace: z.string().min(1).max(253).optional(),
    serviceAccount: z.string().min(1).max(253).optional(),
  })
  .strict();

const configSchema = z
  .object({
    sourceRepository: z.string().min(1).max(512),
    tenants: z.record(z.string(), tenantSchema),
  })
  .strict();

export interface TenantPromotionConfig {
  targetRepository: ArtifactRegistryRepositoryBase;
  binaryAuthorizationPolicy: BinaryAuthorizationPolicy;
}

export interface ArtifactPromotionConfig {
  sourceRepository: ArtifactRegistryRepositoryBase;
  tenants: ReadonlyMap<string, TenantPromotionConfig>;
}

export class ServerImagePromotionError extends Error {
  readonly statusCode = 503;

  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ServerImagePromotionError';
  }
}

export function parseArtifactPromotionConfig(raw: string | undefined): ArtifactPromotionConfig {
  if (!raw?.trim()) {
    throw new ServerImagePromotionError(
      'PROMOTION_CONFIG_MISSING',
      'Server-image artifact promotion is not configured.',
    );
  }

  let decoded: unknown;

  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    throw new ServerImagePromotionError('PROMOTION_CONFIG_INVALID', 'Artifact promotion configuration is invalid.', {
      cause: error,
    });
  }

  const parsed = configSchema.safeParse(decoded);

  if (!parsed.success || Object.keys(parsed.data?.tenants ?? {}).length === 0) {
    throw new ServerImagePromotionError('PROMOTION_CONFIG_INVALID', 'Artifact promotion configuration is invalid.');
  }

  try {
    const sourceRepository = parseArtifactRegistryRepositoryBase(parsed.data.sourceRepository);
    const tenants = new Map<string, TenantPromotionConfig>();
    const repositoryOwners = new Map<string, string>();

    for (const [organizationId, tenant] of Object.entries(parsed.data.tenants)) {
      if (!IDENTIFIER_RE.test(organizationId)) {
        throw new ServerImagePromotionError(
          'PROMOTION_CONFIG_INVALID',
          'Artifact promotion contains an invalid organization id.',
        );
      }

      const targetRepository = parseArtifactRegistryRepositoryBase(tenant.targetRepository);

      if (targetRepository.original === sourceRepository.original) {
        throw new ServerImagePromotionError(
          'PROMOTION_TARGET_NOT_ISOLATED',
          'Artifact promotion target must be distinct from the build repository.',
        );
      }

      const priorOwner = repositoryOwners.get(targetRepository.original);

      if (priorOwner && priorOwner !== organizationId) {
        throw new ServerImagePromotionError(
          'PROMOTION_TARGET_NOT_ISOLATED',
          'An Artifact Registry target repository cannot be shared by organizations.',
        );
      }

      repositoryOwners.set(targetRepository.original, organizationId);
      tenants.set(organizationId, {
        targetRepository,
        binaryAuthorizationPolicy: validateBinaryAuthorizationPolicy({
          resourceName: tenant.binaryAuthorizationPolicy,
          etag: tenant.binaryAuthorizationPolicyEtag,
          ...(tenant.namespace ? { namespace: tenant.namespace } : {}),
          ...(tenant.serviceAccount ? { serviceAccount: tenant.serviceAccount } : {}),
        }),
      });
    }

    return { sourceRepository, tenants };
  } catch (error) {
    if (error instanceof ServerImagePromotionError) {
      throw error;
    }

    const code = error instanceof ArtifactRegistryError ? error.code : 'PROMOTION_CONFIG_INVALID';
    throw new ServerImagePromotionError(code, 'Artifact promotion configuration is invalid.', { cause: error });
  }
}

export interface ServerImagePromotionInput {
  organizationId: string;
  projectId: string;
  source: RegistryRef;
  /** Durable registry fence; a lost owner must stop between provider calls. */
  signal?: AbortSignal;
}

export interface ServerImagePromotionRuntime {
  /** Exact packages mutated by promote; production uses this for session fences. */
  packageRepositories(input: ServerImagePromotionInput): readonly string[];
  promote(input: ServerImagePromotionInput): Promise<PromotionResult>;
}

export class LiveServerImagePromotionRuntime implements ServerImagePromotionRuntime {
  constructor(
    private readonly _config: ArtifactPromotionConfig,
    private readonly _adapter: RegistryAdapter = new ArtifactRegistryOciAdapter(),
    private readonly _binaryAuthorization: BinaryAuthorizationClient = new BinaryAuthorizationClient(),
  ) {}

  packageRepositories(input: ServerImagePromotionInput): readonly string[] {
    const tenant = this._config.tenants.get(input.organizationId);
    if (!tenant || !IDENTIFIER_RE.test(input.projectId)) {
      throw new ServerImagePromotionError(
        !tenant ? 'PROMOTION_TENANT_UNCONFIGURED' : 'PROMOTION_PROJECT_INVALID',
        'Artifact promotion package authority is unavailable.',
      );
    }
    const packageName = `p-${input.projectId.toLowerCase()}`;
    const source = `${this._config.sourceRepository.original}/${packageName}`;
    const target = `${tenant.targetRepository.original}/${packageName}`;
    if (input.source.repo !== source) {
      throw new ServerImagePromotionError(
        'PROMOTION_SOURCE_SCOPE_MISMATCH',
        'Built image does not belong to the configured project repository.',
      );
    }
    return [source, target];
  }

  async promote(input: ServerImagePromotionInput): Promise<PromotionResult> {
    input.signal?.throwIfAborted();
    const tenant = this._config.tenants.get(input.organizationId);

    if (!tenant) {
      throw new ServerImagePromotionError(
        'PROMOTION_TENANT_UNCONFIGURED',
        'No isolated artifact repository is configured for this organization.',
      );
    }

    if (!IDENTIFIER_RE.test(input.projectId)) {
      throw new ServerImagePromotionError('PROMOTION_PROJECT_INVALID', 'Project id cannot form an OCI package path.');
    }

    const packageName = `p-${input.projectId.toLowerCase()}`;
    const expectedSource = `${this._config.sourceRepository.original}/${packageName}`;

    /*
     * Both the build repository and the package suffix are platform-owned. A
     * caller can never promote another project's image into its tenant repo.
     */
    if (input.source.repo !== expectedSource) {
      throw new ServerImagePromotionError(
        'PROMOTION_SOURCE_SCOPE_MISMATCH',
        'Built image does not belong to the configured project repository.',
      );
    }

    parseArtifactRegistryImageRepository(input.source.repo);
    assertSha256Digest(input.source.digest);

    const targetRepo = `${tenant.targetRepository.original}/${packageName}`;
    parseArtifactRegistryImageRepository(targetRepo);

    const result = await promoteArtifact({
      source: input.source,
      targetRepo,
      targetTenant: input.organizationId,
      adapter: this._adapter,
      ...(input.signal ? { signal: input.signal } : {}),
      binaryAuthorization: async () => {
        input.signal?.throwIfAborted();
        const evaluatedImage = `${targetRepo}@${input.source.digest}`;

        const evaluation = await this._binaryAuthorization.evaluate(tenant.binaryAuthorizationPolicy, {
          repo: targetRepo,
          digest: input.source.digest,
        });
        input.signal?.throwIfAborted();

        return {
          admitted: evaluation.admitted,
          policy: tenant.binaryAuthorizationPolicy.resourceName,
          policyEtag: evaluation.policyEtag,
          evaluatedImage,
          evaluatedAt: new Date().toISOString(),
        };
      },
    });
    input.signal?.throwIfAborted();

    const releaseGate = releaseMayBeCut(result.manifest);

    if (!releaseGate.allowed) {
      throw new ServerImagePromotionError(
        'PROMOTION_NOT_COMMITTED',
        releaseGate.reason ?? 'Artifact promotion did not commit.',
      );
    }

    return result;
  }
}

export function createLiveServerImagePromotionRuntimeFromEnv(): ServerImagePromotionRuntime {
  return new LiveServerImagePromotionRuntime(parseArtifactPromotionConfig(process.env.ARTIFACT_PROMOTION_CONFIG_JSON));
}

export function isCommittedPromotionForTenant(
  value: unknown,
  organizationId: string,
  imageDigest: string,
  imageRepo: string,
): value is PromotionManifest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const promotion = value as Partial<PromotionManifest>;

  if (
    promotion.state !== 'PROMOTION_COMMITTED' ||
    promotion.binaryAuthorizationResult !== 'PASSED' ||
    !/^projects\/[a-z][a-z0-9-]{4,61}[a-z0-9]\/platforms\/gke\/policies\/[a-z][a-z0-9-]{0,61}[a-z0-9]$/u.test(
      promotion.binaryAuthorizationPolicy ?? '',
    ) ||
    promotion.binaryAuthorizationEvaluatedImage !== `${imageRepo}@${imageDigest}` ||
    typeof promotion.binaryAuthorizationEvaluatedAt !== 'string' ||
    promotion.targetTenant !== organizationId ||
    promotion.sourceDigest !== imageDigest ||
    promotion.targetRepo !== imageRepo ||
    !Array.isArray(promotion.attachments)
  ) {
    return false;
  }

  const required = new Set(['signature', 'sbom', 'provenance']);

  for (const attachment of promotion.attachments) {
    if (
      attachment &&
      attachment.relinked === true &&
      attachment.subjectDigest === imageDigest &&
      typeof attachment.type === 'string'
    ) {
      required.delete(attachment.type);
    }
  }

  return required.size === 0 && releaseMayBeCut(promotion as PromotionManifest).allowed;
}
