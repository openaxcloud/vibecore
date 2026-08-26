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

  async updateIfUnchanged(
    workspaceId: string,
    expected: Pick<WorkspaceRecord, 'status' | 'lastActiveAt'>,
    patch: Partial<WorkspaceRecord>,
  ) {
    const existing = this.workspaces.get(workspaceId);

    if (!existing || existing.status !== expected.status || existing.lastActiveAt !== expected.lastActiveAt) {
      return undefined;
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

class TestK8sClient implements WorkspaceK8sClient {
  readonly namespaces: string[] = [];
  readonly objects = new Map<string, K8sObject>();

  async apply(object: K8sObject) {
    this.objects.set(`${object.metadata.namespace}:${object.kind}:${object.metadata.name}`, object);
    return object;
  }

  async delete(kind: string, namespace: string, name: string) {
    this.objects.delete(`${namespace}:${kind}:${name}`);
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

  it('negotiates French errors without translating identifiers or payload data', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    const runtime = manager();
    const app = buildWorkspaceManagerApp(runtime.manager);

    const stopped = await app.inject({
      method: 'POST',
      url: '/workspaces/missing-workspace/stop',
      headers: { 'accept-language': 'en;q=0.4, fr-FR;q=0.9' },
    });

    expect(stopped.statusCode).toBe(404);
    expect(stopped.headers['content-language']).toBe('fr');
    expect(stopped.headers.vary).toContain('Accept-Language');
    expect(stopped.json()).toMatchObject({
      code: 'WORKSPACE_NOT_FOUND',
      message: 'Espace de travail introuvable.',
    });

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

  it('rejects an agent resolution whose orgId does not own the workspace', async () => {
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'prod-workspaces';
    process.env.PREVIEW_PROXY_SHARED_SECRET = 'preview-secret\n';
    process.env.WORKSPACE_AGENT_URL_TEMPLATE = 'http://workspace-{workspaceId}.{namespace}.svc:8080';
    delete process.env.WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT;

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

    const headers = { authorization: 'Bearer preview-secret' };

    // Matching org → 200, even with enforcement off.
    const ownOrg = await app.inject({ method: 'GET', url: '/internal/workspaces/ws_1/agent?orgId=org_1', headers });
    expect(ownOrg.statusCode).toBe(200);

    // Mismatched org → 403 (cross-tenant denial), regardless of the flag.
    const otherOrg = await app.inject({ method: 'GET', url: '/internal/workspaces/ws_1/agent?orgId=org_2', headers });
    expect(otherOrg.statusCode).toBe(403);
    expect(otherOrg.json().code).toBe('WORKSPACE_TENANT_FORBIDDEN');

    // Enforcement on + no orgId supplied → 403 (fail closed).
    process.env.WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT = 'true';

    const noOrg = await app.inject({ method: 'GET', url: '/internal/workspaces/ws_1/agent', headers });
    expect(noOrg.statusCode).toBe(403);

    delete process.env.WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT;
    await app.close();
  });

  describe('database rollback k8s bridge (Phase 2)', () => {
    const cnpgCluster = {
      apiVersion: 'postgresql.cnpg.io/v1',
      kind: 'Cluster',
      metadata: { name: 'db-p1', namespace: 'project-databases' },
      spec: { instances: 1 },
    };

    it('applies a CNPG resource in the project-databases namespace', async () => {
      const runtime = manager();
      const app = buildWorkspaceManagerApp(runtime.manager);
      const res = await app.inject({ method: 'POST', url: '/databases/apply', payload: { manifest: cnpgCluster } });
      expect(res.statusCode).toBe(200);
      expect(runtime.k8s.objects.has('project-databases:Cluster:db-p1')).toBe(true);
      await app.close();
    });

    it('applies shared-tier Pooler and Database CNPG kinds', async () => {
      for (const kind of ['Pooler', 'Database'] as const) {
        const runtime = manager();
        const app = buildWorkspaceManagerApp(runtime.manager);
        const res = await app.inject({
          method: 'POST',
          url: '/databases/apply',
          payload: {
            manifest: { ...cnpgCluster, kind, metadata: { name: `sh-${kind}`, namespace: 'project-databases' } },
          },
        });
        expect(res.statusCode).toBe(200);
        expect(runtime.k8s.objects.has(`project-databases:${kind}:sh-${kind}`)).toBe(true);
        await app.close();
      }
    });

    it('rejects a forbidden kind', async () => {
      const app = buildWorkspaceManagerApp(manager().manager);
      const res = await app.inject({
        method: 'POST',
        url: '/databases/apply',
        payload: { manifest: { ...cnpgCluster, kind: 'Pod' } },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it('rejects the wrong namespace', async () => {
      const app = buildWorkspaceManagerApp(manager().manager);
      const res = await app.inject({
        method: 'POST',
        url: '/databases/apply',
        payload: { manifest: { ...cnpgCluster, metadata: { name: 'db-p1', namespace: 'kube-system' } } },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it('rejects a non-CNPG apiVersion even for an allowed kind', async () => {
      const app = buildWorkspaceManagerApp(manager().manager);
      const res = await app.inject({
        method: 'POST',
        url: '/databases/apply',
        payload: { manifest: { ...cnpgCluster, apiVersion: 'v1' } },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it('404s a missing resource and 403s a forbidden get', async () => {
      const app = buildWorkspaceManagerApp(manager().manager);
      const missing = await app.inject({
        method: 'GET',
        url: '/databases/resource?kind=Cluster&namespace=project-databases&name=nope',
      });
      expect(missing.statusCode).toBe(404);
      const forbidden = await app.inject({
        method: 'GET',
        url: '/databases/resource?kind=Secret&namespace=project-databases&name=x',
      });
      expect(forbidden.statusCode).toBe(403);
      await app.close();
    });
  });
});
