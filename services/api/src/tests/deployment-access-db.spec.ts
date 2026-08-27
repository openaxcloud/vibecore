import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

// The API tsconfig intentionally has no `~/` path alias; runtime ESM tests use package-relative imports.
// eslint-disable-next-line no-restricted-imports
import { hashDeploymentAccessTicket } from '../deployment-access.js';
// eslint-disable-next-line no-restricted-imports
import { PrismaApiStore } from '../prisma-store.js';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

runDbTests('deployment access — durable PostgreSQL guarantees', () => {
  it('tenant-fences authorization and consumes a hashed ticket once across API replicas', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    const organizationIds: string[] = [];
    const userIds: string[] = [];

    try {
      const marker = suffix();

      const [owner, member, outsider] = await Promise.all([
        prismaA.user.create({ data: { email: `access-owner-${marker}@example.com` } }),
        prismaA.user.create({ data: { email: `access-member-${marker}@example.com` } }),
        prismaA.user.create({ data: { email: `access-outsider-${marker}@example.com` } }),
      ]);
      userIds.push(owner.id, member.id, outsider.id);

      const [ownerRole, memberRole] = await Promise.all([
        prismaA.role.upsert({
          where: { key: 'owner' },
          create: { key: 'owner', name: 'Owner' },
          update: {},
        }),
        prismaA.role.upsert({
          where: { key: 'member' },
          create: { key: 'member', name: 'Member' },
          update: {},
        }),
      ]);
      const organization = await prismaA.organization.create({
        data: { name: 'Deployment access DB', slug: `deployment-access-${marker}` },
      });
      const otherOrganization = await prismaA.organization.create({
        data: { name: 'Deployment access other DB', slug: `deployment-access-other-${marker}` },
      });
      organizationIds.push(organization.id, otherOrganization.id);
      await prismaA.organizationMember.createMany({
        data: [
          { organizationId: organization.id, userId: owner.id, roleId: ownerRole.id, state: 'ACTIVE' },
          { organizationId: organization.id, userId: member.id, roleId: memberRole.id, state: 'ACTIVE' },
        ],
      });

      const project = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Deployment access DB', slug: `access-project-${marker}` },
      });

      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);

      const deployment = await storeA.createDeployment({
        projectId: project.id,
        provider: 'static',
        environment: 'preview',
        status: 'BUILDING',
        accessPolicy: { mode: 'INVITE_ONLY', createdByUserId: owner.id },
      });
      await storeA.updateDeployment(project.id, deployment.id, { status: 'READY' });

      await expect(
        storeA.isDeploymentAccessUserAuthorized({ deploymentId: deployment.id, userId: owner.id, mode: 'INVITE_ONLY' }),
      ).resolves.toBe(true);
      await expect(
        storeA.isDeploymentAccessUserAuthorized({
          deploymentId: deployment.id,
          userId: member.id,
          mode: 'INVITE_ONLY',
        }),
      ).resolves.toBe(false);
      await expect(
        storeA.isDeploymentAccessUserAuthorized({
          deploymentId: deployment.id,
          userId: outsider.id,
          mode: 'WORKSPACE_ONLY',
        }),
      ).resolves.toBe(false);
      await expect(
        storeA.isDeploymentAccessUserAuthorized({
          deploymentId: deployment.id,
          userId: member.id,
          mode: 'WORKSPACE_ONLY',
        }),
      ).resolves.toBe(true);

      await prismaA.organizationMember.update({
        where: { organizationId_userId: { organizationId: organization.id, userId: member.id } },
        data: { state: 'SUSPENDED' },
      });
      await expect(
        storeB.isDeploymentAccessUserAuthorized({
          deploymentId: deployment.id,
          userId: member.id,
          mode: 'WORKSPACE_ONLY',
        }),
      ).resolves.toBe(false);
      await prismaA.organizationMember.update({
        where: { organizationId_userId: { organizationId: organization.id, userId: member.id } },
        data: { state: 'ACTIVE' },
      });

      await prismaA.resourceAccessGrant.create({
        data: {
          organizationId: otherOrganization.id,
          subjectType: 'USER',
          subjectUserId: outsider.id,
          resourceType: 'DEPLOYMENT',
          resourceId: deployment.id,
          roleKey: 'viewer',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 60_000),
          acceptedAt: new Date(),
          consentVersion: 'deployment-access-test-v1',
          grantedByUserId: owner.id,
          requestHash: `cross-tenant-${marker}`,
        },
      });
      await expect(
        storeA.isDeploymentAccessUserAuthorized({
          deploymentId: deployment.id,
          userId: outsider.id,
          mode: 'INVITE_ONLY',
        }),
      ).resolves.toBe(false);

      await prismaA.resourceAccessGrant.create({
        data: {
          organizationId: organization.id,
          subjectType: 'USER',
          subjectUserId: outsider.id,
          resourceType: 'DEPLOYMENT',
          resourceId: deployment.id,
          roleKey: 'viewer',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 60_000),
          acceptedAt: new Date(),
          consentVersion: 'deployment-access-test-v1',
          grantedByUserId: owner.id,
          requestHash: `same-tenant-${marker}`,
        },
      });
      await expect(
        storeB.isDeploymentAccessUserAuthorized({
          deploymentId: deployment.id,
          userId: outsider.id,
          mode: 'INVITE_ONLY',
        }),
      ).resolves.toBe(true);

      await storeA.addProjectCollaborator({ projectId: project.id, userId: member.id, roleKey: 'viewer' });
      await expect(
        storeB.isDeploymentAccessUserAuthorized({
          deploymentId: deployment.id,
          userId: member.id,
          mode: 'INVITE_ONLY',
        }),
      ).resolves.toBe(true);

      const rawTicket = `dep_access_${marker.replaceAll('-', '_')}`;
      const tokenHash = hashDeploymentAccessTicket(rawTicket);

      const issued = await storeA.issueDeploymentAccessExchangeTicket({
        deploymentId: deployment.id,
        userId: member.id,
        tokenHash,
        ttlSeconds: 90,
      });
      expect(issued.ok).toBe(true);

      const persisted = await prismaA.deploymentAccessExchangeTicket.findUniqueOrThrow({ where: { tokenHash } });
      expect(persisted.tokenHash).toBe(tokenHash);
      expect(JSON.stringify(persisted)).not.toContain(rawTicket);

      const consumes = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          (index % 2 === 0 ? storeA : storeB).consumeDeploymentAccessExchangeTicket({
            deploymentId: deployment.id,
            tokenHash,
          }),
        ),
      );
      expect(consumes.filter((result) => result.ok)).toHaveLength(1);
      expect(consumes.filter((result) => !result.ok && result.reason === 'TICKET_REPLAYED')).toHaveLength(7);

      const expiredHash = hashDeploymentAccessTicket(`expired_${rawTicket}`);
      await storeA.issueDeploymentAccessExchangeTicket({
        deploymentId: deployment.id,
        userId: member.id,
        tokenHash: expiredHash,
        ttlSeconds: 90,
      });
      await prismaA.$executeRaw`
        UPDATE "DeploymentAccessExchangeTicket"
        SET "expiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "tokenHash" = ${expiredHash}
      `;
      await expect(
        storeB.consumeDeploymentAccessExchangeTicket({ deploymentId: deployment.id, tokenHash: expiredHash }),
      ).resolves.toEqual({ ok: false, reason: 'TICKET_EXPIRED' });
    } finally {
      await prismaA.organization.deleteMany({ where: { id: { in: organizationIds } } }).catch(() => undefined);
      await prismaA.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
