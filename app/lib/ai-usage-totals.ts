export interface AiUsageRecord {
  inputTokens?: unknown;
  promptTokens?: unknown;
  outputTokens?: unknown;
  completionTokens?: unknown;
  costCents?: unknown;
  costUsd?: unknown;
}

function nonnegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

/** Ledger cents are USD cents; absent/invalid estimates must never become a free call. */
export function totalAiUsage(records: readonly AiUsageRecord[]) {
  let inputTokens = 0;
  let outputTokens = 0;
  let knownCostUsd = 0;
  let missingCosts = 0;

  for (const record of records) {
    inputTokens += nonnegativeNumber(record.inputTokens ?? record.promptTokens) ?? 0;
    outputTokens += nonnegativeNumber(record.outputTokens ?? record.completionTokens) ?? 0;

    const cents = nonnegativeNumber(record.costCents);

    const costUsd =
      record.costCents != null ? (cents === null ? null : cents / 100) : nonnegativeNumber(record.costUsd);

    if (costUsd === null) {
      missingCosts += 1;
    } else {
      knownCostUsd += costUsd;
    }
  }

  return {
    inputTokens,
    outputTokens,

    // No partial sum is presented as a complete estimate, including an empty/error response.
    costUsd: records.length > 0 && missingCosts === 0 ? knownCostUsd : null,
    missingCosts,
  };
}
