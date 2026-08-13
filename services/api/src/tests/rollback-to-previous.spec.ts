import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { computeStaticSnapshotDigest, staticDeploymentSnapshotDir } from '../deployments.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * P0-V3-08 — DETERMINISTIC static rollback-to-previous (endpoint wiring).
 *
 * Proves the real POST /projects/:id/deployments/rollback-to-previous restores the
 * PREVIOUS release's exact bytes (verified against the manifest digest) into a new
 * READY deployment, and FAILS CLOSED when there is no previous release or the
 * retained artifact no longer matches its manifest.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe('static rollback-to-previous (deterministic, fail-closed)', () => {
  const prev = process.env.STATIC_DEPLOY_STORAGE_DIR;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'rbtp-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
  });

  afterEach(async () => {
    if (prev === undefined) {
      delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    } else {
      process.env.STATIC_DEPLOY_STORAGE_DIR = prev;
    }
    await rm(storageDir, { recursive: true, force: true });
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'rbtp@example.com',
        password: 'password123',
        name: 'RB',
        organizationName: 'RB Org',
      },
    });
    const auth = register.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'RB Project' },
    });
    const projectId = (project.json() as { project: { id: string } }).project.id;
    return { app, store, auth, projectId };
  }

  /** Materialise a static deployment: a READY row, its on-disk snapshot, and its manifest. */
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
    await writeFile(join(dir, 'index.html'), `<!doctype html><body><h1>${marker}</h1></body>`, 'utf8');

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
      configDigest: 'sha256:' + '0'.repeat(64),
    });

    return { deployment, artifactDigest };
  }

  it('restores the previous version bytes into a new READY deployment', async () => {
    const { app, store, auth, projectId } = await setup();
    const v1 = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'accept-language': 'fr-FR, en;q=0.8' },
      payload: { environment: 'preview' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      deployment: { id: string; status: string; logs: Array<{ message: string }> };
      restoredFromVersion: number;
      verifiedArtifactDigest: string;
    };
    expect(res.headers['content-language']).toBe('fr');
    expect(body.restoredFromVersion).toBe(1);
    expect(body.verifiedArtifactDigest).toBe(v1.artifactDigest);
    expect(body.deployment.status).toBe('READY');
    expect(body.deployment.logs.at(-1)?.message).toContain('Retour effectué vers la version v1');

    // The rollback deployment serves v1's bytes.
    const restoredHtml = await readFile(join(staticDeploymentSnapshotDir(body.deployment.id), 'index.html'), 'utf8');
    expect(restoredHtml).toContain('VERSION ONE');
    expect(restoredHtml).not.toContain('VERSION TWO');

    // A new manifest (v3) was appended for the rollback release.
    const releases = await store.listReleaseManifests(projectId, 'preview');
    expect(releases[0].version).toBe(3);
    expect(releases[0].deploymentId).toBe(body.deployment.id);
  });

  it('fails closed (409) when there is no previous version', async () => {
    const { app, store, auth, projectId } = await setup();
    await publishStatic(store, projectId, 1, 'ONLY ONE');

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'accept-language': 'fr' },
      payload: { environment: 'preview' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.headers['content-language']).toBe('fr');
    expect(res.json()).toMatchObject({
      code: 'ROLLBACK_NO_PREVIOUS_MANIFEST',
      error: 'Une seule version existe ; aucune version précédente n’est disponible pour le retour arrière.',
    });
  });

  it('fails closed (409) when the previous artifact no longer matches its manifest', async () => {
    const { app, store, auth, projectId } = await setup();
    const v1 = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    // Tamper v1's retained snapshot AFTER its manifest digest was recorded.
    await writeFile(join(staticDeploymentSnapshotDir(v1.deployment.id), 'index.html'), '<body>TAMPERED</body>', 'utf8');

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { environment: 'preview' },
    });

    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('ROLLBACK_ARTIFACT_DIGEST_MISMATCH');
  });

  it('fails closed (409) when the previous snapshot bytes are gone', async () => {
    const { app, store, auth, projectId } = await setup();
    const v1 = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    await rm(staticDeploymentSnapshotDir(v1.deployment.id), { recursive: true, force: true });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { environment: 'preview' },
    });

    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('ROLLBACK_SNAPSHOT_SOURCE_MISSING');
  });

  it('lists the release history newest-first via GET /projects/:id/releases', async () => {
    const { app, store, auth, projectId } = await setup();
    await publishStatic(store, projectId, 1, 'V1');
    await publishStatic(store, projectId, 2, 'V2');

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/releases?environment=preview`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { releases: Array<{ version: number }> };
    expect(body.releases.map((r) => r.version)).toEqual([2, 1]);
  });
});

/*
 * SEC-12 — a rollback must not silently UNPROTECT a password-protected release.
 *
 * The static rollback builds its new deployment's metadata from a fresh literal
 * (rollbackToPrevious, restoredFromVersion, …) and `metadata.access` has exactly
 * one writer in the service — the /access route. So the rollback deployment is
 * created with NO access config, i.e. PUBLIC, even when the release being rolled
 * back was password-protected.
 *
 * The serve gate reads the access config of the deployment actually being served,
 * so after a rollback the content is world-open while the owner still believes a
 * password is set. Same family as the phantom-protection defect: the product's
 * claim and the enforced reality diverge — here in the dangerous direction.
 */
describe('SEC-12 rollback preserves password protection', () => {
  const prev = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const prevActivation = process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'rbsec12-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
    process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '1';
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = prev;
    if (prevActivation === undefined) delete process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED;
    else process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = prevActivation;
    await rm(storageDir, { recursive: true, force: true });
  });

  it('the rolled-back deployment stays gated (401), it does not become public', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'sec12@example.com', password: 'password123', name: 'S', organizationName: 'S Org' },
    });
    const auth = register.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'S Project' },
    });
    const projectId = (project.json() as { project: { id: string } }).project.id;

    const publish = async (version: number, marker: string) => {
      const deployment = await store.createDeployment({
        projectId,
        provider: 'static',
        environment: 'preview',
        status: 'READY',
        url: 'https://example.test/x',
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
        configDigest: 'sha256:' + '0'.repeat(64),
      });

      return deployment;
    };

    await publish(1, 'SECRET CONTENT V1');
    const v2 = await publish(2, 'SECRET CONTENT V2');

    // The CURRENT release is password-protected.
    const set = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${v2.id}/access`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { mode: 'password', password: 'letmein' },
    });
    expect(set.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/static-deployments/${v2.id}/` })).statusCode).toBe(401);

    // Roll back.
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { environment: 'preview' },
    });
    expect(res.statusCode).toBe(201);

    const rolled = (res.json() as { deployment: { id: string } }).deployment;

    // THE POINT: the deployment now being served must still be gated.
    const anon = await app.inject({ method: 'GET', url: `/static-deployments/${rolled.id}/` });
    expect(anon.statusCode).toBe(401);
    expect(anon.body).not.toContain('SECRET CONTENT');

    // And the original password still unlocks it — the hash was carried, not reset.
    const gate = await app.inject({
      method: 'POST',
      url: `/static-deployments/${rolled.id}/__access`,
      payload: { password: 'letmein' },
    });
    expect(gate.statusCode).toBe(200);
  });
});

/*
 * SEC-12b — the OTHER rollback route, checked and found safe for a DIFFERENT reason.
 *
 * `POST /projects/:p/deployments/:d/rollback` is the generic per-provider path.
 * It spreads the TARGET deployment's metadata, so it carries whatever the OLD
 * release had — the wrong source in principle, since protection is a property of
 * the site as the owner last set it, not of the version being restored.
 *
 * The hypothesis was therefore that rolling back to a target predating the
 * password would unprotect the site, exactly like SEC-12. Executing it showed
 * otherwise: this route never calls `restoreStaticSnapshotInto`, so a static
 * rollback through it produces a row with NO snapshot on disk, and the serve
 * route 404s on the missing artifact before any access check. It serves nothing
 * at all — unusable, not unprotected.
 *
 * The property worth pinning is thus the honest one: this path must never serve
 * protected bytes. Asserting 401 specifically would encode a behaviour that does
 * not exist and would break the day static bytes are restored here; asserting
 * "never 200 with content" stays true either way, and would catch it if that
 * changed without the gate following.
 */
describe('SEC-12b generic rollback preserves password protection', () => {
  const prev = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const prevActivation = process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'rbsec12b-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
    process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '1';
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = prev;
    if (prevActivation === undefined) delete process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED;
    else process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = prevActivation;
    await rm(storageDir, { recursive: true, force: true });
  });

  it('never serves protected bytes (today: 404, no snapshot restored by this path)', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'sec12b@example.com', password: 'password123', name: 'S', organizationName: 'S Org' },
    });
    const auth = register.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'S Project' },
    });
    const projectId = (project.json() as { project: { id: string } }).project.id;

    const publish = async (marker: string) => {
      const d = await store.createDeployment({
        projectId,
        provider: 'static',
        environment: 'preview',
        status: 'READY',
        url: 'https://example.test/x',
      });
      const dir = staticDeploymentSnapshotDir(d.id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'index.html'), `<!doctype html><body>${marker}</body>`, 'utf8');

      return d;
    };

    // Old target: never protected. Current: protected by the owner.
    const oldTarget = await publish('SECRET CONTENT OLD');
    const current = await publish('SECRET CONTENT NEW');

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/projects/${projectId}/deployments/${current.id}/access`,
          headers: { authorization: `Bearer ${auth.token}` },
          payload: { mode: 'password', password: 'letmein' },
        })
      ).statusCode,
    ).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${oldTarget.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {},
    });
    expect([200, 201]).toContain(res.statusCode);

    const rolled = (res.json() as { deployment: { id: string } }).deployment;
    const anon = await app.inject({ method: 'GET', url: `/static-deployments/${rolled.id}/` });

    // Today: 404 (no snapshot restored by this path). If bytes ever start being
    // restored here, this must become 401 — never a 200 carrying the content.
    expect(anon.statusCode).not.toBe(200);
    expect(anon.body).not.toContain('SECRET CONTENT');
    expect([401, 404]).toContain(anon.statusCode);
  });
});
