/*
 * Scheduled tasks: the actual executor.
 *
 * WHAT WAS BROKEN
 * The Workflows panel let a user attach a cron to a workflow. The cron was
 * validated, a `nextRunAt` was computed and shown in the UI — and then nothing,
 * ever, fired it. The panel reported "scheduled" for a thing that could not run.
 * The Deploy panel's "Scheduled" tier had the same hole: a cron field feeding a
 * runtime that did not exist. This module is that runtime, and it serves both.
 *
 * DESIGN
 * - `nextRunAt` IS the lock. Claiming a tick is a conditional UPDATE
 *   (`WHERE id = ? AND nextRunAt = ?`) that advances the column to the following
 *   fire time. Postgres serialises it, so with N api replicas ticking
 *   concurrently exactly one wins a given tick. No Redis lock, no leader
 *   election, and a replica dying mid-tick costs at most one run (the next fire
 *   time is already persisted).
 * - The command runs in the PROJECT'S OWN sandbox pod, through the same
 *   workspace-agent exec hop the terminal uses — so it inherits the project's
 *   filesystem, env vars and secrets, and stays inside the tenant's gVisor
 *   boundary. There is no separate "scheduler runtime" to secure.
 * - Every run is a row: real exit code, real duration, FULL captured output.
 * - Every run is metered on its real duration x machine size (the whole point of
 *   this tier: you pay for the seconds you ran, not for 24h of idle).
 *
 * FAILURE POLICY (Replit parity)
 * A failed scheduled run is NOT retried by default (`maxRetries = 0`): a cron
 * that failed at 03:00 usually should not silently re-run at 03:01 with the same
 * broken input. The run is recorded FAILED with its logs, the task's `lastStatus`
 * reflects it, and a failure event is emitted for notification. Operators who
 * want retries raise `maxRetries` on the task.
 */
import { RESERVED_VM_TIERS, workspaceComputeUnits, type ReservedVmTier } from '@vibecore/billing';
import { meterDeployment } from './metering-service.js';
import { minIntervalMinutes, nextCronRun, parseCron } from './scheduled-tasks-cron.js';
import type {
  ScheduledTaskRepository,
  ScheduledTaskRow,
  ScheduledTaskRunStatus,
} from './scheduled-tasks-repository.js';
import type { ApiStore } from './store.js';

/** Result of one shell exec inside the project's sandbox. */
export interface ExecResult {
  exitCode: number;
  output: string;
}

/**
 * The one capability this module needs from the api app: run a command for this
 * run, in isolation, and give back the exit code and the output. Injected (rather
 * than imported) because the runtime hop is a closure over the app's clients —
 * and because it has two implementations: a disposable per-run Pod (production)
 * and an exec into the project's workspace pod (no-Kubernetes fallback).
 *
 * `taskId` / `runId` / `machineSize` are passed through because the pod runtime
 * needs them to name, size and label the run's own Pod.
 */
export type SandboxExec = (input: {
  projectId: string;
  organizationId: string;
  taskId: string;
  runId: string;
  machineSize: string;
  command: string;
  timeoutMs: number;
}) => Promise<ExecResult>;

/** Steps of a Workflows-panel workflow, resolved at run time from project state. */
export type WorkflowResolver = (input: {
  projectId: string;
  workflowId: number;
}) => Promise<{ name: string; commands: string[] } | undefined>;

// ---------------------------------------------------------------------------
// Machine sizes
// ---------------------------------------------------------------------------

/*
 * The size CATALOGUE is owned by another workstream. This module only needs to
 * turn a size key into cpu/ram for billing, so it reads the existing billing
 * tiers and degrades to the smallest size for an unknown key rather than
 * refusing to run (or, worse, billing zero).
 */
export const DEFAULT_MACHINE_SIZE: ReservedVmTier = 'shared-0.5';

export function resolveMachineSize(size: string | null | undefined): {
  key: ReservedVmTier;
  cpuMillicores: number;
  ramMb: number;
} {
  const key = (size && size in RESERVED_VM_TIERS ? size : DEFAULT_MACHINE_SIZE) as ReservedVmTier;
  const tier = RESERVED_VM_TIERS[key];

  return { key, cpuMillicores: Math.round(tier.vcpu * 1000), ramMb: Math.round(tier.ramGb * 1024) };
}

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

/**
 * Minimum gap between two fires of the SAME task, per plan. A scheduled run boots
 * a sandbox; `* * * * *` on a free org is 1440 pod starts a day. Paid plans get
 * down to the minute, which is the finest cron can express anyway.
 */
export const PLAN_MIN_INTERVAL_MINUTES: Record<string, number> = {
  free: 60,
  starter: 15,
  core: 5,
  pro: 1,
  team: 1,
  enterprise: 1,
};

/** Max number of scheduled tasks a single project may hold, per plan. */
export const PLAN_MAX_TASKS: Record<string, number> = {
  free: 2,
  starter: 5,
  core: 20,
  pro: 50,
  team: 100,
  enterprise: 500,
};

export function planMinIntervalMinutes(planKey: string | undefined): number {
  return PLAN_MIN_INTERVAL_MINUTES[planKey ?? 'free'] ?? PLAN_MIN_INTERVAL_MINUTES.free;
}

export function planMaxTasks(planKey: string | undefined): number {
  return PLAN_MAX_TASKS[planKey ?? 'free'] ?? PLAN_MAX_TASKS.free;
}

export const MIN_TIMEOUT_SECONDS = 10;
export const MAX_TIMEOUT_SECONDS = 3600;
export const DEFAULT_TIMEOUT_SECONDS = 900;

/** Full stdout+stderr is stored, but a runaway `yes` must not fill the row. */
export const MAX_RUN_LOG_BYTES = 256 * 1024;

export function clampTimeoutSeconds(value: unknown): number {
  const seconds = Number(value);

  if (!Number.isFinite(seconds)) {
    return DEFAULT_TIMEOUT_SECONDS;
  }

  return Math.min(MAX_TIMEOUT_SECONDS, Math.max(MIN_TIMEOUT_SECONDS, Math.round(seconds)));
}

export function truncateLogs(output: string): string {
  if (output.length <= MAX_RUN_LOG_BYTES) {
    return output;
  }

  return `${output.slice(0, MAX_RUN_LOG_BYTES)}\n… [truncated: ${output.length - MAX_RUN_LOG_BYTES} more bytes]`;
}

/** Validate a cron against the org's plan. Pure — testable without a database. */
export function validateSchedule(input: {
  cron: string;
  timezone: string;
  planKey?: string;
  now?: Date;
}): { valid: boolean; normalized?: string; nextRunAt?: Date; error?: string; code?: string } {
  const parsed = parseCron(input.cron);

  if (!parsed.valid) {
    return { valid: false, error: parsed.error, code: 'SCHEDULE_INVALID_CRON' };
  }

  const now = input.now ?? new Date();
  const next = nextCronRun(parsed.normalized!, now, input.timezone);

  if (!next) {
    return { valid: false, error: 'This schedule never fires (no matching date).', code: 'SCHEDULE_NEVER_FIRES' };
  }

  const floor = planMinIntervalMinutes(input.planKey);
  const observed = minIntervalMinutes(parsed.normalized!, input.timezone, now);

  if (observed < floor) {
    return {
      valid: false,
      code: 'SCHEDULE_TOO_FREQUENT',
      error: `This schedule fires every ${observed} minute(s); your plan allows at most one run every ${floor} minutes.`,
    };
  }

  return { valid: true, normalized: parsed.normalized, nextRunAt: next };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Bills one finished run. Defaults to the real credit meter; tests inject a spy. */
export type RunMeter = (input: {
  organizationId: string;
  computeUnits: number;
  nowMs: number;
  paygReference: string;
}) => Promise<{ costCents: number }>;

export interface ScheduledTaskServiceDeps {
  repository: ScheduledTaskRepository;
  store: ApiStore;
  exec: SandboxExec;
  resolveWorkflow: WorkflowResolver;

  /** Override the meter (tests). Production uses meterDeployment(kind: 'scheduled'). */
  meter?: RunMeter;

  /** Emitted on a failed run so the platform's notification path can pick it up. */
  onRunFailed?: (input: {
    organizationId: string;
    projectId: string;
    taskId: string;
    taskName: string;
    runId: string;
    exitCode: number | null;
    status: ScheduledTaskRunStatus;
  }) => Promise<void> | void;
  now?: () => Date;
}

export interface TickResult {
  claimed: number;
  started: string[];
  skipped: string[];
}

export class ScheduledTaskService {
  private readonly deps: ScheduledTaskServiceDeps;

  /** Runs owned by THIS replica, so an in-flight run can be aborted locally. */
  private readonly inFlight = new Map<string, AbortController>();

  private readonly meter: RunMeter;

  constructor(deps: ScheduledTaskServiceDeps) {
    this.deps = deps;

    this.meter =
      deps.meter ??
      ((input) =>
        meterDeployment(deps.store, {
          organizationId: input.organizationId,
          kind: 'scheduled',
          computeUnits: input.computeUnits,
          includeBase: false,
          nowMs: input.nowMs,
          paygReference: input.paygReference,
        }));
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /**
   * One scheduler tick: claim every due task and execute it.
   *
   * A task whose `nextRunAt` moved between the SELECT and the UPDATE (because
   * another replica claimed it) updates 0 rows and is dropped here.
   */
  async tick(): Promise<TickResult> {
    const { repository } = this.deps;
    const now = this.now();
    const due = await repository.listDueTasks(now, 50);
    const result: TickResult = { claimed: 0, started: [], skipped: [] };

    for (const task of due) {
      const scheduledFor = task.nextRunAt;

      if (!scheduledFor) {
        continue;
      }

      const following = nextCronRun(task.cron, now, task.timezone);
      const won = await repository.claimTick(task.id, scheduledFor, following);

      if (!won) {
        continue;
      }

      result.claimed += 1;

      /*
       * No-overlap (concurrency=FORBID): a previous run still RUNNING means the
       * task is slower than its own cadence. Record a SKIPPED run so the history
       * explains the gap instead of silently swallowing the tick.
       */
      if (task.concurrency !== 'ALLOW' && (await repository.countRunningRuns(task.id)) > 0) {
        await repository.createRun({
          taskId: task.id,
          organizationId: task.organizationId,
          projectId: task.projectId,
          status: 'SKIPPED',
          trigger: 'schedule',
          scheduledFor,
          startedAt: now,
          finishedAt: now,
          durationMs: 0,
          machineSize: task.machineSize,
          logs: 'Skipped: the previous run of this task was still in progress (overlap policy: FORBID).',
        });
        await repository.setTaskOutcome(task.id, now, 'SKIPPED');
        result.skipped.push(task.id);
        continue;
      }

      const run = await this.startRun(task, { scheduledFor, trigger: 'schedule' });
      result.started.push(run.id);
    }

    return result;
  }

  /** "Run now" from the panel — same executor, same history, trigger=manual. */
  async runNow(taskId: string): Promise<{ id: string }> {
    const { repository } = this.deps;
    const task = await repository.getTask(taskId);

    if (!task) {
      throw Object.assign(new Error('Scheduled task not found'), {
        statusCode: 404,
        code: 'SCHEDULED_TASK_NOT_FOUND',
      });
    }

    if (task.concurrency !== 'ALLOW' && (await repository.countRunningRuns(task.id)) > 0) {
      throw Object.assign(new Error('This task is already running'), {
        statusCode: 409,
        code: 'SCHEDULED_TASK_ALREADY_RUNNING',
      });
    }

    return this.startRun(task, { scheduledFor: this.now(), trigger: 'manual' });
  }

  /** Cancel a run: abort it locally if we own it, and flip the row either way. */
  async cancelRun(runId: string): Promise<boolean> {
    this.inFlight.get(runId)?.abort();

    return this.deps.repository.cancelRun(runId, this.now());
  }

  /**
   * Create the RUNNING row, then execute in the background. The row exists BEFORE
   * the exec starts, so a pod crash mid-run leaves a visible RUNNING row (reaped
   * by `reapStuckRuns`) rather than a run that silently never happened.
   */
  private async startRun(
    task: ScheduledTaskRow,
    options: { scheduledFor: Date; trigger: 'schedule' | 'manual' },
  ): Promise<{ id: string }> {
    const startedAt = this.now();

    const run = await this.deps.repository.createRun({
      taskId: task.id,
      organizationId: task.organizationId,
      projectId: task.projectId,
      status: 'RUNNING',
      trigger: options.trigger,
      scheduledFor: options.scheduledFor,
      startedAt,
      machineSize: task.machineSize,
    });

    void this.execute(task, run.id, options.scheduledFor, startedAt).catch(() => undefined);

    return { id: run.id };
  }

  /** Resolve the shell commands this task must run, in order. */
  private async resolveCommands(task: ScheduledTaskRow): Promise<{ commands: string[]; label: string }> {
    if (task.kind === 'WORKFLOW') {
      const workflow = await this.deps.resolveWorkflow({
        projectId: task.projectId,
        workflowId: Number(task.workflowId),
      });

      if (!workflow) {
        throw Object.assign(new Error('The scheduled workflow no longer exists in this project.'), {
          code: 'SCHEDULED_WORKFLOW_MISSING',
        });
      }

      if (workflow.commands.length === 0) {
        throw Object.assign(new Error('The scheduled workflow has no steps to run.'), {
          code: 'SCHEDULED_WORKFLOW_EMPTY',
        });
      }

      return { commands: workflow.commands, label: workflow.name };
    }

    const command = task.command?.trim() ?? '';

    if (!command) {
      throw Object.assign(new Error('This scheduled task has no command.'), { code: 'SCHEDULED_TASK_NO_COMMAND' });
    }

    return { commands: [command], label: task.name };
  }

  private async execute(
    task: ScheduledTaskRow,
    runId: string,
    scheduledFor: Date,
    startedAt: Date,
  ): Promise<void> {
    const { repository } = this.deps;
    const controller = new AbortController();

    this.inFlight.set(runId, controller);

    const timeoutSeconds = clampTimeoutSeconds(task.timeoutSeconds);
    const deadline = startedAt.getTime() + timeoutSeconds * 1000;
    const size = resolveMachineSize(task.machineSize);

    let status: ScheduledTaskRunStatus = 'SUCCESS';
    let exitCode: number | null = 0;
    let error: string | undefined;

    const chunks: string[] = [];

    try {
      const { commands, label } = await this.resolveCommands(task);

      chunks.push(`$ # scheduled task "${label}" (${task.kind.toLowerCase()}) — ${commands.length} step(s)\n`);

      for (const command of commands) {
        if (controller.signal.aborted) {
          status = 'CANCELED';
          exitCode = null;
          break;
        }

        // Always the injected clock — mixing in Date.now() made the deadline
        // uncomparable with startedAt and could time a run out before step one.
        const remainingMs = deadline - this.now().getTime();

        if (remainingMs <= 0) {
          status = 'TIMED_OUT';
          exitCode = null;
          error = `Timed out after ${timeoutSeconds}s.`;
          chunks.push(`\n$ # ${error}\n`);
          break;
        }

        chunks.push(`\n$ ${command}\n`);

        const result = await this.deps.exec({
          projectId: task.projectId,
          organizationId: task.organizationId,
          taskId: task.id,
          runId,
          machineSize: size.key,
          command,
          timeoutMs: remainingMs,
        });

        chunks.push(result.output ?? '');

        if (result.exitCode !== 0) {
          status = 'FAILED';
          exitCode = result.exitCode;
          error = `Step exited with code ${result.exitCode}.`;
          chunks.push(`\n$ # step failed with exit code ${result.exitCode}; stopping.\n`);
          break;
        }

        exitCode = 0;
      }
    } catch (thrown) {
      status = 'FAILED';
      exitCode = null;
      error = thrown instanceof Error ? thrown.message : String(thrown);
      chunks.push(`\n$ # execution error: ${error}\n`);
    } finally {
      this.inFlight.delete(runId);
    }

    const finishedAt = this.now();
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

    /*
     * Bill the REAL duration at the task's machine size — this tier exists
     * precisely so an org pays for the seconds it ran, not for a 24/7 VM. A
     * failed or timed-out run still consumed the sandbox, so it is still metered;
     * a SKIPPED run consumed nothing and never reaches here.
     */
    const computeUnits = workspaceComputeUnits(size.cpuMillicores, size.ramMb, durationMs / 1000);

    let costCents: number | null = null;

    try {
      const metered = await this.meter({
        organizationId: task.organizationId,
        computeUnits,
        nowMs: finishedAt.getTime(),

        // Idempotency: one charge per run, even if this path is ever replayed.
        paygReference: `usage:scheduled-run:${runId}`,
      });

      costCents = metered.costCents;
    } catch {
      // Never let a billing hiccup lose the run record — the run really happened.
    }

    await repository.finishRun(runId, {
      status,
      finishedAt,
      durationMs,
      exitCode,
      error,
      logs: truncateLogs(chunks.join('')),
      computeUnits,
      costCents,
      meteredAt: costCents === null ? null : finishedAt,
    });

    // Re-read: a cancel may have landed mid-exec, and the row (not us) is the truth.
    const finalStatus = (await repository.getRun(runId).catch(() => undefined))?.status ?? status;

    await repository.setTaskOutcome(task.id, finishedAt, finalStatus).catch(() => undefined);

    if (finalStatus === 'FAILED' || finalStatus === 'TIMED_OUT') {
      await Promise.resolve(
        this.deps.onRunFailed?.({
          organizationId: task.organizationId,
          projectId: task.projectId,
          taskId: task.id,
          taskName: task.name,
          runId,
          exitCode,
          status: finalStatus,
        }),
      ).catch(() => undefined);

      /*
       * Retries are OFF by default. When an operator opts in, a retry is just
       * another tick: pull nextRunAt forward by a minute so the normal claim path
       * picks it up, rather than recursing here (which would bypass the claim and
       * the overlap guard).
       */
      if (task.maxRetries > 0) {
        const attempts = await repository.countRunsForTick(task.id, scheduledFor).catch(() => Number.MAX_SAFE_INTEGER);

        if (attempts <= task.maxRetries) {
          await repository.setTaskNextRun(task.id, new Date(finishedAt.getTime() + 60_000)).catch(() => undefined);
        }
      }
    }
  }

  /**
   * Safety net for a run orphaned by an api pod that died mid-exec: its row is
   * stuck RUNNING forever, which would also block the FORBID overlap guard for
   * good. Fail anything RUNNING well past the maximum allowed timeout.
   */
  async reapStuckRuns(): Promise<number> {
    const { repository } = this.deps;
    const now = this.now();
    const cutoff = new Date(now.getTime() - (MAX_TIMEOUT_SECONDS + 300) * 1000);
    const stuck = await repository.listStuckRuns(cutoff, 100);

    let reaped = 0;

    for (const run of stuck) {
      if (this.inFlight.has(run.id)) {
        continue;
      }

      await repository
        .failStuckRun(
          run.id,
          now,
          'Run interrupted — the executor was restarted while this run was in progress.',
        )
        .catch(() => undefined);
      reaped += 1;
    }

    return reaped;
  }
}

/**
 * Periodic driver. Ticks every `intervalMs` (default 30s — twice per cron minute,
 * so a due task never waits a full minute) and reaps stuck runs hourly. Ticks
 * never overlap: a slow tick simply delays the next one.
 */
export function startScheduledTaskScheduler(
  service: ScheduledTaskService,
  options: { intervalMs?: number; logger?: { error: (...args: any[]) => void } } = {},
): { stop: () => void } {
  const configured = Number(process.env.SCHEDULED_TASKS_TICK_MS);
  const intervalMs = options.intervalMs ?? (Number.isFinite(configured) && configured > 0 ? configured : 30_000);

  let running = false;
  let stopped = false;
  let ticks = 0;

  const reapEvery = Math.max(1, Math.round(3_600_000 / intervalMs));

  const timer = setInterval(() => {
    if (running || stopped) {
      return;
    }

    running = true;
    ticks += 1;

    const shouldReap = ticks % reapEvery === 0;

    void (async () => {
      try {
        await service.tick();

        if (shouldReap) {
          await service.reapStuckRuns();
        }
      } catch (error) {
        options.logger?.error({ err: error }, 'scheduled-tasks tick failed');
      } finally {
        running = false;
      }
    })();
  }, intervalMs);

  // Never hold the process open on shutdown.
  timer.unref?.();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
