import { randomUUID } from 'node:crypto';
import {
  BUILTIN_AGENT_ROUTING_CARD,
  buildExplicitRunPermit,
  type ExplicitBudgetExtensionInput,
} from '@vibecore/billing';
import { createDatabaseClient } from '@vibecore/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaApiStore } from './prisma-store.js';
import { EXPLICIT_EXTENSION_POLICY as policy } from './explicit-budget-extension-policy.js';
import { explicitBudgetSnapshotDigest } from './explicit-budget-extension.js';

describe.skipIf(process.env.EXPLICIT_RUN_POSTGRES_PROOF !== '1')(
  'approved project extension on real PostgreSQL',
  () => {
    let first: PrismaApiStore;
    let second: PrismaApiStore;
    let userId: string;
    let orgId: string;
    const key = `agent.explicit-run.v1:${policy.projectId}`;
    const baseline = buildExplicitRunPermit({
      projectId: policy.projectId,
      runId: randomUUID(),
      planKey: 'free',
      card: BUILTIN_AGENT_ROUTING_CARD,
    });
    let input: ExplicitBudgetExtensionInput & { expectedOrganizationSlug: string; expectedLedgerSha256: string };
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL!);
      expect(['127.0.0.1', 'localhost']).toContain(url.hostname);
      expect(['/explicit_run_proof', '/panel_proof']).toContain(url.pathname);
      expect(process.env.NODE_ENV).toBe('test');
      first = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));
      second = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));
      userId = (
        await first.prisma.user.create({
          data: { email: `extension-${randomUUID()}@example.test`, platformAdmin: true },
        })
      ).id;
      orgId = (
        await first.prisma.organization.create({
          data: { name: 'Synthetic extension fixture', slug: policy.organizationSlug },
        })
      ).id;
      await first.prisma.project.create({
        data: {
          id: policy.projectId,
          organizationId: orgId,
          name: 'Synthetic fixture only',
          slug: 'synthetic-extension',
        },
      });
      const plan = await first.prisma.plan.upsert({
        where: { key: 'free' },
        create: { key: 'free', name: 'Synthetic free', monthlyCents: 0, limits: {} },
        update: {},
      });
      await first.prisma.subscription.create({ data: { organizationId: orgId, planId: plan.id, status: 'ACTIVE' } });
      await first.prisma.providerConfig.upsert({
        where: { provider: 'OpenAI' },
        create: { provider: 'OpenAI', displayName: 'OpenAI', enabled: true },
        update: { enabled: true, baseUrl: null },
      });
      await first.prisma.agentRoutingCard.upsert({
        where: { version: BUILTIN_AGENT_ROUTING_CARD.version },
        create: {
          version: BUILTIN_AGENT_ROUTING_CARD.version,
          active: true,
          data: JSON.parse(JSON.stringify(BUILTIN_AGENT_ROUTING_CARD)),
        },
        update: {},
      });
      expect((await first.reserveExplicitRun(baseline)).ok).toBe(true);
      input = {
        projectId: policy.projectId,
        expectedOrganizationSlug: policy.organizationSlug,
        expectedLedgerSha256: explicitBudgetSnapshotDigest(await first.getExplicitRunBudgetState(policy.projectId)),
        approvalId: policy.approvalId,
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
        expectedRunIds: [baseline.runId],
        baselineReservedMicros: 15260000,
        limitMicros: 30520000,
        maxAdditionalRuns: 1,
        maxRunReservationMicros: 15260000,
        maxCalls: 2,
        routingVersion: baseline.routingVersion,
      };
    });
    afterAll(async () => {
      if (first) {
        await first.prisma.systemSetting.deleteMany({ where: { key } });
        if (orgId) {
          await first.prisma.organization.delete({ where: { id: orgId } });
        }
        if (userId) await first.prisma.user.delete({ where: { id: userId } });
        await first.prisma.$disconnect();
      }
      await second?.prisma.$disconnect();
    });
    it('serializes duplicate approvals with one atomic audit, preserving history', async () => {
      const wrong = await first.extendExplicitRunBudget({ ...input, expectedLedgerSha256: '0'.repeat(64) });
      expect(wrong.ok).toBe(false);
      const results = await Promise.all([
        first.extendExplicitRunBudget(input),
        second.extendExplicitRunBudget({ ...input, approvedAt: new Date(Date.now() + 1000).toISOString() }),
      ]);
      expect(results.every((x) => x.ok)).toBe(true);
      expect(results.filter((x) => x.ok && !x.idempotent)).toHaveLength(1);
      expect(
        await first.prisma.auditLog.count({
          where: { organizationId: orgId, resourceId: policy.projectId, action: 'admin.project.explicit_budget.extend' },
        }),
      ).toBe(1);
      expect(await first.getExplicitRunPermit(policy.projectId, baseline.runId)).toEqual(baseline);
      expect(await first.getExplicitRunBudgetSummary(policy.projectId)).toMatchObject({
        reservedMicros: 15260000,
        limitMicros: 30520000,
      });
    });
    it('refuses scope drift and admits only one additional run across connections', async () => {
      await first.prisma.organization.update({ where: { id: orgId }, data: { slug: 'synthetic-moved-org' } });
      expect((await second.reserveExplicitRun({ ...baseline, runId: randomUUID() })).ok).toBe(false);
      await first.prisma.organization.update({ where: { id: orgId }, data: { slug: policy.organizationSlug } });
      const results = await Promise.all([
        first.reserveExplicitRun({ ...baseline, runId: randomUUID() }),
        second.reserveExplicitRun({ ...baseline, runId: randomUUID() }),
      ]);
      expect(results.filter((x) => x.ok)).toHaveLength(1);
      expect(await first.getExplicitRunBudgetSummary(policy.projectId)).toMatchObject({
        reservedMicros: 30520000,
        limitMicros: 30520000,
        remainingMicros: 0,
      });
      expect(await first.getExplicitRunPermit(policy.projectId, baseline.runId)).toEqual(baseline);
      expect(await first.extendExplicitRunBudget(input)).toMatchObject({ ok: true, idempotent: true });
      process.stdout.write(
        'EXPLICIT_EXTENSION_POSTGRES ' +
          JSON.stringify({
            oneGrant: true,
            oneAudit: true,
            oneAdditionalRun: true,
            baselineUnchanged: true,
            scopeDriftRefused: true,
          }) +
          '\n',
      );
    });
  },
);
