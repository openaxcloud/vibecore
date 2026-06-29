import { afterEach, describe, expect, it } from 'vitest';
import {
  CnpgProvisioner,
  DB_NAMESPACE,
  NoopProvisioner,
  buildClusterManifest,
  buildDatabaseCrManifest,
  buildPoolerManifest,
  buildRestoreClusterManifest,
  buildScheduledBackupManifest,
  buildSharedTenantUri,
  buildTenantProvisionSql,
  clusterName,
  resolveDatabaseProvisioner,
  resolveDatabaseTier,
  sharedDbName,
  sharedPoolerHost,
  sharedTenantPassword,
  tenantRoleName,
  type K8sApplyPort,
  type K8sManifest,
  type TenantSqlExecutor,
} from '../database-provisioner.js';

const ORIGINAL_FLAG = process.env.DB_ROLLBACK_ENABLED;
const ORIGINAL_BUCKET = process.env.DB_BACKUP_BUCKET;

afterEach(() => {
  for (const [key, val] of [
    ['DB_ROLLBACK_ENABLED', ORIGINAL_FLAG],
    ['DB_BACKUP_BUCKET', ORIGINAL_BUCKET],
  ] as const) {
    if (val === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      process.env[key] = val;
    }
  }
});

class FakeK8s implements K8sApplyPort {
  applied: K8sManifest[] = [];
  deleted: string[] = [];
  clusters = new Map<string, { status?: Record<string, unknown> }>();

  async apply(manifest: K8sManifest) {
    this.applied.push(manifest);
  }

  async get(kind: string, _ns: string, name: string) {
    return this.clusters.get(`${kind}/${name}`);
  }

  async delete(kind: string, _ns: string, name: string) {
    this.deleted.push(`${kind}/${name}`);
  }

  secrets = new Map<string, Record<string, string>>();

  async getSecret(_ns: string, name: string) {
    return this.secrets.get(name);
  }
}

describe('tiered routing (v3)', () => {
  it('routes free→shared and paid→isolated', () => {
    expect(resolveDatabaseTier('free')).toBe('shared');
    expect(resolveDatabaseTier(undefined)).toBe('shared');
    expect(resolveDatabaseTier('team')).toBe('isolated');
    expect(resolveDatabaseTier('enterprise')).toBe('isolated');
  });

  it('shared tier: Database CRD + isolation SQL with cuid-safe identifiers', () => {
    const m = buildDatabaseCrManifest({ projectId: 'cmABC123', sharedClusterName: 'shared-pg-0' });
    expect(m.kind).toBe('Database');
    expect((m.spec as any).cluster.name).toBe('shared-pg-0');
    expect((m.spec as any).name).toBe('proj_cmabc123');
    expect((m.spec as any).owner).toBe('t_cmabc123');

    const sql = buildTenantProvisionSql('cmABC123');
    expect(sql.role).toBe('t_cmabc123');
    expect(sql.db).toBe('proj_cmabc123');
    // tenant isolation: PUBLIC connect revoked, owner-only granted
    expect(sql.statements.some((s) => /REVOKE CONNECT ON DATABASE "proj_cmabc123" FROM PUBLIC/.test(s))).toBe(true);
    expect(sql.statements.some((s) => /GRANT CONNECT ON DATABASE "proj_cmabc123" TO "t_cmabc123"/.test(s))).toBe(true);
    // password is parameter-bound, never interpolated
    expect(sql.statements.join('\n')).toContain('PASSWORD $1');
  });

  it('shared tier: one transaction-mode Pooler per shared cluster', () => {
    const p = buildPoolerManifest('shared-pg-0');
    expect(p.kind).toBe('Pooler');
    expect((p.spec as any).pgbouncer.poolMode).toBe('transaction');
    expect((p.spec as any).cluster.name).toBe('shared-pg-0');
  });

  it('isolated tier: hibernation annotation + instances honoured', () => {
    const hib = buildClusterManifest({
      projectId: 'p1',
      backupBucket: 'bkt',
      retentionDays: 28,
      hibernated: true,
      instances: 2,
    });
    expect(hib.metadata.annotations?.['cnpg.io/hibernation']).toBe('on');
    expect((hib.spec as any).instances).toBe(2);

    const active = buildClusterManifest({ projectId: 'p1', backupBucket: 'bkt', retentionDays: 28 });
    expect(active.metadata.annotations).toBeUndefined();
    expect((active.spec as any).instances).toBe(1);
  });
});

describe('provisioner dispatch + DATABASE_URL resolution', () => {
  it('isolated tier: applies a dedicated Cluster and reads the -app uri once present', async () => {
    const k8s = new FakeK8s();
    const p = new CnpgProvisioner(k8s, 'bkt');

    const res = await p.provisionInstance({ projectId: 'p1', retentionDays: 28, tier: 'isolated' });
    expect(res.clusterName).toBe(clusterName('p1'));
    expect(k8s.applied.some((m) => m.kind === 'Cluster')).toBe(true);

    expect(await p.getConnectionUri({ projectId: 'p1', tier: 'isolated' })).toBeUndefined();

    k8s.secrets.set(`${clusterName('p1')}-app`, { uri: 'postgres://u:pw@db-p1-rw:5432/app' });
    expect(await p.getConnectionUri({ projectId: 'p1', tier: 'isolated' })).toBe('postgres://u:pw@db-p1-rw:5432/app');
  });

  it('shared tier: applies a Pooler + Database CRD (no dedicated Cluster)', async () => {
    const k8s = new FakeK8s();
    const p = new CnpgProvisioner(k8s, 'bkt');

    await p.provisionInstance({ projectId: 'p1', retentionDays: 7, tier: 'shared', sharedClusterName: 'shared-pg-0' });
    expect(k8s.applied.some((m) => m.kind === 'Pooler')).toBe(true);
    expect(k8s.applied.some((m) => m.kind === 'Database')).toBe(true);
    expect(k8s.applied.some((m) => m.kind === 'Cluster')).toBe(false);
  });
});

class FakeTenantSqlExecutor implements TenantSqlExecutor {
  calls: Array<{ adminUri: string; role: string; db: string; password: string }> = [];

  async provisionTenant(input: { adminUri: string; role: string; db: string; password: string }) {
    this.calls.push(input);
  }
}

describe('shared-tier tenant provisioning (admin-SQL slice)', () => {
  const ORIGINAL_SECRET = process.env.DB_SHARED_TENANT_SECRET;

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete (process.env as Record<string, string | undefined>).DB_SHARED_TENANT_SECRET;
    } else {
      process.env.DB_SHARED_TENANT_SECRET = ORIGINAL_SECRET;
    }
  });

  function sharedSetup() {
    process.env.DB_SHARED_TENANT_SECRET = 'unit-test-tenant-secret';
    const k8s = new FakeK8s();
    k8s.secrets.set('shared-pg-0-app', { username: 'app', password: 'adminpw', dbname: 'app' });
    const sql = new FakeTenantSqlExecutor();
    const prov = new CnpgProvisioner(k8s, 'bkt', undefined, sql);

    return { k8s, sql, prov };
  }

  it('deterministic password = HMAC(secret, projectId), stable + embedded in the URI', () => {
    process.env.DB_SHARED_TENANT_SECRET = 'unit-test-tenant-secret';
    const pw = sharedTenantPassword('proj-cuid-1');
    expect(pw).toBe(sharedTenantPassword('proj-cuid-1'));
    expect(pw).toMatch(/^[0-9a-f]{64}$/);
    expect(sharedTenantPassword('proj-cuid-2')).not.toBe(pw);

    const uri = buildSharedTenantUri({ projectId: 'proj-cuid-1', password: pw!, sharedClusterName: 'shared-pg-0' });
    expect(uri).toBe(
      `postgresql://${tenantRoleName('proj-cuid-1')}:${pw}@${sharedPoolerHost('shared-pg-0')}:5432/${sharedDbName('proj-cuid-1')}`,
    );
  });

  it('provisionInstance(shared) creates the tenant via the SQL executor with cuid-safe ids', async () => {
    const { sql, prov } = sharedSetup();

    await prov.provisionInstance({ projectId: 'abc123', retentionDays: 7, tier: 'shared', sharedClusterName: 'shared-pg-0' });

    expect(sql.calls).toHaveLength(1);
    expect(sql.calls[0]).toMatchObject({ role: tenantRoleName('abc123'), db: sharedDbName('abc123') });
    expect(sql.calls[0].password).toBe(sharedTenantPassword('abc123'));
    expect(sql.calls[0].adminUri).toContain('app:adminpw@shared-pg-0-rw.project-databases.svc:5432/app');
  });

  it('getConnectionUri(shared) returns the pooled tenant DATABASE_URL', async () => {
    const { prov } = sharedSetup();

    const uri = await prov.getConnectionUri({ projectId: 'abc123', tier: 'shared', sharedClusterName: 'shared-pg-0' });
    expect(uri).toBe(
      buildSharedTenantUri({
        projectId: 'abc123',
        password: sharedTenantPassword('abc123')!,
        sharedClusterName: 'shared-pg-0',
      }),
    );
  });

  it('degrades to inert (no SQL, undefined URI) when the tenant secret is unset', async () => {
    delete (process.env as Record<string, string | undefined>).DB_SHARED_TENANT_SECRET;
    const k8s = new FakeK8s();
    k8s.secrets.set('shared-pg-0-app', { username: 'app', password: 'adminpw' });
    const sql = new FakeTenantSqlExecutor();
    const prov = new CnpgProvisioner(k8s, 'bkt', undefined, sql);

    const uri = await prov.getConnectionUri({ projectId: 'abc123', tier: 'shared', sharedClusterName: 'shared-pg-0' });
    expect(uri).toBeUndefined();
    expect(sql.calls).toHaveLength(0);
  });

  it('degrades to undefined when the shared cluster admin secret is missing', async () => {
    process.env.DB_SHARED_TENANT_SECRET = 'unit-test-tenant-secret';
    const k8s = new FakeK8s(); // no shared-pg-0-app secret
    const sql = new FakeTenantSqlExecutor();
    const prov = new CnpgProvisioner(k8s, 'bkt', undefined, sql);

    const uri = await prov.getConnectionUri({ projectId: 'abc123', tier: 'shared', sharedClusterName: 'shared-pg-0' });
    expect(uri).toBeUndefined();
    expect(sql.calls).toHaveLength(0);
  });
});

describe('CNPG manifest builders', () => {
  it('builds a Cluster with WAL→GCS backup + retention', () => {
    const m = buildClusterManifest({ projectId: 'p1', backupBucket: 'bkt', retentionDays: 28 });
    expect(m.apiVersion).toBe('postgresql.cnpg.io/v1');
    expect(m.kind).toBe('Cluster');
    expect(m.metadata.namespace).toBe(DB_NAMESPACE);
    const backup = m.spec?.backup as any;
    expect(backup.barmanObjectStore.destinationPath).toBe('gs://bkt/db/p1');
    expect(backup.retentionPolicy).toBe('28d');
  });

  it('omits serviceAccountTemplate without a backup GSA, adds the WI annotation with one', () => {
    const plain = buildClusterManifest({ projectId: 'p1', backupBucket: 'bkt', retentionDays: 7 });
    expect((plain.spec as any).serviceAccountTemplate).toBeUndefined();

    const wi = buildClusterManifest({
      projectId: 'p1',
      backupBucket: 'bkt',
      retentionDays: 7,
      backupServiceAccount: 'cnpg-backups@proj.iam.gserviceaccount.com',
    });
    expect((wi.spec as any).serviceAccountTemplate.metadata.annotations['iam.gke.io/gcp-service-account']).toBe(
      'cnpg-backups@proj.iam.gserviceaccount.com',
    );
  });

  it('builds a restore Cluster targeting an exact timestamp (PITR)', () => {
    const m = buildRestoreClusterManifest({
      projectId: 'p1',
      restoreId: 'r1',
      targetTimeIso: '2026-06-01T00:00:00.000Z',
      backupBucket: 'bkt',
    });
    const recovery = (m.spec?.bootstrap as any).recovery;
    expect(recovery.recoveryTarget.targetTime).toBe('2026-06-01T00:00:00.000Z');
    expect((m.spec?.externalClusters as any)[0].barmanObjectStore.destinationPath).toBe('gs://bkt/db/p1');
  });

  it('builds a daily scheduled backup referencing the cluster', () => {
    const m = buildScheduledBackupManifest('p1');
    expect(m.kind).toBe('ScheduledBackup');
    expect((m.spec as any).cluster.name).toBe(clusterName('p1'));
  });
});

describe('CnpgProvisioner', () => {
  it('applies Cluster + ScheduledBackup on provision', async () => {
    const k8s = new FakeK8s();
    const prov = new CnpgProvisioner(k8s, 'bkt');
    const result = await prov.provisionInstance({ projectId: 'p1', retentionDays: 28 });
    expect(result.applied).toBe(true);
    expect(k8s.applied.map((m) => m.kind)).toEqual(['Cluster', 'ScheduledBackup']);
  });

  it('reports restore readiness from CNPG cluster status', async () => {
    const k8s = new FakeK8s();
    const prov = new CnpgProvisioner(k8s, 'bkt');
    const { clusterName: name } = await prov.startRestore({
      projectId: 'p1',
      restoreId: 'r1',
      targetTimeIso: '2026-06-01T00:00:00.000Z',
      retentionDays: 28,
    });

    expect((await prov.restoreProgress({ projectId: 'p1', restoreId: 'r1' })).ready).toBe(false);
    k8s.clusters.set(`Cluster/${name}`, { status: { phase: 'Cluster in healthy state', readyInstances: 1 } });
    expect((await prov.restoreProgress({ projectId: 'p1', restoreId: 'r1' })).ready).toBe(true);
  });

  it('deletes the cluster + scheduled backup on teardown', async () => {
    const k8s = new FakeK8s();
    const prov = new CnpgProvisioner(k8s, 'bkt');
    await prov.teardown({ projectId: 'p1' });
    expect(k8s.deleted).toContain(`Cluster/${clusterName('p1')}`);
  });
});

describe('resolveDatabaseProvisioner (dormancy)', () => {
  it('is Noop when the flag is off', () => {
    delete (process.env as Record<string, string | undefined>).DB_ROLLBACK_ENABLED;
    expect(resolveDatabaseProvisioner(new FakeK8s())).toBeInstanceOf(NoopProvisioner);
  });

  it('is Noop when enabled but no bucket/port is configured', () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';
    delete (process.env as Record<string, string | undefined>).DB_BACKUP_BUCKET;
    expect(resolveDatabaseProvisioner(new FakeK8s())).toBeInstanceOf(NoopProvisioner);
    expect(resolveDatabaseProvisioner(undefined)).toBeInstanceOf(NoopProvisioner);
  });

  it('is CNPG only when fully enabled + configured', () => {
    process.env.DB_ROLLBACK_ENABLED = 'true';
    process.env.DB_BACKUP_BUCKET = 'bkt';
    expect(resolveDatabaseProvisioner(new FakeK8s())).toBeInstanceOf(CnpgProvisioner);
  });

  it('Noop provisioner never reports applied/ready', async () => {
    const noop = new NoopProvisioner();
    expect((await noop.provisionInstance({ projectId: 'p1', retentionDays: 28 })).applied).toBe(false);
    expect((await noop.takeSnapshot({ projectId: 'p1', snapshotId: 's1' })).applied).toBe(false);
  });
});

describe('P2d dev/prod split (environment-scoped naming)', () => {
  it('development keeps the original un-suffixed names (backward compatible)', () => {
    expect(clusterName('abc123')).toBe('db-abc123');
    expect(clusterName('abc123', 'development')).toBe('db-abc123');
    expect(sharedDbName('abc123', 'development')).toBe(sharedDbName('abc123'));
    expect(tenantRoleName('abc123', 'development')).toBe(tenantRoleName('abc123'));
  });

  it('production suffixes the cluster (-prod), db (_prod) and role (_prod)', () => {
    expect(clusterName('abc123', 'production')).toBe('db-abc123-prod');
    expect(sharedDbName('abc123', 'production')).toBe(`${sharedDbName('abc123')}_prod`);
    expect(tenantRoleName('abc123', 'production')).toBe(`${tenantRoleName('abc123')}_prod`);
  });

  it('derives a distinct production tenant password', () => {
    process.env.DB_SHARED_TENANT_SECRET = 'unit-test-tenant-secret';
    const dev = sharedTenantPassword('abc123', 'development');
    const prod = sharedTenantPassword('abc123', 'production');
    expect(dev).toBe(sharedTenantPassword('abc123'));
    expect(prod).toMatch(/^[0-9a-f]{64}$/);
    expect(prod).not.toBe(dev);
    delete (process.env as Record<string, string | undefined>).DB_SHARED_TENANT_SECRET;
  });

  it('provisionInstance(production, shared) provisions the prod-suffixed tenant', async () => {
    process.env.DB_SHARED_TENANT_SECRET = 'unit-test-tenant-secret';
    const k8s = new FakeK8s();
    k8s.secrets.set('shared-pg-0-app', { username: 'app', password: 'adminpw', dbname: 'app' });
    const sql = new FakeTenantSqlExecutor();
    const prov = new CnpgProvisioner(k8s, 'bkt', undefined, sql);

    await prov.provisionInstance({
      projectId: 'abc123',
      retentionDays: 7,
      tier: 'shared',
      sharedClusterName: 'shared-pg-0',
      environment: 'production',
    });

    expect(sql.calls[0]).toMatchObject({
      role: tenantRoleName('abc123', 'production'),
      db: sharedDbName('abc123', 'production'),
    });
    const dbCr = k8s.applied.find((m) => m.kind === 'Database');
    expect((dbCr?.spec as { name?: string })?.name).toBe(sharedDbName('abc123', 'production'));
    delete (process.env as Record<string, string | undefined>).DB_SHARED_TENANT_SECRET;
  });

  it('isolated production cluster gets the -prod name', () => {
    const m = buildClusterManifest({ projectId: 'abc123', backupBucket: 'bkt', retentionDays: 28, environment: 'production' });
    expect(m.metadata.name).toBe('db-abc123-prod');
  });
});

describe('P2d isolated tier (paid) — dedicated per-project dev + prod clusters', () => {
  it('provisionInstance(isolated, production) applies a dedicated -prod Cluster + ScheduledBackup', async () => {
    const k8s = new FakeK8s();
    const prov = new CnpgProvisioner(k8s, 'bkt');

    await prov.provisionInstance({ projectId: 'abc123', retentionDays: 28, tier: 'isolated', environment: 'production' });

    const cluster = k8s.applied.find((m) => m.kind === 'Cluster');
    const backup = k8s.applied.find((m) => m.kind === 'ScheduledBackup');
    expect(cluster?.metadata.name).toBe('db-abc123-prod');
    expect(backup?.metadata.name).toBe('db-abc123-prod-daily');
    // never a shared Database CRD / Pooler for a paid project
    expect(k8s.applied.some((m) => m.kind === 'Database' || m.kind === 'Pooler')).toBe(false);
  });

  it('dev and prod isolated clusters are distinct dedicated clusters', async () => {
    const k8s = new FakeK8s();
    const prov = new CnpgProvisioner(k8s, 'bkt');

    await prov.provisionInstance({ projectId: 'abc123', retentionDays: 28, tier: 'isolated', environment: 'development' });
    await prov.provisionInstance({ projectId: 'abc123', retentionDays: 28, tier: 'isolated', environment: 'production' });

    const clusters = k8s.applied.filter((m) => m.kind === 'Cluster').map((m) => m.metadata.name);
    expect(clusters).toEqual(['db-abc123', 'db-abc123-prod']);
  });

  it('getConnectionUri(isolated, production) reads the -prod cluster app secret', async () => {
    const k8s = new FakeK8s();
    k8s.secrets.set('db-abc123-prod-app', { uri: 'postgresql://app:pw@db-abc123-prod-rw:5432/app' });
    const prov = new CnpgProvisioner(k8s, 'bkt');

    expect(await prov.getConnectionUri({ projectId: 'abc123', tier: 'isolated', environment: 'production' })).toBe(
      'postgresql://app:pw@db-abc123-prod-rw:5432/app',
    );
    // development reads the un-suffixed secret (and is undefined here)
    expect(await prov.getConnectionUri({ projectId: 'abc123', tier: 'isolated', environment: 'development' })).toBeUndefined();
  });

  it('teardown removes BOTH dev and prod isolated clusters', async () => {
    const k8s = new FakeK8s();
    const prov = new CnpgProvisioner(k8s, 'bkt');

    await prov.teardown({ projectId: 'abc123' });

    expect(k8s.deleted).toContain('Cluster/db-abc123');
    expect(k8s.deleted).toContain('Cluster/db-abc123-prod');
  });
});
