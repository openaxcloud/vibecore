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

/**
 * Grace period after an AUTHORITATIVE terminal completion signal before the
 * client force-closes a stream that `isLoading` still reports as active.
 *
 * The server writes a `progress { label:'response', status:'complete' }`
 * annotation right before it closes the stream on a normal (`finishReason !==
 * 'length'`) finish. If the transport's terminal `finish_message`/close is then
 * dropped (LB idle-drop after the last byte — a documented infra failure mode),
 * `useChat().isLoading` sticks true and the "Stop running" chip hangs for the
 * full 50s stall window, blocking the next send. Since the completion annotation
 * itself DID reach the client, we can treat it as authoritative and release the
 * stream far sooner. The short grace lets a healthy stream close on its own first
 * (so we never truncate a normal finish).
 */
export const RESPONSE_COMPLETE_GRACE_MS = 3_000;

/**
 * Count the AUTHORITATIVE terminal completion annotations in a `useChat().data`
 * array — the `progress { label:'response', status:'complete' }` payloads the
 * server writes on a clean finish. Pure + exported so the "fresh completion"
 * detection (a NEW completion since the last one handled) is unit-testable.
 *
 * Only the terminal (non-`length`) finish writes this annotation, so a rising
 * count is an unambiguous "this turn is done" signal — never a mid-stream event.
 */
export function countResponseCompletions(chatData: unknown): number {
  if (!Array.isArray(chatData)) {
    return 0;
  }

  let count = 0;

  for (const item of chatData) {
    if (
      item !== null &&
      typeof item === 'object' &&
      (item as { type?: unknown }).type === 'progress' &&
      (item as { label?: unknown }).label === 'response' &&
      (item as { status?: unknown }).status === 'complete'
    ) {
      count += 1;
    }
  }

  return count;
}
