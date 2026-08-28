import { createHash } from 'node:crypto';

import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

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

const runDbTests = (await canReachDatabase()) ? describe.sequential : describe.skip;

runDbTests('static artifact GC durable cursor — PostgreSQL', () => {
  it('serializes cross-replica claims and resumes after a new store instance', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);
    const rootIdentity = createHash('sha256').update(`gc-root:${Date.now()}:${Math.random()}`).digest('hex');
    const sortedDigests = Array.from({ length: 102 }, (_, index) => index.toString(16).padStart(64, '0'));
    const key = `static-artifact-gc:${rootIdentity}`;

    try {
      const [left, right] = await Promise.all([
        storeA.advanceStaticArtifactGcCursor({ rootIdentity, sortedDigests, limit: 100 }),
        storeB.advanceStaticArtifactGcCursor({ rootIdentity, sortedDigests, limit: 100 }),
      ]);
      expect(new Set([...left, ...right])).toEqual(new Set(sortedDigests));
      expect(left.filter((digest) => right.includes(digest))).toEqual([]);

      const restarted = new PrismaApiStore(createDatabaseClient());
      try {
        await expect(
          restarted.advanceStaticArtifactGcCursor({ rootIdentity, sortedDigests, limit: 100 }),
        ).resolves.toEqual(sortedDigests.slice(0, 100));
      } finally {
        await restarted.disconnect();
      }
    } finally {
      await prismaA.systemSetting.deleteMany({ where: { key } }).catch(() => undefined);
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });
});
