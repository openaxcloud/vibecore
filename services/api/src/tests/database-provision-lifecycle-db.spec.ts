import { createDatabaseClient } from '@vibecore/database';
import { Client as PgClient } from 'pg';
import { describe, expect, it } from 'vitest';

import { PgTenantSqlExecutor } from '../database-provisioner.js';
import { PrismaApiStore } from '../prisma-store.js';
import { eraseIsolatedDatabaseInstanceFixture } from './project-database-erasure-db-test-support.js';

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
    let fixture: { organizationId: string; projectId: string; databaseInstanceId: string } | undefined;

    try {
      const { organization, project } = await seedProject(prismaA);
      const databaseInstance = await prismaA.databaseInstance.create({
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
      fixture = {
        organizationId: organization.id,
        projectId: project.id,
        databaseInstanceId: databaseInstance.id,
      };
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
      expect(first.instance.provisioningGeneration).toBe(2);
      expect(second.instance.provisioningGeneration).toBe(2);
      expect(await prismaA.databaseInstance.count({ where: { projectId: project.id } })).toBe(1);
      expect(await prismaA.databaseInstance.findFirst({ where: { projectId: project.id } })).toMatchObject({
        status: 'PROVISIONING',
        provisioningGeneration: 2,
        lastErrorCode: null,
        lastErrorAt: null,
      });
    } finally {
      try {
        if (fixture) {
          await eraseIsolatedDatabaseInstanceFixture(prismaA, fixture);
          await prismaA.organization.delete({ where: { id: fixture.organizationId } });
        }
      } finally {
        await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
      }
    }
  });

  it('rejects late generation-1 failure and completion after generation 2 is claimed', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    let fixture: { organizationId: string; projectId: string; databaseInstanceId: string } | undefined;

    try {
      const { organization, project } = await seedProject(prisma);
      const physicalAuthority = {
        tier: 'isolated' as const,
        clusterName: `db-${project.id}`.toLowerCase().slice(0, 53),
        backupBucket: 'vibecore-test-db-backups',
        backupPrefix: `db/${project.id}/development/`,
        retentionDays: 28,
      };
      const claim = {
        projectId: project.id,
        expectedOrganizationId: organization.id,
        organizationId: organization.id,
        retentionDays: 28,
        environment: 'development' as const,
        provisioningDeadlineAt: new Date(Date.now() + 600_000).toISOString(),
        physicalAuthority,
      };

      const attemptA = await store.acquireDatabaseProvisioning(claim);
      fixture = {
        organizationId: organization.id,
        projectId: project.id,
        databaseInstanceId: attemptA.instance.id,
      };
      expect(attemptA).toMatchObject({
        acquired: true,
        created: true,
        instance: { status: 'PROVISIONING', provisioningGeneration: 1 },
      });

      await expect(
        store.failDatabaseProvisioning(attemptA.instance.id, {
          expectedGeneration: attemptA.instance.provisioningGeneration,
          errorCode: 'DATABASE_PROVISION_TIMED_OUT',
          failedAt: new Date().toISOString(),
        }),
      ).resolves.toMatchObject({ status: 'FAILED', provisioningGeneration: 1 });

      const attemptB = await store.acquireDatabaseProvisioning({
        ...claim,
        provisioningDeadlineAt: new Date(Date.now() + 1_200_000).toISOString(),
      });
      expect(attemptB).toMatchObject({
        acquired: true,
        created: false,
        instance: { status: 'PROVISIONING', provisioningGeneration: 2 },
      });

      await expect(
        store.failDatabaseProvisioning(attemptA.instance.id, {
          expectedGeneration: attemptA.instance.provisioningGeneration,
          errorCode: 'LATE_ATTEMPT_A_FAILURE',
          failedAt: new Date().toISOString(),
        }),
      ).resolves.toBeUndefined();
      await expect(
        store.completeDatabaseProvisioning(attemptA.instance.id, {
          projectId: project.id,
          expectedOrganizationId: organization.id,
          expectedGeneration: attemptA.instance.provisioningGeneration,
          key: 'DATABASE_URL',
          valueEncrypted: 'encrypted:late-attempt-a-uri',
        }),
      ).resolves.toBeUndefined();

      expect(
        await prisma.projectSecret.findUnique({
          where: { projectId_key: { projectId: project.id, key: 'DATABASE_URL' } },
        }),
      ).toBeNull();
      expect(await prisma.databaseInstance.findUniqueOrThrow({ where: { id: attemptB.instance.id } })).toMatchObject({
        status: 'PROVISIONING',
        provisioningGeneration: 2,
        lastErrorCode: null,
      });

      await expect(
        store.completeDatabaseProvisioning(attemptB.instance.id, {
          projectId: project.id,
          expectedOrganizationId: organization.id,
          expectedGeneration: attemptB.instance.provisioningGeneration,
          key: 'DATABASE_URL',
          valueEncrypted: 'encrypted:attempt-b-uri',
        }),
      ).resolves.toMatchObject({ status: 'ACTIVE', provisioningGeneration: 2 });
      expect(
        await prisma.projectSecret.findUnique({
          where: { projectId_key: { projectId: project.id, key: 'DATABASE_URL' } },
        }),
      ).toMatchObject({ valueEncrypted: 'encrypted:attempt-b-uri' });
    } finally {
      try {
        if (fixture) {
          await eraseIsolatedDatabaseInstanceFixture(prisma, fixture);
          await prisma.organization.delete({ where: { id: fixture.organizationId } });
        }
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it('commits ACTIVE + the encrypted application URI once and refuses a stale completion', async () => {
    const prisma = createDatabaseClient();
    let fixture: { organizationId: string; projectId: string; databaseInstanceId: string } | undefined;

    try {
      const { organization, project } = await seedProject(prisma);
      const row = await prisma.databaseInstance.create({
        data: {
          projectId: project.id,
          organizationId: organization.id,
          status: 'PROVISIONING',
          retentionDays: 7,
          physicalTier: 'ISOLATED',
          physicalClusterName: `db-${project.id}`.toLowerCase().slice(0, 53),
          physicalBackupBucket: 'vibecore-test-db-backups',
          physicalBackupPrefix: `db/${project.id}/development/`,
          physicalRetentionDays: 7,
          physicalAuthorityAt: new Date(),
          provisioningDeadlineAt: new Date(Date.now() + 600_000),
        },
      });
      fixture = { organizationId: organization.id, projectId: project.id, databaseInstanceId: row.id };
      const store = new PrismaApiStore(prisma);

      const completed = await store.completeDatabaseProvisioning(row.id, {
        projectId: project.id,
        expectedOrganizationId: organization.id,
        expectedGeneration: row.provisioningGeneration,
        key: 'DATABASE_URL',
        valueEncrypted: 'encrypted:first-uri',
      });
      const stale = await store.completeDatabaseProvisioning(row.id, {
        projectId: project.id,
        expectedOrganizationId: organization.id,
        expectedGeneration: row.provisioningGeneration,
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
      try {
        if (fixture) {
          await eraseIsolatedDatabaseInstanceFixture(prisma, fixture);
          await prisma.organization.delete({ where: { id: fixture.organizationId } });
        }
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
