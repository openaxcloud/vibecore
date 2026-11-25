/** Reproduce from the repository root with installed dependencies:
 * env -i PATH="$PATH" NODE_ENV=test node --import tsx services/api/src/notification-list-local-proof.mts
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

assert.equal(process.env.NODE_ENV, 'test');
for (const key of Object.keys(process.env)) {
  assert.ok(
    ['PATH', 'NODE_ENV', 'PWD', 'SHLVL', '_', 'TSX_TSCONFIG_PATH'].includes(key),
    'Run in the clean environment documented above',
  );
}
process.env.OAUTH_STATE_SECRET = randomUUID();
process.env.ENCRYPTION_SECRET = randomUUID();
const { buildApiApp } = await import('./app.js');
const { TestApiStore } = await import('./tests/test-api-store.js');
const app = await buildApiApp({
  store: new TestApiStore(),
  emailProvider: { async send() {} },
  loggerStream: { write() {} },
});
const samples: number[] = [];
let errors = 0;
let postBurstValidated = 0;
try {
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const account = await fetch(origin + '/auth/register', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(3000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'proof@example.invalid',
      password: randomUUID(),
      name: 'Proof',
      organizationName: 'Fixture',
    }),
  });
  assert.equal(account.status, 201);
  const { token } = await account.json();
  assert.equal(typeof token, 'string');
  async function list() {
    const start = performance.now();
    const result = await fetch(origin + '/user/notifications', {
      headers: { authorization: 'Bearer ' + token },
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.ok(Array.isArray(body.notifications));
    assert.ok(Number.isInteger(body.unreadCount) && body.unreadCount >= 0);
    return performance.now() - start;
  }
  for (let batch = 0; batch < 10; batch++) {
    const results = await Promise.allSettled([list(), list()]);
    for (const result of results) {
      if (result.status === 'fulfilled') samples.push(result.value);
      else errors++;
    }
    assert.equal(errors, 0, 'Burst stopped at first failed pair');
    await delay(100);
  }
  await delay(500);
  const postBurstMs = await list();
  postBurstValidated++;
  samples.sort((a, b) => a - b);
  const percentile = (p: number) => Number(samples[Math.ceil(samples.length * p) - 1].toFixed(2));
  console.log(
    JSON.stringify({
      scope: 'local-memory',
      requests: samples.length,
      concurrency: 2,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      errors,
      postBurstValidated,
      postBurstMs: Number(postBurstMs.toFixed(2)),
    }),
  );
} finally {
  await app.close();
}
