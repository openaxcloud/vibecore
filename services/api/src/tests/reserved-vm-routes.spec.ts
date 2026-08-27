import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { RESERVED_VM_TERMS_VERSION } from '../reserved-vm.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  async send() {}
}

const originalManagerUrl = process.env.WORKSPACE_MANAGER_URL;
const originalManagerSecret = process.env.WORKSPACE_MANAGER_SHARED_SECRET;
const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;

  if (originalManagerUrl === undefined) delete process.env.WORKSPACE_MANAGER_URL;
  else process.env.WORKSPACE_MANAGER_URL = originalManagerUrl;
  if (originalManagerSecret === undefined) delete process.env.WORKSPACE_MANAGER_SHARED_SECRET;
  else process.env.WORKSPACE_MANAGER_SHARED_SECRET = originalManagerSecret;
});

async function setup(paid = true) {
  process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';
  process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'manager-secret';
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new TestEmailProvider() });
  const user = await store.createUser({
    email: `reserved-route-${Math.random().toString(36).slice(2)}@example.test`,
    name: 'Reserved Route',
    passwordHash: hashPassword('password123'),
  });
  const organization = await store.createOrganization({
    name: 'Reserved Route Org',
    slug: `reserved-route-${Math.random().toString(36).slice(2)}`,
    ownerUserId: user.id,
  });
  const token = `reserved-token-${Math.random().toString(36).slice(2)}`;
  await store.createSession({
    userId: user.id,
    token,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  const project = await store.createProject({
    organizationId: organization.id,
    name: 'Reserved Route Project',
    slug: `reserved-route-project-${Math.random().toString(36).slice(2)}`,
  });

  if (paid) {
    await store.upsertSubscription({ organizationId: organization.id, planKey: 'pro', status: 'ACTIVE' });
  }

  return { app, store, organization, project, token };
}

function capability(enabled = true) {
  return new Response(
    JSON.stringify(
      enabled
        ? {
            reservedVm: {
              enabled: true,
              availableTiers: ['shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4'],
            },
          }
        : { reservedVm: { enabled: false, reasonCode: 'RESERVED_VM_NODE_POOL_UNAVAILABLE' } },
    ),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('Reserved VM deployment routes', () => {
  it('returns the exact rate card but keeps Reserved VM fail-closed when live capability is unavailable', async () => {
    const { app, project, token } = await setup();
    globalThis.fetch = vi.fn(async () => new Response('unavailable', { status: 503 })) as typeof fetch;

    const response = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/deployments/rate-card`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().reservedVm).toEqual({
      enabled: false,
      reasonCode: 'RESERVED_VM_CAPABILITY_UNREACHABLE',
      paidPlanEligible: true,
      termsVersion: RESERVED_VM_TERMS_VERSION,
      tiers: [
        expect.objectContaining({ id: 'shared-0.5', monthlyPriceCents: 2_000 }),
        expect.objectContaining({ id: 'dedicated-1', monthlyPriceCents: 4_000 }),
        expect.objectContaining({ id: 'dedicated-2', monthlyPriceCents: 8_000 }),
        expect.objectContaining({ id: 'dedicated-4', monthlyPriceCents: 16_000 }),
      ],
    });
    await app.close();
  });

  it('requires a paid plan before probing or reserving Reserved VM infrastructure', async () => {
    const { app, store, project, token } = await setup(false);
    const deployment = await store.createDeployment({
      projectId: project.id,
      provider: 'server',
      status: 'READY',
      machineSize: 'shared-0.5',
      url: 'https://d-stable.preview.e-code.ai',
    });
    const fetchMock = vi.fn(async () => capability());
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await app.inject({
      method: 'PATCH',
      url: `/projects/${project.id}/deployments/${deployment.id}/runtime`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'reserved-free-denial-0001' },
      payload: {
        expectedRuntimeVersion: 0,
        runtimeKind: 'reserved-vm',
        reservedVmTier: 'shared-0.5',
        reservedVmConfirmation: {
          accepted: true,
          termsVersion: RESERVED_VM_TERMS_VERSION,
          monthlyPriceCents: 2_000,
        },
      },
    });

    expect(response.statusCode).toBe(402);
    expect(response.json().code).toBe('RESERVED_VM_PAID_PLAN_REQUIRED');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await store.getReservedVmOperation(project.id, 'reserved-free-denial-0001')).toBeUndefined();
    await app.close();
  });

  it('changes a ready server deployment in place and replays the same key without a second manager apply', async () => {
    const { app, store, project, token } = await setup();
    const deployment = await store.createDeployment({
      projectId: project.id,
      provider: 'server',
      status: 'READY',
      machineSize: 'shared-0.5',
      url: 'https://d-stable.preview.e-code.ai',
      previewUrl: 'https://d-stable.preview.e-code.ai',
    });
    const reconfigureBodies: unknown[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);

      if (href.endsWith('/runtime-capabilities')) return capability();
      if (href.endsWith(`/server-deployments/${deployment.id}/reconfigure`)) {
        reconfigureBodies.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            ready: true,
            readyReplicas: 1,
            name: `app-${deployment.id}`,
            persistentVolumeClaimName: `reserved-data-${deployment.id}`,
            appliedFencingToken: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    const idempotencyKey = 'reserved-change-route-0001';
    const request = {
      method: 'PATCH' as const,
      url: `/projects/${project.id}/deployments/${deployment.id}/runtime`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
      payload: {
        expectedRuntimeVersion: 0,
        runtimeKind: 'reserved-vm',
        reservedVmTier: 'shared-0.5',
        reservedVmConfirmation: {
          accepted: true,
          termsVersion: RESERVED_VM_TERMS_VERSION,
          monthlyPriceCents: 2_000,
        },
      },
    };

    const first = await app.inject(request);
    const replay = await app.inject(request);

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(first.json().deployment).toMatchObject({
      id: deployment.id,
      projectId: project.id,
      url: 'https://d-stable.preview.e-code.ai',
      previewUrl: 'https://d-stable.preview.e-code.ai',
      runtimeKind: 'reserved-vm',
      runtimeVersion: 1,
      machineSize: 'shared-0.5',
      reservedVmTier: 'shared-0.5',
      persistentStorageClaim: `reserved-data-${deployment.id}`,
    });
    expect(replay.json().deployment).toEqual(first.json().deployment);
    expect(reconfigureBodies).toEqual([
      expect.objectContaining({
        runtimeKind: 'reserved-vm',
        reservedVmTier: 'shared-0.5',
        cpuRequest: '500m',
        cpuLimit: '500m',
        memoryRequest: '2048Mi',
        memoryLimit: '2048Mi',
        operationId: expect.any(String),
        fencingToken: 1,
      }),
    ]);

    const stale = await app.inject({
      ...request,
      headers: { ...request.headers, 'idempotency-key': 'reserved-change-route-stale-0002' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('RESERVED_VM_RUNTIME_VERSION_CONFLICT');
    await app.close();
  });
});
