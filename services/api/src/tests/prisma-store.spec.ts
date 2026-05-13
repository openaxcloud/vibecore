import { describe, expect, it } from 'vitest';
import { createDatabaseClient } from '@vibecore/database';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { PrismaApiStore } from '../prisma-store.js';
import type { GitProvider } from '../project-storage.js';
import { hashPassword, hashRecoveryCode } from '@vibecore/auth';

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

class TestEmailProvider implements EmailProvider {
  async send() {}
}

class TestGitProvider implements GitProvider {
  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    return { defaultBranch: input.branch ?? 'main', remoteUrl: input.repositoryUrl, files: [] };
  }

  async status() {
    return { branch: 'main', changedFiles: [], ahead: 0, behind: 0 };
  }

  async commit(input: { message: string }) {
    return { sha: `test-${Date.now().toString(36)}`, message: input.message };
  }

  async push(input: { branch: string }) {
    return { pushed: true, branch: input.branch };
  }

  async pull(input: { branch: string }) {
    return { pulled: true, branch: input.branch, changedFiles: [] };
  }

  async listBranches() {
    return ['main'];
  }

  async checkoutBranch(input: { branch: string }) {
    return { branch: input.branch };
  }

  async stashPush() {
    return { stashed: true, output: 'Saved working directory' };
  }

  async stashList() {
    return [];
  }

  async stashApply() {
    return { applied: true, output: 'Applied stash' };
  }

  async cherryPick() {
    return { picked: true, output: 'Cherry-picked commit' };
  }

  async resolveConflict(input: { filePath: string; strategy: 'ours' | 'theirs' }) {
    return { resolved: true, filePath: input.filePath, strategy: input.strategy };
  }

  async logGraph() {
    return [];
  }

  async diff() {
    return '';
  }

  async blame() {
    return [];
  }

  async createPullRequest() {
    return { url: 'https://github.example/pull/1', number: 1 };
  }
}

const runPrismaTests = (await canReachDatabase()) ? describe : describe.skip;

runPrismaTests('PrismaApiStore integration', () => {
  it('persists auth, organizations, projects and audit logs in PostgreSQL', async () => {
    const prisma = createDatabaseClient();
    const app = await buildApiApp({
      store: new PrismaApiStore(prisma),
      gitProvider: new TestGitProvider(),
      emailProvider: new TestEmailProvider(),
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const alpha = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `alpha-${suffix}@example.com`,
        password: 'password123',
        name: 'Alpha',
        organizationName: `Alpha ${suffix}`,
      },
    });
    const beta = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `beta-${suffix}@example.com`,
        password: 'password123',
        name: 'Beta',
        organizationName: `Beta ${suffix}`,
      },
    });

    expect(alpha.statusCode).toBe(201);
    expect(beta.statusCode).toBe(201);

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${alpha.json().organization.id}/projects`,
      headers: { authorization: `Bearer ${alpha.json().token}` },
      payload: { name: 'Persistent Prisma Project' },
    });
    expect(project.statusCode).toBe(201);

    const blocked = await app.inject({
      method: 'GET',
      url: `/projects/${project.json().project.id}`,
      headers: { authorization: `Bearer ${beta.json().token}` },
    });
    expect(blocked.statusCode).toBe(404);

    const audit = await app.inject({
      method: 'GET',
      url: `/orgs/${alpha.json().organization.id}/audit-logs`,
      headers: { authorization: `Bearer ${alpha.json().token}` },
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().auditLogs.some((event: { action: string }) => event.action === 'project.create')).toBe(true);

    await app.close();
    await prisma.$disconnect();
  }, 20_000);

  it('persists critical store records across independent PrismaApiStore instances', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const user = await storeA.createUser({
        email: `persistent-${suffix}@example.com`,
        passwordHash: await hashPassword('password123'),
      });
      const organization = await storeA.createOrganization({
        name: `Persistent Org ${suffix}`,
        slug: `persistent-org-${suffix}`,
        ownerUserId: user.id,
      });
      const project = await storeA.createProject({
        organizationId: organization.id,
        name: 'Persistent Project',
        slug: `persistent-project-${suffix}`,
      });
      const sessionToken = `session-${suffix}`;
      await storeA.createSession({ userId: user.id, token: sessionToken, expiresAt: new Date(Date.now() + 60_000) });
      await storeA.upsertProjectEnvVar({ projectId: project.id, key: 'PUBLIC_URL', value: 'https://example.com' });
      await storeA.upsertProjectSecret({ projectId: project.id, key: 'API_KEY', valueEncrypted: 'ciphertext' });
      await storeA.createSnapshot({
        projectId: project.id,
        kind: 'manual',
        manifest: { files: ['README.md'] },
        storageKey: `snapshots/${suffix}.zip`,
        byteLength: 42,
        createdByUserId: user.id,
      });
      await storeA.createOrganizationInvite({
        organizationId: organization.id,
        email: `invite-${suffix}@example.com`,
        roleKey: 'member',
        token: `invite-token-${suffix}`,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await storeA.setRecoveryCodes(user.id, [hashRecoveryCode('11111111')]);
      await storeA.recordAudit({
        organizationId: organization.id,
        actorUserId: user.id,
        action: 'integration.persist',
        resourceType: 'project',
        resourceId: project.id,
      });

      expect(await storeB.findUserByEmail(`persistent-${suffix}@example.com`)).toMatchObject({ id: user.id });
      expect(await storeB.findSessionByToken(sessionToken)).toMatchObject({ userId: user.id });
      expect(await storeB.getMembership(user.id, organization.id)).toMatchObject({ roleKey: 'owner' });
      expect(await storeB.getProject(project.id)).toMatchObject({ id: project.id, organizationId: organization.id });
      expect(await storeB.listProjectEnvVars(project.id)).toHaveLength(1);
      expect(await storeB.getProjectSecret(project.id, 'API_KEY')).toMatchObject({ valueEncrypted: 'ciphertext' });
      expect(await storeB.listSnapshots(project.id)).toHaveLength(1);
      expect(await storeB.consumeOrganizationInvite(`invite-token-${suffix}`, user.id)).toBeTruthy();
      expect(await storeB.consumeOrganizationInvite(`invite-token-${suffix}`, user.id)).toBeUndefined();
      expect(await storeB.consumeRecoveryCode(user.id, hashRecoveryCode('11111111'))).toBe(true);
      expect(await storeB.consumeRecoveryCode(user.id, hashRecoveryCode('11111111'))).toBe(false);
      expect(
        (await storeB.listAuditLogs(organization.id)).some((event) => event.action === 'integration.persist'),
      ).toBe(true);
    } finally {
      await prismaA.$disconnect();
      await prismaB.$disconnect();
    }
  }, 20_000);

  it('creates unique slugs for repeated project names in one organization', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const user = await store.createUser({
        email: `project-slug-${suffix}@example.com`,
        passwordHash: await hashPassword('password123'),
      });
      const organization = await store.createOrganization({
        name: `Project Slug Org ${suffix}`,
        slug: `project-slug-org-${suffix}`,
        ownerUserId: user.id,
      });

      const first = await store.createProject({
        organizationId: organization.id,
        name: 'Customer Portal',
        slug: 'customer-portal',
      });
      const second = await store.createProject({
        organizationId: organization.id,
        name: 'Customer Portal',
        slug: 'customer-portal',
      });
      const third = await store.createProject({ organizationId: organization.id, name: '!!!', slug: '!!!' });

      expect(first.slug).toBe('customer-portal');
      expect(second.slug).toBe('customer-portal-2');
      expect(third.slug).toBe('project');
    } finally {
      await prisma.$disconnect();
    }
  }, 20_000);
});
