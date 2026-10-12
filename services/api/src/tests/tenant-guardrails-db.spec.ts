import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';
import {
  evaluateTenantAdmission,
  policyForTier,
  tenantGuardrailUsageType,
  type TenantAdmissionCode,
} from '../tenant-guardrails.js';

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  const prisma = createDatabaseClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

runDbTests('tenant guardrails — real PostgreSQL serialization', () => {
  it('serializes the last project slot and counts every severe abuse event authoritatively', async () => {
    const storeA = new PrismaApiStore(createDatabaseClient());
    const storeB = new PrismaApiStore(createDatabaseClient());

    let organizationId: string | undefined;

    try {
      const idSuffix = suffix();

      const organization = await storeA.prisma.organization.create({
        data: { name: `Tenant guardrail ${idSuffix}`, slug: `tenant-guardrail-${idSuffix}` },
      });
      organizationId = organization.id;

      const oldProject = await storeA.createProject({
        organizationId,
        name: 'Existing project',
        slug: `existing-${idSuffix}`,
      });
      await storeA.prisma.project.update({
        where: { id: oldProject.id },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });

      const since = new Date(Date.now() - 60 * 60 * 1000);
      expect(await storeA.countProjects(organizationId)).toBe(1);
      await storeA.recordUsageEvent({
        organizationId,
        type: tenantGuardrailUsageType('project.create'),
      });

      const attempt = (store: PrismaApiStore, name: string) =>
        store.withSerializedMutation(
          `projects:${organizationId}`,
          async (): Promise<'created' | TenantAdmissionCode> => {
            const [projects, recent] = await Promise.all([
              store.countProjects(organizationId!),
              store.sumUsage(organizationId!, tenantGuardrailUsageType('project.create'), since),
            ]);
            const decision = evaluateTenantAdmission({
              action: 'project.create',
              tier: 'UNTRUSTED',
              organizationId,
              binding: {
                organizationId: organizationId!,
                state: 'UNBOUND',
                billingAccountKey: policyForTier('UNTRUSTED').billingAccountKey,
              },
              usage: { projects },
              recentCreates: { 'project.create': recent },
              context: { action: 'project.create' },
            });

            if (!decision.allowed) {
              return decision.code!;
            }

            await store.recordUsageEvent({
              organizationId: organizationId!,
              type: tenantGuardrailUsageType('project.create'),
            });
            await store.createProject({
              organizationId: organizationId!,
              name,
              slug: `${name}-${idSuffix}`,
            });

            return 'created';
          },
        );

      const results = await Promise.all([attempt(storeA, 'replica-a'), attempt(storeB, 'replica-b')]);

      expect(results.sort()).toEqual(['TENANT_CAP_EXCEEDED', 'created']);
      expect(await storeA.countProjects(organizationId)).toBe(2);
      expect(await storeA.sumUsage(organizationId, tenantGuardrailUsageType('project.create'), since)).toBe(2);

      const abuseSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await storeA.prisma.abuseEvent.createMany({
        data: [
          {
            organizationId,
            type: 'recent-severe',
            severity: 'high',
            createdAt: new Date(Date.now() - 60_000),
          },
          {
            organizationId,
            type: 'operator-dismissed',
            severity: 'critical',
            metadata: { disposition: 'dismissed' },
            createdAt: new Date(Date.now() - 60_000),
          },
          {
            organizationId,
            type: 'stale-severe',
            severity: 'critical',
            createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
          },
          ...Array.from({ length: 101 }, (_, index) => ({
            organizationId,
            type: `newer-noise-${index}`,
            severity: 'low',
            createdAt: new Date(),
          })),
        ],
      });

      expect(await storeA.countRecentSevereAbuseEvents(organizationId, abuseSince)).toBe(1);
    } finally {
      if (organizationId) {
        await storeA.prisma.abuseEvent.deleteMany({ where: { organizationId } }).catch(() => undefined);
        await storeA.prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }

      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it('counts active strikes across every organization member from real persisted preferences', async () => {
    const store = new PrismaApiStore(createDatabaseClient());
    const unique = suffix();
    const users: string[] = [];

    let organizationId: string | undefined;

    try {
      const owner = await store.createUser({ email: `owner-${unique}@example.test`, passwordHash: 'fixture-hash' });
      users.push(owner.id);

      const collaborator = await store.createUser({
        email: `member-${unique}@example.test`,
        passwordHash: 'fixture-hash',
      });
      users.push(collaborator.id);

      const organization = await store.createOrganization({
        name: 'Strike proof',
        slug: `strike-${unique}`,
        ownerUserId: owner.id,
      });
      organizationId = organization.id;
      await store.addMember({ organizationId, userId: collaborator.id, roleKey: 'member' });

      const now = Date.now();
      await store.prisma.user.update({
        where: { id: collaborator.id },
        data: { preferences: { moderationStrikes: [{ createdAt: new Date(now - 1_000).toISOString() }] } },
      });
      expect(await store.countOrganizationActiveStrikes(organizationId, now)).toBe(1);
      await store.prisma.user.update({
        where: { id: owner.id },
        data: { preferences: { moderationStrikes: 'invalid' } },
      });
      expect(await store.countOrganizationActiveStrikes(organizationId, now)).toBe(2);
      await store.prisma.user.update({ where: { id: collaborator.id }, data: { preferences: {} } });
      await store.prisma.user.update({ where: { id: owner.id }, data: { preferences: {} } });
      expect(await store.countOrganizationActiveStrikes(organizationId, now)).toBe(0);
    } finally {
      if (organizationId) {
        await store.prisma.organization.delete({ where: { id: organizationId } });
      }

      await store.prisma.user.deleteMany({ where: { id: { in: users } } });
      await store.disconnect();
    }
  });
});
