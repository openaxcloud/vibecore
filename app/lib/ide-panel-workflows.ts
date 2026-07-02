/**
 * Pure, dependency-injected workflow orchestration + schedule logic for the IDE
 * Workflows panel.
 *
 * This module deliberately holds NO HTTP or Remix imports so it can be unit
 * tested in isolation (see ide-panel-workflows.spec.ts). The Remix action wires
 * the real per-project runtime command dispatch into `runWorkflowSteps` via the
 * `execCommand` callback, so every shell step runs in the project's own isolated
 * workspace pod through the SAME authorized dispatch every other terminal/task
 * path uses. Tenant isolation is enforced upstream by the API's
 * `authorizeRuntimeWorkspace` (workspace → project → permission); this module
 * never picks a workspace, it only receives the already-authorized executor.
 */

export interface WorkflowTaskLike {
  id: number;
  orderIndex: number;
  taskType: 'shell' | 'packages' | 'workflow' | string;
  command: string;
  targetWorkflowId: number | null;
}

export interface WorkflowScheduleState {
  enabled: boolean;
  cron: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

export interface WorkflowLike {
  id: number;
  name: string;
  executionMode: 'sequential' | 'parallel' | string;
  enabled: boolean;
  schedule?: WorkflowScheduleState | null;
  tasks: WorkflowTaskLike[];
}

export interface WorkflowStateLike {
  workflows: WorkflowLike[];
  runs: unknown[];
}

/** Per-step execution outcome surfaced back to the panel. */
export interface WorkflowStepResult {
  taskId: number;
  orderIndex: number;
  taskType: string;
  command: string;
  status: 'succeeded' | 'failed' | 'skipped';
  exitCode: number | null;

  /** Last few KB of combined stdout+stderr — never the full stream. */
  outputTail: string;
  startedAt: string;
  finishedAt: string;
}

export interface WorkflowRunResult {
  id: string;
  workflowId: number;
  workflowName: string;
  status: 'succeeded' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt: string;
  steps: WorkflowStepResult[];
  logs: Array<{ level: string; message: string; timestamp: string }>;
}

/** The shape returned by POST /api/runtime/workspaces/:id/commands. */
export interface CommandExecResult {
  exitCode?: number;
  output?: string;
}

export type CommandExecutor = (command: string) => Promise<CommandExecResult>;

export const WORKFLOW_OUTPUT_TAIL_BYTES = 4000;

const NESTED_WORKFLOW_DEPTH_LIMIT = 3;

function tail(output: string | undefined): string {
  if (!output) {
    return '';
  }

  return output.length > WORKFLOW_OUTPUT_TAIL_BYTES ? output.slice(-WORKFLOW_OUTPUT_TAIL_BYTES) : output;
}

function sortTasks(tasks: WorkflowTaskLike[]): WorkflowTaskLike[] {
  return [...(tasks ?? [])].sort((left, right) => left.orderIndex - right.orderIndex);
}

/**
 * Run a workflow's ordered steps.
 *
 * - sequential mode: steps run one after another and STOP on the first failure
 *   (a non-zero exit, an executor throw, or a failed nested workflow). Every step
 *   after the failure is reported as `skipped`.
 * - parallel mode: steps run together; the run fails if any step fails.
 *
 * Returns a run with a per-step breakdown (status / exitCode / outputTail) plus a
 * flattened log for the existing panel log viewer.
 *
 * `execCommand` is the ONLY side-effecting dependency and is injected so this is
 * unit-testable. In production it POSTs to the per-project runtime `/commands`
 * dispatch scoped to the project's own workspace pod.
 */
export async function runWorkflowSteps(options: {
  state: WorkflowStateLike;
  workflow: WorkflowLike;
  execCommand: CommandExecutor;
  startedAt: string;
  now: () => string;
  makeId: () => string;
  depth?: number;
}): Promise<WorkflowRunResult> {
  const { state, workflow, execCommand, startedAt, now, makeId } = options;
  const depth = options.depth ?? 0;

  const run: WorkflowRunResult = {
    id: makeId(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'running' as WorkflowRunResult['status'],
    startedAt,
    finishedAt: '',
    steps: [],
    logs: [],
  };

  const tasks = sortTasks(workflow.tasks ?? []);

  if (workflow.enabled === false) {
    const ts = now();
    run.status = 'skipped';
    run.finishedAt = ts;
    run.logs.push({ level: 'warn', message: 'Workflow is disabled.', timestamp: ts });

    return run;
  }

  /**
   * Execute a single task and return its per-step result. Throws on failure so
   * the sequential loop can stop and the parallel path can surface the failure.
   */
  const executeTask = async (task: WorkflowTaskLike): Promise<WorkflowStepResult> => {
    const stepStartedAt = now();

    const base: WorkflowStepResult = {
      taskId: task.id,
      orderIndex: task.orderIndex,
      taskType: task.taskType,
      command: task.command ?? '',
      status: 'succeeded',
      exitCode: null,
      outputTail: '',
      startedAt: stepStartedAt,
      finishedAt: stepStartedAt,
    };

    if (task.taskType === 'workflow') {
      if (depth >= NESTED_WORKFLOW_DEPTH_LIMIT) {
        throw new Error('Nested workflow depth limit reached');
      }

      const target = state.workflows.find((item) => item.id === task.targetWorkflowId);

      if (!target) {
        throw new Error(`Target workflow ${task.targetWorkflowId ?? ''} was not found`);
      }

      const nestedRun = await runWorkflowSteps({
        state,
        workflow: target,
        execCommand,
        startedAt: stepStartedAt,
        now,
        makeId,
        depth: depth + 1,
      });

      run.logs.push(...nestedRun.logs);
      run.steps.push(...nestedRun.steps);
      base.command = `workflow: ${target.name}`;
      base.finishedAt = now();

      if (nestedRun.status === 'failed') {
        base.status = 'failed';
        throw new Error(`Nested workflow "${target.name}" failed`);
      }

      return base;
    }

    const command = String(task.command || (task.taskType === 'packages' ? 'pnpm install' : '')).trim();

    if (!command) {
      throw new Error('Workflow task has no command');
    }

    base.command = command;
    run.logs.push({ level: 'info', message: `$ ${command}`, timestamp: stepStartedAt });

    const result = await execCommand(command);
    const exitCode = typeof result.exitCode === 'number' ? result.exitCode : 0;
    const outputTail = tail(result.output);

    base.exitCode = exitCode;
    base.outputTail = outputTail;
    base.finishedAt = now();

    if (outputTail) {
      run.logs.push({
        level: exitCode !== 0 ? 'error' : 'info',
        message: outputTail,
        timestamp: base.finishedAt,
      });
    }

    if (exitCode !== 0) {
      base.status = 'failed';

      /*
       * Carry the fully-populated failing step (exit code + output) on the error
       * so the caller records it verbatim instead of a stripped placeholder.
       */
      throw Object.assign(new Error(`Command exited with ${exitCode}`), { step: base });
    }

    return base;
  };

  try {
    if (workflow.executionMode === 'parallel') {
      const settled = await Promise.allSettled(tasks.map((task) => executeTask(task)));

      let firstError: unknown;

      settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') {
          run.steps.push(outcome.value);
          return;
        }

        const task = tasks[index];
        const ts = now();
        const carriedStep = (outcome.reason as { step?: WorkflowStepResult })?.step;
        run.steps.push(
          carriedStep ?? {
            taskId: task.id,
            orderIndex: task.orderIndex,
            taskType: task.taskType,
            command: task.command ?? '',
            status: 'failed',
            exitCode: null,
            outputTail: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
            startedAt: ts,
            finishedAt: ts,
          },
        );
        firstError ??= outcome.reason;
      });

      if (firstError) {
        throw firstError instanceof Error ? firstError : new Error(String(firstError));
      }
    } else {
      for (let index = 0; index < tasks.length; index += 1) {
        const task = tasks[index];

        try {
          run.steps.push(await executeTask(task));
        } catch (error) {
          // Record the failing step then STOP: mark every remaining step skipped.
          const ts = now();
          const carriedStep = (error as { step?: WorkflowStepResult })?.step;

          run.steps.push(
            carriedStep ?? {
              taskId: task.id,
              orderIndex: task.orderIndex,
              taskType: task.taskType,
              command: task.command ?? '',
              status: 'failed',
              exitCode: null,
              outputTail: error instanceof Error ? error.message : String(error),
              startedAt: ts,
              finishedAt: ts,
            },
          );

          for (let rest = index + 1; rest < tasks.length; rest += 1) {
            const skipped = tasks[rest];
            run.steps.push({
              taskId: skipped.id,
              orderIndex: skipped.orderIndex,
              taskType: skipped.taskType,
              command: skipped.command ?? '',
              status: 'skipped',
              exitCode: null,
              outputTail: '',
              startedAt: ts,
              finishedAt: ts,
            });
          }

          throw error;
        }
      }
    }

    run.status = 'succeeded';
  } catch (error) {
    const ts = now();
    run.status = 'failed';
    run.logs.push({
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
      timestamp: ts,
    });
  }

  run.finishedAt = now();

  return run;
}

/*
 * ---------------------------------------------------------------------------
 * Cron schedule validation + next-run computation.
 *
 * Standard 5-field cron: minute hour day-of-month month day-of-week.
 * Supported per-field syntax: `*`, `a`, `a-b`, `a,b,c`, `a-b,c`, and step
 * (`* / n` or `a-b / n`). Day-of-week 0 and 7 both mean Sunday.
 *
 * The ACTUAL scheduler tick (firing the run at nextRunAt) is cluster/worker
 * owned (kube CronJob / BullMQ) and is NOT built here — this only persists,
 * validates, and computes the next occurrence the infra scheduler would honor.
 * ---------------------------------------------------------------------------
 */

const CRON_FIELD_BOUNDS: Array<{ min: number; max: number }> = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 }, // day of week (0 and 7 = Sunday)
];

export interface CronValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

function parseCronField(field: string, min: number, max: number): Set<number> | null {
  const allowed = new Set<number>();

  for (const part of field.split(',')) {
    if (!part) {
      return null;
    }

    let range = part;
    let step = 1;

    const slashIndex = part.indexOf('/');

    if (slashIndex !== -1) {
      range = part.slice(0, slashIndex);

      const stepRaw = part.slice(slashIndex + 1);
      step = Number(stepRaw);

      if (!Number.isInteger(step) || step <= 0 || stepRaw.trim() === '') {
        return null;
      }
    }

    let start = min;
    let end = max;

    if (range === '*') {
      // full range
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      start = Number(a);
      end = Number(b);

      if (!Number.isInteger(start) || !Number.isInteger(b === undefined ? NaN : Number(b))) {
        return null;
      }
    } else {
      const value = Number(range);

      if (!Number.isInteger(value)) {
        return null;
      }

      start = value;
      end = value;
    }

    if (start < min || end > max || start > end) {
      return null;
    }

    for (let value = start; value <= end; value += step) {
      allowed.add(value);
    }
  }

  return allowed.size ? allowed : null;
}

/** Validate a 5-field cron expression. Returns the trimmed/normalized form. */
export function validateCron(expression: string): CronValidationResult {
  const normalized = String(expression ?? '')
    .trim()
    .replace(/\s+/g, ' ');

  if (!normalized) {
    return { valid: false, error: 'Schedule is empty.' };
  }

  const fields = normalized.split(' ');

  if (fields.length !== 5) {
    return { valid: false, error: 'Cron must have 5 fields: minute hour day month weekday.' };
  }

  for (let index = 0; index < fields.length; index += 1) {
    const { min, max } = CRON_FIELD_BOUNDS[index];

    if (!parseCronField(fields[index], min, max)) {
      return { valid: false, error: `Invalid value in cron field ${index + 1}: "${fields[index]}".` };
    }
  }

  return { valid: true, normalized };
}

/**
 * Compute the next UTC time (as ISO string) the cron expression fires strictly
 * after `from`. Returns null if the expression is invalid or no match is found
 * within a bounded search window.
 */
export function computeNextRunFromCron(expression: string, from: Date): string | null {
  const validation = validateCron(expression);

  if (!validation.valid || !validation.normalized) {
    return null;
  }

  const [minuteField, hourField, domField, monthField, dowField] = validation.normalized.split(' ');

  const minutes = parseCronField(minuteField, 0, 59)!;
  const hours = parseCronField(hourField, 0, 23)!;
  const daysOfMonth = parseCronField(domField, 1, 31)!;
  const months = parseCronField(monthField, 1, 12)!;
  const daysOfWeekRaw = parseCronField(dowField, 0, 7)!;

  // Normalize 7 -> 0 (Sunday) so it matches Date.getUTCDay().
  const daysOfWeek = new Set<number>();

  for (const value of daysOfWeekRaw) {
    daysOfWeek.add(value === 7 ? 0 : value);
  }

  const domRestricted = domField !== '*';
  const dowRestricted = dowField !== '*';

  // Start from the next whole minute after `from`.
  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  // Search up to ~4 years of minutes as a hard bound (covers Feb-29 edge cases).
  const MAX_ITERATIONS = 366 * 4 * 24 * 60;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const month = cursor.getUTCMonth() + 1;

    if (!months.has(month)) {
      // Jump to the first day of the next month.
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }

    const dom = cursor.getUTCDate();
    const dow = cursor.getUTCDay();

    /*
     * Standard cron rule: when BOTH day-of-month and day-of-week are restricted
     * the match is a UNION (either matches). When only one is restricted, that
     * one must match. When neither is restricted, any day matches.
     */
    let dayMatches: boolean;

    if (domRestricted && dowRestricted) {
      dayMatches = daysOfMonth.has(dom) || daysOfWeek.has(dow);
    } else if (domRestricted) {
      dayMatches = daysOfMonth.has(dom);
    } else if (dowRestricted) {
      dayMatches = daysOfWeek.has(dow);
    } else {
      dayMatches = true;
    }

    if (!dayMatches) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }

    if (!hours.has(cursor.getUTCHours())) {
      cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
      continue;
    }

    if (!minutes.has(cursor.getUTCMinutes())) {
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1, 0, 0);
      continue;
    }

    return cursor.toISOString();
  }

  return null;
}

export function defaultWorkflowSchedule(): WorkflowScheduleState {
  return { enabled: false, cron: null, nextRunAt: null, lastRunAt: null };
}

/** Normalize a persisted/raw schedule into a validated schedule state. */
export function normalizeWorkflowSchedule(input: unknown, now: Date): WorkflowScheduleState {
  const raw = (input ?? {}) as Partial<WorkflowScheduleState>;
  const cronRaw = typeof raw.cron === 'string' ? raw.cron : null;
  const validation = cronRaw ? validateCron(cronRaw) : { valid: false };
  const cron = validation.valid ? validation.normalized! : null;
  const enabled = Boolean(raw.enabled) && Boolean(cron);

  return {
    enabled,
    cron,
    nextRunAt: enabled && cron ? computeNextRunFromCron(cron, now) : null,
    lastRunAt: typeof raw.lastRunAt === 'string' ? raw.lastRunAt : null,
  };
}

/** True when an enabled schedule's nextRunAt is now or in the past. */
export function isWorkflowScheduleDue(schedule: WorkflowScheduleState | null | undefined, now: Date): boolean {
  if (!schedule?.enabled || !schedule.nextRunAt) {
    return false;
  }

  const nextRunAt = new Date(schedule.nextRunAt);

  return !Number.isNaN(nextRunAt.getTime()) && nextRunAt.getTime() <= now.getTime();
}
