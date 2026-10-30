/** Real SQL and persistent authorization metadata; only an explicitly isolated loopback database. */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { encryptJson } from '@vibecore/security';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import { PrismaApiStore } from '../prisma-store.js';
import { rowUpdateSql } from '../../../../app/components/database/sql-grid.js';

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
    if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/database_audit') {
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
    expect(schemaResponse.json().error).toBe('Cette clé désigne des bases différentes selon l’environnement. Utilisez une clé distincte pour chaque base.');
    // Equal values in two scopes are safe and collapse to a single connection.
    await store.upsertProjectEnvVar({ projectId, key: 'SCOPED_DATABASE_URL', value: url!, scope: 'production' });
    expect((await query('SELECT 1', ownerToken, projectId, 'SCOPED_DATABASE_URL')).statusCode).toBe(200);
  });
});
