import { createSingleFlight } from './single-flight';

/**
 * One logical GET per panel. Explicit Retry replaces its HTTP attempt, while
 * every consumer (including a remounted panel) keeps awaiting the same promise.
 * Unmounting one consumer must not cancel a request shared by another one.
 */
export function createPanelRequest<T>() {
  const flights = createSingleFlight<T>();
  const pending = new Map<string, () => void>();

  return {
    run(key: string, load: (signal: AbortSignal) => Promise<T>): Promise<T> {
      return flights.run(
        key,
        () =>
          new Promise<T>((resolve, reject) => {
            let current: AbortController | undefined;

            const start = () => {
              const previous = current;
              const controller = new AbortController();

              /*
               * Fence the old attempt BEFORE aborting: its rejection can race
               * the replacement, and some transports do not honour abort.
               */
              current = controller;
              previous?.abort();

              void Promise.resolve()
                .then(() => {
                  controller.signal.throwIfAborted();
                  return load(controller.signal);
                })
                .then(
                  (value) => {
                    if (current !== controller) {
                      return;
                    }

                    pending.delete(key);
                    resolve(value);
                  },
                  (error: unknown) => {
                    if (current !== controller) {
                      return;
                    }

                    pending.delete(key);
                    reject(error);
                  },
                );
            };

            pending.set(key, start);
            start();
          }),
      );
    },

    /** Cancels the attempt for ALL consumers of this key, never other keys. */
    retry(key: string): boolean {
      const start = pending.get(key);

      if (!start) {
        return false;
      }

      start();

      return true;
    },
  };
}

/** An explicitly replaced GET must not keep retrying during its old backoff. */
export function waitForPanelRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, delayMs);

    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener('abort', abort, { once: true });
    }
  });
}
