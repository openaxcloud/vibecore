import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import type { WorkspaceEvent } from '@vibecore/workspace-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JsonWorkspaceStore,
  WorkspaceManager,
  detectPodTerminalFailure,
  resolveAgentBaseUrl,
  type EventBus,
  type WorkspaceRecord,
  type WorkspaceStore,
} from './manager.js';

class TestWorkspaceK8sClient implements WorkspaceK8sClient {
  readonly objects = new Map<string, K8sObject>();
  readonly events: string[] = [];

  async apply(object: K8sObject) {
    this.objects.set(`${object.metadata.namespace ?? 'default'}:${object.kind}:${object.metadata.name}`, object);
    this.events.push(`apply:${object.kind}:${object.metadata.name}`);

    return object;
  }

  async delete(kind: string, namespace: string, name: string) {
    this.objects.delete(`${namespace}:${kind}:${name}`);
    this.events.push(`delete:${kind}:${name}`);
  }

  async get(kind: string, namespace: string, name: string) {
    return this.objects.get(`${namespace}:${kind}:${name}`);
  }

  async getPod(namespace: string, name: string) {
    const pod = this.objects.get(`${namespace}:Pod:${name}`);

    if (!pod) {
      return undefined;
    }

    return {
      ...pod,
      status: { conditions: [{ type: 'Ready', status: 'True' }] },
    } as K8sObject;
  }

  async *streamPodLogs(namespace: string, name: string) {
    yield `logs:${namespace}:${name}:ready`;
  }
}

class TestWorkspaceStore implements WorkspaceStore {
  readonly workspaces = new Map<string, WorkspaceRecord>();

  async create(input: Omit<WorkspaceRecord, 'createdAt' | 'lastActiveAt'>) {
    const now = new Date().toISOString();
    const record = { ...input, createdAt: now, lastActiveAt: now };
    this.workspaces.set(record.id, record);

    return record;
  }

  async update(workspaceId: string, patch: Partial<WorkspaceRecord>) {
    const existing = this.workspaces.get(workspaceId);

    if (!existing) {
      throw new Error('Workspace not found');
    }

    const updated = { ...existing, ...patch };
    this.workspaces.set(workspaceId, updated);

    return updated;
  }

  async get(workspaceId: string) {
    return this.workspaces.get(workspaceId);
  }

  async list() {
    return [...this.workspaces.values()];
  }

  async listNonDeleted() {
    return [...this.workspaces.values()].filter((workspace) => workspace.status !== 'DELETED');
  }

  async claimMeterWindow(workspaceId: string, expected: string | undefined, next: string) {
    const existing = this.workspaces.get(workspaceId);

    if (!existing || (existing.lastMeteredAt ?? undefined) !== (expected ?? undefined)) {
      return false;
    }

    this.workspaces.set(workspaceId, { ...existing, lastMeteredAt: next });

    return true;
  }
}

/*
 * Mirrors the Prisma store, whose create() rejects a duplicate id with a
 * unique-constraint violation. The plain TestWorkspaceStore (like the JSON
 * store) overwrites on create, which silently masked the reopen regression in
 * production — only this strict store reproduces it.
 */
class StrictTestWorkspaceStore extends TestWorkspaceStore {
  override async create(input: Omit<WorkspaceRecord, 'createdAt' | 'lastActiveAt'>) {
    if (this.workspaces.has(input.id)) {
      throw Object.assign(new Error('Unique constraint failed on the fields: (`id`)'), { code: 'P2002' });
    }

    return super.create(input);
  }
}

class TestEventBus implements EventBus {
  readonly events: WorkspaceEvent[] = [];

  async publish(event: WorkspaceEvent) {
    this.events.push(event);
  }
}

const input = {
  namespace: 'workspaces',
  orgId: 'org_1',
  projectId: 'project_1',
  workspaceId: 'workspace_1',
  image: 'agent:test',
  plan: 'pro' as const,
  env: { NODE_ENV: 'production' },
  allowedSecretKeys: ['NPM_TOKEN'],
  resourceLimits: { cpuMillicores: 1500, ramMb: 3072, storageGb: 30 },
};

describe('WorkspaceManager', () => {
  it('creates PVC, agent secret, Pod and Service with lifecycle events', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const events = new TestEventBus();
    const manager = new WorkspaceManager(new TestWorkspaceStore(), k8s, events, 'test-workspace-agent-secret');
    const workspace = await manager.startWorkspace(input);

    expect(workspace.status).toBe('RUNNING');
    expect(k8s.events).toEqual(
      expect.arrayContaining([
        'apply:PersistentVolumeClaim:pvc-workspace_1',
        'apply:Secret:agent-token-workspace_1',
        'apply:Pod:workspace-workspace_1',
        'apply:Service:workspace-workspace_1',
      ]),
    );
    expect(
      (k8s.objects.get('workspaces:PersistentVolumeClaim:pvc-workspace_1')?.spec?.resources as any).requests.storage,
    ).toBe('30Gi');
    expect(events.events.map((event) => event.type)).toContain('workspace.running');
  });

  it('injects decrypted secret values into the agent Secret and references them as optional pod env', async () => {
    const k8s = new TestWorkspaceK8sClient();

    const manager = new WorkspaceManager(
      new TestWorkspaceStore(),
      k8s,
      new TestEventBus(),
      'test-workspace-agent-secret',
    );
    await manager.startWorkspace({ ...input, allowedSecrets: { NPM_TOKEN: 'tok_secret_value' } });

    const secret = k8s.objects.get('workspaces:Secret:agent-token-workspace_1') as any;
    expect(secret.stringData).toMatchObject({
      tokenSecret: 'test-workspace-agent-secret',
      NPM_TOKEN: 'tok_secret_value',
    });

    const pod = k8s.objects.get('workspaces:Pod:workspace-workspace_1') as any;
    const npmEnv = pod.spec.containers[0].env.find((entry: any) => entry.name === 'NPM_TOKEN');
    expect(npmEnv.valueFrom.secretKeyRef).toMatchObject({
      name: 'agent-token-workspace_1',
      key: 'NPM_TOKEN',
      optional: true,
    });
  });

  it('stops, restarts and fully deletes workspace runtime resources', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');
    await manager.startWorkspace(input);
    expect((await manager.stopWorkspace('workspaces', input.workspaceId)).status).toBe('STOPPED');
    expect((await manager.restartWorkspace(input)).status).toBe('RUNNING');
    expect((await manager.deleteWorkspace('workspaces', input.workspaceId)).status).toBe('DELETED');
    expect(k8s.events).toEqual(
      expect.arrayContaining([
        'delete:Service:workspace-workspace_1',
        'delete:Pod:workspace-workspace_1',
        'delete:Secret:agent-token-workspace_1',
        'delete:PersistentVolumeClaim:pvc-workspace_1',
      ]),
    );
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(false);
    expect(k8s.objects.has('workspaces:Secret:agent-token-workspace_1')).toBe(false);
  });

  it('re-provisions a fresh pod when reopening a garbage-collected workspace (deterministic id is reused)', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new StrictTestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    expect((await manager.startWorkspace(input)).status).toBe('RUNNING');

    /*
     * Simulate workspace-gc reaping the idle workspace: the pod/Service/PVC are
     * deleted but the DB row survives with status DELETED.
     */
    await manager.deleteWorkspace('workspaces', input.workspaceId);
    expect((await store.get(input.workspaceId))?.status).toBe('DELETED');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(false);

    /*
     * Reopening the project re-enters startWorkspace with the same id. Before
     * the fix this threw P2002 (create() on an existing row) and the workspace
     * could never come back; now it reuses the row and re-applies resources.
     */
    const reopened = await manager.startWorkspace(input);
    expect(reopened.status).toBe('RUNNING');
    expect(reopened.error).toBeUndefined();
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(true);
    expect(k8s.objects.has('workspaces:Service:workspace-workspace_1')).toBe(true);
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(true);
  });

  it('restarts a stopped workspace under a Prisma-style store that rejects duplicate creates', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new StrictTestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);
    expect((await manager.stopWorkspace('workspaces', input.workspaceId)).status).toBe('STOPPED');
    expect((await manager.restartWorkspace(input)).status).toBe('RUNNING');
  });

  it('garbage-collects a FAILED workspace whose Pod/PVC leaked', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);

    /*
     * Simulate a provisioning failure that left the runtime resources behind:
     * before the fix, GC only walked RUNNING→STOPPED→DELETED and never reaped
     * FAILED rows, so the Pod/PVC sat leaked (Pending pod spinning autoscaler).
     */
    await store.update(input.workspaceId, {
      status: 'FAILED',
      lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    await manager.garbageCollect('workspaces', 5 * 60 * 1000, 30 * 60 * 1000);

    expect((await store.get(input.workspaceId))?.status).toBe('DELETED');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(false);
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(false);
  });

  it('meters the active runtime window to the api when GC stops a RUNNING workspace (P4)', async () => {
    const prevFetch = globalThis.fetch;
    const prevApi = process.env.API_URL;
    const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.API_URL = 'http://api.internal';
    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret';

    const calls: Array<{ url: string; body: any; auth?: string }> = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({
        url: String(url),
        body: JSON.parse(init?.body ?? '{}'),
        auth: init?.headers?.authorization,
      });
      return { ok: true, body: { cancel: async () => {} } } as any;
    }) as any;

    try {
      const k8s = new TestWorkspaceK8sClient();
      const store = new TestWorkspaceStore();
      const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

      await manager.startWorkspace(input);

      const meteredFrom = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const activeUntil = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await store.update(input.workspaceId, {
        status: 'RUNNING',
        lastMeteredAt: meteredFrom,
        lastActiveAt: activeUntil,
      });

      await manager.garbageCollect('workspaces', 5 * 60 * 1000, 30 * 60 * 1000);

      const meterCall = calls.find((call) => call.url.endsWith('/internal/metering'));
      expect(meterCall).toBeTruthy();
      expect(meterCall!.auth).toBe('Bearer internal-secret');
      expect(meterCall!.body.kind).toBe('compute');
      expect(meterCall!.body.organizationId).toBe('org_1');
      expect(meterCall!.body.projectId).toBe('project_1');

      // plan 'pro' → 500m / 1Gi reserved compute
      expect(meterCall!.body.cpuMillicores).toBe(500);
      expect(meterCall!.body.ramMb).toBe(1024);

      // metered window = 2h marker → 1h lastActiveAt = ~3600s
      expect(meterCall!.body.seconds).toBe(3600);

      // The marker advanced to lastActiveAt so the next stop won't re-meter it.
      expect((await store.get(input.workspaceId))?.lastMeteredAt).toBe(activeUntil);
    } finally {
      globalThis.fetch = prevFetch;

      if (prevApi === undefined) {
        delete process.env.API_URL;
      } else {
        process.env.API_URL = prevApi;
      }

      if (prevSecret === undefined) {
        delete process.env.INTERNAL_API_SHARED_SECRET;
      } else {
        process.env.INTERNAL_API_SHARED_SECRET = prevSecret;
      }
    }
  });

  it('meters the active runtime window on an explicit user stop (not just GC)', async () => {
    const prevFetch = globalThis.fetch;
    const prevApi = process.env.API_URL;
    const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.API_URL = 'http://api.internal';
    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret';

    const calls: Array<{ url: string; body: any }> = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
      return { ok: true, body: { cancel: async () => {} } } as any;
    }) as any;

    try {
      const k8s = new TestWorkspaceK8sClient();
      const store = new TestWorkspaceStore();
      const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

      await manager.startWorkspace(input);

      const meteredFrom = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const activeUntil = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await store.update(input.workspaceId, {
        status: 'RUNNING',
        lastMeteredAt: meteredFrom,
        lastActiveAt: activeUntil,
      });

      /*
       * The user-facing api stop route (POST /workspaces/:id/stop) calls this with
       * no guard. Before the fix it flipped the row to STOPPED without ever
       * metering, silently dropping the active window from billing.
       */
      const stopped = await manager.stopWorkspace('workspaces', input.workspaceId);
      expect(stopped.status).toBe('STOPPED');

      const meterCall = calls.find((call) => call.url.endsWith('/internal/metering'));
      expect(meterCall).toBeTruthy();

      // 2h marker → 1h lastActiveAt = ~3600s of reserved 'pro' compute (500m/1Gi).
      expect(meterCall!.body.seconds).toBe(3600);
      expect(meterCall!.body.cpuMillicores).toBe(500);
      expect(meterCall!.body.ramMb).toBe(1024);
      expect((await store.get(input.workspaceId))?.lastMeteredAt).toBe(activeUntil);
    } finally {
      globalThis.fetch = prevFetch;

      if (prevApi === undefined) {
        delete process.env.API_URL;
      } else {
        process.env.API_URL = prevApi;
      }

      if (prevSecret === undefined) {
        delete process.env.INTERNAL_API_SHARED_SECRET;
      } else {
        process.env.INTERNAL_API_SHARED_SECRET = prevSecret;
      }
    }
  });

  it('meters the un-metered RUNNING window when a live workspace is reopened (no marker jump)', async () => {
    const prevFetch = globalThis.fetch;
    const prevApi = process.env.API_URL;
    const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.API_URL = 'http://api.internal';
    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret';

    const calls: Array<{ url: string; body: any }> = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      const parsed = String(url);

      if (parsed.endsWith('/internal/metering')) {
        calls.push({ url: parsed, body: JSON.parse(init?.body ?? '{}') });
      }

      return { ok: true, body: { cancel: async () => {} } } as any;
    }) as any;

    try {
      const k8s = new TestWorkspaceK8sClient();
      const store = new TestWorkspaceStore();
      const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

      await manager.startWorkspace(input);

      /*
       * A workspace that has been RUNNING and accumulating un-metered compute: the
       * marker sits 2h back, lastActiveAt 1h back (a long-open IDE). The api always
       * re-POSTs /workspaces/start on reopen even though it is still RUNNING.
       */
      const meteredFrom = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const activeUntil = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await store.update(input.workspaceId, {
        status: 'RUNNING',
        lastMeteredAt: meteredFrom,
        lastActiveAt: activeUntil,
      });

      // Reopen the live RUNNING workspace.
      const reopened = await manager.startWorkspace(input);
      expect(reopened.status).toBe('RUNNING');

      /*
       * The prior un-metered 2h→1h window (~3600s) must be billed BEFORE the marker
       * is reset to now — otherwise that compute is silently lost.
       */
      const meterCall = calls.find((call) => call.url.endsWith('/internal/metering'));
      expect(meterCall).toBeTruthy();
      expect(meterCall!.body.seconds).toBe(3600);

      /*
       * And the marker is now freshly stamped at ~now so the STOPPED-gap reasoning
       * still holds for the next stop.
       */
      const markerAge = Date.now() - new Date((await store.get(input.workspaceId))!.lastMeteredAt!).getTime();
      expect(markerAge).toBeLessThan(60_000);
    } finally {
      globalThis.fetch = prevFetch;

      if (prevApi === undefined) {
        delete process.env.API_URL;
      } else {
        process.env.API_URL = prevApi;
      }

      if (prevSecret === undefined) {
        delete process.env.INTERNAL_API_SHARED_SECRET;
      } else {
        process.env.INTERNAL_API_SHARED_SECRET = prevSecret;
      }
    }
  });

  it('does not re-meter a STOPPED→start reopen (no live window to capture)', async () => {
    const prevFetch = globalThis.fetch;
    const prevApi = process.env.API_URL;
    process.env.API_URL = 'http://api.internal';

    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: any) => {
      calls.push(String(url));
      return { ok: true, body: { cancel: async () => {} } } as any;
    }) as any;

    try {
      const k8s = new TestWorkspaceK8sClient();
      const store = new TestWorkspaceStore();
      const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

      await manager.startWorkspace(input);

      /*
       * stopWorkspace meters once (its own window), advancing the marker to
       * lastActiveAt; reopening a STOPPED row must NOT meter again — the existing
       * RUNNING-only guard skips the pre-reset meter.
       */
      await manager.stopWorkspace('workspaces', input.workspaceId);

      const meterCountAfterStop = calls.filter((url) => url.endsWith('/internal/metering')).length;

      await manager.startWorkspace(input);

      const meterCountAfterReopen = calls.filter((url) => url.endsWith('/internal/metering')).length;

      expect(meterCountAfterReopen).toBe(meterCountAfterStop);
    } finally {
      globalThis.fetch = prevFetch;

      if (prevApi === undefined) {
        delete process.env.API_URL;
      } else {
        process.env.API_URL = prevApi;
      }
    }
  });

  it('claimMeterWindow is a cross-replica compare-and-set — only one claim wins', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');
    await manager.startWorkspace(input);

    const t0 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await store.update(input.workspaceId, { lastMeteredAt: t0 });

    const t1 = new Date().toISOString();

    /*
     * Two manager replicas read the SAME lastMeteredAt (t0) and both try to claim
     * the stop window. The CAS must let exactly one through.
     */
    const replicaA = await store.claimMeterWindow(input.workspaceId, t0, t1);
    const replicaB = await store.claimMeterWindow(input.workspaceId, t0, t1);

    expect(replicaA).toBe(true); // first replica claims → it meters
    expect(replicaB).toBe(false); // second sees the advanced marker → loses → skips metering
    expect((await store.get(input.workspaceId))?.lastMeteredAt).toBe(t1);
  });

  it('does not delete a workspace re-provisioned since the GC snapshot (TOCTOU)', async () => {
    const k8s = new TestWorkspaceK8sClient();

    /*
     * list() yields the stale STOPPED+idle snapshot the GC pass started from,
     * but get() returns the live row that a concurrent startWorkspace just
     * flipped to STARTING. GC must re-read and skip — deleting here would pull
     * the PVC out from under the freshly created pod.
     */
    class RaceStore extends TestWorkspaceStore {
      override async list() {
        return [...this.workspaces.values()].map((workspace) => ({
          ...workspace,
          status: 'STOPPED' as const,
          lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        }));
      }
    }

    const store = new RaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);
    await store.update(input.workspaceId, { status: 'STARTING', lastActiveAt: new Date().toISOString() });

    await manager.garbageCollect('workspaces', 5 * 60 * 1000, 30 * 60 * 1000);

    expect((await store.get(input.workspaceId))?.status).toBe('STARTING');
    expect(k8s.objects.has('workspaces:PersistentVolumeClaim:pvc-workspace_1')).toBe(true);
    expect(k8s.events).not.toContain('delete:PersistentVolumeClaim:pvc-workspace_1');
  });

  it('touch() bumps lastActiveAt for a RUNNING workspace and spares it from the GC', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);

    /*
     * Simulate a session that has been open past the inactivity window with the
     * start-time stamp never refreshed — exactly the state that used to get reaped.
     */
    await store.update(input.workspaceId, { lastActiveAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });

    const touched = await manager.touch(input.workspaceId);
    expect(touched?.status).toBe('RUNNING');
    expect(Date.now() - new Date((await store.get(input.workspaceId))!.lastActiveAt).getTime()).toBeLessThan(5_000);

    // The reaper must now leave the freshly-touched live workspace alone.
    await manager.garbageCollect('workspaces', 5 * 60 * 1000, 30 * 60 * 1000);
    expect((await store.get(input.workspaceId))?.status).toBe('RUNNING');
  });

  it('throttles touch() writes within the activity window', async () => {
    const k8s = new TestWorkspaceK8sClient();

    let writes = 0;

    class CountingStore extends TestWorkspaceStore {
      override async update(workspaceId: string, patch: Partial<WorkspaceRecord>) {
        writes += 1;
        return super.update(workspaceId, patch);
      }
    }

    const store = new CountingStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input); // start performs its own updates
    writes = 0;

    expect(await manager.touch(input.workspaceId)).toBeDefined(); // first touch persists
    expect(await manager.touch(input.workspaceId)).toBeUndefined(); // throttled, no write
    expect(await manager.touch(input.workspaceId)).toBeUndefined();
    expect(writes).toBe(1);
  });

  it('does not bump or resurrect a STOPPED workspace via touch()', async () => {
    const k8s = new TestWorkspaceK8sClient();
    const store = new TestWorkspaceStore();
    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');

    await manager.startWorkspace(input);
    await manager.stopWorkspace('workspaces', input.workspaceId);

    const stoppedAt = (await store.get(input.workspaceId))!.lastActiveAt;

    const result = await manager.touch(input.workspaceId);
    expect(result?.status).toBe('STOPPED');

    // lastActiveAt must stay frozen so the delete-window reaper can still collect it.
    expect((await store.get(input.workspaceId))!.lastActiveAt).toBe(stoppedAt);
  });
});

describe('detectPodTerminalFailure — Unschedulable handling', () => {
  const now = Date.parse('2026-06-22T12:00:00.000Z');
  const graceMs = 30_000;

  function unschedulablePod(lastTransitionTime: string, message = '0/3 nodes are available') {
    return {
      status: {
        phase: 'Pending',
        conditions: [
          {
            type: 'PodScheduled',
            status: 'False',
            reason: 'Unschedulable',
            message,
            lastTransitionTime,
          },
        ],
      },
    };
  }

  it('fast-fails an Unschedulable pod once the grace window has elapsed', () => {
    const transitionedAt = new Date(now - graceMs - 1_000).toISOString();
    const failure = detectPodTerminalFailure(unschedulablePod(transitionedAt), now, graceMs);

    expect(failure).not.toBeNull();
    expect(failure?.code).toBe('WORKSPACE_POD_UNSCHEDULABLE');
    expect(failure?.message).toContain('no capacity available');
    expect(failure?.message).toContain('0/3 nodes are available');
  });

  it('does NOT fail an Unschedulable pod still inside the grace window (autoscaler scale-up)', () => {
    const transitionedAt = new Date(now - 5_000).toISOString();

    expect(detectPodTerminalFailure(unschedulablePod(transitionedAt), now, graceMs)).toBeNull();
  });

  it('keeps waiting when the Unschedulable condition has no parseable lastTransitionTime', () => {
    const pod = unschedulablePod('not-a-date');

    expect(detectPodTerminalFailure(pod, now, graceMs)).toBeNull();
  });

  it('ignores a successfully-scheduled pod (PodScheduled=True)', () => {
    const pod = {
      status: {
        phase: 'Pending',
        conditions: [{ type: 'PodScheduled', status: 'True' }],
      },
    };

    expect(detectPodTerminalFailure(pod, now, graceMs)).toBeNull();
  });

  it('still detects pre-existing terminal states (phase=Failed)', () => {
    const failure = detectPodTerminalFailure({ status: { phase: 'Failed' } }, now, graceMs);

    expect(failure?.code).toBe('WORKSPACE_POD_FAILED');
  });
});

describe('resolveAgentBaseUrl — start-gate URL parity with app.ts agentBaseUrl', () => {
  const KEYS = ['WORKSPACE_AGENT_URL_TEMPLATE', 'WORKSPACE_AGENT_BASE_URL'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('defaults to the per-workspace Service DNS when no override is set', () => {
    expect(resolveAgentBaseUrl('ws-1', 'workspaces')).toBe('http://workspace-ws-1.workspaces.svc.cluster.local:8080');
  });

  it('honors WORKSPACE_AGENT_URL_TEMPLATE with placeholders and trims trailing slashes', () => {
    process.env.WORKSPACE_AGENT_URL_TEMPLATE = 'http://{workspaceId}.{namespace}.example/agent/';

    expect(resolveAgentBaseUrl('ws-2', 'ns-a')).toBe('http://ws-2.ns-a.example/agent');
  });

  /*
   * Regression: the gate previously read ONLY WORKSPACE_AGENT_URL_TEMPLATE, so a
   * deployment configuring WORKSPACE_AGENT_BASE_URL probed the wrong default svc
   * address — blocking ~45s of every cold start or passing against a stale route.
   */
  it('honors the WORKSPACE_AGENT_BASE_URL alias (mirrors app.ts agentBaseUrl)', () => {
    process.env.WORKSPACE_AGENT_BASE_URL = 'http://{workspaceId}.{namespace}.example:9090';

    expect(resolveAgentBaseUrl('ws-3', 'ns-b')).toBe('http://ws-3.ns-b.example:9090');
  });

  it('prefers WORKSPACE_AGENT_URL_TEMPLATE over WORKSPACE_AGENT_BASE_URL when both are set', () => {
    process.env.WORKSPACE_AGENT_URL_TEMPLATE = 'http://template-{workspaceId}.svc:8080';
    process.env.WORKSPACE_AGENT_BASE_URL = 'http://base-{workspaceId}.svc:8080';

    expect(resolveAgentBaseUrl('ws-4', 'ns-c')).toBe('http://template-ws-4.svc:8080');
  });
});

describe('JsonWorkspaceStore corrupted registry handling', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ws-store-'));
    filePath = join(dir, 'workspaces.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const makeRecord = (id: string): WorkspaceRecord => ({
    id,
    orgId: 'org-a',
    projectId: 'proj-a',
    plan: 'free',
    status: 'RUNNING',
    pvcName: `${id}-pvc`,
    podName: `${id}-pod`,
    serviceName: `${id}-svc`,
    agentTokenSecretName: `${id}-secret`,
    createdAt: '2026-07-03T00:00:00.000Z',
    lastActiveAt: '2026-07-03T00:00:00.000Z',
  });

  it('reads a well-formed registry', async () => {
    await writeFile(filePath, JSON.stringify([makeRecord('ws-keep')]));
    const store = new JsonWorkspaceStore(filePath);

    expect(await store.get('ws-keep')).toMatchObject({ id: 'ws-keep' });
  });

  it('throws an actionable error on invalid JSON instead of a bare SyntaxError', async () => {
    await writeFile(filePath, '[{"id":"ws-keep"'); // truncated mid-write

    const store = new JsonWorkspaceStore(filePath);

    await expect(store.list()).rejects.toThrow(/corrupted \(invalid JSON\)/);
  });

  it('throws on valid-but-non-array JSON (would otherwise crash .map)', async () => {
    await writeFile(filePath, '{}');

    const store = new JsonWorkspaceStore(filePath);

    await expect(store.list()).rejects.toThrow(/expected a JSON array/);
  });

  it('does NOT overwrite a corrupted registry on a failed read-modify-write', async () => {
    const corrupt = '[{"id":"ws-keep"'; // truncated
    await writeFile(filePath, corrupt);

    const store = new JsonWorkspaceStore(filePath);

    const { createdAt: _c, lastActiveAt: _l, ...newInput } = makeRecord('ws-new');

    await expect(store.create(newInput)).rejects.toThrow(/corrupted/);

    // The corrupted file must be left untouched — create() must not clobber it
    // with just the new record and silently drop every other workspace.
    expect(await readFile(filePath, 'utf8')).toBe(corrupt);
  });
});
