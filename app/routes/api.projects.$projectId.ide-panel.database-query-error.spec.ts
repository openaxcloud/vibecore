import { afterEach, describe, expect, it, vi } from 'vitest';
import { toResponse } from '~/lib/test/rr7-data';

const apiRequest = vi.fn();
vi.mock('~/lib/enterprise-api.server', async () => ({
  ...(await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server')),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
afterEach(() => apiRequest.mockReset());

async function query() {
  const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
  const body = new FormData();
  body.set('intent', 'query');
  body.set('connectionKey', 'DATABASE_URL');
  body.set('query', 'CREATE TABLE "public"."Contacts" ("id" integer);');

  return toResponse(
    await action({
      request: new Request('https://app.test/api/projects/fixture/ide-panel/database?lang=en', {
        method: 'POST',
        body,
      }),
      params: { projectId: 'fixture', panel: 'database' },
    } as any),
  );
}

describe('database query failures stay in the form', () => {
  it.each([400, 401, 403, 409, 429, 500, 503])(
    'returns masked data with HTTP %s instead of throwing to the route boundary',
    async (status) => {
      apiRequest.mockRejectedValue(
        new Response(JSON.stringify({ error: 'postgres://private@host/internal', query: 'private SQL' }), { status }),
      );

      const response = await query();
      expect(response.status).toBe(status);

      const data = await response.json();
      expect(data.ok).toBe(false);
      expect(typeof data.error).toBe('string');
      expect(data.error.length).toBeGreaterThan(0);
      expect(JSON.stringify(data)).not.toMatch(/private|postgres:\/\//);
      expect(apiRequest).toHaveBeenCalledTimes(1);
      expect(apiRequest.mock.calls[0][2].redirectOn401).toBe(false);
    },
  );

  it('preserves a confirmed creation response', async () => {
    apiRequest.mockResolvedValue({ result: { command: 'CREATE', rows: [], rowCount: 0 } });

    const response = await query();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: { command: 'CREATE', rows: [], rowCount: 0 } });
  });
});
