import { afterEach, describe, expect, it, vi } from 'vitest';
import { toResponse } from '~/lib/test/rr7-data';
import { action as billingAction, loader as billingLoader } from '~/routes/billing';
import { loader as invitationsLoader } from '~/routes/invitations';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function request(path: string) {
  return new Request(`https://vibecore.local${path}`, {
    headers: { cookie: 'vc_session=session-token' },
  });
}

function formRequest(path: string, fields: Record<string, string>) {
  return new Request(`https://vibecore.local${path}`, {
    method: 'POST',
    headers: { cookie: 'vc_session=session-token', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
}

describe('platform access loaders', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders billing with an access-limited state instead of throwing on billing:read 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/orgs')) {
          return jsonResponse({ organizations: [{ id: 'org_1' }] });
        }

        if (url.endsWith('/orgs/org_1/billing')) {
          return jsonResponse({ error: 'Missing permission: billing:read', code: 'RBAC_FORBIDDEN' }, 403);
        }

        throw new Error(`Unexpected billing request: ${url}`);
      }),
    );

    const response = toResponse(
      await billingLoader({ request: request('/billing'), params: {}, context: {} as never }),
    );

    const payload = await response.json();

    expect(payload.billingAccessLimited).toBe(true);
    expect(payload.billing.plan.name).toBe('Unavailable');
  });

  it('returns checkout errors inline instead of throwing the billing route boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/orgs')) {
          return jsonResponse({ organizations: [{ id: 'org_1' }] });
        }

        if (url.endsWith('/orgs/org_1/billing/checkout')) {
          return jsonResponse({ error: 'Stripe price is not configured for this plan' }, 503);
        }

        throw new Error(`Unexpected checkout request: ${url}`);
      }),
    );

    const response = toResponse(
      await billingAction({
        request: formRequest('/billing', { planKey: 'pro' }),
        params: {},
        context: {} as never,
      }),
    );

    const payload = (await response.json()) as { errorKey?: string };

    expect(response.status).toBe(503);
    expect(payload.errorKey).toBe('billing.feedback.checkoutUnavailable');
  });

  it('returns portal errors inline instead of throwing the billing route boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/orgs')) {
          return jsonResponse({ organizations: [{ id: 'org_1' }] });
        }

        if (url.endsWith('/orgs/org_1/billing/portal')) {
          return jsonResponse({ error: 'Stripe is not configured' }, 503);
        }

        throw new Error(`Unexpected portal request: ${url}`);
      }),
    );

    const response = toResponse(
      await billingAction({
        request: formRequest('/billing', { intent: 'portal' }),
        params: {},
        context: {} as never,
      }),
    );

    const payload = (await response.json()) as { errorKey?: string };

    expect(response.status).toBe(503);
    expect(payload.errorKey).toBe('billing.feedback.portalUnavailable');
  });

  it('renders invitations with an access-limited state instead of throwing on members:manage 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/orgs')) {
          return jsonResponse({ organizations: [{ id: 'org_1' }] });
        }

        if (url.endsWith('/orgs/org_1/roles')) {
          return jsonResponse({ roles: [] });
        }

        if (url.endsWith('/orgs/org_1/invitations')) {
          return jsonResponse({ error: 'Missing permission: members:manage', code: 'RBAC_FORBIDDEN' }, 403);
        }

        throw new Error(`Unexpected invitations request: ${url}`);
      }),
    );

    const response = toResponse(
      await invitationsLoader({
        request: request('/invitations'),
        params: {},
        context: {} as never,
      }),
    );

    const payload = await response.json();

    expect(payload.canManageInvitations).toBe(false);
    expect(payload.invitations).toEqual([]);
  });
});
