import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDatabaseClient, Prisma } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';

import { eraseLocalAccountStorage } from '../account-local-storage-purge.js';
import type { PurgeStorageDeps } from '../account-purge.js';
import { PrismaApiStore } from '../prisma-store.js';

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
const lease = { ttlMs: 120, renewIntervalMs: 60_000, reclaimGraceMs: 0 };

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

async function seedDueUser(prisma: ReturnType<typeof createDatabaseClient>) {
  const id = suffix();
  const requestedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  return prisma.user.create({
    data: {
      email: `account-purge-${id}@example.test`,
      preferences: { accountDeletion: { requestedAt } } as Prisma.InputJsonValue,
    },
  });
}

async function cleanup(
  prisma: ReturnType<typeof createDatabaseClient>,
  userIds: string[],
  organizationIds: string[] = [],
) {
  await prisma.purgeReceipt.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.purgePlan.deleteMany({ where: { userId: { in: userIds } } });
  if (organizationIds.length) await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function createSessionFencePlan(tx: Prisma.TransactionClient, userId: string) {
  const requestedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1_000);
  return tx.purgePlan.create({
    data: {
      userId,
      ownerToken: `session-fence-${suffix()}`,
      status: 'ACTIVE',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      requestedAt,
      purgeDueAt: new Date(requestedAt.getTime() + 14 * 24 * 60 * 60 * 1_000),
      topologyFingerprint: '{}',
      inventory: {
        bucketProjectIds: [],
        workspaceProjectIds: [],
        localSnapshotObjects: [],
        staticDeploymentIds: [],
      },
    },
  });
}

runDbTests('account purge — PostgreSQL multi-client fencing', () => {
  it('permanently fences only the purged subject workspace in a retained project', async () => {
    const prisma = createDatabaseClient();
    const userIds: string[] = [];

    try {
      const subject = await seedDueUser(prisma);
      userIds.push(subject.id);
      const projectId = `retained-project-${suffix()}`;
      const requestedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1_000);
      await prisma.purgePlan.create({
        data: {
          userId: subject.id,
          ownerToken: `completed-workspace-${suffix()}`,
          status: 'COMPLETED',
          leaseExpiresAt: new Date(),
          requestedAt,
          purgeDueAt: new Date(requestedAt.getTime() + 14 * 24 * 60 * 60 * 1_000),
          topologyFingerprint: '{}',
          completedAt: new Date(),
          inventory: {
            bucketProjectIds: [],
            workspaceProjectIds: [projectId],
            localSnapshotObjects: [],
            staticDeploymentIds: [],
          },
        },
      });
      const store = new PrismaApiStore(prisma);
      const digest = createHash('sha256').update(`${projectId}:${subject.id}`).digest('hex').slice(0, 16);

      await expect(store.assertProjectStorageMutable(projectId, `ws-${digest}`)).rejects.toMatchObject({
        code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE',
      });
      await expect(store.assertProjectStorageMutable(projectId, 'ws-other-collaborator')).resolves.toBeUndefined();
      await expect(store.assertProjectStorageMutable(projectId)).resolves.toBeUndefined();
    } finally {
      await cleanup(prisma, userIds).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('linearizes late session INSERT and token lookup behind a newly committed purge plan', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const userIds: string[] = [];

    try {
      const insertUser = await seedDueUser(prismaA);
      const lookupUser = await seedDueUser(prismaA);
      userIds.push(insertUser.id, lookupUser.id);
      const storeA = new PrismaApiStore(prismaA);
      const existingToken = `lookup-before-plan-${suffix()}`;
      await storeA.createSession({
        userId: lookupUser.id,
        token: existingToken,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const exerciseFence = async (userId: string, operation: () => Promise<unknown>) => {
        const locked = deferred();
        const commitPlan = deferred();
        const blocker = prismaB.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);
          locked.resolve();
          await commitPlan.promise;
          await createSessionFencePlan(tx, userId);
        });

        await locked.promise;
        const pending = operation();
        await new Promise((resolve) => setTimeout(resolve, 40));
        commitPlan.resolve();
        await blocker;
        return pending;
      };

      const insert = exerciseFence(insertUser.id, () =>
        storeA.createSession({
          userId: insertUser.id,
          token: `login-read-before-plan-${suffix()}`,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );
      await expect(insert).rejects.toMatchObject({ code: 'SESSION_ACCOUNT_PURGE_FENCED' });
      await expect(prismaA.session.count({ where: { userId: insertUser.id } })).resolves.toBe(0);

      const lookup = exerciseFence(lookupUser.id, () => storeA.findSessionByToken(existingToken));
      await expect(lookup).resolves.toBeUndefined();
      await expect(prismaA.session.count({ where: { userId: lookupUser.id } })).resolves.toBe(1);
    } finally {
      await cleanup(prismaA, userIds).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('refuses a token row rebound after candidate discovery to principals that were not locked', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const prismaC = createDatabaseClient();
    const userIds: string[] = [];
    const lockEntered = deferred();
    const lockRelease = deferred();

    try {
      const originalTarget = await seedDueUser(prismaA);
      const reboundTarget = await seedDueUser(prismaA);
      const reboundImpersonator = await seedDueUser(prismaA);
      userIds.push(originalTarget.id, reboundTarget.id, reboundImpersonator.id);
      const store = new PrismaApiStore(prismaA);
      const token = `session-rebind-${suffix()}`;
      const session = await store.createSession({
        userId: originalTarget.id,
        token,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const blocker = prismaB.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${originalTarget.id}`);
        lockEntered.resolve();
        await lockRelease.promise;
      });

      await lockEntered.promise;
      const lookup = store.findSessionByToken(token);
      let lookupWaitingOnOriginalSubject = false;

      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting = await prismaC.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
            FROM pg_stat_activity
           WHERE pid <> pg_backend_pid()
             AND wait_event = 'advisory'
             AND query LIKE '%pg_advisory_xact_lock(hashtext(%'
        `;
        if ((waiting[0]?.count ?? 0n) > 0n) {
          lookupWaitingOnOriginalSubject = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(lookupWaitingOnOriginalSubject).toBe(true);
      await prismaC.session.update({
        where: { id: session.id },
        data: { userId: reboundTarget.id, impersonatedBy: reboundImpersonator.id },
      });
      lockRelease.resolve();
      await blocker;

      await expect(lookup).resolves.toBeUndefined();
    } finally {
      lockRelease.resolve();
      await cleanup(prismaA, userIds).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect(), prismaC.$disconnect()]);
    }
  });

  it('persists an exhaustive local filesystem proof and keeps the project writer fenced', async () => {
    const prisma = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    const releaseManifestIds: string[] = [];
    const base = await mkdtemp(join(tmpdir(), 'vibecore-purge-db-fs-'));
    const projectRoot = join(base, 'projects');
    const staticRoot = join(base, 'static');

    try {
      const user = await seedDueUser(prisma);
      userIds.push(user.id);
      const role = await prisma.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', name: 'Owner' },
        update: {},
      });
      const organization = await prisma.organization.create({
        data: {
          name: 'Purge local storage org',
          slug: `purge-local-${suffix()}`,
          members: { create: { userId: user.id, roleId: role.id } },
          projects: { create: { name: 'Physical project', slug: 'physical-project' } },
        },
        include: { projects: true },
      });
      organizationIds.push(organization.id);
      const project = organization.projects[0];
      const storageKey = `snapshots/${project.id}/checkpoint.zip`;
      await prisma.projectSnapshot.create({
        data: { projectId: project.id, manifest: {}, storageKey, byteLength: 7 },
      });
      const deployment = await prisma.deployment.create({
        data: { projectId: project.id, provider: 'static', status: 'READY' },
      });
      const manifestOnlyDeploymentId = `manifest-only-${suffix()}`;
      const releaseManifest = await prisma.releaseManifest.create({
        data: {
          projectId: project.id,
          deploymentId: manifestOnlyDeploymentId,
          environment: 'preview',
          version: 1,
          provider: 'static',
          artifactKind: 'static-snapshot',
          artifactRef: manifestOnlyDeploymentId,
          artifactDigest: `sha256:${'a'.repeat(64)}`,
        },
      });
      releaseManifestIds.push(releaseManifest.id);

      const files = [
        join(projectRoot, project.id, 'src', 'secret.ts'),
        join(projectRoot, '_objects', 'exports', project.id, 'archive.zip'),
        join(projectRoot, '_objects', 'snapshots', project.id, 'checkpoint.zip'),
        join(staticRoot, deployment.id, 'index.html'),
        join(staticRoot, manifestOnlyDeploymentId, 'index.html'),
      ];
      for (const path of files) {
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, 'subject-data', 'utf8');
      }

      const store = new PrismaApiStore(prisma, undefined, { ...lease, ttlMs: 5_000 });
      const result = await store.purgeUserAccount(
        { userId: user.id },
        {
          eraseStorage: async (inventory, purgeLease) => {
            const local = await eraseLocalAccountStorage(
              {
                ownedProjectIds: inventory.bucketProjectIds,
                workspaceStorage: [],
                snapshotObjects: inventory.localSnapshotObjects,
                staticDeploymentIds: inventory.staticDeploymentIds,
              },
              { lease: purgeLease, projectRoot, staticRoot },
            );
            return { classes: local.classes, verified: local.verified };
          },
        },
      );

      expect(result).toMatchObject({ outcome: 'purged' });
      if (result.outcome !== 'purged') throw new Error('expected purged outcome');
      expect(result.proof.verifiedZeroRemaining).toBe(true);
      const physicalClassNames = [
        'local_project_storage',
        'local_project_archives',
        'local_project_checkpoints',
        'local_workspace_storage',
        'static_deployment_snapshots',
      ];
      expect(
        result.proof.classes
          .map(({ dataClass }) => dataClass)
          .filter((dataClass) => physicalClassNames.includes(dataClass)),
      ).toEqual(physicalClassNames);
      for (const path of files) {
        await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
      }
      await expect(store.assertProjectStorageMutable(project.id)).rejects.toMatchObject({
        code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE',
      });
    } finally {
      if (userIds[0]) {
        await prisma.adminAuditLog
          .deleteMany({
            where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: userIds[0] } },
          })
          .catch(() => undefined);
      }
      if (releaseManifestIds.length) {
        await prisma.releaseManifest.deleteMany({ where: { id: { in: releaseManifestIds } } }).catch(() => undefined);
      }
      await cleanup(prisma, userIds, organizationIds).catch(() => undefined);
      await prisma.$disconnect();
      await rm(base, { recursive: true, force: true });
    }
  });

  it('never reclaims a plan while its row lock encloses an irreversible provider effect', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const userIds: string[] = [];
    const entered = deferred();
    const release = deferred();
    let effectActive = false;
    let reconcileResolvedDuringEffect = false;

    try {
      const user = await seedDueUser(prismaA);
      userIds.push(user.id);
      const storeA = new PrismaApiStore(prismaA, undefined, lease);
      const storeB = new PrismaApiStore(prismaB, undefined, lease);
      const purge = storeA.purgeUserAccount(
        { userId: user.id, correlationId: `corr-${suffix()}` },
        {
          eraseStorage: async (_inventory, purgeLease) => {
            await purgeLease.executeEffect(
              { key: 'gcs-bucket:test', resourceType: 'gcs_bucket', resourceId: 'test' },
              async () => {
                effectActive = true;
                entered.resolve();
                await release.promise;
                effectActive = false;
                return { deleted: true, verifiedAbsent: true };
              },
            );
            return { classes: [], verified: false };
          },
        },
      );

      await entered.promise;
      await new Promise((resolve) => setTimeout(resolve, 200));
      const reconcile = storeB.reconcilePurgeFreezes().then((result) => {
        reconcileResolvedDuringEffect = effectActive;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(reconcileResolvedDuringEffect).toBe(false);

      release.resolve();
      await expect(purge).rejects.toMatchObject({ code: expect.any(String) });
      await reconcile;
      expect(reconcileResolvedDuringEffect).toBe(false);
      expect(await prismaA.purgeEffect.findFirst({ where: { plan: { userId: user.id } } })).toMatchObject({
        status: 'SUCCEEDED',
        receipt: { deleted: true, verifiedAbsent: true },
      });
    } finally {
      release.resolve();
      await cleanup(prismaA, userIds).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('reuses a verified effect receipt after failure and writes receipt, plan completion and audit atomically', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const userIds: string[] = [];
    let providerCalls = 0;

    try {
      const user = await seedDueUser(prismaA);
      userIds.push(user.id);
      const storeA = new PrismaApiStore(prismaA, undefined, { ...lease, ttlMs: 5_000 });
      const storeB = new PrismaApiStore(prismaB, undefined, { ...lease, ttlMs: 5_000 });
      const storage = (verified: boolean): PurgeStorageDeps => ({
        eraseStorage: async (_inventory, purgeLease) => {
          await purgeLease.executeEffect(
            { key: 'gcs-bucket:resume', resourceType: 'gcs_bucket', resourceId: 'resume' },
            async () => {
              providerCalls += 1;
              return { deleted: true, verifiedAbsent: true };
            },
          );
          return { classes: [], verified };
        },
      });

      await expect(storeA.purgeUserAccount({ userId: user.id }, storage(false))).rejects.toMatchObject({
        code: 'ACCOUNT_PURGE_PHYSICAL_INCOMPLETE',
      });
      const completed = await storeB.purgeUserAccount(
        { userId: user.id, correlationId: `corr-${suffix()}` },
        storage(true),
      );

      expect(completed.outcome).toBe('purged');
      expect(providerCalls).toBe(1);
      const [receipt, plan, audits, effect] = await Promise.all([
        prismaA.purgeReceipt.findUnique({ where: { userId: user.id } }),
        prismaA.purgePlan.findUnique({ where: { userId: user.id } }),
        prismaA.adminAuditLog.count({
          where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: user.id } },
        }),
        prismaA.purgeEffect.findFirst({ where: { plan: { userId: user.id }, effectKey: 'gcs-bucket:resume' } }),
      ]);
      expect(receipt).toBeTruthy();
      expect(plan).toMatchObject({ status: 'COMPLETED', completedAt: expect.any(Date) });
      expect(audits).toBe(1);
      expect(effect).toMatchObject({ status: 'SUCCEEDED', attempt: 1 });
    } finally {
      await cleanup(prismaA, userIds).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('cancels external billing exactly once across a failed attempt and its durable retry', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    let billingPlanId: string | undefined;
    const cancelExternalBilling = vi.fn(async () => ({ canceled: true, providerStatus: 'canceled' }));

    try {
      const user = await seedDueUser(prismaA);
      userIds.push(user.id);
      const role = await prismaA.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', name: 'Owner' },
        update: {},
      });
      const organization = await prismaA.organization.create({
        data: {
          name: 'Purge billing org',
          slug: `purge-billing-${suffix()}`,
          members: { create: { userId: user.id, roleId: role.id } },
        },
      });
      organizationIds.push(organization.id);
      const plan = await prismaA.plan.create({
        data: {
          key: `purge-test-${suffix()}`,
          name: 'Purge test plan',
          monthlyCents: 1,
          limits: {},
        },
      });
      billingPlanId = plan.id;
      const subscription = await prismaA.subscription.create({
        data: {
          organizationId: organization.id,
          planId: plan.id,
          externalId: `sub_${suffix()}`,
          status: 'ACTIVE',
        },
      });
      const storeA = new PrismaApiStore(prismaA, undefined, { ...lease, ttlMs: 5_000 });
      const storeB = new PrismaApiStore(prismaB, undefined, { ...lease, ttlMs: 5_000 });
      const deps = (verified: boolean): PurgeStorageDeps => ({
        cancelExternalBilling,
        eraseStorage: async () => ({ classes: [], verified }),
      });

      await expect(storeA.purgeUserAccount({ userId: user.id }, deps(false))).rejects.toMatchObject({
        code: 'ACCOUNT_PURGE_PHYSICAL_INCOMPLETE',
      });
      await expect(storeB.purgeUserAccount({ userId: user.id }, deps(true))).resolves.toMatchObject({
        outcome: 'purged',
      });

      expect(cancelExternalBilling).toHaveBeenCalledOnce();
      expect(cancelExternalBilling).toHaveBeenCalledWith(
        subscription.externalId,
        expect.stringMatching(/^account-purge-.+-/),
      );
      await expect(prismaA.subscription.findUnique({ where: { id: subscription.id } })).resolves.toMatchObject({
        status: 'CANCELED',
        cancelAtPeriodEnd: true,
      });
      await expect(
        prismaA.purgeEffect.findFirst({
          where: {
            plan: { userId: user.id },
            effectKey: `billing-subscription:${subscription.id}`,
          },
        }),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        attempt: 1,
        receipt: { canceled: true, providerStatus: 'canceled' },
      });
    } finally {
      await cleanup(prismaA, userIds, organizationIds).catch(() => undefined);
      if (billingPlanId) await prismaA.plan.delete({ where: { id: billingPlanId } }).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('removes public snapshots and scrubs retained free-form and audit PII', async () => {
    const prisma = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    const auditIds: string[] = [];
    const adminAuditIds: string[] = [];
    let ticketId: string | undefined;
    let emailEventId: string | undefined;

    try {
      const user = await seedDueUser(prisma);
      const other = await prisma.user.create({ data: { email: `pii-other-${suffix()}@example.test` } });
      userIds.push(user.id, other.id);
      const role = await prisma.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', name: 'Owner' },
        update: {},
      });
      const organization = await prisma.organization.create({
        data: {
          name: 'Shared PII purge org',
          slug: `purge-pii-${suffix()}`,
          members: {
            create: [
              { userId: user.id, roleId: role.id },
              { userId: other.id, roleId: role.id },
            ],
          },
          projects: { create: { name: 'Retained shared project', slug: 'retained-shared-project' } },
        },
        include: { projects: true },
      });
      organizationIds.push(organization.id);
      const project = organization.projects[0];
      const impersonationSession = await prisma.session.create({
        data: {
          userId: other.id,
          tokenHash: `impersonation-token-${suffix()}`,
          expiresAt: new Date(Date.now() + 60_000),
          impersonatedBy: user.id,
        },
      });
      const snapshot = await prisma.projectSnapshot.create({
        data: {
          projectId: project.id,
          label: 'Customer SSN 123-45-6789',
          manifest: {},
          createdByUserId: user.id,
        },
      });
      const ticket = await prisma.supportTicket.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          subject: 'Refund card 4242-4242',
          metadata: { email: user.email },
          messages: {
            create: [
              { authorType: 'USER', authorUserId: user.id, body: 'My SSN is 123-45-6789' },
              { authorType: 'ADMIN', authorUserId: other.id, body: `Reply to ${user.email}` },
            ],
          },
        },
      });
      ticketId = ticket.id;
      const share = await prisma.chatShare.create({
        data: {
          tokenHash: `token-${suffix()}`,
          conversationId: `conversation-${suffix()}`,
          projectId: project.id,
          authorUserId: user.id,
          title: 'Public PII snapshot',
          payloadJson: { messages: [{ content: user.email }] },
        },
      });
      const emailEvent = await prisma.emailDeliveryEvent.create({
        data: {
          provider: 'test',
          providerEventId: `provider-${suffix()}`,
          type: 'delivered',
          email: user.email,
          subject: 'PII subject',
          fromAddress: 'pii@example.test',
          payload: { name: 'Personal Name', email: user.email },
        },
      });
      emailEventId = emailEvent.id;
      const audit = await prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'pii.audit',
          resourceType: 'user',
          metadata: { email: user.email },
          ipAddress: '203.0.113.10',
        },
      });
      auditIds.push(audit.id);
      const actorAudit = await prisma.adminAuditLog.create({
        data: {
          actorUserId: user.id,
          action: 'pii.actor',
          metadata: { email: user.email },
          ipAddress: '203.0.113.11',
        },
      });
      const targetAudit = await prisma.adminAuditLog.create({
        data: {
          actorUserId: other.id,
          action: 'admin.user.suspend',
          metadata: { userId: user.id, reason: `PII ${user.email}` },
          ipAddress: '203.0.113.12',
        },
      });
      adminAuditIds.push(actorAudit.id, targetAudit.id);

      const store = new PrismaApiStore(prisma, undefined, { ...lease, ttlMs: 5_000 });
      await expect(
        store.purgeUserAccount({ userId: user.id }, { eraseStorage: async () => ({ classes: [], verified: true }) }),
      ).resolves.toMatchObject({ outcome: 'purged' });

      await expect(prisma.chatShare.findUnique({ where: { id: share.id } })).resolves.toBeNull();
      await expect(prisma.session.findUnique({ where: { id: impersonationSession.id } })).resolves.toBeNull();
      await expect(prisma.projectSnapshot.findUnique({ where: { id: snapshot.id } })).resolves.toMatchObject({
        label: null,
        createdByUserId: null,
      });
      await expect(prisma.supportTicket.findUnique({ where: { id: ticket.id } })).resolves.toMatchObject({
        userId: null,
        subject: '[redacted]',
        metadata: expect.objectContaining({ redacted: true }),
      });
      const ticketMessages = await prisma.ticketMessage.findMany({ where: { ticketId: ticket.id } });
      expect(ticketMessages.map(({ body }) => body)).toEqual(['[redacted]', '[redacted]']);
      expect(ticketMessages.find(({ authorType }) => authorType === 'USER')?.authorUserId).toBeNull();
      await expect(prisma.emailDeliveryEvent.findUnique({ where: { id: emailEvent.id } })).resolves.toMatchObject({
        email: `purged-${user.id}@erased.invalid`,
        subject: null,
        fromAddress: null,
        payload: expect.objectContaining({ redacted: true }),
      });
      await expect(prisma.auditLog.findUnique({ where: { id: audit.id } })).resolves.toMatchObject({
        ipAddress: null,
        metadata: expect.objectContaining({ redacted: true }),
      });
      await expect(prisma.adminAuditLog.findUnique({ where: { id: actorAudit.id } })).resolves.toMatchObject({
        ipAddress: null,
        metadata: expect.objectContaining({ redacted: true }),
      });
      await expect(prisma.adminAuditLog.findUnique({ where: { id: targetAudit.id } })).resolves.toMatchObject({
        metadata: expect.objectContaining({ redacted: true, target: 'purged-user' }),
      });
    } finally {
      if (ticketId) await prisma.ticketMessage.deleteMany({ where: { ticketId } }).catch(() => undefined);
      if (ticketId) await prisma.supportTicket.delete({ where: { id: ticketId } }).catch(() => undefined);
      if (emailEventId) await prisma.emailDeliveryEvent.delete({ where: { id: emailEventId } }).catch(() => undefined);
      if (auditIds.length) await prisma.auditLog.deleteMany({ where: { id: { in: auditIds } } }).catch(() => undefined);
      if (adminAuditIds.length) {
        await prisma.adminAuditLog.deleteMany({ where: { id: { in: adminAuditIds } } }).catch(() => undefined);
      }
      if (userIds[0]) {
        await prisma.adminAuditLog
          .deleteMany({
            where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: userIds[0] } },
          })
          .catch(() => undefined);
      }
      await cleanup(prisma, userIds, organizationIds).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('blocks cancellation, topology mutation and GCS mutation while a live plan owns the freeze', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    const entered = deferred();
    const release = deferred();

    try {
      const user = await seedDueUser(prismaA);
      const other = await prismaA.user.create({ data: { email: `other-${suffix()}@example.test` } });
      userIds.push(user.id, other.id);
      const role = await prismaA.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', name: 'Owner' },
        update: {},
      });
      const organization = await prismaA.organization.create({
        data: {
          name: 'Purge fence org',
          slug: `purge-fence-${suffix()}`,
          members: { create: { userId: user.id, roleId: role.id } },
          projects: { create: { name: 'Owned project', slug: 'owned-project' } },
        },
        include: { projects: true },
      });
      const otherOrganization = await prismaA.organization.create({
        data: {
          name: 'Other org',
          slug: `other-${suffix()}`,
          members: { create: { userId: other.id, roleId: role.id } },
          projects: { create: { name: 'Other project', slug: 'other-project' } },
        },
        include: { projects: true },
      });
      organizationIds.push(organization.id, otherOrganization.id);

      const storeA = new PrismaApiStore(prismaA, undefined, { ...lease, ttlMs: 5_000 });
      const storeB = new PrismaApiStore(prismaB, undefined, { ...lease, ttlMs: 5_000 });
      const purge = storeA.purgeUserAccount(
        { userId: user.id },
        {
          eraseStorage: async () => {
            entered.resolve();
            await release.promise;
            return { classes: [], verified: false };
          },
        },
      );

      await entered.promise;
      await expect(storeB.cancelAccountDeletion(user.id)).rejects.toMatchObject({
        code: 'ACCOUNT_PURGE_ALREADY_STARTED',
      });
      await expect(
        storeB.addProjectCollaborator({
          projectId: otherOrganization.projects[0].id,
          userId: user.id,
          roleKey: 'editor',
        }),
      ).rejects.toMatchObject({ code: 'USER_TOPOLOGY_FROZEN_FOR_ACCOUNT_PURGE' });
      const providerMutation = vi.fn(async () => 'mutated');
      await expect(
        storeB.withObjectStorageProjectMutation(organization.projects[0].id, providerMutation),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_PURGE_FROZEN' });
      expect(providerMutation).not.toHaveBeenCalled();

      release.resolve();
      await expect(purge).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_PHYSICAL_INCOMPLETE' });
    } finally {
      release.resolve();
      await cleanup(prismaA, userIds, organizationIds).catch(() => undefined);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
