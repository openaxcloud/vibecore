import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { atom, map, type MapStore } from 'nanostores';
import { applyEntryExportReconcile } from './entry-export-reconcile';
import { ensureEntryImportsResolvable } from './entry-placeholder';
import { buildSelfRepairPrompt, validateAndFormatHunk, type HunkValidationError } from './hunk-validate';
import type { ActionCallbackData } from './message-parser';
import { hasInstalledPreviewDependencies, type PreviewPackageManifest } from './preview-dependencies';
import { workspaceEvents } from './workspace-events';
import { formatActionRunnerCopy, getActionRunnerCopy, type ActionRunnerKey } from '~/lib/i18n/catalogs/action-runner';
import { getI18nInstance } from '~/lib/i18n/runtime';
import type {
  ActionAlert,
  BoltAction,
  DeployAlert,
  DiffAction,
  DiffApplyMeta,
  FileHistory,
  SupabaseAction,
  SupabaseAlert,
} from '~/types/actions';
import { buildReviewableDiffHunks, summarizeReviewableDiffHunks } from '~/utils/diff';
import { createScopedLogger } from '~/utils/logger';
import { path as nodePath } from '~/utils/path';
import { JsonValidationError, sanitizeFileContent } from '~/utils/sanitize-file-content';
import {
  applySearchReplace,
  estimateDiffTokenSaving,
  parseSearchReplaceBlocks,
  type HunkResult,
} from '~/utils/search-replace';
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

/*
 * Real project builds (bundlers, type-checking, asset pipelines) routinely run
 * far past the 60s generic budget. At 60s the build action was declared timed-out
 * while still running, and the next action's Ctrl+C aborted it — so builds
 * effectively never completed. Give builds the same realistic budget as installs.
 */
const BUILD_TOOL_TIMEOUT_MS = 300_000;
const TOOL_MAX_ATTEMPTS = 3;
const TOOL_RETRY_BASE_DELAY_MS = 250;

function actionRunnerText(key: ActionRunnerKey, values: Readonly<Record<string, string | number>> = {}): string {
  const i18n = getI18nInstance();
  const copy = getActionRunnerCopy(i18n.resolvedLanguage ?? i18n.language);

  return formatActionRunnerCopy(copy[key], values);
}

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

/*
 * Greedy capture so a file whose own content contains the literal string
 * `</boltAction>` is not truncated at the first inner occurrence — match
 * through to the LAST closing tag instead.
 */
const BOLT_ACTION_CONTENT_PATTERN = /<boltAction\b[^>]*>([\s\S]*)<\/boltAction>/;

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

/**
 * Prompt for the full-file re-emit fallback when an anchored diff fails to apply
 * (the file drifted from the SEARCH anchors) or is malformed. Gives the model the
 * REAL current file plus the intended SEARCH/REPLACE blocks and asks it to output
 * the COMPLETE corrected file — matching the same single-`boltAction` contract
 * `extractSelfRepairContent` parses. Exported for unit testing.
 */
export function buildDiffFullFileReemitPrompt(filePath: string, currentFile: string, diffPayload: string): string {
  return [
    `An anchored SEARCH/REPLACE diff for \`${filePath}\` failed to apply because the`,
    'file drifted from the anchors. Re-emit the COMPLETE file with the intended',
    'change applied. Do not omit any lines. Keep the same path. Output only the',
    'full corrected file as a single boltAction.',
    '',
    'Current file content:',
    '```',
    currentFile,
    '```',
    '',
    'Intended change (SEARCH/REPLACE blocks that did not anchor):',
    '```',
    diffPayload,
    '```',
  ].join('\n');
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
  /*
   * Bound the request so a silent network stall (half-open connection, no RST)
   * can't hang the file action indefinitely. Combine the caller's signal with a
   * hard timeout.
   */
  const timeoutSignal = AbortSignal.timeout(45_000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const response = await fetch(SELF_REPAIR_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ prompt }),
    signal: combinedSignal,
  });

  if (!response.ok) {
    throw new Error(actionRunnerText('actionRunner.error.selfRepairStatus', { status: response.status }));
  }

  const payload = (await response.json()) as { content?: unknown; error?: unknown };

  if (typeof payload.content !== 'string' || payload.content.length === 0) {
    throw new Error(actionRunnerText('actionRunner.error.selfRepairEmpty'));
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

  /**
   * Diff-edit render metadata — populated once a `diff` action resolves so the
   * artifact ActionList can render its +N/−M pill (applied) or a compact
   * "could not apply" marker (fail-safe). Undefined for non-diff actions and
   * while a diff is still streaming.
   */
  diffApply?: DiffApplyMeta;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

/**
 * Outcome of resolving a `diff` (anchored search/replace) action into the full
 * applied file content. STRICT: `ok: true` carries the complete new file; any
 * failure carries `ok: false` with a human-readable `message` and NO content —
 * the caller must write nothing (fail-safe) and surface the message.
 *
 *  - `missing-file`  — the diff target does not exist (a diff has no base).
 *  - `malformed`     — the search/replace blocks could not be parsed.
 *  - `apply-failed`  — a search anchor was not found / was ambiguous (base drift).
 */
export type DiffResolution =
  | { ok: true; content: string; originalContent: string; hunks: HunkResult[] }
  | {
      ok: false;
      kind: 'missing-file' | 'malformed' | 'apply-failed';
      message: string;
      hunks?: HunkResult[];

      /*
       * The freshly-read current file content, present whenever a base file
       * exists (malformed / apply-failed). Lets the caller drive an automatic
       * full-file re-emit (self-repair) instead of losing the edit. Absent for
       * `missing-file` (there is no base to repair against).
       */
      original?: string;
    };

type BaseActionUpdate = Partial<
  Pick<BaseActionState, 'status' | 'abort' | 'executed' | 'startedAt' | 'finishedAt' | 'diffApply'>
>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

class ActionCommandError extends Error {
  readonly _output: string;
  readonly _header: string;

  constructor(message: string, output: string) {
    // Create a formatted message that includes both the error message and output
    const formattedMessage = actionRunnerText('actionRunner.error.shellExecutionFailed', { message, output });
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
    super(
      actionRunnerText('actionRunner.error.timeout', {
        actionType,
        seconds: Math.round(timeoutMs / 1000),
      }),
    );
    this.name = 'ToolTimeoutError';
    Object.setPrototypeOf(this, ToolTimeoutError.prototype);
  }
}

/**
 * L'action a été annulée par l'utilisateur pendant qu'une entrée-sortie était en
 * vol. Distincte du dépassement de délai : ce n'est pas une panne, c'est un
 * arrêt demandé — la boucle de reprise doit s'arrêter net, pas réessayer.
 */
class ActionAbortedError extends Error {
  constructor(actionType: ActionState['type']) {
    super(`Action ${actionType} aborted by the user`);
    this.name = 'ActionAbortedError';
    Object.setPrototypeOf(this, ActionAbortedError.prototype);
  }
}

/*
 * Whether a `start` boltAction is launching a DEV SERVER (so it should be handed
 * to the workbench's single tracked launcher) rather than some bespoke long-running
 * command. Matches the package-manager dev/start scripts and the common framework
 * dev CLIs; a command that is none of these keeps the legacy PTY path so it is
 * never silently dropped.
 */
export function isDevServerStartCommand(command: string): boolean {
  const normalized = (command ?? '').toLowerCase();

  return (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview)\b/.test(normalized) ||
    /(?:^|\s|\/|&&\s*)(?:npx\s+)?vite\b/.test(normalized) ||
    /\b(?:next|astro|remix|nuxt|vinxi|ng|vue-cli-service|react-scripts|parcel|rsbuild|webpack(?:-dev-server)?)\s+(?:dev|serve|start)\b/.test(
      normalized,
    ) ||
    /\bnpm\s+start\b/.test(normalized)
  );
}

/*
 * BUG-AGENT-007 (chemin de repli) — la commande de `start` embarque-t-elle DÉJÀ
 * une installation explicite (`npm install && node server.js`) ? Dans ce cas la
 * garantie d'installation ci-dessous ne doit pas en préfixer une seconde.
 * Volontairement plus strict que INSTALL_COMMAND_PATTERN : `npx`/`bunx` ne
 * comptent PAS comme une installation du projet (ils n'installent que l'outil
 * invoqué, pas les dépendances de l'app).
 */
const EXPLICIT_INSTALL_PATTERN = /(^|[\s;&|])(?:npm|pnpm|yarn|bun)\s+(?:install|ci|i|add)\b/i;

export function startCommandAlreadyInstalls(command: string): boolean {
  return EXPLICIT_INSTALL_PATTERN.test(command ?? '');
}

/**
 * BUG-AGENT-007 (chemin de repli) — quelle commande d'installation précéder au
 * `start` quand node_modules est vide. Déduite du gestionnaire visible dans la
 * commande elle-même, sinon du champ `packageManager` du package.json, sinon npm.
 */
export function installCommandForStartCommand(command: string, packageManager?: string): string {
  const source = `${command ?? ''} ${packageManager ?? ''}`.toLowerCase();

  if (/(^|[\s;&|])pnpm[\s@]/.test(`${source} `)) {
    return 'pnpm install';
  }

  if (/(^|[\s;&|])yarn[\s@]/.test(`${source} `)) {
    return 'yarn install';
  }

  if (/(^|[\s;&|])bunx?[\s@]/.test(`${source} `)) {
    return 'bun install';
  }

  return 'npm install';
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

  /*
   * Delegate a dev-server `start` action to the workbench's single tracked,
   * install-aware launcher (startPreviewServer → streamCommand) instead of typing
   * `npm run dev` into the jsh PTY. The PTY launch is untracked (never appears in
   * /processes), not install-guaranteed (a slow install is Ctrl+C-killed by the
   * next action), and races the tracked launcher on --strictPort 5173 — the
   * structural cause of "dev server never starts". When this hook is wired there is
   * exactly ONE launcher; when it is absent (tests / other embeddings) the runner
   * falls back to the legacy PTY behaviour.
   */
  onStartDevServer?: (command: string) => Promise<unknown> | unknown;
  buildOutput?: { path: string; exitCode: number; output: string };
  #actionWatchdogs = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    runtime: RuntimeAdapter,
    getShellTerminal: () => BoltShell,
    onAlert?: (alert: ActionAlert) => void,
    onSupabaseAlert?: (alert: SupabaseAlert) => void,
    onDeployAlert?: (alert: DeployAlert) => void,
    onStartDevServer?: (command: string) => Promise<unknown> | unknown,
  ) {
    this.#runtime = runtime;
    this.#shellTerminal = getShellTerminal;
    this.onAlert = onAlert;
    this.onSupabaseAlert = onSupabaseAlert;
    this.onDeployAlert = onDeployAlert;
    this.onStartDevServer = onStartDevServer;
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

        if (
          !current ||
          current.executed ||
          current.status === 'complete' ||
          current.status === 'failed' ||
          current.status === 'aborted'
        ) {
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

  /**
   * Finalize file actions left mid-stream because their closing </boltAction>
   * never arrived (e.g. the model stopped cleanly mid-artifact, or a provider
   * truncated the stream). Such actions stay `running`/un-`executed` and spin
   * their UI spinner forever. Unlike abortAll(), this leaves legitimately
   * running shell commands (which only execute after their close tag) untouched,
   * so it is safe to call from the success path (onFinish).
   */
  abortStreamingFileActions() {
    const actions = this.actions.get();

    Object.entries(actions).forEach(([actionId, action]) => {
      if (action.type !== 'file' || action.executed || action.status !== 'running') {
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

  /**
   * Demote an action the caller proved did not land. Used by the workbench's
   * post-write read-back (BUG-AGENT-002): a file action must not stay "complete"
   * when the bytes are absent from the runtime pod, which is how a run could
   * report "Terminé 100 %" over a workspace missing its entry point.
   */
  failAction(actionId: string, error: string) {
    const action = this.actions.get()[actionId];

    if (!action) {
      return;
    }

    this.#updateAction(actionId, { status: 'failed', error });
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
            await this.#runFileAction(action, isStreaming, actionId);
            break;
          }
          case 'diff': {
            await this.#runDiffAction(action, isStreaming, actionId);
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
                  title: actionRunnerText('actionRunner.alert.devServerFailed'),
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
            throw new Error(
              actionRunnerText('actionRunner.error.unsupportedAction', {
                actionType: String((action as { type?: unknown }).type ?? 'unknown'),
              }),
            );
          }
        }
      });

      /*
       * `start` is launched fire-and-forget inside the operation above and owns
       * its own terminal status via the #runStartAction .then/.catch (complete on
       * success, 'failed' on a fast-failing dev server). Finalizing it here would
       * clobber a 'failed' set moments earlier back to 'complete'.
       */
      if (action.type === 'start') {
        return;
      }

      this.#updateAction(actionId, {
        status: isStreaming ? 'running' : action.abortSignal.aborted ? 'aborted' : 'complete',
      });
    } catch (error) {
      /*
       * Une annulation doit LAISSER UNE TRACE. Ce `return` silencieux laissait le
       * statut à « running » : quand l'annulation ne vient pas de `action.abort()`
       * — qui, lui, pose « aborted » — mais du signal partagé, l'action restait
       * affichée « En cours » pour toujours, alors même que l'utilisateur venait
       * d'appuyer sur Arrêter. C'est l'autre moitié du blocage de 68 minutes.
       */
      if (action.abortSignal.aborted) {
        this.#updateAction(actionId, { status: 'aborted' });
        return;
      }

      this.#updateAction(actionId, { status: 'failed', error: this.#formatActionError(error) });
      logger.error(`[${action.type}]:Action failed\n\n`, error);

      if (!(error instanceof ActionCommandError)) {
        return;
      }

      this.onAlert?.({
        type: 'error',
        title: actionRunnerText('actionRunner.alert.devServerFailed'),
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

        if (
          action.abortSignal.aborted ||
          error instanceof ActionCommandError ||
          error instanceof ToolTimeoutError ||
          error instanceof JsonValidationError
        ) {
          /*
           * JsonValidationError is deterministic for a fixed payload — retrying
           * the same truncated/invalid content 3× only wastes the backoff budget.
           */
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

  /*
   * BUG-AGENT-HANG-001 — cette course doit TOUJOURS se dénouer.
   *
   * Le délai refusait de rejeter dès que l'action était annulée, en supposant
   * que « la promesse sous-jacente se dénoue d'elle-même ». Cette hypothèse est
   * fausse : l'écriture (`#runtime.writeFile`) ne reçoit AUCUN signal
   * d'annulation, elle poursuit ses quatre tentatives de 30 s et peut relancer
   * un provisionnement d'espace de travail.
   *
   * Enchaînement observé en production, 68 minutes durant : l'utilisateur
   * appuie sur Arrêter → le drapeau d'annulation bascule → le seul mécanisme
   * capable de dénouer la course est neutralisé → la course ne se dénoue jamais
   * → `#executeAction` ne rend jamais la main → `#currentExecutionPromise`, qui
   * SÉRIALISE toutes les actions, reste en attente → chaque action suivante
   * reste « En cours » et plus aucun fichier n'apparaît dans l'arbre.
   *
   * C'est ce qui explique d'un seul mécanisme les quatre symptômes : le blocage,
   * l'absence de nouveaux fichiers, l'absence d'erreur, et un « Arrêter » qui
   * rend le blocage définitif au lieu d'y mettre fin.
   *
   * Désormais : l'annulation dénoue la course immédiatement, et le délai rejette
   * dans tous les cas. Une action ne peut plus rester en attente sans fin.
   */
  async #withTimeout<T>(action: ActionState, promise: Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;

    const timeoutMs = this.#timeoutMsForAction(action);

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new ToolTimeoutError(action.type, timeoutMs)), timeoutMs);
    });

    const aborted = new Promise<never>((_, reject) => {
      const rejeter = () => reject(new ActionAbortedError(action.type));

      if (action.abortSignal.aborted) {
        rejeter();
        return;
      }

      onAbort = rejeter;
      action.abortSignal.addEventListener('abort', rejeter, { once: true });
    });

    try {
      return await Promise.race([promise, timeout, aborted]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (onAbort) {
        action.abortSignal.removeEventListener('abort', onAbort);
      }
    }
  }

  async #delay(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  #timeoutMsForAction(action: Pick<ActionState, 'type'> & Partial<Pick<ActionState, 'content'>>) {
    if (action.type === 'file' || action.type === 'diff') {
      /*
       * A diff normalizes into a full-file write (sanitize + self-repair loop), so
       * it needs the same generous budget as a direct file action.
       */
      return FILE_TOOL_TIMEOUT_MS;
    }

    if (action.type === 'build') {
      return BUILD_TOOL_TIMEOUT_MS;
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

    return actionRunnerText('actionRunner.error.actionFailed');
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
        resp?.output ?? actionRunnerText('actionRunner.error.noShellResponse'),
      );
      throw new ActionCommandError(enhancedError.title, enhancedError.details);
    }
  }

  async #runStartAction(action: ActionState) {
    if (action.type !== 'start') {
      unreachable('Expected shell action');
    }

    /*
     * UNIFIED LAUNCHER: hand a dev-server start to the workbench's single tracked
     * launcher (startPreviewServer) instead of the jsh PTY, so there is never a
     * second, untracked, install-unaware dev server racing it on port 5173. Only a
     * recognized dev-server command is delegated — a non-dev `start` (a bespoke
     * script with no dev/start entry the tracked path could detect) still runs in
     * the PTY so we never silently drop it. No-op fallback when the hook is unwired.
     */
    if (this.onStartDevServer && isDevServerStartCommand(action.content)) {
      await this.onStartDevServer(action.content);
      return { exitCode: 0, output: '' };
    }

    if (!this.#shellTerminal) {
      unreachable('Shell terminal not found');
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }

    /*
     * BUG-AGENT-007 (chemin de repli) — garantie d'installation AVANT le launch.
     * Le chemin délégué ci-dessus (onStartDevServer → startPreviewServer) porte
     * déjà la « bulletproof install guarantee » du workbench ; ce chemin PTY —
     * commande non reconnue comme dev-server (`node server.js`, script sur
     * mesure) ou hook non câblé — lançait la commande BRUTE. Sur un workspace
     * dont node_modules est vide, elle mourait aussitôt (« command not found » /
     * « Cannot find module ») et l'aperçu restait vide. On sonde node_modules
     * via le même helper que le workbench et on installe d'abord si besoin.
     */
    await this.#ensureStartDependenciesInstalled(action, shell);

    if (action.abortSignal.aborted) {
      return { exitCode: 0, output: '' };
    }

    const resp = await shell.executeCommand(this.runnerId.get(), action.content, () => {
      logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
      action.abort();
    });
    logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

    if (resp?.exitCode != 0) {
      throw new ActionCommandError(
        actionRunnerText('actionRunner.error.startFailed'),
        resp?.output || actionRunnerText('actionRunner.error.noOutputAvailable'),
      );
    }

    return resp;
  }

  /*
   * BUG-AGENT-007 (chemin de repli) — s'assure que les dépendances du projet
   * sont installées avant qu'un `start` PTY ne lance son serveur. Sonde en
   * meilleure-intention : impossible de lire package.json → on ne change RIEN au
   * comportement historique (la commande part telle quelle). Une installation
   * qui ÉCHOUE, en revanche, fait échouer l'action avec la vraie erreur npm —
   * strictement plus actionnable que le « command not found » qui suivrait.
   */
  async #ensureStartDependenciesInstalled(action: ActionState, shell: BoltShell) {
    if (startCommandAlreadyInstalls(action.content)) {
      return;
    }

    let pkg: PreviewPackageManifest & { packageManager?: string };

    try {
      const read = await this.#runtime.readFile('package.json');
      pkg = JSON.parse(read.content) as PreviewPackageManifest & { packageManager?: string };
    } catch {
      // Pas de manifeste lisible → rien à garantir.
      return;
    }

    let installed = true;

    try {
      installed = await hasInstalledPreviewDependencies(pkg, (directory) => this.#runtime.listFiles(directory));
    } catch {
      // Sonde indisponible : on n'ajoute pas d'installation sur un doute.
      return;
    }

    if (installed || action.abortSignal.aborted) {
      return;
    }

    const installCommand = installCommandForStartCommand(action.content, pkg.packageManager);
    logger.debug(`[start]: node_modules incomplet — exécution de « ${installCommand} » avant « ${action.content} »`);

    const resp = await shell.executeCommand(this.runnerId.get(), installCommand, () => {
      logger.debug('[start]: Aborting dependency install before start', action);
      action.abort();
    });

    if (resp?.exitCode !== 0 && !action.abortSignal.aborted) {
      throw new ActionCommandError(
        actionRunnerText('actionRunner.error.startFailed'),
        resp?.output || actionRunnerText('actionRunner.error.noOutputAvailable'),
      );
    }
  }

  /*
   * BUG-AGENT-001 — mémo des écritures déjà appliquées, pour ne PUT que sur un
   * changement réel.
   *
   * Mesuré en direct le 21/08 sur `web:405b1f369d`, en interceptant `fetch` et
   * en relevant la TAILLE du corps de chaque écriture :
   *
   *   vite.config.ts   20 écritures — 1 SEULE taille distincte (363)
   *   index.html        8 écritures — 1 SEULE taille distincte (661)
   *   package.json     96 écritures — 2 tailles distinctes (69 puis 1015)
   *
   * Ce sont donc des répétitions À L'IDENTIQUE, pas de la croissance de
   * streaming. La garde `if (action.executed) return` de `runAction` empêche
   * déjà de rejouer un MÊME `actionId` : ces écritures portent donc des
   * actionId différents pour un contenu identique — des actions ré-émises. La
   * clé doit être (chemin, contenu), pas l'actionId, sinon elle ne dédoublonne
   * rien de ce qui se passe réellement.
   *
   * Ce qui est sauté est exactement une écriture qui produirait, octet pour
   * octet, ce que ce runner a déjà écrit à ce chemin — sans effet sur le
   * disque, mais qui coûtait un aller-retour réseau ET, sur le chemin
   * non-streaming, un tour de self-repair (donc un appel LLM) par répétition.
   * Un contenu DIFFÉRENT n'est jamais sauté : la transition 69 → 1015 de
   * package.json passe. L'entrée n'est posée qu'APRÈS une écriture réussie,
   * donc un échec laisse le chemin réécrivable.
   */
  #lastWrittenFingerprint = new Map<string, number>();

  static #contentFingerprint(content: string): number {
    let h = 5381;

    for (let i = 0; i < content.length; i++) {
      h = ((h << 5) + h + content.charCodeAt(i)) | 0;
    }

    // la longueur discrimine les collisions de contenus courts
    return (h ^ content.length) | 0;
  }

  async #runFileAction(action: ActionState, isStreaming: boolean = false, actionId?: string) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    const relativePath = this.#toRuntimePath(action.filePath);

    const contentFingerprint = ActionRunner.#contentFingerprint(action.content);

    /*
     * On compare au DERNIER contenu écrit à ce chemin, pas à l'ensemble des
     * contenus déjà vus. La nuance est ce qui sépare un dédoublonnage sûr d'une
     * perte de fichier : avec un ensemble, la séquence A → B → A saute la
     * troisième écriture et laisse B sur le disque. Un test dédié couvre ce
     * retour arrière.
     */
    if (this.#lastWrittenFingerprint.get(relativePath) === contentFingerprint) {
      logger.debug(`Skipping byte-identical rewrite of ${relativePath} (action ${actionId ?? 'n/a'})`);
      return;
    }

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
      /*
       * While streaming, the file content is partial by definition, so a
       * `.json` file is almost always mid-object and would throw
       * JsonValidationError on every chunk (failing the streamed write and
       * burning retry budget). Skip strict JSON validation for streaming
       * writes; the authoritative non-streaming write on action close still
       * validates the complete content.
       */
      const sanitized = sanitizeFileContent(action.content, relativePath, { throwOnInvalidJson: !isStreaming });

      if (sanitized.stripped > 0) {
        logger.warn(`Sanitized ${sanitized.stripped} stray control characters from ${relativePath} before writing`);
      }

      /*
       * BUG-AGENT-TRANSPORT-MARKUP — the model leaked its own function-call
       * wrapper into the file body. The bytes are already clean (the write
       * boundary strips them), but this is never normal: report it loudly so a
       * recurrence is visible in the workspace log rather than silently healed.
       * Any syntax damage left behind is caught by the AST self-repair loop
       * immediately below, which regenerates the file.
       */
      if (sanitized.transportMarkupStripped > 0) {
        logger.warn(
          `Rejected ${sanitized.transportMarkupStripped} model transport-markup fragment(s) from ${relativePath} ` +
            `before writing: ${sanitized.transportMarkupSamples.join(' ')}`,
        );
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
     *
     * Like the JSON sanitizer above, this only runs on the authoritative
     * non-streaming write. While streaming the content is partial by
     * definition, so AST validation would fail on every truncated chunk and
     * fire real self-repair LLM round-trips against incomplete code.
     */
    if (!isStreaming) {
      payload = await this.#repairWithSelfRepairLoop(relativePath, payload, action.abortSignal);
    }

    /*
     * If the user hit Stop while we were sanitizing / self-repairing, do not
     * commit the (possibly broken, un-validated best-effort) payload to the
     * workspace. The aborted self-repair loop returns the initial payload as a
     * fallback, and writing it here would persist corrupt content for a
     * generation the user explicitly cancelled.
     */
    if (action.abortSignal.aborted) {
      logger.debug(`Skipping write of ${relativePath}; action was aborted`);
      return;
    }

    try {
      await this.#runtime.writeFile(relativePath, payload);
      logger.debug(`File written ${relativePath}`);

      // Après succès seulement : un échec doit laisser le chemin réécrivable.
      this.#lastWrittenFingerprint.set(relativePath, contentFingerprint);
    } catch (error) {
      logger.error('Failed to write file\n\n', error);
      throw error;
    }

    /*
     * Post-write consistency pass: fix the recurring "blank app" defect where the
     * Vite entry default-imports a component (`import App from './App'`) that only
     * exports it as a named binding (`export function App`) — the browser then
     * throws "does not provide an export named 'default'" and nothing mounts.
     * Only the authoritative non-streaming write reconciles (partial streamed
     * content would misparse); best-effort so it never blocks or breaks the write.
     */
    if (!isStreaming && !action.abortSignal.aborted) {
      try {
        /*
         * Adapt the RuntimeAdapter (readFile → { content }) to the reconcile's
         * string-based surface.
         */
        const fixed = await applyEntryExportReconcile(
          {
            readFile: async (p) => (await this.#runtime.readFile(p)).content,
            writeFile: (p, content) => this.#runtime.writeFile(p, content),
          },
          relativePath,
        );

        for (const fixedPath of fixed) {
          logger.debug(`Reconciled missing default export in ${fixedPath}`);
        }

        /*
         * Et l'inverse : l'entrée qui importe un module PAS ENCORE écrit. L'agent
         * crée souvent `src/App.tsx` bien après `src/main.tsx`, et Vite répète
         * « Failed to resolve import "./App" » à chaque requête pendant tout ce
         * temps — aperçu blanc et compteur d'erreurs qui monte sans fin. Un module
         * d'attente comble le trou : l'import résout, et l'aperçu montre
         * « Génération en cours… » au lieu d'un blanc. Il est remplacé dès que
         * l'agent écrit le vrai fichier.
         */
        const combles = await ensureEntryImportsResolvable(
          {
            readFile: async (p) => (await this.#runtime.readFile(p)).content,
            writeFile: (p, content) => this.#runtime.writeFile(p, content),
          },
          relativePath,
        );

        for (const cheminComble of combles) {
          logger.debug(`Placeholder written for pending entry import: ${cheminComble}`);
        }
      } catch (error) {
        logger.warn('Entry export/import reconcile skipped', error);
      }
    }
  }

  /**
   * Resolve a `diff` (anchored search/replace) action into the FULL applied file
   * content — the single boundary where a diff becomes the byte-for-byte
   * equivalent of a `type="file"` action. Pure w.r.t. the workspace: it only
   * READS the current file (the same `readFile` the entry-export reconcile uses)
   * and computes; it never writes. STRICT fail-safe — a diff has no base file to
   * patch unless the target already exists, and a partial/malformed/non-anchoring
   * payload yields `ok: false` with NO content so the caller writes nothing.
   *
   * Shared by BOTH consumers so they can never diverge: the runner's own
   * `#runDiffAction` (auto-apply write) and the workbench review path (which
   * builds the agent-patch proposal from the applied full content).
   */
  async resolveDiffAction(action: Pick<DiffAction, 'filePath' | 'content'>): Promise<DiffResolution> {
    const relativePath = this.#toRuntimePath(action.filePath);

    /*
     * A diff edits an EXISTING file — there is no base to patch otherwise. If the
     * read fails (ENOENT and friends) or yields non-string content, fail safe and
     * ask for a full file; never create a new file from a diff.
     */
    let original: string;

    try {
      const read = await this.#runtime.readFile(relativePath);
      original = read?.content as string;
    } catch {
      return {
        ok: false,
        kind: 'missing-file',
        message: actionRunnerText('actionRunner.diff.targetMissing', { filePath: action.filePath }),
      };
    }

    if (typeof original !== 'string') {
      return {
        ok: false,
        kind: 'missing-file',
        message: actionRunnerText('actionRunner.diff.targetMissing', { filePath: action.filePath }),
      };
    }

    const parsed = parseSearchReplaceBlocks(action.content);

    if (parsed.malformed || parsed.blocks.length === 0) {
      if (parsed.error) {
        logger.warn(`[diff]: malformed SEARCH/REPLACE payload for ${action.filePath}: ${parsed.error}`);
      }

      const detail = parsed.error
        ? actionRunnerText('actionRunner.diff.invalidStructure')
        : actionRunnerText('actionRunner.diff.noBlocks');

      return {
        ok: false,
        kind: 'malformed',
        message: actionRunnerText('actionRunner.diff.malformed', { filePath: action.filePath, detail }),
        original,
      };
    }

    const result = applySearchReplace(original, parsed.blocks);

    if (!result.ok || result.content === null) {
      const failed = result.hunks.filter(
        (hunk) => hunk.status === 'failed-not-found' || hunk.status === 'failed-ambiguous',
      );

      const anchors = failed
        .map((hunk) => actionRunnerText('actionRunner.diff.block', { index: hunk.index + 1 }))
        .join(', ');

      const anchorsSuffix = anchors ? actionRunnerText('actionRunner.diff.anchors', { anchors }) : '';

      return {
        ok: false,
        kind: 'apply-failed',
        message: actionRunnerText('actionRunner.diff.notApplied', {
          filePath: action.filePath,
          anchors: anchorsSuffix,
        }),
        hunks: result.hunks,
        original,
      };
    }

    return { ok: true, content: result.content, originalContent: original, hunks: result.hunks };
  }

  /**
   * Diff apply-fail recovery: ask the self-repair endpoint to re-emit the COMPLETE
   * file with the intended change applied, so a drifted anchor (`apply-failed`) or a
   * `malformed` block recovers automatically instead of surfacing a user-facing
   * error. Returns the full file content on success, or null when recovery is
   * impossible/failed (the caller then keeps the base file byte-unchanged and
   * surfaces the strict alert). Only meaningful with an existing base file —
   * `missing-file` has nothing to repair against. Never throws.
   *
   * Public so BOTH apply seams reach it: the runner's own `#runDiffAction` (reload/
   * replay path) AND the workbench's `_runAction` interception — the PRIMARY
   * auto-apply/review path, which resolves diffs into file writes before the runner
   * ever sees them and so would otherwise bypass this fallback entirely.
   */
  async recoverDiffViaFullFileReemit(
    filePath: string,
    originalFile: string,
    diffPayload: string,
    abortSignal: AbortSignal,
  ): Promise<string | null> {
    if (abortSignal.aborted) {
      return null;
    }

    try {
      const repairPrompt = buildDiffFullFileReemitPrompt(filePath, originalFile, diffPayload);
      const fullFile = await callSelfRepairEndpoint(repairPrompt, abortSignal);

      if (fullFile && fullFile.trim().length > 0 && !abortSignal.aborted) {
        logger.info(`[diff]: recovered ${filePath} via full-file re-emit`);

        return fullFile;
      }

      return null;
    } catch (error) {
      logger.warn(
        `[diff]: full-file re-emit fallback failed for ${filePath}: ${error instanceof Error ? error.message : error}`,
      );

      return null;
    }
  }

  /**
   * Apply a `diff` action. The apply+write is normalized onto the file pipeline:
   * on success the resolved FULL content is handed to `#runFileAction`, so
   * `sanitizeFileContent` → `#repairWithSelfRepairLoop` → `writeFile` →
   * `applyEntryExportReconcile` (project-doctor) all run EXACTLY as they do for a
   * `type="file"` action. Ordering/serialization is inherited from the runner's
   * single execution chain (`#currentExecutionPromise`) that already serializes
   * file writes — the read+apply+write happen inside ONE queued action, so a
   * concurrent file write to the same path cannot interleave. No second lock.
   *
   * Fail-safe: streaming never writes (a partial payload is unparseable), and any
   * resolution failure writes NOTHING and surfaces a clear alert asking for a
   * full-file re-emission — the old file is left byte-unchanged.
   */
  async #runDiffAction(action: ActionState, isStreaming: boolean = false, actionId?: string) {
    if (action.type !== 'diff') {
      unreachable('Expected diff action');
    }

    /*
     * Streaming: the payload is a partial search/replace block by definition and
     * cannot be parsed or applied. Render only — the authoritative non-streaming
     * call is the sole writer (mirrors #runFileAction gating its write on
     * !isStreaming).
     */
    if (isStreaming) {
      return;
    }

    const resolution = await this.resolveDiffAction(action);

    if (!resolution.ok) {
      logger.warn(`[diff]: ${resolution.message}`);

      const failedMeta: DiffApplyMeta = {
        status: 'failed',
        blockCount: 0,
        addedLines: 0,
        removedLines: 0,
        hunkCount: 0,
        failureKind: resolution.kind,
      };

      if (actionId) {
        this.#updateAction(actionId, { diffApply: failedMeta });
      }

      this.#emitDiffTelemetry(action, resolution.hunks ?? [], failedMeta);

      /*
       * Auto full-file re-emit BEFORE surfacing a user-facing error. An anchored
       * search/replace that fails `apply-failed` (the file drifted from the
       * anchor) or `malformed` is recoverable: ask the model to re-emit the
       * COMPLETE file with the intended change applied, then run it through the
       * normal file pipeline (sanitize / AST self-repair / write). Only when a
       * base file exists (`resolution.original`); `missing-file` has nothing to
       * repair against. This is purely additive on an ALREADY-failing branch —
       * the worst case is the same `onAlert` as before, so it cannot regress a
       * working apply. Stop still cancels via the action's abortSignal.
       */
      if (
        (resolution.kind === 'apply-failed' || resolution.kind === 'malformed') &&
        typeof resolution.original === 'string'
      ) {
        const fullFile = await this.recoverDiffViaFullFileReemit(
          action.filePath,
          resolution.original,
          action.content,
          action.abortSignal,
        );

        if (fullFile) {
          const fileAction = { ...action, type: 'file' as const, content: fullFile } as ActionState;
          await this.#runFileAction(fileAction, isStreaming);

          return;
        }
      }

      this.onAlert?.({
        type: 'warning',
        title: actionRunnerText('actionRunner.diff.alertTitle'),
        description: resolution.message,
        content: resolution.message,
        source: 'preview',
      });

      // STRICT fail-safe: nothing is written; the base file is left untouched.
      return;
    }

    if (action.abortSignal.aborted) {
      logger.debug(`Skipping diff write of ${action.filePath}; action was aborted`);
      return;
    }

    /*
     * Render metadata: compute the +N/−M hunk summary from the SAME reviewable
     * diff the file-proposal UI uses (buildReviewableDiffHunks) so the artifact
     * ActionList shows an accurate targeted-patch pill. Best-effort — a summary
     * failure must never block the write.
     */
    const appliedMeta = this.#buildDiffApplyMeta(action, resolution.originalContent, resolution.content);

    if (actionId) {
      this.#updateAction(actionId, { diffApply: appliedMeta });
    }

    this.#emitDiffTelemetry(action, resolution.hunks, appliedMeta, resolution.content);

    /*
     * Substitute the exact equivalent of a file action carrying the APPLIED FULL
     * content and reuse the whole file pipeline (sanitize / self-repair / write /
     * project-doctor reconcile). Keep the diff action's abortSignal so Stop still
     * cancels the write mid-flight.
     */
    const fileAction = { ...action, type: 'file' as const, content: resolution.content } as ActionState;
    await this.#runFileAction(fileAction, isStreaming);
  }

  /**
   * Build the render metadata for a successfully applied diff. Pure/best-effort:
   * on any failure computing the reviewable hunks it degrades to a zeroed
   * summary rather than throwing into the apply path.
   */
  #buildDiffApplyMeta(action: DiffAction, originalContent: string, appliedContent: string): DiffApplyMeta {
    let addedLines = 0;
    let removedLines = 0;
    let hunkCount = 0;
    let blockCount = 0;

    try {
      const parsed = parseSearchReplaceBlocks(action.content);
      blockCount = parsed.blocks.length;

      const hunks = buildReviewableDiffHunks(action.filePath, originalContent, appliedContent);
      const summary = summarizeReviewableDiffHunks(hunks);
      addedLines = summary.addedLines;
      removedLines = summary.removedLines;
      hunkCount = summary.hunkCount;
    } catch (error) {
      logger.debug('diff-edit: reviewable summary computation failed (non-fatal)', error);
    }

    return { status: 'applied', blockCount, addedLines, removedLines, hunkCount };
  }

  /**
   * Best-effort, never-throwing diff-edit telemetry. Emits a structured
   * `diff-edit.apply` INFO log plus an `agent:diff-edit:apply` workspace event
   * so the win is measurable live: filePath, per-hunk statuses, whether it fell
   * back to a full-file re-emit, and an estimated OUTPUT-token saving (full-file
   * chars/4 vs diff-payload chars/4). No file contents / no PII in the payload.
   */
  #emitDiffTelemetry(action: DiffAction, hunks: HunkResult[], meta: DiffApplyMeta, appliedContent?: string) {
    try {
      const hunkStatuses = hunks.map((hunk) => hunk.status);
      const fellBackToFullFile = meta.status === 'failed';

      /*
       * Only a successful apply carries the applied full content; that is the
       * size a full-file rewrite would have output. On failure there is no
       * saving to claim (the model must re-emit the full file).
       */
      const estimatedTokensSaved =
        meta.status === 'applied' && typeof appliedContent === 'string'
          ? estimateDiffTokenSaving(appliedContent, action.content).savedTokens
          : 0;

      logger.info('diff-edit.apply', {
        event: 'diff-edit.apply',
        filePath: action.filePath,
        outcome: meta.status,
        blockCount: meta.blockCount,
        addedLines: meta.addedLines,
        removedLines: meta.removedLines,
        hunkCount: meta.hunkCount,
        hunkStatuses,
        fellBackToFullFile,
        failureKind: meta.failureKind,
        estimatedTokensSaved,
      });

      workspaceEvents.emit('agent:diff-edit:apply', {
        filePath: action.filePath,
        outcome: meta.status,
        blockCount: meta.blockCount,
        addedLines: meta.addedLines,
        removedLines: meta.removedLines,
        hunkCount: meta.hunkCount,
        hunkStatuses,
        fellBackToFullFile,
        failureKind: meta.failureKind,
        estimatedTokensSaved,
      });
    } catch (error) {
      // Telemetry must never affect the apply path.
      logger.debug('diff-edit: telemetry emit failed (non-fatal)', error);
    }
  }

  async #repairWithSelfRepairLoop(relativePath: string, initialPayload: string, signal?: AbortSignal): Promise<string> {
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
      /*
       * Honor Stop mid self-repair. callSelfRepairEndpoint rejects with an
       * AbortError that the catch below swallows, and the inter-attempt
       * setTimeout delay is not abortable — so without this guard the loop
       * keeps spinning and ultimately returns a best-effort broken payload to
       * be written. Bail out to the original sanitized payload instead; the
       * caller (#runFileAction) skips the write entirely when aborted.
       */
      if (signal?.aborted) {
        workspaceEvents.emit('agent:self-repair:progress', { filePath: relativePath, status: null });
        return initialPayload;
      }

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

        // Propagate the action's abort signal so Stop cancels the self-repair LLM call.
        const corrected = await callSelfRepairEndpoint(prompt, signal);
        const reValidation = await validateAndFormatHunk(relativePath, corrected);

        if (reValidation.kind === 'ok') {
          workspaceEvents.emit('agent:self-repair:progress', { filePath: relativePath, status: null });
          workspaceEvents.emit('agent:self-repair:event', { filePath: relativePath, outcome: 'repaired', attempt });

          return reValidation.formatted;
        }

        if (reValidation.kind === 'skipped') {
          workspaceEvents.emit('agent:self-repair:progress', { filePath: relativePath, status: null });
          return corrected;
        }

        // Still invalid after this attempt's LLM call — record the failure and loop.
        workspaceEvents.emit('agent:self-repair:event', {
          filePath: relativePath,
          outcome: 'failed',
          attempt,
          validationError: reValidation.message,
        });
        lastError = reValidation;
        payload = corrected;
      } catch (error) {
        logger.warn(`Self-repair attempt ${attempt}/${SELF_REPAIR_MAX_ATTEMPTS} for ${relativePath} failed:`, error);
        workspaceEvents.emit('agent:self-repair:event', {
          filePath: relativePath,
          outcome: 'failed',
          attempt,
          repairError: error instanceof Error ? error.message : String(error),
        });

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
    workspaceEvents.emit('agent:self-repair:event', {
      filePath: relativePath,
      outcome: 'gave_up',
      attempt: SELF_REPAIR_MAX_ATTEMPTS,
      validationError: lastError.message,
    });

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

    /*
     * `start` launches the dev server, which stays running indefinitely by
     * design — arming a fixed-duration watchdog spuriously marked it "failed"
     * (and tore down the preview) after 60s. It has its own non-blocking
     * lifecycle (#runStartAction), so it must not be watchdog-timed.
     */
    if (initialAction?.type === 'start') {
      return;
    }

    /*
     * A `file` action is driven twice: once while its body is still streaming
     * (runAction(data, true) → status:'running', executed:false) and once when
     * the closing </boltAction> arrives (runAction(data, false) → executed:true).
     * During streaming, every subsequent chunk is written straight to the editor
     * buffer and never re-enters the runner, so the watchdog is never rescheduled.
     * Arming it on the streaming pass spuriously marks a healthy long stream
     * (>FILE_TOOL_TIMEOUT_MS) as 'failed'. Only watchdog the authoritative
     * non-streaming write (executed:true), whose duration the runner actually owns.
     */
    if (initialAction?.type === 'file' && initialAction.executed === false) {
      return;
    }

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
      const { content } = await this.#runtime.readFile(historyPath);

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
      title: actionRunnerText('actionRunner.build.runningTitle'),
      description: actionRunnerText('actionRunner.build.runningDescription'),
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
        title: actionRunnerText('actionRunner.build.failedTitle'),
        description: actionRunnerText('actionRunner.build.failedDescription'),
        content: output || actionRunnerText('actionRunner.build.noOutput'),
        stage: 'building',
        buildStatus: 'failed',
        deployStatus: 'pending',
        source: 'netlify',
      });

      throw new ActionCommandError(
        actionRunnerText('actionRunner.build.failedTitle'),
        output || actionRunnerText('actionRunner.error.noOutputAvailable'),
      );
    }

    // Trigger build success alert
    this.onDeployAlert?.({
      type: 'success',
      title: actionRunnerText('actionRunner.build.completedTitle'),
      description: actionRunnerText('actionRunner.build.completedDescription'),
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
          throw new Error(actionRunnerText('actionRunner.supabase.migrationPathMissing'));
        }

        // Show alert for migration action
        this.onSupabaseAlert?.({
          type: 'info',
          title: actionRunnerText('actionRunner.supabase.migrationTitle'),
          description: actionRunnerText('actionRunner.supabase.migrationDescription', { filePath }),
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
          title: actionRunnerText('actionRunner.supabase.queryTitle'),
          description: actionRunnerText('actionRunner.supabase.queryDescription'),
          content,
          source: 'supabase',
        });

        // The actual execution will be triggered from SupabaseChatAlert
        return { pending: true };
      }

      default:
        throw new Error(actionRunnerText('actionRunner.supabase.unknownOperation', { operation }));
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
        ? actionRunnerText('actionRunner.deploy.buildingTitle')
        : stage === 'deploying'
          ? actionRunnerText('actionRunner.deploy.deployingTitle')
          : actionRunnerText('actionRunner.deploy.completedTitle');

    const description =
      status === 'failed'
        ? actionRunnerText(
            stage === 'building' ? 'actionRunner.deploy.buildFailed' : 'actionRunner.deploy.deploymentFailed',
          )
        : status === 'running'
          ? actionRunnerText(stage === 'building' ? 'actionRunner.deploy.building' : 'actionRunner.deploy.deploying')
          : status === 'complete'
            ? actionRunnerText(
                stage === 'building' ? 'actionRunner.deploy.buildCompleted' : 'actionRunner.deploy.deploymentCompleted',
              )
            : actionRunnerText(
                stage === 'building' ? 'actionRunner.deploy.preparingBuild' : 'actionRunner.deploy.preparingDeployment',
              );

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
              warning: actionRunnerText('actionRunner.validation.addedForceMissing'),
            };
          } else if (existingFiles.length < filePaths.length) {
            // Some files don't exist, modify to only remove existing ones with -f for safety
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: actionRunnerText('actionRunner.validation.addedForcePartial'),
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
            warning: actionRunnerText('actionRunner.validation.createdDirectory'),
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
            warning: actionRunnerText('actionRunner.validation.sourceMissing', { sourceFile }),
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
        title: actionRunnerText('actionRunner.shell.fileNotFoundTitle'),
        getMessage: () => {
          const fileMatch = output?.match(/'([^']+)'/);
          const fileName = fileMatch ? fileMatch[1] : actionRunnerText('actionRunner.shell.defaultFile');

          return actionRunnerText('actionRunner.shell.fileNotFoundDetails', { fileName });
        },
      },
      {
        pattern: /No such file or directory/,
        title: actionRunnerText('actionRunner.shell.pathNotFoundTitle'),
        getMessage: () => {
          if (trimmedCommand.startsWith('cd ')) {
            const dirMatch = trimmedCommand.match(/cd\s+(.+)/);
            const dirName = dirMatch ? dirMatch[1] : actionRunnerText('actionRunner.shell.defaultDirectory');

            return actionRunnerText('actionRunner.shell.directoryNotFoundDetails', { directory: dirName });
          }

          return actionRunnerText('actionRunner.shell.pathNotFoundDetails');
        },
      },
      {
        pattern: /Permission denied/,
        title: actionRunnerText('actionRunner.shell.permissionDeniedTitle'),
        getMessage: () => actionRunnerText('actionRunner.shell.permissionDeniedDetails', { command: firstWord }),
      },
      {
        pattern: /command not found/,
        title: actionRunnerText('actionRunner.shell.commandNotFoundTitle'),
        getMessage: () => actionRunnerText('actionRunner.shell.commandNotFoundDetails', { command: firstWord }),
      },
      {
        pattern: /Is a directory/,
        title: actionRunnerText('actionRunner.shell.targetDirectoryTitle'),
        getMessage: () => actionRunnerText('actionRunner.shell.targetDirectoryDetails'),
      },
      {
        pattern: /File exists/,
        title: actionRunnerText('actionRunner.shell.fileExistsTitle'),
        getMessage: () => actionRunnerText('actionRunner.shell.fileExistsDetails'),
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
      suggestion = actionRunnerText('actionRunner.shell.npmSuggestion');
    } else if (trimmedCommand.startsWith('git ')) {
      suggestion = actionRunnerText('actionRunner.shell.gitSuggestion');
    } else if (trimmedCommand.match(/^(ls|cat|rm|cp|mv)/)) {
      suggestion = actionRunnerText('actionRunner.shell.pathSuggestion');
    }

    return {
      title: actionRunnerText('actionRunner.shell.commandFailedTitle', {
        exitCode: exitCode ?? '',
      }),
      details: actionRunnerText('actionRunner.shell.commandFailedDetails', {
        command: trimmedCommand,
        output: output || actionRunnerText('actionRunner.error.noOutputAvailable'),
        suggestion,
      }),
    };
  }

  #toRuntimePath(filePath: string) {
    if (filePath.startsWith(`${this.#runtime.workdir}/`)) {
      return filePath.slice(this.#runtime.workdir.length + 1);
    }

    return filePath.replace(/^\/+/, '');
  }
}
