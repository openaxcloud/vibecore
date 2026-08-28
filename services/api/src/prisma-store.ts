import { createHash, randomUUID } from 'node:crypto';
import { promises as dnsPromises } from 'node:dns';
import { Pool, type PoolClient } from 'pg';
import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
import { hashToken } from '@vibecore/auth';
import {
  BUILTIN_RATE_CARD,
  RESERVED_VM_TIERS,
  type PlanKey,
  type QuotaKey,
  type QuotaOverrideKey,
} from '@vibecore/billing';
import { createDatabaseClient, getDatabaseUrl, Prisma, type DatabaseClient } from '@vibecore/database';
import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
import { assertAccountPurgeMutationAllowed, assertStateMachineNotPurged } from './account-purge-state-machine-fence.js';
import { appPublicEnglish } from './app-public-copy.js';
import { LedgerStore } from './ledger-store.js';
import { AccountPurgeStore, type AccountPurgeLeaseOptions } from './account-purge-store.js';
import type { PurgeStorageDeps } from './account-purge.js';
import {
  isValidDeploymentAccessPolicyRecord,
  normalizeDeploymentAccessMode,
  type DeploymentAccessMode,
  type DeploymentAccessPolicyRecord,
} from './deployment-access.js';
import {
  buildServerRollbackPromotionEvidence,
  buildStaticRollbackRoutingEvidence,
  DeterministicRollbackError,
  parseStaticRollbackRoutingEvidence,
  parseServerRollbackPromotionEvidence,
  parseServerRollbackRuntimeSpec,
  rebindServerRollbackRuntimeSpecAccessPolicy,
  rollbackManifestDigest,
  rollbackPlanEntitlementsDigest,
  sameServerRollbackRuntimePinsForPublish,
  serverRollbackMachineMatchesRateCard,
  serverRollbackRuntimeMatchesDeployment,
  validateServerReleaseCommitPins,
} from './deterministic-rollback.js';
import {
  canonicalizeProjectManifest,
  createDefaultProjectManifest,
  projectManifestSnapshotPin,
  projectManifestForClone,
  projectManifestDigest,
  PROJECT_MANIFEST_DIGEST_PATTERN,
  readProjectManifestSnapshotPin,
  verifyStoredProjectManifestRevision,
  type ProjectManifest,
  type ProjectManifestCloneMode,
} from './project-manifest.js';
import { remixIdeStateDigest, validRemixIdeStatePin } from './remix-ide-state.js';
import { buildRollbackSuccessReceipt, type RollbackSuccessReceipt } from './rollback-response.js';
import { isCommittedPromotionForTenant, SERVER_IMAGE_RELEASE_AUDIT_ACTION } from './server-image-promotion.js';
import { lockProjectAfterPurgeTopology, lockProjectMutation } from './project-mutation-lock.js';
import {
  CLEARED_LOCKOUT,
  nextStateOnFailure,
  type LoginLockoutState,
  type LoginThrottleConfig,
} from './login-throttle.js';
import { isSessionIdleExpired, sessionIdleTimeoutMs } from './session-idle.js';
import {
  assertNoActiveObjectStorageOperation,
  assertObjectStorageOperationFence,
  beginObjectStorageOperationVerification,
  claimObjectStorageOperation,
  deferLeasedObjectStorageOperationRecovery,
  deferObjectStorageOperationRecovery,
  expirePreparedObjectStorageOperationFailedSafe,
  finalizeObjectStorageOperation,
  getPermanentDeletionReplay,
  heartbeatObjectStorageOperation,
  inspectObjectStorageOperationRecovery,
  listObjectStorageRecoveryCandidates,
  markObjectStorageOperationEffectStarted,
  markObjectStorageOperationFailedSafe,
  markObjectStorageOperationManualRecovery,
  markPermanentDeletionRuntimeEffectAmbiguous,
  markSignedCapabilityIssued,
  objectStorageIdempotencyScopeHash,
  objectStorageMutationAdvisoryKey,
  objectStoragePinnedGenerationDigest,
  objectStorageRequestHash,
  quarantineObjectStorageOperationRecovery,
  readObjectStorageOperationPinnedGenerations,
  readObjectStorageOperationPinnedInventory,
  reclaimObjectStorageOperationForVerification,
  recordPermanentDeletionStaticArtifactPlan,
  reserveSignedCapabilityAuthorization,
  type ObjectStorageCheckpointBarrierAuthority,
  type ObjectStorageOperationLease,
  type ObjectStorageOperationRecord,
  type ObjectStorageStaticErasurePlan,
  type ObjectStorageVerification,
  type PermanentDeletionReplay,
} from './object-storage-operation.js';
import {
  activeObjectStorageGenerationReferences,
  claimObjectStorageVersionGcSchedule,
  deletePendingObjectStorageVersionGcSchedule,
  deferLeasedObjectStorageVersionGcSchedule,
  deferPendingObjectStorageVersionGcSchedule,
  heartbeatObjectStorageVersionGcSchedule,
  listObjectStorageVersionGcSchedules,
  objectStorageGenerationReferenceDigest,
  planObjectStorageVersionGc,
  quarantinePendingObjectStorageVersionGcSchedule,
  quarantineExpiredObjectStorageVersionGcSchedule,
  quarantineObjectStorageVersionGcSchedule,
  reclaimObjectStorageVersionGcSchedule,
  releaseObjectStorageVersionGcSchedule,
  resetExpiredObjectStorageVersionGcSchedule,
  scheduleObjectStorageVersionGc,
  verifyObjectStorageVersionGc,
  type ObjectStorageGenerationReference,
  type ObjectStorageVersionGcPlan,
  type ObjectStorageVersionGcScheduleCandidate,
  type ObjectStorageVersionGcScheduleLease,
} from './object-storage-version-gc.js';
import {
  assertObjectStorageCommandPreconditions,
  assertValidObjectStorageCommand,
  assertValidObjectStorageCommandIntent,
  executeObjectStorageCommand,
  objectStorageCloneIntentHash,
  objectStorageCommandIdentity,
  objectStorageCommandIntentHash,
  objectStorageCommandMutationProjectIds,
  objectStorageCommandPinnedInventory,
  objectStorageCommandProjectIds,
  objectStorageCommandReceipt,
  objectStorageCommandReceiptFromExecution,
  parseObjectStorageCommandReceipt,
  parseObjectStorageCommandReceiptByType,
  pinObjectStorageCommand,
  pinObjectStorageCommandIntent,
  recoverPersistedObjectStorageCommand,
  verifyObjectStorageCommand,
  type ObjectStorageCommandExecution,
  type TenantObjectStorageCommand,
  type TenantObjectStorageCommandIntent,
} from './object-storage-command.js';
import {
  assertValidObjectKey,
  ObjectStorageError,
  parseObjectStorageInventory,
  SIGNED_URL_TTL_MS,
  type ObjectStorage,
  type ObjectStorageInventory,
} from './object-storage.js';
import {
  projectPermanentDeletionOperationRequest,
  projectPermanentDeletionRequestHash,
} from './project-permanent-deletion.js';
import { projectOrganizationChangedError, projectPhysicalMutationLockKey } from './project-physical-mutation.js';
import {
  withProjectLock,
  type ProjectStaticArtifactAuthority,
  type ProjectStaticErasureInventory,
} from './project-storage.js';
import { slugify } from './slugify.js';
import {
  API_KEY_SCOPES,
  DEFAULT_ENV_VAR_SCOPE,
  ENV_VAR_SCOPES,
  parseReleasePlanEntitlementsPin,
  sameReleasePlanEntitlementsPin,
} from './store.js';
import type {
  AbuseEventRecord,
  SecurityEventResolutionRecord,
  SecurityAuditEventPage,
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
  CanonicalAiUsageInput,
  CanonicalAiUsageBatchInput,
  CanonicalAiClassifierRouting,
  CanonicalAiClassifierRoutingSelection,
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
  DeploymentRuntimeKind,
  ReservedVmBillingRequest,
  ReservedVmBillingPeriodLease,
  ReservedVmBillingPeriodRecord,
  ReservedVmBillingStore,
  ReservedVmLease,
  ReservedVmOperationRecord,
  ReservedVmStopLease,
  ReservedVmTier,
  DeploymentAccessContext,
  DeploymentAccessTicketMutationResult,
  ReleaseManifestRecord,
  ReleasePlanEntitlementsPin,
  RollbackDeploymentCreateInput,
  RollbackLeaseFence,
  RollbackOperationRecord,
  ServerImageReleaseCommitInput,
  ServerImageReleaseCommitResult,
  SetDeploymentAccessPolicyInput,
  StaticReleaseCommitInput,
  StaticRollbackReleaseCommitInput,
  StaticReleaseCommitResult,
  DomainVerificationRecord,
  EmailDeliveryEventRecord,
  EnterpriseSettingsRecord,
  FeatureFlagRecord,
  FencedServerReadyCommitInput,
  MembershipRecord,
  ResourceAccessGrantRecord,
  OAuthConnectionRecord,
  ObjectStorageCapabilityCommand,
  ObjectStorageRecoveryReport,
  ObjectStorageVersionGcReport,
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
  ProjectReleaseBarrierLease,
  ProjectReleaseFence,
  ProjectRecord,
  ProjectPhysicalMutationScope,
  ProjectPermanentDeletionResult,
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
import { countActiveModerationStrikes } from './strike-system.js';

const CANONICAL_AI_USAGE_VERSION = 1 as const;
const CANONICAL_CHAT_COMPLETION_REASON = 'chat.completion';

function recordObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function canonicalAiClassifierRoutingSelection(value: unknown): CanonicalAiClassifierRoutingSelection | undefined {
  const routing = recordObject(value);
  if (
    !routing ||
    !['lite', 'economy', 'power'].includes(String(routing.mode)) ||
    typeof routing.highEffort !== 'boolean' ||
    typeof routing.turbo !== 'boolean' ||
    routing.lineKey !== 'classifier' ||
    typeof routing.routingCardVersion !== 'number' ||
    !Number.isSafeInteger(routing.routingCardVersion) ||
    routing.routingCardVersion < 1 ||
    typeof routing.source !== 'string' ||
    routing.source.length < 1
  ) {
    return undefined;
  }
  return {
    mode: routing.mode as CanonicalAiClassifierRoutingSelection['mode'],
    highEffort: routing.highEffort,
    turbo: routing.turbo,
    lineKey: 'classifier',
    routingCardVersion: routing.routingCardVersion,
    source: routing.source,
  };
}

function canonicalAiClassifierRouting(value: unknown): CanonicalAiClassifierRouting | undefined {
  const routing = recordObject(value);
  const selection = canonicalAiClassifierRoutingSelection(value);
  if (
    !routing ||
    !selection ||
    typeof routing.costInMillicentsPerM !== 'number' ||
    !Number.isSafeInteger(routing.costInMillicentsPerM) ||
    routing.costInMillicentsPerM < 0 ||
    typeof routing.costOutMillicentsPerM !== 'number' ||
    !Number.isSafeInteger(routing.costOutMillicentsPerM) ||
    routing.costOutMillicentsPerM < 0
  ) {
    return undefined;
  }
  return {
    ...selection,
    costInMillicentsPerM: routing.costInMillicentsPerM,
    costOutMillicentsPerM: routing.costOutMillicentsPerM,
  };
}

function canonicalAiClassifierCostMillicents(
  routing: CanonicalAiClassifierRouting,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  if (
    !Number.isSafeInteger(inputTokens) ||
    inputTokens < 0 ||
    !Number.isSafeInteger(outputTokens) ||
    outputTokens < 0
  ) {
    return undefined;
  }
  const numerator =
    BigInt(inputTokens) * BigInt(routing.costInMillicentsPerM) +
    BigInt(outputTokens) * BigInt(routing.costOutMillicentsPerM);
  const rounded = (numerator + 500_000n) / 1_000_000n;
  return rounded <= BigInt(2_147_483_647) ? Number(rounded) : undefined;
}

async function databaseJsonFingerprint(tx: Prisma.TransactionClient, value: unknown): Promise<string> {
  const serialized = JSON.stringify(value);
  const [row] = await tx.$queryRaw<Array<{ fingerprint: string }>>(Prisma.sql`
    SELECT md5((${serialized}::jsonb)::text) AS "fingerprint"
  `);
  if (!row?.fingerprint) {
    throw Object.assign(new Error(), { code: 'DATABASE_JSON_FINGERPRINT_UNAVAILABLE' });
  }
  return row.fingerprint;
}

function canonicalAiPlatformReceiptIndex(
  receipt: Record<string, unknown>,
  contentFingerprint: string,
): Record<string, unknown> {
  return {
    kind: 'platform',
    identityHash: receipt.identityHash,
    requestHash: receipt.requestHash,
    intentRequestHash: receipt.intentRequestHash,
    executionToken: receipt.executionToken,
    costLedgerId: receipt.costLedgerId,
    agentCallLogId: receipt.agentCallLogId,
    agentCostMillicents: receipt.agentCostMillicents,
    inputTokens: receipt.inputTokens,
    outputTokens: receipt.outputTokens,
    costCents: receipt.costCents,
    recoveredAtCeiling: receipt.recoveredAtCeiling,
    outcome: receipt.outcome ?? null,
    contentFingerprint,
  };
}

function canonicalAiBatchReceiptIndex(
  receipt: Record<string, unknown>,
  contentFingerprint: string,
): Record<string, unknown> {
  return {
    kind: 'batch',
    receiptHash: receipt.receiptHash,
    requestHash: receipt.requestHash,
    totalCents: receipt.totalCents,
    costLedgerIds: receipt.costLedgerIds,
    usageEventIds: receipt.usageEventIds,
    calls: receipt.calls,
    contentFingerprint,
  };
}

function canonicalAiBatchHash(input: CanonicalAiUsageBatchInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: CANONICAL_AI_USAGE_VERSION,
        reservationId: input.reservationId,
        organizationId: input.organizationId,
        userId: input.userId,
        requestId: input.requestId,
        executionToken: input.executionToken,
        projectId: input.projectId,
        calls: input.calls.map((call) => ({
          callId: call.callId,
          kind: call.kind,
          billedToUser: call.billedToUser !== false,
          projectId: call.projectId,
          ...(call.conversationId ? { conversationId: call.conversationId } : {}),
          ...(call.messageId ? { messageId: call.messageId } : {}),
          provider: call.provider,
          model: call.model,
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          costCents: call.costCents,
          reason: call.reason,
        })),
      }),
    )
    .digest('hex');
}

function canonicalAiExecutionHash(input: {
  reservationId: string;
  organizationId: string;
  userId: string;
  projectId: string;
  requestId: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: CANONICAL_AI_USAGE_VERSION,
        reservationId: input.reservationId,
        organizationId: input.organizationId,
        userId: input.userId,
        projectId: input.projectId,
        requestId: input.requestId,
      }),
    )
    .digest('hex');
}

function canonicalAiPlatformIntentHash(input: {
  reservationId: string;
  organizationId: string;
  userId: string;
  requestId: string;
  executionToken: string;
  projectId: string;
  callId: string;
  provider: string;
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostCents: number;
  agentRouting: CanonicalAiClassifierRouting;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: CANONICAL_AI_USAGE_VERSION,
        reservationId: input.reservationId,
        organizationId: input.organizationId,
        userId: input.userId,
        requestId: input.requestId,
        executionToken: input.executionToken,
        projectId: input.projectId,
        callId: input.callId,
        provider: input.provider,
        model: input.model,
        maxInputTokens: input.maxInputTokens,
        maxOutputTokens: input.maxOutputTokens,
        maxCostCents: input.maxCostCents,
        agentRouting: {
          mode: input.agentRouting.mode,
          highEffort: input.agentRouting.highEffort,
          turbo: input.agentRouting.turbo,
          lineKey: 'classifier',
          routingCardVersion: input.agentRouting.routingCardVersion,
          source: input.agentRouting.source,
          costInMillicentsPerM: input.agentRouting.costInMillicentsPerM,
          costOutMillicentsPerM: input.agentRouting.costOutMillicentsPerM,
        },
      }),
    )
    .digest('hex');
}

function canonicalAiPlatformReceiptIdentityHash(input: {
  reservationId: string;
  organizationId: string;
  userId: string;
  requestId: string;
  executionToken: string;
  projectId: string;
  callId: string;
  intentRequestHash: string;
  requestHash: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costLedgerId: string;
  agentCallLogId: string;
  agentCostMillicents: number;
  costCents: number;
  outcome?: 'hard' | 'easy';
  recoveredAtCeiling: boolean;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: CANONICAL_AI_USAGE_VERSION,
        reservationId: input.reservationId,
        organizationId: input.organizationId,
        userId: input.userId,
        requestId: input.requestId,
        executionToken: input.executionToken,
        projectId: input.projectId,
        callId: input.callId,
        intentRequestHash: input.intentRequestHash,
        requestHash: input.requestHash,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costLedgerId: input.costLedgerId,
        agentCallLogId: input.agentCallLogId,
        agentCostMillicents: input.agentCostMillicents,
        costCents: input.costCents,
        outcome: input.outcome ?? null,
        recoveredAtCeiling: input.recoveredAtCeiling,
      }),
    )
    .digest('hex');
}

function canonicalAiBatchReceiptIdentityHash(input: {
  reservationId: string;
  organizationId: string;
  userId: string;
  requestId: string;
  executionToken: string;
  projectId: string;
  requestHash: string;
  totalCents: number;
  costLedgerIds: string[];
  usageEventIds: string[];
  calls: Array<Record<string, unknown>>;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: CANONICAL_AI_USAGE_VERSION,
        reservationId: input.reservationId,
        organizationId: input.organizationId,
        userId: input.userId,
        requestId: input.requestId,
        executionToken: input.executionToken,
        projectId: input.projectId,
        requestHash: input.requestHash,
        totalCents: input.totalCents,
        costLedgerIds: input.costLedgerIds,
        usageEventIds: input.usageEventIds,
        calls: input.calls.map((call) => ({
          callId: call.callId,
          kind: call.kind,
          billedToUser: call.billedToUser,
          projectId: call.projectId,
          ...(typeof call.conversationId === 'string' ? { conversationId: call.conversationId } : {}),
          ...(typeof call.messageId === 'string' ? { messageId: call.messageId } : {}),
          provider: call.provider,
          model: call.model,
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          costCents: call.costCents,
          reason: call.reason,
          costLedgerId: call.costLedgerId,
        })),
      }),
    )
    .digest('hex');
}

async function validateCanonicalPlatformReceipt(
  tx: Prisma.TransactionClient,
  input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    execution: Record<string, unknown>;
    intent: Record<string, unknown> | undefined;
    receipt: Record<string, unknown>;
  },
): Promise<{ valid: true; recovered: boolean; outcome?: 'hard' | 'easy' } | { valid: false }> {
  const { execution, intent, receipt } = input;
  const requestId = typeof execution.requestId === 'string' ? execution.requestId : '';
  // A completed platform-classifier receipt belongs to the immutable claim
  // generation that created its intent. A later user-provider claim may rotate
  // canonicalAiExecution.executionToken after its lease expires; rebinding the
  // classifier receipt to that new token would either destroy its audit proof
  // or incorrectly quarantine an otherwise exact receipt.
  const executionToken = typeof intent?.executionToken === 'string' ? intent.executionToken : '';
  const projectId = typeof execution.projectId === 'string' ? execution.projectId : '';
  const callId = typeof intent?.callId === 'string' ? intent.callId : '';
  const provider = typeof intent?.provider === 'string' ? intent.provider : '';
  const model = typeof intent?.model === 'string' ? intent.model : '';
  const maxInputTokens = intent?.maxInputTokens;
  const maxOutputTokens = intent?.maxOutputTokens;
  const maxCostCents = intent?.maxCostCents;
  const agentRouting = canonicalAiClassifierRouting(intent?.agentRouting);
  if (
    !intent ||
    intent.version !== CANONICAL_AI_USAGE_VERSION ||
    intent.requestId !== requestId ||
    intent.executionToken !== executionToken ||
    intent.projectId !== projectId ||
    !callId ||
    !provider ||
    !model ||
    typeof maxInputTokens !== 'number' ||
    !Number.isSafeInteger(maxInputTokens) ||
    maxInputTokens < 0 ||
    typeof maxOutputTokens !== 'number' ||
    !Number.isSafeInteger(maxOutputTokens) ||
    maxOutputTokens < 0 ||
    typeof maxCostCents !== 'number' ||
    !Number.isSafeInteger(maxCostCents) ||
    maxCostCents < 0 ||
    !agentRouting ||
    intent.requestHash !==
      canonicalAiPlatformIntentHash({
        reservationId: input.reservationId,
        organizationId: input.organizationId,
        userId: input.userId,
        requestId,
        executionToken,
        projectId,
        callId,
        provider,
        model,
        maxInputTokens,
        maxOutputTokens,
        maxCostCents,
        agentRouting,
      })
  ) {
    return { valid: false };
  }

  const recovered = receipt.recoveredAtCeiling === true;
  const outcome = receipt.outcome === 'hard' || receipt.outcome === 'easy' ? receipt.outcome : undefined;
  const costLedgerId = typeof receipt.costLedgerId === 'string' ? receipt.costLedgerId : '';
  const agentCallLogId = typeof receipt.agentCallLogId === 'string' ? receipt.agentCallLogId : '';
  const agentCostMillicents = receipt.agentCostMillicents;
  const costCents = receipt.costCents;
  const inputTokens = receipt.inputTokens;
  const outputTokens = receipt.outputTokens;
  const intentRequestHash = typeof intent.requestHash === 'string' ? intent.requestHash : '';
  if (
    receipt.version !== CANONICAL_AI_USAGE_VERSION ||
    receipt.requestId !== requestId ||
    receipt.executionToken !== executionToken ||
    receipt.projectId !== projectId ||
    receipt.callId !== callId ||
    receipt.intentRequestHash !== intentRequestHash ||
    typeof receipt.requestHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(receipt.requestHash) ||
    receipt.provider !== provider ||
    receipt.model !== model ||
    typeof inputTokens !== 'number' ||
    !Number.isSafeInteger(inputTokens) ||
    inputTokens < 0 ||
    inputTokens > maxInputTokens ||
    typeof outputTokens !== 'number' ||
    !Number.isSafeInteger(outputTokens) ||
    outputTokens < 0 ||
    outputTokens > maxOutputTokens ||
    !costLedgerId ||
    !agentCallLogId ||
    typeof agentCostMillicents !== 'number' ||
    !Number.isSafeInteger(agentCostMillicents) ||
    agentCostMillicents < 0 ||
    agentCostMillicents !== canonicalAiClassifierCostMillicents(agentRouting, inputTokens, outputTokens) ||
    typeof costCents !== 'number' ||
    !Number.isSafeInteger(costCents) ||
    costCents < 0 ||
    costCents > maxCostCents ||
    (!recovered && !outcome) ||
    (recovered &&
      (outcome !== undefined ||
        inputTokens !== maxInputTokens ||
        outputTokens !== maxOutputTokens ||
        costCents !== maxCostCents)) ||
    receipt.identityHash !==
      canonicalAiPlatformReceiptIdentityHash({
        reservationId: input.reservationId,
        organizationId: input.organizationId,
        userId: input.userId,
        requestId,
        executionToken,
        projectId,
        callId,
        intentRequestHash,
        requestHash: receipt.requestHash,
        provider,
        model,
        inputTokens,
        outputTokens,
        costLedgerId,
        agentCallLogId,
        agentCostMillicents,
        costCents,
        ...(outcome ? { outcome } : {}),
        recoveredAtCeiling: recovered,
      })
  ) {
    return { valid: false };
  }

  const cost = await tx.aiCostLedger.findUnique({ where: { id: costLedgerId } });
  const agentCall = await tx.agentCallLog.findUnique({ where: { id: agentCallLogId } });
  if (
    !cost ||
    cost.organizationId !== input.organizationId ||
    cost.projectId !== projectId ||
    cost.provider !== provider ||
    cost.model !== model ||
    cost.conversationId !== null ||
    cost.messageId !== null ||
    cost.inputTokens !== inputTokens ||
    cost.outputTokens !== outputTokens ||
    cost.costCents !== costCents ||
    cost.reason !==
      (recovered
        ? `chat.completion.operator.classifier.${callId}.crash-recovery-max`.slice(0, 240)
        : `chat.completion.operator.platform.classifier.${callId}`.slice(0, 240)) ||
    !agentCall ||
    agentCall.userId !== input.userId ||
    agentCall.organizationId !== input.organizationId ||
    agentCall.projectId !== projectId ||
    agentCall.mode !== agentRouting.mode ||
    agentCall.highEffort !== agentRouting.highEffort ||
    agentCall.escalated !== (recovered ? true : outcome === 'hard') ||
    agentCall.turbo !== agentRouting.turbo ||
    agentCall.lineKey !== 'classifier' ||
    agentCall.provider !== provider ||
    agentCall.model !== model ||
    agentCall.tokensIn !== inputTokens ||
    agentCall.tokensOut !== outputTokens ||
    agentCall.costMillicents !== agentCostMillicents ||
    agentCall.creditCents !== 0 ||
    agentCall.marginMillicents !== -agentCostMillicents ||
    agentCall.billedToUser !== false ||
    agentCall.routingCardVersion !== agentRouting.routingCardVersion ||
    agentCall.source !== (recovered ? `${agentRouting.source}.crash-recovery-max` : agentRouting.source)
  ) {
    return { valid: false };
  }

  return { valid: true, recovered, ...(outcome ? { outcome } : {}) };
}

async function validateCanonicalBatchReceipt(
  tx: Prisma.TransactionClient,
  input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    executionToken: string;
    requestId: string;
    projectId: string;
    receipt: Record<string, unknown>;
  },
): Promise<
  { valid: true; costs: Awaited<ReturnType<Prisma.TransactionClient['aiCostLedger']['findMany']>> } | { valid: false }
> {
  const { receipt } = input;
  const costLedgerIds = Array.isArray(receipt.costLedgerIds)
    ? receipt.costLedgerIds.filter((id): id is string => typeof id === 'string')
    : [];
  const usageEventIds = Array.isArray(receipt.usageEventIds)
    ? receipt.usageEventIds.filter((id): id is string => typeof id === 'string')
    : [];
  const rawCalls = Array.isArray(receipt.calls)
    ? receipt.calls.map((call) => recordObject(call)).filter((call): call is Record<string, unknown> => Boolean(call))
    : [];
  const allowedKinds = new Set(['planner', 'agent-lane', 'summary', 'context', 'main', 'classifier', 'crash-recovery']);
  if (
    receipt.version !== CANONICAL_AI_USAGE_VERSION ||
    receipt.reservationId !== input.reservationId ||
    receipt.organizationId !== input.organizationId ||
    receipt.userId !== input.userId ||
    receipt.requestId !== input.requestId ||
    receipt.executionToken !== input.executionToken ||
    receipt.projectId !== input.projectId ||
    typeof receipt.requestHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(receipt.requestHash) ||
    typeof receipt.totalCents !== 'number' ||
    !Number.isSafeInteger(receipt.totalCents) ||
    receipt.totalCents < 0 ||
    costLedgerIds.length === 0 ||
    new Set(costLedgerIds).size !== costLedgerIds.length ||
    usageEventIds.length !== 3 ||
    new Set(usageEventIds).size !== usageEventIds.length ||
    rawCalls.length !== costLedgerIds.length ||
    new Set(rawCalls.map((call) => call.callId)).size !== rawCalls.length ||
    new Set(rawCalls.map((call) => call.costLedgerId)).size !== rawCalls.length ||
    rawCalls.some((call) => !costLedgerIds.includes(String(call.costLedgerId))) ||
    rawCalls.some(
      (call) =>
        typeof call.callId !== 'string' ||
        !allowedKinds.has(String(call.kind)) ||
        typeof call.billedToUser !== 'boolean' ||
        call.projectId !== input.projectId ||
        (call.conversationId !== undefined && typeof call.conversationId !== 'string') ||
        (call.messageId !== undefined && typeof call.messageId !== 'string') ||
        typeof call.provider !== 'string' ||
        typeof call.model !== 'string' ||
        typeof call.inputTokens !== 'number' ||
        !Number.isSafeInteger(call.inputTokens) ||
        call.inputTokens < 0 ||
        typeof call.outputTokens !== 'number' ||
        !Number.isSafeInteger(call.outputTokens) ||
        call.outputTokens < 0 ||
        typeof call.costCents !== 'number' ||
        !Number.isSafeInteger(call.costCents) ||
        call.costCents < 0 ||
        typeof call.reason !== 'string' ||
        typeof call.costLedgerId !== 'string',
    )
  ) {
    return { valid: false };
  }

  const calls = rawCalls.map((call) => ({
    callId: call.callId as string,
    kind: call.kind as CanonicalAiUsageInput['kind'],
    billedToUser: call.billedToUser as boolean,
    projectId: call.projectId as string,
    ...(typeof call.conversationId === 'string' ? { conversationId: call.conversationId } : {}),
    ...(typeof call.messageId === 'string' ? { messageId: call.messageId } : {}),
    provider: call.provider as string,
    model: call.model as string,
    inputTokens: call.inputTokens as number,
    outputTokens: call.outputTokens as number,
    costCents: call.costCents as number,
    reason: call.reason as string,
  }));
  const requestHash = canonicalAiBatchHash({
    reservationId: input.reservationId,
    organizationId: input.organizationId,
    userId: input.userId,
    requestId: input.requestId,
    executionToken: input.executionToken,
    projectId: input.projectId,
    calls,
  });
  if (receipt.requestHash !== requestHash) {
    return { valid: false };
  }

  const receiptHash = canonicalAiBatchReceiptIdentityHash({
    reservationId: input.reservationId,
    organizationId: input.organizationId,
    userId: input.userId,
    requestId: input.requestId,
    executionToken: input.executionToken,
    projectId: input.projectId,
    requestHash,
    totalCents: receipt.totalCents,
    costLedgerIds,
    usageEventIds,
    calls: rawCalls,
  });
  if (receipt.receiptHash !== receiptHash) {
    return { valid: false };
  }

  const costs = await tx.aiCostLedger.findMany({ where: { id: { in: costLedgerIds } } });
  const costById = new Map(costs.map((cost) => [cost.id, cost]));
  const billedTotal = rawCalls.reduce(
    (sum, call) => sum + (call.billedToUser === false ? 0 : (call.costCents as number)),
    0,
  );
  if (
    costs.length !== costLedgerIds.length ||
    billedTotal !== receipt.totalCents ||
    rawCalls.some((call) => {
      const cost = costById.get(call.costLedgerId as string);
      return (
        !cost ||
        cost.organizationId !== input.organizationId ||
        cost.projectId !== input.projectId ||
        cost.conversationId !== (call.conversationId ?? null) ||
        cost.messageId !== (call.messageId ?? null) ||
        cost.provider !== call.provider ||
        cost.model !== call.model ||
        cost.inputTokens !== call.inputTokens ||
        cost.outputTokens !== call.outputTokens ||
        cost.costCents !== call.costCents ||
        cost.reason !== `${String(call.reason)}.${String(call.kind)}.${String(call.callId)}`.slice(0, 240)
      );
    })
  ) {
    return { valid: false };
  }

  const usageEvents = await tx.usageEvent.findMany({ where: { id: { in: usageEventIds } } });
  const expectedQuantities = new Map([
    ['ai.messages', 1],
    ['ai.inputTokens', calls.reduce((sum, call) => sum + (call.billedToUser === false ? 0 : call.inputTokens), 0)],
    ['ai.outputTokens', calls.reduce((sum, call) => sum + (call.billedToUser === false ? 0 : call.outputTokens), 0)],
  ]);
  if (
    usageEvents.length !== 3 ||
    usageEvents.some((event) => {
      const metadata = recordObject(event.metadata);
      return (
        event.organizationId !== input.organizationId ||
        event.userId !== input.userId ||
        event.quantity !== expectedQuantities.get(event.type) ||
        metadata?.canonicalReservationId !== input.reservationId ||
        metadata?.requestHash !== requestHash
      );
    }) ||
    new Set(usageEvents.map((event) => event.type)).size !== 3
  ) {
    return { valid: false };
  }

  return { valid: true, costs };
}

const SERVER_RELEASE_PROMOTION_NOT_COMMITTED = 'SERVER_RELEASE_PROMOTION_NOT_COMMITTED';
const SERVER_RELEASE_MANIFEST_CONFLICT = 'SERVER_RELEASE_MANIFEST_CONFLICT';
const SERVER_RELEASE_MANIFEST_WITHOUT_READY = 'SERVER_RELEASE_MANIFEST_WITHOUT_READY';
const STATIC_RELEASE_MANIFEST_CONFLICT = 'STATIC_RELEASE_MANIFEST_CONFLICT';
const STATIC_RELEASE_COMMIT_CONFLICT = 'STATIC_RELEASE_COMMIT_CONFLICT';

/** Internal store invariant; route handlers own localized public error copy. */
function reservedVmStoreError(message: string): Error {
  return new Error(message);
}

const RESERVED_VM_CANCEL_ERROR_CODE = 'DEPLOYMENT_CANCELED_BY_USER';
const RESERVED_VM_PAID_PLAN_ERROR_CODE = 'RESERVED_VM_PAID_PLAN_REQUIRED';

const RUNTIME_WEBSOCKET_TICKET_INSERT_EMPTY = 'RUNTIME_WEBSOCKET_TICKET_INSERT_EMPTY';
const DB_MIGRATION_STATE_CORRUPT = 'DB_MIGRATION_STATE_CORRUPT';
const DB_MIGRATION_PLAN_CORRUPT = 'DB_MIGRATION_PLAN_CORRUPT';
const DB_MIGRATION_EXECUTION_INSERT_EMPTY = 'DB_MIGRATION_EXECUTION_INSERT_EMPTY';
const PROJECT_PHYSICAL_LOCK_ACQUIRE_TIMEOUT_MS = Math.max(
  50,
  Math.min(
    Number(process.env.PROJECT_PHYSICAL_LOCK_ACQUIRE_TIMEOUT_MS) ||
      Number(process.env.PROJECT_PHYSICAL_MUTATION_TIMEOUT_MS) ||
      5 * 60_000,
    15 * 60_000,
  ),
);
const OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS = Math.max(
  30,
  Math.min(Number(process.env.OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS) || 300, 900),
);
const OBJECT_STORAGE_OPERATION_HEARTBEAT_MS = Math.max(
  1_000,
  Math.min(
    Number(process.env.OBJECT_STORAGE_OPERATION_HEARTBEAT_MS) ||
      Math.floor((OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS * 1_000) / 3),
    OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS * 1_000 - 1_000,
  ),
);

const ROLLBACK_STORE_FAILURE = {
  ownershipLost: 'ROLLBACK_OWNERSHIP_LOST',
  targetConflict: 'ROLLBACK_TARGET_CONFLICT',
  releaseMoved: 'ROLLBACK_RELEASE_MOVED',
  serverReleaseFenceConflict: 'SERVER_RELEASE_FENCE_CONFLICT',
  serverReleaseAccessPolicyInvalid: 'SERVER_RELEASE_ACCESS_POLICY_INVALID',
} as const;

type DeploymentAccessFailureReason = Extract<DeploymentAccessTicketMutationResult, { ok: false }>['reason'];

const DEPLOYMENT_ACCESS_FAILURE_REASON = {
  deploymentNotFound: 'DEPLOYMENT_NOT_FOUND',
  policyInvalid: 'POLICY_INVALID',
  policyNotPrivate: 'POLICY_NOT_PRIVATE',
  accessDenied: 'ACCESS_DENIED',
  ticketNotFound: 'TICKET_NOT_FOUND',
  ticketReplayed: 'TICKET_REPLAYED',
  ticketExpired: 'TICKET_EXPIRED',
  policyChanged: 'POLICY_CHANGED',
} as const satisfies Readonly<Record<string, DeploymentAccessFailureReason>>;

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
  /*
   * `CURRENT_TIMESTAMP` is frozen at transaction start in PostgreSQL. A
   * transaction that waited behind a row lock could therefore validate a lease
   * against a timestamp from *before* it acquired the lock. `clock_timestamp()`
   * is still authoritative database time, but reflects the instant of the
   * actual comparison after the wait.
   */
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
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

const DEFAULT_PROJECT_SLUG_REDIRECT_TTL_DAYS = 30;
const MAX_PROJECT_SLUG_REDIRECT_TTL_DAYS = 10 * 365;

function projectSlugRedirectTtlMs(rawDays: number | undefined): number {
  const days = rawDays ?? DEFAULT_PROJECT_SLUG_REDIRECT_TTL_DAYS;

  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_PROJECT_SLUG_REDIRECT_TTL_DAYS) {
    throw Object.assign(new TypeError('PROJECT_SLUG_REDIRECT_TTL_INVALID'), {
      code: 'PROJECT_SLUG_REDIRECT_TTL_INVALID',
      statusCode: 400,
    });
  }

  return days * 24 * 60 * 60 * 1000;
}

const RESERVED_VM_RENEWAL_RESERVATION_MS = 7 * 24 * 60 * 60_000;
const RESERVED_VM_MAX_GRACE_MS = 6 * 24 * 60 * 60_000;

async function databaseCalendarMonthAfter(tx: Prisma.TransactionClient, start: Date): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ next: Date }>>`
    SELECT (${start}::timestamptz + INTERVAL '1 month') AS "next"
  `;

  const value = rows[0]?.next;

  if (!(value instanceof Date) || value <= start) {
    throw Object.assign(reservedVmStoreError('Reserved VM calendar-month deadline is unavailable.'), {
      code: 'RESERVED_VM_BILLING_CLOCK_UNAVAILABLE',
      statusCode: 503,
    });
  }

  return value;
}

function requireReservedVmLeaseOwner(ownerToken: string): string {
  const token = ownerToken.trim();

  if (!token || token.length > 200) {
    throw Object.assign(reservedVmStoreError('Reserved VM billing lease owner token is invalid.'), {
      code: 'RESERVED_VM_BILLING_OWNER_INVALID',
      statusCode: 400,
    });
  }

  return token;
}

function requireReservedVmActor(actorUserId: string | null | undefined): string {
  const actor = actorUserId?.trim();

  if (!actor) {
    throw Object.assign(reservedVmStoreError('Reserved VM user authority is missing.'), {
      code: 'RESERVED_VM_ACTOR_REQUIRED',
      statusCode: 409,
    });
  }

  return actor;
}

function reservedVmBillingLeaseExpiry(now: Date, ttlMs: number): Date {
  if (!Number.isFinite(ttlMs) || ttlMs < 1_000 || ttlMs > 30 * 60_000) {
    throw Object.assign(reservedVmStoreError('Reserved VM billing lease duration is invalid.'), {
      code: 'RESERVED_VM_BILLING_LEASE_TTL_INVALID',
      statusCode: 400,
    });
  }

  return new Date(now.getTime() + Math.trunc(ttlMs));
}

function reservedVmGraceExpiry(now: Date, gracePeriodMs: number): Date {
  if (!Number.isFinite(gracePeriodMs) || gracePeriodMs < 1_000 || gracePeriodMs > RESERVED_VM_MAX_GRACE_MS) {
    throw Object.assign(reservedVmStoreError('Reserved VM billing grace duration is invalid.'), {
      code: 'RESERVED_VM_BILLING_GRACE_INVALID',
      statusCode: 400,
    });
  }

  return new Date(now.getTime() + Math.trunc(gracePeriodMs));
}

function reservedVmBillingFenceLost(): Error & { code: string; statusCode: number } {
  return Object.assign(reservedVmStoreError('Reserved VM billing period ownership was lost.'), {
    code: 'RESERVED_VM_BILLING_FENCE_LOST',
    statusCode: 409,
  });
}

async function hasPaidReservedVmEntitlement(tx: Prisma.TransactionClient, organizationId: string): Promise<boolean> {
  /*
   * Serialize against Stripe/webhook subscription mutations. The subsequent
   * status+plan read and the ledger transition therefore describe one durable
   * billing instant, not an API-side snapshot that may already be canceled.
   */
  await tx.$queryRaw`
    SELECT "id" FROM "Subscription"
    WHERE "organizationId" = ${organizationId}
    ORDER BY "id" ASC
    FOR UPDATE
  `;
  const subscription = await tx.subscription.findFirst({
    where: {
      organizationId,
      status: { in: ['ACTIVE', 'TRIALING'] },
      plan: { key: { not: 'free' } },
    },
    select: { id: true },
  });

  return Boolean(subscription);
}

async function markReservedVmPeriodPastDueInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    period: any;
    now: Date;
    errorCode: string;
    errorMessage: string;
    gracePeriodMs: number;
  },
): Promise<{ period: ReservedVmBillingPeriodRecord; deployment: DeploymentRecord }> {
  const graceEndsAt = input.period.graceEndsAt ?? reservedVmGraceExpiry(input.now, input.gracePeriodMs);
  const pastDue = await tx.reservedVmBillingPeriod.update({
    where: { id: input.period.id },
    data: {
      status: 'PAST_DUE',
      graceEndsAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: input.errorCode.slice(0, 120),
      lastErrorMessage: input.errorMessage.slice(0, 1_000),
    },
  });
  const updated = await tx.deployment.updateMany({
    where: {
      id: input.period.deploymentId,
      runtimeKind: 'reserved-vm',
      reservedVmNextChargeAt: input.period.periodStart,
    },
    data: {
      reservedVmBillingState: 'PAST_DUE',
      reservedVmGraceEndsAt: graceEndsAt,
      reservedVmStopRequestedAt: null,
    },
  });

  if (updated.count !== 1) {
    throw Object.assign(reservedVmStoreError('RESERVED_VM_BILLING_CYCLE_CONFLICT'), {
      code: 'RESERVED_VM_BILLING_CYCLE_CONFLICT',
      statusCode: 409,
    });
  }

  const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: input.period.deploymentId } });
  return { period: publicReservedVmBillingPeriod(pastDue), deployment: mapDeployment(deployment) };
}

async function assertProjectReservedVmDecommissioned(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const [runtime, operation, billingPeriod, persistentClaim] = await Promise.all([
    tx.deployment.findFirst({
      where: { projectId, runtimeKind: 'reserved-vm' },
      select: { id: true },
    }),
    tx.reservedVmOperation.findFirst({
      where: { projectId, status: { in: ['PENDING', 'APPLYING'] } },
      select: { id: true },
    }),
    tx.reservedVmBillingPeriod.findFirst({
      /* PAID rows are immutable history, not live compute/billing authority. */
      where: { projectId, status: { in: ['DUE', 'PROCESSING', 'PAST_DUE', 'STOP_REQUIRED'] } },
      select: { id: true },
    }),
    tx.deployment.findFirst({
      where: { projectId, persistentStorageClaim: { not: null } },
      select: { id: true },
    }),
  ]);

  if (runtime || operation || billingPeriod || persistentClaim) {
    throw Object.assign(reservedVmStoreError('PROJECT_RESERVED_VM_DECOMMISSION_REQUIRED'), {
      code: 'PROJECT_RESERVED_VM_DECOMMISSION_REQUIRED',
      statusCode: 409,
    });
  }
}

function reservedVmRenewalRequestHash(input: {
  deploymentId: string;
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  tier: string;
  priceCents: number;
  termsVersion: string;
  rateCardVersion: number;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        deploymentId: input.deploymentId,
        organizationId: input.organizationId,
        periodStart: input.periodStart.toISOString(),
        periodEnd: input.periodEnd.toISOString(),
        tier: input.tier,
        priceCents: input.priceCents,
        termsVersion: input.termsVersion,
        rateCardVersion: input.rateCardVersion,
      }),
    )
    .digest('hex');
}

type ExpiredReservedVmGraceRow = {
  id: string;
  projectId: string;
  deploymentId: string;
  organizationId: string;
  actorUserId: string;
  periodStart: Date;
  graceEndsAt: Date;
  billingReservationId: string | null;
};

async function promoteExpiredReservedVmGrace(
  tx: Prisma.TransactionClient,
  ledger: LedgerStore,
  input: { deploymentId?: string; take: number },
): Promise<void> {
  const take = Number.isFinite(input.take) ? Math.max(1, Math.min(Math.trunc(input.take), 500)) : 100;

  for (let processed = 0; processed < take; processed += 1) {
    /* Read authority before effect-row locks to preserve the purge lock order. */
    const preliminary = input.deploymentId
      ? await tx.$queryRaw<ExpiredReservedVmGraceRow[]>`
          SELECT p."id", p."projectId", p."deploymentId", p."organizationId", p."actorUserId",
                 p."periodStart", p."graceEndsAt", p."billingReservationId"
          FROM "ReservedVmBillingPeriod" p
          WHERE p."deploymentId" = ${input.deploymentId}
            AND p."status" = 'PAST_DUE'
            AND p."graceEndsAt" <= clock_timestamp()
            AND p."actorUserId" IS NOT NULL
          ORDER BY p."graceEndsAt" ASC, p."id" ASC
          LIMIT 1
        `
      : await tx.$queryRaw<ExpiredReservedVmGraceRow[]>`
          SELECT p."id", p."projectId", p."deploymentId", p."organizationId", p."actorUserId",
                 p."periodStart", p."graceEndsAt", p."billingReservationId"
          FROM "ReservedVmBillingPeriod" p
          WHERE p."status" = 'PAST_DUE'
            AND p."graceEndsAt" <= clock_timestamp()
            AND p."actorUserId" IS NOT NULL
          ORDER BY p."graceEndsAt" ASC, p."id" ASC
          LIMIT 1
        `;
    const candidate = preliminary[0];

    if (!candidate) return;

    const actorUserId = requireReservedVmActor(candidate.actorUserId);
    await assertAccountPurgeMutationAllowed(tx, {
      userIds: [actorUserId],
      organizationIds: [candidate.organizationId],
      projectIds: [candidate.projectId],
    });
    const locked = await tx.$queryRaw<ExpiredReservedVmGraceRow[]>`
      SELECT p."id", p."projectId", p."deploymentId", p."organizationId", p."actorUserId",
             p."periodStart", p."graceEndsAt", p."billingReservationId"
      FROM "ReservedVmBillingPeriod" p
      WHERE p."id" = ${candidate.id}
        AND p."status" = 'PAST_DUE'
        AND p."graceEndsAt" <= clock_timestamp()
        AND p."actorUserId" = ${actorUserId}
      FOR UPDATE SKIP LOCKED
    `;
    const row = locked[0];

    if (!row) return;

    const now = await databaseNow(tx);
    const deployment = await tx.deployment.findUnique({ where: { id: row.deploymentId } });

    const stillCurrent =
      deployment?.runtimeKind === 'reserved-vm' &&
      deployment.reservedVmNextChargeAt?.getTime() === row.periodStart.getTime();

    if (row.billingReservationId) {
      await ledger.releaseReservationInTransaction(tx, row.billingReservationId, 'failure');
    }

    if (!stillCurrent) {
      await tx.reservedVmBillingPeriod.update({
        where: { id: row.id },
        data: {
          status: 'CANCELED',
          leaseOwner: null,
          leaseExpiresAt: null,
          stopRequestedAt: null,
        },
      });
      continue;
    }

    await tx.reservedVmBillingPeriod.update({
      where: { id: row.id },
      data: {
        status: 'STOP_REQUIRED',
        leaseOwner: null,
        leaseExpiresAt: null,
        stopRequestedAt: now,
      },
    });
    await tx.deployment.updateMany({
      where: {
        id: row.deploymentId,
        runtimeKind: 'reserved-vm',
        reservedVmNextChargeAt: row.periodStart,
      },
      data: {
        reservedVmBillingState: 'STOP_REQUIRED',
        reservedVmGraceEndsAt: row.graceEndsAt,
        reservedVmStopRequestedAt: now,
      },
    });
  }
}

function databaseDeadline(now: Date, durationMs: number, maximumMs = 24 * 60 * 60_000): Date {
  if (!Number.isFinite(durationMs) || durationMs < 1_000 || durationMs > maximumMs) {
    throw new TypeError('INVALID_DATABASE_DEADLINE_DURATION');
  }

  return new Date(now.getTime() + Math.trunc(durationMs));
}

type RollbackFenceIdentity = {
  operationId: string;
  ownerToken: string;
  fencingToken: number;
};

function rollbackOwnershipLost(): Error & { code: string; statusCode: number } {
  return Object.assign(new Error(ROLLBACK_STORE_FAILURE.ownershipLost), {
    code: ROLLBACK_STORE_FAILURE.ownershipLost,
    statusCode: 409,
  });
}

function rollbackConflict(code: string): Error & { code: string; statusCode: number } {
  return Object.assign(new Error(code), { code, statusCode: 409 });
}

function sameNullable(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function clearTenantScopedIdeCapabilities(state: unknown): unknown {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const root = state as Record<string, unknown>;
  const collaboration =
    root.collaboration && typeof root.collaboration === 'object' && !Array.isArray(root.collaboration)
      ? (root.collaboration as Record<string, unknown>)
      : undefined;

  if (!collaboration) return state;
  return { ...root, collaboration: { ...collaboration, terminalPermissions: {} } };
}

async function requireRollbackSourceManifest(
  tx: Prisma.TransactionClient,
  operation: {
    projectId: string;
    environment: string;
    previousManifestId: string | null;
  },
) {
  if (!operation.previousManifestId) {
    throw rollbackConflict('ROLLBACK_TARGET_NOT_BOUND');
  }

  const source = await tx.releaseManifest.findFirst({
    where: {
      id: operation.previousManifestId,
      projectId: operation.projectId,
      environment: operation.environment,
    },
  });

  if (!source) {
    throw rollbackConflict('ROLLBACK_TARGET_MANIFEST_MISSING');
  }

  return source;
}

async function completeRollbackSuccessInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    operation: {
      id: string;
      phase: string;
      deploymentId: string | null;
      expectedHeadVersion: number | null;
      previousManifestId: string | null;
    };
    deployment: DeploymentRecord;
    source: { id: string; version: number; deploymentId: string; artifactDigest: string };
    responseContentLanguage: 'en' | 'fr';
  },
): Promise<RollbackSuccessReceipt> {
  if (
    !input.operation.deploymentId ||
    input.operation.deploymentId !== input.deployment.id ||
    input.operation.previousManifestId !== input.source.id ||
    input.operation.expectedHeadVersion === null ||
    !['EFFECT_STARTED', 'RELEASE_COMMITTED'].includes(input.operation.phase) ||
    input.deployment.status !== 'READY'
  ) {
    throw rollbackConflict('ROLLBACK_RESPONSE_PHASE_CONFLICT');
  }

  const receipt = buildRollbackSuccessReceipt({
    deployment: input.deployment,
    responseContentLanguage: input.responseContentLanguage,
    restoredFromVersion: input.source.version,
    restoredFromDeploymentId: input.source.deploymentId,
    supersededVersion: input.operation.expectedHeadVersion,
    verifiedArtifactDigest: input.source.artifactDigest,
    url: input.deployment.url ?? '',
  });

  await tx.rollbackIdempotencyRequest.update({
    where: { id: input.operation.id },
    data: {
      status: 'COMPLETED',
      phase: 'RELEASE_COMMITTED',
      leaseOwner: null,
      leaseExpiresAt: null,
      responseStatus: receipt.responseStatus,
      responseContentLanguage: receipt.responseContentLanguage,
      responseBody: receipt.responseBody as Prisma.InputJsonValue,
      completedAt: await databaseNow(tx),
    },
  });

  return receipt;
}

/**
 * Acquire the purge half of the global rollback lock order before checkpoint,
 * Project, rollback-operation, deployment or release locks:
 *
 * actor user -> purge topology -> checkpoint -> Project -> operation/effect.
 *
 * Release committers that need earlier project locks call this at transaction
 * entry, then still call requireRollbackLease after their final row lock to
 * revalidate DB-clock ownership and the fencing token.
 */
export async function acquireRollbackPurgeScope(
  tx: Prisma.TransactionClient,
  operationId: string,
): Promise<{ actorUserId: string | null; projectId: string; organizationId: string }> {
  const scope = await tx.rollbackIdempotencyRequest.findUnique({
    where: { id: operationId },
    select: { actorUserId: true, projectId: true, project: { select: { organizationId: true } } },
  });

  if (!scope) {
    throw rollbackOwnershipLost();
  }
  if (!scope.actorUserId) {
    // Historical rows remain nullable for rolling upgrades, but an actorless
    // lease cannot be resumed as ordinary user authority.
    throw rollbackOwnershipLost();
  }

  await assertAccountPurgeMutationAllowed(tx, {
    userIds: [scope.actorUserId],
    organizationIds: [scope.project.organizationId],
    projectIds: [scope.projectId],
  });

  return {
    actorUserId: scope.actorUserId,
    projectId: scope.projectId,
    organizationId: scope.project.organizationId,
  };
}

type ReservedVmCommitFence = {
  operationId: string;
  ownerToken: string;
  fencingToken: number;
  response: Record<string, unknown>;
};

async function commitReservedVmOperationInTransaction(
  tx: Prisma.TransactionClient,
  ledger: LedgerStore,
  input: ReservedVmCommitFence,
): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord }> {
  const preliminary = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: input.operationId } });
  const actorUserId = requireReservedVmActor(preliminary.actorUserId);
  await assertAccountPurgeMutationAllowed(tx, {
    userIds: [actorUserId],
    organizationIds: [preliminary.organizationId],
    projectIds: [preliminary.projectId],
  });
  await tx.$queryRaw`SELECT "id" FROM "ReservedVmOperation" WHERE "id" = ${input.operationId} FOR UPDATE`;
  const now = await databaseNow(tx);
  const operation = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: input.operationId } });

  if (operation.status === 'COMPLETED') {
    const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: operation.deploymentId } });
    return { operation: publicReservedVmOperation(operation), deployment: mapDeployment(deployment) };
  }

  if (
    operation.status !== 'APPLYING' ||
    operation.phase !== 'RUNTIME_APPLIED' ||
    operation.leaseOwner !== input.ownerToken ||
    operation.fencingToken !== input.fencingToken ||
    !operation.leaseExpiresAt ||
    operation.leaseExpiresAt <= now
  ) {
    throw Object.assign(reservedVmStoreError('Reserved VM operation ownership was lost.'), {
      code: 'RESERVED_VM_OPERATION_FENCE_LOST',
      statusCode: 409,
    });
  }

  await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${operation.deploymentId} FOR UPDATE`;
  const current = await tx.deployment.findUniqueOrThrow({ where: { id: operation.deploymentId } });

  if (current.runtimeVersion !== operation.expectedRuntimeVersion) {
    throw Object.assign(reservedVmStoreError('Deployment runtime changed concurrently.'), {
      code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
      statusCode: 409,
    });
  }

  if (operation.billingReservationId) {
    await ledger.commitReservationInTransaction(tx, {
      reservationId: operation.billingReservationId,
      actualAmountMinor: BigInt(operation.billingAmountCents),
      refuseOverage: true,
    });
  }

  let initialPeriodStart: Date | null = null;
  let initialPeriodEnd: Date | null = null;
  const startsBillingCycle =
    operation.targetRuntimeKind === 'reserved-vm' &&
    (operation.fromRuntimeKind !== 'reserved-vm' || current.reservedVmBillingState === 'SUSPENDED');

  if (startsBillingCycle) {
    if (
      !operation.billingReservationId ||
      operation.billingAmountCents !== operation.targetPriceCents ||
      !operation.targetTier
    ) {
      throw Object.assign(reservedVmStoreError('Reserved VM initial monthly settlement is incomplete.'), {
        code: 'RESERVED_VM_BILLING_SCHEDULE_CORRUPT',
        statusCode: 409,
      });
    }

    initialPeriodStart = now;
    initialPeriodEnd = await databaseCalendarMonthAfter(tx, now);
    await tx.reservedVmBillingPeriod.create({
      data: {
        projectId: operation.projectId,
        deploymentId: operation.deploymentId,
        organizationId: operation.organizationId,
        actorUserId,
        periodStart: initialPeriodStart,
        periodEnd: initialPeriodEnd,
        tier: operation.targetTier,
        priceCents: operation.targetPriceCents,
        termsVersion: operation.termsVersion,
        rateCardVersion: operation.rateCardVersion,
        status: 'PAID',
        attemptCount: 1,
        billingReservationId: operation.billingReservationId,
        settledAt: now,
      },
    });
  } else if (
    operation.targetRuntimeKind === 'reserved-vm' &&
    (!current.reservedVmCurrentPeriodStart || !current.reservedVmNextChargeAt || !current.reservedVmBillingState)
  ) {
    throw Object.assign(reservedVmStoreError('Reserved VM monthly schedule is missing.'), {
      code: 'RESERVED_VM_BILLING_SCHEDULE_CORRUPT',
      statusCode: 409,
    });
  }

  if (operation.targetRuntimeKind === 'autoscale') {
    const openPeriods = await tx.reservedVmBillingPeriod.findMany({
      where: { deploymentId: current.id, status: { in: ['DUE', 'PROCESSING', 'PAST_DUE'] } },
      select: { id: true, billingReservationId: true },
    });

    for (const period of openPeriods) {
      if (period.billingReservationId) {
        await ledger.releaseReservationInTransaction(tx, period.billingReservationId, 'cancel');
      }
    }
    await tx.reservedVmBillingPeriod.updateMany({
      where: { id: { in: openPeriods.map((period) => period.id) } },
      data: { status: 'CANCELED', leaseOwner: null, leaseExpiresAt: null },
    });
  }

  const updated = await tx.deployment.update({
    where: { id: current.id },
    data: {
      runtimeKind: operation.targetRuntimeKind,
      runtimeVersion: { increment: 1 },
      machineSize: operation.targetMachineSize,
      reservedVmTier: operation.targetTier,
      reservedVmPriceCents: operation.targetRuntimeKind === 'reserved-vm' ? operation.targetPriceCents : null,
      reservedVmTermsVersion: operation.targetRuntimeKind === 'reserved-vm' ? operation.termsVersion : null,
      reservedVmRateCardVersion: operation.targetRuntimeKind === 'reserved-vm' ? operation.rateCardVersion : null,
      reservedVmBillingReservationId:
        operation.targetRuntimeKind === 'reserved-vm'
          ? (operation.billingReservationId ?? current.reservedVmBillingReservationId)
          : null,
      reservedVmBillingState:
        operation.targetRuntimeKind === 'reserved-vm'
          ? initialPeriodStart
            ? 'CURRENT'
            : current.reservedVmBillingState
          : null,
      reservedVmCurrentPeriodStart:
        operation.targetRuntimeKind === 'reserved-vm'
          ? (initialPeriodStart ?? current.reservedVmCurrentPeriodStart)
          : null,
      reservedVmNextChargeAt:
        operation.targetRuntimeKind === 'reserved-vm' ? (initialPeriodEnd ?? current.reservedVmNextChargeAt) : null,
      reservedVmGraceEndsAt:
        operation.targetRuntimeKind === 'reserved-vm'
          ? initialPeriodStart
            ? null
            : current.reservedVmGraceEndsAt
          : null,
      reservedVmStopRequestedAt:
        operation.targetRuntimeKind === 'reserved-vm'
          ? initialPeriodStart
            ? null
            : current.reservedVmStopRequestedAt
          : null,
      persistentStorageClaim: current.persistentStorageClaim ?? `reserved-data-${current.id}`,
    },
  });
  const completed = await tx.reservedVmOperation.update({
    where: { id: operation.id },
    data: {
      status: 'COMPLETED',
      phase: 'COMMITTED',
      response: {
        ...(operation.response && typeof operation.response === 'object' && !Array.isArray(operation.response)
          ? (operation.response as Record<string, unknown>)
          : {}),
        ...input.response,
      } as Prisma.InputJsonValue,
      completedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });

  return { operation: publicReservedVmOperation(completed), deployment: mapDeployment(updated) };
}

async function requireRollbackLease(tx: Prisma.TransactionClient, input: RollbackFenceIdentity): Promise<any> {
  await acquireRollbackPurgeScope(tx, input.operationId);
  await tx.$queryRawUnsafe(
    'SELECT "id" FROM "RollbackIdempotencyRequest" WHERE "id" = $1 FOR UPDATE',
    input.operationId,
  );

  const now = await databaseNow(tx);

  const row = await tx.rollbackIdempotencyRequest.findFirst({
    where: {
      id: input.operationId,
      status: 'IN_PROGRESS',
      leaseOwner: input.ownerToken,
      fencingToken: input.fencingToken,
      leaseExpiresAt: { gt: now },
    },
  });

  if (!row) {
    throw rollbackOwnershipLost();
  }

  return row;
}

async function requireProjectReleaseFence(
  tx: Prisma.TransactionClient,
  projectId: string,
  input: ProjectReleaseFence,
): Promise<void> {
  const lease = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ProjectCheckpoint"
    WHERE "id" = ${input.checkpointId}
      AND "projectId" = ${projectId}
      AND "state" = 'RELEASE_BARRIER'
      AND "barrierProjectId" = ${projectId}
      AND "barrierOwnerToken" = ${input.ownerToken}
      AND "barrierFence" = ${input.fence}
      AND "barrierExpiresAt" > clock_timestamp()
  `;

  if (!lease[0]) {
    throw Object.assign(new Error(appPublicEnglish('PROJECT_RELEASE_BARRIER_LOST')), {
      code: 'PROJECT_RELEASE_BARRIER_LOST',
      statusCode: 409,
    });
  }

  const project = await tx.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });

  if (!project || project.organizationId !== input.expectedOrganizationId) {
    throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_RELEASE')), {
      code: 'PROJECT_ORGANIZATION_CHANGED_DURING_RELEASE',
      statusCode: 409,
    });
  }

  const manifest = await tx.projectManifestRevision.findFirst({
    where: { projectId },
    orderBy: { manifestVersion: 'desc' },
    select: { digest: true },
  });

  if (!manifest || manifest.digest !== input.expectedManifestDigest) {
    throw Object.assign(new Error(appPublicEnglish('PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH')), {
      code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH',
      statusCode: 409,
    });
  }
}

async function assertNoActiveProjectReleaseBarrier(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const active = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ProjectCheckpoint"
    WHERE "barrierProjectId" = ${projectId}
      AND "barrierExpiresAt" > clock_timestamp()
    LIMIT 1
  `;

  if (active[0]) {
    throw Object.assign(new Error(appPublicEnglish('CHECKPOINT_BARRIER_ACTIVE_MESSAGE')), {
      code: 'CHECKPOINT_BARRIER_ACTIVE',
      statusCode: 423,
    });
  }
}

function validateReservedVmReleaseManifest(input: {
  manifest: ReleaseManifestRecord;
  organizationId: string;
  projectId: string;
  deployment: {
    id: string;
    machineSize: string | null;
    runtimeKind: string | null;
    reservedVmTier: string | null;
    persistentStorageClaim: string | null;
  };
  promotion: unknown;
}) {
  if (!input.deployment.machineSize || !input.manifest.planEntitlements || !input.manifest.projectManifestDigest) {
    throw Object.assign(reservedVmStoreError('RESERVED_VM_RELEASE_SOURCE_INVALID'), {
      code: 'RESERVED_VM_RELEASE_SOURCE_INVALID',
      statusCode: 409,
    });
  }

  const pins = validateServerReleaseCommitPins({
    runtimeSpec: input.manifest.runtimeSpec,
    promotionEvidence: input.manifest.promotionEvidence,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environment: input.manifest.environment,
    projectManifestDigest: input.manifest.projectManifestDigest,
    planEntitlements: input.manifest.planEntitlements,
    accessPolicyVersion: input.manifest.accessPolicyVersion,
    machineKey: input.deployment.machineSize,
    artifactRef: input.manifest.artifactRef,
    artifactDigest: input.manifest.artifactDigest,
    dbMigrationPoint: input.manifest.dbMigrationPoint,
    promotion: input.promotion,
  });

  if (!serverRollbackRuntimeMatchesDeployment(pins.runtimeSpec, input.deployment)) {
    throw Object.assign(reservedVmStoreError('RESERVED_VM_RELEASE_SOURCE_INVALID'), {
      code: 'RESERVED_VM_RELEASE_SOURCE_INVALID',
      statusCode: 409,
    });
  }

  return pins;
}

async function requireReservedVmPublishCandidate(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    deploymentId: string;
    organizationId: string;
    expectedRuntimeVersion: number;
    releaseFence: ProjectReleaseFence;
    sourceReleaseManifestId?: string;
  },
) {
  await tx.$queryRaw`
    SELECT "id" FROM "Deployment"
    WHERE "id" = ${input.deploymentId} AND "projectId" = ${input.projectId}
    FOR UPDATE
  `;
  const deployment = await tx.deployment.findFirst({
    where: { id: input.deploymentId, projectId: input.projectId },
    include: { project: { select: { organizationId: true } } },
  });

  if (!deployment) {
    throw Object.assign(reservedVmStoreError('DEPLOYMENT_NOT_FOUND'), {
      code: 'DEPLOYMENT_NOT_FOUND',
      statusCode: 404,
    });
  }

  const metadata =
    deployment.metadata && typeof deployment.metadata === 'object' && !Array.isArray(deployment.metadata)
      ? (deployment.metadata as Record<string, unknown>)
      : {};
  const serverDeploy = metadata.serverDeploy as Record<string, unknown> | undefined;
  const image = serverDeploy?.image as Record<string, unknown> | undefined;

  if (
    deployment.project.organizationId !== input.organizationId ||
    input.organizationId !== input.releaseFence.expectedOrganizationId
  ) {
    throw Object.assign(reservedVmStoreError('RESERVED_VM_TENANT_FORBIDDEN'), {
      code: 'RESERVED_VM_TENANT_FORBIDDEN',
      statusCode: 403,
    });
  }

  if (
    deployment.provider !== 'server' ||
    deployment.status !== 'READY' ||
    deployment.runtimeKind !== 'reserved-vm' ||
    deployment.reservedVmBillingState !== 'CURRENT' ||
    metadata.projectManifestDigest !== input.releaseFence.expectedManifestDigest
  ) {
    throw Object.assign(reservedVmStoreError('RESERVED_VM_DEPLOYMENT_NOT_READY'), {
      code: 'RESERVED_VM_DEPLOYMENT_NOT_READY',
      statusCode: 409,
    });
  }

  if (deployment.runtimeVersion !== input.expectedRuntimeVersion) {
    throw Object.assign(reservedVmStoreError('RESERVED_VM_RUNTIME_VERSION_CONFLICT'), {
      code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
      statusCode: 409,
    });
  }

  const activeOperation = await tx.reservedVmOperation.findFirst({
    where: { deploymentId: deployment.id, status: { in: ['PENDING', 'APPLYING'] } },
    select: { id: true },
  });

  if (activeOperation) {
    throw Object.assign(reservedVmStoreError('RESERVED_VM_CHANGE_IN_PROGRESS'), {
      code: 'RESERVED_VM_CHANGE_IN_PROGRESS',
      statusCode: 409,
    });
  }

  if (deployment.environmentName === 'production') {
    const publishedSourceId = metadata.publishedFromReleaseManifestId;
    const releaseSource =
      input.sourceReleaseManifestId && publishedSourceId === input.sourceReleaseManifestId
        ? await tx.releaseManifest.findFirst({
            where: {
              id: input.sourceReleaseManifestId,
              projectId: input.projectId,
              deploymentId: input.deploymentId,
            },
          })
        : undefined;
    const committedProductionRelease = releaseSource
      ? await tx.releaseManifest.findFirst({
          where: {
            projectId: input.projectId,
            deploymentId: input.deploymentId,
            environment: 'production',
            provider: 'server',
            artifactKind: 'server-image',
            artifactRef: releaseSource.artifactRef,
            artifactDigest: releaseSource.artifactDigest,
            accessPolicyVersion: releaseSource.accessPolicyVersion,
          },
        })
      : undefined;
    const releaseSourcePin = parseReleasePlanEntitlementsPin(releaseSource?.planEntitlements);
    const committedProductionPin = parseReleasePlanEntitlementsPin(committedProductionRelease?.planEntitlements);
    const releaseSourcePins = releaseSource
      ? validateReservedVmReleaseManifest({
          manifest: mapReleaseManifest(releaseSource),
          organizationId: input.organizationId,
          projectId: input.projectId,
          deployment,
          promotion: serverDeploy?.promotion,
        })
      : undefined;
    const committedProductionPins = committedProductionRelease
      ? validateReservedVmReleaseManifest({
          manifest: mapReleaseManifest(committedProductionRelease),
          organizationId: input.organizationId,
          projectId: input.projectId,
          deployment,
          promotion: serverDeploy?.promotion,
        })
      : undefined;

    if (
      releaseSource &&
      releaseSourcePin &&
      committedProductionRelease &&
      committedProductionPin &&
      releaseSource.provider === 'server' &&
      releaseSource.artifactKind === 'server-image' &&
      releaseSource.accessPolicyVersion === deployment.accessPolicyVersion &&
      releaseSource.projectManifestDigest === input.releaseFence.expectedManifestDigest &&
      committedProductionRelease.projectManifestDigest === releaseSource.projectManifestDigest &&
      sameReleasePlanEntitlementsPin(committedProductionRelease.planEntitlements, releaseSourcePin) &&
      releaseSourcePins !== undefined &&
      committedProductionPins !== undefined &&
      sameServerRollbackRuntimePinsForPublish(releaseSourcePins, committedProductionPins) &&
      releaseSourcePins?.promotionEvidence.hash === committedProductionPins?.promotionEvidence.hash &&
      image?.imageRef === releaseSource.artifactRef &&
      image?.imageDigest === releaseSource.artifactDigest &&
      isCommittedPromotionForTenant(
        serverDeploy?.promotion,
        input.organizationId,
        releaseSource.artifactDigest,
        releaseSource.artifactRef,
      )
    ) {
      return { deployment, metadata, releaseSource, replayed: true as const };
    }

    throw Object.assign(reservedVmStoreError('RESERVED_VM_RELEASE_REPLAY_CONFLICT'), {
      code: 'RESERVED_VM_RELEASE_REPLAY_CONFLICT',
      statusCode: 409,
    });
  }

  const releaseSource = await tx.releaseManifest.findFirst({
    where: {
      projectId: input.projectId,
      deploymentId: input.deploymentId,
      environment: deployment.environmentName,
      ...(input.sourceReleaseManifestId ? { id: input.sourceReleaseManifestId } : {}),
    },
    orderBy: { version: 'desc' },
  });
  const releaseSourcePin = parseReleasePlanEntitlementsPin(releaseSource?.planEntitlements);
  const releaseSourcePins = releaseSource
    ? validateReservedVmReleaseManifest({
        manifest: mapReleaseManifest(releaseSource),
        organizationId: input.organizationId,
        projectId: input.projectId,
        deployment,
        promotion: serverDeploy?.promotion,
      })
    : undefined;

  if (
    !releaseSource ||
    !releaseSourcePin ||
    releaseSource.provider !== 'server' ||
    releaseSource.artifactKind !== 'server-image' ||
    !releaseSourcePins ||
    releaseSource.accessPolicyVersion !== deployment.accessPolicyVersion ||
    releaseSource.projectManifestDigest !== input.releaseFence.expectedManifestDigest ||
    image?.imageRef !== releaseSource.artifactRef ||
    image?.imageDigest !== releaseSource.artifactDigest ||
    !isCommittedPromotionForTenant(
      serverDeploy?.promotion,
      input.organizationId,
      releaseSource.artifactDigest,
      releaseSource.artifactRef,
    )
  ) {
    throw Object.assign(reservedVmStoreError('RESERVED_VM_RELEASE_SOURCE_INVALID'), {
      code: 'RESERVED_VM_RELEASE_SOURCE_INVALID',
      statusCode: 409,
    });
  }

  return { deployment, metadata, releaseSource, replayed: false as const };
}

function deploymentMutationData(
  input: Partial<Omit<DeploymentRecord, 'id' | 'projectId' | 'createdAt'>>,
): Record<string, unknown> {
  return {
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
  };
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
    targetIdeState: row.targetIdeState ?? undefined,
    targetIdeStateDigest: row.targetIdeStateDigest ?? undefined,
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
    ...(patch.targetIdeState !== undefined ? { targetIdeState: json(patch.targetIdeState) } : {}),
    ...(patch.targetIdeStateDigest !== undefined ? { targetIdeStateDigest: patch.targetIdeStateDigest } : {}),
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

function canonicalObjectStorageInventory(inventory: ObjectStorageInventory): ObjectStorageInventory {
  return {
    bucketExists: inventory.bucketExists,
    objects: [...inventory.objects]
      .map(({ key, size, generation, contentHash }) => ({ key, size, generation, contentHash }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function exactObjectStorageInventoriesEqual(left: ObjectStorageInventory, right: ObjectStorageInventory): boolean {
  return (
    JSON.stringify(canonicalObjectStorageInventory(left)) === JSON.stringify(canonicalObjectStorageInventory(right))
  );
}

function parseRetainedRemixSourceInventory(value: unknown): ObjectStorageInventory {
  const inventory = parseObjectStorageInventory(value);
  if (
    !inventory ||
    inventory.objects.some(
      (object) => object.generation === null || object.key === 'tmp' || object.key.startsWith('tmp/'),
    )
  ) {
    throw Object.assign(new Error(appPublicEnglish('REMIX_STORAGE_SHARE_CONFLICT')), {
      code: 'REMIX_STORAGE_SNAPSHOT_UNPINNABLE',
      statusCode: 409,
    });
  }
  return canonicalObjectStorageInventory(inventory);
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

/*
 * Database point-in-time rollback (Phase-1 scaffold) row → record mappers.
 * sizeBytes is a Postgres BIGINT (Prisma `bigint`); narrow to number for the API.
 */
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

function projectFromPermanentDeletionSnapshot(
  snapshot: Record<string, unknown>,
): ProjectPermanentDeletionResult['project'] {
  if (
    typeof snapshot.id !== 'string' ||
    typeof snapshot.organizationId !== 'string' ||
    typeof snapshot.projectRecordHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(snapshot.projectRecordHash) ||
    snapshot.state !== 'PERMANENTLY_DELETED'
  ) {
    throw Object.assign(new Error(appPublicEnglish('PROJECT_PERMANENT_DELETION_RECEIPT_CORRUPT')), {
      code: 'PROJECT_PERMANENT_DELETION_RECEIPT_CORRUPT',
      statusCode: 500,
    });
  }

  return {
    id: snapshot.id as string,
    organizationId: snapshot.organizationId as string,
    projectRecordHash: snapshot.projectRecordHash as string,
    state: 'PERMANENTLY_DELETED',
    ...(typeof snapshot.permanentDeletionStartedAt === 'string'
      ? { permanentDeletionStartedAt: snapshot.permanentDeletionStartedAt }
      : {}),
    ...(typeof snapshot.deletedAt === 'string' ? { deletedAt: snapshot.deletedAt } : {}),
  };
}

function mapPermanentDeletionReplay(
  replay: PermanentDeletionReplay,
  input: { idempotencyKey: string; requestHash: string; replayed: boolean },
): ProjectPermanentDeletionResult {
  return {
    projectId: replay.projectId,
    organizationId: replay.organizationId,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    operationId: replay.operationId,
    project: projectFromPermanentDeletionSnapshot(replay.projectSnapshot),
    proof: replay.proof,
    completedAt: replay.completedAt,
    replayed: input.replayed,
  };
}

export class PrismaApiStore implements ApiStore, ReservedVmBillingStore {
  constructor(
    readonly prisma: DatabaseClient = createDatabaseClient(),

    /**
     * DNS TXT resolver used by {@link verifyDomain}. Injectable so tests can
     * exercise domain verification without hitting real DNS; defaults to the
     * Node resolver in production.
     */
    private readonly resolveTxt: (hostname: string) => Promise<string[][]> = dnsPromises.resolveTxt,
    private readonly accountPurgeLease?: AccountPurgeLeaseOptions,
    private readonly projectPhysicalLock?: { acquireTimeoutMs?: number },
  ) {}

  #accountPurge?: AccountPurgeStore;

  private get accountPurge(): AccountPurgeStore {
    this.#accountPurge ??= new AccountPurgeStore(this.prisma, this.accountPurgeLease);
    return this.#accountPurge;
  }

  /**
   * Linearize every durable project-scoped mutation with project transfer. The
   * stale route authorization supplies the tenant it authorized; after the
   * global topology -> checkpoint -> Project lock order is acquired, the row is
   * re-read and a transfer is rejected rather than mutating the new tenant.
   */
  private async lockProjectTenantMutation(
    tx: Prisma.TransactionClient,
    input: {
      projectId: string;
      expectedOrganizationId: string;
      subjectUserIds?: string[];
    },
  ): Promise<void> {
    await this.accountPurge.assertProjectMutable(tx, input.projectId, input.subjectUserIds);
    await lockProjectAfterPurgeTopology(tx, input.projectId);
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: { organizationId: true, deletedAt: true },
    });

    if (!project || project.deletedAt || project.organizationId !== input.expectedOrganizationId) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
        code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
        statusCode: 409,
      });
    }
  }

  async ping(): Promise<void> {
    // Trivial round-trip to confirm the database connection is live.
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async getDatabaseClock() {
    const [row] = await this.prisma.$queryRaw<Array<{ now: Date; monthStart: Date }>>`
      SELECT clock_timestamp() AS "now", date_trunc('month', clock_timestamp()) AS "monthStart"
    `;
    if (!row) {
      throw new Error(appPublicEnglish('DATABASE_TIME_UNAVAILABLE'));
    }
    return { now: row.now.toISOString(), monthStart: row.monthStart.toISOString() };
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

  protected async withProjectPhysicalBarriers<T>(projectIds: string[], effect: () => Promise<T>): Promise<T> {
    const orderedProjectIds = [...new Set(projectIds)].sort();
    const lockKeys = orderedProjectIds.map(projectPhysicalMutationLockKey);
    let client: PoolClient | undefined;
    const acquiredKeys: string[] = [];
    let destroyClient = false;

    try {
      client = await this.physicalLockPool.connect();

      try {
        await client.query(`SELECT set_config('statement_timeout', $1, false)`, [
          `${this.projectPhysicalLockAcquireTimeoutMs}ms`,
        ]);
        for (const lockKey of lockKeys) {
          await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [lockKey]);
          acquiredKeys.push(lockKey);
        }
        /* The timeout bounds lock acquisition only; the effect may be arbitrarily long. */
        await client.query(`SELECT set_config('statement_timeout', '0', false)`);
      } catch (error) {
        throw Object.assign(
          new Error(appPublicEnglish('PROJECT_LOCK_TIMEOUT', { projectId: orderedProjectIds[0] ?? 'unknown' })),
          { code: 'PROJECT_LOCK_TIMEOUT', statusCode: 503, cause: error },
        );
      }

      return await effect();
    } finally {
      if (client) {
        for (const lockKey of acquiredKeys.reverse()) {
          try {
            const unlocked = await client.query<{ unlocked: boolean }>(
              'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
              [lockKey],
            );
            destroyClient ||= unlocked.rows[0]?.unlocked !== true;
          } catch {
            destroyClient = true;
          }
        }

        if (!destroyClient) {
          try {
            await client.query(`SELECT set_config('statement_timeout', '0', false)`);
          } catch {
            destroyClient = true;
          }
        }

        /* Destroying a suspect session releases every remaining advisory lock. */
        client.release(destroyClient);
      }
    }
  }

  protected withProjectPhysicalBarrier<T>(projectId: string, effect: () => Promise<T>): Promise<T> {
    return this.withProjectPhysicalBarriers([projectId], effect);
  }

  protected withProjectFilesystemLock<T>(projectId: string, effect: () => Promise<T>): Promise<T> {
    return withProjectLock(projectId, effect);
  }

  /**
   * Serialize static last-reference decisions across projects and pods. The NFS
   * heartbeat is the fallback authority if the advisory-lock session dies while
   * a long filesystem/provider effect is still running.
   */
  private withStaticArtifactErasureBarrier<T>(effect: () => Promise<T>): Promise<T> {
    const barrierId = 'static-artifact-erasure-global';
    return this.withProjectPhysicalBarrier(barrierId, () => this.withProjectFilesystemLock(barrierId, effect));
  }

  private withStaticArtifactErasureProjectBarrier<T>(projectId: string, effect: () => Promise<T>): Promise<T> {
    return this.withStaticArtifactErasureBarrier(() => this.withProjectPhysicalBarrier(projectId, effect));
  }

  async withProjectPhysicalMutation<T>(scope: ProjectPhysicalMutationScope, effect: () => Promise<T>): Promise<T> {
    return this.withProjectPhysicalBarrier(scope.projectId, async () => {
      /*
       * Validate before waiting on NFS: purge acquisition may own topology,
       * but never waits for the physical/NFS locks in that transaction. A
       * session advisory lock can nevertheless disappear if its PG connection
       * breaks, so tenant authority is checked again while NFS is held. That
       * second check linearizes both outcomes: either this effect owns NFS
       * first, or transfer owns it first and the stale scope is rejected.
       *
       * RELEASE_BARRIER is intentionally allowed here. It fences tenant and
       * manifest authority, not already-materialized artifact snapshots. Tree
       * mutations additionally run checkpointMutationGuard inside this NFS
       * section and therefore still reject coordinated checkpoints.
       */
      await this.prisma.$transaction((tx) =>
        this.lockExpectedProjectTenantMutation(tx, scope, { allowActiveCheckpoint: true }),
      );
      return this.withProjectFilesystemLock(scope.projectId, async () => {
        await this.prisma.$transaction((tx) =>
          this.lockExpectedProjectTenantMutation(tx, scope, { allowActiveCheckpoint: true }),
        );
        return effect();
      });
    });
  }

  async withProjectPhysicalAccess<T>(scope: ProjectPhysicalMutationScope, effect: () => Promise<T>): Promise<T> {
    return this.withProjectPhysicalAccesses([scope], effect);
  }

  async withProjectPhysicalAccesses<T>(scopes: ProjectPhysicalMutationScope[], effect: () => Promise<T>): Promise<T> {
    const byProjectId = new Map<string, ProjectPhysicalMutationScope>();
    for (const scope of scopes) {
      const existing = byProjectId.get(scope.projectId);
      if (existing && existing.expectedOrganizationId !== scope.expectedOrganizationId) {
        throw projectOrganizationChangedError();
      }
      byProjectId.set(scope.projectId, existing ?? scope);
    }
    const orderedScopes = [...byProjectId.values()].sort((left, right) =>
      left.projectId.localeCompare(right.projectId),
    );
    if (orderedScopes.length === 0) {
      throw new TypeError('PROJECT_PHYSICAL_ACCESS_SCOPE_REQUIRED');
    }

    return this.withProjectPhysicalBarriers(
      orderedScopes.map(({ projectId }) => projectId),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          for (const scope of orderedScopes) {
            await this.lockExpectedProjectTenantMutation(tx, scope, { allowActiveCheckpoint: true });
          }
        });

        const lockFilesystem = async (index: number): Promise<T> => {
          const scope = orderedScopes[index];
          if (scope) return this.withProjectFilesystemLock(scope.projectId, () => lockFilesystem(index + 1));

          await this.prisma.$transaction(async (tx) => {
            for (const tenantScope of orderedScopes) {
              await this.lockExpectedProjectTenantMutation(tx, tenantScope, { allowActiveCheckpoint: true });
            }
          });
          return effect();
        };
        return lockFilesystem(0);
      },
    );
  }

  withProjectPhysicalErasure<T>(projectId: string, effect: () => Promise<T>): Promise<T> {
    return this.withProjectPhysicalBarrier(projectId, effect);
  }

  private objectStorageOperationHeartbeat(
    initialLease: ObjectStorageOperationLease,
    sideEffect?: (tx: Prisma.TransactionClient, lease: ObjectStorageOperationLease) => Promise<void>,
  ) {
    let lease = initialLease;
    let stopped = false;
    let lost: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wake: (() => void) | undefined;

    const running = (async () => {
      while (!stopped && !lost) {
        await new Promise<void>((resolve) => {
          wake = resolve;
          timer = setTimeout(resolve, OBJECT_STORAGE_OPERATION_HEARTBEAT_MS);
          timer.unref?.();
        });
        wake = undefined;
        if (stopped || lost) break;

        try {
          lease = await this.prisma.$transaction(async (tx) => {
            const renewed = await heartbeatObjectStorageOperation(
              tx,
              lease,
              OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS,
            );
            await sideEffect?.(tx, renewed);
            return renewed;
          });
        } catch (error) {
          lost = error;
        }
      }
    })();

    const assert = async () => {
      if (lost) throw lost;
      await this.prisma.$transaction((tx) => assertObjectStorageOperationFence(tx, lease));
      if (lost) throw lost;
    };

    return {
      lease: () => lease,
      assert,
      lost: () => lost,
      async stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
        wake?.();
        await running.catch((error) => {
          lost ??= error;
        });
        if (lost) throw lost;
      },
    };
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

  private get projectPhysicalLockAcquireTimeoutMs(): number {
    const configured = this.projectPhysicalLock?.acquireTimeoutMs ?? PROJECT_PHYSICAL_LOCK_ACQUIRE_TIMEOUT_MS;
    return Math.max(50, Math.min(Number.isFinite(configured) ? Math.trunc(configured) : 5 * 60_000, 15 * 60_000));
  }

  private get physicalLockPool(): Pool {
    if (!this.#physicalLockPool) {
      const poolMax = Math.max(5, Math.min(Number(process.env.DATABASE_PHYSICAL_MUTATION_POOL_MAX) || 20, 100));
      this.#physicalLockPool = new Pool({
        connectionString: getDatabaseUrl(),
        max: poolMax,
        connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS) || 10_000,
        idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS) || 30_000,
      });
      this.#physicalLockPool.on('error', (error) => {
        console.error('project physical lock pool idle client error', error);
      });
    }

    return this.#physicalLockPool;
  }

  #physicalLockPool?: Pool;

  /** Release both pools during controlled shutdowns and real-Postgres tests. */
  async disconnect(): Promise<void> {
    const clients = [this.prisma, this.#lockClient].filter(Boolean) as DatabaseClient[];
    const physicalLockPool = this.#physicalLockPool;
    this.#lockClient = undefined;
    this.#physicalLockPool = undefined;
    await Promise.all([...clients.map((client) => client.$disconnect()), physicalLockPool?.end()]);
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
    return this.withStaticArtifactErasureBarrier(() => this.accountPurge.purge(input, deps));
  }

  reconcilePurgeFreezes() {
    return this.accountPurge.reconcile();
  }

  isObjectStorageProjectPurgeFrozen(projectId: string) {
    return this.accountPurge.isObjectStorageFrozen(projectId);
  }

  private retainedRemixSourceError(): Error {
    return Object.assign(
      new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_SHARED_READ_ONLY'), 'SHARED_SOURCE_RETENTION_ACTIVE'),
      { statusCode: 409 },
    );
  }

  private async assertNoActiveRemixSourceShare(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
    const active = await tx.remixStorageShare.findFirst({
      where: { sourceProjectId: projectId, state: 'ACTIVE' },
      select: { id: true },
    });
    if (active) throw this.retainedRemixSourceError();
  }

  private async assertObjectStorageCommandDoesNotDestroySharedSource(
    tx: Prisma.TransactionClient,
    command: TenantObjectStorageCommand,
  ): Promise<void> {
    if (command.type === 'ENSURE_BUCKET' || command.type === 'CLONE_PROJECT') return;
    const shares = await tx.remixStorageShare.findMany({
      where: { sourceProjectId: command.projectId, state: 'ACTIVE' },
      select: { sourceInventory: true },
    });
    if (shares.length === 0) return;
    if (command.type === 'DELETE_BUCKET') throw this.retainedRemixSourceError();

    for (const share of shares) {
      const inventory = parseObjectStorageInventory(share.sourceInventory);
      if (!inventory) throw this.retainedRemixSourceError();
      const retained = inventory.objects.some((object) => {
        switch (command.type) {
          case 'DELETE_OBJECT':
            return (
              command.expectedObjectGeneration !== null &&
              command.expectedObjectGeneration !== undefined &&
              object.key === command.key &&
              object.generation === command.expectedObjectGeneration
            );
          case 'MOVE_OBJECT':
            return object.key === command.from && object.generation === command.sourceGeneration;
          case 'DELETE_PREFIX':
            return object.key.startsWith(command.prefix);
          case 'PUT_OBJECT':
            return object.key === command.key;
          default:
            return false;
        }
      });
      if (retained) throw this.retainedRemixSourceError();
    }
  }

  issueSignedObjectStorageCapability<T extends { expiresAt: string }>(
    command: ObjectStorageCapabilityCommand,
    signer: (authorization: { expiresAt: string }) => Promise<T>,
  ) {
    return this.withProjectPhysicalMutation(command, () =>
      this.issueSignedObjectStorageCapabilityWithinPhysicalAccess(command, signer),
    );
  }

  issueSignedObjectStorageCapabilityWithinPhysicalAccess<T extends { expiresAt: string }>(
    command: ObjectStorageCapabilityCommand,
    signer: (authorization: { expiresAt: string }) => Promise<T>,
  ) {
    if (assertValidObjectKey(command.objectKey) !== command.objectKey) {
      throw new ObjectStorageError('Object keys must not contain surrounding whitespace', 'INVALID_KEY');
    }
    const objectKeyHash = createHash('sha256').update(command.objectKey).digest('hex');
    const commandIdentity = {
      method: command.method,
      objectKeyHash,
      generation: command.generation ?? null,
      contentType: command.contentType ?? null,
    };
    const operationRequest = {
      kind: command.method === 'PUT' ? ('SIGNED_UPLOAD_CAPABILITY' as const) : ('SIGNED_DOWNLOAD_CAPABILITY' as const),
      scopes: [
        {
          projectId: command.projectId,
          expectedOrganizationId: command.expectedOrganizationId,
        },
      ],
      payload: {
        command: 'issue-signed-object-storage-capability',
        ...commandIdentity,
      },
      preconditions: {
        tenantMustMatch: true,
        activeTargetShareForbidden: true,
      },
    };
    const requestHash = objectStorageRequestHash(operationRequest);
    const idempotencyKey = `signed-${command.method.toLowerCase()}-${createHash('sha256')
      .update(JSON.stringify(commandIdentity))
      .digest('hex')}`;
    const authorizationToken = randomUUID();
    const ownerToken = `signed-capability:${randomUUID()}`;

    return (async () => {
      const authorization = await this.prisma.$transaction(async (tx) => {
        const claimed = await claimObjectStorageOperation(tx, {
          ...operationRequest,
          idempotencyKey,
          requestHash,
          ownerToken,
          leaseTtlSeconds: OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS,
          ...(command.checkpointBarrierAuthority
            ? { checkpointBarrierAuthority: command.checkpointBarrierAuthority }
            : {}),
        });

        if (claimed.kind === 'BUSY') {
          throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_CAPABILITY_ISSUANCE_IN_PROGRESS')), {
            code: 'OBJECT_STORAGE_CAPABILITY_ISSUANCE_IN_PROGRESS',
            statusCode: 409,
            retryAt: claimed.retryAt,
          });
        }
        if (claimed.kind === 'VERIFY_FIRST' || claimed.kind === 'MANUAL_RECOVERY') {
          throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_CAPABILITY_MANUAL_RECOVERY_REQUIRED')), {
            code: 'OBJECT_STORAGE_CAPABILITY_MANUAL_RECOVERY_REQUIRED',
            statusCode: 409,
          });
        }

        const activeTargetShare = await tx.remixStorageShare.findFirst({
          where: { targetProjectId: command.projectId, state: 'ACTIVE' },
          select: { id: true },
        });
        if (activeTargetShare) {
          throw new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_SHARED_READ_ONLY'), 'SHARED_READ_ONLY');
        }

        const now = await databaseNow(tx);
        const reservedCapabilityExpiresAt = new Date(now.getTime() + SIGNED_URL_TTL_MS).toISOString();
        const authorization = await reserveSignedCapabilityAuthorization(tx, {
          operationId: claimed.operation.id,
          requestHash,
          scopeHash: claimed.operation.scopeHash,
          authorizationToken,
          reservedCapabilityExpiresAt,
          ...(claimed.kind === 'ACQUIRED' ? { lease: claimed.lease } : {}),
          ...(command.checkpointBarrierAuthority
            ? { checkpointBarrierAuthority: command.checkpointBarrierAuthority }
            : {}),
        });
        if (command.method === 'PUT') {
          await scheduleObjectStorageVersionGc(tx, {
            projectId: command.projectId,
            expectedOrganizationId: command.expectedOrganizationId,
            notBefore: new Date(authorization.reservedCapabilityExpiresAt),
          });
        }
        return authorization;
      });

      const result = await signer({ expiresAt: authorization.reservedCapabilityExpiresAt });
      await this.prisma.$transaction((tx) =>
        markSignedCapabilityIssued(tx, {
          reservationId: authorization.reservationId,
          operationId: authorization.operationId,
          fencingToken: authorization.fencingToken,
          authorizationToken,
          method: command.method,
          objectKeyHash,
          providerExpiresAt: result.expiresAt,
          evidence: {
            command: 'signed-object-storage-capability-issued',
            method: command.method,
            objectKeyHash,
          },
        }),
      );
      return result;
    })();
  }

  async executeTenantObjectStorageCommand(input: {
    scopes: ProjectPhysicalMutationScope[];
    command: TenantObjectStorageCommand;
    storage: ObjectStorage;
    idempotencyKey?: string;
    checkpointBarrierAuthority?: ObjectStorageCheckpointBarrierAuthority;
    transportIntentHash?: string;
  }): Promise<ObjectStorageCommandExecution> {
    assertValidObjectStorageCommand(input.command);
    return this.withProjectPhysicalAccesses(input.scopes, async () => {
      await this.prisma.$transaction(async (tx) => {
        for (const scope of input.scopes) {
          await this.lockExpectedProjectTenantMutation(tx, scope, {
            allowActiveCheckpoint: Boolean(input.checkpointBarrierAuthority),
          });
        }
        const activeTargetShare = await tx.remixStorageShare.findFirst({
          where: {
            targetProjectId: { in: objectStorageCommandMutationProjectIds(input.command) },
            state: 'ACTIVE',
          },
          select: { id: true },
        });
        if (activeTargetShare) {
          throw new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_SHARED_READ_ONLY'), 'SHARED_READ_ONLY');
        }
      });
      if (input.command.type !== 'CLONE_PROJECT') {
        const command = await pinObjectStorageCommand(input.storage, input.command);
        return this.executeTenantObjectStorageCommandWithinPhysicalAccess({ ...input, command });
      }

      const transportIntentHash = objectStorageCloneIntentHash(input.command);
      if (input.transportIntentHash && input.transportIntentHash !== transportIntentHash) {
        throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_OPERATION_INTENT_HASH_INVALID')), {
          code: 'OBJECT_STORAGE_OPERATION_INTENT_HASH_INVALID',
          statusCode: 400,
        });
      }
      const replayCommitted = () =>
        input.idempotencyKey
          ? this.replayTenantObjectStorageCommandWithinPhysicalAccess({
              scopes: input.scopes,
              idempotencyKey: input.idempotencyKey,
              transportIntentHash,
            })
          : Promise.resolve(undefined);
      const existing = await replayCommitted();
      if (existing) return existing;

      let command: TenantObjectStorageCommand;
      try {
        command = await pinObjectStorageCommand(input.storage, input.command);
      } catch (error) {
        const racedReplay = await replayCommitted();
        if (racedReplay) return racedReplay;
        throw error;
      }

      try {
        return await this.executeTenantObjectStorageCommandWithinPhysicalAccess({
          ...input,
          command,
          transportIntentHash,
        });
      } catch (error) {
        const racedReplay = await replayCommitted();
        if (racedReplay) return racedReplay;
        throw error;
      }
    });
  }

  async executeTenantObjectStorageIntent(input: {
    scope: ProjectPhysicalMutationScope;
    intent: TenantObjectStorageCommandIntent;
    storage: ObjectStorage;
    idempotencyKey?: string;
    checkpointBarrierAuthority?: ObjectStorageCheckpointBarrierAuthority;
  }): Promise<ObjectStorageCommandExecution> {
    assertValidObjectStorageCommandIntent(input.intent);
    if (input.intent.projectId !== input.scope.projectId) {
      throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_TENANT_SCOPE_MISMATCH')), {
        code: 'TENANT_SCOPE_MISMATCH',
        statusCode: 409,
      });
    }
    const scopes = [input.scope];
    const transportIntentHash = objectStorageCommandIntentHash(input.intent);

    return this.withProjectPhysicalAccess(input.scope, async () => {
      const replayCommitted = () =>
        input.idempotencyKey
          ? this.replayTenantObjectStorageCommandWithinPhysicalAccess({
              scopes,
              idempotencyKey: input.idempotencyKey,
              transportIntentHash,
            })
          : Promise.resolve(undefined);
      const existing = await replayCommitted();
      if (existing) return existing;

      let command: TenantObjectStorageCommand;
      try {
        command = await pinObjectStorageCommandIntent(input.storage, input.intent);
      } catch (error) {
        const racedReplay = await replayCommitted();
        if (racedReplay) return racedReplay;
        throw error;
      }

      try {
        return await this.executeTenantObjectStorageCommandWithinPhysicalAccess({
          scopes,
          command,
          storage: input.storage,
          transportIntentHash,
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
          ...(input.checkpointBarrierAuthority ? { checkpointBarrierAuthority: input.checkpointBarrierAuthority } : {}),
        });
      } catch (error) {
        const racedReplay = await replayCommitted();
        if (racedReplay) return racedReplay;
        throw error;
      }
    });
  }

  private async executeTenantObjectStorageCommandWithinPhysicalAccess(input: {
    scopes: ProjectPhysicalMutationScope[];
    command: TenantObjectStorageCommand;
    storage: ObjectStorage;
    idempotencyKey?: string;
    checkpointBarrierAuthority?: ObjectStorageCheckpointBarrierAuthority;
    transportIntentHash?: string;
  }): Promise<ObjectStorageCommandExecution> {
    if (!input.storage.active) {
      throw new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_BACKEND_REQUIRED'), 'BACKEND_REQUIRED');
    }

    const expectedProjectIds = [...new Set(objectStorageCommandProjectIds(input.command))].sort();
    const scopesByProjectId = new Map<string, ProjectPhysicalMutationScope>();
    for (const scope of input.scopes) {
      const existing = scopesByProjectId.get(scope.projectId);
      if (existing && existing.expectedOrganizationId !== scope.expectedOrganizationId) {
        throw projectOrganizationChangedError();
      }
      scopesByProjectId.set(scope.projectId, existing ?? scope);
    }
    const scopes = [...scopesByProjectId.values()].sort((left, right) => left.projectId.localeCompare(right.projectId));
    if (
      scopes.length !== expectedProjectIds.length ||
      scopes.some((scope, index) => scope.projectId !== expectedProjectIds[index])
    ) {
      throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_TENANT_SCOPE_MISMATCH')), {
        code: 'TENANT_SCOPE_MISMATCH',
        statusCode: 409,
      });
    }
    if (
      input.checkpointBarrierAuthority &&
      (scopes.length !== 1 ||
        input.checkpointBarrierAuthority.projectId !== scopes[0]?.projectId ||
        input.checkpointBarrierAuthority.expectedOrganizationId !== scopes[0]?.expectedOrganizationId)
    ) {
      throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_TENANT_SCOPE_MISMATCH')), {
        code: 'TENANT_SCOPE_MISMATCH',
        statusCode: 409,
      });
    }

    if (
      input.command.type === 'CLONE_PROJECT' &&
      input.command.inventory.objects.some((object) => object.generation === null || object.contentHash === null)
    ) {
      throw new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_SOURCE_UNPINNABLE'), 'SOURCE_UNPINNABLE');
    }
    const commandIdentity = objectStorageCommandIdentity(input.command);
    const pinnedInventory = objectStorageCommandPinnedInventory(input.command);
    const operationRequest = {
      kind: input.command.type === 'CLONE_PROJECT' ? ('PROJECT_REMIX_CLONE' as const) : ('TENANT_MUTATION' as const),
      scopes: scopes.map(({ projectId, expectedOrganizationId }) => ({ projectId, expectedOrganizationId })),
      payload: commandIdentity,
      preconditions: {
        tenantMustMatch: true,
        activeTargetShareForbidden: true,
        capabilityDrainRequired: input.command.type !== 'ENSURE_BUCKET',
        ...(input.transportIntentHash ? { transportIntentHash: input.transportIntentHash } : {}),
        ...(input.checkpointBarrierAuthority ? { releaseBarrierAuthority: input.checkpointBarrierAuthority } : {}),
      },
    };
    const requestHash = objectStorageRequestHash(operationRequest);
    const idempotencyKey = input.idempotencyKey ?? `object-command:${randomUUID()}`;
    const ownerToken = `object-command:${randomUUID()}`;

    const claimed = await this.prisma.$transaction(async (tx) => {
      const operation = await claimObjectStorageOperation(tx, {
        ...operationRequest,
        idempotencyKey,
        requestHash,
        ownerToken,
        leaseTtlSeconds: OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS,
        ...(pinnedInventory ? { pinnedInventory } : {}),
        ...(input.checkpointBarrierAuthority ? { checkpointBarrierAuthority: input.checkpointBarrierAuthority } : {}),
      });

      if (operation.kind === 'ACQUIRED') {
        await this.assertObjectStorageCommandDoesNotDestroySharedSource(tx, input.command);
        const activeTargetShare = await tx.remixStorageShare.findFirst({
          where: {
            targetProjectId: { in: objectStorageCommandMutationProjectIds(input.command) },
            state: 'ACTIVE',
          },
          select: { id: true },
        });
        if (activeTargetShare) {
          throw new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_SHARED_READ_ONLY'), 'SHARED_READ_ONLY');
        }
      }
      return operation;
    });

    if (claimed.kind === 'REPLAY') {
      return parseObjectStorageCommandReceipt(input.command, claimed.result);
    }
    if (claimed.kind === 'BUSY') {
      throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_OPERATION_IN_PROGRESS')), {
        code: 'OBJECT_STORAGE_OPERATION_IN_PROGRESS',
        statusCode: 409,
        retryAt: claimed.retryAt,
      });
    }
    if (claimed.kind === 'VERIFY_FIRST') {
      throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_OPERATION_VERIFY_FIRST')), {
        code: 'OBJECT_STORAGE_OPERATION_VERIFY_FIRST',
        statusCode: 409,
      });
    }
    if (claimed.kind === 'MANUAL_RECOVERY') {
      throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_OPERATION_MANUAL_RECOVERY')), {
        code: 'OBJECT_STORAGE_OPERATION_MANUAL_RECOVERY',
        statusCode: 409,
      });
    }

    const heartbeat = this.objectStorageOperationHeartbeat(claimed.lease);
    try {
      try {
        await assertObjectStorageCommandPreconditions(input.storage, input.command);
      } catch (error) {
        await this.prisma.$transaction((tx) =>
          markObjectStorageOperationFailedSafe(tx, heartbeat.lease(), {
            errorCode: this.objectStorageRecoveryErrorCode(error),
            error,
          }),
        );
        await heartbeat.stop();
        throw error;
      }
      await this.prisma.$transaction((tx) =>
        markObjectStorageOperationEffectStarted(tx, heartbeat.lease(), {
          command: input.command.type,
          requestHash,
        }),
      );
      const execution = await executeObjectStorageCommand(input.storage, input.command, heartbeat.assert);
      await this.prisma.$transaction((tx) =>
        beginObjectStorageOperationVerification(tx, heartbeat.lease(), {
          command: input.command.type,
        }),
      );
      const verification = await verifyObjectStorageCommand(input.storage, input.command, execution);
      /*
       * Drain a heartbeat already waiting on PostgreSQL before finalization.
       * Otherwise that tick can observe COMMITTED/owner=NULL after the receipt
       * transaction and turn a successful request into a spurious fence-loss.
       */
      await heartbeat.assert();
      await heartbeat.stop();
      const putProjectId = input.command.type === 'PUT_OBJECT' ? input.command.projectId : undefined;
      await this.prisma.$transaction(async (tx) => {
        await finalizeObjectStorageOperation(tx, heartbeat.lease(), {
          verification,
          result: objectStorageCommandReceipt(input.command, execution),
        });
        if (putProjectId) {
          const putScope = scopes.find((scope) => scope.projectId === putProjectId);
          if (!putScope) throw new TypeError('OBJECT_STORAGE_OPERATION_SCOPE_REQUIRED');
          await scheduleObjectStorageVersionGc(tx, {
            projectId: putProjectId,
            expectedOrganizationId: putScope.expectedOrganizationId,
            notBefore: await databaseNow(tx),
          });
        }
      });
      return execution;
    } finally {
      await heartbeat.stop();
    }
  }

  async replayTenantObjectStorageCommand(input: {
    scopes: ProjectPhysicalMutationScope[];
    idempotencyKey: string;
    transportIntentHash: string;
  }): Promise<ObjectStorageCommandExecution | undefined> {
    return this.withProjectPhysicalAccesses(input.scopes, () =>
      this.replayTenantObjectStorageCommandWithinPhysicalAccess(input),
    );
  }

  private async replayTenantObjectStorageCommandWithinPhysicalAccess(input: {
    scopes: ProjectPhysicalMutationScope[];
    idempotencyKey: string;
    transportIntentHash: string;
  }): Promise<ObjectStorageCommandExecution | undefined> {
    if (!/^[0-9a-f]{64}$/.test(input.transportIntentHash)) {
      throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_OPERATION_INTENT_HASH_INVALID')), {
        code: 'OBJECT_STORAGE_OPERATION_INTENT_HASH_INVALID',
        statusCode: 400,
      });
    }
    const byProjectId = new Map<string, ProjectPhysicalMutationScope>();
    for (const scope of input.scopes) {
      const existing = byProjectId.get(scope.projectId);
      if (existing && existing.expectedOrganizationId !== scope.expectedOrganizationId) {
        throw projectOrganizationChangedError();
      }
      byProjectId.set(scope.projectId, existing ?? scope);
    }
    const scopes = [...byProjectId.values()].sort((left, right) => left.projectId.localeCompare(right.projectId));
    if (scopes.length === 0) throw new TypeError('OBJECT_STORAGE_OPERATION_SCOPE_REQUIRED');
    const idempotencyScopeHash = objectStorageIdempotencyScopeHash(
      scopes.map(({ projectId, expectedOrganizationId }) => ({ projectId, expectedOrganizationId })),
    );

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ status: string; payload: unknown; preconditions: unknown; result: unknown | null }>
      >`
          SELECT "status"::text AS "status", "payload", "preconditions", "result"
          FROM "ObjectStorageOperation"
          WHERE "idempotencyScopeHash" = ${idempotencyScopeHash}
            AND "idempotencyKey" = ${input.idempotencyKey}
          FOR UPDATE
        `;
      const row = rows[0];
      if (!row) return undefined;
      const preconditions = row.preconditions as Record<string, unknown> | null;
      if (preconditions?.transportIntentHash !== input.transportIntentHash) {
        throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT')), {
          code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT',
          statusCode: 409,
        });
      }
      if (row.status !== 'COMMITTED') return undefined;
      const payload = row.payload as Record<string, unknown> | null;
      const command = payload?.command;
      if (
        command !== 'ENSURE_BUCKET' &&
        command !== 'DELETE_BUCKET' &&
        command !== 'MOVE_OBJECT' &&
        command !== 'DELETE_OBJECT' &&
        command !== 'DELETE_PREFIX' &&
        command !== 'PUT_OBJECT' &&
        command !== 'CLONE_PROJECT'
      ) {
        throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PAYLOAD_INVALID');
      }
      if (row.result === null) throw new TypeError('OBJECT_STORAGE_COMMAND_RECEIPT_INVALID');
      return parseObjectStorageCommandReceiptByType(command, row.result);
    });
  }

  private async withObjectStorageRecoveryPhysicalScope<T>(
    operation: ObjectStorageOperationRecord,
    effect: () => Promise<T>,
  ): Promise<T> {
    const scopes = [...operation.scopes]
      .map(({ projectId, expectedOrganizationId }) => ({ projectId, expectedOrganizationId }))
      .sort((left, right) => left.projectId.localeCompare(right.projectId));
    const allowDeletion = operation.kind === 'PROJECT_PERMANENT_DELETE';
    const validate = () =>
      this.prisma.$transaction(async (tx) => {
        for (const scope of scopes) {
          await this.lockExpectedProjectTenantMutation(tx, scope, {
            allowActiveCheckpoint: true,
            allowDeletedProject: allowDeletion,
            allowPermanentDeletion: allowDeletion,
            allowedObjectStorageOperationId: operation.id,
          });
        }
      });

    return this.withProjectPhysicalBarriers(
      scopes.map(({ projectId }) => projectId),
      async () => {
        await validate();
        const lockFilesystem = async (index: number): Promise<T> => {
          const scope = scopes[index];
          if (scope) return this.withProjectFilesystemLock(scope.projectId, () => lockFilesystem(index + 1));
          /* Re-read every tenant/freeze after all NFS locks are held. */
          await validate();
          return effect();
        };
        return lockFilesystem(0);
      },
    );
  }

  private objectStorageRecoveryErrorCode(error: unknown): string {
    const raw =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : error instanceof Error
          ? error.message
          : 'OBJECT_STORAGE_RECOVERY_FAILED';
    const normalized = raw
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .slice(0, 128);
    return /^[A-Z][A-Z0-9_]*$/.test(normalized) ? normalized : 'OBJECT_STORAGE_RECOVERY_FAILED';
  }

  private objectStorageRecoveryIsDeterministic(error: unknown): boolean {
    const code = this.objectStorageRecoveryErrorCode(error);
    return (
      error instanceof TypeError ||
      /(?:CORRUPT|INVALID|MISMATCH|VERIFICATION_FAILED|INCOMPLETE|UNSUPPORTED|UNPINNABLE|CHECKPOINT_AUTHORITY_LOST)/.test(
        code,
      )
    );
  }

  async reconcileObjectStorageOperations(input: {
    storage: ObjectStorage;
    batchSize?: number;
    maxCandidates?: number;
  }): Promise<ObjectStorageRecoveryReport> {
    const batchSize = Math.max(1, Math.min(input.batchSize ?? 100, 500));
    const maxCandidates = Math.max(batchSize, Math.min(input.maxCandidates ?? 2_000, 10_000));
    const report: ObjectStorageRecoveryReport = {
      scanned: 0,
      failedSafe: 0,
      recovered: 0,
      deferred: 0,
      quarantined: 0,
      replayed: 0,
      busy: 0,
      operationIds: [],
    };
    let after: { leaseExpiresAt: string; operationId: string } | undefined;

    while (report.scanned < maxCandidates) {
      const candidates = await this.prisma.$transaction((tx) =>
        listObjectStorageRecoveryCandidates(tx, {
          limit: Math.min(batchSize, maxCandidates - report.scanned),
          ...(after ? { after } : {}),
        }),
      );
      if (candidates.length === 0) break;

      for (const candidate of candidates) {
        report.scanned += 1;
        report.operationIds.push(candidate.operationId);
        after = { leaseExpiresAt: candidate.leaseExpiresAt, operationId: candidate.operationId };

        let inspection: Awaited<ReturnType<typeof inspectObjectStorageOperationRecovery>>;
        try {
          inspection = await this.prisma.$transaction((tx) =>
            inspectObjectStorageOperationRecovery(tx, {
              operationId: candidate.operationId,
              requestHash: candidate.requestHash,
              scopeHash: candidate.scopeHash,
            }),
          );
        } catch (error) {
          const mutation = {
            ...candidate,
            errorCode: this.objectStorageRecoveryErrorCode(error),
            error,
          };
          await this.prisma.$transaction((tx) =>
            this.objectStorageRecoveryIsDeterministic(error)
              ? quarantineObjectStorageOperationRecovery(tx, mutation)
              : deferObjectStorageOperationRecovery(tx, { ...mutation, retryAfterSeconds: 30 }),
          );
          this.objectStorageRecoveryIsDeterministic(error) ? (report.quarantined += 1) : (report.deferred += 1);
          continue;
        }

        if (inspection.action === 'REPLAY') {
          report.replayed += 1;
          continue;
        }
        if (inspection.action === 'BUSY') {
          report.busy += 1;
          continue;
        }
        if (inspection.action === 'MANUAL_RECOVERY') {
          report.quarantined += 1;
          continue;
        }
        if (
          candidate.action === 'VERIFY_FIRST' &&
          inspection.operation.kind !== 'TENANT_MUTATION' &&
          inspection.operation.kind !== 'PROJECT_REMIX_CLONE'
        ) {
          /*
           * Permanent deletion needs the route's complete local/static/GCS
           * verifier. Do not steal or quarantine that lease with a partial
           * provider-only verifier; an exact HTTP retry can reclaim it safely.
           */
          report.busy += 1;
          continue;
        }

        try {
          await this.withObjectStorageRecoveryPhysicalScope(inspection.operation, async () => {
            if (candidate.action === 'FAIL_SAFE') {
              await this.prisma.$transaction((tx) =>
                expirePreparedObjectStorageOperationFailedSafe(tx, {
                  operationId: candidate.operationId,
                  requestHash: candidate.requestHash,
                  scopeHash: candidate.scopeHash,
                  fencingToken: candidate.fencingToken,
                }),
              );
              report.failedSafe += 1;
              return;
            }

            const ownerToken = `object-storage-recovery:${randomUUID()}`;
            const reclaimed = await this.prisma.$transaction((tx) =>
              reclaimObjectStorageOperationForVerification(tx, {
                operationId: candidate.operationId,
                requestHash: candidate.requestHash,
                scopeHash: candidate.scopeHash,
                ownerToken,
                leaseTtlSeconds: OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS,
              }),
            );
            if (reclaimed.kind === 'REPLAY') {
              report.replayed += 1;
              return;
            }
            if (reclaimed.kind === 'BUSY') {
              report.busy += 1;
              return;
            }
            if (reclaimed.kind === 'MANUAL_RECOVERY') {
              report.quarantined += 1;
              return;
            }

            const heartbeat = this.objectStorageOperationHeartbeat(reclaimed.lease);
            try {
              const pinnedInventory =
                reclaimed.operation.kind === 'PROJECT_REMIX_CLONE'
                  ? await this.prisma.$transaction((tx) =>
                      readObjectStorageOperationPinnedInventory(tx, reclaimed.operation.id),
                    )
                  : undefined;
              const recovered = await recoverPersistedObjectStorageCommand(input.storage, {
                payload: reclaimed.operation.payload,
                ...(pinnedInventory ? { pinnedInventory } : {}),
              });
              await heartbeat.assert();
              await heartbeat.stop();
              await this.prisma.$transaction(async (tx) => {
                await finalizeObjectStorageOperation(tx, heartbeat.lease(), {
                  verification: recovered.verification,
                  result: objectStorageCommandReceiptFromExecution(recovered.execution),
                });
                if (recovered.execution.type === 'PUT_OBJECT') {
                  const scope = reclaimed.operation.scopes[0];
                  const recoveredProjectId = reclaimed.operation.payload.projectId;
                  if (
                    reclaimed.operation.scopes.length !== 1 ||
                    !scope ||
                    typeof recoveredProjectId !== 'string' ||
                    scope.projectId !== recoveredProjectId
                  ) {
                    throw new TypeError('OBJECT_STORAGE_OPERATION_SCOPE_REQUIRED');
                  }
                  await scheduleObjectStorageVersionGc(tx, {
                    projectId: scope.projectId,
                    expectedOrganizationId: scope.expectedOrganizationId,
                    notBefore: await databaseNow(tx),
                  });
                }
              });
              report.recovered += 1;
            } catch (error) {
              await heartbeat.stop().catch(() => undefined);
              if (this.objectStorageRecoveryIsDeterministic(error)) {
                await this.prisma.$transaction((tx) =>
                  markObjectStorageOperationManualRecovery(tx, heartbeat.lease(), {
                    errorCode: this.objectStorageRecoveryErrorCode(error),
                    error,
                    evidence: { verifier: 'api-object-storage-recovery-v1' },
                  }),
                );
                report.quarantined += 1;
              } else {
                const retryAfterSeconds = Math.min(3_600, 5 * 2 ** Math.min(reclaimed.operation.attempts, 9));
                await this.prisma.$transaction((tx) =>
                  deferLeasedObjectStorageOperationRecovery(tx, heartbeat.lease(), {
                    errorCode: this.objectStorageRecoveryErrorCode(error),
                    error,
                    retryAfterSeconds,
                  }),
                );
                report.deferred += 1;
              }
            } finally {
              await heartbeat.stop().catch(() => undefined);
            }
          });
        } catch (error) {
          const mutation = {
            ...candidate,
            errorCode: this.objectStorageRecoveryErrorCode(error),
            error,
          };
          await this.prisma
            .$transaction((tx) =>
              this.objectStorageRecoveryIsDeterministic(error)
                ? quarantineObjectStorageOperationRecovery(tx, mutation)
                : deferObjectStorageOperationRecovery(tx, { ...mutation, retryAfterSeconds: 30 }),
            )
            .then(() => {
              this.objectStorageRecoveryIsDeterministic(error) ? (report.quarantined += 1) : (report.deferred += 1);
            })
            .catch(() => {
              report.busy += 1;
            });
        }
      }

      if (candidates.length < batchSize) break;
    }
    return report;
  }

  private async objectStorageVersionGcAuthority(
    tx: Prisma.TransactionClient,
    scope: ProjectPhysicalMutationScope,
    allowedObjectStorageOperationId?: string,
  ): Promise<{
    now: Date;
    capabilityExpiresAt: Date | null;
    activeReferences: ObjectStorageGenerationReference[];
    activeReferenceDigest: string;
  }> {
    await this.lockExpectedProjectTenantMutation(tx, scope, {
      ...(allowedObjectStorageOperationId ? { allowedObjectStorageOperationId } : {}),
    });
    const [now, project, shares] = await Promise.all([
      databaseNow(tx),
      tx.project.findUnique({
        where: { id: scope.projectId },
        select: { objectStorageCapabilityExpiresAt: true },
      }),
      tx.remixStorageShare.findMany({
        where: { sourceProjectId: scope.projectId, state: 'ACTIVE' },
        select: { sourceInventory: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    if (!project) throw projectOrganizationChangedError();
    const activeReferences = activeObjectStorageGenerationReferences(shares.map((share) => share.sourceInventory));
    return {
      now,
      capabilityExpiresAt: project.objectStorageCapabilityExpiresAt,
      activeReferences,
      activeReferenceDigest: objectStorageGenerationReferenceDigest(activeReferences),
    };
  }

  private objectStorageVersionGcPlansEqual(
    left: ObjectStorageVersionGcPlan,
    right: ObjectStorageVersionGcPlan,
  ): boolean {
    return (
      left.candidateDigest === right.candidateDigest &&
      left.activeReferenceDigest === right.activeReferenceDigest &&
      left.currentGenerationDigest === right.currentGenerationDigest &&
      left.remainingCandidateCount === right.remainingCandidateCount &&
      left.disableVersioningWhenComplete === right.disableVersioningWhenComplete
    );
  }

  private objectStorageVersionGcNextAttempt(plan: ObjectStorageVersionGcPlan, now: Date): Date | undefined {
    if (plan.remainingCandidateCount > 0) return now;
    if (plan.activeReferences.length > 0) return new Date(now.getTime() + 15 * 60_000);
    return undefined;
  }

  private async inspectObjectStorageVersionGcProvider(
    storage: ObjectStorage,
    projectId: string,
    activeReferences: readonly ObjectStorageGenerationReference[],
  ): Promise<{ bucketExists: boolean; versioningEnabled: boolean; plan?: ObjectStorageVersionGcPlan }> {
    if (!storage.listObjectVersions || !storage.bucketVersioningEnabled) {
      throw new ObjectStorageError(
        'Object generation history cannot be inspected',
        'OBJECT_STORAGE_VERSION_GC_INSPECTION_REQUIRED',
      );
    }
    const bucketExists = await storage.bucketExists(projectId);
    if (!bucketExists) return { bucketExists: false, versioningEnabled: false };
    const [versioningEnabled, live, versions] = await Promise.all([
      storage.bucketVersioningEnabled(projectId),
      storage.listObjects(projectId),
      storage.listObjectVersions(projectId),
    ]);
    return {
      bucketExists: true,
      versioningEnabled,
      plan: planObjectStorageVersionGc({ live, versions, activeReferences }),
    };
  }

  private async finalizeObjectStorageVersionGc(
    lease: ObjectStorageOperationLease,
    scheduleLease: ObjectStorageVersionGcScheduleLease,
    plan: ObjectStorageVersionGcPlan,
    verified: Awaited<ReturnType<typeof verifyObjectStorageVersionGc>>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await finalizeObjectStorageOperation(tx, lease, {
        verification: {
          outcome: 'VERIFIED',
          verifier: 'api-object-storage-version-gc-v1',
          evidence: verified.evidence,
        },
        result: verified.result,
      });
      const now = await databaseNow(tx);
      const nextAttemptAt = this.objectStorageVersionGcNextAttempt(plan, now);
      await releaseObjectStorageVersionGcSchedule(tx, scheduleLease, {
        deleteSchedule: !nextAttemptAt,
        ...(nextAttemptAt ? { nextAttemptAt } : {}),
      });
    });
  }

  private async runObjectStorageVersionGcEffect(input: {
    storage: ObjectStorage;
    scope: ProjectPhysicalMutationScope;
    operation: ObjectStorageOperationRecord;
    operationLease: ObjectStorageOperationLease;
    scheduleLease: ObjectStorageVersionGcScheduleLease;
    plan: ObjectStorageVersionGcPlan;
    recovering: boolean;
  }): Promise<{ committed: boolean; deletedGenerations: number }> {
    let scheduleLease = input.scheduleLease;
    const heartbeat = this.objectStorageOperationHeartbeat(input.operationLease, (tx, renewed) => {
      if (!renewed.leaseExpiresAt) throw new TypeError('OBJECT_STORAGE_OPERATION_LEASE_INVALID');
      return heartbeatObjectStorageVersionGcSchedule(tx, scheduleLease, renewed.leaseExpiresAt);
    });
    let effectStarted = input.recovering;
    let deletedGenerations = 0;
    try {
      const authority = await this.prisma.$transaction((tx) =>
        this.objectStorageVersionGcAuthority(tx, input.scope, input.operation.id),
      );
      if (authority.activeReferenceDigest !== input.plan.activeReferenceDigest) {
        throw new ObjectStorageError(
          'Active remix generation authority changed',
          'OBJECT_STORAGE_VERSION_GC_ACTIVE_REFERENCE_MISMATCH',
        );
      }

      if (!input.recovering) {
        const provider = await this.inspectObjectStorageVersionGcProvider(
          input.storage,
          input.scope.projectId,
          authority.activeReferences,
        );
        if (
          !provider.bucketExists ||
          !provider.plan ||
          !this.objectStorageVersionGcPlansEqual(provider.plan, input.plan)
        ) {
          await heartbeat.assert();
          await heartbeat.stop();
          await this.prisma.$transaction(async (tx) => {
            await markObjectStorageOperationFailedSafe(tx, heartbeat.lease(), {
              errorCode: 'OBJECT_STORAGE_VERSION_GC_PRECONDITION_CHANGED',
              error: new Error('Provider generation preconditions changed before effect'),
            });
            await releaseObjectStorageVersionGcSchedule(tx, scheduleLease, {
              deleteSchedule: false,
              nextAttemptAt: await databaseNow(tx),
              errorCode: 'OBJECT_STORAGE_VERSION_GC_PRECONDITION_CHANGED',
            });
          });
          return { committed: false, deletedGenerations: 0 };
        }
        await this.prisma.$transaction((tx) =>
          markObjectStorageOperationEffectStarted(tx, heartbeat.lease(), {
            command: 'gc-object-generations',
            candidateDigest: input.plan.candidateDigest,
          }),
        );
        effectStarted = true;
      }

      if (!input.storage.listObjectVersions) {
        throw new ObjectStorageError(
          'Object generation history cannot be inspected',
          'OBJECT_STORAGE_VERSION_GC_INSPECTION_REQUIRED',
        );
      }
      const existing = new Set(
        (await input.storage.listObjectVersions(input.scope.projectId)).objects.map(
          (object) => `${object.key}\u0000${object.generation ?? ''}`,
        ),
      );
      for (const candidate of input.plan.candidates) {
        const identity = `${candidate.key}\u0000${candidate.generation}`;
        if (!existing.has(identity)) continue;
        await heartbeat.assert();
        const deleted = await input.storage.deleteObject(input.scope.projectId, {
          key: candidate.key,
          generation: candidate.generation,
        });
        deletedGenerations += deleted.count;
        await heartbeat.assert();
      }

      await this.prisma.$transaction((tx) =>
        beginObjectStorageOperationVerification(tx, heartbeat.lease(), {
          command: 'gc-object-generations',
          candidateDigest: input.plan.candidateDigest,
        }),
      );
      const verified = await verifyObjectStorageVersionGc({
        storage: input.storage,
        projectId: input.scope.projectId,
        candidates: input.plan.candidates,
        activeReferences: authority.activeReferences,
        expectedCurrentGenerationDigest: input.plan.currentGenerationDigest,
        disableVersioningWhenComplete: input.plan.disableVersioningWhenComplete,
        assertLease: heartbeat.assert,
      });
      await heartbeat.assert();
      await heartbeat.stop();
      await this.finalizeObjectStorageVersionGc(heartbeat.lease(), scheduleLease, input.plan, verified);
      return { committed: true, deletedGenerations };
    } catch (error) {
      await heartbeat.stop().catch(() => undefined);
      const errorCode = this.objectStorageRecoveryErrorCode(error);
      try {
        if (!effectStarted) {
          await this.prisma.$transaction(async (tx) => {
            await markObjectStorageOperationFailedSafe(tx, heartbeat.lease(), { errorCode, error });
            await releaseObjectStorageVersionGcSchedule(tx, scheduleLease, {
              deleteSchedule: false,
              nextAttemptAt: new Date((await databaseNow(tx)).getTime() + 5_000),
              errorCode,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          });
        } else if (this.objectStorageRecoveryIsDeterministic(error)) {
          await this.prisma.$transaction(async (tx) => {
            await markObjectStorageOperationManualRecovery(tx, heartbeat.lease(), {
              errorCode,
              error,
              evidence: { verifier: 'api-object-storage-version-gc-v1' },
            });
            await quarantineObjectStorageVersionGcSchedule(tx, scheduleLease, {
              errorCode,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          });
        } else {
          await this.prisma.$transaction(async (tx) => {
            const deferred = await deferLeasedObjectStorageOperationRecovery(tx, heartbeat.lease(), {
              errorCode,
              error,
              retryAfterSeconds: Math.min(3_600, 5 * 2 ** Math.min(input.operation.attempts, 9)),
            });
            if (!deferred.ownerToken || !deferred.leaseExpiresAt) {
              throw new TypeError('OBJECT_STORAGE_OPERATION_LEASE_INVALID');
            }
            scheduleLease = await deferLeasedObjectStorageVersionGcSchedule(tx, scheduleLease, {
              operationOwnerToken: deferred.ownerToken,
              operationLeaseExpiresAt: deferred.leaseExpiresAt,
              errorCode,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          });
        }
      } catch {
        /* A lost lease is handled by the next due verify-first sweep. */
      }
      throw error;
    }
  }

  private async processPendingObjectStorageVersionGcSchedule(input: {
    storage: ObjectStorage;
    candidate: ObjectStorageVersionGcScheduleCandidate;
  }): Promise<{ claimed: boolean; committed: boolean; deletedGenerations: number }> {
    const scope = {
      projectId: input.candidate.projectId,
      expectedOrganizationId: input.candidate.expectedOrganizationId,
    };
    return this.withProjectPhysicalMutation(scope, async () => {
      const authority = await this.prisma.$transaction((tx) => this.objectStorageVersionGcAuthority(tx, scope));
      if (authority.capabilityExpiresAt && authority.capabilityExpiresAt > authority.now) {
        await this.prisma.$transaction((tx) =>
          deferPendingObjectStorageVersionGcSchedule(tx, {
            candidate: input.candidate,
            nextAttemptAt: authority.capabilityExpiresAt!,
            errorCode: 'OBJECT_STORAGE_CAPABILITY_ACTIVE',
          }),
        );
        return { claimed: false, committed: false, deletedGenerations: 0 };
      }

      const provider = await this.inspectObjectStorageVersionGcProvider(
        input.storage,
        scope.projectId,
        authority.activeReferences,
      );
      if (!provider.bucketExists) {
        if (authority.activeReferences.length > 0) {
          await this.prisma.$transaction((tx) =>
            quarantinePendingObjectStorageVersionGcSchedule(tx, input.candidate, {
              errorCode: 'OBJECT_STORAGE_VERSION_GC_ACTIVE_REFERENCE_MISSING',
              errorMessage: 'An active share references an absent bucket',
            }),
          );
          throw new ObjectStorageError(
            'An active share references an absent bucket',
            'OBJECT_STORAGE_VERSION_GC_ACTIVE_REFERENCE_MISSING',
          );
        }
        await this.prisma.$transaction((tx) => deletePendingObjectStorageVersionGcSchedule(tx, input.candidate));
        return { claimed: false, committed: true, deletedGenerations: 0 };
      }
      const plan = provider.plan!;
      if (plan.candidates.length === 0 && plan.activeReferences.length > 0 && provider.versioningEnabled) {
        await this.prisma.$transaction((tx) =>
          deferPendingObjectStorageVersionGcSchedule(tx, {
            candidate: input.candidate,
            nextAttemptAt: new Date(authority.now.getTime() + 15 * 60_000),
          }),
        );
        return { claimed: false, committed: false, deletedGenerations: 0 };
      }
      if (plan.candidates.length === 0 && !plan.disableVersioningWhenComplete && !provider.versioningEnabled) {
        await this.prisma.$transaction((tx) => deletePendingObjectStorageVersionGcSchedule(tx, input.candidate));
        return { claimed: false, committed: true, deletedGenerations: 0 };
      }

      const ownerToken = `object-storage-version-gc:${randomUUID()}`;
      const operationRequest = {
        kind: 'PROJECT_VERSION_GC' as const,
        scopes: [{ projectId: scope.projectId, expectedOrganizationId: scope.expectedOrganizationId }],
        payload: {
          command: 'gc-object-generations',
          candidateCount: plan.candidates.length,
          candidateDigest: plan.candidateDigest,
          activeReferenceDigest: plan.activeReferenceDigest,
          currentGenerationDigest: plan.currentGenerationDigest,
          disableVersioningWhenComplete: plan.disableVersioningWhenComplete,
          remainingCandidateCount: plan.remainingCandidateCount,
        },
        preconditions: { tenantMustMatch: true, capabilityDrainRequired: true },
      };
      const requestHash = objectStorageRequestHash(operationRequest);
      const claimed = await this.prisma.$transaction(async (tx) => {
        const operation = await claimObjectStorageOperation(tx, {
          ...operationRequest,
          idempotencyKey: `version-gc:${scope.projectId}:${input.candidate.fencingToken + 1n}`,
          requestHash,
          ownerToken,
          leaseTtlSeconds: OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS,
          pinnedGenerations: plan.candidates,
        });
        if (operation.kind !== 'ACQUIRED' || !operation.operation.leaseExpiresAt) {
          throw Object.assign(new Error('OBJECT_STORAGE_VERSION_GC_OPERATION_UNAVAILABLE'), {
            code: 'OBJECT_STORAGE_VERSION_GC_OPERATION_UNAVAILABLE',
            statusCode: 409,
          });
        }
        const shares = await tx.remixStorageShare.findMany({
          where: { sourceProjectId: scope.projectId, state: 'ACTIVE' },
          select: { sourceInventory: true },
          orderBy: { id: 'asc' },
        });
        if (
          objectStorageGenerationReferenceDigest(
            activeObjectStorageGenerationReferences(shares.map((share) => share.sourceInventory)),
          ) !== plan.activeReferenceDigest
        ) {
          throw new ObjectStorageError(
            'Active remix generation authority changed',
            'OBJECT_STORAGE_VERSION_GC_ACTIVE_REFERENCE_MISMATCH',
          );
        }
        const scheduleLease = await claimObjectStorageVersionGcSchedule(tx, {
          candidate: input.candidate,
          ownerToken,
          operationId: operation.operation.id,
          operationLeaseExpiresAt: operation.operation.leaseExpiresAt,
        });
        return { operation, scheduleLease };
      });
      const effect = await this.runObjectStorageVersionGcEffect({
        storage: input.storage,
        scope,
        operation: claimed.operation.operation,
        operationLease: claimed.operation.lease,
        scheduleLease: claimed.scheduleLease,
        plan,
        recovering: false,
      });
      return {
        claimed: true,
        committed: effect.committed,
        deletedGenerations: effect.deletedGenerations,
      };
    });
  }

  private async processClaimedObjectStorageVersionGcSchedule(input: {
    storage: ObjectStorage;
    candidate: ObjectStorageVersionGcScheduleCandidate;
  }): Promise<{ recovered: boolean; deletedGenerations: number }> {
    if (!input.candidate.lastOperationId) {
      await this.prisma.$transaction((tx) =>
        quarantineExpiredObjectStorageVersionGcSchedule(tx, input.candidate, {
          errorCode: 'OBJECT_STORAGE_VERSION_GC_OPERATION_MISSING',
          errorMessage: 'Claimed version GC schedule has no operation',
        }),
      );
      return { recovered: false, deletedGenerations: 0 };
    }
    const identity = await this.prisma.objectStorageOperation.findUnique({
      where: { id: input.candidate.lastOperationId },
      select: { requestHash: true, scopeHash: true, status: true },
    });
    if (!identity) {
      await this.prisma.$transaction((tx) =>
        quarantineExpiredObjectStorageVersionGcSchedule(tx, input.candidate, {
          errorCode: 'OBJECT_STORAGE_VERSION_GC_OPERATION_MISSING',
          errorMessage: 'Claimed version GC operation is absent',
        }),
      );
      return { recovered: false, deletedGenerations: 0 };
    }
    const inspection = await this.prisma.$transaction((tx) =>
      inspectObjectStorageOperationRecovery(tx, {
        operationId: input.candidate.lastOperationId!,
        requestHash: identity.requestHash,
        scopeHash: identity.scopeHash,
      }),
    );
    if (inspection.action === 'REPLAY') {
      await this.prisma.$transaction(async (tx) =>
        resetExpiredObjectStorageVersionGcSchedule(tx, input.candidate, {
          nextAttemptAt: await databaseNow(tx),
        }),
      );
      return { recovered: true, deletedGenerations: 0 };
    }
    if (inspection.action === 'BUSY') return { recovered: false, deletedGenerations: 0 };
    if (inspection.action === 'MANUAL_RECOVERY') {
      await this.prisma.$transaction((tx) =>
        quarantineExpiredObjectStorageVersionGcSchedule(tx, input.candidate, {
          errorCode: inspection.operation.lastErrorCode ?? 'OBJECT_STORAGE_VERSION_GC_MANUAL_RECOVERY',
          errorMessage: inspection.operation.lastErrorMessage ?? 'Version GC requires manual recovery',
        }),
      );
      return { recovered: false, deletedGenerations: 0 };
    }
    return this.withObjectStorageRecoveryPhysicalScope(inspection.operation, async () => {
      if (inspection.action === 'RETRY_SAFE') {
        await this.prisma.$transaction(async (tx) => {
          await expirePreparedObjectStorageOperationFailedSafe(tx, {
            operationId: inspection.operation.id,
            requestHash: inspection.operation.requestHash,
            scopeHash: inspection.operation.scopeHash,
            fencingToken: inspection.operation.fencingToken,
            errorCode: 'OBJECT_STORAGE_VERSION_GC_PREPARED_EXPIRED',
          });
          await resetExpiredObjectStorageVersionGcSchedule(tx, input.candidate, {
            nextAttemptAt: await databaseNow(tx),
            errorCode: 'OBJECT_STORAGE_VERSION_GC_PREPARED_EXPIRED',
          });
        });
        return { recovered: false, deletedGenerations: 0 };
      }

      const ownerToken = `object-storage-version-gc-recovery:${randomUUID()}`;
      const reclaimed = await this.prisma.$transaction(async (tx) => {
        const operation = await reclaimObjectStorageOperationForVerification(tx, {
          operationId: inspection.operation.id,
          requestHash: inspection.operation.requestHash,
          scopeHash: inspection.operation.scopeHash,
          ownerToken,
          leaseTtlSeconds: OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS,
        });
        if (operation.kind !== 'ACQUIRED' || !operation.operation.leaseExpiresAt) return { operation };
        const scheduleLease = await reclaimObjectStorageVersionGcSchedule(tx, {
          candidate: input.candidate,
          ownerToken,
          operationId: operation.operation.id,
          operationLeaseExpiresAt: operation.operation.leaseExpiresAt,
        });
        return { operation, scheduleLease };
      });
      if (reclaimed.operation.kind !== 'ACQUIRED' || !reclaimed.scheduleLease) {
        return { recovered: false, deletedGenerations: 0 };
      }
      const pinned = await this.prisma.$transaction((tx) =>
        readObjectStorageOperationPinnedGenerations(tx, reclaimed.operation.operation.id),
      );
      const payload = reclaimed.operation.operation.payload;
      if (
        payload.command !== 'gc-object-generations' ||
        typeof payload.activeReferenceDigest !== 'string' ||
        typeof payload.currentGenerationDigest !== 'string' ||
        typeof payload.disableVersioningWhenComplete !== 'boolean' ||
        typeof payload.remainingCandidateCount !== 'number' ||
        !Number.isSafeInteger(payload.remainingCandidateCount) ||
        payload.remainingCandidateCount < 0
      ) {
        throw new TypeError('OBJECT_STORAGE_VERSION_GC_PAYLOAD_INVALID');
      }
      const scope = {
        projectId: input.candidate.projectId,
        expectedOrganizationId: input.candidate.expectedOrganizationId,
      };
      const authority = await this.prisma.$transaction((tx) =>
        this.objectStorageVersionGcAuthority(tx, scope, reclaimed.operation.operation.id),
      );
      const plan: ObjectStorageVersionGcPlan = {
        candidates: pinned,
        candidateDigest: objectStoragePinnedGenerationDigest(pinned),
        activeReferences: authority.activeReferences,
        activeReferenceDigest: payload.activeReferenceDigest,
        currentGenerations: [],
        currentGenerationDigest: payload.currentGenerationDigest,
        remainingCandidateCount: payload.remainingCandidateCount,
        disableVersioningWhenComplete: payload.disableVersioningWhenComplete,
      };
      const effect = await this.runObjectStorageVersionGcEffect({
        storage: input.storage,
        scope,
        operation: reclaimed.operation.operation,
        operationLease: reclaimed.operation.lease,
        scheduleLease: reclaimed.scheduleLease,
        plan,
        recovering: true,
      });
      return { recovered: effect.committed, deletedGenerations: effect.deletedGenerations };
    });
  }

  async reconcileObjectStorageVersionGc(input: {
    storage: ObjectStorage;
    batchSize?: number;
    maxSchedules?: number;
  }): Promise<ObjectStorageVersionGcReport> {
    const batchSize = Math.max(1, Math.min(input.batchSize ?? 50, 500));
    const maxSchedules = Math.max(batchSize, Math.min(input.maxSchedules ?? 1_000, 10_000));
    const report: ObjectStorageVersionGcReport = {
      scanned: 0,
      claimed: 0,
      recovered: 0,
      committed: 0,
      deferred: 0,
      quarantined: 0,
      busy: 0,
      deletedGenerations: 0,
      projectIds: [],
    };
    let after: { dueAt: string; projectId: string } | undefined;
    while (report.scanned < maxSchedules) {
      const candidates = await this.prisma.$transaction((tx) =>
        listObjectStorageVersionGcSchedules(tx, {
          limit: Math.min(batchSize, maxSchedules - report.scanned),
          ...(after ? { after } : {}),
        }),
      );
      if (candidates.length === 0) break;
      for (const candidate of candidates) {
        report.scanned += 1;
        report.projectIds.push(candidate.projectId);
        after = { dueAt: candidate.dueAt, projectId: candidate.projectId };
        try {
          if (candidate.status === 'PENDING') {
            const result = await this.processPendingObjectStorageVersionGcSchedule({
              storage: input.storage,
              candidate,
            });
            if (result.committed) report.committed += 1;
            else report.deferred += 1;
            if (result.claimed) report.claimed += 1;
            report.deletedGenerations += result.deletedGenerations;
          } else {
            const result = await this.processClaimedObjectStorageVersionGcSchedule({
              storage: input.storage,
              candidate,
            });
            if (result.recovered) report.recovered += 1;
            else report.busy += 1;
            report.deletedGenerations += result.deletedGenerations;
          }
        } catch (error) {
          if (candidate.status === 'PENDING') {
            const errorCode = this.objectStorageRecoveryErrorCode(error);
            await this.prisma
              .$transaction(async (tx) => {
                if (this.objectStorageRecoveryIsDeterministic(error)) {
                  return quarantinePendingObjectStorageVersionGcSchedule(tx, candidate, {
                    errorCode,
                    errorMessage: error instanceof Error ? error.message : String(error),
                  });
                }
                const now = await databaseNow(tx);
                return deferPendingObjectStorageVersionGcSchedule(tx, {
                  candidate,
                  nextAttemptAt: new Date(now.getTime() + 30_000),
                  errorCode,
                  errorMessage: error instanceof Error ? error.message : String(error),
                });
              })
              .catch(() => undefined);
          }
          if (this.objectStorageRecoveryIsDeterministic(error)) report.quarantined += 1;
          else report.deferred += 1;
        }
      }
      if (candidates.length < batchSize) break;
    }
    return report;
  }

  private async matchingActiveObjectStorageOperationId(
    tx: Prisma.TransactionClient,
    input: {
      projectId: string;
      expectedOrganizationId: string;
      idempotencyKey: string;
      requestHash: string;
    },
  ): Promise<string | undefined> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT operation."id"
      FROM "ObjectStorageOperation" operation
      JOIN "ObjectStorageOperationProjectScope" scope ON scope."operationId" = operation."id"
      WHERE scope."projectIdSnapshot" = ${input.projectId}
        AND scope."expectedOrganizationId" = ${input.expectedOrganizationId}
        AND operation."idempotencyKey" = ${input.idempotencyKey}
        AND operation."requestHash" = ${input.requestHash}
        AND operation."status" IN (
          'PREPARED'::"ObjectStorageOperationStatus",
          'EFFECT_STARTED'::"ObjectStorageOperationStatus",
          'VERIFYING'::"ObjectStorageOperationStatus",
          'MANUAL_RECOVERY'::"ObjectStorageOperationStatus"
        )
      LIMIT 1
    `;
    return rows[0]?.id;
  }

  private async matchingPermanentDeletionScope(
    tx: Prisma.TransactionClient,
    input: {
      projectId: string;
      expectedOrganizationId: string;
      idempotencyKey: string;
      requestHash: string;
    },
  ): Promise<{ operationId: string; expectedDeletedAt: Date | null } | undefined> {
    const rows = await tx.$queryRaw<Array<{ operationId: string; expectedDeletedAt: Date | null }>>`
      SELECT operation."id" AS "operationId", scope."expectedDeletedAt"
      FROM "ObjectStorageOperation" operation
      JOIN "ObjectStorageOperationProjectScope" scope ON scope."operationId" = operation."id"
      WHERE scope."projectIdSnapshot" = ${input.projectId}
        AND scope."expectedOrganizationId" = ${input.expectedOrganizationId}
        AND scope."ordinal" = 0
        AND operation."kind" = 'PROJECT_PERMANENT_DELETE'::"ObjectStorageOperationKind"
        AND operation."idempotencyKey" = ${input.idempotencyKey}
        AND operation."requestHash" = ${input.requestHash}
        AND operation."status" IN (
          'PREPARED'::"ObjectStorageOperationStatus",
          'EFFECT_STARTED'::"ObjectStorageOperationStatus",
          'VERIFYING'::"ObjectStorageOperationStatus",
          'MANUAL_RECOVERY'::"ObjectStorageOperationStatus"
        )
      LIMIT 1
    `;
    return rows[0];
  }

  private async lockExpectedProjectTenantMutation(
    tx: Prisma.TransactionClient,
    scope: ProjectPhysicalMutationScope,
    options: {
      allowActiveCheckpoint?: boolean;
      allowDeletedProject?: boolean;
      allowPermanentDeletion?: boolean;
      allowedObjectStorageOperationId?: string;
    } = {},
  ): Promise<void> {
    await this.accountPurge.assertProjectStorageMutable(tx, scope.projectId, scope.workspaceId);
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      objectStorageMutationAdvisoryKey(scope.projectId),
    );
    await lockProjectAfterPurgeTopology(tx, scope.projectId);

    const project = await tx.project.findUnique({
      where: { id: scope.projectId },
      select: { organizationId: true, deletedAt: true, permanentDeletionStartedAt: true },
    });

    if (
      !project ||
      (!options.allowDeletedProject && project.deletedAt) ||
      project.organizationId !== scope.expectedOrganizationId
    ) {
      throw projectOrganizationChangedError();
    }

    if (project.permanentDeletionStartedAt && !options.allowPermanentDeletion) {
      throw Object.assign(new Error(appPublicEnglish('GENERIC_REQUEST_FAILED')), {
        code: 'PROJECT_PERMANENT_DELETION_ACTIVE',
        statusCode: 409,
      });
    }

    await assertNoActiveObjectStorageOperation(tx, [scope.projectId], options.allowedObjectStorageOperationId);

    if (!options.allowActiveCheckpoint) {
      await assertNoActiveProjectReleaseBarrier(tx, scope.projectId);
    }
  }

  assertProjectStorageMutable(scope: ProjectPhysicalMutationScope) {
    return this.prisma.$transaction((tx) => this.lockExpectedProjectTenantMutation(tx, scope));
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

    /*
     * Active reference = lastActiveAt, falling back to createdAt for accounts
     * never touched. Both branches must be older than the cutoff.
     */
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
    return this.prisma.$transaction(async (tx) => {
      const subjectUserIds = [
        ...new Set([input.userId, input.impersonatedBy].filter((id): id is string => Boolean(id))),
      ].sort();
      await this.lockSessionPurgeSubjects(tx, subjectUserIds);
      await this.assertSessionSubjectsNotPurgeFenced(tx, subjectUserIds);

      return mapSession(
        await tx.session.create({
          data: {
            userId: input.userId,
            tokenHash: hashToken(input.token),
            expiresAt: input.expiresAt,
            lastActiveAt: new Date(),
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            impersonatedBy: input.impersonatedBy,
          },
        }),
      );
    });
  }

  private async lockSessionPurgeSubjects(tx: Prisma.TransactionClient, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);
    }
  }

  private async assertSessionSubjectsNotPurgeFenced(tx: Prisma.TransactionClient, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    const [plans, receipts, users] = await Promise.all([
      tx.purgePlan.count({ where: { userId: { in: userIds } } }),
      tx.purgeReceipt.count({ where: { userId: { in: userIds } } }),
      tx.user.findMany({ where: { id: { in: userIds } }, select: { preferences: true } }),
    ]);
    const hasPurgedAt = users.some((user) => {
      if (!user.preferences || typeof user.preferences !== 'object' || Array.isArray(user.preferences)) return false;
      const deletion = (user.preferences as Record<string, unknown>).accountDeletion;
      return (
        Boolean(deletion) &&
        typeof deletion === 'object' &&
        !Array.isArray(deletion) &&
        typeof (deletion as Record<string, unknown>).purgedAt === 'string'
      );
    });

    if (plans > 0 || receipts > 0 || hasPurgedAt) {
      throw Object.assign(new Error(appPublicEnglish('SESSION_ACCOUNT_PURGE_FENCED')), {
        code: 'SESSION_ACCOUNT_PURGE_FENCED',
        statusCode: 409,
      });
    }
  }

  async findSessionByToken(token: string) {
    const tokenHash = hashToken(token);
    const candidate = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: { userId: true, impersonatedBy: true },
    });

    if (!candidate) return undefined;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const subjectUserIds = [candidate.userId, candidate.impersonatedBy]
          .filter((id): id is string => Boolean(id))
          .filter((id, index, all) => all.indexOf(id) === index)
          .sort();
        await this.lockSessionPurgeSubjects(tx, subjectUserIds);
        await this.assertSessionSubjectsNotPurgeFenced(tx, subjectUserIds);

        /* The first read discovers the lock subject; only this locked re-read authorizes. */
        const session = await tx.session.findUnique({ where: { tokenHash } });

        if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
          return undefined;
        }

        /*
         * Token rows are immutable in normal flows, but delete+recreate must
         * not let a different target/impersonator borrow locks acquired for the
         * stale candidate. Refuse the rebinding; a later request may retry and
         * lock the newly observed subjects.
         */
        if (
          session.userId !== candidate.userId ||
          (session.impersonatedBy ?? null) !== (candidate.impersonatedBy ?? null)
        ) {
          return undefined;
        }

        const lastActiveMs = (session.lastActiveAt ?? session.createdAt).getTime();

        if (isSessionIdleExpired(lastActiveMs, Date.now(), sessionIdleTimeoutMs())) {
          return undefined;
        }

        return mapSession(session);
      });
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === 'SESSION_ACCOUNT_PURGE_FENCED') return undefined;
      throw error;
    }
  }

  async touchSession(sessionId: string, nowMs: number, throttleMs = 60_000): Promise<void> {
    /*
     * Refresh lastActiveAt at most once per throttle window: the WHERE only
     * matches when the stored value is stale (or null), so a burst of requests in
     * the same window is a single no-op update, not a write per request.
     */
    const now = new Date(nowMs);
    const staleBefore = new Date(nowMs - throttleMs);

    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
        OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: staleBefore } }],
      },
      data: { lastActiveAt: now },
    });
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

  async getLoginLockout(userId: string): Promise<LoginLockoutState | undefined> {
    const row = await this.prisma.accountLockout.findUnique({ where: { userId } });

    if (!row) {
      return undefined;
    }

    return {
      failedCount: row.failedCount,
      firstFailedAtMs: row.firstFailedAt ? row.firstFailedAt.getTime() : null,
      lockedUntilMs: row.lockedUntil ? row.lockedUntil.getTime() : null,
    };
  }

  async recordFailedLogin(userId: string, nowMs: number, config: LoginThrottleConfig): Promise<LoginLockoutState> {
    /*
     * Serialize per-user so two concurrent failed logins can't both read the same
     * count and clobber each other (lost update). The advisory lock makes the
     * read-compute-write atomic across pods, so N concurrent failures increment to
     * exactly N — the property the concurrency test proves against real Postgres.
     */
    return this.withSerializedMutation(`login-lockout:${userId}`, async () => {
      const current = (await this.getLoginLockout(userId)) ?? CLEARED_LOCKOUT;
      const next = nextStateOnFailure(current, nowMs, config);
      const data = {
        failedCount: next.failedCount,
        firstFailedAt: next.firstFailedAtMs === null ? null : new Date(next.firstFailedAtMs),
        lockedUntil: next.lockedUntilMs === null ? null : new Date(next.lockedUntilMs),
      };

      await this.prisma.accountLockout.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });

      return next;
    });
  }

  async clearLoginLockout(userId: string): Promise<void> {
    // deleteMany (not delete) so clearing an account that never failed is a no-op.
    await this.prisma.accountLockout.deleteMany({ where: { userId } });
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
    /*
     * Count deployments so callers (e.g. the IDE top bar) can show Publish vs
     * Republish without a second query; mapProject surfaces it as deploymentCount.
     */
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
    expectedOrganizationId: string;
    name?: string;
    description?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      return mapProject(
        await tx.project.update({
          where: { id: input.projectId },
          data: {
            name: input.name,
            description: input.description,
            gitRepositoryUrl: input.gitRepositoryUrl,
            gitDefaultBranch: input.gitDefaultBranch,
          },
        }),
      );
    });
  }

  async renameProjectSlug(input: {
    projectId: string;
    expectedOrganizationId: string;
    newSlug: string;
    redirectTtlDays?: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      const project = assertFound(
        await tx.project.findUnique({ where: { id: input.projectId } }),
        'Project not found',
        'PROJECT_NOT_FOUND',
      );

      /*
       * No-op rename: don't mint a self-redirect (it would loop the old→new URL
       * back onto itself) — just hand back the project unchanged.
       */
      if (project.slug === input.newSlug) {
        return mapProject(project);
      }

      /*
       * slug is only @@unique within an org, so a bare update would 500 on P2002.
       * Surface the clash as a typed 409 the route can translate into an inline
       * "slug already taken" message.
       */
      const clash = await tx.project.findFirst({
        where: { organizationId: project.organizationId, slug: input.newSlug, id: { not: project.id } },
        select: { id: true },
      });

      if (clash) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_SLUG_TAKEN')), {
          statusCode: 409,
          code: 'PROJECT_SLUG_TAKEN',
        });
      }

      const redirectNow = await databaseNow(tx);
      const expiresAt = new Date(redirectNow.getTime() + projectSlugRedirectTtlMs(input.redirectTtlDays));

      /*
       * Persist old → project redirect (upsert so a re-rename of the same old
       * slug just refreshes the 30-day window instead of P2002-ing).
       */
      await tx.projectSlugRedirect.upsert({
        where: { projectId_oldSlug: { projectId: project.id, oldSlug: project.slug } },
        create: { projectId: project.id, oldSlug: project.slug, expiresAt },
        update: { expiresAt },
      });

      /*
       * Renaming BACK to a slug this project previously redirected FROM would
       * leave a self-redirect (newSlug → this project) that bounces the fresh
       * canonical URL. Drop it.
       */
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

  async softDeleteProject(input: ProjectPhysicalMutationScope) {
    return this.withProjectPhysicalMutation(input, () =>
      this.prisma.$transaction(async (tx) => {
        await this.lockExpectedProjectTenantMutation(tx, input);
        await assertProjectReservedVmDecommissioned(tx, input.projectId);
        return mapProject(
          await tx.project.update({ where: { id: input.projectId }, data: { deletedAt: await databaseNow(tx) } }),
        );
      }),
    );
  }

  async restoreProject(input: ProjectPhysicalMutationScope) {
    return this.withProjectPhysicalBarrier(input.projectId, async () => {
      await this.prisma.$transaction((tx) =>
        this.lockExpectedProjectTenantMutation(tx, input, { allowDeletedProject: true }),
      );
      return this.withProjectFilesystemLock(input.projectId, () =>
        this.prisma.$transaction(async (tx) => {
          await this.lockExpectedProjectTenantMutation(tx, input, { allowDeletedProject: true });
          return mapProject(await tx.project.update({ where: { id: input.projectId }, data: { deletedAt: null } }));
        }),
      );
    });
  }

  private async assertProjectStaticErasureFrozen(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { permanentDeletionStartedAt: true },
    });
    if (!project?.permanentDeletionStartedAt) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_STATIC_ERASURE_AUTHORITY_UNAVAILABLE')), {
        code: 'PROJECT_STATIC_ERASURE_AUTHORITY_UNAVAILABLE',
        statusCode: 503,
      });
    }
  }

  async resolveProjectStaticErasureInventory(projectId: string): Promise<ProjectStaticErasureInventory> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertProjectStaticErasureFrozen(tx, projectId);

      const [deploymentRows, artifactRows] = await Promise.all([
        tx.$queryRaw<Array<{ deploymentId: string }>>`
          SELECT deployment."id" AS "deploymentId"
          FROM "Deployment" deployment
          WHERE deployment."projectId" = ${projectId}
            AND deployment."provider" = 'static'
          UNION
          SELECT manifest."deploymentId"
          FROM "ReleaseManifest" manifest
          WHERE manifest."projectId" = ${projectId}
            AND manifest."artifactKind" = 'static-snapshot'
          ORDER BY "deploymentId" ASC
        `,
        tx.$queryRaw<
          Array<{
            artifactRef: string;
            projectReferenceCount: number;
            otherReferenceCount: number;
          }>
        >`
          WITH owned AS (
            SELECT DISTINCT manifest."artifactRef"
            FROM "ReleaseManifest" manifest
            WHERE manifest."projectId" = ${projectId}
              AND manifest."artifactKind" = 'static-snapshot'
              AND manifest."artifactRef" ~ '^static-artifacts/sha256/[a-f0-9]{64}$'
          )
          SELECT
            manifest."artifactRef",
            (count(*) FILTER (WHERE manifest."projectId" = ${projectId}))::int AS "projectReferenceCount",
            (count(*) FILTER (WHERE manifest."projectId" <> ${projectId}))::int AS "otherReferenceCount"
          FROM "ReleaseManifest" manifest
          INNER JOIN owned ON owned."artifactRef" = manifest."artifactRef"
          WHERE manifest."artifactKind" = 'static-snapshot'
          GROUP BY manifest."artifactRef"
          ORDER BY manifest."artifactRef" ASC
        `,
      ]);

      return {
        projectId,
        deploymentIds: deploymentRows.map((row) => row.deploymentId),
        artifacts: artifactRows,
      };
    });
  }

  async resolveProjectStaticArtifactAuthority(
    projectId: string,
    artifactRef: string,
  ): Promise<ProjectStaticArtifactAuthority | undefined> {
    if (!/^static-artifacts\/sha256\/[a-f0-9]{64}$/u.test(artifactRef)) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_STATIC_ERASURE_ARTIFACT_REF_INVALID')), {
        code: 'PROJECT_STATIC_ERASURE_ARTIFACT_REF_INVALID',
        statusCode: 400,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertProjectStaticErasureFrozen(tx, projectId);
      const rows = await tx.$queryRaw<
        Array<{
          artifactRef: string;
          projectReferenceCount: number;
          otherReferenceCount: number;
        }>
      >`
        SELECT
          manifest."artifactRef",
          (count(*) FILTER (WHERE manifest."projectId" = ${projectId}))::int AS "projectReferenceCount",
          (count(*) FILTER (WHERE manifest."projectId" <> ${projectId}))::int AS "otherReferenceCount"
        FROM "ReleaseManifest" manifest
        WHERE manifest."artifactKind" = 'static-snapshot'
          AND manifest."artifactRef" = ${artifactRef}
        GROUP BY manifest."artifactRef"
        HAVING count(*) FILTER (WHERE manifest."projectId" = ${projectId}) > 0
      `;
      return rows[0];
    });
  }

  async getProjectPermanentDeletionReceiptIdentity(projectId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        projectId: string;
        organizationId: string;
        idempotencyKey: string;
        requestHash: string;
        expectedProjectNameHash: string;
      }>
    >`SELECT r."projectId", r."organizationId", r."idempotencyKey", r."requestHash",
             o."payload"->>'expectedProjectNameHash' AS "expectedProjectNameHash"
        FROM "ProjectPermanentDeletionReceipt" r
        JOIN "ObjectStorageOperation" o ON o."id" = r."operationId"
        WHERE r."projectId" = ${projectId}`;

    const identity = rows[0];
    if (identity && !/^[0-9a-f]{64}$/.test(identity.expectedProjectNameHash)) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_PERMANENT_DELETION_RECEIPT_CORRUPT')), {
        code: 'PROJECT_PERMANENT_DELETION_RECEIPT_CORRUPT',
        statusCode: 500,
      });
    }
    return identity;
  }

  async replayProjectPermanentDeletion(input: {
    projectId: string;
    expectedOrganizationId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<ProjectPermanentDeletionResult | undefined> {
    const replay = await this.prisma.$transaction((tx) => getPermanentDeletionReplay(tx, input));
    return replay
      ? mapPermanentDeletionReplay(replay, {
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          replayed: true,
        })
      : undefined;
  }

  async hardDeleteProject(
    input: ProjectPhysicalMutationScope & {
      expectedProjectName: string;
      idempotencyKey: string;
      requestHash: string;
      actorUserId: string;
      ipAddress?: string;
      preflightPhysicalErasure: () => Promise<ObjectStorageStaticErasurePlan>;
      erasePhysical: (assertLease: () => Promise<void>, lease: ObjectStorageOperationLease) => Promise<void>;
      verifyPhysicalAbsence: (
        assertLease: () => Promise<void>,
        lease: ObjectStorageOperationLease,
      ) => Promise<ObjectStorageVerification>;
    },
  ): Promise<ProjectPermanentDeletionResult> {
    const operationRequest = projectPermanentDeletionOperationRequest({
      projectId: input.projectId,
      organizationId: input.expectedOrganizationId,
      actorUserId: input.actorUserId,
      expectedProjectName: input.expectedProjectName,
    });
    const requestHash = projectPermanentDeletionRequestHash({
      projectId: input.projectId,
      organizationId: input.expectedOrganizationId,
      actorUserId: input.actorUserId,
      expectedProjectName: input.expectedProjectName,
    });

    if (requestHash !== input.requestHash) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_PERMANENT_DELETION_REQUEST_HASH_MISMATCH')), {
        code: 'PROJECT_PERMANENT_DELETION_REQUEST_HASH_MISMATCH',
        statusCode: 409,
      });
    }

    return this.withStaticArtifactErasureProjectBarrier(input.projectId, async () => {
      /* Reject a stale tenant before waiting on NFS, but allow an idempotent retry. */
      await this.prisma.$transaction(async (tx) => {
        const allowedObjectStorageOperationId = await this.matchingActiveObjectStorageOperationId(tx, {
          projectId: input.projectId,
          expectedOrganizationId: input.expectedOrganizationId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
        });
        await this.lockExpectedProjectTenantMutation(tx, input, {
          allowDeletedProject: true,
          allowPermanentDeletion: true,
          allowedObjectStorageOperationId,
        });
        await assertProjectReservedVmDecommissioned(tx, input.projectId);
        await this.assertNoActiveRemixSourceShare(tx, input.projectId);
      });

      return this.withProjectFilesystemLock(input.projectId, async () => {
        const { current, expectedDeletedAt } = await this.prisma.$transaction(async (tx) => {
          const matchingOperation = await this.matchingPermanentDeletionScope(tx, {
            projectId: input.projectId,
            expectedOrganizationId: input.expectedOrganizationId,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
          });
          await this.lockExpectedProjectTenantMutation(tx, input, {
            allowDeletedProject: true,
            allowPermanentDeletion: true,
            allowedObjectStorageOperationId: matchingOperation?.operationId,
          });
          await assertProjectReservedVmDecommissioned(tx, input.projectId);
          await this.assertNoActiveRemixSourceShare(tx, input.projectId);
          const current = await tx.project.findUniqueOrThrow({ where: { id: input.projectId } });
          return {
            current,
            /*
             * A first claim snapshots the caller-observed soft-delete state and
             * then installs its irreversible deletion fence. A response-loss
             * retry must replay that original scope; feeding the newly installed
             * deletedAt back into claim would turn the same key/body into a false
             * idempotency conflict before VERIFY_FIRST can inspect the effect.
             */
            expectedDeletedAt: matchingOperation ? matchingOperation.expectedDeletedAt : current.deletedAt,
          };
        });

        if (current.name !== input.expectedProjectName) {
          throw Object.assign(new Error(appPublicEnglish('PROJECT_NAME_MISMATCH')), {
            code: 'PROJECT_NAME_MISMATCH',
            statusCode: 409,
          });
        }

        const ownerToken = `project-permanent-delete:${randomUUID()}`;
        let claimed = await this.prisma.$transaction((tx) =>
          claimObjectStorageOperation(tx, {
            ...operationRequest,
            scopes: [
              {
                projectId: input.projectId,
                expectedOrganizationId: input.expectedOrganizationId,
                expectedDeletedAt: expectedDeletedAt?.toISOString() ?? null,
              },
            ],
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            ownerToken,
            leaseTtlSeconds: OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS,
          }),
        );

        if (claimed.kind === 'REPLAY') {
          const replayed = await this.replayProjectPermanentDeletion({
            projectId: input.projectId,
            expectedOrganizationId: input.expectedOrganizationId,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
          });
          if (!replayed) throw new Error(appPublicEnglish('PROJECT_PERMANENT_DELETION_RECEIPT_MISSING'));
          return replayed;
        }
        if (claimed.kind === 'BUSY') {
          throw Object.assign(new Error(appPublicEnglish('PROJECT_PERMANENT_DELETION_IN_PROGRESS')), {
            code: 'PROJECT_PERMANENT_DELETION_IN_PROGRESS',
            statusCode: 409,
            retryAt: claimed.retryAt,
          });
        }
        if (claimed.kind === 'MANUAL_RECOVERY') {
          throw Object.assign(new Error(appPublicEnglish('PROJECT_PERMANENT_DELETION_MANUAL_RECOVERY')), {
            code: 'PROJECT_PERMANENT_DELETION_MANUAL_RECOVERY',
            statusCode: 409,
          });
        }

        let recoveryVerificationOnly = claimed.kind === 'VERIFY_FIRST';
        if (claimed.kind === 'VERIFY_FIRST') {
          claimed = await this.prisma.$transaction((tx) =>
            reclaimObjectStorageOperationForVerification(tx, {
              operationId: claimed.operation.id,
              requestHash: input.requestHash,
              scopeHash: claimed.operation.scopeHash,
              ownerToken,
              leaseTtlSeconds: OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS,
            }),
          );

          if (claimed.kind === 'REPLAY') {
            const replayed = await this.replayProjectPermanentDeletion({
              projectId: input.projectId,
              expectedOrganizationId: input.expectedOrganizationId,
              idempotencyKey: input.idempotencyKey,
              requestHash: input.requestHash,
            });
            if (!replayed) throw new Error(appPublicEnglish('PROJECT_PERMANENT_DELETION_RECEIPT_MISSING'));
            return replayed;
          }
          if (claimed.kind === 'BUSY') {
            throw Object.assign(new Error(appPublicEnglish('PROJECT_PERMANENT_DELETION_IN_PROGRESS')), {
              code: 'PROJECT_PERMANENT_DELETION_IN_PROGRESS',
              statusCode: 409,
              retryAt: claimed.retryAt,
            });
          }
          if (claimed.kind === 'MANUAL_RECOVERY') {
            throw Object.assign(new Error(appPublicEnglish('PROJECT_PERMANENT_DELETION_MANUAL_RECOVERY')), {
              code: 'PROJECT_PERMANENT_DELETION_MANUAL_RECOVERY',
              statusCode: 409,
            });
          }
        }

        const heartbeat = this.objectStorageOperationHeartbeat(claimed.lease);

        try {
          if (!recoveryVerificationOnly) {
            let runtimePreflight: { inFlightEffectIds: string[] };
            try {
              runtimePreflight = await this.prisma.$transaction(async (tx) => {
                await assertObjectStorageOperationFence(tx, heartbeat.lease());
                const projects = await tx.$queryRaw<Array<{ organizationId: string; ownershipEpoch: number }>>`
                  SELECT "organizationId", "ownershipEpoch"
                  FROM "Project"
                  WHERE "id" = ${input.projectId}
                    AND "permanentDeletionStartedAt" IS NOT NULL
                  FOR UPDATE
                `;
                if (projects[0]?.organizationId !== input.expectedOrganizationId) {
                  throw Object.assign(new Error(appPublicEnglish('GENERIC_REQUEST_FAILED')), {
                    code: 'PROJECT_RUNTIME_EFFECT_SCOPE_INVALID',
                    statusCode: 409,
                  });
                }
                const effects = await tx.$queryRaw<Array<{ id: string; ownershipEpoch: number; state: string }>>`
                  SELECT "id", "ownershipEpoch", "state"::text AS "state"
                  FROM "ProjectRuntimeEffect"
                  WHERE "projectId" = ${input.projectId}
                  ORDER BY "id"
                  FOR UPDATE
                `;
                if (effects.some(({ ownershipEpoch }) => ownershipEpoch > projects[0]!.ownershipEpoch)) {
                  throw Object.assign(new Error(appPublicEnglish('GENERIC_REQUEST_FAILED')), {
                    code: 'PROJECT_RUNTIME_EFFECT_SCOPE_INVALID',
                    statusCode: 409,
                  });
                }
                await tx.$executeRaw(Prisma.sql`
                  UPDATE "ProjectRuntimeEffect"
                  SET "state" = 'ABORTED'::"ProjectRuntimeEffectState",
                      "ownerToken" = NULL,
                      "leaseExpiresAt" = NULL,
                      "lastErrorCode" = 'PROJECT_RUNTIME_EFFECT_NOT_DISPATCHED',
                      "abortedAt" = clock_timestamp(),
                      "updatedAt" = clock_timestamp()
                  WHERE "projectId" = ${input.projectId}
                    AND "state" = 'PREPARED'::"ProjectRuntimeEffectState"
                `);
                return {
                  inFlightEffectIds: effects.filter(({ state }) => state === 'IN_FLIGHT').map(({ id }) => id),
                };
              });
            } catch (error) {
              /* A failed ledger read is not proof that no request reached the
               * provider. Preserve the permanent-deletion freeze and quarantine
               * instead of routing through FAILED_SAFE, which would re-enable
               * project writes. */
              await this.prisma
                .$transaction((tx) =>
                  markPermanentDeletionRuntimeEffectAmbiguous(tx, heartbeat.lease(), {
                    error,
                    errorCode: 'PROJECT_RUNTIME_EFFECT_AUTHORITY_UNAVAILABLE',
                  }),
                )
                .catch(() => undefined);
              throw error;
            }
            if (runtimePreflight.inFlightEffectIds.length > 0) {
              const error = Object.assign(new Error(appPublicEnglish('GENERIC_REQUEST_FAILED')), {
                code: 'PROJECT_RUNTIME_EFFECT_IN_FLIGHT',
                statusCode: 409,
                effectIds: runtimePreflight.inFlightEffectIds,
              });
              await this.prisma.$transaction((tx) =>
                markPermanentDeletionRuntimeEffectAmbiguous(tx, heartbeat.lease(), {
                  effectIds: runtimePreflight.inFlightEffectIds,
                  error,
                }),
              );
              throw error;
            }

            try {
              const staticArtifactPlan = await input.preflightPhysicalErasure();
              await heartbeat.assert();
              await this.prisma.$transaction((tx) =>
                recordPermanentDeletionStaticArtifactPlan(tx, heartbeat.lease(), staticArtifactPlan),
              );
            } catch (error) {
              const errorCode = this.objectStorageRecoveryErrorCode(error);
              await this.prisma.$transaction((tx) =>
                markObjectStorageOperationFailedSafe(tx, heartbeat.lease(), {
                  errorCode,
                  error,
                }),
              );
              throw error;
            }
            await this.prisma.$transaction((tx) =>
              markObjectStorageOperationEffectStarted(tx, heartbeat.lease(), {
                command: 'project-permanent-delete',
              }),
            );
            await input.erasePhysical(heartbeat.assert, heartbeat.lease());
            await heartbeat.assert();
            await this.prisma.$transaction((tx) =>
              beginObjectStorageOperationVerification(tx, heartbeat.lease(), {
                command: 'project-permanent-delete-verify',
              }),
            );
          }

          let proof: ObjectStorageVerification;
          try {
            proof = await input.verifyPhysicalAbsence(heartbeat.assert, heartbeat.lease());
          } catch (error) {
            if (recoveryVerificationOnly) {
              await this.prisma.$transaction((tx) =>
                markObjectStorageOperationManualRecovery(tx, heartbeat.lease(), {
                  errorCode: 'PROJECT_PERMANENT_DELETION_VERIFICATION_AMBIGUOUS',
                  error,
                  evidence: { verificationAttempted: true },
                }),
              );
            }
            throw error;
          }

          await heartbeat.assert();
          await heartbeat.stop();

          const replay = await this.prisma.$transaction(async (tx) => {
            await finalizeObjectStorageOperation(tx, heartbeat.lease(), { verification: proof });
            await tx.auditLog.create({
              data: {
                organizationId: input.expectedOrganizationId,
                actorUserId: input.actorUserId,
                action: 'project.hard_delete',
                resourceType: 'project',
                resourceId: input.projectId,
                metadata: redactAuditMetadata({
                  name: input.expectedProjectName,
                  operationId: heartbeat.lease().operationId,
                  idempotencyKey: input.idempotencyKey,
                }) as Prisma.InputJsonValue,
                ipAddress: input.ipAddress,
              },
            });
            return getPermanentDeletionReplay(tx, {
              projectId: input.projectId,
              expectedOrganizationId: input.expectedOrganizationId,
              idempotencyKey: input.idempotencyKey,
              requestHash: input.requestHash,
            });
          });

          if (!replay) throw new Error(appPublicEnglish('PROJECT_PERMANENT_DELETION_RECEIPT_MISSING'));
          return mapPermanentDeletionReplay(replay, {
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            replayed: false,
          });
        } finally {
          await heartbeat.stop().catch(() => undefined);
        }
      });
    });
  }

  async transferProject(input: {
    projectId: string;
    expectedOrganizationId: string;
    targetOrganizationId: string;
    actorUserId?: string;
    assertExternalStorageDetached: () => Promise<void>;
    validateTargetAdmission: () => Promise<void>;
  }) {
    const physicalScope = {
      projectId: input.projectId,
      expectedOrganizationId: input.expectedOrganizationId,
    };

    return this.withProjectPhysicalMutation(physicalScope, async () => {
      const current = assertFound(
        await this.prisma.project.findUnique({ where: { id: input.projectId } }),
        'Project not found',
        'PROJECT_NOT_FOUND',
      );

      if (current.organizationId !== input.expectedOrganizationId) {
        throw projectOrganizationChangedError();
      }

      if (current.organizationId === input.targetOrganizationId) {
        return mapProject(current);
      }

      const operationRequest = {
        kind: 'PROJECT_TRANSFER' as const,
        scopes: [
          {
            projectId: input.projectId,
            expectedOrganizationId: input.expectedOrganizationId,
          },
        ],
        payload: {
          command: 'project-transfer',
          sourceOrganizationId: input.expectedOrganizationId,
          targetOrganizationId: input.targetOrganizationId,
        },
        preconditions: {
          tenantMustMatch: true,
          providerBucketMustBeAbsent: true,
          capabilityMustBeExpired: true,
        },
      };
      const requestHash = objectStorageRequestHash(operationRequest);
      const claimed = await this.prisma.$transaction((tx) =>
        claimObjectStorageOperation(tx, {
          ...operationRequest,
          idempotencyKey: `project-transfer:${input.expectedOrganizationId}:${input.targetOrganizationId}`,
          requestHash,
          ownerToken: `project-transfer:${randomUUID()}`,
          leaseTtlSeconds: OBJECT_STORAGE_OPERATION_LEASE_TTL_SECONDS,
        }),
      );
      if (claimed.kind !== 'ACQUIRED') {
        const retryAt = claimed.kind === 'BUSY' ? claimed.retryAt : undefined;
        throw Object.assign(new Error(appPublicEnglish('PROJECT_TRANSFER_OPERATION_UNAVAILABLE')), {
          code: 'PROJECT_TRANSFER_OPERATION_UNAVAILABLE',
          statusCode: 409,
          ...(retryAt ? { retryAt } : {}),
        });
      }
      const heartbeat = this.objectStorageOperationHeartbeat(claimed.lease);

      /*
       * Provider I/O must never run inside the topology/object-storage database
       * transaction. The physical + NFS barriers remain held across this probe,
       * so no tenant-scoped issuer or mutation can race it. The transaction
       * below then re-locks and revalidates tenant/capability state immediately
       * before committing the ownership change.
       */
      try {
        await input.assertExternalStorageDetached();

        return await this.withSerializedMutation(`projects:${input.targetOrganizationId}`, async () => {
          await input.validateTargetAdmission();

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
                /*
                 * The wrapper owns shared purge topology -> object storage ->
                 * checkpoint -> Project. Physical + NFS remain held from the external
                 * preflight through this ownership commit.
                 */
                await assertAccountPurgeMutationAllowed(tx, { organizationIds: [input.targetOrganizationId] });
                await lockProjectAfterPurgeTopology(tx, input.projectId);

                const locked = assertFound(
                  await tx.project.findUnique({ where: { id: input.projectId } }),
                  'Project not found',
                  'PROJECT_NOT_FOUND',
                );

                if (locked.organizationId === input.targetOrganizationId) {
                  return mapProject(locked);
                }

                const transferNow = await databaseNow(tx);

                if (locked.objectStorageCapabilityExpiresAt && locked.objectStorageCapabilityExpiresAt > transferNow) {
                  throw Object.assign(
                    new Error(appPublicEnglish('PROJECT_TRANSFER_OBJECT_STORAGE_CAPABILITY_ACTIVE')),
                    {
                      code: 'PROJECT_TRANSFER_OBJECT_STORAGE_CAPABILITY_ACTIVE',
                      statusCode: 409,
                    },
                  );
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
                  activeWorkspaceCount,
                  retainedWorkspaceRuntimeCount,
                  deploymentCount,
                  releaseManifestCount,
                  nonTerminalReservedVmOperationCount,
                  activeReservedVmBillingPeriodCount,
                  nonTerminalCheckpointCount,
                  projectTemplateCount,
                  aiConversationCount,
                  activeRuntimeEffectCount,
                ] = await Promise.all([
                  tx.databaseInstance.count({ where: { projectId: input.projectId, status: { not: 'DELETED' } } }),
                  tx.cloudProjectBinding.count({ where: { projectId: input.projectId } }),
                  tx.dBMigrationExecution.count({
                    where: {
                      projectId: input.projectId,
                      /*
                       * Fail closed for future states too. MANUAL_RECOVERY is
                       * deliberately not terminal-safe: the production schema may
                       * still need operator repair under the source tenant.
                       */
                      state: { notIn: ['COMMITTED', 'FAILED_SAFE'] },
                    },
                  }),
                  tx.importJob.count({
                    where: {
                      targetProjectId: input.projectId,
                      /* ROLLING_BACK/CLEANUP_PENDING still own and mutate the target. */
                      state: { notIn: ['COMMITTED', 'EXPIRED', 'CANCELLED', 'FAILED'] },
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
                  tx.workspace.count({
                    where: { projectId: input.projectId, status: { in: ['PENDING', 'STARTING', 'RUNNING'] } },
                  }),
                  /* STOPPED/FAILED runtimes still retain source-tenant PVC/data authority. */
                  tx.workspaceRuntime.count({
                    where: { projectId: input.projectId, status: { not: 'DELETED' } },
                  }),
                  /* Every row retains source-tenant logs, policy and late-callback authority. */
                  tx.deployment.count({ where: { projectId: input.projectId } }),
                  tx.releaseManifest.count({ where: { projectId: input.projectId } }),
                  tx.reservedVmOperation.count({
                    where: { projectId: input.projectId, status: { notIn: ['COMPLETED', 'FAILED'] } },
                  }),
                  tx.reservedVmBillingPeriod.count({
                    where: { projectId: input.projectId, status: { not: 'CANCELED' } },
                  }),
                  tx.projectCheckpoint.count({
                    where: {
                      projectId: input.projectId,
                      OR: [
                        { state: { notIn: ['COMMITTED', 'CLEANED', 'MANUAL_INTERVENTION', 'RELEASE_BARRIER'] } },
                        {
                          state: 'RELEASE_BARRIER',
                          OR: [{ barrierExpiresAt: null }, { barrierExpiresAt: { gt: transferNow } }],
                        },
                      ],
                    },
                  }),
                  tx.projectTemplate.count({ where: { sourceProjectId: input.projectId } }),
                  tx.aiConversation.count({ where: { projectId: input.projectId } }),
                  tx.projectRuntimeEffect.count({
                    where: { projectId: input.projectId, state: { in: ['PREPARED', 'IN_FLIGHT'] } },
                  }),
                ]);

                if (
                  managedDatabaseCount +
                    cloudBindingCount +
                    activeMigrationCount +
                    activeImportCount +
                    activeRemixCount +
                    activeStorageShareCount +
                    activeWorkspaceCount +
                    retainedWorkspaceRuntimeCount +
                    deploymentCount +
                    releaseManifestCount +
                    nonTerminalReservedVmOperationCount +
                    activeReservedVmBillingPeriodCount +
                    nonTerminalCheckpointCount +
                    projectTemplateCount +
                    aiConversationCount +
                    activeRuntimeEffectCount >
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

                await markObjectStorageOperationEffectStarted(tx, heartbeat.lease(), {
                  command: 'project-transfer-commit',
                  targetOrganizationId: input.targetOrganizationId,
                });
                await beginObjectStorageOperationVerification(tx, heartbeat.lease(), {
                  providerBucketAbsent: true,
                });
                await finalizeObjectStorageOperation(tx, heartbeat.lease(), {
                  verification: {
                    outcome: 'VERIFIED_ABSENT',
                    verifier: 'api-project-transfer-v1',
                    evidence: {
                      providerBucketAbsent: true,
                      capabilityUpperBoundExpired: true,
                    },
                  },
                  result: {
                    projectId: input.projectId,
                    sourceOrganizationId: input.expectedOrganizationId,
                    targetOrganizationId: input.targetOrganizationId,
                  },
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

                /* Presence is source-tenant PII; never expose stale sessions to the target tenant. */
                await tx.collaborationPresence.deleteMany({ where: { projectId: input.projectId } });

                const ideState = await tx.projectIdeState.findUnique({ where: { projectId: input.projectId } });
                if (ideState) {
                  await tx.projectIdeState.update({
                    where: { projectId: input.projectId },
                    data: {
                      state: clearTenantScopedIdeCapabilities(ideState.state) as Prisma.InputJsonValue,
                      version: { increment: 1 },
                    },
                  });
                }

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

                /* Only terminal runtime tombstones can reach this point: every
                 * live/failed/stopped runtime is denied above. Rebind their
                 * tenant snapshot atomically so a later permanent-delete under
                 * the new owner can consume the exact recovery identities. */
                await tx.workspaceRuntime.updateMany({
                  where: { projectId: input.projectId, status: 'DELETED' },
                  data: { orgId: input.targetOrganizationId },
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
      } catch (error) {
        await this.prisma
          .$transaction((tx) =>
            markObjectStorageOperationFailedSafe(tx, heartbeat.lease(), {
              errorCode: 'PROJECT_TRANSFER_ABORTED_BEFORE_COMMIT',
              error,
            }),
          )
          .catch(() => undefined);
        throw error;
      } finally {
        await heartbeat.stop().catch(() => undefined);
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
    expectedSourceOrganizationId: string;
    organizationId: string;
    name: string;
    description?: string;
  }) {
    if (input.organizationId !== input.expectedSourceOrganizationId) {
      throw projectOrganizationChangedError();
    }

    const template = await this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, {
        projectId: input.sourceProjectId,
        expectedOrganizationId: input.expectedSourceOrganizationId,
      });

      return tx.projectTemplate.create({
        data: {
          sourceProjectId: input.sourceProjectId,
          organizationId: input.organizationId,
          name: input.name,
          description: input.description,
        },
      });
    });
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

  async upsertProjectEnvVar(input: {
    projectId: string;
    expectedOrganizationId: string;
    key: string;
    value: string;
    scope?: EnvVarScope;
  }) {
    // Omitted scope defaults to production so pre-scope callers keep the same row.
    const scope = input.scope ?? DEFAULT_ENV_VAR_SCOPE;

    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      return mapEnvVar(
        await tx.projectEnvVar.upsert({
          where: { projectId_key_scope: { projectId: input.projectId, key: input.key, scope } },
          create: { projectId: input.projectId, key: input.key, value: input.value, scope },
          update: { value: input.value },
        }),
      );
    });
  }

  async listProjectEnvVars(projectId: string) {
    return (await this.prisma.projectEnvVar.findMany({ where: { projectId } })).map(mapEnvVar);
  }

  async deleteProjectEnvVar(input: {
    projectId: string;
    expectedOrganizationId: string;
    key: string;
    scope?: EnvVarScope;
  }) {
    // Omitted scope targets the production-scoped row (the pre-scope default).
    const targetScope = input.scope ?? DEFAULT_ENV_VAR_SCOPE;

    /*
     * find-then-delete raced a concurrent delete into an unhandled P2025; read
     * the row, then deleteMany (count-gated) so a lost race is "already gone".
     */
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      const existing = await tx.projectEnvVar.findUnique({
        where: {
          projectId_key_scope: { projectId: input.projectId, key: input.key, scope: targetScope },
        },
      });

      if (!existing) return undefined;

      const deleted = await tx.projectEnvVar.deleteMany({
        where: { projectId: input.projectId, key: input.key, scope: targetScope },
      });
      return deleted.count > 0 ? mapEnvVar(existing) : undefined;
    });
  }

  async upsertProjectSecret(input: {
    projectId: string;
    expectedOrganizationId: string;
    key: string;
    valueEncrypted: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      return mapSecret(
        await tx.projectSecret.upsert({
          where: { projectId_key: { projectId: input.projectId, key: input.key } },
          create: {
            projectId: input.projectId,
            key: input.key,
            valueEncrypted: input.valueEncrypted,
            valueHash: hashToken(input.valueEncrypted),
          },
          update: { valueEncrypted: input.valueEncrypted, valueHash: hashToken(input.valueEncrypted) },
        }),
      );
    });
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

    if (!now) {
      throw new Error(appPublicEnglish('DATABASE_TIME_UNAVAILABLE'));
    }

    return now.toISOString();
  }

  async createProjectCheckpoint(input: {
    projectId: string;
    expectedOrganizationId: string;
    createdByUserId?: string;
    idempotencyKey?: string;
    requestHash?: string;
  }) {
    const requestHash = input.requestHash ?? hashToken(`project-checkpoint:${input.projectId}`);

    return this.prisma.$transaction(async (tx) => {
      /* Tenant revalidation precedes even an idempotent replay. */
      await this.lockExpectedProjectTenantMutation(tx, input);

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
    const scope = await this.prisma.projectCheckpoint.findUnique({
      where: { id: input.checkpointId },
      select: { projectId: true, createdByUserId: true },
    });
    if (!scope) return undefined;

    return this.withProjectPhysicalBarrier(input.projectId, () =>
      this.withProjectFilesystemLock(input.projectId, () =>
        this.prisma.$transaction(async (tx) => {
          await assertAccountPurgeMutationAllowed(tx, {
            userIds: [scope.createdByUserId],
            projectIds: [scope.projectId, input.projectId],
          });
          await lockProjectAfterPurgeTopology(tx, input.projectId);

          /*
           * Expiry is a durable fail-open thaw. Clear a dead singleton while the
           * same project lock is held so only one successor can take ownership.
           */
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
        }),
      ),
    );
  }

  async renewProjectCheckpointBarrier(input: {
    checkpointId: string;
    ownerToken: string;
    fence: number;
    ttlSeconds: number;
  }) {
    const scope = await this.prisma.projectCheckpoint.findUnique({
      where: { id: input.checkpointId },
      select: { projectId: true, createdByUserId: true },
    });
    if (!scope) return undefined;

    const rows = await this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope.createdByUserId],
        projectIds: [scope.projectId],
      });
      return tx.$queryRaw<Array<{ barrierExpiresAt: Date }>>`
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
    });

    return rows[0]?.barrierExpiresAt.toISOString();
  }

  async assertProjectCheckpointBarrier(input: { checkpointId: string; ownerToken: string; fence: number }) {
    const scope = await this.prisma.projectCheckpoint.findUnique({
      where: { id: input.checkpointId },
      select: { projectId: true, createdByUserId: true },
    });
    const rows = scope
      ? await this.prisma.$transaction(async (tx) => {
          await assertAccountPurgeMutationAllowed(tx, {
            userIds: [scope.createdByUserId],
            projectIds: [scope.projectId],
          });
          return tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "ProjectCheckpoint"
            WHERE "id" = ${input.checkpointId}
              AND "barrierProjectId" = "projectId"
              AND "barrierOwnerToken" = ${input.ownerToken}
              AND "barrierFence" = ${input.fence}
              AND "barrierExpiresAt" > clock_timestamp()
          `;
        })
      : [];

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
    const scope = await this.prisma.projectCheckpoint.findUnique({
      where: { id: input.checkpointId },
      select: { projectId: true, createdByUserId: true },
    });

    if (input.to === 'COMMITTED') {
      const manifest = JSON.stringify(input.patch?.manifest ?? null);

      const rows = await this.prisma.$transaction(async (tx) => {
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [scope?.createdByUserId],
          projectIds: [scope?.projectId],
        });
        return tx.$queryRaw<Array<{ id: string }>>`
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
      });

      if (!rows[0]) {
        throw Object.assign(new Error(appPublicEnglish('CHECKPOINT_BARRIER_LOST')), {
          statusCode: 409,
          code: 'CHECKPOINT_BARRIER_LOST',
        });
      }

      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.createdByUserId],
        projectIds: [scope?.projectId],
      });
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

  async acquireProjectReleaseBarrier(input: {
    projectId: string;
    expectedOrganizationId: string;
    expectedManifestDigest: string;
    operationId: string;
    ownerToken: string;
    ttlSeconds: number;
  }): Promise<ProjectReleaseBarrierLease | undefined> {
    if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 10 || input.ttlSeconds > 300) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_RELEASE_BARRIER_TTL_INVALID')), {
        code: 'PROJECT_RELEASE_BARRIER_TTL_INVALID',
        statusCode: 400,
      });
    }

    return this.withProjectPhysicalBarrier(input.projectId, () =>
      this.withProjectFilesystemLock(input.projectId, () =>
        this.prisma.$transaction(async (tx) => {
          await this.accountPurge.assertProjectMutable(tx, input.projectId);
          await lockProjectMutation(tx, input.projectId);

          const project = await tx.project.findUnique({
            where: { id: input.projectId },
            select: { organizationId: true },
          });

          if (!project) {
            throw Object.assign(new Error(appPublicEnglish('PROJECT_NOT_FOUND')), {
              code: 'PROJECT_NOT_FOUND',
              statusCode: 404,
            });
          }

          if (project.organizationId !== input.expectedOrganizationId) {
            throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_BEFORE_RELEASE')), {
              code: 'PROJECT_ORGANIZATION_CHANGED_DURING_RELEASE',
              statusCode: 409,
            });
          }

          const manifest = await tx.projectManifestRevision.findFirst({
            where: { projectId: input.projectId },
            orderBy: { manifestVersion: 'desc' },
            select: { digest: true },
          });

          if (!manifest || manifest.digest !== input.expectedManifestDigest) {
            throw Object.assign(new Error(appPublicEnglish('PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH')), {
              code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH',
              statusCode: 409,
            });
          }

          /*
           * Expired checkpoint barriers thaw in place; expired release-only rows
           * are disposable. Both operations run under the same project lock before
           * the unique barrierProjectId insert.
           */
          await tx.$executeRaw`
        UPDATE "ProjectCheckpoint"
        SET "barrierProjectId" = NULL,
            "barrierOwnerToken" = NULL,
            "barrierExpiresAt" = NULL,
            "barrierFence" = "barrierFence" + 1,
            "updatedAt" = clock_timestamp()
        WHERE "projectId" = ${input.projectId}
          AND "state" <> 'RELEASE_BARRIER'
          AND "barrierProjectId" = ${input.projectId}
          AND "barrierExpiresAt" <= clock_timestamp()
      `;
          await tx.$executeRaw`
        DELETE FROM "ProjectCheckpoint"
        WHERE "projectId" = ${input.projectId}
          AND "state" = 'RELEASE_BARRIER'
          AND "barrierExpiresAt" <= clock_timestamp()
      `;

          const checkpointId = `release_barrier_${randomUUID()}`;
          const barrierId = `release:${input.operationId}`;
          const rows = await tx.$queryRaw<
            Array<{ id: string; logicalBarrierId: string; barrierFence: number; barrierExpiresAt: Date }>
          >`
        INSERT INTO "ProjectCheckpoint" (
          "id", "projectId", "state", "logicalBarrierId", "requestHash",
          "barrierProjectId", "barrierOwnerToken", "barrierFence",
          "barrierExpiresAt", "createdAt", "updatedAt"
        )
        SELECT
          ${checkpointId}, ${input.projectId}, 'RELEASE_BARRIER', ${barrierId},
          ${hashToken(
            `${input.projectId}:${input.expectedOrganizationId}:${input.expectedManifestDigest}:${input.operationId}`,
          )},
          ${input.projectId}, ${input.ownerToken}, 1,
          clock_timestamp() + make_interval(secs => ${input.ttlSeconds}),
          clock_timestamp(), clock_timestamp()
        WHERE NOT EXISTS (
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
                projectId: input.projectId,
                barrierId: row.logicalBarrierId,
                ownerToken: input.ownerToken,
                fence: row.barrierFence,
                expiresAt: row.barrierExpiresAt.toISOString(),
              }
            : undefined;
        }),
      ),
    );
  }

  async assertProjectReleaseBarrier(input: {
    checkpointId: string;
    projectId: string;
    expectedOrganizationId: string;
    expectedManifestDigest: string;
    ownerToken: string;
    fence: number;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertProjectMutable(tx, input.projectId);
      await lockProjectMutation(tx, input.projectId);

      const [project, manifest, lease] = await Promise.all([
        tx.project.findUnique({ where: { id: input.projectId }, select: { organizationId: true } }),
        tx.projectManifestRevision.findFirst({
          where: { projectId: input.projectId },
          orderBy: { manifestVersion: 'desc' },
          select: { digest: true },
        }),
        tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "ProjectCheckpoint"
          WHERE "id" = ${input.checkpointId}
            AND "projectId" = ${input.projectId}
            AND "state" = 'RELEASE_BARRIER'
            AND "barrierProjectId" = ${input.projectId}
            AND "barrierOwnerToken" = ${input.ownerToken}
            AND "barrierFence" = ${input.fence}
            AND "barrierExpiresAt" > clock_timestamp()
        `,
      ]);

      if (!lease[0]) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_RELEASE_BARRIER_LOST')), {
          code: 'PROJECT_RELEASE_BARRIER_LOST',
          statusCode: 409,
        });
      }

      if (!project || project.organizationId !== input.expectedOrganizationId) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_RELEASE')), {
          code: 'PROJECT_ORGANIZATION_CHANGED_DURING_RELEASE',
          statusCode: 409,
        });
      }

      if (!manifest || manifest.digest !== input.expectedManifestDigest) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH')), {
          code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH',
          statusCode: 409,
        });
      }
    });
  }

  async releaseProjectReleaseBarrier(input: {
    checkpointId: string;
    projectId: string;
    ownerToken: string;
    fence: number;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await lockProjectMutation(tx, input.projectId);
      const deleted = await tx.projectCheckpoint.deleteMany({
        where: {
          id: input.checkpointId,
          projectId: input.projectId,
          state: 'RELEASE_BARRIER',
          barrierOwnerToken: input.ownerToken,
          barrierFence: input.fence,
        },
      });

      return deleted.count === 1;
    });
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
    const scope = await this.prisma.projectCheckpoint.findUnique({
      where: { id },
      select: { projectId: true, createdByUserId: true },
    });
    if (!scope) return;

    await this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope.createdByUserId],
        projectIds: [scope.projectId],
      });
      await tx.projectCheckpoint.update({
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
      const row = await this.prisma.$transaction(async (tx) => {
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [input.actorUserId],
          organizationIds: [input.organizationId],
          projectIds: [input.sourceProjectId],
        });

        const [sourceExists, organizationExists] = await Promise.all([
          tx.project.count({ where: { id: input.sourceProjectId } }),
          tx.organization.count({ where: { id: input.organizationId } }),
        ]);
        if (sourceExists !== 1 || organizationExists !== 1) {
          throw Object.assign(new Error(appPublicEnglish('PROJECT_NOT_FOUND')), {
            statusCode: 404,
            code: 'PROJECT_NOT_FOUND',
          });
        }

        return tx.remixJob.create({
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
      });

      return { job: mapRemixJob(row), replayed: false };
    } catch (error) {
      if (!isPrismaKnownRequestError(error) || error.code !== 'P2002') {
        throw error;
      }

      return this.prisma.$transaction(async (tx) => {
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [input.actorUserId],
          organizationIds: [input.organizationId],
          projectIds: [input.sourceProjectId],
        });
        const existing = await tx.remixJob.findUnique({
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

        assertStateMachineNotPurged(existing.errorCode, existing.error);

        return { job: mapRemixJob(existing), replayed: true };
      });
    }
  }

  async claimRemixJob(input: { id: string; organizationId: string; operationToken: string; leaseDurationMs: number }) {
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });
    if (!scope) return undefined;

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope.sourceProjectId, scope.targetProjectId],
      });
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.id,
        input.organizationId,
      );

      const now = await databaseNow(tx);
      const job = await tx.remixJob.findFirst({ where: { id: input.id, organizationId: input.organizationId } });

      assertStateMachineNotPurged(job?.errorCode, job?.error);

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
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });
    if (!scope) return undefined;

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope.sourceProjectId, scope.targetProjectId],
      });
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

      assertStateMachineNotPurged(row?.errorCode, row?.error);

      if (!row) {
        return undefined;
      }

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
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });
    if (!scope) return undefined;

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope.sourceProjectId, scope.targetProjectId, input.patch?.targetProjectId],
      });
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

      assertStateMachineNotPurged(row?.errorCode, row?.error);

      if (!row) {
        return undefined;
      }

      const stagesTargetIdeState =
        input.patch?.targetIdeState !== undefined || input.patch?.targetIdeStateDigest !== undefined;
      const mustStageTargetIdeState = row.state === 'SOURCE_SANITIZED' && input.state === 'CLONING';
      if (
        (stagesTargetIdeState && !mustStageTargetIdeState) ||
        (mustStageTargetIdeState &&
          (input.patch?.targetProjectId !== row.targetProjectId ||
            !validRemixIdeStatePin(input.patch?.targetIdeState, input.patch?.targetIdeStateDigest)))
      ) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED')), {
          statusCode: 409,
          code: 'REMIX_TARGET_DIGEST_MISMATCH',
        });
      }

      return mapRemixJob(
        await tx.remixJob.update({
          where: { id: row.id },
          data: { state: input.state, version: { increment: 1 }, ...remixTransitionData(input.patch) },
        }),
      );
    });
  }

  async releaseRemixJobLease(input: { id: string; organizationId: string; operationToken: string }) {
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });
    if (!scope) return undefined;

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope.sourceProjectId, scope.targetProjectId],
      });
      const updated = await tx.remixJob.updateMany({
        where: { id: input.id, organizationId: input.organizationId, operationToken: input.operationToken },
        data: { operationToken: null, operationExpiresAt: null, version: { increment: 1 } },
      });

      if (updated.count !== 1) return undefined;

      const row = await tx.remixJob.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
      return row ? mapRemixJob(row) : undefined;
    });
  }

  async createClaimedRemixProject(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    name: string;
    slug: string;
    manifestCloneMode?: ProjectManifestCloneMode;
  }) {
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.remixJobId, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.sourceProjectId, scope?.targetProjectId],
      });
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

          /*
           * Keep a partially-provisioned target out of normal project listings.
           * finalizeClaimedRemix clears this atomically with COMPLETED.
           */
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

  async acquireClaimedRemixDatabase(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    expectedVersion: number;
    requestHash: string;
    projectId: string;
    retentionDays: number;
    environment: 'development';
    provisioningDeadlineAt: string;
  }): Promise<{ instance: DatabaseInstanceRecord; acquired: boolean; created: boolean }> {
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.remixJobId, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.sourceProjectId, scope?.targetProjectId, input.projectId],
      });
      await lockProjectAfterPurgeTopology(tx, input.projectId);
      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { organizationId: true, deletedAt: true },
      });
      if (!project || project.deletedAt === null || project.organizationId !== input.organizationId) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
          code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
          statusCode: 409,
        });
      }
      await assertNoActiveProjectReleaseBarrier(tx, input.projectId);
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
          state: 'DATABASE_PINNED',
          operationToken: input.operationToken,
          operationExpiresAt: { gt: now },
          version: input.expectedVersion,
          requestHash: input.requestHash,
          targetProjectId: input.projectId,
        },
      });
      if (!job) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_OWNERSHIP_LOST')), {
          statusCode: 409,
          code: 'REMIX_OWNERSHIP_LOST',
        });
      }

      const existing = await tx.databaseInstance.findUnique({
        where: { projectId_environment: { projectId: input.projectId, environment: input.environment } },
      });
      if (!existing) {
        const created = await tx.databaseInstance.create({
          data: {
            projectId: input.projectId,
            organizationId: input.organizationId,
            environment: input.environment,
            retentionDays: input.retentionDays,
            pitrEnabled: input.retentionDays > 0,
            provisioningDeadlineAt: new Date(input.provisioningDeadlineAt),
          },
        });
        return { instance: mapDatabaseInstance(created), acquired: true, created: true };
      }

      if (
        existing.organizationId !== input.organizationId ||
        existing.retentionDays !== input.retentionDays ||
        existing.pitrEnabled !== input.retentionDays > 0 ||
        (existing.status !== 'PROVISIONING' && existing.status !== 'FAILED')
      ) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED')), {
          statusCode: 409,
          code: 'REMIX_DATABASE_TARGET_MISMATCH',
        });
      }

      const claimed = await tx.databaseInstance.updateMany({
        where: { id: existing.id, status: 'FAILED' },
        data: {
          status: 'PROVISIONING',
          provisioningDeadlineAt: new Date(input.provisioningDeadlineAt),
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });
      const current = await tx.databaseInstance.findUniqueOrThrow({ where: { id: existing.id } });
      return { instance: mapDatabaseInstance(current), acquired: claimed.count === 1, created: false };
    });
  }

  async completeClaimedRemixDatabase(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    expectedVersion: number;
    requestHash: string;
    databaseInstanceId: string;
    projectId: string;
    valueEncrypted: string;
  }) {
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.remixJobId, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.sourceProjectId, scope?.targetProjectId, input.projectId],
      });
      await lockProjectAfterPurgeTopology(tx, input.projectId);
      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { organizationId: true, deletedAt: true },
      });
      if (!project || project.deletedAt === null || project.organizationId !== input.organizationId) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
          code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
          statusCode: 409,
        });
      }
      await assertNoActiveProjectReleaseBarrier(tx, input.projectId);
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
          version: input.expectedVersion,
          requestHash: input.requestHash,
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
    expectedVersion: number;
    requestHash: string;
    targetProjectId: string;
  }) {
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.remixJobId, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.sourceProjectId, scope?.targetProjectId, input.targetProjectId],
      });
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RemixJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.remixJobId,
        input.organizationId,
      );

      const job = await tx.remixJob.findFirst({
        where: { id: input.remixJobId, organizationId: input.organizationId },
      });

      if (!job) {
        return undefined;
      }

      if (
        job.requestHash !== input.requestHash ||
        job.targetProjectId !== input.targetProjectId ||
        !validRemixIdeStatePin(job.targetIdeState, job.targetIdeStateDigest)
      ) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED')), {
          statusCode: 409,
          code: 'REMIX_TARGET_DIGEST_MISMATCH',
        });
      }

      await tx.$queryRawUnsafe('SELECT "id" FROM "Project" WHERE "id" = $1 FOR UPDATE', input.targetProjectId);
      const target = await tx.project.findFirst({
        where: { id: input.targetProjectId, organizationId: input.organizationId },
      });
      if (!target) return undefined;

      const existingIdeState = await tx.projectIdeState.findUnique({ where: { projectId: target.id } });

      if (job.state === 'COMPLETED') {
        if (
          target.deletedAt !== null ||
          !existingIdeState ||
          remixIdeStateDigest(existingIdeState.state) !== job.targetIdeStateDigest
        ) {
          throw Object.assign(new Error(appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED')), {
            statusCode: 409,
            code: 'REMIX_TARGET_DIGEST_MISMATCH',
          });
        }
        return mapRemixJob(job);
      }

      const now = await databaseNow(tx);
      if (
        job.state !== 'INDEXING' ||
        job.operationToken !== input.operationToken ||
        !job.operationExpiresAt ||
        job.operationExpiresAt <= now ||
        job.version !== input.expectedVersion ||
        target.deletedAt === null
      ) {
        return undefined;
      }

      if (existingIdeState) {
        if (remixIdeStateDigest(existingIdeState.state) !== job.targetIdeStateDigest) {
          throw Object.assign(new Error(appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED')), {
            statusCode: 409,
            code: 'REMIX_TARGET_DIGEST_MISMATCH',
          });
        }
      } else {
        await tx.projectIdeState.create({
          data: {
            projectId: target.id,
            state: job.targetIdeState as Prisma.InputJsonValue,
            updatedByUserId: job.actorUserId,
          },
        });
      }

      await tx.project.update({ where: { id: target.id }, data: { deletedAt: null } });

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
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.remixJobId, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.sourceProjectId, scope?.targetProjectId],
      });
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
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.remixJobId, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.sourceProjectId, scope?.targetProjectId, input.targetProjectId],
      });
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
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.remixJobId, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.sourceProjectId, scope?.targetProjectId],
      });
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
    prepareSourceRetention: () => Promise<ObjectStorageInventory>;
  }) {
    const sourceInventory = parseRetainedRemixSourceInventory(input.sourceInventory);
    const tenantScopes = [
      { projectId: input.sourceProjectId, expectedOrganizationId: input.sourceOrganizationId },
      { projectId: input.targetProjectId, expectedOrganizationId: input.targetOrganizationId },
    ].sort((left, right) => left.projectId.localeCompare(right.projectId));

    return this.withProjectPhysicalAccesses(tenantScopes, async () => {
      const liveInventory = canonicalObjectStorageInventory(await input.prepareSourceRetention());
      if (!exactObjectStorageInventoriesEqual(sourceInventory, liveInventory)) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_STORAGE_SHARE_CONFLICT')), {
          code: 'REMIX_STORAGE_SOURCE_CHANGED',
          statusCode: 409,
        });
      }

      return this.prisma.$transaction(async (tx) => {
        for (const scope of tenantScopes) {
          await this.lockExpectedProjectTenantMutation(tx, scope);
        }

        const projects = await tx.project.findMany({
          where: { id: { in: [input.sourceProjectId, input.targetProjectId] } },
          select: { id: true, objectStorageCapabilityExpiresAt: true },
        });
        const now = await databaseNow(tx);
        if (
          projects.length !== 2 ||
          projects.some(
            (project) => project.objectStorageCapabilityExpiresAt && project.objectStorageCapabilityExpiresAt > now,
          )
        ) {
          throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_CAPABILITY_ACTIVE')), {
            code: 'OBJECT_STORAGE_CAPABILITY_ACTIVE',
            statusCode: 409,
          });
        }

        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [input.consentedByUserId],
          organizationIds: [input.sourceOrganizationId, input.targetOrganizationId],
          projectIds: [input.sourceProjectId, input.targetProjectId],
        });
        const existing = await tx.remixStorageShare.findUnique({
          where: { targetProjectId: input.targetProjectId },
        });

        if (existing) {
          if (
            existing.sourceProjectId !== input.sourceProjectId ||
            existing.sourceOrganizationId !== input.sourceOrganizationId ||
            existing.targetOrganizationId !== input.targetOrganizationId ||
            existing.consentVersion !== input.consentVersion ||
            existing.state !== 'ACTIVE' ||
            !exactObjectStorageInventoriesEqual(
              sourceInventory,
              parseRetainedRemixSourceInventory(existing.sourceInventory),
            )
          ) {
            throw Object.assign(new Error(appPublicEnglish('REMIX_STORAGE_SHARE_CONFLICT')), {
              statusCode: 409,
              code: 'REMIX_STORAGE_SHARE_CONFLICT',
            });
          }

          await scheduleObjectStorageVersionGc(tx, {
            projectId: input.sourceProjectId,
            expectedOrganizationId: input.sourceOrganizationId,
            notBefore: now,
          });
          return mapRemixStorageShare(existing);
        }

        const storedSourceInventory = {
          bucketExists: sourceInventory.bucketExists,
          objects: sourceInventory.objects.map(({ key, size, generation, contentHash }) => ({
            key,
            size,
            generation,
            contentHash,
          })),
        } satisfies Prisma.InputJsonObject;

        const created = await tx.remixStorageShare.create({
          data: {
            sourceProjectId: input.sourceProjectId,
            targetProjectId: input.targetProjectId,
            sourceOrganizationId: input.sourceOrganizationId,
            targetOrganizationId: input.targetOrganizationId,
            consentVersion: input.consentVersion,
            consentedByUserId: input.consentedByUserId ?? null,
            sourceInventory: storedSourceInventory,
          },
        });
        await scheduleObjectStorageVersionGc(tx, {
          projectId: input.sourceProjectId,
          expectedOrganizationId: input.sourceOrganizationId,
          notBefore: now,
        });
        return mapRemixStorageShare(created);
      });
    });
  }

  async getRemixStorageShareByTarget(targetProjectId: string) {
    const row = await this.prisma.remixStorageShare.findUnique({ where: { targetProjectId } });
    return row && row.state === 'ACTIVE' ? mapRemixStorageShare(row) : undefined;
  }

  async revokeRemixStorageShare(input: { targetProjectId: string; targetOrganizationId: string }) {
    const scope = await this.prisma.remixStorageShare.findUnique({
      where: { targetProjectId: input.targetProjectId },
      select: { consentedByUserId: true, sourceProjectId: true, sourceOrganizationId: true },
    });
    const tenantScopes = [
      { projectId: input.targetProjectId, expectedOrganizationId: input.targetOrganizationId },
      ...(scope ? [{ projectId: scope.sourceProjectId, expectedOrganizationId: scope.sourceOrganizationId }] : []),
    ].sort((left, right) => left.projectId.localeCompare(right.projectId));

    return this.withProjectPhysicalAccesses(tenantScopes, () =>
      this.prisma.$transaction(async (tx) => {
        for (const tenantScope of tenantScopes) {
          await this.lockExpectedProjectTenantMutation(tx, tenantScope);
        }
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [scope?.consentedByUserId],
          organizationIds: [scope?.sourceOrganizationId, input.targetOrganizationId],
          projectIds: [scope?.sourceProjectId, input.targetProjectId],
        });
        const now = await databaseNow(tx);
        const updated = await tx.remixStorageShare.updateMany({
          where: {
            targetProjectId: input.targetProjectId,
            targetOrganizationId: input.targetOrganizationId,
            state: 'ACTIVE',
          },
          data: { state: 'REVOKED', revokedAt: now },
        });

        if (updated.count !== 1) return undefined;

        const row = await tx.remixStorageShare.findUnique({ where: { targetProjectId: input.targetProjectId } });
        if (!row) throw new TypeError('REMIX_STORAGE_SHARE_STATE_INVALID');
        await scheduleObjectStorageVersionGc(tx, {
          projectId: row.sourceProjectId,
          expectedOrganizationId: row.sourceOrganizationId,
          notBefore: now,
        });
        return mapRemixStorageShare(row);
      }),
    );
  }

  async deleteClaimedRemixStorageShare(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }) {
    const scope = await this.prisma.remixJob.findFirst({
      where: { id: input.remixJobId, organizationId: input.organizationId },
      select: { actorUserId: true, sourceProjectId: true, targetProjectId: true },
    });
    const shareScope = await this.prisma.remixStorageShare.findUnique({
      where: { targetProjectId: input.targetProjectId },
      select: { sourceProjectId: true, sourceOrganizationId: true, targetOrganizationId: true },
    });
    const tenantScopes = [
      { projectId: input.targetProjectId, expectedOrganizationId: input.organizationId },
      ...(shareScope
        ? [{ projectId: shareScope.sourceProjectId, expectedOrganizationId: shareScope.sourceOrganizationId }]
        : []),
    ].sort((left, right) => left.projectId.localeCompare(right.projectId));

    return this.withProjectPhysicalAccesses(tenantScopes, () =>
      this.prisma.$transaction(async (tx) => {
        for (const tenantScope of tenantScopes) {
          await this.lockExpectedProjectTenantMutation(tx, tenantScope);
        }
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [scope?.actorUserId],
          organizationIds: [input.organizationId],
          projectIds: [scope?.sourceProjectId, scope?.targetProjectId, input.targetProjectId],
        });
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
        if (shareScope && shareScope.targetOrganizationId !== input.organizationId) {
          throw projectOrganizationChangedError();
        }

        const deleted =
          (await tx.remixStorageShare.deleteMany({ where: { targetProjectId: input.targetProjectId } })).count > 0;
        if (deleted && shareScope) {
          await scheduleObjectStorageVersionGc(tx, {
            projectId: shareScope.sourceProjectId,
            expectedOrganizationId: shareScope.sourceOrganizationId,
            notBefore: now,
          });
        }
        return deleted;
      }),
    );
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

        /*
         * A row published at creation records publishedAt so the detail page
         * can show a real date; a PENDING_REVIEW row leaves it null.
         */
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

      /*
       * Featured first, then most recently published, so the grid leads with
       * the curated highlights (mirrors the replit.com/gallery ordering).
       */
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
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [input.actorUserId],
          organizationIds: [input.organizationId],
        });
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

      return this.prisma.$transaction(async (tx) => {
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [input.actorUserId],
          organizationIds: [input.organizationId],
        });

        const existing = await tx.importJob.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: input.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { reservation: true },
        });

        const canonical = existing
          ? await tx.ledgerReservation.findFirst({
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

        assertStateMachineNotPurged(undefined, existing.error);

        return {
          job: mapImportJob(existing),
          reservation: canonical
            ? mapCanonicalImportReservation(canonical, existing.idempotencyKey)
            : mapImportReservation(existing.reservation),
          replayed: true,
        };
      });
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
    const scope = await this.prisma.importJob.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      select: { actorUserId: true, targetProjectId: true },
    });

    if (!scope) {
      return undefined;
    }

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope.targetProjectId, input.patch?.targetProjectId],
      });
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "ImportJob" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
        input.id,
        input.organizationId,
      );

      const row = await tx.importJob.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          version: input.expectedVersion,
          state: { in: input.expectedStates },
        },
      });

      assertStateMachineNotPurged(undefined, row?.error);

      if (!row) {
        return undefined;
      }

      const now = operationLeaseDurationMs === undefined ? undefined : await databaseNow(tx);
      return mapImportJob(
        await tx.importJob.update({
          where: { id: row.id },
          data: {
            state: input.state,
            version: { increment: 1 },
            ...importTransitionData(input.patch),
            ...(now ? { operationExpiresAt: databaseLeaseExpiry(now, operationLeaseDurationMs!) } : {}),
          },
        }),
      );
    });
  }

  async renewImportJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
    leaseDurationMs: number;
  }) {
    const scope = await this.prisma.importJob.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      select: { actorUserId: true, targetProjectId: true },
    });
    if (!scope) return undefined;

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope.targetProjectId],
      });
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

      if (!row) {
        return undefined;
      }

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
    const scope = await this.prisma.importJob.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      select: { actorUserId: true, targetProjectId: true },
    });
    if (!scope) return false;

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope.targetProjectId],
      });
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
    const scope = await this.prisma.importJob.findFirst({
      where: { id: input.importJobId, organizationId: input.organizationId },
      select: { actorUserId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.targetProjectId],
      });
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
    projectIdeState?: unknown;
    updatedByUserId?: string;
  }) {
    const ledger = new LedgerStore(this.prisma);
    const scope = await this.prisma.importJob.findFirst({
      where: { id: input.importJobId, organizationId: input.organizationId },
      select: { actorUserId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.targetProjectId, input.targetProjectId],
      });
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
        const actualAmountMinor = importCreditsToMinor(input.actualCredits);
        const canonical = await tx.ledgerReservation.findFirst({
          where: {
            importJobId: job.id,
            organizationId: input.organizationId,
            operation: 'import',
            currency: IMPORT_LEDGER_CURRENCY,
          },
        });
        const legacy = canonical
          ? null
          : await tx.importCreditReservation.findFirst({
              where: { importJobId: job.id, organizationId: input.organizationId, state: 'SETTLED' },
            });

        if (canonical) {
          if (
            canonical.status !== 'COMMITTED' ||
            canonical.committedMinor !== actualAmountMinor ||
            !canonical.settleTxId
          ) {
            throw Object.assign(new Error(appPublicEnglish('IMPORT_COMMIT_OWNERSHIP_LOST')), {
              statusCode: 409,
              code: 'IMPORT_COMMIT_REPLAY_MISMATCH',
            });
          }

          const settlement = await tx.ledgerTransaction.findUnique({
            where: { id: canonical.settleTxId },
            select: { organizationId: true, reason: true, metadata: true },
          });
          const metadata =
            settlement?.metadata && typeof settlement.metadata === 'object' && !Array.isArray(settlement.metadata)
              ? (settlement.metadata as Record<string, unknown>)
              : undefined;

          if (
            settlement?.organizationId !== input.organizationId ||
            settlement.reason !== 'reservation.settle' ||
            metadata?.reservationId !== canonical.id ||
            metadata.committed !== actualAmountMinor.toString()
          ) {
            throw Object.assign(new Error(appPublicEnglish('IMPORT_COMMIT_OWNERSHIP_LOST')), {
              statusCode: 409,
              code: 'IMPORT_COMMIT_REPLAY_MISMATCH',
            });
          }

          await ledger.commitReservationInTransaction(tx, {
            reservationId: canonical.id,
            actualAmountMinor,
            refuseOverage: true,
          });
        } else if (!legacy || legacy.debitedCredits !== input.actualCredits) {
          throw Object.assign(new Error(appPublicEnglish('IMPORT_COMMIT_OWNERSHIP_LOST')), {
            statusCode: 409,
            code: 'IMPORT_COMMIT_REPLAY_MISMATCH',
          });
        }

        return {
          job: mapImportJob(job),
          reservation: canonical
            ? mapCanonicalImportReservation(canonical, job.idempotencyKey)
            : mapImportReservation(legacy!),
        };
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
       * Persist the verified file manifest and reveal in the same transaction as
       * SETTLED + COMMITTED. The target remains soft-deleted while connector and
       * storage effects run, so the normal project-mutation fence intentionally
       * rejects it; writing here keeps an incomplete target from ever becoming
       * visible. Updating an already-visible legacy partial target remains
       * supported during rolling upgrades.
       */
      if (input.projectIdeState !== undefined) {
        await tx.projectIdeState.upsert({
          where: { projectId: target.id },
          create: {
            projectId: target.id,
            state: input.projectIdeState as Prisma.InputJsonValue,
            updatedByUserId: input.updatedByUserId,
          },
          update: {
            state: input.projectIdeState as Prisma.InputJsonValue,
            updatedByUserId: input.updatedByUserId,
            version: { increment: 1 },
          },
        });
      }
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
    const scope = await this.prisma.importJob.findFirst({
      where: { id: input.importJobId, organizationId: input.organizationId },
      select: { actorUserId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.targetProjectId],
      });
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
    const scope = await this.prisma.importJob.findFirst({
      where: { id: input.importJobId, organizationId: input.organizationId },
      select: { actorUserId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.targetProjectId, input.targetProjectId],
      });
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
    const scope = await this.prisma.importJob.findFirst({
      where: { id: input.importJobId, organizationId: input.organizationId },
      select: { actorUserId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [scope?.targetProjectId],
      });
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
    const scope = await this.prisma.importJob.findFirst({
      where: { id: importJobId, organizationId },
      select: { actorUserId: true, targetProjectId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope?.actorUserId],
        organizationIds: [organizationId],
        projectIds: [scope?.targetProjectId],
      });
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
    const stale = await this.prisma.$queryRaw<
      Array<{
        id: string;
        organizationId: string;
        actorUserId: string | null;
        targetProjectId: string | null;
      }>
    >(Prisma.sql`
      SELECT "id", "organizationId", "actorUserId", "targetProjectId"
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
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [candidate.actorUserId],
          organizationIds: [candidate.organizationId],
          projectIds: [candidate.targetProjectId],
        });
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

  async deleteProjectSecret(input: { projectId: string; expectedOrganizationId: string; key: string }) {
    /*
     * find-then-delete raced a concurrent delete into an unhandled P2025; use a
     * count-gated deleteMany so a lost race is reported as "already gone".
     */
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      const existing = await tx.projectSecret.findUnique({
        where: { projectId_key: { projectId: input.projectId, key: input.key } },
      });

      if (!existing) return undefined;

      const deleted = await tx.projectSecret.deleteMany({
        where: { projectId: input.projectId, key: input.key },
      });
      return deleted.count > 0 ? mapSecret(existing) : undefined;
    });
  }

  async addProjectCollaborator(input: {
    projectId: string;
    expectedOrganizationId: string;
    userId: string;
    roleKey: string;
    expiresAt?: Date | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        subjectUserIds: [input.userId],
      });
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

  async getActiveProjectCollaborator(projectId: string, userId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT collaborator.*
        FROM "ProjectCollaborator" AS collaborator
       WHERE collaborator."projectId" = ${projectId}
         AND collaborator."userId" = ${userId}
         AND (collaborator."expiresAt" IS NULL OR collaborator."expiresAt" > NOW())
       LIMIT 1
    `;
    return rows[0] ? mapProjectCollaborator(rows[0]) : undefined;
  }

  async listActiveOrganizationViewerUserIds(organizationId: string, options?: { excludeGroupId?: string }) {
    const rows = await this.prisma.$queryRaw<Array<{ userId: string }>>`
      SELECT DISTINCT audience."userId"
        FROM (
          SELECT collaborator."userId" AS "userId"
            FROM "ProjectCollaborator" AS collaborator
            JOIN "Project" AS project ON project.id = collaborator."projectId"
           WHERE project."organizationId" = ${organizationId}
             AND project."deletedAt" IS NULL
             AND collaborator."roleKey" IN ('viewer', 'guest')
             AND (collaborator."expiresAt" IS NULL OR collaborator."expiresAt" > CURRENT_TIMESTAMP)

          UNION ALL

          SELECT access_grant."subjectUserId" AS "userId"
            FROM "ResourceAccessGrant" AS access_grant
            JOIN "Project" AS project
              ON access_grant."resourceType" = 'PROJECT'
             AND project.id = access_grant."resourceId"
           WHERE access_grant."organizationId" = ${organizationId}
             AND project."organizationId" = ${organizationId}
             AND project."deletedAt" IS NULL
             AND access_grant."subjectType" = 'USER'
             AND access_grant."roleKey" IN ('viewer', 'guest')
             AND access_grant."status" = 'ACTIVE'
             AND access_grant."revokedAt" IS NULL
             AND access_grant."expiresAt" > CURRENT_TIMESTAMP

          UNION ALL

          SELECT membership."userId" AS "userId"
            FROM "ResourceAccessGrant" AS access_grant
            JOIN "Project" AS project
              ON access_grant."resourceType" = 'PROJECT'
             AND project.id = access_grant."resourceId"
            JOIN "CollaborationGroup" AS collaboration_group
              ON collaboration_group."organizationId" = access_grant."organizationId"
             AND collaboration_group.id = access_grant."subjectGroupId"
            JOIN "CollaborationGroupMember" AS group_member
              ON group_member."organizationId" = collaboration_group."organizationId"
             AND group_member."groupId" = collaboration_group.id
            JOIN "OrganizationMember" AS membership
              ON membership."organizationId" = group_member."organizationId"
             AND membership.id = group_member."membershipId"
           WHERE access_grant."organizationId" = ${organizationId}
             AND project."organizationId" = ${organizationId}
             AND project."deletedAt" IS NULL
             AND access_grant."subjectType" = 'GROUP'
             AND access_grant."roleKey" IN ('viewer', 'guest')
             AND access_grant."status" = 'ACTIVE'
             AND access_grant."revokedAt" IS NULL
             AND access_grant."expiresAt" > CURRENT_TIMESTAMP
             AND collaboration_group."deletedAt" IS NULL
             AND membership."state" = 'ACTIVE'
             AND (${options?.excludeGroupId ?? null}::text IS NULL
                  OR collaboration_group.id <> ${options?.excludeGroupId ?? null})
        ) AS audience
       WHERE audience."userId" IS NOT NULL
       ORDER BY audience."userId" ASC
    `;
    return rows.map((row) => row.userId);
  }

  async groupHasActiveReadOnlyProjectGrant(organizationId: string, groupId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
          FROM "ResourceAccessGrant" AS access_grant
          JOIN "Project" AS project
            ON access_grant."resourceType" = 'PROJECT'
           AND project.id = access_grant."resourceId"
          JOIN "CollaborationGroup" AS collaboration_group
            ON collaboration_group."organizationId" = access_grant."organizationId"
           AND collaboration_group.id = access_grant."subjectGroupId"
         WHERE access_grant."organizationId" = ${organizationId}
           AND access_grant."subjectType" = 'GROUP'
           AND access_grant."subjectGroupId" = ${groupId}
           AND access_grant."roleKey" IN ('viewer', 'guest')
           AND access_grant."status" = 'ACTIVE'
           AND access_grant."revokedAt" IS NULL
           AND access_grant."expiresAt" > CURRENT_TIMESTAMP
           AND project."organizationId" = ${organizationId}
           AND project."deletedAt" IS NULL
           AND collaboration_group."deletedAt" IS NULL
      ) AS "exists"
    `;
    return rows[0]?.exists === true;
  }

  async removeProjectCollaborator(input: {
    projectId: string;
    expectedOrganizationId: string;
    userId: string;
  }): Promise<boolean> {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        subjectUserIds: [input.userId],
      });
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
        await lockProjectMutation(tx, input.resourceId);

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
    expectedOrganizationId: string;
    actorUserId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input, {
        allowActiveCheckpoint: true,
        allowDeletedProject: true,
      });

      const activity = await tx.projectActivity.create({
        data: {
          projectId: input.projectId,
          ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
          action: input.action,
          ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
        },
      });
      return mapProjectActivity(activity);
    });
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
    expectedOrganizationId: string;
    state: unknown;
    updatedByUserId?: string;
    expectedVersion?: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        subjectUserIds: input.updatedByUserId ? [input.updatedByUserId] : undefined,
      });

      if (input.expectedVersion !== undefined) {
        /*
         * Atomic optimistic-concurrency write: only succeed if the row's version
         * still equals what the caller read. The handler's separate
         * read-then-version-check was not atomic, so two concurrent writers who
         * both passed the check would both increment and last-write-wins clobbered
         * one. A conditional updateMany closes that race — count===0 means another
         * writer won, which the caller surfaces as 412.
         */
        const result = await tx.projectIdeState.updateMany({
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

        const updated = await tx.projectIdeState.findUnique({ where: { projectId: input.projectId } });

        if (!updated) {
          // The row was deleted/archived between the updateMany and this read.
          throw Object.assign(new Error(appPublicEnglish('IDE_STATE_NOT_FOUND')), { code: 'IDE_STATE_NOT_FOUND' });
        }

        return mapProjectIdeState(updated);
      }

      return mapProjectIdeState(
        await tx.projectIdeState.upsert({
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
    });
  }

  async getWorkspaceIdeState(workspaceId: string) {
    const state = await this.prisma.workspaceIdeState.findUnique({ where: { workspaceId } });
    return state ? mapWorkspaceIdeState(state) : undefined;
  }

  async upsertWorkspaceIdeState(input: {
    workspaceId: string;
    expectedProjectId: string;
    expectedOrganizationId: string;
    state: unknown;
    updatedByUserId?: string;
    expectedVersion?: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, {
        projectId: input.expectedProjectId,
        expectedOrganizationId: input.expectedOrganizationId,
        subjectUserIds: input.updatedByUserId ? [input.updatedByUserId] : undefined,
      });
      const workspace = await tx.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { projectId: true },
      });
      if (!workspace || workspace.projectId !== input.expectedProjectId) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
          code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
          statusCode: 409,
        });
      }

      if (input.expectedVersion !== undefined) {
        // Atomic optimistic-concurrency write — see upsertProjectIdeState.
        const result = await tx.workspaceIdeState.updateMany({
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

        const updated = await tx.workspaceIdeState.findUnique({ where: { workspaceId: input.workspaceId } });

        if (!updated) {
          // The row was deleted/archived between the updateMany and this read.
          throw Object.assign(new Error(appPublicEnglish('IDE_STATE_NOT_FOUND')), { code: 'IDE_STATE_NOT_FOUND' });
        }

        return mapWorkspaceIdeState(updated);
      }

      return mapWorkspaceIdeState(
        await tx.workspaceIdeState.upsert({
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
    });
  }

  async updateWorkspaceGitRepositoryUrl(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId: string;
    gitRepositoryUrl: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      const workspace = await tx.workspace.findFirst({
        where: { id: input.workspaceId, projectId: input.projectId },
        select: { id: true },
      });

      if (!workspace) {
        throw Object.assign(new Error(appPublicEnglish('WORKSPACE_NOT_FOUND')), {
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
        });
      }

      return mapWorkspace(
        await tx.workspace.update({
          where: { id: input.workspaceId },
          data: { gitRepositoryUrl: input.gitRepositoryUrl },
        }),
      );
    });
  }

  async upsertCollaborationPresence(input: {
    projectId: string;
    expectedOrganizationId: string;
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
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        subjectUserIds: [input.userId],
      });
      const existingPresence = await tx.collaborationPresence.findUnique({
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
        await tx.collaborationPresence.upsert({
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
    });
  }

  async removeCollaborationPresence(input: { projectId: string; expectedOrganizationId: string; sessionId: string }) {
    const deleted = await this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, input);
      return tx.collaborationPresence.deleteMany({
        where: { projectId: input.projectId, sessionId: input.sessionId },
      });
    });
    return deleted.count > 0;
  }

  async listCollaborationPresence(projectId: string) {
    return (
      await this.prisma.collaborationPresence.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } })
    ).map(mapCollaborationPresence);
  }

  async createCollaborationComment(input: {
    projectId: string;
    expectedOrganizationId: string;
    userId: string;
    filePath?: string;
    line?: number;
    selection?: unknown;
    body: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        subjectUserIds: [input.userId],
      });
      return mapCollaborationComment(
        await tx.collaborationComment.create({
          data: {
            projectId: input.projectId,
            userId: input.userId,
            filePath: input.filePath,
            line: input.line,
            selection: (input.selection ?? undefined) as any,
            body: input.body,
          },
        }),
      );
    });
  }

  async listCollaborationComments(projectId: string) {
    return (
      await this.prisma.collaborationComment.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } })
    ).map(mapCollaborationComment);
  }

  async createProjectShareLink(input: {
    projectId: string;
    expectedOrganizationId: string;
    tokenHash: string;
    roleKey: ProjectShareLinkRecord['roleKey'];
    expiresAt: Date;
    createdByUserId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        subjectUserIds: input.createdByUserId ? [input.createdByUserId] : undefined,
      });
      return mapProjectShareLink(
        await tx.projectShareLink.create({
          data: {
            projectId: input.projectId,
            tokenHash: input.tokenHash,
            roleKey: input.roleKey,
            expiresAt: input.expiresAt,
            createdByUserId: input.createdByUserId,
          },
        }),
      );
    });
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

  async revokeProjectShareLink(input: { projectId: string; expectedOrganizationId: string; id: string }) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, input);
      return tx.projectShareLink.updateMany({
        where: { id: input.id, projectId: input.projectId, revokedAt: null },
        data: { revokedAt: await databaseNow(tx) },
      });
    });

    return result.count > 0;
  }

  async redeemProjectShareLink(input: {
    projectId: string;
    expectedOrganizationId: string;
    shareLinkId: string;
    tokenHash: string;
    expectedRoleKey: ProjectShareLinkRecord['roleKey'];
    expectedExpiresAt: Date;
    userId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        subjectUserIds: [input.userId],
      });
      const rows = await tx.$queryRaw<any[]>`
        SELECT link.*
          FROM "ProjectShareLink" AS link
         WHERE link."id" = ${input.shareLinkId}
           AND link."projectId" = ${input.projectId}
           AND link."tokenHash" = ${input.tokenHash}
           AND link."roleKey" = ${input.expectedRoleKey}
           AND link."expiresAt" = ${input.expectedExpiresAt}
           AND link."revokedAt" IS NULL
           AND link."expiresAt" > clock_timestamp()
         FOR UPDATE
      `;
      const link = rows[0];
      if (!link) return undefined;

      return mapProjectCollaborator(
        await tx.projectCollaborator.upsert({
          where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
          create: {
            projectId: input.projectId,
            userId: input.userId,
            roleKey: link.roleKey,
            expiresAt: link.expiresAt,
          },
          update: { roleKey: link.roleKey, expiresAt: link.expiresAt },
        }),
      );
    });
  }

  async createChatShare(input: {
    tokenHash: string;
    conversationId: string;
    projectId: string;
    expectedOrganizationId: string;
    authorUserId: string;
    title?: string;
    payload: unknown;
    allowFork?: boolean;
    expiresAt?: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        subjectUserIds: [input.authorUserId],
      });
      return mapChatShare(
        await tx.chatShare.create({
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
    });
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

  async revokeChatShare(input: {
    id: string;
    projectId: string;
    expectedOrganizationId: string;
    authorUserId?: string;
  }) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        ...(input.authorUserId ? { subjectUserIds: [input.authorUserId] } : {}),
      });
      return tx.chatShare.updateMany({
        where: {
          id: input.id,
          projectId: input.projectId,
          revokedAt: null,
          ...(input.authorUserId ? { authorUserId: input.authorUserId } : {}),
        },
        data: { revokedAt: new Date() },
      });
    });

    return result.count > 0;
  }

  async upsertAgentPatchProposal(input: {
    id: string;
    projectId: string;
    expectedOrganizationId: string;
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
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);

      const existing = await tx.agentPatchProposal.findUnique({
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
        await tx.agentPatchProposal.upsert({
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
    });
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
    expectedOrganizationId: string;
    messageId?: string;
    artifactId?: string;
    actionId?: string;
    relativePath: string;
    attempt?: number;
    outcome: AgentRepairOutcome;
    validationError?: string;
    repairError?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      return mapAgentRepairEvent(
        await tx.agentRepairEvent.create({
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
    });
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

  async setProjectSkillEnabled(input: {
    projectId: string;
    expectedOrganizationId: string;
    skillId: string;
    enabled: boolean;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      const row = await tx.projectSkill.upsert({
        where: { projectId_skillId: { projectId: input.projectId, skillId: input.skillId } },
        create: { projectId: input.projectId, skillId: input.skillId, enabled: input.enabled },
        update: { enabled: input.enabled },
        select: { skillId: true, enabled: true, updatedAt: true },
      });

      return { skillId: row.skillId, enabled: row.enabled, updatedAt: row.updatedAt.toISOString() };
    });
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

    /*
     * Fail-closed enforcement: a revoked or audit-rejected skill can never be
     * enabled. Return the unchanged row so the caller sees it stayed disabled.
     */
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
    expectedOrganizationId: string;
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
      await this.lockProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
      });
      const { initialStatus, expectedOrganizationId: _expectedOrganizationId, ...data } = input;

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

  async latchProjectWorkspaceStart(input: {
    workspaceId: string;
    projectId: string;
    expectedOrganizationId: string;
    runtimeMode: string;
    environment?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        workspaceId: input.workspaceId,
      });

      const existing = await tx.workspace.findUnique({ where: { id: input.workspaceId } });

      if (existing && existing.projectId !== input.projectId) {
        throw Object.assign(new Error(appPublicEnglish('WORKSPACE_PROJECT_MISMATCH')), {
          statusCode: 403,
          code: 'WORKSPACE_PROJECT_MISMATCH',
        });
      }

      if (existing) {
        return mapWorkspace(
          await tx.workspace.update({
            where: { id: input.workspaceId },
            data: { status: 'STARTING' },
          }),
        );
      }

      const project = await tx.project.findUniqueOrThrow({
        where: { id: input.projectId },
        select: { name: true },
      });

      return mapWorkspace(
        await tx.workspace.create({
          data: {
            id: input.workspaceId,
            projectId: input.projectId,
            name: `${project.name} runtime`,
            runtimeMode: input.runtimeMode,
            environment: input.environment ?? 'development',
            status: 'STARTING',
            gitPath: workspaceRelativeGitPath(input.workspaceId),
          },
        }),
      );
    });
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
    expectedOrganizationId: string;
    label?: string;
    kind?: SnapshotRecord['kind'];
    manifest: unknown;
    storageKey?: string;
    byteLength?: number;
    createdByUserId?: string;
    conversationId?: string;
    turnIndex?: number;
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockExpectedProjectTenantMutation(tx, input);

        let latestManifestRow = await tx.projectManifestRevision.findFirst({
          where: { projectId: input.projectId },
          orderBy: { manifestVersion: 'desc' },
        });

        if (!latestManifestRow) {
          const initial = createDefaultProjectManifest(input.projectId);
          latestManifestRow = await tx.projectManifestRevision.create({
            data: {
              projectId: input.projectId,
              schemaVersion: initial.schemaVersion,
              manifestVersion: initial.manifestVersion,
              digest: projectManifestDigest(initial),
              manifest: initial as Prisma.InputJsonValue,
              createdByUserId: input.createdByUserId ?? null,
            },
          });
        }

        const latestManifest = mapProjectManifestRevision(latestManifestRow);
        const manifestBase =
          input.manifest && typeof input.manifest === 'object' && !Array.isArray(input.manifest)
            ? (input.manifest as Record<string, unknown>)
            : { snapshotData: input.manifest };
        const snapshotManifest = {
          ...manifestBase,
          projectManifest: projectManifestSnapshotPin(latestManifest, input.projectId),
        };
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

        if (input.id) {
          const existing = await tx.projectSnapshot.findUnique({ where: { id: input.id } });

          if (existing) {
            if (existing.projectId !== input.projectId || existing.storageKey !== input.storageKey) {
              throw Object.assign(new Error(appPublicEnglish('SNAPSHOT_IDEMPOTENCY_CONFLICT')), {
                statusCode: 409,
                code: 'SNAPSHOT_IDEMPOTENCY_CONFLICT',
              });
            }

            return mapSnapshot(existing);
          }
        }

        return mapSnapshot(await tx.projectSnapshot.create({ data }));
      });
    } catch (error) {
      if (!input.id || !isPrismaKnownRequestError(error) || error.code !== 'P2002') {
        throw error;
      }

      return this.prisma.$transaction(async (tx) => {
        await this.lockExpectedProjectTenantMutation(tx, input);
        const raced = await tx.projectSnapshot.findUnique({ where: { id: input.id } });

        if (!raced || raced.projectId !== input.projectId || raced.storageKey !== input.storageKey) throw error;
        return mapSnapshot(raced);
      });
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
    projectId: string;
    expectedOrganizationId: string;
    key: string;
    kind: ProjectStorageObjectRecord['kind'];
    contentBase64: string;
    byteLength: number;
    contentHash: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      return mapProjectStorageObject(
        await tx.projectStorageObject.upsert({
          where: { key: input.key },
          create: {
            projectId: input.projectId,
            key: input.key,
            kind: input.kind,
            contentBase64: input.contentBase64,
            byteLength: input.byteLength,
            contentHash: input.contentHash,
          },
          update: {
            projectId: input.projectId,
            kind: input.kind,
            contentBase64: input.contentBase64,
            byteLength: input.byteLength,
            contentHash: input.contentHash,
          },
        }),
      );
    });
  }

  async getProjectStorageObject(input: { projectId: string; expectedOrganizationId: string; key: string }) {
    return this.withProjectPhysicalAccess(input, async () => {
      const object = await this.prisma.projectStorageObject.findFirst({
        where: { key: input.key, projectId: input.projectId },
      });

      return object ? mapProjectStorageObject(object) : undefined;
    });
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
    if (!Number.isFinite(input.ttlMs) || input.ttlMs < 1) {
      throw new TypeError('invalid migration lease TTL');
    }

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

        if (row.requestHash !== input.requestHash) {
          return { kind: 'IDEMPOTENCY_COLLISION' as const, execution };
        }

        if (row.state === 'COMMITTED') {
          return { kind: 'REPLAYED' as const, execution };
        }

        if (row.state === 'FAILED_SAFE') {
          return { kind: 'FAILED' as const, execution };
        }

        if (row.leaseLive) {
          return { kind: 'BLOCKED' as const, execution };
        }
      } else {
        row = (
          await tx.$queryRaw<DatabaseMigrationRow[]>(Prisma.sql`
            SELECT *, ("leaseExpiresAt" > CURRENT_TIMESTAMP) AS "leaseLive"
            FROM "DBMigrationExecution"
            WHERE "activeLock" = ${activeLock}
            FOR UPDATE
          `)
        )[0];

        if (row?.leaseLive) {
          return { kind: 'BLOCKED' as const, execution: mapDatabaseMigrationExecution(row) };
        }
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

        if (!claimed) {
          return { kind: 'BLOCKED' as const, execution: mapDatabaseMigrationExecution(row) };
        }

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

      if (!created) {
        throw new Error(DB_MIGRATION_EXECUTION_INSERT_EMPTY);
      }

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

    if (release && retainLock) {
      throw new TypeError('migration transition cannot release and retain its lock');
    }

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
    expectedOrganizationId: string;
    organizationId: string;
    retentionDays: number;
    region?: string;
    environment?: string;
    provisioningDeadlineAt?: string;
  }): Promise<DatabaseInstanceRecord> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      if (input.organizationId !== input.expectedOrganizationId) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
          code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
          statusCode: 409,
        });
      }
      const row = await tx.databaseInstance.create({
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
    });
  }

  async acquireDatabaseProvisioning(input: {
    projectId: string;
    expectedOrganizationId: string;
    organizationId: string;
    retentionDays: number;
    region?: string;
    environment?: string;
    provisioningDeadlineAt: string;
  }): Promise<{ instance: DatabaseInstanceRecord; acquired: boolean; created: boolean }> {
    const environment = input.environment ?? 'development';
    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, input);
      if (input.organizationId !== input.expectedOrganizationId) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
          code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
          statusCode: 409,
        });
      }

      const existing = await tx.databaseInstance.findUnique({
        where: { projectId_environment: { projectId: input.projectId, environment } },
      });
      if (!existing) {
        const created = await tx.databaseInstance.create({
          data: {
            projectId: input.projectId,
            organizationId: input.organizationId,
            environment,
            retentionDays: input.retentionDays,
            region: input.region ?? null,
            pitrEnabled: input.retentionDays > 0,
            provisioningDeadlineAt: new Date(input.provisioningDeadlineAt),
          },
        });
        return { instance: mapDatabaseInstance(created), acquired: true, created: true };
      }

      const claimed = await tx.databaseInstance.updateMany({
        where: { id: existing.id, status: 'FAILED' },
        data: {
          status: 'PROVISIONING',
          provisioningDeadlineAt: new Date(input.provisioningDeadlineAt),
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });
      const current = await tx.databaseInstance.findUniqueOrThrow({ where: { id: existing.id } });
      return { instance: mapDatabaseInstance(current), acquired: claimed.count === 1, created: false };
    });
  }

  async completeDatabaseProvisioning(
    id: string,
    connection: {
      projectId: string;
      expectedOrganizationId: string;
      key: string;
      valueEncrypted: string;
    },
  ): Promise<DatabaseInstanceRecord | undefined> {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, connection);
      const updated = await tx.databaseInstance.updateMany({
        where: {
          id,
          projectId: connection.projectId,
          organizationId: connection.expectedOrganizationId,
          status: 'PROVISIONING',
        },
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
    expectedOrganizationId: string;
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
    reservedVm?: ReservedVmBillingRequest;
    accessPolicy?: { mode: DeploymentAccessMode; passwordHash?: string; createdByUserId?: string };
    accessPolicyVersion?: number;
    startedAt?: string;
    finishedAt?: string;
    canceledAt?: string;
  }) {
    if (input.accessPolicy && input.accessPolicyVersion !== undefined) {
      throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_POLICY_INPUT_CONFLICT')), {
        code: 'DEPLOYMENT_ACCESS_POLICY_INPUT_CONFLICT',
      });
    }

    const environment = input.environment ?? 'preview';
    const reservedVmActorUserId = input.reservedVm ? requireReservedVmActor(input.reservedVm.actorUserId) : undefined;

    const ledger = new LedgerStore(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      /* Revalidate the route's tenant before any idempotency claim, policy row, billing reservation or deployment. */
      await this.lockExpectedProjectTenantMutation(tx, input);

      if (input.reservedVm) {
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          `reserved-vm:${input.projectId}:${input.reservedVm.idempotencyKey}`,
        );
        const replay = await tx.reservedVmOperation.findUnique({
          where: {
            projectId_idempotencyKey: {
              projectId: input.projectId,
              idempotencyKey: input.reservedVm.idempotencyKey,
            },
          },
        });

        if (replay) {
          if (
            replay.requestHash !== input.reservedVm.requestHash ||
            replay.kind !== 'CREATE' ||
            !replay.actorUserId ||
            replay.actorUserId !== reservedVmActorUserId
          ) {
            throw Object.assign(reservedVmStoreError('Reserved VM idempotency key was reused for another request.'), {
              code: 'RESERVED_VM_IDEMPOTENCY_CONFLICT',
              statusCode: 409,
            });
          }

          const existingDeployment = await tx.deployment.findUniqueOrThrow({ where: { id: replay.deploymentId } });
          return mapDeployment(existingDeployment);
        }

        const exactPrice = RESERVED_VM_TIERS[input.reservedVm.tier]?.centsPerMonth;

        if (exactPrice !== input.reservedVm.monthlyPriceCents) {
          throw Object.assign(reservedVmStoreError('Reserved VM price confirmation is stale.'), {
            code: 'RESERVED_VM_PRICE_MISMATCH',
            statusCode: 409,
          });
        }

        const projectOwner = await tx.project.findUnique({
          where: { id: input.projectId },
          select: { organizationId: true },
        });

        if (!projectOwner || projectOwner.organizationId !== input.reservedVm.organizationId) {
          throw Object.assign(
            reservedVmStoreError('Reserved VM project ownership does not match the billing tenant.'),
            {
              code: 'RESERVED_VM_TENANT_FORBIDDEN',
              statusCode: 403,
            },
          );
        }

        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [reservedVmActorUserId],
          organizationIds: [input.reservedVm.organizationId],
          projectIds: [input.projectId],
        });
      }

      let accessPolicyVersion = input.accessPolicyVersion;

      if (input.accessPolicy) {
        const mode = normalizeDeploymentAccessMode(input.accessPolicy.mode);
        const passwordHash = input.accessPolicy.passwordHash?.trim();

        if ((mode === 'PASSWORD_PROTECTED') !== Boolean(passwordHash)) {
          throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_PASSWORD_HASH_INVALID')), {
            code: 'DEPLOYMENT_ACCESS_PASSWORD_INVALID',
          });
        }

        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          `deployment-access:${input.projectId}:${environment}`,
        );

        const latest = await tx.deploymentAccessPolicy.findFirst({
          where: { projectId: input.projectId, environment },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        accessPolicyVersion = (latest?.version ?? 0) + 1;
        await tx.deploymentAccessPolicy.create({
          data: {
            projectId: input.projectId,
            environment,
            version: accessPolicyVersion,
            mode,
            revision: randomUUID(),
            passwordHash: passwordHash ?? null,
            createdByUserId: input.accessPolicy.createdByUserId ?? null,
          },
        });
      } else if (accessPolicyVersion !== undefined) {
        const bound = await tx.deploymentAccessPolicy.findUnique({
          where: {
            projectId_environment_version: {
              projectId: input.projectId,
              environment,
              version: accessPolicyVersion,
            },
          },
          select: { id: true },
        });

        if (!bound) {
          throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_POLICY_NOT_FOUND')), {
            code: 'DEPLOYMENT_ACCESS_POLICY_NOT_FOUND',
          });
        }
      }

      const deployment = await tx.deployment.create({
        data: {
          projectId: input.projectId,
          workspaceId: input.workspaceId,
          provider: input.provider,
          environmentName: environment,
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
          ...(input.reservedVm
            ? {
                runtimeKind: 'reserved-vm',
                reservedVmTier: input.reservedVm.tier,
                reservedVmPriceCents: input.reservedVm.monthlyPriceCents,
                reservedVmTermsVersion: input.reservedVm.termsVersion,
                reservedVmRateCardVersion: input.reservedVm.rateCardVersion,
              }
            : {}),
          ...(accessPolicyVersion !== undefined ? { accessPolicyVersion } : {}),
          startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
          finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
          canceledAt: input.canceledAt ? new Date(input.canceledAt) : undefined,
        } as any,
      });

      if (input.reservedVm) {
        const persistentStorageClaim = `reserved-data-${deployment.id}`;
        const reservation = await ledger.reserveUsageInTransaction(tx, {
          organizationId: input.reservedVm.organizationId,
          userId: reservedVmActorUserId,
          idempotencyKey: `reserved-vm:${input.projectId}:${input.reservedVm.idempotencyKey}`,
          requestHash: input.reservedVm.requestHash,
          operation: 'reserved_vm_monthly',
          currency: 'usd',
          maxAmountMinor: BigInt(input.reservedVm.monthlyPriceCents),
          rateCardVersion: input.reservedVm.rateCardVersion,
          expiresInMs: 2 * 60 * 60_000,
        });

        await tx.deployment.update({
          where: { id: deployment.id },
          data: { persistentStorageClaim },
        });
        await tx.reservedVmOperation.create({
          data: {
            projectId: input.projectId,
            deploymentId: deployment.id,
            organizationId: input.reservedVm.organizationId,
            actorUserId: reservedVmActorUserId,
            idempotencyKey: input.reservedVm.idempotencyKey,
            requestHash: input.reservedVm.requestHash,
            kind: 'CREATE',
            fromRuntimeKind: null,
            fromTier: null,
            targetRuntimeKind: 'reserved-vm',
            targetTier: input.reservedVm.tier,
            targetMachineSize: input.reservedVm.tier,
            targetCpuMillicores: Math.round(RESERVED_VM_TIERS[input.reservedVm.tier].vcpu * 1_000),
            targetMemoryMb: RESERVED_VM_TIERS[input.reservedVm.tier].ramGb * 1_024,
            targetPriceCents: input.reservedVm.monthlyPriceCents,
            billingAmountCents: input.reservedVm.monthlyPriceCents,
            termsVersion: input.reservedVm.termsVersion,
            rateCardVersion: input.reservedVm.rateCardVersion,
            expectedRuntimeVersion: 0,
            billingReservationId: reservation.id,
          },
        });

        const updated = await tx.deployment.findUniqueOrThrow({ where: { id: deployment.id } });
        return mapDeployment(updated);
      }

      return mapDeployment(deployment);
    });
  }

  async createReservedVmChangeOperation(input: {
    projectId: string;
    deploymentId: string;
    organizationId: string;
    actorUserId: string;
    idempotencyKey: string;
    requestHash: string;
    expectedRuntimeVersion: number;
    targetRuntimeKind: DeploymentRuntimeKind;
    targetTier?: ReservedVmTier;
    targetMachineSize: string;
    targetCpuMillicores: number;
    targetMemoryMb: number;
    targetPriceCents: number;
    termsVersion: string;
    rateCardVersion: number;
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord; replayed: boolean }> {
    const ledger = new LedgerStore(this.prisma);
    const actorUserId = requireReservedVmActor(input.actorUserId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `reserved-vm:${input.projectId}:${input.idempotencyKey}`,
      );
      const replay = await tx.reservedVmOperation.findUnique({
        where: {
          projectId_idempotencyKey: { projectId: input.projectId, idempotencyKey: input.idempotencyKey },
        },
      });

      if (replay) {
        if (
          replay.requestHash !== input.requestHash ||
          replay.deploymentId !== input.deploymentId ||
          !replay.actorUserId ||
          replay.actorUserId !== actorUserId
        ) {
          throw Object.assign(reservedVmStoreError('Reserved VM idempotency key was reused for another request.'), {
            code: 'RESERVED_VM_IDEMPOTENCY_CONFLICT',
            statusCode: 409,
          });
        }

        const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: replay.deploymentId } });
        return { operation: publicReservedVmOperation(replay), deployment: mapDeployment(deployment), replayed: true };
      }

      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      await lockProjectAfterPurgeTopology(tx, input.projectId);
      await assertNoActiveProjectReleaseBarrier(tx, input.projectId);
      await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${input.deploymentId} FOR UPDATE`;
      const deployment = await tx.deployment.findFirst({
        where: { id: input.deploymentId, projectId: input.projectId },
      });

      if (!deployment) {
        throw Object.assign(reservedVmStoreError('Deployment not found.'), {
          code: 'DEPLOYMENT_NOT_FOUND',
          statusCode: 404,
        });
      }

      const projectOwner = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { organizationId: true },
      });

      if (!projectOwner || projectOwner.organizationId !== input.organizationId) {
        throw Object.assign(reservedVmStoreError('Reserved VM project ownership does not match the billing tenant.'), {
          code: 'RESERVED_VM_TENANT_FORBIDDEN',
          statusCode: 403,
        });
      }

      if (deployment.runtimeVersion !== input.expectedRuntimeVersion) {
        throw Object.assign(reservedVmStoreError('Deployment runtime changed concurrently.'), {
          code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
          statusCode: 409,
        });
      }

      const activeOperation = await tx.reservedVmOperation.findFirst({
        where: {
          deploymentId: deployment.id,
          status: { in: ['PENDING', 'APPLYING'] },
        },
        select: { id: true },
      });

      if (activeOperation) {
        throw Object.assign(reservedVmStoreError('Another Reserved VM runtime change is already in progress.'), {
          code: 'RESERVED_VM_CHANGE_IN_PROGRESS',
          statusCode: 409,
        });
      }

      const activeBillingPeriod = await tx.reservedVmBillingPeriod.findFirst({
        where: {
          deploymentId: deployment.id,
          status:
            input.targetRuntimeKind === 'reserved-vm'
              ? { in: ['PROCESSING', 'PAST_DUE', 'STOP_REQUIRED'] }
              : 'PROCESSING',
        },
        select: { id: true },
      });

      if (activeBillingPeriod) {
        throw Object.assign(reservedVmStoreError('Reserved VM monthly billing is already being settled.'), {
          code: 'RESERVED_VM_BILLING_IN_PROGRESS',
          statusCode: 409,
        });
      }

      if (input.targetRuntimeKind === 'reserved-vm') {
        const exactPrice = input.targetTier ? RESERVED_VM_TIERS[input.targetTier]?.centsPerMonth : undefined;
        const exactCpu = input.targetTier ? Math.round(RESERVED_VM_TIERS[input.targetTier].vcpu * 1_000) : undefined;
        const exactMemory = input.targetTier ? RESERVED_VM_TIERS[input.targetTier].ramGb * 1_024 : undefined;

        if (
          !input.targetTier ||
          exactPrice !== input.targetPriceCents ||
          input.targetMachineSize !== input.targetTier ||
          input.targetCpuMillicores !== exactCpu ||
          input.targetMemoryMb !== exactMemory
        ) {
          throw Object.assign(reservedVmStoreError('Reserved VM tier or price confirmation is stale.'), {
            code: 'RESERVED_VM_PRICE_MISMATCH',
            statusCode: 409,
          });
        }
      } else if (
        input.targetTier ||
        input.targetPriceCents !== 0 ||
        !Number.isSafeInteger(input.targetCpuMillicores) ||
        input.targetCpuMillicores <= 0 ||
        !Number.isSafeInteger(input.targetMemoryMb) ||
        input.targetMemoryMb <= 0
      ) {
        throw Object.assign(reservedVmStoreError('Autoscale cannot carry a Reserved VM tier or price.'), {
          code: 'RESERVED_VM_TARGET_INVALID',
          statusCode: 400,
        });
      }

      if (
        (deployment.runtimeKind ?? 'autoscale') === input.targetRuntimeKind &&
        deployment.machineSize === input.targetMachineSize &&
        (deployment.reservedVmTier ?? undefined) === input.targetTier &&
        deployment.reservedVmBillingState !== 'SUSPENDED'
      ) {
        throw Object.assign(reservedVmStoreError('The requested runtime configuration is already active.'), {
          code: 'RESERVED_VM_NO_CHANGE',
          statusCode: 409,
        });
      }

      const billingAmountCents =
        input.targetRuntimeKind === 'reserved-vm'
          ? deployment.reservedVmBillingState === 'SUSPENDED'
            ? input.targetPriceCents
            : Math.max(0, input.targetPriceCents - Number(deployment.reservedVmPriceCents ?? 0))
          : 0;
      const billingReservation =
        billingAmountCents > 0
          ? await ledger.reserveUsageInTransaction(tx, {
              organizationId: input.organizationId,
              userId: actorUserId,
              idempotencyKey: `reserved-vm:${input.projectId}:${input.idempotencyKey}`,
              requestHash: input.requestHash,
              operation: 'reserved_vm_monthly',
              currency: 'usd',
              maxAmountMinor: BigInt(billingAmountCents),
              rateCardVersion: input.rateCardVersion,
              expiresInMs: 2 * 60 * 60_000,
            })
          : undefined;
      const operation = await tx.reservedVmOperation.create({
        data: {
          projectId: input.projectId,
          deploymentId: input.deploymentId,
          organizationId: input.organizationId,
          actorUserId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          kind: 'CHANGE',
          fromRuntimeKind: deployment.runtimeKind ?? 'autoscale',
          fromTier: deployment.reservedVmTier ?? null,
          targetRuntimeKind: input.targetRuntimeKind,
          targetTier: input.targetTier ?? null,
          targetMachineSize: input.targetMachineSize,
          targetCpuMillicores: input.targetCpuMillicores,
          targetMemoryMb: input.targetMemoryMb,
          targetPriceCents: input.targetPriceCents,
          billingAmountCents,
          termsVersion: input.termsVersion,
          rateCardVersion: input.rateCardVersion,
          expectedRuntimeVersion: input.expectedRuntimeVersion,
          billingReservationId: billingReservation?.id ?? null,
        },
      });

      return {
        operation: publicReservedVmOperation(operation),
        deployment: mapDeployment(deployment),
        replayed: false,
      };
    });
  }

  async createReservedVmRedeployOperation(input: {
    projectId: string;
    deploymentId: string;
    organizationId: string;
    actorUserId: string;
    idempotencyKey: string;
    requestHash: string;
    expectedRuntimeVersion: number;
    planEntitlements: ReleasePlanEntitlementsPin;
    projectManifestDigest: string;
    encryptedBuildInput: { keyId: string; ciphertext: string };
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord; replayed: boolean }> {
    const actorUserId = requireReservedVmActor(input.actorUserId);
    const planEntitlements = parseReleasePlanEntitlementsPin(input.planEntitlements);

    if (!planEntitlements || !PROJECT_MANIFEST_DIGEST_PATTERN.test(input.projectManifestDigest)) {
      throw Object.assign(reservedVmStoreError('Reserved VM redeploy release pins are invalid.'), {
        code: 'RESERVED_VM_REDEPLOY_PIN_INVALID',
        statusCode: 409,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `reserved-vm:${input.projectId}:${input.idempotencyKey}`,
      );
      const replay = await tx.reservedVmOperation.findUnique({
        where: {
          projectId_idempotencyKey: { projectId: input.projectId, idempotencyKey: input.idempotencyKey },
        },
      });

      if (replay) {
        const replayIntent = parseReservedVmRedeployReleaseIntent(replay.response);
        if (
          replay.kind !== 'REDEPLOY' ||
          replay.requestHash !== input.requestHash ||
          replay.deploymentId !== input.deploymentId ||
          !replay.actorUserId ||
          replay.actorUserId !== actorUserId ||
          !replayIntent ||
          !sameReleasePlanEntitlementsPin(replayIntent.targetPlanEntitlements, planEntitlements) ||
          replayIntent.targetProjectManifestDigest !== input.projectManifestDigest
        ) {
          throw Object.assign(reservedVmStoreError('Reserved VM idempotency key was reused for another request.'), {
            code: 'RESERVED_VM_IDEMPOTENCY_CONFLICT',
            statusCode: 409,
          });
        }

        const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: replay.deploymentId } });
        return { operation: publicReservedVmOperation(replay), deployment: mapDeployment(deployment), replayed: true };
      }

      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      await lockProjectAfterPurgeTopology(tx, input.projectId);
      await assertNoActiveProjectReleaseBarrier(tx, input.projectId);
      await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${input.deploymentId} FOR UPDATE`;
      const deployment = await tx.deployment.findFirst({
        where: { id: input.deploymentId, projectId: input.projectId },
      });

      if (!deployment) {
        throw Object.assign(reservedVmStoreError('Deployment not found.'), {
          code: 'DEPLOYMENT_NOT_FOUND',
          statusCode: 404,
        });
      }

      const projectOwner = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { organizationId: true },
      });

      if (!projectOwner || projectOwner.organizationId !== input.organizationId) {
        throw Object.assign(reservedVmStoreError('Reserved VM project ownership does not match the billing tenant.'), {
          code: 'RESERVED_VM_TENANT_FORBIDDEN',
          statusCode: 403,
        });
      }

      if (
        deployment.provider !== 'server' ||
        deployment.status !== 'READY' ||
        deployment.runtimeKind !== 'reserved-vm' ||
        !deployment.reservedVmTier ||
        !deployment.reservedVmPriceCents ||
        !deployment.reservedVmTermsVersion ||
        !deployment.reservedVmRateCardVersion ||
        !deployment.reservedVmBillingState ||
        deployment.reservedVmBillingState !== 'CURRENT'
      ) {
        throw Object.assign(reservedVmStoreError('Only a current, ready Reserved VM can be redeployed in place.'), {
          code: 'RESERVED_VM_REDEPLOY_NOT_READY',
          statusCode: 409,
        });
      }

      if (deployment.runtimeVersion !== input.expectedRuntimeVersion) {
        throw Object.assign(reservedVmStoreError('Deployment runtime changed concurrently.'), {
          code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
          statusCode: 409,
        });
      }

      const currentMetadata =
        deployment.metadata && typeof deployment.metadata === 'object' && !Array.isArray(deployment.metadata)
          ? (deployment.metadata as Record<string, unknown>)
          : {};
      const priorPlanEntitlements = parseReleasePlanEntitlementsPin(currentMetadata.planEntitlements);
      const priorProjectManifestDigest = deploymentProjectManifestDigest(currentMetadata);

      if (!priorPlanEntitlements || !priorProjectManifestDigest) {
        throw Object.assign(reservedVmStoreError('Reserved VM redeploy source release pins are invalid.'), {
          code: 'RESERVED_VM_REDEPLOY_PIN_INVALID',
          statusCode: 409,
        });
      }

      const activeOperation = await tx.reservedVmOperation.findFirst({
        where: { deploymentId: deployment.id, status: { in: ['PENDING', 'APPLYING'] } },
        select: { id: true },
      });

      if (activeOperation) {
        throw Object.assign(reservedVmStoreError('Another Reserved VM operation is already in progress.'), {
          code: 'RESERVED_VM_CHANGE_IN_PROGRESS',
          statusCode: 409,
        });
      }

      const operation = await tx.reservedVmOperation.create({
        data: {
          projectId: input.projectId,
          deploymentId: input.deploymentId,
          organizationId: input.organizationId,
          actorUserId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          kind: 'REDEPLOY',
          fromRuntimeKind: 'reserved-vm',
          fromTier: deployment.reservedVmTier,
          targetRuntimeKind: 'reserved-vm',
          targetTier: deployment.reservedVmTier,
          targetMachineSize: deployment.machineSize,
          targetCpuMillicores: Math.round(RESERVED_VM_TIERS[deployment.reservedVmTier as ReservedVmTier].vcpu * 1_000),
          targetMemoryMb: RESERVED_VM_TIERS[deployment.reservedVmTier as ReservedVmTier].ramGb * 1_024,
          targetPriceCents: deployment.reservedVmPriceCents,
          billingAmountCents: 0,
          termsVersion: deployment.reservedVmTermsVersion,
          rateCardVersion: deployment.reservedVmRateCardVersion,
          expectedRuntimeVersion: input.expectedRuntimeVersion,
          response: {
            redeployIntent: {
              version: 1,
              priorPlanEntitlements,
              priorProjectManifestDigest,
              targetPlanEntitlements: planEntitlements,
              targetProjectManifestDigest: input.projectManifestDigest,
            },
          } as unknown as Prisma.InputJsonValue,
        },
      });
      const durableDeployment = await tx.deployment.update({
        where: { id: deployment.id },
        data: {
          metadata: {
            ...currentMetadata,
            reservedVmOperationKey: input.idempotencyKey,
            reservedVmRedeploy: {
              operationId: operation.id,
              idempotencyKey: input.idempotencyKey,
              expectedRuntimeVersion: input.expectedRuntimeVersion,
              encryptedBuildInput: input.encryptedBuildInput,
              priorPlanEntitlements,
              priorProjectManifestDigest,
              targetPlanEntitlements: planEntitlements,
              targetProjectManifestDigest: input.projectManifestDigest,
            },
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        operation: publicReservedVmOperation(operation),
        deployment: mapDeployment(durableDeployment),
        replayed: false,
      };
    });
  }

  async createReservedVmDecommissionOperation(input: {
    projectId: string;
    deploymentId: string;
    organizationId: string;
    actorUserId: string;
    idempotencyKey: string;
    requestHash: string;
    expectedRuntimeVersion: number;
    targetMachineSize: string;
    targetCpuMillicores: number;
    targetMemoryMb: number;
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord; replayed: boolean }> {
    const actorUserId = requireReservedVmActor(input.actorUserId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `reserved-vm:${input.projectId}:${input.idempotencyKey}`,
      );
      const replay = await tx.reservedVmOperation.findUnique({
        where: {
          projectId_idempotencyKey: { projectId: input.projectId, idempotencyKey: input.idempotencyKey },
        },
      });

      if (replay) {
        if (
          replay.kind !== 'DECOMMISSION' ||
          replay.requestHash !== input.requestHash ||
          replay.deploymentId !== input.deploymentId ||
          !replay.actorUserId ||
          replay.actorUserId !== actorUserId
        ) {
          throw Object.assign(reservedVmStoreError('RESERVED_VM_IDEMPOTENCY_CONFLICT'), {
            code: 'RESERVED_VM_IDEMPOTENCY_CONFLICT',
            statusCode: 409,
          });
        }

        const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: replay.deploymentId } });
        return { operation: publicReservedVmOperation(replay), deployment: mapDeployment(deployment), replayed: true };
      }

      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      await lockProjectAfterPurgeTopology(tx, input.projectId);
      await assertNoActiveProjectReleaseBarrier(tx, input.projectId);
      await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${input.deploymentId} FOR UPDATE`;
      const deployment = await tx.deployment.findFirst({
        where: { id: input.deploymentId, projectId: input.projectId },
      });

      if (!deployment) {
        throw Object.assign(reservedVmStoreError('DEPLOYMENT_NOT_FOUND'), {
          code: 'DEPLOYMENT_NOT_FOUND',
          statusCode: 404,
        });
      }

      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { organizationId: true },
      });

      if (!project || project.organizationId !== input.organizationId) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_TENANT_FORBIDDEN'), {
          code: 'RESERVED_VM_TENANT_FORBIDDEN',
          statusCode: 403,
        });
      }

      if (
        deployment.provider !== 'server' ||
        deployment.status !== 'READY' ||
        deployment.runtimeKind !== 'autoscale' ||
        deployment.persistentStorageClaim !== `reserved-data-${deployment.id}`
      ) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_DECOMMISSION_NOT_READY'), {
          code: 'RESERVED_VM_DECOMMISSION_NOT_READY',
          statusCode: 409,
        });
      }

      if (
        deployment.runtimeVersion !== input.expectedRuntimeVersion ||
        !Number.isSafeInteger(input.targetCpuMillicores) ||
        input.targetCpuMillicores <= 0 ||
        !Number.isSafeInteger(input.targetMemoryMb) ||
        input.targetMemoryMb <= 0 ||
        deployment.machineSize !== input.targetMachineSize
      ) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_RUNTIME_VERSION_CONFLICT'), {
          code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
          statusCode: 409,
        });
      }

      const activeOperation = await tx.reservedVmOperation.findFirst({
        where: { deploymentId: deployment.id, status: { in: ['PENDING', 'APPLYING'] } },
        select: { id: true },
      });
      const activeBillingPeriod = await tx.reservedVmBillingPeriod.findFirst({
        where: { deploymentId: deployment.id, status: { in: ['DUE', 'PROCESSING', 'PAST_DUE', 'STOP_REQUIRED'] } },
        select: { id: true },
      });

      if (activeOperation || activeBillingPeriod) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_DECOMMISSION_IN_PROGRESS'), {
          code: 'RESERVED_VM_DECOMMISSION_IN_PROGRESS',
          statusCode: 409,
        });
      }

      const operation = await tx.reservedVmOperation.create({
        data: {
          projectId: input.projectId,
          deploymentId: input.deploymentId,
          organizationId: input.organizationId,
          actorUserId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          kind: 'DECOMMISSION',
          fromRuntimeKind: 'autoscale',
          fromTier: null,
          targetRuntimeKind: 'autoscale',
          targetTier: null,
          targetMachineSize: input.targetMachineSize,
          targetCpuMillicores: input.targetCpuMillicores,
          targetMemoryMb: input.targetMemoryMb,
          targetPriceCents: 0,
          billingAmountCents: 0,
          termsVersion: 'reserved-vm-storage-decommission-v1',
          rateCardVersion: 1,
          expectedRuntimeVersion: input.expectedRuntimeVersion,
        },
      });

      return {
        operation: publicReservedVmOperation(operation),
        deployment: mapDeployment(deployment),
        replayed: false,
      };
    });
  }

  async getReservedVmOperation(projectId: string, idempotencyKey: string) {
    const operation = await this.prisma.reservedVmOperation.findUnique({
      where: { projectId_idempotencyKey: { projectId, idempotencyKey } },
    });
    return operation ? publicReservedVmOperation(operation) : undefined;
  }

  async acquireReservedVmOperation(input: {
    projectId: string;
    idempotencyKey: string;
    ownerToken: string;
    ttlMs: number;
  }): Promise<{ operation: ReservedVmLease; deployment: DeploymentRecord; acquired: boolean }> {
    const ownerToken = requireReservedVmLeaseOwner(input.ownerToken);
    return this.prisma.$transaction(async (tx) => {
      const preliminary = await tx.reservedVmOperation.findUnique({
        where: {
          projectId_idempotencyKey: { projectId: input.projectId, idempotencyKey: input.idempotencyKey },
        },
      });

      if (!preliminary) {
        throw Object.assign(reservedVmStoreError('Reserved VM operation not found.'), {
          code: 'RESERVED_VM_OPERATION_NOT_FOUND',
          statusCode: 404,
        });
      }

      /* Purge locks must precede every saga/effect row lock. */
      const actorUserId = requireReservedVmActor(preliminary.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      const selected = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ReservedVmOperation"
        WHERE "projectId" = ${input.projectId} AND "idempotencyKey" = ${input.idempotencyKey}
        FOR UPDATE
      `;
      const id = selected[0]?.id;

      if (!id) throw reservedVmStoreError('RESERVED_VM_OPERATION_NOT_FOUND');

      const now = await databaseNow(tx);
      const operation = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id } });
      const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: operation.deploymentId } });

      if (operation.status === 'COMPLETED' || operation.status === 'FAILED') {
        return { operation: mapReservedVmOperation(operation), deployment: mapDeployment(deployment), acquired: false };
      }

      if (operation.kind === 'CREATE' && operation.errorCode === 'RESERVED_VM_CANCEL_REQUESTED') {
        return { operation: mapReservedVmOperation(operation), deployment: mapDeployment(deployment), acquired: false };
      }

      if (
        operation.leaseOwner &&
        operation.leaseOwner !== ownerToken &&
        operation.leaseExpiresAt &&
        operation.leaseExpiresAt > now
      ) {
        return { operation: mapReservedVmOperation(operation), deployment: mapDeployment(deployment), acquired: false };
      }

      /*
       * External side effects need a fence that never resets when a new
       * operation row is created. Increment the owning Deployment sequence
       * under the same transaction/row lock and copy that value into the
       * operation lease. A recovered lease therefore supersedes its crashed
       * predecessor too, not only operations for later runtime versions.
       */
      const deploymentFence = await tx.deployment.update({
        where: { id: operation.deploymentId },
        data: { runtimeFencingToken: { increment: 1 } },
        select: { runtimeFencingToken: true },
      });
      const claimed = await tx.reservedVmOperation.update({
        where: { id: operation.id },
        data: {
          status: 'APPLYING',
          ...(operation.phase === 'RUNTIME_APPLIED' ? {} : { phase: 'LEASED' }),
          leaseOwner: ownerToken,
          leaseExpiresAt: databaseLeaseExpiry(now, input.ttlMs),
          fencingToken: deploymentFence.runtimeFencingToken,
        },
      });
      return { operation: mapReservedVmOperation(claimed), deployment: mapDeployment(deployment), acquired: true };
    });
  }

  async acquireReservedVmCreateCancellation(input: {
    projectId: string;
    deploymentId: string;
    actorUserId: string;
    ownerToken: string;
    ttlMs: number;
  }): Promise<{ operation: ReservedVmLease; deployment: DeploymentRecord; acquired: boolean }> {
    const actorUserId = requireReservedVmActor(input.actorUserId);
    const ownerToken = requireReservedVmLeaseOwner(input.ownerToken);

    return this.prisma.$transaction(async (tx) => {
      const preliminary = await tx.reservedVmOperation.findFirst({
        where: { projectId: input.projectId, deploymentId: input.deploymentId, kind: 'CREATE' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      if (!preliminary) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_OPERATION_NOT_FOUND'), {
          code: 'RESERVED_VM_OPERATION_NOT_FOUND',
          statusCode: 404,
        });
      }

      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId, requireReservedVmActor(preliminary.actorUserId)],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "ReservedVmOperation" WHERE "id" = ${preliminary.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${input.deploymentId} FOR UPDATE`;
      const operation = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: preliminary.id } });
      const deployment = await tx.deployment.findFirstOrThrow({
        where: { id: input.deploymentId, projectId: input.projectId },
      });
      const now = await databaseNow(tx);

      if (operation.status === 'FAILED' && deployment.status === 'CANCELED') {
        return { operation: mapReservedVmOperation(operation), deployment: mapDeployment(deployment), acquired: false };
      }

      if (
        operation.errorCode === 'RESERVED_VM_CANCEL_REQUESTED' &&
        operation.leaseOwner &&
        operation.leaseExpiresAt &&
        operation.leaseExpiresAt > now
      ) {
        return { operation: mapReservedVmOperation(operation), deployment: mapDeployment(deployment), acquired: false };
      }

      if (
        !['PENDING', 'APPLYING'].includes(operation.status) ||
        !['QUEUED', 'BUILDING'].includes(deployment.status) ||
        deployment.runtimeVersion !== operation.expectedRuntimeVersion
      ) {
        throw Object.assign(reservedVmStoreError('DEPLOYMENT_NOT_CANCELABLE'), {
          code: 'DEPLOYMENT_NOT_CANCELABLE',
          statusCode: 409,
        });
      }

      const deploymentFence = await tx.deployment.update({
        where: { id: deployment.id },
        data: {
          runtimeFencingToken: { increment: 1 },
          metadata: {
            ...((deployment.metadata as Record<string, unknown> | null) ?? {}),
            reservedVmCancelRequestedAt: now.toISOString(),
            reservedVmCancelRequestedBy: actorUserId,
          } as Prisma.InputJsonValue,
        },
        select: { runtimeFencingToken: true },
      });
      const claimed = await tx.reservedVmOperation.update({
        where: { id: operation.id },
        data: {
          status: 'APPLYING',
          phase: 'LEASED',
          leaseOwner: ownerToken,
          leaseExpiresAt: databaseLeaseExpiry(now, input.ttlMs),
          fencingToken: deploymentFence.runtimeFencingToken,
          errorCode: 'RESERVED_VM_CANCEL_REQUESTED',
          errorMessage: null,
        },
      });
      const durableDeployment = await tx.deployment.findUniqueOrThrow({ where: { id: deployment.id } });

      return {
        operation: mapReservedVmOperation(claimed),
        deployment: mapDeployment(durableDeployment),
        acquired: true,
      };
    });
  }

  async claimNextReservedVmCreateCancellation(input: {
    ownerToken: string;
    ttlMs: number;
  }): Promise<{ operation: ReservedVmLease; deployment: DeploymentRecord } | undefined> {
    const ownerToken = requireReservedVmLeaseOwner(input.ownerToken);

    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ReservedVmOperation"
        WHERE "kind" = 'CREATE'
          AND "status" = 'APPLYING'
          AND "errorCode" = 'RESERVED_VM_CANCEL_REQUESTED'
          AND "actorUserId" IS NOT NULL
          AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= clock_timestamp())
        ORDER BY "updatedAt" ASC, "id" ASC
        LIMIT 1
      `;
      const candidateId = candidates[0]?.id;

      if (!candidateId) return undefined;
      const preliminary = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: candidateId } });
      const actorUserId = requireReservedVmActor(preliminary.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      const selected = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ReservedVmOperation"
        WHERE "id" = ${preliminary.id}
          AND "kind" = 'CREATE'
          AND "status" = 'APPLYING'
          AND "errorCode" = 'RESERVED_VM_CANCEL_REQUESTED'
          AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= clock_timestamp())
        FOR UPDATE SKIP LOCKED
      `;

      if (!selected[0]) return undefined;
      const now = await databaseNow(tx);
      await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${preliminary.deploymentId} FOR UPDATE`;
      const fence = await tx.deployment.update({
        where: { id: preliminary.deploymentId },
        data: { runtimeFencingToken: { increment: 1 } },
        select: { runtimeFencingToken: true },
      });
      const claimed = await tx.reservedVmOperation.update({
        where: { id: preliminary.id },
        data: {
          leaseOwner: ownerToken,
          leaseExpiresAt: databaseLeaseExpiry(now, input.ttlMs),
          fencingToken: fence.runtimeFencingToken,
        },
      });
      const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: preliminary.deploymentId } });
      return { operation: mapReservedVmOperation(claimed), deployment: mapDeployment(deployment) };
    });
  }

  async claimNextRecoverableReservedVmOperation(input: {
    ownerToken: string;
    ttlMs: number;
    kinds?: Array<'CREATE' | 'CHANGE' | 'REDEPLOY' | 'DECOMMISSION'>;
  }): Promise<{ operation: ReservedVmLease; deployment: DeploymentRecord } | undefined> {
    const ownerToken = requireReservedVmLeaseOwner(input.ownerToken);
    const kinds: Array<'CREATE' | 'CHANGE' | 'REDEPLOY' | 'DECOMMISSION'> = [
      ...new Set<'CREATE' | 'CHANGE' | 'REDEPLOY' | 'DECOMMISSION'>(
        input.kinds?.length ? input.kinds : ['CHANGE', 'REDEPLOY', 'DECOMMISSION'],
      ),
    ];

    return this.prisma.$transaction(async (tx) => {
      const now = await databaseNow(tx);
      const preliminary = await tx.reservedVmOperation.findFirst({
        where: {
          status: { in: ['PENDING', 'APPLYING'] },
          kind: { in: kinds },
          actorUserId: { not: null },
          NOT: { errorCode: 'RESERVED_VM_CANCEL_REQUESTED' },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      if (!preliminary) return undefined;

      /* User -> topology purge guards are acquired before the operation row. */
      const actorUserId = requireReservedVmActor(preliminary.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      const selected = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "ReservedVmOperation"
        WHERE "id" = ${preliminary.id}
          AND "status" IN ('PENDING', 'APPLYING')
          AND ("errorCode" IS NULL OR "errorCode" <> 'RESERVED_VM_CANCEL_REQUESTED')
          AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= clock_timestamp())
        FOR UPDATE SKIP LOCKED
      `;
      const id = selected[0]?.id;

      if (!id) return undefined;

      const operation = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id } });
      await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${operation.deploymentId} FOR UPDATE`;
      const deploymentFence = await tx.deployment.update({
        where: { id: operation.deploymentId },
        data: { runtimeFencingToken: { increment: 1 } },
        select: { runtimeFencingToken: true },
      });
      const claimed = await tx.reservedVmOperation.update({
        where: { id },
        data: {
          status: 'APPLYING',
          ...(operation.phase === 'RUNTIME_APPLIED' ? {} : { phase: 'LEASED' }),
          leaseOwner: ownerToken,
          leaseExpiresAt: databaseLeaseExpiry(now, input.ttlMs),
          fencingToken: deploymentFence.runtimeFencingToken,
        },
      });
      const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: operation.deploymentId } });

      return { operation: mapReservedVmOperation(claimed), deployment: mapDeployment(deployment) };
    });
  }

  async deferReservedVmRecovery(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
    retryClass: 'TRANSIENT' | 'MANUAL';
  }): Promise<ReservedVmLease> {
    const ownerToken = requireReservedVmLeaseOwner(input.ownerToken);
    const errorCode = input.errorCode.replace(/[^A-Za-z0-9_.:-]/gu, '_').slice(0, 120) || 'RECOVERY_FAILED';
    const errorMessage = input.errorMessage.replace(/[\r\n\t]+/gu, ' ').slice(0, 1_000);

    return this.prisma.$transaction(async (tx) => {
      const preliminary = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: input.operationId } });
      const actorUserId = requireReservedVmActor(preliminary.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "ReservedVmOperation" WHERE "id" = ${input.operationId} FOR UPDATE`;
      const operation = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: input.operationId } });
      const now = await databaseNow(tx);

      if (
        !['PENDING', 'APPLYING'].includes(operation.status) ||
        operation.leaseOwner !== ownerToken ||
        operation.fencingToken !== input.fencingToken ||
        !operation.leaseExpiresAt ||
        operation.leaseExpiresAt <= now
      ) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_OPERATION_FENCE_LOST'), {
          code: 'RESERVED_VM_OPERATION_FENCE_LOST',
          statusCode: 409,
        });
      }

      const response =
        operation.response && typeof operation.response === 'object' && !Array.isArray(operation.response)
          ? (operation.response as Record<string, unknown>)
          : {};
      const priorRecovery =
        response.recovery && typeof response.recovery === 'object' && !Array.isArray(response.recovery)
          ? (response.recovery as Record<string, unknown>)
          : {};
      const priorAttempts =
        typeof priorRecovery.attempts === 'number' && Number.isSafeInteger(priorRecovery.attempts)
          ? priorRecovery.attempts
          : 0;
      const attempts = Math.min(30, Math.max(0, priorAttempts) + 1);
      const delayMs =
        input.retryClass === 'MANUAL' ? 24 * 60 * 60_000 : Math.min(5 * 60_000, 5_000 * 2 ** Math.min(6, attempts - 1));

      const deferred = await tx.reservedVmOperation.update({
        where: { id: operation.id },
        data: {
          leaseOwner: null,
          leaseExpiresAt: new Date(now.getTime() + delayMs),
          errorCode,
          errorMessage,
          response: {
            ...response,
            recovery: {
              attempts,
              retryClass: input.retryClass,
              deferredUntil: new Date(now.getTime() + delayMs).toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      });

      return mapReservedVmOperation(deferred);
    });
  }

  async prepareReservedVmPublish(input: {
    projectId: string;
    deploymentId: string;
    organizationId: string;
    actorUserId: string;
    expectedRuntimeVersion: number;
    releaseFence: ProjectReleaseFence;
  }): Promise<{ deployment: DeploymentRecord; releaseSource: ReleaseManifestRecord }> {
    const actorUserId = requireReservedVmActor(input.actorUserId);
    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      await lockProjectAfterPurgeTopology(tx, input.projectId);
      await requireProjectReleaseFence(tx, input.projectId, input.releaseFence);
      const candidate = await requireReservedVmPublishCandidate(tx, input);

      return {
        deployment: mapDeployment(candidate.deployment),
        releaseSource: mapReleaseManifest(candidate.releaseSource),
      };
    });
  }

  async publishReservedVmInPlace(input: {
    projectId: string;
    deploymentId: string;
    organizationId: string;
    actorUserId: string;
    expectedRuntimeVersion: number;
    productionUrl: string;
    sourceReleaseManifestId: string;
    dbMigrationPoint?: string;
    runtimeSpec: unknown;
    promotionEvidence: unknown;
    releaseFence: ProjectReleaseFence;
  }): Promise<DeploymentRecord> {
    const actorUserId = requireReservedVmActor(input.actorUserId);
    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      await lockProjectAfterPurgeTopology(tx, input.projectId);
      await requireProjectReleaseFence(tx, input.projectId, input.releaseFence);
      const { deployment, metadata, releaseSource, replayed } = await requireReservedVmPublishCandidate(tx, input);
      const serverDeploy = metadata.serverDeploy as Record<string, unknown> | undefined;
      const releaseSourcePin = parseReleasePlanEntitlementsPin(releaseSource.planEntitlements);

      if (!releaseSourcePin || releaseSource.projectManifestDigest !== input.releaseFence.expectedManifestDigest) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_RELEASE_SOURCE_INVALID'), {
          code: 'RESERVED_VM_RELEASE_SOURCE_INVALID',
          statusCode: 409,
        });
      }
      const publishedPins = validateServerReleaseCommitPins({
        runtimeSpec: input.runtimeSpec,
        promotionEvidence: input.promotionEvidence,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environment: 'production',
        projectManifestDigest: input.releaseFence.expectedManifestDigest,
        planEntitlements: releaseSourcePin,
        accessPolicyVersion: releaseSource.accessPolicyVersion,
        machineKey: deployment.machineSize ?? '',
        artifactRef: releaseSource.artifactRef,
        artifactDigest: releaseSource.artifactDigest,
        dbMigrationPoint: input.dbMigrationPoint,
        promotion: serverDeploy?.promotion,
      });
      const sourcePins = parseServerRollbackRuntimeSpec(releaseSource.runtimeSpec);
      const sourcePromotion = parseServerRollbackPromotionEvidence(releaseSource.promotionEvidence);
      if (
        !sameServerRollbackRuntimePinsForPublish(
          { runtimeSpec: sourcePins.spec, envOverrides: sourcePins.envOverrides },
          publishedPins,
        ) ||
        sourcePromotion.hash !== publishedPins.promotionEvidence.hash
      ) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_RELEASE_SOURCE_INVALID'), {
          code: 'RESERVED_VM_RELEASE_SOURCE_INVALID',
          statusCode: 409,
        });
      }

      if (replayed) {
        return mapDeployment(deployment);
      }

      const publishedAt = await databaseNow(tx);
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `release-manifest:${input.projectId}:production`,
      );
      const latest = await tx.releaseManifest.findFirst({
        where: { projectId: input.projectId, environment: 'production' },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      await tx.releaseManifest.create({
        data: {
          projectId: input.projectId,
          deploymentId: deployment.id,
          environment: 'production',
          version: (latest?.version ?? 0) + 1,
          provider: releaseSource.provider,
          artifactKind: releaseSource.artifactKind,
          artifactRef: releaseSource.artifactRef,
          artifactDigest: releaseSource.artifactDigest,
          storeGeneration: releaseSource.storeGeneration,
          configDigest: releaseSource.configDigest,
          dbMigrationPoint: input.dbMigrationPoint,
          runtimeSpec: input.runtimeSpec as Prisma.InputJsonValue,
          promotionEvidence: input.promotionEvidence as Prisma.InputJsonValue,
          accessPolicyVersion: releaseSource.accessPolicyVersion,
          planEntitlements: releaseSourcePin as unknown as Prisma.InputJsonValue,
          projectManifestDigest: releaseSource.projectManifestDigest,
        },
      });
      const updated = await tx.deployment.updateMany({
        where: {
          id: deployment.id,
          projectId: input.projectId,
          runtimeVersion: input.expectedRuntimeVersion,
          runtimeKind: 'reserved-vm',
          status: 'READY',
          environmentName: deployment.environmentName,
        },
        data: {
          environmentName: 'production',
          productionUrl: input.productionUrl,
          metadata: {
            ...metadata,
            publishedInPlaceAt: publishedAt.toISOString(),
            publishedFrom: deployment.id,
            publishedFromReleaseManifestId: releaseSource.id,
          } as Prisma.InputJsonValue,
        },
      });

      if (updated.count !== 1) {
        throw Object.assign(reservedVmStoreError('Deployment runtime changed concurrently.'), {
          code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
          statusCode: 409,
        });
      }

      return mapDeployment(await tx.deployment.findUniqueOrThrow({ where: { id: deployment.id } }));
    });
  }

  async markReservedVmRuntimeApplied(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const preliminary = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: input.operationId } });
      const actorUserId = requireReservedVmActor(preliminary.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      const now = await databaseNow(tx);
      const updated = await tx.reservedVmOperation.updateMany({
        where: {
          id: input.operationId,
          status: 'APPLYING',
          leaseOwner: input.ownerToken,
          fencingToken: input.fencingToken,
          leaseExpiresAt: { gt: now },
        },
        data: { phase: 'RUNTIME_APPLIED' },
      });
      return updated.count === 1;
    });
  }

  async commitReservedVmOperation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    response: Record<string, unknown>;
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord }> {
    const ledger = new LedgerStore(this.prisma);

    return this.prisma.$transaction((tx) => commitReservedVmOperationInTransaction(tx, ledger, input));
  }

  async commitReservedVmDecommissionOperation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    deletedPersistentStorageClaim: string;
    response: Record<string, unknown>;
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord }> {
    return this.prisma.$transaction(async (tx) => {
      const preliminary = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: input.operationId } });
      const actorUserId = requireReservedVmActor(preliminary.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "ReservedVmOperation" WHERE "id" = ${input.operationId} FOR UPDATE`;
      const now = await databaseNow(tx);
      const operation = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: input.operationId } });

      if (operation.status === 'COMPLETED') {
        const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: operation.deploymentId } });
        return { operation: publicReservedVmOperation(operation), deployment: mapDeployment(deployment) };
      }

      if (
        operation.kind !== 'DECOMMISSION' ||
        operation.status !== 'APPLYING' ||
        operation.phase !== 'RUNTIME_APPLIED' ||
        operation.leaseOwner !== input.ownerToken ||
        operation.fencingToken !== input.fencingToken ||
        !operation.leaseExpiresAt ||
        operation.leaseExpiresAt <= now
      ) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_OPERATION_FENCE_LOST'), {
          code: 'RESERVED_VM_OPERATION_FENCE_LOST',
          statusCode: 409,
        });
      }

      await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${operation.deploymentId} FOR UPDATE`;
      const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: operation.deploymentId } });
      const canonicalClaim = `reserved-data-${deployment.id}`;

      if (
        deployment.runtimeVersion !== operation.expectedRuntimeVersion ||
        deployment.runtimeKind !== 'autoscale' ||
        deployment.persistentStorageClaim !== canonicalClaim ||
        input.deletedPersistentStorageClaim !== canonicalClaim
      ) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_RUNTIME_VERSION_CONFLICT'), {
          code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
          statusCode: 409,
        });
      }

      const activeBilling = await tx.reservedVmBillingPeriod.findFirst({
        where: { deploymentId: deployment.id, status: { in: ['DUE', 'PROCESSING', 'PAST_DUE', 'STOP_REQUIRED'] } },
        select: { id: true },
      });

      if (activeBilling) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_DECOMMISSION_IN_PROGRESS'), {
          code: 'RESERVED_VM_DECOMMISSION_IN_PROGRESS',
          statusCode: 409,
        });
      }

      const updated = await tx.deployment.updateMany({
        where: {
          id: deployment.id,
          runtimeKind: 'autoscale',
          runtimeVersion: operation.expectedRuntimeVersion,
          persistentStorageClaim: canonicalClaim,
        },
        data: { persistentStorageClaim: null, runtimeVersion: { increment: 1 } },
      });

      if (updated.count !== 1) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_RUNTIME_VERSION_CONFLICT'), {
          code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
          statusCode: 409,
        });
      }

      const completed = await tx.reservedVmOperation.update({
        where: { id: operation.id },
        data: {
          status: 'COMPLETED',
          phase: 'COMMITTED',
          response: input.response as Prisma.InputJsonValue,
          completedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      const durableDeployment = await tx.deployment.findUniqueOrThrow({ where: { id: deployment.id } });

      return { operation: publicReservedVmOperation(completed), deployment: mapDeployment(durableDeployment) };
    });
  }

  async commitReservedVmCreateCancellation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    deletedPersistentStorageClaim: string;
    logs: DeploymentRecord['logs'];
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord; replayed: boolean }> {
    const ledger = new LedgerStore(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      const preliminary = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: input.operationId } });
      const actorUserId = requireReservedVmActor(preliminary.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "ReservedVmOperation" WHERE "id" = ${input.operationId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${preliminary.deploymentId} FOR UPDATE`;
      const now = await databaseNow(tx);
      const operation = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: input.operationId } });
      const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: operation.deploymentId } });

      if (operation.status === 'FAILED' && deployment.status === 'CANCELED') {
        return {
          operation: publicReservedVmOperation(operation),
          deployment: mapDeployment(deployment),
          replayed: true,
        };
      }

      const canonicalClaim = `reserved-data-${operation.deploymentId}`;

      if (
        operation.kind !== 'CREATE' ||
        operation.status !== 'APPLYING' ||
        operation.phase !== 'LEASED' ||
        operation.errorCode !== 'RESERVED_VM_CANCEL_REQUESTED' ||
        operation.leaseOwner !== input.ownerToken ||
        operation.fencingToken !== input.fencingToken ||
        !operation.leaseExpiresAt ||
        operation.leaseExpiresAt <= now ||
        deployment.runtimeVersion !== operation.expectedRuntimeVersion ||
        !['QUEUED', 'BUILDING'].includes(deployment.status) ||
        deployment.persistentStorageClaim !== canonicalClaim ||
        input.deletedPersistentStorageClaim !== canonicalClaim
      ) {
        throw Object.assign(reservedVmStoreError('RESERVED_VM_OPERATION_FENCE_LOST'), {
          code: 'RESERVED_VM_OPERATION_FENCE_LOST',
          statusCode: 409,
        });
      }

      if (operation.billingReservationId) {
        await ledger.releaseReservationInTransaction(tx, operation.billingReservationId, 'cancel');
      }

      const metadata = ((deployment.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
      const canceled = await tx.deployment.update({
        where: { id: deployment.id },
        data: {
          status: 'CANCELED',
          canceledAt: now,
          finishedAt: now,
          logs: input.logs as any,
          runtimeKind: 'autoscale',
          persistentStorageClaim: null,
          reservedVmTier: null,
          reservedVmPriceCents: null,
          reservedVmTermsVersion: null,
          reservedVmRateCardVersion: null,
          reservedVmBillingReservationId: null,
          reservedVmBillingState: null,
          reservedVmCurrentPeriodStart: null,
          reservedVmNextChargeAt: null,
          reservedVmGraceEndsAt: null,
          reservedVmStopRequestedAt: null,
          metadata: {
            ...metadata,
            reservedVmCancelCompletedAt: now.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      const failed = await tx.reservedVmOperation.update({
        where: { id: operation.id },
        data: {
          status: 'FAILED',
          phase: 'ROLLED_BACK',
          errorCode: RESERVED_VM_CANCEL_ERROR_CODE,
          errorMessage: RESERVED_VM_CANCEL_ERROR_CODE,
          response: {
            canceled: true,
            persistentStorageClaimName: canonicalClaim,
            persistentStorageClaimAbsent: true,
          },
          completedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });

      return {
        operation: publicReservedVmOperation(failed),
        deployment: mapDeployment(canceled),
        replayed: false,
      };
    });
  }

  async failReservedVmOperation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
    createCleanup?: { deletedPersistentStorageClaim: string };
  }): Promise<ReservedVmOperationRecord> {
    const ledger = new LedgerStore(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      const preliminary = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: input.operationId } });
      const actorUserId = requireReservedVmActor(preliminary.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "ReservedVmOperation" WHERE "id" = ${input.operationId} FOR UPDATE`;
      const now = await databaseNow(tx);
      const operation = await tx.reservedVmOperation.findUniqueOrThrow({ where: { id: input.operationId } });

      if (operation.status === 'FAILED') {
        return publicReservedVmOperation(operation);
      }

      if (
        operation.status !== 'APPLYING' ||
        operation.leaseOwner !== input.ownerToken ||
        operation.fencingToken !== input.fencingToken ||
        !operation.leaseExpiresAt ||
        operation.leaseExpiresAt <= now
      ) {
        throw Object.assign(reservedVmStoreError('Reserved VM operation ownership was lost.'), {
          code: 'RESERVED_VM_OPERATION_FENCE_LOST',
          statusCode: 409,
        });
      }

      if (operation.billingReservationId) {
        await ledger.releaseReservationInTransaction(tx, operation.billingReservationId, 'failure');
      }

      if (operation.kind === 'CREATE') {
        const canonicalClaim = `reserved-data-${operation.deploymentId}`;

        if (input.createCleanup?.deletedPersistentStorageClaim !== canonicalClaim) {
          throw Object.assign(reservedVmStoreError('RESERVED_VM_CREATE_CLEANUP_UNVERIFIED'), {
            code: 'RESERVED_VM_CREATE_CLEANUP_UNVERIFIED',
            statusCode: 409,
          });
        }

        await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${operation.deploymentId} FOR UPDATE`;
        const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: operation.deploymentId } });

        if (
          deployment.runtimeVersion !== operation.expectedRuntimeVersion ||
          deployment.persistentStorageClaim !== canonicalClaim
        ) {
          throw Object.assign(reservedVmStoreError('RESERVED_VM_RUNTIME_VERSION_CONFLICT'), {
            code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
            statusCode: 409,
          });
        }

        await tx.deployment.update({
          where: { id: deployment.id },
          data: {
            runtimeKind: 'autoscale',
            persistentStorageClaim: null,
            reservedVmTier: null,
            reservedVmPriceCents: null,
            reservedVmTermsVersion: null,
            reservedVmRateCardVersion: null,
            reservedVmBillingReservationId: null,
            reservedVmBillingState: null,
            reservedVmCurrentPeriodStart: null,
            reservedVmNextChargeAt: null,
            reservedVmGraceEndsAt: null,
            reservedVmStopRequestedAt: null,
          },
        });
      }

      const failed = await tx.reservedVmOperation.update({
        where: { id: operation.id },
        data: {
          status: 'FAILED',
          phase: 'ROLLED_BACK',
          errorCode: input.errorCode.slice(0, 120),
          errorMessage: input.errorMessage.slice(0, 1000),
          completedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return publicReservedVmOperation(failed);
    });
  }

  async claimDueReservedVmBillingPeriod(input: {
    ownerToken: string;
    ttlMs: number;
    deploymentId?: string;
    gracePeriodMs?: number;
  }): Promise<{ period: ReservedVmBillingPeriodLease; deployment: DeploymentRecord } | undefined> {
    const ownerToken = requireReservedVmLeaseOwner(input.ownerToken);
    const ledger = new LedgerStore(this.prisma);
    const gracePeriodMs = input.gracePeriodMs ?? 3 * 24 * 60 * 60_000;

    const preclaimed = await this.prisma.$transaction(async (tx) => {
      await promoteExpiredReservedVmGrace(tx, ledger, { deploymentId: input.deploymentId, take: 100 });

      const now = await databaseNow(tx);

      const retryRows = input.deploymentId
        ? await tx.$queryRaw<Array<{ id: string; projectId: string; organizationId: string; actorUserId: string }>>`
            SELECT p."id", p."projectId", p."organizationId", p."actorUserId"
            FROM "ReservedVmBillingPeriod" p
            JOIN "Deployment" d ON d."id" = p."deploymentId"
            WHERE p."deploymentId" = ${input.deploymentId}
              AND p."status" IN ('DUE', 'PROCESSING', 'PAST_DUE')
              AND p."actorUserId" IS NOT NULL
              AND (p."leaseExpiresAt" IS NULL OR p."leaseExpiresAt" <= clock_timestamp())
              AND (p."graceEndsAt" IS NULL OR p."graceEndsAt" > clock_timestamp())
              AND d."runtimeKind" = 'reserved-vm'
              AND d."reservedVmNextChargeAt" = p."periodStart"
              AND NOT EXISTS (
                SELECT 1 FROM "ReservedVmOperation" o
                WHERE o."deploymentId" = d."id" AND o."status" IN ('PENDING', 'APPLYING')
              )
            ORDER BY p."periodStart" ASC, p."id" ASC
            LIMIT 1
          `
        : await tx.$queryRaw<Array<{ id: string; projectId: string; organizationId: string; actorUserId: string }>>`
            SELECT p."id", p."projectId", p."organizationId", p."actorUserId"
            FROM "ReservedVmBillingPeriod" p
            JOIN "Deployment" d ON d."id" = p."deploymentId"
            WHERE p."status" IN ('DUE', 'PROCESSING', 'PAST_DUE')
              AND p."actorUserId" IS NOT NULL
              AND (p."leaseExpiresAt" IS NULL OR p."leaseExpiresAt" <= clock_timestamp())
              AND (p."graceEndsAt" IS NULL OR p."graceEndsAt" > clock_timestamp())
              AND d."runtimeKind" = 'reserved-vm'
              AND d."reservedVmNextChargeAt" = p."periodStart"
              AND NOT EXISTS (
                SELECT 1 FROM "ReservedVmOperation" o
                WHERE o."deploymentId" = d."id" AND o."status" IN ('PENDING', 'APPLYING')
              )
            ORDER BY p."periodStart" ASC, p."id" ASC
            LIMIT 1
      `;

      const retryCandidate = retryRows[0];
      let retryPeriodId: string | undefined;

      if (retryCandidate) {
        const actorUserId = requireReservedVmActor(retryCandidate.actorUserId);
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [actorUserId],
          organizationIds: [retryCandidate.organizationId],
          projectIds: [retryCandidate.projectId],
        });
        const lockedRetry = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT p."id"
          FROM "ReservedVmBillingPeriod" p
          JOIN "Deployment" d ON d."id" = p."deploymentId"
          WHERE p."id" = ${retryCandidate.id}
            AND p."actorUserId" = ${actorUserId}
            AND p."status" IN ('DUE', 'PROCESSING', 'PAST_DUE')
            AND (p."leaseExpiresAt" IS NULL OR p."leaseExpiresAt" <= clock_timestamp())
            AND (p."graceEndsAt" IS NULL OR p."graceEndsAt" > clock_timestamp())
            AND d."runtimeKind" = 'reserved-vm'
            AND d."reservedVmNextChargeAt" = p."periodStart"
            AND NOT EXISTS (
              SELECT 1 FROM "ReservedVmOperation" o
              WHERE o."deploymentId" = d."id" AND o."status" IN ('PENDING', 'APPLYING')
            )
          FOR UPDATE OF p SKIP LOCKED
        `;

        if (!lockedRetry[0]) return undefined;
        retryPeriodId = retryCandidate.id;
      }

      let period = retryPeriodId
        ? await tx.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: retryPeriodId } })
        : undefined;

      if (!period) {
        const dueRows = input.deploymentId
          ? await tx.$queryRaw<Array<{ id: string; projectId: string; organizationId: string; actorUserId: string }>>`
              SELECT d."id", d."projectId", project."organizationId", authority."actorUserId"
              FROM "Deployment" d
              JOIN "Project" project ON project."id" = d."projectId"
              JOIN LATERAL (
                SELECT o."actorUserId"
                FROM "ReservedVmOperation" o
                WHERE o."deploymentId" = d."id" AND o."actorUserId" IS NOT NULL
                ORDER BY o."createdAt" DESC, o."id" DESC
                LIMIT 1
              ) authority ON TRUE
              WHERE d."id" = ${input.deploymentId}
                AND d."runtimeKind" = 'reserved-vm'
                AND d."reservedVmBillingState" = 'CURRENT'
                AND d."reservedVmNextChargeAt" <= clock_timestamp()
                AND d."reservedVmTier" IS NOT NULL
                AND d."reservedVmPriceCents" IS NOT NULL
                AND d."reservedVmTermsVersion" IS NOT NULL
                AND d."reservedVmRateCardVersion" IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM "ReservedVmBillingPeriod" p
                  WHERE p."deploymentId" = d."id" AND p."periodStart" = d."reservedVmNextChargeAt"
                )
                AND NOT EXISTS (
                  SELECT 1 FROM "ReservedVmOperation" o
                  WHERE o."deploymentId" = d."id" AND o."status" IN ('PENDING', 'APPLYING')
                )
              LIMIT 1
            `
          : await tx.$queryRaw<Array<{ id: string; projectId: string; organizationId: string; actorUserId: string }>>`
              SELECT d."id", d."projectId", project."organizationId", authority."actorUserId"
              FROM "Deployment" d
              JOIN "Project" project ON project."id" = d."projectId"
              JOIN LATERAL (
                SELECT o."actorUserId"
                FROM "ReservedVmOperation" o
                WHERE o."deploymentId" = d."id" AND o."actorUserId" IS NOT NULL
                ORDER BY o."createdAt" DESC, o."id" DESC
                LIMIT 1
              ) authority ON TRUE
              WHERE d."runtimeKind" = 'reserved-vm'
                AND d."reservedVmBillingState" = 'CURRENT'
                AND d."reservedVmNextChargeAt" <= clock_timestamp()
                AND d."reservedVmTier" IS NOT NULL
                AND d."reservedVmPriceCents" IS NOT NULL
                AND d."reservedVmTermsVersion" IS NOT NULL
                AND d."reservedVmRateCardVersion" IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM "ReservedVmBillingPeriod" p
                  WHERE p."deploymentId" = d."id" AND p."periodStart" = d."reservedVmNextChargeAt"
                )
                AND NOT EXISTS (
                  SELECT 1 FROM "ReservedVmOperation" o
                  WHERE o."deploymentId" = d."id" AND o."status" IN ('PENDING', 'APPLYING')
                )
              ORDER BY d."reservedVmNextChargeAt" ASC, d."id" ASC
              LIMIT 1
            `;

        const dueCandidate = dueRows[0];

        if (!dueCandidate) {
          return undefined;
        }

        const actorUserId = requireReservedVmActor(dueCandidate.actorUserId);
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [actorUserId],
          organizationIds: [dueCandidate.organizationId],
          projectIds: [dueCandidate.projectId],
        });
        const lockedDue = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT d."id"
          FROM "Deployment" d
          WHERE d."id" = ${dueCandidate.id}
            AND d."runtimeKind" = 'reserved-vm'
            AND d."reservedVmBillingState" = 'CURRENT'
            AND d."reservedVmNextChargeAt" <= clock_timestamp()
            AND d."reservedVmTier" IS NOT NULL
            AND d."reservedVmPriceCents" IS NOT NULL
            AND d."reservedVmTermsVersion" IS NOT NULL
            AND d."reservedVmRateCardVersion" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM "ReservedVmBillingPeriod" p
              WHERE p."deploymentId" = d."id" AND p."periodStart" = d."reservedVmNextChargeAt"
            )
            AND NOT EXISTS (
              SELECT 1 FROM "ReservedVmOperation" o
              WHERE o."deploymentId" = d."id" AND o."status" IN ('PENDING', 'APPLYING')
            )
          FOR UPDATE OF d SKIP LOCKED
        `;

        if (!lockedDue[0]) return undefined;

        const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: dueCandidate.id } });

        const tier = deployment.reservedVmTier as ReservedVmTier | null;
        const exactPrice = tier ? RESERVED_VM_TIERS[tier]?.centsPerMonth : undefined;

        if (
          !tier ||
          exactPrice !== deployment.reservedVmPriceCents ||
          !deployment.reservedVmTermsVersion ||
          !deployment.reservedVmRateCardVersion ||
          !deployment.reservedVmNextChargeAt
        ) {
          throw Object.assign(reservedVmStoreError('Reserved VM renewal price snapshot is invalid.'), {
            code: 'RESERVED_VM_BILLING_SCHEDULE_CORRUPT',
            statusCode: 409,
          });
        }

        const periodEnd = await databaseCalendarMonthAfter(tx, deployment.reservedVmNextChargeAt);
        period = await tx.reservedVmBillingPeriod.create({
          data: {
            projectId: deployment.projectId,
            deploymentId: deployment.id,
            organizationId: dueCandidate.organizationId,
            actorUserId,
            periodStart: deployment.reservedVmNextChargeAt,
            periodEnd,
            tier,
            priceCents: deployment.reservedVmPriceCents,
            termsVersion: deployment.reservedVmTermsVersion,
            rateCardVersion: deployment.reservedVmRateCardVersion,
          },
        });
      }

      let reservationGeneration = period.reservationGeneration;
      let billingReservationId = period.billingReservationId;

      if (billingReservationId) {
        const existingReservation = await tx.ledgerReservation.findUnique({ where: { id: billingReservationId } });

        if (
          !existingReservation ||
          existingReservation.organizationId !== period.organizationId ||
          existingReservation.maxAmountMinor !== BigInt(period.priceCents)
        ) {
          throw Object.assign(reservedVmStoreError('Reserved VM renewal ledger reservation is inconsistent.'), {
            code: 'RESERVED_VM_BILLING_LEDGER_CORRUPT',
            statusCode: 409,
          });
        }

        if (existingReservation.status === 'ACTIVE' && existingReservation.expiresAt <= now) {
          await ledger.releaseReservationInTransaction(tx, existingReservation.id, 'timeout');
          billingReservationId = null;
          reservationGeneration += 1;
        } else if (existingReservation.status === 'RELEASED' || existingReservation.status === 'EXPIRED') {
          billingReservationId = null;
          reservationGeneration += 1;
        } else if (existingReservation.status === 'COMPENSATED') {
          throw Object.assign(reservedVmStoreError('Reserved VM renewal settlement was compensated unexpectedly.'), {
            code: 'RESERVED_VM_BILLING_LEDGER_CORRUPT',
            statusCode: 409,
          });
        }
      }

      const claimed = await tx.reservedVmBillingPeriod.update({
        where: { id: period.id },
        data: {
          status: 'PROCESSING',
          attemptCount: { increment: 1 },
          reservationGeneration,
          billingReservationId,
          leaseOwner: ownerToken,
          leaseExpiresAt: reservedVmBillingLeaseExpiry(now, input.ttlMs),
          fencingToken: { increment: 1 },
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

      const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: period.deploymentId } });

      return { period: mapReservedVmBillingPeriod(claimed), deployment: mapDeployment(deployment) };
    });

    if (!preclaimed || preclaimed.period.billingReservationId) {
      return preclaimed;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const preliminary = await tx.reservedVmBillingPeriod.findUniqueOrThrow({
          where: { id: preclaimed.period.id },
        });
        const actorUserId = requireReservedVmActor(preliminary.actorUserId);
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [actorUserId],
          organizationIds: [preliminary.organizationId],
          projectIds: [preliminary.projectId],
        });
        await tx.$queryRaw`SELECT "id" FROM "ReservedVmBillingPeriod" WHERE "id" = ${preliminary.id} FOR UPDATE`;
        const now = await databaseNow(tx);
        const period = await tx.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: preliminary.id } });

        if (
          period.status !== 'PROCESSING' ||
          period.leaseOwner !== ownerToken ||
          period.fencingToken !== preclaimed.period.fencingToken ||
          !period.leaseExpiresAt ||
          period.leaseExpiresAt <= now ||
          period.billingReservationId
        ) {
          throw reservedVmBillingFenceLost();
        }

        if (!(await hasPaidReservedVmEntitlement(tx, period.organizationId))) {
          throw Object.assign(reservedVmStoreError('RESERVED_VM_PAID_PLAN_REQUIRED'), {
            code: 'RESERVED_VM_PAID_PLAN_REQUIRED',
            statusCode: 402,
          });
        }

        const reservation = await ledger.reserveUsageInTransaction(tx, {
          organizationId: period.organizationId,
          userId: actorUserId,
          idempotencyKey: `reserved-vm-renewal:${period.deploymentId}:${period.periodStart.toISOString()}:g${period.reservationGeneration}`,
          requestHash: reservedVmRenewalRequestHash(period),
          operation: 'reserved_vm_renewal',
          currency: 'usd',
          maxAmountMinor: BigInt(period.priceCents),
          rateCardVersion: period.rateCardVersion,
          expiresInMs: RESERVED_VM_RENEWAL_RESERVATION_MS,
        });
        const attached = await tx.reservedVmBillingPeriod.updateMany({
          where: {
            id: period.id,
            status: 'PROCESSING',
            leaseOwner: ownerToken,
            fencingToken: period.fencingToken,
            billingReservationId: null,
          },
          data: { billingReservationId: reservation.id },
        });

        if (attached.count !== 1) {
          throw reservedVmBillingFenceLost();
        }

        const durablePeriod = await tx.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: period.id } });
        const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: period.deploymentId } });
        return { period: mapReservedVmBillingPeriod(durablePeriod), deployment: mapDeployment(deployment) };
      });
    } catch (error) {
      const errorCode = (error as { code?: string }).code ?? 'RESERVED_VM_RENEWAL_RESERVATION_FAILED';
      const errorMessage = error instanceof Error ? error.message : String(error);

      return this.prisma.$transaction(async (tx) => {
        const preliminary = await tx.reservedVmBillingPeriod.findUniqueOrThrow({
          where: { id: preclaimed.period.id },
        });
        const actorUserId = requireReservedVmActor(preliminary.actorUserId);
        await assertAccountPurgeMutationAllowed(tx, {
          userIds: [actorUserId],
          organizationIds: [preliminary.organizationId],
          projectIds: [preliminary.projectId],
        });
        await tx.$queryRaw`SELECT "id" FROM "ReservedVmBillingPeriod" WHERE "id" = ${preliminary.id} FOR UPDATE`;
        const now = await databaseNow(tx);
        const period = await tx.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: preliminary.id } });

        if (
          period.status !== 'PROCESSING' ||
          period.leaseOwner !== ownerToken ||
          period.fencingToken !== preclaimed.period.fencingToken ||
          !period.leaseExpiresAt ||
          period.leaseExpiresAt <= now ||
          period.billingReservationId
        ) {
          throw reservedVmBillingFenceLost();
        }

        const failed = await markReservedVmPeriodPastDueInTransaction(tx, {
          period,
          now,
          errorCode,
          errorMessage,
          gracePeriodMs,
        });
        return {
          period: mapReservedVmBillingPeriod(
            await tx.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: failed.period.id } }),
          ),
          deployment: failed.deployment,
        };
      });
    }
  }

  async commitReservedVmBillingPeriod(input: {
    periodId: string;
    ownerToken: string;
    fencingToken: number;
    gracePeriodMs?: number;
  }): Promise<{ period: ReservedVmBillingPeriodRecord; deployment: DeploymentRecord; replayed: boolean }> {
    const ownerToken = requireReservedVmLeaseOwner(input.ownerToken);
    const ledger = new LedgerStore(this.prisma);
    const gracePeriodMs = input.gracePeriodMs ?? 3 * 24 * 60 * 60_000;

    return this.prisma.$transaction(async (tx) => {
      const preliminary = await tx.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: input.periodId } });
      const actorUserId = requireReservedVmActor(preliminary.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "ReservedVmBillingPeriod" WHERE "id" = ${input.periodId} FOR UPDATE`;

      const period = await tx.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: input.periodId } });
      const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: period.deploymentId } });

      if (period.status === 'PAID') {
        return {
          period: publicReservedVmBillingPeriod(period),
          deployment: mapDeployment(deployment),
          replayed: true,
        };
      }

      const now = await databaseNow(tx);

      if (
        period.status !== 'PROCESSING' ||
        period.leaseOwner !== ownerToken ||
        period.fencingToken !== input.fencingToken ||
        !period.leaseExpiresAt ||
        period.leaseExpiresAt <= now ||
        !period.billingReservationId
      ) {
        throw reservedVmBillingFenceLost();
      }

      await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${period.deploymentId} FOR UPDATE`;

      const current = await tx.deployment.findUniqueOrThrow({ where: { id: period.deploymentId } });

      if (
        current.runtimeKind !== 'reserved-vm' ||
        current.reservedVmNextChargeAt?.getTime() !== period.periodStart.getTime()
      ) {
        throw Object.assign(reservedVmStoreError('Reserved VM billing period is no longer the active cycle.'), {
          code: 'RESERVED_VM_BILLING_CYCLE_CONFLICT',
          statusCode: 409,
        });
      }

      if (!(await hasPaidReservedVmEntitlement(tx, period.organizationId))) {
        await ledger.releaseReservationInTransaction(tx, period.billingReservationId, 'failure');
        const failed = await markReservedVmPeriodPastDueInTransaction(tx, {
          period,
          now,
          errorCode: RESERVED_VM_PAID_PLAN_ERROR_CODE,
          errorMessage: RESERVED_VM_PAID_PLAN_ERROR_CODE,
          gracePeriodMs,
        });
        return { ...failed, replayed: false };
      }

      await ledger.commitReservationInTransaction(tx, {
        reservationId: period.billingReservationId,
        actualAmountMinor: BigInt(period.priceCents),
        refuseOverage: true,
      });

      const paid = await tx.reservedVmBillingPeriod.update({
        where: { id: period.id },
        data: {
          status: 'PAID',
          settledAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          graceEndsAt: null,
          stopRequestedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      const advanced = await tx.deployment.updateMany({
        where: {
          id: current.id,
          runtimeKind: 'reserved-vm',
          reservedVmNextChargeAt: period.periodStart,
        },
        data: {
          reservedVmBillingReservationId: period.billingReservationId,
          reservedVmBillingState: 'CURRENT',
          reservedVmCurrentPeriodStart: period.periodStart,
          reservedVmNextChargeAt: period.periodEnd,
          reservedVmGraceEndsAt: null,
          reservedVmStopRequestedAt: null,
        },
      });

      if (advanced.count !== 1) {
        throw Object.assign(reservedVmStoreError('Reserved VM billing cycle advancement was lost.'), {
          code: 'RESERVED_VM_BILLING_CYCLE_CONFLICT',
          statusCode: 409,
        });
      }

      const updated = await tx.deployment.findUniqueOrThrow({ where: { id: current.id } });

      return { period: publicReservedVmBillingPeriod(paid), deployment: mapDeployment(updated), replayed: false };
    });
  }

  async failReservedVmBillingPeriod(input: {
    periodId: string;
    ownerToken: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
    gracePeriodMs: number;
  }): Promise<{ period: ReservedVmBillingPeriodRecord; deployment: DeploymentRecord }> {
    const ownerToken = requireReservedVmLeaseOwner(input.ownerToken);

    return this.prisma.$transaction(async (tx) => {
      const preliminary = await tx.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: input.periodId } });
      const actorUserId = requireReservedVmActor(preliminary.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "ReservedVmBillingPeriod" WHERE "id" = ${input.periodId} FOR UPDATE`;

      const now = await databaseNow(tx);
      const period = await tx.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: input.periodId } });

      if (
        period.status !== 'PROCESSING' ||
        period.leaseOwner !== ownerToken ||
        period.fencingToken !== input.fencingToken ||
        !period.leaseExpiresAt ||
        period.leaseExpiresAt <= now
      ) {
        throw reservedVmBillingFenceLost();
      }

      const graceEndsAt = period.graceEndsAt ?? reservedVmGraceExpiry(now, input.gracePeriodMs);

      const pastDue = await tx.reservedVmBillingPeriod.update({
        where: { id: period.id },
        data: {
          status: 'PAST_DUE',
          graceEndsAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: input.errorCode.slice(0, 120),
          lastErrorMessage: input.errorMessage.slice(0, 1_000),
        },
      });

      const updated = await tx.deployment.updateMany({
        where: {
          id: period.deploymentId,
          runtimeKind: 'reserved-vm',
          reservedVmNextChargeAt: period.periodStart,
        },
        data: {
          reservedVmBillingState: 'PAST_DUE',
          reservedVmGraceEndsAt: graceEndsAt,
          reservedVmStopRequestedAt: null,
        },
      });

      if (updated.count !== 1) {
        throw Object.assign(reservedVmStoreError('Reserved VM billing period is no longer the active cycle.'), {
          code: 'RESERVED_VM_BILLING_CYCLE_CONFLICT',
          statusCode: 409,
        });
      }

      const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: period.deploymentId } });

      return { period: publicReservedVmBillingPeriod(pastDue), deployment: mapDeployment(deployment) };
    });
  }

  async listReservedVmStopSignals(take = 100) {
    const boundedTake = Number.isFinite(take) ? Math.max(1, Math.min(Math.trunc(take), 500)) : 100;
    const ledger = new LedgerStore(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      await promoteExpiredReservedVmGrace(tx, ledger, { take: boundedTake });

      const periods = await tx.reservedVmBillingPeriod.findMany({
        where: {
          status: 'STOP_REQUIRED',
          deployment: { runtimeKind: 'reserved-vm', reservedVmBillingState: 'STOP_REQUIRED' },
        },
        include: { deployment: true },
        orderBy: [{ stopRequestedAt: 'asc' }, { id: 'asc' }],
        take: boundedTake,
      });

      return periods.map((period) => ({
        periodId: period.id,
        projectId: period.projectId,
        deploymentId: period.deploymentId,
        organizationId: period.organizationId,
        requestedAt: period.stopRequestedAt!.toISOString(),
        graceEndedAt: period.graceEndsAt!.toISOString(),
        persistentStorageClaim: period.deployment.persistentStorageClaim ?? undefined,
        deletePersistentStorage: false as const,
      }));
    });
  }

  async claimNextReservedVmComputeStop(input: {
    ownerToken: string;
    ttlMs: number;
  }): Promise<{ signal: ReservedVmStopLease; deployment: DeploymentRecord } | undefined> {
    const ownerToken = requireReservedVmLeaseOwner(input.ownerToken);
    const ledger = new LedgerStore(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      await promoteExpiredReservedVmGrace(tx, ledger, { take: 100 });

      /* Resolve actor authority before any billing/deployment effect lock. */
      const candidates = await tx.$queryRaw<
        Array<{
          id: string;
          projectId: string;
          deploymentId: string;
          organizationId: string;
          actorUserId: string;
        }>
      >`
        SELECT p."id", p."projectId", p."deploymentId", p."organizationId", p."actorUserId"
        FROM "ReservedVmBillingPeriod" p
        JOIN "Deployment" d ON d."id" = p."deploymentId"
        WHERE p."status" = 'STOP_REQUIRED'
          AND p."actorUserId" IS NOT NULL
          AND (p."leaseExpiresAt" IS NULL OR p."leaseExpiresAt" <= clock_timestamp())
          AND d."runtimeKind" = 'reserved-vm'
          AND d."reservedVmBillingState" = 'STOP_REQUIRED'
          AND d."reservedVmNextChargeAt" = p."periodStart"
          AND NOT EXISTS (
            SELECT 1 FROM "ReservedVmOperation" o
            WHERE o."deploymentId" = d."id" AND o."status" IN ('PENDING', 'APPLYING')
          )
        ORDER BY p."stopRequestedAt" ASC, p."id" ASC
        LIMIT 1
      `;
      const candidate = candidates[0];

      if (!candidate) return undefined;

      const actorUserId = requireReservedVmActor(candidate.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [candidate.organizationId],
        projectIds: [candidate.projectId],
      });
      const selected = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT p."id"
        FROM "ReservedVmBillingPeriod" p
        JOIN "Deployment" d ON d."id" = p."deploymentId"
        WHERE p."id" = ${candidate.id}
          AND p."status" = 'STOP_REQUIRED'
          AND p."actorUserId" = ${actorUserId}
          AND (p."leaseExpiresAt" IS NULL OR p."leaseExpiresAt" <= clock_timestamp())
          AND d."runtimeKind" = 'reserved-vm'
          AND d."reservedVmBillingState" = 'STOP_REQUIRED'
          AND d."reservedVmNextChargeAt" = p."periodStart"
          AND NOT EXISTS (
            SELECT 1 FROM "ReservedVmOperation" o
            WHERE o."deploymentId" = d."id" AND o."status" IN ('PENDING', 'APPLYING')
          )
        FOR UPDATE OF p SKIP LOCKED
      `;

      if (!selected[0]) return undefined;

      await tx.$queryRaw`SELECT "id" FROM "Deployment" WHERE "id" = ${candidate.deploymentId} FOR UPDATE`;
      const now = await databaseNow(tx);
      const deploymentFence = await tx.deployment.update({
        where: { id: candidate.deploymentId },
        data: { runtimeFencingToken: { increment: 1 } },
        select: { runtimeFencingToken: true },
      });
      const leaseExpiresAt = reservedVmBillingLeaseExpiry(now, input.ttlMs);
      const period = await tx.reservedVmBillingPeriod.update({
        where: { id: candidate.id },
        data: {
          leaseOwner: ownerToken,
          leaseExpiresAt,
          fencingToken: deploymentFence.runtimeFencingToken,
        },
        include: { deployment: true },
      });
      const requestedAt = period.stopRequestedAt;
      const graceEndedAt = period.graceEndsAt;

      if (!requestedAt || !graceEndedAt) {
        throw Object.assign(reservedVmStoreError('Reserved VM stop signal is incomplete.'), {
          code: 'RESERVED_VM_STOP_SIGNAL_CORRUPT',
          statusCode: 409,
        });
      }

      return {
        signal: {
          periodId: period.id,
          projectId: period.projectId,
          deploymentId: period.deploymentId,
          organizationId: period.organizationId,
          requestedAt: requestedAt.toISOString(),
          graceEndedAt: graceEndedAt.toISOString(),
          persistentStorageClaim: period.deployment.persistentStorageClaim ?? undefined,
          deletePersistentStorage: false,
          operationId: `reserved-vm-stop:${period.id}`,
          ownerToken,
          leaseExpiresAt: leaseExpiresAt.toISOString(),
          fencingToken: deploymentFence.runtimeFencingToken,
        },
        deployment: mapDeployment(period.deployment),
      };
    });
  }

  async acknowledgeReservedVmComputeStopped(input: {
    periodId: string;
    deploymentId: string;
    ownerToken: string;
    fencingToken: number;
  }): Promise<{ period: ReservedVmBillingPeriodRecord; deployment: DeploymentRecord; replayed: boolean }> {
    const ownerToken = requireReservedVmLeaseOwner(input.ownerToken);

    return this.prisma.$transaction(async (tx) => {
      const preliminary = await tx.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: input.periodId } });
      const actorUserId = requireReservedVmActor(preliminary.actorUserId);
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [actorUserId],
        organizationIds: [preliminary.organizationId],
        projectIds: [preliminary.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "ReservedVmBillingPeriod" WHERE "id" = ${input.periodId} FOR UPDATE`;
      const period = await tx.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: input.periodId } });

      if (period.deploymentId !== input.deploymentId) {
        throw Object.assign(reservedVmStoreError('Reserved VM stop acknowledgement does not match its deployment.'), {
          code: 'RESERVED_VM_STOP_ACK_CONFLICT',
          statusCode: 409,
        });
      }

      const deployment = await tx.deployment.findUniqueOrThrow({ where: { id: input.deploymentId } });

      if (period.status === 'CANCELED') {
        return {
          period: publicReservedVmBillingPeriod(period),
          deployment: mapDeployment(deployment),
          replayed: true,
        };
      }

      const now = await databaseNow(tx);

      if (
        period.status !== 'STOP_REQUIRED' ||
        period.leaseOwner !== ownerToken ||
        period.fencingToken !== input.fencingToken ||
        !period.leaseExpiresAt ||
        period.leaseExpiresAt <= now ||
        deployment.runtimeKind !== 'reserved-vm' ||
        deployment.reservedVmBillingState !== 'STOP_REQUIRED' ||
        deployment.runtimeFencingToken !== input.fencingToken
      ) {
        throw Object.assign(reservedVmStoreError('Reserved VM compute stop is no longer required.'), {
          code: 'RESERVED_VM_STOP_ACK_CONFLICT',
          statusCode: 409,
        });
      }

      const metadata =
        deployment.metadata && typeof deployment.metadata === 'object' && !Array.isArray(deployment.metadata)
          ? (deployment.metadata as Record<string, unknown>)
          : {};
      const canceled = await tx.reservedVmBillingPeriod.update({
        where: { id: period.id },
        data: { status: 'CANCELED', leaseOwner: null, leaseExpiresAt: null },
      });
      const updated = await tx.deployment.update({
        where: { id: deployment.id },
        data: {
          reservedVmBillingState: 'SUSPENDED',
          reservedVmCurrentPeriodStart: null,
          reservedVmNextChargeAt: null,
          reservedVmGraceEndsAt: null,
          reservedVmStopRequestedAt: null,
          metadata: {
            ...metadata,
            reservedVmComputeStoppedAt: now.toISOString(),
            reservedVmComputeStopPeriodId: period.id,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        period: publicReservedVmBillingPeriod(canceled),
        deployment: mapDeployment(updated),
        replayed: false,
      };
    });
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
        // Retain metadata for rolling compatibility and status consumers. The
        // durable DeploymentAccessPolicy remains the serving authority.
        metadata: true,
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
      metadata: deployment.metadata,
    };
  }

  async getDeploymentAccessContext(deploymentId: string): Promise<DeploymentAccessContext | undefined> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        id: true,
        projectId: true,
        environmentName: true,
        accessPolicyVersion: true,
        status: true,
        project: { select: { organizationId: true, deletedAt: true } },
      },
    });

    if (!deployment) {
      return undefined;
    }

    const policyRow = await this.prisma.deploymentAccessPolicy.findUnique({
      where: {
        projectId_environment_version: {
          projectId: deployment.projectId,
          environment: deployment.environmentName,
          version: deployment.accessPolicyVersion,
        },
      },
    });

    const policy = validDeploymentAccessPolicy(policyRow) ? mapDeploymentAccessPolicy(policyRow) : undefined;

    return {
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      organizationId: deployment.project.organizationId,
      environment: deployment.environmentName,
      deploymentStatus: deployment.status as DeploymentRecord['status'],
      projectDeletedAt: toIso(deployment.project.deletedAt),
      policy,
    };
  }

  async getDeploymentAccessPolicy(deploymentId: string): Promise<DeploymentAccessPolicyRecord | undefined> {
    return (await this.getDeploymentAccessContext(deploymentId))?.policy;
  }

  async getDeploymentAccessPolicyVersion(input: {
    projectId: string;
    environment: string;
    version: number;
  }): Promise<DeploymentAccessPolicyRecord | undefined> {
    const row = await this.prisma.deploymentAccessPolicy.findUnique({
      where: {
        projectId_environment_version: input,
      },
    });
    return validDeploymentAccessPolicy(row) ? mapDeploymentAccessPolicy(row) : undefined;
  }

  async setDeploymentAccessPolicy(
    input: SetDeploymentAccessPolicyInput,
  ): Promise<DeploymentAccessPolicyRecord | undefined> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "Deployment" WHERE "id" = $1 AND "projectId" = $2 FOR UPDATE',
        input.deploymentId,
        input.projectId,
      );

      const deployment = await tx.deployment.findFirst({
        where: { id: input.deploymentId, projectId: input.projectId },
        select: {
          id: true,
          projectId: true,
          environmentName: true,
          accessPolicyVersion: true,
          status: true,
          provider: true,
          machineSize: true,
          rolledBackFromId: true,
          project: { select: { organizationId: true } },
        },
      });

      if (!deployment) {
        return undefined;
      }

      if (input.expectedVersion !== undefined && deployment.accessPolicyVersion !== input.expectedVersion) {
        throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_POLICY_VERSION_CONFLICT')), {
          statusCode: 409,
          code: 'DEPLOYMENT_ACCESS_POLICY_VERSION_CONFLICT',
        });
      }

      const mode = normalizeDeploymentAccessMode(input.mode);
      const passwordHash = input.passwordHash?.trim();

      if ((mode === 'PASSWORD_PROTECTED') !== Boolean(passwordHash)) {
        throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_PASSWORD_HASH_INVALID')), {
          statusCode: 400,
          code: 'DEPLOYMENT_ACCESS_PASSWORD_INVALID',
        });
      }

      if (deployment.status === 'READY' && (!input.releaseSource || !input.releaseFence)) {
        throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_REQUIRED')), {
          statusCode: 409,
          code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_REQUIRED',
        });
      }

      if (
        input.releaseSource &&
        (input.releaseSource.projectId !== deployment.projectId ||
          input.releaseSource.environment !== deployment.environmentName ||
          input.releaseSource.deploymentId !== deployment.id ||
          !parseReleasePlanEntitlementsPin(input.releaseSource.planEntitlements) ||
          !input.releaseSource.projectManifestDigest ||
          !PROJECT_MANIFEST_DIGEST_PATTERN.test(input.releaseSource.projectManifestDigest))
      ) {
        throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH')), {
          statusCode: 409,
          code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
        });
      }

      if (input.releaseSource) {
        if (!input.releaseFence) {
          throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_REQUIRED')), {
            statusCode: 409,
            code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_REQUIRED',
          });
        }
        await requireProjectReleaseFence(tx, deployment.projectId, input.releaseFence);

        const releaseHead = await tx.releaseManifest.findFirst({
          where: { projectId: deployment.projectId, environment: deployment.environmentName },
          orderBy: { version: 'desc' },
          select: { id: true },
        });

        if (releaseHead?.id !== input.releaseSource.id) {
          throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH')), {
            statusCode: 409,
            code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
          });
        }
      }

      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `deployment-access:${deployment.projectId}:${deployment.environmentName}`,
      );

      const latestPolicy = await tx.deploymentAccessPolicy.findFirst({
        where: { projectId: deployment.projectId, environment: deployment.environmentName },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const nextPolicyVersion = (latestPolicy?.version ?? 0) + 1;
      let reboundServerRuntimeSpec: unknown;
      let retainedServerPromotionEvidence: unknown;

      if (
        input.releaseSource &&
        (deployment.provider === 'server' || input.releaseSource.artifactKind === 'server-image')
      ) {
        if (
          deployment.provider !== 'server' ||
          input.releaseSource.provider !== 'server' ||
          input.releaseSource.artifactKind !== 'server-image' ||
          input.releaseSource.accessPolicyVersion !== deployment.accessPolicyVersion ||
          !input.releaseDatabasePin ||
          !input.assertDatabasePinHeld
        ) {
          throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH')), {
            statusCode: 409,
            code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
          });
        }

        const sourcePromotion = parseServerRollbackPromotionEvidence(input.releaseSource.promotionEvidence);
        const sourcePlanEntitlements = parseReleasePlanEntitlementsPin(input.releaseSource.planEntitlements);

        if (!sourcePlanEntitlements || !input.releaseSource.projectManifestDigest) {
          throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH')), {
            statusCode: 409,
            code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
          });
        }
        const validated = validateServerReleaseCommitPins({
          runtimeSpec: input.releaseSource.runtimeSpec,
          promotionEvidence: input.releaseSource.promotionEvidence,
          organizationId: deployment.project.organizationId,
          projectId: deployment.projectId,
          environment: input.releaseSource.environment,
          projectManifestDigest: input.releaseSource.projectManifestDigest,
          planEntitlements: sourcePlanEntitlements,
          accessPolicyVersion: deployment.accessPolicyVersion,
          machineKey: deployment.machineSize ?? '',
          artifactRef: input.releaseSource.artifactRef,
          artifactDigest: input.releaseSource.artifactDigest,
          ...(input.releaseSource.dbMigrationPoint ? { dbMigrationPoint: input.releaseSource.dbMigrationPoint } : {}),
          promotion: sourcePromotion.promotion,
        });
        if (
          rollbackManifestDigest(input.releaseDatabasePin) !== rollbackManifestDigest(validated.runtimeSpec.database) ||
          !serverRollbackRuntimeMatchesDeployment(validated.runtimeSpec, deployment)
        ) {
          throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH')), {
            statusCode: 409,
            code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
          });
        }
        reboundServerRuntimeSpec = rebindServerRollbackRuntimeSpecAccessPolicy(
          validated.runtimeSpec,
          nextPolicyVersion,
          input.releaseDatabasePin,
        );
        retainedServerPromotionEvidence = validated.promotionEvidence;

        validateServerReleaseCommitPins({
          runtimeSpec: reboundServerRuntimeSpec,
          promotionEvidence: retainedServerPromotionEvidence,
          organizationId: deployment.project.organizationId,
          projectId: deployment.projectId,
          environment: input.releaseSource.environment,
          projectManifestDigest: input.releaseSource.projectManifestDigest,
          planEntitlements: sourcePlanEntitlements,
          accessPolicyVersion: nextPolicyVersion,
          machineKey: deployment.machineSize ?? '',
          artifactRef: input.releaseSource.artifactRef,
          artifactDigest: input.releaseSource.artifactDigest,
          ...(input.releaseDatabasePin.mode === 'exact-ledger'
            ? { dbMigrationPoint: input.releaseDatabasePin.ledgerDigest }
            : {}),
          promotion: sourcePromotion.promotion,
        });
        await input.assertDatabasePinHeld();
      } else if (input.releaseSource?.promotionEvidence !== undefined) {
        const staticEvidence = parseStaticRollbackRoutingEvidence(input.releaseSource.promotionEvidence);

        if (
          deployment.provider !== 'static' ||
          input.releaseSource.provider !== 'static' ||
          input.releaseSource.artifactKind !== 'static-snapshot' ||
          staticEvidence.projectId !== deployment.projectId ||
          staticEvidence.environment !== deployment.environmentName ||
          staticEvidence.sourceDeploymentId !== deployment.rolledBackFromId ||
          staticEvidence.artifactRef !== input.releaseSource.artifactRef ||
          staticEvidence.artifactDigest !== input.releaseSource.artifactDigest
        ) {
          throw Object.assign(new Error(appPublicEnglish('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH')), {
            statusCode: 409,
            code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
          });
        }

        retainedServerPromotionEvidence = staticEvidence;
      }

      const policy = await tx.deploymentAccessPolicy.create({
        data: {
          projectId: deployment.projectId,
          environment: deployment.environmentName,
          version: nextPolicyVersion,
          mode,
          revision: randomUUID(),
          passwordHash: passwordHash ?? null,
          createdByUserId: input.createdByUserId ?? null,
        },
      });

      if (input.releaseSource) {
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          `release-manifest:${deployment.projectId}:${deployment.environmentName}`,
        );

        const latestRelease = await tx.releaseManifest.findFirst({
          where: { projectId: deployment.projectId, environment: deployment.environmentName },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        await tx.releaseManifest.create({
          data: {
            projectId: deployment.projectId,
            deploymentId: deployment.id,
            environment: deployment.environmentName,
            version: (latestRelease?.version ?? 0) + 1,
            provider: input.releaseSource.provider,
            artifactKind: input.releaseSource.artifactKind,
            artifactRef: input.releaseSource.artifactRef,
            artifactDigest: input.releaseSource.artifactDigest,
            storeGeneration: input.releaseSource.storeGeneration ?? null,
            configDigest: input.releaseSource.configDigest ?? null,
            dbMigrationPoint:
              input.releaseDatabasePin === undefined
                ? (input.releaseSource.dbMigrationPoint ?? null)
                : input.releaseDatabasePin.mode === 'exact-ledger'
                  ? input.releaseDatabasePin.ledgerDigest
                  : null,
            runtimeSpec:
              reboundServerRuntimeSpec === undefined
                ? Prisma.JsonNull
                : (reboundServerRuntimeSpec as Prisma.InputJsonValue),
            promotionEvidence:
              retainedServerPromotionEvidence === undefined
                ? Prisma.JsonNull
                : (retainedServerPromotionEvidence as Prisma.InputJsonValue),
            accessPolicyVersion: nextPolicyVersion,
            planEntitlements: input.releaseSource.planEntitlements as unknown as Prisma.InputJsonValue,
            projectManifestDigest: input.releaseSource.projectManifestDigest,
          },
        });
      }

      await tx.deployment.update({
        where: { id: deployment.id },
        data: { accessPolicyVersion: nextPolicyVersion },
      });

      return mapDeploymentAccessPolicy(policy);
    });
  }

  private async _deploymentAccessUserAuthorized(
    db: Pick<DatabaseClient, '$queryRawUnsafe'>,
    input: {
      deploymentId: string;
      userId: string;
      mode: Extract<DeploymentAccessMode, 'WORKSPACE_ONLY' | 'INVITE_ONLY'>;
    },
  ): Promise<boolean> {
    const rows = await db.$queryRawUnsafe<Array<{ allowed: boolean }>>(
      `
        SELECT CASE
          WHEN $3 = 'WORKSPACE_ONLY' THEN EXISTS (
            SELECT 1
            FROM "OrganizationMember" AS membership
            WHERE membership."organizationId" = project."organizationId"
              AND membership."userId" = $2
              AND membership."state" = 'ACTIVE'
          )
          WHEN $3 = 'INVITE_ONLY' THEN (
            EXISTS (
              SELECT 1
              FROM "OrganizationMember" AS membership
              JOIN "Role" AS role ON role."id" = membership."roleId"
              WHERE membership."organizationId" = project."organizationId"
                AND membership."userId" = $2
                AND membership."state" = 'ACTIVE'
                AND role."key" IN ('owner', 'admin')
            )
            OR EXISTS (
              SELECT 1
              FROM "ProjectCollaborator" AS collaborator
              WHERE collaborator."projectId" = project."id"
                AND collaborator."userId" = $2
                AND (collaborator."expiresAt" IS NULL OR collaborator."expiresAt" > clock_timestamp())
            )
            OR EXISTS (
              SELECT 1
              FROM "ResourceAccessGrant" AS access_grant
              LEFT JOIN "CollaborationGroup" AS subject_group
                ON subject_group."organizationId" = access_grant."organizationId"
               AND subject_group."id" = access_grant."subjectGroupId"
               AND subject_group."deletedAt" IS NULL
              WHERE access_grant."organizationId" = project."organizationId"
                AND access_grant."status" = 'ACTIVE'
                AND access_grant."acceptedAt" IS NOT NULL
                AND access_grant."revokedAt" IS NULL
                AND access_grant."expiresAt" > clock_timestamp()
                AND (
                  (access_grant."resourceType" = 'PROJECT' AND access_grant."resourceId" = project."id")
                  OR (access_grant."resourceType" = 'DEPLOYMENT' AND access_grant."resourceId" = deployment."id")
                )
                AND (
                  (access_grant."subjectType" = 'USER' AND access_grant."subjectUserId" = $2)
                  OR (
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
                        AND membership."userId" = $2
                        AND membership."state" = 'ACTIVE'
                    )
                  )
                )
            )
          )
          ELSE FALSE
        END AS allowed
        FROM "Deployment" AS deployment
        JOIN "Project" AS project ON project."id" = deployment."projectId"
        WHERE deployment."id" = $1
          AND project."deletedAt" IS NULL
        LIMIT 1
      `,
      input.deploymentId,
      input.userId,
      input.mode,
    );

    return rows[0]?.allowed === true;
  }

  async isDeploymentAccessUserAuthorized(input: {
    deploymentId: string;
    userId: string;
    mode: Extract<DeploymentAccessMode, 'WORKSPACE_ONLY' | 'INVITE_ONLY'>;
  }): Promise<boolean> {
    return this._deploymentAccessUserAuthorized(this.prisma, input);
  }

  async issueDeploymentAccessExchangeTicket(input: {
    deploymentId: string;
    userId: string;
    tokenHash: string;
    ttlSeconds: number;
  }): Promise<DeploymentAccessTicketMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${input.userId}`);

      const deployment = await tx.deployment.findUnique({
        where: { id: input.deploymentId },
        select: {
          id: true,
          projectId: true,
          environmentName: true,
          accessPolicyVersion: true,
          status: true,
          project: { select: { deletedAt: true } },
        },
      });

      if (!deployment || deployment.project.deletedAt || deployment.status !== 'READY') {
        return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.deploymentNotFound };
      }

      const policyRow = await tx.deploymentAccessPolicy.findUnique({
        where: {
          projectId_environment_version: {
            projectId: deployment.projectId,
            environment: deployment.environmentName,
            version: deployment.accessPolicyVersion,
          },
        },
      });

      if (!validDeploymentAccessPolicy(policyRow)) {
        return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.policyInvalid };
      }

      const policy = mapDeploymentAccessPolicy(policyRow);

      if (policy.mode !== 'WORKSPACE_ONLY' && policy.mode !== 'INVITE_ONLY') {
        return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.policyNotPrivate };
      }

      if (
        !(await this._deploymentAccessUserAuthorized(tx as unknown as Pick<DatabaseClient, '$queryRawUnsafe'>, {
          deploymentId: deployment.id,
          userId: input.userId,
          mode: policy.mode,
        }))
      ) {
        return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.accessDenied };
      }

      const rows = await tx.$queryRawUnsafe<Array<{ expiresAt: Date }>>(
        `
          INSERT INTO "DeploymentAccessExchangeTicket" (
            "id", "deploymentId", "userId", "policyVersion", "policyRevision",
            "tokenHash", "expiresAt", "createdAt"
          ) VALUES ($1, $2, $3, $4, $5, $6,
            clock_timestamp() + ($7 * interval '1 second'), clock_timestamp())
          RETURNING "expiresAt"
        `,
        randomUUID(),
        deployment.id,
        input.userId,
        policy.version,
        policy.revision,
        input.tokenHash,
        Math.max(1, Math.min(300, Math.floor(input.ttlSeconds))),
      );

      return {
        ok: true as const,
        policy,
        userId: input.userId,
        expiresAt: rows[0].expiresAt.toISOString(),
      };
    });
  }

  async consumeDeploymentAccessExchangeTicket(input: {
    deploymentId: string;
    tokenHash: string;
  }): Promise<DeploymentAccessTicketMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.$queryRawUnsafe<
        Array<{
          deploymentId: string;
          userId: string;
          policyVersion: number;
          policyRevision: string;
          expiresAt: Date;
        }>
      >(
        `
          UPDATE "DeploymentAccessExchangeTicket"
          SET "consumedAt" = clock_timestamp()
          WHERE "deploymentId" = $1
            AND "tokenHash" = $2
            AND "consumedAt" IS NULL
            AND "expiresAt" > clock_timestamp()
          RETURNING "deploymentId", "userId", "policyVersion", "policyRevision", "expiresAt"
        `,
        input.deploymentId,
        input.tokenHash,
      );

      if (consumed.length !== 1) {
        const existing = await tx.deploymentAccessExchangeTicket.findUnique({
          where: { tokenHash: input.tokenHash },
          select: { deploymentId: true, consumedAt: true, expiresAt: true },
        });

        if (!existing || existing.deploymentId !== input.deploymentId) {
          return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.ticketNotFound };
        }

        if (existing.consumedAt) {
          return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.ticketReplayed };
        }

        return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.ticketExpired };
      }

      const ticket = consumed[0];

      const deployment = await tx.deployment.findUnique({
        where: { id: ticket.deploymentId },
        select: {
          id: true,
          projectId: true,
          environmentName: true,
          accessPolicyVersion: true,
          status: true,
          project: { select: { deletedAt: true } },
        },
      });

      if (!deployment || deployment.project.deletedAt || deployment.status !== 'READY') {
        return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.deploymentNotFound };
      }

      if (deployment.accessPolicyVersion !== ticket.policyVersion) {
        return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.policyChanged };
      }

      const policyRow = await tx.deploymentAccessPolicy.findUnique({
        where: {
          projectId_environment_version: {
            projectId: deployment.projectId,
            environment: deployment.environmentName,
            version: deployment.accessPolicyVersion,
          },
        },
      });

      if (!validDeploymentAccessPolicy(policyRow)) {
        return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.policyInvalid };
      }

      const policy = mapDeploymentAccessPolicy(policyRow);

      if (
        policy.revision !== ticket.policyRevision ||
        (policy.mode !== 'WORKSPACE_ONLY' && policy.mode !== 'INVITE_ONLY')
      ) {
        return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.policyChanged };
      }

      if (
        !(await this._deploymentAccessUserAuthorized(tx as unknown as Pick<DatabaseClient, '$queryRawUnsafe'>, {
          deploymentId: deployment.id,
          userId: ticket.userId,
          mode: policy.mode,
        }))
      ) {
        return { ok: false as const, reason: DEPLOYMENT_ACCESS_FAILURE_REASON.accessDenied };
      }

      return {
        ok: true as const,
        policy,
        userId: ticket.userId,
        expiresAt: ticket.expiresAt.toISOString(),
      };
    });
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
      data: deploymentMutationData(input) as any,
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

        /*
         * Bound one metering sweep; an unswept tail is billed on the next tick
         * (the watermark is per-row, so nothing is lost — only deferred).
         */
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
    runtimeSpec?: unknown;
    promotionEvidence?: unknown;
    accessPolicyVersion: number;
    planEntitlements: ReleasePlanEntitlementsPin;
    projectManifestDigest: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const planEntitlements = parseReleasePlanEntitlementsPin(input.planEntitlements);
      const [deployment, accessPolicy] = await Promise.all([
        tx.deployment.findFirst({
          where: {
            id: input.deploymentId,
            projectId: input.projectId,
            environmentName: input.environment,
            accessPolicyVersion: input.accessPolicyVersion,
          },
          select: {
            id: true,
            provider: true,
            machineSize: true,
            runtimeKind: true,
            reservedVmTier: true,
            persistentStorageClaim: true,
            metadata: true,
            project: { select: { organizationId: true } },
          },
        }),
        tx.deploymentAccessPolicy.findUnique({
          where: {
            projectId_environment_version: {
              projectId: input.projectId,
              environment: input.environment,
              version: input.accessPolicyVersion,
            },
          },
        }),
      ]);

      if (
        !deployment ||
        !validDeploymentAccessPolicy(accessPolicy) ||
        !planEntitlements ||
        !sameReleasePlanEntitlementsPin(deploymentPlanEntitlementsPin(deployment.metadata), planEntitlements) ||
        !PROJECT_MANIFEST_DIGEST_PATTERN.test(input.projectManifestDigest) ||
        deploymentProjectManifestDigest(deployment.metadata) !== input.projectManifestDigest
      ) {
        throw Object.assign(new Error(appPublicEnglish('RELEASE_ACCESS_POLICY_INVALID')), {
          code: 'RELEASE_ACCESS_POLICY_INVALID',
        });
      }

      if (input.artifactKind === 'server-image') {
        const serverDeploy = (deployment.metadata as Record<string, unknown> | null)?.serverDeploy as
          | Record<string, unknown>
          | undefined;
        if (
          input.provider !== 'server' ||
          deployment.provider !== 'server' ||
          !deployment.machineSize ||
          input.runtimeSpec === undefined ||
          input.promotionEvidence === undefined
        ) {
          throw new DeterministicRollbackError('ROLLBACK_MANIFEST_LEGACY_UNSUPPORTED');
        }
        parseServerRollbackPromotionEvidence(input.promotionEvidence);
        const retained = validateServerReleaseCommitPins({
          runtimeSpec: input.runtimeSpec,
          promotionEvidence: input.promotionEvidence,
          organizationId: deployment.project.organizationId,
          projectId: input.projectId,
          environment: input.environment,
          projectManifestDigest: input.projectManifestDigest,
          planEntitlements,
          accessPolicyVersion: input.accessPolicyVersion,
          machineKey: deployment.machineSize,
          artifactRef: input.artifactRef,
          artifactDigest: input.artifactDigest,
          ...(input.dbMigrationPoint ? { dbMigrationPoint: input.dbMigrationPoint } : {}),
          promotion: serverDeploy?.promotion,
        });
        const card = await tx.rateCard.findUnique({
          where: { version: retained.runtimeSpec.machine.rateCardVersion },
          select: { data: true },
        });
        const historicalCard =
          card?.data ??
          (retained.runtimeSpec.machine.rateCardVersion === BUILTIN_RATE_CARD.version ? BUILTIN_RATE_CARD : undefined);
        if (
          !serverRollbackMachineMatchesRateCard(retained.runtimeSpec.machine, historicalCard) ||
          !serverRollbackRuntimeMatchesDeployment(retained.runtimeSpec, deployment)
        ) {
          throw new DeterministicRollbackError('ROLLBACK_RUNTIME_SPEC_MACHINE_INVALID');
        }
      } else {
        if (
          input.provider !== 'static' ||
          deployment.provider !== 'static' ||
          input.runtimeSpec !== undefined ||
          !/^static-artifacts\/sha256\/[a-f0-9]{64}$/u.test(input.artifactRef) ||
          !/^sha256:[a-f0-9]{64}$/u.test(input.artifactDigest)
        ) {
          throw new DeterministicRollbackError('ROLLBACK_MANIFEST_ARTIFACT_INVALID');
        }
        if (input.promotionEvidence !== undefined) {
          const evidence = parseStaticRollbackRoutingEvidence(input.promotionEvidence);
          if (
            evidence.projectId !== input.projectId ||
            evidence.environment !== input.environment ||
            evidence.artifactRef !== input.artifactRef ||
            evidence.artifactDigest !== input.artifactDigest
          ) {
            throw new DeterministicRollbackError('ROLLBACK_STATIC_ROUTING_EVIDENCE_INVALID');
          }
        }
      }

      return mapReleaseManifest(
        await tx.releaseManifest.create({
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
            runtimeSpec:
              input.runtimeSpec === undefined ? Prisma.JsonNull : (input.runtimeSpec as Prisma.InputJsonValue),
            promotionEvidence:
              input.promotionEvidence === undefined
                ? Prisma.JsonNull
                : (input.promotionEvidence as Prisma.InputJsonValue),
            accessPolicyVersion: input.accessPolicyVersion,
            planEntitlements: planEntitlements as unknown as Prisma.InputJsonValue,
            projectManifestDigest: input.projectManifestDigest,
          },
        }),
      );
    });
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

  async getReleaseManifest(projectId: string, manifestId: string) {
    const row = await this.prisma.releaseManifest.findFirst({ where: { id: manifestId, projectId } });
    return row ? mapReleaseManifest(row) : undefined;
  }

  async getLatestReleaseManifestForDeployment(deploymentId: string) {
    const row = await this.prisma.releaseManifest.findFirst({
      where: { deploymentId },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });

    return row ? mapReleaseManifest(row) : undefined;
  }

  async isReleaseArtifactRetained(artifactRef: string): Promise<boolean> {
    return (await this.prisma.releaseManifest.count({ where: { artifactRef } })) > 0;
  }

  async isReleaseArtifactRetainedOutsideProjects(artifactRef: string, excludedProjectIds: string[]): Promise<boolean> {
    const excluded = [...new Set(excludedProjectIds)];
    return (
      (await this.prisma.releaseManifest.count({
        where: {
          artifactRef,
          ...(excluded.length > 0 ? { projectId: { notIn: excluded } } : {}),
        },
      })) > 0
    );
  }

  async acquireRollbackOperation(input: {
    projectId: string;
    actorUserId: string;
    idempotencyKey: string;
    requestFingerprint: string;
    environment: string;
    ownerToken: string;
    leaseDurationMs: number;
  }): Promise<{
    kind: 'ACQUIRED' | 'BUSY' | 'REPLAY' | 'FINGERPRINT_CONFLICT';
    record: RollbackOperationRecord;
  }> {
    if (
      !Number.isFinite(input.leaseDurationMs) ||
      input.leaseDurationMs < 1_000 ||
      input.leaseDurationMs > 30 * 60_000
    ) {
      throw new TypeError('INVALID_ROLLBACK_LEASE_DURATION');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      select: { organizationId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [input.actorUserId],
        organizationIds: [project?.organizationId],
        projectIds: [input.projectId],
      });
      await lockProjectAfterPurgeTopology(tx, input.projectId);

      const existingRequest = await tx.rollbackIdempotencyRequest.findUnique({
        where: {
          projectId_idempotencyKey: {
            projectId: input.projectId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: { id: true },
      });

      if (!existingRequest) {
        const rollbackManifests = await tx.releaseManifest.findMany({
          where: { projectId: input.projectId, environment: input.environment },
          orderBy: { version: 'desc' },
          take: 2,
          select: { deploymentId: true },
        });
        const rollbackDeployments = rollbackManifests.length
          ? await tx.deployment.findMany({
              where: { id: { in: rollbackManifests.map((manifest) => manifest.deploymentId) } },
              select: {
                runtimeKind: true,
                reservedVmTier: true,
                persistentStorageClaim: true,
              },
            })
          : [];

        if (
          rollbackDeployments.some(
            (deployment) =>
              deployment.runtimeKind === 'reserved-vm' ||
              deployment.reservedVmTier !== null ||
              deployment.persistentStorageClaim !== null,
          )
        ) {
          throw Object.assign(reservedVmStoreError(appPublicEnglish('RESERVED_VM_ROLLBACK_UNPINNED')), {
            code: 'RESERVED_VM_ROLLBACK_UNPINNED',
            statusCode: 409,
          });
        }
      }
      const operationId = `rollback_${randomUUID()}`;

      const inserted = await tx.$executeRaw`
        INSERT INTO "RollbackIdempotencyRequest" (
          "id", "projectId", "actorUserId", "idempotencyKey", "requestFingerprint", "environment",
          "status", "phase", "leaseOwner", "leaseExpiresAt", "fencingToken", "createdAt", "updatedAt"
        ) VALUES (
          ${operationId}, ${input.projectId}, ${input.actorUserId}, ${input.idempotencyKey},
          ${input.requestFingerprint}, ${input.environment},
          'IN_PROGRESS', 'CLAIMED', ${input.ownerToken},
          clock_timestamp() + (${Math.trunc(input.leaseDurationMs)} * INTERVAL '1 millisecond'),
          1, clock_timestamp(), clock_timestamp()
        )
        ON CONFLICT ("projectId", "idempotencyKey") DO NOTHING
      `;

      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "RollbackIdempotencyRequest" WHERE "projectId" = $1 AND "idempotencyKey" = $2 FOR UPDATE',
        input.projectId,
        input.idempotencyKey,
      );

      let row = await tx.rollbackIdempotencyRequest.findUniqueOrThrow({
        where: {
          projectId_idempotencyKey: {
            projectId: input.projectId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

      if (
        row.requestFingerprint !== input.requestFingerprint ||
        row.environment !== input.environment ||
        row.actorUserId !== input.actorUserId
      ) {
        return { kind: 'FINGERPRINT_CONFLICT' as const, record: mapRollbackOperation(row) };
      }

      if (row.status === 'COMPLETED') {
        return { kind: 'REPLAY' as const, record: mapRollbackOperation(row) };
      }

      if (inserted === 1) {
        return { kind: 'ACQUIRED' as const, record: mapRollbackOperation(row) };
      }

      const currentDatabaseTime = await databaseNow(tx);

      if (row.leaseExpiresAt && row.leaseExpiresAt > currentDatabaseTime) {
        return { kind: 'BUSY' as const, record: mapRollbackOperation(row) };
      }

      await tx.$executeRaw`
        UPDATE "RollbackIdempotencyRequest"
        SET "leaseOwner" = ${input.ownerToken},
            "leaseExpiresAt" = clock_timestamp() + (${Math.trunc(input.leaseDurationMs)} * INTERVAL '1 millisecond'),
            "fencingToken" = "fencingToken" + 1,
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${row.id}
      `;
      row = await tx.rollbackIdempotencyRequest.findUniqueOrThrow({ where: { id: row.id } });

      return { kind: 'ACQUIRED' as const, record: mapRollbackOperation(row) };
    });
  }

  async getRollbackOperation(projectId: string, idempotencyKey: string) {
    const row = await this.prisma.rollbackIdempotencyRequest.findUnique({
      where: { projectId_idempotencyKey: { projectId, idempotencyKey } },
    });
    return row ? mapRollbackOperation(row) : undefined;
  }

  async renewRollbackOperationLease(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    leaseDurationMs: number;
  }) {
    if (
      !Number.isFinite(input.leaseDurationMs) ||
      input.leaseDurationMs < 1_000 ||
      input.leaseDurationMs > 30 * 60_000
    ) {
      throw new TypeError('INVALID_ROLLBACK_LEASE_DURATION');
    }

    return this.prisma.$transaction(async (tx) => {
      await requireRollbackLease(tx, input);
      await tx.$executeRaw`
        UPDATE "RollbackIdempotencyRequest"
        SET "leaseExpiresAt" = clock_timestamp() + (${Math.trunc(input.leaseDurationMs)} * INTERVAL '1 millisecond'),
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${input.operationId}
      `;

      const row = await tx.rollbackIdempotencyRequest.findUniqueOrThrow({ where: { id: input.operationId } });

      return toIso(row.leaseExpiresAt);
    });
  }

  async validateRollbackOperationLease(input: { operationId: string; ownerToken: string; fencingToken: number }) {
    return this.prisma.$transaction(async (tx) => {
      const scope = await tx.rollbackIdempotencyRequest.findUnique({
        where: { id: input.operationId },
        select: { actorUserId: true, projectId: true, project: { select: { organizationId: true } } },
      });
      if (!scope?.actorUserId) return false;
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [scope.actorUserId],
        organizationIds: [scope.project.organizationId],
        projectIds: [scope.projectId],
      });
      const now = await databaseNow(tx);
      return (
        (await tx.rollbackIdempotencyRequest.count({
          where: {
            id: input.operationId,
            status: 'IN_PROGRESS',
            leaseOwner: input.ownerToken,
            fencingToken: input.fencingToken,
            leaseExpiresAt: { gt: now },
          },
        })) === 1
      );
    });
  }

  async bindRollbackOperationTarget(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    deploymentId: string;
    expectedHeadVersion: number;
    previousManifestId: string;
    projectManifestDigest: string;
  }) {
    if (
      !Number.isSafeInteger(input.expectedHeadVersion) ||
      input.expectedHeadVersion < 0 ||
      !input.deploymentId ||
      !input.previousManifestId ||
      !/^sha256:[a-f0-9]{64}$/u.test(input.projectManifestDigest)
    ) {
      throw new TypeError('INVALID_ROLLBACK_TARGET');
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await requireRollbackLease(tx, input);
      const alreadyBound = current.phase !== 'CLAIMED' || current.deploymentId !== null;

      if (alreadyBound) {
        if (
          current.deploymentId !== input.deploymentId ||
          current.expectedHeadVersion !== input.expectedHeadVersion ||
          current.previousManifestId !== input.previousManifestId ||
          current.projectManifestDigest !== input.projectManifestDigest
        ) {
          throw Object.assign(new Error(ROLLBACK_STORE_FAILURE.targetConflict), {
            code: ROLLBACK_STORE_FAILURE.targetConflict,
            statusCode: 409,
          });
        }

        return mapRollbackOperation(current);
      }

      return mapRollbackOperation(
        await tx.rollbackIdempotencyRequest.update({
          where: { id: input.operationId },
          data: {
            phase: 'TARGET_BOUND',
            deploymentId: input.deploymentId,
            expectedHeadVersion: input.expectedHeadVersion,
            previousManifestId: input.previousManifestId,
            projectManifestDigest: input.projectManifestDigest,
          },
        }),
      );
    });
  }

  async ensureRollbackDeployment(input: {
    fence: Omit<RollbackLeaseFence, 'expectedHeadVersion'>;
    deployment: RollbackDeploymentCreateInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const operation = await requireRollbackLease(tx, input.fence);
      const source = await requireRollbackSourceManifest(tx, operation);
      const metadata = input.deployment.metadata;

      const expectedDeploymentProvider =
        source.artifactKind === 'static-snapshot'
          ? 'static'
          : source.artifactKind === 'server-image'
            ? 'server'
            : undefined;

      if (
        operation.projectId !== input.deployment.projectId ||
        operation.deploymentId !== input.deployment.id ||
        operation.expectedHeadVersion === null ||
        operation.phase === 'CLAIMED' ||
        operation.environment !== input.deployment.environment ||
        source.deploymentId !== input.deployment.rolledBackFromId ||
        source.accessPolicyVersion !== input.deployment.accessPolicyVersion ||
        !expectedDeploymentProvider ||
        input.deployment.provider !== expectedDeploymentProvider ||
        metadata.rollbackOperationId !== operation.id ||
        metadata.projectManifestDigest !== operation.projectManifestDigest ||
        metadata.restoredFromVersion !== source.version ||
        metadata.restoredFromDeploymentId !== source.deploymentId ||
        metadata.supersededVersion !== operation.expectedHeadVersion
      ) {
        throw rollbackConflict('ROLLBACK_TARGET_NOT_BOUND');
      }

      const accessPolicy = await tx.deploymentAccessPolicy.findUnique({
        where: {
          projectId_environment_version: {
            projectId: input.deployment.projectId,
            environment: input.deployment.environment,
            version: input.deployment.accessPolicyVersion,
          },
        },
      });

      if (!validDeploymentAccessPolicy(accessPolicy)) {
        throw rollbackConflict('ROLLBACK_ACCESS_POLICY_INVALID');
      }

      let deployment = await tx.deployment.findUnique({ where: { id: input.deployment.id } });

      if (!deployment) {
        deployment = await tx.deployment.create({
          data: {
            id: input.deployment.id,
            projectId: input.deployment.projectId,
            provider: input.deployment.provider,
            environmentName: input.deployment.environment,
            status: input.deployment.status,
            accessPolicyVersion: input.deployment.accessPolicyVersion,
            ...(input.deployment.machineSize ? { machineSize: input.deployment.machineSize } : {}),
            rolledBackFromId: input.deployment.rolledBackFromId,
            metadata: input.deployment.metadata as Prisma.InputJsonValue,
            logs: [],
          },
        });
      } else {
        const persistedMetadata = deployment.metadata as Record<string, unknown> | null;

        if (
          deployment.projectId !== input.deployment.projectId ||
          deployment.provider !== input.deployment.provider ||
          deployment.environmentName !== input.deployment.environment ||
          deployment.accessPolicyVersion !== input.deployment.accessPolicyVersion ||
          (input.deployment.machineSize !== undefined && deployment.machineSize !== input.deployment.machineSize) ||
          deployment.rolledBackFromId !== input.deployment.rolledBackFromId ||
          persistedMetadata?.rollbackOperationId !== operation.id ||
          persistedMetadata?.projectManifestDigest !== operation.projectManifestDigest ||
          persistedMetadata?.restoredFromVersion !== source.version ||
          persistedMetadata?.restoredFromDeploymentId !== source.deploymentId ||
          persistedMetadata?.supersededVersion !== operation.expectedHeadVersion
        ) {
          throw rollbackConflict('ROLLBACK_DEPLOYMENT_CONFLICT');
        }
      }

      if (operation.phase === 'TARGET_BOUND') {
        await tx.rollbackIdempotencyRequest.update({
          where: { id: operation.id },
          data: { phase: 'DEPLOYMENT_CREATED' },
        });
      }

      return mapDeployment(deployment);
    });
  }

  async updateRollbackDeployment(input: {
    fence: Omit<RollbackLeaseFence, 'expectedHeadVersion'>;
    projectId: string;
    deploymentId: string;
    patch: Partial<Omit<DeploymentRecord, 'id' | 'projectId' | 'createdAt'>>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const operation = await requireRollbackLease(tx, input.fence);

      if (operation.projectId !== input.projectId || operation.deploymentId !== input.deploymentId) {
        throw rollbackOwnershipLost();
      }

      const statusGuard =
        input.patch.status !== undefined ? { status: { notIn: ['READY', 'FAILED', 'CANCELED'] as any } } : {};
      await tx.deployment.updateMany({
        where: { id: input.deploymentId, projectId: input.projectId, ...statusGuard },
        data: deploymentMutationData(input.patch) as any,
      });

      return mapDeployment(
        await tx.deployment.findFirstOrThrow({ where: { id: input.deploymentId, projectId: input.projectId } }),
      );
    });
  }

  async beginRollbackEffect(input: { operationId: string; ownerToken: string; fencingToken: number }) {
    return this.prisma.$transaction(async (tx) => {
      const operation = await requireRollbackLease(tx, input);

      if (operation.phase === 'EFFECT_STARTED') {
        if (operation.effectFencingToken !== input.fencingToken) {
          throw rollbackConflict('ROLLBACK_EFFECT_PHASE_CONFLICT');
        }

        return mapRollbackOperation(operation);
      }

      if (operation.phase !== 'DEPLOYMENT_CREATED' || !operation.deploymentId) {
        throw rollbackConflict('ROLLBACK_EFFECT_PHASE_CONFLICT');
      }

      const deployment = await tx.deployment.findFirst({
        where: { id: operation.deploymentId, projectId: operation.projectId },
      });

      const metadata = deployment?.metadata as Record<string, unknown> | null | undefined;

      if (
        !deployment ||
        metadata?.rollbackOperationId !== operation.id ||
        ['READY', 'FAILED', 'CANCELED'].includes(deployment.status)
      ) {
        throw rollbackConflict('ROLLBACK_EFFECT_PHASE_CONFLICT');
      }

      return mapRollbackOperation(
        await tx.rollbackIdempotencyRequest.update({
          where: { id: operation.id },
          data: { phase: 'EFFECT_STARTED', effectFencingToken: operation.fencingToken },
        }),
      );
    });
  }

  async completeRollbackEffectCleanup(input: { operationId: string; ownerToken: string; fencingToken: number }) {
    return this.prisma.$transaction(async (tx) => {
      const operation = await requireRollbackLease(tx, input);

      if (operation.phase === 'EFFECT_CLEANED') {
        return mapRollbackOperation(operation);
      }

      if (operation.phase !== 'EFFECT_STARTED' || !operation.deploymentId) {
        throw rollbackConflict('ROLLBACK_EFFECT_PHASE_CONFLICT');
      }

      const deployment = await tx.deployment.findFirst({
        where: { id: operation.deploymentId, projectId: operation.projectId },
      });

      if (deployment && !['FAILED', 'CANCELED'].includes(deployment.status)) {
        throw rollbackConflict('ROLLBACK_CLEANUP_UNCONFIRMED');
      }

      return mapRollbackOperation(
        await tx.rollbackIdempotencyRequest.update({
          where: { id: operation.id },
          data: { phase: 'EFFECT_CLEANED' },
        }),
      );
    });
  }

  async completeRollbackOperation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    responseStatus: number;
    responseContentLanguage: 'en' | 'fr';
    responseBody: unknown;
  }) {
    if (
      !Number.isInteger(input.responseStatus) ||
      input.responseStatus < 100 ||
      input.responseStatus > 599 ||
      !['en', 'fr'].includes(input.responseContentLanguage) ||
      !input.responseBody ||
      typeof input.responseBody !== 'object'
    ) {
      throw new TypeError('INVALID_ROLLBACK_RESPONSE_BODY');
    }

    return this.prisma.$transaction(async (tx) => {
      const completed = await tx.rollbackIdempotencyRequest.findUnique({ where: { id: input.operationId } });

      if (completed?.status === 'COMPLETED') {
        if (
          completed.phase !== 'RELEASE_COMMITTED' ||
          completed.responseStatus !== input.responseStatus ||
          completed.responseContentLanguage !== input.responseContentLanguage ||
          rollbackManifestDigest(completed.responseBody) !== rollbackManifestDigest(input.responseBody)
        ) {
          throw rollbackConflict('ROLLBACK_RESPONSE_REPLAY_CONFLICT');
        }

        return mapRollbackOperation(completed);
      }

      const operation = await requireRollbackLease(tx, input);

      if (input.responseStatus < 400 && operation.phase !== 'RELEASE_COMMITTED') {
        throw rollbackConflict('ROLLBACK_RESPONSE_PHASE_CONFLICT');
      }

      if (operation.phase === 'EFFECT_STARTED') {
        throw rollbackConflict('ROLLBACK_CLEANUP_UNCONFIRMED');
      }

      if (operation.phase === 'DEPLOYMENT_CREATED' && operation.deploymentId) {
        const deployment = await tx.deployment.findFirst({
          where: { id: operation.deploymentId, projectId: operation.projectId },
          select: { status: true },
        });

        if (deployment && !['FAILED', 'CANCELED'].includes(deployment.status)) {
          if (deployment.status === 'READY' || input.responseStatus < 400) {
            throw rollbackConflict('ROLLBACK_CLEANUP_UNCONFIRMED');
          }

          await tx.deployment.updateMany({
            where: {
              id: operation.deploymentId,
              projectId: operation.projectId,
              status: { notIn: ['READY', 'FAILED', 'CANCELED'] as any },
            },
            data: {
              status: 'FAILED',
              url: null,
              previewUrl: null,
              productionUrl: null,
              finishedAt: await databaseNow(tx),
            },
          });
        }
      }

      return mapRollbackOperation(
        await tx.rollbackIdempotencyRequest.update({
          where: { id: input.operationId },
          data: {
            status: 'COMPLETED',
            leaseOwner: null,
            leaseExpiresAt: null,
            responseStatus: input.responseStatus,
            responseContentLanguage: input.responseContentLanguage,
            responseBody: input.responseBody as Prisma.InputJsonValue,
            completedAt: await databaseNow(tx),
          },
        }),
      );
    });
  }

  async commitStaticRelease(input: StaticReleaseCommitInput): Promise<StaticReleaseCommitResult> {
    return this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertProjectMutable(tx, input.projectId);
      await lockProjectMutation(tx, input.projectId);
      await requireProjectReleaseFence(tx, input.projectId, input.releaseFence);
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "Deployment" WHERE "id" = $1 AND "projectId" = $2 FOR UPDATE',
        input.deploymentId,
        input.projectId,
      );
      const deployment = await tx.deployment.findFirstOrThrow({
        where: { id: input.deploymentId, projectId: input.projectId },
        include: { project: { select: { organizationId: true } } },
      });
      const queuedPin = parseReleasePlanEntitlementsPin(deploymentPlanEntitlementsPin(deployment.metadata));
      const committedPin = parseReleasePlanEntitlementsPin(deploymentPlanEntitlementsPin(input.metadata));
      const expectedRef = `static-artifacts/sha256/${input.artifactDigest.replace(/^sha256:/u, '')}`;

      if (
        deployment.project.organizationId !== input.releaseFence.expectedOrganizationId ||
        deployment.provider !== 'static' ||
        deployment.environmentName !== input.environment ||
        deployment.accessPolicyVersion !== input.accessPolicyVersion ||
        input.artifactRef !== expectedRef ||
        input.metadata.projectManifestDigest !== input.releaseFence.expectedManifestDigest ||
        !queuedPin ||
        !committedPin ||
        !sameReleasePlanEntitlementsPin(queuedPin, committedPin)
      ) {
        throw Object.assign(new Error(appPublicEnglish('PUBLISH_ENTITLEMENTS_PIN_MISSING')), {
          code: 'STATIC_RELEASE_COMMIT_CONFLICT',
          statusCode: 409,
        });
      }
      const accessPolicy = await tx.deploymentAccessPolicy.findUnique({
        where: {
          projectId_environment_version: {
            projectId: input.projectId,
            environment: input.environment,
            version: input.accessPolicyVersion,
          },
        },
      });

      if (!validDeploymentAccessPolicy(accessPolicy)) {
        throw Object.assign(new Error(appPublicEnglish('RELEASE_ACCESS_POLICY_INVALID')), {
          code: 'RELEASE_ACCESS_POLICY_INVALID',
        });
      }

      const existingRows = await tx.releaseManifest.findMany({
        where: { deploymentId: input.deploymentId },
        orderBy: { version: 'desc' },
        take: 2,
      });
      const existing = existingRows[0];

      if (existing) {
        if (
          existingRows.length !== 1 ||
          existing.projectId !== input.projectId ||
          existing.environment !== input.environment ||
          existing.provider !== 'static' ||
          existing.artifactKind !== 'static-snapshot' ||
          existing.artifactRef !== input.artifactRef ||
          existing.artifactDigest !== input.artifactDigest ||
          !sameNullable(existing.storeGeneration, input.storeGeneration) ||
          !sameNullable(existing.configDigest, input.configDigest) ||
          !sameNullable(existing.dbMigrationPoint, input.dbMigrationPoint) ||
          existing.accessPolicyVersion !== input.accessPolicyVersion ||
          !sameReleasePlanEntitlementsPin(existing.planEntitlements, committedPin) ||
          existing.projectManifestDigest !== input.releaseFence.expectedManifestDigest ||
          deployment.status !== 'READY'
        ) {
          throw Object.assign(new Error(STATIC_RELEASE_MANIFEST_CONFLICT), {
            code: STATIC_RELEASE_MANIFEST_CONFLICT,
          });
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
          provider: 'static',
          artifactKind: 'static-snapshot',
          artifactRef: input.artifactRef,
          artifactDigest: input.artifactDigest,
          storeGeneration: input.storeGeneration ?? null,
          configDigest: input.configDigest ?? null,
          dbMigrationPoint: input.dbMigrationPoint ?? null,
          accessPolicyVersion: input.accessPolicyVersion,
          planEntitlements: committedPin as unknown as Prisma.InputJsonValue,
          projectManifestDigest: input.releaseFence.expectedManifestDigest,
        },
      });
      const transitioned = await tx.deployment.updateMany({
        where: {
          id: input.deploymentId,
          projectId: input.projectId,
          status: { notIn: ['READY', 'FAILED', 'CANCELED'] as any },
        },
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

      if (transitioned.count !== 1) {
        throw Object.assign(new Error(STATIC_RELEASE_COMMIT_CONFLICT), {
          code: STATIC_RELEASE_COMMIT_CONFLICT,
        });
      }

      const ready = await tx.deployment.findUniqueOrThrow({ where: { id: input.deploymentId } });
      return { committed: true, deployment: mapDeployment(ready), manifest: mapReleaseManifest(manifest) };
    });
  }

  async commitStaticRollbackRelease(input: StaticRollbackReleaseCommitInput) {
    return this.prisma.$transaction(async (tx) => {
      /* Common release order: actor -> topology -> checkpoint -> Project -> rollback/deployment/manifest. */
      await acquireRollbackPurgeScope(tx, input.operationId);
      await lockProjectAfterPurgeTopology(tx, input.projectId);
      await requireProjectReleaseFence(tx, input.projectId, input.releaseFence);

      const operation = await requireRollbackLease(tx, input);
      const source = await requireRollbackSourceManifest(tx, operation);
      const sourcePin = parseReleasePlanEntitlementsPin(source.planEntitlements);
      const rollbackPin = parseReleasePlanEntitlementsPin(deploymentPlanEntitlementsPin(input.metadata));

      if (
        operation.projectId !== input.projectId ||
        operation.deploymentId !== input.deploymentId ||
        operation.expectedHeadVersion !== input.expectedHeadVersion ||
        operation.phase !== 'EFFECT_STARTED' ||
        operation.effectFencingToken !== input.fencingToken ||
        operation.environment !== input.environment ||
        operation.projectManifestDigest !== input.releaseFence.expectedManifestDigest ||
        source.artifactKind !== 'static-snapshot' ||
        source.provider !== input.provider ||
        source.artifactRef !== input.artifactRef ||
        source.artifactDigest !== input.artifactDigest ||
        source.accessPolicyVersion !== input.accessPolicyVersion ||
        !/^static-artifacts\/sha256\/[a-f0-9]{64}$/u.test(input.artifactRef) ||
        !sameNullable(source.storeGeneration, input.storeGeneration) ||
        !sameNullable(source.configDigest, input.configDigest) ||
        !sameNullable(source.dbMigrationPoint, input.dbMigrationPoint) ||
        !sourcePin ||
        !rollbackPin ||
        !sameReleasePlanEntitlementsPin(sourcePin, rollbackPin) ||
        source.projectManifestDigest !== input.releaseFence.expectedManifestDigest
      ) {
        throw rollbackConflict('STATIC_ROLLBACK_RELEASE_CONFLICT');
      }

      const routingEvidence = buildStaticRollbackRoutingEvidence({
        projectId: input.projectId,
        environment: input.environment,
        sourceManifestId: source.id,
        sourceManifestVersion: source.version,
        sourceDeploymentId: source.deploymentId,
        artifactRef: input.artifactRef,
        artifactDigest: input.artifactDigest,
      });

      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "Deployment" WHERE "id" = $1 AND "projectId" = $2 FOR UPDATE',
        input.deploymentId,
        input.projectId,
      );

      const deployment = await tx.deployment.findFirstOrThrow({
        where: { id: input.deploymentId, projectId: input.projectId },
      });
      const accessPolicy = await tx.deploymentAccessPolicy.findUnique({
        where: {
          projectId_environment_version: {
            projectId: input.projectId,
            environment: input.environment,
            version: input.accessPolicyVersion,
          },
        },
      });

      if (deployment.accessPolicyVersion !== input.accessPolicyVersion || !validDeploymentAccessPolicy(accessPolicy)) {
        throw rollbackConflict('ROLLBACK_ACCESS_POLICY_INVALID');
      }
      const existingRows = await tx.releaseManifest.findMany({
        where: { deploymentId: input.deploymentId },
        orderBy: { version: 'desc' },
        take: 2,
      });

      const existing = existingRows[0];

      if (existing) {
        let existingRoutingEvidence;

        try {
          existingRoutingEvidence = parseStaticRollbackRoutingEvidence(existing.promotionEvidence);
        } catch {
          throw rollbackConflict('STATIC_ROLLBACK_RELEASE_CONFLICT');
        }

        if (
          existingRows.length !== 1 ||
          existing.projectId !== input.projectId ||
          existing.environment !== input.environment ||
          existing.version !== input.expectedHeadVersion + 1 ||
          existing.provider !== input.provider ||
          existing.artifactKind !== 'static-snapshot' ||
          existing.artifactRef !== input.artifactRef ||
          existing.artifactDigest !== input.artifactDigest ||
          !sameNullable(existing.storeGeneration, input.storeGeneration) ||
          !sameNullable(existing.configDigest, input.configDigest) ||
          !sameNullable(existing.dbMigrationPoint, input.dbMigrationPoint) ||
          existing.accessPolicyVersion !== input.accessPolicyVersion ||
          !sameReleasePlanEntitlementsPin(existing.planEntitlements, sourcePin) ||
          existing.projectManifestDigest !== source.projectManifestDigest ||
          existingRoutingEvidence.hash !== routingEvidence.hash ||
          deployment.status !== 'READY'
        ) {
          throw rollbackConflict('STATIC_ROLLBACK_RELEASE_CONFLICT');
        }

        const mappedDeployment = mapDeployment(deployment);
        const rollbackReceipt = await completeRollbackSuccessInTransaction(tx, {
          operation,
          deployment: mappedDeployment,
          source,
          responseContentLanguage: input.responseContentLanguage,
        });

        return { deployment: mappedDeployment, manifest: mapReleaseManifest(existing), rollbackReceipt };
      }

      const metadata = deployment.metadata as Record<string, unknown> | null;
      const releaseMetadata = input.metadata;

      if (
        metadata?.rollbackOperationId !== operation.id ||
        releaseMetadata.rollbackOperationId !== operation.id ||
        releaseMetadata.projectManifestDigest !== operation.projectManifestDigest ||
        deployment.provider !== 'static' ||
        deployment.environmentName !== input.environment ||
        deployment.rolledBackFromId !== source.deploymentId ||
        ['READY', 'FAILED', 'CANCELED'].includes(deployment.status)
      ) {
        throw rollbackConflict('STATIC_ROLLBACK_RELEASE_CONFLICT');
      }

      const currentProjectManifest = await tx.projectManifestRevision.findFirst({
        where: { projectId: input.projectId },
        orderBy: { manifestVersion: 'desc' },
        select: { digest: true },
      });

      if (!currentProjectManifest || currentProjectManifest.digest !== operation.projectManifestDigest) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH')), {
          code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH',
          statusCode: 409,
        });
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

      const observedVersion = latest?.version ?? 0;

      if (observedVersion !== input.expectedHeadVersion) {
        throw Object.assign(new Error(ROLLBACK_STORE_FAILURE.releaseMoved), {
          code: ROLLBACK_STORE_FAILURE.releaseMoved,
          statusCode: 409,
          expectedVersion: input.expectedHeadVersion,
          observedVersion,
        });
      }

      const manifest = await tx.releaseManifest.create({
        data: {
          projectId: input.projectId,
          deploymentId: input.deploymentId,
          environment: input.environment,
          version: observedVersion + 1,
          provider: input.provider,
          artifactKind: 'static-snapshot',
          artifactRef: input.artifactRef,
          artifactDigest: input.artifactDigest,
          storeGeneration: input.storeGeneration ?? null,
          configDigest: input.configDigest ?? null,
          dbMigrationPoint: input.dbMigrationPoint ?? null,
          promotionEvidence: routingEvidence as unknown as Prisma.InputJsonValue,
          accessPolicyVersion: input.accessPolicyVersion,
          planEntitlements: sourcePin as unknown as Prisma.InputJsonValue,
          projectManifestDigest: source.projectManifestDigest,
        },
      });
      const transitioned = await tx.deployment.updateMany({
        where: {
          id: input.deploymentId,
          projectId: input.projectId,
          status: { notIn: ['READY', 'FAILED', 'CANCELED'] as any },
        },
        data: {
          status: 'READY',
          url: input.url,
          previewUrl: input.environment !== 'production' ? input.url : null,
          productionUrl: input.environment === 'production' ? input.url : null,
          metadata: input.metadata as Prisma.InputJsonValue,
          logs: input.logs as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(input.finishedAt),
        },
      });

      if (transitioned.count !== 1) {
        throw rollbackConflict('STATIC_ROLLBACK_RELEASE_CONFLICT');
      }

      const ready = await tx.deployment.findUniqueOrThrow({ where: { id: input.deploymentId } });
      const mappedReady = mapDeployment(ready);
      const rollbackReceipt = await completeRollbackSuccessInTransaction(tx, {
        operation,
        deployment: mappedReady,
        source,
        responseContentLanguage: input.responseContentLanguage,
      });

      return { deployment: mappedReady, manifest: mapReleaseManifest(manifest), rollbackReceipt };
    });
  }

  async commitServerImageRelease(input: ServerImageReleaseCommitInput): Promise<ServerImageReleaseCommitResult> {
    const ledger = new LedgerStore(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      /* Parse/decrypt/hash-check before any row mutation in this transaction. */
      const retainedRuntime = parseServerRollbackRuntimeSpec(input.runtimeSpec).spec;
      const retainedPromotion = parseServerRollbackPromotionEvidence(input.promotionEvidence);

      if (input.rollbackFence && input.reservedVmFence) {
        throw new Error(ROLLBACK_STORE_FAILURE.serverReleaseFenceConflict);
      }
      if (input.rollbackFence && !input.rollbackResponseContentLanguage) {
        throw new TypeError('ROLLBACK_RESPONSE_CONTENT_LANGUAGE_REQUIRED');
      }

      /* Rollback authority starts at actor; ordinary release starts at topology. */
      if (input.rollbackFence) {
        await acquireRollbackPurgeScope(tx, input.rollbackFence.operationId);
        await lockProjectAfterPurgeTopology(tx, input.projectId);
      } else {
        await this.accountPurge.assertProjectMutable(tx, input.projectId);
        await lockProjectMutation(tx, input.projectId);
      }
      await requireProjectReleaseFence(tx, input.projectId, input.releaseFence);

      const rollbackOperation = input.rollbackFence ? await requireRollbackLease(tx, input.rollbackFence) : undefined;

      /*
       * This happens inside the SAME transaction as manifest append + READY.
       * Any promotion/manifest/policy failure below rolls the ledger settlement,
       * billing period, runtimeVersion and operation status back together.
       */
      const reservedCommit = input.reservedVmFence
        ? await commitReservedVmOperationInTransaction(tx, ledger, input.reservedVmFence)
        : undefined;
      const reservedRedeployIntent =
        reservedCommit?.operation.kind === 'REDEPLOY'
          ? parseReservedVmRedeployReleaseIntent(reservedCommit.operation.response)
          : undefined;

      if (reservedCommit?.operation.kind === 'REDEPLOY' && !reservedRedeployIntent) {
        throw Object.assign(reservedVmStoreError('Reserved VM redeploy release pins are missing or corrupt.'), {
          code: 'RESERVED_VM_REDEPLOY_PIN_INVALID',
          statusCode: 409,
        });
      }

      const rollbackSource = rollbackOperation ? await requireRollbackSourceManifest(tx, rollbackOperation) : undefined;

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
      const rollbackOperationId = (deployment.metadata as Record<string, unknown> | null)?.rollbackOperationId;
      const deploymentPin = parseReleasePlanEntitlementsPin(deploymentPlanEntitlementsPin(deployment.metadata));
      const inputPin = parseReleasePlanEntitlementsPin(deploymentPlanEntitlementsPin(input.metadata));
      const rollbackSourcePin = parseReleasePlanEntitlementsPin(rollbackSource?.planEntitlements);
      const releasePin = rollbackOperation
        ? rollbackSourcePin
        : (reservedRedeployIntent?.targetPlanEntitlements ?? deploymentPin);
      const releaseProjectManifestDigest = rollbackOperation
        ? rollbackSource?.projectManifestDigest
        : (reservedRedeployIntent?.targetProjectManifestDigest ?? deploymentProjectManifestDigest(deployment.metadata));
      const reservedRedeploySourceMatches =
        reservedRedeployIntent === undefined ||
        (deploymentPin !== undefined &&
          sameReleasePlanEntitlementsPin(deploymentPin, reservedRedeployIntent.priorPlanEntitlements) &&
          deploymentProjectManifestDigest(deployment.metadata) === reservedRedeployIntent.priorProjectManifestDigest);
      const reservedRedeployTargetMatches =
        reservedRedeployIntent !== undefined &&
        deploymentPin !== undefined &&
        sameReleasePlanEntitlementsPin(deploymentPin, reservedRedeployIntent.targetPlanEntitlements) &&
        deploymentProjectManifestDigest(deployment.metadata) === reservedRedeployIntent.targetProjectManifestDigest;
      const storedRateCard = await tx.rateCard.findUnique({
        where: { version: retainedRuntime.machine.rateCardVersion },
        select: { data: true },
      });
      const historicalRateCard =
        storedRateCard?.data ??
        (retainedRuntime.machine.rateCardVersion === BUILTIN_RATE_CARD.version ? BUILTIN_RATE_CARD : undefined);
      const releaseMachineMatchesHistoricalCard = serverRollbackMachineMatchesRateCard(
        retainedRuntime.machine,
        historicalRateCard,
      );
      const reservedReleaseMachineMatches =
        !reservedCommit ||
        !['CREATE', 'REDEPLOY'].includes(reservedCommit.operation.kind) ||
        (retainedRuntime.machine.key === reservedCommit.operation.targetMachineSize &&
          retainedRuntime.machine.cpuMillicores === reservedCommit.operation.targetCpuMillicores &&
          retainedRuntime.machine.memoryMb === reservedCommit.operation.targetMemoryMb &&
          retainedRuntime.machine.rateCardVersion === reservedCommit.operation.rateCardVersion);
      const releaseRuntimeMatchesDeployment = serverRollbackRuntimeMatchesDeployment(retainedRuntime, deployment);

      if (
        deployment.project.organizationId !== input.organizationId ||
        input.organizationId !== input.releaseFence.expectedOrganizationId ||
        (input.metadata as Record<string, unknown>).projectManifestDigest !==
          input.releaseFence.expectedManifestDigest ||
        deployment.provider !== 'server' ||
        deployment.environmentName !== input.environment ||
        image?.imageRef !== input.artifactRef ||
        image?.imageDigest !== input.artifactDigest ||
        !releasePin ||
        !inputPin ||
        !sameReleasePlanEntitlementsPin(releasePin, inputPin) ||
        (!reservedRedeploySourceMatches && !reservedRedeployTargetMatches) ||
        releaseProjectManifestDigest !== input.releaseFence.expectedManifestDigest ||
        !isCommittedPromotionForTenant(
          serverDeploy?.promotion,
          deployment.project.organizationId,
          input.artifactDigest,
          input.artifactRef,
        )
      ) {
        throw new Error(SERVER_RELEASE_PROMOTION_NOT_COMMITTED);
      }
      const expectedPromotion = buildServerRollbackPromotionEvidence({
        organizationId: input.organizationId,
        projectId: input.projectId,
        artifactRef: input.artifactRef,
        artifactDigest: input.artifactDigest,
        promotion: serverDeploy.promotion,
      });

      if (
        retainedRuntime.organizationId !== input.organizationId ||
        retainedRuntime.projectId !== input.projectId ||
        retainedRuntime.projectManifestDigest !== releaseProjectManifestDigest ||
        retainedRuntime.plan.key !== releasePin.plan ||
        retainedRuntime.plan.entitlementsDigest !== rollbackPlanEntitlementsDigest(releasePin) ||
        retainedRuntime.accessPolicyVersion !== deployment.accessPolicyVersion ||
        retainedRuntime.machine.key !== deployment.machineSize ||
        !releaseMachineMatchesHistoricalCard ||
        !reservedReleaseMachineMatches ||
        !releaseRuntimeMatchesDeployment ||
        retainedRuntime.secretPolicy !== 'CURRENT' ||
        (retainedRuntime.database.mode === 'none'
          ? input.dbMigrationPoint !== undefined
          : input.dbMigrationPoint !== retainedRuntime.database.ledgerDigest) ||
        retainedPromotion.organizationId !== input.organizationId ||
        retainedPromotion.projectId !== input.projectId ||
        retainedPromotion.artifactRef !== input.artifactRef ||
        retainedPromotion.artifactDigest !== input.artifactDigest ||
        retainedPromotion.hash !== expectedPromotion.hash
      ) {
        throw new Error(SERVER_RELEASE_PROMOTION_NOT_COMMITTED);
      }

      const accessPolicy = await tx.deploymentAccessPolicy.findUnique({
        where: {
          projectId_environment_version: {
            projectId: input.projectId,
            environment: input.environment,
            version: deployment.accessPolicyVersion,
          },
        },
      });

      if (!validDeploymentAccessPolicy(accessPolicy)) {
        throw new Error(ROLLBACK_STORE_FAILURE.serverReleaseAccessPolicyInvalid);
      }

      if (
        (typeof rollbackOperationId === 'string' &&
          (!rollbackOperation || rollbackOperation.id !== rollbackOperationId)) ||
        (rollbackOperation &&
          (rollbackOperation.projectId !== input.projectId ||
            rollbackOperation.deploymentId !== input.deploymentId ||
            rollbackOperation.expectedHeadVersion !== input.rollbackFence?.expectedHeadVersion ||
            rollbackOperation.environment !== input.environment ||
            rollbackOperation.phase !== 'EFFECT_STARTED' ||
            rollbackOperation.effectFencingToken !== input.rollbackFence?.fencingToken ||
            rollbackSource?.artifactKind !== 'server-image' ||
            parseServerRollbackRuntimeSpec(rollbackSource.runtimeSpec).spec.runtimeClass !== 'autoscale' ||
            rollbackSource.accessPolicyVersion !== deployment.accessPolicyVersion ||
            rollbackSource.provider !== 'server' ||
            rollbackSource.artifactRef !== input.artifactRef ||
            rollbackSource.artifactDigest !== input.artifactDigest ||
            !rollbackSourcePin ||
            !sameNullable(rollbackSource.storeGeneration, input.storeGeneration) ||
            !sameNullable(rollbackSource.configDigest, input.configDigest) ||
            !sameNullable(rollbackSource.dbMigrationPoint, input.dbMigrationPoint) ||
            parseServerRollbackRuntimeSpec(rollbackSource.runtimeSpec).spec.hash !== retainedRuntime.hash ||
            parseServerRollbackPromotionEvidence(rollbackSource.promotionEvidence).hash !== retainedPromotion.hash))
      ) {
        throw rollbackOwnershipLost();
      }

      const existingRows = await tx.releaseManifest.findMany({
        where: { deploymentId: input.deploymentId },
        orderBy: { version: 'desc' },
        take: 2,
      });

      const existing = existingRows[0];

      if (existing) {
        const releaseDiffers =
          existing.projectId !== input.projectId ||
          existing.environment !== input.environment ||
          existing.provider !== 'server' ||
          existing.artifactKind !== 'server-image' ||
          existing.artifactRef !== input.artifactRef ||
          existing.artifactDigest !== input.artifactDigest ||
          !sameNullable(existing.storeGeneration, input.storeGeneration) ||
          !sameNullable(existing.configDigest, input.configDigest) ||
          !sameNullable(existing.dbMigrationPoint, input.dbMigrationPoint) ||
          parseServerRollbackRuntimeSpec(existing.runtimeSpec).spec.hash !== retainedRuntime.hash ||
          parseServerRollbackPromotionEvidence(existing.promotionEvidence).hash !== retainedPromotion.hash ||
          (rollbackOperation && existing.version !== input.rollbackFence!.expectedHeadVersion + 1) ||
          existing.accessPolicyVersion !== deployment.accessPolicyVersion ||
          !sameReleasePlanEntitlementsPin(existing.planEntitlements, releasePin) ||
          existing.projectManifestDigest !== releaseProjectManifestDigest;

        if (releaseDiffers) {
          /*
           * Ordinary deploy ids are immutable and therefore conflict here. A
           * REDEPLOY intentionally appends another manifest for the same stable
           * Reserved VM id after the previous release; only that fenced saga may
           * continue past a different latest digest.
           */
          if (reservedCommit?.operation.kind !== 'REDEPLOY') {
            throw new Error(SERVER_RELEASE_MANIFEST_CONFLICT);
          }
        } else {
          if (deployment.status !== 'READY') {
            throw new Error(SERVER_RELEASE_MANIFEST_WITHOUT_READY);
          }

          const mappedDeployment = mapDeployment(deployment);
          const rollbackReceipt = rollbackOperation
            ? await completeRollbackSuccessInTransaction(tx, {
                operation: rollbackOperation,
                deployment: mappedDeployment,
                source: rollbackSource!,
                responseContentLanguage: input.rollbackResponseContentLanguage!,
              })
            : undefined;

          return {
            committed: true,
            deployment: mappedDeployment,
            manifest: mapReleaseManifest(existing),
            ...(rollbackReceipt ? { rollbackReceipt } : {}),
          };
        }
      }

      if (reservedRedeployTargetMatches) {
        /* Target metadata is only valid together with the exact manifest above. */
        throw new Error(SERVER_RELEASE_MANIFEST_CONFLICT);
      }

      if (['READY', 'FAILED', 'CANCELED'].includes(deployment.status)) {
        if (!(deployment.status === 'READY' && reservedCommit?.operation.kind === 'REDEPLOY')) {
          if (reservedCommit) {
            /* Returning false would commit the Reserved settlement without a release. */
            throw new Error(SERVER_RELEASE_MANIFEST_CONFLICT);
          }

          return { committed: false, deployment: mapDeployment(deployment) };
        }
      }

      /*
       * For a fresh deploy there is no manifest above. For REDEPLOY, a different
       * latest manifest is expected and the code deliberately falls through to
       * append the next project/environment version.
       */

      if (rollbackOperation) {
        const rollbackMetadata = input.metadata as Record<string, unknown>;

        if (
          rollbackMetadata.rollbackOperationId !== rollbackOperation.id ||
          rollbackMetadata.projectManifestDigest !== rollbackOperation.projectManifestDigest ||
          deployment.rolledBackFromId !== rollbackSource!.deploymentId
        ) {
          throw rollbackOwnershipLost();
        }

        const currentProjectManifest = await tx.projectManifestRevision.findFirst({
          where: { projectId: input.projectId },
          orderBy: { manifestVersion: 'desc' },
          select: { digest: true },
        });

        if (!currentProjectManifest || currentProjectManifest.digest !== rollbackOperation.projectManifestDigest) {
          throw Object.assign(new Error(appPublicEnglish('PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH')), {
            code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH',
            statusCode: 409,
          });
        }
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

      const observedVersion = latest?.version ?? 0;

      if (input.rollbackFence && observedVersion !== input.rollbackFence.expectedHeadVersion) {
        throw Object.assign(new Error(ROLLBACK_STORE_FAILURE.releaseMoved), {
          code: ROLLBACK_STORE_FAILURE.releaseMoved,
          statusCode: 409,
          expectedVersion: input.rollbackFence.expectedHeadVersion,
          observedVersion,
        });
      }
      const manifest = await tx.releaseManifest.create({
        data: {
          projectId: input.projectId,
          deploymentId: input.deploymentId,
          environment: input.environment,
          version: observedVersion + 1,
          provider: 'server',
          artifactKind: 'server-image',
          artifactRef: input.artifactRef,
          artifactDigest: input.artifactDigest,
          storeGeneration: input.storeGeneration ?? null,
          configDigest: input.configDigest ?? null,
          dbMigrationPoint: input.dbMigrationPoint ?? null,
          runtimeSpec: input.runtimeSpec as Prisma.InputJsonValue,
          promotionEvidence: input.promotionEvidence as Prisma.InputJsonValue,
          accessPolicyVersion: deployment.accessPolicyVersion,
          planEntitlements: releasePin as unknown as Prisma.InputJsonValue,
          projectManifestDigest: releaseProjectManifestDigest,
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

      const mappedReady = mapDeployment(ready);
      const rollbackReceipt = rollbackOperation
        ? await completeRollbackSuccessInTransaction(tx, {
            operation: rollbackOperation,
            deployment: mappedReady,
            source: rollbackSource!,
            responseContentLanguage: input.rollbackResponseContentLanguage!,
          })
        : undefined;

      return {
        committed: true,
        deployment: mappedReady,
        manifest: mapReleaseManifest(manifest),
        ...(rollbackReceipt ? { rollbackReceipt } : {}),
      };
    });
  }

  async commitFencedServerReady(input: FencedServerReadyCommitInput): Promise<DeploymentRecord> {
    return this.prisma.$transaction(async (tx) => {
      await this.accountPurge.assertProjectMutable(tx, input.projectId);
      await lockProjectMutation(tx, input.projectId);
      await requireProjectReleaseFence(tx, input.projectId, input.releaseFence);
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "Deployment" WHERE "id" = $1 AND "projectId" = $2 FOR UPDATE',
        input.deploymentId,
        input.projectId,
      );

      const deployment = await tx.deployment.findFirstOrThrow({
        where: { id: input.deploymentId, projectId: input.projectId },
      });

      if (
        deployment.provider !== 'server' ||
        (input.metadata as Record<string, unknown>).projectManifestDigest !==
          input.releaseFence.expectedManifestDigest ||
        ['READY', 'FAILED', 'CANCELED'].includes(deployment.status)
      ) {
        throw Object.assign(reservedVmStoreError('SERVER_RELEASE_FENCE_CONFLICT'), {
          code: 'SERVER_RELEASE_FENCE_CONFLICT',
          statusCode: 409,
        });
      }

      return mapDeployment(
        await tx.deployment.update({
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
        }),
      );
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
    expectedOrganizationId: string;
    schemaVersion: number;
    manifestVersion: number;
    digest: string;
    manifest: ProjectManifest;
    expectedDigest?: string;
    createdByUserId?: string;
  }): Promise<ProjectManifestRevisionRecord> {
    const manifest = verifyStoredProjectManifestRevision(input, input.projectId);

    return this.prisma.$transaction(async (tx) => {
      /*
       * The checkpoint barrier and manifest append share the global mutation
       * order. A route-level preflight alone has a check->barrier->insert race;
       * under topology -> checkpoint -> Project we either append first, or
       * observe the durable live barrier and refuse the write.
       */
      await this.lockExpectedProjectTenantMutation(tx, input);

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
  }

  async getActiveRateCard() {
    const card = await this.prisma.rateCard.findFirst({
      where: { active: true },
      orderBy: { version: 'desc' },
      select: { version: true, data: true },
    });

    return card ? { version: card.version, data: card.data as unknown } : undefined;
  }

  async getRateCard(version: number) {
    const card = await this.prisma.rateCard.findUnique({
      where: { version },
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

  async getAgentRoutingCard(version: number) {
    const card = await this.prisma.agentRoutingCard.findUnique({
      where: { version },
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

        /*
         * Bound the sweep so a large backlog can't exceed a single reaper tick's
         * budget; the unswept tail is picked up on the next run.
         */
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

  /*
   * I25: fetch a single ticket, scoped to its org so one org can't read another's
   * ticket by guessing an id. Returns null when the ticket isn't in that org.
   */
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

        /*
         * Bound the payload — an unbounded findMany on a misconfigured tenant could
         * return an enormous list. 1000 flags is far beyond any real registry.
         */
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

  async advanceStaticArtifactGcCursor(input: {
    rootIdentity: string;
    sortedDigests: string[];
    limit: number;
  }): Promise<string[]> {
    if (
      !/^[a-f0-9]{64}$/u.test(input.rootIdentity) ||
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 10_000 ||
      input.sortedDigests.some((digest) => !/^[a-f0-9]{64}$/u.test(digest))
    ) {
      throw new TypeError('STATIC_ARTIFACT_GC_CURSOR_INPUT_INVALID');
    }
    const digests = [...new Set(input.sortedDigests)].sort();
    const key = `static-artifact-gc:${input.rootIdentity}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `system-setting:${key}`);
      const setting = await tx.systemSetting.findUnique({ where: { key } });
      const value = setting?.value as { version?: unknown; lastDigest?: unknown } | null;
      const lastDigest = value?.version === 1 && typeof value.lastDigest === 'string' ? value.lastDigest : undefined;
      const firstAfter = lastDigest === undefined ? 0 : digests.findIndex((digest) => digest > lastDigest);
      const start = firstAfter < 0 ? 0 : firstAfter;
      const batch = digests.slice(start, start + input.limit);
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: { version: 1, lastDigest: batch.at(-1) ?? null } },
        update: { value: { version: 1, lastDigest: batch.at(-1) ?? null } },
      });
      return batch;
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

        /*
         * MFA optional everywhere (Avi's decision): default an org to NOT forcing
         * admin MFA. Note this setting is not itself an enforcement gate — the
         */
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

  async createAiConversation(
    input:
      | { projectId: string; expectedOrganizationId: string; userId: string; title?: string }
      | { projectId?: undefined; expectedOrganizationId?: undefined; userId: string; title?: string },
  ) {
    if (!input.projectId) {
      return mapAiConversation(
        await this.prisma.aiConversation.create({ data: { userId: input.userId, title: input.title } }),
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockExpectedProjectTenantMutation(tx, {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
      });
      return mapAiConversation(
        await tx.aiConversation.create({
          data: { projectId: input.projectId, userId: input.userId, title: input.title },
        }),
      );
    });
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
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ledger-user-spend:${input.organizationId}:${input.userId}`}))`;
      return tx.userSpendLimit.upsert({
        where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
        update: { limitCents: input.limitCents },
        create: { organizationId: input.organizationId, userId: input.userId, limitCents: input.limitCents },
      });
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
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ledger-user-spend:${organizationId}:${userId}`}))`;
      await tx.userSpendLimit.deleteMany({ where: { organizationId, userId } });
    });
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

  async reserveCanonicalUserSpend(input: {
    organizationId: string;
    userId: string;
    projectId: string;
    idempotencyKey: string;
    maxAmountCents: number;
    periodStart?: string;
    expiresInMs: number;
    requestHash: string;
    enforceUserSpendLimit: boolean;
  }) {
    if (!Number.isSafeInteger(input.maxAmountCents) || input.maxAmountCents < 1) {
      throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_AMOUNT_INVALID' });
    }
    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [input.userId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      return new LedgerStore(this.prisma).reserveUsageInTransaction(tx, {
        organizationId: input.organizationId,
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        operation: 'ai.chat',
        currency: 'usd',
        maxAmountMinor: BigInt(input.maxAmountCents),
        expiresInMs: input.expiresInMs,
        enforceUserSpendLimit: input.enforceUserSpendLimit,
        userSpendPeriodStart: input.enforceUserSpendLimit ? input.periodStart : undefined,
        requestHash: input.requestHash,
        reviveReleasedReplay: true,
      });
    });
  }

  async claimCanonicalAiExecution(input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    projectId: string;
    requestId: string;
    claimOwnerId: string;
    claimLeaseMs: number;
  }) {
    if (
      !input.projectId ||
      !input.requestId ||
      !input.claimOwnerId ||
      !Number.isSafeInteger(input.claimLeaseMs) ||
      input.claimLeaseMs < 15_000 ||
      input.claimLeaseMs > 5 * 60_000
    ) {
      throw Object.assign(new Error(), { code: 'LEDGER_AI_START_INVALID' });
    }
    const requestHash = canonicalAiExecutionHash(input);

    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [input.userId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${input.reservationId} FOR UPDATE`;
      const reservation = await tx.ledgerReservation.findUnique({ where: { id: input.reservationId } });
      if (
        !reservation ||
        reservation.organizationId !== input.organizationId ||
        reservation.userId !== input.userId ||
        reservation.operation !== 'ai.chat'
      ) {
        throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_SCOPE_MISMATCH' });
      }
      const metadata = recordObject(reservation.metadata) ?? {};
      const existing = recordObject(metadata.canonicalAiExecution);
      const platformIntent = recordObject(metadata.canonicalAiPlatformIntent);
      const platformUsage = recordObject(metadata.canonicalAiPlatformUsage);
      let platformReceipt: { state: 'exact' | 'recovered'; outcome?: 'hard' | 'easy' } | undefined;
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      if (!clock) {
        throw Object.assign(new Error(), { code: 'DATABASE_TIME_UNAVAILABLE' });
      }
      if (existing) {
        if (existing.version !== CANONICAL_AI_USAGE_VERSION || existing.requestHash !== requestHash) {
          throw Object.assign(new Error(), { code: 'LEDGER_AI_START_CONFLICT', statusCode: 409 });
        }
        if (
          typeof existing.claimedAt !== 'string' ||
          typeof existing.leaseExpiresAt !== 'string' ||
          typeof existing.executionToken !== 'string' ||
          typeof existing.claimOwnerId !== 'string'
        ) {
          throw Object.assign(new Error(), { code: 'LEDGER_AI_START_CORRUPT' });
        }
        if (platformUsage) {
          const validation = await validateCanonicalPlatformReceipt(tx, {
            reservationId: reservation.id,
            organizationId: reservation.organizationId,
            userId: reservation.userId!,
            execution: existing,
            intent: platformIntent,
            receipt: platformUsage,
          });
          if (!validation.valid) {
            throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_CORRUPT' });
          }
          platformReceipt = {
            state: validation.recovered ? 'recovered' : 'exact',
            ...(validation.outcome ? { outcome: validation.outcome } : {}),
          };
        }
        const sameTransportAttempt = existing.claimOwnerId === input.claimOwnerId;
        const leaseExpiresAtMs = Date.parse(existing.leaseExpiresAt);
        const providerIrreversible =
          existing.state === 'started' ||
          existing.state === 'received' ||
          existing.state === 'settled' ||
          Boolean(platformIntent && !platformUsage) ||
          Boolean(recordObject(metadata.canonicalAiUsageBatch));
        if (sameTransportAttempt || providerIrreversible || leaseExpiresAtMs > clock.now.getTime()) {
          return {
            claimedAt: existing.claimedAt,
            leaseExpiresAt: existing.leaseExpiresAt,
            executionToken: existing.executionToken,
            replayed: !sameTransportAttempt,
            reservationStatus: reservation.status,
            ...(platformReceipt ? { platformReceipt } : {}),
          };
        }
        if (reservation.status !== 'ACTIVE') {
          throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_NOT_ACTIVE' });
        }
        const executionToken = randomUUID();
        const leaseExpiresAt = new Date(clock.now.getTime() + input.claimLeaseMs).toISOString();
        await tx.ledgerReservation.update({
          where: { id: reservation.id },
          data: {
            metadata: {
              ...metadata,
              canonicalAiExecution: {
                ...existing,
                state: 'claimed',
                claimOwnerId: input.claimOwnerId,
                executionToken,
                claimedAt: clock.now.toISOString(),
                leaseExpiresAt,
              },
            } as Prisma.InputJsonValue,
          },
        });
        return {
          claimedAt: clock.now.toISOString(),
          leaseExpiresAt,
          executionToken,
          replayed: false,
          reservationStatus: reservation.status,
          ...(platformReceipt ? { platformReceipt } : {}),
        };
      }
      if (platformUsage) {
        throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_CORRUPT' });
      }
      if (reservation.status !== 'ACTIVE') {
        throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_NOT_ACTIVE' });
      }
      const executionToken = randomUUID();
      const leaseExpiresAt = new Date(clock.now.getTime() + input.claimLeaseMs).toISOString();
      await tx.ledgerReservation.update({
        where: { id: reservation.id },
        data: {
          metadata: {
            ...metadata,
            canonicalAiExecution: {
              version: CANONICAL_AI_USAGE_VERSION,
              state: 'claimed',
              requestHash,
              requestId: input.requestId,
              projectId: input.projectId,
              claimOwnerId: input.claimOwnerId,
              executionToken,
              claimedAt: clock.now.toISOString(),
              leaseExpiresAt,
            },
          } as Prisma.InputJsonValue,
        },
      });
      return {
        claimedAt: clock.now.toISOString(),
        leaseExpiresAt,
        executionToken,
        replayed: false,
        reservationStatus: reservation.status,
      };
    });
  }

  async markCanonicalUserSpendStarted(input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    projectId: string;
    requestId: string;
    executionToken: string;
    reconcileAfterMs: number;
  }) {
    if (
      !input.projectId ||
      !input.requestId ||
      !Number.isSafeInteger(input.reconcileAfterMs) ||
      input.reconcileAfterMs < 60_000 ||
      input.reconcileAfterMs > 24 * 60 * 60_000
    ) {
      throw Object.assign(new Error(), { code: 'LEDGER_AI_START_INVALID' });
    }
    const requestHash = canonicalAiExecutionHash(input);
    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [input.userId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${input.reservationId} FOR UPDATE`;
      const reservation = await tx.ledgerReservation.findUnique({ where: { id: input.reservationId } });
      if (
        !reservation ||
        reservation.organizationId !== input.organizationId ||
        reservation.userId !== input.userId ||
        reservation.operation !== 'ai.chat'
      ) {
        throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_SCOPE_MISMATCH' });
      }
      const metadata = recordObject(reservation.metadata) ?? {};
      const execution = recordObject(metadata.canonicalAiExecution);
      if (
        !execution ||
        execution.version !== CANONICAL_AI_USAGE_VERSION ||
        execution.requestHash !== requestHash ||
        execution.requestId !== input.requestId ||
        execution.projectId !== input.projectId ||
        execution.executionToken !== input.executionToken
      ) {
        throw Object.assign(new Error(), { code: 'LEDGER_AI_EXECUTION_CLAIM_REQUIRED' });
      }
      if (typeof execution.startedAt === 'string') {
        return { startedAt: execution.startedAt, replayed: true };
      }
      if (execution.state !== 'claimed' || reservation.status !== 'ACTIVE') {
        throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_NOT_ACTIVE' });
      }
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      if (!clock) {
        throw Object.assign(new Error(), { code: 'DATABASE_TIME_UNAVAILABLE' });
      }
      const settleAfter = new Date(clock.now.getTime() + input.reconcileAfterMs);
      const protectedExpiry = new Date(settleAfter.getTime() + 15 * 60_000);
      await tx.ledgerReservation.update({
        where: { id: reservation.id },
        data: {
          expiresAt: reservation.expiresAt > protectedExpiry ? reservation.expiresAt : protectedExpiry,
          metadata: {
            ...metadata,
            canonicalAiExecution: {
              ...execution,
              state: 'started',
              startedAt: clock.now.toISOString(),
              settleAfter: settleAfter.toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      });
      return { startedAt: clock.now.toISOString(), replayed: false };
    });
  }

  async markCanonicalPlatformAiUsageStarted(input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    requestId: string;
    executionToken: string;
    projectId: string;
    callId: string;
    provider: string;
    model: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    maxCostCents: number;
    agentRouting: CanonicalAiClassifierRouting;
    reconcileAfterMs: number;
  }) {
    if (
      !input.callId ||
      !input.provider ||
      !input.model ||
      !Number.isSafeInteger(input.maxInputTokens) ||
      input.maxInputTokens < 0 ||
      !Number.isSafeInteger(input.maxOutputTokens) ||
      input.maxOutputTokens < 0 ||
      !Number.isSafeInteger(input.maxCostCents) ||
      input.maxCostCents < 0 ||
      !canonicalAiClassifierRouting(input.agentRouting) ||
      !Number.isSafeInteger(input.reconcileAfterMs) ||
      input.reconcileAfterMs < 60_000 ||
      input.reconcileAfterMs > 60 * 60_000
    ) {
      throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_INVALID' });
    }
    const requestHash = canonicalAiPlatformIntentHash(input);
    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [input.userId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${input.reservationId} FOR UPDATE`;
      const reservation = await tx.ledgerReservation.findUnique({ where: { id: input.reservationId } });
      if (
        !reservation ||
        reservation.organizationId !== input.organizationId ||
        reservation.userId !== input.userId ||
        reservation.operation !== 'ai.chat'
      ) {
        throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_SCOPE_MISMATCH' });
      }
      const metadata = recordObject(reservation.metadata) ?? {};
      const execution = recordObject(metadata.canonicalAiExecution);
      if (
        !execution ||
        execution.requestId !== input.requestId ||
        execution.projectId !== input.projectId ||
        execution.executionToken !== input.executionToken
      ) {
        throw Object.assign(new Error(), { code: 'LEDGER_AI_EXECUTION_CLAIM_REQUIRED' });
      }
      const existing = recordObject(metadata.canonicalAiPlatformIntent);
      if (existing) {
        if (existing.version !== CANONICAL_AI_USAGE_VERSION || existing.requestHash !== requestHash) {
          throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_CONFLICT', statusCode: 409 });
        }
        if (typeof existing.startedAt !== 'string') {
          throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_CORRUPT' });
        }
        return { startedAt: existing.startedAt, replayed: true };
      }
      if (reservation.status !== 'ACTIVE') {
        throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_NOT_ACTIVE' });
      }
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      if (!clock) {
        throw Object.assign(new Error(), { code: 'DATABASE_TIME_UNAVAILABLE' });
      }
      await tx.ledgerReservation.update({
        where: { id: reservation.id },
        data: {
          metadata: {
            ...metadata,
            canonicalAiPlatformIntent: {
              version: CANONICAL_AI_USAGE_VERSION,
              requestHash,
              requestId: input.requestId,
              executionToken: input.executionToken,
              projectId: input.projectId,
              callId: input.callId,
              provider: input.provider,
              model: input.model,
              maxInputTokens: input.maxInputTokens,
              maxOutputTokens: input.maxOutputTokens,
              maxCostCents: input.maxCostCents,
              agentRouting: {
                mode: input.agentRouting.mode,
                highEffort: input.agentRouting.highEffort,
                turbo: input.agentRouting.turbo,
                lineKey: 'classifier',
                routingCardVersion: input.agentRouting.routingCardVersion,
                source: input.agentRouting.source,
                costInMillicentsPerM: input.agentRouting.costInMillicentsPerM,
                costOutMillicentsPerM: input.agentRouting.costOutMillicentsPerM,
              },
              startedAt: clock.now.toISOString(),
              settleAfter: new Date(clock.now.getTime() + input.reconcileAfterMs).toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      });
      return { startedAt: clock.now.toISOString(), replayed: false };
    });
  }

  async recordCanonicalPlatformAiUsage(input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    requestId: string;
    executionToken: string;
    projectId: string;
    call: CanonicalAiUsageBatchInput['calls'][number];
    outcome: 'hard' | 'easy';
    agentRouting: CanonicalAiClassifierRoutingSelection & { escalated: boolean };
  }) {
    if (
      input.call.billedToUser !== false ||
      (input.outcome !== 'hard' && input.outcome !== 'easy') ||
      input.call.projectId !== input.projectId ||
      !input.call.callId ||
      !input.call.provider ||
      !input.call.model ||
      !Number.isSafeInteger(input.call.inputTokens) ||
      input.call.inputTokens < 0 ||
      !Number.isSafeInteger(input.call.outputTokens) ||
      input.call.outputTokens < 0 ||
      !Number.isSafeInteger(input.call.costCents) ||
      input.call.costCents < 0 ||
      input.call.costCents > 2_147_483 ||
      !canonicalAiClassifierRoutingSelection(input.agentRouting) ||
      input.agentRouting.escalated !== (input.outcome === 'hard')
    ) {
      throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_INVALID' });
    }
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          version: CANONICAL_AI_USAGE_VERSION,
          reservationId: input.reservationId,
          organizationId: input.organizationId,
          userId: input.userId,
          requestId: input.requestId,
          executionToken: input.executionToken,
          projectId: input.projectId,
          call: input.call,
          outcome: input.outcome,
        }),
      )
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [input.userId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${input.reservationId} FOR UPDATE`;
      const reservation = await tx.ledgerReservation.findUnique({ where: { id: input.reservationId } });
      if (
        !reservation ||
        reservation.organizationId !== input.organizationId ||
        reservation.userId !== input.userId ||
        reservation.operation !== 'ai.chat'
      ) {
        throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_SCOPE_MISMATCH' });
      }
      const metadata = recordObject(reservation.metadata) ?? {};
      const execution = recordObject(metadata.canonicalAiExecution);
      if (
        !execution ||
        execution.requestId !== input.requestId ||
        execution.projectId !== input.projectId ||
        execution.executionToken !== input.executionToken
      ) {
        throw Object.assign(new Error(), { code: 'LEDGER_AI_EXECUTION_CLAIM_REQUIRED' });
      }
      const intent = recordObject(metadata.canonicalAiPlatformIntent);
      const intentRouting = canonicalAiClassifierRouting(intent?.agentRouting);
      if (
        !intent ||
        intent.requestId !== input.requestId ||
        intent.projectId !== input.projectId ||
        intent.callId !== input.call.callId ||
        intent.provider !== input.call.provider ||
        intent.model !== input.call.model ||
        intent.executionToken !== input.executionToken ||
        !intentRouting ||
        intentRouting.mode !== input.agentRouting.mode ||
        intentRouting.highEffort !== input.agentRouting.highEffort ||
        intentRouting.turbo !== input.agentRouting.turbo ||
        intentRouting.routingCardVersion !== input.agentRouting.routingCardVersion ||
        intentRouting.source !== input.agentRouting.source ||
        typeof intent.maxInputTokens !== 'number' ||
        !Number.isSafeInteger(intent.maxInputTokens) ||
        input.call.inputTokens > Number(intent.maxInputTokens) ||
        typeof intent.maxOutputTokens !== 'number' ||
        !Number.isSafeInteger(intent.maxOutputTokens) ||
        input.call.outputTokens > Number(intent.maxOutputTokens) ||
        typeof intent.maxCostCents !== 'number' ||
        !Number.isSafeInteger(intent.maxCostCents) ||
        input.call.costCents > Number(intent.maxCostCents)
      ) {
        throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_START_REQUIRED' });
      }
      const existing = recordObject(metadata.canonicalAiPlatformUsage);
      if (existing) {
        if (existing.recoveredAtCeiling !== true && existing.requestHash !== requestHash) {
          throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_CONFLICT', statusCode: 409 });
        }
        const validation = await validateCanonicalPlatformReceipt(tx, {
          reservationId: reservation.id,
          organizationId: reservation.organizationId,
          userId: input.userId,
          execution,
          intent,
          receipt: existing,
        });
        if (!validation.valid || typeof existing.costLedgerId !== 'string') {
          throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_CORRUPT' });
        }
        const usage = await tx.aiCostLedger.findUnique({ where: { id: existing.costLedgerId } });
        if (!usage || usage.organizationId !== input.organizationId || usage.projectId !== input.projectId) {
          throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_CORRUPT' });
        }
        return { usage: mapAiCostLedger(usage), replayed: true };
      }
      if (reservation.status !== 'ACTIVE') {
        throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_NOT_ACTIVE' });
      }
      const usage = await tx.aiCostLedger.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          conversationId: input.call.conversationId,
          messageId: input.call.messageId,
          provider: input.call.provider,
          model: input.call.model,
          inputTokens: input.call.inputTokens,
          outputTokens: input.call.outputTokens,
          costCents: input.call.costCents,
          reason: `${input.call.reason}.platform.${input.call.kind}.${input.call.callId}`.slice(0, 240),
        },
      });
      const intentRequestHash = String(intent.requestHash);
      const agentCallLogId = `canonical-classifier-${intentRequestHash}`;
      const agentCostMillicents = canonicalAiClassifierCostMillicents(
        intentRouting,
        input.call.inputTokens,
        input.call.outputTokens,
      );
      if (agentCostMillicents === undefined) {
        throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_INVALID' });
      }
      await tx.agentCallLog.create({
        data: {
          id: agentCallLogId,
          userId: input.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          mode: intentRouting.mode,
          highEffort: intentRouting.highEffort,
          escalated: input.outcome === 'hard',
          turbo: intentRouting.turbo,
          lineKey: 'classifier',
          provider: input.call.provider,
          model: input.call.model,
          tokensIn: input.call.inputTokens,
          tokensOut: input.call.outputTokens,
          costMillicents: agentCostMillicents,
          creditCents: 0,
          marginMillicents: -agentCostMillicents,
          billedToUser: false,
          routingCardVersion: intentRouting.routingCardVersion,
          source: intentRouting.source,
        },
      });
      const platformReceipt = {
        version: CANONICAL_AI_USAGE_VERSION,
        requestHash,
        requestId: input.requestId,
        executionToken: input.executionToken,
        projectId: input.projectId,
        callId: input.call.callId,
        intentRequestHash,
        provider: input.call.provider,
        model: input.call.model,
        inputTokens: input.call.inputTokens,
        outputTokens: input.call.outputTokens,
        costLedgerId: usage.id,
        agentCallLogId,
        agentCostMillicents,
        costCents: input.call.costCents,
        outcome: input.outcome,
        recoveredAtCeiling: false,
        identityHash: canonicalAiPlatformReceiptIdentityHash({
          reservationId: reservation.id,
          organizationId: reservation.organizationId,
          userId: input.userId,
          requestId: input.requestId,
          executionToken: input.executionToken,
          projectId: input.projectId,
          callId: input.call.callId,
          intentRequestHash,
          requestHash,
          provider: input.call.provider,
          model: input.call.model,
          inputTokens: input.call.inputTokens,
          outputTokens: input.call.outputTokens,
          costLedgerId: usage.id,
          agentCallLogId,
          agentCostMillicents,
          costCents: input.call.costCents,
          outcome: input.outcome,
          recoveredAtCeiling: false,
        }),
      };
      const platformContentFingerprint = await databaseJsonFingerprint(tx, platformReceipt);
      await tx.ledgerReservation.update({
        where: { id: reservation.id },
        data: {
          metadata: {
            ...metadata,
            canonicalAiPlatformUsage: platformReceipt,
            canonicalAiReceiptIndex: {
              ...(recordObject(metadata.canonicalAiReceiptIndex) ?? {}),
              version: CANONICAL_AI_USAGE_VERSION,
              platform: canonicalAiPlatformReceiptIndex(platformReceipt, platformContentFingerprint),
            },
          } as Prisma.InputJsonValue,
        },
      });
      return { usage: mapAiCostLedger(usage), replayed: false };
    });
  }

  async commitCanonicalUserSpendBatch(input: CanonicalAiUsageBatchInput) {
    if (
      !input.requestId ||
      !input.executionToken ||
      !input.projectId ||
      input.calls.length < 1 ||
      input.calls.length > 32 ||
      new Set(input.calls.map((call) => call.callId)).size !== input.calls.length ||
      input.calls.some(
        (call) =>
          call.projectId !== input.projectId ||
          !call.callId ||
          !call.provider ||
          !call.model ||
          !call.reason ||
          !Number.isSafeInteger(call.inputTokens) ||
          call.inputTokens < 0 ||
          !Number.isSafeInteger(call.outputTokens) ||
          call.outputTokens < 0 ||
          !Number.isSafeInteger(call.costCents) ||
          call.costCents < 0,
      )
    ) {
      throw Object.assign(new Error(), { code: 'LEDGER_COMMIT_AMOUNT_INVALID' });
    }
    const totalCents = input.calls.reduce((sum, call) => sum + (call.billedToUser === false ? 0 : call.costCents), 0);
    if (!Number.isSafeInteger(totalCents)) {
      throw Object.assign(new Error(), { code: 'LEDGER_COMMIT_AMOUNT_INVALID' });
    }
    const requestHash = canonicalAiBatchHash(input);

    const usages = await this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [input.userId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${input.reservationId} FOR UPDATE`;
      const reservation = await tx.ledgerReservation.findUnique({ where: { id: input.reservationId } });
      if (
        !reservation ||
        reservation.organizationId !== input.organizationId ||
        reservation.userId !== input.userId ||
        reservation.operation !== 'ai.chat'
      ) {
        throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_SCOPE_MISMATCH' });
      }
      const metadata = recordObject(reservation.metadata) ?? {};
      const execution = recordObject(metadata.canonicalAiExecution);
      if (
        !execution ||
        execution.version !== CANONICAL_AI_USAGE_VERSION ||
        execution.requestId !== input.requestId ||
        execution.projectId !== input.projectId ||
        execution.executionToken !== input.executionToken ||
        (execution.state !== 'started' && execution.state !== 'received') ||
        typeof execution.startedAt !== 'string'
      ) {
        throw Object.assign(new Error(), { code: 'LEDGER_AI_START_REQUIRED' });
      }
      const receipt = recordObject(metadata.canonicalAiUsageBatch);
      if (receipt) {
        if (receipt.version !== CANONICAL_AI_USAGE_VERSION || receipt.requestHash !== requestHash) {
          throw Object.assign(new Error(), { code: 'LEDGER_COMMIT_CONFLICT', statusCode: 409 });
        }
        const validation = await validateCanonicalBatchReceipt(tx, {
          reservationId: reservation.id,
          organizationId: reservation.organizationId,
          userId: input.userId,
          executionToken: input.executionToken,
          requestId: input.requestId,
          projectId: input.projectId,
          receipt,
        });
        if (!validation.valid) {
          throw Object.assign(new Error(), { code: 'LEDGER_USAGE_RECEIPT_CORRUPT' });
        }
        const ids = Array.isArray(receipt.costLedgerIds)
          ? receipt.costLedgerIds.filter((id): id is string => typeof id === 'string')
          : [];
        const byId = new Map(validation.costs.map((row) => [row.id, row]));
        const ordered = ids.map((id) => byId.get(id));
        return ordered.map((row) => mapAiCostLedger(row!));
      }

      const recorded: Awaited<ReturnType<typeof tx.aiCostLedger.create>>[] = [];
      for (const call of input.calls) {
        recorded.push(
          await tx.aiCostLedger.create({
            data: {
              organizationId: input.organizationId,
              projectId: call.projectId,
              conversationId: call.conversationId,
              messageId: call.messageId,
              provider: call.provider,
              model: call.model,
              inputTokens: call.inputTokens,
              outputTokens: call.outputTokens,
              costCents: call.costCents,
              reason: `${call.reason}.${call.kind}.${call.callId}`.slice(0, 240),
            },
          }),
        );
      }
      const usageEvents = await Promise.all([
        tx.usageEvent.create({
          data: {
            organizationId: input.organizationId,
            userId: input.userId,
            type: 'ai.messages',
            quantity: 1,
            metadata: { canonicalReservationId: input.reservationId, requestHash },
          },
        }),
        tx.usageEvent.create({
          data: {
            organizationId: input.organizationId,
            userId: input.userId,
            type: 'ai.inputTokens',
            quantity: input.calls.reduce((sum, call) => sum + (call.billedToUser === false ? 0 : call.inputTokens), 0),
            metadata: { canonicalReservationId: input.reservationId, requestHash },
          },
        }),
        tx.usageEvent.create({
          data: {
            organizationId: input.organizationId,
            userId: input.userId,
            type: 'ai.outputTokens',
            quantity: input.calls.reduce((sum, call) => sum + (call.billedToUser === false ? 0 : call.outputTokens), 0),
            metadata: { canonicalReservationId: input.reservationId, requestHash },
          },
        }),
      ]);
      const receiptCalls = input.calls.map((call, index) => ({
        callId: call.callId,
        kind: call.kind,
        billedToUser: call.billedToUser !== false,
        projectId: call.projectId,
        ...(call.conversationId ? { conversationId: call.conversationId } : {}),
        ...(call.messageId ? { messageId: call.messageId } : {}),
        provider: call.provider,
        model: call.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        costCents: call.costCents,
        reason: call.reason,
        costLedgerId: recorded[index]!.id,
      }));
      const costLedgerIds = recorded.map((row) => row.id);
      const usageEventIds = usageEvents.map((row) => row.id);
      const receiptBase = {
        version: CANONICAL_AI_USAGE_VERSION,
        reservationId: reservation.id,
        organizationId: reservation.organizationId,
        userId: input.userId,
        requestHash,
        requestId: input.requestId,
        executionToken: input.executionToken,
        projectId: input.projectId,
        totalCents,
        costLedgerIds,
        usageEventIds,
        calls: receiptCalls,
      };
      const batchReceipt = {
        ...receiptBase,
        receiptHash: canonicalAiBatchReceiptIdentityHash(receiptBase),
      };
      const batchContentFingerprint = await databaseJsonFingerprint(tx, batchReceipt);
      await tx.ledgerReservation.update({
        where: { id: reservation.id },
        data: {
          metadata: {
            ...metadata,
            canonicalAiExecution: { ...execution, state: 'received' },
            canonicalAiUsageBatch: batchReceipt,
            canonicalAiReceiptIndex: {
              ...(recordObject(metadata.canonicalAiReceiptIndex) ?? {}),
              version: CANONICAL_AI_USAGE_VERSION,
              batch: canonicalAiBatchReceiptIndex(batchReceipt, batchContentFingerprint),
            },
          } as Prisma.InputJsonValue,
        },
      });
      return recorded.map(mapAiCostLedger);
    });

    const ledger = new LedgerStore(this.prisma);
    const result = await this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [input.userId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      return ledger.commitReservationInTransaction(tx, {
        reservationId: input.reservationId,
        actualAmountMinor: BigInt(totalCents),
        refuseOverage: true,
      });
    });
    return { committedCents: Number(result.committedMinor), replayed: result.replayed, usages };
  }

  async reconcileCanonicalUserSpend(options: { take?: number } = {}) {
    const take = Math.max(1, Math.min(options.take ?? 100, 500));
    const candidates = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH candidate_state AS (
        SELECT r.*,
          COALESCE(
            jsonb_typeof(r."metadata"->'canonicalAiPlatformUsage') = 'object'
            AND r."metadata"->'canonicalAiPlatformUsage'->>'version' = ${String(CANONICAL_AI_USAGE_VERSION)}
            AND r."metadata"->'canonicalAiPlatformUsage'->>'requestId' =
              r."metadata"->'canonicalAiExecution'->>'requestId'
            AND r."metadata"->'canonicalAiPlatformUsage'->>'executionToken' =
              r."metadata"->'canonicalAiPlatformIntent'->>'executionToken'
            AND r."metadata"->'canonicalAiPlatformUsage'->>'projectId' =
              r."metadata"->'canonicalAiExecution'->>'projectId'
            AND r."metadata"->'canonicalAiPlatformUsage'->>'callId' =
              r."metadata"->'canonicalAiPlatformIntent'->>'callId'
            AND r."metadata"->'canonicalAiPlatformUsage'->>'intentRequestHash' =
              r."metadata"->'canonicalAiPlatformIntent'->>'requestHash'
            AND r."metadata"->'canonicalAiPlatformUsage'->>'provider' =
              r."metadata"->'canonicalAiPlatformIntent'->>'provider'
            AND r."metadata"->'canonicalAiPlatformUsage'->>'model' =
              r."metadata"->'canonicalAiPlatformIntent'->>'model'
            AND (r."metadata"->'canonicalAiPlatformUsage'->>'requestHash') ~ '^[a-f0-9]{64}$'
            AND (r."metadata"->'canonicalAiPlatformUsage'->>'identityHash') ~ '^[a-f0-9]{64}$'
            AND jsonb_typeof(r."metadata"->'canonicalAiReceiptIndex'->'platform') = 'object'
            AND r."metadata"->'canonicalAiReceiptIndex'->>'version' = ${String(CANONICAL_AI_USAGE_VERSION)}
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->>'kind' = 'platform'
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->>'identityHash' =
              r."metadata"->'canonicalAiPlatformUsage'->>'identityHash'
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->>'requestHash' =
              r."metadata"->'canonicalAiPlatformUsage'->>'requestHash'
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->>'costLedgerId' =
              r."metadata"->'canonicalAiPlatformUsage'->>'costLedgerId'
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->>'agentCallLogId' =
              r."metadata"->'canonicalAiPlatformUsage'->>'agentCallLogId'
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->>'executionToken' =
              r."metadata"->'canonicalAiPlatformUsage'->>'executionToken'
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->>'intentRequestHash' =
              r."metadata"->'canonicalAiPlatformUsage'->>'intentRequestHash'
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->'inputTokens' =
              r."metadata"->'canonicalAiPlatformUsage'->'inputTokens'
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->'outputTokens' =
              r."metadata"->'canonicalAiPlatformUsage'->'outputTokens'
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->'costCents' =
              r."metadata"->'canonicalAiPlatformUsage'->'costCents'
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->'agentCostMillicents' =
              r."metadata"->'canonicalAiPlatformUsage'->'agentCostMillicents'
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->'recoveredAtCeiling' =
              r."metadata"->'canonicalAiPlatformUsage'->'recoveredAtCeiling'
            AND COALESCE(r."metadata"->'canonicalAiReceiptIndex'->'platform'->'outcome', 'null'::jsonb) =
              COALESCE(r."metadata"->'canonicalAiPlatformUsage'->'outcome', 'null'::jsonb)
            AND r."metadata"->'canonicalAiReceiptIndex'->'platform'->>'contentFingerprint' =
              md5((r."metadata"->'canonicalAiPlatformUsage')::text)
            AND jsonb_typeof(r."metadata"->'canonicalAiPlatformUsage'->'inputTokens') = 'number'
            AND jsonb_typeof(r."metadata"->'canonicalAiPlatformUsage'->'outputTokens') = 'number'
            AND jsonb_typeof(r."metadata"->'canonicalAiPlatformUsage'->'costCents') = 'number'
            AND jsonb_typeof(r."metadata"->'canonicalAiPlatformUsage'->'agentCostMillicents') = 'number'
            AND COALESCE(r."metadata"->'canonicalAiPlatformUsage'->>'costLedgerId', '') <> ''
            AND COALESCE(r."metadata"->'canonicalAiPlatformUsage'->>'agentCallLogId', '') <> ''
            AND (
              (
                r."metadata"->'canonicalAiPlatformUsage'->>'recoveredAtCeiling' = 'true'
                AND NOT (r."metadata"->'canonicalAiPlatformUsage' ? 'outcome')
              )
              OR (
                r."metadata"->'canonicalAiPlatformUsage'->>'recoveredAtCeiling' = 'false'
                AND r."metadata"->'canonicalAiPlatformUsage'->>'outcome' IN ('hard', 'easy')
              )
            )
            AND EXISTS (
              SELECT 1
              FROM "AiCostLedger" c
              WHERE c."id" = r."metadata"->'canonicalAiPlatformUsage'->>'costLedgerId'
                AND c."organizationId" = r."organizationId"
                AND c."projectId" = r."metadata"->'canonicalAiExecution'->>'projectId'
                AND c."provider" = r."metadata"->'canonicalAiPlatformUsage'->>'provider'
                AND c."model" = r."metadata"->'canonicalAiPlatformUsage'->>'model'
                AND c."conversationId" IS NULL
                AND c."messageId" IS NULL
                AND to_jsonb(c."inputTokens") = r."metadata"->'canonicalAiPlatformUsage'->'inputTokens'
                AND to_jsonb(c."outputTokens") = r."metadata"->'canonicalAiPlatformUsage'->'outputTokens'
                AND to_jsonb(c."costCents") = r."metadata"->'canonicalAiPlatformUsage'->'costCents'
                AND c."reason" = CASE
                  WHEN r."metadata"->'canonicalAiPlatformUsage'->>'recoveredAtCeiling' = 'true'
                    THEN left(
                      'chat.completion.operator.classifier.' ||
                        (r."metadata"->'canonicalAiPlatformUsage'->>'callId') || '.crash-recovery-max',
                      240
                    )
                  ELSE left(
                    'chat.completion.operator.platform.classifier.' ||
                      (r."metadata"->'canonicalAiPlatformUsage'->>'callId'),
                    240
                  )
                END
            )
            AND EXISTS (
              SELECT 1
              FROM "AgentCallLog" a
              WHERE a."id" = r."metadata"->'canonicalAiPlatformUsage'->>'agentCallLogId'
                AND a."userId" = r."userId"
                AND a."organizationId" = r."organizationId"
                AND a."projectId" = r."metadata"->'canonicalAiExecution'->>'projectId'
                AND a."mode" = r."metadata"->'canonicalAiPlatformIntent'->'agentRouting'->>'mode'
                AND to_jsonb(a."highEffort") =
                  r."metadata"->'canonicalAiPlatformIntent'->'agentRouting'->'highEffort'
                AND to_jsonb(a."turbo") =
                  r."metadata"->'canonicalAiPlatformIntent'->'agentRouting'->'turbo'
                AND a."lineKey" = 'classifier'
                AND a."provider" = r."metadata"->'canonicalAiPlatformUsage'->>'provider'
                AND a."model" = r."metadata"->'canonicalAiPlatformUsage'->>'model'
                AND to_jsonb(a."tokensIn") = r."metadata"->'canonicalAiPlatformUsage'->'inputTokens'
                AND to_jsonb(a."tokensOut") = r."metadata"->'canonicalAiPlatformUsage'->'outputTokens'
                AND a."costMillicents"::numeric =
                  (r."metadata"->'canonicalAiPlatformUsage'->>'agentCostMillicents')::numeric
                AND a."creditCents" = 0
                AND a."marginMillicents"::numeric =
                  -((r."metadata"->'canonicalAiPlatformUsage'->>'agentCostMillicents')::numeric)
                AND a."billedToUser" = false
                AND to_jsonb(a."routingCardVersion") =
                  r."metadata"->'canonicalAiPlatformIntent'->'agentRouting'->'routingCardVersion'
                AND a."source" = CASE
                  WHEN r."metadata"->'canonicalAiPlatformUsage'->>'recoveredAtCeiling' = 'true'
                    THEN (r."metadata"->'canonicalAiPlatformIntent'->'agentRouting'->>'source') ||
                      '.crash-recovery-max'
                  ELSE r."metadata"->'canonicalAiPlatformIntent'->'agentRouting'->>'source'
                END
                AND a."escalated" = CASE
                  WHEN r."metadata"->'canonicalAiPlatformUsage'->>'recoveredAtCeiling' = 'true' THEN true
                  ELSE r."metadata"->'canonicalAiPlatformUsage'->>'outcome' = 'hard'
                END
            ),
            false
          ) AS platform_receipt_structurally_valid,
          COALESCE(
            jsonb_typeof(r."metadata"->'canonicalAiUsageBatch') = 'object'
            AND r."metadata"->'canonicalAiUsageBatch'->>'version' = ${String(CANONICAL_AI_USAGE_VERSION)}
            AND r."metadata"->'canonicalAiUsageBatch'->>'reservationId' = r."id"
            AND r."metadata"->'canonicalAiUsageBatch'->>'organizationId' = r."organizationId"
            AND r."metadata"->'canonicalAiUsageBatch'->>'userId' = r."userId"
            AND r."metadata"->'canonicalAiUsageBatch'->>'requestId' =
              r."metadata"->'canonicalAiExecution'->>'requestId'
            AND r."metadata"->'canonicalAiUsageBatch'->>'executionToken' =
              r."metadata"->'canonicalAiExecution'->>'executionToken'
            AND r."metadata"->'canonicalAiUsageBatch'->>'projectId' =
              r."metadata"->'canonicalAiExecution'->>'projectId'
            AND (r."metadata"->'canonicalAiUsageBatch'->>'requestHash') ~ '^[a-f0-9]{64}$'
            AND (r."metadata"->'canonicalAiUsageBatch'->>'receiptHash') ~ '^[a-f0-9]{64}$'
            AND jsonb_typeof(r."metadata"->'canonicalAiReceiptIndex'->'batch') = 'object'
            AND r."metadata"->'canonicalAiReceiptIndex'->>'version' = ${String(CANONICAL_AI_USAGE_VERSION)}
            AND r."metadata"->'canonicalAiReceiptIndex'->'batch'->>'kind' = 'batch'
            AND r."metadata"->'canonicalAiReceiptIndex'->'batch'->>'receiptHash' =
              r."metadata"->'canonicalAiUsageBatch'->>'receiptHash'
            AND r."metadata"->'canonicalAiReceiptIndex'->'batch'->'costLedgerIds' =
              r."metadata"->'canonicalAiUsageBatch'->'costLedgerIds'
            AND r."metadata"->'canonicalAiReceiptIndex'->'batch'->'usageEventIds' =
              r."metadata"->'canonicalAiUsageBatch'->'usageEventIds'
            AND r."metadata"->'canonicalAiReceiptIndex'->'batch'->>'requestHash' =
              r."metadata"->'canonicalAiUsageBatch'->>'requestHash'
            AND r."metadata"->'canonicalAiReceiptIndex'->'batch'->'totalCents' =
              r."metadata"->'canonicalAiUsageBatch'->'totalCents'
            AND r."metadata"->'canonicalAiReceiptIndex'->'batch'->'calls' =
              r."metadata"->'canonicalAiUsageBatch'->'calls'
            AND r."metadata"->'canonicalAiReceiptIndex'->'batch'->>'contentFingerprint' =
              md5((r."metadata"->'canonicalAiUsageBatch')::text)
            AND jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'totalCents') = 'number'
            AND jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'costLedgerIds') = 'array'
            AND jsonb_array_length(
              CASE
                WHEN jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'costLedgerIds') = 'array'
                THEN r."metadata"->'canonicalAiUsageBatch'->'costLedgerIds'
                ELSE '[]'::jsonb
              END
            ) > 0
            AND jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'usageEventIds') = 'array'
            AND jsonb_array_length(
              CASE
                WHEN jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'usageEventIds') = 'array'
                THEN r."metadata"->'canonicalAiUsageBatch'->'usageEventIds'
                ELSE '[]'::jsonb
              END
            ) = 3
            AND jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'calls') = 'array'
            AND jsonb_array_length(
              CASE
                WHEN jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'calls') = 'array'
                THEN r."metadata"->'canonicalAiUsageBatch'->'calls'
                ELSE '[]'::jsonb
              END
            ) = jsonb_array_length(
              CASE
                WHEN jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'costLedgerIds') = 'array'
                THEN r."metadata"->'canonicalAiUsageBatch'->'costLedgerIds'
                ELSE '[]'::jsonb
              END
            )
            AND (
              SELECT count(DISTINCT value)
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'costLedgerIds') = 'array'
                  THEN r."metadata"->'canonicalAiUsageBatch'->'costLedgerIds'
                  ELSE '[]'::jsonb
                END
              ) AS cost_id(value)
            ) = jsonb_array_length(r."metadata"->'canonicalAiUsageBatch'->'costLedgerIds')
            AND (
              SELECT count(DISTINCT value)
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'usageEventIds') = 'array'
                  THEN r."metadata"->'canonicalAiUsageBatch'->'usageEventIds'
                  ELSE '[]'::jsonb
                END
              ) AS event_id(value)
            ) = 3
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'calls') = 'array'
                  THEN r."metadata"->'canonicalAiUsageBatch'->'calls'
                  ELSE '[]'::jsonb
                END
              ) AS receipt_call(call)
              WHERE jsonb_typeof(call) <> 'object'
                OR jsonb_typeof(call->'billedToUser') <> 'boolean'
                OR jsonb_typeof(call->'inputTokens') <> 'number'
                OR jsonb_typeof(call->'outputTokens') <> 'number'
                OR jsonb_typeof(call->'costCents') <> 'number'
                OR COALESCE(call->>'callId', '') = ''
                OR COALESCE(call->>'kind', '') NOT IN
                  ('planner', 'agent-lane', 'summary', 'context', 'main', 'classifier', 'crash-recovery')
                OR call->>'projectId' <> r."metadata"->'canonicalAiExecution'->>'projectId'
                OR COALESCE(call->>'provider', '') = ''
                OR COALESCE(call->>'model', '') = ''
                OR COALESCE(call->>'reason', '') = ''
                OR COALESCE(call->>'costLedgerId', '') = ''
                OR NOT EXISTS (
                  SELECT 1
                  FROM "AiCostLedger" c
                  WHERE c."id" = call->>'costLedgerId'
                    AND c."organizationId" = r."organizationId"
                    AND c."projectId" = call->>'projectId'
                    AND COALESCE(to_jsonb(c."conversationId"), 'null'::jsonb) =
                      COALESCE(call->'conversationId', 'null'::jsonb)
                    AND COALESCE(to_jsonb(c."messageId"), 'null'::jsonb) =
                      COALESCE(call->'messageId', 'null'::jsonb)
                    AND c."provider" = call->>'provider'
                    AND c."model" = call->>'model'
                    AND to_jsonb(c."inputTokens") = call->'inputTokens'
                    AND to_jsonb(c."outputTokens") = call->'outputTokens'
                    AND to_jsonb(c."costCents") = call->'costCents'
                    AND c."reason" = left(
                      (call->>'reason') || '.' || (call->>'kind') || '.' || (call->>'callId'),
                      240
                    )
                )
            )
            AND (
              SELECT count(*)
              FROM "AiCostLedger" c
              WHERE c."id" IN (
                SELECT value
                FROM jsonb_array_elements_text(
                  r."metadata"->'canonicalAiUsageBatch'->'costLedgerIds'
                ) AS cost_id(value)
              )
            ) = jsonb_array_length(r."metadata"->'canonicalAiUsageBatch'->'costLedgerIds')
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(r."metadata"->'canonicalAiUsageBatch'->'usageEventIds') = 'array'
                  THEN r."metadata"->'canonicalAiUsageBatch'->'usageEventIds'
                  ELSE '[]'::jsonb
                END
              ) AS receipt_event(event_id)
              WHERE NOT EXISTS (
                SELECT 1
                FROM "UsageEvent" u
                WHERE u."id" = receipt_event.event_id
                  AND u."organizationId" = r."organizationId"
                  AND u."userId" = r."userId"
                  AND u."type" IN ('ai.messages', 'ai.inputTokens', 'ai.outputTokens')
                  AND u."quantity"::numeric = CASE u."type"
                    WHEN 'ai.messages' THEN 1::numeric
                    WHEN 'ai.inputTokens' THEN COALESCE((
                      SELECT sum(
                        CASE
                          WHEN call->>'billedToUser' = 'true'
                            AND jsonb_typeof(call->'inputTokens') = 'number'
                            AND (call->>'inputTokens') ~ '^[0-9]+$'
                          THEN (call->>'inputTokens')::numeric
                          ELSE 0::numeric
                        END
                      )
                      FROM jsonb_array_elements(r."metadata"->'canonicalAiUsageBatch'->'calls') AS c(call)
                    ), 0::numeric)
                    WHEN 'ai.outputTokens' THEN COALESCE((
                      SELECT sum(
                        CASE
                          WHEN call->>'billedToUser' = 'true'
                            AND jsonb_typeof(call->'outputTokens') = 'number'
                            AND (call->>'outputTokens') ~ '^[0-9]+$'
                          THEN (call->>'outputTokens')::numeric
                          ELSE 0::numeric
                        END
                      )
                      FROM jsonb_array_elements(r."metadata"->'canonicalAiUsageBatch'->'calls') AS c(call)
                    ), 0::numeric)
                  END
                  AND u."metadata"->>'canonicalReservationId' = r."id"
                  AND u."metadata"->>'requestHash' =
                    r."metadata"->'canonicalAiUsageBatch'->>'requestHash'
              )
            )
            AND (
              SELECT count(DISTINCT u."type")
              FROM "UsageEvent" u
              WHERE u."id" IN (
                SELECT value
                FROM jsonb_array_elements_text(
                  r."metadata"->'canonicalAiUsageBatch'->'usageEventIds'
                ) AS event_id(value)
              )
            ) = 3,
            false
          ) AS batch_receipt_structurally_valid
        FROM "LedgerReservation" r
        WHERE r."operation" = 'ai.chat'
      )
      SELECT "id"
      FROM candidate_state
      WHERE NOT COALESCE(jsonb_typeof("metadata"->'canonicalAiManualRecovery') = 'object', false)
        AND CASE
          WHEN COALESCE(jsonb_typeof("metadata"->'canonicalAiReconcileFailure'->'nextRetryAt') = 'string', false)
            AND ("metadata"->'canonicalAiReconcileFailure'->>'nextRetryAt') ~
              '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$'
          THEN "metadata"->'canonicalAiReconcileFailure'->>'nextRetryAt' <=
            to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ELSE TRUE
        END
        AND (
          (
            "status" IN ('ACTIVE', 'EXPIRED')
            AND (
              COALESCE(jsonb_typeof("metadata"->'canonicalAiUsageBatch') = 'object', false)
              OR (
                COALESCE(jsonb_typeof("metadata"->'canonicalAiPlatformIntent') = 'object', false)
                AND (
                  (
                    NOT COALESCE(jsonb_typeof("metadata"->'canonicalAiPlatformUsage') = 'object', false)
                    AND CASE
                      WHEN COALESCE(jsonb_typeof("metadata"->'canonicalAiPlatformIntent'->'settleAfter') = 'string', false)
                        AND ("metadata"->'canonicalAiPlatformIntent'->>'settleAfter') ~
                          '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$'
                      THEN "metadata"->'canonicalAiPlatformIntent'->>'settleAfter' <=
                        to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                      ELSE TRUE
                    END
                  )
                  OR NOT platform_receipt_structurally_valid
                )
              )
              OR (
                COALESCE("metadata"->'canonicalAiExecution'->>'state' IN ('started', 'received'), false)
                AND CASE
                  WHEN COALESCE(jsonb_typeof("metadata"->'canonicalAiExecution'->'settleAfter') = 'string', false)
                    AND ("metadata"->'canonicalAiExecution'->>'settleAfter') ~
                      '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$'
                  THEN "metadata"->'canonicalAiExecution'->>'settleAfter' <=
                    to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                  ELSE TRUE
                END
              )
            )
          )
          OR (
            "status" = 'COMMITTED'
            AND (
              (
                COALESCE(jsonb_typeof("metadata"->'canonicalAiPlatformIntent') = 'object', false)
                AND (
                  (
                    NOT COALESCE(jsonb_typeof("metadata"->'canonicalAiPlatformUsage') = 'object', false)
                    AND CASE
                      WHEN COALESCE(jsonb_typeof("metadata"->'canonicalAiPlatformIntent'->'settleAfter') = 'string', false)
                        AND ("metadata"->'canonicalAiPlatformIntent'->>'settleAfter') ~
                          '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$'
                      THEN "metadata"->'canonicalAiPlatformIntent'->>'settleAfter' <=
                        to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                      ELSE TRUE
                    END
                  )
                  OR NOT platform_receipt_structurally_valid
                )
              )
              OR (
                COALESCE(jsonb_typeof("metadata"->'canonicalAiUsageBatch') = 'object', false)
                AND NOT batch_receipt_structurally_valid
              )
            )
          )
        )
      ORDER BY "updatedAt" ASC, "id" ASC
      LIMIT ${take}
    `);
    const databaseNowMs = Date.parse((await this.getDatabaseClock()).now);
    let settled = 0;
    let recoveredAtCeiling = 0;
    let recoveredPlatformAtCeiling = 0;
    let manualRecovery = 0;
    let retryableFailures = 0;
    const reservationIds: string[] = [];

    for (const candidate of candidates) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const scope = await tx.ledgerReservation.findUnique({
            where: { id: candidate.id },
            select: { organizationId: true, userId: true, operation: true, metadata: true },
          });
          if (!scope || scope.operation !== 'ai.chat') {
            return 'skip' as const;
          }
          const scopeExecution = recordObject((recordObject(scope.metadata) ?? {}).canonicalAiExecution);
          const scopeProjectId = typeof scopeExecution?.projectId === 'string' ? scopeExecution.projectId : undefined;
          await assertAccountPurgeMutationAllowed(tx, {
            userIds: [scope.userId ?? undefined],
            organizationIds: [scope.organizationId],
            projectIds: [scopeProjectId],
          });
          const ledger = new LedgerStore(this.prisma);
          await ledger.lockReservationBalanceInTransaction(tx, candidate.id);
          await tx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${candidate.id} FOR UPDATE`;
          const reservation = await tx.ledgerReservation.findUnique({ where: { id: candidate.id } });
          if (!reservation || reservation.operation !== 'ai.chat') {
            return 'skip' as const;
          }
          const metadata = recordObject(reservation.metadata) ?? {};
          const execution = recordObject(metadata.canonicalAiExecution);
          if (
            reservation.organizationId !== scope.organizationId ||
            reservation.userId !== scope.userId ||
            (typeof execution?.projectId === 'string' ? execution.projectId : undefined) !== scopeProjectId
          ) {
            throw Object.assign(new Error(), { code: 'CANONICAL_AI_RECONCILE_SCOPE_CHANGED' });
          }
          const metadataWithoutRetryFailure = () => {
            const clean = { ...metadata };
            delete clean.canonicalAiReconcileFailure;
            return clean;
          };
          const quarantine = async (reason: string) => {
            const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;

            if (!clock) {
              throw Object.assign(new Error(), { code: 'DATABASE_TIME_UNAVAILABLE' });
            }

            await tx.ledgerReservation.update({
              where: { id: reservation.id },
              data: {
                metadata: {
                  ...metadata,
                  canonicalAiManualRecovery: {
                    version: CANONICAL_AI_USAGE_VERSION,
                    reason,
                    quarantinedAt: clock.now.toISOString(),
                  },
                } as Prisma.InputJsonValue,
              },
            });

            return 'manual' as const;
          };
          const retryFailure = recordObject(metadata.canonicalAiReconcileFailure);

          if (retryFailure) {
            const retryAtRaw = typeof retryFailure.nextRetryAt === 'string' ? retryFailure.nextRetryAt : '';
            const retryAtMs = Date.parse(retryAtRaw);

            if (!Number.isFinite(retryAtMs) || new Date(retryAtMs).toISOString() !== retryAtRaw) {
              return quarantine('CANONICAL_AI_RETRY_DEADLINE_CORRUPT');
            }
            if (retryAtMs > databaseNowMs) {
              return 'skip' as const;
            }
          }
          const existingBatch = recordObject(metadata.canonicalAiUsageBatch);
          if (
            !execution ||
            execution.version !== CANONICAL_AI_USAGE_VERSION ||
            execution.requestHash !==
              canonicalAiExecutionHash({
                reservationId: reservation.id,
                organizationId: reservation.organizationId,
                userId: reservation.userId ?? '',
                requestId: typeof execution.requestId === 'string' ? execution.requestId : '',
                projectId: typeof execution.projectId === 'string' ? execution.projectId : '',
              }) ||
            typeof execution.requestId !== 'string' ||
            typeof execution.projectId !== 'string' ||
            typeof execution.executionToken !== 'string' ||
            execution.executionToken.length === 0 ||
            !reservation.userId
          ) {
            return quarantine('CANONICAL_AI_EXECUTION_CORRUPT');
          }
          const platformIntent = recordObject(metadata.canonicalAiPlatformIntent);
          const platformReceipt = recordObject(metadata.canonicalAiPlatformUsage);
          if (platformReceipt) {
            const validation = await validateCanonicalPlatformReceipt(tx, {
              reservationId: reservation.id,
              organizationId: reservation.organizationId,
              userId: reservation.userId,
              execution,
              intent: platformIntent,
              receipt: platformReceipt,
            });
            if (!validation.valid) {
              return quarantine('CANONICAL_AI_PLATFORM_RECEIPT_CORRUPT');
            }
          }
          if (platformIntent && !platformReceipt) {
            const platformSettleAfterRaw =
              typeof platformIntent.settleAfter === 'string' ? platformIntent.settleAfter : '';
            const platformSettleAfterMs = Date.parse(platformSettleAfterRaw);
            if (
              !Number.isFinite(platformSettleAfterMs) ||
              new Date(platformSettleAfterMs).toISOString() !== platformSettleAfterRaw
            ) {
              return quarantine('CANONICAL_AI_PLATFORM_SETTLE_AFTER_CORRUPT');
            }
            if (platformSettleAfterMs > databaseNowMs) {
              return 'skip' as const;
            }
            const callId = typeof platformIntent.callId === 'string' ? platformIntent.callId : undefined;
            const provider = typeof platformIntent.provider === 'string' ? platformIntent.provider : undefined;
            const model = typeof platformIntent.model === 'string' ? platformIntent.model : undefined;
            const maxInputTokens = platformIntent.maxInputTokens;
            const maxOutputTokens = platformIntent.maxOutputTokens;
            const maxCostCents = platformIntent.maxCostCents;
            const agentRouting = canonicalAiClassifierRouting(platformIntent.agentRouting);
            if (
              platformIntent.version !== CANONICAL_AI_USAGE_VERSION ||
              platformIntent.requestId !== execution.requestId ||
              platformIntent.projectId !== execution.projectId ||
              platformIntent.executionToken !== execution.executionToken ||
              !callId ||
              !provider ||
              !model ||
              typeof maxInputTokens !== 'number' ||
              !Number.isSafeInteger(maxInputTokens) ||
              Number(maxInputTokens) < 0 ||
              typeof maxOutputTokens !== 'number' ||
              !Number.isSafeInteger(maxOutputTokens) ||
              Number(maxOutputTokens) < 0 ||
              typeof maxCostCents !== 'number' ||
              !Number.isSafeInteger(maxCostCents) ||
              Number(maxCostCents) < 0 ||
              !agentRouting ||
              platformIntent.requestHash !==
                canonicalAiPlatformIntentHash({
                  reservationId: reservation.id,
                  organizationId: reservation.organizationId,
                  userId: reservation.userId,
                  requestId: execution.requestId,
                  executionToken: execution.executionToken,
                  projectId: execution.projectId,
                  callId,
                  provider,
                  model,
                  maxInputTokens: Number(maxInputTokens),
                  maxOutputTokens: Number(maxOutputTokens),
                  maxCostCents: Number(maxCostCents),
                  agentRouting,
                })
            ) {
              return quarantine('CANONICAL_AI_PLATFORM_INTENT_CORRUPT');
            }
            const cost = await tx.aiCostLedger.create({
              data: {
                organizationId: reservation.organizationId,
                projectId: execution.projectId,
                provider,
                model,
                inputTokens: Number(maxInputTokens),
                outputTokens: Number(maxOutputTokens),
                costCents: Number(maxCostCents),
                reason: `chat.completion.operator.classifier.${callId}.crash-recovery-max`.slice(0, 240),
              },
            });
            const [platformClock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
            if (!platformClock) {
              throw Object.assign(new Error(), { code: 'DATABASE_TIME_UNAVAILABLE' });
            }
            const recoveredRequestHash = String(platformIntent.requestHash);
            const agentCallLogId = `canonical-classifier-${recoveredRequestHash}`;
            const agentCostMillicents = canonicalAiClassifierCostMillicents(
              agentRouting,
              Number(maxInputTokens),
              Number(maxOutputTokens),
            );
            if (agentCostMillicents === undefined) {
              return quarantine('CANONICAL_AI_PLATFORM_ROUTING_COST_CORRUPT');
            }
            await tx.agentCallLog.create({
              data: {
                id: agentCallLogId,
                userId: reservation.userId,
                organizationId: reservation.organizationId,
                projectId: execution.projectId,
                mode: agentRouting.mode,
                highEffort: agentRouting.highEffort,
                escalated: true,
                turbo: agentRouting.turbo,
                lineKey: 'classifier',
                provider,
                model,
                tokensIn: Number(maxInputTokens),
                tokensOut: Number(maxOutputTokens),
                costMillicents: agentCostMillicents,
                creditCents: 0,
                marginMillicents: -agentCostMillicents,
                billedToUser: false,
                routingCardVersion: agentRouting.routingCardVersion,
                source: `${agentRouting.source}.crash-recovery-max`,
              },
            });
            const recoveredPlatformReceipt = {
              version: CANONICAL_AI_USAGE_VERSION,
              requestHash: recoveredRequestHash,
              requestId: execution.requestId,
              executionToken: execution.executionToken,
              projectId: execution.projectId,
              callId,
              intentRequestHash: recoveredRequestHash,
              provider,
              model,
              inputTokens: Number(maxInputTokens),
              outputTokens: Number(maxOutputTokens),
              costLedgerId: cost.id,
              agentCallLogId,
              agentCostMillicents,
              costCents: Number(maxCostCents),
              recoveredAtCeiling: true,
              recoveredAt: platformClock.now.toISOString(),
              identityHash: canonicalAiPlatformReceiptIdentityHash({
                reservationId: reservation.id,
                organizationId: reservation.organizationId,
                userId: reservation.userId,
                requestId: execution.requestId,
                executionToken: execution.executionToken,
                projectId: execution.projectId,
                callId,
                intentRequestHash: recoveredRequestHash,
                requestHash: recoveredRequestHash,
                provider,
                model,
                inputTokens: Number(maxInputTokens),
                outputTokens: Number(maxOutputTokens),
                costLedgerId: cost.id,
                agentCallLogId,
                agentCostMillicents,
                costCents: Number(maxCostCents),
                recoveredAtCeiling: true,
              }),
            };
            const platformContentFingerprint = await databaseJsonFingerprint(tx, recoveredPlatformReceipt);
            await tx.ledgerReservation.update({
              where: { id: reservation.id },
              data: {
                metadata: {
                  ...metadataWithoutRetryFailure(),
                  canonicalAiPlatformUsage: recoveredPlatformReceipt,
                  canonicalAiReceiptIndex: {
                    ...(recordObject(metadata.canonicalAiReceiptIndex) ?? {}),
                    version: CANONICAL_AI_USAGE_VERSION,
                    platform: canonicalAiPlatformReceiptIndex(recoveredPlatformReceipt, platformContentFingerprint),
                  },
                } as Prisma.InputJsonValue,
              },
            });
            return 'platform-recovered' as const;
          }
          if (existingBatch) {
            const validation = await validateCanonicalBatchReceipt(tx, {
              reservationId: reservation.id,
              organizationId: reservation.organizationId,
              userId: reservation.userId,
              executionToken: execution.executionToken,
              requestId: execution.requestId,
              projectId: execution.projectId,
              receipt: existingBatch,
            });
            if (!validation.valid) {
              return quarantine('CANONICAL_AI_USAGE_RECEIPT_CORRUPT');
            }
          }
          if (reservation.status === 'COMMITTED') {
            // Rolling deployments can encounter exact receipts written before
            // the lightweight receipt index existed. Validate the durable
            // receipt and every referenced row first, then backfill the index
            // atomically so healthy old rows cannot occupy every future LIMIT
            // window. Invalid receipts are quarantined above instead.
            const receiptIndex: Record<string, unknown> = {
              ...(recordObject(metadata.canonicalAiReceiptIndex) ?? {}),
              version: CANONICAL_AI_USAGE_VERSION,
            };
            if (platformReceipt) {
              receiptIndex.platform = canonicalAiPlatformReceiptIndex(
                platformReceipt,
                await databaseJsonFingerprint(tx, platformReceipt),
              );
            }
            if (existingBatch) {
              receiptIndex.batch = canonicalAiBatchReceiptIndex(
                existingBatch,
                await databaseJsonFingerprint(tx, existingBatch),
              );
            }
            await tx.ledgerReservation.update({
              where: { id: reservation.id },
              data: {
                metadata: {
                  ...metadataWithoutRetryFailure(),
                  canonicalAiReceiptIndex: receiptIndex,
                } as Prisma.InputJsonValue,
              },
            });
            return 'skip' as const;
          }
          if (execution.state === 'claimed') {
            return 'skip' as const;
          }
          const settleAfterRaw = typeof execution.settleAfter === 'string' ? execution.settleAfter : '';
          const settleAfterMs = Date.parse(settleAfterRaw);
          if (!existingBatch) {
            if (!Number.isFinite(settleAfterMs) || new Date(settleAfterMs).toISOString() !== settleAfterRaw) {
              return quarantine('CANONICAL_AI_SETTLE_AFTER_CORRUPT');
            }
            if (settleAfterMs > databaseNowMs) {
              return 'skip' as const;
            }
          }
          if (reservation.status !== 'ACTIVE' && reservation.status !== 'EXPIRED') {
            return quarantine('CANONICAL_AI_RESERVATION_STATUS_INVALID');
          }

          let totalCents: number;
          let batch = existingBatch;
          let recovered = false;
          if (batch) {
            totalCents = typeof batch.totalCents === 'number' ? batch.totalCents : Number.NaN;
          } else {
            totalCents = Number(reservation.maxAmountMinor);
            if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
              return quarantine('CANONICAL_AI_RESERVATION_AMOUNT_CORRUPT');
            }
            const recoveryCall: CanonicalAiUsageInput = {
              callId: 'crash-recovery',
              kind: 'crash-recovery',
              billedToUser: true,
              projectId: execution.projectId,
              provider: 'unknown',
              model: 'crash-recovery',
              inputTokens: 0,
              outputTokens: 0,
              costCents: totalCents,
              reason: CANONICAL_CHAT_COMPLETION_REASON,
            };
            const requestHash = canonicalAiBatchHash({
              reservationId: reservation.id,
              organizationId: reservation.organizationId,
              userId: reservation.userId,
              requestId: execution.requestId,
              executionToken: execution.executionToken,
              projectId: execution.projectId,
              calls: [recoveryCall],
            });
            const cost = await tx.aiCostLedger.create({
              data: {
                organizationId: reservation.organizationId,
                projectId: execution.projectId,
                provider: 'unknown',
                model: 'crash-recovery',
                inputTokens: 0,
                outputTokens: 0,
                costCents: totalCents,
                reason: `${recoveryCall.reason}.${recoveryCall.kind}.${recoveryCall.callId}`,
              },
            });
            const usageEvents = await Promise.all(
              [
                { type: 'ai.messages', quantity: 1 },
                { type: 'ai.inputTokens', quantity: 0 },
                { type: 'ai.outputTokens', quantity: 0 },
              ].map(({ type, quantity }) =>
                tx.usageEvent.create({
                  data: {
                    organizationId: reservation.organizationId,
                    userId: reservation.userId,
                    type,
                    quantity,
                    metadata: { canonicalReservationId: reservation.id, requestHash, recoveredAtCeiling: true },
                  },
                }),
              ),
            );
            const recoveryReceiptBase = {
              version: CANONICAL_AI_USAGE_VERSION,
              reservationId: reservation.id,
              organizationId: reservation.organizationId,
              userId: reservation.userId,
              requestHash,
              requestId: execution.requestId,
              executionToken: execution.executionToken,
              projectId: execution.projectId,
              totalCents,
              costLedgerIds: [cost.id],
              usageEventIds: usageEvents.map((event) => event.id),
              calls: [
                {
                  ...recoveryCall,
                  costLedgerId: cost.id,
                },
              ],
            };
            batch = {
              ...recoveryReceiptBase,
              recoveredAtCeiling: true,
              receiptHash: canonicalAiBatchReceiptIdentityHash(recoveryReceiptBase),
            };
            recovered = true;
          }

          const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
          if (!clock) {
            throw Object.assign(new Error(), { code: 'DATABASE_TIME_UNAVAILABLE' });
          }
          if (reservation.status === 'EXPIRED' || reservation.expiresAt <= clock.now) {
            await tx.ledgerReservation.update({
              where: { id: reservation.id },
              data: { status: 'ACTIVE', expiresAt: new Date(clock.now.getTime() + 15 * 60_000) },
            });
          }
          await ledger.commitReservationInTransaction(tx, {
            reservationId: reservation.id,
            actualAmountMinor: BigInt(totalCents),
            refuseOverage: true,
          });
          await tx.ledgerReservation.update({
            where: { id: reservation.id },
            data: {
              metadata: {
                ...metadataWithoutRetryFailure(),
                canonicalAiExecution: { ...execution, state: 'settled', settledAt: clock.now.toISOString() },
                canonicalAiUsageBatch: batch,
                ...(batch
                  ? {
                      canonicalAiReceiptIndex: {
                        ...(recordObject(metadata.canonicalAiReceiptIndex) ?? {}),
                        version: CANONICAL_AI_USAGE_VERSION,
                        batch: canonicalAiBatchReceiptIndex(batch, await databaseJsonFingerprint(tx, batch)),
                      },
                    }
                  : {}),
              } as Prisma.InputJsonValue,
            },
          });
          return recovered ? ('recovered' as const) : ('settled' as const);
        });

        if (result === 'settled' || result === 'recovered') {
          settled += 1;
          reservationIds.push(candidate.id);
          if (result === 'recovered') {
            recoveredAtCeiling += 1;
          }
        } else if (result === 'platform-recovered') {
          recoveredPlatformAtCeiling += 1;
          reservationIds.push(candidate.id);
        } else if (result === 'manual') {
          manualRecovery += 1;
        }
      } catch (error) {
        retryableFailures += 1;
        const reason =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code: unknown }).code).slice(0, 120)
            : 'CANONICAL_AI_RECONCILE_EXCEPTION';

        await this.prisma
          .$transaction(async (tx) => {
            const scope = await tx.ledgerReservation.findUnique({
              where: { id: candidate.id },
              select: { organizationId: true, userId: true, operation: true, metadata: true },
            });
            if (!scope || scope.operation !== 'ai.chat') {
              return;
            }
            const scopeExecution = recordObject((recordObject(scope.metadata) ?? {}).canonicalAiExecution);
            await assertAccountPurgeMutationAllowed(tx, {
              userIds: [scope.userId ?? undefined],
              organizationIds: [scope.organizationId],
              projectIds: [typeof scopeExecution?.projectId === 'string' ? scopeExecution.projectId : undefined],
            });
            await tx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${candidate.id} FOR UPDATE`;
            const reservation = await tx.ledgerReservation.findUnique({ where: { id: candidate.id } });

            if (!reservation || reservation.operation !== 'ai.chat') {
              return;
            }

            const metadata = recordObject(reservation.metadata) ?? {};

            if (recordObject(metadata.canonicalAiManualRecovery)) {
              return;
            }

            const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;

            if (!clock) {
              throw Object.assign(new Error(), { code: 'DATABASE_TIME_UNAVAILABLE' });
            }

            const previousFailure = recordObject(metadata.canonicalAiReconcileFailure);
            const attempts =
              typeof previousFailure?.attempts === 'number' &&
              Number.isSafeInteger(previousFailure.attempts) &&
              previousFailure.attempts >= 0
                ? Math.min(previousFailure.attempts + 1, 16)
                : 1;
            const retryDelayMs = Math.min(5 * 60_000, 5_000 * 2 ** Math.min(attempts - 1, 6));
            await tx.ledgerReservation.update({
              where: { id: reservation.id },
              data: {
                metadata: {
                  ...metadata,
                  canonicalAiReconcileFailure: {
                    version: CANONICAL_AI_USAGE_VERSION,
                    attempts,
                    reason,
                    lastAttemptAt: clock.now.toISOString(),
                    nextRetryAt: new Date(clock.now.getTime() + retryDelayMs).toISOString(),
                  },
                } as Prisma.InputJsonValue,
              },
            });
          })
          .catch(() => undefined);
      }
    }

    return {
      scanned: candidates.length,
      settled,
      recoveredAtCeiling,
      recoveredPlatformAtCeiling,
      manualRecovery,
      retryableFailures,
      reservationIds,
    };
  }

  async commitCanonicalUserSpend(input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    actualAmountCents?: number;
    usage: {
      projectId: string;
      conversationId?: string;
      messageId?: string;
      provider: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      costCents: number;
      reason: string;
    };
  }) {
    if (
      (input.actualAmountCents !== undefined &&
        (!Number.isSafeInteger(input.actualAmountCents) || input.actualAmountCents < 0)) ||
      (input.actualAmountCents !== undefined && input.usage.costCents !== input.actualAmountCents) ||
      !Number.isSafeInteger(input.usage.inputTokens) ||
      input.usage.inputTokens < 0 ||
      !Number.isSafeInteger(input.usage.outputTokens) ||
      input.usage.outputTokens < 0 ||
      !input.usage.projectId ||
      !input.usage.provider ||
      !input.usage.model ||
      !input.usage.reason
    ) {
      throw Object.assign(new Error(), { code: 'LEDGER_COMMIT_AMOUNT_INVALID' });
    }

    const usageRequestHash = createHash('sha256')
      .update(
        JSON.stringify({
          reservationId: input.reservationId,
          organizationId: input.organizationId,
          userId: input.userId,
          ...input.usage,
        }),
      )
      .digest('hex');

    /*
     * Persist the provider's ACTUAL usage before attempting settlement. This
     * transaction is idempotent through the reservation row receipt, so a
     * process crash or ledger/purge conflict never loses already-consumed usage
     * and a retry never duplicates AiCostLedger.
     */
    const usage = await this.prisma.$transaction(async (tx) => {
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [input.userId],
        organizationIds: [input.organizationId],
        projectIds: [input.usage.projectId],
      });
      await tx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${input.reservationId} FOR UPDATE`;
      const reservation = await tx.ledgerReservation.findUnique({ where: { id: input.reservationId } });
      if (
        !reservation ||
        reservation.organizationId !== input.organizationId ||
        reservation.userId !== input.userId ||
        reservation.operation !== 'ai.chat'
      ) {
        throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_SCOPE_MISMATCH' });
      }

      const metadata =
        reservation.metadata && typeof reservation.metadata === 'object' && !Array.isArray(reservation.metadata)
          ? (reservation.metadata as Record<string, unknown>)
          : {};
      const receipt =
        metadata.canonicalAiUsage &&
        typeof metadata.canonicalAiUsage === 'object' &&
        !Array.isArray(metadata.canonicalAiUsage)
          ? (metadata.canonicalAiUsage as { requestHash?: unknown; costLedgerId?: unknown })
          : undefined;

      if (receipt) {
        if (receipt.requestHash !== usageRequestHash || typeof receipt.costLedgerId !== 'string') {
          throw Object.assign(new Error(), { code: 'LEDGER_COMMIT_CONFLICT', statusCode: 409 });
        }
        const existing = await tx.aiCostLedger.findUnique({ where: { id: receipt.costLedgerId } });
        if (!existing) {
          throw Object.assign(new Error(), { code: 'LEDGER_USAGE_RECEIPT_CORRUPT' });
        }
        return mapAiCostLedger(existing);
      }

      const recorded = await tx.aiCostLedger.create({
        data: { organizationId: input.organizationId, ...input.usage },
      });
      await tx.ledgerReservation.update({
        where: { id: reservation.id },
        data: {
          metadata: {
            ...metadata,
            canonicalAiUsage: {
              version: 1,
              requestHash: usageRequestHash,
              costLedgerId: recorded.id,
            },
          } as Prisma.InputJsonValue,
        },
      });
      return mapAiCostLedger(recorded);
    });

    const ledger = new LedgerStore(this.prisma);
    if (input.actualAmountCents === undefined) {
      throw Object.assign(new Error(), { code: 'LEDGER_USAGE_UNPRICED' });
    }
    const result = await this.prisma.$transaction(async (tx) => {
      /* Purge scope and settlement share this exact transaction and lock order. */
      await assertAccountPurgeMutationAllowed(tx, {
        userIds: [input.userId],
        organizationIds: [input.organizationId],
        projectIds: [input.usage.projectId],
      });
      const scoped = await tx.ledgerReservation.findFirst({
        where: {
          id: input.reservationId,
          organizationId: input.organizationId,
          userId: input.userId,
          operation: 'ai.chat',
        },
        select: { id: true },
      });
      if (!scoped) {
        throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_SCOPE_MISMATCH' });
      }
      return ledger.commitReservationInTransaction(tx, {
        reservationId: input.reservationId,
        actualAmountMinor: BigInt(input.actualAmountCents ?? input.usage.costCents),
        refuseOverage: true,
      });
    });
    return { committedCents: Number(result.committedMinor), replayed: result.replayed, usage };
  }

  async releaseCanonicalUserSpend(reservationId: string) {
    return new LedgerStore(this.prisma).releaseReservation(reservationId, 'failure');
  }

  async reapExpiredLedgerReservations() {
    return new LedgerStore(this.prisma).reapExpiredReservations();
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
    /*
     * The parent provider must exist; create a disabled shell if the admin is
     * registering a model before configuring its provider.
     */
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

  async findUsageEventByReference(input: { organizationId: string; type: string; reference: string; since: Date }) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT *
        FROM "UsageEvent"
       WHERE "organizationId" = ${input.organizationId}
         AND "type" = ${input.type}
         AND "createdAt" >= ${input.since}
         AND metadata ->> 'reference' = ${input.reference}
       ORDER BY "createdAt" DESC
       LIMIT 1
    `;
    return rows[0] ? mapUsageEvent(rows[0]) : undefined;
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
    key: QuotaOverrideKey;
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

  async getQuotaOverride(organizationId: string, key: QuotaOverrideKey) {
    const [override] = await this.prisma.$queryRaw<
      Array<{
        id: string;
        organizationId: string;
        key: string;
        limit: number;
        reason: string;
        createdByUserId: string | null;
        expiresAt: Date | null;
        createdAt: Date;
      }>
    >`
      SELECT "id", "organizationId", "key", "limit", "reason",
             "createdByUserId", "expiresAt", "createdAt"
      FROM "QuotaOverride"
      WHERE "organizationId" = ${organizationId}
        AND "key" = ${key}
        AND ("expiresAt" IS NULL OR "expiresAt" > clock_timestamp())
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 1
    `;
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

  async updateWorkspaceStatus(input: {
    workspaceId: string;
    expectedProjectId: string;
    expectedOrganizationId: string;
    status: WorkspaceRecord['status'];
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProjectTenantMutation(tx, {
        projectId: input.expectedProjectId,
        expectedOrganizationId: input.expectedOrganizationId,
      });
      const workspace = await tx.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { projectId: true },
      });
      if (!workspace || workspace.projectId !== input.expectedProjectId) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
          code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
          statusCode: 409,
        });
      }
      return mapWorkspace(
        await tx.workspace.update({ where: { id: input.workspaceId }, data: { status: input.status } }),
      );
    });
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

  async listOrganizationSecurityAuditEventsPage(input: {
    organizationId: string;
    limit: number;
    cursor?: { createdAt: string; id: string };
  }): Promise<SecurityAuditEventPage> {
    const limit = Math.max(1, Math.min(input.limit, 100));
    const securityAction = {
      OR: [{ action: { startsWith: 'auth.' } }, { action: { contains: 'security' } }, { action: { contains: 'mfa' } }],
    } satisfies Prisma.AuditLogWhereInput;
    const cursorDate = input.cursor ? new Date(input.cursor.createdAt) : undefined;
    if (cursorDate && Number.isNaN(cursorDate.getTime())) {
      throw Object.assign(new Error(), { code: 'SECURITY_EVENT_CURSOR_INVALID', statusCode: 400 });
    }
    const cursorFilter =
      cursorDate && input.cursor
        ? {
            OR: [{ createdAt: { lt: cursorDate } }, { createdAt: cursorDate, id: { lt: input.cursor.id } }],
          }
        : undefined;
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId: input.organizationId,
        AND: [securityAction, ...(cursorFilter ? [cursorFilter] : [])],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const pageRows = rows.slice(0, limit);
    const resolutions = pageRows.length
      ? await this.prisma.securityEventResolution.findMany({
          where: { auditLogId: { in: pageRows.map((row) => row.id) } },
        })
      : [];
    const resolutionByAuditId = new Map(resolutions.map((row) => [row.auditLogId, row]));
    const [open] = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "AuditLog" AS audit
      WHERE audit."organizationId" = ${input.organizationId}
        AND (
          audit."action" LIKE 'auth.%'
          OR audit."action" LIKE '%security%'
          OR audit."action" LIKE '%mfa%'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "SecurityEventResolution" AS resolution
          WHERE resolution."auditLogId" = audit."id"
            AND resolution."resolved" = true
        )
    `);
    const events = pageRows.map((event) => {
      const resolution = resolutionByAuditId.get(event.id);
      return {
        id: event.id,
        organizationId: event.organizationId ?? undefined,
        actorUserId: event.actorUserId ?? undefined,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? undefined,
        metadata: (event.metadata as Record<string, unknown> | null) ?? undefined,
        ipAddress: event.ipAddress ?? undefined,
        createdAt: toIso(event.createdAt)!,
        resolved: resolution?.resolved ?? false,
        note: resolution?.note ?? undefined,
        resolvedAt: resolution ? toIso(resolution.resolvedAt) : undefined,
      };
    });
    const last = pageRows.at(-1);
    return {
      events,
      openCount: Number(open?.count ?? 0n),
      nextCursor: rows.length > limit && last ? { createdAt: toIso(last.createdAt)!, id: last.id } : undefined,
    };
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

    /*
     * Guard against an unscoped wipe: a selector is mandatory at the route layer,
     * but defend here too so a future caller can never null the whole trail.
     */
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
    lastActiveAt: toIso(session.lastActiveAt),
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
    permanentDeletionStartedAt: toIso(project.permanentDeletionStartedAt),
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
    runtimeKind: deployment.runtimeKind === 'reserved-vm' ? 'reserved-vm' : 'autoscale',
    runtimeVersion: Number(deployment.runtimeVersion ?? 0),
    reservedVmTier: deployment.reservedVmTier ?? undefined,
    reservedVmPriceCents: deployment.reservedVmPriceCents ?? undefined,
    reservedVmTermsVersion: deployment.reservedVmTermsVersion ?? undefined,
    reservedVmRateCardVersion: deployment.reservedVmRateCardVersion ?? undefined,
    reservedVmBillingReservationId: deployment.reservedVmBillingReservationId ?? undefined,
    reservedVmBillingState: deployment.reservedVmBillingState ?? undefined,
    reservedVmCurrentPeriodStart: toIso(deployment.reservedVmCurrentPeriodStart),
    reservedVmNextChargeAt: toIso(deployment.reservedVmNextChargeAt),
    reservedVmGraceEndsAt: toIso(deployment.reservedVmGraceEndsAt),
    reservedVmStopRequestedAt: toIso(deployment.reservedVmStopRequestedAt),
    persistentStorageClaim: deployment.persistentStorageClaim ?? undefined,
    accessPolicyVersion: Number(deployment.accessPolicyVersion ?? 0),
    lastMeteredAt: toIso(deployment.lastMeteredAt),
    startedAt: toIso(deployment.startedAt),
    finishedAt: toIso(deployment.finishedAt),
    canceledAt: toIso(deployment.canceledAt),
    createdAt: toIso(deployment.createdAt)!,
    updatedAt: toIso(deployment.updatedAt),
  };
}

function mapReservedVmOperation(row: any): ReservedVmLease {
  return {
    id: row.id,
    projectId: row.projectId,
    deploymentId: row.deploymentId,
    organizationId: row.organizationId,
    actorUserId: row.actorUserId ?? undefined,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    kind: row.kind,
    status: row.status,
    phase: row.phase,
    fromRuntimeKind: row.fromRuntimeKind ?? undefined,
    fromTier: row.fromTier ?? undefined,
    targetRuntimeKind: row.targetRuntimeKind,
    targetTier: row.targetTier ?? undefined,
    targetMachineSize: row.targetMachineSize,
    targetCpuMillicores: Number(row.targetCpuMillicores),
    targetMemoryMb: Number(row.targetMemoryMb),
    targetPriceCents: Number(row.targetPriceCents),
    billingAmountCents: Number(row.billingAmountCents),
    termsVersion: row.termsVersion,
    rateCardVersion: Number(row.rateCardVersion),
    expectedRuntimeVersion: Number(row.expectedRuntimeVersion),
    leaseOwner: row.leaseOwner ?? undefined,
    leaseExpiresAt: toIso(row.leaseExpiresAt),
    fencingToken: Number(row.fencingToken),
    billingReservationId: row.billingReservationId ?? undefined,
    response:
      row.response && typeof row.response === 'object' && !Array.isArray(row.response)
        ? (row.response as Record<string, unknown>)
        : undefined,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function mapReservedVmBillingPeriod(row: any): ReservedVmBillingPeriodLease {
  return {
    id: row.id,
    projectId: row.projectId,
    deploymentId: row.deploymentId,
    organizationId: row.organizationId,
    actorUserId: row.actorUserId ?? undefined,
    periodStart: toIso(row.periodStart)!,
    periodEnd: toIso(row.periodEnd)!,
    tier: row.tier,
    priceCents: Number(row.priceCents),
    termsVersion: row.termsVersion,
    rateCardVersion: Number(row.rateCardVersion),
    status: row.status,
    attemptCount: Number(row.attemptCount),
    reservationGeneration: Number(row.reservationGeneration),
    leaseOwner: row.leaseOwner ?? undefined,
    leaseExpiresAt: toIso(row.leaseExpiresAt),
    fencingToken: Number(row.fencingToken),
    billingReservationId: row.billingReservationId ?? undefined,
    graceEndsAt: toIso(row.graceEndsAt),
    stopRequestedAt: toIso(row.stopRequestedAt),
    settledAt: toIso(row.settledAt),
    lastErrorCode: row.lastErrorCode ?? undefined,
    lastErrorMessage: row.lastErrorMessage ?? undefined,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function publicReservedVmBillingPeriod(row: any): ReservedVmBillingPeriodRecord {
  const {
    leaseOwner: _leaseOwner,
    leaseExpiresAt: _leaseExpiresAt,
    fencingToken: _fencingToken,
    ...period
  } = mapReservedVmBillingPeriod(row);
  return period;
}

function publicReservedVmOperation(row: any): ReservedVmOperationRecord {
  const {
    leaseOwner: _leaseOwner,
    leaseExpiresAt: _leaseExpiresAt,
    fencingToken: _fencingToken,
    ...operation
  } = mapReservedVmOperation(row);
  return operation;
}

function parseReservedVmRedeployReleaseIntent(value: unknown):
  | {
      priorPlanEntitlements: ReleasePlanEntitlementsPin;
      priorProjectManifestDigest: string;
      targetPlanEntitlements: ReleasePlanEntitlementsPin;
      targetProjectManifestDigest: string;
    }
  | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const intent = (value as { redeployIntent?: unknown }).redeployIntent;

  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return undefined;
  const candidate = intent as Record<string, unknown>;
  const priorPlanEntitlements = parseReleasePlanEntitlementsPin(candidate.priorPlanEntitlements);
  const targetPlanEntitlements = parseReleasePlanEntitlementsPin(candidate.targetPlanEntitlements);

  if (
    candidate.version !== 1 ||
    !priorPlanEntitlements ||
    !targetPlanEntitlements ||
    typeof candidate.priorProjectManifestDigest !== 'string' ||
    !PROJECT_MANIFEST_DIGEST_PATTERN.test(candidate.priorProjectManifestDigest) ||
    typeof candidate.targetProjectManifestDigest !== 'string' ||
    !PROJECT_MANIFEST_DIGEST_PATTERN.test(candidate.targetProjectManifestDigest)
  ) {
    return undefined;
  }

  return {
    priorPlanEntitlements,
    priorProjectManifestDigest: candidate.priorProjectManifestDigest,
    targetPlanEntitlements,
    targetProjectManifestDigest: candidate.targetProjectManifestDigest,
  };
}

function deploymentPlanEntitlementsPin(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  return (metadata as { planEntitlements?: unknown }).planEntitlements;
}

function deploymentProjectManifestDigest(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  const digest = (metadata as { projectManifestDigest?: unknown }).projectManifestDigest;
  return typeof digest === 'string' && PROJECT_MANIFEST_DIGEST_PATTERN.test(digest) ? digest : undefined;
}

function mapReleaseManifest(row: any): ReleaseManifestRecord {
  const planEntitlements = parseReleasePlanEntitlementsPin(row.planEntitlements);

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
    runtimeSpec: row.runtimeSpec ?? undefined,
    promotionEvidence: row.promotionEvidence ?? undefined,
    accessPolicyVersion: Number(row.accessPolicyVersion ?? 0),
    planEntitlements,
    projectManifestDigest:
      typeof row.projectManifestDigest === 'string' && PROJECT_MANIFEST_DIGEST_PATTERN.test(row.projectManifestDigest)
        ? row.projectManifestDigest
        : undefined,
    createdAt: toIso(row.createdAt)!,
  };
}

function validDeploymentAccessPolicy(row: any): boolean {
  return isValidDeploymentAccessPolicyRecord({ ...row, passwordHash: row?.passwordHash ?? undefined });
}

function mapDeploymentAccessPolicy(row: any): DeploymentAccessPolicyRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    environment: row.environment,
    version: row.version,
    mode: normalizeDeploymentAccessMode(row.mode),
    revision: row.revision,
    passwordHash: row.passwordHash ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    createdAt: toIso(row.createdAt)!,
  };
}

function mapRollbackOperation(row: any): RollbackOperationRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    actorUserId: row.actorUserId ?? undefined,
    idempotencyKey: row.idempotencyKey,
    requestFingerprint: row.requestFingerprint,
    environment: row.environment,
    status: row.status,
    phase: row.phase,
    leaseOwner: row.leaseOwner ?? undefined,
    leaseExpiresAt: toIso(row.leaseExpiresAt),
    fencingToken: row.fencingToken,
    effectFencingToken: row.effectFencingToken ?? undefined,
    deploymentId: row.deploymentId ?? undefined,
    expectedHeadVersion: row.expectedHeadVersion ?? undefined,
    previousManifestId: row.previousManifestId ?? undefined,
    projectManifestDigest: row.projectManifestDigest ?? undefined,
    responseStatus: row.responseStatus ?? undefined,
    responseContentLanguage: row.responseContentLanguage ?? undefined,
    responseBody: row.responseBody ?? undefined,
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
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
    planMonthlyCents:
      Number.isSafeInteger(subscription.plan?.monthlyCents) && subscription.plan.monthlyCents >= 0
        ? subscription.plan.monthlyCents
        : -1,
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
