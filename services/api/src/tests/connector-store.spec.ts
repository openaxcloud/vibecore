import { describe, expect, it, beforeAll } from 'vitest';
import { createDatabaseClient } from '@vibecore/database';
import { hashPassword } from '@vibecore/auth';
import { encryptJson } from '@vibecore/security';
import { PrismaApiStore } from '../prisma-store.js';

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

interface SetupTenant {
  organizationId: string;
  userId: string;
  projectId: string;
}

async function createTenantForStoreTests(prisma: ReturnType<typeof createDatabaseClient>, slug: string): Promise<SetupTenant> {
  const organization = await prisma.organization.create({
    data: { slug, name: `Store ${slug}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `${slug}@store.example.com`,
      name: `User ${slug}`,
      passwordHash: hashPassword('store-test-password'),
      emailVerifiedAt: new Date(),
    },
  });
  const project = await prisma.project.create({
    data: { organizationId: organization.id, name: `Project ${slug}`, slug: `project-${slug}` },
  });

  return { organizationId: organization.id, userId: user.id, projectId: project.id };
}

async function deleteTenantForStoreTests(prisma: ReturnType<typeof createDatabaseClient>, tenant: SetupTenant) {
  await prisma.project.deleteMany({ where: { id: tenant.projectId } });
  await prisma.user.deleteMany({ where: { id: tenant.userId } });
  await prisma.organization.deleteMany({ where: { id: tenant.organizationId } });
}

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

runDbTests('PrismaApiStore connector helpers (real Postgres)', () => {
  let tenant: SetupTenant;

  beforeAll(async () => {
    const prisma = createDatabaseClient();
    try {
      tenant = await createTenantForStoreTests(prisma, `store-${Date.now().toString(36)}`);
    } finally {
      await prisma.$disconnect();
    }

    return async () => {
      const cleanup = createDatabaseClient();
      try {
        await deleteTenantForStoreTests(cleanup, tenant);
      } finally {
        await cleanup.$disconnect();
      }
    };
  });

  it('upsertUserConnection inserts then updates the same (userId, provider, externalAccountId)', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);

    try {
      const accessTokenEncrypted = encryptJson({ value: 'gh-token-v1' });

      const inserted = await store.upsertUserConnection({
        userId: tenant.userId,
        provider: 'github',
        externalAccountId: 'gh-store-1',
        externalAccountLabel: 'octocat',
        accessTokenEncrypted,
        scopes: ['repo'],
        createdByUserId: tenant.userId,
      });

      expect(inserted.id).toBeTruthy();
      expect(inserted.status).toBe('active');

      const accessTokenEncryptedV2 = encryptJson({ value: 'gh-token-v2' });

      const updated = await store.upsertUserConnection({
        userId: tenant.userId,
        provider: 'github',
        externalAccountId: 'gh-store-1',
        externalAccountLabel: 'octocat-renamed',
        accessTokenEncrypted: accessTokenEncryptedV2,
        scopes: ['repo', 'read:org'],
        createdByUserId: tenant.userId,
      });

      expect(updated.id).toBe(inserted.id);
      expect(updated.externalAccountLabel).toBe('octocat-renamed');
      expect(updated.scopes).toEqual(['repo', 'read:org']);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('getUserConnectionById returns undefined for an unknown id', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);

    try {
      const row = await store.getUserConnectionById('not-a-real-id');
      expect(row).toBeUndefined();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('listUserConnectionsByUser filters by provider when given', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);

    try {
      await store.upsertUserConnection({
        userId: tenant.userId,
        provider: 'slack',
        externalAccountId: 'sk-store-1',
        externalAccountLabel: 'workspace',
        accessTokenEncrypted: encryptJson({ value: 'sk-token' }),
        scopes: ['chat:write'],
        createdByUserId: tenant.userId,
      });

      const githubOnly = await store.listUserConnectionsByUser(tenant.userId, { provider: 'github' });
      const slackOnly = await store.listUserConnectionsByUser(tenant.userId, { provider: 'slack' });

      expect(githubOnly.every((row) => row.provider === 'github')).toBe(true);
      expect(slackOnly.every((row) => row.provider === 'slack')).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('markUserConnectionStatus flips the status and revokedAt', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);

    try {
      const connection = await store.upsertUserConnection({
        userId: tenant.userId,
        provider: 'notion',
        externalAccountId: 'nt-store-1',
        externalAccountLabel: 'workspace',
        accessTokenEncrypted: encryptJson({ value: 'nt-token' }),
        scopes: [],
        createdByUserId: tenant.userId,
      });

      const revoked = await store.markUserConnectionStatus({
        id: connection.id,
        status: 'revoked',
        revokedAt: new Date('2030-01-01T00:00:00Z'),
      });

      expect(revoked?.status).toBe('revoked');
      expect(revoked?.revokedAt).toBe('2030-01-01T00:00:00.000Z');
    } finally {
      await prisma.$disconnect();
    }
  });

  it('linkProjectToUserConnection upserts and clears unlinkedAt on relink', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);

    try {
      const connection = await store.upsertUserConnection({
        userId: tenant.userId,
        provider: 'linear',
        externalAccountId: 'lin-store-1',
        externalAccountLabel: 'workspace',
        accessTokenEncrypted: encryptJson({ value: 'lin-token' }),
        scopes: [],
        createdByUserId: tenant.userId,
      });

      const firstLink = await store.linkProjectToUserConnection({
        projectId: tenant.projectId,
        userConnectionId: connection.id,
        linkedByUserId: tenant.userId,
      });

      expect(firstLink.unlinkedAt).toBeUndefined();

      const unlinked = await store.unlinkProjectFromUserConnection({
        projectId: tenant.projectId,
        userConnectionId: connection.id,
      });

      expect(unlinked?.unlinkedAt).toBeTruthy();

      const relinked = await store.linkProjectToUserConnection({
        projectId: tenant.projectId,
        userConnectionId: connection.id,
        linkedByUserId: tenant.userId,
      });

      expect(relinked.id).toBe(firstLink.id);
      expect(relinked.unlinkedAt).toBeUndefined();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('listProjectConnectionLinks defaults to active links and includes unlinked when asked', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);

    try {
      const active = await store.listProjectConnectionLinks(tenant.projectId);
      expect(active.every((row) => row.unlinkedAt === undefined)).toBe(true);

      const all = await store.listProjectConnectionLinks(tenant.projectId, { includeUnlinked: true });
      expect(all.length).toBeGreaterThanOrEqual(active.length);
    } finally {
      await prisma.$disconnect();
    }
  });
});
