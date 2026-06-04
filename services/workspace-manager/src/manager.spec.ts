import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import type { WorkspaceEvent } from '@vibecore/workspace-sdk';
import { describe, expect, it } from 'vitest';
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
});
