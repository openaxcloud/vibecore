/**
 * P0-V3-11 — preuve sur un VRAI PostgreSQL.
 *
 * Le cœur de la promesse « une migration ne corrompt jamais les données » est
 * une propriété du MOTEUR : en PostgreSQL le DDL est transactionnel, donc un lot
 * qui échoue à mi-parcours est intégralement défait. Aucun double en mémoire ne
 * peut prouver ça — seul un vrai serveur le peut. D'où ce fichier.
 *
 * Lancer avec :
 *   docker run -d --name v311-pg -e POSTGRES_PASSWORD=v311 -e POSTGRES_DB=v311 \
 *     -p 55432:5432 postgres:16-alpine
 *   V311_TEST_DATABASE_URL=postgres://postgres:v311@127.0.0.1:55432/v311 \
 *     vitest run src/tests/db-migration-applier.integration.spec.ts
 *
 * Sans la variable, la suite est SAUTÉE (et le dit) plutôt que de passer au vert
 * en n'ayant rien vérifié.
 */
import { createHash } from 'node:crypto';

import { Client } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';

import { createPostgresMigrationApplier, MIGRATION_LEDGER_TABLE } from '../db-migration-applier.js';

const databaseUrl = process.env.V311_TEST_DATABASE_URL;

const applier = createPostgresMigrationApplier({
  sha256: (value: string) => createHash('sha256').update(value).digest('hex'),
});

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const tableExists = (client: Client, name: string) =>
  client
    .query('SELECT to_regclass($1) AS reg', [name])
    .then((result) => result.rows[0]?.reg !== null && result.rows[0]?.reg !== undefined);

describe.skipIf(!databaseUrl)('P0-V3-11 — applicateur sur vrai PostgreSQL', () => {
  beforeEach(async () => {
    await withClient(async (client) => {
      await client.query(`DROP TABLE IF EXISTS ${MIGRATION_LEDGER_TABLE}`);
      await client.query('DROP TABLE IF EXISTS v311_orders');
      await client.query('DROP TABLE IF EXISTS v311_customers');
    });
  });

  it('applique un lot et enregistre le registre dans la même transaction', async () => {
    const result = await applier({
      connectionString: databaseUrl!,
      migrations: [
        { name: '001_customers.sql', sql: 'CREATE TABLE v311_customers (id serial PRIMARY KEY, email text)' },
        { name: '002_orders.sql', sql: 'CREATE TABLE v311_orders (id serial PRIMARY KEY, total numeric)' },
      ],
    });

    expect(result.committed).toBe(true);
    expect(result.applied).toEqual(['001_customers.sql', '002_orders.sql']);

    await withClient(async (client) => {
      expect(await tableExists(client, 'v311_customers')).toBe(true);
      expect(await tableExists(client, 'v311_orders')).toBe(true);

      const ledger = await client.query(`SELECT name FROM ${MIGRATION_LEDGER_TABLE} ORDER BY name`);
      expect(ledger.rows.map((row) => row.name)).toEqual(['001_customers.sql', '002_orders.sql']);
    });
  });

  it("LE POINT : un lot qui échoue à mi-parcours ne laisse AUCUNE trace — pas de schéma à moitié muté", async () => {
    // Données existantes qui doivent survivre intactes.
    await withClient(async (client) => {
      await client.query('CREATE TABLE v311_customers (id serial PRIMARY KEY, email text)');
      await client.query("INSERT INTO v311_customers (email) VALUES ('a@example.com'), ('b@example.com')");
    });

    await expect(
      applier({
        connectionString: databaseUrl!,
        migrations: [
          // Celle-ci réussirait isolément…
          { name: '010_ok.sql', sql: 'CREATE TABLE v311_orders (id serial PRIMARY KEY)' },
          // …mais celle-là échoue : tout le lot doit être défait.
          { name: '011_boom.sql', sql: 'ALTER TABLE v311_customers ADD COLUMN email text' },
        ],
      }),
    ).rejects.toThrow();

    await withClient(async (client) => {
      // La table créée par la 1re migration a disparu avec le ROLLBACK.
      expect(await tableExists(client, 'v311_orders')).toBe(false);
      // Le registre n'a rien enregistré : il ne diverge pas du schéma réel.
      expect(await tableExists(client, MIGRATION_LEDGER_TABLE)).toBe(false);

      // Et surtout : les données préexistantes sont intactes.
      const rows = await client.query('SELECT email FROM v311_customers ORDER BY email');
      expect(rows.rows.map((row) => row.email)).toEqual(['a@example.com', 'b@example.com']);
    });
  });

  it('rejouer le même lot ne ré-applique rien (idempotence au niveau BASE)', async () => {
    const migrations = [{ name: '001_customers.sql', sql: 'CREATE TABLE v311_customers (id serial PRIMARY KEY)' }];

    const first = await applier({ connectionString: databaseUrl!, migrations });
    expect(first.applied).toEqual(['001_customers.sql']);

    /*
     * Second passage : le `CREATE TABLE` non gardé exploserait s'il était rejoué.
     * Qu'il passe SANS erreur et sans rien appliquer prouve que le registre est
     * bien consulté — c'est ce qui rend un republish sûr.
     */
    const second = await applier({ connectionString: databaseUrl!, migrations });
    expect(second.committed).toBe(true);
    expect(second.applied).toEqual([]);
  });

  it('n applique QUE les migrations nouvelles quand le lot s allonge', async () => {
    await applier({
      connectionString: databaseUrl!,
      migrations: [{ name: '001_customers.sql', sql: 'CREATE TABLE v311_customers (id serial PRIMARY KEY)' }],
    });

    const second = await applier({
      connectionString: databaseUrl!,
      migrations: [
        { name: '001_customers.sql', sql: 'CREATE TABLE v311_customers (id serial PRIMARY KEY)' },
        { name: '002_orders.sql', sql: 'CREATE TABLE v311_orders (id serial PRIMARY KEY)' },
      ],
    });

    expect(second.applied).toEqual(['002_orders.sql']);

    await withClient(async (client) => {
      const ledger = await client.query(`SELECT name FROM ${MIGRATION_LEDGER_TABLE} ORDER BY name`);
      expect(ledger.rows.map((row) => row.name)).toEqual(['001_customers.sql', '002_orders.sql']);
    });
  });
});

/**
 * PREUVE BOUT-EN-BOUT : le PUBLISH réel migre une VRAIE base.
 *
 * Ici rien n'est simulé côté SQL — la route HTTP `publish` est appelée, le vrai
 * applicateur transactionnel tourne, et l'effet est constaté dans un PostgreSQL
 * réel. C'est la démonstration « migration réelle au publish
 * (lock + backup + validation) », par opposition aux tests de machine qui, eux,
 * prouvent les refus.
 */
describe.skipIf(!databaseUrl)('P0-V3-11 — publish RÉEL contre un vrai PostgreSQL', () => {
  beforeEach(async () => {
    await withClient(async (client) => {
      await client.query(`DROP TABLE IF EXISTS ${MIGRATION_LEDGER_TABLE}`);
      await client.query('DROP TABLE IF EXISTS v311_e2e');
    });
  });

  it('publie et applique RÉELLEMENT le schéma, avec verrou et backup vérifié', async () => {
    const { hashPassword } = await import('@vibecore/auth');
    const { encryptJson } = await import('@vibecore/security');
    const { buildApiApp } = await import('../app.js');
    const { TestApiStore } = await import('./test-api-store.js');

    const store = new TestApiStore();
    const files = new Map<string, string>([
      ['migrations/001_e2e.sql', 'CREATE TABLE v311_e2e (id serial PRIMARY KEY, label text)'],
    ]);

    const projectStorage = {
      async listFiles() {
        return [...files.entries()].map(([path, content]) => ({ path, content, updatedAt: '' }));
      },
      async writeFiles() {
        return [];
      },
      async createSnapshot() {
        return { id: 's', storageKey: 's', byteLength: 0, createdAt: '' };
      },
      async getSnapshotFiles() {
        return [];
      },
      async restoreSnapshot() {
        return [];
      },
      async exportZip() {
        return { storageKey: '', byteLength: 0, base64: '', createdAt: '' };
      },
      async importZip() {
        return [];
      },
    } as any;

    const app = await buildApiApp({
      store,
      projectStorage,
      emailProvider: { async send() {} } as any,
      // Backup observé ABOUTI : la garde I-MIG-1 est franchie légitimement.
      databaseProvisioner: {
        active: true,
        async takeSnapshot() {
          return { applied: true };
        },
        async backupStatus() {
          return { found: true, phase: 'completed', completed: true };
        },
      } as any,
      // PAS de migrationApplier injecté : c'est le VRAI applicateur qui tourne.
    });

    const user = await store.createUser({
      email: 'e2e@example.com',
      name: 'E2E',
      passwordHash: hashPassword('password123'),
    });
    const org = await store.createOrganization({ name: 'E2E', slug: 'e2e-org', ownerUserId: user.id });
    await store.createSession({ userId: user.id, token: 'e2e-token', expiresAt: new Date(Date.now() + 3600_000) });
    const project = await store.createProject({ organizationId: org.id, name: 'E2E', slug: 'e2e-p' });

    await store.upsertProjectSecret({
      projectId: project.id,
      key: 'PROD_DATABASE_URL',
      valueEncrypted: encryptJson({ value: databaseUrl }),
    });

    const deployment = await store.createDeployment({
      projectId: project.id,
      organizationId: org.id,
      environment: 'preview',
      status: 'READY',
      provider: 'server',
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/${deployment.id}/publish`,
      headers: { authorization: 'Bearer e2e-token' },
    });

    expect(res.statusCode).toBe(201);

    // L'exécution est tracée, verrou relâché, backup vérifié.
    const execution = [...store.migrationExecutions.values()][0];
    expect(execution.state).toBe('COMMITTED');
    expect(execution.activeLock).toBeNull();
    expect(execution.backupVerificationMethod).toBe('cnpg-backup-cr-phase-completed');

    // ET LE SCHÉMA EXISTE VRAIMENT dans PostgreSQL.
    await withClient(async (client) => {
      expect(await tableExists(client, 'v311_e2e')).toBe(true);

      const ledger = await client.query(`SELECT name FROM ${MIGRATION_LEDGER_TABLE}`);
      expect(ledger.rows.map((row) => row.name)).toEqual(['001_e2e.sql']);

      // La table est utilisable, pas seulement présente.
      await client.query("INSERT INTO v311_e2e (label) VALUES ('ok')");
      const rows = await client.query('SELECT label FROM v311_e2e');
      expect(rows.rows.map((row) => row.label)).toEqual(['ok']);
    });
  });
});
