import type { PersistedPromptChatState, ProjectFileEntry } from './solution-capture-state.js';

export type ProjectIdeState = {
  chat?: PersistedPromptChatState;
  files: ProjectFileEntry[];

  /** A recovered gap invalidates any stability window spanning this read. */
  recoveredTransientCount: number;
  version?: number;
};

type IdeStateResponse = {
  headers: () => Record<string, string>;
  status: () => number;
  text: () => Promise<string>;
};

export type ProjectIdeStateReadDiagnostic = {
  attempt: number;
  bodyBytes: number | null;
  code: string | null;
  contentType: string | null;
  failure: 'budget' | 'http' | 'invalid-json' | 'invalid-shape' | 'transport' | null;
  nextDelayMs: number | null;
  outcome: 'failure' | 'retry' | 'success';
  retryAfter: string | null;
  status: number | null;
};

export type ProjectIdeStateReadOptions = {
  /** Performs the authenticated request without exposing its URL or headers to this helper. */
  request: (timeoutMs: number) => Promise<IdeStateResponse>;
  budgetMs?: number;
  jitterMs?: (attempt: number, baseDelayMs: number) => number;
  log?: (diagnostic: ProjectIdeStateReadDiagnostic) => void;
  now?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
};

export type ProjectIdeStateReadFailure =
  | 'budget-exhausted'
  | 'invalid-json'
  | 'invalid-shape'
  | 'permanent-http'
  | 'transient-exhausted';

export class ProjectIdeStateReadError extends Error {
  readonly failure: ProjectIdeStateReadFailure;
  readonly attempts: number;
  readonly status?: number;

  constructor(
    message: string,
    options: { attempts: number; cause?: unknown; failure: ProjectIdeStateReadFailure; status?: number },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ProjectIdeStateReadError';
    this.failure = options.failure;
    this.attempts = options.attempts;
    this.status = options.status;
  }
}

export const PROJECT_IDE_STATE_MAX_ATTEMPTS = 4;
export const PROJECT_IDE_STATE_BUDGET_MS = 45_000;
export const PROJECT_IDE_STATE_REQUEST_TIMEOUT_MS = 20_000;
export const PROJECT_IDE_STATE_BACKOFF_MS = [500, 1_000, 2_000] as const;

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const EXPLICIT_PERMANENT_HTTP_STATUSES = new Set([400, 401, 403, 404, 409, 412]);
const MACHINE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;

const CONTENT_TYPE_PATTERN =
  /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\s*;\s*[a-z0-9!#$&^_.+-]+=[a-z0-9!#$&^_.+"'()-]+)*$/iu;

const INTEGER_RETRY_AFTER_PATTERN = /^\d+$/u;
const MAX_JITTER_MS = 250;
const MAX_MACHINE_CODE_LENGTH = 64;
const MAX_CONTENT_TYPE_LENGTH = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rawResponseHeader(headers: Record<string, string>, name: string): string | undefined {
  const normalizedName = name.toLocaleLowerCase();

  return Object.entries(headers)
    .find(([key]) => key.toLocaleLowerCase() === normalizedName)?.[1]
    ?.trim();
}

function safeContentTypeHeader(headers: Record<string, string>): string | null {
  const value = rawResponseHeader(headers, 'content-type');

  return value && value.length <= MAX_CONTENT_TYPE_LENGTH && CONTENT_TYPE_PATTERN.test(value) ? value : null;
}

function safeRetryAfterHeader(headers: Record<string, string>): string | null {
  const value = rawResponseHeader(headers, 'retry-after');

  if (!value) {
    return null;
  }

  if (INTEGER_RETRY_AFTER_PATTERN.test(value)) {
    return value;
  }

  const timestampMs = Date.parse(value);

  return Number.isFinite(timestampMs) ? new Date(timestampMs).toUTCString() : null;
}

function jsonErrorCode(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.code !== 'string') {
    return null;
  }

  const code = payload.code.trim();

  return code.length <= MAX_MACHINE_CODE_LENGTH && MACHINE_ERROR_CODE_PATTERN.test(code) ? code : null;
}

function parseJson(source: string): { parsed: true; value: unknown } | { parsed: false } {
  try {
    return { parsed: true, value: JSON.parse(source) as unknown };
  } catch {
    return { parsed: false };
  }
}

function parseProjectFileEntry(value: unknown): ProjectFileEntry | undefined {
  if (!isRecord(value) || typeof value.path !== 'string' || typeof value.content !== 'string') {
    return undefined;
  }

  if (value.encoding !== undefined && value.encoding !== 'utf8' && value.encoding !== 'base64') {
    return undefined;
  }

  return {
    path: value.path,
    content: value.content,
    ...(value.encoding === 'utf8' || value.encoding === 'base64' ? { encoding: value.encoding } : {}),
  };
}

/**
 * `GET /ide-state` legitimately returns `ideState: null` before its first
 * persistence, and a record may briefly exist before the files manifest does.
 * Both states are pollable "not ready" observations represented by files: [].
 * Once a files manifest exists, every entry is validated strictly.
 */
function parseProjectIdeStatePayload(payload: unknown): ProjectIdeState | undefined {
  if (!isRecord(payload) || !Object.hasOwn(payload, 'ideState')) {
    return undefined;
  }

  if (payload.ideState === null) {
    return { files: [], recoveredTransientCount: 0 };
  }

  if (!isRecord(payload.ideState)) {
    return undefined;
  }

  const { ideState } = payload;

  if (ideState.version !== undefined && (!Number.isSafeInteger(ideState.version) || (ideState.version as number) < 0)) {
    return undefined;
  }

  if (!isRecord(ideState.state)) {
    return undefined;
  }

  const chat = ideState.state.chat;

  if (chat !== undefined && !isRecord(chat)) {
    return undefined;
  }

  let files: ProjectFileEntry[] = [];

  if (ideState.state.files !== undefined) {
    if (!isRecord(ideState.state.files) || !Array.isArray(ideState.state.files.entries)) {
      return undefined;
    }

    const parsedFiles = ideState.state.files.entries.map(parseProjectFileEntry);

    if (parsedFiles.some((entry) => entry === undefined)) {
      return undefined;
    }

    files = parsedFiles as ProjectFileEntry[];
  }

  return {
    ...(chat ? { chat: chat as PersistedPromptChatState } : {}),
    files,
    recoveredTransientCount: 0,
    ...(typeof ideState.version === 'number' ? { version: ideState.version } : {}),
  };
}

export function retryAfterDelayMs(value: string | null, nowMs: number): number | undefined {
  if (!value) {
    return undefined;
  }

  if (INTEGER_RETRY_AFTER_PATTERN.test(value)) {
    const seconds = Number(value);

    return Number.isSafeInteger(seconds) ? seconds * 1_000 : Number.MAX_SAFE_INTEGER;
  }

  const timestampMs = Date.parse(value);

  return Number.isFinite(timestampMs) ? Math.max(0, Math.ceil(timestampMs - nowMs)) : undefined;
}

function safeJitter(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_JITTER_MS, Math.max(0, Math.floor(value))) : 0;
}

function defaultJitterMs() {
  return Math.floor(Math.random() * (MAX_JITTER_MS + 1));
}

function transientExhaustedError(attempts: number, cause?: unknown, status?: number) {
  const statusDetail = status === undefined ? 'transport failure' : `HTTP ${status}`;

  return new ProjectIdeStateReadError(
    `Project IDE state remained transiently unavailable after ${attempts} attempts (${statusDetail}).`,
    { attempts, cause, failure: 'transient-exhausted', ...(status === undefined ? {} : { status }) },
  );
}

function positiveBudgetMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Project IDE state read budget must be a positive finite duration');
  }

  return Math.floor(value);
}

function budgetError(budgetMs: number, attempts: number, cause?: unknown, status?: number) {
  return new ProjectIdeStateReadError(
    `Project IDE state read exceeded its ${budgetMs}ms budget after ${attempts} attempts${
      status === undefined ? '' : ` (last HTTP ${status})`
    }.`,
    { attempts, cause, failure: 'budget-exhausted', ...(status === undefined ? {} : { status }) },
  );
}

function logBudgetFailure(
  options: ProjectIdeStateReadOptions,
  diagnostic: Omit<ProjectIdeStateReadDiagnostic, 'failure' | 'nextDelayMs' | 'outcome'>,
) {
  options.log?.({
    ...diagnostic,
    failure: 'budget',
    nextDelayMs: null,
    outcome: 'failure',
  });
}

/**
 * Read authoritative project IDE state with a strict retry taxonomy.
 *
 * Only transport failures and explicitly transient HTTP statuses are retried.
 * HTTP classification never depends on reading its body: an unreadable 401 is
 * permanent, while an unreadable 429 still follows its safe Retry-After value.
 */
export async function readProjectIdeStateWithRetry(options: ProjectIdeStateReadOptions): Promise<ProjectIdeState> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs)));
  const jitterMs = options.jitterMs ?? defaultJitterMs;
  const budgetMs = positiveBudgetMs(options.budgetMs ?? PROJECT_IDE_STATE_BUDGET_MS);
  const deadlineMs = now() + budgetMs;

  let lastCause: unknown;
  let lastStatus: number | undefined;
  let recoveredTransientCount = 0;

  const scheduleRetry = async (
    attempt: number,
    diagnostic: Omit<ProjectIdeStateReadDiagnostic, 'nextDelayMs' | 'outcome'>,
    cause?: unknown,
  ) => {
    lastCause = cause;
    lastStatus = diagnostic.status ?? undefined;

    if (attempt === PROJECT_IDE_STATE_MAX_ATTEMPTS) {
      options.log?.({ ...diagnostic, nextDelayMs: null, outcome: 'failure' });
      throw transientExhaustedError(attempt, cause, lastStatus);
    }

    const baseDelayMs = PROJECT_IDE_STATE_BACKOFF_MS[attempt - 1];
    const backoffWithJitterMs = baseDelayMs + safeJitter(jitterMs(attempt, baseDelayMs));
    const retryAfterMs = retryAfterDelayMs(diagnostic.retryAfter, now()) ?? 0;
    const delayMs = Math.max(backoffWithJitterMs, retryAfterMs);
    const remainingBeforeDelayMs = deadlineMs - now();

    if (remainingBeforeDelayMs <= delayMs) {
      logBudgetFailure(options, diagnostic);
      throw budgetError(budgetMs, attempt, cause, lastStatus);
    }

    options.log?.({ ...diagnostic, nextDelayMs: delayMs, outcome: 'retry' });
    await sleep(delayMs);

    if (now() >= deadlineMs) {
      logBudgetFailure(options, { ...diagnostic, attempt });
      throw budgetError(budgetMs, attempt, cause, lastStatus);
    }

    recoveredTransientCount += 1;
  };

  for (let attempt = 1; attempt <= PROJECT_IDE_STATE_MAX_ATTEMPTS; attempt += 1) {
    const remainingBeforeRequestMs = deadlineMs - now();

    if (remainingBeforeRequestMs <= 0) {
      throw budgetError(budgetMs, attempt - 1, lastCause, lastStatus);
    }

    let response: IdeStateResponse;

    try {
      response = await options.request(
        Math.max(1, Math.min(PROJECT_IDE_STATE_REQUEST_TIMEOUT_MS, remainingBeforeRequestMs)),
      );
    } catch (error) {
      await scheduleRetry(
        attempt,
        {
          attempt,
          bodyBytes: null,
          code: null,
          contentType: null,
          failure: 'transport',
          retryAfter: null,
          status: null,
        },
        error,
      );
      continue;
    }

    if (now() >= deadlineMs) {
      logBudgetFailure(options, {
        attempt,
        bodyBytes: null,
        code: null,
        contentType: null,
        retryAfter: null,
        status: null,
      });
      throw budgetError(budgetMs, attempt, undefined, undefined);
    }

    const status = response.status();
    const headers = response.headers();
    const retryAfter = safeRetryAfterHeader(headers);
    const contentType = safeContentTypeHeader(headers);
    const retryableHttp = status < 200 || status >= 300 ? RETRYABLE_HTTP_STATUSES.has(status) : false;
    const permanentHttp = status < 200 || status >= 300 ? !retryableHttp : false;

    if (permanentHttp) {
      options.log?.({
        attempt,
        bodyBytes: null,
        code: null,
        contentType,
        failure: 'http',
        nextDelayMs: null,
        outcome: 'failure',
        retryAfter,
        status,
      });

      const taxonomy = EXPLICIT_PERMANENT_HTTP_STATUSES.has(status) ? 'permanent' : 'non-retryable';

      throw new ProjectIdeStateReadError(`Project IDE state read failed immediately with ${taxonomy} HTTP ${status}.`, {
        attempts: attempt,
        failure: 'permanent-http',
        status,
      });
    }

    let source: string | undefined;
    let sourceError: unknown;

    try {
      source = await response.text();
    } catch (error) {
      sourceError = error;
    }

    if (now() >= deadlineMs) {
      logBudgetFailure(options, {
        attempt,
        bodyBytes: source === undefined ? null : Buffer.byteLength(source),
        code: null,
        contentType,
        retryAfter,
        status,
      });
      throw budgetError(budgetMs, attempt, sourceError, status);
    }

    const bodyBytes = source === undefined ? null : Buffer.byteLength(source);
    const parsed = source === undefined ? ({ parsed: false } as const) : parseJson(source);
    const code = parsed.parsed ? jsonErrorCode(parsed.value) : null;

    if (retryableHttp) {
      await scheduleRetry(
        attempt,
        {
          attempt,
          bodyBytes,
          code,
          contentType,
          failure: 'http',
          retryAfter,
          status,
        },
        sourceError,
      );
      continue;
    }

    if (sourceError || source === undefined) {
      await scheduleRetry(
        attempt,
        {
          attempt,
          bodyBytes: null,
          code: null,
          contentType,
          failure: 'transport',
          retryAfter,
          status,
        },
        sourceError,
      );
      continue;
    }

    if (!parsed.parsed) {
      options.log?.({
        attempt,
        bodyBytes,
        code: null,
        contentType,
        failure: 'invalid-json',
        nextDelayMs: null,
        outcome: 'failure',
        retryAfter,
        status,
      });
      throw new ProjectIdeStateReadError(
        `Project IDE state returned invalid JSON with HTTP ${status} on attempt ${attempt}.`,
        { attempts: attempt, failure: 'invalid-json', status },
      );
    }

    const projectIdeState = parseProjectIdeStatePayload(parsed.value);

    if (!projectIdeState) {
      options.log?.({
        attempt,
        bodyBytes,
        code,
        contentType,
        failure: 'invalid-shape',
        nextDelayMs: null,
        outcome: 'failure',
        retryAfter,
        status,
      });
      throw new ProjectIdeStateReadError(
        `Project IDE state returned an invalid shape with HTTP ${status} on attempt ${attempt}.`,
        { attempts: attempt, failure: 'invalid-shape', status },
      );
    }

    options.log?.({
      attempt,
      bodyBytes,
      code,
      contentType,
      failure: null,
      nextDelayMs: null,
      outcome: 'success',
      retryAfter,
      status,
    });

    return { ...projectIdeState, recoveredTransientCount };
  }

  throw transientExhaustedError(PROJECT_IDE_STATE_MAX_ATTEMPTS, lastCause, lastStatus);
}
