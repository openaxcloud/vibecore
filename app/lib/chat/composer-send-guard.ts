/**
 * Pure decision logic for the chat composer's send guard + stall watchdog.
 *
 * Background: `useChat().isLoading` stays true while a generation stream is in
 * flight. If the stream stalls (LB idle drop / network blip) WITHOUT a clean
 * close or error, `isLoading` can stick true indefinitely. The composer's old
 * guard — `if (isLoading) { abort(); return; }` — then SILENTLY swallowed every
 * subsequent send (aborting a phantom stream, never posting the new message), so
 * the message was lost with no error and no `/api/chat` request.
 *
 * These helpers separate "a genuinely active stream" from "a stuck/stalled one"
 * using the time since the last stream delta, so the component can (a) let a send
 * through when the stream is stalled, and (b) surface a clear, recoverable toast
 * when a real stream is interrupted — never a silent loss.
 */

/**
 * How long the chat stream may go WITHOUT a delta before it is considered
 * stalled. Real generations emit throttled deltas continuously, so a gap this
 * long means the stream is dead (dropped) rather than merely slow.
 */
export const STREAM_STALL_MS = 50_000;

/** True when `isLoading` is set but no stream delta has arrived for `stallMs`. */
export function isStreamStalled(lastActivityMs: number, now: number, stallMs: number = STREAM_STALL_MS): boolean {
  if (!Number.isFinite(lastActivityMs) || lastActivityMs <= 0) {
    // No recorded activity yet but flagged loading → treat as stalled, not active.
    return true;
  }

  return now - lastActivityMs >= stallMs;
}

/**
 * What a Send action should do given the current stream state:
 *  - `send`           — nothing is loading; post the message normally.
 *  - `reset-and-send` — `isLoading` is stuck on a STALLED stream; reset and post
 *                       the new message instead of swallowing it.
 *  - `stop-active`    — a genuinely ACTIVE stream is running; stop it and prompt
 *                       the user to resend (never silent).
 */
export type SendDecision = 'send' | 'reset-and-send' | 'stop-active';

export function classifySend(
  isLoading: boolean,
  lastActivityMs: number,
  now: number,
  stallMs: number = STREAM_STALL_MS,
): SendDecision {
  if (!isLoading) {
    return 'send';
  }

  return isStreamStalled(lastActivityMs, now, stallMs) ? 'reset-and-send' : 'stop-active';
}
