import { describe, expect, it, vi } from 'vitest';
import type {
  CreateScheduledTaskInput,
  ScheduledTaskRepository,
  ScheduledTaskRow,
  ScheduledTaskRunRow,
  ScheduledTaskRunStatus,
  UpdateScheduledTaskInput,
} from './scheduled-tasks-repository.js';
import {
  clampTimeoutSeconds,
  planMaxTasks,
  planMinIntervalMinutes,
  resolveMachineSize,
  ScheduledTaskService,
  truncateLogs,
  validateSchedule,
  type ExecResult,
  type RunMeter,
} from './scheduled-tasks.js';
import type { ApiStore } from './store.js';

/**
 * In-memory repository with the SAME claim semantics as Postgres: `claimTick`
 * only succeeds when `nextRunAt` still equals what the caller read. That is the
 * property the whole "exactly one run per tick across N replicas" guarantee
 * rests on, so the fake must reproduce it exactly.
 */
class MemoryRepository implements ScheduledTaskRepository {
  tasks: ScheduledTaskRow[] = [];
  runs: ScheduledTaskRunRow[] = [];

  private sequence = 0;

  seedTask(overrides: Partial<ScheduledTaskRow> = {}): ScheduledTaskRow {
    const task: ScheduledTaskRow = {
      id: `task-${++this.sequence}`,
      organizationId: 'org-1',
      projectId: 'project-1',
      kind: 'DEPLOYMENT',
      name: 'Nightly report',
      command: 'echo hello',
      workflowId: null,
      cron: '*/5 * * * *',
      timezone: 'UTC',
      machineSize: 'shared-0.5',
      enabled: true,
      timeoutSeconds: 900,
      concurrency: 'FORBID',
      maxRetries: 0,
      notifyOnFailure: true,
      lastRunAt: null,
      lastStatus: null,
      nextRunAt: new Date('2026-07-14T10:00:00.000Z'),
      createdByUserId: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      ...overrides,
    };

    this.tasks.push(task);

    return task;
  }

  async listDueTasks(now: Date, limit: number) {
    /*
     * Postgres hands back a SNAPSHOT of the rows, not live references. The
     * whole claim race depends on that (the loser compares its snapshot's
     * nextRunAt against a row the winner already advanced), so the fake copies.
     */
    return this.tasks
      .filter((task) => task.enabled && task.nextRunAt && task.nextRunAt.getTime() <= now.getTime())
      .sort((left, right) => (left.nextRunAt!.getTime() < right.nextRunAt!.getTime() ? -1 : 1))
      .slice(0, limit)
      .map((task) => ({ ...task }));
  }

  async claimTick(taskId: string, expected: Date, next: Date | null) {
    const task = this.tasks.find((candidate) => candidate.id === taskId);

    if (!task || task.nextRunAt?.getTime() !== expected.getTime()) {
      return false;
    }

    task.nextRunAt = next;

    return true;
  }

  async getTask(taskId: string) {
    return this.tasks.find((task) => task.id === taskId);
  }

  async getProjectTask(projectId: string, taskId: string) {
    return this.tasks.find((task) => task.id === taskId && task.projectId === projectId);
  }

  async listProjectTasks(projectId: string) {
    return this.tasks.filter((task) => task.projectId === projectId);
  }

  async countProjectTasks(projectId: string) {
    return this.tasks.filter((task) => task.projectId === projectId).length;
  }

  async createTask(input: CreateScheduledTaskInput) {
    return this.seedTask(input as Partial<ScheduledTaskRow>);
  }

  async updateTask(taskId: string, input: UpdateScheduledTaskInput) {
    const task = this.tasks.find((candidate) => candidate.id === taskId);

    if (!task) {
      return undefined;
    }

    Object.assign(task, input, input.nextRunAt === undefined ? { nextRunAt: task.nextRunAt } : {});

    return task;
  }

  async deleteTask(projectId: string, taskId: string) {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((task) => !(task.id === taskId && task.projectId === projectId));

    return this.tasks.length < before;
  }

  async setTaskNextRun(taskId: string, nextRunAt: Date | null) {
    const task = this.tasks.find((candidate) => candidate.id === taskId);

    if (task) {
      task.nextRunAt = nextRunAt;
    }
  }

  async setTaskOutcome(taskId: string, lastRunAt: Date, lastStatus: ScheduledTaskRunStatus) {
    const task = this.tasks.find((candidate) => candidate.id === taskId);

    if (task) {
      task.lastRunAt = lastRunAt;
      task.lastStatus = lastStatus;
    }
  }

  async countRunningRuns(taskId: string) {
    return this.runs.filter((run) => run.taskId === taskId && run.status === 'RUNNING').length;
  }

  async countRunsForTick(taskId: string, scheduledFor: Date) {
    return this.runs.filter(
      (run) => run.taskId === taskId && run.scheduledFor.getTime() === scheduledFor.getTime(),
    ).length;
  }

  async createRun(input: Parameters<ScheduledTaskRepository['createRun']>[0]) {
    const run: ScheduledTaskRunRow = {
      id: `run-${++this.sequence}`,
      taskId: input.taskId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      status: input.status,
      trigger: input.trigger,
      attempt: 1,
      scheduledFor: input.scheduledFor,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt ?? null,
      durationMs: input.durationMs ?? null,
      exitCode: null,
      logs: input.logs ?? '',
      error: null,
      machineSize: input.machineSize,
      computeUnits: null,
      costCents: null,
      meteredAt: null,
    };

    this.runs.push(run);

    return run;
  }

  async getRun(runId: string) {
    return this.runs.find((run) => run.id === runId);
  }

  async getProjectRun(projectId: string, taskId: string, runId: string) {
    return this.runs.find((run) => run.id === runId && run.taskId === taskId && run.projectId === projectId);
  }

  async listRuns(taskId: string, take: number) {
    return this.runs.filter((run) => run.taskId === taskId).slice(0, take);
  }

  async listRecentProjectRuns(projectId: string, take: number) {
    return this.runs.filter((run) => run.projectId === projectId).slice(0, take);
  }

  async finishRun(runId: string, input: Parameters<ScheduledTaskRepository['finishRun']>[1]) {
    const run = this.runs.find((candidate) => candidate.id === runId);

    if (!run) {
      return;
    }

    // Mirrors the SQL guard: a CANCELED run keeps its status.
    if (run.status !== 'CANCELED') {
      run.status = input.status;
      run.error = input.error ?? null;
      run.exitCode = input.exitCode;
    }

    run.finishedAt = input.finishedAt;
    run.durationMs = input.durationMs;
    run.logs = run.logs === '' ? input.logs : run.status === 'CANCELED' ? run.logs : input.logs;
    run.computeUnits = input.computeUnits;
    run.costCents = input.costCents;
    run.meteredAt = input.meteredAt;
  }

  async cancelRun(runId: string, now: Date) {
    const run = this.runs.find((candidate) => candidate.id === runId);

    if (!run || run.status !== 'RUNNING') {
      return false;
    }

    run.status = 'CANCELED';
    run.finishedAt = now;
    run.error = 'Canceled by a user.';

    return true;
  }

  async listStuckRuns(cutoff: Date, take: number) {
    return this.runs
      .filter((run) => run.status === 'RUNNING' && run.startedAt.getTime() < cutoff.getTime())
      .slice(0, take);
  }

  async failStuckRun(runId: string, now: Date, message: string) {
    const run = this.runs.find((candidate) => candidate.id === runId);

    if (run && run.status === 'RUNNING') {
      run.status = 'FAILED';
      run.finishedAt = now;
      run.error = message;
    }
  }
}

const store = {} as ApiStore;

const settle = () => new Promise((resolve) => setImmediate(resolve));

function buildService(
  repository: MemoryRepository,
  exec: (command: string) => Promise<ExecResult> | ExecResult,
  overrides: { meter?: RunMeter; onRunFailed?: any; resolveWorkflow?: any } = {},
) {
  const meter: RunMeter = overrides.meter ?? (async () => ({ costCents: 0 }));

  return new ScheduledTaskService({
    repository,
    store,
    exec: async ({ command }) => exec(command),
    resolveWorkflow: overrides.resolveWorkflow ?? (async () => undefined),
    meter,
    onRunFailed: overrides.onRunFailed,
  });
}

describe('validateSchedule', () => {
  it('rejects an invalid cron', () => {
    const result = validateSchedule({ cron: 'nope', timezone: 'UTC' });

    expect(result).toMatchObject({ valid: false, code: 'SCHEDULE_INVALID_CRON' });
  });

  it('rejects a schedule that is too frequent for the plan', () => {
    const result = validateSchedule({ cron: '* * * * *', timezone: 'UTC', planKey: 'free' });

    expect(result).toMatchObject({ valid: false, code: 'SCHEDULE_TOO_FREQUENT' });
  });

  it('accepts the same cron on a plan that allows it', () => {
    const result = validateSchedule({ cron: '* * * * *', timezone: 'UTC', planKey: 'pro' });

    expect(result.valid).toBe(true);
    expect(result.nextRunAt).toBeInstanceOf(Date);
  });

  it('accepts an hourly cron on free', () => {
    expect(validateSchedule({ cron: '0 * * * *', timezone: 'UTC', planKey: 'free' }).valid).toBe(true);
  });
});

describe('plan limits', () => {
  it('floors an unknown plan at the free tier', () => {
    expect(planMinIntervalMinutes(undefined)).toBe(60);
    expect(planMinIntervalMinutes('mystery')).toBe(60);
    expect(planMaxTasks('mystery')).toBe(2);
  });
});

describe('resolveMachineSize', () => {
  it('maps a known size to cpu/ram', () => {
    expect(resolveMachineSize('dedicated-2')).toEqual({ key: 'dedicated-2', cpuMillicores: 2000, ramMb: 8192 });
  });

  it('degrades an unknown size to the smallest tier rather than billing zero', () => {
    expect(resolveMachineSize('gpu-9000')).toEqual({ key: 'shared-0.5', cpuMillicores: 500, ramMb: 2048 });
    expect(resolveMachineSize(null).key).toBe('shared-0.5');
  });
});

describe('clampTimeoutSeconds / truncateLogs', () => {
  it('clamps the timeout into a sane band', () => {
    expect(clampTimeoutSeconds(1)).toBe(10);
    expect(clampTimeoutSeconds(99_999)).toBe(3600);
    expect(clampTimeoutSeconds('nope')).toBe(900);
    expect(clampTimeoutSeconds(120)).toBe(120);
  });

  it('keeps short logs verbatim and truncates runaway output', () => {
    expect(truncateLogs('hello')).toBe('hello');
    expect(truncateLogs('x'.repeat(300_000))).toContain('truncated');
  });
});

describe('ScheduledTaskService.tick', () => {
  it('really runs the command and records a SUCCESS run with the real output', async () => {
    const repository = new MemoryRepository();
    const task = repository.seedTask({ command: 'echo hello' });
    const service = buildService(repository, () => ({ exitCode: 0, output: 'hello\n' }));

    await service.tick();
    await settle();

    const [run] = repository.runs;

    expect(run.status).toBe('SUCCESS');
    expect(run.exitCode).toBe(0);
    expect(run.logs).toContain('$ echo hello');
    expect(run.logs).toContain('hello');
    expect(repository.tasks[0].lastStatus).toBe('SUCCESS');
    expect(task.nextRunAt!.getTime()).toBeGreaterThan(new Date('2026-07-14T10:00:00.000Z').getTime());
  });

  it('advances nextRunAt so the same tick is never claimed twice', async () => {
    const repository = new MemoryRepository();
    repository.seedTask();

    const service = buildService(repository, () => ({ exitCode: 0, output: '' }));

    const first = await service.tick();
    const second = await service.tick();

    expect(first.claimed).toBe(1);
    expect(second.claimed).toBe(0);
  });

  it('gives the tick to exactly ONE of two racing replicas', async () => {
    const repository = new MemoryRepository();
    repository.seedTask();

    const replicaA = buildService(repository, () => ({ exitCode: 0, output: 'a' }));
    const replicaB = buildService(repository, () => ({ exitCode: 0, output: 'b' }));

    const [resultA, resultB] = await Promise.all([replicaA.tick(), replicaB.tick()]);
    await settle();

    expect(resultA.claimed + resultB.claimed).toBe(1);
    expect(repository.runs).toHaveLength(1);
  });

  it('records a FAILED run with the exit code and stops on the failing step', async () => {
    const repository = new MemoryRepository();
    repository.seedTask({ command: 'exit 3' });

    const onRunFailed = vi.fn();
    const service = buildService(repository, () => ({ exitCode: 3, output: 'boom\n' }), { onRunFailed });

    await service.tick();
    await settle();

    const [run] = repository.runs;

    expect(run.status).toBe('FAILED');
    expect(run.exitCode).toBe(3);
    expect(run.error).toContain('exited with code 3');
    expect(onRunFailed).toHaveBeenCalledOnce();
  });

  it('does NOT retry a failed run by default (Replit parity)', async () => {
    const repository = new MemoryRepository();
    const task = repository.seedTask({ command: 'exit 1', cron: '0 3 * * *' });
    const service = buildService(repository, () => ({ exitCode: 1, output: '' }));

    await service.tick();
    await settle();

    // nextRunAt must still be the cron's next fire, not "one minute from now".
    expect(task.nextRunAt!.toISOString().endsWith('T03:00:00.000Z')).toBe(true);
    expect(repository.runs).toHaveLength(1);
  });

  it('re-arms a failed run soon when the task opts into retries', async () => {
    const repository = new MemoryRepository();
    const task = repository.seedTask({ command: 'exit 1', cron: '0 3 * * *', maxRetries: 2 });
    const service = buildService(repository, () => ({ exitCode: 1, output: '' }));

    await service.tick();
    await settle();

    expect(task.nextRunAt!.toISOString().endsWith('T03:00:00.000Z')).toBe(false);
  });

  it('skips the tick (FORBID) when the previous run is still going, and says so', async () => {
    const repository = new MemoryRepository();
    const task = repository.seedTask({ cron: '* * * * *' });

    let release: (value: ExecResult) => void = () => {};
    const pending = new Promise<ExecResult>((resolve) => {
      release = resolve;
    });

    const service = buildService(repository, () => pending);

    await service.tick();
    await settle();
    expect(repository.runs[0].status).toBe('RUNNING');

    // Second tick while the first is still in flight.
    task.nextRunAt = new Date('2026-07-14T10:01:00.000Z');

    const second = await service.tick();

    expect(second.skipped).toEqual([task.id]);
    expect(repository.runs[1].status).toBe('SKIPPED');
    expect(repository.runs[1].logs).toContain('still in progress');

    release({ exitCode: 0, output: '' });
    await settle();
  });

  it('allows overlap when the task opts in', async () => {
    const repository = new MemoryRepository();
    const task = repository.seedTask({ concurrency: 'ALLOW' });

    const pending = new Promise<ExecResult>(() => {});
    const service = buildService(repository, () => pending);

    await service.tick();
    await settle();

    task.nextRunAt = new Date('2026-07-14T10:05:00.000Z');

    const second = await service.tick();

    expect(second.skipped).toHaveLength(0);
    expect(second.started).toHaveLength(1);
  });

  it('times out a run that outlives its timeout, and never starts the next step', async () => {
    const repository = new MemoryRepository();

    // A two-step workflow: step one eats the whole budget, step two must not start.
    repository.seedTask({ kind: 'WORKFLOW', workflowId: 1, command: '', timeoutSeconds: 10 });

    let clock = new Date('2026-07-14T10:00:00.000Z').getTime();
    let calls = 0;

    const service = new ScheduledTaskService({
      repository,
      store,
      resolveWorkflow: async () => ({ name: 'slow', commands: ['step-one', 'step-two'] }),
      meter: async () => ({ costCents: 0 }),
      now: () => new Date(clock),
      exec: async () => {
        calls += 1;
        clock += 20_000; // the step overruns the 10s budget

        return { exitCode: 0, output: 'partial\n' };
      },
    });

    await service.tick();
    await settle();

    const [run] = repository.runs;

    expect(calls).toBe(1);
    expect(run.status).toBe('TIMED_OUT');
    expect(run.error).toContain('Timed out after 10s');
    expect(run.logs).toContain('partial');
  });

  it('bills the real duration at the machine size, once, with a per-run idempotency key', async () => {
    const repository = new MemoryRepository();
    repository.seedTask({ machineSize: 'dedicated-1' });

    const meter = vi.fn(async () => ({ costCents: 0.42 }));

    let clock = new Date('2026-07-14T10:00:00.000Z').getTime();

    const service = new ScheduledTaskService({
      repository,
      store,
      resolveWorkflow: async () => undefined,
      meter,
      now: () => new Date(clock),
      exec: async () => {
        clock += 30_000; // the run really took 30 seconds

        return { exitCode: 0, output: 'done' };
      },
    });

    await service.tick();
    await settle();

    expect(meter).toHaveBeenCalledOnce();

    const [call] = meter.mock.calls as unknown as Array<[{ computeUnits: number; paygReference: string }]>;

    /*
     * dedicated-1 = 1 vCPU + 4 GiB for 30s
     *   cpuSeconds = 30, gbSeconds = 120
     *   units = 30*18 + 120*2 = 780
     */
    expect(call[0].computeUnits).toBeCloseTo(780, 6);
    expect(call[0].paygReference).toBe(`usage:scheduled-run:${repository.runs[0].id}`);

    expect(repository.runs[0].computeUnits).toBeCloseTo(780, 6);
    expect(repository.runs[0].costCents).toBe(0.42);
    expect(repository.runs[0].meteredAt).not.toBeNull();
    expect(repository.runs[0].durationMs).toBe(30_000);
  });

  it('still records the run when billing throws', async () => {
    const repository = new MemoryRepository();
    repository.seedTask();

    const service = buildService(repository, () => ({ exitCode: 0, output: 'ok' }), {
      meter: async () => {
        throw new Error('credits service down');
      },
    });

    await service.tick();
    await settle();

    expect(repository.runs[0].status).toBe('SUCCESS');
    expect(repository.runs[0].meteredAt).toBeNull();
  });

  it('fails the run cleanly when the scheduled workflow no longer exists', async () => {
    const repository = new MemoryRepository();
    repository.seedTask({ kind: 'WORKFLOW', workflowId: 4242, command: '' });

    const service = buildService(repository, () => ({ exitCode: 0, output: '' }), {
      resolveWorkflow: async () => undefined,
    });

    await service.tick();
    await settle();

    expect(repository.runs[0].status).toBe('FAILED');
    expect(repository.runs[0].error).toContain('no longer exists');
  });

  it('runs every step of a workflow in order', async () => {
    const repository = new MemoryRepository();
    repository.seedTask({ kind: 'WORKFLOW', workflowId: 1, command: '' });

    const seen: string[] = [];

    const service = buildService(
      repository,
      (command) => {
        seen.push(command);

        return { exitCode: 0, output: `ran ${command}\n` };
      },
      { resolveWorkflow: async () => ({ name: 'build', commands: ['npm ci', 'npm test'] }) },
    );

    await service.tick();
    await settle();

    expect(seen).toEqual(['npm ci', 'npm test']);
    expect(repository.runs[0].status).toBe('SUCCESS');
  });
});

describe('ScheduledTaskService.runNow / cancelRun / reapStuckRuns', () => {
  it('runs a task on demand and tags the run as manual', async () => {
    const repository = new MemoryRepository();
    const task = repository.seedTask();
    const service = buildService(repository, () => ({ exitCode: 0, output: 'manual' }));

    await service.runNow(task.id);
    await settle();

    expect(repository.runs[0].trigger).toBe('manual');
    expect(repository.runs[0].status).toBe('SUCCESS');
  });

  it('refuses a manual run while one is in flight (FORBID)', async () => {
    const repository = new MemoryRepository();
    const task = repository.seedTask();
    const service = buildService(repository, () => new Promise<ExecResult>(() => {}));

    await service.runNow(task.id);
    await settle();

    await expect(service.runNow(task.id)).rejects.toMatchObject({ code: 'SCHEDULED_TASK_ALREADY_RUNNING' });
  });

  it('keeps a canceled run CANCELED even if the exec later returns success', async () => {
    const repository = new MemoryRepository();
    const task = repository.seedTask();

    let release: (value: ExecResult) => void = () => {};
    const pending = new Promise<ExecResult>((resolve) => {
      release = resolve;
    });

    const service = buildService(repository, () => pending);

    await service.runNow(task.id);
    await settle();

    await service.cancelRun(repository.runs[0].id);

    release({ exitCode: 0, output: 'too late' });
    await settle();

    expect(repository.runs[0].status).toBe('CANCELED');
  });

  it('fails a run orphaned by a restarted executor', async () => {
    const repository = new MemoryRepository();
    const task = repository.seedTask();

    await repository.createRun({
      taskId: task.id,
      organizationId: task.organizationId,
      projectId: task.projectId,
      status: 'RUNNING',
      trigger: 'schedule',
      scheduledFor: new Date('2020-01-01T00:00:00.000Z'),

      // Started long ago and never finished: the executor that owned it is gone.
      startedAt: new Date('2020-01-01T00:00:00.000Z'),
      machineSize: 'shared-0.5',
    });

    const service = buildService(repository, () => ({ exitCode: 0, output: '' }));

    const reaped = await service.reapStuckRuns();

    expect(reaped).toBe(1);
    expect(repository.runs[0].status).toBe('FAILED');
    expect(repository.runs[0].error).toContain('interrupted');
  });
});
