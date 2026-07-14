import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';

/*
 * Reconcile-on-read for provider='server' deployments.
 *
 * A server deploy applies its k8s Deployment/Service synchronously, then polls
 * readiness for a bounded window. Under capacity pressure (a cold gVisor node:
 * scale-up + image pull + boot) the pod goes Ready AFTER that poll times out, so
 * the create request persists a NON-TERMINAL `BUILDING` row (never a terminal
 * FAILED, which the monotonic status guard would lock, leaving the live app
 * showing "failed" forever and leaking the Deployment). These tests prove the
 * read path re-checks live readiness against the manager and self-heals
 * BUILDING → READY once a replica is up, and holds BUILDING while it is not.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe('server deploy reconcile-on-read (false-FAILED self-heal)', () => {
  const previousManagerUrl = process.env.WORKSPACE_MANAGER_URL;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';
  });

  afterEach(() => {
    if (previousManagerUrl === undefined) {
      delete process.env.WORKSPACE_MANAGER_URL;
    } else {
      process.env.WORKSPACE_MANAGER_URL = previousManagerUrl;
    }

    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  async function setup(options: ApiAppOptions = {}) {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store, ...options });

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'server-reconcile@example.com',
        password: 'password123',
        name: 'Server Reconcile',
        organizationName: 'Server Reconcile Org',
      },
    });
    expect(register.statusCode).toBe(201);
    const auth = register.json() as { token: string; organization: { id: string }; user: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Server Reconcile Project' },
    });
    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { app, store, auth, projectId };
  }

  /** Stub the manager `/server-deployments/:id/status` GET with a fixed readiness. */
  function stubManagerStatus(readyReplicas: number, replicas = 1) {
    globalThis.fetch = vi.fn(async (url: any) => {
      const href = typeof url === 'string' ? url : url.toString();

      if (href.includes('/server-deployments/') && href.endsWith('/status')) {
        return new Response(JSON.stringify({ exists: true, readyReplicas, replicas }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
  }

  it('promotes a BUILDING server deploy to READY when the manager reports a ready replica', async () => {
    const { app, store, auth, projectId } = await setup();
    stubManagerStatus(1);

    const host = 'd-reconcileready.preview.e-code.ai';
    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      metadata: { serverDeploy: { host, applied: true, ready: false, readyReplicas: 0 } },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deployment.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(200);
    const row = res.json().deployment;
    expect(row.status).toBe('READY');
    expect(row.url).toBe(`https://${host}`);
    expect(row.previewUrl).toBe(`https://${host}`);

    await app.close();
  });

  it('leaves a BUILDING server deploy BUILDING while no replica is ready yet', async () => {
    const { app, store, auth, projectId } = await setup();
    stubManagerStatus(0);

    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      startedAt: new Date().toISOString(),
      metadata: { serverDeploy: { host: 'd-stillbuilding.preview.e-code.ai', applied: true } },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deployment.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().deployment.status).toBe('BUILDING');

    await app.close();
  });

  it('does not reconcile a BUILDING row whose manifests were never applied', async () => {
    const { app, store, auth, projectId } = await setup();
    // Even if the manager would report ready, an un-applied row must not be touched.
    stubManagerStatus(1);
    const managerCalled = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'BUILDING',
      startedAt: new Date().toISOString(),
      metadata: { serverDeploy: { host: 'd-notapplied.preview.e-code.ai', applied: false } },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/deployments/${deployment.id}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().deployment.status).toBe('BUILDING');
    // The manager status endpoint must not even be consulted for an un-applied row.
    const statusCalls = managerCalled.mock.calls.filter((c: any[]) => String(c[0]).includes('/server-deployments/'));
    expect(statusCalls.length).toBe(0);

    await app.close();
  });
});
