import { appPublicEnglish } from './app-public-copy.js';
import type { DatabaseInstanceRecord, DatabaseRestoreRecord, DatabaseSnapshotRecord } from './store.js';

export type RestorePhase =
  | 'PENDING'
  | 'VALIDATING'
  | 'PREPARING'
  | 'QUIESCING'
  | 'CUTOVER'
  | 'VERIFYING'
  | 'RELEASING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RECOVERY_REQUIRED';

export interface RestoreScope {
  operationId: string;
  instanceId: string;
  projectId: string;
  organizationId: string;
  environment: 'development' | 'production';
  attemptToken: string;
}

/** Receipts contain identities/digests, never credentials or application rows. */
export interface ArchiveReceipt extends RestoreScope {
  archiveId: string;
  manifestSha256: string;
  sourceInstanceId: string;

  /** Physical PostgreSQL system identifier read from the verified source archive. */
  sourceSystemIdentifier: string;
  targetTimestamp: string;
  expectedReadbackSha256: string;
}

export interface TargetReceipt extends RestoreScope {
  targetId: string;
  systemIdentifier: string;
}

export interface QuiescenceReceipt extends RestoreScope {
  receiptId: string;
}

export interface ReadbackReceipt extends RestoreScope {
  receiptId: string;
  targetId: string;
  bindingVersion: number;
  systemIdentifier: string;
  previousPoolClosed: true;
  newConnection: true;
  observedReadbackSha256: string;
}

export interface ReleaseReceipt extends RestoreScope {
  receiptId: string;
  targetId: string;
  bindingVersion: number;
}

export interface AttemptFenceReceipt extends RestoreScope {
  excludedAttemptToken: string;
}

/**
 * Every mutating port must fence attemptToken and be idempotent for operationId.
 * A default production port is deliberately absent. A healthy database alone
 * cannot implement quiescence, reconnection or application readback.
 */
export interface DatabaseRestorePorts {
  available(instance: DatabaseInstanceRecord): Promise<boolean>;
  validateArchive(
    input: RestoreScope & {
      instance: DatabaseInstanceRecord;
      snapshot?: DatabaseSnapshotRecord;
      targetTimestamp: string;
    },
  ): Promise<ArchiveReceipt>;
  prepareTarget(
    input: RestoreScope & {
      targetId: string;
      archive: ArchiveReceipt;
      targetTimestamp: string;
    },
  ): Promise<TargetReceipt & { connectionUri: string }>;
  quiesceApplication(input: RestoreScope & { instance: DatabaseInstanceRecord }): Promise<QuiescenceReceipt>;

  /** Keep ordinary requests quiesced; only the verification request may read. */
  reconnectAndReadback(
    input: RestoreScope & {
      instance: DatabaseInstanceRecord;
      target: TargetReceipt;
      connectionUri: string;
      bindingVersion: number;
      expectedReadbackSha256: string;
    },
  ): Promise<ReadbackReceipt>;
  releaseApplication(
    input: RestoreScope & {
      targetId: string;
      bindingVersion: number;
    },
  ): Promise<ReleaseReceipt>;

  /**
   * Explicit crash recovery only. Must exclude/stop the previous attempt before
   * acknowledging the new token; expiry or process silence is not sufficient.
   * Calls may repeat after a lost acknowledgement. The coordinator preserves
   * and excludes every unconfirmed predecessor before making further effects.
   */
  fenceAttempt(input: RestoreScope & { previousAttemptToken: string }): Promise<AttemptFenceReceipt>;
}

export interface RestoreExecution {
  restore: DatabaseRestoreRecord;
  instance: DatabaseInstanceRecord;
  phase: RestorePhase;
  resumePhase?: RestorePhase;
  runnerToken?: string;
  /** Durable exclusion debt, including predecessors of crashed recovery attempts. */
  pendingFenceTokens: string[];
  active: boolean;
  expectedBindingVersion: number;
  appliedBindingVersion?: number;
  targetId: string;
  snapshot?: DatabaseSnapshotRecord;
  archive?: ArchiveReceipt;
  target?: TargetReceipt;
  quiescence?: QuiescenceReceipt;
  readback?: ReadbackReceipt;
  release?: ReleaseReceipt;

  /** Internal only: never project these fields onto HTTP output or logs. */
  targetConnectionEncrypted?: string;
  failureCode?: string;
}

export interface RestoreRequest {
  instance: DatabaseInstanceRecord;
  snapshot?: DatabaseSnapshotRecord;
  targetTimestamp: string;
  requestedByUserId?: string;
}

export interface RestoreCheckpoint {
  phase: RestorePhase;
  archive?: ArchiveReceipt;
  target?: TargetReceipt;
  targetConnectionEncrypted?: string;
  quiescence?: QuiescenceReceipt;
  readback?: ReadbackReceipt;
  release?: ReleaseReceipt;
}

export interface DatabaseRestoreRepository {
  admit(input: RestoreRequest): Promise<RestoreExecution>;
  get(operationId: string): Promise<RestoreExecution | undefined>;
  pending(limit: number): Promise<string[]>;
  claim(operationId: string, attemptToken: string): Promise<RestoreExecution | undefined>;
  checkpoint(operationId: string, attemptToken: string, from: RestorePhase, patch: RestoreCheckpoint): Promise<boolean>;
  cutover(operationId: string, attemptToken: string): Promise<RestoreExecution>;
  complete(operationId: string, attemptToken: string): Promise<RestoreExecution>;
  fail(operationId: string, attemptToken: string, code: string): Promise<void>;
  resume(operationId: string, previousToken: string, nextToken: string): Promise<RestoreExecution | undefined>;
  acknowledgeFence(operationId: string, attemptToken: string, excludedToken: string): Promise<boolean>;
}

export class DatabaseRestoreError extends Error {
  readonly publicMessage?: string;

  constructor(
    readonly code: string,
    readonly statusCode = 409,
  ) {
    super(code);
    this.name = 'DatabaseRestoreError';

    if (
      code === 'RESTORE_TARGET_LIFECYCLE_UNAVAILABLE' ||
      code === 'RESTORE_BACKUP_TARGET_UNAVAILABLE' ||
      code === 'RESTORE_ADMISSION_BUSY'
    ) {
      this.publicMessage = appPublicEnglish(code);
    }
  }
}
