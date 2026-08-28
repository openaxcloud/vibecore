import { createHash } from 'node:crypto';

const PROJECT_LABELS = ['vibecore.ai/project-id', 'vibecore.ai/project'] as const;
const ORGANIZATION_LABELS = ['vibecore.ai/org-id', 'vibecore.ai/org'] as const;
const SHARED_LABELS = ['vibecore.ai/shared', 'vibecore.ai/shared-storage'] as const;
const GCE_PD_CSI_DRIVER = 'pd.csi.storage.gke.io';
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const KUBERNETES_NAME_RE = /^[a-z0-9](?:[-a-z0-9.]{0,251}[a-z0-9])?$/u;

export type VolumeReclaimPolicy = 'Delete' | 'Retain';
export type ProjectVolumeSourceKind =
  | 'workspace-runtime'
  | 'project-persistent-volume'
  | 'reserved-vm'
  | 'runtime-effect-target';

export class ProjectVolumeErasureError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProjectVolumeErasureError';
  }
}

export interface ProjectVolumeTenantScope {
  organizationId: string;
  projectId: string;
}

/**
 * A caller obtains these rows from its durable workspace/server-runtime source
 * of truth. The snapshot MUST include every active project reference for the
 * candidate claim names, not only rows belonging to the project being erased.
 */
export interface ProjectVolumeSourceReference extends ProjectVolumeTenantScope {
  referenceId: string;
  sourceKind: ProjectVolumeSourceKind;
  namespace: string;
  pvcName: string;
  expectedPvcUid?: string;

  /** Required to authorize a pre-label-era claim. Label conflicts are never waived. */
  allowLegacyUnlabelled?: boolean;
}

export interface CompleteProjectVolumeReferenceSnapshot {
  snapshotId: string;
  completeness: 'all-active-references-for-candidate-claims';
  /**
   * Exact claims selected by the deletion inventory. A candidate can have no
   * remaining source row (for example an orphan found by the project label
   * scan), while `references` still proves that every surviving reference to
   * these names was captured.
   */
  candidates?: readonly {
    namespace: string;
    pvcName: string;
    expectedPvcUid?: string;
  }[];
  references: readonly ProjectVolumeSourceReference[];
}

export interface KubernetesObjectMetadata {
  name: string;
  namespace?: string;
  uid: string;
  resourceVersion: string;
  labels?: Readonly<Record<string, string>>;
  annotations?: Readonly<Record<string, string>>;
  finalizers?: readonly string[];
  deletionTimestamp?: string;
}

export interface ProjectPersistentVolumeClaim {
  apiVersion: 'v1';
  kind: 'PersistentVolumeClaim';
  metadata: KubernetesObjectMetadata;
  spec: {
    volumeName?: string;
    storageClassName?: string;
    accessModes?: readonly string[];
  };
  status?: { phase?: string };
}

export interface ProjectPersistentVolume {
  apiVersion: 'v1';
  kind: 'PersistentVolume';
  metadata: KubernetesObjectMetadata;
  spec: {
    claimRef?: { namespace?: string; name?: string; uid?: string };
    storageClassName?: string;
    persistentVolumeReclaimPolicy?: string;
    accessModes?: readonly string[];
    csi?: { driver?: string; volumeHandle?: string };
  };
  status?: { phase?: string };
}

export interface ProjectStorageClass {
  apiVersion: 'storage.k8s.io/v1';
  kind: 'StorageClass';
  metadata: KubernetesObjectMetadata;
  provisioner: string;
  reclaimPolicy?: string;
}

export interface ExactKubernetesDelete {
  uid: string;
  resourceVersion: string;
  propagationPolicy: 'Foreground';
  gracePeriodSeconds: 0;
}

/** A narrow, independently wireable Kubernetes control-plane boundary. */
export interface ProjectVolumeKubernetesAdapter {
  getPersistentVolumeClaim(namespace: string, name: string): Promise<ProjectPersistentVolumeClaim | undefined>;
  getPersistentVolume(name: string): Promise<ProjectPersistentVolume | undefined>;
  listPersistentVolumes(): Promise<readonly ProjectPersistentVolume[]>;
  getStorageClass(name: string): Promise<ProjectStorageClass | undefined>;
  deletePersistentVolumeClaim(namespace: string, name: string, exact: ExactKubernetesDelete): Promise<void>;
  deletePersistentVolume(name: string, exact: ExactKubernetesDelete): Promise<void>;
}

export interface ProviderVolumeObservation {
  exists: boolean;

  /** Immutable provider identity (for GCE PD, the numeric disk `id`). */
  resourceId?: string;
}

export interface ExactProviderVolumeDelete {
  volumeHandle: string;
  expectedResourceId: string;

  /** Stable UUID, so provider retries cannot create a second delete operation. */
  requestId: string;
}

export interface ProjectVolumeProviderAdapter {
  readonly csiDriver: string;
  inspect(volumeHandle: string): Promise<ProviderVolumeObservation>;
  deleteExact(input: ExactProviderVolumeDelete): Promise<void>;
}

export interface ProjectVolumeProviderResolver {
  resolve(csiDriver: string): ProjectVolumeProviderAdapter | undefined;
}

export interface ProjectVolumeLeaseGuard {
  /**
   * Revalidates the caller's durable erasure lease/fencing token. It is invoked
   * immediately before every Kubernetes/provider request, including poll reads.
   */
  assertLease(effect: ProjectVolumeExternalEffect): Promise<void>;
}

export type ProjectVolumeExternalEffect =
  | 'kubernetes.read-pvc'
  | 'kubernetes.delete-pvc'
  | 'kubernetes.read-pv'
  | 'kubernetes.list-pv'
  | 'kubernetes.read-storage-class'
  | 'kubernetes.delete-pv'
  | 'provider.inspect-volume'
  | 'provider.delete-volume';

export interface ProjectVolumeErasurePollPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface ProjectVolumeErasureClock {
  sleep(milliseconds: number): Promise<void>;
}

interface InventoryClaim {
  namespace: string;
  name: string;
  uid: string;
  resourceVersion: string;
  finalizers: readonly string[];
  ownership: 'tenant-labels' | 'legacy-source-reference';
}

interface InventoryVolume {
  name: string;
  uid: string;
  resourceVersion: string;
  finalizers: readonly string[];
  csiDriver: string;
  volumeHandle: string;
  storageClassName: string | null;
  storageClassProvisioner: string | null;
  storageClassReclaimPolicy: VolumeReclaimPolicy | null;
  reclaimPolicy: VolumeReclaimPolicy;
  providerPresent: boolean;
  providerResourceId: string | null;
}

interface InventoryEntryBase {
  namespace: string;
  pvcName: string;
  sourceEvidenceHash: string;
  sourceReferenceCount: number;
  distinctTenantCount: number;
}

export interface AbsentProjectVolumeInventoryEntry extends InventoryEntryBase {
  disposition: 'already-absent';
}

export type SharedProjectVolumeExclusionReason =
  | 'shared-source-reference'
  | 'shared-csi-volume-handle'
  | 'shared-storage-marker';

export interface ExcludedProjectVolumeInventoryEntry extends InventoryEntryBase {
  disposition: 'excluded-shared';
  exclusionReason: SharedProjectVolumeExclusionReason;
  claim: InventoryClaim;
  volume: Omit<InventoryVolume, 'providerPresent' | 'providerResourceId'> | null;
  clusterVolumeHandleReferenceCount: number;
}

export interface ErasableProjectVolumeInventoryEntry extends InventoryEntryBase {
  disposition: 'erase';
  claim: InventoryClaim;
  volume: InventoryVolume | null;
}

/**
 * A PVC may already be gone while a Retain-policy or finalizer-blocked PV still
 * owns provider bytes. Such a PV is erasable only when a durable source row
 * retained the exact PVC UID found in claimRef; a same-name guess is never
 * deletion authority.
 */
export interface OrphanedProjectVolumeInventoryEntry extends InventoryEntryBase {
  disposition: 'erase-orphan';
  expectedPvcUid: string;
  volumes: readonly InventoryVolume[];
}

export type ProjectVolumeErasureInventoryEntry =
  | AbsentProjectVolumeInventoryEntry
  | ExcludedProjectVolumeInventoryEntry
  | ErasableProjectVolumeInventoryEntry
  | OrphanedProjectVolumeInventoryEntry;

interface UnsealedProjectVolumeErasureInventory {
  schemaVersion: 1;
  scope: ProjectVolumeTenantScope;
  referenceSnapshotHash: string;
  entries: readonly ProjectVolumeErasureInventoryEntry[];
}

export interface ProjectVolumeErasureInventory extends UnsealedProjectVolumeErasureInventory {
  inventoryHash: string;
}

export interface CaptureProjectVolumeErasureInput {
  scope: ProjectVolumeTenantScope;
  sourceSnapshot: CompleteProjectVolumeReferenceSnapshot;
  kubernetes: ProjectVolumeKubernetesAdapter;
  providers: ProjectVolumeProviderResolver;
  leaseGuard: ProjectVolumeLeaseGuard;
}

export interface ExecuteProjectVolumeErasureInput {
  expectedScope: ProjectVolumeTenantScope;
  inventory: ProjectVolumeErasureInventory;
  kubernetes: ProjectVolumeKubernetesAdapter;
  providers: ProjectVolumeProviderResolver;
  leaseGuard: ProjectVolumeLeaseGuard;
  pollPolicy?: Partial<ProjectVolumeErasurePollPolicy>;
  clock?: ProjectVolumeErasureClock;
}

export interface ProjectVolumeErasureEntryEvidence {
  namespace: string;
  pvcName: string;
  disposition: ProjectVolumeErasureInventoryEntry['disposition'];
  pvcAbsent: boolean;
  pvAbsent: boolean;
  providerAbsent: boolean;
  exclusionReason?: SharedProjectVolumeExclusionReason;
}

export interface ProjectVolumeErasureEvidence {
  schemaVersion: 1;
  inventoryHash: string;
  entries: readonly ProjectVolumeErasureEntryEvidence[];
  verified: true;
  verificationHash: string;
}

const DEFAULT_POLL_POLICY: ProjectVolumeErasurePollPolicy = {
  // One persisted entry is processed per manager request. Production adapters
  // use a 4s request deadline; six polls bound the complete PVC/provider/PV
  // entry below the API's 180s transport deadline even when every read times
  // out. A still-deleting disk is resumed from the sealed entry on replay.
  maxAttempts: 6,
  initialDelayMs: 250,
  maxDelayMs: 2_000,
};

const DEFAULT_CLOCK: ProjectVolumeErasureClock = {
  sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  },
};

function erasureError(code: string, message: string, statusCode = 409, cause?: unknown): ProjectVolumeErasureError {
  return new ProjectVolumeErasureError(code, message, statusCode, cause === undefined ? undefined : { cause });
}

function assertSafeId(value: string, field: string): void {
  if (!SAFE_ID_RE.test(value)) {
    throw erasureError('VOLUME_ERASURE_INPUT_INVALID', `${field} is invalid.`, 400);
  }
}

function assertKubernetesName(value: string, field: string): void {
  if (!KUBERNETES_NAME_RE.test(value)) {
    throw erasureError('VOLUME_ERASURE_INPUT_INVALID', `${field} is invalid.`, 400);
  }
}

function assertScope(scope: ProjectVolumeTenantScope): void {
  assertSafeId(scope.organizationId, 'organizationId');
  assertSafeId(scope.projectId, 'projectId');
}

function claimKey(namespace: string, pvcName: string): string {
  return `${namespace}/${pvcName}`;
}

function sortedUnique(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw erasureError('VOLUME_ERASURE_EVIDENCE_INVALID', 'Evidence contains a non-finite number.', 500);
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }

  throw erasureError('VOLUME_ERASURE_EVIDENCE_INVALID', 'Evidence contains an unsupported value.', 500);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

function sealInventory(unsigned: UnsealedProjectVolumeErasureInventory): ProjectVolumeErasureInventory {
  return { ...unsigned, inventoryHash: sha256(unsigned) };
}

export function assertProjectVolumeErasureInventory(inventory: ProjectVolumeErasureInventory): void {
  const { inventoryHash, ...unsigned } = inventory;

  if (!/^[a-f0-9]{64}$/u.test(inventoryHash) || sha256(unsigned) !== inventoryHash) {
    throw erasureError('VOLUME_ERASURE_INVENTORY_TAMPERED', 'The persisted volume inventory hash is invalid.');
  }
}

function parseReclaimPolicy(value: string | undefined, field: string): VolumeReclaimPolicy {
  if (value !== 'Delete' && value !== 'Retain') {
    throw erasureError('VOLUME_ERASURE_RECLAIM_POLICY_UNSUPPORTED', `${field} must be Delete or Retain.`);
  }

  return value;
}

function labelValue(
  labels: Readonly<Record<string, string>> | undefined,
  names: readonly string[],
): string | undefined {
  const values = sortedUnique(names.map((name) => labels?.[name]).filter((value): value is string => Boolean(value)));

  if (values.length > 1) {
    throw erasureError('VOLUME_ERASURE_TENANT_CONFLICT', 'Kubernetes ownership aliases disagree.');
  }

  return values[0];
}

function assertClaimOwnership(
  claim: ProjectPersistentVolumeClaim,
  scope: ProjectVolumeTenantScope,
  legacyAuthorized: boolean,
): InventoryClaim['ownership'] {
  const projectId = labelValue(claim.metadata.labels, PROJECT_LABELS);
  const organizationId = labelValue(claim.metadata.labels, ORGANIZATION_LABELS);

  if (!projectId && !organizationId) {
    if (!legacyAuthorized) {
      throw erasureError(
        'VOLUME_ERASURE_LEGACY_OWNERSHIP_UNPROVEN',
        'An unlabelled claim lacks durable legacy authority.',
      );
    }

    return 'legacy-source-reference';
  }

  if (!projectId || !organizationId || projectId !== scope.projectId || organizationId !== scope.organizationId) {
    throw erasureError('VOLUME_ERASURE_TENANT_CONFLICT', 'The live claim belongs to a different tenant.');
  }

  return 'tenant-labels';
}

function hasSharedMarker(...labels: Array<Readonly<Record<string, string>> | undefined>): boolean {
  return labels.some(
    (record) =>
      SHARED_LABELS.some((label) => record?.[label]?.toLowerCase() === 'true') ||
      record?.['vibecore.ai/storage-scope']?.toLowerCase() === 'shared',
  );
}

function assertMetadata(metadata: KubernetesObjectMetadata, expectedName: string, expectedNamespace?: string): void {
  if (
    metadata.name !== expectedName ||
    (expectedNamespace !== undefined && metadata.namespace !== expectedNamespace) ||
    !metadata.uid ||
    !metadata.resourceVersion
  ) {
    throw erasureError(
      'VOLUME_ERASURE_KUBERNETES_IDENTITY_INVALID',
      'Kubernetes returned incomplete resource identity.',
      502,
    );
  }

  assertSafeId(metadata.uid, 'Kubernetes UID');
  assertSafeId(metadata.resourceVersion, 'Kubernetes resourceVersion');
}

function assertProviderObservation(observation: ProviderVolumeObservation): void {
  if (observation.exists) {
    if (!observation.resourceId) {
      throw erasureError('VOLUME_ERASURE_PROVIDER_IDENTITY_INVALID', 'Provider volume identity is missing.', 502);
    }

    assertSafeId(observation.resourceId, 'provider resource ID');
  } else if (observation.resourceId !== undefined) {
    throw erasureError('VOLUME_ERASURE_PROVIDER_IDENTITY_INVALID', 'Absent provider volume returned an identity.', 502);
  }
}

function providerFor(resolver: ProjectVolumeProviderResolver, csiDriver: string): ProjectVolumeProviderAdapter {
  const provider = resolver.resolve(csiDriver);

  if (!provider || provider.csiDriver !== csiDriver) {
    throw erasureError(
      'VOLUME_ERASURE_PROVIDER_ADAPTER_REQUIRED',
      `No exact-delete provider adapter is configured for CSI driver ${csiDriver}.`,
      503,
    );
  }

  return provider;
}

function sourceReferenceEvidence(references: readonly ProjectVolumeSourceReference[]): string {
  return sha256(
    [...references]
      .map((reference) => ({
        referenceId: reference.referenceId,
        sourceKind: reference.sourceKind,
        organizationId: reference.organizationId,
        projectId: reference.projectId,
        namespace: reference.namespace,
        pvcName: reference.pvcName,
        expectedPvcUid: reference.expectedPvcUid ?? null,
        allowLegacyUnlabelled: reference.allowLegacyUnlabelled === true,
      }))
      .sort((left, right) => left.referenceId.localeCompare(right.referenceId)),
  );
}

function referenceSnapshotEvidence(snapshot: CompleteProjectVolumeReferenceSnapshot): string {
  return sha256({
    snapshotId: snapshot.snapshotId,
    completeness: snapshot.completeness,
    candidates: [...(snapshot.candidates ?? [])].sort(
      (left, right) => left.namespace.localeCompare(right.namespace) || left.pvcName.localeCompare(right.pvcName),
    ),
    references: [...snapshot.references].sort((left, right) => left.referenceId.localeCompare(right.referenceId)),
  });
}

function withoutProviderState(
  volume: InventoryVolume,
): Omit<InventoryVolume, 'providerPresent' | 'providerResourceId'> {
  const { providerPresent: _providerPresent, providerResourceId: _providerResourceId, ...rest } = volume;
  return rest;
}

function validateSourceSnapshot(
  scope: ProjectVolumeTenantScope,
  snapshot: CompleteProjectVolumeReferenceSnapshot,
): Map<string, ProjectVolumeSourceReference[]> {
  assertSafeId(snapshot.snapshotId, 'reference snapshot ID');

  if (snapshot.completeness !== 'all-active-references-for-candidate-claims') {
    throw erasureError(
      'VOLUME_ERASURE_SOURCE_SNAPSHOT_INCOMPLETE',
      'The durable reference snapshot is incomplete.',
      400,
    );
  }

  const referenceIds = new Set<string>();
  const groups = new Map<string, ProjectVolumeSourceReference[]>();

  for (const candidate of snapshot.candidates ?? []) {
    assertKubernetesName(candidate.namespace, 'PVC namespace');
    assertKubernetesName(candidate.pvcName, 'PVC name');
    if (candidate.expectedPvcUid) assertSafeId(candidate.expectedPvcUid, 'expected PVC UID');
    const key = claimKey(candidate.namespace, candidate.pvcName);
    if (groups.has(key)) {
      throw erasureError(
        'VOLUME_ERASURE_SOURCE_SNAPSHOT_INVALID',
        'The source snapshot contains a duplicate candidate.',
      );
    }
    groups.set(key, []);
  }

  for (const reference of snapshot.references) {
    assertScope(reference);
    assertSafeId(reference.referenceId, 'source reference ID');
    assertKubernetesName(reference.namespace, 'PVC namespace');
    assertKubernetesName(reference.pvcName, 'PVC name');

    if (reference.expectedPvcUid) {
      assertSafeId(reference.expectedPvcUid, 'expected PVC UID');
    }

    if (referenceIds.has(reference.referenceId)) {
      throw erasureError(
        'VOLUME_ERASURE_SOURCE_SNAPSHOT_INVALID',
        'The source snapshot contains a duplicate reference.',
      );
    }

    referenceIds.add(reference.referenceId);

    const key = claimKey(reference.namespace, reference.pvcName);
    if (snapshot.candidates && !groups.has(key)) {
      throw erasureError(
        'VOLUME_ERASURE_SOURCE_SNAPSHOT_INVALID',
        'A durable reference falls outside the exact candidate inventory.',
      );
    }
    groups.set(key, [...(groups.get(key) ?? []), reference]);
  }

  for (const [key, references] of groups) {
    if (
      !snapshot.candidates &&
      !references.some(
        (reference) => reference.projectId === scope.projectId && reference.organizationId === scope.organizationId,
      )
    ) {
      groups.delete(key);
    }
  }

  return groups;
}

function compactClaim(claim: ProjectPersistentVolumeClaim, ownership: InventoryClaim['ownership']): InventoryClaim {
  return {
    namespace: claim.metadata.namespace!,
    name: claim.metadata.name,
    uid: claim.metadata.uid,
    resourceVersion: claim.metadata.resourceVersion,
    finalizers: sortedUnique(claim.metadata.finalizers ?? []),
    ownership,
  };
}

function compactVolume(
  volume: ProjectPersistentVolume,
  storageClass: ProjectStorageClass | undefined,
  provider: ProviderVolumeObservation,
): InventoryVolume {
  const csi = volume.spec.csi!;
  const reclaimPolicy = parseReclaimPolicy(volume.spec.persistentVolumeReclaimPolicy, 'PV reclaim policy');

  const storageClassReclaimPolicy = storageClass
    ? parseReclaimPolicy(storageClass.reclaimPolicy ?? 'Delete', 'StorageClass reclaim policy')
    : null;

  return {
    name: volume.metadata.name,
    uid: volume.metadata.uid,
    resourceVersion: volume.metadata.resourceVersion,
    finalizers: sortedUnique(volume.metadata.finalizers ?? []),
    csiDriver: csi.driver!,
    volumeHandle: csi.volumeHandle!,
    storageClassName: volume.spec.storageClassName || null,
    storageClassProvisioner: storageClass?.provisioner ?? null,
    storageClassReclaimPolicy,
    reclaimPolicy,
    providerPresent: provider.exists,
    providerResourceId: provider.resourceId ?? null,
  };
}

export async function captureProjectVolumeErasureInventory(
  input: CaptureProjectVolumeErasureInput,
): Promise<ProjectVolumeErasureInventory> {
  assertScope(input.scope);

  const referenceGroups = validateSourceSnapshot(input.scope, input.sourceSnapshot);

  const allVolumes = await guarded(input.leaseGuard, 'kubernetes.list-pv', () =>
    input.kubernetes.listPersistentVolumes(),
  );

  const volumeByName = new Map<string, ProjectPersistentVolume>();
  const handleReferenceCounts = new Map<string, number>();

  for (const volume of allVolumes) {
    assertMetadata(volume.metadata, volume.metadata.name);

    if (volumeByName.has(volume.metadata.name)) {
      throw erasureError('VOLUME_ERASURE_KUBERNETES_LIST_INVALID', 'Kubernetes returned a duplicate PV.', 502);
    }

    volumeByName.set(volume.metadata.name, volume);

    const driver = volume.spec.csi?.driver;
    const handle = volume.spec.csi?.volumeHandle;

    if (driver && handle) {
      const key = `${driver}\n${handle}`;
      handleReferenceCounts.set(key, (handleReferenceCounts.get(key) ?? 0) + 1);
    }
  }

  const entries: ProjectVolumeErasureInventoryEntry[] = [];
  const sortedGroups = [...referenceGroups.entries()].sort(([left], [right]) => left.localeCompare(right));

  for (const [key, references] of sortedGroups) {
    const targetReferences = references.filter(
      (reference) =>
        reference.projectId === input.scope.projectId && reference.organizationId === input.scope.organizationId,
    );

    const [namespace, pvcName] = key.split('/') as [string, string];
    const tenantKeys = new Set([
      `${input.scope.organizationId}/${input.scope.projectId}`,
      ...references.map((reference) => `${reference.organizationId}/${reference.projectId}`),
    ]);

    const base: InventoryEntryBase = {
      namespace,
      pvcName,
      sourceEvidenceHash: sourceReferenceEvidence(references),
      sourceReferenceCount: references.length,
      distinctTenantCount: tenantKeys.size,
    };

    const expectedUids = sortedUnique(
      [
        ...targetReferences.map((reference) => reference.expectedPvcUid),
        input.sourceSnapshot.candidates?.find(
          (candidate) => candidate.namespace === namespace && candidate.pvcName === pvcName,
        )?.expectedPvcUid,
      ].filter((uid): uid is string => Boolean(uid)),
    );

    const claim = await guarded(input.leaseGuard, 'kubernetes.read-pvc', () =>
      input.kubernetes.getPersistentVolumeClaim(namespace, pvcName),
    );

    if (!claim) {
      const orphanCandidates = allVolumes.filter(
        (volume) => volume.spec.claimRef?.namespace === namespace && volume.spec.claimRef.name === pvcName,
      );

      if (orphanCandidates.length === 0) {
        entries.push({ ...base, disposition: 'already-absent' });
        continue;
      }

      if (expectedUids.length !== 1) {
        throw erasureError(
          'VOLUME_ERASURE_ORPHAN_IDENTITY_UNPROVEN',
          'A PVC is absent but a retained PV cannot be tied to one durable PVC UID.',
        );
      }

      const expectedPvcUid = expectedUids[0]!;
      if (orphanCandidates.some((volume) => volume.spec.claimRef?.uid !== expectedPvcUid)) {
        throw erasureError(
          'VOLUME_ERASURE_ORPHAN_IDENTITY_CONFLICT',
          'A retained PV claimRef does not match the durable PVC identity.',
        );
      }

      if (tenantKeys.size > 1) {
        throw erasureError(
          'VOLUME_ERASURE_ORPHAN_SHARED',
          'A retained PV still has references from more than one tenant.',
        );
      }

      const orphanVolumes: InventoryVolume[] = [];
      for (const volume of orphanCandidates.sort((left, right) =>
        left.metadata.name.localeCompare(right.metadata.name),
      )) {
        assertMetadata(volume.metadata, volume.metadata.name);
        const driver = volume.spec.csi?.driver;
        const volumeHandle = volume.spec.csi?.volumeHandle;
        if (!driver || !volumeHandle) {
          throw erasureError('VOLUME_ERASURE_CSI_IDENTITY_MISSING', 'The retained PV has no complete CSI identity.');
        }
        assertSafeId(driver, 'CSI driver');
        const storageClassName = volume.spec.storageClassName || null;
        const storageClass = storageClassName
          ? await guarded(input.leaseGuard, 'kubernetes.read-storage-class', () =>
              input.kubernetes.getStorageClass(storageClassName),
            )
          : undefined;
        if (storageClassName && !storageClass) {
          throw erasureError(
            'VOLUME_ERASURE_STORAGE_CLASS_NOT_OBSERVABLE',
            'The retained PV StorageClass is not observable.',
            503,
          );
        }
        if (storageClass) {
          assertMetadata(storageClass.metadata, storageClassName!);
          if (storageClass.provisioner !== driver) {
            throw erasureError(
              'VOLUME_ERASURE_STORAGE_CLASS_CONFLICT',
              'StorageClass provisioner and retained PV CSI driver disagree.',
            );
          }
        }
        if (
          (handleReferenceCounts.get(`${driver}\n${volumeHandle}`) ?? 0) > 1 ||
          hasSharedMarker(volume.metadata.labels, storageClass?.metadata.labels)
        ) {
          throw erasureError(
            'VOLUME_ERASURE_ORPHAN_SHARED',
            'A retained PV has a shared handle or shared-storage marker.',
          );
        }
        const provider = providerFor(input.providers, driver);
        const providerObservation = await guarded(input.leaseGuard, 'provider.inspect-volume', () =>
          provider.inspect(volumeHandle),
        );
        assertProviderObservation(providerObservation);
        orphanVolumes.push(compactVolume(volume, storageClass, providerObservation));
      }

      entries.push({ ...base, disposition: 'erase-orphan', expectedPvcUid, volumes: orphanVolumes });
      continue;
    }

    assertMetadata(claim.metadata, pvcName, namespace);

    if (expectedUids.length > 1 || (expectedUids[0] && expectedUids[0] !== claim.metadata.uid)) {
      throw erasureError('VOLUME_ERASURE_PVC_UID_CONFLICT', 'The source record and live claim identities disagree.');
    }

    const legacyAuthorized =
      targetReferences.length > 0 && targetReferences.every((reference) => reference.allowLegacyUnlabelled === true);
    const ownership = assertClaimOwnership(claim, input.scope, legacyAuthorized);
    const inventoryClaim = compactClaim(claim, ownership);
    const volumeName = claim.spec.volumeName;

    if (!volumeName) {
      const exclusionReason =
        tenantKeys.size > 1
          ? 'shared-source-reference'
          : hasSharedMarker(claim.metadata.labels)
            ? 'shared-storage-marker'
            : undefined;

      if (exclusionReason) {
        entries.push({
          ...base,
          disposition: 'excluded-shared',
          exclusionReason,
          claim: inventoryClaim,
          volume: null,
          clusterVolumeHandleReferenceCount: 0,
        });
        continue;
      }

      entries.push({ ...base, disposition: 'erase', claim: inventoryClaim, volume: null });
      continue;
    }

    assertKubernetesName(volumeName, 'PV name');

    const volume = volumeByName.get(volumeName);

    if (!volume) {
      throw erasureError('VOLUME_ERASURE_PV_NOT_OBSERVABLE', 'The bound PersistentVolume is not observable.', 503);
    }

    assertMetadata(volume.metadata, volumeName);

    const claimRef = volume.spec.claimRef;

    if (claimRef?.namespace !== namespace || claimRef.name !== pvcName || claimRef.uid !== claim.metadata.uid) {
      throw erasureError('VOLUME_ERASURE_PV_CLAIM_CONFLICT', 'The PV claimRef does not match the exact PVC identity.');
    }

    const driver = volume.spec.csi?.driver;
    const volumeHandle = volume.spec.csi?.volumeHandle;

    if (!driver || !volumeHandle) {
      throw erasureError('VOLUME_ERASURE_CSI_IDENTITY_MISSING', 'The bound PV has no complete CSI identity.');
    }

    assertSafeId(driver, 'CSI driver');

    const storageClassName = volume.spec.storageClassName || claim.spec.storageClassName;

    if ((volume.spec.storageClassName || null) !== (claim.spec.storageClassName || null)) {
      throw erasureError('VOLUME_ERASURE_STORAGE_CLASS_CONFLICT', 'PVC and PV StorageClass bindings disagree.');
    }

    const storageClass = storageClassName
      ? await guarded(input.leaseGuard, 'kubernetes.read-storage-class', () =>
          input.kubernetes.getStorageClass(storageClassName),
        )
      : undefined;

    if (storageClassName && !storageClass) {
      throw erasureError(
        'VOLUME_ERASURE_STORAGE_CLASS_NOT_OBSERVABLE',
        'The live StorageClass is not observable.',
        503,
      );
    }

    if (storageClass) {
      assertMetadata(storageClass.metadata, storageClassName!);

      if (storageClass.provisioner !== driver) {
        throw erasureError(
          'VOLUME_ERASURE_STORAGE_CLASS_CONFLICT',
          'StorageClass provisioner and PV CSI driver disagree.',
        );
      }
    }

    const uninspectedProviderState: ProviderVolumeObservation = { exists: false };
    const compactWithoutProvider = compactVolume(volume, storageClass, uninspectedProviderState);
    const handleReferenceCount = handleReferenceCounts.get(`${driver}\n${volumeHandle}`) ?? 0;

    let exclusionReason: SharedProjectVolumeExclusionReason | undefined;

    if (tenantKeys.size > 1) {
      exclusionReason = 'shared-source-reference';
    } else if (handleReferenceCount > 1) {
      exclusionReason = 'shared-csi-volume-handle';
    } else if (hasSharedMarker(claim.metadata.labels, volume.metadata.labels, storageClass?.metadata.labels)) {
      exclusionReason = 'shared-storage-marker';
    }

    if (exclusionReason) {
      entries.push({
        ...base,
        disposition: 'excluded-shared',
        exclusionReason,
        claim: inventoryClaim,
        volume: withoutProviderState(compactWithoutProvider),
        clusterVolumeHandleReferenceCount: handleReferenceCount,
      });
      continue;
    }

    const provider = providerFor(input.providers, driver);

    const providerObservation = await guarded(input.leaseGuard, 'provider.inspect-volume', () =>
      provider.inspect(volumeHandle),
    );
    assertProviderObservation(providerObservation);
    entries.push({
      ...base,
      disposition: 'erase',
      claim: inventoryClaim,
      volume: compactVolume(volume, storageClass, providerObservation),
    });
  }

  return sealInventory({
    schemaVersion: 1,
    scope: { ...input.scope },
    referenceSnapshotHash: referenceSnapshotEvidence(input.sourceSnapshot),
    entries,
  });
}

function resolvedPollPolicy(
  input: Partial<ProjectVolumeErasurePollPolicy> | undefined,
): ProjectVolumeErasurePollPolicy {
  const result = { ...DEFAULT_POLL_POLICY, ...input };

  if (
    !Number.isInteger(result.maxAttempts) ||
    result.maxAttempts < 1 ||
    result.maxAttempts > 1_000 ||
    !Number.isInteger(result.initialDelayMs) ||
    result.initialDelayMs < 0 ||
    !Number.isInteger(result.maxDelayMs) ||
    result.maxDelayMs < result.initialDelayMs ||
    result.maxDelayMs > 60_000
  ) {
    throw erasureError('VOLUME_ERASURE_POLL_POLICY_INVALID', 'The erasure poll policy is invalid.', 400);
  }

  return result;
}

async function guarded<T>(
  guard: ProjectVolumeLeaseGuard,
  effect: ProjectVolumeExternalEffect,
  operation: () => Promise<T>,
): Promise<T> {
  await guard.assertLease(effect);
  return operation();
}

function nextDelay(current: number, maximum: number): number {
  return Math.min(maximum, Math.max(1, current * 2));
}

function assertLiveClaimMatches(
  live: ProjectPersistentVolumeClaim,
  entry: ErasableProjectVolumeInventoryEntry,
  scope: ProjectVolumeTenantScope,
): void {
  assertMetadata(live.metadata, entry.claim.name, entry.claim.namespace);

  if (live.metadata.uid !== entry.claim.uid) {
    throw erasureError('VOLUME_ERASURE_PVC_REPLACED', 'The PVC name now resolves to a different UID.');
  }

  assertClaimOwnership(live, scope, entry.claim.ownership === 'legacy-source-reference');

  if ((live.spec.volumeName ?? null) !== (entry.volume?.name ?? null)) {
    throw erasureError('VOLUME_ERASURE_PVC_BINDING_CHANGED', 'The PVC binding changed after inventory capture.');
  }
}

function assertLiveVolumeMatches(live: ProjectPersistentVolume, entry: ErasableProjectVolumeInventoryEntry): void {
  const expected = entry.volume;

  if (!expected) {
    throw erasureError('VOLUME_ERASURE_INVENTORY_INVALID', 'An unbound claim cannot own a PV.', 500);
  }

  assertMetadata(live.metadata, expected.name);

  if (
    live.metadata.uid !== expected.uid ||
    live.spec.csi?.driver !== expected.csiDriver ||
    live.spec.csi.volumeHandle !== expected.volumeHandle ||
    live.spec.persistentVolumeReclaimPolicy !== expected.reclaimPolicy ||
    (live.spec.storageClassName || null) !== expected.storageClassName
  ) {
    throw erasureError('VOLUME_ERASURE_PV_REPLACED', 'The PV identity or provider binding changed after capture.');
  }

  const claimRef = live.spec.claimRef;

  if (
    claimRef &&
    (claimRef.namespace !== entry.claim.namespace ||
      claimRef.name !== entry.claim.name ||
      claimRef.uid !== entry.claim.uid)
  ) {
    throw erasureError('VOLUME_ERASURE_PV_CLAIM_CONFLICT', 'The live PV claimRef changed after capture.');
  }
}

async function waitForClaimAbsent(
  input: ExecuteProjectVolumeErasureInput,
  entry: ErasableProjectVolumeInventoryEntry,
  policy: ProjectVolumeErasurePollPolicy,
  clock: ProjectVolumeErasureClock,
): Promise<void> {
  let delay = policy.initialDelayMs;
  let lastFinalizers: readonly string[] = [];

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const live = await guarded(input.leaseGuard, 'kubernetes.read-pvc', () =>
      input.kubernetes.getPersistentVolumeClaim(entry.claim.namespace, entry.claim.name),
    );

    if (!live) {
      return;
    }

    assertLiveClaimMatches(live, entry, input.expectedScope);
    lastFinalizers = sortedUnique(live.metadata.finalizers ?? []);

    if (attempt < policy.maxAttempts) {
      await clock.sleep(delay);
      delay = nextDelay(delay, policy.maxDelayMs);
    }
  }

  throw erasureError(
    'VOLUME_ERASURE_PVC_ABSENCE_TIMEOUT',
    `PVC remained present after bounded verification (${lastFinalizers.length} finalizer(s)).`,
    503,
  );
}

async function waitForVolumeAbsent(
  input: ExecuteProjectVolumeErasureInput,
  entry: ErasableProjectVolumeInventoryEntry,
  policy: ProjectVolumeErasurePollPolicy,
  clock: ProjectVolumeErasureClock,
): Promise<void> {
  if (!entry.volume) {
    return;
  }

  let delay = policy.initialDelayMs;
  let lastFinalizers: readonly string[] = [];

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const live = await guarded(input.leaseGuard, 'kubernetes.read-pv', () =>
      input.kubernetes.getPersistentVolume(entry.volume!.name),
    );

    if (!live) {
      return;
    }

    assertLiveVolumeMatches(live, entry);
    lastFinalizers = sortedUnique(live.metadata.finalizers ?? []);

    if (attempt < policy.maxAttempts) {
      await clock.sleep(delay);
      delay = nextDelay(delay, policy.maxDelayMs);
    }
  }

  throw erasureError(
    'VOLUME_ERASURE_PV_ABSENCE_TIMEOUT',
    `PV remained present after bounded verification (${lastFinalizers.length} finalizer(s)).`,
    503,
  );
}

function deterministicDeleteRequestId(volumeHandle: string, providerResourceId: string): string {
  const hex = createHash('sha256')
    .update(`${volumeHandle}\n${providerResourceId}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16]!, 16) % 4]!;

  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex
    .slice(16, 20)
    .join('')}-${hex.slice(20).join('')}`;
}

async function eraseProviderVolume(
  input: ExecuteProjectVolumeErasureInput,
  entry: ErasableProjectVolumeInventoryEntry,
  policy: ProjectVolumeErasurePollPolicy,
  clock: ProjectVolumeErasureClock,
): Promise<void> {
  const volume = entry.volume;

  if (!volume) {
    return;
  }

  const provider = providerFor(input.providers, volume.csiDriver);

  let observation = await guarded(input.leaseGuard, 'provider.inspect-volume', () =>
    provider.inspect(volume.volumeHandle),
  );
  assertProviderObservation(observation);

  if (!observation.exists) {
    return;
  }

  if (!volume.providerPresent || !volume.providerResourceId || observation.resourceId !== volume.providerResourceId) {
    throw erasureError(
      'VOLUME_ERASURE_PROVIDER_VOLUME_REPLACED',
      'The provider volume identity changed after capture.',
    );
  }

  await guarded(input.leaseGuard, 'provider.delete-volume', () =>
    provider.deleteExact({
      volumeHandle: volume.volumeHandle,
      expectedResourceId: volume.providerResourceId!,
      requestId: deterministicDeleteRequestId(volume.volumeHandle, volume.providerResourceId!),
    }),
  );

  let delay = policy.initialDelayMs;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    observation = await guarded(input.leaseGuard, 'provider.inspect-volume', () =>
      provider.inspect(volume.volumeHandle),
    );
    assertProviderObservation(observation);

    if (!observation.exists) {
      return;
    }

    if (observation.resourceId !== volume.providerResourceId) {
      throw erasureError(
        'VOLUME_ERASURE_PROVIDER_VOLUME_REPLACED',
        'The provider volume was replaced during deletion.',
      );
    }

    if (attempt < policy.maxAttempts) {
      await clock.sleep(delay);
      delay = nextDelay(delay, policy.maxDelayMs);
    }
  }

  throw erasureError(
    'VOLUME_ERASURE_PROVIDER_ABSENCE_TIMEOUT',
    'Provider volume remained after bounded verification.',
    503,
  );
}

async function deleteClaim(
  input: ExecuteProjectVolumeErasureInput,
  entry: ErasableProjectVolumeInventoryEntry,
  policy: ProjectVolumeErasurePollPolicy,
  clock: ProjectVolumeErasureClock,
): Promise<void> {
  const live = await guarded(input.leaseGuard, 'kubernetes.read-pvc', () =>
    input.kubernetes.getPersistentVolumeClaim(entry.claim.namespace, entry.claim.name),
  );

  if (live) {
    assertLiveClaimMatches(live, entry, input.expectedScope);
    await guarded(input.leaseGuard, 'kubernetes.delete-pvc', () =>
      input.kubernetes.deletePersistentVolumeClaim(entry.claim.namespace, entry.claim.name, {
        uid: entry.claim.uid,
        resourceVersion: live.metadata.resourceVersion,
        propagationPolicy: 'Foreground',
        gracePeriodSeconds: 0,
      }),
    );
  }

  await waitForClaimAbsent(input, entry, policy, clock);
}

async function assertNoLiveSharedVolumeHandle(
  input: ExecuteProjectVolumeErasureInput,
  entry: ErasableProjectVolumeInventoryEntry,
): Promise<void> {
  if (!entry.volume) {
    return;
  }

  const volumes = await guarded(input.leaseGuard, 'kubernetes.list-pv', () => input.kubernetes.listPersistentVolumes());

  const matching = volumes.filter(
    (volume) =>
      volume.spec.csi?.driver === entry.volume!.csiDriver &&
      volume.spec.csi.volumeHandle === entry.volume!.volumeHandle,
  );

  for (const volume of matching) {
    assertMetadata(volume.metadata, volume.metadata.name);
  }

  if (matching.length > 1 || (matching[0] && matching[0].metadata.uid !== entry.volume.uid)) {
    throw erasureError(
      'VOLUME_ERASURE_SHARED_HANDLE_CHANGED',
      'The live CSI volumeHandle reference count changed after inventory capture.',
    );
  }
}

async function beginVolumeDeletion(
  input: ExecuteProjectVolumeErasureInput,
  entry: ErasableProjectVolumeInventoryEntry,
): Promise<void> {
  if (!entry.volume) {
    return;
  }

  const live = await guarded(input.leaseGuard, 'kubernetes.read-pv', () =>
    input.kubernetes.getPersistentVolume(entry.volume!.name),
  );

  if (!live) {
    return;
  }

  assertLiveVolumeMatches(live, entry);
  await guarded(input.leaseGuard, 'kubernetes.delete-pv', () =>
    input.kubernetes.deletePersistentVolume(entry.volume!.name, {
      uid: entry.volume!.uid,
      resourceVersion: live.metadata.resourceVersion,
      propagationPolicy: 'Foreground',
      gracePeriodSeconds: 0,
    }),
  );
}

async function eraseEntry(
  input: ExecuteProjectVolumeErasureInput,
  entry: ErasableProjectVolumeInventoryEntry,
  policy: ProjectVolumeErasurePollPolicy,
  clock: ProjectVolumeErasureClock,
): Promise<ProjectVolumeErasureEntryEvidence> {
  await assertNoLiveSharedVolumeHandle(input, entry);
  await deleteClaim(input, entry, policy, clock);

  if (entry.volume?.reclaimPolicy === 'Retain') {
    await eraseProviderVolume(input, entry, policy, clock);
    await beginVolumeDeletion(input, entry);
    await waitForVolumeAbsent(input, entry, policy, clock);
  } else if (entry.volume) {
    await beginVolumeDeletion(input, entry);
    await eraseProviderVolume(input, entry, policy, clock);
    await waitForVolumeAbsent(input, entry, policy, clock);
  }

  return {
    namespace: entry.namespace,
    pvcName: entry.pvcName,
    disposition: 'erase',
    pvcAbsent: true,
    pvAbsent: true,
    providerAbsent: true,
  };
}

function orphanVolumeAsErasable(
  entry: OrphanedProjectVolumeInventoryEntry,
  volume: InventoryVolume,
): ErasableProjectVolumeInventoryEntry {
  return {
    namespace: entry.namespace,
    pvcName: entry.pvcName,
    sourceEvidenceHash: entry.sourceEvidenceHash,
    sourceReferenceCount: entry.sourceReferenceCount,
    distinctTenantCount: entry.distinctTenantCount,
    disposition: 'erase',
    claim: {
      namespace: entry.namespace,
      name: entry.pvcName,
      uid: entry.expectedPvcUid,
      resourceVersion: 'orphaned-pvc',
      finalizers: [],
      ownership: 'legacy-source-reference',
    },
    volume,
  };
}

async function eraseOrphanEntry(
  input: ExecuteProjectVolumeErasureInput,
  entry: OrphanedProjectVolumeInventoryEntry,
  policy: ProjectVolumeErasurePollPolicy,
  clock: ProjectVolumeErasureClock,
): Promise<ProjectVolumeErasureEntryEvidence> {
  for (const volume of entry.volumes) {
    const exact = orphanVolumeAsErasable(entry, volume);
    await assertNoLiveSharedVolumeHandle(input, exact);
    if (volume.reclaimPolicy === 'Retain') {
      await eraseProviderVolume(input, exact, policy, clock);
      await beginVolumeDeletion(input, exact);
      await waitForVolumeAbsent(input, exact, policy, clock);
    } else {
      await beginVolumeDeletion(input, exact);
      await eraseProviderVolume(input, exact, policy, clock);
      await waitForVolumeAbsent(input, exact, policy, clock);
    }
  }

  return {
    namespace: entry.namespace,
    pvcName: entry.pvcName,
    disposition: 'erase-orphan',
    pvcAbsent: true,
    pvAbsent: true,
    providerAbsent: true,
  };
}

export async function executeProjectVolumeErasureEntry(
  input: ExecuteProjectVolumeErasureInput,
  entry: ProjectVolumeErasureInventoryEntry,
): Promise<ProjectVolumeErasureEntryEvidence> {
  assertScope(input.expectedScope);
  assertProjectVolumeErasureInventory(input.inventory);
  if (
    input.inventory.schemaVersion !== 1 ||
    input.inventory.scope.organizationId !== input.expectedScope.organizationId ||
    input.inventory.scope.projectId !== input.expectedScope.projectId ||
    !input.inventory.entries.some((candidate) => canonicalize(candidate) === canonicalize(entry))
  ) {
    throw erasureError('VOLUME_ERASURE_SCOPE_CONFLICT', 'The inventory entry does not match the caller.');
  }

  const policy = resolvedPollPolicy(input.pollPolicy);
  const clock = input.clock ?? DEFAULT_CLOCK;
  if (entry.disposition === 'erase') return eraseEntry(input, entry, policy, clock);
  if (entry.disposition === 'erase-orphan') return eraseOrphanEntry(input, entry, policy, clock);
  if (entry.disposition === 'excluded-shared') {
    return {
      namespace: entry.namespace,
      pvcName: entry.pvcName,
      disposition: entry.disposition,
      pvcAbsent: false,
      pvAbsent: false,
      providerAbsent: false,
      exclusionReason: entry.exclusionReason,
    };
  }
  return {
    namespace: entry.namespace,
    pvcName: entry.pvcName,
    disposition: entry.disposition,
    pvcAbsent: true,
    pvAbsent: true,
    providerAbsent: true,
  };
}

export function sealProjectVolumeErasureEvidence(
  inventory: ProjectVolumeErasureInventory,
  evidenceEntries: readonly ProjectVolumeErasureEntryEvidence[],
): ProjectVolumeErasureEvidence {
  assertProjectVolumeErasureInventory(inventory);
  if (
    evidenceEntries.length !== inventory.entries.length ||
    evidenceEntries.some((entry, ordinal) => {
      const expected = inventory.entries[ordinal];
      return !expected || entry.namespace !== expected.namespace || entry.pvcName !== expected.pvcName;
    })
  ) {
    throw erasureError('VOLUME_ERASURE_EVIDENCE_INVALID', 'Evidence does not cover the sealed inventory.', 500);
  }
  const unsignedEvidence = {
    schemaVersion: 1 as const,
    inventoryHash: inventory.inventoryHash,
    entries: [...evidenceEntries],
    verified: true as const,
  };
  return { ...unsignedEvidence, verificationHash: sha256(unsignedEvidence) };
}

export async function executeProjectVolumeErasure(
  input: ExecuteProjectVolumeErasureInput,
): Promise<ProjectVolumeErasureEvidence> {
  assertScope(input.expectedScope);
  assertProjectVolumeErasureInventory(input.inventory);

  if (
    input.inventory.schemaVersion !== 1 ||
    input.inventory.scope.organizationId !== input.expectedScope.organizationId ||
    input.inventory.scope.projectId !== input.expectedScope.projectId
  ) {
    throw erasureError('VOLUME_ERASURE_SCOPE_CONFLICT', 'The inventory tenant scope does not match the caller.');
  }

  const evidenceEntries: ProjectVolumeErasureEntryEvidence[] = [];

  for (const entry of input.inventory.entries) {
    evidenceEntries.push(await executeProjectVolumeErasureEntry(input, entry));
  }
  return sealProjectVolumeErasureEvidence(input.inventory, evidenceEntries);
}

export const projectVolumeErasureConstants = Object.freeze({
  gcePdCsiDriver: GCE_PD_CSI_DRIVER,
});
