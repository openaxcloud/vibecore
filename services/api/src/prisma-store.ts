import { hashToken } from '@vibecore/auth';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
import type {
  AbuseEventRecord,
  AgentPatchProposalRecord,
  AgentPatchProposalStatus,
  ApiStore,
  AiCostLedgerRecord,
  AiConversationRecord,
  AiMessageRecord,
  AiTokenUsageRecord,
  AiToolCallRecord,
  BillingCustomerRecord,
  BillingPlanRecord,
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
  OrganizationRecord,
  OrganizationInviteRecord,
  ProjectActivityListOptions,
  ProjectActivityRecord,
  ProjectCollaboratorRecord,
  ProjectConnectionLinkRecord,
  ProjectEnvironmentRecord,
  ProjectIdeStateRecord,
  ProjectRecord,
  ProjectSecretRecord,
  ProjectShareLinkRecord,
  ProjectStorageObjectRecord,
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
  UserConnectionRecord,
  UserConnectionStatus,
  UserRecord,
  UsageEventRecord,
  WorkspaceRecord,
  QuotaOverrideRecord,
  AdminAuditLogRecord,
} from './store.js';
import type { PlanKey, QuotaKey } from '@vibecore/billing';

function now() {
  return new Date().toISOString();
}

function toIso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : undefined;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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
  constructor(readonly prisma: DatabaseClient = createDatabaseClient()) {}

  async createUser(input: {
    email: string;
    name?: string;
    passwordHash: string;
    platformAdmin?: boolean;
  }): Promise<UserRecord> {
    return mapUser(
      await this.prisma.user.create({
        data: {
          email: input.email.toLowerCase(),
          name: input.name,
          passwordHash: input.passwordHash,
          platformAdmin: input.platformAdmin,
        },
      }),
    );
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
  }) {
    return mapUser(
      await this.prisma.user.update({
        where: { id: input.userId },
        data: {
          email: input.email?.toLowerCase(),
          name: input.name,
          passwordHash: input.passwordHash,
          emailVerifiedAt: input.emailVerifiedAt ? new Date(input.emailVerifiedAt) : undefined,
          mfaEnabled: input.mfaEnabled,
          mfaSecretCiphertext: input.mfaSecretEncrypted,
          platformAdmin: input.platformAdmin,
          /*
           * `language: null` clears the column (Prisma differentiates null
           * from undefined: undefined skips the field, null writes NULL).
           * The undefined case is the no-op we want when the caller didn't
           * mention language at all.
           */
          language: input.language === undefined ? undefined : input.language,
        },
      }),
    );
  }

  async deleteUser(userId: string) {
    try {
      await this.prisma.user.delete({ where: { id: userId } });

      return true;
    } catch {
      return false;
    }
  }

  async findUserByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return user ? mapUser(user) : undefined;
  }

  async findUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? mapUser(user) : undefined;
  }

  async createSession(input: {
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return mapSession(
      await this.prisma.session.create({
        data: {
          userId: input.userId,
          tokenHash: hashToken(input.token),
          expiresAt: input.expiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
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
    const session = await this.prisma.session.update({ where: { id: sessionId }, data: { lastReauthAt: new Date() } });
    return mapSession(session);
  }

  async createEmailVerification(input: { userId: string; token: string; expiresAt: Date }) {
    await this.prisma.emailVerificationToken.create({
      data: { userId: input.userId, tokenHash: hashToken(input.token), expiresAt: input.expiresAt },
    });
  }

  async consumeEmailVerification(token: string) {
    const tokenHash = hashToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!record) {
      return undefined;
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

    return this.updateUser({ userId: record.userId, passwordHash });
  }

  async setRecoveryCodes(userId: string, codeHashes: string[]) {
    await this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } });
    const records = await Promise.all(
      codeHashes.map((codeHash) => this.prisma.mfaRecoveryCode.create({ data: { userId, codeHash } })),
    );
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

  async createOrganization(input: { name: string; slug: string; ownerUserId: string }) {
    const ownerRole = await this.ensureRole('owner');
    const organization = await this.prisma.organization.create({
      data: {
        name: input.name,
        slug: input.slug || slugify(input.name),
        members: { create: { userId: input.ownerUserId, roleId: ownerRole.id } },
      },
    });
    return mapOrganization(organization);
  }

  async listOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((membership) => mapOrganization(membership.organization));
  }

  async getOrganization(id: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id } });
    return organization ? mapOrganization(organization) : undefined;
  }

  async addMember(input: { organizationId: string; userId: string; roleKey: string }) {
    const role = await this.ensureRole(input.roleKey);
    const membership = await this.prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
      create: { organizationId: input.organizationId, userId: input.userId, roleId: role.id },
      update: { roleId: role.id },
      include: { role: true },
    });
    return mapMembership(membership);
  }

  async getMembership(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { role: true },
    });
    return membership ? mapMembership(membership) : undefined;
  }

  async listMembers(organizationId: string) {
    return (await this.prisma.organizationMember.findMany({ where: { organizationId }, include: { role: true } })).map(
      mapMembership,
    );
  }

  async removeMember(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { role: true },
    });

    if (!membership) {
      return undefined;
    }

    await this.prisma.organizationMember.delete({ where: { id: membership.id } });
    return mapMembership(membership);
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
    const slug = await this.nextProjectSlug(input.organizationId, projectSlugBase(input));

    return mapProject(
      await this.prisma.project.create({
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
      }),
    );
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
    const project = await this.prisma.project.findUnique({ where: { id } });
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

  async listProjects(organizationId: string) {
    return (
      await this.prisma.project.findMany({ where: { organizationId, deletedAt: null }, orderBy: { createdAt: 'desc' } })
    ).map(mapProject);
  }

  async softDeleteProject(projectId: string) {
    return mapProject(await this.prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } }));
  }

  async restoreProject(projectId: string) {
    return mapProject(await this.prisma.project.update({ where: { id: projectId }, data: { deletedAt: null } }));
  }

  async transferProject(input: { projectId: string; targetOrganizationId: string }) {
    return mapProject(
      await this.prisma.project.update({
        where: { id: input.projectId },
        data: { organizationId: input.targetOrganizationId },
      }),
    );
  }

  async duplicateProject(input: { projectId: string; name: string; slug: string }) {
    const source = assertFound(
      await this.prisma.project.findUnique({ where: { id: input.projectId } }),
      'Project not found',
      'PROJECT_NOT_FOUND',
    );
    return this.createProject({
      organizationId: source.organizationId,
      name: input.name,
      slug: input.slug,
      description: source.description ?? undefined,
      sourceType: 'duplicate',
      templateName: source.templateName ?? undefined,
      gitRepositoryUrl: source.gitRepositoryUrl ?? undefined,
      gitDefaultBranch: source.gitDefaultBranch ?? undefined,
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

  async upsertProjectEnvVar(input: { projectId: string; key: string; value: string }) {
    return mapEnvVar(
      await this.prisma.projectEnvVar.upsert({
        where: { projectId_key: { projectId: input.projectId, key: input.key } },
        create: input,
        update: { value: input.value },
      }),
    );
  }

  async listProjectEnvVars(projectId: string) {
    return (await this.prisma.projectEnvVar.findMany({ where: { projectId } })).map(mapEnvVar);
  }

  async deleteProjectEnvVar(projectId: string, key: string) {
    const existing = await this.prisma.projectEnvVar.findUnique({ where: { projectId_key: { projectId, key } } });

    if (!existing) {
      return undefined;
    }

    return mapEnvVar(await this.prisma.projectEnvVar.delete({ where: { projectId_key: { projectId, key } } }));
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

  async deleteProjectSecret(projectId: string, key: string) {
    const existing = await this.prisma.projectSecret.findUnique({ where: { projectId_key: { projectId, key } } });

    if (!existing) {
      return undefined;
    }

    return mapSecret(await this.prisma.projectSecret.delete({ where: { projectId_key: { projectId, key } } }));
  }

  async addProjectCollaborator(input: { projectId: string; userId: string; roleKey: string }) {
    return mapProjectCollaborator(
      await this.prisma.projectCollaborator.upsert({
        where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
        create: input,
        update: { roleKey: input.roleKey },
      }),
    );
  }

  async listProjectCollaborators(projectId: string) {
    return (await this.prisma.projectCollaborator.findMany({ where: { projectId } })).map(mapProjectCollaborator);
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

    const records = (
      await this.prisma.projectActivity.findMany({
        where,
        orderBy: { createdAt: options.order ?? 'asc' },
      })
    ).map(mapProjectActivity);

    const search = options.search?.trim().toLowerCase();
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

    return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
  }

  async getProjectIdeState(projectId: string) {
    const state = await this.prisma.projectIdeState.findUnique({ where: { projectId } });
    return state ? mapProjectIdeState(state) : undefined;
  }

  async upsertProjectIdeState(input: { projectId: string; state: unknown; updatedByUserId?: string }) {
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
        update: {
          status: input.status ?? 'online',
          filePath: input.filePath,
          cursor: input.cursor as any,
          selection: input.selection as any,
          mode: input.mode ?? 'editing',
          terminalAccess: input.terminalAccess ?? false,
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

  async createWorkspace(input: { id?: string; projectId: string; name: string; runtimeMode: string }) {
    // Persist the created workspace first so Prisma can mint the id when the
    // caller doesn't supply one. Once we have the id, allocate a relative
    // gitPath under the project storage root so each workspace has its own
    // isolated git working tree. We update in the same transaction so
    // downstream readers always see a non-null gitPath for new rows.
    const created = await this.prisma.workspace.create({
      data: { ...input, status: 'PENDING' },
    });
    const gitPath = workspaceRelativeGitPath(created.id);
    const updated = await this.prisma.workspace.update({
      where: { id: created.id },
      data: { gitPath },
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

  async createSnapshot(input: {
    projectId: string;
    label?: string;
    kind?: SnapshotRecord['kind'];
    manifest: unknown;
    storageKey?: string;
    byteLength?: number;
    createdByUserId?: string;
  }) {
    return mapSnapshot(
      await this.prisma.projectSnapshot.create({
        data: {
          projectId: input.projectId,
          label: input.label,
          kind: input.kind ?? 'manual',
          manifest: input.manifest as any,
          storageKey: input.storageKey,
          byteLength: input.byteLength,
          createdByUserId: input.createdByUserId,
        },
      }),
    );
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

  async createDeployment(input: {
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
  }) {
    return mapDeployment(
      await this.prisma.deployment.create({
        data: {
          projectId: input.projectId,
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

  async updateDeployment(
    projectId: string,
    deploymentId: string,
    input: Partial<Omit<DeploymentRecord, 'id' | 'projectId' | 'createdAt'>>,
  ) {
    await this.prisma.deployment.updateMany({
      where: { id: deploymentId, projectId },
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
        startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
        finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
        canceledAt: input.canceledAt ? new Date(input.canceledAt) : undefined,
      } as any,
    });

    const deployment = await this.prisma.deployment.findFirstOrThrow({ where: { id: deploymentId, projectId } });

    return mapDeployment(deployment);
  }

  async listDeployments(projectId: string) {
    return (await this.prisma.deployment.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })).map(
      mapDeployment,
    );
  }

  async createSupportTicket(input: { organizationId: string; userId: string; subject: string }) {
    const ticket = await this.prisma.supportTicket.create({
      data: { organizationId: input.organizationId, userId: input.userId, subject: input.subject },
    });
    return mapSupportTicket(ticket);
  }

  async listSupportTickets(organizationId: string) {
    return (await this.prisma.supportTicket.findMany({ where: { organizationId } })).map(mapSupportTicket);
  }

  async setFeatureFlag(input: { organizationId?: string; key: string; enabled: boolean }) {
    const existing = await this.prisma.featureFlag.findFirst({
      where: { organizationId: input.organizationId ?? null, key: input.key },
    });

    if (existing) {
      return mapFeatureFlag(
        await this.prisma.featureFlag.update({ where: { id: existing.id }, data: { enabled: input.enabled } }),
      );
    }

    return mapFeatureFlag(
      await this.prisma.featureFlag.create({
        data: { organizationId: input.organizationId, key: input.key, enabled: input.enabled },
      }),
    );
  }

  async listFeatureFlags(organizationId?: string) {
    return (await this.prisma.featureFlag.findMany({ where: { organizationId: organizationId ?? null } })).map(
      mapFeatureFlag,
    );
  }

  async createAbuseEvent(input: { organizationId?: string; userId?: string; type: string; severity: string }) {
    return mapAbuseEvent(await this.prisma.abuseEvent.create({ data: input }));
  }

  async listAbuseEvents() {
    return (await this.prisma.abuseEvent.findMany({ orderBy: { createdAt: 'desc' } })).map(mapAbuseEvent);
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

  async listSystemSettings() {
    return (await this.prisma.systemSetting.findMany()).map(mapSystemSetting);
  }

  async getEnterpriseSettings(organizationId: string) {
    const settings = await this.prisma.enterpriseOrganizationSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ipAllowlist: [],
        requireMfaForAdmins: true,
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
          requireMfaForAdmins: input.requireMfaForAdmins ?? true,
          dataRetentionDays: input.dataRetentionDays ?? 365,
          legalHoldEnabled: input.legalHoldEnabled ?? false,
        },
        update: {
          ipAllowlist: input.ipAllowlist,
          sessionDurationMinutes: input.sessionDurationMinutes,
          requireMfaForAdmins: input.requireMfaForAdmins,
          dataRetentionDays: input.dataRetentionDays,
          legalHoldEnabled: input.legalHoldEnabled,
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
    const record = await this.prisma.verifiedDomain.findUnique({
      where: { organizationId_domain: { organizationId: input.organizationId, domain: input.domain.toLowerCase() } },
    });

    if (!record) {
      return undefined;
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
    const record = await this.prisma.scimToken.findUnique({ where: { tokenHash } });

    if (!record) {
      return undefined;
    }

    return mapScimToken(
      await this.prisma.scimToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }),
    );
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

  async createOrganizationInvite(input: {
    organizationId: string;
    email: string;
    roleKey: string;
    token: string;
    expiresAt: Date;
  }) {
    const role = await this.ensureRole(input.roleKey);
    const invite = await this.prisma.organizationInvite.create({
      data: {
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        roleId: role.id,
        tokenHash: hashToken(input.token),
        expiresAt: input.expiresAt,
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

    await this.addMember({ organizationId: invite.organizationId, userId, roleKey: invite.role.key });

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

  async markUserConnectionStatus(input: { id: string; status: UserConnectionStatus; revokedAt?: Date }) {
    try {
      const updated = await this.prisma.userConnection.update({
        where: { id: input.id },
        data: { status: input.status, revokedAt: input.revokedAt },
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

  async createAiConversation(input: { projectId?: string; userId: string; title?: string }) {
    return mapAiConversation(await this.prisma.aiConversation.create({ data: input }));
  }

  async getAiConversation(id: string) {
    const conversation = await this.prisma.aiConversation.findUnique({ where: { id } });
    return conversation ? mapAiConversation(conversation) : undefined;
  }

  async createAiMessage(input: {
    conversationId: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
  }) {
    return mapAiMessage(await this.prisma.aiMessage.create({ data: input }));
  }

  async listAiMessages(conversationId: string) {
    return (await this.prisma.aiMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })).map(
      mapAiMessage,
    );
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

  async listAiCosts(organizationId: string) {
    return (await this.prisma.aiCostLedger.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } })).map(
      mapAiCostLedger,
    );
  }

  async upsertBillingPlan(input: {
    key: PlanKey;
    name: string;
    monthlyCents: number;
    limits: Record<string, number>;
    stripeProductId?: string;
    stripePriceId?: string;
  }) {
    return mapBillingPlan(
      await this.prisma.plan.upsert({
        where: { key: input.key },
        create: {
          key: input.key,
          name: input.name,
          monthlyCents: input.monthlyCents,
          limits: input.limits as any,
          stripeProductId: input.stripeProductId,
          stripePriceId: input.stripePriceId,
        },
        update: {
          name: input.name,
          monthlyCents: input.monthlyCents,
          limits: input.limits as any,
          stripeProductId: input.stripeProductId,
          stripePriceId: input.stripePriceId,
        },
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
    return mapBillingCustomer(
      await this.prisma.billingCustomer.upsert({
        where: { organizationId: input.organizationId },
        create: input,
        update: { provider: input.provider, externalId: input.externalId },
      }),
    );
  }

  async getBillingCustomer(organizationId: string) {
    const customer = await this.prisma.billingCustomer.findUnique({ where: { organizationId } });
    return customer ? mapBillingCustomer(customer) : undefined;
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
    const plan = await this.ensurePlan(input.planKey);
    const existing = input.externalId
      ? await this.prisma.subscription.findUnique({ where: { externalId: input.externalId }, include: { plan: true } })
      : await this.prisma.subscription.findFirst({
          where: { organizationId: input.organizationId },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        });
    const data = {
      organizationId: input.organizationId,
      planId: plan.id,
      externalId: input.externalId,
      status: input.status,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      trialEndsAt: input.trialEndsAt,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
    };

    if (existing) {
      return mapSubscription(
        await this.prisma.subscription.update({ where: { id: existing.id }, data, include: { plan: true } }),
      );
    }

    return mapSubscription(await this.prisma.subscription.create({ data, include: { plan: true } }));
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

  async listUsageEvents(organizationId: string) {
    return (await this.prisma.usageEvent.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } })).map(
      mapUsageEvent,
    );
  }

  async sumUsage(organizationId: string, type: string) {
    const result = await this.prisma.usageEvent.aggregate({
      where: { organizationId, type },
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

    return {
      event: mapStripeEvent(
        await this.prisma.stripeEvent.create({
          data: { id: input.id, organizationId: input.organizationId, type: input.type, payload: input.payload as any },
        }),
      ),
      created: true,
    };
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

    return {
      event: mapEmailDeliveryEvent(
        await this.prisma.emailDeliveryEvent.create({
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
        }),
      ),
      created: true,
    };
  }

  async listEmailDeliveryEvents(filter?: { email?: string; type?: string; emailMessageId?: string; limit?: number }) {
    const where: Record<string, unknown> = {};
    if (filter?.email) where.email = filter.email;
    if (filter?.type) where.type = filter.type;
    if (filter?.emailMessageId) where.emailMessageId = filter.emailMessageId;

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
    return (await this.prisma.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } })).map(
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
    return (await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })).map(mapUser);
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
    const existing = await this.prisma.supportTicket.findUnique({ where: { id: input.ticketId } });
    const metadata = {
      ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
      ...(input.response ? { latestAdminResponse: input.response } : {}),
    };
    return mapSupportTicket(
      await this.prisma.supportTicket.update({
        where: { id: input.ticketId },
        data: { status: input.status, metadata: metadata as any },
      }),
    );
  }

  async updateAbuseEvent(input: { abuseEventId: string; resolved?: boolean }) {
    const existing = await this.prisma.abuseEvent.findUnique({ where: { id: input.abuseEventId } });
    const metadata = {
      ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
      resolved: input.resolved ?? true,
      resolvedAt: new Date().toISOString(),
    };
    return mapAbuseEvent(
      await this.prisma.abuseEvent.update({ where: { id: input.abuseEventId }, data: { metadata: metadata as any } }),
    );
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
        name: roleKey[0]?.toUpperCase() + roleKey.slice(1),
        system: Object.hasOwn(rolePermissions, roleKey),
      },
      update: {},
    });
  }

  private async ensurePlan(planKey: PlanKey) {
    return this.prisma.plan.upsert({
      where: { key: planKey },
      create: { key: planKey, name: planKey[0]?.toUpperCase() + planKey.slice(1), monthlyCents: 0, limits: {} },
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
  };
}

function mapOrganization(organization: any): OrganizationRecord {
  return {
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    createdAt: toIso(organization.createdAt)!,
  };
}

function mapMembership(member: any): MembershipRecord {
  return {
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    roleKey: member.role?.key ?? member.roleKey ?? 'member',
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
  };
}

// Convention shared with services/api/src/project-storage.ts: each workspace
// gets its own isolated git working tree under `.vibecore-workspaces/<id>` of
// the project storage root. Returning a relative path keeps the row portable
// across PROJECT_STORAGE_DIR overrides (dev vs prod, on-disk vs PVC).
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
    createdAt: toIso(workspace.createdAt)!,
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

function mapEnvVar(envVar: any): ProjectEnvironmentRecord {
  return {
    id: envVar.id,
    projectId: envVar.projectId,
    key: envVar.key,
    value: envVar.value,
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

function mapDeployment(deployment: any): DeploymentRecord {
  return {
    id: deployment.id,
    projectId: deployment.projectId,
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
    startedAt: toIso(deployment.startedAt),
    finishedAt: toIso(deployment.finishedAt),
    canceledAt: toIso(deployment.canceledAt),
    createdAt: toIso(deployment.createdAt)!,
    updatedAt: toIso(deployment.updatedAt),
  };
}

function mapSupportTicket(ticket: any): SupportTicketRecord {
  return {
    id: ticket.id,
    organizationId: ticket.organizationId,
    userId: ticket.userId,
    subject: ticket.subject,
    status: ticket.status,
    createdAt: toIso(ticket.createdAt)!,
  };
}

function mapFeatureFlag(flag: any): FeatureFlagRecord {
  return { id: flag.id, organizationId: flag.organizationId ?? undefined, key: flag.key, enabled: flag.enabled };
}

function mapAbuseEvent(event: any): AbuseEventRecord {
  return {
    id: event.id,
    organizationId: event.organizationId ?? undefined,
    userId: event.userId ?? undefined,
    type: event.type,
    severity: event.severity,
    createdAt: toIso(event.createdAt)!,
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
    createdAt: toIso(webhook.createdAt)!,
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
