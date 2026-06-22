import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { validateAndFormatHunkMock, buildSelfRepairPromptMock } = vi.hoisted(() => ({
  validateAndFormatHunkMock: vi.fn(),
  buildSelfRepairPromptMock: vi.fn(),
}));

vi.mock('./hunk-validate', async () => {
  const actual = await vi.importActual<typeof import('./hunk-validate')>('./hunk-validate');
  return {
    ...actual,
    validateAndFormatHunk: validateAndFormatHunkMock,
    buildSelfRepairPrompt: buildSelfRepairPromptMock,
  };
});

import { ActionRunner, extractSelfRepairContent, isLongRunningInstallCommand } from './action-runner';
import type { ActionCallbackData } from './message-parser';
import { workspaceEvents } from './workspace-events';

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
  beforeEach(() => {
    validateAndFormatHunkMock.mockReset();
    validateAndFormatHunkMock.mockResolvedValue({ kind: 'skipped' });
    buildSelfRepairPromptMock.mockReset();
    buildSelfRepairPromptMock.mockReturnValue('synthetic-prompt');
  });

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

  it('waits for queued file actions before post-generation validation can continue', async () => {
    let releaseWrite!: () => void;

    const writeStarted = vi.fn();

    const writeFile = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          writeStarted();
          releaseWrite = resolve;
        }),
    );

    const runner = new ActionRunner(
      createRuntime({ writeFile } as Partial<RuntimeAdapter>),
      () => createShell() as any,
    );

    const data = createActionData();

    runner.addAction(data);

    const runPromise = runner.runAction(data, false);
    const idlePromise = runner.waitForIdle();

    let idleResolved = false;

    void idlePromise.then(() => {
      idleResolved = true;
    });

    await vi.waitFor(() => expect(writeStarted).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(idleResolved).toBe(false);

    releaseWrite();
    await runPromise;
    await idlePromise;

    expect(idleResolved).toBe(true);
    expect(runner.actions.get()[data.actionId]?.status).toBe('complete');
  });
});

describe('ActionRunner abort / start finalization', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not resurrect an aborted action to running via the deferred addAction update', async () => {
    const runner = new ActionRunner(createRuntime(), () => createShell() as any);
    const data = createActionData('action-abort');

    runner.addAction(data);

    // Abort before the deferred #currentExecutionPromise.then callback runs.
    runner.abortAll();

    expect(runner.actions.get()[data.actionId]?.status).toBe('aborted');

    // Flush the queued deferred status update; it must respect the aborted status.
    await runner.waitForIdle();
    await Promise.resolve();
    await Promise.resolve();

    expect(runner.actions.get()[data.actionId]?.status).toBe('aborted');
  });

  it('keeps a fast-failing start action marked failed (not clobbered back to complete)', async () => {
    vi.useFakeTimers();

    const executeCommand = vi.fn().mockRejectedValue(new Error('dev server exited'));

    const runner = new ActionRunner(createRuntime(), () => ({ ...createShell(), executeCommand }) as any);

    const startData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-start',
      action: {
        type: 'start',
        content: 'npm run dev',
      },
    };

    runner.addAction(startData);

    const runPromise = runner.runAction(startData, false);

    // Let the fire-and-forget #runStartAction reject and set status, then elapse the 2s settle delay.
    await vi.advanceTimersByTimeAsync(2_000);
    await runPromise;
    await Promise.resolve();

    expect(runner.actions.get()[startData.actionId]?.status).toBe('failed');
  });
});

describe('extractSelfRepairContent', () => {
  it('strips the boltAction wrapper and the surrounding newlines', () => {
    const raw = '<boltAction type="file" filePath="src/App.tsx">\nexport default App;\n</boltAction>';
    expect(extractSelfRepairContent(raw)).toBe('export default App;');
  });

  it('returns the raw response verbatim when no boltAction wrapper is present', () => {
    expect(extractSelfRepairContent('plain content')).toBe('plain content');
  });
});

describe('isLongRunningInstallCommand', () => {
  it.each([
    'npm install',
    'npm i',
    'npm ci',
    'npm install --save-dev vite',
    'pnpm install',
    'pnpm add react',
    'yarn install',
    'yarn add lodash',
    'bun install',
    'cd app && npm install',
    'npm install; npm run build',
    'npx create-vite my-app',
  ])('treats %s as a long-running install command', (command) => {
    expect(isLongRunningInstallCommand(command)).toBe(true);
  });

  it.each(['npm run dev', 'npm run build', 'echo installing', 'ls node_modules', 'vite preview', 'git add .'])(
    'does not treat %s as a long-running install command',
    (command) => {
      expect(isLongRunningInstallCommand(command)).toBe(false);
    },
  );
});

describe('ActionRunner self-repair retry loop', () => {
  const fileAction: ActionCallbackData = {
    artifactId: 'artifact-1',
    messageId: 'msg-1',
    actionId: 'action-self-repair',
    action: {
      type: 'file',
      filePath: 'src/App.tsx',
      content: 'const broken = ;',
    },
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  let progressEvents: Array<{
    filePath: string;
    status: { attempt: number; maxAttempts: number; errorMessage?: string } | null;
  }>;

  let unsubscribe: () => void;

  beforeEach(() => {
    validateAndFormatHunkMock.mockReset();
    buildSelfRepairPromptMock.mockReset();
    buildSelfRepairPromptMock.mockReturnValue('synthetic-self-repair-prompt');

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    progressEvents = [];
    unsubscribe = workspaceEvents.on('agent:self-repair:progress', (payload) => {
      progressEvents.push(payload);
    });
  });

  afterEach(() => {
    unsubscribe();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('writes the formatted payload when initial validation succeeds without any retries', async () => {
    validateAndFormatHunkMock.mockResolvedValueOnce({
      kind: 'ok',
      language: 'tsx',
      formatted: 'const x = 1;\n',
    });

    const writeFile = vi.fn().mockResolvedValue(undefined);

    const runner = new ActionRunner(
      createRuntime({ writeFile } as Partial<RuntimeAdapter>),
      () => createShell() as any,
    );

    runner.addAction(fileAction);
    await runner.runAction(fileAction, false);

    expect(writeFile).toHaveBeenCalledWith('src/App.tsx', 'const x = 1;\n');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(progressEvents).toHaveLength(0);
  });

  it('calls the self-repair endpoint on a parse error and writes the corrected content', async () => {
    validateAndFormatHunkMock
      .mockResolvedValueOnce({
        kind: 'error',
        language: 'tsx',
        message: "Unexpected token ';'",
        line: 1,
        column: 14,
      })
      .mockResolvedValueOnce({
        kind: 'ok',
        language: 'tsx',
        formatted: 'const fixed = 1;\n',
      });

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: '<boltAction type="file" filePath="src/App.tsx">\nconst fixed = 1;\n</boltAction>' }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const writeFile = vi.fn().mockResolvedValue(undefined);

    const runner = new ActionRunner(
      createRuntime({ writeFile } as Partial<RuntimeAdapter>),
      () => createShell() as any,
    );

    runner.addAction(fileAction);
    await runner.runAction(fileAction, false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/agent/self-repair');

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith('src/App.tsx', 'const fixed = 1;\n');

    // One "attempt 1/2" progress, then a clearing null.
    expect(progressEvents).toEqual([
      {
        filePath: 'src/App.tsx',
        status: { attempt: 1, maxAttempts: 2, errorMessage: "Unexpected token ';'" },
      },
      { filePath: 'src/App.tsx', status: null },
    ]);
  });

  it('writes the best-effort payload after exhausting all retries', async () => {
    vi.useFakeTimers();

    validateAndFormatHunkMock
      .mockResolvedValueOnce({ kind: 'error', language: 'tsx', message: 'parse error 0' })
      .mockResolvedValueOnce({ kind: 'error', language: 'tsx', message: 'parse error 1' })
      .mockResolvedValueOnce({ kind: 'error', language: 'tsx', message: 'parse error 2' });

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: 'still broken 1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: 'still broken 2' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const writeFile = vi.fn().mockResolvedValue(undefined);

    const runner = new ActionRunner(
      createRuntime({ writeFile } as Partial<RuntimeAdapter>),
      () => createShell() as any,
    );

    runner.addAction(fileAction);

    const runPromise = runner.runAction(fileAction, false);
    await vi.advanceTimersByTimeAsync(2_000);
    await runPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenCalledWith('src/App.tsx', 'still broken 2');

    const clearing = progressEvents.find((event) => event.status === null);
    expect(clearing).toBeDefined();
  });

  it('aborts the self-repair loop and skips the write when Stop is hit mid-repair', async () => {
    // Initial validation fails, so we enter the self-repair loop.
    validateAndFormatHunkMock
      .mockResolvedValueOnce({ kind: 'error', language: 'tsx', message: 'parse error 0' })
      .mockResolvedValueOnce({ kind: 'error', language: 'tsx', message: 'parse error 1' })
      .mockResolvedValueOnce({ kind: 'error', language: 'tsx', message: 'parse error 2' });

    const writeFile = vi.fn().mockResolvedValue(undefined);

    const runner = new ActionRunner(
      createRuntime({ writeFile } as Partial<RuntimeAdapter>),
      () => createShell() as any,
    );

    /*
     * The self-repair endpoint stands in for an in-flight LLM call. We abort the
     * action while it's pending, which rejects with an AbortError (swallowed by
     * the loop's catch) and flips abortSignal.aborted before the next iteration.
     */
    fetchMock.mockImplementationOnce(async () => {
      // User hits Stop while this self-repair request is in flight.
      runner.abortAll();
      throw new DOMException('aborted', 'AbortError');
    });

    runner.addAction(fileAction);
    await runner.runAction(fileAction, false);

    /*
     * Only the first attempt fired before the abort; the loop did not spin the
     * remaining attempts (no inter-attempt sleep, no second fetch).
     */
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Crucially, the aborted generation never wrote the broken payload.
    expect(writeFile).not.toHaveBeenCalled();

    // The progress banner is cleared on the way out.
    expect(progressEvents.some((event) => event.status === null)).toBe(true);
  });

  it('skips the write when the action is aborted before the self-repair loop runs', async () => {
    /*
     * Validation passes (no repair needed), but the action is aborted before the
     * final write — the write must still be skipped.
     */
    validateAndFormatHunkMock.mockResolvedValueOnce({ kind: 'skipped' });

    const writeFile = vi.fn().mockResolvedValue(undefined);

    /*
     * createDirectory is our seam: abort once the file action has begun running,
     * before #runtime.writeFile is reached. fileAction writes to 'src/App.tsx',
     * so a directory is created first.
     */
    const runner = new ActionRunner(
      createRuntime({
        writeFile,
        createDirectory: vi.fn().mockImplementation(async () => {
          runner.abortAll();
        }),
      } as Partial<RuntimeAdapter>),
      () => createShell() as any,
    );

    runner.addAction(fileAction);
    await runner.runAction(fileAction, false);

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('falls back to the last payload when the self-repair endpoint errors', async () => {
    validateAndFormatHunkMock
      .mockResolvedValueOnce({ kind: 'error', language: 'tsx', message: 'parse error' })
      .mockResolvedValueOnce({ kind: 'error', language: 'tsx', message: 'parse error again' });

    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(new Response('boom', { status: 502 }));

    const writeFile = vi.fn().mockResolvedValue(undefined);

    const runner = new ActionRunner(
      createRuntime({ writeFile } as Partial<RuntimeAdapter>),
      () => createShell() as any,
    );

    runner.addAction(fileAction);

    vi.useFakeTimers();

    const runPromise = runner.runAction(fileAction, false);
    await vi.advanceTimersByTimeAsync(2_000);
    await runPromise;

    expect(writeFile).toHaveBeenCalledWith('src/App.tsx', 'const broken = ;');
    expect(progressEvents.some((event) => event.status === null)).toBe(true);
  });
});
