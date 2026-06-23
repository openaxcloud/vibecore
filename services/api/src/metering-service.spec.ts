import { describe, expect, it } from 'vitest';
import { meterAllObjectStorage } from './metering-service.js';
import type { ApiStore } from './store.js';

interface RecordedEvent {
  organizationId: string;
  type: string;
  quantity?: number;
  recordedAtMs: number;
}

/**
 * Minimal in-memory ApiStore double for the object-storage sweep. Models the two
 * pieces the dedup guard relies on — recordUsageEvent / hasUsageEventSince — plus a
 * faithful withSerializedMutation that serializes callers sharing a key (the real
 * impl uses a Postgres transaction-scoped advisory lock). Both store reads/writes
 * yield to the microtask queue so overlapping awaits actually interleave, which is
 * what makes the TOCTOU reproducible without the lock.
 */
function makeStore(options: {
  orgs: Array<{ organizationId: string; bytes: number }>;
  nowMs: number;
  serialize: boolean;
}): { store: ApiStore; events: RecordedEvent[] } {
  const events: RecordedEvent[] = [];
  const locks = new Map<string, Promise<unknown>>();

  const store: Partial<ApiStore> = {
    aggregateStorageBytesByOrg: async () => options.orgs,
    recordUsageEvent: (async (input: { organizationId: string; type: string; quantity?: number }) => {
      await Promise.resolve();

      const event: RecordedEvent = { ...input, recordedAtMs: options.nowMs };
      events.push(event);

      return event;
    }) as unknown as ApiStore['recordUsageEvent'],
    hasUsageEventSince: async (organizationId: string, type: string, sinceMs: number) => {
      await Promise.resolve();
      return events.some((e) => e.organizationId === organizationId && e.type === type && e.recordedAtMs >= sinceMs);
    },
    withSerializedMutation: (async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
      if (!options.serialize) {
        // No-op lock: lets us reproduce the unguarded TOCTOU as a control.
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
  };

  return { store: store as ApiStore, events };
}

const DAY_MS = 86_400_000;
const GIB = 1024 ** 3;

describe('meterAllObjectStorage daily idempotency', () => {
  it('records the storage event exactly once when two sweeps run concurrently', async () => {
    const nowMs = 100 * DAY_MS + 5_000; // arbitrary point inside a UTC day

    const { store, events } = makeStore({
      orgs: [{ organizationId: 'org-a', bytes: 50 * GIB }],
      nowMs,
      serialize: true,
    });

    /*
     * Two overlapping sweep invocations for the same org/day (pod restart mid-sweep
     * or a manual re-trigger of POST /internal/metering/object-storage).
     */
    const [r1, r2] = await Promise.all([
      meterAllObjectStorage(store, { shadow: true, nowMs }),
      meterAllObjectStorage(store, { shadow: true, nowMs }),
    ]);

    const storageEvents = events.filter((e) => e.type === 'storage.objectGiBMonths');
    expect(storageEvents).toHaveLength(1);

    // Exactly one of the two sweeps did the metering; the other saw it and skipped.
    expect(r1.orgsMetered + r2.orgsMetered).toBe(1);
  });

  it('meters each org once across a multi-org concurrent sweep', async () => {
    const nowMs = 200 * DAY_MS + 1;

    const { store, events } = makeStore({
      orgs: [
        { organizationId: 'org-a', bytes: 10 * GIB },
        { organizationId: 'org-b', bytes: 20 * GIB },
      ],
      nowMs,
      serialize: true,
    });

    await Promise.all([
      meterAllObjectStorage(store, { shadow: true, nowMs }),
      meterAllObjectStorage(store, { shadow: true, nowMs }),
      meterAllObjectStorage(store, { shadow: true, nowMs }),
    ]);

    const byOrg = events
      .filter((e) => e.type === 'storage.objectGiBMonths')
      .reduce<Record<string, number>>((acc, e) => {
        acc[e.organizationId] = (acc[e.organizationId] ?? 0) + 1;
        return acc;
      }, {});

    expect(byOrg).toEqual({ 'org-a': 1, 'org-b': 1 });
  });

  it('without the advisory lock the unguarded check-then-meter double-records (control)', async () => {
    const nowMs = 300 * DAY_MS + 1;

    const { store, events } = makeStore({
      orgs: [{ organizationId: 'org-a', bytes: 50 * GIB }],
      nowMs,
      serialize: false, // no-op lock => the TOCTOU is exposed
    });

    await Promise.all([
      meterAllObjectStorage(store, { shadow: true, nowMs }),
      meterAllObjectStorage(store, { shadow: true, nowMs }),
    ]);

    // Both sweeps passed hasUsageEventSince before either recorded -> double charge.
    expect(events.filter((e) => e.type === 'storage.objectGiBMonths').length).toBeGreaterThan(1);
  });
});
