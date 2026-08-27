import { BUILTIN_RATE_CARD } from '@vibecore/billing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { meterServerDeploymentRuntime } from './deploy-runtime-metering.js';
import type { ApiStore, DeploymentRecord } from './store.js';

const NOW = Date.parse('2026-07-16T12:00:00.000Z');

function deployment(overrides: Partial<DeploymentRecord> = {}): DeploymentRecord {
  return {
    id: 'dep1',
    projectId: 'proj1',
    provider: 'server',
    environment: 'preview',
    status: 'READY',
    machineSize: 'dedicated-1',
    logs: [],
    metadata: { serverDeploy: { host: 'd-dep1.preview.e-code.ai' } },
    finishedAt: new Date(NOW - 600_000).toISOString(), // READY 10 min ago
    createdAt: new Date(NOW - 700_000).toISOString(),
    ...overrides,
  } as DeploymentRecord;
}

function makeStore(rows: DeploymentRecord[]) {
  const state = new Map(rows.map((row) => [row.id, row]));
  const usageEvents: Array<Record<string, unknown>> = [];

  const store = {
    listActiveServerDeployments: vi.fn(async () => [...state.values()]),
    getDeployment: vi.fn(async (_projectId: string, id: string) => state.get(id)),
    getProject: vi.fn(async () => ({ id: 'proj1', organizationId: 'org1' })),
    withSerializedMutation: vi.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
    updateDeployment: vi.fn(async (_projectId: string, id: string, input: Partial<DeploymentRecord>) => {
      const current = state.get(id)!;
      const next = { ...current, ...input } as DeploymentRecord;
      state.set(id, next);

      return next;
    }),
    recordUsageEvent: vi.fn(async (event: Record<string, unknown>) => {
      usageEvents.push(event);
    }),

    // charge() dependencies (shadow mode exercises none of the debit path).
    getOrganizationCreditState: vi.fn(async () => undefined),
  } as unknown as ApiStore;

  return { store, usageEvents, state };
}

describe('meterServerDeploymentRuntime', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bills observed active time at the machine size and stamps the watermark', async () => {
    const { store, usageEvents, state } = makeStore([deployment()]);

    const result = await meterServerDeploymentRuntime(store, {
      card: BUILTIN_RATE_CARD,
      getLiveStatus: vi.fn(async () => ({ exists: true, replicas: 1, readyReplicas: 1 })),
      nowMs: NOW,
      shadow: true,
    });

    // dedicated-1 = 26 u/s × 600s = 15600 units.
    expect(result).toMatchObject({ scanned: 1, billed: 1, slept: 0, computeUnits: 15_600 });
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({ organizationId: 'org1', type: 'deployment.compute' });
    expect((usageEvents[0].metadata as Record<string, unknown>).machineSize).toBe('dedicated-1');
    expect((usageEvents[0].metadata as Record<string, unknown>).rateCardVersion).toBe(BUILTIN_RATE_CARD.version);

    const meta = state.get('dep1')!.metadata as { serverDeploy: { runtimeMeteredAt: string } };
    expect(meta.serverDeploy.runtimeMeteredAt).toBe(new Date(NOW).toISOString());
  });

  it('never bills a sleeping app (replicas=0) but advances its watermark', async () => {
    const { store, usageEvents, state } = makeStore([deployment()]);

    const result = await meterServerDeploymentRuntime(store, {
      card: BUILTIN_RATE_CARD,
      getLiveStatus: vi.fn(async () => ({ exists: true, replicas: 0, readyReplicas: 0 })),
      nowMs: NOW,
      shadow: true,
    });

    expect(result).toMatchObject({ billed: 0, slept: 1, computeUnits: 0 });
    expect(usageEvents).toHaveLength(0);

    const meta = state.get('dep1')!.metadata as { serverDeploy: { runtimeMeteredAt: string } };
    expect(meta.serverDeploy.runtimeMeteredAt).toBe(new Date(NOW).toISOString());
  });

  it('never sends Reserved VM through the Autoscale usage meter', async () => {
    const { store, usageEvents, state } = makeStore([deployment({ runtimeKind: 'reserved-vm' })]);
    const getLiveStatus = vi.fn(async () => ({ exists: true, replicas: 1, readyReplicas: 1, requestCount: 42 }));

    const result = await meterServerDeploymentRuntime(store, {
      card: BUILTIN_RATE_CARD,
      getLiveStatus,
      nowMs: NOW,
      shadow: true,
    });

    expect(result).toMatchObject({ scanned: 1, billed: 0, slept: 0, computeUnits: 0, requests: 0 });
    expect(getLiveStatus).not.toHaveBeenCalled();
    expect(usageEvents).toHaveLength(0);
    expect(state.get('dep1')!.metadata).toEqual({ serverDeploy: { host: 'd-dep1.preview.e-code.ai' } });
  });

  it('caps a single window (no invented history after a sweep outage)', async () => {
    const { store, usageEvents } = makeStore([
      deployment({ finishedAt: new Date(NOW - 6 * 3600_000).toISOString() }), // 6h ago
    ]);

    const result = await meterServerDeploymentRuntime(store, {
      card: BUILTIN_RATE_CARD,
      getLiveStatus: vi.fn(async () => ({ exists: true, replicas: 1, readyReplicas: 1 })),
      nowMs: NOW,
      shadow: true,
    });

    // Cap = 30 min → dedicated-1 26 u/s × 1800s = 46800, not 6h worth.
    expect(result.computeUnits).toBe(46_800);
    expect(usageEvents).toHaveLength(1);
  });

  it('skips sub-30s windows (double tick)', async () => {
    const { store, usageEvents } = makeStore([deployment({ finishedAt: new Date(NOW - 10_000).toISOString() })]);

    const result = await meterServerDeploymentRuntime(store, {
      card: BUILTIN_RATE_CARD,
      getLiveStatus: vi.fn(async () => ({ exists: true, replicas: 1, readyReplicas: 1 })),
      nowMs: NOW,
      shadow: true,
    });

    expect(result.billed).toBe(0);
    expect(usageEvents).toHaveLength(0);
  });

  it('a torn-down deployment stops the clock without billing', async () => {
    const { store, usageEvents } = makeStore([deployment()]);

    const result = await meterServerDeploymentRuntime(store, {
      card: BUILTIN_RATE_CARD,
      getLiveStatus: vi.fn(async () => undefined),
      nowMs: NOW,
      shadow: true,
    });

    expect(result.billed).toBe(0);
    expect(usageEvents).toHaveLength(0);
  });

  it('one failing row never blocks the rest of the sweep', async () => {
    const bad = deployment({ id: 'bad' });
    const good = deployment({ id: 'good' });
    const { store, usageEvents } = makeStore([bad, good]);

    const getLiveStatus = vi.fn(async (id: string) => {
      if (id === 'bad') {
        throw new Error('manager unreachable');
      }

      return { exists: true, replicas: 1, readyReplicas: 1 };
    });

    const result = await meterServerDeploymentRuntime(store, {
      card: BUILTIN_RATE_CARD,
      getLiveStatus,
      nowMs: NOW,
      shadow: true,
    });

    expect(result.billed).toBe(1);
    expect(usageEvents).toHaveLength(1);
  });

  it('bills the request DELTA above the watermark and advances it', async () => {
    const row = deployment({
      metadata: { serverDeploy: { host: 'd-dep1.preview.e-code.ai', meteredRequests: 100 } },
    });

    const { store, usageEvents, state } = makeStore([row]);

    const result = await meterServerDeploymentRuntime(store, {
      card: BUILTIN_RATE_CARD,
      getLiveStatus: vi.fn(async () => ({ exists: true, replicas: 1, readyReplicas: 1, requestCount: 350 })),
      nowMs: NOW,
      shadow: true,
    });

    expect(result.requests).toBe(250);
    expect((usageEvents[0].metadata as Record<string, unknown>).requests).toBe(250);

    const meta = state.get('dep1')!.metadata as { serverDeploy: { meteredRequests: number } };
    expect(meta.serverDeploy.meteredRequests).toBe(350);
  });

  it('a reset counter (Deployment recreated) never bills negative', async () => {
    const row = deployment({
      metadata: { serverDeploy: { host: 'd-dep1.preview.e-code.ai', meteredRequests: 5000 } },
    });

    const { store, usageEvents } = makeStore([row]);

    const result = await meterServerDeploymentRuntime(store, {
      card: BUILTIN_RATE_CARD,
      getLiveStatus: vi.fn(async () => ({ exists: true, replicas: 1, readyReplicas: 1, requestCount: 12 })),
      nowMs: NOW,
      shadow: true,
    });

    expect(result.requests).toBe(0);
    expect((usageEvents[0].metadata as Record<string, unknown>).requests).toBe(0);
  });

  it('multiplies by live replicas (rolling surge bills what actually ran)', async () => {
    const { store } = makeStore([deployment()]);

    const result = await meterServerDeploymentRuntime(store, {
      card: BUILTIN_RATE_CARD,
      getLiveStatus: vi.fn(async () => ({ exists: true, replicas: 2, readyReplicas: 2 })),
      nowMs: NOW,
      shadow: true,
    });

    expect(result.computeUnits).toBe(31_200); // 15600 × 2
  });
});
