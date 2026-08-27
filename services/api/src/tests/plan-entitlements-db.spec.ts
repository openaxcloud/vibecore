import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';
import {
  claimPlanEgressAllowance,
  PARALLEL_AGENTS_OVERRIDE_KEY,
  PLAN_EGRESS_USAGE_TYPE,
  resolveOrganizationEntitlements,
} from '../plan-entitlements-service.js';
import { PrismaApiStore } from '../prisma-store.js';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

runDbTests('P1-COV-05 plan entitlements — durable PostgreSQL guarantees', () => {
  it('uses the PostgreSQL clock for mutable Enterprise overrides across process-skewed replicas', async () => {
    const storeA = new PrismaApiStore(createDatabaseClient());
    const storeB = new PrismaApiStore(createDatabaseClient());

    try {
      const marker = suffix();
      const owner = await storeA.createUser({
        email: `override-owner-${marker}@example.test`,
        passwordHash: 'test-only',
      });
      const activeOrganization = await storeA.createOrganization({
        name: 'Active override DB tenant',
        slug: `active-override-${marker}`,
        ownerUserId: owner.id,
      });
      const expiredOrganization = await storeA.createOrganization({
        name: 'Expired override DB tenant',
        slug: `expired-override-${marker}`,
        ownerUserId: owner.id,
      });
      await storeA.upsertBillingPlan({ key: 'enterprise', name: 'Enterprise', monthlyCents: 0, limits: {} });
      await Promise.all(
        [activeOrganization, expiredOrganization].map((organization) =>
          storeA.upsertSubscription({
            organizationId: organization.id,
            planKey: 'enterprise',
            status: 'ACTIVE',
          }),
        ),
      );
      const databaseNowMs = Date.parse((await storeA.getDatabaseClock()).now);
      await storeA.createQuotaOverride({
        organizationId: activeOrganization.id,
        key: PARALLEL_AGENTS_OVERRIDE_KEY,
        limit: 2,
        reason: 'active-by-database-clock',
        expiresAt: new Date(databaseNowMs + 30_000),
      });
      await storeA.createQuotaOverride({
        organizationId: expiredOrganization.id,
        key: PARALLEL_AGENTS_OVERRIDE_KEY,
        limit: 2,
        reason: 'expired-by-database-clock',
        expiresAt: new Date(databaseNowMs - 30_000),
      });

      // Both processes are 60s ahead: process time says the active override is
      // expired, while PostgreSQL still authoritatively admits it.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(databaseNowMs + 60_000);
      const active = await Promise.all([
        resolveOrganizationEntitlements(storeA, activeOrganization.id),
        resolveOrganizationEntitlements(storeB, activeOrganization.id),
      ]);
      expect(active.map((entry) => entry.parallelAgents)).toEqual([2, 2]);

      // Both processes are 60s behind: process time says this override is live,
      // but PostgreSQL excludes it and both replicas retain the conservative 10.
      vi.setSystemTime(databaseNowMs - 60_000);
      const expired = await Promise.all([
        resolveOrganizationEntitlements(storeA, expiredOrganization.id),
        resolveOrganizationEntitlements(storeB, expiredOrganization.id),
      ]);
      expect(expired.map((entry) => entry.parallelAgents)).toEqual([10, 10]);
    } finally {
      vi.useRealTimers();
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it('shares one Starter egress allowance atomically across every deployment kind and replica', async () => {
    const storeA = new PrismaApiStore(createDatabaseClient());
    const storeB = new PrismaApiStore(createDatabaseClient());

    try {
      const marker = suffix();
      const owner = await storeA.createUser({
        email: `egress-owner-${marker}@example.test`,
        passwordHash: 'test-only',
      });
      const organization = await storeA.createOrganization({
        name: 'Egress allowance DB tenant',
        slug: `egress-allowance-${marker}`,
        ownerUserId: owner.id,
      });
      await storeA.upsertBillingPlan({ key: 'free', name: 'Starter', monthlyCents: 0, limits: {} });
      await storeA.upsertSubscription({
        organizationId: organization.id,
        planKey: 'free',
        status: 'ACTIVE',
      });

      const kinds = ['static', 'autoscale', 'scheduled', 'reserved-vm'] as const;
      const claims = await Promise.all(
        kinds.map((deploymentKind, index) =>
          claimPlanEgressAllowance({
            store: index % 2 === 0 ? storeA : storeB,
            organizationId: organization.id,
            egressGib: 3,
            reference: `egress-${deploymentKind}-${marker}`,
            deploymentKind,
          }),
        ),
      );

      expect(claims.reduce((sum, claim) => sum + claim.includedMib, 0)).toBe(10 * 1_024);
      expect(claims.reduce((sum, claim) => sum + claim.billableMib, 0)).toBe(2 * 1_024);
      await expect(storeA.sumUsage(organization.id, PLAN_EGRESS_USAGE_TYPE)).resolves.toBe(12 * 1_024);

      const first = claims[0]!;
      await expect(
        claimPlanEgressAllowance({
          store: storeB,
          organizationId: organization.id,
          egressGib: 30,
          reference: first.reference,
          deploymentKind: first.deploymentKind,
        }),
      ).rejects.toMatchObject({ code: 'PLAN_EGRESS_IDEMPOTENCY_CONFLICT', statusCode: 409 });
      await expect(storeB.sumUsage(organization.id, PLAN_EGRESS_USAGE_TYPE)).resolves.toBe(12 * 1_024);
    } finally {
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });
});
