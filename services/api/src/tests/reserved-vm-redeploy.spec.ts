import { hashPassword } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pipeline = vi.hoisted(() => ({
  createWorkspaceBuildAgent: vi.fn(),
  runAppImageBuild: vi.fn(),
  snapshotWorkspaceImageContext: vi.fn(),
}));

vi.mock('../deploy-workspace-agent.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../deploy-workspace-agent.js')>()),
  createWorkspaceBuildAgent: pipeline.createWorkspaceBuildAgent,
}));

vi.mock('../app-image-build.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../app-image-build.js')>()),
  runAppImageBuild: pipeline.runAppImageBuild,
}));

vi.mock('../server-deploy-transfer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server-deploy-transfer.js')>()),
  snapshotWorkspaceImageContext: pipeline.snapshotWorkspaceImageContext,
}));

import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { PromotionResult } from '../artifact-promotion.js';
import type { DeployBuildJobData } from '../deploy-queue.js';
import type { EmailProvider } from '../email.js';
import type { PromotionManifest } from '../lifecycle-state-machines.js';
import { RESERVED_VM_TERMS_VERSION } from '../reserved-vm.js';
import type { DeploymentRecord } from '../store.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const ENV_KEYS = [
  'INTERNAL_API_SHARED_SECRET',
  'WORKSPACE_MANAGER_URL',
  'WORKSPACE_MANAGER_SHARED_SECRET',
  'WORKSPACE_AGENT_URL_TEMPLATE',
  'SERVER_DEPLOY_SNAPSHOT_IMAGE',
  'SERVER_DEPLOY_IMAGE_REPO',
  'SERVER_DEPLOY_IMAGE',
  'SERVER_DEPLOY_REVISION_ROLLOUT_PERCENT',
  'RESERVED_VM_PAYLOAD_ENCRYPTION_KEY_ID',
  'RESERVED_VM_PAYLOAD_ENCRYPTION_KEY',
  'RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON',
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function promotionManifest(input: {
  promotionId: string;
  organizationId: string;
  sourceRepo: string;
  targetRepo: string;
  digest: string;
}): PromotionManifest {
  return {
    promotionId: input.promotionId,
    sourceRepo: input.sourceRepo,
    sourceDigest: input.digest,
    targetRepo: input.targetRepo,
    targetTenant: input.organizationId,
    retentionTag: `active-promo-${'d'.repeat(32)}`,
    attachments: ['signature', 'sbom', 'provenance'].map((type, index) => ({
      type,
      digest: `sha256:${String(index + 1).repeat(64)}`,
      subjectDigest: input.digest,
      relinked: true,
    })),
    binaryAuthorizationResult: 'PASSED',
    binaryAuthorizationPolicy: 'projects/policy-project/platforms/gke/policies/release-policy',
    binaryAuthorizationPolicyEtag: 'policy-etag-redeploy',
    binaryAuthorizationEvaluatedImage: `${input.targetRepo}@${input.digest}`,
    binaryAuthorizationEvaluatedAt: '2026-08-27T10:00:00.000Z',
    state: 'PROMOTION_COMMITTED',
    preparedAt: '2026-08-27T09:59:58.000Z',
    committedAt: '2026-08-27T09:59:59.000Z',
  };
}

async function setup(options: ApiAppOptions = {}) {
  const queuedJobs: DeployBuildJobData[] = [];
  const store = new TestApiStore();
  const app = await buildApiApp({
    store,
    emailProvider: new QuietEmailProvider(),
    enqueueDeployJob: async (job) => {
      queuedJobs.push(structuredClone(job));
      return `job-${job.operationKey ?? job.deploymentId}`;
    },
    ...options,
  });
  const user = await store.createUser({
    email: `reserved-redeploy-${Math.random().toString(36).slice(2)}@example.test`,
    name: 'Reserved Redeploy',
    passwordHash: hashPassword('password123'),
  });
  const organization = await store.createOrganization({
    name: 'Reserved Redeploy Org',
    slug: `reserved-redeploy-${Math.random().toString(36).slice(2)}`,
    ownerUserId: user.id,
  });
  const token = `reserved-redeploy-token-${Math.random().toString(36).slice(2)}`;
  await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3_600_000) });
  await store.upsertSubscription({ organizationId: organization.id, planKey: 'pro', status: 'ACTIVE' });
  const project = await store.createProject({
    organizationId: organization.id,
    name: 'Reserved Redeploy Project',
    slug: `reserved-redeploy-project-${Math.random().toString(36).slice(2)}`,
  });
  const workspace = await store.createWorkspace({
    projectId: project.id,
    name: 'Development',
    runtimeMode: 'docker',
    initialStatus: 'RUNNING',
  });

  return { app, store, user, organization, project, workspace, token, queuedJobs };
}

async function seedCurrentReservedVm(input: Awaited<ReturnType<typeof setup>>) {
  const projectManifest = await input.store.getLatestProjectManifest(input.project.id);
  if (!projectManifest) {
    throw new Error('Expected the project fixture to have a manifest revision');
  }
  const oldDigest = `sha256:${'a'.repeat(64)}`;
  const sourceRepo = `europe-west9-docker.pkg.dev/build-project/build-repo/p-${input.project.id.toLowerCase()}`;
  const targetRepo = `europe-west9-docker.pkg.dev/tenant-project/releases/p-${input.project.id.toLowerCase()}`;
  const oldPromotion = promotionManifest({
    promotionId: 'promotion-old-release',
    organizationId: input.organization.id,
    sourceRepo,
    targetRepo,
    digest: oldDigest,
  });
  const deployment = await input.store.createDeployment({
    projectId: input.project.id,
    expectedOrganizationId: input.project.organizationId,
    workspaceId: input.workspace.id,
    provider: 'server',
    environment: 'preview',
    status: 'READY',
    url: 'https://stable-reserved.preview.e-code.ai',
    previewUrl: 'https://stable-reserved.preview.e-code.ai',
    framework: 'node',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    machineSize: 'dedicated-1',
    metadata: {
      projectManifestDigest: projectManifest.digest,
      serverDeploy: {
        host: 'stable-reserved.preview.e-code.ai',
        ready: true,
        readyReplicas: 1,
        applied: true,
        image: {
          imageUri: `${targetRepo}@${oldDigest}`,
          imageRef: targetRepo,
          imageDigest: oldDigest,
          sourceImageUri: `${sourceRepo}:old`,
          sourceImageRef: sourceRepo,
        },
        promotion: oldPromotion,
        releaseConfigDigest: `sha256:${'b'.repeat(64)}`,
      },
    },
    reservedVm: {
      organizationId: input.organization.id,
      actorUserId: input.user.id,
      idempotencyKey: 'reserved-create-seed-0001',
      requestHash: 'seed-request-hash',
      tier: 'dedicated-1',
      termsVersion: RESERVED_VM_TERMS_VERSION,
      monthlyPriceCents: 4_000,
      rateCardVersion: 1,
    },
  });
  input.store.reservedVmOperations.delete(`${input.project.id}:reserved-create-seed-0001`);

  const durable = input.store.deployments.get(deployment.id)!;
  Object.assign(durable, {
    runtimeVersion: 7,
    reservedVmRateCardVersion: 1,
    reservedVmBillingReservationId: 'ledger-reservation-original',
    reservedVmBillingState: 'CURRENT',
    reservedVmCurrentPeriodStart: '2026-08-01T00:00:00.000Z',
    reservedVmNextChargeAt: '2026-09-01T00:00:00.000Z',
    persistentStorageClaim: `reserved-data-${deployment.id}`,
  } satisfies Partial<DeploymentRecord>);
  await input.store.createReleaseManifest({
    projectId: input.project.id,
    deploymentId: deployment.id,
    environment: 'preview',
    version: 1,
    provider: 'server',
    artifactKind: 'server-image',
    artifactRef: targetRepo,
    artifactDigest: oldDigest,
    configDigest: `sha256:${'b'.repeat(64)}`,
    accessPolicyVersion: deployment.accessPolicyVersion,
  });

  return { deployment: durable, oldDigest, sourceRepo, targetRepo };
}

beforeEach(() => {
  process.env.INTERNAL_API_SHARED_SECRET = 'reserved-redeploy-internal-secret';
  process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';
  process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'manager-secret';
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = 'http://workspace-agent.test/{workspaceId}';
  process.env.SERVER_DEPLOY_SNAPSHOT_IMAGE = '1';
  process.env.SERVER_DEPLOY_IMAGE_REPO = 'europe-west9-docker.pkg.dev/build-project/build-repo';
  process.env.SERVER_DEPLOY_IMAGE = 'registry.example/workspace@sha256:base';
  process.env.SERVER_DEPLOY_REVISION_ROLLOUT_PERCENT = '0';

  pipeline.createWorkspaceBuildAgent.mockReset();
  pipeline.runAppImageBuild.mockReset();
  pipeline.snapshotWorkspaceImageContext.mockReset();
  pipeline.createWorkspaceBuildAgent.mockReturnValue({
    readFile: vi.fn(async (path: string) => {
      if (path === 'package.json') {
        return { content: JSON.stringify({ scripts: { start: 'node server.js' } }), encoding: 'utf8' as const };
      }
      throw new Error('not found');
    }),
    listFiles: vi.fn(async () => ({ files: [{ path: 'package.json', type: 'file' }] })),
  });
  pipeline.snapshotWorkspaceImageContext.mockResolvedValue({
    ok: true,
    bucket: 'reserved-redeploy-builds',
    object: 'context/redeploy.tgz',
    bytes: 4_096,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Reserved VM durable in-place redeploy', () => {
  it('reuses the same runtime/PVC/URL, atomically appends the release and coalesces replay enqueue', async () => {
    const oldKeyId = 'reserved-vm-payload-old';
    const oldKey = 'o'.repeat(32);
    const newKeyId = 'reserved-vm-payload-current';
    const newKey = 'n'.repeat(32);
    const buildCommandSentinel = 'npm run build:reserved-rotation-sentinel';
    process.env.RESERVED_VM_PAYLOAD_ENCRYPTION_KEY_ID = oldKeyId;
    process.env.RESERVED_VM_PAYLOAD_ENCRYPTION_KEY = oldKey;
    delete process.env.RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON;
    const nextDigest = `sha256:${'c'.repeat(64)}`;
    const reconfigureBodies: Array<Record<string, unknown>> = [];
    let starts = 0;
    let stops = 0;
    const runtime = await setup({
      serverImagePromotionRuntime: {
        promote: vi.fn(async (request): Promise<PromotionResult> => {
          const manifest = promotionManifest({
            promotionId: 'promotion-redeploy-release',
            organizationId: request.organizationId,
            sourceRepo: request.source.repo,
            targetRepo: `europe-west9-docker.pkg.dev/tenant-project/releases/p-${request.projectId.toLowerCase()}`,
            digest: nextDigest,
          });
          return {
            ok: true,
            target: { repo: manifest.targetRepo, digest: nextDigest },
            promotedAttestations: ['signature', 'sbom', 'provenance'],
            reused: false,
            manifest,
          };
        }),
      },
    });
    const seeded = await seedCurrentReservedVm(runtime);
    seeded.deployment.buildCommand = buildCommandSentinel;
    pipeline.runAppImageBuild.mockResolvedValue({
      ok: true,
      imageUri: `${seeded.sourceRepo}:${seeded.deployment.id}`,
      digest: nextDigest,
      imageSizeBytes: 12_345,
      buildId: 'build-redeploy',
      durationMs: 2_000,
    });
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);

      if (href.includes('/agent-token')) {
        return new Response(JSON.stringify({ token: 'agent-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (href.endsWith('/health')) return new Response('{}', { status: 200 });
      if (href.includes('/server-deployments/start')) {
        starts += 1;
        return new Response('unexpected start', { status: 500 });
      }
      if (href.includes('/server-deployments/') && href.endsWith('/stop')) {
        stops += 1;
        return new Response('unexpected stop', { status: 500 });
      }
      if (href.endsWith(`/server-deployments/${seeded.deployment.id}/reconfigure`)) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        reconfigureBodies.push(body);
        return new Response(
          JSON.stringify({
            ready: true,
            readyReplicas: 1,
            name: `app-${seeded.deployment.id}`,
            persistentVolumeClaimName: seeded.deployment.persistentStorageClaim,
            appliedFencingToken: body.fencingToken,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    const idempotencyKey = 'reserved-redeploy-route-0001';
    const request = {
      method: 'POST' as const,
      url: `/projects/${runtime.project.id}/deployments/${seeded.deployment.id}/redeploy`,
      headers: { authorization: `Bearer ${runtime.token}`, 'idempotency-key': idempotencyKey },
    };

    const queued = await runtime.app.inject(request);
    const replay = await runtime.app.inject(request);

    expect(queued.statusCode).toBe(202);
    expect(replay.statusCode).toBe(202);
    expect(replay.json()).toMatchObject({ replayed: true });
    expect(queued.body).not.toContain('encryptedBuildInput');
    expect(queued.body).not.toContain(oldKeyId);
    expect(runtime.queuedJobs).toHaveLength(1);
    expect(runtime.queuedJobs[0]).toMatchObject({
      projectId: runtime.project.id,
      deploymentId: seeded.deployment.id,
      operationKey: idempotencyKey,
      userId: runtime.user.id,
    });

    const durableRedeploy = (
      (await runtime.store.getDeployment(runtime.project.id, seeded.deployment.id))?.metadata as
        | { reservedVmRedeploy?: { encryptedBuildInput?: { keyId?: string; ciphertext?: string } } }
        | undefined
    )?.reservedVmRedeploy;
    expect(durableRedeploy?.encryptedBuildInput?.keyId).toBe(oldKeyId);
    expect(durableRedeploy?.encryptedBuildInput?.ciphertext).toEqual(expect.any(String));
    expect(JSON.stringify(durableRedeploy?.encryptedBuildInput)).not.toContain(buildCommandSentinel);

    /* Rotate writers before a different worker resumes the durable old envelope. */
    process.env.RESERVED_VM_PAYLOAD_ENCRYPTION_KEY_ID = newKeyId;
    process.env.RESERVED_VM_PAYLOAD_ENCRYPTION_KEY = newKey;
    process.env.RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON = JSON.stringify({ [oldKeyId]: oldKey });

    const built = await runtime.app.inject({
      method: 'POST',
      url: '/internal/deployments/build',
      headers: { authorization: 'Bearer reserved-redeploy-internal-secret' },
      payload: runtime.queuedJobs[0],
    });

    expect(built.statusCode).toBe(200);
    expect(starts).toBe(0);
    expect(stops).toBe(0);
    expect(reconfigureBodies).toHaveLength(1);
    expect(reconfigureBodies[0]).toMatchObject({
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-1',
      image: `${seeded.targetRepo}@${nextDigest}`,
      operationId: expect.any(String),
      fencingToken: expect.any(Number),
    });
    expect(Number(reconfigureBodies[0]!.fencingToken)).toBeGreaterThan(0);

    const persisted = await runtime.store.getDeployment(runtime.project.id, seeded.deployment.id);
    expect(persisted).toMatchObject({
      id: seeded.deployment.id,
      status: 'READY',
      url: seeded.deployment.url,
      previewUrl: seeded.deployment.previewUrl,
      runtimeKind: 'reserved-vm',
      runtimeVersion: 8,
      machineSize: 'dedicated-1',
      reservedVmTier: 'dedicated-1',
      reservedVmPriceCents: 4_000,
      reservedVmBillingReservationId: 'ledger-reservation-original',
      reservedVmBillingState: 'CURRENT',
      reservedVmCurrentPeriodStart: '2026-08-01T00:00:00.000Z',
      reservedVmNextChargeAt: '2026-09-01T00:00:00.000Z',
      persistentStorageClaim: seeded.deployment.persistentStorageClaim,
    });
    expect(((persisted?.metadata as any)?.serverDeploy?.image as any)?.imageDigest).toBe(nextDigest);
    expect(runtime.store.releaseManifests).toHaveLength(2);
    expect(runtime.store.releaseManifests.map((manifest) => manifest.deploymentId)).toEqual([
      seeded.deployment.id,
      seeded.deployment.id,
    ]);
    expect(runtime.store.releaseManifests.at(-1)).toMatchObject({ version: 2, artifactDigest: nextDigest });
    expect(await runtime.store.getReservedVmOperation(runtime.project.id, idempotencyKey)).toMatchObject({
      kind: 'REDEPLOY',
      status: 'COMPLETED',
      phase: 'COMMITTED',
      billingAmountCents: 0,
    });

    await runtime.app.close();
  });

  it('keeps the previous paid release and never stops it when manager proves an exact rollback', async () => {
    const nextDigest = `sha256:${'e'.repeat(64)}`;
    let starts = 0;
    let stops = 0;
    let reconfigures = 0;
    const runtime = await setup({
      serverImagePromotionRuntime: {
        promote: vi.fn(async (request): Promise<PromotionResult> => {
          const manifest = promotionManifest({
            promotionId: 'promotion-rolled-back-release',
            organizationId: request.organizationId,
            sourceRepo: request.source.repo,
            targetRepo: `europe-west9-docker.pkg.dev/tenant-project/releases/p-${request.projectId.toLowerCase()}`,
            digest: nextDigest,
          });
          return {
            ok: true,
            target: { repo: manifest.targetRepo, digest: nextDigest },
            promotedAttestations: ['signature', 'sbom', 'provenance'],
            reused: false,
            manifest,
          };
        }),
      },
    });
    const seeded = await seedCurrentReservedVm(runtime);
    pipeline.runAppImageBuild.mockResolvedValue({
      ok: true,
      imageUri: `${seeded.sourceRepo}:${seeded.deployment.id}`,
      digest: nextDigest,
      buildId: 'build-rolled-back',
      durationMs: 1_000,
    });
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);

      if (href.includes('/agent-token')) {
        return new Response(JSON.stringify({ token: 'agent-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (href.endsWith('/health')) return new Response('{}', { status: 200 });
      if (href.includes('/server-deployments/start')) {
        starts += 1;
        return new Response('unexpected start', { status: 500 });
      }
      if (href.includes('/server-deployments/') && href.endsWith('/stop')) {
        stops += 1;
        return new Response('unexpected stop', { status: 500 });
      }
      if (href.endsWith(`/server-deployments/${seeded.deployment.id}/reconfigure`)) {
        reconfigures += 1;
        return new Response(
          JSON.stringify({
            error: 'The replacement generation failed readiness; the previous release is restored.',
            code: 'RESERVED_VM_RECONFIGURE_NOT_READY',
            rolledBack: true,
          }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    const idempotencyKey = 'reserved-redeploy-rollback-0001';

    const queued = await runtime.app.inject({
      method: 'POST',
      url: `/projects/${runtime.project.id}/deployments/${seeded.deployment.id}/redeploy`,
      headers: { authorization: `Bearer ${runtime.token}`, 'idempotency-key': idempotencyKey },
    });
    expect(queued.statusCode).toBe(202);

    const built = await runtime.app.inject({
      method: 'POST',
      url: '/internal/deployments/build',
      headers: { authorization: 'Bearer reserved-redeploy-internal-secret' },
      payload: runtime.queuedJobs[0],
    });

    expect(built.statusCode).toBe(200);
    expect(starts).toBe(0);
    expect(stops).toBe(0);
    expect(reconfigures).toBe(1);
    const persisted = await runtime.store.getDeployment(runtime.project.id, seeded.deployment.id);
    expect(persisted).toMatchObject({
      id: seeded.deployment.id,
      status: 'READY',
      url: seeded.deployment.url,
      runtimeVersion: 7,
      persistentStorageClaim: seeded.deployment.persistentStorageClaim,
      reservedVmBillingReservationId: 'ledger-reservation-original',
      reservedVmBillingState: 'CURRENT',
    });
    expect(((persisted?.metadata as any)?.serverDeploy?.image as any)?.imageDigest).toBe(seeded.oldDigest);
    expect(runtime.store.releaseManifests).toHaveLength(1);
    expect(runtime.store.releaseManifests[0]).toMatchObject({ artifactDigest: seeded.oldDigest, version: 1 });
    expect(await runtime.store.getReservedVmOperation(runtime.project.id, idempotencyKey)).toMatchObject({
      kind: 'REDEPLOY',
      status: 'FAILED',
      phase: 'ROLLED_BACK',
      errorCode: 'RESERVED_VM_RECONFIGURE_NOT_READY',
    });

    await runtime.app.close();
  });

  it('reconstructs the stable operation job from DB metadata after the first enqueue fails', async () => {
    const enqueued: DeployBuildJobData[] = [];
    let enqueueAttempts = 0;
    const runtime = await setup({
      enqueueDeployJob: async (job) => {
        enqueueAttempts += 1;
        enqueued.push(structuredClone(job));
        if (enqueueAttempts === 1) throw Object.assign(new Error('Redis unavailable'), { code: 'QUEUE_DOWN' });
        return `recovered-${job.operationKey}`;
      },
    });
    const seeded = await seedCurrentReservedVm(runtime);
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);

      if (href.endsWith(`/server-deployments/${seeded.deployment.id}/status`)) {
        return new Response(JSON.stringify({ exists: true, readyReplicas: 1, replicas: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    const idempotencyKey = 'reserved-redeploy-recovery-0001';
    const request = {
      method: 'POST' as const,
      url: `/projects/${runtime.project.id}/deployments/${seeded.deployment.id}/redeploy`,
      headers: { authorization: `Bearer ${runtime.token}`, 'idempotency-key': idempotencyKey },
    };

    const first = await runtime.app.inject(request);
    const replay = await runtime.app.inject(request);

    expect(first.statusCode).toBe(202);
    expect(first.json()).toMatchObject({ queued: false, retryable: true });
    expect(replay.statusCode).toBe(202);
    expect(replay.json()).toMatchObject({ replayed: true });
    expect(enqueueAttempts).toBe(1);

    const recovery = await runtime.app.inject({
      method: 'POST',
      url: '/internal/deployments/reap',
      headers: { authorization: 'Bearer reserved-redeploy-internal-secret' },
      payload: {},
    });

    expect(recovery.statusCode).toBe(200);
    expect(recovery.json().reservedVmRedeployRecovery).toEqual({
      claimed: true,
      deploymentId: seeded.deployment.id,
      operationId: expect.any(String),
      jobId: `recovered-${idempotencyKey}`,
    });
    expect(enqueueAttempts).toBe(2);
    expect(enqueued[1]).toEqual(enqueued[0]);
    expect(enqueued[1]).toMatchObject({
      projectId: runtime.project.id,
      deploymentId: seeded.deployment.id,
      operationKey: idempotencyKey,
      userId: runtime.user.id,
    });

    await runtime.app.close();
  });

  it('fails closed without a manager effect when the durable recovery envelope is corrupt', async () => {
    process.env.RESERVED_VM_PAYLOAD_ENCRYPTION_KEY_ID = 'reserved-vm-payload-corrupt-test';
    process.env.RESERVED_VM_PAYLOAD_ENCRYPTION_KEY = 'c'.repeat(32);
    delete process.env.RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON;
    const runtime = await setup();
    const seeded = await seedCurrentReservedVm(runtime);
    const managerFetch = vi.fn(async () => new Response('unexpected manager call', { status: 500 }));
    globalThis.fetch = managerFetch as typeof fetch;
    const idempotencyKey = 'reserved-redeploy-corrupt-0001';

    const queued = await runtime.app.inject({
      method: 'POST',
      url: `/projects/${runtime.project.id}/deployments/${seeded.deployment.id}/redeploy`,
      headers: { authorization: `Bearer ${runtime.token}`, 'idempotency-key': idempotencyKey },
    });
    expect(queued.statusCode).toBe(202);

    const durable = runtime.store.deployments.get(seeded.deployment.id)!;
    const metadata = durable.metadata as {
      reservedVmRedeploy: { encryptedBuildInput: { keyId: string; ciphertext: string } };
    };
    metadata.reservedVmRedeploy.encryptedBuildInput.ciphertext = 'not-an-authenticated-envelope';

    const built = await runtime.app.inject({
      method: 'POST',
      url: '/internal/deployments/build',
      headers: { authorization: 'Bearer reserved-redeploy-internal-secret' },
      payload: runtime.queuedJobs[0],
    });

    expect(built.statusCode).toBe(503);
    expect(built.json().code).toBe('RESERVED_VM_PAYLOAD_DECRYPTION_FAILED');
    expect(managerFetch).not.toHaveBeenCalled();
    expect(await runtime.store.getReservedVmOperation(runtime.project.id, idempotencyKey)).toMatchObject({
      status: 'PENDING',
    });
    await runtime.app.close();
  });
});
