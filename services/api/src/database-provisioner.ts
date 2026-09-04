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
import { createHmac } from 'node:crypto';

import { Client as PgClient } from 'pg';

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
  /**
   * Read a Secret's decoded string data (or undefined if absent). Used to fetch the
   * CNPG `<cluster>-app` connection secret (key `uri` = a ready DATABASE_URL). The
   * manager restricts this to the project-databases namespace.
   */
  getSecret(namespace: string, name: string): Promise<Record<string, string> | undefined>;
}

export const DB_NAMESPACE = 'project-databases';
const CNPG_API = 'postgresql.cnpg.io/v1';

/** Default shared cluster for the free tier (overridable via DB_SHARED_CLUSTER). */
export const DEFAULT_SHARED_CLUSTER = process.env.DB_SHARED_CLUSTER?.trim() || 'shared-pg-0';

/*
 * P2d dev/prod split: a project has a `development` database (its workspace DB)
 * and, once published, a separate `production` database. Same plan/tier for both
 * (see resolveDatabaseTier). `development` keeps the original, un-suffixed names
 * for 100% backward compatibility; only `production` gets a suffix, so existing
 * dev clusters/dbs/roles are never renamed.
 */
export type DatabaseEnvironment = 'development' | 'production';

/** Cluster-name suffix (k8s resource): `-prod` for production, '' for development. */
function clusterEnvSuffix(environment?: DatabaseEnvironment): string {
  return environment === 'production' ? '-prod' : '';
}

/** Postgres-identifier suffix (role/db): `_prod` for production, '' for development. */
function identEnvSuffix(environment?: DatabaseEnvironment): string {
  return environment === 'production' ? '_prod' : '';
}

export function clusterName(projectId: string, environment?: DatabaseEnvironment): string {
  return `db-${projectId}${clusterEnvSuffix(environment)}`.toLowerCase().slice(0, 53);
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

/** Shared-tier per-project logical db + owner role names (per environment). */
export function sharedDbName(projectId: string, environment?: DatabaseEnvironment): string {
  return `${pgIdent('proj_', projectId)}${identEnvSuffix(environment)}`;
}

export function tenantRoleName(projectId: string, environment?: DatabaseEnvironment): string {
  return `${pgIdent('t_', projectId)}${identEnvSuffix(environment)}`;
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

/** PgBouncer service host fronting a shared cluster (transaction-pooled). */
export function sharedPoolerHost(sharedClusterName: string): string {
  return `${sharedClusterName}-pooler.${DB_NAMESPACE}.svc`;
}

/**
 * Deterministic per-tenant password = HMAC-SHA256(serverSecret, projectId).
 * Stateless: the same value is recomputed by both provision and read paths, so
 * no password ever needs to be persisted. Returns undefined when the server
 * secret is unset — which keeps the shared tier an inert no-op (prod-safe).
 */
export function sharedTenantPassword(projectId: string, environment?: DatabaseEnvironment): string | undefined {
  const secret = process.env.DB_SHARED_TENANT_SECRET?.trim();

  if (!secret) {
    return undefined;
  }

  // development keeps HMAC(projectId) so existing dev tenants are unchanged;
  // production derives a distinct password from a per-env salt.
  const message = environment === 'production' ? `${projectId}:production` : projectId;

  return createHmac('sha256', secret).update(message).digest('hex');
}

/** Tenant `DATABASE_URL` routed through the shared cluster's pooler. */
export function buildSharedTenantUri(input: {
  projectId: string;
  password: string;
  sharedClusterName: string;
  environment?: DatabaseEnvironment;
}): string {
  const role = tenantRoleName(input.projectId, input.environment);
  const db = sharedDbName(input.projectId, input.environment);

  return `postgresql://${role}:${encodeURIComponent(input.password)}@${sharedPoolerHost(input.sharedClusterName)}:5432/${db}`;
}

/**
 * Port that runs the privileged tenant-provisioning SQL on a shared cluster.
 * Split out so the provisioner's branch logic is unit-testable with a fake.
 */
export interface TenantSqlExecutor {
  provisionTenant(input: { adminUri: string; role: string; db: string; password: string }): Promise<void>;
}

/**
 * Real executor: connects as the shared cluster's admin role (which holds
 * CREATEDB + CREATEROLE) via node-postgres and creates the tenant role, its
 * database, and the connect-isolation grants. Idempotent — safe to re-run.
 * Identifiers are alnum-only (derived from the cuid); the password is hex
 * (HMAC digest), so both embed safely as literals.
 */
/** Minimal shape of the pg client this executor drives (injectable for tests). */
export interface TenantSqlClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }>;
  end(): Promise<void>;
}

export class PgTenantSqlExecutor implements TenantSqlExecutor {
  constructor(
    private readonly createClient: (adminUri: string) => TenantSqlClient = (adminUri) =>
      new PgClient({
        connectionString: adminUri,
        ssl: /sslmode=disable/.test(adminUri) ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 10_000,
        statement_timeout: 15_000,
      }) as unknown as TenantSqlClient,
  ) {}

  async provisionTenant(input: { adminUri: string; role: string; db: string; password: string }): Promise<void> {
    const { adminUri, role, db, password } = input;
    const client = this.createClient(adminUri);
    await client.connect();

    try {
      const roleExists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);

      if (roleExists.rowCount === 0) {
        await client.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
      } else {
        // keep the role's password in sync with the deterministic value
        await client.query(`ALTER ROLE "${role}" LOGIN PASSWORD '${password}'`);
      }

      const dbExists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);

      if (dbExists.rowCount === 0) {
        /*
         * Postgres 16+ requires the creating role to be able to SET ROLE to the
         * database's target OWNER — i.e. be a MEMBER of the tenant role — or
         * `CREATE DATABASE ... OWNER "<role>"` fails with 42501 "must be able to
         * SET ROLE". The CNPG `app` admin has CREATEDB/CREATEROLE but is not a
         * member of the freshly-created tenant role, so grant membership first.
         * Without this the shared-tier database is never created: getConnectionUri
         * returns undefined, no DATABASE_URL is written, and the IDE Database panel
         * stays stuck on "No database yet" for every free-tier project.
         * Idempotent (GRANT of an already-held membership is a no-op).
         */
        await client.query(`GRANT "${role}" TO CURRENT_USER`);
        // CREATE DATABASE cannot run inside a transaction; node-postgres simple
        // queries are autocommit, so this is fine.
        await client.query(`CREATE DATABASE "${db}" OWNER "${role}"`);
      }

      // Tenant isolation: only the owner may connect to its own database.
      await client.query(`REVOKE CONNECT ON DATABASE "${db}" FROM PUBLIC`);
      await client.query(`GRANT CONNECT ON DATABASE "${db}" TO "${role}"`);
    } finally {
      await client.end().catch(() => {});
    }
  }
}

/** Shared-tier: a CNPG Database CRD binding a logical db to a shared cluster. */
export function buildDatabaseCrManifest(input: {
  projectId: string;
  organizationId?: string;
  sharedClusterName: string;
  environment?: DatabaseEnvironment;
}): K8sManifest {
  return {
    apiVersion: CNPG_API,
    kind: 'Database',
    metadata: {
      name: clusterName(input.projectId, input.environment),
      namespace: DB_NAMESPACE,
      labels: dbLabels(input.projectId, input.organizationId),
    },
    spec: {
      cluster: { name: input.sharedClusterName },
      name: sharedDbName(input.projectId, input.environment),
      owner: tenantRoleName(input.projectId, input.environment),
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
  /** P2d dev/prod split. Defaults to 'development' (un-suffixed cluster name). */
  environment?: DatabaseEnvironment;
}): K8sManifest {
  const sat = serviceAccountTemplate(input.backupServiceAccount);

  return {
    apiVersion: CNPG_API,
    kind: 'Cluster',
    metadata: {
      name: clusterName(input.projectId, input.environment),
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
export function buildScheduledBackupManifest(projectId: string, environment?: DatabaseEnvironment): K8sManifest {
  const cluster = clusterName(projectId, environment);

  return {
    apiVersion: CNPG_API,
    kind: 'ScheduledBackup',
    metadata: { name: `${cluster}-daily`, namespace: DB_NAMESPACE, labels: dbLabels(projectId) },
    // CNPG uses a 6-field cron (with seconds): 02:00 every day.
    spec: { schedule: '0 0 2 * * *', backupOwnerReference: 'self', cluster: { name: cluster } },
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

  /*
   * Pourquoi rien n'a été appliqué, quand `applied` est faux. Nommer la cause
   * est le tout l'intérêt : sans elle, l'appelant ne peut pas distinguer « c'est
   * en cours » de « ça ne partira jamais » — c'est précisément ce qui produisait
   * un statut PROVISIONING éternel (voir `provisionInstance`).
   */
  reason?: 'SHARED_TENANT_UNAVAILABLE';
}

export interface RestoreProgress {
  ready: boolean;
  clusterName: string;
}

export interface ProvisionInput {
  projectId: string;
  organizationId?: string;
  retentionDays: number;
  /** Plan-derived tier (resolveDatabaseTier). Defaults to 'isolated'. */
  tier?: DatabaseTier;
  /** Shared tier: the shared cluster to place this project's logical DB on. */
  sharedClusterName?: string;
  /** P2d dev/prod split. Defaults to 'development' (un-suffixed, backward compatible). */
  environment?: DatabaseEnvironment;
}

/** Provisioner contract used by the api routes + scheduler. */
export interface DatabaseProvisioner {
  readonly active: boolean;
  provisionInstance(input: ProvisionInput): Promise<ProvisionResult>;
  /**
   * Resolve the project's `DATABASE_URL` once the backend is ready, or undefined if
   * not ready yet (caller re-polls). Isolated: the CNPG `<cluster>-app` secret `uri`.
   */
  getConnectionUri(input: {
    projectId: string;
    tier?: DatabaseTier;
    sharedClusterName?: string;
    environment?: DatabaseEnvironment;
  }): Promise<string | undefined>;
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

  async provisionInstance(input: ProvisionInput): Promise<ProvisionResult> {
    return { clusterName: clusterName(input.projectId), applied: false };
  }

  async getConnectionUri(): Promise<string | undefined> {
    return undefined;
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
    private readonly sqlExec: TenantSqlExecutor = new PgTenantSqlExecutor(),
  ) {}

  /**
   * Provision (idempotently) the shared-tier tenant role + database + isolation
   * on the shared cluster, and return its pooled `DATABASE_URL` — or undefined
   * when the prerequisites are missing (no tenant secret configured, or the
   * shared cluster's admin secret is unreadable). Undefined keeps the shared
   * tier inert, so nothing breaks before `shared-pg-0` + `DB_SHARED_TENANT_SECRET`
   * are in place. The admin credentials come from the CNPG `<cluster>-app`
   * secret; that role is granted CREATEDB + CREATEROLE at cluster bootstrap.
   */
  async #ensureSharedTenant(
    projectId: string,
    sharedCluster: string,
    environment?: DatabaseEnvironment,
  ): Promise<string | undefined> {
    const password = sharedTenantPassword(projectId, environment);

    if (!password) {
      return undefined;
    }

    const admin = await this.k8s.getSecret(DB_NAMESPACE, `${sharedCluster}-app`).catch(() => undefined);
    const adminUser = admin?.username?.trim();
    const adminPassword = admin?.password;

    if (!adminUser || !adminPassword) {
      return undefined;
    }

    const adminDb = admin?.dbname?.trim() || 'app';
    const adminUri = `postgresql://${adminUser}:${encodeURIComponent(adminPassword)}@${sharedCluster}-rw.${DB_NAMESPACE}.svc:5432/${adminDb}`;

    await this.sqlExec.provisionTenant({
      adminUri,
      role: tenantRoleName(projectId, environment),
      db: sharedDbName(projectId, environment),
      password,
    });

    return buildSharedTenantUri({ projectId, password, sharedClusterName: sharedCluster, environment });
  }

  async provisionInstance(input: ProvisionInput): Promise<ProvisionResult> {
    if (input.tier === 'shared') {
      /*
       * Shared tier: place a logical DB on a shared cluster via the Database CRD +
       * ensure a Pooler. The owner role + isolation SQL (buildTenantProvisionSql) +
       * DATABASE_URL are applied by the admin-SQL slice (next); until then the DB CRD
       * is created but getConnectionUri('shared') returns undefined.
       */
      const sharedCluster = input.sharedClusterName ?? DEFAULT_SHARED_CLUSTER;

      /*
       * BUG-QA-DB-PROVISIONING-STUCK — le rôle propriétaire doit exister AVANT la
       * Database CR, et son échec ne peut plus être ignoré.
       *
       * Le code posait la CR même quand `#ensureSharedTenant` n'avait rien fait
       * (« best-effort », échec avalé). CNPG refusait alors de créer la base et
       * la CR restait indéfiniment en échec — reproduit en réel :
       *
       *   Database db-<projet>  APPLIED=false
       *   ERROR: role "t_<projet>" does not exist (SQLSTATE 42704)
       *
       * Côté produit, cela se voyait comme un statut « PROVISIONING » qui ne
       * finissait jamais : personne ne réconciliait la ligne, et la ressource
       * empoisonnée restait dans le cluster.
       *
       * Le déclencheur le plus simple est l'absence de `DB_SHARED_TENANT_SECRET`
       * — mais TOUTE défaillance passait par le même trou : cluster partagé
       * injoignable, secret `<cluster>-app` absent, erreur SQL, RBAC refusé. On
       * n'applique donc plus rien tant que le locataire n'est pas réellement en
       * place, et on NOMME la raison au lieu de la taire.
       */
      const tenantUri = await this.#ensureSharedTenant(input.projectId, sharedCluster, input.environment).catch(
        () => undefined,
      );

      if (!tenantUri) {
        return { clusterName: sharedCluster, applied: false, reason: 'SHARED_TENANT_UNAVAILABLE' };
      }

      await this.k8s.apply(buildPoolerManifest(sharedCluster));
      await this.k8s.apply(
        buildDatabaseCrManifest({
          projectId: input.projectId,
          organizationId: input.organizationId,
          sharedClusterName: sharedCluster,
          environment: input.environment,
        }),
      );

      return { clusterName: sharedCluster, applied: true };
    }

    // Isolated tier (paid / default): a dedicated cluster per project + environment.
    await this.k8s.apply(
      buildClusterManifest({
        projectId: input.projectId,
        organizationId: input.organizationId,
        backupBucket: this.backupBucket,
        retentionDays: input.retentionDays,
        backupServiceAccount: this.backupServiceAccount,
        environment: input.environment,
      }),
    );
    await this.k8s.apply(buildScheduledBackupManifest(input.projectId, input.environment));

    return { clusterName: clusterName(input.projectId, input.environment), applied: true };
  }

  async getConnectionUri(input: {
    projectId: string;
    tier?: DatabaseTier;
    sharedClusterName?: string;
    environment?: DatabaseEnvironment;
  }): Promise<string | undefined> {
    if (input.tier === 'shared') {
      // Idempotently ensure the tenant exists and return its pooled URL. Self-
      // heals a project provisioned before the shared cluster/secret existed.
      return this.#ensureSharedTenant(
        input.projectId,
        input.sharedClusterName ?? DEFAULT_SHARED_CLUSTER,
        input.environment,
      ).catch(() => undefined);
    }

    const secret = await this.k8s
      .getSecret(DB_NAMESPACE, `${clusterName(input.projectId, input.environment)}-app`)
      .catch(() => undefined);
    const uri = secret?.uri?.trim();

    return uri && uri.length > 0 ? uri : undefined;
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
    // Tear down BOTH environments' isolated clusters (dev + prod) so deleting a
    // project leaves no orphaned production database behind.
    for (const environment of ['development', 'production'] as const) {
      const cluster = clusterName(input.projectId, environment);
      await this.k8s.delete('Cluster', DB_NAMESPACE, cluster).catch(() => {});
      await this.k8s.delete('ScheduledBackup', DB_NAMESPACE, `${cluster}-daily`).catch(() => {});
    }
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

  async getSecret(namespace: string, name: string): Promise<Record<string, string> | undefined> {
    const res = await this.call(
      'GET',
      `/databases/secret?namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`,
    );

    if (res.status === 404) {
      await res.body?.cancel().catch(() => {});

      return undefined;
    }

    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`manager getSecret failed: ${res.status}`);
    }

    const body = (await res.json().catch(() => undefined)) as { data?: Record<string, string> } | undefined;

    return body?.data;
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
