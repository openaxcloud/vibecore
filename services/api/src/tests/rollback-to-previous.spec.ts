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
      headers: {
        authorization: `Bearer ${auth.token}`,
        'accept-language': 'fr-FR, en;q=0.8',
        'idempotency-key': `restore-${projectId}`,
      },
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
      headers: {
        authorization: `Bearer ${auth.token}`,
        'accept-language': 'fr',
        'idempotency-key': `no-previous-${projectId}`,
      },
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
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': `digest-mismatch-${projectId}` },
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
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': `missing-source-${projectId}` },
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
