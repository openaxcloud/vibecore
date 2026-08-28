import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { NoopObjectStorage, type ObjectStorage } from '../object-storage.js';
import { objectStorageStaticArtifactSummary } from '../object-storage-operation.js';
import {
  LocalProjectStorage,
  type ProjectMutationCoordinator,
  type ProjectStaticErasureAuthority,
} from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function exists(path: string) {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

class ControlledObjectStorage {
  present = true;
  active = true;
  deleteEntered?: ReturnType<typeof deferred>;
  deleteRelease?: Promise<void>;
  deleteCalls = 0;

  readonly adapter: ObjectStorage;

  constructor() {
    const noop = new NoopObjectStorage();
    this.adapter = new Proxy(noop, {
      get: (target, property, receiver) => {
        if (property === 'active') return this.active;
        if (property === 'bucketExists') return async () => this.present;
        if (property === 'deleteBucket') {
          return async (projectId: string) => {
            this.deleteCalls += 1;
            this.deleteEntered?.resolve();
            await this.deleteRelease;
            this.present = false;
            return { deleted: true, bucket: `test-${projectId}` };
          };
        }

        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
}

class TestPermanentProjectStorage extends LocalProjectStorage {
  private readonly artifacts = new Map<
    string,
    Array<{
      digest: string;
      outcome: 'DELETED_UNREFERENCED';
      otherReferenceCount: 0;
    }>
  >();

  constructor(
    private readonly root: string,
    coordinator: ProjectMutationCoordinator,
  ) {
    super(coordinator, coordinator, coordinator);
  }

  private staticPaths(projectId: string) {
    return {
      snapshots: join(this.root, '_static', 'snapshots', projectId),
      aliases: join(this.root, '_static', 'aliases', projectId),
      artifact: join(this.root, '_static', 'artifacts', projectId),
    };
  }

  override supportsProjectStaticErasure() {
    return true;
  }

  override async prepareProjectStaticErasureWithinPhysicalAccess(projectId: string) {
    return objectStorageStaticArtifactSummary(this.artifacts.get(projectId) ?? []);
  }

  async seedStaticData(projectId: string) {
    const paths = this.staticPaths(projectId);
    const digest = createHash('sha256').update(`static-artifact:${projectId}`).digest('hex');
    await Promise.all(Object.values(paths).map((path) => mkdir(path, { recursive: true })));
    await Promise.all([
      writeFile(join(paths.snapshots, 'snapshot.json'), 'static snapshot bytes'),
      writeFile(join(paths.aliases, 'route.json'), 'static alias bytes'),
      writeFile(join(paths.artifact, digest), 'static artifact bytes'),
    ]);
    this.artifacts.set(projectId, [{ digest, outcome: 'DELETED_UNREFERENCED', otherReferenceCount: 0 }]);
  }

  async eraseProjectStaticDataWithinPhysicalAccess(projectId: string) {
    const paths = this.staticPaths(projectId);
    await Promise.all(Object.values(paths).map((path) => rm(path, { recursive: true, force: true })));
  }

  override async verifyProjectDataAbsentWithinPhysicalAccess(projectId: string) {
    const local = await super.verifyProjectDataAbsentWithinPhysicalAccess(projectId);
    const paths = this.staticPaths(projectId);
    const staticArtifacts = this.artifacts.get(projectId) ?? [];
    return {
      ...local,
      staticSnapshotsAbsent: !(await exists(paths.snapshots)),
      staticAliasesAbsent: !(await exists(paths.aliases)),
      staticArtifactSummary: objectStorageStaticArtifactSummary(staticArtifacts),
    };
  }
}

const roots: string[] = [];
const apps: Array<Awaited<ReturnType<typeof buildApiApp>>> = [];
const previousProjectStorageDir = process.env.PROJECT_STORAGE_DIR;
const previousStaticDeployStorageDir = process.env.STATIC_DEPLOY_STORAGE_DIR;

afterEach(async () => {
  await Promise.allSettled(apps.splice(0).map((app) => app.close()));
  await Promise.allSettled(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));

  if (previousProjectStorageDir === undefined) delete process.env.PROJECT_STORAGE_DIR;
  else process.env.PROJECT_STORAGE_DIR = previousProjectStorageDir;
  if (previousStaticDeployStorageDir === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
  else process.env.STATIC_DEPLOY_STORAGE_DIR = previousStaticDeployStorageDir;
});

async function setup(label: string, options: { staticVerifier?: boolean; unsafeStaticNamespace?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), `vc-permanent-${label}-`));
  roots.push(root);
  process.env.PROJECT_STORAGE_DIR = root;

  const store = new TestApiStore();
  const coordinate: ProjectMutationCoordinator = (scope, effect) => store.withProjectPhysicalMutation(scope, effect);
  const staticAuthority: ProjectStaticErasureAuthority = {
    async resolveInventory(projectId) {
      return { projectId, deploymentIds: [`${label}-static-deployment`], artifacts: [] };
    },
    async resolveArtifact() {
      return undefined;
    },
  };
  const storage =
    options.staticVerifier === false
      ? new LocalProjectStorage(coordinate, coordinate, coordinate)
      : options.unsafeStaticNamespace
        ? new LocalProjectStorage(coordinate, coordinate, coordinate, staticAuthority)
        : new TestPermanentProjectStorage(root, coordinate);
  const objectStorage = new ControlledObjectStorage();
  const app = await buildApiApp({
    store,
    projectStorage: storage,
    objectStorage: objectStorage.adapter,
    emailProvider: new QuietEmailProvider(),
    projectWorkspaceDeletion: async (_action, projectId, organizationId, lease) => ({
      schemaVersion: 'workspace-project-erasure-v3',
      projectId,
      organizationId,
      databaseInventoryRetained: true,
      runtimeEffectsDrained: true,
      kubernetes: {
        deploymentsAbsent: true,
        replicaSetsAbsent: true,
        podsAbsent: true,
        servicesAbsent: true,
        endpointsAbsent: true,
        endpointSlicesAbsent: true,
        ingressesAbsent: true,
        ownedRuntimeSecretsAbsent: true,
        persistentVolumeClaimsAbsent: true,
      },
      volumes: {
        schemaVersion: 'project-volume-erasure-receipt-v1',
        operationId: lease.operationId,
        projectId,
        organizationId,
        inventoryHash: 'a'.repeat(64),
        verificationHash: 'b'.repeat(64),
        finalScanHash: 'c'.repeat(64),
        quiescenceHash: 'd'.repeat(64),
        entryCount: 0,
        erasedEntryCount: 0,
        alreadyAbsentEntryCount: 0,
        persistentVolumeClaimsAbsent: true,
        persistentVolumesAbsent: true,
        providerVolumesAbsent: true,
      },
    }),
  });
  apps.push(app);

  const registration = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `${label}@example.test`,
      password: 'password123',
      name: `${label} owner`,
      organizationName: `${label} organization`,
    },
  });
  expect(registration.statusCode).toBe(201);
  const auth = registration.json() as { token: string; organization: { id: string } };
  const created = await app.inject({
    method: 'POST',
    url: `/orgs/${auth.organization.id}/projects`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: `${label} project` },
  });
  expect(created.statusCode).toBe(201);
  const project = created.json().project as { id: string; name: string };
  const scope = { expectedOrganizationId: auth.organization.id };

  await storage.writeFiles(project.id, [{ path: 'src/secret.txt', content: 'source-a' }], scope);
  await storage.exportZip(project.id, scope);
  await storage.createSnapshot({
    projectId: project.id,
    expectedOrganizationId: auth.organization.id,
    storageKey: `snapshots/${project.id}/checkpoint.zip`,
    files: [{ path: 'secret.txt', content: 'snapshot-a', updatedAt: new Date().toISOString() }],
  });
  if (storage instanceof TestPermanentProjectStorage) {
    await storage.seedStaticData(project.id);
  }
  if (options.unsafeStaticNamespace) {
    const staticRoot = join(root, 'static-deployments');
    const outsideAliases = join(root, 'outside-static-aliases');
    process.env.STATIC_DEPLOY_STORAGE_DIR = staticRoot;
    await mkdir(staticRoot, { recursive: true });
    await mkdir(outsideAliases, { recursive: true });
    await writeFile(join(outsideAliases, 'must-remain'), 'outside static bytes');
    await symlink(outsideAliases, join(staticRoot, '.aliases'));
  }

  return { root, store, storage, objectStorage, app, auth, project, scope };
}

async function permanentDelete(fixture: Awaited<ReturnType<typeof setup>>) {
  return fixture.app.inject({
    method: 'DELETE',
    url: `/projects/${fixture.project.id}/permanent`,
    headers: {
      authorization: `Bearer ${fixture.auth.token}`,
      'idempotency-key': `permanent-delete-${fixture.project.id}`,
    },
    payload: { confirmName: fixture.project.name },
  });
}

function projectPaths(root: string, projectId: string) {
  return {
    tree: join(root, projectId),
    exports: join(root, '_objects', 'exports', projectId),
    snapshots: join(root, '_objects', 'snapshots', projectId),
    staticSnapshots: join(root, '_static', 'snapshots', projectId),
    staticAliases: join(root, '_static', 'aliases', projectId),
    staticArtifact: join(root, '_static', 'artifacts', projectId),
  };
}

describe('permanent project deletion physical fence', () => {
  it('linearizes soft delete with physical writers in both orders', async () => {
    const writerFirst = await setup('soft-writer-first');
    const writerEntered = deferred();
    const releaseWriter = deferred();
    let firstGuard = true;
    const writer = writerFirst.storage.writeFiles(
      writerFirst.project.id,
      [{ path: 'src/before-soft-delete.txt', content: 'writer-first' }],
      writerFirst.scope,
      async () => {
        if (!firstGuard) return;
        firstGuard = false;
        writerEntered.resolve();
        await releaseWriter.promise;
      },
    );
    await writerEntered.promise;
    let softDeleteSettled = false;
    const softDelete = writerFirst.app
      .inject({
        method: 'DELETE',
        url: `/projects/${writerFirst.project.id}`,
        headers: { authorization: `Bearer ${writerFirst.auth.token}` },
      })
      .finally(() => {
        softDeleteSettled = true;
      });
    await delay(30);
    expect(softDeleteSettled).toBe(false);
    releaseWriter.resolve();
    await writer;
    await expect(softDelete).resolves.toMatchObject({ statusCode: 200 });
    await expect(
      readFile(join(writerFirst.root, writerFirst.project.id, 'src/before-soft-delete.txt'), 'utf8'),
    ).resolves.toBe('writer-first');

    const deleteFirst = await setup('soft-delete-first');
    const response = await deleteFirst.app.inject({
      method: 'DELETE',
      url: `/projects/${deleteFirst.project.id}`,
      headers: { authorization: `Bearer ${deleteFirst.auth.token}` },
    });
    expect(response.statusCode).toBe(200);
    await expect(
      deleteFirst.storage.writeFiles(
        deleteFirst.project.id,
        [{ path: 'src/after-soft-delete.txt', content: 'must-not-exist' }],
        deleteFirst.scope,
      ),
    ).rejects.toMatchObject({ code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION' });
    await expect(exists(join(deleteFirst.root, deleteFirst.project.id, 'src/after-soft-delete.txt'))).resolves.toBe(
      false,
    );
  });

  it('lets a writer that owns the fence finish, then erases every local/GCS byte before deleting the row', async () => {
    const fixture = await setup('writer-first');
    const writerEntered = deferred();
    const releaseWriter = deferred();
    let firstGuard = true;

    const writer = fixture.storage.writeFiles(
      fixture.project.id,
      [{ path: 'src/late.txt', content: 'late-a' }],
      fixture.scope,
      async () => {
        if (!firstGuard) return;
        firstGuard = false;
        writerEntered.resolve();
        await releaseWriter.promise;
      },
    );
    await writerEntered.promise;

    let deletionSettled = false;
    const deletion = permanentDelete(fixture).finally(() => {
      deletionSettled = true;
    });
    await delay(30);
    expect(deletionSettled).toBe(false);

    releaseWriter.resolve();
    await expect(writer).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ path: 'src/late.txt' })]));
    const response = await deletion;
    expect(response.statusCode).toBe(200);

    const paths = projectPaths(fixture.root, fixture.project.id);
    await expect(exists(paths.tree)).resolves.toBe(false);
    await expect(exists(paths.exports)).resolves.toBe(false);
    await expect(exists(paths.snapshots)).resolves.toBe(false);
    await expect(exists(paths.staticSnapshots)).resolves.toBe(false);
    await expect(exists(paths.staticAliases)).resolves.toBe(false);
    await expect(exists(paths.staticArtifact)).resolves.toBe(false);
    expect(fixture.objectStorage.present).toBe(false);
    await expect(fixture.store.getProject(fixture.project.id)).resolves.toBeUndefined();
  });

  it('freezes first, rejects a late writer, and never resurrects bytes while GCS deletion is suspended', async () => {
    const fixture = await setup('delete-first');
    const deleteEntered = deferred();
    const releaseDelete = deferred();
    fixture.objectStorage.deleteEntered = deleteEntered;
    fixture.objectStorage.deleteRelease = releaseDelete.promise;

    const deletion = permanentDelete(fixture);
    await deleteEntered.promise;
    await expect(fixture.store.getProject(fixture.project.id)).resolves.toMatchObject({
      deletedAt: expect.any(String),
    });

    let writerSettled = false;
    const writer = fixture.storage
      .writeFiles(fixture.project.id, [{ path: 'src/resurrected.txt', content: 'must-not-exist' }], fixture.scope)
      .finally(() => {
        writerSettled = true;
      });
    let restoreSettled = false;
    const restore = fixture.app
      .inject({
        method: 'POST',
        url: `/projects/${fixture.project.id}/restore`,
        headers: { authorization: `Bearer ${fixture.auth.token}` },
      })
      .finally(() => {
        restoreSettled = true;
      });
    await delay(30);
    expect(writerSettled).toBe(false);
    expect(restoreSettled).toBe(false);

    releaseDelete.resolve();
    const response = await deletion;
    expect(response.statusCode).toBe(200);
    await expect(writer).rejects.toMatchObject({ code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION' });
    await expect(restore).resolves.toMatchObject({ statusCode: 409 });

    const paths = projectPaths(fixture.root, fixture.project.id);
    await expect(exists(paths.tree)).resolves.toBe(false);
    await expect(exists(paths.exports)).resolves.toBe(false);
    await expect(exists(paths.snapshots)).resolves.toBe(false);
    await expect(exists(paths.staticSnapshots)).resolves.toBe(false);
    await expect(exists(paths.staticAliases)).resolves.toBe(false);
    await expect(exists(paths.staticArtifact)).resolves.toBe(false);
    expect(fixture.objectStorage.present).toBe(false);
  });

  it('fails closed without deleting local bytes when the configured GCS backend is inactive', async () => {
    const fixture = await setup('inactive-gcs');
    fixture.objectStorage.active = false;
    const paths = projectPaths(fixture.root, fixture.project.id);

    const response = await permanentDelete(fixture);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'PROJECT_OBJECT_STORAGE_BACKEND_UNAVAILABLE' });
    const preserved = await fixture.store.getProject(fixture.project.id);
    expect(preserved).toBeDefined();
    expect(preserved).not.toHaveProperty('deletedAt');
    expect(preserved).not.toHaveProperty('permanentDeletionStartedAt');
    await expect(exists(paths.tree)).resolves.toBe(true);
    await expect(readFile(join(paths.tree, 'src/secret.txt'), 'utf8')).resolves.toBe('source-a');
    await expect(exists(paths.exports)).resolves.toBe(true);
    await expect(exists(paths.snapshots)).resolves.toBe(true);
    expect(fixture.objectStorage.present).toBe(true);
  });

  it('fails closed before the deletion saga when no production static-erasure verifier is installed', async () => {
    const fixture = await setup('missing-static-verifier', { staticVerifier: false });
    const paths = projectPaths(fixture.root, fixture.project.id);

    const response = await permanentDelete(fixture);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'PROJECT_STATIC_ERASURE_VERIFIER_UNAVAILABLE' });
    const preserved = await fixture.store.getProject(fixture.project.id);
    expect(preserved).toBeDefined();
    expect(preserved).not.toHaveProperty('deletedAt');
    expect(preserved).not.toHaveProperty('permanentDeletionStartedAt');
    await expect(readFile(join(paths.tree, 'src/secret.txt'), 'utf8')).resolves.toBe('source-a');
    expect(fixture.objectStorage.present).toBe(true);
  });

  it('fails safe before every erase when a static namespace is a symlink', async () => {
    const fixture = await setup('unsafe-static-preflight', { unsafeStaticNamespace: true });
    const paths = projectPaths(fixture.root, fixture.project.id);

    const response = await permanentDelete(fixture);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'PROJECT_STATIC_ERASURE_UNSAFE_NAMESPACE' });
    const preserved = await fixture.store.getProject(fixture.project.id);
    expect(preserved).toMatchObject({ id: fixture.project.id });
    expect(preserved?.deletedAt ?? null).toBeNull();
    expect(preserved?.permanentDeletionStartedAt ?? null).toBeNull();
    await expect(readFile(join(paths.tree, 'src/secret.txt'), 'utf8')).resolves.toBe('source-a');
    await expect(exists(paths.exports)).resolves.toBe(true);
    await expect(exists(paths.snapshots)).resolves.toBe(true);
    await expect(readFile(join(fixture.root, 'outside-static-aliases', 'must-remain'), 'utf8')).resolves.toBe(
      'outside static bytes',
    );
    expect(fixture.objectStorage.deleteCalls).toBe(0);
    expect(fixture.objectStorage.present).toBe(true);
  });

  it('replays a lost permanent-delete response from the immutable tombstone without leaking Project fields', async () => {
    const fixture = await setup('lost-response-replay');

    const first = await permanentDelete(fixture);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      replayed: false,
      project: {
        id: fixture.project.id,
        organizationId: fixture.auth.organization.id,
        state: 'PERMANENTLY_DELETED',
        projectRecordHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
    expect(first.json().project).not.toHaveProperty('name');
    expect(first.json().project).not.toHaveProperty('gitRepositoryUrl');

    const replay = await permanentDelete(fixture);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      replayed: true,
      completedAt: first.json().completedAt,
      project: first.json().project,
    });
    expect(fixture.store.auditLogs.filter(({ action }) => action === 'project.hard_delete')).toHaveLength(1);

    const wrongConfirmation = await fixture.app.inject({
      method: 'DELETE',
      url: `/projects/${fixture.project.id}/permanent`,
      headers: {
        authorization: `Bearer ${fixture.auth.token}`,
        'idempotency-key': `permanent-delete-${fixture.project.id}`,
      },
      payload: { confirmName: 'wrong project name' },
    });
    expect(wrongConfirmation.statusCode).toBe(400);
    expect(wrongConfirmation.json()).toMatchObject({ code: 'PROJECT_NAME_MISMATCH' });

    const conflictingKey = await fixture.app.inject({
      method: 'DELETE',
      url: `/projects/${fixture.project.id}/permanent`,
      headers: {
        authorization: `Bearer ${fixture.auth.token}`,
        'idempotency-key': `different-delete-${fixture.project.id}`,
      },
      payload: { confirmName: fixture.project.name },
    });
    expect(conflictingKey.statusCode).toBe(409);
    expect(conflictingKey.json()).toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT' });
  });
});
