import { BUILTIN_RATE_CARD } from '@vibecore/billing';
import { encryptJson } from '@vibecore/security';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { ExactMigrationLedgerInspection } from '../db-migration-applier.js';
import { rollbackManifestDigest, type ServerRollbackDatabasePin } from '../deterministic-rollback.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';
import {
  DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS,
  deterministicServerReleaseFixture,
} from './deterministic-release-fixture.js';

/*
 * Audit v4 rollback vertical — the WIRING (not just the pure module).
 *
 * Proves that the real POST /projects/:id/deployments/:id/rollback endpoint, for
 * a provider='server' target, re-deploys the RETAINED image BY DIGEST via the
 * workspace manager (I-REL-1) — independent of whether the current revision
 * still exists — and REFUSES loudly (never a dead-URL row) when no digest was
 * retained or the declared secret policy can't be honoured.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const IMAGE_REF = 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/p-proj';
const DIGEST = 'sha256:' + 'b'.repeat(64);

describe('server rollback re-deploys the retained image by digest (wiring)', () => {
  const prevManagerUrl = process.env.WORKSPACE_MANAGER_URL;
  const prevFlag = process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';

    /*
     * D2: the digest path is the DEFAULT — these tests run with the env var
     * UNSET on purpose, proving a helm upgrade that drops the flag cannot
     * silently revive the URL-copy path. The explicit '0' kill switch has its
     * own test below.
     */
    delete process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
  });

  afterEach(() => {
    if (prevManagerUrl === undefined) {
      delete process.env.WORKSPACE_MANAGER_URL;
    } else {
      process.env.WORKSPACE_MANAGER_URL = prevManagerUrl;
    }

    if (prevFlag === undefined) {
      delete process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
    } else {
      process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST = prevFlag;
    }

    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  /** Capture every manager /server-deployments/start body; report the app ready. */
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

  async function setup(options: ApiAppOptions = {}) {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store, ...options });

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'rollback-digest@example.com',
        password: 'password123',
        name: 'Rollback Digest',
        organizationName: 'Rollback Digest Org',
      },
    });
    expect(register.statusCode).toBe(201);

    const auth = register.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Rollback Digest Project' },
    });

    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { app, store, auth, projectId };
  }

  /** A READY server release with a retained image digest (the v1 to roll back to). */
  async function createRetainedRelease(
    store: TestApiStore,
    projectId: string,
    over: {
      image?: unknown;
      secretPolicy?: string;
      database?: ServerRollbackDatabasePin;
      envOverrides?: Record<string, string>;
    } = {},
  ) {
    const project = await store.getProject(projectId);
    const manifest = await store.getLatestProjectManifest(projectId);

    if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');

    const image = 'image' in over ? over.image : { imageRef: IMAGE_REF, imageDigest: DIGEST };

    if (!image || typeof image !== 'object' || typeof (image as { imageDigest?: unknown }).imageDigest !== 'string') {
      return store.createDeployment({
        projectId,
        expectedOrganizationId: project!.organizationId,
        provider: 'server',
        environment: 'preview',
        status: 'READY',
        url: 'https://d-v1.preview.e-code.ai',
        metadata: {
          planEntitlements: DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS,
          projectManifestDigest: manifest.digest,
          serverDeploy: { image },
        },
      });
    }

    const release = await acquireTestProjectReleaseFence(store, {
      projectId,
      organizationId: project!.organizationId,
      operationId: `fixture:retained:${Math.random()}`,
    });
    const pins = deterministicServerReleaseFixture({
      organizationId: project!.organizationId,
      projectId,
      projectManifestDigest: manifest.digest,
      accessPolicyVersion: 1,
      artifactRef: IMAGE_REF,
      artifactDigest: DIGEST,
      promotionId: 'promo-retained-release',
      port: 4_321,
      healthPath: '/readyz',
      envOverrides: over.envOverrides ?? { FEATURE_PIN: 'retained' },
      ...(over.database ? { database: over.database } : {}),
    });
    const deployment = await store.createDeployment({
      projectId,
      expectedOrganizationId: project!.organizationId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      machineSize: 'shared-0.5',
      url: 'https://d-v1.preview.e-code.ai',
      metadata: {
        planEntitlements: pins.planEntitlements,
        projectManifestDigest: manifest.digest,
        serverDeploy: {
          host: 'd-v1.preview.e-code.ai',
          ready: true,
          applied: true,
          image,
          promotion: pins.promotion,
          rollbackRuntimeSpec: pins.runtimeSpec,
        },
      },
    });
    await store.commitServerImageRelease({
      projectId,
      organizationId: project!.organizationId,
      deploymentId: deployment.id,
      environment: 'preview',
      artifactRef: IMAGE_REF,
      artifactDigest: DIGEST,
      ...(over.database?.mode === 'exact-ledger' ? { dbMigrationPoint: over.database.ledgerDigest } : {}),
      runtimeSpec: pins.runtimeSpec,
      promotionEvidence: pins.promotionEvidence,
      url: 'https://d-v1.preview.e-code.ai',
      previewUrl: 'https://d-v1.preview.e-code.ai',
      metadata: deployment.metadata as Record<string, unknown>,
      logs: [],
      finishedAt: '2026-08-26T00:00:02.000Z',
      releaseFence: release.releaseFence,
    });
    await release.release();

    if (over.secretPolicy === 'PINNED') {
      const retainedManifest = (await store.listReleaseManifests(projectId, 'preview'))[0]!;
      const { hash: _hash, ...body } = retainedManifest.runtimeSpec as Record<string, unknown>;
      retainedManifest.runtimeSpec = {
        ...body,
        secretPolicy: 'PINNED',
        hash: rollbackManifestDigest({ ...body, secretPolicy: 'PINNED' }),
      };
    }

    return (await store.getDeployment(projectId, deployment.id))!;
  }

  async function setupLedgerRollback(inspection: ExactMigrationLedgerInspection) {
    const context = await setup({ migrationLedgerInspector: async () => inspection });
    await context.store.upsertProjectSecret({
      projectId: context.projectId,
      expectedOrganizationId: context.auth.organization.id,
      key: 'DATABASE_URL',
      valueEncrypted: encryptJson({ value: 'postgres://user:pw@rollback-db.test:5432/app' }),
    });
    const ledgerDigest = `sha256:${'e'.repeat(64)}`;
    await createRetainedRelease(context.store, context.projectId, {
      database: { mode: 'exact-ledger', ledgerDigest },
    });
    await createRetainedRelease(context.store, context.projectId);

    return { ...context, ledgerDigest, captured: stubManagerStart() };
  }

  it('re-deploys the target by digest (revision-independent, I-REL-1)', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();
    const v1 = await createRetainedRelease(store, projectId);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${v1.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(201);

    // The manager was actually asked to run the immutable pull-by-digest ref.
    const start = captured.starts.find((s) => String(s.image).includes('@sha256:'));
    expect(start).toBeDefined();
    expect(start!.image).toBe(`${IMAGE_REF}@${DIGEST}`);

    const row = res.json().deployment;
    expect(row.status).toBe('READY');
    expect((row.metadata.serverDeploy as Record<string, unknown>).rolledBackFromDigest).toBe(DIGEST);

    await app.close();
  });

  it('rolls back from the immutable manifest + audit proof after the prior Deployment was pruned', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();

    const commitRelease = async (imageDigest: string, promotionId: string) => {
      const project = await store.getProject(projectId);
      const release = await acquireTestProjectReleaseFence(store, {
        projectId,
        organizationId: project!.organizationId,
        operationId: `fixture:${promotionId}`,
      });

      const pins = deterministicServerReleaseFixture({
        organizationId: project!.organizationId,
        projectId,
        projectManifestDigest: release.digest,
        accessPolicyVersion: 1,
        artifactRef: IMAGE_REF,
        artifactDigest: imageDigest,
        promotionId,
        port: 4_321,
        healthPath: '/readyz',
        envOverrides: { FEATURE_PIN: promotionId },
      });
      const deployment = await store.createDeployment({
        projectId,
        expectedOrganizationId: project!.organizationId,
        provider: 'server',
        environment: 'preview',
        status: 'BUILDING',
        machineSize: 'shared-0.5',
        metadata: {
          planEntitlements: pins.planEntitlements,
          projectManifestDigest: release.digest,
          serverDeploy: {
            image: { imageRef: IMAGE_REF, imageDigest },
            promotion: pins.promotion,
            rollbackRuntimeSpec: pins.runtimeSpec,
          },
        },
      });
      await store.commitServerImageRelease({
        projectId,
        organizationId: project!.organizationId,
        deploymentId: deployment.id,
        environment: 'preview',
        artifactRef: IMAGE_REF,
        artifactDigest: imageDigest,
        runtimeSpec: pins.runtimeSpec,
        promotionEvidence: pins.promotionEvidence,
        url: `https://${deployment.id}.preview.e-code.ai`,
        previewUrl: `https://${deployment.id}.preview.e-code.ai`,
        metadata: deployment.metadata as Record<string, unknown>,
        logs: [],
        finishedAt: '2026-08-26T00:00:02.000Z',
        releaseFence: release.releaseFence,
      });
      await release.release();

      return deployment;
    };

    const previous = await commitRelease(DIGEST, 'promo-pruned-v1');
    await commitRelease(`sha256:${'c'.repeat(64)}`, 'promo-current-v2');
    store.deployments.delete(previous.id);
    store.adminAuditLogs.splice(0);

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'server-pruned-release' },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ restoredFromVersion: 1, verifiedArtifactDigest: DIGEST });
    expect(response.json().deployment.status).toBe('READY');
    expect(captured.starts.at(-1)?.image).toBe(`${IMAGE_REF}@${DIGEST}`);
    expect(captured.starts.at(-1)).toMatchObject({
      port: 4_321,
      healthPath: '/readyz',
      cpuRequest: '500m',
      memoryRequest: '2048Mi',
      env: expect.objectContaining({ FEATURE_PIN: 'promo-pruned-v1', PORT: '4321' }),
    });
    expect((await store.listReleaseManifests(projectId, 'preview'))[0]?.version).toBe(3);

    /*
     * Durable replay is bound to the completed operation, never to the moving
     * N-1 head. Make the release that would now be selected as N-1 impossible
     * to roll back, then prove the original response is replayed without a new
     * manager effect, operation, or Deployment.
     */
    const movingPrevious = (await store.listReleaseManifests(projectId, 'preview')).find(
      (manifest) => manifest.version === 2,
    )!;
    const { hash: _movingHash, ...movingRuntimeBody } = movingPrevious.runtimeSpec as Record<string, unknown>;
    movingPrevious.runtimeSpec = {
      ...movingRuntimeBody,
      secretPolicy: 'PINNED',
      hash: rollbackManifestDigest({ ...movingRuntimeBody, secretPolicy: 'PINNED' }),
    };
    store.deployments.delete(response.json().deployment.id as string);
    const deploymentCount = store.deployments.size;
    const operationCount = store.rollbackOperations.size;
    const managerStartCount = captured.starts.length;

    const replay = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'server-pruned-release' },
      payload: { environment: 'preview' },
    });

    expect(replay.statusCode).toBe(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.json()).toEqual(response.json());
    expect(captured.starts).toHaveLength(managerStartCount);
    expect(store.rollbackOperations.size).toBe(operationCount);
    expect(store.deployments.size).toBe(deploymentCount);

    await app.close();
  });

  it('refuses a strictly pinned Reserved release after decommission mutation and after source pruning', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();
    const project = await store.getProject(projectId);
    const projectManifest = await store.getLatestProjectManifest(projectId);
    const release = await acquireTestProjectReleaseFence(store, {
      projectId,
      organizationId: project!.organizationId,
      operationId: 'fixture:reserved-runtime-class',
    });
    const reservedDraft = await store.createDeployment({
      projectId,
      expectedOrganizationId: project!.organizationId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      machineSize: 'shared-0.5',
      metadata: {
        planEntitlements: DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS,
        projectManifestDigest: projectManifest!.digest,
      },
    });
    const reserved = await store.updateDeployment(projectId, reservedDraft.id, {
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'shared-0.5',
      persistentStorageClaim: 'reserved-runtime-class-pvc',
    });
    const pins = deterministicServerReleaseFixture({
      organizationId: project!.organizationId,
      projectId,
      projectManifestDigest: projectManifest!.digest,
      accessPolicyVersion: reserved.accessPolicyVersion,
      artifactRef: IMAGE_REF,
      artifactDigest: DIGEST,
      promotionId: 'promo-reserved-runtime-class',
      runtimeIdentity: {
        runtimeClass: 'reserved-vm',
        reservedVm: {
          deploymentId: reserved.id,
          tier: 'shared-0.5',
          persistentStorageClaim: 'reserved-runtime-class-pvc',
        },
      },
    });
    const staged = await store.updateDeployment(projectId, reserved.id, {
      metadata: {
        ...(reserved.metadata as Record<string, unknown>),
        serverDeploy: {
          image: { imageRef: IMAGE_REF, imageDigest: DIGEST },
          promotion: pins.promotion,
          rollbackRuntimeSpec: pins.runtimeSpec,
        },
      },
    });
    await store.commitServerImageRelease({
      projectId,
      organizationId: project!.organizationId,
      deploymentId: reserved.id,
      environment: 'preview',
      artifactRef: IMAGE_REF,
      artifactDigest: DIGEST,
      runtimeSpec: pins.runtimeSpec,
      promotionEvidence: pins.promotionEvidence,
      url: 'https://reserved-runtime-class.preview.test',
      previewUrl: 'https://reserved-runtime-class.preview.test',
      metadata: staged.metadata as Record<string, unknown>,
      logs: [],
      finishedAt: '2026-08-28T00:00:00.000Z',
      releaseFence: release.releaseFence,
    });
    await release.release();
    await createRetainedRelease(store, projectId);

    const committedReserved = (await store.getDeployment(projectId, reserved.id))!;
    store.deployments.set(reserved.id, {
      ...committedReserved,
      runtimeKind: 'autoscale',
      reservedVmTier: undefined,
      persistentStorageClaim: undefined,
    });
    const before = store.deployments.size;
    const mutated = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'reserved-pinned-mutated' },
      payload: { environment: 'preview' },
    });
    expect(mutated.statusCode).toBe(409);
    expect(mutated.json()).toMatchObject({ code: 'RESERVED_VM_ROLLBACK_UNPINNED' });

    store.deployments.delete(reserved.id);
    const pruned = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'reserved-pinned-pruned' },
      payload: { environment: 'preview' },
    });
    expect(pruned.statusCode).toBe(409);
    expect(pruned.json()).toMatchObject({ code: 'RESERVED_VM_ROLLBACK_UNPINNED' });
    expect(store.rollbackOperations.size).toBe(0);
    expect(store.deployments.size).toBe(before - 1);
    expect(captured.starts).toHaveLength(0);
    await app.close();
  });

  it.each([
    {
      label: 'missing historical card',
      mutate: (store: TestApiStore) => {
        const previous = store.releaseManifests.find((manifest) => manifest.version === 1)!;
        const { hash: _hash, ...runtimeBody } = previous.runtimeSpec as Record<string, unknown>;
        const machine = runtimeBody.machine as Record<string, unknown>;
        const changedBody = { ...runtimeBody, machine: { ...machine, rateCardVersion: 99_999 } };
        previous.runtimeSpec = { ...changedBody, hash: rollbackManifestDigest(changedBody) };
      },
    },
    {
      label: 'malformed historical card',
      mutate: (store: TestApiStore) => {
        vi.spyOn(store, 'getRateCard').mockResolvedValue({
          version: BUILTIN_RATE_CARD.version,
          data: { version: BUILTIN_RATE_CARD.version, machineSizes: 'malformed' },
        });
      },
    },
    {
      label: 'drifted historical machine tuple',
      mutate: (store: TestApiStore) => {
        vi.spyOn(store, 'getRateCard').mockResolvedValue({
          version: BUILTIN_RATE_CARD.version,
          data: {
            ...BUILTIN_RATE_CARD,
            machineSizes: BUILTIN_RATE_CARD.machineSizes.map((machine) =>
              machine.key === 'shared-0.5' ? { ...machine, cpuMillicores: machine.cpuMillicores + 1 } : machine,
            ),
          },
        });
      },
    },
  ])('rejects a $label before rollback authority, deployment creation, or manager I/O', async ({ label, mutate }) => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();
    await createRetainedRelease(store, projectId);
    await createRetainedRelease(store, projectId);
    mutate(store);
    const deploymentCount = store.deployments.size;

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${auth.token}`,
        'idempotency-key': `historical-card-${label.replaceAll(' ', '-')}`,
      },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'ROLLBACK_RUNTIME_SPEC_MACHINE_INVALID' });
    expect(captured.starts).toHaveLength(0);
    expect(store.rollbackOperations.size).toBe(0);
    expect(store.deployments.size).toBe(deploymentCount);
    await app.close();
  });

  it('REFUSES (409) a legacy target without a deterministic manifest — never a dead-URL row', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();

    // v1 shipped BEFORE digests were retained: image present but no imageDigest.
    const v1 = await createRetainedRelease(store, projectId, { image: { imageRef: IMAGE_REF } });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${v1.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('ROLLBACK_RUNTIME_SPEC_MISSING');

    // It must NOT have re-deployed anything.
    expect(captured.starts.some((s) => String(s.image).includes('@sha256:'))).toBe(false);

    await app.close();
  });

  it('REFUSES (409) a PINNED secret policy with no retained snapshot — never fakes it', async () => {
    const { app, store, auth, projectId } = await setup();
    stubManagerStart();

    const v1 = await createRetainedRelease(store, projectId, { secretPolicy: 'PINNED' });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${v1.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('ROLLBACK_SECRET_POLICY_UNSATISFIABLE');

    await app.close();
  });

  it('rejects PINNED before acquiring rollback authority, creating a row, or calling the manager', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();
    await createRetainedRelease(store, projectId, { secretPolicy: 'PINNED' });
    await createRetainedRelease(store, projectId);
    const deploymentCount = store.deployments.size;

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${auth.token}`,
        'idempotency-key': 'pinned-before-authority',
      },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('ROLLBACK_SECRET_POLICY_UNSATISFIABLE');
    expect(captured.starts).toEqual([]);
    expect(store.rollbackOperations.size).toBe(0);
    expect(store.deployments.size).toBe(deploymentCount);

    await app.close();
  });

  it.each([
    [
      'missing',
      (store: TestApiStore) => {
        store.deploymentAccessPolicies.splice(0);
      },
    ],
    [
      'invalid',
      (store: TestApiStore) => {
        const policy = store.deploymentAccessPolicies[0];
        if (policy) policy.revision = '';
      },
    ],
    [
      'legacy version',
      (store: TestApiStore) => {
        const previous = [...store.releaseManifests].sort((left, right) => left.version - right.version)[0];
        if (previous) previous.accessPolicyVersion = 0;
      },
    ],
  ])('rejects a %s retained access policy before rollback authority or effects', async (_label, mutate) => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();
    await createRetainedRelease(store, projectId);
    await createRetainedRelease(store, projectId);
    mutate(store);
    const deploymentCount = store.deployments.size;

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${auth.token}`,
        'idempotency-key': `policy-${_label.replaceAll(' ', '-')}`,
      },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('RELEASE_ACCESS_POLICY_INVALID');
    expect(captured.starts).toEqual([]);
    expect(store.rollbackOperations.size).toBe(0);
    expect(store.deployments.size).toBe(deploymentCount);

    await app.close();
  });

  it('starts rollback only when the complete database ledger equals the retained digest', async () => {
    const ledgerDigest = `sha256:${'e'.repeat(64)}`;
    const { app, store, auth, projectId, captured } = await setupLedgerRollback({
      status: 'EXACT',
      digest: ledgerDigest,
      entries: 2,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': 'db-ledger-equal' },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(201);
    expect(captured.starts).toHaveLength(1);
    const copied = (await store.listReleaseManifests(projectId, 'preview'))[0]!;
    expect(copied.dbMigrationPoint).toBe(ledgerDigest);
    expect((copied.runtimeSpec as { database: unknown }).database).toEqual({ mode: 'exact-ledger', ledgerDigest });

    await app.close();
  });

  it('pins and leases the historical DATABASE_URL override that the manager receives', async () => {
    const ledgerDigest = `sha256:${'e'.repeat(64)}`;
    const inspectedConnections: string[] = [];
    const context = await setup({
      migrationLedgerInspector: async ({ connectionString }) => {
        inspectedConnections.push(connectionString);
        return { status: 'EXACT', digest: ledgerDigest, entries: 2 };
      },
    });
    const baseDatabaseUrl = 'postgres://user:pw@base-db.test:5432/app';
    const overrideDatabaseUrl = 'postgres://user:pw@override-db.test:5432/app';
    await context.store.upsertProjectSecret({
      projectId: context.projectId,
      expectedOrganizationId: context.auth.organization.id,
      key: 'DATABASE_URL',
      valueEncrypted: encryptJson({ value: baseDatabaseUrl }),
    });
    await createRetainedRelease(context.store, context.projectId, {
      database: { mode: 'exact-ledger', ledgerDigest },
      envOverrides: { DATABASE_URL: overrideDatabaseUrl, FEATURE_PIN: 'historical' },
    });
    await createRetainedRelease(context.store, context.projectId, {
      database: { mode: 'exact-ledger', ledgerDigest },
      envOverrides: { DATABASE_URL: overrideDatabaseUrl, FEATURE_PIN: 'current' },
    });
    const captured = stubManagerStart();

    const response = await context.app.inject({
      method: 'POST',
      url: `/projects/${context.projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${context.auth.token}`,
        'idempotency-key': 'db-effective-override',
      },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(201);
    expect(inspectedConnections.length).toBeGreaterThanOrEqual(3);
    expect(new Set(inspectedConnections)).toEqual(new Set([overrideDatabaseUrl]));
    expect(captured.starts).toHaveLength(1);
    expect((captured.starts[0]?.env as Record<string, string>).DATABASE_URL).toBe(overrideDatabaseUrl);
    expect((captured.starts[0]?.env as Record<string, string>).DATABASE_URL).not.toBe(baseDatabaseUrl);

    await context.app.close();
  });

  it('does not pin a persisted env row that the server runtime never receives', async () => {
    const inspector = vi.fn(async () => ({
      status: 'EXACT' as const,
      digest: `sha256:${'9'.repeat(64)}`,
      entries: 1,
    }));
    const context = await setup({ migrationLedgerInspector: inspector });
    await context.store.upsertProjectEnvVar({
      projectId: context.projectId,
      expectedOrganizationId: context.auth.organization.id,
      key: 'DATABASE_URL',
      value: 'postgres://user:pw@persisted-only.test:5432/app',
      scope: 'preview',
    });
    await createRetainedRelease(context.store, context.projectId);
    await createRetainedRelease(context.store, context.projectId);
    const captured = stubManagerStart();

    const response = await context.app.inject({
      method: 'POST',
      url: `/projects/${context.projectId}/deployments/rollback-to-previous`,
      headers: {
        authorization: `Bearer ${context.auth.token}`,
        'idempotency-key': 'db-ignore-uninjected-env-row',
      },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(201);
    expect(inspector).not.toHaveBeenCalled();
    expect(captured.starts).toHaveLength(1);
    expect((captured.starts[0]?.env as Record<string, string>).DATABASE_URL).toBeUndefined();

    await context.app.close();
  });

  it.each([
    [
      'mismatched',
      { status: 'EXACT', digest: `sha256:${'f'.repeat(64)}`, entries: 2 } as const,
      'ROLLBACK_DB_LEDGER_MISMATCH',
    ],
    [
      'advanced',
      { status: 'EXACT', digest: `sha256:${'1'.repeat(64)}`, entries: 3 } as const,
      'ROLLBACK_DB_LEDGER_MISMATCH',
    ],
    ['unavailable', { status: 'UNAVAILABLE' } as const, 'ROLLBACK_DB_LEDGER_UNAVAILABLE'],
  ])('refuses a %s database ledger before manager or rollback writes', async (_label, inspection, code) => {
    const { app, store, auth, projectId, captured } = await setupLedgerRollback(inspection);
    const deploymentCount = store.deployments.size;

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/rollback-to-previous`,
      headers: { authorization: `Bearer ${auth.token}`, 'idempotency-key': `db-ledger-${_label}` },
      payload: { environment: 'preview' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe(code);
    expect(captured.starts).toEqual([]);
    expect(store.rollbackOperations.size).toBe(0);
    expect(store.deployments.size).toBe(deploymentCount);

    await app.close();
  });

  it("REFUSES (409) when explicitly disabled ('0') — the kill switch fails CLOSED, never URL-copy", async () => {
    process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST = '0';

    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();
    const v1 = await createRetainedRelease(store, projectId);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${v1.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('SERVER_ROLLBACK_DIGEST_DISABLED');

    // Nothing re-deployed AND no rollback row created (refused before the row).
    expect(captured.starts.length).toBe(0);

    const list = await store.listDeployments(projectId);
    expect(list.filter((d) => d.rolledBackFromId === v1.id).length).toBe(0);

    await app.close();
  });

  it('annotates un-rollback-able server releases with rollbackUnavailableReason (list + detail)', async () => {
    const { app, store, auth, projectId } = await setup();
    stubManagerStart();

    const withDigest = await createRetainedRelease(store, projectId);
    const withoutDigest = await createRetainedRelease(store, projectId, { image: { imageRef: IMAGE_REF } });

    const list = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(list.statusCode).toBe(200);

    const rows = (list.json() as { deployments: Array<Record<string, unknown>> }).deployments;
    const good = rows.find((d) => d.id === withDigest.id);
    const bad = rows.find((d) => d.id === withoutDigest.id);
    expect(good?.rollbackUnavailableReason).toBeUndefined();
    expect(bad?.rollbackUnavailableReason).toBe('NO_RETAINED_DIGEST');

    const detail = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${withoutDigest.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { deployment: Record<string, unknown> }).deployment.rollbackUnavailableReason).toBe(
      'NO_RETAINED_DIGEST',
    );

    await app.close();
  });

  it('leaves external-provider rollback untouched (no digest re-deploy path)', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();
    const manifest = await store.getLatestProjectManifest(projectId);
    if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');

    const v1 = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://static-v1.example.com',
      metadata: {
        planEntitlements: DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS,
        projectManifestDigest: manifest.digest,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${v1.id}/rollback`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(201);

    // No server-deploy manager start for a static rollback.
    expect(captured.starts.length).toBe(0);

    await app.close();
  });
});
