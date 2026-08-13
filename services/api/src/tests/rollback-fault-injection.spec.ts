import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import { computeStaticSnapshotDigest, staticDeploymentSnapshotDir } from '../deployments.js';
import type { EmailProvider } from '../email.js';
import { configDigest } from '../release-manifest.js';
import type { ReleaseManifestRecord } from '../store.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Expert refusal — fault injection (reserves #2, #3, #4, #5).
 *
 * Every case drives the REAL rollback endpoints and injects a concrete fault
 * (corruption after copy / index.html tamper / unreadable secrets / config drift /
 * manifest write failure). Each must FAIL CLOSED — refuse or explicitly flag
 * non-rollbackable — never a blind rollback that serves unverified bytes or
 * empty/guessed config.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const IMAGE_REF = 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/p-fault';
const SERVER_DIGEST = 'sha256:' + 'c'.repeat(64);

/** A TestApiStore whose ReleaseManifest write can be flipped to fail on demand. */
class FaultManifestStore extends TestApiStore {
  failCreateManifest = false;
  failListSecrets = false;

  override async createReleaseManifest(
    input: Parameters<TestApiStore['createReleaseManifest']>[0],
  ): Promise<ReleaseManifestRecord> {
    if (this.failCreateManifest) {
      throw new Error('injected: release manifest store is down');
    }

    return super.createReleaseManifest(input);
  }

  override async listProjectSecrets(projectId: string) {
    if (this.failListSecrets) {
      throw new Error('injected: secret store is unreachable');
    }

    return super.listProjectSecrets(projectId);
  }
}

describe('rollback fault injection (fail-closed integrity)', () => {
  const prevStorage = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const prevManagerUrl = process.env.WORKSPACE_MANAGER_URL;
  const prevFlag = process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
  const realFetch = globalThis.fetch;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'rbfault-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';
    delete process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
  });

  afterEach(async () => {
    if (prevStorage === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = prevStorage;

    if (prevManagerUrl === undefined) delete process.env.WORKSPACE_MANAGER_URL;
    else process.env.WORKSPACE_MANAGER_URL = prevManagerUrl;

    if (prevFlag === undefined) delete process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
    else process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST = prevFlag;

    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    await rm(storageDir, { recursive: true, force: true });
  });

  /** Record every manager /server-deployments/start body; report the app ready. */
  function stubManagerStart(): { starts: Array<Record<string, unknown>> } {
    const starts: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: { body?: string }) => {
      const href = typeof url === 'string' ? url : String(url);
      if (href.includes('/server-deployments/start')) {
        const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        starts.push(body);
        return new Response(
          JSON.stringify({ ready: true, url: `https://${body.host as string}`, name: 'app', readyReplicas: 1 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    return { starts };
  }

  async function setup(store: TestApiStore) {
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'fault@example.com', password: 'password123', name: 'F', organizationName: 'F Org' },
    });
    const auth = register.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Fault Project' },
    });
    const projectId = (project.json() as { project: { id: string } }).project.id;
    return { app, auth, projectId };
  }

  /**
   * Materialise a static release whose retained index.html carries the OLD
   * deployment's base path, so a rollback restore rewrites it — making the
   * destination bytes DIFFER from the source (the reserve #2 scenario).
   */
  async function publishStatic(store: TestApiStore, projectId: string, version: number, marker: string) {
    const deployment = await store.createDeployment({
      projectId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://example.test/placeholder',
    });

    const dir = staticDeploymentSnapshotDir(deployment.id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'index.html'),
      `<!doctype html><html><head>` +
        `<script src="/static-deployments/${deployment.id}/assets/app.js"></script>` +
        `</head><body><h1>${marker}</h1></body></html>`,
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

  /** Materialise a server release manifest (the row a rollback resolves against). */
  async function publishServer(
    store: TestApiStore,
    projectId: string,
    version: number,
    over: { configDigest?: string } = {},
  ) {
    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'READY',
      url: `https://d-v${version}.preview.e-code.ai`,
      metadata: { serverDeploy: { image: { imageRef: IMAGE_REF, imageDigest: SERVER_DIGEST } } },
    });
    await store.createReleaseManifest({
      projectId,
      deploymentId: deployment.id,
      environment: 'preview',
      version,
      provider: 'server',
      artifactKind: 'server-image',
      artifactRef: IMAGE_REF,
      artifactDigest: SERVER_DIGEST,
      ...('configDigest' in over ? { configDigest: over.configDigest } : { configDigest: configDigest({}) }),
    });
    return deployment;
  }

  const rollback = (app: Awaited<ReturnType<typeof setup>>['app'], token: string, projectId: string) =>
    app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': `fault-${projectId}` },
      payload: { environment: 'preview' },
    });

  // ------------------------------------------------------------------ reserve #2/#3

  it('records the DESTINATION-FINAL digest (post index.html rewrite), not the source/manifest digest', async () => {
    const store = new FaultManifestStore();
    const { app, auth, projectId } = await setup(store);
    const v1 = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const res = await rollback(app, auth.token, projectId);
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      deployment: { id: string; status: string };
      restoredArtifactDigest: string;
      rollbackable: boolean;
    };

    // The restored bytes were rewritten to the NEW id's base path → they DIFFER
    // from v1's retained source bytes, so the recorded digest must NOT be v1's.
    const servedDigest = (await computeStaticSnapshotDigest(body.deployment.id))!;
    expect(body.restoredArtifactDigest).toBe(servedDigest);
    expect(body.restoredArtifactDigest).not.toBe(v1.artifactDigest);
    expect(body.rollbackable).toBe(true);

    // And the recorded v3 manifest carries that same destination digest.
    const releases = await store.listReleaseManifests(projectId, 'preview');
    expect(releases[0].version).toBe(3);
    expect(releases[0].artifactDigest).toBe(servedDigest);

    // Sanity: the served HTML points at the new id's base path.
    const html = await readFile(join(staticDeploymentSnapshotDir(body.deployment.id), 'index.html'), 'utf8');
    expect(html).toContain(`/static-deployments/${body.deployment.id}/assets/app.js`);
    expect(html).not.toContain(`/static-deployments/${v1.deployment.id}/`);
  });

  // ------------------------------------------------------------------ reserve #5: index.html tamper

  it('REFUSES (409) when the retained index.html was modified after its digest was recorded', async () => {
    const store = new FaultManifestStore();
    const { app, auth, projectId } = await setup(store);
    const v1 = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    // Fault: tamper ONLY index.html of the retained source, after the manifest.
    await writeFile(
      join(staticDeploymentSnapshotDir(v1.deployment.id), 'index.html'),
      '<!doctype html><body>INJECTED</body>',
      'utf8',
    );

    const res = await rollback(app, auth.token, projectId);
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('ROLLBACK_ARTIFACT_DIGEST_MISMATCH');
  });

  // ------------------------------------------------------------------ reserve #1/#5: manifest write failure

  it('flags the rollback READY_NON_ROLLBACKABLE when its manifest write fails (no silent lie)', async () => {
    const store = new FaultManifestStore();
    const { app, auth, projectId } = await setup(store);
    await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    // Fault: the manifest store fails exactly for the rollback release's append.
    store.failCreateManifest = true;

    const res = await rollback(app, auth.token, projectId);
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      deployment: { id: string; status: string; metadata: Record<string, unknown> };
      rollbackable: boolean;
    };

    // The restored bytes DO serve (they were verified) — but the release is
    // explicitly non-rollbackable, so nothing presents a future blind rollback.
    expect(body.deployment.status).toBe('READY');
    expect(body.rollbackable).toBe(false);
    expect(body.deployment.metadata.rollbackable).toBe(false);
    expect(body.deployment.metadata.rollbackUnavailableReason).toBe('manifest_append_failed');

    // No v3 manifest was recorded, so a follow-up rollback fails closed.
    const releases = await store.listReleaseManifests(projectId, 'preview');
    expect(releases.map((r) => r.version)).toEqual([2, 1]);
  });

  // ------------------------------------------------------------------ reserve #4: secrets unreadable

  it('server rollback REFUSES (409) when current secrets are unreadable — never deploys empty config', async () => {
    const store = new FaultManifestStore();
    const { app, auth, projectId } = await setup(store);
    const captured = stubManagerStart();
    await publishServer(store, projectId, 1);
    await publishServer(store, projectId, 2);

    // Fault: the secret store is unreachable at rollback time.
    store.failListSecrets = true;

    const res = await rollback(app, auth.token, projectId);
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('ROLLBACK_SECRETS_UNREADABLE');
    // Critically, we never reached the manager: no deploy with empty config.
    expect(captured.starts).toHaveLength(0);
  });

  // ------------------------------------------------------------------ reserve #4: config drift

  it('server rollback REFUSES (409) when config drifted since N-1 (configDigest mismatch)', async () => {
    const store = new FaultManifestStore();
    const { app, auth, projectId } = await setup(store);
    const captured = stubManagerStart();
    // N-1 was published with a NON-empty config fingerprint, but the project has
    // no secrets now → current digest is the empty sentinel → drift → refuse.
    await publishServer(store, projectId, 1, { configDigest: configDigest({ API_KEY: 'v1' }) });
    await publishServer(store, projectId, 2, { configDigest: configDigest({ API_KEY: 'v2' }) });

    const res = await rollback(app, auth.token, projectId);
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('ROLLBACK_CONFIG_DIGEST_MISMATCH');
    expect(captured.starts).toHaveLength(0);
  });

  it('server rollback REFUSES (409) when N-1 recorded no config fingerprint', async () => {
    const store = new FaultManifestStore();
    const { app, auth, projectId } = await setup(store);
    const captured = stubManagerStart();
    await publishServer(store, projectId, 1, { configDigest: undefined });
    await publishServer(store, projectId, 2, { configDigest: undefined });

    const res = await rollback(app, auth.token, projectId);
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('ROLLBACK_CONFIG_DIGEST_UNKNOWN');
    expect(captured.starts).toHaveLength(0);
  });

  // ------------------------------------------------------------------ reserve #4: deterministic happy path

  it('server rollback DEPLOYS by digest when the config fingerprint matches N-1 (deterministic)', async () => {
    const store = new FaultManifestStore();
    const { app, auth, projectId } = await setup(store);
    const captured = stubManagerStart();
    // No project secrets → both sides fingerprint the empty sentinel → match.
    await publishServer(store, projectId, 1);
    await publishServer(store, projectId, 2);

    const res = await rollback(app, auth.token, projectId);
    expect(res.statusCode).toBe(201);
    const body = res.json() as { deployment: { status: string }; verifiedArtifactDigest: string };
    expect(body.deployment.status).toBe('READY');
    expect(body.verifiedArtifactDigest).toBe(SERVER_DIGEST);

    // The manager was asked to pull the retained image BY DIGEST (revision-independent).
    expect(captured.starts).toHaveLength(1);
    expect(captured.starts[0].image).toBe(`${IMAGE_REF}@${SERVER_DIGEST}`);
  });
});
