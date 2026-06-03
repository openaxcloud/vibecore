import { LLMManager } from '~/lib/modules/llm/manager';
import { readRuntimeEnv } from '~/lib/modules/llm/runtime-env';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('provider-credentials');

export type LLMProvider = (typeof PROVIDER_LIST)[number];

/**
 * A base URL that points at the machine running the server (or a Docker host
 * alias) is only reachable for self-hosted / desktop installs where the user
 * runs Ollama or LM Studio locally. In the hosted product these key-less
 * providers must never be chosen as an automatic fallback: the request would
 * be routed to a port nothing is listening on and die with "No models found".
 */
function isLoopbackBaseUrl(baseUrl: string): boolean {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|host\.docker\.internal)([:/]|$)/i.test(
    baseUrl.trim(),
  );
}

/**
 * A provider is usable when a credential can actually be resolved for it,
 * mirroring how `BaseProvider.getModelInstance` resolves keys:
 *   1. a user-supplied key in the `apiKeys` cookie (BYO-key flows), or
 *   2. the provider's `apiTokenKey` set in serverEnv / process.env / manager.env, or
 *   3. for key-less providers (Ollama, LMStudio, OpenAILike), a base URL.
 *
 * When the picked provider is NOT usable, `getModelInstance` throws
 * "Missing API key for <provider> provider", which the client surfaces as a
 * hard "Authentication Error" and the stream dies. In the hosted product a
 * user can pick a provider we hold no managed credentials for (e.g.
 * AmazonBedrock without AWS_BEDROCK_CONFIG), so we must fall back instead of
 * failing the whole generation.
 */
export function isProviderUsable(
  provider: LLMProvider,
  apiKeys?: Record<string, string>,
  serverEnv?: Record<string, string>,
): boolean {
  const userKey = apiKeys?.[provider.name];

  if (typeof userKey === 'string' && userKey.trim().length > 0) {
    return true;
  }

  const manager = LLMManager.getInstance();

  /*
   * Read the genuine Node runtime env (globalThis.process.env). A bare
   * `process.env` is the vite browser shim with an empty `env`, so managed
   * keys set by the K8s deployment would otherwise look absent and every
   * provider would be misclassified as unusable. Mirrors base-provider's
   * getProviderBaseUrlAndKey so this check and the real LLM call agree.
   */
  const readEnv = (key?: string): string | undefined => {
    if (!key) {
      return undefined;
    }

    return serverEnv?.[key] || readRuntimeEnv(key) || manager.env?.[key];
  };

  const apiToken = readEnv(provider.config.apiTokenKey);

  if (typeof apiToken === 'string' && apiToken.trim().length > 0) {
    return true;
  }

  // Key-less providers only need a base URL (configured or built-in default).
  if (!provider.config.apiTokenKey) {
    const baseUrl = readEnv(provider.config.baseUrlKey) || provider.config.baseUrl;

    return Boolean(baseUrl && String(baseUrl).trim().length > 0);
  }

  return false;
}

/**
 * Pick the first usable provider, preferring the default provider, then the
 * remaining registered providers in order. Returns undefined when nothing is
 * credentialed (genuinely misconfigured deployment).
 */
export function pickFallbackProvider(
  apiKeys?: Record<string, string>,
  serverEnv?: Record<string, string>,
): LLMProvider | undefined {
  const ordered = [DEFAULT_PROVIDER, ...PROVIDER_LIST.filter((p) => p.name !== DEFAULT_PROVIDER.name)];

  return ordered.find(
    (provider) => isProviderUsable(provider, apiKeys, serverEnv) && isUsableAsFallback(provider, serverEnv),
  );
}

/**
 * Guard the *automatic* fallback against key-less providers that resolve to a
 * loopback base URL (LM Studio's http://localhost:1234, Ollama, ...). They pass
 * `isProviderUsable` because a default base URL exists, but in the hosted
 * product nothing listens there — picking one turns a recoverable
 * missing-credential case into a fatal "No models found" stream error. A
 * loopback key-less provider only qualifies when its base URL was explicitly
 * pointed somewhere reachable via env (self-hosted / desktop installs).
 */
function isUsableAsFallback(provider: LLMProvider, serverEnv?: Record<string, string>): boolean {
  if (provider.config.apiTokenKey) {
    return true;
  }

  const configuredBaseUrl = serverEnv?.[provider.config.baseUrlKey ?? ''] || readRuntimeEnv(provider.config.baseUrlKey);
  const effectiveBaseUrl = configuredBaseUrl || provider.config.baseUrl;

  return Boolean(effectiveBaseUrl && !isLoopbackBaseUrl(String(effectiveBaseUrl)));
}

/**
 * Resolve the provider/model an LLM call should actually use. If the requested
 * provider has no usable credentials, transparently fall back to a credentialed
 * provider (and a valid model for it) so the request never fails with a fatal
 * "Authentication Error". Shared by stream-text, create-summary and
 * select-context so every LLM path is protected.
 */
export function resolveUsableProvider(options: {
  requestedProvider: string;
  requestedModel: string;
  apiKeys?: Record<string, string>;
  serverEnv?: Record<string, string>;
}): { provider: LLMProvider; model: string } {
  const { requestedProvider, requestedModel, apiKeys, serverEnv } = options;
  const provider = PROVIDER_LIST.find((p) => p.name === requestedProvider) || DEFAULT_PROVIDER;

  if (isProviderUsable(provider, apiKeys, serverEnv)) {
    return { provider, model: requestedModel };
  }

  const fallback = pickFallbackProvider(apiKeys, serverEnv);

  if (!fallback || fallback.name === provider.name) {
    logger.error(`Provider [${provider.name}] has no usable credentials and no fallback provider is configured.`);

    return { provider, model: requestedModel };
  }

  logger.warn(`Provider [${provider.name}] has no usable credentials; falling back to [${fallback.name}].`);

  const fallbackStatic = LLMManager.getInstance().getStaticModelListFromProvider(fallback);
  const requestedModelStillValid = fallbackStatic.some((m) => m.name === requestedModel);

  if (requestedModelStillValid) {
    return { provider: fallback, model: requestedModel };
  }

  const model = fallbackStatic.find((m) => m.name === DEFAULT_MODEL)?.name ?? fallbackStatic[0]?.name ?? requestedModel;

  return { provider: fallback, model };
}
