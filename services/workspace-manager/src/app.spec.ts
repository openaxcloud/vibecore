import { afterEach, describe, expect, it } from 'vitest';
import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import { buildWorkspaceManagerApp } from './app.js';
import {
  WorkspaceManager,
  type EventBus,
  type ProjectCsiProvisionEffectInput,
  type WorkspaceProjectDeletionLease,
  type WorkspaceRecord,
  type WorkspaceStore,
} from './manager.js';
import type { WorkspaceEvent } from '@vibecore/workspace-sdk';

const ENV_KEYS = [
  'WORKSPACE_RUNTIME_NAMESPACE',
  'PREVIEW_PROXY_SHARED_SECRET',
  'WORKSPACE_MANAGER_SHARED_SECRET',
  'WORKSPACE_AGENT_URL_TEMPLATE',
] as const;

class TestWorkspaceStore implements WorkspaceStore {
  readonly workspaces = new Map<string, WorkspaceRecord>();
  readonly purgeEffects = new Map<string, Record<string, unknown>>();
  readonly projectDeletionWorkspaceIds: string[] = [];
  readonly csiProvisionEffects: ProjectCsiProvisionEffectInput[] = [];

  async create(input: Omit<WorkspaceRecord, 'createdAt' | 'lastActiveAt'>) {
    const now = new Date().toISOString();
    const record = { ...input, createdAt: now, lastActiveAt: now };
    this.workspaces.set(record.id, record);
    return record;
  }

  async update(workspaceId: string, patch: Partial<WorkspaceRecord>) {
    const existing = this.workspaces.get(workspaceId);
    if (!existing) {
      throw new Error('Workspace not found');
    }
    const updated = { ...existing, ...patch };
    this.workspaces.set(workspaceId, updated);
    return updated;
  }

  async updateIfUnchanged(
    workspaceId: string,
    expected: Pick<WorkspaceRecord, 'status' | 'lastActiveAt'>,
    patch: Partial<WorkspaceRecord>,
  ) {
    const existing = this.workspaces.get(workspaceId);

    if (!existing || existing.status !== expected.status || existing.lastActiveAt !== expected.lastActiveAt) {
      return undefined;
    }

    const updated = { ...existing, ...patch };
    this.workspaces.set(workspaceId, updated);

    return updated;
  }

  async get(workspaceId: string) {
    return this.workspaces.get(workspaceId);
  }

  async list() {
    return [...this.workspaces.values()];
  }

  async listNonDeleted() {
    return [...this.workspaces.values()].filter((workspace) => workspace.status !== 'DELETED');
  }

  async claimMeterWindow(workspaceId: string, expected: string | undefined, next: string) {
    const existing = this.workspaces.get(workspaceId);

    if (!existing || (existing.lastMeteredAt ?? undefined) !== (expected ?? undefined)) {
      return false;
    }

    this.workspaces.set(workspaceId, { ...existing, lastMeteredAt: next });

    return true;
  }

  async listByProject(projectId: string) {
    return [...this.workspaces.values()].filter((workspace) => workspace.projectId === projectId);
  }

  async executeProvisionEffect<T>(workspaceId: string, effect: (assertAuthority: () => Promise<void>) => Promise<T>) {
    if (this.workspaces.get(workspaceId)?.purgeFrozen) throw new Error('WORKSPACE_PURGE_FROZEN');
    return effect(async () => undefined);
  }

  async executeProjectProvisionEffect<T>(
    _input: { projectId: string; expectedOrganizationId: string },
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ) {
    return effect(async () => undefined);
  }

  async executeProjectCsiProvisionEffect<T>(
    input: ProjectCsiProvisionEffectInput,
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ) {
    this.csiProvisionEffects.push(input);
    return effect(async () => undefined);
  }

  async executeDeploymentProvisionEffect<T>(
    _input: string | { deploymentId: string; projectId: string; expectedOrganizationId: string },
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ) {
    return effect(async () => undefined);
  }

  async executeScheduledRunProvisionEffect<T>(
    _input: { runId: string; projectId: string; expectedOrganizationId: string },
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ) {
    return effect(async () => undefined);
  }

  async acquirePurgeFence(workspaceId: string, lease: { planId: string; ownerToken: string }) {
    const existing = this.workspaces.get(workspaceId);
    const now = new Date().toISOString();
    const workspace = existing ?? {
      id: workspaceId,
      orgId: '',
      projectId: '',
      plan: 'free' as const,
      status: 'STOPPED' as const,
      pvcName: `pvc-${workspaceId}`,
      podName: `workspace-${workspaceId}`,
      serviceName: `workspace-${workspaceId}`,
      agentTokenSecretName: `agent-token-${workspaceId}`,
      createdAt: now,
      lastActiveAt: now,
    };
    const frozen = {
      ...workspace,
      purgeFrozen: true,
      purgePlanId: lease.planId,
      purgeFenceToken: lease.ownerToken,
      purgeFrozenAt: now,
    };
    this.workspaces.set(workspaceId, frozen);
    return frozen;
  }

  async releasePurgeFence(workspaceId: string, lease: { planId: string; ownerToken: string }) {
    const workspace = this.workspaces.get(workspaceId);
    if (
      !workspace?.purgeFrozen ||
      workspace.purgePlanId !== lease.planId ||
      workspace.purgeFenceToken !== lease.ownerToken
    )
      return false;
    this.workspaces.set(workspaceId, {
      ...workspace,
      purgeFrozen: false,
      purgePlanId: undefined,
      purgeFenceToken: undefined,
      purgeFrozenAt: undefined,
    });
    return true;
  }

  async completePurgeState(
    workspaceId: string,
    lease: { planId: string; ownerToken: string },
    status: 'STOPPED' | 'DELETED',
  ) {
    const workspace = this.workspaces.get(workspaceId);
    if (
      !workspace?.purgeFrozen ||
      workspace.purgePlanId !== lease.planId ||
      workspace.purgeFenceToken !== lease.ownerToken
    )
      throw new Error('WORKSPACE_PURGE_FENCE_LOST');
    const updated = { ...workspace, status, error: undefined };
    this.workspaces.set(workspaceId, updated);
    return updated;
  }

  async executePurgeEffect<T extends Record<string, unknown>>(
    workspaceId: string,
    lease: { planId: string; ownerToken: string },
    descriptor: { key: string },
    effect: () => Promise<T>,
  ) {
    const workspace = this.workspaces.get(workspaceId);
    if (
      !workspace?.purgeFrozen ||
      workspace.purgePlanId !== lease.planId ||
      workspace.purgeFenceToken !== lease.ownerToken
    )
      throw new Error('WORKSPACE_PURGE_FENCE_LOST');
    const key = `${lease.planId}:${descriptor.key}`;
    const existing = this.purgeEffects.get(key) as T | undefined;
    if (existing) return { executed: false, receipt: existing };
    const receipt = await effect();
    this.purgeEffects.set(key, receipt);
    return { executed: true, receipt };
  }

  async reconcilePurgeFences() {
    return { scanned: 0, reconciled: 0, workspaceIds: [] as string[] };
  }

  async assertProjectDeletionLease() {}

  async acquireProjectDeletionFence(lease: WorkspaceProjectDeletionLease) {
    const rows = [...this.workspaces.values()].filter((workspace) => workspace.projectId === lease.projectId);
    this.projectDeletionWorkspaceIds.splice(0, this.projectDeletionWorkspaceIds.length, ...rows.map(({ id }) => id));
    for (const workspace of rows) {
      this.workspaces.set(workspace.id, {
        ...workspace,
        purgeFrozen: true,
        purgeFenceToken: lease.ownerToken,
        purgePlanId: undefined,
      });
    }
    return {
      workspaces: rows.map((workspace) => this.workspaces.get(workspace.id)!),
      workspaceIds: [...this.projectDeletionWorkspaceIds],
      persistentVolumeClaims: [],
      serverDeploymentIds: [],
      scheduledRunIds: [],
      runtimeEffectTargets: [],
      runtimeEffectIds: [],
    };
  }

  async completeProjectDeletion(lease: WorkspaceProjectDeletionLease) {
    const rows = [...this.workspaces.values()].filter((workspace) => workspace.projectId === lease.projectId);
    for (const workspace of rows) this.workspaces.delete(workspace.id);
    return rows.length;
  }

  async inspectProjectDeletionState(lease: WorkspaceProjectDeletionLease) {
    return {
      runtimeCount: [...this.workspaces.values()].filter((workspace) => workspace.projectId === lease.projectId).length,
      runtimeEffectsDrained: true,
      workspaceIds: [...this.projectDeletionWorkspaceIds],
      persistentVolumeClaims: [],
      serverDeploymentIds: [],
      scheduledRunIds: [],
      runtimeEffectTargets: [],
      runtimeEffectIds: [],
    };
  }
}

class TestK8sClient implements WorkspaceK8sClient {
  readonly namespaces: string[] = [];
  readonly objects = new Map<string, K8sObject>();

  async apply(object: K8sObject) {
    this.objects.set(`${object.metadata.namespace}:${object.kind}:${object.metadata.name}`, object);
    return object;
  }

  async delete(kind: string, namespace: string, name: string) {
    this.objects.delete(`${namespace}:${kind}:${name}`);
    this.namespaces.push(namespace);
  }

  async get(kind: string, namespace: string, name: string) {
    return this.objects.get(`${namespace}:${kind}:${name}`);
  }

  async getPod(namespace: string, name: string) {
    const pod = this.objects.get(`${namespace}:Pod:${name}`);
    return pod ? ({ ...pod, status: { conditions: [{ type: 'Ready', status: 'True' }] } } as K8sObject) : undefined;
  }

  async *streamPodLogs(namespace: string, name: string) {
    yield `logs:${namespace}:${name}:ready`;
  }

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

class TestEventBus implements EventBus {
  async publish(_event: WorkspaceEvent) {}
}

function restoreEnv(previous: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = previous[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function manager(store = new TestWorkspaceStore(), k8s = new TestK8sClient()) {
  return { store, k8s, manager: new WorkspaceManager(store, k8s, new TestEventBus(), 'agent-secret') };
}

describe('workspace-manager app', () => {
  const previous: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  afterEach(() => restoreEnv(previous));

  for (const key of ENV_KEYS) {
    previous[key] = process.env[key];
  }

  it('uses WORKSPACE_RUNTIME_NAMESPACE for lifecycle routes that do not carry a request body', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);

    await app.inject({
      method: 'POST',
      url: '/workspaces/start',
      payload: {
        namespace: 'prod-workspaces',
        orgId: 'org_1',
        projectId: 'project_1',
        workspaceId: 'workspace_1',
        image: 'agent:test',
      },
    });

    const logs = await app.inject({ method: 'GET', url: '/workspaces/workspace_1/logs' });
    const stopped = await app.inject({ method: 'POST', url: '/workspaces/workspace_1/stop' });

    expect(logs.json()).toEqual({ logs: ['logs:prod-workspaces:workspace-workspace_1:ready'] });
    expect(stopped.statusCode).toBe(200);
    expect(runtime.k8s.namespaces).toContain('prod-workspaces');

    await app.close();
  });

  it('returns 404 (not 500) when acting on a workspace it has no record of', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);

    const stopped = await app.inject({ method: 'POST', url: '/workspaces/missing-workspace/stop' });

    expect(stopped.statusCode).toBe(404);
    expect(stopped.json().code).toBe('WORKSPACE_NOT_FOUND');

    await app.close();
  });

  it('preserves a proven reconfigure rollback flag across the internal HTTP boundary', async () => {
    const runtime = manager();
    runtime.manager.reconfigureServerDeployment = async () => {
      throw Object.assign(new Error('RESERVED_VM_RECONFIGURE_NOT_READY'), {
        code: 'RESERVED_VM_RECONFIGURE_NOT_READY',
        statusCode: 503,
        rolledBack: true,
      });
    };
    const app = buildWorkspaceManagerApp(runtime.manager);

    const response = await app.inject({
      method: 'POST',
      url: '/server-deployments/dep-rollback/reconfigure',
      payload: {
        runtimeKind: 'autoscale',
        operationId: 'operation-rollback-test',
        fencingToken: 1,
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: 'RESERVED_VM_RECONFIGURE_NOT_READY',
      rolledBack: true,
    });

    await app.close();
  });

  it('validates and forwards the in-place redeploy release fields', async () => {
    const runtime = manager();
    let received: Parameters<typeof runtime.manager.reconfigureServerDeployment>[0] | undefined;
    runtime.manager.reconfigureServerDeployment = async (input) => {
      received = input;
      return {
        ready: true,
        readyReplicas: 1,
        name: 'app-dep-redeploy',
        persistentVolumeClaimName: 'reserved-data-dep-redeploy',
        appliedFencingToken: input.fencingToken,
      };
    };
    const app = buildWorkspaceManagerApp(runtime.manager);

    const response = await app.inject({
      method: 'POST',
      url: '/server-deployments/dep-redeploy/reconfigure',
      payload: {
        runtimeKind: 'reserved-vm',
        reservedVmTier: 'dedicated-1',
        image: 'registry.example/app@sha256:new',
        command: ['node', 'server.js'],
        args: ['--production'],
        env: { RELEASE: 'next' },
        healthPath: '/ready',
        nixGenerationRef: 'generation-2026-08',
        operationId: 'operation-redeploy',
        fencingToken: 9,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(received).toMatchObject({
      deploymentId: 'dep-redeploy',
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-1',
      image: 'registry.example/app@sha256:new',
      command: ['node', 'server.js'],
      args: ['--production'],
      env: { RELEASE: 'next' },
      healthPath: '/ready',
      nixGenerationRef: 'generation-2026-08',
      operationId: 'operation-redeploy',
      fencingToken: 9,
    });

    await app.close();
  });

  it('validates and forwards a fenced Reserved VM suspension', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'reserved-runtimes';
    const runtime = manager();
    let received: Parameters<typeof runtime.manager.suspendReservedVmDeployment>[0] | undefined;
    runtime.manager.suspendReservedVmDeployment = async (input) => {
      received = input;
      return {
        suspended: true,
        name: 'app-dep-suspend',
        persistentVolumeClaimName: 'reserved-data-dep-suspend',
        appliedFencingToken: input.fencingToken,
      };
    };
    const app = buildWorkspaceManagerApp(runtime.manager);

    const response = await app.inject({
      method: 'POST',
      url: '/server-deployments/dep-suspend/suspend',
      payload: {
        operationId: 'billing-stop:period-2026-08',
        fencingToken: 14,
        readyTimeoutMs: 5_000,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      suspended: true,
      name: 'app-dep-suspend',
      persistentVolumeClaimName: 'reserved-data-dep-suspend',
      appliedFencingToken: 14,
    });
    expect(received).toEqual({
      deploymentId: 'dep-suspend',
      namespace: 'reserved-runtimes',
      operationId: 'billing-stop:period-2026-08',
      fencingToken: 14,
      readyTimeoutMs: 5_000,
    });

    await app.close();
  });

  it('freezes writers and verifies every Service, Pod, Secret and PVC deletion through fenced routes', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);
    const workspaceId = 'workspace-purge-routes';
    const lease = { planId: 'plan-purge-routes', ownerToken: 'owner-token-purge-routes' };

    try {
      const started = await app.inject({
        method: 'POST',
        url: '/workspaces/start',
        payload: {
          namespace: 'ignored-by-manager',
          orgId: 'org_1',
          projectId: 'project_1',
          workspaceId,
          image: 'agent:test',
        },
      });
      expect(started.statusCode).toBe(200);

      const frozen = await app.inject({
        method: 'POST',
        url: `/workspaces/${workspaceId}/freeze`,
        payload: lease,
      });
      expect(frozen.statusCode).toBe(200);
      expect(runtime.store.workspaces.get(workspaceId)).toMatchObject({
        status: 'STOPPED',
        purgeFrozen: true,
        purgePlanId: lease.planId,
      });
      expect(runtime.k8s.objects.has(`prod-workspaces:Service:workspace-${workspaceId}`)).toBe(false);
      expect(runtime.k8s.objects.has(`prod-workspaces:Pod:workspace-${workspaceId}`)).toBe(false);
      expect(runtime.k8s.objects.has(`prod-workspaces:Secret:agent-token-${workspaceId}`)).toBe(false);
      expect(runtime.k8s.objects.has(`prod-workspaces:PersistentVolumeClaim:pvc-${workspaceId}`)).toBe(true);

      const unsafeLegacyPurge = await app.inject({
        method: 'POST',
        url: `/workspaces/${workspaceId}/purge`,
        payload: lease,
      });
      expect(unsafeLegacyPurge.statusCode).toBe(400);
      expect(runtime.k8s.objects.has(`prod-workspaces:PersistentVolumeClaim:pvc-${workspaceId}`)).toBe(true);

      // The project-scoped volume sub-saga owns PVC→PV→provider deletion. The
      // legacy workspace purge may only commit the row after consuming it.
      runtime.k8s.objects.delete(`prod-workspaces:PersistentVolumeClaim:pvc-${workspaceId}`);
      const volumeReceipt = {
        schemaVersion: 'project-volume-erasure-receipt-v1' as const,
        operationId: `account-purge:${lease.planId}:project_1`,
        projectId: 'project_1',
        organizationId: 'org_1',
        inventoryHash: 'a'.repeat(64),
        verificationHash: 'b'.repeat(64),
        finalScanHash: 'c'.repeat(64),
        quiescenceHash: 'd'.repeat(64),
        entryCount: 1,
        erasedEntryCount: 1,
        alreadyAbsentEntryCount: 0,
        persistentVolumeClaimsAbsent: true as const,
        persistentVolumesAbsent: true as const,
        providerVolumesAbsent: true as const,
      };

      const purged = await app.inject({
        method: 'POST',
        url: `/workspaces/${workspaceId}/purge`,
        payload: { ...lease, volumeReceipt },
      });
      expect(purged.statusCode).toBe(200);
      expect(purged.json()).toMatchObject({ status: 'DELETED', purgeFrozen: true });
      expect(runtime.k8s.objects.has(`prod-workspaces:PersistentVolumeClaim:pvc-${workspaceId}`)).toBe(false);
      expect([...runtime.store.purgeEffects.values()]).toEqual(
        expect.arrayContaining([expect.objectContaining({ deleted: true, verifiedAbsent: true })]),
      );
    } finally {
      await app.close();
    }
  });

  it('validates the permanent-deletion lease and returns a live project-wide workspace absence proof', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);
    const projectId = 'project-permanent-route';
    const workspaceId = 'workspace-permanent-route';
    const lease = {
      operationId: 'operation-permanent-route',
      ownerToken: 'owner-token-permanent-route-1234',
      fencingToken: '3',
      requestHash: 'a'.repeat(64),
      scopeHash: 'b'.repeat(64),
      projectId,
      expectedOrganizationId: 'org-permanent-route',
    };

    try {
      const started = await app.inject({
        method: 'POST',
        url: '/workspaces/start',
        payload: {
          orgId: lease.expectedOrganizationId,
          projectId,
          workspaceId,
          image: 'agent:test',
        },
      });
      expect(started.statusCode).toBe(200);

      runtime.manager.purgeProjectWorkspaces = async (_namespace, incomingLease) => {
        runtime.k8s.objects.clear();
        runtime.store.workspaces.clear();
        return {
          schemaVersion: 'workspace-project-erasure-v3',
          projectId: incomingLease.projectId,
          organizationId: incomingLease.expectedOrganizationId,
          databaseInventoryRetained: true,
          runtimeEffectsDrained: true,
          kubernetes: {
            deploymentsAbsent: true,
            replicaSetsAbsent: true,
            podsAbsent: true,
            servicesAbsent: true,
            endpointsAbsent: true,
            endpointSlicesAbsent: true,
            ingressesAbsent: true,
            ownedRuntimeSecretsAbsent: true,
            persistentVolumeClaimsAbsent: true,
          },
          volumes: {
            schemaVersion: 1,
            inventoryHash: 'a'.repeat(64),
            verificationHash: 'b'.repeat(64),
            entryCount: 1,
            erasedEntryCount: 1,
            alreadyAbsentEntryCount: 0,
            sharedExclusionCount: 0,
            persistentVolumeClaimsAbsent: true,
            persistentVolumesAbsent: true,
            providerVolumesAbsent: true,
          },
        };
      };
      runtime.manager.verifyProjectWorkspacesAbsent = runtime.manager.purgeProjectWorkspaces.bind(runtime.manager);

      const wrongScope = await app.inject({
        method: 'POST',
        url: '/projects/other-project/permanent-delete/workspaces/purge',
        payload: lease,
      });
      expect(wrongScope.statusCode).toBe(409);
      expect(wrongScope.json()).toMatchObject({ code: 'WORKSPACE_PROJECT_DELETION_SCOPE_INVALID' });

      const purged = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/permanent-delete/workspaces/purge`,
        payload: lease,
      });
      expect(purged.statusCode).toBe(200);
      expect(purged.json()).toEqual({
        schemaVersion: 'workspace-project-erasure-v3',
        projectId,
        organizationId: lease.expectedOrganizationId,
        databaseInventoryRetained: true,
        runtimeEffectsDrained: true,
        kubernetes: {
          deploymentsAbsent: true,
          replicaSetsAbsent: true,
          podsAbsent: true,
          servicesAbsent: true,
          endpointsAbsent: true,
          endpointSlicesAbsent: true,
          ingressesAbsent: true,
          ownedRuntimeSecretsAbsent: true,
          persistentVolumeClaimsAbsent: true,
        },
        volumes: {
          schemaVersion: 1,
          inventoryHash: 'a'.repeat(64),
          verificationHash: 'b'.repeat(64),
          entryCount: 1,
          erasedEntryCount: 1,
          alreadyAbsentEntryCount: 0,
          sharedExclusionCount: 0,
          persistentVolumeClaimsAbsent: true,
          persistentVolumesAbsent: true,
          providerVolumesAbsent: true,
        },
      });
      expect(runtime.store.workspaces.size).toBe(0);
      expect(runtime.k8s.objects.size).toBe(0);

      const verified = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/permanent-delete/workspaces/verify`,
        payload: lease,
      });
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toEqual(purged.json());
    } finally {
      await app.close();
    }
  });

  it('negotiates French errors without translating identifiers or payload data', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);

    const stopped = await app.inject({
      method: 'POST',
      url: '/workspaces/missing-workspace/stop',
      headers: { 'accept-language': 'en;q=0.4, fr-FR;q=0.9' },
    });

    expect(stopped.statusCode).toBe(404);
    expect(stopped.headers['content-language']).toBe('fr');
    expect(stopped.headers.vary).toContain('Accept-Language');
    expect(stopped.json()).toMatchObject({
      code: 'WORKSPACE_NOT_FOUND',
      message: 'Espace de travail introuvable.',
    });

    await app.close();
  });

  it('requires the shared secret on control-plane routes when one is configured', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    // Control plane now requires the DEDICATED secret (no PREVIEW_PROXY fallback).
    process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'cp-secret';
    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);

    const unauthorized = await app.inject({
      method: 'GET',
      url: '/workspaces/some-ws/agent-token',
    });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json().code).toBe('WORKSPACE_MANAGER_UNAUTHORIZED');

    const authorized = await app.inject({
      method: 'GET',
      url: '/workspaces/some-ws/agent-token',
      headers: { authorization: 'Bearer cp-secret' },
    });
    // Passes auth; agent-token mints regardless of whether the workspace record exists.
    expect(authorized.statusCode).toBe(200);

    // /health stays open for liveness probes.
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    await app.close();
  });

  it('exposes preview proxy agent resolution only with the shared secret', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    process.env.PREVIEW_PROXY_SHARED_SECRET = 'preview-secret\n';
    process.env.WORKSPACE_AGENT_URL_TEMPLATE = 'http://workspace-{workspaceId}.{namespace}.svc:8080';

    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);

    await runtime.store.create({
      id: 'ws_1',
      orgId: 'org_1',
      projectId: 'project_1',
      plan: 'free',
      status: 'RUNNING',
      pvcName: 'pvc-ws_1',
      podName: 'workspace-ws_1',
      serviceName: 'workspace-ws_1',
      agentTokenSecretName: 'agent-token-ws_1',
    });

    const unauthorized = await app.inject({ method: 'GET', url: '/internal/workspaces/ws_1/agent' });
    const authorized = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/ws_1/agent',
      headers: { authorization: 'Bearer preview-secret' },
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json()).toMatchObject({ baseUrl: 'http://workspace-ws_1.prod-workspaces.svc:8080' });
    expect(authorized.json().token).toEqual(expect.any(String));

    await app.close();
  });

  it('rejects an agent resolution whose orgId does not own the workspace', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    process.env.PREVIEW_PROXY_SHARED_SECRET = 'preview-secret\n';
    process.env.WORKSPACE_AGENT_URL_TEMPLATE = 'http://workspace-{workspaceId}.{namespace}.svc:8080';
    delete process.env.WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT;

    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);

    await runtime.store.create({
      id: 'ws_1',
      orgId: 'org_1',
      projectId: 'project_1',
      plan: 'free',
      status: 'RUNNING',
      pvcName: 'pvc-ws_1',
      podName: 'workspace-ws_1',
      serviceName: 'workspace-ws_1',
      agentTokenSecretName: 'agent-token-ws_1',
    });

    const headers = { authorization: 'Bearer preview-secret' };

    // Matching org → 200, even with enforcement off.
    const ownOrg = await app.inject({ method: 'GET', url: '/internal/workspaces/ws_1/agent?orgId=org_1', headers });
    expect(ownOrg.statusCode).toBe(200);

    // Mismatched org → 403 (cross-tenant denial), regardless of the flag.
    const otherOrg = await app.inject({ method: 'GET', url: '/internal/workspaces/ws_1/agent?orgId=org_2', headers });
    expect(otherOrg.statusCode).toBe(403);
    expect(otherOrg.json().code).toBe('WORKSPACE_TENANT_FORBIDDEN');

    // Enforcement on + no orgId supplied → 403 (fail closed).
    process.env.WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT = 'true';

    const noOrg = await app.inject({ method: 'GET', url: '/internal/workspaces/ws_1/agent', headers });
    expect(noOrg.statusCode).toBe(403);

    delete process.env.WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT;
    await app.close();
  });

  describe('database rollback k8s bridge (Phase 2)', () => {
    const cnpgCluster = {
      apiVersion: 'postgresql.cnpg.io/v1',
      kind: 'Cluster',
      metadata: { name: 'db-p1', namespace: 'project-databases' },
      spec: { instances: 1 },
    };

    it('rejects a CSI-producing Cluster on the generic apply route', async () => {
      const runtime = manager();
      const app = buildWorkspaceManagerApp(runtime.manager);
      const res = await app.inject({ method: 'POST', url: '/databases/apply', payload: { manifest: cnpgCluster } });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('DB_CSI_EFFECT_REQUIRED');
      expect(runtime.k8s.objects.has('project-databases:Cluster:db-p1')).toBe(false);
      await app.close();
    });

    it('applies a CSI-producing CNPG Cluster only through the durable project effect seam', async () => {
      const runtime = manager();
      const app = buildWorkspaceManagerApp(runtime.manager);
      const manifest = {
        ...cnpgCluster,
        metadata: {
          ...cnpgCluster.metadata,
          labels: {
            'vibecore.ai/project-id': 'project-1',
            'vibecore.ai/org-id': 'organization-1',
          },
        },
        spec: { instances: 2, storage: { size: '10Gi' } },
      };
      const res = await app.inject({
        method: 'POST',
        url: '/databases/apply-csi',
        payload: {
          manifest,
          projectId: 'project-1',
          expectedOrganizationId: 'organization-1',
          action: 'CNPG_PROVISION',
          resourceId: 'cnpg-provision:project-1:development',
          targets: [
            { namespace: 'project-databases', pvcName: 'db-p1-2' },
            { namespace: 'project-databases', pvcName: 'db-p1-1' },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ applied: true, csiEvidencePersisted: true });
      expect(runtime.k8s.objects.has('project-databases:Cluster:db-p1')).toBe(true);
      expect(runtime.store.csiProvisionEffects).toEqual([
        {
          projectId: 'project-1',
          expectedOrganizationId: 'organization-1',
          action: 'CNPG_PROVISION',
          resourceId: 'cnpg-provision:project-1:development',
          targets: [
            { namespace: 'project-databases', pvcName: 'db-p1-1' },
            { namespace: 'project-databases', pvcName: 'db-p1-2' },
          ],
        },
      ]);
      await app.close();
    });

    it.each([
      {
        name: 'tenant labels disagree',
        patch: { labels: { 'vibecore.ai/project-id': 'other', 'vibecore.ai/org-id': 'organization-1' } },
        code: 'DB_CSI_TENANT_LABELS_FORBIDDEN',
      },
      {
        name: 'a PVC target is omitted',
        targets: [{ namespace: 'project-databases', pvcName: 'db-p1-1' }],
        code: 'DB_CSI_TARGETS_FORBIDDEN',
      },
      {
        name: 'the operation id is not deterministic',
        resourceId: 'cnpg-provision:project-1:staging',
        code: 'DB_CSI_RESOURCE_ID_FORBIDDEN',
      },
      {
        name: 'the manifest can create undeclared WAL PVCs',
        spec: { instances: 2, walStorage: { size: '10Gi' } },
        code: 'DB_CSI_UNDECLARED_VOLUME_SHAPE',
      },
    ])('rejects a CSI-producing CNPG Cluster when $name', async ({ patch, targets, resourceId, spec, code }) => {
      const runtime = manager();
      const app = buildWorkspaceManagerApp(runtime.manager);
      const manifest = {
        ...cnpgCluster,
        metadata: {
          ...cnpgCluster.metadata,
          labels: patch?.labels ?? {
            'vibecore.ai/project-id': 'project-1',
            'vibecore.ai/org-id': 'organization-1',
          },
        },
        spec: spec ?? { instances: 2 },
      };
      const res = await app.inject({
        method: 'POST',
        url: '/databases/apply-csi',
        payload: {
          manifest,
          projectId: 'project-1',
          expectedOrganizationId: 'organization-1',
          action: 'CNPG_PROVISION',
          resourceId: resourceId ?? 'cnpg-provision:project-1:development',
          targets: targets ?? [
            { namespace: 'project-databases', pvcName: 'db-p1-1' },
            { namespace: 'project-databases', pvcName: 'db-p1-2' },
          ],
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe(code);
      expect(runtime.store.csiProvisionEffects).toEqual([]);
      expect(runtime.k8s.objects.has('project-databases:Cluster:db-p1')).toBe(false);
      await app.close();
    });

    it('allows a project-owned legacy Database CR but refuses shared Pooler mutation', async () => {
      const runtime = manager();
      const app = buildWorkspaceManagerApp(runtime.manager);
      const database = await app.inject({
        method: 'POST',
        url: '/databases/apply',
        payload: {
          manifest: {
            ...cnpgCluster,
            kind: 'Database',
            metadata: {
              name: 'db-p1',
              namespace: 'project-databases',
              labels: { 'vibecore.ai/project-id': 'p1', 'vibecore.ai/org-id': 'org-1' },
            },
          },
        },
      });
      expect(database.statusCode).toBe(200);

      const pooler = await app.inject({
        method: 'POST',
        url: '/databases/apply',
        payload: { manifest: { ...cnpgCluster, kind: 'Pooler' } },
      });
      expect(pooler.statusCode).toBe(403);
      await app.close();
    });

    it('rejects a forbidden kind', async () => {
      const app = buildWorkspaceManagerApp(manager().manager);
      const res = await app.inject({
        method: 'POST',
        url: '/databases/apply',
        payload: { manifest: { ...cnpgCluster, kind: 'Pod' } },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it('rejects the wrong namespace', async () => {
      const app = buildWorkspaceManagerApp(manager().manager);
      const res = await app.inject({
        method: 'POST',
        url: '/databases/apply',
        payload: { manifest: { ...cnpgCluster, metadata: { name: 'db-p1', namespace: 'kube-system' } } },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it('rejects a non-CNPG apiVersion even for an allowed kind', async () => {
      const app = buildWorkspaceManagerApp(manager().manager);
      const res = await app.inject({
        method: 'POST',
        url: '/databases/apply',
        payload: { manifest: { ...cnpgCluster, apiVersion: 'v1' } },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it('404s a missing resource and 403s a forbidden get', async () => {
      const app = buildWorkspaceManagerApp(manager().manager);
      const missing = await app.inject({
        method: 'GET',
        url: '/databases/resource?kind=Cluster&namespace=project-databases&name=nope',
      });
      expect(missing.statusCode).toBe(404);
      const forbidden = await app.inject({
        method: 'GET',
        url: '/databases/resource?kind=Secret&namespace=project-databases&name=x',
      });
      expect(forbidden.statusCode).toBe(403);
      await app.close();
    });
  });
});
