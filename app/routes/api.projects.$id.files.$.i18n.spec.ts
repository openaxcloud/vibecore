/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return { ...actual, apiRequest: apiRequestMock };
});

async function thrownResponse(promise: Promise<unknown>): Promise<Response> {
  const thrown = await promise.then(
    () => undefined,
    (error) => error,
  );

  expect(thrown).toBeInstanceOf(Response);

  return thrown as Response;
}

function frenchRequest(path: string, init?: RequestInit) {
  return new Request(`https://e-code.ai${path}`, {
    ...init,
    headers: {
      Cookie: 'vibecore-lang=fr',
      ...Object.fromEntries(new Headers(init?.headers).entries()),
    },
  });
}

describe('project file route i18n boundary', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('localizes a corrupted runtime file without exposing the raw content', async () => {
    apiRequestMock.mockResolvedValueOnce({ content: 'SECRET%%%INVALID%%%BASE64=', encoding: 'base64' });

    const { loader } = await import('./api.projects.$id.files.$');

    const response = await thrownResponse(
      loader({
        request: frenchRequest('/api/projects/project-1/files/public/logo.png'),
        params: { id: 'project-1', '*': 'public/logo.png' },
        context: {},
      } as never),
    );

    const body = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(body).toEqual({
      ok: false,
      error: 'Impossible de lire le fichier du projet. Veuillez réessayer.',
      code: 'PROJECT_FILE_READ_FAILED',
    });
    expect(JSON.stringify(body)).not.toContain('SECRET');
  });

  it('maps invalid write JSON to a localized stable code before calling the runtime', async () => {
    const { action } = await import('./api.projects.$id.files.$');

    const response = await thrownResponse(
      action({
        request: frenchRequest('/api/projects/project-1/files/src/main.tsx', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{not-json',
        }),
        params: { id: 'project-1', '*': 'src/main.tsx' },
        context: {},
      } as never),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Le corps de la requête doit contenir un JSON valide.',
      code: 'INVALID_JSON_BODY',
    });
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('masks upstream response bodies while preserving a safe status', async () => {
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'SECRET_RUNTIME_HOST: internal failure' }), { status: 503 }),
    );

    const { loader } = await import('./api.projects.$id.files.$');

    const response = await thrownResponse(
      loader({
        request: frenchRequest('/api/projects/project-1/files/src/main.tsx'),
        params: { id: 'project-1', '*': 'src/main.tsx' },
        context: {},
      } as never),
    );

    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ code: 'PROJECT_FILE_READ_FAILED' });
    expect(JSON.stringify(body)).not.toContain('SECRET_RUNTIME_HOST');
    expect(JSON.stringify(body)).not.toContain('internal failure');
  });
});
