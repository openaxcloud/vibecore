import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  emptyBodySchema,
  galleryAppCreateSchema,
  galleryAppParamsSchema,
  galleryAppUpdateSchema,
  galleryListQuerySchema,
  galleryModerationListQuerySchema,
  galleryModerationSchema,
  galleryRemixSchema,
  galleryReportListQuerySchema,
  galleryReportParamsSchema,
  galleryReportResolutionSchema,
  galleryReportSchema,
  gallerySlugParamsSchema,
  galleryTenantListQuerySchema,
  hashGalleryRequest,
  organizationParamsSchema,
  parseGalleryIdempotencyKey,
  parseGalleryInput,
  prepareGallerySnapshot,
  ProjectGalleryValidationError,
  tenantGalleryAppParamsSchema,
  type GalleryArtifactType,
  type GalleryAppCreateInput,
  type GalleryDataRequirement,
  type GalleryRuntimeConfiguration,
  type GallerySnapshotFile,
  type GallerySourceSnapshot,
  type GalleryVisibility,
} from './project-gallery-validation.js';

export type GalleryAppStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
export type GalleryModerationStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type GalleryPreviewStatus = 'PENDING' | 'VERIFIED' | 'FAILED';
export type GalleryReportStatus = 'OPEN' | 'DISMISSED' | 'ACTIONED';
export type GalleryRemixStatus = 'CREATING' | 'READY' | 'FAILED';
export type GalleryOrganizationPermission = 'projects:read' | 'projects:write';

export interface GalleryPrincipal {
  userId: string;
}

export interface GalleryPublicAuthor {
  handle: string;
  displayName: string;
  avatarUrl?: string;
}

export interface GalleryProvenance {
  sourceGalleryAppId: string;
  sourceGalleryAppSlug: string;
}

export interface GalleryAppRecord {
  id: string;
  slug: string;
  sourceProjectId?: string;
  organizationId: string;
  authorUserId: string;
  author: GalleryPublicAuthor;
  name: string;
  description: string;
  artifactType: GalleryArtifactType;
  category: string;
  technologies: string[];
  tags: string[];
  thumbnailUrl: string;
  visibility: GalleryVisibility;
  status: GalleryAppStatus;
  moderationStatus: GalleryModerationStatus;
  moderationReason?: string;
  allowRemix: boolean;
  featured: boolean;
  remixCount: number;
  reportCount: number;
  previewStatus: GalleryPreviewStatus;
  previewUrl?: string;
  latestVersionId: string;
  provenance?: GalleryProvenance;
  submittedAt?: string;
  publishedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GalleryAppVersionRecord {
  id: string;
  galleryAppId: string;
  version: number;
  files: GallerySnapshotFile[];
  runtime: GalleryRuntimeConfiguration;
  dataRequirements: GalleryDataRequirement[];
  contentHash: string;
  byteLength: number;
  removedPaths: string[];
  redactedValueCount: number;
  validationChecks: string[];
  createdByUserId: string;
  createdAt: string;
}

export interface GalleryPreviewEvidence {
  previewUrl: string;
  checkedAt: string;
  httpStatus: number;
  rendered: boolean;
  marker?: string;
  checkedAssetCount?: number;
  checkedAssetBytes?: number;
  documentBytes?: number;
}

export interface GalleryAppPage {
  apps: GalleryAppRecord[];
  /** Store-only resume cursor aligned one-to-one with `apps`; public routes omit it. */
  itemCursors?: string[];
  nextCursor?: string;
}

export interface GalleryFacets {
  artifactTypes: GalleryArtifactType[];
  categories: string[];
  technologies: string[];
}

export interface GalleryPublishedAppPage extends GalleryAppPage {
  /** Global public Gallery taxonomy, deliberately independent of page and active filters. */
  facets: GalleryFacets;
}

function uniqueGalleryFacetValues<T extends string>(values: readonly T[]): T[] {
  const byNormalizedValue = new Map<string, T>();

  for (const value of values) {
    const trimmed = value.trim() as T;
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase('en-US');
    if (!byNormalizedValue.has(key)) byNormalizedValue.set(key, trimmed);
  }

  return [...byNormalizedValue.values()].sort(
    (left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }) || left.localeCompare(right, 'en'),
  );
}

export function galleryFacetsFromApps(
  apps: readonly Pick<GalleryAppRecord, 'artifactType' | 'category' | 'technologies'>[],
): GalleryFacets {
  return {
    artifactTypes: uniqueGalleryFacetValues(apps.map((app) => app.artifactType)),
    categories: uniqueGalleryFacetValues(apps.map((app) => app.category)),
    technologies: uniqueGalleryFacetValues(apps.flatMap((app) => app.technologies)),
  };
}

export function mergeGalleryFacets(...facets: readonly GalleryFacets[]): GalleryFacets {
  return {
    artifactTypes: uniqueGalleryFacetValues(facets.flatMap((value) => value.artifactTypes)),
    categories: uniqueGalleryFacetValues(facets.flatMap((value) => value.categories)),
    technologies: uniqueGalleryFacetValues(facets.flatMap((value) => value.technologies)),
  };
}

export interface GalleryReportRecord {
  id: string;
  galleryAppId: string;
  reporterUserId: string;
  reason: 'COPYRIGHT' | 'DECEPTIVE' | 'HARMFUL' | 'INAPPROPRIATE' | 'MALWARE' | 'PRIVACY' | 'SPAM' | 'OTHER';
  details?: string;
  status: GalleryReportStatus;
  resolutionNote?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GalleryReportPage {
  reports: GalleryReportRecord[];
  nextCursor?: string;
}

export interface GalleryRemixRecord {
  id: string;
  galleryAppId: string;
  galleryAppVersionId: string;
  sourceProjectId?: string;
  destinationOrganizationId: string;
  destinationOwnerUserId: string;
  destinationProjectId?: string;
  destinationRepositoryId?: string;
  destinationWorkspaceId?: string;
  agentAnalysisId?: string;
  idempotencyKey: string;
  requestHash: string;
  status: GalleryRemixStatus;
  errorCode?: string;
  completedAt?: string;
  failedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Persistence-domain names used by the Prisma integration. */
export type GalleryApp = GalleryAppRecord;
export type GalleryAppVersion = GalleryAppVersionRecord;
export type ProjectRemix = GalleryRemixRecord;

export interface GalleryAuditContext {
  actorUserId: string;
  requestId: string;
  ip?: string;
  userAgent?: string;
}

export interface GalleryProjectReference {
  id: string;
  organizationId: string;
  deletedAt?: string;
  provenance?: GalleryProvenance;
}

export interface ProjectGalleryStore {
  /** All mutation methods persist their audit context in the same transaction as the state change. */
  getGalleryApp(appId: string): Promise<GalleryAppRecord | undefined>;
  getGalleryAppBySlug(slug: string): Promise<GalleryAppRecord | undefined>;
  getGalleryAppVersion(versionId: string): Promise<GalleryAppVersionRecord | undefined>;
  /**
   * Resolves a READY remix's immutable Gallery origin for a destination
   * project. Code-owned demo apps are resolved from the durable remix
   * activity written when the saga completes.
   */
  getGalleryProjectProvenance(projectId: string): Promise<GalleryProvenance | undefined>;
  listPublishedGalleryApps(input: {
    query?: string;
    category?: string;
    artifactType?: GalleryArtifactType;
    technology?: string;
    featured?: boolean;
    sort: 'FEATURED' | 'MOST_REMIXED' | 'RECENT' | 'NAME';
    cursor?: string;
    limit: number;
  }): Promise<GalleryAppPage>;
  /** Reads taxonomy from every currently public, approved and preview-verified publication. */
  listPublishedGalleryFacets(): Promise<GalleryFacets>;
  getGalleryEngagementCounts(
    appIds: string[],
  ): Promise<Array<{ galleryAppId: string; completedRemixCount: number; reportCount: number }>>;
  listOrganizationGalleryApps(input: {
    organizationId: string;
    status?: GalleryAppStatus;
    cursor?: string;
    limit: number;
  }): Promise<GalleryAppPage>;

  /** Atomically creates the GalleryApp, immutable v1 snapshot and audit event. */
  createGalleryApp(input: {
    sourceProjectId: string;
    organizationId: string;
    authorUserId: string;
    slug?: string;
    name: string;
    description: string;
    artifactType: GalleryArtifactType;
    category: string;
    technologies: string[];
    tags: string[];
    thumbnailUrl: string;
    visibility: GalleryVisibility;
    allowRemix: boolean;
    provenance?: GalleryProvenance;
    initialVersion: Omit<GalleryAppVersionRecord, 'id' | 'galleryAppId' | 'version' | 'createdAt'>;
    audit: GalleryAuditContext;
  }): Promise<{ app: GalleryAppRecord; version: GalleryAppVersionRecord }>;
  /**
   * Conditionally creates the next immutable version and advances the app in
   * one transaction. Only DRAFT/REJECTED apps may be resnapshotted.
   */
  createGalleryAppVersion(input: {
    appId: string;
    organizationId: string;
    createdByUserId: string;
    snapshot: Omit<GalleryAppVersionRecord, 'id' | 'galleryAppId' | 'version' | 'createdAt' | 'createdByUserId'>;
    audit: GalleryAuditContext;
  }): Promise<{ app: GalleryAppRecord; version: GalleryAppVersionRecord }>;
  updateGalleryApp(input: {
    appId: string;
    organizationId: string;
    patch: {
      name?: string;
      description?: string;
      artifactType?: GalleryArtifactType;
      category?: string;
      technologies?: string[];
      tags?: string[];
      thumbnailUrl?: string;
      visibility?: GalleryVisibility;
      allowRemix?: boolean;
    };
    audit: GalleryAuditContext;
  }): Promise<GalleryAppRecord>;

  /** Conditional DRAFT/REJECTED -> PENDING_REVIEW transition; version and preview evidence are immutable. */
  submitGalleryApp(input: {
    appId: string;
    organizationId: string;
    versionId: string;
    preview: GalleryPreviewEvidence;
    audit: GalleryAuditContext;
  }): Promise<GalleryAppRecord>;
  listGalleryModerationQueue(input: { cursor?: string; limit: number }): Promise<GalleryAppPage>;
  moderateGalleryApp(input: {
    appId: string;
    action: 'APPROVE' | 'REJECT' | 'ARCHIVE' | 'FEATURE' | 'UNFEATURE';
    reason?: string;
    functionalPreviewConfirmed?: true;
    audit: GalleryAuditContext;
  }): Promise<GalleryAppRecord>;

  /** Deduplicates an open report per (app key, reporter) and increments reportCount atomically. */
  createGalleryReport(input: {
    galleryAppId: string;
    reporterUserId: string;
    reason: GalleryReportRecord['reason'];
    details?: string;
    audit: GalleryAuditContext;
  }): Promise<{ report: GalleryReportRecord; created: boolean }>;
  listGalleryReports(input: {
    status: GalleryReportStatus;
    cursor?: string;
    limit: number;
  }): Promise<GalleryReportPage>;
  getGalleryReport(reportId: string): Promise<GalleryReportRecord | undefined>;
  resolveGalleryReport(input: {
    reportId: string;
    resolution: Exclude<GalleryReportStatus, 'OPEN'>;
    note: string;
    audit: GalleryAuditContext;
  }): Promise<GalleryReportRecord>;

  /**
   * Unique on (destinationOrganizationId, idempotencyKey). Reuse with a
   * different requestHash throws IDEMPOTENCY_KEY_REUSED; FAILED may be reclaimed.
   */
  claimGalleryRemix(input: {
    galleryAppId: string;
    galleryAppVersionId: string;
    sourceProjectId?: string;
    destinationOrganizationId: string;
    destinationOwnerUserId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ remix: GalleryRemixRecord; claimed: boolean }>;
  getGalleryRemixByIdempotency(input: {
    destinationOrganizationId: string;
    idempotencyKey: string;
  }): Promise<GalleryRemixRecord | undefined>;

  /**
   * Atomically marks READY, stores provenance destinations, enriches the
   * destination project's creation activity with its human-readable Gallery
   * source, and increments GalleryApp.remixCount once.
   */
  completeGalleryRemix(input: {
    remixId: string;
    destinationOrganizationId: string;
    destinationProjectId: string;
    destinationRepositoryId: string;
    destinationWorkspaceId: string;
    agentAnalysisId: string;
    sourceGalleryAppSlug: string;
    sourceGalleryAppName: string;
    audit: GalleryAuditContext;
  }): Promise<GalleryRemixRecord>;
  failGalleryRemix(input: {
    remixId: string;
    destinationOrganizationId: string;
    errorCode: string;
    audit: GalleryAuditContext;
  }): Promise<GalleryRemixRecord>;
}

export interface GallerySourceProjectService {
  findProject(projectId: string): Promise<GalleryProjectReference | undefined>;
  loadPublicationSnapshot(input: {
    projectId: string;
    organizationId: string;
    actorUserId: string;
  }): Promise<GallerySourceSnapshot>;
  verifyFunctionalPreview(input: {
    projectId: string;
    organizationId: string;
    versionHash: string;
  }): Promise<GalleryPreviewEvidence>;
  /** Fails closed when a remixable snapshot requires data resources that cannot be isolated. */
  assertRemixRequirementsSupported(input: {
    projectId: string;
    organizationId: string;
    dataRequirements: GalleryDataRequirement[];
  }): Promise<void>;
}

export interface GalleryPublishedAppResolver {
  /** Returns one cursor-ordered page after merging code-owned `demo:*` apps and persisted community apps. */
  listPublishedApps(input: {
    query?: string;
    category?: string;
    artifactType?: GalleryArtifactType;
    technology?: string;
    featured?: boolean;
    sort: 'FEATURED' | 'MOST_REMIXED' | 'RECENT' | 'NAME';
    cursor?: string;
    limit: number;
  }): Promise<GalleryPublishedAppPage>;

  /** Resolves metadata and the exact immutable snapshot version for either a DB id or a `demo:*` key. */
  resolvePublishedApp(input: { appId?: string; slug?: string }): Promise<
    | {
        app: GalleryAppRecord;
        version: GalleryAppVersionRecord;
      }
    | undefined
  >;
}

export interface GalleryRemixResources {
  projectId: string;
  repositoryId?: string;
  workspaceId?: string;
  dataResourceIds: string[];
}

export interface GalleryRemixProvisioner {
  createDestinationProject(input: {
    request?: FastifyRequest;
    provisioningKey: string;
    organizationId: string;
    ownerUserId: string;
    name: string;
    slug?: string;
    sourceType: 'remix';
    provenance: {
      sourceGalleryAppId: string;
      sourceGalleryAppVersionId: string;
      sourceProjectId?: string;
    };
  }): Promise<{ projectId: string }>;
  createInternalRepository(input: { projectId: string; ownerUserId: string }): Promise<{ repositoryId: string }>;
  writeSourceFiles(input: {
    projectId: string;
    repositoryId: string;
    files: GallerySnapshotFile[];
    runtime: GalleryRuntimeConfiguration;
  }): Promise<void>;
  createWorkspace(input: {
    request?: FastifyRequest;
    projectId: string;
    repositoryId: string;
    organizationId: string;
    ownerUserId: string;
  }): Promise<{ workspaceId: string }>;
  provisionIsolatedDataResources(input: {
    projectId: string;
    workspaceId: string;
    requirements: GalleryDataRequirement[];
  }): Promise<{ dataResourceIds: string[] }>;
  regenerateDependencyLocks(input: {
    projectId: string;
    workspaceId: string;
    packageManager: GalleryRuntimeConfiguration['packageManager'];
  }): Promise<void>;
  initializeGitRepository(input: {
    projectId: string;
    workspaceId: string;
    repositoryId: string;
    initialCommitMessage: string;
  }): Promise<void>;
  enqueueAgentAnalysis(input: {
    projectId: string;
    workspaceId: string;
    ownerUserId: string;
    sourceGalleryAppId: string;
    sourceGalleryAppVersionId: string;
    missingSecretNames: string[];
  }): Promise<{ agentAnalysisId: string }>;
  rollbackRemix(resources: GalleryRemixResources): Promise<void>;
}

export interface ProjectGalleryRouteOptions {
  store: ProjectGalleryStore;
  sourceProjects: GallerySourceProjectService;
  publishedApps: GalleryPublishedAppResolver;
  remixProvisioner: GalleryRemixProvisioner;
  authenticate(request: FastifyRequest): Promise<GalleryPrincipal | null>;
  authorizeOrganization(input: {
    request: FastifyRequest;
    userId: string;
    organizationId: string;
    permission: GalleryOrganizationPermission;
  }): Promise<boolean>;
  authorizeModeration(input: { request: FastifyRequest; userId: string }): Promise<boolean>;
  consumeRateLimit(input: {
    request: FastifyRequest;
    key: 'gallery-read' | 'gallery-publish' | 'gallery-report' | 'gallery-remix' | 'gallery-moderation';
    userId?: string;
  }): Promise<void>;
}

export class ProjectGalleryError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = 'ProjectGalleryError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function isPublicGalleryApp(app: GalleryAppRecord | undefined): app is GalleryAppRecord {
  return Boolean(
    app &&
      app.status === 'PUBLISHED' &&
      app.moderationStatus === 'APPROVED' &&
      app.previewStatus === 'VERIFIED' &&
      app.previewUrl,
  );
}

function publicGalleryApp(app: GalleryAppRecord) {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    description: app.description,
    author: app.author,
    artifactType: app.artifactType,
    category: app.category,
    technologies: app.technologies,
    tags: app.tags,
    thumbnailUrl: app.thumbnailUrl,
    previewUrl: app.previewUrl,
    visibility: app.visibility,
    moderationStatus: app.moderationStatus,
    allowRemix: app.allowRemix,
    featured: app.featured,
    remixCount: app.remixCount,
    reportCount: app.reportCount,
    publishedAt: app.publishedAt,
    provenance: app.provenance,
  };
}

function publicGalleryPage(page: GalleryPublishedAppPage) {
  return {
    apps: page.apps.filter((app) => app.visibility === 'PUBLIC' && isPublicGalleryApp(app)).map(publicGalleryApp),
    facets: page.facets,
    nextCursor: page.nextCursor,
  };
}

function requireTenantApp(app: GalleryAppRecord | undefined, organizationId: string): GalleryAppRecord {
  if (!app || app.organizationId !== organizationId) {
    throw new ProjectGalleryError('Gallery app not found', 404, 'GALLERY_APP_NOT_FOUND');
  }

  return app;
}

function requireGalleryVersion(version: GalleryAppVersionRecord | undefined): GalleryAppVersionRecord {
  if (!version) {
    throw new ProjectGalleryError('Gallery app version not found', 404, 'GALLERY_VERSION_NOT_FOUND');
  }

  return version;
}

function validatePreviewEvidence(evidence: GalleryPreviewEvidence): GalleryPreviewEvidence {
  const timestamp = Date.parse(evidence.checkedAt);

  let previewUrl: URL;

  try {
    previewUrl = new URL(evidence.previewUrl);
  } catch {
    throw new ProjectGalleryError('Preview verification returned an invalid URL', 502, 'GALLERY_PREVIEW_INVALID');
  }

  if (
    previewUrl.protocol !== 'https:' ||
    !Number.isFinite(timestamp) ||
    !Number.isInteger(evidence.httpStatus) ||
    evidence.httpStatus < 200 ||
    evidence.httpStatus >= 300 ||
    !evidence.rendered
  ) {
    throw new ProjectGalleryError(
      'The source app preview must render successfully before it can be submitted',
      422,
      'GALLERY_PREVIEW_NOT_FUNCTIONAL',
    );
  }

  return evidence;
}

function safeFailureCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : 'GALLERY_REMIX_PROVISIONING_FAILED';
}

function auditContext(request: FastifyRequest, userId: string): GalleryAuditContext {
  const userAgent = request.headers['user-agent'];
  return {
    actorUserId: userId,
    requestId: request.id,
    ip: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent: userAgent.slice(0, 512) } : {}),
  };
}

export class ProjectGalleryService {
  constructor(
    private readonly _store: ProjectGalleryStore,
    private readonly _sourceProjects: GallerySourceProjectService,
    private readonly _remixProvisioner: GalleryRemixProvisioner,
  ) {}

  async createDraft(input: {
    organizationId: string;
    actorUserId: string;
    body: GalleryAppCreateInput;
    audit: GalleryAuditContext;
  }) {
    const sourceProject = await this._sourceProjects.findProject(input.body.sourceProjectId);

    if (!sourceProject || sourceProject.organizationId !== input.organizationId || sourceProject.deletedAt) {
      throw new ProjectGalleryError('Source project not found', 404, 'PROJECT_NOT_FOUND');
    }

    const snapshot = prepareGallerySnapshot(
      await this._sourceProjects.loadPublicationSnapshot({
        projectId: sourceProject.id,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
      }),
    );
    const provenance = sourceProject.provenance ?? (await this._store.getGalleryProjectProvenance(sourceProject.id));

    return this._store.createGalleryApp({
      ...input.body,
      organizationId: input.organizationId,
      authorUserId: input.actorUserId,
      provenance,
      initialVersion: {
        files: snapshot.files,
        runtime: snapshot.runtime,
        dataRequirements: snapshot.dataRequirements,
        contentHash: snapshot.contentHash,
        byteLength: snapshot.byteLength,
        removedPaths: snapshot.removedPaths,
        redactedValueCount: snapshot.redactedValueCount,
        validationChecks: snapshot.validationChecks,
        createdByUserId: input.actorUserId,
      },
      audit: input.audit,
    });
  }

  async resnapshot(input: { app: GalleryAppRecord; actorUserId: string; audit: GalleryAuditContext }) {
    if (!['DRAFT', 'REJECTED'].includes(input.app.status)) {
      throw new ProjectGalleryError(
        'Gallery app cannot be resnapshotted in its current state',
        409,
        'GALLERY_STATE_CONFLICT',
      );
    }

    if (!input.app.sourceProjectId) {
      throw new ProjectGalleryError('Gallery app source project is missing', 409, 'GALLERY_SOURCE_PROJECT_MISSING');
    }

    const sourceProject = await this._sourceProjects.findProject(input.app.sourceProjectId);
    if (!sourceProject || sourceProject.organizationId !== input.app.organizationId || sourceProject.deletedAt) {
      throw new ProjectGalleryError('Source project not found', 404, 'PROJECT_NOT_FOUND');
    }

    const snapshot = prepareGallerySnapshot(
      await this._sourceProjects.loadPublicationSnapshot({
        projectId: sourceProject.id,
        organizationId: input.app.organizationId,
        actorUserId: input.actorUserId,
      }),
    );

    return this._store.createGalleryAppVersion({
      appId: input.app.id,
      organizationId: input.app.organizationId,
      createdByUserId: input.actorUserId,
      snapshot: {
        files: snapshot.files,
        runtime: snapshot.runtime,
        dataRequirements: snapshot.dataRequirements,
        contentHash: snapshot.contentHash,
        byteLength: snapshot.byteLength,
        removedPaths: snapshot.removedPaths,
        redactedValueCount: snapshot.redactedValueCount,
        validationChecks: snapshot.validationChecks,
      },
      audit: input.audit,
    });
  }

  async assertRemixRequirementsSupported(input: {
    app: GalleryAppRecord;
    version?: GalleryAppVersionRecord;
  }): Promise<void> {
    if (!input.app.allowRemix) return;
    if (!input.app.sourceProjectId) {
      throw new ProjectGalleryError('Gallery app source project is missing', 409, 'GALLERY_SOURCE_PROJECT_MISSING');
    }

    const version =
      input.version ?? requireGalleryVersion(await this._store.getGalleryAppVersion(input.app.latestVersionId));
    await this._sourceProjects.assertRemixRequirementsSupported({
      projectId: input.app.sourceProjectId,
      organizationId: input.app.organizationId,
      dataRequirements: version.dataRequirements,
    });
  }

  async submit(input: { app: GalleryAppRecord; audit: GalleryAuditContext }) {
    if (!['DRAFT', 'REJECTED'].includes(input.app.status)) {
      throw new ProjectGalleryError(
        'Gallery app cannot be submitted in its current state',
        409,
        'GALLERY_STATE_CONFLICT',
      );
    }

    if (!input.app.sourceProjectId) {
      throw new ProjectGalleryError('Gallery app source project is missing', 409, 'GALLERY_SOURCE_PROJECT_MISSING');
    }

    const version = requireGalleryVersion(await this._store.getGalleryAppVersion(input.app.latestVersionId));
    await this.assertRemixRequirementsSupported({ app: input.app, version });

    const preview = validatePreviewEvidence(
      await this._sourceProjects.verifyFunctionalPreview({
        projectId: input.app.sourceProjectId,
        organizationId: input.app.organizationId,
        versionHash: version.contentHash,
      }),
    );

    return this._store.submitGalleryApp({
      appId: input.app.id,
      organizationId: input.app.organizationId,
      versionId: version.id,
      preview,
      audit: input.audit,
    });
  }

  async remix(input: {
    request?: FastifyRequest;
    app: GalleryAppRecord;
    version: GalleryAppVersionRecord;
    destinationOrganizationId: string;
    actorUserId: string;
    name: string;
    slug?: string;
    idempotencyKey: string;
    audit: GalleryAuditContext;
  }): Promise<{ remix: GalleryRemixRecord; replayed: boolean; inProgress: boolean; missingSecretNames: string[] }> {
    if (!isPublicGalleryApp(input.app)) {
      throw new ProjectGalleryError('Gallery app not found', 404, 'GALLERY_APP_NOT_FOUND');
    }

    if (!input.app.allowRemix) {
      throw new ProjectGalleryError('The publisher disabled remix for this app', 409, 'GALLERY_REMIX_DISABLED');
    }

    const version = requireGalleryVersion(input.version);

    const prepared = prepareGallerySnapshot({
      files: version.files,
      runtime: version.runtime,
      dataRequirements: version.dataRequirements,
    });

    if (prepared.contentHash !== version.contentHash) {
      throw new ProjectGalleryError(
        'Gallery app version failed its integrity check',
        500,
        'GALLERY_VERSION_INTEGRITY_FAILED',
      );
    }

    const requestHash = hashGalleryRequest({
      galleryAppId: input.app.id,
      galleryAppVersionId: version.id,
      destinationOrganizationId: input.destinationOrganizationId,
      destinationOwnerUserId: input.actorUserId,
      name: input.name,
      slug: input.slug ?? null,
    });
    const claim = await this._store.claimGalleryRemix({
      galleryAppId: input.app.id,
      galleryAppVersionId: version.id,
      sourceProjectId: input.app.sourceProjectId,
      destinationOrganizationId: input.destinationOrganizationId,
      destinationOwnerUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });

    if (!claim.claimed) {
      return {
        remix: claim.remix,
        replayed: claim.remix.status === 'READY',
        inProgress: claim.remix.status === 'CREATING',
        missingSecretNames: [...prepared.runtime.requiredSecretNames],
      };
    }

    let resources: GalleryRemixResources | undefined;
    let completionAttempted = false;

    try {
      const project = await this._remixProvisioner.createDestinationProject({
        request: input.request,
        provisioningKey: claim.remix.id,
        organizationId: input.destinationOrganizationId,
        ownerUserId: input.actorUserId,
        name: input.name,
        slug: input.slug,
        sourceType: 'remix',
        provenance: {
          sourceGalleryAppId: input.app.id,
          sourceGalleryAppVersionId: version.id,
          sourceProjectId: input.app.sourceProjectId,
        },
      });
      resources = { projectId: project.projectId, dataResourceIds: [] };

      const repository = await this._remixProvisioner.createInternalRepository({
        projectId: project.projectId,
        ownerUserId: input.actorUserId,
      });
      resources.repositoryId = repository.repositoryId;

      await this._remixProvisioner.writeSourceFiles({
        projectId: project.projectId,
        repositoryId: repository.repositoryId,
        files: prepared.files,
        runtime: prepared.runtime,
      });

      const workspace = await this._remixProvisioner.createWorkspace({
        request: input.request,
        projectId: project.projectId,
        repositoryId: repository.repositoryId,
        organizationId: input.destinationOrganizationId,
        ownerUserId: input.actorUserId,
      });
      resources.workspaceId = workspace.workspaceId;

      const isolatedData = await this._remixProvisioner.provisionIsolatedDataResources({
        projectId: project.projectId,
        workspaceId: workspace.workspaceId,
        requirements: prepared.dataRequirements,
      });
      resources.dataResourceIds = isolatedData.dataResourceIds;

      await this._remixProvisioner.regenerateDependencyLocks({
        projectId: project.projectId,
        workspaceId: workspace.workspaceId,
        packageManager: prepared.runtime.packageManager,
      });

      await this._remixProvisioner.initializeGitRepository({
        projectId: project.projectId,
        workspaceId: workspace.workspaceId,
        repositoryId: repository.repositoryId,
        initialCommitMessage: `Remix ${input.app.name}`,
      });

      const analysis = await this._remixProvisioner.enqueueAgentAnalysis({
        projectId: project.projectId,
        workspaceId: workspace.workspaceId,
        ownerUserId: input.actorUserId,
        sourceGalleryAppId: input.app.id,
        sourceGalleryAppVersionId: version.id,
        missingSecretNames: [...prepared.runtime.requiredSecretNames],
      });

      completionAttempted = true;

      const remix = await this._store.completeGalleryRemix({
        remixId: claim.remix.id,
        destinationOrganizationId: input.destinationOrganizationId,
        destinationProjectId: project.projectId,
        destinationRepositoryId: repository.repositoryId,
        destinationWorkspaceId: workspace.workspaceId,
        agentAnalysisId: analysis.agentAnalysisId,
        sourceGalleryAppSlug: input.app.slug,
        sourceGalleryAppName: input.app.name,
        audit: input.audit,
      });

      return {
        remix,
        replayed: false,
        inProgress: false,
        missingSecretNames: [...prepared.runtime.requiredSecretNames],
      };
    } catch (error) {
      if (completionAttempted) {
        let durableState: GalleryRemixRecord | undefined;

        try {
          durableState = await this._store.getGalleryRemixByIdempotency({
            destinationOrganizationId: input.destinationOrganizationId,
            idempotencyKey: input.idempotencyKey,
          });
        } catch {
          // Do not destroy a potentially committed project while persistence is unavailable.
          throw new ProjectGalleryError(
            'The remix completion state is being reconciled; retry with the same Idempotency-Key',
            503,
            'GALLERY_REMIX_STATE_UNKNOWN',
          );
        }

        if (durableState?.status === 'READY') {
          return {
            remix: durableState,
            replayed: true,
            inProgress: false,
            missingSecretNames: [...prepared.runtime.requiredSecretNames],
          };
        }
      }

      if (resources) {
        await this._remixProvisioner.rollbackRemix(resources).catch(() => undefined);
      }

      await this._store
        .failGalleryRemix({
          remixId: claim.remix.id,
          destinationOrganizationId: input.destinationOrganizationId,
          errorCode: safeFailureCode(error),
          audit: input.audit,
        })
        .catch(() => undefined);

      throw new ProjectGalleryError('Unable to create the remix project', 502, safeFailureCode(error));
    }
  }
}

async function requirePrincipal(request: FastifyRequest, options: ProjectGalleryRouteOptions) {
  const principal = await options.authenticate(request);

  if (!principal) {
    throw new ProjectGalleryError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
  }

  return principal;
}

async function requireOrganizationPermission(input: {
  request: FastifyRequest;
  options: ProjectGalleryRouteOptions;
  principal: GalleryPrincipal;
  organizationId: string;
  permission: GalleryOrganizationPermission;
}) {
  const allowed = await input.options.authorizeOrganization({
    request: input.request,
    userId: input.principal.userId,
    organizationId: input.organizationId,
    permission: input.permission,
  });

  if (!allowed) {
    // Opaque 404 prevents organization and resource enumeration across tenants.
    throw new ProjectGalleryError('Gallery app not found', 404, 'GALLERY_APP_NOT_FOUND');
  }
}

async function requireModerator(request: FastifyRequest, options: ProjectGalleryRouteOptions) {
  const principal = await requirePrincipal(request, options);

  if (!(await options.authorizeModeration({ request, userId: principal.userId }))) {
    throw new ProjectGalleryError('Gallery moderation access denied', 403, 'GALLERY_MODERATION_FORBIDDEN');
  }

  return principal;
}

function sendGalleryError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  const candidate = error as { statusCode?: unknown; code?: unknown; message?: unknown; details?: unknown };

  const statusCode =
    typeof candidate.statusCode === 'number' && candidate.statusCode >= 400 && candidate.statusCode <= 599
      ? candidate.statusCode
      : 500;

  const code = typeof candidate.code === 'string' ? candidate.code : 'GALLERY_INTERNAL_ERROR';

  const message =
    statusCode < 500 && typeof candidate.message === 'string' ? candidate.message : 'Unable to process Gallery request';

  if (statusCode >= 500) {
    // Never log an arbitrary exception message: provisioner errors can contain command output or credentials.
    request.log.error({ requestId: request.id, code, statusCode }, 'Project Gallery route failed');
  }

  return reply.code(statusCode).send({
    error: message,
    code,
    requestId: request.id,
    ...(statusCode < 500 && candidate.details !== undefined ? { details: candidate.details } : {}),
  });
}

async function runGalleryRoute(request: FastifyRequest, reply: FastifyReply, operation: () => Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    return sendGalleryError(request, reply, error);
  }
}

/**
 * Fastify plugin boundary for the published-app Gallery. The host application
 * supplies its real Prisma, RBAC, rate-limit, runtime, Git, workspace and Agent
 * adapters, keeping this domain independently testable without bypassing auth.
 */
export async function registerProjectGalleryRoutes(
  app: FastifyInstance,
  options: ProjectGalleryRouteOptions,
): Promise<void> {
  const service = new ProjectGalleryService(options.store, options.sourceProjects, options.remixProvisioner);

  app.get('/gallery/apps', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      await options.consumeRateLimit({ request, key: 'gallery-read' });

      const query = parseGalleryInput(galleryListQuerySchema, request.query);

      return reply.send(publicGalleryPage(await options.publishedApps.listPublishedApps(query)));
    }),
  );

  app.get('/gallery/apps/:slug', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      await options.consumeRateLimit({ request, key: 'gallery-read' });

      const { slug } = parseGalleryInput(gallerySlugParamsSchema, request.params);
      const resolved = await options.publishedApps.resolvePublishedApp({ slug });
      const galleryApp = resolved?.app;

      if (!isPublicGalleryApp(galleryApp)) {
        throw new ProjectGalleryError('Gallery app not found', 404, 'GALLERY_APP_NOT_FOUND');
      }

      return reply.send({ app: publicGalleryApp(galleryApp) });
    }),
  );

  app.get('/organizations/:orgId/gallery/apps', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      const { orgId } = parseGalleryInput(organizationParamsSchema, request.params);
      const query = parseGalleryInput(galleryTenantListQuerySchema, request.query);
      const principal = await requirePrincipal(request, options);
      await requireOrganizationPermission({
        request,
        options,
        principal,
        organizationId: orgId,
        permission: 'projects:read',
      });

      return reply.send(
        await options.store.listOrganizationGalleryApps({
          organizationId: orgId,
          status: query.status,
          cursor: query.cursor,
          limit: query.limit,
        }),
      );
    }),
  );

  app.post('/organizations/:orgId/gallery/apps', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      const { orgId } = parseGalleryInput(organizationParamsSchema, request.params);
      const body = parseGalleryInput(galleryAppCreateSchema, request.body);
      const principal = await requirePrincipal(request, options);
      await options.consumeRateLimit({ request, key: 'gallery-publish', userId: principal.userId });
      await requireOrganizationPermission({
        request,
        options,
        principal,
        organizationId: orgId,
        permission: 'projects:write',
      });

      const result = await service.createDraft({
        organizationId: orgId,
        actorUserId: principal.userId,
        body,
        audit: auditContext(request, principal.userId),
      });

      return reply.code(201).send(result);
    }),
  );

  app.patch('/organizations/:orgId/gallery/apps/:appId', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      const { orgId, appId } = parseGalleryInput(tenantGalleryAppParamsSchema, request.params);
      const patch = parseGalleryInput(galleryAppUpdateSchema, request.body);
      const principal = await requirePrincipal(request, options);
      await options.consumeRateLimit({ request, key: 'gallery-publish', userId: principal.userId });
      await requireOrganizationPermission({
        request,
        options,
        principal,
        organizationId: orgId,
        permission: 'projects:write',
      });
      requireTenantApp(await options.store.getGalleryApp(appId), orgId);

      return reply.send({
        app: await options.store.updateGalleryApp({
          appId,
          organizationId: orgId,
          patch,
          audit: auditContext(request, principal.userId),
        }),
      });
    }),
  );

  app.post('/organizations/:orgId/gallery/apps/:appId/versions', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      const { orgId, appId } = parseGalleryInput(tenantGalleryAppParamsSchema, request.params);
      parseGalleryInput(emptyBodySchema, request.body ?? {});
      const principal = await requirePrincipal(request, options);
      await options.consumeRateLimit({ request, key: 'gallery-publish', userId: principal.userId });
      await requireOrganizationPermission({
        request,
        options,
        principal,
        organizationId: orgId,
        permission: 'projects:write',
      });
      const galleryApp = requireTenantApp(await options.store.getGalleryApp(appId), orgId);

      return reply.code(201).send(
        await service.resnapshot({
          app: galleryApp,
          actorUserId: principal.userId,
          audit: auditContext(request, principal.userId),
        }),
      );
    }),
  );

  app.post('/organizations/:orgId/gallery/apps/:appId/submit', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      const { orgId, appId } = parseGalleryInput(tenantGalleryAppParamsSchema, request.params);
      parseGalleryInput(emptyBodySchema, request.body ?? {});

      const principal = await requirePrincipal(request, options);
      await options.consumeRateLimit({ request, key: 'gallery-publish', userId: principal.userId });
      await requireOrganizationPermission({
        request,
        options,
        principal,
        organizationId: orgId,
        permission: 'projects:write',
      });

      const galleryApp = requireTenantApp(await options.store.getGalleryApp(appId), orgId);

      return reply.send({
        app: await service.submit({ app: galleryApp, audit: auditContext(request, principal.userId) }),
      });
    }),
  );

  app.post('/gallery/apps/:appId/reports', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      const { appId } = parseGalleryInput(galleryAppParamsSchema, request.params);
      const body = parseGalleryInput(galleryReportSchema, request.body);
      const principal = await requirePrincipal(request, options);
      await options.consumeRateLimit({ request, key: 'gallery-report', userId: principal.userId });

      const galleryApp = (await options.publishedApps.resolvePublishedApp({ appId }))?.app;

      if (!isPublicGalleryApp(galleryApp)) {
        throw new ProjectGalleryError('Gallery app not found', 404, 'GALLERY_APP_NOT_FOUND');
      }

      const result = await options.store.createGalleryReport({
        galleryAppId: appId,
        reporterUserId: principal.userId,
        reason: body.reason,
        details: body.details,
        audit: auditContext(request, principal.userId),
      });

      return reply.code(result.created ? 201 : 200).send(result);
    }),
  );

  app.post('/organizations/:orgId/gallery/apps/:appId/remix', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      const { orgId, appId } = parseGalleryInput(tenantGalleryAppParamsSchema, request.params);
      const body = parseGalleryInput(galleryRemixSchema, request.body);
      const idempotencyKey = parseGalleryIdempotencyKey(request.headers['idempotency-key']);
      const principal = await requirePrincipal(request, options);
      await options.consumeRateLimit({ request, key: 'gallery-remix', userId: principal.userId });
      await requireOrganizationPermission({
        request,
        options,
        principal,
        organizationId: orgId,
        permission: 'projects:write',
      });

      const resolved = await options.publishedApps.resolvePublishedApp({ appId });
      const galleryApp = resolved?.app;

      if (!isPublicGalleryApp(galleryApp)) {
        throw new ProjectGalleryError('Gallery app not found', 404, 'GALLERY_APP_NOT_FOUND');
      }

      const result = await service.remix({
        request,
        app: galleryApp,
        version: resolved!.version,
        destinationOrganizationId: orgId,
        actorUserId: principal.userId,
        name: body.name,
        slug: body.slug,
        idempotencyKey,
        audit: auditContext(request, principal.userId),
      });

      const statusCode = result.inProgress ? 202 : result.replayed ? 200 : 201;

      if (result.replayed) {
        reply.header('Idempotency-Replayed', 'true');
      }

      if (result.inProgress) {
        reply.header('Retry-After', '2');
      }

      return reply.code(statusCode).send({
        remix: result.remix,
        projectId: result.remix.destinationProjectId,
        workspaceId: result.remix.destinationWorkspaceId,
        missingSecretNames: result.missingSecretNames,
        source: { appId: galleryApp.id, slug: galleryApp.slug, url: `/gallery/apps/${galleryApp.slug}` },
      });
    }),
  );

  app.get('/admin/gallery/moderation', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      const query = parseGalleryInput(galleryModerationListQuerySchema, request.query);
      const principal = await requireModerator(request, options);
      await options.consumeRateLimit({ request, key: 'gallery-moderation', userId: principal.userId });

      return reply.send(await options.store.listGalleryModerationQueue(query));
    }),
  );

  app.post('/admin/gallery/apps/:appId/moderate', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      const { appId } = parseGalleryInput(galleryAppParamsSchema, request.params);
      const body = parseGalleryInput(galleryModerationSchema, request.body);
      const principal = await requireModerator(request, options);
      await options.consumeRateLimit({ request, key: 'gallery-moderation', userId: principal.userId });

      const galleryApp = await options.store.getGalleryApp(appId);

      if (!galleryApp) {
        throw new ProjectGalleryError('Gallery app not found', 404, 'GALLERY_APP_NOT_FOUND');
      }

      if (body.action === 'APPROVE' && body.functionalPreviewConfirmed !== true) {
        throw new ProjectGalleryError(
          'Confirm the functional browser Preview and thumbnail review before approving this app',
          400,
          'GALLERY_FUNCTIONAL_PREVIEW_CONFIRMATION_REQUIRED',
        );
      }

      if (
        body.action === 'APPROVE' &&
        (galleryApp.status !== 'PENDING_REVIEW' || galleryApp.previewStatus !== 'VERIFIED')
      ) {
        throw new ProjectGalleryError(
          'Only submitted apps with a verified preview can be approved',
          409,
          'GALLERY_MODERATION_STATE_CONFLICT',
        );
      }

      if (body.action === 'APPROVE') {
        await service.assertRemixRequirementsSupported({ app: galleryApp });
      }

      if (['FEATURE', 'UNFEATURE'].includes(body.action) && galleryApp.status !== 'PUBLISHED') {
        throw new ProjectGalleryError('Only published apps can be featured', 409, 'GALLERY_MODERATION_STATE_CONFLICT');
      }

      return reply.send({
        app: await options.store.moderateGalleryApp({
          appId,
          action: body.action,
          reason: body.reason,
          ...(body.action === 'APPROVE' ? { functionalPreviewConfirmed: true as const } : {}),
          audit: auditContext(request, principal.userId),
        }),
      });
    }),
  );

  app.get('/admin/gallery/reports', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      const query = parseGalleryInput(galleryReportListQuerySchema, request.query);
      const principal = await requireModerator(request, options);
      await options.consumeRateLimit({ request, key: 'gallery-moderation', userId: principal.userId });

      return reply.send(await options.store.listGalleryReports(query));
    }),
  );

  app.post('/admin/gallery/reports/:reportId/resolve', async (request, reply) =>
    runGalleryRoute(request, reply, async () => {
      const { reportId } = parseGalleryInput(galleryReportParamsSchema, request.params);
      const body = parseGalleryInput(galleryReportResolutionSchema, request.body);
      const principal = await requireModerator(request, options);
      await options.consumeRateLimit({ request, key: 'gallery-moderation', userId: principal.userId });

      if (!(await options.store.getGalleryReport(reportId))) {
        throw new ProjectGalleryError('Gallery report not found', 404, 'GALLERY_REPORT_NOT_FOUND');
      }

      return reply.send({
        report: await options.store.resolveGalleryReport({
          reportId,
          resolution: body.resolution,
          note: body.note,
          audit: auditContext(request, principal.userId),
        }),
      });
    }),
  );
}

export { ProjectGalleryValidationError };
export type {
  GalleryAppCreateInput,
  GalleryAppUpdateInput,
  GalleryArtifactType,
  GalleryDataRequirement,
  GalleryRuntimeConfiguration,
  GallerySnapshotFile,
  GallerySourceSnapshot,
  GalleryVisibility,
} from './project-gallery-validation.js';
