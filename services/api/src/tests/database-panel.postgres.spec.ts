/** Real SQL and persistent authorization metadata; only an explicitly isolated loopback database. */
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { encryptJson } from '@vibecore/security';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { rowUpdateSql } from '../../../../app/components/database/sql-grid.js';
import { buildApiApp } from '../app.js';
import { PrismaApiStore } from '../prisma-store.js';

const url = process.env.DATABASE_PANEL_TEST_URL;
const run = url ? describe : describe.skip;

run('Database panel — real isolated PostgreSQL', () => {
  let prisma: DatabaseClient;
  let store: PrismaApiStore;
  let app: Awaited<ReturnType<typeof buildApiApp>>;

  const ownedOrganizations: string[] = [];
  const ownedUsers: string[] = [];
  const schema = `panel_${randomUUID().replaceAll('-', '')}`;

  let projectId: string;
  let otherProjectId: string;
  let ownerToken: string;
  let outsiderToken: string;
  let viewerToken: string;
  let sql: Client;

  const query = (statement: string, token = ownerToken, project = projectId, key = 'DATABASE_URL') =>
    app.inject({
      method: 'POST',
      url: `/projects/${project}/databases/query`,
      headers: { authorization: `Bearer ${token}` },
      payload: { key, query: statement },
    });

  beforeAll(async () => {
    const target = new URL(url!);

    if (
      !['localhost', '127.0.0.1'].includes(target.hostname) ||
      target.pathname !== '/database_audit' ||
      !['postgres:', 'postgresql:'].includes(target.protocol) ||
      target.search !== '' ||
      target.hash !== ''
    ) {
      throw new Error('Requires explicitly owned loopback database_audit database');
    }

    vi.stubEnv('DATABASE_URL', url);
    vi.stubEnv('REDIS_URL', '');
    vi.stubEnv('WORKSPACE_MANAGER_URL', '');
    vi.stubEnv('CONFIG_ENCRYPTION_KEY', 'synthetic-database-panel-test-only');
    vi.stubGlobal('fetch', async () => {
      throw new Error('External HTTP forbidden in database panel test');
    });
    prisma = createDatabaseClient({ poolMax: 2 });
    store = new PrismaApiStore(prisma);
    sql = new Client({ connectionString: url });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);

    const identity = async (role: 'owner' | 'viewer', organizationId?: string) => {
      const user = await store.createUser({
        email: `panel-${randomUUID()}@example.invalid`,
        passwordHash: 'disabled-synthetic-login',
      });
      ownedUsers.push(user.id);

      if (!organizationId) {
        const org = await store.createOrganization({
          name: 'Synthetic database panel',
          slug: `panel-${randomUUID()}`,
          ownerUserId: user.id,
        });
        organizationId = org.id;
        ownedOrganizations.push(org.id);
        await store.upsertSubscription({ organizationId, planKey: 'team', status: 'ACTIVE' });
      } else {
        await store.addMember({ organizationId, userId: user.id, roleKey: role });
      }

      const token = randomUUID();
      await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 600_000) });

      return { token, organizationId };
    };

    const owner = await identity('owner');
    ownerToken = owner.token;
    viewerToken = (await identity('viewer', owner.organizationId)).token;
    outsiderToken = (await identity('owner')).token;

    const project = await store.createProject({
      organizationId: owner.organizationId,
      name: 'Synthetic SQL',
      slug: `panel-${randomUUID()}`,
    });
    projectId = project.id;
    otherProjectId = (
      await store.createProject({
        organizationId: owner.organizationId,
        name: 'No database',
        slug: `panel-${randomUUID()}`,
      })
    ).id;
    await store.upsertProjectSecret({ projectId, key: 'DATABASE_URL', valueEncrypted: encryptJson({ value: url }) });
    app = await buildApiApp({
      store,
      emailProvider: {
        async send() {
          throw new Error('Email forbidden');
        },
      },
    });
  });

  afterAll(async () => {
    await app?.close();

    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }

    if (prisma) {
      await prisma.project.deleteMany({ where: { organizationId: { in: ownedOrganizations } } });
      await prisma.organization.deleteMany({ where: { id: { in: ownedOrganizations } } });
      await prisma.user.deleteMany({ where: { id: { in: ownedUsers } } });
      await prisma.$disconnect();
    }

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('creates, writes and returns the last SELECT in a real SQL batch', async () => {
    const response = await query(
      `CREATE TABLE "${schema}"."Odd Table" ("Id" integer PRIMARY KEY, "Value" text); INSERT INTO "${schema}"."Odd Table" VALUES (1, 'persisted'); SELECT * FROM "${schema}"."Odd Table";`,
    );
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().result).toMatchObject({
      columns: ['Id', 'Value'],
      rows: [{ Id: 1, Value: 'persisted' }],
      rowCount: 1,
    });

    const activities = await store.listProjectActivity(projectId);
    expect(activities.some((entry) => entry.action === 'database.query.execute')).toBe(true);
  });

  it('reopens persistent metadata and reads committed data using new API and SQL connections', async () => {
    await app.close();
    app = await buildApiApp({
      store: new PrismaApiStore(prisma),
      emailProvider: {
        async send() {
          throw new Error('Email forbidden');
        },
      },
    });

    const response = await query(`SELECT * FROM "${schema}"."Odd Table";`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().result.rows).toEqual([{ Id: 1, Value: 'persisted' }]);
  });

  it('preserves row-form data and authorization over HTTP from a new API process', async () => {
    // Synthetic fixture; the UI table creator is exercised separately in browser recipes.
    const created = await query(
      `CREATE TABLE "${schema}"."row_form_reload" ("id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "__proto__" text NOT NULL, "amount" numeric NOT NULL);`,
    );
    expect(created.statusCode, created.body).toBe(200);

    const payload = {
      key: 'DATABASE_URL',
      schema,
      table: 'row_form_reload',
      values: [
        { column: '__proto__', mode: 'value', value: 'saved synthetic row' },
        { column: 'amount', mode: 'value', value: '9007199254740993.125' },
      ],
    };
    const insert = (token: string, project = projectId) =>
      app.inject({
        method: 'POST',
        url: `/projects/${project}/databases/rows`,
        headers: { authorization: `Bearer ${token}` },
        payload,
      });

    const inserted = await insert(ownerToken);
    expect(inserted.statusCode, inserted.body).toBe(200);
    expect(inserted.json().result).toMatchObject({ command: 'INSERT', rowCount: 1 });
    await app.close();
    await prisma.$disconnect();

    const child = fork(fileURLToPath(new URL('../database-panel-process-child.ts', import.meta.url)), [], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        DATABASE_URL: url!,
        CONFIG_ENCRYPTION_KEY: 'synthetic-database-panel-test-only',
      },
    });

    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

    const delay = (milliseconds: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, milliseconds);
        timer.unref();
      });

    try {
      const ready = await new Promise<{ port: number; pid: number }>((resolve, reject) => {
        const timer = setTimeout(() => {
          finish();
          reject(new Error('Database API child startup timed out'));
        }, 30000);

        const finish = () => {
          clearTimeout(timer);
          child.off('exit', earlyExit);
          child.off('error', failure);
          child.off('message', message);
        };
        const failure = () => {
          finish();
          reject(new Error('Database API child failed'));
        };

        const earlyExit = () => failure();

        const message = (value: unknown) => {
          const info = value as { type?: string; port?: number; pid?: number };

          if (
            info?.type !== 'ready' ||
            !Number.isInteger(info.port) ||
            info.port! < 1 ||
            info.port! > 65535 ||
            info.pid !== child.pid
          ) {
            failure();
            return;
          }

          finish();
          resolve({ port: info.port!, pid: info.pid! });
        };
        child.once('exit', earlyExit);
        child.once('error', failure);
        child.on('message', message);
      });
      expect(ready.pid).not.toBe(process.pid);

      const http = (path: string, body: unknown, token: string) =>
        new Promise<{ status: number; body: any }>((resolve, reject) => {
          const encoded = JSON.stringify(body);

          const request = httpRequest(
            {
              hostname: '127.0.0.1',
              port: ready.port,
              path,
              method: 'POST',
              agent: false,
              headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(encoded),
              },
            },
            (response) => {
              let data = '';
              response.setEncoding('utf8');
              response.on('data', (chunk: string) => {
                data += chunk;

                if (data.length > 1048576) {
                  request.destroy(new Error('Response too large'));
                }
              });
              response.on('error', reject);
              response.on('end', () => {
                try {
                  resolve({ status: response.statusCode ?? 0, body: JSON.parse(data) });
                } catch {
                  reject(new Error('Invalid child API response'));
                }
              });
            },
          );
          request.setTimeout(10000, () => request.destroy(new Error('Child API HTTP timeout')));
          request.on('error', reject);
          request.end(encoded);
        });

      // The same persisted session and encrypted connection binding are reused, never recreated in the child.
      const response = await http(
        `/projects/${projectId}/databases/query`,
        {
          key: 'DATABASE_URL',
          query: `SELECT id, "__proto__" AS proto_value, amount FROM "${schema}"."row_form_reload" ORDER BY id`,
        },
        ownerToken,
      );
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.result.rows).toEqual([
        { id: '1', proto_value: 'saved synthetic row', amount: '9007199254740993.125' },
      ]);
      expect((await http(`/projects/${projectId}/databases/rows`, payload, viewerToken)).status).toBe(403);
      expect([403, 404]).toContain(
        (await http(`/projects/${projectId}/databases/rows`, payload, outsiderToken)).status,
      );
      expect((await http(`/projects/${otherProjectId}/databases/rows`, payload, ownerToken)).status).toBe(404);

      const unchanged = await http(
        `/projects/${projectId}/databases/query`,
        { key: 'DATABASE_URL', query: `SELECT count(*)::int AS count FROM "${schema}"."row_form_reload"` },
        ownerToken,
      );
      expect(unchanged.status).toBe(200);
      expect(unchanged.body.result.rows).toEqual([{ count: 1 }]);
      console.log(
        JSON.stringify({
          event: 'DATABASE_PANEL_PROCESS_PROOF',
          parentPid: process.pid,
          childPid: ready.pid,
          samePersistedSession: true,
          rowReadOverHttp: true,
          permissionChecks: 3,
          browser: false,
        }),
      );
    } finally {
      if (child.connected) {
        child.send('shutdown', () => undefined);
      }

      await Promise.race([exited, delay(5000)]);

      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
      }

      await Promise.race([exited, delay(5000)]);

      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }

      await Promise.race([exited, delay(5000)]);
      prisma = createDatabaseClient({ poolMax: 2 });
      store = new PrismaApiStore(prisma);
      app = await buildApiApp({
        store,
        emailProvider: {
          async send() {
            throw new Error('Email forbidden');
          },
        },
      });
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    }
    expect((await store.listProjectActivity(projectId)).some((entry) => entry.action === 'database.row.insert')).toBe(
      true,
    );
  });

  it('preserves special result names, exact numeric values, NULL and PostgreSQL types', async () => {
    const response = await query(`SELECT 'special'::text AS "__proto__", 7::integer AS "constructor",
      NULL::text AS "toString", true AS prototype, ARRAY[1,2]::integer[] AS items, 9007199254740993.125::numeric AS amount,
      '2026-11-01T12:00:00Z'::timestamptz AS recorded, decode('00ff', 'hex') AS bytes,
      '{"__proto__":"nested"}'::jsonb AS detail`);
    expect(response.statusCode, response.body).toBe(200);

    const result = response.json().result;
    expect(result.columns).toEqual([
      '__proto__',
      'constructor',
      'toString',
      'prototype',
      'items',
      'amount',
      'recorded',
      'bytes',
      'detail',
    ]);
    expect(result.rowCount).toBe(1);

    const row = result.rows[0];
    expect(Object.hasOwn(row, '__proto__')).toBe(true);
    expect(row.__proto__).toBe('special');
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(row.constructor).toBe(7);
    expect(row.toString).toBeNull();
    expect(row.prototype).toBe(true);
    expect(row.items).toEqual([1, 2]);
    expect(row.amount).toBe('9007199254740993.125');
    expect(row.recorded).toBe('2026-11-01T12:00:00.000Z');
    expect(row.bytes).toEqual({ type: 'Buffer', data: [0, 255] });
    expect(Object.hasOwn(row.detail, '__proto__')).toBe(true);
    expect(row.detail.__proto__).toBe('nested');
  });

  it('keeps the final batch result with special column names', async () => {
    const response = await query(
      `SELECT 'earlier' AS "__proto__"; SELECT 'final' AS "__proto__", NULL::text AS "constructor";`,
    );
    expect(response.statusCode, response.body).toBe(200);

    const result = response.json().result;
    expect(result.command).toBe('SELECT');
    expect(result.columns).toEqual(['__proto__', 'constructor']);
    expect(result.rows).toEqual([
      Object.fromEntries([
        ['__proto__', 'final'],
        ['constructor', null],
      ]),
    ]);
    expect(result.rowCount).toBe(1);
  });

  it('preserves special RETURNING columns and rolls back a later batch error', async () => {
    const created = await query(
      `CREATE TABLE "${schema}"."parser_returning" (id integer PRIMARY KEY, "__proto__" text NOT NULL)`,
    );
    expect(created.statusCode, created.body).toBe(200);

    const inserted = await query(
      `INSERT INTO "${schema}"."parser_returning" VALUES (1, 'original') RETURNING id, "__proto__"`,
    );
    expect(inserted.statusCode, inserted.body).toBe(200);
    expect(inserted.json().result.command).toBe('INSERT');
    expect(inserted.json().result.columns).toEqual(['id', '__proto__']);
    expect(inserted.json().result.rows).toEqual([
      Object.fromEntries([
        ['id', 1],
        ['__proto__', 'original'],
      ]),
    ]);

    const failed = await query(
      `UPDATE "${schema}"."parser_returning" SET "__proto__"='must rollback' WHERE id=1 RETURNING "__proto__"; SELECT * FROM "${schema}"."missing_parser_table";`,
    );
    expect(failed.statusCode).toBeGreaterThanOrEqual(400);

    const unchanged = await query(`SELECT id, "__proto__" FROM "${schema}"."parser_returning"`);
    expect(unchanged.statusCode, unchanged.body).toBe(200);
    expect(unchanged.json().result.rows).toEqual([
      Object.fromEntries([
        ['id', 1],
        ['__proto__', 'original'],
      ]),
    ]);
  });

  it('reports real primary keys and allows repeated idempotent writes', async () => {
    for (let i = 0; i < 2; i++) {
      const response = await query(
        `UPDATE "${schema}"."Odd Table" SET "Value" = 'updated' WHERE "Id" = 1 RETURNING *;`,
      );
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().result.rows).toEqual([{ Id: 1, Value: 'updated' }]);
    }

    const response = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/databases/schema?key=DATABASE_URL`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(response.statusCode, response.body).toBe(200);

    const columns = response
      .json()
      .schema.columns.filter((column: { table_schema: string }) => column.table_schema === schema);
    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column_name: 'Id', is_primary_key: true }),
        expect.objectContaining({ column_name: 'Value', is_primary_key: false }),
      ]),
    );
  });

  it('executes the actual grid helper against quoted identifiers, nullable values and duplicate content', async () => {
    await query(`INSERT INTO "${schema}"."Odd Table" VALUES (4, NULL), (5, NULL);`);

    const statement = rowUpdateSql(
      { schema, nom: 'Odd Table' },
      [
        { nom: 'Id', type: 'integer', primaryKey: true },
        { nom: 'Value', type: 'text' },
      ],
      ['Id', 'Value'],
      [4, null],
      'Value',
      "O'Brien\\path",
    );
    expect(statement).toBeTruthy();

    const response = await query(statement!);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().result.rowCount).toBe(1);
    expect(
      (await query(`SELECT * FROM "${schema}"."Odd Table" WHERE "Id" IN (4,5) ORDER BY "Id"`)).json().result.rows,
    ).toEqual([
      { Id: 4, Value: "O'Brien\\path" },
      { Id: 5, Value: null },
    ]);
  });

  it('rolls back an unsuccessful batch without retaining the earlier insert', async () => {
    const response = await query(
      `INSERT INTO "${schema}"."Odd Table" VALUES (2, 'rollback'); SELECT * FROM "${schema}"."missing_table";`,
    );
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect((await query(`SELECT * FROM "${schema}"."Odd Table" WHERE "Id"=2`)).json().result.rows).toEqual([]);
  });

  it('rejects unauthenticated, other-organization and viewer writes before SQL runs', async () => {
    expect((await query('SELECT 1', '')).statusCode).toBe(401);
    expect([403, 404]).toContain((await query('SELECT 1', outsiderToken)).statusCode);
    expect((await query(`INSERT INTO "${schema}"."Odd Table" VALUES (3, 'forbidden')`, viewerToken)).statusCode).toBe(
      403,
    );
    expect((await query(`SELECT * FROM "${schema}"."Odd Table" WHERE "Id"=3`)).json().result.rows).toEqual([]);
  });

  it('never borrows a connection from another project or silently falls back to another key', async () => {
    expect((await query('SELECT 1', ownerToken, otherProjectId)).statusCode).toBe(404);
    expect((await query('SELECT 1', ownerToken, projectId, 'PROD_DATABASE_URL')).statusCode).toBe(404);

    const response = await app.inject({
      method: 'GET',
      url: `/projects/${otherProjectId}/databases`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().connections).toEqual([]);
  });
  it('uses secret precedence and rejects ambiguous plain environment keys before connecting', async () => {
    await store.upsertProjectEnvVar({
      projectId,
      key: 'DATABASE_URL',
      value: 'postgresql://invalid@127.0.0.1:1/wrong',
      scope: 'production',
    });

    const secretResult = await query('SELECT 42 AS answer');
    expect(secretResult.statusCode, secretResult.body).toBe(200);
    expect(secretResult.json().result.rows).toEqual([{ answer: 42 }]);
    await store.upsertProjectEnvVar({ projectId, key: 'SCOPED_DATABASE_URL', value: url!, scope: 'development' });
    await store.upsertProjectEnvVar({
      projectId,
      key: 'SCOPED_DATABASE_URL',
      value: 'postgresql://invalid@127.0.0.1:1/wrong',
      scope: 'production',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/databases`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(response.json().connections.filter((entry: { key: string }) => entry.key === 'DATABASE_URL')).toHaveLength(
      1,
    );
    expect(response.json().connections).toContainEqual(
      expect.objectContaining({ key: 'SCOPED_DATABASE_URL', status: 'unavailable', ambiguous: true }),
    );

    const blocked = await query('SELECT 1', ownerToken, projectId, 'SCOPED_DATABASE_URL');
    expect(blocked.statusCode, blocked.body).toBe(409);
    expect(blocked.json().code).toBe('DATABASE_CONNECTION_AMBIGUOUS');

    const schemaResponse = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/databases/schema?key=SCOPED_DATABASE_URL`,
      headers: { authorization: `Bearer ${ownerToken}`, 'accept-language': 'fr' },
    });
    expect(schemaResponse.statusCode).toBe(409);
    expect(schemaResponse.json().error).toBe(
      'Cette clé désigne des bases différentes selon l’environnement. Utilisez une clé distincte pour chaque base.',
    );

    // Equal values in two scopes are safe and collapse to a single connection.
    await store.upsertProjectEnvVar({ projectId, key: 'SCOPED_DATABASE_URL', value: url!, scope: 'production' });
    expect((await query('SELECT 1', ownerToken, projectId, 'SCOPED_DATABASE_URL')).statusCode).toBe(200);
  });
});
