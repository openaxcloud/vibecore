import { randomUUID } from 'node:crypto';
import { hashToken } from '@vibecore/auth';
import { Prisma, type DatabaseClient } from '@vibecore/database';
import {
  DatabaseRestoreError,
  type DatabaseRestoreRepository,
  type RestoreCheckpoint,
  type RestoreExecution,
  type RestorePhase,
  type RestoreRequest,
} from './database-restore-contract.js';
import type { DatabaseInstanceRecord } from './store.js';

const include = { restore: { include: { databaseInstance: true } } } as const;
type Journal = Prisma.DatabaseRestoreExecutionGetPayload<{ include: typeof include }>;

const secretKey = (environment: string) => (environment === 'production' ? 'PROD_DATABASE_URL' : 'DATABASE_URL');
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function map(row: Journal): RestoreExecution {
  const instance = row.restore.databaseInstance;
  return {
    restore: {
      id: row.restore.id,
      databaseInstanceId: row.restore.databaseInstanceId,
      snapshotId: row.restore.snapshotId ?? undefined,
      targetTimestamp: row.restore.targetTimestamp?.toISOString(),
      status: row.restore.status,
      requestedByUserId: row.restore.requestedByUserId ?? undefined,
      error: row.restore.error ?? undefined,
      createdAt: row.restore.createdAt.toISOString(),
      startedAt: row.restore.startedAt?.toISOString(),
      completedAt: row.restore.completedAt?.toISOString(),
    },
    instance: {
      id: instance.id,
      projectId: instance.projectId,
      organizationId: instance.organizationId,
      environment: instance.environment as DatabaseInstanceRecord['environment'],
      status: instance.status,
      engine: instance.engine,
      region: instance.region ?? undefined,
      sizeBytes: Number(instance.sizeBytes),
      retentionDays: instance.retentionDays,
      pitrEnabled: instance.pitrEnabled,
      activeTargetRef: instance.activeTargetRef ?? undefined,
      bindingVersion: instance.bindingVersion,
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt.toISOString(),
    },
    phase: row.phase as RestorePhase,
    resumePhase: (row.resumePhase ?? undefined) as RestorePhase | undefined,
    runnerToken: row.runnerToken ?? undefined,
    pendingFenceTokens: row.pendingFenceTokens,
    active: row.activeLock !== null,
    expectedBindingVersion: row.expectedBindingVersion,
    appliedBindingVersion: row.appliedBindingVersion ?? undefined,
    targetId: row.targetId,
    snapshot: (row.snapshot ?? undefined) as unknown as RestoreExecution['snapshot'],
    archive: (row.archive ?? undefined) as unknown as RestoreExecution['archive'],
    target: (row.target ?? undefined) as unknown as RestoreExecution['target'],
    quiescence: (row.quiescence ?? undefined) as unknown as RestoreExecution['quiescence'],
    readback: (row.readback ?? undefined) as unknown as RestoreExecution['readback'],
    release: (row.release ?? undefined) as unknown as RestoreExecution['release'],
    targetConnectionEncrypted: row.targetConnectionEncrypted ?? undefined,
    failureCode: row.failureCode ?? undefined,
  };
}

export class PrismaDatabaseRestoreRepository implements DatabaseRestoreRepository {
  constructor(readonly prisma: DatabaseClient) {}

  async admit(input: RestoreRequest): Promise<RestoreExecution> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this._lockAdmissionScope(tx, input.instance.projectId, input.instance.id);

        const instance = await tx.databaseInstance.findUniqueOrThrow({ where: { id: input.instance.id } });
        const project = await tx.project.findUniqueOrThrow({ where: { id: instance.projectId } });

        if (
          instance.projectId !== input.instance.projectId ||
          instance.organizationId !== input.instance.organizationId ||
          project.organizationId !== input.instance.organizationId ||
          instance.environment !== input.instance.environment ||
          instance.status !== 'ACTIVE' ||
          project.deletedAt ||
          project.runtimeDeletionPending
        ) {
          throw new DatabaseRestoreError('RESTORE_INSTANCE_CHANGED');
        }

        const active = await tx.databaseRestoreExecution.findUnique({ where: { activeLock: instance.id } });

        if (active) {
          throw new DatabaseRestoreError('RESTORE_ALREADY_RUNNING');
        }

        const secret = await tx.projectSecret.findUnique({
          where: { projectId_key: { projectId: instance.projectId, key: secretKey(instance.environment) } },
        });

        if (!secret?.valueEncrypted) {
          throw new DatabaseRestoreError('RESTORE_BINDING_MISSING');
        }

        const ambiguous = await tx.projectEnvVar.findFirst({
          where: { projectId: instance.projectId, key: secretKey(instance.environment) },
          select: { id: true },
        });

        if (ambiguous) {
          throw new DatabaseRestoreError('RESTORE_BINDING_AMBIGUOUS');
        }

        let snapshot: RestoreRequest['snapshot'];

        if (input.snapshot) {
          const row = await tx.databaseSnapshot.findFirst({
            where: { id: input.snapshot.id, databaseInstanceId: instance.id },
          });

          if (!row || (row.expiresAt && row.expiresAt <= new Date())) {
            throw new DatabaseRestoreError('RESTORE_SOURCE_MISMATCH', 422);
          }

          snapshot = {
            id: row.id,
            databaseInstanceId: row.databaseInstanceId,
            kind: row.kind === 'manual' ? 'manual' : 'auto',
            label: row.label ?? undefined,
            lsn: row.lsn ?? undefined,
            sizeBytes: Number(row.sizeBytes),
            storageKey: row.storageKey ?? undefined,
            createdByUserId: row.createdByUserId ?? undefined,
            createdAt: row.createdAt.toISOString(),
            expiresAt: row.expiresAt?.toISOString(),
          };
        }

        const restore = await tx.databaseRestore.create({
          data: {
            databaseInstanceId: instance.id,
            snapshotId: snapshot?.id,
            targetTimestamp: new Date(input.targetTimestamp),
            requestedByUserId: input.requestedByUserId,
          },
        });

        return map(
          await tx.databaseRestoreExecution.create({
            data: {
              restoreId: restore.id,
              activeLock: instance.id,
              expectedBindingVersion: instance.bindingVersion,
              sourceTargetRef: instance.activeTargetRef,
              originalSecretEncrypted: secret.valueEncrypted,
              targetId: `restore-${randomUUID()}`,
              ...(snapshot ? { snapshot: json(snapshot) } : {}),
            },
            include,
          }),
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        /*
         * The unique constraint remains a backstop. Do not misclassify another
         * uniqueness failure, or an uncertain transaction error, as an admission.
         */
        const active = await this.prisma.databaseRestoreExecution.findUnique({
          where: { activeLock: input.instance.id },
        });

        if (active) {
          throw new DatabaseRestoreError('RESTORE_ALREADY_RUNNING');
        }
      }

      throw error;
    }
  }

  async get(operationId: string) {
    const row = await this.prisma.databaseRestoreExecution.findUnique({ where: { restoreId: operationId }, include });
    return row ? map(row) : undefined;
  }

  async pending(limit: number) {
    return (
      await this.prisma.databaseRestoreExecution.findMany({
        where: {
          phase: 'PENDING',
          runnerToken: null,
          pendingFenceTokens: { isEmpty: true },
          activeLock: { not: null },
        },
        orderBy: { createdAt: 'asc' },
        take: Math.max(1, Math.min(limit, 100)),
        select: { restoreId: true },
      })
    ).map((row) => row.restoreId);
  }

  async claim(operationId: string, attemptToken: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.databaseRestoreExecution.updateMany({
        where: {
          restoreId: operationId,
          phase: 'PENDING',
          runnerToken: null,
          pendingFenceTokens: { isEmpty: true },
          activeLock: { not: null },
        },
        data: { runnerToken: attemptToken },
      });

      if (result.count !== 1) {
        return undefined;
      }

      await tx.databaseRestore.update({
        where: { id: operationId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      return map(await tx.databaseRestoreExecution.findUniqueOrThrow({ where: { restoreId: operationId }, include }));
    });
  }

  async checkpoint(operationId: string, attemptToken: string, from: RestorePhase, patch: RestoreCheckpoint) {
    const result = await this.prisma.databaseRestoreExecution.updateMany({
      where: {
        restoreId: operationId,
        runnerToken: attemptToken,
        phase: from,
        pendingFenceTokens: { isEmpty: true },
        activeLock: { not: null },
      },
      data: {
        phase: patch.phase,
        ...(patch.archive ? { archive: json(patch.archive) } : {}),
        ...(patch.target ? { target: json(patch.target) } : {}),
        ...(patch.quiescence ? { quiescence: json(patch.quiescence) } : {}),
        ...(patch.readback ? { readback: json(patch.readback) } : {}),
        ...(patch.release ? { release: json(patch.release) } : {}),
        targetConnectionEncrypted: patch.targetConnectionEncrypted,
      },
    });
    return result.count === 1;
  }

  async cutover(operationId: string, attemptToken: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.databaseRestoreExecution.findUniqueOrThrow({
        where: { restoreId: operationId },
        include,
      });
      await this._lockScope(tx, before.restore.databaseInstance.projectId, before.restore.databaseInstanceId);
      await tx.$queryRaw`SELECT "restoreId" FROM "DatabaseRestoreExecution" WHERE "restoreId" = ${operationId} FOR UPDATE`;

      const row = await tx.databaseRestoreExecution.findUniqueOrThrow({ where: { restoreId: operationId }, include });
      this._assertOwner(row, attemptToken, 'CUTOVER');

      const instance = row.restore.databaseInstance;
      const project = await tx.project.findUniqueOrThrow({ where: { id: instance.projectId } });
      const key = secretKey(instance.environment);

      const secret = await tx.projectSecret.findUnique({
        where: { projectId_key: { projectId: instance.projectId, key } },
      });

      if (
        project.deletedAt ||
        project.runtimeDeletionPending ||
        project.organizationId !== instance.organizationId ||
        instance.bindingVersion !== row.expectedBindingVersion ||
        instance.activeTargetRef !== row.sourceTargetRef ||
        secret?.valueEncrypted !== row.originalSecretEncrypted ||
        !row.targetConnectionEncrypted ||
        !row.quiescence ||
        !row.target ||
        !row.archive
      ) {
        throw new DatabaseRestoreError('RESTORE_BINDING_CHANGED');
      }

      const version = instance.bindingVersion + 1;
      await tx.databaseInstance.update({
        where: { id: instance.id },
        data: { activeTargetRef: row.targetId, bindingVersion: version },
      });
      await tx.projectSecret.update({
        where: { projectId_key: { projectId: instance.projectId, key } },
        data: { valueEncrypted: row.targetConnectionEncrypted, valueHash: hashToken(row.targetConnectionEncrypted) },
      });

      return map(
        await tx.databaseRestoreExecution.update({
          where: { restoreId: operationId },
          data: { phase: 'VERIFYING', appliedBindingVersion: version },
          include,
        }),
      );
    });
  }

  async complete(operationId: string, attemptToken: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.databaseRestoreExecution.findUniqueOrThrow({
        where: { restoreId: operationId },
        include,
      });
      await this._lockScope(tx, before.restore.databaseInstance.projectId, before.restore.databaseInstanceId);
      await tx.$queryRaw`SELECT "restoreId" FROM "DatabaseRestoreExecution" WHERE "restoreId" = ${operationId} FOR UPDATE`;

      const row = await tx.databaseRestoreExecution.findUniqueOrThrow({ where: { restoreId: operationId }, include });
      this._assertOwner(row, attemptToken, 'RELEASING');

      const instance = row.restore.databaseInstance;
      const project = await tx.project.findUniqueOrThrow({ where: { id: instance.projectId } });

      const secret = await tx.projectSecret.findUnique({
        where: { projectId_key: { projectId: instance.projectId, key: secretKey(instance.environment) } },
      });

      if (
        project.deletedAt ||
        project.runtimeDeletionPending ||
        project.organizationId !== instance.organizationId ||
        instance.status !== 'ACTIVE' ||
        instance.activeTargetRef !== row.targetId ||
        instance.bindingVersion !== row.appliedBindingVersion ||
        secret?.valueEncrypted !== row.targetConnectionEncrypted ||
        !row.readback ||
        !row.release
      ) {
        throw new DatabaseRestoreError('RESTORE_BINDING_CHANGED');
      }

      await tx.databaseRestore.update({
        where: { id: operationId },
        data: { status: 'COMPLETED', completedAt: new Date(), error: null },
      });

      return map(
        await tx.databaseRestoreExecution.update({
          where: { restoreId: operationId },
          data: { phase: 'COMPLETED', activeLock: null, runnerToken: null, failureCode: null },
          include,
        }),
      );
    });
  }

  async fail(operationId: string, attemptToken: string, code: string) {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.databaseRestoreExecution.findUnique({ where: { restoreId: operationId } });

      if (!row || row.runnerToken !== attemptToken || !row.activeLock) {
        return;
      }

      /*
       * prepareTarget may have allocated a durable target before rejecting.
       * Keep its handle and scope locked until a fenced recovery resolves it.
       */
      const safeToRelease =
        row.pendingFenceTokens.length === 0 &&
        code !== 'RESTORE_FENCE_UNCONFIRMED' &&
        ['PENDING', 'VALIDATING'].includes(row.phase);

      const updated = await tx.databaseRestoreExecution.updateMany({
        where: { restoreId: operationId, runnerToken: attemptToken, phase: row.phase },
        data: {
          phase: safeToRelease ? 'FAILED' : 'RECOVERY_REQUIRED',
          resumePhase: row.phase === 'RECOVERY_REQUIRED' ? row.resumePhase : row.phase,
          failureCode: code,
          ...(safeToRelease ? { activeLock: null, runnerToken: null } : {}),
        },
      });

      if (updated.count === 1) {
        await tx.databaseRestore.update({
          where: { id: operationId },
          data: { status: 'FAILED', error: code, completedAt: null },
        });
      }
    });
  }

  async resume(operationId: string, previousToken: string, nextToken: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.databaseRestoreExecution.findUnique({ where: { restoreId: operationId } });

      if (!row || !row.activeLock || row.runnerToken !== previousToken || previousToken === nextToken) {
        return undefined;
      }

      const phase = row.phase === 'RECOVERY_REQUIRED' ? row.resumePhase : row.phase;

      if (!phase || ['COMPLETED', 'FAILED'].includes(phase)) {
        return undefined;
      }

      const updated = await tx.databaseRestoreExecution.updateMany({
        where: { restoreId: operationId, runnerToken: previousToken, phase: row.phase },
        data: {
          phase,
          runnerToken: nextToken,
          pendingFenceTokens: [...new Set([...row.pendingFenceTokens, previousToken])],
          resumePhase: null,
          failureCode: null,
        },
      });

      if (updated.count !== 1) {
        return undefined;
      }

      await tx.databaseRestore.update({ where: { id: operationId }, data: { status: 'RUNNING', error: null } });

      return map(await tx.databaseRestoreExecution.findUniqueOrThrow({ where: { restoreId: operationId }, include }));
    });
  }

  async acknowledgeFence(operationId: string, attemptToken: string, excludedToken: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "restoreId" FROM "DatabaseRestoreExecution" WHERE "restoreId" = ${operationId} FOR UPDATE`;
      const row = await tx.databaseRestoreExecution.findUnique({ where: { restoreId: operationId } });

      if (!row || !row.activeLock || row.runnerToken !== attemptToken || excludedToken === attemptToken) {
        return false;
      }

      // Repeating an already persisted acknowledgement by this owner is safe.
      if (!row.pendingFenceTokens.includes(excludedToken)) {
        return true;
      }

      await tx.databaseRestoreExecution.update({
        where: { restoreId: operationId },
        data: { pendingFenceTokens: row.pendingFenceTokens.filter((token) => token !== excludedToken) },
      });
      return true;
    });
  }

  private async _lockScope(tx: Prisma.TransactionClient, projectId: string, instanceId: string) {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "DatabaseInstance" WHERE id = ${instanceId} FOR UPDATE`;
  }

  private async _lockAdmissionScope(tx: Prisma.TransactionClient, projectId: string, instanceId: string) {
    /*
     * Admission must not consume an interactive transaction waiting behind an
     * unrelated mutation. A busy scope is distinct from a persisted restore.
     */
    const projects = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE SKIP LOCKED`;

    if (projects.length !== 1) {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } });

      throw new DatabaseRestoreError(project ? 'RESTORE_ADMISSION_BUSY' : 'RESTORE_INSTANCE_CHANGED');
    }

    const instances = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "DatabaseInstance" WHERE id = ${instanceId} FOR UPDATE SKIP LOCKED`;

    if (instances.length !== 1) {
      const instance = await tx.databaseInstance.findUnique({ where: { id: instanceId }, select: { id: true } });

      throw new DatabaseRestoreError(instance ? 'RESTORE_ADMISSION_BUSY' : 'RESTORE_INSTANCE_CHANGED');
    }
  }

  private _assertOwner(row: Journal, token: string, phase: RestorePhase) {
    if (row.runnerToken !== token || row.phase !== phase || !row.activeLock) {
      throw new DatabaseRestoreError('RESTORE_ATTEMPT_STALE');
    }

    if (row.pendingFenceTokens.length !== 0) {
      throw new DatabaseRestoreError('RESTORE_FENCE_UNCONFIRMED');
    }
  }
}
