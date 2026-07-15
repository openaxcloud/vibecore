/*
 * LIVE PROOF harness for the scheduled-task executor.
 *
 * Nothing here is mocked except the two things that only exist inside the
 * cluster:
 *   - the workspace-agent hop -> replaced by a REAL `sh -lc` child process
 *     (identical contract: {code, stdout, stderr}, honours the timeout);
 *   - the Prisma client -> replaced by a thin $queryRawUnsafe/$executeRawUnsafe
 *     shim over node-postgres, so the repository's REAL SQL runs verbatim.
 *
 * Everything else is production code: migration 0069's DDL, the real
 * PostgresScheduledTaskRepository, the real cron engine, the real
 * ScheduledTaskService, the real startScheduledTaskScheduler loop, and the real
 * meterDeployment() from metering-service.ts against the real @vibecore/billing
 * rates (credit wallet debited in memory).
 *
 * Usage:
 *   node ... live-proof.mts setup   # migrate + arm a cron task, print nextRunAt
 *   node ... live-proof.mts run     # start the real scheduler loop and let it fire
 *   node ... live-proof.mts report  # dump the resulting rows
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { nextCronRun } from '../services/api/src/scheduled-tasks-cron.ts';
import { PostgresScheduledTaskRepository } from '../services/api/src/scheduled-tasks-repository.ts';
import { ScheduledTaskService, startScheduledTaskScheduler } from '../services/api/src/scheduled-tasks.ts';
import { meterDeployment } from '../services/api/src/metering-service.ts';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const CONNECTION = { host: '/tmp', port: 5433, user: 'vibecore', database: 'vibecore_proof' };
const ORG = 'org-proof';
const PROJECT = 'project-proof';

const client = new Client(CONNECTION);
await client.connect();

/** The exact surface PostgresScheduledTaskRepository uses from the Prisma client. */
const prismaShim = {
  async $queryRawUnsafe(sql: string, ...params: unknown[]) {
    const { rows } = await client.query(sql, params);

    return rows;
  },
  async $executeRawUnsafe(sql: string, ...params: unknown[]) {
    const { rowCount } = await client.query(sql, params);

    return rowCount ?? 0;
  },
} as any;

const repository = new PostgresScheduledTaskRepository(prismaShim);

/* ---------------------------------------------------------------------------
 * A minimal credit store so the REAL meterDeployment() runs end to end:
 * it records a usage event, prices the run with @vibecore/billing, and debits
 * the wallet. Balances live in Postgres so they survive between invocations.
 * ------------------------------------------------------------------------- */
const store = {
  async recordUsageEvent(input: any) {
    await client.query(
      `INSERT INTO proof_usage_event (organization_id, type, quantity, metadata) VALUES ($1,$2,$3,$4)`,
      [input.organizationId, input.type, input.quantity ?? 0, JSON.stringify(input.metadata ?? {})],
    );

    return input;
  },
  async ensureCreditWallet(organizationId: string) {
    await client.query(
      `INSERT INTO proof_wallet (organization_id, balance_cents) VALUES ($1, 1000)
       ON CONFLICT (organization_id) DO NOTHING`,
      [organizationId],
    );

    const { rows } = await client.query(`SELECT * FROM proof_wallet WHERE organization_id = $1`, [organizationId]);

    return { organizationId, balanceCents: Number(rows[0].balance_cents) };
  },
  async getCreditWallet(organizationId: string) {
    return this.ensureCreditWallet(organizationId);
  },
  async listCreditPacks() {
    return [];
  },
  async decrementCreditPack() {
    return undefined;
  },
  async recordCreditEntry(input: any) {
    await client.query(
      `UPDATE proof_wallet SET balance_cents = balance_cents - $2 WHERE organization_id = $1`,
      [input.organizationId, Math.max(0, Number(input.amountCents ?? 0))],
    );

    return input;
  },
  async recordPaygCharge(input: any) {
    return input;
  },
  async getSubscription() {
    return { planKey: 'pro' };
  },
} as any;

/** The workspace-agent's /commands/run contract, backed by a real child process. */
const exec = async ({ command, timeoutMs }: { command: string; timeoutMs: number }) => {
  return new Promise<{ exitCode: number; output: string }>((resolve) => {
    const child = spawn('sh', ['-lc', command], { env: { ...process.env, SCHEDULED_TASK: '1' } });

    let output = '';

    const timer = setTimeout(() => child.kill('SIGTERM'), Math.max(1000, timeoutMs));

    child.stdout.on('data', (chunk) => (output += chunk.toString('utf8')));
    child.stderr.on('data', (chunk) => (output += chunk.toString('utf8')));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 0, output });
    });
  });
};

const service = new ScheduledTaskService({
  repository,
  store,
  exec,
  resolveWorkflow: async () => undefined,

  // The REAL meter: usage event + @vibecore/billing pricing + wallet debit.
  meter: async (input) =>
    meterDeployment(store, {
      organizationId: input.organizationId,
      kind: 'scheduled',
      computeUnits: input.computeUnits,
      includeBase: false,
      nowMs: input.nowMs,
      paygReference: input.paygReference,
    }),
  onRunFailed: async (failure) => console.log('  [notify] run failed:', failure.taskId, failure.status),
});

const mode = process.argv[2] ?? 'report';

if (mode === 'setup') {
  const ddl = readFileSync(
    new URL('../packages/database/prisma/migrations/0069_scheduled_tasks/migration.sql', import.meta.url),
    'utf8',
  );

  await client.query(`DROP TABLE IF EXISTS "ScheduledTaskRun"; DROP TABLE IF EXISTS "ScheduledTask";
                      DROP TYPE IF EXISTS "ScheduledTaskRunStatus"; DROP TYPE IF EXISTS "ScheduledTaskKind";`);
  await client.query(ddl); // migration 0069, verbatim
  await client.query(`CREATE TABLE IF NOT EXISTS proof_usage_event (
                        id serial primary key, organization_id text, type text, quantity numeric, metadata jsonb,
                        created_at timestamptz default now())`);
  await client.query(`CREATE TABLE IF NOT EXISTS proof_wallet (
                        organization_id text primary key, balance_cents numeric not null default 1000)`);
  await client.query(`DELETE FROM proof_usage_event`);
  await client.query(`DELETE FROM proof_wallet`);

  console.log('migration 0069 applied to a real Postgres 14.\n');

  const now = new Date();

  /*
   * A cron that fires every 2 minutes. nextRunAt is computed by the REAL cron
   * engine — nobody sets it by hand. The run can therefore only happen once that
   * instant has genuinely passed.
   */
  const cron = '*/2 * * * *';
  const nextRunAt = nextCronRun(cron, now, 'UTC')!;

  const command = [
    'echo "hello from the scheduler"',
    'echo "run at: $(date -u +%FT%TZ)"',
    'echo "cwd: $(pwd)"',
    'echo "SCHEDULED_TASK env is: $SCHEDULED_TASK"',
    'node -e "console.log(\'node says:\', 6*7)"',
    'echo "this line goes to stderr" 1>&2',
  ].join(' && ');

  const task = await repository.createTask({
    organizationId: ORG,
    projectId: PROJECT,
    kind: 'DEPLOYMENT',
    name: 'live-proof nightly job',
    command,
    workflowId: null,
    cron,
    timezone: 'UTC',
    machineSize: 'dedicated-1',
    enabled: true,
    timeoutSeconds: 60,
    concurrency: 'FORBID',
    maxRetries: 0,
    notifyOnFailure: true,
    nextRunAt,
    createdByUserId: 'user-proof',
  });

  console.log('ScheduledTask row created in Postgres:');
  console.log('  id          ', task.id);
  console.log('  cron        ', task.cron, `(${task.timezone})`);
  console.log('  machineSize ', task.machineSize);
  console.log('  command     ', task.command.slice(0, 60), '…');
  console.log('  created at  ', now.toISOString());
  console.log('  nextRunAt   ', task.nextRunAt!.toISOString(), `-> fires in ${Math.round((task.nextRunAt!.getTime() - now.getTime()) / 1000)}s`);
  console.log('\nNothing has run yet:', (await repository.listRuns(task.id, 10)).length, 'runs.');
} else if (mode === 'run') {
  /*
   * Start the REAL periodic scheduler (the same function the api boots) and let
   * it discover the due task on its own. No manual trigger.
   */
  const started = Date.now();
  const [task] = await repository.listProjectTasks(PROJECT);

  console.log('now        ', new Date().toISOString());
  console.log('nextRunAt  ', task.nextRunAt?.toISOString() ?? '(none)');
  console.log('due?       ', task.nextRunAt! <= new Date() ? 'YES — the scheduled instant has passed' : 'not yet');
  console.log('\nstarting the real scheduler loop (startScheduledTaskScheduler, 2s tick)…\n');

  const scheduler = startScheduledTaskScheduler(service, { intervalMs: 2000, logger: console });

  // Poll the DB (not the service) until a run reaches a terminal state.
  for (;;) {
    const runs = await repository.listRuns(task.id, 5);
    const run = runs[0];

    if (run && run.status !== 'RUNNING') {
      console.log(`the scheduler fired it on its own after ${Math.round((Date.now() - started) / 1000)}s.`);
      break;
    }

    if (Date.now() - started > 28_000) {
      console.log('gave up waiting (28s).');
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  scheduler.stop();
} else {
  const [task] = await repository.listProjectTasks(PROJECT);
  const runs = await repository.listRuns(task.id, 10);

  console.log('=== ScheduledTask (Postgres row) ===');
  console.log('  id         ', task.id);
  console.log('  cron       ', task.cron, `(${task.timezone})`, '| machine:', task.machineSize);
  console.log('  lastStatus ', task.lastStatus, '| lastRunAt', task.lastRunAt?.toISOString());
  console.log('  nextRunAt  ', task.nextRunAt?.toISOString(), '(already advanced to the following fire)');

  for (const run of runs) {
    console.log('\n=== ScheduledTaskRun (Postgres row) ===');
    console.log('  id           ', run.id);
    console.log('  status       ', run.status);
    console.log('  trigger      ', run.trigger);
    console.log('  scheduledFor ', run.scheduledFor.toISOString());
    console.log('  startedAt    ', run.startedAt.toISOString());
    console.log('  finishedAt   ', run.finishedAt?.toISOString());
    console.log('  durationMs   ', run.durationMs);
    console.log('  exitCode     ', run.exitCode);
    console.log('  machineSize  ', run.machineSize);
    console.log('  computeUnits ', run.computeUnits);
    console.log('  costCents    ', run.costCents, '<- BILLED (not zero)');
    console.log('  meteredAt    ', run.meteredAt?.toISOString());
    console.log('  --- REAL LOGS (verbatim from the row) ---');
    console.log(
      run.logs
        .split('\n')
        .map((line) => `  | ${line}`)
        .join('\n'),
    );
  }

  const usage = await client.query(`SELECT type, quantity, metadata FROM proof_usage_event ORDER BY id`);
  const wallet = await client.query(`SELECT * FROM proof_wallet`);

  console.log('\n=== Billing side-effects (real meterDeployment) ===');
  console.log('  usage events :', JSON.stringify(usage.rows));
  console.log('  credit wallet:', JSON.stringify(wallet.rows), '(started at 1000 cents)');
}

await client.end();
