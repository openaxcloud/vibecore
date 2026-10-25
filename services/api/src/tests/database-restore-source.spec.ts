import { describe, expect, it } from 'vitest';
import { inspectCnpgRestoreSource } from '../database-restore-source.js';
import { buildClusterManifest, buildOnDemandBackupManifest } from '../database-provisioner.js';

// Controlled Kubernetes metadata only. No CNPG, cloud or physical archive proof.
function fixture() {
  const input = {
    projectId: 'synthetic-project',
    organizationId: 'synthetic-org',
    snapshotId: 'snapshot',
    environment: 'production' as const,
  };
  const cluster: any = buildClusterManifest({ ...input, backupBucket: 'synthetic-bucket', retentionDays: 7 });
  cluster.metadata.uid = 'cluster-uid';
  const backup: any = buildOnDemandBackupManifest(input.projectId, input.snapshotId, input.environment);
  backup.metadata.uid = 'backup-uid';
  backup.status = {
    phase: 'completed',
    backupId: 'base-backup',
    startedAt: '2026-10-25T10:00:00Z',
    stoppedAt: '2026-10-25T10:01:00Z',
  };
  const reads: string[] = [];
  const reader = {
    get: async (kind: string, namespace: string, name: string) => {
      reads.push(`${kind}/${namespace}/${name}`);
      return kind === 'Cluster' ? cluster : backup;
    },
  };
  return { input, cluster, backup, reader, reads };
}
describe('CNPG restore source preflight — controlled metadata', () => {
  it('reads only the exact production source and backup and never claims archive or WAL integrity', async () => {
    const f = fixture();
    expect(await inspectCnpgRestoreSource(f.reader, f.input)).toMatchObject({
      sourceUid: 'cluster-uid',
      backupUid: 'backup-uid',
      archiveVerified: false,
      walContinuityVerified: false,
    });
    expect(f.reads).toEqual([
      'Cluster/project-databases/db-synthetic-project-prod',
      'Backup/project-databases/db-synthetic-project-prod-snapshot',
    ]);
  });
  it.each([
    'project',
    'organization',
    'environment',
    'uid',
    'deleting',
    'cluster',
    'phase',
    'backupId',
    'time',
  ] as const)('rejects invalid %s before any target operation', async (kind) => {
    const f = fixture();
    if (kind === 'project') f.backup.metadata.labels['vibecore.ai/project-id'] = 'other';
    if (kind === 'organization') f.cluster.metadata.labels['vibecore.ai/org-id'] = 'other';
    if (kind === 'environment') f.cluster.metadata.name = 'db-synthetic-project';
    if (kind === 'uid') delete f.backup.metadata.uid;
    if (kind === 'deleting') f.backup.metadata.deletionTimestamp = '2026-10-25T11:00:00Z';
    if (kind === 'cluster') f.backup.spec.cluster.name = 'other';
    if (kind === 'phase') f.backup.status.phase = 'running';
    if (kind === 'backupId') delete f.backup.status.backupId;
    if (kind === 'time') f.backup.status.stoppedAt = '2026-10-24T10:00:00Z';
    await expect(inspectCnpgRestoreSource(f.reader, f.input)).rejects.toThrow();
  });
  it('redacts transport errors and refuses absent sources', async () => {
    const f = fixture();
    await expect(
      inspectCnpgRestoreSource(
        {
          get: async () => {
            throw new Error('private transport detail');
          },
        },
        f.input,
      ),
    ).rejects.toThrow('RESTORE_SOURCE_READ_FAILED');
    await expect(inspectCnpgRestoreSource({ get: async () => undefined }, f.input)).rejects.toThrow(
      'RESTORE_SOURCE_IDENTITY_MISMATCH',
    );
  });
  it('rejects a colliding truncated backup name even after its completed resource is relabelled', async () => {
    const f = fixture();
    f.input.projectId = 'a'.repeat(25);
    f.input.snapshotId = 'b'.repeat(24) + '1';
    const cluster: any = buildClusterManifest({ ...f.input, backupBucket: 'synthetic', retentionDays: 7 });
    cluster.metadata.uid = 'cluster';
    const backup: any = buildOnDemandBackupManifest(f.input.projectId, f.input.snapshotId, f.input.environment);
    backup.metadata.uid = 'backup';
    backup.status = f.backup.status;
    backup.metadata.labels['vibecore.ai/snapshot-id'] = 'b'.repeat(24) + '2';
    const reader = { get: async (kind: string) => (kind === 'Cluster' ? cluster : backup) };
    await expect(inspectCnpgRestoreSource(reader, { ...f.input, snapshotId: 'b'.repeat(24) + '2' })).rejects.toThrow(
      'RESTORE_SOURCE_NAME_AMBIGUOUS',
    );
  });
  it('rejects ambiguous environment names before reading resources', async () => {
    const f = fixture();
    await expect(inspectCnpgRestoreSource(f.reader, { ...f.input, projectId: 'a'.repeat(60) })).rejects.toThrow(
      'RESTORE_SOURCE_NAME_AMBIGUOUS',
    );
    expect(f.reads).toEqual([]);
  });
  it('refuses legacy backups without full snapshot identity rather than guessing from their name', async () => {
    const f = fixture();
    delete f.backup.metadata.labels['vibecore.ai/snapshot-id'];
    await expect(inspectCnpgRestoreSource(f.reader, f.input)).rejects.toThrow('RESTORE_SOURCE_IDENTITY_MISMATCH');
  });
  it('rejects a stale Cluster owner UID and reports absent generation linkage honestly', async () => {
    const f = fixture();
    expect((await inspectCnpgRestoreSource(f.reader, f.input)).clusterGenerationLinked).toBe(false);
    f.backup.metadata.ownerReferences = [{ kind: 'Cluster', name: f.cluster.metadata.name, uid: 'old-generation' }];
    await expect(inspectCnpgRestoreSource(f.reader, f.input)).rejects.toThrow('RESTORE_SOURCE_IDENTITY_MISMATCH');
    f.backup.metadata.ownerReferences[0].uid = f.cluster.metadata.uid;
    expect((await inspectCnpgRestoreSource(f.reader, f.input)).clusterGenerationLinked).toBe(true);
  });
});
