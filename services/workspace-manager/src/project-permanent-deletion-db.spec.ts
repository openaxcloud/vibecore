import { createHash } from 'node:crypto';

import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import {
  scheduledJobPodName,
  scheduledJobSecretName,
  type K8sObject,
  type WorkspaceK8sClient,
} from '@vibecore/k8s-client';
import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { WorkspaceManager, type EventBus, type WorkspaceProjectDeletionLease } from './manager.js';
import { PrismaWorkspaceStore } from './prisma-store.js';

async function reachableDatabase(): Promise<DatabaseClient | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const prisma = createDatabaseClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return prisma;
  } catch {
    await prisma.$disconnect();
    return undefined;
  }
}

class ProjectDeletionK8s implements WorkspaceK8sClient {
  readonly objects = new Map<string, K8sObject>();
  onDelete?: () => Promise<void>;

  async apply(object: K8sObject) {
    this.objects.set(`${object.metadata.namespace}:${object.kind}:${object.metadata.name}`, object);
    return object;
  }

  async delete(kind: string, namespace: string, name: string) {
    this.objects.delete(`${namespace}:${kind}:${name}`);
    await this.onDelete?.();
  }

  async get(kind: string, namespace: string, name: string) {
    return this.objects.get(`${namespace}:${kind}:${name}`);
  }

  async getPod(namespace: string, name: string) {
    return this.get('Pod', namespace, name);
  }

  async *streamPodLogs() {}
  async scale() {}
  async annotate() {}

  async listByLabel(kind: string, namespace: string, labelSelector: string) {
    const [key, value] = labelSelector.split('=');
    return [...this.objects.values()].filter(
      (object) =>
        object.kind === kind && object.metadata.namespace === namespace && object.metadata.labels?.[key!] === value,
    );
  }
}

class NoopEvents implements EventBus {
  async publish() {}
}

const prisma = await reachableDatabase();
const integrationDescribe = prisma ? describe : describe.skip;
const createdOrganizations: string[] = [];
const createdProjects: string[] = [];
const createdOperations: string[] = [];
const createdScheduledTasks: string[] = [];

function unique(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function seedDeletion(fence: number) {
  const organizationId = unique('workspace-delete-org');
  const projectId = unique('workspace-delete-project');
  const workspaceId = unique('workspace-delete-runtime');
  const deploymentId = unique('workspace-delete-server');
  const legacyPersistentVolumeClaim = unique('workspace-delete-legacy-pvc');
  const operationId = unique('workspace-delete-operation');
  const scheduledTaskId = unique('workspace-delete-task');
  const scheduledRunId = unique('workspace-delete-run');
  const ownerToken = `${unique('workspace-delete-owner')}-0123456789abcdef`;
  const requestHash = fence.toString(16).padStart(64, 'a').slice(-64);
  const scopeHash = fence.toString(16).padStart(64, 'b').slice(-64);
  const deletionStartedAt = new Date();
  createdOrganizations.push(organizationId);
  createdProjects.push(projectId);
  createdOperations.push(operationId);
  createdScheduledTasks.push(scheduledTaskId);

  await prisma!.organization.create({ data: { id: organizationId, slug: organizationId, name: organizationId } });
  await prisma!.project.create({
    data: { id: projectId, organizationId, slug: projectId, name: projectId },
  });
  const store = new PrismaWorkspaceStore(prisma!);
  await store.create({
    id: workspaceId,
    orgId: organizationId,
    projectId,
    plan: 'pro',
    status: 'RUNNING',
    pvcName: `pvc-${workspaceId}`,
    podName: `workspace-${workspaceId}`,
    serviceName: `workspace-${workspaceId}`,
    agentTokenSecretName: `agent-token-${workspaceId}`,
  });
  await prisma!.deployment.create({ data: { id: deploymentId, projectId, provider: 'server' } });
  await prisma!.scheduledTask.create({
    data: {
      id: scheduledTaskId,
      organizationId,
      projectId,
      name: 'permanent deletion scheduled task',
      command: 'echo should-never-run',
      cron: '0 0 * * *',
      enabled: true,
      nextRunAt: new Date(),
      runs: {
        create: {
          id: scheduledRunId,
          organizationId,
          projectId,
          trigger: 'schedule',
          scheduledFor: new Date(),
        },
      },
    },
  });
  await prisma!.project.update({
    where: { id: projectId },
    data: {
      deletedAt: deletionStartedAt,
      permanentDeletionStartedAt: deletionStartedAt,
      persistentVolumeClaim: legacyPersistentVolumeClaim,
    },
  });
  await prisma!.objectStorageOperation.create({
    data: {
      id: operationId,
      kind: 'PROJECT_PERMANENT_DELETE',
      status: 'EFFECT_STARTED',
      scopeHash,
      idempotencyScopeHash: sha256(`${operationId}:${projectId}:${organizationId}`),
      idempotencyKey: unique('workspace-delete-key'),
      requestHash,
      payload: { command: 'project-permanent-delete' },
      preconditions: {},
      ownerToken,
      fencingToken: BigInt(fence),
      leaseExpiresAt: new Date(Date.now() + 60_000),
      preparedAt: deletionStartedAt,
      effectStartedAt: deletionStartedAt,
      scopes: {
        create: {
          ordinal: 0,
          projectIdSnapshot: projectId,
          projectId,
          expectedOrganizationId: organizationId,
          expectedPermanentDeletionStartedAt: deletionStartedAt,
          deletionFenceDeletedAt: deletionStartedAt,
        },
      },
    },
  });

  const lease: WorkspaceProjectDeletionLease = {
    operationId,
    ownerToken,
    fencingToken: String(fence),
    requestHash,
    scopeHash,
    projectId,
    expectedOrganizationId: organizationId,
  };
  const k8s = new ProjectDeletionK8s();
  const labels = { 'vibecore.ai/project-id': projectId, 'vibecore.ai/workspace-id': workspaceId };
  for (const [kind, name] of [
    ['Pod', `workspace-${workspaceId}`],
    ['Service', `workspace-${workspaceId}`],
    ['Secret', `agent-token-${workspaceId}`],
    ['PersistentVolumeClaim', `pvc-${workspaceId}`],
  ] as const) {
    await k8s.apply({ apiVersion: 'v1', kind, metadata: { namespace: 'workspaces', name, labels } });
  }
  const serverLabels = { 'vibecore.ai/project': projectId, 'vibecore.ai/server-deploy': deploymentId };
  for (const [kind, name, resourceLabels] of [
    ['Deployment', `app-${deploymentId}`, serverLabels],
    ['Pod', `app-${deploymentId}-abc`, serverLabels],
    ['Service', `app-${deploymentId}`, serverLabels],
    ['Ingress', `app-${deploymentId}`, serverLabels],
    ['Secret', `app-secrets-${deploymentId}`, { 'vibecore.ai/server-deploy': deploymentId }],
    ['PersistentVolumeClaim', legacyPersistentVolumeClaim, {}],
    ['Pod', scheduledJobPodName(scheduledRunId), {}],
    ['Secret', scheduledJobSecretName(scheduledRunId), {}],
  ] as const) {
    await k8s.apply({
      apiVersion: 'v1',
      kind,
      metadata: { namespace: 'workspaces', name, labels: resourceLabels },
    });
  }
  return { organizationId, projectId, workspaceId, operationId, lease, store, k8s };
}

integrationDescribe('project permanent deletion workspace fence (PostgreSQL)', () => {
  afterAll(async () => {
    if (!prisma) return;
    await prisma.projectRuntimeEffect.deleteMany({ where: { projectId: { in: createdProjects } } });
    await prisma.scheduledTask.deleteMany({ where: { id: { in: createdScheduledTasks } } });
    await prisma.workspaceRuntime.deleteMany({ where: { projectId: { in: createdProjects } } });
    await prisma.objectStorageOperation.deleteMany({ where: { id: { in: createdOperations } } });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizations } } });
    await prisma.$disconnect();
  });

  it('deletes every runtime object, retains DB recovery identities, then rejects a stale recreate', async () => {
    const fixture = await seedDeletion(1);
    const manager = new WorkspaceManager(fixture.store, fixture.k8s, new NoopEvents(), 'test-token');

    const proof = await manager.purgeProjectWorkspaces('workspaces', fixture.lease);

    expect(proof.databaseInventoryRetained).toBe(true);
    expect(proof.runtimeEffectsDrained).toBe(true);
    expect(fixture.k8s.objects.size).toBe(0);
    await expect(prisma!.workspaceRuntime.count({ where: { projectId: fixture.projectId } })).resolves.toBe(1);
    await expect(prisma!.scheduledTask.count({ where: { projectId: fixture.projectId } })).resolves.toBe(1);
    await expect(prisma!.scheduledTaskRun.count({ where: { projectId: fixture.projectId } })).resolves.toBe(1);
    await expect(
      fixture.store.create({
        id: unique('stale-runtime'),
        orgId: fixture.organizationId,
        projectId: fixture.projectId,
        plan: 'pro',
        status: 'STARTING',
        pvcName: unique('pvc'),
        podName: unique('pod'),
        serviceName: unique('service'),
        agentTokenSecretName: unique('secret'),
      }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_PURGE_FROZEN', statusCode: 409 });
  });

  it('halts on a lost fence and lets the reclaimed VERIFYING owner resume idempotently', async () => {
    const fixture = await seedDeletion(11);
    const manager = new WorkspaceManager(fixture.store, fixture.k8s, new NoopEvents(), 'test-token');
    const nextOwnerToken = `${unique('workspace-delete-reclaimer')}-0123456789abcdef`;
    let reclaimed = false;
    fixture.k8s.onDelete = async () => {
      if (reclaimed) return;
      reclaimed = true;
      await prisma!.objectStorageOperation.update({
        where: { id: fixture.operationId },
        data: {
          status: 'VERIFYING',
          ownerToken: nextOwnerToken,
          fencingToken: 12n,
          leaseExpiresAt: new Date(Date.now() + 60_000),
          verificationStartedAt: new Date(),
        },
      });
    };

    await expect(manager.purgeProjectWorkspaces('workspaces', fixture.lease)).rejects.toMatchObject({
      code: 'WORKSPACE_PROJECT_DELETION_LEASE_INVALID',
      statusCode: 409,
    });
    expect(fixture.k8s.objects.size).toBeGreaterThan(0);

    fixture.k8s.onDelete = undefined;
    const reclaimedLease = { ...fixture.lease, ownerToken: nextOwnerToken, fencingToken: '12' };
    const proof = await manager.verifyProjectWorkspacesAbsent('workspaces', reclaimedLease);

    expect(proof.databaseInventoryRetained).toBe(true);
    expect(proof.runtimeEffectsDrained).toBe(true);
    expect(fixture.k8s.objects.size).toBe(0);
    await expect(prisma!.workspaceRuntime.count({ where: { projectId: fixture.projectId } })).resolves.toBe(1);
  });

  it('replays a crash after provider delete and drains a SETTLED runtime effect exactly once', async () => {
    const fixture = await seedDeletion(21);
    const runtimeEffectId = unique('workspace-delete-settled-effect');
    const runtimeTargetName = unique('workspace-delete-effect-pod');
    await prisma!.$executeRaw`
      INSERT INTO "ProjectRuntimeEffect" (
        "id", "projectId", "organizationId", "ownershipEpoch", "action", "resourceId",
        "intentHash", "targetDigest", "state", "settledAt", "createdAt", "updatedAt"
      ) VALUES (
        ${runtimeEffectId}, ${fixture.projectId}, ${fixture.organizationId}, 0,
        'START_WORKSPACE', ${runtimeTargetName}, ${'c'.repeat(64)}, ${'d'.repeat(64)},
        'SETTLED'::"ProjectRuntimeEffectState", clock_timestamp(), clock_timestamp(), clock_timestamp()
      )
    `;
    await prisma!.$executeRaw`
      INSERT INTO "ProjectRuntimeEffectTarget" ("effectId", "ordinal", "kind", "namespace", "name")
      VALUES (${runtimeEffectId}, 0, 'Pod', 'workspaces', ${runtimeTargetName})
    `;
    await fixture.k8s.apply({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { namespace: 'workspaces', name: runtimeTargetName },
    });
    const manager = new WorkspaceManager(fixture.store, fixture.k8s, new NoopEvents(), 'test-token');
    let crashed = false;
    fixture.k8s.onDelete = async () => {
      if (crashed) return;
      crashed = true;
      throw new Error('CRASH_AFTER_PROVIDER_DELETE');
    };

    await expect(manager.purgeProjectWorkspaces('workspaces', fixture.lease)).rejects.toThrow(
      'CRASH_AFTER_PROVIDER_DELETE',
    );
    await expect(
      prisma!.$queryRaw<Array<{ state: string }>>`
        SELECT "state"::text AS "state" FROM "ProjectRuntimeEffect" WHERE "id" = ${runtimeEffectId}
      `,
    ).resolves.toEqual([{ state: 'DRAINING' }]);

    fixture.k8s.onDelete = undefined;
    const proof = await manager.purgeProjectWorkspaces('workspaces', fixture.lease);
    expect(proof.runtimeEffectsDrained).toBe(true);
    await expect(fixture.k8s.get('Pod', 'workspaces', runtimeTargetName)).resolves.toBeUndefined();
    await expect(
      prisma!.$queryRaw<Array<{ state: string }>>`
        SELECT "state"::text AS "state" FROM "ProjectRuntimeEffect" WHERE "id" = ${runtimeEffectId}
      `,
    ).resolves.toEqual([{ state: 'DRAINED' }]);
  });

  it('serializes the physical project barrier before a purge fence so a stale start never reaches Kubernetes', async () => {
    const fixture = await seedDeletion(31);
    await prisma!.project.update({
      where: { id: fixture.projectId },
      data: { deletedAt: null, permanentDeletionStartedAt: null },
    });
    await prisma!.workspaceRuntime.update({
      where: { id: fixture.workspaceId },
      data: { purgeFrozen: false, purgePlanId: null, purgeFenceToken: null },
    });
    const barrier = new Client({ connectionString: process.env.DATABASE_URL });
    await barrier.connect();
    await barrier.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
      `project-physical-mutation:${fixture.projectId}`,
    ]);

    let providerEffects = 0;
    const staleProvision = fixture.store.executeProvisionEffect(fixture.workspaceId, async () => {
      providerEffects += 1;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(providerEffects).toBe(0);

    await barrier.query(
      `UPDATE "Project"
          SET "deletedAt" = clock_timestamp(), "permanentDeletionStartedAt" = clock_timestamp()
        WHERE id = $1`,
      [fixture.projectId],
    );
    await barrier.query(
      `UPDATE "WorkspaceRuntime"
          SET "purgeFrozen" = true, "purgePlanId" = NULL, "purgeFenceToken" = $2
        WHERE id = $1`,
      [fixture.workspaceId, fixture.lease.ownerToken],
    );
    await barrier.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
      `project-physical-mutation:${fixture.projectId}`,
    ]);
    await barrier.end();

    await expect(staleProvision).rejects.toMatchObject({ code: 'WORKSPACE_PURGE_FROZEN', statusCode: 409 });
    expect(providerEffects).toBe(0);
  });

  it('holds no database transaction open while a Kubernetes provider effect is suspended', async () => {
    const fixture = await seedDeletion(41);
    await prisma!.project.update({
      where: { id: fixture.projectId },
      data: { deletedAt: null, permanentDeletionStartedAt: null },
    });
    const providerStarted = deferred<void>();
    const releaseProvider = deferred<void>();
    const provision = fixture.store.executeProvisionEffect(fixture.workspaceId, async () => {
      providerStarted.resolve();
      await releaseProvider.promise;
    });
    await providerStarted.promise;

    const sessions = await prisma!.$queryRaw<Array<{ state: string; xactStart: Date | null }>>`
      SELECT state, xact_start AS "xactStart"
      FROM pg_stat_activity
      WHERE application_name = 'vibecore-workspace-project-effect'
    `;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ state: 'idle', xactStart: null });

    releaseProvider.resolve();
    await expect(provision).resolves.toBeUndefined();
  });

  it('aborts an expired PREPARED effect and safely retries the same runtime resource', async () => {
    const fixture = await seedDeletion(51);
    await prisma!.project.update({
      where: { id: fixture.projectId },
      data: { deletedAt: null, permanentDeletionStartedAt: null },
    });
    await prisma!.workspaceRuntime.update({
      where: { id: fixture.workspaceId },
      data: { purgeFrozen: false, purgePlanId: null, purgeFenceToken: null },
    });
    const staleEffectId = unique('workspace-stale-prepared');
    await prisma!.$executeRaw`
      INSERT INTO "ProjectRuntimeEffect" (
        "id", "projectId", "organizationId", "ownershipEpoch", "action", "resourceId",
        "intentHash", "targetDigest", "fencingToken", "ownerToken", "state",
        "leaseExpiresAt", "preparedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${staleEffectId}, ${fixture.projectId}, ${fixture.organizationId}, 0,
        'WORKSPACE_PROVISION', ${fixture.workspaceId}, ${'a'.repeat(64)}, ${'b'.repeat(64)},
        1, ${unique('stale-prepared-owner')}, 'PREPARED'::"ProjectRuntimeEffectState",
        clock_timestamp() - INTERVAL '10 minutes', clock_timestamp(), clock_timestamp(), clock_timestamp()
      )
    `;

    let providerEffects = 0;
    await expect(
      fixture.store.executeProvisionEffect(fixture.workspaceId, async () => {
        providerEffects += 1;
      }),
    ).resolves.toBeUndefined();
    expect(providerEffects).toBe(1);
    await expect(
      prisma!.$queryRaw<Array<{ state: string }>>`
        SELECT "state"::text AS "state"
        FROM "ProjectRuntimeEffect"
        WHERE "projectId" = ${fixture.projectId}
        ORDER BY "createdAt", "id"
      `,
    ).resolves.toEqual(expect.arrayContaining([{ state: 'ABORTED' }, { state: 'SETTLED' }]));
  });

  it('leaves a lost-session provider effect IN_FLIGHT and refuses deletion before any purge effect', async () => {
    const fixture = await seedDeletion(61);
    await prisma!.project.update({
      where: { id: fixture.projectId },
      data: { deletedAt: null, permanentDeletionStartedAt: null },
    });
    await prisma!.workspaceRuntime.update({
      where: { id: fixture.workspaceId },
      data: { purgeFrozen: false, purgePlanId: null, purgeFenceToken: null },
    });
    const providerStarted = deferred<void>();
    const releaseProvider = deferred<void>();
    let providerEffects = 0;
    const provision = fixture.store.executeProvisionEffect(fixture.workspaceId, async () => {
      providerStarted.resolve();
      await releaseProvider.promise;
      providerEffects += 1;
    });
    await providerStarted.promise;

    const sessions = await prisma!.$queryRaw<Array<{ pid: number }>>`
      SELECT pid
      FROM pg_stat_activity
      WHERE application_name = 'vibecore-workspace-project-effect'
        AND pid <> pg_backend_pid()
      ORDER BY backend_start DESC
      LIMIT 1
    `;
    expect(sessions[0]?.pid).toBeTypeOf('number');
    await prisma!.$executeRaw`SELECT pg_terminate_backend(${sessions[0]!.pid})`;
    await prisma!.project.update({
      where: { id: fixture.projectId },
      data: { deletedAt: new Date(), permanentDeletionStartedAt: new Date() },
    });
    const manager = new WorkspaceManager(fixture.store, fixture.k8s, new NoopEvents(), 'test-token');
    const beforeObjects = fixture.k8s.objects.size;
    await expect(manager.purgeProjectWorkspaces('workspaces', fixture.lease)).rejects.toMatchObject({
      code: 'WORKSPACE_PROJECT_RUNTIME_EFFECT_IN_FLIGHT',
      statusCode: 409,
    });
    expect(fixture.k8s.objects.size).toBe(beforeObjects);

    releaseProvider.resolve();
    await expect(provision).rejects.toMatchObject({ code: 'WORKSPACE_PROJECT_PROVISION_LOCK_UNAVAILABLE' });
    expect(providerEffects).toBe(1);
    await expect(
      prisma!.$queryRaw<Array<{ state: string }>>`
        SELECT "state"::text AS "state"
        FROM "ProjectRuntimeEffect"
        WHERE "projectId" = ${fixture.projectId}
        ORDER BY "createdAt" DESC
        LIMIT 1
      `,
    ).resolves.toEqual([{ state: 'IN_FLIGHT' }]);
  });
});
