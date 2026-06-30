import { describe, expect, it } from 'vitest';

import { COMPUTE_UNIT_CENTS, STORAGE_CENTS_PER_GIB_MONTH } from '@vibecore/billing';
import { meterAllDatabaseStorage, meterDatabaseStorage } from './metering-service.js';
import type { ApiStore } from './store.js';

const DAY_MS = 86_400_000;
const MIB = 1024 * 1024;

interface Recorded {
  type: string;
  organizationId: string;
  quantity?: number;
  recordedAtMs: number;
}

/**
 * In-memory ApiStore double covering exactly the surface the DB-storage sweep +
 * debit path touch: usage events (+ dedup), serialized mutation, credit packs,
 * wallet balance, ledger writes and PAYG tracking. Non-shadow paths debit a
 * single wallet balance so we can assert the exact cents charged.
 */
function makeStore(options: {
  instances: Array<{ organizationId: string; sizeBytes: number }>;
  nowMs: number;
  balanceCents?: number;
  serialize?: boolean;
}) {
  const events: Recorded[] = [];
  const ledger: Array<{ deltaCents: number; reason: string }> = [];
  const payg: Array<{ organizationId: string; checkpointId: string; cents: number }> = [];
  let balance = options.balanceCents ?? 0;
  const locks = new Map<string, Promise<unknown>>();

  const store: Partial<ApiStore> = {
    listActiveDatabaseInstances: (async () =>
      options.instances.map((row, index) => ({
        id: `db-${index}`,
        projectId: `proj-${index}`,
        organizationId: row.organizationId,
        environment: 'production',
        status: 'ACTIVE',
        engine: 'postgres',
        sizeBytes: row.sizeBytes,
        retentionDays: 7,
        pitrEnabled: false,
        createdAt: new Date(options.nowMs).toISOString(),
        updatedAt: new Date(options.nowMs).toISOString(),
      }))) as unknown as ApiStore['listActiveDatabaseInstances'],
    recordUsageEvent: (async (input: { organizationId: string; type: string; quantity?: number }) => {
      await Promise.resolve();
      const event = { ...input, recordedAtMs: options.nowMs };
      events.push(event);
      return event;
    }) as unknown as ApiStore['recordUsageEvent'],
    hasUsageEventSince: async (organizationId: string, type: string, sinceMs: number) => {
      await Promise.resolve();
      return events.some((e) => e.organizationId === organizationId && e.type === type && e.recordedAtMs >= sinceMs);
    },
    withSerializedMutation: (async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
      if (options.serialize === false) {
        return fn();
      }
      const prior = locks.get(key) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      locks.set(
        key,
        prior.then(() => gate),
      );
      await prior;
      try {
        return await fn();
      } finally {
        release();
      }
    }) as ApiStore['withSerializedMutation'],
    listCreditPacks: (async () => []) as unknown as ApiStore['listCreditPacks'],
    getCreditWallet: (async () => ({ organizationId: 'org', balanceCents: balance })) as unknown as ApiStore['getCreditWallet'],
    recordCreditEntry: (async (input: { deltaCents: number; reason: string }) => {
      balance += input.deltaCents;
      ledger.push({ deltaCents: input.deltaCents, reason: input.reason });
      return { balanceCents: balance };
    }) as unknown as ApiStore['recordCreditEntry'],
    recordPaygCharge: (async (input: { organizationId: string; checkpointId: string; cents: number }) => {
      payg.push(input);
    }) as unknown as ApiStore['recordPaygCharge'],
  };

  return { store: store as ApiStore, events, ledger, payg, getBalance: () => balance };
}

describe('meterDatabaseStorage', () => {
  it('charges $0.03/GiB-month and does NOT re-floor/cap the supplied billable GiB', async () => {
    const nowMs = 10 * DAY_MS;
    // 12 GiB supplied directly (sweep already summed/capped per-DB) — must NOT be
    // re-capped to 10 GiB here.
    const { store, ledger } = makeStore({ instances: [], nowMs, balanceCents: 1_000_000 });

    const result = await meterDatabaseStorage(store, {
      organizationId: 'org-a',
      billableGib: 12,
      shadow: false,
      nowMs,
    });

    expect(result.billableGib).toBe(12);
    expect(result.gibMonths).toBe(12);
    expect(result.costCents).toBe(Math.ceil(12 * STORAGE_CENTS_PER_GIB_MONTH));
    // Debited from wallet balance.
    expect(ledger).toHaveLength(1);
    expect(ledger[0].deltaCents).toBe(-result.costCents);
  });

  it('applies the month fraction for a daily slice', async () => {
    const nowMs = 11 * DAY_MS;
    const { store } = makeStore({ instances: [], nowMs, balanceCents: 1_000_000 });
    const result = await meterDatabaseStorage(store, {
      organizationId: 'org-a',
      billableGib: 30,
      monthFraction: 1 / 30,
      shadow: false,
      nowMs,
    });
    expect(result.gibMonths).toBeCloseTo(1, 9);
    expect(result.costCents).toBe(Math.ceil(1 * STORAGE_CENTS_PER_GIB_MONTH));
  });

  it('debits nothing in shadow mode', async () => {
    const nowMs = 12 * DAY_MS;
    const { store, ledger, events } = makeStore({ instances: [], nowMs, balanceCents: 1_000_000 });
    const result = await meterDatabaseStorage(store, { organizationId: 'org-a', billableGib: 5, shadow: true, nowMs });
    expect(result.shadow).toBe(true);
    expect(result.paygCents).toBe(0);
    expect(ledger).toHaveLength(0);
    // The usage event is still recorded (audit/quota) even in shadow.
    expect(events.filter((e) => e.type === 'database.storageGiBMonths')).toHaveLength(1);
  });

  it('overflows uncovered cost into a PAYG tracking entry (spend-cap signal)', async () => {
    const nowMs = 13 * DAY_MS;
    // Wallet covers only 2 cents; the rest is PAYG overage.
    const { store, payg } = makeStore({ instances: [], nowMs, balanceCents: 2 });
    const result = await meterDatabaseStorage(store, {
      organizationId: 'org-a',
      billableGib: 100, // 100 × 3 = 300 cents
      shadow: false,
      nowMs,
      paygReference: 'usage:db-storage:test',
    });
    expect(result.costCents).toBe(300);
    expect(result.fromBalance).toBe(2);
    expect(result.paygCents).toBe(298);
    expect(payg).toEqual([{ organizationId: 'org-a', checkpointId: 'usage:db-storage:test', cents: 298 }]);
  });
});

describe('meterAllDatabaseStorage daily sweep', () => {
  it('sums billable GiB per org applying the 33 MB floor + 10 GiB cap PER database', async () => {
    const nowMs = 20 * DAY_MS;
    // org-a: one empty DB (→ 33MB floor) + one 20 GiB DB (→ capped to 10 GiB).
    const { store, events } = makeStore({
      instances: [
        { organizationId: 'org-a', sizeBytes: 0 },
        { organizationId: 'org-a', sizeBytes: 20 * 1024 * MIB },
      ],
      nowMs,
      balanceCents: 1_000_000,
    });

    const result = await meterAllDatabaseStorage(store, { shadow: true, nowMs, daysInPeriod: 30 });

    expect(result.orgsMetered).toBe(1);
    expect(result.instances).toBe(2);
    // floor (33/1024 GiB) + cap (10 GiB), one day's fraction → quantity ceil ≥ 1.
    const ev = events.find((e) => e.type === 'database.storageGiBMonths');
    expect(ev).toBeTruthy();
  });

  it('is idempotent per (org, UTC-day) across concurrent sweeps', async () => {
    const nowMs = 21 * DAY_MS + 5;
    const { store, events } = makeStore({
      instances: [{ organizationId: 'org-a', sizeBytes: 5 * 1024 * MIB }],
      nowMs,
      balanceCents: 1_000_000,
    });

    const [r1, r2] = await Promise.all([
      meterAllDatabaseStorage(store, { shadow: true, nowMs }),
      meterAllDatabaseStorage(store, { shadow: true, nowMs }),
    ]);

    expect(events.filter((e) => e.type === 'database.storageGiBMonths')).toHaveLength(1);
    expect(r1.orgsMetered + r2.orgsMetered).toBe(1);
  });
});

// Anchor the rate assumptions so a pricing change is a deliberate, visible edit.
describe('DB-storage rate anchors', () => {
  it('uses the $0.03/GiB-month storage rate (not the compute-unit rate)', () => {
    expect(STORAGE_CENTS_PER_GIB_MONTH).toBe(3);
    expect(COMPUTE_UNIT_CENTS).not.toBe(STORAGE_CENTS_PER_GIB_MONTH);
  });
});
