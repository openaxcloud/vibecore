import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { validateAndFormatHunkMock, buildSelfRepairPromptMock, applyEntryExportReconcileMock } = vi.hoisted(() => ({
  validateAndFormatHunkMock: vi.fn(),
  buildSelfRepairPromptMock: vi.fn(),
  applyEntryExportReconcileMock: vi.fn(),
}));

vi.mock('./hunk-validate', async () => {
  const actual = await vi.importActual<typeof import('./hunk-validate')>('./hunk-validate');
  return {
    ...actual,
    validateAndFormatHunk: validateAndFormatHunkMock,
    buildSelfRepairPrompt: buildSelfRepairPromptMock,
  };
});

/*
 * Spy the project-doctor (entry/import↔export reconcile) so the diff tests can
 * assert it still runs post-write on the applied full content, and so its real
 * fs probing is a controllable no-op in the file-action tests.
 */
vi.mock('./entry-export-reconcile', async () => {
  const actual = await vi.importActual<typeof import('./entry-export-reconcile')>('./entry-export-reconcile');
  return {
    ...actual,
    applyEntryExportReconcile: applyEntryExportReconcileMock,
  };
});

import {
  ActionRunner,
  extractSelfRepairContent,
  isDevServerStartCommand,
  isLongRunningInstallCommand,
} from './action-runner';
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

beforeEach(() => {
  applyEntryExportReconcileMock.mockReset();
  applyEntryExportReconcileMock.mockResolvedValue([]);
});

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

  it('does not watchdog-fail a long-streaming file action while its body is still arriving', async () => {
    vi.useFakeTimers();

    const runner = new ActionRunner(createRuntime(), () => createShell() as any);
    const data = createActionData();

    runner.addAction(data);

    /*
     * Streaming pass: status:'running', executed:false. The editor buffer is fed
     * chunk-by-chunk without re-entering the runner, so the watchdog must not arm —
     * otherwise a healthy file that streams for >FILE_TOOL_TIMEOUT_MS gets a bogus
     * "timed out" failure. Truncated streams are reaped by abortStreamingFileActions().
     */
    await runner.runAction(data, true);

    expect(runner.actions.get()[data.actionId]?.status).toBe('running');

    // Far past the 120s file-tool timeout: still running, never spuriously failed.
    await vi.advanceTimersByTimeAsync(300_000);

    expect(runner.actions.get()[data.actionId]?.status).toBe('running');
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

  it('UNIFIED LAUNCHER: delegates a dev-server start to the tracked launcher and never opens the untracked PTY dev server', async () => {
    vi.useFakeTimers();

    const executeCommand = vi.fn(async () => ({ exitCode: 0, output: '' }));
    const onStartDevServer = vi.fn(async () => undefined);

    const runner = new ActionRunner(
      createRuntime(),
      () => ({ ...createShell(), executeCommand }) as any,
      undefined,
      undefined,
      undefined,
      onStartDevServer,
    );

    const startData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-start-delegate',
      action: { type: 'start', content: 'npm run dev' },
    };

    runner.addAction(startData);

    const runPromise = runner.runAction(startData, false);
    await vi.advanceTimersByTimeAsync(2_000);
    await runPromise;
    await Promise.resolve();

    // The single tracked launcher was used…
    expect(onStartDevServer).toHaveBeenCalledWith('npm run dev');

    // …and NO PTY dev server was spawned → no untracked phantom racing port 5173.
    expect(executeCommand).not.toHaveBeenCalled();
    expect(runner.actions.get()[startData.actionId]?.status).toBe('complete');
  });

  it('runs a NON-dev start command in the PTY (not delegated) so a bespoke command is never silently dropped', async () => {
    vi.useFakeTimers();

    const executeCommand = vi.fn(async () => ({ exitCode: 0, output: '' }));
    const onStartDevServer = vi.fn(async () => undefined);

    const runner = new ActionRunner(
      createRuntime(),
      () => ({ ...createShell(), executeCommand }) as any,
      undefined,
      undefined,
      undefined,
      onStartDevServer,
    );

    const startData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-start-bespoke',
      action: { type: 'start', content: 'node worker.js' },
    };

    runner.addAction(startData);

    const runPromise = runner.runAction(startData, false);
    await vi.advanceTimersByTimeAsync(2_000);
    await runPromise;
    await Promise.resolve();

    expect(onStartDevServer).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalled();
  });
});

describe('isDevServerStartCommand', () => {
  it.each([
    'npm run dev',
    'npm start',
    'pnpm dev',
    'pnpm run dev',
    'yarn dev',
    'bun run dev',
    'vite',
    'vite --host 0.0.0.0',
    'npx vite',
    'next dev',
    'astro dev',
    'remix dev',
    'nuxt dev',
  ])('recognizes %s as a dev-server launch', (command) => {
    expect(isDevServerStartCommand(command)).toBe(true);
  });

  it.each(['node worker.js', 'node server.js', 'npm run build', 'echo hi', 'python app.py', 'go run .'])(
    'does not treat %s as a dev-server launch (kept on the PTY path)',
    (command) => {
      expect(isDevServerStartCommand(command)).toBe(false);
    },
  );
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

describe('ActionRunner diff action apply', () => {
  beforeEach(() => {
    validateAndFormatHunkMock.mockReset();
    validateAndFormatHunkMock.mockResolvedValue({ kind: 'skipped' });
    buildSelfRepairPromptMock.mockReset();
    buildSelfRepairPromptMock.mockReturnValue('synthetic-prompt');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A runtime adapter backed by an in-memory file map (read reflects prior writes). */
  function createStatefulRuntime(initial: Record<string, string> = {}) {
    const files = new Map(Object.entries(initial));

    const readFile = vi.fn(async (filePath: string) => {
      if (!files.has(filePath)) {
        throw new Error(`ENOENT: no such file ${filePath}`);
      }

      return { content: files.get(filePath) as string, encoding: 'utf8' as const };
    });

    const writeFile = vi.fn(async (filePath: string, content: string) => {
      files.set(filePath, content);
    });

    const runtime = createRuntime({ readFile, writeFile } as Partial<RuntimeAdapter>);

    return { runtime, files, readFile, writeFile };
  }

  function diffActionData(filePath: string, content: string, actionId = 'diff-1'): ActionCallbackData {
    return {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId,
      action: { type: 'diff', filePath, content },
    };
  }

  function fileActionData(filePath: string, content: string, actionId = 'file-1'): ActionCallbackData {
    return {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId,
      action: { type: 'file', filePath, content },
    };
  }

  it('applies an anchored 2-line edit into a 600-line file and writes the FULL applied content once', async () => {
    const original = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    const { runtime, writeFile } = createStatefulRuntime({ 'src/big.ts': original });

    const runner = new ActionRunner(runtime, () => createShell() as any);

    const data = diffActionData(
      'src/big.ts',
      ['<<<<<<< SEARCH', 'line 300', '=======', 'line THREE-HUNDRED', '>>>>>>> REPLACE'].join('\n'),
    );

    runner.addAction(data);
    await runner.runAction(data, false);

    expect(writeFile).toHaveBeenCalledTimes(1);

    const expected = original.replace('line 300\n', 'line THREE-HUNDRED\n');
    expect(writeFile).toHaveBeenCalledWith('src/big.ts', expected);

    // project-doctor / reconcile ran AFTER the write on the applied full content.
    expect(applyEntryExportReconcileMock).toHaveBeenCalledTimes(1);
    expect(applyEntryExportReconcileMock.mock.calls[0][1]).toBe('src/big.ts');
    expect(runner.actions.get()[data.actionId]?.status).toBe('complete');
  });

  it('BASE DRIFT: an anchor not present writes nothing, leaves the file intact, and alerts', async () => {
    const original = 'const answer = 41;\n';
    const { runtime, files, writeFile } = createStatefulRuntime({ 'src/answer.ts': original });

    const onAlert = vi.fn();
    const runner = new ActionRunner(runtime, () => createShell() as any, onAlert);

    const data = diffActionData(
      'src/answer.ts',
      ['<<<<<<< SEARCH', 'const answer = 99;', '=======', 'const answer = 42;', '>>>>>>> REPLACE'].join('\n'),
    );

    runner.addAction(data);
    await runner.runAction(data, false);

    // THE key safety assertion: nothing written, old content byte-identical.
    expect(writeFile).not.toHaveBeenCalled();
    expect(files.get('src/answer.ts')).toBe(original);
    expect(applyEntryExportReconcileMock).not.toHaveBeenCalled();

    expect(onAlert).toHaveBeenCalledTimes(1);
    expect(onAlert.mock.calls[0][0]).toMatchObject({ type: 'warning', title: 'Diff could not be applied' });
    expect(onAlert.mock.calls[0][0].description).toContain('src/answer.ts');
  });

  it('AMBIGUOUS anchor (multiple matches) writes nothing and alerts', async () => {
    const original = 'value = 1;\nvalue = 1;\n';
    const { runtime, files, writeFile } = createStatefulRuntime({ 'src/dup.ts': original });

    const onAlert = vi.fn();
    const runner = new ActionRunner(runtime, () => createShell() as any, onAlert);

    const data = diffActionData(
      'src/dup.ts',
      ['<<<<<<< SEARCH', 'value = 1;', '=======', 'value = 2;', '>>>>>>> REPLACE'].join('\n'),
    );

    runner.addAction(data);
    await runner.runAction(data, false);

    expect(writeFile).not.toHaveBeenCalled();
    expect(files.get('src/dup.ts')).toBe(original);
    expect(onAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Diff could not be applied' }));
  });

  it('MALFORMED blocks write nothing and alert', async () => {
    const original = 'const x = 1;\n';
    const { runtime, files, writeFile } = createStatefulRuntime({ 'src/x.ts': original });

    const onAlert = vi.fn();
    const runner = new ActionRunner(runtime, () => createShell() as any, onAlert);

    // Missing the >>>>>>> REPLACE terminator → parser reports malformed.
    const data = diffActionData('src/x.ts', ['<<<<<<< SEARCH', 'const x = 1;', '=======', 'const x = 2;'].join('\n'));

    runner.addAction(data);
    await runner.runAction(data, false);

    expect(writeFile).not.toHaveBeenCalled();
    expect(files.get('src/x.ts')).toBe(original);
    expect(onAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Diff could not be applied' }));
  });

  it('TARGET MISSING: a diff against a non-existent file writes nothing, creates nothing, and alerts', async () => {
    const { runtime, files, writeFile } = createStatefulRuntime({});

    const onAlert = vi.fn();
    const runner = new ActionRunner(runtime, () => createShell() as any, onAlert);

    const data = diffActionData(
      'src/missing.ts',
      ['<<<<<<< SEARCH', 'const a = 1;', '=======', 'const a = 2;', '>>>>>>> REPLACE'].join('\n'),
    );

    runner.addAction(data);
    await runner.runAction(data, false);

    expect(writeFile).not.toHaveBeenCalled();
    expect(files.has('src/missing.ts')).toBe(false);
    expect(onAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Diff could not be applied',
        description: expect.stringContaining('does not exist'),
      }),
    );
  });

  it('MULTI-BLOCK success routes the full applied content through sanitize + project-doctor reconcile', async () => {
    const original = ['const a = 1;', 'const b = 2;', 'const c = 3;', ''].join('\n');
    const { runtime, writeFile } = createStatefulRuntime({ 'src/multi.ts': original });

    const runner = new ActionRunner(runtime, () => createShell() as any);

    const data = diffActionData(
      'src/multi.ts',
      [
        '<<<<<<< SEARCH',
        'const a = 1;',
        '=======',
        'const a = 10;',
        '>>>>>>> REPLACE',
        '<<<<<<< SEARCH',
        'const c = 3;',
        '=======',
        'const c = 30;',
        '>>>>>>> REPLACE',
      ].join('\n'),
    );

    runner.addAction(data);
    await runner.runAction(data, false);

    const expected = ['const a = 10;', 'const b = 2;', 'const c = 30;', ''].join('\n');
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith('src/multi.ts', expected);

    // Sanitize + self-repair validation ran on the applied content, then reconcile.
    expect(validateAndFormatHunkMock).toHaveBeenCalledWith('src/multi.ts', expected);
    expect(applyEntryExportReconcileMock).toHaveBeenCalledTimes(1);
  });

  it('STREAMING: a streaming diff call writes nothing (only the authoritative call applies)', async () => {
    const original = 'const x = 1;\n';
    const { runtime, files, writeFile } = createStatefulRuntime({ 'src/s.ts': original });

    const runner = new ActionRunner(runtime, () => createShell() as any);

    const data = diffActionData(
      'src/s.ts',
      ['<<<<<<< SEARCH', 'const x = 1;', '=======', 'const x = 2;', '>>>>>>> REPLACE'].join('\n'),
    );

    runner.addAction(data);
    await runner.runAction(data, true);

    expect(writeFile).not.toHaveBeenCalled();
    expect(files.get('src/s.ts')).toBe(original);
  });

  it('MUTEX: a file write and a diff to the same path serialize without interleaving', async () => {
    // Start empty; the file action creates the base, the diff patches THAT base.
    const { runtime, files, writeFile, readFile } = createStatefulRuntime({});

    const runner = new ActionRunner(runtime, () => createShell() as any);

    const fileData = fileActionData('src/shared.ts', 'const version = 1;\n', 'file-shared');

    const diffData = diffActionData(
      'src/shared.ts',
      ['<<<<<<< SEARCH', 'const version = 1;', '=======', 'const version = 2;', '>>>>>>> REPLACE'].join('\n'),
      'diff-shared',
    );

    runner.addAction(fileData);
    runner.addAction(diffData);

    // Dispatch both back-to-back; the runner's single execution chain serializes them.
    const p1 = runner.runAction(fileData, false);
    const p2 = runner.runAction(diffData, false);
    await Promise.all([p1, p2]);

    /*
     * The diff must have read the file-action's committed content (no stale/empty read),
     * proving the two same-path writes did not interleave.
     */
    expect(files.get('src/shared.ts')).toBe('const version = 2;\n');

    // Both writes happened, in order, each with a complete buffer (never a partial).
    const writtenContents = writeFile.mock.calls.map((call) => call[1]);
    expect(writtenContents).toEqual(['const version = 1;\n', 'const version = 2;\n']);

    // The diff's read observed the file action's write (serialized, not concurrent).
    expect(readFile).toHaveBeenCalledWith('src/shared.ts');
  });
});

describe('ActionRunner.recoverDiffViaFullFileReemit (diff apply-fail full-file fallback)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const freshSignal = () => new AbortController().signal;

  it('returns the re-emitted FULL file (boltAction-unwrapped) when the self-repair endpoint succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: '<boltAction type="file" filePath="src/a.ts">\nconst answer = 42;\n</boltAction>',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const runner = new ActionRunner(createRuntime(), () => createShell() as any);

    const out = await runner.recoverDiffViaFullFileReemit(
      'src/a.ts',
      'const answer = 41;\n',
      '<<< diff >>>',
      freshSignal(),
    );

    // extractSelfRepairContent unwraps the boltAction and trims the trailing newline.
    expect(out).toBe('const answer = 42;');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/agent/self-repair');
  });

  it('returns null WITHOUT calling the endpoint when the action is already aborted (Stop honored)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    controller.abort();

    const runner = new ActionRunner(createRuntime(), () => createShell() as any);
    const out = await runner.recoverDiffViaFullFileReemit('src/a.ts', 'base\n', 'diff', controller.signal);

    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null (never throws) when the self-repair endpoint errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const runner = new ActionRunner(createRuntime(), () => createShell() as any);
    const out = await runner.recoverDiffViaFullFileReemit('src/a.ts', 'base\n', 'diff', freshSignal());

    expect(out).toBeNull();
  });

  it('returns null when the endpoint returns empty content', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ content: '' }), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const runner = new ActionRunner(createRuntime(), () => createShell() as any);
    const out = await runner.recoverDiffViaFullFileReemit('src/a.ts', 'base\n', 'diff', freshSignal());

    expect(out).toBeNull();
  });
});

/*
 * BUG-AGENT-001 — amplification d'écritures.
 *
 * Comportement, pas structure. Le scénario reproduit ce qui a été MESURÉ en
 * direct le 21/08 sur `web:405b1f369d` : des actions ré-émises, portant des
 * `actionId` DIFFÉRENTS, réécrivent le même fichier avec un contenu identique
 * (vite.config.ts : 20 écritures, 1 seule taille distincte).
 *
 * Utiliser le même actionId ne testerait RIEN : `runAction` a déjà une garde
 * `if (action.executed) return` qui l'attrape. C'est précisément la confusion
 * qui rendait ce bug difficile à cerner.
 */
describe('BUG-AGENT-001 — une réécriture octet-pour-octet ne repart pas sur le réseau', () => {
  beforeEach(() => {
    validateAndFormatHunkMock.mockReset();
    validateAndFormatHunkMock.mockResolvedValue({ kind: 'skipped' });
    buildSelfRepairPromptMock.mockReset();
    buildSelfRepairPromptMock.mockReturnValue('synthetic-prompt');
  });

  async function replay(runner: ActionRunner, actionId: string, content: string) {
    const data = createActionData(actionId);
    (data.action as { content: string }).content = content;
    runner.addAction(data);
    await runner.runAction(data);
    await runner.waitForIdle();
  }

  const cssWrites = (runtime: RuntimeAdapter) =>
    (runtime.writeFile as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => String(c[0]).includes('index.css'))
      .map((c) => String(c[1]));

  it('écrit UNE fois pour vingt ré-émissions identiques (actionId différents)', async () => {
    const runtime = createRuntime();
    const runner = new ActionRunner(runtime, () => createShell() as any);

    for (let i = 0; i < 20; i++) {
      await replay(runner, `action-${i}`, 'body { color: red; }');
    }

    expect(cssWrites(runtime)).toHaveLength(1);
  });

  it('laisse passer TOUT changement de contenu — une garde trop large perdrait le fichier', async () => {
    const runtime = createRuntime();
    const runner = new ActionRunner(runtime, () => createShell() as any);

    // motif réel de package.json : répétitions, puis un contenu plus complet
    for (let i = 0; i < 5; i++) {
      await replay(runner, `a-${i}`, '{"name":"app"}');
    }

    for (let i = 0; i < 5; i++) {
      await replay(runner, `b-${i}`, '{"name":"app","dependencies":{"react":"18"}}');
    }

    const written = cssWrites(runtime);

    // une écriture par contenu distinct, et la version complète a bien atteint le disque
    expect(written).toEqual(['{"name":"app"}', '{"name":"app","dependencies":{"react":"18"}}']);
  });

  it('un retour au contenu précédent est bien réécrit (annulation)', async () => {
    const runtime = createRuntime();
    const runner = new ActionRunner(runtime, () => createShell() as any);

    await replay(runner, 'v1', 'AAA');
    await replay(runner, 'v2', 'BBB');
    await replay(runner, 'v3', 'AAA');

    // Le mémo ne doit pas transformer un retour arrière en no-op silencieux.
    expect(cssWrites(runtime).at(-1)).toBe('AAA');
  });

  it('une écriture en ÉCHEC laisse le chemin réécrivable', async () => {
    const writeFile = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const runtime = createRuntime({ writeFile } as Partial<RuntimeAdapter>);
    const runner = new ActionRunner(runtime, () => createShell() as any);

    await replay(runner, 'r1', 'body { color: red; }');
    await replay(runner, 'r2', 'body { color: red; }');

    expect(cssWrites(runtime).length).toBeGreaterThanOrEqual(2);
  });
});
