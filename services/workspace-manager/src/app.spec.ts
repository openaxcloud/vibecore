import { afterEach, describe, expect, it } from 'vitest';
import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import { buildWorkspaceManagerApp } from './app.js';
import { WorkspaceManager, type EventBus, type WorkspaceRecord, type WorkspaceStore } from './manager.js';
import type { WorkspaceEvent } from '@vibecore/workspace-sdk';

const ENV_KEYS = [
  'WORKSPACE_RUNTIME_NAMESPACE',
  'PREVIEW_PROXY_SHARED_SECRET',
  'WORKSPACE_MANAGER_SHARED_SECRET',
  'WORKSPACE_AGENT_URL_TEMPLATE',
] as const;

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

class TestK8sClient implements WorkspaceK8sClient {
  readonly namespaces: string[] = [];
  readonly objects = new Map<string, K8sObject>();

  async apply(object: K8sObject) {
    this.objects.set(`${object.metadata.namespace}:${object.kind}:${object.metadata.name}`, object);
    return object;
  }

  async delete(_kind: string, namespace: string) {
    this.namespaces.push(namespace);
  }

  async get(kind: string, namespace: string, name: string) {
    return this.objects.get(`${namespace}:${kind}:${name}`);
  }

  async getPod(namespace: string, name: string) {
    const pod = this.objects.get(`${namespace}:Pod:${name}`);
    return pod ? ({ ...pod, status: { conditions: [{ type: 'Ready', status: 'True' }] } } as K8sObject) : undefined;
  }

  async *streamPodLogs(namespace: string, name: string) {
    yield `logs:${namespace}:${name}:ready`;
  }
}

class TestEventBus implements EventBus {
  async publish(_event: WorkspaceEvent) {}
}

function restoreEnv(previous: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = previous[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function manager(store = new TestWorkspaceStore(), k8s = new TestK8sClient()) {
  return { store, k8s, manager: new WorkspaceManager(store, k8s, new TestEventBus(), 'agent-secret') };
}

describe('workspace-manager app', () => {
  const previous: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  afterEach(() => restoreEnv(previous));

  for (const key of ENV_KEYS) {
    previous[key] = process.env[key];
  }

  it('uses WORKSPACE_RUNTIME_NAMESPACE for lifecycle routes that do not carry a request body', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);

    await app.inject({
      method: 'POST',
      url: '/workspaces/start',
      payload: {
        namespace: 'prod-workspaces',
        orgId: 'org_1',
        projectId: 'project_1',
        workspaceId: 'workspace_1',
        image: 'agent:test',
      },
    });

    const logs = await app.inject({ method: 'GET', url: '/workspaces/workspace_1/logs' });
    const stopped = await app.inject({ method: 'POST', url: '/workspaces/workspace_1/stop' });

    expect(logs.json()).toEqual({ logs: ['logs:prod-workspaces:workspace-workspace_1:ready'] });
    expect(stopped.statusCode).toBe(200);
    expect(runtime.k8s.namespaces).toContain('prod-workspaces');

    await app.close();
  });

  it('returns 404 (not 500) when acting on a workspace it has no record of', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);

    const stopped = await app.inject({ method: 'POST', url: '/workspaces/missing-workspace/stop' });

    expect(stopped.statusCode).toBe(404);
    expect(stopped.json().code).toBe('WORKSPACE_NOT_FOUND');

    await app.close();
  });

  it('requires the shared secret on control-plane routes when one is configured', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    // Control plane now requires the DEDICATED secret (no PREVIEW_PROXY fallback).
    process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'cp-secret';
    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);

    const unauthorized = await app.inject({
      method: 'GET',
      url: '/workspaces/some-ws/agent-token',
    });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json().code).toBe('WORKSPACE_MANAGER_UNAUTHORIZED');

    const authorized = await app.inject({
      method: 'GET',
      url: '/workspaces/some-ws/agent-token',
      headers: { authorization: 'Bearer cp-secret' },
    });
    // Passes auth; agent-token mints regardless of whether the workspace record exists.
    expect(authorized.statusCode).toBe(200);

    // /health stays open for liveness probes.
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    await app.close();
  });

  it('exposes preview proxy agent resolution only with the shared secret', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    process.env.PREVIEW_PROXY_SHARED_SECRET = 'preview-secret\n';
    process.env.WORKSPACE_AGENT_URL_TEMPLATE = 'http://workspace-{workspaceId}.{namespace}.svc:8080';

    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);

    await runtime.store.create({
      id: 'ws_1',
      orgId: 'org_1',
      projectId: 'project_1',
      plan: 'free',
      status: 'RUNNING',
      pvcName: 'pvc-ws_1',
      podName: 'workspace-ws_1',
      serviceName: 'workspace-ws_1',
      agentTokenSecretName: 'agent-token-ws_1',
    });

    const unauthorized = await app.inject({ method: 'GET', url: '/internal/workspaces/ws_1/agent' });
    const authorized = await app.inject({
      method: 'GET',
      url: '/internal/workspaces/ws_1/agent',
      headers: { authorization: 'Bearer preview-secret' },
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json()).toMatchObject({ baseUrl: 'http://workspace-ws_1.prod-workspaces.svc:8080' });
    expect(authorized.json().token).toEqual(expect.any(String));

    await app.close();
  });
});
