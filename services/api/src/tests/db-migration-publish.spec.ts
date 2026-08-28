/* eslint-disable no-restricted-imports -- API Vitest resolves service-relative modules, not the web `~/` alias. */
import { hashPassword } from '@vibecore/auth';
import { encryptJson } from '@vibecore/security';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { DatabaseProvisioner } from '../database-provisioner.js';
import { exactMigrationLedgerDigest } from '../db-migration-applier.js';
import { sha256, type MigrationTargetInspection, type SqlApplier } from '../db-migration-execution.js';
import type { EmailProvider } from '../email.js';
import {
  projectManifestDigest,
  verifyStoredProjectManifestRevision,
  type ProjectManifest,
} from '../project-manifest.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import type { ProjectReleaseFence } from '../store.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {
    return undefined;
  }
}

class MemoryStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();
  async writeFiles(
    projectId: string,
    files: Array<{ path: string; content: string }>,
    _scope: { expectedOrganizationId: string; workspaceId?: string },
  ) {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();

    for (const file of files) {
      bucket.set(file.path, file.content);
    }
    this.files.set(projectId, bucket);

    return this.listFiles(projectId, _scope);
  }
  async listFiles(
    projectId: string,
    scope: { expectedOrganizationId: string; workspaceId?: string },
  ): Promise<ProjectFile[]> {
    return this.listFilesWithinPhysicalAccess(projectId, scope.workspaceId);
  }
  async listFilesWithinPhysicalAccess(projectId: string, _workspaceId?: string): Promise<ProjectFile[]> {
    return [...(this.files.get(projectId) ?? new Map()).entries()].map(([path, content]) => ({
      path,
      content,
      updatedAt: '',
    }));
  }
  async createSnapshot(_input: {
    projectId: string;
    expectedOrganizationId: string;
    files: ProjectFile[];
    storageKey?: string;
  }) {
    return { id: 's', storageKey: 's', byteLength: 0, createdAt: '' };
  }
  async getSnapshotFiles(
    projectId: string,
    storageKey: string,
    _scope: { expectedOrganizationId: string; workspaceId?: string },
  ) {
    return this.getSnapshotFilesWithinPhysicalAccess(projectId, storageKey);
  }
  async getSnapshotFilesWithinPhysicalAccess(_projectId: string, _storageKey: string) {
    return [];
  }
  async restoreSnapshot(
    _input: {
      projectId: string;
      expectedOrganizationId: string;
      workspaceId?: string;
      files: ProjectFile[];
    },
    _guard?: () => Promise<void>,
  ) {
    return [];
  }
  async readFile() {
    return undefined;
  }
  async deleteFiles() {
    return undefined;
  }
  async deleteProjectFiles(_projectId: string, _scope: { expectedOrganizationId: string; workspaceId?: string }) {
    return undefined;
  }
  async eraseProjectDataWithinPhysicalAccess() {
    return undefined;
  }
  async exportZip(_projectId: string, _scope: { expectedOrganizationId: string; workspaceId?: string }) {
    return { storageKey: '', byteLength: 0, base64: '', createdAt: '' };
  }
  async importZip(
    _projectId: string,
    _base64: string,
    _scope: { expectedOrganizationId: string; workspaceId?: string },
    _options?: { replaceExisting?: boolean },
  ) {
    return [];
  }
  async writeObject() {
    return undefined;
  }
  async readObject() {
    return undefined;
  }
  async deleteObject() {
    return undefined;
  }
}

class MemoryApplier implements SqlApplier {
  readonly ledger = new Map<string, string>();
  calls = 0;
  async apply(input: Parameters<SqlApplier['apply']>[0]) {
    this.calls += 1;

    for (const migration of input.migrations) {
      this.ledger.set(migration.name, migration.sha256);
    }
    await input.beforeCommit();

    return { applied: input.migrations.map(({ name }) => name) };
  }
  async inspect(input: Parameters<SqlApplier['inspect']>[0]): Promise<MigrationTargetInspection> {
    const matching = input.plan.filter(({ name, sha256: digest }) => this.ledger.get(name) === digest);
    return {
      status: matching.length === 0 ? 'EMPTY' : matching.length === input.plan.length ? 'COMPLETE' : 'PARTIAL',
      applied: matching.map(({ name }) => name),
    };
  }
}

const provisionerWithPhase = (phase: string, applied = true): DatabaseProvisioner =>
  ({
    active: true,
    async takeSnapshot() {
      return { applied };
    },
    async backupStatus() {
      return { found: true, phase, completed: phase === 'completed' };
    },
  }) as unknown as DatabaseProvisioner;

async function setup(
  options: { provisioner?: DatabaseProvisioner; withMigrations?: boolean; connection?: boolean } = {},
) {
  const store = new TestApiStore();
  const projectStorage = new MemoryStorage();
  const migrationApplier = new MemoryApplier();

  const app = await buildApiApp({
    store,
    projectStorage,
    emailProvider: new QuietEmailProvider(),
    databaseProvisioner: options.provisioner ?? provisionerWithPhase('completed'),
    databasePhysicalAuthorityResolver: async (projectId) => ({
      tier: 'isolated',
      clusterName: `db-${projectId}-prod`.toLowerCase().slice(0, 53),
      backupBucket: 'vibecore-test-db-backups',
      backupPrefix: `db/${projectId}/production/`,
      retentionDays: 28,
    }),
    migrationApplier,
    migrationLedgerInspector: async () => {
      const rows = [...migrationApplier.ledger].map(([name, digest]) => ({ name, sha256: digest }));
      return { status: 'EXACT', digest: exactMigrationLedgerDigest(rows), entries: rows.length };
    },
  });
  const user = await store.createUser({
    email: 'mig@example.com',
    name: 'Mig',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Mig Org', slug: 'mig-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'mig-token', expiresAt: new Date(Date.now() + 3_600_000) });

  const project = await store.createProject({ organizationId: org.id, name: 'Mig P', slug: 'mig-p' });
  const projectManifest = await store.getLatestProjectManifest(project.id);
  if (!projectManifest) throw new Error('Expected the migration publish fixture project manifest');

  if (options.withMigrations !== false) {
    const first = 'CREATE TABLE test_users (id bigint PRIMARY KEY);';
    const second = 'ALTER TABLE test_users ADD COLUMN name text;';
    await projectStorage.writeFiles(
      project.id,
      [
        { path: 'migrations/001_init.sql', content: first },
        { path: 'migrations/002_add.sql', content: second },
        {
          path: 'migrations/ecode.publish.json',
          content: JSON.stringify({
            schemaVersion: 1,
            mode: 'expand',
            backwardCompatible: true,
            forwardCompatible: false,
            migrations: [
              { name: '001_init.sql', sha256: sha256(first) },
              { name: '002_add.sql', sha256: sha256(second) },
            ],
          }),
        },
      ],
      { expectedOrganizationId: org.id },
    );
  }

  if (options.connection !== false) {
    await store.upsertProjectSecret({
      projectId: project.id,
      expectedOrganizationId: project.organizationId,
      key: 'PROD_DATABASE_URL',
      valueEncrypted: encryptJson({ value: 'postgres://user:pw@prod-host:5432/appdb' }),
    });
  }

  const deployment = await store.createDeployment({
    projectId: project.id,
    expectedOrganizationId: project.organizationId,
    environment: 'preview',
    status: 'READY',
    /* This suite isolates schema migration semantics from OCI promotion. */
    provider: 'vercel',
    metadata: { projectManifestDigest: projectManifest.digest },
  });

  return { app, store, projectStorage, project, deployment, migrationApplier };
}

const publish = (app: Awaited<ReturnType<typeof buildApiApp>>, projectId: string, deploymentId: string) =>
  app.inject({
    method: 'POST',
    url: `/projects/${projectId}/deployments/${deploymentId}/publish`,
    headers: { authorization: 'Bearer mig-token' },
  });

describe('schema migration before publish route', () => {
  it('publishes only after backup, fenced apply and target verification', async () => {
    const run = await setup();
    const response = await publish(run.app, run.project.id, run.deployment.id);
    expect(response.statusCode, response.body).toBe(201);
    expect(run.migrationApplier.calls).toBe(1);
    expect([...run.store.migrationExecutions.values()][0]).toMatchObject({
      state: 'COMMITTED',
      environment: 'production',
      activeLock: undefined,
      backupVerificationMethod: 'cnpg-backup-status-completed',
      appliedStatements: 2,
    });
  });

  it('authorizes deployment creation only with the exact active release fence', async () => {
    const run = await setup({ withMigrations: false });
    const manifest = await run.store.getLatestProjectManifest(run.project.id);
    if (!manifest) throw new Error('Expected a project manifest for the release-fence fixture');

    const ownerToken = 'publish-owner';
    const lease = await run.store.acquireProjectReleaseBarrier({
      projectId: run.project.id,
      expectedOrganizationId: run.project.organizationId,
      expectedManifestDigest: manifest.digest,
      operationId: 'publish:deployment-fixture',
      ownerToken,
      ttlSeconds: 60,
    });
    if (!lease) throw new Error('Expected to acquire the release-fence fixture');

    const releaseFence: ProjectReleaseFence = {
      checkpointId: lease.checkpointId,
      ownerToken: lease.ownerToken,
      fence: lease.fence,
      expectedOrganizationId: run.project.organizationId,
      expectedManifestDigest: manifest.digest,
    };
    const createProductionDeployment = (fence?: ProjectReleaseFence) =>
      run.store.createDeployment({
        projectId: run.project.id,
        expectedOrganizationId: run.project.organizationId,
        ...(fence ? { releaseFence: fence } : {}),
        provider: 'vercel',
        environment: 'production',
        status: 'READY',
        metadata: { projectManifestDigest: manifest.digest },
      });

    await expect(createProductionDeployment()).rejects.toMatchObject({
      code: 'CHECKPOINT_BARRIER_ACTIVE',
      statusCode: 423,
    });
    await expect(
      createProductionDeployment({ ...releaseFence, ownerToken: 'forged-publish-owner' }),
    ).rejects.toMatchObject({
      code: 'PROJECT_RELEASE_BARRIER_LOST',
      statusCode: 409,
    });
    await expect(createProductionDeployment(releaseFence)).resolves.toMatchObject({
      projectId: run.project.id,
      environment: 'production',
      status: 'READY',
    });
  });

  it('refuses publish before creating production when backup is not verified', async () => {
    const run = await setup({ provisioner: provisionerWithPhase('failed') });
    const before = (await run.store.listDeployments(run.project.id)).length;
    const response = await publish(run.app, run.project.id, run.deployment.id);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'MIGRATION_BACKUP_UNVERIFIED' });
    expect(await run.store.listDeployments(run.project.id)).toHaveLength(before);
  });

  it('refuses a live concurrent migration', async () => {
    const run = await setup();
    await run.store.acquireDatabaseMigrationExecution({
      projectId: run.project.id,
      organizationId: run.project.organizationId,
      environment: 'production',
      idempotencyKey: 'other',
      requestHash: 'other',
      ownerToken: 'other-owner',
      ttlMs: 60_000,
      plan: [],
      statementsSha256: 'other',
      backwardCompatible: true,
      forwardCompatible: false,
    });

    const response = await publish(run.app, run.project.id, run.deployment.id);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'MIGRATION_LOCK_HELD', retryable: true });
    expect(run.migrationApplier.calls).toBe(0);
  });

  it('refuses declared migrations without a production target', async () => {
    const run = await setup({ connection: false });
    const response = await publish(run.app, run.project.id, run.deployment.id);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'MIGRATION_TARGET_UNAVAILABLE' });
  });

  it('fails closed when the production target lookup is unavailable', async () => {
    const run = await setup();

    run.store.listProjectSecrets = async () => {
      throw new Error('control-plane database unavailable');
    };

    const response = await publish(run.app, run.project.id, run.deployment.id);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'ROLLBACK_DB_LEDGER_UNAVAILABLE', retryable: true });
    expect(run.migrationApplier.calls).toBe(0);
  });

  it('publishes a project with no migration files without creating an execution', async () => {
    const run = await setup({ withMigrations: false });
    expect((await publish(run.app, run.project.id, run.deployment.id)).statusCode).toBe(201);
    expect(run.store.migrationExecutions.size).toBe(0);
  });

  it('replaying the same source does not apply schema twice', async () => {
    const run = await setup();
    expect((await publish(run.app, run.project.id, run.deployment.id)).statusCode).toBe(201);
    expect((await publish(run.app, run.project.id, run.deployment.id)).statusCode).toBe(201);
    expect(run.migrationApplier.calls).toBe(1);
    expect(run.store.migrationExecutions.size).toBe(1);
  });

  it('applies the immutable migration plan pinned to the deployment, never later workspace SQL', async () => {
    const run = await setup();
    const pinnedFiles = await run.projectStorage.listFiles(run.project.id, {
      expectedOrganizationId: run.project.organizationId,
    });
    const pinnedMigrations = ['001_init.sql', '002_add.sql'].map((name) => {
      const sql = pinnedFiles.find((file) => file.path === `migrations/${name}`)?.content;
      if (!sql) throw new Error(`missing pinned migration fixture: ${name}`);
      return { name, sql, sha256: sha256(sql) };
    });
    await run.store.updateDeployment(run.project.id, run.deployment.id, {
      metadata: {
        ...(run.deployment.metadata as Record<string, unknown>),
        publishMigrationPlan: {
          migrations: pinnedMigrations,
          backwardCompatible: true,
          forwardCompatible: false,
        },
      },
    });

    const laterSql = 'CREATE TABLE later_workspace_change (id bigint PRIMARY KEY);';
    await run.projectStorage.writeFiles(
      run.project.id,
      [
        { path: 'migrations/003_later.sql', content: laterSql },
        {
          path: 'migrations/ecode.publish.json',
          content: JSON.stringify({
            schemaVersion: 1,
            mode: 'expand',
            backwardCompatible: true,
            forwardCompatible: false,
            migrations: [{ name: '003_later.sql', sha256: sha256(laterSql) }],
          }),
        },
      ],
      { expectedOrganizationId: run.project.organizationId },
    );

    expect((await publish(run.app, run.project.id, run.deployment.id)).statusCode).toBe(201);
    expect([...run.migrationApplier.ledger.keys()]).toEqual(['001_init.sql', '002_add.sql']);
    expect(run.migrationApplier.ledger.has('003_later.sql')).toBe(false);
  });

  it('refuses a corrupted pinned migration plan before touching the production target', async () => {
    const run = await setup();
    await run.store.updateDeployment(run.project.id, run.deployment.id, {
      metadata: {
        ...(run.deployment.metadata as Record<string, unknown>),
        publishMigrationPlan: {
          migrations: [{ name: '001_init.sql', sql: 'CREATE TABLE pinned (id bigint);', sha256: '0'.repeat(64) }],
          backwardCompatible: true,
          forwardCompatible: false,
        },
      },
    });

    const response = await publish(run.app, run.project.id, run.deployment.id);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'MIGRATION_MANIFEST_INVALID' });
    expect(run.migrationApplier.calls).toBe(0);
  });

  it('invalidates a deployment when the project manifest changes after the build was bound', async () => {
    const run = await setup();
    const revision = (await run.store.getLatestProjectManifest(run.project.id))!;
    const manifest = verifyStoredProjectManifestRevision(revision, run.project.id);
    await run.store.updateDeployment(run.project.id, run.deployment.id, {
      metadata: { projectManifestDigest: revision.digest, publishMigrationPlan: null },
    });
    const changedManifest: ProjectManifest = {
      ...manifest,
      manifestVersion: manifest.manifestVersion + 1,
      scopes: ['deploy:changed-after-build'],
    };
    await run.store.createProjectManifestRevision({
      projectId: run.project.id,
      expectedOrganizationId: run.project.organizationId,
      schemaVersion: changedManifest.schemaVersion,
      manifestVersion: changedManifest.manifestVersion,
      digest: projectManifestDigest(changedManifest),
      expectedDigest: revision.digest,
      manifest: changedManifest,
    });

    const response = await publish(run.app, run.project.id, run.deployment.id);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH' });
    expect(run.migrationApplier.calls).toBe(0);
  });

  it('refuses unmanifested SQL before touching the target', async () => {
    const run = await setup({ withMigrations: false });
    await run.projectStorage.writeFiles(
      run.project.id,
      [{ path: 'migrations/001.sql', content: 'CREATE TABLE unsafe_unpinned (id int);' }],
      { expectedOrganizationId: run.project.organizationId },
    );

    const response = await publish(run.app, run.project.id, run.deployment.id);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'MIGRATION_MANIFEST_INVALID' });
    expect(run.migrationApplier.calls).toBe(0);
  });
});
