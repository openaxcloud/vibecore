import { afterEach, describe, expect, it, vi } from 'vitest';
import { secretDetail, secretRows } from './projects.$projectId.secrets.rows';

/*
 * apiRequest/redirect/json are mocked at the module boundary so the route action can be
 * exercised without a live backend. project-route.server re-imports the same module, so a
 * single mock covers both the route and the projectAction dispatcher.
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

  return new Request('https://app.test/projects/p1/secrets', { method: 'POST', body: form });
}

describe('secretRows', () => {
  it('renders one explanatory empty row when there are no secrets', () => {
    expect(secretRows([])).toEqual([
      {
        kind: 'empty',
        title: 'No project secrets',
        detail: 'Secrets are encrypted and values are never listed in clear text.',
      },
    ]);
    expect(secretRows(undefined)).toHaveLength(1);
    expect(secretRows(null)).toHaveLength(1);
  });

  it('maps every secret to a deletable secret row keyed by its name', () => {
    const rows = secretRows([
      { id: '1', key: 'STRIPE_SECRET_KEY', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', key: 'OPENAI_API_KEY' },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === 'secret')).toBe(true);
    expect(rows.map((row) => (row.kind === 'secret' ? row.key : ''))).toEqual(['STRIPE_SECRET_KEY', 'OPENAI_API_KEY']);
  });

  it('falls back to a generic detail line when updatedAt is missing', () => {
    expect(secretDetail({ id: '1', key: 'X' })).toBe('Encrypted project secret');
    expect(secretDetail({ id: '1', key: 'X', updatedAt: '2026-01-01T00:00:00.000Z' })).toMatch(/^Encrypted, updated/);
  });
});

describe('secrets route action', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('routes the delete intent to a DELETE /secrets call with the key', async () => {
    apiRequest.mockResolvedValueOnce({});

    const { action } = await import('./projects.$projectId.secrets');

    const response = await action({
      request: formRequest({ intent: 'delete', key: 'STRIPE_SECRET_KEY' }),
      params: { projectId: 'p1' },
      context: {},
    } as never);

    expect(apiRequest).toHaveBeenCalledTimes(1);

    const [, path, init] = apiRequest.mock.calls[0];

    expect(path).toBe('/projects/p1/secrets');
    expect(init).toMatchObject({ method: 'DELETE' });
    expect(JSON.parse((init as { body: string }).body)).toEqual({ key: 'STRIPE_SECRET_KEY' });
    expect((response as Response).status).toBe(302);
  });

  it('still upserts via PUT for the default intent', async () => {
    apiRequest.mockResolvedValueOnce({});

    const { action } = await import('./projects.$projectId.secrets');
    await action({
      request: formRequest({ key: 'OPENAI_API_KEY', value: 'sk-test' }),
      params: { projectId: 'p1' },
      context: {},
    } as never);

    const [, path, init] = apiRequest.mock.calls[0];

    expect(path).toBe('/projects/p1/secrets');
    expect(init).toMatchObject({ method: 'PUT' });
    expect(JSON.parse((init as { body: string }).body)).toEqual({ key: 'OPENAI_API_KEY', value: 'sk-test' });
  });

  it('surfaces a delete failure inline instead of throwing', async () => {
    apiRequest.mockRejectedValueOnce(new Response('forbidden', { status: 403 }));

    const { action } = await import('./projects.$projectId.secrets');

    /* react-router's data() wrapper carries the payload in .data and the http status in .init. */
    const result = (await action({
      request: formRequest({ intent: 'delete', key: 'STRIPE_SECRET_KEY' }),
      params: { projectId: 'p1' },
      context: {},
    } as never)) as { data: { error?: string }; init?: { status?: number } };

    expect(result.init?.status).toBe(403);
    expect(typeof result.data.error).toBe('string');
  });
});
