import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createInMemoryCloudGovernanceStore, FakeGcpCloudClient } from './cloud-governance-fakes.js';
import { registerCloudGovernanceRoutes } from './cloud-governance-routes.js';

async function buildApp(opts: { enabled?: boolean; admin?: boolean } = {}) {
  process.env.CLOUD_TENANT_FACTORY_ENABLED = opts.enabled === false ? 'false' : 'true';

  const app = Fastify();
  const store = createInMemoryCloudGovernanceStore();
  const gcp = new FakeGcpCloudClient();
  const audited: Array<{ action: string }> = [];

  registerCloudGovernanceRoutes(app, {
    governance: store,
    gcp,
    guardAdmin: async () => {
      if (opts.admin === false) {
        throw Object.assign(new Error('Platform administrator required'), { statusCode: 403 });
      }
    },
    audit: async (_request, entry) => {
      audited.push(entry);
    },
  });
  await app.ready();

  return { app, store, gcp, audited };
}

afterEach(() => {
  delete process.env.CLOUD_TENANT_FACTORY_ENABLED;
});

describe('cloud governance admin routes', () => {
  it('is dark behind the kill-switch (503, typed)', async () => {
    const { app } = await buildApp({ enabled: false });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/cloud-tenants',
      payload: { customerBoundaryType: 'PERSON', ownerPrincipalId: 'user:a@b.c', billingPrincipalId: 'user:a@b.c' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('CLOUD_TENANT_FACTORY_DISABLED');
  });

  it('refuses non-admin callers before touching anything', async () => {
    const { app, audited } = await buildApp({ admin: false });

    const res = await app.inject({ method: 'POST', url: '/admin/cloud-tenants', payload: {} });
    expect(res.statusCode).toBe(403);
    expect(audited).toHaveLength(0);
  });

  it('creates a tenant, binds a project once, and returns the typed 409 on a cross-tenant re-bind', async () => {
    const { app, audited } = await buildApp();

    const tenantARes = await app.inject({
      method: 'POST',
      url: '/admin/cloud-tenants',
      payload: { customerBoundaryType: 'PERSON', ownerPrincipalId: 'user:a@b.c', billingPrincipalId: 'user:a@b.c' },
    });
    expect(tenantARes.statusCode).toBe(201);

    const tenantBRes = await app.inject({
      method: 'POST',
      url: '/admin/cloud-tenants',
      payload: { customerBoundaryType: 'WORKSPACE', ownerPrincipalId: 'user:b@b.c', billingPrincipalId: 'user:b@b.c' },
    });

    const tenantAId = tenantARes.json().tenant.id as string;
    const tenantBId = tenantBRes.json().tenant.id as string;

    const bindRes = await app.inject({
      method: 'POST',
      url: `/admin/cloud-tenants/${tenantAId}/bindings`,
      payload: { gcpProjectId: 'pj-route-test', region: 'europe-west9' },
    });
    expect(bindRes.statusCode).toBe(201);

    const conflictRes = await app.inject({
      method: 'POST',
      url: `/admin/cloud-tenants/${tenantBId}/bindings`,
      payload: { gcpProjectId: 'pj-route-test', region: 'europe-west9' },
    });
    expect(conflictRes.statusCode).toBe(409);
    expect(conflictRes.json().code).toBe('TENANT_PROJECT_CONFLICT');

    expect(audited.map((a) => a.action)).toEqual([
      'admin.cloud_tenant.create',
      'admin.cloud_tenant.create',
      'admin.cloud_tenant.bind_project',
    ]);
  });

  it('rejects malformed payloads with VALIDATION_FAILED', async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/admin/cloud-tenants',
      payload: { customerBoundaryType: 'PERSON', ownerPrincipalId: 'not-a-member', billingPrincipalId: 'user:a@b.c' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_FAILED');
  });

  it('ensures a runtime identity over HTTP: 201 then 200 (reused, one SA)', async () => {
    const { app, gcp } = await buildApp();
    gcp.seedProject('pj-iam-route');

    const payload = {
      app: 'demo',
      environment: 'production',
      privilegeBoundary: 'app-runtime',
      gcpProjectId: 'pj-iam-route',
    };

    const first = await app.inject({ method: 'POST', url: '/admin/iam-identities/runtime', payload });
    const second = await app.inject({ method: 'POST', url: '/admin/iam-identities/runtime', payload });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().identity.revisionsServed).toBe(2);
    expect(gcp.createdServiceAccountCount).toBe(1);
  });
});
