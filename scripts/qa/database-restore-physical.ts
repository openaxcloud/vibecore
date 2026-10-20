/**
 * Run explicitly with `tsx scripts/qa/database-restore-physical.ts`.
 * Requires the fixture's cached PostgreSQL image and local Docker. No image
 * pulls, cloud resources, customer data, payments or persistent access.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { hashToken } from '@vibecore/auth';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { decryptJson, encryptJson } from '@vibecore/security';
import { DatabaseRestoreCoordinator } from '../../services/api/src/database-restore-executor.js';
import { PrismaDatabaseRestoreRepository } from '../../services/api/src/database-restore-repository.js';
import type { DatabaseRestorePorts, RestoreScope } from '../../services/api/src/database-restore-contract.js';
import type { DatabaseInstanceRecord } from '../../services/api/src/store.js';
import { PhysicalRestoreFixture } from './database-restore-physical-fixture.js';
import { createDatabaseRestoreApiFixture } from './database-restore-api-fixture.js';

const execute = promisify(execFile);
const fixture = new PhysicalRestoreFixture();
const encryptionKey = randomBytes(32).toString('hex');
// The ordinary SQL API resolver uses this key; keep it aligned with the
// coordinator inside this disposable process only.
process.env.CONFIG_ENCRYPTION_KEY = encryptionKey;
const encryptConnection = (uri: string) => encryptJson({ value: uri }, encryptionKey);
const decryptConnection = (encrypted: string) => decryptJson<{ value: string }>(encrypted, encryptionKey).value;
const output = resolve(process.env.RESTORE_QA_OUTPUT ?? '.vibecore/qa-physical-restore');
const started = Date.now();
let prisma: DatabaseClient | undefined;
let api: Awaited<ReturnType<typeof createDatabaseRestoreApiFixture>> | undefined;
let passed = false;
let failure = '';
let stage = 'initialize';

function scope(input: RestoreScope): RestoreScope {
  return {
    operationId: input.operationId,
    instanceId: input.instanceId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    environment: input.environment,
    attemptToken: input.attemptToken,
  };
}

try {
  await mkdir(output, { recursive: true });
  await fixture.initialize();
  stage = 'tamper detection';
  await fixture.proveTamperDetection();
  stage = 'control database migrations';
  const controlUri = await fixture.createControlDatabase();
  process.env.DATABASE_URL = controlUri;
  await execute(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: resolve('packages/database'),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DATABASE_URL: controlUri,
      NODE_ENV: 'test',
    },
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  stage = 'PostgreSQL repository regressions';
  const repositoryTests = await execute(
    process.execPath,
    [
      resolve('node_modules/vitest/vitest.mjs'),
      'run',
      '--root',
      resolve('services/api'),
      '--config',
      resolve('services/api/vitest.config.ts'),
      'src/tests/database-restore-repository.spec.ts',
      '--maxWorkers=1',
      '--no-file-parallelism',
    ],
    {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: 'test',
        RESTORE_TEST_DATABASE_URL: controlUri,
      },
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    },
  );
  await writeFile(resolve(output, 'private-repository-tests.log'), repositoryTests.stdout, { mode: 0o600 });
  const testSummary = repositoryTests.stdout.replace(/\u001b\[[0-9;]*m/g, '').match(/Tests\s+(\d+) passed/);
  assert.ok(testSummary, 'Repository test summary was not found');
  assert.equal(Number(testSummary[1]), 15, 'All PostgreSQL repository cases must run');
  fixture.evidence.repositoryTests = { passed: Number(testSummary[1]), database: 'isolated restore_control' };
  prisma = createDatabaseClient({ poolMax: 3 });
  stage = 'control fixtures';
  const organization = await prisma.organization.create({
    data: { name: 'Isolated physical restoration QA', slug: fixture.name },
  });
  const project = await prisma.project.create({
    data: { name: 'Synthetic restore application', slug: fixture.name, organizationId: organization.id },
  });
  const row = await prisma.databaseInstance.create({
    data: {
      projectId: project.id,
      organizationId: organization.id,
      environment: 'development',
      status: 'ACTIVE',
      pitrEnabled: true,
    },
  });
  const instance: DatabaseInstanceRecord = {
    id: row.id,
    projectId: row.projectId,
    organizationId: row.organizationId,
    environment: 'development',
    status: 'ACTIVE',
    engine: row.engine,
    sizeBytes: 0,
    retentionDays: row.retentionDays,
    pitrEnabled: true,
    bindingVersion: row.bindingVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  const originalSecret = encryptConnection(fixture.sourceUri);
  const otherEnvironmentSecret = encryptConnection(fixture.sourceUri);
  await prisma.projectSecret.createMany({
    data: [
      {
        projectId: project.id,
        key: 'DATABASE_URL',
        valueEncrypted: originalSecret,
        valueHash: hashToken(originalSecret),
      },
      {
        projectId: project.id,
        key: 'PROD_DATABASE_URL',
        valueEncrypted: otherEnvironmentSecret,
        valueHash: hashToken(otherEnvironmentSecret),
      },
    ],
  });
  const attempts = new Map<string, string>();
  const enteredPhases: string[] = [];
  function checkAttempt(input: RestoreScope): void {
    assert.equal(input.instanceId, instance.id);
    assert.equal(input.projectId, project.id);
    assert.equal(input.organizationId, organization.id);
    assert.equal(input.environment, 'development');
    const previous = attempts.get(input.operationId);
    if (previous) assert.equal(input.attemptToken, previous);
    else attempts.set(input.operationId, input.attemptToken);
  }
  const ports: DatabaseRestorePorts = {
    available: async (candidate) => candidate.id === instance.id && candidate.environment === 'development',
    validateArchive: async (input) => {
      checkAttempt(input);
      enteredPhases.push('validateArchive');
      assert.equal(input.targetTimestamp, fixture.targetTimestamp);
      await fixture.verifyArchive();
      return {
        ...scope(input),
        archiveId: `${fixture.name}/basebackup`,
        manifestSha256: fixture.manifestSha256,
        sourceInstanceId: instance.id,
        sourceSystemIdentifier: fixture.sourceSystemIdentifier,
        targetTimestamp: fixture.targetTimestamp,
        expectedReadbackSha256: fixture.expectedReadbackSha256,
      };
    },
    prepareTarget: async (input) => {
      checkAttempt(input);
      enteredPhases.push('prepareTarget');
      assert.equal(input.archive.manifestSha256, fixture.manifestSha256);
      const target = await fixture.prepareTarget(input.targetId);
      return { ...scope(input), ...target };
    },
    quiesceApplication: async (input) => {
      checkAttempt(input);
      enteredPhases.push('quiesceApplication');
      return { ...scope(input), ...(await fixture.quiesceApplication()) };
    },
    reconnectAndReadback: async (input) => {
      checkAttempt(input);
      enteredPhases.push('reconnectAndReadback');
      assert.equal(input.connectionUri, fixture.targetUri);
      const restored = await fixture.reconnectAndReadback(input.bindingVersion);
      assert.equal(restored.targetId, input.target.targetId);
      return { ...scope(input), ...restored, systemIdentifier: fixture.sourceSystemIdentifier };
    },
    releaseApplication: async (input) => {
      checkAttempt(input);
      enteredPhases.push('releaseApplication');
      await fixture.releaseApplication(input.bindingVersion);
      return {
        ...scope(input),
        targetId: input.targetId,
        bindingVersion: input.bindingVersion,
        receiptId: `${fixture.name}-released`,
      };
    },
    fenceAttempt: async () => {
      // This drill proves the physical chain, not exclusion of a crashed
      // distributed worker. Never acknowledge fencing that did not happen.
      throw new Error('QA_DISTRIBUTED_FENCING_UNAVAILABLE');
    },
  };
  const coordinator = () =>
    new DatabaseRestoreCoordinator({
      repository: new PrismaDatabaseRestoreRepository(prisma!),
      ports,
      encryptConnection,
      decryptConnection,
    });
  stage = 'authenticated HTTP admission';
  api = await createDatabaseRestoreApiFixture({
    prisma,
    coordinator: coordinator(),
    projectId: project.id,
    organizationId: organization.id,
  });
  const requestRestore = () =>
    fetch(`${api!.origin}/projects/${project.id}/database/restores`, {
      method: 'POST',
      headers: api!.headers,
      body: JSON.stringify({ environment: 'development', targetTimestamp: fixture.targetTimestamp }),
    });
  const admitted = await requestRestore();
  assert.equal(admitted.status, 202);
  const { restore: requested } = (await admitted.json()) as { restore: { id: string; status: string } };
  assert.equal(requested.status, 'PENDING');
  stage = 'concurrent HTTP admission';
  const conflict = await requestRestore();
  assert.equal(conflict.status, 409);
  const conflictBody = (await conflict.json()) as { code: string };
  assert.equal(conflictBody.code, 'RESTORE_ALREADY_RUNNING');
  fixture.evidence.concurrentAdmissionRejected = true;
  fixture.evidence.httpAdmission = { status: admitted.status, concurrentStatus: conflict.status };
  // A second control client reads the durable record independently of the API
  // request and its still-running background operation.
  const observer = createDatabaseClient({ poolMax: 1 });
  try {
    const persisted = await new PrismaDatabaseRestoreRepository(observer).get(requested.id);
    assert.equal(persisted?.restore.targetTimestamp, fixture.targetTimestamp);
  } finally {
    await observer.$disconnect();
  }
  stage = 'physical coordinator execution';
  const deadline = Date.now() + 90_000;
  let completed = await coordinator().evidence(requested.id);
  while (
    completed &&
    !['COMPLETED', 'FAILED', 'RECOVERY_REQUIRED'].includes(completed.phase) &&
    Date.now() < deadline
  ) {
    await new Promise((done) => setTimeout(done, 100));
    completed = await coordinator().evidence(requested.id);
  }
  fixture.evidence.coordinatorResult = completed
    ? {
        status: completed.status,
        phase: completed.phase,
        failureCode: completed.failureCode,
        applicationCutoverVerified: completed.applicationCutoverVerified,
      }
    : { missing: true };
  assert.equal(completed?.status, 'COMPLETED');
  assert.equal(completed?.applicationCutoverVerified, true);
  assert.deepEqual(enteredPhases, [
    'validateArchive',
    'prepareTarget',
    'quiesceApplication',
    'reconnectAndReadback',
    'releaseApplication',
  ]);
  const journal = await prisma.databaseRestoreExecution.findUniqueOrThrow({ where: { restoreId: requested.id } });
  const binding = await prisma.databaseInstance.findUniqueOrThrow({ where: { id: instance.id } });
  const secret = await prisma.projectSecret.findUniqueOrThrow({
    where: { projectId_key: { projectId: project.id, key: 'DATABASE_URL' } },
  });
  assert.equal(binding.activeTargetRef, journal.targetId);
  assert.equal(binding.bindingVersion, 1);
  assert.equal(decryptConnection(secret.valueEncrypted!), fixture.targetUri);
  assert.equal(journal.activeLock, null);
  assert.equal(journal.phase, 'COMPLETED');
  assert.ok(journal.readback);
  assert.ok(journal.release);
  const other = await prisma.projectSecret.findUniqueOrThrow({
    where: { projectId_key: { projectId: project.id, key: 'PROD_DATABASE_URL' } },
  });
  assert.equal(other.valueEncrypted, otherEnvironmentSecret);
  fixture.evidence.otherEnvironmentBindingUnchanged = true;
  fixture.evidence.durableJournal = {
    status: completed.status,
    phase: journal.phase,
    bindingVersion: binding.bindingVersion,
    activeLockReleased: true,
  };
  stage = 'SQL API target readback';
  const sqlResponse = await fetch(`${api.origin}/projects/${project.id}/databases/query`, {
    method: 'POST',
    headers: api.headers,
    body: JSON.stringify({ key: 'DATABASE_URL', query: 'SELECT id, value FROM restore_probe ORDER BY id' }),
  });
  assert.equal(sqlResponse.status, 200);
  const sqlBody = (await sqlResponse.json()) as { result: { rows: unknown[] } };
  assert.equal(
    createHash('sha256').update(JSON.stringify(sqlBody.result.rows)).digest('hex'),
    fixture.expectedReadbackSha256,
  );
  fixture.evidence.apiSqlReadback = { status: 200, rowCount: sqlBody.result.rows.length, expectedDigestMatched: true };
  await api.close();
  api = undefined;
  stage = 'durability and application reconnection';
  await fixture.verifyDurableTarget();
  await prisma.$disconnect();
  prisma = createDatabaseClient({ poolMax: 3 });
  const persisted = await prisma.databaseInstance.findUniqueOrThrow({ where: { id: instance.id } });
  assert.equal(persisted.activeTargetRef, journal.targetId);
  assert.equal(persisted.bindingVersion, 1);
  await fixture.reconnectAndReadback(persisted.bindingVersion);
  await fixture.releaseApplication(persisted.bindingVersion);
  fixture.evidence.controlClientReopened = true;
  fixture.evidence.phaseOrder = enteredPhases;
  fixture.evidence.limits = [
    'Local synthetic read-only probe application and locally cached PostgreSQL only',
    'Control and application databases are distinct but share the source QA container',
    'No CNPG, cloud archive, production runtime, billing or customer data',
    'Distributed worker fencing and quiescence of every production SQL consumer are not proven by this drill',
  ];
  passed = true;
} catch (error) {
  // Never print a Prisma/Docker error payload or a connection string.
  failure = error instanceof assert.AssertionError ? 'QA_ASSERTION_FAILED' : 'QA_EXECUTION_FAILED';
  fixture.evidence.failedStage = stage;
  await writeFile(
    resolve(output, 'private-failure.txt'),
    error instanceof Error ? (error.stack ?? error.name) : 'Unknown QA failure',
    { mode: 0o600 },
  );
} finally {
  try {
    await api?.close();
  } catch {
    passed = false;
    failure = 'QA_API_CLEANUP_UNCONFIRMED';
  }
  try {
    await prisma?.$disconnect();
  } catch {
    passed = false;
    failure = 'QA_CONTROL_DISCONNECT_UNCONFIRMED';
  }
  try {
    await fixture.close();
  } catch {
    passed = false;
    failure = 'QA_CLEANUP_UNCONFIRMED';
  }
  await mkdir(output, { recursive: true });
  const result = {
    passed,
    failure: failure || undefined,
    recordedAt: new Date().toISOString(),
    durationMilliseconds: Date.now() - started,
    ...fixture.evidence,
  };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({ passed, failure: failure || undefined, durationMilliseconds: result.durationMilliseconds }),
  );
}
if (!passed) process.exitCode = 1;
