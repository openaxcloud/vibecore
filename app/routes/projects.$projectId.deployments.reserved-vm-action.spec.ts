import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return { ...actual, apiRequest: apiRequestMock };
});

import { action } from './projects.$projectId.deployments';

function reservedVmActionRequest(fields: Record<string, string> = {}) {
  return new Request('https://e-code.ai/projects/project_1/deployments?workspace=workspace_1', {
    method: 'POST',
    body: new URLSearchParams({
      provider: 'server',
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-2',
      reservedVmTermsVersion: 'reserved-vm-2026-08',
      reservedVmMonthlyPriceCents: '8000',
      reservedVmConfirmation: 'on',
      idempotencyKey: 'deploy-attempt-0001',
      environment: 'production',
      workspaceId: 'workspace_1',
      ...fields,
    }),
  });
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ deployment: { id: 'deployment_1' } });
});

describe('Reserved VM deployment action', () => {
  it('forwards explicit consent and its exact tier, terms revision and cents to the existing create endpoint', async () => {
    const request = reservedVmActionRequest();

    const response = (await action({
      request,
      params: { projectId: 'project_1' },
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(302);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    const [, path, options] = apiRequestMock.mock.calls[0] as [
      Request,
      string,
      { body: string; headers: Record<string, string> },
    ];

    const payload = JSON.parse(options.body) as Record<string, unknown>;

    expect(path).toBe('/projects/project_1/deployments');
    expect(options.headers).toEqual({ 'Idempotency-Key': 'deploy-attempt-0001' });
    expect(payload).toMatchObject({
      provider: 'server',
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-2',
      reservedVmConfirmation: {
        accepted: true,
        termsVersion: 'reserved-vm-2026-08',
        monthlyPriceCents: 8_000,
      },
      workspaceId: 'workspace_1',
    });
    expect(response.headers.get('location')).toBe('/projects/project_1/deployments?workspace=workspace_1');
  });

  it('refuses missing confirmation and tampered price before any API reservation or billing call', async () => {
    for (const fields of [
      { reservedVmConfirmation: '' },
      { reservedVmMonthlyPriceCents: '4000' },
      { reservedVmTermsVersion: '' },
    ]) {
      const response = (await action({
        request: reservedVmActionRequest(fields),
        params: { projectId: 'project_1' },
        context: {},
      } as never)) as { init: { status: number } };

      expect(response.init.status).toBe(400);
    }

    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('keeps autoscale distinct and never attaches Reserved VM billing fields to it', async () => {
    const request = reservedVmActionRequest({
      runtimeKind: 'autoscale',
      reservedVmConfirmation: 'on',
    });

    await action({ request, params: { projectId: 'project_1' }, context: {} } as never);

    const options = apiRequestMock.mock.calls[0]?.[2] as { body: string };
    const payload = JSON.parse(options.body) as Record<string, unknown>;

    expect(payload.runtimeKind).toBe('autoscale');
    expect(payload).not.toHaveProperty('reservedVmTier');
    expect(payload).not.toHaveProperty('reservedVmConfirmation');
  });

  it('sends an in-place Reserved VM tier change with CAS and the same idempotency attempt key', async () => {
    const request = reservedVmActionRequest({
      intent: 'runtime',
      deploymentId: 'deployment_1',
      expectedRuntimeVersion: '0',
      reservedVmTier: 'dedicated-4',
      reservedVmMonthlyPriceCents: '16000',
      idempotencyKey: 'runtime-attempt-0001',
    });

    const response = (await action({ request, params: { projectId: 'project_1' }, context: {} } as never)) as Response;

    const [, path, options] = apiRequestMock.mock.calls[0] as [
      Request,
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];

    expect(response.status).toBe(302);
    expect(path).toBe('/projects/project_1/deployments/deployment_1/runtime');
    expect(options.method).toBe('PATCH');
    expect(options.headers).toEqual({ 'Idempotency-Key': 'runtime-attempt-0001' });
    expect(JSON.parse(options.body)).toEqual({
      expectedRuntimeVersion: 0,
      runtimeKind: 'reserved-vm',
      reservedVmTier: 'dedicated-4',
      reservedVmConfirmation: {
        accepted: true,
        termsVersion: 'reserved-vm-2026-08',
        monthlyPriceCents: 16_000,
      },
    });
  });

  it('changes in place to autoscale without leaking stale Reserved VM billing fields', async () => {
    const request = reservedVmActionRequest({
      intent: 'runtime',
      deploymentId: 'deployment_1',
      expectedRuntimeVersion: '5',
      runtimeKind: 'autoscale',
      machineSize: 'dedicated-1',
      idempotencyKey: 'runtime-attempt-0002',
    });

    await action({ request, params: { projectId: 'project_1' }, context: {} } as never);

    const options = apiRequestMock.mock.calls[0]?.[2] as { body: string };

    expect(JSON.parse(options.body)).toEqual({
      expectedRuntimeVersion: 5,
      runtimeKind: 'autoscale',
      machineSize: 'dedicated-1',
    });
  });

  it('blocks a missing CAS version before calling the runtime mutation endpoint', async () => {
    const response = (await action({
      request: reservedVmActionRequest({
        intent: 'runtime',
        deploymentId: 'deployment_1',
        expectedRuntimeVersion: '',
      }),
      params: { projectId: 'project_1' },
      context: {},
    } as never)) as { init: { status: number } };

    expect(response.init.status).toBe(400);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
