/** Real auth/route handlers, synthetic in-memory metadata; database connection forbidden. */
import { Client } from 'pg';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildApiApp } from './app.js';
import { TestApiStore } from './tests/test-api-store.js';

let app: Awaited<ReturnType<typeof buildApiApp>> | undefined;
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('REDIS_URL', '');
  vi.stubEnv('WORKSPACE_MANAGER_URL', '');
  vi.stubGlobal('fetch', () => {
    throw new Error('External HTTP forbidden');
  });
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('rejects unauthorized, viewer, missing, ambiguous and non-Postgres connections before connecting', async () => {
  const connect = vi.spyOn(Client.prototype, 'connect').mockImplementation(() => {
    throw new Error('Database must not be touched');
  });

  const store = new TestApiStore();
  const owner = await store.createUser({ email: 'row-owner@example.invalid', passwordHash: 'disabled' });
  const viewer = await store.createUser({ email: 'row-viewer@example.invalid', passwordHash: 'disabled' });
  const outsider = await store.createUser({ email: 'row-outsider@example.invalid', passwordHash: 'disabled' });
  const org = await store.createOrganization({ name: 'Rows', slug: 'rows', ownerUserId: owner.id });
  await store.addMember({ organizationId: org.id, userId: viewer.id, roleKey: 'viewer' });
  await store.upsertSubscription({ organizationId: org.id, planKey: 'team', status: 'ACTIVE' });

  const project = await store.createProject({ organizationId: org.id, name: 'Rows', slug: 'rows' });

  for (const [user, token] of [
    [owner, 'row-owner'],
    [viewer, 'row-viewer'],
    [outsider, 'row-outsider'],
  ] as const) {
    await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 60000) });
  }
  await store.upsertProjectEnvVar({
    projectId: project.id,
    key: 'DATABASE_URL',
    value: 'postgresql://127.0.0.1:1/a',
    scope: 'development',
  });
  await store.upsertProjectEnvVar({
    projectId: project.id,
    key: 'DATABASE_URL',
    value: 'postgresql://127.0.0.1:1/b',
    scope: 'production',
  });
  await store.upsertProjectEnvVar({
    projectId: project.id,
    key: 'MYSQL_URL',
    value: 'mysql://127.0.0.1:1/a',
    scope: 'development',
  });
  app = await buildApiApp({ store });

  const send = (token: string, key = 'DATABASE_URL') =>
    app!.inject({
      method: 'POST',
      url: `/projects/${project.id}/databases/rows`,
      headers: { authorization: `Bearer ${token}` },
      payload: { key, schema: 'public', table: 'contacts', values: [] },
    });
  expect((await send('')).statusCode).toBe(401);
  expect((await send('row-viewer')).statusCode).toBe(403);
  expect([403, 404]).toContain((await send('row-outsider')).statusCode);
  expect((await send('row-owner', 'MISSING')).statusCode).toBe(404);

  const ambiguous = await send('row-owner');
  expect(ambiguous.statusCode).toBe(409);
  expect(ambiguous.json().code).toBe('DATABASE_CONNECTION_AMBIGUOUS');

  const dialect = await send('row-owner', 'MYSQL_URL');
  expect(dialect.statusCode).toBe(400);
  expect(dialect.json().code).toBe('DATABASE_ROW_POSTGRES_REQUIRED');
  expect(connect).not.toHaveBeenCalled();

  const end = vi.spyOn(Client.prototype, 'end').mockResolvedValue(undefined);
  await store.upsertProjectEnvVar({
    projectId: project.id,
    key: 'DATABASE_URL',
    value: 'postgresql://127.0.0.1:1/a',
    scope: 'production',
  });
  expect((await send('row-owner')).statusCode).toBe(500);
  expect(connect).toHaveBeenCalledTimes(1);
  expect(end).toHaveBeenCalledTimes(1);

  // The global JSON parser still rejects prototype keys; names are transported as values.
  connect.mockResolvedValue(undefined);

  const query = vi.spyOn(Client.prototype, 'query').mockImplementation((async (sql: string) => {
    if (sql.startsWith('SELECT')) {
      return {
        rows: ['__proto__', 'constructor'].map((columnName) => ({
          column_name: columnName,
          is_nullable: 'NO',
          is_identity: 'NO',
          is_generated: 'NEVER',
          has_default: false,
        })),
      };
    }

    return sql.startsWith('INSERT') ? { command: 'INSERT', rowCount: 1 } : { rows: [] };
  }) as Client['query']);
  const transport = (values: unknown) =>
    app!.inject({
      method: 'POST',
      url: `/projects/${project.id}/databases/rows`,
      headers: { authorization: 'Bearer row-owner', 'content-type': 'application/json' },
      payload: JSON.stringify({ key: 'DATABASE_URL', schema: 'public', table: 'contacts', values }),
    });

  const entries = [
    { column: '__proto__', mode: 'value', value: 'first' },
    { column: 'constructor', mode: 'value', value: 'second' },
  ];

  const inserted = await transport(entries);
  expect(inserted.statusCode, inserted.body).toBe(200);
  expect(inserted.json().result).toMatchObject({ command: 'INSERT', rowCount: 1 });
  expect(query).toHaveBeenCalledWith('INSERT INTO "public"."contacts" ("__proto__", "constructor") VALUES ($1, $2)', [
    'first',
    'second',
  ]);

  const calls = connect.mock.calls.length;
  expect((await transport([...entries, entries[0]])).statusCode).toBe(400);
  expect((await transport(JSON.parse('{"__proto__":{"mode":"null"}}'))).statusCode).toBe(400);
  expect(connect).toHaveBeenCalledTimes(calls);
});
