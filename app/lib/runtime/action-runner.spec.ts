import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionRunner } from './action-runner';
import type { ActionCallbackData } from './message-parser';

function createActionData(actionId = 'action-1'): ActionCallbackData {
  return {
    artifactId: 'artifact-1',
    messageId: 'message-1',
    actionId,
    action: {
      type: 'file',
      filePath: 'src/index.css',
      content: 'body { color: red; }',
    },
  };
}

function createRuntime(overrides: Partial<RuntimeAdapter> = {}) {
  return {
    workdir: '/home/project',
    createDirectory: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    listFiles: vi.fn(),
    runCommand: vi.fn(),
    ...overrides,
  } as unknown as RuntimeAdapter;
}

function createShell() {
  return {
    ready: vi.fn().mockResolvedValue(undefined),
    terminal: {},
    process: {},
    executeCommand: vi.fn(),
  };
}

describe('ActionRunner tool timeout handling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails a streaming file action that never receives a final close event', async () => {
    vi.useFakeTimers();

    const runner = new ActionRunner(createRuntime(), () => createShell() as any);
    const data = createActionData();

    runner.addAction(data);
    await runner.runAction(data, true);

    expect(runner.actions.get()[data.actionId]?.status).toBe('running');

    await vi.advanceTimersByTimeAsync(120_000);

    const action = runner.actions.get()[data.actionId];
    expect(action?.status).toBe('failed');
    expect(action?.status === 'failed' ? action.error : '').toContain('timed out after 120 seconds');
  });

  it('fails timed-out file writes without multiplying blocked filesystem calls', async () => {
    vi.useFakeTimers();

    const writeFile = vi.fn(() => new Promise<void>(() => undefined));

    const runner = new ActionRunner(
      createRuntime({ writeFile } as Partial<RuntimeAdapter>),
      () => createShell() as any,
    );

    const data = createActionData();

    runner.addAction(data);

    const runPromise = runner.runAction(data, false);

    await vi.advanceTimersByTimeAsync(120_000);
    await runPromise;

    expect(writeFile).toHaveBeenCalledTimes(1);

    const action = runner.actions.get()[data.actionId];
    expect(action?.status).toBe('failed');
    expect(action?.status === 'failed' ? action.error : '').toContain('timed out after 120 seconds');
  });
});
