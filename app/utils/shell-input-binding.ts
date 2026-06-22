import type { ITerminal } from '~/types/terminal';

/**
 * Minimal disposable shape. xterm's `Terminal.onData` returns an
 * `IDisposable` (`{ dispose(): void }`) that stops the listener, but the
 * `ITerminal` contract erases the return type to `void`. We re-derive the
 * disposable at runtime so input bindings can be torn down on restart.
 */
export interface ITerminalInputDisposable {
  dispose: () => void;
}

/*
 * Restarting a shell (Restart Shell button, action-runner re-init) reuses the
 * SAME xterm instance but spawns a fresh PTY session, then registers a new
 * `terminal.onData` handler. xterm.js appends listeners — it never replaces
 * them — so after N restarts a single keystroke fires N handlers, each writing
 * to a different (mostly dead) session. That is a listener leak plus duplicate
 * stdin dispatch to stale PTYs. We track the live binding per terminal and
 * dispose the previous one before registering the next.
 */
const activeBindings = new WeakMap<ITerminal, ITerminalInputDisposable>();

function isDisposable(value: unknown): value is ITerminalInputDisposable {
  return (
    typeof value === 'object' && value !== null && typeof (value as ITerminalInputDisposable).dispose === 'function'
  );
}

/**
 * Register an onData handler on the terminal, first disposing any handler this
 * helper previously registered on the same terminal. Returns a disposable that
 * also clears the tracked binding, so callers can tear it down explicitly
 * (e.g. on detach) without leaking a stale entry in the WeakMap.
 */
export function bindTerminalInput(terminal: ITerminal, handler: (data: string) => void): ITerminalInputDisposable {
  disposeTerminalInput(terminal);

  /*
   * `ITerminal.onData` is typed `=> void`, but the concrete xterm Terminal
   * returns an IDisposable. Capture it at runtime to drive disposal.
   */
  const maybeDisposable = (terminal.onData as (cb: (data: string) => void) => unknown)(handler);

  const binding: ITerminalInputDisposable = {
    dispose: () => {
      if (isDisposable(maybeDisposable)) {
        maybeDisposable.dispose();
      }

      if (activeBindings.get(terminal) === binding) {
        activeBindings.delete(terminal);
      }
    },
  };

  activeBindings.set(terminal, binding);

  return binding;
}

/**
 * Dispose the input handler this helper registered on the given terminal, if
 * any. Safe to call when nothing is bound.
 */
export function disposeTerminalInput(terminal: ITerminal): void {
  const existing = activeBindings.get(terminal);

  if (existing) {
    existing.dispose();
  }
}
