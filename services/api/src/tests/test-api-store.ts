import { createHash, randomUUID } from 'node:crypto';

import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
import { hashToken } from '@vibecore/auth';
import {
  BUILTIN_RATE_CARD,
  RESERVED_VM_TIERS,
  type PlanKey,
  type QuotaKey,
  type QuotaOverrideKey,
} from '@vibecore/billing';
import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
import { appPublicEnglish } from '../app-public-copy.js';
import type { ProjectCheckpointLease } from '../checkpoint-lease.js';
import {
  anonymizedEmail,
  buildErasureProof,
  type AccountPurgePreview,
  type AccountPurgeProjectDeletionAuthority,
  type ErasureProof,
  type PurgeStorageDeps,
  type PurgeStorageInventory,
  type PurgeUserAccountResult,
} from '../account-purge.js';
import { DELETION_GRACE_PERIOD_DAYS } from '../data-deletion.js';
import {
  isValidDeploymentAccessPolicyRecord,
  normalizeDeploymentAccessMode,
  type DeploymentAccessMode,
  type DeploymentAccessPolicyRecord,
} from '../deployment-access.js';
import {
  createDefaultProjectManifest,
  projectManifestSnapshotPin,
  projectManifestForClone,
  projectManifestDigest,
  PROJECT_MANIFEST_DIGEST_PATTERN,
  readProjectManifestSnapshotPin,
  verifyStoredProjectManifestRevision,
  type ProjectManifest,
  type ProjectManifestCloneMode,
} from '../project-manifest.js';
import { remixIdeStateDigest, validRemixIdeStatePin } from '../remix-ide-state.js';
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
} from '../deterministic-rollback.js';
import { isCommittedPromotionForTenant, SERVER_IMAGE_RELEASE_AUDIT_ACTION } from '../server-image-promotion.js';
import { buildRollbackSuccessReceipt } from '../rollback-response.js';
import { DEFAULT_ENV_VAR_SCOPE, parseReleasePlanEntitlementsPin, sameReleasePlanEntitlementsPin } from '../store.js';
import {
  CLEARED_LOCKOUT,
  nextStateOnFailure,
  type LoginLockoutState,
  type LoginThrottleConfig,
} from '../login-throttle.js';
import { isSessionIdleExpired, sessionIdleTimeoutMs } from '../session-idle.js';
import { projectOrganizationChangedError, projectPhysicalMutationLockKey } from '../project-physical-mutation.js';
import { projectPermanentDeletionRequestHash } from '../project-permanent-deletion.js';
import {
  buildProjectDatabaseErasurePlan,
  type ProjectDatabaseErasureEffects,
  type ProjectDatabaseErasureFence,
  type ProjectDatabaseErasurePlan,
  type ProjectDatabaseErasureReceipt,
} from '../project-database-erasure.js';
import type { ProjectDatabaseErasureConfiguration } from '../project-database-erasure-ledger.js';
import type { ProjectStaticArtifactAuthority, ProjectStaticErasureInventory } from '../project-storage.js';
import {
  parseObjectStorageStaticArtifactSummary,
  type ObjectStorageCheckpointBarrierAuthority,
  type ObjectStorageOperationLease,
  type ObjectStorageStaticArtifactSummary,
  type ObjectStorageStaticErasurePlan,
  type ObjectStorageVerification,
} from '../object-storage-operation.js';
import {
  assertObjectStorageCommandPreconditions,
  assertValidObjectStorageCommand,
  assertValidObjectStorageCommandIntent,
  executeObjectStorageCommand,
  objectStorageCloneIntentHash,
  objectStorageCommandIdentity,
  objectStorageCommandIntentHash,
  objectStorageCommandMutationProjectIds,
  objectStorageCommandProjectIds,
  pinObjectStorageCommand,
  pinObjectStorageCommandIntent,
  verifyObjectStorageCommand,
  type ObjectStorageCommandExecution,
  type TenantObjectStorageCommand,
  type TenantObjectStorageCommandIntent,
} from '../object-storage-command.js';
import {
  assertValidObjectKey,
  ObjectStorageError,
  parseObjectStorageInventory,
  SIGNED_URL_TTL_MS,
  type ObjectStorage,
  type ObjectStorageInventory,
} from '../object-storage.js';
import type {
  EnvVarScope,
  AbuseEventRecord,
  SecurityEventResolutionRecord,
  SecurityAuditEventPage,
  AgentPatchProposalRecord,
  AgentPatchProposalStatus,
  AgentRepairEventRecord,
  AgentRepairOutcome,
  ConsensusRecordSummary,
  ConsensusRecordDetail,
  ConsensusClaimVote,
  ConsensusConflict,
  ConsensusConsolidated,
  ContactRequestRecord,
  ApiKeyRecord,
  ApiKeyScope,
  ApiStore,
  AiCostLedgerRecord,
  CanonicalAiUsageBatchInput,
  CanonicalAiClassifierRouting,
  CanonicalAiClassifierRoutingSelection,
  AiConversationRecord,
  AiMessageRecord,
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
  AiTokenUsageRecord,
  AiToolCallRecord,
  AgentCheckpointRecord,
  UserSpendLimitRecord,
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
  ReservedVmLease,
  ReservedVmOperationRecord,
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
  ProjectConnectionLinkRecord,
  ProjectReleaseFence,
  ReconnectionAlertRecord,
  UserConnectionRecord,
  UserConnectionStatus,
  OrganizationInviteRecord,
  OrganizationRecord,
  ProjectActivityListOptions,
  ProjectActivityRecord,
  ProjectCollaboratorRecord,
  ProjectEnvironmentRecord,
  ProjectIdeStateRecord,
  ProjectManifestRevisionRecord,
  ProjectReleaseBarrierLease,
  ProjectRecord,
  ProjectPhysicalMutationScope,
  ProjectPermanentDeletionReceiptRecord,
  ProjectPermanentDeletionResult,
  ProjectSecretRecord,
  ProjectShareLinkRecord,
  ChatShareRecord,
  ProjectStorageObjectRecord,
  DatabaseInstanceRecord,
  DatabaseSnapshotRecord,
  DatabaseRestoreRecord,
  DatabaseMigrationExecutionRecord,
  DatabaseMigrationState,
  GalleryListingRecord,
  ProjectTemplateRecord,
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
} from '../store.js';
import { countActiveModerationStrikes } from '../strike-system.js';

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function now() {
  return new Date().toISOString();
}

function canonicalClassifierCostMillicents(
  routing: CanonicalAiClassifierRouting,
  inputTokens: number,
  outputTokens: number,
): number {
  const numerator =
    BigInt(inputTokens) * BigInt(routing.costInMillicentsPerM) +
    BigInt(outputTokens) * BigInt(routing.costOutMillicentsPerM);
  return Number((numerator + 500_000n) / 1_000_000n);
}

function sameNullable(left: string | undefined, right: string | undefined) {
  return (left ?? null) === (right ?? null);
}

function canonicalObjectStorageInventory(inventory: ObjectStorageInventory): ObjectStorageInventory {
  return {
    bucketExists: inventory.bucketExists,
    objects: [...inventory.objects]
      .map(({ key, size, generation, contentHash }) => ({ key, size, generation, contentHash }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function retainedRemixSourceInventory(value: unknown): ObjectStorageInventory {
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

function assertPermanentDeletionProof(
  proof: ObjectStorageVerification,
  expectedStaticArtifactSummary: ObjectStorageStaticArtifactSummary,
): void {
  const filesystem = proof.evidence.filesystem as Record<string, unknown> | undefined;
  const gcs = proof.evidence.gcs as Record<string, unknown> | undefined;
  const workspaceManager = proof.evidence.workspaceManager as Record<string, unknown> | undefined;
  const kubernetes = workspaceManager?.kubernetes as Record<string, unknown> | undefined;
  let staticArtifactSummary: ObjectStorageStaticArtifactSummary | undefined;
  let expected: ObjectStorageStaticArtifactSummary | undefined;
  try {
    staticArtifactSummary = parseObjectStorageStaticArtifactSummary(filesystem?.staticArtifactSummary);
    expected = parseObjectStorageStaticArtifactSummary(expectedStaticArtifactSummary);
  } catch {
    // The common incomplete-proof branch below supplies the public contract.
  }
  const complete =
    proof.outcome === 'VERIFIED_ABSENT' &&
    proof.evidence.schemaVersion === 'project-permanent-erasure-v1' &&
    filesystem?.projectTreeAbsent === true &&
    filesystem.workspaceTreesAbsent === true &&
    filesystem.objectCacheAbsent === true &&
    filesystem.staticSnapshotsAbsent === true &&
    filesystem.staticAliasesAbsent === true &&
    staticArtifactSummary !== undefined &&
    expected !== undefined &&
    staticArtifactSummary.count === expected.count &&
    staticArtifactSummary.deletedCount === expected.deletedCount &&
    staticArtifactSummary.retainedCount === expected.retainedCount &&
    staticArtifactSummary.digest === expected.digest &&
    gcs?.bucketAbsent === true &&
    gcs.objectCount === 0 &&
    workspaceManager?.schemaVersion === 'workspace-project-erasure-v2' &&
    workspaceManager.databaseInventoryRetained === true &&
    workspaceManager.runtimeEffectsDrained === true &&
    kubernetes?.deploymentsAbsent === true &&
    kubernetes.replicaSetsAbsent === true &&
    kubernetes?.podsAbsent === true &&
    kubernetes.servicesAbsent === true &&
    kubernetes.endpointsAbsent === true &&
    kubernetes.endpointSlicesAbsent === true &&
    kubernetes.ingressesAbsent === true &&
    kubernetes.ownedRuntimeSecretsAbsent === true &&
    kubernetes.persistentVolumeClaimsAbsent === true;
  if (!complete) {
    throw Object.assign(new Error('OBJECT_STORAGE_OPERATION_PERMANENT_ERASURE_PROOF_INCOMPLETE'), {
      code: 'OBJECT_STORAGE_OPERATION_PERMANENT_ERASURE_PROOF_INCOMPLETE',
      statusCode: 409,
    });
  }
}

function publicReservedVmOperation(operation: ReservedVmLease): ReservedVmOperationRecord {
  const { leaseOwner: _owner, leaseExpiresAt: _expiry, fencingToken: _fence, ...record } = operation;
  return record;
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export class TestApiStore implements ApiStore {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly runtimeWebSocketTickets = new Map<string, RuntimeWebSocketTicketRecord>();
  readonly organizations = new Map<string, OrganizationRecord>();
  readonly memberships = new Map<string, MembershipRecord>();
  readonly projects = new Map<string, ProjectRecord>();
  readonly projectTransferReceipts: Array<{
    projectId: string;
    sourceOrganizationId: string;
    targetOrganizationId: string;
    ownershipEpoch: number;
    idempotencyKey: string;
    project: ProjectRecord;
  }> = [];
  readonly projectManifestRevisions = new Map<string, ProjectManifestRevisionRecord[]>();
  readonly workspaces = new Map<string, WorkspaceRecord>();
  readonly snapshots = new Map<string, SnapshotRecord>();
  readonly projectStorageObjects = new Map<string, ProjectStorageObjectRecord>();
  readonly objectStorageCapabilityExpiresAt = new Map<string, number>();
  readonly objectStorageCommandReceipts = new Map<
    string,
    { requestHash: string; transportIntentHash?: string; execution: ObjectStorageCommandExecution }
  >();
  readonly databaseInstances = new Map<string, DatabaseInstanceRecord>();
  readonly databaseSnapshots = new Map<string, DatabaseSnapshotRecord>();
  readonly databaseRestores = new Map<string, DatabaseRestoreRecord>();

  /** Models the separate CloudGovernance store's durable Project binding. */
  readonly cloudProjectBindingProjectIds = new Set<string>();
  readonly projectEnvVars = new Map<string, ProjectEnvironmentRecord>();
  readonly projectSecrets = new Map<string, ProjectSecretRecord>();
  readonly projectCollaborators = new Map<string, ProjectCollaboratorRecord>();
  readonly projectActivity = new Map<string, ProjectActivityRecord>();
  readonly projectIdeStates = new Map<string, ProjectIdeStateRecord>();
  readonly workspaceIdeStates = new Map<string, WorkspaceIdeStateRecord>();
  readonly collaborationPresence = new Map<string, CollaborationPresenceRecord>();
  readonly collaborationComments = new Map<string, CollaborationCommentRecord>();
  readonly projectShareLinks = new Map<string, ProjectShareLinkRecord>();
  readonly collaborationGroups = new Map<string, CollaborationGroupRecord>();
  readonly collaborationGroupMembers = new Map<string, CollaborationGroupMemberRecord>();
  readonly resourceAccessGrants = new Map<string, ResourceAccessGrantRecord>();
  readonly chatShares = new Map<string, ChatShareRecord>();
  readonly agentPatchProposals = new Map<string, AgentPatchProposalRecord>();
  readonly projectTemplates = new Map<string, ProjectTemplateRecord>();
  readonly deployments = new Map<string, DeploymentRecord>();
  readonly reservedVmOperations = new Map<string, ReservedVmLease>();
  readonly reservedVmRuntimeFences = new Map<string, number>();
  readonly deploymentAccessPolicies: DeploymentAccessPolicyRecord[] = [];
  readonly deploymentAccessExchangeTickets = new Map<
    string,
    {
      deploymentId: string;
      userId: string;
      policyVersion: number;
      policyRevision: string;
      expiresAt: string;
      consumedAt?: string;
    }
  >();
  readonly supportTickets = new Map<string, SupportTicketRecord>();
  readonly ticketMessages: TicketMessageRecord[] = [];
  readonly featureFlags = new Map<string, FeatureFlagRecord>();
  readonly abuseEvents = new Map<string, AbuseEventRecord>();
  readonly securityEventResolutions = new Map<string, SecurityEventResolutionRecord>();
  readonly integrationFeatureRequests = new Map<string, IntegrationFeatureRequestRecord>();

  // Keyed `${userId}:${messageId}` — mirrors the prisma @@unique([userId, messageId]).
  readonly aiMessageFeedback = new Map<string, AiMessageFeedbackRecord>();
  readonly systemSettings = new Map<string, SystemSettingRecord>();
  readonly purgeReceipts = new Map<string, { planId: string; purgedAt: string; proof: ErasureProof }>();
  readonly purgeEffects = new Map<string, Record<string, unknown>>();
  readonly purgeEffectStartedPlanIds = new Set<string>();
  readonly purgePlanInventories = new Map<string, PurgeStorageInventory>();
  readonly purgeFrozenUsers = new Set<string>();
  readonly purgeFrozenOrganizations = new Set<string>();
  readonly purgePlanUserIds = new Set<string>();
  readonly purgePlannedProjectIds = new Set<string>();
  readonly purgePlannedWorkspaceIds = new Set<string>();
  readonly purgeFrozenProjects = new Set<string>();
  readonly purgeProjectDeletionAuthorities = new Map<string, AccountPurgeProjectDeletionAuthority>();
  readonly emailVerifications = new Map<
    string,
    { userId: string; tokenHash: string; expiresAt: string; usedAt?: string; email?: string }
  >();
  readonly passwordResets = new Map<
    string,
    { userId: string; tokenHash: string; expiresAt: string; usedAt?: string }
  >();
  readonly recoveryCodes = new Map<string, RecoveryCodeRecord>();
  readonly enterpriseSettings = new Map<string, EnterpriseSettingsRecord>();
  readonly domainVerifications = new Map<string, DomainVerificationRecord>();
  readonly ssoConfigs = new Map<string, SsoConfigRecord>();
  readonly scimTokens = new Map<string, ScimTokenRecord>();
  readonly customRoles = new Map<string, CustomRoleRecord>();
  readonly siemWebhooks = new Map<string, SiemWebhookRecord>();
  readonly apiKeys = new Map<string, ApiKeyRecord>();
  readonly organizationInvites = new Map<string, OrganizationInviteRecord>();
  readonly oauthConnections = new Map<string, OAuthConnectionRecord>();
  readonly userConnections = new Map<string, UserConnectionRecord>();
  readonly projectConnectionLinks = new Map<string, ProjectConnectionLinkRecord>();
  readonly reconnectionAlerts = new Map<string, ReconnectionAlertRecord>();
  readonly notifications = new Map<string, NotificationRecord>();
  readonly aiConversations = new Map<string, AiConversationRecord>();
  readonly aiMessages = new Map<string, AiMessageRecord>();
  readonly aiToolCalls = new Map<string, AiToolCallRecord>();
  readonly aiTokenUsages = new Map<string, AiTokenUsageRecord>();
  readonly providerRequestMetrics: Array<{
    provider: string;
    model: string | null;
    latencyMs: number;
    errored: boolean;
    statusCode: number | null;
    source: string | null;
    createdAt: string;
  }> = [];
  readonly aiCostLedger = new Map<string, AiCostLedgerRecord>();
  readonly creditWallets = new Map<string, CreditWalletRecord>();
  readonly creditLedger = new Map<string, CreditLedgerRecord>();
  readonly creditPacks = new Map<string, CreditPackRecord>();
  readonly agentCheckpoints = new Map<string, AgentCheckpointRecord>();
  readonly userSpendLimits = new Map<string, UserSpendLimitRecord>();
  failCanonicalUserSpendCommits = false;
  failCanonicalReconciliationOnce = false;
  readonly canonicalUserSpendReservations = new Map<
    string,
    {
      id: string;
      organizationId: string;
      userId: string;
      idempotencyKey: string;
      requestHash: string;
      maxAmountCents: number;
      committedCents?: number;
      usageRequestHash?: string;
      aiCostLedgerId?: string;
      aiCostLedgerIds?: string[];
      batchRequestHash?: string;
      batchBilledCents?: number;
      recoveredAtCeiling?: boolean;
      claimedAt?: string;
      claimOwnerId?: string;
      claimLeaseExpiresAt?: string;
      executionToken?: string;
      startedRequestHash?: string;
      startedRequestId?: string;
      startedProjectId?: string;
      startedAt?: string;
      settleAfter?: string;
      platformUsageRequestHash?: string;
      platformAiCostLedgerId?: string;
      platformOutcome?: 'hard' | 'easy';
      platformRecoveredAtCeiling?: boolean;
      platformIntentRequestHash?: string;
      platformIntentStartedAt?: string;
      platformIntentSettleAfter?: string;
      platformIntentCallId?: string;
      platformIntentProvider?: string;
      platformIntentModel?: string;
      platformIntentMaxInputTokens?: number;
      platformIntentMaxOutputTokens?: number;
      platformIntentMaxCostCents?: number;
      platformIntentRouting?: CanonicalAiClassifierRouting;
      platformAgentCallLogId?: string;
      manualRecoveryAt?: string;
      manualRecoveryReason?: string;
      reconcileFailureAttempts?: number;
      reconcileFailureReason?: string;
      reconcileLastAttemptAt?: string;
      reconcileNextRetryAt?: string;
      expiresAt: string;
      periodStart: string;
      status: 'ACTIVE' | 'COMMITTED' | 'RELEASED' | 'EXPIRED';
    }
  >();
  readonly providerConfigs = new Map<string, ProviderConfigRecord>();
  readonly modelConfigs = new Map<string, ModelConfigRecord>();
  readonly billingCustomers = new Map<string, BillingCustomerRecord>();
  readonly billingPlans = new Map<PlanKey, BillingPlanRecord>();
  readonly subscriptions = new Map<string, SubscriptionRecord>();
  readonly usageEvents = new Map<string, UsageEventRecord>();
  readonly quotaOverrides = new Map<string, QuotaOverrideRecord>();
  readonly stripeEvents = new Map<string, StripeEventRecord>();
  readonly emailDeliveryEvents: EmailDeliveryEventRecord[] = [];
  readonly auditLogs: Array<AuditEvent & { id: string; createdAt: string }> = [];
  readonly adminAuditLogs: AdminAuditLogRecord[] = [];
  /** Injectable authoritative clock used by expiry-sensitive store contracts. */
  databaseClockNowMs: number | undefined;
  readonly projectPermanentDeletionReceipts = new Map<string, ProjectPermanentDeletionReceiptRecord>();
  readonly #projectPermanentDeletionNameHashes = new Map<string, string>();

  async ping(): Promise<void> {
    // In-memory store is always reachable.
  }

  async getDatabaseClock() {
    const current = new Date(this.databaseClockNowMs ?? Date.now());
    return {
      now: current.toISOString(),
      monthStart: new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1)).toISOString(),
    };
  }

  /**
   * Chaîne de promesses PAR CLÉ — reflète fidèlement
   * `pg_advisory_xact_lock(hashtext(key))` de PrismaApiStore : deux sections
   * critiques de même clé ne s'entrelacent jamais.
   *
   * L'implémentation précédente exécutait `fn()` directement. Dans la boucle
   * d'événements Node, deux requêtes concurrentes s'entrelacent à CHAQUE `await`,
   * si bien qu'un test « concurrent » lisait deux fois « 0 publication active »
   * et validait un comportement que la production n'a pas. Sérialiser ici rend le
   * test concurrent significatif.
   */
  readonly #mutationChains = new Map<string, Promise<unknown>>();

  async withSerializedMutation<T>(
    key: string,
    fn: () => Promise<T>,
    _options?: { transactionTimeoutMs?: number },
  ): Promise<T> {
    const previous = this.#mutationChains.get(key) ?? Promise.resolve();

    /*
     * On chaîne sur l'issue (succès OU échec) du précédent : une section qui
     * échoue doit quand même relâcher le verrou.
     */
    const run = previous.then(fn, fn);
    this.#mutationChains.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );

    return run;
  }

  private assertExpectedProjectTenant(
    scope: ProjectPhysicalMutationScope,
    options: { allowDeletedProject?: boolean; allowPermanentDeletion?: boolean } = {},
  ): ProjectRecord {
    const project = this.projects.get(scope.projectId);

    if (
      !project ||
      (!options.allowDeletedProject && project.deletedAt) ||
      project.organizationId !== scope.expectedOrganizationId
    ) {
      throw projectOrganizationChangedError();
    }

    if (project.permanentDeletionStartedAt && !options.allowPermanentDeletion) {
      throw Object.assign(new Error('PROJECT_PERMANENT_DELETION_ACTIVE'), {
        code: 'PROJECT_PERMANENT_DELETION_ACTIVE',
        statusCode: 409,
      });
    }

    return project;
  }

  private withProjectPhysicalBarriers<T>(projectIds: string[], effect: () => Promise<T>): Promise<T> {
    const orderedProjectIds = [...new Set(projectIds)].sort();
    const acquire = (index: number): Promise<T> => {
      const projectId = orderedProjectIds[index];
      return projectId
        ? this.withSerializedMutation(projectPhysicalMutationLockKey(projectId), () => acquire(index + 1))
        : effect();
    };

    return acquire(0);
  }

  async withProjectPhysicalMutation<T>(scope: ProjectPhysicalMutationScope, effect: () => Promise<T>): Promise<T> {
    return this.withProjectPhysicalBarriers([scope.projectId], async () => {
      await this.assertProjectStorageMutable(scope);
      await this.assertProjectStorageMutable(scope);
      return effect();
    });
  }

  async withProjectPhysicalAccess<T>(scope: ProjectPhysicalMutationScope, effect: () => Promise<T>): Promise<T> {
    return this.withProjectPhysicalAccesses([scope], effect);
  }

  async withProjectPhysicalAccesses<T>(scopes: ProjectPhysicalMutationScope[], effect: () => Promise<T>): Promise<T> {
    return this._withProjectPhysicalAccessesInternal(scopes, new Set(), effect);
  }

  private _withProjectPhysicalAccessesAllowingDeletedProjects<T>(
    scopes: ProjectPhysicalMutationScope[],
    allowDeletedProjectIds: readonly string[],
    effect: () => Promise<T>,
  ): Promise<T> {
    return this._withProjectPhysicalAccessesInternal(scopes, new Set(allowDeletedProjectIds), effect);
  }

  private async _withProjectPhysicalAccessesInternal<T>(
    scopes: ProjectPhysicalMutationScope[],
    allowDeletedProjectIds: ReadonlySet<string>,
    effect: () => Promise<T>,
  ): Promise<T> {
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
    if ([...allowDeletedProjectIds].some((projectId) => !byProjectId.has(projectId))) {
      throw new TypeError('PROJECT_PHYSICAL_ACCESS_DELETED_SCOPE_INVALID');
    }

    return this.withProjectPhysicalBarriers(
      orderedScopes.map(({ projectId }) => projectId),
      async () => {
        for (const tenantScope of orderedScopes) {
          await this.assertProjectStorageMutable(tenantScope, {
            allowDeletedProject: allowDeletedProjectIds.has(tenantScope.projectId),
          });
        }
        for (const tenantScope of orderedScopes) {
          await this.assertProjectStorageMutable(tenantScope, {
            allowDeletedProject: allowDeletedProjectIds.has(tenantScope.projectId),
          });
        }
        return effect();
      },
    );
  }

  private async withProjectTenantMutation<T>(
    scope: ProjectPhysicalMutationScope,
    effect: () => Promise<T>,
    options: {
      allowActiveCheckpoint?: boolean;
      allowDeletedProject?: boolean;
      allowPermanentDeletion?: boolean;
      checkpointBarrierAuthority?: ProjectCheckpointLease;
      accountPurgeDeletionAuthority?: AccountPurgeProjectDeletionAuthority;
    } = {},
  ): Promise<T> {
    return this.withProjectPhysicalBarriers([scope.projectId], async () => {
      await this.assertProjectTenantMutationAllowed(scope, options);
      return effect();
    });
  }

  private async assertProjectTenantMutationAllowed(
    scope: ProjectPhysicalMutationScope,
    options: {
      allowActiveCheckpoint?: boolean;
      allowDeletedProject?: boolean;
      allowPermanentDeletion?: boolean;
      checkpointBarrierAuthority?: ProjectCheckpointLease;
      accountPurgeDeletionAuthority?: AccountPurgeProjectDeletionAuthority;
    } = {},
  ): Promise<void> {
    await this.assertProjectStorageMutable(scope, options);
    if (options.checkpointBarrierAuthority) {
      const row = this.projectCheckpoints.get(options.checkpointBarrierAuthority.checkpointId);
      if (
        !row ||
        row.projectId !== scope.projectId ||
        row.barrierProjectId !== scope.projectId ||
        row.logicalBarrierId !== options.checkpointBarrierAuthority.barrierId ||
        row.barrierOwnerToken !== options.checkpointBarrierAuthority.ownerToken ||
        row.barrierFence !== options.checkpointBarrierAuthority.fence ||
        !row.barrierExpiresAt ||
        new Date(row.barrierExpiresAt).getTime() <= Date.now()
      ) {
        throw Object.assign(new Error(appPublicEnglish('CHECKPOINT_BARRIER_LOST')), {
          code: 'CHECKPOINT_BARRIER_LOST',
          statusCode: 409,
        });
      }
    } else if (!options.allowActiveCheckpoint && (await this.getActiveCheckpointBarrier(scope.projectId))) {
      throw Object.assign(new Error(appPublicEnglish('CHECKPOINT_BARRIER_ACTIVE_MESSAGE')), {
        code: 'CHECKPOINT_BARRIER_ACTIVE',
        statusCode: 423,
      });
    }
  }

  withProjectPhysicalErasure<T>(projectId: string, effect: () => Promise<T>): Promise<T> {
    return this.withProjectPhysicalBarriers([projectId], effect);
  }

  private _assertAccountPurgeMutationAllowed(scope: {
    userIds?: Array<string | null | undefined>;
    organizationIds?: Array<string | null | undefined>;
    projectIds?: Array<string | null | undefined>;
  }) {
    const userIds = [...new Set(scope.userIds?.filter((value): value is string => Boolean(value)) ?? [])];
    const organizationIds = [
      ...new Set(scope.organizationIds?.filter((value): value is string => Boolean(value)) ?? []),
    ];
    const projectIds = [...new Set(scope.projectIds?.filter((value): value is string => Boolean(value)) ?? [])];

    if (userIds.some((userId) => this.purgeReceipts.has(userId))) {
      throw Object.assign(new Error('ACCOUNT_PURGE_COMPLETED'), { code: 'ACCOUNT_PURGE_COMPLETED', statusCode: 409 });
    }
    if (userIds.some((userId) => this.purgeFrozenUsers.has(userId))) {
      throw Object.assign(new Error('USER_TOPOLOGY_FROZEN_FOR_ACCOUNT_PURGE'), {
        code: 'USER_TOPOLOGY_FROZEN_FOR_ACCOUNT_PURGE',
        statusCode: 409,
      });
    }
    if (organizationIds.some((organizationId) => this.purgeFrozenOrganizations.has(organizationId))) {
      throw Object.assign(new Error('MEMBERSHIP_FROZEN_FOR_ACCOUNT_PURGE'), {
        code: 'MEMBERSHIP_FROZEN_FOR_ACCOUNT_PURGE',
        statusCode: 409,
      });
    }
    if (projectIds.some((projectId) => this.purgeFrozenProjects.has(projectId))) {
      throw Object.assign(new Error('PROJECT_FROZEN_FOR_ACCOUNT_PURGE'), {
        code: 'PROJECT_FROZEN_FOR_ACCOUNT_PURGE',
        statusCode: 409,
      });
    }
  }

  private _assertStateMachineNotPurged(errorCode?: string, error?: string) {
    if (errorCode === 'ACCOUNT_PURGE_COMPLETED' || error === 'ACCOUNT_PURGE_COMPLETED') {
      throw Object.assign(new Error('ACCOUNT_PURGE_COMPLETED'), { code: 'ACCOUNT_PURGE_COMPLETED', statusCode: 409 });
    }
  }

  private async withAccountPurgeSubjectLocks<T>(userIds: string[], fn: () => Promise<T>): Promise<T> {
    const keys = [...new Set(userIds)].sort().map((userId) => `account-purge:${userId}`);
    let locked = fn;

    for (const key of [...keys].reverse()) {
      const next = locked;
      locked = () => this.withSerializedMutation(key, next);
    }

    return locked();
  }

  private isSessionSubjectPurgeFenced(userId: string): boolean {
    if (this.purgePlanUserIds.has(userId) || this.purgeReceipts.has(userId)) return true;
    const deletion = (this.users.get(userId)?.preferences?.accountDeletion ?? null) as { purgedAt?: unknown } | null;
    return typeof deletion?.purgedAt === 'string';
  }

  async createUser(input: {
    email: string;
    name?: string;
    passwordHash: string;
    platformAdmin?: boolean;
    language?: string;
  }) {
    const user = {
      id: id('user'),
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: input.passwordHash,
      platformAdmin: input.platformAdmin,
      language: input.language,
      createdAt: now(),
    };
    this.users.set(user.id, user);

    return user;
  }

  async updateUser(input: {
    userId: string;
    email?: string;
    name?: string;
    passwordHash?: string;
    emailVerifiedAt?: string;
    mfaEnabled?: boolean;
    mfaSecretEncrypted?: string;
    platformAdmin?: boolean;
    language?: string | null;
    timezone?: string | null;
    preferences?: Record<string, unknown> | null;
  }) {
    const user = this.users.get(input.userId);

    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'USER_NOT_FOUND' });
    }

    Object.assign(user, {
      email: input.email?.toLowerCase() ?? user.email,
      name: input.name ?? user.name,
      passwordHash: input.passwordHash ?? user.passwordHash,
      emailVerifiedAt: input.emailVerifiedAt ?? user.emailVerifiedAt,
      mfaEnabled: input.mfaEnabled ?? user.mfaEnabled,
      mfaSecretEncrypted: input.mfaSecretEncrypted ?? user.mfaSecretEncrypted,
      platformAdmin: input.platformAdmin ?? user.platformAdmin,
      language: input.language === undefined ? user.language : (input.language ?? undefined),
      timezone: input.timezone === undefined ? user.timezone : (input.timezone ?? undefined),
      preferences: input.preferences === undefined ? user.preferences : (input.preferences ?? undefined),
    });

    return user;
  }

  async deleteUser(userId: string) {
    const deleted = this.users.delete(userId);

    for (const [tokenHash, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(tokenHash);
      }
    }

    for (const [id, membership] of this.memberships.entries()) {
      if (membership.userId === userId) {
        this.memberships.delete(id);
      }
    }

    return deleted;
  }

  async previewAccountPurge(userId: string): Promise<AccountPurgePreview> {
    const databaseNow = now();
    const user = this.users.get(userId);
    if (!user) return { userId, status: 'missing', databaseNow };
    const deletion = (user.preferences?.accountDeletion ?? null) as { requestedAt?: string; purgedAt?: string } | null;
    if (deletion?.purgedAt) return { userId, status: 'purged', databaseNow, purgedAt: deletion.purgedAt };
    if (!deletion?.requestedAt) return { userId, status: 'not_requested', databaseNow };
    const purgeDueAt = new Date(new Date(deletion.requestedAt).getTime() + DELETION_GRACE_PERIOD_DAYS * 86_400_000);
    if (Date.now() < purgeDueAt.getTime()) {
      return {
        userId,
        status: 'not_due',
        databaseNow,
        requestedAt: deletion.requestedAt,
        purgeDueAt: purgeDueAt.toISOString(),
      };
    }
    const organizations = await this.listOrganizations(userId);
    const organizationIds = new Set(organizations.map((organization) => organization.id));
    const soleOrganizationIds = new Set(
      organizations
        .filter(
          (organization) =>
            [...this.memberships.values()].filter(
              (membership) => membership.organizationId === organization.id && membership.state === 'ACTIVE',
            ).length === 1,
        )
        .map((organization) => organization.id),
    );
    const workspaceProjectIds = [...this.projects.values()]
      .filter((project) => organizations.some((organization) => organization.id === project.organizationId))
      .map((project) => project.id);
    const bucketProjectIds = [...this.projects.values()]
      .filter(
        (project) => organizationIds.has(project.organizationId) && soleOrganizationIds.has(project.organizationId),
      )
      .map((project) => project.id);
    const ownedProjects = bucketProjectIds
      .map((projectId) => this.projects.get(projectId))
      .filter((project): project is ProjectRecord => Boolean(project))
      .map((project) => ({
        projectId: project.id,
        organizationId: project.organizationId,
        projectName: project.name,
        ownershipEpoch: project.ownershipEpoch,
      }));
    const localSnapshotObjects = [...this.snapshots.values()].flatMap((snapshot) =>
      bucketProjectIds.includes(snapshot.projectId) && snapshot.storageKey
        ? [{ projectId: snapshot.projectId, storageKey: snapshot.storageKey }]
        : [],
    );
    const staticDeploymentIds = [
      ...new Set([
        ...[...this.deployments.values()]
          .filter((deployment) => bucketProjectIds.includes(deployment.projectId) && deployment.provider === 'static')
          .map((deployment) => deployment.id),
        ...this.releaseManifests
          .filter(
            (manifest) => bucketProjectIds.includes(manifest.projectId) && manifest.artifactKind === 'static-snapshot',
          )
          .map((manifest) => manifest.deploymentId),
      ]),
    ];
    const staticArtifactRefs = [
      ...new Set(
        this.releaseManifests
          .filter(
            (manifest) => bucketProjectIds.includes(manifest.projectId) && manifest.artifactKind === 'static-snapshot',
          )
          .map((manifest) => manifest.artifactRef),
      ),
    ];
    return {
      userId,
      status: 'ready_to_purge',
      databaseNow,
      requestedAt: deletion.requestedAt,
      purgeDueAt: purgeDueAt.toISOString(),
      inventory: {
        ownedProjects,
        bucketProjectIds,
        workspaceProjectIds,
        localSnapshotObjects,
        staticDeploymentIds,
        staticArtifactRefs,
        staticAliasDeploymentIds: staticDeploymentIds,
      },
    };
  }

  async requestAccountDeletion(userId: string) {
    const user = this.users.get(userId);
    if (!user) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND', statusCode: 404 });
    const existing = (user.preferences?.accountDeletion ?? null) as { requestedAt?: string; purgedAt?: string } | null;
    const requestedAt = existing?.requestedAt ?? now();
    user.preferences = { ...(user.preferences ?? {}), accountDeletion: { requestedAt } };
    await this.mutateSystemSettingIds('account.pendingDeletionUserIds', { add: userId });
    return {
      requestedAt,
      purgeDueAt: new Date(new Date(requestedAt).getTime() + DELETION_GRACE_PERIOD_DAYS * 86_400_000).toISOString(),
      alreadyRequested: Boolean(existing?.requestedAt),
    };
  }

  async cancelAccountDeletion(userId: string) {
    const user = this.users.get(userId);
    if (!user?.preferences?.accountDeletion) return { cancelled: false as const, reason: 'not_requested' as const };
    const receipt = this.purgeReceipts.get(userId);
    if (receipt || this.purgePlanUserIds.has(userId)) {
      return { cancelled: false as const, reason: 'not_cancellable' as const };
    }
    const preferences = { ...(user.preferences ?? {}) };
    delete preferences.accountDeletion;
    user.preferences = preferences;
    await this.mutateSystemSettingIds('account.pendingDeletionUserIds', { remove: userId });
    return { cancelled: true as const };
  }

  async purgeUserAccount(
    input: { userId: string; correlationId?: string },
    deps: PurgeStorageDeps,
  ): Promise<PurgeUserAccountResult> {
    return this.withSerializedMutation(`account-purge:${input.userId}`, async () => {
      const preview = await this.previewAccountPurge(input.userId);
      if (preview.status === 'missing' || preview.status === 'not_requested') return { outcome: 'not_requested' };
      if (preview.status === 'not_due') return { outcome: 'not_due', purgeDueAt: preview.purgeDueAt! };
      if (preview.status === 'purged') {
        const receipt = this.purgeReceipts.get(input.userId);
        return {
          outcome: 'already_purged',
          ...(receipt ? { planId: receipt.planId } : {}),
          purgedAt: preview.purgedAt!,
        };
      }

      const planId = `purge-${input.userId}`;
      const ownerToken = `owner-${input.userId}`;
      const subjectOrgIds = [...this.memberships.values()]
        .filter((membership) => membership.userId === input.userId && membership.state === 'ACTIVE')
        .map((membership) => membership.organizationId);
      const soleOrgIds = subjectOrgIds.filter(
        (organizationId) =>
          [...this.memberships.values()].filter(
            (membership) => membership.organizationId === organizationId && membership.state === 'ACTIVE',
          ).length === 1,
      );
      const activeCheckpoint = [...this.projectCheckpoints.values()].find((checkpoint) => {
        const project = this.projects.get(checkpoint.projectId);
        return (
          (!['COMMITTED', 'CLEANED', 'MANUAL_INTERVENTION', 'RELEASE_BARRIER'].includes(checkpoint.state) ||
            Boolean(
              checkpoint.barrierProjectId &&
                checkpoint.barrierExpiresAt &&
                Date.parse(checkpoint.barrierExpiresAt) > Date.now(),
            )) &&
          (checkpoint.createdByUserId === input.userId ||
            Boolean(project && soleOrgIds.includes(project.organizationId)))
        );
      });
      if (activeCheckpoint) {
        throw Object.assign(new Error('ACCOUNT_PURGE_CHECKPOINT_ACTIVE'), {
          code: 'ACCOUNT_PURGE_CHECKPOINT_ACTIVE',
          statusCode: 409,
        });
      }
      const activeRollbackEffect = [...this.rollbackOperations.values()].find((operation) => {
        const project = this.projects.get(operation.projectId);
        return (
          operation.status === 'IN_PROGRESS' &&
          operation.phase === 'EFFECT_STARTED' &&
          (operation.actorUserId === input.userId || Boolean(project && soleOrgIds.includes(project.organizationId)))
        );
      });
      if (activeRollbackEffect) {
        throw Object.assign(new Error('ACCOUNT_PURGE_ROLLBACK_EFFECT_ACTIVE'), {
          code: 'ACCOUNT_PURGE_ROLLBACK_EFFECT_ACTIVE',
          statusCode: 409,
        });
      }
      const visibleStateMachineTarget = [
        ...[...this.importJobs.values()]
          .filter(
            (job) =>
              job.state !== 'COMMITTED' &&
              (job.actorUserId === input.userId || soleOrgIds.includes(job.organizationId)),
          )
          .map((job) => job.targetProjectId),
        ...[...this.remixJobs.values()]
          .filter(
            (job) =>
              job.state !== 'COMPLETED' &&
              (job.actorUserId === input.userId || soleOrgIds.includes(job.organizationId)),
          )
          .map((job) => job.targetProjectId),
      ].find((projectId) => {
        const project = projectId ? this.projects.get(projectId) : undefined;
        return Boolean(project && !project.deletedAt);
      });
      if (visibleStateMachineTarget) {
        throw Object.assign(new Error('ACCOUNT_PURGE_STATE_MACHINE_TARGET_VISIBLE'), {
          code: 'ACCOUNT_PURGE_STATE_MACHINE_TARGET_VISIBLE',
          statusCode: 409,
        });
      }
      if (
        [...this.remixStorageShares.values()].some(
          (share) => preview.inventory!.bucketProjectIds.includes(share.sourceProjectId) && share.state === 'ACTIVE',
        )
      ) {
        throw Object.assign(new Error('ACCOUNT_PURGE_REMIX_STORAGE_SHARE_ACTIVE'), {
          code: 'ACCOUNT_PURGE_REMIX_STORAGE_SHARE_ACTIVE',
          statusCode: 409,
        });
      }
      const inventory = this.purgePlanInventories.get(planId) ?? structuredClone(preview.inventory!);
      if (!this.purgePlanInventories.has(planId)) this.purgePlanInventories.set(planId, inventory);
      const frozenProjectIds = [...new Set([...inventory.bucketProjectIds, ...inventory.workspaceProjectIds])];
      this.purgeFrozenUsers.add(input.userId);
      for (const organizationId of subjectOrgIds) this.purgeFrozenOrganizations.add(organizationId);
      for (const projectId of frozenProjectIds) this.purgeFrozenProjects.add(projectId);
      this.purgePlanUserIds.add(input.userId);
      for (const projectId of inventory.bucketProjectIds) this.purgePlannedProjectIds.add(projectId);
      for (const projectId of inventory.workspaceProjectIds) {
        const digest = createHash('sha256').update(`${projectId}:${input.userId}`).digest('hex').slice(0, 16);
        this.purgePlannedWorkspaceIds.add(`${projectId}:ws-${digest}`);
      }
      let completed = false;
      let effectStarted = false;
      const lease = {
        planId,
        ownerToken,
        validate: async () => undefined,
        executeEffect: async <T extends Record<string, unknown>>(
          descriptor: { key: string },
          effect: () => Promise<T>,
        ) => {
          const key = `${planId}:${descriptor.key}`;
          const previous = this.purgeEffects.get(key) as T | undefined;
          if (previous) return { executed: false, receipt: previous };
          effectStarted = true;
          this.purgeEffectStartedPlanIds.add(planId);
          const receipt = await effect();
          this.purgeEffects.set(key, receipt);
          return { executed: true, receipt };
        },
      };
      const activeSubscriptions = [...this.subscriptions.values()].filter(
        (subscription) =>
          soleOrgIds.includes(subscription.organizationId) &&
          ['TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID'].includes(subscription.status),
      );

      try {
        for (const subscription of activeSubscriptions) {
          if (!subscription.externalId) continue;
          if (!deps.cancelExternalBilling) {
            throw Object.assign(new Error('ACCOUNT_PURGE_BILLING_CANCELLER_UNAVAILABLE'), {
              code: 'ACCOUNT_PURGE_BILLING_CANCELLER_UNAVAILABLE',
            });
          }
          await lease.executeEffect({ key: `billing-subscription:${subscription.id}` }, async () => {
            const receipt = await deps.cancelExternalBilling!(
              subscription.externalId!,
              `account-purge-${planId}-${subscription.id}`,
            );
            if (!receipt.canceled) {
              throw Object.assign(new Error('ACCOUNT_PURGE_BILLING_CESSATION_UNVERIFIED'), {
                code: 'ACCOUNT_PURGE_BILLING_CESSATION_UNVERIFIED',
              });
            }
            return receipt;
          });
        }
        if (inventory.ownedProjects.length > 0 && !deps.permanentlyDeleteOwnedProject) {
          throw Object.assign(new Error('ACCOUNT_PURGE_PROJECT_DELETER_UNAVAILABLE'), {
            code: 'ACCOUNT_PURGE_PROJECT_DELETER_UNAVAILABLE',
            statusCode: 503,
          });
        }
        const projectDeletionReceipts: ProjectPermanentDeletionReceiptRecord[] = [];
        for (const project of inventory.ownedProjects) {
          const authority: AccountPurgeProjectDeletionAuthority = {
            planId,
            ownerToken,
            userId: input.userId,
            projectId: project.projectId,
            expectedOrganizationId: project.organizationId,
            expectedProjectName: project.projectName,
            expectedOwnershipEpoch: project.ownershipEpoch,
            idempotencyKey: `account-purge:${planId}:${project.projectId}`,
            requestHash: projectPermanentDeletionRequestHash({
              projectId: project.projectId,
              organizationId: project.organizationId,
              actorUserId: input.userId,
              expectedProjectName: project.projectName,
            }),
          };
          this.purgeProjectDeletionAuthorities.set(project.projectId, authority);
          const execution = await lease.executeEffect(
            { key: `project-permanent-delete:${project.projectId}` },
            async () => {
              await deps.permanentlyDeleteOwnedProject!(authority, lease);
              const completedReceipt = this.projectPermanentDeletionReceipts.get(project.projectId);
              if (!completedReceipt) {
                throw Object.assign(new Error('ACCOUNT_PURGE_PROJECT_DELETE_RECEIPT_INVALID'), {
                  code: 'ACCOUNT_PURGE_PROJECT_DELETE_RECEIPT_INVALID',
                  statusCode: 503,
                });
              }
              return {
                projectId: completedReceipt.projectId,
                operationId: completedReceipt.operationId,
                requestHash: completedReceipt.requestHash,
                completedAt: completedReceipt.completedAt,
              };
            },
          );
          const receipt = this.projectPermanentDeletionReceipts.get(project.projectId);
          if (
            this.projects.has(project.projectId) ||
            !receipt ||
            execution.receipt.projectId !== receipt.projectId ||
            execution.receipt.operationId !== receipt.operationId ||
            execution.receipt.requestHash !== receipt.requestHash ||
            execution.receipt.completedAt !== receipt.completedAt ||
            receipt.organizationId !== project.organizationId ||
            receipt.idempotencyKey !== authority.idempotencyKey ||
            receipt.requestHash !== authority.requestHash ||
            receipt.project.id !== project.projectId ||
            receipt.project.organizationId !== project.organizationId ||
            receipt.project.ownershipEpoch !== project.ownershipEpoch ||
            receipt.project.state !== 'PERMANENTLY_DELETED'
          ) {
            throw Object.assign(new Error('ACCOUNT_PURGE_PROJECT_DELETE_RECEIPT_INVALID'), {
              code: 'ACCOUNT_PURGE_PROJECT_DELETE_RECEIPT_INVALID',
              statusCode: 503,
            });
          }
          projectDeletionReceipts.push(receipt);
        }
        const ownedProjectIds = new Set(inventory.ownedProjects.map(({ projectId }) => projectId));
        const residualInventory = {
          ownedProjects: [],
          bucketProjectIds: [],
          workspaceProjectIds: inventory.workspaceProjectIds.filter((projectId) => !ownedProjectIds.has(projectId)),
          localSnapshotObjects: [],
          staticDeploymentIds: [],
          staticArtifactRefs: [],
          staticAliasDeploymentIds: [],
        };
        effectStarted = true;
        this.purgeEffectStartedPlanIds.add(planId);
        const physical = await deps.eraseStorage(residualInventory, lease);
        if (!physical?.verified)
          throw Object.assign(new Error('ACCOUNT_PURGE_PHYSICAL_INCOMPLETE'), {
            code: 'ACCOUNT_PURGE_PHYSICAL_INCOMPLETE',
          });
        const user = this.users.get(input.userId)!;
        const requestedAt = (user.preferences!.accountDeletion as { requestedAt: string }).requestedAt;
        const purgedAt = now();

        for (const job of this.importJobs.values()) {
          if (job.actorUserId !== input.userId && !soleOrgIds.includes(job.organizationId)) continue;
          const reservation = this.importReservations.get(job.id);
          if (job.state === 'COMMITTED' && reservation?.state === 'RESERVED') {
            throw Object.assign(new Error('ACCOUNT_PURGE_IMPORT_LEDGER_STATE_INVALID'), {
              code: 'ACCOUNT_PURGE_IMPORT_LEDGER_STATE_INVALID',
              statusCode: 409,
            });
          }
          if (reservation?.state === 'RESERVED') {
            reservation.state = 'COMPENSATED';
            reservation.debitedCredits = 0;
            reservation.version += 1;
          }
          if (!['COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED'].includes(job.state)) {
            job.state = 'FAILED';
            job.version += 1;
          }
          const target =
            job.state !== 'COMMITTED' && job.targetProjectId ? this.projects.get(job.targetProjectId) : undefined;
          if (target?.deletedAt && ownedProjectIds.has(target.id)) {
            throw Object.assign(new Error('ACCOUNT_PURGE_STATE_MACHINE_TARGET_VISIBLE'), {
              code: 'ACCOUNT_PURGE_STATE_MACHINE_TARGET_VISIBLE',
              statusCode: 409,
            });
          }
          if (job.state !== 'COMMITTED') job.error = appPublicEnglish('ACCOUNT_PURGE_COMPLETED');
          job.actorUserId = undefined;
          job.stagedFiles = undefined;
          job.connectorPreview = undefined;
          job.operationToken = undefined;
          job.operationExpiresAt = undefined;
          job.cleanupTerminalState = undefined;
          job.updatedAt = purgedAt;
        }

        for (const job of this.remixJobs.values()) {
          if (job.actorUserId !== input.userId && !soleOrgIds.includes(job.organizationId)) continue;
          if (!['COMPLETED', 'FAILED'].includes(job.state)) {
            job.state = 'FAILED';
            job.version += 1;
          }
          const target =
            job.state !== 'COMPLETED' && job.targetProjectId ? this.projects.get(job.targetProjectId) : undefined;
          if (target?.deletedAt && ownedProjectIds.has(target.id)) {
            throw Object.assign(new Error('ACCOUNT_PURGE_STATE_MACHINE_TARGET_VISIBLE'), {
              code: 'ACCOUNT_PURGE_STATE_MACHINE_TARGET_VISIBLE',
              statusCode: 409,
            });
          }
          if (job.state !== 'COMPLETED') {
            job.errorCode = 'ACCOUNT_PURGE_COMPLETED';
            job.error = appPublicEnglish('ACCOUNT_PURGE_COMPLETED');
          }
          job.actorUserId = undefined;
          job.operationToken = undefined;
          job.operationExpiresAt = undefined;
          job.cleanupTerminalState = undefined;
          job.updatedAt = purgedAt;
        }

        for (const operation of this.rollbackOperations.values()) {
          const project = this.projects.get(operation.projectId);
          if (operation.actorUserId !== input.userId && !(project && soleOrgIds.includes(project.organizationId))) {
            continue;
          }
          if (operation.status === 'IN_PROGRESS') {
            if (operation.phase === 'DEPLOYMENT_CREATED' && operation.deploymentId) {
              const deployment = this.deployments.get(operation.deploymentId);
              if (deployment && !['READY', 'FAILED', 'CANCELED'].includes(deployment.status)) {
                deployment.status = 'FAILED';
                deployment.url = undefined;
                deployment.previewUrl = undefined;
                deployment.productionUrl = undefined;
                deployment.finishedAt = purgedAt;
                deployment.updatedAt = purgedAt;
              }
            }
            operation.status = 'COMPLETED';
            operation.leaseOwner = undefined;
            operation.leaseExpiresAt = undefined;
            operation.responseStatus = 410;
            operation.responseContentLanguage = 'en';
            operation.responseBody = { code: 'ACCOUNT_PURGE_COMPLETED' };
            operation.completedAt = purgedAt;
            operation.updatedAt = purgedAt;
          }
          operation.actorUserId = undefined;
        }

        for (const [tokenHash, session] of this.sessions)
          if (session.userId === input.userId || session.impersonatedBy === input.userId)
            this.sessions.delete(tokenHash);
        let deletedDeploymentAccessTickets = 0;
        for (const [tokenHash, ticket] of this.deploymentAccessExchangeTickets) {
          if (ticket.userId === input.userId) {
            this.deploymentAccessExchangeTickets.delete(tokenHash);
            deletedDeploymentAccessTickets += 1;
          }
        }
        for (const [membershipId, membership] of this.memberships)
          if (membership.userId === input.userId) this.memberships.delete(membershipId);
        for (const subscription of activeSubscriptions) {
          subscription.status = 'CANCELED';
          subscription.cancelAtPeriodEnd = true;
          subscription.updatedAt = purgedAt;
        }
        user.email = anonymizedEmail(input.userId);
        user.name = undefined;
        user.passwordHash = undefined;
        user.preferences = { accountDeletion: { requestedAt, purgedAt } };
        const proof = buildErasureProof({
          userId: input.userId,
          requestedAt,
          purgedAt,
          classes: [
            { dataClass: 'sessions', action: 'deleted', models: {}, remainingAfterPurge: 0 },
            {
              dataClass: 'auth_tokens',
              action: 'deleted',
              models: { DeploymentAccessExchangeTicket: deletedDeploymentAccessTickets },
              remainingAfterPurge: 0,
            },
            ...physical.classes,
            {
              dataClass: 'projects',
              action: 'deleted',
              models: { Project: inventory.ownedProjects.length },
              evidence: {
                receiptCount: projectDeletionReceipts.length,
                receiptDigest: createHash('sha256')
                  .update(
                    JSON.stringify(
                      projectDeletionReceipts
                        .map(({ projectId, operationId, requestHash, completedAt }) => ({
                          projectId,
                          operationId,
                          requestHash,
                          completedAt,
                        }))
                        .sort((left, right) => left.projectId.localeCompare(right.projectId)),
                    ),
                  )
                  .digest('hex'),
              },
              remainingAfterPurge: 0,
            },
            { dataClass: 'profile', action: 'anonymized', reason: 'tombstone_carries_purgedAt', models: { User: 1 } },
          ],
        });
        this.purgeReceipts.set(input.userId, { planId, purgedAt, proof });
        await this.mutateSystemSettingIds('account.pendingDeletionUserIds', { remove: input.userId });
        completed = true;
        return { outcome: 'purged', planId, proof };
      } finally {
        if (completed || !effectStarted) {
          this.purgeFrozenUsers.delete(input.userId);
          for (const organizationId of subjectOrgIds) this.purgeFrozenOrganizations.delete(organizationId);
          for (const projectId of frozenProjectIds) this.purgeFrozenProjects.delete(projectId);
          this.purgePlanUserIds.delete(input.userId);
          this.purgeEffectStartedPlanIds.delete(planId);
          this.purgePlanInventories.delete(planId);
          for (const projectId of inventory.bucketProjectIds) this.purgePlannedProjectIds.delete(projectId);
          for (const projectId of inventory.workspaceProjectIds) {
            const digest = createHash('sha256').update(`${projectId}:${input.userId}`).digest('hex').slice(0, 16);
            this.purgePlannedWorkspaceIds.delete(`${projectId}:ws-${digest}`);
          }
        }
        for (const project of inventory.ownedProjects) {
          this.purgeProjectDeletionAuthorities.delete(project.projectId);
        }
        const ownedProjectIds = new Set(inventory.ownedProjects.map(({ projectId }) => projectId));
        await deps.releaseWorkspaceBarrier?.(
          {
            ownedProjects: [],
            bucketProjectIds: [],
            workspaceProjectIds: inventory.workspaceProjectIds.filter((projectId) => !ownedProjectIds.has(projectId)),
            localSnapshotObjects: [],
            staticDeploymentIds: [],
            staticArtifactRefs: [],
            staticAliasDeploymentIds: [],
          },
          planId,
          ownerToken,
        );
      }
    });
  }

  async reconcilePurgeFreezes() {
    const scanned = this.purgeFrozenUsers.size + this.purgeFrozenOrganizations.size + this.purgeFrozenProjects.size;
    const protectedPlanIds = new Set(
      [...this.purgeEffects.keys()].flatMap((key) => {
        const separator = key.indexOf(':');
        if (separator <= 0) return [];
        const planId = key.slice(0, separator);
        const userId = planId.startsWith('purge-') ? planId.slice('purge-'.length) : undefined;
        return userId && this.purgePlanUserIds.has(userId) ? [planId] : [];
      }),
    );
    for (const planId of this.purgeEffectStartedPlanIds) protectedPlanIds.add(planId);
    let reconciled = 0;
    for (const userId of [...this.purgeFrozenUsers]) {
      if (protectedPlanIds.has(`purge-${userId}`)) continue;
      this.purgeFrozenUsers.delete(userId);
      this.purgePlanUserIds.delete(userId);
      reconciled += 1;
    }
    if (protectedPlanIds.size === 0) {
      reconciled += this.purgeFrozenOrganizations.size + this.purgeFrozenProjects.size;
      this.purgeFrozenOrganizations.clear();
      this.purgeFrozenProjects.clear();
      this.purgePlannedProjectIds.clear();
      this.purgePlannedWorkspaceIds.clear();
    }
    return { scanned, reconciled, planIds: [...protectedPlanIds].sort() };
  }

  async isObjectStorageProjectPurgeFrozen(projectId: string) {
    return this.purgeFrozenProjects.has(projectId);
  }

  private async withTenantObjectStorageAfterPhysical<T>(
    scope: ProjectPhysicalMutationScope,
    effect: () => Promise<T>,
    options: { allowActiveTargetShare?: boolean } = {},
  ): Promise<T> {
    return this.withSerializedMutation(`object-storage:${scope.projectId}`, async () => {
      await this.assertProjectTenantMutationAllowed(scope);
      if (!options.allowActiveTargetShare && (await this.getRemixStorageShareByTarget(scope.projectId))) {
        throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_SHARED_READ_ONLY')), {
          code: 'SHARED_READ_ONLY',
          statusCode: 409,
        });
      }
      return effect();
    });
  }

  async issueSignedObjectStorageCapability<T extends { expiresAt: string }>(
    command: ObjectStorageCapabilityCommand,
    signer: (authorization: { expiresAt: string }) => Promise<T>,
  ): Promise<T> {
    return this.withProjectPhysicalMutation(command, () =>
      this.issueSignedObjectStorageCapabilityWithinPhysicalAccess(command, signer),
    );
  }

  async issueSignedObjectStorageCapabilityWithinPhysicalAccess<T extends { expiresAt: string }>(
    command: ObjectStorageCapabilityCommand,
    signer: (authorization: { expiresAt: string }) => Promise<T>,
  ): Promise<T> {
    if (assertValidObjectKey(command.objectKey) !== command.objectKey) {
      throw new ObjectStorageError('Object keys must not contain surrounding whitespace', 'INVALID_KEY');
    }
    return this.withTenantObjectStorageAfterPhysical(command, async () => {
      const reservedExpiresAt = new Date(Date.now() + SIGNED_URL_TTL_MS).toISOString();
      const reservedExpiresAtMs = Date.parse(reservedExpiresAt);
      this.objectStorageCapabilityExpiresAt.set(
        command.projectId,
        Math.max(this.objectStorageCapabilityExpiresAt.get(command.projectId) ?? 0, reservedExpiresAtMs),
      );
      const result = await signer({ expiresAt: reservedExpiresAt });
      const expiresAt = Date.parse(result.expiresAt);

      if (!Number.isFinite(expiresAt) || expiresAt > reservedExpiresAtMs) {
        throw Object.assign(new Error('OBJECT_STORAGE_CAPABILITY_EXPIRY_INVALID'), {
          code: 'OBJECT_STORAGE_CAPABILITY_EXPIRY_INVALID',
          statusCode: 502,
        });
      }
      return result;
    });
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
      for (const projectId of objectStorageCommandMutationProjectIds(input.command)) {
        if (await this.getRemixStorageShareByTarget(projectId)) {
          throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_SHARED_READ_ONLY')), {
            code: 'SHARED_READ_ONLY',
            statusCode: 409,
          });
        }
      }
      if (input.command.type !== 'CLONE_PROJECT') {
        const command = await pinObjectStorageCommand(input.storage, input.command);
        return this.executeTenantObjectStorageCommandWithinPhysicalAccess({ ...input, command });
      }

      const transportIntentHash = objectStorageCloneIntentHash(input.command);
      if (input.transportIntentHash && input.transportIntentHash !== transportIntentHash) {
        throw Object.assign(new Error('OBJECT_STORAGE_OPERATION_INTENT_HASH_INVALID'), {
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
        const replay = await replayCommitted();
        if (replay) return replay;
        throw error;
      }

      try {
        return await this.executeTenantObjectStorageCommandWithinPhysicalAccess({
          scopes,
          command,
          storage: input.storage,
          transportIntentHash,
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        });
      } catch (error) {
        const replay = await replayCommitted();
        if (replay) return replay;
        throw error;
      }
    });
  }

  private async executeTenantObjectStorageCommandWithinPhysicalAccess(input: {
    scopes: ProjectPhysicalMutationScope[];
    command: TenantObjectStorageCommand;
    storage: ObjectStorage;
    idempotencyKey?: string;
    transportIntentHash?: string;
  }): Promise<ObjectStorageCommandExecution> {
    if (!input.storage.active) {
      throw new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_BACKEND_REQUIRED'), 'BACKEND_REQUIRED');
    }
    const expectedProjectIds = [...new Set(objectStorageCommandProjectIds(input.command))].sort();
    const scopesByProjectId = new Map(input.scopes.map((scope) => [scope.projectId, scope]));
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

    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          scopes: scopes.map(({ projectId, expectedOrganizationId }) => ({ projectId, expectedOrganizationId })),
          command: objectStorageCommandIdentity(input.command),
        }),
      )
      .digest('hex');
    const receiptKey = input.idempotencyKey
      ? `${scopes.map((scope) => `${scope.projectId}:${scope.expectedOrganizationId}`).join('|')}:${input.idempotencyKey}`
      : id('objcmd');
    const previous = this.objectStorageCommandReceipts.get(receiptKey);
    if (previous) {
      if (previous.requestHash !== requestHash) {
        throw Object.assign(new Error('OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT'), {
          code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT',
          statusCode: 409,
        });
      }
      return previous.execution;
    }

    const retainedSourceError = () =>
      Object.assign(
        new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_SHARED_READ_ONLY'), 'SHARED_SOURCE_RETENTION_ACTIVE'),
        { statusCode: 409 },
      );
    if (input.command.type !== 'ENSURE_BUCKET' && input.command.type !== 'CLONE_PROJECT') {
      const sourceCommand = input.command;
      const sourceShares = [...this.remixStorageShares.values()].filter(
        (share) => share.sourceProjectId === sourceCommand.projectId && share.state === 'ACTIVE',
      );
      if (sourceCommand.type === 'DELETE_BUCKET' && sourceShares.length > 0) throw retainedSourceError();
      for (const share of sourceShares) {
        const inventory = parseObjectStorageInventory(share.sourceInventory);
        if (!inventory) throw retainedSourceError();
        const retained = inventory.objects.some((object) => {
          switch (sourceCommand.type) {
            case 'DELETE_OBJECT':
              return (
                sourceCommand.expectedObjectGeneration !== null &&
                sourceCommand.expectedObjectGeneration !== undefined &&
                object.key === sourceCommand.key &&
                object.generation === sourceCommand.expectedObjectGeneration
              );
            case 'MOVE_OBJECT':
              return object.key === sourceCommand.from && object.generation === sourceCommand.sourceGeneration;
            case 'DELETE_PREFIX':
              return object.key.startsWith(sourceCommand.prefix);
            case 'PUT_OBJECT':
              return object.key === sourceCommand.key;
            default:
              return false;
          }
        });
        if (retained) throw retainedSourceError();
      }
    }

    for (const projectId of objectStorageCommandMutationProjectIds(input.command)) {
      if (await this.getRemixStorageShareByTarget(projectId)) {
        throw new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_SHARED_READ_ONLY'), 'SHARED_READ_ONLY');
      }
    }
    await assertObjectStorageCommandPreconditions(input.storage, input.command);
    const execution = await executeObjectStorageCommand(input.storage, input.command, async () => {
      for (const scope of scopes) await this.assertProjectStorageMutable(scope);
    });
    await verifyObjectStorageCommand(input.storage, input.command, execution);
    this.objectStorageCommandReceipts.set(receiptKey, {
      requestHash,
      ...(input.transportIntentHash ? { transportIntentHash: input.transportIntentHash } : {}),
      execution,
    });
    return execution;
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
    const scopes = [...new Map(input.scopes.map((scope) => [scope.projectId, scope])).values()].sort((left, right) =>
      left.projectId.localeCompare(right.projectId),
    );
    const receiptKey = `${scopes
      .map((scope) => `${scope.projectId}:${scope.expectedOrganizationId}`)
      .join('|')}:${input.idempotencyKey}`;
    const previous = this.objectStorageCommandReceipts.get(receiptKey);
    if (!previous) return undefined;
    if (previous.transportIntentHash !== input.transportIntentHash) {
      throw Object.assign(new Error('OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT'), {
        code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT',
        statusCode: 409,
      });
    }
    return previous.execution;
  }

  async reconcileObjectStorageOperations(): Promise<{
    scanned: number;
    failedSafe: number;
    recovered: number;
    deferred: number;
    quarantined: number;
    replayed: number;
    busy: number;
    operationIds: string[];
  }> {
    return {
      scanned: 0,
      failedSafe: 0,
      recovered: 0,
      deferred: 0,
      quarantined: 0,
      replayed: 0,
      busy: 0,
      operationIds: [],
    };
  }

  async reconcileObjectStorageVersionGc(): Promise<{
    scanned: number;
    claimed: number;
    recovered: number;
    committed: number;
    deferred: number;
    quarantined: number;
    busy: number;
    deletedGenerations: number;
    projectIds: string[];
  }> {
    return {
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
  }

  async assertProjectStorageMutable(
    scope: ProjectPhysicalMutationScope,
    options: {
      allowDeletedProject?: boolean;
      allowPermanentDeletion?: boolean;
      accountPurgeDeletionAuthority?: AccountPurgeProjectDeletionAuthority;
    } = {},
  ) {
    const { projectId, workspaceId } = scope;
    const expectedAuthority = this.purgeProjectDeletionAuthorities.get(projectId);
    const suppliedAuthority = options.accountPurgeDeletionAuthority;
    const ownsPurgeFence =
      expectedAuthority !== undefined &&
      suppliedAuthority !== undefined &&
      JSON.stringify(expectedAuthority) === JSON.stringify(suppliedAuthority);
    if (
      !ownsPurgeFence &&
      (this.purgeFrozenProjects.has(projectId) ||
        this.purgePlannedProjectIds.has(projectId) ||
        (workspaceId ? this.purgePlannedWorkspaceIds.has(`${projectId}:${workspaceId}`) : false))
    ) {
      throw Object.assign(new Error('PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE'), {
        code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE',
        statusCode: 409,
      });
    }

    this.assertExpectedProjectTenant(scope, options);
  }

  async hasPurgeReceipt(userId: string) {
    return this.purgeReceipts.has(userId);
  }

  async findUserByEmail(email: string) {
    return [...this.users.values()].find((user) => user.email === email.toLowerCase());
  }

  async findUserById(userId: string) {
    return this.users.get(userId);
  }

  async touchUserActivity(userId: string, nowMs?: number) {
    const user = this.users.get(userId);

    if (!user) {
      return null;
    }

    const at = new Date(Number.isFinite(nowMs) ? (nowMs as number) : Date.now()).toISOString();
    user.lastActiveAt = at;

    return at;
  }

  async listInactiveUserCandidates(input: { cutoffMs: number; take?: number }) {
    const take = Math.max(1, Math.min(input.take ?? 500, 5000));
    return [...this.users.values()]
      .map((user) => ({
        id: user.id,
        email: user.email,
        lastActiveAtMs: new Date(user.lastActiveAt ?? user.createdAt).getTime(),
      }))
      .filter((entry) => Number.isFinite(entry.lastActiveAtMs) && entry.lastActiveAtMs < input.cutoffMs)
      .sort((a, b) => a.lastActiveAtMs - b.lastActiveAtMs)
      .slice(0, take);
  }

  async createSession(input: {
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
    impersonatedBy?: string;
  }) {
    const subjectUserIds = [input.userId, ...(input.impersonatedBy ? [input.impersonatedBy] : [])];

    return this.withAccountPurgeSubjectLocks(subjectUserIds, async () => {
      if (subjectUserIds.some((userId) => this.isSessionSubjectPurgeFenced(userId))) {
        throw Object.assign(new Error('SESSION_ACCOUNT_PURGE_FENCED'), {
          code: 'SESSION_ACCOUNT_PURGE_FENCED',
          statusCode: 409,
        });
      }

      const session = {
        id: id('session'),
        userId: input.userId,
        tokenHash: hashToken(input.token),
        expiresAt: input.expiresAt.toISOString(),
        createdAt: now(),
        lastActiveAt: now() as string | undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        impersonatedBy: input.impersonatedBy,
      };
      this.sessions.set(session.tokenHash, session);

      return session;
    });
  }

  async findSessionByToken(token: string) {
    const tokenHash = hashToken(token);
    const candidate = this.sessions.get(tokenHash);

    if (!candidate) return undefined;

    const subjectUserIds = [candidate.userId, ...(candidate.impersonatedBy ? [candidate.impersonatedBy] : [])];

    return this.withAccountPurgeSubjectLocks(subjectUserIds, async () => {
      if (subjectUserIds.some((userId) => this.isSessionSubjectPurgeFenced(userId))) return undefined;
      const session = this.sessions.get(tokenHash);

      if (!session || session.revokedAt || new Date(session.expiresAt).getTime() < Date.now()) {
        return undefined;
      }

      if (
        session.userId !== candidate.userId ||
        (session.impersonatedBy ?? null) !== (candidate.impersonatedBy ?? null)
      ) {
        return undefined;
      }

      const lastActiveMs = new Date(session.lastActiveAt ?? session.createdAt).getTime();

      if (isSessionIdleExpired(lastActiveMs, Date.now(), sessionIdleTimeoutMs())) {
        return undefined;
      }

      return session;
    });
  }

  /** Test hook: force touchSession to throw (fail-open-on-write proof). */
  touchSessionShouldThrow = false;

  async touchSession(sessionId: string, nowMs: number, throttleMs = 60_000): Promise<void> {
    if (this.touchSessionShouldThrow) {
      throw new Error('simulated touchSession failure');
    }

    for (const session of this.sessions.values()) {
      if (session.id !== sessionId || session.revokedAt) {
        continue;
      }

      const lastActiveMs = session.lastActiveAt ? new Date(session.lastActiveAt).getTime() : 0;

      if (nowMs - lastActiveMs >= throttleMs) {
        session.lastActiveAt = new Date(nowMs).toISOString();
      }
    }
  }

  async listSessions(userId: string) {
    return [...this.sessions.values()].filter((session) => session.userId === userId && !session.revokedAt);
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = [...this.sessions.values()].find((item) => item.userId === userId && item.id === sessionId);

    if (!session) {
      return false;
    }

    session.revokedAt = now();

    return true;
  }

  async revokeAllSessions(userId: string, exceptSessionId?: string) {
    let revoked = 0;

    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.id !== exceptSessionId && !session.revokedAt) {
        session.revokedAt = now();
        revoked += 1;
      }
    }

    return revoked;
  }

  async markSessionReauthenticated(sessionId: string) {
    const session = [...this.sessions.values()].find((item) => item.id === sessionId);

    if (session) {
      session.lastReauthAt = now();
    }

    return session;
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
    const { ttlMs, ...scope } = input;

    const ticket: RuntimeWebSocketTicketRecord = {
      id: id('runtime-ws-ticket'),
      ...scope,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      createdAt: now(),
    };
    this.runtimeWebSocketTickets.set(input.tokenHash, ticket);

    return ticket;
  }

  async consumeRuntimeWebSocketTicket(input: {
    tokenHash: string;
    workspaceId: string;
    endpoint: RuntimeWebSocketTicketRecord['endpoint'];
  }) {
    const ticket = this.runtimeWebSocketTickets.get(input.tokenHash);

    if (
      !ticket ||
      ticket.consumedAt ||
      ticket.workspaceId !== input.workspaceId ||
      ticket.endpoint !== input.endpoint ||
      new Date(ticket.expiresAt).getTime() <= Date.now()
    ) {
      return undefined;
    }

    ticket.consumedAt = now();

    return ticket;
  }

  async createEmailVerification(input: { userId: string; token: string; expiresAt: Date; email?: string }) {
    this.emailVerifications.set(hashToken(input.token), {
      userId: input.userId,
      tokenHash: hashToken(input.token),
      expiresAt: input.expiresAt.toISOString(),
      email: input.email,
    });
  }

  async consumeEmailVerification(token: string) {
    const record = this.emailVerifications.get(hashToken(token));

    if (!record || record.usedAt || new Date(record.expiresAt).getTime() < Date.now()) {
      return undefined;
    }

    // Mirror prisma-store: a token only verifies the user's CURRENT email.
    if (record.email) {
      const tokenUser = this.users.get(record.userId);

      if (!tokenUser || tokenUser.email.toLowerCase() !== record.email.toLowerCase()) {
        return undefined;
      }
    }

    record.usedAt = now();

    return this.updateUser({ userId: record.userId, emailVerifiedAt: now() });
  }

  async createPasswordReset(input: { userId: string; token: string; expiresAt: Date }) {
    this.passwordResets.set(hashToken(input.token), {
      userId: input.userId,
      tokenHash: hashToken(input.token),
      expiresAt: input.expiresAt.toISOString(),
    });
  }

  async consumePasswordReset(token: string, passwordHash: string) {
    const record = this.passwordResets.get(hashToken(token));

    if (!record || record.usedAt || new Date(record.expiresAt).getTime() < Date.now()) {
      return undefined;
    }

    record.usedAt = now();

    return this.updateUser({ userId: record.userId, passwordHash });
  }

  async setRecoveryCodes(userId: string, codeHashes: string[]) {
    for (const [idValue, record] of this.recoveryCodes.entries()) {
      if (record.userId === userId) {
        this.recoveryCodes.delete(idValue);
      }
    }

    const records = codeHashes.map((codeHash) => ({ id: id('recovery'), userId, codeHash, createdAt: now() }));

    for (const record of records) {
      this.recoveryCodes.set(record.id, record);
    }

    return records;
  }

  async consumeRecoveryCode(userId: string, codeHash: string) {
    const record = [...this.recoveryCodes.values()].find(
      (item) => item.userId === userId && item.codeHash === codeHash && !item.usedAt,
    );

    if (!record) {
      return false;
    }

    record.usedAt = now();

    return true;
  }

  async countUnusedRecoveryCodes(userId: string) {
    return [...this.recoveryCodes.values()].filter((item) => item.userId === userId && !item.usedAt).length;
  }

  private loginLockouts = new Map<string, LoginLockoutState>();
  /** Test hook: force getLoginLockout/recordFailedLogin to throw (fail-open proof). */
  loginLockoutShouldThrow = false;

  async getLoginLockout(userId: string): Promise<LoginLockoutState | undefined> {
    if (this.loginLockoutShouldThrow) {
      throw new Error('simulated lockout store outage');
    }

    return this.loginLockouts.get(userId);
  }

  async recordFailedLogin(userId: string, nowMs: number, config: LoginThrottleConfig): Promise<LoginLockoutState> {
    if (this.loginLockoutShouldThrow) {
      throw new Error('simulated lockout store outage');
    }

    const next = nextStateOnFailure(this.loginLockouts.get(userId) ?? CLEARED_LOCKOUT, nowMs, config);
    this.loginLockouts.set(userId, next);

    return next;
  }

  async clearLoginLockout(userId: string): Promise<void> {
    this.loginLockouts.delete(userId);
  }

  async createOrganization(input: { name: string; slug: string; ownerUserId: string }) {
    const org = { id: id('org'), slug: input.slug || slugify(input.name), name: input.name, createdAt: now() };
    this.organizations.set(org.id, org);
    await this.addMember({ organizationId: org.id, userId: input.ownerUserId, roleKey: 'owner' });

    return org;
  }

  async listOrganizations(userId: string) {
    const orgIds = [...this.memberships.values()]
      .filter((member) => member.userId === userId && member.state === 'ACTIVE')
      .map((member) => member.organizationId);

    return orgIds.map((orgId) => this.organizations.get(orgId)).filter(Boolean) as OrganizationRecord[];
  }

  async getOrganization(id: string) {
    return this.organizations.get(id);
  }

  async setOrganizationBillingEmail(organizationId: string, email: string | null) {
    const organization = this.organizations.get(organizationId);

    if (!organization) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    organization.billingEmail = email ?? undefined;

    return organization;
  }

  async addMember(input: { organizationId: string; userId: string; roleKey: string; invitedByUserId?: string }) {
    const existing = await this.getMembership(input.userId, input.organizationId);

    if (existing) {
      existing.roleKey = input.roleKey;
      existing.state = 'ACTIVE';

      if (input.invitedByUserId) {
        existing.invitedByUserId = input.invitedByUserId;
      }

      return existing;
    }

    const member: MembershipRecord = {
      id: id('member'),
      ...input,
      state: 'ACTIVE',
      joinedAt: now(),
    };
    this.memberships.set(member.id, member);

    return member;
  }

  async getMembership(userId: string, organizationId: string) {
    return [...this.memberships.values()].find(
      (member) => member.userId === userId && member.organizationId === organizationId && member.state === 'ACTIVE',
    );
  }

  async listMembers(organizationId: string) {
    /*
     * Mirror the real store: listMembers joins the user row so userName/userEmail
     * are populated (single-record paths leave them undefined). Callers rely on
     * userEmail (e.g. the invite ALREADY_MEMBER guard).
     */
    return [...this.memberships.values()]
      .filter((member) => member.organizationId === organizationId)
      .filter((member) => member.state === 'ACTIVE')
      .map((member) => {
        const user = this.users.get(member.userId);

        return { ...member, userName: user?.name, userEmail: user?.email };
      });
  }

  async removeMember(organizationId: string, userId: string) {
    const membership = await this.getMembership(userId, organizationId);

    if (!membership) {
      return undefined;
    }

    this.memberships.delete(membership.id);

    for (const [memberId, groupMember] of this.collaborationGroupMembers) {
      if (groupMember.membershipId === membership.id) {
        this.collaborationGroupMembers.delete(memberId);
      }
    }

    for (const [grantId, grant] of this.resourceAccessGrants) {
      if (
        grant.organizationId === organizationId &&
        grant.subjectType === 'USER' &&
        grant.subjectUserId === userId &&
        grant.status !== 'REVOKED'
      ) {
        this.resourceAccessGrants.set(grantId, {
          ...grant,
          status: 'REVOKED',
          revokedAt: now(),
          revocationReason: 'ORGANIZATION_MEMBERSHIP_REMOVED',
          updatedAt: now(),
        });
      }
    }

    return membership;
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
    const createdAt = now();

    const project: ProjectRecord = {
      id: id('project'),
      organizationId: input.organizationId,
      ownershipEpoch: 0,
      name: input.name,
      slug: input.slug || slugify(input.name),
      description: input.description,
      sourceType: input.sourceType ?? 'blank',
      templateName: input.templateName,
      gitRepositoryUrl: input.gitRepositoryUrl,
      gitDefaultBranch: input.gitDefaultBranch,
      persistentVolumeClaim: `pvc-${input.organizationId}-${slugify(input.name)}`,
      createdAt,
      updatedAt: createdAt,
    };
    const manifest = input.initialManifest
      ? projectManifestForClone(input.initialManifest, project.id, input.manifestCloneMode)
      : createDefaultProjectManifest(project.id);
    this.projects.set(project.id, project);
    this.projectManifestRevisions.set(project.id, [
      {
        id: id('project_manifest'),
        projectId: project.id,
        schemaVersion: manifest.schemaVersion,
        manifestVersion: manifest.manifestVersion,
        digest: projectManifestDigest(manifest),
        manifest,
        createdAt,
      },
    ]);

    return project;
  }

  async getProject(id: string) {
    return this.projects.get(id);
  }

  async getProjectBySlugs(input: { organizationSlug: string; projectSlug: string }) {
    const organization = [...this.organizations.values()].find((org) => org.slug === input.organizationSlug);

    if (!organization) {
      return undefined;
    }

    return [...this.projects.values()].find(
      (project) =>
        project.organizationId === organization.id && project.slug === input.projectSlug && !project.deletedAt,
    );
  }

  async updateProject(input: {
    projectId: string;
    expectedOrganizationId: string;
    name?: string;
    description?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
  }) {
    return this.withProjectTenantMutation(input, async () => {
      const project = this.assertExpectedProjectTenant(input);

      Object.assign(project, {
        name: input.name ?? project.name,
        description: input.description ?? project.description,
        gitRepositoryUrl: input.gitRepositoryUrl ?? project.gitRepositoryUrl,
        gitDefaultBranch: input.gitDefaultBranch ?? project.gitDefaultBranch,
        updatedAt: now(),
      });

      return project;
    });
  }

  readonly projectSlugRedirects: Array<{ projectId: string; oldSlug: string; expiresAt: Date }> = [];

  async renameProjectSlug(input: {
    projectId: string;
    expectedOrganizationId: string;
    newSlug: string;
    redirectTtlDays?: number;
  }) {
    return this.withProjectTenantMutation(input, async () => {
      const project = this.assertExpectedProjectTenant(input);

      if (project.slug === input.newSlug) {
        return project;
      }

      const clash = [...this.projects.values()].some(
        (candidate) =>
          candidate.organizationId === project.organizationId &&
          candidate.slug === input.newSlug &&
          candidate.id !== project.id,
      );

      if (clash) {
        throw Object.assign(new Error('A project with this URL slug already exists in this organization.'), {
          statusCode: 409,
          code: 'PROJECT_SLUG_TAKEN',
        });
      }

      const ttlDays = input.redirectTtlDays ?? 30;

      if (!Number.isSafeInteger(ttlDays) || ttlDays < 1 || ttlDays > 10 * 365) {
        throw Object.assign(new TypeError('PROJECT_SLUG_REDIRECT_TTL_INVALID'), {
          code: 'PROJECT_SLUG_REDIRECT_TTL_INVALID',
          statusCode: 400,
        });
      }

      const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

      const existing = this.projectSlugRedirects.find(
        (row) => row.projectId === project.id && row.oldSlug === project.slug,
      );

      if (existing) {
        existing.expiresAt = expiresAt;
      } else {
        this.projectSlugRedirects.push({ projectId: project.id, oldSlug: project.slug, expiresAt });
      }

      // Drop a self-redirect if renaming back to a previously-used slug.
      for (let i = this.projectSlugRedirects.length - 1; i >= 0; i -= 1) {
        const row = this.projectSlugRedirects[i];

        if (row.projectId === project.id && row.oldSlug === input.newSlug) {
          this.projectSlugRedirects.splice(i, 1);
        }
      }

      project.slug = input.newSlug;
      project.updatedAt = now();

      return project;
    });
  }

  async resolveProjectSlugRedirect(input: { organizationSlug: string; oldSlug: string; now?: Date }) {
    const organization = [...this.organizations.values()].find((org) => org.slug === input.organizationSlug);

    if (!organization) {
      return undefined;
    }

    const cutoff = input.now ?? new Date();

    const match = this.projectSlugRedirects.find((row) => {
      if (row.oldSlug !== input.oldSlug || row.expiresAt <= cutoff) {
        return false;
      }

      const project = this.projects.get(row.projectId);

      return Boolean(project && !project.deletedAt && project.organizationId === organization.id);
    });

    return match ? this.projects.get(match.projectId) : undefined;
  }

  async listProjects(organizationId: string, options: { includeArchived?: boolean } = {}) {
    const partialTargets = new Set(
      [...this.remixJobs.values()]
        .filter(
          (job) =>
            job.organizationId === organizationId &&
            job.targetProjectId &&
            !['COMPLETED', 'FAILED'].includes(job.state),
        )
        .map((job) => job.targetProjectId!),
    );

    return [...this.projects.values()].filter(
      (project) =>
        project.organizationId === organizationId &&
        (options.includeArchived ? !partialTargets.has(project.id) : !project.deletedAt),
    );
  }

  async countProjects(organizationId: string, options: { since?: Date } = {}) {
    const sinceMs = options.since?.getTime();

    const visible = (await this.listProjects(organizationId)).filter(
      (project) => sinceMs === undefined || new Date(project.createdAt).getTime() >= sinceMs,
    );
    const partialTargetIds = new Set([
      ...[...this.remixJobs.values()]
        .filter(
          (job) =>
            job.organizationId === organizationId &&
            job.targetProjectId &&
            !['COMPLETED', 'FAILED'].includes(job.state),
        )
        .map((job) => job.targetProjectId!),
      ...[...this.importJobs.values()]
        .filter(
          (job) =>
            job.organizationId === organizationId &&
            job.targetProjectId &&
            !['COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED'].includes(job.state),
        )
        .map((job) => job.targetProjectId!),
    ]);
    const partial = [...partialTargetIds].filter((projectId) => {
      const project = this.projects.get(projectId);
      return (
        project?.organizationId === organizationId &&
        Boolean(project.deletedAt) &&
        (sinceMs === undefined || new Date(project.createdAt).getTime() >= sinceMs)
      );
    }).length;

    return visible.length + partial;
  }

  async countOrganizationActiveStrikes(organizationId: string, nowMs: number) {
    const memberUserIds = new Set(
      [...this.memberships.values()]
        .filter((membership) => membership.organizationId === organizationId)
        .map((membership) => membership.userId),
    );

    return [...memberUserIds].reduce(
      (total, userId) => total + countActiveModerationStrikes(this.users.get(userId)?.preferences, nowMs),
      0,
    );
  }

  async countRecentSevereAbuseEvents(organizationId: string, since: Date) {
    const sinceMs = since.getTime();

    if (!organizationId || !Number.isFinite(sinceMs)) {
      throw new TypeError('TENANT_GUARDRAIL_ABUSE_COUNTER_CONTEXT_INVALID');
    }

    return [...this.abuseEvents.values()].filter((event) => {
      if (
        event.organizationId !== organizationId ||
        !['high', 'critical'].includes(event.severity) ||
        event.disposition === 'dismissed'
      ) {
        return false;
      }

      const createdAtMs = Date.parse(event.createdAt);

      /* Malformed authoritative timestamps are suspicious and demote. */
      return !Number.isFinite(createdAtMs) || createdAtMs >= sinceMs;
    }).length;
  }

  newsletterSubscribers = new Map<string, { email: string; source: string; unsubscribedAt: string | null }>();

  async subscribeNewsletter(input: { email: string; source?: string }) {
    const email = input.email.trim().toLowerCase();
    const existing = this.newsletterSubscribers.get(email);

    this.newsletterSubscribers.set(email, {
      email,
      source: existing?.source ?? input.source ?? 'footer',
      unsubscribedAt: null,
    });

    return { alreadySubscribed: Boolean(existing && !existing.unsubscribedAt) };
  }

  contactRequests = new Map<string, ContactRequestRecord>();

  async createContactRequest(input: {
    email: string;
    name?: string;
    company: string;
    teamSize?: string;
    message: string;
    pagePath?: string;
  }): Promise<ContactRequestRecord> {
    const record: ContactRequestRecord = {
      id: id('contact'),
      email: input.email.trim().toLowerCase(),
      name: input.name,
      company: input.company,
      teamSize: input.teamSize,
      message: input.message,
      pagePath: input.pagePath,
      createdAt: now(),
    };
    this.contactRequests.set(record.id, record);

    return record;
  }

  async softDeleteProject(input: ProjectPhysicalMutationScope) {
    return this.withProjectTenantMutation(input, async () => {
      if (
        [...this.deployments.values()].some(
          (deployment) =>
            deployment.projectId === input.projectId &&
            (deployment.runtimeKind === 'reserved-vm' || Boolean(deployment.persistentStorageClaim)),
        ) ||
        [...this.reservedVmOperations.values()].some(
          (operation) => operation.projectId === input.projectId && ['PENDING', 'APPLYING'].includes(operation.status),
        )
      ) {
        throw Object.assign(new Error('PROJECT_RESERVED_VM_DECOMMISSION_REQUIRED'), {
          code: 'PROJECT_RESERVED_VM_DECOMMISSION_REQUIRED',
          statusCode: 409,
        });
      }
      const project = this.assertExpectedProjectTenant(input);
      project.deletedAt = now();
      project.updatedAt = now();

      return project;
    });
  }

  async restoreProject(input: ProjectPhysicalMutationScope) {
    return this.withProjectTenantMutation(
      input,
      async () => {
        const project = this.assertExpectedProjectTenant(input, { allowDeletedProject: true });
        project.deletedAt = undefined;
        project.updatedAt = now();

        return project;
      },
      { allowDeletedProject: true },
    );
  }

  private assertProjectStaticErasureFrozen(projectId: string) {
    const project = this.projects.get(projectId);
    if (!project?.permanentDeletionStartedAt) {
      throw Object.assign(new Error('PROJECT_STATIC_ERASURE_AUTHORITY_UNAVAILABLE'), {
        code: 'PROJECT_STATIC_ERASURE_AUTHORITY_UNAVAILABLE',
        statusCode: 503,
      });
    }
    return project;
  }

  async resolveProjectStaticErasureInventory(projectId: string): Promise<ProjectStaticErasureInventory> {
    this.assertProjectStaticErasureFrozen(projectId);
    const deploymentIds = new Set(
      [...this.deployments.values()]
        .filter((deployment) => deployment.projectId === projectId && deployment.provider === 'static')
        .map((deployment) => deployment.id),
    );
    const artifactRefs = new Set<string>();

    for (const manifest of this.releaseManifests) {
      if (manifest.projectId !== projectId || manifest.artifactKind !== 'static-snapshot') continue;
      deploymentIds.add(manifest.deploymentId);
      if (/^static-artifacts\/sha256\/[a-f0-9]{64}$/u.test(manifest.artifactRef)) {
        artifactRefs.add(manifest.artifactRef);
      }
    }

    return {
      projectId,
      deploymentIds: [...deploymentIds].sort(),
      artifacts: [...artifactRefs]
        .sort()
        .map((artifactRef) => this.staticArtifactAuthority(projectId, artifactRef))
        .filter((artifact): artifact is ProjectStaticArtifactAuthority => artifact !== undefined),
    };
  }

  private staticArtifactAuthority(projectId: string, artifactRef: string): ProjectStaticArtifactAuthority | undefined {
    const matching = this.releaseManifests.filter(
      (manifest) => manifest.artifactKind === 'static-snapshot' && manifest.artifactRef === artifactRef,
    );
    const projectReferenceCount = matching.filter((manifest) => manifest.projectId === projectId).length;
    if (projectReferenceCount === 0) return undefined;
    return {
      artifactRef,
      projectReferenceCount,
      otherReferenceCount: matching.length - projectReferenceCount,
    };
  }

  async resolveProjectStaticArtifactAuthority(
    projectId: string,
    artifactRef: string,
  ): Promise<ProjectStaticArtifactAuthority | undefined> {
    this.assertProjectStaticErasureFrozen(projectId);
    if (!/^static-artifacts\/sha256\/[a-f0-9]{64}$/u.test(artifactRef)) {
      throw Object.assign(new Error('PROJECT_STATIC_ERASURE_ARTIFACT_REF_INVALID'), {
        code: 'PROJECT_STATIC_ERASURE_ARTIFACT_REF_INVALID',
        statusCode: 400,
      });
    }
    return this.staticArtifactAuthority(projectId, artifactRef);
  }

  async getProjectPermanentDeletionReceiptIdentity(projectId: string) {
    const receipt = this.projectPermanentDeletionReceipts.get(projectId);
    const expectedProjectNameHash = this.#projectPermanentDeletionNameHashes.get(projectId);
    if (!receipt || !expectedProjectNameHash) return undefined;
    return {
      projectId: receipt.projectId,
      organizationId: receipt.organizationId,
      idempotencyKey: receipt.idempotencyKey,
      requestHash: receipt.requestHash,
      expectedProjectNameHash,
    };
  }

  async replayProjectPermanentDeletion(input: {
    projectId: string;
    expectedOrganizationId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<ProjectPermanentDeletionResult | undefined> {
    const receipt = this.projectPermanentDeletionReceipts.get(input.projectId);
    if (!receipt) return undefined;
    if (receipt.organizationId !== input.expectedOrganizationId) {
      throw Object.assign(new Error('OBJECT_STORAGE_OPERATION_RECEIPT_NOT_FOUND'), {
        code: 'OBJECT_STORAGE_OPERATION_RECEIPT_NOT_FOUND',
        statusCode: 404,
      });
    }
    if (receipt.idempotencyKey !== input.idempotencyKey || receipt.requestHash !== input.requestHash) {
      throw Object.assign(new Error('OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT'), {
        code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT',
        statusCode: 409,
      });
    }
    return { ...receipt, project: { ...receipt.project }, proof: structuredClone(receipt.proof), replayed: true };
  }

  async hardDeleteProject(
    input: ProjectPhysicalMutationScope & {
      expectedProjectName: string;
      idempotencyKey: string;
      requestHash: string;
      actorUserId: string;
      ipAddress?: string;
      accountPurgeDeletionAuthority?: AccountPurgeProjectDeletionAuthority;
      preflightPhysicalErasure: () => Promise<ObjectStorageStaticErasurePlan>;
      databaseErasureConfiguration: ProjectDatabaseErasureConfiguration;
      purgeManagedDatabases: (
        plan: ProjectDatabaseErasurePlan,
        fence: ProjectDatabaseErasureFence,
        lease: ObjectStorageOperationLease,
      ) => Promise<ProjectDatabaseErasureEffects>;
      verifyManagedDatabases: (
        plan: ProjectDatabaseErasurePlan,
        fence: ProjectDatabaseErasureFence,
        lease: ObjectStorageOperationLease,
        effects: ProjectDatabaseErasureEffects,
      ) => Promise<ProjectDatabaseErasureReceipt>;
      erasePhysical: (assertLease: () => Promise<void>, lease: ObjectStorageOperationLease) => Promise<void>;
      verifyPhysicalAbsence: (
        assertLease: () => Promise<void>,
        lease: ObjectStorageOperationLease,
      ) => Promise<ObjectStorageVerification>;
    },
  ): Promise<ProjectPermanentDeletionResult> {
    const expectedRequestHash = projectPermanentDeletionRequestHash({
      projectId: input.projectId,
      organizationId: input.expectedOrganizationId,
      actorUserId: input.actorUserId,
      expectedProjectName: input.expectedProjectName,
    });
    if (input.requestHash !== expectedRequestHash) {
      throw Object.assign(new Error('PROJECT_PERMANENT_DELETION_REQUEST_HASH_MISMATCH'), {
        code: 'PROJECT_PERMANENT_DELETION_REQUEST_HASH_MISMATCH',
        statusCode: 409,
      });
    }

    const existing = await this.replayProjectPermanentDeletion({
      projectId: input.projectId,
      expectedOrganizationId: input.expectedOrganizationId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
    });
    if (existing) return existing;

    return this.withProjectTenantMutation(
      input,
      async () => {
        if (
          [...this.remixStorageShares.values()].some(
            (share) => share.sourceProjectId === input.projectId && share.state === 'ACTIVE',
          )
        ) {
          throw Object.assign(
            new ObjectStorageError(
              appPublicEnglish('OBJECT_STORAGE_SHARED_READ_ONLY'),
              'SHARED_SOURCE_RETENTION_ACTIVE',
            ),
            { statusCode: 409 },
          );
        }
        if (
          [...this.deployments.values()].some(
            (deployment) =>
              deployment.projectId === input.projectId &&
              (deployment.runtimeKind === 'reserved-vm' || Boolean(deployment.persistentStorageClaim)),
          ) ||
          [...this.reservedVmOperations.values()].some(
            (operation) =>
              operation.projectId === input.projectId && ['PENDING', 'APPLYING'].includes(operation.status),
          )
        ) {
          throw Object.assign(new Error('PROJECT_RESERVED_VM_DECOMMISSION_REQUIRED'), {
            code: 'PROJECT_RESERVED_VM_DECOMMISSION_REQUIRED',
            statusCode: 409,
          });
        }
        const project = this.assertExpectedProjectTenant(input, {
          allowDeletedProject: true,
          allowPermanentDeletion: true,
        });
        if (project.name !== input.expectedProjectName) {
          throw Object.assign(new Error(appPublicEnglish('PROJECT_NAME_MISMATCH')), {
            code: 'PROJECT_NAME_MISMATCH',
            statusCode: 409,
          });
        }
        if (
          input.accountPurgeDeletionAuthority &&
          project.ownershipEpoch !== input.accountPurgeDeletionAuthority.expectedOwnershipEpoch
        ) {
          throw Object.assign(new Error('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION'), {
            code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
            statusCode: 409,
          });
        }
        const priorPermanentDeletionStartedAt = project.permanentDeletionStartedAt;
        const priorDeletedAt = project.deletedAt;
        project.permanentDeletionStartedAt ??= now();
        project.deletedAt ??= now();
        project.updatedAt = now();

        const assertLease = async () => {
          await this.assertProjectStorageMutable(input, {
            allowDeletedProject: true,
            allowPermanentDeletion: true,
            ...(input.accountPurgeDeletionAuthority
              ? { accountPurgeDeletionAuthority: input.accountPurgeDeletionAuthority }
              : {}),
          });
        };
        const lease: ObjectStorageOperationLease = {
          operationId: `test-permanent-delete:${input.projectId}`,
          ownerToken: `test-owner:${input.idempotencyKey}`,
          fencingToken: 1n,
          requestHash: input.requestHash,
          scopeHash: createHash('sha256').update(`${input.projectId}:${input.expectedOrganizationId}`).digest('hex'),
          leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
        let staticArtifactPlan: ObjectStorageStaticErasurePlan;
        try {
          staticArtifactPlan = await input.preflightPhysicalErasure();
          parseObjectStorageStaticArtifactSummary(staticArtifactPlan.summary);
          await assertLease();
        } catch (error) {
          project.permanentDeletionStartedAt = priorPermanentDeletionStartedAt;
          project.deletedAt = priorDeletedAt;
          project.updatedAt = now();
          throw error;
        }
        const instances = [...this.databaseInstances.values()].filter(
          (instance) => instance.projectId === input.projectId,
        );
        const databasePlan = buildProjectDatabaseErasurePlan({
          schemaVersion: 1,
          operationId: lease.operationId,
          projectId: input.projectId,
          organizationId: input.expectedOrganizationId,
          capturedAt: now(),
          ...input.databaseErasureConfiguration,
          instances: instances.map((instance) => ({
            id: instance.id,
            projectId: instance.projectId,
            organizationId: instance.organizationId,
            environment: instance.environment,
            status: instance.status,
            engine: instance.engine,
            region: instance.region,
            sizeBytes: instance.sizeBytes,
            retentionDays: instance.retentionDays,
            pitrEnabled: instance.pitrEnabled,
            snapshots: [...this.databaseSnapshots.values()]
              .filter((snapshot) => snapshot.databaseInstanceId === instance.id)
              .map((snapshot) => ({
                id: snapshot.id,
                kind: snapshot.kind,
                lsn: snapshot.lsn,
                storageKey: snapshot.storageKey,
                sizeBytes: snapshot.sizeBytes,
                createdAt: snapshot.createdAt,
                expiresAt: snapshot.expiresAt,
              })),
            restores: [...this.databaseRestores.values()]
              .filter((restore) => restore.databaseInstanceId === instance.id)
              .map((restore) => ({
                id: restore.id,
                snapshotId: restore.snapshotId,
                targetTimestamp: restore.targetTimestamp,
                status: restore.status,
                createdAt: restore.createdAt,
                startedAt: restore.startedAt,
                completedAt: restore.completedAt,
              })),
          })),
        });
        const databaseFence: ProjectDatabaseErasureFence = {
          assertActive: async (context) => {
            if (
              context.operationId !== databasePlan.operationId ||
              context.inventorySha256 !== databasePlan.inventorySha256
            ) {
              throw new Error('PROJECT_DATABASE_ERASURE_SCOPE_MISMATCH');
            }
            await assertLease();
          },
          checkpoint: async () => undefined,
        };
        const databaseEffects = await input.purgeManagedDatabases(databasePlan, databaseFence, lease);
        await input.erasePhysical(assertLease, lease);
        await assertLease();
        const databaseReceipt = await input.verifyManagedDatabases(databasePlan, databaseFence, lease, databaseEffects);
        const physicalProof = await input.verifyPhysicalAbsence(assertLease, lease);
        const proof: ObjectStorageVerification = {
          ...physicalProof,
          evidence: { ...physicalProof.evidence, managedDatabase: databaseReceipt },
        };
        assertPermanentDeletionProof(proof, staticArtifactPlan.summary);
        const workspaceManager = proof.evidence.workspaceManager as Record<string, unknown>;
        if (
          workspaceManager.projectId !== input.projectId ||
          workspaceManager.organizationId !== input.expectedOrganizationId
        ) {
          throw Object.assign(new Error('OBJECT_STORAGE_OPERATION_PERMANENT_ERASURE_PROOF_INCOMPLETE'), {
            code: 'OBJECT_STORAGE_OPERATION_PERMANENT_ERASURE_PROOF_INCOMPLETE',
            statusCode: 409,
          });
        }
        this.assertExpectedProjectTenant(input, {
          allowDeletedProject: true,
          allowPermanentDeletion: true,
        });

        const completedAt = now();
        const projectRecordHash = createHash('sha256')
          .update(JSON.stringify({ ...project }))
          .digest('hex');
        const receipt: ProjectPermanentDeletionReceiptRecord = {
          projectId: project.id,
          organizationId: project.organizationId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          operationId: id('object_storage_operation'),
          project: {
            id: project.id,
            organizationId: project.organizationId,
            ownershipEpoch: project.ownershipEpoch,
            projectRecordHash,
            state: 'PERMANENTLY_DELETED',
            permanentDeletionStartedAt: project.permanentDeletionStartedAt,
            deletedAt: project.deletedAt,
          },
          proof: { ...structuredClone(proof), verifiedAt: completedAt },
          completedAt,
        };
        this.projectPermanentDeletionReceipts.set(project.id, receipt);
        this.#projectPermanentDeletionNameHashes.set(
          project.id,
          createHash('sha256').update(input.expectedProjectName).digest('hex'),
        );
        this.auditLogs.push({
          id: id('audit'),
          organizationId: project.organizationId,
          actorUserId: input.actorUserId,
          action: 'project.hard_delete',
          resourceType: 'project',
          resourceId: project.id,
          metadata: redactAuditMetadata({ operationId: receipt.operationId, idempotencyKey: input.idempotencyKey }),
          ipAddress: input.ipAddress,
          createdAt: completedAt,
        });
        this.projects.delete(input.projectId);
        this.projectManifestRevisions.delete(input.projectId);

        return { ...receipt, project: { ...receipt.project }, proof: structuredClone(receipt.proof), replayed: false };
      },
      {
        allowDeletedProject: true,
        allowPermanentDeletion: true,
        ...(input.accountPurgeDeletionAuthority
          ? { accountPurgeDeletionAuthority: input.accountPurgeDeletionAuthority }
          : {}),
      },
    );
  }

  async transferProject(input: {
    projectId: string;
    expectedOrganizationId: string;
    expectedOwnershipEpoch: number;
    targetOrganizationId: string;
    idempotencyKey: string;
    actorUserId?: string;
    ipAddress?: string;
    assertExternalStorageDetached: () => Promise<void>;
    validateTargetAdmission: () => Promise<void>;
  }) {
    if (!Number.isSafeInteger(input.expectedOwnershipEpoch) || input.expectedOwnershipEpoch < 0) {
      throw Object.assign(new Error('PROJECT_TRANSFER_OWNERSHIP_EPOCH_INVALID'), {
        code: 'PROJECT_TRANSFER_OWNERSHIP_EPOCH_INVALID',
        statusCode: 400,
      });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(input.idempotencyKey)) {
      throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_IDEMPOTENCY_KEY_REQUIRED')), {
        code: 'OBJECT_STORAGE_IDEMPOTENCY_KEY_REQUIRED',
        statusCode: 400,
      });
    }

    const replayExactReceipt = () => {
      const exactReplay = this.projectTransferReceipts.find(
        (receipt) =>
          receipt.projectId === input.projectId &&
          receipt.ownershipEpoch === input.expectedOwnershipEpoch &&
          receipt.idempotencyKey === input.idempotencyKey,
      );
      if (!exactReplay) return undefined;
      if (exactReplay.targetOrganizationId !== input.targetOrganizationId) {
        throw Object.assign(new Error('OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT'), {
          code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT',
          statusCode: 409,
        });
      }
      return { ...exactReplay.project };
    };

    const exactReplay = replayExactReceipt();
    if (exactReplay) return exactReplay;

    if (
      this.projectTransferReceipts.some(
        (receipt) =>
          receipt.projectId === input.projectId &&
          receipt.sourceOrganizationId === input.expectedOrganizationId &&
          receipt.idempotencyKey === input.idempotencyKey,
      )
    ) {
      throw Object.assign(new Error('OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT'), {
        code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT',
        statusCode: 409,
      });
    }

    const transferAttempt = this.withProjectTenantMutation(input, async () => {
      const current = this.assertExpectedProjectTenant(input);

      if (current.ownershipEpoch !== input.expectedOwnershipEpoch) {
        throw projectOrganizationChangedError();
      }

      if (current.organizationId === input.targetOrganizationId) {
        return { ...current };
      }

      /* Match Prisma: provider preflight is outside the object-storage DB lock. */
      await input.assertExternalStorageDetached();

      return this.withSerializedMutation(`projects:${input.targetOrganizationId}`, async () => {
        await input.validateTargetAdmission();
        return this.withTenantObjectStorageAfterPhysical(
          input,
          async () => {
            const project = this.assertExpectedProjectTenant(input);

            if (project.ownershipEpoch !== input.expectedOwnershipEpoch) {
              throw projectOrganizationChangedError();
            }

            if ((this.objectStorageCapabilityExpiresAt.get(project.id) ?? 0) > Date.now()) {
              throw Object.assign(new Error(appPublicEnglish('PROJECT_TRANSFER_OBJECT_STORAGE_CAPABILITY_ACTIVE')), {
                code: 'PROJECT_TRANSFER_OBJECT_STORAGE_CAPABILITY_ACTIVE',
                statusCode: 409,
              });
            }

            const hasManagedDatabase = [...this.databaseInstances.values()].some(
              (instance) => instance.projectId === project.id && instance.status !== 'DELETED',
            );
            const hasActiveMigration = [...this.migrationExecutions.values()].some(
              (execution) =>
                execution.projectId === project.id && !['COMMITTED', 'FAILED_SAFE'].includes(execution.state),
            );
            const hasActiveImport = [...this.importJobs.values()].some(
              (job) =>
                job.targetProjectId === project.id &&
                !['COMMITTED', 'EXPIRED', 'CANCELLED', 'FAILED'].includes(job.state),
            );
            const hasActiveRemix = [...this.remixJobs.values()].some(
              (job) =>
                (job.sourceProjectId === project.id || job.targetProjectId === project.id) &&
                !['COMPLETED', 'FAILED'].includes(job.state),
            );
            const hasActiveStorageShare = [...this.remixStorageShares.values()].some(
              (share) =>
                share.state === 'ACTIVE' &&
                (share.sourceProjectId === project.id || share.targetProjectId === project.id),
            );
            const hasActiveWorkspace = [...this.workspaces.values()].some(
              (workspace) =>
                workspace.projectId === project.id && ['PENDING', 'STARTING', 'RUNNING'].includes(workspace.status),
            );
            const hasDeployment = [...this.deployments.values()].some(
              (deployment) => deployment.projectId === project.id,
            );
            const hasNonTerminalReservedVmOperation = [...this.reservedVmOperations.values()].some(
              (operation) => operation.projectId === project.id && !['COMPLETED', 'FAILED'].includes(operation.status),
            );
            const hasNonTerminalCheckpoint = [...this.projectCheckpoints.values()].some(
              (checkpoint) =>
                checkpoint.projectId === project.id &&
                (!['COMMITTED', 'CLEANED', 'MANUAL_INTERVENTION', 'RELEASE_BARRIER'].includes(checkpoint.state) ||
                  (checkpoint.state === 'RELEASE_BARRIER' &&
                    (!checkpoint.barrierExpiresAt || Date.parse(checkpoint.barrierExpiresAt) > Date.now()))),
            );
            const hasProjectTemplate = [...this.projectTemplates.values()].some(
              (template) => template.sourceProjectId === project.id,
            );
            const hasAiConversation = [...this.aiConversations.values()].some(
              (conversation) => conversation.projectId === project.id,
            );

            const hasReleaseManifest = this.releaseManifests.some((manifest) => manifest.projectId === project.id);

            if (
              hasManagedDatabase ||
              hasActiveMigration ||
              hasActiveImport ||
              hasActiveRemix ||
              hasActiveStorageShare ||
              hasActiveWorkspace ||
              hasDeployment ||
              hasNonTerminalReservedVmOperation ||
              hasNonTerminalCheckpoint ||
              hasProjectTemplate ||
              hasAiConversation ||
              hasReleaseManifest ||
              this.cloudProjectBindingProjectIds.has(project.id)
            ) {
              throw Object.assign(new Error(appPublicEnglish('PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE')), {
                statusCode: 409,
                code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE',
              });
            }

            const sourceRevision = await this.getLatestProjectManifest(project.id);

            const sourceManifest = sourceRevision
              ? verifyStoredProjectManifestRevision(sourceRevision, project.id)
              : createDefaultProjectManifest(project.id);

            const detachedSeed = projectManifestForClone(sourceManifest, project.id, 'DETACH_EXTERNALS');

            const detachedManifest = {
              ...detachedSeed,
              manifestVersion: (sourceRevision?.manifestVersion ?? 0) + 1,
            } satisfies ProjectManifest;

            for (const [grantId, grant] of this.resourceAccessGrants) {
              if (
                grant.resourceType === 'PROJECT' &&
                grant.resourceId === project.id &&
                ['PENDING_CONSENT', 'ACTIVE'].includes(grant.status)
              ) {
                this.resourceAccessGrants.set(grantId, {
                  ...grant,
                  status: 'REVOKED',
                  revokedAt: now(),
                  revokedByUserId: input.actorUserId,
                  revocationReason: 'PROJECT_TRANSFERRED',
                  updatedAt: now(),
                });
              }
            }

            for (const [collaboratorId, collaborator] of this.projectCollaborators) {
              if (collaborator.projectId === project.id) this.projectCollaborators.delete(collaboratorId);
            }
            for (const [shareLinkId, shareLink] of this.projectShareLinks) {
              if (shareLink.projectId === project.id) this.projectShareLinks.delete(shareLinkId);
            }
            for (const [tokenHash, share] of this.chatShares) {
              if (share.projectId === project.id) this.chatShares.delete(tokenHash);
            }
            for (const [presenceId, presence] of this.collaborationPresence) {
              if (presence.projectId === project.id) this.collaborationPresence.delete(presenceId);
            }
            const ideState = this.projectIdeStates.get(project.id);
            if (ideState) {
              this.projectIdeStates.set(project.id, {
                ...ideState,
                state: clearTenantScopedIdeCapabilities(ideState.state),
                version: ideState.version + 1,
                updatedAt: now(),
              });
            }

            project.organizationId = input.targetOrganizationId;
            project.ownershipEpoch += 1;
            project.updatedAt = now();

            const revision: ProjectManifestRevisionRecord = {
              id: id('project_manifest'),
              projectId: project.id,
              schemaVersion: detachedManifest.schemaVersion,
              manifestVersion: detachedManifest.manifestVersion,
              digest: projectManifestDigest(detachedManifest),
              manifest: detachedManifest,
              createdByUserId: input.actorUserId,
              createdAt: now(),
            };

            const revisions = this.projectManifestRevisions.get(project.id) ?? [];
            revisions.push(revision);
            this.projectManifestRevisions.set(project.id, revisions);

            const transferred = { ...project };
            const activity: ProjectActivityRecord = {
              id: id('activity'),
              projectId: project.id,
              ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
              action: 'project.transfer',
              metadata: { from: input.expectedOrganizationId, to: input.targetOrganizationId },
              createdAt: now(),
            };
            this.projectActivity.set(activity.id, activity);
            this.auditLogs.push({
              id: id('audit'),
              organizationId: input.targetOrganizationId,
              actorUserId: input.actorUserId,
              action: 'project.transfer',
              resourceType: 'project',
              resourceId: project.id,
              ipAddress: input.ipAddress,
              createdAt: now(),
            });
            this.projectTransferReceipts.push({
              projectId: project.id,
              sourceOrganizationId: input.expectedOrganizationId,
              targetOrganizationId: input.targetOrganizationId,
              ownershipEpoch: input.expectedOwnershipEpoch,
              idempotencyKey: input.idempotencyKey,
              project: transferred,
            });

            return transferred;
          },
          { allowActiveTargetShare: true },
        );
      });
    });

    try {
      return await transferAttempt;
    } catch (error) {
      const racedReplay = replayExactReceipt();
      if (racedReplay) return racedReplay;
      throw error;
    }
  }

  async duplicateProject(input: {
    projectId: string;
    name: string;
    slug: string;
    organizationId?: string;
    manifestCloneMode?: ProjectManifestCloneMode;
  }) {
    const source = this.projects.get(input.projectId);

    if (!source) {
      throw Object.assign(new Error('Project not found'), { statusCode: 404, code: 'PROJECT_NOT_FOUND' });
    }

    const sourceRevision = await this.getLatestProjectManifest(source.id);

    const sourceManifest = sourceRevision
      ? verifyStoredProjectManifestRevision(sourceRevision, source.id)
      : createDefaultProjectManifest(source.id);

    return this.createProject({
      organizationId: input.organizationId ?? source.organizationId,
      name: input.name,
      slug: input.slug,
      description: source.description,
      sourceType: 'duplicate',
      templateName: source.templateName,
      gitRepositoryUrl: source.gitRepositoryUrl,
      gitDefaultBranch: source.gitDefaultBranch,
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

    return this.withProjectTenantMutation(
      {
        projectId: input.sourceProjectId,
        expectedOrganizationId: input.expectedSourceOrganizationId,
      },
      async () => {
        const template: ProjectTemplateRecord = {
          id: id('template'),
          sourceProjectId: input.sourceProjectId,
          organizationId: input.organizationId,
          name: input.name,
          description: input.description,
          createdAt: now(),
        };
        this.projectTemplates.set(template.id, template);

        return template;
      },
    );
  }

  async listProjectTemplates(organizationId: string) {
    return [...this.projectTemplates.values()].filter((template) => template.organizationId === organizationId);
  }

  async upsertProjectEnvVar(input: {
    projectId: string;
    expectedOrganizationId: string;
    key: string;
    value: string;
    scope?: EnvVarScope;
  }) {
    this._assertNoActiveProjectReleaseBarrier(input.projectId);
    return this.withProjectTenantMutation(input, async () => {
      // Omitted scope defaults to production (pre-scope back-compat).
      const scope = input.scope ?? DEFAULT_ENV_VAR_SCOPE;
      const key = `${input.projectId}:${input.key}:${scope}`;
      const existing = this.projectEnvVars.get(key);

      const envVar: ProjectEnvironmentRecord = {
        id: existing?.id ?? id('env'),
        projectId: input.projectId,
        key: input.key,
        value: input.value,
        scope,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
      this.projectEnvVars.set(key, envVar);

      return envVar;
    });
  }

  async listProjectEnvVars(projectId: string) {
    return [...this.projectEnvVars.values()].filter((envVar) => envVar.projectId === projectId);
  }

  async deleteProjectEnvVar(input: {
    projectId: string;
    expectedOrganizationId: string;
    key: string;
    scope?: EnvVarScope;
  }) {
    this._assertNoActiveProjectReleaseBarrier(input.projectId);
    return this.withProjectTenantMutation(input, async () => {
      const targetScope = input.scope ?? DEFAULT_ENV_VAR_SCOPE;
      const mapKey = `${input.projectId}:${input.key}:${targetScope}`;
      const existing = this.projectEnvVars.get(mapKey);
      this.projectEnvVars.delete(mapKey);

      return existing;
    });
  }

  async upsertProjectSecret(input: {
    projectId: string;
    expectedOrganizationId: string;
    key: string;
    valueEncrypted: string;
  }) {
    this._assertNoActiveProjectReleaseBarrier(input.projectId);
    return this.withProjectTenantMutation(input, async () => {
      const key = `${input.projectId}:${input.key}`;
      const existing = this.projectSecrets.get(key);

      const secret: ProjectSecretRecord = {
        id: existing?.id ?? id('secret'),
        projectId: input.projectId,
        key: input.key,
        valueEncrypted: input.valueEncrypted,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
      this.projectSecrets.set(key, secret);

      return secret;
    });
  }

  async listProjectSecrets(projectId: string) {
    return [...this.projectSecrets.values()]
      .filter((secret) => secret.projectId === projectId)
      .map(({ valueEncrypted: _valueEncrypted, ...safeSecret }) => safeSecret);
  }

  async getProjectSecret(projectId: string, key: string) {
    return this.projectSecrets.get(`${projectId}:${key}`);
  }

  async deleteProjectSecret(input: { projectId: string; expectedOrganizationId: string; key: string }) {
    this._assertNoActiveProjectReleaseBarrier(input.projectId);
    return this.withProjectTenantMutation(input, async () => {
      const mapKey = `${input.projectId}:${input.key}`;
      const existing = this.projectSecrets.get(mapKey);
      this.projectSecrets.delete(mapKey);

      return existing;
    });
  }

  private assertProjectTenantMutation(projectId: string, expectedOrganizationId: string) {
    const project = this.projects.get(projectId);
    if (!project || project.deletedAt || project.organizationId !== expectedOrganizationId) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
        code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
        statusCode: 409,
      });
    }
    return project;
  }

  async addProjectCollaborator(input: {
    projectId: string;
    expectedOrganizationId: string;
    userId: string;
    roleKey: string;
    expiresAt?: Date | null;
  }) {
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    const expiresAt = input.expiresAt ? input.expiresAt.toISOString() : undefined;

    const existing = [...this.projectCollaborators.values()].find(
      (collaborator) => collaborator.projectId === input.projectId && collaborator.userId === input.userId,
    );

    if (existing) {
      existing.roleKey = input.roleKey;
      existing.expiresAt = expiresAt;

      return existing;
    }

    const collaborator: ProjectCollaboratorRecord = {
      id: id('collab'),
      projectId: input.projectId,
      userId: input.userId,
      roleKey: input.roleKey,
      expiresAt,
      createdAt: now(),
    };
    this.projectCollaborators.set(collaborator.id, collaborator);

    return collaborator;
  }

  async listProjectCollaborators(projectId: string) {
    return [...this.projectCollaborators.values()].filter((collaborator) => collaborator.projectId === projectId);
  }

  async getActiveProjectCollaborator(projectId: string, userId: string) {
    const nowMs = Date.now();
    return [...this.projectCollaborators.values()].find(
      (collaborator) =>
        collaborator.projectId === projectId &&
        collaborator.userId === userId &&
        (!collaborator.expiresAt || new Date(collaborator.expiresAt).getTime() > nowMs),
    );
  }

  async listActiveOrganizationViewerUserIds(organizationId: string, options?: { excludeGroupId?: string }) {
    const nowMs = Date.now();
    const projectIds = new Set(
      [...this.projects.values()]
        .filter((project) => project.organizationId === organizationId && !project.deletedAt)
        .map((project) => project.id),
    );
    const audience = new Set(
      [...this.projectCollaborators.values()]
        .filter(
          (collaborator) =>
            projectIds.has(collaborator.projectId) &&
            (collaborator.roleKey === 'viewer' || collaborator.roleKey === 'guest') &&
            (!collaborator.expiresAt || new Date(collaborator.expiresAt).getTime() > nowMs),
        )
        .map((collaborator) => collaborator.userId),
    );

    const activeReadOnlyGrants = [...this.resourceAccessGrants.values()].filter(
      (grant) =>
        grant.organizationId === organizationId &&
        grant.resourceType === 'PROJECT' &&
        projectIds.has(grant.resourceId) &&
        (grant.roleKey === 'viewer' || grant.roleKey === 'guest') &&
        grant.status === 'ACTIVE' &&
        !grant.revokedAt &&
        new Date(grant.expiresAt).getTime() > nowMs,
    );

    for (const grant of activeReadOnlyGrants) {
      if (grant.subjectType === 'USER' && grant.subjectUserId) {
        audience.add(grant.subjectUserId);
        continue;
      }
      if (
        grant.subjectType !== 'GROUP' ||
        !grant.subjectGroupId ||
        grant.subjectGroupId === options?.excludeGroupId ||
        this.collaborationGroups.get(grant.subjectGroupId)?.deletedAt
      ) {
        continue;
      }

      for (const member of this.collaborationGroupMembers.values()) {
        const membership = this.memberships.get(member.membershipId);
        if (
          member.organizationId === organizationId &&
          member.groupId === grant.subjectGroupId &&
          membership?.state === 'ACTIVE'
        ) {
          audience.add(membership.userId);
        }
      }
    }

    return [...audience].sort();
  }

  async groupHasActiveReadOnlyProjectGrant(organizationId: string, groupId: string) {
    const nowMs = Date.now();
    const group = this.collaborationGroups.get(groupId);
    if (!group || group.organizationId !== organizationId || group.deletedAt) return false;

    return [...this.resourceAccessGrants.values()].some(
      (grant) =>
        grant.organizationId === organizationId &&
        grant.subjectType === 'GROUP' &&
        grant.subjectGroupId === groupId &&
        grant.resourceType === 'PROJECT' &&
        (grant.roleKey === 'viewer' || grant.roleKey === 'guest') &&
        grant.status === 'ACTIVE' &&
        !grant.revokedAt &&
        new Date(grant.expiresAt).getTime() > nowMs &&
        Boolean(
          [...this.projects.values()].find(
            (project) =>
              project.id === grant.resourceId && project.organizationId === organizationId && !project.deletedAt,
          ),
        ),
    );
  }

  async removeProjectCollaborator(input: { projectId: string; expectedOrganizationId: string; userId: string }) {
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    const existing = [...this.projectCollaborators.values()].find(
      (collaborator) => collaborator.projectId === input.projectId && collaborator.userId === input.userId,
    );

    if (!existing) {
      return false;
    }

    this.projectCollaborators.delete(existing.id);

    return true;
  }

  async createCollaborationGroup(input: {
    organizationId: string;
    name: string;
    source: 'MANUAL' | 'SCIM';
    externalId?: string;
  }) {
    const normalizedName = input.name.trim().normalize('NFKC').toLocaleLowerCase('en-US');

    const duplicate = [...this.collaborationGroups.values()].find(
      (group) =>
        group.organizationId === input.organizationId &&
        !group.deletedAt &&
        group.name.trim().normalize('NFKC').toLocaleLowerCase('en-US') === normalizedName,
    );

    if (duplicate) {
      throw Object.assign(new Error('Duplicate group'), { code: 'P2002' });
    }

    const timestamp = now();

    const group: CollaborationGroupRecord = {
      id: id('group'),
      organizationId: input.organizationId,
      name: input.name.trim(),
      source: input.source,
      externalId: input.externalId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.collaborationGroups.set(group.id, group);

    return group;
  }

  async getCollaborationGroup(groupId: string) {
    return this.collaborationGroups.get(groupId);
  }

  async findScimCollaborationGroup(organizationId: string, externalId: string) {
    return [...this.collaborationGroups.values()].find(
      (group) =>
        group.organizationId === organizationId &&
        group.externalId === externalId &&
        group.source === 'SCIM' &&
        !group.deletedAt,
    );
  }

  async updateScimCollaborationGroup(input: { organizationId: string; groupId: string; name: string }) {
    const group = this.collaborationGroups.get(input.groupId);

    if (!group || group.organizationId !== input.organizationId || group.source !== 'SCIM' || group.deletedAt) {
      return undefined;
    }

    group.name = input.name.trim();
    group.updatedAt = now();

    return group;
  }

  async syncScimCollaborationGroup(input: {
    organizationId: string;
    groupId?: string;
    externalId?: string | null;
    name: string;
    userIds: string[];
  }) {
    const memberships = await Promise.all(
      [...new Set(input.userIds)].map((userId) => this.getMembership(userId, input.organizationId)),
    );

    if (memberships.some((membership) => !membership)) {
      return { ok: false as const, reason: 'MEMBERSHIP_NOT_ACTIVE' as const };
    }

    const existing = input.groupId
      ? this.collaborationGroups.get(input.groupId)
      : input.externalId
        ? await this.findScimCollaborationGroup(input.organizationId, input.externalId)
        : undefined;

    if (input.groupId && (!existing || existing.organizationId !== input.organizationId || existing.deletedAt)) {
      return { ok: false as const, reason: 'GROUP_NOT_FOUND' as const };
    }

    if (existing && existing.source !== 'SCIM') {
      return { ok: false as const, reason: 'GROUP_MANUAL_ONLY' as const };
    }

    const group = existing ?? {
      id: id('group'),
      organizationId: input.organizationId,
      name: input.name.trim(),
      source: 'SCIM' as const,
      externalId: input.externalId ?? undefined,
      createdAt: now(),
      updatedAt: now(),
    };
    group.name = input.name.trim();

    if (input.externalId !== undefined) {
      group.externalId = input.externalId ?? undefined;
    }

    group.updatedAt = now();
    this.collaborationGroups.set(group.id, group);

    for (const [memberId, member] of this.collaborationGroupMembers) {
      if (member.organizationId === input.organizationId && member.groupId === group.id) {
        this.collaborationGroupMembers.delete(memberId);
      }
    }

    for (const membership of memberships as MembershipRecord[]) {
      const member: CollaborationGroupMemberRecord = {
        id: id('group_member'),
        organizationId: input.organizationId,
        groupId: group.id,
        membershipId: membership.id,
        userId: membership.userId,
        createdAt: now(),
      };
      this.collaborationGroupMembers.set(member.id, member);
    }

    return { ok: true as const, group, created: !existing };
  }

  async listCollaborationGroups(input: {
    organizationId: string;
    cursor?: string;
    offset?: number;
    source?: 'MANUAL' | 'SCIM';
    limit: number;
  }) {
    const candidates = [...this.collaborationGroups.values()]
      .filter((group) => group.organizationId === input.organizationId && !group.deletedAt)
      .filter((group) => !input.source || group.source === input.source)
      .filter((group) => !input.cursor || group.id > input.cursor)
      .sort((left, right) => left.id.localeCompare(right.id));

    const window = candidates.slice(input.offset ?? 0);
    const hasMore = window.length > input.limit;
    const items = window.slice(0, input.limit);

    return { items, nextCursor: hasMore ? items.at(-1)?.id : undefined };
  }

  async countCollaborationGroups(organizationId: string, source?: 'MANUAL' | 'SCIM') {
    return [...this.collaborationGroups.values()].filter(
      (group) => group.organizationId === organizationId && !group.deletedAt && (!source || group.source === source),
    ).length;
  }

  async archiveCollaborationGroup(input: {
    organizationId: string;
    groupId: string;
    writer: 'MANUAL' | 'SCIM';
    actorUserId?: string;
  }) {
    const group = this.collaborationGroups.get(input.groupId);

    if (!group || group.organizationId !== input.organizationId || group.deletedAt) {
      return { ok: false as const, reason: 'GROUP_NOT_FOUND' as const };
    }

    if (group.source !== input.writer) {
      return {
        ok: false as const,
        reason: input.writer === 'MANUAL' ? ('GROUP_SCIM_MANAGED' as const) : ('GROUP_MANUAL_ONLY' as const),
      };
    }

    group.deletedAt = now();
    group.updatedAt = group.deletedAt;

    for (const [grantId, grant] of this.resourceAccessGrants) {
      if (grant.subjectGroupId === group.id && grant.status !== 'REVOKED') {
        this.resourceAccessGrants.set(grantId, {
          ...grant,
          status: 'REVOKED',
          revokedAt: now(),
          revokedByUserId: input.actorUserId,
          revocationReason: 'SUBJECT_GROUP_ARCHIVED',
          updatedAt: now(),
        });
      }
    }

    return { ok: true as const, removed: true };
  }

  async addCollaborationGroupMember(input: {
    organizationId: string;
    groupId: string;
    userId: string;
    writer: 'MANUAL' | 'SCIM';
  }) {
    const group = this.collaborationGroups.get(input.groupId);

    if (!group || group.organizationId !== input.organizationId || group.deletedAt) {
      return { ok: false as const, reason: 'GROUP_NOT_FOUND' as const };
    }

    if (group.source !== input.writer) {
      return {
        ok: false as const,
        reason: input.writer === 'MANUAL' ? ('GROUP_SCIM_MANAGED' as const) : ('GROUP_MANUAL_ONLY' as const),
      };
    }

    const membership = await this.getMembership(input.userId, input.organizationId);

    if (!membership) {
      return { ok: false as const, reason: 'MEMBERSHIP_NOT_ACTIVE' as const };
    }

    const existing = [...this.collaborationGroupMembers.values()].find(
      (member) => member.groupId === group.id && member.membershipId === membership.id,
    );

    if (existing) {
      return { ok: true as const, member: existing };
    }

    const member: CollaborationGroupMemberRecord = {
      id: id('group_member'),
      organizationId: input.organizationId,
      groupId: group.id,
      membershipId: membership.id,
      userId: input.userId,
      createdAt: now(),
    };
    this.collaborationGroupMembers.set(member.id, member);

    return { ok: true as const, member };
  }

  async removeCollaborationGroupMember(input: {
    organizationId: string;
    groupId: string;
    userId: string;
    writer: 'MANUAL' | 'SCIM';
  }) {
    const group = this.collaborationGroups.get(input.groupId);

    if (!group || group.organizationId !== input.organizationId || group.deletedAt) {
      return { ok: false as const, reason: 'GROUP_NOT_FOUND' as const };
    }

    if (group.source !== input.writer) {
      return {
        ok: false as const,
        reason: input.writer === 'MANUAL' ? ('GROUP_SCIM_MANAGED' as const) : ('GROUP_MANUAL_ONLY' as const),
      };
    }

    const member = [...this.collaborationGroupMembers.values()].find(
      (candidate) => candidate.groupId === input.groupId && candidate.userId === input.userId,
    );

    if (member) {
      this.collaborationGroupMembers.delete(member.id);
    }

    return { ok: true as const, removed: Boolean(member) };
  }

  async replaceCollaborationGroupMembers(input: {
    organizationId: string;
    groupId: string;
    userIds: string[];
    writer: 'MANUAL' | 'SCIM';
  }) {
    const group = this.collaborationGroups.get(input.groupId);

    if (!group || group.organizationId !== input.organizationId || group.deletedAt) {
      return { ok: false as const, reason: 'GROUP_NOT_FOUND' as const };
    }

    if (group.source !== input.writer) {
      return {
        ok: false as const,
        reason: input.writer === 'MANUAL' ? ('GROUP_SCIM_MANAGED' as const) : ('GROUP_MANUAL_ONLY' as const),
      };
    }

    const memberships = await Promise.all(
      [...new Set(input.userIds)].map((userId) => this.getMembership(userId, input.organizationId)),
    );

    if (memberships.some((membership) => !membership)) {
      return { ok: false as const, reason: 'MEMBERSHIP_NOT_ACTIVE' as const };
    }

    for (const [memberId, member] of this.collaborationGroupMembers) {
      if (member.organizationId === input.organizationId && member.groupId === input.groupId) {
        this.collaborationGroupMembers.delete(memberId);
      }
    }

    for (const membership of memberships as MembershipRecord[]) {
      const member: CollaborationGroupMemberRecord = {
        id: id('group_member'),
        organizationId: input.organizationId,
        groupId: input.groupId,
        membershipId: membership.id,
        userId: membership.userId,
        createdAt: now(),
      };
      this.collaborationGroupMembers.set(member.id, member);
    }

    return { ok: true as const, removed: false };
  }

  async listCollaborationGroupMembers(input: {
    organizationId: string;
    groupId: string;
    cursor?: string;
    limit: number;
  }) {
    const candidates = [...this.collaborationGroupMembers.values()]
      .filter((member) => member.organizationId === input.organizationId && member.groupId === input.groupId)
      .filter((member) => !input.cursor || member.id > input.cursor)
      .filter((member) => this.memberships.get(member.membershipId)?.state === 'ACTIVE')
      .sort((left, right) => left.id.localeCompare(right.id));

    const hasMore = candidates.length > input.limit;
    const items = candidates.slice(0, input.limit);

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
    if (input.idempotencyKey) {
      const replay = [...this.resourceAccessGrants.values()].find(
        (grant) => grant.organizationId === input.organizationId && grant.idempotencyKey === input.idempotencyKey,
      );

      if (replay) {
        return replay.requestHash === input.requestHash
          ? { ok: true as const, grant: replay, replayed: true }
          : { ok: false as const, reason: 'IDEMPOTENCY_CONFLICT' as const };
      }
    }

    for (const [grantId, grant] of this.resourceAccessGrants) {
      if (
        grant.organizationId === input.organizationId &&
        grant.subjectType === input.subjectType &&
        grant.subjectUserId === input.subjectUserId &&
        grant.subjectGroupId === input.subjectGroupId &&
        grant.resourceType === input.resourceType &&
        grant.resourceId === input.resourceId &&
        grant.status !== 'REVOKED' &&
        new Date(grant.expiresAt).getTime() <= Date.now()
      ) {
        this.resourceAccessGrants.set(grantId, {
          ...grant,
          status: 'REVOKED',
          revokedAt: now(),
          revocationReason: 'EXPIRED_REPLACED',
          updatedAt: now(),
        });
      }
    }

    const active = [...this.resourceAccessGrants.values()].find(
      (grant) =>
        grant.organizationId === input.organizationId &&
        grant.subjectType === input.subjectType &&
        grant.subjectUserId === input.subjectUserId &&
        grant.subjectGroupId === input.subjectGroupId &&
        grant.resourceType === input.resourceType &&
        grant.resourceId === input.resourceId &&
        grant.status !== 'REVOKED',
    );

    if (active) {
      return active.requestHash === input.requestHash
        ? { ok: true as const, grant: active, replayed: true }
        : { ok: false as const, reason: 'ACTIVE_GRANT_CONFLICT' as const };
    }

    const timestamp = now();

    const grant: ResourceAccessGrantRecord = {
      id: id('access_grant'),
      organizationId: input.organizationId,
      subjectType: input.subjectType,
      subjectUserId: input.subjectUserId,
      subjectGroupId: input.subjectGroupId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      roleKey: input.roleKey,
      status: input.status,
      expiresAt: input.expiresAt.toISOString(),
      acceptedAt: input.acceptedAt?.toISOString(),
      consentVersion: input.consentVersion,
      grantedByUserId: input.grantedByUserId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.resourceAccessGrants.set(grant.id, grant);

    return { ok: true as const, grant };
  }

  async getResourceAccessGrant(grantId: string) {
    return this.resourceAccessGrants.get(grantId);
  }

  async listResourceAccessGrants(input: {
    organizationId: string;
    resourceType: 'PROJECT' | 'ARTIFACT' | 'DEPLOYMENT' | 'DATASET';
    resourceId: string;
    cursor?: string;
    limit: number;
  }) {
    const candidates = [...this.resourceAccessGrants.values()]
      .filter(
        (grant) =>
          grant.organizationId === input.organizationId &&
          grant.resourceType === input.resourceType &&
          grant.resourceId === input.resourceId,
      )
      .filter((grant) => !input.cursor || grant.id > input.cursor)
      .sort((left, right) => left.id.localeCompare(right.id));

    const hasMore = candidates.length > input.limit;
    const items = candidates.slice(0, input.limit);

    return { items, nextCursor: hasMore ? items.at(-1)?.id : undefined };
  }

  async listUserResourceAccessGrants(input: { userId: string; cursor?: string; limit: number }) {
    const candidates = [...this.resourceAccessGrants.values()]
      .filter((grant) => grant.subjectType === 'USER' && grant.subjectUserId === input.userId)
      .filter((grant) => !input.cursor || grant.id > input.cursor)
      .sort((left, right) => left.id.localeCompare(right.id));

    const hasMore = candidates.length > input.limit;
    const items = candidates.slice(0, input.limit);

    return { items, nextCursor: hasMore ? items.at(-1)?.id : undefined };
  }

  async acceptResourceAccessGrant(input: { grantId: string; subjectUserId: string; consentVersion: string }) {
    const grant = this.resourceAccessGrants.get(input.grantId);
    const failure = this.testGrantMutationFailure(grant, input.subjectUserId, 'PENDING_CONSENT');

    if (failure) {
      return failure;
    }

    const accepted: ResourceAccessGrantRecord = {
      ...grant!,
      status: 'ACTIVE',
      acceptedAt: now(),
      consentVersion: input.consentVersion,
      updatedAt: now(),
    };
    this.resourceAccessGrants.set(accepted.id, accepted);

    return { ok: true as const, grant: accepted };
  }

  async rejectResourceAccessGrant(input: { grantId: string; subjectUserId: string; reason: string }) {
    const grant = this.resourceAccessGrants.get(input.grantId);
    const failure = this.testGrantMutationFailure(grant, input.subjectUserId, 'PENDING_CONSENT', false);

    if (failure) {
      return failure;
    }

    const rejected: ResourceAccessGrantRecord = {
      ...grant!,
      status: 'REVOKED',
      revokedAt: now(),
      revokedByUserId: input.subjectUserId,
      revocationReason: input.reason,
      updatedAt: now(),
    };
    this.resourceAccessGrants.set(rejected.id, rejected);

    return { ok: true as const, grant: rejected };
  }

  async revokeResourceAccessGrant(input: {
    organizationId: string;
    grantId: string;
    revokedByUserId: string;
    reason: string;
  }) {
    const grant = this.resourceAccessGrants.get(input.grantId);

    if (!grant || grant.organizationId !== input.organizationId || grant.status === 'REVOKED') {
      return { ok: false as const, reason: 'GRANT_NOT_ACTIVE' as const };
    }

    const revoked: ResourceAccessGrantRecord = {
      ...grant,
      status: 'REVOKED',
      revokedAt: now(),
      revokedByUserId: input.revokedByUserId,
      revocationReason: input.reason,
      updatedAt: now(),
    };
    this.resourceAccessGrants.set(revoked.id, revoked);

    return { ok: true as const, grant: revoked };
  }

  async listActiveProjectAccessRoles(projectId: string, userId: string) {
    const current = Date.now();

    const memberships = [...this.memberships.values()].filter(
      (membership) => membership.userId === userId && membership.state === 'ACTIVE',
    );
    const groupIds = new Set(
      [...this.collaborationGroupMembers.values()]
        .filter((member) => memberships.some((membership) => membership.id === member.membershipId))
        .filter((member) => !this.collaborationGroups.get(member.groupId)?.deletedAt)
        .map((member) => member.groupId),
    );

    return [...this.resourceAccessGrants.values()]
      .filter(
        (grant) =>
          grant.resourceType === 'PROJECT' &&
          grant.resourceId === projectId &&
          grant.status === 'ACTIVE' &&
          Boolean(grant.acceptedAt) &&
          !grant.revokedAt &&
          new Date(grant.expiresAt).getTime() > current,
      )
      .filter(
        (grant) =>
          (grant.subjectType === 'USER' && grant.subjectUserId === userId) ||
          (grant.subjectType === 'GROUP' && Boolean(grant.subjectGroupId && groupIds.has(grant.subjectGroupId))),
      )
      .map((grant) => grant.roleKey);
  }

  private testGrantMutationFailure(
    grant: ResourceAccessGrantRecord | undefined,
    userId: string,
    expectedStatus: 'PENDING_CONSENT' | 'ACTIVE',
    checkExpiry = true,
  ) {
    if (!grant) {
      return { ok: false as const, reason: 'GRANT_NOT_FOUND' as const };
    }

    if (grant.subjectType !== 'USER' || grant.subjectUserId !== userId) {
      return { ok: false as const, reason: 'GRANT_SUBJECT_MISMATCH' as const };
    }

    if (checkExpiry && new Date(grant.expiresAt).getTime() <= Date.now()) {
      return { ok: false as const, reason: 'GRANT_EXPIRED' as const };
    }

    if (grant.status !== expectedStatus) {
      return {
        ok: false as const,
        reason: expectedStatus === 'PENDING_CONSENT' ? ('GRANT_NOT_PENDING' as const) : ('GRANT_NOT_ACTIVE' as const),
      };
    }

    return undefined;
  }

  async recordProjectActivity(input: {
    projectId: string;
    expectedOrganizationId: string;
    actorUserId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.withProjectTenantMutation(
      input,
      async () => {
        const activity: ProjectActivityRecord = {
          id: id('activity'),
          projectId: input.projectId,
          ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
          action: input.action,
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
          createdAt: now(),
        };
        this.projectActivity.set(activity.id, activity);

        return activity;
      },
      { allowActiveCheckpoint: true, allowDeletedProject: true },
    );
  }

  async listProjectActivity(projectId: string, options: ProjectActivityListOptions = {}) {
    const limit = options.limit ? Math.min(Math.max(options.limit, 1), 200) : undefined;
    const search = options.search?.trim().toLowerCase();

    const activities = [...this.projectActivity.values()]
      .filter((activity) => activity.projectId === projectId)
      .filter((activity) => !options.action || activity.action === options.action)
      .filter((activity) => !options.actorUserId || activity.actorUserId === options.actorUserId)
      .filter((activity) => !options.since || new Date(activity.createdAt) >= new Date(options.since))
      .filter((activity) => !options.until || new Date(activity.createdAt) <= new Date(options.until))
      .filter(
        (activity) =>
          !search ||
          activity.action.toLowerCase().includes(search) ||
          activity.actorUserId?.toLowerCase().includes(search) ||
          JSON.stringify(activity.metadata ?? {})
            .toLowerCase()
            .includes(search),
      )
      .sort((left, right) => {
        const delta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return options.order === 'desc' ? -delta : delta;
      });

    return typeof limit === 'number' ? activities.slice(0, limit) : activities;
  }

  async getProjectIdeState(projectId: string) {
    return this.projectIdeStates.get(projectId);
  }

  async upsertProjectIdeState(input: {
    projectId: string;
    expectedOrganizationId: string;
    state: unknown;
    updatedByUserId?: string;
    expectedVersion?: number;
  }) {
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    const existing = this.projectIdeStates.get(input.projectId);

    if (input.expectedVersion !== undefined && existing?.version !== input.expectedVersion) {
      throw Object.assign(new Error(appPublicEnglish('IDE_STATE_VERSION_CONFLICT')), {
        code: 'IDE_STATE_VERSION_CONFLICT',
      });
    }

    const record: ProjectIdeStateRecord = {
      projectId: input.projectId,
      state: input.state,
      version: existing ? existing.version + 1 : 1,
      updatedByUserId: input.updatedByUserId,
      updatedAt: now(),
      createdAt: existing?.createdAt ?? now(),
    };
    this.projectIdeStates.set(input.projectId, record);

    return record;
  }

  async getWorkspaceIdeState(workspaceId: string) {
    return this.workspaceIdeStates.get(workspaceId);
  }

  async upsertWorkspaceIdeState(input: {
    workspaceId: string;
    expectedProjectId: string;
    expectedOrganizationId: string;
    state: unknown;
    updatedByUserId?: string;
    expectedVersion?: number;
  }) {
    const workspace = this.workspaces.get(input.workspaceId);
    if (!workspace || workspace.projectId !== input.expectedProjectId) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION')), {
        code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
        statusCode: 409,
      });
    }
    this.assertProjectTenantMutation(input.expectedProjectId, input.expectedOrganizationId);
    const existing = this.workspaceIdeStates.get(input.workspaceId);

    if (input.expectedVersion !== undefined && existing?.version !== input.expectedVersion) {
      throw Object.assign(new Error(appPublicEnglish('IDE_STATE_VERSION_CONFLICT')), {
        code: 'IDE_STATE_VERSION_CONFLICT',
      });
    }

    const record: WorkspaceIdeStateRecord = {
      workspaceId: input.workspaceId,
      state: input.state,
      version: existing ? existing.version + 1 : 1,
      updatedByUserId: input.updatedByUserId,
      updatedAt: now(),
      createdAt: existing?.createdAt ?? now(),
    };
    this.workspaceIdeStates.set(input.workspaceId, record);

    return record;
  }

  async updateWorkspaceGitRepositoryUrl(input: {
    projectId: string;
    expectedOrganizationId: string;
    workspaceId: string;
    gitRepositoryUrl: string | null;
  }) {
    return this.withProjectTenantMutation(input, async () => {
      const workspace = this.workspaces.get(input.workspaceId);

      if (!workspace || workspace.projectId !== input.projectId) {
        throw Object.assign(new Error('Workspace not found'), { statusCode: 404, code: 'WORKSPACE_NOT_FOUND' });
      }

      const updated: WorkspaceRecord = {
        ...workspace,
        gitRepositoryUrl: input.gitRepositoryUrl ?? undefined,
      };
      this.workspaces.set(workspace.id, updated);

      return updated;
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
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    const existing = [...this.collaborationPresence.values()].find(
      (presence) => presence.projectId === input.projectId && presence.sessionId === input.sessionId,
    );

    // Mirror prisma-store: a session belongs to one user; reject cross-user hijack.
    if (existing && existing.userId !== input.userId) {
      throw Object.assign(new Error('Presence session belongs to another user'), {
        statusCode: 403,
        code: 'PRESENCE_FORBIDDEN',
      });
    }

    const record: CollaborationPresenceRecord = {
      id: existing?.id ?? id('presence'),
      projectId: input.projectId,
      userId: input.userId,
      sessionId: input.sessionId,
      status: input.status ?? 'online',
      filePath: input.filePath,
      cursor: input.cursor,
      selection: input.selection,
      mode: input.mode ?? 'editing',
      terminalAccess: input.terminalAccess ?? existing?.terminalAccess ?? false,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    };
    this.collaborationPresence.set(record.id, record);

    return record;
  }

  async removeCollaborationPresence(input: { projectId: string; expectedOrganizationId: string; sessionId: string }) {
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    const existing = [...this.collaborationPresence.values()].find(
      (presence) => presence.projectId === input.projectId && presence.sessionId === input.sessionId,
    );

    if (!existing) {
      return false;
    }

    this.collaborationPresence.delete(existing.id);

    return true;
  }

  async listCollaborationPresence(projectId: string) {
    return [...this.collaborationPresence.values()].filter((presence) => presence.projectId === projectId);
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
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    const comment: CollaborationCommentRecord = {
      id: id('comment'),
      projectId: input.projectId,
      userId: input.userId,
      filePath: input.filePath,
      line: input.line,
      selection: input.selection,
      body: input.body,
      createdAt: now(),
    };
    this.collaborationComments.set(comment.id, comment);

    return comment;
  }

  async listCollaborationComments(projectId: string) {
    return [...this.collaborationComments.values()].filter((comment) => comment.projectId === projectId);
  }

  async createProjectShareLink(input: {
    projectId: string;
    expectedOrganizationId: string;
    tokenHash: string;
    roleKey: ProjectShareLinkRecord['roleKey'];
    expiresAt: Date;
    createdByUserId?: string;
  }) {
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    const link: ProjectShareLinkRecord = {
      id: id('share'),
      projectId: input.projectId,
      tokenHash: input.tokenHash,
      roleKey: input.roleKey,
      expiresAt: input.expiresAt.toISOString(),
      createdByUserId: input.createdByUserId,
      createdAt: now(),
    };
    this.projectShareLinks.set(link.id, link);

    return link;
  }

  async listProjectShareLinks(projectId: string) {
    return [...this.projectShareLinks.values()].filter((link) => link.projectId === projectId);
  }

  async findProjectShareLinkByToken(token: string) {
    const tokenHash = hashToken(token);
    const link = [...this.projectShareLinks.values()].find((candidate) => candidate.tokenHash === tokenHash);

    if (!link || link.revokedAt || new Date(link.expiresAt).getTime() < Date.now()) {
      return undefined;
    }

    return link;
  }

  async revokeProjectShareLink(input: { projectId: string; expectedOrganizationId: string; id: string }) {
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    const link = this.projectShareLinks.get(input.id);

    if (!link || link.projectId !== input.projectId || link.revokedAt) {
      return false;
    }

    this.projectShareLinks.set(input.id, { ...link, revokedAt: now() });

    return true;
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
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    const link = this.projectShareLinks.get(input.shareLinkId);
    if (
      !link ||
      link.projectId !== input.projectId ||
      link.tokenHash !== input.tokenHash ||
      link.roleKey !== input.expectedRoleKey ||
      link.expiresAt !== input.expectedExpiresAt.toISOString() ||
      link.revokedAt ||
      new Date(link.expiresAt).getTime() <= Date.now()
    ) {
      return undefined;
    }

    const existing = await this.getActiveProjectCollaborator(input.projectId, input.userId);
    if (existing) return existing;

    return this.addProjectCollaborator({
      projectId: input.projectId,
      expectedOrganizationId: input.expectedOrganizationId,
      userId: input.userId,
      roleKey: link.roleKey,
      expiresAt: new Date(link.expiresAt),
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
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    const share: ChatShareRecord = {
      id: id('cshare'),
      tokenHash: input.tokenHash,
      conversationId: input.conversationId,
      projectId: input.projectId,
      authorUserId: input.authorUserId,
      title: input.title,
      payload: input.payload,
      allowFork: input.allowFork ?? false,
      expiresAt: input.expiresAt?.toISOString(),
      createdAt: now(),
    };
    this.chatShares.set(share.tokenHash, share);

    return share;
  }

  async findChatShareByTokenHash(tokenHash: string) {
    const share = this.chatShares.get(tokenHash);

    if (!share || share.revokedAt || (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now())) {
      return undefined;
    }

    return share;
  }

  async listChatShares(projectId: string) {
    return [...this.chatShares.values()].filter((share) => share.projectId === projectId);
  }

  async revokeChatShare(input: {
    id: string;
    projectId: string;
    expectedOrganizationId: string;
    authorUserId?: string;
  }) {
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    for (const [key, share] of this.chatShares.entries()) {
      if (
        share.id === input.id &&
        !share.revokedAt &&
        (!input.authorUserId || share.authorUserId === input.authorUserId) &&
        share.projectId === input.projectId
      ) {
        this.chatShares.set(key, { ...share, revokedAt: now() });
        return true;
      }
    }

    return false;
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
    return this.withProjectTenantMutation(input, async () => {
      const existing = this.agentPatchProposals.get(input.id);

      if (existing && existing.projectId !== input.projectId) {
        throw Object.assign(new Error('Agent patch proposal not found'), {
          statusCode: 404,
          code: 'AGENT_PATCH_PROPOSAL_NOT_FOUND',
        });
      }

      const proposal: AgentPatchProposalRecord = {
        id: input.id,
        projectId: input.projectId,
        artifactId: input.artifactId,
        messageId: input.messageId,
        actionId: input.actionId,
        filePath: input.filePath,
        relativePath: input.relativePath,
        originalContent: existing?.originalContent ?? input.originalContent,
        proposedContent: input.proposedContent,
        hunks: input.hunks,
        status: input.status,
        error: input.error,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
      this.agentPatchProposals.set(input.id, proposal);

      return proposal;
    });
  }

  async listOpenAgentPatchProposals(projectId: string) {
    return [...this.agentPatchProposals.values()]
      .filter((proposal) => proposal.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteAgentPatchProposal(projectId: string, id: string) {
    const existing = this.agentPatchProposals.get(id);

    if (!existing || existing.projectId !== projectId) {
      return false;
    }

    this.agentPatchProposals.delete(id);

    return true;
  }

  readonly agentRepairEvents: AgentRepairEventRecord[] = [];

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
    return this.withProjectTenantMutation(input, async () => {
      const event: AgentRepairEventRecord = {
        id: id('repair_event'),
        projectId: input.projectId,
        messageId: input.messageId,
        artifactId: input.artifactId,
        actionId: input.actionId,
        relativePath: input.relativePath,
        attempt: input.attempt ?? 1,
        outcome: input.outcome,
        validationError: input.validationError,
        repairError: input.repairError,
        createdAt: now(),
      };
      this.agentRepairEvents.push(event);

      return event;
    });
  }

  async listAgentRepairEvents(projectId: string, options?: { take?: number }) {
    return this.agentRepairEvents
      .filter((event) => event.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(Math.max(options?.take ?? 100, 1), 500));
  }

  /**
   * In-memory consensus records keyed by projectId. The real store scopes via
   * AgentRun.projectId; here the fixture stores the projectId directly so tests
   * can assert tenant isolation.
   */
  readonly consensusRecords: (ConsensusRecordSummary & {
    projectId: string;
    claimVotes?: ConsensusClaimVote[];
    conflicts?: ConsensusConflict[];
    consolidated?: ConsensusConsolidated | null;
  })[] = [];

  async listConsensusRecords(projectId: string, options?: { take?: number }) {
    return this.consensusRecords
      .filter((record) => record.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(Math.max(options?.take ?? 50, 1), 200))
      .map(({ projectId: _projectId, claimVotes: _cv, conflicts: _cf, consolidated: _cs, ...record }) => record);
  }

  async getConsensusRecordDetail(projectId: string, runId: string): Promise<ConsensusRecordDetail | undefined> {
    const found = this.consensusRecords.find((record) => record.projectId === projectId && record.runId === runId);

    if (!found) {
      return undefined;
    }

    const { projectId: _projectId, claimVotes, conflicts, consolidated, ...summary } = found;

    return {
      ...summary,
      claimVotes: claimVotes ?? [],
      conflicts: conflicts ?? [],
      consolidated: consolidated ?? null,
    };
  }

  readonly projectSkillOverrides = new Map<string, { skillId: string; enabled: boolean; updatedAt: string }>();

  async listProjectSkillOverrides(projectId: string) {
    return [...this.projectSkillOverrides.entries()]
      .filter(([key]) => key.startsWith(`${projectId}:`))
      .map(([, row]) => row);
  }

  async setProjectSkillEnabled(input: {
    projectId: string;
    expectedOrganizationId: string;
    skillId: string;
    enabled: boolean;
  }) {
    return this.withProjectTenantMutation(input, async () => {
      const record = { skillId: input.skillId, enabled: input.enabled, updatedAt: new Date().toISOString() };
      this.projectSkillOverrides.set(`${input.projectId}:${input.skillId}`, record);

      return record;
    });
  }

  readonly installedSkills = new Map<string, InstalledSkillRecord>();

  #installedSkillKey(scope: InstalledSkillScope, scopeId: string, ownerRepo: string) {
    return `${scope}:${scopeId}:${ownerRepo}`;
  }

  async listInstalledSkills(scope: InstalledSkillScope, scopeId: string): Promise<InstalledSkillRecord[]> {
    return [...this.installedSkills.values()]
      .filter((row) => row.scope === scope && row.scopeId === scopeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async installSkill(input: InstallSkillInput): Promise<{ record: InstalledSkillRecord; created: boolean }> {
    const key = this.#installedSkillKey(input.scope, input.scopeId, input.ownerRepo);
    const existing = this.installedSkills.get(key);

    if (existing) {
      return { record: existing, created: false };
    }

    const now = new Date().toISOString();

    const record: InstalledSkillRecord = {
      id: id('iskill'),
      scope: input.scope,
      scopeId: input.scopeId,
      ownerRepo: input.ownerRepo,
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      homepageUrl: input.homepageUrl ?? null,
      enabled: input.enabled ?? true,
      installedByUserId: input.installedByUserId ?? null,
      createdAt: now,
      updatedAt: now,
      origin: input.origin ?? 'github',
      contentHash: input.contentHash ?? null,
      auditVerdict: input.auditVerdict ?? null,
      auditFindings: input.auditFindings ?? [],
      auditedAt: input.auditedAt ?? null,
      manifestName: input.manifestName ?? null,
      resources: input.resources ?? [],
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    };

    this.installedSkills.set(key, record);

    return { record, created: true };
  }

  async uninstallSkill(scope: InstalledSkillScope, scopeId: string, ownerRepo: string): Promise<boolean> {
    return this.installedSkills.delete(this.#installedSkillKey(scope, scopeId, ownerRepo));
  }

  async setInstalledSkillEnabled(input: {
    scope: InstalledSkillScope;
    scopeId: string;
    ownerRepo: string;
    enabled: boolean;
  }): Promise<InstalledSkillRecord | undefined> {
    const key = this.#installedSkillKey(input.scope, input.scopeId, input.ownerRepo);
    const existing = this.installedSkills.get(key);

    if (!existing) {
      return undefined;
    }

    // Fail-closed: a revoked or audit-rejected skill can never be enabled.
    if (input.enabled && (existing.revokedAt !== null || existing.auditVerdict === 'rejected')) {
      return existing;
    }

    const updated: InstalledSkillRecord = { ...existing, enabled: input.enabled, updatedAt: new Date().toISOString() };
    this.installedSkills.set(key, updated);

    return updated;
  }

  async revokeSkill(input: {
    scope: InstalledSkillScope;
    scopeId: string;
    ownerRepo: string;
    revokedByUserId?: string | null;
    reason?: string | null;
  }): Promise<InstalledSkillRecord | undefined> {
    const key = this.#installedSkillKey(input.scope, input.scopeId, input.ownerRepo);
    const existing = this.installedSkills.get(key);

    if (!existing) {
      return undefined;
    }

    const updated: InstalledSkillRecord = {
      ...existing,
      enabled: false,
      revokedAt: existing.revokedAt ?? new Date().toISOString(),
      revokedByUserId: input.revokedByUserId ?? existing.revokedByUserId ?? null,
      revokeReason: input.reason ?? existing.revokeReason ?? null,
      updatedAt: new Date().toISOString(),
    };
    this.installedSkills.set(key, updated);

    return updated;
  }

  readonly skillAuditEvents: SkillAuditEventRecord[] = [];

  async recordSkillAudit(input: RecordSkillAuditInput): Promise<SkillAuditEventRecord> {
    const record: SkillAuditEventRecord = {
      id: id('skillaudit'),
      scope: input.scope,
      scopeId: input.scopeId,
      ownerRepo: input.ownerRepo,
      action: input.action,
      verdict: input.verdict ?? null,
      findings: input.findings ?? [],
      contentHash: input.contentHash ?? null,
      actorUserId: input.actorUserId ?? null,
      createdAt: new Date().toISOString(),
    };

    this.skillAuditEvents.push(record);

    return record;
  }

  async listSkillAuditEvents(
    scope: InstalledSkillScope,
    scopeId: string,
    options: { ownerRepo?: string; limit?: number } = {},
  ): Promise<SkillAuditEventRecord[]> {
    return this.skillAuditEvents
      .filter(
        (row) =>
          row.scope === scope && row.scopeId === scopeId && (!options.ownerRepo || row.ownerRepo === options.ownerRepo),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(Math.max(options.limit ?? 100, 1), 500));
  }

  async countInstallsByRepo(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    for (const row of this.installedSkills.values()) {
      counts[row.ownerRepo] = (counts[row.ownerRepo] ?? 0) + 1;
    }

    return counts;
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
    this.assertProjectTenantMutation(input.projectId, input.expectedOrganizationId);
    const workspaceId = input.id ?? id('workspace');

    const workspace: WorkspaceRecord = {
      id: workspaceId,
      projectId: input.projectId,
      name: input.name,
      runtimeMode: input.runtimeMode,
      status: input.initialStatus ?? 'PENDING',
      gitPath: `.vibecore-workspaces/${workspaceId}`,
      environment: input.environment ?? 'development',
      createdAt: now(),
    };
    this.workspaces.set(workspace.id, workspace);

    return workspace;
  }

  async latchProjectWorkspaceStart(input: {
    workspaceId: string;
    projectId: string;
    expectedOrganizationId: string;
    runtimeMode: string;
    environment?: string;
  }) {
    return this.withProjectTenantMutation(input, async () => {
      const existing = this.workspaces.get(input.workspaceId);

      if (existing && existing.projectId !== input.projectId) {
        throw Object.assign(new Error(appPublicEnglish('WORKSPACE_PROJECT_MISMATCH')), {
          statusCode: 403,
          code: 'WORKSPACE_PROJECT_MISMATCH',
        });
      }

      if (existing) {
        existing.status = 'STARTING';
        return existing;
      }

      const project = this.assertExpectedProjectTenant(input);
      const workspace: WorkspaceRecord = {
        id: input.workspaceId,
        projectId: input.projectId,
        name: `${project.name} runtime`,
        runtimeMode: input.runtimeMode,
        status: 'STARTING',
        gitPath: `.vibecore-workspaces/${input.workspaceId}`,
        environment: input.environment ?? 'development',
        createdAt: now(),
      };
      this.workspaces.set(workspace.id, workspace);
      return workspace;
    });
  }

  async getWorkspace(id: string) {
    return this.workspaces.get(id);
  }

  async listWorkspaces(projectId: string) {
    return [...this.workspaces.values()].filter((workspace) => workspace.projectId === projectId);
  }

  #orgProjectIds(organizationId: string) {
    return new Set(
      [...this.projects.values()]
        .filter((project) => project.organizationId === organizationId && !project.deletedAt)
        .map((project) => project.id),
    );
  }

  async countActiveWorkspaces(organizationId: string) {
    const projectIds = this.#orgProjectIds(organizationId);
    return [...this.workspaces.values()].filter(
      (workspace) =>
        projectIds.has(workspace.projectId) && ['PENDING', 'STARTING', 'RUNNING'].includes(workspace.status),
    ).length;
  }

  async listActiveWorkspaces(organizationId: string) {
    const projectIds = this.#orgProjectIds(organizationId);
    return [...this.workspaces.values()]
      .filter(
        (workspace) =>
          projectIds.has(workspace.projectId) && ['PENDING', 'STARTING', 'RUNNING'].includes(workspace.status),
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async countSnapshots(organizationId: string) {
    const projectIds = this.#orgProjectIds(organizationId);
    return [...this.snapshots.values()].filter((snapshot) => projectIds.has(snapshot.projectId)).length;
  }

  async countDeployments(organizationId: string) {
    const projectIds = this.#orgProjectIds(organizationId);
    return [...this.deployments.values()].filter((deployment) => projectIds.has(deployment.projectId)).length;
  }

  async countPublishedApps(organizationId: string, options: { excludeProjectId?: string } = {}) {
    const projectIds = this.#orgProjectIds(organizationId);
    const published = new Set<string>();

    for (const deployment of this.deployments.values()) {
      if (!projectIds.has(deployment.projectId)) {
        continue;
      }

      if (options.excludeProjectId && deployment.projectId === options.excludeProjectId) {
        continue;
      }

      if (deployment.environment === 'production' && deployment.status === 'READY') {
        published.add(deployment.projectId);
      }
    }

    return published.size;
  }

  async listExpiryCandidateDeployments(options: { take?: number } = {}) {
    const out: any[] = [];

    for (const deployment of this.deployments.values()) {
      const project = this.projects.get(deployment.projectId);

      if (!project || project.deletedAt) {
        continue;
      }

      if ((deployment as any).environment !== 'production' || deployment.status !== 'READY') {
        continue;
      }

      if (deployment.provider !== 'server') {
        continue;
      }

      const subscription = this.subscriptions.get(project.organizationId);
      out.push({
        id: deployment.id,
        projectId: deployment.projectId,
        organizationId: project.organizationId,
        provider: deployment.provider,
        environmentName: (deployment as any).environment,
        status: deployment.status,
        createdAt: (deployment as any).createdAt ?? now(),
        planKey: subscription?.status === 'ACTIVE' ? subscription.planKey : undefined,
        expiredAt: ((deployment as any).metadata ?? {})?.expiredAt,
      });
    }

    return out.slice(0, options.take ?? 500);
  }

  async listPublishedProjects(organizationId: string) {
    const projectIds = this.#orgProjectIds(organizationId);
    const latest = new Map<string, string>();

    for (const deployment of this.deployments.values()) {
      if (!projectIds.has(deployment.projectId)) {
        continue;
      }

      if (deployment.environment !== 'production' || deployment.status !== 'READY') {
        continue;
      }

      const at = (deployment as any).createdAt ?? now();
      const seen = latest.get(deployment.projectId);

      // Publication la PLUS RÉCENTE par projet (comme l'implémentation Prisma).
      if (!seen || new Date(at).getTime() > new Date(seen).getTime()) {
        latest.set(deployment.projectId, at);
      }
    }

    return [...latest.entries()].map(([projectId, publishedAt]) => ({ projectId, publishedAt }));
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
    checkpointBarrierAuthority?: ProjectCheckpointLease;
  }) {
    return this.withProjectTenantMutation(
      input,
      async () => {
        if (input.id) {
          const existing = this.snapshots.get(input.id);

          if (existing) {
            if (existing.projectId !== input.projectId || existing.storageKey !== input.storageKey) {
              throw Object.assign(new Error('Snapshot idempotency key conflicts with another snapshot'), {
                statusCode: 409,
                code: 'SNAPSHOT_IDEMPOTENCY_CONFLICT',
              });
            }

            return existing;
          }
        }

        let latestManifest = await this.getLatestProjectManifest(input.projectId);

        if (!latestManifest && this.projects.has(input.projectId)) {
          const initial = createDefaultProjectManifest(input.projectId);
          latestManifest = await this.createProjectManifestRevisionAfterTenantLock({
            projectId: input.projectId,
            expectedOrganizationId: input.expectedOrganizationId,
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
        const snapshot: SnapshotRecord = {
          ...(input.id ? { id: input.id } : { id: id('snapshot') }),
          projectId: input.projectId,
          label: input.label,
          kind: input.kind ?? 'manual',
          manifest: latestManifest
            ? { ...manifestBase, projectManifest: projectManifestSnapshotPin(latestManifest, input.projectId) }
            : manifestBase,
          storageKey: input.storageKey,
          byteLength: input.byteLength,
          createdByUserId: input.createdByUserId,
          conversationId: input.conversationId,
          turnIndex: input.turnIndex,
          createdAt: now(),
        };
        this.snapshots.set(snapshot.id, snapshot);

        return snapshot;
      },
      { checkpointBarrierAuthority: input.checkpointBarrierAuthority },
    );
  }

  async getSnapshot(id: string) {
    return this.snapshots.get(id);
  }

  async listSnapshots(projectId: string) {
    return [...this.snapshots.values()].filter((snapshot) => snapshot.projectId === projectId);
  }

  async putProjectStorageObject(input: {
    projectId: string;
    expectedOrganizationId: string;
    key: string;
    kind: ProjectStorageObjectRecord['kind'];
    contentBase64: string;
    byteLength: number;
    contentHash: string;
    checkpointBarrierAuthority?: ProjectCheckpointLease;
  }) {
    return this.withProjectTenantMutation(
      input,
      async () => {
        const existing = this.projectStorageObjects.get(input.key);

        const object: ProjectStorageObjectRecord = {
          id: existing?.id ?? id('storage_object'),
          projectId: input.projectId,
          key: input.key,
          kind: input.kind,
          contentBase64: input.contentBase64,
          byteLength: input.byteLength,
          contentHash: input.contentHash,
          createdAt: existing?.createdAt ?? now(),
        };
        this.projectStorageObjects.set(input.key, object);

        return object;
      },
      { checkpointBarrierAuthority: input.checkpointBarrierAuthority },
    );
  }

  async getProjectStorageObject(input: { projectId: string; expectedOrganizationId: string; key: string }) {
    return this.withProjectPhysicalAccess(input, async () => {
      const object = this.projectStorageObjects.get(input.key);
      return object?.projectId === input.projectId ? object : undefined;
    });
  }

  async aggregateStorageBytesByOrg() {
    const byOrg = new Map<string, number>();

    for (const object of this.projectStorageObjects.values()) {
      if (!object.projectId) {
        continue;
      }

      const organizationId = this.projects.get(object.projectId)?.organizationId;

      if (!organizationId) {
        continue;
      }

      byOrg.set(organizationId, (byOrg.get(organizationId) ?? 0) + (object.byteLength ?? 0));
    }

    return [...byOrg.entries()].map(([organizationId, bytes]) => ({ organizationId, bytes }));
  }

  async getDatabaseInstanceByProject(projectId: string, environment = 'development') {
    for (const instance of this.databaseInstances.values()) {
      if (instance.projectId === projectId && instance.environment === environment) {
        return instance;
      }
    }

    return undefined;
  }

  migrationExecutions = new Map<string, DatabaseMigrationExecutionRecord>();

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
    const timestamp = Date.now();
    const activeLock = `${input.projectId}:${input.environment}`;

    let row = [...this.migrationExecutions.values()].find(
      (entry) => entry.projectId === input.projectId && entry.idempotencyKey === input.idempotencyKey,
    );

    if (row) {
      if (row.requestHash !== input.requestHash) {
        return { kind: 'IDEMPOTENCY_COLLISION' as const, execution: row };
      }

      if (row.state === 'COMMITTED') {
        return { kind: 'REPLAYED' as const, execution: row };
      }

      if (row.state === 'FAILED_SAFE') {
        return { kind: 'FAILED' as const, execution: row };
      }

      if (row.leaseExpiresAt && new Date(row.leaseExpiresAt).getTime() > timestamp) {
        return { kind: 'BLOCKED' as const, execution: row };
      }
    } else {
      row = [...this.migrationExecutions.values()].find((entry) => entry.activeLock === activeLock);

      if (row?.leaseExpiresAt && new Date(row.leaseExpiresAt).getTime() > timestamp) {
        return { kind: 'BLOCKED' as const, execution: row };
      }
    }

    if (row) {
      const claimed: DatabaseMigrationExecutionRecord = {
        ...row,
        state: 'RECOVERING',
        ownerToken: input.ownerToken,
        version: row.version + 1,
        attempt: row.attempt + 1,
        leaseExpiresAt: new Date(timestamp + input.ttlMs).toISOString(),
      };
      this.migrationExecutions.set(row.id, claimed);

      return { kind: 'RECOVERY' as const, execution: claimed };
    }

    const created: DatabaseMigrationExecutionRecord = {
      id: id('dbmig'),
      projectId: input.projectId,
      organizationId: input.organizationId,
      environment: input.environment,
      state: 'LOCK_ACQUIRED',
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      activeLock,
      ownerToken: input.ownerToken,
      version: 0,
      leaseExpiresAt: new Date(timestamp + input.ttlMs).toISOString(),
      attempt: 1,
      plan: input.plan,
      statementsSha256: input.statementsSha256,
      statementCount: input.plan.length,
      appliedStatements: 0,
      backwardCompatible: input.backwardCompatible,
      forwardCompatible: input.forwardCompatible,
      deploymentId: input.deploymentId,
      createdByUserId: input.createdByUserId,
      startedAt: now(),
    };
    this.migrationExecutions.set(created.id, created);

    return { kind: 'ACQUIRED' as const, execution: created };
  }

  async renewDatabaseMigrationLease(input: {
    id: string;
    ownerToken: string;
    version: number;
    state: DatabaseMigrationState;
    ttlMs: number;
  }) {
    const row = this.migrationExecutions.get(input.id);
    const timestamp = Date.now();

    if (
      !row ||
      row.ownerToken !== input.ownerToken ||
      row.version !== input.version ||
      row.state !== input.state ||
      !row.activeLock ||
      !row.leaseExpiresAt ||
      new Date(row.leaseExpiresAt).getTime() <= timestamp
    ) {
      return undefined;
    }

    const renewed = {
      ...row,
      version: row.version + 1,
      leaseExpiresAt: new Date(timestamp + input.ttlMs).toISOString(),
    };
    this.migrationExecutions.set(row.id, renewed);

    return renewed;
  }

  async validateDatabaseMigrationLease(input: {
    id: string;
    ownerToken: string;
    version: number;
    state: DatabaseMigrationState;
  }) {
    const row = this.migrationExecutions.get(input.id);
    return Boolean(
      row &&
        row.ownerToken === input.ownerToken &&
        row.version === input.version &&
        row.state === input.state &&
        row.activeLock &&
        row.leaseExpiresAt &&
        new Date(row.leaseExpiresAt).getTime() > Date.now(),
    );
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
    const row = this.migrationExecutions.get(input.id);

    if (!(await this.validateDatabaseMigrationLease({ ...input, state: input.expectedState }))) {
      return undefined;
    }

    const release = input.release === true;
    const retainLock = input.retainLock === true;

    if (release && retainLock) {
      throw new TypeError('migration transition cannot release and retain its lock');
    }

    const transitioned: DatabaseMigrationExecutionRecord = {
      ...row!,
      state: input.nextState,
      version: row!.version + 1,
      ownerToken: release || retainLock ? undefined : row!.ownerToken,
      activeLock: release ? undefined : row!.activeLock,
      leaseExpiresAt: release || retainLock ? undefined : new Date(Date.now() + input.ttlMs).toISOString(),
      completedAt: release ? now() : row!.completedAt,
      ...(input.backupId
        ? {
            backupId: input.backupId,
            backupVerifiedAt: now(),
          }
        : {}),
      ...(input.backupVerificationMethod ? { backupVerificationMethod: input.backupVerificationMethod } : {}),
      ...(input.appliedStatements !== undefined ? { appliedStatements: input.appliedStatements } : {}),
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    };
    this.migrationExecutions.set(row!.id, transitioned);

    return transitioned;
  }

  async listDatabaseSnapshots(databaseInstanceId: string) {
    return [...this.databaseSnapshots.values()]
      .filter((snapshot) => snapshot.databaseInstanceId === databaseInstanceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listDatabaseRestores(databaseInstanceId: string) {
    return [...this.databaseRestores.values()]
      .filter((restore) => restore.databaseInstanceId === databaseInstanceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createDatabaseRestore(input: {
    databaseInstanceId: string;
    snapshotId?: string;
    targetTimestamp?: string;
    requestedByUserId?: string;
  }) {
    const restore: DatabaseRestoreRecord = {
      id: id('database_restore'),
      databaseInstanceId: input.databaseInstanceId,
      snapshotId: input.snapshotId,
      targetTimestamp: input.targetTimestamp,
      status: 'PENDING',
      requestedByUserId: input.requestedByUserId,
      createdAt: now(),
    };
    this.databaseRestores.set(restore.id, restore);

    return restore;
  }

  async createDatabaseInstance(input: {
    projectId: string;
    expectedOrganizationId: string;
    organizationId: string;
    retentionDays: number;
    region?: string;
    environment?: string;
    provisioningDeadlineAt?: string;
  }) {
    this._assertNoActiveProjectReleaseBarrier(input.projectId);
    if (input.organizationId !== input.expectedOrganizationId) {
      throw projectOrganizationChangedError();
    }

    return this.withProjectTenantMutation(input, async () => {
      const instance: DatabaseInstanceRecord = {
        id: id('database_instance'),
        projectId: input.projectId,
        organizationId: input.expectedOrganizationId,
        environment: input.environment === 'production' ? 'production' : 'development',
        status: 'PROVISIONING',
        engine: 'postgres',
        region: input.region,
        sizeBytes: 0,
        retentionDays: input.retentionDays,
        pitrEnabled: input.retentionDays > 0,
        provisioningDeadlineAt: input.provisioningDeadlineAt,
        createdAt: now(),
        updatedAt: now(),
      };
      this.databaseInstances.set(instance.id, instance);

      return instance;
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
  }) {
    this._assertNoActiveProjectReleaseBarrier(input.projectId);
    if (input.organizationId !== input.expectedOrganizationId) {
      throw projectOrganizationChangedError();
    }

    return this.withProjectTenantMutation(input, async () => {
      const environment = input.environment === 'production' ? 'production' : 'development';

      /*
       * Deliberately inspect and mutate the in-memory record without an await in
       * between. This mirrors the Project-row lock used by the Prisma store.
       */
      const existing = Array.from(this.databaseInstances.values()).find(
        (row) => row.projectId === input.projectId && row.environment === environment,
      );

      if (!existing) {
        const instance: DatabaseInstanceRecord = {
          id: id('database_instance'),
          projectId: input.projectId,
          organizationId: input.expectedOrganizationId,
          environment,
          status: 'PROVISIONING',
          engine: 'postgres',
          region: input.region,
          sizeBytes: 0,
          retentionDays: input.retentionDays,
          pitrEnabled: input.retentionDays > 0,
          provisioningDeadlineAt: input.provisioningDeadlineAt,
          createdAt: now(),
          updatedAt: now(),
        };
        this.databaseInstances.set(instance.id, instance);

        return { instance, acquired: true, created: true };
      }

      if (existing.status !== 'FAILED') {
        return { instance: existing, acquired: false, created: false };
      }

      const instance: DatabaseInstanceRecord = {
        ...existing,
        status: 'PROVISIONING',
        provisioningDeadlineAt: input.provisioningDeadlineAt,
        lastErrorCode: undefined,
        lastErrorAt: undefined,
        updatedAt: now(),
      };
      this.databaseInstances.set(instance.id, instance);

      return { instance, acquired: true, created: false };
    });
  }

  async completeDatabaseProvisioning(
    instanceId: string,
    connection: {
      projectId: string;
      expectedOrganizationId: string;
      key: string;
      valueEncrypted: string;
    },
  ) {
    this._assertNoActiveProjectReleaseBarrier(connection.projectId);
    return this.withProjectTenantMutation(connection, async () => {
      const instance = this.databaseInstances.get(instanceId);

      if (
        !instance ||
        instance.projectId !== connection.projectId ||
        instance.organizationId !== connection.expectedOrganizationId ||
        instance.status !== 'PROVISIONING'
      ) {
        return undefined;
      }

      const updated: DatabaseInstanceRecord = {
        ...instance,
        status: 'ACTIVE',
        provisioningDeadlineAt: undefined,
        lastErrorCode: undefined,
        lastErrorAt: undefined,
        updatedAt: now(),
      };
      const secretKey = `${connection.projectId}:${connection.key}`;
      const existingSecret = this.projectSecrets.get(secretKey);
      this.projectSecrets.set(secretKey, {
        id: existingSecret?.id ?? id('secret'),
        projectId: connection.projectId,
        key: connection.key,
        valueEncrypted: connection.valueEncrypted,
        createdAt: existingSecret?.createdAt ?? now(),
        updatedAt: now(),
      });
      this.databaseInstances.set(instanceId, updated);

      return updated;
    });
  }

  async failDatabaseProvisioning(
    instanceId: string,
    input: { errorCode: string; failedAt: string; deadlineBefore?: string },
  ) {
    const instance = this.databaseInstances.get(instanceId);

    if (
      !instance ||
      instance.status !== 'PROVISIONING' ||
      (input.deadlineBefore &&
        (!instance.provisioningDeadlineAt || instance.provisioningDeadlineAt > input.deadlineBefore))
    ) {
      return undefined;
    }

    const updated: DatabaseInstanceRecord = {
      ...instance,
      status: 'FAILED',
      lastErrorCode: input.errorCode,
      lastErrorAt: input.failedAt,
      updatedAt: now(),
    };
    this.databaseInstances.set(instanceId, updated);

    return updated;
  }

  async updateDatabaseInstance(
    instanceId: string,
    patch: Partial<
      Pick<
        DatabaseInstanceRecord,
        'status' | 'sizeBytes' | 'pitrEnabled' | 'region' | 'provisioningDeadlineAt' | 'lastErrorCode' | 'lastErrorAt'
      >
    >,
  ) {
    const instance = this.databaseInstances.get(instanceId);

    if (!instance) {
      return undefined;
    }

    const updated: DatabaseInstanceRecord = { ...instance, ...patch, updatedAt: now() };
    this.databaseInstances.set(instanceId, updated);

    return updated;
  }

  async createDatabaseSnapshot(input: {
    databaseInstanceId: string;
    kind: 'auto' | 'manual';
    label?: string;
    createdByUserId?: string;
    expiresAt?: string;
  }) {
    const snapshot: DatabaseSnapshotRecord = {
      id: id('database_snapshot'),
      databaseInstanceId: input.databaseInstanceId,
      kind: input.kind,
      label: input.label,
      sizeBytes: 0,
      createdByUserId: input.createdByUserId,
      createdAt: now(),
      expiresAt: input.expiresAt,
    };
    this.databaseSnapshots.set(snapshot.id, snapshot);

    return snapshot;
  }

  async pruneExpiredDatabaseSnapshots(nowMs: number) {
    let pruned = 0;

    for (const [key, snapshot] of this.databaseSnapshots) {
      if (snapshot.expiresAt && new Date(snapshot.expiresAt).getTime() < nowMs) {
        this.databaseSnapshots.delete(key);
        pruned += 1;
      }
    }

    return pruned;
  }

  async updateDatabaseRestore(
    restoreId: string,
    patch: Partial<Pick<DatabaseRestoreRecord, 'status' | 'error' | 'startedAt' | 'completedAt'>>,
  ) {
    const restore = this.databaseRestores.get(restoreId);

    if (!restore) {
      return undefined;
    }

    const updated: DatabaseRestoreRecord = { ...restore, ...patch };
    this.databaseRestores.set(restoreId, updated);

    return updated;
  }

  async listActiveDatabaseInstances(take = 500) {
    return [...this.databaseInstances.values()].filter((i) => i.status === 'ACTIVE').slice(0, take);
  }

  async listProvisioningDatabaseInstances(take = 500) {
    return [...this.databaseInstances.values()]
      .filter((i) => i.status === 'PROVISIONING')
      .sort((a, b) => (a.provisioningDeadlineAt ?? '').localeCompare(b.provisioningDeadlineAt ?? ''))
      .slice(0, take);
  }

  async listPendingDatabaseRestores(take = 100) {
    return [...this.databaseRestores.values()]
      .filter((r) => r.status === 'PENDING' || r.status === 'RUNNING')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, take);
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
    return this.withProjectTenantMutation(input, async () => {
      if (input.reservedVm) {
        const operationKey = `${input.projectId}:${input.reservedVm.idempotencyKey}`;
        const replay = this.reservedVmOperations.get(operationKey);

        if (replay) {
          if (replay.requestHash !== input.reservedVm.requestHash || replay.kind !== 'CREATE') {
            throw Object.assign(new Error('RESERVED_VM_IDEMPOTENCY_CONFLICT'), {
              code: 'RESERVED_VM_IDEMPOTENCY_CONFLICT',
              statusCode: 409,
            });
          }
          return this.deployments.get(replay.deploymentId)!;
        }
      }

      const environment = input.environment ?? 'preview';

      let accessPolicyVersion = input.accessPolicyVersion;

      if (input.accessPolicy) {
        const mode = normalizeDeploymentAccessMode(input.accessPolicy.mode);
        const passwordHash = input.accessPolicy.passwordHash?.trim();

        if ((mode === 'PASSWORD_PROTECTED') !== Boolean(passwordHash)) {
          throw new Error('DEPLOYMENT_ACCESS_PASSWORD_INVALID');
        }

        accessPolicyVersion =
          this.deploymentAccessPolicies
            .filter((policy) => policy.projectId === input.projectId && policy.environment === environment)
            .reduce((max, policy) => Math.max(max, policy.version), 0) + 1;
        this.deploymentAccessPolicies.push({
          id: id('access_policy'),
          projectId: input.projectId,
          environment,
          version: accessPolicyVersion,
          mode,
          revision: id('access_revision'),
          passwordHash,
          createdByUserId: input.accessPolicy.createdByUserId,
          createdAt: now(),
        });
      } else if (accessPolicyVersion === undefined) {
        let legacy = this.deploymentAccessPolicies.find(
          (policy) =>
            policy.projectId === input.projectId && policy.environment === environment && policy.version === 1,
        );

        if (!legacy) {
          legacy = {
            id: id('access_policy'),
            projectId: input.projectId,
            environment,
            version: 1,
            mode: 'PUBLIC',
            revision: id('legacy_public'),
            createdAt: now(),
          };
          this.deploymentAccessPolicies.push(legacy);
        }

        accessPolicyVersion = legacy.version;
      } else if (
        !this.deploymentAccessPolicies.some(
          (policy) =>
            policy.projectId === input.projectId &&
            policy.environment === environment &&
            policy.version === accessPolicyVersion,
        )
      ) {
        throw new Error('DEPLOYMENT_ACCESS_POLICY_NOT_FOUND');
      }

      const deployment: DeploymentRecord = {
        id: id('deployment'),
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        provider: input.provider,
        environment,
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
        logs: input.logs ?? [],
        metadata: input.metadata,
        rolledBackFromId: input.rolledBackFromId,
        parentDeploymentId: input.parentDeploymentId,
        machineSize: input.machineSize,
        runtimeKind: input.reservedVm ? 'reserved-vm' : 'autoscale',
        runtimeVersion: 0,
        reservedVmTier: input.reservedVm?.tier,
        reservedVmPriceCents: input.reservedVm?.monthlyPriceCents,
        reservedVmTermsVersion: input.reservedVm?.termsVersion,
        reservedVmRateCardVersion: input.reservedVm?.rateCardVersion,
        persistentStorageClaim: input.reservedVm ? `reserved-data-pending` : undefined,
        accessPolicyVersion,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        canceledAt: input.canceledAt,
        createdAt: now(),
        updatedAt: now(),
      };
      if (input.reservedVm) {
        deployment.persistentStorageClaim = `reserved-data-${deployment.id}`;
        const timestamp = now();
        const operation: ReservedVmLease = {
          id: id('reserved_operation'),
          projectId: input.projectId,
          deploymentId: deployment.id,
          organizationId: input.reservedVm.organizationId,
          actorUserId: input.reservedVm.actorUserId,
          idempotencyKey: input.reservedVm.idempotencyKey,
          requestHash: input.reservedVm.requestHash,
          kind: 'CREATE',
          status: 'PENDING',
          phase: 'RESERVED',
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
          billingReservationId: id('ledger_reservation'),
          fencingToken: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        this.reservedVmOperations.set(`${input.projectId}:${input.reservedVm.idempotencyKey}`, operation);
      }
      this.deployments.set(deployment.id, deployment);
      this.reservedVmRuntimeFences.set(deployment.id, 0);

      return deployment;
    });
  }

  async getDeployment(projectId: string, deploymentId: string) {
    const deployment = this.deployments.get(deploymentId);
    return deployment?.projectId === projectId ? deployment : undefined;
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
  }) {
    const key = `${input.projectId}:${input.idempotencyKey}`;
    const replay = this.reservedVmOperations.get(key);
    const deployment = await this.getDeployment(input.projectId, input.deploymentId);

    if (!deployment) throw new Error('DEPLOYMENT_NOT_FOUND');
    if (replay) {
      if (
        replay.requestHash !== input.requestHash ||
        replay.deploymentId !== input.deploymentId ||
        !replay.actorUserId ||
        replay.actorUserId !== input.actorUserId
      ) {
        throw Object.assign(new Error('RESERVED_VM_IDEMPOTENCY_CONFLICT'), {
          code: 'RESERVED_VM_IDEMPOTENCY_CONFLICT',
          statusCode: 409,
        });
      }
      return { operation: publicReservedVmOperation(replay), deployment, replayed: true };
    }
    this._assertNoActiveProjectReleaseBarrier(input.projectId);
    if ((deployment.runtimeVersion ?? 0) !== input.expectedRuntimeVersion) {
      throw Object.assign(new Error('RESERVED_VM_RUNTIME_VERSION_CONFLICT'), {
        code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
        statusCode: 409,
      });
    }
    if (
      [...this.reservedVmOperations.values()].some(
        (operation) => operation.deploymentId === deployment.id && ['PENDING', 'APPLYING'].includes(operation.status),
      )
    ) {
      throw Object.assign(new Error('RESERVED_VM_CHANGE_IN_PROGRESS'), {
        code: 'RESERVED_VM_CHANGE_IN_PROGRESS',
        statusCode: 409,
      });
    }

    const timestamp = now();
    const operation: ReservedVmLease = {
      id: id('reserved_operation'),
      projectId: input.projectId,
      deploymentId: input.deploymentId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      kind: 'CHANGE',
      status: 'PENDING',
      phase: 'RESERVED',
      fromRuntimeKind: deployment.runtimeKind ?? 'autoscale',
      fromTier: deployment.reservedVmTier,
      targetRuntimeKind: input.targetRuntimeKind,
      targetTier: input.targetTier,
      targetMachineSize: input.targetMachineSize,
      targetCpuMillicores: input.targetCpuMillicores,
      targetMemoryMb: input.targetMemoryMb,
      targetPriceCents: input.targetPriceCents,
      billingAmountCents:
        input.targetRuntimeKind === 'reserved-vm'
          ? deployment.reservedVmBillingState === 'SUSPENDED'
            ? input.targetPriceCents
            : Math.max(0, input.targetPriceCents - (deployment.reservedVmPriceCents ?? 0))
          : 0,
      termsVersion: input.termsVersion,
      rateCardVersion: input.rateCardVersion,
      expectedRuntimeVersion: input.expectedRuntimeVersion,
      billingReservationId: input.targetRuntimeKind === 'reserved-vm' ? id('ledger_reservation') : undefined,
      fencingToken: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.reservedVmOperations.set(key, operation);
    return { operation: publicReservedVmOperation(operation), deployment, replayed: false };
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
  }) {
    const key = `${input.projectId}:${input.idempotencyKey}`;
    const replay = this.reservedVmOperations.get(key);
    const deployment = await this.getDeployment(input.projectId, input.deploymentId);
    const planEntitlements = parseReleasePlanEntitlementsPin(input.planEntitlements);

    if (!deployment) throw new Error('DEPLOYMENT_NOT_FOUND');
    if (!planEntitlements || !PROJECT_MANIFEST_DIGEST_PATTERN.test(input.projectManifestDigest)) {
      throw Object.assign(new Error('RESERVED_VM_REDEPLOY_PIN_INVALID'), {
        code: 'RESERVED_VM_REDEPLOY_PIN_INVALID',
        statusCode: 409,
      });
    }
    if (replay) {
      const replayIntent = parseReservedVmRedeployReleaseIntent(replay.response);
      if (
        replay.kind !== 'REDEPLOY' ||
        replay.requestHash !== input.requestHash ||
        replay.deploymentId !== input.deploymentId ||
        !replay.actorUserId ||
        replay.actorUserId !== input.actorUserId ||
        !replayIntent ||
        !sameReleasePlanEntitlementsPin(replayIntent.targetPlanEntitlements, planEntitlements) ||
        replayIntent.targetProjectManifestDigest !== input.projectManifestDigest
      ) {
        throw Object.assign(new Error('RESERVED_VM_IDEMPOTENCY_CONFLICT'), {
          code: 'RESERVED_VM_IDEMPOTENCY_CONFLICT',
          statusCode: 409,
        });
      }
      return { operation: publicReservedVmOperation(replay), deployment, replayed: true };
    }
    this._assertNoActiveProjectReleaseBarrier(input.projectId);
    if (
      deployment.provider !== 'server' ||
      deployment.status !== 'READY' ||
      deployment.runtimeKind !== 'reserved-vm' ||
      deployment.reservedVmBillingState === 'PAST_DUE' ||
      deployment.reservedVmBillingState === 'STOP_REQUIRED'
    ) {
      throw Object.assign(new Error('RESERVED_VM_REDEPLOY_NOT_READY'), {
        code: 'RESERVED_VM_REDEPLOY_NOT_READY',
        statusCode: 409,
      });
    }
    if ((deployment.runtimeVersion ?? 0) !== input.expectedRuntimeVersion) {
      throw Object.assign(new Error('RESERVED_VM_RUNTIME_VERSION_CONFLICT'), {
        code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
        statusCode: 409,
      });
    }
    const priorPlanEntitlements = parseReleasePlanEntitlementsPin(
      (deployment.metadata as { planEntitlements?: unknown } | undefined)?.planEntitlements,
    );
    const priorProjectManifestDigest = (deployment.metadata as { projectManifestDigest?: unknown } | undefined)
      ?.projectManifestDigest;
    if (
      !priorPlanEntitlements ||
      typeof priorProjectManifestDigest !== 'string' ||
      !PROJECT_MANIFEST_DIGEST_PATTERN.test(priorProjectManifestDigest)
    ) {
      throw Object.assign(new Error('RESERVED_VM_REDEPLOY_PIN_INVALID'), {
        code: 'RESERVED_VM_REDEPLOY_PIN_INVALID',
        statusCode: 409,
      });
    }
    if (
      [...this.reservedVmOperations.values()].some(
        (operation) => operation.deploymentId === deployment.id && ['PENDING', 'APPLYING'].includes(operation.status),
      )
    ) {
      throw Object.assign(new Error('RESERVED_VM_CHANGE_IN_PROGRESS'), {
        code: 'RESERVED_VM_CHANGE_IN_PROGRESS',
        statusCode: 409,
      });
    }

    const timestamp = now();
    const operation: ReservedVmLease = {
      id: id('reserved_operation'),
      projectId: input.projectId,
      deploymentId: input.deploymentId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      kind: 'REDEPLOY',
      status: 'PENDING',
      phase: 'RESERVED',
      fromRuntimeKind: 'reserved-vm',
      fromTier: deployment.reservedVmTier,
      targetRuntimeKind: 'reserved-vm',
      targetTier: deployment.reservedVmTier,
      targetMachineSize: deployment.machineSize ?? deployment.reservedVmTier ?? 'shared-0.5',
      targetCpuMillicores: Math.round(RESERVED_VM_TIERS[deployment.reservedVmTier ?? 'shared-0.5'].vcpu * 1_000),
      targetMemoryMb: RESERVED_VM_TIERS[deployment.reservedVmTier ?? 'shared-0.5'].ramGb * 1_024,
      targetPriceCents: deployment.reservedVmPriceCents ?? 0,
      billingAmountCents: 0,
      termsVersion: deployment.reservedVmTermsVersion ?? 'reserved-vm-monthly-v1',
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
      },
      fencingToken: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const updatedDeployment: DeploymentRecord = {
      ...deployment,
      metadata: {
        ...((deployment.metadata ?? {}) as Record<string, unknown>),
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
      },
      updatedAt: now(),
    };
    this.reservedVmOperations.set(key, operation);
    this.deployments.set(deployment.id, updatedDeployment);

    return { operation: publicReservedVmOperation(operation), deployment: updatedDeployment, replayed: false };
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
  }) {
    const key = `${input.projectId}:${input.idempotencyKey}`;
    const replay = this.reservedVmOperations.get(key);
    const deployment = await this.getDeployment(input.projectId, input.deploymentId);

    if (!deployment) throw new Error('DEPLOYMENT_NOT_FOUND');
    if (replay) {
      if (
        replay.kind !== 'DECOMMISSION' ||
        replay.requestHash !== input.requestHash ||
        replay.deploymentId !== input.deploymentId ||
        replay.actorUserId !== input.actorUserId
      ) {
        throw Object.assign(new Error('RESERVED_VM_IDEMPOTENCY_CONFLICT'), {
          code: 'RESERVED_VM_IDEMPOTENCY_CONFLICT',
          statusCode: 409,
        });
      }
      return { operation: publicReservedVmOperation(replay), deployment, replayed: true };
    }
    this._assertNoActiveProjectReleaseBarrier(input.projectId);
    if (
      deployment.provider !== 'server' ||
      deployment.status !== 'READY' ||
      deployment.runtimeKind !== 'autoscale' ||
      deployment.persistentStorageClaim !== `reserved-data-${deployment.id}`
    ) {
      throw Object.assign(new Error('RESERVED_VM_DECOMMISSION_NOT_READY'), {
        code: 'RESERVED_VM_DECOMMISSION_NOT_READY',
        statusCode: 409,
      });
    }
    if ((deployment.runtimeVersion ?? 0) !== input.expectedRuntimeVersion) {
      throw Object.assign(new Error('RESERVED_VM_RUNTIME_VERSION_CONFLICT'), {
        code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
        statusCode: 409,
      });
    }
    if (
      [...this.reservedVmOperations.values()].some(
        (operation) => operation.deploymentId === deployment.id && ['PENDING', 'APPLYING'].includes(operation.status),
      )
    ) {
      throw Object.assign(new Error('RESERVED_VM_DECOMMISSION_IN_PROGRESS'), {
        code: 'RESERVED_VM_DECOMMISSION_IN_PROGRESS',
        statusCode: 409,
      });
    }

    const timestamp = now();
    const operation: ReservedVmLease = {
      id: id('reserved_operation'),
      projectId: input.projectId,
      deploymentId: input.deploymentId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      kind: 'DECOMMISSION',
      status: 'PENDING',
      phase: 'RESERVED',
      fromRuntimeKind: 'autoscale',
      targetRuntimeKind: 'autoscale',
      targetMachineSize: input.targetMachineSize,
      targetCpuMillicores: input.targetCpuMillicores,
      targetMemoryMb: input.targetMemoryMb,
      targetPriceCents: 0,
      billingAmountCents: 0,
      termsVersion: 'reserved-vm-storage-decommission-v1',
      rateCardVersion: 1,
      expectedRuntimeVersion: input.expectedRuntimeVersion,
      fencingToken: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.reservedVmOperations.set(key, operation);
    return { operation: publicReservedVmOperation(operation), deployment, replayed: false };
  }

  async getReservedVmOperation(projectId: string, idempotencyKey: string) {
    const operation = this.reservedVmOperations.get(`${projectId}:${idempotencyKey}`);
    return operation ? publicReservedVmOperation(operation) : undefined;
  }

  async acquireReservedVmOperation(input: {
    projectId: string;
    idempotencyKey: string;
    ownerToken: string;
    ttlMs: number;
  }) {
    const key = `${input.projectId}:${input.idempotencyKey}`;
    const operation = this.reservedVmOperations.get(key);

    if (!operation) throw new Error('RESERVED_VM_OPERATION_NOT_FOUND');
    const deployment = this.deployments.get(operation.deploymentId)!;
    if (operation.status === 'COMPLETED' || operation.status === 'FAILED') {
      return { operation, deployment, acquired: false };
    }
    if (operation.kind === 'CREATE' && operation.errorCode === 'RESERVED_VM_CANCEL_REQUESTED') {
      return { operation, deployment, acquired: false };
    }
    if (
      operation.leaseOwner &&
      operation.leaseOwner !== input.ownerToken &&
      operation.leaseExpiresAt &&
      Date.parse(operation.leaseExpiresAt) > Date.now()
    ) {
      return { operation, deployment, acquired: false };
    }
    const runtimeFence = (this.reservedVmRuntimeFences.get(operation.deploymentId) ?? 0) + 1;
    this.reservedVmRuntimeFences.set(operation.deploymentId, runtimeFence);
    const claimed: ReservedVmLease = {
      ...operation,
      status: 'APPLYING',
      phase: operation.phase === 'RUNTIME_APPLIED' ? 'RUNTIME_APPLIED' : 'LEASED',
      leaseOwner: input.ownerToken,
      leaseExpiresAt: new Date(Date.now() + input.ttlMs).toISOString(),
      fencingToken: runtimeFence,
      updatedAt: now(),
    };
    this.reservedVmOperations.set(key, claimed);
    return { operation: claimed, deployment, acquired: true };
  }

  async acquireReservedVmCreateCancellation(input: {
    projectId: string;
    deploymentId: string;
    actorUserId: string;
    ownerToken: string;
    ttlMs: number;
  }) {
    const entry = [...this.reservedVmOperations.entries()].find(
      ([, operation]) =>
        operation.projectId === input.projectId &&
        operation.deploymentId === input.deploymentId &&
        operation.kind === 'CREATE',
    );
    if (!entry) throw new Error('RESERVED_VM_OPERATION_NOT_FOUND');
    const [key, operation] = entry;
    const deployment = this.deployments.get(input.deploymentId)!;

    if (operation.status === 'FAILED' && deployment.status === 'CANCELED') {
      return { operation, deployment, acquired: false };
    }
    if (
      operation.errorCode === 'RESERVED_VM_CANCEL_REQUESTED' &&
      operation.leaseOwner &&
      operation.leaseExpiresAt &&
      Date.parse(operation.leaseExpiresAt) > Date.now()
    ) {
      return { operation, deployment, acquired: false };
    }
    if (
      !['PENDING', 'APPLYING'].includes(operation.status) ||
      !['QUEUED', 'BUILDING'].includes(deployment.status) ||
      (deployment.runtimeVersion ?? 0) !== operation.expectedRuntimeVersion
    ) {
      throw Object.assign(new Error('DEPLOYMENT_NOT_CANCELABLE'), {
        code: 'DEPLOYMENT_NOT_CANCELABLE',
        statusCode: 409,
      });
    }

    const runtimeFence = (this.reservedVmRuntimeFences.get(operation.deploymentId) ?? 0) + 1;
    this.reservedVmRuntimeFences.set(operation.deploymentId, runtimeFence);
    const claimed: ReservedVmLease = {
      ...operation,
      status: 'APPLYING',
      phase: 'LEASED',
      leaseOwner: input.ownerToken,
      leaseExpiresAt: new Date(Date.now() + input.ttlMs).toISOString(),
      fencingToken: runtimeFence,
      errorCode: 'RESERVED_VM_CANCEL_REQUESTED',
      errorMessage: undefined,
      updatedAt: now(),
    };
    const updatedDeployment: DeploymentRecord = {
      ...deployment,
      metadata: {
        ...((deployment.metadata ?? {}) as Record<string, unknown>),
        reservedVmCancelRequestedAt: now(),
        reservedVmCancelRequestedBy: input.actorUserId,
      },
      updatedAt: now(),
    };
    this.reservedVmOperations.set(key, claimed);
    this.deployments.set(deployment.id, updatedDeployment);
    return { operation: claimed, deployment: updatedDeployment, acquired: true };
  }

  async claimNextReservedVmCreateCancellation(input: { ownerToken: string; ttlMs: number }) {
    const entry = [...this.reservedVmOperations.entries()]
      .filter(
        ([, operation]) =>
          operation.kind === 'CREATE' &&
          operation.status === 'APPLYING' &&
          operation.errorCode === 'RESERVED_VM_CANCEL_REQUESTED' &&
          (!operation.leaseExpiresAt || Date.parse(operation.leaseExpiresAt) <= Date.now()),
      )
      .sort((left, right) => left[1].updatedAt.localeCompare(right[1].updatedAt))[0];

    if (!entry) return undefined;
    const [key, operation] = entry;
    const deployment = this.deployments.get(operation.deploymentId)!;
    const runtimeFence = (this.reservedVmRuntimeFences.get(operation.deploymentId) ?? 0) + 1;
    this.reservedVmRuntimeFences.set(operation.deploymentId, runtimeFence);
    const claimed: ReservedVmLease = {
      ...operation,
      leaseOwner: input.ownerToken,
      leaseExpiresAt: new Date(Date.now() + input.ttlMs).toISOString(),
      fencingToken: runtimeFence,
      updatedAt: now(),
    };
    this.reservedVmOperations.set(key, claimed);
    return { operation: claimed, deployment };
  }

  async claimNextRecoverableReservedVmOperation(input: {
    ownerToken: string;
    ttlMs: number;
    kinds?: Array<'CREATE' | 'CHANGE' | 'REDEPLOY' | 'DECOMMISSION'>;
  }) {
    const kinds = new Set(input.kinds?.length ? input.kinds : ['CHANGE', 'REDEPLOY', 'DECOMMISSION']);
    const entry = [...this.reservedVmOperations.entries()]
      .filter(
        ([, operation]) =>
          kinds.has(operation.kind as 'CREATE' | 'CHANGE' | 'REDEPLOY' | 'DECOMMISSION') &&
          operation.errorCode !== 'RESERVED_VM_CANCEL_REQUESTED' &&
          ['PENDING', 'APPLYING'].includes(operation.status) &&
          (!operation.leaseExpiresAt || Date.parse(operation.leaseExpiresAt) <= Date.now()),
      )
      .sort((left, right) => left[1].createdAt.localeCompare(right[1].createdAt))[0];

    if (!entry) return undefined;

    const [key, operation] = entry;
    const deployment = this.deployments.get(operation.deploymentId)!;
    const runtimeFence = (this.reservedVmRuntimeFences.get(operation.deploymentId) ?? 0) + 1;
    this.reservedVmRuntimeFences.set(operation.deploymentId, runtimeFence);
    const claimed: ReservedVmLease = {
      ...operation,
      status: 'APPLYING',
      phase: operation.phase === 'RUNTIME_APPLIED' ? 'RUNTIME_APPLIED' : 'LEASED',
      leaseOwner: input.ownerToken,
      leaseExpiresAt: new Date(Date.now() + input.ttlMs).toISOString(),
      fencingToken: runtimeFence,
      updatedAt: now(),
    };
    this.reservedVmOperations.set(key, claimed);

    return { operation: claimed, deployment };
  }

  async deferReservedVmRecovery(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
    retryClass: 'TRANSIENT' | 'MANUAL';
  }) {
    const entry = [...this.reservedVmOperations.entries()].find(([, operation]) => operation.id === input.operationId);
    const operation = entry?.[1];
    if (
      !entry ||
      !operation ||
      !['PENDING', 'APPLYING'].includes(operation.status) ||
      operation.leaseOwner !== input.ownerToken ||
      operation.fencingToken !== input.fencingToken ||
      !operation.leaseExpiresAt ||
      Date.parse(operation.leaseExpiresAt) <= Date.now()
    ) {
      throw Object.assign(new Error('RESERVED_VM_OPERATION_FENCE_LOST'), {
        code: 'RESERVED_VM_OPERATION_FENCE_LOST',
        statusCode: 409,
      });
    }
    const priorRecovery =
      operation.response?.recovery &&
      typeof operation.response.recovery === 'object' &&
      !Array.isArray(operation.response.recovery)
        ? (operation.response.recovery as Record<string, unknown>)
        : {};
    const attempts =
      typeof priorRecovery.attempts === 'number' && Number.isSafeInteger(priorRecovery.attempts)
        ? Math.min(30, priorRecovery.attempts + 1)
        : 1;
    const delayMs =
      input.retryClass === 'MANUAL' ? 24 * 60 * 60_000 : Math.min(5 * 60_000, 5_000 * 2 ** Math.min(6, attempts - 1));
    const deferredUntil = new Date(Date.now() + delayMs).toISOString();
    const deferred: ReservedVmLease = {
      ...operation,
      leaseOwner: undefined,
      leaseExpiresAt: deferredUntil,
      errorCode: input.errorCode.replace(/[^A-Za-z0-9_.:-]/gu, '_').slice(0, 120) || 'RECOVERY_FAILED',
      errorMessage: input.errorMessage.replace(/[\r\n\t]+/gu, ' ').slice(0, 1_000),
      response: {
        ...(operation.response ?? {}),
        recovery: { attempts, retryClass: input.retryClass, deferredUntil },
      },
      updatedAt: now(),
    };
    this.reservedVmOperations.set(entry[0], deferred);
    return deferred;
  }

  private _assertNoActiveProjectReleaseBarrier(projectId: string): void {
    const active = [...this.projectCheckpoints.values()].some(
      (checkpoint) =>
        checkpoint.barrierProjectId === projectId &&
        checkpoint.barrierExpiresAt &&
        Date.parse(checkpoint.barrierExpiresAt) > Date.now(),
    );

    if (active) {
      throw Object.assign(new Error('CHECKPOINT_BARRIER_ACTIVE'), {
        code: 'CHECKPOINT_BARRIER_ACTIVE',
        statusCode: 423,
      });
    }
  }

  private _validateReservedVmReleaseManifest(input: {
    manifest: ReleaseManifestRecord;
    organizationId: string;
    projectId: string;
    deployment: DeploymentRecord;
    promotion: unknown;
  }) {
    if (!input.deployment.machineSize || !input.manifest.planEntitlements || !input.manifest.projectManifestDigest) {
      throw new Error('RESERVED_VM_RELEASE_SOURCE_INVALID');
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
      throw new Error('RESERVED_VM_RELEASE_SOURCE_INVALID');
    }

    return pins;
  }

  private _reservedVmPublishCandidate(
    input: {
      projectId: string;
      deploymentId: string;
      organizationId: string;
      expectedRuntimeVersion: number;
      releaseFence: ProjectReleaseFence;
    },
    sourceReleaseManifestId?: string,
  ): { deployment: DeploymentRecord; releaseSource: ReleaseManifestRecord; replayed: boolean } {
    const deployment = this.deployments.get(input.deploymentId);
    const project = this.projects.get(input.projectId);
    const metadata = (deployment?.metadata ?? {}) as Record<string, unknown>;
    const serverDeploy = metadata.serverDeploy as Record<string, unknown> | undefined;
    const image = serverDeploy?.image as Record<string, unknown> | undefined;

    if (!deployment || deployment.projectId !== input.projectId) throw new Error('DEPLOYMENT_NOT_FOUND');
    if (!project || project.organizationId !== input.organizationId) {
      throw Object.assign(new Error('RESERVED_VM_TENANT_FORBIDDEN'), {
        code: 'RESERVED_VM_TENANT_FORBIDDEN',
        statusCode: 403,
      });
    }
    if (
      deployment.runtimeKind !== 'reserved-vm' ||
      deployment.provider !== 'server' ||
      deployment.status !== 'READY' ||
      deployment.reservedVmBillingState !== 'CURRENT' ||
      metadata.projectManifestDigest !== input.releaseFence.expectedManifestDigest
    ) {
      throw Object.assign(new Error('RESERVED_VM_DEPLOYMENT_NOT_READY'), {
        code: 'RESERVED_VM_DEPLOYMENT_NOT_READY',
        statusCode: 409,
      });
    }

    if (deployment.environment === 'production') {
      const releaseSource = this.releaseManifests.find(
        (manifest) =>
          manifest.id === sourceReleaseManifestId &&
          manifest.projectId === input.projectId &&
          manifest.deploymentId === input.deploymentId,
      );
      const committedProductionRelease = releaseSource
        ? this.releaseManifests.find(
            (manifest) =>
              manifest.projectId === input.projectId &&
              manifest.deploymentId === input.deploymentId &&
              manifest.environment === 'production' &&
              manifest.artifactRef === releaseSource.artifactRef &&
              manifest.artifactDigest === releaseSource.artifactDigest &&
              manifest.accessPolicyVersion === releaseSource.accessPolicyVersion,
          )
        : undefined;
      const releaseSourcePin = parseReleasePlanEntitlementsPin(releaseSource?.planEntitlements);
      const committedProductionPin = parseReleasePlanEntitlementsPin(committedProductionRelease?.planEntitlements);
      const releaseSourcePins = releaseSource
        ? this._validateReservedVmReleaseManifest({
            manifest: releaseSource,
            organizationId: input.organizationId,
            projectId: input.projectId,
            deployment,
            promotion: serverDeploy?.promotion,
          })
        : undefined;
      const committedProductionPins = committedProductionRelease
        ? this._validateReservedVmReleaseManifest({
            manifest: committedProductionRelease,
            organizationId: input.organizationId,
            projectId: input.projectId,
            deployment,
            promotion: serverDeploy?.promotion,
          })
        : undefined;

      if (
        metadata.publishedFromReleaseManifestId === sourceReleaseManifestId &&
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
        return { deployment, releaseSource, replayed: true };
      }

      throw Object.assign(new Error('RESERVED_VM_RELEASE_REPLAY_CONFLICT'), {
        code: 'RESERVED_VM_RELEASE_REPLAY_CONFLICT',
        statusCode: 409,
      });
    }
    if ((deployment.runtimeVersion ?? 0) !== input.expectedRuntimeVersion) {
      throw Object.assign(new Error('RESERVED_VM_RUNTIME_VERSION_CONFLICT'), {
        code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT',
        statusCode: 409,
      });
    }
    if (
      [...this.reservedVmOperations.values()].some(
        (operation) => operation.deploymentId === deployment.id && ['PENDING', 'APPLYING'].includes(operation.status),
      )
    ) {
      throw Object.assign(new Error('RESERVED_VM_CHANGE_IN_PROGRESS'), {
        code: 'RESERVED_VM_CHANGE_IN_PROGRESS',
        statusCode: 409,
      });
    }

    const releaseSource = this.releaseManifests
      .filter(
        (manifest) =>
          manifest.projectId === input.projectId &&
          manifest.deploymentId === input.deploymentId &&
          manifest.environment === deployment.environment &&
          (!sourceReleaseManifestId || manifest.id === sourceReleaseManifestId),
      )
      .sort((left, right) => right.version - left.version)[0];
    const releaseSourcePin = parseReleasePlanEntitlementsPin(releaseSource?.planEntitlements);
    const releaseSourcePins = releaseSource
      ? this._validateReservedVmReleaseManifest({
          manifest: releaseSource,
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
      throw Object.assign(new Error('RESERVED_VM_RELEASE_SOURCE_INVALID'), {
        code: 'RESERVED_VM_RELEASE_SOURCE_INVALID',
        statusCode: 409,
      });
    }

    return { deployment, releaseSource, replayed: false };
  }

  async prepareReservedVmPublish(input: {
    projectId: string;
    deploymentId: string;
    organizationId: string;
    actorUserId: string;
    expectedRuntimeVersion: number;
    releaseFence: ProjectReleaseFence;
  }) {
    await this.assertProjectReleaseBarrier({ projectId: input.projectId, ...input.releaseFence });
    return this._reservedVmPublishCandidate(input);
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
  }) {
    await this.assertProjectReleaseBarrier({ projectId: input.projectId, ...input.releaseFence });
    const { deployment, releaseSource, replayed } = this._reservedVmPublishCandidate(
      input,
      input.sourceReleaseManifestId,
    );
    const metadata = (deployment.metadata ?? {}) as Record<string, unknown>;
    const serverDeploy = metadata.serverDeploy as Record<string, unknown> | undefined;
    const releaseSourcePin = parseReleasePlanEntitlementsPin(releaseSource.planEntitlements);

    if (!releaseSourcePin || releaseSource.projectManifestDigest !== input.releaseFence.expectedManifestDigest) {
      throw new Error('RESERVED_VM_RELEASE_SOURCE_INVALID');
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
      throw new Error('RESERVED_VM_RELEASE_SOURCE_INVALID');
    }

    if (replayed) return deployment;

    const updated: DeploymentRecord = {
      ...deployment,
      environment: 'production',
      productionUrl: input.productionUrl,
      metadata: {
        ...((deployment.metadata ?? {}) as Record<string, unknown>),
        publishedInPlaceAt: now(),
        publishedFrom: deployment.id,
        publishedFromReleaseManifestId: releaseSource.id,
      },
      updatedAt: now(),
    };
    const latestVersion = this.releaseManifests
      .filter((manifest) => manifest.projectId === input.projectId && manifest.environment === 'production')
      .reduce((version, manifest) => Math.max(version, manifest.version), 0);
    this.releaseManifests.push({
      ...releaseSource,
      id: id('release_manifest'),
      environment: 'production',
      version: latestVersion + 1,
      dbMigrationPoint: input.dbMigrationPoint,
      runtimeSpec: input.runtimeSpec,
      promotionEvidence: input.promotionEvidence,
      createdAt: now(),
    });
    this.deployments.set(deployment.id, updated);
    return updated;
  }

  async markReservedVmRuntimeApplied(input: { operationId: string; ownerToken: string; fencingToken: number }) {
    const entry = [...this.reservedVmOperations.entries()].find(([, operation]) => operation.id === input.operationId);
    if (!entry) return false;
    const [key, operation] = entry;
    if (
      operation.status !== 'APPLYING' ||
      operation.leaseOwner !== input.ownerToken ||
      operation.fencingToken !== input.fencingToken ||
      !operation.leaseExpiresAt ||
      Date.parse(operation.leaseExpiresAt) <= Date.now()
    ) {
      return false;
    }
    this.reservedVmOperations.set(key, { ...operation, phase: 'RUNTIME_APPLIED', updatedAt: now() });
    return true;
  }

  async commitReservedVmOperation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    response: Record<string, unknown>;
  }) {
    const entry = [...this.reservedVmOperations.entries()].find(([, operation]) => operation.id === input.operationId);
    if (!entry) throw new Error('RESERVED_VM_OPERATION_NOT_FOUND');
    const [key, operation] = entry;
    const deployment = this.deployments.get(operation.deploymentId)!;
    if (operation.status === 'COMPLETED') {
      return { operation: publicReservedVmOperation(operation), deployment };
    }
    if (
      operation.status !== 'APPLYING' ||
      operation.phase !== 'RUNTIME_APPLIED' ||
      operation.leaseOwner !== input.ownerToken ||
      operation.fencingToken !== input.fencingToken
    ) {
      throw new Error('RESERVED_VM_OPERATION_FENCE_LOST');
    }
    const startsBillingCycle =
      operation.targetRuntimeKind === 'reserved-vm' &&
      (operation.fromRuntimeKind !== 'reserved-vm' || deployment.reservedVmBillingState === 'SUSPENDED');
    const periodStart = startsBillingCycle ? now() : deployment.reservedVmCurrentPeriodStart;
    const periodEnd = startsBillingCycle
      ? new Date(Date.parse(periodStart!) + 31 * 24 * 60 * 60_000).toISOString()
      : deployment.reservedVmNextChargeAt;
    const updatedDeployment: DeploymentRecord = {
      ...deployment,
      runtimeKind: operation.targetRuntimeKind,
      runtimeVersion: (deployment.runtimeVersion ?? 0) + 1,
      machineSize: operation.targetMachineSize,
      reservedVmTier: operation.targetTier,
      reservedVmPriceCents: operation.targetRuntimeKind === 'reserved-vm' ? operation.targetPriceCents : undefined,
      reservedVmTermsVersion: operation.targetRuntimeKind === 'reserved-vm' ? operation.termsVersion : undefined,
      reservedVmRateCardVersion:
        operation.targetRuntimeKind === 'reserved-vm'
          ? (operation.rateCardVersion ?? deployment.reservedVmRateCardVersion)
          : undefined,
      reservedVmBillingReservationId:
        operation.targetRuntimeKind === 'reserved-vm'
          ? (operation.billingReservationId ?? deployment.reservedVmBillingReservationId)
          : undefined,
      reservedVmBillingState:
        operation.targetRuntimeKind === 'reserved-vm'
          ? startsBillingCycle
            ? 'CURRENT'
            : deployment.reservedVmBillingState
          : undefined,
      reservedVmCurrentPeriodStart: operation.targetRuntimeKind === 'reserved-vm' ? periodStart : undefined,
      reservedVmNextChargeAt: operation.targetRuntimeKind === 'reserved-vm' ? periodEnd : undefined,
      reservedVmGraceEndsAt:
        operation.targetRuntimeKind === 'reserved-vm' && !startsBillingCycle
          ? deployment.reservedVmGraceEndsAt
          : undefined,
      reservedVmStopRequestedAt:
        operation.targetRuntimeKind === 'reserved-vm' && !startsBillingCycle
          ? deployment.reservedVmStopRequestedAt
          : undefined,
      persistentStorageClaim: deployment.persistentStorageClaim ?? `reserved-data-${deployment.id}`,
      updatedAt: now(),
    };
    const completed: ReservedVmLease = {
      ...operation,
      status: 'COMPLETED',
      phase: 'COMMITTED',
      response: { ...(operation.response ?? {}), ...input.response },
      completedAt: now(),
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now(),
    };
    this.deployments.set(deployment.id, updatedDeployment);
    this.reservedVmOperations.set(key, completed);
    return { operation: publicReservedVmOperation(completed), deployment: updatedDeployment };
  }

  async commitReservedVmDecommissionOperation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    deletedPersistentStorageClaim: string;
    response: Record<string, unknown>;
  }) {
    const entry = [...this.reservedVmOperations.entries()].find(([, operation]) => operation.id === input.operationId);
    if (!entry) throw new Error('RESERVED_VM_OPERATION_NOT_FOUND');
    const [key, operation] = entry;
    const deployment = this.deployments.get(operation.deploymentId)!;

    if (operation.status === 'COMPLETED') {
      return { operation: publicReservedVmOperation(operation), deployment };
    }
    if (
      operation.kind !== 'DECOMMISSION' ||
      operation.status !== 'APPLYING' ||
      operation.phase !== 'RUNTIME_APPLIED' ||
      operation.leaseOwner !== input.ownerToken ||
      operation.fencingToken !== input.fencingToken ||
      (deployment.runtimeVersion ?? 0) !== operation.expectedRuntimeVersion ||
      deployment.runtimeKind !== 'autoscale' ||
      deployment.persistentStorageClaim !== input.deletedPersistentStorageClaim ||
      input.deletedPersistentStorageClaim !== `reserved-data-${deployment.id}`
    ) {
      throw new Error('RESERVED_VM_OPERATION_FENCE_LOST');
    }

    const updatedDeployment: DeploymentRecord = {
      ...deployment,
      persistentStorageClaim: undefined,
      runtimeVersion: (deployment.runtimeVersion ?? 0) + 1,
      updatedAt: now(),
    };
    const completed: ReservedVmLease = {
      ...operation,
      status: 'COMPLETED',
      phase: 'COMMITTED',
      response: input.response,
      completedAt: now(),
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now(),
    };
    this.deployments.set(deployment.id, updatedDeployment);
    this.reservedVmOperations.set(key, completed);
    return { operation: publicReservedVmOperation(completed), deployment: updatedDeployment };
  }

  async commitReservedVmCreateCancellation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    deletedPersistentStorageClaim: string;
    logs: DeploymentRecord['logs'];
  }) {
    const entry = [...this.reservedVmOperations.entries()].find(([, operation]) => operation.id === input.operationId);
    if (!entry) throw new Error('RESERVED_VM_OPERATION_NOT_FOUND');
    const [key, operation] = entry;
    const deployment = this.deployments.get(operation.deploymentId)!;

    if (operation.status === 'FAILED' && deployment.status === 'CANCELED') {
      return { operation: publicReservedVmOperation(operation), deployment, replayed: true };
    }
    if (
      operation.kind !== 'CREATE' ||
      operation.status !== 'APPLYING' ||
      operation.phase !== 'LEASED' ||
      operation.errorCode !== 'RESERVED_VM_CANCEL_REQUESTED' ||
      operation.leaseOwner !== input.ownerToken ||
      operation.fencingToken !== input.fencingToken ||
      deployment.persistentStorageClaim !== input.deletedPersistentStorageClaim ||
      input.deletedPersistentStorageClaim !== `reserved-data-${deployment.id}`
    ) {
      throw new Error('RESERVED_VM_OPERATION_FENCE_LOST');
    }

    const canceledDeployment: DeploymentRecord = {
      ...deployment,
      status: 'CANCELED',
      canceledAt: now(),
      finishedAt: now(),
      logs: input.logs,
      runtimeKind: 'autoscale',
      persistentStorageClaim: undefined,
      reservedVmTier: undefined,
      reservedVmPriceCents: undefined,
      reservedVmTermsVersion: undefined,
      reservedVmRateCardVersion: undefined,
      reservedVmBillingReservationId: undefined,
      reservedVmBillingState: undefined,
      reservedVmCurrentPeriodStart: undefined,
      reservedVmNextChargeAt: undefined,
      reservedVmGraceEndsAt: undefined,
      reservedVmStopRequestedAt: undefined,
      updatedAt: now(),
    };
    const failed: ReservedVmLease = {
      ...operation,
      status: 'FAILED',
      phase: 'ROLLED_BACK',
      errorCode: 'DEPLOYMENT_CANCELED_BY_USER',
      errorMessage: 'DEPLOYMENT_CANCELED_BY_USER',
      response: {
        canceled: true,
        persistentStorageClaimName: input.deletedPersistentStorageClaim,
        persistentStorageClaimAbsent: true,
      },
      completedAt: now(),
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now(),
    };
    this.deployments.set(deployment.id, canceledDeployment);
    this.reservedVmOperations.set(key, failed);
    return { operation: publicReservedVmOperation(failed), deployment: canceledDeployment, replayed: false };
  }

  async failReservedVmOperation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
    createCleanup?: { deletedPersistentStorageClaim: string };
  }) {
    const entry = [...this.reservedVmOperations.entries()].find(([, operation]) => operation.id === input.operationId);
    if (!entry) throw new Error('RESERVED_VM_OPERATION_NOT_FOUND');
    const [key, operation] = entry;
    if (operation.status === 'FAILED') return publicReservedVmOperation(operation);
    if (
      operation.status !== 'APPLYING' ||
      operation.leaseOwner !== input.ownerToken ||
      operation.fencingToken !== input.fencingToken
    ) {
      throw new Error('RESERVED_VM_OPERATION_FENCE_LOST');
    }

    if (operation.kind === 'CREATE') {
      const deployment = this.deployments.get(operation.deploymentId)!;
      const canonicalClaim = `reserved-data-${operation.deploymentId}`;

      if (
        input.createCleanup?.deletedPersistentStorageClaim !== canonicalClaim ||
        deployment.persistentStorageClaim !== canonicalClaim
      ) {
        throw new Error('RESERVED_VM_CREATE_CLEANUP_UNVERIFIED');
      }

      this.deployments.set(deployment.id, {
        ...deployment,
        runtimeKind: 'autoscale',
        persistentStorageClaim: undefined,
        reservedVmTier: undefined,
        reservedVmPriceCents: undefined,
        reservedVmTermsVersion: undefined,
        reservedVmRateCardVersion: undefined,
        reservedVmBillingReservationId: undefined,
        reservedVmBillingState: undefined,
        reservedVmCurrentPeriodStart: undefined,
        reservedVmNextChargeAt: undefined,
        reservedVmGraceEndsAt: undefined,
        reservedVmStopRequestedAt: undefined,
        updatedAt: now(),
      });
    }
    const failed: ReservedVmLease = {
      ...operation,
      status: 'FAILED',
      phase: 'ROLLED_BACK',
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      completedAt: now(),
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now(),
    };
    this.reservedVmOperations.set(key, failed);
    return publicReservedVmOperation(failed);
  }

  async getDeploymentOwnerStatus(deploymentId: string) {
    const deployment = this.deployments.get(deploymentId);

    if (!deployment) {
      return undefined;
    }
    const project = this.projects.get(deployment.projectId);

    const subscription = project ? this.subscriptions.get(project.organizationId) : undefined;

    return {
      projectId: deployment.projectId,
      status: deployment.status,
      projectDeletedAt: project?.deletedAt ?? null,
      createdAt: (deployment as any).createdAt ?? now(),
      environmentName: (deployment as any).environment,
      organizationId: project?.organizationId,
      planKey: subscription?.status === 'ACTIVE' ? subscription.planKey : undefined,
      // Keep parity with PrismaApiStore's owner-status projection.
      metadata: deployment.metadata,
    };
  }

  async getDeploymentAccessContext(deploymentId: string): Promise<DeploymentAccessContext | undefined> {
    const deployment = this.deployments.get(deploymentId);

    if (!deployment) {
      return undefined;
    }

    const project = this.projects.get(deployment.projectId);

    if (!project) {
      return undefined;
    }

    const policy = this.deploymentAccessPolicies.find(
      (candidate) =>
        candidate.projectId === deployment.projectId &&
        candidate.environment === deployment.environment &&
        candidate.version === deployment.accessPolicyVersion,
    );

    return {
      deploymentId,
      projectId: deployment.projectId,
      organizationId: project.organizationId,
      environment: deployment.environment,
      deploymentStatus: deployment.status,
      projectDeletedAt: project.deletedAt,
      policy,
    };
  }

  async getDeploymentAccessPolicy(deploymentId: string) {
    return (await this.getDeploymentAccessContext(deploymentId))?.policy;
  }

  async getDeploymentAccessPolicyVersion(input: { projectId: string; environment: string; version: number }) {
    const policy = this.deploymentAccessPolicies.find(
      (candidate) =>
        candidate.projectId === input.projectId &&
        candidate.environment === input.environment &&
        candidate.version === input.version,
    );
    return isValidDeploymentAccessPolicyRecord(policy) ? policy : undefined;
  }

  async setDeploymentAccessPolicy(input: SetDeploymentAccessPolicyInput) {
    const deployment = await this.getDeployment(input.projectId, input.deploymentId);

    if (!deployment) {
      return undefined;
    }
    const project = this.projects.get(deployment.projectId);

    if (!project) {
      return undefined;
    }

    if (input.expectedVersion !== undefined && deployment.accessPolicyVersion !== input.expectedVersion) {
      throw Object.assign(new Error('DEPLOYMENT_ACCESS_POLICY_VERSION_CONFLICT'), {
        statusCode: 409,
        code: 'DEPLOYMENT_ACCESS_POLICY_VERSION_CONFLICT',
      });
    }

    if (deployment.status === 'READY' && (!input.releaseSource || !input.releaseFence)) {
      throw Object.assign(new Error('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_REQUIRED'), {
        statusCode: 409,
        code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_REQUIRED',
      });
    }

    if (
      input.releaseSource &&
      (input.releaseSource.projectId !== deployment.projectId ||
        input.releaseSource.environment !== deployment.environment ||
        input.releaseSource.deploymentId !== deployment.id ||
        !parseReleasePlanEntitlementsPin(input.releaseSource.planEntitlements) ||
        !input.releaseSource.projectManifestDigest ||
        !PROJECT_MANIFEST_DIGEST_PATTERN.test(input.releaseSource.projectManifestDigest))
    ) {
      throw Object.assign(new Error('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH'), {
        statusCode: 409,
        code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
      });
    }

    if (input.releaseSource) {
      const currentProjectManifest = await this.getLatestProjectManifest(deployment.projectId);
      const releaseHead = this.releaseManifests
        .filter(
          (manifest) => manifest.projectId === deployment.projectId && manifest.environment === deployment.environment,
        )
        .sort((left, right) => right.version - left.version)[0];

      if (
        !input.releaseFence ||
        input.releaseFence.expectedOrganizationId !== project.organizationId ||
        input.releaseFence.expectedManifestDigest !== currentProjectManifest?.digest ||
        releaseHead?.id !== input.releaseSource.id
      ) {
        throw Object.assign(new Error('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH'), {
          statusCode: 409,
          code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
        });
      }
    }

    const mode = normalizeDeploymentAccessMode(input.mode);
    const passwordHash = input.passwordHash?.trim();

    if ((mode === 'PASSWORD_PROTECTED') !== Boolean(passwordHash)) {
      throw Object.assign(new Error('DEPLOYMENT_ACCESS_PASSWORD_INVALID'), {
        statusCode: 400,
        code: 'DEPLOYMENT_ACCESS_PASSWORD_INVALID',
      });
    }

    const version =
      this.deploymentAccessPolicies
        .filter((policy) => policy.projectId === deployment.projectId && policy.environment === deployment.environment)
        .reduce((max, policy) => Math.max(max, policy.version), 0) + 1;
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
        throw Object.assign(new Error('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH'), {
          statusCode: 409,
          code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
        });
      }

      const sourcePromotion = parseServerRollbackPromotionEvidence(input.releaseSource.promotionEvidence);
      const sourcePlanEntitlements = parseReleasePlanEntitlementsPin(input.releaseSource.planEntitlements);

      if (!sourcePlanEntitlements || !input.releaseSource.projectManifestDigest) {
        throw Object.assign(new Error('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH'), {
          statusCode: 409,
          code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
        });
      }
      const validated = validateServerReleaseCommitPins({
        runtimeSpec: input.releaseSource.runtimeSpec,
        promotionEvidence: input.releaseSource.promotionEvidence,
        organizationId: project.organizationId,
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
        throw Object.assign(new Error('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH'), {
          statusCode: 409,
          code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
        });
      }
      reboundServerRuntimeSpec = rebindServerRollbackRuntimeSpecAccessPolicy(
        validated.runtimeSpec,
        version,
        input.releaseDatabasePin,
      );
      retainedServerPromotionEvidence = validated.promotionEvidence;

      validateServerReleaseCommitPins({
        runtimeSpec: reboundServerRuntimeSpec,
        promotionEvidence: retainedServerPromotionEvidence,
        organizationId: project.organizationId,
        projectId: deployment.projectId,
        environment: input.releaseSource.environment,
        projectManifestDigest: input.releaseSource.projectManifestDigest,
        planEntitlements: sourcePlanEntitlements,
        accessPolicyVersion: version,
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
        staticEvidence.environment !== deployment.environment ||
        staticEvidence.sourceDeploymentId !== deployment.rolledBackFromId ||
        staticEvidence.artifactRef !== input.releaseSource.artifactRef ||
        staticEvidence.artifactDigest !== input.releaseSource.artifactDigest
      ) {
        throw Object.assign(new Error('DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH'), {
          statusCode: 409,
          code: 'DEPLOYMENT_ACCESS_RELEASE_MANIFEST_MISMATCH',
        });
      }

      retainedServerPromotionEvidence = staticEvidence;
    }
    const policy: DeploymentAccessPolicyRecord = {
      id: id('access_policy'),
      projectId: deployment.projectId,
      environment: deployment.environment,
      version,
      mode,
      revision: id('access_revision'),
      passwordHash,
      createdByUserId: input.createdByUserId,
      createdAt: now(),
    };
    this.deploymentAccessPolicies.push(policy);

    if (input.releaseSource) {
      const latestVersion = this.releaseManifests
        .filter(
          (manifest) => manifest.projectId === deployment.projectId && manifest.environment === deployment.environment,
        )
        .reduce((max, manifest) => Math.max(max, manifest.version), 0);
      this.releaseManifests.push({
        ...input.releaseSource,
        id: id('release_manifest'),
        deploymentId: deployment.id,
        version: latestVersion + 1,
        accessPolicyVersion: version,
        runtimeSpec: reboundServerRuntimeSpec ?? input.releaseSource.runtimeSpec,
        promotionEvidence: retainedServerPromotionEvidence ?? input.releaseSource.promotionEvidence,
        dbMigrationPoint:
          input.releaseDatabasePin === undefined
            ? input.releaseSource.dbMigrationPoint
            : input.releaseDatabasePin.mode === 'exact-ledger'
              ? input.releaseDatabasePin.ledgerDigest
              : undefined,
        createdAt: now(),
      });
    }

    this.deployments.set(deployment.id, { ...deployment, accessPolicyVersion: version, updatedAt: now() });

    return policy;
  }

  async isDeploymentAccessUserAuthorized(input: {
    deploymentId: string;
    userId: string;
    mode: Extract<DeploymentAccessMode, 'WORKSPACE_ONLY' | 'INVITE_ONLY'>;
  }) {
    const deployment = this.deployments.get(input.deploymentId);
    const project = deployment ? this.projects.get(deployment.projectId) : undefined;

    if (!deployment || !project || project.deletedAt) {
      return false;
    }

    const membership = [...this.memberships.values()].find(
      (candidate) =>
        candidate.organizationId === project.organizationId &&
        candidate.userId === input.userId &&
        candidate.state === 'ACTIVE',
    );

    if (input.mode === 'WORKSPACE_ONLY') {
      return membership?.state === 'ACTIVE';
    }

    if (membership?.state === 'ACTIVE' && (membership.roleKey === 'owner' || membership.roleKey === 'admin')) {
      return true;
    }

    const collaborator = [...this.projectCollaborators.values()].find(
      (candidate) => candidate.projectId === project.id && candidate.userId === input.userId,
    );

    if (collaborator && (!collaborator.expiresAt || new Date(collaborator.expiresAt).getTime() > Date.now())) {
      return true;
    }

    return [...this.resourceAccessGrants.values()].some((grant) => {
      if (
        grant.organizationId !== project.organizationId ||
        grant.status !== 'ACTIVE' ||
        !grant.acceptedAt ||
        grant.revokedAt ||
        new Date(grant.expiresAt).getTime() <= Date.now() ||
        !(
          (grant.resourceType === 'PROJECT' && grant.resourceId === project.id) ||
          (grant.resourceType === 'DEPLOYMENT' && grant.resourceId === deployment.id)
        )
      ) {
        return false;
      }

      if (grant.subjectType === 'USER') {
        return grant.subjectUserId === input.userId;
      }

      return [...this.collaborationGroupMembers.values()].some(
        (member) =>
          member.groupId === grant.subjectGroupId && member.userId === input.userId && membership?.state === 'ACTIVE',
      );
    });
  }

  async issueDeploymentAccessExchangeTicket(input: {
    deploymentId: string;
    userId: string;
    tokenHash: string;
    ttlSeconds: number;
  }): Promise<DeploymentAccessTicketMutationResult> {
    return this.withSerializedMutation(`account-purge:${input.userId}`, async () => {
      const context = await this.getDeploymentAccessContext(input.deploymentId);

      if (!context || context.projectDeletedAt || context.deploymentStatus !== 'READY') {
        return { ok: false, reason: 'DEPLOYMENT_NOT_FOUND' };
      }

      if (!context.policy) {
        return { ok: false, reason: 'POLICY_INVALID' };
      }

      if (context.policy.mode !== 'WORKSPACE_ONLY' && context.policy.mode !== 'INVITE_ONLY') {
        return { ok: false, reason: 'POLICY_NOT_PRIVATE' };
      }

      if (
        !(await this.isDeploymentAccessUserAuthorized({
          deploymentId: input.deploymentId,
          userId: input.userId,
          mode: context.policy.mode,
        }))
      ) {
        return { ok: false, reason: 'ACCESS_DENIED' };
      }

      const expiresAt = new Date(Date.now() + Math.max(1, Math.min(300, input.ttlSeconds)) * 1000).toISOString();
      this.deploymentAccessExchangeTickets.set(input.tokenHash, {
        deploymentId: input.deploymentId,
        userId: input.userId,
        policyVersion: context.policy.version,
        policyRevision: context.policy.revision,
        expiresAt,
      });

      return { ok: true, policy: context.policy, userId: input.userId, expiresAt };
    });
  }

  async consumeDeploymentAccessExchangeTicket(input: {
    deploymentId: string;
    tokenHash: string;
  }): Promise<DeploymentAccessTicketMutationResult> {
    const ticket = this.deploymentAccessExchangeTickets.get(input.tokenHash);

    if (!ticket || ticket.deploymentId !== input.deploymentId) {
      return { ok: false, reason: 'TICKET_NOT_FOUND' };
    }

    if (ticket.consumedAt) {
      return { ok: false, reason: 'TICKET_REPLAYED' };
    }

    if (new Date(ticket.expiresAt).getTime() <= Date.now()) {
      return { ok: false, reason: 'TICKET_EXPIRED' };
    }

    ticket.consumedAt = now();

    const context = await this.getDeploymentAccessContext(input.deploymentId);

    if (!context || context.projectDeletedAt || context.deploymentStatus !== 'READY') {
      return { ok: false, reason: 'DEPLOYMENT_NOT_FOUND' };
    }

    if (!context.policy) {
      return { ok: false, reason: 'POLICY_INVALID' };
    }

    if (
      context.policy.version !== ticket.policyVersion ||
      context.policy.revision !== ticket.policyRevision ||
      (context.policy.mode !== 'WORKSPACE_ONLY' && context.policy.mode !== 'INVITE_ONLY')
    ) {
      return { ok: false, reason: 'POLICY_CHANGED' };
    }

    if (
      !(await this.isDeploymentAccessUserAuthorized({
        deploymentId: input.deploymentId,
        userId: ticket.userId,
        mode: context.policy.mode,
      }))
    ) {
      return { ok: false, reason: 'ACCESS_DENIED' };
    }

    return { ok: true, policy: context.policy, userId: ticket.userId, expiresAt: ticket.expiresAt };
  }

  async updateDeployment(
    projectId: string,
    deploymentId: string,
    input: Partial<Omit<DeploymentRecord, 'id' | 'projectId' | 'createdAt'>>,
  ) {
    const deployment = await this.getDeployment(projectId, deploymentId);

    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const updated: DeploymentRecord = { ...deployment, ...input, updatedAt: now() };
    this.deployments.set(updated.id, updated);

    return updated;
  }

  async listDeployments(projectId: string) {
    /*
     * NEWEST FIRST, like the real store (`prisma-store.ts` orders
     * `createdAt: 'desc'`). This double used to return raw Map insertion order,
     * i.e. OLDEST first — so any code taking `[0]` as "the current release"
     * behaved one way in production and the opposite way under test. SEC-13
     * (inheriting a deployment's access config on re-publish) is exactly such
     * code, and the divergence made a wrong implementation look correct.
     *
     * Reverse first, then sort by createdAt descending: the sort is stable, so
     * deployments created within the same millisecond — routine in tests — keep
     * newest-inserted first instead of resolving to the oldest.
     */
    return [...this.deployments.values()]
      .filter((deployment) => deployment.projectId === projectId)
      .reverse()
      .sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''));
  }

  async listStaleDeployments(cutoffIso: string) {
    const cutoff = new Date(cutoffIso).getTime();

    return [...this.deployments.values()].filter(
      (deployment) =>
        (deployment.status === 'QUEUED' || deployment.status === 'BUILDING') &&
        new Date(deployment.updatedAt ?? deployment.createdAt).getTime() < cutoff,
    );
  }

  async listActiveServerDeployments() {
    return [...this.deployments.values()].filter(
      (deployment) => deployment.provider === 'server' && deployment.status === 'READY',
    );
  }

  readonly releaseManifests: ReleaseManifestRecord[] = [];
  readonly rollbackOperations = new Map<string, RollbackOperationRecord>();

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
  }): Promise<ReleaseManifestRecord> {
    const deployment = this.deployments.get(input.deploymentId);
    const planEntitlements = parseReleasePlanEntitlementsPin(input.planEntitlements);
    const deploymentPlanEntitlements = parseReleasePlanEntitlementsPin(
      (deployment?.metadata as { planEntitlements?: unknown } | undefined)?.planEntitlements,
    );
    const policy = this.deploymentAccessPolicies.find(
      (candidate) =>
        candidate.projectId === input.projectId &&
        candidate.environment === input.environment &&
        candidate.version === input.accessPolicyVersion,
    );

    if (
      !deployment ||
      deployment.projectId !== input.projectId ||
      deployment.environment !== input.environment ||
      deployment.accessPolicyVersion !== input.accessPolicyVersion ||
      !policy ||
      !planEntitlements ||
      !sameReleasePlanEntitlementsPin(planEntitlements, deploymentPlanEntitlements) ||
      !PROJECT_MANIFEST_DIGEST_PATTERN.test(input.projectManifestDigest) ||
      (deployment.metadata as { projectManifestDigest?: unknown } | undefined)?.projectManifestDigest !==
        input.projectManifestDigest
    ) {
      throw Object.assign(new Error('A release manifest must pin the deployment exact valid access policy.'), {
        code: 'RELEASE_ACCESS_POLICY_INVALID',
      });
    }

    if (input.artifactKind === 'server-image') {
      const project = this.projects.get(input.projectId);
      const serverDeploy = (deployment.metadata as Record<string, unknown> | undefined)?.serverDeploy as
        | Record<string, unknown>
        | undefined;
      if (
        !project ||
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
        organizationId: project.organizationId,
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
      if (
        !serverRollbackMachineMatchesRateCard(
          retained.runtimeSpec.machine,
          retained.runtimeSpec.machine.rateCardVersion === BUILTIN_RATE_CARD.version ? BUILTIN_RATE_CARD : undefined,
        ) ||
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

    const row: ReleaseManifestRecord = {
      id: `rm-${this.releaseManifests.length + 1}-${input.deploymentId}`,
      projectId: input.projectId,
      deploymentId: input.deploymentId,
      environment: input.environment,
      version: input.version,
      provider: input.provider,
      artifactKind: input.artifactKind,
      artifactRef: input.artifactRef,
      artifactDigest: input.artifactDigest,
      storeGeneration: input.storeGeneration,
      configDigest: input.configDigest,
      dbMigrationPoint: input.dbMigrationPoint,
      runtimeSpec: input.runtimeSpec,
      promotionEvidence: input.promotionEvidence,
      accessPolicyVersion: input.accessPolicyVersion,
      planEntitlements,
      projectManifestDigest: input.projectManifestDigest,
      createdAt: new Date().toISOString(),
    };
    this.releaseManifests.push(row);

    return row;
  }

  /** Test-only legacy seeding seam; production `createReleaseManifest` stays strict. */
  seedLegacyReleaseManifestForTest(input: Omit<ReleaseManifestRecord, 'id' | 'createdAt'>): ReleaseManifestRecord {
    const row: ReleaseManifestRecord = {
      ...input,
      id: `legacy-rm-${this.releaseManifests.length + 1}-${input.deploymentId}`,
      createdAt: new Date().toISOString(),
    };
    this.releaseManifests.push(row);
    return row;
  }

  async listReleaseManifests(
    projectId: string,
    environment: string,
    options?: { take?: number },
  ): Promise<ReleaseManifestRecord[]> {
    return this.releaseManifests
      .filter((m) => m.projectId === projectId && m.environment === environment)
      .sort((a, b) => b.version - a.version)
      .slice(0, options?.take ?? 100);
  }

  async isReleaseArtifactRetained(artifactRef: string): Promise<boolean> {
    return this.releaseManifests.some((manifest) => manifest.artifactRef === artifactRef);
  }

  async isReleaseArtifactRetainedOutsideProjects(artifactRef: string, excludedProjectIds: string[]): Promise<boolean> {
    const excluded = new Set(excludedProjectIds);
    return this.releaseManifests.some(
      (manifest) => manifest.artifactRef === artifactRef && !excluded.has(manifest.projectId),
    );
  }

  async getReleaseManifest(projectId: string, manifestId: string) {
    return this.releaseManifests.find((manifest) => manifest.projectId === projectId && manifest.id === manifestId);
  }

  async getLatestReleaseManifestForDeployment(deploymentId: string) {
    return this.releaseManifests
      .filter((manifest) => manifest.deploymentId === deploymentId)
      .sort((left, right) => right.version - left.version)[0];
  }

  private _rollbackOperationKey(projectId: string, idempotencyKey: string) {
    return `${projectId}:${idempotencyKey}`;
  }

  private _requireRollbackLease(input: Omit<RollbackLeaseFence, 'expectedHeadVersion'>) {
    const operation = [...this.rollbackOperations.values()].find((candidate) => candidate.id === input.operationId);

    this._assertAccountPurgeMutationAllowed({
      userIds: [operation?.actorUserId],
      organizationIds: [operation ? this.projects.get(operation.projectId)?.organizationId : undefined],
      projectIds: [operation?.projectId],
    });

    if (
      !operation ||
      !operation.actorUserId ||
      operation.status !== 'IN_PROGRESS' ||
      operation.leaseOwner !== input.ownerToken ||
      operation.fencingToken !== input.fencingToken ||
      !operation.leaseExpiresAt ||
      new Date(operation.leaseExpiresAt).getTime() <= Date.now()
    ) {
      throw Object.assign(new Error('ROLLBACK_OWNERSHIP_LOST'), {
        code: 'ROLLBACK_OWNERSHIP_LOST',
        statusCode: 409,
      });
    }

    return operation;
  }

  private _requireRollbackSource(operation: RollbackOperationRecord) {
    const source = this.releaseManifests.find(
      (manifest) =>
        manifest.id === operation.previousManifestId &&
        manifest.projectId === operation.projectId &&
        manifest.environment === operation.environment,
    );

    if (!source) {
      throw new Error('ROLLBACK_TARGET_MANIFEST_MISSING');
    }

    return source;
  }

  private _completeRollbackSuccess(
    operation: RollbackOperationRecord,
    deployment: DeploymentRecord,
    source: ReleaseManifestRecord,
    responseContentLanguage: 'en' | 'fr',
  ) {
    if (
      operation.deploymentId !== deployment.id ||
      operation.previousManifestId !== source.id ||
      operation.expectedHeadVersion === undefined ||
      !['EFFECT_STARTED', 'RELEASE_COMMITTED'].includes(operation.phase) ||
      deployment.status !== 'READY'
    ) {
      throw new Error('ROLLBACK_RESPONSE_PHASE_CONFLICT');
    }

    const rollbackReceipt = buildRollbackSuccessReceipt({
      deployment,
      responseContentLanguage,
      restoredFromVersion: source.version,
      restoredFromDeploymentId: source.deploymentId,
      supersededVersion: operation.expectedHeadVersion,
      verifiedArtifactDigest: source.artifactDigest,
      url: deployment.url ?? '',
    });
    const completed: RollbackOperationRecord = {
      ...operation,
      status: 'COMPLETED',
      phase: 'RELEASE_COMMITTED',
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      responseStatus: rollbackReceipt.responseStatus,
      responseContentLanguage: rollbackReceipt.responseContentLanguage,
      responseBody: rollbackReceipt.responseBody,
      completedAt: now(),
      updatedAt: now(),
    };
    this.rollbackOperations.set(this._rollbackOperationKey(operation.projectId, operation.idempotencyKey), completed);
    return rollbackReceipt;
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
    return this.withSerializedMutation(`rollback-operation:${input.projectId}:${input.idempotencyKey}`, async () => {
      this._assertAccountPurgeMutationAllowed({
        userIds: [input.actorUserId],
        organizationIds: [this.projects.get(input.projectId)?.organizationId],
        projectIds: [input.projectId],
      });
      const mapKey = this._rollbackOperationKey(input.projectId, input.idempotencyKey);
      const existing = this.rollbackOperations.get(mapKey);

      if (!existing) {
        const rollbackManifests = this.releaseManifests
          .filter((manifest) => manifest.projectId === input.projectId && manifest.environment === input.environment)
          .sort((left, right) => right.version - left.version)
          .slice(0, 2);
        const rollbackDeployments = rollbackManifests
          .map((manifest) => this.deployments.get(manifest.deploymentId))
          .filter((deployment): deployment is DeploymentRecord => Boolean(deployment));

        if (
          rollbackDeployments.some(
            (deployment) =>
              deployment.runtimeKind === 'reserved-vm' ||
              Boolean(deployment.reservedVmTier) ||
              Boolean(deployment.persistentStorageClaim),
          )
        ) {
          throw Object.assign(new Error(appPublicEnglish('RESERVED_VM_ROLLBACK_UNPINNED')), {
            code: 'RESERVED_VM_ROLLBACK_UNPINNED',
            statusCode: 409,
          });
        }
        const timestamp = now();

        const record: RollbackOperationRecord = {
          id: id('rollback'),
          projectId: input.projectId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: input.requestFingerprint,
          environment: input.environment,
          status: 'IN_PROGRESS',
          phase: 'CLAIMED',
          leaseOwner: input.ownerToken,
          leaseExpiresAt: new Date(Date.now() + input.leaseDurationMs).toISOString(),
          fencingToken: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        this.rollbackOperations.set(mapKey, record);

        return { kind: 'ACQUIRED' as const, record };
      }

      if (
        existing.requestFingerprint !== input.requestFingerprint ||
        existing.environment !== input.environment ||
        existing.actorUserId !== input.actorUserId
      ) {
        return { kind: 'FINGERPRINT_CONFLICT' as const, record: existing };
      }

      if (existing.status === 'COMPLETED') {
        return { kind: 'REPLAY' as const, record: existing };
      }

      if (existing.leaseExpiresAt && new Date(existing.leaseExpiresAt).getTime() > Date.now()) {
        return { kind: 'BUSY' as const, record: existing };
      }

      const recovered: RollbackOperationRecord = {
        ...existing,
        leaseOwner: input.ownerToken,
        leaseExpiresAt: new Date(Date.now() + input.leaseDurationMs).toISOString(),
        fencingToken: existing.fencingToken + 1,
        updatedAt: now(),
      };
      this.rollbackOperations.set(mapKey, recovered);

      return { kind: 'ACQUIRED' as const, record: recovered };
    });
  }

  async getRollbackOperation(projectId: string, idempotencyKey: string) {
    return this.rollbackOperations.get(this._rollbackOperationKey(projectId, idempotencyKey));
  }

  async renewRollbackOperationLease(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    leaseDurationMs: number;
  }) {
    const operation = this._requireRollbackLease(input);
    const leaseExpiresAt = new Date(Date.now() + input.leaseDurationMs).toISOString();
    const updated = { ...operation, leaseExpiresAt, updatedAt: now() };
    this.rollbackOperations.set(this._rollbackOperationKey(operation.projectId, operation.idempotencyKey), updated);

    return leaseExpiresAt;
  }

  async validateRollbackOperationLease(input: { operationId: string; ownerToken: string; fencingToken: number }) {
    try {
      this._requireRollbackLease(input);
      return true;
    } catch {
      return false;
    }
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

    const current = this._requireRollbackLease(input);

    if (current.phase !== 'CLAIMED' || current.deploymentId) {
      if (
        current.deploymentId !== input.deploymentId ||
        current.expectedHeadVersion !== input.expectedHeadVersion ||
        current.previousManifestId !== input.previousManifestId ||
        current.projectManifestDigest !== input.projectManifestDigest
      ) {
        throw new Error('ROLLBACK_TARGET_CONFLICT');
      }

      return current;
    }

    const updated: RollbackOperationRecord = {
      ...current,
      phase: 'TARGET_BOUND',
      deploymentId: input.deploymentId,
      expectedHeadVersion: input.expectedHeadVersion,
      previousManifestId: input.previousManifestId,
      projectManifestDigest: input.projectManifestDigest,
      updatedAt: now(),
    };
    this.rollbackOperations.set(this._rollbackOperationKey(current.projectId, current.idempotencyKey), updated);

    return updated;
  }

  async ensureRollbackDeployment(input: {
    fence: Omit<RollbackLeaseFence, 'expectedHeadVersion'>;
    deployment: RollbackDeploymentCreateInput;
  }) {
    const operation = this._requireRollbackLease(input.fence);
    const source = this._requireRollbackSource(operation);
    const metadata = input.deployment.metadata;

    const expectedProvider =
      source.artifactKind === 'static-snapshot'
        ? 'static'
        : source.artifactKind === 'server-image'
          ? 'server'
          : undefined;

    if (
      operation.projectId !== input.deployment.projectId ||
      operation.deploymentId !== input.deployment.id ||
      operation.expectedHeadVersion === undefined ||
      operation.phase === 'CLAIMED' ||
      operation.environment !== input.deployment.environment ||
      source.deploymentId !== input.deployment.rolledBackFromId ||
      source.accessPolicyVersion !== input.deployment.accessPolicyVersion ||
      !expectedProvider ||
      input.deployment.provider !== expectedProvider ||
      metadata.rollbackOperationId !== operation.id ||
      metadata.projectManifestDigest !== operation.projectManifestDigest ||
      metadata.restoredFromVersion !== source.version ||
      metadata.restoredFromDeploymentId !== source.deploymentId ||
      metadata.supersededVersion !== operation.expectedHeadVersion
    ) {
      throw new Error('ROLLBACK_TARGET_NOT_BOUND');
    }

    const accessPolicy = this.deploymentAccessPolicies.find(
      (candidate) =>
        candidate.projectId === input.deployment.projectId &&
        candidate.environment === input.deployment.environment &&
        candidate.version === input.deployment.accessPolicyVersion,
    );

    if (!accessPolicy) {
      throw new Error('ROLLBACK_ACCESS_POLICY_INVALID');
    }

    const existing = this.deployments.get(input.deployment.id);

    if (existing) {
      const persistedMetadata = existing.metadata as Record<string, unknown>;

      if (
        existing.projectId !== input.deployment.projectId ||
        existing.provider !== input.deployment.provider ||
        existing.environment !== input.deployment.environment ||
        existing.machineSize !== input.deployment.machineSize ||
        existing.accessPolicyVersion !== input.deployment.accessPolicyVersion ||
        existing.rolledBackFromId !== input.deployment.rolledBackFromId ||
        persistedMetadata.rollbackOperationId !== operation.id ||
        persistedMetadata.projectManifestDigest !== operation.projectManifestDigest ||
        persistedMetadata.restoredFromVersion !== source.version ||
        persistedMetadata.restoredFromDeploymentId !== source.deploymentId ||
        persistedMetadata.supersededVersion !== operation.expectedHeadVersion
      ) {
        throw new Error('ROLLBACK_DEPLOYMENT_CONFLICT');
      }

      return existing;
    }

    const createdAt = now();

    const deployment: DeploymentRecord = {
      ...input.deployment,
      logs: [],
      createdAt,
      updatedAt: createdAt,
    };
    this.deployments.set(deployment.id, deployment);

    const updated: RollbackOperationRecord = { ...operation, phase: 'DEPLOYMENT_CREATED', updatedAt: now() };
    this.rollbackOperations.set(this._rollbackOperationKey(operation.projectId, operation.idempotencyKey), updated);

    return deployment;
  }

  async updateRollbackDeployment(input: {
    fence: Omit<RollbackLeaseFence, 'expectedHeadVersion'>;
    projectId: string;
    deploymentId: string;
    patch: Partial<Omit<DeploymentRecord, 'id' | 'projectId' | 'createdAt'>>;
  }) {
    const operation = this._requireRollbackLease(input.fence);

    if (operation.projectId !== input.projectId || operation.deploymentId !== input.deploymentId) {
      throw new Error('ROLLBACK_OWNERSHIP_LOST');
    }

    const deployment = await this.getDeployment(input.projectId, input.deploymentId);

    if (!deployment) {
      throw new Error(`Deployment not found: ${input.deploymentId}`);
    }

    if (input.patch.status && ['READY', 'FAILED', 'CANCELED'].includes(deployment.status)) {
      return deployment;
    }

    return this.updateDeployment(input.projectId, input.deploymentId, input.patch);
  }

  async beginRollbackEffect(input: { operationId: string; ownerToken: string; fencingToken: number }) {
    const operation = this._requireRollbackLease(input);

    if (operation.phase === 'EFFECT_STARTED') {
      if (operation.effectFencingToken !== input.fencingToken) {
        throw new Error('ROLLBACK_EFFECT_PHASE_CONFLICT');
      }

      return operation;
    }

    const deployment = operation.deploymentId ? this.deployments.get(operation.deploymentId) : undefined;
    const metadata = deployment?.metadata as Record<string, unknown> | undefined;

    if (
      operation.phase !== 'DEPLOYMENT_CREATED' ||
      !deployment ||
      metadata?.rollbackOperationId !== operation.id ||
      ['READY', 'FAILED', 'CANCELED'].includes(deployment.status)
    ) {
      throw new Error('ROLLBACK_EFFECT_PHASE_CONFLICT');
    }

    const updated: RollbackOperationRecord = {
      ...operation,
      phase: 'EFFECT_STARTED',
      effectFencingToken: operation.fencingToken,
      updatedAt: now(),
    };
    this.rollbackOperations.set(this._rollbackOperationKey(operation.projectId, operation.idempotencyKey), updated);

    return updated;
  }

  async completeRollbackEffectCleanup(input: { operationId: string; ownerToken: string; fencingToken: number }) {
    const operation = this._requireRollbackLease(input);

    if (operation.phase === 'EFFECT_CLEANED') {
      return operation;
    }

    const deployment = operation.deploymentId ? this.deployments.get(operation.deploymentId) : undefined;

    if (
      operation.phase !== 'EFFECT_STARTED' ||
      !operation.deploymentId ||
      (deployment && !['FAILED', 'CANCELED'].includes(deployment.status))
    ) {
      throw new Error('ROLLBACK_CLEANUP_UNCONFIRMED');
    }

    const updated: RollbackOperationRecord = { ...operation, phase: 'EFFECT_CLEANED', updatedAt: now() };
    this.rollbackOperations.set(this._rollbackOperationKey(operation.projectId, operation.idempotencyKey), updated);

    return updated;
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

    const existing = [...this.rollbackOperations.values()].find((candidate) => candidate.id === input.operationId);
    if (existing?.status === 'COMPLETED') {
      if (
        existing.phase !== 'RELEASE_COMMITTED' ||
        existing.responseStatus !== input.responseStatus ||
        existing.responseContentLanguage !== input.responseContentLanguage ||
        rollbackManifestDigest(existing.responseBody) !== rollbackManifestDigest(input.responseBody)
      ) {
        throw Object.assign(new Error('ROLLBACK_RESPONSE_REPLAY_CONFLICT'), {
          code: 'ROLLBACK_RESPONSE_REPLAY_CONFLICT',
          statusCode: 409,
        });
      }
      return existing;
    }

    const operation = this._requireRollbackLease(input);

    if (input.responseStatus < 400 && operation.phase !== 'RELEASE_COMMITTED') {
      throw new Error('ROLLBACK_RESPONSE_PHASE_CONFLICT');
    }

    if (operation.phase === 'EFFECT_STARTED') {
      throw new Error('ROLLBACK_CLEANUP_UNCONFIRMED');
    }

    if (operation.phase === 'DEPLOYMENT_CREATED' && operation.deploymentId) {
      const deployment = this.deployments.get(operation.deploymentId);

      if (deployment && !['FAILED', 'CANCELED'].includes(deployment.status)) {
        if (deployment.status === 'READY' || input.responseStatus < 400) {
          throw new Error('ROLLBACK_CLEANUP_UNCONFIRMED');
        }

        this.deployments.set(deployment.id, {
          ...deployment,
          status: 'FAILED',
          url: undefined,
          previewUrl: undefined,
          productionUrl: undefined,
          finishedAt: now(),
          updatedAt: now(),
        });
      }
    }

    const completed: RollbackOperationRecord = {
      ...operation,
      status: 'COMPLETED',
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      responseStatus: input.responseStatus,
      responseContentLanguage: input.responseContentLanguage,
      responseBody: input.responseBody,
      completedAt: now(),
      updatedAt: now(),
    };
    this.rollbackOperations.set(this._rollbackOperationKey(operation.projectId, operation.idempotencyKey), completed);

    return completed;
  }

  async commitStaticRelease(input: StaticReleaseCommitInput): Promise<StaticReleaseCommitResult> {
    return this.withSerializedMutation(`release-manifest:${input.projectId}:${input.environment}`, async () => {
      await this.assertProjectReleaseBarrier({ projectId: input.projectId, ...input.releaseFence });
      const deployment = this.deployments.get(input.deploymentId);
      const project = this.projects.get(input.projectId);

      if (!deployment || !project || deployment.projectId !== input.projectId) {
        throw new Error(`Deployment not found: ${input.deploymentId}`);
      }

      const queuedPin = parseReleasePlanEntitlementsPin(
        (deployment.metadata as { planEntitlements?: unknown } | undefined)?.planEntitlements,
      );
      const committedPin = parseReleasePlanEntitlementsPin(input.metadata.planEntitlements);
      const expectedRef = `static-artifacts/sha256/${input.artifactDigest.replace(/^sha256:/u, '')}`;
      const policy = this.deploymentAccessPolicies.find(
        (candidate) =>
          candidate.projectId === input.projectId &&
          candidate.environment === input.environment &&
          candidate.version === input.accessPolicyVersion,
      );

      if (
        project.organizationId !== input.releaseFence.expectedOrganizationId ||
        deployment.provider !== 'static' ||
        deployment.environment !== input.environment ||
        deployment.accessPolicyVersion !== input.accessPolicyVersion ||
        input.artifactRef !== expectedRef ||
        input.metadata.projectManifestDigest !== input.releaseFence.expectedManifestDigest ||
        !policy ||
        !queuedPin ||
        !committedPin ||
        !sameReleasePlanEntitlementsPin(queuedPin, committedPin)
      ) {
        throw new Error('STATIC_RELEASE_COMMIT_CONFLICT');
      }

      const existingRows = this.releaseManifests.filter((manifest) => manifest.deploymentId === deployment.id);
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
          throw new Error('STATIC_RELEASE_MANIFEST_CONFLICT');
        }

        return { committed: true, deployment, manifest: existing };
      }

      if (['READY', 'FAILED', 'CANCELED'].includes(deployment.status)) {
        return { committed: false, deployment };
      }

      const latestVersion = this.releaseManifests
        .filter((manifest) => manifest.projectId === input.projectId && manifest.environment === input.environment)
        .reduce((max, manifest) => Math.max(max, manifest.version), 0);
      const manifest = await this.createReleaseManifest({
        projectId: input.projectId,
        deploymentId: input.deploymentId,
        environment: input.environment,
        version: latestVersion + 1,
        provider: 'static',
        artifactKind: 'static-snapshot',
        artifactRef: input.artifactRef,
        artifactDigest: input.artifactDigest,
        ...(input.storeGeneration ? { storeGeneration: input.storeGeneration } : {}),
        ...(input.configDigest ? { configDigest: input.configDigest } : {}),
        ...(input.dbMigrationPoint ? { dbMigrationPoint: input.dbMigrationPoint } : {}),
        accessPolicyVersion: input.accessPolicyVersion,
        planEntitlements: committedPin,
        projectManifestDigest: input.releaseFence.expectedManifestDigest,
      });
      const ready: DeploymentRecord = {
        ...deployment,
        status: 'READY',
        url: input.url,
        previewUrl: input.previewUrl,
        productionUrl: input.productionUrl,
        metadata: input.metadata,
        logs: input.logs,
        finishedAt: input.finishedAt,
        updatedAt: now(),
      };
      this.deployments.set(ready.id, ready);

      return { committed: true, deployment: ready, manifest };
    });
  }

  async commitStaticRollbackRelease(input: StaticRollbackReleaseCommitInput) {
    return this.withSerializedMutation(`release-manifest:${input.projectId}:${input.environment}`, async () => {
      await this.assertProjectReleaseBarrier({ projectId: input.projectId, ...input.releaseFence });
      const operation = this._requireRollbackLease(input);
      const source = this._requireRollbackSource(operation);
      const deployment = this.deployments.get(input.deploymentId);
      const sourcePin = parseReleasePlanEntitlementsPin(source.planEntitlements);
      const rollbackPin = parseReleasePlanEntitlementsPin(input.metadata.planEntitlements);

      if (
        !deployment ||
        operation.projectId !== input.projectId ||
        operation.deploymentId !== deployment.id ||
        operation.expectedHeadVersion !== input.expectedHeadVersion ||
        operation.phase !== 'EFFECT_STARTED' ||
        operation.effectFencingToken !== input.fencingToken ||
        operation.environment !== input.environment ||
        operation.projectManifestDigest !== input.releaseFence.expectedManifestDigest ||
        source.artifactKind !== 'static-snapshot' ||
        source.provider !== input.provider ||
        source.artifactDigest !== input.artifactDigest ||
        source.accessPolicyVersion !== input.accessPolicyVersion ||
        source.artifactRef !== input.artifactRef ||
        !/^static-artifacts\/sha256\/[a-f0-9]{64}$/u.test(input.artifactRef) ||
        !sameNullable(source.storeGeneration, input.storeGeneration) ||
        !sameNullable(source.configDigest, input.configDigest) ||
        !sameNullable(source.dbMigrationPoint, input.dbMigrationPoint) ||
        !sourcePin ||
        !rollbackPin ||
        !sameReleasePlanEntitlementsPin(sourcePin, rollbackPin) ||
        source.projectManifestDigest !== input.releaseFence.expectedManifestDigest
      ) {
        throw new Error('STATIC_ROLLBACK_RELEASE_CONFLICT');
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

      const accessPolicy = this.deploymentAccessPolicies.find(
        (candidate) =>
          candidate.projectId === input.projectId &&
          candidate.environment === input.environment &&
          candidate.version === input.accessPolicyVersion,
      );

      if (deployment.accessPolicyVersion !== input.accessPolicyVersion || !accessPolicy) {
        throw new Error('ROLLBACK_ACCESS_POLICY_INVALID');
      }

      const existingRows = this.releaseManifests.filter((manifest) => manifest.deploymentId === deployment.id);
      const existing = existingRows[0];

      if (existing) {
        let existingRoutingEvidence;

        try {
          existingRoutingEvidence = parseStaticRollbackRoutingEvidence(existing.promotionEvidence);
        } catch {
          throw new Error('STATIC_ROLLBACK_RELEASE_CONFLICT');
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
          throw new Error('STATIC_ROLLBACK_RELEASE_CONFLICT');
        }

        return {
          deployment,
          manifest: existing,
          rollbackReceipt: this._completeRollbackSuccess(operation, deployment, source, input.responseContentLanguage),
        };
      }

      const metadata = deployment.metadata as Record<string, unknown>;

      if (
        metadata.rollbackOperationId !== operation.id ||
        input.metadata.rollbackOperationId !== operation.id ||
        input.metadata.projectManifestDigest !== operation.projectManifestDigest ||
        deployment.provider !== 'static' ||
        deployment.environment !== input.environment ||
        deployment.rolledBackFromId !== source.deploymentId ||
        ['READY', 'FAILED', 'CANCELED'].includes(deployment.status)
      ) {
        throw new Error('STATIC_ROLLBACK_RELEASE_CONFLICT');
      }

      const head = this.releaseManifests
        .filter((manifest) => manifest.projectId === input.projectId && manifest.environment === input.environment)
        .reduce((version, manifest) => Math.max(version, manifest.version), 0);

      if (head !== input.expectedHeadVersion) {
        throw Object.assign(new Error('ROLLBACK_RELEASE_MOVED'), {
          code: 'ROLLBACK_RELEASE_MOVED',
          statusCode: 409,
          expectedVersion: input.expectedHeadVersion,
          observedVersion: head,
        });
      }

      const manifest = await this.createReleaseManifest({
        projectId: input.projectId,
        deploymentId: input.deploymentId,
        environment: input.environment,
        version: head + 1,
        provider: input.provider,
        artifactKind: 'static-snapshot',
        artifactRef: input.artifactRef,
        artifactDigest: input.artifactDigest,
        ...(input.storeGeneration ? { storeGeneration: input.storeGeneration } : {}),
        ...(input.configDigest ? { configDigest: input.configDigest } : {}),
        ...(input.dbMigrationPoint ? { dbMigrationPoint: input.dbMigrationPoint } : {}),
        promotionEvidence: routingEvidence,
        accessPolicyVersion: input.accessPolicyVersion,
        planEntitlements: sourcePin,
        projectManifestDigest: source.projectManifestDigest,
      });
      const ready = await this.updateDeployment(input.projectId, input.deploymentId, {
        status: 'READY',
        url: input.url,
        previewUrl: input.environment !== 'production' ? input.url : undefined,
        productionUrl: input.environment === 'production' ? input.url : undefined,
        metadata: input.metadata,
        logs: input.logs,
        finishedAt: input.finishedAt,
      });

      return {
        deployment: ready,
        manifest,
        rollbackReceipt: this._completeRollbackSuccess(operation, ready, source, input.responseContentLanguage),
      };
    });
  }

  async commitServerImageRelease(input: ServerImageReleaseCommitInput): Promise<ServerImageReleaseCommitResult> {
    return this.withSerializedMutation(`release-manifest:${input.projectId}:${input.environment}`, async () => {
      if (input.rollbackFence && input.reservedVmFence) {
        throw new Error('SERVER_RELEASE_FENCE_CONFLICT');
      }
      if (input.rollbackFence && !input.rollbackResponseContentLanguage) {
        throw new TypeError('ROLLBACK_RESPONSE_CONTENT_LANGUAGE_REQUIRED');
      }

      await this.assertProjectReleaseBarrier({ projectId: input.projectId, ...input.releaseFence });
      let deployment = this.deployments.get(input.deploymentId);

      if (!deployment || deployment.projectId !== input.projectId) {
        throw new Error(`Deployment not found: ${input.deploymentId}`);
      }
      const accessPolicyVersion = deployment.accessPolicyVersion;

      const accessPolicy = this.deploymentAccessPolicies.find(
        (candidate) =>
          candidate.projectId === input.projectId &&
          candidate.environment === input.environment &&
          candidate.version === accessPolicyVersion,
      );

      if (!accessPolicy) {
        throw new Error('SERVER_RELEASE_ACCESS_POLICY_INVALID');
      }

      const project = this.projects.get(input.projectId);
      const serverDeploy = input.metadata.serverDeploy as Record<string, unknown> | undefined;
      const image = serverDeploy?.image as Record<string, unknown> | undefined;
      const retainedRuntime = parseServerRollbackRuntimeSpec(input.runtimeSpec).spec;
      const retainedPromotion = parseServerRollbackPromotionEvidence(input.promotionEvidence);
      const rollbackOperationId = (deployment.metadata as Record<string, unknown> | undefined)?.rollbackOperationId;
      const rollbackOperation = input.rollbackFence ? this._requireRollbackLease(input.rollbackFence) : undefined;
      const rollbackSource = rollbackOperation ? this._requireRollbackSource(rollbackOperation) : undefined;
      const reservedOperation = input.reservedVmFence
        ? [...this.reservedVmOperations.values()].find(
            (operation) => operation.id === input.reservedVmFence?.operationId,
          )
        : undefined;
      const reservedRedeployIntent =
        reservedOperation?.kind === 'REDEPLOY'
          ? parseReservedVmRedeployReleaseIntent(reservedOperation.response)
          : undefined;

      if (
        input.reservedVmFence &&
        (!reservedOperation ||
          reservedOperation.deploymentId !== input.deploymentId ||
          (reservedOperation.kind === 'REDEPLOY' && !reservedRedeployIntent) ||
          (reservedOperation.status !== 'COMPLETED' &&
            (reservedOperation.status !== 'APPLYING' ||
              reservedOperation.phase !== 'RUNTIME_APPLIED' ||
              reservedOperation.leaseOwner !== input.reservedVmFence.ownerToken ||
              reservedOperation.fencingToken !== input.reservedVmFence.fencingToken)))
      ) {
        throw new Error('RESERVED_VM_OPERATION_FENCE_LOST');
      }

      const deploymentPin = parseReleasePlanEntitlementsPin(
        (deployment.metadata as { planEntitlements?: unknown } | undefined)?.planEntitlements,
      );
      const inputPin = parseReleasePlanEntitlementsPin(input.metadata.planEntitlements);
      const rollbackSourcePin = parseReleasePlanEntitlementsPin(rollbackSource?.planEntitlements);
      const releasePin = rollbackOperation
        ? rollbackSourcePin
        : (reservedRedeployIntent?.targetPlanEntitlements ?? deploymentPin);
      const releaseProjectManifestDigest = rollbackOperation
        ? rollbackSource?.projectManifestDigest
        : (reservedRedeployIntent?.targetProjectManifestDigest ??
          (deployment.metadata as { projectManifestDigest?: unknown } | undefined)?.projectManifestDigest);
      const deploymentProjectManifestDigest = (deployment.metadata as { projectManifestDigest?: unknown } | undefined)
        ?.projectManifestDigest;
      const reservedRedeploySourceMatches =
        reservedRedeployIntent === undefined ||
        (deploymentPin !== undefined &&
          sameReleasePlanEntitlementsPin(deploymentPin, reservedRedeployIntent.priorPlanEntitlements) &&
          deploymentProjectManifestDigest === reservedRedeployIntent.priorProjectManifestDigest);
      const reservedRedeployTargetMatches =
        reservedRedeployIntent !== undefined &&
        deploymentPin !== undefined &&
        sameReleasePlanEntitlementsPin(deploymentPin, reservedRedeployIntent.targetPlanEntitlements) &&
        deploymentProjectManifestDigest === reservedRedeployIntent.targetProjectManifestDigest;
      const releaseMachineMatchesHistoricalCard = serverRollbackMachineMatchesRateCard(
        retainedRuntime.machine,
        retainedRuntime.machine.rateCardVersion === BUILTIN_RATE_CARD.version ? BUILTIN_RATE_CARD : undefined,
      );
      const reservedReleaseMachineMatches =
        !reservedOperation ||
        !['CREATE', 'REDEPLOY'].includes(reservedOperation.kind) ||
        (retainedRuntime.machine.key === reservedOperation.targetMachineSize &&
          retainedRuntime.machine.cpuMillicores === reservedOperation.targetCpuMillicores &&
          retainedRuntime.machine.memoryMb === reservedOperation.targetMemoryMb &&
          retainedRuntime.machine.rateCardVersion === reservedOperation.rateCardVersion);
      const releaseRuntimeMatchesDeployment = serverRollbackRuntimeMatchesDeployment(retainedRuntime, deployment);

      if (
        !project ||
        project.organizationId !== input.organizationId ||
        input.organizationId !== input.releaseFence.expectedOrganizationId ||
        input.metadata.projectManifestDigest !== input.releaseFence.expectedManifestDigest ||
        deployment.provider !== 'server' ||
        deployment.environment !== input.environment ||
        image?.imageRef !== input.artifactRef ||
        image?.imageDigest !== input.artifactDigest ||
        !releasePin ||
        !inputPin ||
        !sameReleasePlanEntitlementsPin(releasePin, inputPin) ||
        (!reservedRedeploySourceMatches && !reservedRedeployTargetMatches) ||
        releaseProjectManifestDigest !== input.releaseFence.expectedManifestDigest ||
        !isCommittedPromotionForTenant(
          serverDeploy?.promotion,
          project?.organizationId ?? '',
          input.artifactDigest,
          input.artifactRef,
        )
      ) {
        throw new Error('SERVER_RELEASE_PROMOTION_NOT_COMMITTED');
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
        throw new Error('SERVER_RELEASE_PROMOTION_NOT_COMMITTED');
      }

      if (
        (typeof rollbackOperationId === 'string' && rollbackOperation?.id !== rollbackOperationId) ||
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
        throw new Error('ROLLBACK_OWNERSHIP_LOST');
      }

      const existingRows = this.releaseManifests
        .filter((manifest) => manifest.deploymentId === input.deploymentId)
        .sort((left, right) => right.version - left.version);
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
          if (reservedOperation?.kind !== 'REDEPLOY') {
            throw new Error('SERVER_RELEASE_MANIFEST_CONFLICT');
          }
        } else {
          if (deployment.status !== 'READY') {
            throw new Error('SERVER_RELEASE_MANIFEST_WITHOUT_READY');
          }

          if (input.reservedVmFence && reservedOperation?.status !== 'COMPLETED') {
            const committed = await this.commitReservedVmOperation(input.reservedVmFence);
            deployment = committed.deployment;
          }

          const rollbackReceipt = rollbackOperation
            ? this._completeRollbackSuccess(
                rollbackOperation,
                deployment,
                rollbackSource!,
                input.rollbackResponseContentLanguage!,
              )
            : undefined;

          return {
            committed: true,
            deployment,
            manifest: existing,
            ...(rollbackReceipt ? { rollbackReceipt } : {}),
          };
        }
      }

      if (reservedRedeployTargetMatches) {
        throw new Error('SERVER_RELEASE_MANIFEST_CONFLICT');
      }

      if (
        rollbackOperation &&
        (input.metadata.rollbackOperationId !== rollbackOperation.id ||
          input.metadata.projectManifestDigest !== rollbackOperation.projectManifestDigest ||
          deployment.rolledBackFromId !== rollbackSource!.deploymentId)
      ) {
        throw new Error('ROLLBACK_OWNERSHIP_LOST');
      }

      if (['READY', 'FAILED', 'CANCELED'].includes(deployment.status)) {
        if (!(deployment.status === 'READY' && reservedOperation?.kind === 'REDEPLOY')) {
          if (reservedOperation) {
            throw new Error('SERVER_RELEASE_MANIFEST_CONFLICT');
          }

          return { committed: false, deployment };
        }
      }

      const latestVersion = this.releaseManifests
        .filter((manifest) => manifest.projectId === input.projectId && manifest.environment === input.environment)
        .reduce((max, manifest) => Math.max(max, manifest.version), 0);

      if (input.rollbackFence && latestVersion !== input.rollbackFence.expectedHeadVersion) {
        throw Object.assign(new Error('ROLLBACK_RELEASE_MOVED'), {
          code: 'ROLLBACK_RELEASE_MOVED',
          statusCode: 409,
          expectedVersion: input.rollbackFence.expectedHeadVersion,
          observedVersion: latestVersion,
        });
      }
      const manifest: ReleaseManifestRecord = {
        id: `rm-${this.releaseManifests.length + 1}-${input.deploymentId}`,
        projectId: input.projectId,
        deploymentId: input.deploymentId,
        environment: input.environment,
        version: latestVersion + 1,
        provider: 'server',
        artifactKind: 'server-image',
        artifactRef: input.artifactRef,
        artifactDigest: input.artifactDigest,
        storeGeneration: input.storeGeneration,
        configDigest: input.configDigest,
        dbMigrationPoint: input.dbMigrationPoint,
        runtimeSpec: input.runtimeSpec,
        promotionEvidence: input.promotionEvidence,
        accessPolicyVersion: deployment.accessPolicyVersion,
        planEntitlements: releasePin,
        projectManifestDigest: releaseProjectManifestDigest as string,
        createdAt: now(),
      };
      if (input.reservedVmFence && reservedOperation?.status !== 'COMPLETED') {
        const committed = await this.commitReservedVmOperation(input.reservedVmFence);
        deployment = committed.deployment;
      }

      const ready: DeploymentRecord = {
        ...deployment,
        status: 'READY',
        url: input.url,
        previewUrl: input.previewUrl,
        productionUrl: input.productionUrl,
        metadata: input.metadata,
        logs: input.logs,
        finishedAt: input.finishedAt,
        updatedAt: now(),
      };

      this.releaseManifests.push(manifest);
      this.adminAuditLogs.push({
        action: SERVER_IMAGE_RELEASE_AUDIT_ACTION,
        metadata: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          deploymentId: input.deploymentId,
          releaseManifestId: manifest.id,
          promotion: serverDeploy.promotion,
        },
        createdAt: now(),
      });
      this.deployments.set(ready.id, ready);

      const rollbackReceipt = rollbackOperation
        ? this._completeRollbackSuccess(
            rollbackOperation,
            ready,
            rollbackSource!,
            input.rollbackResponseContentLanguage!,
          )
        : undefined;
      return {
        committed: true,
        deployment: ready,
        manifest,
        ...(rollbackReceipt ? { rollbackReceipt } : {}),
      };
    });
  }

  async commitFencedServerReady(input: FencedServerReadyCommitInput): Promise<DeploymentRecord> {
    return this.withSerializedMutation(`fenced-server-ready:${input.deploymentId}`, async () => {
      await this.assertProjectReleaseBarrier({ projectId: input.projectId, ...input.releaseFence });
      const deployment = this.deployments.get(input.deploymentId);

      if (
        !deployment ||
        deployment.projectId !== input.projectId ||
        deployment.provider !== 'server' ||
        input.metadata.projectManifestDigest !== input.releaseFence.expectedManifestDigest ||
        ['READY', 'FAILED', 'CANCELED'].includes(deployment.status)
      ) {
        throw Object.assign(new Error('SERVER_RELEASE_FENCE_CONFLICT'), {
          code: 'SERVER_RELEASE_FENCE_CONFLICT',
          statusCode: 409,
        });
      }

      const ready: DeploymentRecord = {
        ...deployment,
        status: 'READY',
        url: input.url,
        previewUrl: input.previewUrl,
        productionUrl: input.productionUrl,
        metadata: input.metadata,
        logs: input.logs,
        finishedAt: input.finishedAt,
        updatedAt: now(),
      };
      this.deployments.set(ready.id, ready);
      return ready;
    });
  }

  async getServerImageReleasePromotion(deploymentId: string): Promise<unknown | undefined> {
    return [...this.adminAuditLogs]
      .reverse()
      .find(
        (event) => event.action === SERVER_IMAGE_RELEASE_AUDIT_ACTION && event.metadata?.deploymentId === deploymentId,
      )?.metadata?.promotion;
  }

  async getLatestProjectManifest(projectId: string): Promise<ProjectManifestRevisionRecord | undefined> {
    return [...(this.projectManifestRevisions.get(projectId) ?? [])].sort(
      (left, right) => right.manifestVersion - left.manifestVersion,
    )[0];
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
    return this.withProjectTenantMutation(input, () => this.createProjectManifestRevisionAfterTenantLock(input));
  }

  private async createProjectManifestRevisionAfterTenantLock(input: {
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

    return this.withSerializedMutation(`project-manifest:${input.projectId}`, async () => {
      if (await this.getActiveCheckpointBarrier(input.projectId)) {
        throw Object.assign(new Error(appPublicEnglish('CHECKPOINT_BARRIER_ACTIVE_MESSAGE')), {
          code: 'CHECKPOINT_BARRIER_ACTIVE',
          statusCode: 423,
        });
      }

      const rows = this.projectManifestRevisions.get(input.projectId) ?? [];
      const latest = [...rows].sort((left, right) => right.manifestVersion - left.manifestVersion)[0];

      if (latest?.digest === input.digest && latest.manifestVersion === input.manifestVersion) {
        return latest;
      }

      const expectedMatches = latest ? input.expectedDigest === latest.digest : input.expectedDigest === undefined;

      if (!expectedMatches || input.manifestVersion !== (latest?.manifestVersion ?? 0) + 1) {
        throw Object.assign(new Error(appPublicEnglish('PROJECT_MANIFEST_VERSION_CONFLICT')), {
          code: 'PROJECT_MANIFEST_VERSION_CONFLICT',
          statusCode: 409,
        });
      }

      const row: ProjectManifestRevisionRecord = {
        id: id('project_manifest'),
        projectId: input.projectId,
        schemaVersion: input.schemaVersion,
        manifestVersion: input.manifestVersion,
        digest: input.digest,
        manifest,
        createdByUserId: input.createdByUserId,
        createdAt: now(),
      };
      rows.push(row);
      this.projectManifestRevisions.set(input.projectId, rows);

      return row;
    });
  }

  /** No DB-backed rate card in tests: callers fall back to the built-in card. */
  async getActiveRateCard(): Promise<{ version: number; data: unknown } | undefined> {
    return undefined;
  }

  /** Test store has no historical rows unless a mutation test overrides this lookup. */
  async getRateCard(_version: number): Promise<{ version: number; data: unknown } | undefined> {
    return undefined;
  }

  /*
   * AGM agent routing — in-memory versioned cards + call log, enough for the
   * admin endpoints and the record-usage AGM branch to run in tests.
   */
  agentRoutingCards: Array<{
    version: number;
    active: boolean;
    data: unknown;
    effectiveFrom: string;
    effectiveTo?: string;
    sourceDate?: string;
    createdAt: string;
    createdByUserId?: string;
    createdByEmail?: string;
  }> = [];

  agentCalls: Array<{
    id: string;
    createdAt: string;
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
  }> = [];

  async getActiveAgentRoutingCard(): Promise<{ version: number; data: unknown } | undefined> {
    const active = this.agentRoutingCards.filter((card) => card.active).sort((a, b) => b.version - a.version)[0];
    return active ? { version: active.version, data: active.data } : undefined;
  }

  async getAgentRoutingCard(version: number): Promise<{ version: number; data: unknown } | undefined> {
    const card = this.agentRoutingCards.find((candidate) => candidate.version === version);
    return card ? { version: card.version, data: card.data } : undefined;
  }

  projectCheckpoints = new Map<
    string,
    {
      id: string;
      projectId: string;
      state: string;
      logicalBarrierId?: string;
      consistencyLevel?: string;
      manifest?: unknown;
      error?: string;
      expiresAt?: string;
      createdByUserId?: string;
      idempotencyKey?: string;
      requestHash?: string;
      barrierProjectId?: string | null;
      barrierOwnerToken?: string | null;
      barrierFence: number;
      barrierExpiresAt?: string | null;
      createdAt: string;
    }
  >();

  async getDatabaseTime() {
    return now();
  }

  async createProjectCheckpoint(input: {
    projectId: string;
    expectedOrganizationId: string;
    createdByUserId?: string;
    idempotencyKey?: string;
    requestHash?: string;
  }) {
    return this.withProjectTenantMutation(input, async () => {
      const requestHash = input.requestHash ?? hashToken(`project-checkpoint:${input.projectId}`);

      const existing = input.idempotencyKey
        ? [...this.projectCheckpoints.values()].find((row) => row.idempotencyKey === input.idempotencyKey)
        : undefined;

      if (existing) {
        if (existing.projectId !== input.projectId || existing.requestHash !== requestHash) {
          throw Object.assign(new Error('CHECKPOINT_IDEMPOTENCY_KEY_REUSED'), {
            statusCode: 409,
            code: 'IDEMPOTENCY_KEY_REUSED',
          });
        }

        return { id: existing.id, state: existing.state, replayed: true };
      }

      const row: typeof this.projectCheckpoints extends Map<string, infer Row> ? Row : never = {
        id: id('ckpt'),
        projectId: input.projectId,
        state: 'PREPARING',
        createdAt: now(),
        createdByUserId: input.createdByUserId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        barrierFence: 0,
      };
      this.projectCheckpoints.set(row.id, row);

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
    return this.withSerializedMutation(projectPhysicalMutationLockKey(input.projectId), async () => {
      const checkpoint = this.projectCheckpoints.get(input.checkpointId);
      this._assertAccountPurgeMutationAllowed({
        userIds: [checkpoint?.createdByUserId],
        projectIds: [checkpoint?.projectId, input.projectId],
      });
      const at = Date.now();

      for (const candidate of this.projectCheckpoints.values()) {
        if (
          candidate.barrierProjectId === input.projectId &&
          candidate.barrierExpiresAt &&
          new Date(candidate.barrierExpiresAt).getTime() <= at
        ) {
          candidate.barrierProjectId = null;
          candidate.barrierOwnerToken = null;
          candidate.barrierExpiresAt = null;
          candidate.barrierFence += 1;
        }
      }

      const row = this.projectCheckpoints.get(input.checkpointId);

      const active = [...this.projectCheckpoints.values()].some(
        (candidate) =>
          candidate.barrierProjectId === input.projectId &&
          candidate.barrierExpiresAt &&
          new Date(candidate.barrierExpiresAt).getTime() > at,
      );

      if (!row || row.projectId !== input.projectId || !['PREPARING', 'QUIESCING'].includes(row.state) || active) {
        return undefined;
      }

      row.state = 'BARRIER_ESTABLISHED';
      row.logicalBarrierId = input.barrierId;
      row.barrierProjectId = input.projectId;
      row.barrierOwnerToken = input.ownerToken;
      row.barrierFence += 1;
      row.barrierExpiresAt = new Date(at + input.ttlSeconds * 1000).toISOString();

      return {
        checkpointId: row.id,
        barrierId: input.barrierId,
        ownerToken: input.ownerToken,
        fence: row.barrierFence,
        expiresAt: row.barrierExpiresAt,
      };
    });
  }

  async renewProjectCheckpointBarrier(input: {
    checkpointId: string;
    ownerToken: string;
    fence: number;
    ttlSeconds: number;
  }) {
    const row = this.projectCheckpoints.get(input.checkpointId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [row?.createdByUserId],
      projectIds: [row?.projectId],
    });

    if (
      !row ||
      row.barrierOwnerToken !== input.ownerToken ||
      row.barrierFence !== input.fence ||
      !row.barrierExpiresAt ||
      new Date(row.barrierExpiresAt).getTime() <= Date.now()
    ) {
      return undefined;
    }

    row.barrierExpiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();

    return row.barrierExpiresAt;
  }

  async assertProjectCheckpointBarrier(input: { checkpointId: string; ownerToken: string; fence: number }) {
    const row = this.projectCheckpoints.get(input.checkpointId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [row?.createdByUserId],
      projectIds: [row?.projectId],
    });

    if (
      !row ||
      row.barrierProjectId !== row.projectId ||
      row.barrierOwnerToken !== input.ownerToken ||
      row.barrierFence !== input.fence ||
      !row.barrierExpiresAt ||
      new Date(row.barrierExpiresAt).getTime() <= Date.now()
    ) {
      throw Object.assign(new Error('CHECKPOINT_BARRIER_LOST'), { statusCode: 409, code: 'CHECKPOINT_BARRIER_LOST' });
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
    await this.assertProjectCheckpointBarrier(input);

    const row = this.projectCheckpoints.get(input.checkpointId)!;

    if (row.state !== input.from) {
      throw Object.assign(new Error('CHECKPOINT_STATE_CONFLICT'), {
        statusCode: 409,
        code: 'CHECKPOINT_STATE_CONFLICT',
      });
    }

    row.state = input.to;
    Object.assign(row, input.patch);

    if (input.patch?.retentionSeconds !== undefined) {
      row.expiresAt = new Date(Date.now() + input.patch.retentionSeconds * 1000).toISOString();
    }

    if (input.to === 'COMMITTED' && input.retainBarrier !== true) {
      row.barrierProjectId = null;
      row.barrierOwnerToken = null;
      row.barrierExpiresAt = null;
    }
  }

  async releaseProjectCheckpointBarrier(input: { checkpointId: string; ownerToken: string; fence: number }) {
    const row = this.projectCheckpoints.get(input.checkpointId);

    if (!row || row.barrierOwnerToken !== input.ownerToken || row.barrierFence !== input.fence) {
      return false;
    }

    row.barrierProjectId = null;
    row.barrierOwnerToken = null;
    row.barrierExpiresAt = null;

    return true;
  }

  async acquireProjectReleaseBarrier(input: {
    projectId: string;
    expectedOrganizationId: string;
    expectedManifestDigest: string;
    operationId: string;
    ownerToken: string;
    ttlSeconds: number;
  }): Promise<ProjectReleaseBarrierLease | undefined> {
    return this.withSerializedMutation(projectPhysicalMutationLockKey(input.projectId), () =>
      this.withSerializedMutation(`project-release:${input.projectId}`, async () => {
        const project = this.projects.get(input.projectId);
        const manifest = await this.getLatestProjectManifest(input.projectId);

        if (!project) {
          throw Object.assign(new Error('Project not found'), { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
        }

        if (project.organizationId !== input.expectedOrganizationId) {
          throw Object.assign(new Error('Project organization changed before release.'), {
            code: 'PROJECT_ORGANIZATION_CHANGED_DURING_RELEASE',
            statusCode: 409,
          });
        }

        if (!manifest || manifest.digest !== input.expectedManifestDigest) {
          throw Object.assign(new Error('Project manifest changed before publish.'), {
            code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH',
            statusCode: 409,
          });
        }

        const at = Date.now();

        for (const [idv, candidate] of this.projectCheckpoints) {
          if (
            candidate.state === 'RELEASE_BARRIER' &&
            candidate.projectId === input.projectId &&
            candidate.barrierExpiresAt &&
            new Date(candidate.barrierExpiresAt).getTime() <= at
          ) {
            this.projectCheckpoints.delete(idv);
          }
        }

        if (
          [...this.projectCheckpoints.values()].some(
            (candidate) =>
              candidate.barrierProjectId === input.projectId &&
              candidate.barrierExpiresAt &&
              new Date(candidate.barrierExpiresAt).getTime() > at,
          )
        ) {
          return undefined;
        }

        const checkpointId = id('release_barrier');
        const barrierId = `release:${input.operationId}`;
        const expiresAt = new Date(at + input.ttlSeconds * 1000).toISOString();
        this.projectCheckpoints.set(checkpointId, {
          id: checkpointId,
          projectId: input.projectId,
          state: 'RELEASE_BARRIER',
          logicalBarrierId: barrierId,
          requestHash: hashToken(
            `${input.projectId}:${input.expectedOrganizationId}:${input.expectedManifestDigest}:${input.operationId}`,
          ),
          barrierProjectId: input.projectId,
          barrierOwnerToken: input.ownerToken,
          barrierFence: 1,
          barrierExpiresAt: expiresAt,
          createdAt: now(),
        });

        return {
          checkpointId,
          projectId: input.projectId,
          barrierId,
          ownerToken: input.ownerToken,
          fence: 1,
          expiresAt,
        };
      }),
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
    const project = this.projects.get(input.projectId);
    const manifest = await this.getLatestProjectManifest(input.projectId);
    const barrier = this.projectCheckpoints.get(input.checkpointId);

    if (
      !barrier ||
      barrier.state !== 'RELEASE_BARRIER' ||
      barrier.barrierProjectId !== input.projectId ||
      barrier.barrierOwnerToken !== input.ownerToken ||
      barrier.barrierFence !== input.fence ||
      !barrier.barrierExpiresAt ||
      new Date(barrier.barrierExpiresAt).getTime() <= Date.now()
    ) {
      throw Object.assign(new Error('Project release barrier was lost.'), {
        code: 'PROJECT_RELEASE_BARRIER_LOST',
        statusCode: 409,
      });
    }

    if (!project || project.organizationId !== input.expectedOrganizationId) {
      throw Object.assign(new Error('Project organization changed during release.'), {
        code: 'PROJECT_ORGANIZATION_CHANGED_DURING_RELEASE',
        statusCode: 409,
      });
    }

    if (!manifest || manifest.digest !== input.expectedManifestDigest) {
      throw Object.assign(new Error('Project manifest changed before publish.'), {
        code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH',
        statusCode: 409,
      });
    }
  }

  async releaseProjectReleaseBarrier(input: {
    checkpointId: string;
    projectId: string;
    ownerToken: string;
    fence: number;
  }): Promise<boolean> {
    const barrier = this.projectCheckpoints.get(input.checkpointId);

    if (
      !barrier ||
      barrier.projectId !== input.projectId ||
      barrier.state !== 'RELEASE_BARRIER' ||
      barrier.barrierOwnerToken !== input.ownerToken ||
      barrier.barrierFence !== input.fence
    ) {
      return false;
    }

    return this.projectCheckpoints.delete(input.checkpointId);
  }

  async updateProjectCheckpoint(idv: string, patch: Record<string, unknown>) {
    const row = this.projectCheckpoints.get(idv);
    this._assertAccountPurgeMutationAllowed({
      userIds: [row?.createdByUserId],
      projectIds: [row?.projectId],
    });

    if (row) {
      Object.assign(row, patch);
    }
  }

  /** Mirrors PrismaApiStore: barrier read from the shared row, expiry = thaw. */
  async getActiveCheckpointBarrier(projectId: string) {
    const rows = [...this.projectCheckpoints.values()]
      .filter(
        (r) =>
          r.barrierProjectId === projectId &&
          r.barrierExpiresAt != null &&
          new Date(r.barrierExpiresAt).getTime() > Date.now() &&
          r.logicalBarrierId,
      )
      .sort((a, b) => new Date(b.barrierExpiresAt!).getTime() - new Date(a.barrierExpiresAt!).getTime());

    const row = rows[0];

    return row
      ? { checkpointId: row.id, barrierId: row.logicalBarrierId!, expiresAt: row.barrierExpiresAt! }
      : undefined;
  }

  async getProjectCheckpoint(idv: string) {
    return this.projectCheckpoints.get(idv);
  }

  remixJobs = new Map<string, RemixJobRecord>();
  remixStorageShares = new Map<string, RemixStorageShareRecord>();

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
    this._assertAccountPurgeMutationAllowed({
      userIds: [input.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [input.sourceProjectId],
    });
    const existing = [...this.remixJobs.values()].find(
      (job) => job.organizationId === input.organizationId && job.idempotencyKey === input.idempotencyKey,
    );

    if (existing) {
      this._assertStateMachineNotPurged(existing.errorCode, existing.error);
      if (existing.requestHash !== input.requestHash) {
        throw Object.assign(new Error('Idempotency key already used for another remix request'), {
          statusCode: 409,
          code: 'REMIX_IDEMPOTENCY_CONFLICT',
        });
      }

      return { job: existing, replayed: true };
    }

    const timestamp = now();

    const row: RemixJobRecord = {
      id: id('remix'),
      sourceProjectId: input.sourceProjectId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      state: 'PENDING',
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      version: 0,
      storagePolicy: input.storagePolicy,
      storageConsentVersion: input.storageConsentVersion,
      scrubbedCount: 0,
      dbForked: false,
      sourceSnapshotId: input.sourceSnapshotId,
      sourceListingId: input.sourceListingId,
      licenseSnapshot: input.licenseSnapshot,
      consentVersion: input.consentVersion,
      piiMaskedCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.remixJobs.set(row.id, row);

    return { job: row, replayed: false };
  }

  async claimRemixJob(input: { id: string; organizationId: string; operationToken: string; leaseDurationMs: number }) {
    const row = this.remixJobs.get(input.id);
    this._assertAccountPurgeMutationAllowed({
      userIds: [row?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [row?.sourceProjectId, row?.targetProjectId],
    });

    if (!row || row.organizationId !== input.organizationId || ['COMPLETED', 'FAILED'].includes(row.state)) {
      return undefined;
    }

    if (
      row.operationToken &&
      row.operationToken !== input.operationToken &&
      row.operationExpiresAt &&
      Date.parse(row.operationExpiresAt) > Date.now()
    ) {
      return undefined;
    }

    Object.assign(row, {
      operationToken: input.operationToken,
      operationExpiresAt: new Date(Date.now() + input.leaseDurationMs).toISOString(),
      version: row.version + 1,
      updatedAt: now(),
    });

    return row;
  }

  async renewRemixJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedVersion: number;
    leaseDurationMs: number;
  }) {
    const row = this.remixJobs.get(input.id);
    this._assertAccountPurgeMutationAllowed({
      userIds: [row?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [row?.sourceProjectId, row?.targetProjectId],
    });

    if (
      !row ||
      row.organizationId !== input.organizationId ||
      row.operationToken !== input.operationToken ||
      row.version !== input.expectedVersion ||
      ['COMPLETED', 'FAILED'].includes(row.state) ||
      !row.operationExpiresAt ||
      Date.parse(row.operationExpiresAt) <= Date.now()
    ) {
      return undefined;
    }

    row.operationExpiresAt = new Date(Date.now() + input.leaseDurationMs).toISOString();
    row.version += 1;
    row.updatedAt = now();

    return row;
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
    const row = this.remixJobs.get(input.id);
    this._assertAccountPurgeMutationAllowed({
      userIds: [row?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [row?.sourceProjectId, row?.targetProjectId, input.patch?.targetProjectId],
    });

    if (
      !row ||
      row.organizationId !== input.organizationId ||
      row.operationToken !== input.operationToken ||
      row.version !== input.expectedVersion ||
      !input.expectedStates.includes(row.state) ||
      !row.operationExpiresAt ||
      Date.parse(row.operationExpiresAt) <= Date.now()
    ) {
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

    const patch = input.patch ? { ...input.patch } : {};
    if (patch.targetIdeState !== undefined) patch.targetIdeState = structuredClone(patch.targetIdeState);
    Object.assign(row, patch, { state: input.state, version: row.version + 1, updatedAt: now() });

    return row;
  }

  async releaseRemixJobLease(input: { id: string; organizationId: string; operationToken: string }) {
    const row = this.remixJobs.get(input.id);
    this._assertAccountPurgeMutationAllowed({
      userIds: [row?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [row?.sourceProjectId, row?.targetProjectId],
    });

    if (!row || row.organizationId !== input.organizationId || row.operationToken !== input.operationToken) {
      return undefined;
    }

    row.operationToken = undefined;
    row.operationExpiresAt = undefined;
    row.version += 1;
    row.updatedAt = now();

    return row;
  }

  async createClaimedRemixProject(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    name: string;
    slug: string;
    manifestCloneMode?: ProjectManifestCloneMode;
  }) {
    const job = this.remixJobs.get(input.remixJobId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.sourceProjectId, job?.targetProjectId],
    });

    if (
      !job ||
      job.organizationId !== input.organizationId ||
      job.operationToken !== input.operationToken ||
      !job.operationExpiresAt ||
      Date.parse(job.operationExpiresAt) <= Date.now()
    ) {
      throw Object.assign(new Error('Remix ownership lost'), { statusCode: 409, code: 'REMIX_OWNERSHIP_LOST' });
    }

    const source = this.projects.get(job.sourceProjectId);

    if (!source) {
      throw new Error('Project not found');
    }

    const sourceSnapshot = job.sourceSnapshotId ? this.snapshots.get(job.sourceSnapshotId) : undefined;

    if (!sourceSnapshot || sourceSnapshot.projectId !== source.id) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_MANIFEST_SNAPSHOT_UNPINNED')), {
        statusCode: 409,
        code: 'PROJECT_MANIFEST_SNAPSHOT_UNPINNED',
      });
    }

    const sourceManifest = readProjectManifestSnapshotPin(sourceSnapshot.manifest, source.id).manifest;

    if (job.targetProjectId) {
      const existing = this.projects.get(job.targetProjectId);

      if (existing) {
        const existingRevision = await this.getLatestProjectManifest(existing.id);

        if (existingRevision) {
          verifyStoredProjectManifestRevision(existingRevision, existing.id);
        } else {
          const manifest = projectManifestForClone(
            sourceManifest,
            existing.id,
            input.manifestCloneMode ?? 'DETACH_EXTERNALS',
          );
          this.projectManifestRevisions.set(existing.id, [
            {
              id: id('project_manifest'),
              projectId: existing.id,
              schemaVersion: manifest.schemaVersion,
              manifestVersion: manifest.manifestVersion,
              digest: projectManifestDigest(manifest),
              manifest,
              createdByUserId: job.actorUserId,
              createdAt: now(),
            },
          ]);
        }

        return existing;
      }
    }

    const baseSlug = slugify(input.slug) || `import-${job.id.slice(-8).toLowerCase()}`;
    const slug = [...this.projects.values()].some(
      (candidate) => candidate.organizationId === input.organizationId && candidate.slug === baseSlug,
    )
      ? `${baseSlug}-${job.id.slice(-8).toLowerCase()}`
      : baseSlug;
    const project = await this.createProject({
      organizationId: input.organizationId,
      name: input.name,
      slug,
      description: source.description,
      sourceType: 'duplicate',
      templateName: source.templateName,
      gitRepositoryUrl: source.gitRepositoryUrl,
      gitDefaultBranch: source.gitDefaultBranch,
      initialManifest: sourceManifest,
      manifestCloneMode: input.manifestCloneMode ?? 'DETACH_EXTERNALS',
    });
    project.deletedAt = now();
    job.targetProjectId = project.id;
    job.version += 1;
    job.updatedAt = now();

    return project;
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
    const job = this.remixJobs.get(input.remixJobId);
    const project = this.projects.get(input.projectId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.sourceProjectId, job?.targetProjectId, input.projectId],
    });
    this._assertNoActiveProjectReleaseBarrier(input.projectId);

    if (
      !job ||
      !project ||
      project.organizationId !== input.organizationId ||
      project.deletedAt === undefined ||
      job.state !== 'DATABASE_PINNED' ||
      job.organizationId !== input.organizationId ||
      job.operationToken !== input.operationToken ||
      job.version !== input.expectedVersion ||
      job.requestHash !== input.requestHash ||
      job.targetProjectId !== input.projectId ||
      !job.operationExpiresAt ||
      Date.parse(job.operationExpiresAt) <= Date.now()
    ) {
      throw Object.assign(new Error(appPublicEnglish('REMIX_OWNERSHIP_LOST')), {
        statusCode: 409,
        code: 'REMIX_OWNERSHIP_LOST',
      });
    }

    const existing = Array.from(this.databaseInstances.values()).find(
      (row) => row.projectId === input.projectId && row.environment === input.environment,
    );
    if (!existing) {
      const instance: DatabaseInstanceRecord = {
        id: id('database_instance'),
        projectId: input.projectId,
        organizationId: input.organizationId,
        environment: input.environment,
        status: 'PROVISIONING',
        engine: 'postgres',
        sizeBytes: 0,
        retentionDays: input.retentionDays,
        pitrEnabled: input.retentionDays > 0,
        provisioningDeadlineAt: input.provisioningDeadlineAt,
        createdAt: now(),
        updatedAt: now(),
      };
      this.databaseInstances.set(instance.id, instance);
      return { instance, acquired: true, created: true };
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

    if (existing.status === 'PROVISIONING') {
      return { instance: existing, acquired: false, created: false };
    }

    const instance: DatabaseInstanceRecord = {
      ...existing,
      status: 'PROVISIONING',
      provisioningDeadlineAt: input.provisioningDeadlineAt,
      lastErrorCode: undefined,
      lastErrorAt: undefined,
      updatedAt: now(),
    };
    this.databaseInstances.set(instance.id, instance);
    return { instance, acquired: true, created: false };
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
    const job = this.remixJobs.get(input.remixJobId);
    const instance = this.databaseInstances.get(input.databaseInstanceId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.sourceProjectId, job?.targetProjectId, input.projectId],
    });
    this._assertNoActiveProjectReleaseBarrier(input.projectId);
    const project = this.projects.get(input.projectId);

    if (
      !job ||
      !project ||
      project.organizationId !== input.organizationId ||
      project.deletedAt === undefined ||
      job.state !== 'DB_FORKING' ||
      job.organizationId !== input.organizationId ||
      job.operationToken !== input.operationToken ||
      job.version !== input.expectedVersion ||
      job.requestHash !== input.requestHash ||
      job.targetProjectId !== input.projectId ||
      job.targetDatabaseInstanceId !== input.databaseInstanceId ||
      !instance ||
      instance.projectId !== input.projectId ||
      instance.organizationId !== input.organizationId ||
      instance.status !== 'PROVISIONING'
    ) {
      return undefined;
    }

    instance.status = 'ACTIVE';
    instance.pitrEnabled = true;
    const secretKey = `${input.projectId}:DATABASE_URL`;
    const existingSecret = this.projectSecrets.get(secretKey);
    this.projectSecrets.set(secretKey, {
      id: existingSecret?.id ?? id('secret'),
      projectId: input.projectId,
      key: 'DATABASE_URL',
      valueEncrypted: input.valueEncrypted,
      createdAt: existingSecret?.createdAt ?? now(),
      updatedAt: now(),
    });
    job.state = 'INDEXING';
    job.dbForked = true;
    job.version += 1;
    job.updatedAt = now();

    return job;
  }

  async finalizeClaimedRemix(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    expectedVersion: number;
    requestHash: string;
    targetProjectId: string;
  }) {
    const job = this.remixJobs.get(input.remixJobId);
    const project = this.projects.get(input.targetProjectId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.sourceProjectId, job?.targetProjectId, input.targetProjectId],
    });

    if (
      !job ||
      job.organizationId !== input.organizationId ||
      !project ||
      project.organizationId !== input.organizationId
    ) {
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

    const existingIdeState = this.projectIdeStates.get(project.id);
    if (job.state === 'COMPLETED') {
      if (
        project.deletedAt !== undefined ||
        !existingIdeState ||
        remixIdeStateDigest(existingIdeState.state) !== job.targetIdeStateDigest
      ) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED')), {
          statusCode: 409,
          code: 'REMIX_TARGET_DIGEST_MISMATCH',
        });
      }
      return job;
    }

    if (
      job.state !== 'INDEXING' ||
      job.operationToken !== input.operationToken ||
      !job.operationExpiresAt ||
      Date.parse(job.operationExpiresAt) <= Date.now() ||
      job.version !== input.expectedVersion ||
      project.deletedAt === undefined
    ) {
      return undefined;
    }

    if (existingIdeState && remixIdeStateDigest(existingIdeState.state) !== job.targetIdeStateDigest) {
      throw Object.assign(new Error(appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED')), {
        statusCode: 409,
        code: 'REMIX_TARGET_DIGEST_MISMATCH',
      });
    }

    const timestamp = now();
    if (!existingIdeState) {
      this.projectIdeStates.set(project.id, {
        projectId: project.id,
        state: structuredClone(job.targetIdeState),
        version: 1,
        updatedByUserId: job.actorUserId,
        updatedAt: timestamp,
        createdAt: timestamp,
      });
    }

    project.deletedAt = undefined;
    project.updatedAt = timestamp;
    job.state = 'COMPLETED';
    job.operationToken = undefined;
    job.operationExpiresAt = undefined;
    job.version += 1;
    job.updatedAt = timestamp;

    return job;
  }

  async beginRemixCleanup(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    terminalState: 'FAILED';
    errorCode: string;
    error: string;
  }) {
    const job = this.remixJobs.get(input.remixJobId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.sourceProjectId, job?.targetProjectId],
    });

    if (!job || job.organizationId !== input.organizationId || job.state === 'COMPLETED') {
      return undefined;
    }

    Object.assign(job, {
      state: 'CLEANUP_PENDING',
      cleanupTerminalState: input.terminalState,
      errorCode: input.errorCode,
      error: input.error,
      operationToken: input.operationToken,
      operationExpiresAt: new Date(Date.now() + 300_000).toISOString(),
      version: job.version + 1,
      updatedAt: now(),
    });

    return job;
  }

  async deleteClaimedRemixProject(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }) {
    const job = this.remixJobs.get(input.remixJobId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.sourceProjectId, job?.targetProjectId, input.targetProjectId],
    });

    if (!job || job.state !== 'CLEANUP_PENDING' || job.operationToken !== input.operationToken) {
      return false;
    }

    this.projects.delete(input.targetProjectId);
    this.projectManifestRevisions.delete(input.targetProjectId);
    this.projectIdeStates.delete(input.targetProjectId);
    job.targetProjectId = undefined;

    return true;
  }

  async finishRemixCleanup(input: { remixJobId: string; organizationId: string; operationToken: string }) {
    const job = this.remixJobs.get(input.remixJobId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.sourceProjectId, job?.targetProjectId],
    });

    if (!job || job.state !== 'CLEANUP_PENDING' || job.operationToken !== input.operationToken || job.targetProjectId) {
      return undefined;
    }

    job.state = 'FAILED';
    job.operationToken = undefined;
    job.operationExpiresAt = undefined;
    job.cleanupTerminalState = undefined;
    job.storageShareId = undefined;
    job.targetDatabaseInstanceId = undefined;
    job.version += 1;
    job.updatedAt = now();

    return job;
  }

  async getRemixJob(id: string, organizationId?: string) {
    const row = this.remixJobs.get(id);
    return row && (!organizationId || row.organizationId === organizationId) ? row : undefined;
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
    const sourceInventory = retainedRemixSourceInventory(input.sourceInventory);
    const tenantScopes = [
      { projectId: input.sourceProjectId, expectedOrganizationId: input.sourceOrganizationId },
      { projectId: input.targetProjectId, expectedOrganizationId: input.targetOrganizationId },
    ].sort((left, right) => left.projectId.localeCompare(right.projectId));

    const replayExisting = (existing: RemixStorageShareRecord) => {
      if (
        existing.sourceProjectId !== input.sourceProjectId ||
        existing.sourceOrganizationId !== input.sourceOrganizationId ||
        existing.targetOrganizationId !== input.targetOrganizationId ||
        existing.consentVersion !== input.consentVersion ||
        (existing.consentedByUserId ?? null) !== (input.consentedByUserId ?? null) ||
        existing.state !== 'ACTIVE' ||
        JSON.stringify(retainedRemixSourceInventory(existing.sourceInventory)) !== JSON.stringify(sourceInventory)
      ) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_STORAGE_SHARE_CONFLICT')), {
          statusCode: 409,
          code: 'REMIX_STORAGE_SHARE_CONFLICT',
        });
      }
      return existing;
    };

    return this._withProjectPhysicalAccessesAllowingDeletedProjects(tenantScopes, [input.targetProjectId], async () => {
      this._assertAccountPurgeMutationAllowed({
        userIds: [input.consentedByUserId],
        organizationIds: [input.sourceOrganizationId, input.targetOrganizationId],
        projectIds: [input.sourceProjectId, input.targetProjectId],
      });
      const existing = this.remixStorageShares.get(input.targetProjectId);
      if (existing) return replayExisting(existing);

      const liveInventory = canonicalObjectStorageInventory(await input.prepareSourceRetention());
      if (JSON.stringify(liveInventory) !== JSON.stringify(sourceInventory)) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_STORAGE_SHARE_CONFLICT')), {
          code: 'REMIX_STORAGE_SOURCE_CHANGED',
          statusCode: 409,
        });
      }
      for (const scope of tenantScopes) {
        await this.assertProjectTenantMutationAllowed(scope, {
          allowDeletedProject: scope.projectId === input.targetProjectId,
        });
      }
      if (
        [input.sourceProjectId, input.targetProjectId].some(
          (projectId) => (this.objectStorageCapabilityExpiresAt.get(projectId) ?? 0) > Date.now(),
        )
      ) {
        throw Object.assign(new Error(appPublicEnglish('OBJECT_STORAGE_CAPABILITY_ACTIVE')), {
          code: 'OBJECT_STORAGE_CAPABILITY_ACTIVE',
          statusCode: 409,
        });
      }

      const row: RemixStorageShareRecord = {
        id: id('remix-share'),
        sourceProjectId: input.sourceProjectId,
        targetProjectId: input.targetProjectId,
        sourceOrganizationId: input.sourceOrganizationId,
        targetOrganizationId: input.targetOrganizationId,
        consentVersion: input.consentVersion,
        ...(input.consentedByUserId ? { consentedByUserId: input.consentedByUserId } : {}),
        sourceInventory,
        consentedAt: now(),
        state: 'ACTIVE',
      };
      const winner = this.remixStorageShares.get(input.targetProjectId);
      if (winner) return replayExisting(winner);
      this.remixStorageShares.set(input.targetProjectId, row);

      return row;
    });
  }

  async getRemixStorageShareByTarget(targetProjectId: string) {
    const row = this.remixStorageShares.get(targetProjectId);
    return row?.state === 'ACTIVE' ? row : undefined;
  }

  async revokeRemixStorageShare(input: { targetProjectId: string; targetOrganizationId: string }) {
    const share = this.remixStorageShares.get(input.targetProjectId);
    const tenantScopes = [
      { projectId: input.targetProjectId, expectedOrganizationId: input.targetOrganizationId },
      ...(share ? [{ projectId: share.sourceProjectId, expectedOrganizationId: share.sourceOrganizationId }] : []),
    ].sort((left, right) => left.projectId.localeCompare(right.projectId));

    return this.withProjectPhysicalAccesses(tenantScopes, async () => {
      for (const tenantScope of tenantScopes) {
        await this.assertProjectTenantMutationAllowed(tenantScope);
      }
      this._assertAccountPurgeMutationAllowed({
        userIds: [share?.consentedByUserId],
        organizationIds: [share?.sourceOrganizationId, input.targetOrganizationId],
        projectIds: [share?.sourceProjectId, input.targetProjectId],
      });

      if (!share || share.targetOrganizationId !== input.targetOrganizationId || share.state !== 'ACTIVE') {
        return undefined;
      }

      const revoked: RemixStorageShareRecord = {
        ...share,
        state: 'REVOKED',
        revokedAt: now(),
      };
      this.remixStorageShares.set(input.targetProjectId, revoked);

      return revoked;
    });
  }

  async deleteClaimedRemixStorageShare(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }) {
    const job = this.remixJobs.get(input.remixJobId);
    const share = this.remixStorageShares.get(input.targetProjectId);
    const tenantScopes = [
      { projectId: input.targetProjectId, expectedOrganizationId: input.organizationId },
      ...(share ? [{ projectId: share.sourceProjectId, expectedOrganizationId: share.sourceOrganizationId }] : []),
    ].sort((left, right) => left.projectId.localeCompare(right.projectId));

    return this._withProjectPhysicalAccessesAllowingDeletedProjects(tenantScopes, [input.targetProjectId], async () => {
      for (const tenantScope of tenantScopes) {
        await this.assertProjectTenantMutationAllowed(tenantScope, {
          allowDeletedProject: tenantScope.projectId === input.targetProjectId,
        });
      }
      this._assertAccountPurgeMutationAllowed({
        userIds: [job?.actorUserId],
        organizationIds: [input.organizationId],
        projectIds: [job?.sourceProjectId, job?.targetProjectId, input.targetProjectId],
      });

      if (
        !job ||
        job.organizationId !== input.organizationId ||
        job.state !== 'CLEANUP_PENDING' ||
        job.operationToken !== input.operationToken ||
        !job.operationExpiresAt ||
        Date.parse(job.operationExpiresAt) <= Date.now() ||
        job.targetProjectId !== input.targetProjectId ||
        (share && share.targetOrganizationId !== input.organizationId)
      ) {
        return false;
      }

      return this.remixStorageShares.delete(input.targetProjectId);
    });
  }

  galleryListings = new Map<string, GalleryListingRecord>();

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
  }): Promise<GalleryListingRecord> {
    const status = input.status ?? 'PUBLISHED';

    const row: GalleryListingRecord = {
      id: id('gallery'),
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
      authorUserId: input.authorUserId,
      appUrl: input.appUrl,
      thumbnailUrl: input.thumbnailUrl,
      remixAllowed: input.remixAllowed ?? false, // FAIL-CLOSED : jamais remixable sans choix explicite
      licenseId: input.licenseId,
      licenseText: input.licenseText,
      licenseTextSha256: input.licenseTextSha256,
      piiConsentVersion: input.piiConsentVersion,
      rightsConfirmedAt: input.rightsConfirmedAt,
      rightsConfirmedBy: input.rightsConfirmedBy,
      piiPolicyAcceptedAt: input.piiPolicyAcceptedAt,
      piiPolicyAcceptedBy: input.piiPolicyAcceptedBy,
      viewCount: 0,
      useCount: 0,
      createdAt: now(),
      publishedAt: input.publishedAt ?? (status === 'PUBLISHED' ? now() : undefined),
    };
    this.galleryListings.set(row.id, row);

    return row;
  }

  async listGalleryListings(opts?: {
    status?: string;
    category?: string;
    query?: string;
    featured?: boolean;
    limit?: number;
  }): Promise<GalleryListingRecord[]> {
    const status = opts?.status ?? 'PUBLISHED';
    const query = opts?.query?.trim().toLowerCase();

    let rows = [...this.galleryListings.values()].filter((row) => {
      if (row.status !== status) {
        return false;
      }

      if (opts?.category && opts.category !== 'all' && row.category !== opts.category) {
        return false;
      }

      if (opts?.featured !== undefined && row.featured !== opts.featured) {
        return false;
      }

      if (query) {
        const hay = [row.title, row.description, row.authorName, ...row.tags].join(' ').toLowerCase();

        if (!hay.includes(query)) {
          return false;
        }
      }

      return true;
    });
    rows = rows.sort((a, b) => {
      if (a.featured !== b.featured) {
        return a.featured ? -1 : 1;
      }

      return (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);
    });

    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }

  async getGalleryListingBySlug(slug: string) {
    return [...this.galleryListings.values()].find((row) => row.slug === slug);
  }

  async getGalleryListingById(id: string) {
    return this.galleryListings.get(id);
  }

  async incrementGalleryListingViews(id: string) {
    const row = this.galleryListings.get(id);

    if (row) {
      row.viewCount += 1;
    }
  }

  async incrementGalleryListingUses(id: string) {
    const row = this.galleryListings.get(id);

    if (row) {
      row.useCount += 1;
    }
  }

  importJobs = new Map<string, ImportJobRecord & { stagedFiles?: ImportStagedFile[]; connectorPreview?: unknown }>();
  importReservations = new Map<string, ImportCreditReservationRecord>();

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
    this._assertAccountPurgeMutationAllowed({
      userIds: [input.actorUserId],
      organizationIds: [input.organizationId],
    });
    const existing = [...this.importJobs.values()].find(
      (job) => job.organizationId === input.organizationId && job.idempotencyKey === input.idempotencyKey,
    );

    if (existing) {
      this._assertStateMachineNotPurged(undefined, existing.error);
      if (existing.requestHash !== input.requestHash) {
        throw Object.assign(new Error('This import idempotency key is already bound to another request.'), {
          statusCode: 409,
          code: 'IMPORT_IDEMPOTENCY_CONFLICT',
        });
      }

      return {
        job: existing,
        reservation: this.importReservations.get(existing.id)!,
        replayed: true,
      };
    }

    const timestamp = now();

    const row: ImportJobRecord & { stagedFiles?: ImportStagedFile[]; connectorPreview?: unknown } = {
      id: id('import'),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      provider: input.provider,
      state: 'RECEIVED',
      sourceRef: input.sourceRef,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      stagedFileCount: 0,
      redactedCount: 0,
      creditsReserved: true,
      version: 0,
      expiresAt:
        input.expiresInMs !== undefined ? new Date(Date.now() + input.expiresInMs).toISOString() : input.expiresAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const reservation: ImportCreditReservationRecord = {
      key: input.idempotencyKey,
      organizationId: input.organizationId,
      importJobId: row.id,
      reservedCredits: input.reservedCredits,
      debitedCredits: 0,
      state: 'RESERVED',
      version: 0,
    };
    this.importJobs.set(row.id, row);
    this.importReservations.set(row.id, reservation);

    return { job: row, reservation, replayed: false };
  }

  async getImportStaging(id: string, organizationId: string) {
    const row = this.importJobs.get(id);

    return row?.organizationId === organizationId && row.stagedFiles
      ? { files: row.stagedFiles, preview: row.connectorPreview }
      : undefined;
  }

  async getImportReservationByJob(importJobId: string, organizationId: string) {
    const row = this.importReservations.get(importJobId);

    return row?.organizationId === organizationId ? row : undefined;
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
    const row = this.importJobs.get(input.id);
    this._assertStateMachineNotPurged(undefined, row?.error);
    this._assertAccountPurgeMutationAllowed({
      userIds: [row?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [row?.targetProjectId, input.patch?.targetProjectId],
    });

    if (
      !row ||
      row.organizationId !== input.organizationId ||
      row.version !== input.expectedVersion ||
      !input.expectedStates.includes(row.state)
    ) {
      return undefined;
    }

    Object.assign(row, input.patch, {
      state: input.state,
      version: row.version + 1,
      updatedAt: now(),
      ...(input.operationLeaseDurationMs !== undefined
        ? { operationExpiresAt: new Date(Date.now() + input.operationLeaseDurationMs).toISOString() }
        : {}),
    });

    if (input.patch?.targetProjectId === null) {
      row.targetProjectId = undefined;
    }

    if (input.patch?.operationToken === null) {
      row.operationToken = undefined;
    }

    if (input.patch?.operationExpiresAt === null) {
      row.operationExpiresAt = undefined;
    }

    if (input.patch?.cleanupTerminalState === null) {
      row.cleanupTerminalState = undefined;
    }

    if (input.patch?.error === null) {
      row.error = undefined;
    }

    return row;
  }

  async renewImportJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
    leaseDurationMs: number;
  }) {
    const row = this.importJobs.get(input.id);
    this._assertAccountPurgeMutationAllowed({
      userIds: [row?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [row?.targetProjectId],
    });

    if (
      !row ||
      row.organizationId !== input.organizationId ||
      row.operationToken !== input.operationToken ||
      !input.expectedStates.includes(row.state) ||
      !row.operationExpiresAt ||
      new Date(row.operationExpiresAt).getTime() <= Date.now()
    ) {
      return undefined;
    }

    row.operationExpiresAt = new Date(Date.now() + input.leaseDurationMs).toISOString();
    row.version += 1;
    row.updatedAt = now();

    return row;
  }

  async validateImportJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
  }) {
    const row = this.importJobs.get(input.id);
    this._assertAccountPurgeMutationAllowed({
      userIds: [row?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [row?.targetProjectId],
    });
    return Boolean(
      row &&
        row.organizationId === input.organizationId &&
        row.operationToken === input.operationToken &&
        input.expectedStates.includes(row.state) &&
        row.operationExpiresAt &&
        new Date(row.operationExpiresAt).getTime() > Date.now(),
    );
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
    const job = this.importJobs.get(input.importJobId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.targetProjectId],
    });

    if (
      !job ||
      job.organizationId !== input.organizationId ||
      job.state !== 'COMMITTING' ||
      job.operationToken !== input.operationToken ||
      !job.operationExpiresAt ||
      new Date(job.operationExpiresAt).getTime() <= Date.now()
    ) {
      throw Object.assign(new Error('Import commit ownership was lost.'), {
        statusCode: 409,
        code: 'IMPORT_COMMIT_OWNERSHIP_LOST',
      });
    }

    if (job.targetProjectId) {
      const existing = this.projects.get(job.targetProjectId);

      if (existing) {
        const existingRevision = await this.getLatestProjectManifest(existing.id);

        if (existingRevision) {
          verifyStoredProjectManifestRevision(existingRevision, existing.id);
        } else {
          const manifest = input.initialManifest
            ? projectManifestForClone(input.initialManifest, existing.id, input.manifestCloneMode)
            : createDefaultProjectManifest(existing.id);
          this.projectManifestRevisions.set(existing.id, [
            {
              id: id('project_manifest'),
              projectId: existing.id,
              schemaVersion: manifest.schemaVersion,
              manifestVersion: manifest.manifestVersion,
              digest: projectManifestDigest(manifest),
              manifest,
              createdByUserId: job.actorUserId,
              createdAt: now(),
            },
          ]);
        }

        return existing;
      }
    }

    const baseSlug = slugify(input.slug) || `import-${job.id.slice(-8).toLowerCase()}`;
    const slug = [...this.projects.values()].some(
      (candidate) => candidate.organizationId === input.organizationId && candidate.slug === baseSlug,
    )
      ? `${baseSlug}-${job.id.slice(-8).toLowerCase()}`
      : baseSlug;
    const project = await this.createProject({
      organizationId: input.organizationId,
      name: input.name,
      slug,
      sourceType: input.sourceType,
      description: input.description,
      templateName: input.templateName,
      gitRepositoryUrl: input.gitRepositoryUrl,
      gitDefaultBranch: input.gitDefaultBranch,
      initialManifest: input.initialManifest,
      manifestCloneMode: input.manifestCloneMode,
    });
    project.deletedAt = now();
    job.targetProjectId = project.id;
    job.version += 1;
    job.updatedAt = now();

    return project;
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
    const job = this.importJobs.get(input.importJobId);
    const reservation = this.importReservations.get(input.importJobId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.targetProjectId, input.targetProjectId],
    });

    if (
      job?.organizationId === input.organizationId &&
      job.state === 'COMMITTED' &&
      job.targetProjectId === input.targetProjectId
    ) {
      if (reservation?.state !== 'SETTLED' || reservation.debitedCredits !== input.actualCredits) {
        throw Object.assign(new Error('Import commit replay differs from the durable settlement.'), {
          statusCode: 409,
          code: 'IMPORT_COMMIT_REPLAY_MISMATCH',
        });
      }

      return { job, reservation };
    }

    if (
      !job ||
      !reservation ||
      job.organizationId !== input.organizationId ||
      job.state !== 'COMMITTING' ||
      job.targetProjectId !== input.targetProjectId ||
      job.operationToken !== input.operationToken ||
      !job.operationExpiresAt ||
      new Date(job.operationExpiresAt).getTime() <= Date.now() ||
      reservation.state !== 'RESERVED'
    ) {
      return undefined;
    }

    const target = this.projects.get(input.targetProjectId);

    if (!target || target.organizationId !== input.organizationId) {
      return undefined;
    }

    reservation.state = 'SETTLED';
    reservation.debitedCredits = input.actualCredits;
    reservation.version += 1;
    if (input.projectIdeState !== undefined) {
      const existingIdeState = this.projectIdeStates.get(target.id);
      this.projectIdeStates.set(target.id, {
        projectId: target.id,
        state: input.projectIdeState,
        version: existingIdeState ? existingIdeState.version + 1 : 1,
        updatedByUserId: input.updatedByUserId,
        updatedAt: now(),
        createdAt: existingIdeState?.createdAt ?? now(),
      });
    }
    target.deletedAt = undefined;
    target.updatedAt = now();
    Object.assign(job, {
      state: 'COMMITTED',
      stagedFiles: undefined,
      connectorPreview: undefined,
      operationToken: undefined,
      operationExpiresAt: undefined,
      cleanupTerminalState: undefined,
      error: undefined,
      version: job.version + 1,
      updatedAt: now(),
    });

    return { job, reservation };
  }

  async beginImportCleanup(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
    terminalState: 'ROLLING_BACK' | 'EXPIRED' | 'FAILED';
    error?: string;
  }) {
    const job = this.importJobs.get(input.importJobId);
    const reservation = this.importReservations.get(input.importJobId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.targetProjectId],
    });

    const otherOwnerActive =
      job?.operationToken &&
      job.operationToken !== input.operationToken &&
      job.operationExpiresAt &&
      new Date(job.operationExpiresAt).getTime() > Date.now();

    if (
      !job ||
      job.organizationId !== input.organizationId ||
      !input.expectedStates.includes(job.state) ||
      otherOwnerActive
    ) {
      return undefined;
    }

    if (reservation?.state === 'SETTLED') {
      return undefined;
    }

    if (reservation) {
      reservation.state = 'COMPENSATED';
      reservation.debitedCredits = 0;
      reservation.version += 1;
    }

    if (job.targetProjectId) {
      const target = this.projects.get(job.targetProjectId);

      if (target?.organizationId === input.organizationId) {
        target.deletedAt = now();
      }
    }

    Object.assign(job, {
      state: 'CLEANUP_PENDING',
      stagedFiles: undefined,
      connectorPreview: undefined,
      operationToken: input.operationToken,
      operationExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      cleanupTerminalState: input.terminalState,
      error: input.error,
      version: job.version + 1,
      updatedAt: now(),
    });

    return job;
  }

  async deleteClaimedImportProject(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }) {
    const job = this.importJobs.get(input.importJobId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.targetProjectId, input.targetProjectId],
    });

    if (
      !job ||
      job.organizationId !== input.organizationId ||
      job.state !== 'CLEANUP_PENDING' ||
      job.operationToken !== input.operationToken ||
      job.targetProjectId !== input.targetProjectId ||
      !job.operationExpiresAt ||
      new Date(job.operationExpiresAt).getTime() <= Date.now()
    ) {
      return false;
    }

    const target = this.projects.get(input.targetProjectId);

    if (!target || target.organizationId !== input.organizationId || !target.deletedAt) {
      return false;
    }

    this.projects.delete(input.targetProjectId);
    this.projectManifestRevisions.delete(input.targetProjectId);
    this.projectIdeStates.delete(input.targetProjectId);
    job.targetProjectId = undefined;

    return true;
  }

  async finishImportCleanup(input: { importJobId: string; organizationId: string; operationToken: string }) {
    const job = this.importJobs.get(input.importJobId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [input.organizationId],
      projectIds: [job?.targetProjectId],
    });

    if (
      !job ||
      job.organizationId !== input.organizationId ||
      job.state !== 'CLEANUP_PENDING' ||
      job.operationToken !== input.operationToken ||
      !job.cleanupTerminalState ||
      job.targetProjectId ||
      !job.operationExpiresAt ||
      new Date(job.operationExpiresAt).getTime() <= Date.now()
    ) {
      return undefined;
    }

    Object.assign(job, {
      state: job.cleanupTerminalState,
      targetProjectId: undefined,
      operationToken: undefined,
      operationExpiresAt: undefined,
      cleanupTerminalState: undefined,
      version: job.version + 1,
      updatedAt: now(),
    });

    return job;
  }

  async cancelImportJob(importJobId: string, organizationId: string) {
    const job = this.importJobs.get(importJobId);
    this._assertAccountPurgeMutationAllowed({
      userIds: [job?.actorUserId],
      organizationIds: [organizationId],
      projectIds: [job?.targetProjectId],
    });

    if (!job || job.organizationId !== organizationId) {
      return undefined;
    }

    if (job.state === 'CANCELLED') {
      return job;
    }

    if (['COMMITTED', 'COMMITTING', 'CLEANUP_PENDING', 'ROLLING_BACK', 'EXPIRED', 'FAILED'].includes(job.state)) {
      return undefined;
    }

    const reservation = this.importReservations.get(importJobId);

    if (reservation?.state === 'RESERVED') {
      reservation.state = 'COMPENSATED';
      reservation.debitedCredits = 0;
      reservation.version += 1;
    }

    Object.assign(job, {
      state: 'CANCELLED',
      stagedFiles: undefined,
      connectorPreview: undefined,
      version: job.version + 1,
      updatedAt: now(),
    });

    return job;
  }

  async getImportJob(id: string) {
    return this.importJobs.get(id);
  }

  async reapExpiredImportJobs(nowIso = new Date().toISOString()): Promise<string[]> {
    const now = new Date(nowIso).getTime();
    const terminal = new Set(['COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED']);
    const ids: string[] = [];

    for (const row of this.importJobs.values()) {
      this._assertAccountPurgeMutationAllowed({
        userIds: [row.actorUserId],
        organizationIds: [row.organizationId],
        projectIds: [row.targetProjectId],
      });
      const operationExpired = row.operationExpiresAt && new Date(row.operationExpiresAt).getTime() < now;
      const stagingExpired = row.expiresAt && new Date(row.expiresAt).getTime() < now;

      if (!terminal.has(row.state) && (operationExpired || stagingExpired)) {
        if (row.targetProjectId) {
          const target = this.projects.get(row.targetProjectId);

          if (target?.organizationId === row.organizationId) {
            target.deletedAt = new Date(now).toISOString();
          }
        }

        row.state = row.targetProjectId ? 'CLEANUP_PENDING' : 'EXPIRED';
        row.error = 'Import staging expired before it was committed.';
        row.stagedFiles = undefined;
        row.connectorPreview = undefined;
        row.version += 1;

        if (row.targetProjectId) {
          row.cleanupTerminalState = 'EXPIRED';
          row.operationToken = id('reap');
          row.operationExpiresAt = new Date(now + 5 * 60_000).toISOString();
        }

        const reservation = this.importReservations.get(row.id);

        if (reservation?.state === 'RESERVED') {
          reservation.state = 'COMPENSATED';
          reservation.version += 1;
        }

        ids.push(row.id);
      }
    }

    return ids;
  }

  async countAgentRoutingCards(): Promise<number> {
    return this.agentRoutingCards.length;
  }

  async insertAgentRoutingCard(input: {
    version: number;
    data: unknown;
    sourceDate?: string;
    effectiveFrom?: string;
    active: boolean;
    createdByUserId?: string;
  }): Promise<void> {
    this.agentRoutingCards.push({
      version: input.version,
      active: input.active,
      data: input.data,
      effectiveFrom: input.effectiveFrom ?? now(),
      sourceDate: input.sourceDate,
      createdAt: now(),
      createdByUserId: input.createdByUserId,
    });
  }

  async createAgentRoutingCardVersion(input: {
    data: unknown;
    sourceDate?: string;
    createdByUserId?: string;
  }): Promise<{ version: number; effectiveFrom: string }> {
    const effectiveFrom = now();
    const version = Math.max(0, ...this.agentRoutingCards.map((card) => card.version)) + 1;

    for (const card of this.agentRoutingCards) {
      if (card.active) {
        card.active = false;
        card.effectiveTo = effectiveFrom;
      }
    }

    this.agentRoutingCards.push({
      version,
      active: true,
      data: { ...(input.data as Record<string, unknown>), version, effectiveFrom },
      effectiveFrom,
      sourceDate: input.sourceDate,
      createdAt: effectiveFrom,
      createdByUserId: input.createdByUserId,
    });

    return { version, effectiveFrom };
  }

  async listAgentRoutingCards(limit = 50) {
    return [...this.agentRoutingCards].sort((a, b) => b.version - a.version).slice(0, limit);
  }

  async recordAgentCall(input: Omit<(typeof this.agentCalls)[number], 'id' | 'createdAt'>): Promise<void> {
    this.agentCalls.push({ id: id('agentcall'), createdAt: now(), ...input });
  }

  async aggregateAgentCallVolume(sinceIso: string) {
    const byLine = new Map<
      string,
      {
        lineKey: string;
        calls: number;
        tokensIn: number;
        tokensOut: number;
        costMillicents: number;
        creditCents: number;
        marginMillicents: number;
      }
    >();

    for (const call of this.agentCalls) {
      if (call.createdAt < sinceIso) {
        continue;
      }

      const entry = byLine.get(call.lineKey) ?? {
        lineKey: call.lineKey,
        calls: 0,
        tokensIn: 0,
        tokensOut: 0,
        costMillicents: 0,
        creditCents: 0,
        marginMillicents: 0,
      };
      entry.calls += 1;
      entry.tokensIn += call.tokensIn;
      entry.tokensOut += call.tokensOut;
      entry.costMillicents += call.costMillicents;
      entry.creditCents += call.creditCents;
      entry.marginMillicents += call.marginMillicents;
      byLine.set(call.lineKey, entry);
    }

    return [...byLine.values()];
  }

  async listAgentCalls(limit = 100) {
    return [...this.agentCalls].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
  }

  async createSupportTicket(input: { organizationId: string; userId: string; subject: string; category?: string }) {
    const ticket: SupportTicketRecord = { id: id('ticket'), ...input, status: 'OPEN', createdAt: now() };
    this.supportTickets.set(ticket.id, ticket);

    return ticket;
  }

  async listSupportTickets(organizationId: string) {
    return [...this.supportTickets.values()].filter((ticket) => ticket.organizationId === organizationId);
  }

  async getSupportTicket(organizationId: string, ticketId: string) {
    const ticket = this.supportTickets.get(ticketId);
    return ticket && ticket.organizationId === organizationId ? ticket : null;
  }

  async listTicketMessages(ticketId: string) {
    return this.ticketMessages
      .filter((message) => message.ticketId === ticketId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addTicketMessage(input: {
    ticketId: string;
    authorType: TicketMessageRecord['authorType'];
    authorUserId?: string;
    body: string;
  }) {
    const message: TicketMessageRecord = {
      id: id('ticketmsg'),
      ticketId: input.ticketId,
      authorType: input.authorType,
      authorUserId: input.authorUserId,
      body: input.body,
      createdAt: now(),
    };
    this.ticketMessages.push(message);

    return message;
  }

  async setFeatureFlag(input: { organizationId?: string; key: string; enabled: boolean; rolloutPercent?: number }) {
    const flagId = `${input.organizationId ?? 'system'}:${input.key}`;

    const rolloutPercent =
      input.rolloutPercent === undefined ? undefined : Math.max(0, Math.min(100, Math.round(input.rolloutPercent)));
    const flag: FeatureFlagRecord = {
      id: flagId,
      organizationId: input.organizationId,
      key: input.key,
      enabled: input.enabled,
      rolloutPercent,
    };
    this.featureFlags.set(flagId, flag);

    return flag;
  }

  async listFeatureFlags(organizationId?: string) {
    return [...this.featureFlags.values()].filter((flag) => flag.organizationId === organizationId);
  }

  async findFeatureFlag(key: string, organizationId?: string) {
    if (organizationId) {
      const scoped = [...this.featureFlags.values()].find(
        (flag) => flag.organizationId === organizationId && flag.key === key,
      );

      if (scoped) {
        return scoped;
      }
    }

    return [...this.featureFlags.values()].find((flag) => !flag.organizationId && flag.key === key);
  }

  async listEffectiveFeatureFlags(organizationId?: string) {
    const byKey = new Map<string, FeatureFlagRecord>();

    for (const flag of this.featureFlags.values()) {
      if (!flag.organizationId) {
        byKey.set(flag.key, flag);
      }
    }

    if (organizationId) {
      for (const flag of this.featureFlags.values()) {
        if (flag.organizationId === organizationId) {
          byKey.set(flag.key, flag);
        }
      }
    }

    return [...byKey.values()];
  }

  async createAbuseEvent(input: { organizationId?: string; userId?: string; type: string; severity: string }) {
    const event = { id: id('abuse'), ...input, createdAt: now() };
    this.abuseEvents.set(event.id, event);

    return event;
  }

  async listAbuseEvents(filter?: { organizationId?: string; type?: string; take?: number }) {
    let events = [...this.abuseEvents.values()];

    if (filter?.organizationId) {
      events = events.filter((event) => event.organizationId === filter.organizationId);
    }

    if (filter?.type) {
      events = events.filter((event) => event.type === filter.type);
    }

    // Most-recent-first, matching prisma-store's orderBy: { createdAt: 'desc' }.
    events.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

    const take = filter?.take ?? 1000;

    return events.slice(0, take);
  }

  async createIntegrationFeatureRequest(input: {
    userId: string;
    organizationId?: string;
    integrationName: string;
    useCaseDescription: string;
  }) {
    const request: IntegrationFeatureRequestRecord = {
      id: id('intreq'),
      userId: input.userId,
      organizationId: input.organizationId,
      integrationName: input.integrationName,
      useCaseDescription: input.useCaseDescription,
      status: 'pending',
      createdAt: now(),
    };
    this.integrationFeatureRequests.set(request.id, request);

    return request;
  }

  async listIntegrationFeatureRequests(filter: { userId: string; organizationId?: string; take?: number }) {
    const requests = [...this.integrationFeatureRequests.values()].filter((request) =>
      filter.organizationId
        ? request.userId === filter.userId || request.organizationId === filter.organizationId
        : request.userId === filter.userId,
    );

    // Most-recent-first, matching prisma-store's orderBy: { createdAt: 'desc' }.
    requests.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

    return requests.slice(0, filter.take ?? 200);
  }

  async upsertAiMessageFeedback(input: {
    userId: string;
    messageId: string;
    vote: AiMessageFeedbackVote;
    chatId?: string;
  }) {
    const key = `${input.userId}:${input.messageId}`;
    const existing = this.aiMessageFeedback.get(key);

    const record: AiMessageFeedbackRecord = {
      id: existing?.id ?? id('msgfb'),
      userId: input.userId,
      messageId: input.messageId,

      // Prisma skips an undefined chatId on update, keeping the stored one.
      chatId: input.chatId ?? existing?.chatId,
      vote: input.vote,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    };
    this.aiMessageFeedback.set(key, record);

    return record;
  }

  async deleteAiMessageFeedback(input: { userId: string; messageId: string }) {
    return this.aiMessageFeedback.delete(`${input.userId}:${input.messageId}`);
  }

  async setSystemSetting(input: { key: string; value?: unknown }) {
    const setting = { ...input, updatedAt: now() };
    this.systemSettings.set(setting.key, setting);

    return setting;
  }

  async mutateSystemSettingIds(key: string, change: { add?: string; remove?: string }): Promise<string[]> {
    const existing = this.systemSettings.get(key);

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
    this.systemSettings.set(key, { key, value: next, updatedAt: now() });

    return next;
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
    const setting = this.systemSettings.get(key);
    const value = setting?.value as { version?: unknown; lastDigest?: unknown } | undefined;
    const lastDigest = value?.version === 1 && typeof value.lastDigest === 'string' ? value.lastDigest : undefined;
    const firstAfter = lastDigest === undefined ? 0 : digests.findIndex((digest) => digest > lastDigest);
    const start = firstAfter < 0 ? 0 : firstAfter;
    const batch = digests.slice(start, start + input.limit);
    this.systemSettings.set(key, {
      key,
      value: { version: 1, lastDigest: batch.at(-1) ?? null },
      updatedAt: now(),
    });
    return batch;
  }

  async listSystemSettings() {
    return [...this.systemSettings.values()];
  }

  async getEnterpriseSettings(organizationId: string) {
    const existing = this.enterpriseSettings.get(organizationId);

    if (existing) {
      return existing;
    }

    const defaults: EnterpriseSettingsRecord = {
      organizationId,
      ipAllowlist: [],
      sessionDurationMinutes: 60 * 24 * 30,
      requireMfaForAdmins: false,
      dataRetentionDays: 365,
      legalHoldEnabled: false,
      ssoEnforced: false,
      ssoEnforcedAt: null,
      updatedAt: now(),
    };
    this.enterpriseSettings.set(organizationId, defaults);

    return defaults;
  }

  async updateEnterpriseSettings(
    input: Partial<Omit<EnterpriseSettingsRecord, 'updatedAt'>> & { organizationId: string },
  ) {
    const current = await this.getEnterpriseSettings(input.organizationId);
    const updated = { ...current, ...input, updatedAt: now() };
    this.enterpriseSettings.set(input.organizationId, updated);

    return updated;
  }

  async createDomainVerification(input: {
    organizationId: string;
    domain: string;
    verificationToken: string;
    redirectWww?: boolean;
    wildcardEnabled?: boolean;
  }) {
    const record: DomainVerificationRecord = {
      id: id('domain'),
      ...input,
      domain: input.domain.toLowerCase(),
      redirectWww: input.redirectWww ?? true,
      wildcardEnabled: input.wildcardEnabled ?? false,
      sslStatus: 'pending_dns',
      createdAt: now(),
    };
    this.domainVerifications.set(record.id, record);

    return record;
  }

  async verifyDomain(input: { organizationId: string; domain: string }) {
    const record = [...this.domainVerifications.values()].find(
      (item) => item.organizationId === input.organizationId && item.domain === input.domain.toLowerCase(),
    );

    if (record) {
      record.verifiedAt = now();
      record.sslStatus = 'dns_verified';
    }

    return record;
  }

  async updateDomainVerificationConfig(input: {
    organizationId: string;
    domain: string;
    redirectWww?: boolean;
    wildcardEnabled?: boolean;
  }) {
    const record = [...this.domainVerifications.values()].find(
      (item) => item.organizationId === input.organizationId && item.domain === input.domain.toLowerCase(),
    );

    if (record) {
      if (typeof input.redirectWww === 'boolean') {
        record.redirectWww = input.redirectWww;
      }

      if (typeof input.wildcardEnabled === 'boolean') {
        record.wildcardEnabled = input.wildcardEnabled;
      }
    }

    return record;
  }

  async listDomainVerifications(organizationId: string) {
    return [...this.domainVerifications.values()].filter((item) => item.organizationId === organizationId);
  }

  async upsertSsoConfig(input: {
    organizationId: string;
    type: 'oidc' | 'saml';
    enabled: boolean;
    encryptedConfig: string;
  }) {
    const key = `${input.organizationId}:${input.type}`;
    const current = this.ssoConfigs.get(key);

    const record: SsoConfigRecord = {
      id: current?.id ?? id('sso'),
      organizationId: input.organizationId,
      type: input.type,
      enabled: input.enabled,
      encryptedConfig: input.encryptedConfig,
      createdAt: current?.createdAt ?? now(),
      updatedAt: now(),
    };
    this.ssoConfigs.set(key, record);

    return record;
  }

  async getSsoConfig(organizationId: string, type: 'oidc' | 'saml') {
    return this.ssoConfigs.get(`${organizationId}:${type}`);
  }

  async createScimToken(input: { organizationId: string; name: string; token: string }) {
    const record: ScimTokenRecord = {
      id: id('scim'),
      organizationId: input.organizationId,
      name: input.name,
      tokenHash: hashToken(input.token),
      createdAt: now(),
    };
    this.scimTokens.set(record.id, record);

    return record;
  }

  async findScimToken(token: string) {
    const tokenHash = hashToken(token);
    const windowStartMs = Date.now() - 24 * 60 * 60 * 1000;

    // F16 — dual-valid: current hash, OR a previous hash still within its 24h window.
    const record = [...this.scimTokens.values()].find(
      (item) =>
        item.tokenHash === tokenHash ||
        (item.previousTokenHash === tokenHash &&
          item.rotatedAt !== undefined &&
          new Date(item.rotatedAt).getTime() >= windowStartMs),
    );

    if (record) {
      record.lastUsedAt = now();
    }

    return record;
  }

  async listScimTokens(organizationId: string) {
    return [...this.scimTokens.values()]
      .filter((token) => token.organizationId === organizationId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async revokeScimToken(tokenId: string) {
    const record = this.scimTokens.get(tokenId);

    if (!record) {
      return undefined;
    }

    this.scimTokens.delete(tokenId);

    return record;
  }

  async rotateScimToken(tokenId: string, newToken: string) {
    const record = this.scimTokens.get(tokenId);

    if (!record) {
      return undefined;
    }

    record.previousTokenHash = record.tokenHash;
    record.tokenHash = hashToken(newToken);
    record.rotatedAt = now();

    return record;
  }

  async createCustomRole(input: { organizationId: string; key: string; name: string; permissions: PermissionKey[] }) {
    const record: CustomRoleRecord = { id: id('role'), ...input, createdAt: now() };
    this.customRoles.set(`${input.organizationId}:${input.key}`, record);

    return record;
  }

  async listCustomRoles(organizationId: string) {
    return [...this.customRoles.values()].filter((role) => role.organizationId === organizationId);
  }

  async createSiemWebhook(input: {
    organizationId: string;
    url: string;
    secret: string;
    secretCiphertext: string;
    enabled: boolean;
  }) {
    const record: SiemWebhookRecord = {
      id: id('siem'),
      organizationId: input.organizationId,
      url: input.url,
      secretHash: hashToken(input.secret),
      secretCiphertext: input.secretCiphertext,
      enabled: input.enabled,
      createdAt: now(),
    };
    this.siemWebhooks.set(record.id, record);

    return record;
  }

  async listSiemWebhooks(organizationId: string) {
    return [...this.siemWebhooks.values()].filter((webhook) => webhook.organizationId === organizationId);
  }

  async deleteSiemWebhook(organizationId: string, webhookId: string) {
    const existing = this.siemWebhooks.get(webhookId);

    if (!existing || existing.organizationId !== organizationId) {
      return null;
    }

    this.siemWebhooks.delete(webhookId);

    return existing;
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
    const record: ApiKeyRecord = {
      id: id('apikey'),
      userId: input.userId,
      organizationId: input.organizationId,
      name: input.name,
      keyHash: input.keyHash,
      keyPrefix: input.keyPrefix,
      scopes: input.scopes,
      expiresAt: input.expiresAt?.toISOString(),
      createdAt: now(),
    };
    this.apiKeys.set(record.id, record);

    return record;
  }

  async listApiKeys(scope: { userId?: string; organizationId?: string }) {
    return [...this.apiKeys.values()]
      .filter((key) =>
        scope.organizationId ? key.organizationId === scope.organizationId : key.userId === scope.userId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findApiKeyByHash(keyHash: string) {
    return [...this.apiKeys.values()].find((key) => key.keyHash === keyHash);
  }

  async touchApiKey(id: string) {
    const key = this.apiKeys.get(id);

    if (key) {
      key.lastUsedAt = now();
    }
  }

  async deleteApiKey(input: { id: string; userId?: string; organizationId?: string }) {
    const key = this.apiKeys.get(input.id);

    if (!key || (input.organizationId ? key.organizationId !== input.organizationId : key.userId !== input.userId)) {
      return false;
    }

    return this.apiKeys.delete(input.id);
  }

  async createOrganizationInvite(input: {
    organizationId: string;
    email: string;
    roleKey: string;
    token: string;
    expiresAt: Date;
    createdByUserId?: string;
  }) {
    const record: OrganizationInviteRecord = {
      id: id('invite'),
      organizationId: input.organizationId,
      email: input.email.toLowerCase(),
      roleKey: input.roleKey,
      tokenHash: hashToken(input.token),
      expiresAt: input.expiresAt.toISOString(),
      createdByUserId: input.createdByUserId,
      createdAt: now(),
    };
    this.organizationInvites.set(record.id, record);

    return record;
  }

  async findOrganizationInviteByToken(token: string) {
    const tokenHash = hashToken(token);
    const invite = [...this.organizationInvites.values()].find((item) => item.tokenHash === tokenHash);

    if (!invite || invite.acceptedAt || new Date(invite.expiresAt).getTime() < Date.now()) {
      return undefined;
    }

    return invite;
  }

  async consumeOrganizationInvite(token: string, userId: string) {
    const tokenHash = hashToken(token);
    const invite = [...this.organizationInvites.values()].find((item) => item.tokenHash === tokenHash);

    if (!invite || invite.acceptedAt || new Date(invite.expiresAt).getTime() < Date.now()) {
      return undefined;
    }

    invite.acceptedAt = now();

    // Mirror prisma-store: do not overwrite an existing member's role on accept.
    const existingMembership = await this.getMembership(userId, invite.organizationId);

    if (!existingMembership) {
      await this.addMember({
        organizationId: invite.organizationId,
        userId,
        roleKey: invite.roleKey,
        invitedByUserId: invite.createdByUserId,
      });
    }

    return invite;
  }

  async listOrganizationInvites(organizationId: string) {
    return [...this.organizationInvites.values()].filter((invite) => invite.organizationId === organizationId);
  }

  async resendOrganizationInvite(inviteId: string, token: string, expiresAt: Date) {
    const invite = this.organizationInvites.get(inviteId);

    if (!invite || invite.acceptedAt) {
      return undefined;
    }

    invite.tokenHash = hashToken(token);
    invite.expiresAt = expiresAt.toISOString();

    return invite;
  }

  async expireOrganizationInvite(inviteId: string) {
    const invite = this.organizationInvites.get(inviteId);

    if (!invite) {
      return undefined;
    }

    invite.expiresAt = now();

    return invite;
  }

  async upsertOAuthConnection(input: {
    userId: string;
    provider: string;
    externalId: string;
    accessToken: string;
    refreshToken?: string;
  }) {
    const key = `${input.provider}:${input.externalId}`;
    const existing = this.oauthConnections.get(key);

    const record: OAuthConnectionRecord = {
      id: existing?.id ?? id('oauth'),
      userId: input.userId,
      provider: input.provider,
      externalId: input.externalId,
      accessHash: hashToken(input.accessToken),
      refreshHash: input.refreshToken ? hashToken(input.refreshToken) : existing?.refreshHash,
      createdAt: existing?.createdAt ?? now(),
    };
    this.oauthConnections.set(key, record);

    return record;
  }

  async listOAuthConnections(userId: string) {
    return [...this.oauthConnections.values()]
      .filter((connection) => connection.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findOAuthConnectionByExternalId(provider: string, externalId: string) {
    return this.oauthConnections.get(`${provider}:${externalId}`) ?? null;
  }

  async deleteOAuthConnection(userId: string, provider: string) {
    let removed = false;

    for (const [key, connection] of this.oauthConnections) {
      if (connection.userId === userId && connection.provider === provider) {
        this.oauthConnections.delete(key);
        removed = true;
      }
    }

    return removed;
  }

  private userConnectionKey(userId: string, provider: string, externalAccountId: string) {
    return `${userId}:${provider}:${externalAccountId}`;
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
  }): Promise<UserConnectionRecord> {
    const key = this.userConnectionKey(input.userId, input.provider, input.externalAccountId);

    const existing = Array.from(this.userConnections.values()).find(
      (row) => this.userConnectionKey(row.userId, row.provider, row.externalAccountId) === key,
    );
    const record: UserConnectionRecord = {
      id: existing?.id ?? id('uconn'),
      userId: input.userId,
      provider: input.provider,
      externalAccountId: input.externalAccountId,
      externalAccountLabel: input.externalAccountLabel,
      accessTokenEncrypted: input.accessTokenEncrypted,
      refreshTokenEncrypted: input.refreshTokenEncrypted,
      apiKeyFieldsEncrypted: input.apiKeyFieldsEncrypted,
      scopes: input.scopes,
      tokenExpiresAt: input.tokenExpiresAt?.toISOString(),
      status: 'active',
      lastUsedAt: existing?.lastUsedAt,
      forAgentUse: input.forAgentUse ?? true,
      oauthAppSource: input.oauthAppSource ?? 'e_code_default',
      oauthAppOverrideId: input.oauthAppOverrideId,
      createdByUserId: input.createdByUserId,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
      revokedAt: undefined,
    };
    this.userConnections.set(record.id, record);

    return record;
  }

  async getUserConnectionById(connectionId: string) {
    return this.userConnections.get(connectionId);
  }

  async listUserConnectionsByUser(userId: string, opts?: { provider?: string }) {
    return Array.from(this.userConnections.values())
      .filter((row) => row.userId === userId && (!opts?.provider || row.provider === opts.provider))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async markUserConnectionStatus(input: {
    id: string;
    status: UserConnectionStatus;
    revokedAt?: Date;
    clearTokens?: boolean;
  }) {
    const existing = this.userConnections.get(input.id);

    if (!existing) {
      return undefined;
    }

    const updated: UserConnectionRecord = {
      ...existing,
      status: input.status,
      revokedAt: input.revokedAt?.toISOString(),
      updatedAt: now(),

      /*
       * Mirror prisma-store's markUserConnectionStatus: on revoke the caller
       * passes clearTokens to destroy the stored credentials so a revoked /
       * needs_reconnect row no longer carries usable, decryptable secrets.
       */
      ...(input.clearTokens
        ? { accessTokenEncrypted: undefined, refreshTokenEncrypted: undefined, apiKeyFieldsEncrypted: undefined }
        : {}),
    };
    this.userConnections.set(updated.id, updated);

    return updated;
  }

  private projectConnectionLinkKey(projectId: string, userConnectionId: string) {
    return `${projectId}:${userConnectionId}`;
  }

  async linkProjectToUserConnection(input: { projectId: string; userConnectionId: string; linkedByUserId: string }) {
    const key = this.projectConnectionLinkKey(input.projectId, input.userConnectionId);

    const existing = Array.from(this.projectConnectionLinks.values()).find(
      (row) => this.projectConnectionLinkKey(row.projectId, row.userConnectionId) === key,
    );
    const link: ProjectConnectionLinkRecord = {
      id: existing?.id ?? id('plink'),
      projectId: input.projectId,
      userConnectionId: input.userConnectionId,
      linkedByUserId: input.linkedByUserId,
      linkedAt: existing?.linkedAt ?? now(),
      unlinkedAt: undefined,
    };
    this.projectConnectionLinks.set(link.id, link);

    return link;
  }

  async unlinkProjectFromUserConnection(input: { projectId: string; userConnectionId: string }) {
    const key = this.projectConnectionLinkKey(input.projectId, input.userConnectionId);

    const existing = Array.from(this.projectConnectionLinks.values()).find(
      (row) => this.projectConnectionLinkKey(row.projectId, row.userConnectionId) === key,
    );

    if (!existing) {
      return undefined;
    }

    const updated: ProjectConnectionLinkRecord = { ...existing, unlinkedAt: now() };
    this.projectConnectionLinks.set(existing.id, updated);

    return updated;
  }

  async listProjectConnectionLinks(projectId: string, opts?: { includeUnlinked?: boolean }) {
    return Array.from(this.projectConnectionLinks.values()).filter(
      (row) => row.projectId === projectId && (opts?.includeUnlinked || !row.unlinkedAt),
    );
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
    const notification: NotificationRecord = {
      id: id('notif'),
      userId: input.userId,
      category: input.category ?? 'system',
      title: input.title,
      body: input.body,
      messageKey: input.messageKey,
      messageParams: input.messageParams,
      linkUrl: input.linkUrl,
      metadata: input.metadata,
      readAt: undefined,
      createdAt: now(),
    };
    this.notifications.set(notification.id, notification);

    return notification;
  }

  async listNotificationsByUser(input: { userId: string; limit?: number }) {
    return (
      Array.from(this.notifications.values())
        .filter((notification) => notification.userId === input.userId)
        // Unread first, then newest — matches the prisma-store ordering.
        .sort((a, b) => {
          const aRead = a.readAt ? 1 : 0;
          const bRead = b.readAt ? 1 : 0;

          if (aRead !== bRead) {
            return aRead - bRead;
          }

          return b.createdAt.localeCompare(a.createdAt);
        })
        .slice(0, Math.min(Math.max(input.limit ?? 50, 1), 200))
    );
  }

  async countUnreadNotificationsByUser(userId: string) {
    return Array.from(this.notifications.values()).filter(
      (notification) => notification.userId === userId && !notification.readAt,
    ).length;
  }

  async getNotificationById(idValue: string) {
    return this.notifications.get(idValue);
  }

  async markNotificationRead(input: { id: string; readAt?: Date }) {
    const existing = this.notifications.get(input.id);

    if (!existing) {
      return undefined;
    }

    const updated: NotificationRecord = {
      ...existing,
      readAt: (existing.readAt ? new Date(existing.readAt) : (input.readAt ?? new Date())).toISOString(),
    };
    this.notifications.set(updated.id, updated);

    return updated;
  }

  async markAllNotificationsRead(input: { userId: string; readAt?: Date }) {
    const readAt = (input.readAt ?? new Date()).toISOString();

    let count = 0;

    for (const notification of this.notifications.values()) {
      if (notification.userId === input.userId && !notification.readAt) {
        this.notifications.set(notification.id, { ...notification, readAt });
        count += 1;
      }
    }

    return count;
  }

  /**
   * Test helper mirroring how the worker token-health sweep / connector-proxy
   * create ReconnectionAlert rows (there is no store interface method — the
   * platform only ever reads and resolves them from the user-facing surface).
   */
  seedReconnectionAlert(input: {
    userConnectionId: string;
    reason: string;
    detectedAt?: Date;
    resolvedAt?: Date;
    notifiedAt?: Date;
  }): ReconnectionAlertRecord {
    const connection = this.userConnections.get(input.userConnectionId);

    const alert: ReconnectionAlertRecord = {
      id: id('recon'),
      userConnectionId: input.userConnectionId,
      reason: input.reason,
      detectedAt: input.detectedAt ? input.detectedAt.toISOString() : now(),
      resolvedAt: input.resolvedAt?.toISOString(),
      notifiedAt: input.notifiedAt?.toISOString(),
      provider: connection?.provider ?? '',
      externalAccountLabel: connection?.externalAccountLabel ?? '',
    };
    this.reconnectionAlerts.set(alert.id, alert);

    return alert;
  }

  async listUnresolvedReconnectionAlertsByUser(userId: string) {
    return Array.from(this.reconnectionAlerts.values())
      .filter((alert) => {
        if (alert.resolvedAt) {
          return false;
        }

        return this.userConnections.get(alert.userConnectionId)?.userId === userId;
      })
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  }

  async getReconnectionAlertById(idValue: string) {
    return this.reconnectionAlerts.get(idValue);
  }

  async resolveReconnectionAlert(input: { id: string; resolvedAt?: Date }) {
    const existing = this.reconnectionAlerts.get(input.id);

    if (!existing) {
      return undefined;
    }

    const updated: ReconnectionAlertRecord = {
      ...existing,
      resolvedAt: (input.resolvedAt ?? new Date()).toISOString(),
    };
    this.reconnectionAlerts.set(updated.id, updated);

    return updated;
  }

  async createAiConversation(
    input:
      | { projectId: string; expectedOrganizationId: string; userId: string; title?: string }
      | { projectId?: undefined; expectedOrganizationId?: undefined; userId: string; title?: string },
  ) {
    const create = async () => {
      const conversation: AiConversationRecord = {
        id: id('ai_conv'),
        projectId: input.projectId,
        userId: input.userId,
        title: input.title,
        createdAt: now(),
      };
      this.aiConversations.set(conversation.id, conversation);

      return conversation;
    };

    return input.projectId
      ? this.withProjectTenantMutation(
          { projectId: input.projectId, expectedOrganizationId: input.expectedOrganizationId },
          create,
        )
      : create();
  }

  async getAiConversation(idValue: string) {
    return this.aiConversations.get(idValue);
  }

  async listAiConversations(input: { projectId: string; userId: string; limit?: number }) {
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);

    return Array.from(this.aiConversations.values())
      .filter((conversation) => conversation.projectId === input.projectId && conversation.userId === input.userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async createAiMessage(input: {
    id?: string;
    conversationId: string;
    role: AiMessageRecord['role'];
    content: string;
  }) {
    const existing = input.id ? this.aiMessages.get(input.id) : undefined;

    if (existing) {
      const message: AiMessageRecord = {
        ...existing,
        role: input.role,
        content: input.content,
      };
      this.aiMessages.set(message.id, message);

      return message;
    }

    const { id: requestedId, ...messageInput } = input;
    const message: AiMessageRecord = { id: requestedId ?? id('ai_msg'), ...messageInput, createdAt: now() };
    this.aiMessages.set(message.id, message);

    return message;
  }

  async listAiMessages(conversationId: string) {
    return [...this.aiMessages.values()].filter((message) => message.conversationId === conversationId);
  }

  async createAiToolCall(input: { messageId: string; name: string; input?: unknown; output?: unknown }) {
    const toolCall: AiToolCallRecord = { id: id('ai_tool'), ...input, createdAt: now() };
    this.aiToolCalls.set(toolCall.id, toolCall);

    return toolCall;
  }

  async listAiToolCallsByMessageIds(messageIds: string[]) {
    const ids = new Set(messageIds);
    return [...this.aiToolCalls.values()].filter((toolCall) => ids.has(toolCall.messageId));
  }

  async createAiTokenUsage(input: {
    messageId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
  }) {
    const usage: AiTokenUsageRecord = { id: id('ai_usage'), ...input, createdAt: now() };
    this.aiTokenUsages.set(usage.id, usage);

    return usage;
  }

  async createProviderRequestMetric(input: {
    provider: string;
    model?: string | null;
    latencyMs: number;
    errored: boolean;
    statusCode?: number | null;
    source?: string | null;
  }) {
    this.providerRequestMetrics.push({
      provider: input.provider,
      model: input.model ?? null,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      errored: input.errored,
      statusCode: input.statusCode ?? null,
      source: input.source ?? null,
      createdAt: now(),
    });
  }

  async listProviderRequestMetricsSince(since: Date, limit = 50_000) {
    return this.providerRequestMetrics
      .filter((row) => new Date(row.createdAt).getTime() >= since.getTime())
      .slice(-limit)
      .map((row) => ({ provider: row.provider, latencyMs: row.latencyMs, errored: row.errored }));
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
    const cost: AiCostLedgerRecord = { id: id('ai_cost'), ...input, createdAt: now() };
    this.aiCostLedger.set(cost.id, cost);

    return cost;
  }

  async listAiCosts(organizationId: string, range?: { from?: string; to?: string }) {
    const fromMs = range?.from ? new Date(range.from).getTime() : undefined;
    const toMs = range?.to ? new Date(range.to).getTime() : undefined;

    return [...this.aiCostLedger.values()].filter((cost) => {
      if (cost.organizationId !== organizationId) {
        return false;
      }

      const created = new Date(cost.createdAt).getTime();

      if (fromMs !== undefined && created < fromMs) {
        return false;
      }

      if (toMs !== undefined && created > toMs) {
        return false;
      }

      return true;
    });
  }

  // --- Replit-parity: credit wallet ------------------------------------------

  async getCreditWallet(organizationId: string) {
    return this.creditWallets.get(organizationId);
  }

  async ensureCreditWallet(organizationId: string) {
    let wallet = this.creditWallets.get(organizationId);

    if (!wallet) {
      const ts = now();
      wallet = {
        id: id('wallet'),
        organizationId,
        balanceCents: 0,
        currency: 'usd',
        createdAt: ts,
        updatedAt: ts,
      };
      this.creditWallets.set(organizationId, wallet);
    }

    return wallet;
  }

  async updateCreditWalletSettings(input: {
    organizationId: string;
    budgetCapCents?: number | null;
    serviceShutdownCents?: number | null;
    autoTopupCents?: number | null;
  }) {
    const wallet = await this.ensureCreditWallet(input.organizationId);

    if (input.budgetCapCents !== undefined) {
      wallet.budgetCapCents = input.budgetCapCents ?? undefined;
    }

    if (input.serviceShutdownCents !== undefined) {
      wallet.serviceShutdownCents = input.serviceShutdownCents ?? undefined;
    }

    if (input.autoTopupCents !== undefined) {
      wallet.autoTopupCents = input.autoTopupCents ?? undefined;
    }

    wallet.updatedAt = now();

    return wallet;
  }

  async createCreditPack(input: {
    organizationId: string;
    purchasedCents: number;
    expiresAt: Date;
    stripePaymentIntentId?: string;
  }) {
    const pack: CreditPackRecord = {
      id: id('pack'),
      organizationId: input.organizationId,
      purchasedCents: input.purchasedCents,
      remainingCents: input.purchasedCents,
      expiresAt: input.expiresAt.toISOString(),
      stripePaymentIntentId: input.stripePaymentIntentId,
      createdAt: now(),
    };
    this.creditPacks.set(pack.id, pack);

    return pack;
  }

  async listCreditPacks(organizationId: string, options?: { activeOnly?: boolean }) {
    const nowMs = Date.now();
    return [...this.creditPacks.values()]
      .filter((p) => p.organizationId === organizationId)
      .filter((p) => !options?.activeOnly || (p.remainingCents > 0 && new Date(p.expiresAt).getTime() > nowMs))
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  }

  async decrementCreditPack(input: { id: string; cents: number }) {
    const pack = this.creditPacks.get(input.id);

    if (!pack) {
      throw new Error(`credit pack ${input.id} not found`);
    }

    // Mirror the store: clamp at 0 so remainingCents never goes negative.
    pack.remainingCents = Math.max(0, pack.remainingCents - Math.max(0, Math.ceil(input.cents)));

    return pack;
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
    const wallet = await this.ensureCreditWallet(input.organizationId);

    const entry: CreditLedgerRecord = {
      id: id('credit'),
      walletId: wallet.id,
      organizationId: input.organizationId,
      deltaCents: input.deltaCents,
      kind: input.kind,
      reason: input.reason,
      checkpointId: input.checkpointId,
      expiresAt: input.expiresAt ? input.expiresAt.toISOString() : undefined,
      metadata: input.metadata,
      createdAt: now(),
    };
    this.creditLedger.set(entry.id, entry);
    wallet.balanceCents += input.deltaCents;
    wallet.updatedAt = now();

    return { entry, balanceCents: wallet.balanceCents };
  }

  async listCreditLedger(organizationId: string, options?: { take?: number }) {
    return [...this.creditLedger.values()]
      .filter((e) => e.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, options?.take ?? 100);
  }

  async sumPaygSpendSince(organizationId: string, sinceMs: number): Promise<number> {
    let total = 0;

    for (const entry of this.creditLedger.values()) {
      if (
        entry.organizationId === organizationId &&
        entry.kind === 'PAYG_CHARGE' &&
        new Date(entry.createdAt).getTime() >= sinceMs
      ) {
        total += Math.abs(entry.deltaCents);
      }
    }

    return total;
  }

  async getUserSpendLimit(organizationId: string, userId: string) {
    return this.userSpendLimits.get(`${organizationId}:${userId}`);
  }

  async setUserSpendLimit(input: { organizationId: string; userId: string; limitCents: number }) {
    const key = `${input.organizationId}:${input.userId}`;
    const existing = this.userSpendLimits.get(key);

    const record: UserSpendLimitRecord = {
      id: existing?.id ?? id('usl'),
      organizationId: input.organizationId,
      userId: input.userId,
      limitCents: input.limitCents,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    };
    this.userSpendLimits.set(key, record);

    return record;
  }

  async clearUserSpendLimit(organizationId: string, userId: string) {
    this.userSpendLimits.delete(`${organizationId}:${userId}`);
  }

  async listUserSpendLimits(organizationId: string) {
    return [...this.userSpendLimits.values()].filter((r) => r.organizationId === organizationId);
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
    return this.withSerializedMutation(`ledger-user-spend:${input.organizationId}:${input.userId}`, async () => {
      this._assertAccountPurgeMutationAllowed({
        userIds: [input.userId],
        organizationIds: [input.organizationId],
        projectIds: [input.projectId],
      });
      const existing = [...this.canonicalUserSpendReservations.values()].find(
        (reservation) =>
          reservation.organizationId === input.organizationId && reservation.idempotencyKey === input.idempotencyKey,
      );
      if (existing) {
        if (
          existing.userId !== input.userId ||
          existing.requestHash !== input.requestHash ||
          existing.maxAmountCents !== input.maxAmountCents ||
          existing.periodStart !== (input.periodStart ?? '')
        ) {
          throw Object.assign(new Error(), { code: 'LEDGER_IDEMPOTENCY_CONFLICT' });
        }
        const nowMs = this.databaseClockNowMs ?? Date.now();
        if (existing.status === 'ACTIVE' && Date.parse(existing.expiresAt) <= nowMs) {
          existing.expiresAt = new Date(nowMs + input.expiresInMs).toISOString();
        }
        if (
          existing.status === 'EXPIRED' &&
          !existing.startedAt &&
          !existing.batchRequestHash &&
          !(existing.platformIntentStartedAt && !existing.platformAiCostLedgerId)
        ) {
          const limit = input.enforceUserSpendLimit
            ? this.userSpendLimits.get(`${input.organizationId}:${input.userId}`)
            : undefined;
          const claimed = [...this.canonicalUserSpendReservations.values()]
            .filter(
              (reservation) =>
                reservation.id !== existing.id &&
                reservation.organizationId === input.organizationId &&
                reservation.userId === input.userId &&
                reservation.periodStart === (input.periodStart ?? '') &&
                (reservation.status === 'ACTIVE' || reservation.status === 'COMMITTED'),
            )
            .reduce(
              (sum, reservation) =>
                sum +
                (reservation.status === 'COMMITTED' ? (reservation.committedCents ?? 0) : reservation.maxAmountCents),
              0,
            );
          if (limit && claimed + existing.maxAmountCents > limit.limitCents) {
            throw Object.assign(new Error(), { code: 'USER_SPEND_LIMIT_REACHED', statusCode: 429 });
          }
          existing.status = 'ACTIVE';
          existing.expiresAt = new Date(nowMs + input.expiresInMs).toISOString();
        }
        return { id: existing.id, status: existing.status, created: false };
      }

      const limit = input.enforceUserSpendLimit
        ? this.userSpendLimits.get(`${input.organizationId}:${input.userId}`)
        : undefined;
      const claimed = [...this.canonicalUserSpendReservations.values()]
        .filter(
          (reservation) =>
            reservation.organizationId === input.organizationId &&
            reservation.userId === input.userId &&
            reservation.periodStart === (input.periodStart ?? '') &&
            (reservation.status === 'ACTIVE' || reservation.status === 'COMMITTED'),
        )
        .reduce(
          (sum, reservation) =>
            sum + (reservation.status === 'COMMITTED' ? (reservation.committedCents ?? 0) : reservation.maxAmountCents),
          0,
        );
      if (limit && claimed + input.maxAmountCents > limit.limitCents) {
        throw Object.assign(new Error(), { code: 'USER_SPEND_LIMIT_REACHED', statusCode: 429 });
      }

      const reservation = {
        id: id('ledger-reservation'),
        organizationId: input.organizationId,
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        maxAmountCents: input.maxAmountCents,
        expiresAt: new Date((this.databaseClockNowMs ?? Date.now()) + input.expiresInMs).toISOString(),
        periodStart: input.periodStart ?? '',
        status: 'ACTIVE' as const,
      };
      this.canonicalUserSpendReservations.set(reservation.id, reservation);
      return { id: reservation.id, status: reservation.status, created: true };
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
    const reservation = this.canonicalUserSpendReservations.get(input.reservationId);
    if (!reservation || reservation.organizationId !== input.organizationId || reservation.userId !== input.userId) {
      throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_SCOPE_MISMATCH' });
    }
    return this.withSerializedMutation(
      `ledger-user-spend:${reservation.organizationId}:${reservation.userId}`,
      async () => {
        this._assertAccountPurgeMutationAllowed({
          userIds: [input.userId],
          organizationIds: [input.organizationId],
          projectIds: [input.projectId],
        });
        const requestHash = createHash('sha256')
          .update(
            JSON.stringify({
              version: 1,
              reservationId: input.reservationId,
              organizationId: input.organizationId,
              userId: input.userId,
              projectId: input.projectId,
              requestId: input.requestId,
            }),
          )
          .digest('hex');
        const nowMs = this.databaseClockNowMs ?? Date.now();
        if (reservation.startedRequestHash) {
          if (reservation.startedRequestHash !== requestHash || !reservation.claimedAt) {
            throw Object.assign(new Error(), { code: 'LEDGER_AI_START_CONFLICT', statusCode: 409 });
          }
          if (!reservation.executionToken || !reservation.claimOwnerId || !reservation.claimLeaseExpiresAt) {
            throw Object.assign(new Error(), { code: 'LEDGER_AI_START_CORRUPT' });
          }
          const sameTransportAttempt = reservation.claimOwnerId === input.claimOwnerId;
          const providerIrreversible =
            Boolean(reservation.startedAt) ||
            Boolean(reservation.platformIntentStartedAt && !reservation.platformAiCostLedgerId) ||
            Boolean(reservation.batchRequestHash);
          const platformReceipt = reservation.platformAiCostLedgerId
            ? {
                state: reservation.platformRecoveredAtCeiling ? ('recovered' as const) : ('exact' as const),
                ...(reservation.platformOutcome ? { outcome: reservation.platformOutcome } : {}),
              }
            : undefined;
          if (sameTransportAttempt || providerIrreversible || Date.parse(reservation.claimLeaseExpiresAt) > nowMs) {
            return {
              claimedAt: reservation.claimedAt,
              leaseExpiresAt: reservation.claimLeaseExpiresAt,
              executionToken: reservation.executionToken,
              replayed: !sameTransportAttempt,
              reservationStatus: reservation.status,
              ...(platformReceipt ? { platformReceipt } : {}),
            };
          }
          if (reservation.status !== 'ACTIVE') {
            throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_NOT_ACTIVE' });
          }
          reservation.claimOwnerId = input.claimOwnerId;
          reservation.executionToken = randomUUID();
          reservation.claimedAt = new Date(nowMs).toISOString();
          reservation.claimLeaseExpiresAt = new Date(nowMs + input.claimLeaseMs).toISOString();
          return {
            claimedAt: reservation.claimedAt,
            leaseExpiresAt: reservation.claimLeaseExpiresAt,
            executionToken: reservation.executionToken,
            replayed: false,
            reservationStatus: reservation.status,
            ...(platformReceipt ? { platformReceipt } : {}),
          };
        }
        if (reservation.status !== 'ACTIVE') {
          throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_NOT_ACTIVE' });
        }
        const startedAtMs = nowMs;
        reservation.startedRequestHash = requestHash;
        reservation.startedRequestId = input.requestId;
        reservation.startedProjectId = input.projectId;
        reservation.claimedAt = new Date(startedAtMs).toISOString();
        reservation.claimOwnerId = input.claimOwnerId;
        reservation.executionToken = randomUUID();
        reservation.claimLeaseExpiresAt = new Date(startedAtMs + input.claimLeaseMs).toISOString();
        return {
          claimedAt: reservation.claimedAt,
          leaseExpiresAt: reservation.claimLeaseExpiresAt,
          executionToken: reservation.executionToken,
          replayed: false,
          reservationStatus: reservation.status,
        };
      },
    );
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
    const reservation = this.canonicalUserSpendReservations.get(input.reservationId);
    if (!reservation || reservation.organizationId !== input.organizationId || reservation.userId !== input.userId) {
      throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_SCOPE_MISMATCH' });
    }
    return this.withSerializedMutation(
      `ledger-user-spend:${reservation.organizationId}:${reservation.userId}`,
      async () => {
        if (
          reservation.startedRequestId !== input.requestId ||
          reservation.startedProjectId !== input.projectId ||
          !reservation.claimedAt ||
          reservation.executionToken !== input.executionToken
        ) {
          throw Object.assign(new Error(), { code: 'LEDGER_AI_EXECUTION_CLAIM_REQUIRED' });
        }
        if (reservation.startedAt) {
          return { startedAt: reservation.startedAt, replayed: true };
        }
        if (reservation.status !== 'ACTIVE') {
          throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_NOT_ACTIVE' });
        }
        const startedAtMs = this.databaseClockNowMs ?? Date.now();
        reservation.startedAt = new Date(startedAtMs).toISOString();
        reservation.settleAfter = new Date(startedAtMs + input.reconcileAfterMs).toISOString();
        reservation.expiresAt = new Date(
          Math.max(Date.parse(reservation.expiresAt), startedAtMs + input.reconcileAfterMs + 15 * 60_000),
        ).toISOString();
        return { startedAt: reservation.startedAt, replayed: false };
      },
    );
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
    const reservation = this.canonicalUserSpendReservations.get(input.reservationId);
    if (!reservation || reservation.organizationId !== input.organizationId || reservation.userId !== input.userId) {
      throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_SCOPE_MISMATCH' });
    }
    return this.withSerializedMutation(
      `ledger-user-spend:${reservation.organizationId}:${reservation.userId}`,
      async () => {
        if (
          reservation.startedRequestId !== input.requestId ||
          reservation.startedProjectId !== input.projectId ||
          reservation.executionToken !== input.executionToken ||
          !reservation.claimedAt
        ) {
          throw Object.assign(new Error(), { code: 'LEDGER_AI_EXECUTION_CLAIM_REQUIRED' });
        }
        const requestHash = createHash('sha256')
          .update(JSON.stringify({ version: 1, ...input }))
          .digest('hex');
        if (reservation.platformIntentRequestHash) {
          if (reservation.platformIntentRequestHash !== requestHash || !reservation.platformIntentStartedAt) {
            throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_CONFLICT', statusCode: 409 });
          }
          return { startedAt: reservation.platformIntentStartedAt, replayed: true };
        }
        if (reservation.status !== 'ACTIVE') {
          throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_NOT_ACTIVE' });
        }
        const nowMs = this.databaseClockNowMs ?? Date.now();
        reservation.platformIntentRequestHash = requestHash;
        reservation.platformIntentStartedAt = new Date(nowMs).toISOString();
        reservation.platformIntentSettleAfter = new Date(nowMs + input.reconcileAfterMs).toISOString();
        reservation.platformIntentCallId = input.callId;
        reservation.platformIntentProvider = input.provider;
        reservation.platformIntentModel = input.model;
        reservation.platformIntentMaxInputTokens = input.maxInputTokens;
        reservation.platformIntentMaxOutputTokens = input.maxOutputTokens;
        reservation.platformIntentMaxCostCents = input.maxCostCents;
        reservation.platformIntentRouting = input.agentRouting;
        return { startedAt: reservation.platformIntentStartedAt, replayed: false };
      },
    );
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
    const reservation = this.canonicalUserSpendReservations.get(input.reservationId);
    if (
      !reservation ||
      reservation.organizationId !== input.organizationId ||
      reservation.userId !== input.userId ||
      input.call.billedToUser !== false
    ) {
      throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_INVALID' });
    }
    return this.withSerializedMutation(
      `ledger-user-spend:${reservation.organizationId}:${reservation.userId}`,
      async () => {
        if (
          reservation.startedRequestId !== input.requestId ||
          reservation.startedProjectId !== input.projectId ||
          reservation.executionToken !== input.executionToken ||
          !reservation.claimedAt
        ) {
          throw Object.assign(new Error(), { code: 'LEDGER_AI_EXECUTION_CLAIM_REQUIRED' });
        }
        if (
          !reservation.platformIntentRequestHash ||
          reservation.platformIntentCallId !== input.call.callId ||
          reservation.platformIntentProvider !== input.call.provider ||
          reservation.platformIntentModel !== input.call.model ||
          !reservation.platformIntentRouting ||
          reservation.platformIntentRouting.mode !== input.agentRouting.mode ||
          reservation.platformIntentRouting.highEffort !== input.agentRouting.highEffort ||
          reservation.platformIntentRouting.turbo !== input.agentRouting.turbo ||
          reservation.platformIntentRouting.lineKey !== input.agentRouting.lineKey ||
          reservation.platformIntentRouting.routingCardVersion !== input.agentRouting.routingCardVersion ||
          reservation.platformIntentRouting.source !== input.agentRouting.source ||
          input.agentRouting.escalated !== (input.outcome === 'hard') ||
          input.call.inputTokens > (reservation.platformIntentMaxInputTokens ?? -1) ||
          input.call.outputTokens > (reservation.platformIntentMaxOutputTokens ?? -1) ||
          input.call.costCents > (reservation.platformIntentMaxCostCents ?? -1)
        ) {
          throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_START_REQUIRED' });
        }
        const requestHash = createHash('sha256')
          .update(JSON.stringify({ version: 1, ...input }))
          .digest('hex');
        if (reservation.platformUsageRequestHash) {
          if (reservation.platformUsageRequestHash !== requestHash || !reservation.platformAiCostLedgerId) {
            throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_CONFLICT', statusCode: 409 });
          }
          const usage = this.aiCostLedger.get(reservation.platformAiCostLedgerId);
          if (!usage) {
            throw Object.assign(new Error(), { code: 'LEDGER_PLATFORM_USAGE_CORRUPT' });
          }
          return { usage, replayed: true };
        }
        const usage = await this.recordAiCost({
          organizationId: input.organizationId,
          projectId: input.projectId,
          conversationId: input.call.conversationId,
          messageId: input.call.messageId,
          provider: input.call.provider,
          model: input.call.model,
          inputTokens: input.call.inputTokens,
          outputTokens: input.call.outputTokens,
          costCents: input.call.costCents,
          reason: `${input.call.reason}.platform.${input.call.kind}.${input.call.callId}`,
        });
        reservation.platformUsageRequestHash = requestHash;
        reservation.platformAiCostLedgerId = usage.id;
        reservation.platformOutcome = input.outcome;
        const agentCallLogId = `canonical-classifier-${reservation.platformIntentRequestHash}`;
        const agentCostMillicents = canonicalClassifierCostMillicents(
          reservation.platformIntentRouting,
          input.call.inputTokens,
          input.call.outputTokens,
        );
        this.agentCalls.push({
          id: agentCallLogId,
          createdAt: now(),
          userId: input.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          mode: input.agentRouting.mode,
          highEffort: input.agentRouting.highEffort,
          escalated: input.outcome === 'hard',
          turbo: input.agentRouting.turbo,
          lineKey: 'classifier',
          provider: input.call.provider,
          model: input.call.model,
          tokensIn: input.call.inputTokens,
          tokensOut: input.call.outputTokens,
          costMillicents: agentCostMillicents,
          creditCents: 0,
          marginMillicents: -agentCostMillicents,
          billedToUser: false,
          routingCardVersion: input.agentRouting.routingCardVersion,
          source: input.agentRouting.source,
        });
        reservation.platformAgentCallLogId = agentCallLogId;
        return { usage, replayed: false };
      },
    );
  }

  async commitCanonicalUserSpendBatch(input: CanonicalAiUsageBatchInput) {
    const reservation = this.canonicalUserSpendReservations.get(input.reservationId);
    if (
      !reservation ||
      reservation.organizationId !== input.organizationId ||
      reservation.userId !== input.userId ||
      reservation.executionToken !== input.executionToken
    ) {
      throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_SCOPE_MISMATCH' });
    }
    return this.withSerializedMutation(
      `ledger-user-spend:${reservation.organizationId}:${reservation.userId}`,
      async () => {
        this._assertAccountPurgeMutationAllowed({
          userIds: [input.userId],
          organizationIds: [input.organizationId],
          projectIds: [input.projectId],
        });
        if (
          reservation.startedRequestId !== input.requestId ||
          reservation.startedProjectId !== input.projectId ||
          !reservation.startedAt
        ) {
          throw Object.assign(new Error(), { code: 'LEDGER_AI_START_REQUIRED' });
        }
        if (
          input.calls.length < 1 ||
          input.calls.length > 32 ||
          new Set(input.calls.map((call) => call.callId)).size !== input.calls.length
        ) {
          throw Object.assign(new Error(), { code: 'LEDGER_COMMIT_AMOUNT_INVALID' });
        }
        const requestHash = createHash('sha256')
          .update(
            JSON.stringify({
              version: 1,
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
        let usages = reservation.aiCostLedgerIds?.map((costId) => this.aiCostLedger.get(costId));
        if (reservation.batchRequestHash) {
          if (
            reservation.batchRequestHash !== requestHash ||
            !usages ||
            usages.length !== input.calls.length ||
            usages.some((usage) => !usage)
          ) {
            throw Object.assign(new Error(), { code: 'LEDGER_COMMIT_CONFLICT', statusCode: 409 });
          }
        } else {
          usages = [];
          for (const call of input.calls) {
            usages.push(
              await this.recordAiCost({
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
              }),
            );
          }
          const inputTokens = input.calls.reduce(
            (sum, call) => sum + (call.billedToUser === false ? 0 : call.inputTokens),
            0,
          );
          const outputTokens = input.calls.reduce(
            (sum, call) => sum + (call.billedToUser === false ? 0 : call.outputTokens),
            0,
          );
          await this.recordUsageEvent({
            organizationId: input.organizationId,
            userId: input.userId,
            type: 'ai.messages',
            quantity: 1,
            metadata: { canonicalReservationId: input.reservationId, requestHash },
          });
          await this.recordUsageEvent({
            organizationId: input.organizationId,
            userId: input.userId,
            type: 'ai.inputTokens',
            quantity: inputTokens,
            metadata: { canonicalReservationId: input.reservationId, requestHash },
          });
          await this.recordUsageEvent({
            organizationId: input.organizationId,
            userId: input.userId,
            type: 'ai.outputTokens',
            quantity: outputTokens,
            metadata: { canonicalReservationId: input.reservationId, requestHash },
          });
          reservation.batchRequestHash = requestHash;
          reservation.batchBilledCents = input.calls.reduce(
            (sum, call) => sum + (call.billedToUser === false ? 0 : call.costCents),
            0,
          );
          reservation.aiCostLedgerIds = usages.map((usage) => usage!.id);
        }
        if (this.failCanonicalUserSpendCommits) {
          throw Object.assign(new Error(), { code: 'LEDGER_SETTLEMENT_INJECTED_FAILURE' });
        }
        const totalCents = input.calls.reduce(
          (sum, call) => sum + (call.billedToUser === false ? 0 : call.costCents),
          0,
        );
        if (!Number.isSafeInteger(totalCents) || totalCents > reservation.maxAmountCents) {
          throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_OVERAGE' });
        }
        if (reservation.status === 'COMMITTED') {
          if (reservation.committedCents !== totalCents) {
            throw Object.assign(new Error(), { code: 'LEDGER_COMMIT_CONFLICT' });
          }
          return { committedCents: totalCents, replayed: true, usages: usages as AiCostLedgerRecord[] };
        }
        if (reservation.status !== 'ACTIVE') {
          throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_NOT_ACTIVE' });
        }
        reservation.status = 'COMMITTED';
        reservation.committedCents = totalCents;
        return { committedCents: totalCents, replayed: false, usages: usages as AiCostLedgerRecord[] };
      },
    );
  }

  async reconcileCanonicalUserSpend(options: { take?: number } = {}) {
    const take = Math.max(1, Math.min(options.take ?? 100, 500));
    const databaseNowMs = this.databaseClockNowMs ?? Date.now();
    const candidates = [...this.canonicalUserSpendReservations.values()]
      .filter((reservation) => {
        const platformSettleAfterRaw = reservation.platformIntentSettleAfter ?? '';
        const platformSettleAfter = Date.parse(platformSettleAfterRaw);
        const platformDeadlineCanonical =
          Number.isFinite(platformSettleAfter) &&
          new Date(platformSettleAfter).toISOString() === platformSettleAfterRaw;
        const executionSettleAfterRaw = reservation.settleAfter ?? '';
        const executionSettleAfter = Date.parse(executionSettleAfterRaw);
        const executionDeadlineCanonical =
          Number.isFinite(executionSettleAfter) &&
          new Date(executionSettleAfter).toISOString() === executionSettleAfterRaw;
        const reconcileNextRetryAtRaw = reservation.reconcileNextRetryAt ?? '';
        const reconcileNextRetryAt = Date.parse(reconcileNextRetryAtRaw);
        const retryDeadlineCanonical =
          Number.isFinite(reconcileNextRetryAt) &&
          new Date(reconcileNextRetryAt).toISOString() === reconcileNextRetryAtRaw;
        const platformDue =
          Boolean(reservation.platformIntentStartedAt) &&
          !reservation.platformAiCostLedgerId &&
          (!platformDeadlineCanonical || platformSettleAfter <= databaseNowMs);
        const executionDue =
          Boolean(reservation.startedAt) &&
          (Boolean(reservation.batchRequestHash) ||
            !executionDeadlineCanonical ||
            executionSettleAfter <= databaseNowMs);

        return (
          !reservation.manualRecoveryAt &&
          (!reservation.reconcileNextRetryAt || !retryDeadlineCanonical || reconcileNextRetryAt <= databaseNowMs) &&
          (reservation.status === 'COMMITTED'
            ? platformDue
            : (reservation.status === 'ACTIVE' || reservation.status === 'EXPIRED') && (platformDue || executionDue))
        );
      })
      .slice(0, take);
    let settled = 0;
    let recoveredAtCeiling = 0;
    let recoveredPlatformAtCeiling = 0;
    let manualRecovery = 0;
    let retryableFailures = 0;
    const reservationIds: string[] = [];

    for (const reservation of candidates) {
      await this.withSerializedMutation(
        `ledger-user-spend:${reservation.organizationId}:${reservation.userId}`,
        async () => {
          const quarantine = (reason: string) => {
            reservation.manualRecoveryAt = new Date(databaseNowMs).toISOString();
            reservation.manualRecoveryReason = reason;
            manualRecovery += 1;
          };

          if (reservation.reconcileNextRetryAt) {
            const retryAtMs = Date.parse(reservation.reconcileNextRetryAt);

            if (!Number.isFinite(retryAtMs) || new Date(retryAtMs).toISOString() !== reservation.reconcileNextRetryAt) {
              quarantine('CANONICAL_AI_RETRY_DEADLINE_CORRUPT');
              return;
            }
            if (retryAtMs > databaseNowMs) {
              return;
            }
          }

          if (this.failCanonicalReconciliationOnce) {
            this.failCanonicalReconciliationOnce = false;
            const attempts = Math.min((reservation.reconcileFailureAttempts ?? 0) + 1, 16);
            reservation.reconcileFailureAttempts = attempts;
            reservation.reconcileFailureReason = 'LEDGER_SETTLEMENT_INJECTED_FAILURE';
            reservation.reconcileLastAttemptAt = new Date(databaseNowMs).toISOString();
            reservation.reconcileNextRetryAt = new Date(
              databaseNowMs + Math.min(5 * 60_000, 5_000 * 2 ** Math.min(attempts - 1, 6)),
            ).toISOString();
            retryableFailures += 1;
            return;
          }

          if (!reservation.startedProjectId || !reservation.startedRequestId) {
            quarantine('CANONICAL_AI_EXECUTION_CORRUPT');
            return;
          }
          this._assertAccountPurgeMutationAllowed({
            userIds: [reservation.userId],
            organizationIds: [reservation.organizationId],
            projectIds: [reservation.startedProjectId],
          });
          if (reservation.platformIntentStartedAt && !reservation.platformAiCostLedgerId) {
            const platformSettleAfterRaw = reservation.platformIntentSettleAfter ?? '';
            const platformSettleAfter = Date.parse(platformSettleAfterRaw);

            if (
              !Number.isFinite(platformSettleAfter) ||
              new Date(platformSettleAfter).toISOString() !== platformSettleAfterRaw
            ) {
              quarantine('CANONICAL_AI_PLATFORM_SETTLE_AFTER_CORRUPT');
              return;
            }
            if (platformSettleAfter > databaseNowMs) {
              return;
            }
            if (
              !reservation.platformIntentCallId ||
              !reservation.platformIntentProvider ||
              !reservation.platformIntentModel ||
              reservation.platformIntentMaxInputTokens === undefined ||
              reservation.platformIntentMaxOutputTokens === undefined ||
              reservation.platformIntentMaxCostCents === undefined ||
              !reservation.platformIntentRouting
            ) {
              quarantine('CANONICAL_AI_PLATFORM_INTENT_CORRUPT');
              return;
            }
            const platformCost = await this.recordAiCost({
              organizationId: reservation.organizationId,
              projectId: reservation.startedProjectId,
              provider: reservation.platformIntentProvider,
              model: reservation.platformIntentModel,
              inputTokens: reservation.platformIntentMaxInputTokens,
              outputTokens: reservation.platformIntentMaxOutputTokens,
              costCents: reservation.platformIntentMaxCostCents,
              reason: `chat.completion.operator.classifier.${reservation.platformIntentCallId}.crash-recovery-max`,
            });
            reservation.platformAiCostLedgerId = platformCost.id;
            const agentCallLogId = `canonical-classifier-${reservation.platformIntentRequestHash}`;
            const agentCostMillicents = canonicalClassifierCostMillicents(
              reservation.platformIntentRouting,
              reservation.platformIntentMaxInputTokens,
              reservation.platformIntentMaxOutputTokens,
            );
            this.agentCalls.push({
              id: agentCallLogId,
              createdAt: now(),
              userId: reservation.userId,
              organizationId: reservation.organizationId,
              projectId: reservation.startedProjectId,
              mode: reservation.platformIntentRouting.mode,
              highEffort: reservation.platformIntentRouting.highEffort,
              escalated: true,
              turbo: reservation.platformIntentRouting.turbo,
              lineKey: 'classifier',
              provider: reservation.platformIntentProvider,
              model: reservation.platformIntentModel,
              tokensIn: reservation.platformIntentMaxInputTokens,
              tokensOut: reservation.platformIntentMaxOutputTokens,
              costMillicents: agentCostMillicents,
              creditCents: 0,
              marginMillicents: -agentCostMillicents,
              billedToUser: false,
              routingCardVersion: reservation.platformIntentRouting.routingCardVersion,
              source: `${reservation.platformIntentRouting.source}.crash-recovery-max`,
            });
            reservation.platformAgentCallLogId = agentCallLogId;
            reservation.platformUsageRequestHash = reservation.platformIntentRequestHash;
            reservation.platformRecoveredAtCeiling = true;
            recoveredPlatformAtCeiling += 1;
            if (!reservation.startedAt) {
              reservationIds.push(reservation.id);
              return;
            }
          }
          if (!reservation.startedAt) {
            return;
          }
          if (reservation.status === 'COMMITTED') {
            return;
          }
          const executionSettleAfterRaw = reservation.settleAfter ?? '';
          const executionSettleAfter = Date.parse(executionSettleAfterRaw);

          if (
            !reservation.batchRequestHash &&
            (!Number.isFinite(executionSettleAfter) ||
              new Date(executionSettleAfter).toISOString() !== executionSettleAfterRaw)
          ) {
            quarantine('CANONICAL_AI_SETTLE_AFTER_CORRUPT');
            return;
          }
          if (!reservation.batchRequestHash && executionSettleAfter > databaseNowMs) {
            return;
          }
          if (reservation.status !== 'ACTIVE' && reservation.status !== 'EXPIRED') {
            quarantine('CANONICAL_AI_RESERVATION_STATUS_INVALID');
            return;
          }
          if (reservation.status === 'EXPIRED') {
            reservation.status = 'ACTIVE';
            reservation.expiresAt = new Date(databaseNowMs + 15 * 60_000).toISOString();
          }
          let totalCents: number;
          if (reservation.aiCostLedgerIds?.length) {
            const costs = reservation.aiCostLedgerIds.map((costId) => this.aiCostLedger.get(costId));
            if (costs.some((cost) => !cost)) {
              quarantine('CANONICAL_AI_USAGE_RECEIPT_CORRUPT');
              return;
            }
            totalCents = reservation.batchBilledCents ?? costs.reduce((sum, cost) => sum + cost!.costCents, 0);
          } else {
            totalCents = reservation.maxAmountCents;
            const cost = await this.recordAiCost({
              organizationId: reservation.organizationId,
              projectId: reservation.startedProjectId,
              provider: 'unknown',
              model: 'crash-recovery',
              inputTokens: 0,
              outputTokens: 0,
              costCents: totalCents,
              reason: 'chat.completion.crash-recovery-max',
            });
            reservation.aiCostLedgerIds = [cost.id];
            reservation.batchRequestHash = createHash('sha256')
              .update(`canonical-ai-crash-recovery:${reservation.id}:${reservation.startedRequestId}:${totalCents}`)
              .digest('hex');
            reservation.recoveredAtCeiling = true;
            await this.recordUsageEvent({
              organizationId: reservation.organizationId,
              userId: reservation.userId,
              type: 'ai.messages',
              quantity: 1,
              metadata: { canonicalReservationId: reservation.id, recoveredAtCeiling: true },
            });
            recoveredAtCeiling += 1;
          }
          if (totalCents > reservation.maxAmountCents) {
            quarantine('CANONICAL_AI_RESERVATION_AMOUNT_CORRUPT');
            return;
          }
          reservation.status = 'COMMITTED';
          reservation.committedCents = totalCents;
          reservation.reconcileFailureAttempts = undefined;
          reservation.reconcileFailureReason = undefined;
          reservation.reconcileLastAttemptAt = undefined;
          reservation.reconcileNextRetryAt = undefined;
          settled += 1;
          reservationIds.push(reservation.id);
        },
      );
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
    const reservation = this.canonicalUserSpendReservations.get(input.reservationId);
    if (!reservation || reservation.organizationId !== input.organizationId || reservation.userId !== input.userId) {
      throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_NOT_FOUND' });
    }
    return this.withSerializedMutation(
      `ledger-user-spend:${reservation.organizationId}:${reservation.userId}`,
      async () => {
        this._assertAccountPurgeMutationAllowed({
          userIds: [input.userId],
          organizationIds: [input.organizationId],
          projectIds: [input.usage.projectId],
        });
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
        let usage = reservation.aiCostLedgerId ? this.aiCostLedger.get(reservation.aiCostLedgerId) : undefined;
        if (reservation.usageRequestHash) {
          if (reservation.usageRequestHash !== usageRequestHash || !usage) {
            throw Object.assign(new Error(), { code: 'LEDGER_COMMIT_CONFLICT' });
          }
        } else {
          usage = await this.recordAiCost({ organizationId: input.organizationId, ...input.usage });
          reservation.usageRequestHash = usageRequestHash;
          reservation.aiCostLedgerId = usage.id;
        }

        if (this.failCanonicalUserSpendCommits) {
          throw Object.assign(new Error(), { code: 'LEDGER_SETTLEMENT_INJECTED_FAILURE' });
        }
        if (input.actualAmountCents === undefined) {
          throw Object.assign(new Error(), { code: 'LEDGER_USAGE_UNPRICED' });
        }
        if (reservation.status === 'COMMITTED') {
          if (reservation.committedCents !== input.actualAmountCents) {
            throw Object.assign(new Error(), { code: 'LEDGER_COMMIT_CONFLICT' });
          }
          return { committedCents: reservation.committedCents, replayed: true, usage: usage! };
        }
        if (reservation.status !== 'ACTIVE' || input.actualAmountCents > reservation.maxAmountCents) {
          throw Object.assign(new Error(), { code: 'LEDGER_RESERVATION_OVERAGE' });
        }
        reservation.status = 'COMMITTED';
        reservation.committedCents = input.actualAmountCents;
        return { committedCents: input.actualAmountCents, replayed: false, usage: usage! };
      },
    );
  }

  async releaseCanonicalUserSpend(reservationId: string) {
    const reservation = this.canonicalUserSpendReservations.get(reservationId);
    if (!reservation || reservation.status !== 'ACTIVE') {
      return { released: false };
    }
    reservation.status = 'RELEASED';
    return { released: true };
  }

  async reapExpiredLedgerReservations() {
    const databaseNowMs = this.databaseClockNowMs ?? Date.now();
    const reaped: string[] = [];
    for (const reservation of this.canonicalUserSpendReservations.values()) {
      if (
        reservation.status === 'ACTIVE' &&
        Date.parse(reservation.expiresAt) <= databaseNowMs &&
        !reservation.startedAt &&
        !reservation.batchRequestHash &&
        !(reservation.platformIntentStartedAt && !reservation.platformAiCostLedgerId)
      ) {
        reservation.status = 'EXPIRED';
        reaped.push(reservation.id);
      }
    }
    return reaped.slice(0, 100);
  }

  async sumUserSpendSince(organizationId: string, userId: string, sinceMs: number): Promise<number> {
    let total = 0;

    for (const cp of this.agentCheckpoints.values()) {
      if (cp.organizationId === organizationId && cp.userId === userId && new Date(cp.startedAt).getTime() >= sinceMs) {
        total += Math.max(0, cp.creditCents ?? 0);
      }
    }

    return total;
  }

  async recordPaygCharge(input: { organizationId: string; checkpointId: string; cents: number }): Promise<void> {
    const cents = Math.max(0, Math.ceil(input.cents));

    if (cents <= 0) {
      return;
    }

    /*
     * Tracking-only: writes a PAYG_CHARGE ledger row WITHOUT touching balanceCents
     * (mirrors the store), deduped by checkpointId.
     */
    const wallet = await this.ensureCreditWallet(input.organizationId);

    const existing = [...this.creditLedger.values()].find(
      (e) =>
        e.organizationId === input.organizationId && e.kind === 'PAYG_CHARGE' && e.checkpointId === input.checkpointId,
    );

    if (existing) {
      return;
    }

    const entry: CreditLedgerRecord = {
      id: id('credit'),
      walletId: wallet.id,
      organizationId: input.organizationId,
      deltaCents: -cents,
      kind: 'PAYG_CHARGE',
      reason: 'PAYG overage (billed to Stripe metered usage)',
      checkpointId: input.checkpointId,
      expiresAt: undefined,
      metadata: undefined,
      createdAt: now(),
    };
    this.creditLedger.set(entry.id, entry);
  }

  async markSpendAlert(input: { organizationId: string; pct: number; periodStartMs: number }): Promise<void> {
    const wallet = await this.ensureCreditWallet(input.organizationId);
    wallet.lastSpendAlertPct = input.pct;
    wallet.lastSpendAlertPeriodStart = new Date(input.periodStartMs).toISOString();
    wallet.updatedAt = now();
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
    const checkpoint: AgentCheckpointRecord = {
      id: id('checkpoint'),
      organizationId: input.organizationId,
      userId: input.userId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      runId: input.runId,
      status: 'PENDING',
      highPowerModel: input.highPowerModel ?? false,
      extendedThinking: input.extendedThinking ?? false,
      buildTier: input.buildTier ?? 'power',
      turboMode: input.turboMode ?? false,
      inputTokens: 0,
      outputTokens: 0,
      wallMs: 0,
      computeCents: 0,
      rawProviderCents: 0,
      creditCents: 0,
      startedAt: now(),
    };
    this.agentCheckpoints.set(checkpoint.id, checkpoint);

    return checkpoint;
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
    const checkpoint = this.agentCheckpoints.get(input.id);

    if (!checkpoint) {
      throw new Error(`checkpoint ${input.id} not found`);
    }

    checkpoint.status = input.status;

    if (input.inputTokens !== undefined) {
      checkpoint.inputTokens = input.inputTokens;
    }

    if (input.outputTokens !== undefined) {
      checkpoint.outputTokens = input.outputTokens;
    }

    if (input.wallMs !== undefined) {
      checkpoint.wallMs = input.wallMs;
    }

    if (input.computeCents !== undefined) {
      checkpoint.computeCents = input.computeCents;
    }

    if (input.rawProviderCents !== undefined) {
      checkpoint.rawProviderCents = input.rawProviderCents;
    }

    if (input.creditCents !== undefined) {
      checkpoint.creditCents = input.creditCents;
    }

    checkpoint.completedAt = now();

    return checkpoint;
  }

  async getAgentCheckpoint(checkpointId: string) {
    return this.agentCheckpoints.get(checkpointId);
  }

  async listAgentCheckpoints(organizationId: string, options?: { take?: number }) {
    return [...this.agentCheckpoints.values()]
      .filter((c) => c.organizationId === organizationId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, options?.take ?? 100);
  }

  // --- Replit-parity: admin-owned provider/model registry -------------------

  async listProviderConfigs() {
    return [...this.providerConfigs.values()].sort((a, b) => a.provider.localeCompare(b.provider));
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
    const existing = this.providerConfigs.get(input.provider);
    const ts = now();

    /*
     * Mirror the Prisma conditional-spread contract: `undefined` = leave the
     * stored value unchanged; explicit `null` = clear it. `?? existing` would
     * wrongly resurrect the old value on an intentional clear, so branch on
     * `undefined` and coerce `null` → undefined (the record's "absent" shape).
     */
    const config: ProviderConfigRecord = {
      id: existing?.id ?? id('provider'),
      provider: input.provider,
      displayName: input.displayName,
      enabled: input.enabled ?? existing?.enabled ?? false,
      apiKeySecret: input.apiKeySecret ?? existing?.apiKeySecret,
      apiKeyEnc: input.apiKeyEnc !== undefined ? (input.apiKeyEnc ?? undefined) : existing?.apiKeyEnc,
      baseUrl: input.baseUrl !== undefined ? (input.baseUrl ?? undefined) : existing?.baseUrl,
      byokAllowed: input.byokAllowed ?? existing?.byokAllowed ?? false,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    this.providerConfigs.set(input.provider, config);

    return config;
  }

  readonly connectorOAuthConfigs = new Map<
    string,
    {
      provider: string;
      displayName: string;
      authType: string;
      enabled: boolean;
      clientId: string | null;
      clientSecretEnc: string | null;
      scopes: string[];
      authorizeUrl: string | null;
    }
  >();

  async getConnectorOAuthCatalog(provider: string) {
    return (
      this.connectorOAuthConfigs.get(provider) ?? {
        provider,
        displayName: provider,
        authType: 'oauth',

        /*
         * Matches the prod seed (seed-connector-catalog.ts): every catalogued
         * connector ships enabled=true, so an un-configured connector still
         * resolves its INTEGRATION_* env creds (connectorCredentialsFor). Only an
         * admin explicitly toggling enabled=false blocks it.
         */
        enabled: true,
        clientId: null,
        clientSecretEnc: null,
        scopes: [],
        authorizeUrl: null,
      }
    );
  }

  async upsertConnectorOAuthConfig(input: {
    provider: string;
    clientId?: string | null;
    clientSecretEnc?: string | null;
    enabled?: boolean;
  }) {
    const existing = await this.getConnectorOAuthCatalog(input.provider);

    const next = {
      ...existing,
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
      ...(input.clientSecretEnc !== undefined ? { clientSecretEnc: input.clientSecretEnc } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    };
    this.connectorOAuthConfigs.set(input.provider, next);

    return {
      provider: next.provider,
      enabled: next.enabled,
      clientId: next.clientId,
      hasSecret: Boolean(next.clientSecretEnc),
    };
  }

  private loginProviderConfigs = new Map<
    string,
    { provider: string; enabled: boolean; clientId: string | null; clientSecretEnc: string | null; scopes: string[] }
  >();

  async getLoginProviderConfig(provider: string) {
    return this.loginProviderConfigs.get(provider) ?? null;
  }

  async upsertLoginProviderConfig(input: {
    provider: string;
    clientId?: string | null;
    clientSecretEnc?: string | null;
    scopes?: string[];
    enabled?: boolean;
    updatedByUserId?: string | null;
  }) {
    const existing = this.loginProviderConfigs.get(input.provider) ?? {
      provider: input.provider,
      enabled: true,
      clientId: null,
      clientSecretEnc: null,
      scopes: [],
    };

    const next = {
      ...existing,
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
      ...(input.clientSecretEnc !== undefined ? { clientSecretEnc: input.clientSecretEnc } : {}),
      ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    };
    this.loginProviderConfigs.set(input.provider, next);

    return {
      provider: next.provider,
      enabled: next.enabled,
      clientId: next.clientId,
      hasSecret: Boolean(next.clientSecretEnc),
    };
  }

  private stripeConfig: { secretKeyEnc: string | null; webhookSecretEnc: string | null } | null = null;

  async getStripeConfig() {
    return this.stripeConfig;
  }

  async upsertStripeConfig(input: {
    secretKeyEnc?: string | null;
    webhookSecretEnc?: string | null;
    updatedByUserId?: string | null;
  }) {
    const current = this.stripeConfig ?? { secretKeyEnc: null, webhookSecretEnc: null };
    this.stripeConfig = {
      secretKeyEnc: input.secretKeyEnc !== undefined ? input.secretKeyEnc : current.secretKeyEnc,
      webhookSecretEnc: input.webhookSecretEnc !== undefined ? input.webhookSecretEnc : current.webhookSecretEnc,
    };

    return {
      hasSecretKey: Boolean(this.stripeConfig.secretKeyEnc),
      hasWebhookSecret: Boolean(this.stripeConfig.webhookSecretEnc),
    };
  }

  async setPlanStripePrices(input: {
    key: string;
    stripeProductId?: string | null;
    stripePriceId?: string | null;
    stripePriceMonthlyId?: string | null;
    stripePriceAnnualId?: string | null;
  }) {
    const plan = this.billingPlans.get(input.key as PlanKey);

    if (!plan) {
      return;
    }

    if (input.stripeProductId !== undefined) {
      plan.stripeProductId = input.stripeProductId ?? undefined;
    }

    if (input.stripePriceId !== undefined) {
      plan.stripePriceId = input.stripePriceId ?? undefined;
    }

    if (input.stripePriceMonthlyId !== undefined) {
      plan.stripePriceMonthlyId = input.stripePriceMonthlyId ?? undefined;
    }

    if (input.stripePriceAnnualId !== undefined) {
      plan.stripePriceAnnualId = input.stripePriceAnnualId ?? undefined;
    }
  }

  async listAdminCreditWallets() {
    return [...this.creditWallets.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listAdminAgentCheckpoints(options?: { take?: number }) {
    return [...this.agentCheckpoints.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, options?.take ?? 200);
  }

  async summarizeAgentCheckpoints() {
    const byOrg = new Map<
      string,
      { organizationId: string; checkpoints: number; inputTokens: number; outputTokens: number; creditCents: number }
    >();

    for (const cp of this.agentCheckpoints.values()) {
      const entry = byOrg.get(cp.organizationId) ?? {
        organizationId: cp.organizationId,
        checkpoints: 0,
        inputTokens: 0,
        outputTokens: 0,
        creditCents: 0,
      };
      entry.checkpoints += 1;
      entry.inputTokens += cp.inputTokens;
      entry.outputTokens += cp.outputTokens;
      entry.creditCents += cp.creditCents;
      byOrg.set(cp.organizationId, entry);
    }

    return [...byOrg.values()].sort((a, b) => b.creditCents - a.creditCents);
  }

  async purgeAgentCheckpoints(input: { before: string; dryRun: boolean }) {
    const beforeMs = new Date(input.before).getTime();

    const matches = [...this.agentCheckpoints.values()].filter(
      (cp) => new Date(cp.startedAt).getTime() < beforeMs && (cp.status === 'COMPLETED' || cp.status === 'FAILED'),
    );

    if (!input.dryRun) {
      for (const cp of matches) {
        this.agentCheckpoints.delete(cp.id);
      }
    }

    return { count: matches.length };
  }

  async listModelConfigs(options?: { enabledOnly?: boolean }) {
    let configs = [...this.modelConfigs.values()];

    if (options?.enabledOnly) {
      const enabledProviders = new Set(
        [...this.providerConfigs.values()].filter((p) => p.enabled).map((p) => p.provider),
      );
      configs = configs.filter((m) => m.enabled && m.provider && enabledProviders.has(m.provider));
    }

    return configs.sort((a, b) => a.modelId.localeCompare(b.modelId));
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
    const provider =
      this.providerConfigs.get(input.provider) ??
      (await this.upsertProviderConfig({ provider: input.provider, displayName: input.provider }));

    const key = `${provider.id}:${input.modelId}`;
    const existing = this.modelConfigs.get(key);
    const ts = now();

    const config: ModelConfigRecord = {
      id: existing?.id ?? id('model'),
      providerConfigId: provider.id,
      provider: input.provider,
      modelId: input.modelId,
      displayName: input.displayName,
      enabled: input.enabled ?? existing?.enabled ?? false,
      enabledPlans: input.enabledPlans,
      isHighPower: input.isHighPower ?? existing?.isHighPower ?? false,
      supportsThinking: input.supportsThinking ?? existing?.supportsThinking ?? false,
      inputCentsPerM: input.inputCentsPerM,
      outputCentsPerM: input.outputCentsPerM,
      contextWindow: input.contextWindow,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    this.modelConfigs.set(key, config);

    return config;
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
    const plan: BillingPlanRecord = { id: this.billingPlans.get(input.key)?.id ?? id('plan'), ...input };
    this.billingPlans.set(input.key, plan);

    return plan;
  }

  async listBillingPlans() {
    return [...this.billingPlans.values()];
  }

  async getBillingPlan(key: PlanKey) {
    return this.billingPlans.get(key);
  }

  async upsertBillingCustomer(input: { organizationId: string; provider: string; externalId: string }) {
    const existing = this.billingCustomers.get(input.organizationId);

    const customer: BillingCustomerRecord = {
      id: existing?.id ?? id('customer'),
      ...input,
      createdAt: existing?.createdAt ?? now(),
    };
    this.billingCustomers.set(input.organizationId, customer);

    return customer;
  }

  async getBillingCustomer(organizationId: string) {
    return this.billingCustomers.get(organizationId);
  }

  async findOrganizationIdByBillingCustomer(provider: string, externalId: string) {
    for (const customer of this.billingCustomers.values()) {
      if (customer.provider === provider && customer.externalId === externalId) {
        return customer.organizationId;
      }
    }

    return undefined;
  }

  async findOrganizationIdBySubscriptionExternalId(externalId: string) {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.externalId === externalId) {
        return subscription.organizationId;
      }
    }

    return undefined;
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
  }) {
    const plan =
      this.billingPlans.get(input.planKey) ??
      (await this.upsertBillingPlan({ key: input.planKey, name: input.planKey, monthlyCents: 0, limits: {} }));
    const existing = [...this.subscriptions.values()].find(
      (subscription) =>
        (input.externalId && subscription.externalId === input.externalId) ||
        subscription.organizationId === input.organizationId,
    );
    const subscription: SubscriptionRecord = {
      id: existing?.id ?? id('sub'),
      organizationId: input.organizationId,
      planId: plan.id,
      planKey: input.planKey,
      planMonthlyCents: plan.monthlyCents,
      externalId: input.externalId ?? existing?.externalId,
      status: input.status,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      trialEndsAt: input.trialEndsAt?.toISOString(),
      currentPeriodStart: input.currentPeriodStart?.toISOString(),
      currentPeriodEnd: input.currentPeriodEnd?.toISOString(),
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    };
    this.subscriptions.set(subscription.id, subscription);

    return subscription;
  }

  async getSubscription(organizationId: string) {
    const subscription = [...this.subscriptions.values()].find(
      (candidate) => candidate.organizationId === organizationId,
    );
    if (!subscription) {
      return undefined;
    }
    return {
      ...subscription,
      planMonthlyCents: this.billingPlans.get(subscription.planKey)?.monthlyCents ?? -1,
    };
  }

  async listAdminSubscriptions() {
    return [...this.subscriptions.values()];
  }

  async recordUsageEvent(input: {
    organizationId: string;
    userId?: string;
    type: string;
    quantity?: number;
    metadata?: unknown;
  }) {
    const event: UsageEventRecord = {
      id: id('usage'),
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      quantity: input.quantity ?? 1,
      metadata: input.metadata,
      createdAt: now(),
    };
    this.usageEvents.set(event.id, event);

    return event;
  }

  async listUsageEvents(organizationId: string) {
    return [...this.usageEvents.values()].filter((event) => event.organizationId === organizationId);
  }

  async findUsageEventByReference(input: { organizationId: string; type: string; reference: string; since: Date }) {
    return [...this.usageEvents.values()].find((event) => {
      const metadata = event.metadata as { reference?: unknown } | null | undefined;
      return (
        event.organizationId === input.organizationId &&
        event.type === input.type &&
        metadata?.reference === input.reference &&
        new Date(event.createdAt).getTime() >= input.since.getTime()
      );
    });
  }

  async hasUsageEventSince(organizationId: string, type: string, sinceMs: number) {
    return [...this.usageEvents.values()].some(
      (event) =>
        event.organizationId === organizationId &&
        event.type === type &&
        new Date(event.createdAt).getTime() >= sinceMs,
    );
  }

  async sumUsage(organizationId: string, type: string, since?: Date) {
    return [...this.usageEvents.values()]
      .filter(
        (event) =>
          event.organizationId === organizationId &&
          event.type === type &&
          (!since || new Date(event.createdAt).getTime() >= since.getTime()),
      )
      .reduce((sum, event) => sum + event.quantity, 0);
  }

  async createQuotaOverride(input: {
    organizationId: string;
    key: QuotaOverrideKey;
    limit: number;
    reason: string;
    createdByUserId?: string;
    expiresAt?: Date;
  }) {
    const override: QuotaOverrideRecord = {
      id: id('quota_override'),
      ...input,
      expiresAt: input.expiresAt?.toISOString(),
      createdAt: now(),
    };
    this.quotaOverrides.set(override.id, override);

    return override;
  }

  async listQuotaOverrides(organizationId: string) {
    return [...this.quotaOverrides.values()].filter((override) => override.organizationId === organizationId);
  }

  async getQuotaOverride(organizationId: string, key: QuotaOverrideKey) {
    const databaseNow = this.databaseClockNowMs ?? Date.now();
    return [...this.quotaOverrides.values()]
      .filter(
        (override) =>
          override.organizationId === organizationId &&
          override.key === key &&
          (!override.expiresAt || new Date(override.expiresAt).getTime() > databaseNow),
      )
      .sort((left, right) =>
        left.createdAt === right.createdAt
          ? right.id.localeCompare(left.id)
          : right.createdAt.localeCompare(left.createdAt),
      )[0];
  }

  async recordStripeEvent(input: { id: string; organizationId?: string; type: string; payload: unknown }) {
    const existing = this.stripeEvents.get(input.id);

    if (existing) {
      return { event: existing, created: false };
    }

    const event: StripeEventRecord = { ...input, processedAt: now() };
    this.stripeEvents.set(event.id, event);

    return { event, created: true };
  }

  async deleteStripeEvent(id: string): Promise<void> {
    this.stripeEvents.delete(id);
  }

  readonly stripeWebhookFailures = new Map<string, StripeWebhookFailureRecord>();

  async recordStripeWebhookFailure(input: { eventId: string; type: string; payload: unknown; error: string }) {
    const existing = this.stripeWebhookFailures.get(input.eventId);

    const failure: StripeWebhookFailureRecord = existing
      ? {
          ...existing,
          attempts: existing.attempts + 1,
          lastError: input.error,
          payload: input.payload,
          failedAt: now(),
          resolvedAt: undefined,
        }
      : {
          id: `swf_${this.stripeWebhookFailures.size + 1}`,
          eventId: input.eventId,
          type: input.type,
          payload: input.payload,
          attempts: 1,
          lastError: input.error,
          failedAt: now(),
          resolvedAt: undefined,
        };

    this.stripeWebhookFailures.set(input.eventId, failure);

    return failure;
  }

  async listStripeWebhookFailures(options?: { includeResolved?: boolean; limit?: number }) {
    return [...this.stripeWebhookFailures.values()]
      .filter((failure) => options?.includeResolved || !failure.resolvedAt)
      .sort((a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime())
      .slice(0, options?.limit ?? 50);
  }

  async getStripeWebhookFailure(eventId: string) {
    return this.stripeWebhookFailures.get(eventId);
  }

  async resolveStripeWebhookFailure(eventId: string): Promise<void> {
    const failure = this.stripeWebhookFailures.get(eventId);

    if (failure && !failure.resolvedAt) {
      this.stripeWebhookFailures.set(eventId, { ...failure, resolvedAt: now() });
    }
  }

  readonly samlAssertions = new Set<string>();

  async recordSamlAssertionConsumption(input: { organizationId: string; assertionId: string; expiresAt: Date }) {
    const key = `${input.organizationId}:${input.assertionId}`;

    if (this.samlAssertions.has(key)) {
      return { created: false };
    }

    this.samlAssertions.add(key);

    return { created: true };
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
    const existing = this.emailDeliveryEvents.find(
      (event) => event.provider === input.provider && event.providerEventId === input.providerEventId,
    );

    if (existing) {
      return { event: existing, created: false };
    }

    const event: EmailDeliveryEventRecord = {
      id: id('email_event'),
      provider: input.provider,
      providerEventId: input.providerEventId,
      type: input.type,
      email: input.email,
      emailMessageId: input.emailMessageId,
      subject: input.subject,
      fromAddress: input.fromAddress,
      payload: input.payload,
      receivedAt: now(),
    };
    this.emailDeliveryEvents.push(event);

    return { event, created: true };
  }

  async listEmailDeliveryEvents(filter?: { email?: string; type?: string; emailMessageId?: string; limit?: number }) {
    const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);

    return this.emailDeliveryEvents
      .filter((event) => {
        if (filter?.email && event.email !== filter.email) {
          return false;
        }

        if (filter?.type && event.type !== filter.type) {
          return false;
        }

        if (filter?.emailMessageId && event.emailMessageId !== filter.emailMessageId) {
          return false;
        }

        return true;
      })
      .slice()
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .slice(0, limit);
  }

  async recordAudit(event: AuditEvent) {
    this.auditLogs.push({ ...event, id: id('audit'), metadata: redactAuditMetadata(event.metadata), createdAt: now() });
  }

  async listAuditLogs(organizationId?: string) {
    return this.auditLogs.filter((event) => !organizationId || event.organizationId === organizationId);
  }

  async listSecurityAuditEvents() {
    return this.auditLogs.filter(
      (event) => event.action.startsWith('auth.') || event.action.includes('security') || event.action.includes('mfa'),
    );
  }

  async listOrganizationSecurityAuditEventsPage(input: {
    organizationId: string;
    limit: number;
    cursor?: { createdAt: string; id: string };
  }): Promise<SecurityAuditEventPage> {
    const limit = Math.max(1, Math.min(input.limit, 100));
    const rows = this.auditLogs
      .filter(
        (event) =>
          event.organizationId === input.organizationId &&
          (event.action.startsWith('auth.') || event.action.includes('security') || event.action.includes('mfa')),
      )
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    const afterCursor = input.cursor
      ? rows.filter(
          (event) =>
            event.createdAt < input.cursor!.createdAt ||
            (event.createdAt === input.cursor!.createdAt && event.id < input.cursor!.id),
        )
      : rows;
    const pageRows = afterCursor.slice(0, limit);
    const events = pageRows.map((event) => {
      const resolution = this.securityEventResolutions.get(event.id);
      return {
        ...event,
        resolved: resolution?.resolved ?? false,
        note: resolution?.note,
        resolvedAt: resolution?.resolvedAt,
      };
    });
    const openCount = rows.filter((event) => !this.securityEventResolutions.get(event.id)?.resolved).length;
    const last = pageRows.at(-1);
    return {
      events,
      openCount,
      nextCursor: afterCursor.length > limit && last ? { createdAt: last.createdAt, id: last.id } : undefined,
    };
  }

  async listAdminUsers() {
    return [...this.users.values()];
  }

  async listAdminUsersPage(options: {
    page: number;
    pageSize: number;
    sort: 'name' | 'email' | 'createdAt';
    direction: 'asc' | 'desc';
    query?: string;
  }) {
    const query = options.query?.toLowerCase();

    const filtered = [...this.users.values()].filter(
      (user) => !query || user.name?.toLowerCase().includes(query) || user.email?.toLowerCase().includes(query),
    );

    const sortValue = (user: { name?: string | null; email?: string; createdAt?: string }) =>
      options.sort === 'name'
        ? (user.name ?? '')
        : options.sort === 'email'
          ? (user.email ?? '')
          : (user.createdAt ?? '');

    filtered.sort((a, b) =>
      options.direction === 'asc' ? sortValue(a).localeCompare(sortValue(b)) : sortValue(b).localeCompare(sortValue(a)),
    );

    const start = (options.page - 1) * options.pageSize;

    return { users: filtered.slice(start, start + options.pageSize), total: filtered.length };
  }

  async listAdminOrganizations() {
    return [...this.organizations.values()];
  }

  async listAdminProjects() {
    return [...this.projects.values()];
  }

  async listAdminWorkspaces() {
    return [...this.workspaces.values()];
  }

  async listAdminDeployments() {
    return [...this.deployments.values()];
  }

  async listAdminSupportTickets() {
    return [...this.supportTickets.values()];
  }

  async listAdminUsageEvents() {
    return [...this.usageEvents.values()];
  }

  async listAdminAiCosts() {
    return [...this.aiCostLedger.values()];
  }

  async updateWorkspaceStatus(input: {
    workspaceId: string;
    expectedProjectId: string;
    expectedOrganizationId: string;
    status: WorkspaceRecord['status'];
  }) {
    const workspace = this.workspaces.get(input.workspaceId);

    if (!workspace || workspace.projectId !== input.expectedProjectId) {
      throw Object.assign(new Error('Workspace not found'), { statusCode: 404, code: 'WORKSPACE_NOT_FOUND' });
    }
    this.assertProjectTenantMutation(input.expectedProjectId, input.expectedOrganizationId);

    workspace.status = input.status;

    return workspace;
  }

  async updateSupportTicket(input: { ticketId: string; status: SupportTicketRecord['status']; response?: string }) {
    const ticket = this.supportTickets.get(input.ticketId);

    if (!ticket) {
      throw Object.assign(new Error('Support ticket not found'), { statusCode: 404, code: 'SUPPORT_TICKET_NOT_FOUND' });
    }

    ticket.status = input.status;

    // Stamp the FIRST admin response only — later responses keep the SLA mark.
    if (input.response && !ticket.firstResponseAt) {
      ticket.firstResponseAt = now();
    }

    return ticket;
  }

  async assignSupportTicket(input: { ticketId: string; assigneeUserId?: string }) {
    const ticket = this.supportTickets.get(input.ticketId);

    if (!ticket) {
      throw Object.assign(new Error('Support ticket not found'), { statusCode: 404, code: 'SUPPORT_TICKET_NOT_FOUND' });
    }

    ticket.assigneeUserId = input.assigneeUserId;

    return ticket;
  }

  async listSecurityEventResolutions() {
    return [...this.securityEventResolutions.values()];
  }

  async resolveSecurityEvent(input: { auditLogId: string; note?: string; resolvedByUserId?: string }) {
    const existing = this.securityEventResolutions.get(input.auditLogId);

    const record: SecurityEventResolutionRecord = {
      id: existing?.id ?? id('sec_res'),
      auditLogId: input.auditLogId,
      resolved: true,
      note: input.note,
      resolvedByUserId: input.resolvedByUserId,
      resolvedAt: now(),
      createdAt: existing?.createdAt ?? now(),
    };
    this.securityEventResolutions.set(input.auditLogId, record);

    return record;
  }

  async updateAbuseEvent(input: { abuseEventId: string; resolved?: boolean; disposition?: string }) {
    const event = this.abuseEvents.get(input.abuseEventId);

    if (!event) {
      throw Object.assign(new Error('Abuse event not found'), { statusCode: 404, code: 'ABUSE_EVENT_NOT_FOUND' });
    }

    const updated: AbuseEventRecord = {
      ...event,
      resolved: input.resolved ?? true,
      resolvedAt: now(),
      ...(input.disposition ? { disposition: input.disposition } : {}),
    };
    this.abuseEvents.set(input.abuseEventId, updated);

    return updated;
  }

  async recordAdminAudit(event: AdminAuditLogRecord) {
    this.adminAuditLogs.push({ ...event, metadata: redactAuditMetadata(event.metadata), createdAt: now() });
  }

  async listAdminAuditLogs() {
    return this.adminAuditLogs;
  }

  async redactAuditLogs(input: { organizationId?: string; actorUserId?: string; before?: string }) {
    if (!input.organizationId && !input.actorUserId) {
      return { redacted: 0 };
    }

    const before = input.before ? new Date(input.before) : undefined;
    const beforeMs = before && !Number.isNaN(before.getTime()) ? before.getTime() : undefined;

    let redacted = 0;

    for (const event of this.auditLogs) {
      if (input.organizationId && event.organizationId !== input.organizationId) {
        continue;
      }

      if (input.actorUserId && event.actorUserId !== input.actorUserId) {
        continue;
      }

      if (beforeMs !== undefined) {
        const createdAt = (event as AuditEvent & { createdAt?: string }).createdAt;
        const createdMs = createdAt ? new Date(createdAt).getTime() : undefined;

        if (createdMs === undefined || createdMs >= beforeMs) {
          continue;
        }
      }

      if (event.ipAddress == null) {
        continue; // already redacted — keep the count truthful
      }

      event.ipAddress = undefined;
      event.metadata = { redacted: true };
      redacted += 1;
    }

    return { redacted };
  }
}
