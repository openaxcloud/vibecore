/*
 * RR-CODEX-14 v6 (R-P3-06) — INTERLEAVING proof on a REAL PostgreSQL 16 server.
 *
 * Expert reserve on PR #52 (SHA 3bd148b4), reproduced against real PG with two
 * independent Prisma/PG clients: `unfreezeWorkspace` READ the fence token and then
 * issued an UNCONDITIONAL `UPDATE … WHERE id = ?`. A purge attempt N0 that was
 * delayed between those two statements wiped a barrier that attempt N1 had since
 * installed — expected purgeFrozen=true / token=owner-N1, observed purgeFrozen=false.
 * Classic ABA: the value the reader validated was replaced and the writer never
 * re-checked. `reconcileStaleWorkspaceFreezes` carried the same TOCTOU against the
 * snapshot it scanned.
 *
 * Every test here runs the FIXED path AND the LEGACY read-then-write side by side on
 * the SAME server, under the SAME interleaving. The legacy assertions are what make
 * these tests non-vacuous: they show the harness really does drive the race, and the
 * fixed path is the only one that survives it.
 *
 * Requires DATABASE_URL pointing at a real Postgres with the schema applied; the
 * suite skips itself otherwise (same gate as prisma-store.spec.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';

import { PrismaWorkspaceStore } from './prisma-store.js';
import { WorkspaceManager, type WorkspaceRecord } from './manager.js';

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

/*
 * TWO physically distinct clients → two connection pools → two backends on the real
 * server. Attempt N0 and attempt N1 never share a session, so the interleaving is a
 * genuine cross-connection race, not two calls multiplexed over one connection.
 */
const prismaA = await connect();
const prismaB = prismaA ? await connect() : undefined;
const integrationDescribe = prismaA && prismaB ? describe : describe.skip;

const NS = 'workspaces-test';
const createdIds: string[] = [];

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** No-op k8s: this suite exercises the DURABLE barrier, not the cluster revoke. */
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

integrationDescribe('purge barrier release is an atomic compare-and-set (real PostgreSQL)', () => {
  let storeA: PrismaWorkspaceStore;
  let storeB: PrismaWorkspaceStore;
  let managerA: WorkspaceManager;
  let managerB: WorkspaceManager;

  beforeAll(async () => {
    storeA = new PrismaWorkspaceStore(prismaA!);
    storeB = new PrismaWorkspaceStore(prismaB!);
    managerA = new WorkspaceManager(storeA, noopK8s, noopEvents, 'token-secret');
    managerB = new WorkspaceManager(storeB, noopK8s, noopEvents, 'token-secret');

    const server = await prismaA!.$queryRawUnsafe<Array<{ version: string }>>('SELECT version()');
    // Printed into the proof log so the reviewer sees which engine actually ran this.
    console.log(`[proof] server: ${server[0]?.version}`);
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prismaA as any).workspaceRuntime.deleteMany({ where: { id: { in: createdIds } } });
    }

    await prismaA?.$disconnect();
    await prismaB?.$disconnect();
  });

  async function seedRuntime(id: string) {
    createdIds.push(id);

    return storeA.create({
      id,
      orgId: uniqueId('org'),
      projectId: uniqueId('proj'),
      plan: 'pro',
      status: 'RUNNING',
      pvcName: `pvc-${id}`,
      podName: `workspace-${id}`,
      serviceName: `svc-${id}`,
      agentTokenSecretName: `agent-token-${id}`,
    });
  }

  /** Reads the row on a THIRD statement so assertions never trust a cached value. */
  async function readRow(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (prismaB as any).workspaceRuntime.findUnique({ where: { id } }) as Promise<{
      purgeFrozen: boolean;
      purgeFenceToken: string | null;
      purgeFrozenAt: Date | null;
    } | null>;
  }

  /**
   * The EXACT pre-fix implementation (PR #52 @ 3bd148b4, manager.ts:1352-1365):
   * read the row, validate the token in application code, then UPDATE by id with NO
   * condition. `delay` is invoked in the TOCTOU window — between the read the caller
   * validated and the write it issues. That window is the whole defect: putting the
   * competing freeze anywhere else does not reproduce it, because the application-side
   * token check would simply see the new value and bail.
   */
  async function legacyUnfreeze(
    store: PrismaWorkspaceStore,
    id: string,
    fenceToken: string | undefined,
    delay: () => Promise<void>,
  ) {
    const workspace = await store.get(id).catch(() => undefined);

    if (!workspace?.purgeFrozen) {
      return;
    }

    if (workspace.purgeFenceToken && workspace.purgeFenceToken !== fenceToken) {
      return;
    }

    /* <-- TOCTOU window: everything validated above may already be stale --> */
    await delay();

    await store.update(id, { purgeFrozen: false, purgeFenceToken: undefined, purgeFrozenAt: undefined });
  }

  /**
   * Injects the competing freeze at the SAME logical point for the fixed path: after
   * attempt N0 has decided to release, immediately before its write reaches the row.
   * Only then is the comparison honest — identical ordering, different write semantics.
   */
  class DelayedReleaseStore extends PrismaWorkspaceStore {
    constructor(
      prisma: DatabaseClient,
      private readonly delay: () => Promise<void>,
    ) {
      super(prisma);
    }

    override async releasePurgeFence(workspaceId: string, fenceToken: string | undefined): Promise<boolean> {
      await this.delay();

      return super.releasePurgeFence(workspaceId, fenceToken);
    }
  }

  it('LEGACY read-then-write loses the ABA race — a delayed unfreeze wipes a NEWER barrier', async () => {
    const id = uniqueId('ws-legacy');
    await seedRuntime(id);

    // Attempt N0 installs its barrier.
    await managerA.freezeWorkspace(NS, id, 'owner-N0');

    await legacyUnfreeze(storeA, id, 'owner-N0', async () => {
      // Attempt N1 (other connection) supersedes it while N0 is suspended mid-unfreeze.
      await managerB.freezeWorkspace(NS, id, 'owner-N1');
      expect((await readRow(id))?.purgeFenceToken).toBe('owner-N1');
    });

    const after = await readRow(id);
    console.log(`[proof] legacy → purgeFrozen=${after?.purgeFrozen} token=${after?.purgeFenceToken}`);

    // The DEFECT the expert reported, reproduced on real PostgreSQL 16: expected
    // purgeFrozen=true / owner-N1, observed purgeFrozen=false — barrier down mid-erasure.
    expect(after?.purgeFrozen).toBe(false);
    expect(after?.purgeFenceToken).toBeNull();
  });

  it('FIXED CAS survives the identical interleaving — the newer barrier stands', async () => {
    const id = uniqueId('ws-cas');
    await seedRuntime(id);

    await managerA.freezeWorkspace(NS, id, 'owner-N0');

    let superseded = false;
    const delayedStore = new DelayedReleaseStore(prismaA!, async () => {
      if (superseded) {
        return;
      }
      superseded = true;
      // Same interleaving, same moment as the legacy test above.
      await managerB.freezeWorkspace(NS, id, 'owner-N1');
    });
    const delayedManager = new WorkspaceManager(delayedStore, noopK8s, noopEvents, 'token-secret');

    const result = await delayedManager.unfreezeWorkspace(id, 'owner-N0');

    const after = await readRow(id);
    console.log(
      `[proof] cas → released=${result.released} purgeFrozen=${after?.purgeFrozen} token=${after?.purgeFenceToken}`,
    );

    expect(superseded).toBe(true);
    expect(result.released).toBe(false);
    expect(after?.purgeFrozen).toBe(true);
    expect(after?.purgeFenceToken).toBe('owner-N1');
  });

  it('the OWNER can still release its own barrier (the CAS is not a blanket refusal)', async () => {
    const id = uniqueId('ws-owner');
    await seedRuntime(id);

    await managerA.freezeWorkspace(NS, id, 'owner-N1');

    const result = await managerB.unfreezeWorkspace(id, 'owner-N1');
    const after = await readRow(id);

    expect(result.released).toBe(true);
    expect(after?.purgeFrozen).toBe(false);
    expect(after?.purgeFenceToken).toBeNull();
    expect(after?.purgeFrozenAt).toBeNull();
  });

  it('a token-less caller cannot lift a FENCED barrier (R-P3-03 preserved)', async () => {
    const id = uniqueId('ws-notoken');
    await seedRuntime(id);

    await managerA.freezeWorkspace(NS, id, 'owner-N1');

    const result = await managerB.unfreezeWorkspace(id, undefined);
    const after = await readRow(id);

    expect(result.released).toBe(false);
    expect(after?.purgeFrozen).toBe(true);
    expect(after?.purgeFenceToken).toBe('owner-N1');
  });

  /*
   * Guards a trap in the CAS: SQL `= NULL` is never true, so if the null token were
   * compared with `=` a token-less barrier would be UNRELEASABLE and the runtime would
   * stay frozen until the 24h reconciler. Prisma emits `purgeFenceToken IS NULL` for a
   * null match (verified in the PG statement log) — this test keeps it that way.
   */
  it('a token-less barrier is still releasable by a token-less caller (no `= NULL` trap)', async () => {
    const id = uniqueId('ws-nulltoken');
    await seedRuntime(id);

    await managerA.freezeWorkspace(NS, id, undefined);
    expect((await readRow(id))?.purgeFenceToken).toBeNull();

    const result = await managerB.unfreezeWorkspace(id, undefined);

    expect(result.released).toBe(true);
    expect((await readRow(id))?.purgeFrozen).toBe(false);
  });

  it('two concurrent releases on two connections: exactly one wins, and only the owner', async () => {
    const id = uniqueId('ws-concurrent');
    await seedRuntime(id);

    await managerA.freezeWorkspace(NS, id, 'owner-N1');

    // Fired together on separate pools — Postgres serialises them on the row lock.
    const [wrongToken, owner] = await Promise.all([
      managerA.unfreezeWorkspace(id, 'owner-N0'),
      managerB.unfreezeWorkspace(id, 'owner-N1'),
    ]);

    expect(wrongToken.released).toBe(false);
    expect(owner.released).toBe(true);
    expect((await readRow(id))?.purgeFrozen).toBe(false);
  });

  it('a re-release by the (now superseded) owner is a no-op, not a second unfreeze', async () => {
    const id = uniqueId('ws-replay');
    await seedRuntime(id);

    await managerA.freezeWorkspace(NS, id, 'owner-N0');
    expect((await managerA.unfreezeWorkspace(id, 'owner-N0')).released).toBe(true);

    // A brand-new purge attempt freezes the same runtime.
    await managerB.freezeWorkspace(NS, id, 'owner-N1');

    // The old attempt retries its release (at-least-once delivery / crash-retry).
    const replay = await managerA.unfreezeWorkspace(id, 'owner-N0');
    const after = await readRow(id);

    expect(replay.released).toBe(false);
    expect(after?.purgeFrozen).toBe(true);
    expect(after?.purgeFenceToken).toBe('owner-N1');
  });
});

integrationDescribe('stale-freeze reconciler is version-checked (real PostgreSQL)', () => {
  let storeA: PrismaWorkspaceStore;
  let storeB: PrismaWorkspaceStore;
  let managerB: WorkspaceManager;

  /**
   * Forces the interleaving the reconciler is exposed to: run `hook` AFTER list()
   * resolves but BEFORE the manager acts on the snapshot — i.e. exactly inside the
   * TOCTOU window between "this barrier looks stale" and "release it".
   */
  class RacingStore extends PrismaWorkspaceStore {
    constructor(
      prisma: DatabaseClient,
      private readonly hook: () => Promise<void>,
    ) {
      super(prisma);
    }

    override async list(): Promise<WorkspaceRecord[]> {
      const rows = await super.list();
      await this.hook();

      return rows;
    }
  }

  beforeAll(() => {
    storeA = new PrismaWorkspaceStore(prismaA!);
    storeB = new PrismaWorkspaceStore(prismaB!);
    managerB = new WorkspaceManager(storeB, noopK8s, noopEvents, 'token-secret');
  });

  async function seedStaleBarrier(id: string) {
    createdIds.push(id);
    await storeA.create({
      id,
      orgId: uniqueId('org'),
      projectId: uniqueId('proj'),
      plan: 'pro',
      status: 'STOPPED',
      pvcName: `pvc-${id}`,
      podName: `workspace-${id}`,
      serviceName: `svc-${id}`,
      agentTokenSecretName: `agent-token-${id}`,
      purgeFrozen: true,
      purgeFenceToken: 'owner-N0',
      // 48h old — comfortably past any grace window, so the sweep WILL target it.
      purgeFrozenAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });
  }

  it('LEGACY reconciler lifts a barrier that was re-frozen after the scan', async () => {
    const id = uniqueId('ws-reco-legacy');
    await seedStaleBarrier(id);

    // Pre-fix body (manager.ts:1373-1396 @ 3bd148b4), inlined: scan, judge staleness on
    // the SNAPSHOT, then update by id with no condition.
    const cutoff = Date.now() - 60 * 60 * 1000;
    const rows = await storeA.list();
    const snapshot = rows.find((row) => row.id === id)!;
    expect(snapshot.purgeFenceToken).toBe('owner-N0');
    expect(new Date(snapshot.purgeFrozenAt!).getTime()).toBeLessThan(cutoff);

    // A NEW purge freezes the runtime while the sweep is mid-flight.
    await managerB.freezeWorkspace('workspaces-test', id, 'owner-N1');

    await storeA.update(snapshot.id, {
      purgeFrozen: false,
      purgeFenceToken: undefined,
      purgeFrozenAt: undefined,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const after = await (prismaB as any).workspaceRuntime.findUnique({ where: { id } });
    console.log(`[proof] legacy reconciler → purgeFrozen=${after?.purgeFrozen}`);

    // Defect reproduced: a LIVE barrier from an in-flight purge was lifted.
    expect(after?.purgeFrozen).toBe(false);
  });

  it('FIXED reconciler leaves a barrier re-frozen mid-sweep alone (CAS miss)', async () => {
    const id = uniqueId('ws-reco-cas');
    await seedStaleBarrier(id);

    let refrozen = false;
    const racingStore = new RacingStore(prismaA!, async () => {
      if (refrozen) {
        return;
      }
      refrozen = true;
      // Injected INSIDE the window between list() and the release.
      await managerB.freezeWorkspace('workspaces-test', id, 'owner-N1');
    });
    const racingManager = new WorkspaceManager(racingStore, noopK8s, noopEvents, 'token-secret');

    const { reconciled } = await racingManager.reconcileStaleWorkspaceFreezes(60 * 60 * 1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const after = await (prismaB as any).workspaceRuntime.findUnique({ where: { id } });
    console.log(
      `[proof] cas reconciler → reconciled=${reconciled} purgeFrozen=${after?.purgeFrozen} token=${after?.purgeFenceToken}`,
    );

    expect(refrozen).toBe(true);
    expect(after?.purgeFrozen).toBe(true);
    expect(after?.purgeFenceToken).toBe('owner-N1');
  });

  /*
   * R-P3-06: the reconciler's CAS feeds the record's token straight back into the WHERE
   * clause, so an EMPTY-STRING token must round-trip as '' and not collapse to "absent"
   * — otherwise such a barrier would CAS against NULL, match 0 rows, and stay frozen
   * forever. Reachable in principle: app.ts freezes with `fenceToken ?? ''`.
   */
  it('an empty-string fence token round-trips and stays reclaimable', async () => {
    const id = uniqueId('ws-reco-emptytok');
    createdIds.push(id);
    await storeA.create({
      id,
      orgId: uniqueId('org'),
      projectId: uniqueId('proj'),
      plan: 'pro',
      status: 'STOPPED',
      pvcName: `pvc-${id}`,
      podName: `workspace-${id}`,
      serviceName: `svc-${id}`,
      agentTokenSecretName: `agent-token-${id}`,
      purgeFrozen: true,
      purgeFenceToken: '',
      purgeFrozenAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });

    expect((await storeA.get(id))?.purgeFenceToken).toBe('');

    const manager = new WorkspaceManager(storeA, noopK8s, noopEvents, 'token-secret');
    await manager.reconcileStaleWorkspaceFreezes(60 * 60 * 1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const after = await (prismaB as any).workspaceRuntime.findUnique({ where: { id } });
    expect(after?.purgeFrozen).toBe(false);
  });

  it('FIXED reconciler still lifts a genuinely ORPHANED barrier (R-P3-04 preserved)', async () => {
    const id = uniqueId('ws-reco-orphan');
    await seedStaleBarrier(id);

    const manager = new WorkspaceManager(storeA, noopK8s, noopEvents, 'token-secret');
    const { reconciled } = await manager.reconcileStaleWorkspaceFreezes(60 * 60 * 1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const after = await (prismaB as any).workspaceRuntime.findUnique({ where: { id } });

    expect(reconciled).toBeGreaterThanOrEqual(1);
    expect(after?.purgeFrozen).toBe(false);
    expect(after?.purgeFenceToken).toBeNull();
  });
});

/*
 * R-P3-06 reserve #3: barrier reads must fail CLOSED. The pre-fix guards did
 * `.catch(() => undefined)`, making a DB error indistinguishable from "no barrier" —
 * so a Postgres blip during an erasure window silently AUTHORISED the reprovision the
 * barrier exists to refuse. Driven with a real Prisma client pointed at a database
 * that does not exist, so the rejection is a genuine connection error, not a stub.
 */
integrationDescribe('barrier reads fail CLOSED on a real database error', () => {
  let deadPrisma: DatabaseClient;
  let deadManager: WorkspaceManager;

  beforeAll(() => {
    const previous = process.env.DATABASE_URL!;

    /*
     * Same host/port/credentials as the live DB, but a database name that cannot
     * exist — so the failure is a genuine server-side error on a reachable server,
     * and the test stays portable to whatever DATABASE_URL the replay uses (a
     * hardcoded host would fail for the wrong reason, or not at all, elsewhere).
     */
    const dead = new URL(previous);
    dead.pathname = '/does_not_exist_purge52_r_p3_06';

    process.env.DATABASE_URL = dead.toString();
    deadPrisma = createDatabaseClient();
    process.env.DATABASE_URL = previous;

    deadManager = new WorkspaceManager(new PrismaWorkspaceStore(deadPrisma), noopK8s, noopEvents, 'token-secret');
  });

  afterAll(async () => {
    await deadPrisma.$disconnect().catch(() => undefined);
  });

  it('the read really does reject (the harness is not silently succeeding)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect((deadPrisma as any).workspaceRuntime.findUnique({ where: { id: 'x' } })).rejects.toBeTruthy();
  });

  it('startWorkspace REFUSES when the purge barrier cannot be read', async () => {
    const error = await deadManager
      .startWorkspace({
        namespace: NS,
        orgId: 'org-failclosed',
        projectId: 'proj-failclosed',
        workspaceId: uniqueId('ws-failclosed'),
        image: 'agent:test',
        plan: 'pro',
      } as never)
      .then(() => undefined)
      .catch((caught: Error) => caught);

    console.log(`[proof] fail-closed → ${error?.message?.slice(0, 120)}`);

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('WORKSPACE_PURGE_BARRIER_UNVERIFIABLE');
  });

  it('freezeWorkspace REFUSES rather than routing down the "no runtime row" branch', async () => {
    const error = await deadManager
      .freezeWorkspace(NS, uniqueId('ws-freeze-failclosed'), 'owner-N1')
      .then(() => undefined)
      .catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('WORKSPACE_FREEZE_PERSIST_FAILED');
  });
});
