import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- API service does not use the web ~/ alias.
import type { BackupProvenanceRecord, DatabaseBackupProvenanceRepository } from '../database-backup-provenance.js';
// eslint-disable-next-line no-restricted-imports -- API service does not use the web ~/ alias.
import { CnpgProvisioner, buildClusterManifest, provenBackupName, type K8sApplyPort } from '../database-provisioner.js';

// Controlled ports verify adapter behavior, never cloud bytes or durable database semantics.
function fixture() {
  const input = {
    projectId: 'project_synthetic12345678',
    snapshotId: 'snapshot_synthetic12345678901234567890',
    environment: 'production' as const,
  };
  const context = {
    projectId: input.projectId,
    organizationId: 'org',
    instanceId: 'instance',
    environment: input.environment,
    bindingVersion: 1,
  };

  const source: any = buildClusterManifest({ ...context, backupBucket: 'test', retentionDays: 7 });
  source.metadata.uid = 'source-uid';

  let intent: BackupProvenanceRecord | undefined;
  let backup: any;
  let creates = 0;
  let lostAck = false;
  let staleContext = false;

  const repo: DatabaseBackupProvenanceRepository = {
    async getContext() {
      return staleContext ? undefined : context;
    },
    async reserve(value) {
      if (!intent) {
        intent = { ...value, id: 'intent-id', nonce: 'nonce', createdAt: '2026-11-01T00:00:00Z' };
      } else if (Object.entries(value).some(([key, v]) => intent![key as keyof BackupProvenanceRecord] !== v)) {
        throw new Error('conflict');
      }

      return { ...intent };
    },
    async get() {
      return staleContext || !intent ? undefined : { ...intent };
    },
    async bindUid(id, uid) {
      if (staleContext || !intent || intent.id !== id || (intent.backupUid && intent.backupUid !== uid)) {
        throw new Error('conflict');
      }

      intent.backupUid = uid;

      return { ...intent };
    },
  };
  const port: K8sApplyPort = {
    async get(kind) {
      return kind === 'Cluster' ? source : backup;
    },
    async createBackup(manifest) {
      creates += 1;

      if (backup) {
        throw new Error('already exists');
      }

      backup = structuredClone(manifest);
      backup.metadata.uid = 'backup-uid';
      backup.status = { phase: 'completed' };

      if (lostAck) {
        throw new Error('response lost');
      }

      return backup;
    },
    async apply() {
      throw new Error('apply is forbidden');
    },
    async delete() {
      throw new Error('delete is forbidden');
    },
    async getSecret() {
      throw new Error('secret read is forbidden');
    },
  };

  return {
    input,
    source,
    repo,
    port,
    provisioner: new CnpgProvisioner(port, 'test', undefined, undefined, repo),
    get backup() {
      return backup;
    },
    set backup(value) {
      backup = value;
    },
    get intent() {
      return intent;
    },
    get creates() {
      return creates;
    },
    set lostAck(value: boolean) {
      lostAck = value;
    },
    set staleContext(value: boolean) {
      staleContext = value;
    },
  };
}

describe('durably identified CNPG backup adapter (controlled ports)', () => {
  it('uses DNS-safe complete-scope names for generated IDs and separates environments/colliding suffixes', () => {
    const f = fixture();
    const name = provenBackupName(f.input.projectId, f.input.snapshotId, 'production');
    expect(name).toMatch(/^bkp-v2-[a-f0-9]{40}$/);
    expect(provenBackupName(f.input.projectId, `${f.input.snapshotId}other`, 'production')).not.toBe(name);
    expect(provenBackupName(f.input.projectId, f.input.snapshotId, 'development')).not.toBe(name);
  });
  it('creates only, pins UID, and verifies long generated IDs without truncation refusal', async () => {
    const f = fixture();
    expect(await f.provisioner.takeSnapshot(f.input)).toEqual({ applied: true });
    expect(f.intent?.backupUid).toBe('backup-uid');
    expect(await f.provisioner.backupStatus(f.input)).toEqual({
      found: true,
      phase: 'completed',
      completed: true,
      error: undefined,
    });
  });
  it('reconciles lost acknowledgment and concurrent duplicate creates only with the same durable nonce', async () => {
    const f = fixture();
    f.lostAck = true;
    expect(await Promise.all([f.provisioner.takeSnapshot(f.input), f.provisioner.takeSnapshot(f.input)])).toEqual([
      { applied: true },
      { applied: true },
    ]);
    expect(f.intent?.backupUid).toBe('backup-uid');
    expect(f.creates).toBe(2);
  });
  it('does not adopt an existing unlinked resource after a create conflict', async () => {
    const f = fixture();
    f.backup = { metadata: { uid: 'old' }, status: { phase: 'completed' } };
    await expect(f.provisioner.takeSnapshot(f.input)).rejects.toThrow('BACKUP_PROVENANCE_UNCONFIRMED');
    expect(f.intent?.backupUid).toBeUndefined();
  });
  it.each([
    'kind',
    'apiVersion',
    'name',
    'namespace',
    'project',
    'organization',
    'snapshot',
    'source',
    'uid',
    'deleting',
    'nonce',
    'intent',
    'sourceUid',
    'instance',
    'binding',
    'environment',
  ] as const)('refuses completed metadata altered at %s', async (kind) => {
    const f = fixture();
    await f.provisioner.takeSnapshot(f.input);

    const b = f.backup;

    if (kind === 'kind') {
      b.kind = 'Cluster';
    }

    if (kind === 'apiVersion') {
      b.apiVersion = 'foreign/v1';
    }

    if (kind === 'name') {
      b.metadata.name = 'other';
    }

    if (kind === 'namespace') {
      b.metadata.namespace = 'other';
    }

    if (kind === 'project') {
      b.metadata.labels['vibecore.ai/project-id'] = 'other';
    }

    if (kind === 'organization') {
      b.metadata.labels['vibecore.ai/org-id'] = 'other';
    }

    if (kind === 'snapshot') {
      b.metadata.labels['vibecore.ai/snapshot-id'] = 'other';
    }

    if (kind === 'source') {
      b.spec.cluster.name = 'other';
    }

    if (kind === 'uid') {
      b.metadata.uid = 'recreated-backup';
    }

    if (kind === 'deleting') {
      b.metadata.deletionTimestamp = '2026-11-01T00:00:00Z';
    }

    const annotations = {
      nonce: 'backup-intent-nonce',
      intent: 'backup-intent-id',
      sourceUid: 'source-uid',
      instance: 'database-instance-id',
      binding: 'database-binding-version',
      environment: 'database-environment',
    };

    if (kind in annotations) {
      b.metadata.annotations[`vibecore.ai/${annotations[kind as keyof typeof annotations]}`] = 'other';
    }

    expect((await f.provisioner.backupStatus(f.input)).completed).toBe(false);
  });
  it.each(['running', 'failed', 'unknown'])('does not confirm %s', async (phase) => {
    const f = fixture();
    await f.provisioner.takeSnapshot(f.input);
    f.backup.status.phase = phase;
    expect((await f.provisioner.backupStatus(f.input)).completed).toBe(false);
  });
  it('rejects contradictory errors without exposing provider details', async () => {
    const f = fixture();
    await f.provisioner.takeSnapshot(f.input);
    f.backup.status.error = 'private provider detail';
    expect(await f.provisioner.backupStatus(f.input)).toMatchObject({
      completed: false,
      error: 'BACKUP_REPORTED_ERROR',
    });
  });
  it('rejects stale current context and recreated source cluster', async () => {
    const f = fixture();
    await f.provisioner.takeSnapshot(f.input);
    f.staleContext = true;
    expect((await f.provisioner.backupStatus(f.input)).completed).toBe(false);
    f.staleContext = false;
    f.source.metadata.uid = 'new-source';
    expect((await f.provisioner.backupStatus(f.input)).completed).toBe(false);
    await expect(f.provisioner.takeSnapshot(f.input)).rejects.toThrow();
  });
  it('never creates or confirms without repository/create-only transport', async () => {
    const f = fixture();
    const unbound = new CnpgProvisioner(f.port, 'test');
    expect(await unbound.takeSnapshot(f.input)).toEqual({ applied: false });
    expect((await unbound.backupStatus(f.input)).completed).toBe(false);
    f.port.createBackup = undefined;
    expect(await f.provisioner.takeSnapshot(f.input)).toEqual({ applied: false });
    expect(f.creates).toBe(0);
  });
  it('cannot manufacture evidence by status lookup alone', async () => {
    const f = fixture();
    expect((await f.provisioner.backupStatus(f.input)).completed).toBe(false);
    expect(f.creates).toBe(0);
  });
  it('does not bind a UID when source identity changes during creation', async () => {
    const f = fixture();
    const create = f.port.createBackup!;

    f.port.createBackup = async (manifest) => {
      const result = await create(manifest);
      f.source.metadata.uid = 'recreated-source';

      return result;
    };
    await expect(f.provisioner.takeSnapshot(f.input)).rejects.toThrow('BACKUP_PROVENANCE_UNCONFIRMED');
    expect(f.intent?.backupUid).toBeUndefined();
  });
  it('does not bind a UID when a lost-ack resource has a different nonce', async () => {
    const f = fixture();
    const create = f.port.createBackup!;

    f.port.createBackup = async (manifest) => {
      await create(manifest);
      f.backup.metadata.annotations['vibecore.ai/backup-intent-nonce'] = 'other-nonce';
      throw new Error('response lost');
    };
    await expect(f.provisioner.takeSnapshot(f.input)).rejects.toThrow('BACKUP_PROVENANCE_UNCONFIRMED');
    expect(f.intent?.backupUid).toBeUndefined();
  });
  it('rejects a source from another organization before reserving or creating', async () => {
    const f = fixture();
    f.source.metadata.labels['vibecore.ai/org-id'] = 'other';
    await expect(f.provisioner.takeSnapshot(f.input)).rejects.toThrow('BACKUP_PROVENANCE_UNCONFIRMED');
    expect(f.intent).toBeUndefined();
    expect(f.creates).toBe(0);
  });
  it('retries a bound receipt without creating again and never recreates a missing bound backup', async () => {
    const f = fixture();
    await f.provisioner.takeSnapshot(f.input);
    expect(await f.provisioner.takeSnapshot(f.input)).toEqual({ applied: true });
    expect(f.creates).toBe(1);
    f.backup = undefined;
    await expect(f.provisioner.takeSnapshot(f.input)).rejects.toThrow('BACKUP_PROVENANCE_UNCONFIRMED');
    expect(f.creates).toBe(1);
  });
  it.each([
    ['partial production suffix truncation', 'a'.repeat(48), 'production'],
    ['development source truncation', 'a'.repeat(60), 'development'],
    ['source case folding', 'SyntheticProject', 'production'],
  ] as const)('refuses %s before source read or backup creation', async (_label, projectId, environment) => {
    const f = fixture();

    let reads = 0;

    const get = f.port.get;

    f.port.get = async (...args) => {
      reads += 1;
      return get(...args);
    };
    await expect(f.provisioner.takeSnapshot({ ...f.input, projectId, environment })).rejects.toThrow(
      'BACKUP_PROVENANCE_UNCONFIRMED',
    );
    expect(reads).toBe(0);
    expect(f.creates).toBe(0);
    expect(f.intent).toBeUndefined();
  });
});
