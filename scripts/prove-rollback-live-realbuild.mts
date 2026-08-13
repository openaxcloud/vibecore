/*
 * LIVE rollback proof — REAL PUBLISH, not seeded releases.
 *
 * The previous live proof seeded the two prior releases (real bytes + real manifest rows)
 * because a production publish builds inside a workspace pod, which needs a cluster. This
 * one closes that gap: it drives the REAL publish endpoint with the REAL in-api build
 * (`runStaticBuild`), so an actual `npm run build` runs against an actual project on disk
 * and produces the bytes that are then snapshotted, digested, manifested and served.
 *
 * Everything under proof is production code:
 *   - POST /projects/:id/deployments  → real build → real snapshot → real ReleaseManifest
 *   - GET  /static-deployments/:id/*  → the real public serve path
 *   - POST /projects/:id/deployments/rollback-to-previous → the real rollback chain
 *
 * The only production seam swapped is WHERE the build runs (api process instead of a
 * workspace pod) — `staticBuildRunner` / `useWorkspacePodBuild` are the app's own options,
 * and the code path after the build returns is identical.
 *
 * Real Postgres, real HTTP over a listening socket (not fastify.inject).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... \
 *   npx tsx scripts/prove-rollback-live-realbuild.mts
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApiApp } from '../services/api/src/app.js';
import { projectStorageDir, runStaticBuild } from '../services/api/src/deployments.js';
import { PrismaApiStore } from '../services/api/src/prisma-store.js';

const sha256 = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const line = (t: string) => console.log(`\n===== ${t} ${'='.repeat(Math.max(0, 64 - t.length))}`);

const PORT = Number(process.env.LIVE_PORT ?? 3211);
const BASE = `http://127.0.0.1:${PORT}`;

const root = await mkdtemp(join(tmpdir(), 'rb-realbuild-'));
process.env.PROJECT_STORAGE_DIR = join(root, 'projects');
process.env.STATIC_DEPLOY_STORAGE_DIR = join(root, 'static');
/*
 * Generated per run, never a literal: a hardcoded secret-shaped string in the repo trips
 * the blocking gitleaks gate (and suppressing that with an ignore entry would be exactly
 * the wrong reflex for a scanner whose job is to be noisy about literals).
 */
process.env.AUTH_JWT_SECRET ??= randomBytes(24).toString('hex');
await mkdir(process.env.PROJECT_STORAGE_DIR, { recursive: true });
await mkdir(process.env.STATIC_DEPLOY_STORAGE_DIR, { recursive: true });

class QuietEmail {
  async send() {}
}

/** Write a real, buildable project whose build emits `marker` into dist/index.html. */
async function writeProjectSource(projectId: string, marker: string) {
  const dir = projectStorageDir(projectId);
  await mkdir(dir, { recursive: true });

  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'live-rollback-app', version: '1.0.0', private: true, scripts: { build: 'node build.js' } }, null, 2),
    'utf8',
  );

  // A real build script: it runs as a child process and emits the artifact.
  await writeFile(
    join(dir, 'build.js'),
    [
      "const { mkdirSync, writeFileSync } = require('node:fs');",
      "const { join } = require('node:path');",
      "mkdirSync(join(__dirname, 'dist'), { recursive: true });",
      `writeFileSync(join(__dirname, 'dist', 'index.html'), ${JSON.stringify(
        `<!doctype html><html><body><h1>${marker}</h1></body></html>`,
      )});`,
      "console.log('built', new Date().toISOString());",
    ].join('\n'),
    'utf8',
  );

  return dir;
}

const store = new PrismaApiStore();

const app = await buildApiApp({
  emailProvider: new QuietEmail() as never,
  store,

  /*
   * The REAL build function. Passing it explicitly also sets useWorkspacePodBuild=false,
   * i.e. "build here rather than in a workspace pod" — the app's own option, not a stub.
   */
  staticBuildRunner: runStaticBuild,
  useWorkspacePodBuild: false,
});

await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`live server listening on ${BASE}`);

async function api(
  path: string,
  init: { method?: string; token?: string; idempotencyKey?: string; body?: unknown } = {},
) {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(init.idempotencyKey ? { 'idempotency-key': init.idempotencyKey } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  const text = await res.text();

  try {
    return { status: res.status, json: JSON.parse(text) as never, text };
  } catch {
    return { status: res.status, json: undefined as never, text };
  }
}

let exitCode = 1;

try {
  const stamp = Date.now().toString(36);

  line('0. SETUP (real HTTP)');
  const reg = await api('/auth/register', {
    method: 'POST',
    body: {
      email: `rb-real-${stamp}@example.com`,
      password: 'password123',
      name: 'RB Real',
      organizationName: `RB Real Org ${stamp}`,
    },
  });
  const token = (reg.json as { token: string }).token;
  const orgId = (reg.json as { organization: { id: string } }).organization.id;
  console.log('  register:', reg.status);

  await store.upsertSubscription({ organizationId: orgId, planKey: 'pro', status: 'ACTIVE' });

  const proj = await api(`/orgs/${orgId}/projects`, { method: 'POST', token, body: { name: `RB Real ${stamp}` } });
  const projectId = (proj.json as { project: { id: string } }).project.id;
  console.log('  project :', proj.status, projectId);

  const publish = async (marker: string) => {
    await writeProjectSource(projectId, marker);

    return api(`/projects/${projectId}/deployments`, {
      method: 'POST',
      token,
      body: { provider: 'static', environment: 'preview', buildCommand: 'npm run build', outputDirectory: 'dist' },
    });
  };

  line('1. PUBLISH v1 — REAL build (npm run build actually executes)');
  const p1 = await publish('RELEASE-V1-ORIGINAL-CONTENT');
  console.log('  status     :', p1.status);
  const d1 = (p1.json as { deployment: { id: string; status: string } }).deployment;
  console.log('  deployment :', d1.id, d1.status);
  const buildLog1 = (p1.json as { deployment: { logs: Array<{ message: string }> } }).deployment.logs
    .map((l) => l.message)
    .filter((m) => /building in|built|snapshot/i.test(m));
  console.log('  build log  :', JSON.stringify(buildLog1.slice(0, 3)));

  line('2. PUBLISH v2 — REAL build with different source');
  const p2 = await publish('RELEASE-V2-CURRENT-CONTENT');
  const d2 = (p2.json as { deployment: { id: string; status: string } }).deployment;
  console.log('  status     :', p2.status);
  console.log('  deployment :', d2.id, d2.status);

  const releasesBefore = await api(`/projects/${projectId}/releases?environment=preview`, { token });
  console.log('  releases   :');
  for (const r of (releasesBefore.json as { releases: Array<Record<string, string>> }).releases ?? []) {
    console.log(`    v${r.version} deployment=${r.deploymentId} digest=${r.artifactDigest}`);
  }

  line('3. BEFORE — public serve path');
  const beforeRes = await fetch(`${BASE}/static-deployments/${d2.id}/index.html`);
  const before = await beforeRes.text();
  console.log(`  GET /static-deployments/${d2.id}/index.html  → ${beforeRes.status}`);
  console.log('  content =', JSON.stringify(before));
  console.log('  sha256  =', sha256(before));

  line('4. ROLLBACK — real endpoint');
  const rb = await api(`/projects/${projectId}/deployments/rollback-to-previous`, {
    method: 'POST',
    token,
    idempotencyKey: `${stamp}-rollback`,
    body: { environment: 'preview' },
  });
  const rbj = rb.json as Record<string, string>;
  console.log('  status                 :', rb.status);
  console.log('  restoredFromVersion    :', rbj.restoredFromVersion);
  console.log('  supersededVersion      :', rbj.supersededVersion);
  console.log('  verifiedArtifactDigest :', rbj.verifiedArtifactDigest);
  console.log('  restoredArtifactDigest :', rbj.restoredArtifactDigest);
  console.log('  rollbackable           :', rbj.rollbackable);

  if (rb.status !== 201) {
    console.log('  BODY:', rb.text);
    throw new Error(`rollback failed ${rb.status}`);
  }

  const restoredId = (rb.json as { deployment: { id: string } }).deployment.id;

  line('5. AFTER — public serve path for the restored release');
  const afterRes = await fetch(`${BASE}/static-deployments/${restoredId}/index.html`);
  const after = await afterRes.text();
  console.log(`  GET /static-deployments/${restoredId}/index.html  → ${afterRes.status}`);
  console.log('  content =', JSON.stringify(after));
  console.log('  sha256  =', sha256(after));

  console.log('\n  BEFORE :', JSON.stringify(before));
  console.log('  AFTER  :', JSON.stringify(after));
  console.log('  changed:', before !== after);
  console.log('  after has V1 marker :', after.includes('RELEASE-V1-ORIGINAL-CONTENT'));
  console.log('  after has V2 marker :', after.includes('RELEASE-V2-CURRENT-CONTENT'));

  line('6. CONCURRENCY — three simultaneous rollbacks');
  const conc = await Promise.all(
    [0, 1, 2].map((index) =>
      api(`/projects/${projectId}/deployments/rollback-to-previous`, {
        method: 'POST',
        token,
        idempotencyKey: `${stamp}-concurrent-${index}`,
        body: { environment: 'preview' },
      }),
    ),
  );

  for (const [i, r] of conc.entries()) {
    const j = r.json as Record<string, string>;
    console.log(
      `  #${i}: status=${r.status} code=${j?.code ?? '-'} restoredFrom=${j?.restoredFromVersion ?? '-'} expected=${j?.expectedVersion ?? '-'} observed=${j?.observedVersion ?? '-'}`,
    );
  }

  const committed = conc.filter((r) => r.status === 201);
  const refused = conc.filter((r) => r.status === 409);
  const restoredVersions = committed.map((r) => (r.json as Record<string, number>).restoredFromVersion);
  const distinct = new Set(restoredVersions).size === restoredVersions.length;

  console.log(`\n  committed=${committed.length} refused=${refused.length}`);
  console.log('  restored versions among commits:', JSON.stringify(restoredVersions));
  console.log('  all distinct (serial-equivalent):', distinct);
  console.log(
    '  refusals all ROLLBACK_RELEASE_MOVED:',
    refused.every((r) => (r.json as Record<string, string>).code === 'ROLLBACK_RELEASE_MOVED'),
  );

  line('VERDICT');
  const ok =
    p1.status === 201 &&
    p2.status === 201 &&
    d1.status === 'READY' &&
    d2.status === 'READY' &&
    beforeRes.status === 200 &&
    afterRes.status === 200 &&
    before !== after &&
    after.includes('RELEASE-V1-ORIGINAL-CONTENT') &&
    !after.includes('RELEASE-V2-CURRENT-CONTENT') &&
    rbj.verifiedArtifactDigest === rbj.restoredArtifactDigest &&
    distinct &&
    refused.every((r) => (r.json as Record<string, string>).code === 'ROLLBACK_RELEASE_MOVED');

  console.log(ok ? 'LIVE ROLLBACK (REAL BUILD) PROVEN' : 'LIVE ROLLBACK (REAL BUILD) NOT PROVEN');
  exitCode = ok ? 0 : 1;
} finally {
  await app.close();
  await store.prisma.$disconnect().catch(() => undefined);
  await rm(root, { recursive: true, force: true }).catch(() => undefined);
}

process.exit(exitCode);
