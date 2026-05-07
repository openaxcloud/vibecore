import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader as billingLoader } from '~/routes/billing';
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

    const response = await billingLoader({ request: request('/billing'), params: {}, context: {} as never });
    const payload = await response.json();

    expect(payload.billingAccessLimited).toBe(true);
    expect(payload.billing.plan.name).toBe('Unavailable');
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

    const response = await invitationsLoader({
      request: request('/invitations'),
      params: {},
      context: {} as never,
    });

    const payload = await response.json();

    expect(payload.canManageInvitations).toBe(false);
    expect(payload.invitations).toEqual([]);
  });
});
