/*
 * Persistence for scheduled tasks.
 *
 * Deliberately raw SQL rather than Prisma delegates: `packages/database`'s
 * generated client is a COMMITTED artifact, and the api image is built with
 * `pnpm --filter @vibecore/api build` (which does not re-run `prisma generate`
 * for its dependencies). Raw parameterised SQL against the tables created by
 * migration 0069 therefore works the moment the migration lands, without a
 * 30 MB regenerated-client diff — and it keeps this feature from colliding with
 * the schema work happening in parallel.
 *
 * Everything is parameterised ($1, $2, …). No string interpolation of user input.
 */
import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '@vibecore/database';

export type ScheduledTaskKind = 'WORKFLOW' | 'DEPLOYMENT';
export type ScheduledTaskRunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'TIMED_OUT' | 'SKIPPED' | 'CANCELED';

export interface ScheduledTaskRow {
  id: string;
  organizationId: string;
  projectId: string;
  kind: ScheduledTaskKind;
  name: string;
  command: string;
  workflowId: number | null;
  cron: string;
  timezone: string;
  machineSize: string;
  enabled: boolean;
  timeoutSeconds: number;
  concurrency: string;
  maxRetries: number;
  notifyOnFailure: boolean;
  lastRunAt: Date | null;
  lastStatus: string | null;
  nextRunAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledTaskRunRow {
  id: string;
  taskId: string;
  organizationId: string;
  projectId: string;
  status: ScheduledTaskRunStatus;
  trigger: string;
  attempt: number;
  scheduledFor: Date;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  exitCode: number | null;
  logs: string;
  error: string | null;
  machineSize: string | null;
  computeUnits: number | null;
  costCents: number | null;
  meteredAt: Date | null;
}

const TASK_COLUMNS = `
  id, "organizationId", "projectId", kind::text AS kind, name, command, "workflowId", cron, timezone,
  "machineSize", enabled, "timeoutSeconds", concurrency, "maxRetries", "notifyOnFailure",
  "lastRunAt", "lastStatus", "nextRunAt", "createdByUserId", "createdAt", "updatedAt"
`;

const RUN_COLUMNS = `
  id, "taskId", "organizationId", "projectId", status::text AS status, trigger, attempt, "scheduledFor",
  "startedAt", "finishedAt", "durationMs", "exitCode", logs, error, "machineSize",
  "computeUnits", "costCents", "meteredAt"
`;

export interface CreateScheduledTaskInput {
  organizationId: string;
  projectId: string;
  kind: ScheduledTaskKind;
  name: string;
  command: string;
  workflowId: number | null;
  cron: string;
  timezone: string;
  machineSize: string;
  enabled: boolean;
  timeoutSeconds: number;
  concurrency: string;
  maxRetries: number;
  notifyOnFailure: boolean;
  nextRunAt: Date | null;
  createdByUserId?: string;
}

export interface UpdateScheduledTaskInput {
  name: string;
  command: string;
  cron: string;
  timezone: string;
  machineSize: string;
  enabled: boolean;
  timeoutSeconds: number;
  concurrency: string;
  maxRetries: number;
  notifyOnFailure: boolean;

  /** Only re-armed when the schedule itself changed; `undefined` leaves it alone. */
  nextRunAt?: Date | null;
}

/** The one storage seam the executor and the routes talk to. */
export interface ScheduledTaskRepository {
  listDueTasks(now: Date, limit: number): Promise<ScheduledTaskRow[]>;

  /**
   * Advance `nextRunAt` ONLY if it still equals `expected`. Returns true for the
   * single caller that won the race — this is how N api replicas ticking the
   * same second produce exactly one run.
   */
  claimTick(taskId: string, expected: Date, next: Date | null): Promise<boolean>;

  getTask(taskId: string): Promise<ScheduledTaskRow | undefined>;
  getProjectTask(projectId: string, taskId: string): Promise<ScheduledTaskRow | undefined>;
  listProjectTasks(projectId: string): Promise<ScheduledTaskRow[]>;
  countProjectTasks(projectId: string): Promise<number>;
  createTask(input: CreateScheduledTaskInput): Promise<ScheduledTaskRow>;
  updateTask(taskId: string, input: UpdateScheduledTaskInput): Promise<ScheduledTaskRow | undefined>;
  deleteTask(projectId: string, taskId: string): Promise<boolean>;
  setTaskNextRun(taskId: string, nextRunAt: Date | null): Promise<void>;
  setTaskOutcome(taskId: string, lastRunAt: Date, lastStatus: ScheduledTaskRunStatus): Promise<void>;

  countRunningRuns(taskId: string): Promise<number>;
  countRunsForTick(taskId: string, scheduledFor: Date): Promise<number>;
  createRun(input: {
    taskId: string;
    organizationId: string;
    projectId: string;
    status: ScheduledTaskRunStatus;
    trigger: string;
    scheduledFor: Date;
    startedAt: Date;
    finishedAt?: Date;
    durationMs?: number;
    machineSize: string;
    logs?: string;
  }): Promise<ScheduledTaskRunRow>;
  getRun(runId: string): Promise<ScheduledTaskRunRow | undefined>;
  getProjectRun(projectId: string, taskId: string, runId: string): Promise<ScheduledTaskRunRow | undefined>;
  listRuns(taskId: string, take: number): Promise<ScheduledTaskRunRow[]>;
  listRecentProjectRuns(projectId: string, take: number): Promise<ScheduledTaskRunRow[]>;
  finishRun(
    runId: string,
    input: {
      status: ScheduledTaskRunStatus;
      finishedAt: Date;
      durationMs: number;
      exitCode: number | null;
      error?: string;
      logs: string;
      computeUnits: number | null;
      costCents: number | null;
      meteredAt: Date | null;
    },
  ): Promise<void>;
  /** Flip a RUNNING run to CANCELED. No-op if it already finished. */
  cancelRun(runId: string, now: Date): Promise<boolean>;
  listStuckRuns(cutoff: Date, take: number): Promise<ScheduledTaskRunRow[]>;
  failStuckRun(runId: string, now: Date, message: string): Promise<void>;
}

function toNumber(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
}

export class PostgresScheduledTaskRepository implements ScheduledTaskRepository {
  private readonly prisma: DatabaseClient;

  constructor(prisma: DatabaseClient) {
    this.prisma = prisma;
  }

  private query<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.prisma.$queryRawUnsafe<T[]>(sql, ...params);
  }

  private execute(sql: string, ...params: unknown[]): Promise<number> {
    return this.prisma.$executeRawUnsafe(sql, ...params);
  }

  async listDueTasks(now: Date, limit: number): Promise<ScheduledTaskRow[]> {
    return this.query<ScheduledTaskRow>(
      `SELECT ${TASK_COLUMNS}
       FROM "ScheduledTask"
       WHERE id IN (
         SELECT task.id
         FROM "ScheduledTask" task
         JOIN "Project" project
           ON project.id = task."projectId"
          AND project."organizationId" = task."organizationId"
         WHERE task.enabled = true
           AND task."deletedAt" IS NULL
           AND task."nextRunAt" IS NOT NULL
           AND task."nextRunAt" <= $1
           AND project."deletedAt" IS NULL
           AND project."permanentDeletionStartedAt" IS NULL
         ORDER BY task."nextRunAt" ASC
         LIMIT $2
       )
       ORDER BY "nextRunAt" ASC`,
      now,
      limit,
    );
  }

  async claimTick(taskId: string, expected: Date, next: Date | null): Promise<boolean> {
    const updated = await this.execute(
      `UPDATE "ScheduledTask" task SET "nextRunAt" = $1, "updatedAt" = NOW()
       WHERE task.id = $2 AND task."nextRunAt" = $3 AND task."deletedAt" IS NULL
         AND EXISTS (
           SELECT 1 FROM "Project" project
           WHERE project.id = task."projectId"
             AND project."organizationId" = task."organizationId"
             AND project."deletedAt" IS NULL
             AND project."permanentDeletionStartedAt" IS NULL
         )`,
      next,
      taskId,
      expected,
    );

    return updated === 1;
  }

  async getTask(taskId: string): Promise<ScheduledTaskRow | undefined> {
    const [row] = await this.query<ScheduledTaskRow>(
      `SELECT ${TASK_COLUMNS} FROM "ScheduledTask" WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1`,
      taskId,
    );

    return row;
  }

  async getProjectTask(projectId: string, taskId: string): Promise<ScheduledTaskRow | undefined> {
    const [row] = await this.query<ScheduledTaskRow>(
      `SELECT ${TASK_COLUMNS}
       FROM "ScheduledTask"
       WHERE id = $1 AND "projectId" = $2 AND "deletedAt" IS NULL
       LIMIT 1`,
      taskId,
      projectId,
    );

    return row;
  }

  async listProjectTasks(projectId: string): Promise<ScheduledTaskRow[]> {
    return this.query<ScheduledTaskRow>(
      `SELECT ${TASK_COLUMNS}
       FROM "ScheduledTask"
       WHERE "projectId" = $1 AND "deletedAt" IS NULL
       ORDER BY "createdAt" ASC`,
      projectId,
    );
  }

  async countProjectTasks(projectId: string): Promise<number> {
    const [row] = await this.query<{ count: bigint }>(
      `SELECT COUNT(*)::bigint AS count
       FROM "ScheduledTask"
       WHERE "projectId" = $1 AND "deletedAt" IS NULL`,
      projectId,
    );

    return toNumber(row?.count);
  }

  async createTask(input: CreateScheduledTaskInput): Promise<ScheduledTaskRow> {
    const id = `sched_${randomUUID().replace(/-/g, '')}`;

    const [row] = await this.query<ScheduledTaskRow>(
      `INSERT INTO "ScheduledTask" (
         id, "organizationId", "projectId", kind, name, command, "workflowId", cron, timezone,
         "machineSize", enabled, "timeoutSeconds", concurrency, "maxRetries", "notifyOnFailure",
         "nextRunAt", "createdByUserId", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, $4::"ScheduledTaskKind", $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15,
         $16, $17, NOW(), NOW()
       )
       RETURNING ${TASK_COLUMNS}`,
      id,
      input.organizationId,
      input.projectId,
      input.kind,
      input.name,
      input.command,
      input.workflowId,
      input.cron,
      input.timezone,
      input.machineSize,
      input.enabled,
      input.timeoutSeconds,
      input.concurrency,
      input.maxRetries,
      input.notifyOnFailure,
      input.nextRunAt,
      input.createdByUserId ?? null,
    );

    return row;
  }

  async updateTask(taskId: string, input: UpdateScheduledTaskInput): Promise<ScheduledTaskRow | undefined> {
    const rearm = input.nextRunAt !== undefined;

    const [row] = await this.query<ScheduledTaskRow>(
      `UPDATE "ScheduledTask" SET
         name = $2, command = $3, cron = $4, timezone = $5, "machineSize" = $6, enabled = $7,
         "timeoutSeconds" = $8, concurrency = $9, "maxRetries" = $10, "notifyOnFailure" = $11,
         "nextRunAt" = CASE WHEN $12::boolean THEN $13 ELSE "nextRunAt" END,
         "updatedAt" = NOW()
       WHERE id = $1 AND "deletedAt" IS NULL
       RETURNING ${TASK_COLUMNS}`,
      taskId,
      input.name,
      input.command,
      input.cron,
      input.timezone,
      input.machineSize,
      input.enabled,
      input.timeoutSeconds,
      input.concurrency,
      input.maxRetries,
      input.notifyOnFailure,
      rearm,
      rearm ? (input.nextRunAt ?? null) : null,
    );

    return row;
  }

  async deleteTask(projectId: string, taskId: string): Promise<boolean> {
    /* Keep run identities until Project permanent deletion proves their
     * Pod/Secret absent. A hard DELETE here used to cascade the only durable
     * names while a manager request could still be in flight. */
    const deleted = await this.execute(
      `UPDATE "ScheduledTask"
          SET enabled = false, "nextRunAt" = NULL, "deletedAt" = NOW(), "updatedAt" = NOW()
        WHERE id = $1 AND "projectId" = $2 AND "deletedAt" IS NULL`,
      taskId,
      projectId,
    );

    return deleted > 0;
  }

  async setTaskNextRun(taskId: string, nextRunAt: Date | null): Promise<void> {
    await this.execute(
      `UPDATE "ScheduledTask"
          SET "nextRunAt" = $2, "updatedAt" = NOW()
        WHERE id = $1 AND "deletedAt" IS NULL`,
      taskId,
      nextRunAt,
    );
  }

  async setTaskOutcome(taskId: string, lastRunAt: Date, lastStatus: ScheduledTaskRunStatus): Promise<void> {
    await this.execute(
      `UPDATE "ScheduledTask" SET "lastRunAt" = $2, "lastStatus" = $3, "updatedAt" = NOW() WHERE id = $1`,
      taskId,
      lastRunAt,
      lastStatus,
    );
  }

  async countRunningRuns(taskId: string): Promise<number> {
    const [row] = await this.query<{ count: bigint }>(
      `SELECT COUNT(*)::bigint AS count FROM "ScheduledTaskRun" WHERE "taskId" = $1 AND status = 'RUNNING'`,
      taskId,
    );

    return toNumber(row?.count);
  }

  async countRunsForTick(taskId: string, scheduledFor: Date): Promise<number> {
    const [row] = await this.query<{ count: bigint }>(
      `SELECT COUNT(*)::bigint AS count FROM "ScheduledTaskRun" WHERE "taskId" = $1 AND "scheduledFor" = $2`,
      taskId,
      scheduledFor,
    );

    return toNumber(row?.count);
  }

  async createRun(input: {
    taskId: string;
    organizationId: string;
    projectId: string;
    status: ScheduledTaskRunStatus;
    trigger: string;
    scheduledFor: Date;
    startedAt: Date;
    finishedAt?: Date;
    durationMs?: number;
    machineSize: string;
    logs?: string;
  }): Promise<ScheduledTaskRunRow> {
    const id = `srun_${randomUUID().replace(/-/g, '')}`;

    const [row] = await this.query<ScheduledTaskRunRow>(
      `INSERT INTO "ScheduledTaskRun" (
         id, "taskId", "organizationId", "projectId", status, trigger, attempt,
         "scheduledFor", "startedAt", "finishedAt", "durationMs", "machineSize", logs
       )
       SELECT $1, task.id, task."organizationId", task."projectId", $5::"ScheduledTaskRunStatus", $6, 1,
              $7, $8, $9, $10, $11, $12
       FROM "ScheduledTask" task
       JOIN "Project" project
         ON project.id = task."projectId"
        AND project."organizationId" = task."organizationId"
       WHERE task.id = $2
         AND task."organizationId" = $3
         AND task."projectId" = $4
         AND task."deletedAt" IS NULL
         AND project."deletedAt" IS NULL
         AND project."permanentDeletionStartedAt" IS NULL
       RETURNING ${RUN_COLUMNS}`,
      id,
      input.taskId,
      input.organizationId,
      input.projectId,
      input.status,
      input.trigger,
      input.scheduledFor,
      input.startedAt,
      input.finishedAt ?? null,
      input.durationMs ?? null,
      input.machineSize,
      input.logs ?? '',
    );

    if (!row) {
      throw Object.assign(new Error('PROJECT_STORAGE_PERMANENT_DELETION_ACTIVE'), {
        code: 'PROJECT_STORAGE_PERMANENT_DELETION_ACTIVE',
        statusCode: 409,
      });
    }

    return row;
  }

  async getRun(runId: string): Promise<ScheduledTaskRunRow | undefined> {
    const [row] = await this.query<ScheduledTaskRunRow>(
      `SELECT ${RUN_COLUMNS} FROM "ScheduledTaskRun" WHERE id = $1 LIMIT 1`,
      runId,
    );

    return row;
  }

  async getProjectRun(projectId: string, taskId: string, runId: string): Promise<ScheduledTaskRunRow | undefined> {
    const [row] = await this.query<ScheduledTaskRunRow>(
      `SELECT ${RUN_COLUMNS} FROM "ScheduledTaskRun"
       WHERE id = $1 AND "taskId" = $2 AND "projectId" = $3 LIMIT 1`,
      runId,
      taskId,
      projectId,
    );

    return row;
  }

  async listRuns(taskId: string, take: number): Promise<ScheduledTaskRunRow[]> {
    return this.query<ScheduledTaskRunRow>(
      `SELECT ${RUN_COLUMNS} FROM "ScheduledTaskRun" WHERE "taskId" = $1 ORDER BY "startedAt" DESC LIMIT $2`,
      taskId,
      take,
    );
  }

  async listRecentProjectRuns(projectId: string, take: number): Promise<ScheduledTaskRunRow[]> {
    return this.query<ScheduledTaskRunRow>(
      `SELECT ${RUN_COLUMNS} FROM "ScheduledTaskRun" WHERE "projectId" = $1 ORDER BY "startedAt" DESC LIMIT $2`,
      projectId,
      take,
    );
  }

  async finishRun(
    runId: string,
    input: {
      status: ScheduledTaskRunStatus;
      finishedAt: Date;
      durationMs: number;
      exitCode: number | null;
      error?: string;
      logs: string;
      computeUnits: number | null;
      costCents: number | null;
      meteredAt: Date | null;
    },
  ): Promise<void> {
    /*
     * A CANCELED run must stay CANCELED: the cancel may have landed while the
     * exec was still draining. Guarding in SQL (rather than read-then-write)
     * closes the race for good.
     */
    await this.execute(
      `UPDATE "ScheduledTaskRun" SET
         status = $2::"ScheduledTaskRunStatus", "finishedAt" = $3, "durationMs" = $4, "exitCode" = $5,
         error = $6, logs = $7, "computeUnits" = $8, "costCents" = $9, "meteredAt" = $10
       WHERE id = $1 AND status <> 'CANCELED'`,
      runId,
      input.status,
      input.finishedAt,
      input.durationMs,
      input.exitCode,
      input.error ?? null,
      input.logs,
      input.computeUnits,
      input.costCents,
      input.meteredAt,
    );

    // A canceled run still gets its logs and billing outcome recorded.
    await this.execute(
      `UPDATE "ScheduledTaskRun" SET
         "finishedAt" = COALESCE("finishedAt", $2), "durationMs" = COALESCE("durationMs", $3),
         logs = CASE WHEN logs = '' THEN $4 ELSE logs END,
         "computeUnits" = COALESCE("computeUnits", $5), "costCents" = COALESCE("costCents", $6),
         "meteredAt" = COALESCE("meteredAt", $7)
       WHERE id = $1 AND status = 'CANCELED'`,
      runId,
      input.finishedAt,
      input.durationMs,
      input.logs,
      input.computeUnits,
      input.costCents,
      input.meteredAt,
    );
  }

  async cancelRun(runId: string, now: Date): Promise<boolean> {
    const updated = await this.execute(
      `UPDATE "ScheduledTaskRun"
       SET status = 'CANCELED', "finishedAt" = $2, error = 'Canceled by a user.'
       WHERE id = $1 AND status = 'RUNNING'`,
      runId,
      now,
    );

    return updated > 0;
  }

  async listStuckRuns(cutoff: Date, take: number): Promise<ScheduledTaskRunRow[]> {
    return this.query<ScheduledTaskRunRow>(
      `SELECT ${RUN_COLUMNS} FROM "ScheduledTaskRun"
       WHERE status = 'RUNNING' AND "startedAt" < $1
       ORDER BY "startedAt" ASC LIMIT $2`,
      cutoff,
      take,
    );
  }

  async failStuckRun(runId: string, now: Date, message: string): Promise<void> {
    await this.execute(
      `UPDATE "ScheduledTaskRun" SET
         status = 'FAILED', "finishedAt" = $2,
         "durationMs" = GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamp - "startedAt")) * 1000)::int,
         error = $3
       WHERE id = $1 AND status = 'RUNNING'`,
      runId,
      now,
      message,
    );
  }
}
