/*
 * Identity & collaboration routes (IDENTITY_COLLABORATION_CONTRACT / P0-EX-07):
 * organization Groups (SCIM-manageable) and generic resource AccessGrants
 * (subject = user | group, resource typed, expiry + explicit revocation).
 *
 * These routes only MANAGE the rows. The actual permission enforcement is
 * server-side in requireProject → projectCollaborationRole (app.ts), which
 * ignores expired and revoked grants and clamps guests to read-only. Managing
 * grants/groups requires the org's members:manage — the same rule as project
 * collaborators (a mere collaborator must not grant access to others).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodSchema } from 'zod';
import { rolePermissions } from '@vibecore/rbac';
import type { PermissionKey } from '@vibecore/rbac';
import type { ApiStore } from './store.js';

export class IdentityCollaborationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'IdentityCollaborationError';
  }
}

export interface IdentityCollaborationRouteDeps {
  store: ApiStore;
  guardOrg: (request: FastifyRequest, organizationId: string, permission: PermissionKey) => Promise<unknown>;
  audit: (
    request: FastifyRequest,
    entry: { organizationId?: string; action: string; resourceType: string; resourceId?: string; metadata?: Record<string, unknown> },
  ) => Promise<void>;
}

const createGroupSchema = z.object({
  name: z.string().min(1).max(120),
  scimManaged: z.boolean().optional(),
});

const groupMemberSchema = z.object({ userId: z.string().min(1) });

const createGrantSchema = z
  .object({
    subjectType: z.enum(['USER', 'GROUP']),
    subjectUserId: z.string().min(1).optional(),
    subjectGroupId: z.string().min(1).optional(),
    roleKey: z.string().min(1),
    /** ISO date; omitted = no expiry. */
    expiresAt: z.string().datetime().optional(),
  })
  .refine((value) => (value.subjectType === 'USER' ? !!value.subjectUserId : !!value.subjectGroupId), {
    message: 'subjectUserId is required for USER grants, subjectGroupId for GROUP grants',
  });

function parseBody<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new IdentityCollaborationError(
      'VALIDATION_FAILED',
      result.error.issues.map((issue) => issue.message).join('; '),
      400,
    );
  }

  return result.data;
}

function sendTypedError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof IdentityCollaborationError) {
    reply.code(error.statusCode).send({ error: error.message, code: error.code });

    return true;
  }

  return false;
}

/**
 * SCIM invariant (contract §4): when a group is SCIM-managed, the IdP is the
 * single source of truth — every manual mutation is refused, not merged.
 */
function assertNotScimManaged(group: { scimManaged: boolean }): void {
  if (group.scimManaged) {
    throw new IdentityCollaborationError(
      'GROUP_SCIM_MANAGED',
      'This group is SCIM-managed; membership is owned by the identity provider and cannot be edited manually',
      409,
    );
  }
}

export function registerIdentityCollaborationRoutes(
  app: FastifyInstance,
  deps: IdentityCollaborationRouteDeps,
): void {
  const { store } = deps;

  const wrap =
    (handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await handler(request, reply);
      } catch (error) {
        if (sendTypedError(reply, error)) {
          return reply;
        }

        throw error;
      }
    };

  const mustGetGroup = async (organizationId: string, groupId: string) => {
    const group = await store.getGroup(groupId);

    if (!group || group.organizationId !== organizationId) {
      throw new IdentityCollaborationError('GROUP_NOT_FOUND', `Group ${groupId} not found`, 404);
    }

    return group;
  };

  // ── Groups ──
  app.post(
    '/orgs/:orgId/groups',
    wrap(async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      await deps.guardOrg(request, orgId, 'members:manage');

      const body = parseBody(createGroupSchema, request.body ?? {});
      const group = await store.createGroup({ organizationId: orgId, name: body.name, scimManaged: body.scimManaged });

      await deps.audit(request, {
        organizationId: orgId,
        action: 'org.group.create',
        resourceType: 'group',
        resourceId: group.id,
        metadata: { name: group.name, scimManaged: group.scimManaged },
      });

      return reply.code(201).send({ group });
    }),
  );

  app.get(
    '/orgs/:orgId/groups',
    wrap(async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      await deps.guardOrg(request, orgId, 'org:read');

      const groups = await store.listGroups(orgId);
      const withMembers = await Promise.all(
        groups.map(async (group) => ({ ...group, members: await store.listGroupMembers(group.id) })),
      );

      return reply.send({ groups: withMembers });
    }),
  );

  app.delete(
    '/orgs/:orgId/groups/:groupId',
    wrap(async (request, reply) => {
      const { orgId, groupId } = request.params as { orgId: string; groupId: string };
      await deps.guardOrg(request, orgId, 'members:manage');

      const group = await mustGetGroup(orgId, groupId);
      assertNotScimManaged(group);
      await store.deleteGroup(groupId);

      await deps.audit(request, {
        organizationId: orgId,
        action: 'org.group.delete',
        resourceType: 'group',
        resourceId: groupId,
      });

      return reply.code(204).send();
    }),
  );

  app.post(
    '/orgs/:orgId/groups/:groupId/members',
    wrap(async (request, reply) => {
      const { orgId, groupId } = request.params as { orgId: string; groupId: string };
      await deps.guardOrg(request, orgId, 'members:manage');

      const body = parseBody(groupMemberSchema, request.body ?? {});
      const group = await mustGetGroup(orgId, groupId);
      assertNotScimManaged(group);

      // Same rule as project collaborators: only org members can join groups.
      const membership = await store.getMembership(body.userId, orgId);

      if (!membership) {
        throw new IdentityCollaborationError(
          'GROUP_MEMBER_NOT_ORG_MEMBER',
          'Only organization members can be added to a group',
          403,
        );
      }

      const member = await store.addGroupMember({ groupId, userId: body.userId });

      await deps.audit(request, {
        organizationId: orgId,
        action: 'org.group.member_add',
        resourceType: 'group',
        resourceId: groupId,
        metadata: { userId: body.userId },
      });

      return reply.code(201).send({ member });
    }),
  );

  app.delete(
    '/orgs/:orgId/groups/:groupId/members/:userId',
    wrap(async (request, reply) => {
      const { orgId, groupId, userId } = request.params as { orgId: string; groupId: string; userId: string };
      await deps.guardOrg(request, orgId, 'members:manage');

      const group = await mustGetGroup(orgId, groupId);
      assertNotScimManaged(group);
      const removed = await store.removeGroupMember({ groupId, userId });

      if (!removed) {
        throw new IdentityCollaborationError('GROUP_MEMBER_NOT_FOUND', 'Not a member of this group', 404);
      }

      await deps.audit(request, {
        organizationId: orgId,
        action: 'org.group.member_remove',
        resourceType: 'group',
        resourceId: groupId,
        metadata: { userId },
      });

      return reply.code(204).send();
    }),
  );

  // ── Project access grants ──
  const mustGetProject = async (projectId: string) => {
    const project = await store.getProject(projectId);

    if (!project || project.deletedAt) {
      throw new IdentityCollaborationError('PROJECT_NOT_FOUND', 'Project not found', 404);
    }

    return project;
  };

  app.post(
    '/projects/:projectId/access-grants',
    wrap(async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const project = await mustGetProject(projectId);

      /*
       * Managing the ACL of a project requires REAL org membership with
       * members:manage — the collaborator fallback must not let a guest or a
       * share-link collaborator widen access (same rule as /collaborators).
       */
      await deps.guardOrg(request, project.organizationId, 'members:manage');

      const body = parseBody(createGrantSchema, request.body ?? {});

      if (!(body.roleKey in rolePermissions)) {
        throw new IdentityCollaborationError('UNKNOWN_ROLE', `Unknown roleKey ${body.roleKey}`, 400);
      }

      if (body.subjectType === 'USER') {
        const membership = await store.getMembership(body.subjectUserId!, project.organizationId);

        /*
         * A USER grant to a non-member is exactly the GUEST case: allowed, but
         * only with the guest role (narrow, read-only scope). Wider roles for
         * outsiders must go through org membership.
         */
        if (!membership && body.roleKey !== 'guest' && body.roleKey !== 'viewer') {
          throw new IdentityCollaborationError(
            'GRANT_OUTSIDER_ROLE_TOO_WIDE',
            'Users outside the organization can only receive guest/viewer grants',
            403,
          );
        }
      } else {
        const group = await store.getGroup(body.subjectGroupId!);

        if (!group || group.organizationId !== project.organizationId) {
          throw new IdentityCollaborationError('GROUP_NOT_FOUND', 'Group not found in this organization', 404);
        }
      }

      const grant = await store.createAccessGrant({
        organizationId: project.organizationId,
        subjectType: body.subjectType,
        subjectUserId: body.subjectUserId,
        subjectGroupId: body.subjectGroupId,
        resourceType: 'PROJECT',
        resourceId: projectId,
        roleKey: body.roleKey,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        grantedByUserId: (request as { currentUser?: { id?: string } }).currentUser?.id,
      });

      await deps.audit(request, {
        organizationId: project.organizationId,
        action: 'project.access_grant.create',
        resourceType: 'resourceAccessGrant',
        resourceId: grant.id,
        metadata: {
          projectId,
          subjectType: grant.subjectType,
          subjectUserId: grant.subjectUserId,
          subjectGroupId: grant.subjectGroupId,
          roleKey: grant.roleKey,
          expiresAt: grant.expiresAt,
        },
      });

      return reply.code(201).send({ grant });
    }),
  );

  app.get(
    '/projects/:projectId/access-grants',
    wrap(async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const project = await mustGetProject(projectId);
      await deps.guardOrg(request, project.organizationId, 'members:manage');

      return reply.send({ grants: await store.listAccessGrantsForResource('PROJECT', projectId) });
    }),
  );

  app.delete(
    '/projects/:projectId/access-grants/:grantId',
    wrap(async (request, reply) => {
      const { projectId, grantId } = request.params as { projectId: string; grantId: string };
      const project = await mustGetProject(projectId);
      await deps.guardOrg(request, project.organizationId, 'members:manage');

      const existing = await store.getAccessGrant(grantId);

      if (!existing || existing.resourceId !== projectId) {
        throw new IdentityCollaborationError('GRANT_NOT_FOUND', 'Access grant not found', 404);
      }

      const revoked = await store.revokeAccessGrant({
        grantId,
        revokedByUserId: (request as { currentUser?: { id?: string } }).currentUser?.id,
      });

      await deps.audit(request, {
        organizationId: project.organizationId,
        action: 'project.access_grant.revoke',
        resourceType: 'resourceAccessGrant',
        resourceId: grantId,
        metadata: { projectId },
      });

      return reply.send({ grant: revoked });
    }),
  );
}
