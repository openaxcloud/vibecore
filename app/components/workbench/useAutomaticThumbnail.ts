import { useEffect, useRef, useState } from 'react';

export interface AutomaticThumbnailInput {
  projectId?: string;
  baseUrl?: string;
  ready: boolean;
  frameRendered: boolean;
  onFailure?: () => void;
  onUnconfirmed?: () => void;
}

interface CaptureState {
  status: 'idle' | 'capturing' | 'stored' | 'skipped' | 'failed' | 'pending' | 'unknown';
  reason?: string;
  attempts: number;
}

interface CaptureEntry extends CaptureState {
  finished?: boolean;
  nextAttemptAt?: number;
}

const IDLE: CaptureState = { status: 'idle', attempts: 0 };
const MAX_ATTEMPTS = 3;
const RETRY_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;

// Internal protocol reason, never displayed as user-facing copy.
const ACCESS_DENIED = 'access-denied';
const DISABLED = 'disabled';

/** Observe storage receipts, never infer a thumbnail from readiness or scheduling. */
export function useAutomaticThumbnail({
  projectId,
  baseUrl,
  ready,
  frameRendered,
  onFailure,
  onUnconfirmed,
}: AutomaticThumbnailInput): CaptureState {
  const entries = useRef(new Map<string, CaptureEntry>());
  const callbacks = useRef({ onFailure, onUnconfirmed });
  callbacks.current = { onFailure, onUnconfirmed };

  const identity = projectId && baseUrl ? JSON.stringify([projectId, baseUrl]) : undefined;
  const [view, setView] = useState<{ identity?: string; state: CaptureState }>({ state: IDLE });

  useEffect(() => {
    if (!identity || !projectId || !baseUrl || !ready || !frameRendered) {
      setView({ identity, state: IDLE });
      return undefined;
    }

    let entry = entries.current.get(identity);

    if (!entry) {
      entry = { ...IDLE };
      entries.current.set(identity, entry);

      while (entries.current.size > 32) {
        entries.current.delete(entries.current.keys().next().value!);
      }
    }

    const current = entry;

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const publish = () => {
      if (active) {
        setView({ identity, state: { ...current } });
      }
    };
    publish();

    const attempt = async () => {
      if (!active || current.finished) {
        return;
      }

      /*
       * Repeated readiness changes can abort all attempts. Keep the same budget
       * and expose the unresolved outcome when this identity becomes eligible again.
       */
      if (current.attempts >= MAX_ATTEMPTS) {
        current.finished = true;
        current.status = 'unknown';
        callbacks.current.onUnconfirmed?.();
        publish();

        return;
      }

      current.attempts += 1;
      current.status = 'capturing';
      current.reason = undefined;
      publish();
      controller = new AbortController();

      const signal = controller.signal;

      let outcome: Pick<CaptureState, 'status' | 'reason'> = { status: 'unknown' };
      let rejectAborted: (() => void) | undefined;

      try {
        const timeout = new Promise<never>((_resolve, reject) => {
          rejectAborted = () => reject(signal.reason);
          signal.addEventListener('abort', rejectAborted, { once: true });
          deadline = setTimeout(() => {
            controller?.abort();
          }, REQUEST_TIMEOUT_MS);
        });
        outcome = await Promise.race([
          (async (): Promise<Pick<CaptureState, 'status' | 'reason'>> => {
            const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/thumbnail/refresh`, {
              method: 'POST',
              body: new URLSearchParams({ url: baseUrl }),
              signal,
            });

            if (response.status === 401 || response.status === 403) {
              return { status: 'failed', reason: ACCESS_DENIED };
            }

            if (!response.ok) {
              return { status: 'unknown' };
            }

            const body = (await response.json()) as { status?: string; reason?: string; enabled?: boolean };

            if (body.enabled === false) {
              return { status: 'skipped', reason: DISABLED };
            }

            if (body.status === 'stored') {
              return { status: 'stored' };
            }

            if (body.status === 'failed') {
              return { status: 'failed', reason: body.reason };
            }

            if (body.status === 'pending') {
              return { status: 'pending', reason: body.reason };
            }

            if (
              body.status === 'skipped' &&
              ['disabled', 'recent-success', 'failure-cooldown'].includes(body.reason ?? '')
            ) {
              return { status: 'skipped', reason: body.reason };
            }

            return { status: 'unknown' };
          })(),
          timeout,
        ]);
      } catch {
        // A transport failure does not establish whether the server stored an image.
        outcome = { status: 'unknown' };
      } finally {
        clearTimeout(deadline);

        if (rejectAborted) {
          signal.removeEventListener('abort', rejectAborted);
        }
      }

      if (!active) {
        return;
      }

      Object.assign(current, outcome);

      if (outcome.status === 'stored' || (outcome.status === 'skipped' && outcome.reason !== 'failure-cooldown')) {
        current.finished = true;
      } else if (current.attempts >= MAX_ATTEMPTS || outcome.reason === ACCESS_DENIED) {
        current.finished = true;

        if (outcome.status === 'failed') {
          callbacks.current.onFailure?.();
        } else {
          current.status = 'unknown';
          callbacks.current.onUnconfirmed?.();
        }
      } else {
        current.nextAttemptAt = Date.now() + RETRY_MS;
        retryTimer = setTimeout(() => void attempt(), RETRY_MS);
      }

      publish();
    };

    if (current.nextAttemptAt && current.nextAttemptAt > Date.now()) {
      retryTimer = setTimeout(() => void attempt(), current.nextAttemptAt - Date.now());
    } else {
      void attempt();
    }

    return () => {
      active = false;
      clearTimeout(retryTimer);
      clearTimeout(deadline);
      controller?.abort();

      if (current.status === 'capturing') {
        current.status = 'unknown';
        current.nextAttemptAt = Date.now() + RETRY_MS;
      }
    };
  }, [identity, projectId, baseUrl, ready, frameRendered]);

  return view.identity === identity ? view.state : IDLE;
}
