import { describe, expect, it } from 'vitest';

import {
  GcePersistentDiskProviderAdapter,
  StaticProjectVolumeProviderResolver,
  parseGcePersistentDiskHandle,
} from './project-volume-erasure-adapters.js';
import {
  ProjectVolumeErasureError,
  captureProjectVolumeErasureInventory,
  executeProjectVolumeErasure,
  type CompleteProjectVolumeReferenceSnapshot,
  type ExactKubernetesDelete,
  type ExactProviderVolumeDelete,
  type ProjectPersistentVolume,
  type ProjectPersistentVolumeClaim,
  type ProjectStorageClass,
  type ProjectVolumeExternalEffect,
  type ProjectVolumeKubernetesAdapter,
  type ProjectVolumeProviderAdapter,
  type ProjectVolumeTenantScope,
  type ProviderVolumeObservation,
  type VolumeReclaimPolicy,
} from './project-volume-erasure.js';

const scope: ProjectVolumeTenantScope = { organizationId: 'organization-1', projectId: 'project-1' };
const namespace = 'workspaces';
const pvcName = 'pvc-workspace-1';
const pvName = 'pv-workspace-1';
const pvcUid = 'pvc-uid-1';
const pvUid = 'pv-uid-1';
const storageClassName = 'workspace-standard-rwo';
const volumeHandle = 'projects/vibecore-prod1/zones/europe-west9-a/disks/pvc-workspace-1';

function metadata(
  name: string,
  uid: string,
  resourceVersion: string,
  options: {
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    finalizers?: string[];
    deletionTimestamp?: string;
  } = {},
) {
  return { name, uid, resourceVersion, ...options };
}

function makePvc(
  options: {
    labels?: Record<string, string>;
    finalizers?: string[];
    uid?: string;
    volumeName?: string;
  } = {},
): ProjectPersistentVolumeClaim {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: metadata(pvcName, options.uid ?? pvcUid, '10', {
      namespace,
      labels:
        options.labels === undefined
          ? { 'vibecore.ai/org-id': scope.organizationId, 'vibecore.ai/project-id': scope.projectId }
          : options.labels,
      annotations: { 'example.invalid/private-token': 'must-never-enter-evidence' },
      finalizers: options.finalizers,
    }),
    spec: {
      volumeName: options.volumeName === undefined ? pvName : options.volumeName,
      storageClassName,
      accessModes: ['ReadWriteOnce'],
    },
    status: { phase: 'Bound' },
  };
}

function makePv(
  reclaimPolicy: VolumeReclaimPolicy,
  options: {
    name?: string;
    uid?: string;
    handle?: string;
    claimName?: string;
    claimUid?: string;
    labels?: Record<string, string>;
    finalizers?: string[];
  } = {},
): ProjectPersistentVolume {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolume',
    metadata: metadata(options.name ?? pvName, options.uid ?? pvUid, '20', {
      labels: options.labels,
      finalizers: options.finalizers ?? ['kubernetes.io/pv-protection'],
    }),
    spec: {
      claimRef: { namespace, name: options.claimName ?? pvcName, uid: options.claimUid ?? pvcUid },
      storageClassName,
      persistentVolumeReclaimPolicy: reclaimPolicy,
      accessModes: ['ReadWriteOnce'],
      csi: { driver: 'pd.csi.storage.gke.io', volumeHandle: options.handle ?? volumeHandle },
    },
    status: { phase: 'Bound' },
  };
}

function makeStorageClass(reclaimPolicy: VolumeReclaimPolicy): ProjectStorageClass {
  return {
    apiVersion: 'storage.k8s.io/v1',
    kind: 'StorageClass',
    metadata: metadata(storageClassName, 'storage-class-uid-1', '30'),
    provisioner: 'pd.csi.storage.gke.io',
    reclaimPolicy,
  };
}

function sourceSnapshot(
  options: {
    references?: CompleteProjectVolumeReferenceSnapshot['references'];
    allowLegacyUnlabelled?: boolean;
  } = {},
): CompleteProjectVolumeReferenceSnapshot {
  return {
    snapshotId: 'snapshot-1',
    completeness: 'all-active-references-for-candidate-claims',
    references: options.references ?? [
      {
        ...scope,
        referenceId: 'workspace-reference-1',
        sourceKind: 'workspace-runtime',
        namespace,
        pvcName,
        expectedPvcUid: pvcUid,
        allowLegacyUnlabelled: options.allowLegacyUnlabelled,
      },
    ],
  };
}

class FakeKubernetes implements ProjectVolumeKubernetesAdapter {
  readonly pvcs = new Map<string, ProjectPersistentVolumeClaim>();
  readonly pvs = new Map<string, ProjectPersistentVolume>();
  readonly storageClasses = new Map<string, ProjectStorageClass>();
  readonly events: string[];
  holdPvcDeletion = false;
  holdPvDeletion = false;

  constructor(events: string[] = []) {
    this.events = events;
  }

  #pvcKey(valueNamespace: string, name: string) {
    return `${valueNamespace}/${name}`;
  }

  async getPersistentVolumeClaim(valueNamespace: string, name: string) {
    this.events.push('io:kubernetes.read-pvc');
    return this.pvcs.get(this.#pvcKey(valueNamespace, name));
  }

  async getPersistentVolume(name: string) {
    this.events.push('io:kubernetes.read-pv');
    return this.pvs.get(name);
  }

  async listPersistentVolumes() {
    this.events.push('io:kubernetes.list-pv');
    return [...this.pvs.values()];
  }

  async getStorageClass(name: string) {
    this.events.push('io:kubernetes.read-storage-class');
    return this.storageClasses.get(name);
  }

  async deletePersistentVolumeClaim(valueNamespace: string, name: string, exact: ExactKubernetesDelete): Promise<void> {
    this.events.push('io:kubernetes.delete-pvc');

    const key = this.#pvcKey(valueNamespace, name);
    const live = this.pvcs.get(key);
    expect(exact).toMatchObject({
      uid: live?.metadata.uid,
      resourceVersion: live?.metadata.resourceVersion,
      propagationPolicy: 'Foreground',
      gracePeriodSeconds: 0,
    });

    if (!live) {
      return;
    }

    if (this.holdPvcDeletion) {
      live.metadata.deletionTimestamp = '2026-08-28T00:00:00.000Z';
      return;
    }

    this.pvcs.delete(key);
  }

  async deletePersistentVolume(name: string, exact: ExactKubernetesDelete): Promise<void> {
    this.events.push('io:kubernetes.delete-pv');

    const live = this.pvs.get(name);
    expect(exact).toMatchObject({
      uid: live?.metadata.uid,
      resourceVersion: live?.metadata.resourceVersion,
      propagationPolicy: 'Foreground',
      gracePeriodSeconds: 0,
    });

    if (!live) {
      return;
    }

    if (this.holdPvDeletion) {
      live.metadata.deletionTimestamp = '2026-08-28T00:00:00.000Z';
      return;
    }

    this.pvs.delete(name);
  }
}

class FakeProvider implements ProjectVolumeProviderAdapter {
  readonly csiDriver = 'pd.csi.storage.gke.io';
  readonly volumes = new Map<string, string>();
  readonly events: string[];
  loseFirstDeleteResponse = false;
  #lostResponse = false;

  constructor(events: string[] = []) {
    this.events = events;
  }

  async inspect(handle: string): Promise<ProviderVolumeObservation> {
    this.events.push('io:provider.inspect-volume');

    const resourceId = this.volumes.get(handle);

    return resourceId ? { exists: true, resourceId } : { exists: false };
  }

  async deleteExact(input: ExactProviderVolumeDelete): Promise<void> {
    this.events.push('io:provider.delete-volume');
    expect(input.requestId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);

    if (this.volumes.get(input.volumeHandle) !== input.expectedResourceId) {
      throw new Error('fake CAS conflict');
    }

    this.volumes.delete(input.volumeHandle);

    if (this.loseFirstDeleteResponse && !this.#lostResponse) {
      this.#lostResponse = true;
      throw new Error('simulated connection loss after provider accepted DELETE');
    }
  }
}

function fixture(reclaimPolicy: VolumeReclaimPolicy = 'Delete') {
  const events: string[] = [];
  const kubernetes = new FakeKubernetes(events);
  const provider = new FakeProvider(events);
  kubernetes.pvcs.set(`${namespace}/${pvcName}`, makePvc());
  kubernetes.pvs.set(pvName, makePv(reclaimPolicy));
  kubernetes.storageClasses.set(storageClassName, makeStorageClass(reclaimPolicy));
  provider.volumes.set(volumeHandle, '9876543210');

  const providers = new StaticProjectVolumeProviderResolver([provider]);

  const leaseGuard = {
    async assertLease(effect: ProjectVolumeExternalEffect) {
      events.push(`guard:${effect}`);
    },
  };

  return { events, kubernetes, provider, providers, leaseGuard };
}

async function capture(input = fixture()) {
  const inventory = await captureProjectVolumeErasureInventory({
    scope,
    sourceSnapshot: sourceSnapshot(),
    kubernetes: input.kubernetes,
    providers: input.providers,
    leaseGuard: input.leaseGuard,
  });
  input.events.length = 0;

  return inventory;
}

async function execute(input: ReturnType<typeof fixture>, inventory: Awaited<ReturnType<typeof capture>>) {
  return executeProjectVolumeErasure({
    expectedScope: scope,
    inventory,
    kubernetes: input.kubernetes,
    providers: input.providers,
    leaseGuard: input.leaseGuard,
    pollPolicy: { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0 },
    clock: { sleep: () => Promise.resolve() },
  });
}

function expectEveryIoGuarded(events: readonly string[]): void {
  for (let index = 0; index < events.length; index += 1) {
    if (events[index]?.startsWith('io:')) {
      expect(events[index - 1]).toBe(events[index]!.replace('io:', 'guard:'));
    }
  }
}

describe('project volume permanent erasure', () => {
  it('captures a compact deterministic, secret-free inventory before effects', async () => {
    const input = fixture();

    const first = await captureProjectVolumeErasureInventory({
      scope,
      sourceSnapshot: sourceSnapshot(),
      kubernetes: input.kubernetes,
      providers: input.providers,
      leaseGuard: input.leaseGuard,
    });
    const second = await captureProjectVolumeErasureInventory({
      scope,
      sourceSnapshot: sourceSnapshot({ references: [...sourceSnapshot().references].reverse() }),
      kubernetes: input.kubernetes,
      providers: input.providers,
      leaseGuard: input.leaseGuard,
    });

    expect(first.inventoryHash).toBe(second.inventoryHash);
    expect(first.entries[0]).toMatchObject({
      disposition: 'erase',
      claim: { uid: pvcUid, resourceVersion: '10' },
      volume: {
        uid: pvUid,
        resourceVersion: '20',
        csiDriver: 'pd.csi.storage.gke.io',
        volumeHandle,
        storageClassName,
        storageClassProvisioner: 'pd.csi.storage.gke.io',
        reclaimPolicy: 'Delete',
        providerResourceId: '9876543210',
      },
    });
    expect(JSON.stringify(first)).not.toContain('must-never-enter-evidence');
    expect(JSON.stringify(first)).not.toContain('private-token');
    expectEveryIoGuarded(input.events);
  });

  it('erases a Delete-policy PVC, begins foreground PV deletion, then proves provider and PV absence', async () => {
    const input = fixture('Delete');
    const inventory = await capture(input);
    const evidence = await execute(input, inventory);

    expect(input.events.filter((event) => event.startsWith('io:'))).toEqual([
      'io:kubernetes.list-pv',
      'io:kubernetes.read-pvc',
      'io:kubernetes.delete-pvc',
      'io:kubernetes.read-pvc',
      'io:kubernetes.read-pv',
      'io:kubernetes.delete-pv',
      'io:provider.inspect-volume',
      'io:provider.delete-volume',
      'io:provider.inspect-volume',
      'io:kubernetes.read-pv',
    ]);
    expectEveryIoGuarded(input.events);
    expect(input.kubernetes.pvcs.size).toBe(0);
    expect(input.kubernetes.pvs.size).toBe(0);
    expect(input.provider.volumes.size).toBe(0);
    expect(evidence).toMatchObject({
      verified: true,
      entries: [{ pvcAbsent: true, pvAbsent: true, providerAbsent: true }],
    });
    expect(evidence.verificationHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('erases the provider disk before a Retain-policy PV, so Retain cannot preserve project data', async () => {
    const input = fixture('Retain');
    const inventory = await capture(input);
    await execute(input, inventory);

    const io = input.events.filter((event) => event.startsWith('io:'));
    expect(io.indexOf('io:provider.delete-volume')).toBeLessThan(io.indexOf('io:kubernetes.delete-pv'));
    expect(input.provider.volumes.size).toBe(0);
    expect(input.kubernetes.pvs.size).toBe(0);
    expectEveryIoGuarded(input.events);
  });

  it('inventories and erases a Retain PV/provider even when the PVC disappeared before capture', async () => {
    const input = fixture('Retain');
    input.kubernetes.pvcs.delete(`${namespace}/${pvcName}`);

    const inventory = await capture(input);
    expect(inventory.entries).toMatchObject([
      { disposition: 'erase-orphan', expectedPvcUid: pvcUid, volumes: [{ name: pvName, providerPresent: true }] },
    ]);

    const evidence = await execute(input, inventory);
    expect(evidence.entries).toEqual([
      {
        namespace,
        pvcName,
        disposition: 'erase-orphan',
        pvcAbsent: true,
        pvAbsent: true,
        providerAbsent: true,
      },
    ]);
    const io = input.events.filter((event) => event.startsWith('io:'));
    expect(io.indexOf('io:provider.delete-volume')).toBeLessThan(io.indexOf('io:kubernetes.delete-pv'));
    expect(input.provider.volumes.size).toBe(0);
    expect(input.kubernetes.pvs.size).toBe(0);
    expectEveryIoGuarded(input.events);
  });

  it('fails closed when an absent PVC leaves a PV whose claimRef UID has no durable authority', async () => {
    const input = fixture('Retain');
    input.kubernetes.pvcs.delete(`${namespace}/${pvcName}`);
    const snapshot = sourceSnapshot({
      references: sourceSnapshot().references.map(({ expectedPvcUid: _expectedPvcUid, ...reference }) => reference),
    });

    await expect(
      captureProjectVolumeErasureInventory({
        scope,
        sourceSnapshot: snapshot,
        kubernetes: input.kubernetes,
        providers: input.providers,
        leaseGuard: input.leaseGuard,
      }),
    ).rejects.toMatchObject({ code: 'VOLUME_ERASURE_ORPHAN_IDENTITY_UNPROVEN' });
    expect(input.provider.volumes.get(volumeHandle)).toBe('9876543210');
    expect(input.kubernetes.pvs.has(pvName)).toBe(true);
  });

  it('accepts an unlabelled legacy claim only with exact durable source authority', async () => {
    const input = fixture();
    input.kubernetes.pvcs.set(`${namespace}/${pvcName}`, makePvc({ labels: {} }));

    await expect(
      captureProjectVolumeErasureInventory({
        scope,
        sourceSnapshot: sourceSnapshot(),
        kubernetes: input.kubernetes,
        providers: input.providers,
        leaseGuard: input.leaseGuard,
      }),
    ).rejects.toMatchObject({ code: 'VOLUME_ERASURE_LEGACY_OWNERSHIP_UNPROVEN' });

    const inventory = await captureProjectVolumeErasureInventory({
      scope,
      sourceSnapshot: sourceSnapshot({ allowLegacyUnlabelled: true }),
      kubernetes: input.kubernetes,
      providers: input.providers,
      leaseGuard: input.leaseGuard,
    });
    expect(inventory.entries[0]).toMatchObject({
      disposition: 'erase',
      claim: { ownership: 'legacy-source-reference' },
    });
  });

  it('refcounts durable cross-project claim references and excludes shared storage from all effects', async () => {
    const input = fixture();

    const inventory = await captureProjectVolumeErasureInventory({
      scope,
      sourceSnapshot: sourceSnapshot({
        references: [
          ...sourceSnapshot().references,
          {
            organizationId: 'organization-2',
            projectId: 'project-2',
            referenceId: 'workspace-reference-2',
            sourceKind: 'workspace-runtime',
            namespace,
            pvcName,
            expectedPvcUid: pvcUid,
          },
        ],
      }),
      kubernetes: input.kubernetes,
      providers: input.providers,
      leaseGuard: input.leaseGuard,
    });

    expect(inventory.entries[0]).toMatchObject({
      disposition: 'excluded-shared',
      exclusionReason: 'shared-source-reference',
      sourceReferenceCount: 2,
      distinctTenantCount: 2,
    });
    input.events.length = 0;

    const evidence = await execute(input, inventory);
    expect(input.events).toEqual([]);
    expect(input.kubernetes.pvcs.size).toBe(1);
    expect(input.provider.volumes.size).toBe(1);
    expect(evidence.entries[0]).toMatchObject({ disposition: 'excluded-shared', pvcAbsent: false });
  });

  it('excludes a duplicated CSI volumeHandle even if only one duplicate has a project source row', async () => {
    const input = fixture();
    input.kubernetes.pvs.set(
      'pv-unrelated',
      makePv('Delete', {
        name: 'pv-unrelated',
        uid: 'pv-uid-unrelated',
        handle: volumeHandle,
        claimName: 'pvc-unrelated',
        claimUid: 'pvc-uid-unrelated',
      }),
    );

    const inventory = await captureProjectVolumeErasureInventory({
      scope,
      sourceSnapshot: sourceSnapshot(),
      kubernetes: input.kubernetes,
      providers: input.providers,
      leaseGuard: input.leaseGuard,
    });
    expect(inventory.entries[0]).toMatchObject({
      disposition: 'excluded-shared',
      exclusionReason: 'shared-csi-volume-handle',
      clusterVolumeHandleReferenceCount: 2,
    });
  });

  it('fails closed on a blocking PVC finalizer and never reaches PV/provider deletion', async () => {
    const input = fixture();
    input.kubernetes.holdPvcDeletion = true;
    input.kubernetes.pvcs.set(
      `${namespace}/${pvcName}`,
      makePvc({ finalizers: ['example.invalid/manual-protection'] }),
    );

    const inventory = await capture(input);

    await expect(execute(input, inventory)).rejects.toMatchObject({ code: 'VOLUME_ERASURE_PVC_ABSENCE_TIMEOUT' });
    expect(input.events).not.toContain('io:kubernetes.delete-pv');
    expect(input.events).not.toContain('io:provider.delete-volume');
    expect(input.kubernetes.pvcs.size).toBe(1);
    expectEveryIoGuarded(input.events);
  });

  it('never strips a blocking PV finalizer or mistakes provider absence for PV absence', async () => {
    const input = fixture();
    input.kubernetes.holdPvDeletion = true;
    input.kubernetes.pvs.set(
      pvName,
      makePv('Delete', { finalizers: ['external-provisioner.volume.kubernetes.io/finalizer'] }),
    );

    const inventory = await capture(input);

    await expect(execute(input, inventory)).rejects.toMatchObject({ code: 'VOLUME_ERASURE_PV_ABSENCE_TIMEOUT' });
    expect(input.provider.volumes.size).toBe(0);
    expect(input.kubernetes.pvs.get(pvName)?.metadata.finalizers).toEqual([
      'external-provisioner.volume.kubernetes.io/finalizer',
    ]);
    expectEveryIoGuarded(input.events);
  });

  it('replays idempotently after provider accepted deletion but the caller lost the response', async () => {
    const input = fixture();
    input.provider.loseFirstDeleteResponse = true;

    const inventory = await capture(input);

    await expect(execute(input, inventory)).rejects.toThrow('simulated connection loss');
    expect(input.provider.volumes.size).toBe(0);
    input.events.length = 0;

    const replay = await execute(input, inventory);

    expect(replay.verified).toBe(true);
    expect(input.events).not.toContain('io:provider.delete-volume');
    expectEveryIoGuarded(input.events);
  });

  it('rejects a live claim owned by another tenant before provider inspection or deletion', async () => {
    const input = fixture();
    input.kubernetes.pvcs.set(
      `${namespace}/${pvcName}`,
      makePvc({ labels: { 'vibecore.ai/org-id': 'organization-2', 'vibecore.ai/project-id': 'project-2' } }),
    );
    input.events.length = 0;

    await expect(
      captureProjectVolumeErasureInventory({
        scope,
        sourceSnapshot: sourceSnapshot(),
        kubernetes: input.kubernetes,
        providers: input.providers,
        leaseGuard: input.leaseGuard,
      }),
    ).rejects.toMatchObject({ code: 'VOLUME_ERASURE_TENANT_CONFLICT' });
    expect(input.events).not.toContain('io:provider.inspect-volume');
    expect(input.events).not.toContain('io:provider.delete-volume');
  });

  it('rejects same-name PVC replacement after capture without deleting either identity', async () => {
    const input = fixture();
    const inventory = await capture(input);
    input.kubernetes.pvcs.set(`${namespace}/${pvcName}`, makePvc({ uid: 'pvc-uid-replacement' }));

    await expect(execute(input, inventory)).rejects.toMatchObject({ code: 'VOLUME_ERASURE_PVC_REPLACED' });
    expect(input.events).not.toContain('io:kubernetes.delete-pvc');
    expect(input.events).not.toContain('io:provider.delete-volume');
  });

  it('rejects provider identity replacement after capture and preserves the replacement disk', async () => {
    const input = fixture();
    const inventory = await capture(input);
    input.provider.volumes.set(volumeHandle, '1111111111');

    await expect(execute(input, inventory)).rejects.toMatchObject({ code: 'VOLUME_ERASURE_PROVIDER_VOLUME_REPLACED' });
    expect(input.provider.volumes.get(volumeHandle)).toBe('1111111111');
    expect(input.events).not.toContain('io:provider.delete-volume');
  });

  it('rechecks live CSI refcounts under lease and rejects a post-capture shared PV', async () => {
    const input = fixture();
    const inventory = await capture(input);
    input.kubernetes.pvs.set(
      'pv-late-shared-reference',
      makePv('Delete', {
        name: 'pv-late-shared-reference',
        uid: 'pv-uid-late-shared',
        handle: volumeHandle,
        claimName: 'pvc-late-shared',
        claimUid: 'pvc-uid-late-shared',
      }),
    );

    await expect(execute(input, inventory)).rejects.toMatchObject({ code: 'VOLUME_ERASURE_SHARED_HANDLE_CHANGED' });
    expect(input.events).not.toContain('io:kubernetes.delete-pvc');
    expect(input.events).not.toContain('io:provider.delete-volume');
    expectEveryIoGuarded(input.events);
  });

  it('fails closed when the CSI driver has no exact provider adapter', async () => {
    const input = fixture();
    await expect(
      captureProjectVolumeErasureInventory({
        scope,
        sourceSnapshot: sourceSnapshot(),
        kubernetes: input.kubernetes,
        providers: new StaticProjectVolumeProviderResolver(),
        leaseGuard: input.leaseGuard,
      }),
    ).rejects.toMatchObject({ code: 'VOLUME_ERASURE_PROVIDER_ADAPTER_REQUIRED' });
  });
});

describe('GCE Persistent Disk provider adapter', () => {
  it('parses zonal and regional GKE CSI handles and rejects non-canonical input', () => {
    expect(parseGcePersistentDiskHandle(volumeHandle)).toEqual({
      project: 'vibecore-prod1',
      locationKind: 'zones',
      location: 'europe-west9-a',
      disk: 'pvc-workspace-1',
    });
    expect(
      parseGcePersistentDiskHandle('projects/vibecore-prod1/regions/europe-west9/disks/pvc-workspace-regional'),
    ).toMatchObject({ locationKind: 'regions', location: 'europe-west9' });
    expect(() => parseGcePersistentDiskHandle('https://attacker.invalid/disks/delete-me')).toThrow(
      ProjectVolumeErasureError,
    );
  });

  it('uses fixed-origin Compute REST requests, ADC bearer auth, and idempotent requestId', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    const responses = [
      new Response(JSON.stringify({ id: '9876543210' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      new Response(JSON.stringify({ name: 'operation-1', status: 'RUNNING' }), { status: 200 }),
    ];
    const adapter = new GcePersistentDiskProviderAdapter({
      tokenProvider: {
        async getAccessToken() {
          return 'ephemeral-adc-token';
        },
      },
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        return responses.shift()!;
      },
    });

    await expect(adapter.inspect(volumeHandle)).resolves.toEqual({ exists: true, resourceId: '9876543210' });
    await adapter.deleteExact({
      volumeHandle,
      expectedResourceId: '9876543210',
      requestId: 'aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa',
    });

    expect(calls[0]?.url).toBe(
      'https://compute.googleapis.com/compute/v1/projects/vibecore-prod1/zones/europe-west9-a/disks/pvc-workspace-1',
    );
    expect(calls[1]?.url).toBe(
      'https://compute.googleapis.com/compute/v1/projects/vibecore-prod1/zones/europe-west9-a/disks/pvc-workspace-1?requestId=aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(calls.map((call) => call.init?.headers)).toEqual([
      { accept: 'application/json', authorization: 'Bearer ephemeral-adc-token' },
      { accept: 'application/json', authorization: 'Bearer ephemeral-adc-token' },
    ]);
  });

  it('rejects a canonical disk handle outside the configured provider-project boundary before auth or fetch', async () => {
    let tokenCalls = 0;
    let fetchCalls = 0;
    const adapter = new GcePersistentDiskProviderAdapter({
      allowedProjects: ['vibecore-allowed1'],
      tokenProvider: {
        async getAccessToken() {
          tokenCalls += 1;
          return 'must-not-be-used';
        },
      },
      fetch: async () => {
        fetchCalls += 1;
        return new Response(undefined, { status: 404 });
      },
    });

    await expect(adapter.inspect(volumeHandle)).rejects.toMatchObject({
      code: 'VOLUME_ERASURE_GCE_PROJECT_FORBIDDEN',
      statusCode: 409,
    });
    expect(tokenCalls).toBe(0);
    expect(fetchCalls).toBe(0);
  });

  it('applies the provider deadline to ADC token acquisition before issuing Compute I/O', async () => {
    let fetchCalls = 0;
    const adapter = new GcePersistentDiskProviderAdapter({
      allowedProjects: ['vibecore-prod1'],
      timeoutMs: 10,
      tokenProvider: {
        getAccessToken() {
          return new Promise<string>(() => undefined);
        },
      },
      fetch: async () => {
        fetchCalls += 1;
        return new Response(undefined, { status: 404 });
      },
    });

    await expect(adapter.inspect(volumeHandle)).rejects.toMatchObject({
      code: 'VOLUME_ERASURE_GCE_TIMEOUT',
      statusCode: 503,
    });
    expect(fetchCalls).toBe(0);
  });
});
