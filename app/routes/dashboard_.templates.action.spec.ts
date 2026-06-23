import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Regression for the template-create action: a routine 4xx from the
 * `/orgs/{id}/projects/from-template` endpoint (most importantly the
 * project-quota / plan-limit rejection) used to propagate as a thrown Response
 * straight to the route/root error boundary, full-paging the user. It must now
 * be caught and surfaced inline via `actionData.error`, while genuine re-auth
 * redirects (3xx) and server errors (5xx) are still re-thrown to the framework.
 */

/*
 * Avoid dragging the SaaS UI tree (react-icons, etc.) into the test while still
 * providing the template catalog the action validates against.
 */
vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: () => null,
  LinkButton: () => null,
  TemplateGallery: () => null,
  templates: [{ id: 'react-saas', name: 'React SaaS' }],
}));

/*
 * Mock only the *network* boundary of the enterprise API module; keep the real
 * error-routing helpers (apiErrorMessage / isApiResponse / json / redirect /
 * formObject) so we exercise the action's real catch logic.
 */
const apiRequest = vi.fn();
const firstOrganization = vi.fn();

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    firstOrganization: (...args: unknown[]) => firstOrganization(...args),
  };
});

import { action } from './dashboard_.templates';
import { json as jsonData } from '~/lib/json-response';

function makeRequest(fields: Record<string, string>) {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request('https://app.example/dashboard/templates', { method: 'POST', body: form });
}

function quotaResponse(status: number, message: string) {
  return jsonData({ ok: false, error: message }, { status });
}

describe('dashboard templates action', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    firstOrganization.mockReset();
  });

  it('surfaces a project-quota (402) rejection inline instead of throwing to the error boundary', async () => {
    firstOrganization.mockResolvedValue({ id: 'org_1', slug: 'acme' });
    apiRequest.mockRejectedValue(quotaResponse(402, 'Project limit reached for your plan.'));

    const result = (await action({
      request: makeRequest({ templateName: 'react-saas' }),
    } as never)) as { data: { error?: string }; init?: ResponseInit };

    // React Router's data() helper returns a data wrapper, not a thrown Response.
    expect(result.data.error).toBe('Project limit reached for your plan.');
    expect(result.init?.status).toBe(402);
  });

  it('surfaces a 400 validation rejection inline', async () => {
    firstOrganization.mockResolvedValue({ id: 'org_1', slug: 'acme' });
    apiRequest.mockRejectedValue(quotaResponse(400, 'Slug already in use.'));

    const result = (await action({
      request: makeRequest({ templateName: 'react-saas' }),
    } as never)) as { data: { error?: string }; init?: ResponseInit };

    expect(result.data.error).toBe('Slug already in use.');
    expect(result.init?.status).toBe(400);
  });

  it('re-throws a mid-session re-auth redirect (302) so the browser follows it', async () => {
    firstOrganization.mockRejectedValue(
      new Response(null, { status: 302, headers: { Location: '/login?returnTo=%2Fdashboard%2Ftemplates' } }),
    );

    await expect(action({ request: makeRequest({ templateName: 'react-saas' }) } as never)).rejects.toMatchObject({
      status: 302,
    });
  });

  it('re-throws server errors (5xx) to the route error boundary', async () => {
    firstOrganization.mockResolvedValue({ id: 'org_1', slug: 'acme' });
    apiRequest.mockRejectedValue(quotaResponse(503, 'Upstream unavailable.'));

    await expect(action({ request: makeRequest({ templateName: 'react-saas' }) } as never)).rejects.toMatchObject({
      status: 503,
    });
  });

  it('keeps the local "template not available" guard for unknown templates', async () => {
    const result = (await action({
      request: makeRequest({ templateName: 'does-not-exist' }),
    } as never)) as { error?: string };

    expect(result.error).toBe('Template is not available in this workspace.');
    expect(firstOrganization).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
