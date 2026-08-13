/**
 * Pure, framework-free helper for polling a Netlify deploy's status until it
 * reaches a terminal state, times out, or exhausts its attempts.
 *
 * Extracted from {@link useNetlifyDeploy} so the loop's termination behaviour
 * can be unit-tested in isolation. The key invariant is that EVERY iteration
 * advances `attempts` toward `maxAttempts` — including iterations where the
 * status fetch throws — so a persistently failing/offline status endpoint can
 * never spin the loop forever.
 */

export interface NetlifyDeployStatus {
  state?: string;
  error_message?: string;
  ssl_url?: string;
  url?: string;
  [key: string]: unknown;
}

export interface PollNetlifyDeployOptions {
  /** Fetches the current deploy status. Should throw on a non-ok HTTP response. */
  fetchStatus: () => Promise<NetlifyDeployStatus>;

  /** Maximum number of polling iterations before giving up. */
  maxAttempts: number;

  /** Delay (ms) to wait after a successful but still-pending status poll. */
  pendingDelayMs?: number;

  /** Delay (ms) to wait after a failed status poll before retrying. */
  errorDelayMs?: number;

  /** Sleep implementation; injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export type PollNetlifyDeployResult =
  | { outcome: 'ready'; status: NetlifyDeployStatus; attempts: number }
  | { outcome: 'error'; error: string; attempts: number }
  | { outcome: 'timeout'; attempts: number };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function pollNetlifyDeploy(options: PollNetlifyDeployOptions): Promise<PollNetlifyDeployResult> {
  const { fetchStatus, maxAttempts, pendingDelayMs = 1000, errorDelayMs = 2000, sleep = defaultSleep } = options;

  let attempts = 0;

  while (attempts < maxAttempts) {
    /*
     * Count this iteration up-front so that every code path below — success,
     * still-pending, or a thrown error — advances toward maxAttempts. This is
     * what prevents a persistently erroring / offline status endpoint from
     * looping forever (the original bug only incremented after a successful,
     * still-pending poll).
     */
    attempts++;

    try {
      const status = await fetchStatus();

      if (status.state === 'ready' || status.state === 'uploaded') {
        return { outcome: 'ready', status, attempts };
      }

      if (status.state === 'error') {
        return {
          outcome: 'error',
          error: 'Deployment failed: ' + (status.error_message || 'Unknown error'),
          attempts,
        };
      }

      if (attempts < maxAttempts) {
        await sleep(pendingDelayMs);
      }
    } catch (error) {
      console.error('Status check error:', error);

      if (attempts < maxAttempts) {
        await sleep(errorDelayMs);
      }
    }
  }

  return { outcome: 'timeout', attempts };
}
