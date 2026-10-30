/** Local-only synthetic fixture. Never point this harness at production. */
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createDatabaseClient } from '../../packages/database/src/index.js';
import { encryptJson } from '../../packages/security/src/index.js';
import { buildApiApp } from '../../services/api/src/app.js';
import { PrismaApiStore } from '../../services/api/src/prisma-store.js';

if (process.env.NODE_ENV === 'production') throw new Error('Local QA only');
const controlUrl = 'postgresql://postgres@127.0.0.1:55442/database_audit';
const dataUrl = 'postgresql://postgres@127.0.0.1:55441/database_audit';
process.env.DATABASE_URL = controlUrl;
process.env.CONFIG_ENCRYPTION_KEY = 'synthetic-database-panel-browser-only';
process.env.REDIS_URL = '';
process.env.WORKSPACE_MANAGER_URL = '';
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const target = new URL(input instanceof Request ? input.url : String(input));
  if (target.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(target.hostname)) {
    throw new Error('External HTTP forbidden by local database fixture');
  }
  return nativeFetch(input, init);
};
const prisma = createDatabaseClient({ poolMax: 2 });
const store = new PrismaApiStore(prisma);
const data = new Client({ connectionString: dataUrl });
await data.connect();
const suffix = randomUUID().replaceAll('-', '');
const schemas = [`browser_a_${suffix}`, `browser_b_${suffix}`];
for (const [index, schema] of schemas.entries()) {
  await data.query(
    `CREATE SCHEMA "${schema}"; CREATE TABLE "${schema}"."Contact List" ("Id" integer PRIMARY KEY, "Display Name" text, "Note" text); INSERT INTO "${schema}"."Contact List" VALUES (1, 'Synthetic ${index ? 'B' : 'A'}', NULL), (2, 'Second synthetic contact', NULL);`,
  );
}
const user = await store.createUser({
  email: `database-browser-${suffix}@example.invalid`,
  name: 'Database QA synthetic',
  passwordHash: 'disabled-browser-fixture-login',
});
await store.updateUser({ userId: user.id, emailVerifiedAt: new Date().toISOString() });
const organization = await store.createOrganization({
  name: 'Database local QA',
  slug: `db-browser-${suffix}`,
  ownerUserId: user.id,
});
await store.upsertSubscription({ organizationId: organization.id, planKey: 'team', status: 'ACTIVE' });
const project = await store.createProject({
  organizationId: organization.id,
  name: 'Database local QA',
  slug: `db-browser-${suffix}`,
});
await store.upsertProjectSecret({
  projectId: project.id,
  key: 'DATABASE_URL',
  valueEncrypted: encryptJson({ value: dataUrl }),
});
const token = randomUUID();
await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3_600_000) });
const app = await buildApiApp({
  store,
  emailProvider: {
    async send() {
      throw new Error('Email forbidden');
    },
  },
});
const origin = await app.listen({ host: '127.0.0.1', port: 8787 });
const fixtureFile = '/tmp/database-browser-fixture.json';
await writeFile(
  fixtureFile,
  JSON.stringify({ origin, projectId: project.id, organizationId: organization.id, token, schemas, dataUrl }),
  { mode: 0o600 },
);
console.log(`Local database fixture ready at ${origin}; synthetic session stored privately in ${fixtureFile}`);
const close = async () => {
  await app.close();
  for (const schema of schemas) await data.query(`DROP SCHEMA "${schema}" CASCADE`);
  await data.end();
  await prisma.project.delete({ where: { id: project.id } });
  await prisma.organization.delete({ where: { id: organization.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
  await unlink(fixtureFile);
  process.exit(0);
};
process.once('SIGTERM', () => {
  void close();
});
process.once('SIGINT', () => {
  void close();
});
