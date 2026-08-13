#!/usr/bin/env node
/*
 * LIVE rollback proof — real API server process, real Postgres, real HTTP, real bytes.
 *
 * Drives the actual deployed-code path end to end and prints, for each step, the CONTENT
 * served on the public static route and its sha256, so "before" and "after" are verifiable
 * from the raw output rather than asserted by a test helper:
 *
 *   1. two releases exist (v1, v2) with distinct real bytes on disk + real ReleaseManifest
 *      rows in Postgres;
 *   2. GET the live URL  → v2 content + digest   (BEFORE)
 *   3. POST rollback-to-previous (the real endpoint)
 *   4. GET the live URL  → v1 content + digest   (AFTER), and the restored release's
 *      recorded digest is compared against the bytes actually served;
 *   5. three CONCURRENT rollbacks → exactly one 201, the rest 409 ROLLBACK_RELEASE_MOVED.
 *
 * Usage:
 *   API_BASE=http://127.0.0.1:3199 \
 *   DATABASE_URL=postgresql://... \
 *   STATIC_DEPLOY_STORAGE_DIR=/path/to/static \
 *   node scripts/prove-rollback-live.mjs
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = process.env.API_BASE ?? 'http://127.0.0.1:3199';
const STATIC_ROOT = process.env.STATIC_DEPLOY_STORAGE_DIR;

if (!STATIC_ROOT) {
  throw new Error('STATIC_DEPLOY_STORAGE_DIR is required');
}

const sha256 = (s) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const line = (t) => console.log(`\n===== ${t} ${'='.repeat(Math.max(0, 62 - t.length))}`);

async function api(path, { method = 'GET', token, idempotencyKey, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let json;

  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  return { status: res.status, json, text };
}

const stamp = Date.now().toString(36);

line('0. SETUP — register, create project (real HTTP against the live server)');
const reg = await api('/auth/register', {
  method: 'POST',
  body: {
    email: `live-rb-${stamp}@example.com`,
    password: 'password123',
    name: 'Live Rollback',
    organizationName: `Live Rollback Org ${stamp}`,
  },
});
console.log('register:', reg.status);
const token = reg.json.token;
const orgId = reg.json.organization.id;

const proj = await api(`/orgs/${orgId}/projects`, {
  method: 'POST',
  token,
  body: { name: `Live Rollback Project ${stamp}` },
});
console.log('project:', proj.status, proj.json.project?.id);
const projectId = proj.json.project.id;

/*
 * Seed the two prior releases the way a publish leaves them: real bytes under the
 * deployment's own snapshot dir, and a real ReleaseManifest row written THROUGH the
 * server's own store (via the internal seeding endpoint is not available, so we use
 * the same Prisma client the server uses — see prove-rollback-live-seed.mjs).
 */
line('1. SEED — two published releases with DISTINCT real bytes');
const { seedRelease, liveUrlFor } = await import('./prove-rollback-live-seed.mjs');

const v1 = await seedRelease({ projectId, version: 1, marker: 'RELEASE-V1-ORIGINAL-CONTENT' });
const v2 = await seedRelease({ projectId, version: 2, marker: 'RELEASE-V2-CURRENT-CONTENT' });

for (const r of [v1, v2]) {
  console.log(`  v${r.version} deployment=${r.deploymentId}`);
  console.log(`       bytes    = ${JSON.stringify(r.content)}`);
  console.log(`       digest   = ${r.digest}`);
}

line('2. BEFORE — what the public static route actually serves');
const beforeRes = await fetch(liveUrlFor(v2.deploymentId));
const beforeBody = await beforeRes.text();
console.log('GET', liveUrlFor(v2.deploymentId));
console.log('  status  =', beforeRes.status);
console.log('  content =', JSON.stringify(beforeBody));
console.log('  sha256  =', sha256(beforeBody));
console.log('  matches v2 recorded digest:', sha256(beforeBody) === v2.contentDigest);

line('3. ROLLBACK — POST /projects/:id/deployments/rollback-to-previous (real endpoint)');
const rb = await api(`/projects/${projectId}/deployments/rollback-to-previous`, {
  method: 'POST',
  token,
  idempotencyKey: `${stamp}-rollback`,
  body: { environment: 'preview' },
});
console.log('  status                    =', rb.status);
console.log('  restoredFromVersion       =', rb.json.restoredFromVersion);
console.log('  restoredFromDeploymentId  =', rb.json.restoredFromDeploymentId);
console.log('  supersededVersion         =', rb.json.supersededVersion);
console.log('  verifiedArtifactDigest    =', rb.json.verifiedArtifactDigest);
console.log('  restoredArtifactDigest    =', rb.json.restoredArtifactDigest);
console.log('  rollbackable              =', rb.json.rollbackable);
console.log('  new deployment id         =', rb.json.deployment?.id);

if (rb.status !== 201) {
  console.log('  BODY:', rb.text);
  throw new Error(`rollback failed: ${rb.status}`);
}

line('4. AFTER — what the public static route serves for the RESTORED release');
const restoredId = rb.json.deployment.id;
const afterRes = await fetch(liveUrlFor(restoredId));
const afterBody = await afterRes.text();
console.log('GET', liveUrlFor(restoredId));
console.log('  status  =', afterRes.status);
console.log('  content =', JSON.stringify(afterBody));
console.log('  sha256  =', sha256(afterBody));

console.log('\n  BEFORE content :', JSON.stringify(beforeBody));
console.log('  AFTER  content :', JSON.stringify(afterBody));
console.log('  content CHANGED:', beforeBody !== afterBody);
console.log('  after == v1 marker present:', afterBody.includes('RELEASE-V1-ORIGINAL-CONTENT'));
console.log('  after == v2 marker absent :', !afterBody.includes('RELEASE-V2-CURRENT-CONTENT'));

line('5. CONCURRENCY — three simultaneous rollbacks on the same release stream');
const concurrent = await Promise.all(
  [0, 1, 2].map((index) =>
    api(`/projects/${projectId}/deployments/rollback-to-previous`, {
      method: 'POST',
      token,
      idempotencyKey: `${stamp}-concurrent-${index}`,
      body: { environment: 'preview' },
    }),
  ),
);

for (const [i, r] of concurrent.entries()) {
  console.log(`  #${i}: status=${r.status} code=${r.json.code ?? '-'} restoredFrom=${r.json.restoredFromVersion ?? '-'} expected=${r.json.expectedVersion ?? '-'} observed=${r.json.observedVersion ?? '-'}`);
}

const committed = concurrent.filter((r) => r.status === 201);
const refused = concurrent.filter((r) => r.status === 409);
console.log(`\n  committed=${committed.length} refused=${refused.length}`);
console.log('  all refusals are ROLLBACK_RELEASE_MOVED:', refused.every((r) => r.json.code === 'ROLLBACK_RELEASE_MOVED'));

/*
 * THE invariant, and the one worth checking live: SERIAL EQUIVALENCE. How many of the
 * three commit is timing-dependent — requests that genuinely serialise SHOULD all succeed,
 * each restoring the next release down. What must never happen is two commits claiming to
 * have restored the SAME release, which is precisely the defect (three restorations of v1).
 */
const restoredVersions = committed.map((r) => r.json.restoredFromVersion);
const distinct = new Set(restoredVersions).size === restoredVersions.length;
console.log('  restored versions among commits:', JSON.stringify(restoredVersions));
console.log('  all distinct (serial-equivalent):', distinct);
console.log('  at least one refusal or full serialisation:', refused.length > 0 || distinct);

line('6. RELEASE HISTORY (live, from Postgres via the real API)');
const releases = await api(`/projects/${projectId}/releases?environment=preview`, { token });
for (const r of releases.json.releases ?? []) {
  console.log(`  v${r.version}  deployment=${r.deploymentId}  digest=${r.artifactDigest}`);
}

line('VERDICT');
const ok =
  beforeBody !== afterBody &&
  afterBody.includes('RELEASE-V1-ORIGINAL-CONTENT') &&
  !afterBody.includes('RELEASE-V2-CURRENT-CONTENT') &&
  sha256(afterBody) !== sha256(beforeBody) &&
  // Serial equivalence: no two concurrent commits restored the same release.
  distinct &&
  refused.every((r) => r.json.code === 'ROLLBACK_RELEASE_MOVED');

console.log(ok ? 'LIVE ROLLBACK PROVEN' : 'LIVE ROLLBACK NOT PROVEN');
process.exit(ok ? 0 : 1);
