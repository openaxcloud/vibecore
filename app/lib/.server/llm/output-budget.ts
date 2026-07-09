/**
 * Adaptive output-token budget for the main generation call.
 *
 * Historically stream-text requested the model's FULL completion ceiling on
 * every call (Anthropic 64k, OpenAI 16k, Google 8k) regardless of task size.
 * `max_tokens` is a ceiling, not a spend, but a needlessly high one still hurts:
 * Anthropic counts it against the output rate limit (reserving throughput) and
 * reasoning models have no natural stop. This sizes the ceiling to the task
 * class instead.
 *
 * Safety: the estimate is only a ceiling. The model's real completion limit
 * stays the hard upper bound (clampOutputBudget), and stream-text's
 * MAX_RESPONSE_SEGMENTS auto-continuation still finishes any output that runs
 * past a conservative estimate — so under-sizing never truncates a generation,
 * it just spills into another (now prompt-cached) segment. For OpenAI, a
 * from-scratch build lands in the `scaffold` class whose budget already equals
 * the OpenAI ceiling, so the certified build path is byte-for-byte unchanged.
 */

/** Per-task-class output ceilings (tokens). Conservative — biased to the larger class when unsure. */
export const OUTPUT_BUDGET = {
  /** Discuss / Ask / Plan — a prose answer, no file writes. */
  discuss: 2048,

  /** A one-file, clearly-scoped edit (rename, typo, colour, copy tweak). */
  smallEdit: 4096,

  /** A normal build turn (a feature, a few files). */
  build: 8192,

  /** A from-scratch / multi-file scaffold. */
  scaffold: 16384,

  /** Never request fewer than this, even on a tiny model ceiling. */
  floor: 1024,
} as const;

/** Phrases that reliably indicate a large, multi-file generation. */
const SCAFFOLD_SIGNALS = [
  'build a',
  'build an',
  'build me',
  'create a',
  'create an',
  'make a',
  'make an',
  'generate a',
  'scaffold',
  'full app',
  'full-stack',
  'from scratch',
  'landing page',
  'dashboard',
  'boilerplate',
  'clone of',
  'multi-page',
  'multiple files',
];

/** Phrases that reliably indicate a small, localized change. */
const SMALL_EDIT_SIGNALS = [
  'fix ',
  'rename',
  'typo',
  'tweak',
  'adjust',
  'change the color',
  'change the colour',
  'update the text',
  'update the copy',
  'one line',
  'small change',
];

export interface OutputBudgetInput {
  chatMode?: string;

  /** The latest user message text (already stripped of the [Model]/[Provider] prefix). */
  lastUserMessage?: string;

  /** How many files are in the context buffer for this turn. */
  contextFileCount?: number;

  /** The composer's "Plan" toggle / an enabled multi-agent decomposition. */
  planFirst?: boolean;

  /** o1/o3/gpt-5 etc. — hidden reasoning tokens draw on the same budget. */
  isReasoningModel?: boolean;
}

/**
 * Estimate the output-token ceiling for a turn from its task class. Pure and
 * exported for unit testing; the caller clamps the result to the model ceiling.
 */
export function estimateOutputBudget(input: OutputBudgetInput): number {
  /*
   * Reasoning models spend hidden thinking tokens against the same ceiling —
   * never shrink them, keep the generous budget so reasoning isn't cut off.
   */
  if (input.isReasoningModel) {
    return OUTPUT_BUDGET.scaffold;
  }

  // Discuss / Ask / Plan is a prose answer — the smallest class.
  if (input.chatMode !== 'build') {
    return OUTPUT_BUDGET.discuss;
  }

  const text = (input.lastUserMessage ?? '').toLowerCase();
  const fileCount = input.contextFileCount ?? 0;

  const looksLikeScaffold =
    input.planFirst === true ||
    text.length >= 400 ||
    fileCount >= 6 ||
    SCAFFOLD_SIGNALS.some((signal) => text.includes(signal));

  if (looksLikeScaffold) {
    return OUTPUT_BUDGET.scaffold;
  }

  const looksLikeSmallEdit =
    text.length > 0 &&
    text.length < 160 &&
    fileCount <= 2 &&
    SMALL_EDIT_SIGNALS.some((signal) => text.includes(signal));

  if (looksLikeSmallEdit) {
    return OUTPUT_BUDGET.smallEdit;
  }

  // Anything else is a normal build turn.
  return OUTPUT_BUDGET.build;
}

/**
 * Clamp an estimate into `[floor, modelCeiling]`. The model's real completion
 * limit is the hard upper bound (so we never trip a provider "max_tokens too
 * large" rejection); the floor guards against a pathologically small ceiling.
 */
export function clampOutputBudget(estimate: number, modelCeiling: number): number {
  const ceiling = modelCeiling > 0 ? modelCeiling : OUTPUT_BUDGET.scaffold;

  return Math.max(Math.min(estimate, ceiling), Math.min(OUTPUT_BUDGET.floor, ceiling));
}
