/**
 * Server-side content moderation for the /projects/new prompt. Calls
 * OpenAI's free `/v1/moderations` endpoint with the `omni-moderation-latest`
 * model — the only moderation API that's both production-grade and free of
 * per-call cost, which is what we need to gate every project creation.
 *
 * Design choices:
 *
 *  - **Real call.** When `OPENAI_API_KEY` is configured the prompt
 *    is sent to OpenAI, the response is parsed, and we block the action if
 *    any category is flagged.
 *
 *  - **Fail-open with a signal.** If the key is missing OR the API is
 *    unreachable, we return `{ allowed: true, checked: false, reason }`.
 *    The caller can log the reason to telemetry and (in stricter
 *    deployments) reject. We do NOT fail-closed because a transient OpenAI
 *    outage would block every project creation, which is worse than letting
 *    one ambiguous prompt through.
 *
 *  - **Explicit categories.** The caller receives the flagged category list
 *    so it can show the user *why* the prompt was rejected ("sexual /
 *    violence / harassment / …") rather than a generic "blocked".
 *
 *  - Server-only: this file ends in `.server.ts` so Remix tree-shakes it
 *    out of the client bundle and the API key never leaks.
 */

export type ModerationCategory =
  | 'sexual'
  | 'sexual/minors'
  | 'hate'
  | 'hate/threatening'
  | 'harassment'
  | 'harassment/threatening'
  | 'self-harm'
  | 'self-harm/intent'
  | 'self-harm/instructions'
  | 'violence'
  | 'violence/graphic'
  | 'illicit'
  | 'illicit/violent';

export type ModerationSkipReason = 'no_provider_configured' | 'provider_error' | 'empty_input';

export interface ModerationResult {
  /** True when the prompt is safe to forward to the LLM. */
  allowed: boolean;

  /**
   * True when the moderation provider was actually reached. False means we
   * fail-opened on a missing key or a transport error — callers should log
   * this and may choose to reject in stricter deployments.
   */
  checked: boolean;

  /** When `checked: false`, why. Always undefined when `checked: true`. */
  reason?: ModerationSkipReason;

  /** Stable internal diagnostic code. Never rendered or serialized. */
  error?: string;

  /** Provider HTTP status for operator telemetry, when available. */
  providerStatus?: number;

  /** Categories OpenAI flagged. Empty when allowed or unchecked. */
  flaggedCategories: ModerationCategory[];

  /** Raw category scores (0–1). Empty when unchecked. */
  scores: Partial<Record<ModerationCategory, number>>;
}

export interface ModerateProjectPromptOptions {
  /**
   * Object returned by Remix `context.cloudflare.env` (or process.env on
   * Node). The function looks up `OPENAI_API_KEY` on it.
   */
  serverEnv?: Record<string, string | undefined> | undefined;

  /** Override the OpenAI moderations endpoint — test seam. */
  endpoint?: string;

  /** Override the moderation model. Defaults to `omni-moderation-latest`. */
  model?: string;

  /** AbortSignal so callers can cancel a slow moderation request. */
  signal?: AbortSignal;

  /** Override `fetch` for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/moderations';
const DEFAULT_MODEL = 'omni-moderation-latest';

interface OpenAIModerationResponseResult {
  flagged: boolean;
  categories: Partial<Record<ModerationCategory, boolean>>;
  category_scores: Partial<Record<ModerationCategory, number>>;
}

interface OpenAIModerationResponse {
  id?: string;
  model?: string;
  results?: OpenAIModerationResponseResult[];
}

function readApiKey(env: ModerateProjectPromptOptions['serverEnv']): string | undefined {
  if (!env || typeof env !== 'object') {
    return undefined;
  }

  const value = env.OPENAI_API_KEY;

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickFlagged(result: OpenAIModerationResponseResult): ModerationCategory[] {
  const categories = result.categories ?? {};

  return (Object.keys(categories) as ModerationCategory[]).filter((category) => categories[category] === true);
}

/**
 * Moderate a prompt. Always returns — never throws — so the caller can fold
 * the result into a single error path.
 */
export async function moderateProjectPrompt(
  prompt: string,
  options: ModerateProjectPromptOptions = {},
): Promise<ModerationResult> {
  if (!prompt || !prompt.trim()) {
    return {
      allowed: true,
      checked: false,
      reason: 'empty_input',
      flaggedCategories: [],
      scores: {},
    };
  }

  const apiKey = readApiKey(options.serverEnv);

  if (!apiKey) {
    return {
      allowed: true,
      checked: false,
      reason: 'no_provider_configured',
      flaggedCategories: [],
      scores: {},
    };
  }

  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const model = options.model ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;

  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: prompt }),
      signal: options.signal,
    });
  } catch {
    return {
      allowed: true,
      checked: false,
      reason: 'provider_error',
      error: 'MODERATION_TRANSPORT_ERROR',
      flaggedCategories: [],
      scores: {},
    };
  }

  if (!response.ok) {
    return {
      allowed: true,
      checked: false,
      reason: 'provider_error',
      error: 'MODERATION_HTTP_ERROR',
      providerStatus: response.status,
      flaggedCategories: [],
      scores: {},
    };
  }

  let payload: OpenAIModerationResponse;

  try {
    payload = (await response.json()) as OpenAIModerationResponse;
  } catch {
    return {
      allowed: true,
      checked: false,
      reason: 'provider_error',
      error: 'MODERATION_INVALID_JSON',
      flaggedCategories: [],
      scores: {},
    };
  }

  const result = payload.results?.[0];

  if (!result) {
    return {
      allowed: true,
      checked: false,
      reason: 'provider_error',
      error: 'MODERATION_RESULTS_MISSING',
      flaggedCategories: [],
      scores: {},
    };
  }

  const flaggedCategories = pickFlagged(result);
  const scores = (result.category_scores ?? {}) as ModerationResult['scores'];

  return {
    allowed: !result.flagged && flaggedCategories.length === 0,
    checked: true,
    flaggedCategories,
    scores,
  };
}

/**
 * Human-readable phrase for the flagged categories, used in the action's
 * user-facing error message.
 */
export function describeFlaggedCategories(categories: readonly ModerationCategory[]): string {
  if (categories.length === 0) {
    return 'content policy';
  }

  const labels = categories.map((category) => category.replace('/', ' / '));

  if (labels.length === 1) {
    return labels[0]!;
  }

  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
