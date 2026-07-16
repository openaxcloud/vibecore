import { createHash } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PROJECT_IMPORT_HUB_SOURCES,
  ProjectImportHubError,
  registerProjectImportHubRoutes,
  type ProjectImportHubOptions,
} from './project-import-hub.js';
import type { CreateProjectImportJobInput, ProjectImportJobRecord, UpdateProjectImportJobInput } from './store.js';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function now() {
  return new Date().toISOString();
}

class ImportJobStore {
  readonly jobs = new Map<string, ProjectImportJobRecord>();
  #nextId = 1;

  async withSerializedMutation<T>(_key: string, operation: () => Promise<T>): Promise<T> {
    return operation();
  }

  async createProjectImportJob(input: CreateProjectImportJobInput): Promise<ProjectImportJobRecord> {
    const existing = await this.getProjectImportJobByIdempotency(input);

    if (existing) {
      if (
        existing.userId !== input.userId ||
        existing.source !== input.source ||
        existing.requestHash !== input.requestHash
      ) {
        throw new ProjectImportHubError('Idempotency key conflict', 409, 'IDEMPOTENCY_KEY_REUSED');
      }
      return existing;
    }

    const timestamp = now();
    const job: ProjectImportJobRecord = {
      id: `import-${this.#nextId++}`,
      organizationId: input.organizationId,
      userId: input.userId,
      source: input.source,
      status: 'VALIDATING',
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      sourceReference: input.sourceReference,
      sourceLabel: input.sourceLabel,
      stage: input.stage,
      progress: input.progress ?? 0,
      validation: structuredClone(input.validation ?? {}),
      runtimeDetection: structuredClone(input.runtimeDetection ?? {}),
      missingSecretNames: [...(input.missingSecretNames ?? [])],
      generatedConfig: structuredClone(input.generatedConfig ?? []),
      preview: structuredClone(input.preview ?? {}),
      usesAgent: input.usesAgent ?? false,
      creditsDisclosure: input.creditsDisclosure,
      recoverable: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.jobs.set(job.id, job);
    return structuredClone(job);
  }

  async getProjectImportJob(input: { importJobId: string; organizationId: string }) {
    const job = this.jobs.get(input.importJobId);
    return job?.organizationId === input.organizationId ? structuredClone(job) : undefined;
  }

  async getProjectImportJobByIdempotency(input: { organizationId: string; idempotencyKey: string }) {
    const job = [...this.jobs.values()].find(
      (candidate) =>
        candidate.organizationId === input.organizationId && candidate.idempotencyKey === input.idempotencyKey,
    );
    return job ? structuredClone(job) : undefined;
  }

  async updateProjectImportJob(input: UpdateProjectImportJobInput): Promise<ProjectImportJobRecord> {
    const job = this.jobs.get(input.importJobId);
    if (!job || job.organizationId !== input.organizationId) {
      throw new ProjectImportHubError('Import not found', 404, 'PROJECT_IMPORT_NOT_FOUND');
    }

    const updated: ProjectImportJobRecord = {
      ...job,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.stage === undefined ? {} : { stage: input.stage }),
      ...(input.progress === undefined ? {} : { progress: input.progress }),
      ...(input.validation === undefined ? {} : { validation: structuredClone(input.validation) }),
      ...(input.runtimeDetection === undefined ? {} : { runtimeDetection: structuredClone(input.runtimeDetection) }),
      ...(input.missingSecretNames === undefined ? {} : { missingSecretNames: [...input.missingSecretNames] }),
      ...(input.generatedConfig === undefined ? {} : { generatedConfig: structuredClone(input.generatedConfig) }),
      ...(input.preview === undefined ? {} : { preview: structuredClone(input.preview) }),
      ...(input.destinationProjectId === undefined
        ? {}
        : { destinationProjectId: input.destinationProjectId ?? undefined }),
      ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode ?? undefined }),
      ...(input.errorMessage === undefined ? {} : { errorMessage: input.errorMessage ?? undefined }),
      ...(input.recoverable === undefined ? {} : { recoverable: input.recoverable }),
      ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt ?? undefined }),
      ...(input.failedAt === undefined ? {} : { failedAt: input.failedAt ?? undefined }),
      ...(input.canceledAt === undefined ? {} : { canceledAt: input.canceledAt ?? undefined }),
      updatedAt: now(),
    };
    this.jobs.set(updated.id, updated);
    return structuredClone(updated);
  }

  async listProjectImportJobs(organizationId: string, limit = 25) {
    return [...this.jobs.values()]
      .filter((job) => job.organizationId === organizationId)
      .slice(0, limit)
      .map((job) => structuredClone(job));
  }
}

function githubInput(branch = 'main') {
  return {
    repositoryUrl: 'https://replit.com/github.com/openaxcloud/example-app',
    branch,
    name: 'Example app',
    slug: 'example-app',
  };
}

function directInspection() {
  return {
    files: [
      {
        path: 'package.json',
        content: JSON.stringify({
          scripts: { start: 'RUNTIME_TOKEN=creator-runtime-secret node server.js' },
          dependencies: { express: '^5.1.0' },
        }),
      },
      { path: 'server.js', content: 'console.log(process.env.DATABASE_URL);' },
      { path: '.env', content: 'PRIVATE_TOKEN=creator-value-that-must-never-leave\n' },
      { path: 'backup.sql', content: "INSERT INTO users VALUES ('private-data');" },
      { path: 'package-lock.json', content: '{}' },
    ],
    validation: { reachable: true, providerStatus: 200 },
    preview: { kind: 'source-manifest', canCreate: true },
  };
}

async function createFixture() {
  const store = new ImportJobStore();
  const inspections: Array<Parameters<ProjectImportHubOptions['inspectSource']>[0]> = [];
  const materializations: Array<Parameters<ProjectImportHubOptions['materializeImport']>[0]> = [];
  let inspectionFailuresRemaining = 0;
  let materializationFailuresRemaining = 0;
  const app = Fastify({ logger: false });
  apps.push(app);

  await registerProjectImportHubRoutes(app, {
    store,
    async authenticate(request) {
      const raw = request.headers['x-user-id'];
      const userId = Array.isArray(raw) ? raw[0] : raw;
      return userId ? { userId } : null;
    },
    async authorizeOrganization({ userId, organizationId }) {
      return userId === 'owner' && organizationId === 'org-1';
    },
    async inspectSource(input) {
      inspections.push(input);
      if (inspectionFailuresRemaining > 0) {
        inspectionFailuresRemaining -= 1;
        throw new ProjectImportHubError('Provider temporarily unavailable', 503, 'PROVIDER_UNAVAILABLE', true);
      }
      if (input.source === 'figma') {
        return { files: [], validation: { fileAccessible: true }, preview: { kind: 'figma-frame', frameCount: 3 } };
      }
      return directInspection();
    },
    async materializeImport(input) {
      materializations.push(input);
      if (materializationFailuresRemaining > 0) {
        materializationFailuresRemaining -= 1;
        throw new ProjectImportHubError('Workspace is temporarily unavailable', 503, 'WORKSPACE_UNAVAILABLE', true);
      }
      return {
        projectId: `project-${materializations.length}`,
        metadata: {
          workspaceId: `workspace-${materializations.length}`,
          repositoryId: `repository-${materializations.length}`,
          previewUrl: 'https://preview.example.com/app',
          publishable: true,
        },
      };
    },
  });

  return {
    app,
    store,
    inspections,
    materializations,
    failNextInspections(count = 1) {
      inspectionFailuresRemaining = count;
    },
    failNextMaterializations(count = 1) {
      materializationFailuresRemaining = count;
    },
  };
}

function upload(fileName: string, content: Buffer, mediaType: string) {
  return {
    fileName,
    contentBase64: content.toString('base64'),
    sizeBytes: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
    mediaType,
  };
}

describe('project import hub source contract', () => {
  it('exposes exactly the twelve current sources and never exposes screenshot as a provider', () => {
    expect(PROJECT_IMPORT_HUB_SOURCES).toEqual([
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
    ]);
    expect(PROJECT_IMPORT_HUB_SOURCES).not.toContain('screenshot');
  });

  it('normalizes the Replit GitHub express URL and persists diagnostics without payload, secrets, or database data', async () => {
    const { app, store, inspections } = await createFixture();
    const response = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: { 'x-user-id': 'owner', 'idempotency-key': 'github-preflight-0001' },
      payload: { source: 'github', input: githubInput() },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().job).toMatchObject({
      source: 'github',
      status: 'READY',
      stage: 'ready',
      progress: 45,
      sourceReference: 'https://github.com/openaxcloud/example-app',
      runtimeDetection: { runtime: 'node', framework: 'express', status: 'ready' },
      missingSecretNames: ['DATABASE_URL', 'PRIVATE_TOKEN', 'RUNTIME_TOKEN'],
      usesAgent: false,
    });
    expect(response.json().job.generatedConfig).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '.vibecore/runtime.json' })]),
    );
    expect(inspections[0]?.input.repositoryUrl).toBe('https://github.com/openaxcloud/example-app');

    const persisted = JSON.stringify([...store.jobs.values()]);
    expect(persisted).not.toContain('creator-value-that-must-never-leave');
    expect(persisted).not.toContain('creator-runtime-secret');
    expect(persisted).not.toContain('private-data');
    expect(persisted).not.toContain('contentBase64');
    expect(response.json().job).not.toHaveProperty('requestHash');
    expect(response.json().job).not.toHaveProperty('idempotencyKey');
  });

  it('maps previous-agent-export to the internal source without accepting the stale public id', async () => {
    const { app, store } = await createFixture();
    const content = Buffer.from('{"files":[]}');
    const valid = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: { 'x-user-id': 'owner', 'idempotency-key': 'previous-agent-0001' },
      payload: {
        source: 'previous-agent-export',
        input: { file: upload('agent-export.json', content, 'application/json'), name: 'Imported agent app' },
      },
    });

    expect(valid.statusCode).toBe(201);
    expect(valid.json().job.source).toBe('previous-agent-export');
    expect([...store.jobs.values()][0]?.source).toBe('previous-agent');

    const stale = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: { 'x-user-id': 'owner', 'idempotency-key': 'previous-agent-0002' },
      payload: { source: 'previous-agent', input: {} },
    });
    expect(stale.statusCode).toBe(400);
    expect(stale.json().code).toBe('PROJECT_IMPORT_VALIDATION_FAILED');
  });

  it('accepts every hosted connector only on its selected provider domain', async () => {
    const { app } = await createFixture();
    const cases = [
      ['bitbucket', { repositoryUrl: 'https://bitbucket.org/workspace/example-app', name: 'Bitbucket app' }],
      ['vercel', { sourceUrl: 'https://vercel.com/team/example-app', name: 'Vercel app' }],
      ['figma', { sourceUrl: 'https://figma.com/design/AbCdEf/Example-App', name: 'Figma app' }],
      ['claude', { sourceUrl: 'https://claude.ai/artifacts/example-app', name: 'Claude app' }],
      ['bolt', { sourceUrl: 'https://bolt.new/example-app', name: 'Bolt app' }],
      ['lovable', { sourceUrl: 'https://lovable.dev/projects/example-app', name: 'Lovable app' }],
      ['base44', { sourceUrl: 'https://app.base44.com/apps/example-app', name: 'Base44 app' }],
      [
        'spreadsheet',
        {
          kind: 'google-sheets',
          sourceUrl: 'https://docs.google.com/spreadsheets/d/AbCdEf123/edit?gid=0',
          name: 'Spreadsheet app',
        },
      ],
    ] as const;

    for (const [index, [source, input]] of cases.entries()) {
      const response = await app.inject({
        method: 'POST',
        url: '/organizations/org-1/project-imports/preflight',
        headers: { 'x-user-id': 'owner', 'idempotency-key': `hosted-source-${index}` },
        payload: { source, input },
      });
      expect(response.statusCode, `${source}: ${response.body}`).toBe(201);
      expect(response.json().job.source).toBe(source);
    }
  });
});

describe('project import hub two-phase creation', () => {
  it('verifies the preflight hash, materializes once, and replays a completed create idempotently', async () => {
    const { app, materializations } = await createFixture();
    const auth = { 'x-user-id': 'owner', 'idempotency-key': 'github-create-0001' };
    const preflight = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: auth,
      payload: { source: 'github', input: githubInput() },
    });
    const jobId = preflight.json().job.id as string;

    const mismatch = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/project-imports/${jobId}/create`,
      headers: { 'x-user-id': 'owner' },
      payload: { input: githubInput('develop') },
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json().code).toBe('PROJECT_IMPORT_PREFLIGHT_HASH_MISMATCH');
    expect(materializations).toHaveLength(0);

    const created = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/project-imports/${jobId}/create`,
      headers: { 'x-user-id': 'owner' },
      payload: { input: githubInput() },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      projectId: 'project-1',
      job: { status: 'COMPLETE', stage: 'complete', progress: 100, projectId: 'project-1' },
      metadata: { workspaceId: 'workspace-1', repositoryId: 'repository-1', publishable: true },
    });
    expect(materializations).toHaveLength(1);
    expect(materializations[0]).toMatchObject({
      source: 'github',
      materializationKey: `project-import:${jobId}`,
      policy: {
        copySecretValues: false,
        copyDatabaseData: false,
        allowSpreadsheetSeedData: false,
        useAgent: false,
        scaffold: true,
      },
    });

    const replay = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/project-imports/${jobId}/create`,
      headers: { 'x-user-id': 'owner' },
      payload: { input: githubInput() },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.json().projectId).toBe('project-1');
    expect(materializations).toHaveLength(1);
  });

  it('marks provider failures as recoverable and requires a hash-matched retry before creation', async () => {
    const { app, failNextInspections } = await createFixture();
    failNextInspections();
    const failed = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: { 'x-user-id': 'owner', 'idempotency-key': 'retry-provider-0001' },
      payload: { source: 'github', input: githubInput() },
    });

    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      recoverable: true,
      job: { status: 'FAILED', stage: 'validation.failed', recoverable: true },
    });
    const jobId = failed.json().job.id as string;

    const wrongRetry = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/project-imports/${jobId}/retry`,
      headers: { 'x-user-id': 'owner' },
      payload: { input: githubInput('other') },
    });
    expect(wrongRetry.statusCode).toBe(409);
    expect(wrongRetry.json().code).toBe('PROJECT_IMPORT_PREFLIGHT_HASH_MISMATCH');

    const retried = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/project-imports/${jobId}/retry`,
      headers: { 'x-user-id': 'owner' },
      payload: { input: githubInput() },
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().job).toMatchObject({ status: 'READY', stage: 'ready', recoverable: false });
  });

  it('surfaces a recoverable materialization failure without creating a second job', async () => {
    const { app, store, failNextMaterializations } = await createFixture();
    const preflight = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: { 'x-user-id': 'owner', 'idempotency-key': 'retry-create-0001' },
      payload: { source: 'github', input: githubInput() },
    });
    const jobId = preflight.json().job.id as string;
    failNextMaterializations();
    const failed = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/project-imports/${jobId}/create`,
      headers: { 'x-user-id': 'owner' },
      payload: { input: githubInput() },
    });

    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toMatchObject({
      code: 'WORKSPACE_UNAVAILABLE',
      recoverable: true,
      job: { id: jobId, status: 'FAILED', stage: 'creation.failed' },
    });
    expect(store.jobs).toHaveLength(1);
  });
});

describe('project import hub validation and security', () => {
  it('validates upload filename, canonical base64, byte length, digest, and provider host', async () => {
    const { app, store } = await createFixture();
    const zip = Buffer.from('PK\u0003\u0004-real-enough-for-the-provider-hook');
    const validFile = upload('project.zip', zip, 'application/zip');
    const valid = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: { 'x-user-id': 'owner', 'idempotency-key': 'zip-validation-0001' },
      payload: { source: 'zip', input: { file: validFile, name: 'Zip app' } },
    });
    expect(valid.statusCode).toBe(201);
    expect(JSON.stringify([...store.jobs.values()])).not.toContain(validFile.contentBase64);

    const invalidPayloads = [
      { source: 'screenshot', input: {} },
      { source: 'zip', input: { file: { ...validFile, fileName: '../project.zip' } } },
      { source: 'zip', input: { file: { ...validFile, contentBase64: 'not-base64!' } } },
      { source: 'zip', input: { file: { ...validFile, sizeBytes: validFile.sizeBytes + 1 } } },
      { source: 'zip', input: { file: { ...validFile, sha256: '0'.repeat(64) } } },
      {
        source: 'zip',
        input: { file: upload('fake.zip', Buffer.from('not a zip archive'), 'application/zip') },
      },
      { source: 'github', input: { repositoryUrl: 'https://evil.example/openaxcloud/example-app' } },
      { source: 'figma', input: { sourceUrl: 'https://figma.com/@me?token=secret' } },
    ];

    for (const [index, payload] of invalidPayloads.entries()) {
      const response = await app.inject({
        method: 'POST',
        url: '/organizations/org-1/project-imports/preflight',
        headers: { 'x-user-id': 'owner', 'idempotency-key': `invalid-payload-${index}` },
        payload,
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json().code).toBe('PROJECT_IMPORT_VALIDATION_FAILED');
    }
  });

  it('discloses Agent credits for generated imports and keeps Empty agentless and scaffoldless', async () => {
    const { app, inspections, materializations } = await createFixture();
    const figmaInput = {
      sourceUrl: 'https://www.figma.com/design/AbCdEf123/My-App',
      name: 'Figma app',
      slug: 'figma-app',
    };
    const figma = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: { 'x-user-id': 'owner', 'idempotency-key': 'figma-agent-0001' },
      payload: { source: 'figma', input: figmaInput },
    });
    expect(figma.statusCode).toBe(201);
    expect(figma.json().job).toMatchObject({
      usesAgent: true,
      runtimeDetection: { runtime: 'agent-generated', status: 'generated-on-create' },
    });
    expect(figma.json().job.creditsDisclosure).toContain('consumes Agent credits');

    const inspectionsBeforeEmpty = inspections.length;
    const emptyInput = { name: 'Raw workspace', slug: 'raw-workspace' };
    const empty = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: { 'x-user-id': 'owner', 'idempotency-key': 'empty-project-0001' },
      payload: { source: 'empty', input: emptyInput },
    });
    expect(empty.statusCode).toBe(201);
    expect(empty.json().job).toMatchObject({
      source: 'empty',
      usesAgent: false,
      runtimeDetection: { runtime: 'empty', framework: null, packageManager: null },
      generatedConfig: [],
    });
    expect(empty.json().job).not.toHaveProperty('creditsDisclosure');
    expect(inspections).toHaveLength(inspectionsBeforeEmpty);

    const create = await app.inject({
      method: 'POST',
      url: `/organizations/org-1/project-imports/${empty.json().job.id}/create`,
      headers: { 'x-user-id': 'owner' },
      payload: { input: emptyInput },
    });
    expect(create.statusCode).toBe(201);
    expect(materializations.at(-1)?.policy).toMatchObject({
      useAgent: false,
      scaffold: false,
      copySecretValues: false,
      copyDatabaseData: false,
    });
  });

  it('requires authentication, enforces opaque tenant authorization, and returns sanitized list/detail jobs', async () => {
    const { app } = await createFixture();
    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: { 'idempotency-key': 'authentication-0001' },
      payload: { source: 'empty', input: { name: 'Empty' } },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const outsider = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: { 'x-user-id': 'outsider', 'idempotency-key': 'authentication-0002' },
      payload: { source: 'empty', input: { name: 'Empty' } },
    });
    expect(outsider.statusCode).toBe(404);
    expect(outsider.json().code).toBe('PROJECT_IMPORT_NOT_FOUND');

    const created = await app.inject({
      method: 'POST',
      url: '/organizations/org-1/project-imports/preflight',
      headers: { 'x-user-id': 'owner', 'idempotency-key': 'authentication-0003' },
      payload: { source: 'empty', input: { name: 'Empty' } },
    });
    const jobId = created.json().job.id as string;
    const detail = await app.inject({
      method: 'GET',
      url: `/organizations/org-1/project-imports/${jobId}`,
      headers: { 'x-user-id': 'owner' },
    });
    const list = await app.inject({
      method: 'GET',
      url: '/organizations/org-1/project-imports?limit=10',
      headers: { 'x-user-id': 'owner' },
    });
    expect(detail.statusCode).toBe(200);
    expect(list.statusCode).toBe(200);
    expect(list.json().jobs).toHaveLength(1);
    expect(JSON.stringify({ detail: detail.json(), list: list.json() })).not.toContain('authentication-0003');
    expect(detail.json().job).not.toHaveProperty('requestHash');
  });
});
