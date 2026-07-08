import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * apiRequest is mocked at the module boundary so the route action can be exercised without a live
 * backend. project-route.server re-imports the same enterprise-api module, so a single mock covers
 * both the route and the projectAction dispatcher. redirect/json/apiErrorMessage stay real.
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function formRequest(fields: Record<string, string>): Request {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request('https://app.test/projects/p1/settings', { method: 'POST', body: form });
}

describe('project settings route action', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('patches /settings with the submitted metadata then redirects on success', async () => {
    apiRequest.mockResolvedValueOnce({});

    const { action } = await import('./projects.$projectId.settings');

    const response = await action({
      request: formRequest({ name: 'My App', description: 'desc', gitRepositoryUrl: '', gitDefaultBranch: 'main' }),
      params: { projectId: 'p1' },
      context: {},
    } as never);

    expect(apiRequest).toHaveBeenCalledTimes(1);

    const [, path, init] = apiRequest.mock.calls[0];

    expect(path).toBe('/projects/p1/settings');
    expect(init).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      name: 'My App',
      description: 'desc',
      gitRepositoryUrl: undefined,
      gitDefaultBranch: 'main',
    });
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('location')).toBe('/projects/p1/settings');
  });

  it('surfaces a validation failure inline instead of throwing to an error boundary', async () => {
    apiRequest.mockRejectedValueOnce(new Response('bad name', { status: 400 }));

    const { action } = await import('./projects.$projectId.settings');

    /* react-router's data() wrapper carries the payload in .data and the http status in .init. */
    const result = (await action({
      request: formRequest({ name: '', description: '', gitRepositoryUrl: '', gitDefaultBranch: '' }),
      params: { projectId: 'p1' },
      context: {},
    } as never)) as { data: { error?: string }; init?: { status?: number } };

    expect(result.init?.status).toBe(400);
    expect(typeof result.data.error).toBe('string');
  });

  it('rename-slug intent PATCHes only the slug and returns the new slug on success', async () => {
    apiRequest.mockResolvedValueOnce({ project: { slug: 'my-new-slug' } });

    const { action } = await import('./projects.$projectId.settings');

    const result = (await action({
      request: formRequest({ intent: 'rename-slug', slug: 'my-new-slug' }),
      params: { projectId: 'p1' },
      context: {},
    } as never)) as { data: { ok?: boolean; slug?: string } };

    expect(apiRequest).toHaveBeenCalledTimes(1);

    const [, path, init] = apiRequest.mock.calls[0];

    expect(path).toBe('/projects/p1/settings');
    expect(init).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse((init as { body: string }).body)).toEqual({ slug: 'my-new-slug' });
    expect(result.data).toMatchObject({ ok: true, slug: 'my-new-slug' });
  });

  it('rename-slug surfaces a duplicate-slug 409 inline instead of throwing', async () => {
    apiRequest.mockRejectedValueOnce(new Response('slug taken', { status: 409 }));

    const { action } = await import('./projects.$projectId.settings');

    const result = (await action({
      request: formRequest({ intent: 'rename-slug', slug: 'taken' }),
      params: { projectId: 'p1' },
      context: {},
    } as never)) as { data: { ok?: boolean; error?: string }; init?: { status?: number } };

    expect(result.init?.status).toBe(409);
    expect(result.data.ok).toBe(false);
    expect(typeof result.data.error).toBe('string');
  });

  it('re-throws a session-expiry login redirect instead of swallowing it into an inline error', async () => {
    /* A 302 to /login (or the MFA re-auth path) is an instanceof Response; it must propagate. */
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { location: '/login?returnTo=%2Fprojects%2Fp1%2Fsettings' },
    });
    apiRequest.mockRejectedValueOnce(loginRedirect);

    const { action } = await import('./projects.$projectId.settings');

    let thrown: unknown;

    try {
      await action({
        request: formRequest({ name: 'My App', description: '', gitRepositoryUrl: '', gitDefaultBranch: 'main' }),
        params: { projectId: 'p1' },
        context: {},
      } as never);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(loginRedirect);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get('location')).toBe('/login?returnTo=%2Fprojects%2Fp1%2Fsettings');
  });
});
