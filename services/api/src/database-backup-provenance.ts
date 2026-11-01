import { randomUUID } from 'node:crypto';
import { Prisma, type DatabaseClient } from '@vibecore/database';

export interface BackupContext {
  projectId: string;
  organizationId: string;
  instanceId: string;
  environment: 'development' | 'production';
  bindingVersion: number;
}

export interface BackupProvenanceRecord extends BackupContext {
  id: string;
  nonce: string;
  snapshotId: string;
  sourceName: string;
  sourceUid: string;
  backupName: string;
  backupUid?: string;
  createdAt: string;
}

type Reservation = BackupContext & {
  snapshotId: string;
  sourceName: string;
  sourceUid: string;
  backupName: string;
};

export interface DatabaseBackupProvenanceRepository {
  getContext(projectId: string, environment: BackupContext['environment']): Promise<BackupContext | undefined>;
  reserve(input: Reservation): Promise<BackupProvenanceRecord>;
  get(
    projectId: string,
    environment: BackupContext['environment'],
    snapshotId: string,
  ): Promise<BackupProvenanceRecord | undefined>;
  bindUid(recordId: string, backupUid: string): Promise<BackupProvenanceRecord>;
}

export class BackupProvenanceError extends Error {
  constructor(readonly code: 'BACKUP_CONTEXT_CHANGED' | 'BACKUP_PROVENANCE_CONFLICT' | 'BACKUP_PROVENANCE_INVALID') {
    super(code);
  }
}

type Row = Prisma.DatabaseBackupProvenanceGetPayload<object>;

const contextFields = ['projectId', 'organizationId', 'instanceId', 'environment', 'bindingVersion'] as const;
const identityFields = [...contextFields, 'snapshotId', 'sourceName', 'sourceUid', 'backupName'] as const;

function sameContext(left: BackupContext, right: BackupContext) {
  return contextFields.every((key) => left[key] === right[key]);
}

function map(row: Row): BackupProvenanceRecord {
  if (row.environment !== 'development' && row.environment !== 'production') {
    throw new BackupProvenanceError('BACKUP_PROVENANCE_INVALID');
  }

  return {
    ...row,
    environment: row.environment,
    backupUid: row.backupUid ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 2048 && !value.includes('\0');
}

/** Control-plane metadata only: never reads credentials or invokes a provider. */
export class PrismaDatabaseBackupProvenanceRepository implements DatabaseBackupProvenanceRepository {
  constructor(readonly prisma: DatabaseClient) {}

  /** Same lock order as transfer, restore admission and cutover: Project then instance. */
  private async _current(
    tx: Prisma.TransactionClient,
    projectId: string,
    environment: BackupContext['environment'],
  ): Promise<BackupContext | undefined> {
    if (!validText(projectId) || !['development', 'production'].includes(environment)) {
      return undefined;
    }

    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;

    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true, deletedAt: true, runtimeDeletionPending: true },
    });

    if (!project || project.deletedAt || project.runtimeDeletionPending) {
      return undefined;
    }

    const candidate = await tx.databaseInstance.findUnique({
      where: { projectId_environment: { projectId, environment } },
      select: { id: true },
    });

    if (!candidate) {
      return undefined;
    }

    await tx.$queryRaw`SELECT id FROM "DatabaseInstance" WHERE id = ${candidate.id} FOR UPDATE`;

    const instance = await tx.databaseInstance.findUnique({
      where: { id: candidate.id },
      select: {
        id: true,
        projectId: true,
        organizationId: true,
        environment: true,
        status: true,
        activeTargetRef: true,
        bindingVersion: true,
      },
    });

    if (
      !instance ||
      instance.projectId !== projectId ||
      instance.environment !== environment ||
      instance.organizationId !== project.organizationId ||
      instance.status !== 'ACTIVE' ||
      instance.activeTargetRef !== null
    ) {
      return undefined;
    }

    const restore = await tx.databaseRestoreExecution.findUnique({
      where: { activeLock: instance.id },
      select: { restoreId: true },
    });

    if (restore) {
      return undefined;
    }

    return {
      projectId,
      organizationId: instance.organizationId,
      instanceId: instance.id,
      environment,
      bindingVersion: instance.bindingVersion,
    };
  }

  getContext(projectId: string, environment: BackupContext['environment']) {
    return this.prisma.$transaction((tx) => this._current(tx, projectId, environment));
  }

  reserve(input: Reservation): Promise<BackupProvenanceRecord> {
    input = { ...input };

    if (
      !identityFields.filter((key) => key !== 'bindingVersion').every((key) => validText(input[key])) ||
      !Number.isSafeInteger(input.bindingVersion) ||
      input.bindingVersion < 0
    ) {
      return Promise.reject(new BackupProvenanceError('BACKUP_PROVENANCE_INVALID'));
    }

    return this.prisma.$transaction(async (tx) => {
      const context = await this._current(tx, input.projectId, input.environment);

      if (!context || !sameContext(context, input)) {
        throw new BackupProvenanceError('BACKUP_CONTEXT_CHANGED');
      }

      const existing = await tx.databaseBackupProvenance.findUnique({
        where: {
          projectId_environment_snapshotId: {
            projectId: input.projectId,
            environment: input.environment,
            snapshotId: input.snapshotId,
          },
        },
      });

      if (existing) {
        if (!identityFields.every((key) => existing[key] === input[key])) {
          throw new BackupProvenanceError('BACKUP_PROVENANCE_CONFLICT');
        }

        return map(existing);
      }

      return map(
        await tx.databaseBackupProvenance.create({
          data: {
            ...context,
            snapshotId: input.snapshotId,
            sourceName: input.sourceName,
            sourceUid: input.sourceUid,
            backupName: input.backupName,
            id: randomUUID(),
            nonce: randomUUID(),
          },
        }),
      );
    });
  }

  get(projectId: string, environment: BackupContext['environment'], snapshotId: string) {
    return this.prisma.$transaction(async (tx) => {
      const context = await this._current(tx, projectId, environment);

      if (!context) {
        return undefined;
      }

      const row = await tx.databaseBackupProvenance.findUnique({
        where: { projectId_environment_snapshotId: { projectId, environment, snapshotId } },
      });

      if (!row || !sameContext(context, map(row))) {
        return undefined;
      }

      return map(row);
    });
  }

  bindUid(recordId: string, backupUid: string): Promise<BackupProvenanceRecord> {
    if (!validText(recordId) || !validText(backupUid)) {
      return Promise.reject(new BackupProvenanceError('BACKUP_PROVENANCE_INVALID'));
    }

    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.databaseBackupProvenance.findUnique({ where: { id: recordId } });

      if (!initial) {
        throw new BackupProvenanceError('BACKUP_CONTEXT_CHANGED');
      }

      const record = map(initial);
      const context = await this._current(tx, record.projectId, record.environment);

      if (!context || !sameContext(context, record)) {
        throw new BackupProvenanceError('BACKUP_CONTEXT_CHANGED');
      }

      const changed = await tx.databaseBackupProvenance.updateMany({
        where: { id: recordId, OR: [{ backupUid: null }, { backupUid }] },
        data: { backupUid },
      });

      if (changed.count !== 1) {
        throw new BackupProvenanceError('BACKUP_PROVENANCE_CONFLICT');
      }

      return map(await tx.databaseBackupProvenance.findUniqueOrThrow({ where: { id: recordId } }));
    });
  }
}
