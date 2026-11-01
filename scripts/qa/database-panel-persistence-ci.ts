/**
 * Twelve blocking PostgreSQL persistence regressions for the disposable Production CI service.
 * This is not a general-purpose database runner: its endpoint and credentials
 * must exactly match ci.yml. No container, provider, or cloud API is called.
 *
 * Only an acknowledged CREATE followed by matching OID/owner/run marker permits
 * DROP. An uncertain CREATE is deliberately left to the CI service teardown.
 * Child output and raw database errors never reach logs. The private Vitest
 * report supplies only counters and test names, then is removed. The persistence scenario reads over loopback HTTP from a new API/Prisma child process; no browser is involved.
 */
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apiRoot = resolve(root, 'services/api');
export const requiredSpecs = ['src/tests/database-panel.postgres.spec.ts'] as const;

/** Pure preflight; callers must run it before constructing a database client. */
export function validateCiDatabaseTarget(env: NodeJS.ProcessEnv): URL {
  const value = env.DATABASE_URL;
  const expected = 'vibecore:vibecore@127.0.0.1:55432/vibecore';

  if (env.CI !== 'true' || !value || ![`postgresql://${expected}`, `postgres://${expected}`].includes(value)) {
    throw new Error('PERSISTENCE_CI_SERVICE_CONFIGURATION_REFUSED');
  }

  return new URL(value);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function safeTestName(value: unknown): string {
  if (typeof value !== 'string') {
    return '(unnamed test)';
  }

  /*
   * Test names normally come from static source. Avoid emitting future dynamic
   * credentials even when somebody adds them to a test title.
   */
  if (/[\w+.-]+:\/\/|\b(?:password|secret|token)\s*[:=]/i.test(value)) {
    return '(test name redacted)';
  }

  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 240);
}

export function summarizeCiTestReport(value: unknown) {
  const report = record(value);
  const results = Array.isArray(report.testResults) ? report.testResults.map(record) : [];

  const files = requiredSpecs.map((file) => {
    const matches = results.filter((result) => result.name === resolve(apiRoot, file));
    const result = matches[0] ?? {};
    const assertions = Array.isArray(result.assertionResults) ? result.assertionResults.map(record) : [];
    const passed = assertions.filter((assertion) => assertion.status === 'passed').length;

    const failedTests = assertions
      .filter((assertion) => assertion.status !== 'passed')
      .map((assertion) => ({
        name: safeTestName(assertion.fullName),
        status: safeTestName(assertion.status),
      }));

    return {
      file,
      present: matches.length === 1,
      tests: assertions.length,
      passed,
      nonPassed: assertions.length - passed,
      failedTests,
      valid:
        matches.length === 1 && result.status === 'passed' && assertions.length > 0 && passed === assertions.length,
    };
  });

  const total = files.reduce((sum, file) => sum + file.tests, 0);

  const valid =
    total === 12 &&
    report.success === true &&
    results.length === requiredSpecs.length &&
    report.numFailedTestSuites === 0 &&
    report.numPendingTestSuites === 0 &&
    report.numFailedTests === 0 &&
    report.numPendingTests === 0 &&
    report.numTodoTests === 0 &&
    report.numTotalTests === total &&
    report.numPassedTests === total &&
    files.every((file) => file.valid);

  return {
    valid,
    total,
    passed: files.reduce((sum, file) => sum + file.passed, 0),
    nonPassed: files.reduce((sum, file) => sum + file.nonPassed, 0),
    files,
  };
}

function log(stage: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event: 'PERSISTENCE_POSTGRESQL_CI', stage, ...detail }));
}

function runChild(args: string[], cwd: string, env: NodeJS.ProcessEnv, signal: AbortSignal, timeoutMs: number) {
  signal.throwIfAborted();

  return new Promise<boolean>((done) => {
    /*
     * Linux CI: the private process group includes any workers. No inherited
     * stdout/stderr and no shell interpolation of credentials or SQL.
     */
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: 'ignore',
      detached: true,
    });

    let stopped = false;

    const stop = () => {
      stopped = true;

      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          // A process that has already exited cannot be killed.
        }
      }
    };

    const timeout = setTimeout(stop, timeoutMs);
    signal.addEventListener('abort', stop, { once: true });

    if (signal.aborted) {
      stop();
    }

    const finish = (passed: boolean) => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', stop);
      done(passed && !stopped);
    };
    child.once('error', () => finish(false));
    child.once('close', (code) => finish(code === 0));
  });
}

export interface DatabaseIdentity {
  oid: string;
  owner: string;
  marker: string | null;
}

/** An acknowledged CREATE plus exact OID/owner/run marker is required before DROP. */
export function cleanupIdentityMatches(
  created: boolean,
  identity: DatabaseIdentity | undefined,
  rows: DatabaseIdentity[],
  marker: string,
): boolean {
  if (!created || !identity || rows.length !== 1 || !/^persistence-ci-[a-f0-9]{32}$/.test(marker)) {
    return false;
  }

  const owned = rows[0];

  return (
    /^\d+$/.test(identity.oid) &&
    identity.owner === 'vibecore' &&
    identity.marker === null &&
    owned.oid === identity.oid &&
    owned.owner === 'vibecore' &&
    owned.marker === marker
  );
}

export function assertDatabaseAbsent(rows: unknown[]): void {
  if (rows.length !== 0) {
    throw new Error('PERSISTENCE_CI_DATABASE_ALREADY_EXISTS');
  }
}

export function dedicatedDatabaseUrl(): string {
  return 'postgresql://vibecore:vibecore@127.0.0.1:55432/database_audit';
}

async function main() {
  let stage = 'preflight';
  let client: Client | undefined;
  let directory: string | undefined;
  let created = false;
  let creationAttempted = false;
  let identity: DatabaseIdentity | undefined;
  let cleanup = 'not-created';
  let passed = false;

  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);

  const suffix = randomBytes(16).toString('hex');
  const database = 'database_audit';
  const marker = `persistence-ci-${suffix}`;

  try {
    const target = validateCiDatabaseTarget(process.env);
    const commit = process.env.GITHUB_SHA;

    if (!commit || !/^[a-f0-9]{40}$/i.test(commit)) {
      throw new Error('PERSISTENCE_CI_COMMIT_REQUIRED');
    }

    const sources = [
      'scripts/qa/database-panel-persistence-ci.ts',
      'services/api/src/tests/database-panel.postgres.spec.ts',
      'services/api/src/database-panel-process-child.ts',
      'services/api/src/database-row-insert.ts',
      'services/api/src/app.ts',
      'app/components/database/create-table.ts',
    ];
    const hashes = Object.fromEntries(
      await Promise.all(
        sources.map(async (file) => [
          file,
          createHash('sha256')
            .update(await readFile(resolve(root, file)))
            .digest('hex'),
        ]),
      ),
    );
    log('source-provenance', {
      commit,
      hashes,
      scope: 'new API/Prisma child process, same persisted session, loopback HTTP; no browser',
    });

    if (process.platform !== 'linux') {
      throw new Error('PERSISTENCE_CI_LINUX_REQUIRED');
    }

    abort.signal.throwIfAborted();
    stage = 'service-identity';
    log(stage);
    client = new Client({
      host: target.hostname,
      port: Number(target.port),
      user: target.username,
      password: target.password,
      database: 'vibecore',
      ssl: false,
      options: '',
      connectionTimeoutMillis: 10_000,
      statement_timeout: 15_000,
      query_timeout: 20_000,
      application_name: 'vibecore-persistence-ci',
    });

    // pg may emit errors outside a pending query; never print their raw text.
    client.on('error', cancel);
    await client.connect();

    const server = await client.query<{
      database: string;
      role: string;
      version: number;
      recovery: boolean;
    }>(
      `SELECT current_database() AS database, current_user AS role,
       current_setting('server_version_num')::int AS version, pg_is_in_recovery() AS recovery`,
    );

    const current = server.rows[0];

    if (
      current?.database !== 'vibecore' ||
      current.role !== 'vibecore' ||
      current.version < 160000 ||
      current.version >= 170000 ||
      current.recovery !== false
    ) {
      throw new Error('PERSISTENCE_CI_SERVICE_IDENTITY_REFUSED');
    }

    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);

    assertDatabaseAbsent(existing.rows);

    abort.signal.throwIfAborted();
    stage = 'create-dedicated-database';
    log(stage, { database });
    creationAttempted = true;
    await client.query(`CREATE DATABASE "${database}" OWNER vibecore TEMPLATE template0`);
    created = true;
    cleanup = 'identity-not-attested';

    const createdIdentity = await client.query<DatabaseIdentity>(
      `SELECT oid::text AS oid, pg_get_userbyid(datdba) AS owner,
       shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = $1`,
      [database],
    );
    identity = createdIdentity.rows[0];

    if (!identity || identity.owner !== 'vibecore' || identity.marker !== null) {
      throw new Error('PERSISTENCE_CI_CREATED_IDENTITY_REFUSED');
    }

    // The identifier and marker contain only fixed ASCII prefixes and hex.
    await client.query(`COMMENT ON DATABASE "${database}" IS '${marker}'`);
    directory = await mkdtemp(resolve(tmpdir(), 'vibecore-persistence-ci-'));

    const childDatabaseUrl = dedicatedDatabaseUrl();

    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: 'C.UTF-8',
      CI: 'true',
      NODE_ENV: 'test',
      DATABASE_URL: childDatabaseUrl,
      DATABASE_PANEL_TEST_URL: childDatabaseUrl,
    };
    stage = 'migrate-dedicated-database';
    log(stage);

    if (
      !(await runChild(
        [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
        resolve(root, 'packages/database'),
        env,
        abort.signal,
        180_000,
      ))
    ) {
      throw new Error('PERSISTENCE_CI_MIGRATION_FAILED');
    }

    stage = 'postgresql-regressions';
    log(stage, { files: requiredSpecs });

    const reportFile = resolve(directory, 'vitest.json');

    const testsPassed = await runChild(
      [
        resolve(root, 'node_modules/vitest/vitest.mjs'),
        'run',
        '--root',
        apiRoot,
        '--config',
        resolve(apiRoot, 'vitest.config.ts'),
        ...requiredSpecs,
        '--maxWorkers=1',
        '--no-file-parallelism',
        '--reporter=json',
        `--outputFile=${reportFile}`,
      ],
      root,
      env,
      abort.signal,
      540_000,
    );

    const report = summarizeCiTestReport(JSON.parse(await readFile(reportFile, 'utf8')));
    log(stage, { processPassed: testsPassed, ...report });

    if (!testsPassed || !report.valid) {
      throw new Error('PERSISTENCE_CI_REGRESSIONS_INCOMPLETE');
    }

    passed = true;
  } catch (error) {
    const code =
      error instanceof Error && /^PERSISTENCE_CI_[A-Z_]+$/.test(error.message)
        ? error.message
        : 'PERSISTENCE_CI_STAGE_FAILED';
    log(stage, { passed: false, code, interrupted: abort.signal.aborted });
  } finally {
    if (created && client && identity) {
      try {
        const result = await client.query<DatabaseIdentity>(
          `SELECT oid::text AS oid, pg_get_userbyid(datdba) AS owner,
           shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = $1`,
          [database],
        );

        if (!cleanupIdentityMatches(created, identity, result.rows, marker)) {
          throw new Error('PERSISTENCE_CI_CLEANUP_IDENTITY_REFUSED');
        }

        await client.query(`DROP DATABASE "${database}" WITH (FORCE)`);

        const remaining = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);

        if (remaining.rows.length !== 0) {
          throw new Error('PERSISTENCE_CI_CLEANUP_NOT_CONFIRMED');
        }

        cleanup = 'owned-database-removed';
      } catch {
        cleanup = 'refused-or-unconfirmed';
        passed = false;
      }
    } else if (creationAttempted && !created) {
      cleanup = 'create-unconfirmed-no-drop-attempted';
      passed = false;
    }

    if (created && cleanup !== 'owned-database-removed') {
      passed = false;
    }

    await client?.end().catch(() => undefined);

    if (directory) {
      await rm(directory, { recursive: true, force: true }).catch(() => {
        passed = false;
        log('private-report-cleanup', { passed: false });
      });
    }

    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    passed = passed && !abort.signal.aborted;
    log('complete', { passed, cleanup, database });
    process.exitCode = passed ? 0 : 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
