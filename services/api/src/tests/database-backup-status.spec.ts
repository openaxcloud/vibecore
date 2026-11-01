import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- API service does not use the web ~/ alias.
import { CnpgProvisioner, buildOnDemandBackupManifest, type K8sApplyPort } from '../database-provisioner.js';

// Controlled metadata only: this suite cannot establish archive/WAL integrity.
function fixture() {
  const input = { projectId: 'synthetic-project', snapshotId: 'snapshot', environment: 'production' as const };
  const backup: any = buildOnDemandBackupManifest(input.projectId, input.snapshotId, input.environment);
  backup.metadata.uid = 'backup-uid';
  backup.status = { phase: 'completed' };

  const reads: string[] = [];

  const port: K8sApplyPort = {
    async get(kind, namespace, name) {
      reads.push(`${kind}/${namespace}/${name}`);
      return backup;
    },
    async apply() {
      throw new Error('Unexpected mutation');
    },
    async delete() {
      throw new Error('Unexpected mutation');
    },
    async getSecret() {
      throw new Error('Unexpected secret read');
    },
  };

  return { input, backup, reads, provisioner: new CnpgProvisioner(port, 'synthetic-bucket') };
}

describe('CNPG backup status identity guard', () => {
  it('accepts an exact completed Backup identity, without requiring an owner', async () => {
    const f = fixture();
    expect(await f.provisioner.backupStatus(f.input)).toEqual({
      found: true,
      phase: 'completed',
      completed: true,
      error: undefined,
    });
    expect(f.reads).toEqual(['Backup/project-databases/db-synthetic-project-prod-snapshot']);
  });
  it.each([
    'kind',
    'apiVersion',
    'name',
    'namespace',
    'project',
    'snapshot',
    'cluster',
    'uid',
    'deleting',
    'error',
  ] as const)('refuses a completed backup with invalid %s', async (kind) => {
    const f = fixture();

    if (kind === 'kind') {
      f.backup.kind = 'Cluster';
    }

    if (kind === 'apiVersion') {
      f.backup.apiVersion = 'unrelated.example/v1';
    }

    if (kind === 'name') {
      f.backup.metadata.name = 'other';
    }

    if (kind === 'namespace') {
      f.backup.metadata.namespace = 'other';
    }

    if (kind === 'project') {
      f.backup.metadata.labels['vibecore.ai/project-id'] = 'other';
    }

    if (kind === 'snapshot') {
      f.backup.metadata.labels['vibecore.ai/snapshot-id'] = 'other';
    }

    if (kind === 'cluster') {
      f.backup.spec.cluster.name = 'other';
    }

    if (kind === 'uid') {
      delete f.backup.metadata.uid;
    }

    if (kind === 'deleting') {
      f.backup.metadata.deletionTimestamp = '2026-11-01T10:00:00Z';
    }

    if (kind === 'error') {
      f.backup.status.error = 'failed upload';
    }

    expect((await f.provisioner.backupStatus(f.input)).completed).toBe(false);
  });
  it('refuses colliding truncated names before reading even relabelled resources', async () => {
    const f = fixture();
    const input = { ...f.input, projectId: 'a'.repeat(25), snapshotId: 'b'.repeat(25) };
    expect(await f.provisioner.backupStatus(input)).toMatchObject({
      completed: false,
      error: 'BACKUP_SOURCE_NAME_AMBIGUOUS',
    });
    expect(f.reads).toEqual([]);
  });
  it('does not accept a missing snapshot label as legacy proof', async () => {
    const f = fixture();
    delete f.backup.metadata.labels['vibecore.ai/snapshot-id'];
    expect((await f.provisioner.backupStatus(f.input)).completed).toBe(false);
  });
  it.each(['running', 'failed', 'unknown'])('does not confirm phase %s', async (phase) => {
    const f = fixture();
    f.backup.status.phase = phase;
    expect((await f.provisioner.backupStatus(f.input)).completed).toBe(false);
  });
});
