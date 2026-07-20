import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { action, galleryPreviewSandbox, loader } from './gallery.$slug';

function request(fields?: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields ?? {})) form.set(key, value);
  return new Request('https://app.example/gallery/orbit-crm', {
    method: fields ? 'POST' : 'GET',
    ...(fields ? { body: form } : {}),
  });
}

describe('Gallery application detail route', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    firstOrganization.mockReset();
    firstOrganization.mockResolvedValue({ id: 'org-1', slug: 'acme' });
  });

  it('loads the public application projection and its functional Preview metadata', async () => {
    apiRequest.mockResolvedValue({
      app: {
        id: 'demo:react-saas',
        slug: 'orbit-crm',
        name: 'Orbit CRM',
        previewUrl: '/gallery-apps/react-saas/preview/',
      },
    });

    const response = (await loader({ request: request(), params: { slug: 'orbit-crm' } } as never)) as {
      data: { app: { id: string; previewUrl: string }; previewSandbox: string };
    };

    expect(apiRequest).toHaveBeenCalledWith(expect.any(Request), '/gallery/apps/orbit-crm');
    expect(response.data.app).toMatchObject({
      id: 'demo:react-saas',
      previewUrl: '/gallery-apps/react-saas/preview/',
    });
    expect(response.data.previewSandbox).toContain('allow-same-origin');
  });

  it('only grants a functional same-origin sandbox to trusted demos or isolated deployment origins', () => {
    expect(
      galleryPreviewSandbox({
        appId: 'community-app',
        previewUrl: '/untrusted-preview/app',
        requestUrl: 'https://app.example/gallery/community-app',
      }),
    ).not.toContain('allow-same-origin');

    expect(
      galleryPreviewSandbox({
        appId: 'community-app',
        previewUrl: 'https://preview-123.isolated.example/',
        requestUrl: 'https://app.example/gallery/community-app',
      }),
    ).toContain('allow-same-origin');
  });

  it('Remixes from the detail page through the same isolated backend saga', async () => {
    apiRequest.mockResolvedValue({ projectId: 'remix-project-1' });
    const response = (await action({
      request: request({ intent: 'remix', appId: 'demo:react-saas', name: 'Orbit CRM' }),
      params: { slug: 'orbit-crm' },
    } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('remix-project-1');
    expect(apiRequest.mock.calls[0][1]).toBe('/organizations/org-1/gallery/apps/demo%3Areact-saas/remix');
    expect(apiRequest.mock.calls[0][2]).toMatchObject({
      method: 'POST',
      headers: { 'Idempotency-Key': expect.stringMatching(/^gallery-detail-/) },
    });
    expect(JSON.parse(apiRequest.mock.calls[0][2].body)).toEqual({ name: 'Orbit CRM Remix' });
  });
});
