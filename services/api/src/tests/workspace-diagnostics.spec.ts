import { describe, expect, it } from 'vitest';
import type { DatabaseClient } from '@vibecore/database';
import {
  PREVIEW_BEACON_TTL_MS,
  readClientBeacon,
  recordLifecycleEvent,
} from '../workspace-diagnostics.js';

/**
 * These cover the two branches in workspace-diagnostics that carry real logic
 * (the rest are thin Prisma passthroughs proven live): the beacon TTL veto (#5)
 * and the illegal-lifecycle-edge drop (#6). A tiny in-memory fake stands in for
 * the Prisma client so no live DB is needed.
 */

function fakeBeaconDb(row: { status: string; reportedAt: Date } | null): DatabaseClient {
  return {
    previewReadinessBeacon: {
      findUnique: async () => row,
    },
  } as unknown as DatabaseClient;
}

function fakeLifecycleDb(lastState: string | null): {
  db: DatabaseClient;
  created: Array<{ state: string }>;
} {
  const created: Array<{ state: string }> = [];
  const db = {
    workspaceLifecycleEvent: {
      findFirst: async () => (lastState ? { state: lastState } : null),
      create: async ({ data }: { data: { state: string } }) => {
        created.push({ state: data.state });
        return data;
      },
    },
  } as unknown as DatabaseClient;
  return { db, created };
}

describe('readClientBeacon (#5 preview readiness veto)', () => {
  const now = 1_000_000_000_000;

  it('treats a missing row as neutral (none)', async () => {
    expect(await readClientBeacon(fakeBeaconDb(null), 'w', 5173, now)).toBe('none');
  });

  it('vetoes on a fresh blank beacon', async () => {
    const row = { status: 'blank', reportedAt: new Date(now - 1_000) };
    expect(await readClientBeacon(fakeBeaconDb(row), 'w', 5173, now)).toBe('blank');
  });

  it('vetoes on a fresh error beacon', async () => {
    const row = { status: 'error', reportedAt: new Date(now - 1_000) };
    expect(await readClientBeacon(fakeBeaconDb(row), 'w', 5173, now)).toBe('error');
  });

  it('ignores a blank beacon older than the TTL (app eventually mounted)', async () => {
    const row = { status: 'blank', reportedAt: new Date(now - PREVIEW_BEACON_TTL_MS - 1) };
    expect(await readClientBeacon(fakeBeaconDb(row), 'w', 5173, now)).toBe('none');
  });

  it('maps a fresh ok beacon to ok', async () => {
    const row = { status: 'ok', reportedAt: new Date(now - 1_000) };
    expect(await readClientBeacon(fakeBeaconDb(row), 'w', 5173, now)).toBe('ok');
  });
});

describe('recordLifecycleEvent (#6 append-only transition guard)', () => {
  it('records a legal edge (STARTING -> RUNNING)', async () => {
    const { db, created } = fakeLifecycleDb('STARTING');
    const recorded = await recordLifecycleEvent(db, 'w', 'RUNNING');
    expect(recorded).toBe('RUNNING');
    expect(created).toEqual([{ state: 'RUNNING' }]);
  });

  it('drops an illegal edge (RUNNING -> PENDING) without writing', async () => {
    const { db, created } = fakeLifecycleDb('RUNNING');
    const recorded = await recordLifecycleEvent(db, 'w', 'PENDING');
    expect(recorded).toBeNull();
    expect(created).toEqual([]);
  });

  it('is a no-op on a same-state repeat (RUNNING -> RUNNING)', async () => {
    const { db, created } = fakeLifecycleDb('RUNNING');
    const recorded = await recordLifecycleEvent(db, 'w', 'RUNNING');
    expect(recorded).toBeNull();
    expect(created).toEqual([]);
  });

  it('records the genesis event (empty history) unconditionally — STARTING', async () => {
    const { db, created } = fakeLifecycleDb(null);
    const recorded = await recordLifecycleEvent(db, 'w', 'STARTING');
    expect(recorded).toBe('STARTING');
    expect(created).toEqual([{ state: 'STARTING' }]);
  });

  it('records a non-STARTING genesis (warm reopen surfaces straight as RUNNING)', async () => {
    const { db, created } = fakeLifecycleDb(null);
    const recorded = await recordLifecycleEvent(db, 'w', 'RUNNING');
    expect(recorded).toBe('RUNNING');
    expect(created).toEqual([{ state: 'RUNNING' }]);
  });
});
