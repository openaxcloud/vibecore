/**
 * Real Prisma/PostgreSQL transactions, synthetic metadata and receipt fixtures.
 * Opt in with a dedicated loopback control database; never uses shared QA.
 * Physical archive/application behavior belongs to the separate physical harness.
 */
import { randomUUID } from 'node:crypto';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RestoreExecution, RestoreScope } from '../database-restore-contract.js';
import { PrismaDatabaseRestoreRepository } from '../database-restore-repository.js';
import { PrismaApiStore } from '../prisma-store.js';

const dedicatedUrl = process.env.RESTORE_TEST_DATABASE_URL;
const run = dedicatedUrl ? describe : describe.skip;
const digest = 'a'.repeat(64);

let prisma: DatabaseClient;
let store: PrismaApiStore;
let repository: PrismaDatabaseRestoreRepository;

const organizations: string[] = [];

function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

async function observeAdmission(phase: string, operation: Promise<RestoreExecution>) {
  const startedAt = performance.now();

  try {
    return await operation;
  } catch (error) {
    const failure = error as { code?: unknown; message?: unknown; meta?: { error?: unknown } };

    if (failure?.code === 'P2028') {
      const diagnostic = `${String(failure.message ?? '')} ${String(failure.meta?.error ?? '')}`;

      // Never emit a query, connection string, parameter or raw exception.
      console.error(
        JSON.stringify({
          event: 'RESTORE_ADMISSION_TRANSACTION_DIAGNOSTIC',
          phase,
          code: 'P2028',
          elapsedMs: Math.round(performance.now() - startedAt),
          expired: /expired transaction|transaction.*expired/i.test(diagnostic),
          closed: /already closed/i.test(diagnostic),
          startFailed: /start a transaction|acquir.*transaction/i.test(diagnostic),
          timeoutMs: Number(/timeout.*?(\d+)\s*ms/i.exec(diagnostic)?.[1]) || undefined,
        }),
      );
    }

    throw error;
  }
}

run('restore repository (dedicated local PostgreSQL)', () => {
  beforeAll(() => {
    const url = new URL(dedicatedUrl!);

    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port === '55439') {
      throw new Error('Restore tests require a dedicated loopback control database');
    }

    vi.stubEnv('DATABASE_URL', dedicatedUrl);
    prisma = createDatabaseClient({ poolMax: 4 });
    store = new PrismaApiStore(prisma);
    repository = new PrismaDatabaseRestoreRepository(prisma);
  });

  afterEach(async () => {
    // Only the synthetic tenants created by this file, never a broad table wipe.
    for (const id of organizations.splice(0)) {
      await prisma.project.deleteMany({ where: { organizationId: id } });
      await prisma.organization.delete({ where: { id } });
    }
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    vi.unstubAllEnvs();
  });

  async function seed(environment: 'development' | 'production' = 'development') {
    const organization = await prisma.organization.create({
      data: { name: 'Restore repository fixture', slug: `restore-repository-${randomUUID()}` },
    });
    organizations.push(organization.id);

    const project = await store.createProject({ organizationId: organization.id, name: 'Fixture', slug: 'fixture' });

    const instance = await store.createDatabaseInstance({
      projectId: project.id,
      organizationId: organization.id,
      retentionDays: 7,
      environment,
    });

    const active = await store.updateDatabaseInstance(instance.id, { status: 'ACTIVE' });
    await store.upsertProjectSecret({
      projectId: project.id,
      key: environment === 'production' ? 'PROD_DATABASE_URL' : 'DATABASE_URL',
      valueEncrypted: 'fixture-cipher-original',
    });

    if (!active) {
      throw new Error('Fixture instance missing');
    }

    return { project, instance: active, targetTimestamp: new Date(Date.now() - 60_000).toISOString() };
  }

  async function prepared(execution: RestoreExecution, token: string) {
    const scope: RestoreScope = {
      operationId: execution.restore.id,
      instanceId: execution.instance.id,
      projectId: execution.instance.projectId,
      organizationId: execution.instance.organizationId,
      environment: execution.instance.environment,
      attemptToken: token,
    };
    expect(await repository.claim(execution.restore.id, token)).toBeDefined();

    // Explicit receipt fixtures isolate atomic persistence from driver behavior.
    expect(
      await repository.checkpoint(execution.restore.id, token, 'PENDING', {
        phase: 'CUTOVER',
        archive: {
          ...scope,
          archiveId: 'fixture-archive',
          manifestSha256: digest,
          expectedReadbackSha256: digest,
          sourceInstanceId: execution.instance.id,
          sourceSystemIdentifier: 'fixture-system',
          targetTimestamp: execution.restore.targetTimestamp!,
        },
        target: { ...scope, targetId: execution.targetId, systemIdentifier: 'fixture-system' },
        quiescence: { ...scope, receiptId: 'fixture-quiescence' },
        targetConnectionEncrypted: 'fixture-cipher-target',
      }),
    ).toBe(true);

    return scope;
  }

  it('admits exactly one concurrent operation for the same instance', async () => {
    const input = await seed();
    const entered = deferred();
    const release = deferred();

    const gated = prisma.$extends({
      query: {
        databaseRestoreExecution: {
          async create({ args, query }) {
            // The real PostgreSQL INSERT ran; only its transaction return is held.
            const row = await query(args);
            entered.resolve();
            await release.promise;

            return row;
          },
        },
      },
    });

    const first = new PrismaDatabaseRestoreRepository(gated as unknown as DatabaseClient);

    const outcome = observeAdmission('first-before-commit', first.admit(input)).then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ value: undefined, error }),
    );

    try {
      await Promise.race([
        entered.promise,
        outcome.then(() => {
          throw new Error('The real admission did not reach its transaction barrier');
        }),
      ]);
      expect(await prisma.databaseRestore.count({ where: { databaseInstanceId: input.instance.id } })).toBe(0);
      await expect(observeAdmission('concurrent-before-commit', repository.admit(input))).rejects.toMatchObject({
        code: 'RESTORE_ADMISSION_BUSY',
        statusCode: 409,
      });
    } finally {
      release.resolve();
      await outcome;
    }

    const admitted = await outcome;
    expect(admitted.error).toBeUndefined();
    expect(admitted.value?.active).toBe(true);
    await expect(observeAdmission('after-commit', repository.admit(input))).rejects.toMatchObject({
      code: 'RESTORE_ALREADY_RUNNING',
    });
    expect((await repository.get(admitted.value!.restore.id))?.targetId).toBe(admitted.value!.targetId);
    expect(await prisma.databaseRestore.count({ where: { databaseInstanceId: input.instance.id } })).toBe(1);
  });

  it('reports a busy project without inventing a restore, then safely admits a retry after release', async () => {
    const input = await seed();
    const lock = new Client({ connectionString: dedicatedUrl });
    await lock.connect();

    try {
      await lock.query('BEGIN');
      await lock.query('SELECT id FROM "Project" WHERE id = $1 FOR UPDATE', [input.project.id]);
      await expect(observeAdmission('unrelated-project-lock', repository.admit(input))).rejects.toMatchObject({
        code: 'RESTORE_ADMISSION_BUSY',
        statusCode: 409,
      });
      expect(await prisma.databaseRestore.count({ where: { databaseInstanceId: input.instance.id } })).toBe(0);
      expect((await store.getProjectSecret(input.project.id, 'DATABASE_URL'))?.valueEncrypted).toBe(
        'fixture-cipher-original',
      );
    } finally {
      await lock.query('ROLLBACK');
      await lock.end();
    }

    const admitted = await observeAdmission('retry-after-project-release', repository.admit(input));
    expect(admitted).toMatchObject({ active: true, phase: 'PENDING' });
    await expect(observeAdmission('retry-after-persisted-admission', repository.admit(input))).rejects.toMatchObject({
      code: 'RESTORE_ALREADY_RUNNING',
    });
    expect(await prisma.databaseRestore.count({ where: { databaseInstanceId: input.instance.id } })).toBe(1);
    expect((await repository.get(admitted.restore.id))?.targetId).toBe(admitted.targetId);
  });

  it('keeps development and production admission/binding scopes separate', async () => {
    const input = await seed();

    const production = await store.createDatabaseInstance({
      projectId: input.project.id,
      organizationId: input.project.organizationId,
      environment: 'production',
      retentionDays: 7,
    });

    const active = await store.updateDatabaseInstance(production.id, { status: 'ACTIVE' });
    await store.upsertProjectSecret({
      projectId: input.project.id,
      key: 'PROD_DATABASE_URL',
      valueEncrypted: 'fixture-production',
    });

    const developmentJob = await repository.admit(input);
    const productionJob = await repository.admit({ ...input, instance: active! });
    expect(developmentJob.restore.id).not.toBe(productionJob.restore.id);
    await prepared(developmentJob, 'fixture-development');
    await repository.cutover(developmentJob.restore.id, 'fixture-development');
    expect((await store.getProjectSecret(input.project.id, 'PROD_DATABASE_URL'))?.valueEncrypted).toBe(
      'fixture-production',
    );
    expect((await store.getDatabaseInstanceByProject(input.project.id, 'production'))?.bindingVersion).toBe(0);
  });

  it('locks both managed-secret and homonymous env-var writes while allowing unrelated configuration', async () => {
    const input = await seed();
    await repository.admit(input);

    for (const write of [
      () => store.upsertProjectSecret({ projectId: input.project.id, key: 'DATABASE_URL', valueEncrypted: 'other' }),
      () => store.deleteProjectSecret(input.project.id, 'DATABASE_URL'),
      () => store.upsertProjectEnvVar({ projectId: input.project.id, key: 'DATABASE_URL', value: 'other' }),
      () => store.deleteProjectEnvVar(input.project.id, 'DATABASE_URL'),
    ]) {
      await expect(write()).rejects.toMatchObject({ code: 'RESTORE_BINDING_LOCKED' });
    }
    await expect(
      store.upsertProjectEnvVar({ projectId: input.project.id, key: 'COLOR', value: 'blue' }),
    ).resolves.toMatchObject({ value: 'blue' });
    expect((await store.getProjectSecret(input.project.id, 'DATABASE_URL'))?.valueEncrypted).toBe(
      'fixture-cipher-original',
    );
  });

  it('refuses admission when a homonymous environment variable makes the binding ambiguous', async () => {
    const input = await seed();
    await store.upsertProjectEnvVar({ projectId: input.project.id, key: 'DATABASE_URL', value: 'fixture' });
    await expect(repository.admit(input)).rejects.toMatchObject({ code: 'RESTORE_BINDING_AMBIGUOUS' });
    expect(await prisma.databaseRestore.count({ where: { databaseInstanceId: input.instance.id } })).toBe(0);
  });

  it('refuses a legacy secret row without an encrypted connection before creating a restore', async () => {
    const input = await seed();
    await prisma.projectSecret.update({
      where: { projectId_key: { projectId: input.project.id, key: 'DATABASE_URL' } },
      data: { valueEncrypted: null },
    });
    await expect(repository.admit(input)).rejects.toMatchObject({ code: 'RESTORE_BINDING_MISSING' });
    expect(await prisma.databaseRestore.count({ where: { databaseInstanceId: input.instance.id } })).toBe(0);
  });

  it('holds project transfer/deletion until an early failure explicitly releases the journal', async () => {
    const input = await seed();
    const execution = await repository.admit(input);

    for (const mutation of [
      () => store.softDeleteProject(input.project.id),
      () => store.prepareProjectDeletion(input.project.id, input.project.organizationId),
      () => store.hardDeleteProject(input.project.id),
      () => store.transferProject({ projectId: input.project.id, targetOrganizationId: input.project.organizationId }),
    ]) {
      await expect(mutation()).rejects.toMatchObject({ code: 'RESTORE_PROJECT_LOCKED' });
    }
    await repository.claim(execution.restore.id, 'fixture-attempt');
    await repository.fail(execution.restore.id, 'fixture-attempt', 'RESTORE_ARCHIVE_INVALID');
    expect((await store.softDeleteProject(input.project.id)).deletedAt).toBeDefined();
  });

  it('keeps the durable target handle and deletion fence after an uncertain preparation failure', async () => {
    const input = await seed();
    const execution = await repository.admit(input);
    await repository.claim(execution.restore.id, 'fixture-attempt');
    expect(
      await repository.checkpoint(execution.restore.id, 'fixture-attempt', 'PENDING', { phase: 'PREPARING' }),
    ).toBe(true);
    await repository.fail(execution.restore.id, 'fixture-attempt', 'RESTORE_PREPARING_FAILED');
    expect(await repository.get(execution.restore.id)).toMatchObject({
      phase: 'RECOVERY_REQUIRED',
      resumePhase: 'PREPARING',
      active: true,
      targetId: execution.targetId,
    });
    await expect(repository.admit(input)).rejects.toMatchObject({ code: 'RESTORE_ALREADY_RUNNING' });
    await expect(store.hardDeleteProject(input.project.id)).rejects.toMatchObject({ code: 'RESTORE_PROJECT_LOCKED' });
    expect(await repository.get(execution.restore.id)).toBeDefined();
  });

  it('atomically activates initial provisioning once and rejects a later competing result', async () => {
    const input = await seed();
    const expected = await store.updateDatabaseInstance(input.instance.id, { status: 'PROVISIONING' });
    const expectedSecret = await store.getProjectSecret(input.project.id, 'DATABASE_URL');

    const first = await store.reconcileDatabaseProvisioning({
      expected: expected!,
      binding: { expectedSecret, valueEncrypted: 'first-provision-cipher' },
    });
    expect(first).toMatchObject({ status: 'ACTIVE', bindingVersion: 0 });
    expect(
      await store.reconcileDatabaseProvisioning({
        expected: expected!,
        binding: { expectedSecret, valueEncrypted: 'late-provision-cipher' },
      }),
    ).toBeUndefined();
    expect((await store.getProjectSecret(input.project.id, 'DATABASE_URL'))?.valueEncrypted).toBe(
      'first-provision-cipher',
    );
  });

  it('preserves an explicit secret change made while the provisioner response was pending', async () => {
    const input = await seed();
    const expected = await store.updateDatabaseInstance(input.instance.id, { status: 'PROVISIONING' });
    const expectedSecret = await store.getProjectSecret(input.project.id, 'DATABASE_URL');
    await store.upsertProjectSecret({
      projectId: input.project.id,
      key: 'DATABASE_URL',
      valueEncrypted: 'explicit-user-change',
    });
    expect(
      await store.reconcileDatabaseProvisioning({
        expected: expected!,
        binding: { expectedSecret, valueEncrypted: 'late-provision-cipher' },
      }),
    ).toBeUndefined();
    expect((await store.getProjectSecret(input.project.id, 'DATABASE_URL'))?.valueEncrypted).toBe(
      'explicit-user-change',
    );
    expect((await store.getDatabaseInstanceByProject(input.project.id))?.status).toBe('PROVISIONING');
  });

  it('changes binding, encrypted secret and phase atomically, rejecting stale ownership', async () => {
    const input = await seed();
    const execution = await repository.admit(input);
    await prepared(execution, 'fixture-attempt');
    await expect(repository.cutover(execution.restore.id, 'stale-attempt')).rejects.toMatchObject({
      code: 'RESTORE_ATTEMPT_STALE',
    });
    expect((await store.getProjectSecret(input.project.id, 'DATABASE_URL'))?.valueEncrypted).toBe(
      'fixture-cipher-original',
    );

    const cutover = await repository.cutover(execution.restore.id, 'fixture-attempt');
    expect(cutover).toMatchObject({ phase: 'VERIFYING', appliedBindingVersion: 1 });
    expect((await store.getDatabaseInstanceByProject(input.project.id))?.activeTargetRef).toBe(execution.targetId);
    expect((await store.getProjectSecret(input.project.id, 'DATABASE_URL'))?.valueEncrypted).toBe(
      'fixture-cipher-target',
    );
    await expect(repository.cutover(execution.restore.id, 'fixture-attempt')).rejects.toMatchObject({
      code: 'RESTORE_ATTEMPT_STALE',
    });
  });

  it('rejects a binding changed before cutover without a partial reference write', async () => {
    const input = await seed();
    const execution = await repository.admit(input);
    await prepared(execution, 'fixture-attempt');

    // Direct SQL fixture emulates an out-of-protocol writer; normal store calls are fenced.
    await prisma.projectSecret.update({
      where: { projectId_key: { projectId: input.project.id, key: 'DATABASE_URL' } },
      data: { valueEncrypted: 'external-fixture-write' },
    });
    await expect(repository.cutover(execution.restore.id, 'fixture-attempt')).rejects.toMatchObject({
      code: 'RESTORE_BINDING_CHANGED',
    });

    const current = await store.getDatabaseInstanceByProject(input.project.id);
    expect(current).toMatchObject({ bindingVersion: 0 });
    expect(current?.activeTargetRef).toBeUndefined();
    expect((await repository.get(execution.restore.id))?.phase).toBe('CUTOVER');
  });

  it('rejects old checkpoints and failures after durable ownership changes', async () => {
    const input = await seed();
    const execution = await repository.admit(input);
    await prepared(execution, 'old-attempt');
    expect(await repository.resume(execution.restore.id, 'old-attempt', 'new-attempt')).toBeDefined();
    expect(await repository.checkpoint(execution.restore.id, 'old-attempt', 'CUTOVER', { phase: 'FAILED' })).toBe(
      false,
    );
    await repository.fail(execution.restore.id, 'old-attempt', 'LATE_ERROR');
    expect(await repository.get(execution.restore.id)).toMatchObject({
      runnerToken: 'new-attempt',
      phase: 'CUTOVER',
      active: true,
    });
  });

  it('prevents a legacy writer from completing or failing a coordinated restore', async () => {
    const input = await seed();
    const execution = await repository.admit(input);

    for (const status of ['FAILED', 'COMPLETED'] as const) {
      expect(await store.updateDatabaseRestore(execution.restore.id, { status })).toBeUndefined();
    }
    expect((await store.listDatabaseRestores(input.instance.id))[0]).toMatchObject({
      status: 'PENDING',
      phase: 'PENDING',
      applicationCutoverVerified: false,
    });
    expect(await store.listPendingDatabaseRestores()).not.toContainEqual(
      expect.objectContaining({ id: execution.restore.id }),
    );
  });

  it('keeps completion unverified until readback and release receipts are durable', async () => {
    const input = await seed();

    // A legacy request captured this state before another request activated it.
    const staleProvisioning = await store.updateDatabaseInstance(input.instance.id, { status: 'PROVISIONING' });
    const staleSecret = await store.getProjectSecret(input.project.id, 'DATABASE_URL');
    await store.reconcileDatabaseProvisioning({
      expected: staleProvisioning!,
      binding: { expectedSecret: staleSecret, valueEncrypted: 'fixture-cipher-original' },
    });

    const execution = await repository.admit(input);
    const scope = await prepared(execution, 'fixture-attempt');
    await repository.cutover(execution.restore.id, 'fixture-attempt');
    expect(
      await repository.checkpoint(execution.restore.id, 'fixture-attempt', 'VERIFYING', {
        phase: 'RELEASING',
        readback: {
          ...scope,
          receiptId: 'fixture-readback',
          targetId: execution.targetId,
          bindingVersion: 1,
          systemIdentifier: 'fixture-system',
          previousPoolClosed: true,
          newConnection: true,
          observedReadbackSha256: digest,
        },
      }),
    ).toBe(true);
    await expect(repository.complete(execution.restore.id, 'fixture-attempt')).rejects.toMatchObject({
      code: 'RESTORE_BINDING_CHANGED',
    });
    expect((await store.listDatabaseRestores(input.instance.id))[0]).toMatchObject({
      status: 'RUNNING',
      applicationCutoverVerified: false,
    });
    expect(
      await repository.checkpoint(execution.restore.id, 'fixture-attempt', 'RELEASING', {
        phase: 'RELEASING',
        release: { ...scope, receiptId: 'fixture-release', targetId: execution.targetId, bindingVersion: 1 },
      }),
    ).toBe(true);
    expect(await repository.complete(execution.restore.id, 'fixture-attempt')).toMatchObject({
      phase: 'COMPLETED',
      active: false,
    });
    expect((await store.listDatabaseRestores(input.instance.id))[0]).toMatchObject({
      status: 'COMPLETED',
      applicationCutoverVerified: true,
    });

    /*
     * Two old HTTP continuations arrive after the lock has been released.
     * Neither old GET binding nor old POST status may overwrite the new target.
     */
    expect(
      await store.reconcileDatabaseProvisioning({
        expected: staleProvisioning!,
        binding: { expectedSecret: staleSecret, valueEncrypted: 'late-old-cluster-cipher' },
      }),
    ).toBeUndefined();
    expect(await store.reconcileDatabaseProvisioning({ expected: staleProvisioning! })).toBeUndefined();
    expect(await store.getDatabaseInstanceByProject(input.project.id)).toMatchObject({
      status: 'ACTIVE',
      activeTargetRef: execution.targetId,
      bindingVersion: 1,
    });
    expect((await store.getProjectSecret(input.project.id, 'DATABASE_URL'))?.valueEncrypted).toBe(
      'fixture-cipher-target',
    );

    for (const mutation of [
      () => store.prepareProjectDeletion(input.project.id, input.project.organizationId),
      () => store.hardDeleteProject(input.project.id),
      () => store.transferProject({ projectId: input.project.id, targetOrganizationId: input.project.organizationId }),
    ]) {
      await expect(mutation()).rejects.toMatchObject({
        code: 'RESTORE_TARGET_LIFECYCLE_UNAVAILABLE',
        statusCode: 503,
      });
    }
    await expect(
      store.createDatabaseSnapshot({ databaseInstanceId: input.instance.id, kind: 'manual' }),
    ).rejects.toMatchObject({ code: 'RESTORE_BACKUP_TARGET_UNAVAILABLE', statusCode: 503 });
    expect(await prisma.databaseSnapshot.count({ where: { databaseInstanceId: input.instance.id } })).toBe(0);
    await expect(
      store.upsertProjectSecret({
        projectId: input.project.id,
        key: 'DATABASE_URL',
        valueEncrypted: 'later-explicit-fixture-change',
      }),
    ).resolves.toBeDefined();
  });
});
