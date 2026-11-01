import { afterEach, describe, expect, it, vi } from 'vitest';
import { toResponse } from '~/lib/test/rr7-data';

const apiRequest = vi.fn();
vi.mock('~/lib/enterprise-api.server', async () => ({
  ...(await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server')),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
afterEach(() => apiRequest.mockReset());

async function insert(values: string, projectId = 'project-a') {
  const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
  const body = new FormData();

  for (const [key, value] of Object.entries({
    intent: 'insert-row',
    connectionKey: 'DATABASE_URL',
    schemaName: 'public',
    tableName: 'Contact List',
    values,
  })) {
    body.set(key, value);
  }

  return toResponse(
    await action({
      request: new Request('https://app.test/api/projects/fixture/ide-panel/database?lang=en', {
        method: 'POST',
        body,
      }),
      params: { projectId, panel: 'database' },
    } as any),
  );
}

describe('database row insertion proxy', () => {
  it('forwards structured values unchanged to the current project and connection', async () => {
    apiRequest.mockResolvedValue({ result: { command: 'INSERT', rowCount: 1 } });

    const values = [
      { column: 'label', mode: 'value', value: "O'Neil; SELECT 1" },
      { column: 'note', mode: 'null' },
      { column: 'score', mode: 'default' },
      { column: '__proto__', mode: 'value', value: 'ordinary text' },
    ];

    const response = await insert(JSON.stringify(values), 'project-b');
    expect(await response.json()).toEqual({ ok: true, result: { command: 'INSERT', rowCount: 1 } });
    expect(apiRequest).toHaveBeenCalledTimes(1);

    const [, path, options] = apiRequest.mock.calls[0];
    expect(path).toBe('/projects/project-b/databases/rows');
    expect(options.method).toBe('POST');
    expect(options.redirectOn401).toBe(false);
    expect(JSON.parse(options.body)).toEqual({ key: 'DATABASE_URL', schema: 'public', table: 'Contact List', values });
  });

  it('encodes the current project identifier without treating it as a path', async () => {
    apiRequest.mockResolvedValue({ result: { command: 'INSERT', rowCount: 1 } });
    await insert('[]', 'project/a?other');
    expect(apiRequest.mock.calls[0][1]).toBe('/projects/project%2Fa%3Fother/databases/rows');
  });

  it.each(['', 'null', '{}', '"value"', '{invalid'])(
    'rejects malformed values without an upstream write: %s',
    async (values) => {
      const response = await insert(values);
      expect(response.status).toBe(400);
      expect((await response.json()).ok).toBe(false);
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );

  it.each([400, 401, 403, 409, 429, 500, 503])('keeps the form mounted and masks HTTP %s failures', async (status) => {
    apiRequest.mockRejectedValue(
      new Response(JSON.stringify({ error: 'postgres://private@host/database', values: 'private customer row' }), {
        status,
      }),
    );

    const response = await insert('[]');
    expect(response.status).toBe(status);

    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(typeof data.error).toBe('string');
    expect(JSON.stringify(data)).not.toMatch(/private|postgres:/);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
