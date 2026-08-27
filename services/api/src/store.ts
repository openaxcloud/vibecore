import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
import { hashToken } from '@vibecore/auth';
import {
  PLAN_ENTITLEMENTS_VERSION,
  type PlanEntitlements,
  type PlanKey,
  type QuotaKey,
  type QuotaOverrideKey,
} from '@vibecore/billing';
import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
import type { AccountPurgePreview, PurgeStorageDeps, PurgeUserAccountResult } from './account-purge.js';
import type { DeploymentAccessMode, DeploymentAccessPolicyRecord } from './deployment-access.js';

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
  state: 'ACTIVE' | 'SUSPENDED';
  invitedByUserId?: string;
  joinedAt: string;

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

export interface RemixJobRecord {
  id: string;
  sourceProjectId: string;
  targetProjectId?: string;
  organizationId: string;
  actorUserId?: string;
  state: string;
  idempotencyKey?: string;
  requestHash?: string;
  version: number;
  detachedKeys?: unknown;
  storagePolicy: string;
  storageConsentVersion?: string;
  storageInventory?: unknown;
  storageShareId?: string;
  scanFindings?: unknown;
  scrubbedCount: number;
  dbForked: boolean;
  sourceSnapshotId?: string;
  sourceSnapshotHash?: string;
  sourceListingId?: string;
  licenseSnapshot?: unknown;
  consentVersion?: string;
  piiFindings?: unknown;
  piiMaskedCount: number;
  sourceDatabasePin?: unknown;
  targetDatabaseInstanceId?: string;

  /** Internal fencing fields. HTTP handlers must never return these. */
  operationToken?: string;
  operationExpiresAt?: string;
  cleanupTerminalState?: string;
  errorCode?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemixJobTransitionPatch {
  targetProjectId?: string | null;
  sourceSnapshotId?: string | null;
  sourceSnapshotHash?: string | null;
  detachedKeys?: unknown;
  scanFindings?: unknown;
  scrubbedCount?: number;
  dbForked?: boolean;
  storageConsentVersion?: string | null;
  storageInventory?: unknown;
  storageShareId?: string | null;
  sourceDatabasePin?: unknown;
  targetDatabaseInstanceId?: string | null;
  sourceListingId?: string | null;
  piiFindings?: unknown;
  piiMaskedCount?: number;
  operationToken?: string | null;
  operationExpiresAt?: string | null;
  cleanupTerminalState?: string | null;
  errorCode?: string | null;
  error?: string | null;
}

export interface RemixStorageShareRecord {
  id: string;
  sourceProjectId: string;
  targetProjectId: string;
  sourceOrganizationId: string;
  targetOrganizationId: string;
  consentVersion: string;
  consentedByUserId?: string;
  consentedAt: string;
  sourceInventory: unknown;
  state: 'ACTIVE' | 'REVOKED';
  revokedAt?: string;
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

/**
 * Managed Postgres database for a project (Replit "Database" tab). Phase-1
 *  scaffold for point-in-time rollback — see database-rollback-service.ts.
 */
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

export type DatabaseMigrationState =
  | 'LOCK_ACQUIRED'
  | 'BACKUP_VERIFIED'
  | 'APPLYING'
  | 'VALIDATING'
  | 'RECOVERING'
  | 'COMMITTED'
  | 'FAILED_SAFE'
  | 'MANUAL_RECOVERY';

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
  plan: Array<{ name: string; sha256: string }>;
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

export type CollaborationGroupSource = 'MANUAL' | 'SCIM';

export interface CollaborationGroupRecord {
  id: string;
  organizationId: string;
  name: string;
  source: CollaborationGroupSource;
  externalId?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollaborationGroupMemberRecord {
  id: string;
  organizationId: string;
  groupId: string;
  membershipId: string;
  userId: string;
  createdAt: string;
}

export type AccessGrantSubjectType = 'USER' | 'GROUP';
export type AccessGrantResourceType = 'PROJECT' | 'ARTIFACT' | 'DEPLOYMENT' | 'DATASET';
export type AccessGrantStatus = 'PENDING_CONSENT' | 'ACTIVE' | 'REVOKED';

export interface ResourceAccessGrantRecord {
  id: string;
  organizationId: string;
  subjectType: AccessGrantSubjectType;
  subjectUserId?: string;
  subjectGroupId?: string;
  resourceType: AccessGrantResourceType;
  resourceId: string;
  roleKey: string;
  status: AccessGrantStatus;
  expiresAt: string;
  acceptedAt?: string;
  consentVersion?: string;
  grantedByUserId: string;
  revokedAt?: string;
  revokedByUserId?: string;
  revocationReason?: string;
  idempotencyKey?: string;
  requestHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor?: string;
}

export type GroupMemberMutationResult =
  | { ok: true; member?: CollaborationGroupMemberRecord; removed?: boolean }
  | { ok: false; reason: 'GROUP_NOT_FOUND' | 'GROUP_SCIM_MANAGED' | 'GROUP_MANUAL_ONLY' | 'MEMBERSHIP_NOT_ACTIVE' };

export type AccessGrantMutationResult =
  | { ok: true; grant: ResourceAccessGrantRecord; replayed?: boolean }
  | {
      ok: false;
      reason:
        | 'IDEMPOTENCY_CONFLICT'
        | 'ACTIVE_GRANT_CONFLICT'
        | 'GRANT_NOT_FOUND'
        | 'GRANT_NOT_PENDING'
        | 'GRANT_NOT_ACTIVE'
        | 'GRANT_EXPIRED'
        | 'GRANT_SUBJECT_MISMATCH';
    };

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

  /** Autoscale sleeps; Reserved VM is operator-gated always-on capacity. */
  runtimeKind?: 'autoscale' | 'reserved-vm';

  /** Optimistic fence for in-place runtime/tier transitions. */
  runtimeVersion?: number;
  reservedVmTier?: ReservedVmTier;
  reservedVmPriceCents?: number;
  reservedVmTermsVersion?: string;
  reservedVmRateCardVersion?: number;
  reservedVmBillingReservationId?: string;
  reservedVmBillingState?: ReservedVmBillingState;
  reservedVmCurrentPeriodStart?: string;
  reservedVmNextChargeAt?: string;
  reservedVmGraceEndsAt?: string;
  reservedVmStopRequestedAt?: string;
  persistentStorageClaim?: string;

  /** Exact immutable policy version enforced at both dedicated origins. */
  accessPolicyVersion: number;
  startedAt?: string;
  finishedAt?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export type ReservedVmTier = 'shared-0.5' | 'dedicated-1' | 'dedicated-2' | 'dedicated-4';
export type DeploymentRuntimeKind = 'autoscale' | 'reserved-vm';
export interface ReservedVmEncryptedPayload {
  keyId: string;
  ciphertext: string;
}
export type ReservedVmBillingState = 'CURRENT' | 'PAST_DUE' | 'STOP_REQUIRED' | 'SUSPENDED';

export interface ReservedVmOperationRecord {
  id: string;
  projectId: string;
  deploymentId: string;
  organizationId: string;
  actorUserId?: string;
  idempotencyKey: string;
  requestHash: string;
  kind: 'CREATE' | 'CHANGE' | 'REDEPLOY' | 'DECOMMISSION';
  status: 'PENDING' | 'APPLYING' | 'COMPLETED' | 'FAILED';
  phase: 'RESERVED' | 'LEASED' | 'RUNTIME_APPLIED' | 'COMMITTED' | 'ROLLED_BACK';
  fromRuntimeKind?: DeploymentRuntimeKind;
  fromTier?: ReservedVmTier;
  targetRuntimeKind: DeploymentRuntimeKind;
  targetTier?: ReservedVmTier;
  targetMachineSize: string;
  targetCpuMillicores: number;
  targetMemoryMb: number;
  targetPriceCents: number;
  billingAmountCents: number;
  termsVersion: string;
  rateCardVersion?: number;
  expectedRuntimeVersion: number;
  billingReservationId?: string;
  response?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReservedVmLease extends ReservedVmOperationRecord {
  /** Internal fencing capability; never serialize in HTTP responses. */
  leaseOwner?: string;
  leaseExpiresAt?: string;
  fencingToken: number;
}

export interface ReservedVmBillingRequest {
  organizationId: string;
  actorUserId: string;
  idempotencyKey: string;
  requestHash: string;
  tier: ReservedVmTier;
  termsVersion: string;
  monthlyPriceCents: number;
  rateCardVersion: number;
}

export type ReservedVmBillingPeriodStatus = 'DUE' | 'PROCESSING' | 'PAID' | 'PAST_DUE' | 'STOP_REQUIRED' | 'CANCELED';

export interface ReservedVmBillingPeriodRecord {
  id: string;
  projectId: string;
  deploymentId: string;
  organizationId: string;
  actorUserId?: string;
  periodStart: string;
  periodEnd: string;
  tier: ReservedVmTier;
  priceCents: number;
  termsVersion: string;
  rateCardVersion: number;
  status: ReservedVmBillingPeriodStatus;
  attemptCount: number;
  reservationGeneration: number;
  billingReservationId?: string;
  graceEndsAt?: string;
  stopRequestedAt?: string;
  settledAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReservedVmBillingPeriodLease extends ReservedVmBillingPeriodRecord {
  /** Internal worker capability; never serialize from a user-facing endpoint. */
  leaseOwner?: string;
  leaseExpiresAt?: string;
  fencingToken: number;
}

export interface ReservedVmStopSignal {
  periodId: string;
  projectId: string;
  deploymentId: string;
  organizationId: string;
  requestedAt: string;
  graceEndedAt: string;
  persistentStorageClaim?: string;

  /** Billing enforcement stops compute; the stable Reserved VM PVC is retained. */
  deletePersistentStorage: false;
}

export interface ReservedVmStopLease extends ReservedVmStopSignal {
  /** Internal external-effect authority; never serialize to user clients. */
  operationId: string;
  ownerToken: string;
  leaseExpiresAt: string;
  fencingToken: number;
}

/**
 * Operator-only Reserved VM renewal contract. Keeping this separate from
 * ApiStore prevents a user-facing in-memory implementation from silently
 * simulating billing. Production workers must depend on this durable store.
 */
export interface ReservedVmBillingStore {
  claimDueReservedVmBillingPeriod(input: {
    ownerToken: string;
    ttlMs: number;
    deploymentId?: string;
    gracePeriodMs?: number;
  }): Promise<{ period: ReservedVmBillingPeriodLease; deployment: DeploymentRecord } | undefined>;
  commitReservedVmBillingPeriod(input: {
    periodId: string;
    ownerToken: string;
    fencingToken: number;
    gracePeriodMs?: number;
  }): Promise<{ period: ReservedVmBillingPeriodRecord; deployment: DeploymentRecord; replayed: boolean }>;
  failReservedVmBillingPeriod(input: {
    periodId: string;
    ownerToken: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
    gracePeriodMs: number;
  }): Promise<{ period: ReservedVmBillingPeriodRecord; deployment: DeploymentRecord }>;
  listReservedVmStopSignals(take?: number): Promise<ReservedVmStopSignal[]>;
  claimNextReservedVmComputeStop(input: {
    ownerToken: string;
    ttlMs: number;
  }): Promise<{ signal: ReservedVmStopLease; deployment: DeploymentRecord } | undefined>;
  acknowledgeReservedVmComputeStopped(input: {
    periodId: string;
    deploymentId: string;
    ownerToken: string;
    fencingToken: number;
  }): Promise<{ period: ReservedVmBillingPeriodRecord; deployment: DeploymentRecord; replayed: boolean }>;
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
  accessPolicyVersion: number;
  /** Immutable publication policy; legacy NULL rows are deliberately not rollback-capable. */
  planEntitlements?: ReleasePlanEntitlementsPin;
  /** Exact ProjectManifest revision validated by the release fence. */
  projectManifestDigest?: string;
  createdAt: string;
}

/**
 * Server-authoritative publication policy copied into every immutable release.
 * Keeping this contract in the store layer lets static, server-image, access
 * policy and Reserved VM publishers all persist the same exact pin.
 */
export interface ReleasePlanEntitlementsPin {
  version: typeof PLAN_ENTITLEMENTS_VERSION;
  plan: PlanEntitlements['plan'];
  badgeRequired: boolean;
  publishRegion: string;
  publishRegions: PlanEntitlements['publishRegions'];
}

/** Parse and canonicalize the only release-pin contract this binary understands. */
export function parseReleasePlanEntitlementsPin(value: unknown): ReleasePlanEntitlementsPin | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const pin = value as Partial<ReleasePlanEntitlementsPin>;
  const publishRegion = typeof pin.publishRegion === 'string' ? pin.publishRegion.trim().toLowerCase() : '';

  if (
    pin.version !== PLAN_ENTITLEMENTS_VERSION ||
    !['starter', 'core', 'pro', 'enterprise'].includes(pin.plan ?? '') ||
    typeof pin.badgeRequired !== 'boolean' ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(publishRegion) ||
    !['single', 'all', 'custom'].includes(pin.publishRegions ?? '')
  ) {
    return undefined;
  }

  return {
    version: PLAN_ENTITLEMENTS_VERSION,
    plan: pin.plan as PlanEntitlements['plan'],
    badgeRequired: pin.badgeRequired,
    publishRegion,
    publishRegions: pin.publishRegions as PlanEntitlements['publishRegions'],
  };
}

export function sameReleasePlanEntitlementsPin(left: unknown, right: unknown): boolean {
  const a = parseReleasePlanEntitlementsPin(left);
  const b = parseReleasePlanEntitlementsPin(right);

  return Boolean(
    a &&
      b &&
      a.version === b.version &&
      a.plan === b.plan &&
      a.badgeRequired === b.badgeRequired &&
      a.publishRegion === b.publishRegion &&
      a.publishRegions === b.publishRegions,
  );
}

/**
 * Durable, PostgreSQL-clock release barrier. A publisher renews this lease while
 * it performs bounded external work; transfer and ProjectManifest append both
 * observe the same ProjectCheckpoint singleton before mutating ownership.
 */
export interface ProjectReleaseBarrierLease {
  checkpointId: string;
  projectId: string;
  barrierId: string;
  ownerToken: string;
  fence: number;
  expiresAt: string;
}

/** Exact capability revalidated in the READY + ReleaseManifest transaction. */
export interface ProjectReleaseFence {
  checkpointId: string;
  ownerToken: string;
  fence: number;
  expectedOrganizationId: string;
  expectedManifestDigest: string;
}

export type RollbackOperationStatus = 'IN_PROGRESS' | 'COMPLETED';
export type RollbackOperationPhase =
  | 'CLAIMED'
  | 'TARGET_BOUND'
  | 'DEPLOYMENT_CREATED'
  | 'EFFECT_STARTED'
  | 'EFFECT_CLEANED'
  | 'RELEASE_COMMITTED';

/**
 * Durable rollback execution and response ledger. Lease timestamps are issued
 * by PostgreSQL; callers must treat `ownerToken` + `fencingToken` as one
 * inseparable capability and must never expose either value over HTTP.
 */
export interface RollbackOperationRecord {
  id: string;
  projectId: string;
  actorUserId?: string;
  idempotencyKey: string;
  requestFingerprint: string;
  environment: string;
  status: RollbackOperationStatus;
  phase: RollbackOperationPhase;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  fencingToken: number;

  /** Fence that durably authorized the current external-effect generation. */
  effectFencingToken?: number;
  deploymentId?: string;
  expectedHeadVersion?: number;
  previousManifestId?: string;
  projectManifestDigest?: string;
  responseStatus?: number;
  responseContentLanguage?: 'en' | 'fr';
  responseBody?: unknown;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RollbackLeaseFence {
  operationId: string;
  ownerToken: string;
  fencingToken: number;
  expectedHeadVersion: number;
}

export interface RollbackDeploymentCreateInput {
  id: string;
  projectId: string;
  provider: string;
  environment: DeploymentRecord['environment'];
  status: DeploymentRecord['status'];
  accessPolicyVersion: number;
  rolledBackFromId: string;
  metadata: Record<string, unknown>;
}

export interface StaticRollbackReleaseCommitInput extends RollbackLeaseFence {
  projectId: string;
  deploymentId: string;
  environment: DeploymentRecord['environment'];
  provider: string;
  artifactRef: string;
  artifactDigest: string;
  storeGeneration?: string;
  configDigest?: string;
  dbMigrationPoint?: string;
  accessPolicyVersion: number;
  url: string;
  metadata: Record<string, unknown>;
  logs: DeploymentRecord['logs'];
  finishedAt: string;
  releaseFence: ProjectReleaseFence;
}

/** Atomic READY + immutable manifest commit for ordinary static publishes/redeploys. */
export interface StaticReleaseCommitInput {
  projectId: string;
  deploymentId: string;
  environment: DeploymentRecord['environment'];
  artifactRef: string;
  artifactDigest: string;
  storeGeneration?: string;
  configDigest?: string;
  dbMigrationPoint?: string;
  accessPolicyVersion: number;
  url: string;
  previewUrl?: string;
  productionUrl?: string;
  metadata: Record<string, unknown>;
  logs: DeploymentRecord['logs'];
  finishedAt: string;
  releaseFence: ProjectReleaseFence;
}

export interface StaticReleaseCommitResult {
  committed: boolean;
  deployment: DeploymentRecord;
  manifest?: ReleaseManifestRecord;
}

export interface DeploymentAccessContext {
  deploymentId: string;
  projectId: string;
  organizationId: string;
  environment: string;
  deploymentStatus: DeploymentRecord['status'];
  projectDeletedAt?: string;
  policy?: DeploymentAccessPolicyRecord;
}

export type DeploymentAccessTicketMutationResult =
  | { ok: true; policy: DeploymentAccessPolicyRecord; userId: string; expiresAt: string }
  | {
      ok: false;
      reason:
        | 'DEPLOYMENT_NOT_FOUND'
        | 'POLICY_INVALID'
        | 'POLICY_NOT_PRIVATE'
        | 'ACCESS_DENIED'
        | 'TICKET_NOT_FOUND'
        | 'TICKET_EXPIRED'
        | 'TICKET_REPLAYED'
        | 'POLICY_CHANGED';
    };

/**
 * Atomic READY + ReleaseManifest commit for a promoted server image. The store
 * owns the transaction so a concurrent cancel can never leave an immutable
 * manifest for a deployment that did not actually become READY.
 */
export interface ServerImageReleaseCommitInput {
  projectId: string;
  organizationId: string;
  deploymentId: string;
  environment: DeploymentRecord['environment'];
  artifactRef: string;
  artifactDigest: string;
  storeGeneration?: string;
  configDigest?: string;
  dbMigrationPoint?: string;
  url: string;
  previewUrl?: string;
  productionUrl?: string;
  metadata: Record<string, unknown>;
  logs: DeploymentRecord['logs'];
  finishedAt: string;
  releaseFence: ProjectReleaseFence;

  /** Required for rollback-owned deployments; omitted by ordinary publishes. */
  rollbackFence?: RollbackLeaseFence;

  /**
   * When a promoted image belongs to a Reserved VM saga, release publication,
   * runtime CAS and the initial/delta ledger settlement commit atomically.
   */
  reservedVmFence?: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    response: Record<string, unknown>;
  };
}

export interface ServerImageReleaseCommitResult {
  committed: boolean;
  deployment: DeploymentRecord;
  manifest?: ReleaseManifestRecord;
}

/** Atomic READY transition for legacy server runtimes without a promoted image. */
export interface FencedServerReadyCommitInput {
  projectId: string;
  deploymentId: string;
  releaseFence: ProjectReleaseFence;
  url: string;
  previewUrl?: string;
  productionUrl?: string;
  metadata: Record<string, unknown>;
  logs: DeploymentRecord['logs'];
  finishedAt: string;
}

/** P0-EX-08: one immutable, canonical ProjectManifest revision. */
export interface ProjectManifestRevisionRecord {
  id: string;
  projectId: string;
  schemaVersion: number;
  manifestVersion: number;
  digest: string;
  manifest: unknown;
  createdByUserId?: string;
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

export interface SecurityAuditEventPage {
  events: Array<
    AuditEvent & {
      id: string;
      createdAt: string;
      resolved: boolean;
      note?: string;
      resolvedAt?: string;
    }
  >;
  openCount: number;
  nextCursor?: { createdAt: string; id: string };
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
  createdByUserId?: string;
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

export interface CanonicalUserSpendReservationRecord {
  id: string;
  status: string;
  created: boolean;
}

export interface CanonicalAiUsageInput {
  callId: string;
  kind: 'planner' | 'agent-lane' | 'summary' | 'context' | 'main' | 'classifier' | 'crash-recovery';
  /** Operator-only calls are receipted but do not settle against user spend. */
  billedToUser?: boolean;
  projectId: string;
  conversationId?: string;
  messageId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  reason: string;
}

export interface CanonicalAiUsageBatchInput {
  reservationId: string;
  organizationId: string;
  userId: string;
  requestId: string;
  executionToken: string;
  projectId: string;
  calls: CanonicalAiUsageInput[];
}

export interface CanonicalAiClassifierRoutingSelection {
  mode: 'lite' | 'economy' | 'power';
  highEffort: boolean;
  turbo: boolean;
  lineKey: 'classifier';
  routingCardVersion: number;
  source: string;
}

export interface CanonicalAiClassifierRouting extends CanonicalAiClassifierRoutingSelection {
  costInMillicentsPerM: number;
  costOutMillicentsPerM: number;
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
  /** Canonical persisted Plan.monthlyCents, independent of Stripe billing interval. */
  planMonthlyCents: number;
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
  key: QuotaOverrideKey;
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

  /** PostgreSQL clock snapshot used by period-bound entitlement claims. */
  getDatabaseClock(): Promise<{ now: string; monthStart: string }>;

  /**
   * Serialize a read-modify-write critical section across all pods using a
   * Postgres transaction-scoped advisory lock keyed by `key`. Concurrent callers
   * with the same key run strictly one-at-a-time, so check-then-mutate guards
   * (last-owner / last-admin / quota) can't be defeated by a TOCTOU race. The
   * callback should normally be short (it runs while the lock is held). A
   * bounded longer timeout may be requested for an external operation whose
   * rollback must remain serialized, such as an OCI graph promotion.
   */
  withSerializedMutation<T>(key: string, fn: () => Promise<T>, options?: { transactionTimeoutMs?: number }): Promise<T>;
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
  previewAccountPurge(userId: string): Promise<AccountPurgePreview>;
  requestAccountDeletion(userId: string): Promise<{
    requestedAt: string;
    purgeDueAt: string;
    alreadyRequested: boolean;
  }>;
  cancelAccountDeletion(userId: string): Promise<{
    cancelled: boolean;
    reason?: 'not_requested' | 'not_cancellable';
  }>;
  purgeUserAccount(
    input: { userId: string; correlationId?: string },
    deps: PurgeStorageDeps,
  ): Promise<PurgeUserAccountResult>;
  reconcilePurgeFreezes(): Promise<{ scanned: number; reconciled: number; planIds: string[] }>;
  isObjectStorageProjectPurgeFrozen(projectId: string): Promise<boolean>;
  withObjectStorageProjectMutation<T>(projectId: string, effect: () => Promise<T>): Promise<T>;
  withObjectStorageProjectMutations<T>(projectIds: string[], effect: () => Promise<T>): Promise<T>;
  /** Refuse every local/static storage write once project purge fencing begins. */
  assertProjectStorageMutable(projectId: string, workspaceId?: string): Promise<void>;
  hasPurgeReceipt(userId: string): Promise<boolean>;
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
  addMember(input: {
    organizationId: string;
    userId: string;
    roleKey: string;
    invitedByUserId?: string;
  }): Promise<MembershipRecord>;
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

    /** Internal clone seed. Runtime-validated before the project transaction commits. */
    initialManifest?: unknown;

    /** Secure remixes strip tenant-bound refs; ordinary duplicates preserve them. */
    manifestCloneMode?: 'COPY' | 'DETACH_EXTERNALS';
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
  transferProject(input: {
    projectId: string;
    targetOrganizationId: string;
    actorUserId?: string;
  }): Promise<ProjectRecord>;
  duplicateProject(input: {
    projectId: string;
    name: string;
    slug: string;

    /** Target org for the clone. Defaults to the source project's org. */
    organizationId?: string;

    /** Secure remix boundary: never carry source resource/entitlement refs. */
    manifestCloneMode?: 'COPY' | 'DETACH_EXTERNALS';
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

  /** Checkpoint PROJET coordonné (plan §15). */
  /** Shared authority for timestamps used in cross-replica leases/manifests. */
  getDatabaseTime(): Promise<string>;
  createProjectCheckpoint(input: {
    projectId: string;
    createdByUserId?: string;
    idempotencyKey?: string;
    requestHash?: string;
  }): Promise<{ id: string; state: string; replayed: boolean }>;
  acquireProjectCheckpointBarrier(input: {
    checkpointId: string;
    projectId: string;
    barrierId: string;
    ownerToken: string;
    ttlSeconds: number;
  }): Promise<
    | {
        checkpointId: string;
        barrierId: string;
        ownerToken: string;
        fence: number;
        expiresAt: string;
      }
    | undefined
  >;
  renewProjectCheckpointBarrier(input: {
    checkpointId: string;
    ownerToken: string;
    fence: number;
    ttlSeconds: number;
  }): Promise<string | undefined>;
  assertProjectCheckpointBarrier(input: { checkpointId: string; ownerToken: string; fence: number }): Promise<void>;
  transitionProjectCheckpoint(input: {
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

    /** Keep the same fenced barrier for an immediately-following restore. */
    retainBarrier?: boolean;
  }): Promise<void>;
  releaseProjectCheckpointBarrier(input: { checkpointId: string; ownerToken: string; fence: number }): Promise<boolean>;

  /** Acquire a release-only checkpoint barrier after locking/revalidating org + manifest. */
  acquireProjectReleaseBarrier(input: {
    projectId: string;
    expectedOrganizationId: string;
    expectedManifestDigest: string;
    operationId: string;
    ownerToken: string;
    ttlSeconds: number;
  }): Promise<ProjectReleaseBarrierLease | undefined>;

  /** Fence check at every external-effect boundary and immediately before READY. */
  assertProjectReleaseBarrier(input: {
    checkpointId: string;
    projectId: string;
    expectedOrganizationId: string;
    expectedManifestDigest: string;
    ownerToken: string;
    fence: number;
  }): Promise<void>;

  /** Delete only the ephemeral release barrier owned by this exact fence. */
  releaseProjectReleaseBarrier(input: {
    checkpointId: string;
    projectId: string;
    ownerToken: string;
    fence: number;
  }): Promise<boolean>;
  updateProjectCheckpoint(
    id: string,
    patch: {
      state?: string;
      logicalBarrierId?: string;
      consistencyLevel?: string;
      manifest?: unknown;
      error?: string;
      expiresAt?: string;
    },
  ): Promise<void>;

  /**
   * The write barrier in force for a project, read from the DATABASE so every
   * API replica observes it (an in-process barrier freezes only its own pod).
   * Rows whose lease has expired are treated as thawed — expiry is the
   * guaranteed thaw when the orchestrating process dies mid-checkpoint.
   */
  getActiveCheckpointBarrier(
    projectId: string,
  ): Promise<{ checkpointId: string; barrierId: string; expiresAt: string } | undefined>;
  getProjectCheckpoint(id: string): Promise<
    | {
        id: string;
        projectId: string;
        state: string;
        logicalBarrierId?: string;
        consistencyLevel?: string;
        manifest?: unknown;
        error?: string;
        expiresAt?: string;
        createdAt: string;
      }
    | undefined
  >;

  /** Create-or-replay the tenant-scoped durable remix authority. */
  createRemixJob(input: {
    sourceProjectId: string;
    organizationId: string;
    actorUserId?: string;
    storagePolicy: string;
    idempotencyKey: string;
    requestHash: string;
    storageConsentVersion?: string;

    /** Immutable release pin (ProjectSnapshot id) the clone reproduces. */
    sourceSnapshotId?: string;

    /** The gallery listing the remix was launched from (provenance). */
    sourceListingId?: string;

    /** Versioned license captured at remix time (immutable on the job). */
    licenseSnapshot?: unknown;

    /** Consent-text version the remixer explicitly accepted. */
    consentVersion?: string;
  }): Promise<{ job: RemixJobRecord; replayed: boolean }>;

  /** Acquire/steal an expired execution lease via CAS. */
  claimRemixJob(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    leaseDurationMs: number;
  }): Promise<RemixJobRecord | undefined>;
  renewRemixJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedVersion: number;
    leaseDurationMs: number;
  }): Promise<RemixJobRecord | undefined>;
  transitionRemixJob(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedVersion: number;
    expectedStates: string[];
    state: string;
    patch?: RemixJobTransitionPatch;
  }): Promise<RemixJobRecord | undefined>;
  releaseRemixJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
  }): Promise<RemixJobRecord | undefined>;
  createClaimedRemixProject(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    name: string;
    slug: string;
    manifestCloneMode?: 'COPY' | 'DETACH_EXTERNALS';
  }): Promise<ProjectRecord>;
  completeClaimedRemixDatabase(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    databaseInstanceId: string;
    projectId: string;
    valueEncrypted: string;
  }): Promise<RemixJobRecord | undefined>;
  finalizeClaimedRemix(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }): Promise<RemixJobRecord | undefined>;
  beginRemixCleanup(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    terminalState: 'FAILED';
    errorCode: string;
    error: string;
  }): Promise<RemixJobRecord | undefined>;
  deleteClaimedRemixProject(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }): Promise<boolean>;
  finishRemixCleanup(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
  }): Promise<RemixJobRecord | undefined>;
  getRemixJob(id: string, organizationId?: string): Promise<RemixJobRecord | undefined>;
  createRemixStorageShare(input: {
    sourceProjectId: string;
    targetProjectId: string;
    sourceOrganizationId: string;
    targetOrganizationId: string;
    consentVersion: string;
    consentedByUserId?: string;
    sourceInventory: unknown;
  }): Promise<RemixStorageShareRecord>;
  getRemixStorageShareByTarget(targetProjectId: string): Promise<RemixStorageShareRecord | undefined>;
  revokeRemixStorageShare(input: {
    targetProjectId: string;
    targetOrganizationId: string;
  }): Promise<RemixStorageShareRecord | undefined>;
  deleteClaimedRemixStorageShare(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }): Promise<boolean>;

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

    /** Prefer this in production so the store derives the deadline from DB time. */
    expiresInMs?: number;
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

    /** If set, operationExpiresAt is derived atomically from the store clock. */
    operationLeaseDurationMs?: number;
  }): Promise<ImportJobRecord | undefined>;

  /** Renew a still-live import operation lease. A dead lease is never resurrected. */
  renewImportJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
    leaseDurationMs: number;
  }): Promise<ImportJobRecord | undefined>;

  /** Revalidate ownership immediately before an irreversible physical effect. */
  validateImportJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
  }): Promise<boolean>;

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
    description?: string;
    templateName?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
    initialManifest?: unknown;
    manifestCloneMode?: 'COPY' | 'DETACH_EXTERNALS';
  }): Promise<ProjectRecord>;

  /** Atomically persist the verified IDE manifest, publish COMMITTED/SETTLED, and reveal the target. */
  finalizeImportCommit(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
    actualCredits: number;
    projectIdeState?: unknown;
    updatedByUserId?: string;
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
  reapExpiredImportJobs(nowIso?: string): Promise<string[]>;
  deleteProjectSecret(projectId: string, key: string): Promise<ProjectSecretRecord | undefined>;
  addProjectCollaborator(input: {
    projectId: string;
    expectedOrganizationId: string;
    userId: string;
    roleKey: string;
    expiresAt?: Date | null;
  }): Promise<ProjectCollaboratorRecord>;
  listProjectCollaborators(projectId: string): Promise<ProjectCollaboratorRecord[]>;
  /** Active by database clock; used by share redemption and viewer enforcement. */
  getActiveProjectCollaborator(projectId: string, userId: string): Promise<ProjectCollaboratorRecord | undefined>;
  /**
   * Distinct users with active read-only project access across collaborators,
   * direct access grants and live group grants, evaluated by database clock.
   * `excludeGroupId` removes that group's grant edges so a SCIM replacement can
   * calculate its complete post-mutation audience before writing it.
   */
  listActiveOrganizationViewerUserIds(organizationId: string, options?: { excludeGroupId?: string }): Promise<string[]>;
  /** Whether this live group currently confers guest/viewer access to any live project. */
  groupHasActiveReadOnlyProjectGrant(organizationId: string, groupId: string): Promise<boolean>;
  removeProjectCollaborator(input: {
    projectId: string;
    expectedOrganizationId: string;
    userId: string;
  }): Promise<boolean>;
  createCollaborationGroup(input: {
    organizationId: string;
    name: string;
    source: CollaborationGroupSource;
    externalId?: string;
  }): Promise<CollaborationGroupRecord>;
  getCollaborationGroup(groupId: string): Promise<CollaborationGroupRecord | undefined>;
  findScimCollaborationGroup(organizationId: string, externalId: string): Promise<CollaborationGroupRecord | undefined>;
  updateScimCollaborationGroup(input: {
    organizationId: string;
    groupId: string;
    name: string;
  }): Promise<CollaborationGroupRecord | undefined>;
  syncScimCollaborationGroup(input: {
    organizationId: string;
    groupId?: string;
    externalId?: string | null;
    name: string;
    userIds: string[];
  }): Promise<
    | { ok: true; group: CollaborationGroupRecord; created: boolean }
    | { ok: false; reason: 'GROUP_NOT_FOUND' | 'GROUP_MANUAL_ONLY' | 'MEMBERSHIP_NOT_ACTIVE' }
  >;
  listCollaborationGroups(input: {
    organizationId: string;
    cursor?: string;
    offset?: number;
    source?: CollaborationGroupSource;
    limit: number;
  }): Promise<CursorPage<CollaborationGroupRecord>>;
  countCollaborationGroups(organizationId: string, source?: CollaborationGroupSource): Promise<number>;
  archiveCollaborationGroup(input: {
    organizationId: string;
    groupId: string;
    writer: CollaborationGroupSource;
    actorUserId?: string;
  }): Promise<GroupMemberMutationResult>;
  addCollaborationGroupMember(input: {
    organizationId: string;
    groupId: string;
    userId: string;
    writer: CollaborationGroupSource;
  }): Promise<GroupMemberMutationResult>;
  removeCollaborationGroupMember(input: {
    organizationId: string;
    groupId: string;
    userId: string;
    writer: CollaborationGroupSource;
  }): Promise<GroupMemberMutationResult>;
  replaceCollaborationGroupMembers(input: {
    organizationId: string;
    groupId: string;
    userIds: string[];
    writer: CollaborationGroupSource;
  }): Promise<GroupMemberMutationResult>;
  listCollaborationGroupMembers(input: {
    organizationId: string;
    groupId: string;
    cursor?: string;
    limit: number;
  }): Promise<CursorPage<CollaborationGroupMemberRecord>>;
  createResourceAccessGrant(input: {
    organizationId: string;
    subjectType: AccessGrantSubjectType;
    subjectUserId?: string;
    subjectGroupId?: string;
    resourceType: AccessGrantResourceType;
    resourceId: string;
    roleKey: string;
    status: Extract<AccessGrantStatus, 'PENDING_CONSENT' | 'ACTIVE'>;
    expiresAt: Date;
    acceptedAt?: Date;
    consentVersion?: string;
    grantedByUserId: string;
    idempotencyKey?: string;
    requestHash: string;
  }): Promise<AccessGrantMutationResult>;
  getResourceAccessGrant(grantId: string): Promise<ResourceAccessGrantRecord | undefined>;
  listResourceAccessGrants(input: {
    organizationId: string;
    resourceType: AccessGrantResourceType;
    resourceId: string;
    cursor?: string;
    limit: number;
  }): Promise<CursorPage<ResourceAccessGrantRecord>>;
  listUserResourceAccessGrants(input: {
    userId: string;
    cursor?: string;
    limit: number;
  }): Promise<CursorPage<ResourceAccessGrantRecord>>;
  acceptResourceAccessGrant(input: {
    grantId: string;
    subjectUserId: string;
    consentVersion: string;
  }): Promise<AccessGrantMutationResult>;
  rejectResourceAccessGrant(input: {
    grantId: string;
    subjectUserId: string;
    reason: string;
  }): Promise<AccessGrantMutationResult>;
  revokeResourceAccessGrant(input: {
    organizationId: string;
    grantId: string;
    revokedByUserId: string;
    reason: string;
  }): Promise<AccessGrantMutationResult>;

  /** Uses CURRENT_TIMESTAMP in PostgreSQL, never an api-replica clock. */
  listActiveProjectAccessRoles(projectId: string, userId: string): Promise<string[]>;
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
    expectedOrganizationId: string;
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
    expectedProjectId: string;
    expectedOrganizationId: string;
    state: unknown;
    updatedByUserId?: string;
    expectedVersion?: number;
  }): Promise<WorkspaceIdeStateRecord>;
  updateWorkspaceGitRepositoryUrl(input: {
    workspaceId: string;
    expectedProjectId: string;
    expectedOrganizationId: string;
    gitRepositoryUrl: string | null;
  }): Promise<WorkspaceRecord>;
  upsertCollaborationPresence(input: {
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
  }): Promise<CollaborationPresenceRecord>;
  removeCollaborationPresence(input: {
    projectId: string;
    expectedOrganizationId: string;
    sessionId: string;
  }): Promise<boolean>;
  listCollaborationPresence(projectId: string): Promise<CollaborationPresenceRecord[]>;
  createCollaborationComment(input: {
    projectId: string;
    expectedOrganizationId: string;
    userId: string;
    filePath?: string;
    line?: number;
    selection?: unknown;
    body: string;
  }): Promise<CollaborationCommentRecord>;
  listCollaborationComments(projectId: string): Promise<CollaborationCommentRecord[]>;
  createProjectShareLink(input: {
    projectId: string;
    expectedOrganizationId: string;
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
  revokeProjectShareLink(input: { projectId: string; expectedOrganizationId: string; id: string }): Promise<boolean>;

  /**
   * Revalidate an unexpired bearer link and grant its pinned role under the
   * same topology/checkpoint/Project critical section. This closes both link
   * revocation and tenant-transfer races between token lookup and admission.
   */
  redeemProjectShareLink(input: {
    projectId: string;
    expectedOrganizationId: string;
    shareLinkId: string;
    tokenHash: string;
    expectedRoleKey: ProjectShareLinkRecord['roleKey'];
    expectedExpiresAt: Date;
    userId: string;
  }): Promise<ProjectCollaboratorRecord | undefined>;

  /**
   * Persist a shared conversation snapshot. The caller supplies the sha256
   * hash of the (random) share token so the raw token is never stored.
   */
  createChatShare(input: {
    tokenHash: string;
    conversationId: string;
    projectId: string;
    expectedOrganizationId: string;
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
  revokeChatShare(input: {
    id: string;
    projectId: string;
    expectedOrganizationId: string;
    authorUserId?: string;
  }): Promise<boolean>;
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
    expectedOrganizationId: string;
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
    /** Optional deterministic id for crash-safe idempotent snapshot creation. */
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

  /** Acquire/recover the singleton migration under a DB-clock lease. */
  acquireDatabaseMigrationExecution(input: {
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
  }): Promise<
    | { kind: 'ACQUIRED' | 'RECOVERY'; execution: DatabaseMigrationExecutionRecord }
    | {
        kind: 'REPLAYED' | 'BLOCKED' | 'FAILED' | 'MANUAL_RECOVERY' | 'IDEMPOTENCY_COLLISION';
        execution: DatabaseMigrationExecutionRecord;
      }
  >;
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
    reservedVm?: ReservedVmBillingRequest;

    /** Create a new immutable policy in the same transaction as this row. */
    accessPolicy?: {
      mode: DeploymentAccessMode;
      passwordHash?: string;
      createdByUserId?: string;
    };

    /** Bind an existing exact policy (redeploy/rollback in the same environment). */
    accessPolicyVersion?: number;
    startedAt?: string;
    finishedAt?: string;
    canceledAt?: string;
  }): Promise<DeploymentRecord>;
  createReservedVmChangeOperation(input: {
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
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord; replayed: boolean }>;
  createReservedVmRedeployOperation(input: {
    projectId: string;
    deploymentId: string;
    organizationId: string;
    actorUserId: string;
    idempotencyKey: string;
    requestHash: string;
    expectedRuntimeVersion: number;
    planEntitlements: ReleasePlanEntitlementsPin;
    projectManifestDigest: string;

    /** AES-GCM envelope; build values never enter Deployment JSON as plaintext. */
    encryptedBuildInput: ReservedVmEncryptedPayload;
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord; replayed: boolean }>;
  createReservedVmDecommissionOperation(input: {
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
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord; replayed: boolean }>;
  getReservedVmOperation(projectId: string, idempotencyKey: string): Promise<ReservedVmOperationRecord | undefined>;
  acquireReservedVmOperation(input: {
    projectId: string;
    idempotencyKey: string;
    ownerToken: string;
    ttlMs: number;
  }): Promise<{ operation: ReservedVmLease; deployment: DeploymentRecord; acquired: boolean }>;
  acquireReservedVmCreateCancellation(input: {
    projectId: string;
    deploymentId: string;
    actorUserId: string;
    ownerToken: string;
    ttlMs: number;
  }): Promise<{ operation: ReservedVmLease; deployment: DeploymentRecord; acquired: boolean }>;
  claimNextReservedVmCreateCancellation(input: {
    ownerToken: string;
    ttlMs: number;
  }): Promise<{ operation: ReservedVmLease; deployment: DeploymentRecord } | undefined>;
  claimNextRecoverableReservedVmOperation(input: {
    ownerToken: string;
    ttlMs: number;
    kinds?: Array<'CREATE' | 'CHANGE' | 'REDEPLOY' | 'DECOMMISSION'>;
  }): Promise<{ operation: ReservedVmLease; deployment: DeploymentRecord } | undefined>;
  prepareReservedVmPublish(input: {
    projectId: string;
    deploymentId: string;
    organizationId: string;
    actorUserId: string;
    expectedRuntimeVersion: number;
    releaseFence: ProjectReleaseFence;
  }): Promise<{ deployment: DeploymentRecord; releaseSource: ReleaseManifestRecord }>;
  publishReservedVmInPlace(input: {
    projectId: string;
    deploymentId: string;
    organizationId: string;
    actorUserId: string;
    expectedRuntimeVersion: number;
    productionUrl: string;
    sourceReleaseManifestId: string;
    releaseFence: ProjectReleaseFence;
  }): Promise<DeploymentRecord>;
  markReservedVmRuntimeApplied(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
  }): Promise<boolean>;
  commitReservedVmOperation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    response: Record<string, unknown>;
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord }>;
  commitReservedVmDecommissionOperation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    deletedPersistentStorageClaim: string;
    response: Record<string, unknown>;
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord }>;
  commitReservedVmCreateCancellation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    deletedPersistentStorageClaim: string;
    logs: DeploymentRecord['logs'];
  }): Promise<{ operation: ReservedVmOperationRecord; deployment: DeploymentRecord; replayed: boolean }>;
  failReservedVmOperation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
    createCleanup?: {
      deletedPersistentStorageClaim: string;
    };
  }): Promise<ReservedVmOperationRecord>;
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
        /** Metadata retained for status consumers, including the immutable publication policy pin. */
        metadata?: unknown;
      }
    | undefined
  >;
  getDeploymentAccessContext(deploymentId: string): Promise<DeploymentAccessContext | undefined>;
  getDeploymentAccessPolicy(deploymentId: string): Promise<DeploymentAccessPolicyRecord | undefined>;
  setDeploymentAccessPolicy(input: {
    projectId: string;
    deploymentId: string;
    mode: DeploymentAccessMode;
    passwordHash?: string;
    createdByUserId?: string;
    expectedVersion?: number;

    /** READY deployments append a config-only ReleaseManifest from this source. */
    releaseSource?: ReleaseManifestRecord;
  }): Promise<DeploymentAccessPolicyRecord | undefined>;
  isDeploymentAccessUserAuthorized(input: {
    deploymentId: string;
    userId: string;
    mode: Extract<DeploymentAccessMode, 'WORKSPACE_ONLY' | 'INVITE_ONLY'>;
  }): Promise<boolean>;
  issueDeploymentAccessExchangeTicket(input: {
    deploymentId: string;
    userId: string;
    tokenHash: string;
    ttlSeconds: number;
  }): Promise<DeploymentAccessTicketMutationResult>;
  consumeDeploymentAccessExchangeTicket(input: {
    deploymentId: string;
    tokenHash: string;
  }): Promise<DeploymentAccessTicketMutationResult>;
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
    accessPolicyVersion: number;
    planEntitlements: ReleasePlanEntitlementsPin;
    projectManifestDigest: string;
  }): Promise<ReleaseManifestRecord>;
  listReleaseManifests(
    projectId: string,
    environment: string,
    options?: { take?: number },
  ): Promise<ReleaseManifestRecord[]>;
  getReleaseManifest(projectId: string, manifestId: string): Promise<ReleaseManifestRecord | undefined>;

  /**
   * Insert, reacquire, or replay a project-scoped operation. `ACQUIRED` is
   * returned only while the caller owns a live PostgreSQL-clock lease.
   */
  acquireRollbackOperation(input: {
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
  }>;
  getRollbackOperation(projectId: string, idempotencyKey: string): Promise<RollbackOperationRecord | undefined>;
  renewRollbackOperationLease(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    leaseDurationMs: number;
  }): Promise<string | undefined>;
  validateRollbackOperationLease(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
  }): Promise<boolean>;
  bindRollbackOperationTarget(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    deploymentId: string;
    expectedHeadVersion: number;
    previousManifestId: string;
    projectManifestDigest: string;
  }): Promise<RollbackOperationRecord>;
  ensureRollbackDeployment(input: {
    fence: Omit<RollbackLeaseFence, 'expectedHeadVersion'>;
    deployment: RollbackDeploymentCreateInput;
  }): Promise<DeploymentRecord>;
  updateRollbackDeployment(input: {
    fence: Omit<RollbackLeaseFence, 'expectedHeadVersion'>;
    projectId: string;
    deploymentId: string;
    patch: Partial<Omit<DeploymentRecord, 'id' | 'projectId' | 'createdAt'>>;
  }): Promise<DeploymentRecord>;

  /** Persist intent before the first non-transactional filesystem/Kubernetes effect. */
  beginRollbackEffect(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
  }): Promise<RollbackOperationRecord>;

  /** Persist that failed external effects were proven absent before replay is finalizable. */
  completeRollbackEffectCleanup(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
  }): Promise<RollbackOperationRecord>;
  completeRollbackOperation(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    responseStatus: number;
    responseContentLanguage: 'en' | 'fr';
    responseBody: unknown;
  }): Promise<RollbackOperationRecord>;

  /** Atomically append a static rollback manifest and transition to READY. */
  commitStaticRollbackRelease(input: StaticRollbackReleaseCommitInput): Promise<{
    deployment: DeploymentRecord;
    manifest: ReleaseManifestRecord;
  }>;
  /** Atomically append an ordinary static manifest and transition to READY. */
  commitStaticRelease(input: StaticReleaseCommitInput): Promise<StaticReleaseCommitResult>;
  /** Atomically append the server-image manifest and transition to READY. */
  commitServerImageRelease(input: ServerImageReleaseCommitInput): Promise<ServerImageReleaseCommitResult>;
  /** Atomically revalidate org/manifest/fence and publish a legacy server runtime. */
  commitFencedServerReady(input: FencedServerReadyCommitInput): Promise<DeploymentRecord>;

  /** Durable promotion evidence retained independently of a prunable Deployment row. */
  getServerImageReleasePromotion(deploymentId: string): Promise<unknown | undefined>;

  /** Latest append-only ProjectManifest revision, or undefined for a legacy row. */
  getLatestProjectManifest(projectId: string): Promise<ProjectManifestRevisionRecord | undefined>;

  /**
   * Append exactly the next version. The store serializes by project across API
   * replicas and compares `expectedDigest` under that lock. A retry whose exact
   * digest already won is idempotent; any other stale write fails with
   * PROJECT_MANIFEST_VERSION_CONFLICT.
   */
  createProjectManifestRevision(input: {
    projectId: string;
    schemaVersion: number;
    manifestVersion: number;
    digest: string;
    manifest: unknown;
    expectedDigest?: string;
    createdByUserId?: string;
  }): Promise<ProjectManifestRevisionRecord>;

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

  /** One immutable historical routing card, used to replay a pinned provider intent. */
  getAgentRoutingCard(version: number): Promise<{ version: number; data: unknown } | undefined>;

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
    createdByUserId?: string;
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

  /**
   * Look up an OAuth connection by its provider identity, to reject linking a
   *  provider account already bound to a DIFFERENT user (account-takeover guard).
   */
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

  /** Reserve a bounded AI charge in the canonical 0095 ledger. */
  reserveCanonicalUserSpend(input: {
    organizationId: string;
    userId: string;
    projectId: string;
    idempotencyKey: string;
    maxAmountCents: number;
    periodStart?: string;
    expiresInMs: number;
    requestHash: string;
    enforceUserSpendLimit: boolean;
  }): Promise<CanonicalUserSpendReservationRecord>;

  /** Durable DB-clock latch written immediately before the first provider call. */
  claimCanonicalAiExecution(input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    projectId: string;
    requestId: string;
    claimOwnerId: string;
    claimLeaseMs: number;
  }): Promise<{
    claimedAt: string;
    leaseExpiresAt: string;
    executionToken: string;
    replayed: boolean;
    reservationStatus: string;
    platformReceipt?: { state: 'exact' | 'recovered'; outcome?: 'hard' | 'easy' };
  }>;

  /** User-spend latch written immediately before the first user-billed provider call. */
  markCanonicalUserSpendStarted(input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    projectId: string;
    requestId: string;
    executionToken: string;
    reconcileAfterMs: number;
  }): Promise<{ startedAt: string; replayed: boolean }>;

  /** Idempotent platform-cost receipt (for example the non-user-billed classifier). */
  markCanonicalPlatformAiUsageStarted(input: {
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
  }): Promise<{ startedAt: string; replayed: boolean }>;

  /** Idempotent platform-cost receipt (for example the non-user-billed classifier). */
  recordCanonicalPlatformAiUsage(input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    requestId: string;
    executionToken: string;
    projectId: string;
    call: CanonicalAiUsageInput;
    outcome: 'hard' | 'easy';
    agentRouting: CanonicalAiClassifierRoutingSelection & { escalated: boolean };
  }): Promise<{ usage: AiCostLedgerRecord; replayed: boolean }>;

  /** Persist every provider-priced call, then settle one canonical reservation. */
  commitCanonicalUserSpendBatch(
    input: CanonicalAiUsageBatchInput,
  ): Promise<{ committedCents: number; replayed: boolean; usages: AiCostLedgerRecord[] }>;

  /** DB-clock, cross-replica recovery for STARTED/received AI reservations. */
  reconcileCanonicalUserSpend(options?: { take?: number }): Promise<{
    scanned: number;
    settled: number;
    recoveredAtCeiling: number;
    recoveredPlatformAtCeiling: number;
    manualRecovery: number;
    retryableFailures: number;
    reservationIds: string[];
  }>;

  /** Release expired generic holds; STARTED canonical AI holds remain protected. */
  reapExpiredLedgerReservations(): Promise<string[]>;

  /** Settle the exact charge and release the unused reservation remainder. */
  commitCanonicalUserSpend(input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    /** Undefined when the observed provider/model cannot be authoritatively priced. */
    actualAmountCents?: number;
    usage: Omit<CanonicalAiUsageInput, 'callId' | 'kind'>;
  }): Promise<{ committedCents: number; replayed: boolean; usage: AiCostLedgerRecord }>;

  /** Release a failed/cancelled generation's canonical reservation. */
  releaseCanonicalUserSpend(reservationId: string): Promise<{ released: boolean }>;

  /** Legacy wallet/checkpoint projection; never authoritative for plan enforcement. */
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
  findUsageEventByReference(input: {
    organizationId: string;
    type: string;
    reference: string;
    since: Date;
  }): Promise<UsageEventRecord | undefined>;

  /** True if a usage event of `type` was recorded for the org at/after `sinceMs` — used to dedup the daily storage meter. */
  hasUsageEventSince(organizationId: string, type: string, sinceMs: number): Promise<boolean>;
  sumUsage(organizationId: string, type: string, since?: Date): Promise<number>;
  createQuotaOverride(input: {
    organizationId: string;
    key: QuotaOverrideKey;
    limit: number;
    reason: string;
    createdByUserId?: string;
    expiresAt?: Date;
  }): Promise<QuotaOverrideRecord>;
  listQuotaOverrides(organizationId: string): Promise<QuotaOverrideRecord[]>;
  getQuotaOverride(organizationId: string, key: QuotaOverrideKey): Promise<QuotaOverrideRecord | undefined>;
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
  updateWorkspaceStatus(input: {
    workspaceId: string;
    expectedProjectId: string;
    expectedOrganizationId: string;
    status: WorkspaceRecord['status'];
  }): Promise<WorkspaceRecord>;
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

  /** Tenant-scoped, stable keyset page for the customer Security Center. */
  listOrganizationSecurityAuditEventsPage(input: {
    organizationId: string;
    limit: number;
    cursor?: { createdAt: string; id: string };
  }): Promise<SecurityAuditEventPage>;

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
