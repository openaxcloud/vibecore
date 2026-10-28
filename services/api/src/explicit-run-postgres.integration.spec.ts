import { randomUUID } from 'node:crypto';
import { BUILTIN_AGENT_ROUTING_CARD, buildExplicitRunPermit } from '@vibecore/billing';
import { createDatabaseClient } from '@vibecore/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaApiStore } from './prisma-store.js';

// The dedicated proof runner requires all scenarios: no unavailable-DB fallback.
describe.skipIf(process.env.EXPLICIT_RUN_POSTGRES_PROOF !== '1')('explicit budget on real PostgreSQL', () => {
  let first: PrismaApiStore;
  let second: PrismaApiStore;

  const keys: string[] = [];
  const observations: unknown[] = [];

  function fixture() {
    const projectId = `explicit-proof-${randomUUID()}`;
    keys.push(`agent.explicit-run.v1:${projectId}`);

    return (runId = randomUUID()) =>
      buildExplicitRunPermit({
        runId,
        projectId,
        planKey: 'free',
        card: structuredClone(BUILTIN_AGENT_ROUTING_CARD),
      });
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    expect(['127.0.0.1', 'localhost']).toContain(url.hostname);
    expect(['/explicit_run_proof', '/panel_proof']).toContain(url.pathname);
    expect(process.env.NODE_ENV).toBe('test');
    first = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));
    second = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));

    const [a, b] = await Promise.all([
      first.prisma.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`,
      second.prisma.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`,
    ]);
    expect(a[0].pid).not.toBe(b[0].pid);
    observations.push({ distinctPostgresConnections: [a[0].pid, b[0].pid] });
  });

  afterAll(async () => {
    if (first) {
      await first.prisma.systemSetting.deleteMany({ where: { key: { in: keys } } });
      await first.prisma.$disconnect();
    }

    await second?.prisma.$disconnect();
    process.stdout.write(`EXPLICIT_RUN_POSTGRES_OBSERVATIONS ${JSON.stringify(observations)}\n`);
  });

  it('uses the actual SystemSetting JSONB schema and rejects an unknown budget state', async () => {
    const columns = await first.prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'SystemSetting' ORDER BY column_name`;
    expect(columns).toEqual([
      { column_name: 'id', data_type: 'text' },
      { column_name: 'key', data_type: 'text' },
      { column_name: 'updatedAt', data_type: 'timestamp without time zone' },
      { column_name: 'value', data_type: 'jsonb' },
    ]);

    const permit = fixture()();
    expect(await second.hasExplicitRunBudget(permit.projectId)).toBe(false);
    await first.setSystemSetting({ key: `agent.explicit-run.v1:${permit.projectId}`, value: { unexpected: true } });
    expect(await second.reserveExplicitRun(permit)).toEqual({ ok: false, code: 'EXPLICIT_RUN_BUDGET_INVALID' });
    expect(await second.hasExplicitRunBudget(permit.projectId)).toBe(true);
  });

  it('serializes competing reservations across two real connections without overspending', async () => {
    const make = fixture();
    const left = make();
    const right = make();
    const results = await Promise.all([first.reserveExplicitRun(left), second.reserveExplicitRun(right)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'EXPLICIT_RUN_BUDGET_EXCEEDED' }]);

    const row = await first.prisma.systemSetting.findUniqueOrThrow({
      where: { key: `agent.explicit-run.v1:${left.projectId}` },
    });

    const state = row.value as { reservedMicros: number; runIds: string[] };
    expect(state.reservedMicros).toBe(15260000);
    expect(20000000 - state.reservedMicros).toBe(4740000);
    expect(state.runIds).toHaveLength(1);
    observations.push({
      concurrentReservations: results.map((r) => r.ok),
      reservedMicros: state.reservedMicros,
      remainingMicros: 4740000,
    });
  });

  it('rejects concurrent duplicate, replay and continuation re-reservation of the same permit', async () => {
    const permit = fixture()();
    const results = await Promise.all([first.reserveExplicitRun(permit), second.reserveExplicitRun(permit)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'EXPLICIT_RUN_REPLAY' }]);
    expect(await second.reserveExplicitRun(permit)).toEqual({ ok: false, code: 'EXPLICIT_RUN_REPLAY' });
    expect(await first.getExplicitRunPermit(permit.projectId, permit.runId)).toMatchObject({
      maxCalls: 2,
      reservedBudgetMicros: 15260000,
    });
    observations.push({ duplicateRejected: true, replayRejected: true, continuationCannotReserveAgain: true });
  });

  it('persists the normal accounting snapshot separately from reserved ceilings across reconnection', async () => {
    const permit = fixture()();
    expect((await first.reserveExplicitRun(permit)).ok).toBe(true);

    const reconnected = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));

    try {
      const saved = await reconnected.getExplicitRunPermit(permit.projectId, permit.runId);
      expect(saved).toEqual(permit);
      expect(await reconnected.hasExplicitRunBudget(permit.projectId)).toBe(true);
      expect(saved?.accounting).toEqual({
        providerInputCentsPerMillion: 20,
        providerOutputCentsPerMillion: 120,
        platformInputCentsPerMillion: 325,
        platformOutputCentsPerMillion: 1625,
      });
      expect(saved?.pricing).toEqual({
        providerInputCentsPerMillion: 55,
        providerOutputCentsPerMillion: 198,
        platformInputCentsPerMillion: 650,
        platformOutputCentsPerMillion: 2437.5,
      });

      const attemptedReprice = { ...permit, accounting: { ...permit.accounting, platformInputCentsPerMillion: 1 } };
      expect(await reconnected.reserveExplicitRun(attemptedReprice)).toEqual({
        ok: false,
        code: 'EXPLICIT_RUN_REPLAY',
      });
      expect(await reconnected.getExplicitRunPermit(permit.projectId, permit.runId)).toEqual(permit);
      observations.push({
        persistedAcrossReconnect: true,
        normalAccountingSeparated: true,
        repricingRejected: true,
        persistentRepairGuard: true,
      });
    } finally {
      await reconnected.prisma.$disconnect();
    }
  });
});
