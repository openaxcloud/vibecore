import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';
import { PrismaApiStore } from '../prisma-store.js';
import {
  ReleaseHeadMovedError,
  appendReleaseManifestAtHead,
  readReleaseHeadVersion,
  releaseStreamLockKey,
} from '../release-manifest.js';

/*
 * ============================================================================
 * Expert refusal (3rd round) — the two INTERLEAVINGS, against a REAL Postgres.
 * ============================================================================
 *
 * The in-memory suite models `withSerializedMutation` with a promise chain. That is a
 * model, and a model cannot prove that pg_advisory_xact_lock actually serialises across
 * independent connections, nor that the compare-and-set reads committed state from a
 * different transaction. These tests exercise the REAL PrismaApiStore against a REAL
 * Postgres, on the REAL ReleaseManifest table, driving the SAME
 * `appendReleaseManifestAtHead` the rollback handler calls.
 *
 * Both interleavings the refusal named are forced DETERMINISTICALLY — not by racing and
 * hoping, but with explicit barriers so exactly one order is possible:
 *
 *   (A) rollback ⟂ rollback : both select head vN, then both attempt to commit.
 *   (B) rollback ⟂ publish  : the rollback selects head vN, a publish commits vN+1,
 *                             then the rollback attempts to commit.
 *
 * In both, exactly one writer may advance the stream; the other must be refused with
 * ReleaseHeadMovedError and leave NOTHING behind.
 *
 * Gated on DATABASE_URL like the other DB-backed suites (ledger-store-db, etc.):
 * runs in CI and locally against a migrated Postgres, skips otherwise.
 */

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  const prisma = createDatabaseClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

const uniqueId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const DIGEST = (seed: string) => `sha256:${seed.repeat(64).slice(0, 64)}`;

runDbTests('rollback concurrency — real Postgres, both interleavings', () => {
  /** A project row the ReleaseManifest FK can point at, plus its org. */
  async function seedProject(prisma: ReturnType<typeof createDatabaseClient>) {
    const organizationId = uniqueId('org');
    const projectId = uniqueId('proj');

    await prisma.organization.create({
      data: { id: organizationId, name: 'Rollback Concurrency Org', slug: uniqueId('slug') },
    });
    await prisma.project.create({
      data: { id: projectId, organizationId, name: 'Rollback Concurrency Project', slug: uniqueId('pslug') },
    });

    return { organizationId, projectId };
  }

  const manifestFor = (deploymentId: string, seed: string) => ({
    deploymentId,
    provider: 'static',
    artifactKind: 'static-snapshot' as const,
    artifactRef: `static-deployments/${deploymentId}`,
    artifactDigest: DIGEST(seed),
  });

  /* ==================================================================
   * (A) rollback ⟂ rollback — both selected the same head.
   * ================================================================== */
  it('(A) two rollbacks that selected the SAME head: one commits, one refused', async () => {
    const prisma = createDatabaseClient();

    try {
      const { projectId } = await seedProject(prisma);
      const store = new PrismaApiStore(prisma);
      const environment = 'preview';

      // Seed the stream: v1, v2 (v2 is the head both rollbacks will select against).
      await appendReleaseManifestAtHead(store, {
        projectId,
        environment,
        expectedHeadVersion: 0,
        manifest: manifestFor(uniqueId('d-v1'), '1'),
      });
      await appendReleaseManifestAtHead(store, {
        projectId,
        environment,
        expectedHeadVersion: 1,
        manifest: manifestFor(uniqueId('d-v2'), '2'),
      });

      // BOTH rollbacks select against the same head — read through the real advisory lock.
      const headA = await readReleaseHeadVersion(store, projectId, environment);
      const headB = await readReleaseHeadVersion(store, projectId, environment);
      expect(headA).toBe(2);
      expect(headB).toBe(2);

      // Then both attempt to commit. Deterministic: A first, then B on its stale head.
      const committedA = await appendReleaseManifestAtHead(store, {
        projectId,
        environment,
        expectedHeadVersion: headA,
        manifest: manifestFor(uniqueId('d-rbA'), '3'),
      });
      expect(committedA.version).toBe(3);

      await expect(
        appendReleaseManifestAtHead(store, {
          projectId,
          environment,
          expectedHeadVersion: headB,
          manifest: manifestFor(uniqueId('d-rbB'), '4'),
        }),
      ).rejects.toBeInstanceOf(ReleaseHeadMovedError);

      // The refused rollback wrote NOTHING: the stream is exactly v1, v2, v3.
      const rows = await store.listReleaseManifests(projectId, environment);
      expect(rows.map((r) => r.version).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    } finally {
      await prisma.$disconnect();
    }
  });

  /* ==================================================================
   * (A′) The same race run CONCURRENTLY on independent connections —
   *      this is what proves pg_advisory_xact_lock really serialises.
   * ================================================================== */
  it('(A′) three CONCURRENT commits from one head on separate connections: exactly one wins', async () => {
    const seed = createDatabaseClient();
    const clients = [createDatabaseClient(), createDatabaseClient(), createDatabaseClient()];

    try {
      const { projectId } = await seedProject(seed);
      const seedStore = new PrismaApiStore(seed);
      const environment = 'preview';

      await appendReleaseManifestAtHead(seedStore, {
        projectId,
        environment,
        expectedHeadVersion: 0,
        manifest: manifestFor(uniqueId('d-v1'), '1'),
      });

      const head = await readReleaseHeadVersion(seedStore, projectId, environment);
      expect(head).toBe(1);

      /*
       * Three independent PrismaApiStore instances on three independent connections all
       * compare-and-set against head v1 at the same time. Only the real advisory lock can
       * make this come out with a single winner.
       */
      const attempts = await Promise.allSettled(
        clients.map((client, i) =>
          appendReleaseManifestAtHead(new PrismaApiStore(client), {
            projectId,
            environment,
            expectedHeadVersion: head,
            manifest: manifestFor(uniqueId(`d-race${i}`), String(i + 2)),
          }),
        ),
      );

      const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
      const rejected = attempts.filter((a) => a.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);

      for (const r of rejected) {
        if (r.status === 'rejected') {
          expect(r.reason).toBeInstanceOf(ReleaseHeadMovedError);
          expect((r.reason as ReleaseHeadMovedError).expectedVersion).toBe(1);
          expect((r.reason as ReleaseHeadMovedError).observedVersion).toBe(2);
        }
      }

      const rows = await seedStore.listReleaseManifests(projectId, environment);
      expect(rows.map((r) => r.version).sort((a, b) => a - b)).toEqual([1, 2]);
    } finally {
      await Promise.all([seed, ...clients].map((c) => c.$disconnect()));
    }
  });

  /* ==================================================================
   * (B) rollback ⟂ publish — the publish moves the head under an
   *     in-flight rollback that already selected its N-1.
   * ================================================================== */
  it('(B) a publish commits while a rollback holds a stale head: the rollback is refused', async () => {
    const prisma = createDatabaseClient();
    const publisher = createDatabaseClient();

    try {
      const { projectId } = await seedProject(prisma);
      const store = new PrismaApiStore(prisma);
      const publishStore = new PrismaApiStore(publisher);
      const environment = 'preview';

      await appendReleaseManifestAtHead(store, {
        projectId,
        environment,
        expectedHeadVersion: 0,
        manifest: manifestFor(uniqueId('d-v1'), '1'),
      });
      await appendReleaseManifestAtHead(store, {
        projectId,
        environment,
        expectedHeadVersion: 1,
        manifest: manifestFor(uniqueId('d-v2'), '2'),
      });

      // 1. The rollback selects N-1 against head v2.
      const rollbackHead = await readReleaseHeadVersion(store, projectId, environment);
      expect(rollbackHead).toBe(2);

      // 2. A PUBLISH commits v3 on an independent connection, moving the head.
      const published = await appendReleaseManifestAtHead(publishStore, {
        projectId,
        environment,
        expectedHeadVersion: 2,
        manifest: manifestFor(uniqueId('d-publish'), '3'),
      });
      expect(published.version).toBe(3);

      // 3. The rollback now tries to commit against the head it selected from.
      await expect(
        appendReleaseManifestAtHead(store, {
          projectId,
          environment,
          expectedHeadVersion: rollbackHead,
          manifest: manifestFor(uniqueId('d-rollback'), '4'),
        }),
      ).rejects.toMatchObject({
        code: 'ROLLBACK_RELEASE_MOVED',
        expectedVersion: 2,
        observedVersion: 3,
      });

      // The publish is the only writer that advanced the stream.
      const rows = await store.listReleaseManifests(projectId, environment);
      expect(rows.map((r) => r.version).sort((a, b) => a - b)).toEqual([1, 2, 3]);
      expect(rows.find((r) => r.version === 3)!.deploymentId).toBe(published.deploymentId);
    } finally {
      await Promise.all([prisma.$disconnect(), publisher.$disconnect()]);
    }
  });

  /* ==================================================================
   * (A″) THE COUNTER-PROOF, on the same real Postgres: the PRE-FIX
   *      algorithm — "take the lock, read the head, write head+1", with
   *      the selection done outside — admits the impossible outcome.
   *      This is the defect reproduced at the storage layer, so the CAS
   *      above is shown to be what fixes it rather than incidental.
   * ================================================================== */
  it('(A″) counter-proof: the pre-fix append lets three concurrent rollbacks all restore v1', async () => {
    const seed = createDatabaseClient();
    const clients = [createDatabaseClient(), createDatabaseClient(), createDatabaseClient()];

    try {
      const { projectId } = await seedProject(seed);
      const seedStore = new PrismaApiStore(seed);
      const environment = 'preview';

      await appendReleaseManifestAtHead(seedStore, {
        projectId,
        environment,
        expectedHeadVersion: 0,
        manifest: manifestFor(uniqueId('d-v1'), '1'),
      });
      await appendReleaseManifestAtHead(seedStore, {
        projectId,
        environment,
        expectedHeadVersion: 1,
        manifest: manifestFor(uniqueId('d-v2'), '2'),
      });

      /*
       * The pre-fix shape, verbatim: the N-1 SELECTION happens on an unlocked read, and
       * only the version assignment is serialised. No compare-and-set anywhere.
       */
      const legacyRollback = async (client: (typeof clients)[number], index: number) => {
        const store = new PrismaApiStore(client);

        // Unlocked selection — every concurrent rollback sees the same head, picks the same N-1.
        const manifests = await store.listReleaseManifests(projectId, environment);
        const selectedPrevious = manifests.sort((a, b) => b.version - a.version)[1];

        // Serialised version assignment only.
        await store.withSerializedMutation(releaseStreamLockKey(projectId, environment), async () => {
          const latest = await store.listReleaseManifests(projectId, environment, { take: 1 });

          await store.createReleaseManifest({
            projectId,
            environment,
            version: (latest[0]?.version ?? 0) + 1,
            ...manifestFor(uniqueId(`d-legacy${index}`), '9'),
          });
        });

        return selectedPrevious.version;
      };

      const restored = await Promise.all(clients.map((c, i) => legacyRollback(c, i)));

      /*
       * All three "restored" v1 — the outcome the reservation described, reproduced on a
       * real database. Distinct version numbers were handed out regardless, which is
       * exactly why asserting only "distinct monotonic versions" never caught this.
       */
      expect(restored).toEqual([1, 1, 1]);

      const rows = await seedStore.listReleaseManifests(projectId, environment);
      expect(rows.map((r) => r.version).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    } finally {
      await Promise.all([seed, ...clients].map((c) => c.$disconnect()));
    }
  });

  /* ==================================================================
   * (D) DURABLE IDEMPOTENCY (expert reserve P1) on real Postgres.
   *     The claim is an INSERT on a unique constraint, so the database —
   *     not application timing — decides who executes. An in-memory map
   *     cannot prove this: the retry usually lands on another replica.
   * ================================================================== */
  it('(D) concurrent idempotency claims on separate connections: exactly one owner', async () => {
    const seed = createDatabaseClient();
    const clients = [createDatabaseClient(), createDatabaseClient(), createDatabaseClient(), createDatabaseClient()];

    try {
      const { projectId } = await seedProject(seed);
      const environment = 'preview';
      const key = uniqueId('idem');

      // Four independent connections race for the same key at the same instant.
      const claims = await Promise.all(
        clients.map((client) =>
          new PrismaApiStore(client).claimRollbackIdempotency({ projectId, environment, key }),
        ),
      );

      const owners = claims.filter((c) => c.owned);
      expect(owners, 'the unique constraint must elect exactly one owner').toHaveLength(1);
      expect(claims.filter((c) => !c.owned)).toHaveLength(3);

      // The owner completes; every later retry must replay, never re-execute.
      const ownerStore = new PrismaApiStore(seed);
      await ownerStore.completeRollbackIdempotency({
        projectId,
        environment,
        key,
        responseStatus: 201,
        responseBody: { deployment: { id: 'dep-winner' }, restoredFromVersion: 1 },
        deploymentId: 'dep-winner',
      });

      const replay = await ownerStore.claimRollbackIdempotency({ projectId, environment, key });
      expect(replay.owned).toBe(false);
      expect(replay.existing?.state).toBe('COMPLETED');
      expect(replay.existing?.responseStatus).toBe(201);
      expect((replay.existing?.responseBody as { deployment: { id: string } }).deployment.id).toBe('dep-winner');

      // A different key is a different operation and must still be claimable.
      const other = await ownerStore.claimRollbackIdempotency({ projectId, environment, key: uniqueId('idem') });
      expect(other.owned).toBe(true);
    } finally {
      await Promise.all([seed, ...clients].map((c) => c.$disconnect()));
    }
  });

  /* ==================================================================
   * (C) The lock key is the SAME one the publish path takes, so the two
   *     provably contend rather than passing each other by.
   * ================================================================== */
  it('(C) rollback and publish serialise on one and the same stream lock key', async () => {
    const prisma = createDatabaseClient();

    try {
      const { projectId } = await seedProject(prisma);
      const store = new PrismaApiStore(prisma);
      const key = releaseStreamLockKey(projectId, 'preview');

      expect(key).toBe(`release-manifest:${projectId}:preview`);

      /*
       * Hold the stream lock and prove a second acquisition on an independent connection
       * actually BLOCKS until it is released — i.e. the mutual exclusion the CAS relies on
       * is real, not assumed.
       */
      const other = createDatabaseClient();

      try {
        const otherStore = new PrismaApiStore(other);
        let secondEntered = false;
        let releaseFirst!: () => void;
        const firstHolds = new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });

        const first = store.withSerializedMutation(key, async () => {
          await firstHolds;
          return 'first';
        });

        // Give the first holder a moment to actually take the lock.
        await new Promise((resolve) => setTimeout(resolve, 250));

        const second = otherStore.withSerializedMutation(key, async () => {
          secondEntered = true;
          return 'second';
        });

        // While the first still holds it, the second must not have entered.
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(secondEntered).toBe(false);

        releaseFirst();
        expect(await first).toBe('first');
        expect(await second).toBe('second');
        expect(secondEntered).toBe(true);
      } finally {
        await other.$disconnect();
      }
    } finally {
      await prisma.$disconnect();
    }
  });
});
