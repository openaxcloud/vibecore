import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
import { hashToken } from '@vibecore/auth';
import type { PlanKey, QuotaKey } from '@vibecore/billing';
import { rolePermissions, type PermissionKey } from '@vibecore/rbac';

export interface UserRecord {
  id: string;
  email: string;
  name?: string;
  passwordHash?: string;
  emailVerifiedAt?: string;
  mfaEnabled?: boolean;
  mfaSecretEncrypted?: string;
  platformAdmin?: boolean;

  /**
   * BCP-47 primary language tag the user picked (e.g. `en`, `fr`). Optional:
   * existing users default to client-side detection until they touch the
   * account settings. Slice 2 of the Phase 0 #7 react-i18next migration.
   */
  language?: string;

  /**
   * IANA timezone name (e.g. `Europe/Paris`). Optional: unset until the user
   * picks one in account/IDE settings, where the client otherwise detects it
   * from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
   */
  timezone?: string;

  /**
   * Free-form per-user preferences from the in-IDE settings panel
   * (notifications, event logs, feature toggles, profile fields). The DB is
   * the source of truth; localStorage is a client-side cache. Shallow-merged
   * on update so partial saves never clobber unrelated keys.
   */
  preferences?: Record<string, unknown>;
  /** Last activity timestamp (throttled). Drives inactivity GC (P8). */
  lastActiveAt?: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  ipAddress?: string;
  userAgent?: string;
  revokedAt?: string;
  lastReauthAt?: string;
  /** Set when an admin is impersonating another user; value = admin's user id. */
  impersonatedBy?: string;
}

export interface OrganizationRecord {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

export interface MembershipRecord {
  id: string;
  organizationId: string;
  userId: string;
  roleKey: string;
}

export interface ProjectRecord {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  sourceType: 'blank' | 'template' | 'ai' | 'github' | 'zip' | 'duplicate';
  templateName?: string;
  gitRepositoryUrl?: string;
  gitDefaultBranch?: string;
  persistentVolumeClaim: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface WorkspaceRecord {
  id: string;
  projectId: string;
  name: string;
  status: 'PENDING' | 'STARTING' | 'RUNNING' | 'STOPPED' | 'FAILED';
  runtimeMode: string;

  /*
   * Filesystem path (relative to the project storage root) for this
   * workspace's isolated git working tree. Allocated when the workspace
   * is created so each branch / agent run has its own checkout.
   */
  gitPath?: string;

  /*
   * Remote URL configured for this workspace specifically. Nullable: callers
   * should fall back to Project.gitRepositoryUrl when this is undefined.
   */
  gitRepositoryUrl?: string;
  createdAt: string;
}

export interface SnapshotRecord {
  id: string;
  projectId: string;
  label?: string;
  kind: 'manual' | 'automatic' | 'before-ai-change';
  manifest: unknown;
  storageKey?: string;
  byteLength?: number;
  createdByUserId?: string;
  createdAt: string;
}

export interface ProjectStorageObjectRecord {
  id: string;
  projectId?: string;
  key: string;
  kind: 'export' | 'snapshot' | 'before-ai-change' | 'runtime';
  contentBase64: string;
  byteLength: number;
  contentHash: string;
  createdAt: string;
}

/** Managed Postgres database for a project (Replit "Database" tab). Phase-1
 *  scaffold for point-in-time rollback — see database-rollback-service.ts. */
export interface DatabaseInstanceRecord {
  id: string;
  projectId: string;
  organizationId: string;
  status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  engine: string;
  region?: string;
  sizeBytes: number;
  retentionDays: number;
  pitrEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A recovery point for a DatabaseInstance (auto/manual snapshot). */
export interface DatabaseSnapshotRecord {
  id: string;
  databaseInstanceId: string;
  kind: 'auto' | 'manual';
  label?: string;
  lsn?: string;
  sizeBytes: number;
  storageKey?: string;
  createdByUserId?: string;
  createdAt: string;
  expiresAt?: string;
}

/** A point-in-time restore request for a DatabaseInstance. */
export interface DatabaseRestoreRecord {
  id: string;
  databaseInstanceId: string;
  snapshotId?: string;
  targetTimestamp?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  requestedByUserId?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ProjectEnvironmentRecord {
  id: string;
  projectId: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSecretRecord {
  id: string;
  projectId: string;
  key: string;
  valueEncrypted: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCollaboratorRecord {
  id: string;
  projectId: string;
  userId: string;
  roleKey: string;
  expiresAt?: string;
  createdAt: string;
}

export interface ProjectActivityRecord {
  id: string;
  projectId: string;
  actorUserId?: string;
  action: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ProjectActivityListOptions {
  action?: string;
  actorUserId?: string;
  search?: string;
  since?: string;
  until?: string;
  limit?: number;
  order?: 'asc' | 'desc';
}

export interface ProjectTemplateRecord {
  id: string;
  sourceProjectId: string;
  organizationId: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface DeploymentRecord {
  id: string;
  projectId: string;
  workspaceId?: string;
  provider: string;
  environment: 'preview' | 'staging' | 'production';
  status: 'QUEUED' | 'BUILDING' | 'READY' | 'FAILED' | 'CANCELED';
  url?: string;
  previewUrl?: string;
  productionUrl?: string;
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  branch?: string;
  commitSha?: string;
  customDomain?: string;
  logs: Array<{ timestamp: string; level: 'info' | 'warn' | 'error'; message: string }>;
  metadata?: Record<string, unknown>;
  rolledBackFromId?: string;
  /** Replit-parity deploy metering idempotency marker (ISO); set once metered. */
  lastMeteredAt?: string;
  startedAt?: string;
  finishedAt?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SupportTicketRecord {
  id: string;
  organizationId: string;
  userId: string;
  subject: string;
  status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
}

export interface FeatureFlagRecord {
  id: string;
  organizationId?: string;
  key: string;
  enabled: boolean;

  /** 0–100 staged rollout. Undefined means 100 (fully on when enabled). */
  rolloutPercent?: number;
}

export interface AbuseEventRecord {
  id: string;
  organizationId?: string;
  userId?: string;
  type: string;
  severity: string;
  createdAt: string;
}

export interface SystemSettingRecord {
  key: string;
  value?: unknown;
  updatedAt: string;
}

export interface AdminAuditLogRecord {
  actorUserId?: string;
  action: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt?: string;
}

export interface EnterpriseSettingsRecord {
  organizationId: string;
  ipAllowlist: string[];
  sessionDurationMinutes: number;
  requireMfaForAdmins: boolean;
  dataRetentionDays: number;
  legalHoldEnabled: boolean;
  updatedAt: string;
}

export interface DomainVerificationRecord {
  id: string;
  organizationId: string;
  domain: string;
  verificationToken: string;
  verifiedAt?: string;
  redirectWww: boolean;
  wildcardEnabled: boolean;
  sslStatus: 'pending_dns' | 'dns_verified' | 'failed';
  createdAt: string;
}

export interface SsoConfigRecord {
  id: string;
  organizationId: string;
  type: 'oidc' | 'saml';
  enabled: boolean;
  encryptedConfig: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScimTokenRecord {
  id: string;
  organizationId: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface CustomRoleRecord {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  permissions: PermissionKey[];
  createdAt: string;
}

export interface RecoveryCodeRecord {
  id: string;
  userId: string;
  codeHash: string;
  usedAt?: string;
  createdAt: string;
}

export interface SiemWebhookRecord {
  id: string;
  organizationId: string;
  url: string;
  secretHash: string;
  secretCiphertext: string;
  enabled: boolean;
  lastDeliveredAt?: string;
  createdAt: string;
}

export type ApiKeyScope = 'read' | 'write' | 'admin';

export const API_KEY_SCOPES: ApiKeyScope[] = ['read', 'write', 'admin'];

export interface ApiKeyRecord {
  id: string;
  organizationId?: string;
  userId?: string;
  name: string;
  keyHash: string;
  keyPrefix?: string;
  scopes: ApiKeyScope[];
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface OrganizationInviteRecord {
  id: string;
  organizationId: string;
  email: string;
  roleKey: string;
  tokenHash: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
}

export interface OAuthConnectionRecord {
  id: string;
  userId: string;
  provider: string;
  externalId: string;
  accessHash: string;
  refreshHash?: string;
  createdAt: string;
}

export type UserConnectionStatus = 'active' | 'needs_reconnect' | 'revoked';

export interface UserConnectionRecord {
  id: string;
  userId: string;
  provider: string;
  externalAccountId: string;
  externalAccountLabel: string;

  /**
   * AES-256-GCM ciphertext produced by packages/security#encryptJson.
   * Internal callers (sidecar, github-user / github-stats routes, agent
   * orchestrator) decrypt it on demand; HTTP responses must never include
   * this field (route handlers explicitly strip it).
   */
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  apiKeyFieldsEncrypted?: Record<string, string>;
  scopes: string[];
  tokenExpiresAt?: string;
  status: UserConnectionStatus;
  lastUsedAt?: string;
  forAgentUse: boolean;
  oauthAppSource: 'e_code_default' | 'org_override';
  oauthAppOverrideId?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
}

export interface ProjectConnectionLinkRecord {
  id: string;
  projectId: string;
  userConnectionId: string;
  linkedByUserId: string;
  linkedAt: string;
  unlinkedAt?: string;
}

export interface AiConversationRecord {
  id: string;
  projectId?: string;
  userId: string;
  title?: string;
  createdAt: string;
}

export interface AiMessageRecord {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  createdAt: string;
}

export interface AiToolCallRecord {
  id: string;
  messageId: string;
  name: string;
  input?: unknown;
  output?: unknown;
  createdAt: string;
}

export interface AiTokenUsageRecord {
  id: string;
  messageId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  createdAt: string;
}

export interface AiCostLedgerRecord {
  id: string;
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
  createdAt: string;
}

// --- Replit-parity billing: credit wallet, checkpoints, model registry -------

export type CreditEntryKind = 'GRANT' | 'CONSUMPTION' | 'PAYG_CHARGE' | 'REFUND' | 'ADJUSTMENT' | 'EXPIRY';

export interface CreditWalletRecord {
  id: string;
  organizationId: string;
  balanceCents: number;
  currency: string;
  budgetCapCents?: number;
  serviceShutdownCents?: number;
  autoTopupCents?: number;
  /** Usage-based spend-alert de-dup: highest rung (50/80/100) sent this period. */
  lastSpendAlertPct?: number;
  /** Start of the period the last spend alert was sent for (ISO). */
  lastSpendAlertPeriodStart?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditPackRecord {
  id: string;
  organizationId: string;
  purchasedCents: number;
  remainingCents: number;
  expiresAt: string;
  stripePaymentIntentId?: string;
  createdAt: string;
}

export interface CreditLedgerRecord {
  id: string;
  walletId: string;
  organizationId: string;
  deltaCents: number;
  kind: CreditEntryKind;
  reason: string;
  checkpointId?: string;
  expiresAt?: string;
  metadata?: unknown;
  createdAt: string;
}

export type CheckpointStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface AgentCheckpointRecord {
  id: string;
  organizationId: string;
  userId?: string;
  projectId?: string;
  conversationId?: string;
  runId?: string;
  status: CheckpointStatus;
  highPowerModel: boolean;
  extendedThinking: boolean;
  buildTier: string;
  turboMode: boolean;
  inputTokens: number;
  outputTokens: number;
  wallMs: number;
  computeCents: number;
  rawProviderCents: number;
  creditCents: number;
  startedAt: string;
  completedAt?: string;
}

export interface ProviderConfigRecord {
  id: string;
  provider: string;
  displayName: string;
  enabled: boolean;
  apiKeySecret?: string;
  baseUrl?: string;
  byokAllowed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfigRecord {
  id: string;
  providerConfigId: string;
  /** Denormalized provider key for convenience (from the parent ProviderConfig). */
  provider?: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  enabledPlans: string[];
  isHighPower: boolean;
  supportsThinking: boolean;
  inputCentsPerM: number;
  outputCentsPerM: number;
  contextWindow: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectIdeStateRecord {
  projectId: string;
  state: unknown;
  version: number;
  updatedByUserId?: string;
  updatedAt: string;
  createdAt: string;
}

export interface WorkspaceIdeStateRecord {
  workspaceId: string;
  state: unknown;
  version: number;
  updatedByUserId?: string;
  updatedAt: string;
  createdAt: string;
}

export interface CollaborationPresenceRecord {
  id: string;
  projectId: string;
  userId: string;
  sessionId: string;
  status: 'online' | 'idle' | 'offline';
  filePath?: string;
  cursor?: unknown;
  selection?: unknown;
  mode: 'editing' | 'read-only' | 'pair-programming';
  terminalAccess: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CollaborationCommentRecord {
  id: string;
  projectId: string;
  userId: string;
  filePath?: string;
  line?: number;
  selection?: unknown;
  body: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface ProjectShareLinkRecord {
  id: string;
  projectId: string;
  tokenHash: string;
  roleKey: 'viewer' | 'member';
  expiresAt: string;
  createdByUserId?: string;
  revokedAt?: string;
  createdAt: string;
}

export interface ChatShareRecord {
  id: string;
  tokenHash: string;
  conversationId: string;
  projectId: string;
  authorUserId: string;
  title?: string;

  /** The stored ShareLinkPayload (messages + metadata). */
  payload: unknown;
  allowFork: boolean;
  expiresAt?: string;
  revokedAt?: string;
  createdAt: string;
}

/*
 * Status enum mirrored from the client-side AgentPatchProposalStatus
 * (workbench.ts). Terminal statuses (`accepted`, `rejected`, `reverted`) are
 * never persisted — the client deletes the row after the user decides.
 */
export type AgentPatchProposalStatus = 'pending' | 'applying' | 'failed';

export interface AgentPatchProposalRecord {
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
  createdAt: string;
  updatedAt: string;
}

export interface BillingCustomerRecord {
  id: string;
  organizationId: string;
  provider: string;
  externalId: string;
  createdAt: string;
}

export interface BillingPlanRecord {
  id: string;
  key: PlanKey;
  name: string;
  monthlyCents: number;
  limits: Record<string, number>;
  stripeProductId?: string;
  stripePriceId?: string;
  // Replit-parity: distinct monthly/annual price ids (annual = discounted).
  stripePriceMonthlyId?: string;
  stripePriceAnnualId?: string;
}

export interface SubscriptionRecord {
  id: string;
  organizationId: string;
  planId: string;
  planKey: PlanKey;
  externalId?: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNPAID';
  cancelAtPeriodEnd: boolean;
  trialEndsAt?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  createdAt: string;
  updatedAt?: string;
  lastStripeEventAt?: string;
}

export interface UsageEventRecord {
  id: string;
  organizationId: string;
  userId?: string;
  type: string;
  quantity: number;
  metadata?: unknown;
  createdAt: string;
}

export interface QuotaOverrideRecord {
  id: string;
  organizationId: string;
  key: QuotaKey;
  limit: number;
  reason: string;
  createdByUserId?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface StripeEventRecord {
  id: string;
  organizationId?: string;
  type: string;
  processedAt: string;
  payload: unknown;
}

export interface EmailDeliveryEventRecord {
  id: string;
  provider: string;
  providerEventId: string;
  type: string;
  email: string;
  emailMessageId?: string;
  subject?: string;
  fromAddress?: string;
  payload: unknown;
  receivedAt: string;
}

export interface ApiStore {
  /**
   * Lightweight liveness probe that issues a trivial query against the backing
   * database. Resolves when the database is reachable, rejects otherwise.
   * Used by admin health checks to assert real connectivity rather than
   * inferring it from environment-variable presence.
   */
  ping(): Promise<void>;

  /**
   * Serialize a read-modify-write critical section across all pods using a
   * Postgres transaction-scoped advisory lock keyed by `key`. Concurrent callers
   * with the same key run strictly one-at-a-time, so check-then-mutate guards
   * (last-owner / last-admin / quota) can't be defeated by a TOCTOU race. The
   * callback should be short (it runs while the lock is held).
   */
  withSerializedMutation<T>(key: string, fn: () => Promise<T>): Promise<T>;
  createUser(input: {
    email: string;
    name?: string;
    passwordHash: string;
    platformAdmin?: boolean;
  }): Promise<UserRecord>;
  updateUser(input: {
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
  }): Promise<UserRecord>;
  deleteUser(userId: string): Promise<boolean>;
  findUserByEmail(email: string): Promise<UserRecord | undefined>;
  findUserById(id: string): Promise<UserRecord | undefined>;
  /**
   * Stamp a user's lastActiveAt (P8 inactivity GC). Caller throttles; the write
   * is best-effort. Returns the new timestamp (ISO) or null if the user is gone.
   */
  touchUserActivity(userId: string, nowMs?: number): Promise<string | null>;

  /**
   * Inactivity-GC candidates: users whose last activity (lastActiveAt, falling
   * back to createdAt for accounts never touched) is older than `cutoffMs`.
   * `take` caps the batch. Used by the worker-triggered inactivity sweep (P8).
   */
  listInactiveUserCandidates(input: {
    cutoffMs: number;
    take?: number;
  }): Promise<Array<{ id: string; email: string; lastActiveAtMs: number }>>;
  createSession(input: {
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
    /** Admin user id when this is an impersonation session (P8). */
    impersonatedBy?: string;
  }): Promise<SessionRecord>;
  findSessionByToken(token: string): Promise<SessionRecord | undefined>;
  listSessions(userId: string): Promise<SessionRecord[]>;
  revokeSession(userId: string, sessionId: string): Promise<boolean>;
  revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number>;
  markSessionReauthenticated(sessionId: string): Promise<SessionRecord | undefined>;
  createEmailVerification(input: { userId: string; token: string; expiresAt: Date; email?: string }): Promise<void>;
  consumeEmailVerification(token: string): Promise<UserRecord | undefined>;
  createPasswordReset(input: { userId: string; token: string; expiresAt: Date }): Promise<void>;
  consumePasswordReset(token: string, passwordHash: string): Promise<UserRecord | undefined>;
  setRecoveryCodes(userId: string, codeHashes: string[]): Promise<RecoveryCodeRecord[]>;
  consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean>;
  createOrganization(input: { name: string; slug: string; ownerUserId: string }): Promise<OrganizationRecord>;
  listOrganizations(userId: string): Promise<OrganizationRecord[]>;
  getOrganization(id: string): Promise<OrganizationRecord | undefined>;
  addMember(input: { organizationId: string; userId: string; roleKey: string }): Promise<MembershipRecord>;
  getMembership(userId: string, organizationId: string): Promise<MembershipRecord | undefined>;
  listMembers(organizationId: string): Promise<MembershipRecord[]>;
  removeMember(organizationId: string, userId: string): Promise<MembershipRecord | undefined>;
  createProject(input: {
    organizationId: string;
    name: string;
    slug: string;
    description?: string;
    sourceType?: ProjectRecord['sourceType'];
    templateName?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
  }): Promise<ProjectRecord>;
  getProject(id: string): Promise<ProjectRecord | undefined>;
  getProjectBySlugs(input: { organizationSlug: string; projectSlug: string }): Promise<ProjectRecord | undefined>;
  updateProject(input: {
    projectId: string;
    name?: string;
    description?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
  }): Promise<ProjectRecord>;
  listProjects(organizationId: string): Promise<ProjectRecord[]>;
  countProjects(organizationId: string): Promise<number>;
  softDeleteProject(projectId: string): Promise<ProjectRecord>;
  restoreProject(projectId: string): Promise<ProjectRecord>;
  transferProject(input: { projectId: string; targetOrganizationId: string }): Promise<ProjectRecord>;
  duplicateProject(input: { projectId: string; name: string; slug: string }): Promise<ProjectRecord>;
  createProjectTemplate(input: {
    sourceProjectId: string;
    organizationId: string;
    name: string;
    description?: string;
  }): Promise<ProjectTemplateRecord>;
  listProjectTemplates(organizationId: string): Promise<ProjectTemplateRecord[]>;
  upsertProjectEnvVar(input: { projectId: string; key: string; value: string }): Promise<ProjectEnvironmentRecord>;
  listProjectEnvVars(projectId: string): Promise<ProjectEnvironmentRecord[]>;
  deleteProjectEnvVar(projectId: string, key: string): Promise<ProjectEnvironmentRecord | undefined>;
  upsertProjectSecret(input: { projectId: string; key: string; valueEncrypted: string }): Promise<ProjectSecretRecord>;
  listProjectSecrets(projectId: string): Promise<Array<Omit<ProjectSecretRecord, 'valueEncrypted'>>>;
  getProjectSecret(projectId: string, key: string): Promise<ProjectSecretRecord | undefined>;
  deleteProjectSecret(projectId: string, key: string): Promise<ProjectSecretRecord | undefined>;
  addProjectCollaborator(input: {
    projectId: string;
    userId: string;
    roleKey: string;
    expiresAt?: Date | null;
  }): Promise<ProjectCollaboratorRecord>;
  listProjectCollaborators(projectId: string): Promise<ProjectCollaboratorRecord[]>;
  removeProjectCollaborator(input: { projectId: string; userId: string }): Promise<boolean>;
  recordProjectActivity(input: {
    projectId: string;
    actorUserId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProjectActivityRecord>;
  listProjectActivity(projectId: string, options?: ProjectActivityListOptions): Promise<ProjectActivityRecord[]>;
  getProjectIdeState(projectId: string): Promise<ProjectIdeStateRecord | undefined>;
  upsertProjectIdeState(input: {
    projectId: string;
    state: unknown;
    updatedByUserId?: string;
    expectedVersion?: number;
  }): Promise<ProjectIdeStateRecord>;

  /*
   * Workspace-scoped IDE state. Callers that pass a workspaceId can read the
   * working tree's own editor state; when nothing is persisted yet they should
   * fall back to getProjectIdeState for backward compatibility with workspaces
   * created before the per-workspace state existed.
   */
  getWorkspaceIdeState(workspaceId: string): Promise<WorkspaceIdeStateRecord | undefined>;
  upsertWorkspaceIdeState(input: {
    workspaceId: string;
    state: unknown;
    updatedByUserId?: string;
    expectedVersion?: number;
  }): Promise<WorkspaceIdeStateRecord>;
  updateWorkspaceGitRepositoryUrl(input: {
    workspaceId: string;
    gitRepositoryUrl: string | null;
  }): Promise<WorkspaceRecord>;
  upsertCollaborationPresence(input: {
    projectId: string;
    userId: string;
    sessionId: string;
    status?: CollaborationPresenceRecord['status'];
    filePath?: string;
    cursor?: unknown;
    selection?: unknown;
    mode?: CollaborationPresenceRecord['mode'];
    terminalAccess?: boolean;
  }): Promise<CollaborationPresenceRecord>;
  removeCollaborationPresence(projectId: string, sessionId: string): Promise<boolean>;
  listCollaborationPresence(projectId: string): Promise<CollaborationPresenceRecord[]>;
  createCollaborationComment(input: {
    projectId: string;
    userId: string;
    filePath?: string;
    line?: number;
    selection?: unknown;
    body: string;
  }): Promise<CollaborationCommentRecord>;
  listCollaborationComments(projectId: string): Promise<CollaborationCommentRecord[]>;
  createProjectShareLink(input: {
    projectId: string;
    tokenHash: string;
    roleKey: ProjectShareLinkRecord['roleKey'];
    expiresAt: Date;
    createdByUserId?: string;
  }): Promise<ProjectShareLinkRecord>;
  listProjectShareLinks(projectId: string): Promise<ProjectShareLinkRecord[]>;

  /**
   * Resolve a project share link from its raw (unhashed) token. Returns the
   * record only when the link exists, is unrevoked, and is unexpired —
   * mirroring {@link findSessionByToken}. Used to redeem share links.
   */
  findProjectShareLinkByToken(token: string): Promise<ProjectShareLinkRecord | undefined>;

  /** Revoke a project share link (sets revokedAt). Returns false if not found / already revoked. */
  revokeProjectShareLink(input: { projectId: string; id: string }): Promise<boolean>;

  /**
   * Persist a shared conversation snapshot. The caller supplies the sha256
   * hash of the (random) share token so the raw token is never stored.
   */
  createChatShare(input: {
    tokenHash: string;
    conversationId: string;
    projectId: string;
    authorUserId: string;
    title?: string;
    payload: unknown;
    allowFork?: boolean;
    expiresAt?: Date;
  }): Promise<ChatShareRecord>;

  /**
   * Resolve a chat share by the sha256 hash of its token. Returns the record
   * only when it exists, is unrevoked, and is unexpired.
   */
  findChatShareByTokenHash(tokenHash: string): Promise<ChatShareRecord | undefined>;

  /** List a project's chat shares (most recent first). */
  listChatShares(projectId: string): Promise<ChatShareRecord[]>;

  /** Revoke a chat share (sets revokedAt). Returns false if not found / already revoked. */
  revokeChatShare(input: { id: string; authorUserId?: string; projectId?: string }): Promise<boolean>;
  upsertAgentPatchProposal(input: {
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
  }): Promise<AgentPatchProposalRecord>;
  listOpenAgentPatchProposals(projectId: string): Promise<AgentPatchProposalRecord[]>;
  deleteAgentPatchProposal(projectId: string, id: string): Promise<boolean>;
  createWorkspace(input: {
    id?: string;
    projectId: string;
    name: string;
    runtimeMode: string;
  }): Promise<WorkspaceRecord>;
  getWorkspace(id: string): Promise<WorkspaceRecord | undefined>;
  listWorkspaces(projectId: string): Promise<WorkspaceRecord[]>;

  /*
   * Organization-scoped aggregate counts for quota usage — single queries that
   * avoid the per-project N+1 of listing every project then its children.
   */
  countActiveWorkspaces(organizationId: string): Promise<number>;

  /*
   * Active (PENDING/STARTING/RUNNING) workspace records for an org, oldest first.
   * Used to reconcile records orphaned by pod GC (which never wrote back to the
   * api record) so they stop consuming the workspaces.active quota slot.
   */
  listActiveWorkspaces(organizationId: string): Promise<WorkspaceRecord[]>;
  countSnapshots(organizationId: string): Promise<number>;
  countDeployments(organizationId: string, since?: Date): Promise<number>;
  createSnapshot(input: {
    projectId: string;
    label?: string;
    kind?: SnapshotRecord['kind'];
    manifest: unknown;
    storageKey?: string;
    byteLength?: number;
    createdByUserId?: string;
  }): Promise<SnapshotRecord>;
  getSnapshot(id: string): Promise<SnapshotRecord | undefined>;
  listSnapshots(projectId: string): Promise<SnapshotRecord[]>;
  putProjectStorageObject(input: {
    projectId?: string;
    key: string;
    kind: ProjectStorageObjectRecord['kind'];
    contentBase64: string;
    byteLength: number;
    contentHash: string;
  }): Promise<ProjectStorageObjectRecord>;
  getProjectStorageObject(key: string): Promise<ProjectStorageObjectRecord | undefined>;
  /**
   * Total stored object bytes per organization (project storage objects joined
   * to their org). Drives the daily object-storage metering sweep (P4).
   */
  aggregateStorageBytesByOrg(): Promise<Array<{ organizationId: string; bytes: number }>>;
  /**
   * Database point-in-time rollback (Phase-1 scaffold, dormant behind
   * DB_ROLLBACK_ENABLED). Read the project's managed-database instance and its
   * recovery points; record a restore request (no executor yet). See
   * database-rollback-service.ts + migration 0040.
   */
  getDatabaseInstanceByProject(projectId: string): Promise<DatabaseInstanceRecord | undefined>;
  listDatabaseSnapshots(databaseInstanceId: string): Promise<DatabaseSnapshotRecord[]>;
  listDatabaseRestores(databaseInstanceId: string): Promise<DatabaseRestoreRecord[]>;
  createDatabaseRestore(input: {
    databaseInstanceId: string;
    snapshotId?: string;
    targetTimestamp?: string;
    requestedByUserId?: string;
  }): Promise<DatabaseRestoreRecord>;
  /**
   * Phase-2 provisioning lifecycle (dormant behind DB_ROLLBACK_ENABLED). Create
   * the per-project instance row, transition its status, record snapshots, prune
   * expired ones, and drive restore state. See database-provisioner.ts.
   */
  createDatabaseInstance(input: {
    projectId: string;
    organizationId: string;
    retentionDays: number;
    region?: string;
  }): Promise<DatabaseInstanceRecord>;
  updateDatabaseInstance(
    id: string,
    patch: Partial<Pick<DatabaseInstanceRecord, 'status' | 'sizeBytes' | 'pitrEnabled' | 'region'>>,
  ): Promise<DatabaseInstanceRecord | undefined>;
  createDatabaseSnapshot(input: {
    databaseInstanceId: string;
    kind: 'auto' | 'manual';
    label?: string;
    createdByUserId?: string;
    expiresAt?: string;
  }): Promise<DatabaseSnapshotRecord>;
  pruneExpiredDatabaseSnapshots(nowMs: number): Promise<number>;
  updateDatabaseRestore(
    id: string,
    patch: Partial<Pick<DatabaseRestoreRecord, 'status' | 'error' | 'startedAt' | 'completedAt'>>,
  ): Promise<DatabaseRestoreRecord | undefined>;
  listActiveDatabaseInstances(take?: number): Promise<DatabaseInstanceRecord[]>;
  listPendingDatabaseRestores(take?: number): Promise<DatabaseRestoreRecord[]>;
  createDeployment(input: {
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
    startedAt?: string;
    finishedAt?: string;
    canceledAt?: string;
  }): Promise<DeploymentRecord>;
  getDeployment(projectId: string, deploymentId: string): Promise<DeploymentRecord | undefined>;
  getDeploymentOwnerStatus(
    deploymentId: string,
  ): Promise<{ projectId: string; status: string; projectDeletedAt: Date | string | null } | undefined>;
  updateDeployment(
    projectId: string,
    deploymentId: string,
    input: Partial<Omit<DeploymentRecord, 'id' | 'projectId' | 'createdAt'>>,
  ): Promise<DeploymentRecord>;
  listDeployments(projectId: string, options?: { take?: number }): Promise<DeploymentRecord[]>;
  createSupportTicket(input: { organizationId: string; userId: string; subject: string }): Promise<SupportTicketRecord>;
  listSupportTickets(organizationId: string): Promise<SupportTicketRecord[]>;
  setFeatureFlag(input: {
    organizationId?: string;
    key: string;
    enabled: boolean;
    rolloutPercent?: number;
  }): Promise<FeatureFlagRecord>;
  listFeatureFlags(organizationId?: string): Promise<FeatureFlagRecord[]>;

  /**
   * Resolve the single effective flag for a key: the organization-specific
   * override when present, otherwise the global (organizationId = null) flag.
   */
  findFeatureFlag(key: string, organizationId?: string): Promise<FeatureFlagRecord | undefined>;

  /** Global flags merged with organization overrides (override wins per key). */
  listEffectiveFeatureFlags(organizationId?: string): Promise<FeatureFlagRecord[]>;
  createAbuseEvent(input: {
    organizationId?: string;
    userId?: string;
    type: string;
    severity: string;
  }): Promise<AbuseEventRecord>;
  listAbuseEvents(filter?: { organizationId?: string; type?: string; take?: number }): Promise<AbuseEventRecord[]>;
  setSystemSetting(input: { key: string; value?: unknown }): Promise<SystemSettingRecord>;
  listSystemSettings(): Promise<SystemSettingRecord[]>;

  /**
   * Atomically add/remove a string id from a SystemSetting whose value is a
   * string[] (e.g. admin.suspendedUserIds). Serializes concurrent mutations so a
   * read-modify-write race can't lose a suspend/unsuspend. Returns the new list.
   */
  mutateSystemSettingIds(key: string, change: { add?: string; remove?: string }): Promise<string[]>;
  getEnterpriseSettings(organizationId: string): Promise<EnterpriseSettingsRecord>;
  updateEnterpriseSettings(
    input: Partial<Omit<EnterpriseSettingsRecord, 'updatedAt'>> & { organizationId: string },
  ): Promise<EnterpriseSettingsRecord>;
  createDomainVerification(input: {
    organizationId: string;
    domain: string;
    verificationToken: string;
    redirectWww?: boolean;
    wildcardEnabled?: boolean;
  }): Promise<DomainVerificationRecord>;
  verifyDomain(input: { organizationId: string; domain: string }): Promise<DomainVerificationRecord | undefined>;
  updateDomainVerificationConfig(input: {
    organizationId: string;
    domain: string;
    redirectWww?: boolean;
    wildcardEnabled?: boolean;
  }): Promise<DomainVerificationRecord | undefined>;
  listDomainVerifications(organizationId: string): Promise<DomainVerificationRecord[]>;
  upsertSsoConfig(input: {
    organizationId: string;
    type: 'oidc' | 'saml';
    enabled: boolean;
    encryptedConfig: string;
  }): Promise<SsoConfigRecord>;
  getSsoConfig(organizationId: string, type: 'oidc' | 'saml'): Promise<SsoConfigRecord | undefined>;
  createScimToken(input: { organizationId: string; name: string; token: string }): Promise<ScimTokenRecord>;
  findScimToken(token: string): Promise<ScimTokenRecord | undefined>;
  listScimTokens(organizationId: string): Promise<ScimTokenRecord[]>;
  revokeScimToken(tokenId: string): Promise<ScimTokenRecord | undefined>;
  createCustomRole(input: {
    organizationId: string;
    key: string;
    name: string;
    permissions: PermissionKey[];
  }): Promise<CustomRoleRecord>;
  listCustomRoles(organizationId: string): Promise<CustomRoleRecord[]>;
  createSiemWebhook(input: {
    organizationId: string;
    url: string;
    secret: string;
    secretCiphertext: string;
    enabled: boolean;
  }): Promise<SiemWebhookRecord>;
  listSiemWebhooks(organizationId: string): Promise<SiemWebhookRecord[]>;
  createApiKey(input: {
    userId?: string;
    organizationId?: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    scopes: ApiKeyScope[];
    expiresAt?: Date;
  }): Promise<ApiKeyRecord>;
  listApiKeys(scope: { userId?: string; organizationId?: string }): Promise<ApiKeyRecord[]>;
  findApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | undefined>;
  touchApiKey(id: string): Promise<void>;
  deleteApiKey(input: { id: string; userId?: string; organizationId?: string }): Promise<boolean>;
  createOrganizationInvite(input: {
    organizationId: string;
    email: string;
    roleKey: string;
    token: string;
    expiresAt: Date;
  }): Promise<OrganizationInviteRecord>;
  findOrganizationInviteByToken(token: string): Promise<OrganizationInviteRecord | undefined>;
  consumeOrganizationInvite(token: string, userId: string): Promise<OrganizationInviteRecord | undefined>;
  listOrganizationInvites(organizationId: string): Promise<OrganizationInviteRecord[]>;
  resendOrganizationInvite(
    inviteId: string,
    token: string,
    expiresAt: Date,
  ): Promise<OrganizationInviteRecord | undefined>;
  expireOrganizationInvite(inviteId: string): Promise<OrganizationInviteRecord | undefined>;
  upsertOAuthConnection(input: {
    userId: string;
    provider: string;
    externalId: string;
    accessToken: string;
    refreshToken?: string;
  }): Promise<OAuthConnectionRecord>;
  listOAuthConnections(userId: string): Promise<OAuthConnectionRecord[]>;
  upsertUserConnection(input: {
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
  }): Promise<UserConnectionRecord>;
  getUserConnectionById(id: string): Promise<UserConnectionRecord | undefined>;
  listUserConnectionsByUser(userId: string, opts?: { provider?: string }): Promise<UserConnectionRecord[]>;
  markUserConnectionStatus(input: {
    id: string;
    status: UserConnectionStatus;
    revokedAt?: Date;
    clearTokens?: boolean;
  }): Promise<UserConnectionRecord | undefined>;
  linkProjectToUserConnection(input: {
    projectId: string;
    userConnectionId: string;
    linkedByUserId: string;
  }): Promise<ProjectConnectionLinkRecord>;
  unlinkProjectFromUserConnection(input: {
    projectId: string;
    userConnectionId: string;
  }): Promise<ProjectConnectionLinkRecord | undefined>;
  listProjectConnectionLinks(
    projectId: string,
    opts?: { includeUnlinked?: boolean },
  ): Promise<ProjectConnectionLinkRecord[]>;
  createAiConversation(input: { projectId?: string; userId: string; title?: string }): Promise<AiConversationRecord>;
  getAiConversation(id: string): Promise<AiConversationRecord | undefined>;
  listAiConversations(input: { projectId: string; userId: string; limit?: number }): Promise<AiConversationRecord[]>;
  createAiMessage(input: {
    id?: string;
    conversationId: string;
    role: AiMessageRecord['role'];
    content: string;
  }): Promise<AiMessageRecord>;
  listAiMessages(conversationId: string): Promise<AiMessageRecord[]>;
  createAiToolCall(input: {
    messageId: string;
    name: string;
    input?: unknown;
    output?: unknown;
  }): Promise<AiToolCallRecord>;
  listAiToolCallsByMessageIds(messageIds: string[]): Promise<AiToolCallRecord[]>;
  createAiTokenUsage(input: {
    messageId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
  }): Promise<AiTokenUsageRecord>;
  recordAiCost(input: {
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
  }): Promise<AiCostLedgerRecord>;
  listAiCosts(organizationId: string, range?: { from?: string; to?: string }): Promise<AiCostLedgerRecord[]>;

  // --- Replit-parity: credit wallet (dormant until BILLING_CREDITS_ENABLED) ---
  getCreditWallet(organizationId: string): Promise<CreditWalletRecord | undefined>;
  ensureCreditWallet(organizationId: string): Promise<CreditWalletRecord>;
  updateCreditWalletSettings(input: {
    organizationId: string;
    budgetCapCents?: number | null;
    serviceShutdownCents?: number | null;
    autoTopupCents?: number | null;
  }): Promise<CreditWalletRecord>;
  /**
   * Atomically append a ledger entry and move the materialized wallet balance by
   * the same delta. Returns the new entry and the post-mutation balance.
   */
  recordCreditEntry(input: {
    organizationId: string;
    deltaCents: number;
    kind: CreditEntryKind;
    reason: string;
    checkpointId?: string;
    expiresAt?: Date;
    metadata?: unknown;
  }): Promise<{ entry: CreditLedgerRecord; balanceCents: number }>;
  listCreditLedger(organizationId: string, options?: { take?: number }): Promise<CreditLedgerRecord[]>;
  /**
   * Total usage-based (PAYG) spend in cents since `sinceMs` — sums the absolute
   * value of PAYG_CHARGE ledger entries. Drives the 50/80/100% spend alerts
   * (dormant until BILLING_CREDITS_ENABLED).
   */
  sumPaygSpendSince(organizationId: string, sinceMs: number): Promise<number>;
  /**
   * Record a PAYG overage as a tracking-only PAYG_CHARGE ledger entry (negative
   * deltaCents) WITHOUT touching the wallet balance — the overage is billed to
   * Stripe, not the credit wallet. Deduped by checkpointId. This is what makes
   * sumPaygSpendSince() (budget caps + spend alerts) non-zero.
   */
  recordPaygCharge(input: { organizationId: string; checkpointId: string; cents: number }): Promise<void>;
  /** Persist the spend-alert de-dup marker (highest rung sent this period). */
  markSpendAlert(input: { organizationId: string; pct: number; periodStartMs: number }): Promise<void>;

  // --- Replit-parity: credit packs (6-mo expiry, earliest-first) ---------------
  createCreditPack(input: {
    organizationId: string;
    purchasedCents: number;
    expiresAt: Date;
    stripePaymentIntentId?: string;
  }): Promise<CreditPackRecord>;
  listCreditPacks(organizationId: string, options?: { activeOnly?: boolean }): Promise<CreditPackRecord[]>;
  decrementCreditPack(input: { id: string; cents: number }): Promise<CreditPackRecord>;

  // --- Replit-parity: effort-based checkpoints --------------------------------
  createAgentCheckpoint(input: {
    organizationId: string;
    userId?: string;
    projectId?: string;
    conversationId?: string;
    runId?: string;
    highPowerModel?: boolean;
    extendedThinking?: boolean;
    buildTier?: string;
    turboMode?: boolean;
  }): Promise<AgentCheckpointRecord>;
  completeAgentCheckpoint(input: {
    id: string;
    status: CheckpointStatus;
    inputTokens?: number;
    outputTokens?: number;
    wallMs?: number;
    computeCents?: number;
    rawProviderCents?: number;
    creditCents?: number;
  }): Promise<AgentCheckpointRecord>;
  getAgentCheckpoint(id: string): Promise<AgentCheckpointRecord | undefined>;
  listAgentCheckpoints(organizationId: string, options?: { take?: number }): Promise<AgentCheckpointRecord[]>;

  // --- Replit-parity: admin-owned provider/model registry ---------------------
  listProviderConfigs(): Promise<ProviderConfigRecord[]>;
  upsertProviderConfig(input: {
    provider: string;
    displayName: string;
    enabled?: boolean;
    apiKeySecret?: string;
    baseUrl?: string;
    byokAllowed?: boolean;
  }): Promise<ProviderConfigRecord>;
  getConnectorOAuthCatalog(provider: string): Promise<{
    provider: string;
    displayName: string;
    authType: string;
    enabled: boolean;
    clientId: string | null;
    clientSecretEnc: string | null;
    scopes: string[];
    authorizeUrl: string | null;
  } | null>;
  upsertConnectorOAuthConfig(input: {
    provider: string;
    clientId?: string | null;
    clientSecretEnc?: string | null;
    enabled?: boolean;
  }): Promise<{ provider: string; enabled: boolean; clientId: string | null; hasSecret: boolean }>;
  listModelConfigs(options?: { enabledOnly?: boolean }): Promise<ModelConfigRecord[]>;
  // Admin-wide listings for the supervision console.
  listAdminCreditWallets(): Promise<CreditWalletRecord[]>;
  listAdminAgentCheckpoints(options?: { take?: number }): Promise<AgentCheckpointRecord[]>;
  upsertModelConfig(input: {
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
  }): Promise<ModelConfigRecord>;

  upsertBillingPlan(input: {
    key: PlanKey;
    name: string;
    monthlyCents: number;
    limits: Record<string, number>;
    stripeProductId?: string;
    stripePriceId?: string;
    stripePriceMonthlyId?: string;
    stripePriceAnnualId?: string;
  }): Promise<BillingPlanRecord>;
  listBillingPlans(): Promise<BillingPlanRecord[]>;
  getBillingPlan(key: PlanKey): Promise<BillingPlanRecord | undefined>;
  upsertBillingCustomer(input: {
    organizationId: string;
    provider: string;
    externalId: string;
  }): Promise<BillingCustomerRecord>;
  getBillingCustomer(organizationId: string): Promise<BillingCustomerRecord | undefined>;
  findOrganizationIdByBillingCustomer(provider: string, externalId: string): Promise<string | undefined>;
  findOrganizationIdBySubscriptionExternalId(externalId: string): Promise<string | undefined>;
  upsertSubscription(input: {
    organizationId: string;
    planKey: PlanKey;
    externalId?: string;
    status: SubscriptionRecord['status'];
    cancelAtPeriodEnd?: boolean;
    trialEndsAt?: Date;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    lastStripeEventAt?: Date;
  }): Promise<SubscriptionRecord>;
  getSubscription(organizationId: string): Promise<SubscriptionRecord | undefined>;
  listAdminSubscriptions(): Promise<SubscriptionRecord[]>;
  recordUsageEvent(input: {
    organizationId: string;
    userId?: string;
    type: string;
    quantity?: number;
    metadata?: unknown;
  }): Promise<UsageEventRecord>;
  listUsageEvents(organizationId: string, options?: { take?: number }): Promise<UsageEventRecord[]>;
  sumUsage(organizationId: string, type: string, since?: Date): Promise<number>;
  createQuotaOverride(input: {
    organizationId: string;
    key: QuotaKey;
    limit: number;
    reason: string;
    createdByUserId?: string;
    expiresAt?: Date;
  }): Promise<QuotaOverrideRecord>;
  listQuotaOverrides(organizationId: string): Promise<QuotaOverrideRecord[]>;
  getQuotaOverride(organizationId: string, key: QuotaKey): Promise<QuotaOverrideRecord | undefined>;
  recordStripeEvent(input: {
    id: string;
    organizationId?: string;
    type: string;
    payload: unknown;
  }): Promise<{ event: StripeEventRecord; created: boolean }>;
  deleteStripeEvent(id: string): Promise<void>;

  /**
   * Record a consumed SAML assertion id for one-time-use replay protection.
   * Returns created:false when this (org, assertionId) was already consumed.
   */
  recordSamlAssertionConsumption(input: {
    organizationId: string;
    assertionId: string;
    expiresAt: Date;
  }): Promise<{ created: boolean }>;
  recordEmailDeliveryEvent(input: {
    provider: string;
    providerEventId: string;
    type: string;
    email: string;
    emailMessageId?: string;
    subject?: string;
    fromAddress?: string;
    payload: unknown;
  }): Promise<{ event: EmailDeliveryEventRecord; created: boolean }>;
  listEmailDeliveryEvents(filter?: {
    email?: string;
    type?: string;
    emailMessageId?: string;
    limit?: number;
  }): Promise<EmailDeliveryEventRecord[]>;
  recordAudit(event: AuditEvent): Promise<void>;
  listAuditLogs(organizationId?: string): Promise<AuditEvent[]>;
  listAdminUsers(): Promise<UserRecord[]>;
  listAdminOrganizations(): Promise<OrganizationRecord[]>;
  listAdminProjects(): Promise<ProjectRecord[]>;
  listAdminWorkspaces(): Promise<WorkspaceRecord[]>;
  listAdminDeployments(): Promise<DeploymentRecord[]>;
  listAdminSupportTickets(): Promise<SupportTicketRecord[]>;
  listAdminUsageEvents(): Promise<UsageEventRecord[]>;
  listAdminAiCosts(): Promise<AiCostLedgerRecord[]>;
  updateWorkspaceStatus(input: { workspaceId: string; status: WorkspaceRecord['status'] }): Promise<WorkspaceRecord>;
  updateSupportTicket(input: {
    ticketId: string;
    status: SupportTicketRecord['status'];
    response?: string;
  }): Promise<SupportTicketRecord>;
  updateAbuseEvent(input: { abuseEventId: string; resolved?: boolean }): Promise<AbuseEventRecord>;
  recordAdminAudit(event: AdminAuditLogRecord): Promise<void>;
  listAdminAuditLogs(): Promise<AdminAuditLogRecord[]>;

  /**
   * Redact PII from stored {@link AuditLog} rows matching the given selector:
   * nulls the `ipAddress` and replaces `metadata` with a redaction tombstone.
   * At least one selector (organizationId or actorUserId) must be supplied so a
   * caller cannot wipe the entire audit trail; `before` further bounds it to
   * rows created strictly before that instant. Returns the number of rows
   * actually redacted (idempotent — already-redacted rows are skipped).
   */
  redactAuditLogs(input: {
    organizationId?: string;
    actorUserId?: string;
    before?: string;
  }): Promise<{ redacted: number }>;
}

export function permissionsForRole(roleKey: string): PermissionKey[] {
  return rolePermissions[roleKey] ?? [];
}
