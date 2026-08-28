import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailProvider } from '../email.js';
import { NoopObjectStorage, type ObjectStorage } from '../object-storage.js';
import {
  projectManifestDigest,
  verifyStoredProjectManifestRevision,
  type ProjectManifest,
} from '../project-manifest.js';
import type { GitProvider } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {
    return undefined;
  }
}

function activeEmptyObjectStorage(): ObjectStorage {
  const storage = new NoopObjectStorage();
  return new Proxy(storage, {
    get(target, property, receiver) {
      return property === 'active' ? true : Reflect.get(target, property, receiver);
    },
  });
}

const apps: Array<Awaited<ReturnType<typeof buildApiApp>>> = [];
const tempDirectories: string[] = [];
const originalStaticDeployStorage = process.env.STATIC_DEPLOY_STORAGE_DIR;
const originalInternalSecret = process.env.INTERNAL_API_SHARED_SECRET;

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));

  if (originalStaticDeployStorage === undefined) {
    delete process.env.STATIC_DEPLOY_STORAGE_DIR;
  } else {
    process.env.STATIC_DEPLOY_STORAGE_DIR = originalStaticDeployStorage;
  }

  if (originalInternalSecret === undefined) {
    delete process.env.INTERNAL_API_SHARED_SECRET;
  } else {
    process.env.INTERNAL_API_SHARED_SECRET = originalInternalSecret;
  }

  vi.restoreAllMocks();
});

async function setup(options: { asyncDeploy?: boolean; objectStorageActive?: boolean } = {}) {
  const store = new TestApiStore();
  const buildCalls: string[] = [];
  const queuedJobs: Array<Parameters<NonNullable<ApiAppOptions['enqueueDeployJob']>>[0]> = [];

  const enqueueDeployJob: NonNullable<ApiAppOptions['enqueueDeployJob']> = async (input) => {
    queuedJobs.push(input);
    return `manifest-build-${queuedJobs.length}`;
  };

  const staticStorage = await mkdtemp(join(tmpdir(), 'project-manifest-static-'));
  tempDirectories.push(staticStorage);
  process.env.STATIC_DEPLOY_STORAGE_DIR = staticStorage;

  const gitProvider = {
    async importRepository(input: { repositoryUrl: string; branch?: string }) {
      return {
        defaultBranch: input.branch ?? 'main',
        remoteUrl: input.repositoryUrl,
        files: [
          {
            path: 'README.md',
            content: '# Imported manifest fixture\n',
            updatedAt: new Date().toISOString(),
          },
        ],
      };
    },
    async status() {
      return { branch: 'main', changedFiles: [], ahead: 0, behind: 0 };
    },
    async commit() {
      return { sha: 'manifest-test-commit', message: 'manifest test commit' };
    },
  } as unknown as GitProvider;
  const app = await buildApiApp({
    store,
    objectStorage: options.objectStorageActive === false ? new NoopObjectStorage() : activeEmptyObjectStorage(),
    emailProvider: new QuietEmailProvider(),
    gitProvider,
    useWorkspacePodBuild: options.asyncDeploy,
    enqueueDeployJob,
    staticBuildRunner: async (input) => {
      buildCalls.push(input.projectId);

      const root = await mkdtemp(join(tmpdir(), 'project-manifest-build-'));
      tempDirectories.push(root);

      const outputDir = join(root, 'dist');
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, 'index.html'), '<!doctype html><title>manifest-bound</title>', 'utf8');

      return { ok: true, outputDir, logs: [] };
    },
  });
  apps.push(app);

  const user = await store.createUser({
    email: 'manifest-owner@example.test',
    name: 'Manifest Owner',
    passwordHash: hashPassword('correct horse battery staple'),
  });
  const organization = await store.createOrganization({
    name: 'Manifest Org',
    slug: 'manifest-org',
    ownerUserId: user.id,
  });
  await store.createSession({
    userId: user.id,
    token: 'manifest-owner-token',
    expiresAt: new Date(Date.now() + 60_000),
  });
  await store.upsertSubscription({ organizationId: organization.id, planKey: 'pro', status: 'ACTIVE' });

  const project = await store.createProject({
    organizationId: organization.id,
    name: 'Manifest Project',
    slug: 'manifest-project',
  });

  return {
    app,
    store,
    buildCalls,
    queuedJobs,
    user,
    organization,
    project,
    auth: { authorization: 'Bearer manifest-owner-token' },
  };
}

function nextManifest(current: ProjectManifest, suffix = 'api'): ProjectManifest {
  return {
    ...current,
    manifestVersion: current.manifestVersion + 1,
    artifacts: [
      {
        artifactId: 'app',
        kind: 'WEB_APP',
        sourceRoot: '.',
        components: [{ componentId: suffix, kind: 'API' }],
      },
    ],
    scopes: [`deploy:${suffix}`],
  };
}

describe('ProjectManifest API and deployment binding', () => {
  it('detaches tenant references and permanently revokes access grants when a project changes organization', async () => {
    const { app, store, user, organization, project, auth } = await setup();
    const target = await store.createOrganization({
      name: 'Manifest transfer target',
      slug: 'manifest-transfer-target',
      ownerUserId: user.id,
    });
    const initial = await app.inject({ method: 'GET', url: `/projects/${project.id}/manifest`, headers: auth });
    const manifest: ProjectManifest = {
      ...nextManifest(initial.json().manifest as ProjectManifest, 'transfer'),
      sharedBackendBinding: { bindingId: 'backend', componentIds: ['transfer'] },
      sharedDataBindings: [
        { bindingId: 'database', resourceRef: 'database:source', access: 'READ_WRITE', componentIds: ['transfer'] },
      ],
      sharedStorageBindings: [
        { bindingId: 'storage', resourceRef: 'bucket:source', access: 'READ_ONLY', componentIds: ['transfer'] },
      ],
      entitlementsRef: 'entitlements:source',
    };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/projects/${project.id}/manifest`,
          headers: auth,
          payload: { expectedDigest: initial.json().digest, manifest },
        })
      ).statusCode,
    ).toBe(200);

    const activeGrant = await store.createResourceAccessGrant({
      organizationId: organization.id,
      subjectType: 'USER',
      subjectUserId: user.id,
      resourceType: 'PROJECT',
      resourceId: project.id,
      roleKey: 'viewer',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: new Date(),
      consentVersion: 'project-access-consent-v1',
      grantedByUserId: user.id,
      idempotencyKey: 'manifest-transfer-active',
      requestHash: 'manifest-transfer-active',
    });
    const pendingUser = await store.createUser({
      email: 'manifest-transfer-pending@example.test',
      passwordHash: hashPassword('correct horse battery staple'),
    });
    await store.addMember({ organizationId: organization.id, userId: pendingUser.id, roleKey: 'member' });
    const pendingGrant = await store.createResourceAccessGrant({
      organizationId: organization.id,
      subjectType: 'USER',
      subjectUserId: pendingUser.id,
      resourceType: 'PROJECT',
      resourceId: project.id,
      roleKey: 'viewer',
      status: 'PENDING_CONSENT',
      expiresAt: new Date(Date.now() + 60_000),
      grantedByUserId: user.id,
      idempotencyKey: 'manifest-transfer-pending',
      requestHash: 'manifest-transfer-pending',
    });
    expect(activeGrant.ok && pendingGrant.ok).toBe(true);

    const moved = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/transfer`,
      headers: auth,
      payload: { targetOrganizationId: target.id },
    });
    expect(moved.statusCode).toBe(200);
    const movedManifest = verifyStoredProjectManifestRevision(
      (await store.getLatestProjectManifest(project.id))!,
      project.id,
    );
    expect(movedManifest).not.toHaveProperty('sharedBackendBinding');
    expect(movedManifest).not.toHaveProperty('sharedDataBindings');
    expect(movedManifest).not.toHaveProperty('sharedStorageBindings');
    expect(movedManifest).not.toHaveProperty('entitlementsRef');
    expect([...store.resourceAccessGrants.values()].map((grant) => grant.status)).toEqual(['REVOKED', 'REVOKED']);

    const movedBack = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/transfer`,
      headers: auth,
      payload: { targetOrganizationId: organization.id },
    });
    expect(movedBack.statusCode).toBe(200);
    expect([...store.resourceAccessGrants.values()].map((grant) => grant.status)).toEqual(['REVOKED', 'REVOKED']);
  });

  it('refuses an ordinary tenant transfer before any mutation when a managed resource remains attached', async () => {
    const { app, store, user, organization, project, auth } = await setup();
    const target = await store.createOrganization({
      name: 'Managed transfer target',
      slug: 'managed-transfer-target',
      ownerUserId: user.id,
    });
    await store.createDatabaseInstance({
      projectId: project.id,
      expectedOrganizationId: organization.id,
      organizationId: organization.id,
      retentionDays: 7,
    });
    const before = await store.getLatestProjectManifest(project.id);

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/transfer`,
      headers: auth,
      payload: { targetOrganizationId: target.id },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE');
    expect((await store.getProject(project.id))?.organizationId).toBe(organization.id);
    expect(await store.getLatestProjectManifest(project.id)).toEqual(before);
  });

  it('fails closed when the live object-storage backend cannot prove bucket absence', async () => {
    const { app, store, user, organization, project, auth } = await setup({ objectStorageActive: false });
    const target = await store.createOrganization({
      name: 'Unavailable storage transfer target',
      slug: 'unavailable-storage-transfer-target',
      ownerUserId: user.id,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/transfer`,
      headers: auth,
      payload: { targetOrganizationId: target.id },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'PROJECT_OBJECT_STORAGE_BACKEND_UNAVAILABLE' });
    await expect(store.getProject(project.id)).resolves.toMatchObject({ organizationId: organization.id });
  });

  it('recreates a detached target manifest when a remix resumes after the target row committed', async () => {
    const { store, project, organization } = await setup();
    const pinnedRevision = (await store.getLatestProjectManifest(project.id))!;
    const pinnedManifest = verifyStoredProjectManifestRevision(pinnedRevision, project.id);
    const snapshot = await store.createSnapshot({
      projectId: project.id,
      expectedOrganizationId: organization.id,
      kind: 'manual',
      manifest: { files: [] },
    });
    const changedAfterPin = nextManifest(pinnedManifest, 'changed-after-pin');
    await store.createProjectManifestRevision({
      projectId: project.id,
      expectedOrganizationId: organization.id,
      schemaVersion: changedAfterPin.schemaVersion,
      manifestVersion: changedAfterPin.manifestVersion,
      digest: projectManifestDigest(changedAfterPin),
      expectedDigest: pinnedRevision.digest,
      manifest: changedAfterPin,
    });
    const created = await store.createRemixJob({
      sourceProjectId: project.id,
      organizationId: organization.id,
      storagePolicy: 'DETACH',
      idempotencyKey: 'manifest-crash-window',
      requestHash: 'a'.repeat(64),
      sourceSnapshotId: snapshot.id,
    });
    const claimed = await store.claimRemixJob({
      id: created.job.id,
      organizationId: organization.id,
      operationToken: 'manifest-owner',
      leaseDurationMs: 60_000,
    });
    expect(claimed).toBeDefined();

    const target = await store.createClaimedRemixProject({
      remixJobId: created.job.id,
      organizationId: organization.id,
      operationToken: 'manifest-owner',
      name: 'Crash-safe target',
      slug: 'crash-safe-target',
    });
    store.projectManifestRevisions.delete(target.id);

    const replay = await store.createClaimedRemixProject({
      remixJobId: created.job.id,
      organizationId: organization.id,
      operationToken: 'manifest-owner',
      name: 'Crash-safe target',
      slug: 'crash-safe-target',
    });
    const revision = await store.getLatestProjectManifest(target.id);

    expect(replay.id).toBe(target.id);
    const replayedManifest = verifyStoredProjectManifestRevision(revision!, target.id);
    expect(replayedManifest).toMatchObject({
      projectId: target.id,
      manifestVersion: 1,
      artifacts: pinnedManifest.artifacts,
      scopes: pinnedManifest.scopes,
    });
    expect(replayedManifest.artifacts).not.toEqual(changedAfterPin.artifacts);
  });

  it('materializes one deterministic v1 revision for concurrent reads of a legacy project', async () => {
    const { app, store, project, auth } = await setup();
    store.projectManifestRevisions.delete(project.id);

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: `/projects/${project.id}/manifest`, headers: auth }),
      app.inject({ method: 'GET', url: `/projects/${project.id}/manifest`, headers: auth }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(responses[0]!.json()).toEqual(responses[1]!.json());
    expect(store.projectManifestRevisions.get(project.id)).toHaveLength(1);
  });

  it('serves the durable default with ETag and appends a canonical, audited revision', async () => {
    const { app, store, project, auth } = await setup();
    const initial = await app.inject({ method: 'GET', url: `/projects/${project.id}/manifest`, headers: auth });

    expect(initial.statusCode).toBe(200);
    expect(initial.headers.etag).toBe(`"${initial.json().digest}"`);
    expect(initial.json().manifest).toMatchObject({
      schemaVersion: 1,
      manifestVersion: 1,
      projectId: project.id,
    });

    const manifest = nextManifest(initial.json().manifest as ProjectManifest);

    const updated = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/manifest`,
      headers: auth,
      payload: { expectedDigest: initial.json().digest, manifest },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ manifest, digest: projectManifestDigest(manifest) });
    expect((await store.getLatestProjectManifest(project.id))?.manifestVersion).toBe(2);
    expect([...store.projectActivity.values()]).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'project.manifest.update' })]),
    );
    expect(store.auditLogs).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'project.manifest.update' })]),
    );

    /* Exact response-loss replay is idempotent: no v3 and no duplicate audit. */
    const replay = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/manifest`,
      headers: auth,
      payload: { expectedDigest: initial.json().digest, manifest },
    });
    expect(replay.statusCode).toBe(200);
    expect(store.projectManifestRevisions.get(project.id)).toHaveLength(2);
    expect(
      [...store.projectActivity.values()].filter((entry) => entry.action === 'project.manifest.update'),
    ).toHaveLength(1);

    const stale = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/manifest`,
      headers: { ...auth, 'accept-language': 'fr-FR' },
      payload: { expectedDigest: initial.json().digest, manifest: nextManifest(initial.json().manifest, 'stale') },
    });

    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      code: 'PROJECT_MANIFEST_VERSION_CONFLICT',
      error:
        'Le manifeste du projet a changé dans une autre session. Rechargez-le avant d’enregistrer vos modifications.',
    });
  });

  it('MUTATION: serializes two stale writers so exactly one v2 wins', async () => {
    const { app, store, project, auth } = await setup();
    const initial = await app.inject({ method: 'GET', url: `/projects/${project.id}/manifest`, headers: auth });
    const current = initial.json().manifest as ProjectManifest;

    const requests = ['alpha', 'beta'].map((suffix) =>
      app.inject({
        method: 'PUT',
        url: `/projects/${project.id}/manifest`,
        headers: auth,
        payload: { expectedDigest: initial.json().digest, manifest: nextManifest(current, suffix) },
      }),
    );

    const responses = await Promise.all(requests);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.statusCode === 409)?.json().code).toBe(
      'PROJECT_MANIFEST_VERSION_CONFLICT',
    );
    expect(store.projectManifestRevisions.get(project.id)).toHaveLength(2);
  });

  it('localizes public validation failures without echoing untrusted values', async () => {
    const { app, project, auth } = await setup();
    const initial = await app.inject({ method: 'GET', url: `/projects/${project.id}/manifest`, headers: auth });
    const canary = 'private-customer-value-do-not-echo';

    const invalid = {
      ...(initial.json().manifest as ProjectManifest),
      manifestVersion: 2,
      artifacts: [
        { artifactId: 'mobile-a', kind: 'MOBILE_APP', sourceRoot: 'apps/a' },
        { artifactId: 'mobile-b', kind: 'MOBILE_APP', sourceRoot: 'apps/b', [canary]: canary },
      ],
    };
    const response = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/manifest`,
      headers: { ...auth, 'accept-language': 'fr-FR' },
      payload: { expectedDigest: initial.json().digest, manifest: invalid },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-language']).toBe('fr');
    expect(response.json().code).toBe('PROJECT_MANIFEST_INVALID');
    expect(response.json().error).toBe(
      'Le manifeste du projet est invalide. Vérifiez ses champs et ses références avant de réessayer.',
    );
    expect(response.body).not.toContain(canary);
  });

  it('enforces authz and refuses a manifest whose projectId crosses the route boundary', async () => {
    const { app, project, auth } = await setup();
    const unauthenticated = await app.inject({ method: 'GET', url: `/projects/${project.id}/manifest` });
    expect(unauthenticated.statusCode).toBe(401);

    const initial = await app.inject({ method: 'GET', url: `/projects/${project.id}/manifest`, headers: auth });
    const mismatched = nextManifest(initial.json().manifest as ProjectManifest);
    mismatched.projectId = 'different-project';

    const response = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/manifest`,
      headers: auth,
      payload: { expectedDigest: initial.json().digest, manifest: mismatched },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('PROJECT_MANIFEST_PROJECT_MISMATCH');
  });

  it('preserves validated relationships on duplicate and detaches tenant refs on secure remix', async () => {
    const { app, store, project, auth } = await setup();
    const initial = await app.inject({ method: 'GET', url: `/projects/${project.id}/manifest`, headers: auth });

    const manifest: ProjectManifest = {
      ...nextManifest(initial.json().manifest as ProjectManifest, 'api'),
      sharedBackendBinding: { bindingId: 'backend', componentIds: ['api'] },
      sharedDataBindings: [
        { bindingId: 'database', resourceRef: 'database:source-primary', access: 'READ_WRITE', componentIds: ['api'] },
      ],
      sharedStorageBindings: [
        { bindingId: 'assets', resourceRef: 'bucket:source-assets', access: 'READ_ONLY', componentIds: ['api'] },
      ],
      entitlementsRef: 'entitlements:source-org',
    };
    const update = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/manifest`,
      headers: auth,
      payload: { expectedDigest: initial.json().digest, manifest },
    });
    expect(update.statusCode).toBe(200);

    const duplicated = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/duplicate`,
      headers: auth,
      payload: { name: 'Manifest copy', slug: 'manifest-copy' },
    });
    expect(duplicated.statusCode).toBe(201);

    const duplicateId = duplicated.json().project.id as string;
    const duplicateRevision = await store.getLatestProjectManifest(duplicateId);
    const duplicateManifest = verifyStoredProjectManifestRevision(duplicateRevision!, duplicateId);
    expect(duplicateManifest).toMatchObject({
      projectId: duplicateId,
      manifestVersion: 1,
      sharedBackendBinding: manifest.sharedBackendBinding,
      sharedDataBindings: manifest.sharedDataBindings,
      sharedStorageBindings: manifest.sharedStorageBindings,
      entitlementsRef: manifest.entitlementsRef,
    });

    const remixed = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/remix`,
      headers: auth,
      payload: { name: 'Manifest remix', slug: 'manifest-remix', storagePolicy: 'DETACH' },
    });
    expect(remixed.statusCode).toBe(201);

    const remixId = remixed.json().project.id as string;
    const remixRevision = await store.getLatestProjectManifest(remixId);
    const remixManifest = verifyStoredProjectManifestRevision(remixRevision!, remixId);
    expect(remixManifest).toMatchObject({
      projectId: remixId,
      manifestVersion: 1,
      artifacts: manifest.artifacts,
      scopes: manifest.scopes,
    });
    expect(remixManifest).not.toHaveProperty('sharedBackendBinding');
    expect(remixManifest).not.toHaveProperty('sharedDataBindings');
    expect(remixManifest).not.toHaveProperty('sharedStorageBindings');
    expect(remixManifest).not.toHaveProperty('entitlementsRef');
  });

  it('creates and exposes a valid v1 manifest for repository imports', async () => {
    const { app, store, organization, auth } = await setup();

    const imported = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/projects/import/github`,
      headers: auth,
      payload: { repositoryUrl: 'https://github.com/example/manifest-fixture.git' },
    });

    expect(imported.statusCode).toBe(201);

    const importedProjectId = imported.json().project.id as string;
    const revision = await store.getLatestProjectManifest(importedProjectId);
    expect(verifyStoredProjectManifestRevision(revision!, importedProjectId)).toMatchObject({
      schemaVersion: 1,
      manifestVersion: 1,
      projectId: importedProjectId,
    });
  });

  it('binds a deployment to the verified manifest digest before the build runs', async () => {
    const { app, store, project, auth, buildCalls } = await setup();
    const current = await store.getLatestProjectManifest(project.id);

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments`,
      headers: auth,
      payload: { provider: 'static', environment: 'preview' },
    });

    expect(response.statusCode).toBe(201);
    expect(buildCalls).toEqual([project.id]);
    expect(response.json().deployment.metadata).toMatchObject({
      projectManifestDigest: current?.digest,
      projectManifestVersion: 1,
      projectManifestSchemaVersion: 1,
    });
  });

  it('MUTATION: stored digest tampering blocks deploy before build or deployment creation', async () => {
    const { app, store, project, auth, buildCalls } = await setup();
    const rows = store.projectManifestRevisions.get(project.id)!;
    rows[0] = { ...rows[0]!, digest: `sha256:${'0'.repeat(64)}` };

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments`,
      headers: auth,
      payload: { provider: 'static', environment: 'preview' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().code).toBe('PROJECT_MANIFEST_CORRUPTED');
    expect(buildCalls).toEqual([]);
    expect(await store.listDeployments(project.id)).toEqual([]);
  });

  it('MUTATION: a queued build fails closed if the manifest changes before its worker starts', async () => {
    process.env.INTERNAL_API_SHARED_SECRET = 'project-manifest-worker-secret';

    const { app, project, auth, buildCalls, queuedJobs } = await setup({ asyncDeploy: true });

    const queued = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments`,
      headers: auth,
      payload: { provider: 'static', environment: 'preview' },
    });

    expect(queued.statusCode).toBe(202);
    expect(queuedJobs).toHaveLength(1);

    const current = await app.inject({ method: 'GET', url: `/projects/${project.id}/manifest`, headers: auth });

    const changed = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/manifest`,
      headers: auth,
      payload: {
        expectedDigest: current.json().digest,
        manifest: nextManifest(current.json().manifest as ProjectManifest, 'changed-before-build'),
      },
    });
    expect(changed.statusCode).toBe(200);

    const worker = await app.inject({
      method: 'POST',
      url: '/internal/deployments/build',
      headers: { authorization: 'Bearer project-manifest-worker-secret' },
      payload: queuedJobs[0],
    });

    expect(worker.statusCode).toBe(200);
    expect(worker.json().deployment.status).toBe('FAILED');
    expect(JSON.stringify(worker.json().deployment.logs)).toContain('manifest');
    expect(buildCalls).toEqual([]);
  });
});
