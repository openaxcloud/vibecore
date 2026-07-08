import { describe, expect, it, vi } from 'vitest';

import {
  computeNextRunFromCron,
  isWorkflowScheduleDue,
  normalizeWorkflowSchedule,
  runWorkflowSteps,
  validateCron,
  type CommandExecutor,
  type WorkflowLike,
  type WorkflowStateLike,
} from './ide-panel-workflows';

function makeWorkflow(overrides: Partial<WorkflowLike> = {}): WorkflowLike {
  return {
    id: 1,
    name: 'Build',
    executionMode: 'sequential',
    enabled: true,
    tasks: [],
    ...overrides,
  };
}

/**
 * A deterministic executor whose behavior is keyed on the command string, so a
 * test can make a specific step fail while all others succeed.
 */
function scriptedExecutor(script: Record<string, { exitCode: number; output?: string }>): {
  exec: CommandExecutor;
  calls: string[];
} {
  const calls: string[] = [];

  const exec: CommandExecutor = async (command) => {
    calls.push(command);

    const outcome = script[command] ?? { exitCode: 0, output: `ok:${command}` };

    return { exitCode: outcome.exitCode, output: outcome.output };
  };

  return { exec, calls };
}

function fixedNow() {
  let tick = 0;

  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

function fixedId() {
  let counter = 0;

  return () => `run-${counter++}`;
}

describe('runWorkflowSteps — sequential multi-step', () => {
  it('runs steps in order and returns per-step exit + output tail', async () => {
    const workflow = makeWorkflow({
      tasks: [
        { id: 11, orderIndex: 0, taskType: 'shell', command: 'echo a', targetWorkflowId: null },
        { id: 12, orderIndex: 1, taskType: 'shell', command: 'echo b', targetWorkflowId: null },
      ],
    });

    const state: WorkflowStateLike = { workflows: [workflow], runs: [] };

    const { exec, calls } = scriptedExecutor({
      'echo a': { exitCode: 0, output: 'A-out' },
      'echo b': { exitCode: 0, output: 'B-out' },
    });

    const run = await runWorkflowSteps({
      state,
      workflow,
      execCommand: exec,
      startedAt: fixedNow()(),
      now: fixedNow(),
      makeId: fixedId(),
    });

    expect(calls).toEqual(['echo a', 'echo b']);
    expect(run.status).toBe('succeeded');
    expect(run.steps).toHaveLength(2);
    expect(run.steps[0]).toMatchObject({ taskId: 11, status: 'succeeded', exitCode: 0, outputTail: 'A-out' });
    expect(run.steps[1]).toMatchObject({ taskId: 12, status: 'succeeded', exitCode: 0, outputTail: 'B-out' });
  });

  it('STOPS on first failure and marks later steps skipped', async () => {
    const workflow = makeWorkflow({
      tasks: [
        { id: 21, orderIndex: 0, taskType: 'shell', command: 'ok', targetWorkflowId: null },
        { id: 22, orderIndex: 1, taskType: 'shell', command: 'boom', targetWorkflowId: null },
        { id: 23, orderIndex: 2, taskType: 'shell', command: 'never', targetWorkflowId: null },
      ],
    });

    const state: WorkflowStateLike = { workflows: [workflow], runs: [] };

    const { exec, calls } = scriptedExecutor({
      ok: { exitCode: 0, output: 'first ok' },
      boom: { exitCode: 2, output: 'failure output' },
    });

    const run = await runWorkflowSteps({
      state,
      workflow,
      execCommand: exec,
      startedAt: fixedNow()(),
      now: fixedNow(),
      makeId: fixedId(),
    });

    // The third command must never have been dispatched.
    expect(calls).toEqual(['ok', 'boom']);
    expect(run.status).toBe('failed');
    expect(run.steps.map((step) => step.status)).toEqual(['succeeded', 'failed', 'skipped']);
    expect(run.steps[1]).toMatchObject({ taskId: 22, status: 'failed', exitCode: 2 });
    expect(run.steps[1].outputTail).toContain('failure output');
    expect(run.steps[2]).toMatchObject({ taskId: 23, status: 'skipped' });
  });

  it('keeps a single-step workflow working', async () => {
    const workflow = makeWorkflow({
      tasks: [{ id: 31, orderIndex: 0, taskType: 'shell', command: 'npm run dev', targetWorkflowId: null }],
    });

    const state: WorkflowStateLike = { workflows: [workflow], runs: [] };
    const { exec, calls } = scriptedExecutor({ 'npm run dev': { exitCode: 0, output: 'started' } });

    const run = await runWorkflowSteps({
      state,
      workflow,
      execCommand: exec,
      startedAt: fixedNow()(),
      now: fixedNow(),
      makeId: fixedId(),
    });

    expect(calls).toEqual(['npm run dev']);
    expect(run.status).toBe('succeeded');
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0]).toMatchObject({ status: 'succeeded', command: 'npm run dev' });
  });

  it('runs ONLY the selected workflow when several exist (Run now targets the right one)', async () => {
    const target = makeWorkflow({
      id: 7,
      name: 'Deploy',
      tasks: [{ id: 71, orderIndex: 0, taskType: 'shell', command: 'deploy', targetWorkflowId: null }],
    });
    const sibling = makeWorkflow({
      id: 8,
      name: 'Test',
      tasks: [{ id: 81, orderIndex: 0, taskType: 'shell', command: 'run-tests', targetWorkflowId: null }],
    });

    const state: WorkflowStateLike = { workflows: [target, sibling], runs: [] };
    const { exec, calls } = scriptedExecutor({ deploy: { exitCode: 0, output: 'deployed' } });

    const run = await runWorkflowSteps({
      state,
      workflow: target,
      execCommand: exec,
      startedAt: fixedNow()(),
      now: fixedNow(),
      makeId: fixedId(),
    });

    // The sibling workflow's command must never be dispatched.
    expect(calls).toEqual(['deploy']);
    expect(run.workflowId).toBe(7);
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0]).toMatchObject({ taskId: 71, status: 'succeeded' });
  });

  it('skips a disabled workflow without executing anything', async () => {
    const workflow = makeWorkflow({
      enabled: false,
      tasks: [{ id: 41, orderIndex: 0, taskType: 'shell', command: 'echo x', targetWorkflowId: null }],
    });

    const state: WorkflowStateLike = { workflows: [workflow], runs: [] };
    const exec = vi.fn<Parameters<CommandExecutor>, ReturnType<CommandExecutor>>();

    const run = await runWorkflowSteps({
      state,
      workflow,
      execCommand: exec,
      startedAt: fixedNow()(),
      now: fixedNow(),
      makeId: fixedId(),
    });

    expect(exec).not.toHaveBeenCalled();
    expect(run.status).toBe('skipped');
  });

  it('propagates a runtime executor throw as a failed run and stops', async () => {
    const workflow = makeWorkflow({
      tasks: [
        { id: 51, orderIndex: 0, taskType: 'shell', command: 'throws', targetWorkflowId: null },
        { id: 52, orderIndex: 1, taskType: 'shell', command: 'after', targetWorkflowId: null },
      ],
    });

    const state: WorkflowStateLike = { workflows: [workflow], runs: [] };
    const calls: string[] = [];

    const exec: CommandExecutor = async (command) => {
      calls.push(command);

      if (command === 'throws') {
        throw new Error('workspace unreachable');
      }

      return { exitCode: 0, output: '' };
    };

    const run = await runWorkflowSteps({
      state,
      workflow,
      execCommand: exec,
      startedAt: fixedNow()(),
      now: fixedNow(),
      makeId: fixedId(),
    });

    expect(calls).toEqual(['throws']);
    expect(run.status).toBe('failed');
    expect(run.steps.map((step) => step.status)).toEqual(['failed', 'skipped']);
    expect(run.steps[0].outputTail).toContain('workspace unreachable');
  });
});

describe('validateCron', () => {
  it('accepts valid 5-field expressions', () => {
    expect(validateCron('0 3 * * *')).toMatchObject({ valid: true, normalized: '0 3 * * *' });
    expect(validateCron('*/15 * * * 1-5')).toMatchObject({ valid: true });
    expect(validateCron(' 30   2 1 1,6 *  ')).toMatchObject({ valid: true, normalized: '30 2 1 1,6 *' });
    expect(validateCron('0 0 * * 7')).toMatchObject({ valid: true }); // 7 = Sunday
  });

  it('rejects malformed or out-of-range expressions', () => {
    expect(validateCron('').valid).toBe(false);
    expect(validateCron('* * * *').valid).toBe(false); // 4 fields
    expect(validateCron('60 * * * *').valid).toBe(false); // minute out of range
    expect(validateCron('0 24 * * *').valid).toBe(false); // hour out of range
    expect(validateCron('0 0 0 * *').valid).toBe(false); // day-of-month min is 1
    expect(validateCron('0 0 * 13 *').valid).toBe(false); // month out of range
    expect(validateCron('0 0 * * 8').valid).toBe(false); // weekday max is 7
    expect(validateCron('a b c d e').valid).toBe(false);
    expect(validateCron('*/0 * * * *').valid).toBe(false); // zero step
  });
});

describe('computeNextRunFromCron', () => {
  it('computes the next daily run strictly after `from`', () => {
    // Daily at 03:00 UTC. from is before it => same day.
    const next = computeNextRunFromCron('0 3 * * *', new Date('2026-01-10T01:00:00.000Z'));
    expect(next).toBe('2026-01-10T03:00:00.000Z');
  });

  it('rolls to the next day when the time has already passed', () => {
    const next = computeNextRunFromCron('0 3 * * *', new Date('2026-01-10T05:00:00.000Z'));
    expect(next).toBe('2026-01-11T03:00:00.000Z');
  });

  it('honors a weekday restriction', () => {
    // 2026-01-10 is a Saturday. Next Monday (dow=1) at 09:00 is 2026-01-12.
    const next = computeNextRunFromCron('0 9 * * 1', new Date('2026-01-10T12:00:00.000Z'));
    expect(next).toBe('2026-01-12T09:00:00.000Z');
  });

  it('honors a step interval on minutes', () => {
    const next = computeNextRunFromCron('*/15 * * * *', new Date('2026-01-10T10:07:00.000Z'));
    expect(next).toBe('2026-01-10T10:15:00.000Z');
  });

  it('honors a day-of-month + month restriction', () => {
    const next = computeNextRunFromCron('0 0 1 3 *', new Date('2026-01-10T00:00:00.000Z'));
    expect(next).toBe('2026-03-01T00:00:00.000Z');
  });

  it('returns null for an invalid expression', () => {
    expect(computeNextRunFromCron('nope', new Date())).toBeNull();
  });
});

describe('normalizeWorkflowSchedule + isWorkflowScheduleDue', () => {
  const now = new Date('2026-01-10T01:00:00.000Z');

  it('disables a schedule with no/invalid cron and computes nextRunAt when enabled', () => {
    expect(normalizeWorkflowSchedule({ enabled: true, cron: 'bad' }, now)).toMatchObject({
      enabled: false,
      cron: null,
      nextRunAt: null,
    });

    const normalized = normalizeWorkflowSchedule({ enabled: true, cron: '0 3 * * *' }, now);
    expect(normalized).toMatchObject({ enabled: true, cron: '0 3 * * *', nextRunAt: '2026-01-10T03:00:00.000Z' });
  });

  it('never enables when the flag is off', () => {
    expect(normalizeWorkflowSchedule({ enabled: false, cron: '0 3 * * *' }, now)).toMatchObject({
      enabled: false,
      nextRunAt: null,
    });
  });

  it('reports due only when enabled and nextRunAt is in the past', () => {
    expect(
      isWorkflowScheduleDue(
        { enabled: true, cron: '0 3 * * *', nextRunAt: '2026-01-10T03:00:00.000Z', lastRunAt: null },
        new Date('2026-01-10T03:00:01.000Z'),
      ),
    ).toBe(true);
    expect(
      isWorkflowScheduleDue(
        { enabled: true, cron: '0 3 * * *', nextRunAt: '2026-01-10T03:00:00.000Z', lastRunAt: null },
        new Date('2026-01-10T02:59:00.000Z'),
      ),
    ).toBe(false);
    expect(
      isWorkflowScheduleDue(
        { enabled: false, cron: '0 3 * * *', nextRunAt: '2020-01-01T00:00:00.000Z', lastRunAt: null },
        new Date(),
      ),
    ).toBe(false);
    expect(isWorkflowScheduleDue(null, new Date())).toBe(false);
  });
});
