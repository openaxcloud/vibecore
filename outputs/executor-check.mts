/*
 * Throwaway verifier for the executor's control flow (claim / no-overlap /
 * timeout / metering / cancel / retry). vitest can't run in this sandbox, so the
 * same scenarios as scheduled-tasks.spec.ts are driven directly against the
 * in-memory repository. CI runs the real suite.
 */
import assert from 'node:assert/strict';
import type {
  ScheduledTaskRepository,
  ScheduledTaskRow,
  ScheduledTaskRunRow,
  ScheduledTaskRunStatus,
} from '../services/api/src/scheduled-tasks-repository.ts';
import { ScheduledTaskService, resolveMachineSize, validateSchedule } from '../services/api/src/scheduled-tasks.ts';

let passed = 0;

const check = async (label: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${label}`);
  } catch (error) {
    console.log(`  FAIL ${label}\n       ${(error as Error).message}`);
    process.exitCode = 1;
  }
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

class MemoryRepository implements ScheduledTaskRepository {
  tasks: ScheduledTaskRow[] = [];
  runs: ScheduledTaskRunRow[] = [];
  private sequence = 0;

  seedTask(overrides: Partial<ScheduledTaskRow> = {}): ScheduledTaskRow {
    const task = {
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
    } as ScheduledTaskRow;

    this.tasks.push(task);

    return task;
  }

  async listDueTasks(now: Date, limit: number) {
    // Postgres hands back a SNAPSHOT, not live references — the claim race
    // depends on that, so the fake must copy too.
    return this.tasks
      .filter((task) => task.enabled && task.nextRunAt && task.nextRunAt.getTime() <= now.getTime())
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
  async createTask(input: any) {
    return this.seedTask(input);
  }
  async updateTask(taskId: string, input: any) {
    const task = this.tasks.find((candidate) => candidate.id === taskId);

    if (task) {
      Object.assign(task, input);
    }

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
    return this.runs.filter((run) => run.taskId === taskId && run.scheduledFor.getTime() === scheduledFor.getTime())
      .length;
  }
  async createRun(input: any) {
    const run = {
      id: `run-${++this.sequence}`,
      attempt: 1,
      finishedAt: input.finishedAt ?? null,
      durationMs: input.durationMs ?? null,
      exitCode: null,
      logs: input.logs ?? '',
      error: null,
      computeUnits: null,
      costCents: null,
      meteredAt: null,
      ...input,
    } as ScheduledTaskRunRow;

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
  async finishRun(runId: string, input: any) {
    const run = this.runs.find((candidate) => candidate.id === runId);

    if (!run) {
      return;
    }

    if (run.status !== 'CANCELED') {
      run.status = input.status;
      run.error = input.error ?? null;
      run.exitCode = input.exitCode;
      run.logs = input.logs;
    }

    run.finishedAt = input.finishedAt;
    run.durationMs = input.durationMs;
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

    return true;
  }
  async listStuckRuns(cutoff: Date, take: number) {
    return this.runs.filter((run) => run.status === 'RUNNING' && run.startedAt.getTime() < cutoff.getTime()).slice(0, take);
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

const store = {} as any;

const build = (repository: MemoryRepository, exec: any, extra: any = {}) =>
  new ScheduledTaskService({
    repository,
    store,
    exec: async ({ command }: any) => exec(command),
    resolveWorkflow: extra.resolveWorkflow ?? (async () => undefined),
    meter: extra.meter ?? (async () => ({ costCents: 0 })),
    onRunFailed: extra.onRunFailed,
    now: extra.now,
  });

await check('a due task really executes and records SUCCESS with real output', async () => {
  const repository = new MemoryRepository();
  repository.seedTask({ command: 'echo hello' });

  await build(repository, () => ({ exitCode: 0, output: 'hello\n' })).tick();
  await settle();

  assert.equal(repository.runs[0].status, 'SUCCESS');
  assert.equal(repository.runs[0].exitCode, 0);
  assert.ok(repository.runs[0].logs.includes('$ echo hello'));
  assert.ok(repository.runs[0].logs.includes('hello'));
  assert.equal(repository.tasks[0].lastStatus, 'SUCCESS');
});

await check('the same tick is never claimed twice', async () => {
  const repository = new MemoryRepository();
  repository.seedTask();

  const service = build(repository, () => ({ exitCode: 0, output: '' }));

  assert.equal((await service.tick()).claimed, 1);
  assert.equal((await service.tick()).claimed, 0);
});

await check('two racing replicas produce exactly ONE run', async () => {
  const repository = new MemoryRepository();
  repository.seedTask();

  const a = build(repository, () => ({ exitCode: 0, output: 'a' }));
  const b = build(repository, () => ({ exitCode: 0, output: 'b' }));

  const [ra, rb] = await Promise.all([a.tick(), b.tick()]);
  await settle();

  assert.equal(ra.claimed + rb.claimed, 1);
  assert.equal(repository.runs.length, 1);
});

await check('a non-zero exit is recorded FAILED and notified', async () => {
  const repository = new MemoryRepository();
  repository.seedTask({ command: 'exit 3' });

  let notified = 0;

  await build(repository, () => ({ exitCode: 3, output: 'boom\n' }), { onRunFailed: () => { notified += 1; } }).tick();
  await settle();

  assert.equal(repository.runs[0].status, 'FAILED');
  assert.equal(repository.runs[0].exitCode, 3);
  assert.equal(notified, 1);
});

await check('a failed run is NOT retried by default', async () => {
  const repository = new MemoryRepository();
  const task = repository.seedTask({ command: 'exit 1', cron: '0 3 * * *' });

  await build(repository, () => ({ exitCode: 1, output: '' })).tick();
  await settle();

  assert.ok(task.nextRunAt!.toISOString().endsWith('T03:00:00.000Z'));
  assert.equal(repository.runs.length, 1);
});

await check('a failed run IS re-armed when maxRetries > 0', async () => {
  const repository = new MemoryRepository();
  const task = repository.seedTask({ command: 'exit 1', cron: '0 3 * * *', maxRetries: 2 });

  await build(repository, () => ({ exitCode: 1, output: '' })).tick();
  await settle();

  assert.equal(task.nextRunAt!.toISOString().endsWith('T03:00:00.000Z'), false);
});

await check('overlap is FORBIDden: the tick is SKIPPED, with an explanation', async () => {
  const repository = new MemoryRepository();
  const task = repository.seedTask({ cron: '* * * * *' });

  let release: any = () => {};
  const pending = new Promise((resolve) => {
    release = resolve;
  });

  const service = build(repository, () => pending);

  await service.tick();
  await settle();
  assert.equal(repository.runs[0].status, 'RUNNING');

  task.nextRunAt = new Date('2026-07-14T10:01:00.000Z');

  const second = await service.tick();

  assert.deepEqual(second.skipped, [task.id]);
  assert.equal(repository.runs[1].status, 'SKIPPED');
  assert.ok(repository.runs[1].logs.includes('still in progress'));

  release({ exitCode: 0, output: '' });
  await settle();
});

await check('a run that outlives its timeout is TIMED_OUT and the next step never starts', async () => {
  const repository = new MemoryRepository();
  repository.seedTask({ kind: 'WORKFLOW', workflowId: 1, command: '', timeoutSeconds: 10 });

  let clock = new Date('2026-07-14T10:00:00.000Z').getTime();
  let calls = 0;

  const service = build(
    repository,
    () => {
      calls += 1;
      clock += 20_000; // the step overruns the 10s budget

      return { exitCode: 0, output: 'partial\n' };
    },
    {
      resolveWorkflow: async () => ({ name: 'slow', commands: ['step-one', 'step-two'] }),
      now: () => new Date(clock),
    },
  );

  await service.tick();
  await settle();

  assert.equal(calls, 1);
  assert.equal(repository.runs[0].status, 'TIMED_OUT');
  assert.ok(repository.runs[0].error!.includes('Timed out after 10s'));
  assert.ok(repository.runs[0].logs.includes('partial'));
});

await check('billing: real duration x machine size, once, idempotency-keyed on the run', async () => {
  const repository = new MemoryRepository();
  repository.seedTask({ machineSize: 'dedicated-1' });

  const calls: any[] = [];
  let clock = new Date('2026-07-14T10:00:00.000Z').getTime();

  const service = build(
    repository,
    () => {
      clock += 30_000; // the run really took 30s

      return { exitCode: 0, output: 'done' };
    },
    {
      now: () => new Date(clock),
      meter: async (input: any) => {
        calls.push(input);

        return { costCents: 0.42 };
      },
    },
  );

  await service.tick();
  await settle();

  // dedicated-1 = 1 vCPU + 4 GiB for 30s => 30*18 + 120*2 = 780 compute units
  assert.equal(calls.length, 1);
  assert.equal(Math.round(calls[0].computeUnits), 780);
  assert.equal(calls[0].paygReference, `usage:scheduled-run:${repository.runs[0].id}`);
  assert.equal(repository.runs[0].costCents, 0.42);
  assert.equal(repository.runs[0].durationMs, 30_000);
  assert.notEqual(repository.runs[0].meteredAt, null);
});

await check('the run survives a billing outage', async () => {
  const repository = new MemoryRepository();
  repository.seedTask();

  await build(repository, () => ({ exitCode: 0, output: 'ok' }), {
    meter: async () => {
      throw new Error('credits down');
    },
  }).tick();
  await settle();

  assert.equal(repository.runs[0].status, 'SUCCESS');
  assert.equal(repository.runs[0].meteredAt, null);
});

await check('a cancel wins even if the exec later succeeds', async () => {
  const repository = new MemoryRepository();
  const task = repository.seedTask();

  let release: any = () => {};
  const pending = new Promise((resolve) => {
    release = resolve;
  });

  const service = build(repository, () => pending);

  await service.runNow(task.id);
  await settle();
  await service.cancelRun(repository.runs[0].id);

  release({ exitCode: 0, output: 'too late' });
  await settle();

  assert.equal(repository.runs[0].status, 'CANCELED');
});

await check('a workflow runs every step in order', async () => {
  const repository = new MemoryRepository();
  repository.seedTask({ kind: 'WORKFLOW', workflowId: 1, command: '' });

  const seen: string[] = [];

  await build(repository, (command: string) => {
    seen.push(command);

    return { exitCode: 0, output: '' };
  }, { resolveWorkflow: async () => ({ name: 'build', commands: ['npm ci', 'npm test'] }) }).tick();
  await settle();

  assert.deepEqual(seen, ['npm ci', 'npm test']);
  assert.equal(repository.runs[0].status, 'SUCCESS');
});

await check('an orphaned RUNNING run is reaped', async () => {
  const repository = new MemoryRepository();
  const task = repository.seedTask();

  await repository.createRun({
    taskId: task.id,
    organizationId: task.organizationId,
    projectId: task.projectId,
    status: 'RUNNING',
    trigger: 'schedule',
    scheduledFor: new Date('2020-01-01T00:00:00.000Z'),
    startedAt: new Date('2020-01-01T00:00:00.000Z'),
    machineSize: 'shared-0.5',
  });

  assert.equal(await build(repository, () => ({ exitCode: 0, output: '' })).reapStuckRuns(), 1);
  assert.equal(repository.runs[0].status, 'FAILED');
});

await check('plan frequency guard + machine-size fallback', () => {
  assert.equal(validateSchedule({ cron: '* * * * *', timezone: 'UTC', planKey: 'free' }).code, 'SCHEDULE_TOO_FREQUENT');
  assert.equal(validateSchedule({ cron: '* * * * *', timezone: 'UTC', planKey: 'pro' }).valid, true);
  assert.equal(validateSchedule({ cron: '0 * * * *', timezone: 'UTC', planKey: 'free' }).valid, true);
  assert.deepEqual(resolveMachineSize('gpu-9000'), { key: 'shared-0.5', cpuMillicores: 500, ramMb: 2048 });
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
