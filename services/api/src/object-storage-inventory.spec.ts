import { describe, expect, it } from 'vitest';

import { inventoryObjectStorage, meterAllObjectStorage } from './metering-service.js';
import type { ApiStore } from './store.js';

/*
 * AUDX-023 — "inventaire et comptage RÉELS des objets".
 *
 * `meterAllObjectStorage` documented itself as summing "the REAL stored bytes",
 * and the route as taking numbers "straight from what's on disk". Both summed
 * `ProjectStorageObject.byteLength` — base64 archives inside PostgreSQL, written
 * only by the snapshot/export path. The `/object-storage/*` routes write to GCS
 * and never touch that table.
 *
 * ⇒ every byte uploaded through a signed URL was billed to nobody and visible to
 * no quota. These tests fail on the pre-fix code, which had no GCS inventory at
 * all (`inventoryObjectStorage` did not exist, and the sweep took no storage).
 */
interface Recorded {
  organizationId: string;
  type: string;
  quantity?: number;
}

function makeStore(options: {
  projects: Array<{ id: string; organizationId: string }>;
  archiveBytesByOrg?: Array<{ organizationId: string; bytes: number }>;
}): { store: ApiStore; events: Recorded[]; usage: Map<string, { bytes: number; objectCount: number; measuredAt: Date }> } {
  const events: Recorded[] = [];
  const usage = new Map<string, { bytes: number; objectCount: number; measuredAt: Date }>();

  const store: Partial<ApiStore> = {
    aggregateStorageBytesByOrg: async () => options.archiveBytesByOrg ?? [],
    listAllProjectsForStorageInventory: async () => options.projects,
    recordProjectObjectStorageUsage: async (input) => {
      usage.set(input.projectId, { bytes: input.bytes, objectCount: input.objectCount, measuredAt: input.measuredAt });
    },
    getProjectObjectStorageUsage: async (projectId) => usage.get(projectId),
    recordUsageEvent: (async (input: Recorded) => {
      events.push(input);

      return input;
    }) as unknown as ApiStore['recordUsageEvent'],
    hasUsageEventSince: async () => false,
    withSerializedMutation: (async <T>(_key: string, fn: () => Promise<T>) => fn()) as ApiStore['withSerializedMutation'],
  };

  return { store: store as ApiStore, events, usage };
}

/** Object storage double: per-project buckets, or a throw for "no bucket". */
function fakeObjectStorage(buckets: Record<string, number[] | 'missing'>) {
  const calls: string[] = [];

  return {
    calls,
    async listAllObjects(projectId: string) {
      calls.push(projectId);
      const bucket = buckets[projectId];

      if (bucket === undefined || bucket === 'missing') {
        throw new Error('This project has no object storage bucket yet');
      }

      return {
        objects: bucket.map((size, index) => ({
          key: `o${index}`,
          size,
          updated: null,
          contentType: null,
          etag: null,
        })),
        totalBytes: bucket.reduce((sum, size) => sum + size, 0),
        pages: 1,
      };
    },
  };
}

describe('AUDX-023 real GCS inventory', () => {
  it('measures the actual bucket contents and persists them per project', async () => {
    const { store, usage } = makeStore({
      projects: [
        { id: 'p1', organizationId: 'org1' },
        { id: 'p2', organizationId: 'org1' },
      ],
    });
    const storage = fakeObjectStorage({ p1: [100, 200], p2: [50] });

    const result = await inventoryObjectStorage(store, storage, { nowMs: 1_700_000_000_000 });

    expect(result.projectsMeasured).toBe(2);
    expect(result.totalBytes).toBe(350);
    expect(result.bytesByOrg.get('org1')).toBe(350);

    // Persisted so a quota check can read a number instead of listing the bucket.
    expect(usage.get('p1')).toMatchObject({ bytes: 300, objectCount: 2 });
    expect(usage.get('p2')).toMatchObject({ bytes: 50, objectCount: 1 });
  });

  it('counts an unreadable bucket as SKIPPED and records nothing for it', async () => {
    const { store, usage } = makeStore({
      projects: [
        { id: 'p1', organizationId: 'org1' },
        { id: 'gone', organizationId: 'org1' },
      ],
    });
    const storage = fakeObjectStorage({ p1: [10], gone: 'missing' });

    const result = await inventoryObjectStorage(store, storage, { nowMs: 1 });

    expect(result.projectsMeasured).toBe(1);
    expect(result.projectsSkipped).toBe(1);

    /*
     * Absence of a bucket is NOT a measurement of zero. Writing 0 would let a
     * later quota check treat "never provisioned" as "measured empty" — the same
     * class of error as the defect this fixes.
     */
    expect(usage.has('gone')).toBe(false);
    expect(result.totalBytes).toBe(10);
  });

  it('meters an org that holds ONLY GCS objects and no PostgreSQL archive row', async () => {
    /*
     * The decisive case. Pre-fix the sweep iterated `aggregateStorageBytesByOrg`
     * alone, so an org with no archive row was never visited at all — which is
     * precisely how signed-URL uploads went unbilled.
     */
    const { store, events } = makeStore({
      projects: [{ id: 'p1', organizationId: 'org-gcs-only' }],
      archiveBytesByOrg: [],
    });
    const storage = fakeObjectStorage({ p1: [1024 * 1024 * 1024] });

    const result = await meterAllObjectStorage(store, {
      shadow: true,
      nowMs: 1_700_000_000_000,
      objectStorage: storage,
    });

    expect(result.orgsMetered).toBe(1);
    expect(result.gcsBytes).toBe(1024 * 1024 * 1024);
    expect(events.some((event) => event.organizationId === 'org-gcs-only')).toBe(true);
  });

  it('adds GCS bytes to the PostgreSQL archive bytes rather than replacing them', async () => {
    const { store } = makeStore({
      projects: [{ id: 'p1', organizationId: 'org1' }],
      archiveBytesByOrg: [{ organizationId: 'org1', bytes: 500 }],
    });

    const result = await meterAllObjectStorage(store, {
      shadow: true,
      nowMs: 1_700_000_000_000,
      objectStorage: fakeObjectStorage({ p1: [700] }),
    });

    // Both are real stored bytes; neither is a substitute for the other.
    expect(result.totalBytes).toBe(1_200);
  });

  it('behaves byte-identically to the old sweep when no object storage is passed', async () => {
    /*
     * ANTI-REGRESSION GUARD, GREEN ON BOTH SIDES — stated as such. The inventory
     * is opt-in because switching it on starts counting bytes that were never
     * counted, which raises metered storage: a pricing decision (D-03), not an
     * engineering one. This pins that the default path did not move.
     */
    const { store } = makeStore({
      projects: [{ id: 'p1', organizationId: 'org1' }],
      archiveBytesByOrg: [{ organizationId: 'org1', bytes: 500 }],
    });

    const result = await meterAllObjectStorage(store, { shadow: true, nowMs: 1_700_000_000_000 });

    expect(result.totalBytes).toBe(500);
    expect(result.gcsBytes).toBeUndefined();
  });
});
