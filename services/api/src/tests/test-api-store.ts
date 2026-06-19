import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
import { hashToken } from '@vibecore/auth';
import type { PlanKey, QuotaKey } from '@vibecore/billing';
import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
import type {
  AbuseEventRecord,
  AgentPatchProposalRecord,
  AgentPatchProposalStatus,
  ApiKeyRecord,
  ApiKeyScope,
  ApiStore,
  AiCostLedgerRecord,
  AiConversationRecord,
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
  CollaborationPresenceRecord,
  CustomRoleRecord,
  DeploymentRecord,
  DomainVerificationRecord,
  EmailDeliveryEventRecord,
  EnterpriseSettingsRecord,
  FeatureFlagRecord,
  MembershipRecord,
  OAuthConnectionRecord,
  ProjectConnectionLinkRecord,
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
  ProjectTemplateRecord,
  RecoveryCodeRecord,
  ScimTokenRecord,
  SessionRecord,
  SiemWebhookRecord,
  SnapshotRecord,
  StripeEventRecord,
  SubscriptionRecord,
  SsoConfigRecord,
  SupportTicketRecord,
  SystemSettingRecord,
  UserRecord,
  UsageEventRecord,
  WorkspaceIdeStateRecord,
  WorkspaceRecord,
  QuotaOverrideRecord,
  AdminAuditLogRecord,
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
  readonly chatShares = new Map<string, ChatShareRecord>();
  readonly agentPatchProposals = new Map<string, AgentPatchProposalRecord>();
  readonly projectTemplates = new Map<string, ProjectTemplateRecord>();
  readonly deployments = new Map<string, DeploymentRecord>();
  readonly supportTickets = new Map<string, SupportTicketRecord>();
  readonly featureFlags = new Map<string, FeatureFlagRecord>();
  readonly abuseEvents = new Map<string, AbuseEventRecord>();
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
  readonly aiConversations = new Map<string, AiConversationRecord>();
  readonly aiMessages = new Map<string, AiMessageRecord>();
  readonly aiToolCalls = new Map<string, AiToolCallRecord>();
  readonly aiTokenUsages = new Map<string, AiTokenUsageRecord>();
  readonly aiCostLedger = new Map<string, AiCostLedgerRecord>();
  readonly creditWallets = new Map<string, CreditWalletRecord>();
  readonly creditLedger = new Map<string, CreditLedgerRecord>();
  readonly creditPacks = new Map<string, CreditPackRecord>();
  readonly agentCheckpoints = new Map<string, AgentCheckpointRecord>();
  readonly providerConfigs = new Map<string, ProviderConfigRecord>();
  readonly modelConfigs = new Map<string, ModelConfigRecord>();
  readonly billingCustomers = new Map<string, BillingCustomerRecord>();
  readonly billingPlans = new Map<PlanKey, BillingPlanRecord>();
  readonly subscriptions = new Map<string, SubscriptionRecord>();
  readonly usageEvents = new Map<string, UsageEventRecord>();
  readonly quotaOverrides = new Map<string, QuotaOverrideRecord>();
  readonly stripeEvents = new Map<string, StripeEventRecord>();
  readonly emailDeliveryEvents: EmailDeliveryEventRecord[] = [];
  readonly auditLogs: AuditEvent[] = [];
  readonly adminAuditLogs: AdminAuditLogRecord[] = [];

  async ping(): Promise<void> {
    // In-memory store is always reachable.
  }

  async withSerializedMutation<T>(_key: string, fn: () => Promise<T>): Promise<T> {
    // Single-process test store — no cross-pod lock needed; just run the section.
    return fn();
  }

  async createUser(input: { email: string; name?: string; passwordHash: string; platformAdmin?: boolean }) {
    const user = {
      id: id('user'),
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: input.passwordHash,
      platformAdmin: input.platformAdmin,
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

  async createOrganization(input: { name: string; slug: string; ownerUserId: string }) {
    const org = { id: id('org'), slug: input.slug || slugify(input.name), name: input.name, createdAt: now() };
    this.organizations.set(org.id, org);
    await this.addMember({ organizationId: org.id, userId: input.ownerUserId, roleKey: 'owner' });

    return org;
  }

  async listOrganizations(userId: string) {
    const orgIds = [...this.memberships.values()]
      .filter((member) => member.userId === userId)
      .map((member) => member.organizationId);

    return orgIds.map((orgId) => this.organizations.get(orgId)).filter(Boolean) as OrganizationRecord[];
  }

  async getOrganization(id: string) {
    return this.organizations.get(id);
  }

  async addMember(input: { organizationId: string; userId: string; roleKey: string }) {
    const existing = await this.getMembership(input.userId, input.organizationId);

    if (existing) {
      existing.roleKey = input.roleKey;
      return existing;
    }

    const member = { id: id('member'), ...input };
    this.memberships.set(member.id, member);

    return member;
  }

  async getMembership(userId: string, organizationId: string) {
    return [...this.memberships.values()].find(
      (member) => member.userId === userId && member.organizationId === organizationId,
    );
  }

  async listMembers(organizationId: string) {
    return [...this.memberships.values()].filter((member) => member.organizationId === organizationId);
  }

  async removeMember(organizationId: string, userId: string) {
    const membership = await this.getMembership(userId, organizationId);

    if (!membership) {
      return undefined;
    }

    this.memberships.delete(membership.id);

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

  async listProjects(organizationId: string) {
    return [...this.projects.values()].filter(
      (project) => project.organizationId === organizationId && !project.deletedAt,
    );
  }

  async countProjects(organizationId: string) {
    return (await this.listProjects(organizationId)).length;
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

  async transferProject(input: { projectId: string; targetOrganizationId: string }) {
    const project = await this.updateProject({ projectId: input.projectId });
    project.organizationId = input.targetOrganizationId;
    project.updatedAt = now();

    return project;
  }

  async duplicateProject(input: { projectId: string; name: string; slug: string }) {
    const source = this.projects.get(input.projectId);

    if (!source) {
      throw Object.assign(new Error('Project not found'), { statusCode: 404, code: 'PROJECT_NOT_FOUND' });
    }

    return this.createProject({
      organizationId: source.organizationId,
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

  async upsertProjectEnvVar(input: { projectId: string; key: string; value: string }) {
    const key = `${input.projectId}:${input.key}`;
    const existing = this.projectEnvVars.get(key);

    const envVar: ProjectEnvironmentRecord = {
      id: existing?.id ?? id('env'),
      ...input,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    };
    this.projectEnvVars.set(key, envVar);

    return envVar;
  }

  async listProjectEnvVars(projectId: string) {
    return [...this.projectEnvVars.values()].filter((envVar) => envVar.projectId === projectId);
  }

  async deleteProjectEnvVar(projectId: string, key: string) {
    const mapKey = `${projectId}:${key}`;
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

  async createWorkspace(input: { id?: string; projectId: string; name: string; runtimeMode: string }) {
    const workspaceId = input.id ?? id('workspace');

    const workspace: WorkspaceRecord = {
      id: workspaceId,
      projectId: input.projectId,
      name: input.name,
      runtimeMode: input.runtimeMode,
      status: 'PENDING',
      gitPath: `.vibecore-workspaces/${workspaceId}`,
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

  async createSnapshot(input: {
    projectId: string;
    label?: string;
    kind?: SnapshotRecord['kind'];
    manifest: unknown;
    storageKey?: string;
    byteLength?: number;
    createdByUserId?: string;
  }) {
    const snapshot: SnapshotRecord = { id: id('snapshot'), ...input, kind: input.kind ?? 'manual', createdAt: now() };
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

  async getDatabaseInstanceByProject(projectId: string) {
    for (const instance of this.databaseInstances.values()) {
      if (instance.projectId === projectId) {
        return instance;
      }
    }

    return undefined;
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
  }) {
    const instance: DatabaseInstanceRecord = {
      id: id('database_instance'),
      projectId: input.projectId,
      organizationId: input.organizationId,
      status: 'PROVISIONING',
      engine: 'postgres',
      region: input.region,
      sizeBytes: 0,
      retentionDays: input.retentionDays,
      pitrEnabled: input.retentionDays > 0,
      createdAt: now(),
      updatedAt: now(),
    };
    this.databaseInstances.set(instance.id, instance);

    return instance;
  }

  async updateDatabaseInstance(
    instanceId: string,
    patch: Partial<Pick<DatabaseInstanceRecord, 'status' | 'sizeBytes' | 'pitrEnabled' | 'region'>>,
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

    return { projectId: deployment.projectId, status: deployment.status, projectDeletedAt: project?.deletedAt ?? null };
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

  async createSupportTicket(input: { organizationId: string; userId: string; subject: string }) {
    const ticket: SupportTicketRecord = { id: id('ticket'), ...input, status: 'OPEN', createdAt: now() };
    this.supportTickets.set(ticket.id, ticket);

    return ticket;
  }

  async listSupportTickets(organizationId: string) {
    return [...this.supportTickets.values()].filter((ticket) => ticket.organizationId === organizationId);
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

  async listAbuseEvents() {
    return [...this.abuseEvents.values()];
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
    const record = [...this.scimTokens.values()].find((item) => item.tokenHash === tokenHash);

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
  }) {
    const record: OrganizationInviteRecord = {
      id: id('invite'),
      organizationId: input.organizationId,
      email: input.email.toLowerCase(),
      roleKey: input.roleKey,
      tokenHash: hashToken(input.token),
      expiresAt: input.expiresAt.toISOString(),
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
      await this.addMember({ organizationId: invite.organizationId, userId, roleKey: invite.roleKey });
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

  async markUserConnectionStatus(input: { id: string; status: UserConnectionStatus; revokedAt?: Date }) {
    const existing = this.userConnections.get(input.id);

    if (!existing) {
      return undefined;
    }

    const updated: UserConnectionRecord = {
      ...existing,
      status: input.status,
      revokedAt: input.revokedAt?.toISOString(),
      updatedAt: now(),
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
    if (input.inputTokens !== undefined) checkpoint.inputTokens = input.inputTokens;
    if (input.outputTokens !== undefined) checkpoint.outputTokens = input.outputTokens;
    if (input.wallMs !== undefined) checkpoint.wallMs = input.wallMs;
    if (input.computeCents !== undefined) checkpoint.computeCents = input.computeCents;
    if (input.rawProviderCents !== undefined) checkpoint.rawProviderCents = input.rawProviderCents;
    if (input.creditCents !== undefined) checkpoint.creditCents = input.creditCents;
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
    baseUrl?: string;
    byokAllowed?: boolean;
  }) {
    const existing = this.providerConfigs.get(input.provider);
    const ts = now();
    const config: ProviderConfigRecord = {
      id: existing?.id ?? id('provider'),
      provider: input.provider,
      displayName: input.displayName,
      enabled: input.enabled ?? existing?.enabled ?? false,
      apiKeySecret: input.apiKeySecret ?? existing?.apiKeySecret,
      baseUrl: input.baseUrl ?? existing?.baseUrl,
      byokAllowed: input.byokAllowed ?? existing?.byokAllowed ?? false,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    this.providerConfigs.set(input.provider, config);
    return config;
  }

  async listAdminCreditWallets() {
    return [...this.creditWallets.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listAdminAgentCheckpoints(options?: { take?: number }) {
    return [...this.agentCheckpoints.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, options?.take ?? 200);
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
    this.auditLogs.push({ ...event, metadata: redactAuditMetadata(event.metadata), createdAt: now() } as AuditEvent);
  }

  async listAuditLogs(organizationId?: string) {
    return this.auditLogs.filter((event) => !organizationId || event.organizationId === organizationId);
  }

  async listAdminUsers() {
    return [...this.users.values()];
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

    return ticket;
  }

  async updateAbuseEvent(input: { abuseEventId: string; resolved?: boolean }) {
    const event = this.abuseEvents.get(input.abuseEventId);

    if (!event) {
      throw Object.assign(new Error('Abuse event not found'), { statusCode: 404, code: 'ABUSE_EVENT_NOT_FOUND' });
    }

    return event;
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
