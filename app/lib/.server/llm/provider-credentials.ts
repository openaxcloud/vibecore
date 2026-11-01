import { LLMManager } from '~/lib/modules/llm/manager';
import { readRuntimeEnv } from '~/lib/modules/llm/runtime-env';
import { streamErrorCodeMessages } from '~/types/context';
import type { IProviderSetting } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('provider-credentials');
const MISSING_CREDENTIALS = 'missing-credentials' as const;

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
  providerSettings?: Record<string, IProviderSetting>,
): boolean {
  const { apiKey, baseUrl } = provider.getProviderBaseUrlAndKey({
    apiKeys,
    serverEnv,
    providerSettings: providerSettings?.[provider.name],
    defaultApiTokenKey: provider.config.apiTokenKey ?? '',
    defaultBaseUrlKey: provider.config.baseUrlKey ?? '',
  });
  return provider.config.apiTokenKey ? Boolean(apiKey) : Boolean(baseUrl);
}

/**
 * Pick the first usable provider, preferring the default provider, then the
 * remaining registered providers in order. Returns undefined when nothing is
 * credentialed (genuinely misconfigured deployment).
 */
export function pickFallbackProvider(
  apiKeys?: Record<string, string>,
  serverEnv?: Record<string, string>,
  providerSettings?: Record<string, IProviderSetting>,
): LLMProvider | undefined {
  const ordered = [DEFAULT_PROVIDER, ...PROVIDER_LIST.filter((p) => p.name !== DEFAULT_PROVIDER.name)];

  return ordered.find(
    (provider) =>
      isProviderUsable(provider, apiKeys, serverEnv, providerSettings) && isUsableAsFallback(provider, serverEnv),
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
 * Resolve credentials under the caller's routing policy. An explicit empty
 * chain forbids substitution; a declared chain only permits its candidates.
 * An absent chain preserves the legacy registry order for callers without a
 * routing card (including summaries/context). Every substitution is returned
 * with its provenance so generation can announce the final destination.
 */
export type CredentialProviderChoice = {
  provider: LLMProvider;
  model: string;
  switchedFrom?: { provider: string; model: string; reason: 'missing-credentials' };
};

export function resolveUsableProvider(options: {
  requestedProvider: string;
  requestedModel: string;
  chaine?: readonly { provider: string; model: string }[];
  apiKeys?: Record<string, string>;
  serverEnv?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
}): CredentialProviderChoice {
  const { requestedProvider, requestedModel, apiKeys, serverEnv, providerSettings, chaine } = options;
  const requested = PROVIDER_LIST.find((p) => p.name === requestedProvider);

  if (!requested && chaine !== undefined) {
    throw Object.assign(new Error(streamErrorCodeMessages.MODEL_NOT_FOUND), {
      code: 'MODEL_NOT_FOUND',
      isRetryable: false,
    });
  }

  const provider = requested ?? DEFAULT_PROVIDER;

  if (isProviderUsable(provider, apiKeys, serverEnv, providerSettings)) {
    return { provider, model: requestedModel };
  }

  const declared = chaine?.find((step) => {
    const candidate = PROVIDER_LIST.find((entry) => entry.name === step.provider);
    return (
      candidate && candidate.name !== provider.name && isProviderUsable(candidate, apiKeys, serverEnv, providerSettings)
    );
  });
  const fallback =
    chaine === undefined
      ? pickFallbackProvider(apiKeys, serverEnv, providerSettings)
      : PROVIDER_LIST.find((entry) => entry.name === declared?.provider);

  if (!fallback || fallback.name === provider.name) {
    logger.error(`Provider [${provider.name}] has no usable credentials and no fallback provider is configured.`);

    return { provider, model: requestedModel };
  }

  logger.warn(`Provider [${provider.name}] has no usable credentials; falling back to [${fallback.name}].`);

  const switchedFrom = {
    provider: provider.name,
    model: requestedModel,
    reason: MISSING_CREDENTIALS,
  };

  if (declared) {
    return { provider: fallback, model: declared.model, switchedFrom };
  }

  const fallbackStatic = LLMManager.getInstance().getStaticModelListFromProvider(fallback);
  const requestedModelStillValid = fallbackStatic.some((m) => m.name === requestedModel);

  if (requestedModelStillValid) {
    return { provider: fallback, model: requestedModel, switchedFrom };
  }

  const model = fallbackStatic.find((m) => m.name === DEFAULT_MODEL)?.name ?? fallbackStatic[0]?.name ?? requestedModel;

  return { provider: fallback, model, switchedFrom };
}

/** Auxiliary work must not silently substitute a provider on a card-governed turn. */
export type AuxiliaryProviderRoute = Readonly<{
  primary: { provider: string; model: string };
  fallback: null;
}>;

export function resolveAuxiliaryProvider(
  options: Parameters<typeof resolveUsableProvider>[0] & { routing?: AuxiliaryProviderRoute },
): CredentialProviderChoice {
  const resolved = resolveUsableProvider({
    ...options,
    ...(options.routing
      ? {
          requestedProvider: options.routing.primary.provider,
          requestedModel: options.routing.primary.model,
          chaine: [],
        }
      : {}),
  });

  if (
    options.routing &&
    !isProviderUsable(resolved.provider, options.apiKeys, options.serverEnv, options.providerSettings)
  ) {
    throw Object.assign(new Error(streamErrorCodeMessages.AUTH_FAILED), { code: 'AUTH_FAILED', isRetryable: false });
  }

  return resolved;
}
