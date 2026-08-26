/* eslint-disable no-restricted-imports -- API Vitest resolves service-relative modules, not the web `~/` alias. */
import { hashPassword } from '@vibecore/auth';
import { encryptJson } from '@vibecore/security';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { DatabaseProvisioner } from '../database-provisioner.js';
import { sha256, type MigrationTargetInspection, type SqlApplier } from '../db-migration-execution.js';
import type { EmailProvider } from '../email.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {
    return undefined;
  }
}

class MemoryStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();
  async writeFiles(projectId: string, files: Array<{ path: string; content: string }>) {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();

    for (const file of files) {
      bucket.set(file.path, file.content);
    }
    this.files.set(projectId, bucket);

    return this.listFiles(projectId);
  }
  async listFiles(projectId: string): Promise<ProjectFile[]> {
    return [...(this.files.get(projectId) ?? new Map()).entries()].map(([path, content]) => ({
      path,
      content,
      updatedAt: '',
    }));
  }
  async createSnapshot() {
    return { id: 's', storageKey: 's', byteLength: 0, createdAt: '' };
  }
  async getSnapshotFiles() {
    return [];
  }
  async restoreSnapshot() {
    return [];
  }
  async readFile() {
    return undefined;
  }
  async deleteFiles() {
    return undefined;
  }
  async deleteProjectFiles() {
    return undefined;
  }
  async exportZip() {
    return { storageKey: '', byteLength: 0, base64: '', createdAt: '' };
  }
  async importZip() {
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
    migrationApplier,
  });
  const user = await store.createUser({
    email: 'mig@example.com',
    name: 'Mig',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Mig Org', slug: 'mig-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'mig-token', expiresAt: new Date(Date.now() + 3_600_000) });

  const project = await store.createProject({ organizationId: org.id, name: 'Mig P', slug: 'mig-p' });

  if (options.withMigrations !== false) {
    const first = 'CREATE TABLE test_users (id bigint PRIMARY KEY);';
    const second = 'ALTER TABLE test_users ADD COLUMN name text;';
    await projectStorage.writeFiles(project.id, [
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
    ]);
  }

  if (options.connection !== false) {
    await store.upsertProjectSecret({
      projectId: project.id,
      key: 'PROD_DATABASE_URL',
      valueEncrypted: encryptJson({ value: 'postgres://user:pw@prod-host:5432/appdb' }),
    });
  }

  const deployment = await store.createDeployment({
    projectId: project.id,
    organizationId: org.id,
    environment: 'preview',
    status: 'READY',
    provider: 'server',
  } as any);

  return { app, store, projectStorage, project, deployment, migrationApplier };
}

const publish = (app: any, projectId: string, deploymentId: string) =>
  app.inject({
    method: 'POST',
    url: `/projects/${projectId}/deployments/${deploymentId}/publish`,
    headers: { authorization: 'Bearer mig-token' },
  });

describe('schema migration before publish route', () => {
  it('publishes only after backup, fenced apply and target verification', async () => {
    const run = await setup();
    const response = await publish(run.app, run.project.id, run.deployment.id);
    expect(response.statusCode).toBe(201);
    expect(run.migrationApplier.calls).toBe(1);
    expect([...run.store.migrationExecutions.values()][0]).toMatchObject({
      state: 'COMMITTED',
      environment: 'production',
      activeLock: undefined,
      backupVerificationMethod: 'cnpg-backup-status-completed',
      appliedStatements: 2,
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

    run.store.listProjectEnvVars = async () => {
      throw new Error('control-plane database unavailable');
    };

    const response = await publish(run.app, run.project.id, run.deployment.id);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'MIGRATION_TARGET_UNAVAILABLE', retryable: true });
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

  it('refuses unmanifested SQL before touching the target', async () => {
    const run = await setup({ withMigrations: false });
    await run.projectStorage.writeFiles(run.project.id, [
      { path: 'migrations/001.sql', content: 'CREATE TABLE unsafe_unpinned (id int);' },
    ]);

    const response = await publish(run.app, run.project.id, run.deployment.id);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'MIGRATION_MANIFEST_INVALID' });
    expect(run.migrationApplier.calls).toBe(0);
  });
});
