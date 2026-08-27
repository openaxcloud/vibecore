import { randomUUID } from 'node:crypto';
import { promises as dnsPromises } from 'node:dns';
import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
import { hashToken } from '@vibecore/auth';
import type { PlanKey, QuotaKey } from '@vibecore/billing';
import { createDatabaseClient, Prisma, type DatabaseClient } from '@vibecore/database';
import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
import { appPublicEnglish } from './app-public-copy.js';
import { LedgerStore } from './ledger-store.js';
import { AccountPurgeStore, type AccountPurgeLeaseOptions } from './account-purge-store.js';
import type { PurgeStorageDeps } from './account-purge.js';
import { isCommittedPromotionForTenant, SERVER_IMAGE_RELEASE_AUDIT_ACTION } from './server-image-promotion.js';
import {
  canonicalizeProjectManifest,
  createDefaultProjectManifest,
  projectManifestSnapshotPin,
  projectManifestForClone,
  projectManifestDigest,
  readProjectManifestSnapshotPin,
  verifyStoredProjectManifestRevision,
  type ProjectManifest,
  type ProjectManifestCloneMode,
} from './project-manifest.js';
import { slugify } from './slugify.js';
import { countActiveModerationStrikes } from './strike-system.js';
import { API_KEY_SCOPES, DEFAULT_ENV_VAR_SCOPE, ENV_VAR_SCOPES } from './store.js';
import type {
  AbuseEventRecord,
  SecurityEventResolutionRecord,
  AgentPatchProposalRecord,
  AgentRepairEventRecord,
  AgentRepairOutcome,
  AgentPatchProposalStatus,
  ConsensusRecordSummary,
  ConsensusRecordDetail,
  ConsensusClaimVote,
  ConsensusConflict,
  ConsensusConsolidated,
  ApiKeyRecord,
  ApiKeyScope,
  ApiStore,
  AiCostLedgerRecord,
  AiConversationRecord,
  IntegrationFeatureRequestRecord,
  ImportCreditReservationRecord,
  ImportJobRecord,
  ImportJobTransitionPatch,
  ImportStagedFile,
  RemixJobRecord,
  RemixJobTransitionPatch,
  RemixStorageShareRecord,
  AiMessageFeedbackRecord,
  AiMessageFeedbackVote,
  NotificationRecord,
  AiMessageRecord,
  AiTokenUsageRecord,
  AiToolCallRecord,
  AgentCheckpointRecord,
  BillingCustomerRecord,
  BillingPlanRecord,
  CheckpointStatus,
  CreditEntryKind,
  CreditLedgerRecord,
  CreditPackRecord,
  CreditWalletRecord,
  ModelConfigRecord,
  ProviderConfigRecord,
  CollaborationCommentRecord,
  CollaborationGroupMemberRecord,
  CollaborationGroupRecord,
  CollaborationPresenceRecord,
  CustomRoleRecord,
  DeploymentRecord,
  ReleaseManifestRecord,
  ServerImageReleaseCommitInput,
  ServerImageReleaseCommitResult,
  DomainVerificationRecord,
  EmailDeliveryEventRecord,
  EnterpriseSettingsRecord,
  FeatureFlagRecord,
  MembershipRecord,
  ResourceAccessGrantRecord,
  OAuthConnectionRecord,
  OrganizationRecord,
  OrganizationInviteRecord,
  ProjectActivityListOptions,
  ProjectActivityRecord,
  ProjectCollaboratorRecord,
  ProjectConnectionLinkRecord,
  ReconnectionAlertRecord,
  EnvVarScope,
  ProjectEnvironmentRecord,
  ProjectIdeStateRecord,
  ProjectManifestRevisionRecord,
  ProjectRecord,
  ProjectSecretRecord,
  ProjectShareLinkRecord,
  ChatShareRecord,
  ProjectStorageObjectRecord,
  ProjectTemplateRecord,
  DatabaseInstanceRecord,
  DatabaseSnapshotRecord,
  DatabaseRestoreRecord,
  DatabaseMigrationExecutionRecord,
  DatabaseMigrationState,
  GalleryListingRecord,
  RecoveryCodeRecord,
  RuntimeWebSocketTicketRecord,
  ScimTokenRecord,
  SessionRecord,
  SiemWebhookRecord,
  SnapshotRecord,
  StripeEventRecord,
  StripeWebhookFailureRecord,
  SubscriptionRecord,
  SsoConfigRecord,
  SupportTicketRecord,
  TicketMessageRecord,
  SystemSettingRecord,
  UserConnectionRecord,
  UserConnectionStatus,
  UserRecord,
  UsageEventRecord,
  WorkspaceIdeStateRecord,
  WorkspaceRecord,
  QuotaOverrideRecord,
  AdminAuditLogRecord,
  InstalledSkillRecord,
  InstalledSkillScope,
  InstallSkillInput,
  SkillAuditEventRecord,
  RecordSkillAuditInput,
} from './store.js';

const SERVER_RELEASE_PROMOTION_NOT_COMMITTED = 'SERVER_RELEASE_PROMOTION_NOT_COMMITTED';
const SERVER_RELEASE_MANIFEST_CONFLICT = 'SERVER_RELEASE_MANIFEST_CONFLICT';
const SERVER_RELEASE_MANIFEST_WITHOUT_READY = 'SERVER_RELEASE_MANIFEST_WITHOUT_READY';

const RUNTIME_WEBSOCKET_TICKET_INSERT_EMPTY = 'RUNTIME_WEBSOCKET_TICKET_INSERT_EMPTY';
const DB_MIGRATION_STATE_CORRUPT = 'DB_MIGRATION_STATE_CORRUPT';
const DB_MIGRATION_PLAN_CORRUPT = 'DB_MIGRATION_PLAN_CORRUPT';
const DB_MIGRATION_EXECUTION_INSERT_EMPTY = 'DB_MIGRATION_EXECUTION_INSERT_EMPTY';
const COLLABORATION_REASON = {
  membershipNotActive: 'MEMBERSHIP_NOT_ACTIVE',
  groupNotFound: 'GROUP_NOT_FOUND',
  groupManualOnly: 'GROUP_MANUAL_ONLY',
  groupScimManaged: 'GROUP_SCIM_MANAGED',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
  activeGrantConflict: 'ACTIVE_GRANT_CONFLICT',
  grantNotActive: 'GRANT_NOT_ACTIVE',
  grantNotFound: 'GRANT_NOT_FOUND',
  grantSubjectMismatch: 'GRANT_SUBJECT_MISMATCH',
  grantExpired: 'GRANT_EXPIRED',
  grantNotPending: 'GRANT_NOT_PENDING',
} as const;

function now() {
  return new Date().toISOString();
}

function toIso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : undefined;
}

async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS "now"`;
  const value = rows[0]?.now;

  if (!(value instanceof Date)) {
    throw new Error(appPublicEnglish('DATABASE_TIME_UNAVAILABLE'));
  }

  return value;
}

function databaseLeaseExpiry(now: Date, durationMs: number): Date {
  const bounded = Math.max(1_000, Math.min(Math.trunc(durationMs), 30 * 60_000));
  return new Date(now.getTime() + bounded);
}

function databaseDeadline(now: Date, durationMs: number, maximumMs = 24 * 60 * 60_000): Date {
  if (!Number.isFinite(durationMs) || durationMs < 1_000 || durationMs > maximumMs) {
    throw new TypeError('INVALID_DATABASE_DEADLINE_DURATION');
  }

  return new Date(now.getTime() + Math.trunc(durationMs));
}

type DatabaseMigrationRow = {
  id: string;
  projectId: string;
  organizationId: string;
  environment: string;
  state: string;
  idempotencyKey: string;
  requestHash: string;
  activeLock: string | null;
  ownerToken: string | null;
  version: number;
  leaseExpiresAt: Date | null;
  attempt: number;
  plan: unknown;
  statementsSha256: string;
  statementCount: number;
  appliedStatements: number;
  backwardCompatible: boolean;
  forwardCompatible: boolean;
  backupId: string | null;
  backupVerifiedAt: Date | null;
  backupVerificationMethod: string | null;
  deploymentId: string | null;
  createdByUserId: string | null;
  errorCode: string | null;
  startedAt: Date;
  completedAt: Date | null;
  leaseLive?: boolean;
};

const DATABASE_MIGRATION_STATES = new Set<DatabaseMigrationState>([
  'LOCK_ACQUIRED',
  'BACKUP_VERIFIED',
  'APPLYING',
  'VALIDATING',
  'RECOVERING',
  'COMMITTED',
  'FAILED_SAFE',
  'MANUAL_RECOVERY',
]);

function mapDatabaseMigrationExecution(row: DatabaseMigrationRow): DatabaseMigrationExecutionRecord {
  if (!DATABASE_MIGRATION_STATES.has(row.state as DatabaseMigrationState)) {
    throw new Error(DB_MIGRATION_STATE_CORRUPT);
  }
  if (!Array.isArray(row.plan) || row.plan.length !== row.statementCount) {
    throw new Error(DB_MIGRATION_PLAN_CORRUPT);
  }
  const plan = row.plan.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(DB_MIGRATION_PLAN_CORRUPT);
    }
    const item = entry as Record<string, unknown>;
    if (typeof item.name !== 'string' || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw new Error(DB_MIGRATION_PLAN_CORRUPT);
    }
    return { name: item.name, sha256: item.sha256 };
  });
  return {
    id: row.id,
    projectId: row.projectId,
    organizationId: row.organizationId,
    environment: row.environment,
    state: row.state as DatabaseMigrationState,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    activeLock: row.activeLock ?? undefined,
    ownerToken: row.ownerToken ?? undefined,
    version: row.version,
    leaseExpiresAt: toIso(row.leaseExpiresAt),
    attempt: row.attempt,
    plan,
    statementsSha256: row.statementsSha256,
    statementCount: row.statementCount,
    appliedStatements: row.appliedStatements,
    backwardCompatible: row.backwardCompatible,
    forwardCompatible: row.forwardCompatible,
    backupId: row.backupId ?? undefined,
    backupVerifiedAt: toIso(row.backupVerifiedAt),
    backupVerificationMethod: row.backupVerificationMethod ?? undefined,
    deploymentId: row.deploymentId ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    errorCode: row.errorCode ?? undefined,
    startedAt: row.startedAt.toISOString(),
    completedAt: toIso(row.completedAt),
  };
}

function normalizeCollaborationGroupName(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

/** Parse a JSON column that should hold an array; tolerate null/garbage → []. */
function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

type PrismaKnownRequestError = Error & { readonly code: string };

/**
 * Prisma's generated error constructor is a runtime value whose declaration can
 * lose its construct signature across workspace module-resolution boundaries.
 * Keep the runtime identity check while giving catch variables an explicit,
 * stable narrowing from `unknown` before their Prisma code is inspected.
 */
function isPrismaKnownRequestError(error: unknown): error is PrismaKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

function mapImportJob(row: any): ImportJobRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    actorUserId: row.actorUserId ?? undefined,
    provider: row.provider,
    state: row.state,
    sourceRef: row.sourceRef ?? undefined,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    findings: row.findings ?? undefined,
    consent: row.consent ?? undefined,
    targetProjectId: row.targetProjectId ?? undefined,
    stagedFileCount: row.stagedFileCount,
    redactedCount: row.redactedCount,
    creditsReserved: row.creditsReserved,
    version: row.version,
    operationToken: row.operationToken ?? undefined,
    operationExpiresAt: toIso(row.operationExpiresAt),
    cleanupTerminalState: row.cleanupTerminalState ?? undefined,
    error: row.error ?? undefined,
    expiresAt: toIso(row.expiresAt),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function mapImportReservation(row: any): ImportCreditReservationRecord {
  return {
    key: row.key,
    organizationId: row.organizationId,
    importJobId: row.importJobId,
    reservedCredits: row.reservedCredits,
    debitedCredits: row.debitedCredits,
    state: row.state as ImportCreditReservationRecord['state'],
    version: row.version,
  };
}

const IMPORT_LEDGER_CURRENCY = 'credits';

function importLedgerReservationKey(idempotencyKey: string): string {
  return `import:${idempotencyKey}`;
}

function importCreditsToMinor(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw Object.assign(new Error(appPublicEnglish('IMPORT_COMMIT_OWNERSHIP_LOST')), {
      statusCode: 409,
      code: 'IMPORT_CREDIT_AMOUNT_INVALID',
    });
  }

  return BigInt(value);
}

function importCreditsFromMinor(value: bigint | null): number {
  if (value === null || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw Object.assign(new Error(appPublicEnglish('IMPORT_COMMIT_OWNERSHIP_LOST')), {
      statusCode: 409,
      code: 'IMPORT_CREDIT_AMOUNT_INVALID',
    });
  }

  return Number(value);
}

function mapCanonicalImportReservation(
  row: {
    status: string;
    maxAmountMinor: bigint;
    committedMinor: bigint | null;
    version: number;
    importJobId: string | null;
    organizationId: string;
  },
  idempotencyKey: string,
): ImportCreditReservationRecord {
  if (!row.importJobId) {
    throw Object.assign(new Error(appPublicEnglish('IMPORT_COMMIT_OWNERSHIP_LOST')), {
      statusCode: 409,
      code: 'IMPORT_LEDGER_LINK_MISSING',
    });
  }

  const state: ImportCreditReservationRecord['state'] =
    row.status === 'ACTIVE' ? 'RESERVED' : row.status === 'COMMITTED' ? 'SETTLED' : 'COMPENSATED';

  return {
    key: idempotencyKey,
    organizationId: row.organizationId,
    importJobId: row.importJobId,
    reservedCredits: importCreditsFromMinor(row.maxAmountMinor),
    debitedCredits: state === 'SETTLED' ? importCreditsFromMinor(row.committedMinor) : 0,
    state,
    version: row.version,
  };
}

function mapRemixJob(row: any): RemixJobRecord {
  return {
    id: row.id,
    sourceProjectId: row.sourceProjectId,
    targetProjectId: row.targetProjectId ?? undefined,
    organizationId: row.organizationId,
    actorUserId: row.actorUserId ?? undefined,
    state: row.state,
    idempotencyKey: row.idempotencyKey ?? undefined,
    requestHash: row.requestHash ?? undefined,
    version: row.version,
    detachedKeys: row.detachedKeys ?? undefined,
    storagePolicy: row.storagePolicy,
    storageConsentVersion: row.storageConsentVersion ?? undefined,
    storageInventory: row.storageInventory ?? undefined,
    storageShareId: row.storageShareId ?? undefined,
    scanFindings: row.scanFindings ?? undefined,
    scrubbedCount: row.scrubbedCount,
    dbForked: row.dbForked,
    sourceSnapshotId: row.sourceSnapshotId ?? undefined,
    sourceSnapshotHash: row.sourceSnapshotHash ?? undefined,
    sourceListingId: row.sourceListingId ?? undefined,
    licenseSnapshot: row.licenseSnapshot ?? undefined,
    consentVersion: row.consentVersion ?? undefined,
    piiFindings: row.piiFindings ?? undefined,
    piiMaskedCount: row.piiMaskedCount,
    sourceDatabasePin: row.sourceDatabasePin ?? undefined,
    targetDatabaseInstanceId: row.targetDatabaseInstanceId ?? undefined,
    operationToken: row.operationToken ?? undefined,
    operationExpiresAt: toIso(row.operationExpiresAt),
    cleanupTerminalState: row.cleanupTerminalState ?? undefined,
    errorCode: row.errorCode ?? undefined,
    error: row.error ?? undefined,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function remixTransitionData(patch: RemixJobTransitionPatch | undefined): Prisma.RemixJobUpdateManyMutationInput {
  if (!patch) {
    return {};
  }

  const json = (value: unknown) => value as Prisma.InputJsonValue;

  return {
    ...(patch.targetProjectId !== undefined ? { targetProjectId: patch.targetProjectId } : {}),
    ...(patch.sourceSnapshotId !== undefined ? { sourceSnapshotId: patch.sourceSnapshotId } : {}),
    ...(patch.sourceSnapshotHash !== undefined ? { sourceSnapshotHash: patch.sourceSnapshotHash } : {}),
    ...(patch.detachedKeys !== undefined ? { detachedKeys: json(patch.detachedKeys) } : {}),
    ...(patch.scanFindings !== undefined ? { scanFindings: json(patch.scanFindings) } : {}),
    ...(patch.scrubbedCount !== undefined ? { scrubbedCount: patch.scrubbedCount } : {}),
    ...(patch.dbForked !== undefined ? { dbForked: patch.dbForked } : {}),
    ...(patch.storageConsentVersion !== undefined ? { storageConsentVersion: patch.storageConsentVersion } : {}),
    ...(patch.storageInventory !== undefined ? { storageInventory: json(patch.storageInventory) } : {}),
    ...(patch.storageShareId !== undefined ? { storageShareId: patch.storageShareId } : {}),
    ...(patch.sourceDatabasePin !== undefined ? { sourceDatabasePin: json(patch.sourceDatabasePin) } : {}),
    ...(patch.targetDatabaseInstanceId !== undefined
      ? { targetDatabaseInstanceId: patch.targetDatabaseInstanceId }
      : {}),
    ...(patch.sourceListingId !== undefined ? { sourceListingId: patch.sourceListingId } : {}),
    ...(patch.piiFindings !== undefined ? { piiFindings: json(patch.piiFindings) } : {}),
    ...(patch.piiMaskedCount !== undefined ? { piiMaskedCount: patch.piiMaskedCount } : {}),
    ...(patch.operationToken !== undefined ? { operationToken: patch.operationToken } : {}),
    ...(patch.operationExpiresAt !== undefined
      ? { operationExpiresAt: patch.operationExpiresAt ? new Date(patch.operationExpiresAt) : null }
      : {}),
    ...(patch.cleanupTerminalState !== undefined ? { cleanupTerminalState: patch.cleanupTerminalState } : {}),
    ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
    ...(patch.error !== undefined ? { error: patch.error } : {}),
  };
}

function mapRemixStorageShare(row: any): RemixStorageShareRecord {
  return {
    id: row.id,
    sourceProjectId: row.sourceProjectId,
    targetProjectId: row.targetProjectId,
    sourceOrganizationId: row.sourceOrganizationId,
    targetOrganizationId: row.targetOrganizationId,
    consentVersion: row.consentVersion,
    consentedByUserId: row.consentedByUserId ?? undefined,
    consentedAt: toIso(row.consentedAt)!,
    sourceInventory: row.sourceInventory,
    state: row.state,
    revokedAt: toIso(row.revokedAt),
  };
}

function importStagedFiles(value: unknown): ImportStagedFile[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const files: ImportStagedFile[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return undefined;
    }

    const record = item as Record<string, unknown>;

    if (typeof record.path !== 'string' || typeof record.content !== 'string') {
      return undefined;
    }

    files.push({
      path: record.path,
      content: record.content,
      ...(typeof record.encoding === 'string' ? { encoding: record.encoding } : {}),
    });
  }

  return files;
}

function importTransitionData(patch: ImportJobTransitionPatch | undefined): Prisma.ImportJobUpdateManyMutationInput {
  if (!patch) {
    return {};
  }

  return {
    ...(patch.sourceRef !== undefined ? { sourceRef: patch.sourceRef } : {}),
    ...(patch.findings !== undefined ? { findings: patch.findings as Prisma.InputJsonValue } : {}),
    ...(patch.consent !== undefined ? { consent: patch.consent as Prisma.InputJsonValue } : {}),
    ...(patch.targetProjectId !== undefined ? { targetProjectId: patch.targetProjectId } : {}),
    ...(patch.stagedFiles !== undefined ? { stagedFiles: patch.stagedFiles as unknown as Prisma.InputJsonValue } : {}),
    ...(patch.connectorPreview !== undefined
      ? { connectorPreview: patch.connectorPreview as Prisma.InputJsonValue }
      : {}),
    ...(patch.stagedFileCount !== undefined ? { stagedFileCount: patch.stagedFileCount } : {}),
    ...(patch.redactedCount !== undefined ? { redactedCount: patch.redactedCount } : {}),
    ...(patch.creditsReserved !== undefined ? { creditsReserved: patch.creditsReserved } : {}),
    ...(patch.operationToken !== undefined ? { operationToken: patch.operationToken } : {}),
    ...(patch.operationExpiresAt !== undefined
      ? { operationExpiresAt: patch.operationExpiresAt ? new Date(patch.operationExpiresAt) : null }
      : {}),
    ...(patch.cleanupTerminalState !== undefined ? { cleanupTerminalState: patch.cleanupTerminalState } : {}),
    ...(patch.error !== undefined ? { error: patch.error } : {}),
  };
}

// Database point-in-time rollback (Phase-1 scaffold) row → record mappers.
// sizeBytes is a Postgres BIGINT (Prisma `bigint`); narrow to number for the API.
function mapDatabaseInstance(row: {
  id: string;
  projectId: string;
  organizationId: string;
  environment: string;
  status: DatabaseInstanceRecord['status'];
  engine: string;
  region: string | null;
  sizeBytes: bigint;
  retentionDays: number;
  pitrEnabled: boolean;
  provisioningDeadlineAt: Date | null;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): DatabaseInstanceRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    organizationId: row.organizationId,
    environment: row.environment === 'production' ? 'production' : 'development',
    status: row.status,
    engine: row.engine,
    region: row.region ?? undefined,
    sizeBytes: Number(row.sizeBytes),
    retentionDays: row.retentionDays,
    pitrEnabled: row.pitrEnabled,
    provisioningDeadlineAt: toIso(row.provisioningDeadlineAt),
    lastErrorCode: row.lastErrorCode ?? undefined,
    lastErrorAt: toIso(row.lastErrorAt),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function mapDatabaseSnapshot(row: {
  id: string;
  databaseInstanceId: string;
  kind: string;
  label: string | null;
  lsn: string | null;
  sizeBytes: bigint;
  storageKey: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  expiresAt: Date | null;
}): DatabaseSnapshotRecord {
  return {
    id: row.id,
    databaseInstanceId: row.databaseInstanceId,
    kind: row.kind === 'manual' ? 'manual' : 'auto',
    label: row.label ?? undefined,
    lsn: row.lsn ?? undefined,
    sizeBytes: Number(row.sizeBytes),
    storageKey: row.storageKey ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    createdAt: toIso(row.createdAt)!,
    expiresAt: toIso(row.expiresAt),
  };
}

function mapDatabaseRestore(row: {
  id: string;
  databaseInstanceId: string;
  snapshotId: string | null;
  targetTimestamp: Date | null;
  status: DatabaseRestoreRecord['status'];
  requestedByUserId: string | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}): DatabaseRestoreRecord {
  return {
    id: row.id,
    databaseInstanceId: row.databaseInstanceId,
    snapshotId: row.snapshotId ?? undefined,
    targetTimestamp: toIso(row.targetTimestamp),
    status: row.status,
    requestedByUserId: row.requestedByUserId ?? undefined,
    error: row.error ?? undefined,
    createdAt: toIso(row.createdAt)!,
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
  };
}

function projectSlugBase(input: { slug?: string; name: string }) {
  return slugify(input.slug || input.name) || 'project';
}

function assertFound<T>(value: T | null | undefined, message: string, code: string): T {
  if (!value) {
    throw Object.assign(new Error(message), { statusCode: 404, code });
  }

  return value;
}

export class PrismaApiStore implements ApiStore {
  constructor(
    readonly prisma: DatabaseClient = createDatabaseClient(),

    /**
     * DNS TXT resolver used by {@link verifyDomain}. Injectable so tests can
     * exercise domain verification without hitting real DNS; defaults to the
     * Node resolver in production.
     */
    private readonly resolveTxt: (hostname: string) => Promise<string[][]> = dnsPromises.resolveTxt,
    private readonly accountPurgeLease?: AccountPurgeLeaseOptions,
  ) {}

  #accountPurge?: AccountPurgeStore;

  private get accountPurge(): AccountPurgeStore {
    this.#accountPurge ??= new AccountPurgeStore(this.prisma, this.accountPurgeLease);
    return this.#accountPurge;
  }

  async ping(): Promise<void> {
    // Trivial round-trip to confirm the database connection is live.
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async withSerializedMutation<T>(
    key: string,
    fn: () => Promise<T>,
    options?: { transactionTimeoutMs?: number },
  ): Promise<T> {
    /*
     * Hold a transaction-scoped advisory lock for the duration of `fn`. A second
     * caller with the same key blocks on pg_advisory_xact_lock until this
     * transaction commits, so the wrapped check-then-mutate runs serially across
     * all pods. `fn`'s own queries use the MAIN pooled client and observe
     * committed state because the prior holder commits before the lock is granted.
     *
     * The lock transaction runs on a SMALL DEDICATED pool, not the main query
     * pool. Otherwise, under same-key burst >= mainPoolMax, every waiter would sit
     * inside its transaction holding a main-pool connection while blocked on the
     * advisory lock — starving the lock holder's fn() of a connection and
     * deadlocking the pool. Isolating lock-wait connections keeps the main pool
     * free for fn() (only one fn runs at a time, so it needs just one connection).
     */
    return this.lockClient.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', key);
        return fn();
      },
      options?.transactionTimeoutMs
        ? {
            timeout: Math.max(30_000, Math.min(options.transactionTimeoutMs, 2 * 60 * 60 * 1_000)),
          }
        : undefined,
    );
  }

  /*
   * Lazily-created dedicated client for advisory-lock transactions (see
   * withSerializedMutation). Small pool: it only ever holds lock-wait/holder
   * connections, which are serialized by the lock itself.
   */
  private get lockClient(): DatabaseClient {
    if (!this.#lockClient) {
      this.#lockClient = createDatabaseClient({ poolMax: 5 });
    }

    return this.#lockClient;
  }

  #lockClient?: DatabaseClient;

  /** Release both pools during controlled shutdowns and real-Postgres tests. */
  async disconnect(): Promise<void> {
    const clients = [this.prisma, this.#lockClient].filter(Boolean) as DatabaseClient[];
    this.#lockClient = undefined;
    await Promise.all(clients.map((client) => client.$disconnect()));
  }

  async createUser(input: {
    email: string;
    name?: string;
    passwordHash: string;
    platformAdmin?: boolean;
    language?: string;
  }): Promise<UserRecord> {
    return mapUser(
      await this.prisma.user.create({
        data: {
          email: input.email.toLowerCase(),
          name: input.name,
          passwordHash: input.passwordHash,
          platformAdmin: input.platformAdmin,
          language: input.language,
        },
      }),
    );
  }

  async updateUser(input: {
    userId: string;
    email?: string;
    name?: string;
    passwordHash?: string;
    emailVerifiedAt?: string | null;
    mfaEnabled?: boolean;
    mfaSecretEncrypted?: string;
    platformAdmin?: boolean;
    language?: string | null;
    timezone?: string | null;
    preferences?: Record<string, unknown> | null;
  }) {
    return mapUser(
      await this.prisma.user.update({
        where: { id: input.userId },
        data: {
          email: input.email?.toLowerCase(),
          name: input.name,
          passwordHash: input.passwordHash,

          /*
           * `emailVerifiedAt: null` clears verification (e.g. when the user
           * changes their email and must re-verify the new address); a string
           * sets it; `undefined` leaves the column untouched. A bare falsy
           * check previously made `null` indistinguishable from "skip".
           */
          emailVerifiedAt:
            input.emailVerifiedAt === undefined
              ? undefined
              : input.emailVerifiedAt === null
                ? null
                : new Date(input.emailVerifiedAt),
          mfaEnabled: input.mfaEnabled,
          mfaSecretCiphertext: input.mfaSecretEncrypted,
          platformAdmin: input.platformAdmin,

          /*
           * `language: null` clears the column (Prisma differentiates null
           * from undefined: undefined skips the field, null writes NULL).
           * The undefined case is the no-op we want when the caller didn't
           * mention language at all. Same convention for `timezone`.
           */
          language: input.language === undefined ? undefined : input.language,
          timezone: input.timezone === undefined ? undefined : input.timezone,

          /*
           * Json columns need Prisma's sentinel to write a NULL: a bare
           * `null` is ambiguous (JSON null vs SQL NULL), so we map `null` →
           * Prisma.DbNull to clear and skip on undefined. The caller is
           * responsible for shallow-merging before passing an object — this
           * write replaces the whole blob.
           */
          preferences:
            input.preferences === undefined
              ? undefined
              : input.preferences === null
                ? Prisma.DbNull
                : (input.preferences as Prisma.InputJsonValue),
        },
      }),
    );
  }

  async deleteUser(userId: string) {
    try {
      await this.prisma.user.delete({ where: { id: userId } });

      return true;
    } catch (error) {
      /*
       * Only a genuine not-found (P2025 — the row was already gone) is a benign
       * `false` that callers treat as a no-op. Every other failure mode (FK
       * violation P2003 from undeleted child rows, connection error, deadlock)
       * means erasure is BLOCKED, not absent: collapsing those into `false`
       * would let GDPR/data-deletion breakage stay invisible in production.
       * Rethrow so the failure is observable to callers and operators.
       */
      if (isPrismaKnownRequestError(error) && error.code === 'P2025') {
        return false;
      }

      throw error;
    }
  }

  previewAccountPurge(userId: string) {
    return this.accountPurge.preview(userId);
  }

  requestAccountDeletion(userId: string) {
    return this.accountPurge.requestDeletion(userId);
  }

  cancelAccountDeletion(userId: string) {
    return this.accountPurge.cancelDeletion(userId);
  }

  purgeUserAccount(input: { userId: string; correlationId?: string }, deps: PurgeStorageDeps) {
    return this.accountPurge.purge(input, deps);
  }

  reconcilePurgeFreezes() {
    return this.accountPurge.reconcile();
  }

  isObjectStorageProjectPurgeFrozen(projectId: string) {
    return this.accountPurge.isObjectStorageFrozen(projectId);
  }

  withObjectStorageProjectMutation<T>(projectId: string, effect: () => Promise<T>) {
    return this.accountPurge.withObjectStorageMutation(projectId, effect);
  }

  withObjectStorageProjectMutations<T>(projectIds: string[], effect: () => Promise<T>) {
    return this.accountPurge.withObjectStorageMutations(projectIds, effect);
  }

  hasPurgeReceipt(userId: string) {
    return this.accountPurge.hasReceipt(userId);
  }

  async findUserByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return user ? mapUser(user) : undefined;
  }

  async findUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? mapUser(user) : undefined;
  }

  async touchUserActivity(userId: string, nowMs?: number) {
    const at = new Date(Number.isFinite(nowMs) ? (nowMs as number) : Date.now());
    try {
      // updateMany so a deleted user is a no-op (count 0) rather than a P2025 throw.
      const result = await this.prisma.user.updateMany({ where: { id: userId }, data: { lastActiveAt: at } });
      return result.count > 0 ? at.toISOString() : null;
    } catch {
      return null;
    }
  }

  async listInactiveUserCandidates(input: { cutoffMs: number; take?: number }) {
    const cutoff = new Date(input.cutoffMs);
    const take = Math.max(1, Math.min(input.take ?? 500, 5000));
    // Active reference = lastActiveAt, falling back to createdAt for accounts
    // never touched. Both branches must be older than the cutoff.
    const users = await this.prisma.user.findMany({
      where: {
        OR: [{ lastActiveAt: { lt: cutoff } }, { AND: [{ lastActiveAt: null }, { createdAt: { lt: cutoff } }] }],
      },
      select: { id: true, email: true, lastActiveAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take,
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      lastActiveAtMs: (user.lastActiveAt ?? user.createdAt).getTime(),
    }));
  }

  async createSession(input: {
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
    impersonatedBy?: string;
  }) {
    return mapSession(
      await this.prisma.session.create({
        data: {
          userId: input.userId,
          tokenHash: hashToken(input.token),
          expiresAt: input.expiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          impersonatedBy: input.impersonatedBy,
        },
      }),
    );
  }

  async findSessionByToken(token: string) {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });

    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      return undefined;
    }

    return mapSession(session);
  }

  async listSessions(userId: string) {
    return (
      await this.prisma.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      })
    ).map(mapSession);
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeAllSessions(userId: string, exceptSessionId?: string) {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, id: exceptSessionId ? { not: exceptSessionId } : undefined },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async markSessionReauthenticated(sessionId: string) {
    /*
     * The interface returns SessionRecord | undefined, so a vanished session must
     * resolve to undefined rather than crash. update({ where: { id } }) throws an
     * unhandled P2025 when the row was revoked-and-purged between auth and here;
     * updateMany gated on a live (non-revoked) session returns count 0 instead.
     */
    const updated = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { lastReauthAt: new Date() },
    });

    if (updated.count === 0) {
      return undefined;
    }

    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });

    return session ? mapSession(session) : undefined;
  }

  async createRuntimeWebSocketTicket(input: {
    tokenHash: string;
    userId: string;
    workspaceId: string;
    projectId: string;
    resolvedWorkspaceId: string;
    endpoint: RuntimeWebSocketTicketRecord['endpoint'];
    ttlMs: number;
  }) {
    if (!Number.isFinite(input.ttlMs) || input.ttlMs < 1 || input.ttlMs > 60_000) {
      throw new TypeError('Runtime WebSocket ticket TTL must be between 1 and 60000 milliseconds');
    }

    /* Best-effort pruning uses the same authoritative DB clock as consumption. */
    await this.prisma
      .$executeRaw(
        Prisma.sql`
        DELETE FROM "RuntimeWebSocketTicket"
        WHERE "expiresAt" <= CURRENT_TIMESTAMP
      `,
      )
      .catch(() => {});

    const [ticket] = await this.prisma.$queryRaw<
      Array<{
        id: string;
        tokenHash: string;
        userId: string;
        workspaceId: string;
        projectId: string;
        resolvedWorkspaceId: string;
        endpoint: string;
        expiresAt: Date;
        consumedAt: Date | null;
        createdAt: Date;
      }>
    >(Prisma.sql`
      INSERT INTO "RuntimeWebSocketTicket" (
        "id", "tokenHash", "userId", "workspaceId", "projectId",
        "resolvedWorkspaceId", "endpoint", "expiresAt"
      ) VALUES (
        ${`runtime_ws_ticket_${randomUUID()}`}, ${input.tokenHash}, ${input.userId}, ${input.workspaceId},
        ${input.projectId}, ${input.resolvedWorkspaceId}, ${input.endpoint},
        CURRENT_TIMESTAMP + (${Math.floor(input.ttlMs)} * INTERVAL '1 millisecond')
      )
      RETURNING
        "id", "tokenHash", "userId", "workspaceId", "projectId",
        "resolvedWorkspaceId", "endpoint", "expiresAt", "consumedAt", "createdAt"
    `);

    if (!ticket) {
      throw new Error(RUNTIME_WEBSOCKET_TICKET_INSERT_EMPTY);
    }

    return mapRuntimeWebSocketTicket(ticket);
  }

  async consumeRuntimeWebSocketTicket(input: {
    tokenHash: string;
    workspaceId: string;
    endpoint: RuntimeWebSocketTicketRecord['endpoint'];
  }) {
    /*
     * This conditional UPDATE is the linearization point. Expiry is evaluated
     * by PostgreSQL (`CURRENT_TIMESTAMP`), not an API replica's wall clock, and
     * `consumedAt IS NULL` makes replay protection atomic across replicas.
     * RETURNING avoids a claim-then-read gap if the user's cascade delete races
     * consumption: a deleted row simply cannot be returned as authenticated.
     */
    const [ticket] = await this.prisma.$queryRaw<
      Array<{
        id: string;
        tokenHash: string;
        userId: string;
        workspaceId: string;
        projectId: string;
        resolvedWorkspaceId: string;
        endpoint: string;
        expiresAt: Date;
        consumedAt: Date;
        createdAt: Date;
      }>
    >(Prisma.sql`
      UPDATE "RuntimeWebSocketTicket"
      SET "consumedAt" = CURRENT_TIMESTAMP
      WHERE "tokenHash" = ${input.tokenHash}
        AND "workspaceId" = ${input.workspaceId}
        AND "endpoint" = ${input.endpoint}
        AND "consumedAt" IS NULL
        AND "expiresAt" > CURRENT_TIMESTAMP
      RETURNING
        "id", "tokenHash", "userId", "workspaceId", "projectId",
        "resolvedWorkspaceId", "endpoint", "expiresAt", "consumedAt", "createdAt"
    `);

    return ticket ? mapRuntimeWebSocketTicket(ticket) : undefined;
  }

  async createEmailVerification(input: { userId: string; token: string; expiresAt: Date; email?: string }) {
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: input.userId,
        tokenHash: hashToken(input.token),
        expiresAt: input.expiresAt,
        email: input.email,
      },
    });
  }

  async consumeEmailVerification(token: string) {
    const tokenHash = hashToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!record) {
      return undefined;
    }

    /*
     * Bind to the issued-for email: the user's CURRENT email must still match, so
     * a token requested for address A can't mark the account verified after the
     * user switched to address B (and vice versa). Legacy tokens (email null)
     * keep the prior userId-only behaviour.
     */
    if (record.email) {
      const tokenUser = await this.prisma.user.findUnique({
        where: { id: record.userId },
        select: { email: true },
      });

      if (!tokenUser || tokenUser.email.toLowerCase() !== record.email.toLowerCase()) {
        return undefined;
      }
    }

    const consumed = await this.prisma.emailVerificationToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    if (consumed.count === 0) {
      return undefined;
    }

    return this.updateUser({ userId: record.userId, emailVerifiedAt: now() });
  }

  async createPasswordReset(input: { userId: string; token: string; expiresAt: Date }) {
    await this.prisma.passwordResetToken.create({
      data: { userId: input.userId, tokenHash: hashToken(input.token), expiresAt: input.expiresAt },
    });
  }

  async consumePasswordReset(token: string, passwordHash: string) {
    const tokenHash = hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record) {
      return undefined;
    }

    const consumed = await this.prisma.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    if (consumed.count === 0) {
      return undefined;
    }

    /*
     * Single-use must be per-user, not just per-token: invalidate every other
     * outstanding reset token for this user so a previously-issued link (or one
     * an attacker triggered) can no longer re-reset the password after a
     * successful reset.
     */
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    return this.updateUser({ userId: record.userId, passwordHash });
  }

  async setRecoveryCodes(userId: string, codeHashes: string[]) {
    /*
     * Wipe-then-recreate must be atomic: if a create rejected mid-loop the user
     * would be left with the old codes already deleted but only a partial new
     * set persisted, silently invalidating recovery access. Run both writes in
     * one transaction so the regenerate either fully lands or fully rolls back.
     */
    const records = await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      return Promise.all(codeHashes.map((codeHash) => tx.mfaRecoveryCode.create({ data: { userId, codeHash } })));
    });
    return records.map(
      (record): RecoveryCodeRecord => ({
        id: record.id,
        userId: record.userId,
        codeHash: record.codeHash,
        usedAt: toIso(record.usedAt),
        createdAt: toIso(record.createdAt)!,
      }),
    );
  }

  async consumeRecoveryCode(userId: string, codeHash: string) {
    const result = await this.prisma.mfaRecoveryCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count > 0;
  }

  async countUnusedRecoveryCodes(userId: string) {
    return this.prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
  }

  async createOrganization(input: { name: string; slug: string; ownerUserId: string }) {
    const ownerRole = await this.ensureRole('owner');

    const organization = await this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertUserTopologyMutable(tx, input.ownerUserId);
      return tx.organization.create({
        data: {
          name: input.name,
          slug: input.slug || slugify(input.name),
          members: { create: { userId: input.ownerUserId, roleId: ownerRole.id } },
        },
      });
    });

    return mapOrganization(organization);
  }

  async listOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, state: 'ACTIVE' },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((membership) => mapOrganization(membership.organization));
  }

  async getOrganization(id: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id } });
    return organization ? mapOrganization(organization) : undefined;
  }

  async setOrganizationBillingEmail(organizationId: string, email: string | null) {
    return mapOrganization(
      await this.prisma.organization.update({ where: { id: organizationId }, data: { billingEmail: email } }),
    );
  }

  async addMember(input: { organizationId: string; userId: string; roleKey: string; invitedByUserId?: string }) {
    const role = await this.ensureRole(input.roleKey);

    const membership = await this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertMembershipMutable(tx, input.organizationId, [input.userId]);
      return tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
        create: {
          organizationId: input.organizationId,
          userId: input.userId,
          roleId: role.id,
          state: 'ACTIVE',
          invitedByUserId: input.invitedByUserId,
        },
        update: {
          roleId: role.id,
          state: 'ACTIVE',
          ...(input.invitedByUserId ? { invitedByUserId: input.invitedByUserId } : {}),
        },
        include: { role: true },
      });
    });

    return mapMembership(membership);
  }

  async getMembership(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId, state: 'ACTIVE' },
      include: { role: true },
    });
    return membership ? mapMembership(membership) : undefined;
  }

  async listMembers(organizationId: string) {
    return (
      await this.prisma.organizationMember.findMany({
        where: { organizationId, state: 'ACTIVE' },
        include: { role: true, user: { select: { name: true, email: true } } },
      })
    ).map(mapMembership);
  }

  async removeMember(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId, state: 'ACTIVE' },
      include: { role: true },
    });

    if (!membership) {
      return undefined;
    }

    /*
     * Offboarding is one fail-closed transaction. A deleted membership with a
     * still-live connector/collaborator/AccessGrant is a security incident, so
     * no cleanup failure is swallowed and no partially-revoked state commits.
     */
    const removed = await this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertMembershipMutable(tx, organizationId, [userId]);
      await tx.projectConnectionLink.updateMany({
        where: {
          unlinkedAt: null,
          userConnection: { userId },
          project: { organizationId },
        },
        data: { unlinkedAt: new Date() },
      });
      await tx.projectCollaborator.deleteMany({ where: { userId, project: { organizationId } } });
      await tx.$executeRaw`
        UPDATE "ResourceAccessGrant"
        SET "status" = 'REVOKED',
            "revokedAt" = CURRENT_TIMESTAMP,
            "revocationReason" = 'ORGANIZATION_MEMBERSHIP_REMOVED',
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "organizationId" = ${organizationId}
          AND "subjectType" = 'USER'
          AND "subjectUserId" = ${userId}
          AND "status" <> 'REVOKED'
      `;

      return tx.organizationMember.deleteMany({ where: { id: membership.id, state: 'ACTIVE' } });
    });

    return removed.count === 1 ? mapMembership(membership) : undefined;
  }

  async createProject(input: {
    organizationId: string;
    name: string;
    slug: string;
    description?: string;
    sourceType?: ProjectRecord['sourceType'];
    templateName?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
    initialManifest?: unknown;
    manifestCloneMode?: ProjectManifestCloneMode;
  }) {
    const base = projectSlugBase(input);

    /*
     * nextProjectSlug() only reads to find a free slug; between that read and the
     * create below a concurrent createProject() in the same org can grab the same
     * candidate, so the second insert violates @@unique([organizationId, slug])
     * with P2002. Retry on that specific collision (re-allocating the slug each
     * time) instead of crashing the request.
     */
    for (let attempt = 0; ; attempt += 1) {
      const slug = await this.nextProjectSlug(input.organizationId, base);

      try {
        return await this.prisma.$transaction(async (tx) => {
          await this.accountPurge.assertMembershipMutable(tx, input.organizationId);
          const project = await tx.project.create({
            data: {
              organizationId: input.organizationId,
              name: input.name,
              slug,
              description: input.description,
              sourceType: input.sourceType ?? 'blank',
              templateName: input.templateName,
              gitRepositoryUrl: input.gitRepositoryUrl,
              gitDefaultBranch: input.gitDefaultBranch,
              persistentVolumeClaim: `pvc-${input.organizationId}-${slug}`,
            },
          });
          const manifest = input.initialManifest
            ? projectManifestForClone(input.initialManifest, project.id, input.manifestCloneMode)
            : createDefaultProjectManifest(project.id);

          await tx.projectManifestRevision.create({
            data: {
              projectId: project.id,
              schemaVersion: manifest.schemaVersion,
              manifestVersion: manifest.manifestVersion,
              digest: projectManifestDigest(manifest),
              manifest: manifest as Prisma.InputJsonValue,
            },
          });

          return mapProject(project);
        });
      } catch (error) {
        if (isPrismaKnownRequestError(error) && error.code === 'P2002' && attempt < 5) {
          continue;
        }

        throw error;
      }
    }
  }

  private async nextProjectSlug(organizationId: string, baseSlug: string) {
    let candidate = baseSlug;
    let suffix = 2;

    while (
      await this.prisma.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: candidate } },
        select: { id: true },
      })
    ) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  async getProject(id: string) {
    // Count deployments so callers (e.g. the IDE top bar) can show Publish vs
    // Republish without a second query; mapProject surfaces it as deploymentCount.
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { _count: { select: { deployments: true } } },
    });
    return project ? mapProject(project) : undefined;
  }

  async getProjectBySlugs(input: { organizationSlug: string; projectSlug: string }) {
    const project = await this.prisma.project.findFirst({
      where: {
        slug: input.projectSlug,
        deletedAt: null,
        organization: { slug: input.organizationSlug },
      },
    });
    return project ? mapProject(project) : undefined;
  }

  async updateProject(input: {
    projectId: string;
    name?: string;
    description?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
  }) {
    return mapProject(
      await this.prisma.project.update({
        where: { id: input.projectId },
        data: {
          name: input.name,
          description: input.description,
          gitRepositoryUrl: input.gitRepositoryUrl,
          gitDefaultBranch: input.gitDefaultBranch,
        },
      }),
    );
  }

  async renameProjectSlug(input: { projectId: string; newSlug: string; redirectTtlDays?: number }) {
    const project = assertFound(
      await this.prisma.project.findUnique({ where: { id: input.projectId } }),
      'Project not found',
      'PROJECT_NOT_FOUND',
    );

    // No-op rename: don't mint a self-redirect (it would loop the old→new URL
    // back onto itself) — just hand back the project unchanged.
    if (project.slug === input.newSlug) {
      return mapProject(project);
    }

    // slug is only @@unique within an org, so a bare update would 500 on P2002.
    // Surface the clash as a typed 409 the route can translate into an inline
    // "slug already taken" message.
    const clash = await this.prisma.project.findFirst({
      where: { organizationId: project.organizationId, slug: input.newSlug, id: { not: project.id } },
      select: { id: true },
    });

    if (clash) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_SLUG_TAKEN')), {
        statusCode: 409,
        code: 'PROJECT_SLUG_TAKEN',
      });
    }

    const ttlDays = input.redirectTtlDays ?? 30;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      // Persist old → project redirect (upsert so a re-rename of the same old
      // slug just refreshes the 30-day window instead of P2002-ing).
      await tx.projectSlugRedirect.upsert({
        where: { projectId_oldSlug: { projectId: project.id, oldSlug: project.slug } },
        create: { projectId: project.id, oldSlug: project.slug, expiresAt },
        update: { expiresAt },
      });

      // Renaming BACK to a slug this project previously redirected FROM would
      // leave a self-redirect (newSlug → this project) that bounces the fresh
      // canonical URL. Drop it.
      await tx.projectSlugRedirect.deleteMany({ where: { projectId: project.id, oldSlug: input.newSlug } });

      return mapProject(await tx.project.update({ where: { id: project.id }, data: { slug: input.newSlug } }));
    });
  }

  async resolveProjectSlugRedirect(input: { organizationSlug: string; oldSlug: string; now?: Date }) {
    const redirect = await this.prisma.projectSlugRedirect.findFirst({
      where: {
        oldSlug: input.oldSlug,
        expiresAt: { gt: input.now ?? new Date() },
        project: { deletedAt: null, organization: { slug: input.organizationSlug } },
      },
      orderBy: { createdAt: 'desc' },
      include: { project: true },
    });

    return redirect ? mapProject(redirect.project) : undefined;
  }

  async listProjects(organizationId: string, options: { includeArchived?: boolean } = {}) {
    const partialTargets = options.includeArchived
      ? (
          await this.prisma.remixJob.findMany({
            where: {
              organizationId,
              targetProjectId: { not: null },
              state: { notIn: ['COMPLETED', 'FAILED'] },
            },
            select: { targetProjectId: true },
          })
        ).flatMap((job) => (job.targetProjectId ? [job.targetProjectId] : []))
      : [];

    return (
      await this.prisma.project.findMany({
        where: {
          organizationId,
          ...(options.includeArchived
            ? partialTargets.length > 0
              ? { id: { notIn: partialTargets } }
              : {}
            : { deletedAt: null }),
        },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { deployments: true } } },
      })
    ).map(mapProject);
  }

  async countProjects(organizationId: string, options: { since?: Date } = {}) {
    /*
     * Partial remix/import targets are intentionally soft-hidden until their
     * durable workflow commits. They still consume the project quota: omitting
     * them lets several concurrent imports each observe the same free slot and
     * all reveal afterwards. This MUST be one PostgreSQL statement: a finalize
     * between separate visible/job reads could otherwise disappear from both
     * snapshots and undercount the tenant by one.
     */
    const createdAtFilter = options.since ? Prisma.sql`AND p."createdAt" >= ${options.since}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(DISTINCT p."id")::int AS "count"
      FROM "Project" p
      WHERE p."organizationId" = ${organizationId}
        AND (
          p."deletedAt" IS NULL
          OR EXISTS (
            SELECT 1 FROM "RemixJob" r
            WHERE r."organizationId" = ${organizationId}
              AND r."targetProjectId" = p."id"
              AND r."state" NOT IN ('COMPLETED', 'FAILED')
          )
          OR EXISTS (
            SELECT 1 FROM "ImportJob" i
            WHERE i."organizationId" = ${organizationId}
              AND i."targetProjectId" = p."id"
              AND i."state" NOT IN ('COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED')
          )
        )
        ${createdAtFilter}
    `);

    return rows[0]?.count ?? 0;
  }

  async countOrganizationActiveStrikes(organizationId: string, nowMs: number) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      select: { user: { select: { preferences: true } } },
    });

    return memberships.reduce(
      (total, membership) => total + countActiveModerationStrikes(membership.user.preferences, nowMs),
      0,
    );
  }

  async countRecentSevereAbuseEvents(organizationId: string, since: Date) {
    if (!organizationId || !Number.isFinite(since.getTime())) {
      throw new TypeError('TENANT_GUARDRAIL_ABUSE_COUNTER_CONTEXT_INVALID');
    }

    /*
     * One aggregate query is the security boundary. In particular, do not reuse
     * listAbuseEvents(): its intentional display/hot-path cap would let an
     * attacker push a severe event out of the first page with harmless rows.
     * IS DISTINCT FROM includes legacy NULL metadata while excluding incidents
     * an operator explicitly dismissed.
     */
    const [row] = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "AbuseEvent"
      WHERE "organizationId" = ${organizationId}
        AND "severity" IN ('high', 'critical')
        AND "createdAt" >= ${since}
        AND ("metadata"->>'disposition') IS DISTINCT FROM 'dismissed'
    `);
    const count = Number(row?.count ?? 0n);

    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError('TENANT_GUARDRAIL_ABUSE_COUNTER_INVALID');
    }

    return count;
  }

  async subscribeNewsletter(input: { email: string; source?: string }) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.newsletterSubscriber.findUnique({ where: { email } });

    // Upsert (not create) so a concurrent duplicate submit can't P2002-500.
    await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, source: input.source ?? 'footer' },
      update: { unsubscribedAt: null },
    });

    return { alreadySubscribed: Boolean(existing && !existing.unsubscribedAt) };
  }

  async createContactRequest(input: {
    email: string;
    name?: string;
    company: string;
    teamSize?: string;
    message: string;
    pagePath?: string;
  }) {
    const row = await this.prisma.contactRequest.create({
      data: {
        email: input.email.trim().toLowerCase(),
        name: input.name,
        company: input.company,
        teamSize: input.teamSize,
        message: input.message,
        pagePath: input.pagePath,
      },
    });

    return {
      id: row.id,
      email: row.email,
      name: row.name ?? undefined,
      company: row.company,
      teamSize: row.teamSize ?? undefined,
      message: row.message,
      pagePath: row.pagePath ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async softDeleteProject(projectId: string) {
    return mapProject(await this.prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } }));
  }

  async restoreProject(projectId: string) {
    return mapProject(await this.prisma.project.update({ where: { id: projectId }, data: { deletedAt: null } }));
  }

  async hardDeleteProject(projectId: string) {
    // Every child relation declares onDelete: Cascade (AiConversation: SetNull),
    // so a plain delete removes the whole project graph atomically.
    return this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertProjectMutable(tx, projectId);
      return mapProject(await tx.project.delete({ where: { id: projectId } }));
    });
  }

  async transferProject(input: { projectId: string; targetOrganizationId: string; actorUserId?: string }) {
    return this.withSerializedMutation(`project-manifest:${input.projectId}`, async () => {
      const current = assertFound(
        await this.prisma.project.findUnique({ where: { id: input.projectId } }),
        'Project not found',
        'PROJECT_NOT_FOUND',
      );

      if (current.organizationId === input.targetOrganizationId) {
        return mapProject(current);
      }

      /*
       * The slug is only unique within an org, so the target org may already have a
       * project with this slug — a bare update would then violate
       * @@unique([organizationId, slug]) with an unhandled P2002 (500). Re-allocate
       * a free slug in the target org and retry on the race, like createProject.
       * The persistentVolumeClaim is intentionally left unchanged: it references an
       * existing physical volume holding the project's data, so renaming it would
       * orphan that volume.
       */
      for (let attempt = 0; ; attempt += 1) {
        const slug = await this.nextProjectSlug(input.targetOrganizationId, current.slug);

        try {
          return await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`project-checkpoint:${input.projectId}`}, 0))`,
            );
            await tx.$queryRawUnsafe('SELECT "id" FROM "Project" WHERE "id" = $1 FOR UPDATE', input.projectId);
            const locked = assertFound(
              await tx.project.findUnique({ where: { id: input.projectId } }),
              'Project not found',
              'PROJECT_NOT_FOUND',
            );
            if (locked.organizationId === input.targetOrganizationId) {
              return mapProject(locked);
            }

            await this.accountPurge.assertProjectMutable(tx, input.projectId);
            await this.accountPurge.assertMembershipMutable(tx, input.targetOrganizationId);

            const checkpointBarrier = await tx.projectCheckpoint.findFirst({
              where: {
                projectId: input.projectId,
                barrierProjectId: input.projectId,
                barrierExpiresAt: { gt: await databaseNow(tx) },
              },
              select: { id: true },
            });
            if (checkpointBarrier) {
              throw Object.assign(new Error(appPublicEnglish('CHECKPOINT_BARRIER_ACTIVE_MESSAGE')), {
                statusCode: 423,
                code: 'CHECKPOINT_BARRIER_ACTIVE',
              });
            }

            /*
             * A plain Organization reassignment cannot safely move resources
             * whose ownership is enforced by another control plane. Relabeling
             * the Project would leave CNPG metering on the source tenant, a GCP
             * binding owned by the source CloudTenant, or a live schema migration
             * crossing the boundary. Those moves must use the dedicated durable
             * tenant/resource transfer workflow; fail before revoking grants or
             * appending a manifest revision so this operation is all-or-nothing.
             */
            const [
              managedDatabaseCount,
              cloudBindingCount,
              activeMigrationCount,
              activeImportCount,
              activeRemixCount,
              activeStorageShareCount,
              readyDeploymentCount,
              releaseManifestCount,
            ] = await Promise.all([
              tx.databaseInstance.count({ where: { projectId: input.projectId, status: { not: 'DELETED' } } }),
              tx.cloudProjectBinding.count({ where: { projectId: input.projectId } }),
              tx.dBMigrationExecution.count({
                where: {
                  projectId: input.projectId,
                  state: {
                    in: ['LOCK_ACQUIRED', 'BACKUP_VERIFIED', 'APPLYING', 'VALIDATING', 'RECOVERING', 'MANUAL_RECOVERY'],
                  },
                },
              }),
              tx.importJob.count({
                where: {
                  targetProjectId: input.projectId,
                  state: { notIn: ['COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED'] },
                },
              }),
              tx.remixJob.count({
                where: {
                  OR: [{ sourceProjectId: input.projectId }, { targetProjectId: input.projectId }],
                  state: { notIn: ['COMPLETED', 'FAILED'] },
                },
              }),
              tx.remixStorageShare.count({
                where: {
                  state: 'ACTIVE',
                  OR: [{ sourceProjectId: input.projectId }, { targetProjectId: input.projectId }],
                },
              }),
              tx.deployment.count({ where: { projectId: input.projectId, status: 'READY' } }),
              tx.releaseManifest.count({ where: { projectId: input.projectId } }),
            ]);

            if (
              managedDatabaseCount +
                cloudBindingCount +
                activeMigrationCount +
                activeImportCount +
                activeRemixCount +
                activeStorageShareCount +
                readyDeploymentCount +
                releaseManifestCount >
              0
            ) {
              throw Object.assign(new Error(appPublicEnglish('PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE')), {
                statusCode: 409,
                code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE',
              });
            }
            const sourceRevisionRow = await tx.projectManifestRevision.findFirst({
              where: { projectId: input.projectId },
              orderBy: { manifestVersion: 'desc' },
            });
            const sourceManifest = sourceRevisionRow
              ? verifyStoredProjectManifestRevision(mapProjectManifestRevision(sourceRevisionRow), input.projectId)
              : createDefaultProjectManifest(input.projectId);
            const detachedSeed = projectManifestForClone(sourceManifest, input.projectId, 'DETACH_EXTERNALS');
            const detachedManifest = canonicalizeProjectManifest({
              ...detachedSeed,
              manifestVersion: (sourceRevisionRow?.manifestVersion ?? 0) + 1,
            });

            /*
             * Revoke all explicit ProjectCollaborator grants on transfer. They were
             * issued to the SOURCE org's users; leaving them in place after the
             * project moves to a different org keeps those (now cross-org) users with
             * access to a project they no longer belong to. The target org's members
             * get access via org membership; collaborators must be re-invited.
             */
            await tx.projectCollaborator.deleteMany({ where: { projectId: input.projectId } });

            /*
             * Share links are bearer capability tokens minted for the SOURCE org.
             * GET /collaboration/share-links/:token resolves them by token alone
             * (only revokedAt/expiry, not org) and mints a fresh collaborator grant,
             * so a leaked/outstanding link would re-grant cross-org access after the
             * project moves. Revoke them all on transfer (target org re-issues).
             */
            await tx.projectShareLink.deleteMany({ where: { projectId: input.projectId } });

            /*
             * Chat shares are bearer-token snapshots of the project's AI
             * conversations, minted under the SOURCE org. findChatShareByTokenHash
             * resolves them by token alone (no org check), so an outstanding link
             * would keep leaking the source org's conversation data after the
             * project moves to a different org. Revoke them all on transfer; the
             * target org re-shares as needed.
             */
            await tx.chatShare.deleteMany({ where: { projectId: input.projectId } });

            const revokedAt = await databaseNow(tx);
            await tx.resourceAccessGrant.updateMany({
              where: {
                resourceType: 'PROJECT',
                resourceId: input.projectId,
                status: { in: ['PENDING_CONSENT', 'ACTIVE'] },
              },
              data: {
                status: 'REVOKED',
                revokedAt,
                revokedByUserId: input.actorUserId,
                revocationReason: 'PROJECT_TRANSFERRED',
              },
            });

            const transferred = await tx.project.update({
              where: { id: input.projectId },
              data: { organizationId: input.targetOrganizationId, slug },
            });
            await tx.projectManifestRevision.create({
              data: {
                projectId: input.projectId,
                schemaVersion: detachedManifest.schemaVersion,
                manifestVersion: detachedManifest.manifestVersion,
                digest: projectManifestDigest(detachedManifest),
                manifest: detachedManifest as Prisma.InputJsonValue,
                createdByUserId: input.actorUserId,
              },
            });

            return mapProject(transferred);
          });
        } catch (error) {
          if (isPrismaKnownRequestError(error) && error.code === 'P2002' && attempt < 5) {
            continue;
          }

          throw error;
        }
      }
    });
  }

  async duplicateProject(input: {
    projectId: string;
    name: string;
    slug: string;
    organizationId?: string;
    manifestCloneMode?: ProjectManifestCloneMode;
  }) {
    const [sourceRow, sourceRevision] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: input.projectId } }),
      this.getLatestProjectManifest(input.projectId),
    ]);
    const source = assertFound(sourceRow, 'Project not found', 'PROJECT_NOT_FOUND');
    const sourceManifest = sourceRevision
      ? verifyStoredProjectManifestRevision(sourceRevision, source.id)
      : createDefaultProjectManifest(source.id);

    return this.createProject({
      organizationId: input.organizationId ?? source.organizationId,
      name: input.name,
      slug: input.slug,
      description: source.description ?? undefined,
      sourceType: 'duplicate',
      templateName: source.templateName ?? undefined,
      gitRepositoryUrl: source.gitRepositoryUrl ?? undefined,
      gitDefaultBranch: source.gitDefaultBranch ?? undefined,
      initialManifest: sourceManifest,
      manifestCloneMode: input.manifestCloneMode,
    });
  }

  async createProjectTemplate(input: {
    sourceProjectId: string;
    organizationId: string;
    name: string;
    description?: string;
  }) {
    const template = await this.prisma.projectTemplate.create({ data: input });
    return { ...template, description: template.description ?? undefined, createdAt: toIso(template.createdAt)! };
  }

  async listProjectTemplates(organizationId: string) {
    return (await this.prisma.projectTemplate.findMany({ where: { organizationId } })).map(
      (template): ProjectTemplateRecord => ({
        ...template,
        description: template.description ?? undefined,
        createdAt: toIso(template.createdAt)!,
      }),
    );
  }

  async upsertProjectEnvVar(input: { projectId: string; key: string; value: string; scope?: EnvVarScope }) {
    // Omitted scope defaults to production so pre-scope callers keep the same row.
    const scope = input.scope ?? DEFAULT_ENV_VAR_SCOPE;

    return mapEnvVar(
      await this.prisma.projectEnvVar.upsert({
        where: { projectId_key_scope: { projectId: input.projectId, key: input.key, scope } },
        create: { projectId: input.projectId, key: input.key, value: input.value, scope },
        update: { value: input.value },
      }),
    );
  }

  async listProjectEnvVars(projectId: string) {
    return (await this.prisma.projectEnvVar.findMany({ where: { projectId } })).map(mapEnvVar);
  }

  async deleteProjectEnvVar(projectId: string, key: string, scope?: EnvVarScope) {
    // Omitted scope targets the production-scoped row (the pre-scope default).
    const targetScope = scope ?? DEFAULT_ENV_VAR_SCOPE;

    /*
     * find-then-delete raced a concurrent delete into an unhandled P2025; read
     * the row, then deleteMany (count-gated) so a lost race is "already gone".
     */
    const existing = await this.prisma.projectEnvVar.findUnique({
      where: { projectId_key_scope: { projectId, key, scope: targetScope } },
    });

    if (!existing) {
      return undefined;
    }

    const deleted = await this.prisma.projectEnvVar.deleteMany({ where: { projectId, key, scope: targetScope } });

    return deleted.count > 0 ? mapEnvVar(existing) : undefined;
  }

  async upsertProjectSecret(input: { projectId: string; key: string; valueEncrypted: string }) {
    return mapSecret(
      await this.prisma.projectSecret.upsert({
        where: { projectId_key: { projectId: input.projectId, key: input.key } },
        create: { ...input, valueHash: hashToken(input.valueEncrypted) },
        update: { valueEncrypted: input.valueEncrypted, valueHash: hashToken(input.valueEncrypted) },
      }),
    );
  }

  async listProjectSecrets(projectId: string) {
    return (await this.prisma.projectSecret.findMany({ where: { projectId } })).map((secret) => {
      const safe = mapSecret(secret);
      const { valueEncrypted: _valueEncrypted, ...rest } = safe;

      return rest;
    });
  }

  async getProjectSecret(projectId: string, key: string) {
    const secret = await this.prisma.projectSecret.findUnique({ where: { projectId_key: { projectId, key } } });
    return secret ? mapSecret(secret) : undefined;
  }

  async getDatabaseTime() {
    const rows = await this.prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
    const now = rows[0]?.now;
    if (!now) throw new Error(appPublicEnglish('DATABASE_TIME_UNAVAILABLE'));
    return now.toISOString();
  }

  async createProjectCheckpoint(input: {
    projectId: string;
    createdByUserId?: string;
    idempotencyKey?: string;
    requestHash?: string;
  }) {
    const requestHash = input.requestHash ?? hashToken(`project-checkpoint:${input.projectId}`);

    return this.prisma.$transaction(async (tx) => {
      if (input.idempotencyKey) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`project-checkpoint-idempotency:${input.idempotencyKey}`}, 0))
        `;
        const existing = await tx.projectCheckpoint.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });

        if (existing) {
          if (existing.projectId !== input.projectId || existing.requestHash !== requestHash) {
            throw Object.assign(new Error(appPublicEnglish('CHECKPOINT_IDEMPOTENCY_KEY_REUSED')), {
              statusCode: 409,
              code: 'IDEMPOTENCY_KEY_REUSED',
            });
          }

          return { id: existing.id, state: existing.state, replayed: true };
        }
      }

      const row = await tx.projectCheckpoint.create({
        data: {
          projectId: input.projectId,
          createdByUserId: input.createdByUserId ?? null,
          state: 'PREPARING',
          idempotencyKey: input.idempotencyKey ?? null,
          requestHash,
        },
      });

      return { id: row.id, state: row.state, replayed: false };
    });
  }

  async acquireProjectCheckpointBarrier(input: {
    checkpointId: string;
    projectId: string;
    barrierId: string;
    ownerToken: string;
    ttlSeconds: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`project-checkpoint:${input.projectId}`}, 0))
      `;

      // Expiry is a durable fail-open thaw. Clear a dead singleton while the
      // same project lock is held so only one successor can take ownership.
      await tx.$executeRaw`
        UPDATE "ProjectCheckpoint"
        SET "barrierProjectId" = NULL,
            "barrierOwnerToken" = NULL,
            "barrierExpiresAt" = NULL,
            "barrierFence" = "barrierFence" + 1,
            "updatedAt" = clock_timestamp()
        WHERE "barrierProjectId" = ${input.projectId}
          AND "barrierExpiresAt" <= clock_timestamp()
      `;

      const rows = await tx.$queryRaw<
        Array<{ id: string; logicalBarrierId: string; barrierFence: number; barrierExpiresAt: Date }>
      >`
        UPDATE "ProjectCheckpoint"
        SET "state" = 'BARRIER_ESTABLISHED',
            "logicalBarrierId" = ${input.barrierId},
            "barrierProjectId" = ${input.projectId},
            "barrierOwnerToken" = ${input.ownerToken},
            "barrierFence" = "barrierFence" + 1,
            "barrierExpiresAt" = clock_timestamp() + make_interval(secs => ${input.ttlSeconds}),
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${input.checkpointId}
          AND "projectId" = ${input.projectId}
          AND "state" IN ('PREPARING', 'QUIESCING')
          AND "barrierProjectId" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "ProjectCheckpoint" active
            WHERE active."barrierProjectId" = ${input.projectId}
              AND active."barrierExpiresAt" > clock_timestamp()
          )
        RETURNING "id", "logicalBarrierId", "barrierFence", "barrierExpiresAt"
      `;
      const row = rows[0];

      return row
        ? {
            checkpointId: row.id,
            barrierId: row.logicalBarrierId,
            ownerToken: input.ownerToken,
            fence: row.barrierFence,
            expiresAt: row.barrierExpiresAt.toISOString(),
          }
        : undefined;
    });
  }

  async renewProjectCheckpointBarrier(input: {
    checkpointId: string;
    ownerToken: string;
    fence: number;
    ttlSeconds: number;
  }) {
    const rows = await this.prisma.$queryRaw<Array<{ barrierExpiresAt: Date }>>`
      UPDATE "ProjectCheckpoint"
      SET "barrierExpiresAt" = clock_timestamp() + make_interval(secs => ${input.ttlSeconds}),
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${input.checkpointId}
        AND "barrierProjectId" = "projectId"
        AND "barrierOwnerToken" = ${input.ownerToken}
        AND "barrierFence" = ${input.fence}
        AND "barrierExpiresAt" > clock_timestamp()
        AND "state" NOT IN ('CLEANED', 'MANUAL_INTERVENTION')
      RETURNING "barrierExpiresAt"
    `;

    return rows[0]?.barrierExpiresAt.toISOString();
  }

  async assertProjectCheckpointBarrier(input: { checkpointId: string; ownerToken: string; fence: number }) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ProjectCheckpoint"
      WHERE "id" = ${input.checkpointId}
        AND "barrierProjectId" = "projectId"
        AND "barrierOwnerToken" = ${input.ownerToken}
        AND "barrierFence" = ${input.fence}
        AND "barrierExpiresAt" > clock_timestamp()
    `;

    if (!rows[0]) {
      throw Object.assign(new Error(appPublicEnglish('CHECKPOINT_BARRIER_LOST')), {
        statusCode: 409,
        code: 'CHECKPOINT_BARRIER_LOST',
      });
    }
  }

  async transitionProjectCheckpoint(input: {
    checkpointId: string;
    ownerToken: string;
    fence: number;
    from: string;
    to: string;
    patch?: {
      consistencyLevel?: string;
      manifest?: unknown;
      error?: string;
      expiresAt?: string;
      retentionSeconds?: number;
    };
    retainBarrier?: boolean;
  }) {
    if (input.to === 'COMMITTED') {
      const manifest = JSON.stringify(input.patch?.manifest ?? null);
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        UPDATE "ProjectCheckpoint"
        SET "state" = 'COMMITTED',
            "consistencyLevel" = ${input.patch?.consistencyLevel ?? null},
            "manifest" = CAST(${manifest} AS jsonb),
            "error" = NULL,
            "expiresAt" = clock_timestamp() + make_interval(secs => ${input.patch?.retentionSeconds ?? 0}),
            "barrierProjectId" = CASE WHEN ${input.retainBarrier === true} THEN "barrierProjectId" ELSE NULL END,
            "barrierOwnerToken" = CASE WHEN ${input.retainBarrier === true} THEN "barrierOwnerToken" ELSE NULL END,
            "barrierExpiresAt" = CASE WHEN ${input.retainBarrier === true} THEN "barrierExpiresAt" ELSE NULL END,
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${input.checkpointId}
          AND "state" = ${input.from}
          AND "barrierProjectId" = "projectId"
          AND "barrierOwnerToken" = ${input.ownerToken}
          AND "barrierFence" = ${input.fence}
          AND "barrierExpiresAt" > clock_timestamp()
        RETURNING "id"
      `;

      if (!rows[0]) {
        throw Object.assign(new Error(appPublicEnglish('CHECKPOINT_BARRIER_LOST')), {
          statusCode: 409,
          code: 'CHECKPOINT_BARRIER_LOST',
        });
      }
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const lease = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ProjectCheckpoint"
        WHERE "id" = ${input.checkpointId}
          AND "state" = ${input.from}
          AND "barrierProjectId" = "projectId"
          AND "barrierOwnerToken" = ${input.ownerToken}
          AND "barrierFence" = ${input.fence}
          AND "barrierExpiresAt" > clock_timestamp()
        FOR UPDATE
      `;

      if (!lease[0]) {
        throw Object.assign(new Error(appPublicEnglish('CHECKPOINT_BARRIER_LOST')), {
          statusCode: 409,
          code: 'CHECKPOINT_BARRIER_LOST',
        });
      }

      await tx.projectCheckpoint.update({
        where: { id: input.checkpointId },
        data: {
          state: input.to,
          ...(input.patch?.consistencyLevel !== undefined ? { consistencyLevel: input.patch.consistencyLevel } : {}),
          ...(input.patch?.manifest !== undefined ? { manifest: input.patch.manifest as object } : {}),
          ...(input.patch?.error !== undefined ? { error: input.patch.error } : {}),
          ...(input.patch?.expiresAt !== undefined ? { expiresAt: new Date(input.patch.expiresAt) } : {}),
        },
      });

      if (input.patch?.retentionSeconds !== undefined) {
        await tx.$executeRaw`
          UPDATE "ProjectCheckpoint"
          SET "expiresAt" = clock_timestamp() + make_interval(secs => ${input.patch.retentionSeconds})
          WHERE "id" = ${input.checkpointId}
        `;
      }
    });
  }

  async releaseProjectCheckpointBarrier(input: { checkpointId: string; ownerToken: string; fence: number }) {
    const changed = await this.prisma.$executeRaw`
      UPDATE "ProjectCheckpoint"
      SET "barrierProjectId" = NULL,
          "barrierOwnerToken" = NULL,
          "barrierExpiresAt" = NULL,
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${input.checkpointId}
        AND "barrierOwnerToken" = ${input.ownerToken}
        AND "barrierFence" = ${input.fence}
    `;

    return changed === 1;
  }

  async updateProjectCheckpoint(
    id: string,
    patch: {
      state?: string;
      logicalBarrierId?: string;
      consistencyLevel?: string;
      manifest?: unknown;
      error?: string;
      expiresAt?: string;
    },
  ) {
    await this.prisma.projectCheckpoint.update({
      where: { id },
      data: {
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.logicalBarrierId !== undefined ? { logicalBarrierId: patch.logicalBarrierId } : {}),
        ...(patch.consistencyLevel !== undefined ? { consistencyLevel: patch.consistencyLevel } : {}),
        ...(patch.manifest !== undefined ? { manifest: patch.manifest as object } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.expiresAt !== undefined ? { expiresAt: new Date(patch.expiresAt) } : {}),
      },
    });
  }

  async getActiveCheckpointBarrier(projectId: string) {
    /*
     * Indexed on (projectId, barrierExpiresAt). `gt: now` means an expired lease
     * reads as thawed without needing a sweeper — the deadline itself IS the
     * guaranteed thaw if the orchestrating replica dies holding the barrier.
     */
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; logicalBarrierId: string | null; barrierExpiresAt: Date }>
    >`
      SELECT "id", "logicalBarrierId", "barrierExpiresAt"
      FROM "ProjectCheckpoint"
      WHERE "barrierProjectId" = ${projectId}
        AND "barrierExpiresAt" > clock_timestamp()
      LIMIT 1
    `;
    const row = rows[0];

    if (!row?.barrierExpiresAt || !row.logicalBarrierId) {
      return undefined;
    }

    return {
      checkpointId: row.id,
      barrierId: row.logicalBarrierId,
      expiresAt: row.barrierExpiresAt.toISOString(),
    };
  }

  async getProjectCheckpoint(id: string) {
    const row = await this.prisma.projectCheckpoint.findUnique({ where: { id } });

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      projectId: row.projectId,
      state: row.state,
      logicalBarrierId: row.logicalBarrierId ?? undefined,
      consistencyLevel: row.consistencyLevel ?? undefined,
      manifest: row.manifest as unknown,
      error: row.error ?? undefined,
      expiresAt: row.expiresAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createRemixJob(input: {
    sourceProjectId: string;
    organizationId: string;
    actorUserId?: string;
    storagePolicy: string;
    idempotencyKey: string;
    requestHash: string;
    storageConsentVersion?: string;
    sourceSnapshotId?: string;
    sourceListingId?: string;
    licenseSnapshot?: unknown;
    consentVersion?: string;
  }) {
    try {
      const row = await this.prisma.remixJob.create({
        data: {
          sourceProjectId: input.sourceProjectId,
          organizationId: input.organizationId,
          actorUserId: input.actorUserId ?? null,
          storagePolicy: input.storagePolicy,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          storageConsentVersion: input.storageConsentVersion ?? null,
          sourceSnapshotId: input.sourceSnapshotId ?? null,
          sourceListingId: input.sourceListingId ?? null,
          licenseSnapshot: (input.licenseSnapshot as Prisma.InputJsonValue | undefined) ?? undefined,
          consentVersion: input.consentVersion ?? null,
          state: 'PENDING',
        },
      });

      return { job: mapRemixJob(row), replayed: false };
    } catch (error) {
      if (!isPrismaKnownRequestError(error) || error.code !== 'P2002') {
        throw error;
      }

      const existing = await this.prisma.remixJob.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

      if (!existing || existing.requestHash !== input.requestHash) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_IDEMPOTENCY_CONFLICT')), {
          statusCode: 409,
          code: 'REMIX_IDEMPOTENCY_CONFLICT',
        });
      }

      return { job: mapRemixJob(existing), replayed: true };
    }
  }

  async claimRemixJob(input: { id: string; organizationId: string; operationToken: string; leaseDurationMs: number }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.id,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const job = await tx.remixJob.findFirst({ where: { id: input.id, organizationId: input.organizationId } });

      if (!job || ['COMPLETED', 'FAILED'].includes(job.state)) {
        return undefined;
      }

      const activeOtherOwner =
        job.operationToken &&
        job.operationToken !== input.operationToken &&
        job.operationExpiresAt &&
        job.operationExpiresAt > now;

      if (activeOtherOwner) {
        return undefined;
      }

      return mapRemixJob(
        await tx.remixJob.update({
          where: { id: job.id },
          data: {
            operationToken: input.operationToken,
            operationExpiresAt: databaseLeaseExpiry(now, input.leaseDurationMs),
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async renewRemixJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedVersion: number;
    leaseDurationMs: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.id,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const row = await tx.remixJob.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          operationToken: input.operationToken,
          operationExpiresAt: { gt: now },
          version: input.expectedVersion,
          state: { notIn: ['COMPLETED', 'FAILED'] },
        },
      });

      if (!row) return undefined;

      return mapRemixJob(
        await tx.remixJob.update({
          where: { id: row.id },
          data: {
            operationExpiresAt: databaseLeaseExpiry(now, input.leaseDurationMs),
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async transitionRemixJob(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedVersion: number;
    expectedStates: string[];
    state: string;
    patch?: RemixJobTransitionPatch;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.id,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const row = await tx.remixJob.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          operationToken: input.operationToken,
          operationExpiresAt: { gt: now },
          version: input.expectedVersion,
          state: { in: input.expectedStates },
        },
      });

      if (!row) return undefined;

      return mapRemixJob(
        await tx.remixJob.update({
          where: { id: row.id },
          data: { state: input.state, version: { increment: 1 }, ...remixTransitionData(input.patch) },
        }),
      );
    });
  }

  async releaseRemixJobLease(input: { id: string; organizationId: string; operationToken: string }) {
    const updated = await this.prisma.remixJob.updateMany({
      where: { id: input.id, organizationId: input.organizationId, operationToken: input.operationToken },
      data: { operationToken: null, operationExpiresAt: null, version: { increment: 1 } },
    });

    if (updated.count !== 1) {
      return undefined;
    }

    const row = await this.prisma.remixJob.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
    return row ? mapRemixJob(row) : undefined;
  }

  async createClaimedRemixProject(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    name: string;
    slug: string;
    manifestCloneMode?: ProjectManifestCloneMode;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertMembershipMutable(tx, input.organizationId);
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.remixJobId,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const job = await tx.remixJob.findFirst({
        where: { id: input.remixJobId, organizationId: input.organizationId },
      });

      if (
        !job ||
        job.operationToken !== input.operationToken ||
        !job.operationExpiresAt ||
        job.operationExpiresAt <= now ||
        ['COMPLETED', 'FAILED', 'CLEANUP_PENDING'].includes(job.state)
      ) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_OWNERSHIP_LOST')), {
          statusCode: 409,
          code: 'REMIX_OWNERSHIP_LOST',
        });
      }

      const source = assertFound(
        await tx.project.findUnique({ where: { id: job.sourceProjectId } }),
        appPublicEnglish('PROJECT_NOT_FOUND'),
        'PROJECT_NOT_FOUND',
      );
      const sourceSnapshot = job.sourceSnapshotId
        ? await tx.projectSnapshot.findFirst({ where: { id: job.sourceSnapshotId, projectId: source.id } })
        : undefined;
      if (!sourceSnapshot) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_MANIFEST_SNAPSHOT_UNPINNED')), {
          statusCode: 409,
          code: 'PROJECT_MANIFEST_SNAPSHOT_UNPINNED',
        });
      }
      /*
       * Clone the manifest embedded in the immutable source snapshot, never the
       * latest live revision. Files v1 + topology v2 is not a valid remix.
       */
      const sourceManifest = readProjectManifestSnapshotPin(sourceSnapshot.manifest, source.id).manifest;
      const ensureTargetManifest = async (targetProjectId: string) => {
        const existingRevisionRow = await tx.projectManifestRevision.findFirst({
          where: { projectId: targetProjectId },
          orderBy: { manifestVersion: 'desc' },
        });

        if (existingRevisionRow) {
          verifyStoredProjectManifestRevision(mapProjectManifestRevision(existingRevisionRow), targetProjectId);
          return;
        }

        const manifest = projectManifestForClone(
          sourceManifest,
          targetProjectId,
          input.manifestCloneMode ?? 'DETACH_EXTERNALS',
        );
        await tx.projectManifestRevision.create({
          data: {
            projectId: targetProjectId,
            schemaVersion: manifest.schemaVersion,
            manifestVersion: manifest.manifestVersion,
            digest: projectManifestDigest(manifest),
            manifest: manifest as Prisma.InputJsonValue,
            createdByUserId: job.actorUserId,
          },
        });
      };

      if (job.targetProjectId) {
        const existing = await tx.project.findFirst({
          where: { id: job.targetProjectId, organizationId: input.organizationId },
        });

        if (existing) {
          await ensureTargetManifest(existing.id);
          return mapProject(existing);
        }
      }

      const baseSlug = slugify(input.slug) || `remix-${job.id.slice(-8)}`;
      const occupied = await tx.project.findUnique({
        where: { organizationId_slug: { organizationId: input.organizationId, slug: baseSlug } },
        select: { id: true },
      });
      const slug = occupied ? `${baseSlug}-${job.id.slice(-8).toLowerCase()}` : baseSlug;
      const project = await tx.project.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          slug,
          description: source.description,
          sourceType: 'duplicate',
          templateName: source.templateName,
          gitRepositoryUrl: source.gitRepositoryUrl,
          gitDefaultBranch: source.gitDefaultBranch,
          persistentVolumeClaim: `pvc-${input.organizationId}-${slug}`,
          // Keep a partially-provisioned target out of normal project listings.
          // finalizeClaimedRemix clears this atomically with COMPLETED.
          deletedAt: new Date(),
        },
      });
      await ensureTargetManifest(project.id);
      await tx.remixJob.update({
        where: { id: job.id },
        data: { targetProjectId: project.id, version: { increment: 1 } },
      });

      return mapProject(project);
    });
  }

  async completeClaimedRemixDatabase(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    databaseInstanceId: string;
    projectId: string;
    valueEncrypted: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.remixJobId,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const job = await tx.remixJob.findFirst({
        where: {
          id: input.remixJobId,
          organizationId: input.organizationId,
          state: 'DB_FORKING',
          operationToken: input.operationToken,
          operationExpiresAt: { gt: now },
          targetProjectId: input.projectId,
          targetDatabaseInstanceId: input.databaseInstanceId,
        },
      });

      if (!job) {
        return undefined;
      }

      const activated = await tx.databaseInstance.updateMany({
        where: {
          id: input.databaseInstanceId,
          projectId: input.projectId,
          organizationId: input.organizationId,
          status: 'PROVISIONING',
        },
        data: {
          status: 'ACTIVE',
          pitrEnabled: true,
          provisioningDeadlineAt: null,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });

      if (activated.count !== 1) {
        return undefined;
      }

      await tx.projectSecret.upsert({
        where: { projectId_key: { projectId: input.projectId, key: 'DATABASE_URL' } },
        create: {
          projectId: input.projectId,
          key: 'DATABASE_URL',
          valueEncrypted: input.valueEncrypted,
          valueHash: hashToken(input.valueEncrypted),
        },
        update: {
          valueEncrypted: input.valueEncrypted,
          valueHash: hashToken(input.valueEncrypted),
        },
      });

      return mapRemixJob(
        await tx.remixJob.update({
          where: { id: job.id },
          data: { state: 'INDEXING', dbForked: true, version: { increment: 1 } },
        }),
      );
    });
  }

  async finalizeClaimedRemix(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.remixJobId,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const job = await tx.remixJob.findFirst({
        where: {
          id: input.remixJobId,
          organizationId: input.organizationId,
          state: 'INDEXING',
          operationToken: input.operationToken,
          operationExpiresAt: { gt: now },
          targetProjectId: input.targetProjectId,
        },
      });

      if (!job) {
        return undefined;
      }

      const activated = await tx.project.updateMany({
        where: { id: input.targetProjectId, organizationId: input.organizationId },
        data: { deletedAt: null },
      });

      if (activated.count !== 1) {
        return undefined;
      }

      return mapRemixJob(
        await tx.remixJob.update({
          where: { id: job.id },
          data: {
            state: 'COMPLETED',
            operationToken: null,
            operationExpiresAt: null,
            cleanupTerminalState: null,
            errorCode: null,
            error: null,
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async beginRemixCleanup(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    terminalState: 'FAILED';
    errorCode: string;
    error: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.remixJobId,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const job = await tx.remixJob.findFirst({
        where: { id: input.remixJobId, organizationId: input.organizationId },
      });

      if (
        !job ||
        job.state === 'COMPLETED' ||
        job.operationToken !== input.operationToken ||
        !job.operationExpiresAt ||
        job.operationExpiresAt <= now
      ) {
        return undefined;
      }

      return mapRemixJob(
        await tx.remixJob.update({
          where: { id: job.id },
          data: {
            state: 'CLEANUP_PENDING',
            cleanupTerminalState: input.terminalState,
            errorCode: input.errorCode,
            error: input.error,
            operationToken: input.operationToken,
            operationExpiresAt: databaseLeaseExpiry(now, 5 * 60_000),
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async deleteClaimedRemixProject(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertProjectMutable(tx, input.targetProjectId);
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.remixJobId,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const job = await tx.remixJob.findFirst({
        where: {
          id: input.remixJobId,
          organizationId: input.organizationId,
          state: 'CLEANUP_PENDING',
          operationToken: input.operationToken,
          operationExpiresAt: { gt: now },
          targetProjectId: input.targetProjectId,
        },
      });

      if (!job) {
        return false;
      }

      await tx.project.deleteMany({ where: { id: input.targetProjectId, organizationId: input.organizationId } });
      return true;
    });
  }

  async finishRemixCleanup(input: { remixJobId: string; organizationId: string; operationToken: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.remixJobId,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const job = await tx.remixJob.findFirst({
        where: {
          id: input.remixJobId,
          organizationId: input.organizationId,
          state: 'CLEANUP_PENDING',
          operationToken: input.operationToken,
          operationExpiresAt: { gt: now },
        },
      });

      if (!job || job.targetProjectId || job.cleanupTerminalState !== 'FAILED') {
        return undefined;
      }

      return mapRemixJob(
        await tx.remixJob.update({
          where: { id: job.id },
          data: {
            state: 'FAILED',
            operationToken: null,
            operationExpiresAt: null,
            cleanupTerminalState: null,
            storageShareId: null,
            targetDatabaseInstanceId: null,
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async getRemixJob(id: string, organizationId?: string) {
    const row = await this.prisma.remixJob.findFirst({ where: { id, ...(organizationId ? { organizationId } : {}) } });
    return row ? mapRemixJob(row) : undefined;
  }

  async createRemixStorageShare(input: {
    sourceProjectId: string;
    targetProjectId: string;
    sourceOrganizationId: string;
    targetOrganizationId: string;
    consentVersion: string;
    consentedByUserId?: string;
    sourceInventory: unknown;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.remixStorageShare.findUnique({ where: { targetProjectId: input.targetProjectId } });

      if (existing) {
        if (
          existing.sourceProjectId !== input.sourceProjectId ||
          existing.consentVersion !== input.consentVersion ||
          existing.state !== 'ACTIVE'
        ) {
          throw Object.assign(new Error(appPublicEnglish('REMIX_STORAGE_SHARE_CONFLICT')), {
            statusCode: 409,
            code: 'REMIX_STORAGE_SHARE_CONFLICT',
          });
        }

        return mapRemixStorageShare(existing);
      }

      return mapRemixStorageShare(
        await tx.remixStorageShare.create({
          data: {
            ...input,
            consentedByUserId: input.consentedByUserId ?? null,
            sourceInventory: input.sourceInventory as Prisma.InputJsonValue,
          },
        }),
      );
    });
  }

  async getRemixStorageShareByTarget(targetProjectId: string) {
    const row = await this.prisma.remixStorageShare.findUnique({ where: { targetProjectId } });
    return row && row.state === 'ACTIVE' ? mapRemixStorageShare(row) : undefined;
  }

  async revokeRemixStorageShare(input: { targetProjectId: string; targetOrganizationId: string }) {
    const updated = await this.prisma.remixStorageShare.updateMany({
      where: {
        targetProjectId: input.targetProjectId,
        targetOrganizationId: input.targetOrganizationId,
        state: 'ACTIVE',
      },
      data: { state: 'REVOKED', revokedAt: new Date() },
    });

    if (updated.count !== 1) return undefined;
    const row = await this.prisma.remixStorageShare.findUnique({ where: { targetProjectId: input.targetProjectId } });
    return row ? mapRemixStorageShare(row) : undefined;
  }

  async deleteClaimedRemixStorageShare(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.remixJobId,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const job = await tx.remixJob.findFirst({
        where: {
          id: input.remixJobId,
          organizationId: input.organizationId,
          state: 'CLEANUP_PENDING',
          operationToken: input.operationToken,
          operationExpiresAt: { gt: now },
          targetProjectId: input.targetProjectId,
        },
        select: { id: true },
      });

      if (!job) return false;
      return (await tx.remixStorageShare.deleteMany({ where: { targetProjectId: input.targetProjectId } })).count > 0;
    });
  }

  private mapGalleryListing(row: {
    id: string;
    slug: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    status: string;
    featured: boolean;
    sourceProjectId: string;
    sourceSnapshotId: string;
    authorName: string;
    authorUserId: string | null;
    appUrl: string | null;
    thumbnailUrl: string | null;
    remixAllowed: boolean;
    licenseId: string | null;
    licenseText: string | null;
    licenseTextSha256: string | null;
    piiConsentVersion: string | null;
    rightsConfirmedAt: Date | null;
    rightsConfirmedBy: string | null;
    piiPolicyAcceptedAt: Date | null;
    piiPolicyAcceptedBy: string | null;
    viewCount: number;
    useCount: number;
    createdAt: Date;
    publishedAt: Date | null;
  }): GalleryListingRecord {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      category: row.category,
      tags: row.tags,
      status: row.status,
      featured: row.featured,
      sourceProjectId: row.sourceProjectId,
      sourceSnapshotId: row.sourceSnapshotId,
      authorName: row.authorName,
      authorUserId: row.authorUserId ?? undefined,
      appUrl: row.appUrl ?? undefined,
      thumbnailUrl: row.thumbnailUrl ?? undefined,
      remixAllowed: row.remixAllowed,
      licenseId: row.licenseId ?? undefined,
      licenseText: row.licenseText ?? undefined,
      licenseTextSha256: row.licenseTextSha256 ?? undefined,
      piiConsentVersion: row.piiConsentVersion ?? undefined,
      rightsConfirmedAt: row.rightsConfirmedAt ?? undefined,
      rightsConfirmedBy: row.rightsConfirmedBy ?? undefined,
      piiPolicyAcceptedAt: row.piiPolicyAcceptedAt ?? undefined,
      piiPolicyAcceptedBy: row.piiPolicyAcceptedBy ?? undefined,
      viewCount: row.viewCount,
      useCount: row.useCount,
      createdAt: row.createdAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString(),
    };
  }

  async createGalleryListing(input: {
    slug: string;
    title: string;
    description: string;
    category: string;
    tags?: string[];
    status?: string;
    featured?: boolean;
    sourceProjectId: string;
    sourceSnapshotId: string;
    authorName: string;
    authorUserId?: string;
    appUrl?: string;
    thumbnailUrl?: string;
    remixAllowed?: boolean;
    licenseId?: string;
    licenseText?: string;
    licenseTextSha256?: string;
    piiConsentVersion?: string;
    rightsConfirmedAt?: Date;
    rightsConfirmedBy?: string;
    piiPolicyAcceptedAt?: Date;
    piiPolicyAcceptedBy?: string;
    publishedAt?: string;
  }) {
    const status = input.status ?? 'PUBLISHED';
    const row = await this.prisma.galleryListing.create({
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description,
        category: input.category,
        tags: input.tags ?? [],
        status,
        featured: input.featured ?? false,
        sourceProjectId: input.sourceProjectId,
        sourceSnapshotId: input.sourceSnapshotId,
        authorName: input.authorName,
        authorUserId: input.authorUserId ?? null,
        appUrl: input.appUrl ?? null,
        thumbnailUrl: input.thumbnailUrl ?? null,
        remixAllowed: input.remixAllowed ?? false, // FAIL-CLOSED : jamais remixable sans choix explicite
        licenseId: input.licenseId ?? null,
        licenseText: input.licenseText ?? null,
        licenseTextSha256: input.licenseTextSha256 ?? null,
        piiConsentVersion: input.piiConsentVersion ?? null,
        // Trace auditable des confirmations de curation (P0-V3-05, réserve #8).
        rightsConfirmedAt: input.rightsConfirmedAt ?? null,
        rightsConfirmedBy: input.rightsConfirmedBy ?? null,
        piiPolicyAcceptedAt: input.piiPolicyAcceptedAt ?? null,
        piiPolicyAcceptedBy: input.piiPolicyAcceptedBy ?? null,
        // A row published at creation records publishedAt so the detail page
        // can show a real date; a PENDING_REVIEW row leaves it null.
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : status === 'PUBLISHED' ? new Date() : null,
      },
    });

    return this.mapGalleryListing(row);
  }

  async listGalleryListings(opts?: {
    status?: string;
    category?: string;
    query?: string;
    featured?: boolean;
    limit?: number;
  }) {
    const status = opts?.status ?? 'PUBLISHED';
    const query = opts?.query?.trim();
    const rows = await this.prisma.galleryListing.findMany({
      where: {
        status,
        ...(opts?.category && opts.category !== 'all' ? { category: opts.category } : {}),
        ...(opts?.featured !== undefined ? { featured: opts.featured } : {}),
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
                { authorName: { contains: query, mode: 'insensitive' } },
                { tags: { has: query.toLowerCase() } },
              ],
            }
          : {}),
      },
      // Featured first, then most recently published, so the grid leads with
      // the curated highlights (mirrors the replit.com/gallery ordering).
      orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      ...(opts?.limit ? { take: opts.limit } : {}),
    });

    return rows.map((row) => this.mapGalleryListing(row));
  }

  async getGalleryListingBySlug(slug: string) {
    const row = await this.prisma.galleryListing.findUnique({ where: { slug } });
    return row ? this.mapGalleryListing(row) : undefined;
  }

  async getGalleryListingById(id: string) {
    const row = await this.prisma.galleryListing.findUnique({ where: { id } });
    return row ? this.mapGalleryListing(row) : undefined;
  }

  async incrementGalleryListingViews(id: string) {
    await this.prisma.galleryListing.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  }

  async incrementGalleryListingUses(id: string) {
    await this.prisma.galleryListing.update({ where: { id }, data: { useCount: { increment: 1 } } });
  }

  async createImportJob(input: {
    organizationId: string;
    actorUserId?: string;
    provider: string;
    sourceRef?: string;
    expiresAt?: string;
    expiresInMs?: number;
    idempotencyKey: string;
    requestHash: string;
    reservedCredits: number;
  }) {
    const ledger = new LedgerStore(this.prisma);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const now = await databaseNow(tx);
        const job = await tx.importJob.create({
          data: {
            organizationId: input.organizationId,
            actorUserId: input.actorUserId ?? null,
            provider: input.provider,
            sourceRef: input.sourceRef ?? null,
            expiresAt:
              input.expiresInMs !== undefined
                ? databaseDeadline(now, input.expiresInMs)
                : input.expiresAt
                  ? new Date(input.expiresAt)
                  : null,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            state: 'RECEIVED',
            creditsReserved: true,
          },
        });
        const reserved = await ledger.reserveUsageInTransaction(tx, {
          organizationId: input.organizationId,
          userId: input.actorUserId,
          idempotencyKey: importLedgerReservationKey(input.idempotencyKey),
          requestHash: input.requestHash,
          operation: 'import',
          currency: IMPORT_LEDGER_CURRENCY,
          maxAmountMinor: importCreditsToMinor(input.reservedCredits),
          importJobId: job.id,
          ...(input.expiresInMs !== undefined
            ? { expiresInMs: input.expiresInMs }
            : input.expiresAt
              ? { expiresAt: input.expiresAt }
              : {}),
        });
        const reservation = await tx.ledgerReservation.findUniqueOrThrow({ where: { id: reserved.id } });

        return { job, reservation };
      });

      return {
        job: mapImportJob(created.job),
        reservation: mapCanonicalImportReservation(created.reservation, input.idempotencyKey),
        replayed: false,
      };
    } catch (error) {
      if (!isPrismaKnownRequestError(error) || error.code !== 'P2002') {
        throw error;
      }

      const existing = await this.prisma.importJob.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { reservation: true },
      });

      const canonical = existing
        ? await this.prisma.ledgerReservation.findFirst({
            where: {
              organizationId: input.organizationId,
              importJobId: existing.id,
              operation: 'import',
              currency: IMPORT_LEDGER_CURRENCY,
            },
          })
        : null;

      if (!existing || (!canonical && !existing.reservation) || existing.requestHash !== input.requestHash) {
        throw Object.assign(new Error(appPublicEnglish('IMPORT_IDEMPOTENCY_CONFLICT')), {
          statusCode: 409,
          code: 'IMPORT_IDEMPOTENCY_CONFLICT',
        });
      }

      return {
        job: mapImportJob(existing),
        reservation: canonical
          ? mapCanonicalImportReservation(canonical, existing.idempotencyKey)
          : mapImportReservation(existing.reservation),
        replayed: true,
      };
    }
  }

  async getImportStaging(id: string, organizationId: string) {
    const row = await this.prisma.importJob.findFirst({
      where: { id, organizationId },
      select: { stagedFiles: true, connectorPreview: true },
    });
    const files = importStagedFiles(row?.stagedFiles);

    if (!row || !files) {
      return undefined;
    }

    return { files, preview: row.connectorPreview ?? undefined };
  }

  async getImportReservationByJob(importJobId: string, organizationId: string) {
    const canonical = await this.prisma.ledgerReservation.findFirst({
      where: { importJobId, organizationId, operation: 'import', currency: IMPORT_LEDGER_CURRENCY },
    });

    if (canonical) {
      const job = await this.prisma.importJob.findFirst({
        where: { id: importJobId, organizationId },
        select: { idempotencyKey: true },
      });

      return job ? mapCanonicalImportReservation(canonical, job.idempotencyKey) : undefined;
    }

    const row = await this.prisma.importCreditReservation.findFirst({ where: { importJobId, organizationId } });

    return row ? mapImportReservation(row) : undefined;
  }

  async transitionImportJob(input: {
    id: string;
    organizationId: string;
    expectedVersion: number;
    expectedStates: string[];
    state: string;
    patch?: ImportJobTransitionPatch;
    operationLeaseDurationMs?: number;
  }) {
    const operationLeaseDurationMs = input.operationLeaseDurationMs;
    if (operationLeaseDurationMs !== undefined) {
      return this.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "ImportJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
          input.id,
          input.organizationId,
        );
        const now = await databaseNow(tx);
        const row = await tx.importJob.findFirst({
          where: {
            id: input.id,
            organizationId: input.organizationId,
            version: input.expectedVersion,
            state: { in: input.expectedStates },
          },
        });
        if (!row) return undefined;

        return mapImportJob(
          await tx.importJob.update({
            where: { id: row.id },
            data: {
              state: input.state,
              version: { increment: 1 },
              ...importTransitionData(input.patch),
              operationExpiresAt: databaseLeaseExpiry(now, operationLeaseDurationMs),
            },
          }),
        );
      });
    }

    const updated = await this.prisma.importJob.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        version: input.expectedVersion,
        state: { in: input.expectedStates },
      },
      data: {
        state: input.state,
        version: { increment: 1 },
        ...importTransitionData(input.patch),
      },
    });

    if (updated.count !== 1) {
      return undefined;
    }

    const row = await this.prisma.importJob.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
    });

    return row ? mapImportJob(row) : undefined;
  }

  async renewImportJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
    leaseDurationMs: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "ImportJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.id,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const row = await tx.importJob.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          state: { in: input.expectedStates },
          operationToken: input.operationToken,
          operationExpiresAt: { gt: now },
        },
      });
      if (!row) return undefined;

      return mapImportJob(
        await tx.importJob.update({
          where: { id: row.id },
          data: {
            operationExpiresAt: databaseLeaseExpiry(now, input.leaseDurationMs),
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async validateImportJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      const now = await databaseNow(tx);
      const count = await tx.importJob.count({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          state: { in: input.expectedStates },
          operationToken: input.operationToken,
          operationExpiresAt: { gt: now },
        },
      });

      return count === 1;
    });
  }

  async createClaimedImportProject(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    name: string;
    slug: string;
    sourceType: ProjectRecord['sourceType'];
    description?: string;
    templateName?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
    initialManifest?: unknown;
    manifestCloneMode?: ProjectManifestCloneMode;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertMembershipMutable(tx, input.organizationId);
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "ImportJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.importJobId,
        input.organizationId,
      );
      const job = await tx.importJob.findFirst({
        where: { id: input.importJobId, organizationId: input.organizationId },
      });
      const now = await databaseNow(tx);

      if (
        !job ||
        job.state !== 'COMMITTING' ||
        job.operationToken !== input.operationToken ||
        !job.operationExpiresAt ||
        job.operationExpiresAt <= now
      ) {
        throw Object.assign(new Error(appPublicEnglish('IMPORT_COMMIT_OWNERSHIP_LOST')), {
          statusCode: 409,
          code: 'IMPORT_COMMIT_OWNERSHIP_LOST',
        });
      }

      const ensureInitialManifest = async (targetProjectId: string) => {
        const existingRevisionRow = await tx.projectManifestRevision.findFirst({
          where: { projectId: targetProjectId },
          orderBy: { manifestVersion: 'desc' },
        });

        if (existingRevisionRow) {
          verifyStoredProjectManifestRevision(mapProjectManifestRevision(existingRevisionRow), targetProjectId);
          return;
        }

        const manifest = input.initialManifest
          ? projectManifestForClone(input.initialManifest, targetProjectId, input.manifestCloneMode)
          : createDefaultProjectManifest(targetProjectId);
        await tx.projectManifestRevision.create({
          data: {
            projectId: targetProjectId,
            schemaVersion: manifest.schemaVersion,
            manifestVersion: manifest.manifestVersion,
            digest: projectManifestDigest(manifest),
            manifest: manifest as Prisma.InputJsonValue,
            createdByUserId: job.actorUserId,
          },
        });
      };

      if (job.targetProjectId) {
        const existing = await tx.project.findFirst({
          where: { id: job.targetProjectId, organizationId: input.organizationId },
        });

        if (existing) {
          await ensureInitialManifest(existing.id);
          return mapProject(existing);
        }
      }

      const baseSlug = slugify(input.slug) || `import-${job.id.slice(-8).toLowerCase()}`;
      const occupied = await tx.project.findUnique({
        where: { organizationId_slug: { organizationId: input.organizationId, slug: baseSlug } },
        select: { id: true },
      });
      const slug = occupied ? `${baseSlug}-${job.id.slice(-8).toLowerCase()}` : baseSlug;
      const project = await tx.project.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          slug,
          sourceType: input.sourceType,
          description: input.description,
          templateName: input.templateName,
          gitRepositoryUrl: input.gitRepositoryUrl,
          gitDefaultBranch: input.gitDefaultBranch,
          persistentVolumeClaim: `pvc-${input.organizationId}-${slug}`,
          // Hidden until files, file manifest, billing settlement and import
          // state commit succeed atomically in finalizeImportCommit.
          deletedAt: now,
        },
      });
      await ensureInitialManifest(project.id);
      await tx.importJob.update({
        where: { id: job.id },
        data: { targetProjectId: project.id, version: { increment: 1 } },
      });

      return mapProject(project);
    });
  }

  async finalizeImportCommit(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
    actualCredits: number;
  }) {
    const ledger = new LedgerStore(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "ImportJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.importJobId,
        input.organizationId,
      );
      const job = await tx.importJob.findFirst({
        where: { id: input.importJobId, organizationId: input.organizationId },
      });

      if (!job) {
        return undefined;
      }

      if (job.state === 'COMMITTED' && job.targetProjectId === input.targetProjectId) {
        const canonical = await tx.ledgerReservation.findFirst({
          where: {
            importJobId: job.id,
            organizationId: input.organizationId,
            operation: 'import',
            currency: IMPORT_LEDGER_CURRENCY,
            status: 'COMMITTED',
          },
        });
        const legacy = canonical
          ? null
          : await tx.importCreditReservation.findFirst({
              where: { importJobId: job.id, organizationId: input.organizationId, state: 'SETTLED' },
            });

        return canonical || legacy
          ? {
              job: mapImportJob(job),
              reservation: canonical
                ? mapCanonicalImportReservation(canonical, job.idempotencyKey)
                : mapImportReservation(legacy),
            }
          : undefined;
      }

      if (
        job.state !== 'COMMITTING' ||
        job.targetProjectId !== input.targetProjectId ||
        job.operationToken !== input.operationToken ||
        !job.operationExpiresAt ||
        job.operationExpiresAt <= (await databaseNow(tx))
      ) {
        return undefined;
      }

      await tx.$queryRawUnsafe('SELECT "id" FROM "Project" WHERE "id" = $1 FOR UPDATE', input.targetProjectId);
      const target = await tx.project.findFirst({
        where: { id: input.targetProjectId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!target) {
        return undefined;
      }

      const canonical = await tx.ledgerReservation.findFirst({
        where: {
          importJobId: job.id,
          organizationId: input.organizationId,
          operation: 'import',
          currency: IMPORT_LEDGER_CURRENCY,
        },
      });
      let reservation: ImportCreditReservationRecord;

      if (canonical) {
        await ledger.commitReservationInTransaction(tx, {
          reservationId: canonical.id,
          actualAmountMinor: importCreditsToMinor(input.actualCredits),
          refuseOverage: true,
        });
        const committedReservation = await tx.ledgerReservation.findUniqueOrThrow({ where: { id: canonical.id } });
        reservation = mapCanonicalImportReservation(committedReservation, job.idempotencyKey);
      } else {
        const settled = await tx.importCreditReservation.updateMany({
          where: { importJobId: job.id, organizationId: input.organizationId, state: 'RESERVED' },
          data: {
            state: 'SETTLED',
            debitedCredits: input.actualCredits,
            version: { increment: 1 },
          },
        });

        if (settled.count !== 1) {
          throw Object.assign(new Error(appPublicEnglish('IMPORT_COMMIT_OWNERSHIP_LOST')), {
            statusCode: 409,
            code: 'IMPORT_RESERVATION_SETTLEMENT_FAILED',
          });
        }
        reservation = mapImportReservation(
          await tx.importCreditReservation.findUniqueOrThrow({ where: { importJobId: job.id } }),
        );
      }

      /*
       * Reveal in the same transaction as SETTLED + COMMITTED. Updating an
       * already-visible legacy partial target is intentionally supported during
       * rolling upgrades; all targets created by this release start hidden.
       */
      await tx.project.update({ where: { id: target.id }, data: { deletedAt: null } });

      const committed = await tx.importJob.update({
        where: { id: job.id },
        data: {
          state: 'COMMITTED',
          stagedFiles: Prisma.DbNull,
          connectorPreview: Prisma.DbNull,
          operationToken: null,
          operationExpiresAt: null,
          cleanupTerminalState: null,
          error: null,
          version: { increment: 1 },
        },
      });

      return { job: mapImportJob(committed), reservation };
    });
  }

  async beginImportCleanup(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
    terminalState: 'ROLLING_BACK' | 'EXPIRED' | 'FAILED';
    error?: string;
  }) {
    const ledger = new LedgerStore(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "ImportJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.importJobId,
        input.organizationId,
      );
      const job = await tx.importJob.findFirst({
        where: { id: input.importJobId, organizationId: input.organizationId },
      });
      const now = await databaseNow(tx);
      const activeOtherOwner =
        job?.operationToken &&
        job.operationToken !== input.operationToken &&
        job.operationExpiresAt &&
        job.operationExpiresAt > now;

      if (!job || !input.expectedStates.includes(job.state) || activeOtherOwner) {
        return undefined;
      }

      const canonical = await tx.ledgerReservation.findFirst({
        where: {
          importJobId: job.id,
          organizationId: input.organizationId,
          operation: 'import',
          currency: IMPORT_LEDGER_CURRENCY,
        },
      });

      if (canonical?.status === 'COMMITTED') {
        return undefined;
      }

      if (canonical?.status === 'ACTIVE') {
        const released = await ledger.releaseReservationInTransaction(
          tx,
          canonical.id,
          input.terminalState === 'EXPIRED' ? 'timeout' : 'failure',
          { expectedVersion: canonical.version },
        );

        if (!released.released) {
          return undefined;
        }
      } else if (!canonical) {
        const legacy = await tx.importCreditReservation.findFirst({
          where: { importJobId: job.id, organizationId: input.organizationId },
        });

        if (legacy?.state === 'SETTLED') {
          return undefined;
        }

        if (legacy?.state === 'RESERVED') {
          await tx.importCreditReservation.update({
            where: { id: legacy.id },
            data: { state: 'COMPENSATED', debitedCredits: 0, version: { increment: 1 } },
          });
        }
      }

      if (job.targetProjectId) {
        await tx.project.updateMany({
          where: { id: job.targetProjectId, organizationId: input.organizationId },
          data: { deletedAt: now },
        });
      }

      return mapImportJob(
        await tx.importJob.update({
          where: { id: job.id },
          data: {
            state: 'CLEANUP_PENDING',
            stagedFiles: Prisma.DbNull,
            connectorPreview: Prisma.DbNull,
            operationToken: input.operationToken,
            operationExpiresAt: databaseLeaseExpiry(now, 5 * 60_000),
            cleanupTerminalState: input.terminalState,
            error: input.error ?? null,
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async deleteClaimedImportProject(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertProjectMutable(tx, input.targetProjectId);
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "ImportJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.importJobId,
        input.organizationId,
      );
      const job = await tx.importJob.findFirst({
        where: {
          id: input.importJobId,
          organizationId: input.organizationId,
          state: 'CLEANUP_PENDING',
          operationToken: input.operationToken,
          targetProjectId: input.targetProjectId,
          operationExpiresAt: { gt: await databaseNow(tx) },
        },
      });

      if (!job) {
        return false;
      }

      const deleted = await tx.project.deleteMany({
        where: { id: input.targetProjectId, organizationId: input.organizationId, deletedAt: { not: null } },
      });

      return deleted.count === 1;
    });
  }

  async finishImportCleanup(input: { importJobId: string; organizationId: string; operationToken: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "ImportJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.importJobId,
        input.organizationId,
      );
      const now = await databaseNow(tx);
      const row = await tx.importJob.findFirst({
        where: {
          id: input.importJobId,
          organizationId: input.organizationId,
          state: 'CLEANUP_PENDING',
          operationToken: input.operationToken,
          operationExpiresAt: { gt: now },
          targetProjectId: null,
        },
      });
      const terminal = row?.cleanupTerminalState;

      if (!row || !terminal || !['ROLLING_BACK', 'EXPIRED', 'FAILED'].includes(terminal)) {
        return undefined;
      }

      return mapImportJob(
        await tx.importJob.update({
          where: { id: row.id },
          data: {
            state: terminal,
            targetProjectId: null,
            operationToken: null,
            operationExpiresAt: null,
            cleanupTerminalState: null,
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async cancelImportJob(importJobId: string, organizationId: string) {
    const ledger = new LedgerStore(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "ImportJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        importJobId,
        organizationId,
      );
      const job = await tx.importJob.findFirst({ where: { id: importJobId, organizationId } });

      if (!job) {
        return undefined;
      }

      if (job.state === 'CANCELLED') {
        return mapImportJob(job);
      }

      if (['COMMITTED', 'COMMITTING', 'CLEANUP_PENDING', 'ROLLING_BACK', 'EXPIRED', 'FAILED'].includes(job.state)) {
        return undefined;
      }

      const canonical = await tx.ledgerReservation.findFirst({
        where: { importJobId, organizationId, operation: 'import', currency: IMPORT_LEDGER_CURRENCY },
      });

      if (canonical?.status === 'COMMITTED') {
        return undefined;
      }

      if (canonical?.status === 'ACTIVE') {
        const released = await ledger.releaseReservationInTransaction(tx, canonical.id, 'cancel', {
          expectedVersion: canonical.version,
        });

        if (!released.released) {
          return undefined;
        }
      } else if (!canonical) {
        const legacy = await tx.importCreditReservation.findFirst({ where: { importJobId, organizationId } });

        if (legacy?.state === 'SETTLED') {
          return undefined;
        }

        if (legacy?.state === 'RESERVED') {
          await tx.importCreditReservation.update({
            where: { id: legacy.id },
            data: { state: 'COMPENSATED', debitedCredits: 0, version: { increment: 1 } },
          });
        }
      }

      return mapImportJob(
        await tx.importJob.update({
          where: { id: job.id },
          data: {
            state: 'CANCELLED',
            stagedFiles: Prisma.DbNull,
            connectorPreview: Prisma.DbNull,
            operationToken: null,
            operationExpiresAt: null,
            cleanupTerminalState: null,
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async getImportJob(id: string) {
    const row = await this.prisma.importJob.findUnique({ where: { id } });

    if (!row) {
      return undefined;
    }

    return mapImportJob(row);
  }

  async reapExpiredImportJobs(_nowIso?: string): Promise<string[]> {
    /*
     * PostgreSQL is the sole clock authority. The legacy optional argument is
     * retained only for interface compatibility with deterministic in-memory
     * tests; production never lets a fast/slow API pod choose what is expired.
     */
    const stale = await this.prisma.$queryRaw<Array<{ id: string; targetProjectId: string | null }>>(Prisma.sql`
      SELECT "id", "targetProjectId"
      FROM "ImportJob"
      WHERE (
          "state" IN (
            'RECEIVED', 'STAGING_ISOLATED', 'SCANNING', 'QUARANTINED',
            'AWAITING_USER_ACTION', 'RESCANNING', 'READY_TO_COMMIT'
          )
          AND "expiresAt" IS NOT NULL
          AND "expiresAt" <= clock_timestamp()
        ) OR (
          "state" IN ('COMMITTING', 'CLEANUP_PENDING')
          AND "operationExpiresAt" IS NOT NULL
          AND "operationExpiresAt" <= clock_timestamp()
        )
      ORDER BY "createdAt" ASC
      LIMIT 100
    `);
    const claimed: string[] = [];
    const ledger = new LedgerStore(this.prisma);

    for (const candidate of stale) {
      const won = await this.prisma.$transaction(async (tx) => {
        /*
         * Same distributed effect lock as the writer/cleaner. Acquire it before
         * the ImportJob row lock to avoid a job-row ↔ effect-lock deadlock with
         * finalize. If the target changed since the scan, skip and let the next
         * sweep retry with the correct lock key.
         */
        if (candidate.targetProjectId) {
          await tx.$executeRawUnsafe(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            `import-target-effect:${candidate.targetProjectId}`,
          );
        }
        await tx.$queryRawUnsafe('SELECT "id" FROM "ImportJob" WHERE "id" = $1 FOR UPDATE', candidate.id);
        const job = await tx.importJob.findUnique({ where: { id: candidate.id } });

        if (!job || job.targetProjectId !== candidate.targetProjectId) {
          return false;
        }

        const now = await databaseNow(tx);
        const operationExpired =
          ['COMMITTING', 'CLEANUP_PENDING'].includes(job.state) &&
          Boolean(job.operationExpiresAt && job.operationExpiresAt <= now);
        const preCommitExpired =
          !['COMMITTING', 'CLEANUP_PENDING'].includes(job.state) && Boolean(job.expiresAt && job.expiresAt <= now);

        if (
          (!preCommitExpired && !operationExpired) ||
          ['COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED'].includes(job.state)
        ) {
          return false;
        }

        const canonical = await tx.ledgerReservation.findFirst({
          where: {
            importJobId: job.id,
            organizationId: job.organizationId,
            operation: 'import',
            currency: IMPORT_LEDGER_CURRENCY,
          },
        });

        if (canonical?.status === 'COMMITTED') {
          return false;
        }

        if (canonical?.status === 'ACTIVE') {
          const released = await ledger.releaseReservationInTransaction(
            tx,
            canonical.id,
            operationExpired ? 'failure' : 'timeout',
            { expectedVersion: canonical.version },
          );

          if (!released.released) {
            return false;
          }
        } else if (!canonical) {
          const legacy = await tx.importCreditReservation.findFirst({
            where: { importJobId: job.id, organizationId: job.organizationId },
          });

          if (legacy?.state === 'SETTLED') {
            return false;
          }

          if (legacy?.state === 'RESERVED') {
            await tx.importCreditReservation.update({
              where: { id: legacy.id },
              data: { state: 'COMPENSATED', debitedCredits: 0, version: { increment: 1 } },
            });
          }
        }

        const token = randomUUID();
        if (job.targetProjectId) {
          await tx.project.updateMany({
            where: { id: job.targetProjectId, organizationId: job.organizationId },
            data: { deletedAt: now },
          });
        }
        await tx.importJob.update({
          where: { id: job.id },
          data: job.targetProjectId
            ? {
                state: 'CLEANUP_PENDING',
                cleanupTerminalState: 'EXPIRED',
                operationToken: token,
                operationExpiresAt: databaseLeaseExpiry(now, 5 * 60_000),
                stagedFiles: Prisma.DbNull,
                connectorPreview: Prisma.DbNull,
                error: appPublicEnglish('IMPORT_STAGING_EXPIRED'),
                version: { increment: 1 },
              }
            : {
                state: 'EXPIRED',
                operationToken: null,
                operationExpiresAt: null,
                cleanupTerminalState: null,
                stagedFiles: Prisma.DbNull,
                connectorPreview: Prisma.DbNull,
                error: appPublicEnglish('IMPORT_STAGING_EXPIRED'),
                version: { increment: 1 },
              },
        });

        return true;
      });

      if (won) {
        claimed.push(candidate.id);
      }
    }

    return claimed;
  }

  async deleteProjectSecret(projectId: string, key: string) {
    /*
     * find-then-delete raced a concurrent delete into an unhandled P2025; use a
     * count-gated deleteMany so a lost race is reported as "already gone".
     */
    const existing = await this.prisma.projectSecret.findUnique({ where: { projectId_key: { projectId, key } } });

    if (!existing) {
      return undefined;
    }

    const deleted = await this.prisma.projectSecret.deleteMany({ where: { projectId, key } });

    return deleted.count > 0 ? mapSecret(existing) : undefined;
  }

  async addProjectCollaborator(input: { projectId: string; userId: string; roleKey: string; expiresAt?: Date | null }) {
    return this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertProjectMutable(tx, input.projectId, [input.userId]);
      return mapProjectCollaborator(
        await tx.projectCollaborator.upsert({
          where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
          create: {
            projectId: input.projectId,
            userId: input.userId,
            roleKey: input.roleKey,
            expiresAt: input.expiresAt ?? null,
          },
          update: { roleKey: input.roleKey, expiresAt: input.expiresAt ?? null },
        }),
      );
    });
  }

  async listProjectCollaborators(projectId: string) {
    return (await this.prisma.projectCollaborator.findMany({ where: { projectId } })).map(mapProjectCollaborator);
  }

  async removeProjectCollaborator(input: { projectId: string; userId: string }): Promise<boolean> {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertProjectMutable(tx, input.projectId, [input.userId]);
      return tx.projectCollaborator.deleteMany({
        where: { projectId: input.projectId, userId: input.userId },
      });
    });

    return result.count > 0;
  }

  async createCollaborationGroup(input: {
    organizationId: string;
    name: string;
    source: 'MANUAL' | 'SCIM';
    externalId?: string;
  }) {
    return mapCollaborationGroup(
      await this.prisma.collaborationGroup.create({
        data: {
          organizationId: input.organizationId,
          name: input.name.trim(),
          normalizedName: normalizeCollaborationGroupName(input.name),
          source: input.source,
          externalId: input.externalId,
        },
      }),
    );
  }

  async getCollaborationGroup(groupId: string) {
    const group = await this.prisma.collaborationGroup.findUnique({ where: { id: groupId } });
    return group ? mapCollaborationGroup(group) : undefined;
  }

  async findScimCollaborationGroup(organizationId: string, externalId: string) {
    const group = await this.prisma.collaborationGroup.findFirst({
      where: { organizationId, externalId, source: 'SCIM', deletedAt: null },
    });
    return group ? mapCollaborationGroup(group) : undefined;
  }

  async updateScimCollaborationGroup(input: { organizationId: string; groupId: string; name: string }) {
    const updated = await this.prisma.collaborationGroup.updateMany({
      where: { id: input.groupId, organizationId: input.organizationId, source: 'SCIM', deletedAt: null },
      data: { name: input.name.trim(), normalizedName: normalizeCollaborationGroupName(input.name) },
    });

    return updated.count === 1 ? this.getCollaborationGroup(input.groupId) : undefined;
  }

  async syncScimCollaborationGroup(input: {
    organizationId: string;
    groupId?: string;
    externalId?: string | null;
    name: string;
    userIds: string[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      const uniqueUserIds = [...new Set(input.userIds)];
      const memberships = await tx.organizationMember.findMany({
        where: { organizationId: input.organizationId, userId: { in: uniqueUserIds }, state: 'ACTIVE' },
        select: { id: true },
      });

      if (memberships.length !== uniqueUserIds.length) {
        return { ok: false as const, reason: COLLABORATION_REASON.membershipNotActive };
      }

      const existing = input.groupId
        ? await tx.collaborationGroup.findFirst({
            where: { id: input.groupId, organizationId: input.organizationId, deletedAt: null },
          })
        : input.externalId
          ? await tx.collaborationGroup.findFirst({
              where: { organizationId: input.organizationId, externalId: input.externalId, deletedAt: null },
            })
          : undefined;

      if (input.groupId && !existing) {
        return { ok: false as const, reason: COLLABORATION_REASON.groupNotFound };
      }

      if (existing && existing.source !== 'SCIM') {
        return { ok: false as const, reason: COLLABORATION_REASON.groupManualOnly };
      }

      const group = existing
        ? await tx.collaborationGroup.update({
            where: { id: existing.id },
            data: {
              name: input.name.trim(),
              normalizedName: normalizeCollaborationGroupName(input.name),
              ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
            },
          })
        : await tx.collaborationGroup.create({
            data: {
              organizationId: input.organizationId,
              name: input.name.trim(),
              normalizedName: normalizeCollaborationGroupName(input.name),
              source: 'SCIM',
              externalId: input.externalId,
            },
          });

      await tx.collaborationGroupMember.deleteMany({
        where: { organizationId: input.organizationId, groupId: group.id },
      });

      if (memberships.length > 0) {
        await tx.collaborationGroupMember.createMany({
          data: memberships.map((membership) => ({
            organizationId: input.organizationId,
            groupId: group.id,
            membershipId: membership.id,
          })),
          skipDuplicates: true,
        });
      }

      return { ok: true as const, group: mapCollaborationGroup(group), created: !existing };
    });
  }

  async listCollaborationGroups(input: {
    organizationId: string;
    cursor?: string;
    offset?: number;
    source?: 'MANUAL' | 'SCIM';
    limit: number;
  }) {
    const groups = await this.prisma.collaborationGroup.findMany({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
        ...(input.source ? { source: input.source } : {}),
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      skip: input.offset,
      take: input.limit + 1,
    });
    const hasMore = groups.length > input.limit;
    const items = groups.slice(0, input.limit).map(mapCollaborationGroup);

    return { items, nextCursor: hasMore ? items.at(-1)?.id : undefined };
  }

  async countCollaborationGroups(organizationId: string, source?: 'MANUAL' | 'SCIM') {
    return this.prisma.collaborationGroup.count({
      where: { organizationId, deletedAt: null, ...(source ? { source } : {}) },
    });
  }

  async archiveCollaborationGroup(input: {
    organizationId: string;
    groupId: string;
    writer: 'MANUAL' | 'SCIM';
    actorUserId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.collaborationGroup.findFirst({
        where: { id: input.groupId, organizationId: input.organizationId, deletedAt: null },
      });

      if (!group) {
        return { ok: false as const, reason: COLLABORATION_REASON.groupNotFound };
      }

      if (group.source !== input.writer) {
        return {
          ok: false as const,
          reason:
            input.writer === 'MANUAL' ? COLLABORATION_REASON.groupScimManaged : COLLABORATION_REASON.groupManualOnly,
        };
      }

      const archived = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "CollaborationGroup"
        SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.groupId}
          AND "organizationId" = ${input.organizationId}
          AND "source" = ${input.writer}::"CollaborationGroupSource"
          AND "deletedAt" IS NULL
        RETURNING "id"
      `;

      if (archived.length !== 1) {
        return { ok: false as const, reason: COLLABORATION_REASON.groupNotFound };
      }

      await tx.$executeRaw`
        UPDATE "ResourceAccessGrant"
        SET "status" = 'REVOKED',
            "revokedAt" = CURRENT_TIMESTAMP,
            "revokedByUserId" = ${input.actorUserId ?? null},
            "revocationReason" = 'SUBJECT_GROUP_ARCHIVED',
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "organizationId" = ${input.organizationId}
          AND "subjectType" = 'GROUP'
          AND "subjectGroupId" = ${input.groupId}
          AND "status" <> 'REVOKED'
      `;

      return { ok: true as const, removed: true };
    });
  }

  async addCollaborationGroupMember(input: {
    organizationId: string;
    groupId: string;
    userId: string;
    writer: 'MANUAL' | 'SCIM';
  }) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.collaborationGroup.findFirst({
        where: { id: input.groupId, organizationId: input.organizationId, deletedAt: null },
      });

      if (!group) {
        return { ok: false as const, reason: COLLABORATION_REASON.groupNotFound };
      }

      if (group.source !== input.writer) {
        return {
          ok: false as const,
          reason:
            input.writer === 'MANUAL' ? COLLABORATION_REASON.groupScimManaged : COLLABORATION_REASON.groupManualOnly,
        };
      }

      const membership = await tx.organizationMember.findFirst({
        where: { organizationId: input.organizationId, userId: input.userId, state: 'ACTIVE' },
      });

      if (!membership) {
        return { ok: false as const, reason: COLLABORATION_REASON.membershipNotActive };
      }

      const member = await tx.collaborationGroupMember.upsert({
        where: { groupId_membershipId: { groupId: group.id, membershipId: membership.id } },
        create: { organizationId: input.organizationId, groupId: group.id, membershipId: membership.id },
        update: {},
      });

      return { ok: true as const, member: mapCollaborationGroupMember(member, input.userId) };
    });
  }

  async removeCollaborationGroupMember(input: {
    organizationId: string;
    groupId: string;
    userId: string;
    writer: 'MANUAL' | 'SCIM';
  }) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.collaborationGroup.findFirst({
        where: { id: input.groupId, organizationId: input.organizationId, deletedAt: null },
      });

      if (!group) {
        return { ok: false as const, reason: COLLABORATION_REASON.groupNotFound };
      }

      if (group.source !== input.writer) {
        return {
          ok: false as const,
          reason:
            input.writer === 'MANUAL' ? COLLABORATION_REASON.groupScimManaged : COLLABORATION_REASON.groupManualOnly,
        };
      }

      const membership = await tx.organizationMember.findFirst({
        where: { organizationId: input.organizationId, userId: input.userId },
      });

      if (!membership) {
        return { ok: false as const, reason: COLLABORATION_REASON.membershipNotActive };
      }

      const removed = await tx.collaborationGroupMember.deleteMany({
        where: { organizationId: input.organizationId, groupId: group.id, membershipId: membership.id },
      });

      return { ok: true as const, removed: removed.count === 1 };
    });
  }

  async replaceCollaborationGroupMembers(input: {
    organizationId: string;
    groupId: string;
    userIds: string[];
    writer: 'MANUAL' | 'SCIM';
  }) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.collaborationGroup.findFirst({
        where: { id: input.groupId, organizationId: input.organizationId, deletedAt: null },
      });

      if (!group) {
        return { ok: false as const, reason: COLLABORATION_REASON.groupNotFound };
      }

      if (group.source !== input.writer) {
        return {
          ok: false as const,
          reason:
            input.writer === 'MANUAL' ? COLLABORATION_REASON.groupScimManaged : COLLABORATION_REASON.groupManualOnly,
        };
      }

      const uniqueUserIds = [...new Set(input.userIds)];
      const memberships = await tx.organizationMember.findMany({
        where: { organizationId: input.organizationId, userId: { in: uniqueUserIds }, state: 'ACTIVE' },
        select: { id: true, userId: true },
      });

      if (memberships.length !== uniqueUserIds.length) {
        return { ok: false as const, reason: COLLABORATION_REASON.membershipNotActive };
      }

      await tx.collaborationGroupMember.deleteMany({
        where: { organizationId: input.organizationId, groupId: input.groupId },
      });

      if (memberships.length > 0) {
        await tx.collaborationGroupMember.createMany({
          data: memberships.map((membership) => ({
            organizationId: input.organizationId,
            groupId: input.groupId,
            membershipId: membership.id,
          })),
          skipDuplicates: true,
        });
      }

      return { ok: true as const, removed: false };
    });
  }

  async listCollaborationGroupMembers(input: {
    organizationId: string;
    groupId: string;
    cursor?: string;
    limit: number;
  }) {
    const members = await this.prisma.collaborationGroupMember.findMany({
      where: {
        organizationId: input.organizationId,
        groupId: input.groupId,
        membership: { state: 'ACTIVE' },
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      },
      include: { membership: { select: { userId: true } } },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
    });
    const hasMore = members.length > input.limit;
    const items = members
      .slice(0, input.limit)
      .map((member) => mapCollaborationGroupMember(member, member.membership.userId));

    return { items, nextCursor: hasMore ? items.at(-1)?.id : undefined };
  }

  async createResourceAccessGrant(input: {
    organizationId: string;
    subjectType: 'USER' | 'GROUP';
    subjectUserId?: string;
    subjectGroupId?: string;
    resourceType: 'PROJECT' | 'ARTIFACT' | 'DEPLOYMENT' | 'DATASET';
    resourceId: string;
    roleKey: string;
    status: 'PENDING_CONSENT' | 'ACTIVE';
    expiresAt: Date;
    acceptedAt?: Date;
    consentVersion?: string;
    grantedByUserId: string;
    idempotencyKey?: string;
    requestHash: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertMembershipMutable(
        tx,
        input.organizationId,
        input.subjectType === 'USER' && input.subjectUserId ? [input.subjectUserId] : [],
      );

      /*
       * Project transfer takes this same row FOR UPDATE. Lock and revalidate the
       * tenant before any idempotency replay or insert so a grant cannot read
       * org A, wait behind A→B, then land afterwards and silently reactivate if
       * the project ever returns to A.
       */
      if (input.resourceType === 'PROJECT') {
        await tx.$queryRawUnsafe('SELECT "id" FROM "Project" WHERE "id" = $1 FOR UPDATE', input.resourceId);
        const project = await tx.project.findUnique({
          where: { id: input.resourceId },
          select: { organizationId: true },
        });
        if (!project || project.organizationId !== input.organizationId) {
          return { ok: false as const, reason: COLLABORATION_REASON.activeGrantConflict };
        }
      }

      if (input.idempotencyKey) {
        const replay = await tx.resourceAccessGrant.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: input.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });

        if (replay) {
          return replay.requestHash === input.requestHash
            ? { ok: true as const, grant: mapResourceAccessGrant(replay), replayed: true }
            : { ok: false as const, reason: COLLABORATION_REASON.idempotencyConflict };
        }
      }
      /*
       * PostgreSQL cannot use CURRENT_TIMESTAMP in a partial-index predicate.
       * Close any expired predecessor with the database clock before attempting
       * the live-subject unique insert; concurrent creators still serialize on
       * ResourceAccessGrant_live_subject_resource_key and exactly one wins.
       */
      await tx.$executeRaw`
      UPDATE "ResourceAccessGrant"
      SET "status" = 'REVOKED',
          "revokedAt" = CURRENT_TIMESTAMP,
          "revocationReason" = 'EXPIRED_REPLACED',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "organizationId" = ${input.organizationId}
        AND "subjectType" = ${input.subjectType}::"AccessGrantSubjectType"
        AND "subjectUserId" IS NOT DISTINCT FROM ${input.subjectUserId ?? null}
        AND "subjectGroupId" IS NOT DISTINCT FROM ${input.subjectGroupId ?? null}
        AND "resourceType" = ${input.resourceType}::"AccessGrantResourceType"
        AND "resourceId" = ${input.resourceId}
        AND "status" <> 'REVOKED'
        AND "expiresAt" <= CURRENT_TIMESTAMP
    `;

      /*
       * DO NOTHING is intentional: expected retry/concurrency conflicts are
       * control flow, not exceptions that should pollute production error logs.
       * With no conflict target PostgreSQL protects both the idempotency key and
       * the partial live-subject/resource unique index atomically.
       */
      const inserted = await tx.$queryRaw<any[]>`
      INSERT INTO "ResourceAccessGrant" (
        "id", "organizationId", "subjectType", "subjectUserId", "subjectGroupId",
        "resourceType", "resourceId", "roleKey", "status", "expiresAt",
        "acceptedAt", "consentVersion", "grantedByUserId", "idempotencyKey",
        "requestHash", "createdAt", "updatedAt"
      ) VALUES (
        ${`access_grant_${randomUUID()}`},
        ${input.organizationId},
        ${input.subjectType}::"AccessGrantSubjectType",
        ${input.subjectUserId ?? null},
        ${input.subjectGroupId ?? null},
        ${input.resourceType}::"AccessGrantResourceType",
        ${input.resourceId},
        ${input.roleKey},
        ${input.status}::"AccessGrantStatus",
        ${input.expiresAt},
        ${input.acceptedAt ?? null},
        ${input.consentVersion ?? null},
        ${input.grantedByUserId},
        ${input.idempotencyKey ?? null},
        ${input.requestHash},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT DO NOTHING
      RETURNING *
    `;

      if (inserted.length === 1) {
        return { ok: true as const, grant: mapResourceAccessGrant(inserted[0]) };
      }

      const existing = await tx.resourceAccessGrant.findFirst({
        where: {
          organizationId: input.organizationId,
          subjectType: input.subjectType,
          subjectUserId: input.subjectUserId ?? null,
          subjectGroupId: input.subjectGroupId ?? null,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          status: { not: 'REVOKED' },
        },
      });

      if (existing?.requestHash === input.requestHash) {
        return { ok: true as const, grant: mapResourceAccessGrant(existing), replayed: true };
      }

      if (input.idempotencyKey) {
        const replay = await tx.resourceAccessGrant.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: input.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });

        if (replay) {
          return replay.requestHash === input.requestHash
            ? { ok: true as const, grant: mapResourceAccessGrant(replay), replayed: true }
            : { ok: false as const, reason: COLLABORATION_REASON.idempotencyConflict };
        }
      }

      return { ok: false as const, reason: COLLABORATION_REASON.activeGrantConflict };
    });
  }

  async getResourceAccessGrant(grantId: string) {
    const grant = await this.prisma.resourceAccessGrant.findUnique({ where: { id: grantId } });
    return grant ? mapResourceAccessGrant(grant) : undefined;
  }

  async listResourceAccessGrants(input: {
    organizationId: string;
    resourceType: 'PROJECT' | 'ARTIFACT' | 'DEPLOYMENT' | 'DATASET';
    resourceId: string;
    cursor?: string;
    limit: number;
  }) {
    const grants = await this.prisma.resourceAccessGrant.findMany({
      where: {
        organizationId: input.organizationId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
    });
    const hasMore = grants.length > input.limit;
    const items = grants.slice(0, input.limit).map(mapResourceAccessGrant);

    return { items, nextCursor: hasMore ? items.at(-1)?.id : undefined };
  }

  async listUserResourceAccessGrants(input: { userId: string; cursor?: string; limit: number }) {
    const grants = await this.prisma.resourceAccessGrant.findMany({
      where: {
        subjectType: 'USER',
        subjectUserId: input.userId,
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
    });
    const hasMore = grants.length > input.limit;
    const items = grants.slice(0, input.limit).map(mapResourceAccessGrant);

    return { items, nextCursor: hasMore ? items.at(-1)?.id : undefined };
  }

  async acceptResourceAccessGrant(input: { grantId: string; subjectUserId: string; consentVersion: string }) {
    const accepted = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.resourceAccessGrant.findUnique({
        where: { id: input.grantId },
        select: { organizationId: true },
      });
      if (!grant) return [];
      await this.accountPurge.assertMembershipMutable(tx, grant.organizationId, [input.subjectUserId]);

      return tx.$queryRaw<any[]>`
        UPDATE "ResourceAccessGrant"
        SET "status" = 'ACTIVE',
            "acceptedAt" = CURRENT_TIMESTAMP,
            "consentVersion" = ${input.consentVersion},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.grantId}
          AND "subjectType" = 'USER'
          AND "subjectUserId" = ${input.subjectUserId}
          AND "status" = 'PENDING_CONSENT'
          AND "revokedAt" IS NULL
          AND "expiresAt" > CURRENT_TIMESTAMP
        RETURNING *
      `;
    });

    if (accepted.length === 1) {
      return { ok: true as const, grant: mapResourceAccessGrant(accepted[0]) };
    }

    return this.describeGrantMutationFailure(input.grantId, input.subjectUserId, 'PENDING_CONSENT');
  }

  async rejectResourceAccessGrant(input: { grantId: string; subjectUserId: string; reason: string }) {
    const rejected = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.resourceAccessGrant.findUnique({
        where: { id: input.grantId },
        select: { organizationId: true },
      });
      if (!grant) return [];
      await this.accountPurge.assertMembershipMutable(tx, grant.organizationId, [input.subjectUserId]);

      return tx.$queryRaw<any[]>`
        UPDATE "ResourceAccessGrant"
        SET "status" = 'REVOKED',
            "revokedAt" = CURRENT_TIMESTAMP,
            "revokedByUserId" = ${input.subjectUserId},
            "revocationReason" = ${input.reason},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.grantId}
          AND "subjectType" = 'USER'
          AND "subjectUserId" = ${input.subjectUserId}
          AND "status" = 'PENDING_CONSENT'
          AND "revokedAt" IS NULL
        RETURNING *
      `;
    });

    if (rejected.length === 1) {
      return { ok: true as const, grant: mapResourceAccessGrant(rejected[0]) };
    }

    return this.describeGrantMutationFailure(input.grantId, input.subjectUserId, 'PENDING_CONSENT');
  }

  async revokeResourceAccessGrant(input: {
    organizationId: string;
    grantId: string;
    revokedByUserId: string;
    reason: string;
  }) {
    const revoked = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.resourceAccessGrant.findUnique({
        where: { id: input.grantId },
        select: { subjectType: true, subjectUserId: true },
      });
      await this.accountPurge.assertMembershipMutable(
        tx,
        input.organizationId,
        grant?.subjectType === 'USER' && grant.subjectUserId ? [grant.subjectUserId] : [],
      );

      return tx.$queryRaw<any[]>`
        UPDATE "ResourceAccessGrant"
        SET "status" = 'REVOKED',
            "revokedAt" = CURRENT_TIMESTAMP,
            "revokedByUserId" = ${input.revokedByUserId},
            "revocationReason" = ${input.reason},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.grantId}
          AND "organizationId" = ${input.organizationId}
          AND "status" <> 'REVOKED'
        RETURNING *
      `;
    });

    return revoked.length === 1
      ? { ok: true as const, grant: mapResourceAccessGrant(revoked[0]) }
      : { ok: false as const, reason: COLLABORATION_REASON.grantNotActive };
  }

  async listActiveProjectAccessRoles(projectId: string, userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ roleKey: string }>>`
      SELECT DISTINCT access_grant."roleKey"
      FROM "ResourceAccessGrant" AS access_grant
      JOIN "Project" AS project
        ON project."id" = access_grant."resourceId"
       AND project."organizationId" = access_grant."organizationId"
      LEFT JOIN "CollaborationGroup" AS subject_group
        ON subject_group."organizationId" = access_grant."organizationId"
       AND subject_group."id" = access_grant."subjectGroupId"
       AND subject_group."deletedAt" IS NULL
      WHERE access_grant."resourceType" = 'PROJECT'
        AND access_grant."resourceId" = ${projectId}
        AND access_grant."status" = 'ACTIVE'
        AND access_grant."acceptedAt" IS NOT NULL
        AND access_grant."revokedAt" IS NULL
        AND access_grant."expiresAt" > CURRENT_TIMESTAMP
        AND (
          (access_grant."subjectType" = 'USER' AND access_grant."subjectUserId" = ${userId})
          OR
          (
            access_grant."subjectType" = 'GROUP'
            AND subject_group."id" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "CollaborationGroupMember" AS group_member
              JOIN "OrganizationMember" AS membership
                ON membership."organizationId" = group_member."organizationId"
               AND membership."id" = group_member."membershipId"
              WHERE group_member."organizationId" = access_grant."organizationId"
                AND group_member."groupId" = access_grant."subjectGroupId"
                AND membership."userId" = ${userId}
                AND membership."state" = 'ACTIVE'
            )
          )
        )
    `;

    return rows.map((row) => row.roleKey);
  }

  private async describeGrantMutationFailure(
    grantId: string,
    subjectUserId: string,
    expectedStatus: 'PENDING_CONSENT' | 'ACTIVE',
  ) {
    const grant = await this.prisma.resourceAccessGrant.findUnique({ where: { id: grantId } });

    if (!grant) {
      return { ok: false as const, reason: COLLABORATION_REASON.grantNotFound };
    }

    if (grant.subjectType !== 'USER' || grant.subjectUserId !== subjectUserId) {
      return { ok: false as const, reason: COLLABORATION_REASON.grantSubjectMismatch };
    }

    const databaseNow = await this.prisma.$queryRaw<Array<{ expired: boolean }>>`
      SELECT (${grant.expiresAt} <= CURRENT_TIMESTAMP) AS "expired"
    `;

    if (databaseNow[0]?.expired) {
      return { ok: false as const, reason: COLLABORATION_REASON.grantExpired };
    }

    return {
      ok: false as const,
      reason:
        expectedStatus === 'PENDING_CONSENT'
          ? COLLABORATION_REASON.grantNotPending
          : COLLABORATION_REASON.grantNotActive,
    };
  }

  async recordProjectActivity(input: {
    projectId: string;
    actorUserId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }) {
    const activity = await this.prisma.projectActivity.create({
      data: { ...input, metadata: (input.metadata ?? undefined) as any },
    });
    return mapProjectActivity(activity);
  }

  async listProjectActivity(projectId: string, options: ProjectActivityListOptions = {}) {
    const limit = options.limit ? Math.min(Math.max(options.limit, 1), 200) : undefined;
    const where: any = { projectId };

    if (options.action) {
      where.action = options.action;
    }

    if (options.actorUserId) {
      where.actorUserId = options.actorUserId;
    }

    if (options.since || options.until) {
      where.createdAt = {
        ...(options.since ? { gte: new Date(options.since) } : {}),
        ...(options.until ? { lte: new Date(options.until) } : {}),
      };
    }

    /*
     * Bound the query so a long-lived project's activity table (one row per AI
     * action / file save / deploy) can't be loaded wholesale into memory. With
     * no search filter, `take: limit` is identical to the old fetch-all + slice.
     * With a search filter we still need to scan more rows than we return, so we
     * cap at a generous safety ceiling rather than fetching the entire table.
     */
    const SAFETY_CAP = 1000;
    const search = options.search?.trim().toLowerCase();
    const requestedOrder = options.order ?? 'asc';
    const take = search ? SAFETY_CAP : (limit ?? SAFETY_CAP);

    const records = (
      await this.prisma.projectActivity.findMany({
        where,

        /*
         * When searching we scan a capped window rather than the whole table.
         * Always take the MOST RECENT rows (desc) in that case so a search can
         * match recent activity on a project with more than SAFETY_CAP rows —
         * `orderBy: asc` + `take` previously fetched the OLDEST 1000 and could
         * never surface a recent match. Re-sort to the requested order below.
         */
        orderBy: { createdAt: search ? 'desc' : requestedOrder },
        take,
      })
    ).map(mapProjectActivity);

    const filtered = search
      ? records.filter(
          (activity) =>
            activity.action.toLowerCase().includes(search) ||
            activity.actorUserId?.toLowerCase().includes(search) ||
            JSON.stringify(activity.metadata ?? {})
              .toLowerCase()
              .includes(search),
        )
      : records;

    // We fetched desc when searching; restore the caller's requested order.
    const ordered = search && requestedOrder === 'asc' ? [...filtered].reverse() : filtered;

    return typeof limit === 'number' ? ordered.slice(0, limit) : ordered;
  }

  async getProjectIdeState(projectId: string) {
    const state = await this.prisma.projectIdeState.findUnique({ where: { projectId } });
    return state ? mapProjectIdeState(state) : undefined;
  }

  async upsertProjectIdeState(input: {
    projectId: string;
    state: unknown;
    updatedByUserId?: string;
    expectedVersion?: number;
  }) {
    if (input.expectedVersion !== undefined) {
      /*
       * Atomic optimistic-concurrency write: only succeed if the row's version
       * still equals what the caller read. The handler's separate
       * read-then-version-check was not atomic, so two concurrent writers who
       * both passed the check would both increment and last-write-wins clobbered
       * one. A conditional updateMany closes that race — count===0 means another
       * writer won, which the caller surfaces as 412.
       */
      const result = await this.prisma.projectIdeState.updateMany({
        where: { projectId: input.projectId, version: input.expectedVersion },
        data: {
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw Object.assign(new Error(appPublicEnglish('IDE_STATE_VERSION_CONFLICT')), {
          code: 'IDE_STATE_VERSION_CONFLICT',
        });
      }

      const updated = await this.prisma.projectIdeState.findUnique({ where: { projectId: input.projectId } });

      if (!updated) {
        // The row was deleted/archived between the updateMany and this read.
        throw Object.assign(new Error(appPublicEnglish('IDE_STATE_NOT_FOUND')), { code: 'IDE_STATE_NOT_FOUND' });
      }

      return mapProjectIdeState(updated);
    }

    return mapProjectIdeState(
      await this.prisma.projectIdeState.upsert({
        where: { projectId: input.projectId },
        create: {
          projectId: input.projectId,
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
        },
        update: {
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
          version: { increment: 1 },
        },
      }),
    );
  }

  async getWorkspaceIdeState(workspaceId: string) {
    const state = await this.prisma.workspaceIdeState.findUnique({ where: { workspaceId } });
    return state ? mapWorkspaceIdeState(state) : undefined;
  }

  async upsertWorkspaceIdeState(input: {
    workspaceId: string;
    state: unknown;
    updatedByUserId?: string;
    expectedVersion?: number;
  }) {
    if (input.expectedVersion !== undefined) {
      // Atomic optimistic-concurrency write — see upsertProjectIdeState.
      const result = await this.prisma.workspaceIdeState.updateMany({
        where: { workspaceId: input.workspaceId, version: input.expectedVersion },
        data: {
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw Object.assign(new Error(appPublicEnglish('IDE_STATE_VERSION_CONFLICT')), {
          code: 'IDE_STATE_VERSION_CONFLICT',
        });
      }

      const updated = await this.prisma.workspaceIdeState.findUnique({ where: { workspaceId: input.workspaceId } });

      if (!updated) {
        // The row was deleted/archived between the updateMany and this read.
        throw Object.assign(new Error(appPublicEnglish('IDE_STATE_NOT_FOUND')), { code: 'IDE_STATE_NOT_FOUND' });
      }

      return mapWorkspaceIdeState(updated);
    }

    return mapWorkspaceIdeState(
      await this.prisma.workspaceIdeState.upsert({
        where: { workspaceId: input.workspaceId },
        create: {
          workspaceId: input.workspaceId,
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
        },
        update: {
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
          version: { increment: 1 },
        },
      }),
    );
  }

  async updateWorkspaceGitRepositoryUrl(input: { workspaceId: string; gitRepositoryUrl: string | null }) {
    return mapWorkspace(
      await this.prisma.workspace.update({
        where: { id: input.workspaceId },
        data: { gitRepositoryUrl: input.gitRepositoryUrl },
      }),
    );
  }

  async upsertCollaborationPresence(input: {
    projectId: string;
    userId: string;
    sessionId: string;
    status?: CollaborationPresenceRecord['status'];
    filePath?: string;
    cursor?: unknown;
    selection?: unknown;
    mode?: CollaborationPresenceRecord['mode'];
    terminalAccess?: boolean;
  }) {
    /*
     * Ownership guard: the unique key is (projectId, sessionId) and does NOT
     * include userId, so a caller who supplies another user's sessionId would
     * otherwise upsert (hijack/spoof) that user's presence row — changing their
     * cursor/file/terminalAccess as broadcast to the room. Reject when an
     * existing row for this (projectId, sessionId) belongs to a different user.
     */
    const existingPresence = await this.prisma.collaborationPresence.findUnique({
      where: { projectId_sessionId: { projectId: input.projectId, sessionId: input.sessionId } },
      select: { userId: true },
    });

    if (existingPresence && existingPresence.userId !== input.userId) {
      throw Object.assign(new Error(appPublicEnglish('PRESENCE_FORBIDDEN')), {
        statusCode: 403,
        code: 'PRESENCE_FORBIDDEN',
      });
    }

    return mapCollaborationPresence(
      await this.prisma.collaborationPresence.upsert({
        where: { projectId_sessionId: { projectId: input.projectId, sessionId: input.sessionId } },
        create: {
          projectId: input.projectId,
          userId: input.userId,
          sessionId: input.sessionId,
          status: input.status ?? 'online',
          filePath: input.filePath,
          cursor: input.cursor as any,
          selection: input.selection as any,
          mode: input.mode ?? 'editing',
          terminalAccess: input.terminalAccess ?? false,
        },

        /*
         * Field-selective update: only overwrite fields the caller actually
         * provided. A routine presence heartbeat omits terminalAccess/cursor/
         * selection/filePath, and blindly writing `?? false`/undefined would
         * revoke just-granted terminal access and null out another client's
         * cursor/file. status/mode always carry schema defaults so they're safe
         * to set unconditionally.
         */
        update: {
          status: input.status ?? 'online',
          mode: input.mode ?? 'editing',
          ...(input.filePath !== undefined ? { filePath: input.filePath } : {}),
          ...(input.cursor !== undefined ? { cursor: input.cursor as any } : {}),
          ...(input.selection !== undefined ? { selection: input.selection as any } : {}),
          ...(input.terminalAccess !== undefined ? { terminalAccess: input.terminalAccess } : {}),
        },
      }),
    );
  }

  async removeCollaborationPresence(projectId: string, sessionId: string) {
    const deleted = await this.prisma.collaborationPresence.deleteMany({ where: { projectId, sessionId } });
    return deleted.count > 0;
  }

  async listCollaborationPresence(projectId: string) {
    return (
      await this.prisma.collaborationPresence.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } })
    ).map(mapCollaborationPresence);
  }

  async createCollaborationComment(input: {
    projectId: string;
    userId: string;
    filePath?: string;
    line?: number;
    selection?: unknown;
    body: string;
  }) {
    return mapCollaborationComment(
      await this.prisma.collaborationComment.create({
        data: { ...input, selection: (input.selection ?? undefined) as any },
      }),
    );
  }

  async listCollaborationComments(projectId: string) {
    return (
      await this.prisma.collaborationComment.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } })
    ).map(mapCollaborationComment);
  }

  async createProjectShareLink(input: {
    projectId: string;
    tokenHash: string;
    roleKey: ProjectShareLinkRecord['roleKey'];
    expiresAt: Date;
    createdByUserId?: string;
  }) {
    return mapProjectShareLink(await this.prisma.projectShareLink.create({ data: input }));
  }

  async listProjectShareLinks(projectId: string) {
    return (await this.prisma.projectShareLink.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })).map(
      mapProjectShareLink,
    );
  }

  async findProjectShareLinkByToken(token: string) {
    const link = await this.prisma.projectShareLink.findUnique({ where: { tokenHash: hashToken(token) } });

    if (!link || link.revokedAt || link.expiresAt.getTime() < Date.now()) {
      return undefined;
    }

    return mapProjectShareLink(link);
  }

  async revokeProjectShareLink(input: { projectId: string; id: string }) {
    const result = await this.prisma.projectShareLink.updateMany({
      where: { id: input.id, projectId: input.projectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count > 0;
  }

  async createChatShare(input: {
    tokenHash: string;
    conversationId: string;
    projectId: string;
    authorUserId: string;
    title?: string;
    payload: unknown;
    allowFork?: boolean;
    expiresAt?: Date;
  }) {
    return mapChatShare(
      await this.prisma.chatShare.create({
        data: {
          tokenHash: input.tokenHash,
          conversationId: input.conversationId,
          projectId: input.projectId,
          authorUserId: input.authorUserId,
          title: input.title,
          payloadJson: input.payload as Prisma.InputJsonValue,
          allowFork: input.allowFork ?? false,
          expiresAt: input.expiresAt,
        },
      }),
    );
  }

  async findChatShareByTokenHash(tokenHash: string) {
    const share = await this.prisma.chatShare.findUnique({ where: { tokenHash } });

    if (!share || share.revokedAt || (share.expiresAt && share.expiresAt.getTime() < Date.now())) {
      return undefined;
    }

    return mapChatShare(share);
  }

  async listChatShares(projectId: string) {
    return (await this.prisma.chatShare.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })).map(
      mapChatShare,
    );
  }

  async revokeChatShare(input: { id: string; authorUserId?: string; projectId?: string }) {
    const result = await this.prisma.chatShare.updateMany({
      where: {
        id: input.id,
        revokedAt: null,
        ...(input.authorUserId ? { authorUserId: input.authorUserId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
      },
      data: { revokedAt: new Date() },
    });

    return result.count > 0;
  }

  async upsertAgentPatchProposal(input: {
    id: string;
    projectId: string;
    artifactId: string;
    messageId: string;
    actionId: string;
    filePath: string;
    relativePath: string;
    originalContent: string;
    proposedContent: string;
    hunks: unknown;
    status: AgentPatchProposalStatus;
    error?: string;
  }) {
    const existing = await this.prisma.agentPatchProposal.findUnique({
      where: { id: input.id },
      select: { projectId: true },
    });

    if (existing && existing.projectId !== input.projectId) {
      throw Object.assign(new Error(appPublicEnglish('AGENT_PATCH_PROPOSAL_NOT_FOUND')), {
        statusCode: 404,
        code: 'AGENT_PATCH_PROPOSAL_NOT_FOUND',
      });
    }

    return mapAgentPatchProposal(
      await this.prisma.agentPatchProposal.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          projectId: input.projectId,
          artifactId: input.artifactId,
          messageId: input.messageId,
          actionId: input.actionId,
          filePath: input.filePath,
          relativePath: input.relativePath,
          originalContent: input.originalContent,
          proposedContent: input.proposedContent,
          hunks: input.hunks as any,
          status: input.status,
          error: input.error,
        },
        update: {
          proposedContent: input.proposedContent,
          hunks: input.hunks as any,
          status: input.status,
          error: input.error,
        },
      }),
    );
  }

  async listOpenAgentPatchProposals(projectId: string) {
    return (
      await this.prisma.agentPatchProposal.findMany({
        where: { projectId, status: { in: ['pending', 'applying', 'failed'] } },
        orderBy: { updatedAt: 'desc' },
      })
    ).map(mapAgentPatchProposal);
  }

  async deleteAgentPatchProposal(projectId: string, id: string) {
    const deleted = await this.prisma.agentPatchProposal.deleteMany({ where: { projectId, id } });
    return deleted.count > 0;
  }

  async recordAgentRepairEvent(input: {
    projectId: string;
    messageId?: string;
    artifactId?: string;
    actionId?: string;
    relativePath: string;
    attempt?: number;
    outcome: AgentRepairOutcome;
    validationError?: string;
    repairError?: string;
  }) {
    return mapAgentRepairEvent(
      await this.prisma.agentRepairEvent.create({
        data: {
          projectId: input.projectId,
          messageId: input.messageId,
          artifactId: input.artifactId,
          actionId: input.actionId,
          relativePath: input.relativePath,
          attempt: input.attempt ?? 1,
          outcome: input.outcome,
          validationError: input.validationError,
          repairError: input.repairError,
        },
      }),
    );
  }

  async listAgentRepairEvents(projectId: string, options?: { take?: number }) {
    return (
      await this.prisma.agentRepairEvent.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(options?.take ?? 100, 1), 500),
      })
    ).map(mapAgentRepairEvent);
  }

  async listConsensusRecords(projectId: string, options?: { take?: number }) {
    /*
     * ConsensusRecord has no projectId of its own; it hangs off AgentRun via runId.
     * Scope by the parent run's projectId (a nested relation filter) so ONLY this
     * project's consensus rows are returned — tenant isolation is enforced here.
     */
    return (
      await this.prisma.consensusRecord.findMany({
        where: { run: { projectId } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(options?.take ?? 50, 1), 200),
      })
    ).map(mapConsensusRecord);
  }

  async getConsensusRecordDetail(projectId: string, runId: string) {
    /*
     * Same tenant-isolation guard as listConsensusRecords: scope by the parent
     * run's projectId so a runId from another project can't be read. Returns the
     * full record incl. the persisted per-agent vote (claimVotes/conflicts/
     * consolidated JSON), or undefined when no such record exists in this project.
     */
    const row = await this.prisma.consensusRecord.findFirst({
      where: { runId, run: { projectId } },
    });

    return row ? mapConsensusRecordDetail(row) : undefined;
  }

  async listProjectSkillOverrides(projectId: string) {
    return (
      await this.prisma.projectSkill.findMany({
        where: { projectId },
        select: { skillId: true, enabled: true, updatedAt: true },
      })
    ).map((row) => ({ skillId: row.skillId, enabled: row.enabled, updatedAt: row.updatedAt.toISOString() }));
  }

  async setProjectSkillEnabled(input: { projectId: string; skillId: string; enabled: boolean }) {
    const row = await this.prisma.projectSkill.upsert({
      where: { projectId_skillId: { projectId: input.projectId, skillId: input.skillId } },
      create: { projectId: input.projectId, skillId: input.skillId, enabled: input.enabled },
      update: { enabled: input.enabled },
      select: { skillId: true, enabled: true, updatedAt: true },
    });

    return { skillId: row.skillId, enabled: row.enabled, updatedAt: row.updatedAt.toISOString() };
  }

  async listInstalledSkills(scope: InstalledSkillScope, scopeId: string): Promise<InstalledSkillRecord[]> {
    const rows = await this.prisma.installedSkill.findMany({
      where: { scope, scopeId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.#toInstalledSkill(row));
  }

  async installSkill(input: InstallSkillInput): Promise<{ record: InstalledSkillRecord; created: boolean }> {
    const existing = await this.prisma.installedSkill.findUnique({
      where: {
        scope_scopeId_ownerRepo: { scope: input.scope, scopeId: input.scopeId, ownerRepo: input.ownerRepo },
      },
    });

    if (existing) {
      return { record: this.#toInstalledSkill(existing), created: false };
    }

    const created = await this.prisma.installedSkill.create({
      data: {
        scope: input.scope,
        scopeId: input.scopeId,
        ownerRepo: input.ownerRepo,
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        homepageUrl: input.homepageUrl ?? null,
        installedByUserId: input.installedByUserId ?? null,
        origin: input.origin ?? 'github',
        enabled: input.enabled ?? true,
        contentHash: input.contentHash ?? null,
        auditVerdict: input.auditVerdict ?? null,
        auditFindings: input.auditFindings ? JSON.stringify(input.auditFindings) : null,
        auditedAt: input.auditedAt ? new Date(input.auditedAt) : null,
        manifestName: input.manifestName ?? null,
        resourcesJson: input.resources ? JSON.stringify(input.resources) : null,
      },
    });

    return { record: this.#toInstalledSkill(created), created: true };
  }

  async uninstallSkill(scope: InstalledSkillScope, scopeId: string, ownerRepo: string): Promise<boolean> {
    const result = await this.prisma.installedSkill.deleteMany({ where: { scope, scopeId, ownerRepo } });

    return result.count > 0;
  }

  async setInstalledSkillEnabled(input: {
    scope: InstalledSkillScope;
    scopeId: string;
    ownerRepo: string;
    enabled: boolean;
  }): Promise<InstalledSkillRecord | undefined> {
    const current = await this.prisma.installedSkill.findUnique({
      where: {
        scope_scopeId_ownerRepo: { scope: input.scope, scopeId: input.scopeId, ownerRepo: input.ownerRepo },
      },
    });

    if (!current) {
      return undefined;
    }

    // Fail-closed enforcement: a revoked or audit-rejected skill can never be
    // enabled. Return the unchanged row so the caller sees it stayed disabled.
    const blocked = current.revokedAt !== null || current.auditVerdict === 'rejected';

    if (input.enabled && blocked) {
      return this.#toInstalledSkill(current);
    }

    const row = await this.prisma.installedSkill.update({
      where: {
        scope_scopeId_ownerRepo: { scope: input.scope, scopeId: input.scopeId, ownerRepo: input.ownerRepo },
      },
      data: { enabled: input.enabled },
    });

    return this.#toInstalledSkill(row);
  }

  async revokeSkill(input: {
    scope: InstalledSkillScope;
    scopeId: string;
    ownerRepo: string;
    revokedByUserId?: string | null;
    reason?: string | null;
  }): Promise<InstalledSkillRecord | undefined> {
    const existing = await this.prisma.installedSkill.findUnique({
      where: {
        scope_scopeId_ownerRepo: { scope: input.scope, scopeId: input.scopeId, ownerRepo: input.ownerRepo },
      },
    });

    if (!existing) {
      return undefined;
    }

    const row = await this.prisma.installedSkill.update({
      where: {
        scope_scopeId_ownerRepo: { scope: input.scope, scopeId: input.scopeId, ownerRepo: input.ownerRepo },
      },
      data: {
        enabled: false,
        revokedAt: existing.revokedAt ?? new Date(),
        revokedByUserId: input.revokedByUserId ?? existing.revokedByUserId ?? null,
        revokeReason: input.reason ?? existing.revokeReason ?? null,
      },
    });

    return this.#toInstalledSkill(row);
  }

  async recordSkillAudit(input: RecordSkillAuditInput): Promise<SkillAuditEventRecord> {
    const row = await this.prisma.skillAuditEvent.create({
      data: {
        scope: input.scope,
        scopeId: input.scopeId,
        ownerRepo: input.ownerRepo,
        action: input.action,
        verdict: input.verdict ?? null,
        findingsJson: input.findings ? JSON.stringify(input.findings) : null,
        contentHash: input.contentHash ?? null,
        actorUserId: input.actorUserId ?? null,
      },
    });

    return this.#toSkillAuditEvent(row);
  }

  async listSkillAuditEvents(
    scope: InstalledSkillScope,
    scopeId: string,
    options: { ownerRepo?: string; limit?: number } = {},
  ): Promise<SkillAuditEventRecord[]> {
    const rows = await this.prisma.skillAuditEvent.findMany({
      where: { scope, scopeId, ...(options.ownerRepo ? { ownerRepo: options.ownerRepo } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(options.limit ?? 100, 1), 500),
    });

    return rows.map((row) => this.#toSkillAuditEvent(row));
  }

  async countInstallsByRepo(): Promise<Record<string, number>> {
    const grouped = await this.prisma.installedSkill.groupBy({
      by: ['ownerRepo'],
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};

    for (const row of grouped) {
      counts[row.ownerRepo] = row._count._all;
    }

    return counts;
  }

  #toInstalledSkill(row: {
    id: string;
    scope: string;
    scopeId: string;
    ownerRepo: string;
    name: string;
    description: string;
    instructions: string;
    homepageUrl: string | null;
    enabled: boolean;
    installedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    origin?: string | null;
    contentHash?: string | null;
    auditVerdict?: string | null;
    auditFindings?: string | null;
    auditedAt?: Date | null;
    manifestName?: string | null;
    resourcesJson?: string | null;
    revokedAt?: Date | null;
    revokedByUserId?: string | null;
    revokeReason?: string | null;
  }): InstalledSkillRecord {
    return {
      id: row.id,
      scope: row.scope as InstalledSkillScope,
      scopeId: row.scopeId,
      ownerRepo: row.ownerRepo,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      homepageUrl: row.homepageUrl,
      enabled: row.enabled,
      installedByUserId: row.installedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      origin: row.origin ?? 'github',
      contentHash: row.contentHash ?? null,
      auditVerdict: (row.auditVerdict as InstalledSkillRecord['auditVerdict']) ?? null,
      auditFindings: parseJsonArray<InstalledSkillRecord['auditFindings'][number]>(row.auditFindings),
      auditedAt: row.auditedAt ? row.auditedAt.toISOString() : null,
      manifestName: row.manifestName ?? null,
      resources: parseJsonArray<InstalledSkillRecord['resources'][number]>(row.resourcesJson),
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      revokedByUserId: row.revokedByUserId ?? null,
      revokeReason: row.revokeReason ?? null,
    };
  }

  #toSkillAuditEvent(row: {
    id: string;
    scope: string;
    scopeId: string;
    ownerRepo: string;
    action: string;
    verdict: string | null;
    findingsJson: string | null;
    contentHash: string | null;
    actorUserId: string | null;
    createdAt: Date;
  }): SkillAuditEventRecord {
    return {
      id: row.id,
      scope: row.scope as InstalledSkillScope,
      scopeId: row.scopeId,
      ownerRepo: row.ownerRepo,
      action: row.action,
      verdict: (row.verdict as SkillAuditEventRecord['verdict']) ?? null,
      findings: parseJsonArray<SkillAuditEventRecord['findings'][number]>(row.findingsJson),
      contentHash: row.contentHash,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createWorkspace(input: {
    id?: string;
    projectId: string;
    name: string;
    runtimeMode: string;
    environment?: string;
    initialStatus?: WorkspaceRecord['status'];
  }) {
    /*
     * Persist the created workspace first so Prisma can mint the id when the
     * caller doesn't supply one. Once we have the id, allocate a relative
     * gitPath under the project storage root so each workspace has its own
     * isolated git working tree. Both writes share an interactive transaction
     * so a crash between them can never leave a row with a null gitPath.
     */
    const updated = await this.prisma.$transaction(async (tx) => {
      const { initialStatus, ...data } = input;
      const created = await tx.workspace.create({
        data: { ...data, status: initialStatus ?? 'PENDING' },
      });

      const gitPath = workspaceRelativeGitPath(created.id);

      return tx.workspace.update({
        where: { id: created.id },
        data: { gitPath },
      });
    });

    return mapWorkspace(updated);
  }

  async getWorkspace(id: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id } });
    return workspace ? mapWorkspace(workspace) : undefined;
  }

  async listWorkspaces(projectId: string) {
    return (await this.prisma.workspace.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })).map(
      mapWorkspace,
    );
  }

  async countActiveWorkspaces(organizationId: string) {
    return this.prisma.workspace.count({
      where: {
        project: { organizationId, deletedAt: null },
        status: { in: ['PENDING', 'STARTING', 'RUNNING'] },
      },
    });
  }

  async listActiveWorkspaces(organizationId: string) {
    return (
      await this.prisma.workspace.findMany({
        where: {
          project: { organizationId, deletedAt: null },
          status: { in: ['PENDING', 'STARTING', 'RUNNING'] },
        },
        orderBy: { updatedAt: 'asc' },
      })
    ).map(mapWorkspace);
  }

  async countSnapshots(organizationId: string) {
    /*
     * Exclude system-generated 'before-ai-change' snapshots from the user's
     * snapshots.count quota. They are created automatically on every AI
     * delete/rename/patch tool call WITHOUT consuming quota, but were counted
     * here — so they accumulated toward the cap and eventually 429'd the user's
     * manual snapshot endpoint even though they took no manual snapshots
     * (self-lockout). The quota governs user-initiated snapshots only.
     */
    return this.prisma.projectSnapshot.count({
      where: { project: { organizationId, deletedAt: null }, kind: { not: 'before-ai-change' } },
    });
  }

  async countDeployments(organizationId: string, since?: Date) {
    /*
     * Failed/canceled builds must not count against the deployment quota — they
     * produced no live deployment. Counting every row (the create handler
     * persists a QUEUED row before building, left FAILED on error) permanently
     * consumed quota: free plan (limit 0) blocked all deploys after one failed
     * build, and paid plans locked out once enough builds had failed.
     *
     * `since` scopes the count to the current usage period (per-period allowance);
     * without it the count was a monotonic lifetime total that eventually locked
     * out all deploys.
     */
    return this.prisma.deployment.count({
      where: {
        project: { organizationId, deletedAt: null },
        status: { notIn: ['FAILED', 'CANCELED'] },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
    });
  }

  async countPublishedApps(organizationId: string, options: { excludeProjectId?: string } = {}) {
    /*
     * "Published app" = a distinct project with a live PRODUCTION deployment
     * (status READY). We count distinct projectIds (not deployment rows) so a
     * project that has been re-published several times counts once. Failed/
     * superseded builds are excluded by the READY filter.
     */
    const rows = await this.prisma.deployment.findMany({
      where: {
        project: { organizationId, deletedAt: null },
        environmentName: 'production',
        status: 'READY',
        ...(options.excludeProjectId ? { projectId: { not: options.excludeProjectId } } : {}),
      },
      select: { projectId: true },
      distinct: ['projectId'],
    });
    return rows.length;
  }

  async listExpiryCandidateDeployments(options: { take?: number } = {}) {
    const rows = await this.prisma.deployment.findMany({
      where: {
        environmentName: 'production',
        status: 'READY',
        provider: 'server',
        project: { deletedAt: null },
      },
      select: {
        id: true,
        projectId: true,
        provider: true,
        environmentName: true,
        status: true,
        createdAt: true,
        metadata: true,
        project: {
          select: {
            organizationId: true,
            organization: {
              select: {
                subscriptions: {
                  where: { status: 'ACTIVE' },
                  select: { plan: { select: { key: true } } },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: options.take ?? 500,
    });

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      organizationId: row.project?.organizationId,
      provider: row.provider,
      environmentName: row.environmentName ?? undefined,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      planKey: row.project?.organization?.subscriptions?.[0]?.plan?.key,
      expiredAt: ((row.metadata ?? {}) as Record<string, unknown>)?.expiredAt as string | undefined,
    }));
  }

  async listPublishedProjects(organizationId: string) {
    /*
     * Une ligne par PROJET, datée de sa publication la plus récente : republier
     * ne doit pas faire compter le projet deux fois, et l'expiration se calcule
     * sur la publication la plus récente.
     */
    const rows = await this.prisma.deployment.findMany({
      where: {
        project: { organizationId, deletedAt: null },
        environmentName: 'production',
        status: 'READY',
      },
      select: { projectId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const latest = new Map<string, Date>();

    for (const row of rows) {
      if (!latest.has(row.projectId)) {
        latest.set(row.projectId, row.createdAt);
      }
    }

    return [...latest.entries()].map(([projectId, publishedAt]) => ({
      projectId,
      publishedAt: publishedAt.toISOString(),
    }));
  }

  async createSnapshot(input: {
    id?: string;
    projectId: string;
    label?: string;
    kind?: SnapshotRecord['kind'];
    manifest: unknown;
    storageKey?: string;
    byteLength?: number;
    createdByUserId?: string;
    conversationId?: string;
    turnIndex?: number;
  }) {
    let latestManifest = await this.getLatestProjectManifest(input.projectId);
    if (!latestManifest && (await this.prisma.project.count({ where: { id: input.projectId } })) === 1) {
      const initial = createDefaultProjectManifest(input.projectId);
      latestManifest = await this.createProjectManifestRevision({
        projectId: input.projectId,
        schemaVersion: initial.schemaVersion,
        manifestVersion: initial.manifestVersion,
        digest: projectManifestDigest(initial),
        manifest: initial,
        createdByUserId: input.createdByUserId,
      });
    }
    const manifestBase =
      input.manifest && typeof input.manifest === 'object' && !Array.isArray(input.manifest)
        ? (input.manifest as Record<string, unknown>)
        : { snapshotData: input.manifest };
    const snapshotManifest = latestManifest
      ? {
          ...manifestBase,
          projectManifest: projectManifestSnapshotPin(latestManifest, input.projectId),
        }
      : manifestBase;
    const data = {
      ...(input.id ? { id: input.id } : {}),
      projectId: input.projectId,
      label: input.label,
      kind: input.kind ?? 'manual',
      manifest: snapshotManifest as Prisma.InputJsonValue,
      storageKey: input.storageKey,
      byteLength: input.byteLength,
      createdByUserId: input.createdByUserId,
      conversationId: input.conversationId,
      turnIndex: input.turnIndex,
    };

    if (!input.id) {
      return mapSnapshot(await this.prisma.projectSnapshot.create({ data }));
    }

    const existing = await this.prisma.projectSnapshot.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.projectId !== input.projectId || existing.storageKey !== input.storageKey) {
        throw Object.assign(new Error(appPublicEnglish('SNAPSHOT_IDEMPOTENCY_CONFLICT')), {
          statusCode: 409,
          code: 'SNAPSHOT_IDEMPOTENCY_CONFLICT',
        });
      }
      return mapSnapshot(existing);
    }

    try {
      return mapSnapshot(await this.prisma.projectSnapshot.create({ data }));
    } catch (error) {
      if (!isPrismaKnownRequestError(error) || error.code !== 'P2002') throw error;
      const raced = await this.prisma.projectSnapshot.findUnique({ where: { id: input.id } });
      if (!raced || raced.projectId !== input.projectId || raced.storageKey !== input.storageKey) throw error;
      return mapSnapshot(raced);
    }
  }

  async getSnapshot(id: string) {
    const snapshot = await this.prisma.projectSnapshot.findUnique({ where: { id } });
    return snapshot ? mapSnapshot(snapshot) : undefined;
  }

  async listSnapshots(projectId: string) {
    return (await this.prisma.projectSnapshot.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })).map(
      mapSnapshot,
    );
  }

  async putProjectStorageObject(input: {
    projectId?: string;
    key: string;
    kind: ProjectStorageObjectRecord['kind'];
    contentBase64: string;
    byteLength: number;
    contentHash: string;
  }) {
    return mapProjectStorageObject(
      await this.prisma.projectStorageObject.upsert({
        where: { key: input.key },
        create: input,
        update: {
          projectId: input.projectId,
          kind: input.kind,
          contentBase64: input.contentBase64,
          byteLength: input.byteLength,
          contentHash: input.contentHash,
        },
      }),
    );
  }

  async getProjectStorageObject(key: string) {
    const object = await this.prisma.projectStorageObject.findUnique({ where: { key } });

    return object ? mapProjectStorageObject(object) : undefined;
  }

  async aggregateStorageBytesByOrg(): Promise<Array<{ organizationId: string; bytes: number }>> {
    const rows = await this.prisma.projectStorageObject.findMany({
      where: { project: { isNot: null } },
      select: { byteLength: true, project: { select: { organizationId: true } } },
    });

    const byOrg = new Map<string, number>();

    for (const row of rows) {
      const organizationId = row.project?.organizationId;

      if (!organizationId) {
        continue;
      }

      byOrg.set(organizationId, (byOrg.get(organizationId) ?? 0) + (row.byteLength ?? 0));
    }

    return [...byOrg.entries()].map(([organizationId, bytes]) => ({ organizationId, bytes }));
  }

  async getDatabaseInstanceByProject(
    projectId: string,
    environment = 'development',
  ): Promise<DatabaseInstanceRecord | undefined> {
    const row = await this.prisma.databaseInstance.findUnique({
      where: { projectId_environment: { projectId, environment } },
    });

    return row ? mapDatabaseInstance(row) : undefined;
  }

  async acquireDatabaseMigrationExecution(input: {
    projectId: string;
    organizationId: string;
    environment: string;
    idempotencyKey: string;
    requestHash: string;
    ownerToken: string;
    ttlMs: number;
    plan: Array<{ name: string; sha256: string }>;
    statementsSha256: string;
    backwardCompatible: boolean;
    forwardCompatible: boolean;
    deploymentId?: string;
    createdByUserId?: string;
  }) {
    if (!Number.isFinite(input.ttlMs) || input.ttlMs < 1) throw new TypeError('invalid migration lease TTL');
    const activeLock = `${input.projectId}:${input.environment}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`db-migration:${activeLock}`}, 0))`,
      );
      const selectByIdempotency = async () =>
        (
          await tx.$queryRaw<DatabaseMigrationRow[]>(Prisma.sql`
            SELECT *, ("leaseExpiresAt" > CURRENT_TIMESTAMP) AS "leaseLive"
            FROM "DBMigrationExecution"
            WHERE "projectId" = ${input.projectId} AND "idempotencyKey" = ${input.idempotencyKey}
            FOR UPDATE
          `)
        )[0];
      let row = await selectByIdempotency();
      if (row) {
        const execution = mapDatabaseMigrationExecution(row);
        if (row.requestHash !== input.requestHash) return { kind: 'IDEMPOTENCY_COLLISION' as const, execution };
        if (row.state === 'COMMITTED') return { kind: 'REPLAYED' as const, execution };
        if (row.state === 'FAILED_SAFE') return { kind: 'FAILED' as const, execution };
        if (row.leaseLive) return { kind: 'BLOCKED' as const, execution };
      } else {
        row = (
          await tx.$queryRaw<DatabaseMigrationRow[]>(Prisma.sql`
            SELECT *, ("leaseExpiresAt" > CURRENT_TIMESTAMP) AS "leaseLive"
            FROM "DBMigrationExecution"
            WHERE "activeLock" = ${activeLock}
            FOR UPDATE
          `)
        )[0];
        if (row?.leaseLive) return { kind: 'BLOCKED' as const, execution: mapDatabaseMigrationExecution(row) };
      }

      if (row) {
        const [claimed] = await tx.$queryRaw<DatabaseMigrationRow[]>(Prisma.sql`
          UPDATE "DBMigrationExecution"
          SET "state" = 'RECOVERING', "ownerToken" = ${input.ownerToken},
              "version" = "version" + 1, "attempt" = "attempt" + 1,
              "leaseExpiresAt" = CURRENT_TIMESTAMP + (${Math.floor(input.ttlMs)} * INTERVAL '1 millisecond'),
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${row.id} AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= CURRENT_TIMESTAMP)
          RETURNING *
        `);
        if (!claimed) return { kind: 'BLOCKED' as const, execution: mapDatabaseMigrationExecution(row) };
        return { kind: 'RECOVERY' as const, execution: mapDatabaseMigrationExecution(claimed) };
      }

      const [created] = await tx.$queryRaw<DatabaseMigrationRow[]>(Prisma.sql`
        INSERT INTO "DBMigrationExecution" (
          "id", "projectId", "organizationId", "environment", "state", "idempotencyKey",
          "requestHash", "activeLock", "ownerToken", "leaseExpiresAt", "plan",
          "statementsSha256", "statementCount", "backwardCompatible", "forwardCompatible",
          "deploymentId", "createdByUserId", "updatedAt"
        ) VALUES (
          ${`dbmig_${randomUUID()}`}, ${input.projectId}, ${input.organizationId}, ${input.environment},
          'LOCK_ACQUIRED', ${input.idempotencyKey}, ${input.requestHash}, ${activeLock}, ${input.ownerToken},
          CURRENT_TIMESTAMP + (${Math.floor(input.ttlMs)} * INTERVAL '1 millisecond'),
          ${JSON.stringify(input.plan)}::jsonb, ${input.statementsSha256}, ${input.plan.length},
          ${input.backwardCompatible}, ${input.forwardCompatible}, ${input.deploymentId ?? null},
          ${input.createdByUserId ?? null}, CURRENT_TIMESTAMP
        ) RETURNING *
      `);
      if (!created) throw new Error(DB_MIGRATION_EXECUTION_INSERT_EMPTY);
      return { kind: 'ACQUIRED' as const, execution: mapDatabaseMigrationExecution(created) };
    });
  }

  async renewDatabaseMigrationLease(input: {
    id: string;
    ownerToken: string;
    version: number;
    state: DatabaseMigrationState;
    ttlMs: number;
  }) {
    const [row] = await this.prisma.$queryRaw<DatabaseMigrationRow[]>(Prisma.sql`
      UPDATE "DBMigrationExecution"
      SET "version" = "version" + 1,
          "leaseExpiresAt" = CURRENT_TIMESTAMP + (${Math.floor(input.ttlMs)} * INTERVAL '1 millisecond'),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.id} AND "ownerToken" = ${input.ownerToken}
        AND "version" = ${input.version} AND "state" = ${input.state}
        AND "leaseExpiresAt" > CURRENT_TIMESTAMP AND "activeLock" IS NOT NULL
      RETURNING *
    `);
    return row ? mapDatabaseMigrationExecution(row) : undefined;
  }

  async validateDatabaseMigrationLease(input: {
    id: string;
    ownerToken: string;
    version: number;
    state: DatabaseMigrationState;
  }) {
    const [row] = await this.prisma.$queryRaw<Array<{ live: boolean }>>(Prisma.sql`
      SELECT EXISTS(
        SELECT 1 FROM "DBMigrationExecution"
        WHERE "id" = ${input.id} AND "ownerToken" = ${input.ownerToken}
          AND "version" = ${input.version} AND "state" = ${input.state}
          AND "leaseExpiresAt" > CURRENT_TIMESTAMP AND "activeLock" IS NOT NULL
      ) AS live
    `);
    return row?.live === true;
  }

  async transitionDatabaseMigrationExecution(input: {
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
  }) {
    const release = input.release === true;
    const retainLock = input.retainLock === true;
    if (release && retainLock) throw new TypeError('migration transition cannot release and retain its lock');
    const [row] = await this.prisma.$queryRaw<DatabaseMigrationRow[]>(Prisma.sql`
      UPDATE "DBMigrationExecution"
      SET "state" = ${input.nextState}, "version" = "version" + 1,
          "ownerToken" = CASE WHEN ${release || retainLock} THEN NULL ELSE "ownerToken" END,
          "activeLock" = CASE WHEN ${release} THEN NULL ELSE "activeLock" END,
          "leaseExpiresAt" = CASE WHEN ${release || retainLock} THEN NULL
            ELSE CURRENT_TIMESTAMP + (${Math.floor(input.ttlMs)} * INTERVAL '1 millisecond') END,
          "backupId" = CASE WHEN ${input.backupId !== undefined} THEN ${input.backupId ?? null} ELSE "backupId" END,
          "backupVerifiedAt" = CASE WHEN ${input.backupId !== undefined} THEN CURRENT_TIMESTAMP ELSE "backupVerifiedAt" END,
          "backupVerificationMethod" = CASE WHEN ${input.backupVerificationMethod !== undefined}
            THEN ${input.backupVerificationMethod ?? null} ELSE "backupVerificationMethod" END,
          "appliedStatements" = CASE WHEN ${input.appliedStatements !== undefined}
            THEN ${input.appliedStatements ?? 0} ELSE "appliedStatements" END,
          "errorCode" = CASE WHEN ${input.errorCode !== undefined} THEN ${input.errorCode ?? null} ELSE "errorCode" END,
          "completedAt" = CASE WHEN ${release} THEN CURRENT_TIMESTAMP ELSE "completedAt" END,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.id} AND "ownerToken" = ${input.ownerToken}
        AND "version" = ${input.version} AND "state" = ${input.expectedState}
        AND "leaseExpiresAt" > CURRENT_TIMESTAMP AND "activeLock" IS NOT NULL
      RETURNING *
    `);
    return row ? mapDatabaseMigrationExecution(row) : undefined;
  }

  async listDatabaseSnapshots(databaseInstanceId: string): Promise<DatabaseSnapshotRecord[]> {
    const rows = await this.prisma.databaseSnapshot.findMany({
      where: { databaseInstanceId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(mapDatabaseSnapshot);
  }

  async listDatabaseRestores(databaseInstanceId: string): Promise<DatabaseRestoreRecord[]> {
    const rows = await this.prisma.databaseRestore.findMany({
      where: { databaseInstanceId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(mapDatabaseRestore);
  }

  async createDatabaseRestore(input: {
    databaseInstanceId: string;
    snapshotId?: string;
    targetTimestamp?: string;
    requestedByUserId?: string;
  }): Promise<DatabaseRestoreRecord> {
    const row = await this.prisma.databaseRestore.create({
      data: {
        databaseInstanceId: input.databaseInstanceId,
        snapshotId: input.snapshotId ?? null,
        targetTimestamp: input.targetTimestamp ? new Date(input.targetTimestamp) : null,
        requestedByUserId: input.requestedByUserId ?? null,
      },
    });

    return mapDatabaseRestore(row);
  }

  async createDatabaseInstance(input: {
    projectId: string;
    organizationId: string;
    retentionDays: number;
    region?: string;
    environment?: string;
    provisioningDeadlineAt?: string;
  }): Promise<DatabaseInstanceRecord> {
    const row = await this.prisma.databaseInstance.create({
      data: {
        projectId: input.projectId,
        organizationId: input.organizationId,
        environment: input.environment ?? 'development',
        retentionDays: input.retentionDays,
        region: input.region ?? null,
        pitrEnabled: input.retentionDays > 0,
        provisioningDeadlineAt: input.provisioningDeadlineAt ? new Date(input.provisioningDeadlineAt) : null,
      },
    });

    return mapDatabaseInstance(row);
  }

  async acquireDatabaseProvisioning(input: {
    projectId: string;
    organizationId: string;
    retentionDays: number;
    region?: string;
    environment?: string;
    provisioningDeadlineAt: string;
  }): Promise<{ instance: DatabaseInstanceRecord; acquired: boolean; created: boolean }> {
    const environment = input.environment ?? 'development';

    try {
      const instance = await this.createDatabaseInstance({ ...input, environment });

      return { instance, acquired: true, created: true };
    } catch (error) {
      if (!isPrismaKnownRequestError(error) || error.code !== 'P2002') {
        throw error;
      }
    }

    const existing = await this.prisma.databaseInstance.findUniqueOrThrow({
      where: { projectId_environment: { projectId: input.projectId, environment } },
    });
    const claimed = await this.prisma.databaseInstance.updateMany({
      where: { id: existing.id, status: 'FAILED' },
      data: {
        status: 'PROVISIONING',
        provisioningDeadlineAt: new Date(input.provisioningDeadlineAt),
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });
    // Re-read on both paths. If another retry won the conditional update, the
    // loser must return the winner's PROVISIONING state instead of a stale
    // FAILED snapshot that would incorrectly invite another retry.
    const current = await this.prisma.databaseInstance.findUniqueOrThrow({ where: { id: existing.id } });

    return { instance: mapDatabaseInstance(current), acquired: claimed.count === 1, created: false };
  }

  async completeDatabaseProvisioning(
    id: string,
    connection: { projectId: string; key: string; valueEncrypted: string },
  ): Promise<DatabaseInstanceRecord | undefined> {
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.databaseInstance.updateMany({
        where: { id, projectId: connection.projectId, status: 'PROVISIONING' },
        data: {
          status: 'ACTIVE',
          provisioningDeadlineAt: null,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });

      if (updated.count !== 1) {
        return undefined;
      }

      await tx.projectSecret.upsert({
        where: { projectId_key: { projectId: connection.projectId, key: connection.key } },
        create: {
          projectId: connection.projectId,
          key: connection.key,
          valueEncrypted: connection.valueEncrypted,
          valueHash: hashToken(connection.valueEncrypted),
        },
        update: {
          valueEncrypted: connection.valueEncrypted,
          valueHash: hashToken(connection.valueEncrypted),
        },
      });

      return tx.databaseInstance.findUnique({ where: { id } });
    });

    return row ? mapDatabaseInstance(row) : undefined;
  }

  async failDatabaseProvisioning(
    id: string,
    input: { errorCode: string; failedAt: string; deadlineBefore?: string },
  ): Promise<DatabaseInstanceRecord | undefined> {
    const updated = await this.prisma.databaseInstance.updateMany({
      where: {
        id,
        status: 'PROVISIONING',
        ...(input.deadlineBefore ? { provisioningDeadlineAt: { not: null, lte: new Date(input.deadlineBefore) } } : {}),
      },
      data: {
        status: 'FAILED',
        lastErrorCode: input.errorCode,
        lastErrorAt: new Date(input.failedAt),
      },
    });

    if (updated.count !== 1) {
      return undefined;
    }

    const row = await this.prisma.databaseInstance.findUnique({ where: { id } });

    return row ? mapDatabaseInstance(row) : undefined;
  }

  async updateDatabaseInstance(
    id: string,
    patch: Partial<
      Pick<
        DatabaseInstanceRecord,
        'status' | 'sizeBytes' | 'pitrEnabled' | 'region' | 'provisioningDeadlineAt' | 'lastErrorCode' | 'lastErrorAt'
      >
    >,
  ): Promise<DatabaseInstanceRecord | undefined> {
    const row = await this.prisma.databaseInstance
      .update({
        where: { id },
        data: {
          status: patch.status,
          sizeBytes: patch.sizeBytes === undefined ? undefined : BigInt(patch.sizeBytes),
          pitrEnabled: patch.pitrEnabled,
          region: patch.region,
          provisioningDeadlineAt:
            patch.provisioningDeadlineAt === undefined
              ? undefined
              : patch.provisioningDeadlineAt
                ? new Date(patch.provisioningDeadlineAt)
                : null,
          lastErrorCode: patch.lastErrorCode,
          lastErrorAt:
            patch.lastErrorAt === undefined ? undefined : patch.lastErrorAt ? new Date(patch.lastErrorAt) : null,
        },
      })
      .catch(() => undefined);

    return row ? mapDatabaseInstance(row) : undefined;
  }

  async createDatabaseSnapshot(input: {
    databaseInstanceId: string;
    kind: 'auto' | 'manual';
    label?: string;
    createdByUserId?: string;
    expiresAt?: string;
  }): Promise<DatabaseSnapshotRecord> {
    const row = await this.prisma.databaseSnapshot.create({
      data: {
        databaseInstanceId: input.databaseInstanceId,
        kind: input.kind,
        label: input.label ?? null,
        createdByUserId: input.createdByUserId ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });

    return mapDatabaseSnapshot(row);
  }

  async pruneExpiredDatabaseSnapshots(nowMs: number): Promise<number> {
    const result = await this.prisma.databaseSnapshot.deleteMany({
      where: { expiresAt: { not: null, lt: new Date(nowMs) } },
    });

    return result.count;
  }

  async updateDatabaseRestore(
    id: string,
    patch: Partial<Pick<DatabaseRestoreRecord, 'status' | 'error' | 'startedAt' | 'completedAt'>>,
  ): Promise<DatabaseRestoreRecord | undefined> {
    const row = await this.prisma.databaseRestore
      .update({
        where: { id },
        data: {
          status: patch.status,
          error: patch.error,
          startedAt: patch.startedAt ? new Date(patch.startedAt) : undefined,
          completedAt: patch.completedAt ? new Date(patch.completedAt) : undefined,
        },
      })
      .catch(() => undefined);

    return row ? mapDatabaseRestore(row) : undefined;
  }

  async listActiveDatabaseInstances(take = 500): Promise<DatabaseInstanceRecord[]> {
    const rows = await this.prisma.databaseInstance.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      take,
    });

    return rows.map(mapDatabaseInstance);
  }

  async listProvisioningDatabaseInstances(take = 500): Promise<DatabaseInstanceRecord[]> {
    const rows = await this.prisma.databaseInstance.findMany({
      where: { status: 'PROVISIONING' },
      orderBy: { provisioningDeadlineAt: 'asc' },
      take,
    });

    return rows.map(mapDatabaseInstance);
  }

  async listPendingDatabaseRestores(take = 100): Promise<DatabaseRestoreRecord[]> {
    const rows = await this.prisma.databaseRestore.findMany({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
      orderBy: { createdAt: 'asc' },
      take,
    });

    return rows.map(mapDatabaseRestore);
  }

  async createDeployment(input: {
    projectId: string;
    workspaceId?: string;
    provider: string;
    environment?: DeploymentRecord['environment'];
    status?: DeploymentRecord['status'];
    url?: string;
    previewUrl?: string;
    productionUrl?: string;
    framework?: string;
    buildCommand?: string;
    outputDirectory?: string;
    branch?: string;
    commitSha?: string;
    customDomain?: string;
    logs?: DeploymentRecord['logs'];
    metadata?: Record<string, unknown>;
    rolledBackFromId?: string;
    parentDeploymentId?: string;
    machineSize?: string;
    startedAt?: string;
    finishedAt?: string;
    canceledAt?: string;
  }) {
    return mapDeployment(
      await this.prisma.deployment.create({
        data: {
          projectId: input.projectId,
          workspaceId: input.workspaceId,
          provider: input.provider,
          environmentName: input.environment ?? 'preview',
          status: input.status ?? 'QUEUED',
          url: input.url,
          previewUrl: input.previewUrl,
          productionUrl: input.productionUrl,
          framework: input.framework,
          buildCommand: input.buildCommand,
          outputDirectory: input.outputDirectory,
          branch: input.branch,
          commitSha: input.commitSha,
          customDomain: input.customDomain,
          logs: (input.logs ?? []) as any,
          metadata: (input.metadata ?? {}) as any,
          rolledBackFromId: input.rolledBackFromId,
          parentDeploymentId: input.parentDeploymentId,
          ...(input.machineSize ? { machineSize: input.machineSize } : {}),
          startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
          finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
          canceledAt: input.canceledAt ? new Date(input.canceledAt) : undefined,
        } as any,
      }),
    );
  }

  async getDeployment(projectId: string, deploymentId: string) {
    const deployment = await this.prisma.deployment.findFirst({ where: { id: deploymentId, projectId } });
    return deployment ? mapDeployment(deployment) : undefined;
  }

  async getDeploymentOwnerStatus(deploymentId: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        projectId: true,
        status: true,
        createdAt: true,
        environmentName: true,
        /*
         * L'org et son abonnement sont nécessaires ICI : l'extinction à 30 jours
         * d'une publication Starter se décide dans le chemin de SERVICE, pas
         * seulement dans le compteur.
         */
        project: {
          select: {
            deletedAt: true,
            organizationId: true,
            organization: {
              select: {
                // Relation au PLURIEL : on ne retient que l'abonnement ACTIF.
                subscriptions: {
                  where: { status: 'ACTIVE' },
                  select: { status: true, plan: { select: { key: true } } },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!deployment) {
      return undefined;
    }

    const subscription = deployment.project?.organization?.subscriptions?.[0];

    return {
      projectId: deployment.projectId,
      status: deployment.status,
      projectDeletedAt: deployment.project?.deletedAt ?? null,
      createdAt: deployment.createdAt.toISOString(),
      environmentName: deployment.environmentName ?? undefined,
      organizationId: deployment.project?.organizationId,
      planKey: subscription?.status === 'ACTIVE' ? subscription.plan?.key : undefined,
    };
  }

  async updateDeployment(
    projectId: string,
    deploymentId: string,
    input: Partial<Omit<DeploymentRecord, 'id' | 'projectId' | 'createdAt'>>,
  ) {
    /*
     * Status transitions must be monotonic: once a deployment is terminal
     * (READY / FAILED / CANCELED) a late or out-of-order callback must not flip
     * it back (e.g. a slow provider poll marking a CANCELED build READY). When
     * this update sets a status, restrict the WHERE to non-terminal rows; if it
     * matches nothing the row is left as-is and returned unchanged.
     */
    const statusGuard = input.status !== undefined ? { status: { notIn: ['READY', 'FAILED', 'CANCELED'] as any } } : {};

    await this.prisma.deployment.updateMany({
      where: { id: deploymentId, projectId, ...statusGuard },
      data: {
        ...('environment' in input ? { environmentName: input.environment } : {}),
        status: input.status,
        url: input.url,
        previewUrl: input.previewUrl,
        productionUrl: input.productionUrl,
        framework: input.framework,
        buildCommand: input.buildCommand,
        outputDirectory: input.outputDirectory,
        branch: input.branch,
        commitSha: input.commitSha,
        customDomain: input.customDomain,
        logs: input.logs as any,
        metadata: input.metadata as any,
        rolledBackFromId: input.rolledBackFromId,
        lastMeteredAt: input.lastMeteredAt ? new Date(input.lastMeteredAt) : undefined,
        startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
        finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
        canceledAt: input.canceledAt ? new Date(input.canceledAt) : undefined,
      } as any,
    });

    const deployment = await this.prisma.deployment.findFirstOrThrow({ where: { id: deploymentId, projectId } });

    return mapDeployment(deployment);
  }

  async listDeployments(projectId: string, options: { take?: number } = {}) {
    return (
      await this.prisma.deployment.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },

        /*
         * Cap the most-recent deployments. The /deployments endpoint fans out a
         * provider-status reconcile per row, so an unbounded list turned a
         * pollable endpoint into an unbounded burst of outbound calls on a
         * project with a long deploy history.
         */
        take: options.take ?? 100,
      })
    ).map(mapDeployment);
  }

  async listActiveServerDeployments() {
    return (
      await this.prisma.deployment.findMany({
        where: { provider: 'server', status: 'READY' as any },
        orderBy: { createdAt: 'asc' },
        // Bound one metering sweep; an unswept tail is billed on the next tick
        // (the watermark is per-row, so nothing is lost — only deferred).
        take: 500,
      })
    ).map(mapDeployment);
  }

  async createReleaseManifest(input: {
    projectId: string;
    deploymentId: string;
    environment: string;
    version: number;
    provider: string;
    artifactKind: 'static-snapshot' | 'server-image';
    artifactRef: string;
    artifactDigest: string;
    storeGeneration?: string;
    configDigest?: string;
    dbMigrationPoint?: string;
  }) {
    return mapReleaseManifest(
      await this.prisma.releaseManifest.create({
        data: {
          projectId: input.projectId,
          deploymentId: input.deploymentId,
          environment: input.environment,
          version: input.version,
          provider: input.provider,
          artifactKind: input.artifactKind,
          artifactRef: input.artifactRef,
          artifactDigest: input.artifactDigest,
          storeGeneration: input.storeGeneration ?? null,
          configDigest: input.configDigest ?? null,
          dbMigrationPoint: input.dbMigrationPoint ?? null,
        },
      }),
    );
  }

  async listReleaseManifests(projectId: string, environment: string, options?: { take?: number }) {
    return (
      await this.prisma.releaseManifest.findMany({
        where: { projectId, environment },
        orderBy: { version: 'desc' },
        take: options?.take ?? 100,
      })
    ).map(mapReleaseManifest);
  }

  async commitServerImageRelease(input: ServerImageReleaseCommitInput): Promise<ServerImageReleaseCommitResult> {
    return this.prisma.$transaction(async (tx) => {
      /*
       * Linearization point shared with cancel/update: the row lock makes
       * ReleaseManifest creation and READY one atomic publication. A cancel
       * that commits first wins and no manifest is written; a cancel that waits
       * sees READY afterwards and the monotonic terminal guard refuses it.
       */
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "Deployment" WHERE "id" = $1 AND "projectId" = $2 FOR UPDATE',
        input.deploymentId,
        input.projectId,
      );

      const deployment = await tx.deployment.findFirstOrThrow({
        where: { id: input.deploymentId, projectId: input.projectId },
        include: { project: { select: { organizationId: true } } },
      });
      const serverDeploy = (input.metadata as Record<string, unknown>).serverDeploy as
        | Record<string, unknown>
        | undefined;
      const image = serverDeploy?.image as Record<string, unknown> | undefined;

      if (
        deployment.project.organizationId !== input.organizationId ||
        deployment.provider !== 'server' ||
        deployment.environmentName !== input.environment ||
        image?.imageRef !== input.artifactRef ||
        image?.imageDigest !== input.artifactDigest ||
        !isCommittedPromotionForTenant(
          serverDeploy?.promotion,
          deployment.project.organizationId,
          input.artifactDigest,
          input.artifactRef,
        )
      ) {
        throw new Error(SERVER_RELEASE_PROMOTION_NOT_COMMITTED);
      }

      const existing = await tx.releaseManifest.findFirst({
        where: { deploymentId: input.deploymentId },
        orderBy: { version: 'desc' },
      });

      if (existing) {
        if (
          existing.artifactKind !== 'server-image' ||
          existing.artifactRef !== input.artifactRef ||
          existing.artifactDigest !== input.artifactDigest
        ) {
          throw new Error(SERVER_RELEASE_MANIFEST_CONFLICT);
        }

        if (deployment.status !== 'READY') {
          throw new Error(SERVER_RELEASE_MANIFEST_WITHOUT_READY);
        }

        return { committed: true, deployment: mapDeployment(deployment), manifest: mapReleaseManifest(existing) };
      }

      if (['READY', 'FAILED', 'CANCELED'].includes(deployment.status)) {
        return { committed: false, deployment: mapDeployment(deployment) };
      }

      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `release-manifest:${input.projectId}:${input.environment}`,
      );
      const latest = await tx.releaseManifest.findFirst({
        where: { projectId: input.projectId, environment: input.environment },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const manifest = await tx.releaseManifest.create({
        data: {
          projectId: input.projectId,
          deploymentId: input.deploymentId,
          environment: input.environment,
          version: (latest?.version ?? 0) + 1,
          provider: 'server',
          artifactKind: 'server-image',
          artifactRef: input.artifactRef,
          artifactDigest: input.artifactDigest,
          storeGeneration: input.storeGeneration ?? null,
          configDigest: input.configDigest ?? null,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          action: SERVER_IMAGE_RELEASE_AUDIT_ACTION,
          metadata: {
            organizationId: input.organizationId,
            projectId: input.projectId,
            deploymentId: input.deploymentId,
            releaseManifestId: manifest.id,
            promotion: serverDeploy.promotion,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      const ready = await tx.deployment.update({
        where: { id: input.deploymentId },
        data: {
          status: 'READY',
          url: input.url,
          previewUrl: input.previewUrl ?? null,
          productionUrl: input.productionUrl ?? null,
          metadata: input.metadata as Prisma.InputJsonValue,
          logs: input.logs as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(input.finishedAt),
        },
      });

      return { committed: true, deployment: mapDeployment(ready), manifest: mapReleaseManifest(manifest) };
    });
  }

  async getServerImageReleasePromotion(deploymentId: string): Promise<unknown | undefined> {
    const audit = await this.prisma.adminAuditLog.findFirst({
      where: {
        action: SERVER_IMAGE_RELEASE_AUDIT_ACTION,
        metadata: { path: ['deploymentId'], equals: deploymentId },
      },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });
    return (audit?.metadata as Record<string, unknown> | null)?.promotion;
  }

  async getLatestProjectManifest(projectId: string) {
    const row = await this.prisma.projectManifestRevision.findFirst({
      where: { projectId },
      orderBy: { manifestVersion: 'desc' },
    });

    return row ? mapProjectManifestRevision(row) : undefined;
  }

  async createProjectManifestRevision(input: {
    projectId: string;
    schemaVersion: number;
    manifestVersion: number;
    digest: string;
    manifest: ProjectManifest;
    expectedDigest?: string;
    createdByUserId?: string;
  }): Promise<ProjectManifestRevisionRecord> {
    const manifest = verifyStoredProjectManifestRevision(input, input.projectId);

    return this.withSerializedMutation(`project-manifest:${input.projectId}`, async () => {
      return this.prisma.$transaction(async (tx) => {
        /*
         * The checkpoint barrier and manifest append share this PostgreSQL lock.
         * A route-level preflight alone has a check→barrier→insert race; under
         * this lock we either append before the checkpoint pins, or observe its
         * durable live barrier and refuse the write.
         */
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`project-checkpoint:${input.projectId}`}, 0))
        `;
        const activeBarrier = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "ProjectCheckpoint"
          WHERE "barrierProjectId" = ${input.projectId}
            AND "barrierExpiresAt" > clock_timestamp()
          LIMIT 1
        `;
        if (activeBarrier[0]) {
          throw Object.assign(new Error(appPublicEnglish('CHECKPOINT_BARRIER_ACTIVE_MESSAGE')), {
            code: 'CHECKPOINT_BARRIER_ACTIVE',
            statusCode: 423,
          });
        }

        const latest = await tx.projectManifestRevision.findFirst({
          where: { projectId: input.projectId },
          orderBy: { manifestVersion: 'desc' },
        });

        /* Exact replay after the first response was lost: return the winning row. */
        if (latest?.digest === input.digest && latest.manifestVersion === input.manifestVersion) {
          return mapProjectManifestRevision(latest);
        }

        const expectedMatches = latest ? input.expectedDigest === latest.digest : input.expectedDigest === undefined;
        const nextVersion = (latest?.manifestVersion ?? 0) + 1;

        if (!expectedMatches || input.manifestVersion !== nextVersion) {
          throw Object.assign(new Error(appPublicEnglish('PROJECT_MANIFEST_VERSION_CONFLICT')), {
            code: 'PROJECT_MANIFEST_VERSION_CONFLICT',
            statusCode: 409,
          });
        }

        return mapProjectManifestRevision(
          await tx.projectManifestRevision.create({
            data: {
              projectId: input.projectId,
              schemaVersion: input.schemaVersion,
              manifestVersion: input.manifestVersion,
              digest: input.digest,
              manifest: manifest as Prisma.InputJsonValue,
              createdByUserId: input.createdByUserId ?? null,
            },
          }),
        );
      });
    });
  }

  async getActiveRateCard() {
    const card = await this.prisma.rateCard.findFirst({
      where: { active: true },
      orderBy: { version: 'desc' },
      select: { version: true, data: true },
    });

    return card ? { version: card.version, data: card.data as unknown } : undefined;
  }

  async getActiveAgentRoutingCard() {
    const card = await this.prisma.agentRoutingCard.findFirst({
      where: { active: true },
      orderBy: { version: 'desc' },
      select: { version: true, data: true },
    });

    return card ? { version: card.version, data: card.data as unknown } : undefined;
  }

  async countAgentRoutingCards() {
    return this.prisma.agentRoutingCard.count();
  }

  async insertAgentRoutingCard(input: {
    version: number;
    data: unknown;
    sourceDate?: string;
    effectiveFrom?: string;
    active: boolean;
    createdByUserId?: string;
  }) {
    await this.prisma.agentRoutingCard.create({
      data: {
        version: input.version,
        data: input.data as object,
        sourceDate: input.sourceDate ?? null,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
        active: input.active,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  }

  async createAgentRoutingCardVersion(input: { data: unknown; sourceDate?: string; createdByUserId?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const latest = await tx.agentRoutingCard.findFirst({ orderBy: { version: 'desc' }, select: { version: true } });
      const version = (latest?.version ?? 0) + 1;

      await tx.agentRoutingCard.updateMany({
        where: { active: true },
        data: { active: false, effectiveTo: now },
      });

      /*
       * Stamp the assigned version + effectiveFrom into the JSON document too,
       * inside the same transaction, so the stored data is self-describing.
       */
      const stamped = {
        ...(input.data as Record<string, unknown>),
        version,
        effectiveFrom: now.toISOString(),
      };

      await tx.agentRoutingCard.create({
        data: {
          version,
          data: stamped,
          sourceDate: input.sourceDate ?? null,
          effectiveFrom: now,
          active: true,
          createdByUserId: input.createdByUserId ?? null,
        },
      });

      return { version, effectiveFrom: now.toISOString() };
    });
  }

  async listAgentRoutingCards(limit = 50) {
    const rows = await this.prisma.agentRoutingCard.findMany({
      orderBy: { version: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: { createdBy: { select: { email: true } } },
    });

    return rows.map((row) => ({
      version: row.version,
      active: row.active,
      data: row.data as unknown,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString(),
      sourceDate: row.sourceDate ?? undefined,
      createdAt: row.createdAt.toISOString(),
      createdByUserId: row.createdByUserId ?? undefined,
      createdByEmail: row.createdBy?.email ?? undefined,
    }));
  }

  async recordAgentCall(input: {
    userId?: string;
    organizationId?: string;
    projectId?: string;
    mode: string;
    highEffort: boolean;
    escalated: boolean;
    turbo: boolean;
    lineKey: string;
    provider: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    costMillicents: number;
    creditCents: number;
    marginMillicents: number;
    billedToUser: boolean;
    routingCardVersion: number;
    source: string;
  }) {
    await this.prisma.agentCallLog.create({
      data: {
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
        projectId: input.projectId ?? null,
        mode: input.mode,
        highEffort: input.highEffort,
        escalated: input.escalated,
        turbo: input.turbo,
        lineKey: input.lineKey,
        provider: input.provider,
        model: input.model,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        costMillicents: input.costMillicents,
        creditCents: input.creditCents,
        marginMillicents: input.marginMillicents,
        billedToUser: input.billedToUser,
        routingCardVersion: input.routingCardVersion,
        source: input.source,
      },
    });
  }

  async aggregateAgentCallVolume(sinceIso: string) {
    const rows = await this.prisma.agentCallLog.groupBy({
      by: ['lineKey'],
      where: { createdAt: { gte: new Date(sinceIso) } },
      _count: { _all: true },
      _sum: {
        tokensIn: true,
        tokensOut: true,
        costMillicents: true,
        creditCents: true,
        marginMillicents: true,
      },
    });

    return rows.map((row) => ({
      lineKey: row.lineKey,
      calls: row._count._all,
      tokensIn: row._sum.tokensIn ?? 0,
      tokensOut: row._sum.tokensOut ?? 0,
      costMillicents: row._sum.costMillicents ?? 0,
      creditCents: row._sum.creditCents ?? 0,
      marginMillicents: row._sum.marginMillicents ?? 0,
    }));
  }

  async listAgentCalls(limit = 100) {
    const rows = await this.prisma.agentCallLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      userId: row.userId ?? undefined,
      organizationId: row.organizationId ?? undefined,
      projectId: row.projectId ?? undefined,
      mode: row.mode,
      highEffort: row.highEffort,
      escalated: row.escalated,
      turbo: row.turbo,
      lineKey: row.lineKey,
      provider: row.provider,
      model: row.model,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costMillicents: row.costMillicents,
      creditCents: row.creditCents,
      marginMillicents: row.marginMillicents,
      billedToUser: row.billedToUser,
      routingCardVersion: row.routingCardVersion,
      source: row.source,
    }));
  }

  async listStaleDeployments(cutoffIso: string) {
    return (
      await this.prisma.deployment.findMany({
        where: {
          status: { in: ['QUEUED', 'BUILDING'] as any },
          updatedAt: { lt: new Date(cutoffIso) },
        },
        orderBy: { updatedAt: 'asc' },
        // Bound the sweep so a large backlog can't exceed a single reaper tick's
        // budget; the unswept tail is picked up on the next run.
        take: 200,
      })
    ).map(mapDeployment);
  }

  async createSupportTicket(input: { organizationId: string; userId: string; subject: string; category?: string }) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        subject: input.subject,

        // Category rides in the existing metadata JSON column (no migration).
        metadata: input.category ? { category: input.category } : undefined,
      },
    });
    return mapSupportTicket(ticket);
  }

  async listSupportTickets(organizationId: string) {
    return (
      await this.prisma.supportTicket.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } })
    ).map(mapSupportTicket);
  }

  // I25: fetch a single ticket, scoped to its org so one org can't read another's
  // ticket by guessing an id. Returns null when the ticket isn't in that org.
  async getSupportTicket(organizationId: string, ticketId: string): Promise<SupportTicketRecord | null> {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, organizationId } });
    return ticket ? mapSupportTicket(ticket) : null;
  }

  // I25: the conversation thread for a ticket, oldest first.
  async listTicketMessages(ticketId: string): Promise<TicketMessageRecord[]> {
    return (await this.prisma.ticketMessage.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' } })).map(
      mapTicketMessage,
    );
  }

  // I25: append a message (a user reply, an admin response, or a system note).
  async addTicketMessage(input: {
    ticketId: string;
    authorType: TicketMessageRecord['authorType'];
    authorUserId?: string;
    body: string;
  }): Promise<TicketMessageRecord> {
    return mapTicketMessage(
      await this.prisma.ticketMessage.create({
        data: {
          ticketId: input.ticketId,
          authorType: input.authorType,
          authorUserId: input.authorUserId ?? null,
          body: input.body,
        },
      }),
    );
  }

  async setFeatureFlag(input: { organizationId?: string; key: string; enabled: boolean; rolloutPercent?: number }) {
    const existing = await this.prisma.featureFlag.findFirst({
      where: { organizationId: input.organizationId ?? null, key: input.key },
    });

    // rolloutPercent lives in the `rules` JSON column; clamp to 0–100.
    const rules =
      input.rolloutPercent === undefined
        ? undefined
        : { rolloutPercent: Math.max(0, Math.min(100, Math.round(input.rolloutPercent))) };

    if (existing) {
      return mapFeatureFlag(
        await this.prisma.featureFlag.update({
          where: { id: existing.id },
          data: { enabled: input.enabled, ...(rules ? { rules } : {}) },
        }),
      );
    }

    /*
     * `[organizationId, key]` is unique, but organizationId is nullable so we
     * can't drive a Prisma upsert through the compound key for the global
     * (null-org) case. Two concurrent calls can both miss the findFirst above
     * and the second create() then violates the unique constraint, surfacing as
     * an uncoded 500 / duplicate row. Treat P2002 as "another writer won the
     * race" and fall back to updating the row they inserted.
     */
    try {
      return mapFeatureFlag(
        await this.prisma.featureFlag.create({
          data: { organizationId: input.organizationId, key: input.key, enabled: input.enabled, rules },
        }),
      );
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') {
        throw error;
      }

      const winner = await this.prisma.featureFlag.findFirst({
        where: { organizationId: input.organizationId ?? null, key: input.key },
      });

      if (!winner) {
        throw error;
      }

      return mapFeatureFlag(
        await this.prisma.featureFlag.update({
          where: { id: winner.id },
          data: { enabled: input.enabled, ...(rules ? { rules } : {}) },
        }),
      );
    }
  }

  async listFeatureFlags(organizationId?: string) {
    return (
      await this.prisma.featureFlag.findMany({
        where: { organizationId: organizationId ?? null },
        orderBy: { key: 'asc' },
        // Bound the payload — an unbounded findMany on a misconfigured tenant could
        // return an enormous list. 1000 flags is far beyond any real registry.
        take: 1000,
      })
    ).map(mapFeatureFlag);
  }

  async findFeatureFlag(key: string, organizationId?: string) {
    if (organizationId) {
      const scoped = await this.prisma.featureFlag.findFirst({ where: { organizationId, key } });

      if (scoped) {
        return mapFeatureFlag(scoped);
      }
    }

    const global = await this.prisma.featureFlag.findFirst({ where: { organizationId: null, key } });

    return global ? mapFeatureFlag(global) : undefined;
  }

  async listEffectiveFeatureFlags(organizationId?: string) {
    const [globals, scoped] = await Promise.all([
      this.prisma.featureFlag.findMany({ where: { organizationId: null } }),
      organizationId
        ? this.prisma.featureFlag.findMany({ where: { organizationId } })
        : Promise.resolve([] as unknown[]),
    ]);

    const byKey = new Map<string, FeatureFlagRecord>();

    for (const flag of globals) {
      byKey.set((flag as any).key, mapFeatureFlag(flag));
    }

    for (const flag of scoped as any[]) {
      byKey.set(flag.key, mapFeatureFlag(flag));
    }

    return [...byKey.values()];
  }

  async createAbuseEvent(input: { organizationId?: string; userId?: string; type: string; severity: string }) {
    return mapAbuseEvent(await this.prisma.abuseEvent.create({ data: input }));
  }

  async listAbuseEvents(filter?: { organizationId?: string; type?: string; take?: number }) {
    /*
     * Bounded + filterable. The unfiltered version did a platform-wide,
     * unbounded full-table scan on the usage hot path (evaluateUsageAbuse runs
     * on every AI message / preview / workspace start). Callers that only care
     * about one org pass organizationId so the query is scoped; admin views pass
     * a take cap. A hard default cap protects against an ever-growing table.
     */
    const where =
      filter?.organizationId || filter?.type ? { organizationId: filter.organizationId, type: filter.type } : undefined;

    return (
      await this.prisma.abuseEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filter?.take ?? 1000,
      })
    ).map(mapAbuseEvent);
  }

  async createIntegrationFeatureRequest(input: {
    userId: string;
    organizationId?: string;
    integrationName: string;
    useCaseDescription: string;
  }) {
    return mapIntegrationFeatureRequest(
      await this.prisma.integrationFeatureRequest.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId,
          integrationName: input.integrationName,
          useCaseDescription: input.useCaseDescription,
        },
      }),
    );
  }

  async listIntegrationFeatureRequests(filter: { userId: string; organizationId?: string; take?: number }) {
    /*
     * Scoped to the requesting user. When the user supplies an organization
     * context we also surface that org's requests (so org members see what
     * teammates have already asked for and avoid duplicate submissions); the
     * `userId` clause keeps the user's own requests visible regardless of org.
     */
    return (
      await this.prisma.integrationFeatureRequest.findMany({
        where: filter.organizationId
          ? { OR: [{ userId: filter.userId }, { organizationId: filter.organizationId }] }
          : { userId: filter.userId },
        orderBy: { createdAt: 'desc' },
        take: filter.take ?? 200,
      })
    ).map(mapIntegrationFeatureRequest);
  }

  async upsertAiMessageFeedback(input: {
    userId: string;
    messageId: string;
    vote: AiMessageFeedbackVote;
    chatId?: string;
  }) {
    return mapAiMessageFeedback(
      await this.prisma.aiMessageFeedback.upsert({
        where: { userId_messageId: { userId: input.userId, messageId: input.messageId } },
        create: {
          userId: input.userId,
          messageId: input.messageId,
          vote: input.vote,
          chatId: input.chatId,
        },
        // An undefined chatId is skipped by Prisma, keeping the stored one.
        update: { vote: input.vote, chatId: input.chatId },
      }),
    );
  }

  async deleteAiMessageFeedback(input: { userId: string; messageId: string }) {
    const result = await this.prisma.aiMessageFeedback.deleteMany({
      where: { userId: input.userId, messageId: input.messageId },
    });

    return result.count > 0;
  }

  async setSystemSetting(input: { key: string; value?: unknown }) {
    return mapSystemSetting(
      await this.prisma.systemSetting.upsert({
        where: { key: input.key },
        create: { key: input.key, value: (input.value ?? null) as any },
        update: { value: (input.value ?? null) as any },
      }),
    );
  }

  async mutateSystemSettingIds(key: string, change: { add?: string; remove?: string }): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      /*
       * Serialize concurrent mutations of this setting's id-array with a
       * transaction-scoped advisory lock (works even when the row doesn't exist
       * yet, unlike SELECT ... FOR UPDATE). Without it, two concurrent
       * suspend/unsuspend operations both read the old array and the later write
       * dropped the other's change (lost update).
       */
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `system-setting:${key}`);

      const existing = await tx.systemSetting.findUnique({ where: { key } });

      const current = Array.isArray(existing?.value)
        ? (existing!.value as unknown[]).filter((item): item is string => typeof item === 'string')
        : [];

      const set = new Set(current);

      if (change.add) {
        set.add(change.add);
      }

      if (change.remove) {
        set.delete(change.remove);
      }

      const next = [...set];
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: next as any },
        update: { value: next as any },
      });

      return next;
    });
  }

  async listSystemSettings() {
    return (await this.prisma.systemSetting.findMany()).map(mapSystemSetting);
  }

  async getEnterpriseSettings(organizationId: string) {
    const settings = await this.prisma.enterpriseOrganizationSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ipAllowlist: [],
        // MFA optional everywhere (Avi's decision): default an org to NOT forcing
        // admin MFA. Note this setting is not itself an enforcement gate — the
        // global ADMIN_MFA_REQUIRED env (adminMfaRequired()) is the real lever —
        // so this default is for consistency/UI, not behavior.
        requireMfaForAdmins: false,
        dataRetentionDays: 365,
        legalHoldEnabled: false,
      },
      update: {},
    });
    return mapEnterpriseSettings(settings);
  }

  async updateEnterpriseSettings(
    input: Partial<Omit<EnterpriseSettingsRecord, 'updatedAt'>> & { organizationId: string },
  ) {
    return mapEnterpriseSettings(
      await this.prisma.enterpriseOrganizationSettings.upsert({
        where: { organizationId: input.organizationId },
        create: {
          organizationId: input.organizationId,
          ipAllowlist: input.ipAllowlist ?? [],
          sessionDurationMinutes: input.sessionDurationMinutes,
          requireMfaForAdmins: input.requireMfaForAdmins ?? false,
          dataRetentionDays: input.dataRetentionDays ?? 365,
          legalHoldEnabled: input.legalHoldEnabled ?? false,
          ssoEnforced: input.ssoEnforced ?? false,
          // undefined on the record means "not provided"; null/ISO both map to a concrete value.
          ssoEnforcedAt:
            input.ssoEnforcedAt === undefined ? undefined : input.ssoEnforcedAt ? new Date(input.ssoEnforcedAt) : null,
        },
        update: {
          ipAllowlist: input.ipAllowlist,
          sessionDurationMinutes: input.sessionDurationMinutes,
          requireMfaForAdmins: input.requireMfaForAdmins,
          dataRetentionDays: input.dataRetentionDays,
          legalHoldEnabled: input.legalHoldEnabled,
          ssoEnforced: input.ssoEnforced,
          // Passing `null` clears the clock (enforcement turned off); `undefined` leaves it untouched.
          ssoEnforcedAt:
            input.ssoEnforcedAt === undefined ? undefined : input.ssoEnforcedAt ? new Date(input.ssoEnforcedAt) : null,
        },
      }),
    );
  }

  async createDomainVerification(input: {
    organizationId: string;
    domain: string;
    verificationToken: string;
    redirectWww?: boolean;
    wildcardEnabled?: boolean;
  }) {
    const domain = input.domain.toLowerCase();
    const redirectWww = input.redirectWww ?? true;
    const wildcardEnabled = input.wildcardEnabled ?? false;

    return mapDomainVerification(
      await this.prisma.verifiedDomain.upsert({
        where: { organizationId_domain: { organizationId: input.organizationId, domain } },
        create: {
          organizationId: input.organizationId,
          domain,
          verificationToken: input.verificationToken,
          redirectWww,
          wildcardEnabled,
          sslStatus: 'pending_dns',
        },
        update: {
          verificationToken: input.verificationToken,
          verifiedAt: null,
          redirectWww,
          wildcardEnabled,
          sslStatus: 'pending_dns',
        },
      }),
    );
  }

  async verifyDomain(input: { organizationId: string; domain: string }) {
    const domain = input.domain.toLowerCase();

    const record = await this.prisma.verifiedDomain.findUnique({
      where: { organizationId_domain: { organizationId: input.organizationId, domain } },
    });

    if (!record) {
      return undefined;
    }

    /*
     * The DNS challenge mirrors what the UI instructs the operator to publish:
     * a TXT record at `_vibecore.<domain>` whose value is
     * `vibecore-domain-verification=<verificationToken>`. We only mark the
     * domain verified when that exact record is observed in DNS — never
     * unconditionally.
     */
    const host = `_vibecore.${domain}`;
    const expected = `vibecore-domain-verification=${record.verificationToken}`;

    let txtRecords: string[][];

    try {
      txtRecords = await this.resolveTxt(host);
    } catch (error: any) {
      const code = error?.code as string | undefined;

      const message =
        code === 'ENOTFOUND' || code === 'ENODATA'
          ? appPublicEnglish('DOMAIN_TXT_RECORD_MISSING', { host, expected })
          : appPublicEnglish('DOMAIN_DNS_LOOKUP_FAILED', {
              host,
              detail: code ?? 'DNS_LOOKUP_FAILED',
            });

      /*
       * A missing TXT record (ENOTFOUND/ENODATA) or a transient resolver error
       * is not a terminal failure — the operator is told to retry once DNS
       * propagates. Marking the domain `failed` here stuck the UI on a dead-end
       * state for a record that was simply not published yet. Keep it
       * `pending_dns` so the verification flow remains resumable; only a real
       * value mismatch (below) is a genuine failure.
       */
      await this.prisma.verifiedDomain.update({ where: { id: record.id }, data: { sslStatus: 'pending_dns' } });

      throw Object.assign(new Error(message), { statusCode: 422, code: 'DOMAIN_VERIFICATION_FAILED' });
    }

    // resolveTxt returns one string[] per record (split into 255-char chunks); rejoin before comparing.
    const matched = txtRecords.some((chunks) => chunks.join('').trim() === expected);

    if (!matched) {
      /*
       * Re-verifying a previously-verified domain whose TXT record has since
       * changed/disappeared must also clear verifiedAt — otherwise the row is
       * left in a contradictory `verifiedAt: <date>, sslStatus: 'failed'` state
       * and any consumer keying off verifiedAt still treats it as verified.
       */
      await this.prisma.verifiedDomain.update({
        where: { id: record.id },
        data: { sslStatus: 'failed', verifiedAt: null },
      });

      throw Object.assign(
        new Error(appPublicEnglish('DOMAIN_TXT_VALUE_MISMATCH', { host, count: txtRecords.length, expected })),
        { statusCode: 422, code: 'DOMAIN_VERIFICATION_FAILED' },
      );
    }

    return mapDomainVerification(
      await this.prisma.verifiedDomain.update({
        where: { id: record.id },
        data: { verifiedAt: new Date(), sslStatus: 'dns_verified' },
      }),
    );
  }

  async updateDomainVerificationConfig(input: {
    organizationId: string;
    domain: string;
    redirectWww?: boolean;
    wildcardEnabled?: boolean;
  }) {
    const record = await this.prisma.verifiedDomain.findUnique({
      where: { organizationId_domain: { organizationId: input.organizationId, domain: input.domain.toLowerCase() } },
    });

    if (!record) {
      return undefined;
    }

    return mapDomainVerification(
      await this.prisma.verifiedDomain.update({
        where: { id: record.id },
        data: {
          ...(typeof input.redirectWww === 'boolean' ? { redirectWww: input.redirectWww } : {}),
          ...(typeof input.wildcardEnabled === 'boolean' ? { wildcardEnabled: input.wildcardEnabled } : {}),
        },
      }),
    );
  }

  async listDomainVerifications(organizationId: string) {
    return (await this.prisma.verifiedDomain.findMany({ where: { organizationId } })).map(mapDomainVerification);
  }

  async upsertSsoConfig(input: {
    organizationId: string;
    type: 'oidc' | 'saml';
    enabled: boolean;
    encryptedConfig: string;
  }) {
    return mapSsoConfig(
      await this.prisma.ssoConfiguration.upsert({
        where: { organizationId_type: { organizationId: input.organizationId, type: input.type } },
        create: input,
        update: { enabled: input.enabled, encryptedConfig: input.encryptedConfig },
      }),
    );
  }

  async getSsoConfig(organizationId: string, type: 'oidc' | 'saml') {
    const config = await this.prisma.ssoConfiguration.findUnique({
      where: { organizationId_type: { organizationId, type } },
    });
    return config ? mapSsoConfig(config) : undefined;
  }

  async createScimToken(input: { organizationId: string; name: string; token: string }) {
    return mapScimToken(
      await this.prisma.scimToken.create({
        data: { organizationId: input.organizationId, name: input.name, tokenHash: hashToken(input.token) },
      }),
    );
  }

  async findScimToken(token: string) {
    const tokenHash = hashToken(token);

    /*
     * F16 — dual-valid: authenticate the CURRENT hash OR a PREVIOUS hash that is
     * still inside its 24h rotation window (rotatedAt within the last 24h). Outside
     * that window the previous hash no longer matches, so an old bearer stops working.
     */
    const rotationWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const record = await this.prisma.scimToken.findFirst({
      where: {
        OR: [{ tokenHash }, { previousTokenHash: tokenHash, rotatedAt: { gte: rotationWindowStart } }],
      },
    });

    if (!record) {
      return undefined;
    }

    /*
     * A SCIM token can be revoked (deleted) concurrently with a request that is
     * authenticating against it; the lastUsedAt bump would then throw P2025 and
     * surface as a 500 on the auth path instead of the caller's intended 401.
     * Mirror the row-may-be-gone convention used elsewhere in this store and
     * return undefined (treated as "invalid token") rather than crashing.
     */
    try {
      return mapScimToken(
        await this.prisma.scimToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }),
      );
    } catch {
      return undefined;
    }
  }

  async listScimTokens(organizationId: string) {
    const records = await this.prisma.scimToken.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapScimToken);
  }

  async revokeScimToken(tokenId: string) {
    try {
      const deleted = await this.prisma.scimToken.delete({ where: { id: tokenId } });
      return mapScimToken(deleted);
    } catch {
      return undefined;
    }
  }

  /*
   * F16 — 24h dual-valid rotation: mint a new bearer IN PLACE (same row/id), moving
   * the old hash to previousTokenHash and stamping rotatedAt. The previous token keeps
   * authenticating for 24h (see findScimToken) so an IdP can roll over with no
   * downtime. Returns undefined if the token id no longer exists.
   */
  async rotateScimToken(tokenId: string, newToken: string) {
    try {
      const existing = await this.prisma.scimToken.findUnique({ where: { id: tokenId } });

      if (!existing) {
        return undefined;
      }

      return mapScimToken(
        await this.prisma.scimToken.update({
          where: { id: tokenId },
          data: {
            previousTokenHash: existing.tokenHash,
            tokenHash: hashToken(newToken),
            rotatedAt: new Date(),
          },
        }),
      );
    } catch {
      return undefined;
    }
  }

  async createCustomRole(input: { organizationId: string; key: string; name: string; permissions: PermissionKey[] }) {
    return mapCustomRole(
      await this.prisma.customRole.upsert({
        where: { organizationId_key: { organizationId: input.organizationId, key: input.key } },
        create: input,
        update: { name: input.name, permissions: input.permissions },
      }),
    );
  }

  async listCustomRoles(organizationId: string) {
    return (await this.prisma.customRole.findMany({ where: { organizationId } })).map(mapCustomRole);
  }

  async createSiemWebhook(input: {
    organizationId: string;
    url: string;
    secret: string;
    secretCiphertext: string;
    enabled: boolean;
  }) {
    return mapSiemWebhook(
      await this.prisma.siemWebhook.create({
        data: {
          organizationId: input.organizationId,
          url: input.url,
          secretHash: hashToken(input.secret),
          secretCiphertext: input.secretCiphertext,
          enabled: input.enabled,
        },
      }),
    );
  }

  async listSiemWebhooks(organizationId: string) {
    return (await this.prisma.siemWebhook.findMany({ where: { organizationId } })).map(mapSiemWebhook);
  }

  async deleteSiemWebhook(organizationId: string, webhookId: string) {
    /*
     * Scope the delete by BOTH id and organizationId so an admin of one org can
     * never remove another tenant's webhook by guessing an id. deleteMany
     * returns a count (0 when no row matched the org-scoped filter) rather than
     * throwing, so we look the record up first to return it (and 404 upstream).
     */
    const existing = await this.prisma.siemWebhook.findFirst({ where: { id: webhookId, organizationId } });

    if (!existing) {
      return null;
    }

    await this.prisma.siemWebhook.deleteMany({ where: { id: webhookId, organizationId } });

    return mapSiemWebhook(existing);
  }

  async createApiKey(input: {
    userId?: string;
    organizationId?: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    scopes: ApiKeyScope[];
    expiresAt?: Date;
  }) {
    return mapApiKey(
      await this.prisma.apiKey.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId,
          name: input.name,
          keyHash: input.keyHash,
          keyPrefix: input.keyPrefix,
          scopes: input.scopes,
          expiresAt: input.expiresAt,
        },
      }),
    );
  }

  async listApiKeys(scope: { userId?: string; organizationId?: string }) {
    const where = scope.organizationId ? { organizationId: scope.organizationId } : { userId: scope.userId };

    return (await this.prisma.apiKey.findMany({ where, orderBy: { createdAt: 'desc' } })).map(mapApiKey);
  }

  async findApiKeyByHash(keyHash: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash } });

    return key ? mapApiKey(key) : undefined;
  }

  async touchApiKey(id: string) {
    await this.prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  async deleteApiKey(input: { id: string; userId?: string; organizationId?: string }) {
    const result = await this.prisma.apiKey.deleteMany({
      where: {
        id: input.id,
        ...(input.organizationId ? { organizationId: input.organizationId } : { userId: input.userId }),
      },
    });

    return result.count > 0;
  }

  async createOrganizationInvite(input: {
    organizationId: string;
    email: string;
    roleKey: string;
    token: string;
    expiresAt: Date;
    createdByUserId?: string;
  }) {
    const role = await this.ensureRole(input.roleKey);

    const invite = await this.prisma.organizationInvite.create({
      data: {
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        roleId: role.id,
        tokenHash: hashToken(input.token),
        expiresAt: input.expiresAt,
        createdByUserId: input.createdByUserId,
      },
      include: { role: true },
    });

    return mapOrganizationInvite(invite);
  }

  async findOrganizationInviteByToken(token: string) {
    const tokenHash = hashToken(token);
    const invite = await this.prisma.organizationInvite.findUnique({ where: { tokenHash }, include: { role: true } });

    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      return undefined;
    }

    return mapOrganizationInvite(invite);
  }

  async consumeOrganizationInvite(token: string, userId: string) {
    const tokenHash = hashToken(token);
    const invite = await this.prisma.organizationInvite.findUnique({ where: { tokenHash }, include: { role: true } });

    if (!invite) {
      return undefined;
    }

    const consumedAt = new Date();

    const consumed = await this.prisma.organizationInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, expiresAt: { gt: consumedAt } },
      data: { acceptedAt: consumedAt },
    });

    if (consumed.count === 0) {
      return undefined;
    }

    /*
     * Only provision the role for users who are NOT already members. addMember
     * upserts the role, so for an existing member accepting an invite it would
     * blindly overwrite their current role — an invite at a lower role (or a
     * leaked invite) could silently downgrade an owner (lockout) or, with a
     * higher-role invite, escalate without admin action. Existing members'
     * roles stay org-controlled; the invite is just marked consumed.
     */
    const existingMembership = await this.getMembership(userId, invite.organizationId);

    if (!existingMembership) {
      await this.addMember({
        organizationId: invite.organizationId,
        userId,
        roleKey: invite.role.key,
        invitedByUserId: invite.createdByUserId ?? undefined,
      });
    }

    return mapOrganizationInvite({ ...invite, acceptedAt: consumedAt });
  }

  async listOrganizationInvites(organizationId: string) {
    return (await this.prisma.organizationInvite.findMany({ where: { organizationId }, include: { role: true } })).map(
      mapOrganizationInvite,
    );
  }

  async resendOrganizationInvite(inviteId: string, token: string, expiresAt: Date) {
    const invite = await this.prisma.organizationInvite.findUnique({ where: { id: inviteId } });

    if (!invite || invite.acceptedAt) {
      return undefined;
    }

    return mapOrganizationInvite(
      await this.prisma.organizationInvite.update({
        where: { id: inviteId },
        data: { tokenHash: hashToken(token), expiresAt },
        include: { role: true },
      }),
    );
  }

  async expireOrganizationInvite(inviteId: string) {
    const invite = await this.prisma.organizationInvite.findUnique({
      where: { id: inviteId },
      include: { role: true },
    });

    if (!invite) {
      return undefined;
    }

    return mapOrganizationInvite(
      await this.prisma.organizationInvite.update({
        where: { id: inviteId },
        data: { expiresAt: new Date() },
        include: { role: true },
      }),
    );
  }

  async upsertOAuthConnection(input: {
    userId: string;
    provider: string;
    externalId: string;
    accessToken: string;
    refreshToken?: string;
  }) {
    return mapOAuthConnection(
      await this.prisma.oAuthConnection.upsert({
        where: { provider_externalId: { provider: input.provider, externalId: input.externalId } },
        create: {
          userId: input.userId,
          provider: input.provider,
          externalId: input.externalId,
          accessHash: hashToken(input.accessToken),
          refreshHash: input.refreshToken ? hashToken(input.refreshToken) : undefined,
        },
        update: {
          userId: input.userId,
          accessHash: hashToken(input.accessToken),
          refreshHash: input.refreshToken ? hashToken(input.refreshToken) : undefined,
        },
      }),
    );
  }

  async listOAuthConnections(userId: string) {
    return (
      await this.prisma.oAuthConnection.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })
    ).map(mapOAuthConnection);
  }

  async findOAuthConnectionByExternalId(provider: string, externalId: string) {
    const row = await this.prisma.oAuthConnection.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });

    return row ? mapOAuthConnection(row) : null;
  }

  async deleteOAuthConnection(userId: string, provider: string) {
    const result = await this.prisma.oAuthConnection.deleteMany({ where: { userId, provider } });

    return result.count > 0;
  }

  async upsertUserConnection(input: {
    userId: string;
    provider: string;
    externalAccountId: string;
    externalAccountLabel: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted?: string;
    apiKeyFieldsEncrypted?: Record<string, string>;
    scopes: string[];
    tokenExpiresAt?: Date;
    forAgentUse?: boolean;
    oauthAppSource?: 'e_code_default' | 'org_override';
    oauthAppOverrideId?: string;
    createdByUserId: string;
  }) {
    return mapUserConnection(
      await this.prisma.userConnection.upsert({
        where: {
          userId_provider_externalAccountId: {
            userId: input.userId,
            provider: input.provider,
            externalAccountId: input.externalAccountId,
          },
        },
        create: {
          userId: input.userId,
          provider: input.provider,
          externalAccountId: input.externalAccountId,
          externalAccountLabel: input.externalAccountLabel,
          accessTokenEncrypted: input.accessTokenEncrypted,
          refreshTokenEncrypted: input.refreshTokenEncrypted,
          apiKeyFieldsEncrypted: input.apiKeyFieldsEncrypted as never,
          scopes: input.scopes,
          tokenExpiresAt: input.tokenExpiresAt,
          forAgentUse: input.forAgentUse ?? true,
          oauthAppSource: input.oauthAppSource ?? 'e_code_default',
          oauthAppOverrideId: input.oauthAppOverrideId,
          createdByUserId: input.createdByUserId,
          status: 'active',
        },
        update: {
          externalAccountLabel: input.externalAccountLabel,
          accessTokenEncrypted: input.accessTokenEncrypted,
          refreshTokenEncrypted: input.refreshTokenEncrypted,
          apiKeyFieldsEncrypted: input.apiKeyFieldsEncrypted as never,
          scopes: input.scopes,
          tokenExpiresAt: input.tokenExpiresAt,
          forAgentUse: input.forAgentUse,
          oauthAppSource: input.oauthAppSource,
          oauthAppOverrideId: input.oauthAppOverrideId,
          status: 'active',
          revokedAt: null,
        },
      }),
    );
  }

  async getUserConnectionById(id: string) {
    const row = await this.prisma.userConnection.findUnique({ where: { id } });

    return row ? mapUserConnection(row) : undefined;
  }

  async listUserConnectionsByUser(userId: string, opts?: { provider?: string }) {
    const rows = await this.prisma.userConnection.findMany({
      where: {
        userId,
        provider: opts?.provider,
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(mapUserConnection);
  }

  async markUserConnectionStatus(input: {
    id: string;
    status: UserConnectionStatus;
    revokedAt?: Date;
    clearTokens?: boolean;
  }) {
    try {
      const updated = await this.prisma.userConnection.update({
        where: { id: input.id },
        data: {
          status: input.status,
          revokedAt: input.revokedAt,

          /*
           * On revoke, destroy the stored credentials — leaving the encrypted
           * access/refresh tokens in the DB after the user revokes is needless
           * retention of a live secret (the connector-proxy keys off status, but
           * the row still holds usable tokens until purged).
           */
          ...(input.clearTokens ? { accessTokenEncrypted: null, refreshTokenEncrypted: null } : {}),
        },
      });

      return mapUserConnection(updated);
    } catch {
      return undefined;
    }
  }

  async linkProjectToUserConnection(input: { projectId: string; userConnectionId: string; linkedByUserId: string }) {
    const link = await this.prisma.projectConnectionLink.upsert({
      where: {
        projectId_userConnectionId: {
          projectId: input.projectId,
          userConnectionId: input.userConnectionId,
        },
      },
      create: {
        projectId: input.projectId,
        userConnectionId: input.userConnectionId,
        linkedByUserId: input.linkedByUserId,
      },
      update: { unlinkedAt: null },
    });

    return mapProjectConnectionLink(link);
  }

  async unlinkProjectFromUserConnection(input: { projectId: string; userConnectionId: string }) {
    const link = await this.prisma.projectConnectionLink.findUnique({
      where: {
        projectId_userConnectionId: {
          projectId: input.projectId,
          userConnectionId: input.userConnectionId,
        },
      },
    });

    if (!link) {
      return undefined;
    }

    const updated = await this.prisma.projectConnectionLink.update({
      where: { id: link.id },
      data: { unlinkedAt: new Date() },
    });

    return mapProjectConnectionLink(updated);
  }

  async listProjectConnectionLinks(projectId: string, opts?: { includeUnlinked?: boolean }) {
    const rows = await this.prisma.projectConnectionLink.findMany({
      where: {
        projectId,
        unlinkedAt: opts?.includeUnlinked ? undefined : null,
      },
      orderBy: { linkedAt: 'desc' },
    });

    return rows.map(mapProjectConnectionLink);
  }

  async createNotification(input: {
    userId: string;
    category?: string;
    title: string;
    body?: string;
    messageKey?: string;
    messageParams?: Record<string, unknown>;
    linkUrl?: string;
    metadata?: Record<string, unknown>;
  }) {
    const row = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        category: input.category ?? 'system',
        title: input.title,
        body: input.body,
        messageKey: input.messageKey,
        messageParams: (input.messageParams ?? undefined) as Prisma.InputJsonValue | undefined,
        linkUrl: input.linkUrl,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    return mapNotification(row);
  }

  async listNotificationsByUser(input: { userId: string; limit?: number }) {
    const rows = await this.prisma.notification.findMany({
      where: { userId: input.userId },
      // Unread first, then newest — a compact, actionable feed.
      orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      take: Math.min(Math.max(input.limit ?? 50, 1), 200),
    });

    return rows.map(mapNotification);
  }

  async countUnreadNotificationsByUser(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async getNotificationById(id: string) {
    const row = await this.prisma.notification.findUnique({ where: { id } });

    return row ? mapNotification(row) : undefined;
  }

  async markNotificationRead(input: { id: string; readAt?: Date }) {
    try {
      const updated = await this.prisma.notification.update({
        where: { id: input.id },
        data: { readAt: input.readAt ?? new Date() },
      });

      return mapNotification(updated);
    } catch {
      return undefined;
    }
  }

  async markAllNotificationsRead(input: { userId: string; readAt?: Date }) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: input.userId, readAt: null },
      data: { readAt: input.readAt ?? new Date() },
    });

    return result.count;
  }

  async listUnresolvedReconnectionAlertsByUser(userId: string) {
    const rows = await this.prisma.reconnectionAlert.findMany({
      where: {
        resolvedAt: null,
        userConnection: { userId },
      },
      include: { userConnection: true },
      orderBy: { detectedAt: 'desc' },
    });

    return rows.map(mapReconnectionAlert);
  }

  async getReconnectionAlertById(id: string) {
    const row = await this.prisma.reconnectionAlert.findUnique({
      where: { id },
      include: { userConnection: true },
    });

    return row ? mapReconnectionAlert(row) : undefined;
  }

  async resolveReconnectionAlert(input: { id: string; resolvedAt?: Date }) {
    try {
      const updated = await this.prisma.reconnectionAlert.update({
        where: { id: input.id },
        data: { resolvedAt: input.resolvedAt ?? new Date() },
        include: { userConnection: true },
      });

      return mapReconnectionAlert(updated);
    } catch {
      return undefined;
    }
  }

  async createAiConversation(input: { projectId?: string; userId: string; title?: string }) {
    return mapAiConversation(await this.prisma.aiConversation.create({ data: input }));
  }

  async getAiConversation(id: string) {
    const conversation = await this.prisma.aiConversation.findUnique({ where: { id } });
    return conversation ? mapAiConversation(conversation) : undefined;
  }

  async listAiConversations(input: { projectId: string; userId: string; limit?: number }) {
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);

    return (
      await this.prisma.aiConversation.findMany({
        where: {
          projectId: input.projectId,
          userId: input.userId,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
    ).map(mapAiConversation);
  }

  async createAiMessage(input: {
    id?: string;
    conversationId: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
  }) {
    if (input.id) {
      return mapAiMessage(
        await this.prisma.aiMessage.upsert({
          where: { id: input.id },
          create: input,
          update: {
            role: input.role,
            content: input.content,
          },
        }),
      );
    }

    return mapAiMessage(await this.prisma.aiMessage.create({ data: input }));
  }

  async listAiMessages(conversationId: string) {
    /*
     * Cap the number of messages loaded so a long-lived conversation can't pull
     * its entire (content-heavy) history into memory on every request. We take the
     * most recent N rows, then restore chronological (ascending) order for callers.
     */
    const MAX_AI_MESSAGES = 500;

    const rows = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: MAX_AI_MESSAGES,
    });

    return rows.reverse().map(mapAiMessage);
  }

  async createAiToolCall(input: { messageId: string; name: string; input?: unknown; output?: unknown }) {
    return mapAiToolCall(
      await this.prisma.aiToolCall.create({
        data: {
          messageId: input.messageId,
          name: input.name,
          input: (input.input ?? null) as any,
          output: (input.output ?? null) as any,
        },
      }),
    );
  }

  async listAiToolCallsByMessageIds(messageIds: string[]) {
    if (messageIds.length === 0) {
      return [];
    }

    return (
      await this.prisma.aiToolCall.findMany({
        where: { messageId: { in: messageIds } },
        orderBy: { createdAt: 'asc' },
      })
    ).map(mapAiToolCall);
  }

  async createAiTokenUsage(input: {
    messageId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
  }) {
    return mapAiTokenUsage(await this.prisma.aiTokenUsage.create({ data: input }));
  }

  async createProviderRequestMetric(input: {
    provider: string;
    model?: string | null;
    latencyMs: number;
    errored: boolean;
    statusCode?: number | null;
    source?: string | null;
  }) {
    await this.prisma.providerRequestMetric.create({
      data: {
        provider: input.provider,
        model: input.model ?? null,
        latencyMs: Math.max(0, Math.round(input.latencyMs)),
        errored: input.errored,
        statusCode: input.statusCode ?? null,
        source: input.source ?? null,
      },
    });
  }

  async listProviderRequestMetricsSince(since: Date, limit = 50_000) {
    const rows = await this.prisma.providerRequestMetric.findMany({
      where: { createdAt: { gte: since } },
      select: { provider: true, latencyMs: true, errored: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows;
  }

  async recordAiCost(input: {
    organizationId: string;
    projectId?: string;
    conversationId?: string;
    messageId?: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    reason: string;
  }) {
    return mapAiCostLedger(await this.prisma.aiCostLedger.create({ data: input }));
  }

  async listAiCosts(organizationId: string, range?: { from?: string; to?: string }) {
    /*
     * Push the date filter into the query for range-scoped callers (the billing
     * summary dashboard) instead of loading the org's entire — fastest-growing —
     * cost ledger into memory and filtering in JS. Callers that need everything
     * (data export) simply omit the range.
     */
    const where: any = { organizationId };

    if (range?.from || range?.to) {
      where.createdAt = {
        ...(range.from ? { gte: new Date(range.from) } : {}),
        ...(range.to ? { lte: new Date(range.to) } : {}),
      };
    }

    return (await this.prisma.aiCostLedger.findMany({ where, orderBy: { createdAt: 'desc' } })).map(mapAiCostLedger);
  }

  // --- Replit-parity: credit wallet ------------------------------------------

  async getCreditWallet(organizationId: string) {
    const wallet = await this.prisma.creditWallet.findUnique({ where: { organizationId } });
    return wallet ? mapCreditWallet(wallet) : undefined;
  }

  async ensureCreditWallet(organizationId: string) {
    return mapCreditWallet(
      await this.prisma.creditWallet.upsert({
        where: { organizationId },
        update: {},
        create: { organizationId },
      }),
    );
  }

  async updateCreditWalletSettings(input: {
    organizationId: string;
    budgetCapCents?: number | null;
    serviceShutdownCents?: number | null;
    autoTopupCents?: number | null;
  }) {
    const data: Record<string, unknown> = {};
    if (input.budgetCapCents !== undefined) {
      data.budgetCapCents = input.budgetCapCents;
    }
    if (input.serviceShutdownCents !== undefined) {
      data.serviceShutdownCents = input.serviceShutdownCents;
    }
    if (input.autoTopupCents !== undefined) {
      data.autoTopupCents = input.autoTopupCents;
    }
    return mapCreditWallet(
      await this.prisma.creditWallet.upsert({
        where: { organizationId: input.organizationId },
        update: data,
        create: { organizationId: input.organizationId, ...data },
      }),
    );
  }

  async recordCreditEntry(input: {
    organizationId: string;
    deltaCents: number;
    kind: CreditEntryKind;
    reason: string;
    checkpointId?: string;
    expiresAt?: Date;
    metadata?: unknown;
  }) {
    /*
     * The ledger insert and the materialized-balance bump must be one atomic unit
     * or concurrent debits could over-spend (read-modify-write race). Prisma's
     * interactive transaction + an atomic `increment` keeps the balance exact
     * without an app-level lock.
     */
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const wallet = await tx.creditWallet.upsert({
        where: { organizationId: input.organizationId },
        update: {},
        create: { organizationId: input.organizationId },
      });
      const entry = await tx.creditLedger.create({
        data: {
          walletId: wallet.id,
          organizationId: input.organizationId,
          deltaCents: input.deltaCents,
          kind: input.kind,
          reason: input.reason,
          checkpointId: input.checkpointId,
          expiresAt: input.expiresAt,
          metadata: (input.metadata ?? null) as any,
        },
      });
      const updated = await tx.creditWallet.update({
        where: { id: wallet.id },
        data: { balanceCents: { increment: input.deltaCents } },
      });
      return { entry: mapCreditLedger(entry), balanceCents: updated.balanceCents };
    });
  }

  async listCreditLedger(organizationId: string, options?: { take?: number }) {
    return (
      await this.prisma.creditLedger.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: options?.take ?? 100,
      })
    ).map(mapCreditLedger);
  }

  async sumPaygSpendSince(organizationId: string, sinceMs: number): Promise<number> {
    const result = await this.prisma.creditLedger.aggregate({
      where: { organizationId, kind: 'PAYG_CHARGE', createdAt: { gte: new Date(sinceMs) } },
      _sum: { deltaCents: true },
    });

    // PAYG_CHARGE deltas are negative (debits); spend is their absolute value.
    return Math.abs(result._sum.deltaCents ?? 0);
  }

  async getUserSpendLimit(organizationId: string, userId: string) {
    const row = await this.prisma.userSpendLimit.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    return row
      ? {
          id: row.id,
          organizationId: row.organizationId,
          userId: row.userId,
          limitCents: row.limitCents,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }
      : undefined;
  }

  async setUserSpendLimit(input: { organizationId: string; userId: string; limitCents: number }) {
    const row = await this.prisma.userSpendLimit.upsert({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
      update: { limitCents: input.limitCents },
      create: { organizationId: input.organizationId, userId: input.userId, limitCents: input.limitCents },
    });
    return {
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      limitCents: row.limitCents,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async clearUserSpendLimit(organizationId: string, userId: string) {
    await this.prisma.userSpendLimit.deleteMany({ where: { organizationId, userId } });
  }

  async listUserSpendLimits(organizationId: string) {
    const rows = await this.prisma.userSpendLimit.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      limitCents: row.limitCents,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async sumUserSpendSince(organizationId: string, userId: string, sinceMs: number): Promise<number> {
    const result = await this.prisma.agentCheckpoint.aggregate({
      where: { organizationId, userId, startedAt: { gte: new Date(sinceMs) } },
      _sum: { creditCents: true },
    });
    return Math.max(0, result._sum.creditCents ?? 0);
  }

  async recordPaygCharge(input: { organizationId: string; checkpointId: string; cents: number }): Promise<void> {
    const cents = Math.max(0, Math.ceil(input.cents));

    if (cents <= 0) {
      return;
    }

    /*
     * TRACKING-ONLY ledger entry. PAYG overage is billed to Stripe (real money),
     * NOT drawn from the credit wallet — so unlike recordCreditEntry this writes a
     * PAYG_CHARGE row WITHOUT touching balanceCents (debiting the wallet here would
     * double-charge: Stripe + credits). sumPaygSpendSince() reads these rows to
     * enforce budgetCapCents + fire spend alerts (which were dead at 0 before this).
     * Deduped by (org, kind, checkpointId) so a re-settle never double-counts.
     */
    const wallet = await this.prisma.creditWallet.upsert({
      where: { organizationId: input.organizationId },
      update: {},
      create: { organizationId: input.organizationId },
    });

    /*
     * Atomic dedup: insert and let the partial unique index
     * (organizationId, checkpointId) WHERE kind='PAYG_CHARGE' reject a duplicate
     * with P2002. The old find-then-create was a non-atomic TOCTOU — two concurrent
     * settlements of the same checkpoint both passed the existence check and both
     * inserted, inflating sumPaygSpendSince (false budget-cap trips + dup alerts).
     * Mirrors recordStripeEvent's P2002-as-already-recorded dedup.
     */
    try {
      await this.prisma.creditLedger.create({
        data: {
          walletId: wallet.id,
          organizationId: input.organizationId,
          deltaCents: -cents,
          kind: 'PAYG_CHARGE',
          reason: 'PAYG overage (billed to Stripe metered usage)',
          checkpointId: input.checkpointId,
        },
      });
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'P2002') {
        return;
      }

      throw error;
    }
  }

  async markSpendAlert(input: { organizationId: string; pct: number; periodStartMs: number }): Promise<void> {
    await this.prisma.creditWallet.update({
      where: { organizationId: input.organizationId },
      data: { lastSpendAlertPct: input.pct, lastSpendAlertPeriodStart: new Date(input.periodStartMs) },
    });
  }

  // --- Replit-parity: credit packs -------------------------------------------

  async createCreditPack(input: {
    organizationId: string;
    purchasedCents: number;
    expiresAt: Date;
    stripePaymentIntentId?: string;
  }) {
    return mapCreditPack(
      await this.prisma.creditPack.create({
        data: {
          organizationId: input.organizationId,
          purchasedCents: input.purchasedCents,
          remainingCents: input.purchasedCents,
          expiresAt: input.expiresAt,
          stripePaymentIntentId: input.stripePaymentIntentId,
        },
      }),
    );
  }

  async listCreditPacks(organizationId: string, options?: { activeOnly?: boolean }) {
    return (
      await this.prisma.creditPack.findMany({
        where: {
          organizationId,
          ...(options?.activeOnly ? { remainingCents: { gt: 0 }, expiresAt: { gt: new Date() } } : {}),
        },
        orderBy: { expiresAt: 'asc' },
      })
    ).map(mapCreditPack);
  }

  async decrementCreditPack(input: { id: string; cents: number }) {
    /*
     * Never let remainingCents go negative. The old unconditional decrement could
     * drive a pack below zero under a concurrent debit (two settlements racing the
     * same pack), corrupting the org's credit accounting. Decrement only while the
     * pack still holds enough; if a race left it short, consume whatever remains
     * (clamp to 0). Both updateMany calls only move toward zero, so the worst case
     * is a tiny over-consumption — never a negative balance.
     */
    const cents = Math.max(0, Math.ceil(input.cents));

    const guarded = await this.prisma.creditPack.updateMany({
      where: { id: input.id, remainingCents: { gte: cents } },
      data: { remainingCents: { decrement: cents } },
    });

    if (guarded.count === 0) {
      await this.prisma.creditPack.updateMany({
        where: { id: input.id, remainingCents: { lt: cents } },
        data: { remainingCents: 0 },
      });
    }

    const pack = await this.prisma.creditPack.findUnique({ where: { id: input.id } });

    if (!pack) {
      throw Object.assign(new Error(appPublicEnglish('CREDIT_PACK_NOT_FOUND')), {
        statusCode: 404,
        code: 'CREDIT_PACK_NOT_FOUND',
      });
    }

    return mapCreditPack(pack);
  }

  // --- Replit-parity: effort-based checkpoints -------------------------------

  async createAgentCheckpoint(input: {
    organizationId: string;
    userId?: string;
    projectId?: string;
    conversationId?: string;
    runId?: string;
    highPowerModel?: boolean;
    extendedThinking?: boolean;
    buildTier?: string;
    turboMode?: boolean;
  }) {
    return mapAgentCheckpoint(
      await this.prisma.agentCheckpoint.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          projectId: input.projectId,
          conversationId: input.conversationId,
          runId: input.runId,
          highPowerModel: input.highPowerModel ?? false,
          extendedThinking: input.extendedThinking ?? false,
          buildTier: input.buildTier ?? 'power',
          turboMode: input.turboMode ?? false,
        },
      }),
    );
  }

  async completeAgentCheckpoint(input: {
    id: string;
    status: CheckpointStatus;
    inputTokens?: number;
    outputTokens?: number;
    wallMs?: number;
    computeCents?: number;
    rawProviderCents?: number;
    creditCents?: number;
  }) {
    return mapAgentCheckpoint(
      await this.prisma.agentCheckpoint.update({
        where: { id: input.id },
        data: {
          status: input.status,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          wallMs: input.wallMs,
          computeCents: input.computeCents,
          rawProviderCents: input.rawProviderCents,
          creditCents: input.creditCents,
          completedAt: new Date(),
        },
      }),
    );
  }

  async getAgentCheckpoint(id: string) {
    const checkpoint = await this.prisma.agentCheckpoint.findUnique({ where: { id } });
    return checkpoint ? mapAgentCheckpoint(checkpoint) : undefined;
  }

  async listAgentCheckpoints(organizationId: string, options?: { take?: number }) {
    return (
      await this.prisma.agentCheckpoint.findMany({
        where: { organizationId },
        orderBy: { startedAt: 'desc' },
        take: options?.take ?? 100,
      })
    ).map(mapAgentCheckpoint);
  }

  // --- Replit-parity: admin-owned provider/model registry -------------------

  async listProviderConfigs() {
    return (await this.prisma.providerConfig.findMany({ orderBy: { provider: 'asc' }, take: 1000 })).map(
      mapProviderConfig,
    );
  }

  async upsertProviderConfig(input: {
    provider: string;
    displayName: string;
    enabled?: boolean;
    apiKeySecret?: string;
    apiKeyEnc?: string | null;
    baseUrl?: string | null;
    byokAllowed?: boolean;
  }) {
    const data = {
      displayName: input.displayName,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.apiKeySecret !== undefined ? { apiKeySecret: input.apiKeySecret } : {}),
      // `undefined` = leave unchanged; explicit `null` = clear the encrypted key.
      ...(input.apiKeyEnc !== undefined ? { apiKeyEnc: input.apiKeyEnc } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
      ...(input.byokAllowed !== undefined ? { byokAllowed: input.byokAllowed } : {}),
    };
    return mapProviderConfig(
      await this.prisma.providerConfig.upsert({
        where: { provider: input.provider },
        update: data,
        create: { provider: input.provider, ...data },
      }),
    );
  }

  /*
   * Admin-owned OAuth credentials for a connector (GitHub/GitLab/Bitbucket),
   * stored on the seeded ConnectorCatalog row. Returns the raw row incl. the
   * encrypted secret so the caller (the OAuth resolver) can decrypt it; the admin
   * API masks it before sending to the browser.
   */
  async getConnectorOAuthCatalog(provider: string) {
    const row = await this.prisma.connectorCatalog.findUnique({ where: { provider } });

    if (!row) {
      return null;
    }

    return {
      provider: row.provider,
      displayName: row.displayName,
      authType: row.authType,
      enabled: row.enabled,
      clientId: row.defaultClientId,
      clientSecretEnc: row.defaultClientSecretEnc,
      scopes: row.defaultScopes,
      authorizeUrl: row.authorizeUrl,
    };
  }

  /*
   * Set a connector's admin-configured OAuth credentials. The row is seeded
   * (seed-connector-catalog.ts) so this is always an update; the secret arrives
   * already encrypted (encryptJson) from the route and is never logged.
   */
  async upsertConnectorOAuthConfig(input: {
    provider: string;
    clientId?: string | null;
    clientSecretEnc?: string | null;
    enabled?: boolean;
  }) {
    const data = {
      ...(input.clientId !== undefined ? { defaultClientId: input.clientId } : {}),
      ...(input.clientSecretEnc !== undefined ? { defaultClientSecretEnc: input.clientSecretEnc } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    };
    const row = await this.prisma.connectorCatalog.update({ where: { provider: input.provider }, data });

    return {
      provider: row.provider,
      enabled: row.enabled,
      clientId: row.defaultClientId,
      hasSecret: Boolean(row.defaultClientSecretEnc),
    };
  }

  async getLoginProviderConfig(provider: string) {
    const row = await this.prisma.loginProviderConfig.findUnique({ where: { provider } });

    if (!row) {
      return null;
    }

    return {
      provider: row.provider,
      enabled: row.enabled,
      clientId: row.clientId,
      clientSecretEnc: row.clientSecretEnc,
      scopes: row.scopes,
    };
  }

  /*
   * Upsert a social-login provider's admin-configured OAuth credentials. The
   * secret arrives already encrypted (encryptJson) from the route and is never
   * logged. A field left `undefined` is preserved; pass `null` to clear.
   */
  async upsertLoginProviderConfig(input: {
    provider: string;
    clientId?: string | null;
    clientSecretEnc?: string | null;
    scopes?: string[];
    enabled?: boolean;
    updatedByUserId?: string | null;
  }) {
    const patch = {
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
      ...(input.clientSecretEnc !== undefined ? { clientSecretEnc: input.clientSecretEnc } : {}),
      ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.updatedByUserId !== undefined ? { updatedByUserId: input.updatedByUserId } : {}),
    };

    const row = await this.prisma.loginProviderConfig.upsert({
      where: { provider: input.provider },
      create: {
        provider: input.provider,
        clientId: input.clientId ?? null,
        clientSecretEnc: input.clientSecretEnc ?? null,
        scopes: input.scopes ?? [],
        enabled: input.enabled ?? true,
        updatedByUserId: input.updatedByUserId ?? null,
      },
      update: patch,
    });

    return {
      provider: row.provider,
      enabled: row.enabled,
      clientId: row.clientId,
      hasSecret: Boolean(row.clientSecretEnc),
    };
  }

  async getStripeConfig() {
    const row = await this.prisma.stripeConfig.findUnique({ where: { id: 'singleton' } });

    if (!row) {
      return null;
    }

    return { secretKeyEnc: row.secretKeyEnc, webhookSecretEnc: row.webhookSecretEnc };
  }

  async upsertStripeConfig(input: {
    secretKeyEnc?: string | null;
    webhookSecretEnc?: string | null;
    updatedByUserId?: string | null;
  }) {
    // undefined → leave the column untouched; null → clear it.
    const patch = {
      ...(input.secretKeyEnc !== undefined ? { secretKeyEnc: input.secretKeyEnc } : {}),
      ...(input.webhookSecretEnc !== undefined ? { webhookSecretEnc: input.webhookSecretEnc } : {}),
      ...(input.updatedByUserId !== undefined ? { updatedByUserId: input.updatedByUserId } : {}),
    };

    const row = await this.prisma.stripeConfig.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        secretKeyEnc: input.secretKeyEnc ?? null,
        webhookSecretEnc: input.webhookSecretEnc ?? null,
        updatedByUserId: input.updatedByUserId ?? null,
      },
      update: patch,
    });

    return { hasSecretKey: Boolean(row.secretKeyEnc), hasWebhookSecret: Boolean(row.webhookSecretEnc) };
  }

  async setPlanStripePrices(input: {
    key: string;
    stripeProductId?: string | null;
    stripePriceId?: string | null;
    stripePriceMonthlyId?: string | null;
    stripePriceAnnualId?: string | null;
  }) {
    const data = {
      ...(input.stripeProductId !== undefined ? { stripeProductId: input.stripeProductId } : {}),
      ...(input.stripePriceId !== undefined ? { stripePriceId: input.stripePriceId } : {}),
      ...(input.stripePriceMonthlyId !== undefined ? { stripePriceMonthlyId: input.stripePriceMonthlyId } : {}),
      ...(input.stripePriceAnnualId !== undefined ? { stripePriceAnnualId: input.stripePriceAnnualId } : {}),
    };

    if (Object.keys(data).length === 0) {
      return;
    }

    await this.prisma.plan.update({ where: { key: input.key }, data });
  }

  async listAdminCreditWallets() {
    return (await this.prisma.creditWallet.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 })).map(
      mapCreditWallet,
    );
  }

  async listAdminAgentCheckpoints(options?: { take?: number }) {
    return (
      await this.prisma.agentCheckpoint.findMany({ orderBy: { startedAt: 'desc' }, take: options?.take ?? 200 })
    ).map(mapAgentCheckpoint);
  }

  async summarizeAgentCheckpoints() {
    const groups = await this.prisma.agentCheckpoint.groupBy({
      by: ['organizationId'],
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, creditCents: true },
      orderBy: { _sum: { creditCents: 'desc' } },
    });

    return groups.map((group) => ({
      organizationId: group.organizationId,
      checkpoints: group._count._all,
      inputTokens: group._sum.inputTokens ?? 0,
      outputTokens: group._sum.outputTokens ?? 0,
      creditCents: group._sum.creditCents ?? 0,
    }));
  }

  async purgeAgentCheckpoints(input: { before: string; dryRun: boolean }) {
    const where = {
      startedAt: { lt: new Date(input.before) },
      status: { in: ['COMPLETED', 'FAILED'] as ('COMPLETED' | 'FAILED')[] },
    };

    if (input.dryRun) {
      return { count: await this.prisma.agentCheckpoint.count({ where }) };
    }

    const result = await this.prisma.agentCheckpoint.deleteMany({ where });
    return { count: result.count };
  }

  async listModelConfigs(options?: { enabledOnly?: boolean }) {
    return (
      await this.prisma.modelConfig.findMany({
        where: options?.enabledOnly ? { enabled: true, providerConfig: { enabled: true } } : {},
        orderBy: { modelId: 'asc' },
        include: { providerConfig: true },
        take: 5000,
      })
    ).map(mapModelConfig);
  }

  async upsertModelConfig(input: {
    provider: string;
    modelId: string;
    displayName: string;
    enabled?: boolean;
    enabledPlans: string[];
    isHighPower?: boolean;
    supportsThinking?: boolean;
    inputCentsPerM: number;
    outputCentsPerM: number;
    contextWindow: number;
  }) {
    // The parent provider must exist; create a disabled shell if the admin is
    // registering a model before configuring its provider.
    const provider = await this.prisma.providerConfig.upsert({
      where: { provider: input.provider },
      update: {},
      create: { provider: input.provider, displayName: input.provider },
    });
    const data = {
      displayName: input.displayName,
      enabledPlans: input.enabledPlans as any,
      inputCentsPerM: input.inputCentsPerM,
      outputCentsPerM: input.outputCentsPerM,
      contextWindow: input.contextWindow,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.isHighPower !== undefined ? { isHighPower: input.isHighPower } : {}),
      ...(input.supportsThinking !== undefined ? { supportsThinking: input.supportsThinking } : {}),
    };
    return mapModelConfig(
      await this.prisma.modelConfig.upsert({
        where: { providerConfigId_modelId: { providerConfigId: provider.id, modelId: input.modelId } },
        update: data,
        create: { providerConfigId: provider.id, modelId: input.modelId, ...data },
        include: { providerConfig: true },
      }),
    );
  }

  async upsertBillingPlan(input: {
    key: PlanKey;
    name: string;
    monthlyCents: number;
    limits: Record<string, number>;
    stripeProductId?: string;
    stripePriceId?: string;
    stripePriceMonthlyId?: string;
    stripePriceAnnualId?: string;
  }) {
    const fields = {
      name: input.name,
      monthlyCents: input.monthlyCents,
      limits: input.limits as any,
      stripeProductId: input.stripeProductId,
      stripePriceId: input.stripePriceId,
      stripePriceMonthlyId: input.stripePriceMonthlyId,
      stripePriceAnnualId: input.stripePriceAnnualId,
    };
    return mapBillingPlan(
      await this.prisma.plan.upsert({
        where: { key: input.key },
        create: { key: input.key, ...fields },
        update: fields,
      }),
    );
  }

  async listBillingPlans() {
    return (await this.prisma.plan.findMany({ orderBy: { monthlyCents: 'asc' } })).map(mapBillingPlan);
  }

  async getBillingPlan(key: PlanKey) {
    const plan = await this.prisma.plan.findUnique({ where: { key } });
    return plan ? mapBillingPlan(plan) : undefined;
  }

  async upsertBillingCustomer(input: { organizationId: string; provider: string; externalId: string }) {
    try {
      return mapBillingCustomer(
        await this.prisma.billingCustomer.upsert({
          where: { organizationId: input.organizationId },
          create: input,
          update: { provider: input.provider, externalId: input.externalId },
        }),
      );
    } catch (error) {
      /*
       * BillingCustomer has a SECOND unique constraint @@unique([provider,externalId]).
       * Keying the upsert on organizationId alone, a create for an org whose Stripe
       * customer id already maps to ANOTHER org row throws P2002 (unhandled 500).
       * That's an anomalous state (one Stripe customer, two orgs) — return the
       * existing (provider,externalId) mapping idempotently instead of crashing.
       */
      if (isPrismaKnownRequestError(error) && error.code === 'P2002') {
        const existing = await this.prisma.billingCustomer.findUnique({
          where: { provider_externalId: { provider: input.provider, externalId: input.externalId } },
        });

        if (existing) {
          return mapBillingCustomer(existing);
        }
      }

      throw error;
    }
  }

  async getBillingCustomer(organizationId: string) {
    const customer = await this.prisma.billingCustomer.findUnique({ where: { organizationId } });
    return customer ? mapBillingCustomer(customer) : undefined;
  }

  async findOrganizationIdByBillingCustomer(provider: string, externalId: string) {
    const customer = await this.prisma.billingCustomer.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
    return customer?.organizationId ?? undefined;
  }

  async findOrganizationIdBySubscriptionExternalId(externalId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { externalId } });
    return subscription?.organizationId ?? undefined;
  }

  async upsertSubscription(input: {
    organizationId: string;
    planKey: PlanKey;
    externalId?: string;
    status: SubscriptionRecord['status'];
    cancelAtPeriodEnd?: boolean;
    trialEndsAt?: Date;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    lastStripeEventAt?: Date;
  }) {
    const plan = await this.ensurePlan(input.planKey);

    const data = {
      organizationId: input.organizationId,
      planId: plan.id,
      externalId: input.externalId,
      status: input.status,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      trialEndsAt: input.trialEndsAt,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      ...(input.lastStripeEventAt ? { lastStripeEventAt: input.lastStripeEventAt } : {}),
    };

    return this.prisma.$transaction(async (tx) => {
      /*
       * Subscription webhooks are topology mutations for account erasure: a
       * newly ACTIVE row after inventory capture could otherwise recreate live
       * billing for a purged sole-owner. The shared purge topology lock makes
       * this write linearise before capture or fail closed while its freeze is
       * active (Stripe will retry the webhook).
       */
      await this.accountPurge.assertMembershipMutable(tx, input.organizationId);

      /*
       * Common path: Stripe carries the subscription id (externalId). Use a real
       * upsert keyed on the externalId unique constraint so two concurrent webhook
       * deliveries can't both miss a find-then-create and insert duplicate rows.
       */
      if (input.externalId) {
        const existingExternal = await tx.subscription.findUnique({
          where: { externalId: input.externalId },
          select: { organizationId: true },
        });
        if (existingExternal && existingExternal.organizationId !== input.organizationId) {
          await this.accountPurge.assertMembershipMutable(tx, existingExternal.organizationId);
        }
        return mapSubscription(
          await tx.subscription.upsert({
            where: { externalId: input.externalId },
            create: data,
            update: data,
            include: { plan: true },
          }),
        );
      }

      /*
       * Fallback (rare): no external id to key on. The purge topology lock now
       * also serializes this find-then-write branch against destructive capture.
       */
      const existing = await tx.subscription.findFirst({
        where: { organizationId: input.organizationId },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        return mapSubscription(
          await tx.subscription.update({ where: { id: existing.id }, data, include: { plan: true } }),
        );
      }

      return mapSubscription(await tx.subscription.create({ data, include: { plan: true } }));
    });
  }

  async getSubscription(organizationId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    return subscription ? mapSubscription(subscription) : undefined;
  }

  async listAdminSubscriptions() {
    return (
      await this.prisma.subscription.findMany({
        include: { plan: true },
        orderBy: { updatedAt: 'desc' },
        take: 1000,
      })
    ).map(mapSubscription);
  }

  async recordUsageEvent(input: {
    organizationId: string;
    userId?: string;
    type: string;
    quantity?: number;
    metadata?: unknown;
  }) {
    return mapUsageEvent(
      await this.prisma.usageEvent.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          type: input.type,
          quantity: input.quantity ?? 1,
          metadata: (input.metadata ?? null) as any,
        },
      }),
    );
  }

  async hasUsageEventSince(organizationId: string, type: string, sinceMs: number) {
    const count = await this.prisma.usageEvent.count({
      where: { organizationId, type, createdAt: { gte: new Date(sinceMs) } },
    });

    return count > 0;
  }

  async listUsageEvents(organizationId: string, options: { take?: number } = {}) {
    return (
      await this.prisma.usageEvent.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },

        /*
         * Bounded for display/billing callers; the GDPR export passes no cap so
         * it still enumerates the full ledger. The usageEvent table is one of
         * the fastest-growing — an unbounded fetch on the dashboard hot path
         * loads the whole ledger just to show a count.
         */
        ...(options.take !== undefined ? { take: options.take } : {}),
      })
    ).map(mapUsageEvent);
  }

  async sumUsage(organizationId: string, type: string, since?: Date) {
    const result = await this.prisma.usageEvent.aggregate({
      where: { organizationId, type, ...(since ? { createdAt: { gte: since } } : {}) },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  async createQuotaOverride(input: {
    organizationId: string;
    key: QuotaKey;
    limit: number;
    reason: string;
    createdByUserId?: string;
    expiresAt?: Date;
  }) {
    return mapQuotaOverride(await this.prisma.quotaOverride.create({ data: input }));
  }

  async listQuotaOverrides(organizationId: string) {
    return (
      await this.prisma.quotaOverride.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } })
    ).map(mapQuotaOverride);
  }

  async getQuotaOverride(organizationId: string, key: QuotaKey) {
    const override = await this.prisma.quotaOverride.findFirst({
      where: { organizationId, key, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' },
    });
    return override ? mapQuotaOverride(override) : undefined;
  }

  async recordStripeEvent(input: { id: string; organizationId?: string; type: string; payload: unknown }) {
    const existing = await this.prisma.stripeEvent.findUnique({ where: { id: input.id } });

    if (existing) {
      return { event: mapStripeEvent(existing), created: false };
    }

    /*
     * Stripe delivers retries concurrently; two requests can both pass the findUnique
     * check, after which the second create() violates the id PK and previously threw an
     * uncoded 500 (spurious webhook failure + retry). Treat a unique-violation as "already
     * recorded" so the side-effecting branch (which only runs when created === true) stays
     * idempotent under concurrency.
     */
    try {
      const created = await this.prisma.stripeEvent.create({
        data: { id: input.id, organizationId: input.organizationId, type: input.type, payload: input.payload as any },
      });

      return { event: mapStripeEvent(created), created: true };
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        const row = await this.prisma.stripeEvent.findUnique({ where: { id: input.id } });

        if (row) {
          return { event: mapStripeEvent(row), created: false };
        }
      }

      throw error;
    }
  }

  async deleteStripeEvent(id: string): Promise<void> {
    /*
     * Used to roll back the dedup row when a webhook side effect fails, so
     * Stripe's retry re-runs the side effects instead of being deduped away.
     */
    await this.prisma.stripeEvent.deleteMany({ where: { id } });
  }

  async recordStripeWebhookFailure(input: { eventId: string; type: string; payload: unknown; error: string }) {
    const row = await this.prisma.stripeWebhookFailure.upsert({
      where: { eventId: input.eventId },
      create: {
        eventId: input.eventId,
        type: input.type,
        payload: input.payload as any,
        lastError: input.error,
      },
      update: {
        attempts: { increment: 1 },
        lastError: input.error,

        // Refresh the payload too: a Stripe retry may carry a newer serialization.
        payload: input.payload as any,
        failedAt: new Date(),
        resolvedAt: null,
      },
    });

    return mapStripeWebhookFailure(row);
  }

  async listStripeWebhookFailures(options?: { includeResolved?: boolean; limit?: number }) {
    const rows = await this.prisma.stripeWebhookFailure.findMany({
      where: options?.includeResolved ? {} : { resolvedAt: null },
      orderBy: { failedAt: 'desc' },
      take: options?.limit ?? 50,
    });

    return rows.map(mapStripeWebhookFailure);
  }

  async getStripeWebhookFailure(eventId: string) {
    const row = await this.prisma.stripeWebhookFailure.findUnique({ where: { eventId } });
    return row ? mapStripeWebhookFailure(row) : undefined;
  }

  async resolveStripeWebhookFailure(eventId: string): Promise<void> {
    await this.prisma.stripeWebhookFailure.updateMany({
      where: { eventId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  async recordSamlAssertionConsumption(input: { organizationId: string; assertionId: string; expiresAt: Date }) {
    // Best-effort prune so the dedup table stays bounded (assertions are short-lived).
    await this.prisma.samlAssertion.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

    try {
      await this.prisma.samlAssertion.create({
        data: {
          organizationId: input.organizationId,
          assertionId: input.assertionId,
          expiresAt: input.expiresAt,
        },
      });

      return { created: true };
    } catch (error) {
      if (isPrismaKnownRequestError(error) && error.code === 'P2002') {
        return { created: false };
      }

      throw error;
    }
  }

  async recordEmailDeliveryEvent(input: {
    provider: string;
    providerEventId: string;
    type: string;
    email: string;
    emailMessageId?: string;
    subject?: string;
    fromAddress?: string;
    payload: unknown;
  }) {
    const existing = await this.prisma.emailDeliveryEvent.findUnique({
      where: {
        provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId },
      },
    });

    if (existing) {
      return { event: mapEmailDeliveryEvent(existing), created: false };
    }

    /*
     * Mirror recordStripeEvent: email providers (Resend/SES) deliver retries
     * concurrently, so two requests can both pass the findUnique above and the
     * second create() then violates the provider_providerEventId unique
     * constraint — previously an uncoded 500 + provider retry storm. Treat
     * P2002 as "already recorded" to keep the side-effecting branch idempotent.
     */
    try {
      const created = await this.prisma.emailDeliveryEvent.create({
        data: {
          provider: input.provider,
          providerEventId: input.providerEventId,
          type: input.type,
          email: input.email,
          emailMessageId: input.emailMessageId,
          subject: input.subject,
          fromAddress: input.fromAddress,
          payload: input.payload as any,
        },
      });

      return { event: mapEmailDeliveryEvent(created), created: true };
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        const row = await this.prisma.emailDeliveryEvent.findUnique({
          where: {
            provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId },
          },
        });

        if (row) {
          return { event: mapEmailDeliveryEvent(row), created: false };
        }
      }

      throw error;
    }
  }

  async listEmailDeliveryEvents(filter?: { email?: string; type?: string; emailMessageId?: string; limit?: number }) {
    const where: Record<string, unknown> = {};

    if (filter?.email) {
      where.email = filter.email;
    }

    if (filter?.type) {
      where.type = filter.type;
    }

    if (filter?.emailMessageId) {
      where.emailMessageId = filter.emailMessageId;
    }

    const rows = await this.prisma.emailDeliveryEvent.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: Math.min(Math.max(filter?.limit ?? 100, 1), 500),
    });

    return rows.map(mapEmailDeliveryEvent);
  }

  async recordAudit(event: AuditEvent) {
    const metadata = redactAuditMetadata(event.metadata);
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        actorUserId: event.actorUserId,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        metadata: metadata as any,
        ipAddress: event.ipAddress,
      },
    });
  }

  async listAuditLogs(organizationId?: string) {
    /*
     * The audit_log table is the densest in the system (one row per mutating
     * action across every org). Bound the fetch so callers — including the
     * global /admin/* consumers that pass no organizationId and then filter in
     * JS — can't pull the entire table into memory. Newest rows are kept via
     * the existing desc ordering, matching the other admin list caps.
     */
    return (
      await this.prisma.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 2000 })
    ).map(
      (event) =>
        ({
          organizationId: event.organizationId ?? undefined,
          actorUserId: event.actorUserId ?? undefined,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId ?? undefined,
          metadata: (event.metadata as Record<string, unknown> | null) ?? undefined,
          ipAddress: event.ipAddress ?? undefined,
          createdAt: toIso(event.createdAt)!,
        }) as AuditEvent,
    );
  }

  async listAdminUsers() {
    /*
     * The admin console only needs the newest 500 users, but this same list is
     * the SOLE input to the last-platform-admin lockout guard
     * (assertNotLastPlatformAdmin). Platform admins are typically the OLDEST
     * accounts (first signups), so on any deployment with >500 users they fall
     * outside the newest-500 window — the guard's target lookup then misses and
     * returns early, letting the last admin be removed/suspended (zero-admin
     * lockout). To keep the cap for the console yet make the guard sound, union
     * the capped newest-500 page with the (small, complete) set of platform
     * admins, de-duplicating by id.
     */
    const [recent, admins] = await Promise.all([
      this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
      this.prisma.user.findMany({ where: { platformAdmin: true } }),
    ]);
    const byId = new Map<string, (typeof recent)[number]>();

    for (const user of recent) {
      byId.set(user.id, user);
    }

    for (const user of admins) {
      byId.set(user.id, user);
    }

    return [...byId.values()].map(mapUser);
  }

  async listAdminUsersPage(options: {
    page: number;
    pageSize: number;
    sort: 'name' | 'email' | 'createdAt';
    direction: 'asc' | 'desc';
    query?: string;
  }) {
    const where = options.query
      ? {
          OR: [
            { name: { contains: options.query, mode: 'insensitive' as const } },
            { email: { contains: options.query, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { [options.sort]: options.direction },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users: rows.map(mapUser), total };
  }

  /*
   * Complete set of platform administrators, never capped. Use this (not the
   * take-bounded listAdminUsers) whenever the zero-admin invariant must hold.
   */
  async listPlatformAdmins() {
    return (await this.prisma.user.findMany({ where: { platformAdmin: true } })).map(mapUser);
  }

  async countPlatformAdmins() {
    return this.prisma.user.count({ where: { platformAdmin: true } });
  }

  async listAdminOrganizations() {
    return (await this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })).map(
      mapOrganization,
    );
  }

  async listAdminProjects() {
    return (await this.prisma.project.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 })).map(mapProject);
  }

  async listAdminWorkspaces() {
    return (await this.prisma.workspace.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 })).map(mapWorkspace);
  }

  async listAdminDeployments() {
    return (await this.prisma.deployment.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })).map(mapDeployment);
  }

  async listAdminSupportTickets() {
    return (await this.prisma.supportTicket.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })).map(
      mapSupportTicket,
    );
  }

  async listAdminUsageEvents() {
    return (await this.prisma.usageEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })).map(mapUsageEvent);
  }

  async listAdminAiCosts() {
    return (await this.prisma.aiCostLedger.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })).map(
      mapAiCostLedger,
    );
  }

  async updateWorkspaceStatus(input: { workspaceId: string; status: WorkspaceRecord['status'] }) {
    return mapWorkspace(
      await this.prisma.workspace.update({ where: { id: input.workspaceId }, data: { status: input.status } }),
    );
  }

  async updateSupportTicket(input: { ticketId: string; status: SupportTicketRecord['status']; response?: string }) {
    /*
     * Serialize the read-modify-write of the metadata JSON blob so two concurrent
     * updates to the same ticket can't clobber each other's merged keys.
     */
    return this.withSerializedMutation(`support-ticket:${input.ticketId}`, async () => {
      const existing = await this.prisma.supportTicket.findUnique({ where: { id: input.ticketId } });
      const existingMetadata = (existing?.metadata as Record<string, unknown> | null) ?? {};

      const metadata = {
        ...existingMetadata,
        ...(input.response ? { latestAdminResponse: input.response } : {}),

        // Stamp the FIRST admin response only — later responses keep the SLA mark.
        ...(input.response && typeof existingMetadata.firstResponseAt !== 'string'
          ? { firstResponseAt: new Date().toISOString() }
          : {}),
      };

      return mapSupportTicket(
        await this.prisma.supportTicket.update({
          where: { id: input.ticketId },
          data: { status: input.status, metadata: metadata as any },
        }),
      );
    });
  }

  async assignSupportTicket(input: { ticketId: string; assigneeUserId?: string }) {
    // Serialize the metadata read-modify-write (see updateSupportTicket).
    return this.withSerializedMutation(`support-ticket:${input.ticketId}`, async () => {
      const existing = await this.prisma.supportTicket.findUnique({ where: { id: input.ticketId } });

      if (!existing) {
        throw Object.assign(new Error(appPublicEnglish('SUPPORT_TICKET_NOT_FOUND')), {
          statusCode: 404,
          code: 'SUPPORT_TICKET_NOT_FOUND',
        });
      }

      const metadata = {
        ...((existing.metadata as Record<string, unknown> | null) ?? {}),

        // `null` (not delete) so the unassign survives the JSON merge above.
        assigneeUserId: input.assigneeUserId ?? null,
      };

      return mapSupportTicket(
        await this.prisma.supportTicket.update({
          where: { id: input.ticketId },
          data: { metadata: metadata as any },
        }),
      );
    });
  }

  async listSecurityAuditEvents() {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 2000 });
    return rows
      .filter(
        (event) =>
          event.action.startsWith('auth.') || event.action.includes('security') || event.action.includes('mfa'),
      )
      .map((event) => ({
        id: event.id,
        organizationId: event.organizationId ?? undefined,
        actorUserId: event.actorUserId ?? undefined,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? undefined,
        metadata: (event.metadata as Record<string, unknown> | null) ?? undefined,
        ipAddress: event.ipAddress ?? undefined,
        createdAt: toIso(event.createdAt)!,
      }));
  }

  async listSecurityEventResolutions() {
    return (await this.prisma.securityEventResolution.findMany()).map(mapSecurityEventResolution);
  }

  async resolveSecurityEvent(input: { auditLogId: string; note?: string; resolvedByUserId?: string }) {
    const row = await this.prisma.securityEventResolution.upsert({
      where: { auditLogId: input.auditLogId },
      create: {
        auditLogId: input.auditLogId,
        resolved: true,
        note: input.note,
        resolvedByUserId: input.resolvedByUserId,
      },
      update: {
        resolved: true,
        note: input.note,
        resolvedByUserId: input.resolvedByUserId,
        resolvedAt: new Date(),
      },
    });
    return mapSecurityEventResolution(row);
  }

  async updateAbuseEvent(input: { abuseEventId: string; resolved?: boolean; disposition?: string }) {
    // Serialize the metadata read-modify-write (see updateSupportTicket).
    return this.withSerializedMutation(`abuse-event:${input.abuseEventId}`, async () => {
      const existing = await this.prisma.abuseEvent.findUnique({ where: { id: input.abuseEventId } });

      const metadata = {
        ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
        resolved: input.resolved ?? true,
        resolvedAt: new Date().toISOString(),
        ...(input.disposition ? { disposition: input.disposition } : {}),
      };

      return mapAbuseEvent(
        await this.prisma.abuseEvent.update({
          where: { id: input.abuseEventId },
          data: { metadata: metadata as any },
        }),
      );
    });
  }

  async recordAdminAudit(event: AdminAuditLogRecord) {
    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId: event.actorUserId,
        action: event.action,
        metadata: redactAuditMetadata(event.metadata) as any,
        ipAddress: event.ipAddress,
      },
    });
  }

  async redactAuditLogs(input: { organizationId?: string; actorUserId?: string; before?: string }) {
    const where: Record<string, unknown> = {
      // Skip rows already redacted so the count reflects real work + the op is idempotent.
      ipAddress: { not: null },
    };

    if (input.organizationId) {
      where.organizationId = input.organizationId;
    }

    if (input.actorUserId) {
      where.actorUserId = input.actorUserId;
    }

    if (input.before) {
      const before = new Date(input.before);

      if (!Number.isNaN(before.getTime())) {
        where.createdAt = { lt: before };
      }
    }

    // Guard against an unscoped wipe: a selector is mandatory at the route layer,
    // but defend here too so a future caller can never null the whole trail.
    if (!input.organizationId && !input.actorUserId) {
      return { redacted: 0 };
    }

    const result = await this.prisma.auditLog.updateMany({
      where: where as any,
      data: { ipAddress: null, metadata: { redacted: true, redactedAt: new Date().toISOString() } as any },
    });

    return { redacted: result.count };
  }

  async listAdminAuditLogs() {
    return (await this.prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })).map(
      (event): AdminAuditLogRecord => ({
        actorUserId: event.actorUserId ?? undefined,
        action: event.action,
        metadata: (event.metadata as Record<string, unknown> | null) ?? undefined,
        ipAddress: event.ipAddress ?? undefined,
        createdAt: toIso(event.createdAt)!,
      }),
    );
  }

  private async ensureRole(roleKey: string) {
    return this.prisma.role.upsert({
      where: { key: roleKey },
      create: {
        key: roleKey,
        name: roleKey.charAt(0).toUpperCase() + roleKey.slice(1),
        system: Object.hasOwn(rolePermissions, roleKey),
      },
      update: {},
    });
  }

  private async ensurePlan(planKey: PlanKey) {
    return this.prisma.plan.upsert({
      where: { key: planKey },
      create: { key: planKey, name: planKey.charAt(0).toUpperCase() + planKey.slice(1), monthlyCents: 0, limits: {} },
      update: {},
    });
  }
}

function mapUser(user: any): UserRecord {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? undefined,
    passwordHash: user.passwordHash ?? undefined,
    emailVerifiedAt: toIso(user.emailVerifiedAt),
    mfaEnabled: user.mfaEnabled,
    mfaSecretEncrypted: user.mfaSecretCiphertext ?? undefined,
    platformAdmin: user.platformAdmin,
    language: user.language ?? undefined,
    timezone: user.timezone ?? undefined,
    preferences:
      user.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences)
        ? (user.preferences as Record<string, unknown>)
        : undefined,
    lastActiveAt: toIso(user.lastActiveAt),
    createdAt: toIso(user.createdAt)!,
  };
}

function mapSession(session: any): SessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    tokenHash: session.tokenHash,
    expiresAt: toIso(session.expiresAt)!,
    createdAt: toIso(session.createdAt)!,
    ipAddress: session.ipAddress ?? undefined,
    userAgent: session.userAgent ?? undefined,
    revokedAt: toIso(session.revokedAt),
    lastReauthAt: toIso(session.lastReauthAt),
    impersonatedBy: session.impersonatedBy ?? undefined,
  };
}

function mapRuntimeWebSocketTicket(ticket: any): RuntimeWebSocketTicketRecord {
  return {
    id: ticket.id,
    tokenHash: ticket.tokenHash,
    userId: ticket.userId,
    workspaceId: ticket.workspaceId,
    projectId: ticket.projectId,
    resolvedWorkspaceId: ticket.resolvedWorkspaceId,
    endpoint: ticket.endpoint,
    expiresAt: ticket.expiresAt.toISOString(),
    consumedAt: toIso(ticket.consumedAt),
    createdAt: ticket.createdAt.toISOString(),
  };
}

function mapOrganization(organization: any): OrganizationRecord {
  return {
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    createdAt: toIso(organization.createdAt)!,
    billingEmail: organization.billingEmail ?? undefined,
  };
}

function mapMembership(member: any): MembershipRecord {
  return {
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    roleKey: member.role?.key ?? member.roleKey ?? 'member',
    state: member.state ?? 'ACTIVE',
    invitedByUserId: member.invitedByUserId ?? undefined,
    joinedAt: toIso(member.joinedAt ?? member.createdAt)!,
    userName: member.user?.name ?? undefined,
    userEmail: member.user?.email ?? undefined,
  };
}

function mapCollaborationGroup(group: any): CollaborationGroupRecord {
  return {
    id: group.id,
    organizationId: group.organizationId,
    name: group.name,
    source: group.source,
    externalId: group.externalId ?? undefined,
    deletedAt: toIso(group.deletedAt),
    createdAt: toIso(group.createdAt)!,
    updatedAt: toIso(group.updatedAt)!,
  };
}

function mapCollaborationGroupMember(member: any, userId: string): CollaborationGroupMemberRecord {
  return {
    id: member.id,
    organizationId: member.organizationId,
    groupId: member.groupId,
    membershipId: member.membershipId,
    userId,
    createdAt: toIso(member.createdAt)!,
  };
}

function mapResourceAccessGrant(grant: any): ResourceAccessGrantRecord {
  return {
    id: grant.id,
    organizationId: grant.organizationId,
    subjectType: grant.subjectType,
    subjectUserId: grant.subjectUserId ?? undefined,
    subjectGroupId: grant.subjectGroupId ?? undefined,
    resourceType: grant.resourceType,
    resourceId: grant.resourceId,
    roleKey: grant.roleKey,
    status: grant.status,
    expiresAt: toIso(grant.expiresAt)!,
    acceptedAt: toIso(grant.acceptedAt),
    consentVersion: grant.consentVersion ?? undefined,
    grantedByUserId: grant.grantedByUserId,
    revokedAt: toIso(grant.revokedAt),
    revokedByUserId: grant.revokedByUserId ?? undefined,
    revocationReason: grant.revocationReason ?? undefined,
    idempotencyKey: grant.idempotencyKey ?? undefined,
    requestHash: grant.requestHash,
    createdAt: toIso(grant.createdAt)!,
    updatedAt: toIso(grant.updatedAt)!,
  };
}

function mapProject(project: any): ProjectRecord {
  return {
    id: project.id,
    organizationId: project.organizationId,
    name: project.name,
    slug: project.slug,
    description: project.description ?? undefined,
    sourceType: project.sourceType,
    templateName: project.templateName ?? undefined,
    gitRepositoryUrl: project.gitRepositoryUrl ?? undefined,
    gitDefaultBranch: project.gitDefaultBranch ?? undefined,
    persistentVolumeClaim: project.persistentVolumeClaim,
    createdAt: toIso(project.createdAt)!,
    updatedAt: toIso(project.updatedAt)!,
    deletedAt: toIso(project.deletedAt),
    ...(typeof project._count?.deployments === 'number' ? { deploymentCount: project._count.deployments } : {}),
  };
}

/*
 * Convention shared with services/api/src/project-storage.ts: each workspace
 * gets its own isolated git working tree under `.vibecore-workspaces/<id>` of
 * the project storage root. Returning a relative path keeps the row portable
 * across PROJECT_STORAGE_DIR overrides (dev vs prod, on-disk vs PVC).
 */
export function workspaceRelativeGitPath(workspaceId: string) {
  return `.vibecore-workspaces/${workspaceId}`;
}

function mapWorkspace(workspace: any): WorkspaceRecord {
  return {
    id: workspace.id,
    projectId: workspace.projectId,
    name: workspace.name,
    status: workspace.status,
    runtimeMode: workspace.runtimeMode,
    gitPath: workspace.gitPath ?? undefined,
    gitRepositoryUrl: workspace.gitRepositoryUrl ?? undefined,
    environment: workspace.environment ?? undefined,
    createdAt: toIso(workspace.createdAt)!,
  };
}

function mapWorkspaceIdeState(state: any): WorkspaceIdeStateRecord {
  return {
    workspaceId: state.workspaceId,
    state: state.state,
    version: state.version,
    updatedByUserId: state.updatedByUserId ?? undefined,
    updatedAt: toIso(state.updatedAt)!,
    createdAt: toIso(state.createdAt)!,
  };
}

function mapSnapshot(snapshot: any): SnapshotRecord {
  return {
    id: snapshot.id,
    projectId: snapshot.projectId,
    label: snapshot.label ?? undefined,
    kind: snapshot.kind,
    manifest: snapshot.manifest,
    storageKey: snapshot.storageKey ?? undefined,
    byteLength: snapshot.byteLength ?? undefined,
    createdByUserId: snapshot.createdByUserId ?? undefined,
    conversationId: snapshot.conversationId ?? undefined,
    turnIndex: snapshot.turnIndex ?? undefined,
    createdAt: toIso(snapshot.createdAt)!,
  };
}

function mapProjectStorageObject(object: any): ProjectStorageObjectRecord {
  return {
    id: object.id,
    projectId: object.projectId ?? undefined,
    key: object.key,
    kind: object.kind,
    contentBase64: object.contentBase64,
    byteLength: object.byteLength,
    contentHash: object.contentHash,
    createdAt: toIso(object.createdAt)!,
  };
}

function normalizeEnvVarScope(scope: unknown): EnvVarScope {
  return ENV_VAR_SCOPES.includes(scope as EnvVarScope) ? (scope as EnvVarScope) : DEFAULT_ENV_VAR_SCOPE;
}

function mapEnvVar(envVar: any): ProjectEnvironmentRecord {
  return {
    id: envVar.id,
    projectId: envVar.projectId,
    key: envVar.key,
    value: envVar.value,
    // Back-compat: rows read before the column was populated fall back to production.
    scope: normalizeEnvVarScope(envVar.scope),
    createdAt: toIso(envVar.createdAt)!,
    updatedAt: toIso(envVar.updatedAt)!,
  };
}

function mapSecret(secret: any): ProjectSecretRecord {
  return {
    id: secret.id,
    projectId: secret.projectId,
    key: secret.key,
    valueEncrypted: secret.valueEncrypted ?? '',
    createdAt: toIso(secret.createdAt)!,
    updatedAt: toIso(secret.updatedAt)!,
  };
}

function mapProjectCollaborator(collaborator: any): ProjectCollaboratorRecord {
  return {
    id: collaborator.id,
    projectId: collaborator.projectId,
    userId: collaborator.userId,
    roleKey: collaborator.roleKey,
    expiresAt: toIso(collaborator.expiresAt),
    createdAt: toIso(collaborator.createdAt)!,
  };
}

function mapProjectActivity(activity: any): ProjectActivityRecord {
  return {
    id: activity.id,
    projectId: activity.projectId,
    actorUserId: activity.actorUserId ?? undefined,
    action: activity.action,
    metadata: activity.metadata ?? undefined,
    createdAt: toIso(activity.createdAt)!,
  };
}

function mapProjectIdeState(state: any): ProjectIdeStateRecord {
  return {
    projectId: state.projectId,
    state: state.state,
    version: state.version,
    updatedByUserId: state.updatedByUserId ?? undefined,
    updatedAt: toIso(state.updatedAt)!,
    createdAt: toIso(state.createdAt)!,
  };
}

function mapCollaborationPresence(presence: any): CollaborationPresenceRecord {
  return {
    id: presence.id,
    projectId: presence.projectId,
    userId: presence.userId,
    sessionId: presence.sessionId,
    status: presence.status,
    filePath: presence.filePath ?? undefined,
    cursor: presence.cursor ?? undefined,
    selection: presence.selection ?? undefined,
    mode: presence.mode,
    terminalAccess: presence.terminalAccess,
    createdAt: toIso(presence.createdAt)!,
    updatedAt: toIso(presence.updatedAt)!,
  };
}

function mapCollaborationComment(comment: any): CollaborationCommentRecord {
  return {
    id: comment.id,
    projectId: comment.projectId,
    userId: comment.userId,
    filePath: comment.filePath ?? undefined,
    line: comment.line ?? undefined,
    selection: comment.selection ?? undefined,
    body: comment.body,
    resolvedAt: toIso(comment.resolvedAt),
    createdAt: toIso(comment.createdAt)!,
  };
}

function mapProjectShareLink(link: any): ProjectShareLinkRecord {
  return {
    id: link.id,
    projectId: link.projectId,
    tokenHash: link.tokenHash,
    roleKey: link.roleKey,
    expiresAt: toIso(link.expiresAt)!,
    createdByUserId: link.createdByUserId ?? undefined,
    revokedAt: toIso(link.revokedAt),
    createdAt: toIso(link.createdAt)!,
  };
}

function mapChatShare(share: any): ChatShareRecord {
  return {
    id: share.id,
    tokenHash: share.tokenHash,
    conversationId: share.conversationId,
    projectId: share.projectId,
    authorUserId: share.authorUserId,
    title: share.title ?? undefined,
    payload: share.payloadJson,
    allowFork: share.allowFork,
    expiresAt: toIso(share.expiresAt),
    revokedAt: toIso(share.revokedAt),
    createdAt: toIso(share.createdAt)!,
  };
}

function mapAgentPatchProposal(row: any): AgentPatchProposalRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    artifactId: row.artifactId,
    messageId: row.messageId,
    actionId: row.actionId,
    filePath: row.filePath,
    relativePath: row.relativePath,
    originalContent: row.originalContent,
    proposedContent: row.proposedContent,
    hunks: row.hunks,
    status: row.status,
    error: row.error ?? undefined,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function mapAgentRepairEvent(row: any): AgentRepairEventRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    messageId: row.messageId ?? undefined,
    artifactId: row.artifactId ?? undefined,
    actionId: row.actionId ?? undefined,
    relativePath: row.relativePath,
    attempt: row.attempt,
    outcome: row.outcome,
    validationError: row.validationError ?? undefined,
    repairError: row.repairError ?? undefined,
    createdAt: toIso(row.createdAt)!,
  };
}

function mapConsensusRecord(row: any): ConsensusRecordSummary {
  return {
    id: row.id,
    runId: row.runId,
    algorithm: row.algorithm,
    threshold: row.threshold,
    outcome: row.outcome,
    agreementScore: row.agreementScore,
    roundCount: row.rounds,
    durationMs: row.durationMs,
    createdAt: toIso(row.createdAt)!,
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mapClaimVote(value: any): ConsensusClaimVote {
  return {
    claim: typeof value?.claim === 'string' ? value.claim : '',
    type: typeof value?.type === 'string' ? value.type : '',
    supporters: asStringArray(value?.supporters),
    dissenters: asStringArray(value?.dissenters),
    abstainers: asStringArray(value?.abstainers),
    agreementRatio: typeof value?.agreementRatio === 'number' ? value.agreementRatio : 0,
    decision: typeof value?.decision === 'string' ? value.decision : 'inconclusive',
  };
}

function mapConflict(value: any): ConsensusConflict {
  return {
    type: typeof value?.type === 'string' ? value.type : '',
    description: typeof value?.description === 'string' ? value.description : '',
    involvedRoles: asStringArray(value?.involvedRoles),
    severity: typeof value?.severity === 'string' ? value.severity : 'low',
  };
}

function mapConsolidated(value: any): ConsensusConsolidated | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    summary: typeof value.summary === 'string' ? value.summary : '',
    acceptedRisks: asStringArray(value.acceptedRisks),
    acceptedVerification: asStringArray(value.acceptedVerification),
    acceptedFiles: asStringArray(value.acceptedFiles),
    rejectedClaims: Array.isArray(value.rejectedClaims)
      ? value.rejectedClaims.map((claim: any) => ({
          claim: typeof claim?.claim === 'string' ? claim.claim : '',
          type: typeof claim?.type === 'string' ? claim.type : '',
        }))
      : [],
    perRoleSummaries: Array.isArray(value.perRoleSummaries)
      ? value.perRoleSummaries.map((entry: any) => ({
          roleId: typeof entry?.roleId === 'string' ? entry.roleId : '',
          summary: typeof entry?.summary === 'string' ? entry.summary : '',
          status: typeof entry?.status === 'string' ? entry.status : '',
        }))
      : [],
  };
}

function mapConsensusRecordDetail(row: any): ConsensusRecordDetail {
  return {
    ...mapConsensusRecord(row),
    claimVotes: Array.isArray(row.claimVotes) ? row.claimVotes.map(mapClaimVote) : [],
    conflicts: Array.isArray(row.conflicts) ? row.conflicts.map(mapConflict) : [],
    consolidated: mapConsolidated(row.consolidated),
  };
}

function mapDeployment(deployment: any): DeploymentRecord {
  return {
    id: deployment.id,
    projectId: deployment.projectId,
    workspaceId: deployment.workspaceId ?? undefined,
    provider: deployment.provider,
    environment: deployment.environmentName ?? 'preview',
    status: deployment.status,
    url: deployment.url ?? undefined,
    previewUrl: deployment.previewUrl ?? undefined,
    productionUrl: deployment.productionUrl ?? undefined,
    framework: deployment.framework ?? undefined,
    buildCommand: deployment.buildCommand ?? undefined,
    outputDirectory: deployment.outputDirectory ?? undefined,
    branch: deployment.branch ?? undefined,
    commitSha: deployment.commitSha ?? undefined,
    customDomain: deployment.customDomain ?? undefined,
    logs: Array.isArray(deployment.logs) ? deployment.logs : [],
    metadata: deployment.metadata ?? undefined,
    rolledBackFromId: deployment.rolledBackFromId ?? undefined,
    parentDeploymentId: deployment.parentDeploymentId ?? undefined,
    machineSize: deployment.machineSize ?? undefined,
    lastMeteredAt: toIso(deployment.lastMeteredAt),
    startedAt: toIso(deployment.startedAt),
    finishedAt: toIso(deployment.finishedAt),
    canceledAt: toIso(deployment.canceledAt),
    createdAt: toIso(deployment.createdAt)!,
    updatedAt: toIso(deployment.updatedAt),
  };
}

function mapReleaseManifest(row: any): ReleaseManifestRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    deploymentId: row.deploymentId,
    environment: row.environment,
    version: row.version,
    provider: row.provider,
    artifactKind: row.artifactKind,
    artifactRef: row.artifactRef,
    artifactDigest: row.artifactDigest,
    storeGeneration: row.storeGeneration ?? undefined,
    configDigest: row.configDigest ?? undefined,
    dbMigrationPoint: row.dbMigrationPoint ?? undefined,
    createdAt: toIso(row.createdAt)!,
  };
}

function mapProjectManifestRevision(row: any): ProjectManifestRevisionRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    schemaVersion: row.schemaVersion,
    manifestVersion: row.manifestVersion,
    digest: row.digest,
    manifest: row.manifest,
    createdByUserId: row.createdByUserId ?? undefined,
    createdAt: toIso(row.createdAt)!,
  };
}

function mapSupportTicket(ticket: any): SupportTicketRecord {
  /*
   * assigneeUserId / firstResponseAt live in the metadata JSON blob (like
   * latestAdminResponse) rather than dedicated columns, so the admin triage
   * fields ship without a schema migration.
   */
  const metadata = (ticket.metadata ?? {}) as Record<string, unknown>;

  return {
    id: ticket.id,
    organizationId: ticket.organizationId,
    userId: ticket.userId,
    subject: ticket.subject,
    status: ticket.status,
    category: typeof ticket.metadata?.category === 'string' ? ticket.metadata.category : undefined,
    createdAt: toIso(ticket.createdAt)!,
    assigneeUserId: typeof metadata.assigneeUserId === 'string' ? metadata.assigneeUserId : undefined,
    firstResponseAt: typeof metadata.firstResponseAt === 'string' ? metadata.firstResponseAt : undefined,
  };
}

function mapTicketMessage(message: any): TicketMessageRecord {
  return {
    id: message.id,
    ticketId: message.ticketId,
    authorType: message.authorType,
    authorUserId: message.authorUserId ?? undefined,
    body: message.body,
    createdAt: toIso(message.createdAt)!,
  };
}

function mapFeatureFlag(flag: any): FeatureFlagRecord {
  const rawRollout = flag.rules?.rolloutPercent;

  const rolloutPercent =
    typeof rawRollout === 'number' && Number.isFinite(rawRollout)
      ? Math.max(0, Math.min(100, Math.round(rawRollout)))
      : undefined;

  return {
    id: flag.id,
    organizationId: flag.organizationId ?? undefined,
    key: flag.key,
    enabled: flag.enabled,
    rolloutPercent,
  };
}

function mapSecurityEventResolution(row: any): SecurityEventResolutionRecord {
  return {
    id: row.id,
    auditLogId: row.auditLogId,
    resolved: row.resolved,
    note: row.note ?? undefined,
    resolvedByUserId: row.resolvedByUserId ?? undefined,
    resolvedAt: toIso(row.resolvedAt)!,
    createdAt: toIso(row.createdAt)!,
  };
}

function mapAbuseEvent(event: any): AbuseEventRecord {
  const metadata = (event.metadata as Record<string, unknown> | null) ?? {};
  return {
    id: event.id,
    organizationId: event.organizationId ?? undefined,
    userId: event.userId ?? undefined,
    type: event.type,
    severity: event.severity,
    createdAt: toIso(event.createdAt)!,
    resolved: typeof metadata.resolved === 'boolean' ? (metadata.resolved as boolean) : undefined,
    disposition: typeof metadata.disposition === 'string' ? (metadata.disposition as string) : undefined,
    resolvedAt: typeof metadata.resolvedAt === 'string' ? (metadata.resolvedAt as string) : undefined,
  };
}

function mapIntegrationFeatureRequest(request: any): IntegrationFeatureRequestRecord {
  return {
    id: request.id,
    userId: request.userId,
    organizationId: request.organizationId ?? undefined,
    integrationName: request.integrationName,
    useCaseDescription: request.useCaseDescription,
    status: request.status,
    createdAt: toIso(request.createdAt)!,
  };
}

function mapAiMessageFeedback(feedback: any): AiMessageFeedbackRecord {
  return {
    id: feedback.id,
    userId: feedback.userId,
    messageId: feedback.messageId,
    chatId: feedback.chatId ?? undefined,
    vote: feedback.vote as AiMessageFeedbackVote,
    createdAt: toIso(feedback.createdAt)!,
    updatedAt: toIso(feedback.updatedAt)!,
  };
}

function mapSystemSetting(setting: any): SystemSettingRecord {
  return { key: setting.key, value: setting.value, updatedAt: toIso(setting.updatedAt)! };
}

function mapEnterpriseSettings(settings: any): EnterpriseSettingsRecord {
  return {
    organizationId: settings.organizationId,
    ipAllowlist: settings.ipAllowlist,
    sessionDurationMinutes: settings.sessionDurationMinutes,
    requireMfaForAdmins: settings.requireMfaForAdmins,
    dataRetentionDays: settings.dataRetentionDays,
    legalHoldEnabled: settings.legalHoldEnabled,
    ssoEnforced: settings.ssoEnforced ?? false,
    ssoEnforcedAt: toIso(settings.ssoEnforcedAt) ?? null,
    updatedAt: toIso(settings.updatedAt)!,
  };
}

function mapDomainVerification(domain: any): DomainVerificationRecord {
  return {
    id: domain.id,
    organizationId: domain.organizationId,
    domain: domain.domain,
    verificationToken: domain.verificationToken,
    verifiedAt: toIso(domain.verifiedAt),
    redirectWww: domain.redirectWww ?? true,
    wildcardEnabled: domain.wildcardEnabled ?? false,
    sslStatus: domain.sslStatus ?? 'pending_dns',
    createdAt: toIso(domain.createdAt)!,
  };
}

function mapSsoConfig(config: any): SsoConfigRecord {
  return {
    id: config.id,
    organizationId: config.organizationId,
    type: config.type,
    enabled: config.enabled,
    encryptedConfig: config.encryptedConfig,
    createdAt: toIso(config.createdAt)!,
    updatedAt: toIso(config.updatedAt)!,
  };
}

function mapScimToken(token: any): ScimTokenRecord {
  return {
    id: token.id,
    organizationId: token.organizationId,
    name: token.name,
    tokenHash: token.tokenHash,
    createdAt: toIso(token.createdAt)!,
    lastUsedAt: toIso(token.lastUsedAt),
  };
}

function mapCustomRole(role: any): CustomRoleRecord {
  return {
    id: role.id,
    organizationId: role.organizationId,
    key: role.key,
    name: role.name,
    permissions: role.permissions,
    createdAt: toIso(role.createdAt)!,
  };
}

function mapSiemWebhook(webhook: any): SiemWebhookRecord {
  return {
    id: webhook.id,
    organizationId: webhook.organizationId,
    url: webhook.url,
    secretHash: webhook.secretHash,
    secretCiphertext: webhook.secretCiphertext,
    enabled: webhook.enabled,
    lastDeliveredAt: toIso(webhook.lastDeliveredAt),
    lastDeliveredId: webhook.lastDeliveredId ?? undefined,
    createdAt: toIso(webhook.createdAt)!,
  };
}

function mapApiKey(key: any): ApiKeyRecord {
  return {
    id: key.id,
    organizationId: key.organizationId ?? undefined,
    userId: key.userId ?? undefined,
    name: key.name,
    keyHash: key.keyHash,
    keyPrefix: key.keyPrefix ?? undefined,
    scopes: ((key.scopes ?? []) as string[]).filter((scope): scope is ApiKeyScope =>
      API_KEY_SCOPES.includes(scope as ApiKeyScope),
    ),
    lastUsedAt: toIso(key.lastUsedAt),
    expiresAt: toIso(key.expiresAt),
    createdAt: toIso(key.createdAt)!,
  };
}

function mapOrganizationInvite(invite: any): OrganizationInviteRecord {
  return {
    id: invite.id,
    organizationId: invite.organizationId,
    email: invite.email,
    roleKey: invite.role?.key ?? 'member',
    tokenHash: invite.tokenHash,
    expiresAt: toIso(invite.expiresAt)!,
    acceptedAt: toIso(invite.acceptedAt),
    createdByUserId: invite.createdByUserId ?? undefined,
    createdAt: toIso(invite.createdAt)!,
  };
}

function mapOAuthConnection(connection: any): OAuthConnectionRecord {
  return {
    id: connection.id,
    userId: connection.userId,
    provider: connection.provider,
    externalId: connection.externalId,
    accessHash: connection.accessHash,
    refreshHash: connection.refreshHash ?? undefined,
    createdAt: toIso(connection.createdAt)!,
  };
}

function mapUserConnection(connection: any): UserConnectionRecord {
  return {
    id: connection.id,
    userId: connection.userId,
    provider: connection.provider,
    externalAccountId: connection.externalAccountId,
    externalAccountLabel: connection.externalAccountLabel,
    accessTokenEncrypted: connection.accessTokenEncrypted ?? undefined,
    refreshTokenEncrypted: connection.refreshTokenEncrypted ?? undefined,
    apiKeyFieldsEncrypted: (connection.apiKeyFieldsEncrypted as Record<string, string> | undefined) ?? undefined,
    scopes: connection.scopes ?? [],
    tokenExpiresAt: toIso(connection.tokenExpiresAt),
    status: connection.status as UserConnectionStatus,
    lastUsedAt: toIso(connection.lastUsedAt),
    forAgentUse: connection.forAgentUse,
    oauthAppSource: connection.oauthAppSource as 'e_code_default' | 'org_override',
    oauthAppOverrideId: connection.oauthAppOverrideId ?? undefined,
    createdByUserId: connection.createdByUserId,
    createdAt: toIso(connection.createdAt)!,
    updatedAt: toIso(connection.updatedAt)!,
    revokedAt: toIso(connection.revokedAt),
  };
}

function mapProjectConnectionLink(link: any): ProjectConnectionLinkRecord {
  return {
    id: link.id,
    projectId: link.projectId,
    userConnectionId: link.userConnectionId,
    linkedByUserId: link.linkedByUserId,
    linkedAt: toIso(link.linkedAt)!,
    unlinkedAt: toIso(link.unlinkedAt),
  };
}

function mapNotification(notification: any): NotificationRecord {
  return {
    id: notification.id,
    userId: notification.userId,
    category: notification.category,
    title: notification.title,
    body: notification.body ?? undefined,
    messageKey: notification.messageKey ?? undefined,
    messageParams: (notification.messageParams as Record<string, unknown> | null) ?? undefined,
    linkUrl: notification.linkUrl ?? undefined,
    metadata: (notification.metadata as Record<string, unknown> | null) ?? undefined,
    readAt: toIso(notification.readAt),
    createdAt: toIso(notification.createdAt)!,
  };
}

function mapReconnectionAlert(alert: any): ReconnectionAlertRecord {
  return {
    id: alert.id,
    userConnectionId: alert.userConnectionId,
    reason: alert.reason,
    detectedAt: toIso(alert.detectedAt)!,
    resolvedAt: toIso(alert.resolvedAt),
    notifiedAt: toIso(alert.notifiedAt),
    provider: alert.userConnection?.provider ?? '',
    externalAccountLabel: alert.userConnection?.externalAccountLabel ?? '',
  };
}

function mapAiConversation(conversation: any): AiConversationRecord {
  return {
    id: conversation.id,
    projectId: conversation.projectId ?? undefined,
    userId: conversation.userId,
    title: conversation.title ?? undefined,
    createdAt: toIso(conversation.createdAt)!,
  };
}

function mapAiMessage(message: any): AiMessageRecord {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    createdAt: toIso(message.createdAt)!,
  };
}

function mapAiToolCall(toolCall: any): AiToolCallRecord {
  return {
    id: toolCall.id,
    messageId: toolCall.messageId,
    name: toolCall.name,
    input: toolCall.input ?? undefined,
    output: toolCall.output ?? undefined,
    createdAt: toIso(toolCall.createdAt)!,
  };
}

function mapAiTokenUsage(usage: any): AiTokenUsageRecord {
  return {
    id: usage.id,
    messageId: usage.messageId,
    provider: usage.provider,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostCents: usage.estimatedCostCents,
    createdAt: toIso(usage.createdAt)!,
  };
}

function mapAiCostLedger(cost: any): AiCostLedgerRecord {
  return {
    id: cost.id,
    organizationId: cost.organizationId,
    projectId: cost.projectId ?? undefined,
    conversationId: cost.conversationId ?? undefined,
    messageId: cost.messageId ?? undefined,
    provider: cost.provider,
    model: cost.model,
    inputTokens: cost.inputTokens,
    outputTokens: cost.outputTokens,
    costCents: cost.costCents,
    reason: cost.reason,
    createdAt: toIso(cost.createdAt)!,
  };
}

function mapCreditWallet(wallet: any): CreditWalletRecord {
  return {
    id: wallet.id,
    organizationId: wallet.organizationId,
    balanceCents: wallet.balanceCents,
    currency: wallet.currency,
    budgetCapCents: wallet.budgetCapCents ?? undefined,
    serviceShutdownCents: wallet.serviceShutdownCents ?? undefined,
    autoTopupCents: wallet.autoTopupCents ?? undefined,
    lastSpendAlertPct: wallet.lastSpendAlertPct ?? undefined,
    lastSpendAlertPeriodStart: toIso(wallet.lastSpendAlertPeriodStart),
    createdAt: toIso(wallet.createdAt)!,
    updatedAt: toIso(wallet.updatedAt)!,
  };
}

function mapCreditPack(pack: any): CreditPackRecord {
  return {
    id: pack.id,
    organizationId: pack.organizationId,
    purchasedCents: pack.purchasedCents,
    remainingCents: pack.remainingCents,
    expiresAt: toIso(pack.expiresAt)!,
    stripePaymentIntentId: pack.stripePaymentIntentId ?? undefined,
    createdAt: toIso(pack.createdAt)!,
  };
}

function mapCreditLedger(entry: any): CreditLedgerRecord {
  return {
    id: entry.id,
    walletId: entry.walletId,
    organizationId: entry.organizationId,
    deltaCents: entry.deltaCents,
    kind: entry.kind,
    reason: entry.reason,
    checkpointId: entry.checkpointId ?? undefined,
    expiresAt: toIso(entry.expiresAt) ?? undefined,
    metadata: entry.metadata ?? undefined,
    createdAt: toIso(entry.createdAt)!,
  };
}

function mapAgentCheckpoint(checkpoint: any): AgentCheckpointRecord {
  return {
    id: checkpoint.id,
    organizationId: checkpoint.organizationId,
    userId: checkpoint.userId ?? undefined,
    projectId: checkpoint.projectId ?? undefined,
    conversationId: checkpoint.conversationId ?? undefined,
    runId: checkpoint.runId ?? undefined,
    status: checkpoint.status,
    highPowerModel: checkpoint.highPowerModel,
    extendedThinking: checkpoint.extendedThinking,
    buildTier: checkpoint.buildTier,
    turboMode: checkpoint.turboMode,
    inputTokens: checkpoint.inputTokens,
    outputTokens: checkpoint.outputTokens,
    wallMs: checkpoint.wallMs,
    computeCents: checkpoint.computeCents,
    rawProviderCents: checkpoint.rawProviderCents,
    creditCents: checkpoint.creditCents,
    startedAt: toIso(checkpoint.startedAt)!,
    completedAt: toIso(checkpoint.completedAt) ?? undefined,
  };
}

function mapProviderConfig(config: any): ProviderConfigRecord {
  return {
    id: config.id,
    provider: config.provider,
    displayName: config.displayName,
    enabled: config.enabled,
    apiKeySecret: config.apiKeySecret ?? undefined,
    apiKeyEnc: config.apiKeyEnc ?? undefined,
    baseUrl: config.baseUrl ?? undefined,
    byokAllowed: config.byokAllowed,
    createdAt: toIso(config.createdAt)!,
    updatedAt: toIso(config.updatedAt)!,
  };
}

function mapModelConfig(config: any): ModelConfigRecord {
  return {
    id: config.id,
    providerConfigId: config.providerConfigId,
    provider: config.providerConfig?.provider ?? undefined,
    modelId: config.modelId,
    displayName: config.displayName,
    enabled: config.enabled,
    enabledPlans: Array.isArray(config.enabledPlans) ? config.enabledPlans : [],
    isHighPower: config.isHighPower,
    supportsThinking: config.supportsThinking,
    inputCentsPerM: config.inputCentsPerM,
    outputCentsPerM: config.outputCentsPerM,
    contextWindow: config.contextWindow,
    createdAt: toIso(config.createdAt)!,
    updatedAt: toIso(config.updatedAt)!,
  };
}

function mapBillingCustomer(customer: any): BillingCustomerRecord {
  return {
    id: customer.id,
    organizationId: customer.organizationId,
    provider: customer.provider,
    externalId: customer.externalId,
    createdAt: toIso(customer.createdAt)!,
  };
}

function mapBillingPlan(plan: any): BillingPlanRecord {
  return {
    id: plan.id,
    key: plan.key,
    name: plan.name,
    monthlyCents: plan.monthlyCents,
    limits: plan.limits ?? {},
    stripeProductId: plan.stripeProductId ?? undefined,
    stripePriceId: plan.stripePriceId ?? undefined,
    stripePriceMonthlyId: plan.stripePriceMonthlyId ?? undefined,
    stripePriceAnnualId: plan.stripePriceAnnualId ?? undefined,
  };
}

function mapSubscription(subscription: any): SubscriptionRecord {
  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    planId: subscription.planId,
    planKey: subscription.plan?.key ?? 'free',
    externalId: subscription.externalId ?? undefined,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    trialEndsAt: toIso(subscription.trialEndsAt),
    currentPeriodStart: toIso(subscription.currentPeriodStart),
    currentPeriodEnd: toIso(subscription.currentPeriodEnd),
    createdAt: toIso(subscription.createdAt)!,
    updatedAt: toIso(subscription.updatedAt),
    lastStripeEventAt: toIso(subscription.lastStripeEventAt),
  };
}

function mapUsageEvent(event: any): UsageEventRecord {
  return {
    id: event.id,
    organizationId: event.organizationId,
    userId: event.userId ?? undefined,
    type: event.type,
    quantity: event.quantity,
    metadata: event.metadata ?? undefined,
    createdAt: toIso(event.createdAt)!,
  };
}

function mapQuotaOverride(override: any): QuotaOverrideRecord {
  return {
    id: override.id,
    organizationId: override.organizationId,
    key: override.key,
    limit: override.limit,
    reason: override.reason,
    createdByUserId: override.createdByUserId ?? undefined,
    expiresAt: toIso(override.expiresAt),
    createdAt: toIso(override.createdAt)!,
  };
}

function mapStripeEvent(event: any): StripeEventRecord {
  return {
    id: event.id,
    organizationId: event.organizationId ?? undefined,
    type: event.type,
    processedAt: toIso(event.processedAt)!,
    payload: event.payload,
  };
}

function mapStripeWebhookFailure(failure: any): StripeWebhookFailureRecord {
  return {
    id: failure.id,
    eventId: failure.eventId,
    type: failure.type,
    payload: failure.payload,
    attempts: failure.attempts,
    lastError: failure.lastError,
    failedAt: toIso(failure.failedAt)!,
    resolvedAt: toIso(failure.resolvedAt),
  };
}

function mapEmailDeliveryEvent(event: any): EmailDeliveryEventRecord {
  return {
    id: event.id,
    provider: event.provider,
    providerEventId: event.providerEventId,
    type: event.type,
    email: event.email,
    emailMessageId: event.emailMessageId ?? undefined,
    subject: event.subject ?? undefined,
    fromAddress: event.fromAddress ?? undefined,
    payload: event.payload,
    receivedAt: toIso(event.receivedAt)!,
  };
}
