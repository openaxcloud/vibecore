import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import type { WorkspaceEvent } from '@vibecore/workspace-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JsonWorkspaceStore,
  WorkspaceManager,
  detectPodTerminalFailure,
  resolveAgentBaseUrl,
  unschedulableGraceMs,
  type EventBus,
  type WorkspaceProjectVolumeCandidate,
  type WorkspaceProjectVolumeErasurePlan,
  type WorkspaceProjectDeletionLease,
  type WorkspaceRecord,
  type WorkspaceStore,
} from './manager.js';
import { StaticProjectVolumeProviderResolver } from './project-volume-erasure-adapters.js';
import type {
  ExactKubernetesDelete,
  ExactProviderVolumeDelete,
  ProjectPersistentVolume,
  ProjectPersistentVolumeClaim,
  ProjectStorageClass,
  ProjectVolumeErasureEntryEvidence,
  ProjectVolumeErasureEvidence,
  ProjectVolumeErasureInventory,
  ProjectVolumeKubernetesAdapter,
  ProjectVolumeProviderAdapter,
} from './project-volume-erasure.js';

class TestWorkspaceK8sClient implements WorkspaceK8sClient {
  readonly objects = new Map<string, K8sObject>();
  readonly events: string[] = [];
  readonly resourceVersions = new Map<string, number>();
  readonly generations = new Map<string, number>();

  async apply(object: K8sObject) {
    const key = `${object.metadata.namespace ?? 'default'}:${object.kind}:${object.metadata.name}`;
    const existed = this.objects.has(key);
    this.objects.set(key, object);
    this.resourceVersions.set(key, (this.resourceVersions.get(key) ?? (existed ? 1 : 0)) + 1);
    if (object.kind === 'Deployment') {
      this.generations.set(key, (this.generations.get(key) ?? (existed ? 1 : 0)) + 1);
    }
    this.events.push(`apply:${object.kind}:${object.metadata.name}`);

    return object;
  }

  async applyFenced(object: K8sObject, expectedResourceVersion?: string) {
    const key = `${object.metadata.namespace ?? 'default'}:${object.kind}:${object.metadata.name}`;
    const existing = this.objects.get(key);
    const actualResourceVersion = this.resourceVersions.get(key) ?? (existing ? 1 : undefined);

    if (
      (!expectedResourceVersion && existing) ||
      (expectedResourceVersion && String(actualResourceVersion) !== expectedResourceVersion)
    ) {
      throw Object.assign(new Error('Conflict'), { code: 409 });
    }

    await this.apply(object);
    return (await this.get(object.kind, object.metadata.namespace ?? 'default', object.metadata.name))!;
  }

  async delete(kind: string, namespace: string, name: string) {
    const key = `${namespace}:${kind}:${name}`;
    this.objects.delete(key);
    this.resourceVersions.delete(key);
    this.generations.delete(key);
    this.events.push(`delete:${kind}:${name}`);
  }

  async deleteFenced(kind: string, namespace: string, name: string, expectedResourceVersion: string) {
    const key = `${namespace}:${kind}:${name}`;

    if (String(this.resourceVersions.get(key) ?? 1) !== expectedResourceVersion) {
      throw Object.assign(new Error('Conflict'), { code: 409 });
    }

    await this.delete(kind, namespace, name);
  }

  async get(kind: string, namespace: string, name: string) {
    const key = `${namespace}:${kind}:${name}`;
    const object = this.objects.get(key);

    if (!object) {
      return undefined;
    }

    return {
      ...object,
      metadata: {
        ...object.metadata,
        resourceVersion: String(this.resourceVersions.get(key) ?? 1),
        ...(kind === 'Deployment' ? { generation: this.generations.get(key) ?? 1 } : {}),
      },
    };
  }

  async getPod(namespace: string, name: string) {
    const pod = this.objects.get(`${namespace}:Pod:${name}`);

    if (!pod) {
      return undefined;
    }

    return {
      ...pod,
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
        allocatable: { cpu: '4', memory: '16Gi' },
      },
    } as K8sObject;
  }

  async *streamPodLogs(namespace: string, name: string) {
    yield `logs:${namespace}:${name}:ready`;
  }

  async scale(kind: string, namespace: string, name: string, replicas: number) {
    const object = this.objects.get(`${namespace}:${kind}:${name}`);

    if (!object) {
      throw Object.assign(new Error(`NotFound: ${kind}/${name}`), { code: 1 });
    }

    (object as any).spec = { ...(object as any).spec, replicas };

    // A scale-up to >=1 flips readiness on (models a pod that comes Ready).
    (object as any).status = { ...(object as any).status, replicas, readyReplicas: replicas >= 1 ? replicas : 0 };
    this.events.push(`scale:${kind}:${name}:${replicas}`);
  }

  async annotate(kind: string, namespace: string, name: string, key: string, value: string) {
    const object = this.objects.get(`${namespace}:${kind}:${name}`);

    if (!object) {
      throw Object.assign(new Error(`NotFound: ${kind}/${name}`), { code: 1 });
    }

    object.metadata.annotations = { ...(object.metadata.annotations ?? {}), [key]: value };
    this.events.push(`annotate:${kind}:${name}:${key}`);
  }

  async listByLabel(kind: string, namespace: string, labelSelector: string) {
    const [labelKey, labelValue] = labelSelector.split('=');

    return [...this.objects.values()].filter(
      (object) =>
        object.kind === kind &&
        (object.metadata.namespace ?? 'default') === namespace &&
        object.metadata.labels?.[labelKey] !== undefined &&
        (labelValue === undefined || object.metadata.labels[labelKey] === labelValue),
    );
  }
}

class TestWorkspaceStore implements WorkspaceStore {
  readonly workspaces = new Map<string, WorkspaceRecord>();
  readonly purgeEffects = new Map<string, Record<string, unknown>>();
  readonly projectDeletionPersistentVolumeClaims: string[] = [];
  readonly projectDeletionServerDeploymentIds: string[] = [];
  readonly projectDeletionWorkspaceIds: string[] = [];
  readonly projectDeletionScheduledRunIds: string[] = [];
  projectDeletionLeaseValid = true;
  volumePlan?: WorkspaceProjectVolumeErasurePlan;

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
    return effect(async () => this.assertProjectDeletionLease());
  }

  async executeDeploymentProvisionEffect<T>(
    _input: string | { deploymentId: string; projectId: string; expectedOrganizationId: string },
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ) {
    return effect(async () => this.assertProjectDeletionLease());
  }

  async executeScheduledRunProvisionEffect<T>(
    _input: { runId: string; projectId: string; expectedOrganizationId: string },
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ) {
    return effect(async () => this.assertProjectDeletionLease());
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

  async assertProjectDeletionLease() {
    if (!this.projectDeletionLeaseValid) {
      throw Object.assign(new Error('WORKSPACE_PROJECT_DELETION_LEASE_INVALID'), { statusCode: 409 });
    }
  }

  async acquireProjectDeletionFence(lease: WorkspaceProjectDeletionLease) {
    await this.assertProjectDeletionLease();
    const rows = [...this.workspaces.values()].filter((workspace) => workspace.projectId === lease.projectId);
    this.projectDeletionWorkspaceIds.splice(0, this.projectDeletionWorkspaceIds.length, ...rows.map(({ id }) => id));
    for (const workspace of rows) {
      this.workspaces.set(workspace.id, {
        ...workspace,
        purgeFrozen: true,
        purgePlanId: undefined,
        purgeFenceToken: lease.ownerToken,
        purgeFrozenAt: new Date().toISOString(),
      });
    }
    return {
      workspaces: rows.map((workspace) => this.workspaces.get(workspace.id)!),
      workspaceIds: [...this.projectDeletionWorkspaceIds],
      persistentVolumeClaims: [...this.projectDeletionPersistentVolumeClaims],
      serverDeploymentIds: [...this.projectDeletionServerDeploymentIds],
      scheduledRunIds: [...this.projectDeletionScheduledRunIds],
      runtimeEffectTargets: [],
      runtimeEffectIds: [],
    };
  }

  async completeProjectDeletion(lease: WorkspaceProjectDeletionLease) {
    await this.assertProjectDeletionLease();
    const rows = [...this.workspaces.values()].filter((workspace) => workspace.projectId === lease.projectId);
    if (rows.some((workspace) => !workspace.purgeFrozen || workspace.purgeFenceToken !== lease.ownerToken)) {
      throw new Error('WORKSPACE_PROJECT_DELETION_FENCE_LOST');
    }
    for (const workspace of rows) this.workspaces.delete(workspace.id);
    return rows.length;
  }

  async inspectProjectDeletionState(lease: WorkspaceProjectDeletionLease) {
    await this.assertProjectDeletionLease();
    return {
      runtimeCount: [...this.workspaces.values()].filter((workspace) => workspace.projectId === lease.projectId).length,
      runtimeEffectsDrained: true,
      workspaceIds: [...this.projectDeletionWorkspaceIds],
      persistentVolumeClaims: [...this.projectDeletionPersistentVolumeClaims],
      serverDeploymentIds: [...this.projectDeletionServerDeploymentIds],
      scheduledRunIds: [...this.projectDeletionScheduledRunIds],
      runtimeEffectTargets: [],
      runtimeEffectIds: [],
    };
  }

  async loadProjectVolumeErasure() {
    return this.volumePlan;
  }

  async prepareProjectVolumeErasure(
    lease: WorkspaceProjectDeletionLease,
    namespace: string,
    candidates: readonly WorkspaceProjectVolumeCandidate[],
  ) {
    this.volumePlan ??= {
      operationId: lease.operationId,
      projectId: lease.projectId,
      organizationId: lease.expectedOrganizationId,
      ownershipEpoch: 0,
      namespace,
      state: 'PREPARED',
      quiescenceSnapshot: {
        schemaVersion: 1,
        projectId: lease.projectId,
        organizationId: lease.expectedOrganizationId,
        ownershipEpoch: 0,
        effects: [],
      },
      quiescenceHash: 'a'.repeat(64),
      sourceSnapshot: {
        snapshotId: lease.operationId,
        completeness: 'all-active-references-for-candidate-claims',
        candidates,
        references: candidates.map((candidate, ordinal) => ({
          projectId: lease.projectId,
          organizationId: lease.expectedOrganizationId,
          referenceId: `test-reference-${ordinal}`,
          sourceKind: 'runtime-effect-target',
          namespace: candidate.namespace,
          pvcName: candidate.pvcName,
          ...(candidate.expectedPvcUid ? { expectedPvcUid: candidate.expectedPvcUid } : {}),
          allowLegacyUnlabelled: true,
        })),
      },
      targets: candidates.map((candidate, ordinal) => ({ ordinal, ...candidate })),
    };
    return this.volumePlan;
  }

  async recordProjectVolumeInventory(_lease: WorkspaceProjectDeletionLease, inventory: ProjectVolumeErasureInventory) {
    this.volumePlan = { ...this.volumePlan!, state: 'INVENTORIED', inventory };
    return this.volumePlan;
  }

  async markProjectVolumeErasing() {
    this.volumePlan = { ...this.volumePlan!, state: this.volumePlan!.state === 'VERIFIED' ? 'VERIFIED' : 'ERASING' };
    return this.volumePlan;
  }

  async recordProjectVolumeEntryEvidence(
    lease: WorkspaceProjectDeletionLease,
    ordinal: number,
    evidence: ProjectVolumeErasureEntryEvidence,
  ) {
    this.volumePlan = {
      ...this.volumePlan!,
      targets: this.volumePlan!.targets.map((target) =>
        target.ordinal === ordinal ? { ...target, evidence, verifiedFencingToken: lease.fencingToken } : target,
      ),
    };
    return this.volumePlan;
  }

  async completeProjectVolumeErasure(lease: WorkspaceProjectDeletionLease, evidence: ProjectVolumeErasureEvidence) {
    this.volumePlan = {
      ...this.volumePlan!,
      state: 'VERIFIED',
      evidence,
      verificationFencingToken: lease.fencingToken,
    };
    return this.volumePlan;
  }

  async assertProjectVolumeCreationQuiescence() {}

  async recordProjectVolumeFinalScan(
    lease: WorkspaceProjectDeletionLease,
    evidence: import('./project-volume-erasure.js').ProjectVolumeErasureFinalScanEvidence,
  ) {
    this.volumePlan = {
      ...this.volumePlan!,
      finalScanEvidence: evidence,
      finalScanFencingToken: lease.fencingToken,
    };
    return this.volumePlan;
  }
}

class TestProjectVolumeKubernetes implements ProjectVolumeKubernetesAdapter {
  readonly pvs = new Map<string, ProjectPersistentVolume>();

  constructor(private readonly k8s: TestWorkspaceK8sClient) {}

  async getPersistentVolumeClaim(namespace: string, name: string): Promise<ProjectPersistentVolumeClaim | undefined> {
    const object = await this.k8s.get('PersistentVolumeClaim', namespace, name);
    if (!object) return undefined;
    return {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name,
        namespace,
        uid: `uid-${name}`,
        resourceVersion: object.metadata.resourceVersion ?? '1',
        labels: object.metadata.labels,
      },
      spec: { volumeName: `pv-${name}`, storageClassName: 'test-csi' },
      status: { phase: 'Bound' },
    };
  }
  async getPersistentVolume(name: string) {
    return this.pvs.get(name);
  }
  async listPersistentVolumes() {
    for (const object of this.k8s.objects.values()) {
      if (object.kind !== 'PersistentVolumeClaim') continue;
      const namespace = object.metadata.namespace ?? 'workspaces';
      const name = object.metadata.name;
      const pvName = `pv-${name}`;
      if (!this.pvs.has(pvName)) {
        this.pvs.set(pvName, {
          apiVersion: 'v1',
          kind: 'PersistentVolume',
          metadata: {
            name: pvName,
            uid: `uid-${pvName}`,
            resourceVersion: '1',
          },
          spec: {
            claimRef: { namespace, name, uid: `uid-${name}` },
            storageClassName: 'test-csi',
            persistentVolumeReclaimPolicy: 'Delete',
            csi: { driver: 'test.csi.vibecore.ai', volumeHandle: `test/${namespace}/${name}` },
          },
          status: { phase: 'Bound' },
        });
      }
    }
    return [...this.pvs.values()];
  }
  async getStorageClass(): Promise<ProjectStorageClass> {
    return {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: { name: 'test-csi', uid: 'uid-test-csi', resourceVersion: '1' },
      provisioner: 'test.csi.vibecore.ai',
      reclaimPolicy: 'Delete',
    };
  }
  async deletePersistentVolumeClaim(namespace: string, name: string, _exact: ExactKubernetesDelete) {
    await this.k8s.delete('PersistentVolumeClaim', namespace, name);
  }
  async deletePersistentVolume(name: string) {
    this.pvs.delete(name);
  }
}

class TestProjectVolumeProvider implements ProjectVolumeProviderAdapter {
  readonly csiDriver = 'test.csi.vibecore.ai';
  async inspect() {
    return { exists: false as const };
  }
  async deleteExact(_input: ExactProviderVolumeDelete) {}
}

function testVolumeErasure(k8s: TestWorkspaceK8sClient) {
  return {
    kubernetes: new TestProjectVolumeKubernetes(k8s),
    providers: new StaticProjectVolumeProviderResolver([new TestProjectVolumeProvider()]),
  };
}

/*
 * Mirrors the Prisma store, whose create() rejects a duplicate id with a
 * unique-constraint violation. The plain TestWorkspaceStore (like the JSON
 * store) overwrites on create, which silently masked the reopen regression in
 * production — only this strict store reproduces it.
 */
class StrictTestWorkspaceStore extends TestWorkspaceStore {
  override async create(input: Omit<WorkspaceRecord, 'createdAt' | 'lastActiveAt'>) {
    if (this.workspaces.has(input.id)) {
      throw Object.assign(new Error('Unique constraint failed on the fields: (`id`)'), { code: 'P2002' });
    }

    return super.create(input);
  }
}

class TestEventBus implements EventBus {
  readonly events: WorkspaceEvent[] = [];

  async publish(event: WorkspaceEvent) {
    this.events.push(event);
  }
}

const input = {
  namespace: 'workspaces',
  orgId: 'org_1',
  projectId: 'project_1',
  workspaceId: 'workspace_1',
  image: 'agent:test',
  plan: 'pro' as const,
  env: { NODE_ENV: 'production' },
  allowedSecretKeys: ['NPM_TOKEN'],
  resourceLimits: { cpuMillicores: 1500, ramMb: 3072, storageGb: 30 },
};

describe('WorkspaceManager', () => {
  it('creates PVC, agent secret, Pod and Service with lifecycle events', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const events = new TestEventBus();
    const manager = new WorkspaceManager(new TestWorkspaceStore(), k8s, events, 'test-workspace-agent-secret');
    const workspace = await manager.startWorkspace(input);

    expect(workspace.status).toBe('RUNNING');
    expect(k8s.events).toEqual(
      expect.arrayContaining([
        'apply:PersistentVolumeClaim:pvc-workspace_1',
        'apply:Secret:agent-token-workspace_1',
        'apply:Pod:workspace-workspace_1',
        'apply:Service:workspace-workspace_1',
      ]),
    );
    expect(
      (k8s.objects.get('workspaces:PersistentVolumeClaim:pvc-workspace_1')?.spec?.resources as any).requests.storage,
    ).toBe('30Gi');
    expect(events.events.map((event) => event.type)).toContain('workspace.running');
  });

  it('permanently erases every project runtime row and labeled Kubernetes workspace object', async () => {
    const deletionInput = { ...input, workspaceId: 'workspace-1' };
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(
      store,
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
      undefined,
      testVolumeErasure(k8s),
    );
    await manager.startWorkspace(deletionInput);
    await k8s.apply({
      apiVersion: 'v1',
      kind: 'Endpoints',
      metadata: { namespace: deletionInput.namespace, name: `workspace-${deletionInput.workspaceId}` },
    });
    await k8s.apply({
      apiVersion: 'discovery.k8s.io/v1',
      kind: 'EndpointSlice',
      metadata: {
        namespace: deletionInput.namespace,
        name: `workspace-${deletionInput.workspaceId}-orphan-slice`,
        labels: { 'kubernetes.io/service-name': `workspace-${deletionInput.workspaceId}` },
      },
    });
    /* Simulate a crash after the Service disappeared but before its endpoint
     * descendants were garbage-collected. The durable Workspace id must still
     * make both descendants discoverable on retry. */
    k8s.objects.delete(`${deletionInput.namespace}:Service:workspace-${deletionInput.workspaceId}`);
    store.projectDeletionPersistentVolumeClaims.push('legacy-project-pvc');
    store.projectDeletionServerDeploymentIds.push('server-deployment-1');
    const serverLabels = {
      'vibecore.ai/project': deletionInput.projectId,
      'vibecore.ai/server-deploy': 'server-deployment-1',
    };
    for (const [kind, name, labels] of [
      ['Deployment', 'app-server-deployment-1', serverLabels],
      ['Pod', 'app-server-deployment-1-abc', serverLabels],
      ['Service', 'app-server-deployment-1', serverLabels],
      ['Ingress', 'app-server-deployment-1', serverLabels],
      ['Secret', 'app-secrets-server-deployment-1', { 'vibecore.ai/server-deploy': 'server-deployment-1' }],
      ['PersistentVolumeClaim', 'legacy-project-pvc', {}],
    ] as const) {
      await k8s.apply({ apiVersion: 'v1', kind, metadata: { namespace: deletionInput.namespace, name, labels } });
    }
    const cnpgVolumeCandidate = {
      namespace: 'project-databases',
      pvcName: 'project-1-development-1',
      expectedPvcUid: 'uid-project-1-development-1',
    } as const;
    await k8s.apply({
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        namespace: cnpgVolumeCandidate.namespace,
        name: cnpgVolumeCandidate.pvcName,
        labels: {
          'vibecore.ai/project-id': deletionInput.projectId,
          'vibecore.ai/org-id': deletionInput.orgId,
        },
      },
    });
    // More than the historical request batch size proves that replay cannot
    // loop forever over durable names whose Kubernetes objects are now absent.
    for (let ordinal = 0; ordinal < 30; ordinal += 1) {
      await k8s.apply({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          namespace: deletionInput.namespace,
          name: `orphan-project-pod-${ordinal}`,
          labels: { 'vibecore.ai/project-id': deletionInput.projectId },
        },
      });
    }
    const lease: WorkspaceProjectDeletionLease = {
      operationId: 'delete-operation-1',
      ownerToken: 'delete-owner-token-1234567890',
      fencingToken: '1',
      requestHash: 'a'.repeat(64),
      scopeHash: 'b'.repeat(64),
      projectId: deletionInput.projectId,
      expectedOrganizationId: deletionInput.orgId,
    };

    let proof = await manager.purgeProjectWorkspaces(
      deletionInput.namespace,
      lease,
      ['EFFECT_STARTED'],
      [cnpgVolumeCandidate],
    );
    expect(proof).toMatchObject({
      schemaVersion: 'workspace-project-erasure-progress-v1',
      phase: 'volume-erasure',
      processed: 1,
    });
    while (proof.schemaVersion === 'workspace-project-erasure-progress-v1') {
      proof = await manager.purgeProjectWorkspaces(
        deletionInput.namespace,
        lease,
        ['EFFECT_STARTED'],
        [cnpgVolumeCandidate],
      );
    }

    expect(proof).toMatchObject({
      schemaVersion: 'workspace-project-erasure-v3',
      projectId: deletionInput.projectId,
      organizationId: deletionInput.orgId,
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
        schemaVersion: 'project-volume-erasure-receipt-v1',
        entryCount: 4,
        erasedEntryCount: 3,
        alreadyAbsentEntryCount: 1,
        persistentVolumeClaimsAbsent: true,
        persistentVolumesAbsent: true,
        providerVolumesAbsent: true,
      },
    });
    expect(store.workspaces.size).toBe(0);
    expect(k8s.objects.size).toBe(0);
    expect(
      [...k8s.objects.values()].filter(
        (object) => object.metadata.labels?.['vibecore.ai/project-id'] === deletionInput.projectId,
      ),
    ).toHaveLength(0);
  });

  it('stops a permanent erasure immediately when the API lease is lost between Kubernetes effects', async () => {
    const deletionInput = { ...input, workspaceId: 'workspace-lease-loss' };
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(
      store,
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
      undefined,
      testVolumeErasure(k8s),
    );
    await manager.startWorkspace(deletionInput);
    const lease: WorkspaceProjectDeletionLease = {
      operationId: 'delete-operation-lost',
      ownerToken: 'delete-owner-token-lost-123456',
      fencingToken: '7',
      requestHash: 'c'.repeat(64),
      scopeHash: 'd'.repeat(64),
      projectId: deletionInput.projectId,
      expectedOrganizationId: deletionInput.orgId,
    };
    const originalDelete = k8s.delete.bind(k8s);
    let deleteCalls = 0;
    k8s.delete = async (kind, namespace, name) => {
      await originalDelete(kind, namespace, name);
      deleteCalls += 1;
      store.projectDeletionLeaseValid = false;
    };

    await expect(manager.purgeProjectWorkspaces(deletionInput.namespace, lease)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(deleteCalls).toBe(1);
    expect(store.workspaces.get(deletionInput.workspaceId)).toMatchObject({ purgeFrozen: true });
    expect(k8s.objects.size).toBeGreaterThan(0);
  });

  it('never runs the real agent-reachability fetch under vitest, even without the timeout env (keeps the root `vitest --run` suite fast)', async () => {
    /*
     * Regression guard for the CI flake: the repo-root `vitest --run` globs this
     * spec WITHOUT this package's vitest.config env (WORKSPACE_AGENT_REACHABLE_
     * TIMEOUT_MS=0), so startWorkspace() used to block the full 45s default on a
     * real fetch to a cluster DNS that can't resolve — ~16-minute suite, vitest
     * onTaskUpdate worker timeout, flaky deploys. Simulate that env-less run and
     * assert no network call happens (the manager auto-disables the probe under
     * VITEST). If the guard is removed this fails fast instead of going slow.
     */
    const previous = process.env.WORKSPACE_AGENT_REACHABLE_TIMEOUT_MS;
    delete process.env.WORKSPACE_AGENT_REACHABLE_TIMEOUT_MS;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      const k8s = new TestWorkspaceK8sClient();
      const manager = new WorkspaceManager(
        new TestWorkspaceStore(),
        k8s,
        new TestEventBus(),
        'test-workspace-agent-secret',
      );
      const workspace = await manager.startWorkspace(input);

      expect(workspace.status).toBe('RUNNING');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();

      if (previous === undefined) {
        delete process.env.WORKSPACE_AGENT_REACHABLE_TIMEOUT_MS;
      } else {
        process.env.WORKSPACE_AGENT_REACHABLE_TIMEOUT_MS = previous;
      }
    }
  });

  it('injects decrypted secret values into the agent Secret and references them as optional pod env', async () => {
    const k8s = new TestWorkspaceK8sClient();

    const manager = new WorkspaceManager(
      new TestWorkspaceStore(),
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
    );
    await manager.startWorkspace({ ...input, allowedSecrets: { NPM_TOKEN: 'tok_secret_value' } });

    const secret = k8s.objects.get('workspaces:Secret:agent-token-workspace_1') as any;
    expect(secret.stringData).toMatchObject({
      tokenSecret: 'test-workspace-agent-secret',
      NPM_TOKEN: 'tok_secret_value',
    });

    const pod = k8s.objects.get('workspaces:Pod:workspace-workspace_1') as any;
    const npmEnv = pod.spec.containers[0].env.find((entry: any) => entry.name === 'NPM_TOKEN');
    expect(npmEnv.valueFrom.secretKeyRef).toMatchObject({
      name: 'agent-token-workspace_1',
      key: 'NPM_TOKEN',
      optional: true,
    });
  });

  it('recreates the pod when reopening with a changed (immutable) spec instead of failing the start', async () => {
    /*
     * Reproduces the live bug: a user adds a project secret / DATABASE_URL, the
     * api folds it into the pod env, and the next start re-applies the Pod. K8s
     * forbids in-place env edits on a running pod → the whole start used to fail
     * and the secret never reached the workspace. The manager must instead
     * delete + recreate the pod so the new env takes effect.
     */
    class ImmutableOnUpdateK8sClient extends TestWorkspaceK8sClient {
      async apply(object: K8sObject) {
        const key = `${object.metadata.namespace ?? 'default'}:${object.kind}:${object.metadata.name}`;

        if (object.kind === 'Pod' && this.objects.has(key)) {
          throw Object.assign(
            new Error(
              'Command failed: kubectl apply\nThe Pod "workspace-workspace_1" is invalid: spec: Forbidden: ' +
                'pod updates may not change fields other than `spec.containers[*].image`',
            ),
            {
              stderr:
                'The Pod "workspace-workspace_1" is invalid: spec: Forbidden: pod updates may not change fields other than `spec.containers[*].image`',
            },
          );
        }

        return super.apply(object);
      }
    }

    const k8s = new ImmutableOnUpdateK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    // First open: pod is created normally.
    await manager.startWorkspace(input);

    // Reopen with a newly-added secret → pod spec (env) changes → apply is forbidden.
    const reopened = await manager.startWorkspace({
      ...input,
      allowedSecrets: { DATABASE_URL: 'postgres://db' },
    });

    expect(reopened.status).toBe('RUNNING');

    // The pod was recreated (delete then a fresh apply), not left un-updated.
    const podApplies = k8s.events.filter((event) => event === 'apply:Pod:workspace-workspace_1').length;
    const podDeletes = k8s.events.filter((event) => event === 'delete:Pod:workspace-workspace_1').length;
    expect(podDeletes).toBe(1);
    expect(podApplies).toBe(2);

    // Recreate order: the delete must precede the successful re-apply.
    const lastDelete = k8s.events.lastIndexOf('delete:Pod:workspace-workspace_1');
    const lastApply = k8s.events.lastIndexOf('apply:Pod:workspace-workspace_1');
    expect(lastDelete).toBeLessThan(lastApply);

    // The new secret reached the pod env, and the PVC (data) was never re-applied/deleted.
    const pod = k8s.objects.get('workspaces:Pod:workspace-workspace_1') as any;
    const dbEnv = pod.spec.containers[0].env.find((entry: any) => entry.name === 'DATABASE_URL');
    expect(dbEnv?.valueFrom?.secretKeyRef).toMatchObject({ name: 'agent-token-workspace_1', key: 'DATABASE_URL' });
    expect(k8s.events.filter((event) => event === 'delete:PersistentVolumeClaim:pvc-workspace_1')).toHaveLength(0);
  });

  it('leaves the warm pod untouched on an unchanged reopen (apply is a no-op, no recreate)', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const manager = new WorkspaceManager(
      new TestWorkspaceStore(),
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
    );

    await manager.startWorkspace(input);
    await manager.startWorkspace(input);

    // No immutable change → the fake apply just overwrites; the pod is never deleted.
    expect(k8s.events.filter((event) => event === 'delete:Pod:workspace-workspace_1')).toHaveLength(0);
  });

  it('stops, restarts and fully deletes workspace runtime resources', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');
    await manager.startWorkspace(input);
    expect((await manager.stopWorkspace('workspaces', input.workspaceId)).status).toBe('STOPPED');
    expect((await manager.restartWorkspace(input)).status).toBe('RUNNING');
    expect((await manager.deleteWorkspace('workspaces', input.workspaceId)).status).toBe('DELETED');
    expect(k8s.events).toEqual(
      expect.arrayContaining([
        'delete:Service:workspace-workspace_1',
        'delete:Pod:workspace-workspace_1',
        'delete:Secret:agent-token-workspace_1',
        'delete:PersistentVolumeClaim:pvc-workspace_1',
      ]),
    );
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(false);
    expect(k8s.objects.has('workspaces:Secret:agent-token-workspace_1')).toBe(false);
  });

  it('re-provisions a fresh pod when reopening a garbage-collected workspace (deterministic id is reused)', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new StrictTestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    expect((await manager.startWorkspace(input)).status).toBe('RUNNING');

    /*
     * Simulate workspace-gc reaping the idle workspace: the pod/Service/PVC are
     * deleted but the DB row survives with status DELETED.
     */
    await manager.deleteWorkspace('workspaces', input.workspaceId);
    expect((await store.get(input.workspaceId))?.status).toBe('DELETED');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(false);

    /*
     * Reopening the project re-enters startWorkspace with the same id. Before
     * the fix this threw P2002 (create() on an existing row) and the workspace
     * could never come back; now it reuses the row and re-applies resources.
     */
    const reopened = await manager.startWorkspace(input);
    expect(reopened.status).toBe('RUNNING');
    expect(reopened.error).toBeUndefined();
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(true);
    expect(k8s.objects.has('workspaces:Service:workspace-workspace_1')).toBe(true);
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(true);
  });

  it('restarts a stopped workspace under a Prisma-style store that rejects duplicate creates', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new StrictTestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);
    expect((await manager.stopWorkspace('workspaces', input.workspaceId)).status).toBe('STOPPED');
    expect((await manager.restartWorkspace(input)).status).toBe('RUNNING');
  });

  it('serializes stop against reopen: STOPPING owns teardown, then reopen creates the only live Pod', async () => {
    let releaseDelete!: () => void;
    const deleteReleased = new Promise<void>((resolve) => (releaseDelete = resolve));
    let blockPodDelete = false;

    class BlockingDeleteK8s extends TestWorkspaceK8sClient {
      override async delete(kind: string, namespace: string, name: string) {
        if (blockPodDelete && kind === 'Pod' && name === 'workspace-workspace_1') {
          await deleteReleased;
          blockPodDelete = false;
        }

        return super.delete(kind, namespace, name);
      }
    }

    const k8s = new BlockingDeleteK8s();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);
    blockPodDelete = true;

    const stop = manager.stopWorkspace('workspaces', input.workspaceId);

    await vi.waitFor(() => expect(store.workspaces.get(input.workspaceId)?.status).toBe('STOPPING'));

    /*
     * Reopen arrives while teardown owns STOPPING. Before the fix it blindly
     * wrote STARTING/applied a Pod and the old stop later overwrote the row with
     * STOPPED — exactly BUG-CREATE-003.
     */
    const reopen = manager.startWorkspace(input);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.workspaces.get(input.workspaceId)?.status).toBe('STOPPING');

    releaseDelete();
    expect((await stop).status).toBe('STOPPED');
    expect((await reopen).status).toBe('RUNNING');

    expect(store.workspaces.get(input.workspaceId)?.status).toBe('RUNNING');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(true);
  });

  it('fails closed when stop races an in-flight STARTING apply, then stops cleanly after start commits', async () => {
    let releasePodApply!: () => void;
    const podApplyReleased = new Promise<void>((resolve) => (releasePodApply = resolve));
    let podApplyEntered!: () => void;
    const podApplyStarted = new Promise<void>((resolve) => (podApplyEntered = resolve));

    class BlockingPodApplyK8s extends TestWorkspaceK8sClient {
      override async apply(object: K8sObject) {
        if (object.kind === 'Pod' && object.metadata.name === 'workspace-workspace_1') {
          podApplyEntered();
          await podApplyReleased;
        }

        return super.apply(object);
      }
    }

    const k8s = new BlockingPodApplyK8s();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    const start = manager.startWorkspace(input);
    await podApplyStarted;
    expect(store.workspaces.get(input.workspaceId)?.status).toBe('STARTING');

    /*
     * The only safe outcome while the starter can still apply Kubernetes
     * resources is a retryable refusal. The old STOPPING claim could verify
     * NotFound, persist STOPPED, then let this blocked apply recreate the Pod.
     */
    await expect(manager.stopWorkspace('workspaces', input.workspaceId)).rejects.toMatchObject({
      code: 'WORKSPACE_START_IN_PROGRESS',
      statusCode: 409,
    });
    expect(k8s.events).not.toContain('delete:Pod:workspace-workspace_1');
    expect(store.workspaces.get(input.workspaceId)?.status).toBe('STARTING');

    releasePodApply();
    expect((await start).status).toBe('RUNNING');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(true);

    expect((await manager.stopWorkspace('workspaces', input.workspaceId)).status).toBe('STOPPED');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(false);
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(true);
  });

  it('does not delete a newly-reopened Pod when STARTING wins the lifecycle CAS', async () => {
    class ReopenWinsStore extends TestWorkspaceStore {
      override async updateIfUnchanged(
        workspaceId: string,
        expected: Pick<WorkspaceRecord, 'status' | 'lastActiveAt'>,
        patch: Partial<WorkspaceRecord>,
      ) {
        if (patch.status === 'STOPPING') {
          await super.update(workspaceId, {
            status: 'STARTING',
            lastActiveAt: new Date(Date.now() + 1_000).toISOString(),
          });
        }

        return super.updateIfUnchanged(workspaceId, expected, patch);
      }
    }

    const k8s = new TestWorkspaceK8sClient();
    const store = new ReopenWinsStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');
    await manager.startWorkspace(input);

    const result = await manager.stopWorkspace('workspaces', input.workspaceId);

    expect(result.status).toBe('STARTING');
    expect(k8s.events).not.toContain('delete:Pod:workspace-workspace_1');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(true);
  });

  it('keeps STOPPING recoverable when Pod deletion fails, then GC resumes without deleting the PVC', async () => {
    class FailOnceDeleteK8s extends TestWorkspaceK8sClient {
      failPodDelete = true;

      override async delete(kind: string, namespace: string, name: string) {
        if (this.failPodDelete && kind === 'Pod') {
          this.failPodDelete = false;
          throw new Error('Kubernetes API unavailable');
        }

        return super.delete(kind, namespace, name);
      }
    }

    const k8s = new FailOnceDeleteK8s();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');
    await manager.startWorkspace(input);

    await expect(manager.stopWorkspace('workspaces', input.workspaceId)).rejects.toThrow('Kubernetes API unavailable');
    expect(store.workspaces.get(input.workspaceId)?.status).toBe('STOPPING');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(true);

    await manager.garbageCollect('workspaces', 5 * 60_000, 30 * 60_000);

    expect(store.workspaces.get(input.workspaceId)?.status).toBe('STOPPED');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(false);
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(true);
  });

  it('repairs a legacy STOPPED row with a live Pod immediately and preserves all durable resources', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');
    await manager.startWorkspace(input);

    /* Historical inconsistent state produced by the old delete-then-blind-update race. */
    await store.update(input.workspaceId, { status: 'STOPPED' });
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(true);

    await manager.garbageCollect('workspaces', 5 * 60_000, 24 * 60 * 60_000);

    expect(store.workspaces.get(input.workspaceId)?.status).toBe('STOPPED');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(false);
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(true);
    expect(k8s.objects.has('workspaces:Service:workspace-workspace_1')).toBe(true);
    expect(k8s.objects.has('workspaces:Secret:agent-token-workspace_1')).toBe(true);
  });

  it('never treats a Pod verification read failure as absence', async () => {
    class VerificationFailureK8s extends TestWorkspaceK8sClient {
      failVerification = false;
      failureInjected = false;

      override async delete(kind: string, namespace: string, name: string) {
        await super.delete(kind, namespace, name);

        if (kind === 'Pod' && !this.failureInjected) {
          this.failureInjected = true;
          this.failVerification = true;
        }
      }

      override async getPod(namespace: string, name: string) {
        if (this.failVerification) {
          this.failVerification = false;
          throw new Error('Forbidden: cannot verify Pod absence');
        }

        return super.getPod(namespace, name);
      }
    }

    const k8s = new VerificationFailureK8s();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');
    await manager.startWorkspace(input);

    await expect(manager.stopWorkspace('workspaces', input.workspaceId)).rejects.toThrow(
      'Forbidden: cannot verify Pod absence',
    );
    expect(store.workspaces.get(input.workspaceId)?.status).toBe('STOPPING');

    await manager.garbageCollect('workspaces', 5 * 60_000, 30 * 60_000);
    expect(store.workspaces.get(input.workspaceId)?.status).toBe('STOPPED');
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(true);
  });

  it('does NOT idle-stop a RUNNING workspace while the agent is busy (build/install in flight)', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);
    // Idle past the window (no client heartbeat) — but a build is running.
    await store.update(input.workspaceId, { lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });

    const busySpy = vi
      .spyOn(manager as unknown as { isAgentBusy: (id: string, ns: string) => Promise<boolean> }, 'isAgentBusy')
      .mockResolvedValue(true);

    await manager.garbageCollect('workspaces', 5 * 60 * 1000, 30 * 60 * 1000);

    expect(busySpy).toHaveBeenCalledWith(input.workspaceId, 'workspaces');
    // The busy pod is spared: row stays RUNNING and the Pod is untouched.
    expect((await store.get(input.workspaceId))?.status).toBe('RUNNING');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(true);

    busySpy.mockRestore();
  });

  it('idle-stops a RUNNING workspace when the agent reports NOT busy', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);
    await store.update(input.workspaceId, { lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });

    const busySpy = vi
      .spyOn(manager as unknown as { isAgentBusy: (id: string, ns: string) => Promise<boolean> }, 'isAgentBusy')
      .mockResolvedValue(false);

    await manager.garbageCollect('workspaces', 5 * 60 * 1000, 30 * 60 * 1000);

    expect(busySpy).toHaveBeenCalledWith(input.workspaceId, 'workspaces');
    expect((await store.get(input.workspaceId))?.status).toBe('STOPPED');

    busySpy.mockRestore();
  });

  it('idle-stops a RUNNING workspace when the busy probe fails (fail-safe: unreachable agent = dead pod)', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);
    await store.update(input.workspaceId, { lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });

    /*
     * Enable the REAL isAgentBusy fetch (the vitest config disables it with 0)
     * and make the probe throw — the fail-safe must swallow it and still stop.
     */
    const previousTimeout = process.env.WORKSPACE_AGENT_BUSY_PROBE_TIMEOUT_MS;
    process.env.WORKSPACE_AGENT_BUSY_PROBE_TIMEOUT_MS = '3000';
    const fetchSpy = vi.fn(async () => {
      throw new Error('ENOTFOUND workspace agent');
    });
    vi.stubGlobal('fetch', fetchSpy);

    try {
      await manager.garbageCollect('workspaces', 5 * 60 * 1000, 30 * 60 * 1000);

      expect(fetchSpy).toHaveBeenCalled();
      expect(fetchSpy.mock.calls[0]![0] as string).toContain('/busy');
      // Fail-safe: probe error → treated as not busy → stopped (PVC kept).
      expect((await store.get(input.workspaceId))?.status).toBe('STOPPED');
    } finally {
      vi.unstubAllGlobals();
      process.env.WORKSPACE_AGENT_BUSY_PROBE_TIMEOUT_MS = previousTimeout ?? '0';
    }
  });

  it('garbage-collects a FAILED workspace whose Pod/PVC leaked', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);

    /*
     * Simulate a provisioning failure that left the runtime resources behind:
     * before the fix, GC only walked RUNNING→STOPPED→DELETED and never reaped
     * FAILED rows, so the Pod/PVC sat leaked (Pending pod spinning autoscaler).
     */
    await store.update(input.workspaceId, {
      status: 'FAILED',
      lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    await manager.garbageCollect('workspaces', 5 * 60 * 1000, 30 * 60 * 1000);

    expect((await store.get(input.workspaceId))?.status).toBe('DELETED');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(false);
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(false);
  });

  it('meters the active runtime window to the api when GC stops a RUNNING workspace (P4)', async () => {
    const prevFetch = globalThis.fetch;
    const prevApi = process.env.API_URL;
    const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.API_URL = 'http://api.internal';
    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret';

    const calls: Array<{ url: string; body: any; auth?: string }> = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({
        url: String(url),
        body: JSON.parse(init?.body ?? '{}'),
        auth: init?.headers?.authorization,
      });
      return { ok: true, body: { cancel: async () => {} } } as any;
    }) as any;

    try {
      const k8s = new TestWorkspaceK8sClient();
      const store = new TestWorkspaceStore();
      const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

      await manager.startWorkspace(input);

      const meteredFrom = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const activeUntil = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await store.update(input.workspaceId, {
        status: 'RUNNING',
        lastMeteredAt: meteredFrom,
        lastActiveAt: activeUntil,
      });

      await manager.garbageCollect('workspaces', 5 * 60 * 1000, 30 * 60 * 1000);

      const meterCall = calls.find((call) => call.url.endsWith('/internal/metering'));
      expect(meterCall).toBeTruthy();
      expect(meterCall!.auth).toBe('Bearer internal-secret');
      expect(meterCall!.body.kind).toBe('compute');
      expect(meterCall!.body.organizationId).toBe('org_1');
      expect(meterCall!.body.projectId).toBe('project_1');

      // plan 'pro' → 500m / 1Gi reserved compute
      expect(meterCall!.body.cpuMillicores).toBe(500);
      expect(meterCall!.body.ramMb).toBe(1024);

      // metered window = 2h marker → 1h lastActiveAt = ~3600s
      expect(meterCall!.body.seconds).toBe(3600);

      // The marker advanced to lastActiveAt so the next stop won't re-meter it.
      expect((await store.get(input.workspaceId))?.lastMeteredAt).toBe(activeUntil);
    } finally {
      globalThis.fetch = prevFetch;

      if (prevApi === undefined) {
        delete process.env.API_URL;
      } else {
        process.env.API_URL = prevApi;
      }

      if (prevSecret === undefined) {
        delete process.env.INTERNAL_API_SHARED_SECRET;
      } else {
        process.env.INTERNAL_API_SHARED_SECRET = prevSecret;
      }
    }
  });

  it('meters the active runtime window on an explicit user stop (not just GC)', async () => {
    const prevFetch = globalThis.fetch;
    const prevApi = process.env.API_URL;
    const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.API_URL = 'http://api.internal';
    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret';

    const calls: Array<{ url: string; body: any }> = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
      return { ok: true, body: { cancel: async () => {} } } as any;
    }) as any;

    try {
      const k8s = new TestWorkspaceK8sClient();
      const store = new TestWorkspaceStore();
      const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

      await manager.startWorkspace(input);

      const meteredFrom = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const activeUntil = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await store.update(input.workspaceId, {
        status: 'RUNNING',
        lastMeteredAt: meteredFrom,
        lastActiveAt: activeUntil,
      });

      /*
       * The user-facing api stop route (POST /workspaces/:id/stop) calls this with
       * no guard. Before the fix it flipped the row to STOPPED without ever
       * metering, silently dropping the active window from billing.
       */
      const stopped = await manager.stopWorkspace('workspaces', input.workspaceId);
      expect(stopped.status).toBe('STOPPED');

      const meterCall = calls.find((call) => call.url.endsWith('/internal/metering'));
      expect(meterCall).toBeTruthy();

      // 2h marker → 1h lastActiveAt = ~3600s of reserved 'pro' compute (500m/1Gi).
      expect(meterCall!.body.seconds).toBe(3600);
      expect(meterCall!.body.cpuMillicores).toBe(500);
      expect(meterCall!.body.ramMb).toBe(1024);
      expect((await store.get(input.workspaceId))?.lastMeteredAt).toBe(activeUntil);
    } finally {
      globalThis.fetch = prevFetch;

      if (prevApi === undefined) {
        delete process.env.API_URL;
      } else {
        process.env.API_URL = prevApi;
      }

      if (prevSecret === undefined) {
        delete process.env.INTERNAL_API_SHARED_SECRET;
      } else {
        process.env.INTERNAL_API_SHARED_SECRET = prevSecret;
      }
    }
  });

  it('meters the un-metered RUNNING window when a live workspace is reopened (no marker jump)', async () => {
    const prevFetch = globalThis.fetch;
    const prevApi = process.env.API_URL;
    const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.API_URL = 'http://api.internal';
    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret';

    const calls: Array<{ url: string; body: any }> = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      const parsed = String(url);

      if (parsed.endsWith('/internal/metering')) {
        calls.push({ url: parsed, body: JSON.parse(init?.body ?? '{}') });
      }

      return { ok: true, body: { cancel: async () => {} } } as any;
    }) as any;

    try {
      const k8s = new TestWorkspaceK8sClient();
      const store = new TestWorkspaceStore();
      const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

      await manager.startWorkspace(input);

      /*
       * A workspace that has been RUNNING and accumulating un-metered compute: the
       * marker sits 2h back, lastActiveAt 1h back (a long-open IDE). The api always
       * re-POSTs /workspaces/start on reopen even though it is still RUNNING.
       */
      const meteredFrom = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const activeUntil = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await store.update(input.workspaceId, {
        status: 'RUNNING',
        lastMeteredAt: meteredFrom,
        lastActiveAt: activeUntil,
      });

      // Reopen the live RUNNING workspace.
      const reopened = await manager.startWorkspace(input);
      expect(reopened.status).toBe('RUNNING');

      /*
       * The prior un-metered 2h→1h window (~3600s) must be billed BEFORE the marker
       * is reset to now — otherwise that compute is silently lost.
       */
      const meterCall = calls.find((call) => call.url.endsWith('/internal/metering'));
      expect(meterCall).toBeTruthy();
      expect(meterCall!.body.seconds).toBe(3600);

      /*
       * And the marker is now freshly stamped at ~now so the STOPPED-gap reasoning
       * still holds for the next stop.
       */
      const markerAge = Date.now() - new Date((await store.get(input.workspaceId))!.lastMeteredAt!).getTime();
      expect(markerAge).toBeLessThan(60_000);
    } finally {
      globalThis.fetch = prevFetch;

      if (prevApi === undefined) {
        delete process.env.API_URL;
      } else {
        process.env.API_URL = prevApi;
      }

      if (prevSecret === undefined) {
        delete process.env.INTERNAL_API_SHARED_SECRET;
      } else {
        process.env.INTERNAL_API_SHARED_SECRET = prevSecret;
      }
    }
  });

  it('does not re-meter a STOPPED→start reopen (no live window to capture)', async () => {
    const prevFetch = globalThis.fetch;
    const prevApi = process.env.API_URL;
    process.env.API_URL = 'http://api.internal';

    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: any) => {
      calls.push(String(url));
      return { ok: true, body: { cancel: async () => {} } } as any;
    }) as any;

    try {
      const k8s = new TestWorkspaceK8sClient();
      const store = new TestWorkspaceStore();
      const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

      await manager.startWorkspace(input);

      /*
       * stopWorkspace meters once (its own window), advancing the marker to
       * lastActiveAt; reopening a STOPPED row must NOT meter again — the existing
       * RUNNING-only guard skips the pre-reset meter.
       */
      await manager.stopWorkspace('workspaces', input.workspaceId);

      const meterCountAfterStop = calls.filter((url) => url.endsWith('/internal/metering')).length;

      await manager.startWorkspace(input);

      const meterCountAfterReopen = calls.filter((url) => url.endsWith('/internal/metering')).length;

      expect(meterCountAfterReopen).toBe(meterCountAfterStop);
    } finally {
      globalThis.fetch = prevFetch;

      if (prevApi === undefined) {
        delete process.env.API_URL;
      } else {
        process.env.API_URL = prevApi;
      }
    }
  });

  it('claimMeterWindow is a cross-replica compare-and-set — only one claim wins', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');
    await manager.startWorkspace(input);

    const t0 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await store.update(input.workspaceId, { lastMeteredAt: t0 });

    const t1 = new Date().toISOString();

    /*
     * Two manager replicas read the SAME lastMeteredAt (t0) and both try to claim
     * the stop window. The CAS must let exactly one through.
     */
    const replicaA = await store.claimMeterWindow(input.workspaceId, t0, t1);
    const replicaB = await store.claimMeterWindow(input.workspaceId, t0, t1);

    expect(replicaA).toBe(true); // first replica claims → it meters
    expect(replicaB).toBe(false); // second sees the advanced marker → loses → skips metering
    expect((await store.get(input.workspaceId))?.lastMeteredAt).toBe(t1);
  });

  it('does not delete a workspace re-provisioned since the GC snapshot (TOCTOU)', async () => {
    const k8s = new TestWorkspaceK8sClient();

    /*
     * list() yields the stale STOPPED+idle snapshot the GC pass started from,
     * but get() returns the live row that a concurrent startWorkspace just
     * flipped to STARTING. GC must re-read and skip — deleting here would pull
     * the PVC out from under the freshly created pod.
     */
    class RaceStore extends TestWorkspaceStore {
      override async list() {
        return [...this.workspaces.values()].map((workspace) => ({
          ...workspace,
          status: 'STOPPED' as const,
          lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        }));
      }
    }

    const store = new RaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);
    await store.update(input.workspaceId, { status: 'STARTING', lastActiveAt: new Date().toISOString() });

    await manager.garbageCollect('workspaces', 5 * 60 * 1000, 30 * 60 * 1000);

    expect((await store.get(input.workspaceId))?.status).toBe('STARTING');
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(true);
    expect(k8s.events).not.toContain('delete:PersistentVolumeClaim:pvc-workspace_1');
  });

  it('touch() bumps lastActiveAt for a RUNNING workspace and spares it from the GC', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);

    /*
     * Simulate a session that has been open past the inactivity window with the
     * start-time stamp never refreshed — exactly the state that used to get reaped.
     */
    await store.update(input.workspaceId, { lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });

    const touched = await manager.touch(input.workspaceId);
    expect(touched?.status).toBe('RUNNING');
    expect(Date.now() - new Date((await store.get(input.workspaceId))!.lastActiveAt).getTime()).toBeLessThan(5_000);

    // The reaper must now leave the freshly-touched live workspace alone.
    await manager.garbageCollect('workspaces', 5 * 60 * 1000, 30 * 60 * 1000);
    expect((await store.get(input.workspaceId))?.status).toBe('RUNNING');
  });

  it('throttles touch() writes within the activity window', async () => {
    const k8s = new TestWorkspaceK8sClient();

    let writes = 0;

    class CountingStore extends TestWorkspaceStore {
      override async update(workspaceId: string, patch: Partial<WorkspaceRecord>) {
        writes += 1;
        return super.update(workspaceId, patch);
      }
    }

    const store = new CountingStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input); // start performs its own updates
    writes = 0;

    expect(await manager.touch(input.workspaceId)).toBeDefined(); // first touch persists
    expect(await manager.touch(input.workspaceId)).toBeUndefined(); // throttled, no write
    expect(await manager.touch(input.workspaceId)).toBeUndefined();
    expect(writes).toBe(1);
  });

  it('does not bump or resurrect a STOPPED workspace via touch()', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);
    await manager.stopWorkspace('workspaces', input.workspaceId);

    const stoppedAt = (await store.get(input.workspaceId))!.lastActiveAt;

    const result = await manager.touch(input.workspaceId);
    expect(result?.status).toBe('STOPPED');

    // lastActiveAt must stay frozen so the delete-window reaper can still collect it.
    expect((await store.get(input.workspaceId))!.lastActiveAt).toBe(stoppedAt);
  });
});

describe('detectPodTerminalFailure — Unschedulable handling', () => {
  const now = Date.parse('2026-06-22T12:00:00.000Z');
  const graceMs = 30_000;

  function unschedulablePod(lastTransitionTime: string, message = '0/3 nodes are available') {
    return {
      status: {
        phase: 'Pending',
        conditions: [
          {
            type: 'PodScheduled',
            status: 'False',
            reason: 'Unschedulable',
            message,
            lastTransitionTime,
          },
        ],
      },
    };
  }

  it('fast-fails an Unschedulable pod once the grace window has elapsed', () => {
    const transitionedAt = new Date(now - graceMs - 1_000).toISOString();
    const failure = detectPodTerminalFailure(unschedulablePod(transitionedAt), now, graceMs);

    expect(failure).not.toBeNull();
    expect(failure?.code).toBe('WORKSPACE_POD_UNSCHEDULABLE');
    expect(failure?.message).toContain('no capacity available');
    expect(failure?.message).not.toContain('0/3 nodes are available');
  });

  it('does NOT fail an Unschedulable pod still inside the grace window (autoscaler scale-up)', () => {
    const transitionedAt = new Date(now - 5_000).toISOString();

    expect(detectPodTerminalFailure(unschedulablePod(transitionedAt), now, graceMs)).toBeNull();
  });

  it('keeps waiting when the Unschedulable condition has no parseable lastTransitionTime', () => {
    const pod = unschedulablePod('not-a-date');

    expect(detectPodTerminalFailure(pod, now, graceMs)).toBeNull();
  });

  it('ignores a successfully-scheduled pod (PodScheduled=True)', () => {
    const pod = {
      status: {
        phase: 'Pending',
        conditions: [{ type: 'PodScheduled', status: 'True' }],
      },
    };

    expect(detectPodTerminalFailure(pod, now, graceMs)).toBeNull();
  });

  it('still detects pre-existing terminal states (phase=Failed)', () => {
    const failure = detectPodTerminalFailure({ status: { phase: 'Failed' } }, now, graceMs);

    expect(failure?.code).toBe('WORKSPACE_POD_FAILED');
  });

  it('defaults the grace window long enough for a gvisor node autoscale (~75-120s in prod)', () => {
    const original = process.env.WORKSPACE_UNSCHEDULABLE_GRACE_MS;
    delete process.env.WORKSPACE_UNSCHEDULABLE_GRACE_MS;

    try {
      // Must exceed the observed cold gvisor-node scale-up so a pod that schedules
      // ~a minute after creation is not fast-failed as "no capacity".
      expect(unschedulableGraceMs()).toBe(150_000);

      process.env.WORKSPACE_UNSCHEDULABLE_GRACE_MS = '90000';
      expect(unschedulableGraceMs()).toBe(90_000);
    } finally {
      if (original === undefined) {
        delete process.env.WORKSPACE_UNSCHEDULABLE_GRACE_MS;
      } else {
        process.env.WORKSPACE_UNSCHEDULABLE_GRACE_MS = original;
      }
    }
  });
});

describe('resolveAgentBaseUrl — start-gate URL parity with app.ts agentBaseUrl', () => {
  const KEYS = ['WORKSPACE_AGENT_URL_TEMPLATE', 'WORKSPACE_AGENT_BASE_URL'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('defaults to the per-workspace Service DNS when no override is set', () => {
    expect(resolveAgentBaseUrl('ws-1', 'workspaces')).toBe('http://workspace-ws-1.workspaces.svc.cluster.local:8080');
  });

  it('honors WORKSPACE_AGENT_URL_TEMPLATE with placeholders and trims trailing slashes', () => {
    process.env.WORKSPACE_AGENT_URL_TEMPLATE = 'http://{workspaceId}.{namespace}.example/agent/';

    expect(resolveAgentBaseUrl('ws-2', 'ns-a')).toBe('http://ws-2.ns-a.example/agent');
  });

  /*
   * Regression: the gate previously read ONLY WORKSPACE_AGENT_URL_TEMPLATE, so a
   * deployment configuring WORKSPACE_AGENT_BASE_URL probed the wrong default svc
   * address — blocking ~45s of every cold start or passing against a stale route.
   */
  it('honors the WORKSPACE_AGENT_BASE_URL alias (mirrors app.ts agentBaseUrl)', () => {
    process.env.WORKSPACE_AGENT_BASE_URL = 'http://{workspaceId}.{namespace}.example:9090';

    expect(resolveAgentBaseUrl('ws-3', 'ns-b')).toBe('http://ws-3.ns-b.example:9090');
  });

  it('prefers WORKSPACE_AGENT_URL_TEMPLATE over WORKSPACE_AGENT_BASE_URL when both are set', () => {
    process.env.WORKSPACE_AGENT_URL_TEMPLATE = 'http://template-{workspaceId}.svc:8080';
    process.env.WORKSPACE_AGENT_BASE_URL = 'http://base-{workspaceId}.svc:8080';

    expect(resolveAgentBaseUrl('ws-4', 'ns-c')).toBe('http://template-ws-4.svc:8080');
  });
});

describe('JsonWorkspaceStore corrupted registry handling', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ws-store-'));
    filePath = join(dir, 'workspaces.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const makeRecord = (id: string): WorkspaceRecord => ({
    id,
    orgId: 'org-a',
    projectId: 'proj-a',
    plan: 'free',
    status: 'RUNNING',
    pvcName: `${id}-pvc`,
    podName: `${id}-pod`,
    serviceName: `${id}-svc`,
    agentTokenSecretName: `${id}-secret`,
    createdAt: '2026-07-03T00:00:00.000Z',
    lastActiveAt: '2026-07-03T00:00:00.000Z',
  });

  it('reads a well-formed registry', async () => {
    await writeFile(filePath, JSON.stringify([makeRecord('ws-keep')]));
    const store = new JsonWorkspaceStore(filePath);

    expect(await store.get('ws-keep')).toMatchObject({ id: 'ws-keep' });
  });

  it('throws an actionable error on invalid JSON instead of a bare SyntaxError', async () => {
    await writeFile(filePath, '[{"id":"ws-keep"'); // truncated mid-write

    const store = new JsonWorkspaceStore(filePath);

    await expect(store.list()).rejects.toThrow(/corrupted \(invalid JSON\)/);
  });

  it('throws on valid-but-non-array JSON (would otherwise crash .map)', async () => {
    await writeFile(filePath, '{}');

    const store = new JsonWorkspaceStore(filePath);

    await expect(store.list()).rejects.toThrow(/expected a JSON array/);
  });

  it('does NOT overwrite a corrupted registry on a failed read-modify-write', async () => {
    const corrupt = '[{"id":"ws-keep"'; // truncated
    await writeFile(filePath, corrupt);

    const store = new JsonWorkspaceStore(filePath);

    const { createdAt: _c, lastActiveAt: _l, ...newInput } = makeRecord('ws-new');

    await expect(store.create(newInput)).rejects.toThrow(/corrupted/);

    // The corrupted file must be left untouched — create() must not clobber it
    // with just the new record and silently drop every other workspace.
    expect(await readFile(filePath, 'utf8')).toBe(corrupt);
  });
});

describe('WorkspaceManager server deployments (Replit-parity durable runtime)', () => {
  const reservedEnv = () => {
    vi.stubEnv('RESERVED_VM_RUNTIME_ENABLED', 'true');
    vi.stubEnv('RESERVED_VM_STORAGE_CLASS', 'reserved-rwo');
    vi.stubEnv('RESERVED_VM_STORAGE_GB', '50');
    vi.stubEnv('RESERVED_VM_NODE_SELECTOR_KEY', 'vibecore.ai/capacity');
    vi.stubEnv('RESERVED_VM_NODE_SELECTOR_VALUE', 'reserved-vm');
    vi.stubEnv('RESERVED_VM_TAINT_KEY', 'vibecore.ai/capacity');
    vi.stubEnv('RESERVED_VM_TAINT_VALUE', 'reserved-vm');
  };

  const seedReservedOperator = (k8s: TestWorkspaceK8sClient) => {
    k8s.objects.set('workspaces:StorageClass:reserved-rwo', {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: { name: 'reserved-rwo', namespace: 'workspaces' },
    });
    k8s.objects.set('workspaces:Node:reserved-node-1', {
      apiVersion: 'v1',
      kind: 'Node',
      metadata: {
        name: 'reserved-node-1',
        namespace: 'workspaces',
        labels: { 'vibecore.ai/capacity': 'reserved-vm' },
      },
      spec: {
        taints: [{ key: 'vibecore.ai/capacity', value: 'reserved-vm', effect: 'NoSchedule' }],
      },
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
        allocatable: { cpu: '4', memory: '16Gi' },
      },
    });
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // A Deployment that reports itself Ready so the readiness poll resolves.
  class ReadyDeploymentK8sClient extends TestWorkspaceK8sClient {
    override async get(kind: string, namespace: string, name: string) {
      const object = await super.get(kind, namespace, name);

      if (!object) {
        return undefined;
      }

      if (kind === 'Deployment') {
        const replicas = Number((object.spec as { replicas?: number } | undefined)?.replicas ?? 1);

        return {
          ...object,
          status: {
            availableReplicas: replicas,
            observedGeneration: object.metadata.generation,
            readyReplicas: replicas,
            replicas,
            updatedReplicas: replicas,
          },
        } as K8sObject;
      }

      return object;
    }
  }

  const makeManager = (k8s: TestWorkspaceK8sClient) =>
    new WorkspaceManager(new TestWorkspaceStore(), k8s, new TestEventBus(), 'test-workspace-agent-secret');

  it('applies Secret+Deployment+Service+Ingress, polls ready, returns the public URL', async () => {
    const k8s = new ReadyDeploymentK8sClient();
    const manager = makeManager(k8s);

    const result = await manager.startServerDeployment({
      deploymentId: 'dep1',
      namespace: 'workspaces',
      projectId: 'project_1',
      image: 'agent:test',
      command: ['node', '-e', 'require("http").createServer().listen(3000)'],
      port: 3000,
      host: 'd-dep1.preview.e-code.ai',
      tlsSecretName: 'vibecore-preview-wildcard-tls',
      env: { APP_FLAG: 'on' },
      secrets: { DATABASE_URL: 'postgres://prod/db' },
      createIngress: true,
      readyTimeoutMs: 1000,
    });

    expect(result).toEqual({
      ready: true,
      url: 'https://d-dep1.preview.e-code.ai',
      name: 'app-dep1',
      readyReplicas: 1,
    });

    expect(k8s.events).toEqual(
      expect.arrayContaining([
        'apply:Secret:app-secrets-dep1',
        'apply:Deployment:app-dep1',
        'apply:Service:app-dep1',
        'apply:Ingress:app-dep1',
      ]),
    );

    // The prod DATABASE_URL lives in the Secret, never in plain env, and is wired
    // into the container via secretKeyRef.
    const secret = k8s.objects.get('workspaces:Secret:app-secrets-dep1') as any;
    expect(secret.stringData.DATABASE_URL).toBe('postgres://prod/db');

    const container = (k8s.objects.get('workspaces:Deployment:app-dep1') as any).spec.template.spec.containers[0];
    const envByName = new Map((container.env as Array<{ name: string }>).map((e) => [e.name, e]));
    expect(envByName.get('PORT')).toMatchObject({ value: '3000' });
    expect(envByName.get('APP_FLAG')).toMatchObject({ value: 'on' });
    expect((envByName.get('DATABASE_URL') as any).valueFrom.secretKeyRef).toMatchObject({
      name: 'app-secrets-dep1',
      key: 'DATABASE_URL',
    });

    // Public routing: exact host under the preview wildcard cert.
    const ingress = k8s.objects.get('workspaces:Ingress:app-dep1') as any;
    expect(ingress.spec.rules[0].host).toBe('d-dep1.preview.e-code.ai');
    expect(ingress.spec.tls[0].secretName).toBe('vibecore-preview-wildcard-tls');
  });

  it('reports not-ready when the deployment never reaches readyReplicas>=1', async () => {
    const k8s = new TestWorkspaceK8sClient(); // get() returns the stored object with no status
    const manager = makeManager(k8s);

    const result = await manager.startServerDeployment({
      deploymentId: 'dep2',
      namespace: 'workspaces',
      image: 'agent:test',
      port: 3000,
      host: 'd-dep2.preview.e-code.ai',
      tlsSecretName: 'tls',
      readyTimeoutMs: 0, // deadline is now → the first poll returns false
    });

    expect(result.ready).toBe(false);
    expect(result.readyReplicas).toBe(0);
  });

  it('proves Reserved VM capability from live StorageClass and tainted node, fail-closed at each missing layer', async () => {
    const k8s = new ReadyDeploymentK8sClient();
    const manager = makeManager(k8s);

    expect(await manager.reservedVmRuntimeCapability('workspaces')).toEqual({
      enabled: false,
      reasonCode: 'RESERVED_VM_DISABLED',
    });

    reservedEnv();
    expect(await manager.reservedVmRuntimeCapability('workspaces')).toEqual({
      enabled: false,
      reasonCode: 'RESERVED_VM_STORAGE_CLASS_UNAVAILABLE',
    });

    k8s.objects.set('workspaces:StorageClass:reserved-rwo', {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: { name: 'reserved-rwo', namespace: 'workspaces' },
    });
    expect(await manager.reservedVmRuntimeCapability('workspaces')).toEqual({
      enabled: false,
      reasonCode: 'RESERVED_VM_NODE_POOL_UNAVAILABLE',
    });

    k8s.objects.set('workspaces:Node:reserved-node-1', {
      apiVersion: 'v1',
      kind: 'Node',
      metadata: {
        name: 'reserved-node-1',
        namespace: 'workspaces',
        labels: { 'vibecore.ai/capacity': 'reserved-vm' },
      },
      spec: {
        unschedulable: true,
        taints: [{ key: 'vibecore.ai/capacity', value: 'reserved-vm', effect: 'NoSchedule' }],
      },
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
        allocatable: { cpu: '4', memory: '16Gi' },
      },
    });
    expect(await manager.reservedVmRuntimeCapability('workspaces')).toEqual({
      enabled: false,
      reasonCode: 'RESERVED_VM_NODE_POOL_UNAVAILABLE',
    });

    k8s.objects.set('workspaces:Node:reserved-node-1', {
      apiVersion: 'v1',
      kind: 'Node',
      metadata: {
        name: 'reserved-node-1',
        namespace: 'workspaces',
        labels: { 'vibecore.ai/capacity': 'reserved-vm' },
      },
      spec: {
        taints: [{ key: 'vibecore.ai/capacity', value: 'reserved-vm', effect: 'NoSchedule' }],
      },
      status: {
        conditions: [{ type: 'Ready', status: 'False' }],
        allocatable: { cpu: '4', memory: '16Gi' },
      },
    });
    expect(await manager.reservedVmRuntimeCapability('workspaces')).toEqual({
      enabled: false,
      reasonCode: 'RESERVED_VM_NODE_POOL_UNAVAILABLE',
    });

    k8s.objects.set('workspaces:Node:reserved-node-1', {
      apiVersion: 'v1',
      kind: 'Node',
      metadata: {
        name: 'reserved-node-1',
        namespace: 'workspaces',
        labels: { 'vibecore.ai/capacity': 'reserved-vm' },
      },
      spec: {
        taints: [{ key: 'vibecore.ai/capacity', value: 'reserved-vm', effect: 'NoSchedule' }],
      },
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
        allocatable: { cpu: '2', memory: '8Gi' },
      },
    });
    expect(await manager.reservedVmRuntimeCapability('workspaces')).toMatchObject({
      enabled: true,
      availableTiers: ['shared-0.5', 'dedicated-1', 'dedicated-2'],
    });

    seedReservedOperator(k8s);
    expect(await manager.reservedVmRuntimeCapability('workspaces')).toMatchObject({
      enabled: true,
      storageClassName: 'reserved-rwo',
      storageGi: 50,
      nodeSelector: { key: 'vibecore.ai/capacity', value: 'reserved-vm' },
      availableTiers: ['shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4'],
    });
  });

  it.each([
    ['shared-0.5', '500m', '2Gi'],
    ['dedicated-1', '1', '4Gi'],
    ['dedicated-2', '2', '8Gi'],
    ['dedicated-4', '4', '16Gi'],
  ] as const)(
    'starts always-on tier %s with exact requests=limits and persistent storage',
    async (tier, cpu, memory) => {
      reservedEnv();
      const k8s = new ReadyDeploymentK8sClient();
      seedReservedOperator(k8s);
      const manager = makeManager(k8s);
      const deploymentId = `dep-${tier}`;

      await manager.startServerDeployment({
        deploymentId,
        namespace: 'workspaces',
        orgId: 'org1',
        projectId: 'project1',
        image: 'agent:test',
        port: 3000,
        host: `${deploymentId}.preview.e-code.ai`,
        tlsSecretName: 'tls',
        runtimeKind: 'reserved-vm',
        reservedVmTier: tier,
        operationId: `create-${deploymentId}`,
        fencingToken: 1,
        readyTimeoutMs: 500,
      });

      const pvc = k8s.objects.get(`workspaces:PersistentVolumeClaim:reserved-data-${deploymentId}`) as any;
      const deployment = k8s.objects.get(`workspaces:Deployment:app-${deploymentId}`) as any;
      const container = deployment.spec.template.spec.containers[0];

      expect(pvc.spec.resources.requests.storage).toBe('50Gi');
      expect(container.resources).toEqual({ requests: { cpu, memory }, limits: { cpu, memory } });
      expect(deployment.metadata.labels['vibecore.ai/server-runtime-kind']).toBe('reserved-vm');
      expect(deployment.spec.replicas).toBe(1);
    },
  );

  it('retains and remounts the same PVC when changing from Reserved VM to Autoscale', async () => {
    reservedEnv();
    const k8s = new ReadyDeploymentK8sClient();
    seedReservedOperator(k8s);
    const manager = makeManager(k8s);
    const common = {
      deploymentId: 'dep-change',
      namespace: 'workspaces',
      orgId: 'org1',
      projectId: 'project1',
      image: 'agent:test',
      port: 3000,
      host: 'dep-change.preview.e-code.ai',
      tlsSecretName: 'tls',
      readyTimeoutMs: 500,
    };

    await manager.startServerDeployment({
      ...common,
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-1',
      operationId: 'create-dep-change',
      fencingToken: 1,
    });
    await manager.startServerDeployment({ ...common, runtimeKind: 'autoscale', cpuRequest: '250m', cpuLimit: '1' });

    const deployment = k8s.objects.get('workspaces:Deployment:app-dep-change') as any;
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:reserved-data-dep-change')).toBe(true);
    expect(deployment.metadata.labels['vibecore.ai/server-runtime-kind']).toBe('autoscale');
    expect(deployment.spec.template.spec.volumes).toContainEqual({
      name: 'app-data',
      persistentVolumeClaim: { claimName: 'reserved-data-dep-change', readOnly: false },
    });
    expect(k8s.events).not.toContain('delete:PersistentVolumeClaim:reserved-data-dep-change');
  });

  it('reconfigures the existing Deployment in place without changing image, command, Service or PVC', async () => {
    reservedEnv();
    const k8s = new ReadyDeploymentK8sClient();
    seedReservedOperator(k8s);
    const manager = makeManager(k8s);

    await manager.startServerDeployment({
      deploymentId: 'dep-in-place',
      namespace: 'workspaces',
      image: 'registry.example/app@sha256:abc',
      command: ['node', 'server.js'],
      port: 3000,
      host: 'dep-in-place.preview.e-code.ai',
      tlsSecretName: 'tls',
      cpuRequest: '250m',
      cpuLimit: '1',
      memoryRequest: '1Gi',
      memoryLimit: '2Gi',
      readyTimeoutMs: 500,
    });
    const serviceBefore = structuredClone(k8s.objects.get('workspaces:Service:app-dep-in-place'));

    const result = await manager.reconfigureServerDeployment({
      deploymentId: 'dep-in-place',
      namespace: 'workspaces',
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-2',
      operationId: 'change-dep-in-place',
      fencingToken: 1,
      readyTimeoutMs: 500,
    });

    const deployment = k8s.objects.get('workspaces:Deployment:app-dep-in-place') as any;
    const container = deployment.spec.template.spec.containers[0];
    expect(result).toMatchObject({ ready: true, persistentVolumeClaimName: 'reserved-data-dep-in-place' });
    expect(container.image).toBe('registry.example/app@sha256:abc');
    expect(container.command).toEqual(['node', 'server.js']);
    expect(container.resources).toEqual({ requests: { cpu: '2', memory: '8Gi' }, limits: { cpu: '2', memory: '8Gi' } });
    expect(k8s.objects.get('workspaces:Service:app-dep-in-place')).toEqual(serviceBefore);
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:reserved-data-dep-in-place')).toBe(true);
  });

  it('redeploys a Reserved VM image in place under a higher fence without replacing its Service or PVC', async () => {
    reservedEnv();
    const k8s = new ReadyDeploymentK8sClient();
    seedReservedOperator(k8s);
    const manager = makeManager(k8s);

    await manager.startServerDeployment({
      deploymentId: 'dep-redeploy-in-place',
      namespace: 'workspaces',
      orgId: 'org-redeploy',
      projectId: 'project-redeploy',
      image: 'registry.example/app@sha256:old',
      command: ['node', 'old.js'],
      args: ['--old'],
      port: 3000,
      host: 'dep-redeploy-in-place.preview.e-code.ai',
      tlsSecretName: 'tls',
      env: { OLD_FLAG: '1' },
      secrets: { API_TOKEN: 'secret' },
      healthPath: '/old-health',
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-1',
      operationId: 'create-redeploy-runtime',
      fencingToken: 4,
      readyTimeoutMs: 500,
    });
    const serviceBefore = structuredClone(k8s.objects.get('workspaces:Service:app-dep-redeploy-in-place'));
    const pvcBefore = structuredClone(
      k8s.objects.get('workspaces:PersistentVolumeClaim:reserved-data-dep-redeploy-in-place'),
    );

    const result = await manager.reconfigureServerDeployment({
      deploymentId: 'dep-redeploy-in-place',
      namespace: 'workspaces',
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-1',
      image: 'registry.example/app@sha256:new',
      command: ['node', 'new.js'],
      args: ['--new'],
      env: { NEW_FLAG: '1', PORT: '9999', PROJECT_ID: 'spoofed' },
      healthPath: '/ready',
      operationId: 'redeploy-runtime',
      fencingToken: 5,
      readyTimeoutMs: 500,
    });

    const deployment = k8s.objects.get('workspaces:Deployment:app-dep-redeploy-in-place') as any;
    const container = deployment.spec.template.spec.containers[0];
    expect(result).toMatchObject({
      ready: true,
      persistentVolumeClaimName: 'reserved-data-dep-redeploy-in-place',
      appliedFencingToken: 5,
    });
    expect(container).toMatchObject({
      image: 'registry.example/app@sha256:new',
      command: ['node', 'new.js'],
      args: ['--new'],
      readinessProbe: { httpGet: { path: '/ready', port: 3000 } },
    });
    expect(container.env).toEqual(
      expect.arrayContaining([
        { name: 'PORT', value: '3000' },
        { name: 'ECODE_DEPLOYMENT', value: '1' },
        { name: 'PROJECT_ID', value: 'project-redeploy' },
        { name: 'NEW_FLAG', value: '1' },
        {
          name: 'API_TOKEN',
          valueFrom: { secretKeyRef: { name: 'app-secrets-dep-redeploy-in-place', key: 'API_TOKEN', optional: true } },
        },
      ]),
    );
    expect(container.env).not.toContainEqual({ name: 'PORT', value: '9999' });
    expect(container.env).not.toContainEqual({ name: 'PROJECT_ID', value: 'spoofed' });
    expect(k8s.objects.get('workspaces:Service:app-dep-redeploy-in-place')).toEqual(serviceBefore);
    expect(k8s.objects.get('workspaces:PersistentVolumeClaim:reserved-data-dep-redeploy-in-place')).toMatchObject({
      metadata: {
        name: pvcBefore?.metadata.name,
        labels: pvcBefore?.metadata.labels,
        annotations: {
          'vibecore.ai/runtime-operation-id': 'redeploy-runtime',
          'vibecore.ai/runtime-fencing-token': '5',
        },
      },
    });
    expect(k8s.events).not.toContain('delete:Deployment:app-dep-redeploy-in-place');
    expect(k8s.events).not.toContain('delete:PersistentVolumeClaim:reserved-data-dep-redeploy-in-place');
  });

  it('fenced-suspends a Reserved VM at zero replicas without deleting or replacing its runtime, URL or data claim', async () => {
    reservedEnv();
    const k8s = new ReadyDeploymentK8sClient();
    seedReservedOperator(k8s);
    const manager = makeManager(k8s);

    await manager.startServerDeployment({
      deploymentId: 'dep-billing-suspend',
      namespace: 'workspaces',
      orgId: 'org-suspend',
      projectId: 'project-suspend',
      image: 'registry.example/app@sha256:paid-release',
      command: ['node', 'server.js'],
      args: ['--paid'],
      port: 3000,
      host: 'dep-billing-suspend.preview.e-code.ai',
      tlsSecretName: 'tls',
      env: { RELEASE: 'paid' },
      secrets: { API_TOKEN: 'secret' },
      healthPath: '/ready',
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-1',
      operationId: 'create-suspend-runtime',
      fencingToken: 12,
      readyTimeoutMs: 500,
    });

    const deploymentBefore = structuredClone(k8s.objects.get('workspaces:Deployment:app-dep-billing-suspend')) as any;
    const serviceBefore = structuredClone(k8s.objects.get('workspaces:Service:app-dep-billing-suspend'));
    const pvcBefore = structuredClone(
      k8s.objects.get('workspaces:PersistentVolumeClaim:reserved-data-dep-billing-suspend'),
    );
    const eventCountBefore = k8s.events.length;

    const result = await manager.suspendReservedVmDeployment({
      deploymentId: 'dep-billing-suspend',
      namespace: 'workspaces',
      operationId: 'billing-stop:period-2026-08',
      fencingToken: 14,
      readyTimeoutMs: 500,
    });

    const deployment = k8s.objects.get('workspaces:Deployment:app-dep-billing-suspend') as any;
    expect(result).toEqual({
      suspended: true,
      name: 'app-dep-billing-suspend',
      persistentVolumeClaimName: 'reserved-data-dep-billing-suspend',
      appliedFencingToken: 14,
    });
    expect(deployment.spec.replicas).toBe(0);
    expect(deployment.spec.template.spec).toEqual(deploymentBefore.spec.template.spec);
    expect(deployment.spec.strategy).toEqual(deploymentBefore.spec.strategy);
    expect(deployment.metadata.labels).toEqual(deploymentBefore.metadata.labels);
    expect(deployment.metadata.annotations).toMatchObject({
      'vibecore.ai/runtime-operation-id': 'billing-stop:period-2026-08',
      'vibecore.ai/runtime-fencing-token': '14',
      'vibecore.ai/reserved-vm-suspended': 'true',
    });
    expect(deployment.spec.template.metadata.annotations).toMatchObject({
      'vibecore.ai/reserved-vm-suspended': 'true',
    });
    expect(k8s.objects.get('workspaces:Service:app-dep-billing-suspend')).toEqual(serviceBefore);
    expect(k8s.objects.get('workspaces:PersistentVolumeClaim:reserved-data-dep-billing-suspend')).toEqual(pvcBefore);
    expect(k8s.events.slice(eventCountBefore)).toEqual(['apply:Deployment:app-dep-billing-suspend']);
    expect(k8s.events.some((event) => event.startsWith('delete:'))).toBe(false);

    const applyCount = k8s.events.length;
    await manager.suspendReservedVmDeployment({
      deploymentId: 'dep-billing-suspend',
      namespace: 'workspaces',
      operationId: 'billing-stop:period-2026-08',
      fencingToken: 14,
      readyTimeoutMs: 500,
    });
    expect(k8s.events).toHaveLength(applyCount);

    await expect(
      manager.suspendReservedVmDeployment({
        deploymentId: 'dep-billing-suspend',
        namespace: 'workspaces',
        operationId: 'billing-stop:stale',
        fencingToken: 13,
        readyTimeoutMs: 500,
      }),
    ).rejects.toMatchObject({ code: 'RESERVED_VM_OPERATION_FENCE_LOST' });
    expect(k8s.objects.has('workspaces:Deployment:app-dep-billing-suspend')).toBe(true);
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:reserved-data-dep-billing-suspend')).toBe(true);
  });

  it('converts Reserved VM back to Autoscale in place while retaining the URL Service and data claim', async () => {
    reservedEnv();
    const k8s = new ReadyDeploymentK8sClient();
    seedReservedOperator(k8s);
    const manager = makeManager(k8s);

    await manager.startServerDeployment({
      deploymentId: 'dep-to-autoscale',
      namespace: 'workspaces',
      image: 'registry.example/app@sha256:stable',
      command: ['node', 'server.js'],
      port: 3000,
      host: 'dep-to-autoscale.preview.e-code.ai',
      tlsSecretName: 'tls',
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-1',
      operationId: 'create-dep-to-autoscale',
      fencingToken: 1,
      readyTimeoutMs: 500,
    });
    const serviceBefore = structuredClone(k8s.objects.get('workspaces:Service:app-dep-to-autoscale'));

    const result = await manager.reconfigureServerDeployment({
      deploymentId: 'dep-to-autoscale',
      namespace: 'workspaces',
      runtimeKind: 'autoscale',
      cpuRequest: '250m',
      cpuLimit: '1',
      memoryRequest: '512Mi',
      memoryLimit: '1Gi',
      operationId: 'change-dep-to-autoscale',
      fencingToken: 2,
      readyTimeoutMs: 500,
    });

    const deployment = k8s.objects.get('workspaces:Deployment:app-dep-to-autoscale') as any;
    const podSpec = deployment.spec.template.spec;
    const container = podSpec.containers[0];
    expect(result).toMatchObject({ ready: true, persistentVolumeClaimName: 'reserved-data-dep-to-autoscale' });
    expect(container.image).toBe('registry.example/app@sha256:stable');
    expect(container.command).toEqual(['node', 'server.js']);
    expect(container.resources).toEqual({
      requests: { cpu: '250m', memory: '512Mi' },
      limits: { cpu: '1', memory: '1Gi' },
    });
    expect(deployment.metadata.labels['vibecore.ai/server-runtime-kind']).toBe('autoscale');
    expect(podSpec.nodeSelector).toEqual({ 'vibecore.ai/node-pool': 'sandbox' });
    expect(k8s.objects.get('workspaces:Service:app-dep-to-autoscale')).toEqual(serviceBefore);
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:reserved-data-dep-to-autoscale')).toBe(true);
    expect(k8s.events).not.toContain('delete:PersistentVolumeClaim:reserved-data-dep-to-autoscale');
  });

  it('accepts monotone deployment fences across create and changes, then rejects a stale writer', async () => {
    reservedEnv();
    const k8s = new ReadyDeploymentK8sClient();
    seedReservedOperator(k8s);
    const manager = makeManager(k8s);
    const common = {
      deploymentId: 'dep-monotone-fence',
      namespace: 'workspaces',
      image: 'registry.example/app@sha256:fenced',
      port: 3000,
      host: 'dep-monotone-fence.preview.e-code.ai',
      tlsSecretName: 'tls',
      readyTimeoutMs: 500,
    };

    await manager.startServerDeployment({
      ...common,
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-1',
      operationId: 'operation-create-a',
      fencingToken: 1,
    });
    await manager.reconfigureServerDeployment({
      deploymentId: common.deploymentId,
      namespace: common.namespace,
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-2',
      operationId: 'operation-change-b',
      fencingToken: 2,
      readyTimeoutMs: 500,
    });
    await manager.reconfigureServerDeployment({
      deploymentId: common.deploymentId,
      namespace: common.namespace,
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-4',
      operationId: 'operation-change-c',
      fencingToken: 3,
      readyTimeoutMs: 500,
    });

    await expect(
      manager.reconfigureServerDeployment({
        deploymentId: common.deploymentId,
        namespace: common.namespace,
        runtimeKind: 'reserved-vm',
        reservedVmTier: 'shared-0.5',
        operationId: 'operation-stale-a',
        fencingToken: 2,
        readyTimeoutMs: 500,
      }),
    ).rejects.toMatchObject({ code: 'RESERVED_VM_OPERATION_FENCE_LOST' });

    const deployment = k8s.objects.get('workspaces:Deployment:app-dep-monotone-fence') as any;
    expect(deployment.metadata.annotations).toMatchObject({
      'vibecore.ai/runtime-operation-id': 'operation-change-c',
      'vibecore.ai/runtime-fencing-token': '3',
    });
    expect(deployment.spec.template.spec.containers[0].resources).toEqual({
      requests: { cpu: '4', memory: '16Gi' },
      limits: { cpu: '4', memory: '16Gi' },
    });
  });

  it('restores the exact previous Deployment when an in-place rollout cannot become Ready', async () => {
    reservedEnv();
    class RollbackReadyK8sClient extends TestWorkspaceK8sClient {
      override async get(kind: string, namespace: string, name: string) {
        const object = await super.get(kind, namespace, name);

        if (!object || kind !== 'Deployment') {
          return object;
        }

        if (object.metadata.labels?.['vibecore.ai/server-runtime-kind'] !== 'autoscale') {
          return object;
        }

        return {
          ...object,
          status: {
            availableReplicas: 1,
            observedGeneration: object.metadata.generation,
            readyReplicas: 1,
            replicas: 1,
            updatedReplicas: 1,
          },
        } as K8sObject;
      }
    }
    const k8s = new RollbackReadyK8sClient();
    seedReservedOperator(k8s);
    const manager = makeManager(k8s);
    const original = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'app-dep-rollback',
        namespace: 'workspaces',
        labels: {
          'vibecore.ai/server-deploy': 'dep-rollback',
          'vibecore.ai/server-runtime-kind': 'autoscale',
        },
      },
      spec: {
        replicas: 1,
        template: {
          metadata: { labels: { app: 'app-dep-rollback' } },
          spec: {
            containers: [
              {
                name: 'app',
                image: 'registry.example/app@sha256:old',
                command: ['node', 'old.js'],
                args: ['--stable'],
                ports: [{ containerPort: 3000, name: 'http' }],
                env: [{ name: 'STABLE_RELEASE', value: '1' }],
                readinessProbe: { httpGet: { path: '/stable', port: 3000 } },
                resources: { requests: { cpu: '250m', memory: '1Gi' }, limits: { cpu: '1', memory: '2Gi' } },
              },
            ],
          },
        },
      },
    } as any;
    k8s.objects.set('workspaces:Deployment:app-dep-rollback', structuredClone(original));

    await expect(
      manager.reconfigureServerDeployment({
        deploymentId: 'dep-rollback',
        namespace: 'workspaces',
        runtimeKind: 'reserved-vm',
        reservedVmTier: 'dedicated-4',
        image: 'registry.example/app@sha256:broken',
        command: ['node', 'broken.js'],
        args: ['--broken'],
        env: { BROKEN_RELEASE: '1' },
        healthPath: '/broken',
        operationId: 'change-dep-rollback',
        fencingToken: 1,
        readyTimeoutMs: 1,
      }),
    ).rejects.toMatchObject({ code: 'RESERVED_VM_RECONFIGURE_NOT_READY', rolledBack: true });

    const rolledBack = k8s.objects.get('workspaces:Deployment:app-dep-rollback') as any;
    const rolledBackWorkloadSpec = structuredClone(rolledBack.spec);
    delete rolledBackWorkloadSpec.template.metadata.annotations;
    expect(rolledBackWorkloadSpec).toEqual(original.spec);
    expect(rolledBack.metadata.labels).toEqual(original.metadata.labels);
    expect(rolledBack.metadata.annotations).toMatchObject({
      'vibecore.ai/runtime-operation-id': 'change-dep-rollback',
      'vibecore.ai/runtime-fencing-token': '1',
    });
    // This operation created an empty PVC and then proved the runtime rollback,
    // so it deletes only that new claim under the same fence.
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:reserved-data-dep-rollback')).toBe(false);
  });

  it('rejects Reserved VM before creating resources when the operator capability is inactive', async () => {
    const k8s = new ReadyDeploymentK8sClient();
    const manager = makeManager(k8s);

    await expect(
      manager.startServerDeployment({
        deploymentId: 'dep-disabled',
        namespace: 'workspaces',
        image: 'agent:test',
        port: 3000,
        host: 'dep-disabled.preview.e-code.ai',
        tlsSecretName: 'tls',
        runtimeKind: 'reserved-vm',
        reservedVmTier: 'shared-0.5',
      }),
    ).rejects.toMatchObject({ code: 'RESERVED_VM_DISABLED', statusCode: 503 });
    expect(k8s.events).toEqual([]);
  });

  it('omits the Secret entirely when the deployment has no secrets', async () => {
    const k8s = new ReadyDeploymentK8sClient();
    const manager = makeManager(k8s);

    await manager.startServerDeployment({
      deploymentId: 'dep3',
      namespace: 'workspaces',
      image: 'agent:test',
      port: 8080,
      host: 'd-dep3.preview.e-code.ai',
      tlsSecretName: 'tls',
      readyTimeoutMs: 500,
    });

    expect(k8s.events.some((e) => e.startsWith('apply:Secret:'))).toBe(false);
  });

  it('does NOT create an Ingress by default (routing goes through the preview-proxy)', async () => {
    const k8s = new ReadyDeploymentK8sClient();
    const manager = makeManager(k8s);

    await manager.startServerDeployment({
      deploymentId: 'dep6',
      namespace: 'workspaces',
      image: 'agent:test',
      port: 3000,
      host: 'd-dep6.preview.e-code.ai',
      tlsSecretName: 'tls',
      readyTimeoutMs: 500,
    });

    expect(k8s.events).toEqual(expect.arrayContaining(['apply:Deployment:app-dep6', 'apply:Service:app-dep6']));
    expect(k8s.events.some((e) => e.startsWith('apply:Ingress:'))).toBe(false);
  });

  it('stopServerDeployment tears down all four resources', async () => {
    const k8s = new ReadyDeploymentK8sClient();
    const manager = makeManager(k8s);

    await manager.startServerDeployment({
      deploymentId: 'dep4',
      namespace: 'workspaces',
      image: 'agent:test',
      port: 3000,
      host: 'd-dep4.preview.e-code.ai',
      tlsSecretName: 'tls',
      secrets: { DATABASE_URL: 'postgres://x' },
      readyTimeoutMs: 500,
    });

    await manager.stopServerDeployment('workspaces', 'dep4');

    expect(k8s.events).toEqual(
      expect.arrayContaining([
        'delete:Ingress:app-dep4',
        'delete:Service:app-dep4',
        'delete:Deployment:app-dep4',
        'delete:Secret:app-secrets-dep4',
      ]),
    );
  });

  it('getServerDeploymentStatus reflects readyReplicas from the live Deployment', async () => {
    const k8s = new ReadyDeploymentK8sClient();
    const manager = makeManager(k8s);

    await manager.startServerDeployment({
      deploymentId: 'dep5',
      namespace: 'workspaces',
      image: 'agent:test',
      port: 3000,
      host: 'd-dep5.preview.e-code.ai',
      tlsSecretName: 'tls',
      readyTimeoutMs: 500,
    });

    expect(await manager.getServerDeploymentStatus('workspaces', 'dep5')).toEqual({
      exists: true,
      readyReplicas: 1,
      replicas: 1,
    });
    expect(await manager.getServerDeploymentStatus('workspaces', 'ghost')).toEqual({
      exists: false,
      readyReplicas: 0,
      replicas: 0,
    });
  });
});

describe('server-deploy scale-to-zero (Replit-parity Autoscale)', () => {
  function seedServerDeploy(
    k8s: TestWorkspaceK8sClient,
    deploymentId: string,
    overrides: {
      replicas?: number;
      readyReplicas?: number;
      annotations?: Record<string, string>;
      creationTimestamp?: string;
      runtimeKind?: 'autoscale' | 'reserved-vm';
    } = {},
  ) {
    const name = `app-${deploymentId}`;
    k8s.objects.set(`workspaces:Deployment:${name}`, {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name,
        namespace: 'workspaces',
        labels: {
          app: name,
          'vibecore.ai/server-deploy': deploymentId,
          'vibecore.ai/server-runtime-kind': overrides.runtimeKind ?? 'autoscale',
        },
        annotations: overrides.annotations,
        ...(overrides.creationTimestamp ? { creationTimestamp: overrides.creationTimestamp } : {}),
      } as any,
      spec: { replicas: overrides.replicas ?? 1 },
      status: { replicas: overrides.replicas ?? 1, readyReplicas: overrides.readyReplicas ?? overrides.replicas ?? 1 },
    } as any);
  }

  it('activate() wakes a scaled-to-zero deployment (scale 0 -> 1) and waits for readiness', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const manager = new WorkspaceManager(
      new TestWorkspaceStore(),
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
    );
    seedServerDeploy(k8s, 'dep_sleeping', { replicas: 0, readyReplicas: 0 });

    const result = await manager.activateServerDeployment('workspaces', 'dep_sleeping', 5_000);

    expect(result).toEqual({ ready: true, readyReplicas: 1, wokeUp: true });
    expect(k8s.events).toContain('scale:Deployment:app-dep_sleeping:1');
    // Stamped last-request so the idle sweep doesn't immediately re-sleep it.
    expect(k8s.events).toContain('annotate:Deployment:app-dep_sleeping:vibecore.ai/last-request-at');
  });

  it('activate() is a fast no-op when the deployment is already ready (no scale call)', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const manager = new WorkspaceManager(
      new TestWorkspaceStore(),
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
    );
    seedServerDeploy(k8s, 'dep_awake', { replicas: 1, readyReplicas: 1 });

    const result = await manager.activateServerDeployment('workspaces', 'dep_awake', 5_000);

    expect(result).toEqual({ ready: true, readyReplicas: 1, wokeUp: false });
    expect(k8s.events.some((e) => e.startsWith('scale:'))).toBe(false);
  });

  it('activate() never wakes a billing-suspended Reserved VM from public traffic', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const manager = new WorkspaceManager(
      new TestWorkspaceStore(),
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
    );
    seedServerDeploy(k8s, 'dep_reserved_suspended', {
      replicas: 0,
      readyReplicas: 0,
      runtimeKind: 'reserved-vm',
      annotations: { 'vibecore.ai/reserved-vm-suspended': 'true' },
    });

    await expect(manager.activateServerDeployment('workspaces', 'dep_reserved_suspended', 5_000)).rejects.toMatchObject(
      { code: 'RESERVED_VM_SUSPENDED', statusCode: 402 },
    );
    await expect(manager.activateServerDeployment('workspaces', 'dep_reserved_suspended', 5_000)).rejects.toMatchObject(
      { code: 'RESERVED_VM_SUSPENDED', statusCode: 402 },
    );
    expect(k8s.events.some((event) => event.startsWith('scale:'))).toBe(false);
    expect(k8s.events.some((event) => event.startsWith('annotate:'))).toBe(false);
  });

  it('activate() polls an always-on Reserved VM without ever scaling it from zero', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const manager = new WorkspaceManager(
      new TestWorkspaceStore(),
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
    );
    seedServerDeploy(k8s, 'dep_reserved_healthy', {
      replicas: 1,
      readyReplicas: 1,
      runtimeKind: 'reserved-vm',
    });

    await expect(manager.activateServerDeployment('workspaces', 'dep_reserved_healthy', 5_000)).resolves.toEqual({
      ready: true,
      readyReplicas: 1,
      wokeUp: false,
    });
    expect(k8s.events.some((event) => event.startsWith('scale:'))).toBe(false);
  });

  it('activate() throws SERVER_DEPLOY_NOT_FOUND for an unknown deployment', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const manager = new WorkspaceManager(
      new TestWorkspaceStore(),
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
    );

    await expect(manager.activateServerDeployment('workspaces', 'ghost', 1_000)).rejects.toMatchObject({
      code: 'SERVER_DEPLOY_NOT_FOUND',
    });
  });

  it('reapIdleServerDeployments() sleeps only deployments idle past the window', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const manager = new WorkspaceManager(
      new TestWorkspaceStore(),
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
    );
    const now = Date.now();

    // Idle 20 min ago -> should sleep.
    seedServerDeploy(k8s, 'dep_idle', {
      replicas: 1,
      annotations: { 'vibecore.ai/last-request-at': String(now - 20 * 60_000) },
    });
    // Hit 1 min ago -> stays up.
    seedServerDeploy(k8s, 'dep_active', {
      replicas: 1,
      annotations: { 'vibecore.ai/last-request-at': String(now - 60_000) },
    });
    // Already asleep -> skipped.
    seedServerDeploy(k8s, 'dep_zero', { replicas: 0, readyReplicas: 0 });
    // Same idle timestamp, but paid always-on capacity is never reaped.
    seedServerDeploy(k8s, 'dep_reserved', {
      replicas: 1,
      runtimeKind: 'reserved-vm',
      annotations: { 'vibecore.ai/last-request-at': String(now - 20 * 60_000) },
    });

    const slept = await manager.reapIdleServerDeployments('workspaces', 15 * 60_000);

    expect(slept).toEqual(['dep_idle']);
    expect(k8s.events).toContain('scale:Deployment:app-dep_idle:0');
    expect(k8s.events).not.toContain('scale:Deployment:app-dep_active:0');
    expect(k8s.events).not.toContain('scale:Deployment:app-dep_zero:0');
    expect(k8s.events).not.toContain('scale:Deployment:app-dep_reserved:0');
  });

  it('reapIdleServerDeployments() gives a never-hit deployment its full window from creation', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const manager = new WorkspaceManager(
      new TestWorkspaceStore(),
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
    );

    // No last-request annotation, created 20 min ago -> falls back to creation, past window -> sleep.
    seedServerDeploy(k8s, 'dep_fresh_old', {
      replicas: 1,
      creationTimestamp: new Date(Date.now() - 20 * 60_000).toISOString(),
    });
    // No annotation, created just now -> within window -> stays up.
    seedServerDeploy(k8s, 'dep_fresh_new', {
      replicas: 1,
      creationTimestamp: new Date().toISOString(),
    });

    const slept = await manager.reapIdleServerDeployments('workspaces', 15 * 60_000);

    expect(slept).toEqual(['dep_fresh_old']);
  });
});
