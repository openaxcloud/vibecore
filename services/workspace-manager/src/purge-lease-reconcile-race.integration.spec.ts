/*
 * RR-CODEX-14 v8 — deterministic lease-renewal/reconciler interleavings on a
 * real PostgreSQL server. No timer decides an ordering in this suite: the first
 * race pauses inside the transaction after PurgePlan has been row-locked, while
 * the expiry-boundary cases share PostgreSQL's transaction_timestamp().
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';

import { PrismaApiStore } from '../../api/src/prisma-store.js';
import { WorkspaceManager, type WorkspaceRecord } from './manager.js';
import { PrismaWorkspaceStore } from './prisma-store.js';

const LEASE_TTL_MS = 10 * 60 * 1000;
const RECONCILE_GRACE_MS = 24 * 60 * 60 * 1000;

async function connect(): Promise<DatabaseClient | undefined> {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }

  const prisma = createDatabaseClient();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return prisma;
  } catch {
    await prisma.$disconnect();

    return undefined;
  }
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });

  return { promise, resolve, reject };
}

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const prismaA = await connect();
const prismaB = prismaA ? await connect() : undefined;
const prismaC = prismaB ? await connect() : undefined;
const integrationDescribe = prismaA && prismaB && prismaC ? describe : describe.skip;
const runtimeIds: string[] = [];
const planIds: string[] = [];

const noopK8s = {
  async apply(object: unknown) {
    return object as never;
  },
  async delete() {},
  async get() {
    return undefined;
  },
  async getPod() {
    return undefined;
  },
  async *streamPodLogs() {},
  async scale() {},
  async annotate() {},
  async listByLabel() {
    return [];
  },
} as never;

const noopEvents = { async publish() {} };

function apiStore(prisma: DatabaseClient) {
  return new PrismaApiStore(prisma, undefined, {
    ttlMs: LEASE_TTL_MS,
    renewIntervalMs: 60_000,
    reclaimGraceMs: 60_000,
  });
}

class ScopedWorkspaceStore extends PrismaWorkspaceStore {
  constructor(
    prisma: DatabaseClient,
    private readonly workspaceId: string,
  ) {
    super(prisma);
  }

  override async list(): Promise<WorkspaceRecord[]> {
    return (await super.list()).filter((workspace) => workspace.id === this.workspaceId);
  }
}

integrationDescribe('purge lease expiry is linearized with stale-barrier release (real PostgreSQL)', () => {
  beforeAll(async () => {
    const [server] = await prismaA!.$queryRawUnsafe<Array<{ version: string }>>('SELECT version()');
    const [backendA] = await prismaA!.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid');
    const [backendB] = await prismaB!.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid');
    const [backendC] = await prismaC!.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid');

    console.log(`[proof] server=${server?.version}`);
    console.log(`[proof] actors backendA=${backendA?.pid} backendB=${backendB?.pid} coordinator=${backendC?.pid}`);
    expect(server?.version).toContain('PostgreSQL 16');
    expect(backendA?.pid).not.toBe(backendB?.pid);
    expect(backendA?.pid).not.toBe(backendC?.pid);
    expect(backendB?.pid).not.toBe(backendC?.pid);
  });

  afterEach(async () => {
    vi.useRealTimers();

    if (runtimeIds.length > 0) {
      await prismaA!.workspaceRuntime.deleteMany({ where: { id: { in: runtimeIds.splice(0) } } });
    }

    if (planIds.length > 0) {
      await prismaA!.purgePlan.deleteMany({ where: { id: { in: planIds.splice(0) } } });
    }
  });

  afterAll(async () => {
    await Promise.allSettled([prismaA?.$disconnect(), prismaB?.$disconnect(), prismaC?.$disconnect()]);
  });

  it('an expired owner cannot renew after owner-dead is locked and before the barrier CAS', async () => {
    const planId = uniqueId('plan-expired-race');
    const workspaceId = uniqueId('ws-expired-race');
    const ownerToken = uniqueId('owner-expired-race');
    planIds.push(planId);
    runtimeIds.push(workspaceId);

    await prismaA!.$executeRawUnsafe(
      `INSERT INTO "PurgePlan" (id, "userId", "ownerToken", "leaseExpiresAt", version, status)
       VALUES ($1, $2, $3, transaction_timestamp() - interval '1 minute', 0, 'ACTIVE')`,
      planId,
      uniqueId('user'),
      ownerToken,
    );

    const store = new ScopedWorkspaceStore(prismaA!, workspaceId);
    await store.create({
      id: workspaceId,
      orgId: uniqueId('org'),
      projectId: uniqueId('project'),
      plan: 'pro',
      status: 'STOPPED',
      pvcName: `pvc-${workspaceId}`,
      podName: `workspace-${workspaceId}`,
      serviceName: `svc-${workspaceId}`,
      agentTokenSecretName: `agent-token-${workspaceId}`,
      purgeFrozen: true,
      purgeFenceToken: ownerToken,
      purgeFrozenAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });

    const ownerChecked = deferred<boolean>();
    const resumeRelease = deferred<void>();
    store.purgeFenceTestHooks = {
      onOwnerLivenessLocked: async ({ live }) => {
        ownerChecked.resolve(live);
        await resumeRelease.promise;
      },
    };

    const manager = new WorkspaceManager(store, noopK8s, noopEvents, 'test-agent-secret');
    const sweepPromise = manager.reconcileStaleWorkspaceFreezes(RECONCILE_GRACE_MS);
    let renewalPromise: Promise<number | null> | undefined;

    try {
      expect(await ownerChecked.promise).toBe(false);
      // This is a genuinely separate pool/backend. It may start now, but cannot
      // cross the PurgePlan row lock held by the paused reconciler transaction.
      renewalPromise = apiStore(prismaB!).renewPurgeLease(planId, ownerToken, 0);
    } catch (error) {
      ownerChecked.reject(error);
      throw error;
    } finally {
      resumeRelease.resolve();
    }

    const [sweep, renewed] = await Promise.all([sweepPromise, renewalPromise!]);
    const plan = await prismaB!.purgePlan.findUnique({ where: { id: planId } });
    const runtime = await prismaB!.workspaceRuntime.findUnique({ where: { id: workspaceId } });
    const [clock] = await prismaB!.$queryRawUnsafe<Array<{ expired: boolean }>>(
      `SELECT "leaseExpiresAt" <= transaction_timestamp() AS expired
         FROM "PurgePlan"
        WHERE id = $1`,
      planId,
    );

    console.log(
      `[proof] expired-race renewed=${renewed} version=${plan?.version} expired=${clock?.expired} ` +
        `reconciled=${sweep.reconciled} frozen=${runtime?.purgeFrozen}`,
    );

    expect(renewed).toBeNull();
    expect(plan).toMatchObject({ version: 0, status: 'ACTIVE' });
    expect(clock?.expired).toBe(true);
    expect(sweep).toEqual({ scanned: 1, reconciled: 1, skippedLiveOwner: 0, failed: 0 });
    expect(runtime).toMatchObject({ purgeFrozen: false, purgeFenceToken: null, purgeFrozenAt: null });
  });

  it('leaseExpiresAt equal to PostgreSQL now is expired even when the API clock is behind', async () => {
    await prismaA!.$transaction(async (tx) => {
      const planId = uniqueId('plan-equality');
      const ownerToken = uniqueId('owner-equality');
      const [clock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>('SELECT transaction_timestamp() AS now');

      await tx.$executeRawUnsafe(
        `INSERT INTO "PurgePlan" (id, "userId", "ownerToken", "leaseExpiresAt", version, status)
         VALUES ($1, $2, $3, date_trunc('milliseconds', transaction_timestamp()), 0, 'ACTIVE')`,
        planId,
        uniqueId('user'),
        ownerToken,
      );

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(clock!.now.getTime() - 60 * 60 * 1000));

      let renewed: number | null;

      try {
        renewed = await apiStore(tx as unknown as DatabaseClient).renewPurgeLease(planId, ownerToken, 0);
      } finally {
        vi.useRealTimers();
      }

      const [after] = await tx.$queryRawUnsafe<Array<{ version: number; exactBoundary: boolean }>>(
        `SELECT version,
                "leaseExpiresAt" = date_trunc('milliseconds', transaction_timestamp()) AS "exactBoundary"
           FROM "PurgePlan"
          WHERE id = $1`,
        planId,
      );

      console.log(`[proof] equality renewed=${renewed} version=${after?.version} exact=${after?.exactBoundary}`);
      expect(renewed).toBeNull();
      expect(after).toEqual({ version: 0, exactBoundary: true });
      await tx.purgePlan.delete({ where: { id: planId } });
    });
  });

  it('a DB-live lease renews once even when the API clock is ahead', async () => {
    await prismaA!.$transaction(async (tx) => {
      const planId = uniqueId('plan-live');
      const ownerToken = uniqueId('owner-live');
      const [clock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>('SELECT transaction_timestamp() AS now');

      await tx.$executeRawUnsafe(
        `INSERT INTO "PurgePlan" (id, "userId", "ownerToken", "leaseExpiresAt", version, status)
         VALUES (
           $1,
           $2,
           $3,
           date_trunc('milliseconds', transaction_timestamp()) + interval '5 minutes',
           0,
           'ACTIVE'
         )`,
        planId,
        uniqueId('user'),
        ownerToken,
      );

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(clock!.now.getTime() + 60 * 60 * 1000));

      let renewed: number | null;

      try {
        renewed = await apiStore(tx as unknown as DatabaseClient).renewPurgeLease(planId, ownerToken, 0);
      } finally {
        vi.useRealTimers();
      }

      const [after] = await tx.$queryRawUnsafe<Array<{ version: number; exactExpiry: boolean }>>(
        `SELECT version,
                "leaseExpiresAt" = date_trunc('milliseconds', transaction_timestamp())
                  + ($2::bigint * interval '1 millisecond')
                  AS "exactExpiry"
           FROM "PurgePlan"
          WHERE id = $1`,
        planId,
        LEASE_TTL_MS,
      );

      console.log(`[proof] live renewed=${renewed} version=${after?.version} exact=${after?.exactExpiry}`);
      expect(renewed).toBe(1);
      expect(after).toEqual({ version: 1, exactExpiry: true });
      await tx.purgePlan.delete({ where: { id: planId } });
    });
  });

  it('the plan reconciler keeps a DB-live lease when the API clock is ahead', async () => {
    const planId = uniqueId('plan-reconcile-live');
    planIds.push(planId);

    await prismaA!.$executeRawUnsafe(
      `INSERT INTO "PurgePlan" (id, "userId", "ownerToken", "leaseExpiresAt", version, status)
       VALUES (
         $1,
         $2,
         $3,
         date_trunc('milliseconds', transaction_timestamp()) + interval '5 minutes',
         0,
         'ACTIVE'
       )`,
      planId,
      uniqueId('user'),
      uniqueId('owner'),
    );

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000));

    let result: Awaited<ReturnType<PrismaApiStore['reconcilePurgeFreezes']>>;

    try {
      result = await apiStore(prismaA!).reconcilePurgeFreezes();
    } finally {
      vi.useRealTimers();
    }

    expect(result.reclaimedPlanIds).not.toContain(planId);
    expect(await prismaB!.purgePlan.findUnique({ where: { id: planId } })).toMatchObject({ version: 0 });
  });

  it('the plan reconciler reclaims a DB-expired lease when the API clock is behind', async () => {
    const planId = uniqueId('plan-reconcile-expired');
    planIds.push(planId);

    await prismaA!.$executeRawUnsafe(
      `INSERT INTO "PurgePlan" (id, "userId", "ownerToken", "leaseExpiresAt", version, status)
       VALUES (
         $1,
         $2,
         $3,
         date_trunc('milliseconds', transaction_timestamp()) - interval '5 minutes',
         0,
         'ACTIVE'
       )`,
      planId,
      uniqueId('user'),
      uniqueId('owner'),
    );

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() - 24 * 60 * 60 * 1000));

    let result: Awaited<ReturnType<PrismaApiStore['reconcilePurgeFreezes']>>;

    try {
      result = await apiStore(prismaA!).reconcilePurgeFreezes();
    } finally {
      vi.useRealTimers();
    }

    expect(result.reclaimedPlanIds).toContain(planId);
    expect(await prismaB!.purgePlan.findUnique({ where: { id: planId } })).toBeNull();
  });

  it('an in-flight renewal holds the plan lock until commit, so the reconciler observes the renewed owner', async () => {
    const planId = uniqueId('plan-renew-first');
    const workspaceId = uniqueId('ws-renew-first');
    const ownerToken = `race-harness-trigger-${uniqueId('owner')}`;
    const lockClass = 21_417;
    const lockObject = 38_052;
    planIds.push(planId);
    runtimeIds.push(workspaceId);

    await prismaA!.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION purge_lease_race_block_renewal()
       RETURNS trigger
       LANGUAGE plpgsql
       AS $trigger$
       BEGIN
         IF OLD."ownerToken" LIKE 'race-harness-trigger-%' THEN
           PERFORM pg_advisory_xact_lock(${lockClass}, ${lockObject});
         END IF;
         RETURN NEW;
       END
       $trigger$`,
    );
    await prismaA!.$executeRawUnsafe('DROP TRIGGER IF EXISTS purge_lease_race_block_renewal ON "PurgePlan"');
    await prismaA!.$executeRawUnsafe(
      `CREATE TRIGGER purge_lease_race_block_renewal
         BEFORE UPDATE OF "leaseExpiresAt", version ON "PurgePlan"
         FOR EACH ROW EXECUTE FUNCTION purge_lease_race_block_renewal()`,
    );

    const store = new ScopedWorkspaceStore(prismaA!, workspaceId);
    const manager = new WorkspaceManager(store, noopK8s, noopEvents, 'test-agent-secret');
    let renewalPromise: Promise<number | null> | undefined;
    let sweepPromise:
      | Promise<{
          scanned: number;
          reconciled: number;
          skippedLiveOwner: number;
          failed: number;
        }>
      | undefined;

    try {
      await prismaA!.$executeRawUnsafe(
        `INSERT INTO "PurgePlan" (id, "userId", "ownerToken", "leaseExpiresAt", version, status)
         VALUES (
           $1,
           $2,
           $3,
           date_trunc('milliseconds', transaction_timestamp()) + interval '2 seconds',
           0,
           'ACTIVE'
         )`,
        planId,
        uniqueId('user'),
        ownerToken,
      );
      await store.create({
        id: workspaceId,
        orgId: uniqueId('org'),
        projectId: uniqueId('project'),
        plan: 'pro',
        status: 'STOPPED',
        pvcName: `pvc-${workspaceId}`,
        podName: `workspace-${workspaceId}`,
        serviceName: `svc-${workspaceId}`,
        agentTokenSecretName: `agent-token-${workspaceId}`,
        purgeFrozen: true,
        purgeFenceToken: ownerToken,
        purgeFrozenAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      });

      await prismaC!.$transaction(async (coordinator) => {
        await coordinator.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', lockClass, lockObject);

        renewalPromise = prismaB!.$transaction(async (renewalTx) => {
          return apiStore(renewalTx as unknown as DatabaseClient).renewPurgeLease(planId, ownerToken, 0);
        });

        const waitDeadline = Date.now() + 10_000;
        let renewalWaiting = false;

        while (!renewalWaiting && Date.now() < waitDeadline) {
          const [state] = await coordinator.$queryRawUnsafe<Array<{ waiting: boolean }>>(
            `SELECT EXISTS (
               SELECT 1
                 FROM pg_locks
                WHERE locktype = 'advisory'
                  AND classid = $1
                  AND objid = $2
                  AND granted = false
             ) AS waiting`,
            lockClass,
            lockObject,
          );
          renewalWaiting = state?.waiting === true;

          if (!renewalWaiting) {
            await new Promise<void>((resolve) => setImmediate(resolve));
          }
        }

        expect(renewalWaiting).toBe(true);

        // Wait on the database's observable boundary, not an arbitrary test sleep:
        // the committed pre-renew lease must be expired before the reconciler starts.
        let oldLeaseExpired = false;

        while (!oldLeaseExpired && Date.now() < waitDeadline) {
          const [state] = await coordinator.$queryRawUnsafe<Array<{ expired: boolean }>>(
            `SELECT "leaseExpiresAt" <= date_trunc('milliseconds', clock_timestamp()) AS expired
               FROM "PurgePlan"
              WHERE id = $1`,
            planId,
          );
          oldLeaseExpired = state?.expired === true;

          if (!oldLeaseExpired) {
            await new Promise<void>((resolve) => setImmediate(resolve));
          }
        }

        expect(oldLeaseExpired).toBe(true);
        sweepPromise = manager.reconcileStaleWorkspaceFreezes(RECONCILE_GRACE_MS);

        let reconcileWaiting = false;

        while (!reconcileWaiting && Date.now() < waitDeadline) {
          const [state] = await coordinator.$queryRawUnsafe<Array<{ waiting: boolean }>>(
            `SELECT EXISTS (
               SELECT 1
                 FROM pg_stat_activity
                WHERE datname = current_database()
                  AND wait_event_type = 'Lock'
                  AND query LIKE '%FOR UPDATE OF plan%'
             ) AS waiting`,
          );
          reconcileWaiting = state?.waiting === true;

          if (!reconcileWaiting) {
            await new Promise<void>((resolve) => setImmediate(resolve));
          }
        }

        expect(reconcileWaiting).toBe(true);
        // Committing this callback releases the advisory lock. The renewal then
        // commits before the row-locked liveness query can continue.
      });

      const [renewed, sweep] = await Promise.all([renewalPromise!, sweepPromise!]);
      const plan = await prismaC!.purgePlan.findUnique({ where: { id: planId } });
      const runtime = await prismaC!.workspaceRuntime.findUnique({ where: { id: workspaceId } });
      const [clock] = await prismaC!.$queryRawUnsafe<Array<{ live: boolean }>>(
        `SELECT "leaseExpiresAt" > date_trunc('milliseconds', transaction_timestamp()) AS live
           FROM "PurgePlan"
          WHERE id = $1`,
        planId,
      );

      console.log(
        `[proof] renew-first renewed=${renewed} version=${plan?.version} live=${clock?.live} ` +
          `skipped=${sweep.skippedLiveOwner} frozen=${runtime?.purgeFrozen}`,
      );

      expect(renewed).toBe(1);
      expect(plan).toMatchObject({ version: 1, status: 'ACTIVE' });
      expect(clock?.live).toBe(true);
      expect(sweep).toEqual({ scanned: 1, reconciled: 0, skippedLiveOwner: 1, failed: 0 });
      expect(runtime).toMatchObject({
        purgeFrozen: true,
        purgeFenceToken: ownerToken,
      });
    } finally {
      // Never leave a test trigger on a shared disposable database.
      await prismaA!.$executeRawUnsafe('DROP TRIGGER IF EXISTS purge_lease_race_block_renewal ON "PurgePlan"');
      await prismaA!.$executeRawUnsafe('DROP FUNCTION IF EXISTS purge_lease_race_block_renewal()');
    }
  });
});
