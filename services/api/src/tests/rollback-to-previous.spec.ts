import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import { computeStaticSnapshotDigest, staticDeploymentSnapshotDir } from '../deployments.js';
import type { EmailProvider } from '../email.js';
// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the endpoint spec service-local.
import { canonicalizeProjectManifest, projectManifestDigest } from '../project-manifest.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';
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

  async function setup(store = new TestApiStore()) {
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
    const auth = register.json() as { token: string; user: { id: string }; organization: { id: string } };
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
    const project = await store.getProject(projectId);

    if (!project) throw new Error('TEST_PROJECT_MISSING');

    const deployment = await store.createDeployment({
      projectId,
      expectedOrganizationId: project.organizationId,
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
      accessPolicyVersion: 1,
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
        'idempotency-key': 'static-success-v1',
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

  it('requires an idempotency key before creating any rollback authority or deployment', async () => {
    const { app, store, auth, projectId } = await setup();
    await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(store.rollbackOperations.size).toBe(0);
    expect(
      (await store.listDeployments(projectId)).filter(
        (deployment) => (deployment.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true,
      ),
    ).toHaveLength(0);
  });

  it('refuses unpinned Reserved VM rollback before creating an operation, deployment, or manager effect', async () => {
    const { app, store, auth, projectId } = await setup();
    const created = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider: 'server',
      environment: 'preview',
      status: 'READY',
      machineSize: 'dedicated-1',
      url: 'https://reserved-rollback.example.test',
    });
    const reserved = await store.updateDeployment(projectId, created.id, {
      runtimeKind: 'reserved-vm',
      runtimeVersion: 3,
      reservedVmTier: 'dedicated-1',
      persistentStorageClaim: `reserved-data-${created.id}`,
    });
    for (const version of [1, 2]) {
      await store.createReleaseManifest({
        projectId,
        deploymentId: reserved.id,
        environment: 'preview',
        version,
        provider: 'server',
        artifactKind: 'server-image',
        artifactRef: `registry.example.test/reserved@sha256:${String(version).repeat(64)}`,
        artifactDigest: `sha256:${String(version).repeat(64)}`,
        accessPolicyVersion: reserved.accessPolicyVersion,
      });
    }
    const deploymentCount = (await store.listDeployments(projectId)).length;
    const manager = vi.fn(async () => new Response('unexpected manager call', { status: 500 }));
    globalThis.fetch = manager as typeof fetch;

    const previous = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'reserved-rollback-refused-0001' },
      payload: { environment: 'preview' },
    });
    const direct = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${reserved.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(previous.statusCode).toBe(409);
    expect(previous.json()).toMatchObject({ code: 'RESERVED_VM_ROLLBACK_UNPINNED' });
    expect(direct.statusCode).toBe(409);
    expect(direct.json()).toMatchObject({ code: 'RESERVED_VM_ROLLBACK_UNPINNED' });
    expect(store.rollbackOperations.size).toBe(0);
    expect(await store.listDeployments(projectId)).toHaveLength(deploymentCount);
    expect(manager).not.toHaveBeenCalled();
    await app.close();
  });

  it('replays the exact durable 201 and creates one deployment + one release', async () => {
    const { app, store, auth, projectId } = await setup();
    await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const request = {
      method: 'POST' as const,
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${auth.token}`,
        'idempotency-key': 'static-lost-response',
        'accept-language': 'fr',
      },
      payload: { environment: 'preview' },
    };

    const first = await app.inject(request);

    const replay = await app.inject({
      ...request,
      headers: { ...request.headers, 'accept-language': 'en' },
    });

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.headers['content-language']).toBe('fr');
    expect(replay.json()).toEqual(first.json());
    expect(
      (await store.listDeployments(projectId)).filter(
        (deployment) => (deployment.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true,
      ),
    ).toHaveLength(1);
    expect((await store.listReleaseManifests(projectId, 'preview')).map((manifest) => manifest.version)).toEqual([
      3, 2, 1,
    ]);
  });

  it('recovers a committed release before mutable project-manifest checks', async () => {
    const { app, store, auth, projectId } = await setup();
    const previous = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const projectManifest = await store.getLatestProjectManifest(projectId);
    expect(projectManifest).toBeDefined();
    await store.updateDeployment(projectId, previous.deployment.id, {
      metadata: { projectManifestDigest: projectManifest!.digest },
    });

    const idempotencyKey = 'static-committed-before-response';

    const requestFingerprint = createHash('sha256')
      .update(JSON.stringify({ operation: 'rollback-to-previous', environment: 'preview' }))
      .digest('hex');
    const acquired = await store.acquireRollbackOperation({
      projectId,
      actorUserId: auth.user.id,
      idempotencyKey,
      requestFingerprint,
      environment: 'preview',
      ownerToken: 'committed-owner',
      leaseDurationMs: 60_000,
    });

    const sourceManifest = (await store.listReleaseManifests(projectId, 'preview'))[1];
    const deploymentId = 'committed-static-rollback';

    const operation = await store.bindRollbackOperationTarget({
      operationId: acquired.record.id,
      ownerToken: 'committed-owner',
      fencingToken: 1,
      deploymentId,
      expectedHeadVersion: 2,
      previousManifestId: sourceManifest.id,
      projectManifestDigest: projectManifest!.digest,
    });
    const metadata = {
      rollbackToPrevious: true,
      rollbackOperationId: operation.id,
      projectManifestDigest: projectManifest!.digest,
      restoredFromVersion: 1,
      restoredFromDeploymentId: previous.deployment.id,
      supersededVersion: 2,
      manifestArtifactDigest: previous.artifactDigest,
    };
    await store.ensureRollbackDeployment({
      fence: { operationId: operation.id, ownerToken: 'committed-owner', fencingToken: 1 },
      deployment: {
        id: deploymentId,
        projectId,
        provider: 'static',
        environment: 'preview',
        status: 'QUEUED',
        accessPolicyVersion: sourceManifest.accessPolicyVersion,
        rolledBackFromId: previous.deployment.id,
        metadata,
      },
    });
    await store.beginRollbackEffect({
      operationId: operation.id,
      ownerToken: 'committed-owner',
      fencingToken: 1,
    });
    const project = await store.getProject(projectId);

    if (!project) throw new Error('TEST_PROJECT_MISSING');

    const release = await acquireTestProjectReleaseFence(store, {
      projectId,
      organizationId: project.organizationId,
    });
    await store.commitStaticRollbackRelease({
      operationId: operation.id,
      ownerToken: 'committed-owner',
      fencingToken: 1,
      expectedHeadVersion: 2,
      projectId,
      deploymentId,
      environment: 'preview',
      provider: 'static',
      artifactRef: `static-deployments/${deploymentId}`,
      artifactDigest: previous.artifactDigest,
      ...(sourceManifest.configDigest ? { configDigest: sourceManifest.configDigest } : {}),
      accessPolicyVersion: sourceManifest.accessPolicyVersion,
      url: 'https://rollback.example.test',
      metadata,
      logs: [],
      finishedAt: new Date().toISOString(),
      releaseFence: release.releaseFence,
    });
    await release.release();

    const changedManifest = canonicalizeProjectManifest({
      ...canonicalizeProjectManifest(projectManifest!.manifest),
      manifestVersion: projectManifest!.manifestVersion + 1,
    });
    await store.createProjectManifestRevision({
      projectId,
      expectedOrganizationId: project.organizationId,
      schemaVersion: changedManifest.schemaVersion,
      manifestVersion: changedManifest.manifestVersion,
      digest: projectManifestDigest(changedManifest),
      manifest: changedManifest,
      expectedDigest: projectManifest!.digest,
    });

    const committedOperation = await store.getRollbackOperation(projectId, idempotencyKey);
    store.rollbackOperations.set(`${projectId}:${idempotencyKey}`, {
      ...committedOperation!,
      leaseExpiresAt: new Date(0).toISOString(),
    });

    const recovered = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': idempotencyKey },
      payload: { environment: 'preview' },
    });

    expect(recovered.statusCode).toBe(201);
    expect(recovered.json()).toMatchObject({
      deployment: { id: deploymentId, status: 'READY' },
      restoredFromVersion: 1,
      supersededVersion: 2,
    });
    expect(await store.getRollbackOperation(projectId, idempotencyKey)).toMatchObject({
      status: 'COMPLETED',
      phase: 'RELEASE_COMMITTED',
      fencingToken: 2,
      responseStatus: 201,
    });
  });

  it('collapses concurrent retries with one key and rejects a different fingerprint', async () => {
    const { app, store, auth, projectId } = await setup();
    await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const request = {
      method: 'POST' as const,
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'static-concurrent' },
      payload: { environment: 'preview' },
    };

    const [left, right] = await Promise.all([app.inject(request), app.inject(request)]);
    expect([left.statusCode, right.statusCode]).toEqual([201, 201]);
    expect(left.json().deployment.id).toBe(right.json().deployment.id);
    expect(
      (await store.listDeployments(projectId)).filter(
        (deployment) => (deployment.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true,
      ),
    ).toHaveLength(1);

    const conflict = await app.inject({
      ...request,
      payload: { environment: 'production' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('loses release-head CAS honestly, removes rollback bytes, and never appends a false manifest', async () => {
    class PausingRollbackStore extends TestApiStore {
      readonly deploymentEnsured: Promise<void>;
      private _signalDeploymentEnsured!: () => void;
      private _resume!: () => void;
      private readonly _paused = new Promise<void>((resolve) => {
        this._resume = resolve;
      });

      constructor() {
        super();
        this.deploymentEnsured = new Promise<void>((resolve) => {
          this._signalDeploymentEnsured = resolve;
        });
      }

      release() {
        this._resume();
      }

      override async ensureRollbackDeployment(input: Parameters<TestApiStore['ensureRollbackDeployment']>[0]) {
        const deployment = await super.ensureRollbackDeployment(input);
        this._signalDeploymentEnsured();
        await this._paused;

        return deployment;
      }
    }

    const store = new PausingRollbackStore();
    const { app, auth, projectId } = await setup(store);
    await publishStatic(store, projectId, 1, 'VERSION ONE');

    const current = await publishStatic(store, projectId, 2, 'VERSION TWO');

    const inFlight = app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'static-head-cas' },
      payload: { environment: 'preview' },
    });
    await store.deploymentEnsured;
    await store.createReleaseManifest({
      projectId,
      deploymentId: current.deployment.id,
      environment: 'preview',
      version: 3,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-deployments/${current.deployment.id}`,
      artifactDigest: current.artifactDigest,
      accessPolicyVersion: current.deployment.accessPolicyVersion,
    });
    store.release();

    const response = await inFlight;
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'ROLLBACK_RELEASE_MOVED', expectedVersion: 2, observedVersion: 3 });

    const rollback = (await store.listDeployments(projectId)).find(
      (deployment) => (deployment.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true,
    );
    expect(rollback?.status).toBe('FAILED');
    expect(await computeStaticSnapshotDigest(rollback!.id)).toBeUndefined();
    expect((await store.listReleaseManifests(projectId, 'preview')).map((manifest) => manifest.version)).toEqual([
      3, 2, 1,
    ]);
  });

  it('recovers an expired owner after an external effect, removes orphan bytes, and replays the durable failure', async () => {
    const { app, store, auth, projectId } = await setup();
    const previous = await publishStatic(store, projectId, 1, 'VERSION ONE');
    await publishStatic(store, projectId, 2, 'VERSION TWO');

    const projectManifest = await store.getLatestProjectManifest(projectId);
    expect(projectManifest).toBeDefined();

    const idempotencyKey = 'static-orphaned-effect';

    const requestFingerprint = createHash('sha256')
      .update(JSON.stringify({ operation: 'rollback-to-previous', environment: 'preview' }))
      .digest('hex');
    const acquired = await store.acquireRollbackOperation({
      projectId,
      actorUserId: auth.user.id,
      idempotencyKey,
      requestFingerprint,
      environment: 'preview',
      ownerToken: 'crashed-owner',
      leaseDurationMs: 60_000,
    });
    expect(acquired.kind).toBe('ACQUIRED');

    const deploymentId = 'orphaned-static-rollback';

    const bound = await store.bindRollbackOperationTarget({
      operationId: acquired.record.id,
      ownerToken: 'crashed-owner',
      fencingToken: acquired.record.fencingToken,
      deploymentId,
      expectedHeadVersion: 2,
      previousManifestId: (await store.listReleaseManifests(projectId, 'preview'))[1].id,
      projectManifestDigest: projectManifest!.digest,
    });
    await store.ensureRollbackDeployment({
      fence: {
        operationId: bound.id,
        ownerToken: 'crashed-owner',
        fencingToken: bound.fencingToken,
      },
      deployment: {
        id: deploymentId,
        projectId,
        provider: 'static',
        environment: 'preview',
        status: 'QUEUED',
        accessPolicyVersion: previous.deployment.accessPolicyVersion,
        rolledBackFromId: previous.deployment.id,
        metadata: {
          rollbackToPrevious: true,
          rollbackOperationId: bound.id,
          projectManifestDigest: projectManifest!.digest,
          restoredFromVersion: 1,
          restoredFromDeploymentId: previous.deployment.id,
          supersededVersion: 2,
          manifestArtifactDigest: previous.artifactDigest,
        },
      },
    });

    const effect = await store.beginRollbackEffect({
      operationId: bound.id,
      ownerToken: 'crashed-owner',
      fencingToken: bound.fencingToken,
    });

    const orphanDir = staticDeploymentSnapshotDir(deploymentId);
    await mkdir(orphanDir, { recursive: true });
    await writeFile(join(orphanDir, 'partial.html'), 'PARTIAL ORPHAN', 'utf8');
    store.rollbackOperations.set(`${projectId}:${idempotencyKey}`, {
      ...effect,
      leaseExpiresAt: new Date(0).toISOString(),
    });

    const partialArtifact = await app.inject({
      method: 'GET',
      url: `/static-deployments/${deploymentId}/partial.html`,
    });
    expect(partialArtifact.statusCode).toBe(404);

    const queuedServingState = await app.inject({
      method: 'GET',
      url: `/deployments/${deploymentId}/serving-state`,
    });
    expect(queuedServingState.json()).toEqual({ state: 'not-found' });

    const request = {
      method: 'POST' as const,
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': idempotencyKey },
      payload: { environment: 'preview' },
    };

    const recovered = await app.inject(request);

    expect(recovered.statusCode).toBe(409);
    expect(recovered.json()).toMatchObject({ code: 'ROLLBACK_RECOVERED_FAILED_ATTEMPT' });
    expect(await computeStaticSnapshotDigest(deploymentId)).toBeUndefined();
    expect((await store.getDeployment(projectId, deploymentId))?.status).toBe('FAILED');

    const failedServingState = await app.inject({
      method: 'GET',
      url: `/deployments/${deploymentId}/serving-state`,
    });
    expect(failedServingState.json()).toEqual({ state: 'not-found' });
    expect(await store.getRollbackOperation(projectId, idempotencyKey)).toMatchObject({
      status: 'COMPLETED',
      phase: 'EFFECT_CLEANED',
      fencingToken: 2,
      effectFencingToken: 1,
      responseStatus: 409,
    });

    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(409);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.json()).toEqual(recovered.json());
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
        'idempotency-key': 'static-no-previous',
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
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'static-digest-mismatch' },
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
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'static-source-missing' },
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
