import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeRows } from '~/components/database/query-result';
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
    expect(await response.json()).toEqual({ ok: true, result: { command: 'CREATE', rowsJson: '[]', rowCount: 0 } });
  });
});

// Use the serializer installed by React Router, not a hand-written approximation.
const require = createRequire(import.meta.url);
const { encode, decode } = createRequire(require.resolve('react-router'))('turbo-stream');
it.each([
  'own proto',
  null,
  { nested: 'own JSON' },
  JSON.parse('{"__proto__":{"marker":"nested"},"constructor":"c","prototype":"p"}'),
  [JSON.parse('{"__proto__":{"marker":"array"}}')],
])('preserves special column values through the real single-fetch serializer: %j', async (value) => {
  const row = Object.fromEntries([
    ['__proto__', value],
    ['constructor', 'own ctor'],
    ['prototype', 'own prototype'],
    ['amount', '900719925474099312345.000001'],
    ['flag', false],
  ]);
  apiRequest.mockResolvedValue({
    result: {
      columns: ['__proto__', 'constructor', 'prototype', 'amount', 'flag'],
      rows: [row],
      rowCount: 1,
      command: 'SELECT',
    },
  });

  const response = await query();
  const data = await response.json();
  const roundTrip = (await decode(encode(data))).value;
  expect(normalizeRows(roundTrip.result).rows).toEqual([
    [value, 'own ctor', 'own prototype', '900719925474099312345.000001', false],
  ]);
  expect(roundTrip.result).toMatchObject({ rowCount: 1, command: 'SELECT' });
  expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
  expect(Object.hasOwn(Object.prototype, 'nested')).toBe(false);
});
it('preserves array rows and never reads an inherited column from object rows', async () => {
  apiRequest.mockResolvedValue({
    result: { columns: ['__proto__'], rows: [['already array'], {}], rowCount: 2, command: 'SELECT' },
  });

  const data = await (await query()).json();
  expect(normalizeRows(data.result).rows).toEqual([['already array'], [null]]);
});
