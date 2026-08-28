import { createHash } from 'node:crypto';

import { Storage } from '@google-cloud/storage';
import { Client as PgClient } from 'pg';

import {
  DB_NAMESPACE,
  onDemandBackupName,
  restoreClusterName,
  type DatabaseEnvironment,
} from './database-provisioner.js';
import type { ObjectStorageJsonObject, ObjectStorageOperationLease } from './object-storage-operation.js';

/**
 * Physical database erasure deliberately has no Prisma dependency. The caller
 * must capture this complete catalogue (and persist the resulting plan) before
 * cascading Project/DatabaseInstance rows. Provider I/O only starts in
 * `ProjectDatabaseErasureService.erase`, after that transaction has returned.
 */
export interface ProjectDatabaseSnapshotErasureInventory {
  id: string;
  kind: 'auto' | 'manual';
  lsn?: string;
  storageKey?: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt?: string;
}

export interface ProjectDatabaseRestoreErasureInventory {
  id: string;
  snapshotId?: string;
  targetTimestamp?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ProjectDatabaseInstanceErasureInventory {
  id: string;
  projectId: string;
  organizationId: string;
  environment: DatabaseEnvironment;
  status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'FAILED' | 'DELETED';
  engine: string;
  region?: string;
  sizeBytes: number;
  retentionDays: number;
  pitrEnabled: boolean;
  physicalAuthority: ProjectDatabasePhysicalAuthority;
  snapshots: ProjectDatabaseSnapshotErasureInventory[];
  restores: ProjectDatabaseRestoreErasureInventory[];
}

export interface ProjectDatabasePhysicalAuthority {
  tier: 'shared' | 'isolated';
  clusterName: string;
  databaseCrName?: string;
  databaseName?: string;
  roleName?: string;
  backupBucket?: string;
  backupPrefix?: string;
  clusterUid?: string;
  databaseCrUid?: string;
  retentionDays: number;
  capturedAt: string;
}

export interface ProjectDatabaseLegacyAuthorityResolution {
  instanceId: string;
  authority: Omit<ProjectDatabasePhysicalAuthority, 'capturedAt'>;
}

export interface ProjectDatabaseErasureCatalog {
  schemaVersion: 2;
  projectId: string;
  organizationId: string;
  capturedAt: string;
  instances: ProjectDatabaseInstanceErasureInventory[];
}

export interface ProjectDatabaseErasurePlan extends ProjectDatabaseErasureCatalog {
  operationId: string;
  inventorySha256: string;
  backupTargets: Array<{ bucket: string; prefix: string }>;
  sharedRetentionBarriers: Array<{
    clusterName: string;
    clusterUid?: string;
    retentionDays: number;
    notBefore: string;
  }>;
  targets: {
    environments: DatabaseEnvironment[];
    clusterNames: string[];
    scheduledBackupNames: string[];
    backupNames: string[];
    restoreClusterNames: string[];
    databaseCrNames: string[];
    sharedTenants: Array<{
      environment: DatabaseEnvironment;
      database: string;
      role: string;
      sharedClusterName: string;
      sharedClusterUid?: string;
    }>;
  };
}

export type ProjectDatabaseErasureStage =
  | 'INVENTORY_BOUND'
  | 'KUBERNETES_PURGE'
  | 'SHARED_SQL_PURGE'
  | 'BACKUP_PREFIX_PURGE'
  | 'FINAL_VERIFICATION'
  | 'VERIFIED';

export interface ProjectDatabaseErasureFenceContext {
  operationId: string;
  projectId: string;
  organizationId: string;
  inventorySha256: string;
  stage: ProjectDatabaseErasureStage;
  effect?: string;
}

/**
 * Supplied by the permanent-delete state machine. `assertActive` must validate
 * the durable lease/fencing token against authoritative Project state.
 * `checkpoint` must durably persist the stage before the caller cascades rows.
 */
export interface ProjectDatabaseErasureFence {
  assertActive(context: ProjectDatabaseErasureFenceContext): Promise<void>;
  checkpoint(
    context: ProjectDatabaseErasureFenceContext & { evidence: Readonly<Record<string, unknown>> },
  ): Promise<void>;
}

export const PROJECT_DATABASE_KUBERNETES_KINDS = [
  'ScheduledBackup',
  'Backup',
  'Database',
  'Cluster',
  'Deployment',
  'Job',
  'Pod',
  'Service',
  'Endpoints',
  'EndpointSlice',
  'Secret',
  'ConfigMap',
  'ServiceAccount',
  'PodDisruptionBudget',
  'PersistentVolumeClaim',
] as const;

export type ProjectDatabaseKubernetesKind = (typeof PROJECT_DATABASE_KUBERNETES_KINDS)[number];

export interface ProjectDatabaseKubernetesResource {
  kind: ProjectDatabaseKubernetesKind;
  namespace: typeof DB_NAMESPACE;
  name: string;
  uid: string;
  resourceVersion: string;
  /** Server-side ownership proof. No Secret data may cross this boundary. */
  ownership: {
    projectId: string;
    source: 'project-label' | 'cnpg-cluster-label' | 'owner-reference' | 'service-label' | 'deterministic-plan';
    clusterName?: string;
  };
}

/**
 * Integration seam for workspace-manager.
 *
 * `inventory` must be implemented by a manager-only, shared-secret-protected
 * route. It lists direct CNPG CRs by `vibecore.ai/project-id=<projectId>`, then
 * descendants by `cnpg.io/cluster=<each owned Cluster>`. EndpointSlices are
 * found from the exact owned Service names. It MUST omit Pooler and redact all
 * Secret data. `delete` must repeat that ownership check and use the supplied
 * resourceVersion as a Kubernetes delete precondition.
 */
export interface ProjectDatabaseKubernetesPort {
  inventory(input: {
    projectId: string;
    namespace: typeof DB_NAMESPACE;
    knownClusterNames: readonly string[];
    knownResourceNames?: Readonly<Partial<Record<ProjectDatabaseKubernetesKind, readonly string[]>>>;
  }): Promise<ProjectDatabaseKubernetesResource[]>;
  delete(input: {
    projectId: string;
    namespace: typeof DB_NAMESPACE;
    knownClusterNames: readonly string[];
    knownResourceNames?: Readonly<Partial<Record<ProjectDatabaseKubernetesKind, readonly string[]>>>;
    resource: ProjectDatabaseKubernetesResource;
  }): Promise<'deleted' | 'absent'>;
}

export interface ProjectDatabaseBackupVersion {
  key: string;
  generation: string;
  softDeleted: boolean;
  hardDeleteTime?: string;
}

/** A generation-aware view over the dedicated CNPG backup bucket. */
export interface ProjectDatabaseBackupPort {
  inspectBucket(input: { bucket: string }): Promise<{ softDeleteRetentionSeconds: number }>;
  listFirstPage(input: {
    bucket: string;
    prefix: string;
    limit: number;
    softDeleted: boolean;
  }): Promise<ProjectDatabaseBackupVersion[]>;
  deleteVersion(input: { bucket: string; key: string; generation: string }): Promise<'deleted' | 'absent'>;
}

export interface ProjectDatabaseSharedTenant {
  sharedClusterName: string;
  sharedClusterUid?: string;
  environment: DatabaseEnvironment;
  database: string;
  role: string;
}

/** SQL effects run against the shared cluster's privileged, non-tenant DB. */
export interface ProjectDatabaseSharedSqlPort {
  eraseTenant(input: ProjectDatabaseSharedTenant, guard: (effect: string) => Promise<void>): Promise<void>;
  inspectTenant(input: ProjectDatabaseSharedTenant): Promise<{ databaseExists: boolean; roleExists: boolean }>;
}

export type ProjectDatabaseErasureReceipt = ObjectStorageJsonObject & {
  schemaVersion: 2;
  operationId: string;
  projectId: string;
  organizationId: string;
  inventorySha256: string;
  verifiedAt: string;
  effects: ObjectStorageJsonObject & {
    kubernetesResourcesDeleted: number;
    sharedTenantsErased: number;
    backupGenerationsDeleted: number;
    persistentVolumeClaims: Array<{
      namespace: typeof DB_NAMESPACE;
      pvcName: string;
      expectedPvcUid: string;
    }>;
  };
  proof: ObjectStorageJsonObject & {
    kubernetesNamespace: typeof DB_NAMESPACE;
    kubernetesAbsent: true;
    sharedTenantsAbsent: true;
    backupTargets: Array<{ bucket: string; prefix: string; generationsAbsent: true; softDeletedAbsent: true }>;
    sharedRetentionBarriers: Array<{ clusterName: string; notBefore: string; satisfiedAt: string }>;
    backupGenerationsAbsent: true;
  };
};

export type ProjectDatabaseErasureEffects = ProjectDatabaseErasureReceipt['effects'];

export type ProjectDatabaseErasureErrorCode =
  | 'INVALID_INVENTORY'
  | 'INVALID_PLAN'
  | 'UNSAFE_KUBERNETES_TARGET'
  | 'KUBERNETES_ERASURE_INCOMPLETE'
  | 'SHARED_SQL_PORT_REQUIRED'
  | 'SHARED_SQL_ERASURE_INCOMPLETE'
  | 'UNSAFE_BACKUP_TARGET'
  | 'BACKUP_ERASURE_INCOMPLETE'
  | 'BACKUP_SOFT_DELETE_POLICY_ENABLED'
  | 'BACKUP_SOFT_DELETE_RETENTION_ACTIVE'
  | 'SHARED_BACKUP_RETENTION_ACTIVE'
  | 'BACKUP_GENERATION_UNPINNABLE'
  | 'BACKUP_IAM_PREFLIGHT_FAILED'
  | 'BACKUP_BUCKET_MISMATCH';

export class ProjectDatabaseErasureError extends Error {
  constructor(
    message: string,
    readonly code: ProjectDatabaseErasureErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProjectDatabaseErasureError';
  }
}

function requireSafeText(value: string, field: string, maxLength = 255): string {
  const normalized = value.trim();

  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new ProjectDatabaseErasureError(`Invalid ${field}`, 'INVALID_INVENTORY');
  }

  return normalized;
}

function requireIsoDate(value: string, field: string): string {
  const normalized = requireSafeText(value, field, 64);

  if (!Number.isFinite(Date.parse(normalized))) {
    throw new ProjectDatabaseErasureError(`Invalid ${field}`, 'INVALID_INVENTORY');
  }

  return normalized;
}

function requireNonNegativeNumber(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ProjectDatabaseErasureError(`Invalid ${field}`, 'INVALID_INVENTORY');
  }

  return value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }

  return value;
}

function inventoryDigest(catalog: ProjectDatabaseErasureCatalog): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(catalog)))
    .digest('hex');
}

function uniqueById<T extends { id: string }>(values: readonly T[], field: string): void {
  const ids = new Set<string>();

  for (const value of values) {
    if (ids.has(value.id)) {
      throw new ProjectDatabaseErasureError(`Duplicate ${field} id`, 'INVALID_INVENTORY');
    }

    ids.add(value.id);
  }
}

/** Normalize and bind the relational inventory captured before Project cascade. */
export function buildProjectDatabaseErasurePlan(
  input: ProjectDatabaseErasureCatalog & { operationId: string },
): ProjectDatabaseErasurePlan {
  if (input.schemaVersion !== 2) {
    throw new ProjectDatabaseErasureError('Unsupported database erasure inventory version', 'INVALID_INVENTORY');
  }

  const projectId = requireSafeText(input.projectId, 'projectId', 63);
  const organizationId = requireSafeText(input.organizationId, 'organizationId', 128);
  const operationId = requireSafeText(input.operationId, 'operationId', 128);
  const capturedAt = requireIsoDate(input.capturedAt, 'capturedAt');

  uniqueById(input.instances, 'DatabaseInstance');
  const environments = new Set<DatabaseEnvironment>();
  const instances = input.instances
    .map((instance): ProjectDatabaseInstanceErasureInventory => {
      if (instance.environment !== 'development' && instance.environment !== 'production') {
        throw new ProjectDatabaseErasureError('Invalid DatabaseInstance environment', 'INVALID_INVENTORY');
      }

      if (!['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'FAILED', 'DELETED'].includes(instance.status)) {
        throw new ProjectDatabaseErasureError('Invalid DatabaseInstance status', 'INVALID_INVENTORY');
      }

      if (environments.has(instance.environment)) {
        throw new ProjectDatabaseErasureError('Duplicate DatabaseInstance environment', 'INVALID_INVENTORY');
      }

      environments.add(instance.environment);
      uniqueById(instance.snapshots, 'DatabaseSnapshot');
      uniqueById(instance.restores, 'DatabaseRestore');

      const physical = instance.physicalAuthority;
      if (!physical || (physical.tier !== 'isolated' && physical.tier !== 'shared')) {
        throw new ProjectDatabaseErasureError('Database physical authority is missing', 'INVALID_INVENTORY');
      }
      const clusterName = requireSafeText(physical.clusterName, 'physicalAuthority.clusterName', 253);
      const databaseCrName = physical.databaseCrName
        ? requireSafeText(physical.databaseCrName, 'physicalAuthority.databaseCrName', 253)
        : undefined;
      const databaseName = physical.databaseName
        ? requireSafeText(physical.databaseName, 'physicalAuthority.databaseName', 63)
        : undefined;
      const roleName = physical.roleName
        ? requireSafeText(physical.roleName, 'physicalAuthority.roleName', 63)
        : undefined;
      const backupBucket = physical.backupBucket
        ? requireSafeText(physical.backupBucket, 'physicalAuthority.backupBucket', 222)
        : undefined;
      const backupPrefix = physical.backupPrefix
        ? requireSafeText(physical.backupPrefix, 'physicalAuthority.backupPrefix', 1024)
        : undefined;
      const clusterUid = physical.clusterUid
        ? requireSafeText(physical.clusterUid, 'physicalAuthority.clusterUid', 255)
        : undefined;
      const databaseCrUid = physical.databaseCrUid
        ? requireSafeText(physical.databaseCrUid, 'physicalAuthority.databaseCrUid', 255)
        : undefined;
      const physicalRetentionDays = requireNonNegativeNumber(physical.retentionDays, 'physicalAuthority.retentionDays');
      if (physicalRetentionDays > 3650) {
        throw new ProjectDatabaseErasureError('Database physical retention is invalid', 'INVALID_INVENTORY');
      }
      if (
        Boolean(backupBucket) !== Boolean(backupPrefix) ||
        (backupBucket && (backupBucket.startsWith('gs://') || backupBucket.includes('/'))) ||
        (backupPrefix && (!backupPrefix.endsWith('/') || backupPrefix.startsWith('/'))) ||
        (physical.tier === 'isolated' &&
          (!backupBucket || !backupPrefix || databaseCrName || databaseName || roleName)) ||
        (physical.tier === 'shared' && (!databaseCrName || !databaseName || !roleName))
      ) {
        throw new ProjectDatabaseErasureError('Database physical authority is incomplete', 'INVALID_INVENTORY');
      }

      return {
        ...instance,
        id: requireSafeText(instance.id, 'DatabaseInstance.id', 128),
        projectId: requireSafeText(instance.projectId, 'DatabaseInstance.projectId', 63),
        organizationId: requireSafeText(instance.organizationId, 'DatabaseInstance.organizationId', 128),
        engine: requireSafeText(instance.engine, 'DatabaseInstance.engine', 64),
        region: instance.region ? requireSafeText(instance.region, 'DatabaseInstance.region', 128) : undefined,
        sizeBytes: requireNonNegativeNumber(instance.sizeBytes, 'DatabaseInstance.sizeBytes'),
        retentionDays: requireNonNegativeNumber(instance.retentionDays, 'DatabaseInstance.retentionDays'),
        physicalAuthority: {
          tier: physical.tier,
          clusterName,
          databaseCrName,
          databaseName,
          roleName,
          backupBucket,
          backupPrefix,
          clusterUid,
          databaseCrUid,
          retentionDays: physicalRetentionDays,
          capturedAt: requireIsoDate(physical.capturedAt, 'physicalAuthority.capturedAt'),
        },
        snapshots: instance.snapshots
          .map((snapshot) => {
            if (snapshot.kind !== 'auto' && snapshot.kind !== 'manual') {
              throw new ProjectDatabaseErasureError('Invalid DatabaseSnapshot kind', 'INVALID_INVENTORY');
            }

            return {
              ...snapshot,
              id: requireSafeText(snapshot.id, 'DatabaseSnapshot.id', 128),
              lsn: snapshot.lsn ? requireSafeText(snapshot.lsn, 'DatabaseSnapshot.lsn', 128) : undefined,
              storageKey: snapshot.storageKey
                ? requireSafeText(snapshot.storageKey, 'DatabaseSnapshot.storageKey', 1024)
                : undefined,
              sizeBytes: requireNonNegativeNumber(snapshot.sizeBytes, 'DatabaseSnapshot.sizeBytes'),
              createdAt: requireIsoDate(snapshot.createdAt, 'DatabaseSnapshot.createdAt'),
              expiresAt: snapshot.expiresAt
                ? requireIsoDate(snapshot.expiresAt, 'DatabaseSnapshot.expiresAt')
                : undefined,
            };
          })
          .sort((left, right) => left.id.localeCompare(right.id)),
        restores: instance.restores
          .map((restore) => {
            if (!['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'].includes(restore.status)) {
              throw new ProjectDatabaseErasureError('Invalid DatabaseRestore status', 'INVALID_INVENTORY');
            }

            return {
              ...restore,
              id: requireSafeText(restore.id, 'DatabaseRestore.id', 128),
              snapshotId: restore.snapshotId
                ? requireSafeText(restore.snapshotId, 'DatabaseRestore.snapshotId', 128)
                : undefined,
              targetTimestamp: restore.targetTimestamp
                ? requireIsoDate(restore.targetTimestamp, 'DatabaseRestore.targetTimestamp')
                : undefined,
              createdAt: requireIsoDate(restore.createdAt, 'DatabaseRestore.createdAt'),
              startedAt: restore.startedAt ? requireIsoDate(restore.startedAt, 'DatabaseRestore.startedAt') : undefined,
              completedAt: restore.completedAt
                ? requireIsoDate(restore.completedAt, 'DatabaseRestore.completedAt')
                : undefined,
            };
          })
          .sort((left, right) => left.id.localeCompare(right.id)),
      };
    })
    .sort((left, right) => left.environment.localeCompare(right.environment) || left.id.localeCompare(right.id));

  if (instances.some((instance) => instance.projectId !== projectId || instance.organizationId !== organizationId)) {
    throw new ProjectDatabaseErasureError(
      'DatabaseInstance escaped the captured project tenant boundary',
      'INVALID_INVENTORY',
    );
  }

  const catalog: ProjectDatabaseErasureCatalog = {
    schemaVersion: 2,
    projectId,
    organizationId,
    capturedAt,
    instances,
  };
  const targetEnvironments = instances.map(({ environment }) => environment);
  const isolatedInstances = instances.filter(({ physicalAuthority }) => physicalAuthority.tier === 'isolated');
  const sharedInstances = instances.filter(({ physicalAuthority }) => physicalAuthority.tier === 'shared');
  const clusterNames = isolatedInstances.map(({ physicalAuthority }) => physicalAuthority.clusterName);
  const restoreClusterNames = instances.flatMap((instance) =>
    instance.restores.map((restore) => restoreClusterName(projectId, restore.id)),
  );
  const backupNames = instances.flatMap((instance) =>
    instance.snapshots.map((snapshot) =>
      onDemandBackupName(projectId, snapshot.id, instance.environment, instance.physicalAuthority.clusterName),
    ),
  );
  const backupTargets = [
    ...new Map(
      isolatedInstances.map(({ physicalAuthority }) => [
        `${physicalAuthority.backupBucket!}\u0000${physicalAuthority.backupPrefix!}`,
        { bucket: physicalAuthority.backupBucket!, prefix: physicalAuthority.backupPrefix! },
      ]),
    ).values(),
  ].sort((left, right) => left.bucket.localeCompare(right.bucket) || left.prefix.localeCompare(right.prefix));
  const sharedRetentionBarriers = [
    ...new Map(
      sharedInstances.map(({ physicalAuthority }) => {
        const notBefore = new Date(
          Date.parse(capturedAt) + physicalAuthority.retentionDays * 24 * 60 * 60 * 1_000,
        ).toISOString();
        const value = {
          clusterName: physicalAuthority.clusterName,
          clusterUid: physicalAuthority.clusterUid,
          retentionDays: physicalAuthority.retentionDays,
          notBefore,
        };
        return [`${value.clusterName}\u0000${value.clusterUid ?? ''}\u0000${value.notBefore}`, value] as const;
      }),
    ).values(),
  ].sort((left, right) => left.clusterName.localeCompare(right.clusterName));

  return {
    ...catalog,
    operationId,
    inventorySha256: inventoryDigest(catalog),
    backupTargets,
    sharedRetentionBarriers,
    targets: {
      environments: targetEnvironments,
      clusterNames: [...new Set(clusterNames)].sort(),
      scheduledBackupNames: clusterNames.map((name) => `${name}-daily`),
      backupNames: [...new Set(backupNames)].sort(),
      restoreClusterNames: [...new Set(restoreClusterNames)].sort(),
      databaseCrNames: [
        ...new Set(sharedInstances.map(({ physicalAuthority }) => physicalAuthority.databaseCrName!)),
      ].sort(),
      sharedTenants: sharedInstances.map(({ environment, physicalAuthority }) => ({
        environment,
        database: physicalAuthority.databaseName!,
        role: physicalAuthority.roleName!,
        sharedClusterName: physicalAuthority.clusterName,
        sharedClusterUid: physicalAuthority.clusterUid,
      })),
    },
  };
}

const KUBERNETES_DELETE_ORDER = new Map<ProjectDatabaseKubernetesKind, number>(
  [
    // Quiesce every controller before the volume saga can dispatch provider
    // deletion. Cluster deletes are UID/RV-fenced and use Orphan propagation.
    'Cluster',
    'Database',
    'ScheduledBackup',
    'Backup',
    'Deployment',
    'Job',
    'Pod',
    'Service',
    'Endpoints',
    'EndpointSlice',
    'Secret',
    'ConfigMap',
    'ServiceAccount',
    'PodDisruptionBudget',
  ].map((kind, index) => [kind as ProjectDatabaseKubernetesKind, index]),
);

function isSafeProjectClusterName(plan: ProjectDatabaseErasurePlan, name: string): boolean {
  return plan.targets.clusterNames.includes(name) || plan.targets.restoreClusterNames.includes(name);
}

function assertSafeKubernetesResource(
  plan: ProjectDatabaseErasurePlan,
  resource: ProjectDatabaseKubernetesResource,
): void {
  if (
    resource.namespace !== DB_NAMESPACE ||
    !PROJECT_DATABASE_KUBERNETES_KINDS.includes(resource.kind) ||
    resource.ownership.projectId !== plan.projectId ||
    !resource.name.trim() ||
    !resource.uid.trim() ||
    !resource.resourceVersion.trim()
  ) {
    throw new ProjectDatabaseErasureError(
      'Kubernetes target is not authoritatively project-owned',
      'UNSAFE_KUBERNETES_TARGET',
    );
  }

  if (resource.kind === 'Cluster' && !isSafeProjectClusterName(plan, resource.name)) {
    throw new ProjectDatabaseErasureError('Refusing to delete a non-project CNPG Cluster', 'UNSAFE_KUBERNETES_TARGET');
  }

  if (resource.kind === 'Database' && !plan.targets.databaseCrNames.includes(resource.name)) {
    throw new ProjectDatabaseErasureError('Refusing to delete an uncaptured CNPG Database', 'UNSAFE_KUBERNETES_TARGET');
  }

  const isolatedAuthority = plan.instances.find(
    ({ physicalAuthority }) => physicalAuthority.tier === 'isolated' && physicalAuthority.clusterName === resource.name,
  )?.physicalAuthority;
  if (resource.kind === 'Cluster' && isolatedAuthority?.clusterUid && isolatedAuthority.clusterUid !== resource.uid) {
    throw new ProjectDatabaseErasureError(
      'CNPG Cluster UID changed after authority capture',
      'UNSAFE_KUBERNETES_TARGET',
    );
  }

  const sharedAuthority = plan.instances.find(
    ({ physicalAuthority }) =>
      physicalAuthority.tier === 'shared' && physicalAuthority.databaseCrName === resource.name,
  )?.physicalAuthority;
  if (
    resource.kind === 'Database' &&
    sharedAuthority?.databaseCrUid &&
    sharedAuthority.databaseCrUid !== resource.uid
  ) {
    throw new ProjectDatabaseErasureError(
      'CNPG Database UID changed after authority capture',
      'UNSAFE_KUBERNETES_TARGET',
    );
  }

  const ownerCluster = resource.ownership.clusterName;

  if (ownerCluster && !isSafeProjectClusterName(plan, ownerCluster)) {
    throw new ProjectDatabaseErasureError(
      'Refusing a descendant of a non-project CNPG Cluster',
      'UNSAFE_KUBERNETES_TARGET',
    );
  }

  const sharedClusters = new Set(plan.targets.sharedTenants.map(({ sharedClusterName }) => sharedClusterName));
  if (sharedClusters.has(resource.name) || (ownerCluster && sharedClusters.has(ownerCluster))) {
    throw new ProjectDatabaseErasureError(
      'Refusing to delete shared database infrastructure',
      'UNSAFE_KUBERNETES_TARGET',
    );
  }
}

export interface ProjectDatabaseErasureServiceOptions {
  kubernetesSettleAttempts?: number;
  kubernetesSettleDelayMs?: number;
  backupPageSize?: number;
  now?: () => Date;
  delay?: (milliseconds: number) => Promise<void>;
}

interface ManagerDatabaseErasureResponse {
  resources?: ProjectDatabaseKubernetesResource[];
  nextCursor?: string;
  authorities?: Array<{
    instanceId: string;
    tier: 'shared' | 'isolated';
    clusterName: string;
    databaseCrName?: string;
    databaseName?: string;
    roleName?: string;
    backupBucket?: string;
    backupPrefix?: string;
    clusterUid?: string;
    databaseCrUid?: string;
    retentionDays: number;
  }>;
  outcome?: 'deleted' | 'absent';
}

/**
 * Lease-bearing workspace-manager bridge. The manager independently validates
 * the parent permanent-delete operation and repeats tenant ownership before its
 * resourceVersion-preconditioned delete.
 */
export class ManagerProjectDatabaseKubernetesPort implements ProjectDatabaseKubernetesPort {
  constructor(
    private readonly baseUrl: string,
    private readonly lease: ObjectStorageOperationLease,
    private readonly expectedOrganizationId: string,
    private readonly secret?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private body(input: {
    projectId: string;
    knownClusterNames: readonly string[];
    knownResourceNames?: Readonly<Partial<Record<ProjectDatabaseKubernetesKind, readonly string[]>>>;
  }) {
    return {
      operationId: this.lease.operationId,
      ownerToken: this.lease.ownerToken,
      fencingToken: this.lease.fencingToken.toString(),
      requestHash: this.lease.requestHash,
      scopeHash: this.lease.scopeHash,
      projectId: input.projectId,
      expectedOrganizationId: this.expectedOrganizationId,
      knownClusterNames: input.knownClusterNames,
      knownResourceNames: input.knownResourceNames ?? {},
    };
  }

  private async call(projectId: string, action: 'authority' | 'inventory' | 'delete', body: Record<string, unknown>) {
    const response = await this.fetchImpl(
      `${this.baseUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId)}/permanent-delete/databases/${action}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.secret ? { authorization: `Bearer ${this.secret}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(action === 'delete' ? 45_000 : 30_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new ProjectDatabaseErasureError(
        `Workspace-manager database ${action} failed (${response.status})`,
        action === 'delete' ? 'KUBERNETES_ERASURE_INCOMPLETE' : 'KUBERNETES_ERASURE_INCOMPLETE',
      );
    }
    return (await response.json()) as ManagerDatabaseErasureResponse;
  }

  async inventory(input: {
    projectId: string;
    namespace: typeof DB_NAMESPACE;
    knownClusterNames: readonly string[];
    knownResourceNames?: Readonly<Partial<Record<ProjectDatabaseKubernetesKind, readonly string[]>>>;
  }): Promise<ProjectDatabaseKubernetesResource[]> {
    const resources: ProjectDatabaseKubernetesResource[] = [];
    const identities = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 10_000; page += 1) {
      const response = await this.call(input.projectId, 'inventory', {
        ...this.body(input),
        ...(cursor ? { cursor } : {}),
        limit: 250,
      });
      if (!Array.isArray(response.resources)) {
        throw new ProjectDatabaseErasureError('Workspace-manager database inventory is unreadable', 'INVALID_PLAN');
      }
      for (const resource of response.resources) {
        const identity = `${resource.kind}:${resource.name}`;
        if (identities.has(identity)) {
          throw new ProjectDatabaseErasureError('Workspace-manager inventory pagination repeated', 'INVALID_PLAN');
        }
        identities.add(identity);
        resources.push(resource);
      }
      if (!response.nextCursor) return resources;
      if (response.nextCursor === cursor || response.resources.length === 0) {
        throw new ProjectDatabaseErasureError('Workspace-manager inventory cursor stalled', 'INVALID_PLAN');
      }
      cursor = response.nextCursor;
    }
    throw new ProjectDatabaseErasureError('Workspace-manager inventory exceeded page limit', 'INVALID_PLAN');
  }

  async resolveLegacyAuthorities(input: {
    projectId: string;
    instances: readonly { id: string; environment: DatabaseEnvironment; retentionDays: number }[];
  }): Promise<ProjectDatabaseLegacyAuthorityResolution[]> {
    const response = await this.call(input.projectId, 'authority', {
      ...this.body({ projectId: input.projectId, knownClusterNames: [] }),
      instances: input.instances,
    });
    if (!Array.isArray(response.authorities) || response.authorities.length !== input.instances.length) {
      throw new ProjectDatabaseErasureError('Workspace-manager database authority is unreadable', 'INVALID_PLAN');
    }
    return response.authorities.map(({ instanceId, ...authority }) => ({ instanceId, authority }));
  }

  async delete(input: {
    projectId: string;
    namespace: typeof DB_NAMESPACE;
    knownClusterNames: readonly string[];
    knownResourceNames?: Readonly<Partial<Record<ProjectDatabaseKubernetesKind, readonly string[]>>>;
    resource: ProjectDatabaseKubernetesResource;
  }): Promise<'deleted' | 'absent'> {
    const response = await this.call(input.projectId, 'delete', { ...this.body(input), resource: input.resource });
    if (response.outcome !== 'deleted' && response.outcome !== 'absent') {
      throw new ProjectDatabaseErasureError('Workspace-manager database delete receipt is unreadable', 'INVALID_PLAN');
    }
    return response.outcome;
  }
}

export class ProjectDatabaseErasureService {
  private readonly kubernetesSettleAttempts: number;
  private readonly kubernetesSettleDelayMs: number;
  private readonly backupPageSize: number;
  private readonly now: () => Date;
  private readonly delay: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly kubernetes: ProjectDatabaseKubernetesPort,
    private readonly backups: ProjectDatabaseBackupPort,
    private readonly sharedSql?: ProjectDatabaseSharedSqlPort,
    options: ProjectDatabaseErasureServiceOptions = {},
  ) {
    this.kubernetesSettleAttempts = Math.max(1, Math.min(300, options.kubernetesSettleAttempts ?? 60));
    this.kubernetesSettleDelayMs = Math.max(0, Math.min(10_000, options.kubernetesSettleDelayMs ?? 1_000));
    this.backupPageSize = Math.max(1, Math.min(1_000, options.backupPageSize ?? 500));
    this.now = options.now ?? (() => new Date());
    this.delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  private context(
    plan: ProjectDatabaseErasurePlan,
    stage: ProjectDatabaseErasureStage,
    effect?: string,
  ): ProjectDatabaseErasureFenceContext {
    return {
      operationId: plan.operationId,
      projectId: plan.projectId,
      organizationId: plan.organizationId,
      inventorySha256: plan.inventorySha256,
      stage,
      effect,
    };
  }

  private async guard(
    plan: ProjectDatabaseErasurePlan,
    fence: ProjectDatabaseErasureFence,
    stage: ProjectDatabaseErasureStage,
    effect?: string,
  ): Promise<void> {
    await fence.assertActive(this.context(plan, stage, effect));
  }

  private knownClusterNames(plan: ProjectDatabaseErasurePlan): string[] {
    return [...new Set([...plan.targets.clusterNames, ...plan.targets.restoreClusterNames])].sort();
  }

  private async inventoryKubernetes(
    plan: ProjectDatabaseErasurePlan,
    knownClusterNames: Set<string>,
  ): Promise<ProjectDatabaseKubernetesResource[]> {
    const resources = await this.kubernetes.inventory({
      projectId: plan.projectId,
      namespace: DB_NAMESPACE,
      knownClusterNames: [...knownClusterNames].sort(),
      knownResourceNames: {
        Cluster: [...new Set([...plan.targets.clusterNames, ...plan.targets.restoreClusterNames])].sort(),
        ScheduledBackup: plan.targets.scheduledBackupNames,
        Backup: plan.targets.backupNames,
        Database: plan.targets.databaseCrNames,
      },
    });

    for (const resource of resources) {
      assertSafeKubernetesResource(plan, resource);

      if (resource.kind === 'Cluster') {
        knownClusterNames.add(resource.name);
      }
    }

    return resources;
  }

  private async purgeKubernetes(
    plan: ProjectDatabaseErasurePlan,
    fence: ProjectDatabaseErasureFence,
    knownClusterNames: Set<string>,
  ): Promise<{
    deleted: number;
    persistentVolumeClaims: Array<{
      namespace: typeof DB_NAMESPACE;
      pvcName: string;
      expectedPvcUid: string;
    }>;
  }> {
    let deleted = 0;
    const persistentVolumeClaims = new Map<
      string,
      { namespace: typeof DB_NAMESPACE; pvcName: string; expectedPvcUid: string }
    >();

    for (let attempt = 1; attempt <= this.kubernetesSettleAttempts; attempt += 1) {
      await this.guard(plan, fence, 'KUBERNETES_PURGE', `inventory:${attempt}`);
      const resources = await this.inventoryKubernetes(plan, knownClusterNames);
      for (const resource of resources) {
        if (resource.kind !== 'PersistentVolumeClaim') continue;
        const key = `${resource.namespace}/${resource.name}`;
        const previous = persistentVolumeClaims.get(key);
        if (previous && previous.expectedPvcUid !== resource.uid) {
          throw new ProjectDatabaseErasureError('CNPG PVC UID changed during quiescence', 'UNSAFE_KUBERNETES_TARGET');
        }
        persistentVolumeClaims.set(key, {
          namespace: resource.namespace,
          pvcName: resource.name,
          expectedPvcUid: resource.uid,
        });
      }
      const controllerResources = resources.filter(({ kind }) => kind !== 'PersistentVolumeClaim');

      if (controllerResources.length === 0) {
        return {
          deleted,
          persistentVolumeClaims: [...persistentVolumeClaims.values()].sort((left, right) =>
            left.pvcName.localeCompare(right.pvcName),
          ),
        };
      }

      controllerResources.sort(
        (left, right) =>
          (KUBERNETES_DELETE_ORDER.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
            (KUBERNETES_DELETE_ORDER.get(right.kind) ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name),
      );

      // A live CNPG Cluster is an asynchronous PVC producer. Fence it first
      // with propagation=Orphan, then re-inventory and prove the CR absent before
      // touching any descendant. This prevents the operator from recreating a
      // PVC while the shared volume saga is erasing provider volumes.
      const clusterControllers = controllerResources.filter(({ kind }) => kind === 'Cluster');
      const deletionBatch = clusterControllers.length > 0 ? clusterControllers : controllerResources;

      for (const resource of deletionBatch) {
        const effect = `delete:${resource.kind}:${resource.name}:${resource.resourceVersion}`;
        await this.guard(plan, fence, 'KUBERNETES_PURGE', effect);
        const result = await this.kubernetes.delete({
          projectId: plan.projectId,
          namespace: DB_NAMESPACE,
          knownClusterNames: [...knownClusterNames].sort(),
          knownResourceNames: {
            Cluster: [...new Set([...plan.targets.clusterNames, ...plan.targets.restoreClusterNames])].sort(),
            ScheduledBackup: plan.targets.scheduledBackupNames,
            Backup: plan.targets.backupNames,
            Database: plan.targets.databaseCrNames,
          },
          resource,
        });
        deleted += result === 'deleted' ? 1 : 0;
        await this.guard(plan, fence, 'KUBERNETES_PURGE', `${effect}:complete`);
      }

      if (attempt < this.kubernetesSettleAttempts && this.kubernetesSettleDelayMs > 0) {
        await this.delay(this.kubernetesSettleDelayMs);
      }
    }

    const residue = (await this.inventoryKubernetes(plan, knownClusterNames)).filter(
      ({ kind }) => kind !== 'PersistentVolumeClaim',
    );

    if (residue.length > 0) {
      throw new ProjectDatabaseErasureError(
        `Kubernetes database erasure incomplete (${residue.length} resource(s) remain)`,
        'KUBERNETES_ERASURE_INCOMPLETE',
      );
    }

    return {
      deleted,
      persistentVolumeClaims: [...persistentVolumeClaims.values()].sort((left, right) =>
        left.pvcName.localeCompare(right.pvcName),
      ),
    };
  }

  private async purgeSharedTenants(
    plan: ProjectDatabaseErasurePlan,
    fence: ProjectDatabaseErasureFence,
  ): Promise<number> {
    if (plan.targets.sharedTenants.length === 0) {
      return 0;
    }

    if (!this.sharedSql) {
      throw new ProjectDatabaseErasureError('Shared SQL erasure port is required', 'SHARED_SQL_PORT_REQUIRED');
    }

    let erased = 0;

    for (const tenant of plan.targets.sharedTenants) {
      await this.guard(plan, fence, 'SHARED_SQL_PURGE', `tenant:${tenant.environment}:begin`);
      await this.sharedSql.eraseTenant(tenant, (effect) =>
        this.guard(plan, fence, 'SHARED_SQL_PURGE', `tenant:${tenant.environment}:${effect}`),
      );
      await this.guard(plan, fence, 'SHARED_SQL_PURGE', `tenant:${tenant.environment}:inspect`);
      const state = await this.sharedSql.inspectTenant(tenant);

      if (state.databaseExists || state.roleExists) {
        throw new ProjectDatabaseErasureError(
          'Shared tenant database or role remains',
          'SHARED_SQL_ERASURE_INCOMPLETE',
        );
      }

      erased += 1;
      await this.guard(plan, fence, 'SHARED_SQL_PURGE', `tenant:${tenant.environment}:verified`);
    }

    return erased;
  }

  private assertSafeBackupVersion(
    target: { bucket: string; prefix: string },
    version: ProjectDatabaseBackupVersion,
    softDeleted: boolean,
  ): void {
    if (
      !version.key.startsWith(target.prefix) ||
      !version.generation.trim() ||
      version.softDeleted !== softDeleted ||
      (softDeleted && (!version.hardDeleteTime || !Number.isFinite(Date.parse(version.hardDeleteTime))))
    ) {
      throw new ProjectDatabaseErasureError('Backup target escaped the project prefix', 'UNSAFE_BACKUP_TARGET');
    }
  }

  private async listBackupPage(
    target: { bucket: string; prefix: string },
    softDeleted: boolean,
  ): Promise<ProjectDatabaseBackupVersion[]> {
    const versions = await this.backups.listFirstPage({
      bucket: target.bucket,
      prefix: target.prefix,
      limit: this.backupPageSize,
      softDeleted,
    });

    for (const version of versions) {
      this.assertSafeBackupVersion(target, version, softDeleted);
    }

    return versions;
  }

  private async purgeBackups(plan: ProjectDatabaseErasurePlan, fence: ProjectDatabaseErasureFence): Promise<number> {
    let deleted = 0;

    for (const target of plan.backupTargets) {
      await this.guard(plan, fence, 'BACKUP_PREFIX_PURGE', `bucket-policy:${target.bucket}`);
      const bucket = await this.backups.inspectBucket({ bucket: target.bucket });
      if (bucket.softDeleteRetentionSeconds !== 0) {
        throw new ProjectDatabaseErasureError(
          'Backup bucket soft-delete policy must be disabled before permanent deletion',
          'BACKUP_SOFT_DELETE_POLICY_ENABLED',
        );
      }
      while (true) {
        await this.guard(plan, fence, 'BACKUP_PREFIX_PURGE', `list-generations:${target.bucket}:${target.prefix}`);
        const versions = await this.listBackupPage(target, false);
        if (versions.length === 0) break;

        for (const version of versions) {
          const effect = `delete:${target.bucket}:${version.key}:${version.generation}`;
          await this.guard(plan, fence, 'BACKUP_PREFIX_PURGE', effect);
          const result = await this.backups.deleteVersion({
            bucket: target.bucket,
            key: version.key,
            generation: version.generation,
          });
          deleted += result === 'deleted' ? 1 : 0;
          await this.guard(plan, fence, 'BACKUP_PREFIX_PURGE', `${effect}:complete`);
        }
      }
    }
    return deleted;
  }

  private async verifyBackupTargets(
    plan: ProjectDatabaseErasurePlan,
    fence: ProjectDatabaseErasureFence,
  ): Promise<Array<{ bucket: string; prefix: string; generationsAbsent: true; softDeletedAbsent: true }>> {
    const proof: Array<{ bucket: string; prefix: string; generationsAbsent: true; softDeletedAbsent: true }> = [];
    for (const target of plan.backupTargets) {
      await this.guard(plan, fence, 'FINAL_VERIFICATION', `bucket-policy:${target.bucket}`);
      const policy = await this.backups.inspectBucket({ bucket: target.bucket });
      if (policy.softDeleteRetentionSeconds !== 0) {
        throw new ProjectDatabaseErasureError(
          'Backup bucket soft-delete policy is enabled',
          'BACKUP_SOFT_DELETE_POLICY_ENABLED',
        );
      }
      const live = await this.listBackupPage(target, false);
      if (live.length > 0) {
        throw new ProjectDatabaseErasureError('Backup generations reappeared', 'BACKUP_ERASURE_INCOMPLETE');
      }
      const softDeleted = await this.listBackupPage(target, true);
      if (softDeleted.length > 0) {
        const retryAt = softDeleted
          .map(({ hardDeleteTime }) => hardDeleteTime!)
          .sort((left, right) => left.localeCompare(right))
          .at(-1)!;
        const error = new ProjectDatabaseErasureError(
          'Soft-deleted backup generations remain provider-readable',
          Date.parse(retryAt) > this.now().getTime()
            ? 'BACKUP_SOFT_DELETE_RETENTION_ACTIVE'
            : 'BACKUP_ERASURE_INCOMPLETE',
        );
        throw Object.assign(error, { retryAt });
      }
      proof.push({ ...target, generationsAbsent: true, softDeletedAbsent: true });
    }
    return proof;
  }

  private verifySharedRetentionBarriers(plan: ProjectDatabaseErasurePlan): Array<{
    clusterName: string;
    notBefore: string;
    satisfiedAt: string;
  }> {
    const satisfiedAt = this.now().toISOString();
    for (const barrier of plan.sharedRetentionBarriers) {
      if (Date.parse(satisfiedAt) < Date.parse(barrier.notBefore)) {
        throw Object.assign(
          new ProjectDatabaseErasureError(
            'Shared-cluster backup retention has not elapsed',
            'SHARED_BACKUP_RETENTION_ACTIVE',
          ),
          { retryAt: barrier.notBefore },
        );
      }
    }
    return plan.sharedRetentionBarriers.map(({ clusterName, notBefore }) => ({ clusterName, notBefore, satisfiedAt }));
  }

  private async verifySharedTenantsAbsent(
    plan: ProjectDatabaseErasurePlan,
    fence: ProjectDatabaseErasureFence,
  ): Promise<void> {
    if (plan.targets.sharedTenants.length === 0) {
      return;
    }

    if (!this.sharedSql) {
      throw new ProjectDatabaseErasureError('Shared SQL erasure port is required', 'SHARED_SQL_PORT_REQUIRED');
    }

    for (const tenant of plan.targets.sharedTenants) {
      await this.guard(plan, fence, 'FINAL_VERIFICATION', `shared-tenant:${tenant.environment}`);
      const state = await this.sharedSql.inspectTenant(tenant);

      if (state.databaseExists || state.roleExists) {
        throw new ProjectDatabaseErasureError(
          'Shared tenant database or role remains',
          'SHARED_SQL_ERASURE_INCOMPLETE',
        );
      }
    }
  }

  private rebound(plan: ProjectDatabaseErasurePlan): ProjectDatabaseErasurePlan {
    const reboundPlan = buildProjectDatabaseErasurePlan({
      schemaVersion: plan.schemaVersion,
      operationId: plan.operationId,
      projectId: plan.projectId,
      organizationId: plan.organizationId,
      capturedAt: plan.capturedAt,
      instances: plan.instances,
    });

    if (JSON.stringify(canonicalize(reboundPlan)) !== JSON.stringify(canonicalize(plan))) {
      throw new ProjectDatabaseErasureError('Database erasure inventory digest mismatch', 'INVALID_PLAN');
    }

    return reboundPlan;
  }

  private async verifyAbsent(
    plan: ProjectDatabaseErasurePlan,
    fence: ProjectDatabaseErasureFence,
    effects: ProjectDatabaseErasureReceipt['effects'],
  ): Promise<ProjectDatabaseErasureReceipt> {
    const knownClusterNames = new Set(this.knownClusterNames(plan));
    await this.guard(plan, fence, 'FINAL_VERIFICATION');
    const kubernetesResidue = await this.inventoryKubernetes(plan, knownClusterNames);
    const backupTargets = await this.verifyBackupTargets(plan, fence);
    const sharedRetentionBarriers = this.verifySharedRetentionBarriers(plan);
    await this.verifySharedTenantsAbsent(plan, fence);

    if (kubernetesResidue.length > 0) {
      throw new ProjectDatabaseErasureError('Kubernetes resources reappeared', 'KUBERNETES_ERASURE_INCOMPLETE');
    }

    await fence.checkpoint({
      ...this.context(plan, 'FINAL_VERIFICATION'),
      evidence: {
        kubernetesResidueCount: 0,
        backupGenerationResidueCount: 0,
        backupSoftDeletedResidueCount: 0,
        sharedRetentionBarrierCount: sharedRetentionBarriers.length,
        sharedTenantsAbsent: true,
      },
    });

    const receipt: ProjectDatabaseErasureReceipt = {
      schemaVersion: 2,
      operationId: plan.operationId,
      projectId: plan.projectId,
      organizationId: plan.organizationId,
      inventorySha256: plan.inventorySha256,
      verifiedAt: this.now().toISOString(),
      effects,
      proof: {
        kubernetesNamespace: DB_NAMESPACE,
        kubernetesAbsent: true,
        sharedTenantsAbsent: true,
        backupTargets,
        sharedRetentionBarriers,
        backupGenerationsAbsent: true,
      },
    };

    await this.guard(plan, fence, 'VERIFIED');
    await fence.checkpoint({
      ...this.context(plan, 'VERIFIED'),
      evidence: canonicalize(receipt) as Record<string, unknown>,
    });
    await this.guard(plan, fence, 'VERIFIED', 'return-receipt');

    return receipt;
  }

  /** Verify-first crash recovery. This method performs no provider mutation. */
  async verify(
    plan: ProjectDatabaseErasurePlan,
    fence: ProjectDatabaseErasureFence,
    effects: ProjectDatabaseErasureEffects,
  ): Promise<ProjectDatabaseErasureReceipt> {
    this.rebound(plan);
    return this.verifyAbsent(plan, fence, effects);
  }

  /**
   * Read-only RBAC/IAM/secret preflight while the parent operation is PREPARED.
   * A missing permission therefore fails safe before any provider effect can be
   * dispatched and before verify-first recovery becomes mandatory.
   */
  async preflight(plan: ProjectDatabaseErasurePlan, fence: ProjectDatabaseErasureFence): Promise<void> {
    this.rebound(plan);
    await this.guard(plan, fence, 'INVENTORY_BOUND', 'preflight:kubernetes');
    await this.inventoryKubernetes(plan, new Set(this.knownClusterNames(plan)));
    for (const target of plan.backupTargets) {
      await this.guard(plan, fence, 'INVENTORY_BOUND', `preflight:gcs:${target.bucket}`);
      const policy = await this.backups.inspectBucket({ bucket: target.bucket });
      if (policy.softDeleteRetentionSeconds !== 0) {
        throw new ProjectDatabaseErasureError(
          'Backup bucket soft-delete policy must be disabled before erasure',
          'BACKUP_SOFT_DELETE_POLICY_ENABLED',
        );
      }
      await this.listBackupPage(target, false);
      await this.listBackupPage(target, true);
    }
    if (plan.targets.sharedTenants.length > 0 && !this.sharedSql) {
      throw new ProjectDatabaseErasureError('Shared SQL erasure port is required', 'SHARED_SQL_PORT_REQUIRED');
    }
    for (const tenant of plan.targets.sharedTenants) {
      await this.guard(plan, fence, 'INVENTORY_BOUND', `preflight:shared:${tenant.environment}`);
      await this.sharedSql!.inspectTenant(tenant);
    }
  }

  /** Execute provider mutations outside DB transactions, stopping before proof. */
  async purge(
    plan: ProjectDatabaseErasurePlan,
    fence: ProjectDatabaseErasureFence,
  ): Promise<ProjectDatabaseErasureEffects> {
    this.rebound(plan);

    await this.guard(plan, fence, 'INVENTORY_BOUND');
    await fence.checkpoint({
      ...this.context(plan, 'INVENTORY_BOUND'),
      evidence: {
        capturedAt: plan.capturedAt,
        instanceCount: plan.instances.length,
        snapshotCount: plan.instances.reduce((count, instance) => count + instance.snapshots.length, 0),
        restoreCount: plan.instances.reduce((count, instance) => count + instance.restores.length, 0),
      },
    });

    const knownClusterNames = new Set(this.knownClusterNames(plan));
    const kubernetes = await this.purgeKubernetes(plan, fence, knownClusterNames);
    await fence.checkpoint({
      ...this.context(plan, 'KUBERNETES_PURGE'),
      evidence: {
        deleted: kubernetes.deleted,
        namespace: DB_NAMESPACE,
        persistentVolumeClaims: kubernetes.persistentVolumeClaims,
        controllersQuiesced: true,
      },
    });

    const sharedTenantsErased = await this.purgeSharedTenants(plan, fence);
    await fence.checkpoint({
      ...this.context(plan, 'SHARED_SQL_PURGE'),
      evidence: { erased: sharedTenantsErased },
    });

    const backupGenerationsDeleted = await this.purgeBackups(plan, fence);
    await fence.checkpoint({
      ...this.context(plan, 'BACKUP_PREFIX_PURGE'),
      evidence: {
        targets: plan.backupTargets,
        deletedGenerations: backupGenerationsDeleted,
      },
    });

    return {
      kubernetesResourcesDeleted: kubernetes.deleted,
      sharedTenantsErased,
      backupGenerationsDeleted,
      persistentVolumeClaims: kubernetes.persistentVolumeClaims,
    };
  }

  /** Execute provider effects outside DB transactions and return only live proof. */
  async erase(
    plan: ProjectDatabaseErasurePlan,
    fence: ProjectDatabaseErasureFence,
  ): Promise<ProjectDatabaseErasureReceipt> {
    const effects = await this.purge(plan, fence);
    return this.verifyAbsent(plan, fence, effects);
  }
}

interface GcsBackupFileLike {
  name: string;
  metadata?: { generation?: string | number; hardDeleteTime?: string };
  delete(options: { ifGenerationMatch: string }): Promise<unknown>;
}

interface GcsBackupBucketLike {
  iam: {
    testPermissions(permissions: string[]): Promise<[{ permissions?: string[] }, ...unknown[]]>;
  };
  getMetadata(): Promise<
    [{ softDeletePolicy?: { retentionDurationSeconds?: string | number | null } | null }, ...unknown[]]
  >;
  getFiles(options: Record<string, unknown>): Promise<[GcsBackupFileLike[], unknown?]>;
  file(name: string, options: { generation: string }): GcsBackupFileLike;
}

interface GcsBackupStorageLike {
  bucket(name: string): GcsBackupBucketLike;
}

function providerCode(error: unknown): string | number | undefined {
  return error && typeof error === 'object' && 'code' in error ? (error as { code?: string | number }).code : undefined;
}

/** Real, generation-pinned GCS adapter for DB_BACKUP_BUCKET. */
export class GcsProjectDatabaseBackupPort implements ProjectDatabaseBackupPort {
  constructor(
    private readonly bucketName?: string,
    private readonly storage: GcsBackupStorageLike = new Storage() as unknown as GcsBackupStorageLike,
  ) {}

  private bucket(inputBucket: string): GcsBackupBucketLike {
    if (
      !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(inputBucket) ||
      (this.bucketName && inputBucket !== this.bucketName)
    ) {
      throw new ProjectDatabaseErasureError(
        'Backup bucket does not match the configured adapter',
        'BACKUP_BUCKET_MISMATCH',
      );
    }

    return this.storage.bucket(inputBucket);
  }

  async inspectBucket(input: { bucket: string }): Promise<{ softDeleteRetentionSeconds: number }> {
    const bucket = this.bucket(input.bucket);
    const requiredPermissions = ['storage.buckets.get', 'storage.objects.delete', 'storage.objects.list'];
    const [permissionResult] = await bucket.iam.testPermissions(requiredPermissions);
    const granted = new Set(permissionResult.permissions ?? []);
    if (requiredPermissions.some((permission) => !granted.has(permission))) {
      throw new ProjectDatabaseErasureError(
        'Backup bucket IAM does not authorize exhaustive erasure',
        'BACKUP_IAM_PREFLIGHT_FAILED',
      );
    }
    const [metadata] = await bucket.getMetadata();
    const raw = metadata.softDeletePolicy?.retentionDurationSeconds ?? 0;
    const seconds = Number(raw);
    if (!Number.isSafeInteger(seconds) || seconds < 0) {
      throw new ProjectDatabaseErasureError('Backup bucket soft-delete policy is unreadable', 'INVALID_PLAN');
    }
    return { softDeleteRetentionSeconds: seconds };
  }

  async listFirstPage(input: {
    bucket: string;
    prefix: string;
    limit: number;
    softDeleted: boolean;
  }): Promise<ProjectDatabaseBackupVersion[]> {
    const [files] = await this.bucket(input.bucket).getFiles({
      prefix: input.prefix,
      ...(input.softDeleted ? { softDeleted: true } : { versions: true }),
      autoPaginate: false,
      maxResults: Math.max(1, Math.min(1_000, input.limit)),
    });

    return files.map((file) => {
      const generation = file.metadata?.generation;

      if (generation === undefined || generation === null || String(generation).length === 0) {
        throw new ProjectDatabaseErasureError(
          'A backup generation cannot be pinned for deletion',
          'BACKUP_GENERATION_UNPINNABLE',
        );
      }

      return {
        key: file.name,
        generation: String(generation),
        softDeleted: input.softDeleted,
        ...(input.softDeleted && file.metadata?.hardDeleteTime ? { hardDeleteTime: file.metadata.hardDeleteTime } : {}),
      };
    });
  }

  async deleteVersion(input: { bucket: string; key: string; generation: string }): Promise<'deleted' | 'absent'> {
    try {
      await this.bucket(input.bucket)
        .file(input.key, { generation: input.generation })
        .delete({ ifGenerationMatch: input.generation });

      return 'deleted';
    } catch (error) {
      const code = providerCode(error);

      if (code === 404 || code === '404') {
        return 'absent';
      }

      throw error;
    }
  }
}

export interface ProjectDatabaseAdminSqlClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null; rows?: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
}

export type ProjectDatabaseAdminUriResolver = (tenant: ProjectDatabaseSharedTenant) => Promise<string>;

function assertPostgresIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    throw new ProjectDatabaseErasureError('Unsafe Postgres identifier', 'INVALID_PLAN');
  }

  return value;
}

/** Real SQL adapter. Admin URI resolution stays secret-bearing and injectable. */
export class PgProjectDatabaseSharedSqlPort implements ProjectDatabaseSharedSqlPort {
  constructor(
    private readonly resolveAdminUri: ProjectDatabaseAdminUriResolver,
    private readonly createClient: (adminUri: string) => ProjectDatabaseAdminSqlClient = (adminUri) =>
      new PgClient({
        connectionString: adminUri,
        ssl: /sslmode=disable/.test(adminUri) ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 10_000,
        statement_timeout: 30_000,
      }) as unknown as ProjectDatabaseAdminSqlClient,
  ) {}

  private async withClient<T>(
    tenant: ProjectDatabaseSharedTenant,
    run: (client: ProjectDatabaseAdminSqlClient) => Promise<T>,
  ): Promise<T> {
    const adminUri = await this.resolveAdminUri(tenant);
    const client = this.createClient(adminUri);
    await client.connect();

    try {
      return await run(client);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async eraseTenant(input: ProjectDatabaseSharedTenant, guard: (effect: string) => Promise<void>): Promise<void> {
    const database = assertPostgresIdentifier(input.database);
    const role = assertPostgresIdentifier(input.role);

    await guard('resolve-admin');
    await this.withClient(input, async (client) => {
      await guard('terminate-connections');
      await client.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [database],
      );
      await guard('drop-database');
      await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await guard('inspect-role');
      const roleState = await client.query('SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS "exists"', [
        role,
      ]);

      if (roleState.rows?.[0]?.exists === true) {
        // Remove any tenant-owned objects/privileges in the admin DB. If the
        // role owns anything in another DB, DROP ROLE fails closed below.
        await guard('drop-owned');
        await client.query(`DROP OWNED BY "${role}"`);
        await guard('revoke-admin-membership');
        await client.query(`REVOKE "${role}" FROM CURRENT_USER`);
        await guard('drop-role');
        await client.query(`DROP ROLE "${role}"`);
      }
    });
    await guard('sql-effects-complete');
  }

  async inspectTenant(input: ProjectDatabaseSharedTenant): Promise<{ databaseExists: boolean; roleExists: boolean }> {
    const database = assertPostgresIdentifier(input.database);
    const role = assertPostgresIdentifier(input.role);

    return this.withClient(input, async (client) => {
      const result = await client.query(
        'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS "databaseExists", EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2) AS "roleExists"',
        [database, role],
      );
      const row = result.rows?.[0];

      if (!row || typeof row.databaseExists !== 'boolean' || typeof row.roleExists !== 'boolean') {
        throw new ProjectDatabaseErasureError(
          'Shared SQL absence proof is unreadable',
          'SHARED_SQL_ERASURE_INCOMPLETE',
        );
      }

      return { databaseExists: row.databaseExists, roleExists: row.roleExists };
    });
  }
}
