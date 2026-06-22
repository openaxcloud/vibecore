/**
 * Run a shell-init operation while guaranteeing the readiness resolver is
 * always invoked exactly once — even when init throws.
 *
 * BoltShell.ready() returns a promise that only settles when `#initialized()`
 * runs. If init() throws before reaching that call (e.g. openTerminal rejects
 * on a workspace 502 / WORKSPACE_NOT_STARTED, or a missing-workspace guard
 * throws on the first POST), the resolver never fires and ready() hangs
 * forever — so action-runner's `await shell.ready()` blocks and the agent can
 * never run a command. The terminal catch-handler fixes the visible error but
 * not the stuck promise.
 *
 * This wrapper settles readiness in a `finally`, then re-throws so the caller
 * (terminal.ts attachBoltTerminal) can still surface the failure to xterm. The
 * `settled` guard makes the resolver idempotent, so calling it again on the
 * success path is a harmless no-op.
 */
export async function runSettlingReady(init: () => Promise<void>, settleReady: () => void): Promise<void> {
  let settled = false;

  const settleOnce = () => {
    if (settled) {
      return;
    }

    settled = true;
    settleReady();
  };

  try {
    await init();
  } finally {
    settleOnce();
  }
}
