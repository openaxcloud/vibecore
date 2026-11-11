type Observation = { status?: string } | undefined;
type RecoveryOptions<T> = {
  method: string;
  deadline: number;
  signal?: AbortSignal | null;
  observe: (signal: AbortSignal) => Promise<Observation>;
  healthy: (signal: AbortSignal) => Promise<boolean>;
  read: (signal: AbortSignal, remainingMs: number) => Promise<T>;
};

function recoveryError(code: string, statusCode = 502) {
  return Object.assign(new Error(code), { code, statusCode });
}

/*
 * Only a failed idempotent read with authoritative STARTING evidence may wait.
 * This does not provision, restart, or retry an HTTP error such as a real 404.
 */
export async function recoverStartingWorkspaceRead<T>(
  options: RecoveryOptions<T>,
): Promise<{ recovered: false } | { recovered: true; value: T }> {
  if (!['GET', 'HEAD'].includes(options.method)) {
    return { recovered: false };
  }

  const controller = new AbortController();
  const cancel = () => controller.abort(recoveryError('STREAM_ABORTED', 499));
  const remaining = options.deadline - Date.now();

  if (options.signal?.aborted) {
    throw recoveryError('STREAM_ABORTED', 499);
  }

  if (remaining <= 0) {
    return { recovered: false };
  }

  options.signal?.addEventListener('abort', cancel, { once: true });

  const timer = setTimeout(() => controller.abort(recoveryError('WORKSPACE_READ_RECOVERY_DEADLINE')), remaining);

  let onAbort: () => void;

  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  const work = async () => {
    let observation: Observation;

    try {
      observation = await options.observe(controller.signal);
    } catch {
      if (controller.signal.aborted) {
        throw controller.signal.reason;
      }

      /*
       * No STARTING evidence was admitted. Preserve the caller's original
       * transport-error classification and existing cold-start fallback.
       */
      return { recovered: false } as const;
    }

    if (observation?.status !== 'STARTING') {
      return { recovered: false } as const;
    }

    while (true) {
      if (controller.signal.aborted) {
        throw controller.signal.reason;
      }

      if (!observation || !['STARTING', 'RUNNING'].includes(observation.status ?? '')) {
        throw recoveryError('WORKSPACE_READ_RECOVERY_STOPPED');
      }

      if (observation.status === 'RUNNING' && (await options.healthy(controller.signal))) {
        if (controller.signal.aborted) {
          throw controller.signal.reason;
        }

        const value = await options.read(controller.signal, Math.max(1, options.deadline - Date.now()));

        return { recovered: true, value } as const;
      }

      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(pause);
          reject(controller.signal.reason);
        };
        const pause = setTimeout(
          () => {
            controller.signal.removeEventListener('abort', abort);
            resolve();
          },
          Math.min(250, Math.max(1, options.deadline - Date.now())),
        );
        controller.signal.addEventListener('abort', abort, { once: true });

        if (controller.signal.aborted) {
          abort();
        }
      });
      observation = await options.observe(controller.signal);
    }
  };

  try {
    return await Promise.race([work(), interrupted]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort!);

    // Abort any outstanding diagnostic fetch if its peer failed first.
    controller.abort();
  }
}

type ReadRequest = {
  aborted: boolean;
  once: (event: 'aborted', listener: () => void) => unknown;
  off: (event: 'aborted', listener: () => void) => unknown;
};
type ReadReply = {
  destroyed: boolean;
  writableFinished: boolean;
  once: (event: 'close', listener: () => void) => unknown;
  off: (event: 'close', listener: () => void) => unknown;
};

export async function withRuntimeReadCancellation<T>(
  request: ReadRequest,
  reply: ReadReply,
  read: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();

  const closed = () => {
    if (!reply.writableFinished) {
      cancel();
    }
  };
  request.once('aborted', cancel);
  reply.once('close', closed);

  if (request.aborted || reply.destroyed) {
    cancel();
  }

  try {
    return await read(controller.signal);
  } finally {
    request.off('aborted', cancel);
    reply.off('close', closed);
  }
}
