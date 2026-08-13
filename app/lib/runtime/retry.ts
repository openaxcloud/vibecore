import { RuntimeError } from '@vibecore/runtime-contract';

/**
 * Transient HTTP statuses returned by the runtime proxy while a freshly
 * provisioned workspace pod is still coming up. These are safe to retry — the
 * pod itself is healthy, it just isn't ready to accept proxied requests yet.
 */
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Runtime error codes that indicate the workspace is not yet reachable but is
 * expected to become reachable shortly (pod still starting / DNS not warm).
 * These are only consulted when the error carries no HTTP status — when a
 * status IS present we trust it alone, because the generic proxy error code is
 * attached to every non-2xx response (including genuine 4xx like 404/403).
 */
const TRANSIENT_CODES = new Set(['WORKSPACE_NOT_STARTED', 'WORKSPACE_AGENT_REQUEST_FAILED']);

/**
 * A 429 is normally transient (a rate-limit that clears with backoff), but a
 * 429 carrying a quota signal is a HARD limit (e.g. the org is at its
 * workspaces.active / terminals.concurrent ceiling). Retrying that is futile and
 * produces a request storm — observed in prod as 100+ file-write retries and an
 * endless terminal reconnect loop after a workspace start was quota-blocked.
 * The quota code rides in the proxied response body, surfaced on RuntimeError
 * `details` (a JSON string) rather than `code`, so we scan both plus the message.
 */
const HARD_LIMIT_HINTS = ['quota_exceeded', 'quota exceeded'];

function isHardQuota429(error: RuntimeError): boolean {
  if (error.status !== 429) {
    return false;
  }

  const haystacks = [error.code, typeof error.details === 'string' ? error.details : '', error.message]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return haystacks.some((value) => HARD_LIMIT_HINTS.some((hint) => value.includes(hint)));
}

const TRANSIENT_MESSAGE_HINTS = [
  'failed to fetch',
  'network',
  'enotfound',
  'econnrefused',
  'econnreset',
  'etimedout',
  'timeout',
  'socket hang up',
  '502',
  '503',
  '504',
];

/**
 * Returns true when an error thrown by a runtime call looks transient — i.e.
 * the same call has a good chance of succeeding if retried after a short delay.
 */
export function isTransientRuntimeError(error: unknown): boolean {
  if (error instanceof RuntimeError) {
    /*
     * When a concrete HTTP status is known, trust it alone: a 404/403 must not
     * be retried even though it shares the generic proxy error code.
     */
    if (typeof error.status === 'number') {
      // A quota-driven 429 is a hard ceiling — never retry it (avoids storms).
      if (isHardQuota429(error)) {
        return false;
      }

      return TRANSIENT_STATUSES.has(error.status);
    }

    if (error.code && TRANSIENT_CODES.has(error.code)) {
      return true;
    }
  }

  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();

  return TRANSIENT_MESSAGE_HINTS.some((hint) => message.includes(hint));
}

export interface RuntimeRetryOptions {
  /** Maximum number of attempts (including the first). Defaults to 4 (1 try + 3 retries). */
  attempts?: number;

  /** Base delay in ms; grows exponentially with attempt index. Defaults to 750ms. */
  baseDelayMs?: number;

  /** Cap on a single backoff delay. Defaults to 8000ms. */
  maxDelayMs?: number;

  /** Predicate deciding whether a given error is worth retrying. */
  shouldRetry?: (error: unknown) => boolean;

  /** Invoked before each retry (1-indexed attempt that is about to run). */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs an async operation, retrying with exponential backoff while the thrown
 * error is classified as transient. Non-transient errors are re-thrown
 * immediately so genuine failures (unsupported capability, bad input, auth)
 * are not masked by pointless retries.
 */
export async function withRuntimeRetry<T>(operation: () => Promise<T>, options: RuntimeRetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const baseDelayMs = options.baseDelayMs ?? 750;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const shouldRetry = options.shouldRetry ?? isTransientRuntimeError;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt >= attempts;

      if (isLastAttempt || !shouldRetry(error)) {
        throw error;
      }

      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      options.onRetry?.(attempt, delayMs, error);
      await wait(delayMs);
    }
  }

  throw lastError;
}
