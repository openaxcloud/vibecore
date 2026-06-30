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

/**
 * Extract human-readable prose from a specialist lane's live stream text.
 *
 * The ai-gateway streams each lane's STRUCTURED result token-by-token, so the
 * accumulated `agentLaneStream` delta text is a partial JSON object being built
 * up, e.g. `{"summary":"Designed the data model` mid-stream. Rendering that raw
 * fragment in the lane tile shows the user a wall of JSON punctuation that looks
 * broken. This pulls just the `summary` string value out of the (possibly
 * incomplete) JSON so the tile streams clean prose, falling back to undefined
 * when no summary content has arrived yet (caller then shows the role
 * description placeholder instead of raw JSON).
 *
 * Pure + exported for unit testing across the partial-JSON states.
 */
export function extractLaneStreamSummary(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }

  const trimmed = text.trim();

  if (!trimmed) {
    return undefined;
  }

  // A fully-formed JSON object: trust the parsed summary (or first string field).
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const summary = parsed.summary ?? parsed.text ?? parsed.message;

      if (typeof summary === 'string' && summary.trim()) {
        return summary.trim();
      }
    } catch {
      // Fall through to the partial-extraction path below.
    }
  }

  // Partial JSON mid-stream: pull the (possibly unterminated) "summary" value.
  const keyMatch = trimmed.match(/"summary"\s*:\s*"/);

  if (keyMatch && keyMatch.index !== undefined) {
    const valueStart = keyMatch.index + keyMatch[0].length;

    let result = '';

    for (let i = valueStart; i < trimmed.length; i++) {
      const char = trimmed[i];

      if (char === '\\') {
        // Unescape the common JSON escapes; pass the next char through literally.
        const next = trimmed[i + 1];
        result += next === 'n' ? '\n' : next === 't' ? '\t' : (next ?? '');
        i++;
        continue;
      }

      if (char === '"') {
        // Reached the closing quote of a complete summary value.
        break;
      }

      result += char;
    }

    const cleaned = result.trim();

    return cleaned || undefined;
  }

  /*
   * Not (yet) recognisable structured output: if it doesn't look like JSON at
   * all, the gateway emitted plain prose — show it. If it looks like JSON we
   * haven't been able to extract from yet (`{`, `{"sum`), suppress it so the
   * tile shows the placeholder rather than raw punctuation.
   */
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return undefined;
  }

  return trimmed;
}
