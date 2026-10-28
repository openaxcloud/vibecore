import { BUILTIN_AGENT_ROUTING_CARD, buildExplicitRunPermit } from '@vibecore/billing';
import { expect, it } from 'vitest';
import { PrismaApiStore } from '../prisma-store.js';

it('Prisma reservation locks before reading and writes once for competing runs', async () => {
  const rows = new Map<string, { value: unknown }>();

  let pending = Promise.resolve();
  let writes = 0;

  // Isolated transaction boundary, not a claim of a real PostgreSQL test.
  const database = {
    systemSetting: { findUnique: async ({ where }: { where: { key: string } }) => rows.get(where.key) },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      let locked = false;

      const tx = {
        $executeRawUnsafe: async (sql: string, key: string) => {
          expect(sql).toBe('SELECT pg_advisory_xact_lock(hashtext($1))');
          expect(key).toBe('system-setting:agent.explicit-run.v1:project');

          const prior = pending;
          pending = new Promise<void>((resolve) => {
            release = resolve;
          });
          await prior;
          locked = true;
        },
        systemSetting: {
          findUnique: async ({ where }: { where: { key: string } }) => {
            expect(locked).toBe(true);
            await Promise.resolve();

            return rows.get(where.key);
          },
          upsert: async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => {
            expect(locked).toBe(true);
            writes++;
            rows.set(where.key, { value: structuredClone(create.value) });
          },
        },
      };

      try {
        return await callback(tx);
      } finally {
        release?.();
      }
    },
  };

  const store = new PrismaApiStore(database as unknown as ConstructorParameters<typeof PrismaApiStore>[0]);

  const make = (runId: string) =>
    buildExplicitRunPermit({ runId, projectId: 'project', planKey: 'free', card: BUILTIN_AGENT_ROUTING_CARD });

  const results = await Promise.all([store.reserveExplicitRun(make('one')), store.reserveExplicitRun(make('two'))]);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(writes).toBe(1);
  expect(await store.reserveExplicitRun(make('one'))).toMatchObject({ ok: false, code: 'EXPLICIT_RUN_REPLAY' });
  expect(await store.getExplicitRunPermit('project', 'one')).toMatchObject({ runId: 'one', maxCalls: 2 });
  expect(await store.getExplicitRunPermit('other-project', 'one')).toBeUndefined();
});
