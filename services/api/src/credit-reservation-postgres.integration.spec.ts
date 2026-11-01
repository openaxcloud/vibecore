import { randomUUID } from 'node:crypto';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaApiStore } from './prisma-store.js';

describe.skipIf(process.env.CREDIT_PACK_POSTGRES_PROOF !== '1')(
  'credit reservation atomicity on isolated PostgreSQL',
  () => {
    const client = createDatabaseClient({ poolMax: 2 });
    const store = new PrismaApiStore(client);
    const organizations: string[] = [];
    beforeAll(() => {
      const url = new URL(process.env.DATABASE_URL!);
      expect(url.hostname).toBe('127.0.0.1');
      expect(url.pathname).toBe('/credit_pack_proof');
      expect(process.env.NODE_ENV).toBe('test');
    });
    afterAll(async () => {
      await client.creditReservation.deleteMany({ where: { organizationId: { in: organizations } } });
      await client.organization.deleteMany({ where: { id: { in: organizations } } });
      await client.$disconnect();
    });

    async function fixture() {
      const slug = `reservation-proof-${randomUUID()}`;
      const organization = await client.organization.create({ data: { slug, name: slug } });
      organizations.push(organization.id);
      await store.ensureCreditWallet(organization.id);
      await client.creditWallet.update({ where: { organizationId: organization.id }, data: { balanceCents: 100 } });

      return { organizationId: organization.id, amountCents: 70, expiresAtMs: Date.now() + 60_000 };
    }
    it('rolls back a wallet hold if reservation insertion fails', async () => {
      const input = await fixture();

      const faulting = client.$extends({
        query: {
          creditReservation: {
            async create() {
              throw new Error('injected insertion failure');
            },
          },
        },
      });
      await expect(new PrismaApiStore(faulting as unknown as DatabaseClient).reserveCredits(input)).rejects.toThrow(
        'injected insertion failure',
      );
      expect(await client.creditWallet.findUnique({ where: { organizationId: input.organizationId } })).toMatchObject({
        heldCents: 0,
      });
      expect(await client.creditReservation.count({ where: { organizationId: input.organizationId } })).toBe(0);
      expect(await store.reserveCredits(input)).toMatchObject({ amountCents: 70 });
    });
    it.each(['release', 'settle'] as const)(
      'rolls back %s status if wallet update fails, allowing retry',
      async (operation) => {
        const input = await fixture();
        const reservation = (await store.reserveCredits(input))!;

        const faulting = client.$extends({
          query: {
            async $executeRaw() {
              throw new Error('injected wallet failure');
            },
          },
        });

        const faultyStore = new PrismaApiStore(faulting as unknown as DatabaseClient);
        await expect(
          operation === 'release'
            ? faultyStore.releaseCreditReservation(reservation)
            : faultyStore.settleCreditReservation({ ...reservation, actualCents: 50 }),
        ).rejects.toThrow('injected wallet failure');
        expect(await client.creditReservation.findUnique({ where: { id: reservation.id } })).toMatchObject({
          status: 'HELD',
        });
        expect(await client.creditWallet.findUnique({ where: { organizationId: input.organizationId } })).toMatchObject(
          { heldCents: 70 },
        );
        expect(
          operation === 'release'
            ? await store.releaseCreditReservation(reservation)
            : await store.settleCreditReservation({ ...reservation, actualCents: 50 }),
        ).toBe(true);
        expect(await client.creditWallet.findUnique({ where: { organizationId: input.organizationId } })).toMatchObject(
          { heldCents: 0 },
        );
      },
    );
    it('admits one competing hold and releases it once under concurrency', async () => {
      const input = await fixture();
      const holds = await Promise.all([store.reserveCredits(input), store.reserveCredits(input)]);
      expect(holds.filter(Boolean)).toHaveLength(1);

      const reservation = holds.find(Boolean)!;

      const released = await Promise.all([
        store.releaseCreditReservation(reservation),
        store.settleCreditReservation({ ...reservation, actualCents: 50 }),
      ]);
      expect(released.filter(Boolean)).toHaveLength(1);
      expect(await client.creditWallet.findUnique({ where: { organizationId: input.organizationId } })).toMatchObject({
        heldCents: 0,
      });
    });
  },
);
