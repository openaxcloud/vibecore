import { createDatabaseClient, Prisma } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';

import { PrismaWorkspaceStore } from './prisma-store.js';

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) return false;
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

runDbTests('workspace account-purge effect fencing — PostgreSQL multi-client', () => {
  it('keeps reclaim blocked until the K8s effect and its verified receipt commit', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const workspaceId = `ws-purge-${suffix()}`;
    const planId = `plan-purge-${suffix()}`;
    const ownerToken = `owner-${suffix()}-123456789`;
    const entered = deferred();
    const release = deferred();
    let effectActive = false;
    let reconciledDuringEffect = false;

    try {
      const now = (await prismaA.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`)[0].now;
      await prismaA.purgePlan.create({
        data: {
          id: planId,
          userId: `user-${suffix()}`,
          ownerToken,
          status: 'ACTIVE',
          leaseExpiresAt: new Date(now.getTime() + 120),
          requestedAt: new Date(now.getTime() - 16 * 24 * 60 * 60 * 1000),
          purgeDueAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          topologyFingerprint: '{}',
          inventory: {} as Prisma.InputJsonValue,
        },
      });
      await prismaA.workspaceRuntime.create({
        data: {
          id: workspaceId,
          orgId: 'org-test',
          projectId: 'project-test',
          plan: 'free',
          status: 'RUNNING',
          pvcName: `pvc-${workspaceId}`,
          podName: `workspace-${workspaceId}`,
          serviceName: `workspace-${workspaceId}`,
          agentTokenSecretName: `agent-token-${workspaceId}`,
        },
      });
      const storeA = new PrismaWorkspaceStore(prismaA);
      const storeB = new PrismaWorkspaceStore(prismaB);
      await storeA.acquirePurgeFence(workspaceId, { planId, ownerToken });

      const effect = storeA.executePurgeEffect(
        workspaceId,
        { planId, ownerToken },
        { key: `purge:pvc:${workspaceId}`, resourceType: 'k8s_pvc', resourceId: `pvc-${workspaceId}` },
        async () => {
          effectActive = true;
          entered.resolve();
          await release.promise;
          effectActive = false;
          return { deleted: true, verifiedAbsent: true };
        },
      );

      await entered.promise;
      await prismaB.$queryRawUnsafe('SELECT pg_sleep(0.2)');
      const reconcile = storeB.reconcilePurgeFences().then((result) => {
        reconciledDuringEffect = effectActive;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(reconciledDuringEffect).toBe(false);

      release.resolve();
      await expect(effect).resolves.toMatchObject({ executed: true, receipt: { verifiedAbsent: true } });
      await expect(reconcile).resolves.toMatchObject({ reconciled: 1, workspaceIds: [workspaceId] });
      expect(reconciledDuringEffect).toBe(false);
      expect(
        await prismaA.purgeEffect.findUnique({
          where: { planId_effectKey: { planId, effectKey: `purge:pvc:${workspaceId}` } },
        }),
      ).toMatchObject({
        status: 'SUCCEEDED',
        receipt: { deleted: true, verifiedAbsent: true },
      });
      expect(await storeA.get(workspaceId)).toMatchObject({ purgeFrozen: false });
    } finally {
      release.resolve();
      await prismaA.workspaceRuntime.deleteMany({ where: { id: workspaceId } }).catch(() => undefined);
      await prismaA.purgePlan.deleteMany({ where: { id: planId } }).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('rejects a stale owner before invoking the K8s provider callback', async () => {
    const prisma = createDatabaseClient();
    const workspaceId = `ws-stale-${suffix()}`;
    const planId = `plan-stale-${suffix()}`;
    const ownerToken = `owner-${suffix()}-123456789`;
    try {
      const now = (await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`)[0].now;
      await prisma.purgePlan.create({
        data: {
          id: planId,
          userId: `user-${suffix()}`,
          ownerToken,
          status: 'ACTIVE',
          leaseExpiresAt: new Date(now.getTime() + 60_000),
          requestedAt: now,
          purgeDueAt: now,
          topologyFingerprint: '{}',
          inventory: {} as Prisma.InputJsonValue,
        },
      });
      await prisma.workspaceRuntime.create({
        data: {
          id: workspaceId,
          orgId: 'org-test',
          projectId: 'project-test',
          plan: 'free',
          status: 'STOPPED',
          pvcName: `pvc-${workspaceId}`,
          podName: `workspace-${workspaceId}`,
          serviceName: `workspace-${workspaceId}`,
          agentTokenSecretName: `agent-token-${workspaceId}`,
          purgeFrozen: true,
          purgePlanId: planId,
          purgeFenceToken: ownerToken,
          purgeFrozenAt: now,
        },
      });
      const provider = vi.fn(async () => ({ deleted: true, verifiedAbsent: true }));
      await expect(
        new PrismaWorkspaceStore(prisma).executePurgeEffect(
          workspaceId,
          { planId, ownerToken: `${ownerToken}-stale` },
          { key: 'purge:pvc:stale', resourceType: 'k8s_pvc', resourceId: `pvc-${workspaceId}` },
          provider,
        ),
      ).rejects.toMatchObject({ code: 'WORKSPACE_PURGE_LEASE_INVALID' });
      expect(provider).not.toHaveBeenCalled();
    } finally {
      await prisma.workspaceRuntime.deleteMany({ where: { id: workspaceId } }).catch(() => undefined);
      await prisma.purgePlan.deleteMany({ where: { id: planId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });
});
