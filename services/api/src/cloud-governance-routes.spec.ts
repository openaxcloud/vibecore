import Fastify, { type FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCloudGovernanceRoutes } from './cloud-governance-routes.js';
import type { CloudGovernanceService } from './cloud-governance-service.js';
import { CloudGovernanceError } from './cloud-governance-store.js';

const apps: Array<ReturnType<typeof Fastify>> = [];
afterEach(async () => {
  await Promise.allSettled(apps.splice(0).map((app) => app.close()));
});

function build(
  service: Partial<CloudGovernanceService>,
  order: string[] = [],
  authorizeTenantProvisioning: (request: FastifyRequest, organizationId: string) => Promise<void> = async () => {},
) {
  const app = Fastify();
  apps.push(app);
  const audit = vi.fn(async (_request, entry: { action: string }) => {
    order.push(`audit:${entry.action}`);
  });
  registerCloudGovernanceRoutes(app, {
    service: service as CloudGovernanceService,
    enabled: () => true,
    guardAdmin: async (request: FastifyRequest, options) => {
      if (request.headers['x-test-admin'] !== 'true') {
        throw new CloudGovernanceError('PLATFORM_ADMIN_REQUIRED', 'Platform admin required', 403);
      }
      if (options.reauth && request.headers['x-test-reauth'] !== 'true') {
        throw new CloudGovernanceError('ADMIN_REAUTH_REQUIRED', 'Recent reauthentication required', 403);
      }
      Object.assign(request, {
        currentUser: { id: 'admin-user' },
        currentSession: { lastReauthAt: new Date() },
      });
    },
    authorizeTenantProvisioning,
    audit,
  });
  return { app, audit };
}

describe('Cloud governance routes — admin, reauth, idempotency and audit', () => {
  it('requires platform admin and recent reauthentication on mutations', async () => {
    const { app } = build({});
    const body = {
      organizationId: 'org-1',
      customerBoundaryType: 'WORKSPACE',
      ownerPrincipalId: 'user:owner@example.com',
      billingPrincipalId: 'group:billing@example.com',
      billingAccountId: 'AAAAAA-BBBBBB-CCCCCC',
    };
    const anonymous = await app.inject({ method: 'POST', url: '/admin/cloud-tenants', payload: body });
    expect(anonymous.statusCode).toBe(403);
    expect(anonymous.json()).toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });

    const noReauth = await app.inject({
      method: 'POST',
      url: '/admin/cloud-tenants',
      headers: { 'x-test-admin': 'true' },
      payload: body,
    });
    expect(noReauth.statusCode).toBe(403);
    expect(noReauth.json()).toMatchObject({ code: 'ADMIN_REAUTH_REQUIRED' });
  });

  it('fails closed without a valid Idempotency-Key', async () => {
    const createTenant = vi.fn();
    const { app } = build({ createTenant } as Partial<CloudGovernanceService>);
    const response = await app.inject({
      method: 'POST',
      url: '/admin/cloud-tenants',
      headers: { 'x-test-admin': 'true', 'x-test-reauth': 'true' },
      payload: {
        organizationId: 'org-1',
        customerBoundaryType: 'WORKSPACE',
        ownerPrincipalId: 'user:owner@example.com',
        billingPrincipalId: 'group:billing@example.com',
        billingAccountId: 'AAAAAA-BBBBBB-CCCCCC',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(createTenant).not.toHaveBeenCalled();
  });

  it('does not let platform-admin privilege bypass an unprovisioned single-tenant contract', async () => {
    const createTenant = vi.fn();
    const authorizeTenantProvisioning = vi.fn(async () => {
      throw new CloudGovernanceError(
        'ENTERPRISE_CAPABILITY_OPERATOR_REQUIRED',
        'Enterprise operator provisioning is required',
        403,
      );
    });
    const { app } = build(
      { createTenant } as Partial<CloudGovernanceService>,
      [],
      authorizeTenantProvisioning,
    );
    const response = await app.inject({
      method: 'POST',
      url: '/admin/cloud-tenants',
      headers: {
        'x-test-admin': 'true',
        'x-test-reauth': 'true',
        'idempotency-key': 'tenant-create-request-0001',
      },
      payload: {
        organizationId: 'org-1',
        customerBoundaryType: 'WORKSPACE',
        ownerPrincipalId: 'user:owner@example.com',
        billingPrincipalId: 'group:billing@example.com',
        billingAccountId: 'AAAAAA-BBBBBB-CCCCCC',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'ENTERPRISE_CAPABILITY_OPERATOR_REQUIRED' });
    expect(authorizeTenantProvisioning).toHaveBeenCalledWith(expect.anything(), 'org-1');
    expect(createTenant).not.toHaveBeenCalled();
  });

  it('writes the request audit before any external attempt and reports the durable operation', async () => {
    const order: string[] = [];
    const changeTenantLifecycle = vi.fn(async () => ({ operation: { id: 'operation-1' } }));
    const executeOperation = vi.fn(async () => {
      order.push('execute');
      const now = new Date();
      return {
        id: 'operation-1',
        idempotencyKey: 'not-returned',
        requestHash: 'not-returned',
        kind: 'TENANT_SUSPEND' as const,
        status: 'WAITING' as const,
        tenantId: 'tenant-1',
        relatedTenantId: null,
        bindingId: null,
        actorUserId: 'admin-user',
        reauthenticatedAt: now,
        step: 'SUSPENDING',
        payload: {},
        checkpoint: {},
        result: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        fence: 1,
        version: 2,
        attempts: 1,
        nextAttemptAt: now,
        lastErrorCode: 'GCP_503',
        lastErrorMessage: 'temporary',
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        transfer: null,
        events: [],
      };
    });
    const { app, audit } = build(
      { changeTenantLifecycle, executeOperation } as unknown as Partial<CloudGovernanceService>,
      order,
    );
    const response = await app.inject({
      method: 'POST',
      url: '/admin/cloud-tenants/tenant-1/suspend',
      headers: {
        'x-test-admin': 'true',
        'x-test-reauth': 'true',
        'idempotency-key': 'suspend-request-0001',
      },
      payload: { expectedVersion: 1, reason: 'incident' },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      operation: { id: 'operation-1', status: 'WAITING', lastErrorCode: 'GCP_503' },
    });
    expect(order).toEqual([
      'audit:admin.cloud_tenant.suspend.requested',
      'execute',
      'audit:admin.cloud_tenant.suspend.attempted',
    ]);
    expect(audit).toHaveBeenCalledTimes(2);
  });

  it('durably requeues a failed operation before the resume attempt', async () => {
    const order: string[] = [];
    const now = new Date();
    const failed = {
      id: 'operation-failed',
      idempotencyKey: 'not-returned',
      requestHash: 'not-returned',
      kind: 'TENANT_MERGE' as const,
      status: 'FAILED' as const,
      tenantId: 'tenant-source',
      relatedTenantId: 'tenant-target',
      bindingId: null,
      actorUserId: 'admin-user',
      reauthenticatedAt: now,
      step: 'MERGING',
      payload: {},
      checkpoint: {},
      result: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      fence: 1,
      version: 2,
      attempts: 1,
      nextAttemptAt: now,
      lastErrorCode: 'GCP_403',
      lastErrorMessage: 'forbidden',
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      transfer: null,
      events: [],
    };
    const prepareOperationForResume = vi.fn(async () => {
      order.push('prepare');
    });
    const executeOperation = vi.fn(async () => {
      order.push('execute');
      return { ...failed, status: 'WAITING' as const, completedAt: null, lastErrorCode: 'GCP_503' };
    });
    const service = {
      store: {
        getOperation: vi.fn(async () => failed),
        prepareOperationForResume,
      },
      executeOperation,
    } as unknown as Partial<CloudGovernanceService>;
    const { app } = build(service, order);

    const response = await app.inject({
      method: 'POST',
      url: '/admin/cloud-operations/operation-failed/resume',
      headers: { 'x-test-admin': 'true', 'x-test-reauth': 'true' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ operation: { id: 'operation-failed', status: 'WAITING' } });
    expect(order).toEqual([
      'audit:admin.cloud_operation.resume.requested',
      'prepare',
      'execute',
      'audit:admin.cloud_operation.resume.attempted',
    ]);
  });
});
