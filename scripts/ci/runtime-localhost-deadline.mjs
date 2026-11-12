/** Transport diagnostics only. A failed cleanup must never produce a successful guard. */
export function withinDeadline(operation, ms, label, onTimeout = () => {}) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new Error(label));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function runLocalhostGuard({ run, cleanup, forceExit, workMs = 30000, cleanupMs = 4000, hardMs = 40000 }) {
  // node:test cancellation alone does not dispose sockets or pending Playwright calls.
  const watchdog = setTimeout(() => forceExit(1), hardMs);

  let cleaned = false;
  let settled = false;
  let expired = false;

  try {
    await withinDeadline(
      async () => {
        try {
          await run();
        } finally {
          settled = true;
        }
      },
      workMs,
      'localhost_guard_deadline',
      () => {
        expired = true;
      },
    );
  } finally {
    try {
      await withinDeadline(cleanup, cleanupMs, 'localhost_guard_cleanup_deadline');
      cleaned = true;
    } finally {
      // A raced-out operation can create late handles: cleanup alone is insufficient.
      if (cleaned && settled && !expired) {
        clearTimeout(watchdog);
      }
    }
  }
}
