import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareGallerySnapshot } from './project-gallery-validation.js';
import {
  galleryFacetsFromApps,
  ProjectGalleryError,
  registerProjectGalleryRoutes,
  type GalleryAppPage,
  type GalleryAppRecord,
  type GalleryAppVersionRecord,
  type GalleryFacets,
  type GalleryPreviewEvidence,
  type GalleryProjectReference,
  type GalleryPublishedAppResolver,
  type GalleryRemixProvisioner,
  type GalleryRemixRecord,
  type GalleryReportPage,
  type GalleryReportRecord,
  type GallerySourceProjectService,
  type GallerySourceSnapshot,
  type ProjectGalleryStore,
} from './project-gallery.js';

const appsToClose: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(appsToClose.splice(0).map((app) => app.close()));
});

const now = '2026-07-16T10:00:00.000Z';

function sourceSnapshot(overrides: Partial<GallerySourceSnapshot> = {}): GallerySourceSnapshot {
  return {
    files: [
      { path: 'package.json', content: '{"scripts":{"dev":"vite"},"dependencies":{"vite":"8.1.4"}}' },
      {
        path: 'src/main.ts',
        content:
          "const key = 'sk-abcdefghijklmnopqrstuvwxyz123456'; const db = 'postgresql://creator:password@db.example.com/app'; console.log('ready');",
      },
      { path: '.env', content: 'DATABASE_URL=postgres://creator-secret' },
      { path: '.env.example', content: 'OPENAI_API_KEY=creator-key-value' },
      { path: 'pnpm-lock.yaml', content: 'lockfileVersion: 9' },
      { path: 'data.sqlite', content: 'creator database bytes' },
      { path: 'uploads/customer.csv', content: 'private,customer,data' },
    ],
    runtime: {
      packageManager: 'pnpm',
      installCommand: 'pnpm install',
      devCommand: 'pnpm dev',
      buildCommand: 'pnpm build',
      previewPort: 5173,
      requiredSecretNames: ['OPENAI_API_KEY', 'DATABASE_URL'],
    },
    dataRequirements: [
      { key: 'primary-db', kind: 'POSTGRES', required: true },
      { key: 'assets', kind: 'OBJECT_STORAGE', required: true },
    ],
    ...overrides,
  };
}

function publishedDemo(allowRemix = true): { app: GalleryAppRecord; version: GalleryAppVersionRecord } {
  const prepared = prepareGallerySnapshot(sourceSnapshot());

  const app: GalleryAppRecord = {
    id: 'demo:crm',
    slug: 'customer-command-center',
    organizationId: 'ecode',
    authorUserId: 'ecode-system',
    author: { handle: 'ecode', displayName: 'E-Code' },
    name: 'Customer Command Center',
    description: 'A working CRM app published for remix.',
    artifactType: 'CRM',
    category: 'business',
    technologies: ['react', 'typescript', 'vite'],
    tags: ['crm'],
    thumbnailUrl: 'https://cdn.example.com/gallery/crm.png',
    visibility: 'PUBLIC',
    status: 'PUBLISHED',
    moderationStatus: 'APPROVED',
    allowRemix,
    featured: true,
    remixCount: 12,
    reportCount: 0,
    previewStatus: 'VERIFIED',
    previewUrl: 'https://preview.example.com/demo-crm',
    latestVersionId: 'demo:crm:v1',
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const version: GalleryAppVersionRecord = {
    id: 'demo:crm:v1',
    galleryAppId: app.id,
    version: 1,
    files: prepared.files,
    runtime: prepared.runtime,
    dataRequirements: prepared.dataRequirements,
    contentHash: prepared.contentHash,
    byteLength: prepared.byteLength,
    removedPaths: prepared.removedPaths,
    redactedValueCount: prepared.redactedValueCount,
    validationChecks: prepared.validationChecks,
    createdByUserId: 'ecode-system',
    createdAt: now,
  };

  return { app, version };
}

class TestGalleryStore implements ProjectGalleryStore {
  readonly apps = new Map<string, GalleryAppRecord>();
  readonly versions = new Map<string, GalleryAppVersionRecord>();
  readonly remixes = new Map<string, GalleryRemixRecord>();
  readonly reports = new Map<string, GalleryReportRecord>();
  readonly projectProvenance = new Map<string, { sourceGalleryAppId: string; sourceGalleryAppSlug: string }>();
  private _sequence = 0;

  async getGalleryApp(appId: string) {
    return this.apps.get(appId);
  }

  async getGalleryAppBySlug(slug: string) {
    return [...this.apps.values()].find((app) => app.slug === slug);
  }

  async listPublishedGalleryApps(input: Parameters<ProjectGalleryStore['listPublishedGalleryApps']>[0]) {
    const query = input.query?.toLowerCase();
    const apps = [...this.apps.values()]
      .filter(
        (app) =>
          app.status === 'PUBLISHED' &&
          app.moderationStatus === 'APPROVED' &&
          app.previewStatus === 'VERIFIED' &&
          (!input.category || app.category === input.category) &&
          (!input.artifactType || app.artifactType === input.artifactType) &&
          (input.featured === undefined || app.featured === input.featured) &&
          (!input.technology || app.technologies.some((item) => item.toLowerCase() === input.technology)) &&
          (!query || `${app.name} ${app.description}`.toLowerCase().includes(query)),
      )
      .slice(0, input.limit);

    return { apps, itemCursors: apps.map((app) => app.id), nextCursor: apps.at(-1)?.id };
  }

  async listPublishedGalleryFacets(): Promise<GalleryFacets> {
    return galleryFacetsFromApps(
      [...this.apps.values()].filter(
        (app) =>
          app.status === 'PUBLISHED' &&
          app.moderationStatus === 'APPROVED' &&
          app.previewStatus === 'VERIFIED' &&
          Boolean(app.previewUrl) &&
          app.visibility === 'PUBLIC',
      ),
    );
  }

  async getGalleryEngagementCounts(appIds: string[]) {
    return appIds.map((galleryAppId) => ({
      galleryAppId,
      completedRemixCount: [...this.remixes.values()].filter(
        (remix) => remix.galleryAppId === galleryAppId && remix.status === 'READY',
      ).length,
      reportCount: [...this.reports.values()].filter((report) => report.galleryAppId === galleryAppId).length,
    }));
  }

  async getGalleryAppVersion(versionId: string) {
    return this.versions.get(versionId);
  }

  async getGalleryProjectProvenance(projectId: string) {
    return this.projectProvenance.get(projectId);
  }

  async listOrganizationGalleryApps(input: {
    organizationId: string;
    status?: GalleryAppRecord['status'];
    cursor?: string;
    limit: number;
  }): Promise<GalleryAppPage> {
    return {
      apps: [...this.apps.values()]
        .filter((app) => app.organizationId === input.organizationId && (!input.status || app.status === input.status))
        .slice(0, input.limit),
    };
  }

  async createGalleryApp(input: Parameters<ProjectGalleryStore['createGalleryApp']>[0]) {
    const id = `gallery-${++this._sequence}`;
    const versionId = `${id}:v1`;

    const app: GalleryAppRecord = {
      id,
      slug:
        input.slug ??
        input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
      sourceProjectId: input.sourceProjectId,
      organizationId: input.organizationId,
      authorUserId: input.authorUserId,
      author: { handle: input.authorUserId, displayName: input.authorUserId },
      name: input.name,
      description: input.description,
      artifactType: input.artifactType,
      category: input.category,
      technologies: input.technologies,
      tags: input.tags,
      thumbnailUrl: input.thumbnailUrl,
      visibility: input.visibility,
      status: 'DRAFT',
      moderationStatus: 'NOT_SUBMITTED',
      allowRemix: input.allowRemix,
      featured: false,
      remixCount: 0,
      reportCount: 0,
      previewStatus: 'PENDING',
      latestVersionId: versionId,
      provenance: input.provenance,
      createdAt: now,
      updatedAt: now,
    };
    const version: GalleryAppVersionRecord = {
      ...input.initialVersion,
      id: versionId,
      galleryAppId: id,
      version: 1,
      createdAt: now,
    };
    this.apps.set(app.id, app);
    this.versions.set(version.id, version);

    return { app, version };
  }

  async createGalleryAppVersion(input: Parameters<ProjectGalleryStore['createGalleryAppVersion']>[0]) {
    const current = this.apps.get(input.appId);
    if (!current || current.organizationId !== input.organizationId) {
      throw new ProjectGalleryError('Gallery app not found', 404, 'GALLERY_APP_NOT_FOUND');
    }
    if (!['DRAFT', 'REJECTED'].includes(current.status)) {
      throw new ProjectGalleryError(
        'Gallery app cannot be resnapshotted in its current state',
        409,
        'GALLERY_STATE_CONFLICT',
      );
    }
    if (
      [...this.versions.values()].some(
        (version) => version.galleryAppId === current.id && version.contentHash === input.snapshot.contentHash,
      )
    ) {
      throw new ProjectGalleryError(
        'The sanitized Gallery snapshot has not changed',
        409,
        'GALLERY_SNAPSHOT_UNCHANGED',
      );
    }
    const latest = this.versions.get(current.latestVersionId)!;
    const version: GalleryAppVersionRecord = {
      ...input.snapshot,
      id: `${current.id}:v${latest.version + 1}`,
      galleryAppId: current.id,
      version: latest.version + 1,
      createdByUserId: input.createdByUserId,
      createdAt: now,
    };
    const app: GalleryAppRecord = {
      ...current,
      latestVersionId: version.id,
      status: 'DRAFT',
      moderationStatus: 'NOT_SUBMITTED',
      moderationReason: undefined,
      previewStatus: 'PENDING',
      previewUrl: undefined,
      submittedAt: undefined,
      publishedAt: undefined,
      archivedAt: undefined,
      featured: false,
      updatedAt: now,
    };
    this.versions.set(version.id, version);
    this.apps.set(app.id, app);
    return { app, version };
  }

  async updateGalleryApp(input: Parameters<ProjectGalleryStore['updateGalleryApp']>[0]) {
    const current = this.apps.get(input.appId);

    if (!current || current.organizationId !== input.organizationId) {
      throw new ProjectGalleryError('Gallery app not found', 404, 'GALLERY_APP_NOT_FOUND');
    }
    if (!['DRAFT', 'REJECTED'].includes(current.status)) {
      throw new ProjectGalleryError('Only draft or rejected Gallery apps can be edited', 409, 'GALLERY_STATE_CONFLICT');
    }

    const updated = { ...current, ...input.patch, updatedAt: now };
    this.apps.set(updated.id, updated);

    return updated;
  }

  async submitGalleryApp(input: Parameters<ProjectGalleryStore['submitGalleryApp']>[0]) {
    const current = this.apps.get(input.appId)!;

    const updated: GalleryAppRecord = {
      ...current,
      status: 'PENDING_REVIEW',
      moderationStatus: 'PENDING',
      previewStatus: 'VERIFIED',
      previewUrl: input.preview.previewUrl,
      submittedAt: now,
      updatedAt: now,
    };
    this.apps.set(updated.id, updated);

    return updated;
  }

  async listGalleryModerationQueue(input: { cursor?: string; limit: number }): Promise<GalleryAppPage> {
    return { apps: [...this.apps.values()].filter((app) => app.status === 'PENDING_REVIEW').slice(0, input.limit) };
  }

  async moderateGalleryApp(input: Parameters<ProjectGalleryStore['moderateGalleryApp']>[0]) {
    if (input.action === 'APPROVE' && input.functionalPreviewConfirmed !== true) {
      throw new ProjectGalleryError(
        'Confirm the functional browser Preview and thumbnail review before approval',
        400,
        'GALLERY_FUNCTIONAL_PREVIEW_CONFIRMATION_REQUIRED',
      );
    }

    const current = this.apps.get(input.appId)!;

    let updated: GalleryAppRecord;

    if (input.action === 'APPROVE') {
      updated = {
        ...current,
        status: 'PUBLISHED',
        moderationStatus: 'APPROVED',
        moderationReason: undefined,
        publishedAt: now,
        updatedAt: now,
      };
    } else if (input.action === 'REJECT') {
      updated = {
        ...current,
        status: 'REJECTED',
        moderationStatus: 'REJECTED',
        moderationReason: input.reason,
        updatedAt: now,
      };
    } else if (input.action === 'ARCHIVE') {
      updated = { ...current, status: 'ARCHIVED', archivedAt: now, moderationReason: input.reason, updatedAt: now };
    } else {
      updated = { ...current, featured: input.action === 'FEATURE', updatedAt: now };
    }

    this.apps.set(updated.id, updated);

    return updated;
  }

  async createGalleryReport(input: Parameters<ProjectGalleryStore['createGalleryReport']>[0]) {
    const existing = [...this.reports.values()].find(
      (report) => report.galleryAppId === input.galleryAppId && report.reporterUserId === input.reporterUserId,
    );

    if (existing) {
      return { report: existing, created: false };
    }

    const report: GalleryReportRecord = {
      id: `report-${++this._sequence}`,
      galleryAppId: input.galleryAppId,
      reporterUserId: input.reporterUserId,
      reason: input.reason,
      details: input.details,
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    };
    this.reports.set(report.id, report);

    return { report, created: true };
  }

  async listGalleryReports(
    input: Parameters<ProjectGalleryStore['listGalleryReports']>[0],
  ): Promise<GalleryReportPage> {
    return {
      reports: [...this.reports.values()].filter((report) => report.status === input.status).slice(0, input.limit),
    };
  }

  async getGalleryReport(reportId: string) {
    return this.reports.get(reportId);
  }

  async resolveGalleryReport(input: Parameters<ProjectGalleryStore['resolveGalleryReport']>[0]) {
    const current = this.reports.get(input.reportId)!;

    const updated: GalleryReportRecord = {
      ...current,
      status: input.resolution,
      resolutionNote: input.note,
      reviewedByUserId: input.audit.actorUserId,
      reviewedAt: now,
      updatedAt: now,
    };
    this.reports.set(updated.id, updated);

    return updated;
  }

  async claimGalleryRemix(input: Parameters<ProjectGalleryStore['claimGalleryRemix']>[0]) {
    const key = `${input.destinationOrganizationId}:${input.idempotencyKey}`;
    const existing = this.remixes.get(key);

    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        throw new ProjectGalleryError(
          'Idempotency-Key was already used for another request',
          409,
          'IDEMPOTENCY_KEY_REUSED',
        );
      }

      if (existing.status === 'FAILED') {
        const retried: GalleryRemixRecord = { ...existing, status: 'CREATING', errorCode: undefined, updatedAt: now };
        this.remixes.set(key, retried);

        return { remix: retried, claimed: true };
      }

      return { remix: existing, claimed: false };
    }

    const remix: GalleryRemixRecord = {
      id: `remix-${++this._sequence}`,
      ...input,
      status: 'CREATING',
      createdAt: now,
      updatedAt: now,
    };
    this.remixes.set(key, remix);

    return { remix, claimed: true };
  }

  async getGalleryRemixByIdempotency(input: Parameters<ProjectGalleryStore['getGalleryRemixByIdempotency']>[0]) {
    return this.remixes.get(`${input.destinationOrganizationId}:${input.idempotencyKey}`);
  }

  async completeGalleryRemix(input: Parameters<ProjectGalleryStore['completeGalleryRemix']>[0]) {
    const entry = [...this.remixes.entries()].find(([, remix]) => remix.id === input.remixId);

    if (!entry) {
      throw new ProjectGalleryError('Remix not found', 404, 'GALLERY_REMIX_NOT_FOUND');
    }

    const [key, current] = entry;

    const completed: GalleryRemixRecord = {
      ...current,
      destinationProjectId: input.destinationProjectId,
      destinationRepositoryId: input.destinationRepositoryId,
      destinationWorkspaceId: input.destinationWorkspaceId,
      agentAnalysisId: input.agentAnalysisId,
      status: 'READY',
      completedAt: now,
      updatedAt: now,
    };
    this.remixes.set(key, completed);
    this.projectProvenance.set(input.destinationProjectId, {
      sourceGalleryAppId: current.galleryAppId,
      sourceGalleryAppSlug: input.sourceGalleryAppSlug,
    });

    return completed;
  }

  async failGalleryRemix(input: Parameters<ProjectGalleryStore['failGalleryRemix']>[0]) {
    const entry = [...this.remixes.entries()].find(([, remix]) => remix.id === input.remixId)!;

    const failed: GalleryRemixRecord = {
      ...entry[1],
      status: 'FAILED',
      errorCode: input.errorCode,
      failedAt: now,
      updatedAt: now,
    };
    this.remixes.set(entry[0], failed);

    return failed;
  }
}

class TestPublishedApps implements GalleryPublishedAppResolver {
  constructor(
    private readonly _store: TestGalleryStore,
    private readonly _demos: Array<{ app: GalleryAppRecord; version: GalleryAppVersionRecord }>,
  ) {}

  async listPublishedApps(input: Parameters<GalleryPublishedAppResolver['listPublishedApps']>[0]) {
    const allApps = [
      ...this._demos.map((entry) => entry.app),
      ...[...this._store.apps.values()].filter((app) => app.status === 'PUBLISHED'),
    ];
    let apps = allApps;

    if (input.query) {
      const query = input.query.toLowerCase();
      apps = apps.filter((app) => `${app.name} ${app.description}`.toLowerCase().includes(query));
    }

    if (input.category) {
      apps = apps.filter((app) => app.category === input.category);
    }

    if (input.artifactType) {
      apps = apps.filter((app) => app.artifactType === input.artifactType);
    }

    if (input.technology) {
      apps = apps.filter((app) => app.technologies.includes(input.technology!));
    }

    if (input.featured !== undefined) {
      apps = apps.filter((app) => app.featured === input.featured);
    }

    return { apps: apps.slice(0, input.limit), facets: galleryFacetsFromApps(allApps) };
  }

  async resolvePublishedApp(input: { appId?: string; slug?: string }) {
    const demo = this._demos.find(
      (entry) => (input.appId && entry.app.id === input.appId) || (input.slug && entry.app.slug === input.slug),
    );

    if (demo) {
      return demo;
    }

    const app = [...this._store.apps.values()].find(
      (candidate) =>
        candidate.status === 'PUBLISHED' &&
        ((input.appId && candidate.id === input.appId) || (input.slug && candidate.slug === input.slug)),
    );

    if (!app) {
      return undefined;
    }

    const version = this._store.versions.get(app.latestVersionId);

    return version ? { app, version } : undefined;
  }
}

class TestSourceProjects implements GallerySourceProjectService {
  readonly projects = new Map<string, GalleryProjectReference>([
    ['source-1', { id: 'source-1', organizationId: 'org-1' }],
    ['source-2', { id: 'source-2', organizationId: 'org-2' }],
  ]);
  readonly snapshots = new Map<string, GallerySourceSnapshot>([
    ['source-1', sourceSnapshot()],
    ['source-2', sourceSnapshot()],
  ]);
  previewEvidence: GalleryPreviewEvidence = {
    previewUrl: 'https://preview.example.com/community-app',
    checkedAt: now,
    httpStatus: 200,
    rendered: true,
    marker: 'gallery-ready',
  };
  unsupportedRequirement?: string;
  checkedRequirements: GallerySourceSnapshot['dataRequirements'] = [];

  async findProject(projectId: string) {
    return this.projects.get(projectId);
  }

  async loadPublicationSnapshot(input: { projectId: string }) {
    return this.snapshots.get(input.projectId)!;
  }

  async verifyFunctionalPreview(): Promise<GalleryPreviewEvidence> {
    return this.previewEvidence;
  }

  async assertRemixRequirementsSupported(input: { dataRequirements: GallerySourceSnapshot['dataRequirements'] }) {
    this.checkedRequirements = input.dataRequirements;
    if (this.unsupportedRequirement) {
      throw new ProjectGalleryError(
        `Remix isolation is unavailable for ${this.unsupportedRequirement}`,
        422,
        'GALLERY_REMIX_RESOURCE_UNSUPPORTED',
        { resourceKind: this.unsupportedRequirement },
      );
    }
  }
}

class TestRemixProvisioner implements GalleryRemixProvisioner {
  readonly calls: string[] = [];
  written?: Parameters<GalleryRemixProvisioner['writeSourceFiles']>[0];
  projectInput?: Parameters<GalleryRemixProvisioner['createDestinationProject']>[0];
  analysisInput?: Parameters<GalleryRemixProvisioner['enqueueAgentAnalysis']>[0];

  constructor(private readonly _failAt?: string) {}

  private _fail(step: string) {
    if (this._failAt === step) {
      throw Object.assign(new Error('sensitive provider output must not escape'), {
        code: 'WORKSPACE_PROVISION_FAILED',
      });
    }
  }

  async createDestinationProject(input: Parameters<GalleryRemixProvisioner['createDestinationProject']>[0]) {
    this.calls.push('create-project');
    this._fail('create-project');
    this.projectInput = input;

    return { projectId: 'project-remix-1' };
  }

  async createInternalRepository() {
    this.calls.push('create-repository');
    this._fail('create-repository');

    return { repositoryId: 'repo-remix-1' };
  }

  async writeSourceFiles(input: Parameters<GalleryRemixProvisioner['writeSourceFiles']>[0]) {
    this.calls.push('write-files');
    this._fail('write-files');
    this.written = input;
  }

  async createWorkspace() {
    this.calls.push('create-workspace');
    this._fail('create-workspace');

    return { workspaceId: 'workspace-remix-1' };
  }

  async provisionIsolatedDataResources() {
    this.calls.push('provision-data');
    this._fail('provision-data');

    return { dataResourceIds: ['fresh-postgres-1', 'fresh-storage-1'] };
  }

  async regenerateDependencyLocks() {
    this.calls.push('regenerate-locks');
    this._fail('regenerate-locks');
  }

  async initializeGitRepository() {
    this.calls.push('initialize-git');
    this._fail('initialize-git');
  }

  async enqueueAgentAnalysis(input: Parameters<GalleryRemixProvisioner['enqueueAgentAnalysis']>[0]) {
    this.calls.push('queue-agent');
    this._fail('queue-agent');
    this.analysisInput = input;

    return { agentAnalysisId: 'agent-analysis-1' };
  }

  async rollbackRemix() {
    this.calls.push('rollback');
  }
}

async function fixture(options: { allowRemix?: boolean; failAt?: string } = {}) {
  const store = new TestGalleryStore();
  const sourceProjects = new TestSourceProjects();
  const remixProvisioner = new TestRemixProvisioner(options.failAt);
  const demo = publishedDemo(options.allowRemix ?? true);
  const publishedApps = new TestPublishedApps(store, [demo]);
  const app = Fastify({ logger: false });
  appsToClose.push(app);
  await registerProjectGalleryRoutes(app, {
    store,
    sourceProjects,
    remixProvisioner,
    publishedApps,
    async authenticate(request) {
      const header = request.headers['x-user-id'];
      const userId = Array.isArray(header) ? header[0] : header;

      return ['owner-1', 'owner-2', 'moderator'].includes(userId ?? '') ? { userId: userId! } : null;
    },
    async authorizeOrganization({ userId, organizationId }) {
      return (
        (userId === 'owner-1' && organizationId === 'org-1') || (userId === 'owner-2' && organizationId === 'org-2')
      );
    },
    async authorizeModeration({ userId }) {
      return userId === 'moderator';
    },
    consumeRateLimit() {
      return Promise.resolve();
    },
  });

  return { app, store, sourceProjects, remixProvisioner, demo };
}

function publicationBody(sourceProjectId = 'source-1') {
  return {
    sourceProjectId,
    name: 'Sales Operations Hub',
    description: 'A complete sales dashboard ready to remix.',
    artifactType: 'DASHBOARD',
    category: 'business',
    technologies: ['react', 'typescript'],
    tags: ['sales'],
    thumbnailUrl: 'https://cdn.example.com/gallery/sales.png',
    visibility: 'PUBLIC',
    allowRemix: true,
  };
}

describe('Gallery immutable snapshot boundary', () => {
  it('removes creator secrets, generated locks and runtime data while preserving only secret names', () => {
    const snapshot = prepareGallerySnapshot(sourceSnapshot());
    const paths = snapshot.files.map((file) => file.path);
    const content = snapshot.files.map((file) => file.content).join('\n');

    expect(paths).not.toEqual(
      expect.arrayContaining(['.env', 'pnpm-lock.yaml', 'data.sqlite', 'uploads/customer.csv']),
    );
    expect(paths).toEqual(expect.arrayContaining(['package.json', 'src/main.ts', '.env.example']));
    expect(content).not.toContain('creator-secret');
    expect(content).not.toContain('creator-key-value');
    expect(content).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(content).not.toContain('creator:password');
    expect(snapshot.runtime.requiredSecretNames).toEqual(['DATABASE_URL', 'OPENAI_API_KEY']);
    expect(snapshot.removedPaths).toEqual(
      expect.arrayContaining(['.env', 'data.sqlite', 'pnpm-lock.yaml', 'uploads/customer.csv']),
    );
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects path traversal and unsupported Python/Go/Rust source', () => {
    expect(() =>
      prepareGallerySnapshot(sourceSnapshot({ files: [{ path: '../escape.ts', content: 'export {}' }] })),
    ).toThrowError(expect.objectContaining({ code: 'GALLERY_UNSAFE_PATH' }));

    for (const file of ['server.py', 'main.go', 'src/main.rs']) {
      expect(() =>
        prepareGallerySnapshot(
          sourceSnapshot({
            files: [
              { path: 'index.ts', content: 'export {}' },
              { path: file, content: 'unsafe' },
            ],
          }),
        ),
      ).toThrowError(expect.objectContaining({ code: 'GALLERY_RUNTIME_NOT_SUPPORTED' }));
    }
  });

  it('redacts text secrets hidden behind base64 while preserving real binary files', () => {
    const binary = Buffer.from([0, 255, 12, 0, 128]);
    const snapshot = prepareGallerySnapshot(
      sourceSnapshot({
        files: [
          { path: 'index.html', content: '<main>Safe app</main>' },
          {
            path: 'src/config.ts',
            content: Buffer.from('export const API_TOKEN = "creator-base64-secret";').toString('base64'),
            encoding: 'base64',
          },
          { path: 'public/logo.bin', content: binary.toString('base64'), encoding: 'base64' },
        ],
      }),
    );
    const config = snapshot.files.find((file) => file.path === 'src/config.ts');
    const logo = snapshot.files.find((file) => file.path === 'public/logo.bin');

    expect(Buffer.from(config?.content ?? '', 'base64').toString('utf8')).toContain('API_TOKEN = "<redacted>"');
    expect(Buffer.from(logo?.content ?? '', 'base64')).toEqual(binary);
    expect(JSON.stringify(snapshot)).not.toContain('creator-base64-secret');
    expect(snapshot.redactedValueCount).toBeGreaterThan(0);
  });
});

describe('Gallery publication, moderation and tenant isolation', () => {
  it('requires auth, hides cross-tenant resources, verifies preview, moderates and reports a published app', async () => {
    const { app, store } = await fixture();
    const createUrl = '/organizations/org-1/gallery/apps';

    const unauthenticated = await app.inject({ method: 'POST', url: createUrl, payload: publicationBody() });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json().code).toBe('AUTHENTICATION_REQUIRED');

    const crossTenant = await app.inject({
      method: 'POST',
      url: createUrl,
      headers: { 'x-user-id': 'owner-2' },
      payload: publicationBody(),
    });
    expect(crossTenant.statusCode).toBe(404);
    expect(crossTenant.json().code).toBe('GALLERY_APP_NOT_FOUND');

    const foreignSource = await app.inject({
      method: 'POST',
      url: createUrl,
      headers: { 'x-user-id': 'owner-1' },
      payload: publicationBody('source-2'),
    });
    expect(foreignSource.statusCode).toBe(404);
    expect(foreignSource.json().code).toBe('PROJECT_NOT_FOUND');

    const created = await app.inject({
      method: 'POST',
      url: createUrl,
      headers: { 'x-user-id': 'owner-1' },
      payload: publicationBody(),
    });
    expect(created.statusCode).toBe(201);

    const galleryAppId = created.json().app.id as string;
    expect(created.json()).toMatchObject({
      app: { status: 'DRAFT', moderationStatus: 'NOT_SUBMITTED', allowRemix: true },
      version: { version: 1 },
    });
    expect(created.json().version.files.map((file: { path: string }) => file.path)).not.toContain('.env');

    const hiddenTenantDetail = await app.inject({
      method: 'PATCH',
      url: `/organizations/org-2/gallery/apps/${galleryAppId}`,
      headers: { 'x-user-id': 'owner-2' },
      payload: { allowRemix: false },
    });
    expect(hiddenTenantDetail.statusCode).toBe(404);

    const submitted = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}/submit`,
      headers: { 'x-user-id': 'owner-1' },
      payload: {},
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().app).toMatchObject({
      status: 'PENDING_REVIEW',
      moderationStatus: 'PENDING',
      previewStatus: 'VERIFIED',
      previewUrl: 'https://preview.example.com/community-app',
    });

    const nonModerator = await app.inject({
      method: 'POST',
      url: `/admin/gallery/apps/${galleryAppId}/moderate`,
      headers: { 'x-user-id': 'owner-1' },
      payload: { action: 'APPROVE', functionalPreviewConfirmed: true },
    });
    expect(nonModerator.statusCode).toBe(403);

    const confirmationMissing = await app.inject({
      method: 'POST',
      url: `/admin/gallery/apps/${galleryAppId}/moderate`,
      headers: { 'x-user-id': 'moderator' },
      payload: { action: 'APPROVE' },
    });
    expect(confirmationMissing.statusCode).toBe(400);
    expect(confirmationMissing.json().code).toBe('GALLERY_FUNCTIONAL_PREVIEW_CONFIRMATION_REQUIRED');

    const confirmationFalse = await app.inject({
      method: 'POST',
      url: `/admin/gallery/apps/${galleryAppId}/moderate`,
      headers: { 'x-user-id': 'moderator' },
      payload: { action: 'APPROVE', functionalPreviewConfirmed: false },
    });
    expect(confirmationFalse.statusCode).toBe(400);
    expect(confirmationFalse.json().code).toBe('GALLERY_FUNCTIONAL_PREVIEW_CONFIRMATION_REQUIRED');

    const approved = await app.inject({
      method: 'POST',
      url: `/admin/gallery/apps/${galleryAppId}/moderate`,
      headers: { 'x-user-id': 'moderator' },
      payload: { action: 'APPROVE', functionalPreviewConfirmed: true },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().app).toMatchObject({ status: 'PUBLISHED', moderationStatus: 'APPROVED' });

    const forbiddenPublishedEdit = await app.inject({
      method: 'PATCH',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}`,
      headers: { 'x-user-id': 'owner-1' },
      payload: { description: 'Editorial content changed after approval.' },
    });
    expect(forbiddenPublishedEdit.statusCode).toBe(409);
    expect(forbiddenPublishedEdit.json().code).toBe('GALLERY_STATE_CONFLICT');
    expect(store.apps.get(galleryAppId)?.description).toBe('A complete sales dashboard ready to remix.');

    const publicList = await app.inject({
      method: 'GET',
      url: '/gallery/apps?category=business&artifactType=DASHBOARD&technology=typescript&sort=RECENT',
    });
    expect(publicList.statusCode).toBe(200);
    expect(publicList.json().apps.map((entry: { id: string }) => entry.id)).toContain(galleryAppId);
    expect(publicList.json().facets).toMatchObject({
      artifactTypes: expect.arrayContaining(['DASHBOARD']),
      categories: expect.arrayContaining(['business']),
      technologies: expect.arrayContaining(['typescript']),
    });
    expect(publicList.json().apps.find((entry: { id: string }) => entry.id === galleryAppId)).not.toHaveProperty(
      'sourceProjectId',
    );

    const report = await app.inject({
      method: 'POST',
      url: `/gallery/apps/${galleryAppId}/reports`,
      headers: { 'x-user-id': 'owner-2' },
      payload: { reason: 'SPAM', details: 'Repeated misleading content.' },
    });
    expect(report.statusCode).toBe(201);
    expect(report.json().report).toMatchObject({ galleryAppId, reporterUserId: 'owner-2', status: 'OPEN' });
    expect(store.reports).toHaveLength(1);
  });

  it('rejects spoofed moderation fields and non-HTTPS thumbnails at validation', async () => {
    const { app, store } = await fixture();

    for (const payload of [
      { ...publicationBody(), featured: true },
      { ...publicationBody(), moderationStatus: 'APPROVED' },
      { ...publicationBody(), thumbnailUrl: 'http://cdn.example.com/sales.png' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/organizations/org-1/gallery/apps',
        headers: { 'x-user-id': 'owner-1' },
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('GALLERY_VALIDATION_FAILED');
    }

    expect(store.apps).toHaveLength(0);
  });

  it('keeps the publication in draft when its real preview does not render', async () => {
    const { app, sourceProjects, store } = await fixture();

    const created = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/gallery/apps',
      headers: { 'x-user-id': 'owner-1' },
      payload: publicationBody(),
    });

    const galleryAppId = created.json().app.id as string;
    sourceProjects.previewEvidence = {
      previewUrl: 'https://preview.example.com/blank',
      checkedAt: now,
      httpStatus: 200,
      rendered: false,
    };

    const submit = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}/submit`,
      headers: { 'x-user-id': 'owner-1' },
      payload: {},
    });

    expect(submit.statusCode).toBe(422);
    expect(submit.json().code).toBe('GALLERY_PREVIEW_NOT_FUNCTIONAL');
    expect(store.apps.get(galleryAppId)).toMatchObject({ status: 'DRAFT', previewStatus: 'PENDING' });
  });

  it('returns recoverable preview-probe diagnostics without changing the draft state', async () => {
    const { app, sourceProjects, store } = await fixture();

    const created = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/gallery/apps',
      headers: { 'x-user-id': 'owner-1' },
      payload: publicationBody(),
    });
    const galleryAppId = created.json().app.id as string;

    sourceProjects.verifyFunctionalPreview = async () => {
      throw new ProjectGalleryError(
        'The published preview references a script or stylesheet that is unavailable',
        422,
        'GALLERY_PREVIEW_ASSET_UNAVAILABLE',
        {
          recoverable: true,
          stage: 'asset',
          assetType: 'script',
          assetPath: '/assets/app.js',
          httpStatus: 404,
        },
      );
    };

    const submit = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}/submit`,
      headers: { 'x-user-id': 'owner-1' },
      payload: {},
    });

    expect(submit.statusCode).toBe(422);
    expect(submit.json()).toMatchObject({
      code: 'GALLERY_PREVIEW_ASSET_UNAVAILABLE',
      details: {
        recoverable: true,
        stage: 'asset',
        assetType: 'script',
        assetPath: '/assets/app.js',
        httpStatus: 404,
      },
    });
    expect(store.apps.get(galleryAppId)).toMatchObject({ status: 'DRAFT', previewStatus: 'PENDING' });
  });

  it('creates immutable incremented snapshots, resets rejected moderation, and permits resubmission', async () => {
    const { app, sourceProjects, store } = await fixture();
    const created = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/gallery/apps',
      headers: { 'x-user-id': 'owner-1' },
      payload: publicationBody(),
    });
    const galleryAppId = created.json().app.id as string;

    const unchanged = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}/versions`,
      headers: { 'x-user-id': 'owner-1' },
      payload: {},
    });
    expect(unchanged.statusCode).toBe(409);
    expect(unchanged.json().code).toBe('GALLERY_SNAPSHOT_UNCHANGED');

    sourceProjects.snapshots.set(
      'source-1',
      sourceSnapshot({
        files: [...sourceSnapshot().files, { path: 'src/version-two.ts', content: 'export const version = 2;' }],
      }),
    );
    const versionTwo = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}/versions`,
      headers: { 'x-user-id': 'owner-1' },
      payload: {},
    });
    expect(versionTwo.statusCode).toBe(201);
    expect(versionTwo.json()).toMatchObject({
      app: {
        status: 'DRAFT',
        moderationStatus: 'NOT_SUBMITTED',
        previewStatus: 'PENDING',
      },
      version: { version: 2, createdByUserId: 'owner-1' },
    });
    expect(versionTwo.json().app.latestVersionId).toBe(versionTwo.json().version.id);

    const submitted = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}/submit`,
      headers: { 'x-user-id': 'owner-1' },
      payload: {},
    });
    expect(submitted.statusCode).toBe(200);
    const rejected = await app.inject({
      method: 'POST',
      url: `/admin/gallery/apps/${galleryAppId}/moderate`,
      headers: { 'x-user-id': 'moderator' },
      payload: { action: 'REJECT', reason: 'Please fix the navigation.' },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().app).toMatchObject({ status: 'REJECTED', moderationStatus: 'REJECTED' });

    sourceProjects.snapshots.set(
      'source-1',
      sourceSnapshot({
        files: [...sourceSnapshot().files, { path: 'src/version-three.ts', content: 'export const version = 3;' }],
      }),
    );
    const versionThree = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}/versions`,
      headers: { 'x-user-id': 'owner-1' },
      payload: {},
    });
    expect(versionThree.statusCode).toBe(201);
    expect(versionThree.json()).toMatchObject({
      app: {
        status: 'DRAFT',
        moderationStatus: 'NOT_SUBMITTED',
        previewStatus: 'PENDING',
      },
      version: { version: 3 },
    });
    expect(versionThree.json().app).not.toHaveProperty('previewUrl');
    expect(versionThree.json().app).not.toHaveProperty('moderationReason');

    const resubmitted = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}/submit`,
      headers: { 'x-user-id': 'owner-1' },
      payload: {},
    });
    expect(resubmitted.statusCode).toBe(200);
    expect(resubmitted.json().app).toMatchObject({ status: 'PENDING_REVIEW', moderationStatus: 'PENDING' });
    expect(store.versions.get(versionThree.json().version.id)?.version).toBe(3);
  });

  it('validates resnapshot bodies and blocks unsupported remix resource isolation before review', async () => {
    const { app, sourceProjects, store } = await fixture();
    const created = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/gallery/apps',
      headers: { 'x-user-id': 'owner-1' },
      payload: publicationBody(),
    });
    const galleryAppId = created.json().app.id as string;

    const invalidResnapshot = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}/versions`,
      headers: { 'x-user-id': 'owner-1' },
      payload: { sourceProjectId: 'source-2' },
    });
    expect(invalidResnapshot.statusCode).toBe(400);
    expect(invalidResnapshot.json().code).toBe('GALLERY_VALIDATION_FAILED');
    expect([...store.versions.values()].filter((version) => version.galleryAppId === galleryAppId)).toHaveLength(1);

    sourceProjects.unsupportedRequirement = 'OBJECT_STORAGE';
    const submit = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}/submit`,
      headers: { 'x-user-id': 'owner-1' },
      payload: {},
    });
    expect(submit.statusCode).toBe(422);
    expect(submit.json()).toMatchObject({
      code: 'GALLERY_REMIX_RESOURCE_UNSUPPORTED',
      details: { resourceKind: 'OBJECT_STORAGE' },
    });
    expect(sourceProjects.checkedRequirements).toEqual(
      expect.arrayContaining([{ key: 'assets', kind: 'OBJECT_STORAGE', required: true }]),
    );
    expect(store.apps.get(galleryAppId)).toMatchObject({
      status: 'DRAFT',
      moderationStatus: 'NOT_SUBMITTED',
      previewStatus: 'PENDING',
    });

    sourceProjects.unsupportedRequirement = undefined;
    const submitted = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/gallery/apps/${galleryAppId}/submit`,
      headers: { 'x-user-id': 'owner-1' },
      payload: {},
    });
    expect(submitted.statusCode).toBe(200);

    sourceProjects.unsupportedRequirement = 'REDIS';
    const approval = await app.inject({
      method: 'POST',
      url: `/admin/gallery/apps/${galleryAppId}/moderate`,
      headers: { 'x-user-id': 'moderator' },
      payload: { action: 'APPROVE', functionalPreviewConfirmed: true },
    });
    expect(approval.statusCode).toBe(422);
    expect(approval.json()).toMatchObject({
      code: 'GALLERY_REMIX_RESOURCE_UNSUPPORTED',
      details: { resourceKind: 'REDIS' },
    });
    expect(store.apps.get(galleryAppId)).toMatchObject({
      status: 'PENDING_REVIEW',
      moderationStatus: 'PENDING',
    });
  });
});

describe('Gallery Remix saga', () => {
  it('creates isolated project/git/workspace/data/locks, queues Agent, and replays idempotently', async () => {
    const { app, remixProvisioner } = await fixture();

    const request = {
      method: 'POST' as const,
      url: '/organizations/org-1/gallery/apps/demo:crm/remix',
      headers: { 'x-user-id': 'owner-1', 'idempotency-key': 'remix-crm-0001' },
      payload: { name: 'My Customer Hub', slug: 'my-customer-hub' },
    };

    const created = await app.inject(request);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      remix: {
        galleryAppId: 'demo:crm',
        galleryAppVersionId: 'demo:crm:v1',
        destinationOrganizationId: 'org-1',
        destinationOwnerUserId: 'owner-1',
        destinationProjectId: 'project-remix-1',
        destinationRepositoryId: 'repo-remix-1',
        destinationWorkspaceId: 'workspace-remix-1',
        agentAnalysisId: 'agent-analysis-1',
        status: 'READY',
      },
      missingSecretNames: ['DATABASE_URL', 'OPENAI_API_KEY'],
      source: { appId: 'demo:crm', url: '/gallery/apps/customer-command-center' },
    });
    expect(remixProvisioner.calls).toEqual([
      'create-project',
      'create-repository',
      'write-files',
      'create-workspace',
      'provision-data',
      'regenerate-locks',
      'initialize-git',
      'queue-agent',
    ]);
    expect(remixProvisioner.projectInput).toMatchObject({
      organizationId: 'org-1',
      ownerUserId: 'owner-1',
      sourceType: 'remix',
      provenance: { sourceGalleryAppId: 'demo:crm', sourceGalleryAppVersionId: 'demo:crm:v1' },
    });
    expect(remixProvisioner.written?.files.map((file) => file.path)).not.toEqual(
      expect.arrayContaining(['.env', 'pnpm-lock.yaml', 'data.sqlite', 'uploads/customer.csv']),
    );
    expect(remixProvisioner.written?.files.map((file) => file.content).join('\n')).not.toContain('creator-key-value');
    expect(remixProvisioner.analysisInput?.missingSecretNames).toEqual(['DATABASE_URL', 'OPENAI_API_KEY']);

    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(remixProvisioner.calls).toHaveLength(8);

    const conflict = await app.inject({ ...request, payload: { name: 'Different app' } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(remixProvisioner.calls).toHaveLength(8);
  });

  it('preserves READY remix provenance when the remixed project is published again', async () => {
    const { app, sourceProjects } = await fixture();
    const remixed = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/gallery/apps/demo:crm/remix',
      headers: { 'x-user-id': 'owner-1', 'idempotency-key': 'remix-provenance-0001' },
      payload: { name: 'Derived Customer Hub' },
    });
    expect(remixed.statusCode).toBe(201);

    sourceProjects.projects.set('project-remix-1', { id: 'project-remix-1', organizationId: 'org-1' });
    sourceProjects.snapshots.set('project-remix-1', sourceSnapshot());
    const publishedCopy = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/gallery/apps',
      headers: { 'x-user-id': 'owner-1' },
      payload: publicationBody('project-remix-1'),
    });

    expect(publishedCopy.statusCode).toBe(201);
    expect(publishedCopy.json().app.provenance).toEqual({
      sourceGalleryAppId: 'demo:crm',
      sourceGalleryAppSlug: 'customer-command-center',
    });
  });

  it('blocks cross-tenant and publisher-disabled remix before provisioning', async () => {
    const enabled = await fixture();

    const crossTenant = await enabled.app.inject({
      method: 'POST',
      url: '/organizations/org-1/gallery/apps/demo:crm/remix',
      headers: { 'x-user-id': 'owner-2', 'idempotency-key': 'cross-tenant-0001' },
      payload: { name: 'Forbidden copy' },
    });
    expect(crossTenant.statusCode).toBe(404);
    expect(enabled.remixProvisioner.calls).toHaveLength(0);

    const disabled = await fixture({ allowRemix: false });

    const denied = await disabled.app.inject({
      method: 'POST',
      url: '/organizations/org-1/gallery/apps/demo:crm/remix',
      headers: { 'x-user-id': 'owner-1', 'idempotency-key': 'disabled-remix-0001' },
      payload: { name: 'Disabled copy' },
    });
    expect(denied.statusCode).toBe(409);
    expect(denied.json().code).toBe('GALLERY_REMIX_DISABLED');
    expect(disabled.remixProvisioner.calls).toHaveLength(0);
  });

  it('compensates partial resources and records a retryable failure without leaking provider output', async () => {
    const { app, store, remixProvisioner } = await fixture({ failAt: 'create-workspace' });

    const failed = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/gallery/apps/demo:crm/remix',
      headers: { 'x-user-id': 'owner-1', 'idempotency-key': 'remix-failure-0001' },
      payload: { name: 'Recoverable remix' },
    });

    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toMatchObject({
      error: 'Unable to process Gallery request',
      code: 'WORKSPACE_PROVISION_FAILED',
    });
    expect(JSON.stringify(failed.json())).not.toContain('sensitive provider output');
    expect(remixProvisioner.calls).toEqual([
      'create-project',
      'create-repository',
      'write-files',
      'create-workspace',
      'rollback',
    ]);
    expect([...store.remixes.values()][0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'WORKSPACE_PROVISION_FAILED',
    });
  });
});
