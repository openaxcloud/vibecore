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

export type RuntimeWebSocketEndpoint = 'commands/stream' | 'terminal' | 'logs' | 'files/watch' | 'ports/watch';

export interface RuntimeWebSocketTicketRecord {
  id: string;
  tokenHash: string;
  userId: string;
  /** Exact :workspaceId URL segment the browser must present. */
  workspaceId: string;
  /** Authoritative project resolved during ticket issuance. */
  projectId: string;
  /** Authoritative runtime workspace resolved during ticket issuance. */
  resolvedWorkspaceId: string;
  endpoint: RuntimeWebSocketEndpoint;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
}

export interface OrganizationRecord {
  id: string;
  slug: string;
  name: string;
  createdAt: string;

  /** Optional CC address for billing notifications. */
  billingEmail?: string;
}

export interface MembershipRecord {
  id: string;
  organizationId: string;
  userId: string;
  roleKey: string;
  /**
   * Human-readable identity of the member, populated by listMembers (which joins
   * the user row). Undefined on the single-record add/get paths that don't join.
   * The members UI displays these instead of the opaque userId.
   */
  userName?: string;
  userEmail?: string;
}

export interface ProjectRecord {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  sourceType:
    | 'blank'
    | 'template'
    | 'ai'
    | 'github'
    | 'gitlab'
    | 'bitbucket'
    | 'zip'
    | 'vercel'
    | 'figma'
    | 'claude'
    | 'duplicate';
  templateName?: string;
  gitRepositoryUrl?: string;
  gitDefaultBranch?: string;
  persistentVolumeClaim: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;

  /** Number of deployment records; drives the Deployed/Draft project filters. */
  deploymentCount?: number;
}

export interface ImportStagedFile {
  path: string;
  content: string;
  encoding?: string;
}

export interface ImportCreditReservationRecord {
  key: string;
  organizationId: string;
  importJobId: string;
  reservedCredits: number;
  debitedCredits: number;
  state: 'RESERVED' | 'SETTLED' | 'COMPENSATED';
  version: number;
}

export interface ImportJobRecord {
  id: string;
  organizationId: string;
  actorUserId?: string;
  provider: string;
  state: string;
  sourceRef?: string;
  idempotencyKey: string;
  requestHash: string;
  findings?: unknown;
  consent?: unknown;
  targetProjectId?: string;
  stagedFileCount: number;
  redactedCount: number;
  creditsReserved: boolean;
  version: number;
  /** Internal fencing fields. HTTP handlers must never return these. */
  operationToken?: string;
  operationExpiresAt?: string;
  cleanupTerminalState?: string;
  error?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportJobTransitionPatch {
  sourceRef?: string;
  findings?: unknown;
  consent?: unknown;
  targetProjectId?: string | null;
  stagedFiles?: ImportStagedFile[];
  connectorPreview?: unknown;
  stagedFileCount?: number;
  redactedCount?: number;
  creditsReserved?: boolean;
  operationToken?: string | null;
  operationExpiresAt?: string | null;
  cleanupTerminalState?: string | null;
  error?: string | null;
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
  /** P2d dev/prod split: 'development' (default) or 'production' (publish checkout). */
  environment?: string;
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
  /**
   * AI conversation this snapshot belongs to, when it was taken as a
   * "before-ai-change" snapshot during a tool call. NULL for manual/legacy rows.
   * Together with turnIndex this lets the IDE pair a chat checkpoint to the exact
   * snapshot representing the state before that turn — never by array position.
   */
  conversationId?: string;
  /**
   * Assistant-turn ordinal within {@link conversationId} at the time the snapshot
   * was taken. The first snapshot of a turn shares the smallest createdAt.
   */
  turnIndex?: number;
  createdAt: string;
}

export interface GalleryListingRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status: string;
  featured: boolean;
  sourceProjectId: string;
  /** Immutable ProjectSnapshot id the clone reproduces. */
  sourceSnapshotId: string;
  authorName: string;
  authorUserId?: string;
  appUrl?: string;
  /** Card preview image (real rendered screenshot): root-relative asset or https URL. */
  thumbnailUrl?: string;
  /** Curation gate: false = view-only listing, remix refused (P0-V3-05). */
  remixAllowed: boolean;
  /** Declared license id (e.g. SPDX "MIT"); undefined = none declared. */
  licenseId?: string;
  /** Versioned license text snapshot captured at curation. */
  licenseText?: string;
  /** sha256 pin of licenseText — what a RemixJob records as accepted. */
  licenseTextSha256?: string;
  /** Author's explicit versioned PII consent; undefined = PII masked on remix. */
  piiConsentVersion?: string;
  /**
   * Trace auditable des confirmations exigées à la curation (P0-V3-05,
   * réserve #8) : quand, et par quel admin. undefined = jamais confirmé.
   */
  rightsConfirmedAt?: Date;
  rightsConfirmedBy?: string;
  piiPolicyAcceptedAt?: Date;
  piiPolicyAcceptedBy?: string;
  viewCount: number;
  useCount: number;
  createdAt: string;
  publishedAt?: string;
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
  /** P2d dev/prod split — which environment this instance backs. */
  environment: 'development' | 'production';
  status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'FAILED' | 'DELETED';
  engine: string;
  region?: string;
  sizeBytes: number;
  retentionDays: number;
  pitrEnabled: boolean;
  provisioningDeadlineAt?: string;
  lastErrorCode?: string;
  lastErrorAt?: string;
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

/**
 * Deployment scope an environment variable applies to. A single key can carry a
 * different value per scope (e.g. a development vs production DATABASE_URL).
 * "production" is the default so rows written before scopes existed keep working.
 */
export type EnvVarScope = 'development' | 'preview' | 'production';

export const ENV_VAR_SCOPES: readonly EnvVarScope[] = ['development', 'preview', 'production'];

export const DEFAULT_ENV_VAR_SCOPE: EnvVarScope = 'production';

export interface ProjectEnvironmentRecord {
  id: string;
  projectId: string;
  key: string;
  value: string;
  scope: EnvVarScope;
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
  /** P2d: source deployment a production deployment was published from. */
  parentDeploymentId?: string;
  /** Replit-parity deploy metering idempotency marker (ISO); set once metered. */
  lastMeteredAt?: string;
  /** Rate-card machine size key picked at publish (server deploys). */
  machineSize?: string;
  startedAt?: string;
  finishedAt?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * P0-V3-08 rollback manifest: an immutable record of one published release. See
 * the schema model for the durability/fail-closed contract. `version` is monotonic
 * per (projectId, environment) so N-1 is unambiguous.
 */
export interface ReleaseManifestRecord {
  id: string;
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
  createdAt: string;
}

export interface SupportTicketRecord {
  id: string;
  organizationId: string;
  userId: string;
  subject: string;
  status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';

  /** Free-form category key (persisted in the metadata JSON column). */
  category?: string;
  createdAt: string;

  /** Platform-admin user this ticket is assigned to (admin console triage). */
  assigneeUserId?: string;

  /**
   * When the FIRST admin response was sent (ISO). Unset until an admin
   * responds; drives the first-response SLA state in the admin console.
   */
  firstResponseAt?: string;
}

/** I25: one message in a support ticket's conversation thread. */
export interface TicketMessageRecord {
  id: string;
  ticketId: string;
  authorType: 'USER' | 'ADMIN' | 'SYSTEM';
  authorUserId?: string;
  body: string;
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

/** F23: mutable resolution overlay for a derived security event (keyed by AuditLog id). */
export interface SecurityEventResolutionRecord {
  id: string;
  auditLogId: string;
  resolved: boolean;
  note?: string;
  resolvedByUserId?: string;
  resolvedAt: string;
  createdAt: string;
}

export interface AbuseEventRecord {
  id: string;
  organizationId?: string;
  userId?: string;
  type: string;
  severity: string;
  createdAt: string;
  /** Resolution state (F22): stored in metadata. */
  resolved?: boolean;
  /** Disposition applied by an operator: 'dismissed' | 'warned' | 'suspended'. */
  disposition?: string;
  resolvedAt?: string;
}

export interface IntegrationFeatureRequestRecord {
  id: string;
  userId: string;
  organizationId?: string;
  integrationName: string;
  useCaseDescription: string;
  status: string;
  createdAt: string;
}

export type AiMessageFeedbackVote = 'up' | 'down';

export interface AiMessageFeedbackRecord {
  id: string;
  userId: string;
  /**
   * Client-side chat message id. Standalone chats keep their transcript in
   * browser IndexedDB and never persist an AiMessage row, so this is a plain
   * string rather than an AiMessage foreign key.
   */
  messageId: string;
  chatId?: string;
  vote: AiMessageFeedbackVote;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  category: string;
  title: string;
  body?: string;
  messageKey?: string;
  messageParams?: Record<string, unknown>;
  linkUrl?: string;
  metadata?: Record<string, unknown>;
  readAt?: string;
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
  /** When true, non-owner members must sign in via SSO once the grace window elapses. */
  ssoEnforced: boolean;
  /** ISO timestamp the enforcement clock started; the 7-day grace is measured from here. Null when not enforced. */
  ssoEnforcedAt?: string | null;
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

  // F16 — internal dual-valid rotation state (never exposed by the endpoints).
  previousTokenHash?: string;
  rotatedAt?: string;
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
  lastDeliveredId?: string;
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

/**
 * Raised by the background token-health sweep (services/worker) or the
 * connector-proxy resolver when a stored UserConnection credential is found to
 * be revoked/expired, so the owning user can be prompted to reconnect. Surfaced
 * read-only on the connected-accounts page; the user resolves it by reconnecting
 * or dismissing.
 */
export interface ReconnectionAlertRecord {
  id: string;
  userConnectionId: string;
  reason: string;
  detectedAt: string;
  resolvedAt?: string;
  notifiedAt?: string;
  /** Denormalised from the related UserConnection for the user-facing list. */
  provider: string;
  externalAccountLabel: string;
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

export interface UserSpendLimitRecord {
  id: string;
  organizationId: string;
  userId: string;
  limitCents: number;
  createdAt: string;
  updatedAt: string;
}

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

  /*
   * Encrypted (encryptJson) platform API key for this provider, or undefined when
   * none is set. WRITE-ONLY at the API boundary: never returned to the browser —
   * only decrypted server-side by the runtime resolver. Distinct from
   * `apiKeySecret` (which holds only the NAME of a secret).
   */
  apiKeyEnc?: string;
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

export type AgentRepairOutcome = 'repaired' | 'failed' | 'gave_up';

/** One append-only entry in the agent self-repair history (IDE review UI). */
export interface AgentRepairEventRecord {
  id: string;
  projectId: string;
  messageId?: string;
  artifactId?: string;
  actionId?: string;
  relativePath: string;
  attempt: number;
  outcome: AgentRepairOutcome;
  validationError?: string;
  repairError?: string;
  createdAt: string;
}

/** Consensus algorithm used to consolidate a multi-agent run (mirrors the ConsensusAlgorithm enum). */
export type ConsensusRecordAlgorithm = 'QUORUM' | 'BYZANTINE_PBFT' | 'WEIGHTED_PLURALITY';

/** Outcome of a multi-agent consensus round (mirrors the ConsensusOutcome enum). */
export type ConsensusRecordOutcome = 'ACCEPTED' | 'REJECTED' | 'PARTIAL' | 'ABSTAINED';

/**
 * A read-only projection of one persisted multi-agent ConsensusRecord, joined to
 * its parent AgentRun so the read path can scope by the run's projectId. Populated
 * by the ai-gateway; surfaced (read-only) in the Agent Studio panel.
 */
export interface ConsensusRecordSummary {
  id: string;
  runId: string;
  algorithm: ConsensusRecordAlgorithm;
  threshold: number;
  outcome: ConsensusRecordOutcome;
  agreementScore: number;
  roundCount: number;
  durationMs: number;
  createdAt: string;
}

/**
 * One agent's stance on a single claim in the consensus vote. `supporters`,
 * `dissenters` and `abstainers` are the specialist lane ids (architect,
 * frontend, backend, devops, qa) — the actual per-agent vote the ai-gateway
 * recorded. Shapes mirror the ai-gateway ConsensusOutput persisted as JSON.
 */
export interface ConsensusClaimVote {
  claim: string;
  type: string;
  supporters: string[];
  dissenters: string[];
  abstainers: string[];
  agreementRatio: number;
  decision: string;
}

export interface ConsensusConflict {
  type: string;
  description: string;
  involvedRoles: string[];
  severity: string;
}

export interface ConsensusConsolidated {
  summary: string;
  acceptedRisks: string[];
  acceptedVerification: string[];
  acceptedFiles: string[];
  rejectedClaims: Array<{ claim: string; type: string }>;
  perRoleSummaries: Array<{ roleId: string; summary: string; status: string }>;
}

/**
 * The full ConsensusRecord — the SUMMARY plus the persisted per-agent vote
 * (`claimVotes`), inter-lane `conflicts`, and the `consolidated` merged result.
 * Read-only; powers the expanded vote view in the Agent Studio panel.
 */
export interface ConsensusRecordDetail extends ConsensusRecordSummary {
  claimVotes: ConsensusClaimVote[];
  conflicts: ConsensusConflict[];
  consolidated: ConsensusConsolidated | null;
}

/** A per-project Skills override row (absent => the skill is at its catalog default). */
export interface ProjectSkillOverrideRecord {
  skillId: string;
  enabled: boolean;
  updatedAt: string;
}

/** Scope target for an installed GitHub-repo skill (F#27). */
export type InstalledSkillScope = 'project' | 'workspace';

/** A security-audit finding attached to an installed skill (RPL-SK-001.3). */
export interface SkillAuditFinding {
  code: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  detail: string;
  location: string;
  evidence: string;
}

/** A bundled resource ref for progressive disclosure (RPL-SK-001.2). */
export interface SkillResourceRecord {
  path: string;
  kind: 'reference' | 'script' | 'asset' | 'other';
  bytes: number;
}

export type SkillAuditVerdict = 'approved' | 'quarantined' | 'rejected';

/** An installed GitHub-repo / interop skill row (F#27 + RPL-SK-001). */
export interface InstalledSkillRecord {
  id: string;
  scope: InstalledSkillScope;
  scopeId: string;
  ownerRepo: string;
  name: string;
  description: string;
  instructions: string;
  homepageUrl: string | null;
  enabled: boolean;
  installedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  // RPL-SK-001.3/.4 provenance + audit + revoke.
  origin: string;
  contentHash: string | null;
  auditVerdict: SkillAuditVerdict | null;
  auditFindings: SkillAuditFinding[];
  auditedAt: string | null;
  manifestName: string | null;
  resources: SkillResourceRecord[];
  revokedAt: string | null;
  revokedByUserId: string | null;
  revokeReason: string | null;
}

export interface InstallSkillInput {
  scope: InstalledSkillScope;
  scopeId: string;
  ownerRepo: string;
  name: string;
  description: string;
  instructions: string;
  homepageUrl?: string | null;
  installedByUserId?: string | null;
  // RPL-SK-001 install-time provenance + audit outcome.
  origin?: string;
  enabled?: boolean;
  contentHash?: string | null;
  auditVerdict?: SkillAuditVerdict | null;
  auditFindings?: SkillAuditFinding[];
  auditedAt?: string | null;
  manifestName?: string | null;
  resources?: SkillResourceRecord[];
}

/** A row in the append-only skill audit journal (RPL-SK-001.3). */
export interface SkillAuditEventRecord {
  id: string;
  scope: InstalledSkillScope;
  scopeId: string;
  ownerRepo: string;
  action: string;
  verdict: SkillAuditVerdict | null;
  findings: SkillAuditFinding[];
  contentHash: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface RecordSkillAuditInput {
  scope: InstalledSkillScope;
  scopeId: string;
  ownerRepo: string;
  action: string;
  verdict?: SkillAuditVerdict | null;
  findings?: SkillAuditFinding[];
  contentHash?: string | null;
  actorUserId?: string | null;
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

/*
 * A Stripe webhook whose processing threw. Keeps the full event payload so an
 * admin replay can re-run the exact same processing path (E28).
 */
export interface StripeWebhookFailureRecord {
  id: string;
  eventId: string;
  type: string;
  payload: unknown;
  attempts: number;
  lastError: string;
  failedAt: string;
  resolvedAt?: string;
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

export interface ContactRequestRecord {
  id: string;
  email: string;
  name?: string;
  company: string;
  teamSize?: string;
  message: string;
  pagePath?: string;
  createdAt: string;
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
    language?: string;
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
  createRuntimeWebSocketTicket(input: {
    tokenHash: string;
    userId: string;
    workspaceId: string;
    projectId: string;
    resolvedWorkspaceId: string;
    endpoint: RuntimeWebSocketEndpoint;
    /** Relative lifetime; the durable store evaluates it from its own clock. */
    ttlMs: number;
  }): Promise<RuntimeWebSocketTicketRecord>;
  /**
   * Atomically claim a live ticket bound to the exact workspace + endpoint.
   * Exactly one concurrent caller can receive the row; expiry and replay fail
   * closed with `undefined`.
   */
  consumeRuntimeWebSocketTicket(input: {
    tokenHash: string;
    workspaceId: string;
    endpoint: RuntimeWebSocketEndpoint;
  }): Promise<RuntimeWebSocketTicketRecord | undefined>;
  createEmailVerification(input: { userId: string; token: string; expiresAt: Date; email?: string }): Promise<void>;
  consumeEmailVerification(token: string): Promise<UserRecord | undefined>;
  createPasswordReset(input: { userId: string; token: string; expiresAt: Date }): Promise<void>;
  consumePasswordReset(token: string, passwordHash: string): Promise<UserRecord | undefined>;
  setRecoveryCodes(userId: string, codeHashes: string[]): Promise<RecoveryCodeRecord[]>;
  consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean>;
  countUnusedRecoveryCodes(userId: string): Promise<number>;
  createOrganization(input: { name: string; slug: string; ownerUserId: string }): Promise<OrganizationRecord>;
  listOrganizations(userId: string): Promise<OrganizationRecord[]>;
  getOrganization(id: string): Promise<OrganizationRecord | undefined>;
  setOrganizationBillingEmail(organizationId: string, email: string | null): Promise<OrganizationRecord>;
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

  /**
   * F13: change a project's slug and persist a redirect from the old slug so the
   * previous canonical URL keeps resolving for `redirectTtlDays` (default 30).
   * Throws `{ statusCode: 409, code: 'PROJECT_SLUG_TAKEN' }` when another project
   * in the same org already owns `newSlug`. A no-op (same slug) returns the
   * project unchanged without minting a redirect.
   */
  renameProjectSlug(input: { projectId: string; newSlug: string; redirectTtlDays?: number }): Promise<ProjectRecord>;

  /**
   * F13: resolve a project by an old slug via a non-expired ProjectSlugRedirect,
   * scoped to the org slug. Returns the (renamed) project so callers can 301 to
   * its current canonical URL, or undefined when there is no live redirect.
   */
  resolveProjectSlugRedirect(input: {
    organizationSlug: string;
    oldSlug: string;
    now?: Date;
  }): Promise<ProjectRecord | undefined>;
  listProjects(organizationId: string, options?: { includeArchived?: boolean }): Promise<ProjectRecord[]>;

  /**
   * Idempotent public newsletter opt-in: creates the subscriber, re-activates a
   * previously-unsubscribed address, and reports an already-active one.
   */
  subscribeNewsletter(input: { email: string; source?: string }): Promise<{ alreadySubscribed: boolean }>;

  /**
   * Persist a contact lead from the public /contact-sales or /contact forms
   * (general-contact messages carry their routing topic in `company`). The
   * returned record's id doubles as the reference number quoted back to the
   * prospect (first 8 chars, uppercased).
   */
  createContactRequest(input: {
    email: string;
    name?: string;
    company: string;
    teamSize?: string;
    message: string;
    pagePath?: string;
  }): Promise<ContactRequestRecord>;
  countProjects(organizationId: string, options?: { since?: Date }): Promise<number>;
  /** Active moderation strikes across every current organization member. */
  countOrganizationActiveStrikes(organizationId: string, nowMs: number): Promise<number>;
  /**
   * Authoritative count used for tenant demotion. Implementations must inspect
   * every high/critical event in the window; a display-list `take` cap is not a
   * security boundary and would let newer low-severity rows bury an incident.
   */
  countRecentSevereAbuseEvents(organizationId: string, since: Date): Promise<number>;
  softDeleteProject(projectId: string): Promise<ProjectRecord>;
  restoreProject(projectId: string): Promise<ProjectRecord>;

  /**
   * Permanently removes the project row (child relations cascade at the DB
   * level). Backs the explicit card "Delete" action — distinct from
   * softDeleteProject, which is the recoverable "Archive" state.
   */
  hardDeleteProject(projectId: string): Promise<ProjectRecord>;
  transferProject(input: { projectId: string; targetOrganizationId: string }): Promise<ProjectRecord>;
  duplicateProject(input: {
    projectId: string;
    name: string;
    slug: string;
    /** Target org for the clone. Defaults to the source project's org. */
    organizationId?: string;
  }): Promise<ProjectRecord>;
  createProjectTemplate(input: {
    sourceProjectId: string;
    organizationId: string;
    name: string;
    description?: string;
  }): Promise<ProjectTemplateRecord>;
  listProjectTemplates(organizationId: string): Promise<ProjectTemplateRecord[]>;
  upsertProjectEnvVar(input: {
    projectId: string;
    key: string;
    value: string;
    scope?: EnvVarScope;
  }): Promise<ProjectEnvironmentRecord>;
  listProjectEnvVars(projectId: string): Promise<ProjectEnvironmentRecord[]>;
  deleteProjectEnvVar(
    projectId: string,
    key: string,
    scope?: EnvVarScope,
  ): Promise<ProjectEnvironmentRecord | undefined>;
  upsertProjectSecret(input: { projectId: string; key: string; valueEncrypted: string }): Promise<ProjectSecretRecord>;
  listProjectSecrets(projectId: string): Promise<Array<Omit<ProjectSecretRecord, 'valueEncrypted'>>>;
  getProjectSecret(projectId: string, key: string): Promise<ProjectSecretRecord | undefined>;
  /** Create a remix-job row (state machine + audit of the secure fork pipeline). */
  createRemixJob(input: {
    sourceProjectId: string;
    organizationId: string;
    actorUserId?: string;
    storagePolicy: string;
    /** Immutable release pin (ProjectSnapshot id) the clone reproduces. */
    sourceSnapshotId?: string;
    /** The gallery listing the remix was launched from (provenance). */
    sourceListingId?: string;
    /** Versioned license captured at remix time (immutable on the job). */
    licenseSnapshot?: unknown;
    /** Consent-text version the remixer explicitly accepted. */
    consentVersion?: string;
  }): Promise<{ id: string; state: string }>;
  /** Advance / annotate a remix job. Partial patch. */
  updateRemixJob(
    id: string,
    patch: {
      state?: string;
      targetProjectId?: string;
      detachedKeys?: unknown;
      scanFindings?: unknown;
      scrubbedCount?: number;
      dbForked?: boolean;
      error?: string;
      sourceSnapshotId?: string;
      sourceListingId?: string;
      piiFindings?: unknown;
      piiMaskedCount?: number;
    },
  ): Promise<void>;
  getRemixJob(id: string): Promise<
    | {
        id: string;
        sourceProjectId: string;
        targetProjectId?: string;
        organizationId: string;
        state: string;
        detachedKeys?: unknown;
        storagePolicy: string;
        scanFindings?: unknown;
        scrubbedCount: number;
        dbForked: boolean;
        error?: string;
        sourceSnapshotId?: string;
        sourceListingId?: string;
        licenseSnapshot?: unknown;
        consentVersion?: string;
        piiFindings?: unknown;
        piiMaskedCount: number;
        createdAt: string;
      }
    | undefined
  >;
  /** Create a curated Gallery listing (TPL-02). Not self-service — curator/seed. */
  createGalleryListing(input: {
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
    /** Trace auditable des confirmations de curation (P0-V3-05, réserve #8). */
    rightsConfirmedAt?: Date;
    rightsConfirmedBy?: string;
    piiPolicyAcceptedAt?: Date;
    piiPolicyAcceptedBy?: string;
    publishedAt?: string;
  }): Promise<GalleryListingRecord>;
  /** Browse published listings, filtered by category / free-text / featured. */
  listGalleryListings(opts?: {
    status?: string;
    category?: string;
    query?: string;
    featured?: boolean;
    limit?: number;
  }): Promise<GalleryListingRecord[]>;
  getGalleryListingBySlug(slug: string): Promise<GalleryListingRecord | undefined>;
  getGalleryListingById(id: string): Promise<GalleryListingRecord | undefined>;
  incrementGalleryListingViews(id: string): Promise<void>;
  incrementGalleryListingUses(id: string): Promise<void>;
  /**
   * Atomically create the tenant-scoped idempotency row and its credit hold.
   * A same-input replay returns the existing job; a reused key with a different
   * request hash fails closed with IMPORT_IDEMPOTENCY_CONFLICT.
   */
  createImportJob(input: {
    organizationId: string;
    actorUserId?: string;
    provider: string;
    sourceRef?: string;
    expiresAt?: string;
    idempotencyKey: string;
    requestHash: string;
    reservedCredits: number;
  }): Promise<{ job: ImportJobRecord; reservation: ImportCreditReservationRecord; replayed: boolean }>;

  /** Internal staging read. Never expose this record by spreading it into HTTP. */
  getImportStaging(
    id: string,
    organizationId: string,
  ): Promise<
    | {
        files: ImportStagedFile[];
        preview?: unknown;
      }
    | undefined
  >;

  /** Tenant-scoped observable reservation state. */
  getImportReservationByJob(
    importJobId: string,
    organizationId: string,
  ): Promise<ImportCreditReservationRecord | undefined>;

  /** Optimistic state transition. `undefined` means another replica won. */
  transitionImportJob(input: {
    id: string;
    organizationId: string;
    expectedVersion: number;
    expectedStates: string[];
    state: string;
    patch?: ImportJobTransitionPatch;
  }): Promise<ImportJobRecord | undefined>;

  /**
   * Under the COMMITTING fencing token, create the target Project and attach it
   * to the job in one PostgreSQL transaction. Replays return the same project.
   */
  createClaimedImportProject(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    name: string;
    slug: string;
    sourceType: ProjectRecord['sourceType'];
  }): Promise<ProjectRecord>;

  /** Atomically publish COMMITTED and SETTLED, disposing Json staging/preview. */
  finalizeImportCommit(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
    actualCredits: number;
  }): Promise<{ job: ImportJobRecord; reservation: ImportCreditReservationRecord } | undefined>;

  /** Move an owned/claimed job to durable cleanup and compensate in one tx. */
  beginImportCleanup(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
    terminalState: 'ROLLING_BACK' | 'EXPIRED' | 'FAILED';
    error?: string;
  }): Promise<ImportJobRecord | undefined>;

  /** Delete only the partial target fenced to this cleanup owner. */
  deleteClaimedImportProject(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }): Promise<boolean>;

  /** Publish cleanup completion only after storage + project deletion succeed. */
  finishImportCleanup(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
  }): Promise<ImportJobRecord | undefined>;

  /** Atomic, tenant-scoped cancellation + compensation. */
  cancelImportJob(importJobId: string, organizationId: string): Promise<ImportJobRecord | undefined>;

  getImportJob(id: string): Promise<ImportJobRecord | undefined>;
  /*
   * IMP-4 timeout sweeper: claim expired jobs with compare-and-swap. Jobs with a
   * partial target move to CLEANUP_PENDING so the caller can remove physical data
   * before publishing a terminal state; target-less jobs expire and compensate
   * atomically in storage.
   */
  reapExpiredImportJobs(nowIso: string): Promise<string[]>;
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
  /** Append an agent self-repair outcome to the durable history. */
  recordAgentRepairEvent(input: {
    projectId: string;
    messageId?: string;
    artifactId?: string;
    actionId?: string;
    relativePath: string;
    attempt?: number;
    outcome: AgentRepairOutcome;
    validationError?: string;
    repairError?: string;
  }): Promise<AgentRepairEventRecord>;
  /** List recent self-repair events for a project (newest first). */
  listAgentRepairEvents(projectId: string, options?: { take?: number }): Promise<AgentRepairEventRecord[]>;

  /**
   * List recent multi-agent consensus records for a project (newest first).
   * Scoped via the parent AgentRun.projectId so only the caller's project rows
   * are returned — never another tenant's consensus data.
   */
  listConsensusRecords(projectId: string, options?: { take?: number }): Promise<ConsensusRecordSummary[]>;
  getConsensusRecordDetail(projectId: string, runId: string): Promise<ConsensusRecordDetail | undefined>;
  /** Sparse per-project enable/disable overrides for the builtin Skills catalog. */
  listProjectSkillOverrides(projectId: string): Promise<ProjectSkillOverrideRecord[]>;
  setProjectSkillEnabled(input: {
    projectId: string;
    skillId: string;
    enabled: boolean;
  }): Promise<ProjectSkillOverrideRecord>;
  /** Installed GitHub-repo skills for a scope target (F#27), newest first. */
  listInstalledSkills(scope: InstalledSkillScope, scopeId: string): Promise<InstalledSkillRecord[]>;
  /**
   * Install (or return the existing) GitHub-repo skill for a scope target.
   * `created` is false when a row for (scope, scopeId, ownerRepo) already existed.
   */
  installSkill(input: InstallSkillInput): Promise<{ record: InstalledSkillRecord; created: boolean }>;
  /** Uninstall a GitHub-repo skill; resolves true when a row was removed. */
  uninstallSkill(scope: InstalledSkillScope, scopeId: string, ownerRepo: string): Promise<boolean>;
  /**
   * Toggle an installed skill's enabled flag; undefined when no such row. A
   * revoked or audit-rejected skill cannot be enabled — the store refuses it by
   * resolving to the unchanged (still-disabled) row, so enforcement is not
   * merely UI-side.
   */
  setInstalledSkillEnabled(input: {
    scope: InstalledSkillScope;
    scopeId: string;
    ownerRepo: string;
    enabled: boolean;
  }): Promise<InstalledSkillRecord | undefined>;
  /**
   * Revoke an installed skill (RPL-SK-001.4): hard-disable it and stamp
   * revokedAt/by/reason. The row stays for audit; it cannot be re-enabled until
   * re-installed. Undefined when no such row.
   */
  revokeSkill(input: {
    scope: InstalledSkillScope;
    scopeId: string;
    ownerRepo: string;
    revokedByUserId?: string | null;
    reason?: string | null;
  }): Promise<InstalledSkillRecord | undefined>;
  /** Append one immutable row to the skill audit journal (RPL-SK-001.3). */
  recordSkillAudit(input: RecordSkillAuditInput): Promise<SkillAuditEventRecord>;
  /** The audit journal for a scope target, newest first. */
  listSkillAuditEvents(
    scope: InstalledSkillScope,
    scopeId: string,
    options?: { ownerRepo?: string; limit?: number },
  ): Promise<SkillAuditEventRecord[]>;
  /** Live install counts per `owner/repo` across all scopes (for the catalog). */
  countInstallsByRepo(): Promise<Record<string, number>>;
  createWorkspace(input: {
    id?: string;
    projectId: string;
    name: string;
    runtimeMode: string;
    environment?: string;
    /** Non-running checkouts (for example production source trees) start STOPPED. */
    initialStatus?: WorkspaceRecord['status'];
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
  /**
   * Count an organization's concurrently-published apps — distinct projects with
   * a live (READY) production deployment. Used to enforce the Replit-parity
   * 20-app concurrency cap. `excludeProjectId` omits one project from the count
   * so re-publishing an already-published app does not count against itself.
   */
  countPublishedApps(organizationId: string, options?: { excludeProjectId?: string }): Promise<number>;
  /**
   * Projets PUBLIÉS de l'org, avec la date de publication la plus récente de
   * chacun. Le contrat Starter raisonne en « projets publiés ACTIFS » : il faut
   * donc l'identité du projet ET sa date (pour appliquer l'expiration à 30 j),
   * pas un simple compteur — un compteur ne permet ni de distinguer une
   * republication d'un 2e projet, ni d'ignorer les publications expirées.
   */
  listPublishedProjects(organizationId: string): Promise<Array<{ projectId: string; publishedAt: string }>>;
  /**
   * Déploiements candidats à l'extinction 30 j : PRODUCTION + READY, avec la
   * date et le plan de l'org. Nécessaire au balayage qui ARRÊTE réellement les
   * workloads expirés — un compteur ou un simple 410 ne suffisent pas.
   */
  listExpiryCandidateDeployments(options?: { take?: number }): Promise<
    Array<{
      id: string;
      projectId: string;
      organizationId?: string;
      provider: string;
      environmentName?: string;
      status: string;
      createdAt: string;
      planKey?: string;
      expiredAt?: string;
    }>
  >;
  createSnapshot(input: {
    projectId: string;
    label?: string;
    kind?: SnapshotRecord['kind'];
    manifest: unknown;
    storageKey?: string;
    byteLength?: number;
    createdByUserId?: string;
    conversationId?: string;
    turnIndex?: number;
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
  getDatabaseInstanceByProject(projectId: string, environment?: string): Promise<DatabaseInstanceRecord | undefined>;
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
    environment?: string;
    provisioningDeadlineAt?: string;
  }): Promise<DatabaseInstanceRecord>;
  /**
   * Atomically creates a provisioning row, or claims an existing FAILED row for
   * retry. A live PROVISIONING/ACTIVE/SUSPENDED row is returned without a claim.
   */
  acquireDatabaseProvisioning(input: {
    projectId: string;
    organizationId: string;
    retentionDays: number;
    region?: string;
    environment?: string;
    provisioningDeadlineAt: string;
  }): Promise<{ instance: DatabaseInstanceRecord; acquired: boolean; created: boolean }>;
  completeDatabaseProvisioning(
    id: string,
    connection: { projectId: string; key: string; valueEncrypted: string },
  ): Promise<DatabaseInstanceRecord | undefined>;
  failDatabaseProvisioning(
    id: string,
    input: { errorCode: string; failedAt: string; deadlineBefore?: string },
  ): Promise<DatabaseInstanceRecord | undefined>;
  updateDatabaseInstance(
    id: string,
    patch: Partial<
      Pick<
        DatabaseInstanceRecord,
        'status' | 'sizeBytes' | 'pitrEnabled' | 'region' | 'provisioningDeadlineAt' | 'lastErrorCode' | 'lastErrorAt'
      >
    >,
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
  listProvisioningDatabaseInstances(take?: number): Promise<DatabaseInstanceRecord[]>;
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
    parentDeploymentId?: string;
    machineSize?: string;
    startedAt?: string;
    finishedAt?: string;
    canceledAt?: string;
  }): Promise<DeploymentRecord>;
  getDeployment(projectId: string, deploymentId: string): Promise<DeploymentRecord | undefined>;
  getDeploymentOwnerStatus(deploymentId: string): Promise<
    | {
        projectId: string;
        status: string;
        projectDeletedAt: Date | string | null;
        /*
         * Nécessaires pour éteindre RÉELLEMENT une publication Starter expirée
         * dans le chemin de service : sans la date ET le plan, le serveur ne peut
         * que l'exclure d'un compteur — l'URL, elle, continuerait de répondre.
         */
        createdAt?: string;
        environmentName?: string;
        organizationId?: string;
        /** Plan de l'org, uniquement si l'abonnement est ACTIF. */
        planKey?: string;
      }
    | undefined
  >;
  updateDeployment(
    projectId: string,
    deploymentId: string,
    input: Partial<Omit<DeploymentRecord, 'id' | 'projectId' | 'createdAt'>>,
  ): Promise<DeploymentRecord>;
  listDeployments(projectId: string, options?: { take?: number }): Promise<DeploymentRecord[]>;
  /**
   * Deployments still in a non-terminal build state (QUEUED / BUILDING) whose
   * `updatedAt` is older than the given ISO cutoff. Drives the deploy reaper,
   * which fails builds orphaned by an api/worker crash so they never hang.
   */
  listStaleDeployments(cutoffIso: string): Promise<DeploymentRecord[]>;
  /**
   * READY server deployments (provider 'server') — the runtime-metering sweep
   * walks these to bill active machine time against their machineSize.
   */
  listActiveServerDeployments(): Promise<DeploymentRecord[]>;
  /**
   * P0-V3-08 rollback manifest. `createReleaseManifest` appends ONE immutable row
   * per successful publish, assigning the next monotonic `version` for
   * (projectId, environment) — call it under `withSerializedMutation` so two
   * concurrent publishes can't collide on the same version. `listReleaseManifests`
   * returns the history newest-first (version desc) so the rollback endpoint can
   * read [0]=current, [1]=previous(N-1).
   */
  createReleaseManifest(input: {
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
  }): Promise<ReleaseManifestRecord>;
  listReleaseManifests(
    projectId: string,
    environment: string,
    options?: { take?: number },
  ): Promise<ReleaseManifestRecord[]>;
  /**
   * The ACTIVE versioned Rate Card row (undefined when none is active — the
   * caller falls back to the built-in card). `data` is the serialized RateCard.
   */
  getActiveRateCard(): Promise<{ version: number; data: unknown } | undefined>;
  /**
   * The ACTIVE versioned Agent Routing Card row (undefined when none — the
   * caller falls back to the built-in card from packages/billing).
   */
  getActiveAgentRoutingCard(): Promise<{ version: number; data: unknown } | undefined>;
  /** Number of routing card versions stored (0 = seed the built-in v1). */
  countAgentRoutingCards(): Promise<number>;
  /** Raw insert used by the boot seed (does not close a previous version). */
  insertAgentRoutingCard(input: {
    version: number;
    data: unknown;
    sourceDate?: string;
    effectiveFrom?: string;
    active: boolean;
    createdByUserId?: string;
  }): Promise<void>;
  /**
   * Publish a NEW routing card version: closes the currently-active version
   * (active=false + effectiveTo=now) and inserts the new one as active, in one
   * transaction. Returns the created version number.
   */
  createAgentRoutingCardVersion(input: {
    data: unknown;
    sourceDate?: string;
    createdByUserId?: string;
  }): Promise<{ version: number; effectiveFrom: string }>;
  /** Full routing card history, newest first (who/what/when). */
  listAgentRoutingCards(limit?: number): Promise<
    Array<{
      version: number;
      active: boolean;
      data: unknown;
      effectiveFrom: string;
      effectiveTo?: string;
      sourceDate?: string;
      createdAt: string;
      createdByUserId?: string;
      createdByEmail?: string;
    }>
  >;
  /** One row per routed agent LLM call — admin-only visibility. */
  recordAgentCall(input: {
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
  }): Promise<void>;
  /** Per-line volume aggregate since an ISO cutoff (drives the admin table + simulator). */
  aggregateAgentCallVolume(sinceIso: string): Promise<
    Array<{
      lineKey: string;
      calls: number;
      tokensIn: number;
      tokensOut: number;
      costMillicents: number;
      creditCents: number;
      marginMillicents: number;
    }>
  >;
  /** Most recent agent call log rows, newest first (admin-only). */
  listAgentCalls(limit?: number): Promise<
    Array<{
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
    }>
  >;
  createSupportTicket(input: {
    organizationId: string;
    userId: string;
    subject: string;
    category?: string;
  }): Promise<SupportTicketRecord>;
  listSupportTickets(organizationId: string): Promise<SupportTicketRecord[]>;
  /** I25: one ticket scoped to an org (returns null if it doesn't belong to that org). */
  getSupportTicket(organizationId: string, ticketId: string): Promise<SupportTicketRecord | null>;
  /** I25: the conversation thread for a ticket, oldest first. */
  listTicketMessages(ticketId: string): Promise<TicketMessageRecord[]>;
  /** I25: append a message to a ticket's thread. */
  addTicketMessage(input: {
    ticketId: string;
    authorType: TicketMessageRecord['authorType'];
    authorUserId?: string;
    body: string;
  }): Promise<TicketMessageRecord>;
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
  createIntegrationFeatureRequest(input: {
    userId: string;
    organizationId?: string;
    integrationName: string;
    useCaseDescription: string;
  }): Promise<IntegrationFeatureRequestRecord>;
  listIntegrationFeatureRequests(filter: {
    userId: string;
    organizationId?: string;
    take?: number;
  }): Promise<IntegrationFeatureRequestRecord[]>;

  /**
   * Record (or change) a user's 👍/👎 vote on an assistant chat message. One
   * vote per (userId, messageId); repeat calls upsert the existing row.
   */
  upsertAiMessageFeedback(input: {
    userId: string;
    messageId: string;
    vote: AiMessageFeedbackVote;
    chatId?: string;
  }): Promise<AiMessageFeedbackRecord>;

  /**
   * Retract a previously recorded vote (the thumbs toggle turned off).
   * Returns false when no vote existed for that (userId, messageId).
   */
  deleteAiMessageFeedback(input: { userId: string; messageId: string }): Promise<boolean>;
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

  /**
   * F16 — rotate a SCIM token IN PLACE (same id): mint `newToken`, retain the old
   * hash as previousTokenHash + stamp rotatedAt so the old bearer stays valid for 24h.
   * Undefined if the id no longer exists.
   */
  rotateScimToken(tokenId: string, newToken: string): Promise<ScimTokenRecord | undefined>;
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
  deleteSiemWebhook(organizationId: string, webhookId: string): Promise<SiemWebhookRecord | null>;
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
  /** Look up an OAuth connection by its provider identity, to reject linking a
   *  provider account already bound to a DIFFERENT user (account-takeover guard). */
  findOAuthConnectionByExternalId(provider: string, externalId: string): Promise<OAuthConnectionRecord | null>;
  /** Unlink a provider from a user (account settings). Returns whether a row was removed. */
  deleteOAuthConnection(userId: string, provider: string): Promise<boolean>;
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
  createNotification(input: {
    userId: string;
    category?: string;
    title: string;
    body?: string;
    messageKey?: string;
    messageParams?: Record<string, unknown>;
    linkUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationRecord>;
  listNotificationsByUser(input: { userId: string; limit?: number }): Promise<NotificationRecord[]>;
  countUnreadNotificationsByUser(userId: string): Promise<number>;
  getNotificationById(id: string): Promise<NotificationRecord | undefined>;
  markNotificationRead(input: { id: string; readAt?: Date }): Promise<NotificationRecord | undefined>;
  markAllNotificationsRead(input: { userId: string; readAt?: Date }): Promise<number>;
  listUnresolvedReconnectionAlertsByUser(userId: string): Promise<ReconnectionAlertRecord[]>;
  getReconnectionAlertById(id: string): Promise<ReconnectionAlertRecord | undefined>;
  resolveReconnectionAlert(input: { id: string; resolvedAt?: Date }): Promise<ReconnectionAlertRecord | undefined>;
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

  /**
   * F18 — record one AI provider request outcome (latency + errored) for the admin
   * Providers panel's p95/error-rate aggregation. Best-effort: callers ignore
   * failures so metrics never break a completion.
   */
  createProviderRequestMetric(input: {
    provider: string;
    model?: string | null;
    latencyMs: number;
    errored: boolean;
    statusCode?: number | null;
    source?: string | null;
  }): Promise<void>;

  /**
   * F18 — the provider-request samples since `since` (latency + errored per provider),
   * bounded to the most recent `limit` rows so a busy window can't OOM the pod. Fed to
   * aggregateProviderMetrics.
   */
  listProviderRequestMetricsSince(
    since: Date,
    limit?: number,
  ): Promise<Array<{ provider: string; latencyMs: number; errored: boolean }>>;
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
   * Per-user (Enterprise) spend limits. An admin caps an individual member's
   * usage-based spend; the per-member override beats the org budget cap.
   */
  getUserSpendLimit(organizationId: string, userId: string): Promise<UserSpendLimitRecord | undefined>;
  setUserSpendLimit(input: {
    organizationId: string;
    userId: string;
    limitCents: number;
  }): Promise<UserSpendLimitRecord>;
  clearUserSpendLimit(organizationId: string, userId: string): Promise<void>;
  listUserSpendLimits(organizationId: string): Promise<UserSpendLimitRecord[]>;
  /** Sum a member's settled checkpoint credit spend since `sinceMs` (their period spend). */
  sumUserSpendSince(organizationId: string, userId: string, sinceMs: number): Promise<number>;

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

    /*
     * Encrypted platform API key. Conditional-spread semantics: omit (undefined)
     * = leave the stored key unchanged; explicit `null` = clear it (rotate off).
     */
    apiKeyEnc?: string | null;
    baseUrl?: string | null;
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
  /*
   * Admin-managed social-login provider config (one row per provider). Returns the
   * encrypted secret so the caller can decrypt it server-side; never expose it to
   * the browser. A null result means no admin row exists yet (login falls back to
   * env). The login flow reads this DB-first.
   */
  getLoginProviderConfig(provider: string): Promise<{
    provider: string;
    enabled: boolean;
    clientId: string | null;
    clientSecretEnc: string | null;
    scopes: string[];
  } | null>;
  upsertLoginProviderConfig(input: {
    provider: string;
    clientId?: string | null;
    clientSecretEnc?: string | null;
    scopes?: string[];
    enabled?: boolean;
    updatedByUserId?: string | null;
  }): Promise<{ provider: string; enabled: boolean; clientId: string | null; hasSecret: boolean }>;
  /*
   * Admin-managed Stripe config (singleton). Returns the encrypted blobs so the
   * caller can decrypt them server-side; never expose these to the browser.
   */
  getStripeConfig(): Promise<{ secretKeyEnc: string | null; webhookSecretEnc: string | null } | null>;
  /*
   * Upsert the singleton. A field left `undefined` is preserved (so saving only
   * the webhook secret doesn't wipe the secret key); pass `null` to clear.
   */
  upsertStripeConfig(input: {
    secretKeyEnc?: string | null;
    webhookSecretEnc?: string | null;
    updatedByUserId?: string | null;
  }): Promise<{ hasSecretKey: boolean; hasWebhookSecret: boolean }>;
  /*
   * Admin-set per-plan Stripe price IDs (not secrets). `undefined` leaves a field
   * unchanged; `null` clears it. The plan row must already exist (seeded).
   */
  setPlanStripePrices(input: {
    key: string;
    stripeProductId?: string | null;
    stripePriceId?: string | null;
    stripePriceMonthlyId?: string | null;
    stripePriceAnnualId?: string | null;
  }): Promise<void>;
  listModelConfigs(options?: { enabledOnly?: boolean }): Promise<ModelConfigRecord[]>;
  // Admin-wide listings for the supervision console.
  listAdminCreditWallets(): Promise<CreditWalletRecord[]>;
  listAdminAgentCheckpoints(options?: { take?: number }): Promise<AgentCheckpointRecord[]>;
  /** F21: per-org agent-checkpoint storage footprint (row count + token/credit totals). */
  summarizeAgentCheckpoints(): Promise<
    { organizationId: string; checkpoints: number; inputTokens: number; outputTokens: number; creditCents: number }[]
  >;
  /**
   * F21: count (dryRun) or delete terminal (COMPLETED/FAILED) agent checkpoints
   * started before `before`. dryRun powers the pre-purge estimate; the real purge
   * removes settled billing checkpoints, so it is admin + re-auth gated + audited.
   */
  purgeAgentCheckpoints(input: { before: string; dryRun: boolean }): Promise<{ count: number }>;
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
  /** True if a usage event of `type` was recorded for the org at/after `sinceMs` — used to dedup the daily storage meter. */
  hasUsageEventSince(organizationId: string, type: string, sinceMs: number): Promise<boolean>;
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
   * Record (or re-record) a failed Stripe webhook processing attempt. Upserts
   * on eventId: a repeat failure increments attempts, refreshes lastError and
   * failedAt, and clears any earlier resolvedAt.
   */
  recordStripeWebhookFailure(input: {
    eventId: string;
    type: string;
    payload: unknown;
    error: string;
  }): Promise<StripeWebhookFailureRecord>;

  /** Unresolved failures by default, newest first. */
  listStripeWebhookFailures(options?: {
    includeResolved?: boolean;
    limit?: number;
  }): Promise<StripeWebhookFailureRecord[]>;
  getStripeWebhookFailure(eventId: string): Promise<StripeWebhookFailureRecord | undefined>;

  /** Mark a failure resolved (successful replay or Stripe retry). No-op when absent. */
  resolveStripeWebhookFailure(eventId: string): Promise<void>;

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

  /** Server-side paginated/sorted/searched user listing for the admin console. */
  listAdminUsersPage(options: {
    page: number;
    pageSize: number;
    sort: 'name' | 'email' | 'createdAt';
    direction: 'asc' | 'desc';
    query?: string;
  }): Promise<{ users: UserRecord[]; total: number }>;
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

  /** Assign (or unassign with `undefined`) a support ticket to a platform admin. */
  assignSupportTicket(input: { ticketId: string; assigneeUserId?: string }): Promise<SupportTicketRecord>;
  updateAbuseEvent(input: {
    abuseEventId: string;
    resolved?: boolean;
    disposition?: string;
  }): Promise<AbuseEventRecord>;
  /** F23: security-relevant audit rows WITH their ids (so a resolution can key off them). */
  listSecurityAuditEvents(): Promise<Array<AuditEvent & { id: string; createdAt: string }>>;
  /** F23: resolution overlay for security events (derived from AuditLog). */
  listSecurityEventResolutions(): Promise<SecurityEventResolutionRecord[]>;
  resolveSecurityEvent(input: {
    auditLogId: string;
    note?: string;
    resolvedByUserId?: string;
  }): Promise<SecurityEventResolutionRecord>;
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
