import { clusterName, DB_NAMESPACE, onDemandBackupName, type DatabaseEnvironment } from './database-provisioner.js';

/** Read-only metadata port. A resource response is not an archive/WAL receipt. */
export interface RestoreSourceReader {
  get(kind: string, namespace: string, name: string): Promise<unknown>;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class RestoreSourceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Resolves the precise on-demand Backup and Cluster before any target allocation.
 * Does not read credentials, apply resources, verify archive bytes or claim WAL
 * continuity. Cloud adapter must still supply physical verification and fencing.
 */
export async function inspectCnpgRestoreSource(
  reader: RestoreSourceReader,
  input: {
    projectId: string;
    organizationId: string;
    snapshotId: string;
    environment: DatabaseEnvironment;
  },
) {
  const sourceName = clusterName(input.projectId, input.environment);
  const backupName = onDemandBackupName(input.projectId, input.snapshotId, input.environment);
  if (
    !input.projectId ||
    !input.organizationId ||
    !input.snapshotId ||
    !['development', 'production'].includes(input.environment)
  ) {
    throw new RestoreSourceError('RESTORE_SOURCE_IDENTITY_REQUIRED');
  }
  const completeSourceName = `db-${input.projectId}${input.environment === 'production' ? '-prod' : ''}`;
  if (sourceName !== completeSourceName || backupName !== `${completeSourceName}-${input.snapshotId}`)
    throw new RestoreSourceError('RESTORE_SOURCE_NAME_AMBIGUOUS');
  let source: unknown;
  let backup: unknown;
  try {
    [source, backup] = await Promise.all([
      reader.get('Cluster', DB_NAMESPACE, sourceName),
      reader.get('Backup', DB_NAMESPACE, backupName),
    ]);
  } catch {
    throw new RestoreSourceError('RESTORE_SOURCE_READ_FAILED');
  }
  const inspect = (value: unknown, kind: string, name: string) => {
    const resource = record(value);
    const metadata = record(resource.metadata);
    const labels = record(metadata.labels);
    if (
      resource.kind !== kind ||
      resource.apiVersion !== 'postgresql.cnpg.io/v1' ||
      metadata.name !== name ||
      metadata.namespace !== DB_NAMESPACE ||
      typeof metadata.uid !== 'string' ||
      !metadata.uid ||
      metadata.deletionTimestamp ||
      labels['vibecore.ai/project-id'] !== input.projectId
    ) {
      throw new RestoreSourceError('RESTORE_SOURCE_IDENTITY_MISMATCH');
    }
    return { resource, metadata, labels };
  };
  const cluster = inspect(source, 'Cluster', sourceName);
  const snapshot = inspect(backup, 'Backup', backupName);
  if (
    cluster.labels['vibecore.ai/org-id'] !== input.organizationId ||
    snapshot.labels['vibecore.ai/snapshot-id'] !== input.snapshotId ||
    record(record(snapshot.resource.spec).cluster).name !== sourceName
  ) {
    throw new RestoreSourceError('RESTORE_SOURCE_IDENTITY_MISMATCH');
  }
  const owners = Array.isArray(snapshot.metadata.ownerReferences) ? snapshot.metadata.ownerReferences.map(record) : [];
  const clusterOwners = owners.filter((owner) => owner.kind === 'Cluster');
  if (clusterOwners.some((owner) => owner.name !== sourceName || owner.uid !== cluster.metadata.uid)) {
    throw new RestoreSourceError('RESTORE_SOURCE_IDENTITY_MISMATCH');
  }
  const status = record(snapshot.resource.status);
  if (status.phase !== 'completed' || status.error || typeof status.backupId !== 'string' || !status.backupId) {
    throw new RestoreSourceError('RESTORE_SOURCE_BACKUP_UNCONFIRMED');
  }
  const started = typeof status.startedAt === 'string' ? Date.parse(status.startedAt) : NaN;
  const stopped = typeof status.stoppedAt === 'string' ? Date.parse(status.stoppedAt) : NaN;
  if (!Number.isFinite(started) || !Number.isFinite(stopped) || stopped < started) {
    throw new RestoreSourceError('RESTORE_SOURCE_BACKUP_UNCONFIRMED');
  }
  // Bind later verification to immutable UIDs, not reusable Kubernetes names.
  return {
    namespace: DB_NAMESPACE,
    sourceName,
    sourceUid: cluster.metadata.uid as string,
    backupName,
    backupUid: snapshot.metadata.uid as string,
    backupId: status.backupId,
    startedAt: new Date(started).toISOString(),
    stoppedAt: new Date(stopped).toISOString(),
    projectId: input.projectId,
    organizationId: input.organizationId,
    environment: input.environment,
    clusterGenerationLinked: clusterOwners.length === 1,
    archiveVerified: false as const,
    walContinuityVerified: false as const,
  };
}
