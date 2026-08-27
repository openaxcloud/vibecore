import { describe, expect, it } from 'vitest';

import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';
import { TestApiStore } from './test-api-store.js';

const FINGERPRINT = 'a'.repeat(64);
const PROJECT_MANIFEST_DIGEST = `sha256:${'b'.repeat(64)}`;
const ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`;
const ACTOR_USER_ID = 'rollback-actor';

describe('durable rollback operation — lease, fencing, and frozen target', () => {
  it('serializes one key, rejects a changed fingerprint, and replays the persisted response', async () => {
    const store = new TestApiStore();

    const first = await store.acquireRollbackOperation({
      projectId: 'project-a',
      actorUserId: ACTOR_USER_ID,
      idempotencyKey: 'same-key',
      requestFingerprint: FINGERPRINT,
      environment: 'preview',
      ownerToken: 'owner-a',
      leaseDurationMs: 30_000,
    });
    expect(first.kind).toBe('ACQUIRED');

    await expect(
      store.acquireRollbackOperation({
        projectId: 'project-a',
        actorUserId: ACTOR_USER_ID,
        idempotencyKey: 'same-key',
        requestFingerprint: FINGERPRINT,
        environment: 'preview',
        ownerToken: 'owner-b',
        leaseDurationMs: 30_000,
      }),
    ).resolves.toMatchObject({ kind: 'BUSY', record: { id: first.record.id, fencingToken: 1 } });

    await expect(
      store.acquireRollbackOperation({
        projectId: 'project-a',
        actorUserId: ACTOR_USER_ID,
        idempotencyKey: 'same-key',
        requestFingerprint: 'd'.repeat(64),
        environment: 'production',
        ownerToken: 'owner-b',
        leaseDurationMs: 30_000,
      }),
    ).resolves.toMatchObject({ kind: 'FINGERPRINT_CONFLICT' });

    const body = { code: 'ROLLBACK_NO_PREVIOUS_MANIFEST' };
    await store.completeRollbackOperation({
      operationId: first.record.id,
      ownerToken: 'owner-a',
      fencingToken: 1,
      responseStatus: 409,
      responseContentLanguage: 'en',
      responseBody: body,
    });
    await expect(
      store.acquireRollbackOperation({
        projectId: 'project-a',
        actorUserId: ACTOR_USER_ID,
        idempotencyKey: 'same-key',
        requestFingerprint: FINGERPRINT,
        environment: 'preview',
        ownerToken: 'owner-c',
        leaseDurationMs: 30_000,
      }),
    ).resolves.toMatchObject({
      kind: 'REPLAY',
      record: { responseStatus: 409, responseContentLanguage: 'en', responseBody: body },
    });
  });

  it('increments the fence on orphan recovery and permanently rejects the expired owner', async () => {
    const store = new TestApiStore();

    const first = await store.acquireRollbackOperation({
      projectId: 'project-fence',
      actorUserId: ACTOR_USER_ID,
      idempotencyKey: 'fenced-key',
      requestFingerprint: FINGERPRINT,
      environment: 'preview',
      ownerToken: 'owner-old',
      leaseDurationMs: 30_000,
    });
    store.rollbackOperations.set('project-fence:fenced-key', {
      ...first.record,
      leaseExpiresAt: new Date(Date.now() - 1).toISOString(),
    });

    const recovered = await store.acquireRollbackOperation({
      projectId: 'project-fence',
      actorUserId: ACTOR_USER_ID,
      idempotencyKey: 'fenced-key',
      requestFingerprint: FINGERPRINT,
      environment: 'preview',
      ownerToken: 'owner-new',
      leaseDurationMs: 30_000,
    });
    expect(recovered).toMatchObject({ kind: 'ACQUIRED', record: { fencingToken: 2, leaseOwner: 'owner-new' } });
    await expect(
      store.renewRollbackOperationLease({
        operationId: first.record.id,
        ownerToken: 'owner-old',
        fencingToken: 1,
        leaseDurationMs: 30_000,
      }),
    ).rejects.toThrow('ROLLBACK_OWNERSHIP_LOST');
    await expect(
      store.validateRollbackOperationLease({
        operationId: first.record.id,
        ownerToken: 'owner-old',
        fencingToken: 1,
      }),
    ).resolves.toBe(false);
  });

  it('fails closed instead of resuming a historical actorless lease', async () => {
    const store = new TestApiStore();
    const acquired = await store.acquireRollbackOperation({
      projectId: 'project-legacy-actorless',
      actorUserId: ACTOR_USER_ID,
      idempotencyKey: 'legacy-actorless-key',
      requestFingerprint: FINGERPRINT,
      environment: 'preview',
      ownerToken: 'legacy-owner',
      leaseDurationMs: 30_000,
    });
    store.rollbackOperations.set('project-legacy-actorless:legacy-actorless-key', {
      ...acquired.record,
      actorUserId: undefined,
    });

    await expect(
      store.renewRollbackOperationLease({
        operationId: acquired.record.id,
        ownerToken: 'legacy-owner',
        fencingToken: 1,
        leaseDurationMs: 30_000,
      }),
    ).rejects.toMatchObject({ code: 'ROLLBACK_OWNERSHIP_LOST' });
    await expect(
      store.validateRollbackOperationLease({
        operationId: acquired.record.id,
        ownerToken: 'legacy-owner',
        fencingToken: 1,
      }),
    ).resolves.toBe(false);
    await expect(
      store.acquireRollbackOperation({
        projectId: 'project-legacy-actorless',
        actorUserId: ACTOR_USER_ID,
        idempotencyKey: 'legacy-actorless-key',
        requestFingerprint: FINGERPRINT,
        environment: 'preview',
        ownerToken: 'new-owner',
        leaseDurationMs: 30_000,
      }),
    ).resolves.toMatchObject({ kind: 'FINGERPRINT_CONFLICT' });
  });

  it('atomically fails a pre-effect deployment before persisting an error response', async () => {
    const store = new TestApiStore();
    const sourceDeployment = await store.createDeployment({
      projectId: 'project-pre-effect',
      provider: 'static',
      environment: 'preview',
      status: 'READY',
    });
    const currentDeployment = await store.createDeployment({
      projectId: 'project-pre-effect',
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      accessPolicyVersion: sourceDeployment.accessPolicyVersion,
    });

    const source = await store.createReleaseManifest({
      projectId: 'project-pre-effect',
      deploymentId: sourceDeployment.id,
      environment: 'preview',
      version: 1,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-deployments/${sourceDeployment.id}`,
      artifactDigest: ARTIFACT_DIGEST,
      accessPolicyVersion: sourceDeployment.accessPolicyVersion,
    });
    await store.createReleaseManifest({
      projectId: 'project-pre-effect',
      deploymentId: currentDeployment.id,
      environment: 'preview',
      version: 2,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-deployments/${currentDeployment.id}`,
      artifactDigest: `sha256:${'d'.repeat(64)}`,
      accessPolicyVersion: currentDeployment.accessPolicyVersion,
    });

    const acquired = await store.acquireRollbackOperation({
      projectId: 'project-pre-effect',
      actorUserId: ACTOR_USER_ID,
      idempotencyKey: 'pre-effect-key',
      requestFingerprint: FINGERPRINT,
      environment: 'preview',
      ownerToken: 'owner-pre-effect',
      leaseDurationMs: 30_000,
    });
    const operation = await store.bindRollbackOperationTarget({
      operationId: acquired.record.id,
      ownerToken: 'owner-pre-effect',
      fencingToken: 1,
      deploymentId: 'deployment-pre-effect',
      expectedHeadVersion: 2,
      previousManifestId: source.id,
      projectManifestDigest: PROJECT_MANIFEST_DIGEST,
    });
    await store.ensureRollbackDeployment({
      fence: { operationId: operation.id, ownerToken: 'owner-pre-effect', fencingToken: 1 },
      deployment: {
        id: 'deployment-pre-effect',
        projectId: 'project-pre-effect',
        provider: 'static',
        environment: 'preview',
        status: 'QUEUED',
        accessPolicyVersion: source.accessPolicyVersion,
        rolledBackFromId: source.deploymentId,
        metadata: {
          rollbackOperationId: operation.id,
          projectManifestDigest: PROJECT_MANIFEST_DIGEST,
          restoredFromVersion: 1,
          restoredFromDeploymentId: source.deploymentId,
          supersededVersion: 2,
        },
      },
    });

    await store.completeRollbackOperation({
      operationId: operation.id,
      ownerToken: 'owner-pre-effect',
      fencingToken: 1,
      responseStatus: 409,
      responseContentLanguage: 'fr',
      responseBody: { code: 'ROLLBACK_SNAPSHOT_SOURCE_MISSING' },
    });

    expect((await store.getDeployment('project-pre-effect', 'deployment-pre-effect'))?.status).toBe('FAILED');
    await expect(
      store.acquireRollbackOperation({
        projectId: 'project-pre-effect',
        actorUserId: ACTOR_USER_ID,
        idempotencyKey: 'pre-effect-key',
        requestFingerprint: FINGERPRINT,
        environment: 'preview',
        ownerToken: 'owner-replay',
        leaseDurationMs: 30_000,
      }),
    ).resolves.toMatchObject({ kind: 'REPLAY', record: { responseStatus: 409 } });
  });

  it('freezes the source/head and refuses corrupt bytes or a terminal deployment', async () => {
    const store = new TestApiStore();
    const owner = await store.createUser({ email: 'rollback-fence@example.test', passwordHash: 'test-hash' });
    const organization = await store.createOrganization({
      name: 'Rollback Fence',
      slug: 'rollback-fence',
      ownerUserId: owner.id,
    });
    const project = await store.createProject({
      organizationId: organization.id,
      name: 'Rollback Fence',
      slug: 'rollback-fence',
    });
    const sourceDeployment = await store.createDeployment({
      projectId: project.id,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
    });
    const currentDeployment = await store.createDeployment({
      projectId: project.id,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      accessPolicyVersion: sourceDeployment.accessPolicyVersion,
    });

    const source = await store.createReleaseManifest({
      projectId: project.id,
      deploymentId: sourceDeployment.id,
      environment: 'preview',
      version: 1,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-deployments/${sourceDeployment.id}`,
      artifactDigest: ARTIFACT_DIGEST,
      configDigest: `sha256:${'e'.repeat(64)}`,
      accessPolicyVersion: sourceDeployment.accessPolicyVersion,
    });
    await store.createReleaseManifest({
      projectId: project.id,
      deploymentId: currentDeployment.id,
      environment: 'preview',
      version: 2,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-deployments/${currentDeployment.id}`,
      artifactDigest: `sha256:${'f'.repeat(64)}`,
      accessPolicyVersion: currentDeployment.accessPolicyVersion,
    });

    const acquired = await store.acquireRollbackOperation({
      projectId: project.id,
      actorUserId: owner.id,
      idempotencyKey: 'target-key',
      requestFingerprint: FINGERPRINT,
      environment: 'preview',
      ownerToken: 'owner-target',
      leaseDurationMs: 30_000,
    });
    const operation = await store.bindRollbackOperationTarget({
      operationId: acquired.record.id,
      ownerToken: 'owner-target',
      fencingToken: 1,
      deploymentId: 'deployment-rollback',
      expectedHeadVersion: 2,
      previousManifestId: source.id,
      projectManifestDigest: (await store.getLatestProjectManifest(project.id))!.digest,
    });
    const metadata = {
      rollbackToPrevious: true,
      rollbackOperationId: operation.id,
      projectManifestDigest: operation.projectManifestDigest,
      restoredFromVersion: 1,
      restoredFromDeploymentId: source.deploymentId,
      supersededVersion: 2,
    };
    await store.ensureRollbackDeployment({
      fence: { operationId: operation.id, ownerToken: 'owner-target', fencingToken: 1 },
      deployment: {
        id: 'deployment-rollback',
        projectId: project.id,
        provider: 'static',
        environment: 'preview',
        status: 'QUEUED',
        accessPolicyVersion: source.accessPolicyVersion,
        rolledBackFromId: source.deploymentId,
        metadata,
      },
    });
    await store.beginRollbackEffect({
      operationId: operation.id,
      ownerToken: 'owner-target',
      fencingToken: 1,
    });
    await expect(
      store.completeRollbackOperation({
        operationId: operation.id,
        ownerToken: 'owner-target',
        fencingToken: 1,
        responseStatus: 500,
        responseContentLanguage: 'en',
        responseBody: { code: 'ROLLBACK_RESTORE_FAILED' },
      }),
    ).rejects.toThrow('ROLLBACK_CLEANUP_UNCONFIRMED');

    const release = await acquireTestProjectReleaseFence(store, {
      projectId: project.id,
      organizationId: organization.id,
    });

    const commit = (artifactDigest = ARTIFACT_DIGEST) =>
      store.commitStaticRollbackRelease({
        operationId: operation.id,
        ownerToken: 'owner-target',
        fencingToken: 1,
        expectedHeadVersion: 2,
        projectId: project.id,
        deploymentId: 'deployment-rollback',
        environment: 'preview',
        provider: 'static',
        artifactRef: 'static-deployments/deployment-rollback',
        artifactDigest,
        configDigest: `sha256:${'e'.repeat(64)}`,
        accessPolicyVersion: source.accessPolicyVersion,
        url: 'https://rollback.example.test',
        metadata,
        logs: [],
        finishedAt: new Date().toISOString(),
        releaseFence: release.releaseFence,
      });

    await expect(commit(`sha256:${'0'.repeat(64)}`)).rejects.toThrow('STATIC_ROLLBACK_RELEASE_CONFLICT');
    expect(store.releaseManifests).toHaveLength(2);
    await store.updateRollbackDeployment({
      fence: { operationId: operation.id, ownerToken: 'owner-target', fencingToken: 1 },
      projectId: project.id,
      deploymentId: 'deployment-rollback',
      patch: { status: 'FAILED' },
    });
    await expect(commit()).rejects.toThrow('STATIC_ROLLBACK_RELEASE_CONFLICT');
    expect(store.releaseManifests).toHaveLength(2);
    expect((await store.getDeployment(project.id, 'deployment-rollback'))?.status).toBe('FAILED');
  });
});
