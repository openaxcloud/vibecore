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
/*
 * Output ceilings per task class, tripled on 2026-08-20 for Claude Opus 5.
 *
 * WHY: `max_tokens` caps thinking tokens AND the visible answer together. Every
 * previous default model (Opus 4.8, Sonnet 4.5) did NOT think unless asked, so
 * the whole budget went to the answer. Opus 5 runs ADAPTIVE THINKING BY DEFAULT
 * — omitting the `thinking` param no longer means "off" — so reasoning now eats
 * into the same ceiling. At the old `build: 8192`, a turn that thought hard
 * could spend most of the budget before emitting a single file and stop with
 * finishReason:'length' mid-file; the auto-continue would then pay for another
 * full round-trip to finish work the first call had room for.
 *
 * These are CEILINGS, not spend: you are billed for tokens generated, so raising
 * them costs nothing on turns that stay short. The ×3 keeps a wide margin under
 * the 128k completion ceiling Opus 5 declares (scaffold 49152 ≈ 38% of it), and
 * runaway output stays bounded by MAX_RESPONSE_SEGMENTS and the tenant's
 * ai.outputTokens quota. `clampToModelCeiling` still clamps per model, so a
 * smaller model (gpt-4.1 at 16384) is unaffected by the scaffold figure.
 */
export const OUTPUT_BUDGET = {
  /** Discuss / Ask / Plan — a prose answer, no file writes. */
  discuss: 6144,

  /** A one-file, clearly-scoped edit (rename, typo, colour, copy tweak). */
  smallEdit: 12288,

  /** A normal build turn (a feature, a few files). */
  build: 24576,

  /** A from-scratch / multi-file scaffold. */
  scaffold: 49152,

  /**
   * Never request fewer than this, even on a tiny model ceiling. Raised with the
   * rest: 1024 leaves a thinking model no room at all for a visible answer.
   */
  floor: 4096,
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

/**
 * Phrases that indicate a targeted, localized change (an edit to an existing
 * project), as opposed to a from-scratch build. Broad on purpose: an edit intent
 * classifies as `smallEdit` REGARDLESS of how many files are already in context
 * — a big project doesn't make "add a footer" a large generation. Under-sizing is
 * safe (auto-continuation finishes anything longer), so we bias small edits down.
 */
const SMALL_EDIT_SIGNALS = [
  // edit verbs
  'add ',
  'insert ',
  'change ',
  'update ',
  'remove ',
  'delete ',
  'rename',
  'fix ',
  'tweak',
  'adjust',
  'edit ',
  'replace ',
  'move ',
  'wrap ',
  'restyle',
  'style ',

  // common small-change UI targets
  'footer',
  'header',
  'navbar',
  'nav bar',
  'button',
  'label',
  'title',
  'heading',
  'link',
  'icon',
  'color',
  'colour',
  'padding',
  'margin',
  'font',
  'border',
  'background',
  'placeholder',
  'tooltip',
  'typo',
  'one line',
  'small change',
];

/** Max prompt length (chars) still treated as a targeted edit. Longer → a broader change. */
const SMALL_EDIT_MAX_LEN = 220;

/**
 * Strip prepended file artifacts from a user message so the budget is classified
 * on the REAL instruction, not the bytes of the modified files.
 *
 * On an edit turn the composer prepends `filesToArtifacts(...)` — a
 * `<boltArtifact …>…<boltAction …>file contents…</boltAction>…</boltArtifact>`
 * block — BEFORE the user's actual instruction. That inflated the measured length
 * past the 400-char "scaffold" threshold, so "make footer bold" on a project with
 * modified files was mis-sized as a from-scratch build. Removing the artifact
 * blocks leaves just the trailing instruction to classify.
 */
export function stripFileArtifacts(text: string): string {
  return text
    .replace(/<boltArtifact[^>]*>[\s\S]*?<\/boltArtifact>/gi, ' ')
    .replace(/<boltAction[^>]*>[\s\S]*?<\/boltAction>/gi, ' ')
    .trim();
}

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
 * The four task classes a turn can fall into. Each maps 1:1 onto an
 * `OUTPUT_BUDGET` ceiling, and (increment 2) drives model routing by complexity.
 */
export type TaskClass = 'discuss' | 'smallEdit' | 'build' | 'scaffold';

/**
 * Classify a turn into its task class. This is the EXACT class-decision logic
 * that used to live inline in `estimateOutputBudget` — extracted verbatim so the
 * same signals can drive both the output budget AND model routing. Pure and
 * deterministic; no thresholds or signal lists changed.
 */
export function classifyTask(input: OutputBudgetInput): TaskClass {
  /*
   * Reasoning models spend hidden thinking tokens against the same ceiling —
   * never shrink them, keep the generous budget so reasoning isn't cut off.
   */
  if (input.isReasoningModel) {
    return 'scaffold';
  }

  // Discuss / Ask / Plan is a prose answer — the smallest class.
  if (input.chatMode !== 'build') {
    return 'discuss';
  }

  // Classify on the real instruction, not the prepended file-artifact bytes.
  const text = stripFileArtifacts(input.lastUserMessage ?? '').toLowerCase();

  /*
   * A genuine from-scratch build: the composer's Plan toggle, an explicit
   * "build/create a …" phrase, or a long, detailed brief. This is checked FIRST
   * so a scaffold is never mis-sized down. Deliberately NOT keyed on the context
   * file count — the number of files ALREADY in the project says nothing about
   * whether THIS turn is a from-scratch build or a one-line edit.
   */
  const looksLikeScaffold =
    input.planFirst === true || text.length >= 400 || SCAFFOLD_SIGNALS.some((signal) => text.includes(signal));

  if (looksLikeScaffold) {
    return 'scaffold';
  }

  /*
   * A targeted edit intent — sized small REGARDLESS of context file count (the
   * bug this fixes: "add a footer" on a 6-file project was mis-classed as a
   * scaffold). Short prompt + an edit signal ⇒ smallEdit; auto-continuation
   * finishes the rare edit that needs more, so under-sizing never truncates.
   */
  const looksLikeTargetedEdit =
    text.length > 0 && text.length <= SMALL_EDIT_MAX_LEN && SMALL_EDIT_SIGNALS.some((signal) => text.includes(signal));

  if (looksLikeTargetedEdit) {
    return 'smallEdit';
  }

  // Anything else (a feature-sized change, or a vague prompt) is a normal build turn.
  return 'build';
}

/**
 * Estimate the output-token ceiling for a turn from its task class. Pure and
 * exported for unit testing; the caller clamps the result to the model ceiling.
 * Byte-for-byte equivalent to the previous inline logic: it now delegates the
 * class decision to `classifyTask` and looks the ceiling up in `OUTPUT_BUDGET`.
 */
export function estimateOutputBudget(input: OutputBudgetInput): number {
  return OUTPUT_BUDGET[classifyTask(input)];
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
