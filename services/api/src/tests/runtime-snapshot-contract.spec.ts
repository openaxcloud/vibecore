import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from '@vibecore/auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Node API tests cannot resolve the web-only ~/ alias.
import { buildApiApp } from '../app.js';
// eslint-disable-next-line no-restricted-imports -- Node API tests cannot resolve the web-only ~/ alias.
import { LocalProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Real HTTP API + LocalProjectStorage on a disposable disk tree. The store is
 * explicitly an in-memory auth/metadata fixture, not evidence of PostgreSQL or
 * production recovery. The local control-plane listener always returns 404:
 * an unavailable capability must be refused BEFORE any manager/agent call,
 * regardless of which agent version is deployed.
 */
describe('runtime snapshot API refuses missing archive capabilities', () => {
  const store = new TestApiStore();
  const projectStorage = new LocalProjectStorage();

  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let controlPlane: Server;
  let root: string;
  let baseUrl: string;
  let projectId: string;
  let workspaceId: string;
  let foreignWorkspaceId: string;
  let controlPlaneCalls = 0;

  const post = (path: string, body: unknown = {}, locale = 'en') =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer snapshot-session-fixture',
        'content-type': 'application/json',
        'accept-language': locale,
      },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'vibecore-api-snapshot-contract-'));
    controlPlane = createServer((_request, response) => {
      controlPlaneCalls += 1;
      response.writeHead(404, { 'content-type': 'application/json' }).end('{}');
    });
    await new Promise<void>((resolve) => controlPlane.listen(0, '127.0.0.1', resolve));

    const address = controlPlane.address();

    if (!address || typeof address === 'string') {
      throw new Error('Local listener has no TCP address');
    }

    vi.stubEnv('PROJECT_STORAGE_DIR', root);
    vi.stubEnv('WORKSPACE_MANAGER_URL', `http://127.0.0.1:${address.port}`);
    vi.stubEnv('DB_ROLLBACK_ENABLED', 'false');
    vi.stubEnv('WORKSPACE_ADMISSION_QUOTA_ENABLED', 'false');
    vi.stubEnv('WORKSPACE_ADMISSION_V2_ENABLED', 'false');
    app = await buildApiApp({ store, projectStorage });

    const owner = await store.createUser({
      email: 'snapshot-owner@example.test',
      name: 'Snapshot owner',
      passwordHash: hashPassword('local-fixture-password'),
    });
    const organization = await store.createOrganization({
      name: 'Snapshot fixture',
      slug: 'snapshot-fixture',
      ownerUserId: owner.id,
    });
    await store.createSession({
      userId: owner.id,
      token: 'snapshot-session-fixture',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await store.upsertSubscription({ organizationId: organization.id, planKey: 'team', status: 'ACTIVE' });

    const project = await store.createProject({ organizationId: organization.id, name: 'Project', slug: 'project' });
    projectId = project.id;
    workspaceId = (await store.createWorkspace({ projectId, name: 'Workspace', runtimeMode: 'remote-kubernetes' })).id;

    const stranger = await store.createUser({
      email: 'snapshot-stranger@example.test',
      name: 'Stranger',
      passwordHash: hashPassword('local-fixture-password'),
    });
    const foreignOrganization = await store.createOrganization({
      name: 'Foreign fixture',
      slug: 'foreign-fixture',
      ownerUserId: stranger.id,
    });
    const foreignProject = await store.createProject({
      organizationId: foreignOrganization.id,
      name: 'Foreign project',
      slug: 'foreign-project',
    });
    foreignWorkspaceId = (
      await store.createWorkspace({
        projectId: foreignProject.id,
        name: 'Foreign workspace',
        runtimeMode: 'remote-kubernetes',
      })
    ).id;
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  });

  beforeEach(() => {
    controlPlaneCalls = 0;
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve, reject) => controlPlane?.close((error) => (error ? reject(error) : resolve())));
    await rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it.each([
    ['en', '/snapshots'],
    ['fr', '/snapshots'],
    ['en', '/snapshots/legacy-id/restore'],
    ['fr', '/snapshots/legacy-id/restore'],
  ])('refuses %s runtime %s before any control-plane call', async (locale, suffix) => {
    const response = await post(`/api/runtime/workspaces/${workspaceId}${suffix}`, {}, locale);
    expect(response.status).toBe(503);

    const body = (await response.json()) as { code: string; error: string };
    expect(body.code).toBe('SNAPSHOT_ARCHIVE_UNAVAILABLE');
    expect(body.error).toContain('archives');
    expect(body.error).toContain(locale === 'fr' ? 'indisponibles' : 'unavailable');

    expect(controlPlaneCalls).toBe(0);
  });

  it.each(['create_snapshot', 'restore_snapshot'])(
    'refuses AI tool %s without quota usage or safety-snapshot side effects',
    async (tool) => {
      const snapshotsBefore = await store.listSnapshots(projectId);
      const usageBefore = [...store.usageEvents.values()];
      const response = await post(`/projects/${projectId}/ai/tools/${tool}`, { workspaceId, snapshotId: 'legacy-id' });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: 'SNAPSHOT_ARCHIVE_UNAVAILABLE' });
      expect(await store.listSnapshots(projectId)).toEqual(snapshotsBefore);
      expect([...store.usageEvents.values()]).toEqual(usageBefore);
      expect(controlPlaneCalls).toBe(0);
    },
  );

  it('enforces workspace ownership before revealing unavailable snapshot capability', async () => {
    for (const suffix of ['/snapshots', '/snapshots/legacy-id/restore']) {
      const response = await post(`/api/runtime/workspaces/${foreignWorkspaceId}${suffix}`);
      expect([403, 404]).toContain(response.status);
      expect(((await response.json()) as { code: string }).code).not.toBe('SNAPSHOT_ARCHIVE_UNAVAILABLE');
    }

    const toolResponse = await post(`/projects/${projectId}/ai/tools/restore_snapshot`, {
      workspaceId: foreignWorkspaceId,
      snapshotId: 'legacy-id',
    });
    expect(toolResponse.status).toBe(404);
    expect(controlPlaneCalls).toBe(0);
  });

  it('preserves project archive creation and real disk restore through the established project routes', async () => {
    await projectStorage.writeFiles(projectId, [{ path: 'README.md', content: 'original archived file' }]);

    const created = await post(`/projects/${projectId}/snapshots`, { label: 'Disk fixture' });
    expect(created.status).toBe(201);

    const snapshot = ((await created.json()) as { snapshot: { id: string; storageKey: string } }).snapshot;
    expect(await store.getProjectStorageObject(snapshot.storageKey)).toBeDefined();
    await projectStorage.writeFiles(projectId, [{ path: 'README.md', content: 'changed later' }]);

    const restored = await post(`/projects/${projectId}/snapshots/${snapshot.id}/restore`);

    expect(restored.status).toBe(200);
    expect(await readFile(join(root, projectId, 'README.md'), 'utf8')).toBe('original archived file');
  });
});
