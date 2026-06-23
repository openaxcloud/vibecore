/*
 * Pure helpers for resolving the outcome of a Vercel deployment status poll
 * loop. Kept framework-agnostic and side-effect free so it can be unit tested
 * and reused without pulling in the route module.
 */

export interface VercelPollState {
  /** Number of poll iterations attempted so far. */
  retryCount: number;

  /** Maximum number of poll iterations allowed. */
  maxRetries: number;

  /** Number of consecutive status responses that were not ok (transient errors). */
  consecutiveFailures: number;

  /** Last observed Vercel `readyState` ('' if we never got a successful status read). */
  deploymentState: string;
}

export type VercelPollOutcome =
  | { kind: 'ready'; state: string }
  | { kind: 'error' }
  | { kind: 'pending' } // polling exhausted but deploy is still in-flight on Vercel's side
  | { kind: 'timed-out' };

/*
 * Decide what the action handler should return once the poll loop has finished.
 *
 * The historical bug: if Vercel's status endpoint returns non-ok responses
 * (rate limit / transient 5xx) for every iteration, `deploymentState` stays ''
 * for the full set of retries and the handler returned a hard 'timed out'
 * error (HTTP 500) — even though the deployment may well have completed READY
 * on Vercel's side. We can't observe the real state in that case, so instead of
 * claiming failure we surface a 'pending' outcome and let the client keep
 * polling with the deploy id.
 */
export function resolveVercelPollOutcome(state: VercelPollState): VercelPollOutcome {
  if (state.deploymentState === 'ERROR') {
    return { kind: 'error' };
  }

  if (state.deploymentState === 'READY') {
    return { kind: 'ready', state: state.deploymentState };
  }

  // Loop finished without a terminal state.
  if (state.retryCount >= state.maxRetries) {
    /*
     * If we never managed to read a single successful status, the loop didn't
     * observe a slow-but-progressing build — it failed to talk to Vercel at
     * all. Treat that as pending (deploy id returned for client polling)
     * rather than a false failure.
     */
    if (state.deploymentState === '') {
      return { kind: 'pending' };
    }

    // We saw real states (e.g. BUILDING/QUEUED) but it never finished in time.
    return { kind: 'timed-out' };
  }

  // Loop ended early with a non-terminal but known state — still in progress.
  return { kind: 'pending' };
}
