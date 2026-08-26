import { hashToken } from '@vibecore/auth';
import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';
import { PrismaApiStore } from '../prisma-store.js';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

runDbTests('runtime WebSocket tickets — durable Postgres guarantees', () => {
  it('stores only a hash, claims once across replicas, and expires against the database clock', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    try {
      const user = await prismaA.user.create({
        data: { email: `runtime-ws-${suffix()}@example.com`, name: 'Runtime WS DB' },
      });
      const organization = await prismaA.organization.create({
        data: { name: 'Runtime WS DB', slug: `runtime-ws-${suffix()}` },
      });
      const project = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Runtime WS DB', slug: `runtime-ws-${suffix()}` },
      });

      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const raw = `runtime_ws_${suffix().replaceAll('-', '_')}`;
      const tokenHash = hashToken(raw);

      await storeA.createRuntimeWebSocketTicket({
        tokenHash,
        userId: user.id,
        workspaceId: project.id,
        projectId: project.id,
        resolvedWorkspaceId: `ws-${suffix()}`,
        endpoint: 'logs',
        ttlMs: 60_000,
      });

      const persisted = await prismaA.runtimeWebSocketTicket.findUniqueOrThrow({ where: { tokenHash } });
      expect(persisted.tokenHash).toBe(tokenHash);
      expect(JSON.stringify(persisted)).not.toContain(raw);
      expect(persisted.expiresAt.getTime() - persisted.createdAt.getTime()).toBe(60_000);

      /* Two independent Prisma clients model separate API replicas. */
      const claims = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          (index % 2 === 0 ? storeA : storeB).consumeRuntimeWebSocketTicket({
            tokenHash,
            workspaceId: project.id,
            endpoint: 'logs',
          }),
        ),
      );
      expect(claims.filter(Boolean)).toHaveLength(1);

      const expiredRaw = `runtime_ws_${suffix().replaceAll('-', '_')}`;
      const expiredHash = hashToken(expiredRaw);
      await storeA.createRuntimeWebSocketTicket({
        tokenHash: expiredHash,
        userId: user.id,
        workspaceId: project.id,
        projectId: project.id,
        resolvedWorkspaceId: `ws-${suffix()}`,
        endpoint: 'files/watch',
        ttlMs: 60_000,
      });

      /* Set expiry from PostgreSQL, then let the consume query compare to DB NOW(). */
      await prismaA.$executeRaw`
        UPDATE "RuntimeWebSocketTicket"
        SET "expiresAt" = CURRENT_TIMESTAMP - INTERVAL '1 second'
        WHERE "tokenHash" = ${expiredHash}
      `;
      await expect(
        storeB.consumeRuntimeWebSocketTicket({
          tokenHash: expiredHash,
          workspaceId: project.id,
          endpoint: 'files/watch',
        }),
      ).resolves.toBeUndefined();
    } finally {
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
