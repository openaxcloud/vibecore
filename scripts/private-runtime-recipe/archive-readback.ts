import assert from 'node:assert/strict';
// eslint-disable-next-line no-restricted-imports -- Node CLI cannot resolve the web-only ~/ alias.
import { createDatabaseClient } from '../../packages/database/src/index.js';
import { verifyArchiveBytes } from './archive-checks.js';
import { assertRecipeClusterName } from './checks.js';

// Executed ONLY inside this recipe's API pod, never on a caller-selected database.
assertRecipeClusterName(process.env.PRIVATE_RUNTIME_RECIPE_ID ?? '');

const dbUrl = new URL(process.env.DATABASE_URL ?? '');
assert.equal(dbUrl.hostname, 'postgres');
assert.equal(dbUrl.pathname, '/vibecore');

const [projectId, snapshotId, path, expectedHash] = process.argv.slice(2);
assert.ok(projectId && snapshotId && path);
assert.match(expectedHash ?? '', /^[a-f0-9]{64}$/);

const db = createDatabaseClient();

try {
  const snapshot = await db.projectSnapshot.findUniqueOrThrow({ where: { id: snapshotId } });
  assert.equal(snapshot.projectId, projectId);
  assert.ok(snapshot.storageKey);

  const object = await db.projectStorageObject.findUniqueOrThrow({ where: { key: snapshot.storageKey } });
  assert.equal(object.projectId, projectId);
  assert.equal(object.kind, 'snapshot');

  console.log(JSON.stringify(await verifyArchiveBytes(object, path, expectedHash)));
} finally {
  await db.$disconnect();
}
