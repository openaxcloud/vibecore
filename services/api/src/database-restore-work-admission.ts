import { randomUUID } from 'node:crypto';
import type { DatabaseClient, Prisma } from '@vibecore/database';
import { DatabaseRestoreError } from './database-restore-contract.js';

export type RestoreWorkScope = {
  instanceId: string;
  projectId: string;
  organizationId: string;
  environment: 'development' | 'production';
  bindingVersion: number;
  targetRef: string | null;
  ownerIncarnation: string;
};
export type RestoreWorkTicket = RestoreWorkScope & { id: string };

/**
 * Control-plane admission for cooperating consumers, not a global fence.
 * Every effect must wait for admit() to return after its confirmed commit.
 * Uncertain admission must NOT start work. Uncertain work completion must retain
 * its ticket, including after a crash. No lease, TTL or liveness heuristic exists.
 * Internal trusted integration only: callers must authenticate their consumers.
 */
export class PrismaRestoreWorkAdmission {
  constructor(readonly prisma: DatabaseClient) {}

  async admit(input: RestoreWorkScope): Promise<RestoreWorkTicket> {
    const scope = { ...input };

    if (!scope.ownerIncarnation || !Number.isSafeInteger(scope.bindingVersion) || scope.bindingVersion < 0) {
      throw new DatabaseRestoreError('RESTORE_WORK_SCOPE_INVALID');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this._lock(tx, scope);

        const instance = await tx.databaseInstance.findUnique({ where: { id: scope.instanceId } });
        const project = await tx.project.findUnique({ where: { id: scope.projectId } });

        if (
          !instance ||
          !project ||
          project.organizationId !== scope.organizationId ||
          instance.projectId !== scope.projectId ||
          instance.organizationId !== scope.organizationId ||
          instance.environment !== scope.environment ||
          instance.bindingVersion !== scope.bindingVersion ||
          instance.activeTargetRef !== scope.targetRef ||
          instance.status !== 'ACTIVE' ||
          project.deletedAt ||
          project.runtimeDeletionPending
        ) {
          throw new DatabaseRestoreError('RESTORE_WORK_BINDING_CHANGED');
        }

        const restore = await tx.databaseRestoreExecution.findUnique({ where: { activeLock: scope.instanceId } });

        if (restore) {
          throw new DatabaseRestoreError('RESTORE_WORK_ADMISSION_CLOSED');
        }

        const ticket = { ...scope, id: randomUUID() };
        await tx.databaseRestoreAdmittedWork.create({ data: ticket });

        return ticket;
      });
    } catch (error) {
      throw error instanceof DatabaseRestoreError
        ? error
        : new DatabaseRestoreError('RESTORE_WORK_ADMISSION_UNCERTAIN');
    }
  }

  /**
   * Explicit integration acknowledgement only AFTER all effects are proven
   * settled and no future work can use this ticket. Never call in an automatic
   * finally block, on a timeout, process death or ambiguous network failure.
   * Keep a tombstone so replay cannot turn a settled ticket into new admission.
   */
  async acknowledgeSettledWork(input: RestoreWorkTicket): Promise<void> {
    const ticket = { ...input };

    try {
      await this.prisma.$transaction(async (tx) => {
        // Completion serializes with cutover and with the observation below.
        await this._lock(tx, ticket);

        const changed = await tx.databaseRestoreAdmittedWork.updateMany({
          where: { ...ticket, settledAt: null },
          data: { settledAt: new Date() },
        });

        if (changed.count === 1) {
          return;
        }

        const existing = await tx.databaseRestoreAdmittedWork.findFirst({ where: ticket });

        if (!existing?.settledAt) {
          throw new DatabaseRestoreError('RESTORE_WORK_TICKET_MISMATCH');
        }
      });
    } catch (error) {
      throw error instanceof DatabaseRestoreError
        ? error
        : new DatabaseRestoreError('RESTORE_WORK_SETTLEMENT_UNCERTAIN');
    }
  }

  private async _lock(tx: Prisma.TransactionClient, scope: Pick<RestoreWorkScope, 'projectId' | 'instanceId'>) {
    const projects = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Project" WHERE id = ${scope.projectId} FOR UPDATE SKIP LOCKED`;

    if (projects.length !== 1) {
      throw new DatabaseRestoreError('RESTORE_WORK_ADMISSION_BUSY');
    }

    const instances = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "DatabaseInstance" WHERE id = ${scope.instanceId} FOR UPDATE SKIP LOCKED`;

    if (instances.length !== 1) {
      throw new DatabaseRestoreError('RESTORE_WORK_ADMISSION_BUSY');
    }
  }
}

/** Caller holds Project then DatabaseInstance locks. Never proves global drain. */
export async function assertNoAdmittedRestoreWork(tx: Prisma.TransactionClient, instanceId: string) {
  const pending = await tx.databaseRestoreAdmittedWork.count({ where: { instanceId, settledAt: null } });

  if (pending !== 0) {
    throw new DatabaseRestoreError('RESTORE_WORK_DRAIN_UNCONFIRMED');
  }
}
