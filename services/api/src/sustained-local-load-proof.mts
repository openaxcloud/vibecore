/**
 * Opt-in real HTTP/PostgreSQL/Redis local proof. No arbitrary endpoint argument,
 * provider calls, cloud resources, production data or paid model execution.
 * Run only against the specifically named disposable Docker services in the README.
 */
import assert from 'node:assert/strict';
import { execFile, execFileSync, fork, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir, availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createDatabaseClient } from '@vibecore/database';
import { Redis } from 'ioredis';
import JSZip from 'jszip';
import { Client } from 'pg';
import { PrismaApiStore } from './prisma-store.js';
import { evaluateLocalLoadEvidence } from './sustained-load-evidence.js';

assert.equal(process.env.LOCAL_LOAD_PROOF, '1');
assert.equal(process.env.NODE_ENV, 'test');

const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.port, '55436');
assert.equal(database.pathname, '/sustained_load_proof');
assert.equal(process.env.REDIS_URL, 'redis://127.0.0.1:56376/0');
assert.ok(process.argv[2], 'An output receipt file is required');

const output = resolve(process.argv[2]);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'vibecore-sustained-load-'));
const runId = randomUUID();
const prefix = `local-load:${runId}`;

const sourceNames = [
  'sustained-local-load-proof.mts',
  'sustained-local-load-server.mts',
  'sustained-load-evidence.ts',
  'app.ts',
  'prisma-store.ts',
  'shared-rate-limit.ts',
];

async function sourceHashes() {
  return Object.fromEntries(
    await Promise.all(
      sourceNames.map(async (name) => [
        name,
        createHash('sha256')
          .update(await readFile(new URL(name, import.meta.url)))
          .digest('hex'),
      ]),
    ),
  );
}

const startingSourceHashes = await sourceHashes();
interface ApiMetric {
  phase: string;
  rssBytes: number;
  cpuPercentOfOneCore: number;
  eventLoopP99Ms: number;
  eventLoopUtilization: number;
  blockedOutbound: number;
  elapsedMs: number;
}

const originalMetrics: ApiMetric[][] = [];
const store = new PrismaApiStore(createDatabaseClient({ poolMax: 3 }));
const monitor = new Client({ connectionString: database.toString(), application_name: 'local_load_observer' });
const redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 1 });

const children: Array<{
  child: ChildProcess;
  origin: string;
  metrics: ApiMetric[];
  closed: boolean;
}> = [];

const organizations: string[] = [];
const users: string[] = [];
const actors: Array<{ token: string; org: string; project: string; writes: number }> = [];
const retainedArchives: Array<{ storageKey: string; sha256: string }> = [];

const files = Array.from({ length: 20 }, (_, i) => ({
  path: `file-${i}.txt`,
  content: `Synthetic file ${i}\n`.repeat(50),
}));

function expectedFiles(writes: number) {
  return files.map((file, index) =>
    index === 0 && writes > 0 ? { ...file, content: `Acknowledged edit ${writes}\n` } : file,
  );
}

const samples: Array<{ phase: string; route: string; ms: number; status: number; expected: boolean }> = [];
const infrastructure: Array<Record<string, unknown>> = [];
const dockerSamples: Array<Record<string, unknown>> = [];
const execute = promisify(execFile);

let lastDockerSample = 0;

const failures: string[] = [];

const receipt: Record<string, unknown> = {
  recordedAt: new Date().toISOString(),
  production: false,
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
  objectives: {
    unexpectedErrors: 0,
    dataLoss: 0,
    quotaOverAdmission: 0,
    readWriteP95Ms: 500,
    gitExportP95Ms: 1500,
    eventLoopP99Ms: 100,
    note: 'Proposed thresholds for this isolated exercise only; not production capacity or SLA.',
  },
  workload: {
    processes: 2,
    databaseMainPoolPerProcess: 10,
    advisoryLockPoolPerProcess: 5,
    maximumMixedConcurrency: 24,
    thinkTimeMs: 100,
    filesPerProject: 20,
    globalRateLimitPerCredentialPerMinute: 2000,
    independentOrganizations: 24,
  },
  limits: [
    'No browser, preview runtime, generated app, paid provider or deployment workload',
    'Closed-loop clients include 100 ms think time; completed throughput is not offered open-loop capacity',
    'API processes share the executor; local shared filesystem is not production storage',
    'Expected 429/404 responses are separate from unexpected errors, not counted as successful business work',
    'API CPU excludes spawned Git processes; sampled DB lock waits can miss short contention',
    'Restart verification covers API processes and fresh DB connections, not a PostgreSQL crash or restore',
  ],
};

let phase = 'setup';
let monitorTimer: ReturnType<typeof setInterval> | undefined;
let sampling = false;

function percentile(values: number[], p: number) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}

async function startServer() {
  const item = {
    child: undefined as unknown as ChildProcess,
    origin: '',
    metrics: [] as ApiMetric[],
    closed: false,
  };
  const child = fork(fileURLToPath(new URL('./sustained-local-load-server.mts', import.meta.url)), [], {
    cwd: root,
    execArgv: ['--import', 'tsx'],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      LOCAL_LOAD_PROOF: '1',
      DATABASE_URL: database.toString(),
      REDIS_URL: process.env.REDIS_URL!,
      PROJECT_STORAGE_DIR: join(directory, 'storage'),
      RATE_LIMIT_FORCE_SHARED: '1',
      RATE_LIMIT_KEY_PREFIX: prefix,
      API_RATE_LIMIT_MAX: '2000',
    },
  });
  item.child = child;
  children.push(item);
  child.on('message', (message: any) => {
    if (message?.kind === 'metrics') {
      item.metrics.push({ ...message, phase, elapsedMs: performance.now() });
    }

    if (message?.kind === 'closed') {
      item.closed = true;

      if (message.blockedOutbound !== 0) {
        failures.push('EXTERNAL_HTTP_ATTEMPT_BLOCKED');
      }
    }
  });
  await new Promise<void>((done, reject) => {
    const timeout = setTimeout(() => reject(new Error('LOCAL_API_START_TIMEOUT')), 60_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(new Error('LOCAL_API_EXITED_BEFORE_READY'));
    });
    child.on('message', (message: any) => {
      if (message?.kind !== 'ready') {
        return;
      }

      const origin = new URL(message.origin);
      assert.equal(origin.hostname, '127.0.0.1');
      assert.equal(origin.protocol, 'http:');
      item.origin = origin.origin;
      clearTimeout(timeout);
      done();
    });
  });

  return item;
}

async function closeServer(item: (typeof children)[number]) {
  if (item.child.exitCode !== null) {
    if (!item.closed) {
      failures.push('API_EXITED_UNEXPECTEDLY');
    }

    return;
  }

  await new Promise<void>((done) => {
    const timer = setTimeout(() => {
      failures.push('API_SHUTDOWN_TIMEOUT');
      item.child.kill('SIGKILL');
      done();
    }, 10000);
    item.child.once('exit', () => {
      clearTimeout(timer);

      if (!item.closed) {
        failures.push('API_CLEAN_SHUTDOWN_UNCONFIRMED');
      }

      done();
    });
    item.child.send('close');
  });
}

async function request(
  actor: { token: string },
  route: string,
  label: string,
  expected: number | number[] = 200,
  options: { method?: string; body?: unknown; replica?: number } = {},
) {
  const started = performance.now();
  const accepted = Array.isArray(expected) ? expected : [expected];

  let recorded = false;

  try {
    const origin = children[options.replica ?? samples.length % 2]!.origin;
    assert.equal(new URL(origin).hostname, '127.0.0.1');

    const response = await fetch(`${origin}${route}`, {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${actor.token}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    const decoded = await response.json();
    assert.ok(decoded !== null && typeof decoded === 'object');

    const body = decoded as {
      project: { id: string };
      ideState: {
        state: { ui: { loadProof: { writes: number } }; files: { entries: Array<{ path: string; content: string }> } };
      };
      status: { changedFiles: string[] };
      archive: { base64: string; storageKey: string };
      usage: unknown[];
      code: string;
      quotaKey: string;
    };
    samples.push({
      phase,
      route: label,
      ms: performance.now() - started,
      status: response.status,
      expected: accepted.includes(response.status),
    });
    recorded = true;
    assert.ok(accepted.includes(response.status), `${label}: unexpected HTTP ${response.status}`);

    return { status: response.status, body, headers: response.headers };
  } catch (error) {
    if (!recorded) {
      samples.push({ phase, route: label, ms: performance.now() - started, status: 0, expected: false });
    }

    throw new Error(`${label}: ${error instanceof assert.AssertionError ? error.message : 'LOCAL_REQUEST_FAILED'}`);
  }
}

async function createActor() {
  const id = randomUUID();

  const user = await store.createUser({
    email: `${id}@example.invalid`,
    name: 'Local load fixture',
    passwordHash: 'login-disabled-fixture',
  });
  users.push(user.id);

  const org = await store.createOrganization({ name: 'Local load fixture', slug: id, ownerUserId: user.id });
  organizations.push(org.id);

  const token = randomUUID();
  await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3600_000) });

  return { token, org: org.id };
}

async function sampleInfrastructure() {
  if (sampling) {
    return;
  }

  sampling = true;

  try {
    const pg = await monitor.query(`SELECT count(*)::int AS connections,
      count(*) FILTER (WHERE state='active')::int AS active,
      count(*) FILTER (WHERE wait_event_type='Lock')::int AS lock_waiters
      FROM pg_stat_activity WHERE datname=current_database()`);
    const db = await monitor.query(`SELECT xact_commit,xact_rollback,deadlocks,temp_bytes,blks_read,blks_hit
      FROM pg_stat_database WHERE datname=current_database()`);

    const info = await redis.info();

    const fields = Object.fromEntries(
      info
        .split('\r\n')
        .filter((x) => x.includes(':'))
        .map((x) => x.split(':')),
    );

    if (performance.now() - lastDockerSample >= 5000) {
      lastDockerSample = performance.now();

      const stats = await execute(
        'docker',
        [
          '--host=unix:///var/run/docker.sock',
          'stats',
          '--no-stream',
          '--format',
          '{{json .}}',
          'launch-load-postgres',
          'launch-load-redis',
        ],
        { timeout: 5000 },
      );
      dockerSamples.push({
        phase,
        at: new Date().toISOString(),
        containers: stats.stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line)),
      });
    }

    infrastructure.push({
      phase,
      at: new Date().toISOString(),
      postgres: pg.rows[0],
      database: db.rows[0],
      redis: Object.fromEntries(
        [
          'used_memory',
          'connected_clients',
          'blocked_clients',
          'evicted_keys',
          'rejected_connections',
          'instantaneous_ops_per_sec',
        ].map((key) => [key, Number(fields[key])]),
      ),
    });
  } catch {
    failures.push('INFRASTRUCTURE_SAMPLE_FAILED');
  } finally {
    sampling = false;
  }
}

async function mixedPhase(name: string, concurrency: number, seconds: number) {
  phase = name;

  const began = performance.now();
  const end = began + seconds * 1000;
  const before = samples.length;
  console.log(JSON.stringify({ stage: 'phase-start', phase: name, concurrency, seconds }));
  await Promise.all(
    actors.slice(0, concurrency).map(async (actor, index) => {
      let turn = 0;

      while (performance.now() < end) {
        try {
          const replica = (turn + index) % 2;

          switch (turn % 8) {
            case 0:
              assert.equal(
                (await request(actor, `/projects/${actor.project}`, 'project.read', 200, { replica })).body.project.id,
                actor.project,
              );
              break;
            case 1: {
              const state = (
                await request(actor, `/projects/${actor.project}/ide-state`, 'state.read', 200, { replica })
              ).body.ideState;
              assert.equal(state.state.ui.loadProof.writes, actor.writes);
              break;
            }
            case 2: {
              const writes = actor.writes + 1;
              const zip = new JSZip();
              zip.file(files[0].path, expectedFiles(writes)[0].content);
              await request(actor, `/projects/${actor.project}/files/import/zip`, 'files.write', 200, {
                replica,
                method: 'POST',
                body: { zipBase64: await zip.generateAsync({ type: 'base64' }), replaceExisting: false },
              });
              actor.writes = writes;

              const result = await request(actor, `/projects/${actor.project}/ide-state`, 'state.write', 200, {
                replica,
                method: 'PUT',
                body: { state: { ui: { loadProof: { writes } } } },
              });
              assert.equal(result.body.ideState.state.ui.loadProof.writes, writes);
              actor.writes = writes;
              break;
            }
            case 3:
              assert.deepEqual(
                (await request(actor, `/ai/usage?organizationId=${actor.org}`, 'usage.read', 200, { replica })).body
                  .usage,
                [],
              );
              break;
            case 4: {
              const status = (
                await request(actor, `/projects/${actor.project}/git/status`, 'git.status', 200, { replica })
              ).body.status;
              assert.deepEqual(status.changedFiles.sort(), files.map((x) => x.path).sort());
              break;
            }
            case 5: {
              const result = await request(actor, `/projects/${actor.project}/export/zip`, 'project.export', 200, {
                replica,
              });

              const zip = await JSZip.loadAsync(Buffer.from(result.body.archive.base64, 'base64'));
              assert.equal(Object.values(zip.files).filter((x) => !x.dir).length, files.length);

              for (const file of expectedFiles(actor.writes)) {
                assert.equal(await zip.file(file.path)!.async('string'), file.content);
              }
              break;
            }
            case 6: {
              const result = await request(quotaActor!, `/orgs/${quotaActor!.org}/projects`, 'quota.denial', 429, {
                replica,
                method: 'POST',
                body: { name: 'Must be denied', slug: randomUUID() },
              });
              assert.equal(result.body.code, 'QUOTA_EXCEEDED');
              break;
            }
            case 7: {
              const foreign = actors[(index + 1) % actors.length];
              await request(actor, `/projects/${foreign.project}/ide-state`, 'tenant.denial', 404, { replica });
              break;
            }
          }
        } catch (error) {
          failures.push(error instanceof Error ? error.message.slice(0, 160) : 'ASSERTION_FAILED');
        }
        turn++;
        await delay(100);
      }
    }),
  );

  const rows = samples.slice(before);

  return {
    name,
    concurrency,
    requestedSeconds: seconds,
    elapsedSeconds: (performance.now() - began) / 1000,
    completedRequests: rows.length,
    unexpectedResponses: rows.filter((x) => !x.expected).length,
  };
}

let quotaActor: Awaited<ReturnType<typeof createActor>> | undefined;
let rateActor: Awaited<ReturnType<typeof createActor>> | undefined;

const phases: unknown[] = [];

let passed = false;

try {
  await monitor.connect();
  receipt.postgresMaximumConnections = Number((await monitor.query('SHOW max_connections')).rows[0].max_connections);
  await redis.connect();

  // Refuse a database containing any prior user data, including leftover proof fixtures.
  assert.equal(await store.prisma.organization.count(), 0, 'Dedicated proof DB must start empty');
  await Promise.all([startServer(), startServer()]);

  for (let i = 0; i < 24; i++) {
    const actor = await createActor();
    const project = await store.createProject({ organizationId: actor.org, name: 'Load project', slug: randomUUID() });
    await store.upsertProjectIdeState({
      projectId: project.id,
      state: { files: { entries: files }, ui: { loadProof: { writes: 0 } } },
    });
    actors.push({ ...actor, project: project.id, writes: 0 });
    await request(actor, `/projects/${project.id}/export/zip`, 'setup.materialize');
  }
  quotaActor = await createActor();
  await store.createQuotaOverride({
    organizationId: quotaActor.org,
    key: 'projects.count',
    limit: 1,
    reason: 'Disposable local quota fixture',
  });
  rateActor = await createActor();
  monitorTimer = setInterval(() => {
    void sampleInfrastructure();
  }, 1000);
  phase = 'quota-admission-burst';

  const quotaResults = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      request(quotaActor!, `/orgs/${quotaActor!.org}/projects`, 'quota.admission', [201, 429], {
        replica: i % 2,
        method: 'POST',
        body: { name: `Admission ${i}`, slug: randomUUID() },
      }),
    ),
  );

  const admitted = quotaResults.filter((x) => x.status === 201);
  assert.equal(admitted.length, 1);

  for (const denied of quotaResults.filter((x) => x.status === 429)) {
    assert.equal(denied.body.code, 'QUOTA_EXCEEDED');
  }
  assert.equal(await store.countProjects(quotaActor.org), 1);
  receipt.quotaAdmission = { concurrentRequests: 40, replicas: 2, admitted: 1, refused: 39, persistedProjectCount: 1 };

  phase = 'shared-rate-limit-burst';

  let issued = 0;

  const rateResults: number[] = [];
  await Promise.all(
    Array.from({ length: 32 }, (_, worker) =>
      (async () => {
        while (issued < 2100) {
          issued++;

          const result = await request(rateActor!, `/orgs/${rateActor!.org}/projects`, 'rate-limit.probe', [200, 429], {
            replica: worker % 2,
          });

          if (result.status === 429) {
            assert.ok(Number(result.headers.get('retry-after')) > 0);
          }

          rateResults.push(result.status);
        }
      })(),
    ),
  );
  assert.equal(rateResults.filter((x) => x === 200).length, 2000);
  assert.equal(rateResults.filter((x) => x === 429).length, 100);
  receipt.sharedRateLimit = { requests: 2100, concurrency: 32, replicas: 2, admitted: 2000, denied: 100 };

  phases.push(await mixedPhase('warmup', 4, 15));
  phases.push(await mixedPhase('steady', 8, 60));
  phases.push(await mixedPhase('pressure', 24, 90));
  phases.push(await mixedPhase('recovery', 8, 30));
  phase = 'readback';
  await request(rateActor, `/orgs/${rateActor.org}/projects`, 'rate-limit.recovery');
  assert.equal(await store.countProjects(quotaActor.org), 1);
  await request(quotaActor, `/projects/${admitted[0].body.project.id}`, 'quota.release', 200, { method: 'DELETE' });

  const reopened = await request(quotaActor, `/orgs/${quotaActor.org}/projects`, 'quota.recovery', 201, {
    method: 'POST',
    body: { name: 'Recovered slot', slug: randomUUID() },
  });
  assert.ok(reopened.body.project.id);
  assert.equal(await store.countProjects(quotaActor.org), 1);

  for (const actor of actors) {
    const state = await store.getProjectIdeState(actor.project);
    assert.equal((state!.state as any).ui.loadProof.writes, actor.writes);

    const result = await request(actor, `/projects/${actor.project}/export/zip`, 'readback.export');
    const finalZip = await JSZip.loadAsync(Buffer.from(result.body.archive.base64, 'base64'));
    assert.equal(Object.values(finalZip.files).filter((file) => !file.dir).length, files.length);

    for (const file of expectedFiles(actor.writes)) {
      assert.equal(await finalZip.file(file.path)!.async('string'), file.content);
    }

    const stored = await store.getProjectStorageObject(result.body.archive.storageKey);
    assert.equal(stored?.contentBase64, result.body.archive.base64);
    retainedArchives.push({
      storageKey: result.body.archive.storageKey,
      sha256: createHash('sha256').update(result.body.archive.base64).digest('hex'),
    });
  }

  // Restart both real API processes, then read through fresh processes/connections.
  for (const item of [...children]) {
    await closeServer(item);
  }
  originalMetrics.push(...children.map((x) => x.metrics));
  children.length = 0;
  await Promise.all([startServer(), startServer()]);

  for (const actor of actors) {
    const state = (await request(actor, `/projects/${actor.project}/ide-state`, 'restart.readback')).body.ideState;
    assert.equal(state.state.ui.loadProof.writes, actor.writes);
    assert.deepEqual(
      state.state.files.entries
        .map((x) => ({ path: x.path, content: x.content }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      expectedFiles(actor.writes).sort((a, b) => a.path.localeCompare(b.path)),
    );

    const exported = await request(actor, `/projects/${actor.project}/export/zip`, 'restart.export');
    const zip = await JSZip.loadAsync(Buffer.from(exported.body.archive.base64, 'base64'));
    assert.equal(Object.values(zip.files).filter((file) => !file.dir).length, files.length);

    for (const file of expectedFiles(actor.writes)) {
      assert.equal(await zip.file(file.path)!.async('string'), file.content);
    }
  }

  const freshStore = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));

  try {
    for (const archive of retainedArchives) {
      const stored = await freshStore.getProjectStorageObject(archive.storageKey);
      assert.ok(stored);
      assert.equal(createHash('sha256').update(stored.contentBase64).digest('hex'), archive.sha256);
    }
  } finally {
    await freshStore.prisma.$disconnect();
  }
  receipt.apiMetrics = originalMetrics.map((rows, replica) => ({
    replica,
    maximumRssBytes: Math.max(...rows.map((x) => x.rssBytes)),
    maximumCpuPercentOfOneCore: Math.max(...rows.map((x) => x.cpuPercentOfOneCore)),
    maximumEventLoopP99Ms: Math.max(...rows.map((x) => x.eventLoopP99Ms)),
    maximumEventLoopUtilization: Math.max(...rows.map((x) => x.eventLoopUtilization)),
    blockedOutbound: Math.max(...rows.map((x) => x.blockedOutbound)),
    samples: rows,
  }));
  receipt.readback = {
    projects: actors.length,
    confirmedFileEditsAndStateWrites: actors.reduce((s, x) => s + x.writes, 0),
    filesPerProject: files.length,
    storedArchivesMatched: true,
    finalZipContentsMatchedBeforeAndAfterApiRestart: true,
    retainedArchivesReadWithFreshDatabaseConnectionAfterApiRestart: true,
    survivedBothApiProcessRestarts: true,
    quotaSlotRecoveredAfterArchive: true,
    sharedRateLimitRecoveredAfterExpiry: true,
  };
  assert.equal(failures.length, 0, 'Unexpected responses or data mismatches occurred');
  passed = true;
} catch (error) {
  failures.push(
    error instanceof assert.AssertionError
      ? `ASSERTION: ${error.message.slice(0, 180)}`
      : `LOCAL_PROOF_FAILED_AT_${phase}`,
  );
} finally {
  if (monitorTimer) {
    clearInterval(monitorTimer);
  }

  while (sampling) {
    await delay(20);
  }
  await sampleInfrastructure();

  for (const item of children) {
    await closeServer(item);
  }

  // Only data created by this exact run is deleted; never drop a caller-selected DB.
  await store.prisma.organization.deleteMany({ where: { id: { in: organizations } } });
  await store.prisma.user.deleteMany({ where: { id: { in: users } } });
  receipt.fixtureRowsRemoved =
    (await store.prisma.organization.count()) === 0 && (await store.prisma.user.count()) === 0;
  await store.prisma.$disconnect();
  await monitor.end();

  let cursor = '0';

  do {
    const result = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
    cursor = result[0];

    if (result[1].length) {
      await redis.del(...result[1]);
    }
  } while (cursor !== '0');
  redis.disconnect();
  await rm(directory, { recursive: true, force: true });
  receipt.phases = phases;
  receipt.infrastructure = infrastructure;
  receipt.dockerSamples = dockerSamples;
  receipt.requestSummary = [...new Set(samples.map((x) => `${x.phase}|${x.route}`))].map((key) => {
    const [name, route] = key.split('|');
    const rows = samples.filter((x) => x.phase === name && x.route === route);

    return {
      phase: name,
      route,
      count: rows.length,
      statusCounts: Object.fromEntries(
        [...new Set(rows.map((x) => x.status))].map((status) => [
          status,
          rows.filter((x) => x.status === status).length,
        ]),
      ),
      unexpected: rows.filter((x) => !x.expected).length,
      p50Ms: percentile(
        rows.map((x) => x.ms),
        0.5,
      ),
      p95Ms: percentile(
        rows.map((x) => x.ms),
        0.95,
      ),
      p99Ms: percentile(
        rows.map((x) => x.ms),
        0.99,
      ),
      maxMs: Math.max(...rows.map((x) => x.ms)),
    };
  });
  receipt.availableParallelism = availableParallelism();

  const finalSourceHashes = await sourceHashes();
  receipt.sourceHashes = startingSourceHashes;
  receipt.sourceStable = JSON.stringify(startingSourceHashes) === JSON.stringify(finalSourceHashes);

  const verdict = evaluateLocalLoadEvidence({
    functionalCompleted: passed,
    failures,
    fixtureRowsRemoved: receipt.fixtureRowsRemoved === true,
    sourceStable: receipt.sourceStable === true,
    routes: receipt.requestSummary as Parameters<typeof evaluateLocalLoadEvidence>[0]['routes'],
    metricsByReplica: originalMetrics,
  });
  Object.assign(receipt, verdict);
  passed = verdict.correctnessPassed;
  receipt.passed = passed;
  receipt.failures = failures;
  await writeFile(output, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ passed, phase, requests: samples.length, failures: failures.slice(0, 5), output }));
  process.exit(passed ? 0 : 1);
}
