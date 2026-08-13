import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { staticDeploymentSnapshotDir } from '../deployments.js';
import type { EmailProvider } from '../email.js';
import { ReleaseHeadMovedError, appendReleaseManifestAtHead, readReleaseHeadVersion } from '../release-manifest.js';
import { TestApiStore } from './test-api-store.js';

/*
 * ============================================================================
 * Expert refusal (3rd round) — CONCURRENCY of the rollback chain.
 * ============================================================================
 *
 * The defect: `selectPreviousRelease` ran on an UNLOCKED read, and the serialized
 * section covered only the version assignment at append time. Three concurrent
 * rollbacks therefore all read the same head [v2, v1], all chose previous = v1, and
 * all restored v1 — receiving distinct versions v3/v4/v5 that made the outcome look
 * ordered while being unreachable by ANY sequential execution. Run serially, rollback
 * #2 sees #1's release as the new head and restores v2, #3 restores v1 again, etc.
 *
 * The old suite asserted only "distinct monotonic versions", which is exactly the
 * property the bug preserved — so it passed throughout.
 *
 * These tests assert the property that actually matters: SERIAL EQUIVALENCE. At most
 * one rollback may commit against a given release head; every other concurrent one is
 * refused 409 ROLLBACK_RELEASE_MOVED and leaves nothing behind.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/**
 * A store whose `withSerializedMutation` ACTUALLY serialises per key — the in-memory
 * model of pg_advisory_xact_lock. Without this the in-memory suite would prove nothing
 * about a mechanism whose whole point is mutual exclusion.
 */
class SerializingTestStore extends TestApiStore {
  #chains = new Map<string, Promise<unknown>>();

  /**
   * Barrier used to force a DETERMINISTIC interleaving: when set, a rollback pauses
   * right after its row is created — i.e. AFTER it has selected N-1 and read the head,
   * and BEFORE it reaches the compare-and-set. The pause is deliberately placed where
   * the rollback holds NO lock, so the racing publish can take the stream lock and
   * actually move the head (pausing under the lock would just deadlock the two).
   */
  pauseAfterRollbackRowCreated: Promise<void> | undefined;
  rollbackRowCreated: Promise<void>;
  #signalRollbackRowCreated!: () => void;

  constructor() {
    super();
    this.rollbackRowCreated = new Promise<void>((resolve) => {
      this.#signalRollbackRowCreated = resolve;
    });
  }

  override async withSerializedMutation<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.#chains.get(key) ?? Promise.resolve();
    // Chain onto the previous holder, swallowing its outcome so one failure can't poison the key.
    const run = prior.then(
      () => fn(),
      () => fn(),
    );
    this.#chains.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );

    return run;
  }

  override async createDeployment(input: Parameters<TestApiStore['createDeployment']>[0]) {
    const row = await super.createDeployment(input);

    if ((input.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true) {
      this.#signalRollbackRowCreated();

      if (this.pauseAfterRollbackRowCreated) {
        await this.pauseAfterRollbackRowCreated;
      }
    }

    return row;
  }
}

const DIGEST = (n: number) => `sha256:${String(n).repeat(64).slice(0, 64)}`;

describe('rollback concurrency — serial equivalence of the release stream', () => {
  const prevStorage = process.env.STATIC_DEPLOY_STORAGE_DIR;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'rb-conc-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
  });

  afterEach(async () => {
    if (prevStorage === undefined) {
      delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    } else {
      process.env.STATIC_DEPLOY_STORAGE_DIR = prevStorage;
    }

    await rm(storageDir, { recursive: true, force: true }).catch(() => undefined);
  });

  async function setup() {
    const store = new SerializingTestStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'rb-conc@example.com',
        password: 'password123',
        name: 'RB',
        organizationName: 'RB Org',
      },
    });
    expect(register.statusCode).toBe(201);

    const auth = register.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'RB Project' },
    });

    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { app, store, token: auth.token, projectId };
  }

  /** A published static release: real snapshot bytes on disk + its manifest row. */
  async function publishStaticRelease(store: TestApiStore, projectId: string, version: number, marker: string) {
    const deployment = await store.createDeployment({
      projectId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: `https://example.test/v${version}`,
      metadata: { rollbackable: true },
    });

    const dir = staticDeploymentSnapshotDir(deployment.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), `<!doctype html><body>${marker}</body>`, 'utf8');

    const { computeStaticSnapshotDigest } = await import('../deployments.js');
    const digest = (await computeStaticSnapshotDigest(deployment.id)) ?? DIGEST(version);

    await store.createReleaseManifest({
      projectId,
      deploymentId: deployment.id,
      environment: 'preview',
      version,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-deployments/${deployment.id}`,
      artifactDigest: digest,
    });

    return { deployment, digest, marker };
  }

  let rollbackAttempt = 0;
  const rollback = (app: Awaited<ReturnType<typeof setup>>['app'], token: string, projectId: string) =>
    app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': `linearization-${projectId}-${++rollbackAttempt}`,
      },
      payload: { environment: 'preview' },
    });

  /* ====================================================================
   * (1) THE REPRO. Three concurrent rollbacks against head v2.
   * ==================================================================== */
  it('three CONCURRENT rollbacks: exactly one commits, the others are refused 409', async () => {
    const { app, store, token, projectId } = await setup();

    const v1 = await publishStaticRelease(store, projectId, 1, 'V1-CONTENT');
    await publishStaticRelease(store, projectId, 2, 'V2-CONTENT');

    const results = await Promise.all([
      rollback(app, token, projectId),
      rollback(app, token, projectId),
      rollback(app, token, projectId),
    ]);

    const statuses = results.map((r) => r.statusCode).sort();
    const bodies = results.map((r) => r.json() as Record<string, unknown>);

    /*
     * THE DEFECT, stated directly. Every rollback that COMMITS must have restored a
     * distinct release: run serially, #1 restores v1, #2 then sees #1's release as the
     * head and restores v2, and so on. Two commits both claiming to restore v1 is an
     * outcome no sequential order can produce.
     *
     * PRE-FIX this assertion reads: expected [1, 1, 1] to deeply equal [1] — the three
     * concurrent rollbacks all restoring v1, which is the reservation verbatim.
     */
    const committedVersions = bodies
      .filter((_, i) => results[i].statusCode === 201)
      .map((b) => b.restoredFromVersion as number);

    expect(committedVersions, 'no two committed rollbacks may restore the same release').toEqual([
      ...new Set(committedVersions),
    ]);

    expect(statuses).toEqual([201, 409, 409]);

    const winners = bodies.filter((_, i) => results[i].statusCode === 201);
    const losers = bodies.filter((_, i) => results[i].statusCode === 409);

    expect(winners).toHaveLength(1);
    expect(winners[0].restoredFromVersion).toBe(1);
    expect(winners[0].supersededVersion).toBe(2);

    for (const loser of losers) {
      expect(loser.code).toBe('ROLLBACK_RELEASE_MOVED');
      expect(loser.expectedVersion).toBe(2);
      expect(loser.observedVersion).toBe(3);
    }

    /*
     * The stream advanced by exactly ONE release: v1, v2, v3. Pre-fix it was
     * v1..v5 — three rollback manifests all pointing at v1's content.
     */
    const manifests = await store.listReleaseManifests(projectId, 'preview');
    expect(manifests.map((m) => m.version).sort((a, b) => a - b)).toEqual([1, 2, 3]);

    // The single new release restores v1's bytes; N-1's own row and bytes are untouched.
    const head = manifests.find((m) => m.version === 3)!;
    const { computeStaticSnapshotDigest } = await import('../deployments.js');
    expect(await computeStaticSnapshotDigest(v1.deployment.id)).toBe(v1.digest);
    expect(head.deploymentId).not.toBe(v1.deployment.id);

    // The two refused rollbacks left FAILED rows, never READY ones that could be served.
    const rows = await store.listDeployments(projectId);
    const refused = rows.filter((d) => (d.metadata as Record<string, unknown>)?.rollbackToPrevious === true);
    expect(refused.filter((d) => d.status === 'READY')).toHaveLength(1);
    expect(refused.filter((d) => d.status === 'FAILED')).toHaveLength(2);

    await app.close();
  });

  /* ====================================================================
   * (2) rollback ⟂ publish: a publish that lands first moves the head,
   *     so the in-flight rollback must refuse rather than clobber it.
   * ==================================================================== */
  it('a publish that lands mid-rollback moves the head and the rollback refuses', async () => {
    const { app, store, token, projectId } = await setup();

    await publishStaticRelease(store, projectId, 1, 'V1-CONTENT');
    const v2 = await publishStaticRelease(store, projectId, 2, 'V2-CONTENT');

    /*
     * DETERMINISTIC interleaving, forced by the barrier:
     *   1. the rollback selects N-1 against head v2 and creates its row, then PAUSES;
     *   2. the publish appends v3 — the head moves under the paused rollback;
     *   3. the rollback resumes and reaches its compare-and-set, which expects v2.
     * Only one order is possible here, so the assertion below is unconditional.
     */
    let release!: () => void;
    store.pauseAfterRollbackRowCreated = new Promise<void>((resolve) => {
      release = resolve;
    });

    const inFlight = rollback(app, token, projectId);

    // Wait until the rollback has provably selected against head v2 and parked.
    await store.rollbackRowCreated;

    const publishAppend = await appendReleaseManifestAtHead(store, {
      projectId,
      environment: 'preview',
      expectedHeadVersion: 2,
      manifest: {
        deploymentId: v2.deployment.id,
        provider: 'static',
        artifactKind: 'static-snapshot',
        artifactRef: `static-deployments/${v2.deployment.id}`,
        artifactDigest: v2.digest,
      },
    });
    expect(publishAppend.version).toBe(3);

    release();

    const res = await inFlight;

    // The rollback computed N-1 from a head that no longer exists → refused, not merged.
    expect(res.statusCode).toBe(409);

    const body = res.json() as Record<string, unknown>;
    expect(body.code).toBe('ROLLBACK_RELEASE_MOVED');
    expect(body.expectedVersion).toBe(2);
    expect(body.observedVersion).toBe(3);

    // The publish is the only writer that advanced the stream.
    const manifests = await store.listReleaseManifests(projectId, 'preview');
    expect(manifests.map((m) => m.version).sort((a, b) => a - b)).toEqual([1, 2, 3]);

    await app.close();
  });

  /* ====================================================================
   * (3) The CAS primitive itself, in isolation.
   * ==================================================================== */
  it('appendReleaseManifestAtHead refuses a stale head and writes nothing', async () => {
    const store = new SerializingTestStore();
    const projectId = 'p-cas';

    const append = (expected: number, deploymentId: string) =>
      appendReleaseManifestAtHead(store, {
        projectId,
        environment: 'preview',
        expectedHeadVersion: expected,
        manifest: {
          deploymentId,
          provider: 'static',
          artifactKind: 'static-snapshot',
          artifactRef: `static-deployments/${deploymentId}`,
          artifactDigest: DIGEST(1),
        },
      });

    expect(await readReleaseHeadVersion(store, projectId, 'preview')).toBe(0);

    const first = await append(0, 'd-1');
    expect(first.version).toBe(1);

    // A second writer still holding the stale head 0 is refused, and writes nothing.
    await expect(append(0, 'd-2')).rejects.toBeInstanceOf(ReleaseHeadMovedError);
    expect(await store.listReleaseManifests(projectId, 'preview')).toHaveLength(1);

    // Re-reading the head lets it succeed — the retry path a refused rollback takes.
    const second = await append(1, 'd-2');
    expect(second.version).toBe(2);

    await expect(append(0, 'd-3')).rejects.toMatchObject({
      code: 'ROLLBACK_RELEASE_MOVED',
      expectedVersion: 0,
      observedVersion: 2,
    });

    expect(await store.listReleaseManifests(projectId, 'preview')).toHaveLength(2);
  });

  /* ====================================================================
   * (4) N concurrent CAS appends from the same head: exactly one wins.
   * ==================================================================== */
  it('N concurrent appends from one head: exactly one wins, N-1 refused', async () => {
    const store = new SerializingTestStore();
    const projectId = 'p-cas-n';

    await appendReleaseManifestAtHead(store, {
      projectId,
      environment: 'preview',
      expectedHeadVersion: 0,
      manifest: {
        deploymentId: 'd-base',
        provider: 'static',
        artifactKind: 'static-snapshot',
        artifactRef: 'static-deployments/d-base',
        artifactDigest: DIGEST(1),
      },
    });

    const head = await readReleaseHeadVersion(store, projectId, 'preview');
    expect(head).toBe(1);

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        appendReleaseManifestAtHead(store, {
          projectId,
          environment: 'preview',
          expectedHeadVersion: head,
          manifest: {
            deploymentId: `d-race-${i}`,
            provider: 'static',
            artifactKind: 'static-snapshot',
            artifactRef: `static-deployments/d-race-${i}`,
            artifactDigest: DIGEST(2),
          },
        }),
      ),
    );

    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((a) => a.status === 'rejected')).toHaveLength(4);

    for (const a of attempts) {
      if (a.status === 'rejected') {
        expect(a.reason).toBeInstanceOf(ReleaseHeadMovedError);
      }
    }

    expect(await store.listReleaseManifests(projectId, 'preview')).toHaveLength(2);
  });
});
