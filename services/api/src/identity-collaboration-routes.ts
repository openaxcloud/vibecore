import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PermissionKey } from '@vibecore/rbac';
import { appPublicEnglish } from './app-public-copy.js';
import {
  isReadOnlyProjectRole,
  mutateReadOnlyViewerAccessWithEntitlements,
} from './plan-entitlements-service.js';
import type {
  ApiStore,
  CollaborationGroupRecord,
  GroupMemberMutationResult,
  MembershipRecord,
  ResourceAccessGrantRecord,
} from './store.js';

const GUEST_CONSENT_VERSION = 'project-access-consent-v1';
const ORGANIZATION_MEMBERSHIP_CONSENT_VERSION = 'organization-membership-v1';
const ACCESS_GRANT_ROLES = ['guest', 'viewer', 'editor'] as const;
const INVALID_SUBJECT_INPUT_DETAIL = 'Provide exactly one subject matching subjectType';
const GROUP_MUTATION_INVARIANT_DETAIL = 'Expected a failed group mutation';
const COLLABORATION_CONFLICT_DETAIL = 'A matching live record already exists';
const SUBJECT_REJECTED_REASON = 'SUBJECT_REJECTED';

class IdentityCollaborationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'IdentityCollaborationError';
  }
}

export interface IdentityCollaborationRouteDependencies {
  store: ApiStore;
  guardOrg: (request: FastifyRequest, organizationId: string, permission: PermissionKey) => Promise<MembershipRecord>;
  requireScim: (request: FastifyRequest, organizationId: string) => Promise<void>;
  audit: (
    request: FastifyRequest,
    entry: {
      organizationId?: string;
      action: string;
      resourceType: string;
      resourceId?: string;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<void>;
}

const groupNameSchema = z.string().trim().min(1).max(120);
const cursorPageSchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const groupParamsSchema = z.object({ orgId: z.string().min(1), groupId: z.string().min(1) });
const groupMemberParamsSchema = groupParamsSchema.extend({ userId: z.string().min(1) });
const groupMemberBodySchema = z.object({ userId: z.string().min(1) });
const accessGrantParamsSchema = z.object({ projectId: z.string().min(1), grantId: z.string().min(1) });
const ownGrantParamsSchema = z.object({ grantId: z.string().min(1) });
const createAccessGrantSchema = z
  .object({
    subjectType: z.enum(['USER', 'GROUP']),
    subjectUserId: z.string().min(1).optional(),
    subjectGroupId: z.string().min(1).optional(),
    roleKey: z.enum(ACCESS_GRANT_ROLES),
    expiresInHours: z
      .number()
      .int()
      .min(1)
      .max(24 * 365),
  })
  .superRefine((value, context) => {
    const userSubject = value.subjectType === 'USER' && value.subjectUserId && !value.subjectGroupId;
    const groupSubject = value.subjectType === 'GROUP' && value.subjectGroupId && !value.subjectUserId;

    if (!userSubject && !groupSubject) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: INVALID_SUBJECT_INPUT_DETAIL,
      });
    }
  });
const revokeGrantSchema = z.object({ reason: z.string().trim().min(1).max(500) });
const consentGrantSchema = z.object({ consentVersion: z.literal(GUEST_CONSENT_VERSION) });

const scimMemberSchema = z.object({ value: z.string().min(1) });
const scimGroupSchema = z.object({
  schemas: z.array(z.string()).optional(),
  externalId: z.string().trim().min(1).max(255).optional(),
  displayName: groupNameSchema,
  members: z.array(scimMemberSchema).max(10_000).default([]),
});
const scimGroupListSchema = z.object({
  startIndex: z.coerce.number().int().min(1).max(100_000).default(1),
  count: z.coerce.number().int().min(1).max(200).default(100),
});
const scimGroupPatchSchema = z.object({
  schemas: z.array(z.string()).optional(),
  Operations: z
    .array(
      z.object({
        op: z
          .string()
          .trim()
          .transform((value) => value.toLowerCase())
          .pipe(z.enum(['add', 'replace', 'remove'])),
        path: z.string().trim().min(1).max(500).optional(),
        value: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(100),
});

function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new IdentityCollaborationError(
      'VALIDATION_FAILED',
      result.error.issues.map((issue) => issue.message).join('; '),
      400,
    );
  }

  return result.data as z.output<TSchema>;
}

function idempotencyKey(request: FastifyRequest): string | undefined {
  const value = request.headers['idempotency-key'];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new IdentityCollaborationError(
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency-Key must be 1–128 URL-safe characters',
      400,
    );
  }

  return value;
}

function requestHash(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function publicGrant(grant: ResourceAccessGrantRecord) {
  const { requestHash: _requestHash, idempotencyKey: _idempotencyKey, ...safe } = grant;
  return safe;
}

function auditContext(request: FastifyRequest): Record<string, unknown> {
  const userAgent = request.headers['user-agent'];
  return {
    correlationId: request.id,
    ...(typeof userAgent === 'string' ? { userAgent: userAgent.slice(0, 512) } : {}),
  };
}

function throwGroupMutationFailure(result: GroupMemberMutationResult): never {
  if (result.ok) {
    throw new Error(GROUP_MUTATION_INVARIANT_DETAIL);
  }

  const mapping = {
    GROUP_NOT_FOUND: [404, 'GROUP_NOT_FOUND', 'Group not found'],
    GROUP_SCIM_MANAGED: [409, 'GROUP_SCIM_MANAGED', 'This group is managed by SCIM'],
    GROUP_MANUAL_ONLY: [409, 'GROUP_MANUAL_ONLY', 'This group is managed interactively'],
    MEMBERSHIP_NOT_ACTIVE: [409, 'GROUP_MEMBER_NOT_ACTIVE', 'Every group member must be an active organization member'],
  } as const;
  const [statusCode, code, message] = mapping[result.reason];
  throw new IdentityCollaborationError(code, message, statusCode);
}

function toScimGroup(group: CollaborationGroupRecord, userIds: string[]) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
    id: group.id,
    externalId: group.externalId,
    displayName: group.name,
    members: userIds.map((value) => ({ value })),
    meta: { resourceType: 'Group', created: group.createdAt, lastModified: group.updatedAt },
  };
}

function scimError(statusCode: number, code: string, detail: string) {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: String(statusCode),
    scimType: code === 'VALIDATION_FAILED' ? 'invalidValue' : code === 'SCIM_INVALID_PATH' ? 'invalidPath' : undefined,
    detail,
  };
}

function scimPatchMembers(value: unknown): string[] {
  const memberValue =
    value && typeof value === 'object' && !Array.isArray(value) && 'members' in value
      ? (value as { members?: unknown }).members
      : value;
  const candidate =
    memberValue && typeof memberValue === 'object' && !Array.isArray(memberValue) && 'value' in memberValue
      ? [memberValue]
      : memberValue;
  return parse(z.array(scimMemberSchema).max(10_000), candidate ?? []).map((member) => member.value);
}

export function registerIdentityCollaborationRoutes(
  app: FastifyInstance,
  dependencies: IdentityCollaborationRouteDependencies,
): void {
  const { store } = dependencies;
  const rateLimit = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

  const wrap =
    (handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await handler(request, reply);
      } catch (error) {
        if (error instanceof IdentityCollaborationError) {
          return reply
            .code(error.statusCode)
            .send(
              request.url.startsWith('/scim/v2/')
                ? scimError(error.statusCode, error.code, error.message)
                : { code: error.code, error: error.message },
            );
        }

        const structured = error as { statusCode?: unknown; code?: unknown; message?: unknown } | null;
        if (
          request.url.startsWith('/scim/v2/') &&
          typeof structured?.statusCode === 'number' &&
          typeof structured.code === 'string'
        ) {
          return reply
            .code(structured.statusCode)
            .send(
              scimError(structured.statusCode, structured.code, String(structured.message ?? 'SCIM request failed')),
            );
        }

        if ((error as { code?: string } | null)?.code === 'P2002') {
          return reply.code(409).send({ code: 'COLLABORATION_CONFLICT', error: COLLABORATION_CONFLICT_DETAIL });
        }

        throw error;
      }
    };

  const requireLiveGroup = async (organizationId: string, groupId: string) => {
    const group = await store.getCollaborationGroup(groupId);

    if (!group || group.organizationId !== organizationId || group.deletedAt) {
      throw new IdentityCollaborationError('GROUP_NOT_FOUND', 'Group not found', 404);
    }

    return group;
  };

  const requireScimGroup = async (organizationId: string, groupId: string) => {
    const group = await requireLiveGroup(organizationId, groupId);

    if (group.source !== 'SCIM') {
      throw new IdentityCollaborationError('GROUP_NOT_FOUND', 'Group not found', 404);
    }

    return group;
  };

  const readOnlyViewerMutation = async <T>(input: {
    request: FastifyRequest;
    organizationId: string;
    prospectiveUserIds: readonly string[] | (() => Promise<readonly string[] | null>);
    excludeGroupId?: string;
    mutation: () => Promise<T>;
  }): Promise<T> => {
    let claim;
    try {
      claim = await mutateReadOnlyViewerAccessWithEntitlements({
        store,
        organizationId: input.organizationId,
        prospectiveUserIds: input.prospectiveUserIds,
        excludeGroupId: input.excludeGroupId,
        mutation: input.mutation,
      });
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'P2002') throw error;
      input.request.log.warn(
        { err: error, organizationId: input.organizationId },
        'read-only viewer entitlement admission failed',
      );
      throw new IdentityCollaborationError(
        'PLAN_ENTITLEMENT_CHECK_UNAVAILABLE',
        appPublicEnglish('PLAN_ENTITLEMENT_CHECK_UNAVAILABLE'),
        503,
      );
    }

    if (!claim.allowed) {
      throw new IdentityCollaborationError(
        'PLAN_VIEWER_LIMIT_REACHED',
        appPublicEnglish('PLAN_VIEWER_LIMIT_REACHED', { value1: claim.limit }),
        403,
      );
    }

    return claim.value;
  };

  const groupMemberUserIds = async (organizationId: string, groupId: string) => {
    const page = await store.listCollaborationGroupMembers({ organizationId, groupId, limit: 10_000 });
    return page.items.map((member) => member.userId);
  };

  const groupViewerAudience = async (
    organizationId: string,
    groupId: string,
    replacementUserIds?: readonly string[],
  ): Promise<readonly string[] | null> => {
    if (!(await store.groupHasActiveReadOnlyProjectGrant(organizationId, groupId))) return null;
    if (replacementUserIds) return replacementUserIds;
    return groupMemberUserIds(organizationId, groupId);
  };

  app.post(
    '/orgs/:orgId/groups',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId } = parse(z.object({ orgId: z.string().min(1) }), request.params);
      await dependencies.guardOrg(request, orgId, 'members:manage');
      const { name } = parse(z.object({ name: groupNameSchema }), request.body ?? {});
      const group = await store.createCollaborationGroup({ organizationId: orgId, name, source: 'MANUAL' });

      await dependencies.audit(request, {
        organizationId: orgId,
        action: 'org.group.create',
        resourceType: 'collaborationGroup',
        resourceId: group.id,
        metadata: { ...auditContext(request), source: group.source },
      });
      return reply.code(201).send({ group });
    }),
  );

  app.get(
    '/orgs/:orgId/groups',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId } = parse(z.object({ orgId: z.string().min(1) }), request.params);
      const query = parse(cursorPageSchema, request.query ?? {});
      await dependencies.guardOrg(request, orgId, 'org:read');
      const page = await store.listCollaborationGroups({ organizationId: orgId, ...query });
      return reply.send({ groups: page.items, nextCursor: page.nextCursor });
    }),
  );

  app.delete(
    '/orgs/:orgId/groups/:groupId',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId, groupId } = parse(groupParamsSchema, request.params);
      await dependencies.guardOrg(request, orgId, 'members:manage');
      await requireLiveGroup(orgId, groupId);
      const result = await readOnlyViewerMutation({
        request,
        organizationId: orgId,
        excludeGroupId: groupId,
        prospectiveUserIds: () => groupViewerAudience(orgId, groupId, []),
        mutation: () =>
          store.archiveCollaborationGroup({
            organizationId: orgId,
            groupId,
            writer: 'MANUAL',
            actorUserId: request.currentUser!.id,
          }),
      });

      if (!result.ok) {
        throwGroupMutationFailure(result);
      }

      await dependencies.audit(request, {
        organizationId: orgId,
        action: 'org.group.archive',
        resourceType: 'collaborationGroup',
        resourceId: groupId,
        metadata: auditContext(request),
      });
      return reply.code(204).send();
    }),
  );

  app.get(
    '/orgs/:orgId/groups/:groupId/members',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId, groupId } = parse(groupParamsSchema, request.params);
      const query = parse(cursorPageSchema, request.query ?? {});
      await dependencies.guardOrg(request, orgId, 'org:read');
      await requireLiveGroup(orgId, groupId);
      const page = await store.listCollaborationGroupMembers({ organizationId: orgId, groupId, ...query });
      return reply.send({ members: page.items, nextCursor: page.nextCursor });
    }),
  );

  app.post(
    '/orgs/:orgId/groups/:groupId/members',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId, groupId } = parse(groupParamsSchema, request.params);
      const { userId } = parse(groupMemberBodySchema, request.body ?? {});
      await dependencies.guardOrg(request, orgId, 'members:manage');
      const result = await readOnlyViewerMutation({
        request,
        organizationId: orgId,
        prospectiveUserIds: async () =>
          (await store.groupHasActiveReadOnlyProjectGrant(orgId, groupId)) ? [userId] : null,
        mutation: () =>
          store.addCollaborationGroupMember({
            organizationId: orgId,
            groupId,
            userId,
            writer: 'MANUAL',
          }),
      });

      if (!result.ok) {
        throwGroupMutationFailure(result);
      }

      await dependencies.audit(request, {
        organizationId: orgId,
        action: 'org.group.member.add',
        resourceType: 'collaborationGroup',
        resourceId: groupId,
        metadata: { ...auditContext(request), userId },
      });
      return reply.code(201).send({ member: result.member });
    }),
  );

  app.delete(
    '/orgs/:orgId/groups/:groupId/members/:userId',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId, groupId, userId } = parse(groupMemberParamsSchema, request.params);
      await dependencies.guardOrg(request, orgId, 'members:manage');
      const result = await readOnlyViewerMutation({
        request,
        organizationId: orgId,
        excludeGroupId: groupId,
        prospectiveUserIds: async () => {
          const current = await groupViewerAudience(orgId, groupId);
          return current?.filter((candidate) => candidate !== userId) ?? null;
        },
        mutation: () =>
          store.removeCollaborationGroupMember({
            organizationId: orgId,
            groupId,
            userId,
            writer: 'MANUAL',
          }),
      });

      if (!result.ok) {
        throwGroupMutationFailure(result);
      }

      if (!result.removed) {
        throw new IdentityCollaborationError('GROUP_MEMBER_NOT_FOUND', 'Group member not found', 404);
      }

      await dependencies.audit(request, {
        organizationId: orgId,
        action: 'org.group.member.remove',
        resourceType: 'collaborationGroup',
        resourceId: groupId,
        metadata: { ...auditContext(request), userId },
      });
      return reply.code(204).send();
    }),
  );

  app.post(
    '/projects/:projectId/access-grants',
    rateLimit,
    wrap(async (request, reply) => {
      const { projectId } = parse(z.object({ projectId: z.string().min(1) }), request.params);
      const project = await store.getProject(projectId);

      if (!project || project.deletedAt) {
        throw new IdentityCollaborationError('PROJECT_NOT_FOUND', 'Project not found', 404);
      }

      await dependencies.guardOrg(request, project.organizationId, 'members:manage');
      await dependencies.guardOrg(request, project.organizationId, 'projects:write');
      const body = parse(createAccessGrantSchema, request.body ?? {});
      let status: 'PENDING_CONSENT' | 'ACTIVE' = 'ACTIVE';
      let acceptedAt: Date | undefined = new Date();
      let consentVersion = ORGANIZATION_MEMBERSHIP_CONSENT_VERSION;

      if (body.subjectType === 'GROUP') {
        await requireLiveGroup(project.organizationId, body.subjectGroupId!);
      } else {
        const subject = await store.findUserById(body.subjectUserId!);

        if (!subject) {
          throw new IdentityCollaborationError('GRANT_SUBJECT_NOT_FOUND', 'Grant subject not found', 404);
        }

        const membership = await store.getMembership(subject.id, project.organizationId);

        if (!membership) {
          if (body.roleKey !== 'guest' && body.roleKey !== 'viewer') {
            throw new IdentityCollaborationError(
              'GRANT_OUTSIDER_ROLE_TOO_WIDE',
              'External guests can only receive guest or viewer access',
              403,
            );
          }

          status = 'PENDING_CONSENT';
          acceptedAt = undefined;
          consentVersion = GUEST_CONSENT_VERSION;
        }
      }

      const key = idempotencyKey(request);
      const hash = requestHash({
        organizationId: project.organizationId,
        projectId,
        subjectType: body.subjectType,
        subjectUserId: body.subjectUserId ?? null,
        subjectGroupId: body.subjectGroupId ?? null,
        roleKey: body.roleKey,
        expiresInHours: body.expiresInHours,
      });
      const createGrant = () =>
        store.createResourceAccessGrant({
          organizationId: project.organizationId,
          subjectType: body.subjectType,
          subjectUserId: body.subjectUserId,
          subjectGroupId: body.subjectGroupId,
          resourceType: 'PROJECT',
          resourceId: projectId,
          roleKey: body.roleKey,
          status,
          expiresAt: new Date(Date.now() + body.expiresInHours * 60 * 60 * 1_000),
          acceptedAt,
          consentVersion,
          grantedByUserId: request.currentUser!.id,
          idempotencyKey: key,
          requestHash: hash,
        });
      const result =
        status === 'ACTIVE' && isReadOnlyProjectRole(body.roleKey)
          ? await readOnlyViewerMutation({
              request,
              organizationId: project.organizationId,
              prospectiveUserIds:
                body.subjectType === 'USER'
                  ? [body.subjectUserId!]
                  : () => groupMemberUserIds(project.organizationId, body.subjectGroupId!),
              mutation: createGrant,
            })
          : await createGrant();

      if (!result.ok) {
        const conflict = result.reason === 'IDEMPOTENCY_CONFLICT' ? 'IDEMPOTENCY_CONFLICT' : 'ACTIVE_GRANT_CONFLICT';
        throw new IdentityCollaborationError(conflict, 'The request conflicts with an existing grant', 409);
      }

      if (!result.replayed) {
        await dependencies.audit(request, {
          organizationId: project.organizationId,
          action: 'project.access_grant.create',
          resourceType: 'resourceAccessGrant',
          resourceId: result.grant.id,
          metadata: {
            ...auditContext(request),
            projectId,
            subjectType: result.grant.subjectType,
            subjectUserId: result.grant.subjectUserId,
            subjectGroupId: result.grant.subjectGroupId,
            roleKey: result.grant.roleKey,
            status: result.grant.status,
            expiresAt: result.grant.expiresAt,
          },
        });
      }

      return reply
        .code(result.replayed ? 200 : 201)
        .send({ grant: publicGrant(result.grant), replayed: Boolean(result.replayed) });
    }),
  );

  app.get(
    '/projects/:projectId/access-grants',
    rateLimit,
    wrap(async (request, reply) => {
      const { projectId } = parse(z.object({ projectId: z.string().min(1) }), request.params);
      const query = parse(cursorPageSchema, request.query ?? {});
      const project = await store.getProject(projectId);

      if (!project || project.deletedAt) {
        throw new IdentityCollaborationError('PROJECT_NOT_FOUND', 'Project not found', 404);
      }

      await dependencies.guardOrg(request, project.organizationId, 'members:manage');
      const page = await store.listResourceAccessGrants({
        organizationId: project.organizationId,
        resourceType: 'PROJECT',
        resourceId: projectId,
        ...query,
      });
      return reply.send({ grants: page.items.map(publicGrant), nextCursor: page.nextCursor });
    }),
  );

  app.delete(
    '/projects/:projectId/access-grants/:grantId',
    rateLimit,
    wrap(async (request, reply) => {
      const { projectId, grantId } = parse(accessGrantParamsSchema, request.params);
      const { reason } = parse(revokeGrantSchema, request.body ?? {});
      const project = await store.getProject(projectId);

      if (!project || project.deletedAt) {
        throw new IdentityCollaborationError('PROJECT_NOT_FOUND', 'Project not found', 404);
      }

      await dependencies.guardOrg(request, project.organizationId, 'members:manage');
      const current = await store.getResourceAccessGrant(grantId);

      if (!current || current.organizationId !== project.organizationId || current.resourceId !== projectId) {
        throw new IdentityCollaborationError('GRANT_NOT_FOUND', 'Grant not found', 404);
      }

      if (current.status === 'REVOKED') {
        return reply.send({ grant: publicGrant(current), replayed: true });
      }

      const result = await store.revokeResourceAccessGrant({
        organizationId: project.organizationId,
        grantId,
        revokedByUserId: request.currentUser!.id,
        reason,
      });

      if (!result.ok) {
        throw new IdentityCollaborationError('GRANT_NOT_ACTIVE', 'Grant is no longer active', 409);
      }

      await dependencies.audit(request, {
        organizationId: project.organizationId,
        action: 'project.access_grant.revoke',
        resourceType: 'resourceAccessGrant',
        resourceId: grantId,
        metadata: { ...auditContext(request), projectId, reason },
      });
      return reply.send({ grant: publicGrant(result.grant), replayed: false });
    }),
  );

  app.get(
    '/identity/access-grants',
    rateLimit,
    wrap(async (request, reply) => {
      const query = parse(cursorPageSchema, request.query ?? {});
      const page = await store.listUserResourceAccessGrants({ userId: request.currentUser!.id, ...query });
      return reply.send({ grants: page.items.map(publicGrant), nextCursor: page.nextCursor });
    }),
  );

  app.post(
    '/identity/access-grants/:grantId/accept',
    rateLimit,
    wrap(async (request, reply) => {
      const { grantId } = parse(ownGrantParamsSchema, request.params);
      const { consentVersion } = parse(consentGrantSchema, request.body ?? {});
      const current = await store.getResourceAccessGrant(grantId);
      const acceptGrant = () =>
        store.acceptResourceAccessGrant({
          grantId,
          subjectUserId: request.currentUser!.id,
          consentVersion,
        });
      const result =
        current?.resourceType === 'PROJECT' &&
        current.subjectType === 'USER' &&
        current.subjectUserId === request.currentUser!.id &&
        isReadOnlyProjectRole(current.roleKey)
          ? await readOnlyViewerMutation({
              request,
              organizationId: current.organizationId,
              prospectiveUserIds: [request.currentUser!.id],
              mutation: acceptGrant,
            })
          : await acceptGrant();

      if (!result.ok) {
        const hidden = result.reason === 'GRANT_NOT_FOUND' || result.reason === 'GRANT_SUBJECT_MISMATCH';
        throw new IdentityCollaborationError(
          hidden ? 'GRANT_NOT_FOUND' : result.reason,
          hidden ? 'Grant not found' : 'Grant cannot be accepted in its current state',
          hidden ? 404 : 409,
        );
      }

      await dependencies.audit(request, {
        organizationId: result.grant.organizationId,
        action: 'project.access_grant.accept',
        resourceType: 'resourceAccessGrant',
        resourceId: grantId,
        metadata: { ...auditContext(request), consentVersion },
      });
      return reply.send({ grant: publicGrant(result.grant) });
    }),
  );

  app.post(
    '/identity/access-grants/:grantId/reject',
    rateLimit,
    wrap(async (request, reply) => {
      const { grantId } = parse(ownGrantParamsSchema, request.params);
      const result = await store.rejectResourceAccessGrant({
        grantId,
        subjectUserId: request.currentUser!.id,
        reason: SUBJECT_REJECTED_REASON,
      });

      if (!result.ok) {
        const hidden = result.reason === 'GRANT_NOT_FOUND' || result.reason === 'GRANT_SUBJECT_MISMATCH';
        throw new IdentityCollaborationError(
          hidden ? 'GRANT_NOT_FOUND' : result.reason,
          hidden ? 'Grant not found' : 'Grant cannot be rejected in its current state',
          hidden ? 404 : 409,
        );
      }

      await dependencies.audit(request, {
        organizationId: result.grant.organizationId,
        action: 'project.access_grant.reject',
        resourceType: 'resourceAccessGrant',
        resourceId: grantId,
        metadata: auditContext(request),
      });
      return reply.send({ grant: publicGrant(result.grant) });
    }),
  );

  const scimMembers = async (organizationId: string, groupId: string) => {
    const page = await store.listCollaborationGroupMembers({ organizationId, groupId, limit: 10_000 });
    return page.items.map((member) => member.userId);
  };

  app.get(
    '/scim/v2/:orgId/Groups',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId } = parse(z.object({ orgId: z.string().min(1) }), request.params);
      const query = parse(scimGroupListSchema, request.query ?? {});
      await dependencies.requireScim(request, orgId);
      const [totalResults, page] = await Promise.all([
        store.countCollaborationGroups(orgId, 'SCIM'),
        store.listCollaborationGroups({
          organizationId: orgId,
          source: 'SCIM',
          offset: query.startIndex - 1,
          limit: query.count,
        }),
      ]);
      const Resources = await Promise.all(
        page.items.map(async (group) => toScimGroup(group, await scimMembers(orgId, group.id))),
      );
      return reply.send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults,
        startIndex: query.startIndex,
        itemsPerPage: Resources.length,
        Resources,
      });
    }),
  );

  app.get(
    '/scim/v2/:orgId/Groups/:groupId',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId, groupId } = parse(groupParamsSchema, request.params);
      await dependencies.requireScim(request, orgId);
      const group = await requireScimGroup(orgId, groupId);
      return reply.send(toScimGroup(group, await scimMembers(orgId, groupId)));
    }),
  );

  app.post(
    '/scim/v2/:orgId/Groups',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId } = parse(z.object({ orgId: z.string().min(1) }), request.params);
      const body = parse(scimGroupSchema, request.body ?? {});
      await dependencies.requireScim(request, orgId);
      const replacementUserIds = body.members.map((member) => member.value);
      const existing = body.externalId
        ? await store.findScimCollaborationGroup(orgId, body.externalId)
        : undefined;
      const syncGroup = () =>
        store.syncScimCollaborationGroup({
          organizationId: orgId,
          externalId: body.externalId,
          name: body.displayName,
          userIds: replacementUserIds,
        });
      const synced = await readOnlyViewerMutation({
        request,
        organizationId: orgId,
        excludeGroupId: existing?.id,
        prospectiveUserIds: async () => {
          const target =
            existing ??
            (body.externalId ? await store.findScimCollaborationGroup(orgId, body.externalId) : undefined);
          return target ? groupViewerAudience(orgId, target.id, replacementUserIds) : null;
        },
        mutation: syncGroup,
      });

      if (!synced.ok) {
        throwGroupMutationFailure(synced);
      }

      const { group } = synced;

      await store.recordAudit({
        organizationId: orgId,
        action: synced.created ? 'scim.group.create' : 'scim.group.replace',
        resourceType: 'collaborationGroup',
        resourceId: group.id,
        metadata: { externalId: group.externalId, memberCount: body.members.length, correlationId: request.id },
      });
      return reply.code(synced.created ? 201 : 200).send(
        toScimGroup(
          group,
          body.members.map((member) => member.value),
        ),
      );
    }),
  );

  app.put(
    '/scim/v2/:orgId/Groups/:groupId',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId, groupId } = parse(groupParamsSchema, request.params);
      const body = parse(scimGroupSchema, request.body ?? {});
      await dependencies.requireScim(request, orgId);
      const replacementUserIds = body.members.map((member) => member.value);
      const synced = await readOnlyViewerMutation({
        request,
        organizationId: orgId,
        excludeGroupId: groupId,
        prospectiveUserIds: () => groupViewerAudience(orgId, groupId, replacementUserIds),
        mutation: () =>
          store.syncScimCollaborationGroup({
            organizationId: orgId,
            groupId,
            externalId: body.externalId,
            name: body.displayName,
            userIds: replacementUserIds,
          }),
      });

      if (!synced.ok) {
        throwGroupMutationFailure(synced);
      }

      await store.recordAudit({
        organizationId: orgId,
        action: 'scim.group.replace',
        resourceType: 'collaborationGroup',
        resourceId: groupId,
        metadata: { memberCount: body.members.length, correlationId: request.id },
      });
      return reply.send(
        toScimGroup(
          synced.group,
          body.members.map((member) => member.value),
        ),
      );
    }),
  );

  app.patch(
    '/scim/v2/:orgId/Groups/:groupId',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId, groupId } = parse(groupParamsSchema, request.params);
      const body = parse(scimGroupPatchSchema, request.body ?? {});
      await dependencies.requireScim(request, orgId);
      const group = await requireScimGroup(orgId, groupId);
      let displayName = group.name;
      let externalId: string | null | undefined = group.externalId;
      const memberIds = new Set(await scimMembers(orgId, groupId));

      for (const operation of body.Operations) {
        const path = operation.path?.trim();
        const normalizedPath = path?.toLowerCase();
        const filteredMember = path?.match(/^members\s*\[\s*value\s+eq\s+(["'])([^"']+)\1\s*\]$/i)?.[2];
        const objectValue =
          operation.value && typeof operation.value === 'object' && !Array.isArray(operation.value)
            ? (operation.value as Record<string, unknown>)
            : undefined;

        if (normalizedPath === 'displayname' || (!path && objectValue && 'displayName' in objectValue)) {
          if (operation.op === 'remove') {
            throw new IdentityCollaborationError(
              'SCIM_INVALID_PATH',
              'displayName is required and cannot be removed',
              400,
            );
          }
          displayName = parse(
            groupNameSchema,
            normalizedPath === 'displayname' ? operation.value : objectValue!.displayName,
          );
        }

        if (normalizedPath === 'externalid' || (!path && objectValue && 'externalId' in objectValue)) {
          if (operation.op === 'remove') {
            externalId = null;
          } else {
            externalId = parse(
              z.string().trim().min(1).max(255),
              normalizedPath === 'externalid' ? operation.value : objectValue!.externalId,
            );
          }
        }

        const touchesMembers =
          normalizedPath === 'members' || Boolean(filteredMember) || (!path && objectValue && 'members' in objectValue);
        if (touchesMembers) {
          if (filteredMember) {
            if (operation.op !== 'remove') {
              throw new IdentityCollaborationError(
                'SCIM_INVALID_PATH',
                'Filtered member paths are supported only for remove operations',
                400,
              );
            }
            memberIds.delete(filteredMember);
          } else {
            const values = scimPatchMembers(normalizedPath === 'members' ? operation.value : objectValue);
            if (operation.op === 'replace') {
              memberIds.clear();
              values.forEach((value) => memberIds.add(value));
            } else if (operation.op === 'add') {
              values.forEach((value) => memberIds.add(value));
            } else if (values.length === 0) {
              memberIds.clear();
            } else {
              values.forEach((value) => memberIds.delete(value));
            }
          }
        }

        const supportedPath =
          !path ||
          normalizedPath === 'displayname' ||
          normalizedPath === 'externalid' ||
          normalizedPath === 'members' ||
          Boolean(filteredMember);
        if (!supportedPath) {
          throw new IdentityCollaborationError('SCIM_INVALID_PATH', `Unsupported Group path: ${path}`, 400);
        }
        if (!path && !objectValue) {
          throw new IdentityCollaborationError(
            'VALIDATION_FAILED',
            'A pathless SCIM operation requires an object value',
            400,
          );
        }
      }

      const replacementUserIds = [...memberIds];
      const synced = await readOnlyViewerMutation({
        request,
        organizationId: orgId,
        excludeGroupId: groupId,
        prospectiveUserIds: () => groupViewerAudience(orgId, groupId, replacementUserIds),
        mutation: () =>
          store.syncScimCollaborationGroup({
            organizationId: orgId,
            groupId,
            externalId,
            name: displayName,
            userIds: replacementUserIds,
          }),
      });
      if (!synced.ok) {
        throwGroupMutationFailure(synced);
      }

      await store.recordAudit({
        organizationId: orgId,
        action: 'scim.group.patch',
        resourceType: 'collaborationGroup',
        resourceId: groupId,
        metadata: { operationCount: body.Operations.length, memberCount: memberIds.size, correlationId: request.id },
      });
      return reply.send(toScimGroup(synced.group, [...memberIds]));
    }),
  );

  app.delete(
    '/scim/v2/:orgId/Groups/:groupId',
    rateLimit,
    wrap(async (request, reply) => {
      const { orgId, groupId } = parse(groupParamsSchema, request.params);
      await dependencies.requireScim(request, orgId);
      const result = await readOnlyViewerMutation({
        request,
        organizationId: orgId,
        excludeGroupId: groupId,
        prospectiveUserIds: () => groupViewerAudience(orgId, groupId, []),
        mutation: () => store.archiveCollaborationGroup({ organizationId: orgId, groupId, writer: 'SCIM' }),
      });

      if (!result.ok) {
        throwGroupMutationFailure(result);
      }

      await store.recordAudit({
        organizationId: orgId,
        action: 'scim.group.delete',
        resourceType: 'collaborationGroup',
        resourceId: groupId,
        metadata: { correlationId: request.id },
      });
      return reply.code(204).send();
    }),
  );
}

export { GUEST_CONSENT_VERSION };
