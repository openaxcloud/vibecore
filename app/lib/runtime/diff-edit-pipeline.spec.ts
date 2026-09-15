import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Diff-edit increment 5/5 — END-TO-END pipeline capstone.
 *
 * Drives a realistic assistant message that carries a `<boltAction type="diff">`
 * through the WHOLE pipeline exactly as the app does at runtime:
 *
 *   assistant message string
 *     → StreamingMessageParser (byte-exact diff parse)
 *     → ActionRunner.addAction / runAction
 *     → resolveDiffAction (read current file + anchored search/replace apply)
 *     → #runFileAction (sanitize / validate / writeFile)
 *     → applyEntryExportReconcile (project-doctor)
 *     → diffApply render metadata + diff-edit.apply telemetry
 *
 * The runtime is an in-memory fake whose reads reflect prior writes, so a diff
 * genuinely patches the committed base. project-doctor + hunk-validate are
 * spied (as in action-runner.spec) so we can assert they ran on the APPLIED
 * full content without touching a real fs.
 *
 * Scenarios:
 *   - SUCCESS: small edit into a large file → one full-content write, only the
 *     changed region differs, reconcile ran, render meta = applied (+N/−M),
 *     telemetry fired with a positive token saving.
 *   - BASE-DRIFT FALLBACK: anchor absent → nothing written, base byte-identical,
 *     alert raised, render meta = failed (apply-failed) — never silent.
 *   - MIXED MESSAGE: a type="file" (new file) + a type="diff" (edit existing)
 *     in ONE message, both handled, file path byte-identical.
 *   - THRESHOLD single-source: the rendered prompt contains DIFF_EDIT_MIN_LINES.
 */

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

vi.mock('./entry-export-reconcile', async () => {
  const actual = await vi.importActual<typeof import('./entry-export-reconcile')>('./entry-export-reconcile');
  return {
    ...actual,
    applyEntryExportReconcile: applyEntryExportReconcileMock,
  };
});

import { ActionRunner } from './action-runner';
import type { ActionCallbackData } from './message-parser';
import { StreamingMessageParser } from './message-parser';
import { workspaceEvents } from './workspace-events';
import type { WorkspaceEventMap } from './workspace-events';
import { getFineTunedPrompt } from '~/lib/common/prompts/new-prompt';
import getOptimizedPrompt from '~/lib/common/prompts/optimized';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import { DIFF_EDIT_MIN_LINES } from '~/utils/search-replace';

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

/** In-memory runtime: reads reflect prior writes so a diff patches the committed base. */
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

/**
 * Parse a full (already-complete) assistant message the way the app does and
 * drive every action it contains through the runner to completion, in order.
 * Mirrors the real open→close→run wiring: addAction on open, run the close
 * payload (full content) non-streaming.
 */
async function driveAssistantMessage(runner: ActionRunner, messageId: string, message: string) {
  const closeData: ActionCallbackData[] = [];

  const parser = new StreamingMessageParser({
    callbacks: {
      onActionOpen: (data) => runner.addAction(data),
      onActionClose: (data) => closeData.push(data),
    },
  });

  parser.parse(messageId, message);

  for (const data of closeData) {
    // Ensure the action exists even if onActionOpen fired with partial data.
    runner.addAction(data);
    await runner.runAction(data, false);
  }

  return closeData;
}

beforeEach(() => {
  applyEntryExportReconcileMock.mockReset();
  applyEntryExportReconcileMock.mockResolvedValue([]);
  validateAndFormatHunkMock.mockReset();
  validateAndFormatHunkMock.mockResolvedValue({ kind: 'skipped' });
  buildSelfRepairPromptMock.mockReset();
  buildSelfRepairPromptMock.mockReturnValue('synthetic-prompt');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('diff-edit e2e pipeline — SUCCESS (large file, small anchored edit)', () => {
  it('parses → applies → writes the FULL applied content once → reconciles → render meta + telemetry', async () => {
    const original = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    const { runtime, files, writeFile } = createStatefulRuntime({ 'src/big.ts': original });

    const runner = new ActionRunner(runtime, () => createShell() as any);

    const telemetry: WorkspaceEventMap['agent:diff-edit:apply'][] = [];
    const unsubscribe = workspaceEvents.on('agent:diff-edit:apply', (payload) => telemetry.push(payload));

    const message = [
      'Applying a targeted patch to the large file.',
      '',
      '<boltArtifact id="patch-big" title="Patch big.ts">',
      '<boltAction type="diff" filePath="src/big.ts">',
      '<<<<<<< SEARCH',
      'line 300',
      '=======',
      'line THREE-HUNDRED',
      '>>>>>>> REPLACE',
      '</boltAction>',
      '</boltArtifact>',
    ].join('\n');

    const closeData = await driveAssistantMessage(runner, 'msg-success', message);
    unsubscribe();

    // The parser surfaced exactly one diff action, byte-exact.
    const diffAction = closeData.find((d) => d.action.type === 'diff');
    expect(diffAction).toBeDefined();
    expect(diffAction!.action.filePath).toBe('src/big.ts');

    // Exactly one full-content write, and ONLY the changed region differs.
    expect(writeFile).toHaveBeenCalledTimes(1);

    const expected = original.replace('line 300\n', 'line THREE-HUNDRED\n');
    expect(writeFile).toHaveBeenCalledWith('src/big.ts', expected, { streaming: false });
    expect(files.get('src/big.ts')).toBe(expected);

    // Assert ONLY the changed region differs from the original.
    const origLines = original.split('\n');
    const newLines = (files.get('src/big.ts') as string).split('\n');
    expect(newLines.length).toBe(origLines.length);

    const changedIndexes = origLines.reduce<number[]>((acc, line, idx) => {
      if (line !== newLines[idx]) {
        acc.push(idx);
      }

      return acc;
    }, []);
    expect(changedIndexes).toEqual([299]);
    expect(newLines[299]).toBe('line THREE-HUNDRED');

    // project-doctor reconcile ran AFTER the write, on the applied full content.
    expect(applyEntryExportReconcileMock).toHaveBeenCalledTimes(1);
    expect(applyEntryExportReconcileMock.mock.calls[0][1]).toBe('src/big.ts');

    // Render surface metadata (drives DiffActionRow): applied with a +1/−1 pill.
    const state = runner.actions.get()[diffAction!.actionId];
    expect(state?.status).toBe('complete');
    expect(state?.diffApply).toMatchObject({
      status: 'applied',
      blockCount: 1,
      addedLines: 1,
      removedLines: 1,
      hunkCount: 1,
    });

    // Telemetry fired exactly once with a positive estimated token saving.
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]).toMatchObject({
      filePath: 'src/big.ts',
      outcome: 'applied',
      fellBackToFullFile: false,
      hunkStatuses: ['applied-exact'],
    });
    expect(telemetry[0].estimatedTokensSaved).toBeGreaterThan(0);
  });
});

describe('diff-edit e2e pipeline — BASE-DRIFT FALLBACK (anchor not present)', () => {
  it('writes nothing, leaves the file byte-identical, alerts, and render meta shows the failure (not silent)', async () => {
    const original = 'const answer = 41;\n';
    const { runtime, files, writeFile } = createStatefulRuntime({ 'src/answer.ts': original });

    const onAlert = vi.fn();
    const runner = new ActionRunner(runtime, () => createShell() as any, onAlert);

    const telemetry: WorkspaceEventMap['agent:diff-edit:apply'][] = [];
    const unsubscribe = workspaceEvents.on('agent:diff-edit:apply', (payload) => telemetry.push(payload));

    const message = [
      '<boltArtifact id="patch-drift" title="Patch">',
      '<boltAction type="diff" filePath="src/answer.ts">',
      '<<<<<<< SEARCH',
      'const answer = 99;',
      '=======',
      'const answer = 42;',
      '>>>>>>> REPLACE',
      '</boltAction>',
      '</boltArtifact>',
    ].join('\n');

    const closeData = await driveAssistantMessage(runner, 'msg-drift', message);
    unsubscribe();

    // Fail-safe: nothing written, base byte-identical, reconcile never ran.
    expect(writeFile).not.toHaveBeenCalled();
    expect(files.get('src/answer.ts')).toBe(original);
    expect(applyEntryExportReconcileMock).not.toHaveBeenCalled();

    // The failure is visible, not silent: alert raised…
    expect(onAlert).toHaveBeenCalledTimes(1);
    expect(onAlert.mock.calls[0][0]).toMatchObject({ type: 'warning', title: 'Diff could not be applied' });
    expect(onAlert.mock.calls[0][0].description).toContain('src/answer.ts');

    // …and the render surface metadata records the failure so DiffActionRow shows it.
    const diffAction = closeData.find((d) => d.action.type === 'diff');
    const state = runner.actions.get()[diffAction!.actionId];
    expect(state?.diffApply).toMatchObject({ status: 'failed', failureKind: 'apply-failed' });

    // Telemetry recorded the fallback with no claimed saving.
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]).toMatchObject({
      outcome: 'failed',
      fellBackToFullFile: true,
      failureKind: 'apply-failed',
      estimatedTokensSaved: 0,
    });
  });

  /*
   * Measured live: a diff whose TARGET FILE DOES NOT EXIST ("diff target … does
   * not exist — full file required") must still emit the fallback telemetry, so
   * the most interesting cases (fail-safes) are countable and never silent. This
   * is the `missing-file` sibling of the `apply-failed` test above.
   */
  it('emits fallback telemetry when the diff target file does not exist (missing-file)', async () => {
    // No src/App.tsx in the runtime — the diff has no base to patch.
    const { runtime, files, writeFile } = createStatefulRuntime({ 'src/other.ts': 'export const x = 1;\n' });

    const onAlert = vi.fn();
    const runner = new ActionRunner(runtime, () => createShell() as any, onAlert);

    const telemetry: WorkspaceEventMap['agent:diff-edit:apply'][] = [];
    const unsubscribe = workspaceEvents.on('agent:diff-edit:apply', (payload) => telemetry.push(payload));

    const message = [
      '<boltArtifact id="patch-missing" title="Patch">',
      '<boltAction type="diff" filePath="src/App.tsx">',
      '<<<<<<< SEARCH',
      '<footer />',
      '=======',
      '<footer>© 2026</footer>',
      '>>>>>>> REPLACE',
      '</boltAction>',
      '</boltArtifact>',
    ].join('\n');

    await driveAssistantMessage(runner, 'msg-missing', message);
    unsubscribe();

    // Strict fail-safe: nothing written, no new file created from a diff.
    expect(writeFile).not.toHaveBeenCalled();
    expect(files.has('src/App.tsx')).toBe(false);

    // The fallback IS observable — one telemetry event with the missing-file kind.
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]).toMatchObject({
      outcome: 'failed',
      fellBackToFullFile: true,
      failureKind: 'missing-file',
      estimatedTokensSaved: 0,
    });
  });
});

describe('diff-edit e2e pipeline — MIXED MESSAGE (file + diff in one message)', () => {
  it('handles a new type="file" and an editing type="diff" together, byte-identical paths', async () => {
    // helpers.ts exists and will be edited by the diff; config.ts is created new by the file action.
    const { runtime, files, writeFile } = createStatefulRuntime({
      'src/helpers.ts': 'export const version = 1;\n',
    });

    const runner = new ActionRunner(runtime, () => createShell() as any);

    const message = [
      'Creating a config and patching helpers in one go.',
      '',
      '<boltArtifact id="mixed" title="Mixed edit">',
      '<boltAction type="file" filePath="src/config.ts">',
      'export const config = { debug: false };',
      '</boltAction>',
      '<boltAction type="diff" filePath="src/helpers.ts">',
      '<<<<<<< SEARCH',
      'export const version = 1;',
      '=======',
      'export const version = 2;',
      '>>>>>>> REPLACE',
      '</boltAction>',
      '</boltArtifact>',
    ].join('\n');

    const closeData = await driveAssistantMessage(runner, 'msg-mixed', message);

    const fileAction = closeData.find((d) => d.action.type === 'file');
    const diffAction = closeData.find((d) => d.action.type === 'diff');
    expect(fileAction).toBeDefined();
    expect(diffAction).toBeDefined();

    // Both file paths are byte-identical to what the model emitted.
    expect(fileAction!.action.filePath).toBe('src/config.ts');
    expect(diffAction!.action.filePath).toBe('src/helpers.ts');

    /*
     * The new file landed via the full-content path (the file pipeline may add a
     * trailing newline — that's normal full-file behavior, unrelated to the diff).
     */
    expect(files.get('src/config.ts')?.trimEnd()).toBe('export const config = { debug: false };');

    // …and the existing file was patched via the diff path.
    expect(files.get('src/helpers.ts')).toBe('export const version = 2;\n');

    // Two writes total (one per action), each a complete buffer.
    const writtenPaths = writeFile.mock.calls.map((call) => call[0]);
    expect(writtenPaths).toContain('src/config.ts');
    expect(writtenPaths).toContain('src/helpers.ts');

    // The diff carries applied render metadata; the file action does not.
    const diffState = runner.actions.get()[diffAction!.actionId];
    expect(diffState?.diffApply).toMatchObject({ status: 'applied', addedLines: 1, removedLines: 1 });

    const fileState = runner.actions.get()[fileAction!.actionId];
    expect(fileState?.diffApply).toBeUndefined();

    // Reconcile ran for each written file.
    expect(applyEntryExportReconcileMock).toHaveBeenCalledTimes(2);
  });
});

describe('diff-edit threshold — single source of truth', () => {
  const cwd = '/home/project';
  const sb = { isConnected: false, hasSelectedProject: false } as const;

  it('interpolates DIFF_EDIT_MIN_LINES into every prompt variant (no hardcoded literal drift)', () => {
    const variants = [
      getFineTunedPrompt(cwd, sb),
      getSystemPrompt(cwd, sb),
      getOptimizedPrompt({ cwd, allowedHtmlElements: ['div'], modificationTagName: 'mods', supabase: sb }),
    ];

    for (const prompt of variants) {
      // The concrete value from the single-source constant appears verbatim…
      expect(prompt).toContain(`~${DIFF_EDIT_MIN_LINES} lines`);

      // …and the raw template placeholder never leaks (interpolation happened).
      expect(prompt).not.toContain('${DIFF_EDIT_MIN_LINES}');
    }
  });
});
