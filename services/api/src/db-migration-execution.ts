import { createHash, randomUUID } from 'node:crypto';

import type { DatabaseProvisioner } from './database-provisioner.js';
import type { DatabasePhysicalAuthority } from './store.js';
import { MigrationRolledBackError } from './db-migration-applier.js';
import { MIGRATION_LEDGER_SERIALIZATION_LOCK_KEY } from './db-migration-lock.js';

export const MIGRATION_MANIFEST_PATH = 'migrations/ecode.publish.json';
export const MIGRATION_ACTIVE_STATES = [
  'LOCK_ACQUIRED',
  'BACKUP_VERIFIED',
  'APPLYING',
  'VALIDATING',
  'RECOVERING',
] as const;

export type DatabaseMigrationState =
  | (typeof MIGRATION_ACTIVE_STATES)[number]
  | 'COMMITTED'
  | 'FAILED_SAFE'
  | 'MANUAL_RECOVERY';

export interface DeclaredMigration {
  name: string;
  sql: string;
  sha256: string;
}

export interface PersistedMigrationPlanEntry {
  name: string;
  sha256: string;
}

export interface DatabaseMigrationExecutionRecord {
  id: string;
  projectId: string;
  organizationId: string;
  environment: string;
  state: DatabaseMigrationState;
  idempotencyKey: string;
  requestHash: string;
  activeLock?: string;
  ownerToken?: string;
  version: number;
  leaseExpiresAt?: string;
  attempt: number;
  plan: PersistedMigrationPlanEntry[];
  statementsSha256: string;
  statementCount: number;
  appliedStatements: number;
  backwardCompatible: boolean;
  forwardCompatible: boolean;
  backupId?: string;
  backupVerifiedAt?: string;
  backupVerificationMethod?: string;
  deploymentId?: string;
  createdByUserId?: string;
  errorCode?: string;
  startedAt: string;
  completedAt?: string;
}

export type DatabaseMigrationAcquireResult =
  | { kind: 'ACQUIRED' | 'RECOVERY'; execution: DatabaseMigrationExecutionRecord }
  | { kind: 'REPLAYED' | 'BLOCKED' | 'FAILED' | 'MANUAL_RECOVERY'; execution: DatabaseMigrationExecutionRecord }
  | { kind: 'IDEMPOTENCY_COLLISION'; execution: DatabaseMigrationExecutionRecord };

export interface DatabaseMigrationStore {
  acquireDatabaseMigrationExecution(input: {
    projectId: string;
    organizationId: string;
    environment: string;
    idempotencyKey: string;
    requestHash: string;
    ownerToken: string;
    ttlMs: number;
    plan: PersistedMigrationPlanEntry[];
    statementsSha256: string;
    backwardCompatible: boolean;
    forwardCompatible: boolean;
    deploymentId?: string;
    createdByUserId?: string;
  }): Promise<DatabaseMigrationAcquireResult>;
  renewDatabaseMigrationLease(input: {
    id: string;
    ownerToken: string;
    version: number;
    state: DatabaseMigrationState;
    ttlMs: number;
  }): Promise<DatabaseMigrationExecutionRecord | undefined>;
  validateDatabaseMigrationLease(input: {
    id: string;
    ownerToken: string;
    version: number;
    state: DatabaseMigrationState;
  }): Promise<boolean>;
  transitionDatabaseMigrationExecution(input: {
    id: string;
    ownerToken: string;
    version: number;
    expectedState: DatabaseMigrationState;
    nextState: DatabaseMigrationState;
    ttlMs: number;
    release?: boolean;
    retainLock?: boolean;
    backupId?: string;
    backupVerificationMethod?: string;
    appliedStatements?: number;
    errorCode?: string;
  }): Promise<DatabaseMigrationExecutionRecord | undefined>;
}

export interface MigrationTargetInspection {
  status: 'EMPTY' | 'COMPLETE' | 'PARTIAL' | 'MISMATCH' | 'UNAVAILABLE';
  applied: string[];
}

export interface SqlApplier {
  apply(input: {
    connectionString: string;
    lockKey: string;
    migrations: DeclaredMigration[];
    beforeCommit: () => Promise<void>;
  }): Promise<{ applied: string[] }>;
  inspect(input: {
    connectionString: string;
    lockKey: string;
    plan: PersistedMigrationPlanEntry[];
  }): Promise<MigrationTargetInspection>;
}

export type MigrationFailureCode =
  | 'MIGRATION_TARGET_UNAVAILABLE'
  | 'MIGRATION_MANIFEST_INVALID'
  | 'MIGRATION_UNSAFE_PLAN'
  | 'MIGRATION_LOCK_HELD'
  | 'MIGRATION_PREVIOUS_ATTEMPT_FAILED'
  | 'MIGRATION_IDEMPOTENCY_COLLISION'
  | 'MIGRATION_BACKUP_UNVERIFIED'
  | 'MIGRATION_LEASE_LOST'
  | 'MIGRATION_FAILED_SAFE'
  | 'MIGRATION_MANUAL_RECOVERY'
  | 'MIGRATION_ENGINE_UNSUPPORTED';

export type MigrationOutcome =
  | {
      ok: true;
      executionId: string;
      state: 'COMMITTED';
      replayed: boolean;
      appliedStatements: number;
    }
  | {
      ok: false;
      code: MigrationFailureCode;
      executionId?: string;
      state?: DatabaseMigrationState;
      retryable: boolean;
    };

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashStatements(migrations: readonly DeclaredMigration[]): string {
  return sha256(migrations.map((migration) => `${migration.name}\0${migration.sha256}`).join('\0'));
}

export function migrationRequestHash(input: {
  projectId: string;
  organizationId: string;
  environment: string;
  deploymentId?: string;
  statementsSha256: string;
  backwardCompatible: boolean;
  forwardCompatible: boolean;
}): string {
  return sha256(JSON.stringify(input));
}

class LeaseLostError extends Error {
  readonly code = 'MIGRATION_LEASE_LOST';
}

class LeaseSession {
  #execution: DatabaseMigrationExecutionRecord;
  #lost = false;
  #tail: Promise<unknown> = Promise.resolve();
  #timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly _store: DatabaseMigrationStore,
    execution: DatabaseMigrationExecutionRecord,
    private readonly _ownerToken: string,
    private readonly _ttlMs: number,
    private readonly _renewIntervalMs: number,
  ) {
    this.#execution = execution;
  }

  get execution(): DatabaseMigrationExecutionRecord {
    return this.#execution;
  }

  #serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  async renew(): Promise<void> {
    await this.#serialized(async () => {
      if (this.#lost) {
        throw new LeaseLostError('migration lease lost');
      }

      const renewed = await this._store.renewDatabaseMigrationLease({
        id: this.#execution.id,
        ownerToken: this._ownerToken,
        version: this.#execution.version,
        state: this.#execution.state,
        ttlMs: this._ttlMs,
      });

      if (!renewed) {
        this.#lost = true;
        throw new LeaseLostError('migration lease renewal refused');
      }

      this.#execution = renewed;
    });
  }

  async guard(): Promise<void> {
    await this.#serialized(async () => {
      if (this.#lost) {
        throw new LeaseLostError('migration lease lost');
      }

      const live = await this._store.validateDatabaseMigrationLease({
        id: this.#execution.id,
        ownerToken: this._ownerToken,
        version: this.#execution.version,
        state: this.#execution.state,
      });

      if (!live) {
        this.#lost = true;
        throw new LeaseLostError('migration lease validation refused');
      }
    });
  }

  async transition(
    nextState: DatabaseMigrationState,
    patch: Omit<
      Parameters<DatabaseMigrationStore['transitionDatabaseMigrationExecution']>[0],
      'id' | 'ownerToken' | 'version' | 'expectedState' | 'nextState' | 'ttlMs'
    > = {},
  ): Promise<void> {
    await this.#serialized(async () => {
      if (this.#lost) {
        throw new LeaseLostError('migration lease lost');
      }

      const transitioned = await this._store.transitionDatabaseMigrationExecution({
        id: this.#execution.id,
        ownerToken: this._ownerToken,
        version: this.#execution.version,
        expectedState: this.#execution.state,
        nextState,
        ttlMs: this._ttlMs,
        ...patch,
      });

      if (!transitioned) {
        this.#lost = true;
        throw new LeaseLostError('migration transition lost ownership');
      }

      this.#execution = transitioned;
    });
  }

  startHeartbeat(): void {
    if (this.#timer) {
      return;
    }

    this.#timer = setInterval(() => void this.renew().catch(() => undefined), this._renewIntervalMs);
    this.#timer.unref?.();
  }

  async stopHeartbeat(): Promise<void> {
    if (this.#timer) {
      clearInterval(this.#timer);
    }

    this.#timer = undefined;
    await this.#tail;
  }
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_RENEW_INTERVAL_MS = 10_000;
const DEFAULT_BACKUP_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_BACKUP_POLL_MS = 3_000;

async function waitForVerifiedBackup(input: {
  provisioner: DatabaseProvisioner;
  projectId: string;
  environment: 'production';
  snapshotId: string;
  physicalAuthority: DatabasePhysicalAuthority;
  timeoutMs: number;
  pollIntervalMs: number;
  lease: LeaseSession;
  sleep: (ms: number) => Promise<void>;
}): Promise<boolean> {
  /*
   * A fixed attempt budget avoids using a worker's wall clock as a safety
   * authority. Ownership itself is renewed and checked against PostgreSQL time.
   */
  const attempts = Math.max(1, Math.ceil(input.timeoutMs / Math.max(1, input.pollIntervalMs)));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await input.lease.renew();

    const status = input.provisioner.backupStatus
      ? await input.provisioner
          .backupStatus({
            projectId: input.projectId,
            environment: input.environment,
            snapshotId: input.snapshotId,
            physicalAuthority: input.physicalAuthority,
          })
          .catch((): { found: boolean; completed: boolean; phase?: string } => ({
            found: false,
            completed: false,
          }))
      : { found: false, completed: false, phase: undefined };
    await input.lease.guard();

    if (status.completed) {
      return true;
    }

    if (status.phase && /failed/i.test(status.phase)) {
      return false;
    }

    if (attempt + 1 < attempts) {
      await input.sleep(input.pollIntervalMs);
    }
  }

  return false;
}

async function finalizeRecoveredExecution(input: {
  lease: LeaseSession;
  applier: SqlApplier;
  connectionString: string;
}): Promise<'COMMITTED' | 'EMPTY' | 'MANUAL_RECOVERY'> {
  const execution = input.lease.execution;

  const inspection = await input.applier.inspect({
    connectionString: input.connectionString,
    lockKey: MIGRATION_LEDGER_SERIALIZATION_LOCK_KEY,
    plan: execution.plan,
  });
  await input.lease.guard();

  if (inspection.status === 'COMPLETE') {
    await input.lease.transition('COMMITTED', {
      release: true,
      appliedStatements: inspection.applied.length,
    });
    return 'COMMITTED';
  }

  if (inspection.status === 'EMPTY') {
    return 'EMPTY';
  }

  await input.lease.transition('MANUAL_RECOVERY', {
    retainLock: true,
    errorCode: `TARGET_${inspection.status}`,
  });

  return 'MANUAL_RECOVERY';
}

export interface RunPublishMigrationInput {
  store: DatabaseMigrationStore;
  provisioner: DatabaseProvisioner;
  applier: SqlApplier;
  projectId: string;
  organizationId: string;
  environment: 'production';
  idempotencyKey: string;
  requestHash: string;
  migrations: DeclaredMigration[];
  connectionString: string;
  engine: string;
  physicalAuthority: DatabasePhysicalAuthority;
  deploymentId?: string;
  createdByUserId?: string;
  backwardCompatible: boolean;
  forwardCompatible: boolean;
  ttlMs?: number;
  renewIntervalMs?: number;
  backupTimeoutMs?: number;
  backupPollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function runPublishMigration(input: RunPublishMigrationInput): Promise<MigrationOutcome> {
  if (input.engine !== 'postgres') {
    return { ok: false, code: 'MIGRATION_ENGINE_UNSUPPORTED', retryable: false };
  }

  if (!input.backwardCompatible) {
    return { ok: false, code: 'MIGRATION_UNSAFE_PLAN', retryable: false };
  }

  const ownerToken = randomUUID();
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const renewIntervalMs = input.renewIntervalMs ?? DEFAULT_RENEW_INTERVAL_MS;
  const plan = input.migrations.map(({ name, sha256: digest }) => ({ name, sha256: digest }));

  const acquire = await input.store.acquireDatabaseMigrationExecution({
    projectId: input.projectId,
    organizationId: input.organizationId,
    environment: input.environment,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    ownerToken,
    ttlMs,
    plan,
    statementsSha256: hashStatements(input.migrations),
    backwardCompatible: input.backwardCompatible,
    forwardCompatible: input.forwardCompatible,
    deploymentId: input.deploymentId,
    createdByUserId: input.createdByUserId,
  });

  if (acquire.kind === 'REPLAYED') {
    return {
      ok: true,
      executionId: acquire.execution.id,
      state: 'COMMITTED',
      replayed: true,
      appliedStatements: acquire.execution.appliedStatements,
    };
  }

  if (acquire.kind === 'IDEMPOTENCY_COLLISION') {
    return {
      ok: false,
      code: 'MIGRATION_IDEMPOTENCY_COLLISION',
      executionId: acquire.execution.id,
      state: acquire.execution.state,
      retryable: false,
    };
  }

  if (acquire.kind === 'BLOCKED') {
    return {
      ok: false,
      code: 'MIGRATION_LOCK_HELD',
      executionId: acquire.execution.id,
      state: acquire.execution.state,
      retryable: true,
    };
  }

  if (acquire.kind === 'FAILED') {
    return {
      ok: false,
      code: 'MIGRATION_PREVIOUS_ATTEMPT_FAILED',
      executionId: acquire.execution.id,
      state: acquire.execution.state,
      retryable: false,
    };
  }

  if (acquire.kind === 'MANUAL_RECOVERY') {
    return {
      ok: false,
      code: 'MIGRATION_MANUAL_RECOVERY',
      executionId: acquire.execution.id,
      state: acquire.execution.state,
      retryable: false,
    };
  }

  const lease = new LeaseSession(input.store, acquire.execution, ownerToken, ttlMs, renewIntervalMs);

  try {
    if (acquire.kind === 'RECOVERY') {
      const recovered = await finalizeRecoveredExecution({
        lease,
        applier: input.applier,
        connectionString: input.connectionString,
      });

      if (recovered === 'COMMITTED') {
        const recoveredExecution = lease.execution;

        if (recoveredExecution.requestHash === input.requestHash) {
          return {
            ok: true,
            executionId: recoveredExecution.id,
            state: 'COMMITTED',
            replayed: true,
            appliedStatements: recoveredExecution.appliedStatements,
          };
        }

        return { ok: false, code: 'MIGRATION_LOCK_HELD', retryable: true };
      }

      if (recovered === 'MANUAL_RECOVERY') {
        return {
          ok: false,
          code: 'MIGRATION_MANUAL_RECOVERY',
          executionId: lease.execution.id,
          state: 'MANUAL_RECOVERY',
          retryable: false,
        };
      }

      if (lease.execution.requestHash !== input.requestHash) {
        await lease.transition('FAILED_SAFE', { release: true, errorCode: 'ABANDONED_EMPTY' });
        return { ok: false, code: 'MIGRATION_LOCK_HELD', retryable: true };
      }

      await lease.transition('LOCK_ACQUIRED');
    }

    const snapshotId = `migration-${lease.execution.id}-a${lease.execution.attempt}`;
    await lease.guard();

    const submitted = await input.provisioner.takeSnapshot({
      projectId: input.projectId,
      organizationId: input.organizationId,
      environment: input.environment,
      snapshotId,
      physicalAuthority: input.physicalAuthority,
    });
    await lease.guard();

    if (!submitted.applied) {
      await lease.transition('FAILED_SAFE', { release: true, errorCode: 'BACKUP_SUBMIT_REFUSED' });
      return {
        ok: false,
        code: 'MIGRATION_BACKUP_UNVERIFIED',
        executionId: lease.execution.id,
        state: 'FAILED_SAFE',
        retryable: false,
      };
    }

    const backupVerified = await waitForVerifiedBackup({
      provisioner: input.provisioner,
      projectId: input.projectId,
      environment: input.environment,
      snapshotId,
      physicalAuthority: input.physicalAuthority,
      timeoutMs: input.backupTimeoutMs ?? DEFAULT_BACKUP_TIMEOUT_MS,
      pollIntervalMs: input.backupPollIntervalMs ?? DEFAULT_BACKUP_POLL_MS,
      lease,
      sleep: input.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    });

    if (!backupVerified) {
      await lease.transition('FAILED_SAFE', { release: true, errorCode: 'BACKUP_NOT_COMPLETED' });
      return {
        ok: false,
        code: 'MIGRATION_BACKUP_UNVERIFIED',
        executionId: lease.execution.id,
        state: 'FAILED_SAFE',
        retryable: false,
      };
    }

    await lease.transition('BACKUP_VERIFIED', {
      backupId: snapshotId,
      backupVerificationMethod: 'cnpg-backup-status-completed',
    });
    await lease.transition('APPLYING');
    lease.startHeartbeat();

    let applied: string[];

    try {
      const result = await input.applier.apply({
        connectionString: input.connectionString,
        lockKey: MIGRATION_LEDGER_SERIALIZATION_LOCK_KEY,
        migrations: input.migrations,
        beforeCommit: () => lease.guard(),
      });
      applied = result.applied;
    } finally {
      await lease.stopHeartbeat();
    }

    await lease.guard();
    await lease.transition('VALIDATING', { appliedStatements: applied.length });

    const inspection = await input.applier.inspect({
      connectionString: input.connectionString,
      lockKey: MIGRATION_LEDGER_SERIALIZATION_LOCK_KEY,
      plan,
    });
    await lease.guard();

    if (inspection.status !== 'COMPLETE') {
      await lease.transition('MANUAL_RECOVERY', {
        retainLock: true,
        errorCode: `POST_COMMIT_${inspection.status}`,
      });
      return {
        ok: false,
        code: 'MIGRATION_MANUAL_RECOVERY',
        executionId: lease.execution.id,
        state: 'MANUAL_RECOVERY',
        retryable: false,
      };
    }

    await lease.transition('COMMITTED', { release: true, appliedStatements: applied.length });

    return {
      ok: true,
      executionId: lease.execution.id,
      state: 'COMMITTED',
      replayed: false,
      appliedStatements: applied.length,
    };
  } catch (error) {
    await lease.stopHeartbeat().catch(() => undefined);

    if (
      error instanceof LeaseLostError ||
      (error instanceof MigrationRolledBackError && error.cause instanceof LeaseLostError)
    ) {
      return {
        ok: false,
        code: 'MIGRATION_LEASE_LOST',
        executionId: lease.execution.id,
        state: lease.execution.state,
        retryable: true,
      };
    }

    if (error instanceof MigrationRolledBackError) {
      await lease
        .transition('FAILED_SAFE', { release: true, errorCode: 'TARGET_TRANSACTION_ROLLED_BACK' })
        .catch(() => undefined);
      return {
        ok: false,
        code: 'MIGRATION_FAILED_SAFE',
        executionId: lease.execution.id,
        state: 'FAILED_SAFE',
        retryable: false,
      };
    }

    const inspected = await input.applier
      .inspect({
        connectionString: input.connectionString,
        lockKey: MIGRATION_LEDGER_SERIALIZATION_LOCK_KEY,
        plan,
      })
      .catch((): MigrationTargetInspection => ({ status: 'UNAVAILABLE', applied: [] }));

    /*
     * COMMIT acknowledgement can be lost after PostgreSQL has durably committed.
     * The exact ledger is authoritative; fence ownership once more before
     * recording the control-plane commit. Never ask the user to rerun SQL that
     * is already fully present on the target.
     */
    if (inspected.status === 'COMPLETE') {
      try {
        await lease.guard();
        await lease.transition('COMMITTED', {
          release: true,
          appliedStatements: inspected.applied.length,
        });
      } catch {
        return {
          ok: false,
          code: 'MIGRATION_LEASE_LOST',
          executionId: lease.execution.id,
          state: lease.execution.state,
          retryable: true,
        };
      }
      return {
        ok: true,
        executionId: lease.execution.id,
        state: 'COMMITTED',
        replayed: true,
        appliedStatements: inspected.applied.length,
      };
    }

    if (inspected.status === 'EMPTY') {
      await lease
        .transition('FAILED_SAFE', { release: true, errorCode: 'TARGET_TRANSACTION_ROLLED_BACK' })
        .catch(() => undefined);
      return {
        ok: false,
        code: 'MIGRATION_FAILED_SAFE',
        executionId: lease.execution.id,
        state: 'FAILED_SAFE',
        retryable: false,
      };
    }

    await lease
      .transition('MANUAL_RECOVERY', { retainLock: true, errorCode: `TARGET_${inspected.status}` })
      .catch(() => undefined);

    return {
      ok: false,
      code: 'MIGRATION_MANUAL_RECOVERY',
      executionId: lease.execution.id,
      state: 'MANUAL_RECOVERY',
      retryable: false,
    };
  }
}
