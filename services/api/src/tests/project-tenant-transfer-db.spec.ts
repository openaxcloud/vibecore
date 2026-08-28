import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function projectRowGate(prisma: ReturnType<typeof createDatabaseClient>, projectId: string) {
  let release!: () => void;
  let ready!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const acquired = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const done = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
      ready();
      await released;
    },
    { timeout: 30_000 },
  );
  await acquired;
  return { release, done };
}

async function waitForTopologyHolder(prisma: ReturnType<typeof createDatabaseClient>) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [row] = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext('account-purge:topology')) AS acquired
    `;
    if (row?.acquired === false) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the project mutation to hold the topology lock');
}

async function waitForTransferClaimLock(
  prisma: ReturnType<typeof createDatabaseClient>,
  projectId: string,
): Promise<void> {
  const key = `account-purge:object-storage:${projectId}`;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [row] = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext(${key})) AS acquired
    `;
    if (row?.acquired === false) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the project transfer claim lock');
}

async function waitForAdvisoryWaiters(prisma: ReturnType<typeof createDatabaseClient>, minimum: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count
        FROM pg_locks
       WHERE locktype = 'advisory'
         AND NOT granted
         AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
    `;
    if (Number(row?.count ?? 0) >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${minimum} advisory-lock waiters`);
}

async function seedProject(prisma: ReturnType<typeof createDatabaseClient>) {
  const marker = suffix();
  const [owner, guest] = await Promise.all([
    prisma.user.create({ data: { email: `transfer-owner-${marker}@example.test` } }),
    prisma.user.create({ data: { email: `transfer-guest-${marker}@example.test` } }),
  ]);
  const [organizationA, organizationB] = await Promise.all([
    prisma.organization.create({ data: { name: 'Transfer A', slug: `transfer-a-${marker}` } }),
    prisma.organization.create({ data: { name: 'Transfer B', slug: `transfer-b-${marker}` } }),
  ]);
  const project = await prisma.project.create({
    data: { organizationId: organizationA.id, name: 'Transfer project', slug: `transfer-project-${marker}` },
  });
  return { marker, owner, guest, organizationA, organizationB, project };
}

runDbTests('project tenant-transfer mutation fences', () => {
  it('linearizes transfer before stale collaboration, IDE, and share mutations and removes source capabilities', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const gatePrisma = createDatabaseClient();
    let gate: Awaited<ReturnType<typeof projectRowGate>> | undefined;

    try {
      const seeded = await seedProject(prismaA);
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      await storeA.upsertProjectIdeState({
        projectId: seeded.project.id,
        expectedOrganizationId: seeded.organizationA.id,
        updatedByUserId: seeded.owner.id,
        state: {
          files: [{ path: 'src/index.ts' }],
          collaboration: {
            documents: { 'src/index.ts': { text: 'keep me' } },
            terminalPermissions: { [seeded.guest.id]: { allowed: true } },
          },
        },
      });
      await storeA.upsertCollaborationPresence({
        projectId: seeded.project.id,
        expectedOrganizationId: seeded.organizationA.id,
        userId: seeded.guest.id,
        sessionId: `presence-${seeded.marker}`,
      });

      gate = await projectRowGate(gatePrisma, seeded.project.id);
      const transfer = storeB.transferProject({
        projectId: seeded.project.id,
        expectedOrganizationId: seeded.organizationA.id,
        expectedOwnershipEpoch: 0,
        targetOrganizationId: seeded.organizationB.id,
        idempotencyKey: `tenant-transfer-collaboration-${seeded.marker}`,
        actorUserId: seeded.owner.id,
        assertExternalStorageDetached: async () => undefined,
        validateTargetAdmission: async () => undefined,
      });
      await waitForTransferClaimLock(prismaA, seeded.project.id);

      const staleMutationResults = Promise.allSettled([
        storeA.addProjectCollaborator({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          userId: seeded.guest.id,
          roleKey: 'viewer',
        }),
        storeA.createProjectShareLink({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          tokenHash: `stale-link-${seeded.marker}`,
          roleKey: 'viewer',
          expiresAt: new Date(Date.now() + 60_000),
          createdByUserId: seeded.owner.id,
        }),
        storeA.createCollaborationComment({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          userId: seeded.guest.id,
          filePath: 'src/index.ts',
          body: 'stale comment',
        }),
        storeA.upsertProjectIdeState({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          updatedByUserId: seeded.guest.id,
          state: { collaboration: { terminalPermissions: { [seeded.guest.id]: { allowed: true } } } },
        }),
        storeA.upsertCollaborationPresence({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          userId: seeded.guest.id,
          sessionId: `stale-presence-${seeded.marker}`,
        }),
        storeA.createChatShare({
          tokenHash: `stale-chat-share-${seeded.marker}`,
          conversationId: `conversation-${seeded.marker}`,
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          authorUserId: seeded.guest.id,
          payload: { messages: [] },
        }),
      ]);
      await waitForAdvisoryWaiters(prismaA, 6);
      gate.release();
      await gate.done;
      gate = undefined;

      await expect(transfer).resolves.toMatchObject({ organizationId: seeded.organizationB.id });
      const results = await staleMutationResults;
      expect(results).toHaveLength(6);
      const mutationNames = ['collaborator', 'share-link', 'comment', 'ide-state', 'presence', 'chat-share'] as const;
      for (const [index, result] of results.entries()) {
        expect(result.status, mutationNames[index]).toBe('rejected');
        if (result.status === 'rejected') {
          expect(result.reason).toMatchObject({ code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION' });
        }
      }

      expect(await prismaA.projectCollaborator.count({ where: { projectId: seeded.project.id } })).toBe(0);
      expect(await prismaA.projectShareLink.count({ where: { projectId: seeded.project.id } })).toBe(0);
      expect(await prismaA.collaborationComment.count({ where: { projectId: seeded.project.id } })).toBe(0);
      expect(await prismaA.collaborationPresence.count({ where: { projectId: seeded.project.id } })).toBe(0);
      expect(await prismaA.chatShare.count({ where: { projectId: seeded.project.id } })).toBe(0);
      const ideState = await prismaA.projectIdeState.findUniqueOrThrow({ where: { projectId: seeded.project.id } });
      expect(ideState.state).toMatchObject({
        files: [{ path: 'src/index.ts' }],
        collaboration: { documents: { 'src/index.ts': { text: 'keep me' } }, terminalPermissions: {} },
      });
      expect(ideState.version).toBe(2);
    } finally {
      gate?.release();
      await gate?.done.catch(() => undefined);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect(), gatePrisma.$disconnect()]);
    }
  });

  it('serializes revoke before redeem so a revoked bearer link cannot grant afterward', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const gatePrisma = createDatabaseClient();
    let gate: Awaited<ReturnType<typeof projectRowGate>> | undefined;

    try {
      const seeded = await seedProject(prismaA);
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const expiresAt = new Date(Date.now() + 60_000);
      const link = await storeA.createProjectShareLink({
        projectId: seeded.project.id,
        expectedOrganizationId: seeded.organizationA.id,
        tokenHash: `redeem-${seeded.marker}`,
        roleKey: 'viewer',
        expiresAt,
        createdByUserId: seeded.owner.id,
      });

      gate = await projectRowGate(gatePrisma, seeded.project.id);
      const revoke = storeA.revokeProjectShareLink({
        projectId: seeded.project.id,
        expectedOrganizationId: seeded.organizationA.id,
        id: link.id,
      });
      await waitForTopologyHolder(prismaA);
      const redeem = storeB.redeemProjectShareLink({
        projectId: seeded.project.id,
        expectedOrganizationId: seeded.organizationA.id,
        shareLinkId: link.id,
        tokenHash: link.tokenHash,
        expectedRoleKey: link.roleKey,
        expectedExpiresAt: expiresAt,
        userId: seeded.guest.id,
      });
      await waitForAdvisoryWaiters(prismaA, 1);
      gate.release();
      await gate.done;
      gate = undefined;

      await expect(revoke).resolves.toBe(true);
      await expect(redeem).resolves.toBeUndefined();
      expect(
        await prismaA.projectCollaborator.count({
          where: { projectId: seeded.project.id, userId: seeded.guest.id },
        }),
      ).toBe(0);
    } finally {
      gate?.release();
      await gate?.done.catch(() => undefined);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect(), gatePrisma.$disconnect()]);
    }
  });

  it('blocks transfer for active or retained runtimes and fences stale workspace writes after transfer', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const gatePrisma = createDatabaseClient();
    let gate: Awaited<ReturnType<typeof projectRowGate>> | undefined;

    try {
      const seeded = await seedProject(prismaA);
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const workspace = await storeA.createWorkspace({
        projectId: seeded.project.id,
        expectedOrganizationId: seeded.organizationA.id,
        name: 'Transfer workspace',
        runtimeMode: 'docker',
        initialStatus: 'PENDING',
      });
      await storeA.updateWorkspaceGitRepositoryUrl({
        workspaceId: workspace.id,
        projectId: seeded.project.id,
        expectedOrganizationId: seeded.organizationA.id,
        gitRepositoryUrl: 'https://example.test/original.git',
      });

      await expect(
        storeB.transferProject({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          expectedOwnershipEpoch: 0,
          targetOrganizationId: seeded.organizationB.id,
          idempotencyKey: `tenant-transfer-pending-runtime-${seeded.marker}`,
          actorUserId: seeded.owner.id,
          assertExternalStorageDetached: async () => undefined,
          validateTargetAdmission: async () => undefined,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE' });
      await storeA.updateWorkspaceStatus({
        workspaceId: workspace.id,
        expectedProjectId: seeded.project.id,
        expectedOrganizationId: seeded.organizationA.id,
        status: 'STOPPED',
      });
      await prismaA.workspaceRuntime.create({
        data: {
          id: workspace.id,
          orgId: seeded.organizationA.id,
          projectId: seeded.project.id,
          plan: {},
          status: 'STOPPED',
          pvcName: `pvc-${seeded.marker}`,
          podName: `pod-${seeded.marker}`,
          serviceName: `service-${seeded.marker}`,
          agentTokenSecretName: `agent-${seeded.marker}`,
        },
      });
      await expect(
        storeB.transferProject({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          expectedOwnershipEpoch: 0,
          targetOrganizationId: seeded.organizationB.id,
          idempotencyKey: `tenant-transfer-retained-runtime-${seeded.marker}`,
          actorUserId: seeded.owner.id,
          assertExternalStorageDetached: async () => undefined,
          validateTargetAdmission: async () => undefined,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE' });
      await prismaA.workspaceRuntime.update({ where: { id: workspace.id }, data: { status: 'DELETED' } });
      expect(
        await prismaA.workspace.count({
          where: { projectId: seeded.project.id, status: { in: ['PENDING', 'STARTING', 'RUNNING'] } },
        }),
      ).toBe(0);
      expect(
        await prismaA.workspaceRuntime.count({ where: { projectId: seeded.project.id, status: { not: 'DELETED' } } }),
      ).toBe(0);

      gate = await projectRowGate(gatePrisma, seeded.project.id);
      const transfer = storeB.transferProject({
        projectId: seeded.project.id,
        expectedOrganizationId: seeded.organizationA.id,
        expectedOwnershipEpoch: 0,
        targetOrganizationId: seeded.organizationB.id,
        idempotencyKey: `tenant-transfer-final-runtime-${seeded.marker}`,
        actorUserId: seeded.owner.id,
        assertExternalStorageDetached: async () => undefined,
        validateTargetAdmission: async () => undefined,
      });
      await waitForTransferClaimLock(prismaA, seeded.project.id);
      const staleWorkspaceResults = Promise.allSettled([
        storeA.updateWorkspaceStatus({
          workspaceId: workspace.id,
          expectedProjectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          status: 'RUNNING',
        }),
        storeA.upsertWorkspaceIdeState({
          workspaceId: workspace.id,
          expectedProjectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          state: { openTabs: ['src/index.ts'] },
          updatedByUserId: seeded.guest.id,
        }),
        storeA.updateWorkspaceGitRepositoryUrl({
          workspaceId: workspace.id,
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          gitRepositoryUrl: 'https://example.test/stale.git',
        }),
        storeA.createWorkspace({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organizationA.id,
          name: 'Stale workspace',
          runtimeMode: 'docker',
          initialStatus: 'STOPPED',
        }),
      ]);
      await waitForAdvisoryWaiters(prismaA, 4);
      gate.release();
      await gate.done;
      gate = undefined;

      await expect(transfer).resolves.toMatchObject({ organizationId: seeded.organizationB.id });
      const staleResults = await staleWorkspaceResults;
      expect(staleResults).toHaveLength(4);
      for (const result of staleResults) {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          expect(result.reason).toMatchObject({ code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION' });
        }
      }
      expect(await prismaA.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).toMatchObject({
        status: 'STOPPED',
        gitRepositoryUrl: 'https://example.test/original.git',
      });
      expect(await prismaA.workspace.count({ where: { projectId: seeded.project.id } })).toBe(1);
      expect(await prismaA.workspaceIdeState.findUnique({ where: { workspaceId: workspace.id } })).toBeNull();
    } finally {
      gate?.release();
      await gate?.done.catch(() => undefined);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect(), gatePrisma.$disconnect()]);
    }
  });
});
