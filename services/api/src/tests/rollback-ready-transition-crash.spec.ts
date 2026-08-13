import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailProvider } from '../email.js';
import { configDigest } from '../release-manifest.js';
import { TestApiStore } from './test-api-store.js';

/*
 * ============================================================================
 * Expert refusal (2nd round) — CRASH INJECTED ON THE *REAL* READY TRANSITIONS.
 * ============================================================================
 *
 * The refused test suite materialised the crash STATE by hand: it created a row
 * that was ALREADY `status:'READY' + rollbackable:false + manifest_pending` and then
 * asserted it was fail-closed. That is circular — it asserts the fixture, never the
 * transition, so every server path that reaches READY WITHOUT going through the sealed
 * write (reconcileDeploymentStatus, the server publish, promote-to-production, the
 * server rollbacks) passed the suite while being fail-OPEN in production.
 *
 * These tests instead drive the REAL handlers and kill the process at the exact
 * post-commit instant: `CrashAfterCommitStore` performs the genuine write, lets it
 * COMMIT, and only then throws — modelling `kill -9` landing between the row update
 * and the very next statement. Nothing about the row is fabricated; whatever the
 * production code path wrote is what we then assert on.
 *
 * The invariant under test, on every path that can reach READY:
 *
 *     a static/server deployment row is NEVER persisted at READY with
 *     `rollbackable !== false` unless its manifest is ALREADY durable.
 *
 * Each transition gets two tests: (1) crash → the persisted row is fail-closed, and
 * (2) no crash → the row is only rollbackable:true with a manifest actually behind it.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/** Thrown INSTEAD of returning, after the write has already committed. */
class ProcessCrash extends Error {
  constructor(what: string) {
    super(`injected crash immediately after ${what} committed`);
    this.name = 'ProcessCrash';
  }
}

type MutationKind = 'create' | 'update';

/**
 * A store that commits the real write and THEN dies, modelling `kill -9` landing
 * between that commit and the very next statement.
 *
 * Faithfulness matters here: merely THROWING would be caught by the handlers' own
 * try/catch, which would then run their compensation writes (e.g. the rollback
 * handler marking the row FAILED) — a process that has been killed does no such
 * thing. So the fatal write also flips the store DEAD: every later deployment or
 * manifest mutation is dropped on the floor, exactly as writes from a dead process
 * never reach the database. The store therefore freezes at the crash instant, and
 * that frozen state is what the assertions inspect.
 */
class CrashAfterCommitStore extends TestApiStore {
  crashOn: ((patch: Record<string, unknown>, kind: MutationKind) => boolean) | undefined;
  crashes = 0;
  dead = false;

  private maybeCrash(patch: Record<string, unknown>, kind: MutationKind) {
    if (!this.crashOn || this.crashes > 0 || !this.crashOn(patch, kind)) {
      return;
    }

    this.crashes += 1;
    this.dead = true;
    throw new ProcessCrash(`${kind} deployment (status=${String(patch.status)})`);
  }

  override async createDeployment(input: Parameters<TestApiStore['createDeployment']>[0]) {
    if (this.dead) {
      // A dead process's INSERT never lands; hand back an unpersisted shape.
      return { ...(input as Record<string, unknown>), id: 'dead-process-never-inserted' } as Awaited<
        ReturnType<TestApiStore['createDeployment']>
      >;
    }

    const row = await super.createDeployment(input);
    this.maybeCrash(input as unknown as Record<string, unknown>, 'create');

    return row;
  }

  override async updateDeployment(
    projectId: string,
    deploymentId: string,
    input: Parameters<TestApiStore['updateDeployment']>[2],
  ) {
    if (this.dead) {
      // Drop the write, return the row as the DB still holds it.
      const current = await super.getDeployment(projectId, deploymentId);

      if (current) {
        return current;
      }
    }

    const row = await super.updateDeployment(projectId, deploymentId, input);
    this.maybeCrash(input as unknown as Record<string, unknown>, 'update');

    return row;
  }

  override async createReleaseManifest(input: Parameters<TestApiStore['createReleaseManifest']>[0]) {
    if (this.dead) {
      return {
        ...(input as Record<string, unknown>),
        id: 'dead-process-never-inserted',
        createdAt: new Date(0).toISOString(),
      } as Awaited<ReturnType<TestApiStore['createReleaseManifest']>>;
    }

    return super.createReleaseManifest(input);
  }

  /** "Restart" the process: writes land again, the wreckage stays as it was. */
  restart() {
    this.crashOn = undefined;
    this.dead = false;
  }
}

/** Crash on the first mutation that persists READY — the transition under test. */
const crashOnReady = (patch: Record<string, unknown>) => patch.status === 'READY';

const IMAGE_REF = 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/p-proj';
const DIGEST = 'sha256:' + 'c'.repeat(64);

/** The exact fail-closed shape a READY row must carry before its manifest is durable. */
function expectFailClosed(metadata: unknown, note: string) {
  const meta = (metadata ?? {}) as Record<string, unknown>;

  /*
   * `rollbackable` must be literally false — ABSENT is the pre-fix bug (readers that
   * test `!== false` would treat an unmarked row as rollbackable), and true is the
   * inheritance bug (copied from a source/target row that had its own manifest).
   */
  expect(meta.rollbackable, `${note}: rollbackable must be false, got ${JSON.stringify(meta.rollbackable)}`).toBe(
    false,
  );
  expect(meta.rollbackUnavailableReason, `${note}: reason`).toBe('manifest_pending');
}

describe('READY↔manifest atomicity, crash injected on the REAL transitions', () => {
  const prevStorage = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;
  const prevManagerUrl = process.env.WORKSPACE_MANAGER_URL;
  const prevRollbackFlag = process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
  const realFetch = globalThis.fetch;

  let storageDir: string;
  let buildOutputDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'rb-transition-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret-test';
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';
    delete process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;

    // Real bytes for the static build to snapshot, so the digest is computable.
    buildOutputDir = join(storageDir, 'build-output');
    await mkdir(buildOutputDir, { recursive: true });
    await writeFile(join(buildOutputDir, 'index.html'), '<!doctype html><body>v1</body>', 'utf8');
  });

  afterEach(async () => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    };

    restore('STATIC_DEPLOY_STORAGE_DIR', prevStorage);
    restore('INTERNAL_API_SHARED_SECRET', prevSecret);
    restore('WORKSPACE_MANAGER_URL', prevManagerUrl);
    restore('SERVER_DEPLOY_ROLLBACK_FROM_DIGEST', prevRollbackFlag);

    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    await rm(storageDir, { recursive: true, force: true }).catch(() => undefined);
  });

  async function setup(options: ApiAppOptions = {}) {
    const store = new CrashAfterCommitStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store, ...options });

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'transition-crash@example.com',
        password: 'password123',
        name: 'Transition',
        organizationName: 'Transition Org',
      },
    });
    expect(register.statusCode).toBe(201);

    const auth = register.json() as { token: string; organization: { id: string }; user: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Transition Project' },
    });

    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { app, store, auth, projectId };
  }

  const getDeployment = (app: Awaited<ReturnType<typeof setup>>['app'], token: string, pid: string, id: string) =>
    app.inject({ method: 'GET', url: `/projects/${pid}/deployments/${id}`, headers: { authorization: `Bearer ${token}` } });

  /* ======================================================================
   * (1) The REAL static publish BUILDING→READY, inside runDeploymentBuildFlow
   *     — the shared build drive used by both the synchronous deploy POST and
   *     the production worker path (POST /internal/deployments/build).
   * ====================================================================== */
  describe('static publish BUILDING→READY (runDeploymentBuildFlow)', () => {
    const staticBuildOk = (outputDir: string) =>
      vi.fn(async () => ({ ok: true as const, outputDir, logs: [] }));

    const driveBuild = (app: any, projectId: string, deploymentId: string, userId: string) =>
      app.inject({
        method: 'POST',
        url: '/internal/deployments/build',
        headers: { authorization: 'Bearer internal-secret-test' },
        payload: {
          projectId,
          deploymentId,
          userId,
          buildInput: { provider: 'static', buildCommand: 'npm run build', outputDirectory: 'dist' },
        },
      });

    it('crash right after the READY commit leaves the row FAIL-CLOSED with no manifest', async () => {
      const { app, store, auth, projectId } = await setup({ staticBuildRunner: staticBuildOk(buildOutputDir) });

      const queued = await store.createDeployment({ projectId, provider: 'static', status: 'QUEUED' });

      // Die at the instant the READY row commits — before writeReleaseManifest runs.
      store.crashOn = crashOnReady;
      await driveBuild(app, projectId, queued.id, auth.user.id).catch(() => undefined);
      expect(store.crashes, 'the injected crash must actually have fired').toBe(1);

      // Whatever the REAL handler persisted is what we inspect — nothing fabricated.
      const persisted = await store.getDeployment(projectId, queued.id);
      expect(persisted!.status).toBe('READY');
      expectFailClosed(persisted!.metadata, 'crashed static publish');

      // The crash beat the manifest write, so a rollback to this release fails closed.
      expect(await store.listReleaseManifests(projectId, 'preview')).toHaveLength(0);

      await app.close();
    });

    it('reconciler repairs the crashed row DURABLY on the next read', async () => {
      const { app, store, auth, projectId } = await setup({ staticBuildRunner: staticBuildOk(buildOutputDir) });

      const queued = await store.createDeployment({ projectId, provider: 'static', status: 'QUEUED' });
      store.crashOn = crashOnReady;
      await driveBuild(app, projectId, queued.id, auth.user.id).catch(() => undefined);

      // Process restarts: writes land again, client reads the deployment.
      store.restart();
      const res = await getDeployment(app, auth.token, projectId, queued.id);
      expect(res.statusCode).toBe(200);

      const meta = (res.json() as { deployment: { metadata: Record<string, unknown> } }).deployment.metadata;
      expect(meta.rollbackable).toBe(true);
      expect(meta.rollbackUnavailableReason).toBeUndefined();

      // Durable, not just in the response — and backed by a real manifest.
      const persisted = await store.getDeployment(projectId, queued.id);
      expect((persisted!.metadata as Record<string, unknown>).rollbackable).toBe(true);

      const manifests = await store.listReleaseManifests(projectId, 'preview');
      expect(manifests.filter((m) => m.deploymentId === queued.id)).toHaveLength(1);

      await app.close();
    });

    it('without a crash the flag is true ONLY alongside a durable manifest', async () => {
      const { app, store, auth, projectId } = await setup({ staticBuildRunner: staticBuildOk(buildOutputDir) });

      const queued = await store.createDeployment({ projectId, provider: 'static', status: 'QUEUED' });
      const res = await driveBuild(app, projectId, queued.id, auth.user.id);
      expect(res.statusCode).toBe(200);

      const persisted = await store.getDeployment(projectId, queued.id);
      expect(persisted!.status).toBe('READY');
      expect((persisted!.metadata as Record<string, unknown>).rollbackable).toBe(true);
      expect(await store.listReleaseManifests(projectId, 'preview')).toHaveLength(1);

      await app.close();
    });
  });

  /* ======================================================================
   * (2) The REAL asynchronous server promotion inside reconcileDeploymentStatus
   *     (services/api/src/app.ts — the site named in the refusal). A cold-node
   *     pod that goes Ready after the create-time poll timed out is promoted
   *     BUILDING→READY on the deployment read path.
   * ====================================================================== */
  describe('server BUILDING→READY (reconcileDeploymentStatus, on read)', () => {
    /** Manager reports the pod converged: readyReplicas >= 1 drives the promotion. */
    function stubManagerReady() {
      globalThis.fetch = vi.fn(async (url: unknown) => {
        const href = typeof url === 'string' ? url : String(url);

        if (href.includes('/status')) {
          return new Response(JSON.stringify({ exists: true, readyReplicas: 1, replicas: 1 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch;
    }

    /** A converging server deploy: manifests applied, pod not Ready at create time. */
    const buildingServerRow = (store: TestApiStore, projectId: string) =>
      store.createDeployment({
        projectId,
        provider: 'server',
        environment: 'preview',
        status: 'BUILDING',
        metadata: {
          serverDeploy: {
            host: 'd-conv.preview.e-code.ai',
            applied: true,
            ready: false,
            image: { imageRef: IMAGE_REF, imageDigest: DIGEST },
          },
        },
      });

    it('crash right after the promotion commit leaves the row FAIL-CLOSED', async () => {
      const { app, store, auth, projectId } = await setup();
      stubManagerReady();

      const building = await buildingServerRow(store, projectId);

      store.crashOn = crashOnReady;
      await getDeployment(app, auth.token, projectId, building.id).catch(() => undefined);
      expect(store.crashes, 'the promotion must actually have been reached').toBe(1);

      /*
       * The read route wraps reconcile in .catch(), so the HTTP response is not the
       * evidence — the PERSISTED row is. Pre-fix this row came back READY with
       * `rollbackable` absent entirely and no manifest: a rollback source that no
       * surface could tell was unbacked.
       */
      const persisted = await store.getDeployment(projectId, building.id);
      expect(persisted!.status).toBe('READY');
      expectFailClosed(persisted!.metadata, 'crashed server promotion');
      expect(await store.listReleaseManifests(projectId, 'preview')).toHaveLength(0);

      await app.close();
    });

    it('with no crash the promotion is completed by the reconciler (manifest, then true)', async () => {
      const { app, store, auth, projectId } = await setup();
      stubManagerReady();

      const building = await buildingServerRow(store, projectId);
      const res = await getDeployment(app, auth.token, projectId, building.id);
      expect(res.statusCode).toBe(200);

      const persisted = await store.getDeployment(projectId, building.id);
      expect(persisted!.status).toBe('READY');
      expect((persisted!.metadata as Record<string, unknown>).rollbackable).toBe(true);

      const manifests = await store.listReleaseManifests(projectId, 'preview');
      expect(manifests.filter((m) => m.deploymentId === building.id)).toHaveLength(1);
      expect(manifests[0].artifactDigest).toBe(DIGEST);

      await app.close();
    });
  });

  /* ======================================================================
   * (3) "create immediately READY" — promote-to-production. This row is CREATED
   *     at READY and copies the source's metadata wholesale, so before the fix it
   *     INHERITED the source's rollbackable:true with no production manifest of
   *     its own. That one is fail-open with no crash required at all.
   * ====================================================================== */
  describe('promote-to-production create-READY', () => {
    /** A source preview release that IS legitimately rollbackable (own manifest). */
    async function rollbackableSource(store: TestApiStore, projectId: string) {
      const source = await store.createDeployment({
        projectId,
        provider: 'server',
        environment: 'preview',
        status: 'READY',
        url: 'https://d-src.preview.e-code.ai',
        metadata: {
          // The flag the promoted row must NOT simply inherit.
          rollbackable: true,
          serverDeploy: {
            host: 'd-src.preview.e-code.ai',
            ready: true,
            applied: true,
            image: { imageRef: IMAGE_REF, imageDigest: DIGEST },
          },
        },
      });

      await store.createReleaseManifest({
        projectId,
        deploymentId: source.id,
        environment: 'preview',
        version: 1,
        provider: 'server',
        artifactKind: 'server-image',
        artifactRef: IMAGE_REF,
        artifactDigest: DIGEST,
      });

      return source;
    }

    const publish = (app: any, token: string, pid: string, id: string) =>
      app.inject({
        method: 'POST',
        url: `/projects/${pid}/deployments/${id}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

    it('crash right after the create commit leaves the production row FAIL-CLOSED', async () => {
      const { app, store, auth, projectId } = await setup();
      const source = await rollbackableSource(store, projectId);

      store.crashOn = crashOnReady;
      await publish(app, auth.token, projectId, source.id).catch(() => undefined);
      expect(store.crashes, 'the production create must actually have been reached').toBe(1);

      const promoted = (await store.listDeployments(projectId)).find((d) => d.environment === 'production');
      expect(promoted, 'the production row was created').toBeDefined();
      expect(promoted!.status).toBe('READY');

      // Pre-fix this asserted true — copied straight off the source row.
      expectFailClosed(promoted!.metadata, 'promoted production row');
      expect(await store.listReleaseManifests(projectId, 'production')).toHaveLength(0);

      await app.close();
    });

    it('without a crash the production row gets its OWN production manifest', async () => {
      const { app, store, auth, projectId } = await setup();
      const source = await rollbackableSource(store, projectId);

      const res = await publish(app, auth.token, projectId, source.id);
      expect(res.statusCode).toBe(201);

      const promoted = (await store.listDeployments(projectId)).find((d) => d.environment === 'production');
      expect((promoted!.metadata as Record<string, unknown>).rollbackable).toBe(true);

      // The true is BACKED: a manifest for this row exists in the production stream.
      const production = await store.listReleaseManifests(projectId, 'production');
      expect(production.filter((m) => m.deploymentId === promoted!.id)).toHaveLength(1);

      await app.close();
    });
  });

  /* ======================================================================
   * (4) The REAL server rollback. Its order was (1) row→READY, (2) manifest —
   *     precisely the window the lot claimed to have closed, left open here.
   * ====================================================================== */
  describe('server rollback-to-previous READY', () => {
    function stubManagerStart() {
      globalThis.fetch = vi.fn(async (url: unknown, init?: { body?: string }) => {
        const href = typeof url === 'string' ? url : String(url);

        if (href.includes('/server-deployments/start')) {
          const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};

          return new Response(
            JSON.stringify({ ready: true, url: `https://${String(body.host)}`, name: 'app', readyReplicas: 1 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch;
    }

    /*
     * The rollback asserts the N-1 config digest still matches the CURRENT project
     * secrets (reserve #4). No secrets are set on this project, so both sides are the
     * digest of the EMPTY set — computed with the production function, never hardcoded.
     */
    const emptyConfigDigest = configDigest({});

    /** v1 (the rollback destination) + v2 (current) as durable manifests. */
    async function twoServerReleases(store: TestApiStore, projectId: string) {
      const mk = async (version: number, host: string) => {
        const row = await store.createDeployment({
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
          deploymentId: row.id,
          environment: 'preview',
          version,
          provider: 'server',
          artifactKind: 'server-image',
          artifactRef: IMAGE_REF,
          artifactDigest: DIGEST,
          configDigest: emptyConfigDigest,
        });

        return row;
      };

      return { v1: await mk(1, 'd-v1.preview.e-code.ai'), v2: await mk(2, 'd-v2.preview.e-code.ai') };
    }

    it('crash right after the rollback READY commit leaves the row FAIL-CLOSED', async () => {
      const { app, store, auth, projectId } = await setup();
      stubManagerStart();
      const { v1 } = await twoServerReleases(store, projectId);

      store.crashOn = crashOnReady;
      const res = await app
        .inject({
          method: 'POST',
          url: `/projects/${projectId}/deployments/rollback-to-previous?environment=preview`,
          headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': `crash-${projectId}` },
        })
        .catch(() => undefined);

      expect(store.crashes, `the rollback READY flip must have been reached (res=${res?.statusCode})`).toBe(1);

      const rollbackRow = (await store.listDeployments(projectId)).find((d) => d.rolledBackFromId === v1.id);
      expect(rollbackRow, 'the rollback row exists').toBeDefined();
      expect(rollbackRow!.status).toBe('READY');
      expectFailClosed(rollbackRow!.metadata, 'crashed server rollback');

      /*
       * The manifest IS present (three now), because the concurrency fix moved the append
       * BEFORE the READY flip on this path: the compare-and-set has to run while the row is
       * still QUEUED, since the monotonic status guard forbids READY→FAILED and a row
       * already promoted could not be walked back when the head turns out to have moved.
       *
       * That ordering is strictly stronger for crash-atomicity than the publish path's
       * seal-then-reflect: the durable manifest precedes READY, so the crash window here is
       * "manifest written, flag not yet flipped" — the case reconcileRollbackManifest repairs
       * without writing a second manifest. The row stays fail-closed until it does.
       */
      const manifests = await store.listReleaseManifests(projectId, 'preview');
      expect(manifests).toHaveLength(3);
      expect(manifests.find((m) => m.deploymentId === rollbackRow!.id)).toBeDefined();

      await app.close();
    });

    it('without a crash the rollback records its manifest BEFORE claiming rollbackable', async () => {
      const { app, store, auth, projectId } = await setup();
      stubManagerStart();
      const { v1 } = await twoServerReleases(store, projectId);

      const res = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/rollback-to-previous?environment=preview`,
          headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': `success-${projectId}` },
      });
      expect(res.statusCode).toBe(201);

      const rollbackRow = (await store.listDeployments(projectId)).find((d) => d.rolledBackFromId === v1.id);
      expect((rollbackRow!.metadata as Record<string, unknown>).rollbackable).toBe(true);

      const manifests = await store.listReleaseManifests(projectId, 'preview');
      expect(manifests.filter((m) => m.deploymentId === rollbackRow!.id)).toHaveLength(1);

      await app.close();
    });
  });

  /* ======================================================================
   * (5) The OTHER create-immediately-READY: rollback-to-a-specific-deployment
   *     for a static target. No crash needed — the row was born READY carrying
   *     the TARGET's rollbackable:true, with no snapshot or manifest of its own.
   * ====================================================================== */
  it('rollback-to-deployment never inherits the target rollbackable:true', async () => {
    const { app, store, auth, projectId } = await setup();

    const target = await store.createDeployment({
      projectId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://example.test/target',
      metadata: { rollbackable: true },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${target.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(res.statusCode).toBe(201);

    const created = (res.json() as { deployment: { id: string; status: string } }).deployment;
    expect(created.status).toBe('READY');

    const persisted = await store.getDeployment(projectId, created.id);
    expectFailClosed(persisted!.metadata, 'rollback-to-deployment copy row');

    // It owns no snapshot and no manifest, so nothing may present it as rollbackable.
    expect(await store.listReleaseManifests(projectId, 'preview')).toHaveLength(0);

    await app.close();
  });
});
