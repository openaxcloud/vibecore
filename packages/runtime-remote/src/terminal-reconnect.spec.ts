import { describe, expect, it } from 'vitest';

import {
  initialTerminalReconnectState,
  onTerminalConnectionOpened,
  onTerminalConnectionStable,
  onTerminalFrame,
  onTerminalReconnectScheduled,
  onTerminalReconnected,
} from './terminal-reconnect.js';

/*
 * BUG-UX-DEV-BLOCKED-STUCK — the endless "[terminal reconnected]" flap seen
 * live (24/08): sockets that open, stay up ~5s but deliver nothing, then die,
 * reset the backoff budget every cycle and printed the notice forever.
 */
describe('terminal reconnect policy', () => {
  it('never announces before the terminal has delivered a real frame (cold start stays silent)', () => {
    let state = initialTerminalReconnectState();

    const first = onTerminalReconnected(state);
    state = first.state;

    expect(first.announce).toBe(false);
  });

  it('announces ONCE after real output, then stays silent across further reconnects with no output in between (the spam latch)', () => {
    let state = initialTerminalReconnectState();
    state = onTerminalFrame(state);

    const first = onTerminalReconnected(state);
    state = first.state;
    expect(first.announce).toBe(true);

    // Reconnect cycles with NO frame in between: old code printed one notice per cycle.
    const second = onTerminalReconnected(state);
    state = second.state;

    const third = onTerminalReconnected(state);
    state = third.state;

    expect(second.announce).toBe(false);
    expect(third.announce).toBe(false);
  });

  it('re-arms the announce once real output flows again', () => {
    let state = initialTerminalReconnectState();
    state = onTerminalFrame(state);
    state = onTerminalReconnected(state).state; // announced

    state = onTerminalFrame(state); // shell produced output again

    expect(onTerminalReconnected(state).announce).toBe(true);
  });

  it('does NOT reset the backoff budget for a connection that held open but delivered nothing (mute flap burns the budget)', () => {
    let state = initialTerminalReconnectState();

    // 8 cycles of: schedule → open → 5s "stable" with zero frames.
    for (let cycle = 0; cycle < 8; cycle++) {
      state = onTerminalReconnectScheduled(state);
      state = onTerminalConnectionOpened(state);
      state = onTerminalConnectionStable(state);
    }

    /*
     * Old behaviour: attempts reset to 0 on every stable timeout → the cap
     * (8) was never reached and the flap never halted. New behaviour: the
     * budget is fully spent, so the caller halts with the explicit
     * "[terminal disconnected — reload or click Run]" message.
     */
    expect(state.attempts).toBe(8);
  });

  it('DOES reset the backoff budget once a connection holds AND delivers a frame (healthy occasional drop never halts)', () => {
    let state = initialTerminalReconnectState();

    state = onTerminalReconnectScheduled(state);
    state = onTerminalReconnectScheduled(state);
    state = onTerminalConnectionOpened(state);
    state = onTerminalFrame(state);
    state = onTerminalConnectionStable(state);

    expect(state.attempts).toBe(0);
  });

  it('a frame on the current connection does not leak into the next one', () => {
    let state = initialTerminalReconnectState();
    state = onTerminalFrame(state);

    // New socket bound: its own delivery record starts empty.
    state = onTerminalConnectionOpened(state);
    state = onTerminalReconnectScheduled(state);
    state = onTerminalConnectionStable(state);

    expect(state.attempts).toBe(1);
    expect(state.everWorked).toBe(true);
  });
});
