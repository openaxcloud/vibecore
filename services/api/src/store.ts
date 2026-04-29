import { hashToken } from '@vibecore/auth';
import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
import type { PlanKey, QuotaKey } from '@vibecore/billing';

export interface UserRecord {
  id: string;
  email: string;
  name?: string;
  passwordHash?: string;
  emailVerifiedAt?: string;
  mfaEnabled?: boolean;
  mfaSecretEncrypted?: string;
  platformAdmin?: boolean;
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

export interface ProjectIdeStateRecord {
  projectId: string;
  state: unknown;
  version: number;
  updatedByUserId?: string;
  updatedAt: string;
  createdAt: string;
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

export interface ApiStore {
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
    emailVerifiedAt?: string;
    mfaEnabled?: boolean;
    mfaSecretEncrypted?: string;
    platformAdmin?: boolean;
  }): Promise<UserRecord>;
  findUserByEmail(email: string): Promise<UserRecord | undefined>;
  findUserById(id: string): Promise<UserRecord | undefined>;
  createSession(input: {
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<SessionRecord>;
  findSessionByToken(token: string): Promise<SessionRecord | undefined>;
  listSessions(userId: string): Promise<SessionRecord[]>;
  revokeSession(userId: string, sessionId: string): Promise<boolean>;
  revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number>;
  markSessionReauthenticated(sessionId: string): Promise<SessionRecord | undefined>;
  createEmailVerification(input: { userId: string; token: string; expiresAt: Date }): Promise<void>;
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
  updateProject(input: {
    projectId: string;
    name?: string;
    description?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
  }): Promise<ProjectRecord>;
  listProjects(organizationId: string): Promise<ProjectRecord[]>;
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
  upsertProjectSecret(input: { projectId: string; key: string; valueEncrypted: string }): Promise<ProjectSecretRecord>;
  listProjectSecrets(projectId: string): Promise<Array<Omit<ProjectSecretRecord, 'valueEncrypted'>>>;
  getProjectSecret(projectId: string, key: string): Promise<ProjectSecretRecord | undefined>;
  addProjectCollaborator(input: {
    projectId: string;
    userId: string;
    roleKey: string;
  }): Promise<ProjectCollaboratorRecord>;
  listProjectCollaborators(projectId: string): Promise<ProjectCollaboratorRecord[]>;
  recordProjectActivity(input: {
    projectId: string;
    actorUserId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProjectActivityRecord>;
  listProjectActivity(projectId: string): Promise<ProjectActivityRecord[]>;
  getProjectIdeState(projectId: string): Promise<ProjectIdeStateRecord | undefined>;
  upsertProjectIdeState(input: {
    projectId: string;
    state: unknown;
    updatedByUserId?: string;
  }): Promise<ProjectIdeStateRecord>;
  createWorkspace(input: { projectId: string; name: string; runtimeMode: string }): Promise<WorkspaceRecord>;
  getWorkspace(id: string): Promise<WorkspaceRecord | undefined>;
  listWorkspaces(projectId: string): Promise<WorkspaceRecord[]>;
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
  createDeployment(input: {
    projectId: string;
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
  updateDeployment(
    projectId: string,
    deploymentId: string,
    input: Partial<Omit<DeploymentRecord, 'id' | 'projectId' | 'createdAt'>>,
  ): Promise<DeploymentRecord>;
  listDeployments(projectId: string): Promise<DeploymentRecord[]>;
  createSupportTicket(input: { organizationId: string; userId: string; subject: string }): Promise<SupportTicketRecord>;
  listSupportTickets(organizationId: string): Promise<SupportTicketRecord[]>;
  setFeatureFlag(input: { organizationId?: string; key: string; enabled: boolean }): Promise<FeatureFlagRecord>;
  listFeatureFlags(organizationId?: string): Promise<FeatureFlagRecord[]>;
  createAbuseEvent(input: {
    organizationId?: string;
    userId?: string;
    type: string;
    severity: string;
  }): Promise<AbuseEventRecord>;
  listAbuseEvents(): Promise<AbuseEventRecord[]>;
  setSystemSetting(input: { key: string; value?: unknown }): Promise<SystemSettingRecord>;
  listSystemSettings(): Promise<SystemSettingRecord[]>;
  getEnterpriseSettings(organizationId: string): Promise<EnterpriseSettingsRecord>;
  updateEnterpriseSettings(
    input: Partial<Omit<EnterpriseSettingsRecord, 'updatedAt'>> & { organizationId: string },
  ): Promise<EnterpriseSettingsRecord>;
  createDomainVerification(input: {
    organizationId: string;
    domain: string;
    verificationToken: string;
  }): Promise<DomainVerificationRecord>;
  verifyDomain(input: { organizationId: string; domain: string }): Promise<DomainVerificationRecord | undefined>;
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
  createOrganizationInvite(input: {
    organizationId: string;
    email: string;
    roleKey: string;
    token: string;
    expiresAt: Date;
  }): Promise<OrganizationInviteRecord>;
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
  createAiConversation(input: { projectId?: string; userId: string; title?: string }): Promise<AiConversationRecord>;
  getAiConversation(id: string): Promise<AiConversationRecord | undefined>;
  createAiMessage(input: {
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
  listAiCosts(organizationId: string): Promise<AiCostLedgerRecord[]>;
  upsertBillingPlan(input: {
    key: PlanKey;
    name: string;
    monthlyCents: number;
    limits: Record<string, number>;
    stripeProductId?: string;
    stripePriceId?: string;
  }): Promise<BillingPlanRecord>;
  listBillingPlans(): Promise<BillingPlanRecord[]>;
  getBillingPlan(key: PlanKey): Promise<BillingPlanRecord | undefined>;
  upsertBillingCustomer(input: {
    organizationId: string;
    provider: string;
    externalId: string;
  }): Promise<BillingCustomerRecord>;
  getBillingCustomer(organizationId: string): Promise<BillingCustomerRecord | undefined>;
  upsertSubscription(input: {
    organizationId: string;
    planKey: PlanKey;
    externalId?: string;
    status: SubscriptionRecord['status'];
    cancelAtPeriodEnd?: boolean;
    trialEndsAt?: Date;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  }): Promise<SubscriptionRecord>;
  getSubscription(organizationId: string): Promise<SubscriptionRecord | undefined>;
  recordUsageEvent(input: {
    organizationId: string;
    userId?: string;
    type: string;
    quantity?: number;
    metadata?: unknown;
  }): Promise<UsageEventRecord>;
  listUsageEvents(organizationId: string): Promise<UsageEventRecord[]>;
  sumUsage(organizationId: string, type: string): Promise<number>;
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
}

export function permissionsForRole(roleKey: string): PermissionKey[] {
  return rolePermissions[roleKey] ?? [];
}
