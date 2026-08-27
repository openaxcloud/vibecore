/**
 * Model routing by complexity (Vague C, increment 1/2 — the PURE core).
 *
 * A single generation request can range from a two-line prose answer to a
 * from-scratch multi-file scaffold. Spending a frontier model on the former is
 * pure waste: a small, fast model answers a "discuss" turn or a one-file colour
 * tweak just as well at a fraction of the cost/latency. This module decides,
 * purely and conservatively, whether a request in AUTO mode may be downgraded to
 * the provider's small model.
 *
 * STRICTLY PURE: no I/O, no stream-text import, no side effects, deterministic.
 * The caller (increment 2) supplies every env-derived flag and the model
 * usability probe; nothing here reaches outside its arguments except the
 * defensive `process.env` read in `resolveRouteTable`, guarded exactly like
 * `search-replace.ts resolveDiffMinLines` (Vite shims `process.env` to `{}` in
 * client bundles, and `process` can be undefined entirely).
 *
 * Guardrails (every downgrade must clear ALL of them):
 *   #1 An explicit (non-`auto`) model selection is NEVER routed.
 *   #2 Only `discuss`, or a single-file non-plan `smallEdit`, is eligible.
 *   #3 The provider must have a table entry AND a usable small model.
 * Anything else falls back to the frontier model — the byte-identical hard path.
 */

import { classifyTask, type OutputBudgetInput, type TaskClass } from './output-budget';
import { AUTO_MODEL } from '~/utils/constants';

/**
 * The sentinel model id that opts a request into complexity routing. When the
 * selected model equals this, `decideRoute` is free to downgrade; any concrete
 * model id is treated as an explicit, non-routable choice.
 *
 * Re-exported from `~/utils/constants` (the single, client-safe source of truth)
 * so the selector UI and this server-side router can never drift on the literal.
 */
export { AUTO_MODEL };

/** A provider's frontier (hard-task) and small (simple-task) model ids. */
export interface ProviderRoute {
  /** The capable model used for builds/scaffolds/multi-file edits. */
  frontier: string;

  /** The fast, cheap model a simple turn may be downgraded to. */
  small: string;
}

/**
 * The default cross-provider routing table, keyed by provider NAME (the value of
 * `provider.name` / `currentProvider`). Validated by product. Providers absent
 * from this table — xAI and every other provider — have NO small model and are
 * therefore NEVER routed; a simple turn on them keeps the frontier model.
 */
export const DEFAULT_ROUTE_TABLE: Record<string, ProviderRoute> = {
  Anthropic: { frontier: 'claude-opus-5', small: 'claude-haiku-4-5-20251001' },
  OpenAI: { frontier: 'gpt-4.1', small: 'gpt-4.1-mini' },
  Google: { frontier: 'gemini-2.5-pro', small: 'gemini-2.5-flash' },
};

/**
 * Reads an env bag defensively. In client bundles Vite shims `process.env` to
 * `{}` (see MEMORY: "SSR process.env empty"), and `process` may be undefined
 * entirely; either way we fall back to the default. Never throws.
 */
function readProcessEnv(): Record<string, string | undefined> {
  try {
    if (typeof process !== 'undefined' && process && process.env) {
      return process.env as Record<string, string | undefined>;
    }
  } catch {
    // process not defined in this environment — fall through
  }

  return {};
}

/** True for a plain, non-null object (a valid `ProviderRoute` container). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolve the effective routing table. Starts from `DEFAULT_ROUTE_TABLE` and,
 * if `env.MODEL_ROUTING_TABLE` holds valid JSON, merges it PER PROVIDER: a valid
 * `{ frontier, small }` entry overrides (or adds) that provider; malformed
 * entries and non-object/invalid JSON are ignored so a bad override can never
 * disable routing or throw. Env-overridable at module load, like
 * `search-replace.ts resolveDiffMinLines`.
 */
export function resolveRouteTable(
  env: Record<string, string | undefined> = readProcessEnv(),
): Record<string, ProviderRoute> {
  const table: Record<string, ProviderRoute> = { ...DEFAULT_ROUTE_TABLE };

  const raw = env.MODEL_ROUTING_TABLE;

  if (raw == null || raw === '') {
    return table;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    // Invalid JSON → defaults win.
    return table;
  }

  if (!isPlainObject(parsed)) {
    return table;
  }

  for (const [provider, entry] of Object.entries(parsed)) {
    if (
      isPlainObject(entry) &&
      typeof entry.frontier === 'string' &&
      entry.frontier !== '' &&
      typeof entry.small === 'string' &&
      entry.small !== ''
    ) {
      table[provider] = { frontier: entry.frontier, small: entry.small };
    }
  }

  return table;
}

/** The outcome of a routing decision, carrying full telemetry context. */
export interface RouteDecision {
  /** The model id to actually use for this turn. */
  model: string;

  /** True ONLY when we downgraded to a small model. */
  routed: boolean;

  /** The frontier/base model that was considered. */
  from: string;

  /** The chosen model (same as `model`). */
  to: string;

  /** Human/telemetry-readable reason for the decision. */
  reason: string;

  /** The task class this turn classified as. */
  taskClass: TaskClass;
}

/** Everything `decideRoute` needs — all env-derived flags supplied by the caller. */
export interface RouteInput {
  /** What the request asked for: `AUTO_MODEL` to opt into routing, or a concrete id. */
  selectedModel: string;

  /** The resolved provider name (matches a key in the routing table). */
  provider: string;

  /** The model to use for hard tasks in auto mode (provider frontier / DEFAULT_MODEL). */
  frontierModel: string;

  /** The classifier signals for this turn. */
  task: OutputBudgetInput;

  /**
   * Caller-supplied probe: does this small model have a usable key/registry
   * entry? Increment 2 wires `resolveUsableProvider`. Defaults to always-usable.
   */
  isProviderModelUsable?: (modelId: string) => boolean;

  /** The `MODEL_ROUTING_DISABLED` kill-switch (the caller reads the env). */
  routingDisabled?: boolean;

  /** The effective routing table (defaults to `resolveRouteTable()`). */
  table?: Record<string, ProviderRoute>;
}

/**
 * Decide whether an AUTO-mode request may be downgraded to a small model.
 *
 * Pure and conservative — a downgrade is returned ONLY when every guardrail is
 * cleared; in all other cases the frontier (byte-identical hard path) is kept.
 * See the module header for the guardrail list.
 */
export function decideRoute(input: RouteInput): RouteDecision {
  const {
    selectedModel,
    provider,
    frontierModel,
    task,
    routingDisabled = false,
    isProviderModelUsable = () => true,
    table = resolveRouteTable(),
  } = input;

  const taskClass = classifyTask(task);

  // Kill-switch: honour the exact request, never route.
  if (routingDisabled) {
    const model = selectedModel === AUTO_MODEL ? frontierModel : selectedModel;

    return { model, routed: false, from: frontierModel, to: model, reason: 'routing-disabled', taskClass };
  }

  // Guardrail #1 — an explicit concrete model selection is NEVER routed.
  if (selectedModel !== AUTO_MODEL) {
    return {
      model: selectedModel,
      routed: false,
      from: frontierModel,
      to: selectedModel,
      reason: 'explicit-selection',
      taskClass,
    };
  }

  /*
   * Guardrail #2 — eligibility. Only a prose `discuss` turn, or a single-file
   * `smallEdit` that is NOT plan-first, may be downgraded. `build`, `scaffold`,
   * any multi-file edit, and any plan-first turn stay on the frontier.
   */
  const eligibleForSmall =
    taskClass === 'discuss' || (taskClass === 'smallEdit' && (task.contextFileCount ?? 0) <= 1 && !task.planFirst);

  if (!eligibleForSmall) {
    return {
      model: frontierModel,
      routed: false,
      from: frontierModel,
      to: frontierModel,
      reason: `task-not-simple:${taskClass}`,
      taskClass,
    };
  }

  // Guardrail #3 — the provider must have a table entry AND a usable small model.
  const route = table[provider];

  if (!route) {
    return {
      model: frontierModel,
      routed: false,
      from: frontierModel,
      to: frontierModel,
      reason: 'no-small-for-provider',
      taskClass,
    };
  }

  if (!isProviderModelUsable(route.small)) {
    return {
      model: frontierModel,
      routed: false,
      from: frontierModel,
      to: frontierModel,
      reason: 'small-model-unusable',
      taskClass,
    };
  }

  // All guardrails cleared → downgrade to the small model.
  return {
    model: route.small,
    routed: true,
    from: frontierModel,
    to: route.small,
    reason: `downgraded:${taskClass}`,
    taskClass,
  };
}
