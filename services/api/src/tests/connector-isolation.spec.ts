import { describe, expect, it, beforeAll } from 'vitest';
import { createDatabaseClient } from '@vibecore/database';
import { hashPassword } from '@vibecore/auth';

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

interface Tenant {
  organizationId: string;
  userId: string;
  projectId: string;
}

async function createTenant(prisma: ReturnType<typeof createDatabaseClient>, slug: string): Promise<Tenant> {
  const organization = await prisma.organization.create({
    data: { slug, name: `Org ${slug}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `${slug}@iso.example.com`,
      name: `User ${slug}`,
      passwordHash: hashPassword('connector-isolation-test-password'),
      emailVerifiedAt: new Date(),
    },
  });
  const project = await prisma.project.create({
    data: {
      organizationId: organization.id,
      name: `Project ${slug}`,
      slug: `project-${slug}`,
    },
  });

  return { organizationId: organization.id, userId: user.id, projectId: project.id };
}

async function deleteTenant(prisma: ReturnType<typeof createDatabaseClient>, tenant: Tenant) {
  // Cascade is enabled on the new connector tables, but explicit deletes
  // keep the test independent from FK semantics.
  await prisma.userConnection.deleteMany({ where: { userId: tenant.userId } });
  await prisma.organizationOAuthAppOverride.deleteMany({ where: { organizationId: tenant.organizationId } });
  await prisma.organizationConnectorPolicy.deleteMany({ where: { organizationId: tenant.organizationId } });
  await prisma.integrationFeatureRequest.deleteMany({ where: { userId: tenant.userId } });
  await prisma.project.deleteMany({ where: { id: tenant.projectId } });
  await prisma.user.deleteMany({ where: { id: tenant.userId } });
  await prisma.organization.deleteMany({ where: { id: tenant.organizationId } });
}

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

runDbTests('Connector isolation guards (real Postgres)', () => {
  let alpha: Tenant;
  let beta: Tenant;

  beforeAll(async () => {
    const prisma = createDatabaseClient();
    try {
      alpha = await createTenant(prisma, `isoalpha-${Date.now().toString(36)}`);
      beta = await createTenant(prisma, `isobeta-${Date.now().toString(36)}`);
    } finally {
      await prisma.$disconnect();
    }

    return async () => {
      const prismaCleanup = createDatabaseClient();
      try {
        await deleteTenant(prismaCleanup, alpha);
        await deleteTenant(prismaCleanup, beta);
      } finally {
        await prismaCleanup.$disconnect();
      }
    };
  }, 30_000);

  it('a UserConnection is only visible when queried by its userId', async () => {
    const prisma = createDatabaseClient();

    try {
      const connection = await prisma.userConnection.create({
        data: {
          userId: alpha.userId,
          provider: 'github',
          externalAccountId: 'gh-iso-1',
          externalAccountLabel: 'alpha-account',
          createdByUserId: alpha.userId,
        },
      });

      const alphaList = await prisma.userConnection.findMany({ where: { userId: alpha.userId } });
      const betaList = await prisma.userConnection.findMany({ where: { userId: beta.userId } });

      expect(alphaList.map((row) => row.id)).toContain(connection.id);
      expect(betaList).toHaveLength(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('a ProjectConnectionLink is only visible when queried by its projectId', async () => {
    const prisma = createDatabaseClient();

    try {
      const connection = await prisma.userConnection.create({
        data: {
          userId: alpha.userId,
          provider: 'slack',
          externalAccountId: 'sk-iso-1',
          externalAccountLabel: 'alpha-slack',
          createdByUserId: alpha.userId,
        },
      });

      await prisma.projectConnectionLink.create({
        data: {
          projectId: alpha.projectId,
          userConnectionId: connection.id,
          linkedByUserId: alpha.userId,
        },
      });

      const alphaLinks = await prisma.projectConnectionLink.findMany({ where: { projectId: alpha.projectId } });
      const betaLinks = await prisma.projectConnectionLink.findMany({ where: { projectId: beta.projectId } });

      expect(alphaLinks.map((row) => row.userConnectionId)).toContain(connection.id);
      expect(betaLinks).toHaveLength(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('the unique constraint blocks duplicate (userId, provider, externalAccountId) rows', async () => {
    const prisma = createDatabaseClient();

    try {
      await prisma.userConnection.create({
        data: {
          userId: alpha.userId,
          provider: 'notion',
          externalAccountId: 'nt-iso-1',
          externalAccountLabel: 'alpha-notion',
          createdByUserId: alpha.userId,
        },
      });

      await expect(
        prisma.userConnection.create({
          data: {
            userId: alpha.userId,
            provider: 'notion',
            externalAccountId: 'nt-iso-1',
            externalAccountLabel: 'alpha-notion-duplicate',
            createdByUserId: alpha.userId,
          },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('the unique constraint allows the same provider + externalAccountId across different users', async () => {
    const prisma = createDatabaseClient();

    try {
      await prisma.userConnection.create({
        data: {
          userId: alpha.userId,
          provider: 'linear',
          externalAccountId: 'lin-iso-shared',
          externalAccountLabel: 'alpha-linear',
          createdByUserId: alpha.userId,
        },
      });

      const betaConnection = await prisma.userConnection.create({
        data: {
          userId: beta.userId,
          provider: 'linear',
          externalAccountId: 'lin-iso-shared',
          externalAccountLabel: 'beta-linear',
          createdByUserId: beta.userId,
        },
      });

      expect(betaConnection.id).toBeTruthy();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('deleting a user cascades to their UserConnection rows', async () => {
    const prisma = createDatabaseClient();

    try {
      const transient = await createTenant(prisma, `isotransient-${Date.now().toString(36)}`);

      const connection = await prisma.userConnection.create({
        data: {
          userId: transient.userId,
          provider: 'figma',
          externalAccountId: 'fg-iso-trans',
          externalAccountLabel: 'transient-figma',
          createdByUserId: transient.userId,
        },
      });

      // Project must be deleted before the user (project FK is restrictive).
      await prisma.project.delete({ where: { id: transient.projectId } });
      await prisma.user.delete({ where: { id: transient.userId } });

      const after = await prisma.userConnection.findUnique({ where: { id: connection.id } });
      expect(after).toBeNull();

      await prisma.organization.delete({ where: { id: transient.organizationId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('deleting a project cascades to its ProjectConnectionLink rows', async () => {
    const prisma = createDatabaseClient();

    try {
      const transient = await createTenant(prisma, `isolinkclean-${Date.now().toString(36)}`);

      const connection = await prisma.userConnection.create({
        data: {
          userId: transient.userId,
          provider: 'jira',
          externalAccountId: 'jr-iso-trans',
          externalAccountLabel: 'transient-jira',
          createdByUserId: transient.userId,
        },
      });
      const link = await prisma.projectConnectionLink.create({
        data: {
          projectId: transient.projectId,
          userConnectionId: connection.id,
          linkedByUserId: transient.userId,
        },
      });

      await prisma.project.delete({ where: { id: transient.projectId } });

      const after = await prisma.projectConnectionLink.findUnique({ where: { id: link.id } });
      expect(after).toBeNull();

      // The UserConnection itself survives the project deletion.
      const stillThere = await prisma.userConnection.findUnique({ where: { id: connection.id } });
      expect(stillThere).not.toBeNull();

      await prisma.userConnection.delete({ where: { id: connection.id } });
      await prisma.user.delete({ where: { id: transient.userId } });
      await prisma.organization.delete({ where: { id: transient.organizationId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('an OrganizationOAuthAppOverride is only visible to its own organization', async () => {
    const prisma = createDatabaseClient();

    try {
      const override = await prisma.organizationOAuthAppOverride.create({
        data: {
          organizationId: alpha.organizationId,
          provider: 'github',
          clientId: 'alpha-client-id',
          clientSecretEncrypted: 'v1.fake.but.never.read.by.tests',
          scopes: ['repo'],
          configuredByUserId: alpha.userId,
        },
      });

      const alphaOverrides = await prisma.organizationOAuthAppOverride.findMany({
        where: { organizationId: alpha.organizationId },
      });
      const betaOverrides = await prisma.organizationOAuthAppOverride.findMany({
        where: { organizationId: beta.organizationId },
      });

      expect(alphaOverrides.map((row) => row.id)).toContain(override.id);
      expect(betaOverrides).toHaveLength(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('an OrganizationConnectorPolicy is only visible to its own organization', async () => {
    const prisma = createDatabaseClient();

    try {
      const policy = await prisma.organizationConnectorPolicy.create({
        data: {
          organizationId: alpha.organizationId,
          provider: 'slack',
          enabled: true,
          allowedRoleKeys: ['owner', 'admin'],
        },
      });

      const alphaPolicies = await prisma.organizationConnectorPolicy.findMany({
        where: { organizationId: alpha.organizationId },
      });
      const betaPolicies = await prisma.organizationConnectorPolicy.findMany({
        where: { organizationId: beta.organizationId },
      });

      expect(alphaPolicies.map((row) => row.id)).toContain(policy.id);
      expect(betaPolicies).toHaveLength(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('an IntegrationFeatureRequest is only visible to its submitting user', async () => {
    const prisma = createDatabaseClient();

    try {
      const request = await prisma.integrationFeatureRequest.create({
        data: {
          userId: alpha.userId,
          organizationId: alpha.organizationId,
          integrationName: 'Pipedrive',
          useCaseDescription: 'CRM sync for the agent.',
        },
      });

      const alphaRequests = await prisma.integrationFeatureRequest.findMany({ where: { userId: alpha.userId } });
      const betaRequests = await prisma.integrationFeatureRequest.findMany({ where: { userId: beta.userId } });

      expect(alphaRequests.map((row) => row.id)).toContain(request.id);
      expect(betaRequests).toHaveLength(0);
    } finally {
      await prisma.$disconnect();
    }
  });
});
