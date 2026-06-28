/**
 * Replit-parity database point-in-time rollback — Phase 2 provisioner.
 *
 * Implements the CloudNativePG (CNPG) provisioning + snapshot + point-in-time
 * restore against the chosen architecture (docs/DB_PITR_ARCHITECTURE.md,
 * Option 1). Everything here is DORMANT: `resolveDatabaseProvisioner` returns a
 * NoopProvisioner unless `DB_ROLLBACK_ENABLED === 'true'` AND a real k8s port is
 * wired, so no Postgres is ever created and there is no cost until Avi flips the
 * flag and installs the operator.
 *
 * The api pod has no k8s RBAC (only the workspace-manager does), so the real
 * CNPG CRs are applied through a `K8sApplyPort` whose production impl routes to
 * the workspace-manager control plane. The manifest builders + executor state
 * machine are pure and unit-tested with a fake port.
 */

/** Minimal manifest shape (structurally compatible with k8s-client's K8sObject). */
export interface K8sManifest {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
  spec?: Record<string, unknown>;
}

/** Port the provisioner uses to talk to Kubernetes (real impl = via ws-manager). */
export interface K8sApplyPort {
  apply(manifest: K8sManifest): Promise<void>;
  get(kind: string, namespace: string, name: string): Promise<{ status?: Record<string, unknown> } | undefined>;
  delete(kind: string, namespace: string, name: string): Promise<void>;
}

export const DB_NAMESPACE = 'project-databases';
const CNPG_API = 'postgresql.cnpg.io/v1';

export function clusterName(projectId: string): string {
  return `db-${projectId}`.toLowerCase().slice(0, 53);
}

export function restoreClusterName(projectId: string, restoreId: string): string {
  return `db-${projectId}-r-${restoreId}`.toLowerCase().slice(0, 53);
}

function dbLabels(projectId: string, organizationId?: string): Record<string, string> {
  return {
    'app.kubernetes.io/name': 'vibecore-database',
    'app.kubernetes.io/managed-by': 'vibecore',
    'vibecore.ai/project-id': projectId,
    ...(organizationId ? { 'vibecore.ai/org-id': organizationId } : {}),
  };
}

/*
 * TIER routing by PLAN (NOT by dev/prod) — see docs/DB_ARCHITECTURE_V3_TIERED.md.
 * Replit isolates every PAID project per-project from dev onward (Helium dev is
 * already isolated, not just Neon prod); we only mutualise the FREE tier for cost.
 *   free            → 'shared'   (shared CNPG cluster + logical Database CRD)
 *   team/enterprise → 'isolated' (dedicated per-project CNPG Cluster, hibernated)
 * Both the dev and prod database of a project use the SAME tier as its org plan: a
 * paying customer is never on the shared cluster, even while developing. Hibernation
 * (scale-to-zero) applies to both tiers for cost.
 */
export type DatabaseTier = 'shared' | 'isolated';

export function resolveDatabaseTier(planKey: string | undefined): DatabaseTier {
  return planKey === 'team' || planKey === 'enterprise' ? 'isolated' : 'shared';
}

/** Safe Postgres identifier derived from a (cuid) project id. */
function pgIdent(prefix: string, projectId: string): string {
  const safe = projectId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);

  return `${prefix}${safe}`;
}

/** Shared-tier per-project logical db + owner role names. */
export function sharedDbName(projectId: string): string {
  return pgIdent('proj_', projectId);
}

export function tenantRoleName(projectId: string): string {
  return pgIdent('t_', projectId);
}

/**
 * SQL to provision + ISOLATE a shared-tier tenant on a shared cluster. Run as a
 * privileged role. Identifiers are derived from the cuid project id (alnum only)
 * and the password is bound as a parameter — never string-interpolated.
 */
export function buildTenantProvisionSql(projectId: string): { role: string; db: string; statements: string[] } {
  const role = tenantRoleName(projectId);
  const db = sharedDbName(projectId);

  return {
    role,
    db,
    statements: [
      // role created with a bound password (caller passes it as the single param)
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE "${role}" LOGIN PASSWORD $1; END IF; END $$;`,
      `SELECT 'CREATE DATABASE "${db}" OWNER "${role}"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db}')\\gexec`,
      // Tenant isolation: only the owner may connect to its own db.
      `REVOKE CONNECT ON DATABASE "${db}" FROM PUBLIC;`,
      `GRANT CONNECT ON DATABASE "${db}" TO "${role}";`,
    ],
  };
}

/** Shared-tier: a CNPG Database CRD binding a logical db to a shared cluster. */
export function buildDatabaseCrManifest(input: {
  projectId: string;
  organizationId?: string;
  sharedClusterName: string;
}): K8sManifest {
  return {
    apiVersion: CNPG_API,
    kind: 'Database',
    metadata: {
      name: `db-${input.projectId}`.toLowerCase().slice(0, 53),
      namespace: DB_NAMESPACE,
      labels: dbLabels(input.projectId, input.organizationId),
    },
    spec: {
      cluster: { name: input.sharedClusterName },
      name: sharedDbName(input.projectId),
      owner: tenantRoleName(input.projectId),
    },
  };
}

/** One PgBouncer Pooler (transaction mode) in front of a shared cluster. */
export function buildPoolerManifest(sharedClusterName: string): K8sManifest {
  return {
    apiVersion: CNPG_API,
    kind: 'Pooler',
    metadata: { name: `${sharedClusterName}-pooler`, namespace: DB_NAMESPACE },
    spec: {
      cluster: { name: sharedClusterName },
      instances: 2,
      type: 'rw',
      pgbouncer: { poolMode: 'transaction' },
    },
  };
}

/** Barman object-store block → the already-provisioned GCS backups bucket. */
export function buildBarmanObjectStore(projectId: string, backupBucket: string): Record<string, unknown> {
  return {
    destinationPath: `gs://${backupBucket}/db/${projectId}`,
    googleCredentials: { gkeEnvironment: true },
    wal: { compression: 'gzip' },
    data: { compression: 'gzip' },
  };
}

/** A project's managed Postgres cluster (1 instance, continuous WAL → GCS). */
/*
 * WI service-account annotation so the cluster's pods authenticate to GCS as the
 * backup GSA (`googleCredentials.gkeEnvironment: true` in the barman block). CNPG
 * creates one ServiceAccount per cluster (named after it); this annotates it.
 * NOTE: the GSA must grant `roles/iam.workloadIdentityUser` to each cluster's KSA
 * principal `[project-databases/<clusterName>]` — the operator/provisioner adds
 * that binding at provision time, or use a namespace-wide WI binding.
 */
function serviceAccountTemplate(backupServiceAccount?: string): Record<string, unknown> | undefined {
  if (!backupServiceAccount) {
    return undefined;
  }

  return { metadata: { annotations: { 'iam.gke.io/gcp-service-account': backupServiceAccount } } };
}

export function buildClusterManifest(input: {
  projectId: string;
  organizationId?: string;
  backupBucket: string;
  retentionDays: number;
  storageGi?: number;
  /** Backup GSA email — when set, the cluster pods get the WI annotation. */
  backupServiceAccount?: string;
  /** Isolated tier: start hibernated (scale-to-zero, PVC kept) — wake on first use. */
  hibernated?: boolean;
  instances?: number;
}): K8sManifest {
  const sat = serviceAccountTemplate(input.backupServiceAccount);

  return {
    apiVersion: CNPG_API,
    kind: 'Cluster',
    metadata: {
      name: clusterName(input.projectId),
      namespace: DB_NAMESPACE,
      labels: dbLabels(input.projectId, input.organizationId),
      // CNPG declarative hibernation: 'on' scales pods to 0 but keeps the PVC.
      ...(input.hibernated ? { annotations: { 'cnpg.io/hibernation': 'on' } } : {}),
    },
    spec: {
      instances: Math.max(1, input.instances ?? 1),
      imageName: undefined,
      storage: { size: `${Math.max(1, input.storageGi ?? 1)}Gi` },
      resources: {
        requests: { cpu: '50m', memory: '256Mi' },
        limits: { cpu: '1', memory: '1Gi' },
      },
      ...(sat ? { serviceAccountTemplate: sat } : {}),
      backup: {
        barmanObjectStore: buildBarmanObjectStore(input.projectId, input.backupBucket),
        retentionPolicy: `${Math.max(1, input.retentionDays)}d`,
      },
    },
  };
}

/** Daily base backup; continuous WAL archiving is automatic from the Cluster. */
export function buildScheduledBackupManifest(projectId: string): K8sManifest {
  return {
    apiVersion: CNPG_API,
    kind: 'ScheduledBackup',
    metadata: { name: `${clusterName(projectId)}-daily`, namespace: DB_NAMESPACE, labels: dbLabels(projectId) },
    // CNPG uses a 6-field cron (with seconds): 02:00 every day.
    spec: { schedule: '0 0 2 * * *', backupOwnerReference: 'self', cluster: { name: clusterName(projectId) } },
  };
}

/** On-demand base backup (manual snapshot). */
export function buildOnDemandBackupManifest(projectId: string, snapshotId: string): K8sManifest {
  return {
    apiVersion: CNPG_API,
    kind: 'Backup',
    metadata: {
      name: `${clusterName(projectId)}-${snapshotId}`.toLowerCase().slice(0, 53),
      namespace: DB_NAMESPACE,
      labels: dbLabels(projectId),
    },
    spec: { cluster: { name: clusterName(projectId) } },
  };
}

/**
 * A recovery cluster bootstrapped from the project's backups, replaying WAL to
 * an exact `targetTime` (true PITR). Once healthy, the executor repoints the
 * project's DATABASE_URL at this cluster.
 */
export function buildRestoreClusterManifest(input: {
  projectId: string;
  organizationId?: string;
  restoreId: string;
  targetTimeIso: string;
  backupBucket: string;
  storageGi?: number;
  backupServiceAccount?: string;
}): K8sManifest {
  const sourceName = `${clusterName(input.projectId)}-backup`;
  const sat = serviceAccountTemplate(input.backupServiceAccount);

  return {
    apiVersion: CNPG_API,
    kind: 'Cluster',
    metadata: {
      name: restoreClusterName(input.projectId, input.restoreId),
      namespace: DB_NAMESPACE,
      labels: { ...dbLabels(input.projectId, input.organizationId), 'vibecore.ai/restore-id': input.restoreId },
    },
    spec: {
      instances: 1,
      storage: { size: `${Math.max(1, input.storageGi ?? 1)}Gi` },
      ...(sat ? { serviceAccountTemplate: sat } : {}),
      bootstrap: {
        recovery: {
          source: sourceName,
          recoveryTarget: { targetTime: input.targetTimeIso },
        },
      },
      externalClusters: [
        { name: sourceName, barmanObjectStore: buildBarmanObjectStore(input.projectId, input.backupBucket) },
      ],
    },
  };
}

export interface ProvisionResult {
  clusterName: string;
  applied: boolean;
}

export interface RestoreProgress {
  ready: boolean;
  clusterName: string;
}

/** Provisioner contract used by the api routes + scheduler. */
export interface DatabaseProvisioner {
  readonly active: boolean;
  provisionInstance(input: { projectId: string; organizationId?: string; retentionDays: number }): Promise<ProvisionResult>;
  takeSnapshot(input: { projectId: string; snapshotId: string }): Promise<{ applied: boolean }>;
  startRestore(input: {
    projectId: string;
    organizationId?: string;
    restoreId: string;
    targetTimeIso: string;
    retentionDays: number;
  }): Promise<{ applied: boolean; clusterName: string }>;
  restoreProgress(input: { projectId: string; restoreId: string }): Promise<RestoreProgress>;
  teardown(input: { projectId: string }): Promise<void>;
}

/** Inert provisioner: the default while the feature is off and in tests. */
export class NoopProvisioner implements DatabaseProvisioner {
  readonly active = false;

  async provisionInstance(input: {
    projectId: string;
    organizationId?: string;
    retentionDays: number;
  }): Promise<ProvisionResult> {
    return { clusterName: clusterName(input.projectId), applied: false };
  }

  async takeSnapshot(input: { projectId: string; snapshotId: string }): Promise<{ applied: boolean }> {
    return { applied: false };
  }

  async startRestore(input: {
    projectId: string;
    organizationId?: string;
    restoreId: string;
    targetTimeIso: string;
    retentionDays: number;
  }): Promise<{ applied: boolean; clusterName: string }> {
    return { applied: false, clusterName: restoreClusterName(input.projectId, input.restoreId) };
  }

  async restoreProgress(input: { projectId: string; restoreId: string }): Promise<RestoreProgress> {
    return { ready: false, clusterName: restoreClusterName(input.projectId, input.restoreId) };
  }

  async teardown(): Promise<void> {}
}

/** CloudNativePG provisioner — applies the CRs through the injected k8s port. */
export class CnpgProvisioner implements DatabaseProvisioner {
  readonly active = true;

  constructor(
    private readonly k8s: K8sApplyPort,
    private readonly backupBucket: string,
    private readonly backupServiceAccount?: string,
  ) {}

  async provisionInstance(input: {
    projectId: string;
    organizationId?: string;
    retentionDays: number;
  }): Promise<ProvisionResult> {
    await this.k8s.apply(
      buildClusterManifest({
        projectId: input.projectId,
        organizationId: input.organizationId,
        backupBucket: this.backupBucket,
        retentionDays: input.retentionDays,
        backupServiceAccount: this.backupServiceAccount,
      }),
    );
    await this.k8s.apply(buildScheduledBackupManifest(input.projectId));

    return { clusterName: clusterName(input.projectId), applied: true };
  }

  async takeSnapshot(input: { projectId: string; snapshotId: string }): Promise<{ applied: boolean }> {
    await this.k8s.apply(buildOnDemandBackupManifest(input.projectId, input.snapshotId));

    return { applied: true };
  }

  async startRestore(input: {
    projectId: string;
    organizationId?: string;
    restoreId: string;
    targetTimeIso: string;
    retentionDays: number;
  }): Promise<{ applied: boolean; clusterName: string }> {
    const manifest = buildRestoreClusterManifest({
      projectId: input.projectId,
      organizationId: input.organizationId,
      restoreId: input.restoreId,
      targetTimeIso: input.targetTimeIso,
      backupBucket: this.backupBucket,
      backupServiceAccount: this.backupServiceAccount,
    });
    await this.k8s.apply(manifest);

    return { applied: true, clusterName: manifest.metadata.name };
  }

  async restoreProgress(input: { projectId: string; restoreId: string }): Promise<RestoreProgress> {
    const name = restoreClusterName(input.projectId, input.restoreId);
    const cluster = await this.k8s.get('Cluster', DB_NAMESPACE, name).catch(() => undefined);
    // CNPG sets status.phase to 'Cluster in healthy state' and readyInstances>0.
    const phase = cluster?.status?.phase;
    const readyInstances = Number(cluster?.status?.readyInstances ?? 0);
    const ready = readyInstances > 0 && typeof phase === 'string' && /healthy/i.test(phase);

    return { ready, clusterName: name };
  }

  async teardown(input: { projectId: string }): Promise<void> {
    await this.k8s.delete('Cluster', DB_NAMESPACE, clusterName(input.projectId)).catch(() => {});
    await this.k8s.delete('ScheduledBackup', DB_NAMESPACE, `${clusterName(input.projectId)}-daily`).catch(() => {});
  }
}

/**
 * Real k8s port: the api pod has no cluster RBAC, so CNPG CRs are applied via the
 * workspace-manager control plane (which does). Guarded by the shared manager
 * secret. Only constructed when the feature is on; the manager route restricts
 * kinds/namespace. All calls are bounded by a timeout.
 */
export class ManagerK8sPort implements K8sApplyPort {
  constructor(
    private readonly baseUrl: string,
    private readonly secret?: string,
  ) {}

  private async call(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.secret ? { authorization: `Bearer ${this.secret}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  }

  async apply(manifest: K8sManifest): Promise<void> {
    const res = await this.call('POST', '/databases/apply', { manifest });
    await res.body?.cancel().catch(() => {});

    if (!res.ok) {
      throw new Error(`manager apply failed: ${res.status}`);
    }
  }

  async get(kind: string, namespace: string, name: string) {
    const res = await this.call(
      'GET',
      `/databases/resource?kind=${encodeURIComponent(kind)}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`,
    );

    if (res.status === 404) {
      await res.body?.cancel().catch(() => {});

      return undefined;
    }

    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`manager get failed: ${res.status}`);
    }

    return (await res.json().catch(() => undefined)) as { status?: Record<string, unknown> } | undefined;
  }

  async delete(kind: string, namespace: string, name: string): Promise<void> {
    const res = await this.call(
      'DELETE',
      `/databases/resource?kind=${encodeURIComponent(kind)}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`,
    );
    await res.body?.cancel().catch(() => {});
  }
}

/**
 * Resolve the active provisioner. Returns the inert Noop unless the feature is
 * enabled AND a real k8s port + backup bucket are configured — so Phase-2 code
 * is a no-op (and free) until Avi flips `DB_ROLLBACK_ENABLED` and the operator
 * is installed.
 */
export function resolveDatabaseProvisioner(port?: K8sApplyPort): DatabaseProvisioner {
  if (process.env.DB_ROLLBACK_ENABLED !== 'true') {
    return new NoopProvisioner();
  }

  const bucket = process.env.DB_BACKUP_BUCKET?.trim();

  if (!port || !bucket) {
    return new NoopProvisioner();
  }

  // Optional WI backup GSA — when set, cluster pods archive WAL/backups to GCS as it.
  return new CnpgProvisioner(port, bucket, process.env.DB_BACKUP_GSA?.trim() || undefined);
}

/** Build the default env-wired provisioner (ManagerK8sPort → ws-manager). */
export function resolveDefaultDatabaseProvisioner(): DatabaseProvisioner {
  const managerUrl = process.env.WORKSPACE_MANAGER_URL?.trim();
  const secret = process.env.WORKSPACE_MANAGER_SHARED_SECRET?.trim();
  const port = managerUrl ? new ManagerK8sPort(managerUrl, secret) : undefined;

  return resolveDatabaseProvisioner(port);
}
