/** Local disposable proof database; never reads DATABASE_URL or remote credentials. */
import { globSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function installedModule(pattern) {
  const matches = globSync(pattern);
  if (matches.length !== 1) throw new Error(`Expected one installed proof dependency: ${pattern}`);
  return import(pathToFileURL(resolve(matches[0])).href);
}
const { PGlite } = await installedModule(
  'node_modules/.pnpm/@electric-sql+pglite@0.4.1/node_modules/@electric-sql/pglite/dist/index.js',
);
const { PGLiteSocketServer } = await installedModule(
  'node_modules/.pnpm/@electric-sql+pglite-socket@0.1.1_*/node_modules/@electric-sql/pglite-socket/dist/index.js',
);
const db = await PGlite.create(mkdtempSync(join(tmpdir(), 'skills-proof-')));
const migrations = 'packages/database/prisma/migrations';
for (const directory of readdirSync(migrations)
  .filter((name) => /^\d/.test(name))
  .sort()) {
  const sql = readFileSync(join(migrations, directory, 'migration.sql'), 'utf8');
  // PGlite does not supply pgvector; Skills never reads AgentMemory.
  if (sql.includes('"AgentMemory"')) {
    console.log('Excluded unrelated AgentMemory migration:', directory);
    continue;
  }
  await db.exec(sql);
}
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55439 });
await server.start();
console.log('Isolated Skills proof database listening on 127.0.0.1:55439');
async function close() {
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
