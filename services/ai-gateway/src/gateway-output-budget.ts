/**
 * Adaptive output-token budget for the ai-gateway lane / completion path.
 *
 * The gateway has NO auto-continuation (unlike the web path's up-to-8 segments),
 * so under-sizing `max_tokens` here TRUNCATES the response — there is no second
 * segment to finish it. The classifier is therefore biased UP: every class is at
 * least as large as the old flat `DEFAULT_MAX_OUTPUT_TOKENS` (4096), so switching
 * from the flat default to this estimate can only ever give a task MORE room,
 * never less. It is a mirror of the web path's `output-budget.ts` intent, kept as
 * a separate local module because a service cannot import across the app/service
 * boundary.
 *
 * This is only consulted when the caller did NOT pin `maxTokens`; an explicit
 * `maxTokens` is always honoured (clamped to the model ceiling) with zero change.
 */

/** Per-task-class output ceilings (tokens), all >= the old flat 4096 default. */
export const GATEWAY_OUTPUT_BUDGET = {
  /** Discuss / plan-only / short Q&A — a prose answer, minimal file writes. */
  discuss: 4096,

  /** A normal build/edit turn. */
  normal: 8192,

  /** A from-scratch / multi-file scaffold — clamped to the model ceiling by the caller. */
  scaffold: 16384,

  /** Never estimate below this, even before the model-ceiling clamp. */
  floor: 2048,
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

/** Phrases that reliably indicate a short, no-code prose turn. */
const DISCUSS_SIGNALS = [
  'explain',
  'what is',
  'what are',
  'how does',
  'how do i',
  'why does',
  'summarize',
  'summarise',
  'describe',
  'tell me about',
  'plan only',
  'just discuss',
];

export interface GatewayOutputBudgetInput {
  /** The latest user message text. */
  lastUserMessage?: string;

  /** Optional caller mode hint (e.g. 'discuss' | 'plan' | 'build'), when present on the request. */
  mode?: string;
}

/**
 * Estimate the output-token ceiling for a gateway turn from its task class. Pure
 * and exported for unit testing; the caller clamps the result to the model
 * ceiling. Biased UP — the default (unclassified) turn is a `normal` build, and
 * the smallest class equals the old flat 4096 default, so this never under-sizes
 * a task relative to the previous behaviour.
 */
export function estimateGatewayOutputBudget(input: GatewayOutputBudgetInput): number {
  const text = (input.lastUserMessage ?? '').toLowerCase();
  const mode = (input.mode ?? '').toLowerCase();

  // A long prompt or an explicit scaffold phrase → the largest class.
  const looksLikeScaffold = text.length >= 400 || SCAFFOLD_SIGNALS.some((signal) => text.includes(signal));

  if (looksLikeScaffold) {
    return GATEWAY_OUTPUT_BUDGET.scaffold;
  }

  // A clearly discuss/plan-only, short prose turn → the smallest class.
  const looksLikeDiscuss =
    mode === 'discuss' ||
    mode === 'plan' ||
    (text.length > 0 && text.length < 240 && DISCUSS_SIGNALS.some((signal) => text.includes(signal)));

  if (looksLikeDiscuss) {
    return GATEWAY_OUTPUT_BUDGET.discuss;
  }

  // Everything else is a normal build turn (the safe default).
  return GATEWAY_OUTPUT_BUDGET.normal;
}

/**
 * Clamp an estimate into `[floor, modelCeiling]`. The model's real completion
 * limit is the hard upper bound (never trip a provider "max_tokens too large"
 * rejection); the floor guards against a pathologically small estimate.
 */
export function clampGatewayOutputBudget(estimate: number, modelCeiling: number): number {
  const ceiling = modelCeiling > 0 ? modelCeiling : GATEWAY_OUTPUT_BUDGET.scaffold;

  return Math.max(Math.min(estimate, ceiling), Math.min(GATEWAY_OUTPUT_BUDGET.floor, ceiling));
}
