import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return { ...actual, apiRequest: (...args: unknown[]) => apiRequestMock(...args) };
});

import { projectAction, projectLoader, projectPageLoader } from './project-route.server';

beforeEach(() => apiRequestMock.mockReset());

describe('localized project route loaders', () => {
  it('returns the resolved language and persistence headers with project data', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ project: { id: 'project-1', name: 'Projet client', organizationId: 'org-1' } })
      .mockResolvedValueOnce({ activity: [] });

    const response = (await projectLoader(
      new Request('https://e-code.ai/projects/project-1?lang=fr'),
      'project-1',
      '/projects/project-1/activity',
    )) as {
      data: { language: string; project: { name: string } };
      init: { headers: HeadersInit };
    };

    const headers = new Headers(response.init.headers);

    expect(response.data.language).toBe('fr');
    expect(response.data.project.name).toBe('Projet client');
    expect(headers.get('Content-Language')).toBe('fr');
    expect(headers.get('Set-Cookie')).toContain('vibecore-lang=fr');
  });

  it('uses a stable non-English error code for a missing project parameter', async () => {
    await expect(
      projectPageLoader(
        {
          request: new Request('https://e-code.ai/projects?lang=fr'),
          params: {},
          context: {},
        } as never,
        () => '/projects/missing',
      ),
    ).rejects.toMatchObject({
      data: { ok: false, errorCode: 'projectNotFound' },
      init: { status: 404 },
    });
  });

  it('localizes an unsupported project action without echoing the intent', async () => {
    const form = new FormData();
    form.set('intent', 'raw-user-intent');

    const response = (await projectAction(
      {
        request: new Request('https://e-code.ai/projects/project-1/settings?lang=fr', {
          method: 'POST',
          body: form,
        }),
        params: { projectId: 'project-1' },
        context: {},
      } as never,
      {},
    )) as {
      data: { error: string; code: string };
      init: { status: number; headers: HeadersInit };
    };

    expect(response.init.status).toBe(400);
    expect(new Headers(response.init.headers).get('Content-Language')).toBe('fr');
    expect(response.data).toEqual({
      error: 'Cette action n’est pas prise en charge.',
      code: 'UNSUPPORTED_ACTION',
    });
  });
});
