import { afterEach, describe, expect, it } from 'vitest';
import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import { buildWorkspaceManagerApp } from './app.js';
import {
  MIN_RECONCILE_GRACE_MS,
  WorkspaceManager,
  type EventBus,
  type WorkspaceRecord,
  type WorkspaceStore,
} from './manager.js';
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

  /* R-P3-06: conditional release — compare and set with no await between. */
  async releasePurgeFence(workspaceId: string, fenceToken: string | undefined) {
    const existing = this.workspaces.get(workspaceId);

    if (!existing?.purgeFrozen || (existing.purgeFenceToken ?? undefined) !== (fenceToken ?? undefined)) {
      return false;
    }

    this.workspaces.set(workspaceId, {
      ...existing,
      purgeFrozen: false,
      purgeFenceToken: undefined,
      purgeFrozenAt: undefined,
    });

    return true;
  }

  async releaseStalePurgeFence(workspaceId: string, observed: { fenceToken?: string; frozenAt?: string }) {
    const existing = this.workspaces.get(workspaceId);

    if (
      !existing?.purgeFrozen ||
      (existing.purgeFenceToken ?? undefined) !== (observed.fenceToken ?? undefined) ||
      (existing.purgeFrozenAt ?? undefined) !== (observed.frozenAt ?? undefined)
    ) {
      return false;
    }

    this.workspaces.set(workspaceId, {
      ...existing,
      purgeFrozen: false,
      purgeFenceToken: undefined,
      purgeFrozenAt: undefined,
    });

    return true;
  }

  /* R-P3-07: fence tokens whose purge plan still holds an unexpired lease. */
  readonly liveFenceTokens = new Set<string>();
  /* Set to simulate the lease lookup itself failing (must fail CLOSED). */
  livenessError: Error | undefined;

  async isPurgeFenceOwnerLive(fenceToken: string) {
    if (this.livenessError) {
      throw this.livenessError;
    }

    return this.liveFenceTokens.has(fenceToken);
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

  /*
   * R-P3-07 (expert reserve #2 on PR #52). The global onRequest hook exempted the whole
   * `/internal/` namespace, and `/internal/reconcile-workspace-freezes` carried no auth
   * of its own — so an UNAUTHENTICATED POST could lift an active purge barrier, and
   * `graceMs: 0` made every barrier "stale" so ONE call cleared the entire fleet.
   *
   * These assert the observable contract at the HTTP edge: the barrier must survive
   * every unauthorised shape of the call.
   */
  describe('internal freeze-reconcile route is fail-closed (R-P3-07)', () => {
    const SECRET = 'manager-secret-r-p3-07';

    /** A store holding ONE runtime frozen long ago — the barrier under attack. */
    function frozenRuntimeApp() {
      const runtime = manager();
      runtime.store.workspaces.set('workspace_frozen', {
        id: 'workspace_frozen',
        orgId: 'org_1',
        projectId: 'project_1',
        plan: 'pro',
        status: 'STOPPED',
        pvcName: 'pvc-workspace_frozen',
        podName: 'workspace-workspace_frozen',
        serviceName: 'svc-workspace_frozen',
        agentTokenSecretName: 'agent-token-workspace_frozen',
        createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        lastActiveAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        purgeFrozen: true,
        purgeFenceToken: 'owner-live',
        purgeFrozenAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      } as WorkspaceRecord);

      return { runtime, app: buildWorkspaceManagerApp(runtime.manager) };
    }

    const stillFrozen = (runtime: ReturnType<typeof manager>) =>
      runtime.store.workspaces.get('workspace_frozen')!.purgeFrozen;

    it('refuses an UNAUTHENTICATED call and leaves the barrier UP', async () => {
      process.env.WORKSPACE_MANAGER_SHARED_SECRET = SECRET;
      const { runtime, app } = frozenRuntimeApp();

      const res = await app.inject({
        method: 'POST',
        url: '/internal/reconcile-workspace-freezes',
        payload: {},
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('WORKSPACE_MANAGER_UNAUTHORIZED');
      expect(stillFrozen(runtime)).toBe(true);
      await app.close();
    });

    it('refuses a WRONG token and leaves the barrier UP', async () => {
      process.env.WORKSPACE_MANAGER_SHARED_SECRET = SECRET;
      const { runtime, app } = frozenRuntimeApp();

      const res = await app.inject({
        method: 'POST',
        url: '/internal/reconcile-workspace-freezes',
        headers: { authorization: 'Bearer not-the-secret' },
        payload: {},
      });

      expect(res.statusCode).toBe(401);
      expect(stillFrozen(runtime)).toBe(true);
      await app.close();
    });

    /*
     * The dedicated scheme has NO dev exemption, unlike the global hook: a route that
     * can disable a safety barrier must not become open just because a secret is unset.
     */
    it('refuses when NO secret is configured, even outside production', async () => {
      delete process.env.WORKSPACE_MANAGER_SHARED_SECRET;
      const { runtime, app } = frozenRuntimeApp();

      const res = await app.inject({
        method: 'POST',
        url: '/internal/reconcile-workspace-freezes',
        payload: {},
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe('WORKSPACE_MANAGER_NOT_CONFIGURED');
      expect(stillFrozen(runtime)).toBe(true);
      await app.close();
    });

    it('rejects graceMs:0 (400) even WITH a valid token — the barrier survives', async () => {
      process.env.WORKSPACE_MANAGER_SHARED_SECRET = SECRET;
      const { runtime, app } = frozenRuntimeApp();

      const res = await app.inject({
        method: 'POST',
        url: '/internal/reconcile-workspace-freezes',
        headers: { authorization: `Bearer ${SECRET}` },
        payload: { graceMs: 0 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('WORKSPACE_RECONCILE_GRACE_INVALID');
      expect(stillFrozen(runtime)).toBe(true);
      await app.close();
    });

    it('rejects a negative and a below-floor graceMs', async () => {
      process.env.WORKSPACE_MANAGER_SHARED_SECRET = SECRET;
      const { runtime, app } = frozenRuntimeApp();

      for (const graceMs of [-1, 1, 60_000, MIN_RECONCILE_GRACE_MS - 1]) {
        const res = await app.inject({
          method: 'POST',
          url: '/internal/reconcile-workspace-freezes',
          headers: { authorization: `Bearer ${SECRET}` },
          payload: { graceMs },
        });

        expect(res.statusCode, `graceMs=${graceMs}`).toBe(400);
      }

      expect(stillFrozen(runtime)).toBe(true);
      await app.close();
    });

    /*
     * The refusal goes through the shared message catalogue like every other route,
     * so the preSerialization hook can localise it. Written inline, the string would
     * miss the catalogue lookup and this one route would answer a French client in
     * English — a silent inconsistency no status-code assertion would catch.
     */
    it('localises the refusal for a French client', async () => {
      process.env.WORKSPACE_MANAGER_SHARED_SECRET = SECRET;
      const { runtime, app } = frozenRuntimeApp();

      const res = await app.inject({
        method: 'POST',
        url: '/internal/reconcile-workspace-freezes',
        headers: { 'accept-language': 'fr-FR;q=0.9, en;q=0.4' },
        payload: {},
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers['content-language']).toBe('fr');
      expect(res.json().error).toBe('Requête non autorisée vers le gestionnaire d’espaces de travail.');
      expect(res.json().code).toBe('WORKSPACE_MANAGER_UNAUTHORIZED');
      expect(stillFrozen(runtime)).toBe(true);
      await app.close();
    });

    it('an internal route with NO declared scheme is refused, not exempted', async () => {
      process.env.WORKSPACE_MANAGER_SHARED_SECRET = SECRET;
      const { app } = frozenRuntimeApp();

      // A lookalike must not inherit the real route's registry entry by prefix.
      const res = await app.inject({
        method: 'POST',
        url: '/internal/reconcile-workspace-freezes-EVIL',
        payload: {},
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe('WORKSPACE_MANAGER_INTERNAL_ROUTE_UNGATED');
      await app.close();
    });

    it('an AUTHENTICATED call with a valid window still works (the gate is not a wall)', async () => {
      process.env.WORKSPACE_MANAGER_SHARED_SECRET = SECRET;
      const { runtime, app } = frozenRuntimeApp();

      const res = await app.inject({
        method: 'POST',
        url: '/internal/reconcile-workspace-freezes',
        headers: { authorization: `Bearer ${SECRET}` },
        payload: { graceMs: 24 * 60 * 60 * 1000 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ scanned: 1, reconciled: 1, skippedLiveOwner: 0, failed: 0 });
      expect(stillFrozen(runtime)).toBe(false);
      await app.close();
    });

    /*
     * "Purge longue": the barrier is far past the grace window, but its owner is still
     * heartbeating its lease. Age says orphaned, liveness says otherwise — and liveness
     * wins, or the reconciler would pull the barrier out from under a running erasure.
     */
    it('does NOT lift a barrier whose purge is still ALIVE, however old it is', async () => {
      process.env.WORKSPACE_MANAGER_SHARED_SECRET = SECRET;
      const { runtime, app } = frozenRuntimeApp();
      runtime.store.liveFenceTokens.add('owner-live');

      const res = await app.inject({
        method: 'POST',
        url: '/internal/reconcile-workspace-freezes',
        headers: { authorization: `Bearer ${SECRET}` },
        payload: { graceMs: 24 * 60 * 60 * 1000 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ scanned: 1, reconciled: 0, skippedLiveOwner: 1, failed: 0 });
      expect(stillFrozen(runtime)).toBe(true);
      await app.close();
    });

    it('leaves the barrier UP when liveness cannot be determined (fail-closed)', async () => {
      process.env.WORKSPACE_MANAGER_SHARED_SECRET = SECRET;
      const { runtime, app } = frozenRuntimeApp();
      runtime.store.livenessError = new Error('connection terminated unexpectedly');

      const res = await app.inject({
        method: 'POST',
        url: '/internal/reconcile-workspace-freezes',
        headers: { authorization: `Bearer ${SECRET}` },
        payload: { graceMs: 24 * 60 * 60 * 1000 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ reconciled: 0, failed: 1 });
      expect(stillFrozen(runtime)).toBe(true);
      await app.close();
    });
  });
});
