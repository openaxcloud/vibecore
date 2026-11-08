/*
 * Only structured terminal failure classifications may enter the audit artifact.
 * This function is also evaluated inside the page: keep its allowlists self-contained.
 */
export function projectTerminalFailure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const names = ['Error', 'RuntimeError', 'TypeError', 'AbortError', 'TimeoutError', 'NetworkError'];

  const codes = [
    'WORKSPACE_NOT_STARTED',
    'WORKSPACE_ID_REQUIRED',
    'WORKSPACE_START_FAILED',
    'WORKSPACE_START_TIMEOUT',
    'WEBSOCKET_UNAVAILABLE',
    'REMOTE_RUNTIME_SOCKET_FAILED',
    'REMOTE_RUNTIME_REQUEST_FAILED',
    'RUNTIME_UNAVAILABLE',
    'NETWORK_ERROR',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ABORT_ERR',
  ];

  const result = {};

  // Access data properties only: never invoke getters supplied by page content.
  for (const [key, allowed] of [
    ['name', names],
    ['code', codes],
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (descriptor && typeof descriptor.value === 'string' && allowed.includes(descriptor.value)) {
      result[key] = descriptor.value;
    }
  }

  return result;
}

export const TERMINAL_WARNING_LIMIT = 40;
export const TERMINAL_WARNING_READ_TIMEOUT_MS = 1000;

export function createTerminalWarningDiagnostics() {
  const entries = [];
  const pending = new Set();

  let attempts = 0;

  const prefixes = new Map([
    ['Managed terminal shell could not be started', 'managed'],
    ['Terminal shell could not be started', 'shell'],
  ]);

  function capture(message) {
    if (message.type() !== 'warning' || attempts >= TERMINAL_WARNING_LIMIT) {
      return;
    }

    // Cheap prefilter only. Never retain console text, which can contain secrets.
    if (![...prefixes.keys()].some((prefix) => message.text().startsWith(prefix))) {
      return;
    }

    attempts += 1;

    const task = (async () => {
      let timer;

      try {
        const read = async () => {
          const args = message.args();

          if (args.length !== 2) {
            return undefined;
          }

          const prefix = await args[0].evaluate((value) =>
            value === 'Managed terminal shell could not be started' || value === 'Terminal shell could not be started'
              ? value
              : undefined,
          );

          if (!prefixes.has(prefix)) {
            return undefined;
          }

          // Project in the browser before transferring any diagnostic object.
          const projected = await args[1].evaluate(projectTerminalFailure);

          return { source: prefixes.get(prefix), ...projectTerminalFailure(projected) };
        };
        const entry = await Promise.race([
          read(),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve(undefined), TERMINAL_WARNING_READ_TIMEOUT_MS);
          }),
        ]);

        if (entry) {
          entries.push(entry);
        }
      } catch {
        // A closing page or unserializable argument must not alter the audit verdict.
      } finally {
        clearTimeout(timer);
      }
    })();
    pending.add(task);
    void task.finally(() => pending.delete(task));
  }

  return {
    capture,
    async flush() {
      await Promise.all([...pending]);
    },
    snapshot() {
      return entries.map((entry) => ({ ...entry }));
    },
  };
}
