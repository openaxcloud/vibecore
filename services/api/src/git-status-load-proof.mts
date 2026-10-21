import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import { buildApiApp } from './app.js';
import { PrismaApiStore } from './prisma-store.js';

const url = new URL(process.env.DATABASE_URL!);
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '55438' && url.pathname === '/panel_proof');
assert.equal(process.env.NODE_ENV, 'test');
assert(process.argv[2], 'Supply an output JSON path');

const output = resolve(process.argv[2]);
const directory = await mkdtemp(join(tmpdir(), 'git-status-load-'));
process.env.PROJECT_STORAGE_DIR = join(directory, 'storage');

const trace = join(directory, 'git-trace.jsonl');
const source = await readFile(new URL('./project-storage.ts', import.meta.url));
const store = new PrismaApiStore();

let app = await buildApiApp({
  store,
  loggerStream: {
    write() {
      /* No session or request data is written to the receipt. */
    },
  },
});

let origin = await app.listen({ host: '127.0.0.1', port: 0 });

const userIds: string[] = [];
const organizationIds: string[] = [];

let projectId: string | undefined;

const tokens: string[] = [];

const files = Array.from({ length: 20 }, (_, index) => ({
  path: `file-${index}.txt`,
  content: `Synthetic ${index}\n`.repeat(50),
}));

const results: { route: string; milliseconds: number; status: number }[] = [];

let archive: { storageKey: string; base64: string } | undefined;

async function request(route: string, actor = 0) {
  const started = performance.now();
  const response = await fetch(`${origin}${route}`, { headers: { authorization: `Bearer ${tokens[actor]}` } });
  const data = await response.json();
  results.push({
    route: route.replace(projectId!, ':projectId'),
    milliseconds: performance.now() - started,
    status: response.status,
  });

  return { response, data };
}

async function status() {
  const { response, data } = await request(`/projects/${projectId}/git/status`);
  assert.equal(response.status, 200);
  assert.deepEqual(data.status.changedFiles.sort(), files.map((file) => file.path).sort());
}

async function exported() {
  const { response, data } = await request(`/projects/${projectId}/export/zip`);
  assert.equal(response.status, 200);
  archive = data.archive;

  const zip = await JSZip.loadAsync(Buffer.from(data.archive.base64, 'base64'));
  assert.equal(Object.values(zip.files).filter((file) => !file.dir).length, files.length);

  for (const file of files) {
    assert.equal(await zip.file(file.path)!.async('string'), file.content);
  }
}

let measurement;

try {
  for (let actor = 0; actor < 2; actor++) {
    const suffix = randomUUID();

    const user = await store.createUser({
      email: `${suffix}@example.test`,
      name: 'Git load proof',
      passwordHash: 'synthetic-login-disabled',
    });
    userIds.push(user.id);

    const org = await store.createOrganization({ name: 'Git load proof', slug: suffix, ownerUserId: user.id });
    organizationIds.push(org.id);

    const token = randomUUID();
    tokens.push(token);
    await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3600000) });
  }
  projectId = (
    await store.createProject({ organizationId: organizationIds[0], name: 'Git load proof', slug: randomUUID() })
  ).id;
  await store.upsertProjectIdeState({ projectId, state: { files: { entries: files } } });
  await exported();
  await status();
  results.length = 0;
  process.env.GIT_TRACE2_EVENT = trace;

  const cpu = process.cpuUsage();
  const started = performance.now();

  for (let round = 0; round < 10; round++) {
    await Promise.all([
      status(),
      exported(),
      request('/health').then(({ response }) => assert.equal(response.status, 200)),
    ]);
  }

  const wallMs = performance.now() - started;
  const cpuMicros = process.cpuUsage(cpu);
  const measurementResults = results.slice();
  delete process.env.GIT_TRACE2_EVENT;

  const starts = (await readFile(trace, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.event === 'start');
  assert.equal((await request(`/projects/${projectId}/git/status`, 1)).response.status, 404);
  assert.equal((await request(`/projects/${projectId}/export/zip`, 1)).response.status, 404);
  await app.close();
  await store.prisma.$disconnect();

  const fresh = new PrismaApiStore();

  try {
    assert.equal((await fresh.getProjectStorageObject(archive!.storageKey))?.contentBase64, archive!.base64);
  } finally {
    await fresh.prisma.$disconnect();
  }
  app = await buildApiApp({
    store,
    loggerStream: {
      write() {
        /* No session or request data is written to the receipt. */
      },
    },
  });
  origin = await app.listen({ host: '127.0.0.1', port: 0 });
  await status();
  await exported();
  measurement = {
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
    sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    source: { path: 'services/api/src/project-storage.ts', sha256: createHash('sha256').update(source).digest('hex') },
    rounds: 10,
    wallMs,
    cpuMicros,
    gitProcesses: starts.length,
    repositoryProbes: starts.filter((entry) => entry.argv.includes('rev-parse')).length,
    configurationProcesses: starts.filter((entry) => entry.argv.includes('config')).length,
    measurementResults,
    validationResults: results.slice(measurementResults.length),
    persistenceAfterReconnect: true,
    foreignOrganizationRefusals: 2,
    exitCode: 0,
    limitations: [
      'Isolated local workload, not reproduction of the editor CPU profile or original 8.86 seconds.',
      'CPU usage measures this API process only, not child Git processes or host contention.',
    ],
  };
} finally {
  delete process.env.GIT_TRACE2_EVENT;
  await app.close();
  await store.prisma.projectStorageObject.deleteMany({ where: { projectId: projectId ?? 'not-created' } });
  await store.prisma.project.deleteMany({ where: { id: projectId ?? 'not-created' } });
  await store.prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await store.prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await store.prisma.$disconnect();
  await rm(directory, { recursive: true, force: true });
}
await writeFile(output, JSON.stringify(measurement, null, 2) + '\n');
