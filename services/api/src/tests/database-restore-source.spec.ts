import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- API service does not use the web ~/ alias.
import { buildClusterManifest, buildOnDemandBackupManifest, provenBackupName } from '../database-provisioner.js';
// eslint-disable-next-line no-restricted-imports -- API service does not use the web ~/ alias.
import { inspectCnpgRestoreSource, inspectProvenanceBoundCnpgRestoreSource } from '../database-restore-source.js';

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

    if (kind === 'project') {
      f.backup.metadata.labels['vibecore.ai/project-id'] = 'other';
    }

    if (kind === 'organization') {
      f.cluster.metadata.labels['vibecore.ai/org-id'] = 'other';
    }

    if (kind === 'environment') {
      f.cluster.metadata.name = 'db-synthetic-project';
    }

    if (kind === 'uid') {
      delete f.backup.metadata.uid;
    }

    if (kind === 'deleting') {
      f.backup.metadata.deletionTimestamp = '2026-10-25T11:00:00Z';
    }

    if (kind === 'cluster') {
      f.backup.spec.cluster.name = 'other';
    }

    if (kind === 'phase') {
      f.backup.status.phase = 'running';
    }

    if (kind === 'backupId') {
      delete f.backup.status.backupId;
    }

    if (kind === 'time') {
      f.backup.status.stoppedAt = '2026-10-24T10:00:00Z';
    }

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
    f.backup.metadata.ownerReferences = [
      { apiVersion: 'postgresql.cnpg.io/v1', kind: 'Cluster', name: f.cluster.metadata.name, uid: 'old-generation' },
    ];
    await expect(inspectCnpgRestoreSource(f.reader, f.input)).rejects.toThrow('RESTORE_SOURCE_IDENTITY_MISMATCH');
    f.backup.metadata.ownerReferences[0].uid = f.cluster.metadata.uid;
    expect((await inspectCnpgRestoreSource(f.reader, f.input)).clusterGenerationLinked).toBe(true);
  });
  it.each(['wrong-group', 'missing-group', 'duplicate', 'malformed'] as const)(
    'refuses ambiguous or invalid owner provenance: %s',
    async (kind) => {
      const f = fixture();

      const owner: Record<string, unknown> = {
        apiVersion: 'postgresql.cnpg.io/v1',
        kind: 'Cluster',
        name: f.cluster.metadata.name,
        uid: f.cluster.metadata.uid,
      };

      if (kind === 'wrong-group') {
        owner.apiVersion = 'unrelated.example/v1';
      }

      if (kind === 'missing-group') {
        delete owner.apiVersion;
      }

      f.backup.metadata.ownerReferences =
        kind === 'duplicate' ? [owner, owner] : kind === 'malformed' ? { owner } : [owner];
      await expect(inspectCnpgRestoreSource(f.reader, f.input)).rejects.toThrow('RESTORE_SOURCE_IDENTITY_MISMATCH');
    },
  );
});

describe('provenance-bound v2 restore preflight', () => {
  function provenFixture() {
    const f = fixture();

    const intent = {
      ...f.input,
      id: 'intent',
      nonce: 'nonce',
      instanceId: 'instance',
      bindingVersion: 0,
      sourceName: f.cluster.metadata.name,
      sourceUid: f.cluster.metadata.uid,
      backupName: provenBackupName(f.input.projectId, f.input.snapshotId, f.input.environment),
      backupUid: f.backup.metadata.uid,
      createdAt: '2026-10-25T09:59:00Z',
    };
    f.backup.metadata.name = intent.backupName;
    f.backup.metadata.labels['vibecore.ai/org-id'] = intent.organizationId;
    f.backup.metadata.annotations = {
      'vibecore.ai/backup-intent-id': intent.id,
      'vibecore.ai/backup-intent-nonce': intent.nonce,
      'vibecore.ai/source-uid': intent.sourceUid,
      'vibecore.ai/database-instance-id': intent.instanceId,
      'vibecore.ai/database-binding-version': String(intent.bindingVersion),
      'vibecore.ai/database-environment': intent.environment,
    };

    return { ...f, intent, repository: { get: async () => ({ ...intent }) } };
  }
  it('reads exact v2 resources and binds durable provenance without claiming physical verification', async () => {
    const f = provenFixture();
    const result = await inspectProvenanceBoundCnpgRestoreSource(f.reader, f.repository, f.input);
    expect(result).toMatchObject({
      provenanceLinked: true,
      provenanceId: 'intent',
      instanceId: 'instance',
      bindingVersion: 0,
      archiveVerified: false,
      walContinuityVerified: false,
    });
    expect(f.reads).toEqual([
      `Cluster/project-databases/${f.intent.sourceName}`,
      `Backup/project-databases/${f.intent.backupName}`,
    ]);
    expect(JSON.stringify(result)).not.toContain('nonce');
  });
  it.each(['sourceUid', 'backupUid', 'nonce', 'instanceId', 'bindingVersion', 'environment', 'id'] as const)(
    'rejects resource/journal mismatch in %s',
    async (key) => {
      const f = provenFixture();
      Object.assign(f.intent, { [key]: key === 'bindingVersion' ? 1 : 'different' });
      await expect(inspectProvenanceBoundCnpgRestoreSource(f.reader, f.repository, f.input)).rejects.toThrow(
        'RESTORE_SOURCE_PROVENANCE_UNCONFIRMED',
      );
    },
  );
  it('refuses missing provenance before reading any Kubernetes resource', async () => {
    const f = provenFixture();
    await expect(
      inspectProvenanceBoundCnpgRestoreSource(f.reader, { get: async () => undefined }, f.input),
    ).rejects.toThrow('RESTORE_SOURCE_PROVENANCE_UNCONFIRMED');
    expect(f.reads).toEqual([]);
  });
  it('does not adopt an unbound backup UID', async () => {
    const f = provenFixture();
    await expect(
      inspectProvenanceBoundCnpgRestoreSource(
        f.reader,
        { get: async () => ({ ...f.intent, backupUid: undefined }) },
        f.input,
      ),
    ).rejects.toThrow('RESTORE_SOURCE_PROVENANCE_UNCONFIRMED');
    expect(f.reads).toEqual([]);
  });
  it.each(['removed', 'changed', 'error'])('rejects a journal %s during Kubernetes reads', async (kind) => {
    const f = provenFixture();

    let count = 0;

    const get = async () => {
      if (++count === 1) {
        return { ...f.intent };
      }

      if (kind === 'error') {
        throw new Error('private transport detail');
      }

      return kind === 'removed' ? undefined : { ...f.intent, bindingVersion: 1 };
    };
    await expect(inspectProvenanceBoundCnpgRestoreSource(f.reader, { get }, f.input)).rejects.toThrow(
      'RESTORE_SOURCE_PROVENANCE_UNCONFIRMED',
    );
  });
});
