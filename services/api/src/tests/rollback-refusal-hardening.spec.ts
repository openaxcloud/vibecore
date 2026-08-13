import { mkdtemp, mkdir, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import { computeStaticSnapshotDigest, staticDeploymentSnapshotDir } from '../deployments.js';
import type { EmailProvider } from '../email.js';
import { configDigest } from '../release-manifest.js';
import { TestApiStore } from './test-api-store.js';

/*
 * ============================================================================
 * Expert refusal (4th round) — what the LOSING side of a rollback race leaves behind.
 * ============================================================================
 *
 * The compare-and-set itself was signed off. These three reserves are about the losing
 * side's cleanup, which is where a refusal stops being a refusal:
 *
 *  P0 the loser's server workload was stopped BEST-EFFORT, and the helper swallows every
 *     failure including a non-OK HTTP status. A manager 500 / timeout / crash therefore
 *     looked identical to a clean stop: row written FAILED, caller told 409, and the stale
 *     N-1 still serving publicly. The database said one thing, the cluster another.
 *  P1 no durable idempotency: a retry after a lost 201 cut ANOTHER release, so the
 *     environment oscillated v1 → v2 → v1 with no way back to a known state.
 *  P2 the loser's restored static bytes stayed on the shared volume forever — not served
 *     (the gate is READY-only), but never collected either.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/** Serialises per key, like pg_advisory_xact_lock — the CAS needs real mutual exclusion. */
class SerializingStore extends TestApiStore {
  #chains = new Map<string, Promise<unknown>>();

  override async withSerializedMutation<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.#chains.get(key) ?? Promise.resolve();
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
}

const IMAGE_REF = 'europe-west9-docker.pkg.dev/vibecore-audit-test/repo/p-proj';
const DIGEST = 'sha256:' + 'd'.repeat(64);

describe('rollback refusal — what the loser leaves behind', () => {
  const prevStorage = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const prevManager = process.env.WORKSPACE_MANAGER_URL;
  const realFetch = globalThis.fetch;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'rb-hard-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';
    delete process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
  });

  afterEach(async () => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    };

    restore('STATIC_DEPLOY_STORAGE_DIR', prevStorage);
    restore('WORKSPACE_MANAGER_URL', prevManager);
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    await rm(storageDir, { recursive: true, force: true }).catch(() => undefined);
  });

  async function setup(store: TestApiStore) {
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `hard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
        password: 'password123',
        name: 'Hard',
        organizationName: `Hard Org ${Math.random().toString(36).slice(2, 7)}`,
      },
    });
    const auth = register.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Hard Project' },
    });

    return { app, store, token: auth.token, projectId: (project.json() as { project: { id: string } }).project.id };
  }

  const rollback = (app: Awaited<ReturnType<typeof setup>>['app'], token: string, pid: string, key?: string) =>
    app.inject({
      method: 'POST',
      url: `/projects/${pid}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${token}`, ...(key ? { 'idempotency-key': key } : {}) },
      payload: { environment: 'preview' },
    });

  /** A published static release: real bytes on disk + its manifest row. */
  async function publishStatic(store: TestApiStore, projectId: string, version: number, marker: string) {
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

    await store.createReleaseManifest({
      projectId,
      deploymentId: deployment.id,
      environment: 'preview',
      version,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-deployments/${deployment.id}`,
      artifactDigest: (await computeStaticSnapshotDigest(deployment.id))!,
    });

    return deployment;
  }

  /** Two server releases whose manifests carry the empty-config digest the rollback checks. */
  async function publishServer(store: TestApiStore, projectId: string, version: number, host: string) {
    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'READY',
      url: `https://${host}`,
      metadata: {
        rollbackable: true,
        serverDeploy: { host, ready: true, applied: true, image: { imageRef: IMAGE_REF, imageDigest: DIGEST } },
      },
    });

    await store.createReleaseManifest({
      projectId,
      deploymentId: deployment.id,
      environment: 'preview',
      version,
      provider: 'server',
      artifactKind: 'server-image',
      artifactRef: IMAGE_REF,
      artifactDigest: DIGEST,
      configDigest: configDigest({}),
    });

    return deployment;
  }

  /* ==================================================================
   * P0 — the loser's server workload must be PROVEN gone.
   * ================================================================== */
  describe('P0 — stale server workload after a refused rollback', () => {
    /**
     * Manager stub. `stopBehaviour` decides what the /stop call does, and `existsAfterStop`
     * what /status then reports — the two knobs the reserve is about.
     */
    function stubManager(opts: {
      stopBehaviour: 'ok' | 'http500' | 'timeout' | 'crash';
      existsAfterStop: boolean;
      /** When true the /status probe itself fails — we cannot CHECK whether it is gone. */
      statusUnavailable?: boolean;
    }) {
      const calls = { stop: 0, status: 0 };

      globalThis.fetch = vi.fn(async (url: unknown, init?: { body?: string }) => {
        const href = typeof url === 'string' ? url : String(url);

        if (href.includes('/server-deployments/start')) {
          const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};

          return new Response(
            JSON.stringify({ ready: true, url: `https://${String(body.host)}`, name: 'app', readyReplicas: 1 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        if (href.includes('/stop')) {
          calls.stop += 1;

          if (opts.stopBehaviour === 'http500') {
            return new Response('manager exploded', { status: 500 });
          }

          if (opts.stopBehaviour === 'timeout') {
            throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
          }

          if (opts.stopBehaviour === 'crash') {
            // The manager died mid-request: the socket dies, no HTTP status is ever produced.
            throw Object.assign(new Error('fetch failed'), {
              name: 'TypeError',
              cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
            });
          }

          return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
        }

        if (href.includes('/status')) {
          calls.status += 1;

          if (opts.statusUnavailable) {
            throw Object.assign(new Error('fetch failed'), {
              name: 'TypeError',
              cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
            });
          }

          return new Response(
            JSON.stringify({ exists: opts.existsAfterStop, readyReplicas: opts.existsAfterStop ? 1 : 0, replicas: 1 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch;

      return calls;
    }

    /**
     * Drive a rollback that LOSES the race: a publish lands v3 while the rollback is parked
     * between its head read and its compare-and-set.
     */
    async function losingServerRollback(
      store: SerializingStore,
      app: Awaited<ReturnType<typeof setup>>['app'],
      token: string,
      projectId: string,
    ) {
      let release!: () => void;
      store.pauseAfterRollbackRowCreated = new Promise<void>((resolve) => {
        release = resolve;
      });

      const inFlight = rollback(app, token, projectId);
      await store.rollbackRowCreated;

      // A concurrent publish moves the head under the parked rollback.
      await store.createReleaseManifest({
        projectId,
        deploymentId: 'other-winner',
        environment: 'preview',
        version: 3,
        provider: 'server',
        artifactKind: 'server-image',
        artifactRef: IMAGE_REF,
        artifactDigest: DIGEST,
        configDigest: configDigest({}),
      });

      release();

      return inFlight;
    }

    it('stop returns 500 → NOT a tidy FAILED+409: incident, 500, row flagged stale-active', async () => {
      const store = new PausingSerializingStore();
      const { app, token, projectId } = await setup(store);
      const calls = stubManager({ stopBehaviour: 'http500', existsAfterStop: true });

      const v1 = await publishServer(store, projectId, 1, 'd-v1.test');
      await publishServer(store, projectId, 2, 'd-v2.test');

      const res = await losingServerRollback(store, app, token, projectId);

      expect(calls.stop, 'the strict stop must have been attempted').toBeGreaterThan(0);

      /*
       * PRE-FIX: 409 + row FAILED, with the pod still up. The refusal looked complete while
       * the cluster served the stale release.
       */
      expect(res.statusCode).toBe(500);

      const body = res.json() as Record<string, unknown>;
      expect(body.code).toBe('ROLLBACK_STALE_WORKLOAD_ACTIVE');
      expect(body.staleWorkloadActive).toBe(true);

      const row = (await store.listDeployments(projectId)).find((d) => d.rolledBackFromId === v1.id)!;
      expect(row.status, 'must NOT claim a clean failure while a workload is live').not.toBe('FAILED');
      expect((row.metadata as Record<string, unknown>).staleWorkloadActive).toBe(true);

      await app.close();
    });

    it('stop times out → same incident treatment, never a silent success', async () => {
      const store = new PausingSerializingStore();
      const { app, token, projectId } = await setup(store);
      stubManager({ stopBehaviour: 'timeout', existsAfterStop: true });

      await publishServer(store, projectId, 1, 'd-v1.test');
      await publishServer(store, projectId, 2, 'd-v2.test');

      const res = await losingServerRollback(store, app, token, projectId);

      expect(res.statusCode).toBe(500);
      expect((res.json() as Record<string, unknown>).code).toBe('ROLLBACK_STALE_WORKLOAD_ACTIVE');

      await app.close();
    });

    it('stop CRASHES mid-request (socket dies, no HTTP status) → incident, never a silent success', async () => {
      const store = new PausingSerializingStore();
      const { app, token, projectId } = await setup(store);
      const calls = stubManager({ stopBehaviour: 'crash', existsAfterStop: true });

      const v1 = await publishServer(store, projectId, 1, 'd-v1.test');
      await publishServer(store, projectId, 2, 'd-v2.test');

      const res = await losingServerRollback(store, app, token, projectId);

      expect(calls.stop).toBeGreaterThan(0);
      expect(res.statusCode).toBe(500);
      expect((res.json() as Record<string, unknown>).code).toBe('ROLLBACK_STALE_WORKLOAD_ACTIVE');

      const row = (await store.listDeployments(projectId)).find((d) => d.rolledBackFromId === v1.id)!;
      expect(row.status).not.toBe('FAILED');
      expect((row.metadata as Record<string, unknown>).staleWorkloadActive).toBe(true);

      await app.close();
    });

    it('the STATUS probe itself is unreachable → "cannot check" is NOT "it is gone"', async () => {
      const store = new PausingSerializingStore();
      const { app, token, projectId } = await setup(store);

      /*
       * The stop succeeded, but the confirmation call fails. This is the subtle half of the
       * reserve: `getServerDeploymentStatusViaManager` swallows its own errors and returns
       * undefined, so a naive check would read that as "no workload found" and declare
       * victory — fail-open one level below the one that was reported. Only an explicit
       * `exists === false` may count as proof.
       */
      const calls = stubManager({ stopBehaviour: 'ok', existsAfterStop: false, statusUnavailable: true });

      const v1 = await publishServer(store, projectId, 1, 'd-v1.test');
      await publishServer(store, projectId, 2, 'd-v2.test');

      const res = await losingServerRollback(store, app, token, projectId);

      expect(calls.stop).toBeGreaterThan(0);
      expect(calls.status, 'the probe must have been attempted').toBeGreaterThan(0);
      expect(res.statusCode).toBe(500);
      expect((res.json() as Record<string, unknown>).code).toBe('ROLLBACK_STALE_WORKLOAD_ACTIVE');

      const row = (await store.listDeployments(projectId)).find((d) => d.rolledBackFromId === v1.id)!;
      expect(row.status, 'unverified disappearance must not be recorded as a clean failure').not.toBe('FAILED');
      expect((row.metadata as Record<string, unknown>).staleWorkloadActive).toBe(true);

      await app.close();
    });

    it('stop returns 200 but the workload is STILL present → still an incident', async () => {
      const store = new PausingSerializingStore();
      const { app, token, projectId } = await setup(store);
      const calls = stubManager({ stopBehaviour: 'ok', existsAfterStop: true });

      await publishServer(store, projectId, 1, 'd-v1.test');
      await publishServer(store, projectId, 2, 'd-v2.test');

      const res = await losingServerRollback(store, app, token, projectId);

      // A 200 from /stop is not proof; disappearance is checked, and it was not observed.
      expect(calls.status, 'disappearance must actually be verified').toBeGreaterThan(0);
      expect(res.statusCode).toBe(500);
      expect((res.json() as Record<string, unknown>).code).toBe('ROLLBACK_STALE_WORKLOAD_ACTIVE');

      await app.close();
    });

    it('stop succeeds AND the workload disappears → the normal 409 refusal, row FAILED', async () => {
      const store = new PausingSerializingStore();
      const { app, token, projectId } = await setup(store);
      const calls = stubManager({ stopBehaviour: 'ok', existsAfterStop: false });

      const v1 = await publishServer(store, projectId, 1, 'd-v1.test');
      await publishServer(store, projectId, 2, 'd-v2.test');

      const res = await losingServerRollback(store, app, token, projectId);

      expect(calls.stop).toBeGreaterThan(0);
      expect(calls.status).toBeGreaterThan(0);
      expect(res.statusCode).toBe(409);
      expect((res.json() as Record<string, unknown>).code).toBe('ROLLBACK_RELEASE_MOVED');

      const row = (await store.listDeployments(projectId)).find((d) => d.rolledBackFromId === v1.id)!;
      expect(row.status).toBe('FAILED');
      expect((row.metadata as Record<string, unknown>).staleWorkloadActive).toBeUndefined();

      await app.close();
    });
  });

  /* ==================================================================
   * P2 — the loser's static bytes must be collected.
   * ================================================================== */
  it('P2 — a refused static rollback leaves NO orphan snapshot on the volume', async () => {
    const store = new PausingSerializingStore();
    const { app, token, projectId } = await setup(store);

    const v1 = await publishStatic(store, projectId, 1, 'V1');
    await publishStatic(store, projectId, 2, 'V2');

    const before = await readdir(storageDir);

    let release!: () => void;
    store.pauseAfterRollbackRowCreated = new Promise<void>((resolve) => {
      release = resolve;
    });

    const inFlight = rollback(app, token, projectId);
    await store.rollbackRowCreated;

    await store.createReleaseManifest({
      projectId,
      deploymentId: 'other-winner',
      environment: 'preview',
      version: 3,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: 'static-deployments/other-winner',
      artifactDigest: 'sha256:' + 'e'.repeat(64),
    });

    release();

    const res = await inFlight;
    expect(res.statusCode).toBe(409);
    expect((res.json() as Record<string, unknown>).code).toBe('ROLLBACK_RELEASE_MOVED');

    const loser = (await store.listDeployments(projectId)).find((d) => d.rolledBackFromId === v1.id)!;
    expect(loser.status).toBe('FAILED');

    /*
     * PRE-FIX: the restored bytes stayed under the loser's id forever. Not served (the gate
     * is READY-only) but never collected — one full snapshot leaked per lost race.
     */
    const after = await readdir(storageDir);
    expect(after.sort(), 'no directory may be left behind by the refused rollback').toEqual(before.sort());
    expect(after).not.toContain(loser.id);

    await app.close();
  });

  /* ==================================================================
   * P0 (same class, other paths) — the SAME best-effort stop was still used
   * by the stale-timeout teardown and by cancel. Both wrote a terminal row
   * claiming the workload was gone while swallowing the failure; cancel is
   * the worse of the two because that workload is READY and SERVING.
   * ================================================================== */
  describe('P0 — the same fail-open on the other teardown paths', () => {
    function stubStopFailing() {
      const calls = { stop: 0 };

      globalThis.fetch = vi.fn(async (url: unknown) => {
        const href = typeof url === 'string' ? url : String(url);

        if (href.includes('/stop')) {
          calls.stop += 1;

          return new Response('manager exploded', { status: 500 });
        }

        if (href.includes('/status')) {
          /*
           * `readyReplicas: 0` matters: a non-zero value would make reconcile PROMOTE the
           * row to READY before it ever reaches the stale-timeout branch under test.
           * `exists: true` is what keeps the disappearance unproven.
           */
          return new Response(JSON.stringify({ exists: true, readyReplicas: 0, replicas: 1 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch;

      return calls;
    }

    it('CANCEL whose teardown fails: the row is cancelled but the leak is surfaced, not hidden', async () => {
      const store = new SerializingStore();
      const { app, token, projectId } = await setup(store);
      const calls = stubStopFailing();

      const deployment = await store.createDeployment({
        projectId,
        provider: 'server',
        environment: 'preview',
        status: 'BUILDING',
        metadata: { serverDeploy: { host: 'd-cancel.test', applied: true, ready: true } },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/${deployment.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(calls.stop, 'the strict stop must have been attempted').toBeGreaterThan(0);

      /*
       * PRE-FIX: a tidy 200 with the row CANCELED, and a workload still serving — the exact
       * outcome the code comment said must not happen.
       */
      const body = res.json() as Record<string, unknown>;
      expect(body.staleWorkloadActive, 'the caller must be told the workload may still be up').toBe(true);

      const row = await store.getDeployment(projectId, deployment.id);
      expect((row!.metadata as Record<string, unknown>).staleWorkloadActive).toBe(true);

      await app.close();
    });

    it('STALE-TIMEOUT teardown whose stop fails: still FAILED, but the leak is recorded', async () => {
      const store = new SerializingStore();
      const { app, token, projectId } = await setup(store);
      stubStopFailing();

      // A server deploy that never converged, older than the stale timeout (40 min).
      const deployment = await store.createDeployment({
        projectId,
        provider: 'server',
        environment: 'preview',
        status: 'BUILDING',
        metadata: { serverDeploy: { host: 'd-stale.test', applied: true, ready: false } },
      });
      store.deployments.get(deployment.id)!.startedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Reading the deployment is what drives reconcileDeploymentStatus.
      const res = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/${deployment.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);

      const row = await store.getDeployment(projectId, deployment.id);
      expect(row!.status, 'the timeout verdict itself still stands').toBe('FAILED');
      expect(
        (row!.metadata as Record<string, unknown>).staleWorkloadActive,
        'an unproven teardown must be recorded, not claimed handled',
      ).toBe(true);

      await app.close();
    });
  });

  /* ==================================================================
   * P1 — durable idempotency.
   * ================================================================== */
  describe('P1 — durable idempotency', () => {
    it('a retry after a LOST response replays the original — it does not roll back again', async () => {
      const store = new SerializingStore();
      const { app, token, projectId } = await setup(store);

      await publishStatic(store, projectId, 1, 'V1');
      await publishStatic(store, projectId, 2, 'V2');

      const first = await rollback(app, token, projectId, 'key-lost-response');
      expect(first.statusCode).toBe(201);

      const firstBody = first.json() as { deployment: { id: string }; restoredFromVersion: number };
      const versionsAfterFirst = (await store.listReleaseManifests(projectId, 'preview')).map((m) => m.version);

      // The client never saw that response. It retries with the SAME key.
      const retry = await rollback(app, token, projectId, 'key-lost-response');

      expect(retry.statusCode).toBe(201);
      expect(retry.headers['idempotency-replayed']).toBe('true');

      const retryBody = retry.json() as { deployment: { id: string }; restoredFromVersion: number };
      expect(retryBody.deployment.id, 'the replay must name the SAME deployment').toBe(firstBody.deployment.id);
      expect(retryBody.restoredFromVersion).toBe(firstBody.restoredFromVersion);

      /*
       * PRE-FIX the retry cut ANOTHER release: the stream grew again and the environment
       * oscillated. The version list must be untouched.
       */
      const versionsAfterRetry = (await store.listReleaseManifests(projectId, 'preview')).map((m) => m.version);
      expect(versionsAfterRetry.sort(), 'a retry must not cut a new release').toEqual(versionsAfterFirst.sort());

      await app.close();
    });

    it('two CONCURRENT calls with the same key produce exactly ONE effect', async () => {
      const store = new SerializingStore();
      const { app, token, projectId } = await setup(store);

      await publishStatic(store, projectId, 1, 'V1');
      await publishStatic(store, projectId, 2, 'V2');

      const [a, b] = await Promise.all([
        rollback(app, token, projectId, 'key-concurrent'),
        rollback(app, token, projectId, 'key-concurrent'),
      ]);

      const codes = [a.statusCode, b.statusCode].sort();

      // One executes; the other is either refused in-flight (409) or replays (201).
      expect(codes[0]).toBe(201);

      const rollbackRows = (await store.listDeployments(projectId)).filter(
        (d) => (d.metadata as Record<string, unknown>)?.rollbackToPrevious === true,
      );
      expect(rollbackRows, 'exactly one rollback row may exist for one key').toHaveLength(1);

      const versions = (await store.listReleaseManifests(projectId, 'preview')).map((m) => m.version);
      expect(versions.sort((x, y) => x - y), 'the stream advanced by exactly one release').toEqual([1, 2, 3]);

      await app.close();
    });

    it('a 5xx does NOT become the replayable answer — a retry really retries', async () => {
      const store = new PausingSerializingStore();
      const { app, token, projectId } = await setup(store);

      globalThis.fetch = vi.fn(async (url: unknown, init?: { body?: string }) => {
        const href = typeof url === 'string' ? url : String(url);

        if (href.includes('/server-deployments/start')) {
          const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};

          return new Response(
            JSON.stringify({ ready: true, url: `https://${String(body.host)}`, name: 'app', readyReplicas: 1 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        if (href.includes('/stop')) {
          return new Response('manager exploded', { status: 500 });
        }

        return new Response(JSON.stringify({ exists: true, readyReplicas: 1, replicas: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as unknown as typeof fetch;

      await publishServer(store, projectId, 1, 'd-v1.test');
      await publishServer(store, projectId, 2, 'd-v2.test');

      let release!: () => void;
      store.pauseAfterRollbackRowCreated = new Promise<void>((resolve) => {
        release = resolve;
      });

      const inFlight = app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/rollback-to-previous`,
        headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'key-5xx' },
        payload: { environment: 'preview' },
      });

      await store.rollbackRowCreated;
      await store.createReleaseManifest({
        projectId,
        deploymentId: 'other-winner',
        environment: 'preview',
        version: 3,
        provider: 'server',
        artifactKind: 'server-image',
        artifactRef: IMAGE_REF,
        artifactDigest: DIGEST,
        configDigest: configDigest({}),
      });
      release();

      const first = await inFlight;
      expect(first.statusCode).toBe(500);

      /*
       * Pinning that 500 as the replay would make the failure permanent: every retry would
       * be handed the same incident without ever re-attempting. The claim must be released.
       */
      const claim = store.peekRollbackIdempotency({ projectId, environment: 'preview', key: 'key-5xx' });
      expect(claim, 'the claim must have been released after a 5xx').toBeUndefined();

      await app.close();
    });

    it('an ABANDONED in-flight claim (process died) is taken over, not wedged forever', async () => {
      const store = new SerializingStore();
      const { app, token, projectId } = await setup(store);

      await publishStatic(store, projectId, 1, 'V1');
      await publishStatic(store, projectId, 2, 'V2');

      // A previous process claimed the key and died before completing or releasing it.
      await store.claimRollbackIdempotency({ projectId, environment: 'preview', key: 'key-abandoned' });
      const backdated = store.backdateRollbackIdempotency(
        { projectId, environment: 'preview', key: 'key-abandoned' },
        30 * 60 * 1000,
      );
      expect(backdated, 'the claim to backdate must exist').toBe(true);
      expect(store.peekRollbackIdempotency({ projectId, environment: 'preview', key: 'key-abandoned' })?.state).toBe(
        'IN_FLIGHT',
      );

      // Fresh claims stay refused…
      await store.claimRollbackIdempotency({ projectId, environment: 'preview', key: 'key-fresh' });
      const refused = await rollback(app, token, projectId, 'key-fresh');
      expect(refused.statusCode).toBe(409);
      expect((refused.json() as Record<string, unknown>).code).toBe('ROLLBACK_IN_PROGRESS');

      // …but the abandoned one is taken over instead of wedging the key for good.
      const res = await rollback(app, token, projectId, 'key-abandoned');
      expect(res.statusCode, 'an abandoned claim must not wedge the key forever').toBe(201);

      await app.close();
    });

    it('a different key is a different operation — it is NOT deduplicated', async () => {
      const store = new SerializingStore();
      const { app, token, projectId } = await setup(store);

      await publishStatic(store, projectId, 1, 'V1');
      await publishStatic(store, projectId, 2, 'V2');

      expect((await rollback(app, token, projectId, 'key-A')).statusCode).toBe(201);
      expect((await rollback(app, token, projectId, 'key-B')).statusCode).toBe(201);

      const versions = (await store.listReleaseManifests(projectId, 'preview')).map((m) => m.version);
      expect(versions.sort((x, y) => x - y)).toEqual([1, 2, 3, 4]);

      await app.close();
    });
  });
});

/**
 * Adds the deterministic barrier used to make a rollback LOSE the race: it parks right
 * after its row is created — i.e. after it read the head and selected N-1, and before the
 * compare-and-set — at a point where it holds no lock, so the racing publish can commit.
 */
class PausingSerializingStore extends SerializingStore {
  pauseAfterRollbackRowCreated: Promise<void> | undefined;
  rollbackRowCreated: Promise<void>;
  #signal!: () => void;

  constructor() {
    super();
    this.rollbackRowCreated = new Promise<void>((resolve) => {
      this.#signal = resolve;
    });
  }

  override async createDeployment(input: Parameters<TestApiStore['createDeployment']>[0]) {
    const row = await super.createDeployment(input);

    if ((input.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true) {
      this.#signal();

      if (this.pauseAfterRollbackRowCreated) {
        await this.pauseAfterRollbackRowCreated;
      }
    }

    return row;
  }
}
