/* eslint-disable no-restricted-imports -- API Vitest resolves service-relative modules, not the web `~/` alias. */
import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

runDbTests('database migration control plane — durable PostgreSQL fencing', () => {
  it('grants one singleton owner and one transition winner across replicas', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const projectId = `dbmig-project-${suffix()}`;
    const organizationId = `dbmig-org-${suffix()}`;
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);

    const base = {
      projectId,
      organizationId,
      environment: 'production',
      idempotencyKey: 'publish:one',
      requestHash: 'request-one',
      ttlMs: 30_000,
      plan: [{ name: '001.sql', sha256: 'a'.repeat(64) }],
      statementsSha256: 'b'.repeat(64),
      backwardCompatible: true,
      forwardCompatible: false,
    };

    try {
      const [first, second] = await Promise.all([
        storeA.acquireDatabaseMigrationExecution({ ...base, ownerToken: 'owner-a' }),
        storeB.acquireDatabaseMigrationExecution({ ...base, ownerToken: 'owner-b' }),
      ]);

      const acquired = [first, second].find((result) => result.kind === 'ACQUIRED');
      const blocked = [first, second].find((result) => result.kind === 'BLOCKED');

      expect(acquired?.kind).toBe('ACQUIRED');
      expect(blocked?.kind).toBe('BLOCKED');

      if (!acquired || acquired.kind !== 'ACQUIRED') {
        throw new Error('DB_MIGRATION_ACQUIRE_PROOF_FAILED');
      }

      const ownerStore = acquired.execution.ownerToken === 'owner-a' ? storeA : storeB;
      const competingStore = ownerStore === storeA ? storeB : storeA;

      const transitions = await Promise.all([
        ownerStore.transitionDatabaseMigrationExecution({
          id: acquired.execution.id,
          ownerToken: acquired.execution.ownerToken!,
          version: acquired.execution.version,
          expectedState: 'LOCK_ACQUIRED',
          nextState: 'BACKUP_VERIFIED',
          ttlMs: 30_000,
        }),
        competingStore.transitionDatabaseMigrationExecution({
          id: acquired.execution.id,
          ownerToken: acquired.execution.ownerToken!,
          version: acquired.execution.version,
          expectedState: 'LOCK_ACQUIRED',
          nextState: 'BACKUP_VERIFIED',
          ttlMs: 30_000,
        }),
      ]);

      expect(transitions.filter(Boolean)).toHaveLength(1);
      expect(await prismaA.dBMigrationExecution.count({ where: { projectId } })).toBe(1);

      await prismaA.$executeRaw`
        UPDATE "DBMigrationExecution" SET "plan" = '[]'::jsonb WHERE "projectId" = ${projectId}
      `;
      await expect(
        storeA.acquireDatabaseMigrationExecution({ ...base, ownerToken: 'owner-after-corruption' }),
      ).rejects.toThrow('DB_MIGRATION_PLAN_CORRUPT');
    } finally {
      await prismaA.dBMigrationExecution.deleteMany({ where: { projectId } }).catch(() => undefined);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('uses PostgreSQL time for expiry, refuses resurrection, and reclaims once', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const projectId = `dbmig-clock-${suffix()}`;
    const organizationId = `dbmig-org-${suffix()}`;
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);

    try {
      const acquired = await storeA.acquireDatabaseMigrationExecution({
        projectId,
        organizationId,
        environment: 'production',
        idempotencyKey: 'publish:expired',
        requestHash: 'expired-request',
        ownerToken: 'expired-owner',
        ttlMs: 60_000,
        plan: [],
        statementsSha256: 'c'.repeat(64),
        backwardCompatible: true,
        forwardCompatible: false,
      });
      expect(acquired.kind).toBe('ACQUIRED');

      if (acquired.kind !== 'ACQUIRED') {
        throw new Error('DB_MIGRATION_ACQUIRE_PROOF_FAILED');
      }

      const [clock] = await prismaA.$queryRaw<Array<{ remainingMs: number }>>`
        SELECT EXTRACT(EPOCH FROM ("leaseExpiresAt" - CURRENT_TIMESTAMP)) * 1000 AS "remainingMs"
        FROM "DBMigrationExecution" WHERE "id" = ${acquired.execution.id}
      `;
      expect(Number(clock?.remainingMs)).toBeGreaterThan(55_000);
      expect(Number(clock?.remainingMs)).toBeLessThanOrEqual(60_000);

      await prismaA.$executeRaw`
        UPDATE "DBMigrationExecution"
        SET "leaseExpiresAt" = CURRENT_TIMESTAMP - INTERVAL '1 second'
        WHERE "id" = ${acquired.execution.id}
      `;
      await expect(
        storeA.renewDatabaseMigrationLease({
          id: acquired.execution.id,
          ownerToken: acquired.execution.ownerToken!,
          version: acquired.execution.version,
          state: acquired.execution.state,
          ttlMs: 60_000,
        }),
      ).resolves.toBeUndefined();

      const [first, second] = await Promise.all([
        storeA.acquireDatabaseMigrationExecution({
          projectId,
          organizationId,
          environment: 'production',
          idempotencyKey: 'publish:replacement',
          requestHash: 'replacement-request',
          ownerToken: 'replacement-a',
          ttlMs: 60_000,
          plan: [],
          statementsSha256: 'd'.repeat(64),
          backwardCompatible: true,
          forwardCompatible: false,
        }),
        storeB.acquireDatabaseMigrationExecution({
          projectId,
          organizationId,
          environment: 'production',
          idempotencyKey: 'publish:replacement',
          requestHash: 'replacement-request',
          ownerToken: 'replacement-b',
          ttlMs: 60_000,
          plan: [],
          statementsSha256: 'd'.repeat(64),
          backwardCompatible: true,
          forwardCompatible: false,
        }),
      ]);

      expect([first, second].filter((result) => result.kind === 'RECOVERY')).toHaveLength(1);
      expect([first, second].filter((result) => result.kind === 'BLOCKED')).toHaveLength(1);
      expect(await prismaA.dBMigrationExecution.count({ where: { projectId } })).toBe(1);
    } finally {
      await prismaA.dBMigrationExecution.deleteMany({ where: { projectId } }).catch(() => undefined);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
