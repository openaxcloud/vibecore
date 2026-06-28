import { afterEach, describe, expect, it } from 'vitest';
import {
  CnpgProvisioner,
  DB_NAMESPACE,
  NoopProvisioner,
  buildClusterManifest,
  buildRestoreClusterManifest,
  buildScheduledBackupManifest,
  clusterName,
  resolveDatabaseProvisioner,
  type K8sApplyPort,
  type K8sManifest,
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
}

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
