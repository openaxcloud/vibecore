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

function formRequest(fields: Record<string, string>, language = 'en-US'): Request {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return new Request('https://app.test/projects/p1/secrets', {
    method: 'POST',
    body: form,
    headers: { 'Accept-Language': language },
  });
}

describe('secretRows', () => {
  it('renders one explanatory empty row when there are no secrets', () => {
    expect(secretRows([])).toEqual([
      {
        kind: 'empty',
        title: 'No project secrets',
        detail: 'Secrets are encrypted and their values are never listed in plain text.',
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
    expect(secretDetail({ id: '1', key: 'X', updatedAt: '2026-01-01T00:00:00.000Z' })).toMatch(/^Encrypted · updated/);
  });

  it('formats French empty and dated rows while preserving secret identifiers', () => {
    expect(secretRows([], 'fr')).toEqual([
      {
        kind: 'empty',
        title: 'Aucun secret de projet',
        detail: 'Les secrets sont chiffrés et leurs valeurs ne sont jamais affichées en clair.',
      },
    ]);
    expect(secretDetail({ id: '1', key: 'STRIPE_SECRET_KEY', updatedAt: '2026-01-01T00:00:00.000Z' }, 'fr')).toBe(
      'Chiffré · mis à jour le 1 janv. 2026, 00:00',
    );
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
    expect(result.data.error).toBe('The secret could not be deleted. Refresh the page and try again.');
    expect(result.data.error).not.toContain('forbidden');
  });

  it('returns a safe French save error without exposing the API response', async () => {
    apiRequest.mockRejectedValueOnce(new Response('raw credential validation detail', { status: 400 }));

    const { action } = await import('./projects.$projectId.secrets');

    const result = (await action({
      request: formRequest({ key: 'bad-key', value: 'secret' }, 'fr-FR'),
      params: { projectId: 'p1' },
      context: {},
    } as never)) as { data: { error?: string }; init?: { status?: number } };

    expect(result.init?.status).toBe(400);
    expect(result.data.error).toBe('Impossible d’enregistrer le secret. Vérifiez son nom, puis réessayez.');
    expect(result.data.error).not.toContain('credential');
  });
});
