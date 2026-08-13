import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { computeStaticSnapshotDigest, staticDeploymentSnapshotDir } from '../deployments.js';
import type { EmailProvider } from '../email.js';
import { configDigest } from '../release-manifest.js';
import type { DeploymentRecord, ReleaseManifestRecord } from '../store.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Expert PROVEN_REVIEW_PENDING — the TWO invariants to confirm/cover:
 *
 *  (a) LINEARIZATION: the restored destination is NEVER publicly visible before the
 *      whole sequence linearizes — copy + all rewrites → final digest → durable
 *      manifest → serving state. Proven at BOTH ends: the HTTP serve gate (a snapshot
 *      on disk under a non-READY row 404s) and the store ordering (the manifest is
 *      written BEFORE the row flips READY, and its digest matches the bytes on disk).
 *
 *  (b) CONCURRENCY: a concurrent publish OR a second concurrent rollback cannot
 *      modify release N-1 during the operation — the immutable manifest row and its
 *      retained bytes are untouched, and version assignment is serialized (no two
 *      releases collide on a version).
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/** Records the order of the restored release's manifest write vs its READY flip. */
class OrderingStore extends TestApiStore {
  readonly events: string[] = [];
  rollbackDeploymentId?: string;

  override async createDeployment(input: Parameters<TestApiStore['createDeployment']>[0]): Promise<DeploymentRecord> {
    const created = await super.createDeployment(input);
    if ((input.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true) {
      this.rollbackDeploymentId = created.id;
    }
    return created;
  }

  override async createReleaseManifest(
    input: Parameters<TestApiStore['createReleaseManifest']>[0],
  ): Promise<ReleaseManifestRecord> {
    if (input.deploymentId === this.rollbackDeploymentId) {
      this.events.push('manifest-durable');
    }
    return super.createReleaseManifest(input);
  }

  override async updateDeployment(
    projectId: string,
    deploymentId: string,
    patch: Parameters<TestApiStore['updateDeployment']>[2],
  ): Promise<DeploymentRecord> {
    if (deploymentId === this.rollbackDeploymentId && (patch as { status?: string }).status === 'READY') {
      this.events.push('row-ready');
    }
    return super.updateDeployment(projectId, deploymentId, patch);
  }
}

/**
 * A store whose withSerializedMutation ACTUALLY serialises per key — modelling the
 * production PrismaApiStore's pg_advisory_xact_lock. (The base TestApiStore runs the
 * section inline, which cannot expose a version-assignment race.)
 */
class SerializingStore extends TestApiStore {
  private readonly chains = new Map<string, Promise<unknown>>();

  override async withSerializedMutation<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.chains.set(
      key,
      prev.then(() => gate),
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

describe('rollback linearization + concurrency (expert invariants a & b)', () => {
  const prev = process.env.STATIC_DEPLOY_STORAGE_DIR;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'rblc-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = prev;
    await rm(storageDir, { recursive: true, force: true });
  });

  async function setup(store: TestApiStore) {
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'rblc@example.com', password: 'password123', name: 'L', organizationName: 'L Org' },
    });
    const auth = register.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'L Project' },
    });
    const projectId = (project.json() as { project: { id: string } }).project.id;
    return { app, auth, projectId };
  }

  /** A READY static release with an index.html carrying the OLD id's base path. */
  async function publishStatic(store: TestApiStore, projectId: string, version: number, marker: string) {
    const deployment = await store.createDeployment({
      projectId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://example.test/x',
    });
    const dir = staticDeploymentSnapshotDir(deployment.id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'index.html'),
      `<!doctype html><html><head><script src="/static-deployments/${deployment.id}/assets/app.js"></script></head><body><h1>${marker}</h1></body></html>`,
      'utf8',
    );
    const artifactDigest = (await computeStaticSnapshotDigest(deployment.id))!;
    await store.createReleaseManifest({
      projectId,
      deploymentId: deployment.id,
      environment: 'preview',
      version,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-deployments/${deployment.id}`,
      artifactDigest,
      configDigest: configDigest({}),
    });
    return { deployment, artifactDigest };
  }

  let rollbackAttempt = 0;
  const rollback = (app: Awaited<ReturnType<typeof setup>>['app'], token: string, projectId: string) =>
    app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': `manifest-order-${projectId}-${++rollbackAttempt}`,
      },
      payload: { environment: 'preview' },
    });

  // ============================ invariant (a) ============================

  it('(a) HTTP: a snapshot on disk under a non-READY row is NOT publicly served (404 until READY)', async () => {
    const store = new TestApiStore();
    const { app, projectId } = await setup(store);

    // A snapshot fully written on disk, but the row is still QUEUED (mid-build /
    // mid-rollback-restore) — it must NOT be publicly visible yet.
    const dep = await store.createDeployment({ projectId, provider: 'static', environment: 'preview', status: 'QUEUED' });
    const dir = staticDeploymentSnapshotDir(dep.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), '<!doctype html><body>PENDING BYTES</body>', 'utf8');

    const beforeReady = await app.inject({ method: 'GET', url: `/static-deployments/${dep.id}/` });
    expect(beforeReady.statusCode).toBe(404);
    expect((beforeReady.json() as { code: string }).code).toBe('STATIC_DEPLOY_ARTIFACT_NOT_FOUND');

    // BUILDING is likewise not servable.
    await store.updateDeployment(projectId, dep.id, { status: 'BUILDING' });
    const building = await app.inject({ method: 'GET', url: `/static-deployments/${dep.id}/` });
    expect(building.statusCode).toBe(404);

    // Only once the row reaches the serving state (READY) are the bytes visible.
    await store.updateDeployment(projectId, dep.id, { status: 'READY' });
    const afterReady = await app.inject({ method: 'GET', url: `/static-deployments/${dep.id}/` });
    expect(afterReady.statusCode).toBe(200);
    expect(afterReady.body).toContain('PENDING BYTES');
  });

  it('(a) ORDER: the restored manifest is durably written BEFORE READY, and its digest matches the served bytes', async () => {
    const store = new OrderingStore();
    const { app, auth, projectId } = await setup(store);
    await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const res = await rollback(app, auth.token, projectId);
    expect(res.statusCode).toBe(201);
    const body = res.json() as { deployment: { id: string }; restoredArtifactDigest: string };

    // Linearization: the durable manifest write is observed BEFORE the READY flip.
    expect(store.events).toEqual(['manifest-durable', 'row-ready']);
    expect(store.events.indexOf('manifest-durable')).toBeLessThan(store.events.indexOf('row-ready'));

    // And the digest recorded == the bytes actually on disk (copy + rewrite finished
    // before the digest was computed and recorded — no partial artifact recorded).
    const onDisk = (await computeStaticSnapshotDigest(body.deployment.id))!;
    const manifest = (await store.listReleaseManifests(projectId, 'preview'))[0];
    expect(manifest.version).toBe(3);
    expect(manifest.deploymentId).toBe(body.deployment.id);
    expect(manifest.artifactDigest).toBe(onDisk);
    expect(body.restoredArtifactDigest).toBe(onDisk);
  });

  // ============================ invariant (b) ============================

  /*
   * REWRITTEN after the expert's concurrency refusal. This test used to assert that N
   * concurrent rollbacks ALL return 201 with "distinct monotonic versions" — which is
   * precisely the property the bug preserved, so it certified the defect instead of
   * catching it. Distinct version numbers say nothing about whether the outcome is
   * reachable sequentially: three rollbacks all restoring v1 is not.
   *
   * The contract asserted now is serial equivalence: at most one rollback commits against
   * a given release head, the rest are refused 409 ROLLBACK_RELEASE_MOVED. Full coverage
   * of the interleavings lives in rollback-concurrency-linearization.spec.ts (in-memory)
   * and rollback-concurrency-postgres.spec.ts (real Postgres, both interleavings).
   */
  it('(b) N CONCURRENT rollbacks: exactly one commits, the rest refused; N-1 row + bytes untouched', async () => {
    const store = new SerializingStore();
    const { app, auth, projectId } = await setup(store);
    const v1 = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const v1Before = (await store.listReleaseManifests(projectId, 'preview')).find((m) => m.version === 1)!;
    const v1DigestBefore = (await computeStaticSnapshotDigest(v1.deployment.id))!;
    const v1BytesBefore = await readFile(join(staticDeploymentSnapshotDir(v1.deployment.id), 'index.html'), 'utf8');

    // Fire N rollbacks concurrently against the SAME (project, env) target.
    const N = 3;
    const results = await Promise.all(Array.from({ length: N }, () => rollback(app, auth.token, projectId)));

    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(N - 1);

    for (const refused of results.filter((r) => r.statusCode === 409)) {
      expect((refused.json() as Record<string, unknown>).code).toBe('ROLLBACK_RELEASE_MOVED');
    }

    // The stream advanced by exactly ONE release — not by N.
    const after = await store.listReleaseManifests(projectId, 'preview');
    const versions = after.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual([1, 2, 3]);

    // N-1 (release v1) was NEVER modified by the concurrent operations: same
    // immutable row, same retained bytes/digest.
    const v1After = after.find((m) => m.version === 1)!;
    expect(v1After.artifactDigest).toBe(v1Before.artifactDigest);
    expect(v1After.deploymentId).toBe(v1Before.deploymentId);
    expect(await computeStaticSnapshotDigest(v1.deployment.id)).toBe(v1DigestBefore);
    expect(await readFile(join(staticDeploymentSnapshotDir(v1.deployment.id), 'index.html'), 'utf8')).toBe(v1BytesBefore);
  });

  it('(b) a rollback CONCURRENT with a publish (same serialised key) never collide on a version', async () => {
    const store = new SerializingStore();
    const { app, auth, projectId } = await setup(store);
    await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    // Model a concurrent publish appending its own release manifest through the SAME
    // serialised key the rollback uses, racing the rollback endpoint.
    const concurrentPublish = store.withSerializedMutation(`release-manifest:${projectId}:preview`, async () => {
      const latest = await store.listReleaseManifests(projectId, 'preview', { take: 1 });
      const nextVersion = (latest[0]?.version ?? 0) + 1;
      const dep = await store.createDeployment({
        projectId,
        provider: 'static',
        environment: 'preview',
        status: 'READY',
      });
      return store.createReleaseManifest({
        projectId,
        deploymentId: dep.id,
        environment: 'preview',
        version: nextVersion,
        provider: 'static',
        artifactKind: 'static-snapshot',
        artifactRef: `static-deployments/${dep.id}`,
        artifactDigest: 'sha256:' + 'e'.repeat(64),
        configDigest: configDigest({}),
      });
    });

    const [rollbackRes] = await Promise.all([rollback(app, auth.token, projectId), concurrentPublish]);
    expect(rollbackRes.statusCode).toBe(201);

    const after = await store.listReleaseManifests(projectId, 'preview');
    const versions = after.map((m) => m.version);
    // No collision: the publish and the rollback got DISTINCT versions.
    expect(new Set(versions).size).toBe(versions.length);
    expect(after.length).toBe(4);
    expect([...versions].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });
});
