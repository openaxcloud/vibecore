import { randomUUID } from 'node:crypto';
import type { DatabaseClient, Prisma } from '@vibecore/database';
import { lockRestoreAdmissionScope } from './database-restore-admission.js';
import { DatabaseRestoreError, type RestoreScope } from './database-restore-contract.js';

export type ManagedConsumerScope = Pick<RestoreScope, 'instanceId' | 'projectId' | 'organizationId' | 'environment'>;
export type RegisteredRestoreConsumer = {
  id: string;
  instanceId: string;
  bindingVersion: number;
  kind: 'api' | 'workload';
  uid: string;
  generation: string;
  state: 'ACTIVE' | 'DRAIN_REQUESTED' | 'DRAINED';
  leaseUntil: Date;
  drainRestoreId: string | null;
  drainAttemptToken: string | null;
};

/** Internal admission service. No route or production capability is enabled.
 * All managed connection/workload creation must use this gate BEFORE opening.
 * An unknown consumer outside this registry still blocks global quiescence.
 */
export class RestoreConsumerRegistry {
  constructor(private readonly prisma: DatabaseClient) {}

  private async scope(tx: Prisma.TransactionClient, scope: ManagedConsumerScope) {
    await lockRestoreAdmissionScope(tx, scope.projectId, scope.instanceId);
    const rows = await tx.$queryRaw<Array<{ bindingVersion: number }>>`
      SELECT i."bindingVersion" FROM "DatabaseInstance" i JOIN "Project" p ON p.id=i."projectId"
      WHERE i.id=${scope.instanceId} AND i."projectId"=${scope.projectId}
      AND i."organizationId"=${scope.organizationId} AND p."organizationId"=${scope.organizationId}
      AND i.environment=${scope.environment} AND i.status='ACTIVE'
      AND p."deletedAt" IS NULL AND p."runtimeDeletionPending"=false`;
    if (rows.length !== 1) throw new DatabaseRestoreError('RESTORE_INSTANCE_CHANGED');
    return rows[0].bindingVersion;
  }

  private async owner(tx: Prisma.TransactionClient, scope: RestoreScope) {
    const rows = await tx.$queryRaw<Array<{ restoreId: string }>>`
      SELECT e."restoreId" FROM "DatabaseRestoreExecution" e
      JOIN "DatabaseRestore" r ON r.id=e."restoreId"
      WHERE e."restoreId"=${scope.operationId} AND r."databaseInstanceId"=${scope.instanceId}
      AND e."activeLock"=${scope.instanceId} AND e."runnerToken"=${scope.attemptToken}
      AND e.phase='QUIESCING' AND cardinality(e."pendingFenceTokens")=0 FOR UPDATE OF e`;
    if (rows.length !== 1) throw new DatabaseRestoreError('RESTORE_ATTEMPT_STALE');
  }

  async admit(
    scope: ManagedConsumerScope,
    input: {
      bindingVersion: number;
      kind: 'api' | 'workload';
      uid: string;
      generation: string;
      leaseUntil: Date;
    },
  ): Promise<RegisteredRestoreConsumer> {
    if (
      !input.uid ||
      !input.generation ||
      !['api', 'workload'].includes(input.kind) ||
      input.uid.length > 256 ||
      input.generation.length > 256 ||
      !Number.isSafeInteger(input.bindingVersion) ||
      input.bindingVersion < 0 ||
      !Number.isFinite(input.leaseUntil.getTime()) ||
      input.leaseUntil.getTime() <= Date.now()
    ) {
      throw new DatabaseRestoreError('RESTORE_CONSUMER_IDENTITY_INVALID');
    }
    return this.prisma.$transaction(async (tx) => {
      const version = await this.scope(tx, scope);
      if (version !== input.bindingVersion) throw new DatabaseRestoreError('RESTORE_CONSUMER_BINDING_MISMATCH');
      const active = await tx.$queryRaw<Array<{ restoreId: string }>>`
        SELECT "restoreId" FROM "DatabaseRestoreExecution" WHERE "activeLock"=${scope.instanceId}`;
      if (active.length) throw new DatabaseRestoreError('RESTORE_ALREADY_RUNNING');
      // Immutable UID cannot be reused, including after drainage or a crash.
      const rows = await tx.$queryRaw<RegisteredRestoreConsumer[]>`
        INSERT INTO "DatabaseRestoreConsumer" (id,"instanceId","bindingVersion",kind,uid,generation,"leaseUntil")
        VALUES (${randomUUID()},${scope.instanceId},${version},${input.kind},${input.uid},${input.generation},${input.leaseUntil})
        ON CONFLICT ("instanceId",kind,uid) DO NOTHING RETURNING *`;
      if (rows.length !== 1) throw new DatabaseRestoreError('RESTORE_CONSUMER_UID_REUSED');
      return rows[0];
    });
  }

  async freeze(scope: RestoreScope): Promise<RegisteredRestoreConsumer[]> {
    return this.prisma.$transaction(async (tx) => {
      await this.scope(tx, scope);
      await this.owner(tx, scope);
      // Include stale bindings and expired leases: neither proves a stopped process.
      await tx.$executeRaw`UPDATE "DatabaseRestoreConsumer"
        SET state='DRAIN_REQUESTED',"drainRestoreId"=${scope.operationId},"drainAttemptToken"=${scope.attemptToken}
        WHERE "instanceId"=${scope.instanceId} AND state<>'DRAINED'`;
      return tx.$queryRaw<RegisteredRestoreConsumer[]>`
        SELECT * FROM "DatabaseRestoreConsumer" WHERE "instanceId"=${scope.instanceId} ORDER BY id`;
    });
  }

  /** Startup must recheck after connecting and before exposing any query handle. */
  async assertCanServe(scope: ManagedConsumerScope, consumer: RegisteredRestoreConsumer) {
    return this.prisma.$transaction(async (tx) => {
      const version = await this.scope(tx, scope);
      if (version !== consumer.bindingVersion) throw new DatabaseRestoreError('RESTORE_CONSUMER_BINDING_MISMATCH');
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT c.id FROM "DatabaseRestoreConsumer" c
        WHERE c.id=${consumer.id} AND c."instanceId"=${scope.instanceId} AND c.uid=${consumer.uid}
        AND c.generation=${consumer.generation} AND c.state='ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM "DatabaseRestoreExecution" WHERE "activeLock"=${scope.instanceId})`;
      if (rows.length !== 1) throw new DatabaseRestoreError('RESTORE_APPLICATION_QUIESCED');
    });
  }

  /** Only trusted drain drivers may acknowledge. A stop request or lease expiry is insufficient. */
  async assertDrainRequested(scope: RestoreScope, consumer: RegisteredRestoreConsumer) {
    return this.prisma.$transaction(async (tx) => {
      await this.scope(tx, scope);
      await this.owner(tx, scope);
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "DatabaseRestoreConsumer"
        WHERE id=${consumer.id} AND "instanceId"=${scope.instanceId} AND uid=${consumer.uid}
        AND kind=${consumer.kind} AND generation=${consumer.generation} AND "bindingVersion"=${consumer.bindingVersion}
        AND "drainRestoreId"=${scope.operationId} AND "drainAttemptToken"=${scope.attemptToken}
        AND state IN ('DRAIN_REQUESTED','DRAINED')`;
      if (rows.length !== 1) throw new DatabaseRestoreError('RESTORE_CONSUMER_DRAIN_MISMATCH');
    });
  }

  async confirmDrained(
    scope: RestoreScope,
    consumer: Pick<RegisteredRestoreConsumer, 'id' | 'uid' | 'generation' | 'bindingVersion'>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.scope(tx, scope);
      await this.owner(tx, scope);
      const changed =
        await tx.$executeRaw`UPDATE "DatabaseRestoreConsumer" SET state='DRAINED',"drainedAt"=CURRENT_TIMESTAMP
        WHERE id=${consumer.id} AND "instanceId"=${scope.instanceId} AND uid=${consumer.uid}
        AND generation=${consumer.generation} AND "bindingVersion"=${consumer.bindingVersion}
        AND "drainRestoreId"=${scope.operationId} AND "drainAttemptToken"=${scope.attemptToken}
        AND state IN ('DRAIN_REQUESTED','DRAINED')`;
      if (changed !== 1) throw new DatabaseRestoreError('RESTORE_CONSUMER_DRAIN_MISMATCH');
    });
  }

  async assertRegisteredConsumersDrained(scope: RestoreScope) {
    return this.prisma.$transaction(async (tx) => {
      await this.scope(tx, scope);
      await this.owner(tx, scope);
      const pending = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "DatabaseRestoreConsumer" WHERE "instanceId"=${scope.instanceId} AND state<>'DRAINED' LIMIT 1`;
      if (pending.length) throw new DatabaseRestoreError('RESTORE_CONSUMERS_NOT_DRAINED');
      return { registeredConsumersDrained: true as const, globalQuiescenceProven: false as const };
    });
  }
}
