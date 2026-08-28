import { createHash } from 'node:crypto';

import { Storage } from '@google-cloud/storage';
import { Client as PgClient } from 'pg';

import {
  DB_NAMESPACE,
  clusterName,
  onDemandBackupName,
  restoreClusterName,
  sharedDbName,
  tenantRoleName,
  type DatabaseEnvironment,
  type DatabaseTier,
} from './database-provisioner.js';

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
  snapshots: ProjectDatabaseSnapshotErasureInventory[];
  restores: ProjectDatabaseRestoreErasureInventory[];
}

export interface ProjectDatabaseErasureCatalog {
  schemaVersion: 1;
  projectId: string;
  organizationId: string;
  capturedAt: string;
  /** Plan-derived topology. Both development and production use this tier. */
  tier: DatabaseTier;
  /** Required only for the shared tier; never a per-project deletion target. */
  sharedClusterName?: string;
  /** Concrete DB_BACKUP_BUCKET, without `gs://`. */
  backupBucket: string;
  instances: ProjectDatabaseInstanceErasureInventory[];
}

export interface ProjectDatabaseErasurePlan extends ProjectDatabaseErasureCatalog {
  operationId: string;
  inventorySha256: string;
  backupPrefix: string;
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
    source: 'project-label' | 'cnpg-cluster-label' | 'owner-reference' | 'service-label';
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
  }): Promise<ProjectDatabaseKubernetesResource[]>;
  delete(input: {
    projectId: string;
    namespace: typeof DB_NAMESPACE;
    knownClusterNames: readonly string[];
    resource: ProjectDatabaseKubernetesResource;
  }): Promise<'deleted' | 'absent'>;
}

export interface ProjectDatabaseBackupVersion {
  key: string;
  generation: string;
}

/** A generation-aware view over the dedicated CNPG backup bucket. */
export interface ProjectDatabaseBackupPort {
  listFirstPage(input: { bucket: string; prefix: string; limit: number }): Promise<ProjectDatabaseBackupVersion[]>;
  deleteVersion(input: { bucket: string; key: string; generation: string }): Promise<'deleted' | 'absent'>;
}

export interface ProjectDatabaseSharedTenant {
  sharedClusterName: string;
  environment: DatabaseEnvironment;
  database: string;
  role: string;
}

/** SQL effects run against the shared cluster's privileged, non-tenant DB. */
export interface ProjectDatabaseSharedSqlPort {
  eraseTenant(input: ProjectDatabaseSharedTenant, guard: (effect: string) => Promise<void>): Promise<void>;
  inspectTenant(input: ProjectDatabaseSharedTenant): Promise<{ databaseExists: boolean; roleExists: boolean }>;
}

export interface ProjectDatabaseErasureReceipt {
  schemaVersion: 1;
  operationId: string;
  projectId: string;
  organizationId: string;
  inventorySha256: string;
  verifiedAt: string;
  effects: {
    kubernetesResourcesDeleted: number;
    sharedTenantsErased: number;
    backupGenerationsDeleted: number;
  };
  proof: {
    kubernetesNamespace: typeof DB_NAMESPACE;
    kubernetesAbsent: true;
    sharedTenantsAbsent: true;
    backupBucket: string;
    backupPrefix: string;
    backupGenerationsAbsent: true;
  };
}

export type ProjectDatabaseErasureErrorCode =
  | 'INVALID_INVENTORY'
  | 'INVALID_PLAN'
  | 'UNSAFE_KUBERNETES_TARGET'
  | 'KUBERNETES_ERASURE_INCOMPLETE'
  | 'SHARED_SQL_PORT_REQUIRED'
  | 'SHARED_SQL_ERASURE_INCOMPLETE'
  | 'UNSAFE_BACKUP_TARGET'
  | 'BACKUP_ERASURE_INCOMPLETE'
  | 'BACKUP_GENERATION_UNPINNABLE'
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
  if (!Number.isFinite(value) || value < 0) {
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
  if (input.schemaVersion !== 1) {
    throw new ProjectDatabaseErasureError('Unsupported database erasure inventory version', 'INVALID_INVENTORY');
  }

  const projectId = requireSafeText(input.projectId, 'projectId', 63);
  const organizationId = requireSafeText(input.organizationId, 'organizationId', 128);
  const operationId = requireSafeText(input.operationId, 'operationId', 128);
  const backupBucket = requireSafeText(input.backupBucket, 'backupBucket', 222);

  if (backupBucket.startsWith('gs://') || backupBucket.includes('/')) {
    throw new ProjectDatabaseErasureError('backupBucket must be a GCS bucket name', 'INVALID_INVENTORY');
  }

  if (input.tier !== 'isolated' && input.tier !== 'shared') {
    throw new ProjectDatabaseErasureError('Invalid database tier', 'INVALID_INVENTORY');
  }

  const sharedClusterName = input.sharedClusterName?.trim();

  if (input.tier === 'shared' && !sharedClusterName) {
    throw new ProjectDatabaseErasureError('Shared topology requires sharedClusterName', 'INVALID_INVENTORY');
  }

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

      return {
        ...instance,
        id: requireSafeText(instance.id, 'DatabaseInstance.id', 128),
        projectId: requireSafeText(instance.projectId, 'DatabaseInstance.projectId', 63),
        organizationId: requireSafeText(instance.organizationId, 'DatabaseInstance.organizationId', 128),
        engine: requireSafeText(instance.engine, 'DatabaseInstance.engine', 64),
        region: instance.region ? requireSafeText(instance.region, 'DatabaseInstance.region', 128) : undefined,
        sizeBytes: requireNonNegativeNumber(instance.sizeBytes, 'DatabaseInstance.sizeBytes'),
        retentionDays: requireNonNegativeNumber(instance.retentionDays, 'DatabaseInstance.retentionDays'),
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
    schemaVersion: 1,
    projectId,
    organizationId,
    capturedAt: requireIsoDate(input.capturedAt, 'capturedAt'),
    tier: input.tier,
    sharedClusterName,
    backupBucket,
    instances,
  };
  const targetEnvironments: DatabaseEnvironment[] = ['development', 'production'];
  const clusterNames = targetEnvironments.map((environment) => clusterName(projectId, environment));
  const restoreClusterNames = instances.flatMap((instance) =>
    instance.restores.map((restore) => restoreClusterName(projectId, restore.id)),
  );
  const backupNames = instances.flatMap((instance) =>
    instance.snapshots.map((snapshot) => onDemandBackupName(projectId, snapshot.id, instance.environment)),
  );

  return {
    ...catalog,
    operationId,
    inventorySha256: inventoryDigest(catalog),
    backupPrefix: `db/${projectId}/`,
    targets: {
      environments: targetEnvironments,
      clusterNames,
      scheduledBackupNames: clusterNames.map((name) => `${name}-daily`),
      backupNames: [...new Set(backupNames)].sort(),
      restoreClusterNames: [...new Set(restoreClusterNames)].sort(),
      databaseCrNames: [...clusterNames],
      sharedTenants:
        input.tier === 'shared'
          ? targetEnvironments.map((environment) => ({
              environment,
              database: sharedDbName(projectId, environment),
              role: tenantRoleName(projectId, environment),
              sharedClusterName: sharedClusterName!,
            }))
          : [],
    },
  };
}

const KUBERNETES_DELETE_ORDER = new Map<ProjectDatabaseKubernetesKind, number>(
  [
    'ScheduledBackup',
    'Backup',
    'Database',
    'Deployment',
    'Job',
    'Pod',
    'Service',
    'EndpointSlice',
    'Secret',
    'ConfigMap',
    'ServiceAccount',
    'PodDisruptionBudget',
    // Keep the controller discoverable until its current descendants are gone.
    'Cluster',
    'PersistentVolumeClaim',
  ].map((kind, index) => [kind as ProjectDatabaseKubernetesKind, index]),
);

function isSafeProjectClusterName(plan: ProjectDatabaseErasurePlan, name: string): boolean {
  const development = clusterName(plan.projectId, 'development');

  return (
    plan.targets.clusterNames.includes(name) ||
    plan.targets.restoreClusterNames.includes(name) ||
    name.startsWith(`${development}-r-`)
  );
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

  const ownerCluster = resource.ownership.clusterName;

  if (ownerCluster && !isSafeProjectClusterName(plan, ownerCluster)) {
    throw new ProjectDatabaseErasureError(
      'Refusing a descendant of a non-project CNPG Cluster',
      'UNSAFE_KUBERNETES_TARGET',
    );
  }

  if (plan.sharedClusterName && (resource.name === plan.sharedClusterName || ownerCluster === plan.sharedClusterName)) {
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
  ): Promise<number> {
    let deleted = 0;

    for (let attempt = 1; attempt <= this.kubernetesSettleAttempts; attempt += 1) {
      await this.guard(plan, fence, 'KUBERNETES_PURGE', `inventory:${attempt}`);
      const resources = await this.inventoryKubernetes(plan, knownClusterNames);

      if (resources.length === 0) {
        return deleted;
      }

      resources.sort(
        (left, right) =>
          (KUBERNETES_DELETE_ORDER.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
            (KUBERNETES_DELETE_ORDER.get(right.kind) ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name),
      );

      for (const resource of resources) {
        const effect = `delete:${resource.kind}:${resource.name}:${resource.resourceVersion}`;
        await this.guard(plan, fence, 'KUBERNETES_PURGE', effect);
        const result = await this.kubernetes.delete({
          projectId: plan.projectId,
          namespace: DB_NAMESPACE,
          knownClusterNames: [...knownClusterNames].sort(),
          resource,
        });
        deleted += result === 'deleted' ? 1 : 0;
        await this.guard(plan, fence, 'KUBERNETES_PURGE', `${effect}:complete`);
      }

      if (attempt < this.kubernetesSettleAttempts && this.kubernetesSettleDelayMs > 0) {
        await this.delay(this.kubernetesSettleDelayMs);
      }
    }

    const residue = await this.inventoryKubernetes(plan, knownClusterNames);

    if (residue.length > 0) {
      throw new ProjectDatabaseErasureError(
        `Kubernetes database erasure incomplete (${residue.length} resource(s) remain)`,
        'KUBERNETES_ERASURE_INCOMPLETE',
      );
    }

    return deleted;
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

  private assertSafeBackupVersion(plan: ProjectDatabaseErasurePlan, version: ProjectDatabaseBackupVersion): void {
    if (!version.key.startsWith(plan.backupPrefix) || !version.generation.trim()) {
      throw new ProjectDatabaseErasureError('Backup target escaped the project prefix', 'UNSAFE_BACKUP_TARGET');
    }
  }

  private async listBackupPage(plan: ProjectDatabaseErasurePlan): Promise<ProjectDatabaseBackupVersion[]> {
    const versions = await this.backups.listFirstPage({
      bucket: plan.backupBucket,
      prefix: plan.backupPrefix,
      limit: this.backupPageSize,
    });

    for (const version of versions) {
      this.assertSafeBackupVersion(plan, version);
    }

    return versions;
  }

  private async purgeBackups(plan: ProjectDatabaseErasurePlan, fence: ProjectDatabaseErasureFence): Promise<number> {
    let deleted = 0;

    while (true) {
      await this.guard(plan, fence, 'BACKUP_PREFIX_PURGE', 'list-generations');
      const versions = await this.listBackupPage(plan);

      if (versions.length === 0) {
        return deleted;
      }

      for (const version of versions) {
        const effect = `delete:${version.key}:${version.generation}`;
        await this.guard(plan, fence, 'BACKUP_PREFIX_PURGE', effect);
        const result = await this.backups.deleteVersion({
          bucket: plan.backupBucket,
          key: version.key,
          generation: version.generation,
        });
        deleted += result === 'deleted' ? 1 : 0;
        await this.guard(plan, fence, 'BACKUP_PREFIX_PURGE', `${effect}:complete`);
      }
    }
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

  /** Execute provider effects outside DB transactions and return only live proof. */
  async erase(
    plan: ProjectDatabaseErasurePlan,
    fence: ProjectDatabaseErasureFence,
  ): Promise<ProjectDatabaseErasureReceipt> {
    const reboundPlan = buildProjectDatabaseErasurePlan({
      schemaVersion: plan.schemaVersion,
      operationId: plan.operationId,
      projectId: plan.projectId,
      organizationId: plan.organizationId,
      capturedAt: plan.capturedAt,
      tier: plan.tier,
      sharedClusterName: plan.sharedClusterName,
      backupBucket: plan.backupBucket,
      instances: plan.instances,
    });

    if (JSON.stringify(canonicalize(reboundPlan)) !== JSON.stringify(canonicalize(plan))) {
      throw new ProjectDatabaseErasureError('Database erasure inventory digest mismatch', 'INVALID_PLAN');
    }

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
    const kubernetesResourcesDeleted = await this.purgeKubernetes(plan, fence, knownClusterNames);
    await fence.checkpoint({
      ...this.context(plan, 'KUBERNETES_PURGE'),
      evidence: { deleted: kubernetesResourcesDeleted, namespace: DB_NAMESPACE },
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
        bucket: plan.backupBucket,
        prefix: plan.backupPrefix,
        deletedGenerations: backupGenerationsDeleted,
      },
    });

    await this.guard(plan, fence, 'FINAL_VERIFICATION');
    const kubernetesResidue = await this.inventoryKubernetes(plan, knownClusterNames);
    await this.guard(plan, fence, 'FINAL_VERIFICATION', 'backup-generations');
    const backupResidue = await this.listBackupPage(plan);
    await this.verifySharedTenantsAbsent(plan, fence);

    if (kubernetesResidue.length > 0) {
      throw new ProjectDatabaseErasureError('Kubernetes resources reappeared', 'KUBERNETES_ERASURE_INCOMPLETE');
    }

    if (backupResidue.length > 0) {
      throw new ProjectDatabaseErasureError('Backup generations reappeared', 'BACKUP_ERASURE_INCOMPLETE');
    }

    const receipt: ProjectDatabaseErasureReceipt = {
      schemaVersion: 1,
      operationId: plan.operationId,
      projectId: plan.projectId,
      organizationId: plan.organizationId,
      inventorySha256: plan.inventorySha256,
      verifiedAt: this.now().toISOString(),
      effects: { kubernetesResourcesDeleted, sharedTenantsErased, backupGenerationsDeleted },
      proof: {
        kubernetesNamespace: DB_NAMESPACE,
        kubernetesAbsent: true,
        sharedTenantsAbsent: true,
        backupBucket: plan.backupBucket,
        backupPrefix: plan.backupPrefix,
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
}

interface GcsBackupFileLike {
  name: string;
  metadata?: { generation?: string | number };
  delete(options: { ifGenerationMatch: string }): Promise<unknown>;
}

interface GcsBackupBucketLike {
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
    private readonly bucketName: string,
    private readonly storage: GcsBackupStorageLike = new Storage() as unknown as GcsBackupStorageLike,
  ) {}

  private bucket(inputBucket: string): GcsBackupBucketLike {
    if (inputBucket !== this.bucketName) {
      throw new ProjectDatabaseErasureError(
        'Backup bucket does not match the configured adapter',
        'BACKUP_BUCKET_MISMATCH',
      );
    }

    return this.storage.bucket(this.bucketName);
  }

  async listFirstPage(input: {
    bucket: string;
    prefix: string;
    limit: number;
  }): Promise<ProjectDatabaseBackupVersion[]> {
    const [files] = await this.bucket(input.bucket).getFiles({
      prefix: input.prefix,
      versions: true,
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

      return { key: file.name, generation: String(generation) };
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

export type ProjectDatabaseAdminUriResolver = (sharedClusterName: string) => Promise<string>;

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
    sharedClusterName: string,
    run: (client: ProjectDatabaseAdminSqlClient) => Promise<T>,
  ): Promise<T> {
    const adminUri = await this.resolveAdminUri(sharedClusterName);
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
    await this.withClient(input.sharedClusterName, async (client) => {
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

    return this.withClient(input.sharedClusterName, async (client) => {
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
