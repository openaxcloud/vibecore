import { createDatabaseClient } from '@vibecore/database';
import { Client as PgClient } from 'pg';
import { describe, expect, it } from 'vitest';

import { PgTenantSqlExecutor } from '../database-provisioner.js';
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

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

async function seedProject(prisma: ReturnType<typeof createDatabaseClient>) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const organization = await prisma.organization.create({
    data: { name: `Database lifecycle ${suffix}`, slug: `database-lifecycle-${suffix}` },
  });
  const project = await prisma.project.create({
    data: { organizationId: organization.id, name: `Database lifecycle ${suffix}`, slug: `db-${suffix}` },
  });

  return { organization, project };
}

runDbTests('managed database provisioning lifecycle — durable Postgres CAS', () => {
  it('creates and uses a real isolated tenant through its exact application URI', async () => {
    const prisma = createDatabaseClient();
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const role = `t_lifecycle_${suffix}`;
    const database = `lifecycle_${suffix}`;
    const password = `proof_${suffix}`;
    const adminUrl = new URL(process.env.DATABASE_URL!);
    adminUrl.searchParams.set('sslmode', 'disable');
    const applicationUrl = new URL(adminUrl);
    applicationUrl.username = role;
    applicationUrl.password = password;
    applicationUrl.pathname = `/${database}`;
    const executor = new PgTenantSqlExecutor();
    let applicationClient: PgClient | undefined;

    try {
      await executor.provisionTenant({
        adminUri: adminUrl.toString(),
        role,
        db: database,
        password,
        guard: async () => undefined,
      });

      await expect(
        executor.verifyConnection({
          uri: applicationUrl.toString(),
          expectedRole: role,
          expectedDatabase: database,
        }),
      ).resolves.toBe(true);

      applicationClient = new PgClient({ connectionString: applicationUrl.toString(), ssl: false });
      await applicationClient.connect();
      await applicationClient.query('CREATE TABLE lifecycle_proof (value text NOT NULL)');
      await applicationClient.query('INSERT INTO lifecycle_proof (value) VALUES ($1)', ['usable']);
      const result = await applicationClient.query<{ value: string }>('SELECT value FROM lifecycle_proof');

      expect(result.rows).toEqual([{ value: 'usable' }]);
    } finally {
      await applicationClient?.end().catch(() => undefined);
      await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`REVOKE "${role}" FROM CURRENT_USER`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS "${role}"`).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('grants exactly one retry claim across two independent Prisma clients', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const { organization, project } = await seedProject(prismaA);
      organizationId = organization.id;
      await prismaA.databaseInstance.create({
        data: {
          projectId: project.id,
          organizationId: organization.id,
          environment: 'development',
          status: 'FAILED',
          retentionDays: 28,
          pitrEnabled: true,
          physicalTier: 'ISOLATED',
          physicalClusterName: `db-${project.id}`.toLowerCase().slice(0, 53),
          physicalBackupBucket: 'vibecore-test-db-backups',
          physicalBackupPrefix: `db/${project.id}/development/`,
          physicalRetentionDays: 28,
          physicalAuthorityAt: new Date(),
          lastErrorCode: 'DATABASE_PROVISION_TIMED_OUT',
          lastErrorAt: new Date(),
        },
      });
      const retry = {
        projectId: project.id,
        expectedOrganizationId: organization.id,
        organizationId: organization.id,
        retentionDays: 28,
        environment: 'development',
        provisioningDeadlineAt: new Date(Date.now() + 600_000).toISOString(),
        physicalAuthority: {
          tier: 'isolated' as const,
          clusterName: `db-${project.id}`.toLowerCase().slice(0, 53),
          backupBucket: 'vibecore-test-db-backups',
          backupPrefix: `db/${project.id}/development/`,
          retentionDays: 28,
        },
      };

      const [first, second] = await Promise.all([
        new PrismaApiStore(prismaA).acquireDatabaseProvisioning(retry),
        new PrismaApiStore(prismaB).acquireDatabaseProvisioning(retry),
      ]);

      expect([first, second].filter((result) => result.acquired)).toHaveLength(1);
      expect(first.instance.status).toBe('PROVISIONING');
      expect(second.instance.status).toBe('PROVISIONING');
      expect(await prismaA.databaseInstance.count({ where: { projectId: project.id } })).toBe(1);
      expect(await prismaA.databaseInstance.findFirst({ where: { projectId: project.id } })).toMatchObject({
        status: 'PROVISIONING',
        lastErrorCode: null,
        lastErrorAt: null,
      });
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('commits ACTIVE + the encrypted application URI once and refuses a stale completion', async () => {
    const prisma = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const { organization, project } = await seedProject(prisma);
      organizationId = organization.id;
      const row = await prisma.databaseInstance.create({
        data: {
          projectId: project.id,
          organizationId: organization.id,
          status: 'PROVISIONING',
          provisioningDeadlineAt: new Date(Date.now() + 600_000),
        },
      });
      const store = new PrismaApiStore(prisma);

      const completed = await store.completeDatabaseProvisioning(row.id, {
        projectId: project.id,
        expectedOrganizationId: organization.id,
        key: 'DATABASE_URL',
        valueEncrypted: 'encrypted:first-uri',
      });
      const stale = await store.completeDatabaseProvisioning(row.id, {
        projectId: project.id,
        expectedOrganizationId: organization.id,
        key: 'DATABASE_URL',
        valueEncrypted: 'encrypted:stale-uri',
      });

      expect(completed?.status).toBe('ACTIVE');
      expect(stale).toBeUndefined();
      expect(await prisma.databaseInstance.findUnique({ where: { id: row.id } })).toMatchObject({
        status: 'ACTIVE',
        provisioningDeadlineAt: null,
      });
      expect(
        await prisma.projectSecret.findUnique({
          where: { projectId_key: { projectId: project.id, key: 'DATABASE_URL' } },
        }),
      ).toMatchObject({ valueEncrypted: 'encrypted:first-uri' });
    } finally {
      if (organizationId) {
        await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }

      await prisma.$disconnect();
    }
  });
});
