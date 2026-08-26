import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';
import { PrismaApiStore } from '../prisma-store.js';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function futureExpiry(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1_000);
}

runDbTests('P0-EX-07 identity collaboration — durable Postgres guarantees', () => {
  it('serializes grant creation across replicas and evaluates consent, expiry, and revocation with the DB clock', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    try {
      const marker = suffix();
      const [owner, guest] = await Promise.all([
        prismaA.user.create({ data: { email: `identity-owner-${marker}@example.com`, name: 'Identity owner' } }),
        prismaA.user.create({ data: { email: `identity-guest-${marker}@example.com`, name: 'Identity guest' } }),
      ]);
      const organization = await prismaA.organization.create({
        data: { name: 'Identity DB concurrency', slug: `identity-concurrency-${marker}` },
      });
      const project = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Identity DB concurrency', slug: `project-${marker}` },
      });
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const request = {
        organizationId: organization.id,
        subjectType: 'USER' as const,
        subjectUserId: guest.id,
        resourceType: 'PROJECT' as const,
        resourceId: project.id,
        roleKey: 'viewer',
        status: 'PENDING_CONSENT' as const,
        expiresAt: futureExpiry(),
        grantedByUserId: owner.id,
        idempotencyKey: `grant-${marker}`,
        requestHash: `hash-${marker}`,
      };

      /* Independent pools model API replicas racing on the same request. */
      const attempts = await Promise.all(
        Array.from({ length: 8 }, (_, index) => (index % 2 === 0 ? storeA : storeB).createResourceAccessGrant(request)),
      );
      expect(attempts.every((attempt) => attempt.ok)).toBe(true);
      const grantIds = attempts.flatMap((attempt) => (attempt.ok ? [attempt.grant.id] : []));
      expect(new Set(grantIds).size).toBe(1);
      expect(
        await prismaA.resourceAccessGrant.count({
          where: { organizationId: organization.id, idempotencyKey: request.idempotencyKey },
        }),
      ).toBe(1);
      const grantId = grantIds[0]!;

      await expect(storeB.listActiveProjectAccessRoles(project.id, guest.id)).resolves.toEqual([]);
      await expect(
        storeA.createResourceAccessGrant({ ...request, requestHash: `different-${marker}` }),
      ).resolves.toEqual({ ok: false, reason: 'IDEMPOTENCY_CONFLICT' });

      const accepted = await storeB.acceptResourceAccessGrant({
        grantId,
        subjectUserId: guest.id,
        consentVersion: 'project-access-consent-v1',
      });
      expect(accepted.ok).toBe(true);
      await expect(storeA.listActiveProjectAccessRoles(project.id, guest.id)).resolves.toEqual(['viewer']);

      const revocations = await Promise.all([
        storeA.revokeResourceAccessGrant({
          organizationId: organization.id,
          grantId,
          revokedByUserId: owner.id,
          reason: 'DB_CONCURRENT_REVOKE',
        }),
        storeB.revokeResourceAccessGrant({
          organizationId: organization.id,
          grantId,
          revokedByUserId: owner.id,
          reason: 'DB_CONCURRENT_REVOKE',
        }),
      ]);
      expect(revocations.filter((result) => result.ok)).toHaveLength(1);
      await expect(storeB.listActiveProjectAccessRoles(project.id, guest.id)).resolves.toEqual([]);

      const replacement = await storeA.createResourceAccessGrant({
        ...request,
        idempotencyKey: `expired-${marker}`,
        requestHash: `expired-hash-${marker}`,
      });
      expect(replacement.ok).toBe(true);
      if (!replacement.ok) throw new Error(`Unexpected replacement failure: ${replacement.reason}`);

      /* Both the transition and authorization query compare against PostgreSQL NOW(). */
      await prismaA.$executeRaw`
        UPDATE "ResourceAccessGrant"
        SET "createdAt" = CURRENT_TIMESTAMP - INTERVAL '2 seconds',
            "expiresAt" = CURRENT_TIMESTAMP - INTERVAL '1 second'
        WHERE "id" = ${replacement.grant.id}
      `;
      await expect(
        storeB.acceptResourceAccessGrant({
          grantId: replacement.grant.id,
          subjectUserId: guest.id,
          consentVersion: 'project-access-consent-v1',
        }),
      ).resolves.toEqual({ ok: false, reason: 'GRANT_EXPIRED' });
      await expect(storeA.listActiveProjectAccessRoles(project.id, guest.id)).resolves.toEqual([]);
    } finally {
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('enforces exactly one grant subject and tenant-contained group membership in PostgreSQL', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    try {
      const marker = suffix();
      const [owner, memberA, memberB] = await Promise.all([
        prismaA.user.create({ data: { email: `constraint-owner-${marker}@example.com` } }),
        prismaA.user.create({ data: { email: `constraint-a-${marker}@example.com` } }),
        prismaA.user.create({ data: { email: `constraint-b-${marker}@example.com` } }),
      ]);
      const [organizationA, organizationB] = await Promise.all([
        prismaA.organization.create({ data: { name: 'Constraint tenant A', slug: `constraint-a-${marker}` } }),
        prismaA.organization.create({ data: { name: 'Constraint tenant B', slug: `constraint-b-${marker}` } }),
      ]);
      const role = await prismaA.role.create({
        data: { key: `constraint-member-${marker}`, name: 'Constraint member' },
      });
      const [membershipA, membershipB] = await Promise.all([
        prismaA.organizationMember.create({
          data: { organizationId: organizationA.id, userId: memberA.id, roleId: role.id },
        }),
        prismaA.organizationMember.create({
          data: { organizationId: organizationB.id, userId: memberB.id, roleId: role.id },
        }),
      ]);
      const storeA = new PrismaApiStore(prismaA);
      const group = await storeA.createCollaborationGroup({
        organizationId: organizationA.id,
        name: 'Tenant A only',
        source: 'MANUAL',
      });

      await expect(
        prismaB.collaborationGroupMember.create({
          data: {
            organizationId: organizationA.id,
            groupId: group.id,
            membershipId: membershipB.id,
          },
        }),
      ).rejects.toThrow();
      expect(
        await prismaA.collaborationGroupMember.count({
          where: { organizationId: organizationA.id, groupId: group.id },
        }),
      ).toBe(0);

      const invalidGrantId = `invalid-grant-${marker}`;
      await expect(
        prismaB.$executeRaw`
          INSERT INTO "ResourceAccessGrant" (
            "id", "organizationId", "subjectType", "subjectUserId", "subjectGroupId",
            "resourceType", "resourceId", "roleKey", "status", "expiresAt",
            "acceptedAt", "grantedByUserId", "requestHash", "updatedAt"
          ) VALUES (
            ${invalidGrantId}, ${organizationA.id}, 'USER', ${memberA.id}, ${group.id},
            'PROJECT', 'constraint-resource', 'viewer', 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '1 hour',
            CURRENT_TIMESTAMP, ${owner.id}, 'invalid-two-subjects', CURRENT_TIMESTAMP
          )
        `,
      ).rejects.toThrow();
      expect(await prismaA.resourceAccessGrant.count({ where: { id: invalidGrantId } })).toBe(0);

      /* The valid same-tenant edge remains insertable after both rejected writes. */
      await expect(
        storeA.addCollaborationGroupMember({
          organizationId: organizationA.id,
          groupId: group.id,
          userId: memberA.id,
          writer: 'MANUAL',
        }),
      ).resolves.toMatchObject({ ok: true });
      expect(membershipA.organizationId).toBe(organizationA.id);
    } finally {
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('keeps SCIM replacement and organization offboarding atomic across independent clients', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    try {
      const marker = suffix();
      const [owner, member, outsider] = await Promise.all([
        prismaA.user.create({ data: { email: `offboard-owner-${marker}@example.com` } }),
        prismaA.user.create({ data: { email: `offboard-member-${marker}@example.com` } }),
        prismaA.user.create({ data: { email: `offboard-outsider-${marker}@example.com` } }),
      ]);
      const organization = await prismaA.organization.create({
        data: { name: 'Atomic identity tenant', slug: `atomic-identity-${marker}` },
      });
      const role = await prismaA.role.create({ data: { key: `atomic-member-${marker}`, name: 'Atomic member' } });
      await prismaA.organizationMember.create({
        data: { organizationId: organization.id, userId: member.id, roleId: role.id, invitedByUserId: owner.id },
      });
      const project = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Atomic project', slug: `atomic-project-${marker}` },
      });
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);

      const provisioned = await storeA.syncScimCollaborationGroup({
        organizationId: organization.id,
        externalId: `idp-${marker}`,
        name: 'IdP engineering',
        userIds: [member.id],
      });
      expect(provisioned.ok).toBe(true);
      if (!provisioned.ok) throw new Error(`Unexpected SCIM failure: ${provisioned.reason}`);

      const rejected = await storeB.syncScimCollaborationGroup({
        organizationId: organization.id,
        groupId: provisioned.group.id,
        externalId: `idp-${marker}`,
        name: 'This update must roll back',
        userIds: [member.id, outsider.id],
      });
      expect(rejected).toEqual({ ok: false, reason: 'MEMBERSHIP_NOT_ACTIVE' });
      await expect(storeA.getCollaborationGroup(provisioned.group.id)).resolves.toMatchObject({
        name: 'IdP engineering',
      });
      await expect(
        storeA.listCollaborationGroupMembers({
          organizationId: organization.id,
          groupId: provisioned.group.id,
          limit: 10,
        }),
      ).resolves.toMatchObject({ items: [{ userId: member.id }] });

      const directGrant = await storeA.createResourceAccessGrant({
        organizationId: organization.id,
        subjectType: 'USER',
        subjectUserId: member.id,
        resourceType: 'PROJECT',
        resourceId: project.id,
        roleKey: 'viewer',
        status: 'ACTIVE',
        expiresAt: futureExpiry(),
        acceptedAt: new Date(),
        consentVersion: 'organization-membership-v1',
        grantedByUserId: owner.id,
        idempotencyKey: `offboard-${marker}`,
        requestHash: `offboard-hash-${marker}`,
      });
      expect(directGrant.ok).toBe(true);
      await expect(storeB.listActiveProjectAccessRoles(project.id, member.id)).resolves.toEqual(['viewer']);

      await expect(storeB.removeMember(organization.id, member.id)).resolves.toBeDefined();
      await expect(storeA.listActiveProjectAccessRoles(project.id, member.id)).resolves.toEqual([]);
      expect(
        await prismaA.resourceAccessGrant.count({
          where: { organizationId: organization.id, subjectUserId: member.id, status: 'REVOKED' },
        }),
      ).toBe(1);
      expect(await prismaA.collaborationGroupMember.count({ where: { organizationId: organization.id } })).toBe(0);
      expect(
        await prismaA.organizationMember.count({ where: { organizationId: organization.id, userId: member.id } }),
      ).toBe(0);
    } finally {
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
