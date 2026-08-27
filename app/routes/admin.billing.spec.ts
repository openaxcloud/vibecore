/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
const requirePlatformAdmin = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
  };
});

import { action, loader } from './admin.billing';

type ActionPayload = {
  statusCode?: string;
  errorCode?: string;
  intent?: string;
  field?: string;
};

type DataResult<Value> = { data: Value; init?: ResponseInit };

function actionRequest(fields: Record<string, string>, language = 'en'): Request {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request('https://app.test/admin/billing', {
    method: 'POST',
    body: form,
    headers: { Cookie: `vibecore-lang=${language}` },
  });
}

function actionArgs(request: Request) {
  return { request, params: {}, context: {} } as unknown as Parameters<typeof action>[0];
}

function loaderArgs(request: Request) {
  return { request, params: {}, context: {} } as unknown as Parameters<typeof loader>[0];
}

function apiError(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  apiRequest.mockReset();
  requirePlatformAdmin.mockReset();
});

describe('admin billing loader', () => {
  it('loads plans and subscriptions with the resolved French locale', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({
      plans: [{ key: 'pro', name: 'Customer-owned Pro', monthlyCents: 2500 }],
      subscriptions: [{ id: 'sub_1', organizationId: 'org_1', status: 'ACTIVE' }],
    });

    const result = (await loader(
      loaderArgs(
        new Request('https://app.test/admin/billing', {
          headers: { Cookie: 'vibecore-lang=fr' },
        }),
      ),
    )) as DataResult<{
      language: string;
      plans: Array<{ key: string }>;
      subscriptions: Array<{ id: string }>;
    }>;

    expect(requirePlatformAdmin).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][1]).toBe('/admin/billing');
    expect(result.data.language).toBe('fr');
    expect(result.data.plans).toEqual([expect.objectContaining({ key: 'pro' })]);
    expect(result.data.subscriptions).toEqual([expect.objectContaining({ id: 'sub_1' })]);
  });
});

describe('admin billing action', () => {
  it('rejects a missing or unsupported mutation intent', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    const result = (await action(
      actionArgs(actionRequest({ intent: 'future-change', password: 'pw' })),
    )) as DataResult<ActionPayload>;

    expect(result.init?.status).toBe(400);
    expect(result.data).toEqual({ errorCode: 'invalidIntent' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('requires the confirmation password before validating a supported mutation', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    const result = (await action(
      actionArgs(actionRequest({ intent: 'quota', orgId: 'org_1', key: 'projects.count', limit: '12' })),
    )) as DataResult<ActionPayload>;

    expect(result.data).toEqual({ errorCode: 'passwordRequired', intent: 'quota', field: 'password' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('returns field-specific structured errors for incomplete quota and plan forms', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    const cases: Array<{ fields: Record<string, string>; expected: ActionPayload }> = [
      {
        fields: { intent: 'quota', password: 'pw' },
        expected: { errorCode: 'organizationRequired', intent: 'quota', field: 'orgId' },
      },
      {
        fields: { intent: 'quota', password: 'pw', orgId: 'org_1' },
        expected: { errorCode: 'quotaKeyRequired', intent: 'quota', field: 'key' },
      },
      {
        fields: { intent: 'quota', password: 'pw', orgId: 'org_1', key: 'projects.count' },
        expected: { errorCode: 'limitRequired', intent: 'quota', field: 'limit' },
      },
      {
        fields: { intent: 'plan', password: 'pw', orgId: 'org_1' },
        expected: { errorCode: 'planRequired', intent: 'plan', field: 'planKey' },
      },
      {
        fields: { intent: 'plan', password: 'pw', orgId: 'org_1', planKey: 'pro' },
        expected: { errorCode: 'reasonRequired', intent: 'plan', field: 'reason' },
      },
    ];

    for (const testCase of cases) {
      const result = (await action(actionArgs(actionRequest(testCase.fields)))) as DataResult<ActionPayload>;

      expect(result.init?.status).toBe(400);
      expect(result.data).toEqual(testCase.expected);
    }

    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('rejects negative, fractional and non-numeric quota limits before reauthentication', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);

    for (const limit of ['-1', '1.5', 'not-a-number']) {
      const result = (await action(
        actionArgs(
          actionRequest({
            intent: 'quota',
            password: 'pw',
            orgId: 'org_1',
            key: 'projects.count',
            limit,
          }),
        ),
      )) as DataResult<ActionPayload>;

      expect(result.data).toEqual({ errorCode: 'invalidLimit', intent: 'quota', field: 'limit' });
    }

    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('maps incorrect-password and reauthentication failures without raw API prose', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockRejectedValueOnce(apiError(401, 'Incorrect password from private upstream'));

    const incorrect = (await action(
      actionArgs(
        actionRequest({
          intent: 'quota',
          password: 'wrong',
          orgId: 'org_1',
          key: 'projects.count',
          limit: '12',
        }),
      ),
    )) as DataResult<ActionPayload>;

    expect(incorrect.init?.status).toBe(401);
    expect(incorrect.data).toEqual({ errorCode: 'incorrectPassword', intent: 'quota', field: 'password' });
    expect(JSON.stringify(incorrect.data)).not.toContain('private upstream');

    apiRequest.mockRejectedValueOnce(new Error('connect ECONNREFUSED billing-private-host'));

    const unavailable = (await action(
      actionArgs(
        actionRequest({
          intent: 'plan',
          password: 'pw',
          orgId: 'org_1',
          planKey: 'pro',
          reason: 'Customer request',
        }),
      ),
    )) as DataResult<ActionPayload>;

    expect(unavailable.init?.status).toBe(502);
    expect(unavailable.data).toEqual({ errorCode: 'serviceUnavailable', intent: 'plan' });
    expect(JSON.stringify(unavailable.data)).not.toContain('billing-private-host');
  });

  it('creates a quota override with normalized IDs and a localized default audit reason', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({ reauthenticated: true }).mockResolvedValueOnce({ override: {} });

    const result = (await action(
      actionArgs(
        actionRequest(
          {
            intent: 'quota',
            password: 'admin-password',
            orgId: '  org_eu_123  ',
            key: '  projects.count  ',
            limit: '1234',
            reason: '   ',
          },
          'fr',
        ),
      ),
    )) as DataResult<ActionPayload>;

    expect(apiRequest.mock.calls[0][1]).toBe('/auth/reauth');
    expect(apiRequest.mock.calls[1][1]).toBe('/admin/quota-overrides');
    expect(JSON.parse(String((apiRequest.mock.calls[1][2] as RequestInit).body))).toEqual({
      organizationId: 'org_eu_123',
      key: 'projects.count',
      limit: 1234,
      reason: 'Dérogation de facturation créée par l’administration',
    });
    expect(result.data).toEqual({ statusCode: 'quotaCreated', intent: 'quota' });
  });

  it('preserves the plan key and user-authored reason when applying a plan override', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({ reauthenticated: true }).mockResolvedValueOnce({ subscription: {} });

    const reason = '  Contrat signé — conserver exactement  ';

    const result = (await action(
      actionArgs(
        actionRequest({
          intent: 'plan',
          password: 'admin-password',
          orgId: 'org_enterprise_1',
          planKey: 'enterprise',
          reason,
        }),
      ),
    )) as DataResult<ActionPayload>;

    expect(apiRequest.mock.calls[1][1]).toBe('/admin/plan-overrides');
    expect(JSON.parse(String((apiRequest.mock.calls[1][2] as RequestInit).body))).toEqual({
      organizationId: 'org_enterprise_1',
      planKey: 'enterprise',
      reason,
    });
    expect(result.data).toEqual({ statusCode: 'planCreated', intent: 'plan' });
  });

  it('maps mutation API failures to safe codes and never echoes raw billing details', async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce({ reauthenticated: true });
    apiRequest.mockRejectedValueOnce(apiError(404, 'Raw tenant and Stripe customer detail'));

    const result = (await action(
      actionArgs(
        actionRequest({
          intent: 'quota',
          password: 'pw',
          orgId: 'org_missing',
          key: 'projects.count',
          limit: '12',
        }),
      ),
    )) as DataResult<ActionPayload>;

    expect(result.init?.status).toBe(404);
    expect(result.data).toEqual({ errorCode: 'resourceNotFound', intent: 'quota' });
    expect(JSON.stringify(result.data)).not.toContain('Raw tenant');
    expect(JSON.stringify(result.data)).not.toContain('Stripe customer detail');
  });
});
