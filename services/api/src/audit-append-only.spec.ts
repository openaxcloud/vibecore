import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * AUDX-011 — the audit trail claimed immutability in a schema comment while
 * being an ordinary table. These tests run the REAL migration file (read from
 * disk, never a copy inlined here — a spec that pins its own copy of the thing
 * it guards proves nothing) against a real PostgreSQL and check BOTH directions:
 *
 *   - forgery and erasure are refused;
 *   - the two legitimate writers that exist on main (GDPR ip redaction, the
 *     retention purge) and the FK `ON DELETE SET NULL` detach still work.
 *
 * The second direction is the one that matters operationally: a trigger that
 * blocked every UPDATE would have made organization deletion and GDPR account
 * erasure fail in production.
 *
 * Set AUDIT_APPEND_ONLY_TEST_DATABASE_URL to run. Without it these are SKIPPED,
 * which proves nothing — the suite is only meaningful when it actually connects.
 */
const databaseUrl = process.env.AUDIT_APPEND_ONLY_TEST_DATABASE_URL;

const MIGRATION_SQL = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/database/prisma/migrations/0084_auditlog_append_only/migration.sql',
);

const SCHEMA_PRISMA = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/database/prisma/schema.prisma');

/** Columns the trigger reasons about; must stay in step with the real model. */
const AUDIT_COLUMNS = [
  'id',
  'organizationId',
  'actorUserId',
  'action',
  'resourceType',
  'resourceId',
  'metadata',
  'ipAddress',
  'createdAt',
];

describe.skipIf(!databaseUrl)('AUDX-011 AuditLog append-only enforcement', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();

    await client.query('DROP TABLE IF EXISTS "AuditLog", "Organization", "User" CASCADE');
    await client.query('CREATE TABLE "Organization" (id text PRIMARY KEY)');
    await client.query('CREATE TABLE "User" (id text PRIMARY KEY)');
    await client.query(`CREATE TABLE "AuditLog" (
      id text PRIMARY KEY,
      "organizationId" text REFERENCES "Organization"(id) ON DELETE SET NULL,
      "actorUserId" text REFERENCES "User"(id) ON DELETE SET NULL,
      action text NOT NULL,
      "resourceType" text NOT NULL,
      "resourceId" text,
      metadata jsonb,
      "ipAddress" text,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);

    // The migration under test, exactly as it will run in production.
    await client.query(readFileSync(MIGRATION_SQL, 'utf8'));
  });

  afterAll(async () => {
    await client?.query('DROP TABLE IF EXISTS "AuditLog", "Organization", "User" CASCADE').catch(() => undefined);
    await client?.end().catch(() => undefined);
  });

  async function seed(id: string) {
    await client.query('INSERT INTO "Organization"(id) VALUES ($1),($2) ON CONFLICT DO NOTHING', ['org1', 'org2']);
    await client.query('INSERT INTO "User"(id) VALUES ($1),($2) ON CONFLICT DO NOTHING', ['u1', 'u2']);
    await client.query(
      `INSERT INTO "AuditLog"(id,"organizationId","actorUserId",action,"resourceType","ipAddress")
       VALUES ($1,'org1','u1','user.delete','user','1.2.3.4')`,
      [id],
    );
  }

  it('keeps the trigger in step with the columns the model declares', () => {
    const schema = readFileSync(SCHEMA_PRISMA, 'utf8');
    const model = /model AuditLog \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';
    const declared = model
      .split('\n')
      .map((line) => /^\s{2}(\w+)\s+\S/.exec(line)?.[1])
      .filter((name): name is string => Boolean(name));

    // Every column this test builds must exist on the real model; a rename in
    // schema.prisma would otherwise leave the trigger guarding a stale name.
    for (const column of AUDIT_COLUMNS) {
      expect(declared).toContain(column);
    }
  });

  describe('refuses forgery', () => {
    const cases: Array<[string, string]> = [
      ['rewriting the action', `UPDATE "AuditLog" SET action='login' WHERE id=$1`],
      ['rewriting the resource type', `UPDATE "AuditLog" SET "resourceType"='project' WHERE id=$1`],
      ['rewriting the resource id', `UPDATE "AuditLog" SET "resourceId"='other' WHERE id=$1`],
      ['back-dating the row', `UPDATE "AuditLog" SET "createdAt"=now() - interval '10 days' WHERE id=$1`],
      ['reattributing the actor', `UPDATE "AuditLog" SET "actorUserId"='u2' WHERE id=$1`],
      ['reattributing the organization', `UPDATE "AuditLog" SET "organizationId"='org2' WHERE id=$1`],
      ['rewriting the ip to a different address', `UPDATE "AuditLog" SET "ipAddress"='9.9.9.9' WHERE id=$1`],
      ['deleting without declaring retention intent', `DELETE FROM "AuditLog" WHERE id=$1`],
    ];

    for (const [name, sql] of cases) {
      it(`refuses ${name}`, async () => {
        const id = `forge-${name.replace(/\W+/g, '-')}`;
        await seed(id);

        await expect(client.query(sql, [id])).rejects.toThrow(/append-only/);

        // The row is still there, unchanged.
        const after = await client.query('SELECT action, "actorUserId" FROM "AuditLog" WHERE id=$1', [id]);
        expect(after.rows[0]).toMatchObject({ action: 'user.delete', actorUserId: 'u1' });
      });
    }

    it('refuses TRUNCATE, which row triggers do not see', async () => {
      await expect(client.query('TRUNCATE "AuditLog"')).rejects.toThrow(/append-only/);
    });
  });

  describe('still allows the legitimate writers', () => {
    it('allows the GDPR redaction that nulls the ip and marks the metadata', async () => {
      await seed('redact-1');

      await client.query(
        `UPDATE "AuditLog" SET "ipAddress"=NULL, metadata='{"redacted":true}'::jsonb WHERE id=$1`,
        ['redact-1'],
      );

      const row = await client.query('SELECT "ipAddress", metadata FROM "AuditLog" WHERE id=$1', ['redact-1']);
      expect(row.rows[0].ipAddress).toBeNull();
      expect(row.rows[0].metadata).toMatchObject({ redacted: true });
    });

    it('allows organization deletion to detach the row (FK ON DELETE SET NULL fires this trigger)', async () => {
      await seed('detach-org');

      await client.query('DELETE FROM "Organization" WHERE id=$1', ['org1']);

      const row = await client.query('SELECT "organizationId", action FROM "AuditLog" WHERE id=$1', ['detach-org']);
      expect(row.rows[0].organizationId).toBeNull();
      // The fact itself survives the detach — that is the point of the trail.
      expect(row.rows[0].action).toBe('user.delete');
    });

    it('allows account erasure to detach the actor', async () => {
      await seed('detach-user');
      await client.query('DELETE FROM "User" WHERE id=$1', ['u1']);

      const row = await client.query('SELECT "actorUserId", action FROM "AuditLog" WHERE id=$1', ['detach-user']);
      expect(row.rows[0].actorUserId).toBeNull();
      expect(row.rows[0].action).toBe('user.delete');
    });

    it('allows the retention purge when it declares its intent', async () => {
      await seed('retain-1');

      await client.query('BEGIN');
      await client.query("SET LOCAL vibecore.audit_retention = 'on'");
      const deleted = await client.query('DELETE FROM "AuditLog" WHERE id=$1', ['retain-1']);
      await client.query('COMMIT');

      expect(deleted.rowCount).toBe(1);
    });
  });

  describe('the retention permission does not outlive its transaction', () => {
    /*
     * SET LOCAL is released at COMMIT and at ROLLBACK. Without this, a pooled
     * connection that once ran the retention job would carry the permission into
     * whatever request reused it — the guard would be posted and never lifted.
     */
    it('is released after COMMIT', async () => {
      await seed('leak-commit');
      await client.query('BEGIN');
      await client.query("SET LOCAL vibecore.audit_retention = 'on'");
      await client.query('COMMIT');

      await expect(client.query('DELETE FROM "AuditLog" WHERE id=$1', ['leak-commit'])).rejects.toThrow(/append-only/);
    });

    it('is released after ROLLBACK', async () => {
      await seed('leak-rollback');
      await client.query('BEGIN');
      await client.query("SET LOCAL vibecore.audit_retention = 'on'");
      await client.query('ROLLBACK');

      await expect(client.query('DELETE FROM "AuditLog" WHERE id=$1', ['leak-rollback'])).rejects.toThrow(/append-only/);
    });
  });
});
