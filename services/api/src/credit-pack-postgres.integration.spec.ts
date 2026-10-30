import { randomUUID } from 'node:crypto';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaApiStore } from './prisma-store.js';

import { creditPackPurchaseKeys, type StripeCreditPackPurchase } from './store.js';

describe.skipIf(process.env.CREDIT_PACK_POSTGRES_PROOF !== '1')('durable packs on isolated PostgreSQL', () => {
  let first: PrismaApiStore, second: PrismaApiStore, organizationId: string;

  const keys: string[] = [];

  function fixture(): StripeCreditPackPurchase {
    const suffix = randomUUID().replaceAll('-', '');

    const input = {
      organizationId,
      sessionId: `cs_${suffix}`,
      paymentIntentId: `pi_${suffix}`,
      sku: 'pack-300',
      purchasedCents: 30000,
      expiresAt: new Date('2027-01-01'),
    };
    keys.push(...creditPackPurchaseKeys(input));

    return input;
  }
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.pathname).toBe('/credit_pack_proof');
    expect(process.env.NODE_ENV).toBe('test');
    first = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));
    second = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));

    const slug = `credit-proof-${randomUUID()}`;
    organizationId = (await first.prisma.organization.create({ data: { slug, name: slug } })).id;

    const pids = await Promise.all(
      [first, second].map((s) => s.prisma.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid')),
    );
    expect(pids[0][0].pid).not.toBe(pids[1][0].pid);
  });
  afterAll(async () => {
    if (first) {
      const packs = await first.prisma.creditPack.findMany({ where: { organizationId }, select: { id: true } });
      await first.prisma.systemSetting.deleteMany({
        where: { key: { in: [...keys, ...packs.map((p) => `billing.credit-pack.v1:pack:${p.id}`)] } },
      });

      if (organizationId) {
        await first.prisma.organization.delete({ where: { id: organizationId } });
      }

      await first.prisma.$disconnect();
    }

    await second?.prisma.$disconnect();
  });
  it('serializes two connections and survives lost response after commit, consumption and expiry', async () => {
    const input = fixture();
    const results = await Promise.all([first.grantStripeCreditPack(input), second.grantStripeCreditPack(input)]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results[0].packId).toBe(results[1].packId);
    await first.prisma.creditPack.update({
      where: { id: results[0].packId },
      data: { remainingCents: 0, expiresAt: new Date(0) },
    });

    const restarted = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));

    try {
      expect(await restarted.grantStripeCreditPack({ ...input, expiresAt: new Date('2027-02-01') })).toMatchObject({
        packId: results[0].packId,
        created: false,
      });
      expect(await restarted.prisma.creditPack.findUnique({ where: { id: results[0].packId } })).toMatchObject({
        remainingCents: 0,
      });
    } finally {
      await restarted.prisma.$disconnect();
    }
  });
  it('rolls back a grant when PostgreSQL connection dies before receipt commit then retries', async () => {
    const input = fixture();
    const client = createDatabaseClient({ poolMax: 1 });
    const [{ pid }] = await client.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid');

    let killed = false;

    const faulting = client.$extends({
      query: {
        systemSetting: {
          async create({ args, query }) {
            if (!killed) {
              killed = true;
              await second.prisma.$queryRawUnsafe('SELECT pg_terminate_backend($1)', pid);
            }

            return query(args);
          },
        },
      },
    });

    try {
      await expect(
        new PrismaApiStore(faulting as unknown as DatabaseClient).grantStripeCreditPack(input),
      ).rejects.toThrow();
      expect(
        await second.prisma.creditPack.count({ where: { stripePaymentIntentId: input.paymentIntentId ?? undefined } }),
      ).toBe(0);
      expect(await second.prisma.systemSetting.count({ where: { key: { in: creditPackPurchaseKeys(input) } } })).toBe(
        0,
      );
      expect((await second.grantStripeCreditPack(input)).created).toBe(true);
    } finally {
      await client.$disconnect();
    }
  });
  it('rejects conflicting tenant, SKU, value and either reused purchase identity', async () => {
    const input = fixture();
    await first.grantStripeCreditPack(input);

    for (const changed of [
      { organizationId: 'foreign' },
      { sku: 'pack-100' },
      { purchasedCents: 1 },
      { sessionId: `${input.sessionId}other` },
      { paymentIntentId: `${input.paymentIntentId}other` },
    ]) {
      await expect(second.grantStripeCreditPack({ ...input, ...changed })).rejects.toMatchObject({
        code: 'CREDIT_PACK_PURCHASE_CONFLICT',
      });
    }
  });
  it('adopts compatible consumed legacy singleton without refill and refuses duplicates or conflict', async () => {
    const input = fixture();

    const legacy = await first.createCreditPack({
      ...input,
      stripePaymentIntentId: input.paymentIntentId ?? undefined,
    });
    await first.prisma.creditPack.update({ where: { id: legacy.id }, data: { remainingCents: 0 } });
    expect(await second.grantStripeCreditPack(input)).toMatchObject({ packId: legacy.id, created: false });

    const duplicate = fixture();
    await first.createCreditPack({ ...duplicate, stripePaymentIntentId: duplicate.paymentIntentId ?? undefined });
    await first.createCreditPack({ ...duplicate, stripePaymentIntentId: duplicate.paymentIntentId ?? undefined });
    await expect(second.grantStripeCreditPack(duplicate)).rejects.toMatchObject({
      code: 'CREDIT_PACK_PURCHASE_CONFLICT',
    });

    const conflict = fixture();
    await first.createCreditPack({
      ...conflict,
      purchasedCents: 1,
      stripePaymentIntentId: conflict.paymentIntentId ?? undefined,
    });
    await expect(second.grantStripeCreditPack(conflict)).rejects.toMatchObject({
      code: 'CREDIT_PACK_PURCHASE_CONFLICT',
    });
  });
  it('refuses malformed and missing receipt halves', async () => {
    const input = fixture();
    await first.grantStripeCreditPack(input);
    await first.prisma.systemSetting.update({ where: { key: creditPackPurchaseKeys(input)[0] }, data: { value: {} } });
    await expect(second.grantStripeCreditPack(input)).rejects.toMatchObject({ code: 'CREDIT_PACK_PURCHASE_CONFLICT' });
    await first.prisma.systemSetting.delete({ where: { key: creditPackPurchaseKeys(input)[0] } });
    await expect(second.grantStripeCreditPack(input)).rejects.toMatchObject({ code: 'CREDIT_PACK_PURCHASE_CONFLICT' });
  });
  it('supports concurrent coupon sessions without payment intents but rejects ambiguous legacy grants', async () => {
    const input = { ...fixture(), paymentIntentId: null };
    const concurrent = await Promise.all([first.grantStripeCreditPack(input), second.grantStripeCreditPack(input)]);
    expect(concurrent.filter((result) => result.created)).toHaveLength(1);
    expect(concurrent[0].packId).toBe(concurrent[1].packId);
    expect((await second.grantStripeCreditPack(input)).created).toBe(false);

    const another = { ...fixture(), paymentIntentId: null };
    expect((await first.grantStripeCreditPack(another)).created).toBe(true);
    await first.createCreditPack({ organizationId, purchasedCents: 30000, expiresAt: new Date('2027-01-01') });

    const ambiguous = { ...fixture(), paymentIntentId: null };
    await expect(second.grantStripeCreditPack(ambiguous)).rejects.toMatchObject({
      code: 'CREDIT_PACK_PURCHASE_CONFLICT',
    });

    // Legacy ambiguity must not block replay of an already committed coupon.
    expect((await second.grantStripeCreditPack(input)).created).toBe(false);
  });
});
