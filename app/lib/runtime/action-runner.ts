import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { atom, map, type MapStore } from 'nanostores';
import { buildSelfRepairPrompt, validateAndFormatHunk, type HunkValidationError } from './hunk-validate';
import type { ActionCallbackData } from './message-parser';
import { workspaceEvents } from './workspace-events';
import type { ActionAlert, BoltAction, DeployAlert, FileHistory, SupabaseAction, SupabaseAlert } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { path as nodePath } from '~/utils/path';
import { JsonValidationError, sanitizeFileContent } from '~/utils/sanitize-file-content';
import type { BoltShell } from '~/utils/shell';
import { unreachable } from '~/utils/unreachable';

const logger = createScopedLogger('ActionRunner');
const TOOL_TIMEOUT_MS = 60_000;
const FILE_TOOL_TIMEOUT_MS = 120_000;

/*
 * Dependency installs (and other package-manager work) routinely run well past
 * the 60s generic tool budget on a cold workspace. When the install action hit
 * that ceiling it was declared timed-out *while npm was still running in the
 * terminal*; the next action's executeCommand() then sent Ctrl+C (\x03) to
 * reclaim the prompt and killed the half-finished install — so the dev server
 * started before node_modules existed, never bound a port, and the preview
 * stayed blank with the workspace stuck on "starting". Give these commands a
 * realistic budget so they finish before the next action can interrupt them.
 */
const INSTALL_TOOL_TIMEOUT_MS = 300_000;
const TOOL_MAX_ATTEMPTS = 3;
const TOOL_RETRY_BASE_DELAY_MS = 250;

/*
 * Phase 0 #2 — AST self-repair retry budget. When pre-write validation
 * (validateAndFormatHunk) flags a parse error, we ask the same LLM to
 * regenerate the file via /api/agent/self-repair and re-validate. Capped
 * at 2 attempts to avoid runaway cost and a poor UX: a third bad
 * generation almost always means the model is stuck on a misunderstanding
 * that no extra round trip is going to fix.
 */
const SELF_REPAIR_MAX_ATTEMPTS = 2;
const SELF_REPAIR_BASE_DELAY_MS = 1_000;
const SELF_REPAIR_ENDPOINT = '/api/agent/self-repair';

const BOLT_ACTION_CONTENT_PATTERN = /<boltAction\b[^>]*>([\s\S]*?)<\/boltAction>/;

/**
 * Extract the file content from a self-repair LLM response. The prompt
 * asks the model to wrap the corrected file in a single boltAction tag,
 * but we keep a verbatim fallback for the rare model that ignores the
 * formatting hint — better to write a slightly wrappy file than to drop
 * an otherwise-valid correction.
 */
export function extractSelfRepairContent(raw: string): string {
  const match = raw.match(BOLT_ACTION_CONTENT_PATTERN);

  if (match && typeof match[1] === 'string') {
    return match[1].replace(/^\n/, '').replace(/\n\s*$/, '');
  }

  return raw;
}

/*
 * Heuristic: does this shell command install dependencies (or otherwise run
 * long enough that the generic 60s tool budget would cut it off)? Matches the
 * package managers we support across npm/pnpm/yarn/bun, including `npm ci` and
 * `add`. Kept deliberately conservative — a false negative just falls back to
 * the normal timeout; a false positive only grants a longer budget to a
 * command that was going to be quick anyway.
 */
const INSTALL_COMMAND_PATTERN =
  /(^|[\s;&|])(?:(?:npm|pnpm|yarn|bun)\s+(?:install|i|ci|add)|(?:npx|pnpm\s+dlx|bunx)\s)/i;

export function isLongRunningInstallCommand(command: string): boolean {
  return INSTALL_COMMAND_PATTERN.test(command.trim());
}

async function callSelfRepairEndpoint(prompt: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(SELF_REPAIR_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ prompt }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`self-repair endpoint returned ${response.status}`);
  }

  const payload = (await response.json()) as { content?: unknown; error?: unknown };

  if (typeof payload.content !== 'string' || payload.content.length === 0) {
    throw new Error('self-repair endpoint returned empty content');
  }

  return extractSelfRepairContent(payload.content);
}

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
  startedAt?: number;
  finishedAt?: number;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed' | 'startedAt' | 'finishedAt'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

class ActionCommandError extends Error {
  readonly _output: string;
  readonly _header: string;

  constructor(message: string, output: string) {
    // Create a formatted message that includes both the error message and output
    const formattedMessage = `Failed To Execute Shell Command: ${message}\n\nOutput:\n${output}`;
    super(formattedMessage);

    // Set the output separately so it can be accessed programmatically
    this._header = message;
    this._output = output;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, ActionCommandError.prototype);

    // Set the name of the error for better debugging
    this.name = 'ActionCommandError';
  }

  // Optional: Add a method to get just the terminal output
  get output() {
    return this._output;
  }
  get header() {
    return this._header;
  }
}

class ToolTimeoutError extends Error {
  constructor(actionType: ActionState['type'], timeoutMs: number) {
    super(`${actionType} action timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    this.name = 'ToolTimeoutError';
    Object.setPrototypeOf(this, ToolTimeoutError.prototype);
  }
}

export class ActionRunner {
  #runtime: RuntimeAdapter;
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #shellTerminal: () => BoltShell;
  runnerId = atom<string>(`${Date.now()}`);
  actions: ActionsMap = map({});
  onAlert?: (alert: ActionAlert) => void;
  onSupabaseAlert?: (alert: SupabaseAlert) => void;
  onDeployAlert?: (alert: DeployAlert) => void;
  buildOutput?: { path: string; exitCode: number; output: string };
  #actionWatchdogs = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    runtime: RuntimeAdapter,
    getShellTerminal: () => BoltShell,
    onAlert?: (alert: ActionAlert) => void,
    onSupabaseAlert?: (alert: SupabaseAlert) => void,
    onDeployAlert?: (alert: DeployAlert) => void,
  ) {
    this.#runtime = runtime;
    this.#shellTerminal = getShellTerminal;
    this.onAlert = onAlert;
    this.onSupabaseAlert = onSupabaseAlert;
    this.onDeployAlert = onDeployAlert;
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(actionId, {
      ...data.action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    this.#currentExecutionPromise
      .then(() => {
        const current = this.actions.get()[actionId];

        if (!current || current.executed || current.status === 'complete' || current.status === 'failed') {
          return;
        }

        this.#updateAction(actionId, { status: 'running' });
      })
      .catch(() => {
        // failures are surfaced via the action's own status; avoid an unhandled rejection here
      });
  }

  abortAll() {
    const actions = this.actions.get();

    Object.entries(actions).forEach(([actionId, action]) => {
      if (action.status === 'complete' || action.status === 'failed' || action.status === 'aborted') {
        return;
      }

      action.abort();
      this.#updateAction(actionId, { status: 'aborted' });
    });
  }

  skipAction(actionId: string) {
    const action = this.actions.get()[actionId];

    if (!action) {
      return;
    }

    this.#updateAction(actionId, { status: 'complete', executed: true });
  }

  async waitForIdle() {
    await this.#currentExecutionPromise;
  }

  async runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { actionId } = data;
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      return; // No return value here
    }

    if (isStreaming && action.type !== 'file') {
      return; // No return value here
    }

    this.#updateAction(actionId, { ...action, ...data.action, executed: !isStreaming });

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(actionId, isStreaming);
      })
      .catch((error) => {
        logger.error('Action execution promise failed:', error);
      });

    await this.#currentExecutionPromise;

    return;
  }

  async #executeAction(actionId: string, isStreaming: boolean = false) {
    const action = this.actions.get()[actionId];

    this.#updateAction(actionId, { status: 'running' });

    try {
      await this.#runActionWithRetry(action, async () => {
        switch (action.type) {
          case 'shell': {
            await this.#runShellAction(action);
            break;
          }
          case 'file': {
            await this.#runFileAction(action);
            break;
          }
          case 'supabase': {
            await this.handleSupabaseAction(action as SupabaseAction);
            break;
          }
          case 'build': {
            // Clear any stale output from a previous build so a failed rebuild can't reuse it
            this.buildOutput = undefined;

            const buildOutput = await this.#runBuildAction(action);

            // Store build output for deployment
            this.buildOutput = buildOutput;
            break;
          }
          case 'start': {
            // making the start app non blocking

            this.#runStartAction(action)
              .then(() => this.#updateAction(actionId, { status: 'complete' }))
              .catch((err: Error) => {
                if (action.abortSignal.aborted) {
                  return;
                }

                this.#updateAction(actionId, { status: 'failed', error: this.#formatActionError(err) });
                logger.error(`[${action.type}]:Action failed\n\n`, err);

                if (!(err instanceof ActionCommandError)) {
                  return;
                }

                this.onAlert?.({
                  type: 'error',
                  title: 'Dev Server Failed',
                  description: err.header,
                  content: err.output,
                });
              });

            /*
             * adding a delay to avoid any race condition between 2 start actions
             * i am up for a better approach
             */
            await new Promise((resolve) => setTimeout(resolve, 2000));

            return;
          }
          default: {
            /*
             * An action type the runner doesn't handle (e.g. a new/typo'd type
             * from the model) must not fall through and get marked "complete" —
             * that silently drops a file write or command. Surface it as a
             * failure so the user sees something went wrong.
             */
            throw new Error(`Unsupported action type: ${String((action as { type?: unknown }).type ?? 'unknown')}`);
          }
        }
      });

      this.#updateAction(actionId, {
        status: isStreaming ? 'running' : action.abortSignal.aborted ? 'aborted' : 'complete',
      });
    } catch (error) {
      if (action.abortSignal.aborted) {
        return;
      }

      this.#updateAction(actionId, { status: 'failed', error: this.#formatActionError(error) });
      logger.error(`[${action.type}]:Action failed\n\n`, error);

      if (!(error instanceof ActionCommandError)) {
        return;
      }

      this.onAlert?.({
        type: 'error',
        title: 'Dev Server Failed',
        description: error.header,
        content: error.output,
      });

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }

  async #runActionWithRetry(action: ActionState, operation: () => Promise<void>) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= TOOL_MAX_ATTEMPTS; attempt++) {
      if (action.abortSignal.aborted) {
        return;
      }

      try {
        await this.#withTimeout(action, operation());
        return;
      } catch (error) {
        lastError = error;

        if (action.abortSignal.aborted || error instanceof ActionCommandError || error instanceof ToolTimeoutError) {
          throw error;
        }

        if (attempt >= TOOL_MAX_ATTEMPTS) {
          throw error;
        }

        const delayMs = TOOL_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        logger.warn(
          `[${action.type}]:Action attempt ${attempt} failed; retrying in ${delayMs}ms`,
          error instanceof Error ? error.message : error,
        );
        await this.#delay(delayMs);
      }
    }

    throw lastError;
  }

  async #withTimeout<T>(action: ActionState, promise: Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutMs = this.#timeoutMsForAction(action);

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        /*
         * If the action was already aborted, the underlying promise is settling on
         * its own; surfacing a timeout here would mask the abort with a misleading
         * "timed out" error and defeat the retry/abort handling upstream.
         */
        if (action.abortSignal.aborted) {
          return;
        }

        reject(new ToolTimeoutError(action.type, timeoutMs));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async #delay(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  #timeoutMsForAction(action: Pick<ActionState, 'type'> & Partial<Pick<ActionState, 'content'>>) {
    if (action.type === 'file') {
      return FILE_TOOL_TIMEOUT_MS;
    }

    if (action.type === 'shell' && typeof action.content === 'string' && isLongRunningInstallCommand(action.content)) {
      return INSTALL_TOOL_TIMEOUT_MS;
    }

    return TOOL_TIMEOUT_MS;
  }

  #formatActionError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Action failed';
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }

    // Pre-validate command for common issues
    const validationResult = await this.#validateShellCommand(action.content);

    if (validationResult.shouldModify && validationResult.modifiedCommand) {
      logger.debug(`Modified command: ${action.content} -> ${validationResult.modifiedCommand}`);
      action.content = validationResult.modifiedCommand;
    }

    const resp = await shell.executeCommand(this.runnerId.get(), action.content, () => {
      logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
      action.abort();
    });
    logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

    if (!resp || resp.exitCode !== 0) {
      const enhancedError = this.#createEnhancedShellError(
        action.content,
        resp?.exitCode ?? 1,
        resp?.output ?? 'No response from shell',
      );
      throw new ActionCommandError(enhancedError.title, enhancedError.details);
    }
  }

  async #runStartAction(action: ActionState) {
    if (action.type !== 'start') {
      unreachable('Expected shell action');
    }

    if (!this.#shellTerminal) {
      unreachable('Shell terminal not found');
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }

    const resp = await shell.executeCommand(this.runnerId.get(), action.content, () => {
      logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
      action.abort();
    });
    logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

    if (resp?.exitCode != 0) {
      throw new ActionCommandError('Failed To Start Application', resp?.output || 'No Output Available');
    }

    return resp;
  }

  async #runFileAction(action: ActionState) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    const relativePath = this.#toRuntimePath(action.filePath);

    let folder = nodePath.dirname(relativePath);

    // remove trailing slashes
    folder = folder.replace(/\/+$/g, '');

    if (folder !== '.') {
      try {
        await this.#runtime.createDirectory(folder);
        logger.debug('Created folder', folder);
      } catch (error) {
        logger.error('Failed to create folder\n\n', error);
        throw error;
      }
    }

    let payload: string;

    try {
      const sanitized = sanitizeFileContent(action.content, relativePath);

      if (sanitized.stripped > 0) {
        logger.warn(`Sanitized ${sanitized.stripped} stray control characters from ${relativePath} before writing`);
      }

      payload = sanitized.sanitized;
    } catch (error) {
      if (error instanceof JsonValidationError) {
        logger.error(error.message);
      } else {
        logger.error('Failed to sanitize file content\n\n', error);
      }

      throw error;
    }

    /*
     * Phase 0 #2 — pre-write AST validation + self-repair retry loop. For
     * JS/TS/JSX/TSX/JSON we parse the proposed content; on a parse error
     * we ask the same LLM (via /api/agent/self-repair) to regenerate the
     * file with the error in context, then re-validate. Up to
     * SELF_REPAIR_MAX_ATTEMPTS retries with an exponential delay so a
     * transient provider hiccup doesn't escalate to a burst of calls. If
     * we exhaust the budget the original (broken) payload is written
     * anyway — the user can still edit it in place — and the failure is
     * surfaced through the workspace log and the patch-review banner.
     */
    payload = await this.#repairWithSelfRepairLoop(relativePath, payload);

    try {
      await this.#runtime.writeFile(relativePath, payload);
      logger.debug(`File written ${relativePath}`);
    } catch (error) {
      logger.error('Failed to write file\n\n', error);
      throw error;
    }
  }

  async #repairWithSelfRepairLoop(relativePath: string, initialPayload: string): Promise<string> {
    let payload = initialPayload;
    let validation: Awaited<ReturnType<typeof validateAndFormatHunk>>;

    try {
      validation = await validateAndFormatHunk(relativePath, payload);
    } catch (error) {
      logger.warn(`Pre-write validation crashed for ${relativePath}; continuing with sanitized payload`, error);
      return payload;
    }

    if (validation.kind === 'ok') {
      return validation.formatted !== payload ? validation.formatted : payload;
    }

    if (validation.kind === 'skipped') {
      return payload;
    }

    let lastError: HunkValidationError = validation;

    for (let attempt = 1; attempt <= SELF_REPAIR_MAX_ATTEMPTS; attempt += 1) {
      workspaceEvents.emit('agent:self-repair:progress', {
        filePath: relativePath,
        status: {
          attempt,
          maxAttempts: SELF_REPAIR_MAX_ATTEMPTS,
          errorMessage: lastError.message,
        },
      });

      if (attempt > 1) {
        const delay = SELF_REPAIR_BASE_DELAY_MS * 2 ** (attempt - 2);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const prompt = buildSelfRepairPrompt(relativePath, payload, lastError);
        const corrected = await callSelfRepairEndpoint(prompt);
        const reValidation = await validateAndFormatHunk(relativePath, corrected);

        if (reValidation.kind === 'ok') {
          workspaceEvents.emit('agent:self-repair:progress', { filePath: relativePath, status: null });
          return reValidation.formatted;
        }

        if (reValidation.kind === 'skipped') {
          workspaceEvents.emit('agent:self-repair:progress', { filePath: relativePath, status: null });
          return corrected;
        }

        lastError = reValidation;
        payload = corrected;
      } catch (error) {
        logger.warn(`Self-repair attempt ${attempt}/${SELF_REPAIR_MAX_ATTEMPTS} for ${relativePath} failed:`, error);

        if (attempt === SELF_REPAIR_MAX_ATTEMPTS) {
          break;
        }
      }
    }

    /*
     * Out of retries — keep the broken-but-most-recent payload so the user
     * can still see / edit the file. Log + clear the UI banner.
     */
    logger.warn(
      `Self-repair exhausted ${SELF_REPAIR_MAX_ATTEMPTS} retries for ${relativePath} (${lastError.language}); writing best-effort payload`,
    );
    workspaceEvents.emit('agent:self-repair:progress', { filePath: relativePath, status: null });

    return payload;
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();
    const current = actions[id];
    const merged = { ...current, ...newState } as ActionState;

    if (newState.status && newState.status !== current?.status) {
      const now = Date.now();

      if (newState.status === 'running' && !merged.startedAt) {
        merged.startedAt = now;
      }

      const terminal = newState.status === 'complete' || newState.status === 'failed' || newState.status === 'aborted';

      if (terminal && !merged.finishedAt) {
        merged.finishedAt = now;
      }
    }

    this.actions.setKey(id, merged);

    if (merged.status === 'running') {
      this.#scheduleActionWatchdog(id);
    } else {
      this.#clearActionWatchdog(id);
    }
  }

  #scheduleActionWatchdog(actionId: string) {
    this.#clearActionWatchdog(actionId);

    const initialAction = this.actions.get()[actionId];
    const timeoutMs = initialAction ? this.#timeoutMsForAction(initialAction) : TOOL_TIMEOUT_MS;

    const timeoutId = setTimeout(() => {
      const action = this.actions.get()[actionId];

      if (!action || action.status !== 'running') {
        return;
      }

      const error = new ToolTimeoutError(action.type, timeoutMs);
      logger.error(`[${action.type}]:Action timed out`, error);
      this.#updateAction(actionId, {
        status: 'failed',
        error: error.message,
      });
    }, timeoutMs);

    this.#actionWatchdogs.set(actionId, timeoutId);
  }

  #clearActionWatchdog(actionId: string) {
    const timeoutId = this.#actionWatchdogs.get(actionId);

    if (!timeoutId) {
      return;
    }

    clearTimeout(timeoutId);
    this.#actionWatchdogs.delete(actionId);
  }

  async getFileHistory(filePath: string): Promise<FileHistory | null> {
    try {
      const historyPath = this.#getHistoryPath(filePath);
      const content = await this.#runtime.readFile(historyPath);

      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to get file history:', error);
      return null;
    }
  }

  async saveFileHistory(filePath: string, history: FileHistory) {
    const historyPath = this.#getHistoryPath(filePath);

    await this.#runFileAction({
      type: 'file',
      filePath: historyPath,
      content: JSON.stringify(history),
      changeSource: 'auto-save',
    } as any);
  }

  #getHistoryPath(filePath: string) {
    return nodePath.join('.history', filePath);
  }

  async #runBuildAction(action: ActionState) {
    if (action.type !== 'build') {
      unreachable('Expected build action');
    }

    // Trigger build started alert
    this.onDeployAlert?.({
      type: 'info',
      title: 'Building Application',
      description: 'Building your application...',
      stage: 'building',
      buildStatus: 'running',
      deployStatus: 'pending',
      source: 'netlify',
    });

    const { exitCode, output } = await this.#runtime.runCommand({ command: 'npm', args: ['run', 'build'] });

    let buildDir = '';

    if (exitCode !== 0) {
      const buildResult = {
        path: buildDir,
        exitCode,
        output,
      };

      this.buildOutput = buildResult;

      // Trigger build failed alert
      this.onDeployAlert?.({
        type: 'error',
        title: 'Build Failed',
        description: 'Your application build failed',
        content: output || 'No build output available',
        stage: 'building',
        buildStatus: 'failed',
        deployStatus: 'pending',
        source: 'netlify',
      });

      throw new ActionCommandError('Build Failed', output || 'No Output Available');
    }

    // Trigger build success alert
    this.onDeployAlert?.({
      type: 'success',
      title: 'Build Completed',
      description: 'Your application was built successfully',
      stage: 'deploying',
      buildStatus: 'complete',
      deployStatus: 'running',
      source: 'netlify',
    });

    // Check for common build directories
    const commonBuildDirs = ['dist', 'build', 'out', 'output', '.next', 'public'];

    // Try to find the first existing build directory
    for (const dir of commonBuildDirs) {
      const dirPath = nodePath.join(this.#runtime.workdir, dir);

      try {
        await this.#runtime.listFiles(dir);
        buildDir = dirPath;
        break;
      } catch {
        continue;
      }
    }

    // If no build directory was found, use the default (dist)
    if (!buildDir) {
      buildDir = nodePath.join(this.#runtime.workdir, 'dist');
    }

    const buildResult = {
      path: buildDir,
      exitCode,
      output,
    };

    this.buildOutput = buildResult;

    return buildResult;
  }
  async handleSupabaseAction(action: SupabaseAction) {
    const { operation, content, filePath } = action;
    logger.debug('[Supabase Action]:', { operation, filePath, content });

    switch (operation) {
      case 'migration':
        if (!filePath) {
          throw new Error('Migration requires a filePath');
        }

        // Show alert for migration action
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Migration',
          description: `Create migration file: ${filePath}`,
          content,
          source: 'supabase',
        });

        // Only create the migration file
        await this.#runFileAction({
          type: 'file',
          filePath,
          content,
          changeSource: 'supabase',
        } as any);
        return { success: true };

      case 'query': {
        // Always show the alert and let the SupabaseAlert component handle connection state
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Query',
          description: 'Execute database query',
          content,
          source: 'supabase',
        });

        // The actual execution will be triggered from SupabaseChatAlert
        return { pending: true };
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  // Add this method declaration to the class
  handleDeployAction(
    stage: 'building' | 'deploying' | 'complete',
    status: ActionStatus,
    details?: {
      url?: string;
      error?: string;
      source?: 'netlify' | 'vercel' | 'github' | 'gitlab';
    },
  ): void {
    if (!this.onDeployAlert) {
      logger.debug('No deploy alert handler registered');
      return;
    }

    const alertType = status === 'failed' ? 'error' : status === 'complete' ? 'success' : 'info';

    const title =
      stage === 'building'
        ? 'Building Application'
        : stage === 'deploying'
          ? 'Deploying Application'
          : 'Deployment Complete';

    const description =
      status === 'failed'
        ? `${stage === 'building' ? 'Build' : 'Deployment'} failed`
        : status === 'running'
          ? `${stage === 'building' ? 'Building' : 'Deploying'} your application...`
          : status === 'complete'
            ? `${stage === 'building' ? 'Build' : 'Deployment'} completed successfully`
            : `Preparing to ${stage === 'building' ? 'build' : 'deploy'} your application`;

    const buildStatus =
      stage === 'building' ? status : stage === 'deploying' || stage === 'complete' ? 'complete' : 'pending';

    const deployStatus = stage === 'building' ? 'pending' : status;

    this.onDeployAlert({
      type: alertType,
      title,
      description,
      content: details?.error || '',
      url: details?.url,
      stage,
      buildStatus: buildStatus as any,
      deployStatus: deployStatus as any,
      source: details?.source || 'netlify',
    });
  }

  async #validateShellCommand(command: string): Promise<{
    shouldModify: boolean;
    modifiedCommand?: string;
    warning?: string;
  }> {
    const trimmedCommand = command.trim();

    // Handle rm commands that might fail due to missing files
    if (trimmedCommand.startsWith('rm ') && !trimmedCommand.includes(' -f')) {
      const rmMatch = trimmedCommand.match(/^rm\s+(.+)$/);

      if (rmMatch) {
        const filePaths = rmMatch[1].split(/\s+/);

        // Check if any of the files exist using the active runtime adapter.
        try {
          const existingFiles = [];

          for (const filePath of filePaths) {
            if (filePath.startsWith('-')) {
              continue;
            } // Skip flags

            try {
              await this.#runtime.readFile(filePath);
              existingFiles.push(filePath);
            } catch {
              // File doesn't exist, skip it
            }
          }

          if (existingFiles.length === 0) {
            // No files exist, modify command to use -f flag to avoid error
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as target files do not exist',
            };
          } else if (existingFiles.length < filePaths.length) {
            // Some files don't exist, modify to only remove existing ones with -f for safety
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as some target files do not exist',
            };
          }
        } catch (error) {
          logger.debug('Could not validate rm command files:', error);
        }
      }
    }

    // Handle cd commands to non-existent directories
    if (trimmedCommand.startsWith('cd ')) {
      const cdMatch = trimmedCommand.match(/^cd\s+(.+)$/);

      if (cdMatch) {
        const targetDir = cdMatch[1].trim();

        try {
          await this.#runtime.listFiles(targetDir);
        } catch {
          return {
            shouldModify: true,
            modifiedCommand: `mkdir -p ${targetDir} && cd ${targetDir}`,
            warning: 'Directory does not exist, created it first',
          };
        }
      }
    }

    // Handle cp/mv commands with missing source files
    if (trimmedCommand.match(/^(cp|mv)\s+/)) {
      const parts = trimmedCommand.split(/\s+/);

      if (parts.length >= 3) {
        const sourceFile = parts[1];

        try {
          await this.#runtime.readFile(sourceFile);
        } catch {
          return {
            shouldModify: false,
            warning: `Source file '${sourceFile}' does not exist`,
          };
        }
      }
    }

    return { shouldModify: false };
  }

  #createEnhancedShellError(
    command: string,
    exitCode: number | undefined,
    output: string | undefined,
  ): {
    title: string;
    details: string;
  } {
    const trimmedCommand = command.trim();
    const firstWord = trimmedCommand.split(/\s+/)[0];

    // Common error patterns and their explanations
    const errorPatterns = [
      {
        pattern: /cannot remove.*No such file or directory/,
        title: 'File Not Found',
        getMessage: () => {
          const fileMatch = output?.match(/'([^']+)'/);
          const fileName = fileMatch ? fileMatch[1] : 'file';

          return `The file '${fileName}' does not exist and cannot be removed.\n\nSuggestion: Use 'ls' to check what files exist, or use 'rm -f' to ignore missing files.`;
        },
      },
      {
        pattern: /No such file or directory/,
        title: 'File or Directory Not Found',
        getMessage: () => {
          if (trimmedCommand.startsWith('cd ')) {
            const dirMatch = trimmedCommand.match(/cd\s+(.+)/);
            const dirName = dirMatch ? dirMatch[1] : 'directory';

            return `The directory '${dirName}' does not exist.\n\nSuggestion: Use 'mkdir -p ${dirName}' to create it first, or check available directories with 'ls'.`;
          }

          return `The specified file or directory does not exist.\n\nSuggestion: Check the path and use 'ls' to see available files.`;
        },
      },
      {
        pattern: /Permission denied/,
        title: 'Permission Denied',
        getMessage: () =>
          `Permission denied for '${firstWord}'.\n\nSuggestion: The file may not be executable. Try 'chmod +x filename' first.`,
      },
      {
        pattern: /command not found/,
        title: 'Command Not Found',
        getMessage: () =>
          `The command '${firstWord}' is not available in the active runtime.\n\nSuggestion: Check available commands or use a package manager to install it.`,
      },
      {
        pattern: /Is a directory/,
        title: 'Target is a Directory',
        getMessage: () =>
          `Cannot perform this operation - target is a directory.\n\nSuggestion: Use 'ls' to list directory contents or add appropriate flags.`,
      },
      {
        pattern: /File exists/,
        title: 'File Already Exists',
        getMessage: () => `File already exists.\n\nSuggestion: Use a different name or add '-f' flag to overwrite.`,
      },
    ];

    // Try to match known error patterns
    for (const errorPattern of errorPatterns) {
      if (output && errorPattern.pattern.test(output)) {
        return {
          title: errorPattern.title,
          details: errorPattern.getMessage(),
        };
      }
    }

    // Generic error with suggestions based on command type
    let suggestion = '';

    if (trimmedCommand.startsWith('npm ')) {
      suggestion = '\n\nSuggestion: Try running "npm install" first or check package.json.';
    } else if (trimmedCommand.startsWith('git ')) {
      suggestion = "\n\nSuggestion: Check if you're in a git repository or if remote is configured.";
    } else if (trimmedCommand.match(/^(ls|cat|rm|cp|mv)/)) {
      suggestion = '\n\nSuggestion: Check file paths and use "ls" to see available files.';
    }

    return {
      title: `Command Failed (exit code: ${exitCode})`,
      details: `Command: ${trimmedCommand}\n\nOutput: ${output || 'No output available'}${suggestion}`,
    };
  }

  #toRuntimePath(filePath: string) {
    if (filePath.startsWith(`${this.#runtime.workdir}/`)) {
      return filePath.slice(this.#runtime.workdir.length + 1);
    }

    return filePath.replace(/^\/+/, '');
  }
}
