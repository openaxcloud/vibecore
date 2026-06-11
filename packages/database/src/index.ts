import { PrismaClient, Prisma } from '../generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

export { PrismaClient, Prisma };

export type DatabaseClient = InstanceType<typeof import('../generated/client/index.js').PrismaClient>;

export function getDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the persistent Prisma/PostgreSQL store.');
  }

  return process.env.DATABASE_URL;
}

export function createDatabaseClient(options?: { poolMax?: number }) {
  /*
   * Pool tuning + timeouts (#31). Without these the pg pool used node-postgres
   * defaults: an unbounded wait for a free connection and no statement timeout,
   * so one hung query could pin a connection (and, under load, exhaust the pool
   * and wedge the service). All overridable via env; NaN-safe so a bad/absent
   * value falls back to the default. `options.poolMax` lets a caller create a
   * small dedicated pool (e.g. the advisory-lock connection pool).
   */
  const poolMax = options?.poolMax ?? (Number(process.env.DATABASE_POOL_MAX) || 10);
  const connectionTimeoutMillis = Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS) || 10_000;
  const idleTimeoutMillis = Number(process.env.DATABASE_IDLE_TIMEOUT_MS) || 30_000;
  const statementTimeoutMs = Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS) || 30_000;

  const adapter = new PrismaPg({
    connectionString: getDatabaseUrl(),
    max: poolMax,
    connectionTimeoutMillis,
    idleTimeoutMillis,
    statement_timeout: statementTimeoutMs,
  });

  /*
   * Log DB errors/warnings to stdout (#32). They were configured as emit:'event'
   * but NO service ever registered a $on listener, so every Prisma error/warn was
   * silently discarded. stdout surfaces them in Cloud Logging. The query firehose
   * (emit:'event' level:'query') is dropped — it was likewise unconsumed and would
   * be far too noisy to send to stdout.
   */
  return new (PrismaClient)({
    adapter,
    log: [
      { emit: 'stdout', level: 'error' },
      { emit: 'stdout', level: 'warn' },
    ],
    /*
     * Interactive-transaction bounds (#27). Prisma's defaults (timeout 5s, maxWait
     * 2s) are too tight for transactions that legitimately wait — notably the
     * advisory-lock transactions in withSerializedMutation, which block on
     * pg_advisory_xact_lock under contention; a 5s default would abort the wait and
     * fail the mutation. Raise both (still bounded by the pg statement_timeout
     * above). Overridable via env, NaN-safe.
     */
    transactionOptions: {
      timeout: Number(process.env.DATABASE_TX_TIMEOUT_MS) || 30_000,
      maxWait: Number(process.env.DATABASE_TX_MAX_WAIT_MS) || 10_000,
    },
  });
}
