import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import type { WorkspaceEvent } from '@vibecore/workspace-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceManager, type EventBus, type WorkspaceRecord, type WorkspaceStore } from './manager.js';

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

    // Simulate workspace-gc reaping the idle workspace: the pod/Service/PVC are
    // deleted but the DB row survives with status DELETED.
    await manager.deleteWorkspace('workspaces', input.workspaceId);
    expect((await store.get(input.workspaceId))?.status).toBe('DELETED');
    expect(k8s.objects.has('workspaces:Pod:workspace-workspace_1')).toBe(false);

    // Reopening the project re-enters startWorkspace with the same id. Before
    // the fix this threw P2002 (create() on an existing row) and the workspace
    // could never come back; now it reuses the row and re-applies resources.
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
    // Simulate a provisioning failure that left the runtime resources behind:
    // before the fix, GC only walked RUNNING→STOPPED→DELETED and never reaped
    // FAILED rows, so the Pod/PVC sat leaked (Pending pod spinning autoscaler).
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

  it('does not delete a workspace re-provisioned since the GC snapshot (TOCTOU)', async () => {
    const k8s = new TestWorkspaceK8sClient();
    // list() yields the stale STOPPED+idle snapshot the GC pass started from,
    // but get() returns the live row that a concurrent startWorkspace just
    // flipped to STARTING. GC must re-read and skip — deleting here would pull
    // the PVC out from under the freshly created pod.
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
    // Simulate a session that has been open past the inactivity window with the
    // start-time stamp never refreshed — exactly the state that used to get reaped.
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
