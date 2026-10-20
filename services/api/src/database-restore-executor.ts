import { randomUUID } from 'node:crypto';
import {
  DatabaseRestoreError,
  type DatabaseRestorePorts,
  type DatabaseRestoreRepository,
  type RestoreCheckpoint,
  type RestoreExecution,
  type RestorePhase,
  type RestoreRequest,
  type RestoreScope,
} from './database-restore-contract.js';
import type { DatabaseInstanceRecord } from './store.js';

const digestPattern = /^[a-f0-9]{64}$/;
const terminal = new Set<RestorePhase>(['COMPLETED', 'FAILED', 'RECOVERY_REQUIRED']);

export class DatabaseRestoreCoordinator {
  constructor(
    private readonly _options: {
      repository: DatabaseRestoreRepository;
      ports: DatabaseRestorePorts;
      encryptConnection: (uri: string) => string;
      decryptConnection: (encrypted: string) => string;
    },
  ) {}

  async available(instance: DatabaseInstanceRecord): Promise<boolean> {
    if (instance.status !== 'ACTIVE') {
      return false;
    }

    return this._options.ports.available(instance).catch(() => false);
  }

  async request(input: RestoreRequest) {
    if (!(await this.available(input.instance))) {
      throw new DatabaseRestoreError('RESTORE_APPLICATION_CUTOVER_UNAVAILABLE', 503);
    }

    if (!Number.isFinite(Date.parse(input.targetTimestamp))) {
      throw new DatabaseRestoreError('RESTORE_TARGET_INVALID', 422);
    }

    if (input.snapshot && input.snapshot.databaseInstanceId !== input.instance.id) {
      throw new DatabaseRestoreError('RESTORE_SOURCE_MISMATCH', 422);
    }

    return this._publicRecord(await this._options.repository.admit(input));
  }

  async evidence(operationId: string) {
    const execution = await this._options.repository.get(operationId);
    return execution ? this._publicRecord(execution) : undefined;
  }

  /** Only unclaimed PENDING work is automatic. Crashed attempts require fencing. */
  async advancePending(limit = 10): Promise<number> {
    const ids = await this._options.repository.pending(limit);

    let advanced = 0;

    for (const id of ids) {
      const token = randomUUID();
      const execution = await this._options.repository.claim(id, token);

      if (!execution) {
        continue;
      }

      advanced += 1;
      await this._run(execution, token);
    }

    return advanced;
  }

  async execute(operationId: string) {
    const token = randomUUID();
    const execution = await this._options.repository.claim(operationId, token);

    if (!execution) {
      return this.evidence(operationId);
    }

    return this._run(execution, token);
  }

  async resume(operationId: string, previousAttemptToken: string) {
    const execution = await this._options.repository.get(operationId);

    if (!execution || !execution.active || execution.runnerToken !== previousAttemptToken) {
      throw new DatabaseRestoreError('RESTORE_ATTEMPT_STALE');
    }

    const nextToken = randomUUID();
    const resumed = await this._options.repository.resume(operationId, previousAttemptToken, nextToken);

    if (!resumed) {
      throw new DatabaseRestoreError('RESTORE_ATTEMPT_STALE');
    }

    const scope = this._scope(resumed, nextToken);

    try {
      for (const excludedToken of resumed.pendingFenceTokens) {
        const fenced = await this._options.ports.fenceAttempt({ ...scope, previousAttemptToken: excludedToken });
        this._assertScope(scope, fenced);

        if (fenced.excludedAttemptToken !== excludedToken) {
          throw new DatabaseRestoreError('RESTORE_RECEIPT_MISMATCH');
        }

        if (!(await this._options.repository.acknowledgeFence(operationId, nextToken, excludedToken))) {
          throw new DatabaseRestoreError('RESTORE_ATTEMPT_STALE');
        }
      }

      const fencedExecution = await this._options.repository.get(operationId);

      if (
        !fencedExecution ||
        fencedExecution.runnerToken !== nextToken ||
        !fencedExecution.active ||
        fencedExecution.pendingFenceTokens.length !== 0
      ) {
        throw new DatabaseRestoreError('RESTORE_FENCE_UNCONFIRMED');
      }

      return this._run(fencedExecution, nextToken);
    } catch {
      await this._options.repository.fail(operationId, nextToken, 'RESTORE_FENCE_UNCONFIRMED');
      return this.evidence(operationId);
    }
  }

  private _publicRecord(execution: RestoreExecution) {
    return {
      ...execution.restore,
      phase: execution.phase,
      failureCode: execution.failureCode,
      applicationCutoverVerified: execution.phase === 'COMPLETED' && Boolean(execution.readback && execution.release),
    };
  }

  private _scope(execution: RestoreExecution, attemptToken: string): RestoreScope {
    return {
      operationId: execution.restore.id,
      instanceId: execution.instance.id,
      projectId: execution.instance.projectId,
      organizationId: execution.instance.organizationId,
      environment: execution.instance.environment,
      attemptToken,
    };
  }

  private _assertScope(expected: RestoreScope, actual: RestoreScope) {
    for (const key of Object.keys(expected) as Array<keyof RestoreScope>) {
      if (actual[key] !== expected[key]) {
        throw new DatabaseRestoreError('RESTORE_RECEIPT_MISMATCH');
      }
    }
  }

  private async _run(initial: RestoreExecution, token: string) {
    const { repository, ports } = this._options;

    let execution = initial;

    const scope = this._scope(execution, token);

    let failureCode = 'RESTORE_EXECUTION_FAILED';

    const checkpoint = async (patch: RestoreCheckpoint) => {
      if (!(await repository.checkpoint(scope.operationId, token, execution.phase, patch))) {
        throw new DatabaseRestoreError('RESTORE_ATTEMPT_STALE');
      }

      const next = await repository.get(scope.operationId);

      if (!next || next.runnerToken !== token) {
        throw new DatabaseRestoreError('RESTORE_ATTEMPT_STALE');
      }

      execution = next;
    };

    try {
      if (execution.pendingFenceTokens.length !== 0) {
        failureCode = 'RESTORE_FENCE_UNCONFIRMED';
        throw new DatabaseRestoreError(failureCode);
      }

      while (!terminal.has(execution.phase)) {
        if (execution.phase === 'PENDING') {
          await checkpoint({ phase: 'VALIDATING' });
        } else if (execution.phase === 'VALIDATING') {
          failureCode = 'RESTORE_ARCHIVE_INVALID';

          const archive = await ports.validateArchive({
            ...scope,
            instance: execution.instance,
            snapshot: execution.snapshot,
            targetTimestamp: execution.restore.targetTimestamp!,
          });
          this._assertScope(scope, archive);

          if (
            !archive.archiveId ||
            !digestPattern.test(archive.manifestSha256) ||
            !digestPattern.test(archive.expectedReadbackSha256) ||
            archive.sourceInstanceId !== scope.instanceId ||
            !archive.sourceSystemIdentifier ||
            archive.targetTimestamp !== execution.restore.targetTimestamp
          ) {
            throw new DatabaseRestoreError('RESTORE_ARCHIVE_INVALID');
          }

          await checkpoint({ phase: 'PREPARING', archive });
        } else if (execution.phase === 'PREPARING') {
          failureCode = 'RESTORE_TARGET_PREPARE_FAILED';

          if (!execution.archive) {
            throw new DatabaseRestoreError('RESTORE_JOURNAL_INVALID');
          }

          const prepared = await ports.prepareTarget({
            ...scope,
            targetId: execution.targetId,
            archive: execution.archive,
            targetTimestamp: execution.restore.targetTimestamp!,
          });
          this._assertScope(scope, prepared);

          if (
            prepared.targetId !== execution.targetId ||
            prepared.systemIdentifier !== execution.archive.sourceSystemIdentifier ||
            !prepared.connectionUri
          ) {
            throw new DatabaseRestoreError('RESTORE_TARGET_MISMATCH');
          }

          // Never persist or return the plaintext URI with the target receipt.
          const { connectionUri, ...target } = prepared;
          await checkpoint({
            phase: 'QUIESCING',
            target,
            targetConnectionEncrypted: this._options.encryptConnection(connectionUri),
          });
        } else if (execution.phase === 'QUIESCING') {
          failureCode = 'RESTORE_QUIESCE_FAILED';

          const quiescence = await ports.quiesceApplication({ ...scope, instance: execution.instance });
          this._assertScope(scope, quiescence);

          if (!quiescence.receiptId) {
            throw new DatabaseRestoreError('RESTORE_RECEIPT_MISMATCH');
          }

          await checkpoint({ phase: 'CUTOVER', quiescence });
        } else if (execution.phase === 'CUTOVER') {
          failureCode = 'RESTORE_BINDING_CHANGED';
          execution = await repository.cutover(scope.operationId, token);
        } else if (execution.phase === 'VERIFYING') {
          failureCode = 'RESTORE_READBACK_FAILED';

          if (
            !execution.target ||
            !execution.archive ||
            !execution.targetConnectionEncrypted ||
            execution.appliedBindingVersion === undefined
          ) {
            throw new DatabaseRestoreError('RESTORE_JOURNAL_INVALID');
          }

          const readback = await ports.reconnectAndReadback({
            ...scope,
            instance: execution.instance,
            target: execution.target,
            connectionUri: this._options.decryptConnection(execution.targetConnectionEncrypted),
            bindingVersion: execution.appliedBindingVersion,
            expectedReadbackSha256: execution.archive.expectedReadbackSha256,
          });
          this._assertScope(scope, readback);

          if (
            !readback.receiptId ||
            readback.targetId !== execution.targetId ||
            readback.systemIdentifier !== execution.target.systemIdentifier ||
            readback.bindingVersion !== execution.appliedBindingVersion ||
            readback.previousPoolClosed !== true ||
            readback.newConnection !== true ||
            readback.observedReadbackSha256 !== execution.archive.expectedReadbackSha256
          ) {
            throw new DatabaseRestoreError('RESTORE_READBACK_MISMATCH');
          }

          await checkpoint({ phase: 'RELEASING', readback });
        } else if (execution.phase === 'RELEASING') {
          failureCode = 'RESTORE_APPLICATION_RELEASE_FAILED';

          if (execution.appliedBindingVersion === undefined || !execution.readback) {
            throw new DatabaseRestoreError('RESTORE_JOURNAL_INVALID');
          }

          const release = await ports.releaseApplication({
            ...scope,
            targetId: execution.targetId,
            bindingVersion: execution.appliedBindingVersion,
          });
          this._assertScope(scope, release);

          if (
            !release.receiptId ||
            release.targetId !== execution.targetId ||
            release.bindingVersion !== execution.appliedBindingVersion
          ) {
            throw new DatabaseRestoreError('RESTORE_RECEIPT_MISMATCH');
          }

          await checkpoint({ phase: 'RELEASING', release });
          execution = await repository.complete(scope.operationId, token);
        } else {
          throw new DatabaseRestoreError('RESTORE_JOURNAL_INVALID');
        }
      }
    } catch (error) {
      // External driver messages may contain a URI/password: persist only a code.
      const code =
        error instanceof DatabaseRestoreError && /^RESTORE_[A-Z0-9_]{1,80}$/.test(error.code)
          ? error.code
          : failureCode;
      await repository.fail(scope.operationId, token, code);

      const current = await repository.get(scope.operationId);

      if (current) {
        execution = current;
      }
    }

    return this._publicRecord(execution);
  }
}
