/** Real metadata transactions only; no provider calls, backup bytes or credentials. */
import { randomUUID } from 'node:crypto';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaDatabaseBackupProvenanceRepository } from '../database-backup-provenance.js';
import { PrismaApiStore } from '../prisma-store.js';

const url = process.env.RESTORE_TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('durable backup provenance (dedicated local PostgreSQL)', () => {
  let first: DatabaseClient;
  let second: DatabaseClient;
  let repository: PrismaDatabaseBackupProvenanceRepository;
  let peer: PrismaDatabaseBackupProvenanceRepository;

  const organizations: string[] = [];

  beforeAll(() => {
    const endpoint = new URL(url!);

    if (
      endpoint.hostname !== '127.0.0.1' ||
      !endpoint.port ||
      endpoint.port === '55439' ||
      !(endpoint.pathname === '/backup_provenance_proof' || /^\/vibecore_restore_ci_[a-f0-9]+$/.test(endpoint.pathname))
    ) {
      throw new Error('Disposable local provenance database required');
    }

    vi.stubEnv('DATABASE_URL', url);
    first = createDatabaseClient({ poolMax: 3 });
    second = createDatabaseClient({ poolMax: 3 });
    repository = new PrismaDatabaseBackupProvenanceRepository(first);
    peer = new PrismaDatabaseBackupProvenanceRepository(second);
  });
  afterAll(async () => {
    try {
      if (first) {
        await first.organization.deleteMany({ where: { id: { in: organizations } } });
      }
    } finally {
      await Promise.all([first?.$disconnect(), second?.$disconnect()]);
      vi.unstubAllEnvs();
    }
  });

  async function seed(environment: 'development' | 'production' = 'development') {
    const organization = await first.organization.create({ data: { name: 'Backup fixture', slug: randomUUID() } });
    organizations.push(organization.id);

    const project = await first.project.create({
      data: { organizationId: organization.id, name: 'Backup fixture', slug: randomUUID() },
    });
    const instance = await first.databaseInstance.create({
      data: { projectId: project.id, organizationId: organization.id, environment, status: 'ACTIVE' },
    });
    const context = {
      projectId: project.id,
      organizationId: organization.id,
      instanceId: instance.id,
      environment,
      bindingVersion: 0,
    };

    return {
      context,
      reservation: {
        ...context,
        snapshotId: randomUUID(),
        sourceName: `db-${project.id}`,
        sourceUid: randomUUID(),
        backupName: `bkp-${randomUUID()}`,
      },
    };
  }

  it.each(['manual-cuid', 'mig_EXEC', 'ckdb_UUID'])(
    'persists independent %s identifiers without a snapshot row and survives a fresh client',
    async (prefix) => {
      const { context, reservation } = await seed();
      reservation.snapshotId = `${prefix}_${randomUUID()}`;
      expect(await repository.getContext(context.projectId, context.environment)).toEqual(context);

      const created = await repository.reserve(reservation);
      expect(created).toMatchObject(reservation);
      expect(created.nonce).not.toBe(created.id);

      const bound = await repository.bindUid(created.id, randomUUID());
      const fresh = createDatabaseClient({ poolMax: 1 });

      try {
        expect(
          await new PrismaDatabaseBackupProvenanceRepository(fresh).get(
            context.projectId,
            context.environment,
            reservation.snapshotId,
          ),
        ).toEqual(bound);
      } finally {
        await fresh.$disconnect();
      }
      expect(await first.databaseSnapshot.count({ where: { databaseInstanceId: context.instanceId } })).toBe(0);
    },
  );

  it('generates its own identity and never accepts an unverified UID in reservation input', async () => {
    const { reservation } = await seed();
    const input = { ...reservation, id: 'caller-id', nonce: 'caller-nonce', backupUid: 'unverified-uid' };
    const record = await repository.reserve(input);
    expect(record.id).not.toBe(input.id);
    expect(record.nonce).not.toBe(input.nonce);
    expect(record.backupUid).toBeUndefined();
  });

  it('serializes identical reservations from independent clients and preserves the original nonce', async () => {
    const { reservation } = await seed();

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => (i % 2 ? repository : peer).reserve(reservation)),
    );
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(new Set(results.map((row) => row.nonce)).size).toBe(1);
    expect(await first.databaseBackupProvenance.count({ where: { instanceId: reservation.instanceId } })).toBe(1);
  });

  it('never changes a reserved source/name identity when competing reservations disagree', async () => {
    const { reservation } = await seed();

    const result = await Promise.allSettled([
      repository.reserve(reservation),
      peer.reserve({ ...reservation, sourceUid: randomUUID() }),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);

    const rejected = result.find((item) => item.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'BACKUP_PROVENANCE_CONFLICT' });

    const record = await repository.get(reservation.projectId, reservation.environment, reservation.snapshotId);
    await expect(
      repository.reserve({ ...reservation, sourceUid: record!.sourceUid, backupName: 'different-name' }),
    ).rejects.toMatchObject({ code: 'BACKUP_PROVENANCE_CONFLICT' });
  });

  it('binds a provider UID once under concurrent clients and permits only exact lost-ack replay', async () => {
    const { reservation } = await seed();
    const created = await repository.reserve(reservation);

    const result = await Promise.allSettled([
      repository.bindUid(created.id, 'uid-one'),
      peer.bindUid(created.id, 'uid-two'),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect((result.find((item) => item.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({
      code: 'BACKUP_PROVENANCE_CONFLICT',
    });

    const bound = await repository.get(reservation.projectId, reservation.environment, reservation.snapshotId);
    expect(await peer.bindUid(created.id, bound!.backupUid!)).toEqual(bound);
    await expect(repository.bindUid(created.id, 'replacement')).rejects.toMatchObject({
      code: 'BACKUP_PROVENANCE_CONFLICT',
    });
    expect((await repository.get(reservation.projectId, reservation.environment, reservation.snapshotId))?.nonce).toBe(
      created.nonce,
    );
  });

  it('does not disclose another project or environment and rejects a forged organization/instance', async () => {
    const { reservation } = await seed();
    const other = await seed('production');
    await repository.reserve(reservation);
    expect(await repository.get(other.context.projectId, 'production', reservation.snapshotId)).toBeUndefined();
    expect(await repository.get(reservation.projectId, 'production', reservation.snapshotId)).toBeUndefined();
    await expect(
      repository.reserve({ ...reservation, organizationId: other.context.organizationId }),
    ).rejects.toMatchObject({ code: 'BACKUP_CONTEXT_CHANGED' });
    await expect(repository.reserve({ ...reservation, instanceId: other.context.instanceId })).rejects.toMatchObject({
      code: 'BACKUP_CONTEXT_CHANGED',
    });
  });

  it('rejects stale intent after real project transfer, without reading project secrets', async () => {
    const { context, reservation } = await seed();
    const target = await seed();
    const created = await repository.reserve(reservation);
    const store = new PrismaApiStore(first);
    expect(store.backupProvenance).toBeInstanceOf(PrismaDatabaseBackupProvenanceRepository);
    await store.transferProject({
      projectId: context.projectId,
      expectedSourceOrganizationId: context.organizationId,
      targetOrganizationId: target.context.organizationId,
    });
    expect(await repository.get(context.projectId, context.environment, reservation.snapshotId)).toBeUndefined();
    await expect(peer.bindUid(created.id, 'late-provider-uid')).rejects.toMatchObject({
      code: 'BACKUP_CONTEXT_CHANGED',
    });
    await expect(repository.reserve(reservation)).rejects.toMatchObject({ code: 'BACKUP_CONTEXT_CHANGED' });
    expect(
      (await first.databaseBackupProvenance.findUniqueOrThrow({ where: { id: created.id } })).backupUid,
    ).toBeNull();
  });

  it.each(['reserve', 'bind'] as const)(
    'rechecks context after %s waits behind a concurrent binding mutation',
    async (operation) => {
      const { context, reservation } = await seed();
      const record = await repository.reserve(reservation);
      const competingClient = createDatabaseClient({ poolMax: 1 });
      const competing = new PrismaDatabaseBackupProvenanceRepository(competingClient);
      const [{ pid }] = await competingClient.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;

      let result: Promise<unknown> | undefined;

      try {
        await first.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${context.projectId} FOR UPDATE`;
          result = (
            operation === 'reserve'
              ? competing.reserve({ ...reservation, snapshotId: randomUUID() })
              : competing.bindUid(record.id, 'after-concurrent-mutation')
          ).catch((error: unknown) => error);

          let blocked = false;

          for (let i = 0; i < 100; i++) {
            await tx.$executeRaw`SELECT pg_stat_clear_snapshot()`;

            const activity = await tx.$queryRaw<
              Array<{ wait_event_type: string | null }>
            >`SELECT wait_event_type FROM pg_stat_activity WHERE pid = ${pid}`;

            if (activity[0]?.wait_event_type === 'Lock') {
              blocked = true;
              break;
            }

            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          expect(blocked).toBe(true);
          await tx.databaseInstance.update({ where: { id: context.instanceId }, data: { bindingVersion: 1 } });
        });
        expect(await result).toMatchObject({ code: 'BACKUP_CONTEXT_CHANGED' });
        expect(await first.databaseBackupProvenance.count({ where: { instanceId: context.instanceId } })).toBe(1);
        expect(
          (await first.databaseBackupProvenance.findUniqueOrThrow({ where: { id: record.id } })).backupUid,
        ).toBeNull();
      } finally {
        await result;
        await competingClient.$disconnect();
      }
    },
  );

  it('rejects a changed binding version without rewriting the original intent', async () => {
    const { context, reservation } = await seed();
    const created = await repository.reserve(reservation);
    await first.databaseInstance.update({ where: { id: context.instanceId }, data: { bindingVersion: 1 } });
    expect(await repository.get(context.projectId, context.environment, reservation.snapshotId)).toBeUndefined();
    await expect(repository.bindUid(created.id, 'late-uid')).rejects.toMatchObject({ code: 'BACKUP_CONTEXT_CHANGED' });
    await expect(repository.reserve(reservation)).rejects.toMatchObject({ code: 'BACKUP_CONTEXT_CHANGED' });
    await expect(repository.reserve({ ...reservation, bindingVersion: 1 })).rejects.toMatchObject({
      code: 'BACKUP_PROVENANCE_CONFLICT',
    });
  });

  it.each(['restored-target', 'deleted-project', 'deleting-runtime', 'inactive', 'active-restore'])(
    'fails closed for %s before reserve and UID binding',
    async (condition) => {
      const { context, reservation } = await seed();
      const created = await repository.reserve(reservation);

      if (condition === 'restored-target') {
        await first.databaseInstance.update({
          where: { id: context.instanceId },
          data: { activeTargetRef: 'restored-target' },
        });
      }

      if (condition === 'deleted-project') {
        await first.project.update({ where: { id: context.projectId }, data: { deletedAt: new Date() } });
      }

      if (condition === 'deleting-runtime') {
        await first.project.update({ where: { id: context.projectId }, data: { runtimeDeletionPending: true } });
      }

      if (condition === 'inactive') {
        await first.databaseInstance.update({ where: { id: context.instanceId }, data: { status: 'PROVISIONING' } });
      }

      if (condition === 'active-restore') {
        const restore = await first.databaseRestore.create({ data: { databaseInstanceId: context.instanceId } });
        await first.databaseRestoreExecution.create({
          data: {
            restoreId: restore.id,
            activeLock: context.instanceId,
            expectedBindingVersion: 0,
            originalSecretEncrypted: 'unused-synthetic-fixture',
            targetId: randomUUID(),
          },
        });
      }

      expect(await repository.getContext(context.projectId, context.environment)).toBeUndefined();
      expect(await repository.get(context.projectId, context.environment, reservation.snapshotId)).toBeUndefined();
      await expect(repository.reserve({ ...reservation, snapshotId: randomUUID() })).rejects.toMatchObject({
        code: 'BACKUP_CONTEXT_CHANGED',
      });
      await expect(repository.bindUid(created.id, 'late-uid')).rejects.toMatchObject({
        code: 'BACKUP_CONTEXT_CHANGED',
      });
    },
  );

  it('cascades only with the owning instance and rejects empty UID rather than binding it', async () => {
    const { context, reservation } = await seed('production');
    const created = await repository.reserve(reservation);
    await expect(repository.bindUid(created.id, '')).rejects.toMatchObject({ code: 'BACKUP_PROVENANCE_INVALID' });
    await first.databaseInstance.delete({ where: { id: context.instanceId } });
    expect(await first.databaseBackupProvenance.count({ where: { id: created.id } })).toBe(0);
    await expect(repository.bindUid(created.id, 'after-delete')).rejects.toMatchObject({
      code: 'BACKUP_CONTEXT_CHANGED',
    });
  });
});
