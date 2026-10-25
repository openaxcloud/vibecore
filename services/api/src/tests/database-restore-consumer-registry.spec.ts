import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaClient, type DatabaseClient } from '@vibecore/database';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RestoreConsumerRegistry } from '../database-restore-consumer-registry.js';
import { PrismaDatabaseRestoreRepository } from '../database-restore-repository.js';
import { PrismaApiStore } from '../prisma-store.js';
import { RegisteredApiConsumerHost, drainRegisteredWorkload } from '../database-restore-consumer-drain.js';

const url = process.env.RESTORE_TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
run('durable consumer registry — isolated PostgreSQL schema, no cloud', () => {
  const schema = `restore_registry_${randomUUID().replaceAll('-', '')}`;
  let prisma: DatabaseClient;
  let control: Client;
  let registry: RestoreConsumerRegistry;
  let repository: PrismaDatabaseRestoreRepository;
  let store: PrismaApiStore;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.port === '55439')
      throw new Error('Dedicated loopback database required');
    control = new Client({ connectionString: url });
    await control.connect();
    await control.query(`CREATE SCHEMA "${schema}"`);
    await control.query(`SET search_path TO "${schema}"`);
    // Prisma qualifies enum input casts with the isolated schema. Domains retain
    // the real public enum constraints without copying any production values.
    for (const name of ['DatabaseInstanceStatus', 'DatabaseRestoreStatus']) {
      await control.query(`CREATE DOMAIN "${name}" AS public."${name}"`);
    }
    // Structure only; never copy client rows. No migration deployed to public.
    for (const name of [
      'Project',
      'DatabaseInstance',
      'DatabaseSnapshot',
      'DatabaseRestore',
      'DatabaseRestoreExecution',
      'ProjectSecret',
      'ProjectEnvVar',
    ]) {
      await control.query(`CREATE TABLE "${name}" (LIKE public."${name}" INCLUDING ALL)`);
    }
    const migration = await readFile(
      new URL(
        '../../../../packages/database/prisma/migrations/0093_database_restore_consumers/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await control.query(migration);
    const adapter = new PrismaPg({ connectionString: url, max: 5, options: `-c search_path=${schema}` }, { schema });
    prisma = new PrismaClient({ adapter });
    registry = new RestoreConsumerRegistry(prisma);
    repository = new PrismaDatabaseRestoreRepository(prisma);
    store = new PrismaApiStore(prisma);
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    if (control) {
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await control.end();
    }
  });
  async function fixture(environment: 'development' | 'production' = 'development') {
    const organizationId = `synthetic-${randomUUID()}`;
    const project = await prisma.project.create({
      data: { organizationId, name: 'Registry fixture', slug: randomUUID() },
    });
    const created = await store.createDatabaseInstance({
      projectId: project.id,
      organizationId,
      environment,
      retentionDays: 7,
    });
    const instance = (await store.updateDatabaseInstance(created.id, { status: 'ACTIVE' }))!;
    await store.upsertProjectSecret({
      projectId: project.id,
      key: environment === 'production' ? 'PROD_DATABASE_URL' : 'DATABASE_URL',
      valueEncrypted: 'synthetic-no-connection',
    });
    const scope = { instanceId: instance.id, projectId: project.id, organizationId, environment };
    const request = { instance, expectedOrganizationId: organizationId, targetTimestamp: new Date().toISOString() };
    return { scope, request };
  }
  const identity = (kind: 'api' | 'workload' = 'api') => ({
    bindingVersion: 0,
    kind,
    uid: randomUUID(),
    generation: randomUUID(),
    leaseUntil: new Date(Date.now() + 60_000),
  });
  async function restoring(f: Awaited<ReturnType<typeof fixture>>) {
    const admitted = await repository.admit(f.request);
    const attemptToken = randomUUID();
    await repository.claim(admitted.restore.id, attemptToken);
    // Synthetic journal setup only; no physical prepare/cutover claimed.
    await prisma.databaseRestoreExecution.update({
      where: { restoreId: admitted.restore.id },
      data: { phase: 'QUIESCING' },
    });
    return { ...f.scope, operationId: admitted.restore.id, attemptToken };
  }
  it('preserves immutable identity, rejects duplicates and stale binding before admitting', async () => {
    const f = await fixture();
    const input = identity();
    expect(await registry.admit(f.scope, input)).toMatchObject({
      ...input,
      instanceId: f.scope.instanceId,
      state: 'ACTIVE',
    });
    await expect(registry.admit(f.scope, input)).rejects.toMatchObject({ code: 'RESTORE_CONSUMER_UID_REUSED' });
    await expect(registry.admit(f.scope, { ...identity(), bindingVersion: 1 })).rejects.toMatchObject({
      code: 'RESTORE_CONSUMER_BINDING_MISMATCH',
    });
  });
  it('uses the real restore admission lock: either registration precedes restore or is refused', async () => {
    const f = await fixture();
    const [consumer, restore] = await Promise.allSettled([
      registry.admit(f.scope, identity()),
      repository.admit(f.request),
    ]);
    if (consumer.status === 'rejected')
      expect(consumer.reason.code).toMatch(/^RESTORE_(ADMISSION_BUSY|ALREADY_RUNNING)$/);
    if (restore.status === 'rejected') expect(restore.reason.code).toBe('RESTORE_ADMISSION_BUSY');
    const admitted = restore.status === 'fulfilled' ? restore.value : await repository.admit(f.request);
    await expect(registry.admit(f.scope, identity())).rejects.toMatchObject({ code: 'RESTORE_ALREADY_RUNNING' });
    const token = randomUUID();
    await repository.claim(admitted.restore.id, token);
    await prisma.databaseRestoreExecution.update({
      where: { restoreId: admitted.restore.id },
      data: { phase: 'QUIESCING' },
    });
    const rows = await registry.freeze({ ...f.scope, operationId: admitted.restore.id, attemptToken: token });
    expect(rows.map((r) => r.id)).toEqual(consumer.status === 'fulfilled' ? [consumer.value.id] : []);
  });
  it('never treats expired lease or registry restart as a stopped consumer', async () => {
    const f = await fixture();
    const row = await registry.admit(f.scope, identity());
    await control.query('UPDATE "DatabaseRestoreConsumer" SET "leaseUntil"=$1 WHERE id=$2', [new Date(0), row.id]);
    const scope = await restoring(f);
    const restarted = new RestoreConsumerRegistry(prisma);
    expect(await restarted.freeze(scope)).toHaveLength(1);
    await expect(restarted.assertRegisteredConsumersDrained(scope)).rejects.toMatchObject({
      code: 'RESTORE_CONSUMERS_NOT_DRAINED',
    });
    await expect(restarted.admit(f.scope, identity())).rejects.toMatchObject({ code: 'RESTORE_ALREADY_RUNNING' });
  });
  it('refuses to drain a different API pool under the registered identity', async () => {
    const f = await fixture();
    const first = new RegisteredApiConsumerHost(registry);
    const second = new RegisteredApiConsumerHost(registry);
    const actual = await first.start(f.scope, identity(), url!);
    const other = await second.start(f.scope, identity(), url!);
    const scope = await restoring(f);
    const rows = await registry.freeze(scope);
    const row = rows.find((r) => r.id === actual.id)!;
    try {
      await expect(second.drain(scope, row)).rejects.toThrow('RESTORE_CONSUMER_HANDLE_MISMATCH');
      expect((await first.query(actual.id, 'SELECT 1 AS value')).rows).toEqual([{ value: 1 }]);
      await expect(registry.assertRegisteredConsumersDrained(scope)).rejects.toMatchObject({
        code: 'RESTORE_CONSUMERS_NOT_DRAINED',
      });
    } finally {
      await first.drain(scope, row);
      await second.drain(scope, rows.find((r) => r.id === other.id)!);
    }
    await expect(first.query(actual.id, 'SELECT 1')).rejects.toThrow('RESTORE_APPLICATION_QUIESCED');
    await prisma.databaseRestoreExecution.update({
      where: { restoreId: scope.operationId },
      data: { activeLock: null },
    });
    await expect(first.start(f.scope, { ...identity(), uid: actual.uid }, url!)).rejects.toMatchObject({
      code: 'RESTORE_CONSUMER_UID_REUSED',
    });
  });
  it('cannot expose a late startup handle after freeze and permanent drainage', async () => {
    const f = await fixture();
    const host = new RegisteredApiConsumerHost(registry);
    let entered!: () => void;
    let proceed!: () => void;
    const waiting = new Promise<void>((r) => {
      entered = r;
    });
    const gate = new Promise<void>((r) => {
      proceed = r;
    });
    const original = registry.assertCanServe.bind(registry);
    const spy = vi.spyOn(registry, 'assertCanServe').mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return original(...args);
    });
    const opening = host.start(f.scope, identity(), url!).catch((error) => error);
    await waiting;
    const scope = await restoring(f);
    const [row] = await registry.freeze(scope);
    try {
      await host.drain(scope, row);
    } finally {
      proceed();
      spy.mockRestore();
    }
    expect(await opening).toMatchObject({ code: 'RESTORE_APPLICATION_QUIESCED' });
    await expect(host.query(row.id, 'SELECT 1')).rejects.toThrow('RESTORE_APPLICATION_QUIESCED');
    expect(await registry.assertRegisteredConsumersDrained(scope)).toMatchObject({
      registeredConsumersDrained: true,
      globalQuiescenceProven: false,
    });
  });
  it('rejects wrong project, environment, organization and immutable UID acknowledgements', async () => {
    const f = await fixture('production');
    await registry.admit(f.scope, identity());
    for (const change of [
      { projectId: 'absent' },
      { environment: 'development' as const },
      { organizationId: 'other' },
    ]) {
      await expect(registry.admit({ ...f.scope, ...change }, identity())).rejects.toMatchObject({
        code: 'RESTORE_INSTANCE_CHANGED',
      });
    }
    const scope = await restoring(f);
    const [row] = await registry.freeze(scope);
    await expect(registry.confirmDrained(scope, { ...row, uid: 'replacement' })).rejects.toMatchObject({
      code: 'RESTORE_CONSUMER_DRAIN_MISMATCH',
    });
    const other = await fixture();
    expect(await registry.admit(other.scope, identity())).toMatchObject({ state: 'ACTIVE' });
  });
  it('waits for a real blocked PostgreSQL query and pool closure before acknowledging API drainage', async () => {
    const f = await fixture();
    const host = new RegisteredApiConsumerHost(registry);
    const admitted = await host.start(f.scope, identity(), url!);
    const scope = await restoring(f);
    const [row] = await registry.freeze(scope);
    const lock = Math.floor(Math.random() * 1e9);
    await control.query('SELECT pg_advisory_lock($1)', [lock]);
    const query = host.query(admitted.id, 'SELECT pg_advisory_xact_lock($1)', [lock]);
    let resolved = false;
    const drain = host.drain(scope, row).then(() => {
      resolved = true;
    });
    try {
      await control.query('SELECT 1');
      expect(resolved).toBe(false);
      const result = await control.query('SELECT state FROM "DatabaseRestoreConsumer" WHERE id=$1', [row.id]);
      expect(result.rows[0].state).toBe('DRAIN_REQUESTED');
    } finally {
      await control.query('SELECT pg_advisory_unlock($1)', [lock]);
    }
    await query;
    await drain;
    expect(await registry.assertRegisteredConsumersDrained(scope)).toEqual({
      registeredConsumersDrained: true,
      globalQuiescenceProven: false,
    });
    await registry.confirmDrained(scope, row);
    await expect(host.query(admitted.id, 'SELECT 1')).rejects.toThrow('RESTORE_APPLICATION_QUIESCED');
  });
  const excludeStarts = async (
    uid: string,
    generation: string,
    scope: Parameters<typeof drainRegisteredWorkload>[1],
  ) => ({
    ...scope,
    uid,
    generation,
    attemptToken: scope.attemptToken,
    startsExcluded: true as const,
  });
  it.each(['unknown', 'still running', 'stop failed'])(
    'does not acknowledge workload %s (controlled driver, not Kubernetes proof)',
    async (kind) => {
      const f = await fixture();
      await registry.admit(f.scope, identity('workload'));
      const scope = await restoring(f);
      const [row] = await registry.freeze(scope);
      const stop = vi.fn(async () => {
        if (kind === 'stop failed') throw new Error('synthetic stop failure');
      });
      const observe = async () => (kind === 'unknown' ? ('unknown' as const) : ('running' as const));
      await expect(drainRegisteredWorkload(registry, scope, row, { stop, observe, excludeStarts })).rejects.toThrow();
      if (kind === 'unknown') expect(stop).not.toHaveBeenCalled();
      await expect(registry.assertRegisteredConsumersDrained(scope)).rejects.toMatchObject({
        code: 'RESTORE_CONSUMERS_NOT_DRAINED',
      });
    },
  );
  it('retains exclusion debt and rejects a stale attempt before a workload stop', async () => {
    const f = await fixture();
    await registry.admit(f.scope, identity('workload'));
    const scope = await restoring(f);
    const [row] = await registry.freeze(scope);
    await prisma.databaseRestoreExecution.update({
      where: { restoreId: scope.operationId },
      data: { runnerToken: 'new-attempt', pendingFenceTokens: [scope.attemptToken] },
    });
    const stop = vi.fn(async () => {});
    const observe = vi.fn(async () => 'terminated' as const);
    await expect(drainRegisteredWorkload(registry, scope, row, { stop, observe, excludeStarts })).rejects.toMatchObject(
      {
        code: 'RESTORE_ATTEMPT_STALE',
      },
    );
    await expect(registry.freeze({ ...scope, attemptToken: 'new-attempt' })).rejects.toMatchObject({
      code: 'RESTORE_ATTEMPT_STALE',
    });
    expect(observe).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });
  it('recovers a lost acknowledgement without claiming a stop from lease expiry', async () => {
    const f = await fixture();
    await registry.admit(f.scope, identity('workload'));
    const scope = await restoring(f);
    const [row] = await registry.freeze(scope);
    let terminated = false;
    const stop = vi.fn(async () => {
      terminated = true;
    });
    const observe = async () => (terminated ? ('terminated' as const) : ('running' as const));
    const fail = vi
      .spyOn(registry, 'confirmDrained')
      .mockRejectedValueOnce(new Error('injected persistence interruption'));
    await expect(drainRegisteredWorkload(registry, scope, row, { stop, observe, excludeStarts })).rejects.toThrow(
      'injected',
    );
    fail.mockRestore();
    const restarted = new RestoreConsumerRegistry(prisma);
    await expect(restarted.assertRegisteredConsumersDrained(scope)).rejects.toMatchObject({
      code: 'RESTORE_CONSUMERS_NOT_DRAINED',
    });
    await drainRegisteredWorkload(restarted, scope, row, { stop, observe, excludeStarts });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(await restarted.assertRegisteredConsumersDrained(scope)).toMatchObject({
      registeredConsumersDrained: true,
      globalQuiescenceProven: false,
    });
  });
  it.each([
    'uid',
    'generation',
    'attemptToken',
    'operationId',
    'instanceId',
    'projectId',
    'organizationId',
    'environment',
  ])('rejects mismatched start fence %s even when the workload appears terminated', async (field) => {
    const f = await fixture();
    await registry.admit(f.scope, identity('workload'));
    const scope = await restoring(f);
    const [row] = await registry.freeze(scope);
    const observe = vi.fn(async () => 'terminated' as const);
    const stop = vi.fn(async () => {});
    await expect(
      drainRegisteredWorkload(registry, scope, row, {
        observe,
        stop,
        excludeStarts: async () =>
          Object.assign(await excludeStarts(row.uid, row.generation, scope), { [field]: 'replacement' }),
      }),
    ).rejects.toThrow('RESTORE_WORKLOAD_START_FENCE_UNCONFIRMED');
    expect(observe).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    await expect(registry.assertRegisteredConsumersDrained(scope)).rejects.toMatchObject({
      code: 'RESTORE_CONSUMERS_NOT_DRAINED',
    });
    const fence = vi.fn(excludeStarts);
    await drainRegisteredWorkload(registry, scope, row, { observe, stop, excludeStarts: fence });
    expect(fence).toHaveBeenCalledWith(row.uid, row.generation, scope);
    expect(stop).not.toHaveBeenCalled();
    expect(await registry.assertRegisteredConsumersDrained(scope)).toMatchObject({
      registeredConsumersDrained: true,
      globalQuiescenceProven: false,
    });
  });
});
