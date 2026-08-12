import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { staticDeploymentSnapshotDir } from '../deployments.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Expert atomicity reserve (READY ↔ manifest).
 *
 * The publish/redeploy path now writes rollbackable:false ('manifest_pending') INTO
 * the same update that flips a static/server row READY, so a crash between READY and
 * the durable manifest write can never leave a READY row silently presented as
 * rollbackable. These tests inject exactly that crash STATE (a READY row left at
 * 'manifest_pending' with no manifest) and prove:
 *   - the crashed row is fail-closed (rollbackable:false, not a blind rollback);
 *   - reconcileRollbackManifest (run on the deployment read path) DURABLY repairs it:
 *       * snapshot present  → writes the manifest + flips rollbackable:true;
 *       * snapshot missing  → leaves a TERMINAL rollbackable:false reason (never true);
 *   - the repair is idempotent (no duplicate manifest, rollbackable:true untouched).
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe('rollback READY↔manifest crash atomicity', () => {
  const prev = process.env.STATIC_DEPLOY_STORAGE_DIR;

  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'rbcrash-'));
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
      payload: { email: 'crash@example.com', password: 'password123', name: 'C', organizationName: 'Crash Org' },
    });

    const auth = register.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Crash Project' },
    });

    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { app, store, token: auth.token, projectId };
  }

  /**
   * Materialise the exact CRASH STATE: a READY static row whose READY write carried
   * rollbackable:false / 'manifest_pending', with (optionally) its snapshot on disk,
   * but NO manifest row yet (the process "died" before writeReleaseManifest).
   */
  async function crashedReadyStatic(store: TestApiStore, projectId: string, withSnapshot: boolean) {
    const deployment = await store.createDeployment({
      projectId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://example.test/x',
      metadata: { rollbackable: false, rollbackUnavailableReason: 'manifest_pending' },
    });

    if (withSnapshot) {
      const dir = staticDeploymentSnapshotDir(deployment.id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'index.html'), '<!doctype html><body>CRASH RECOVERED</body>', 'utf8');
    }

    return deployment;
  }

  const getDeployment = (app: Awaited<ReturnType<typeof setup>>['app'], token: string, projectId: string, id: string) =>
    app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });

  it('crash BEFORE manifest leaves the row fail-closed (rollbackable:false, manifest_pending)', async () => {
    const { store, projectId } = await setup();
    const dep = await crashedReadyStatic(store, projectId, true);

    // The persisted row (as left by the atomic READY write) is NOT rollbackable.
    const persisted = await store.getDeployment(projectId, dep.id);
    expect((persisted!.metadata as Record<string, unknown>).rollbackable).toBe(false);
    expect((persisted!.metadata as Record<string, unknown>).rollbackUnavailableReason).toBe('manifest_pending');

    // No manifest exists → a rollback would fail closed.
    expect(await store.listReleaseManifests(projectId, 'preview')).toHaveLength(0);
  });

  it('reconciler (on read) DURABLY repairs a crashed row when the snapshot is present', async () => {
    const { app, store, token, projectId } = await setup();
    const dep = await crashedReadyStatic(store, projectId, true);

    const res = await getDeployment(app, token, projectId, dep.id);
    expect(res.statusCode).toBe(200);

    const body = res.json() as { deployment: { metadata: Record<string, unknown> } };

    // Flag flipped true, pending reason cleared — in the RESPONSE and DURABLY in the store.
    expect(body.deployment.metadata.rollbackable).toBe(true);
    expect(body.deployment.metadata.rollbackUnavailableReason).toBeUndefined();

    const persisted = await store.getDeployment(projectId, dep.id);
    expect((persisted!.metadata as Record<string, unknown>).rollbackable).toBe(true);

    // A manifest was durably recorded for this deployment.
    const manifests = await store.listReleaseManifests(projectId, 'preview');
    expect(manifests.some((m) => m.deploymentId === dep.id)).toBe(true);
    expect(manifests).toHaveLength(1);
  });

  it('reconciler leaves a TERMINAL rollbackable:false (never a blind true) when the snapshot is gone', async () => {
    const { app, store, token, projectId } = await setup();
    const dep = await crashedReadyStatic(store, projectId, false); // no snapshot on disk

    const res = await getDeployment(app, token, projectId, dep.id);
    const body = res.json() as { deployment: { metadata: Record<string, unknown> } };

    expect(body.deployment.metadata.rollbackable).toBe(false);

    // The transient marker is replaced by a durable terminal reason (not 'manifest_pending').
    expect(body.deployment.metadata.rollbackUnavailableReason).toBe('no_static_snapshot');

    const persisted = await store.getDeployment(projectId, dep.id);
    expect((persisted!.metadata as Record<string, unknown>).rollbackable).toBe(false);

    // Still no manifest → rollback stays fail-closed.
    expect(await store.listReleaseManifests(projectId, 'preview')).toHaveLength(0);
  });

  it('repair is idempotent: a second read does not create a duplicate manifest', async () => {
    const { app, store, token, projectId } = await setup();
    const dep = await crashedReadyStatic(store, projectId, true);

    await getDeployment(app, token, projectId, dep.id);
    await getDeployment(app, token, projectId, dep.id);

    const manifests = await store.listReleaseManifests(projectId, 'preview');
    expect(manifests.filter((m) => m.deploymentId === dep.id)).toHaveLength(1);
  });

  it('an existing manifest but a stuck flag (crash AFTER write) is repaired without a new manifest', async () => {
    const { app, store, token, projectId } = await setup();
    const dep = await crashedReadyStatic(store, projectId, true);

    // Simulate: manifest was durably written, but the process died before the flag flip.
    await store.createReleaseManifest({
      projectId,
      deploymentId: dep.id,
      environment: 'preview',
      version: 1,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-deployments/${dep.id}`,
      artifactDigest: 'sha256:' + 'a'.repeat(64),
    });

    const res = await getDeployment(app, token, projectId, dep.id);
    const body = res.json() as { deployment: { metadata: Record<string, unknown> } };
    expect(body.deployment.metadata.rollbackable).toBe(true);

    // No SECOND manifest was appended (idempotent repair off the existing row).
    const manifests = await store.listReleaseManifests(projectId, 'preview');
    expect(manifests.filter((m) => m.deploymentId === dep.id)).toHaveLength(1);
  });
});
