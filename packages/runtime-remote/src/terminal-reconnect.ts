/*
 * BUG-UX-DEV-BLOCKED-STUCK — pure policy for the terminal WebSocket reconnect
 * loop (openTerminal in index.ts), extracted so the flap behaviour measured
 * live can be unit-tested without sockets or timers.
 *
 * The old loop had a backoff (1s·2^n, cap 10s) and a hard cap of 8 attempts,
 * BUT it reset the attempt counter after any connection that merely stayed
 * OPEN for 5 s — even one that never delivered a single frame. A socket that
 * the infrastructure accepts and then kills every ~10–30 s (agent slot churn,
 * proxy idle-kill, half-dead pod) therefore never reached the cap: each cycle
 * reset the budget and printed another "\r\n[terminal reconnected]\r\n",
 * which is exactly the endless flap seen live (24/08, after several project
 * reopenings, together with a status bar frozen on "Dev: blocked / No port").
 *
 * Two rules fix it without hurting a genuinely healthy terminal:
 *
 *   1. The backoff budget only resets when the connection both held ~5 s AND
 *      delivered at least one real frame. A connection that opens but carries
 *      nothing is not "stable" — it keeps consuming the bounded budget, so a
 *      sustained flap now terminates in the explicit
 *      "[terminal disconnected — reload or click Run to reconnect]" halt
 *      instead of spamming forever.
 *
 *   2. "[terminal reconnected]" is LATCHED: it prints at most once until a
 *      real frame has flowed again. Consecutive reconnects with no output in
 *      between stay silent instead of scrolling the notice in a loop.
 */

export interface TerminalReconnectState {
  /* Consecutive reconnect attempts since the last confirmed-healthy connection. */
  attempts: number;

  /* A real frame was EVER delivered in this terminal session's life. */
  everWorked: boolean;

  /* A real frame was delivered on the CURRENT connection. */
  frameSinceConnect: boolean;

  /* "[terminal reconnected]" was printed and no real frame has arrived since. */
  announcedSinceLastFrame: boolean;
}

export function initialTerminalReconnectState(): TerminalReconnectState {
  return {
    attempts: 0,
    everWorked: false,
    frameSinceConnect: false,
    announcedSinceLastFrame: false,
  };
}

/* A real (non-control) frame arrived: the terminal is genuinely working. */
export function onTerminalFrame(state: TerminalReconnectState): TerminalReconnectState {
  return {
    ...state,
    everWorked: true,
    frameSinceConnect: true,
    announcedSinceLastFrame: false,
  };
}

/*
 * A reconnect just re-established the socket. Decide whether to print the
 * "[terminal reconnected]" notice: only once the terminal has ever worked
 * (cold-start retries stay silent) and only if a real frame has flowed since
 * the previous notice (the latch that kills the spam loop).
 */
export function onTerminalReconnected(state: TerminalReconnectState): {
  state: TerminalReconnectState;
  announce: boolean;
} {
  const announce = state.everWorked && !state.announcedSinceLastFrame;

  return {
    state: {
      ...state,
      frameSinceConnect: false,
      announcedSinceLastFrame: announce ? true : state.announcedSinceLastFrame,
    },
    announce,
  };
}

/* A fresh (or reconnected) socket was bound: nothing has flowed on it yet. */
export function onTerminalConnectionOpened(state: TerminalReconnectState): TerminalReconnectState {
  return { ...state, frameSinceConnect: false };
}

/*
 * The stability timer (~5 s open) fired. Only a connection that also DELIVERED
 * something earns a backoff reset; an open-but-mute socket keeps burning the
 * bounded budget so a sustained flap halts instead of flapping forever.
 */
export function onTerminalConnectionStable(state: TerminalReconnectState): TerminalReconnectState {
  if (!state.frameSinceConnect) {
    return state;
  }

  return { ...state, attempts: 0 };
}

export function onTerminalReconnectScheduled(state: TerminalReconnectState): TerminalReconnectState {
  return { ...state, attempts: state.attempts + 1 };
}
