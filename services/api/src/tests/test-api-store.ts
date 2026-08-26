import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
import { hashToken } from '@vibecore/auth';
import type { PlanKey, QuotaKey } from '@vibecore/billing';
import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
import { DEFAULT_ENV_VAR_SCOPE } from '../store.js';
import { isCommittedPromotionForTenant, SERVER_IMAGE_RELEASE_AUDIT_ACTION } from '../server-image-promotion.js';
import type {
  EnvVarScope,
  AbuseEventRecord,
  SecurityEventResolutionRecord,
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
  ProjectConnectionLinkRecord,
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
  ProjectRecord,
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

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function now() {
  return new Date().toISOString();
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
  readonly workspaces = new Map<string, WorkspaceRecord>();
  readonly snapshots = new Map<string, SnapshotRecord>();
  readonly projectStorageObjects = new Map<string, ProjectStorageObjectRecord>();
  readonly databaseInstances = new Map<string, DatabaseInstanceRecord>();
  readonly databaseSnapshots = new Map<string, DatabaseSnapshotRecord>();
  readonly databaseRestores = new Map<string, DatabaseRestoreRecord>();
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
  readonly supportTickets = new Map<string, SupportTicketRecord>();
  readonly ticketMessages: TicketMessageRecord[] = [];
  readonly featureFlags = new Map<string, FeatureFlagRecord>();
  readonly abuseEvents = new Map<string, AbuseEventRecord>();
  readonly securityEventResolutions = new Map<string, SecurityEventResolutionRecord>();
  readonly integrationFeatureRequests = new Map<string, IntegrationFeatureRequestRecord>();

  // Keyed `${userId}:${messageId}` — mirrors the prisma @@unique([userId, messageId]).
  readonly aiMessageFeedback = new Map<string, AiMessageFeedbackRecord>();
  readonly systemSettings = new Map<string, SystemSettingRecord>();
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

  async ping(): Promise<void> {
    // In-memory store is always reachable.
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
    const session = {
      id: id('session'),
      userId: input.userId,
      tokenHash: hashToken(input.token),
      expiresAt: input.expiresAt.toISOString(),
      createdAt: now(),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      impersonatedBy: input.impersonatedBy,
    };
    this.sessions.set(session.tokenHash, session);

    return session;
  }

  async findSessionByToken(token: string) {
    const session = this.sessions.get(hashToken(token));

    if (!session || session.revokedAt || new Date(session.expiresAt).getTime() < Date.now()) {
      return undefined;
    }

    return session;
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
  }) {
    const createdAt = now();

    const project: ProjectRecord = {
      id: id('project'),
      organizationId: input.organizationId,
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
    this.projects.set(project.id, project);

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
    name?: string;
    description?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
  }) {
    const project = this.projects.get(input.projectId);

    if (!project) {
      throw Object.assign(new Error('Project not found'), { statusCode: 404, code: 'PROJECT_NOT_FOUND' });
    }

    Object.assign(project, {
      name: input.name ?? project.name,
      description: input.description ?? project.description,
      gitRepositoryUrl: input.gitRepositoryUrl ?? project.gitRepositoryUrl,
      gitDefaultBranch: input.gitDefaultBranch ?? project.gitDefaultBranch,
      updatedAt: now(),
    });

    return project;
  }

  readonly projectSlugRedirects: Array<{ projectId: string; oldSlug: string; expiresAt: Date }> = [];

  async renameProjectSlug(input: { projectId: string; newSlug: string; redirectTtlDays?: number }) {
    const project = this.projects.get(input.projectId);

    if (!project) {
      throw Object.assign(new Error('Project not found'), { statusCode: 404, code: 'PROJECT_NOT_FOUND' });
    }

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

  async countProjects(organizationId: string) {
    const visible = await this.listProjects(organizationId);
    const partial = [...this.remixJobs.values()].filter(
      (job) =>
        job.organizationId === organizationId && job.targetProjectId && !['COMPLETED', 'FAILED'].includes(job.state),
    ).length;

    return visible.length + partial;
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

  async softDeleteProject(projectId: string) {
    const project = await this.updateProject({ projectId });
    project.deletedAt = now();
    project.updatedAt = now();

    return project;
  }

  async restoreProject(projectId: string) {
    const project = await this.updateProject({ projectId });
    project.deletedAt = undefined;
    project.updatedAt = now();

    return project;
  }

  async hardDeleteProject(projectId: string) {
    const project = await this.updateProject({ projectId });
    this.projects.delete(projectId);

    return project;
  }

  async transferProject(input: { projectId: string; targetOrganizationId: string }) {
    const project = await this.updateProject({ projectId: input.projectId });
    project.organizationId = input.targetOrganizationId;
    project.updatedAt = now();

    return project;
  }

  async duplicateProject(input: { projectId: string; name: string; slug: string; organizationId?: string }) {
    const source = this.projects.get(input.projectId);

    if (!source) {
      throw Object.assign(new Error('Project not found'), { statusCode: 404, code: 'PROJECT_NOT_FOUND' });
    }

    return this.createProject({
      organizationId: input.organizationId ?? source.organizationId,
      name: input.name,
      slug: input.slug,
      description: source.description,
      sourceType: 'duplicate',
      templateName: source.templateName,
      gitRepositoryUrl: source.gitRepositoryUrl,
      gitDefaultBranch: source.gitDefaultBranch,
    });
  }

  async createProjectTemplate(input: {
    sourceProjectId: string;
    organizationId: string;
    name: string;
    description?: string;
  }) {
    const template: ProjectTemplateRecord = { id: id('template'), ...input, createdAt: now() };
    this.projectTemplates.set(template.id, template);

    return template;
  }

  async listProjectTemplates(organizationId: string) {
    return [...this.projectTemplates.values()].filter((template) => template.organizationId === organizationId);
  }

  async upsertProjectEnvVar(input: { projectId: string; key: string; value: string; scope?: EnvVarScope }) {
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
  }

  async listProjectEnvVars(projectId: string) {
    return [...this.projectEnvVars.values()].filter((envVar) => envVar.projectId === projectId);
  }

  async deleteProjectEnvVar(projectId: string, key: string, scope?: EnvVarScope) {
    const targetScope = scope ?? DEFAULT_ENV_VAR_SCOPE;
    const mapKey = `${projectId}:${key}:${targetScope}`;
    const existing = this.projectEnvVars.get(mapKey);
    this.projectEnvVars.delete(mapKey);

    return existing;
  }

  async upsertProjectSecret(input: { projectId: string; key: string; valueEncrypted: string }) {
    const key = `${input.projectId}:${input.key}`;
    const existing = this.projectSecrets.get(key);

    const secret: ProjectSecretRecord = {
      id: existing?.id ?? id('secret'),
      ...input,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    };
    this.projectSecrets.set(key, secret);

    return secret;
  }

  async listProjectSecrets(projectId: string) {
    return [...this.projectSecrets.values()]
      .filter((secret) => secret.projectId === projectId)
      .map(({ valueEncrypted: _valueEncrypted, ...safeSecret }) => safeSecret);
  }

  async getProjectSecret(projectId: string, key: string) {
    return this.projectSecrets.get(`${projectId}:${key}`);
  }

  async deleteProjectSecret(projectId: string, key: string) {
    const mapKey = `${projectId}:${key}`;
    const existing = this.projectSecrets.get(mapKey);
    this.projectSecrets.delete(mapKey);

    return existing;
  }

  async addProjectCollaborator(input: { projectId: string; userId: string; roleKey: string; expiresAt?: Date | null }) {
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

  async removeProjectCollaborator(input: { projectId: string; userId: string }) {
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
    actorUserId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }) {
    const activity: ProjectActivityRecord = { id: id('activity'), ...input, createdAt: now() };
    this.projectActivity.set(activity.id, activity);

    return activity;
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

  async upsertProjectIdeState(input: { projectId: string; state: unknown; updatedByUserId?: string }) {
    const existing = this.projectIdeStates.get(input.projectId);

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

  async upsertWorkspaceIdeState(input: { workspaceId: string; state: unknown; updatedByUserId?: string }) {
    const existing = this.workspaceIdeStates.get(input.workspaceId);

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

  async updateWorkspaceGitRepositoryUrl(input: { workspaceId: string; gitRepositoryUrl: string | null }) {
    const workspace = this.workspaces.get(input.workspaceId);

    if (!workspace) {
      throw Object.assign(new Error('Workspace not found'), { statusCode: 404, code: 'WORKSPACE_NOT_FOUND' });
    }

    const updated: WorkspaceRecord = {
      ...workspace,
      gitRepositoryUrl: input.gitRepositoryUrl ?? undefined,
    };
    this.workspaces.set(workspace.id, updated);

    return updated;
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

  async removeCollaborationPresence(projectId: string, sessionId: string) {
    const existing = [...this.collaborationPresence.values()].find(
      (presence) => presence.projectId === projectId && presence.sessionId === sessionId,
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
    userId: string;
    filePath?: string;
    line?: number;
    selection?: unknown;
    body: string;
  }) {
    const comment: CollaborationCommentRecord = { id: id('comment'), ...input, createdAt: now() };
    this.collaborationComments.set(comment.id, comment);

    return comment;
  }

  async listCollaborationComments(projectId: string) {
    return [...this.collaborationComments.values()].filter((comment) => comment.projectId === projectId);
  }

  async createProjectShareLink(input: {
    projectId: string;
    tokenHash: string;
    roleKey: ProjectShareLinkRecord['roleKey'];
    expiresAt: Date;
    createdByUserId?: string;
  }) {
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

  async revokeProjectShareLink(input: { projectId: string; id: string }) {
    const link = this.projectShareLinks.get(input.id);

    if (!link || link.projectId !== input.projectId || link.revokedAt) {
      return false;
    }

    this.projectShareLinks.set(input.id, { ...link, revokedAt: now() });

    return true;
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

  async revokeChatShare(input: { id: string; authorUserId?: string; projectId?: string }) {
    for (const [key, share] of this.chatShares.entries()) {
      if (
        share.id === input.id &&
        !share.revokedAt &&
        (!input.authorUserId || share.authorUserId === input.authorUserId) &&
        (!input.projectId || share.projectId === input.projectId)
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
    messageId?: string;
    artifactId?: string;
    actionId?: string;
    relativePath: string;
    attempt?: number;
    outcome: AgentRepairOutcome;
    validationError?: string;
    repairError?: string;
  }) {
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

  async setProjectSkillEnabled(input: { projectId: string; skillId: string; enabled: boolean }) {
    const record = { skillId: input.skillId, enabled: input.enabled, updatedAt: new Date().toISOString() };
    this.projectSkillOverrides.set(`${input.projectId}:${input.skillId}`, record);

    return record;
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
    name: string;
    runtimeMode: string;
    environment?: string;
  }) {
    const workspaceId = input.id ?? id('workspace');

    const workspace: WorkspaceRecord = {
      id: workspaceId,
      projectId: input.projectId,
      name: input.name,
      runtimeMode: input.runtimeMode,
      status: 'PENDING',
      gitPath: `.vibecore-workspaces/${workspaceId}`,
      environment: input.environment ?? 'development',
      createdAt: now(),
    };
    this.workspaces.set(workspace.id, workspace);

    return workspace;
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
    label?: string;
    kind?: SnapshotRecord['kind'];
    manifest: unknown;
    storageKey?: string;
    byteLength?: number;
    createdByUserId?: string;
    conversationId?: string;
    turnIndex?: number;
  }) {
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
    const snapshot: SnapshotRecord = {
      ...input,
      id: input.id ?? id('snapshot'),
      kind: input.kind ?? 'manual',
      createdAt: now(),
    };
    this.snapshots.set(snapshot.id, snapshot);

    return snapshot;
  }

  async getSnapshot(id: string) {
    return this.snapshots.get(id);
  }

  async listSnapshots(projectId: string) {
    return [...this.snapshots.values()].filter((snapshot) => snapshot.projectId === projectId);
  }

  async putProjectStorageObject(input: {
    projectId?: string;
    key: string;
    kind: ProjectStorageObjectRecord['kind'];
    contentBase64: string;
    byteLength: number;
    contentHash: string;
  }) {
    const existing = this.projectStorageObjects.get(input.key);

    const object: ProjectStorageObjectRecord = {
      id: existing?.id ?? id('storage_object'),
      ...input,
      createdAt: existing?.createdAt ?? now(),
    };
    this.projectStorageObjects.set(input.key, object);

    return object;
  }

  async getProjectStorageObject(key: string) {
    return this.projectStorageObjects.get(key);
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
      if (row.requestHash !== input.requestHash) return { kind: 'IDEMPOTENCY_COLLISION' as const, execution: row };
      if (row.state === 'COMMITTED') return { kind: 'REPLAYED' as const, execution: row };
      if (row.state === 'FAILED_SAFE') return { kind: 'FAILED' as const, execution: row };
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
    )
      return undefined;
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
    if (!(await this.validateDatabaseMigrationLease({ ...input, state: input.expectedState }))) return undefined;
    const release = input.release === true;
    const retainLock = input.retainLock === true;
    if (release && retainLock) throw new TypeError('migration transition cannot release and retain its lock');
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
    organizationId: string;
    retentionDays: number;
    region?: string;
    environment?: string;
    provisioningDeadlineAt?: string;
  }) {
    const instance: DatabaseInstanceRecord = {
      id: id('database_instance'),
      projectId: input.projectId,
      organizationId: input.organizationId,
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
  }

  async acquireDatabaseProvisioning(input: {
    projectId: string;
    organizationId: string;
    retentionDays: number;
    region?: string;
    environment?: string;
    provisioningDeadlineAt: string;
  }) {
    const environment = input.environment === 'production' ? 'production' : 'development';
    // Deliberately inspect and mutate the in-memory record without an await in
    // between. This mirrors the single-row conditional UPDATE used by the
    // Prisma store, so concurrency tests cannot grant two retry claims merely
    // because this test double yielded at the wrong point.
    const existing = Array.from(this.databaseInstances.values()).find(
      (row) => row.projectId === input.projectId && row.environment === environment,
    );

    if (!existing) {
      const instance = await this.createDatabaseInstance({ ...input, environment });

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
  }

  async completeDatabaseProvisioning(
    instanceId: string,
    connection: { projectId: string; key: string; valueEncrypted: string },
  ) {
    const instance = this.databaseInstances.get(instanceId);

    if (!instance || instance.projectId !== connection.projectId || instance.status !== 'PROVISIONING') {
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
    await this.upsertProjectSecret(connection);
    this.databaseInstances.set(instanceId, updated);

    return updated;
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
    startedAt?: string;
    finishedAt?: string;
    canceledAt?: string;
  }) {
    const deployment: DeploymentRecord = {
      id: id('deployment'),
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      provider: input.provider,
      environment: input.environment ?? 'preview',
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
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      canceledAt: input.canceledAt,
      createdAt: now(),
      updatedAt: now(),
    };
    this.deployments.set(deployment.id, deployment);

    return deployment;
  }

  async getDeployment(projectId: string, deploymentId: string) {
    const deployment = this.deployments.get(deploymentId);
    return deployment?.projectId === projectId ? deployment : undefined;
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
    };
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
    return [...this.deployments.values()].filter((deployment) => deployment.projectId === projectId);
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
  }): Promise<ReleaseManifestRecord> {
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

  async commitServerImageRelease(input: ServerImageReleaseCommitInput): Promise<ServerImageReleaseCommitResult> {
    return this.withSerializedMutation(`server-release:${input.deploymentId}`, async () => {
      const deployment = this.deployments.get(input.deploymentId);

      if (!deployment || deployment.projectId !== input.projectId) {
        throw new Error(`Deployment not found: ${input.deploymentId}`);
      }

      const project = this.projects.get(input.projectId);
      const serverDeploy = input.metadata.serverDeploy as Record<string, unknown> | undefined;
      const image = serverDeploy?.image as Record<string, unknown> | undefined;

      if (
        !project ||
        project.organizationId !== input.organizationId ||
        deployment.provider !== 'server' ||
        deployment.environment !== input.environment ||
        image?.imageRef !== input.artifactRef ||
        image?.imageDigest !== input.artifactDigest ||
        !isCommittedPromotionForTenant(
          serverDeploy?.promotion,
          project.organizationId,
          input.artifactDigest,
          input.artifactRef,
        )
      ) {
        throw new Error('SERVER_RELEASE_PROMOTION_NOT_COMMITTED');
      }

      const existing = this.releaseManifests.find((manifest) => manifest.deploymentId === input.deploymentId);

      if (existing) {
        if (
          existing.artifactKind !== 'server-image' ||
          existing.artifactRef !== input.artifactRef ||
          existing.artifactDigest !== input.artifactDigest
        ) {
          throw new Error('SERVER_RELEASE_MANIFEST_CONFLICT');
        }

        if (deployment.status !== 'READY') {
          throw new Error('SERVER_RELEASE_MANIFEST_WITHOUT_READY');
        }

        return { committed: true, deployment, manifest: existing };
      }

      if (['READY', 'FAILED', 'CANCELED'].includes(deployment.status)) {
        return { committed: false, deployment };
      }

      const latestVersion = this.releaseManifests
        .filter((manifest) => manifest.projectId === input.projectId && manifest.environment === input.environment)
        .reduce((max, manifest) => Math.max(max, manifest.version), 0);
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
        createdAt: now(),
      };
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
      return { committed: true, deployment: ready, manifest };
    });
  }

  async getServerImageReleasePromotion(deploymentId: string): Promise<unknown | undefined> {
    return [...this.adminAuditLogs]
      .reverse()
      .find(
        (event) => event.action === SERVER_IMAGE_RELEASE_AUDIT_ACTION && event.metadata?.deploymentId === deploymentId,
      )?.metadata?.promotion;
  }

  /** No DB-backed rate card in tests: callers fall back to the built-in card. */
  async getActiveRateCard(): Promise<{ version: number; data: unknown } | undefined> {
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
    createdByUserId?: string;
    idempotencyKey?: string;
    requestHash?: string;
  }) {
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
  }

  async acquireProjectCheckpointBarrier(input: {
    checkpointId: string;
    projectId: string;
    barrierId: string;
    ownerToken: string;
    ttlSeconds: number;
  }) {
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
  }

  async renewProjectCheckpointBarrier(input: {
    checkpointId: string;
    ownerToken: string;
    fence: number;
    ttlSeconds: number;
  }) {
    const row = this.projectCheckpoints.get(input.checkpointId);

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
    if (!row || row.barrierOwnerToken !== input.ownerToken || row.barrierFence !== input.fence) return false;
    row.barrierProjectId = null;
    row.barrierOwnerToken = null;
    row.barrierExpiresAt = null;
    return true;
  }

  async updateProjectCheckpoint(idv: string, patch: Record<string, unknown>) {
    const row = this.projectCheckpoints.get(idv);
    if (row) Object.assign(row, patch);
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
    const existing = [...this.remixJobs.values()].find(
      (job) => job.organizationId === input.organizationId && job.idempotencyKey === input.idempotencyKey,
    );

    if (existing) {
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

    Object.assign(row, input.patch ?? {}, { state: input.state, version: row.version + 1, updatedAt: now() });
    return row;
  }

  async releaseRemixJobLease(input: { id: string; organizationId: string; operationToken: string }) {
    const row = this.remixJobs.get(input.id);

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
  }) {
    const job = this.remixJobs.get(input.remixJobId);

    if (
      !job ||
      job.organizationId !== input.organizationId ||
      job.operationToken !== input.operationToken ||
      !job.operationExpiresAt ||
      Date.parse(job.operationExpiresAt) <= Date.now()
    ) {
      throw Object.assign(new Error('Remix ownership lost'), { statusCode: 409, code: 'REMIX_OWNERSHIP_LOST' });
    }

    if (job.targetProjectId) {
      const existing = this.projects.get(job.targetProjectId);
      if (existing) return existing;
    }

    const source = this.projects.get(job.sourceProjectId);
    if (!source) throw new Error('Project not found');
    const project = await this.createProject({
      organizationId: input.organizationId,
      name: input.name,
      slug: input.slug,
      description: source.description,
      sourceType: 'duplicate',
      templateName: source.templateName,
      gitRepositoryUrl: source.gitRepositoryUrl,
      gitDefaultBranch: source.gitDefaultBranch,
    });
    project.deletedAt = now();
    job.targetProjectId = project.id;
    job.version += 1;
    job.updatedAt = now();
    return project;
  }

  async completeClaimedRemixDatabase(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    databaseInstanceId: string;
    projectId: string;
    valueEncrypted: string;
  }) {
    const job = this.remixJobs.get(input.remixJobId);
    const instance = this.databaseInstances.get(input.databaseInstanceId);

    if (
      !job ||
      job.state !== 'DB_FORKING' ||
      job.organizationId !== input.organizationId ||
      job.operationToken !== input.operationToken ||
      job.targetProjectId !== input.projectId ||
      job.targetDatabaseInstanceId !== input.databaseInstanceId ||
      !instance ||
      instance.status !== 'PROVISIONING'
    ) {
      return undefined;
    }

    instance.status = 'ACTIVE';
    instance.pitrEnabled = true;
    await this.upsertProjectSecret({
      projectId: input.projectId,
      key: 'DATABASE_URL',
      valueEncrypted: input.valueEncrypted,
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
    targetProjectId: string;
  }) {
    const job = this.remixJobs.get(input.remixJobId);
    const project = this.projects.get(input.targetProjectId);

    if (
      !job ||
      job.state !== 'INDEXING' ||
      job.organizationId !== input.organizationId ||
      job.operationToken !== input.operationToken ||
      job.targetProjectId !== input.targetProjectId ||
      !project
    ) {
      return undefined;
    }

    project.deletedAt = undefined;
    job.state = 'COMPLETED';
    job.operationToken = undefined;
    job.operationExpiresAt = undefined;
    job.version += 1;
    job.updatedAt = now();
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

    if (!job || job.organizationId !== input.organizationId || job.state === 'COMPLETED') return undefined;
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
    if (!job || job.state !== 'CLEANUP_PENDING' || job.operationToken !== input.operationToken) return false;
    this.projects.delete(input.targetProjectId);
    job.targetProjectId = undefined;
    return true;
  }

  async finishRemixCleanup(input: { remixJobId: string; organizationId: string; operationToken: string }) {
    const job = this.remixJobs.get(input.remixJobId);
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
  }) {
    const existing = this.remixStorageShares.get(input.targetProjectId);
    if (existing) return existing;
    const row: RemixStorageShareRecord = {
      id: id('remix-share'),
      ...input,
      consentedAt: now(),
      state: 'ACTIVE',
    };
    this.remixStorageShares.set(input.targetProjectId, row);
    return row;
  }

  async getRemixStorageShareByTarget(targetProjectId: string) {
    const row = this.remixStorageShares.get(targetProjectId);
    return row?.state === 'ACTIVE' ? row : undefined;
  }

  async revokeRemixStorageShare(input: { targetProjectId: string; targetOrganizationId: string }) {
    const share = this.remixStorageShares.get(input.targetProjectId);
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
  }

  async deleteClaimedRemixStorageShare(input: {
    remixJobId: string;
    organizationId: string;
    operationToken: string;
    targetProjectId: string;
  }) {
    const job = this.remixJobs.get(input.remixJobId);
    if (
      !job ||
      job.organizationId !== input.organizationId ||
      job.state !== 'CLEANUP_PENDING' ||
      job.operationToken !== input.operationToken ||
      !job.operationExpiresAt ||
      Date.parse(job.operationExpiresAt) <= Date.now() ||
      job.targetProjectId !== input.targetProjectId
    ) {
      return false;
    }
    return this.remixStorageShares.delete(input.targetProjectId);
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
    idempotencyKey: string;
    requestHash: string;
    reservedCredits: number;
  }) {
    const existing = [...this.importJobs.values()].find(
      (job) => job.organizationId === input.organizationId && job.idempotencyKey === input.idempotencyKey,
    );

    if (existing) {
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
      expiresAt: input.expiresAt,
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
  }) {
    const row = this.importJobs.get(input.id);

    if (
      !row ||
      row.organizationId !== input.organizationId ||
      row.version !== input.expectedVersion ||
      !input.expectedStates.includes(row.state)
    ) {
      return undefined;
    }

    Object.assign(row, input.patch, { state: input.state, version: row.version + 1, updatedAt: now() });

    if (input.patch?.targetProjectId === null) row.targetProjectId = undefined;
    if (input.patch?.operationToken === null) row.operationToken = undefined;
    if (input.patch?.operationExpiresAt === null) row.operationExpiresAt = undefined;
    if (input.patch?.cleanupTerminalState === null) row.cleanupTerminalState = undefined;
    if (input.patch?.error === null) row.error = undefined;

    return row;
  }

  async createClaimedImportProject(input: {
    importJobId: string;
    organizationId: string;
    operationToken: string;
    name: string;
    slug: string;
    sourceType: ProjectRecord['sourceType'];
  }) {
    const job = this.importJobs.get(input.importJobId);

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

      if (existing) return existing;
    }

    const project = await this.createProject({
      organizationId: input.organizationId,
      name: input.name,
      slug: input.slug,
      sourceType: input.sourceType,
    });
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
  }) {
    const job = this.importJobs.get(input.importJobId);
    const reservation = this.importReservations.get(input.importJobId);

    if (
      !job ||
      !reservation ||
      job.organizationId !== input.organizationId ||
      job.state !== 'COMMITTING' ||
      job.targetProjectId !== input.targetProjectId ||
      job.operationToken !== input.operationToken ||
      reservation.state !== 'RESERVED'
    ) {
      return undefined;
    }

    reservation.state = 'SETTLED';
    reservation.debitedCredits = input.actualCredits;
    reservation.version += 1;
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

    if (reservation?.state === 'SETTLED') return undefined;
    if (reservation) {
      reservation.state = 'COMPENSATED';
      reservation.debitedCredits = 0;
      reservation.version += 1;
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

    if (
      !job ||
      job.organizationId !== input.organizationId ||
      job.state !== 'CLEANUP_PENDING' ||
      job.operationToken !== input.operationToken ||
      job.targetProjectId !== input.targetProjectId
    ) {
      return false;
    }

    this.projects.delete(input.targetProjectId);
    this.projectIdeStates.delete(input.targetProjectId);

    return true;
  }

  async finishImportCleanup(input: { importJobId: string; organizationId: string; operationToken: string }) {
    const job = this.importJobs.get(input.importJobId);

    if (
      !job ||
      job.organizationId !== input.organizationId ||
      job.state !== 'CLEANUP_PENDING' ||
      job.operationToken !== input.operationToken ||
      !job.cleanupTerminalState
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

    if (!job || job.organizationId !== organizationId) return undefined;
    if (job.state === 'CANCELLED') return job;
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

  async reapExpiredImportJobs(nowIso: string): Promise<string[]> {
    const now = new Date(nowIso).getTime();
    const terminal = new Set(['COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED']);
    const ids: string[] = [];

    for (const row of this.importJobs.values()) {
      const operationExpired = row.operationExpiresAt && new Date(row.operationExpiresAt).getTime() < now;
      const stagingExpired = row.expiresAt && new Date(row.expiresAt).getTime() < now;

      if (!terminal.has(row.state) && (operationExpired || stagingExpired)) {
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

  async createAiConversation(input: { projectId?: string; userId: string; title?: string }) {
    const conversation: AiConversationRecord = { id: id('ai_conv'), ...input, createdAt: now() };
    this.aiConversations.set(conversation.id, conversation);

    return conversation;
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
    return [...this.subscriptions.values()].find((subscription) => subscription.organizationId === organizationId);
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
    key: QuotaKey;
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

  async getQuotaOverride(organizationId: string, key: QuotaKey) {
    return [...this.quotaOverrides.values()]
      .filter(
        (override) =>
          override.organizationId === organizationId &&
          override.key === key &&
          (!override.expiresAt || new Date(override.expiresAt).getTime() > Date.now()),
      )
      .at(-1);
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

  async updateWorkspaceStatus(input: { workspaceId: string; status: WorkspaceRecord['status'] }) {
    const workspace = this.workspaces.get(input.workspaceId);

    if (!workspace) {
      throw Object.assign(new Error('Workspace not found'), { statusCode: 404, code: 'WORKSPACE_NOT_FOUND' });
    }

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
