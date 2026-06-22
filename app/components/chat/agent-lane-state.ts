/**
 * Pure resolution of a parallel-agent lane's display state.
 *
 * Background: when a user clicks Stop mid parallel-subagents run, the api.chat
 * stream is aborted before every lane emits its `lane-done` event and before
 * the terminal `agentExecution` annotation is written. The persisted assistant
 * message therefore keeps those lanes at `status: 'running'`. Without
 * reconciliation the lane tile would spin forever in chat history even though
 * the user explicitly stopped the work.
 *
 * `resolveLaneState` folds the three available signals — the final
 * `agentExecution` result (authoritative when present), the live per-lane
 * stream status, and whether a chat is currently streaming — into a single
 * terminal-aware state. A lane left `running` while NOTHING is streaming is
 * treated as stranded and reconciled to `failed` (the terminal "stopped" state
 * the lane tile already renders as a red x-circle), instead of an eternal
 * spinner.
 */
export type LaneDisplayState = 'running' | 'complete' | 'partial' | 'failed';

export interface ResolveLaneStateInput {
  /** Authoritative per-lane result from the terminal agentExecution annotation, if it arrived. */
  resultStatus?: LaneDisplayState;

  /** Live per-lane stream status accumulated from agentLaneStream annotations. */
  streamStatus?: LaneDisplayState;

  /** Whether the terminal agentExecution annotation exists for this message. */
  hasExecution: boolean;

  /** Whether a chat stream is currently in flight (global streamingState). */
  isStreaming: boolean;
}

export function resolveLaneState({
  resultStatus,
  streamStatus,
  hasExecution,
  isStreaming,
}: ResolveLaneStateInput): LaneDisplayState {
  if (hasExecution) {
    /*
     * The run completed and wrote its authoritative aggregate. Trust the
     * per-lane result; a missing result means that lane never reported, which
     * is itself a failure.
     */
    return resultStatus ?? 'failed';
  }

  const live = streamStatus ?? 'running';

  /*
   * No agentExecution annotation. If a chat is still streaming this is a
   * genuinely in-flight lane, so keep its live status (spinner included). But
   * if nothing is streaming, a lane stuck at 'running' was abandoned mid-run
   * (user pressed Stop, or an error tore the stream down before lane-done /
   * agentExecution were written) — reconcile it to a terminal 'failed' so the
   * tile shows a stopped state instead of spinning forever in history.
   */
  if (!isStreaming && live === 'running') {
    return 'failed';
  }

  return live;
}
