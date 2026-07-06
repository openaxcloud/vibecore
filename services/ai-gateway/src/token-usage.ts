/*
 * Token-usage accounting for a multi-agent run. Aggregates the per-lane usage
 * the gateway already reports so a generation's cost is measurable — and, so the
 * duplication is visible, surfaces how many INPUT tokens were spent re-sending
 * the SAME shared context (system + user + specs) to every lane.
 *
 * Pure + exported so the numbers are unit-testable without a live model call.
 */

export interface LaneTokenUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
}

export interface RunTokenUsage {
  /** Lanes that actually produced usage (a failed lane reports none). */
  laneCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostCents: number;
  /** Tokens in the context shared by every lane (counted once). */
  sharedContextTokens: number;
  /**
   * Input tokens spent RE-SENDING that shared context to the 2nd..Nth lane —
   * the redundant cost of fanning the same context out to N parallel lanes.
   * `sharedContextTokens * max(0, laneCount - 1)`.
   */
  duplicatedInputTokens: number;
}

export function summarizeRunTokenUsage(
  usages: ReadonlyArray<LaneTokenUsage | undefined>,
  sharedContextTokens = 0,
): RunTokenUsage {
  let laneCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let estimatedCostCents = 0;

  for (const usage of usages) {
    if (!usage) {
      continue;
    }

    laneCount += 1;
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    estimatedCostCents += usage.estimatedCostCents;
  }

  const safeShared =
    Number.isFinite(sharedContextTokens) && sharedContextTokens > 0 ? Math.round(sharedContextTokens) : 0;

  return {
    laneCount,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostCents,
    sharedContextTokens: safeShared,
    duplicatedInputTokens: safeShared * Math.max(0, laneCount - 1),
  };
}
